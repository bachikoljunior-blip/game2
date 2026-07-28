/**
 * Materials.js — the procedural PBR texture + material library.
 *
 * Nothing in KAGEROU ships as an image file. Every albedo/normal/ORM texel here is
 * evaluated per-pixel at boot from the shared noise toolbox, packed into an
 * OffscreenCanvas, and handed to three as a CanvasTexture.
 *
 * Three things make this look like Ghost of Tsushima rather than like a noise demo:
 *
 *  1. MULTI-SCALE AUTHORING. Every surface is built from three separable stories —
 *     a coarse weathering field (where is it wet, sun-bleached, mossy, greasy),
 *     a mid-scale structure (planks, tile rows, weave, cobble cells) and a micro
 *     grain. Single-frequency noise reads as plastic; three octaves of *different
 *     kinds* of signal reads as a material.
 *  2. HEIGHT-FIRST. We compute a real height field per pixel and derive the normal
 *     map from it with a wrapping Sobel central difference. Normals faked from
 *     albedo luminance always look like a sticker; these do not.
 *  3. ROUGHNESS DOES THE WORK. Wet crevices go glossy, exposed high points polish
 *     out, dry weathered patches blow out to 0.95. Perceived realism lives here far
 *     more than in albedo.
 *
 * SEAMLESS TILING — the technique (binding, read before editing):
 *   All per-pixel noise runs through `Tiler`, a periodic gradient-noise lattice.
 *   Gradients are fetched with `hash3(ix mod Px, iy mod Py, seed)`, i.e. the integer
 *   lattice itself wraps on a torus of Px x Py cells. Because every octave doubles
 *   both the frequency AND the period (lacunarity is exactly 2, periods stay
 *   integer), every octave tiles, so the fbm/ridged/billow/warp built on top tile
 *   too. Domain warping is safe as well: the warp offsets are themselves 1-periodic
 *   in (u,v), so the composition stays 1-periodic. Cellular noise wraps its cell
 *   indices with the same modulus, which is exact rather than approximate.
 *   The only place we touch the shared Simplex directly is the *coarse* weathering
 *   fields, which are cheap (48x48 grids) and are made periodic with the classic
 *   four-corner mirror blend — see `tileFbm`. Mid-scale structure (planks, tile
 *   rows, weave) always uses an integer number of repeats across the tile, so it
 *   wraps by construction.
 *
 * Ownership: [materials]. Do not edit any other file from here.
 */

import {
  MeshStandardMaterial, MeshPhysicalMaterial, CanvasTexture, RepeatWrapping,
  SRGBColorSpace, NoColorSpace, LinearMipmapLinearFilter, LinearFilter,
  Vector2, DoubleSide, FrontSide,
} from 'three';

import {
  noise, hash2, hash3, makeRandom, clamp, lerp, smoothstep, smootherstep,
} from '../core/Noise.js';

import { TIER } from '../core/Quality.js';

// ---------------------------------------------------------------- tuning knobs

/** Longest we are allowed to hold the main thread inside one generation slice. */
const CHUNK_MS = 11;

/**
 * Resolution caps. `quality.textureSize` is the ceiling we are allowed to use;
 * we deliberately sit under it. A 256px tile with 8x anisotropy, a shared
 * high-frequency detail normal and a sane repeat count reads sharper on a phone
 * than a 1024px tile stretched over a whole wall — and it keeps us inside the
 * 48 MB texture budget with room for the sky/env targets.
 */
const HERO_CAP = 512;        // cedar / stone / steel / vermilion, doubled on ULTRA
const PROP_CAP = 256;

// ------------------------------------------------------------------- palette
// ARCHITECTURE.md §5. Authored in sRGB because albedo canvases are tagged sRGB.

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const PAL = {
  cedar:      C(0x5a4436), cedarHeart: C(0x3b2a1e), cedarWarm: C(0x7a5c42),
  silver:     C(0x9c968b), grime:      C(0x2a2620), algae:     C(0x556247),
  vermilion:  C(0xc8321e), vermDeep:   C(0x8e2114), vermHot:   C(0xd9502f),
  vermAged:   C(0x6d2318),
  moss:       C(0x4e6b3c), mossDeep:   C(0x2f4426), mossDry:   C(0x7c8a4e),
  stone:      C(0x8b8778), stoneDark:  C(0x55534b), stoneWarm: C(0xa39a86),
  quartz:     C(0xd8d4c8), biotite:    C(0x2b2a28),
  clay:       C(0x6b5a4c), kawara:     C(0x4a5058), kawaraLit: C(0x6d747c),
  earth:      C(0x574434), earthDry:   C(0x8a7358), earthWet:  C(0x2e241b),
  leaf:       C(0x7d5a2c), leafRed:    C(0x8c4520),
  shikkui:    C(0xe6e2d8), shikkuiDim: C(0xbdb8ab),
  washi:      C(0xefe9da), washiFibre: C(0xdcd2be),
  rush:       C(0xc2b075), rushOld:    C(0x9a8b57), tatamiHem: C(0x241f2c),
  steel:      C(0xc9d3dc), steelJi:    C(0x9aa6b2), hamon:     C(0xe6ecf2),
  blued:      C(0x2a2f36), bluedHot:   C(0x4a4038), rust:      C(0x7b442a),
  gold:       C(0xc9a227), goldHot:    C(0xf0d47a), goldTarn:  C(0x6f5a22),
  bole:       C(0x7a2f1c),
  indigo:     C(0x25384f), indigoFade: C(0x5b7186), indigoDeep: C(0x141f2e),
  crimson:    C(0x8e1f22), crimsonFade: C(0xb8514a),
  leather:    C(0x1d1713), leatherHi:  C(0x3d3128),
  bark:       C(0x4a3d31), barkPale:   C(0x8d8272),
  bamboo:     C(0x8f9a52), bambooOld:  C(0xb9b47e), bambooNode: C(0x6d7239),
  straw:      C(0xc4a86a), strawDim:   C(0x8b7442),
  blood:      C(0x7a0d12), bloodDark:  C(0x3a0508), bloodEdge: C(0xa82b22),
};

// ------------------------------------------------------- periodic noise lattice

const GN = 256;
const GX = new Float32Array(GN);
const GY = new Float32Array(GN);
for (let i = 0; i < GN; i++) {
  const a = (i / GN) * Math.PI * 2;
  GX[i] = Math.cos(a); GY[i] = Math.sin(a);
}

const wrapi = (v, p) => { const m = v % p; return m < 0 ? m + p : m; };

/**
 * Periodic gradient noise + the fractal stack built on it. Every method takes
 * (u, v) in [0,1) and a *cell count* per axis; the lattice wraps on that count,
 * which is what makes the whole library seamlessly tileable.
 */
class Tiler {
  constructor(seed) {
    this.seed = seed | 0;
    this.rnd = makeRandom(seed);
    this._w = { f1: 0, f2: 0, id: 0 };
  }

  /** One octave. x/y are already in lattice-cell units; px/py are the periods. */
  n2(x, y, px, py) {
    const s = this.seed;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const x0 = wrapi(xi, px), y0 = wrapi(yi, py);
    const x1 = wrapi(xi + 1, px), y1 = wrapi(yi + 1, py);
    const g00 = ((hash3(x0, y0, s) * GN) | 0) & (GN - 1);
    const g10 = ((hash3(x1, y0, s) * GN) | 0) & (GN - 1);
    const g01 = ((hash3(x0, y1, s) * GN) | 0) & (GN - 1);
    const g11 = ((hash3(x1, y1, s) * GN) | 0) & (GN - 1);
    const n00 = GX[g00] * fx + GY[g00] * fy;
    const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
    const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
    const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
    const su = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sv = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + su * (n10 - n00);
    const b = n01 + su * (n11 - n01);
    return (a + sv * (b - a)) * 1.42;
  }

  /** Anisotropic fbm — separate cell counts per axis give stretched grain. */
  fbmA(u, v, pu, pv, oct = 4, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * this.n2(u * pu * f, v * pv * f, pu * f, pv * f);
      n += a; a *= gain; f *= 2;
    }
    return s / n;
  }

  fbm(u, v, p, oct = 4, gain = 0.5) { return this.fbmA(u, v, p, p, oct, gain); }

  /** Ridged multifractal — bark fissures, rock crest lines. */
  ridgedA(u, v, pu, pv, oct = 4) {
    let a = 0.5, f = 1, s = 0, n = 0, prev = 1;
    for (let o = 0; o < oct; o++) {
      let r = 1 - Math.abs(this.n2(u * pu * f, v * pv * f, pu * f, pv * f));
      r *= r; r *= prev; prev = r;
      s += a * r; n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  }

  /** Billow |noise| — moss cushions, cloud-like clumping. */
  billowA(u, v, pu, pv, oct = 3) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * Math.abs(this.n2(u * pu * f, v * pv * f, pu * f, pv * f));
      n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  }

  /**
   * Domain-warped fbm — same shape as `noise.warp2`, rebuilt on the periodic
   * lattice so it still tiles. This is the single highest-value trick for making
   * wood grain, moss, rust and marbling stop looking procedural.
   */
  warpA(u, v, pu, pv, strength = 0.6, oct = 3) {
    const qx = this.fbmA(u, v, pu, pv, 2);
    const qy = this.fbmA(u + 0.37, v + 0.71, pu, pv, 2);
    return this.fbmA(u + strength * qx, v + strength * qy, pu, pv, oct);
  }

  /**
   * Periodic cellular noise. `.f2 - .f1` is the crack/grout signal.
   * WARNING: the return value is a per-Tiler scratch object, so consume the fields
   * you need before the next worleyA call — holding two results at once aliases.
   */
  worleyA(u, v, pu, pv, jitter = 1.0) {
    const x = u * pu, y = v * pv;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let f1 = 8, f2 = 8, id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = wrapi(xi + i, pu), cy = wrapi(yi + j, pv);
        const ox = hash3(cx, cy, this.seed) * jitter + (1 - jitter) * 0.5;
        const oy = hash3(cx + 911, cy + 733, this.seed) * jitter + (1 - jitter) * 0.5;
        const dx = i + ox - xf, dy = j + oy - yf;
        const d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; id = hash3(cx * 31 + 7, cy * 17 + 3, this.seed); }
        else if (d < f2) { f2 = d; }
      }
    }
    const w = this._w;
    w.f1 = Math.sqrt(f1); w.f2 = Math.sqrt(f2); w.id = id;
    return w;
  }
}

// ------------------------------------------------------------- coarse fields

/**
 * Large-scale weathering is smooth by definition, so it is wasteful to evaluate it
 * per pixel. We bake it to a small grid and bilerp. This is also the one place we
 * call the shared Simplex directly — made periodic by the four-corner mirror blend.
 */
function tileFbm(u, v, s, oct = 4, ox = 0, oy = 0) {
  const x = u * s + ox, y = v * s + oy;
  const a = noise.fbm2(x, y, oct), b = noise.fbm2(x - s, y, oct);
  const c = noise.fbm2(x, y - s, oct), d = noise.fbm2(x - s, y - s, oct);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function tileWarp(u, v, s, str = 0.7, oct = 4, ox = 0, oy = 0) {
  const x = u * s + ox, y = v * s + oy;
  const a = noise.warp2(x, y, str, oct), b = noise.warp2(x - s, y, str, oct);
  const c = noise.warp2(x, y - s, str, oct), d = noise.warp2(x - s, y - s, str, oct);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function coarse(n, fn) {
  const a = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) a[j * n + i] = fn(i / n, j / n);
  }
  return { a, n };
}

/** Smooth wrapped bilinear fetch from a coarse field, remapped to 0..1. */
function cs(field, u, v) {
  const n = field.n, a = field.a;
  const x = u * n, y = v * n;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const x0 = wrapi(xi, n), y0 = wrapi(yi, n);
  const x1 = wrapi(xi + 1, n), y1 = wrapi(yi + 1, n);
  const su = fx * fx * (3 - 2 * fx), sv = fy * fy * (3 - 2 * fy);
  const t = lerp(
    lerp(a[y0 * n + x0], a[y0 * n + x1], su),
    lerp(a[y1 * n + x0], a[y1 * n + x1], su), sv,
  );
  return t * 0.5 + 0.5;
}

// ------------------------------------------------------------- colour helpers

/** Scratch surface record — one per pixel, never allocated inside the loop. */
const S = { r: 0, g: 0, b: 0, a: 1, h: 0.5, ro: 0.7, ao: 1, me: 0 };

function setc(s, c) { s.r = c[0]; s.g = c[1]; s.b = c[2]; }
function mixc(s, c, t) {
  if (t <= 0) return;
  const k = t > 1 ? 1 : t;
  s.r += (c[0] - s.r) * k; s.g += (c[1] - s.g) * k; s.b += (c[2] - s.b) * k;
}
function scalec(s, k) { s.r *= k; s.g *= k; s.b *= k; }
/** Push hue without a full HSL round-trip: rotate R/B against G. */
function tint(s, dr, dg, db, k) { s.r += dr * k; s.g += dg * k; s.b += db * k; }

/** Toroidal delta — used by every sparse analytic feature so blobs wrap. */
const dwrap = (a) => a - Math.round(a);

/**
 * Symmetric edge band. A monotonic v-ramp (grime rising from the ground line)
 * cannot tile, so the band is mirrored about v = 0.5: staining at the sill AND
 * under the eave — which is what a wall under a deep Japanese roof looks like.
 */
const vband = (v, w) => smoothstep(w, 0, Math.min(v, 1 - v) * 2);

/**
 * Per-cell randomness that respects the tile period. Hashing the RAW index makes
 * cell 0 and cell N different, which is a one-texel colour step straight down the
 * seam; hashing the WRAPPED index is the fix.
 */
const cellRnd = (i, p, salt) => hash2(wrapi(i, p) * 31 + salt, salt * 17 + 3);
const cellRnd2 = (i, j, pi, pj, salt) => hash3(wrapi(i, pi), wrapi(j, pj), salt);

// ------------------------------------------------------------ canvas plumbing

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch { /* Safari < 16.4 */ }
  }
  const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!c) throw new Error('Materials: no canvas backend available');
  c.width = w; c.height = h;
  return c;
}

