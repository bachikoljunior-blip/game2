/**
 * Terrain.js — the mountain, the plateau, the gorge and the water.
 *
 * The shape of this place is authored, not random. Per WORLD (src/world/Constants.js):
 * the shrine plateau is flat at y = 812 m ASL, rock ridges climb to the north-west,
 * the bamboo valley falls away to the south-east, and the approach stair climbs in
 * from +Z. A stream cuts a gorge down the east flank at WORLD.WATER_LEVEL = 782 with
 * a bridge crossing at BRIDGE_POINT.
 *
 * Two nested heightfields, because one grid cannot be both 2 km wide and fine enough
 * to walk on:
 *
 *   core   [-256, 256]    (quality.terrainSegments + 1)²   eroded, carved, collidable
 *   macro  [-2048, 2048]  257²                             silhouette + distant ground
 *
 * `heightAt()` reads the core inside its extent and the macro outside, and the two are
 * blended to agree in the core's outer band so the seam is invisible from any angle.
 *
 * Pipeline (chunked so boot never blocks more than ~12 ms):
 *   1. macro shape        ridged multifractal + fbm + a domain-warped detail octave
 *   2. authored carving   plateau flatten mask, terraced stair spline, river spline
 *   3. droplet erosion    the single biggest realism lever — it is the erosion
 *                         channels, not the noise, that make a silhouette read as rock
 *   4. derived fields     slope / curvature / flow / wetness / ao -> splat weights
 *   5. GPU upload         heightfield + data + splat as textures; the mesh is a clipmap
 *                         displaced in the vertex shader so rings slide with the camera
 *                         without a single CPU rebuild
 *
 * This file owns the heightfield and every ground query the rest of the game makes.
 * It does not own props, buildings or foliage.
 */

import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, CylinderGeometry,
  DataTexture, DoubleSide, FloatType, FrontSide, HalfFloatType, LinearFilter,
  LinearMipmapLinearFilter, Mesh, MeshDepthMaterial, MeshStandardMaterial,
  NearestFilter, NoColorSpace, Object3D, RGBADepthPacking, RGBAFormat, RedFormat,
  RepeatWrapping, ShaderMaterial, Sphere, UnsignedByteType, Vector2, Vector3, Vector4, BackSide,
} from 'three';

import { noise, clamp, lerp, smoothstep, smootherstep, makeRandom, glslNoise } from '../core/Noise.js';
import { WORLD, plateauMask, inPlayable } from './Constants.js';
// Footprints only. Level owns the geometry; Terrain only needs to know where the
// ground is swept, and a copied table here would drift the first time a hall moves.
import { LAYOUT } from './Level.js';

// ---------------------------------------------------------------- world extent
//
// WORLD.* is authoritative and is never re-declared here. These are the terrain's own
// implementation extents, exported because Foliage.js wants to know where the eroded
// detail stops.

/** Side length of the detailed (eroded, carved, collidable) heightfield, in metres. */
export const CORE_EXTENT = 512;
/** The core field spans [-CORE_HALF, +CORE_HALF] on both X and Z. */
export const CORE_HALF = CORE_EXTENT / 2;

/** Side length of the coarse macro field. Comfortably contains WORLD.EXTENT. */
export const MACRO_EXTENT = 4096;
export const MACRO_HALF = MACRO_EXTENT / 2;
/** Macro resolution: 16 m cells. Silhouette and distant ground only. */
const MACRO_N = 257;

/** Terrain stays continuous out to here; beyond it the parallax ridge band takes over. */
export const VIEW_DISTANCE = 1800;

/** Where the stone bridge crosses the gorge. Props.js/Level.js straddle this. */
export const BRIDGE_POINT = { x: 132, z: 14 };

/** Half-width of the wetted channel and of the whole gorge corridor, in metres. */
const CHANNEL_HALF = 5.0;
const GORGE_HALF = 24.0;

/** Encode range for the 8-bit height fallback. Generation is clamped into this. */
const HEIGHT_MIN = 480;
const HEIGHT_MAX = 1200;

/** Vertical bounding slack ceiling (metres) and lattice density. See `_reboundRing`. */
const RING_SLACK_MAX = 200;
const RING_BOUND_TAPS = 10;

/** Deterministic — a level that reshuffles between runs makes hand-placed geometry float. */
const TERRAIN_SEED = 0x5a4436;

// ------------------------------------------------------------- authored splines

/**
 * The stream. Control points are (x, z) only — bed elevation is derived from the macro
 * field at generation time and then forced monotonically downhill, which is the only way
 * a carved river stays believable when the noise underneath it changes.
 */
const RIVER_CTRL = [
  [104, -252], [112, -206], [120, -160], [127, -112], [131, -60],
  [132, -8], [133, 42], [138, 92], [147, 142], [162, 194], [184, 250],
];

/** The classic approach: a stair climb from +Z up onto the plateau. */
const STAIR_CTRL = [
  [11, 232], [7, 204], [3, 176], [-2, 148], [-1, 120], [0, 100], [0, 84],
];
/** Carved terraces on the approach. Props.js lays real stone treads on top. */
const STAIR_TERRACES = 14;
const STAIR_HALF = 6.5;
const STAIR_SHOULDER = 16.0;

// ------------------------------------------------------------ the swept ground
//
// Which ground is *maintained*. This used to be the plateau mask, and the plateau
// mask reaches 112 m: the classifier called a 220 m disc "gravel", Foliage refuses
// to plant on swept ground (correctly — a raked courtyard must not sprout stubble),
// and between them they deleted every blade of grass on the mountain.
//
// The ground the priests actually sweep is the forecourt, the sandō corridor and a
// working apron around each hall. Everything else on the plateau — the rim out to
// the guard rail, the gaps between the subordinate halls, the slope shoulders — is
// meadow, and that is where the grass and the visible gust front live.

/** How far swept ground reaches past a building footprint, metres. Deliberately
 *  modest: at 3.4 the aprons of the haiden and the shamusho meet and close the gap
 *  between them, and the ground between the halls has to stay meadow. */
const APRON = 2.8;
/** Width of the scuffed, noise-broken margin at the gravel/grass boundary, metres. */
const COURT_FEATHER = 4.0;
/** Half-width of the 参道 corridor, and of the flagstone run laid down its middle. */
const SANDO_HALF = 5.0;
const FLAG_HALF = 3.0;
/** The forecourt's near lip — where Level's flagstone run starts. */
const ARENA_FRONT = LAYOUT.arena.z + LAYOUT.arena.hz;

/**
 * Signed distance to an axis-aligned rectangle in XZ; negative inside. One sqrt and
 * no allocation — the derived-map bake evaluates it eight times per texel.
 */
function boxSDF(x, z, cx, cz, hx, hz) {
  const dx = Math.abs(x - cx) - hx;
  const dz = Math.abs(z - cz) - hz;
  const ox = dx > 0 ? dx : 0;
  const oz = dz > 0 ? dz : 0;
  const inner = dx > dz ? dx : dz;
  return Math.sqrt(ox * ox + oz * oz) + (inner < 0 ? inner : 0);
}

/**
 * The swept regions, flattened to `[centreX, centreZ, halfX, halfZ, apron]` so the
 * bake walks a Float32Array instead of chasing objects. Derived from LAYOUT, so
 * Terrain and Level can never disagree about where a building stands.
 */
const COURTYARD = (() => {
  const L = LAYOUT, a = L.arena, out = [];
  // 玉砂利 — the forecourt. Swept to its own edge: this is the fight floor.
  out.push(a.x, a.z, a.hx, a.hz, 1.5);
  // 参道 — the corridor from the outermost torii down to the haiden's front step.
  const zNear = L.haiden.z + L.haiden.d * 0.5;
  const zFar = L.torii[0].z + 2.0;
  out.push(0, (zNear + zFar) * 0.5, SANDO_HALF, (zFar - zNear) * 0.5, 1.8);
  // A working apron around each hall — as far as feet actually go, no further.
  for (const key of ['honden', 'haiden', 'kagura', 'shamusho']) {
    const s = L[key];
    out.push(s.x, s.z, s.w * 0.5, s.d * 0.5, APRON);
  }
  // The bell tower and the chōzuya carry no footprint in LAYOUT; both are small.
  out.push(L.bellTower.x, L.bellTower.z, 2.6, 2.6, APRON * 0.85);
  out.push(L.chozuya.x, L.chozuya.z, 2.8, 2.4, APRON * 0.85);
  return Float32Array.from(out);
})();

// --------------------------------------------------------------------- helpers

/**
 * Yield to the browser. Boot is a long synthesis job and the watchdog is real, but a
 * requestAnimationFrame yield costs a whole 16 ms frame of wall clock — doing that a
 * hundred and fifty times turns a one-second job into a five-second one. So most
 * yields are zero-delay macrotasks (setTimeout(0) is clamped, MessageChannel is not)
 * and every eighth is a real frame, which is often enough for the loading bar to paint.
 */
let _chan = null;
let _chanResolve = null;
let _yields = 0;
function nextTick() {
  _yields++;
  const hasRAF = typeof requestAnimationFrame === 'function';
  if (!hasRAF) return new Promise((r) => setTimeout(r, 0));
  if (_yields % 8 === 0) return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (typeof MessageChannel === 'function') {
    if (!_chan) {
      _chan = new MessageChannel();
      _chan.port1.onmessage = () => { const r = _chanResolve; _chanResolve = null; if (r) r(); };
    }
    // Yields are strictly sequential, so a single channel and one pending resolve is
    // all the bookkeeping this needs.
    return new Promise((r) => { _chanResolve = r; _chan.port2.postMessage(0); });
  }
  return new Promise((r) => setTimeout(r, 0));
}

const now = () =>
  (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

/** Float32 -> IEEE half, for the half-float height texture path. */
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
function toHalf(val) {
  _f32[0] = val;
  const x = _i32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) return bits | 0x7c00;
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

/**
 * Catmull-Rom resample of a 2D control polygon into an evenly spaced polyline.
 * Returns { x, z, s, n, length } with s the arc length at each node.
 */
function resampleSpline(ctrl, spacing) {
  const dense = [];
  const n = ctrl.length;
  const SUB = 24;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i];
    const p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      dense.push(x, z);
    }
  }
  dense.push(ctrl[n - 1][0], ctrl[n - 1][1]);

  const count = dense.length / 2;
  let total = 0;
  const cum = new Float64Array(count);
  for (let i = 1; i < count; i++) {
    const dx = dense[i * 2] - dense[i * 2 - 2];
    const dz = dense[i * 2 + 1] - dense[i * 2 - 1];
    total += Math.hypot(dx, dz);
    cum[i] = total;
  }
  const outN = Math.max(2, Math.ceil(total / spacing) + 1);
  const ox = new Float32Array(outN), oz = new Float32Array(outN), os = new Float32Array(outN);
  let cursor = 0;
  for (let i = 0; i < outN; i++) {
    const target = (i / (outN - 1)) * total;
    while (cursor < count - 2 && cum[cursor + 1] < target) cursor++;
    const span = Math.max(1e-6, cum[cursor + 1] - cum[cursor]);
    const f = clamp((target - cum[cursor]) / span, 0, 1);
    ox[i] = lerp(dense[cursor * 2], dense[cursor * 2 + 2], f);
    oz[i] = lerp(dense[cursor * 2 + 1], dense[cursor * 2 + 3], f);
    os[i] = target;
  }
  return { x: ox, z: oz, s: os, n: outN, length: total, y: new Float32Array(outN) };
}

/**
 * Uniform-grid index over a polyline's segments. Without it the carve is O(cells ×
 * segments) — 40 million segment tests on ULTRA — and the queries below are called
 * several times per character per frame by foot IK.
 */
function buildPolylineIndex(poly, reach) {
  const cs = 32;
  const pad = reach + cs * 1.5;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < poly.n; i++) {
    if (poly.x[i] < minX) minX = poly.x[i];
    if (poly.x[i] > maxX) maxX = poly.x[i];
    if (poly.z[i] < minZ) minZ = poly.z[i];
    if (poly.z[i] > maxZ) maxZ = poly.z[i];
  }
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cs));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cs));
  const lists = new Array(nx * nz);
  for (let s = 0; s < poly.n - 1; s++) {
    const ax = poly.x[s], az = poly.z[s], bx = poly.x[s + 1], bz = poly.z[s + 1];
    const i0 = clamp(Math.floor((Math.min(ax, bx) - pad - minX) / cs), 0, nx - 1);
    const i1 = clamp(Math.floor((Math.max(ax, bx) + pad - minX) / cs), 0, nx - 1);
    const j0 = clamp(Math.floor((Math.min(az, bz) - pad - minZ) / cs), 0, nz - 1);
    const j1 = clamp(Math.floor((Math.max(az, bz) + pad - minZ) / cs), 0, nz - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        (lists[k] || (lists[k] = [])).push(s);
      }
    }
  }
  const buckets = new Array(nx * nz);
  for (let k = 0; k < lists.length; k++) buckets[k] = lists[k] ? Int32Array.from(lists[k]) : null;
  poly.index = { minX, minZ, cs, nx, nz, buckets, reach };
  return poly;
}

/**
 * Closest point on a polyline. Allocation-free — results land in the shared scratch.
 * `station` is a continuous node index, so per-node data (bed height) can be lerped.
 * Returns d = Infinity when the point is beyond the index's reach.
 */
const _seg = { d: 0, station: 0 };
function _scanSegments(poly, px, pz, list) {
  let bestD2 = Infinity, bestT = 0, bestI = 0;
  const X = poly.x, Z = poly.z;
  const count = list ? list.length : poly.n - 1;
  for (let q = 0; q < count; q++) {
    const i = list ? list[q] : q;
    const ax = X[i], az = Z[i];
    const ex = X[i + 1] - ax, ez = Z[i + 1] - az;
    const len2 = ex * ex + ez * ez;
    let t = len2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + ex * t - px, cz = az + ez * t - pz;
    const d2 = cx * cx + cz * cz;
    if (d2 < bestD2) { bestD2 = d2; bestT = t; bestI = i; }
  }
  _seg.d = bestD2 === Infinity ? Infinity : Math.sqrt(bestD2);
  _seg.station = bestI + bestT;
  return _seg;
}
function closestOnPolyline(poly, px, pz) {
  const idx = poly.index;
  if (!idx) return _scanSegments(poly, px, pz, null);
  const i = Math.floor((px - idx.minX) / idx.cs);
  const j = Math.floor((pz - idx.minZ) / idx.cs);
  if (i < 0 || j < 0 || i >= idx.nx || j >= idx.nz) { _seg.d = Infinity; _seg.station = 0; return _seg; }
  const list = idx.buckets[j * idx.nx + i];
  if (!list) { _seg.d = Infinity; _seg.station = 0; return _seg; }
  return _scanSegments(poly, px, pz, list);
}

/** Sample a per-node float array at a continuous station. */
function sampleStation(arr, station, n) {
  const i = clamp(Math.floor(station), 0, n - 1);
  const j = Math.min(i + 1, n - 1);
  return lerp(arr[i], arr[j], clamp(station - i, 0, 1));
}

/** Chain onBeforeCompile so we compose with whatever Sky.js already patched in. */
function chainOnBeforeCompile(material, fn) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    fn.call(this, shader, renderer);
  };
  material.customProgramCacheKey = () => 'kagerou-terrain';
}

/**
 * Resolve a material-library entry into { map, normalMap, roughnessMap }.
 * MaterialLibrary may hand back a Material, a plain texture-set object, or a bare
 * Texture — and it may not have booted at all. Every path has to be survivable.
 */
function resolveTextures(lib, key) {
  const out = { map: null, normalMap: null, roughnessMap: null };
  let e = null;
  try { e = lib?.get?.(key) ?? null; } catch { e = null; }
  if (!e) return out;
  if (e.isTexture) { out.map = e; return out; }
  const pick = (...names) => {
    for (const n of names) { const v = e[n]; if (v && v.isTexture) return v; }
    return null;
  };
  out.map = pick('map', 'albedo', 'diffuse', 'colorMap', 'baseColorMap');
  out.normalMap = pick('normalMap', 'normal', 'normalTex');
  out.roughnessMap = pick('roughnessMap', 'roughness', 'ormMap', 'arm');
  return out;
}

/** Make a texture safe to tile across the terrain regardless of how it was authored. */
function prepTiling(tex, aniso) {
  if (!tex) return null;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  if (aniso && tex.anisotropy !== aniso) { tex.anisotropy = aniso; tex.needsUpdate = true; }
  return tex;
}

// ============================================================================
//  Terrain
// ============================================================================

// ------------------------------------------------------------- distant ridges
//
// The far horizon is a *baked ridgeline*, not a scatter of noise cones. One
// continuous polyline per depth rank is authored on the CPU into a texture the
// band shader reads, because everything that makes a real range read as a range
// — clustered peaks, asymmetric flanks, saddles at varying heights, apex angles
// that differ from peak to peak — is trivial to author in a loop and impossible
// to get out of `1 - abs(fbm)`.

/** Angular resolution of the baked ridgeline. 2048 texels ≈ 0.18° each. */
const RIDGE_W = 2048;
/** Texture rows: one per depth rank, plus a padding row. */
const RIDGE_ROWS = 4;
/** The baked profile encodes metres relative to the band's base plane. */
const RIDGE_LOW = -300;
const RIDGE_SPAN = 1600;

/**
 * One entry per depth rank, far to near. `massifs` clusters of two to five peaks
 * with long empty cols between them — real ranges cluster, and the eye reads the
 * gaps as much as the peaks.
 */
