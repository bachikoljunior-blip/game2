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
  RepeatWrapping, ShaderMaterial, UnsignedByteType, Vector2, Vector3, Vector4, BackSide,
} from 'three';

import { noise, clamp, lerp, smoothstep, smootherstep, makeRandom, glslNoise } from '../core/Noise.js';
import { WORLD, plateauMask, inPlayable } from './Constants.js';

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
const GORGE_HALF = 34.0;

/** Encode range for the 8-bit height fallback. Generation is clamped into this. */
const HEIGHT_MIN = 480;
const HEIGHT_MAX = 1200;

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

// --------------------------------------------------------------------- helpers

/** Yield to the compositor. Boot is a long synthesis job; the watchdog is real. */
const nextTick = () =>
  new Promise((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(r, 0));
    else setTimeout(r, 0);
  });

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
 * Closest point on a polyline. Allocation-free — results land in the shared scratch.
 * `station` is a continuous node index, so per-node data (bed height) can be lerped.
 */
const _seg = { d: 0, station: 0 };
function closestOnPolyline(poly, px, pz) {
  let bestD2 = Infinity, bestT = 0, bestI = 0;
  const X = poly.x, Z = poly.z, n = poly.n;
  for (let i = 0; i < n - 1; i++) {
    const ax = X[i], az = Z[i];
    const ex = X[i + 1] - ax, ez = Z[i + 1] - az;
    const len2 = ex * ex + ez * ez;
    let t = len2 > 1e-9 ? ((px - ax) * ex + (pz - az) * ez) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + ex * t - px, cz = az + ez * t - pz;
    const d2 = cx * cx + cz * cz;
    if (d2 < bestD2) { bestD2 = d2; bestT = t; bestI = i; }
  }
  _seg.d = Math.sqrt(bestD2);
  _seg.station = bestI + bestT;
  return _seg;
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

/** Droplet budget per tier. The single biggest realism lever we have. */
const EROSION_DROPLETS = [2000, 6000, 14000, 20000];
/** Clipmap levels per tier (level 0 is the solid centre block, the rest are rings). */
const CLIPMAP_LEVELS = [5, 6, 7, 7];
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
      if ((i & 3) === 0 && now() - t0 > 10) {
        this._progress(base + (i / n), total, label);
        await nextTick();
        if (this._disposed) return;
        t0 = now();
      }
    }
    this._progress(base + 1, total, label);
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
    this._buildClipmap();
    this._progress(s++, TOTAL, 'carving the mountain');
    await nextTick();
    this._buildWater();
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
    const nwT = smootherstep(60, 600, ax);
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

  async _buildMacroField(base, total) {
    const N = this.macroN, cellM = this.macroCell, H = this.macroHeight;
    await this._forRange(N, 'raising the ridges', (j) => {
      const z = -MACRO_HALF + j * cellM;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        H[row + i] = this._macro(-MACRO_HALF + i * cellM, z);
      }
    }, base, total);
  }

  async _buildCoreField(base, total) {
    const N = this.gridN, cellM = this.cell, H = this.height;
    await this._forRange(N, 'carving the mountain', (j) => {
      const z = -CORE_HALF + j * cellM;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        H[row + i] = this._macro(-CORE_HALF + i * cellM, z);
      }
    }, base, total);
  }

  // ==========================================================================
  //  2 — authored carving
  // ==========================================================================

  async _buildSplines() {
    // Node spacing is deliberately finer than the coarsest grid cell so the carve
    // never staircases along the spline on LOW.
    this.stair = resampleSpline(STAIR_CTRL, 3);
    const river = resampleSpline(RIVER_CTRL, 4);
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
    this.waterLevel = sampleStation(river.surface, this.riverBridgeStation, river.n);

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
      const t = 1 - st.station / (this.stair.n - 1);   // node 0 is the bottom
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
      const target = bed + inner * inner * 1.1 + Math.pow(outer, 1.55) * 34;
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

    const BATCH = 256;
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
    for (let k = 0; k < FLOW.length; k++) FLOW[k] = Math.log(1 + FLOW[k]) * inv;
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

//__CHUNK3__