function makeTexture(canvas, srgb, aniso) {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = aniso;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;   // §4: albedo only
  tex.needsUpdate = true;
  return tex;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------ material makers

/**
 * ORM convention (glTF): R = AO, G = roughness, B = metalness, A = height.
 * three reads exactly those channels for aoMap/roughnessMap/metalnessMap, so one
 * texture feeds three slots and costs one upload. Alpha carries the height field
 * for anyone downstream who wants parallax or height-blended decals.
 */
function pbr(maps, o = {}) {
  const m = new MeshStandardMaterial({
    map: maps.albedo,
    normalMap: maps.normal,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    aoMap: maps.orm,
    roughness: 1,
    metalness: 1,
    color: o.color !== undefined ? o.color : 0xffffff,
    side: o.side || FrontSide,
    transparent: !!o.transparent,
    depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
    alphaTest: o.alphaTest || 0,
  });
  m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  m.aoMapIntensity = o.ao ?? 1;
  if (o.envInt !== undefined) m.envMapIntensity = o.envInt;
  return m;
}

function pbrPhys(maps, o = {}) {
  const m = new MeshPhysicalMaterial({
    map: maps.albedo,
    normalMap: maps.normal,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    aoMap: maps.orm,
    roughness: 1,
    metalness: 1,
    color: o.color !== undefined ? o.color : 0xffffff,
    side: o.side || FrontSide,
    transparent: !!o.transparent,
  });
  m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  m.aoMapIntensity = o.ao ?? 1;
  if (o.clearcoat !== undefined) m.clearcoat = o.clearcoat;
  if (o.clearcoatRoughness !== undefined) m.clearcoatRoughness = o.clearcoatRoughness;
  if (o.anisotropy !== undefined) m.anisotropy = o.anisotropy;
  if (o.anisotropyRotation !== undefined) m.anisotropyRotation = o.anisotropyRotation;
  if (o.sheen !== undefined) m.sheen = o.sheen;
  if (o.sheenRoughness !== undefined) m.sheenRoughness = o.sheenRoughness;
  if (o.sheenColor !== undefined) m.sheenColor.setHex(o.sheenColor);
  if (o.envInt !== undefined) m.envMapIntensity = o.envInt;
  return m;
}

// =============================================================================
//                                 RECIPES
// Each entry owns one material. `setup` bakes the coarse weathering story once,
// `shade` runs per pixel and fills the scratch record, `mat` wires the textures.
// =============================================================================

const RECIPES = [];

// ------------------------------------------------------------------- 杉 cedar
// Weathered vertical planking. Six boards across the tile (integer => wraps).
// Story: silvering from sun and rain on the exposed face, algae creeping up from
// the ground line, latewood rings standing proud as the soft earlywood erodes,
// checks splitting along the grain, resin-dark knots.
RECIPES.push({
  key: 'cedar', label: '杉 weathered cedar planking', seed: 1101, hero: true, k: 1,
  setup(t, res) {
    const rnd = makeRandom(4211);
    const knots = [];
    for (let i = 0; i < 13; i++) {
      knots.push({
        x: rnd(), y: rnd(),
        r: 0.010 + rnd() * 0.022,
        s: rnd(), swirl: 7 + rnd() * 9,
      });
    }
    return {
      knots,
      hf: Math.max(24, res >> 2),
      wear: coarse(48, (u, v) => tileWarp(u, v, 2.6, 0.8, 4)),
      damp: coarse(48, (u, v) => tileFbm(u, v, 3.4, 4, 31.7, 12.3)),
      bio: coarse(48, (u, v) => tileFbm(u, v, 5.0, 3, 77.1, 5.9)),
    };
  },
  shade(u, v, s, c, t) {
    const PLANKS = 6;
    // The +0.37 phase keeps a plank groove off the tile seam; a groove landing
    // exactly on the wrap is the single most legible tell that a wall is tiled.
    const pu = u * PLANKS + 0.37, pid = Math.floor(pu), pf = pu - pid;
    const po = cellRnd(pid, PLANKS, 17);
    const po2 = cellRnd(pid, PLANKS, 29);
    const vv = v + po * 0.77;

    // --- mid scale: grain flow, rings, checks -------------------------------
    const flow = t.warpA(u, vv, 8, 2, 0.55, 3);
    const ringPhase = pf * (3.4 + po2 * 4.2) + flow * 3.6 + po * 5.7;
    let ring = Math.abs((ringPhase - Math.floor(ringPhase)) * 2 - 1);
    ring = smoothstep(0.10, 0.92, ring);
    const fine = t.fbmA(u, vv, c.hf, Math.max(3, c.hf >> 5), 2) * 0.5 + 0.5;
    const cw = t.worleyA(u, vv, 26, 4, 1.0);
    const split = 1 - smoothstep(0.0, 0.055, cw.f2 - cw.f1);

    // --- structure: plank gaps and butt joints ------------------------------
    const gap = Math.min(smoothstep(0, 0.028, pf), smoothstep(0, 0.028, 1 - pf));
    const bu = (v + po * 0.37) * 3;
    const bf = bu - Math.floor(bu);
    const joint = Math.min(smoothstep(0, 0.018, bf), smoothstep(0, 0.018, 1 - bf));

    // --- coarse story -------------------------------------------------------
    const wear = clamp(cs(c.wear, u, v) * 1.25 - 0.12, 0, 1);
    const damp = cs(c.damp, u, v);
    const ground = vband(v, 0.34);                        // grime at sill and eave
    const bio = clamp(cs(c.bio, u, v) * (0.35 + ground * 1.4) * (0.4 + damp), 0, 1);

    let h = 0.66 + (po - 0.5) * 0.055;
    h -= (1 - gap) * 0.24;
    h -= (1 - joint) * 0.11;
    h -= ring * 0.055 * (0.4 + wear);
    h += (fine - 0.5) * 0.035;
    h -= split * 0.11 * (0.3 + wear * 0.9);

    // --- albedo -------------------------------------------------------------
    setc(s, PAL.cedarWarm);
    mixc(s, PAL.cedarHeart, ring * 0.72);
    mixc(s, PAL.cedar, 0.25 + po2 * 0.35);
    tint(s, 0.045, 0.012, -0.030, (fine - 0.5) * 1.6 + (po - 0.5) * 0.5);  // hue drift
    mixc(s, PAL.silver, wear * (0.30 + 0.55 * (1 - ground)));
    mixc(s, PAL.grime, (1 - gap) * 0.55 + (1 - joint) * 0.3 + ground * 0.22 * (1 - wear * 0.5));
    mixc(s, PAL.algae, bio * 0.55);
    mixc(s, PAL.cedarHeart, split * 0.55);

    let ro = 0.60 + ring * 0.10 + wear * 0.28 - (fine - 0.5) * 0.10;
    ro = lerp(ro, 0.95, (1 - gap) * 0.75);
    ro = lerp(ro, 0.93, split * 0.7);
    let ao = 1 - (1 - gap) * 0.60 - (1 - joint) * 0.32 - split * 0.34 - bio * 0.18;

    // --- sparse analytic knots (wrapped) ------------------------------------
    const kn = c.knots;
    for (let i = 0; i < kn.length; i++) {
      const k = kn[i];
      const dx = dwrap(u - k.x), dy = dwrap(v - k.y) * 0.55;
      const d2 = dx * dx + dy * dy;
      const rr = k.r * 2.6;
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) / k.r;
      const core = 1 - smoothstep(0.55, 1.05, d);
      const halo = (1 - smoothstep(1.0, 2.6, d)) * (1 - core);
      const swirl = Math.abs(Math.sin(d * k.swirl + k.s * 6.28));
      mixc(s, PAL.cedarHeart, core * 0.9 + halo * swirl * 0.45);
      tint(s, 0.05, -0.01, -0.04, core * 0.8);
      h -= core * 0.06 - halo * swirl * 0.012;
      ro = lerp(ro, 0.30, core * 0.8);                 // resin stays glossy
      ao -= core * 0.20 + halo * swirl * 0.06;
    }

    // Wet crevices read glossier than the exposed face — this sells the rain.
    const wet = clamp((0.72 - h) * 2.2, 0, 1) * damp;
    ro = lerp(ro, 0.24, wet * 0.7);
    scalec(s, 1 - wet * 0.30);

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.18, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.15, ao: 1.0 }); },
});

// ------------------------------------------------------------- 梁 cedar beam
// Structural timber, hand-adzed. Facets are worley cells quantised to a plane, so
// the light breaks across them in flat planes the way a chona-finished beam does.
RECIPES.push({
  key: 'cedarBeam', label: '梁 adze-cut structural timber', seed: 1307, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(16, res >> 2),
      soot: coarse(48, (u, v) => tileWarp(u, v, 2.2, 0.9, 4, 3.3, 8.1)),
      wear: coarse(48, (u, v) => tileFbm(u, v, 3.0, 4, 19.4, 2.2)),
    };
  },
  shade(u, v, s, c, t) {
    // Beams run horizontally: grain stretched along u.
    const flow = t.warpA(u, v, 3, 12, 0.5, 3);
    const ringPhase = v * 9 + flow * 4.2;
    let ring = Math.abs((ringPhase - Math.floor(ringPhase)) * 2 - 1);
    ring = smoothstep(0.08, 0.95, ring);
    const fine = t.fbmA(u, v, Math.max(6, c.hf >> 4), c.hf, 2) * 0.5 + 0.5;

    // Adze facets: cell id quantises a tilt, f1 gives the scoop within the facet.
    const fc = t.worleyA(u, v, 9, 5, 0.85);
    const facet = fc.f1;
    const tilt = (fc.id - 0.5);
    const edge = 1 - smoothstep(0.0, 0.10, fc.f2 - fc.f1);

    const soot = clamp(cs(c.soot, u, v) * 1.3 - 0.2, 0, 1);
    const wear = cs(c.wear, u, v);

    let h = 0.70 + tilt * 0.10 - facet * 0.16 - edge * 0.10;
    h -= ring * 0.03;
    h += (fine - 0.5) * 0.03;

    setc(s, PAL.cedarHeart);
    mixc(s, PAL.cedar, 0.35 + tilt * 0.30 + (fine - 0.5) * 0.5);
    mixc(s, PAL.cedarWarm, ring * 0.22 * wear);
    tint(s, 0.03, 0.005, -0.025, (tilt + (fine - 0.5)) * 0.8);
    mixc(s, PAL.grime, soot * 0.62);                    // hearth soot on the underside
    scalec(s, 0.86 + wear * 0.22);

    let ro = 0.66 + ring * 0.08 + soot * 0.20 - facet * 0.10;
    ro = lerp(ro, 0.42, (1 - facet) * 0.35 * (1 - soot));  // facet crests burnished
    const ao = 1 - edge * 0.35 - facet * 0.18 - soot * 0.12;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.10, 1);
    s.ao = clamp(ao, 0.25, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.35 }); },
});

// --------------------------------------------------------------- 朱 vermilion
// Torii lacquer. Urushi over a cedar substrate: deep saturated red, a hard
// specular film, an age-crazing net, and chips that punch through to bare wood.
RECIPES.push({
  key: 'vermilion', label: '朱 lacquered torii red', seed: 1511, hero: true, k: 1,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      chip: coarse(56, (u, v) => tileWarp(u, v, 4.2, 0.9, 4, 6.1, 2.7)),
      sun: coarse(48, (u, v) => tileFbm(u, v, 2.2, 3, 44.0, 9.5)),
      dust: coarse(48, (u, v) => tileFbm(u, v, 5.5, 4, 12.0, 61.0)),
    };
  },
  shade(u, v, s, c, t) {
    // Posts are vertical: substrate grain varies fast across u.
    const grain = t.fbmA(u, v, 56, 5, 3);
    const craze = t.worleyA(u, v, c.hf >> 1, c.hf >> 1, 1.0);
    const crackLine = 1 - smoothstep(0.0, 0.040, craze.f2 - craze.f1);
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;

    const chipF = cs(c.chip, u, v);
    const chip = smoothstep(0.66, 0.74, chipF);                    // bare wood
    const rim = smoothstep(0.60, 0.66, chipF) * (1 - chip);        // lifted lacquer lip
    const sun = cs(c.sun, u, v);
    const dust = cs(c.dust, u, v);

    let h = 0.74 + grain * 0.012 * (1 - chip) + (micro - 0.5) * 0.012;
    h -= crackLine * 0.020 * (0.4 + sun);
    h -= chip * 0.055;
    h += rim * 0.022;

    // Colour: never a flat tint — the film thins on the sunward side and the
    // shaded side keeps the deep oxblood of thick urushi.
    setc(s, PAL.vermilion);
    mixc(s, PAL.vermDeep, clamp(0.55 - sun * 0.9, 0, 1));
    mixc(s, PAL.vermHot, clamp(sun * 0.85 - 0.15, 0, 1) * 0.75);
    tint(s, 0.030, -0.010, -0.008, grain * 1.2 + (micro - 0.5) * 0.8);
    mixc(s, PAL.vermAged, vband(v, 0.38) * 0.35 + crackLine * 0.30);
    mixc(s, PAL.cedar, chip * 0.92);
    mixc(s, PAL.cedarHeart, chip * (grain * 0.5 + 0.25));
    mixc(s, PAL.grime, dust * 0.18 * (1 - sun * 0.6) + vband(v, 0.24) * 0.22);

    // Lacquer is the glossiest thing in the scene until it crazes or chips.
    let ro = 0.13 + crackLine * 0.32 + (1 - sun) * 0.06 + dust * 0.10;
    ro = lerp(ro, 0.82, chip);
    ro = lerp(ro, 0.55, rim * 0.6);
    const ao = 1 - crackLine * 0.16 - chip * 0.28 - rim * 0.10;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.35, 1);
    s.me = 0;
  },
  mat(maps) {
    const m = pbrPhys(maps, {
      ns: 0.85, clearcoat: 0.92, clearcoatRoughness: 0.10, envInt: 1.15,
    });
    m.clearcoatNormalMap = maps.normal;
    m.clearcoatNormalScale = new Vector2(0.35, 0.35);
    return m;
  },
});