const RIDGE_LAYERS = [
  {
    seed: 0x2f1103, lift: 115, amp: 620, massifs: 4, groupLo: 0.46, groupHi: 1.00,
    baseR: 1.55, baseAmp: 0.30, detR: 8.5, detAmp: 0.060, gulR: 23.0, notch: 0.075,
    presR: 0.75, presOff: 3.1, dirLo: 0.30, par: 0.000024, soft: 12.0, haze: 0.74,
  },
  {
    seed: 0x7a3d19, lift: 66, amp: 450, massifs: 5, groupLo: 0.40, groupHi: 0.98,
    baseR: 2.30, baseAmp: 0.24, detR: 12.5, detAmp: 0.068, gulR: 34.0, notch: 0.095,
    presR: 0.95, presOff: 27.7, dirLo: 0.14, par: 0.000053, soft: 8.0, haze: 0.51,
  },
  {
    seed: 0x11c7e5, lift: 24, amp: 320, massifs: 6, groupLo: 0.34, groupHi: 0.94,
    baseR: 3.10, baseAmp: 0.20, detR: 17.0, detAmp: 0.076, gulR: 44.0, notch: 0.110,
    presR: 1.30, presOff: 61.3, dirLo: 0.06, par: 0.000094, soft: 5.0, haze: 0.30,
  },
];

/** Smooth max — a hard max() between two peak flanks cuts a V; ranges have saddles. */
function smax(a, b, r) {
  const h = clamp(0.5 + (0.5 * (a - b)) / r, 0, 1);
  return lerp(b, a, h) + r * h * (1 - h);
}

/** Wrap an angular difference into (-π, π]. */
function wrapPi(d) {
  const TAU = Math.PI * 2;
  let v = d % TAU;
  if (v > Math.PI) v -= TAU;
  else if (v <= -Math.PI) v += TAU;
  return v;
}

/** Droplet budget per tier. The single biggest realism lever we have. */
const EROSION_DROPLETS = [2000, 6000, 14000, 20000];
/** Clipmap levels per tier (level 0 is the solid centre block, the rest are rings). */
const CLIPMAP_LEVELS = [6, 6, 6, 6];
/** Ring resolution (quads per side) per tier. */
const CLIPMAP_RES = [48, 64, 80, 96];

export class Terrain {
  constructor(ctx) {
    this.ctx = ctx;
    this.quality = ctx.quality;
    /** Boot progress hook: (done, total, label). main.js may or may not attach one. */
    this.onProgress = null;

    // --- contractual constants, mirrored onto the instance for convenience -----
    this.waterLevel = WORLD.WATER_LEVEL;
    this.coreExtent = CORE_EXTENT;
    this.coreHalf = CORE_HALF;
    this.macroExtent = MACRO_EXTENT;
    this.macroHalf = MACRO_HALF;
    this.viewDistance = VIEW_DISTANCE;
    this.bridgePoint = BRIDGE_POINT;

    // --- heightfields ---------------------------------------------------------
    this.gridN = 0;
    this.cell = 1;
    this.height = null;        // Float32Array(gridN²), absolute metres ASL
    this.flow = null;          // Float32Array(gridN²), droplet throughput 0..1
    this.macroN = MACRO_N;
    this.macroCell = MACRO_EXTENT / (MACRO_N - 1);
    this.macroHeight = null;   // Float32Array(macroN²)

    // --- scene graph ----------------------------------------------------------
    this.group = new Object3D();
    this.group.name = 'terrain';
    this.group.matrixAutoUpdate = false;
    this.rings = [];
    this.material = null;
    this.depthMaterial = null;
    this.water = null;
    this.waterMaterial = null;
    this.band = null;
    this.bandMaterial = null;

    this.heightTex = null;
    this.macroTex = null;
    this.ridgeTex = null;
    this.ridgeMaxTop = 900;
    this.dataTex = null;
    this.splatTex = null;
    this.waterNormalTex = null;
    this.detailNormalTex = null;
    /** True when the height textures are 8-bit encoded and need a manual bilinear. */
    this.encodedHeight = false;

    // --- authored features ----------------------------------------------------
    this.river = null;         // resampled polyline + per-node bed/surface elevation
    this.stair = null;
    this.riverBridgeStation = 0;

    // --- preallocated scratch (update() and the queries must never allocate) ---
    this._v1 = new Vector3();
    this._v2 = new Vector3();
    this._v3 = new Vector3();
    this._sunDir = new Vector3();
    this._camXZ = new Vector2();
    this._fogColor = new Color(0x8a9bb0);
    this._hit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
    this._region = { height: 0, slope: 0, minHeight: 0, maxHeight: 0, water: 0 };
    this._rnd = makeRandom(TERRAIN_SEED);

    // Magic hour, low over the valley. Overwritten each frame if Lighting/Sky expose a sun.
    const az = (WORLD.SUN_AZIMUTH_DEFAULT * Math.PI) / 180;
    this._sunDir.set(Math.sin(az) * 0.985, 0.17, -Math.cos(az) * 0.985).normalize();

    this._elapsed = 0;
    this._disposed = false;
  }

  _progress(done, total, label) {
    if (this.onProgress) { try { this.onProgress(done, total, label); } catch { /* never fatal */ } }
  }

  /**
   * Run `step(i)` for i in [0, n), yielding to the browser whenever we have held the
   * main thread for more than ~10 ms. Boot on a phone is several seconds of synthesis
   * and the watchdog does not care how pretty the result is.
   */
  async _forRange(n, label, step, base = 0, total = 1) {
    let t0 = now();
    for (let i = 0; i < n; i++) {
      step(i);
      // Checked every iteration, not every Nth: one row of the ULTRA core field is
      // already ~3 ms, so a coarser check overshoots the 12 ms budget on its own.
      if (now() - t0 > 6) {
        this._progress(base + (i / n), total, label);
        await nextTick();
        if (this._disposed) return;
        t0 = now();
      }
    }
    // Always hand the frame back at a phase boundary, so two phases can never
    // concatenate into one long block.
    this._progress(base + 1, total, label);
    await nextTick();
  }

  // ==========================================================================
  //  boot
  // ==========================================================================

  async init() {
    const q = this.quality;
    this.gridN = Math.max(33, (q.terrainSegments | 0) + 1);
    this.cell = CORE_EXTENT / (this.gridN - 1);
    const n2 = this.gridN * this.gridN;
    this.height = new Float32Array(n2);
    this.flow = new Float32Array(n2);
    this.macroHeight = new Float32Array(this.macroN * this.macroN);

    // Terrain reaches 1800 m; the default 900 m far plane would clip the ridges away.
    const cam = this.ctx.camera;
    if (cam && cam.isPerspectiveCamera && cam.far < 6200) {
      cam.far = 6200;
      cam.updateProjectionMatrix();
    }

    const TOTAL = 9;
    let s = 0;

    await this._buildMacroField(s++, TOTAL);
    await this._buildCoreField(s++, TOTAL);
    await this._buildSplines();
    await this._carveFeatures(s++, TOTAL);
    await this._erode(s++, TOTAL);
    await this._finishCarve(s++, TOTAL);
    await this._blendEdges(s++, TOTAL);
    await this._buildDerivedMaps(s++, TOTAL);
    await this._buildTextures();
    await this._buildMaterial();
    await nextTick();
    await this._buildClipGeometries(CLIPMAP_RES[clamp(q.tier | 0, 0, 3)]);
    this._buildClipmap();
    this._progress(s++, TOTAL, 'raising the far ridges');
    await nextTick();
    this._buildWater();
    await nextTick();
    await this._buildRidgeProfiles();
    this._buildDistantBand();
    this._progress(s++, TOTAL, 'flooding the stream');

    this.ctx.scene.add(this.group);
    this._registerPhysics();
    this._snapRings(true);
    return this;
  }

  // ==========================================================================
  //  1 — macro shape
  // ==========================================================================

  /**
   * The authored landform, evaluated analytically anywhere in the world. Both
   * heightfields are seeded from this, which is what keeps the core/macro seam free.
   *
   *   +ax  ->  north-west, the rock ridges       (WORLD.RIDGE_AZIMUTH 315)
   *   -ax  ->  south-east, the bamboo valley     (WORLD.VALLEY_AZIMUTH 135)
   */
  _macro(x, z) {
    const ax = (-x - z) * 0.70710678;
    const dx = x - WORLD.PLATEAU_CENTER[0];
    const dz = z - WORLD.PLATEAU_CENTER[1];
    const r = Math.sqrt(dx * dx + dz * dz);

    let h = WORLD.PLATEAU_HEIGHT;

    // The saddle. The shoulder releases downhill in every direction, but hardest
    // toward the valley — that asymmetry is what makes it read as a saddle and not
    // as a hill with a flat top.
    const shoulder = smootherstep(300, 96, r);
    const valleyBias = smootherstep(120, -260, ax);
    h -= 40 * (0.55 + 0.45 * valleyBias) * (1 - shoulder);

    // South-east: the misted bamboo valley.
    const seT = smootherstep(80, 620, -ax);
    h -= 175 * Math.pow(seT, 1.15);
    h -= 90 * smootherstep(500, 1600, -ax);

    // North-west: rock ridges, then distant peaks behind them.
    const nwT = smootherstep(40, 460, ax);
    h += 120 * nwT;
    h += noise.ridged2(x * 0.0016, z * 0.0016, 5) * 210 * Math.pow(nwT, 1.1);
    h += smootherstep(400, 1500, ax) *
      noise.ridged2(x * 0.00055 + 31.7, z * 0.00055 - 12.3, 4) * 320;

    // Mid-scale relief, then a domain-warped detail octave. The warp is what stops
    // the whole field reading as one noise function stretched over a hill.
    h += noise.fbm2(x * 0.0055 + 4.1, z * 0.0055 - 7.9, 4) * 14;
    h += noise.warp2(x * 0.017, z * 0.017, 0.8, 3) * 3.2;

    return h;
  }

  /**
   * Fill a square field from `_macro`. Iterated in small cell blocks rather than whole
   * rows: the very first block runs before the JIT has seen the noise functions, and a
   * full 300-cell row in the interpreter tier is a 25 ms stall on its own.
   */
  async _fillField(H, N, cellM, half, label, base, total) {
    const cells = N * N;
    const BLOCK = 192;
    await this._forRange(Math.ceil(cells / BLOCK), label, (b) => {
      const s = b * BLOCK;
      const e = Math.min(cells, s + BLOCK);
      for (let k = s; k < e; k++) {
        const j = (k / N) | 0;
        const i = k - j * N;
        H[k] = this._macro(-half + i * cellM, -half + j * cellM);
      }
    }, base, total);
  }

  async _buildMacroField(base, total) {
    await this._fillField(this.macroHeight, this.macroN, this.macroCell, MACRO_HALF,
      'raising the ridges', base, total);
  }

  async _buildCoreField(base, total) {
    await this._fillField(this.height, this.gridN, this.cell, CORE_HALF,
      'carving the mountain', base, total);
  }

  // ==========================================================================
  //  2 — authored carving
  // ==========================================================================