// ------------------------------------------------------------- 瓦 roof tile
// Kawara. Four cover-tile columns across the tile and five overlapping courses
// down it, both integer, so the profile wraps. The height field is an honest
// semi-cylinder plus the lap step; moss collects in the pan valleys where the
// rain sits, which is where the whole roof reads as old rather than new.
RECIPES.push({
  key: 'roofTile', label: '瓦 kawara clay tile', seed: 1709, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(16, res >> 2),
      moss: coarse(56, (u, v) => tileWarp(u, v, 3.4, 0.85, 4, 2.2, 7.7)),
      fire: coarse(48, (u, v) => tileFbm(u, v, 2.4, 3, 55.3, 21.1)),
    };
  },
  shade(u, v, s, c, t) {
    const COLS = 4, ROWS = 5;
    const cu = u * COLS, ci = Math.floor(cu), cf = cu - ci;
    const rv = v * ROWS, ri = Math.floor(rv), rf = rv - ri;
    const tileId = cellRnd2(ci, ri, COLS, ROWS, 13);

    // Cross-section: rounded cover ridge, then a shallow concave pan.
    let prof, valley;
    if (cf < 0.42) {
      const x = cf / 0.21 - 1;                      // -1..1 across the ridge
      prof = Math.sqrt(Math.max(0, 1 - x * x)) * 0.40 + 0.42;
      valley = 0;
    } else {
      const x = (cf - 0.42) / 0.58;
      prof = 0.30 + 0.075 * (1 - Math.cos(x * Math.PI * 2)) * 0.5;
      valley = Math.sin(x * Math.PI);               // 1 in the middle of the pan
    }
    // Course lap: each tile sits on the one below, so its head edge steps up.
    const lap = smoothstep(0.0, 0.055, rf);
    const lapShadow = 1 - lap;
    const nose = 1 - smoothstep(0.90, 1.0, rf);     // rounded drip nose
    let h = prof * (0.94 + tileId * 0.10) + lap * 0.045 - (1 - nose) * 0.05;

    // Clay body: pressed grain plus kiln flashing.
    const clayN = t.fbmA(u, v, c.hf >> 1, c.hf >> 1, 3) * 0.5 + 0.5;
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const chipW = t.worleyA(u, v, 30, 30, 1.0);
    const chip = 1 - smoothstep(0.0, 0.06, chipW.f2 - chipW.f1);
    h += (clayN - 0.5) * 0.020 + (micro - 0.5) * 0.010 - chip * 0.02;

    const fire = cs(c.fire, u, v);
    const mossF = clamp(cs(c.moss, u, v) * 1.3 - 0.15, 0, 1) * (valley * 0.85 + lapShadow * 0.5);
    const moss = smoothstep(0.24, 0.62, mossF);

    setc(s, PAL.kawara);
    mixc(s, PAL.kawaraLit, clamp((clayN - 0.35) * 1.3, 0, 1) * 0.55 * (1 - valley * 0.4));
    tint(s, -0.020, 0.004, 0.030, (fire - 0.5) * 1.4);     // kiln flash pushes blue/warm
    mixc(s, PAL.clay, smoothstep(0.55, 0.95, fire) * 0.45 + chip * 0.75);
    mixc(s, PAL.mossDeep, moss * 0.85);
    mixc(s, PAL.moss, moss * moss * 0.5);
    mixc(s, PAL.grime, lapShadow * 0.35 + valley * 0.16);

    // Fired clay is a satin, moss is matte, the wet valley reflects the sky.
    let ro = 0.52 + (micro - 0.5) * 0.14 + valley * 0.10 + chip * 0.30;
    ro = lerp(ro, 0.94, moss * 0.85);
    ro = lerp(ro, 0.30, valley * (1 - moss) * 0.45);
    const ao = 1 - lapShadow * 0.55 - valley * 0.28 - moss * 0.22 - chip * 0.15
      - (cf < 0.42 ? 0 : 0.10);

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.08, 1);
    s.ao = clamp(ao, 0.20, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.6, ao: 1.1 }); },
});

// ------------------------------------------------------------------ 石 stone
// Granite shrine steps. Three signals stacked: slab joints (structure), a worley
// crack net with chipped arrises (damage), and a three-mineral speckle (identity).
RECIPES.push({
  key: 'stone', label: '石 weathered granite steps', seed: 1913, hero: true, k: 1,
  setup(t, res) {
    return {
      hf: Math.max(48, res >> 2),
      wet: coarse(56, (u, v) => tileWarp(u, v, 3.0, 0.9, 4, 8.8, 3.3)),
      stain: coarse(48, (u, v) => tileFbm(u, v, 4.5, 4, 27.7, 66.1)),
      lich: coarse(56, (u, v) => tileWarp(u, v, 6.0, 1.0, 3, 15.5, 40.2)),
    };
  },
  shade(u, v, s, c, t) {
    // Slab joints: 2 x 3 blocks, edges softened by centuries of feet.
    const bu = u * 2 + 0.37, bv = v * 3 + 0.53;          // joints kept off the seam
    const bf = bu - Math.floor(bu), bg = bv - Math.floor(bv);
    const jointU = Math.min(smoothstep(0, 0.030, bf), smoothstep(0, 0.030, 1 - bf));
    const jointV = Math.min(smoothstep(0, 0.040, bg), smoothstep(0, 0.040, 1 - bg));
    const joint = Math.min(jointU, jointV);
    const slab = cellRnd2(Math.floor(bu), Math.floor(bv), 2, 3, 7);

    // Crack net. Two octaves of cellular so cracks branch instead of tiling flat.
    const w1 = t.worleyA(u, v, 7, 7, 1.0);
    const crack1 = 1 - smoothstep(0.0, 0.055, w1.f2 - w1.f1);
    const w2 = t.worleyA(u + 0.31, v + 0.17, 17, 17, 0.95);
    const crack2 = 1 - smoothstep(0.0, 0.045, w2.f2 - w2.f1);
    const crack = clamp(crack1 * 0.85 + crack2 * 0.55 * crack1, 0, 1);

    // Chipped arrises: cells that lost their corner.
    const chipCell = t.worleyA(u + 0.5, v + 0.2, 15, 14, 1.0);
    const chip = smoothstep(0.42, 0.16, chipCell.f1) * smoothstep(0.35, 0.62, chipCell.id) * (1 - joint * 0.6);

    // Mineral speckle — quartz, feldspar, biotite at three different scales.
    const grain = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const spar = t.worleyA(u + 0.31, v + 0.77, c.hf, c.hf, 1.0);
    const quartz = smoothstep(0.62, 0.90, spar.id) * (1 - smoothstep(0.10, 0.34, spar.f1));
    const mica = smoothstep(0.02, 0.0, spar.id) + smoothstep(0.86, 0.99, grain) * 0.6;

    const wet = clamp(cs(c.wet, u, v) * 1.35 - 0.20, 0, 1);
    const stain = cs(c.stain, u, v);
    const lich = smoothstep(0.58, 0.80, cs(c.lich, u, v));

    let h = 0.72 + (slab - 0.5) * 0.05;
    h -= (1 - joint) * 0.30;
    h -= crack * 0.14;
    h -= chip * 0.10;
    h += (grain - 0.5) * 0.045 + quartz * 0.020 - mica * 0.010;
    h -= smoothstep(0.55, 0.0, Math.abs(bg - 0.5) * 2) * 0.0;   // tread stays flat

    setc(s, PAL.stone);
    mixc(s, PAL.stoneWarm, clamp((grain - 0.4) * 1.6, 0, 1) * 0.55);
    mixc(s, PAL.stoneDark, clamp((0.5 - grain) * 1.4, 0, 1) * 0.45);
    tint(s, 0.022, 0.010, -0.018, (stain - 0.5) * 1.6);   // iron staining drifts warm
    mixc(s, PAL.quartz, quartz * 0.70);
    mixc(s, PAL.biotite, mica * 0.55);
    mixc(s, PAL.stoneWarm, chip * 0.55);                  // fresh break is brighter
    mixc(s, PAL.mossDeep, lich * (1 - joint) * 0.20 + lich * 0.30);
    mixc(s, PAL.mossDry, lich * 0.22);
    mixc(s, PAL.grime, crack * 0.45 + (1 - joint) * 0.40);

    // Water tracks the low ground: crevices go dark and glossy, crests stay dry.
    const pool = clamp((0.74 - h) * 2.6, 0, 1) * wet;
    let ro = 0.74 + (grain - 0.5) * 0.16 - quartz * 0.22 + mica * 0.10;
    ro = lerp(ro, 0.90, chip * 0.6);
    ro = lerp(ro, 0.96, lich * 0.7);
    ro = lerp(ro, 0.66, smoothstep(0.4, 0.9, joint) * 0.35);   // foot-polished tread
    ro = lerp(ro, 0.16, pool * 0.85);
    scalec(s, 1 - pool * 0.42);

    const ao = 1 - (1 - joint) * 0.62 - crack * 0.42 - chip * 0.22 - lich * 0.14;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.16, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.5, ao: 1.15 }); },
});

// ----------------------------------------------------------------- 石畳 cobble
// Irregular flagstone with moss grout. Cells come from jittered worley so no two
// stones share a silhouette; each stone gets its own dome, tilt and polish.
RECIPES.push({
  key: 'cobble', label: '石畳 flagstone path', seed: 2111, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(24, res >> 2),
      moss: coarse(56, (u, v) => tileWarp(u, v, 3.6, 0.9, 4, 4.4, 9.9)),
      wet: coarse(48, (u, v) => tileFbm(u, v, 2.8, 4, 71.3, 13.9)),
    };
  },
  shade(u, v, s, c, t) {
    // Warp the lookup so the cell boundaries meander like laid stone, not Voronoi.
    const wx = t.fbmA(u, v, 6, 6, 3) * 0.045;
    const wy = t.fbmA(u + 0.5, v + 0.25, 6, 6, 3) * 0.045;
    const w = t.worleyA(u + wx, v + wy, 8, 8, 1.0);
    const grout = 1 - smoothstep(0.015, 0.085, w.f2 - w.f1);
    const dome = smoothstep(0.62, 0.02, w.f1);
    const id = w.id;

    const grain = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const pit = t.worleyA(u + 0.7, v + 0.1, c.hf, c.hf, 1.0);
    const pitting = smoothstep(0.30, 0.05, pit.f1) * smoothstep(0.70, 0.95, pit.id);

    const mossF = clamp(cs(c.moss, u, v) * 1.25 - 0.10, 0, 1);
    const moss = smoothstep(0.30, 0.70, mossF * (0.35 + grout * 1.5));
    const wet = cs(c.wet, u, v);

    let h = 0.34 + dome * 0.44 + (id - 0.5) * 0.07;
    h -= grout * 0.30;
    h += (grain - 0.5) * 0.035 - pitting * 0.05;

    setc(s, PAL.stone);
    mixc(s, PAL.stoneDark, clamp(0.65 - id, 0, 1) * 0.60);
    mixc(s, PAL.stoneWarm, clamp(id - 0.55, 0, 1) * 1.2 * 0.55);
    tint(s, 0.020, 0.008, -0.016, (grain - 0.5) * 1.4 + (id - 0.5) * 0.6);
    mixc(s, PAL.earthWet, grout * 0.55);
    mixc(s, PAL.mossDeep, moss * 0.80);
    mixc(s, PAL.moss, moss * moss * 0.55);
    mixc(s, PAL.grime, pitting * 0.35);

    const pool = clamp((0.60 - h) * 2.4, 0, 1) * wet;
    let ro = 0.78 + (grain - 0.5) * 0.14 + pitting * 0.12;
    ro = lerp(ro, 0.52, dome * dome * 0.55 * (1 - moss));   // crowns polished by feet
    ro = lerp(ro, 0.95, moss * 0.85);
    ro = lerp(ro, 0.18, pool * 0.8 * (1 - moss * 0.7));
    scalec(s, 1 - pool * 0.35);

    const ao = 1 - grout * 0.72 - moss * 0.22 - pitting * 0.18;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.14, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.7, ao: 1.15 }); },
});

// ------------------------------------------------------------------ 土 dirt
// Packed earth: a warped clay base, embedded pebbles that read as half-buried,
// and autumn leaf litter drifting into the hollows.
RECIPES.push({
  key: 'dirt', label: '土 packed earth', seed: 2311, k: 2,
  setup(t, res) {
    const rnd = makeRandom(9091);
    const leaves = [];
    for (let i = 0; i < 26; i++) {
      leaves.push({
        x: rnd(), y: rnd(), r: 0.022 + rnd() * 0.030,
        a: rnd() * Math.PI, k: rnd(), s: 0.35 + rnd() * 0.5,
      });
    }
    return {
      leaves,
      hf: Math.max(24, res >> 2),
      damp: coarse(48, (u, v) => tileWarp(u, v, 2.8, 0.9, 4, 5.5, 1.1)),
      tread: coarse(48, (u, v) => tileFbm(u, v, 4.0, 4, 33.3, 88.8)),
    };
  },
  shade(u, v, s, c, t) {
    const clod = t.warpA(u, v, 12, 12, 0.7, 4);
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const peb = t.worleyA(u + 0.13, v + 0.61, 29, 28, 1.0);
    const pebble = smoothstep(0.34, 0.10, peb.f1) * smoothstep(0.55, 0.85, peb.id);
    const grit = t.worleyA(u + 0.05, v + 0.9, c.hf, c.hf, 1.0);
    const sand = smoothstep(0.28, 0.06, grit.f1) * 0.6;

    const damp = cs(c.damp, u, v);
    const tread = cs(c.tread, u, v);

    let h = 0.50 + clod * 0.16 + (micro - 0.5) * 0.05;
    h += pebble * 0.09 + sand * 0.02;
    h -= smoothstep(0.55, 0.85, tread) * 0.08;         // compacted footfall hollows

    setc(s, PAL.earth);
    mixc(s, PAL.earthDry, clamp(clod * 1.3 + 0.45, 0, 1) * 0.60 * (1 - damp * 0.7));
    mixc(s, PAL.earthWet, damp * 0.55 + smoothstep(0.6, 0.9, tread) * 0.20);
    tint(s, 0.030, 0.012, -0.020, (micro - 0.5) * 1.5 + clod * 0.5);
    mixc(s, PAL.stone, pebble * 0.72);
    mixc(s, PAL.stoneWarm, pebble * (peb.id - 0.5) * 0.5);
    mixc(s, PAL.quartz, sand * 0.28);

    let ro = 0.90 + (micro - 0.5) * 0.10;
    ro = lerp(ro, 0.60, pebble * 0.7);
    ro = lerp(ro, 0.34, damp * 0.55);
    let ao = 1 - clamp(0.55 - clod, 0, 1) * 0.35 - smoothstep(0.55, 0.9, tread) * 0.20;

    // --- leaf litter (sparse, wrapped, elliptical) ---------------------------
    const lv = c.leaves;
    for (let i = 0; i < lv.length; i++) {
      const L = lv[i];
      let dx = dwrap(u - L.x), dy = dwrap(v - L.y);
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      const rx = (dx * ca - dy * sa) / L.r;
      const ry = (dx * sa + dy * ca) / (L.r * L.s);
      const d2 = rx * rx + ry * ry;
      if (d2 > 1.6) continue;
      const d = Math.sqrt(d2);
      // Leaf outline gets a lobed edge so it is not a bare ellipse.
      const lobe = 1 + 0.16 * Math.sin(Math.atan2(ry, rx) * 5 + L.k * 6.28);
      const m = 1 - smoothstep(lobe * 0.86, lobe * 1.0, d);
      if (m <= 0) continue;
      const vein = smoothstep(0.10, 0.0, Math.abs(ry)) * 0.6
        + smoothstep(0.06, 0.0, Math.abs(Math.sin(rx * 7 + ry * 3))) * 0.25;
      mixc(s, L.k > 0.55 ? PAL.leafRed : PAL.leaf, m * (0.80 - vein * 0.25));
      tint(s, 0.05, 0.01, -0.03, m * (L.k - 0.5));
      h += m * 0.030 - vein * m * 0.008;
      ro = lerp(ro, 0.66 + L.k * 0.16, m * 0.85);
      ao -= m * 0.10;
    }

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.10, 1);
    s.ao = clamp(ao, 0.28, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.45, ao: 1.05 }); },
});

// ------------------------------------------------------------------ 苔 moss
// Velvet moss. Billow gives the cushion clumping, a warped high-frequency field
// gives the pile direction, and sparse sporophytes break the silhouette.
RECIPES.push({
  key: 'moss', label: '苔 velvet moss', seed: 2521, k: 2,
  setup(t, res) {
    const rnd = makeRandom(1717);
    const spores = [];
    for (let i = 0; i < 40; i++) spores.push({ x: rnd(), y: rnd(), r: 0.006 + rnd() * 0.008, k: rnd() });
    return {
      spores,
      hf: Math.max(32, res >> 2),
      dry: coarse(48, (u, v) => tileWarp(u, v, 3.2, 0.9, 4, 2.9, 6.6)),
    };
  },
  shade(u, v, s, c, t) {
    const cushion = t.billowA(u, v, 9, 9, 3);
    const clump = t.warpA(u, v, 20, 20, 0.8, 3) * 0.5 + 0.5;
    const pile = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const finer = t.fbmA(u + 0.3, v + 0.8, c.hf + (c.hf >> 1), c.hf + (c.hf >> 1), 1) * 0.5 + 0.5;
    const gapW = t.worleyA(u, v, 11, 11, 1.0);
    const gap = 1 - smoothstep(0.0, 0.10, gapW.f2 - gapW.f1);

    const dry = cs(c.dry, u, v);

    let h = 0.42 + (1 - cushion) * 0.34 + clump * 0.14;
    h += (pile - 0.5) * 0.07 + (finer - 0.5) * 0.04;
    h -= gap * 0.22;

    setc(s, PAL.mossDeep);
    mixc(s, PAL.moss, clamp(clump * 1.5 - 0.2, 0, 1) * 0.85);
    mixc(s, PAL.mossDry, smoothstep(0.55, 0.88, dry) * 0.55 * clamp(h * 1.4 - 0.3, 0, 1));
    tint(s, -0.020, 0.030, -0.018, (pile - 0.5) * 1.8 + (finer - 0.5) * 1.0);
    mixc(s, PAL.mossDeep, gap * 0.7);
    scalec(s, 0.80 + clamp((h - 0.4) * 0.9, 0, 1) * 0.45);   // self-shadowed pile

    let ro = 0.93 - (pile - 0.5) * 0.10 + gap * 0.04;
    ro = lerp(ro, 0.98, smoothstep(0.5, 0.9, dry) * 0.6);
    let ao = 1 - gap * 0.55 - (1 - clamp(h * 1.3, 0, 1)) * 0.35;

    const sp = c.spores;
    for (let i = 0; i < sp.length; i++) {
      const P = sp[i];
      const dx = dwrap(u - P.x), dy = dwrap(v - P.y);
      const d = Math.sqrt(dx * dx + dy * dy) / P.r;
      if (d > 1.4) continue;
      const m = 1 - smoothstep(0.7, 1.2, d);
      mixc(s, PAL.leaf, m * 0.55 * (0.5 + P.k));
      h += m * 0.05;
      ro = lerp(ro, 0.70, m * 0.6);
      ao -= m * 0.05;
    }

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.30, 1);
    s.ao = clamp(ao, 0.20, 1);
    s.me = 0;
  },
  mat(maps) {
    return pbrPhys(maps, {
      ns: 1.9, ao: 1.2, sheen: 0.55, sheenRoughness: 0.9, sheenColor: 0x6f8a52,
    });
  },
});

// --------------------------------------------------------------- 漆喰 plaster
// Shikkui. Nearly white, which means every bit of readability has to come from
// trowel topography, hairline shrinkage cracks and the grime line at the base.
RECIPES.push({
  key: 'plaster', label: '漆喰 shikkui wall', seed: 2711, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      trowel: coarse(56, (u, v) => tileWarp(u, v, 2.4, 1.0, 4, 6.6, 4.4)),
      grime: coarse(48, (u, v) => tileFbm(u, v, 3.2, 4, 91.1, 3.7)),
      salt: coarse(48, (u, v) => tileFbm(u, v, 6.0, 3, 17.3, 52.9)),
    };
  },
  shade(u, v, s, c, t) {
    // Trowel sweeps: long, shallow, curved — anisotropic warp does this cleanly.
    const sweep = t.warpA(u, v, 14, 5, 0.9, 3);
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;
    const pin = t.worleyA(u + 0.42, v + 0.19, c.hf, c.hf, 1.0);
    const pinhole = smoothstep(0.26, 0.04, pin.f1) * smoothstep(0.80, 0.97, pin.id);

    // Hairline shrinkage: very thin, very shallow, branching at two scales.
    const h1 = t.worleyA(u + 0.11, v + 0.29, 9, 9, 1.0);
    const hairCoarse = 1 - smoothstep(0.0, 0.022, h1.f2 - h1.f1);
    const h2 = t.worleyA(u + 0.6, v + 0.4, 32, 32, 1.0);
    const hairFine = 1 - smoothstep(0.0, 0.016, h2.f2 - h2.f1);
    const hair = clamp(hairCoarse + hairFine * 0.55, 0, 1);

    const trowel = cs(c.trowel, u, v);
    const grimeF = cs(c.grime, u, v);
    const salt = cs(c.salt, u, v);
    const base = vband(v, 0.36);                        // splash-back from the ground
    const cap = vband(v, 0.10);                         // shadow under the tile capping

    let h = 0.70 + sweep * 0.045 + (trowel - 0.5) * 0.05;
    h += (micro - 0.5) * 0.016;
    h -= hair * 0.030 + pinhole * 0.045;

    setc(s, PAL.shikkui);
    mixc(s, PAL.shikkuiDim, clamp(0.55 - trowel, 0, 1) * 0.75 + (1 - micro) * 0.10);
    tint(s, 0.012, 0.006, -0.014, (sweep + (micro - 0.5)) * 1.2);   // warm/cool drift
    mixc(s, PAL.quartz, smoothstep(0.62, 0.90, salt) * 0.35);       // efflorescence
    mixc(s, PAL.grime, base * (0.30 + grimeF * 0.45) + cap * 0.22 + hair * 0.30);
    mixc(s, PAL.algae, base * grimeF * 0.22);
    mixc(s, PAL.earthWet, pinhole * 0.30);

    let ro = 0.68 + (micro - 0.5) * 0.12 + hair * 0.16 + base * 0.14;
    ro = lerp(ro, 0.44, clamp(trowel * 1.2 - 0.3, 0, 1) * 0.45);    // burnished passes
    ro = lerp(ro, 0.92, smoothstep(0.6, 0.9, salt) * 0.5);
    const ao = 1 - hair * 0.30 - pinhole * 0.35 - base * 0.16 - cap * 0.20;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.16, 1);
    s.ao = clamp(ao, 0.30, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 0.8, ao: 1.0 }); },
});

// ---------------------------------------------------------------- 障子 paper
// Shoji. Washi fibre is the whole character: long random fibres suspended in a
// translucent sheet, plus the kumiko lattice reading through from behind.
RECIPES.push({
  key: 'paper', label: '障子 shoji paper', seed: 2917, k: 2,
  setup(t, res) {
    const rnd = makeRandom(3313);
    const fibres = [];
    for (let i = 0; i < 90; i++) {
      fibres.push({ x: rnd(), y: rnd(), len: 0.03 + rnd() * 0.09, a: rnd() * Math.PI, w: 0.0016 + rnd() * 0.0022, k: rnd() });
    }
    return {
      fibres,
      hf: Math.max(32, res >> 2),
      pulp: coarse(48, (u, v) => tileWarp(u, v, 5.0, 0.8, 3, 3.1, 7.3)),
      age: coarse(48, (u, v) => tileFbm(u, v, 2.6, 4, 60.2, 11.4)),
    };
  },
  shade(u, v, s, c, t) {
    const pulp = cs(c.pulp, u, v);
    const age = cs(c.age, u, v);
    const tooth = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;

    // Kumiko lattice: 4 x 3 panes. The wood sits behind the paper, so it shows as
    // a soft occlusion band, not a hard edge.
    const gu = u * 4, gv = v * 3;
    const fu = Math.abs((gu - Math.floor(gu)) - 0.0);
    const fv = Math.abs((gv - Math.floor(gv)) - 0.0);
    const barU = 1 - smoothstep(0.020, 0.055, Math.min(fu, 1 - fu));
    const barV = 1 - smoothstep(0.026, 0.070, Math.min(fv, 1 - fv));
    const lattice = clamp(barU + barV - barU * barV, 0, 1);

    let h = 0.60 + (pulp - 0.5) * 0.05 + (tooth - 0.5) * 0.03;
    h += lattice * 0.05;

    setc(s, PAL.washi);
    mixc(s, PAL.washiFibre, clamp(0.55 - pulp, 0, 1) * 0.55 + (1 - tooth) * 0.18);
    tint(s, 0.020, 0.010, -0.024, (age - 0.5) * 1.8);      // foxing pushes warm
    mixc(s, PAL.leaf, smoothstep(0.80, 0.98, age) * 0.16); // age spots
    scalec(s, 1 - lattice * 0.26);                          // lattice shadow

    let ro = 0.86 + (tooth - 0.5) * 0.10;
    let ao = 1 - lattice * 0.34;

    const fb = c.fibres;
    for (let i = 0; i < fb.length; i++) {
      const F = fb[i];
      let dx = dwrap(u - F.x), dy = dwrap(v - F.y);
      if (dx * dx + dy * dy > 0.02) continue;
      const ca = Math.cos(F.a), sa = Math.sin(F.a);
      const px = dx * ca + dy * sa;
      const py = -dx * sa + dy * ca;
      if (Math.abs(px) > F.len) continue;
      // Fibres bow slightly rather than running dead straight.
      const bow = Math.sin(px / F.len * Math.PI) * F.len * 0.10 * (F.k - 0.5) * 2;
      const m = (1 - smoothstep(F.w * 0.4, F.w, Math.abs(py - bow)))
        * (1 - smoothstep(F.len * 0.7, F.len, Math.abs(px)));
      if (m <= 0) continue;
      mixc(s, PAL.washiFibre, m * 0.75);
      tint(s, 0.02, 0.008, -0.01, m * (F.k - 0.5));
      h += m * 0.030;
      ro = lerp(ro, 0.72, m * 0.5);
      ao -= m * 0.04;
    }

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.35, 1);
    s.ao = clamp(ao, 0.45, 1);
    s.me = 0;
  },
  mat(maps) {
    // Transmission is a second render pass; only HIGH+ pays for it. applyQuality
    // swaps it for straight opacity below that, which still reads translucent
    // against the sky because shoji are lit from behind almost everywhere.
    const m = pbrPhys(maps, { ns: 0.55, side: DoubleSide, envInt: 0.8 });
    m.transmission = 0;
    m.thickness = 0.02;
    m.ior = 1.15;
    m.attenuationDistance = 0.05;
    m.attenuationColor.setHex(0xefe4cc);
    m.userData.kgTranslucent = true;
    return m;
  },
});