  async _buildSplines() {
    // Node spacing is deliberately finer than the coarsest grid cell so the carve
    // never staircases along the spline on LOW.
    this.stair = buildPolylineIndex(resampleSpline(STAIR_CTRL, 3), STAIR_SHOULDER + 4);
    const river = buildPolylineIndex(resampleSpline(RIVER_CTRL, 4), GORGE_HALF * 2.2);
    river.bed = new Float32Array(river.n);
    river.surface = new Float32Array(river.n);
    river.width = new Float32Array(river.n);
    this.river = river;

    // Pre-carve ground along the stream, straight from the analytic macro so the
    // profile does not depend on which tier we happen to be generating at.
    const ground = new Float32Array(river.n);
    for (let i = 0; i < river.n; i++) ground[i] = this._macro(river.x[i], river.z[i]);

    // A bed that only ever descends. Water does not flow uphill, and the plateau
    // shoulder the stream skirts is a local high — without this the "river" would
    // climb 20 m past the bridge.
    const CHANNEL_DEPTH = 3.0;
    const MIN_GRADE = 0.02;
    river.bed[0] = ground[0] - CHANNEL_DEPTH;
    for (let i = 1; i < river.n; i++) {
      const ds = river.s[i] - river.s[i - 1];
      river.bed[i] = Math.min(ground[i] - CHANNEL_DEPTH, river.bed[i - 1] - MIN_GRADE * ds);
    }
    // Three box passes: the min-scan leaves hard kinks where the constraint switches.
    const tmp = new Float32Array(river.n);
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < river.n; i++) {
        const a = river.bed[Math.max(0, i - 1)];
        const b = river.bed[i];
        const c = river.bed[Math.min(river.n - 1, i + 1)];
        tmp[i] = (a + 2 * b + c) * 0.25;
      }
      river.bed.set(tmp);
    }

    // Pin the surface to WORLD.WATER_LEVEL at the bridge by shifting the whole
    // profile. A uniform shift is the only edit that cannot break monotonicity.
    const seg = closestOnPolyline(river, BRIDGE_POINT.x, BRIDGE_POINT.z);
    this.riverBridgeStation = seg.station;
    const bedAtBridge = sampleStation(river.bed, seg.station, river.n);
    const delta = (WORLD.WATER_LEVEL - 0.9) - bedAtBridge;
    for (let i = 0; i < river.n; i++) {
      river.bed[i] += delta;
      river.surface[i] = river.bed[i] + 0.9;
      // Widen downstream, the way a stream does as its catchment grows.
      river.width[i] = lerp(0.62, 1.35, i / (river.n - 1));
    }
    // Exactly WORLD.WATER_LEVEL by construction — Level.js sets the bridge deck
    // against this constant and must not have to cope with float drift.
    this.waterLevel = WORLD.WATER_LEVEL;

    // The ribbon stops where the gorge opens out and the stream falls away into the
    // mist — past that point a flat-ish water strip would float over the valley.
    let last = river.n - 1;
    for (let i = 1; i < river.n; i++) {
      const g = this._macro(river.x[i], river.z[i]);
      if (g < river.surface[i] - 26) { last = i; break; }
    }
    river.tail = Math.max(8, last);

    // Stair profile: a constant-rise climb, quantised into terraces.
    const stair = this.stair;
    stair.bottom = this._macro(stair.x[0], stair.z[0]);
    stair.top = WORLD.PLATEAU_HEIGHT;
  }

  /** Height of the carved stair surface at a station fraction t (0 = bottom). */
  _stairHeight(t) {
    const s = this.stair;
    const q = clamp(t, 0, 1) * STAIR_TERRACES;
    const step = Math.floor(q);
    const frac = q - step;
    // Flat tread, then a short sharp riser. Props.js lays real stone on this.
    const riser = smoothstep(0.74, 0.98, frac);
    const tt = Math.min(1, (step + riser) / STAIR_TERRACES);
    return lerp(s.bottom, s.top, tt);
  }

  /**
   * Apply the plateau flatten, the terraced approach and the river gorge to the core
   * field. `strength` lets the post-erosion pass re-assert the authored features
   * without completely erasing the erosion detail on the softer ones.
   */
  _applyCarve(i, j, strength) {
    const H = this.height, N = this.gridN;
    const x = -CORE_HALF + i * this.cell;
    const z = -CORE_HALF + j * this.cell;
    const idx = j * N + i;
    let h = H[idx];

    // --- plateau: the buildings must sit dead level -------------------------
    const pm = plateauMask(x, z);
    if (pm > 0) h = lerp(h, WORLD.PLATEAU_HEIGHT, pm * strength);

    // --- terraced approach from +Z ------------------------------------------
    const st = closestOnPolyline(this.stair, x, z);
    if (st.d < STAIR_SHOULDER) {
      const t = st.station / (this.stair.n - 1);   // node 0 is the bottom of the climb
      const target = this._stairHeight(t);
      const w = smootherstep(STAIR_SHOULDER, STAIR_HALF, st.d) * strength * 0.92;
      h = lerp(h, target, w);
    }

    // --- river gorge: smooth U-profile with banks ----------------------------
    const rv = closestOnPolyline(this.river, x, z);
    const halfW = CHANNEL_HALF * sampleStation(this.river.width, rv.station, this.river.n);
    const rim = GORGE_HALF * 1.8;
    if (rv.d < rim) {
      const bed = sampleStation(this.river.bed, rv.station, this.river.n);
      const inner = clamp(rv.d / halfW, 0, 1);
      const outer = clamp((rv.d - halfW) / (GORGE_HALF - halfW), 0, 1);
      const target = bed + inner * inner * 1.1 + Math.pow(outer, 1.5) * 26;
      const w = smootherstep(rim, halfW, rv.d) * strength;
      h = lerp(h, target, w);
    }

    H[idx] = h;
  }

  async _carveFeatures(base, total) {
    const N = this.gridN;
    await this._forRange(N, 'cutting the approach', (j) => {
      for (let i = 0; i < N; i++) this._applyCarve(i, j, 1);
    }, base, total);
  }

  // ==========================================================================
  //  3 — droplet erosion
  // ==========================================================================

  /**
   * Hydraulic erosion, droplet model. Every droplet picks up sediment on steep ground
   * and drops it where the slope eases, which is what cuts the branching channels and
   * builds the alluvial fans that make a heightfield stop looking like noise.
   *
   * Heights are metres and the grid spacing is `cell` metres, so gradients are divided
   * through by the cell size to stay dimensionless. Per-step erosion and deposition are
   * hard-clamped: an unstable droplet on a 300 m ridge would otherwise punch a well.
   */
  async _erode(base, total) {
    const N = this.gridN, H = this.height, FLOW = this.flow;
    const cellM = this.cell;
    const tier = clamp(this.quality.tier | 0, 0, 3);
    const dropletCount = EROSION_DROPLETS[tier];

    // Erosion/deposition brush — spreading the edit over a disc is what makes the
    // channels smooth instead of a field of single-texel spikes.
    const R = N > 200 ? 3 : 2;
    const offX = [], offY = [], offW = [];
    let wsum = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        const w = 1 - d / R;
        offX.push(dx); offY.push(dy); offW.push(w);
        wsum += w;
      }
    }
    for (let k = 0; k < offW.length; k++) offW[k] /= wsum;
    const brushN = offW.length;

    const rnd = makeRandom(TERRAIN_SEED ^ 0x9e3779b9);
    const INERTIA = 0.055;
    const CAPACITY = 3.4;
    const MIN_CAPACITY = 0.006;
    const ERODE = 0.34;
    const DEPOSIT = 0.30;
    const EVAPORATE = 0.016;
    const GRAVITY = 5.0;
    const MAX_LIFE = 34;
    const MAX_EDIT = 0.42;
    const invCell = 1 / cellM;

    const BATCH = 64;
    const batches = Math.ceil(dropletCount / BATCH);

    await this._forRange(batches, 'water finds its way', () => {
      for (let d = 0; d < BATCH; d++) {
        let px = rnd() * (N - 3) + 1;
        let py = rnd() * (N - 3) + 1;
        let dirX = 0, dirY = 0, speed = 1, water = 1, sediment = 0;

        for (let life = 0; life < MAX_LIFE; life++) {
          const nx = px | 0, ny = py | 0;
          if (nx < 1 || ny < 1 || nx >= N - 2 || ny >= N - 2) break;
          const fx = px - nx, fy = py - ny;
          const i00 = ny * N + nx;
          const h00 = H[i00], h10 = H[i00 + 1], h01 = H[i00 + N], h11 = H[i00 + N + 1];

          // Bilinear height and its analytic gradient, in metres per metre.
          const height =
            h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) +
            h01 * (1 - fx) * fy + h11 * fx * fy;
          const gx = ((h10 - h00) * (1 - fy) + (h11 - h01) * fy) * invCell;
          const gy = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) * invCell;

          dirX = dirX * INERTIA - gx * (1 - INERTIA);
          dirY = dirY * INERTIA - gy * (1 - INERTIA);
          const dlen = Math.hypot(dirX, dirY);
          if (dlen < 1e-6) break;
          dirX /= dlen; dirY /= dlen;

          px += dirX; py += dirY;
          if (px < 1 || py < 1 || px >= N - 2 || py >= N - 2) break;

          const mx = px | 0, my = py | 0;
          const mfx = px - mx, mfy = py - my;
          const j00 = my * N + mx;
          const newHeight =
            H[j00] * (1 - mfx) * (1 - mfy) + H[j00 + 1] * mfx * (1 - mfy) +
            H[j00 + N] * (1 - mfx) * mfy + H[j00 + N + 1] * mfx * mfy;
          const dh = newHeight - height;

          FLOW[i00] += 1;

          const capacity = Math.max(-dh * speed * water * CAPACITY, MIN_CAPACITY);
          if (sediment > capacity || dh > 0) {
            // Uphill: drop enough to fill the pit we just walked into, never more.
            const amount = dh > 0
              ? Math.min(dh, sediment)
              : (sediment - capacity) * DEPOSIT;
            const dep = clamp(amount, 0, MAX_EDIT);
            sediment -= dep;
            H[i00] += dep * (1 - fx) * (1 - fy);
            H[i00 + 1] += dep * fx * (1 - fy);
            H[i00 + N] += dep * (1 - fx) * fy;
            H[i00 + N + 1] += dep * fx * fy;
          } else {
            const amount = clamp(Math.min((capacity - sediment) * ERODE, -dh), 0, MAX_EDIT);
            for (let k = 0; k < brushN; k++) {
              const bx = nx + offX[k], by = ny + offY[k];
              if (bx < 0 || by < 0 || bx >= N || by >= N) continue;
              H[by * N + bx] -= amount * offW[k];
            }
            sediment += amount;
          }

          speed = Math.sqrt(Math.max(0, speed * speed + -dh * GRAVITY));
          water *= 1 - EVAPORATE;
          if (water < 0.02) break;
        }
      }
    }, base, total);

    // Normalise the flow accumulation for use as a splat/wetness signal.
    let maxFlow = 1;
    for (let k = 0; k < FLOW.length; k++) if (FLOW[k] > maxFlow) maxFlow = FLOW[k];
    const inv = 1 / Math.log(1 + maxFlow);
    const CH = 4096;
    await this._forRange(Math.ceil(FLOW.length / CH), 'reading the channels', (b) => {
      const s0 = b * CH, e0 = Math.min(FLOW.length, s0 + CH);
      for (let k = s0; k < e0; k++) FLOW[k] = Math.log(1 + FLOW[k]) * inv;
    }, base, total);
  }

  /**
   * Erosion is allowed to chew on the wild terrain, but not on the ground the game is
   * played on: the plateau has to stay dead level for Level.js, the stair has to stay
   * walkable, and the channel bed has to stay under the water surface or `isWater()`
   * starts lying. Re-assert the authored features, then relax the field once.
   */
  async _finishCarve(base, total) {
    const N = this.gridN;
    await this._forRange(N, 'levelling the shrine', (j) => {
      for (let i = 0; i < N; i++) this._applyCarve(i, j, 0.94);
    }, base, total);

    // One light Laplacian pass kills the last of the droplet speckle without
    // rounding off the erosion channels.
    const H = this.height;
    const src = Float32Array.from(H);
    await this._forRange(N - 2, 'settling the slopes', (jj) => {
      const j = jj + 1;
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        const avg = (src[k - 1] + src[k + 1] + src[k - N] + src[k + N]) * 0.25;
        H[k] = lerp(src[k], avg, 0.22);
      }
    }, base, total);
  }

  /**
   * Fade the outermost band of the core field back to the analytic macro shape so the
   * clipmap's core/macro crossfade is invisible from every angle.
   */
  async _blendEdges(base, total) {
    const N = this.gridN, H = this.height, cellM = this.cell;
    const bandStart = CORE_HALF - 46;
    await this._forRange(N, 'stitching the horizon', (j) => {
      const z = -CORE_HALF + j * cellM;
      for (let i = 0; i < N; i++) {
        const x = -CORE_HALF + i * cellM;
        const e = Math.max(Math.abs(x), Math.abs(z));
        if (e < bandStart) continue;
        const w = smootherstep(bandStart, CORE_HALF - 2, e);
        const k = j * N + i;
        H[k] = lerp(H[k], this._macro(x, z), w);
      }
    }, base, total);

    // Clamp into the encodable range. Nothing should be near these, but a runaway
    // droplet must not silently wrap the 8-bit fallback.
    for (let k = 0; k < H.length; k++) H[k] = clamp(H[k], HEIGHT_MIN + 1, HEIGHT_MAX - 1);
  }

  // ==========================================================================
  //  4 — derived fields and splat weights
  // ==========================================================================

  /**
   * Everything the shader needs that is cheaper to solve on the CPU once than per
   * pixel forever: slope, curvature, a concavity AO term, wetness, and the five
   * surface weights. Blend rules are driven by slope, altitude, curvature, the
   * erosion flow map and a noise break-up — never by altitude alone, which is what
   * makes procedural terrain read as contour lines.
   */
  async _buildDerivedMaps(base, total) {
    const N = this.gridN, H = this.height, FLOW = this.flow, cellM = this.cell;
    const data = new Uint8Array(N * N * 4);
    const splat = new Uint8Array(N * N * 4);
    this.dataBytes = data;
    this.splatBytes = splat;
    const river = this.river;
    const inv2c = 1 / (2 * cellM);

    await this._forRange(N, 'dressing the ground', (j) => {
      const z = -CORE_HALF + j * cellM;
      for (let i = 0; i < N; i++) {
        const x = -CORE_HALF + i * cellM;
        const k = j * N + i;
        const h = H[k];

        const il = k - (i > 0 ? 1 : 0);
        const ir = k + (i < N - 1 ? 1 : 0);
        const jd = k - (j > 0 ? N : 0);
        const ju = k + (j < N - 1 ? N : 0);
        const dhdx = (H[ir] - H[il]) * inv2c;
        const dhdz = (H[ju] - H[jd]) * inv2c;
        const gl = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
        const slope = Math.atan(gl);
        const nlen = Math.sqrt(gl * gl + 1);
        const northness = clamp(dhdz / nlen, 0, 1);   // -Z is north; north faces stay damp

        // Positive laplacian = a collector (gully, hollow); negative = a ridge.
        const lap = (H[il] + H[ir] + H[jd] + H[ju] - 4 * h) / (cellM * cellM);
        const concave = clamp(lap * 55, -1, 1);

        // Cheap sky occlusion: how much higher the neighbourhood stands.
        let ring = 0;
        const R = 4;
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          const si = clamp(i + Math.round(Math.cos(a) * R), 0, N - 1);
          const sj = clamp(j + Math.round(Math.sin(a) * R), 0, N - 1);
          ring += H[sj * N + si];
        }
        ring *= 0.125;
        const ao = clamp(1 - (ring - h) * 0.055, 0.25, 1);

        const flow = FLOW[k];
        const pm = plateauMask(x, z);

        // --- wetness -----------------------------------------------------
        let wet = 0;
        const rv = closestOnPolyline(river, x, z);
        if (rv.d < GORGE_HALF * 1.5) {
          const surf = sampleStation(river.surface, rv.station, river.n);
          wet = smoothstep(3.4, -1.2, h - surf);
        }
        wet = Math.max(wet, smoothstep(0.42, 0.88, flow) * 0.6);
        wet = clamp(wet * (1 - pm * 0.9), 0, 1);

        // --- surface weights ---------------------------------------------
        const nb = noise.fbm2(x * 0.045 + 3.3, z * 0.045 - 8.1, 3);
        const nb2 = noise.fbm2(x * 0.0115 - 21.4, z * 0.0115 + 6.7, 3);

        let rock = smoothstep(0.60, 1.00, slope);
        rock = Math.max(rock, smoothstep(915, 995, h) * 0.92);
        rock = clamp(rock + nb * 0.17 - concave * 0.12, 0, 1);

        // Scree and washed gravel: only where water really concentrates, and in the
        // collectors it drains into. Erosion flow is a wide signal — threshold it hard
        // or the whole mountain turns into one continuous scree field.
        let gravel = clamp(smoothstep(0.52, 0.90, flow) * 0.9 + Math.max(0, concave) * 0.22, 0, 1);
        gravel *= 1 - rock * 0.5;
        gravel = clamp(gravel + nb * 0.07, 0, 1);

        let grass = smoothstep(0.74, 0.20, slope) * smoothstep(1000, 880, h);
        grass *= 0.78 + 0.5 * nb2;
        grass *= (1 - gravel * 0.6) * (1 - rock) * (1 - wet * 0.35);
        grass = clamp(grass, 0, 1);

        // Mossy stone: north faces stay damp all day at magic hour, and so do the
        // hollows and everything within reach of the stream's spray.
        const stoneBase = Math.max(rock, gravel * 0.45);
        let moss = stoneBase * clamp(wet * 0.95 + northness * 0.95 + Math.max(0, concave) * 0.35, 0, 1);
        moss *= clamp(0.45 + nb2 * 1.1, 0, 1);
        moss = clamp(moss, 0, 1);

        // --- the swept ground ---------------------------------------------
        // Raked gravel over the forecourt, the sandō and the aprons; meadow over the
        // rest of the plateau. The boundary is jittered rather than cut: `scuff` is
        // added to the *distance*, not to the weights, so the two surfaces interlock
        // along one ragged line — tufts surviving at the margin of the gravel, bare
        // scuffs pushing out into the grass — instead of cross-fading into mush. A
        // hard classification edge would give Foliage a hard grass edge, and swept
        // ground would read as masked rather than maintained.
        let dCourt = Infinity;
        for (let c = 0; c < COURTYARD.length; c += 5) {
          const d = boxSDF(x, z, COURTYARD[c], COURTYARD[c + 1],
            COURTYARD[c + 2], COURTYARD[c + 3]) - COURTYARD[c + 4];
          if (d < dCourt) dCourt = d;
        }
        // Two scales: the broad term decides which side of the shrine the sweeping
        // has been winning this season, `nb` scallops the individual tufts.
        const scuff = noise.fbm2(x * 0.028 + 61.3, z * 0.028 - 44.9, 2) * 2.9 + nb * 1.7;
        const court = smootherstep(COURT_FEATHER, 0, dCourt + scuff);
        if (court > 0.002) {
          grass = lerp(grass, grass * 0.05, court);
          gravel = lerp(gravel, 0.60 + nb * 0.16, court);
          rock = lerp(rock, rock * 0.10, court);
          moss = lerp(moss, moss * 0.08, court);
        }

        // Made ground. The plateau was levelled by hand, so even the unswept parts
        // carry packed earth and turf rather than the mountain's scree — and the
        // erosion flow map, which has no idea the basin is artificial, pools right
        // across it and would otherwise paint the whole rim as washed gravel.
        if (pm > 0) {
          rock *= 1 - pm * 0.80;
          moss *= 1 - pm * 0.55;
          gravel *= 1 - pm * 0.72 * (1 - court);
        }

        // --- the approach and the paving ----------------------------------
        // `paving` is stone underfoot: the treads Props lays on the carved terraces
        // and the flagstone run Level lays from the stair head to the forecourt lip.
        // It is *applied* below the wear solve, because wear keys off bare rock and
        // wear is what dresses and polishes this band in the shader.
        let paving = 0;
        const st = closestOnPolyline(this.stair, x, z);
        if (st.d < STAIR_SHOULDER) {
          const verge = smootherstep(STAIR_SHOULDER, STAIR_HALF, st.d + scuff * 0.6);
          grass = lerp(grass, grass * 0.30, verge);
          gravel = lerp(gravel, 0.58, verge * 0.75);
          rock = lerp(rock, rock * 0.4, verge);
          paving = smootherstep(STAIR_HALF * 1.15, STAIR_HALF * 0.55, st.d + scuff * 0.3);
        }
        const zRun = smootherstep(ARENA_FRONT - 3.0, ARENA_FRONT + 1.0, z) *
                     smootherstep(LAYOUT.stairTop + 3.0, LAYOUT.stairTop - 1.0, z);
        if (zRun > 0.002) {
          paving = Math.max(paving, zRun *
            smootherstep(FLAG_HALF + 1.4, FLAG_HALF * 0.6, Math.abs(x) + scuff * 0.3));
        }

        // --- traffic wear -------------------------------------------------
        // Where feet actually go: up the stair spline, then straight along the
        // 参道 axis to the honden, widening into an apron in front of the halls.
        // The shader dresses this band in different stone and polishes it, which
        // is also the cheapest thing there is that breaks a tiling period along
        // the one axis the eye walks down.
        let wear = st.d < STAIR_SHOULDER
          ? smootherstep(STAIR_HALF * 1.5, STAIR_HALF * 0.45, st.d) : 0;
        if (z > -16 && z < 104) {
          const wob = noise.fbm2(x * 0.055 + 2.7, z * 0.055 - 9.4, 2) * 2.6;
          const halfW = 3.1 + 3.3 * smoothstep(40, 6, z);
          const band = smootherstep(halfW + 2.6, halfW * 0.45, Math.abs(x + wob));
          const run = smoothstep(-14, 2, z) * smootherstep(104, 84, z);
          wear = Math.max(wear, band * run);
        }
        wear = clamp(wear * (1 - rock * 0.7), 0, 1);
        grass *= 1 - wear * 0.88;
        moss *= 1 - wear * 0.85;
        gravel = lerp(gravel, Math.max(gravel, 0.76), wear * 0.65);

        // Laid stone last, so the traffic band it lives in cannot bury it in gravel.
        if (paving > 0.002) {
          rock = lerp(rock, 0.86, paving);
          gravel *= 1 - paving * 0.75;
          grass *= 1 - paving * 0.95;
          moss = lerp(moss, moss * 0.5 + 0.07, paving);
        }

        // Keep dirt as the remainder so there is always a base layer under the blend.
        const sum = grass + rock + gravel + moss;
        if (sum > 1) { const s = 1 / sum; grass *= s; rock *= s; gravel *= s; moss *= s; }

        const o = k * 4;
        data[o] = (wet * 255) | 0;
        data[o + 1] = (ao * 255) | 0;
        data[o + 2] = (flow * 255) | 0;
        // Curvature used to live here and nothing ever read it; the shader now
        // derives its own from the same height taps it needs for the normal, so
        // the channel carries the traffic wear instead.
        data[o + 3] = (wear * 255) | 0;

        splat[o] = (grass * 255) | 0;
        splat[o + 1] = (rock * 255) | 0;
        splat[o + 2] = (gravel * 255) | 0;
        splat[o + 3] = (moss * 255) | 0;
      }
    }, base, total);
  }

  // ==========================================================================
  //  5 — GPU upload
  // ==========================================================================

  /** True for a WebGL2 context, probed without trusting any extension list. */
  _isWebGL2() {
    try {
      const gl = this.ctx.engine?.renderer?.getContext?.();
      if (!gl) return false;
      if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        return true;
      }
      // texStorage2D exists only on WebGL2, so this survives a wrapped context.
      return typeof gl.texStorage2D === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Pick the best height-texture encoding this device can filter.
   *
   * The extension probes below are WebGL1 questions. `OES_texture_half_float_linear`
   * does not *exist* in WebGL2 — filtering R16F is core there — so `getExtension`
   * correctly returns null and the capability flag reads false on hardware that
   * filters half-floats perfectly well. Trusting it dropped every WebGL2 device onto
   * the 8-bit path, which samples NEAREST; that in turn disables the per-pixel normal
   * (four hand-filtered taps is too many) and leaves every slope-driven mask reading
   * a faceted per-vertex normal. That is the whole hard-edged-polygon artifact.
   */
  _pickHeightFormat() {
    const caps = this.ctx.engine?.capabilities || {};
    if (caps.floatLinear) return 'float';
    if (caps.halfFloatLinear) return 'half';
    if (this._isWebGL2()) return 'half';
    return 'encoded';
  }

  _makeHeightTexture(src, n, mode) {
    let tex;
    if (mode === 'float') {
      tex = new DataTexture(Float32Array.from(src), n, n, RedFormat, FloatType);
    } else if (mode === 'half') {
      const buf = new Uint16Array(n * n);
      for (let i = 0; i < buf.length; i++) buf[i] = toHalf(src[i]);
      tex = new DataTexture(buf, n, n, RedFormat, HalfFloatType);
    } else {
      // 16-bit height packed into RG. Filtered by hand in the shader, so NEAREST.
      const span = HEIGHT_MAX - HEIGHT_MIN;
      const buf = new Uint8Array(n * n * 4);
      for (let i = 0; i < n * n; i++) {
        const v = clamp((src[i] - HEIGHT_MIN) / span, 0, 0.9999847);
        const s = v * 255;
        const hi = Math.floor(s);
        const lo = Math.round((s - hi) * 255);
        buf[i * 4] = hi;
        buf[i * 4 + 1] = lo;
        buf[i * 4 + 2] = 0;
        buf[i * 4 + 3] = 255;
      }
      tex = new DataTexture(buf, n, n, RGBAFormat, UnsignedByteType);
    }
    const filter = mode === 'encoded' ? NearestFilter : LinearFilter;
    tex.minFilter = filter;
    tex.magFilter = filter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  _makeDataTexture(bytes, n) {
    const tex = new DataTexture(bytes, n, n, RGBAFormat, UnsignedByteType);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Procedural tiling normal map. Used for terrain surface detail (so we do not need
   * a normal map from the material library) and, at a different frequency, for water.
   */
  async _makeNormalTexture(size, height, strength, label) {
    // The height pass is a few hundred thousand noise evaluations; chunk it like
    // everything else rather than eating a 20 ms frame at the end of boot.
    const h = new Float32Array(size * size);
    await this._forRange(size, label, (j) => {
      for (let i = 0; i < size; i++) h[j * size + i] = height(i / size, j / size);
    });
    const buf = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const l = h[j * size + ((i - 1 + size) % size)];
        const r = h[j * size + ((i + 1) % size)];
        const d = h[((j - 1 + size) % size) * size + i];
        const u = h[((j + 1) % size) * size + i];
        let nx = (l - r) * strength;
        let nz = (d - u) * strength;
        const len = Math.sqrt(nx * nx + nz * nz + 1);
        const o = (j * size + i) * 4;
        buf[o] = ((nx / len) * 0.5 + 0.5) * 255;
        buf[o + 1] = ((nz / len) * 0.5 + 0.5) * 255;
        buf[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        buf[o + 3] = 255;
      }
    }
    const tex = new DataTexture(buf, size, size, RGBAFormat, UnsignedByteType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = NoColorSpace;
    tex.anisotropy = Math.min(4, this.ctx.engine?.capabilities?.anisotropy || 1);
    tex.needsUpdate = true;
    return tex;
  }

  async _buildTextures() {
    const mode = this._pickHeightFormat();
    this.encodedHeight = mode === 'encoded';
    this.heightTex = this._makeHeightTexture(this.height, this.gridN, mode);
    this.macroTex = this._makeHeightTexture(this.macroHeight, this.macroN, mode);
    await nextTick();
    this.dataTex = this._makeDataTexture(this.dataBytes, this.gridN);
    this.splatTex = this._makeDataTexture(this.splatBytes, this.gridN);
    await nextTick();

    // Ground grain. Two octaves of warped fbm plus a pebble term reads as soil.
    this.detailNormalTex = await this._makeNormalTexture(128, (u, v) => {
      const x = u * 8, y = v * 8;
      return noise.fbm2(x, y, 4) * 0.6 + noise.billow2(x * 2.7 + 11, y * 2.7 - 5, 3) * 0.4;
    }, 2.6, 'grinding the soil');

    // Capillary ripples for the stream. Two of these scroll against each other.
    this.waterNormalTex = await this._makeNormalTexture(128, (u, v) => {
      const x = u * 6, y = v * 6;
      return Math.sin((x + noise.fbm2(x, y, 2) * 1.4) * 2.1) * 0.35 +
        noise.fbm2(x * 1.9 + 3, y * 1.9 - 2, 3) * 0.65;
    }, 1.5, 'stirring the stream');
  }

  // ==========================================================================
  //  6 — the terrain material
  // ==========================================================================

  /** GLSL for reading the two heightfields. Shared by the terrain and water shaders. */
  _heightGLSL() {
    return /* glsl */`
uniform sampler2D tHeight;
uniform sampler2D tMacro;
uniform vec4 uCoreRect;    // originX, originZ, 1/extent, unused
uniform vec4 uMacroRect;
uniform vec4 uCoreUV;      // uvScale, uvOffset, N, 1/N
uniform vec4 uMacroUV;
uniform vec2 uHeightRange; // min, span (encoded path only)

#ifdef TERRAIN_ENCODED
float kgDecode(vec4 t){ return uHeightRange.x + (t.r + t.g / 255.0) * uHeightRange.y; }
float kgTexH(sampler2D tex, vec2 uv, float N, float invN){
  vec2 p = uv * N - 0.5;
  vec2 f = fract(p);
  vec2 b = (floor(p) + 0.5) * invN;
  float h00 = kgDecode(texture2D(tex, b));
  float h10 = kgDecode(texture2D(tex, b + vec2(invN, 0.0)));
  float h01 = kgDecode(texture2D(tex, b + vec2(0.0, invN)));
  float h11 = kgDecode(texture2D(tex, b + vec2(invN, invN)));
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
float kgTexHFast(sampler2D tex, vec2 uv, float N, float invN){ return kgDecode(texture2D(tex, uv)); }
#else
float kgTexH(sampler2D tex, vec2 uv, float N, float invN){ return texture2D(tex, uv).r; }
float kgTexHFast(sampler2D tex, vec2 uv, float N, float invN){ return texture2D(tex, uv).r; }
#endif

vec2 kgCoreUV(vec2 w){ return (w - uCoreRect.xy) * uCoreRect.z; }
float kgCoreWeight(vec2 cuv){
  float e = max(abs(cuv.x - 0.5), abs(cuv.y - 0.5));
  return 1.0 - smoothstep(0.40, 0.475, e);
}
float kgHeight(vec2 w){
  vec2 cuv = kgCoreUV(w);
  vec2 muv = (w - uMacroRect.xy) * uMacroRect.z;
  float macro = kgTexH(tMacro, muv * uMacroUV.x + uMacroUV.y, uMacroUV.z, uMacroUV.w);
  float wc = kgCoreWeight(cuv);
  if (wc <= 0.001) return macro;
  float core = kgTexH(tHeight, cuv * uCoreUV.x + uCoreUV.y, uCoreUV.z, uCoreUV.w);
  return mix(macro, core, wc);
}
float kgHeightFast(vec2 w){
  vec2 cuv = kgCoreUV(w);
  vec2 muv = (w - uMacroRect.xy) * uMacroRect.z;
  float macro = kgTexHFast(tMacro, muv * uMacroUV.x + uMacroUV.y, uMacroUV.z, uMacroUV.w);
  float wc = kgCoreWeight(cuv);
  if (wc <= 0.001) return macro;
  float core = kgTexHFast(tHeight, cuv * uCoreUV.x + uCoreUV.y, uCoreUV.z, uCoreUV.w);
  return mix(macro, core, wc);
}
`;
  }

  /** Vertex displacement, shared by the lit material and its custom depth twin. */
  _vertexGLSL() {
    return {
      pre: /* glsl */`
attribute float aSkirt;
varying vec3 vKgWorld;
varying vec3 vKgNormal;
varying float vKgCore;
uniform vec2 uNormalStep;
${this._heightGLSL()}
`,
      normalChunk: /* glsl */`
  vec4 kgWP = modelMatrix * vec4(position, 1.0);
  vec2 kgXZ = kgWP.xz;
  float kgCell = length(modelMatrix[0].xyz);
  float kgH = kgHeight(kgXZ);
  // Never difference across less than a heightfield texel: a step finer than the
  // data samples the bilinear patch and hands back a per-texel faceted normal.
  float kgE = max(kgCell, uNormalStep.x);
  float kgHL = kgHeightFast(kgXZ - vec2(kgE, 0.0));
  float kgHR = kgHeightFast(kgXZ + vec2(kgE, 0.0));
  float kgHD = kgHeightFast(kgXZ - vec2(0.0, kgE));
  float kgHU = kgHeightFast(kgXZ + vec2(0.0, kgE));
  vec3 kgWorldN = normalize(vec3(kgHL - kgHR, 2.0 * kgE, kgHD - kgHU));
  // The rings carry a non-uniform scale (cell, 1, cell); normals need the inverse.
  vec3 objectNormal = normalize(vec3(kgWorldN.x * kgCell, kgWorldN.y, kgWorldN.z * kgCell));
  vKgNormal = kgWorldN;
  vKgCore = kgCoreWeight(kgCoreUV(kgXZ));
  float kgY = kgH - aSkirt * kgCell * 3.5;
  vKgWorld = vec3(kgXZ.x, kgY, kgXZ.y);
`,
      beginChunk: /* glsl */`
  vec3 transformed = vec3(position.x, kgY, position.z);
`,
      // three only includes <beginnormal_vertex> in the depth shader behind
      // USE_DISPLACEMENTMAP, so the depth twin does the whole job in <begin_vertex>.
      // It needs no normal, which also makes the shadow pass cheaper.
      depthChunk: /* glsl */`
  vec4 kgWP = modelMatrix * vec4(position, 1.0);
  vec2 kgXZ = kgWP.xz;
  float kgCell = length(modelMatrix[0].xyz);
  float kgY = kgHeight(kgXZ) - aSkirt * kgCell * 3.5;
  vKgWorld = vec3(kgXZ.x, kgY, kgXZ.y);
  vec3 transformed = vec3(position.x, kgY, position.z);
`,
    };
  }

  async _buildMaterial() {
    const q = this.quality;
    const lib = this.ctx.materials;
    const aniso = Math.min(q.anisotropy || 4, this.ctx.engine?.capabilities?.anisotropy || 4);

    const dirt = resolveTextures(lib, 'dirt');
    const stone = resolveTextures(lib, 'stone');
    const cobble = resolveTextures(lib, 'cobble');
    const moss = resolveTextures(lib, 'moss');
    const tDirt = prepTiling(dirt.map, aniso);
    const tStone = prepTiling(stone.map, aniso);
    const tCobble = prepTiling(cobble.map, aniso);
    const tMoss = prepTiling(moss.map, aniso);
    const hasTex = !!(tDirt || tStone || tCobble || tMoss);
    // A library that booted but handed back a partial set still has to render.
    const fallback = tDirt || tStone || tCobble || tMoss || null;
    // The ground's grain is 土 packed earth, not 石 shrine steps. This used to take
    // `stone.normalMap` first, and stone's height field is 2x3 slab joints cut to
    // 30% of its range over a 7x7 worley crack net with a 17x17 one under it. Laid
    // across the whole ground at 1.7 m per tile, rotated and domain-warped, that is
    // a meandering cellular crack network on every near surface in frame — exactly
    // the "dried cracked mud on a dune" the review measured on the valley floor. It
    // is also what the slope striation was reading: `groove` comes off this map's z,
    // and a crack net pins it to its ceiling, which is where the hard-edged plates
    // on the massif came from. `dirt` is the right surface anyway — clods, half-
    // buried pebbles and grit, no joints and no cracks — and the library bakes it
    // wrapped, which our own soil grain (kept last) is not.
    // `lib.detailNormal` is the map the library bakes for exactly this job: wrapped,
    // high-frequency grain with no macro structure in it. Everything else here is a
    // *surface* map authored at 1.67 m per tile — `stone`'s carries slab joints and a
    // crack net, and stamping that across the ground at detail strength is what put
    // metre-scale joints on the terrain and fed the striation its ceiling.
    const detailN = prepTiling(lib?.detailNormal || dirt.normalMap || moss.normalMap ||
      stone.normalMap, aniso) || this.detailNormalTex;

    // Triplanar rock costs one extra fetch; it is what stops cliffs from smearing.
    const triplanar = q.tier >= 2;
    try { lib?.triplanarPatch?.(); } catch { /* optional helper */ }

    const mat = new MeshStandardMaterial({
      color: hasTex ? 0xffffff : 0x8b8778,
      roughness: 0.95,
      metalness: 0.0,
      side: FrontSide,
      dithering: true,
    });
    mat.name = 'terrain';

    // Sky owns aerial perspective; let it patch first so we compose rather than clash.
    try { this.ctx.sky?.applyFog?.(mat); } catch { /* optional */ }

    const V = this._vertexGLSL();
    const uniforms = {
      tHeight: { value: this.heightTex },
      tMacro: { value: this.macroTex },
      tData: { value: this.dataTex },
      tSplat: { value: this.splatTex },
      tDirt: { value: tDirt || fallback },
      tStone: { value: tStone || fallback },
      tCobble: { value: tCobble || fallback },
      tMoss: { value: tMoss || fallback },
      tDetailN: { value: detailN },
      uCoreRect: { value: new Vector4(-CORE_HALF, -CORE_HALF, 1 / CORE_EXTENT, 0) },
      uMacroRect: { value: new Vector4(-MACRO_HALF, -MACRO_HALF, 1 / MACRO_EXTENT, 0) },
      uCoreUV: {
        value: new Vector4((this.gridN - 1) / this.gridN, 0.5 / this.gridN, this.gridN, 1 / this.gridN),
      },
      uMacroUV: {
        value: new Vector4((this.macroN - 1) / this.macroN, 0.5 / this.macroN, this.macroN, 1 / this.macroN),
      },
      uHeightRange: { value: new Vector2(HEIGHT_MIN, HEIGHT_MAX - HEIGHT_MIN) },
      uTexScale: { value: new Vector4(0.30, 0.42, 0.105, 0.55) },
      uWaterLevel: { value: this.waterLevel },
      uSkyTint: { value: new Color(0x9fb4c8) },
      uAerial: { value: new Vector2(90, 0.00085) },
      // Finite-difference step for the per-pixel normal, in metres. This *must* be
      // wider than one texel of the field being differenced. A bilinear texture is
      // C0, not C1: its gradient is discontinuous across every texel boundary, so a
      // central difference narrower than a texel returns that cell's constant patch
      // gradient and paints the data grid onto the mountain as hard-edged facets —
      // the same artifact as the vertex normal, one lattice finer. Two texels of
      // span is the finest honest answer the data supports; everything below it is
      // supplied by the slope-aligned striation instead.
      // x = core field (1.7 m texels), y = macro field (16 m texels).
      uNormalStep: { value: new Vector2(this.cell * 1.9, this.macroCell * 2.1) },
      uWindXZ: { value: new Vector2(0.82, 0.57) },
    };
    this.uniforms = uniforms;

    // Per-pixel normals need four (or two) extra heightfield taps. The 8-bit
    // encoded path filters by hand and would cost four times that, so it keeps the
    // vertex normal and leans on the detail normals instead.
    const ppNormal = this.encodedHeight ? 0 : (q.tier >= 2 ? 2 : q.tier >= 1 ? 1 : 0);
    const defines = [
      this.encodedHeight ? '#define TERRAIN_ENCODED 1' : '',
      hasTex ? '#define TERRAIN_TEXTURED 1' : '',
      triplanar ? '#define TERRAIN_TRIPLANAR 1' : '',
      ppNormal ? `#define TERRAIN_PPNORMAL ${ppNormal}` : '',
      q.tier >= 1 ? '#define TERRAIN_STOCHASTIC 1' : '',
    ].join('\n');
    console.warn(`[terrain-diag] heightMode=${this.encodedHeight ? 'encoded' : 'float/half'} ` +
      `ppNormal=${ppNormal} tier=${q.tier} triplanar=${triplanar} ` +
      `caps=${JSON.stringify(this.ctx.engine?.capabilities ?? null)}`);

    chainOnBeforeCompile(mat, (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = defines + '\n' + V.pre + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', V.normalChunk)
        .replace('#include <begin_vertex>', V.beginChunk);
      shader.fragmentShader = defines + '\n' + this._fragmentPreludeGLSL() + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', /* glsl */`
  kgComputeSurface();
  diffuseColor.rgb *= kgAlbedo;
`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kgRough;')
        .replace('#include <normal_fragment_maps>', /* glsl */`
  normal = normalize((viewMatrix * vec4(kgShadingNormal, 0.0)).xyz);
`)
        .replace('#include <opaque_fragment>', /* glsl */`
#include <opaque_fragment>
  {
    // Aerial perspective. Distant terrain has to desaturate and drift toward the sky
    // or 1800 m of view distance reads as a flat painted backdrop. The mist term is
    // what gives a single mountain depth across its own thousand metres: its foot
    // sits in the valley air and its summit does not.
    float kgDist = length(vKgWorld - cameraPosition);
    float kgA = 1.0 - exp(-pow(max(kgDist - uAerial.x, 0.0) * uAerial.y, 1.18));
    float kgMist = smoothstep(915.0, 806.0, vKgWorld.y) * smoothstep(130.0, 520.0, kgDist);
    kgA = clamp(kgA * (1.0 + kgMist * 0.60) + kgMist * 0.10, 0.0, 1.0);
    float kgLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 kgFar = mix(vec3(kgLum), uSkyTint, 0.7);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, kgFar, kgA * 0.88);
  }
`);
    });

    // The depth pass must displace identically or the terrain self-shadows against a
    // flat plane sitting at y = 0.
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    chainOnBeforeCompile(depth, (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = defines + '\n' + V.pre + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', V.depthChunk);
    });
    depth.customProgramCacheKey = () => 'kagerou-terrain-depth';

    this.material = mat;
    this.depthMaterial = depth;
  }

  /**
   * The splat blend. Six surfaces — dirt, grass, rock, gravel, mossy stone and a wet
   * riverbed band — combined with height-map-weighted blending rather than a lerp, so
   * gravel sits *in* the dirt and grass grows *between* the stones instead of fading
   * across them. Weights come from the baked splat map inside the core field and from
   * slope/altitude rules outside it.
   */
  _fragmentPreludeGLSL() {
    return /* glsl */`
uniform sampler2D tData;
uniform sampler2D tSplat;
uniform sampler2D tDirt;
uniform sampler2D tStone;
uniform sampler2D tCobble;
uniform sampler2D tMoss;
uniform sampler2D tDetailN;
uniform vec4 uTexScale;
uniform float uWaterLevel;
uniform vec3 uSkyTint;
uniform vec2 uAerial;
uniform vec2 uNormalStep;
uniform vec2 uWindXZ;
varying vec3 vKgWorld;
varying vec3 vKgNormal;
varying float vKgCore;
${this._heightGLSL()}
${glslNoise}

/**
 * The landform field: the macro heightfield alone, per pixel, filtered the same way
 * in every height encoding.
 *
 * Everything that draws a *line* across the far mountain — the tree line, the scree
 * band, the snow line — must key on this and never on 'vKgWorld.y' or on the
 * interpolated vertex normal. Those two are per-vertex quantities: on the outermost
 * clipmap ring a quad is 45 m, so a threshold against them is straight inside a
 * triangle and kinks at its edges, which is exactly the "flat-fill polygons with step
 * edges" the review measured — straight sides, sharp corners, dead-flat interiors.
 *
 * 'kgHeightFast' is not a substitute: on the 8-bit encoded path it is a single
 * NEAREST tap, so it returns the 16 m data grid as a staircase and the same mask
 * comes back blocky instead of triangular. 'kgTexH' is the hand-rolled bilinear and
 * is C0 on both paths. The core field is deliberately not blended in — nothing that
 * uses this is within a kilometre of the core, and skipping it halves the taps.
 */
float kgLandH(vec2 w){
  vec2 muv = (w - uMacroRect.xy) * uMacroRect.z;
  return kgTexH(tMacro, muv * uMacroUV.x + uMacroUV.y, uMacroUV.z, uMacroUV.w);
}

vec3 kgAlbedo;
float kgRough;
vec3 kgShadingNormal;

/** Shared per-fragment tile-breaking state, set once at the top of the surface pass. */
vec2 kgWarp;
float kgBlend;

float kgLum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 kgSample(sampler2D t, vec2 uv){
#ifdef TERRAIN_TEXTURED
  return texture2D(t, uv).rgb;
#else
  return vec3(0.5 + 0.5 * fbm2(uv * 3.0, 3));
#endif
}

/** Rotate a world-plane coordinate. sc is (sin, cos), baked per layer. */
vec2 kgRot(vec2 p, vec2 sc){ return vec2(p.x * sc.y - p.y * sc.x, p.x * sc.x + p.y * sc.y); }

/**
 * Tiled ground sample with the wrap seams broken.
 *
 * A single planar lookup lays the texture's own UV-wrap edges across the ground as
 * two families of dead-straight parallel lines at exactly the tile pitch — from a
 * standing eye that is a checkerboard you can trace stone-for-stone across fifty
 * metres. Three things kill it, in ascending cost: the whole lookup is domain-warped
 * (long wavelength to decorrelate distant regions, short wavelength to bend the seam
 * itself, so no seam stays straight for longer than a stone); each layer is rotated
 * by its own irrational angle, so no two layers can ever agree on a grid direction;
 * and a second lookup at 0.617× scale is blended in under a low-frequency mask, which
 * destroys the period — a repeat is only legible if the *same* stones come back.
 */
vec3 kgTiled(sampler2D t, vec2 p, float scale, vec2 r1, vec2 r2){
#ifdef TERRAIN_STOCHASTIC
  vec2 q = p + kgWarp;
  vec3 a = kgSample(t, kgRot(q, r1) * scale);
  vec3 b = kgSample(t, kgRot(q + vec2(37.13, -18.77), r2) * (scale * 0.617));
  return mix(a, b, kgBlend);
#else
  return kgSample(t, kgRot(p, r1) * scale);
#endif
}

void kgComputeSurface(){
  vec3 P = vKgWorld;
  vec3 N = normalize(vKgNormal);
  float core = clamp(vKgCore, 0.0, 1.0);
  float dist = length(P - cameraPosition);
  float curv = 0.0;

  // --- surface normal ------------------------------------------------------
  // The vertex normal is a lattice sample: on the outer clipmap rings the mesh is
  // 25–50 m across, so an interpolated per-vertex normal paints the ring's own quad
  // grid onto the mountain as a checker of alternating value. Re-derive it per pixel
  // from the heightfield, differencing across a little more than one texel of
  // whichever field actually holds the data here.
#ifdef TERRAIN_PPNORMAL
  float st = mix(uNormalStep.y, uNormalStep.x, core);
#if TERRAIN_PPNORMAL >= 2
  float hL = kgHeightFast(P.xz - vec2(st, 0.0));
  float hR = kgHeightFast(P.xz + vec2(st, 0.0));
  float hD = kgHeightFast(P.xz - vec2(0.0, st));
  float hU = kgHeightFast(P.xz + vec2(0.0, st));
  N = normalize(vec3(hL - hR, 2.0 * st, hD - hU));
  curv = ((hL + hR + hD + hU) * 0.25 - P.y) / st;
#else
  float hR = kgHeightFast(P.xz + vec2(st, 0.0));
  float hU = kgHeightFast(P.xz + vec2(0.0, st));
  N = normalize(vec3(P.y - hR, st, P.y - hU));
  curv = ((hR + hU) * 0.5 - P.y) / st;
#endif
#endif
  float slope = 1.0 - clamp(N.y, 0.0, 1.0);
  float fall = length(N.xz);

  // Altitude, sampled per pixel rather than taken from vKgWorld.y. The varying is
  // linear across each triangle, so anything thresholded against it — a tree line,
  // a snow line — gets isolines that are straight inside a triangle and kink at its
  // edges. On a 44 m outer-ring quad that is exactly the "hard-edged flat polygon"
  // artifact: the mask is per-pixel, but the quantity it tests is not.
  float hPix = P.y;
#ifdef TERRAIN_PPNORMAL
  hPix = kgHeightFast(P.xz);
#endif

  vec2 cuv = kgCoreUV(P.xz);
  vec4 data = texture2D(tData, clamp(cuv, 0.0, 1.0));
  vec4 sp = texture2D(tSplat, clamp(cuv, 0.0, 1.0));

  // Break-up so no transition lands on a contour line. nA is fine grain and is
  // faded out before it turns into sub-pixel fizz; nC is the landscape-scale term
  // that carries the vegetation and snow lines.
  float nA = fbm2(P.xz * 0.09, 3) * (1.0 - smoothstep(80.0, 240.0, dist));
  float nB = fbm2(P.xz * 0.021 + 17.0, 3);
  float nC = fbm2(P.xz * 0.0062 + 41.0, 3);

  // Outside the eroded core there is no baked splat, so fall back to the same rules
  // evaluated live. The crossfade is the one the geometry already uses.
  // Widened and noise-broken: this threshold used to bite on a per-vertex normal
  // and cut the mountain into hard-edged pale facets that read as snow.
  float fSlope = smoothstep(0.14, 0.52, slope + nB * 0.10 + nA * 0.05);
  float fHigh  = smoothstep(915.0, 995.0, hPix + nC * 40.0);
  vec4 wild = vec4(
    (1.0 - fSlope) * smoothstep(1000.0, 890.0, hPix) * 0.85,
    max(fSlope, fHigh * 0.9),
    fSlope * 0.25,
    0.0);
  sp = mix(wild, sp, core);
  float wet = data.r * core;
  float ao  = mix(1.0, data.g, core);
  float flow = data.b * core;
  // Three centuries of feet. Baked against the sandō spline, so it curves with the
  // approach instead of being a straight stripe painted down the axis.
  float wear = data.a * core;

  float wGrass = sp.r, wRock = sp.g, wGravel = sp.b, wMoss = sp.a;
  float wDirt = clamp(1.0 - (wGrass + wRock + wGravel + wMoss), 0.0, 1.0);
  // The wet band that hugs the stream. Reads as riverbed shingle, not as tinted dirt.
  float wBed = smoothstep(2.6, -0.6, P.y - uWaterLevel) * core;
  wBed = max(wBed, wet * smoothstep(0.55, 0.95, flow) * 0.6);

  wGrass = clamp(wGrass * (0.8 + 0.5 * nB) + nA * 0.06, 0.0, 1.0);
  wGravel = clamp(wGravel + nA * 0.09, 0.0, 1.0);
  wRock = clamp(wRock + nB * 0.08, 0.0, 1.0);

  // --- tile-break state ----------------------------------------------------
  float gn = 0.0;
  kgWarp = vec2(0.0);
  kgBlend = 0.0;
#ifdef TERRAIN_STOCHASTIC
  vec2 wLo = vec2(fbm2(P.xz * 0.0730 + 12.7, 2), fbm2(P.xz * 0.0730 - 5.1, 2));
  vec2 wHi = vec2(fbm2(P.xz * 0.3300 + 41.3, 1), fbm2(P.xz * 0.3300 - 9.6, 1));
  kgWarp = (wLo * 1.25 + wHi * 0.28) * (1.0 - smoothstep(160.0, 420.0, dist));
  gn = fbm2(P.xz * 0.058 + 27.5, 2);
  // Bias the blend where the ground is worn, so the traffic band is dressed in a
  // visibly different run of stone rather than the same stone slightly darker.
  kgBlend = smoothstep(-0.24, 0.24, gn + wear * 0.35 - 0.10);
#endif

  vec3 cDirt   = kgTiled(tDirt,   P.xz, uTexScale.x, vec2(0.0, 1.0), vec2(0.7071, 0.7071));
  vec3 cGrass  = kgTiled(tMoss,   P.xz, uTexScale.y, vec2(0.5150, 0.8572), vec2(-0.891, 0.4540));
  vec3 cCobble = kgTiled(tCobble, P.xz, uTexScale.w, vec2(0.2924, 0.9563), vec2(0.9455, -0.3256));
#ifdef TERRAIN_TRIPLANAR
  vec3 axis = abs(N);
  vec2 rockUV = (axis.x > axis.z) ? P.zy : P.xy;
  float triW = clamp(slope * 1.9, 0.0, 1.0);
  vec3 cRock = mix(kgTiled(tStone, P.xz, uTexScale.z, vec2(0.7314, 0.6819), vec2(-0.1219, 0.9925)),
                   kgSample(tStone, rockUV * uTexScale.z), triW);
#else
  vec3 cRock = kgTiled(tStone, P.xz, uTexScale.z, vec2(0.7314, 0.6819), vec2(-0.1219, 0.9925));
#endif

  // Per-layer tints. Autumn on the mountain: ochre grass, cool wet stone.
  vec3 colDirt   = cDirt   * vec3(0.58, 0.46, 0.35) * 1.55;
  vec3 colGrass  = cGrass  * vec3(0.44, 0.50, 0.26) * 1.75;
  vec3 colRock   = cRock   * vec3(0.55, 0.54, 0.50) * 1.60;
  vec3 colGravel = cCobble * vec3(0.56, 0.54, 0.50) * 1.62;
  vec3 colMoss   = mix(colRock, cGrass * vec3(0.30, 0.42, 0.24) * 1.85, 0.7);
  vec3 colBed    = cCobble * vec3(0.40, 0.41, 0.39) * 1.35;

  // Displacement-aware blend. Each layer brings its own micro-height; the winner is
  // whichever layer's *surface* stands proudest, which is how real ground interlocks.
  float hDirt   = kgLum(cDirt)   * 0.85 + 0.10;
  float hGrass  = kgLum(cGrass)  * 0.70;
  float hRock   = kgLum(cRock)   * 1.30 + 0.12;
  float hGravel = kgLum(cCobble) * 1.15 + 0.06;
  float hMoss   = kgLum(cGrass)  * 0.80 + 0.04;
  float hBed    = kgLum(cCobble) * 1.00;

  const float HI = 0.62;
  float b0 = hDirt   * HI + wDirt;
  float b1 = hGrass  * HI + wGrass;
  float b2 = hRock   * HI + wRock;
  float b3 = hGravel * HI + wGravel;
  float b4 = hMoss   * HI + wMoss;
  float b5 = hBed    * HI + wBed;
  float ma = max(max(max(b0, b1), max(b2, b3)), max(b4, b5)) - 0.17;
  b0 = max(b0 - ma, 0.0); b1 = max(b1 - ma, 0.0); b2 = max(b2 - ma, 0.0);
  b3 = max(b3 - ma, 0.0); b4 = max(b4 - ma, 0.0); b5 = max(b5 - ma, 0.0);
  float bt = max(b0 + b1 + b2 + b3 + b4 + b5, 1e-4);

  vec3 albedo = (colDirt * b0 + colGrass * b1 + colRock * b2 +
                 colGravel * b3 + colMoss * b4 + colBed * b5) / bt;

  float rough = (0.94 * b0 + 0.88 * b1 + 0.80 * b2 +
                 0.86 * b3 + 0.82 * b4 + 0.62 * b5) / bt;

  // Wet ground darkens and tightens; the shoreline is where this earns its keep.
  float wetAmt = clamp(wet * 0.9 + wBed * 0.7, 0.0, 1.0);
  albedo *= mix(1.0, 0.58, wetAmt);
  rough = mix(rough, 0.22, wetAmt * 0.85);

  // --- weathering ----------------------------------------------------------
  // Grime and damp collect in the hollows and the joints and get scrubbed out of
  // the traffic band. This runs at roughly ten tile wavelengths, which is what
  // stops the eye from locking onto the tile period even where a seam survives.
  float hollow = clamp(curv * 1.4, 0.0, 1.0);
  float weather = clamp((gn * 0.5 + 0.5) * 0.8 + hollow * 0.45 - wear * 0.75, 0.0, 1.0);
  albedo *= mix(1.0, 0.76, weather * 0.65);
  rough = mix(rough, 0.96, weather * 0.30);

  // The sandō is polished pale and smooth, and nothing grows on it.
  albedo = mix(albedo, albedo * vec3(1.16, 1.12, 1.06), wear * 0.75);
  rough = mix(rough, 0.52, wear * 0.55);

  // --- the far ground ------------------------------------------------------
  // Past ~100 m every tiled lookup has mipped down to its own average and the
  // mountain turns into one grey ramp. Everything it should have had — a tree
  // line, scree fans, gullies, snow — has to be reconstructed per pixel here.
  float wild2 = (1.0 - core) * smoothstep(90.0, 300.0, dist);

  // --- the landform frame --------------------------------------------------
  // One set of macro taps, shared by every rule below that draws a line on the
  // massif. Differenced over three macro texels (48 m): wide enough that what comes
  // back is the shape of the mountain rather than the shape of the data grid, and
  // still about fifty pixels at the range the massif is seen from, so the lines it
  // carries stay legible. Gated on distance — near ground keeps the shading normal.
  vec3 kgLandN = N;
  float hLand = hPix;
  float lFallW = fall;
  float bowlW = 0.0;
  if (wild2 > 0.002 || hPix > 1000.0) {
    const float LS = 48.0;
    hLand = kgLandH(P.xz);
    float bL = kgLandH(P.xz - vec2(LS, 0.0));
    float bR = kgLandH(P.xz + vec2(LS, 0.0));
    float bD = kgLandH(P.xz - vec2(0.0, LS));
    float bU = kgLandH(P.xz + vec2(0.0, LS));
    kgLandN = normalize(vec3(bL - bR, 2.0 * LS, bD - bU));
    lFallW = length(kgLandN.xz);
    // Bowls, cirques and gully heads come back positive; ribs and spurs negative.
    bowlW = clamp(((bL + bR + bD + bU) * 0.25 - hLand) * (2.0 / LS), -1.0, 1.0);
  }

  vec3 gp = vec3(0.0);
  float groove = 0.0;
  {
    // Striation runs down the fall line, so the sampling frame is stretched along
    // it: features come out as gullies and ribs, not as a blanket of noise.
    vec2 dn2 = fall > 1e-4 ? N.xz / fall : vec2(1.0, 0.0);
    vec2 ac2 = vec2(-dn2.y, dn2.x);
    float along = dot(P.xz, dn2);
    float across = dot(P.xz, ac2);
    vec3 g1 = texture2D(tDetailN, vec2(along * 0.0138, across * 0.0470)).xyz * 2.0 - 1.0;
    vec3 g2 = texture2D(tDetailN, vec2(along * 0.0053, across * 0.0181) + 0.31).xyz * 2.0 - 1.0;
    // The slope gate is deliberately wide, and nothing downstream of it saturates.
    // It used to be smoothstep(0.14, 0.52) feeding a clamp(), and that pair is a
    // *threshold*, not a gate: on a massif seen from 1.5 km one 16 m macro cell is
    // a single pixel, so the gate flipped inside one texel while the clamp pinned
    // everything past it to exactly 1. The striation came out as hard-edged plates
    // with dead-flat interiors — the "flat-fill polygons with step edges" the review
    // measured, which were never snow at all.
    float amp = smoothstep(0.05, 0.90, fall) * mix(0.34, 1.0, wild2);
    gp = vec3(g1.xy * 0.42 + g2.xy * 0.60, 0.0) * amp;
    // Soft knee rather than a clamp. Relief still rises with the local gradient but
    // it approaches its ceiling asymptotically, so it has no level set anywhere for
    // an edge to form along.
    float gs = length(g1.xy) * 0.70 + length(g2.xy) * 0.55;
    groove = (gs / (gs + 0.85)) * amp;
  }
  if (wild2 > 0.002) {
    // Cedar mantle low, bare rock and scree above it, and the line between them
    // wanders on a 160 m noise so it is never a contour.
    float treeLine = 1006.0 + nC * 92.0 + nB * 28.0;
    float veg = smoothstep(treeLine + 34.0, treeLine - 48.0, hLand) *
                (1.0 - smoothstep(0.40, 0.76, lFallW));
    // Soft knee, not a clamp. 'clamp(smoothstep * smoothstep * 3.0, 0, 1)' is a
    // *threshold* wearing a gradient's clothes: the 3x pins it to exactly 1 over most
    // of its domain, so the band came out as a plate with a dead-flat interior and a
    // step at its rim. This approaches its ceiling asymptotically and never reaches
    // it, so the band has no level set anywhere for an edge to form along.
    float sband = smoothstep(0.15, 0.38, lFallW) * smoothstep(0.64, 0.30, lFallW);
    float scree = (sband / (sband + 0.42)) * 1.55 *
                  (1.0 - veg) * (0.45 + 0.55 * (nB * 0.5 + 0.5));
    vec3 far = mix(vec3(0.255, 0.245, 0.232), vec3(0.104, 0.126, 0.082), veg);
    far = mix(far, vec3(0.300, 0.262, 0.212), scree * 0.7);
    far *= 0.78 + 0.44 * (nB * 0.5 + 0.5);
    far *= 0.82 + 0.28 * (nC * 0.5 + 0.5);
    far *= 1.0 - groove * 0.38;
    albedo = mix(albedo, far, wild2 * 0.88);
    rough = mix(rough, mix(0.88, 0.96, veg), wild2 * 0.8);
  }

  // --- 雪 ------------------------------------------------------------------
  // Snow is an accumulation model. Not a scatter, not a decal, and above all not a
  // threshold — every term below is smooth in *world* space and none of them
  // saturates, which is what makes the boundary a fringe tens of metres deep on a
  // real face instead of a cut.
  //
  //   altitude    a 230 m ramp, wandered by at most ±80 m of landscape noise. The
  //               wander stays well inside its own ramp; a line noisier than its
  //               ramp stops being a snow line and becomes scattered plates.
  //   slope       what the mountain can hold: nothing past ~41°, everything under
  //               ~22°. This is the *landform* slope from the shared frame above,
  //               never the shading slope and never the vertex normal.
  //   collection  bowls, cirques and gully heads fill first; ribs and spurs blow
  //               bare, and the lee of the prevailing wind drifts deepest.
  //
  // Coverage then stays *partial* over most of the field: at the drift scale the
  // sheet runs from bare rock to buried inside one patch, so rock stands through it
  // and no sample of it can come back as a flat fill (§5.9).
  //
  // None of this may be gated on TERRAIN_PPNORMAL. It used to be, and where that
  // define is absent the whole model collapsed onto 'vKgWorld.y' and the interpolated
  // vertex normal — a per-triangle altitude and a per-triangle slope — which is how a
  // model written entirely in smooth terms still rendered as hard-edged plates.
  float snowAlt = smoothstep(1042.0, 1272.0, hLand + nC * 58.0 + nB * 22.0);
  float kgSnowCover = 0.0;
  vec2 kgSnowRipple = vec2(0.0);
  if (snowAlt > 0.002) {
    vec3 LN = kgLandN;
    float bowl = bowlW;
    float lFall = lFallW;
    // The scallop on the shed line is a tenth of the ramp: it breaks the contour
    // without ever being able to cut it.
    float hold = smoothstep(0.66, 0.38, lFall + nB * 0.04);
    vec2 lDir = lFall > 1e-4 ? LN.xz / lFall : vec2(0.0);
    float lee = clamp(0.5 - dot(lDir, uWindXZ) * 0.5, 0.0, 1.0);

    // Coverage is built from *coarse* drift only: 940 m banks and 280 m drifts, and
    // the finest octave in either is about 140 m. The gradient of this is what sets
    // the width of the snow line, and 140 m is ~150 px at the range the massif is
    // seen from, so the fringe it draws is tens of pixels deep and cannot come back
    // as a cut. Fine detail is deliberately kept out of the coverage decision — it
    // belongs to the interior, below, where it cannot sharpen the boundary.
    float s1 = fbm2(P.xz * 0.0067 + 91.3, 3);
    float s2 = fbm2(P.xz * 0.0224 - 57.1, 2);
    float driftCov = s1 * 0.62 + s2 * 0.38;

    float depth = snowAlt * (0.34 + 0.36 * lee)
                + snowAlt * max(bowl, 0.0) * 0.62
                - max(-bowl, 0.0) * 0.34
                + driftCov * 0.46 * snowAlt;
    float cover = clamp(depth, 0.0, 1.0) * hold;
    float blanket = smoothstep(0.02, 0.70, cover);
    if (blanket > 0.003) {
      // Rock stands through the sheet. Coverage over a real snowfield is partial
      // almost everywhere, and a mask that saturates is precisely what makes a
      // sampled interior come back as a flat colour surface (§5.9). The finest
      // octave here is ~28 m — about thirty pixels at this range, so it reads as
      // drift and bare ground, never as fizz, and because it is bounded well away
      // from zero it wobbles the boundary without ever steepening it.
      float bare = fbm2(P.xz * 0.0560 + 3.7, 3) * 0.5 + 0.5;
      float s3 = fbm2(P.xz * 0.0630 + 13.9, 2);
      float sheet = blanket * (0.52 + 0.48 * bare);

      // Cooler and brighter than the rock it lies on — the warm key does the rest.
      // Shadowed snow is the sky bounce of §5 (#4a6b8f), never a neutral grey.
      vec3 snowCol = mix(vec3(0.250, 0.335, 0.520), vec3(0.760, 0.830, 0.960),
                         clamp(LN.y * 0.45 + N.y * 0.55, 0.0, 1.0));
      // Drift shading. Wind-packed crests catch the light, the troughs between them
      // stay blue; this and the partial coverage are the interior variance.
      snowCol *= 0.74 + 0.34 * (s2 * 0.5 + 0.5) + 0.18 * (s3 * 0.5 + 0.5);
      albedo = mix(albedo, snowCol, sheet * 0.95);
      rough = mix(rough, mix(0.74, 0.38, sheet), sheet * 0.85);
      kgSnowCover = sheet;
      // Sastrugi: two more taps of the ripple field give it a gradient, and a 13°
      // sun turns that gradient into the banding a real snowfield has. Bounded, so
      // it can bend the sheet but never re-point it.
      float se = 7.0;
      kgSnowRipple = clamp(vec2(fbm2((P.xz + vec2(se, 0.0)) * 0.0630 + 13.9, 2) - s3,
                                fbm2((P.xz + vec2(0.0, se)) * 0.0630 + 13.9, 2) - s3) * 2.2,
                           -0.22, 0.22) * sheet;
    }
  }

  // Large-scale colour variation: nothing in frame may be a flat tint.
  albedo *= 0.86 + 0.28 * (nB * 0.5 + 0.5);
  albedo *= mix(0.72, 1.0, ao);

  kgAlbedo = albedo;
  kgRough = clamp(rough, 0.06, 1.0);

  // Detail normal in an XZ-planar frame, faded out with distance so the far rings do
  // not shimmer, plus the slope-aligned striation which deliberately does not fade:
  // it is the only thing carrying surface at 800 m, and its frequency is chosen not
  // to be commensurate with either heightfield so it breaks the residual lattice.
  vec3 T = (abs(N.x) > 0.99) ? normalize(vec3(0.0, 0.0, 1.0) - N * N.z)
                             : normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = cross(N, T);
  float dFade = 1.0 - smoothstep(28.0, 150.0, dist);
  vec3 t1 = texture2D(tDetailN, kgRot(P.xz + kgWarp, vec2(0.3746, 0.9272)) * 0.6).xyz * 2.0 - 1.0;
  // Snow buries the soil grain and the striation both; a snowfield that still carries
  // the rock's own relief reads as a paint layer over it rather than as a depth of
  // material lying on it.
  vec2 tn = t1.xy * 0.75 * dFade * mix(1.0, 0.35, wetAmt) * (1.0 - kgSnowCover * 0.78);
  vec3 dn3 = fall > 1e-4 ? normalize(vec3(N.x, 0.0, N.z) / fall - N * fall) : T;
  vec3 ac3 = cross(N, dn3);
  // The striation perturbation is bounded. Unbounded it reached ~0.9 against a unit
  // normal — a 45° swing, enough to tip a whole shaded face up into the sky term and
  // light it pale, which is half of why those plates read as snow in the first place.
  vec2 gpv = vec2(gp.x * 0.34, gp.y * 0.48) * (1.0 - kgSnowCover * 0.65);
  gpv /= 1.0 + length(gpv) * 1.7;
  kgShadingNormal = normalize(N + T * tn.x + B * tn.y + dn3 * gpv.x + ac3 * gpv.y +
                              vec3(kgSnowRipple.x, 0.0, kgSnowRipple.y));
}
`;
  }

  // ==========================================================================
  //  7 — clipmap
  // ==========================================================================

  /**
   * One geometry in *cell units*; the ring meshes scale it. `hollow` cuts the centre
   * out for the annuli.
   *
   * Nesting: level k snaps to its own 2·cell grid, so its centre can sit up to one
   * coarse cell away from level k-1's. The hole is therefore cut two cells smaller
   * than nominal, and the ring's innermost band is sunk slightly, so the finer level
   * always covers it and always wins the depth test. The finer level's outer skirt
   * hides the resulting ledge — that is the whole crack-fixing story.
   */
  _makeClipGeometry(res, hollow) {
    const half = res / 2;
    const holeHalf = hollow ? Math.max(1, res / 4 - 2) : 0;
    const V = res + 1;
    const idMap = new Int32Array(V * V).fill(-1);
    const cells = new Int32Array(res * res);
    let cellCount = 0;

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        if (hollow) {
          const x0 = i - half, z0 = j - half;
          if (x0 >= -holeHalf && x0 + 1 <= holeHalf && z0 >= -holeHalf && z0 + 1 <= holeHalf) continue;
        }
        cells[cellCount++] = j * res + i;
        idMap[j * V + i] = 0;
        idMap[j * V + i + 1] = 0;
        idMap[(j + 1) * V + i] = 0;
        idMap[(j + 1) * V + i + 1] = 0;
      }
    }
    let vcount = 0;
    for (let k = 0; k < idMap.length; k++) if (idMap[k] === 0) idMap[k] = vcount++;

    // Perimeter walks (ordered loops) for the skirts.
    const perimeter = (k) => {
      const lo = half - k, hi = half + k, pts = [];
      for (let i = lo; i < hi; i++) pts.push(i, lo);
      for (let j = lo; j < hi; j++) pts.push(hi, j);
      for (let i = hi; i > lo; i--) pts.push(i, hi);
      for (let j = hi; j > lo; j--) pts.push(lo, j);
      return pts;
    };
    const outerLoop = perimeter(half);
    const skirtVerts = outerLoop.length / 2;

    const total = vcount + skirtVerts;
    const pos = new Float32Array(total * 3);
    const skirt = new Float32Array(total);

    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const id = idMap[j * V + i];
        if (id < 0) continue;
        const x = i - half, z = j - half;
        pos[id * 3] = x;
        pos[id * 3 + 1] = 0;
        pos[id * 3 + 2] = z;
        if (hollow) {
          // Sink the innermost band so the finer level always wins the depth test.
          const m = Math.max(Math.abs(x), Math.abs(z));
          const t = clamp((m - holeHalf) / 3, 0, 1);
          skirt[id] = 0.055 * (1 - t);
        }
      }
    }

    // Preallocated: a push()-built index array for a 96² block is a 15 ms stall.
    const idx = new Uint32Array(cellCount * 6 + skirtVerts * 12);
    let w = 0;
    for (let c = 0; c < cellCount; c++) {
      const k = cells[c];
      const j = (k / res) | 0;
      const i = k - j * res;
      const a = idMap[j * V + i];
      const b = idMap[j * V + i + 1];
      const cc = idMap[(j + 1) * V + i];
      const d = idMap[(j + 1) * V + i + 1];
      idx[w++] = a; idx[w++] = cc; idx[w++] = b;
      idx[w++] = b; idx[w++] = cc; idx[w++] = d;
    }

    // Outer skirt. Emitted with both windings so it is correct from either face
    // without paying for DoubleSide across the whole terrain.
    const base = vcount;
    for (let p = 0; p < skirtVerts; p++) {
      const i = outerLoop[p * 2], j = outerLoop[p * 2 + 1];
      const id = base + p;
      pos[id * 3] = i - half;
      pos[id * 3 + 1] = 0;
      pos[id * 3 + 2] = j - half;
      skirt[id] = 1;
    }
    for (let p = 0; p < skirtVerts; p++) {
      const q = (p + 1) % skirtVerts;
      const su = idMap[outerLoop[p * 2 + 1] * V + outerLoop[p * 2]];
      const sv = idMap[outerLoop[q * 2 + 1] * V + outerLoop[q * 2]];
      const du = base + p, dv = base + q;
      idx[w++] = su; idx[w++] = du; idx[w++] = sv;
      idx[w++] = sv; idx[w++] = du; idx[w++] = dv;
      idx[w++] = su; idx[w++] = sv; idx[w++] = du;
      idx[w++] = sv; idx[w++] = dv; idx[w++] = du;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(total * 3), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(total * 2), 2));
    geo.setAttribute('aSkirt', new BufferAttribute(skirt, 1));
    geo.setIndex(new BufferAttribute(idx, 1));
    // The vertex shader moves everything, so a sphere fitted to these y = 0 positions
    // would sit 812 m under the ground and cull the terrain out from under the camera.
    // This is the last-resort fallback only: every ring mesh carries its own honest
    // sphere (see `_reboundRing`), and three consults the mesh's first.
    geo.computeBoundingSphere = function () {
      if (!this.boundingSphere) this.boundingSphere = new Sphere();
      this.boundingSphere.center.set(0, 0, 0);
      this.boundingSphere.radius = 1e7;
    };
    geo.computeBoundingSphere();
    return geo;
  }

  /** Build the two shared geometries, yielding between them. */
  async _buildClipGeometries(res) {
    this.blockGeo = this._makeClipGeometry(res, false);
    await nextTick();
    this.ringGeo = this._makeClipGeometry(res, true);
    await nextTick();
    this._ringRes = res;
  }

  _buildClipmap() {
    const tier = clamp(this.quality.tier | 0, 0, 3);
    const res = CLIPMAP_RES[tier];
    const levels = CLIPMAP_LEVELS[tier];
    // Cell size chosen so the outermost level always reaches past VIEW_DISTANCE.
    const c0 = [3.0, 2.0, 1.6, 1.4][tier];

    if (!this.blockGeo || this._ringRes !== res) {
      this.blockGeo?.dispose();
      this.ringGeo?.dispose();
      this.blockGeo = this._makeClipGeometry(res, false);
      this.ringGeo = this._makeClipGeometry(res, true);
      this._ringRes = res;
    }
    this.rings.length = 0;

    for (let k = 0; k < levels; k++) {
      const c = c0 * Math.pow(2, k);
      const mesh = new Mesh(k === 0 ? this.blockGeo : this.ringGeo, this.material);
      mesh.name = `terrain-l${k}`;
      mesh.scale.set(c, 1, c);
      // Six rings share two geometries, so the honest bound cannot live on the
      // geometry — but three tests `object.boundingSphere` ahead of the geometry's,
      // which lets each ring bound itself. `_reboundRing` fills it in on every snap.
      mesh.boundingSphere = new Sphere();
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      // Only the near levels cast; a 4 km ring in the shadow atlas buys nothing.
      mesh.castShadow = k <= 1 && !!this.quality.shadows;
      mesh.customDepthMaterial = this.depthMaterial;
      mesh.renderOrder = -10 + k;
      mesh.userData.cell = c;
      mesh.userData.snap = c * 2;
      this.rings.push(mesh);
      this.group.add(mesh);
    }
    this.group.updateMatrix();
  }

  /**
   * Re-fit one ring's bounding sphere to the ground it actually covers.
   *
   * The rings used to carry `frustumCulled = false` *and* a 10⁷ m geometry sphere —
   * belt and braces for the same intent. The intent was sound: the vertex shader
   * moves every vertex onto the heightfield, so the geometry's own y = 0 sphere is a
   * lie that sits 812 m below the terrain and would cull the ground out from under
   * the camera. But `frustumCulled = false` short-circuits the shadow pass as well as
   * the colour pass, so a cascade could never decline a ring it does not reach.
   *
   * The bound below is truthful: exact in XZ (the ring's footprint is known), sampled
   * in Y against the same heightfield the vertex shader reads, and padded for the
   * skirt and for what a lattice can miss between taps.
   */
  _reboundRing(m) {
    const c = m.userData.cell;
    const halfXZ = this._ringRes * 0.5 * c;
    const px = m.position.x, pz = m.position.z;

    let lo = Infinity, hi = -Infinity;
    const T = RING_BOUND_TAPS;
    for (let j = 0; j <= T; j++) {
      const z = pz + ((2 * j) / T - 1) * halfXZ;
      for (let i = 0; i <= T; i++) {
        const h = this.heightAt(px + ((2 * i) / T - 1) * halfXZ, z);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    // The lattice steps over whatever lies between its taps, so pad by the relief it
    // *did* see: flat plateau reports a couple of metres and gets a couple of metres
    // of slack, a ring straddling the gorge reports a hundred and gets a hundred.
    // Then the skirt, which hangs 3.5 cells below the ground and below HEIGHT_MIN
    // with it — clamp the ground first, subtract the skirt after.
    const slack = Math.min(RING_SLACK_MAX, 10 + (hi - lo) * 0.7 + halfXZ * 0.06);
    lo = Math.max(HEIGHT_MIN, lo - slack) - 3.5 * c;
    hi = Math.min(HEIGHT_MAX, hi + slack);

    const hy = (hi - lo) * 0.5;
    // Authored in object space: three scales the sphere by the largest axis of
    // matrixWorld — here `cell` — so the world radius is divided back out. The centre
    // needs no such treatment; the ring's y scale is 1 and its y offset is 0.
    // The 4% is not decoration: the radius is exactly the corner distance, so a corner
    // vertex sits *on* the surface of the sphere and any sampling error at all puts it
    // outside. A bound that is 4% loose culls the same things; a bound that is 0.2%
    // tight punches a hole in the ground on one frame in a thousand.
    m.boundingSphere.center.set(0, (lo + hi) * 0.5, 0);
    m.boundingSphere.radius =
      1.04 * Math.sqrt(2 * halfXZ * halfXZ + hy * hy) / Math.max(1, c);
  }

  /** Slide the rings onto the camera. Called every frame; must not allocate. */
  _snapRings(force) {
    const cam = this.ctx.camera;
    if (!cam) return;
    const cx = cam.position.x, cz = cam.position.z;
    for (let k = 0; k < this.rings.length; k++) {
      const m = this.rings[k];
      const s = m.userData.snap;
      const px = Math.round(cx / s) * s;
      const pz = Math.round(cz / s) * s;
      if (force || px !== m.position.x || pz !== m.position.z) {
        m.position.set(px, 0, pz);
        m.updateMatrix();
        m.updateMatrixWorld(true);
        // Only on a real shift: level 0 re-centres every few metres, level 5 every
        // ninety, and neither should be paying 121 height taps on a frame it did
        // not move.
        this._reboundRing(m);
      }
    }
  }

  // ==========================================================================
  //  8 — water
  // ==========================================================================

  _buildWater() {
    const river = this.river;
    const tail = Math.min(river.tail, river.n - 1);
    const CROSS = [-1, -0.62, -0.24, 0.24, 0.62, 1];
    const cols = CROSS.length;
    const rows = tail + 1;

    const pos = new Float32Array(rows * cols * 3);
    const attr = new Float32Array(rows * cols * 3);   // bankT, flowT, fade
    const idx = [];

    for (let i = 0; i <= tail; i++) {
      // Perpendicular from the local tangent.
      const a = Math.max(0, i - 1), b = Math.min(tail, i + 1);
      let tx = river.x[b] - river.x[a];
      let tz = river.z[b] - river.z[a];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const px = -tz, pz = tx;
      const wHalf = CHANNEL_HALF * river.width[i] * 1.9;
      const y = river.surface[i] + 0.06;
      const fadeHead = smoothstep(0, 6, i);
      const fadeTail = smoothstep(tail, tail - 10, i);
      for (let c = 0; c < cols; c++) {
        const o = (i * cols + c) * 3;
        pos[o] = river.x[i] + px * CROSS[c] * wHalf;
        pos[o + 1] = y;
        pos[o + 2] = river.z[i] + pz * CROSS[c] * wHalf;
        attr[o] = Math.abs(CROSS[c]);
        attr[o + 1] = i / tail;
        attr[o + 2] = Math.min(fadeHead, fadeTail);
      }
    }
    for (let i = 0; i < tail; i++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = i * cols + c, b = a + 1;
        const d = (i + 1) * cols + c, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aWater', new BufferAttribute(attr, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    const wq = clamp(this.quality.waterQuality | 0, 0, 2);
    const env = this.ctx.sky?.envMap || null;
    const useCube = !!(env && env.isCubeTexture);

    const uniforms = {
      tHeight: { value: this.heightTex },
      tMacro: { value: this.macroTex },
      tWaterN: { value: this.waterNormalTex },
      tEnv: { value: useCube ? env : null },
      uCoreRect: { value: this.uniforms.uCoreRect.value },
      uMacroRect: { value: this.uniforms.uMacroRect.value },
      uCoreUV: { value: this.uniforms.uCoreUV.value },
      uMacroUV: { value: this.uniforms.uMacroUV.value },
      uHeightRange: { value: this.uniforms.uHeightRange.value },
      uTime: { value: 0 },
      uSunDir: { value: this._sunDir },
      uSunColor: { value: new Color(0xffb173) },
      uSkyTint: { value: this.uniforms.uSkyTint.value },
      uDeepColor: { value: new Color(0x1d3a3a) },
      uShallowColor: { value: new Color(0x54705e) },
      uAerial: { value: this.uniforms.uAerial.value },
    };
    this.waterUniforms = uniforms;

    const defs = [
      `#define WATER_Q ${wq}`,
      this.encodedHeight ? '#define TERRAIN_ENCODED 1' : '',
      useCube ? '#define WATER_ENVCUBE 1' : '',
    ].join('\n');

    const mat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: defs + '\n' + /* glsl */`
attribute vec3 aWater;
varying vec3 vWPos;
varying vec3 vWater;
void main(){
  vWater = aWater;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
      fragmentShader: defs + '\n' + this._heightGLSL() + '\n' + glslNoise + '\n' + /* glsl */`
uniform sampler2D tWaterN;
#ifdef WATER_ENVCUBE
uniform samplerCube tEnv;
#endif
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTint;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec2 uAerial;
varying vec3 vWPos;
varying vec3 vWater;

vec3 skyProbe(vec3 dir){
#ifdef WATER_ENVCUBE
  return textureCube(tEnv, dir).rgb;
#else
  // Analytic stand-in: horizon haze grading into deeper sky, plus the sun's flare.
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 c = mix(uSkyTint * 1.12, uSkyTint * 0.52 + vec3(0.02, 0.05, 0.11), pow(up, 0.62));
  float sun = pow(max(dot(dir, uSunDir), 0.0), 26.0);
  return c + uSunColor * sun * 1.6;
#endif
}

void main(){
  vec3 V = normalize(cameraPosition - vWPos);
  float bank = vWater.x;
  float flowT = vWater.y;
  float fade = vWater.z;

  // Depth against the carved bed. This is the terrain heightfield, not a depth
  // buffer, so it is exact and costs nothing extra to be correct at the shoreline.
  float bed = kgHeight(vWPos.xz);
  float depth = max(vWPos.y - bed, 0.0);

  float t = uTime;
  vec2 flowDir = vec2(0.24, 1.0);
  vec2 uv1 = vWPos.xz * 0.42 + flowDir * t * 0.55;
  vec3 n1 = texture2D(tWaterN, uv1).xyz * 2.0 - 1.0;
  vec3 nrm = vec3(n1.x, 0.0, n1.y);
#if WATER_Q >= 2
  vec2 uv2 = vWPos.xz * 0.13 - flowDir * t * 0.21 + 0.37;
  vec3 n2 = texture2D(tWaterN, uv2).xyz * 2.0 - 1.0;
  nrm += vec3(n2.x, 0.0, n2.y) * 0.75;
  // Faster, choppier water where it is shallow and running over stones.
  vec2 uv3 = vWPos.xz * 0.95 + flowDir * t * 1.15;
  vec3 n3 = texture2D(tWaterN, uv3).xyz * 2.0 - 1.0;
  nrm += vec3(n3.x, 0.0, n3.y) * 0.45 * smoothstep(1.2, 0.15, depth);
#endif
  float chop = mix(0.28, 0.85, smoothstep(0.0, 1.0, flowT));
  vec3 N = normalize(vec3(nrm.x * chop, 1.0, nrm.z * chop));

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  fres = mix(0.03, 1.0, fres);

  // Transmission: shallow water shows the bed's tint, deep water goes green-black.
  vec3 through = mix(uShallowColor, uDeepColor, smoothstep(0.15, 2.6, depth));
  through *= mix(0.55, 1.0, smoothstep(0.0, 1.4, depth));

  vec3 col = through;
#if WATER_Q >= 1
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyProbe(R);
  col = mix(through, refl, clamp(fres, 0.0, 0.92));

  // Sun glitter — a tight specular lobe on the perturbed normal.
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  col += uSunColor * spec * 2.4;
#else
  col = mix(through, uSkyTint, 0.28 + fres * 0.25);
#endif

#if WATER_Q >= 1
  // Shoreline foam, driven by the depth difference against the bed.
  float shore = smoothstep(0.52, 0.02, depth);
  float band = fbm2(vWPos.xz * 1.6 + vec2(0.0, -t * 0.9), 3) * 0.5 + 0.5;
  float foam = shore * smoothstep(0.32, 0.75, band + shore * 0.35);
  foam += smoothstep(0.78, 1.0, bank) * 0.35 * band;
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.86, 0.88, 0.86), foam * 0.85);
#else
  float foam = 0.0;
#endif

  float alpha = mix(0.62, 0.95, clamp(depth * 0.8, 0.0, 1.0));
  alpha = max(alpha, foam);
  alpha *= fade * smoothstep(-0.05, 0.12, depth);

  // Same aerial perspective law as the ground, so the stream sits in the same air.
  float dist = length(vWPos - cameraPosition);
  float a = 1.0 - exp(-pow(max(dist - uAerial.x, 0.0) * uAerial.y, 1.18));
  col = mix(col, uSkyTint, a * 0.8);

  gl_FragColor = vec4(col, alpha);
}
`,
    });
    mat.name = 'terrain-water';
    try { this.ctx.sky?.applyFog?.(mat); } catch { /* optional */ }

    const mesh = new Mesh(geo, mat);
    mesh.name = 'stream';
    mesh.renderOrder = 4;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.water = mesh;
    this.waterMaterial = mat;
    this._waterQ = wq;
    this.group.add(mesh);
  }

  // ==========================================================================
  //  9 — distant ridge band
  // ==========================================================================

  /**
   * Populate one rank with peaks. Angular budget is handed out in uneven shares,
   * each share holding a massif and then a col, so nothing is evenly spaced. Every
   * peak gets its own apex exponent, its own bluntness (needle → dome → mesa) and
   * its own flank asymmetry — one steep face, one long tail, side chosen at random.
   */
  _ridgePeaks(cfg) {
    const rnd = makeRandom(TERRAIN_SEED ^ cfg.seed);
    const TAU = Math.PI * 2;
    const groups = cfg.massifs + ((rnd() * 2.4) | 0);

    const share = new Float64Array(groups);
    let total = 0;
    for (let g = 0; g < groups; g++) { share[g] = 0.45 + rnd() * 1.55; total += share[g]; }

    const peaks = [];
    let a0 = rnd() * TAU;
    for (let g = 0; g < groups; g++) {
      const width = (share[g] / total) * TAU;
      // The massif occupies a third to three quarters of its share; the rest is col.
      const span = width * (0.34 + rnd() * 0.44);
      const centre = a0 + width * (0.28 + rnd() * 0.44);
      const count = 2 + ((rnd() * 3.8) | 0);
      const gh = cfg.groupLo + rnd() * (cfg.groupHi - cfg.groupLo);
      const gid = rnd();
      for (let k = 0; k < count; k++) {
        // Jittered station inside the massif: never a metronome.
        const t = (k + 0.5 + (rnd() - 0.5) * 0.9) / count;
        const w = (span / count) * (0.85 + rnd() * 1.30);
        const asym = 1.35 + rnd() * 2.35;
        const flip = rnd() < 0.5;
        peaks.push({
          a: centre + (t - 0.5) * span,
          // Shoulder peaks sit lower than the massif's high point, but not reliably.
          h: gh * (0.50 + rnd() * 0.50) * (1 - Math.abs(t - 0.5) * 2 * 0.30 * rnd()),
          wl: flip ? w / asym : w,
          wr: flip ? w : w / asym,
          sharp: 0.85 + rnd() * 1.60,
          blunt: rnd() * rnd(),
          id: gid,
        });
      }
      a0 += width;
    }
    return peaks;
  }

  /** One peak's contribution at signed angular distance `d`. */
  _ridgePeak(p, d) {
    const w = d >= 0 ? p.wr : p.wl;
    const t = Math.abs(d) / w;
    if (t >= 1) return 0;
    const f = 1 - t;
    // Needle vs. table mountain, from the same two terms.
    const spike = Math.pow(f, p.sharp);
    const mesa = 1 - Math.pow(1 - f, 1.7 + p.blunt * 2.6);
    const b = p.blunt * 0.8;
    let v = spike * (1 - b) + mesa * b;
    // Soften the foot so a peak merges into its neighbours without a kink.
    if (f < 0.16) v *= smoothstep(0, 0.16, f);
    return p.h * v;
  }

  /**
   * Bake the three ridgelines into an RGBA texture: RG is a 16-bit height, B a
   * crest-relief term the shader lights with, A a per-massif identity so no two
   * mountains take exactly the same tint.
   */
  async _buildRidgeProfiles() {
    const W = RIDGE_W;
    const buf = new Uint8Array(W * RIDGE_ROWS * 4);
    const TAU = Math.PI * 2;
    let maxTop = -Infinity;

    for (let L = 0; L < RIDGE_LAYERS.length; L++) {
      const cfg = RIDGE_LAYERS[L];
      const peaks = this._ridgePeaks(cfg);
      const np = peaks.length;
      // Small enough that a cold, un-JITted block is well under 2 ms, so the 6 ms
      // yield check in _forRange can never overshoot the boot budget.
      const BLOCK = 48;
      const row = L * W;

      await this._forRange(Math.ceil(W / BLOCK), 'raising the far ranges', (b) => {
        const s0 = b * BLOCK, e0 = Math.min(W, s0 + BLOCK);
        for (let i = s0; i < e0; i++) {
          // Must match the shader: u = a/2π + 0.5, so column i sits at this angle.
          const a = ((i + 0.5) / W - 0.5) * TAU;
          const cx = Math.cos(a), cz = Math.sin(a);

          // The range itself: a smooth-max over the peak set, which is what turns
          // N separate profiles into one continuous crest with real saddles.
          let v = 0, ident = 0, best = 0;
          for (let k = 0; k < np; k++) {
            const p = peaks[k];
            const c = this._ridgePeak(p, wrapPi(a - p.a));
            if (c > best) { best = c; ident = p.id; }
            if (c > 0) v = smax(v, c, 0.045);
          }
          const relief = clamp(v * 0.85, 0, 1);

          // Sampling 2D noise around a circle keeps every term exactly periodic.
          v += cfg.baseAmp * (0.5 + 0.5 * noise.fbm2(cx * cfg.baseR + 11.7, cz * cfg.baseR - 4.3, 3));
          const local = Math.sqrt(clamp(v, 0, 2));
          v += noise.fbm2(cx * cfg.detR + 31.1, cz * cfg.detR + 7.9, 4) * cfg.detAmp * local;
          // Erosion notches: narrow V-cuts where the gully field crosses zero.
          const g = noise.fbm2(cx * cfg.gulR - 5.5, cz * cfg.gulR + 21.0, 2);
          const nk = Math.max(0, 1 - Math.abs(g) * 2.6);
          v -= nk * nk * nk * cfg.notch * local;

          // The rock rises to the north-west (WORLD.RIDGE_AZIMUTH); to the south-east
          // the bamboo valley falls away and only a low, drowned rank survives.
          const nw = -(Math.sin(a) + Math.cos(a)) * 0.70710678;
          const dirScale = lerp(cfg.dirLo, 1.0, smootherstep(-0.65, 0.92, nw));
          // No rank rings the horizon at a constant height: each one is present over
          // two or three broad zones and sinks away between them, so the three ranks
          // never all march across the same stretch of sky.
          const pres = 0.24 + 0.76 * smootherstep(-0.36, 0.32,
            noise.fbm2(cx * cfg.presR + cfg.presOff, cz * cfg.presR - cfg.presOff, 2));

          const metres = (cfg.lift + Math.max(0, v) * cfg.amp) * dirScale * pres;
          if (metres + cfg.soft > maxTop) maxTop = metres + cfg.soft;

          const enc = clamp((metres - RIDGE_LOW) / RIDGE_SPAN, 0, 0.9999847) * 255;
          const hi = Math.floor(enc);
          const o = (row + i) * 4;
          buf[o] = hi;
          buf[o + 1] = Math.round((enc - hi) * 255);
          buf[o + 2] = (relief * 255) | 0;
          buf[o + 3] = (clamp(ident, 0, 1) * 255) | 0;
        }
      });
      if (this._disposed) return;
    }

    // Padding row mirrors the last rank so a filtering slip cannot read garbage.
    buf.copyWithin(3 * W * 4, 2 * W * 4, 3 * W * 4);

    const tex = new DataTexture(buf, W, RIDGE_ROWS, RGBAFormat, UnsignedByteType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.wrapS = RepeatWrapping;          // the horizon wraps; the shader relies on it
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = NoColorSpace;
    tex.needsUpdate = true;
    this.ridgeTex = tex;
    this.ridgeMaxTop = maxTop;
  }

  /**
   * Beyond the clipmap, silhouette is all that matters. Three baked ridgelines on a
   * camera-locked cylinder, each parallaxing at its own rate, each pushed further
   * toward the sky colour. No billboards, no cones, no tiling.
   */
  _buildDistantBand() {
    const geo = new CylinderGeometry(5000, 5000, 2600, 96, 1, true);
    const base = WORLD.PLATEAU_HEIGHT + 40;
    const uniforms = {
      uSkyTint: { value: this.uniforms.uSkyTint.value },
      uCam: { value: new Vector3() },
      uBase: { value: base },
      tRidge: { value: this.ridgeTex },
      uRidgeCfg: { value: new Vector4(RIDGE_W, 1 / RIDGE_W, RIDGE_LOW, RIDGE_SPAN) },
      uMaxTop: { value: base + (this.ridgeMaxTop ?? 900) + 24 },
      uSunXZ: { value: new Vector2(0.7, -0.7) },
      // Palette-locked: warm rock takes the key, shadowed rock the cool sky bounce
      // of ARCHITECTURE §5 — never neutral grey.
      uRockWarm: { value: new Color(0x7a6a5c) },
      uRockCool: { value: new Color(0x53667f) },
    };
    this.bandUniforms = uniforms;

    const mat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      fog: false,
      vertexShader: /* glsl */`
varying vec3 vLocal;
varying float vWorldY;
void main(){
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,
      fragmentShader: glslNoise + '\n' + /* glsl */`
varying vec3 vLocal;
varying float vWorldY;
uniform vec3 uSkyTint;
uniform vec3 uCam;
uniform float uBase;
uniform sampler2D tRidge;
uniform vec4 uRidgeCfg;   // width, 1/width, low metre, span
uniform float uMaxTop;
uniform vec2 uSunXZ;
uniform vec3 uRockWarm;
uniform vec3 uRockCool;

/**
 * Read the baked ridgeline. NEAREST + a hand-rolled lerp, because the height is a
 * 16-bit pair and hardware filtering would blend the high and low bytes apart.
 * Returns (metres above base, crest relief, massif id, slope along the horizon).
 */
vec4 kgRidge(float u, float row){
  float p = u * uRidgeCfg.x - 0.5;
  float f = fract(p);
  float x0 = (floor(p) + 0.5) * uRidgeCfg.y;
  float rv = (row + 0.5) * 0.25;
  vec4 A = texture2D(tRidge, vec2(x0, rv));
  vec4 B = texture2D(tRidge, vec2(x0 + uRidgeCfg.y, rv));
  float ha = A.r + A.g * (1.0 / 255.0);
  float hb = B.r + B.g * (1.0 / 255.0);
  return vec4(
    uRidgeCfg.z + mix(ha, hb, f) * uRidgeCfg.w,
    mix(A.b, B.b, f),
    mix(A.a, B.a, f),
    (hb - ha) * uRidgeCfg.w);
}

void kgRank(float row, float u0, float tang, float par, float soft, float haze,
            float sunT, float h, inout vec3 col, inout float alpha){
  // Parallax: shift the sampling angle by the camera's tangential offset, scaled
  // by how far away this rank is meant to be.
  vec4 r = kgRidge(u0 + tang * par, row);
  float top = uBase + r.x;
  float m = smoothstep(top + soft, top - soft, h);
  if (m <= 0.0) return;

  // Which way this stretch of crest falls, and whether that face sees the sun.
  float lit = clamp(-r.w * 0.055 * sunT, -1.0, 1.0);
  vec3 rock = mix(uRockCool, uRockWarm, 0.5 + 0.5 * lit);
  rock *= 0.90 + 0.20 * r.z;              // per-massif identity
  rock *= 0.84 + 0.30 * r.y;              // crests catch more than cols

  // Mist pools below every crest — aerial perspective inside a single rank.
  float pool = smoothstep(top - 20.0, top - 430.0, h);
  vec3 lay = mix(rock, uSkyTint * 1.06, clamp(haze + (1.0 - haze) * pool * 0.72, 0.0, 1.0));
  col = mix(col, lay, m);
  alpha = max(alpha, m);
}

void main(){
  float h = vWorldY;
  // Cheap rejects first: most of this cylinder is sky or is under the terrain.
  if (h > uMaxTop || h < uBase - 940.0) discard;

  float a = atan(vLocal.x, vLocal.z);
  float u0 = a * 0.15915494 + 0.5;
  vec2 tangent = vec2(cos(a), -sin(a));
  float tang = dot(uCam.xz, tangent);
  float sunT = dot(tangent, uSunXZ);

  vec3 col = uSkyTint;
  float alpha = 0.0;

  // Back to front. Higher, hazier, slower-parallaxing ranks first.
  kgRank(0.0, u0, tang, ${RIDGE_LAYERS[0].par.toFixed(8)}, ${RIDGE_LAYERS[0].soft.toFixed(1)},
         ${RIDGE_LAYERS[0].haze.toFixed(2)}, sunT, h, col, alpha);
  kgRank(1.0, u0, tang, ${RIDGE_LAYERS[1].par.toFixed(8)}, ${RIDGE_LAYERS[1].soft.toFixed(1)},
         ${RIDGE_LAYERS[1].haze.toFixed(2)}, sunT, h, col, alpha);
  kgRank(2.0, u0, tang, ${RIDGE_LAYERS[2].par.toFixed(8)}, ${RIDGE_LAYERS[2].soft.toFixed(1)},
         ${RIDGE_LAYERS[2].haze.toFixed(2)}, sunT, h, col, alpha);

  // Fade the very bottom so the band never shows a hard cut under the terrain.
  alpha *= smoothstep(uBase - 900.0, uBase - 320.0, h);
  if (alpha < 0.004) discard;

  // Nothing in frame is a flat tint: a slow grain across the rock faces.
  col *= 0.97 + 0.06 * (fbm2(vec2(a * 140.0, h * 0.022), 2) * 0.5 + 0.5);
  gl_FragColor = vec4(col, alpha * 0.96);
}
`,
    });
    mat.name = 'distant-ridges';

    const mesh = new Mesh(geo, mat);
    mesh.name = 'distant-ridges';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = -20;
    mesh.position.set(0, WORLD.PLATEAU_HEIGHT + 40, 0);
    mesh.updateMatrix();
    this.band = mesh;
    this.bandMaterial = mat;
    this.group.add(mesh);
  }

  // ==========================================================================
  //  10 — physics, frame loop, quality
  // ==========================================================================

  _registerPhysics() {
    const p = this.ctx.physics;
    if (!p || typeof p.addStatic !== 'function') return;
    try {
      this.physicsHandle = p.addStatic({ type: 'heightfield', terrain: this, surface: 'ground' });
    } catch (err) {
      console.warn('[terrain] physics registration failed', err);
    }
  }

  /** Pull the sun and the sky tint from whoever owns them. Allocation-free. */
  _syncEnvironment() {
    const sky = this.ctx.sky, lighting = this.ctx.lighting;
    const sd = (sky && sky.sunDirection) || (lighting && lighting.sunDirection);
    if (sd && sd.isVector3) {
      this._sunDir.copy(sd).normalize();
    } else {
      const l = (lighting && lighting.sun) || (sky && sky.sun);
      if (l && l.isLight && l.position) {
        this._sunDir.copy(l.position);
        if (l.target && l.target.position) this._sunDir.sub(l.target.position);
        if (this._sunDir.lengthSq() > 1e-6) this._sunDir.normalize();
      }
    }

    const tint = (sky && sky.horizonColor && sky.horizonColor.isColor) ? sky.horizonColor
      : (this.ctx.scene.fog && this.ctx.scene.fog.color) ? this.ctx.scene.fog.color : null;
    if (tint) this.uniforms.uSkyTint.value.copy(tint);
  }

  update(dt, elapsed) {
    if (!this.material) return;
    this._elapsed = elapsed;
    this._snapRings(false);
    this._syncEnvironment();

    if (this.waterUniforms) this.waterUniforms.uTime.value = elapsed;

    // The ridge band rides with the camera so it never crosses the far plane; the
    // inter-layer parallax comes from uCam instead.
    if (this.band) {
      const cam = this.ctx.camera;
      this.bandUniforms.uCam.value.copy(cam.position);
      // Horizontal sun bearing, so the far ranges take warm light on the faces
      // turned toward it and stay cool-blue on the others.
      const sx = this._sunDir.x, sz = this._sunDir.z;
      const sl = Math.sqrt(sx * sx + sz * sz);
      if (sl > 1e-4) this.bandUniforms.uSunXZ.value.set(sx / sl, sz / sl);
      this.band.position.set(cam.position.x, WORLD.PLATEAU_HEIGHT + 40, cam.position.z);
      this.band.updateMatrix();
      this.band.updateMatrixWorld(true);
    }

    // The snow drift term needs the prevailing bearing only; WeatherSystem owns
    // the wind field itself (ARCHITECTURE §10) and this is a read, not a twin.
    const w = this.ctx.wind;
    if (w && w.direction && this.uniforms.uWindXZ) {
      const wx = w.direction.x, wz = w.direction.z;
      const wl = Math.sqrt(wx * wx + wz * wz);
      if (wl > 1e-4) this.uniforms.uWindXZ.value.set(wx / wl, wz / wl);
    }
  }

  applyQuality(q) {
    this.quality = q;
    const tier = clamp(q.tier | 0, 0, 3);

    // The heightfield itself is deliberately not regenerated: droplet erosion is a
    // multi-second job and a tier flip mid-fight must not stall the frame loop. The
    // rendering side — ring count, resolution, shadows, water — all re-tiers cleanly.
    const wantRes = CLIPMAP_RES[tier];
    const wantLevels = CLIPMAP_LEVELS[tier];
    if (this.rings.length !== wantLevels || this._ringRes !== wantRes) {
      for (const m of this.rings) this.group.remove(m);
      this.rings.length = 0;
      this._buildClipmap();
      this._snapRings(true);
    }
    for (let k = 0; k < this.rings.length; k++) {
      this.rings[k].castShadow = k <= 1 && !!q.shadows;
    }

    const aniso = Math.min(q.anisotropy || 4, this.ctx.engine?.capabilities?.anisotropy || 4);
    for (const key of ['tDirt', 'tStone', 'tCobble', 'tMoss', 'tDetailN']) {
      const t = this.uniforms?.[key]?.value;
      if (t && t.isTexture && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
    }

    if (this.water && this._waterQ !== (q.waterQuality | 0)) {
      this.group.remove(this.water);
      this.water.geometry.dispose();
      this.waterMaterial.dispose();
      this.water = null;
      this._buildWater();
    }
    this._waterQ = q.waterQuality | 0;
  }

  dispose() {
    this._disposed = true;
    // update() early-outs on a null material, so an in-flight frame after disposal
    // cannot touch freed GPU objects.
    const mat = this.material;
    this.material = null;
    this.ctx.scene.remove(this.group);
    for (const m of this.rings) this.group.remove(m);
    this.rings.length = 0;
    this.blockGeo?.dispose();
    this.ringGeo?.dispose();
    this.water?.geometry.dispose();
    this.band?.geometry.dispose();
    mat?.dispose();
    this.depthMaterial?.dispose();
    this.waterMaterial?.dispose();
    this.bandMaterial?.dispose();
    this.heightTex?.dispose();
    this.macroTex?.dispose();
    this.dataTex?.dispose();
    this.splatTex?.dispose();
    this.detailNormalTex?.dispose();
    this.waterNormalTex?.dispose();
    this.ridgeTex?.dispose();
    try { this.ctx.physics?.removeStatic?.(this.physicsHandle); } catch { /* optional */ }
  }

  // ==========================================================================
  //  11 — queries  (contractual; all allocation-free)
  // ==========================================================================

  /** Bilinear sample of a square Float32Array field, in grid coordinates. */
  _bilinear(field, n, fx, fz) {
    let x = fx, z = fz;
    if (x < 0) x = 0; else if (x > n - 1.0001) x = n - 1.0001;
    if (z < 0) z = 0; else if (z > n - 1.0001) z = n - 1.0001;
    const i = x | 0, j = z | 0;
    const tx = x - i, tz = z - j;
    const k = j * n + i;
    const h00 = field[k], h10 = field[k + 1];
    const h01 = field[k + n], h11 = field[k + n + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /**
   * Ground height in absolute metres ASL. Bilinear on the eroded core field inside
   * ±256 m, on the coarse macro field outside, crossfaded exactly the way the vertex
   * shader does it so collision and rendering never disagree.
   */
  heightAt(x, z) {
    if (!this.height) return WORLD.PLATEAU_HEIGHT;
    const macro = this._bilinear(
      this.macroHeight, this.macroN,
      (x + MACRO_HALF) / this.macroCell, (z + MACRO_HALF) / this.macroCell);
    const e = Math.max(Math.abs(x), Math.abs(z)) / CORE_EXTENT;
    const wc = 1 - smoothstep(0.40, 0.475, e);
    if (wc <= 0.001) return macro;
    const core = this._bilinear(
      this.height, this.gridN,
      (x + CORE_HALF) / this.cell, (z + CORE_HALF) / this.cell);
    return macro + (core - macro) * wc;
  }

  /**
   * Surface normal by central difference. Writes into `out` and returns it; with no
   * out-parameter it returns a shared vector — copy it before the next call.
   */
  normalAt(x, z, out) {
    const o = out || this._v1;
    const e = this.cell * 0.75;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    o.set(hl - hr, 2 * e, hd - hu);
    const len = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) || 1;
    o.x /= len; o.y /= len; o.z /= len;
    return o;
  }

  /** Steepness in radians, 0 = level. */
  slopeAt(x, z) {
    const e = this.cell * 0.75;
    const dhdx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dhdz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.atan(Math.sqrt(dhdx * dhdx + dhdz * dhdz));
  }

  /** Water surface elevation over the stream corridor; WATER_LEVEL far from it. */
  waterSurfaceAt(x, z) {
    if (!this.river) return this.waterLevel;
    const rv = closestOnPolyline(this.river, x, z);
    if (rv.d === Infinity) return this.waterLevel;
    return sampleStation(this.river.surface, Math.min(rv.station, this.river.tail), this.river.n);
  }

  /** True where the stream actually is — the corridor test matters, the valley floor
   *  also sits below WATER_LEVEL and is emphatically not water. */
  isWater(x, z) {
    if (!this.river) return false;
    const rv = closestOnPolyline(this.river, x, z);
    if (rv.d === Infinity || rv.station > this.river.tail) return false;
    const wHalf = CHANNEL_HALF * sampleStation(this.river.width, rv.station, this.river.n) * 1.9;
    if (rv.d > wHalf) return false;
    const surf = sampleStation(this.river.surface, rv.station, this.river.n);
    return this.heightAt(x, z) < surf - 0.02;
  }

  /** Water depth in metres, 0 outside the stream. Useful for wading/VFX. */
  waterDepthAt(x, z) {
    if (!this.isWater(x, z)) return 0;
    return Math.max(0, this.waterSurfaceAt(x, z) - this.heightAt(x, z));
  }

  /**
   * Footstep/FX surface. 'wood' is reserved for props (bridge decks, verandas) —
   * Level.js overrides it where it has laid timber; the terrain never returns it.
   */
  surfaceAt(x, z) {
    if (this.isWater(x, z)) return 'water';

    const N = this.gridN;
    const fx = (x + CORE_HALF) / this.cell;
    const fz = (z + CORE_HALF) / this.cell;
    if (this.splatBytes && fx >= 0 && fz >= 0 && fx <= N - 1 && fz <= N - 1) {
      const k = ((Math.round(fz) * N) + Math.round(fx)) * 4;
      const grass = this.splatBytes[k];
      const rock = this.splatBytes[k + 1];
      const gravel = this.splatBytes[k + 2];
      const moss = this.splatBytes[k + 3];
      const dirt = Math.max(0, 255 - (grass + rock + gravel + moss));
      let best = dirt, name = 'dirt';
      if (grass > best) { best = grass; name = 'grass'; }
      if (rock > best) { best = rock; name = 'stone'; }
      if (gravel > best) { best = gravel; name = 'gravel'; }
      if (moss > best) { best = moss; name = 'stone'; }
      return name;
    }

    // Outside the core field, mirror the shader's live rules.
    const slope = this.slopeAt(x, z);
    const h = this.heightAt(x, z);
    if (slope > 0.62 || h > 940) return 'stone';
    if (h < 890 && slope < 0.4) return 'grass';
    return 'dirt';
  }

  /** Snap a vector onto the ground, optionally offset along the surface. Mutates. */
  clampToGround(vec, offset = 0) {
    vec.y = this.heightAt(vec.x, vec.z) + offset;
    return vec;
  }

  /**
   * Averaged ground statistics over a disc — how Level.js decides whether a building
   * footprint or a spawn point is viable. Returns a shared object; read it, do not
   * keep it.
   */
  sampleRegion(x, z, radius = 4) {
    const out = this._region;
    let sum = 0, slopeSum = 0, water = 0;
    let min = Infinity, max = -Infinity;
    const RINGS = 2, SPOKES = 8;
    let count = 0;

    const consider = (px, pz) => {
      const h = this.heightAt(px, pz);
      sum += h; count++;
      if (h < min) min = h;
      if (h > max) max = h;
      slopeSum += this.slopeAt(px, pz);
      if (this.isWater(px, pz)) water++;
    };

    consider(x, z);
    for (let r = 1; r <= RINGS; r++) {
      const rad = (radius * r) / RINGS;
      for (let s = 0; s < SPOKES; s++) {
        const a = (s / SPOKES) * Math.PI * 2 + r * 0.4;
        consider(x + Math.cos(a) * rad, z + Math.sin(a) * rad);
      }
    }

    out.height = sum / count;
    out.slope = slopeSum / count;
    out.minHeight = min;
    out.maxHeight = max;
    out.water = water / count;
    out.relief = max - min;
    out.flat = out.relief < 0.35 && out.slope < 0.12;
    return out;
  }

  /**
   * Analytic downward ray against the heightfield — no mesh raycast, no BVH. Foot IK
   * calls this several times per character per frame, so it allocates nothing: the
   * result object is shared unless you pass your own.
   *
   * A start point up to 2 m below the surface still reports a hit at distance 0, which
   * is what a capsule controller wants when it has sunk into a slope.
   */
  raycastDown(x, y, z, maxDist = 250, out = this._hit) {
    const h = this.heightAt(x, z);
    const d = y - h;
    if (d > maxDist || d < -2) return null;
    out.point.set(x, h, z);
    this.normalAt(x, z, out.normal);
    out.distance = d > 0 ? d : 0;
    return out;
  }

  // ---------------------------------------------------------------- authoring aids

  /** The stream's polyline, for Props.js bridge placement and Foliage.js exclusion. */
  getRiverPath() { return this.river; }

  /** The approach spline, so Props.js can lay stone treads on the carved terraces. */
  getStairPath() { return this.stair; }

  /** Distance from the stream centreline, metres. Infinity when far outside it. */
  distanceToRiver(x, z) {
    if (!this.river) return Infinity;
    return closestOnPolyline(this.river, x, z).d;
  }

  /** Distance from the approach centreline, metres. Infinity when far outside it. */
  distanceToPath(x, z) {
    if (!this.stair) return Infinity;
    return closestOnPolyline(this.stair, x, z).d;
  }

  /** True inside the flattened shrine plateau (mask > 0). Mirrors Constants.js. */
  onPlateau(x, z) { return plateauMask(x, z) > 0; }

  /** True inside WORLD.PLAYABLE, with an optional margin. Re-exported for symmetry. */
  inPlayable(x, z, margin = 0) { return inPlayable(x, z, margin); }
}

export default Terrain;