// ---------------------------------------------------------------- 畳 tatami
// Woven igusa rush with a dark cloth heri border. The weave is a proper over/under
// so the height field alternates phase every other row — that is what makes the
// grazing light run in the right direction.
RECIPES.push({
  key: 'tatami', label: '畳 woven rush mat', seed: 3119, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      sun: coarse(48, (u, v) => tileWarp(u, v, 2.2, 0.8, 4, 8.2, 5.5)),
      wear: coarse(48, (u, v) => tileFbm(u, v, 4.0, 4, 23.9, 74.1)),
    };
  },
  shade(u, v, s, c, t) {
    const BORDER = 0.085;
    const edge = Math.min(v, 1 - v);
    const hem = 1 - smoothstep(BORDER - 0.012, BORDER + 0.008, edge);
    const hemLip = smoothstep(BORDER + 0.026, BORDER + 0.004, edge) * (1 - hem);

    // Weave: 34 warp strands across u, bundles of 2 rows in v.
    // Both counts must be EVEN: the over/under parity is (iu + iv) & 1, so an odd
    // repeat count would flip the whole weave phase across the wrap.
    const WARP = 34, WEFT = 18;
    const wu = u * WARP + 0.5, wv = v * WEFT + 0.5;
    const iu = Math.floor(wu), iv = Math.floor(wv);
    const fu = wu - iu, fv = wv - iv;
    const over = ((iu + iv) & 1) === 0;
    const strandU = Math.sin(fu * Math.PI);
    const strandV = Math.sin(fv * Math.PI);
    const weave = over ? strandU * 0.9 + strandV * 0.25 : strandV * 0.9 + strandU * 0.25;
    const seam = 1 - Math.max(smoothstep(0.0, 0.16, fu) * smoothstep(0.0, 0.16, 1 - fu),
      smoothstep(0.0, 0.16, fv) * smoothstep(0.0, 0.16, 1 - fv));

    // Each rush stalk has its own colour and a fine longitudinal fibre.
    const strandId = cellRnd2(iu, iv, WARP, WEFT, 37);
    const fibre = t.fbmA(u, v, c.hf, Math.max(6, c.hf >> 3), 2) * 0.5 + 0.5;

    const sun = cs(c.sun, u, v);
    const wear = cs(c.wear, u, v);

    let h = 0.46 + weave * 0.26 - seam * 0.10 + (fibre - 0.5) * 0.03;
    let ro = 0.62 + (fibre - 0.5) * 0.14 + seam * 0.12;
    let ao = 1 - seam * 0.40 - (1 - weave) * 0.22;

    setc(s, PAL.rush);
    mixc(s, PAL.rushOld, clamp(0.6 - strandId, 0, 1) * 0.55);
    tint(s, 0.030, 0.020, -0.030, (strandId - 0.5) * 1.2 + (fibre - 0.5) * 1.0);
    // New tatami is green; sunlight turns it gold from the window inwards.
    mixc(s, PAL.moss, clamp(0.55 - sun, 0, 1) * 0.30);
    mixc(s, PAL.rushOld, smoothstep(0.5, 0.95, sun) * 0.45);
    mixc(s, PAL.grime, smoothstep(0.55, 0.9, wear) * 0.22 + seam * 0.18);
    ro = lerp(ro, 0.46, clamp(weave, 0, 1) * 0.35 * smoothstep(0.5, 0.9, wear));

    if (hem > 0 || hemLip > 0) {
      // Heri: fine warp-faced silk, much tighter weave, near-black.
      const tu = u * 260;
      const thread = Math.abs(Math.sin(tu * Math.PI)) * 0.5 + 0.5;
      const hemFine = t.fbmA(u, v, c.hf, c.hf, 1) * 0.5 + 0.5;
      mixc(s, PAL.tatamiHem, hem * 0.95);
      tint(s, 0.010, -0.004, 0.026, hem * (hemFine - 0.5) * 1.4);
      h = lerp(h, 0.60 + thread * 0.035 + (hemFine - 0.5) * 0.02, hem);
      ro = lerp(ro, 0.48 + thread * 0.16, hem);
      ao = lerp(ao, 0.86 - thread * 0.10, hem);
      ao -= hemLip * 0.28;
      h -= hemLip * 0.05;
    }

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.16, 1);
    s.ao = clamp(ao, 0.22, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.35, ao: 1.1 }); },
});

// ------------------------------------------------------------- 注連縄 rope
// Shimenawa. Three straw strands laid in a right-hand twist; each strand is a
// bundle of individual stalks, so there are two helical frequencies stacked.
RECIPES.push({
  key: 'rope', label: '注連縄 twisted straw rope', seed: 3323, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(24, res >> 2),
      age: coarse(48, (u, v) => tileWarp(u, v, 3.0, 0.9, 3, 4.8, 2.2)),
      dust: coarse(48, (u, v) => tileFbm(u, v, 5.0, 3, 66.6, 31.2)),
    };
  },
  shade(u, v, s, c, t) {
    // u wraps the rope, v runs along it. Three strands, 6 turns down the tile.
    const STRANDS = 3, TURNS = 6;
    const helix = u * STRANDS + v * TURNS * STRANDS;
    const si = Math.floor(helix);
    const sf = helix - si;
    const strandProf = Math.sin(sf * Math.PI);
    const groove = 1 - smoothstep(0.0, 0.18, Math.min(sf, 1 - sf));

    // Individual stalks inside a strand.
    const stalk = (sf - 0.5) * 2;
    const sub = Math.abs(Math.sin((stalk * 3.4 + cellRnd(si, STRANDS, 7) * 6.28) * Math.PI));
    const stalkId = cellRnd2(si, Math.floor(v * 40), STRANDS, 40, 23);
    const fibre = t.fbmA(u, v, Math.max(8, c.hf >> 2), c.hf, 2) * 0.5 + 0.5;

    // Loose ends: whiskers of straw sticking out, sparse and directional.
    const whisk = t.fbmA(u + 0.4, v + 0.9, 8, c.hf, 2) * 0.5 + 0.5;
    const whisker = smoothstep(0.74, 0.92, whisk);

    const age = cs(c.age, u, v);
    const dust = cs(c.dust, u, v);

    let h = 0.34 + strandProf * 0.40 + sub * 0.10 - groove * 0.20;
    h += (fibre - 0.5) * 0.05 + whisker * 0.05;

    setc(s, PAL.straw);
    mixc(s, PAL.strawDim, clamp(0.6 - stalkId, 0, 1) * 0.55 + groove * 0.35);
    tint(s, 0.035, 0.018, -0.030, (fibre - 0.5) * 1.6 + (stalkId - 0.5) * 0.8);
    mixc(s, PAL.cedar, smoothstep(0.5, 0.9, age) * 0.35);     // sun-darkened straw
    mixc(s, PAL.grime, dust * 0.20 + groove * 0.20);
    scalec(s, 0.84 + strandProf * 0.30);

    let ro = 0.84 - (fibre - 0.5) * 0.12 + groove * 0.08;
    ro = lerp(ro, 0.62, strandProf * strandProf * 0.30);      // handled crests
    ro = lerp(ro, 0.95, whisker * 0.6);
    const ao = 1 - groove * 0.62 - (1 - strandProf) * 0.22 - whisker * 0.10;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.25, 1);
    s.ao = clamp(ao, 0.18, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 1.8, ao: 1.15 }); },
});

// ------------------------------------------------------------------ 樹皮 bark
// Ridged multifractal along the trunk axis gives the fissures; worley plates give
// the shedding scales; lichen sits on the plate faces, never in the fissures.
RECIPES.push({
  key: 'bark', label: '樹皮 cedar bark', seed: 3527, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(24, res >> 2),
      lich: coarse(48, (u, v) => tileWarp(u, v, 4.0, 0.9, 3, 7.1, 8.3)),
      damp: coarse(48, (u, v) => tileFbm(u, v, 3.0, 4, 48.4, 19.6)),
    };
  },
  shade(u, v, s, c, t) {
    // Fissures run along v (trunk axis) so the field is stretched in v.
    const fis = t.ridgedA(u, v, 16, 3, 4);
    const warp = t.warpA(u, v, 10, 2, 0.8, 3);
    const plate = t.worleyA(u + warp * 0.05, v * 1.0, 14, 5, 1.0);
    const plateEdge = 1 - smoothstep(0.0, 0.09, plate.f2 - plate.f1);
    const micro = t.fbmA(u, v, c.hf, Math.max(6, c.hf >> 2), 2) * 0.5 + 0.5;
    const shred = t.fbmA(u + 0.21, v + 0.63, Math.max(14, c.hf >> 1), 11, 2) * 0.5 + 0.5;

    const lich = smoothstep(0.55, 0.82, cs(c.lich, u, v));
    const damp = cs(c.damp, u, v);

    let h = 0.30 + fis * 0.52 + (plate.id - 0.5) * 0.08;
    h -= plateEdge * 0.24;
    h += (micro - 0.5) * 0.06 + (shred - 0.5) * 0.05;

    setc(s, PAL.bark);
    mixc(s, PAL.cedarHeart, clamp(0.55 - fis * 1.6, 0, 1) * 0.70);
    mixc(s, PAL.barkPale, clamp(fis * 1.5 - 0.35, 0, 1) * 0.55 * (1 - damp * 0.5));
    tint(s, 0.035, 0.010, -0.028, (micro - 0.5) * 1.6 + (plate.id - 0.5) * 0.7);
    mixc(s, PAL.mossDry, lich * (0.35 + fis * 0.5) * 0.55);
    mixc(s, PAL.moss, lich * fis * 0.25);
    mixc(s, PAL.grime, plateEdge * 0.45 + clamp(0.4 - fis, 0, 1) * 0.30);

    let ro = 0.88 - (micro - 0.5) * 0.10 + plateEdge * 0.06;
    ro = lerp(ro, 0.96, lich * 0.7);
    ro = lerp(ro, 0.42, clamp((0.45 - h) * 2.0, 0, 1) * damp * 0.7);   // wet fissures
    const ao = 1 - plateEdge * 0.55 - clamp(0.55 - fis * 1.4, 0, 1) * 0.40 - lich * 0.10;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.14, 1);
    s.ao = clamp(ao, 0.12, 1);
    s.me = 0;
  },
  mat(maps) { return pbr(maps, { ns: 2.0, ao: 1.2 }); },
});

// ------------------------------------------------------------------ 竹 bamboo
// Culm. u wraps the stalk, v runs up it — nodes are therefore horizontal rings.
// The waxy bloom is the signature: a low-roughness film that wears off the
// sun-facing side and collects white powder just under each node.
RECIPES.push({
  key: 'bambooCulm', label: '竹 bamboo culm', seed: 3733, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(24, res >> 2),
      age: coarse(48, (u, v) => tileWarp(u, v, 2.4, 0.8, 4, 9.4, 6.1)),
      blot: coarse(48, (u, v) => tileFbm(u, v, 5.5, 4, 38.1, 82.4)),
    };
  },
  shade(u, v, s, c, t) {
    const NODES = 3;
    const nv = v * NODES + 0.5, ni = Math.floor(nv), nf = nv - ni;
    const nodeId = cellRnd(ni, NODES, 41);

    // Node: a raised collar with a sharp sheath scar just above it.
    const ring = Math.exp(-Math.pow((nf - 0.06) * 26, 2));
    const scar = Math.exp(-Math.pow((nf - 0.12) * 60, 2));
    const belowNode = smoothstep(0.30, 0.02, nf);

    // Longitudinal vascular striations — many, fine, dead straight.
    const stripe = t.fbmA(u, v, c.hf, Math.max(3, c.hf >> 5), 2) * 0.5 + 0.5;
    const vasc = Math.abs(Math.sin(u * 96 * Math.PI + stripe * 3.0));
    const micro = t.fbmA(u + 0.27, v + 0.53, c.hf + (c.hf >> 2), c.hf + (c.hf >> 2), 2) * 0.5 + 0.5;

    const age = cs(c.age, u, v);
    const blot = cs(c.blot, u, v);

    let h = 0.66 + ring * 0.16 - scar * 0.06;
    h += (1 - vasc) * 0.012 + (micro - 0.5) * 0.014 + (stripe - 0.5) * 0.02;

    setc(s, PAL.bamboo);
    mixc(s, PAL.bambooOld, smoothstep(0.35, 0.85, age) * 0.75);
    tint(s, -0.015, 0.030, -0.020, (stripe - 0.5) * 1.6 + (nodeId - 0.5) * 0.5);
    mixc(s, PAL.bambooNode, ring * 0.60 + scar * 0.40);
    mixc(s, PAL.cedarWarm, smoothstep(0.72, 0.95, blot) * 0.30);   // weather blotches
    mixc(s, PAL.mossDry, belowNode * 0.14);
    mixc(s, PAL.washi, belowNode * (1 - smoothstep(0.4, 0.8, age)) * 0.30);  // waxy bloom

    // Fresh culm is almost lacquer-smooth; age and handling scuff it up.
    let ro = 0.24 + (micro - 0.5) * 0.10 + (1 - vasc) * 0.05;
    ro = lerp(ro, 0.62, smoothstep(0.3, 0.9, age));
    ro = lerp(ro, 0.78, ring * 0.55 + scar * 0.35);
    ro = lerp(ro, 0.86, belowNode * 0.30);
    const ao = 1 - scar * 0.40 - belowNode * 0.12 - (1 - vasc) * 0.06;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.45, 1);
    s.me = 0;
  },
  mat(maps) {
    return pbrPhys(maps, { ns: 0.75, clearcoat: 0.35, clearcoatRoughness: 0.35, envInt: 1.0 });
  },
});

// ------------------------------------------------------------------ 鋼 steel
// Katana. UV convention: u runs the length of the blade, v across it with v=0 at
// the ha (edge) and v=1 at the mune (spine). Three things have to be true or it
// stops reading as a sword: the hamon must be a *boundary*, not a stripe; the
// polish must be directional along u; and the ji must be perceptibly darker and
// very slightly rougher than the hardened yakiba above the hamon.
RECIPES.push({
  key: 'steel', label: '鋼 katana blade', seed: 4001, hero: true, k: 1,
  setup(t, res) {
    return {
      hf: Math.max(64, res >> 2),
      cloud: coarse(64, (u, v) => tileWarp(u, v, 5.0, 1.0, 4, 1.9, 4.6)),
      smudge: coarse(48, (u, v) => tileFbm(u, v, 3.5, 4, 84.2, 26.8)),
    };
  },
  shade(u, v, s, c, t) {
    // NOTE ON TILING: this map wraps along u (the blade length, the only axis a
    // blade is ever repeated on). v is a cross-section ramp from ha to mune and is
    // mapped exactly once by the blade quad, so it is deliberately not periodic.
    // --- hamon: a wavy temper boundary, notare with gunome undulation ---------
    const wave = t.fbmA(u, v * 0.0 + 0.5, 7, 1, 3);
    const gunome = Math.sin(u * Math.PI * 2 * 9) * 0.5 + Math.sin(u * Math.PI * 2 * 23 + 1.3) * 0.22;
    const line = 0.34 + wave * 0.16 + gunome * 0.045;
    const d = v - line;
    // Nioiguchi — the misty band of transition crystals right on the boundary.
    const nioi = Math.exp(-Math.pow(d * 26, 2));
    const yakiba = smoothstep(-0.02, 0.06, -d);        // 1 below the line = hardened
    // Ashi: fingers of soft steel reaching down into the hardened edge.
    const ashi = smoothstep(0.55, 0.95, Math.abs(Math.sin(u * Math.PI * 2 * 17)))
      * smoothstep(0.10, 0.0, Math.abs(d)) * 0.6;

    // --- hada: the folded-steel grain, very fine, warped, runs along the blade -
    const hada = t.warpA(u, v, 40, 10, 0.6, 3);
    const micro = t.fbmA(u, v, c.hf, Math.max(8, c.hf >> 3), 2) * 0.5 + 0.5;
    // Polish scratches: purely directional, essentially invisible except at grazing.
    const polish = t.fbmA(u, v, Math.max(6, c.hf >> 4), c.hf, 2) * 0.5 + 0.5;

    const cloud = cs(c.cloud, u, v);
    const smudge = cs(c.smudge, u, v);

    // Shinogi ridge near the spine, and the very fine bevel at the edge.
    const shinogi = Math.exp(-Math.pow((v - 0.80) * 14, 2));
    const bevel = smoothstep(0.09, 0.0, v);

    let h = 0.62 + shinogi * 0.10 - bevel * 0.12;
    h += hada * 0.008 + (micro - 0.5) * 0.004 + (polish - 0.5) * 0.006;
    h += nioi * 0.004;

    setc(s, PAL.steelJi);
    mixc(s, PAL.steel, yakiba * 0.75 + nioi * 0.5);
    mixc(s, PAL.hamon, nioi * 0.85 + yakiba * 0.25);
    mixc(s, PAL.hamon, ashi * 0.4);
    // Never a flat metal tint: the ji carries a cool blue, the yakiba a warm white.
    tint(s, -0.020, -0.008, 0.024, (1 - yakiba) * (0.5 + cloud * 0.6));
    tint(s, 0.014, 0.008, -0.006, yakiba * (0.4 + hada * 0.8));
    mixc(s, PAL.steelJi, clamp(0.5 - cloud, 0, 1) * 0.30 * (1 - yakiba));
    mixc(s, PAL.blued, smoothstep(0.72, 0.95, smudge) * 0.14);   // fingerprint haze

    // Mirror polish, with the yakiba a touch rougher (nioi scatters light).
    let ro = 0.055 + (polish - 0.5) * 0.030 + (micro - 0.5) * 0.016;
    ro += yakiba * 0.030 + nioi * 0.055 + ashi * 0.02;
    ro += smoothstep(0.70, 0.98, smudge) * 0.10;
    ro = lerp(ro, 0.16, bevel * 0.5);
    const ao = 1 - bevel * 0.10 - nioi * 0.03;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.020, 1);
    s.ao = clamp(ao, 0.80, 1);
    s.me = clamp(0.98 - smoothstep(0.78, 0.99, smudge) * 0.18, 0, 1);
  },
  mat(maps) {
    // Anisotropy rotated a quarter turn so the highlight smears ALONG the blade,
    // which is what makes a swing read as a bar of light instead of a hot dot.
    return pbrPhys(maps, {
      ns: 0.45, ao: 0.4, anisotropy: 0.85, anisotropyRotation: Math.PI * 0.5,
      envInt: 1.6,
    });
  },
});

// ------------------------------------------------------------- 黒鉄 dark steel
// Blued/oxidised iron for tsuba, kanamono and armour plate. Hammer facets, a
// tempering-colour field, and rust blooming out of the pits.
RECIPES.push({
  key: 'steelDark', label: '黒鉄 blued iron fittings', seed: 4201, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      temper: coarse(48, (u, v) => tileWarp(u, v, 3.4, 0.9, 4, 5.2, 3.8)),
      rust: coarse(56, (u, v) => tileWarp(u, v, 5.0, 1.0, 4, 22.6, 47.3)),
    };
  },
  shade(u, v, s, c, t) {
    const hammer = t.worleyA(u, v, 10, 10, 0.9);
    const facet = smoothstep(0.55, 0.02, hammer.f1);
    const facetEdge = 1 - smoothstep(0.0, 0.08, hammer.f2 - hammer.f1);
    const pit = t.worleyA(u + 0.3, v + 0.8, c.hf + (c.hf >> 2), c.hf + (c.hf >> 2), 1.0);
    const pitting = smoothstep(0.26, 0.04, pit.f1) * smoothstep(0.62, 0.92, pit.id);
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;

    const temper = cs(c.temper, u, v);
    const rustF = clamp(cs(c.rust, u, v) * 1.3 - 0.22, 0, 1);
    const rust = smoothstep(0.34, 0.72, rustF + pitting * 0.45);

    let h = 0.66 + facet * 0.10 - facetEdge * 0.09 - pitting * 0.10;
    h += (micro - 0.5) * 0.02 + rust * 0.03;

    setc(s, PAL.blued);
    // Tempering colours are the reason blued iron never looks like flat charcoal.
    tint(s, 0.030, 0.014, 0.036, (temper - 0.5) * 1.6);
    mixc(s, PAL.bluedHot, smoothstep(0.62, 0.92, temper) * 0.40);
    mixc(s, PAL.steelJi, facet * facet * 0.16 * (1 - rust));
    mixc(s, PAL.rust, rust * 0.85);
    tint(s, 0.05, 0.012, -0.03, rust * (micro - 0.2));
    mixc(s, PAL.grime, facetEdge * 0.35 + pitting * 0.30);

    let ro = 0.34 + (micro - 0.5) * 0.10 + facetEdge * 0.16;
    ro = lerp(ro, 0.22, facet * facet * 0.5 * (1 - rust));      // burnished crests
    ro = lerp(ro, 0.88, rust);
    ro = lerp(ro, 0.80, pitting * 0.7);
    const ao = 1 - facetEdge * 0.42 - pitting * 0.35 - rust * 0.12;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.10, 1);
    s.ao = clamp(ao, 0.24, 1);
    s.me = clamp(0.95 - rust * 0.80 - pitting * 0.25, 0.05, 1);
  },
  mat(maps) { return pbr(maps, { ns: 1.25, ao: 0.9, envInt: 1.2 }); },
});

// ------------------------------------------------------------------- 金 gold
// Aged gold leaf over red bole. Leaf squares overlap at their edges (double
// thickness reads brighter), tarnish creeps in from the seams, and wear exposes
// the bole underneath at the high points.
RECIPES.push({
  key: 'gold', label: '金 aged gold leaf', seed: 4401, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      tarn: coarse(56, (u, v) => tileWarp(u, v, 4.0, 1.0, 4, 3.7, 9.1)),
      wear: coarse(48, (u, v) => tileFbm(u, v, 3.0, 4, 57.2, 14.8)),
    };
  },
  shade(u, v, s, c, t) {
    // 6 x 6 leaf squares, each offset a little so the grid is not machine-perfect.
    const LN = 6;
    const jx = t.fbmA(u, v, 3, 3, 2) * 0.02;
    const jy = t.fbmA(u + 0.6, v + 0.2, 3, 3, 2) * 0.02;
    const gu = (u + jx) * LN, gv = (v + jy) * LN;
    const fu = gu - Math.floor(gu), fv = gv - Math.floor(gv);
    const seam = Math.max(1 - smoothstep(0.0, 0.055, Math.min(fu, 1 - fu)),
      1 - smoothstep(0.0, 0.055, Math.min(fv, 1 - fv)));
    const leafId = cellRnd2(Math.floor(gu), Math.floor(gv), LN, LN, 29);

    // Leaf laid over a gesso ground is never flat — it telegraphs every crumb.
    const crumb = t.fbmA(u, v, c.hf >> 1, c.hf >> 1, 3) * 0.5 + 0.5;
    const foilCrack = t.worleyA(u + 0.4, v + 0.15, c.hf, c.hf, 1.0);
    const craze = 1 - smoothstep(0.0, 0.030, foilCrack.f2 - foilCrack.f1);

    const tarn = cs(c.tarn, u, v);
    const wearF = cs(c.wear, u, v);
    const wear = smoothstep(0.62, 0.86, wearF + craze * 0.25 + seam * 0.2);

    let h = 0.70 + (crumb - 0.5) * 0.05 + seam * 0.035 - craze * 0.02 - wear * 0.02;

    setc(s, PAL.gold);
    mixc(s, PAL.goldHot, clamp((crumb - 0.4) * 1.6, 0, 1) * 0.55 + seam * 0.25);
    mixc(s, PAL.goldTarn, smoothstep(0.45, 0.85, tarn) * 0.60 + craze * 0.35);
    tint(s, 0.030, 0.014, -0.020, (leafId - 0.5) * 0.9 + (crumb - 0.5) * 1.0);
    mixc(s, PAL.bole, wear * 0.85);                     // red bole showing through
    mixc(s, PAL.grime, seam * 0.20 + smoothstep(0.7, 0.95, tarn) * 0.18);

    let ro = 0.16 + (crumb - 0.5) * 0.10 + craze * 0.22 + seam * 0.14;
    ro = lerp(ro, 0.46, smoothstep(0.4, 0.9, tarn) * 0.7);
    ro = lerp(ro, 0.78, wear);
    const ao = 1 - seam * 0.28 - craze * 0.16 - wear * 0.14;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.06, 1);
    s.ao = clamp(ao, 0.45, 1);
    s.me = clamp(1 - wear * 0.92 - craze * 0.10, 0.04, 1);
  },
  mat(maps) { return pbr(maps, { ns: 0.9, ao: 0.8, envInt: 1.45 }); },
});

// ------------------------------------------------------------------- 布 cloth
// Shared hemp/linen weave generator. Indigo and crimson differ in palette and in
// how they fade: indigo abrades to pale grey-blue at the fold crests, madder red
// fades pink and blotchy. The weave itself is a real over/under so the normal map
// gives the characteristic cross-hatch sparkle at grazing angles.
function clothRecipe(key, label, seed, cols, faded, deep, sheenHex) {
  return {
    key, label, seed, k: 2,
    setup(t, res) {
      return {
        hf: Math.max(32, res >> 2),
        fold: coarse(48, (u, v) => tileWarp(u, v, 2.6, 0.9, 4, 6.9, 2.4)),
        dye: coarse(48, (u, v) => tileWarp(u, v, 4.5, 0.8, 3, 29.4, 63.7)),
        soil: coarse(48, (u, v) => tileFbm(u, v, 3.8, 4, 71.8, 40.2)),
      };
    },
    shade(u, v, s, c, t) {
      const N = 58;
      const wu = u * N + 0.5, wv = v * N + 0.5;
      const iu = Math.floor(wu), iv = Math.floor(wv);
      const fu = wu - iu, fv = wv - iv;
      const over = ((iu + iv) & 1) === 0;
      const su = Math.sin(fu * Math.PI), sv = Math.sin(fv * Math.PI);
      const weave = over ? su * 0.85 + sv * 0.30 : sv * 0.85 + su * 0.30;
      const interstice = (1 - su) * (1 - sv);
      // Hand-spun hemp is slubby: some threads are fatter than others.
      const slub = over ? cellRnd(iu, N, 17) : cellRnd(iv, N, 23);
      const fuzz = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;

      const fold = cs(c.fold, u, v);
      const dye = cs(c.dye, u, v);
      const soil = cs(c.soil, u, v);
      const crest = smoothstep(0.58, 0.92, fold);        // abraded fold crests
      const trough = smoothstep(0.42, 0.06, fold);       // dye pools in the troughs

      let h = 0.42 + weave * (0.30 + slub * 0.14) - interstice * 0.22;
      h += (fuzz - 0.5) * 0.05;

      setc(s, cols);
      mixc(s, deep, trough * 0.65 + interstice * 0.35);
      mixc(s, faded, crest * (0.45 + slub * 0.35) + (1 - weave) * 0.10);
      // Vat dyeing is never even — this is the mottling that sells hand-dyed cloth.
      tint(s, 0.028, 0.012, 0.034, (dye - 0.5) * 1.7);
      tint(s, 0.020, 0.014, -0.016, (fuzz - 0.5) * 1.2 + (slub - 0.5) * 0.6);
      mixc(s, PAL.grime, smoothstep(0.62, 0.94, soil) * 0.26 + interstice * 0.12);
      scalec(s, 0.86 + weave * 0.26);

      let ro = 0.78 - (fuzz - 0.5) * 0.12 + interstice * 0.12;
      ro = lerp(ro, 0.62, weave * weave * 0.35);         // thread crowns catch light
      ro = lerp(ro, 0.90, crest * 0.5);
      const ao = 1 - interstice * 0.55 - (1 - weave) * 0.22;

      s.h = clamp(h, 0, 1);
      s.ro = clamp(ro, 0.25, 1);
      s.ao = clamp(ao, 0.28, 1);
      s.me = 0;
    },
    mat(maps) {
      const m = pbrPhys(maps, {
        ns: 1.5, ao: 1.15, side: DoubleSide,
        sheen: 0.4, sheenRoughness: 0.85, sheenColor: sheenHex,
      });
      m.userData.kgSheen = 0.4;
      return m;
    },
  };
}

RECIPES.push(clothRecipe('clothIndigo', '藍 indigo hemp', 4601,
  PAL.indigo, PAL.indigoFade, PAL.indigoDeep, 0x8fa8bd));
RECIPES.push(clothRecipe('clothCrimson', '緋 crimson sash', 4801,
  PAL.crimson, PAL.crimsonFade, C(0x4a0f13), 0xd08a7a));

// ------------------------------------------------------------------ 革 leather
// Lacquered armour lacing (odoshi) and kozane edging: fine pebbled grain under a
// thin urushi film, cracked and worn through on the working edges.
RECIPES.push({
  key: 'leather', label: '革 lacquered armour lacing', seed: 5003, k: 2,
  setup(t, res) {
    return {
      hf: Math.max(32, res >> 2),
      wear: coarse(48, (u, v) => tileWarp(u, v, 3.6, 0.9, 4, 4.1, 7.8)),
      sheen: coarse(48, (u, v) => tileFbm(u, v, 2.4, 3, 66.2, 28.5)),
    };
  },
  shade(u, v, s, c, t) {
    // Pebble grain: two cellular scales, the finer one modulating the coarser.
    const p1 = t.worleyA(u, v, c.hf >> 2, c.hf >> 2, 1.0);
    const grainA = smoothstep(0.45, 0.05, p1.f1);
    const valleyA = 1 - smoothstep(0.0, 0.10, p1.f2 - p1.f1);
    const p2 = t.worleyA(u + 0.3, v + 0.9, c.hf, c.hf, 1.0);
    const grainB = smoothstep(0.40, 0.05, p2.f1);
    const valleyB = 1 - smoothstep(0.0, 0.08, p2.f2 - p2.f1);
    const pebble = grainA * 0.7 + grainB * 0.3;
    const valley = valleyA * 0.7 + valleyB * 0.3;
    const micro = t.fbmA(u, v, c.hf, c.hf, 2) * 0.5 + 0.5;

    // Lacing runs as flat braided cords: 8 diagonal bands across the tile.
    const braid = Math.abs(Math.sin((u * 8 + v * 8) * Math.PI));
    const braidEdge = 1 - smoothstep(0.0, 0.14, braid);

    const wear = cs(c.wear, u, v);
    const shine = cs(c.sheen, u, v);
    const crack = smoothstep(0.70, 0.92, wear + valley * 0.30);

    let h = 0.60 + pebble * 0.16 - valley * 0.14 + braid * 0.10 - braidEdge * 0.10;
    h += (micro - 0.5) * 0.02 - crack * 0.05;

    setc(s, PAL.leather);
    mixc(s, PAL.leatherHi, pebble * 0.55 * (0.4 + shine));
    tint(s, 0.026, 0.010, -0.014, (micro - 0.5) * 1.4 + (shine - 0.5) * 0.8);
    mixc(s, PAL.grime, valley * 0.45 + braidEdge * 0.35);
    mixc(s, PAL.cedarHeart, crack * 0.55);              // exposed hide under lacquer

    let ro = 0.26 + valley * 0.30 + (micro - 0.5) * 0.10;
    ro = lerp(ro, 0.18, pebble * pebble * 0.5 * shine);
    ro = lerp(ro, 0.72, crack);
    const ao = 1 - valley * 0.48 - braidEdge * 0.30 - crack * 0.12;

    s.h = clamp(h, 0, 1);
    s.ro = clamp(ro, 0.08, 1);
    s.ao = clamp(ao, 0.28, 1);
    s.me = 0;
  },
  mat(maps) {
    return pbrPhys(maps, { ns: 1.3, ao: 1.05, clearcoat: 0.7, clearcoatRoughness: 0.22 });
  },
});

// ------------------------------------------------------------------ 血 decal
// Blood. A stamp, not a tile, so it uses the shared Simplex directly and fades to
// zero alpha at the border. Three zones read as blood rather than red paint: a
// dark thick pool, a bright oxidised rim where it is thin, and a spatter halo.
RECIPES.push({
  key: 'bloodDecal', label: '血 blood decal', seed: 5203, k: 2, decal: true,
  setup(t, res) {
    const rnd = makeRandom(7717);
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.20;
      blobs.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r, s: 0.10 + rnd() * 0.16, k: rnd() });
    }
    const drips = [];
    for (let i = 0; i < 14; i++) {
      drips.push({ x: 0.5 + (rnd() - 0.5) * 0.7, y: 0.5 + (rnd() - 0.5) * 0.7, r: 0.008 + rnd() * 0.030, k: rnd() });
    }
    return { blobs, drips, hf: Math.max(24, res >> 2) };
  },
  shade(u, v, s, c, t) {
    const cx = u - 0.5, cy = v - 0.5;
    const rad = Math.sqrt(cx * cx + cy * cy) * 2;

    // Main pool: metaball sum warped so the outline is ragged, not circular.
    const wob = noise.warp2(u * 5.5, v * 5.5, 0.8, 4) * 0.10;
    let field = 0;
    for (let i = 0; i < c.blobs.length; i++) {
      const B = c.blobs[i];
      const dx = u - B.x, dy = v - B.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      field += Math.max(0, 1 - d / (B.s * (0.8 + B.k * 0.5)));
    }
    field = field * 0.55 + wob;
    let mask = smoothstep(0.28, 0.52, field);
    const rim = smoothstep(0.24, 0.34, field) * (1 - smoothstep(0.40, 0.58, field));

    // Spatter: small independent droplets outside the pool.
    let spat = 0;
    for (let i = 0; i < c.drips.length; i++) {
      const D = c.drips[i];
      const dx = u - D.x, dy = (v - D.y) / (0.55 + D.k * 0.9);   // droplets stretch
      const d = Math.sqrt(dx * dx + dy * dy) / D.r;
      if (d < 2) spat = Math.max(spat, 1 - smoothstep(0.6, 1.1, d));
    }
    mask = Math.max(mask, spat * 0.92);

    const grain = t.fbm(u, v, c.hf, 2) * 0.5 + 0.5;
    const coag = noise.fbm2(u * 22, v * 22, 3) * 0.5 + 0.5;

    setc(s, PAL.blood);
    mixc(s, PAL.bloodDark, smoothstep(0.45, 0.85, field) * 0.75 + coag * 0.12);
    mixc(s, PAL.bloodEdge, rim * 0.70 + spat * 0.35);
    tint(s, 0.035, -0.006, -0.004, (grain - 0.5) * 1.4);
    scalec(s, 0.85 + coag * 0.30);

    // Fresh blood is a mirror; drying edges go matte. That contrast is the tell.
    const wetness = smoothstep(0.30, 0.70, field);
    let ro = lerp(0.62, 0.14, wetness) + (grain - 0.5) * 0.08;
    ro = lerp(ro, 0.55, rim * 0.6);

    s.h = clamp(0.5 + mask * 0.10 + (coag - 0.5) * 0.03, 0, 1);
    s.ro = clamp(ro, 0.05, 1);
    s.ao = clamp(1 - mask * 0.18, 0, 1);
    s.me = 0;
    s.a = clamp(mask * (1 - smoothstep(0.86, 1.0, rad)), 0, 1);
  },
  /** Canvas primitives are the right tool for genuinely sparse specks. */
  paint(g, res, c) {
    const rnd = makeRandom(4242);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 190; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.55) * 0.46;
      const x = (0.5 + Math.cos(a) * r) * res;
      const y = (0.5 + Math.sin(a) * r) * res;
      const rr = (0.4 + rnd() * 1.8) * (res / 256);
      const alpha = 0.35 + rnd() * 0.6;
      g.fillStyle = `rgba(${90 + (rnd() * 40) | 0},${8 + (rnd() * 12) | 0},${12 + (rnd() * 10) | 0},${alpha})`;
      g.beginPath();
      g.ellipse(x, y, rr, rr * (0.6 + rnd() * 1.1), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  },
  mat(maps) {
    const m = pbr(maps, { ns: 0.7, transparent: true, depthWrite: false });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    m.envMapIntensity = 1.3;
    return m;
  },
});

// ------------------------------------------------------------------ 泥 decal
// Scuff/dust decal for footfalls, landings and impact scars.
RECIPES.push({
  key: 'dirtDecal', label: '泥 dirt scuff decal', seed: 5407, k: 2, decal: true,
  setup(t, res) { return { hf: Math.max(24, res >> 2) }; },
  shade(u, v, s, c, t) {
    const cx = u - 0.5, cy = v - 0.5;
    const rad = Math.sqrt(cx * cx + cy * cy) * 2;
    const puff = noise.warp2(u * 4.0 + 11.3, v * 4.0 + 4.7, 0.9, 4) * 0.5 + 0.5;
    const grain = t.fbm(u, v, c.hf, 2) * 0.5 + 0.5;
    const grit = noise.fbm2(u * 40, v * 40, 3) * 0.5 + 0.5;

    const body = smoothstep(0.95, 0.10, rad) * smoothstep(0.28, 0.62, puff + (1 - rad) * 0.3);

    setc(s, PAL.earthDry);
    mixc(s, PAL.earth, clamp(0.6 - puff, 0, 1) * 0.65);
    mixc(s, PAL.earthWet, smoothstep(0.72, 0.95, grit) * 0.30);
    tint(s, 0.030, 0.014, -0.024, (grain - 0.5) * 1.6);

    s.h = clamp(0.5 + body * 0.08 + (grain - 0.5) * 0.04, 0, 1);
    s.ro = clamp(0.92 + (grain - 0.5) * 0.10, 0.4, 1);
    s.ao = clamp(1 - body * 0.22, 0, 1);
    s.me = 0;
    s.a = clamp(body * (0.55 + grain * 0.55), 0, 1);
  },
  mat(maps) {
    const m = pbr(maps, { ns: 0.5, transparent: true, depthWrite: false });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    return m;
  },
});

// -------------------------------------------------------------- detail grain
// One shared high-frequency normal map. Every close-range surface borrows it via
// addDetailNormal() so that walking up to a wall reveals grain the base texture
// no longer has resolution for. Isotropic on purpose — it must not fight the
// directional structure of whatever it is layered onto.
const DETAIL_RECIPE = {
  key: '_detail', label: 'shared detail grain', seed: 6101, k: 2, normalOnly: true, hs: 0.55,
  setup(t, res) { return { hf: Math.max(32, res >> 1) }; },
  shade(u, v, s, c, t) {
    const a = t.fbm(u, v, c.hf >> 2, 3) * 0.5 + 0.5;
    const b = t.fbm(u + 0.31, v + 0.77, c.hf, 2) * 0.5 + 0.5;
    const cell = t.worleyA(u + 0.17, v + 0.43, (c.hf >> 1) + (c.hf >> 3), (c.hf >> 1) + (c.hf >> 3), 1.0);
    const pit = smoothstep(0.30, 0.04, cell.f1) * smoothstep(0.55, 0.95, cell.id);
    s.h = clamp(0.5 + (a - 0.5) * 0.55 + (b - 0.5) * 0.45 - pit * 0.35, 0, 1);
    s.ro = 0.5; s.ao = 1; s.me = 0;
  },
};

// ============================================================== shader patches

const TRI_VERT_PARS = /* glsl */`
varying vec3 vTriPos;
varying vec3 vTriNrm;
`;

const TRI_FRAG_PARS = /* glsl */`
uniform float uTriScale;
uniform float uTriSharp;
varying vec3 vTriPos;
varying vec3 vTriNrm;
vec3 kgTriW() {
  vec3 n = abs( normalize( vTriNrm ) );
  n = pow( n, vec3( uTriSharp ) );
  return n / max( n.x + n.y + n.z, 1e-4 );
}
vec4 kgTriSample( sampler2D tex, vec3 p, vec3 w ) {
  vec3 q = p * uTriScale;
  return texture2D( tex, q.zy ) * w.x + texture2D( tex, q.xz ) * w.y + texture2D( tex, q.xy ) * w.z;
}
`;

const TRI_MAP = /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor = kgTriSample( map, vTriPos, kgTriW() );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const TRI_ROUGH = /* glsl */`
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= kgTriSample( roughnessMap, vTriPos, kgTriW() ).g;
#endif
`;

const TRI_METAL = /* glsl */`
float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
  metalnessFactor *= kgTriSample( metalnessMap, vTriPos, kgTriW() ).b;
#endif
`;

const TRI_AO = /* glsl */`
#ifdef USE_AOMAP
  float ambientOcclusion = ( kgTriSample( aoMap, vTriPos, kgTriW() ).r - 1.0 ) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
#endif
`;

// Whiteout-blended triplanar normals (Golus). Cheaper and far more stable than
// rebuilding a per-axis TBN, and it keeps the base geometric normal authoritative.
const TRI_NORMAL = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  {
    vec3 kw = kgTriW();
    vec3 kq = vTriPos * uTriScale;
    vec3 gn = normalize( vTriNrm );
    vec3 tnx = texture2D( normalMap, kq.zy ).xyz * 2.0 - 1.0;
    vec3 tny = texture2D( normalMap, kq.xz ).xyz * 2.0 - 1.0;
    vec3 tnz = texture2D( normalMap, kq.xy ).xyz * 2.0 - 1.0;
    tnx.xy *= normalScale; tny.xy *= normalScale; tnz.xy *= normalScale;
    tnx = vec3( tnx.xy + gn.zy, abs( tnx.z ) * gn.x );
    tny = vec3( tny.xy + gn.xz, abs( tny.z ) * gn.y );
    tnz = vec3( tnz.xy + gn.xy, abs( tnz.z ) * gn.z );
    vec3 wn = normalize( tnx.zyx * kw.x + tny.xzy * kw.y + tnz.xyz * kw.z );
    normal = normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz );
  }
#endif
// KAGEROU_NORMAL_END
`;

const DETAIL_FRAG_PARS = /* glsl */`
uniform sampler2D uDetailNormal;
uniform float uDetailScale;
uniform float uDetailStrength;
`;

const DETAIL_FRAG = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  {
    vec3 kgDet = texture2D( uDetailNormal, vNormalMapUv * uDetailScale ).xyz * 2.0 - 1.0;
    normal = normalize( normal + ( tbn[ 0 ] * kgDet.x + tbn[ 1 ] * kgDet.y ) * uDetailStrength );
  }
#endif
`;

function applyTriplanar(shader, p) {
  shader.uniforms.uTriScale = p.uniforms.uTriScale;
  shader.uniforms.uTriSharp = p.uniforms.uTriSharp;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + TRI_VERT_PARS)
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\n\tvTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    .replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\n\tvTriNrm = normalize( mat3( modelMatrix ) * objectNormal );');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TRI_FRAG_PARS)
    .replace('#include <map_fragment>', TRI_MAP)
    .replace('#include <roughnessmap_fragment>', TRI_ROUGH)
    .replace('#include <metalnessmap_fragment>', TRI_METAL)
    .replace('#include <aomap_fragment>', TRI_AO)
    .replace('#include <normal_fragment_maps>', TRI_NORMAL);
}

function applyDetail(shader, p) {
  shader.uniforms.uDetailNormal = p.uniforms.uDetailNormal;
  shader.uniforms.uDetailScale = p.uniforms.uDetailScale;
  shader.uniforms.uDetailStrength = p.uniforms.uDetailStrength;
  let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + DETAIL_FRAG_PARS);
  const anchor = f.indexOf('// KAGEROU_NORMAL_END') >= 0
    ? '// KAGEROU_NORMAL_END'
    : '#include <normal_fragment_maps>';
  shader.fragmentShader = f.replace(anchor, anchor + '\n' + DETAIL_FRAG);
}

// ============================================================ MaterialLibrary

export class MaterialLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.materials = new Map();
    /** key -> { res, canvases, textures } — kept so a tier change can regenerate. */
    this.store = new Map();
    this.textures = new Set();
    this.detailNormal = null;
    this.onProgress = null;
    this.memoryMB = 0;
    this._variants = new Map();
    this._yieldCount = 0;
    this._channel = (typeof MessageChannel !== 'undefined') ? new MessageChannel() : null;
    this._baseSize = 0;
    this._aniso = 4;
  }

  // ------------------------------------------------------------------- boot

  async init() {
    const q = this.ctx?.quality;
    this._baseSize = q?.textureSize ?? 512;
    this._aniso = q?.anisotropy ?? 4;
    this._tier = q?.tier ?? TIER.MEDIUM;

    const list = [DETAIL_RECIPE, ...RECIPES];
    const total = list.length + 1;               // +1 for the parameter-only water
    let done = 0;

    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      this.onProgress?.(done, total, rec.label);
      const maps = await this._run(this._generate(rec));
      if (rec.normalOnly) {
        this.detailNormal = maps.normal;
      } else {
        const existing = this.materials.get(rec.key);
        if (!existing) this.materials.set(rec.key, rec.mat(maps, this));
      }
      done++;
      this.onProgress?.(done, total, rec.label);
      await this._breathe();
    }

    if (!this.materials.has('water')) this.materials.set('water', this._waterMaterial());
    this.onProgress?.(total, total, '水 water');

    this._applyTierFeatures();
    this._logMemory();
    return this;
  }

  /** Drive a generator to completion, handing the main thread back between slices. */
  async _run(gen) {
    let r = gen.next();
    while (!r.done) { await this._breathe(); r = gen.next(); }
    return r.value;
  }

  /**
   * Yield to the event loop. MessageChannel is a macrotask, so the browser is free
   * to paint the loading bar between slices; every sixth yield we wait on a real
   * frame so progress is guaranteed to be visible even under load.
   */
  _breathe() {
    this._yieldCount++;
    if (this._yieldCount % 6 === 0 && typeof requestAnimationFrame === 'function') {
      return new Promise((res) => requestAnimationFrame(() => res()));
    }
    if (this._channel) {
      return new Promise((res) => {
        this._channel.port1.onmessage = () => res();
        this._channel.port2.postMessage(0);
      });
    }
    return new Promise((res) => setTimeout(res, 0));
  }

  // ------------------------------------------------------------- generation

  _resFor(rec) {
    const base = this._baseSize;
    const cap = rec.hero ? (this._tier >= TIER.ULTRA ? HERO_CAP * 2 : HERO_CAP) : PROP_CAP;
    // §4: never larger than quality.textureSize. Deliberately smaller than the
    // ceiling — the shared detail normal buys back the close-range frequency far
    // more cheaply than quadrupling every map would.
    return Math.max(64, Math.min(base >> (rec.k || 0), cap));
  }

  /**
   * The whole per-texture pipeline: evaluate the surface record per pixel into
   * albedo + ORM + a float height field, Sobel the height into a normal map, blit
   * each buffer into an OffscreenCanvas and wrap it as a CanvasTexture.
   * Yields whenever it has held the thread for CHUNK_MS.
   */
  *_generate(rec) {
    const res = this._resFor(rec);
    const t = new Tiler(rec.seed);
    const c = rec.setup ? rec.setup(t, res) : {};
    const n = res * res;
    const shade = rec.shade;

    const albedo = rec.normalOnly ? null : new Uint8ClampedArray(n * 4);
    const orm = rec.normalOnly ? null : new Uint8ClampedArray(n * 4);
    const height = new Float32Array(n);

    let t0 = nowMs();
    for (let y = 0; y < res; y++) {
      const v = (y + 0.5) / res;
      const row = y * res;
      for (let x = 0; x < res; x++) {
        S.r = 0.5; S.g = 0.5; S.b = 0.5; S.a = 1;
        S.h = 0.5; S.ro = 0.7; S.ao = 1; S.me = 0;
        shade((x + 0.5) / res, v, S, c, t);
        const i = row + x;
        height[i] = S.h;
        if (albedo) {
          const o = i * 4;
          albedo[o] = S.r * 255; albedo[o + 1] = S.g * 255;
          albedo[o + 2] = S.b * 255; albedo[o + 3] = S.a * 255;
          orm[o] = S.ao * 255; orm[o + 1] = S.ro * 255;
          orm[o + 2] = S.me * 255; orm[o + 3] = S.h * 255;   // A = height (parallax)
        }
      }
      if (nowMs() - t0 > CHUNK_MS) { yield; t0 = nowMs(); }
    }

    // --- normal from height, wrapping Sobel central difference ---------------
    const normal = new Uint8ClampedArray(n * 4);
    const k = (res / 8) * (rec.hs !== undefined ? rec.hs : 1);
    t0 = nowMs();
    for (let y = 0; y < res; y++) {
      const ym = ((y - 1 + res) % res) * res;
      const y0 = y * res;
      const yp = ((y + 1) % res) * res;
      for (let x = 0; x < res; x++) {
        const xm = (x - 1 + res) % res;
        const xp = (x + 1) % res;
        const tl = height[ym + xm], tc = height[ym + x], tr = height[ym + xp];
        const ml = height[y0 + xm], mr = height[y0 + xp];
        const bl = height[yp + xm], bc = height[yp + x], br = height[yp + xp];
        const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        // Image +y is texture -v, so the sign here is what keeps green pointing up.
        const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        const nx = -gx * k, ny = gy * k, nz = 8;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        const o = (y0 + x) * 4;
        normal[o] = (nx * inv * 0.5 + 0.5) * 255;
        normal[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
        normal[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
        normal[o + 3] = 255;
      }
      if (nowMs() - t0 > CHUNK_MS) { yield; t0 = nowMs(); }
    }

    // --- blit ---------------------------------------------------------------
    const prev = this.store.get(rec.key);
    const maps = {};
    const slots = rec.normalOnly ? [['normal', normal, false]]
      : [['albedo', albedo, true], ['normal', normal, false], ['orm', orm, false]];

    for (let i = 0; i < slots.length; i++) {
      const [name, buf, srgb] = slots[i];
      const canvas = makeCanvas(res, res);
      const g = canvas.getContext('2d', { willReadFrequently: false });
      const img = g.createImageData(res, res);
      img.data.set(buf);
      g.putImageData(img, 0, 0);
      if (name === 'albedo' && rec.paint) rec.paint(g, res, c, t);
      if (prev && prev.textures[name]) {
        const tex = prev.textures[name];
        tex.image = canvas;
        tex.anisotropy = this._aniso;
        tex.needsUpdate = true;
        maps[name] = tex;
      } else {
        maps[name] = makeTexture(canvas, srgb, this._aniso);
        this.textures.add(maps[name]);
      }
      yield;
    }

    this.store.set(rec.key, { res, textures: maps });
    return maps;
  }

  // ------------------------------------------------------------------ water

  /**
   * §5 asks for base parameters only — the animated surface shader lives in
   * Water/Sky. Everything here is the physical description of shallow mountain
   * water over dark stone, so whatever drives it inherits plausible constants.
   */
  _waterMaterial() {
    const m = new MeshPhysicalMaterial({
      color: 0x16323c,
      roughness: 0.045,
      metalness: 0.0,
      transparent: true,
      opacity: 0.86,
      side: FrontSide,
    });
    m.ior = 1.333;
    m.clearcoat = 1.0;
    m.clearcoatRoughness = 0.03;
    m.envMapIntensity = 1.5;
    m.normalMap = this.detailNormal;
    if (m.normalMap) {
      m.normalScale.set(0.12, 0.12);
      m.userData.kgWaterRipple = true;
    }
    m.userData.kgWater = true;
    return m;
  }

  // ------------------------------------------------------------------ access

  get(name) { return this.materials.get(name) || null; }

  has(name) { return this.materials.has(name); }

  keys() { return Array.from(this.materials.keys()); }

  /**
   * A clone whose maps tile at a different rate. Texture clones share `.source`,
   * so three uploads the image exactly once no matter how many repeat variants
   * exist — this is how one 512px cedar dresses a wall, a post and a step board.
   */
  getTextured(name, repeat = 1, repeatY = null) {
    const ry = repeatY === null ? repeat : repeatY;
    const key = `${name}|${repeat}|${ry}`;
    const cached = this._variants.get(key);
    if (cached) return cached;

    const base = this.get(name);
    if (!base) return null;

    const m = base.clone();
    const seen = new Map();
    const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
      'alphaMap', 'clearcoatNormalMap', 'emissiveMap', 'bumpMap'];
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const src = base[slot];
      if (!src) continue;
      let cl = seen.get(src);
      if (!cl) {
        cl = src.clone();                    // shares src.source => one GPU upload
        cl.wrapS = RepeatWrapping;
        cl.wrapT = RepeatWrapping;
        cl.repeat.set(repeat, ry);
        cl.anisotropy = this._aniso;
        cl.needsUpdate = true;
        seen.set(src, cl);
        this.textures.add(cl);
      }
      m[slot] = cl;
    }
    m.userData = Object.assign({}, base.userData);
    if (base.userData.kgPatches) {
      m.userData.kgPatches = base.userData.kgPatches.map((p) => Object.assign({}, p));
      this._installPatches(m);
    }
    m.needsUpdate = true;
    this._variants.set(key, m);
    return m;
  }

  // ----------------------------------------------------------- shader patches

  _installPatches(m) {
    const patches = m.userData.kgPatches;
    if (!patches || !patches.length) return;
    m.onBeforeCompile = (shader) => {
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        if (p.type === 'triplanar') applyTriplanar(shader, p);
        else if (p.type === 'detail') applyDetail(shader, p);
      }
    };
    const kkey = 'kg:' + patches.map((p) => p.type).join(',');
    m.customProgramCacheKey = () => kkey;
    m.needsUpdate = true;
  }

  /**
   * Convert a material to world-space triplanar mapping. For terrain, cliff rock
   * and anything else whose UVs are either unwrappable or stretched — the cost is
   * three texture fetches per map, which is why it is opt-in per material.
   * `scale` is in texture repeats per metre; `sharp` controls blend tightness.
   */
  triplanarPatch(material, scale = 0.35, sharp = 6.0) {
    if (!material) return material;
    const patches = material.userData.kgPatches || (material.userData.kgPatches = []);
    let p = patches.find((q) => q.type === 'triplanar');
    if (!p) {
      p = { type: 'triplanar', uniforms: {} };
      patches.push(p);
    }
    p.uniforms.uTriScale = p.uniforms.uTriScale || { value: scale };
    p.uniforms.uTriSharp = p.uniforms.uTriSharp || { value: sharp };
    p.uniforms.uTriScale.value = scale;
    p.uniforms.uTriSharp.value = sharp;
    this._installPatches(material);
    return material;
  }

  /**
   * Layer the shared high-frequency grain on top of whatever normal the material
   * already resolved. `scale` is in extra UV repeats, `strength` in [0,1].
   * Requires the material to have a tangent-space normalMap (all of ours do).
   */
  addDetailNormal(material, scale = 12, strength = 0.45) {
    if (!material || !this.detailNormal) return material;
    if (!material.normalMap) material.normalMap = this.detailNormal;
    const patches = material.userData.kgPatches || (material.userData.kgPatches = []);
    let p = patches.find((q) => q.type === 'detail');
    if (!p) {
      p = { type: 'detail', uniforms: {} };
      patches.push(p);
    }
    p.uniforms.uDetailNormal = p.uniforms.uDetailNormal || { value: this.detailNormal };
    p.uniforms.uDetailScale = p.uniforms.uDetailScale || { value: scale };
    p.uniforms.uDetailStrength = p.uniforms.uDetailStrength || { value: strength };
    p.uniforms.uDetailNormal.value = this.detailNormal;
    p.uniforms.uDetailScale.value = scale;
    p.uniforms.uDetailStrength.value = strength;
    this._installPatches(material);
    return material;
  }

  // ----------------------------------------------------------------- quality

  applyQuality(quality) {
    const q = quality || this.ctx?.quality;
    if (!q) return;
    this._aniso = q.anisotropy;
    this._tier = q.tier;
    for (const tex of this.textures) tex.anisotropy = q.anisotropy;
    this._applyTierFeatures();

    // Resolution is baked at boot. A tier change big enough to move textureSize
    // regenerates in the background rather than stalling the frame that changed it.
    if (q.textureSize !== this._baseSize) {
      this._baseSize = q.textureSize;
      if (!this._rebuilding) {
        this._rebuilding = this.rebuild().then(() => { this._rebuilding = null; });
      }
    }
  }

  /** Regenerate every image in place; textures and materials keep their identity. */
  async rebuild() {
    const list = [DETAIL_RECIPE, ...RECIPES];
    const total = list.length;
    for (let i = 0; i < list.length; i++) {
      this.onProgress?.(i, total, list[i].label);
      const maps = await this._run(this._generate(list[i]));
      if (list[i].normalOnly) this.detailNormal = maps.normal;
    }
    for (const [, m] of this._variants) m.needsUpdate = true;
    this._logMemory();
  }

  /** Features that cost real GPU time and therefore have to follow the tier. */
  _applyTierFeatures() {
    const tier = this._tier;
    const paper = this.materials.get('paper');
    if (paper) {
      const trans = tier >= TIER.HIGH;
      paper.transmission = trans ? 0.55 : 0.0;
      paper.transparent = true;
      paper.opacity = trans ? 1.0 : 0.94;
      paper.needsUpdate = true;
    }
    for (const key of ['clothIndigo', 'clothCrimson', 'moss']) {
      const m = this.materials.get(key);
      if (!m || m.sheen === undefined) continue;
      const want = key === 'moss' ? 0.55 : 0.4;
      const next = tier <= TIER.LOW ? 0 : want;
      if (m.sheen !== next) { m.sheen = next; m.needsUpdate = true; }
    }
    const steel = this.materials.get('steel');
    if (steel && steel.anisotropy !== undefined) {
      const next = tier <= TIER.LOW ? 0 : 0.85;
      if (steel.anisotropy !== next) { steel.anisotropy = next; steel.needsUpdate = true; }
    }
  }

  // ------------------------------------------------------------------ budget

  /** §7 caps textures at 48 MB on MEDIUM. Count unique sources, mips included. */
  _logMemory() {
    let bytes = 0;
    let count = 0;
    const sources = new Set();
    for (const tex of this.textures) {
      const src = tex.source;
      if (sources.has(src)) continue;
      sources.add(src);
      const img = tex.image;
      if (!img) continue;
      bytes += img.width * img.height * 4 * (4 / 3);   // RGBA8 + full mip chain
      count++;
    }
    this.memoryMB = bytes / (1024 * 1024);
    const budget = 48;
    const line = `[Materials] ${this.materials.size} materials · ${count} unique textures · `
      + `${this.memoryMB.toFixed(1)} MB (budget ${budget} MB)`;
    if (this.memoryMB > budget && this._tier <= TIER.MEDIUM) console.warn(line + ' — OVER BUDGET');
    else console.info(line);
    return this.memoryMB;
  }

  // ----------------------------------------------------------------- teardown

  dispose() {
    for (const tex of this.textures) tex.dispose();
    this.textures.clear();
    for (const [, m] of this.materials) m.dispose();
    for (const [, m] of this._variants) m.dispose();
    this.materials.clear();
    this._variants.clear();
    this.store.clear();
    this.detailNormal = null;
    if (this._channel) {
      this._channel.port1.onmessage = null;
      this._channel.port1.close();
      this._channel.port2.close();
      this._channel = null;
    }
  }
}

export default MaterialLibrary;
