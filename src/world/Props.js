/**
 * Props.js — every physical object in the shrine, generated as real geometry.
 *
 * Nothing here is a primitive with a flat colour on it. Each builder returns a
 * `Build` — a list of `{ geometry, material }` parts plus colliders, lights and
 * named anchors — authored in a local frame with the prop's footprint centred on
 * the origin and its base at y = 0. `Level.js` transforms those parts into world
 * space and either merges them (statics) or feeds them to an `InstancedProto`
 * (anything that repeats), because a hundred stone lanterns as a hundred meshes
 * would eat the entire draw-call budget on their own.
 *
 * Two things make this read as *carpentry* rather than as boxes:
 *
 *  1. `sweepProfile()` — a parallel-transport sweep of a 2D profile along a path.
 *     Battered torii pillars, the concave sori of a kasagi, twisted straw rope,
 *     tapering tree branches and bamboo culms are all the same operation with a
 *     different profile and a different curve.
 *  2. Vertex-baked AO in the `color` attribute. Every part is darkened where it
 *     meets the ground, where it is concave, and where it faces down. That is
 *     what stops a merged static mesh from looking like untextured plastic under
 *     a single directional light (ARCHITECTURE §5.9).
 *
 * Attribute contract for every geometry that leaves this file: exactly
 * `position, normal, uv, color` (+ `aFlutter` for cloth/paper), indexed. Level's
 * merge buckets rely on that being invariant.
 */

import {
  BufferGeometry, BufferAttribute, BoxGeometry, Matrix4, Vector3, Color,
  MeshStandardMaterial, MeshBasicMaterial, ShaderChunk, FrontSide, DoubleSide, InstancedMesh, DataTexture, RGBAFormat,
  SRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, AdditiveBlending,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise, makeRandom, clamp, lerp, smoothstep, worley2, glslNoise } from '../core/Noise.js';
import { WIND_GLSL } from '../fx/Weather.js';

// ---------------------------------------------------------------- scratch

const _v3 = new Vector3();

/**
 * Materials whose geometry carries the wind attribute. Kept in its own bucket.
 * `__lanternPaper` is in here because a hung chōchin swings on the same gust that
 * moves the banners beside it.
 */
export const CLOTH_MATERIALS = new Set(['clothIndigo', 'clothCrimson', 'paper', '__lanternPaper', '__blossom']);

/**
 * Emissive radiance, in linear working space, for everything in the shrine that is
 * its own light source.
 *
 * The frame is rendered with `NoToneMapping` into an HDR target and graded by
 * PostFX, whose bloom threshold sits at linear 1.0 and whose transfer function
 * reaches 250/255 at linear 2.2. So these are not decorative tints — they are the
 * only things in a magic-hour frame that exceed the sky, and the numbers are chosen
 * against that curve: a flame core well past white so it clips and throws a skirt,
 * lit paper just past the 2.2 mark so the lantern body itself reads as a source,
 * and a spill pool deliberately *under* 1.0 so it warms the flagstone without
 * blooming into a blob.
 */
export const EMISSIVE = {
  /**
   * Flame inside a hibukuro / chōchin. Near-white on purpose.
   *
   * Rec.709 luma weights green at 0.7152 and blue at 0.0722, so a *saturated*
   * warm source cannot produce a high-luma pixel however hard it is driven: the
   * red channel clips at 255 while green and blue trail, and the result tops out
   * around 210–225. Measured: at `#ffd9a8` ×6 (linear 6.00, 4.16, 2.35) the whole
   * frame peaked at luma 229, and that peak was the blue-white sun disc, not a
   * lantern. A real flame core photographs white — the warmth in the read comes
   * from the paper around it and from the bloom skirt, not from the core itself.
   * Rec709 luma ≈ 6.4 linear, G/R 0.90.
   */
  flame: { color: 0xfff4e8, intensity: 7.0 },
  /**
   * Lit paper seen from outside. Rec709 luma ≈ 1.91 linear, G/R 0.69.
   *
   * This is a *peak*, not a level. It used to be 3.6 — luma 2.65, i.e. every
   * texel of every hibukuro aperture and every chōchin belly landing past the
   * transfer function's 2.2 white point at once. That is a flat 255 rectangle
   * with a hard aliased edge where it meets the stone, which is what a lit paper
   * panel never looks like: paper is a diffuser with a lamp behind it, so it is
   * hottest opposite the flame and falls off toward the frame it is glued to.
   *
   * The falloff now lives in the vertex colour (see `lanternPaperMaterial`,
   * which routes `vColor` onto the emissive), so the number here only has to put
   * the *centre* of a panel at the top of the curve rather than the whole panel
   * past it. The integrated Round 11 frame measured the visible core at luma
   * 240.29 but populated only 1,583 pixels above luma 235; the hero percentile
   * requires 2,963. Raising the paper peak, rather than the global grade, grows
   * the authored light-source population without moving sky, stone or blacks.
   * Live probes bounded the strict integer gate: 2.9 moved hero p99.9 only
   * 232 -> 234, and 3.3 reached exactly 235 (still a fail for `> 235`). 3.45
   * remains below the rejected pre-gradient 3.6 level; the measured centre at
   * 3.3 was luma 244.23, so it retains headroom while the 0.38 rim remains a
   * diffuser rather than a white card.
   */
  paper: { color: 0xffd9a8, intensity: 3.45 },
  /** Warm spill on flagstone. Rec709 luma ≈ 0.38 — below the bloom threshold. */
  pool: { color: 0xff9a52, intensity: 0.85 },
  /** Sky caught in still water. Reads as a glint without becoming a lamp. */
  water: { color: 0xbfe0ea, intensity: 0.55 },
};

// ------------------------------------------------------------ geometry utils

/**
 * Force the attribute set every merge bucket assumes. Missing UVs get a planar
 * fallback so an untextured builder still tiles a material sensibly rather than
 * sampling texel 0 across the whole surface.
 */
export function normalizeGeo(geo, cloth = false) {
  if (!geo) return geo;
  geo.clearGroups?.();
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();

  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  const count = pos.count;

  if (!geo.getAttribute('uv')) {
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
  }
  if (!geo.getAttribute('color')) {
    const c = new Float32Array(count * 3);
    c.fill(1);
    geo.setAttribute('color', new BufferAttribute(c, 3));
  }
  if (cloth && !geo.getAttribute('aFlutter')) {
    geo.setAttribute('aFlutter', new BufferAttribute(new Float32Array(count * 2), 2));
  }

  for (const key in geo.attributes) {
    if (key === 'position' || key === 'normal' || key === 'uv' || key === 'color') continue;
    if (cloth && key === 'aFlutter') continue;
    geo.deleteAttribute(key);
  }

  if (!geo.index) {
    const idx = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    geo.setIndex(new BufferAttribute(idx, 1));
  }
  return geo;
}

/** Multiply the baked-AO vertex colour of every vertex by `fn(x,y,z,nx,ny,nz,i)`. */
export function shadeGeo(geo, fn) {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  const nrm = geo.getAttribute('normal');
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  for (let i = 0; i < pos.count; i++) {
    const k = fn(
      pos.getX(i), pos.getY(i), pos.getZ(i),
      nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0, i,
    );
    if (k === 1) continue;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;
}

/** Multiply a colour tint into the vertex colours (per-prop weathering variation). */
export function tintGeo(geo, r, g, b) {
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
  }
  col.needsUpdate = true;
  return geo;
}

/**
 * The standard prop AO pass.
 *
 *  - `ground`   : contact darkening in the first `groundH` metres above `groundY`.
 *  - `cavity`   : concavity estimate — a vertex whose normal disagrees with the
 *                 direction out of the prop's own centroid is in a crevice.
 *  - `down`     : downward-facing faces (soffits, undersides of beams) go dark.
 */
export function bakeAO(geo, opts = {}) {
  const ground = opts.ground ?? 0.55;
  const groundH = opts.groundH ?? 0.45;
  const groundY = opts.groundY ?? 0;
  const cavity = opts.cavity ?? 0.30;
  const down = opts.down ?? 0.28;
  const floor = opts.floor ?? 0.30;

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cy = (bb.min.y + bb.max.y) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  const ex = Math.max(1e-3, (bb.max.x - bb.min.x) * 0.5);
  const ey = Math.max(1e-3, (bb.max.y - bb.min.y) * 0.5);
  const ez = Math.max(1e-3, (bb.max.z - bb.min.z) * 0.5);

  return shadeGeo(geo, (x, y, z, nx, ny, nz) => {
    let k = 1;
    if (ground > 0 && groundH > 0) {
      const t = clamp((y - groundY) / groundH, 0, 1);
      k *= 1 - ground * (1 - t) * (1 - t);
    }
    if (cavity > 0) {
      // Normalised offset from the centroid; agreement with the normal means convex.
      const ox = (x - cx) / ex, oy = (y - cy) / ey, oz = (z - cz) / ez;
      const l = Math.hypot(ox, oy, oz) || 1;
      const d = (ox * nx + oy * ny + oz * nz) / l;
      k *= 1 - cavity * clamp(0.55 - d, 0, 1) * 1.8;
    }
    if (down > 0 && ny < 0) k *= 1 - down * (-ny);
    return Math.max(floor, k);
  });
}

/** Blend a second colour in below a height — chipped lacquer, moss lines, mud. */
export function weatherBand(geo, y0, y1, r, g, b, jitter = 0.35) {
  const pos = geo.getAttribute('position');
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise.fbm2(x * 3.1 + z * 2.3, y * 4.7, 3) * jitter;
    const t = 1 - smoothstep(y0, y1, y + n);
    if (t <= 0.001) continue;
    col.setXYZ(
      i,
      lerp(col.getX(i), col.getX(i) * r, t),
      lerp(col.getY(i), col.getY(i) * g, t),
      lerp(col.getZ(i), col.getZ(i) * b, t),
    );
  }
  col.needsUpdate = true;
  return geo;
}

/**
 * Add the wind attribute consumed by `kagerouBend` (ARCHITECTURE §10):
 * `aFlutter = (h01, stiffness)` where h01 is 0 at the anchor and 1 at the free
 * edge, and stiffness > 1 is rigid (a pole, a rope), < 1 is limp (banner cloth).
 */
export function bakeFlutter(geo, stiffness, h01Fn) {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 2);
  const st = Math.max(0.25, stiffness);
  for (let i = 0; i < n; i++) {
    arr[i * 2] = clamp(h01Fn(pos.getX(i), pos.getY(i), pos.getZ(i)), 0, 1);
    arr[i * 2 + 1] = st;
  }
  geo.setAttribute('aFlutter', new BufferAttribute(arr, 2));
  return geo;
}

/** Displace along the normal by fbm — worn stone, hand-cut timber, old plaster. */
export function roughen(geo, amount, freq = 1.6, axisMask = null) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = noise.fbm2(x * freq + z * 0.37, y * freq * 1.13 + x * 0.21, 3) * amount;
    let nx = nrm ? nrm.getX(i) : 0, ny = nrm ? nrm.getY(i) : 1, nz = nrm ? nrm.getZ(i) : 0;
    if (axisMask) { nx *= axisMask[0]; ny *= axisMask[1]; nz *= axisMask[2]; }
    pos.setXYZ(i, x + nx * d, y + ny * d, z + nz * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lengthwise grain, written into the vertex colour of a *round* member.
 *
 * The albedo and normal maps already carry grain; the reason it does not survive
 * a front key is that a tone curve compresses hard where the sun puts a surface,
 * so a 4% albedo mottle that reads fine in shadow lands inside one code value
 * when lit. Vertex colour multiplies diffuse *before* the curve, so a ±11% band
 * here comes out the other side as a real streak.
 *
 * Sampled through `cos/sin` of the angle around the axis so the field is exactly
 * periodic and no seam runs up the post, with a slow drift along it — which is
 * what makes a streak wander like grain rather than sit like a stripe.
 */
export function axialGrain(geo, cx, cz, amount = 0.12, scale = 1, warm = 0.55) {
  const pos = geo.getAttribute('position');
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  const inv = 1 / Math.max(1e-3, scale);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = Math.atan2(z - cz, x - cx);
    const c = Math.cos(th), s = Math.sin(th);
    const coarse = noise.fbm2(c * 9.0, s * 9.0 + y * 0.55 * inv, 3);
    const fine = noise.noise2(c * 27.0, s * 27.0 + y * 1.9 * inv);
    const g = coarse * 0.68 + fine * 0.32;
    const k = 1 + g * amount;
    // Late wood is darker *and* browner than early wood; a purely luminance
    // streak reads as dirt, the hue shift is what makes it read as timber.
    const kb = 1 + g * amount * (1 + warm);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * kb, col.getZ(i) * kb);
  }
  col.needsUpdate = true;
  return geo;
}

/** As `axialGrain`, but for a beam swept along X — grain runs the long way. */
export function beamGrain(geo, amount = 0.10, scale = 1, warm = 0.55) {
  const pos = geo.getAttribute('position');
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  const inv = 1 / Math.max(1e-3, scale);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const across = (y * 7.4 + z * 6.1) * inv;
    const g = noise.fbm2(x * 0.55 * inv, across, 3) * 0.7
      + noise.noise2(x * 1.7 * inv, across * 2.6) * 0.3;
    const k = 1 + g * amount;
    const kb = 1 + g * amount * (1 + warm);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * kb, col.getZ(i) * kb);
  }
  col.needsUpdate = true;
  return geo;
}

/**
 * 雨だれ the dark run a joint leaves down the member below it.
 *
 * Rain sheets off the nuki and runs down the pillar, and it does not run evenly:
 * it picks a handful of tracks and follows them for a metre or two, leaving a
 * grey-green stain that is the single clearest "this has stood outside for a
 * century" cue on a painted post. Only some angular bands run (the mask is
 * thresholded), the run fades out downward, and it fades *in* just below the
 * joint because the first few centimetres are sheltered by the beam itself.
 */
export function runoffStain(geo, yTop, drop, cx, cz, strength = 0.34) {
  const pos = geo.getAttribute('position');
  let col = geo.getAttribute('color');
  if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (yTop - y) / drop;
    if (t < 0 || t > 1) continue;
    const th = Math.atan2(pos.getZ(i) - cz, pos.getX(i) - cx);
    const m = smoothstep(0.02, 0.40, noise.fbm2(
      Math.cos(th) * 12.0 + yTop * 0.21, Math.sin(th) * 12.0, 2));
    if (m <= 0.001) continue;
    const fade = smoothstep(0.0, 0.10, t) * (1 - smoothstep(0.35, 1.0, t));
    const k = 1 - m * fade * strength;
    // Rainwater carries dust and algae down with it: the stain is cooler and
    // greener than the paint, not just darker.
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * (k + (1 - k) * 0.45), col.getZ(i) * (k + (1 - k) * 0.30));
  }
  col.needsUpdate = true;
  return geo;
}

/** Build a TRS matrix. Build-time only — allocates. */
export function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) {
  const m = new Matrix4().makeRotationY(ry);
  m.scale(_v3.set(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

// ------------------------------------------------------------------ profiles

/** Unit rectangle, optionally chamfered. Scaled per-sample by `sx`,`sy`. */
export function rectProfile(chamfer = 0) {
  const c = clamp(chamfer, 0, 0.45);
  const h = 0.5;
  if (c <= 0.002) return [[-h, -h], [h, -h], [h, h], [-h, h]];
  return [
    [-h + c, -h], [h - c, -h],
    [h, -h + c], [h, h - c],
    [h - c, h], [-h + c, h],
    [-h, h - c], [-h, -h + c],
  ];
}

/** Unit circle of radius 0.5. */
export function circleProfile(n = 8, phase = 0) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    p.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
  }
  return p;
}

/** Lobed circle — the twist of a straw rope has to read from the silhouette. */
export function ropeProfile(n = 12, lobes = 3, depth = 0.16) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 * (1 + Math.sin(a * lobes) * depth);
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}

/**
 * Five-sided kasagi/beam section: flat soffit, sloped shoulders, ridged top.
 *
 * `chamfer` breaks the two soffit arrises. A carpenter planes them off and a
 * century of weather rounds them further; left square they are a mathematically
 * exact edge, and an exact edge under a directional key is a single-pixel
 * discontinuity that reads as a rendered box rather than as a cut timber.
 */
export function kasagiProfile(chamfer = 0) {
  const c = clamp(chamfer, 0, 0.30);
  if (c <= 0.002) {
    return [
      [-0.50, -0.50], [0.50, -0.50],
      [0.50, 0.16], [0.30, 0.40], [0.00, 0.50], [-0.30, 0.40], [-0.50, 0.16],
    ];
  }
  return [
    [-0.50 + c, -0.50], [0.50 - c, -0.50], [0.50, -0.50 + c],
    [0.50, 0.16], [0.30, 0.40], [0.00, 0.50], [-0.30, 0.40], [-0.50, 0.16],
    [-0.50, -0.50 + c],
  ];
}

/** Hexagon, point-up. Kasuga lantern stonework. */
export function hexProfile(phase = Math.PI / 6) { return circleProfile(6, phase); }

// -------------------------------------------------------------- sweepProfile

/**
 * Sweep a 2D profile along a path of samples.
 *
 * `samples[i] = { x, y, z, sx, sy, roll, ao }` — `sx` scales the profile's first
 * axis, `sy` the second. The frame is parallel-transported so a curving path does
 * not spin the section, which is the difference between a believable branch and a
 * twisted ribbon.
 *
 * `smooth:false` (default) duplicates each profile edge's endpoints so corners
 * stay hard without emitting degenerate quads. `smooth:true` shares them, for
 * circular and lobed sections.
 */
export function sweepProfile(samples, profile, opts = {}) {
  const N = samples.length;
  const P = profile.length;
  const geo = new BufferGeometry();
  if (N < 2 || P < 3) {
    geo.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    return normalizeGeo(geo);
  }

  const smooth = !!opts.smooth;
  const capStart = opts.capStart !== false;
  const capEnd = opts.capEnd !== false;
  const uvScale = opts.uvScale ?? 1;

  // --- column layout ------------------------------------------------------
  const colProfile = [];
  const quadA = [], quadB = [];
  if (smooth) {
    for (let k = 0; k <= P; k++) colProfile.push(k % P);
    for (let k = 0; k < P; k++) { quadA.push(k); quadB.push(k + 1); }
  } else {
    for (let k = 0; k < P; k++) { colProfile.push(k); colProfile.push((k + 1) % P); }
    for (let k = 0; k < P; k++) { quadA.push(k * 2); quadB.push(k * 2 + 1); }
  }
  const C = colProfile.length;

  // Perimeter parameter for U so textures wrap in metres, not in "profile index".
  const perim = new Float32Array(C);
  for (let k = 1; k < C; k++) {
    const a = profile[colProfile[k - 1]], b = profile[colProfile[k]];
    perim[k] = perim[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // --- frames -------------------------------------------------------------
  const tan = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const l = Math.hypot(tx, ty, tz) || 1;
    tan[i * 3] = tx / l; tan[i * 3 + 1] = ty / l; tan[i * 3 + 2] = tz / l;
  }

  let rx, ry, rz;
  if (opts.ref) { rx = opts.ref[0]; ry = opts.ref[1]; rz = opts.ref[2]; }
  else if (Math.abs(tan[0]) < 0.85) { rx = 1; ry = 0; rz = 0; }
  else { rx = 0; ry = 1; rz = 0; }
  let d = tan[0] * rx + tan[1] * ry + tan[2] * rz;
  let nx = rx - tan[0] * d, ny = ry - tan[1] * d, nz = rz - tan[2] * d;
  let nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  const sideCount = N * C;
  const capCount = (capStart ? P : 0) + (capEnd ? P : 0);
  const total = sideCount + capCount;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);

  const ringN = new Float32Array(N * 3);
  const ringB = new Float32Array(N * 3);

  let arc = 0;
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const tx = tan[i * 3], ty = tan[i * 3 + 1], tz = tan[i * 3 + 2];
    if (i > 0) {
      // Re-project the previous normal onto the new section plane (parallel transport).
      d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d; ny -= ty * d; nz -= tz * d;
      nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const p = samples[i - 1];
      arc += Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
    }
    let ax = nx, ay = ny, az = nz;
    let bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax;
    const roll = s.roll || 0;
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const rax = ax * cr + bx * sr, ray = ay * cr + by * sr, raz = az * cr + bz * sr;
      bx = bx * cr - ax * sr; by = by * cr - ay * sr; bz = bz * cr - az * sr;
      ax = rax; ay = ray; az = raz;
    }
    ringN[i * 3] = ax; ringN[i * 3 + 1] = ay; ringN[i * 3 + 2] = az;
    ringB[i * 3] = bx; ringB[i * 3 + 1] = by; ringB[i * 3 + 2] = bz;

    const sx = s.sx ?? 1, sy = s.sy ?? s.sx ?? 1;
    const ao = s.ao ?? 1;
    for (let k = 0; k < C; k++) {
      const pr = profile[colProfile[k]];
      const u = pr[0] * sx, v = pr[1] * sy;
      const o = (i * C + k) * 3;
      pos[o] = s.x + ax * u + bx * v;
      pos[o + 1] = s.y + ay * u + by * v;
      pos[o + 2] = s.z + az * u + bz * v;
      const o2 = (i * C + k) * 2;
      uv[o2] = perim[k] * Math.max(sx, sy) * uvScale;
      uv[o2 + 1] = arc * uvScale;
      const pao = pr.length > 2 ? pr[2] : 1;
      col[o] = col[o + 1] = col[o + 2] = ao * pao;
    }
  }

  // --- caps ---------------------------------------------------------------
  let cursor = sideCount;
  const capStartBase = cursor;
  const writeCap = (i) => {
    const s = samples[i];
    const ax = ringN[i * 3], ay = ringN[i * 3 + 1], az = ringN[i * 3 + 2];
    const bx = ringB[i * 3], by = ringB[i * 3 + 1], bz = ringB[i * 3 + 2];
    const sx = s.sx ?? 1, sy = s.sy ?? s.sx ?? 1;
    for (let k = 0; k < P; k++) {
      const pr = profile[k];
      const u = pr[0] * sx, v = pr[1] * sy;
      const o = (cursor + k) * 3;
      pos[o] = s.x + ax * u + bx * v;
      pos[o + 1] = s.y + ay * u + by * v;
      pos[o + 2] = s.z + az * u + bz * v;
      uv[(cursor + k) * 2] = u * uvScale;
      uv[(cursor + k) * 2 + 1] = v * uvScale;
      const a = (s.ao ?? 1) * 0.9;
      col[o] = col[o + 1] = col[o + 2] = a;
    }
    cursor += P;
  };
  if (capStart) writeCap(0);
  const capEndBase = cursor;
  if (capEnd) writeCap(N - 1);

  // --- index --------------------------------------------------------------
  const quadCount = (N - 1) * quadA.length;
  const capTris = (capStart ? P - 2 : 0) + (capEnd ? P - 2 : 0);
  const triCount = quadCount * 2 + capTris;
  const idx = total > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let w = 0;
  for (let i = 0; i < N - 1; i++) {
    const r0 = i * C, r1 = (i + 1) * C;
    for (let q = 0; q < quadA.length; q++) {
      const ka = quadA[q], kb = quadB[q];
      const a = r0 + ka, b = r0 + kb, c = r1 + kb, e = r1 + ka;
      idx[w++] = a; idx[w++] = b; idx[w++] = c;
      idx[w++] = a; idx[w++] = c; idx[w++] = e;
    }
  }
  if (capStart) for (let k = 1; k < P - 1; k++) { idx[w++] = capStartBase; idx[w++] = capStartBase + k + 1; idx[w++] = capStartBase + k; }
  if (capEnd) for (let k = 1; k < P - 1; k++) { idx[w++] = capEndBase; idx[w++] = capEndBase + k; idx[w++] = capEndBase + k + 1; }

  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Loft a stack of closed outlines. Rings must share a point count; ring 0 is the
 * bottom. Winding is verified for outlines listed (+x,+z) → (−x,+z) → (−x,−z) →
 * (+x,−z) with rings ascending in Y, i.e. outward-facing roof surfaces.
 */
export function loftRings(rings, opts = {}) {
  const R = rings.length;
  const C = rings[0].pts.length;
  const flip = !!opts.flip;
  const uvScale = opts.uvScale ?? 1;

  const total = R * C;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);

  const vAt = new Float32Array(R);
  for (let i = 1; i < R; i++) {
    const a = rings[i - 1].pts[0], b = rings[i].pts[0];
    vAt[i] = vAt[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }

  for (let i = 0; i < R; i++) {
    const ring = rings[i];
    const ao = ring.ao ?? 1;
    let u = 0;
    for (let k = 0; k < C; k++) {
      const p = ring.pts[k];
      if (k > 0) {
        const q = ring.pts[k - 1];
        u += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      }
      const o = (i * C + k) * 3;
      pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
      uv[(i * C + k) * 2] = u * uvScale;
      uv[(i * C + k) * 2 + 1] = vAt[i] * uvScale;
      const a = ao * (ring.pao ? ring.pao[k] : 1);
      col[o] = col[o + 1] = col[o + 2] = a;
    }
  }

  const triCount = (R - 1) * C * 2;
  const idx = total > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let w = 0;
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < C; k++) {
      const k1 = (k + 1) % C;
      const a = i * C + k, b = (i + 1) * C + k, c = (i + 1) * C + k1, e = i * C + k1;
      if (!flip) {
        idx[w++] = a; idx[w++] = b; idx[w++] = c;
        idx[w++] = a; idx[w++] = c; idx[w++] = e;
      } else {
        idx[w++] = a; idx[w++] = c; idx[w++] = b;
        idx[w++] = a; idx[w++] = e; idx[w++] = c;
      }
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rectangular ring outline with duplicated corners (so hips stay creased) and the
 * upturned-corner lift that gives a Japanese eave its flare.
 */
export function rectRing(hx, hz, y, segX, segZ, lift = 0, cz = 0) {
  const pts = [];
  const pao = [];
  const push = (x, z, s) => {
    const l = lift * Math.pow(Math.abs(s), 3);
    pts.push([x, y + l, z + cz]);
    pao.push(1);
  };
  const edgeX = (z, from, to) => {
    for (let i = 0; i <= segX; i++) {
      const t = i / segX;
      push(lerp(from, to, t), z, t * 2 - 1);
    }
  };
  const edgeZ = (x, from, to) => {
    for (let i = 0; i <= segZ; i++) {
      const t = i / segZ;
      push(x, lerp(from, to, t), t * 2 - 1);
    }
  };
  edgeX(hz, hx, -hx);
  edgeZ(-hx, hz, -hz);
  edgeX(-hz, -hx, hx);
  edgeZ(hx, -hz, hz);
  return { pts, pao };
}

/** Flat panel with a hole punched through it, extruded to a real thickness. */
export function panelWithHole(w, h, thick, holePts, opts = {}) {
  const n = holePts.length;
  const half = thick * 0.5;
  const verts = [];
  const uvs = [];
  const cols = [];
  const idx = [];
  const aoRim = opts.rimAO ?? 0.45;

  // Project each hole vertex out to the panel rectangle along its own direction.
  const outer = [];
  for (let i = 0; i < n; i++) {
    const hx = holePts[i][0], hy = holePts[i][1];
    const l = Math.hypot(hx, hy) || 1;
    const dx = hx / l, dy = hy / l;
    const tx = Math.abs(dx) > 1e-5 ? (w * 0.5) / Math.abs(dx) : 1e6;
    const ty = Math.abs(dy) > 1e-5 ? (h * 0.5) / Math.abs(dy) : 1e6;
    const t = Math.min(tx, ty);
    outer.push([dx * t, dy * t]);
  }

  const push = (x, y, z, u, v, c) => {
    verts.push(x, y, z); uvs.push(u, v); cols.push(c, c, c);
    return verts.length / 3 - 1;
  };

  // front + back bands
  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? half : -half;
    const base = verts.length / 3;
    for (let i = 0; i < n; i++) {
      push(holePts[i][0], holePts[i][1], z, holePts[i][0], holePts[i][1], aoRim + 0.25);
      push(outer[i][0], outer[i][1], z, outer[i][0], outer[i][1], 1);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = base + i * 2 + 1;
      const c = base + ((i + 1) % n) * 2 + 1, e = base + ((i + 1) % n) * 2;
      if (side === 0) { idx.push(a, b, c, a, c, e); }
      else { idx.push(a, c, b, a, e, c); }
    }
  }
  // hole rim
  {
    const base = verts.length / 3;
    for (let i = 0; i < n; i++) {
      push(holePts[i][0], holePts[i][1], half, holePts[i][0], half, aoRim);
      push(holePts[i][0], holePts[i][1], -half, holePts[i][0], -half, aoRim * 0.7);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = base + i * 2 + 1;
      const c = base + ((i + 1) % n) * 2 + 1, e = base + ((i + 1) % n) * 2;
      idx.push(a, b, c, a, c, e);
    }
  }
  // outer edge band
  {
    const base = verts.length / 3;
    for (let i = 0; i < n; i++) {
      push(outer[i][0], outer[i][1], half, outer[i][0], half, 0.9);
      push(outer[i][0], outer[i][1], -half, outer[i][0], -half, 0.7);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = base + i * 2 + 1;
      const c = base + ((i + 1) % n) * 2 + 1, e = base + ((i + 1) % n) * 2;
      idx.push(a, c, b, a, e, c);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------- fallback maps

/**
 * Tiny procedural grain so a missing library material is never a flat colour.
 * Deliberately cheap — this only ever runs when Materials.js failed to provide a
 * name, and it must not cost a frame to synthesise.
 */
function grainTexture(hex, seed) {
  const S = 32;
  const data = new Uint8Array(S * S * 4);
  const base = new Color(hex);
  const rnd = makeRandom(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise.fbm2((x / S) * 5 + seed * 0.11, (y / S) * 5 - seed * 0.07, 4);
      const wl = worley2((x / S) * 5.3, (y / S) * 5.3, 0.9);
      const crack = smoothstep(0.02, 0.16, wl.f2 - wl.f1);
      let k = 0.78 + n * 0.28;
      k *= lerp(0.72, 1.0, crack);
      k *= 0.95 + rnd() * 0.1;
      const i = (y * S + x) * 4;
      data[i] = clamp(base.r * k, 0, 1) * 255;
      data[i + 1] = clamp(base.g * k, 0, 1) * 255;
      data[i + 2] = clamp(base.b * k, 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, S, S, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Fallback blossom card — a real cutout, generated only if `FoliageSystem` has not
 * handed us its verified 512² one.
 *
 * The thing this replaces was fifteen opaque quads of banner cloth: with no alpha
 * at all the quad's own rectangle *was* the silhouette, and the hemp weave in the
 * cloth albedo showed as a lattice inside every rectangle. So the two properties
 * that matter here are that the border is fully transparent on all four sides and
 * that most of the card is empty — a card is only a card if you can see past it.
 *
 * Colour stays in the pale blush-to-bone band per ARCHITECTURE §5: the crimson in
 * this frame belongs to the momiji and to the torii, not to the sacred tree.
 */
function blossomTexture(seed = 0x5a1201) {
  const S = 96;
  const data = new Uint8Array(S * S * 4);
  const rnd = makeRandom(seed);
  const flowers = [];
  for (let i = 0; i < 8; i++) {
    flowers.push({
      x: 0.17 + rnd() * 0.66, y: 0.17 + rnd() * 0.66,
      r: 0.085 + rnd() * 0.075, a: rnd() * Math.PI * 2, warm: rnd(),
    });
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / (S - 1), v = y / (S - 1);
      let cov = 0, warm = 0.5;
      for (let i = 0; i < flowers.length; i++) {
        const f = flowers[i];
        const dx = u - f.x, dy = v - f.y;
        const d = Math.hypot(dx, dy);
        if (d > f.r * 1.9) continue;
        // Five-lobed rosette: |cos(2.5θ)| completes five petals over a full turn.
        const th = Math.atan2(dy, dx) + f.a;
        const petal = f.r * (0.62 + 0.38 * Math.abs(Math.cos(th * 2.5)));
        const c = 1 - smoothstep(petal * 0.52, petal, d);
        if (c > cov) warm = f.warm;
        cov = Math.max(cov, c);
      }
      // Hard zero on all four borders, or the card's own edge becomes its outline.
      const edge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
      cov *= smoothstep(0.0, 0.085, edge);
      const grain = 0.88 + 0.12 * noise.fbm2(u * 15, v * 15, 2);
      const i4 = (y * S + x) * 4;
      data[i4] = clamp(1.00 * grain, 0, 1) * 255;
      data[i4 + 1] = clamp(lerp(0.93, 0.82, warm) * grain, 0, 1) * 255;
      data[i4 + 2] = clamp(lerp(0.93, 0.86, warm) * grain, 0, 1) * 255;
      data[i4 + 3] = clamp(cov, 0, 1) * 255;
    }
  }
  const tex = new DataTexture(data, S, S, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Repeats per metre for the courtyard flagstone, and the single number every one
 * of its map channels is sampled at.
 *
 * 0.62 rep/m = one texture tile every 1.61 m. The cobble recipe lays 8 worley
 * cells across a tile, so a stone is ~20 cm across and a joint a couple of cm —
 * paving, at the size paving actually is.
 *
 * This used to be applied to `map` alone. `normalMap`, `roughnessMap`,
 * `metalnessMap` and `aoMap` kept the raw geometry UV, and since the forecourt
 * slab is one `BoxGeometry` whose top face is UV 0..1 across 28 x 22 m, the same
 * 8 cells came out as 3.55 x 2.80 m "stones" with 30 cm "joints" in the relief
 * and the packed ORM — a 16x/12x magnification sitting on top of correct 20 cm
 * albedo. Two unrelated patterns on one surface. Every channel now goes through
 * `kagGroundTex`, so there is exactly one scale on the ground.
 */
const GROUND_UV_SCALE = 0.62;

/**
 * Names `lanternStoneMaterial` will adopt from `MaterialLibrary`, in order of
 * preference. Nothing here has to exist — the first one that does wins, and the
 * fallback below carries the prop otherwise. This is the coordination point with
 * [materials]; adding a key there needs no change here.
 *
 * `lanternStone` has since landed (`花崗岩 lantern granite`), authored for
 * repeat 1 against exactly these UVs, so the fallback is now the dead path and
 * is kept only so the prop degrades to something rather than to nothing.
 */
const LANTERN_STONE_NAMES = ['lanternStone', 'graniteFine', 'granite'];

/**
 * Tiling for the `stone` fallback under a lantern, and how hard its damage
 * layers are allowed to shade.
 *
 * Tiling alone cannot fix this. `stone` carries *two* structures — a 7x7 worley
 * crack net and a 2x3 grid of slab joints — and scaling the tile scales both:
 * at 1.0 the crack cells are 12 cm and read as crazing, and at 3.6 (measured)
 * the slab grid becomes a 7x11 lattice of dead-straight lines wrapped round the
 * prop, which is worse — a basket rather than a stone.
 *
 * What actually separates "damage" from "mineral" is not size, it is *relief*.
 * Both structures are cut into the height field and the recipe ships
 * `normalScale` 1.9 (raised there to compensate the shrine *steps*, and adopted
 * by Terrain as its ground detail), so a low sun turns every crack into a lit
 * ridge and a black trough. Taking the normal and the AO down leaves the same
 * features as a faint albedo mottle — which is exactly what granite grain is —
 * while the courses, seats and chipped corners carry the form. So: a modest
 * retile to get the cell size down to a few centimetres, and the damage layers
 * flattened out of the shading.
 */
const LANTERN_STONE_REPEAT = 2.6;
const LANTERN_STONE_NORMAL = 0.55;
const LANTERN_STONE_AO = 0.65;

/** Colour/roughness/metalness for every material name in the library contract. */
const FALLBACK = {
  cedar: [0x5a4436, 0.86, 0.0],
  cedarBeam: [0x6a5240, 0.82, 0.0],
  vermilion: [0xc8321e, 0.48, 0.0],
  roofTile: [0x3d4249, 0.72, 0.0],
  stone: [0x8b8778, 0.90, 0.0],
  cobble: [0x7d7a6e, 0.94, 0.0],
  dirt: [0x6b5a45, 0.98, 0.0],
  moss: [0x4e6b3c, 0.95, 0.0],
  plaster: [0xd8d2c2, 0.88, 0.0],
  paper: [0xefe6d2, 0.80, 0.0],
  tatami: [0xb9ad78, 0.92, 0.0],
  steel: [0xc9d3dc, 0.34, 0.85],
  steelDark: [0x3a4048, 0.52, 0.75],
  gold: [0xc9a227, 0.30, 0.90],
  clothIndigo: [0x27354f, 0.88, 0.0],
  clothCrimson: [0x8e2130, 0.88, 0.0],
  leather: [0x503a2a, 0.78, 0.0],
  bark: [0x4b3d31, 0.94, 0.0],
  bambooCulm: [0x8f9a4e, 0.70, 0.0],
  rope: [0xb59a63, 0.95, 0.0],
};

// ========================================================== InstancedProto

/**
 * A prop built once and stamped many times. One `InstancedMesh` per material the
 * prototype uses, sharing a single matrix list, with a per-instance colour for
 * weathering variation. `count` is writable at runtime so `applyQuality` can thin
 * a scatter out without rebuilding anything — entries are shuffled at realize
 * time so trimming the tail stays spatially uniform.
 */
export class InstancedProto {
  constructor(factory, build, opts = {}) {
    this.factory = factory;
    this.build = PropFactory.compact(build);
    this.entries = [];
    this.meshes = [];
    this.name = opts.name || 'prop';
    this.castShadow = opts.castShadow !== false;
    this.receiveShadow = opts.receiveShadow !== false;
    this.cullDistance = opts.cullDistance ?? 0;
  }

  /** `tint` is an optional [r,g,b] multiplier folded into `instanceColor`. */
  place(matrix, tint) {
    this.entries.push({ m: matrix.clone(), t: tint || null });
    return this;
  }

  get count() { return this.entries.length; }

  realize(rnd) {
    if (!this.entries.length) return this.meshes;
    // Fisher-Yates so `mesh.count = n` trims a spatially uniform subset.
    const e = this.entries;
    const r = rnd || Math.random;
    for (let i = e.length - 1; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      const t = e[i]; e[i] = e[j]; e[j] = t;
    }
    const n = e.length;
    // Only the bulkiest part of a prototype casts. A stone lantern's gold hōju
    // and its lit paper liner sit inside the silhouette the stonework already
    // throws, so their shadow draws — two per cascade, per prototype — buy
    // nothing. Picking the largest part keeps the silhouette and drops the rest.
    let heaviest = -1, heaviestTris = -1;
    for (let i = 0; i < this.build.parts.length; i++) {
      const p = this.build.parts[i];
      if (NEVER_CASTS.has(p.material)) continue;
      const tris = p.geometry.index ? p.geometry.index.count : 0;
      if (tris > heaviestTris) { heaviestTris = tris; heaviest = i; }
    }

    for (let pi = 0; pi < this.build.parts.length; pi++) {
      const part = this.build.parts[pi];
      const mat = this.factory.specialMaterial(part.material);
      const mesh = new InstancedMesh(part.geometry, mat, n);
      mesh.name = `${this.name}:${part.material}`;
      mesh.castShadow = this.castShadow && pi === heaviest;
      mesh.receiveShadow = this.receiveShadow && !NEVER_CASTS.has(part.material);
      mesh.matrixAutoUpdate = false;
      const hasTint = e.some((x) => x.t);
      for (let i = 0; i < n; i++) {
        mesh.setMatrixAt(i, e[i].m);
        if (hasTint) {
          const t = e[i].t || [1, 1, 1];
          mesh.setColorAt(i, _tintColor.setRGB(t[0], t[1], t[2]));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Cloth instances need their own copy of the flutter attribute? No — the
      // attribute is per-vertex and shared; the phase varies per instance via the
      // instance colour's unused precision, so we jitter phase per prototype only.
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      this.meshes.push(mesh);
    }
    return this.meshes;
  }

  setCount(n) {
    const c = clamp(n | 0, 0, this.entries.length);
    for (const m of this.meshes) m.count = c;
  }

  dispose() {
    for (const m of this.meshes) { m.geometry?.dispose?.(); m.dispose?.(); }
    this.meshes.length = 0;
    this.entries.length = 0;
  }
}

const _tintColor = new Color();

/** Emissive and water surfaces are light, not occluders — they never cast. */
const NEVER_CASTS = new Set(['__ember', '__glowPool', '__water']);

// ============================================================= PropFactory

/**
 * `Build` shape returned by every builder:
 * ```
 * {
 *   parts:     [{ geometry, material }],       // local space, base at y = 0
 *   colliders: [{ geometry, surface, blocking, walkable }],
 *   lights:    [{ x, y, z, color, intensity, distance, flicker }],
 *   anchors:   { name: [x, y, z] },
 *   bounds:    { r, h },
 * }
 * ```
 */
export class PropFactory {
  constructor(ctx) {
    this.ctx = ctx;
    this.rnd = makeRandom(0x5aac1e);
    this._mats = new Map();
    this._fallbackTex = new Map();
    this.disposables = [];
  }

  async init() {
    if (!this.ctx?.weather?.windUniforms) {
      console.warn('[props] WeatherSystem absent — wind-driven props will stand still');
    }
    // Touch the common names up front so the first merge does not stall on
    // material cloning halfway through a frame budget.
    for (const n of ['cedar', 'cedarBeam', 'vermilion', 'roofTile', 'stone', 'cobble', 'plaster', 'rope', 'paper']) {
      this.material(n);
    }
    return this;
  }

  // -------------------------------------------------------------- materials

  /**
   * One clone per name, with `vertexColors` on so the baked AO lands, and the
   * aerial-perspective fog re-injected (Material.copy drops onBeforeCompile).
   */
  /**
   * A fresh clone of a library material, or null when the name is missing.
   * `Material.copy` drops `onBeforeCompile` and deep-copies `userData`, so the
   * compile hooks are re-attached and the fog marker cleared for re-injection.
   */
  _libMaterial(name, repeat = 1) {
    const lib = this.ctx?.materials;
    let src = null;
    try {
      src = lib?.getTextured?.(name, repeat) ?? lib?.get?.(name) ?? null;
    } catch { src = null; }
    if (!src || !src.isMaterial) return null;
    const mat = src.clone();
    if (Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile')) mat.onBeforeCompile = src.onBeforeCompile;
    if (Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey')) mat.customProgramCacheKey = src.customProgramCacheKey;
    mat.userData = Object.assign({}, mat.userData);
    delete mat.userData.kagFog;
    return mat;
  }

  /** Fallback grain material for a name the library did not provide. */
  _fallbackMaterial(name, repeat) {
    const [hex, rough, metal] = FALLBACK[name] || [0x9a8f80, 0.85, 0.0];
    let map = this._fallbackTex.get(name);
    if (!map) {
      map = grainTexture(hex, name.length * 37 + 11);
      this._fallbackTex.set(name, map);
      this.disposables.push(map);
    }
    map.repeat.set(repeat, repeat);
    return new MeshStandardMaterial({ color: 0xffffff, map, roughness: rough, metalness: metal });
  }

  /** Resolve a material name, including the `__`-prefixed lit-source specials. */
  specialMaterial(name) {
    switch (name) {
      case '__ember': return this.emberMaterial;
      case '__lanternPaper': return this.lanternPaperMaterial;
      case '__glowPool': return this.glowPoolMaterial;
      case '__water': return this.waterMaterial;
      case '__goldPolished': return this.goldPolishedMaterial;
      case '__blossom': return this.blossomMaterial;
      case '__wetStone': return this.wetStoneMaterial;
      case '__groundStone': return this.groundMaterial;
      case '__lanternStone': return this.lanternStoneMaterial;
      default: return this.material(name);
    }
  }

  material(name, repeat = 1) {
    const key = `${name}@${repeat}`;
    const cached = this._mats.get(key);
    if (cached) return cached;

    const mat = this._libMaterial(name, repeat) || this._fallbackMaterial(name, repeat);
    mat.vertexColors = true;
    mat.name = `prop:${name}`;
    if (CLOTH_MATERIALS.has(name)) {
      mat.side = DoubleSide;
      this._installWind(mat);
    }
    if (name === 'vermilion') this._weatherUrushi(mat);
    this.ctx?.sky?.applyFog?.(mat);
    mat.needsUpdate = true;
    this._mats.set(key, mat);
    this.disposables.push(mat);
    return mat;
  }

  /**
   * Age the torii lacquer down off a showroom finish.
   *
   * The library authors `vermilion` as fresh urushi — clearcoat 0.92 at
   * roughness 0.10 over an ORM whose lacquer band sits at 0.13, with the
   * clearcoat normal at 0.35 so the film is very nearly optically flat. On a
   * 5 m round pillar that is one specular lobe wide enough to cover the whole
   * lit side and smooth enough to run unbroken from the nemaki to the nuki, and
   * a clean saturated field under an unbroken sheen is *exactly* the signature
   * of injection-moulded plastic. It also swallows the substrate: the grain is
   * in the albedo and in the normal, but front-lit it sits under a specular
   * term two stops brighter than the diffuse and never gets out.
   *
   * Four knobs. Three remove gloss rather than adding decoration:
   *  - the film thins to a third and roughens, so what is left is a band rather
   *    than a mirror;
   *  - the clearcoat normal goes past full strength, so the band that remains is
   *    chopped up by the grain underneath it instead of gliding over it — this
   *    is what makes it *broken*, and it is the one that matters;
   *  - `roughness` multiplies the ORM (three clamps the product, not the
   *    factor), so 2.6 takes the lacquer from 0.13 to 0.34 and pins the chipped
   *    wood at 1.0 — which is the whole point, a chip has to look *matte* next
   *    to the paint or it reads as a decal.
   *
   * The fourth adds one back, and it is not an aesthetic choice. Measured after
   * the first three: the lit face went (237, 76, 29) -> (228, 52, 11). Green
   * landed on the vermilion target, and blue fell off a cliff — because on a
   * post lit by a `#ffd9a8` key, whose blue is 0.40 of its red, and painted with
   * an albedo whose blue is 0.025 of *its* red, the reflected sky was carrying
   * essentially all of the blue in the pixel. Killing the gloss killed the only
   * cool path onto the surface and left a hotter, *more* saturated post than the
   * one being complained about. So the env term goes up rather than down: on a
   * `MeshStandardMaterial` it scales the diffuse irradiance as well as the
   * specular, and the diffuse half is the cool sky bounce ARCHITECTURE §5 says
   * a shadow must never be without. The chalk tint on `color` does the rest —
   * an old torii is bleached, and bleached means desaturated toward the sky, not
   * simply darker.
   */
  _weatherUrushi(m) {
    // Only as a *multiplier*. Without a roughness map the 2.6 would clamp to a
    // dead matte, which is the opposite failure.
    m.roughness = m.roughnessMap ? 2.6 : Math.min(1, (m.roughness || 0.48) * 1.5);
    // No envMapIntensity here, and none anywhere else in this file, however much a
    // per-material cool bounce is wanted. three r180 WebGLRenderer.setProgram:
    //   if (material.isMeshStandardMaterial && material.envMap === null &&
    //       scene.environment !== null) m_uniforms.envMapIntensity.value =
    //       scene.environmentIntensity;
    // Sky.js sets scene.environment and Lighting.js solves scene.environmentIntensity
    // every frame, and nothing in this file ever assigns material.envMap — so all
    // three conditions hold for every material here and the authored value is
    // overwritten before it is ever uploaded. Four of them (1.35, 2.4, 1.9, 2.6) sat
    // in this file across several rounds doing nothing at all. The levers that do
    // survive on a Props material are color, roughness, metalness and emissive.
    if (m.normalScale) m.normalScale.set(2.15, 2.15);
    m.aoMapIntensity = 1.25;
    if (m.color) m.color.setRGB(0.78, 0.95, 2.05);
    if ('clearcoat' in m) {
      m.clearcoat = 0.30;
      m.clearcoatRoughness = 0.34;
      if (m.clearcoatNormalScale) m.clearcoatNormalScale.set(1.75, 1.75);
    }
  }

  /**
   * 花崗岩 the lantern stonework.
   *
   * A kasuga-dōrō is dressed granite in six dry-stacked pieces, and it was
   * borrowing `stone` at repeat 1 — a texture whose dominant feature is a 7x7
   * worley crack net over 2x3 slab joints, authored for shrine *steps*. Wrapped
   * once around a 2 m lantern those cracks are 12 cm apart and the whole prop
   * reads as crazed clay; worse, Terrain adopts the same normal map as its
   * ground detail, so the lantern wore the courtyard's own crack web and lost
   * its identity as a separate object.
   *
   * `MaterialLibrary` is re-deriving a dedicated lantern granite — a mineral
   * speckle without the paving damage layer. This resolves the first name it
   * offers so the swap is a no-op here when it lands; until then the fallback
   * is `stone` tiled hard enough that the crack net drops below the size the eye
   * reads as damage and becomes what granite actually looks like at 4 m: grain.
   */
  get lanternStoneMaterial() {
    if (this._lanternStone) return this._lanternStone;
    let m = null;
    for (const name of LANTERN_STONE_NAMES) {
      m = this._libMaterial(name, 1);
      if (m) break;
    }
    if (!m) {
      m = this._libMaterial('stone', LANTERN_STONE_REPEAT)
        || this._fallbackMaterial('stone', LANTERN_STONE_REPEAT);
      if (m.normalScale) m.normalScale.set(LANTERN_STONE_NORMAL, LANTERN_STONE_NORMAL);
      m.aoMapIntensity = LANTERN_STONE_AO;
    }
    m.vertexColors = true;
    m.name = 'prop:lanternStone';
    this.ctx?.sky?.applyFog?.(m);
    m.needsUpdate = true;
    this._lanternStone = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * The flame itself. No albedo — a fire is not a lit surface — and an emissive
   * well past the transfer function's white point so the aperture clips and the
   * bloom prefilter has something real to find. `Level.update` breathes the
   * intensity around this base.
   */
  get emberMaterial() {
    if (this._ember) return this._ember;
    const m = new MeshStandardMaterial({
      color: 0x000000,
      emissive: new Color(EMISSIVE.flame.color),
      emissiveIntensity: EMISSIVE.flame.intensity,
      roughness: 1, metalness: 0, vertexColors: true,
      fog: false,
    });
    m.name = 'prop:ember';
    // Deliberately NOT fogged: aerial perspective on a light source washes the one
    // thing in frame that is supposed to be brighter than the air in front of it.
    this._ember = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * Lit paper — the hibukuro glow shell and the chōchin body. Carries the real
   * paper albedo so it still has grain, plus an emissive that puts the *centre*
   * of a panel just under the 2.2-linear mark where the grade reaches 250.
   *
   * The vertex colour is routed onto the emissive, the same trick `glowPool`
   * uses and for the same reason: on a self-lit surface the diffuse term is
   * three orders of magnitude below the emissive, so a gradient baked into
   * `vColor` was multiplying a number nobody could see. Routed, it becomes the
   * only thing that separates paper from a cutout in white card — the panel is
   * hot opposite the flame and cools toward the ribs and the frame it is pasted
   * to (`_paperFalloff` bakes the profile).
   */
  get lanternPaperMaterial() {
    if (this._litPaper) return this._litPaper;
    const src = this._libMaterial('paper', 1);
    let m;
    if (src) {
      m = src;
      // Transmission routes the surface through the transmissive pass, where an
      // emissive lantern reads as a dim frosted pane rather than a lamp.
      m.transmission = 0;
      m.transparent = false;
      m.opacity = 1;
      m.roughness = 0.85;
    } else {
      m = new MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.85, metalness: 0 });
    }
    m.emissive = new Color(EMISSIVE.paper.color);
    m.emissiveIntensity = EMISSIVE.paper.intensity;
    m.vertexColors = true;
    m.side = DoubleSide;
    m.name = 'prop:lanternPaper';
    this._installWind(m);
    const prevCompile = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      if (prevCompile) prevCompile.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif',
      );
    };
    // `_installWind` stamps the key every cloth material shares; this one's
    // fragment stage differs, so it needs its own or three hands it a program
    // compiled without the routing.
    m.customProgramCacheKey = () => 'kagLitPaper1';
    this._litPaper = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * The warm pool a lantern throws on the flagstone. `Lighting.requestLight` is a
   * transient spark pool — 0.35 s envelope, a handful of slots shared with combat
   * impacts — so it cannot hold a standing lantern light, and a real point light
   * per lantern is not in the draw budget. This is the spill, baked: a soft disc
   * under each lantern, kept below the bloom threshold so it warms without glowing.
   */
  get glowPoolMaterial() {
    if (this._pool) return this._pool;
    const m = new MeshStandardMaterial({
      color: 0x000000,
      emissive: new Color(EMISSIVE.pool.color),
      emissiveIntensity: EMISSIVE.pool.intensity,
      roughness: 1, metalness: 0, vertexColors: true,
      // Light must add to the flagstone rather than cover it with a translucent
      // black card. With normal alpha blending, the zero-emissive rim replaced
      // 85% of the ground with black and drew a dark ring around every pool.
      transparent: true, opacity: 0.38, blending: AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    m.name = 'prop:glowPool';
    // Vertex colour multiplies diffuse, and this material has none — so route it
    // onto the emissive instead, which is what makes the disc fade out at its rim
    // instead of ending on a hard circle.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif',
      );
    };
    m.customProgramCacheKey = () => 'kagPool1';
    this.ctx?.sky?.applyFog?.(m);
    this._pool = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * Polished gold leaf. Metal produces nothing at all as flat diffuse; what makes
   * a gaku plaque or a ridge cap read at magic hour is a tight specular lobe over
   * a bright environment, so the roughness comes down and the env contribution
   * goes up relative to the library's aged-leaf default.
   */
  get goldPolishedMaterial() {
    if (this._goldPol) return this._goldPol;
    const m = this._libMaterial('gold', 1) || new MeshStandardMaterial({ color: 0xc9a227 });
    m.metalness = 1.0;
    m.roughness = 0.16;
    // No envMapIntensity — three overwrites it from scene.environmentIntensity for
    // any MeshStandardMaterial with envMap === null. See _weatherUrushi.
    m.vertexColors = true;
    m.name = 'prop:goldPolished';
    this.ctx?.sky?.applyFog?.(m);
    this._goldPol = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * 桜 the sacred tree's blossom: an alpha-tested cutout, never the opaque banner
   * cloth it used to borrow. `alphaTest` matches the 0.36 that Foliage uses for the
   * equivalent cards so the two read as the same species of foliage in one frame.
   *
   * The map is bound late on purpose — `FoliageSystem` boots *after* Level (see the
   * step order in main.js), so at build time its texture does not exist yet.
   * `bindFoliageTextures` swaps the real card in on the first frame that Foliage is
   * up; until then (and if it never comes up) the local fallback carries it, so the
   * tree is never opaque rectangles regardless of boot order or failure.
   */
  get blossomMaterial() {
    if (this._blossom) return this._blossom;
    const m = new MeshStandardMaterial({
      color: 0xf6e2e4,                 // Foliage's sakura tint: blush, not pink
      roughness: 0.86, metalness: 0,
      map: this.blossomFallbackTexture,
      alphaTest: 0.36,
      transparent: false,              // cutout, not blend — no sort, no depth mess
      side: DoubleSide,
      vertexColors: true,
    });
    m.name = 'prop:blossom';

    // Translucency floor.
    //
    // A plain alpha-tested cutout has no path for sky bounce to reach a face
    // turned away from the sun, so every clump's shadow half went near-black
    // maroon and the crown's mean colour was carried entirely by the few sunlit
    // clusters. Petals are thin and scatter from every direction, so the honest
    // fix is an ambient term that is *tinted by the petal's own albedo* — the
    // shadow half then reads as blush lit by cool sky rather than as dead
    // material. The tint is deliberately cool (ARCHITECTURE §5's `#4a6b8f`
    // bounce) because the amber key crushes blue 7.5x; blush only exists on the
    // shadowed side, and only if there is a blue path for it.
    const prevCompile = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      if (prevCompile) prevCompile.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  // ...but a *flat* floor is a fill light with no direction in it, and a canopy is
  // read almost entirely by the value break between its sunlit crown and its shaded
  // underside. Round 8 measured that break at 0.86 — the underside was fractionally
  // *brighter* than the top — where a backlit canopy needs about 3:1, and this term
  // was why: the same vec3 was added to every fragment of the crown and of the
  // underside alike, and at 0.155/0.200/0.268 it is a large fraction of what a shaded
  // petal returns at all.
  //
  // Sky bounce is not isotropic. A petal facing up sees the whole dome; one facing
  // down sees the ground, which at magic hour is dim ochre. 'normal' here is already
  // flipped for back faces by <normal_fragment_begin> (this material is DoubleSide),
  // so the sign is honest for both sides of a card. viewMatrix's upper 3x3 is
  // orthonormal, so its transpose is its inverse and this costs three dots.
  //
  // Levels: crown 0.202/0.238/0.276 (luma 0.233), underside 0.052/0.070/0.100
  // (luma 0.068) — a 3.42:1 emissive-floor ratio against the flat term's 1.00:1,
  // with the crown left slightly brighter than before rather than darker. The
  // underside stays the more strongly blue-weighted of the two (B/R 1.92 against
  // the crown's 1.37) because what reaches it *is* the cool bounce of §5.
  // The falloff between those two ends was squared, and there is no reason for it to
  // be. The cosine-weighted fraction of the dome a plane of normal n can see is exactly
  // (1 + n.y) / 2 — linear. Squaring it holds the two endpoints and pulls everything
  // between them down: over the sphere E[sv^2] = 1/3 against E[sv] = 1/2, so the mean
  // emissive floor across a tumbled canopy came out a third lower than the flat term it
  // replaced (luma 0.123 against 0.195), which is the standing "the canopy emits less
  // than it did". Linear puts that back at the angles that were wrong — an edge-on card
  // goes 0.110 -> 0.151 luma, the sphere mean 0.123 -> 0.151, +22.3% — and leaves the
  // crown (0.233), the underside (0.068) and the 3.42:1 break they make byte-identical.
  vec3 kgUpN = normalize(normal * mat3(viewMatrix));
  float kgSkyView = 0.5 + 0.5 * kgUpN.y;
  totalEmissiveRadiance += diffuseColor.rgb *
    (vec3(0.052, 0.070, 0.100) + vec3(0.150, 0.168, 0.176) * kgSkyView);`,
      );
    };
    this._installWind(m);
    // `_installWind` stamps its own cache key, which other cloth materials share.
    // This one's shader differs, so it needs a key of its own or three can hand
    // it a program compiled for a material without the translucency patch.
    m.customProgramCacheKey = () => 'kagBlossom3';
    this.ctx?.sky?.applyFog?.(m);
    this._blossom = m;
    this.disposables.push(m);
    return m;
  }

  get blossomFallbackTexture() {
    if (!this._blossomTex) {
      this._blossomTex = blossomTexture(0x5a1201);
      this.disposables.push(this._blossomTex);
    }
    return this._blossomTex;
  }

  /**
   * Adopt `FoliageSystem`'s verified blossom card once it exists. Prefers the
   * documented public field, falls back to the internal table, and leaves the
   * local card in place if neither is there. Idempotent and safe to call every
   * frame until it takes.
   */
  bindFoliageTextures(foliage) {
    if (!foliage || this._blossomBound) return false;
    const tex = foliage.blossomTexture || foliage.tex?.blossom || null;
    if (!tex) return false;
    this._blossomBound = true;
    if (this._blossom && this._blossom.map !== tex) {
      this._blossom.map = tex;
      this._blossom.needsUpdate = true;
    }
    return true;
  }

  /**
   * The material on a per-cell shadow proxy. Three has no shadow-only object
   * (see `Level._realizeShadowProxies`), so the proxy is submitted to the colour
   * pass as well and made inert there: nothing written, nothing tested, drawn
   * before everything else. Only the depth material derived from it does work,
   * and that ignores every property here except `side` and alpha test.
   */
  get shadowProxyMaterial() {
    if (this._proxyMat) return this._proxyMat;
    const m = new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      // Depth *test* stays on, and Level draws the proxy after the scene, so by
      // the time it rasterizes the depth buffer already rejects nearly every
      // fragment. Writes are off, so it changes nothing it touches.
      depthTest: true,
      fog: false,
      side: FrontSide,
    });
    m.name = 'prop:shadowProxy';
    this._proxyMat = m;
    this.disposables.push(m);
    return m;
  }

  /** Wet stone — the chōzuya basin and the splash apron around it. */
  get wetStoneMaterial() {
    if (this._wetStone) return this._wetStone;
    const m = this._libMaterial('stone', 1.6) || new MeshStandardMaterial({ color: 0x8b8778 });
    m.roughness = 0.17;
    m.metalness = 0.03;
    // No envMapIntensity — three overwrites it from scene.environmentIntensity for
    // any MeshStandardMaterial with envMap === null. See _weatherUrushi.
    m.vertexColors = true;
    m.name = 'prop:wetStone';
    // Wet stone is darker than dry stone; the brightness comes from the specular.
    if (m.color) m.color.multiplyScalar(0.62);
    this.ctx?.sky?.applyFog?.(m);
    this._wetStone = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * Running and standing water. Near-mirror roughness over a bright env map is
   * where the glint comes from; the small emissive keeps the basin reading as a
   * lit surface even at angles where the sun lobe misses the camera.
   */
  get waterMaterial() {
    if (this._water) return this._water;
    const m = new MeshStandardMaterial({
      color: 0x6f8f99, roughness: 0.035, metalness: 0.05,
      emissive: new Color(EMISSIVE.water.color),
      emissiveIntensity: EMISSIVE.water.intensity,
      transparent: true, opacity: 0.72, vertexColors: true, depthWrite: false,
    });
    m.name = 'prop:water';
    // Time comes from the wind field's `uWind.w` so nothing in the level runs on
    // a private clock (ARCHITECTURE §10).
    const wu = () => this.ctx?.weather?.windUniforms;
    m.onBeforeCompile = (shader) => {
      const u = wu();
      if (!u) return;
      shader.uniforms.uWind = u.uWind;
      shader.uniforms.uGust = u.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uWind;\nuniform vec4 uGust;')
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          transformed.x += sin(uWind.w * 9.0 + transformed.y * 22.0) * 0.012;
          transformed.z += cos(uWind.w * 11.0 + transformed.y * 19.0) * 0.012;
        `);
    };
    m.customProgramCacheKey = () => 'kagWater2';
    this.ctx?.sky?.applyFog?.(m);
    this._water = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * 玉砂利 the courtyard flagstone, with the tile grid broken the way Terrain
   * breaks it (see `kgTiled` in Terrain.js). A plain planar lookup lays the
   * texture's own wrap seams across the plaza as two families of dead-straight
   * lines at exactly the tile pitch, and now that the surrounding ground no longer
   * has them the courtyard is the only thing in frame showing a grid.
   *
   * The same three techniques, in the same order:
   *   1. the lookup is domain-warped — a long wavelength to decorrelate distant
   *      parts of the plaza, a short one to bend the seam itself;
   *   2. the whole frame is rotated by an irrational angle, so the courtyard grid
   *      can never agree with a terrain layer on a direction;
   *   3. a second lookup at 0.617x scale is blended under a low-frequency mask,
   *      which destroys the period outright — a repeat is only legible if the
   *      *same* stones come back.
   * Plus Terrain's large-scale weathering mask, scrubbed clean along the
   * processional axis where feet have polished the stone.
   */
  get groundMaterial() {
    if (this._ground) return this._ground;
    const m = this._libMaterial('cobble', 1) || this._fallbackMaterial('cobble', 1);
    m.vertexColors = true;
    m.name = 'prop:groundStone';

    const prev = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
    m.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(m, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKagGroundW;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvKagGroundW = (modelMatrix * vec4(transformed, 1.0)).xyz;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vKagGroundW;\n' + glslNoise + /* glsl */`
          vec2 kagRot(vec2 p, vec2 sc){ return vec2(p.x * sc.y - p.y * sc.x, p.x * sc.x + p.y * sc.y); }
          vec2 kagUvA; vec2 kagUvB; float kagBlend; float kagWear; float kagGn;
          // Every channel goes through this one function, so albedo, normal and
          // the packed ORM cannot disagree about where they are on the ground.
          vec4 kagGroundTex(sampler2D t){
            return mix(texture2D(t, kagUvA), texture2D(t, kagUvB), kagBlend);
          }
        `)
        // Establish the world-space frame once, at the top of main.
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + /* glsl */`
          {
            vec2 P = vKagGroundW.xz;
            vec2 wLo = vec2(fbm2(P * 0.0730 + 12.7, 2), fbm2(P * 0.0730 - 5.1, 2));
            vec2 wHi = vec2(fbm2(P * 0.3300 + 41.3, 1), fbm2(P * 0.3300 - 9.6, 1));
            vec2 q = P + wLo * 1.25 + wHi * 0.28;
            kagUvA = kagRot(q, vec2(0.3746, 0.9272)) * ${GROUND_UV_SCALE.toFixed(4)};
            kagUvB = kagRot(q + vec2(37.13, -18.77), vec2(0.7071, 0.7071)) * ${(GROUND_UV_SCALE * 0.617).toFixed(4)};
            kagGn = fbm2(P * 0.058 + 27.5, 2);
            kagBlend = smoothstep(-0.24, 0.24, kagGn);
            kagWear = 1.0 - smoothstep(1.6, 4.4, abs(P.x));
          }
        `);

      // Swap the sampler call in each stock chunk, leaving three's own logic —
      // defines, tangent frame, clearcoat/sheen branches — exactly as authored.
      const swap = (chunk, tex, uv) => {
        const src = ShaderChunk[chunk];
        if (!src) return;
        const rx = new RegExp('texture2D\\(\\s*' + tex + '\\s*,\\s*' + uv + '\\s*\\)', 'g');
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <' + chunk + '>', src.replace(rx, 'kagGroundTex( ' + tex + ' )'));
      };
      swap('map_fragment', 'map', 'vMapUv');
      swap('normal_fragment_maps', 'normalMap', 'vNormalMapUv');
      swap('roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv');
      swap('metalnessmap_fragment', 'metalnessMap', 'vMetalnessMapUv');
      swap('aomap_fragment', 'aoMap', 'vAoMapUv');

      // Terrain's weathering mask, applied after the albedo lookup: grime in the
      // hollows, scrubbed out of the traffic band down the middle of the sandō.
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor *= sampledDiffuseColor;', /* glsl */`
        diffuseColor *= sampledDiffuseColor;
        {
          float weather = clamp((kagGn * 0.5 + 0.5) * 0.8 - kagWear * 0.75, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.76, weather * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.12, 1.06), kagWear * 0.75);
        }
      `);
    };
    m.customProgramCacheKey = () => 'kagGround2';
    this.ctx?.sky?.applyFog?.(m);
    this._ground = m;
    this.disposables.push(m);
    return m;
  }

  /**
   * Bend a cloth/paper material with the shared wind field. The uniform objects
   * are spliced in **by identity** so a gust crossing the bamboo is the same gust
   * that snaps the nobori beside it (ARCHITECTURE §5.5, §10).
   */
  _installWind(mat) {
    const ctx = this.ctx;
    const prev = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(mat, shader, renderer);
      const u = ctx?.weather?.windUniforms;
      if (!u) return;                     // no Weather: props stand still, deliberately
      shader.uniforms.uWind = u.uWind;
      shader.uniforms.uGust = u.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFlutter;\n' + WIND_GLSL)
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          {
            #ifdef USE_INSTANCING
              vec3 kagWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            #else
              vec3 kagWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            #endif
            transformed += kagerouBend(kagWp, aFlutter.x, aFlutter.y);
          }
        `);
    };
    mat.customProgramCacheKey = () => 'kagWindShared1';
  }

  // ------------------------------------------------------------- build util

  static build() {
    return { parts: [], colliders: [], lights: [], anchors: {}, bounds: { r: 1, h: 1 } };
  }

  /** Push a geometry into a build under a material name. Normalizes on the way in. */
  static add(build, geometry, material) {
    if (!geometry) return build;
    normalizeGeo(geometry, CLOTH_MATERIALS.has(material));
    build.parts.push({ geometry, material });
    return build;
  }

  static addCollider(build, geometry, surface, blocking = true, walkable = false) {
    if (!geometry) return build;
    build.colliders.push({ geometry, surface, blocking, walkable });
    return build;
  }

  /** Axis-aligned collision box; `y` is the bottom, not the centre. */
  static boxCollider(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
    const g = new BoxGeometry(w, h, d);
    const m = new Matrix4().makeRotationY(ry);
    m.setPosition(x, y + h * 0.5, z);
    g.applyMatrix4(m);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g;
  }

  /** Merge a build's parts down to one geometry per material. */
  static compact(build) {
    const byMat = new Map();
    for (const p of build.parts) {
      let list = byMat.get(p.material);
      if (!list) { list = []; byMat.set(p.material, list); }
      list.push(p.geometry);
    }
    const parts = [];
    for (const [material, list] of byMat) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (g) parts.push({ geometry: normalizeGeo(g, CLOTH_MATERIALS.has(material)), material });
    }
    build.parts = parts;
    return build;
  }

  // =====================================================================
  //  鳥居  TORII — the hero prop
  // =====================================================================

  /**
   * A myōjin-style gate. Everything is proportional to `h`, the height of the
   * underside of the shimaki, which is how a carpenter would actually set it out.
   *
   * Parts, bottom to top: nemaki stone collar, battered and tapered round pillars
   * with entasis, the nuki crossbeam driven through them and protruding, the
   * gakuzuka strut with its plaque, the shimaki, and the kasagi — the curved top
   * lintel whose upturned ends are the entire silhouette of the thing.
   */
  torii(opts = {}) {
    const h = opts.height ?? 5.0;
    const s = h / 5.0;
    const rnd = makeRandom(opts.seed ?? 7);
    const b = PropFactory.build();

    const span = (opts.span ?? 4.3) * s;      // pillar centre to pillar centre
    const rBase = 0.235 * s;
    const rTop = 0.196 * s;
    const batter = 0.052 * s * (h / 5.0);     // top leans inward
    const halfSpan = span * 0.5;

    const nukiY = h * 0.735;
    const nukiH = 0.30 * s, nukiD = 0.26 * s, nukiOut = 0.46 * s;
    const shimakiL = span + 1.62 * s;
    const shimakiH = 0.30 * s, shimakiD = 0.56 * s;
    const kasagiL = span + 2.16 * s;
    const kasagiH = 0.30 * s, kasagiD = 0.70 * s;
    const sori = 0.20 * s;                    // arc rise at the ends
    const flick = 0.13 * s;                   // extra kick in the last tenth

    // 20 columns and 26 rings, up from 12 and 9. Both are carrying the grain:
    // the streaks in `axialGrain` are per-vertex, so the column count sets how
    // many grain lines run up the post (20 around a 1.4 m circumference is a
    // 7 cm line, about right for old cedar) and the ring count sets how far a
    // stain or a run can travel before it has to be straight.
    const pillarProfile = circleProfile(20);
    const SEG = 26;

    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      const x0 = sx * halfSpan;
      const samples = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        // Entasis: a shallow swell at a third height keeps the column from
        // reading as a cone. Real torii have it and you feel it more than see it.
        const swell = Math.sin(t * Math.PI) * 0.012 * s;
        const r = lerp(rBase, rTop, t * t * 0.82 + t * 0.18) + swell;
        samples.push({
          x: x0 - sx * batter * t * t,
          y: h * t + (i === 0 ? -0.14 * s : 0),
          z: 0,
          sx: r * 2, sy: r * 2,
          ao: lerp(0.52, 1.0, smoothstep(0, 0.28, t)),
        });
      }
      const pillar = sweepProfile(samples, pillarProfile, { smooth: true, uvScale: 0.9, capStart: false });
      bakeAO(pillar, { ground: 0.42, groundH: 0.55 * s, cavity: 0.12, down: 0.2, floor: 0.34 });
      weatherBand(pillar, 0.0, 1.05 * s, 0.70, 0.66, 0.60, 0.22);
      axialGrain(pillar, x0, 0, 0.115, s, 0.55);
      // Water sheets off both faces of the nuki and runs the height of a man
      // down the post below it.
      runoffStain(pillar, nukiY - nukiH * 0.5, 2.1 * s, x0, 0, 0.38);
      PropFactory.add(b, pillar, 'vermilion');

      // Bare grey wood showing through where the lacquer has gone. Not only at
      // the foot: paint fails wherever water sits or a hand touches, so the
      // flakes climb the whole post with a bias toward the wet end.
      this._lacquerChips(b, x0, 0, rBase, h * 0.80, 22, rnd, s);

      // 根巻き nemaki — the stone collar that keeps the post out of the wet.
      const collar = sweepProfile([
        { x: x0, y: -0.06 * s, z: 0, sx: (rBase + 0.075 * s) * 2, sy: (rBase + 0.075 * s) * 2, ao: 0.5 },
        { x: x0, y: 0.20 * s, z: 0, sx: (rBase + 0.062 * s) * 2, sy: (rBase + 0.062 * s) * 2, ao: 0.72 },
        { x: x0, y: 0.30 * s, z: 0, sx: (rBase + 0.030 * s) * 2, sy: (rBase + 0.030 * s) * 2, ao: 0.9 },
      ], circleProfile(12), { smooth: true, capStart: false, uvScale: 1.4 });
      roughen(collar, 0.011 * s, 5.0);
      bakeAO(collar, { ground: 0.5, groundH: 0.3 * s, cavity: 0.2, floor: 0.35 });
      PropFactory.add(b, collar, 'stone');

      PropFactory.addCollider(b, PropFactory.boxCollider(
        rBase * 2.3, h, rBase * 2.3, x0, 0, 0), 'wood', true, false);
    }

    // 貫 nuki — driven through both pillars, protruding with a chamfered end.
    {
      const half = halfSpan + nukiOut;
      const samples = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = lerp(-half, half, t);
        const taper = 1 - Math.pow(Math.abs(t * 2 - 1), 6) * 0.22;
        samples.push({ x, y: nukiY, z: 0, sx: nukiD * taper, sy: nukiH * taper, ao: 0.92 });
      }
      const nuki = sweepProfile(samples, rectProfile(0.16), { ref: [0, 0, -1], uvScale: 1.0 });
      bakeAO(nuki, { ground: 0, cavity: 0.22, down: 0.34, floor: 0.4 });
      beamGrain(nuki, 0.10, s, 0.55);
      PropFactory.add(b, nuki, 'vermilion');
      // Four long arrises, both protruding ends, and the two shoulders where the
      // beam leaves the pillar — where a passer-by's shoulder and a century of
      // frost have taken the paint off.
      this._arrisChips(b, (t) => {
        const taper = 1 - Math.pow(Math.abs(t * 2 - 1), 6) * 0.22;
        return { x: lerp(-half, half, t), y: nukiY, z: 0, hy: nukiH * 0.5 * taper, hz: nukiD * 0.5 * taper, slope: 0 };
      }, 26, rnd, s);
      // Cut ends: the sawn face is end grain, and end grain never holds paint.
      // The section is 0.78 of full at the tip and chamfered, so the plate has
      // to fit inside the octagon rather than inside the rectangle.
      for (const e of [-1, 1]) {
        this._endGrain(b, e * half, nukiY, 0, nukiD * 0.312, nukiH * 0.312, e, s, rnd);
      }
      PropFactory.addCollider(b, PropFactory.boxCollider(
        half * 2, nukiH, nukiD, 0, nukiY - nukiH * 0.5, 0), 'wood', true, false);
    }

    // 額束 gakuzuka — centre strut, with the shrine plaque hung on it.
    {
      const y0 = nukiY + nukiH * 0.5 - 0.02 * s;
      const y1 = h - shimakiH * 0.1;
      const strut = sweepProfile([
        { x: 0, y: y0, z: 0, sx: 0.20 * s, sy: 0.19 * s, ao: 0.62 },
        { x: 0, y: y1, z: 0, sx: 0.19 * s, sy: 0.18 * s, ao: 0.9 },
      ], rectProfile(0.14), { uvScale: 1.2 });
      bakeAO(strut, { ground: 0, cavity: 0.3, down: 0.3, floor: 0.38 });
      PropFactory.add(b, strut, 'vermilion');
      // The strut stands in the rain with nothing over it but the shimaki, so
      // its arrises go first. `hy` is the half-width in X for a vertical member.
      this._arrisChips(b, (t) => ({
        x: 0, y: lerp(y0, y1, t), z: 0, hy: 0.100 * s, hz: 0.095 * s, slope: 0,
      }), 7, rnd, s, { axis: 'y' });

      // 額 the plaque. Dead centre of the god-ray shot, so the leaf is a chamfered
      // raised frame rather than a flat face: the bevels present several different
      // normals to a 13° sun, and one of them always catches it.
      const plaqueH = (y1 - y0) * 0.62;
      const plaqueW = 0.46 * s;
      const board = new BoxGeometry(plaqueW * 0.86, plaqueH * 0.84, 0.05 * s);
      board.translate(0, (y0 + y1) * 0.5, 0.16 * s);
      normalizeGeo(board);
      bakeAO(board, { ground: 0, cavity: 0.25, down: 0.3, floor: 0.42 });
      tintGeo(board, 0.44, 0.36, 0.28);
      PropFactory.add(b, board, 'cedar');

      const frame = sweepProfile([
        { x: 0, y: (y0 + y1) * 0.5, z: 0.115 * s, sx: plaqueW, sy: plaqueH, ao: 0.8 },
        { x: 0, y: (y0 + y1) * 0.5, z: 0.175 * s, sx: plaqueW * 1.06, sy: plaqueH * 1.05, ao: 1.0 },
        { x: 0, y: (y0 + y1) * 0.5, z: 0.215 * s, sx: plaqueW * 0.90, sy: plaqueH * 0.88, ao: 1.0 },
      ], rectProfile(0.14), { ref: [1, 0, 0], uvScale: 2.2, capStart: false, capEnd: false });
      PropFactory.add(b, frame, '__goldPolished');
    }

    // 島木 shimaki and 笠木 kasagi — the curved pair that crowns the gate.
    const curved = (length, height, depth, yAt, rise, kick, profile, aoTop) => {
      const N = 21;
      const samples = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const u = t * 2 - 1;
        const x = u * length * 0.5;
        const y = yAt + rise * u * u + kick * Math.pow(Math.abs(u), 8);
        const taper = 1 - Math.pow(Math.abs(u), 3) * 0.16;
        samples.push({ x, y, z: 0, sx: depth * taper, sy: height * taper, ao: aoTop });
      }
      return sweepProfile(samples, profile, { ref: [0, 0, -1], uvScale: 1.0 });
    };

    /** The same curve `curved` sweeps, sampled for chips and end grain. */
    const curvePath = (length, height, depth, yAt, rise, kick) => (t) => {
      const u = t * 2 - 1;
      const taper = 1 - Math.pow(Math.abs(u), 3) * 0.16;
      const du = 2 / length;                       // d(u)/d(x)
      return {
        x: u * length * 0.5,
        y: yAt + rise * u * u + kick * Math.pow(Math.abs(u), 8),
        z: 0,
        hy: height * taper * 0.5,
        hz: depth * taper * 0.5,
        slope: (2 * rise * u + 8 * kick * Math.pow(Math.abs(u), 7) * Math.sign(u)) * du,
      };
    };

    const shimaki = curved(shimakiL, shimakiH, shimakiD, h + shimakiH * 0.5, sori * 0.55, flick * 0.5, rectProfile(0.10), 0.88);
    bakeAO(shimaki, { ground: 0, cavity: 0.2, down: 0.42, floor: 0.36 });
    beamGrain(shimaki, 0.095, s, 0.55);
    PropFactory.add(b, shimaki, 'vermilion');
    // rectProfile(0.10) puts its planed facets at 0.90 of the half-section.
    this._arrisChips(b, curvePath(shimakiL, shimakiH, shimakiD, h + shimakiH * 0.5, sori * 0.55, flick * 0.5), 22, rnd, s,
      { corners: [[0.90, 0.90], [0.90, -0.90], [-0.90, 0.90], [-0.90, -0.90]] });

    const kasagiY = h + shimakiH + kasagiH * 0.5;
    // 0.055 of the section is a 4 cm planed arris on a 5 m gate — the size a
    // carpenter actually takes off, and enough to hold its own highlight.
    const kasagi = curved(kasagiL, kasagiH, kasagiD, kasagiY, sori, flick, kasagiProfile(0.055), 1.0);
    bakeAO(kasagi, { ground: 0, cavity: 0.16, down: 0.4, floor: 0.38 });
    beamGrain(kasagi, 0.09, s, 0.55);
    PropFactory.add(b, kasagi, 'vermilion');
    const kasagiPath = curvePath(kasagiL, kasagiH, kasagiD, kasagiY, sori, flick);
    // A kasagi is five-sided: two planed soffit arrises at 0.945 of the section
    // and two shoulder breaks where the vertical face turns into the slope.
    this._arrisChips(b, kasagiPath, 20, rnd, s, {
      corners: [[-0.945, -0.945], [-0.945, 0.945], [0.32, -1.0], [0.32, 1.0]],
    });
    // The kasagi section loses width above the shoulder, so its end plate sits
    // low in the face and stays clear of the sloped top.
    for (const e of [-1, 1]) {
      const p = kasagiPath(e < 0 ? 0 : 1);
      this._endGrain(b, p.x, p.y - p.hy * 0.16, 0, p.hz * 0.80, p.hy * 0.58, e, s, rnd, p.slope);
    }

    // Copper cap along the ridge of the kasagi — one bright specular line that
    // separates the gate from the sky at magic hour.
    const cap = curved(kasagiL * 0.995, kasagiH * 0.28, kasagiD * 0.34, kasagiY + kasagiH * 0.42, sori, flick, rectProfile(0.3), 1.0);
    tintGeo(cap, 0.85, 0.9, 0.95);
    PropFactory.add(b, cap, 'steelDark');

    b.anchors.ropeLeft = [-halfSpan + 0.1 * s, nukiY - 0.1 * s, 0];
    b.anchors.ropeRight = [halfSpan - 0.1 * s, nukiY - 0.1 * s, 0];
    b.anchors.top = [0, kasagiY + kasagiH, 0];
    b.anchors.span = [span, h, 0];
    b.bounds = { r: kasagiL * 0.5 + 0.2, h: kasagiY + kasagiH };
    return b;
  }

  /**
   * The tint that turns the cedar albedo into the *grey* wood under failed
   * paint. Cedar is authored as `#5a4436`, a warm dark brown — correct for a
   * sheltered beam, wrong for timber that has been in the weather since the
   * lacquer left it. Wood that has lost its finish silvers: the lignin goes and
   * what is left scatters neutrally. So the tint is not a brightening, it is a
   * strong blue lift on top of one — which keeps cedar's grain (the chip is
   * still sampling the cedar map) while landing the mean near `#9a938c`.
   *
   * It matters that this is grey and not brown. A warm chip on a warm-red post
   * is a value difference; a grey chip is a *hue* difference, and hue survives
   * a bright key where value does not.
   */
  static _bareWood(g, rnd, k = 1) {
    tintGeo(g, (2.35 + rnd() * 0.45) * k, (2.90 + rnd() * 0.50) * k, (3.30 + rnd() * 0.55) * k);
    return g;
  }

  /**
   * A patch of surface lying *on* a cylinder — the shape a flake of failed paint
   * actually is on a round post.
   *
   * A flat plate cannot do this job. The pillar is 47 cm across, so a 12 cm chord
   * across it sags 8 mm from the surface: a flat plate big enough to read at 3 m
   * either buries its middle in the post or lifts its ends off it by most of a
   * centimetre, and both of those read as a tab stuck on rather than as bare
   * wood in a hole. Two millimetres of clearance over a curved grid does not.
   */
  _cylPatch(cx, cz, radius, a0, halfA, y0, y1, cols = 4, rows = 2) {
    const verts = [], uvs = [], cols3 = [], idx = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const y = lerp(y0, y1, v);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const a = a0 + (u * 2 - 1) * halfA;
        verts.push(cx + Math.sin(a) * radius, y, cz + Math.cos(a) * radius);
        uvs.push(u * halfA * radius * 4, v * (y1 - y0) * 4);
        cols3.push(1, 1, 1);
      }
    }
    const W = cols + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // Wound so the face points *out* of the cylinder. Cedar is FrontSide;
        // the other order culls the whole patch and the chip simply is not there.
        const a = j * W + i, b2 = a + 1, c = a + W + 1, d = a + W;
        idx.push(a, c, d, a, b2, c);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols3), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Flakes of bare grey wood where the vermilion has come off a round post.
   *
   * Sat 2 mm proud of the pillar so the patch wins the depth test everywhere,
   * with the lacquer's lifted rim written into the border vertices — a chip is
   * legible because of its edge, not because of its middle.
   */
  _lacquerChips(build, cx, cz, radius, maxY, count, rnd, s) {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      // Biased low — the foot stays wet — but the whole post loses paint.
      const y = Math.pow(rnd(), 1.7) * maxY;
      const halfA = (0.10 + rnd() * 0.26);            // radians, ~2.5–8 cm of arc
      const hh = (0.06 + rnd() * 0.26) * s;
      const g = this._cylPatch(cx, cz, radius + 0.002 * s, a, halfA, y, y + hh, 4, 3);
      PropFactory._bareWood(g, rnd);
      // The rim of surrounding lacquer overhangs the hole it left.
      shadeGeo(g, (px, py, pz) => {
        const th = Math.atan2(pz - cz, px - cx);
        let da = Math.abs(th - a); if (da > Math.PI) da = Math.PI * 2 - da;
        const eu = 1 - clamp(da / halfA, 0, 1);
        const ev = Math.min((py - y) / (hh * 0.35), (y + hh - py) / (hh * 0.35));
        return lerp(0.46, 1.0, clamp(Math.min(eu * 3.2, ev), 0, 1));
      });
      parts.push(g);
    }
    if (!parts.length) return build;
    return PropFactory.add(build, mergeGeometries(parts, false), 'cedar');
  }

  /**
   * Chipped paint along the arrises of a swept beam.
   *
   * `path(t)` returns `{ x, y, z, hy, hz, slope }` — the beam centreline and its
   * half-section at `t`, plus dy/dx so a chip on the kasagi's upturned end sits
   * on the timber instead of floating off it. An arris is the one place on a
   * beam where the paint film has to bend over a hard edge, so it is the first
   * place it lets go; the plate is rolled 45° about the beam axis so it lies in
   * the planed chamfer facet rather than crossing it.
   *
   * `opts.corners` gives the arrises as `[fy, fz]` fractions of the half-section
   * — a five-sided kasagi has its edges somewhere other than a rectangle does,
   * and a chip aimed at a corner the section does not have floats in air.
   */
  _arrisChips(build, path, count, rnd, s, opts = {}) {
    const axisY = opts.axis === 'y';
    const corners = opts.corners || [[0.86, 0.86], [0.86, -0.86], [-0.86, 0.86], [-0.86, -0.86]];
    const parts = [];
    for (let i = 0; i < count; i++) {
      const p = path(rnd());
      const [fy, fz] = corners[(rnd() * corners.length) | 0];
      const len = (0.07 + rnd() * 0.24) * s;
      const wide = (0.030 + rnd() * 0.040) * s;
      const g = new BoxGeometry(axisY ? wide : len, axisY ? len : wide, 0.009 * s);
      const m = new Matrix4();
      const out = 0.004 * s;                     // proud of the facet, not in it
      if (axisY) {
        // `hy` is the half-width in X here, `hz` the half-width in Z.
        m.makeRotationY(Math.atan2(fy, fz));
        m.setPosition(p.x + fy * p.hy + Math.sign(fy) * out, p.y, p.z + fz * p.hz + Math.sign(fz) * out);
      } else {
        m.makeRotationZ(Math.atan(p.slope || 0));
        m.multiply(new Matrix4().makeRotationX(Math.atan2(-fy, fz)));
        m.setPosition(
          p.x,
          p.y + fy * p.hy + Math.sign(fy) * out,
          p.z + fz * p.hz + Math.sign(fz) * out,
        );
      }
      g.applyMatrix4(m);
      normalizeGeo(g);
      PropFactory._bareWood(g, rnd, 0.92);
      parts.push(g);
    }
    if (!parts.length) return build;
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    return PropFactory.add(build, merged, 'cedar');
  }

  /**
   * The sawn end of a beam. `nx` is +1 or -1 along X.
   *
   * A cut end shows growth rings, takes the weather straight into the fibres and
   * goes silver and checked within a decade, so it is never the same colour as
   * the painted long grain beside it. Two plates deep so the ring pattern has a
   * shadowed inner face, with the rings written into the vertex colour.
   */
  _endGrain(build, x, y, z, hz, hy, nx, s, rnd, slope = 0) {
    const g = new BoxGeometry(0.016 * s, hy * 2, hz * 2);
    const m = new Matrix4().makeRotationZ(Math.atan(slope || 0));
    m.setPosition(x - nx * 0.006 * s, y, z);
    g.applyMatrix4(m);
    normalizeGeo(g);
    PropFactory._bareWood(g, rnd, 0.88);
    // Growth rings, centred a little off the pith the way a sawn baulk is.
    const cy = y + hy * 0.22, cz = z - hz * 0.30;
    shadeGeo(g, (px, py, pz) => {
      const d = Math.hypot(py - cy, pz - cz);
      const ring = 0.5 + 0.5 * Math.sin(d / (0.013 * s) + noise.fbm2(py * 9, pz * 9, 2) * 1.4);
      return lerp(0.72, 1.06, ring);
    });
    return PropFactory.add(build, g, 'cedar');
  }

  // =====================================================================
  //  注連縄  SHIMENAWA
  // =====================================================================

  /**
   * Twisted straw rope with a catenary sag, tapering from a fat middle, hung with
   * shide zigzags and straw tassels. `span` is the horizontal distance between the
   * two anchors; `sag` is how far the belly drops below them.
   */
  shimenawa(opts = {}) {
    const span = opts.span ?? 4.0;
    const sag = opts.sag ?? 0.42;
    const rMid = opts.radius ?? 0.19;
    const rEnd = rMid * (opts.taper ?? 0.42);
    const shideCount = opts.shide ?? 5;
    const rnd = makeRandom(opts.seed ?? 31);
    const b = PropFactory.build();

    // 34 rather than 26: the belly has to carry lumps now, and a lump needs three
    // stations to exist. ~220 extra triangles on the two gates that carry a rope.
    const N = 34;
    const samples = [];
    const sd = (opts.seed ?? 31) * 0.017;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = t * 2 - 1;
      // cosh-ish belly; the ends are pulled up hard so it looks tied, not draped.
      const y = -sag * (1 - u * u) * (1 - 0.22 * u * u);
      // Rice straw is bound in handfuls and the plait tightens and slackens along
      // the span. A constant radius and a linear roll is a machine extrusion, and
      // round 8 measured exactly that: "perfectly regular chevron ribbing at
      // constant pitch along the entire span". Both are now modulated.
      //
      // The roll's derivative stays positive — 0.11 * 2.6 * |n'| is under 0.6
      // against the linear term's 1.0 — so the plait never reverses, which would
      // read as a fault in the rope rather than as a change of pitch.
      const lump = 1 + noise.noise2(t * 6.7 + sd, 1.9) * 0.17
                     + noise.noise2(t * 15.3 - sd, 4.4) * 0.055;
      const r = lerp(rEnd, rMid, Math.pow(1 - Math.abs(u), 0.55)) * lump;
      samples.push({
        x: u * span * 0.5,
        y: y + noise.noise2(t * 5.3 + sd, 7.1) * rMid * 0.10,
        z: noise.noise2(t * 4.1, 0.3) * 0.012 + noise.noise2(t * 9.1 + sd, 2.2) * rMid * 0.09,
        sx: r * 2, sy: r * 2 * (0.94 + noise.noise2(t * 8.1, 5.5) * 0.10),
        roll: Math.PI * 2.4 * (t + 0.11 * noise.noise2(t * 2.6 + sd, 3.3)),
        ao: lerp(0.78, 1.0, 1 - Math.abs(u) * 0.5),
      });
    }
    const rope = sweepProfile(samples, ropeProfile(14, 3, 0.17), { smooth: true, uvScale: 1.6, ref: [0, 0, -1] });
    bakeAO(rope, { ground: 0, cavity: 0.34, down: 0.3, floor: 0.34 });
    PropFactory.add(b, rope, 'rope');

    // Stray fibre. The rope's outline is otherwise a clean mathematical envelope,
    // and a straw rope's is not — it sheds. Six wisps, ~150 triangles, and they are
    // the only thing here that breaks the silhouette rather than the shading.
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + rnd() * 0.76;
      const u = t * 2 - 1;
      const bx = u * span * 0.5;
      const by = -sag * (1 - u * u) * (1 - 0.22 * u * u) - rMid * 0.55;
      const ang = rnd() * Math.PI * 2;
      const len = rMid * (0.9 + rnd() * 1.5);
      PropFactory.add(b, sweepProfile([
        { x: bx, y: by + rMid * 0.3, z: 0, sx: 0.016, sy: 0.016, ao: 0.55 },
        { x: bx + Math.cos(ang) * len * 0.5, y: by - len * 0.45, z: Math.sin(ang) * len * 0.5, sx: 0.010, sy: 0.010, ao: 0.8 },
        { x: bx + Math.cos(ang) * len, y: by - len, z: Math.sin(ang) * len * 0.9, sx: 0.004, sy: 0.004, ao: 1.0 },
      ], circleProfile(4), { smooth: true, uvScale: 3 }), 'rope');
    }

    // 紙垂 shide — folded paper zigzags, and the straw tassels between them.
    for (let i = 0; i < shideCount; i++) {
      const t = (i + 0.5) / shideCount;
      const u = t * 2 - 1;
      const x = u * span * 0.42;
      const y = -sag * (1 - u * u) * (1 - 0.22 * u * u) - rMid * 0.8;
      // Sized off the rope, not absolute. The great gate's rope is 0.31 m thick and
      // its shide were 0.13 m wide and 0.4 m long — a twelfth of the gate's span,
      // hung dead flat against a rope four times their width, which is why the
      // review reported "no shide" on a prop that has had five of them all along.
      // A real shide hangs roughly three rope-diameters and is about as wide as the
      // rope is thick.
      const sw = rMid * (0.82 + rnd() * 0.22);
      const sh = rMid * (2.7 + rnd() * 1.0);
      const g = this._shide(sw, sh, rnd);
      g.translate(x, y, rMid * 0.55);
      // Paper shide: limp, hanging free below the rope.
      bakeFlutter(g, 0.55, (px, py) => clamp((y - py) / Math.max(0.12, sh), 0, 1));
      PropFactory.add(b, g, 'paper');

      if (i < shideCount - 1) {
        const tx = lerp(u, ((i + 1.5) / shideCount) * 2 - 1, 0.5) * span * 0.42;
        const ty = -sag * (1 - (tx / (span * 0.5)) ** 2) - rMid * 0.7;
        const tas = sweepProfile([
          { x: tx, y: ty, z: 0, sx: rMid * 0.42, sy: rMid * 0.42, ao: 0.6 },
          { x: tx + (rnd() - 0.5) * rMid * 0.2, y: ty - rMid * (1.1 + rnd() * 0.6), z: 0, sx: rMid * 0.16, sy: rMid * 0.16, ao: 0.95 },
        ], circleProfile(6), { smooth: true, uvScale: 2 });
        PropFactory.add(b, tas, 'rope');
      }
    }

    b.bounds = { r: span * 0.5, h: sag + rMid * 4.2 + 0.4 };
    return b;
  }

  /** One folded paper streamer: alternating quads stepping down and sideways. */
  _shide(w, h, rnd) {
    const folds = 4;
    const verts = [];
    const uvs = [];
    const cols = [];
    const idx = [];
    let y = 0;
    let x = -w * 0.5;
    const step = h / folds;
    for (let i = 0; i < folds; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const x0 = x, x1 = x + dir * w;
      const y0 = y, y1 = y - step;
      const base = verts.length / 3;
      const jitter = (rnd() - 0.5) * 0.012;
      verts.push(x0, y0, 0, x1, y0, jitter, x1, y1, jitter, x0, y1, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      const c0 = 1 - i * 0.06;
      for (let k = 0; k < 4; k++) cols.push(c0, c0, c0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      x = x1;
      y = y1;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // =====================================================================
  //  石灯籠  STONE LANTERN (kasuga-dōrō)
  // =====================================================================

  /**
   * Six stones dry-stacked: kiso, sao, chūdai, hibukuro (fire box, pierced with
   * a full moon and a crescent), kasa with upturned warabi-te corners, and the
   * hōju jewel. The fire box gets an emissive core and, when the lighting system
   * will take it, a real flickering point light.
   *
   * **The joints are the prop.** These used to be six profiles pushed into one
   * array, merged, and given a single `bakeAO` over the merged bounding box —
   * which meant the AO could only see one object, so no interface between two
   * stones got any darkening at all, the silhouette flowed smoothly from footing
   * to firebox, and the whole thing read as one extruded column of crazed clay
   * rather than as masonry. Each course is now built, chipped, roughened and
   * AO'd *on its own bounds*, then seated: the bottom few centimetres of every
   * course go dark and the exposed top of the course beneath it goes dark under
   * it, so there is a real shadowed line at every joint. Where the geometry
   * allows, the course above is also undercut — a narrow neck below a wider
   * stone throws a line that survives any light direction, which vertex AO
   * alone cannot promise.
   */
  stoneLantern(opts = {}) {
    const H = opts.height ?? 2.05;
    const s = H / 2.05;
    const rnd = makeRandom(opts.seed ?? 91);
    const b = PropFactory.build();
    const hex = hexProfile();

    /** Courses, each with the y-span its neighbours have to seat against. */
    const courses = [];
    const course = (geo, y0, y1, opts2 = {}) => {
      courses.push({ geo, y0, y1, chip: opts2.chip ?? 1, seat: opts2.seat !== false });
      return geo;
    };

    // 基礎 kiso — a plinth, not a mound. Straight die, chamfered cap, top pad.
    // Half-sunk: Level beds it 4 cm into the flagstone.
    course(sweepProfile([
      { x: 0, y: -0.12 * s, z: 0, sx: 0.66 * s, sy: 0.66 * s, ao: 0.40 },
      { x: 0, y: 0.03 * s, z: 0, sx: 0.64 * s, sy: 0.64 * s, ao: 0.52 },
      { x: 0, y: 0.20 * s, z: 0, sx: 0.62 * s, sy: 0.62 * s, ao: 0.72 },
      { x: 0, y: 0.27 * s, z: 0, sx: 0.50 * s, sy: 0.50 * s, ao: 0.86 },
      { x: 0, y: 0.30 * s, z: 0, sx: 0.47 * s, sy: 0.47 * s, ao: 0.90 },
    ], hex, { uvScale: 1.1, capStart: false }), -0.12 * s, 0.30 * s);

    // 竿 sao — the shaft, with two swollen nodes and a collar at each end. The
    // collars are what a mason cuts so the shaft has a face to bed on; they also
    // give the joint a lip to cast from.
    const saoTop = 1.06 * s;
    const saoSamples = [];
    // Bands, not bulges. A gaussian swell wide enough to see is wide enough to
    // make the shaft undulate, and an undulating column is the termite-mound
    // read this prop was accused of. A carved node is a short cylinder with
    // square shoulders — `smoothstep` in and out over 4% of the shaft — so the
    // shaft between two nodes stays dead straight and the nodes themselves cast.
    const band = (t, c, w) => smoothstep(c - w - 0.04, c - w, t) * (1 - smoothstep(c + w, c + w + 0.04, t));
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const y = lerp(0.30 * s, saoTop, t);
      const node = band(t, 0.34, 0.035) + band(t, 0.74, 0.035);
      // Collars: a ring of extra radius in the first and last 6% of the shaft.
      const collar = (1 - smoothstep(0.0, 0.06, t)) * 0.032 + smoothstep(0.94, 1.0, t) * 0.032;
      const r = (0.142 - t * 0.010 + node * 0.028 + collar) * s;
      saoSamples.push({ x: 0, y, z: 0, sx: r * 2, sy: r * 2, ao: lerp(0.74, 1.0, t) });
    }
    // No corner chipping on the shaft: `_chipStone` works off the hexagon's
    // corner angles, and a round member has none — applying it here would press
    // six flats into a cylinder.
    course(sweepProfile(saoSamples, circleProfile(12), { smooth: true, uvScale: 1.4 }),
      0.30 * s, saoTop, { chip: 0 });

    // 中台 chūdai — the flared platform the fire box sits on. Its foot is
    // *narrower* than the sao collar under it, so the stack is undercut here and
    // the joint reads as a shadow whatever the sun is doing.
    course(sweepProfile([
      { x: 0, y: saoTop, z: 0, sx: 0.28 * s, sy: 0.28 * s, ao: 0.48 },
      { x: 0, y: saoTop + 0.05 * s, z: 0, sx: 0.30 * s, sy: 0.30 * s, ao: 0.58 },
      { x: 0, y: saoTop + 0.16 * s, z: 0, sx: 0.54 * s, sy: 0.54 * s, ao: 0.82 },
      { x: 0, y: saoTop + 0.22 * s, z: 0, sx: 0.57 * s, sy: 0.57 * s, ao: 0.94 },
      { x: 0, y: saoTop + 0.26 * s, z: 0, sx: 0.52 * s, sy: 0.52 * s, ao: 0.86 },
      { x: 0, y: saoTop + 0.30 * s, z: 0, sx: 0.49 * s, sy: 0.49 * s, ao: 0.88 },
    ], hex, { uvScale: 1.1, capStart: false, capEnd: false }), saoTop, saoTop + 0.30 * s);

    // 火袋 hibukuro — six panels: moon, crescent, two windows, two solid.
    // The apertures are cut generously: at magic hour this is the brightest thing
    // in the frame and a coin-sized hole at 8 m is a sub-pixel highlight, which is
    // to say no highlight at all.
    const fbY = saoTop + 0.30 * s;
    const fbH = 0.44 * s;
    const fbR = 0.235 * s;
    const panelW = fbR * 1.02;
    // 4.5 cm of reveal rather than 3.5. The rim band inside an aperture is the
    // only thing standing between a 250-nit paper panel and the stone beside it;
    // at 3.5 cm it was one polygon wide and the transition aliased. Deeper, it
    // occludes the liner at grazing angles and grades the edge. Not deeper still
    // — the liner sits 24 mm behind the panel, so a reveal much past this starts
    // eating the aperture from the near side at oblique angles.
    const panelT = 0.045 * s;
    const fbParts = [];
    // A bed course under the panels and a head course over them, both proud of
    // the panel line: the fire box is a hollowed block with a lid, not a drum.
    for (const [y0, y1, r0, r1] of [
      [fbY, fbY + 0.055 * s, 0.50, 0.47],
      [fbY + fbH - 0.05 * s, fbY + fbH, 0.47, 0.51],
    ]) {
      fbParts.push(sweepProfile([
        { x: 0, y: y0, z: 0, sx: r0 * s, sy: r0 * s, ao: 0.72 },
        { x: 0, y: y1, z: 0, sx: r1 * s, sy: r1 * s, ao: 0.94 },
      ], hex, { uvScale: 1.1, capStart: false, capEnd: false }));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const panelH = fbH * 0.80;
      let panel;
      let hole = null;
      // Every hole has to fit *inside* the panel. `panelWithHole` projects each
      // hole vertex outward to the panel rectangle, so a hole wider than the
      // panel projects its rim inward — an inside-out band one polygon deep
      // sitting exactly where the lit paper meets the stone, which is the
      // aliased 255-to-dark edge the frame was showing. The moon was 0.136 of
      // the prop across a 0.120 half-panel and the crescent 0.145; both now
      // clear it.
      if (i === 0) {
        const mr = Math.min(fbH * 0.52, panelW * 0.90) * 0.5;
        hole = circleProfile(14).map((p) => [p[0] * mr * 2, p[1] * mr * 2]);
      } else if (i === 3) {
        // Crescent: a circle with a shallow bite, kept star-shaped so the
        // outward projection in panelWithHole stays well defined.
        hole = [];
        const cr = Math.min(fbH * 0.30, panelW * 0.45);
        for (let k = 0; k < 14; k++) {
          const th = (k / 14) * Math.PI * 2;
          const r = cr * (1 - 0.40 * Math.max(0, Math.cos(th)));
          hole.push([Math.cos(th) * r, Math.sin(th) * r]);
        }
      } else if (i === 1 || i === 4) {
        const w2 = panelW * 0.38, h2 = fbH * 0.32;
        hole = [[-w2, -h2], [w2, -h2], [w2, h2], [-w2, h2]];
      }
      if (hole) {
        panel = panelWithHole(panelW, panelH, panelT, hole, { rimAO: 0.30 });
      } else {
        panel = new BoxGeometry(panelW, panelH, panelT);
        normalizeGeo(panel);
      }
      const m = new Matrix4().makeRotationY(a);
      m.setPosition(Math.sin(a) * fbR, fbY + fbH * 0.5, Math.cos(a) * fbR);
      panel.applyMatrix4(m);
      normalizeGeo(panel);
      fbParts.push(panel);

      // 骨 the frame ribs. A hibukuro is a stone shell with a wooden lattice
      // holding the paper, and without one an aperture is a flat lit rectangle
      // — which is exactly what a lit rectangle in a game looks like. One
      // mullion and one rail across each opening, set inside the reveal so they
      // sit between the eye and the paper and read as dark lines across it.
      if (hole) {
        let hw = 0, hh = 0;
        for (const p of hole) { hw = Math.max(hw, Math.abs(p[0])); hh = Math.max(hh, Math.abs(p[1])); }
        const rib = 0.014 * s;
        const rz = fbR + panelT * 0.05;
        for (const [rw, rh] of [[rib, hh * 2.02], [hw * 2.02, rib]]) {
          const g = new BoxGeometry(rw, rh, panelT * 0.62);
          const mm = new Matrix4().makeRotationY(a);
          mm.setPosition(Math.sin(a) * rz, fbY + fbH * 0.5, Math.cos(a) * rz);
          g.applyMatrix4(mm);
          normalizeGeo(g);
          shadeGeo(g, () => 0.62);
          fbParts.push(g);
        }
      }

      // Corner posts between panels so the box does not read as a paper drum.
      const ap = a + Math.PI / 6;
      const post = new BoxGeometry(0.055 * s, fbH * 0.92, 0.055 * s);
      post.translate(Math.sin(ap) * fbR * 1.05, fbY + fbH * 0.5, Math.cos(ap) * fbR * 1.05);
      normalizeGeo(post);
      fbParts.push(post);
    }
    course(mergeGeometries(fbParts.map((g) => normalizeGeo(g)), false), fbY, fbY + fbH,
      { chip: 0.25 });

    // 笠 kasa — hexagonal roof with a concave sweep and lifted corners.
    const kasaY = fbY + fbH;
    const kasaRings = [];
    const RINGS = 5;
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const r = lerp(0.60 * s, 0.13 * s, t);
      const y = kasaY + Math.pow(t, 1.55) * 0.30 * s;
      const pts = [];
      const pao = [];
      const SEG = 6, SUB = 4;
      for (let e = 0; e < SEG; e++) {
        for (let k = 0; k < SUB; k++) {
          const f = k / SUB;
          // Flat-sided hexagon, not a cone: interpolate along the chord.
          const aA = (e / SEG) * Math.PI * 2 + Math.PI / 6;
          const aB = ((e + 1) / SEG) * Math.PI * 2 + Math.PI / 6;
          const x = lerp(Math.cos(aA), Math.cos(aB), f) * r;
          const z = lerp(Math.sin(aA), Math.sin(aB), f) * r;
          const corner = Math.pow(Math.abs(f * 2 - 1), 3);
          pts.push([x, y + corner * 0.085 * s * (1 - t), z]);
          pao.push(lerp(0.66, 1.0, t) * lerp(1.0, 1.12, corner));
        }
      }
      kasaRings.push({ pts, pao });
    }
    const kasaParts = [loftRings(kasaRings, { uvScale: 1.2 })];
    // Underside so the deep eave is not a one-sided sheet.
    kasaParts.push(loftRings(kasaRings.map((r) => ({
      pts: r.pts.map((p) => [p[0] * 0.985, p[1] - 0.055 * s, p[2] * 0.985]),
      pao: r.pao.map((v) => v * 0.5),
    })), { flip: true, uvScale: 1.2 }));
    course(mergeGeometries(kasaParts.map((g) => normalizeGeo(g)), false),
      kasaY - 0.055 * s, kasaY + 0.30 * s, { chip: 0.7 });

    // Dress each stone on its own before they are merged into one draw.
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.chip > 0) this._chipStone(c.geo, s, i * 7.3, c.chip);
      roughen(c.geo, 0.005 * s, 6.5);
      // Kept close to the old whole-stack numbers on purpose: the joints are
      // supposed to come from the seat passes below, which are narrow bands. If
      // the ambient terms carry the work as well, the prop stops being granite
      // with dark lines in it and becomes a dark prop.
      bakeAO(c.geo, { ground: 0, cavity: 0.28, down: 0.34, floor: 0.38 });
      if (c.seat) this._seatCourse(c.geo, c.y0, c.y1, s);
      // The exposed top of the stone below sits under this one's footprint.
      if (i > 0) this._seatShadow(courses[i - 1].geo, courses[i - 1].y1, s);
    }
    const merged = mergeGeometries(courses.map((c) => normalizeGeo(c.geo)), false);
    // Ground contact for the whole stack, once, after the per-course pass.
    shadeGeo(merged, (x, y) => (y > 0.34 * s ? 1 : lerp(0.64, 1, clamp(y / (0.34 * s), 0, 1))));
    weatherBand(merged, 0, 0.5 * s, 0.72, 0.82, 0.66, 0.3);   // moss creeping up the base
    PropFactory.add(b, merged, '__lanternStone');

    // 宝珠 hōju — the jewel finial, in polished leaf so the low sun finds it.
    const jewel = sweepProfile([
      { x: 0, y: kasaY + 0.30 * s, z: 0, sx: 0.13 * s, sy: 0.13 * s, ao: 0.7 },
      { x: 0, y: kasaY + 0.36 * s, z: 0, sx: 0.17 * s, sy: 0.17 * s, ao: 0.9 },
      { x: 0, y: kasaY + 0.46 * s, z: 0, sx: 0.13 * s, sy: 0.13 * s, ao: 1.0 },
      { x: 0, y: kasaY + 0.53 * s, z: 0, sx: 0.045 * s, sy: 0.045 * s, ao: 1.0 },
    ], circleProfile(10), { smooth: true, uvScale: 1.6, capStart: false });
    PropFactory.add(b, jewel, '__goldPolished');

    // The lit paper liner. This is what you actually see through the moon and the
    // crescent — a hot *surface* filling each aperture edge to edge, rather than a
    // small box floating in the middle of the box that reads as a grey lump.
    //
    // It is lofted rather than swept because it has to carry a gradient: the
    // emissive is multiplied by the vertex colour, and a two-ring hexagonal tube
    // has nowhere to put one. Six facets subdivided five ways, six rings up,
    // gives 30 columns of falloff — hot on the axis of each facet where the
    // flame faces it, cooling into the corner posts and into the bed and head
    // courses. That gradient is the whole difference between lit paper and a
    // rectangle of white card.
    // `peak` 1.28 rather than 1.0: an aperture is seen through 4.5 cm of stone
    // reveal and across a rib, so the hottest pixel the camera can reach is
    // never the hottest pixel on the liner. Measured, a flat liner at the
    // contract's 2.6 put the panel centre at 238; the target is ~250.
    const liner = this._paperFalloff(
      fbR * 0.90, fbY + 0.010 * s, fbY + fbH - 0.010 * s, 0.34, 0.50, 1.28);
    bakeFlutter(liner, 4, () => 0);              // rigid: it is glued to the stone
    PropFactory.add(b, liner, '__lanternPaper');

    // The flame core, sitting behind the liner so the apertures read hottest.
    const flame = sweepProfile([
      { x: 0, y: fbY + fbH * 0.18, z: 0, sx: fbR * 1.15, sy: fbR * 1.15, ao: 1 },
      { x: 0, y: fbY + fbH * 0.72, z: 0, sx: fbR * 1.30, sy: fbR * 1.30, ao: 1 },
      { x: 0, y: fbY + fbH * 0.92, z: 0, sx: fbR * 0.55, sy: fbR * 0.55, ao: 1 },
    ], circleProfile(8), { smooth: true, uvScale: 1, capStart: false });
    PropFactory.add(b, flame, '__ember');

    PropFactory.addCollider(b, PropFactory.boxCollider(0.7 * s, kasaY, 0.7 * s, 0, 0, 0), 'stone', true, false);
    b.lights.push({
      x: 0, y: fbY + fbH * 0.5, z: 0,
      color: 0xffa050, intensity: 2.6 * s, distance: 6.5 * s, flicker: 1,
    });
    b.anchors.fire = [0, fbY + fbH * 0.5, 0];
    b.bounds = { r: 0.66 * s, h: kasaY + 0.55 * s };
    return b;
  }

  /**
   * The baked light pool below a stone lantern, deliberately kept as a separate
   * prototype. A lantern can be scaled, leaned and sunk into its footing; applying
   * that same transform to a horizontal ground effect either buries or tilts it.
   * Level therefore places this disc against the actual visible surface instead.
   */
  groundLightPool(opts = {}) {
    // The visible energy still lives inside roughly 1.1 m; the extra tail gives
    // it another 35-45 cm to reach zero with a zero-slope edge. That removes the
    // readable perimeter without turning up the centre or bloom.
    const radius = opts.radius ?? 1.50;
    const b = PropFactory.build();
    PropFactory.add(b, this._spillDisc(radius, 0, 24, 1, 0, 6, 1.5), '__glowPool');
    b.bounds = { r: radius, h: 0.02 };
    return b;
  }

  /**
   * Knock the corners off a hexagonal stone.
   *
   * Dressed granite that has stood in a courtyard for three hundred years has
   * lost pieces, and it loses them at the arrises — nowhere else, because an
   * arris is the only part of a block with material on one side only. The
   * displacement is a function of position alone, so the duplicated vertices a
   * hard-edged sweep emits at each profile corner all move together and the
   * stone stays watertight.
   *
   * A fresh break is *brighter* than the weathered face around it, which is the
   * cue that makes it read as damage rather than as dirt.
   */
  _chipStone(geo, s, seed = 0, strength = 1, depth = 0.020) {
    const pos = geo.getAttribute('position');
    let col = geo.getAttribute('color');
    if (!col) { normalizeGeo(geo); col = geo.getAttribute('color'); }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const th = Math.atan2(z, x);
      // Angular distance to the nearest hexagon corner.
      const k = Math.round((th - Math.PI / 6) / (Math.PI / 3));
      let d = Math.abs(th - (Math.PI / 6 + k * (Math.PI / 3)));
      if (d > Math.PI) d = Math.PI * 2 - d;
      const near = 1 - smoothstep(0.09, 0.30, d);
      if (near <= 0) continue;
      // Coarse along the corner so a chip is a patch a hand could have knocked
      // off, not a per-vertex sparkle.
      const m = smoothstep(0.10, 0.62, noise.fbm2(k * 3.7 + seed, y * 5.6 / s, 2) * 0.5 + 0.5);
      const a = near * m * strength;
      if (a <= 0.001) continue;
      const off = depth * a * s;
      pos.setXYZ(i, x - (x / r) * off, y, z - (z / r) * off);
      const c = 1 + a * 0.13;
      col.setXYZ(i, col.getX(i) * c, col.getY(i) * c, col.getZ(i) * c * 0.98);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** Darken the bottom of a course where it beds onto the stone below it. */
  _seatCourse(geo, y0, y1, s, band = 0.055, floor = 0.46) {
    const reach = Math.min(band * s, (y1 - y0) * 0.45);
    return shadeGeo(geo, (x, y) => {
      const t = (y - y0) / Math.max(1e-4, reach);
      if (t >= 1) return 1;
      return lerp(floor, 1, Math.pow(clamp(t, 0, 1), 0.65));
    });
  }

  /**
   * Darken the exposed top of a course, where the stone above it sits. Only
   * up-facing geometry: the side of a stone is not in its neighbour's shadow.
   */
  _seatShadow(geo, yTop, s, band = 0.075, floor = 0.52) {
    return shadeGeo(geo, (x, y, z, nx, ny) => {
      if (ny < 0.35) return 1;
      const t = (yTop - y) / (band * s);
      if (t < 0 || t > 1) return 1;
      return lerp(floor, 1, smoothstep(0.0, 1.0, t));
    });
  }

  /**
   * The lit-paper shell of a hibukuro, with the falloff baked into the vertex
   * colour that `lanternPaperMaterial` routes onto the emissive.
   *
   * `edge` is the multiplier at the corner of a facet, `cap` at the top and
   * bottom rings. A panel is hottest where the flame faces it square on, so the
   * profile is a raised cosine across each facet, and it dies into the bed and
   * head courses because paper is pasted to a frame and a frame is not lit.
   */
  _paperFalloff(radius, y0, y1, edge = 0.34, cap = 0.50, peak = 1.0, SEG = 6, SUB = 5, ROWS = 6) {
    const rings = [];
    for (let i = 0; i <= ROWS; i++) {
      const t = i / ROWS;
      const y = lerp(y0, y1, t);
      // Hot band across the middle, dying at both ends.
      const gv = peak * lerp(cap, 1.0, Math.pow(Math.sin(Math.PI * t), 0.55));
      const pts = [];
      const pao = [];
      for (let e = 0; e < SEG; e++) {
        for (let k = 0; k < SUB; k++) {
          const f = k / SUB;
          const aA = (e / SEG) * Math.PI * 2 + Math.PI / 6;
          const aB = ((e + 1) / SEG) * Math.PI * 2 + Math.PI / 6;
          pts.push([
            lerp(Math.cos(aA), Math.cos(aB), f) * radius,
            y,
            lerp(Math.sin(aA), Math.sin(aB), f) * radius,
          ]);
          const off = Math.abs(f * 2 - 1);                 // 0 mid-facet, 1 at a corner
          pao.push(lerp(1.0, edge, smoothstep(0.12, 1.0, off)));
        }
      }
      rings.push({ pts, pao, ao: gv });
    }
    return loftRings(rings, { uvScale: 1.2 });
  }

  /**
   * A ground-hugging disc with a vertex-colour gradient from centre to rim. Used
   * for baked light spill (centre 1 → rim 0, so the emissive dies out) and for wet
   * ground (centre dark → rim 1, so the damp patch dries off at its edge).
   */
  _spillDisc(radius, y, segments = 24, centre = 1, rim = 0, radialRings = 1, falloffPower = 1) {
    const verts = [0, y, 0];
    const uvs = [0.5, 0.5];
    const cols = [centre, centre, centre];
    const idx = [];
    const rings = Math.max(1, radialRings | 0);
    for (let ring = 1; ring <= rings; ring++) {
      const t = ring / rings;
      const centreWeight = Math.pow(1 - smoothstep(0, 1, t), Math.max(0.1, falloffPower));
      const value = lerp(rim, centre, centreWeight);
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        // Every ring follows the same irregular boundary ray; otherwise concentric
        // noise produces contour bands instead of a continuous light field.
        const wob = 0.86 + 0.14 * noise.noise2(Math.cos(a) * 2.3, Math.sin(a) * 2.3);
        verts.push(Math.cos(a) * radius * t * wob, y, Math.sin(a) * radius * t * wob);
        uvs.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
        cols.push(value, value, value);
      }
    }
    // Seen from above, every triangle must wind clockwise in XZ so its normal is
    // +Y. The old centre fan wound the other way and FrontSide-culling discarded
    // the receiver entirely; keep the orientation explicit for both the fan and
    // the radial quads.
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      idx.push(0, 1 + next, 1 + i);
    }
    for (let ring = 2; ring <= rings; ring++) {
      const inner = 1 + (ring - 2) * segments;
      const outer = 1 + (ring - 1) * segments;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        idx.push(inner + i, outer + next, outer + i);
        idx.push(inner + i, inner + next, outer + next);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // =====================================================================
  //  ROOFS — the concave sweep is the whole silhouette
  // =====================================================================

  /**
   * 入母屋 irimoya: a hipped skirt with a gabled top, deep overhang, concave
   * sweep and flared corners.
   *
   * Ring stack: rings 0..K shrink in both axes (the hip), rings K..N keep the
   * gable half-width and close in Z only, which leaves a genuine triangular tsuma
   * opening at each end that `_gableWall` then fills. Every surface is built
   * twice — top and soffit — because a deep eave is seen from underneath more
   * often than from above.
   *
   * Returns `{ parts, ridgeY, ridgeHalfX, gableHalfX, gableY, mzK }`.
   */
  roofIrimoya(opts = {}) {
    const hx = opts.halfX ?? 5.0;
    const hz = opts.halfZ ?? 4.0;
    const rise = opts.rise ?? 2.6;
    const y0 = opts.baseY ?? 0;
    const thick = opts.thickness ?? 0.22;
    const lift = opts.lift ?? Math.min(hx, hz) * 0.11;
    const curve = opts.curve ?? 1.62;
    const mat = opts.material ?? 'roofTile';
    const hip = clamp(opts.hip ?? 0.5, 0.15, 0.9);
    const segX = opts.segX ?? 8;
    const segZ = opts.segZ ?? 5;
    const gableOver = opts.gableOverhang ?? Math.min(0.34, hx * 0.06);
    const parts = [];

    const K = Math.max(2, Math.round(6 * hip));
    const N = K + Math.max(2, Math.round(6 * (1 - hip)) + 1);
    const mzK = hz * 0.40;
    const mx = Math.max(hx * 0.18, hx - (hz - mzK));

    const rings = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = y0 + rise * Math.pow(t, curve);
      let rx, rz;
      if (i <= K) {
        const u = i / K;
        rx = lerp(hx, mx, u);
        rz = lerp(hz, mzK, u);
      } else {
        const u = (i - K) / (N - K);
        rx = mx + gableOver * smoothstep(0, 0.35, u);
        rz = lerp(mzK, 0.02, u);
      }
      const r = rectRing(rx, rz, y, segX, segZ, lift * (1 - t) * (1 - t));
      r.ao = lerp(0.62, 1.0, Math.pow(t, 0.6));
      rings.push(r);
    }

    const top = loftRings(rings, { uvScale: 0.85 });
    // Bank the tiles slightly so the ridge catches a hard specular line.
    shadeGeo(top, (x, y, z, nx, ny) => lerp(0.86, 1.06, clamp(ny, 0, 1)));
    parts.push({ geometry: top, material: mat });

    const soffit = loftRings(rings.map((r, i) => ({
      pts: r.pts.map((p) => [p[0] * 0.995, p[1] - thick, p[2] * 0.995]),
      pao: r.pts.map(() => (i === 0 ? 0.40 : 0.30)),
    })), { flip: true, uvScale: 1.1 });
    parts.push({ geometry: soffit, material: opts.soffitMaterial ?? 'cedar' });

    // Eave fascia: the visible board thickness at the very edge.
    const fascia = loftRings([
      { pts: rings[0].pts.map((p) => [p[0], p[1], p[2]]), ao: 0.95 },
      { pts: rings[0].pts.map((p) => [p[0] * 0.995, p[1] - thick, p[2] * 0.995]), ao: 0.5 },
    ], { flip: true, uvScale: 1.4 });
    parts.push({ geometry: fascia, material: opts.fasciaMaterial ?? 'cedarBeam' });

    // 妻 tsuma — the triangular gable wall closing each end.
    const gy0 = y0 + rise * Math.pow(K / N, curve);
    const ridgeY = y0 + rise;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      const wall = this._gableWall(mzK, gy0, ridgeY, 0.16);
      wall.translate(sx * mx, 0, 0);
      parts.push({ geometry: wall, material: opts.gableMaterial ?? 'plaster' });
      // Barge boards following the gable slope.
      for (let e = 0; e < 2; e++) {
        const ez = e === 0 ? 1 : -1;
        const board = sweepProfile([
          { x: sx * (mx + gableOver * 0.6), y: gy0 - 0.05, z: ez * mzK, sx: 0.13, sy: 0.20, ao: 0.7 },
          { x: sx * (mx + gableOver * 0.6), y: ridgeY - 0.02, z: 0, sx: 0.13, sy: 0.20, ao: 0.95 },
        ], rectProfile(0.2), { ref: [1, 0, 0], uvScale: 1.2 });
        parts.push({ geometry: board, material: 'cedarBeam' });
      }
    }

    // 棟 ridge capping, plus onigawara end blocks.
    {
      const rl = mx + gableOver + 0.10;
      const ridge = sweepProfile([
        { x: -rl, y: ridgeY + 0.10, z: 0, sx: 0.44, sy: 0.26, ao: 0.9 },
        { x: 0, y: ridgeY + 0.13, z: 0, sx: 0.40, sy: 0.26, ao: 1.0 },
        { x: rl, y: ridgeY + 0.10, z: 0, sx: 0.44, sy: 0.26, ao: 0.9 },
      ], rectProfile(0.28), { ref: [0, 0, -1], uvScale: 1.2 });
      parts.push({ geometry: ridge, material: mat });
      for (let side = 0; side < 2; side++) {
        const oni = new BoxGeometry(0.16, 0.42, 0.40);
        oni.translate((side === 0 ? -1 : 1) * (rl + 0.02), ridgeY + 0.24, 0);
        normalizeGeo(oni);
        bakeAO(oni, { ground: 0, cavity: 0.3, down: 0.35, floor: 0.42 });
        parts.push({ geometry: oni, material: mat });
      }
    }

    for (const p of parts) {
      normalizeGeo(p.geometry);
      bakeAO(p.geometry, { ground: 0, cavity: 0.16, down: 0.34, floor: 0.30 });
    }
    return { parts, ridgeY, ridgeHalfX: mx, gableHalfX: mx, gableY: gy0, mzK, eaveY: y0 };
  }

  /** A convex polygon in (z, y) extruded a little along x — gable walls, ends. */
  _gableWall(halfZ, y0, y1, thick) {
    const poly = [[-halfZ, y0], [halfZ, y0], [0, y1]];
    const n = poly.length;
    const verts = [], uvs = [], cols = [], idx = [];
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? thick * 0.5 : -thick * 0.5;
      const base = verts.length / 3;
      for (let i = 0; i < n; i++) {
        verts.push(x, poly[i][1], poly[i][0]);
        uvs.push(poly[i][0], poly[i][1]);
        cols.push(0.9, 0.9, 0.9);
      }
      for (let i = 1; i < n - 1; i++) {
        if (side === 0) idx.push(base, base + i, base + i + 1);
        else idx.push(base, base + i + 1, base + i);
      }
    }
    const base = verts.length / 3;
    for (let i = 0; i < n; i++) {
      verts.push(thick * 0.5, poly[i][1], poly[i][0]);
      verts.push(-thick * 0.5, poly[i][1], poly[i][0]);
      uvs.push(poly[i][0], 0, poly[i][0], thick);
      cols.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = base + i * 2 + 1;
      const c = base + ((i + 1) % n) * 2 + 1, e = base + ((i + 1) % n) * 2;
      idx.push(a, b, c, a, c, e);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * 斗栱 tokyō — one bracket unit: a bearing block, a stepped arm, and two more
   * blocks carrying the purlin. Small, repeated, and the single clearest signal
   * that this is Japanese carpentry rather than a generic pagoda shape.
   */
  _bracketUnit(s = 1) {
    const geos = [];
    const box = (w, h, d, x, y, z) => {
      const g = new BoxGeometry(w * s, h * s, d * s);
      g.translate(x * s, y * s, z * s);
      normalizeGeo(g);
      return g;
    };
    geos.push(box(0.30, 0.16, 0.30, 0, 0.08, 0));            // 大斗 daito
    geos.push(box(0.94, 0.13, 0.20, 0, 0.225, 0));           // 肘木 hijiki arm
    geos.push(box(0.20, 0.14, 0.44, 0, 0.36, 0));            // 巻斗 makito
    geos.push(box(0.20, 0.14, 0.20, -0.38, 0.36, 0));
    geos.push(box(0.20, 0.14, 0.20, 0.38, 0.36, 0));
    geos.push(box(0.16, 0.40, 0.16, 0, -0.20, 0));           // stub into the beam
    const merged = mergeGeometries(geos, false);
    bakeAO(merged, { ground: 0, cavity: 0.36, down: 0.42, floor: 0.30 });
    return merged;
  }

  // =====================================================================
  //  本殿 / 拝殿  SHRINE HALLS
  // =====================================================================

  /**
   * A raised hall: post foundation, plank floor, veranda with a railing, plaster
   * and timber walls, shoji bays on the entrance face, the bracket complex under
   * the eaves, and (for shrine buildings) chigi finials and katsuogi billets.
   *
   * The front face looks toward +Z, matching the processional axis.
   */
  hall(opts = {}) {
    const w = opts.width ?? 12;            // X
    const d = opts.depth ?? 9;             // Z
    const floorY = opts.floorY ?? 1.05;
    const wallH = opts.wallH ?? 2.9;
    const veranda = opts.veranda ?? 0.95;
    const eaveOut = opts.eaveOut ?? 1.75;
    const rise = opts.rise ?? Math.max(2.4, w * 0.28);
    const roofMat = opts.roofMaterial ?? 'roofTile';
    const wallMat = opts.wallMaterial ?? 'plaster';
    const open = !!opts.open;               // kagura-den: posts, no walls
    const shrineRidge = opts.shrineRidge !== false;
    const rnd = makeRandom(opts.seed ?? 5);
    const b = PropFactory.build();
    // A whole hall is 80–110 ms of geometry synthesis, which blows the frame
    // budget on a phone, so Level asks for it one stage at a time.
    const stages = opts.stages || null;
    const want = stages ? (s) => stages.indexOf(s) >= 0 : () => true;

    const hw = w * 0.5, hd = d * 0.5;
    const pw = hw + veranda, pd = hd + veranda;   // platform half extents

    const colR = 0.20;
    const colTop = floorY + wallH;
    const roofBase = colTop + 0.72;
    const colXs = [];
    const colCount = Math.max(2, Math.round(w / 2.4));
    for (let i = 0; i <= colCount; i++) colXs.push(lerp(-hw, hw, i / colCount));

    // ---- foundation posts on stone pads -----------------------------------
    const postR = 0.155;
    const nx = Math.max(2, Math.round(w / 2.6));
    const nz = Math.max(2, Math.round(d / 2.6));
    if (want('frame')) for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        if (i > 0 && i < nx && j > 0 && j < nz) continue;   // perimeter + edges only
        const x = lerp(-pw + 0.4, pw - 0.4, i / nx);
        const z = lerp(-pd + 0.4, pd - 0.4, j / nz);
        const post = sweepProfile([
          { x, y: 0.14, z, sx: postR * 2.1, sy: postR * 2.1, ao: 0.45 },
          { x, y: floorY, z, sx: postR * 1.9, sy: postR * 1.9, ao: 0.8 },
        ], circleProfile(8), { smooth: true, uvScale: 1.4, capStart: false });
        bakeAO(post, { ground: 0.5, groundH: 0.5, cavity: 0.1, floor: 0.34 });
        PropFactory.add(b, post, 'cedar');
        const pad = sweepProfile([
          { x, y: -0.05, z, sx: 0.52, sy: 0.52, ao: 0.4 },
          { x, y: 0.16, z, sx: 0.44, sy: 0.44, ao: 0.72 },
        ], circleProfile(7), { smooth: true, uvScale: 1.6, capStart: false });
        roughen(pad, 0.012, 5);
        PropFactory.add(b, pad, 'stone');
      }
    }

    // ---- platform / plank floor -------------------------------------------
    if (want('frame')) {
      const slab = new BoxGeometry(pw * 2, 0.30, pd * 2);
      slab.translate(0, floorY - 0.15, 0);
      normalizeGeo(slab);
      bakeAO(slab, { ground: 0, cavity: 0.1, down: 0.5, floor: 0.32 });
      PropFactory.add(b, slab, 'cedarBeam');

      // Individual deck planks with a little cupping, so the veranda has grain.
      const planks = [];
      const pn = Math.max(6, Math.round(pd * 2 / 0.28));
      for (let i = 0; i < pn; i++) {
        const z = lerp(-pd, pd, (i + 0.5) / pn);
        const g = new BoxGeometry(pw * 2 - 0.02, 0.055, (pd * 2 / pn) - 0.012);
        g.translate(0, floorY + 0.028 + (rnd() - 0.5) * 0.006, z);
        normalizeGeo(g);
        const k = 0.9 + rnd() * 0.18;
        tintGeo(g, k, k * 0.99, k * 0.96);
        planks.push(g);
      }
      const deck = mergeGeometries(planks, false);
      bakeAO(deck, { ground: 0, cavity: 0.12, down: 0.4, floor: 0.42 });
      PropFactory.add(b, deck, 'cedar');
      PropFactory.addCollider(b, PropFactory.boxCollider(pw * 2, floorY + 0.09, pd * 2, 0, 0), 'wood', true, true);
    }

    // ---- veranda railing (highest at the front, open at the stair) ---------
    if (want('frame')) {
      const railY = floorY + 0.06;
      const rails = [];
      const postAt = (x, z) => {
        const g = new BoxGeometry(0.09, 0.62, 0.09);
        g.translate(x, railY + 0.31, z);
        normalizeGeo(g);
        rails.push(g);
      };
      const runX = (z, from, to) => {
        for (let i = 0; i <= Math.round(Math.abs(to - from) / 0.55); i++) {
          postAt(lerp(from, to, i / Math.max(1, Math.round(Math.abs(to - from) / 0.55))), z);
        }
        const top = new BoxGeometry(Math.abs(to - from), 0.09, 0.14);
        top.translate((from + to) * 0.5, railY + 0.66, z);
        normalizeGeo(top);
        rails.push(top);
      };
      const runZ = (x, from, to) => {
        const n = Math.max(1, Math.round(Math.abs(to - from) / 0.55));
        for (let i = 0; i <= n; i++) postAt(x, lerp(from, to, i / n));
        const top = new BoxGeometry(0.14, 0.09, Math.abs(to - from));
        top.translate(x, railY + 0.66, (from + to) * 0.5);
        normalizeGeo(top);
        rails.push(top);
      };
      const gap = Math.min(1.4, w * 0.16);
      runX(pd - 0.08, -pw + 0.08, -gap);
      runX(pd - 0.08, gap, pw - 0.08);
      runX(-pd + 0.08, -pw + 0.08, pw - 0.08);
      runZ(-pw + 0.08, -pd + 0.08, pd - 0.08);
      runZ(pw - 0.08, -pd + 0.08, pd - 0.08);
      const rail = mergeGeometries(rails, false);
      bakeAO(rail, { ground: 0, cavity: 0.3, down: 0.36, floor: 0.36 });
      PropFactory.add(b, rail, 'cedar');
      b.anchors.stair = [0, floorY, pd];
    }

    // ---- corner columns and walls ------------------------------------------
    const cols = [];
    if (want('frame')) for (const cx of colXs) {
      for (const cz of [-hd, hd]) {
        cols.push(sweepProfile([
          { x: cx, y: floorY, z: cz, sx: colR * 2.05, sy: colR * 2.05, ao: 0.6 },
          { x: cx, y: colTop, z: cz, sx: colR * 1.86, sy: colR * 1.86, ao: 1.0 },
        ], circleProfile(10), { smooth: true, uvScale: 1.0, capStart: false, capEnd: false }));
      }
    }
    const colZs = [];
    const colZCount = Math.max(2, Math.round(d / 2.4));
    for (let j = 1; j < colZCount; j++) colZs.push(lerp(-hd, hd, j / colZCount));
    if (want('frame')) for (const cz of colZs) {
      for (const cx of [-hw, hw]) {
        cols.push(sweepProfile([
          { x: cx, y: floorY, z: cz, sx: colR * 2.05, sy: colR * 2.05, ao: 0.6 },
          { x: cx, y: colTop, z: cz, sx: colR * 1.86, sy: colR * 1.86, ao: 1.0 },
        ], circleProfile(10), { smooth: true, uvScale: 1.0, capStart: false, capEnd: false }));
      }
    }
    if (cols.length) {
      const merged = mergeGeometries(cols, false);
      bakeAO(merged, { ground: 0, cavity: 0.2, down: 0.3, floor: 0.34 });
      weatherBand(merged, floorY, floorY + 0.7, 0.78, 0.76, 0.72, 0.25);
      PropFactory.add(b, merged, 'cedar');
    }

    if (!open && want('walls')) {
      const panels = [];
      const shoji = [];
      const lattice = [];
      const wallY0 = floorY + 0.12;
      const wallY1 = colTop - 0.1;
      // Back and side walls: plaster between the posts, with a timber sill/head.
      const wallRun = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ang = Math.atan2(x1 - x0, z1 - z0);
        const g = new BoxGeometry(0.14, wallY1 - wallY0, len - 0.32);
        const m = new Matrix4().makeRotationY(ang);
        m.setPosition((x0 + x1) * 0.5, (wallY0 + wallY1) * 0.5, (z0 + z1) * 0.5);
        g.applyMatrix4(m);
        normalizeGeo(g);
        panels.push(g);
      };
      wallRun(-hw, -hd, hw, -hd);
      wallRun(-hw, -hd, -hw, hd);
      wallRun(hw, -hd, hw, hd);

      // Front face: shoji bays either side of the central doorway.
      const bays = colXs.length - 1;
      for (let i = 0; i < bays; i++) {
        const x0 = colXs[i] + 0.16, x1 = colXs[i + 1] - 0.16;
        const centre = Math.abs((x0 + x1) * 0.5) < w * 0.14;
        if (centre) continue;             // the doorway stays open
        shoji.push(this._shojiBay(x0, x1, wallY0, wallY1 - 0.35, hd - 0.02, lattice));
      }
      const wall = mergeGeometries(panels, false);
      roughen(wall, 0.008, 3.2, [1, 0, 1]);
      bakeAO(wall, { ground: 0, cavity: 0.22, down: 0.3, floor: 0.34 });
      PropFactory.add(b, wall, wallMat);
      if (lattice.length) PropFactory.add(b, mergeGeometries(lattice, false), 'cedar');
      if (shoji.length) {
        const paper = mergeGeometries(shoji, false);
        normalizeGeo(paper, true);
        bakeFlutter(paper, 4, () => 0);        // glazed into a frame: does not move
        PropFactory.add(b, paper, 'paper');
      }
      PropFactory.addCollider(b, PropFactory.boxCollider(w, wallH, 0.4, 0, floorY, -hd), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(0.4, wallH, d, -hw, floorY, 0), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(0.4, wallH, d, hw, floorY, 0), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(w * 0.36, wallH, 0.4, -w * 0.32, floorY, hd), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(w * 0.36, wallH, 0.4, w * 0.32, floorY, hd), 'wood');
    } else if (open && want('walls')) {
      PropFactory.addCollider(b, PropFactory.boxCollider(0.5, wallH, 0.5, -hw, floorY, -hd), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(0.5, wallH, 0.5, hw, floorY, -hd), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(0.5, wallH, 0.5, -hw, floorY, hd), 'wood');
      PropFactory.addCollider(b, PropFactory.boxCollider(0.5, wallH, 0.5, hw, floorY, hd), 'wood');
    }

    // ---- head beam (nageshi) + bracket complex -----------------------------
    if (want('brackets')) {
      const beams = [];
      const by = colTop + 0.14;
      const mk = (w2, h2, d2, x, y, z) => {
        const g = new BoxGeometry(w2, h2, d2);
        g.translate(x, y, z);
        normalizeGeo(g);
        beams.push(g);
      };
      mk(w + 0.5, 0.28, 0.26, 0, by, hd);
      mk(w + 0.5, 0.28, 0.26, 0, by, -hd);
      mk(0.26, 0.28, d + 0.5, -hw, by, 0);
      mk(0.26, 0.28, d + 0.5, hw, by, 0);
      const merged = mergeGeometries(beams, false);
      bakeAO(merged, { ground: 0, cavity: 0.24, down: 0.4, floor: 0.34 });
      PropFactory.add(b, merged, 'cedarBeam');

      const unit = this._bracketUnit(Math.min(1.05, w * 0.09));
      const brackets = [];
      const step = 1.55;
      const placeRow = (z, count, along) => {
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count;
          const g = unit.clone();
          const m = new Matrix4().makeRotationY(along ? 0 : Math.PI / 2);
          m.setPosition(along ? lerp(-hw, hw, t) : (z > 0 ? hw : -hw), by + 0.3, along ? z : lerp(-hd, hd, t));
          g.applyMatrix4(m);
          brackets.push(g);
        }
      };
      placeRow(hd, Math.max(2, Math.round(w / step)), true);
      placeRow(-hd, Math.max(2, Math.round(w / step)), true);
      placeRow(1, Math.max(2, Math.round(d / step)), false);
      placeRow(-1, Math.max(2, Math.round(d / step)), false);
      const bm = mergeGeometries(brackets, false);
      PropFactory.add(b, bm, 'cedarBeam');
      unit.dispose();
    }

    // ---- roof ---------------------------------------------------------------
    const roof = want('roof') ? this.roofIrimoya({
      halfX: hw + eaveOut, halfZ: hd + eaveOut,
      rise, baseY: roofBase, material: roofMat,
      lift: Math.min(hw, hd) * 0.14,
      hip: opts.hip ?? 0.52,
      segX: opts.segX ?? 8, segZ: opts.segZ ?? 5,
      thickness: 0.24,
      gableMaterial: opts.gableMaterial ?? 'cedar',
    }) : {
      // Analytic stand-in so anchors stay correct when the roof stage is skipped.
      parts: [], ridgeY: roofBase + rise,
      ridgeHalfX: Math.max((hw + eaveOut) * 0.18, (hw + eaveOut) - (hd + eaveOut) * 0.60),
    };
    for (const p of roof.parts) PropFactory.add(b, p.geometry, p.material);

    // ---- 千木 chigi and 鰹木 katsuogi ---------------------------------------
    if (shrineRidge && want('roof')) {
      const ridgeY = roof.ridgeY + 0.16;
      const finials = [];
      for (let side = 0; side < 2; side++) {
        const sx = side === 0 ? -1 : 1;
        const x = sx * (roof.ridgeHalfX + 0.06);
        for (let k = 0; k < 2; k++) {
          const sz = k === 0 ? 1 : -1;
          const g = sweepProfile([
            { x: x - sx * 0.30, y: ridgeY - 0.34, z: sz * 0.42, sx: 0.16, sy: 0.16, ao: 0.7 },
            { x: x + sx * 0.42, y: ridgeY + 1.18, z: -sz * 0.30, sx: 0.10, sy: 0.10, ao: 1.0 },
          ], rectProfile(0.2), { uvScale: 1.2 });
          finials.push(g);
        }
      }
      const nk = Math.max(3, Math.round(roof.ridgeHalfX * 1.1));
      for (let i = 0; i < nk; i++) {
        const x = lerp(-roof.ridgeHalfX * 0.72, roof.ridgeHalfX * 0.72, nk === 1 ? 0.5 : i / (nk - 1));
        const g = sweepProfile([
          { x, y: ridgeY + 0.16, z: -0.52, sx: 0.30, sy: 0.30, ao: 0.85 },
          { x, y: ridgeY + 0.22, z: 0, sx: 0.34, sy: 0.34, ao: 1.0 },
          { x, y: ridgeY + 0.16, z: 0.52, sx: 0.30, sy: 0.30, ao: 0.85 },
        ], circleProfile(8), { smooth: true, ref: [1, 0, 0], uvScale: 1.4 });
        finials.push(g);
      }
      const merged = mergeGeometries(finials, false);
      bakeAO(merged, { ground: 0, cavity: 0.2, down: 0.36, floor: 0.4 });
      tintGeo(merged, 1.0, 0.95, 0.82);
      PropFactory.add(b, merged, 'cedarBeam');

      // 金具 the leaf caps on the chigi tips and along the ridge. Small angled
      // facets high on the silhouette, right against the brightest part of the
      // sky — the most reliable place in the whole shrine to catch a low sun.
      const caps = [];
      for (let side = 0; side < 2; side++) {
        const sx = side === 0 ? -1 : 1;
        const x = sx * (roof.ridgeHalfX + 0.06);
        for (let k = 0; k < 2; k++) {
          const sz = k === 0 ? 1 : -1;
          caps.push(sweepProfile([
            { x: x + sx * 0.30, y: ridgeY + 0.86, z: -sz * 0.19, sx: 0.19, sy: 0.19, ao: 0.9 },
            { x: x + sx * 0.44, y: ridgeY + 1.22, z: -sz * 0.31, sx: 0.13, sy: 0.13, ao: 1.0 },
          ], rectProfile(0.26), { uvScale: 1.6 }));
        }
      }
      for (let i = 0; i < nk; i++) {
        const x = lerp(-roof.ridgeHalfX * 0.72, roof.ridgeHalfX * 0.72, nk === 1 ? 0.5 : i / (nk - 1));
        for (const sz of [-0.52, 0.52]) {
          caps.push(sweepProfile([
            { x, y: ridgeY + 0.16, z: sz * 1.02, sx: 0.32, sy: 0.32, ao: 1.0 },
            { x, y: ridgeY + 0.16, z: sz * 1.14, sx: 0.20, sy: 0.20, ao: 1.0 },
          ], circleProfile(8), { smooth: true, ref: [1, 0, 0], uvScale: 2 }));
        }
      }
      PropFactory.add(b, mergeGeometries(caps.map((g) => normalizeGeo(g)), false), '__goldPolished');
    }

    // ---- entrance stair ------------------------------------------------------
    if (want('frame')) {
      const st = this.stairs({
        width: Math.min(2.6, w * 0.34), steps: Math.max(2, Math.round(floorY / 0.19)),
        rise: floorY / Math.max(2, Math.round(floorY / 0.19)), run: 0.34,
        material: 'stone', wear: 0.4, seed: (opts.seed ?? 5) + 3,
      });
      const m = new Matrix4().makeTranslation(0, 0, pd + 0.02);
      for (const p of st.parts) { p.geometry.applyMatrix4(m); PropFactory.add(b, p.geometry, p.material); }
      for (const c of st.colliders) { c.geometry.applyMatrix4(m); b.colliders.push(c); }
    }

    b.anchors.front = [0, floorY, pd];
    b.anchors.ridge = [0, roof.ridgeY, 0];
    b.anchors.eaveFront = [0, roofBase, hd + eaveOut];
    b.bounds = { r: Math.hypot(hw + eaveOut, hd + eaveOut), h: roof.ridgeY + 1.6 };
    if (want('silhouette')) {
      b.silhouette = this._hallSilhouette(w, d, floorY, colTop, roofBase, rise, eaveOut, roofMat);
    }
    return b;
  }

  /** Cheap far-LOD stand-in: body box + a 3-ring roof. One draw for all halls. */
  _hallSilhouette(w, d, floorY, colTop, roofBase, rise, eaveOut, roofMat) {
    const body = new BoxGeometry(w, colTop - floorY * 0.2, d);
    body.translate(0, (colTop + floorY * 0.2) * 0.5, 0);
    normalizeGeo(body);
    shadeGeo(body, (x, y) => lerp(0.55, 0.95, clamp(y / colTop, 0, 1)));
    const roof = this.roofIrimoya({
      halfX: w * 0.5 + eaveOut, halfZ: d * 0.5 + eaveOut,
      rise, baseY: roofBase, material: roofMat, segX: 2, segZ: 1,
      hip: 0.5, thickness: 0.2,
    });
    return [
      { geometry: body, material: 'cedar' },
      { geometry: mergeGeometries(roof.parts.map((p) => normalizeGeo(p.geometry)), false), material: roofMat },
    ];
  }

  /** A bay of shoji: a cedar lattice on the wall bucket, paper returned. */
  _shojiBay(x0, x1, y0, y1, z, latticeOut) {
    const w = x1 - x0, h = y1 - y0;
    const bars = [];
    const frame = (bw, bh, cx, cy, bd = 0.05) => {
      const g = new BoxGeometry(bw, bh, bd);
      g.translate(cx, cy, z + 0.03);
      normalizeGeo(g);
      bars.push(g);
    };
    frame(w, 0.09, (x0 + x1) * 0.5, y0);
    frame(w, 0.09, (x0 + x1) * 0.5, y1);
    frame(0.09, h, x0, (y0 + y1) * 0.5);
    frame(0.09, h, x1, (y0 + y1) * 0.5);
    const cols = Math.max(2, Math.round(w / 0.30));
    for (let i = 1; i < cols; i++) frame(0.035, h - 0.09, lerp(x0, x1, i / cols), (y0 + y1) * 0.5, 0.035);
    const rows = Math.max(3, Math.round(h / 0.34));
    for (let j = 1; j < rows; j++) frame(w - 0.09, 0.030, (x0 + x1) * 0.5, lerp(y0, y1, j / rows), 0.035);
    for (const g of bars) { bakeAO(g, { ground: 0, cavity: 0.2, down: 0.3, floor: 0.45 }); latticeOut.push(g); }

    const paper = new BoxGeometry(w - 0.06, h - 0.06, 0.012);
    paper.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5, z + 0.005);
    normalizeGeo(paper);
    shadeGeo(paper, () => 1.05);
    return paper;
  }

  // =====================================================================
  //  STONE STEPS
  // =====================================================================

  /**
   * A flight whose top edge sits at z = 0, y = steps·rise, descending toward +Z.
   * Treads are dished in the middle where three centuries of feet have worn them,
   * and each block is nudged and rolled a little so the nosings are never a line.
   */
  stairs(opts = {}) {
    const width = opts.width ?? 3.2;
    const steps = Math.max(1, Math.round(opts.steps ?? 8));
    const rise = opts.rise ?? 0.19;
    const run = opts.run ?? 0.36;
    const wear = opts.wear ?? 1;
    const mat = opts.material ?? 'stone';
    const rnd = makeRandom(opts.seed ?? 17);
    const b = PropFactory.build();
    // A long flight is sliced across build tasks; the RNG is advanced for the
    // skipped steps so the slices still line up with the un-sliced flight.
    const from = Math.max(1, opts.stepFrom ?? 1);
    const to = Math.min(steps, opts.stepTo ?? steps);

    const blocks = [];
    for (let k = 1; k <= steps; k++) {
      if (k < from || k > to) { rnd(); rnd(); rnd(); continue; }
      const yTop = k * rise;
      const z0 = (steps - k) * run;
      const h = rise + 0.10;
      const g = new BoxGeometry(width + (rnd() - 0.5) * 0.05, h, run + 0.02, 5, 1, 1);
      const cz = z0 + run * 0.5;
      const cy = yTop - h * 0.5;
      // Dish the tread and knock the nosing about.
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (y > h * 0.4) {
          const u = clamp((x / (width * 0.5)) ** 2, 0, 1);
          const n = noise.noise2(x * 1.3 + k * 3.1, z * 2.6);
          pos.setY(i, y - wear * (0.020 * (1 - u) + 0.012 * n) - 0.004);
          if (z > 0) pos.setZ(i, z + n * 0.012 * wear);
        }
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      const m = new Matrix4().makeRotationY((rnd() - 0.5) * 0.018);
      m.setPosition((rnd() - 0.5) * 0.02, cy, cz);
      g.applyMatrix4(m);
      normalizeGeo(g);
      const t = 0.9 + rnd() * 0.2;
      tintGeo(g, t, t * (0.98 + rnd() * 0.05), t * (0.95 + rnd() * 0.06));
      shadeGeo(g, (x, y) => (y < cy - h * 0.2 ? 0.62 : 1));
      blocks.push(g);
      PropFactory.addCollider(b, PropFactory.boxCollider(width, yTop, run + 0.02, 0, 0, cz), mat === 'stone' ? 'stone' : 'wood', true, true);
    }

    if (opts.cheeks && from === 1) {
      for (let side = 0; side < 2; side++) {
        const sx = side === 0 ? -1 : 1;
        const samples = [];
        for (let k = 0; k <= steps; k++) {
          samples.push({
            x: sx * (width * 0.5 + 0.22), y: k * rise + 0.16, z: (steps - k) * run,
            sx: 0.44, sy: 0.5 + k * rise * 0.1, ao: 0.85,
          });
        }
        const cheek = sweepProfile(samples, rectProfile(0.12), { ref: [1, 0, 0], uvScale: 0.9 });
        roughen(cheek, 0.016, 3.4);
        blocks.push(cheek);
        PropFactory.addCollider(b, PropFactory.boxCollider(0.5, steps * rise + 0.6, steps * run, sx * (width * 0.5 + 0.22), 0, steps * run * 0.5), 'stone');
      }
    }

    if (blocks.length) {
      const merged = mergeGeometries(blocks.map((g) => normalizeGeo(g)), false);
      bakeAO(merged, { ground: 0, cavity: 0.28, down: 0.3, floor: 0.34 });
      weatherBand(merged, 0, 0.25, 0.74, 0.84, 0.68, 0.4);
      PropFactory.add(b, merged, mat);
    }

    b.anchors.top = [0, steps * rise, 0];
    b.anchors.bottom = [0, 0, steps * run];
    b.bounds = { r: Math.max(width, steps * run) * 0.6, h: steps * rise };
    return b;
  }

  // =====================================================================
  //  手水舎  CHŌZUYA
  // =====================================================================

  /** Water pavilion: four battered posts, a small roof, a basin, ladles, a spout. */
  chozuya(opts = {}) {
    const w = opts.width ?? 3.4;
    const d = opts.depth ?? 2.8;
    const postH = opts.postH ?? 2.35;
    const rnd = makeRandom(opts.seed ?? 55);
    const b = PropFactory.build();
    const hw = w * 0.5, hd = d * 0.5;

    // posts on stone pads
    const posts = [];
    const pads = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * hw, z = sz * hd;
        posts.push(sweepProfile([
          { x, y: 0.16, z, sx: 0.28, sy: 0.28, ao: 0.5 },
          { x: x - sx * 0.05, y: postH, z: z - sz * 0.05, sx: 0.24, sy: 0.24, ao: 1.0 },
        ], rectProfile(0.16), { uvScale: 1.0, capStart: false }));
        pads.push(sweepProfile([
          { x, y: -0.06, z, sx: 0.56, sy: 0.56, ao: 0.42 },
          { x, y: 0.18, z, sx: 0.46, sy: 0.46, ao: 0.75 },
        ], circleProfile(7), { smooth: true, capStart: false, uvScale: 1.5 }));
        PropFactory.addCollider(b, PropFactory.boxCollider(0.36, postH, 0.36, x, 0, z), 'wood');
      }
    }
    // tie beams
    for (const sz of [-1, 1]) {
      const g = new BoxGeometry(w + 0.5, 0.22, 0.18);
      g.translate(0, postH - 0.06, sz * (hd - 0.05));
      normalizeGeo(g);
      posts.push(g);
    }
    for (const sx of [-1, 1]) {
      const g = new BoxGeometry(0.18, 0.22, d + 0.5);
      g.translate(sx * (hw - 0.05), postH - 0.06, 0);
      normalizeGeo(g);
      posts.push(g);
    }
    {
      const merged = mergeGeometries(posts, false);
      bakeAO(merged, { ground: 0.4, groundH: 0.5, cavity: 0.24, down: 0.34, floor: 0.32 });
      weatherBand(merged, 0, 0.9, 0.7, 0.74, 0.62, 0.3);
      PropFactory.add(b, merged, 'cedar');
      const pm = mergeGeometries(pads, false);
      roughen(pm, 0.012, 5);
      bakeAO(pm, { ground: 0.5, groundH: 0.3, floor: 0.34 });
      PropFactory.add(b, pm, 'stone');
    }

    const roof = this.roofIrimoya({
      halfX: hw + 0.85, halfZ: hd + 0.85, rise: 1.25, baseY: postH + 0.16,
      material: opts.roofMaterial ?? 'cedar', soffitMaterial: 'cedar',
      hip: 0.75, segX: 5, segZ: 4, thickness: 0.16, lift: 0.24,
      gableMaterial: 'cedar',
    });
    for (const p of roof.parts) PropFactory.add(b, p.geometry, p.material);

    // 水盤 basin — a hollowed hexagonal block on a plinth.
    const basinY = 0.62;
    const basin = [];
    basin.push(sweepProfile([
      { x: 0, y: -0.05, z: 0, sx: 1.05, sy: 0.95, ao: 0.4 },
      { x: 0, y: 0.22, z: 0, sx: 0.98, sy: 0.88, ao: 0.62 },
    ], hexProfile(), { uvScale: 1.1, capStart: false, capEnd: false }));
    basin.push(sweepProfile([
      { x: 0, y: 0.20, z: 0, sx: 1.26, sy: 1.05, ao: 0.7 },
      { x: 0, y: basinY, z: 0, sx: 1.30, sy: 1.08, ao: 0.98 },
    ], hexProfile(), { uvScale: 1.0, capStart: false, capEnd: false }));
    // rim + inner well
    const rim = [];
    const RN = 6;
    for (let i = 0; i < RN; i++) {
      const a0 = (i / RN) * Math.PI * 2 + Math.PI / 6;
      const a1 = ((i + 1) / RN) * Math.PI * 2 + Math.PI / 6;
      const outer = 0.65, inner = 0.46;
      const verts = [];
      const push = (r, y) => { verts.push([Math.cos(a0) * r, y, Math.sin(a0) * r * 0.84], [Math.cos(a1) * r, y, Math.sin(a1) * r * 0.84]); };
      push(outer, basinY); push(inner, basinY);
      const g = new BufferGeometry();
      const arr = new Float32Array(verts.length * 3);
      for (let k = 0; k < verts.length; k++) { arr[k * 3] = verts[k][0]; arr[k * 3 + 1] = verts[k][1]; arr[k * 3 + 2] = verts[k][2]; }
      g.setAttribute('position', new BufferAttribute(arr, 3));
      g.setIndex([0, 2, 3, 0, 3, 1]);
      g.computeVertexNormals();
      normalizeGeo(g);
      rim.push(g);
      // inner wall dropping to the water
      const wall = sweepProfile([
        { x: 0, y: basinY, z: 0, sx: 0.92, sy: 0.77, ao: 0.55 },
        { x: 0, y: basinY - 0.26, z: 0, sx: 0.88, sy: 0.74, ao: 0.24 },
      ], hexProfile(), { uvScale: 1.4, capStart: false });
      rim.push(wall);
    }
    // Wet stone: two centuries of ladled water have never let this dry, and a
    // near-mirror roughness under a low sun is free brightness that is also true.
    const basinGeo = mergeGeometries(basin.concat(rim).map((g) => normalizeGeo(g)), false);
    roughen(basinGeo, 0.009, 5.5);
    bakeAO(basinGeo, { ground: 0.45, groundH: 0.4, cavity: 0.34, down: 0.3, floor: 0.28 });
    weatherBand(basinGeo, 0, 0.45, 0.66, 0.80, 0.62, 0.35);
    PropFactory.add(b, basinGeo, '__wetStone');
    PropFactory.addCollider(b, PropFactory.boxCollider(1.5, basinY, 1.25, 0, 0), 'stone', true, false);

    // The splash apron: the flagstone around a chōzuya is always dark and shining.
    // Darkest under the basin, drying off toward the rim — the gradient runs the
    // other way from a light pool, hence the explicit centre/rim.
    PropFactory.add(b, this._spillDisc(1.9, 0.025, 16, 0.62, 1.0), '__wetStone');

    // still water surface
    {
      const g = new BoxGeometry(0.86, 0.02, 0.72);
      g.translate(0, basinY - 0.10, 0);
      normalizeGeo(g);
      PropFactory.add(b, g, '__water');
    }

    // 竹 bamboo spout and the falling thread of water
    {
      const spout = sweepProfile([
        { x: -0.95, y: 0.10, z: -0.28, sx: 0.10, sy: 0.10, ao: 0.5 },
        { x: -0.95, y: 1.02, z: -0.28, sx: 0.09, sy: 0.09, ao: 0.9 },
        { x: -0.62, y: 1.06, z: -0.16, sx: 0.085, sy: 0.085, ao: 1.0 },
        { x: -0.24, y: 0.98, z: -0.05, sx: 0.075, sy: 0.075, ao: 1.0 },
      ], circleProfile(8), { smooth: true, uvScale: 1.6 });
      bakeAO(spout, { ground: 0.4, groundH: 0.4, cavity: 0.14, down: 0.3, floor: 0.4 });
      PropFactory.add(b, spout, 'bambooCulm');
      const stream = sweepProfile([
        { x: -0.22, y: 0.95, z: -0.04, sx: 0.035, sy: 0.035, ao: 1 },
        { x: -0.19, y: basinY - 0.10, z: -0.02, sx: 0.022, sy: 0.022, ao: 1 },
      ], circleProfile(6), { smooth: true, uvScale: 2 });
      PropFactory.add(b, stream, '__water');
    }

    // 柄杓 ladles resting on a bamboo rack across the basin
    {
      const rack = [];
      for (const sz of [-0.22, 0.22]) {
        rack.push(sweepProfile([
          { x: -0.72, y: basinY + 0.05, z: sz, sx: 0.05, sy: 0.05, ao: 0.8 },
          { x: 0.72, y: basinY + 0.05, z: sz, sx: 0.05, sy: 0.05, ao: 0.9 },
        ], circleProfile(6), { smooth: true, ref: [0, 0, -1], uvScale: 2 }));
      }
      for (let i = 0; i < 3; i++) {
        const x = lerp(-0.44, 0.44, i / 2);
        rack.push(sweepProfile([
          { x, y: basinY + 0.09, z: 0.05, sx: 0.035, sy: 0.035, ao: 0.9 },
          { x: x + 0.05, y: basinY + 0.11, z: 0.62, sx: 0.032, sy: 0.032, ao: 1.0 },
        ], circleProfile(5), { smooth: true, uvScale: 2 }));
        const cup = sweepProfile([
          { x, y: basinY + 0.08, z: -0.02, sx: 0.16, sy: 0.16, ao: 0.6 },
          { x, y: basinY + 0.17, z: -0.02, sx: 0.17, sy: 0.17, ao: 0.95 },
        ], circleProfile(8), { smooth: true, uvScale: 2, capEnd: false });
        rack.push(cup);
      }
      const merged = mergeGeometries(rack.map((g) => normalizeGeo(g)), false);
      bakeAO(merged, { ground: 0, cavity: 0.24, down: 0.3, floor: 0.4 });
      PropFactory.add(b, merged, 'bambooCulm');
    }

    b.anchors.basin = [0, basinY, 0];
    b.bounds = { r: Math.hypot(hw + 0.85, hd + 0.85), h: roof.ridgeY + 0.4 };
    return b;
  }

  // =====================================================================
  //  鐘楼  BELL TOWER
  // =====================================================================

  /** Shōrō: a raised platform on four battered posts carrying a bronze bell. */
  bellTower(opts = {}) {
    const s = opts.size ?? 4.4;
    const floorY = opts.floorY ?? 1.55;
    const postH = opts.postH ?? 3.5;
    const b = PropFactory.build();
    const h = s * 0.5;
    const rnd = makeRandom(opts.seed ?? 77);

    const timber = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * h, z = sz * h;
        timber.push(sweepProfile([
          { x: x * 1.10, y: 0.18, z: z * 1.10, sx: 0.42, sy: 0.42, ao: 0.45 },
          { x, y: floorY, z, sx: 0.38, sy: 0.38, ao: 0.78 },
          { x: x * 0.90, y: floorY + postH, z: z * 0.90, sx: 0.32, sy: 0.32, ao: 1.0 },
        ], rectProfile(0.14), { uvScale: 0.9, capStart: false }));
        PropFactory.addCollider(b, PropFactory.boxCollider(0.5, floorY + postH, 0.5, x, 0, z), 'wood');
        // diagonal braces under the platform
        const g = new BoxGeometry(0.16, 0.16, h * 1.3);
        const m = new Matrix4().makeRotationY(sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4);
        m.setPosition(x * 0.55, floorY - 0.5, z * 0.55);
        g.applyMatrix4(m);
        normalizeGeo(g);
        timber.push(g);
      }
    }
    // platform beams + deck
    for (const sz of [-1, 1]) {
      const g = new BoxGeometry(s + 0.9, 0.30, 0.26);
      g.translate(0, floorY - 0.16, sz * h);
      normalizeGeo(g); timber.push(g);
      const t = new BoxGeometry(s + 0.9, 0.24, 0.22);
      t.translate(0, floorY + postH - 0.14, sz * h * 0.9);
      normalizeGeo(t); timber.push(t);
    }
    for (const sx of [-1, 1]) {
      const g = new BoxGeometry(0.26, 0.30, s + 0.9);
      g.translate(sx * h, floorY - 0.16, 0);
      normalizeGeo(g); timber.push(g);
      const t = new BoxGeometry(0.22, 0.24, s + 0.9);
      t.translate(sx * h * 0.9, floorY + postH - 0.14, 0);
      normalizeGeo(t); timber.push(t);
    }
    {
      const deck = new BoxGeometry(s + 0.7, 0.16, s + 0.7);
      deck.translate(0, floorY + 0.08, 0);
      normalizeGeo(deck); timber.push(deck);
      PropFactory.addCollider(b, PropFactory.boxCollider(s + 0.7, floorY + 0.16, s + 0.7, 0, 0), 'wood', true, true);
    }
    // railing
    for (const sz of [-1, 1]) {
      const g = new BoxGeometry(s + 0.7, 0.10, 0.14);
      g.translate(0, floorY + 0.72, sz * (h + 0.3));
      normalizeGeo(g); timber.push(g);
    }
    for (const sx of [-1, 1]) {
      const g = new BoxGeometry(0.14, 0.10, s + 0.7);
      g.translate(sx * (h + 0.3), floorY + 0.72, 0);
      normalizeGeo(g); timber.push(g);
    }
    {
      const merged = mergeGeometries(timber, false);
      bakeAO(merged, { ground: 0.42, groundH: 0.6, cavity: 0.26, down: 0.36, floor: 0.3 });
      weatherBand(merged, 0, 1.1, 0.74, 0.76, 0.68, 0.3);
      PropFactory.add(b, merged, 'cedar');
    }

    const roof = this.roofIrimoya({
      halfX: h + 1.5, halfZ: h + 1.5, rise: 2.0, baseY: floorY + postH + 0.18,
      material: opts.roofMaterial ?? 'roofTile', hip: 0.62, segX: 6, segZ: 6,
      thickness: 0.2, lift: 0.42, gableMaterial: 'cedar',
    });
    for (const p of roof.parts) PropFactory.add(b, p.geometry, p.material);

    // 梵鐘 the bell — a bronze bell with a ribbed crown and lotus bosses.
    const bellTop = floorY + postH - 0.32;
    const bellH = 1.85;
    const bell = sweepProfile([
      { x: 0, y: bellTop, z: 0, sx: 0.30, sy: 0.30, ao: 0.5 },
      { x: 0, y: bellTop - 0.16, z: 0, sx: 0.62, sy: 0.62, ao: 0.7 },
      { x: 0, y: bellTop - 0.55, z: 0, sx: 0.86, sy: 0.86, ao: 0.86 },
      { x: 0, y: bellTop - 1.30, z: 0, sx: 1.02, sy: 1.02, ao: 0.95 },
      { x: 0, y: bellTop - bellH + 0.10, z: 0, sx: 1.14, sy: 1.14, ao: 1.0 },
      { x: 0, y: bellTop - bellH, z: 0, sx: 1.16, sy: 1.16, ao: 0.7 },
    ], circleProfile(16), { smooth: true, uvScale: 1.0, capStart: false });
    bakeAO(bell, { ground: 0, cavity: 0.2, down: 0.4, floor: 0.34 });
    tintGeo(bell, 0.72, 0.78, 0.72);
    PropFactory.add(b, bell, 'steelDark');
    PropFactory.addCollider(b, PropFactory.boxCollider(1.2, bellH, 1.2, 0, bellTop - bellH, 0), 'stone');

    // 撞木 shumoku — the swinging striker on two ropes.
    {
      const beam = sweepProfile([
        { x: 0, y: bellTop - 0.95, z: h + 1.05, sx: 0.17, sy: 0.17, ao: 0.8 },
        { x: 0, y: bellTop - 0.95, z: 1.05, sx: 0.21, sy: 0.21, ao: 1.0 },
      ], circleProfile(8), { smooth: true, ref: [1, 0, 0], uvScale: 1.5 });
      bakeAO(beam, { ground: 0, cavity: 0.2, down: 0.34, floor: 0.42 });
      PropFactory.add(b, beam, 'cedarBeam');
      const ropes = [];
      for (const rz of [1.35, h + 0.85]) {
        ropes.push(sweepProfile([
          { x: 0, y: floorY + postH - 0.22, z: rz * 0.86, sx: 0.05, sy: 0.05, ao: 0.7 },
          { x: 0, y: bellTop - 0.92, z: rz, sx: 0.045, sy: 0.045, ao: 1.0 },
        ], circleProfile(5), { smooth: true, uvScale: 3 }));
      }
      PropFactory.add(b, mergeGeometries(ropes, false), 'rope');
    }

    b.anchors.bell = [0, bellTop - bellH * 0.5, 0];
    b.anchors.striker = [0, bellTop - 0.95, h + 1.4];
    b.bounds = { r: h + 1.7, h: roof.ridgeY + 0.6 };
    return b;
  }

  // =====================================================================
  //  BRIDGE
  // =====================================================================

  /**
   * 太鼓橋 drum bridge: a curved deck of individual planks, curved handrails on
   * turned posts, and a mossy underside. `dropL`/`dropR` extend the abutments
   * down to whatever the terrain is doing at each bank, so it can never float.
   */
  bridge(opts = {}) {
    const span = opts.span ?? 7.0;
    const width = opts.width ?? 2.2;
    const camber = opts.camber ?? 0.85;
    const dropL = opts.dropL ?? 1.2;
    const dropR = opts.dropR ?? 1.2;
    const rnd = makeRandom(opts.seed ?? 23);
    const b = PropFactory.build();

    const yAt = (t) => Math.sin(t * Math.PI) * camber;
    const N = 16;

    // stringers
    const stringers = [];
    for (const sx of [-1, 1]) {
      const samples = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        samples.push({ x: sx * (width * 0.5 - 0.14), y: yAt(t) - 0.16, z: lerp(-span * 0.5, span * 0.5, t), sx: 0.20, sy: 0.30, ao: 0.55 });
      }
      stringers.push(sweepProfile(samples, rectProfile(0.12), { ref: [1, 0, 0], uvScale: 0.9 }));
    }
    {
      const merged = mergeGeometries(stringers, false);
      bakeAO(merged, { ground: 0, cavity: 0.3, down: 0.5, floor: 0.24 });
      weatherBand(merged, -0.4, 0.35, 0.62, 0.86, 0.58, 0.5);   // moss on the underside
      PropFactory.add(b, merged, 'cedarBeam');
    }

    // deck planks laid across, each rolled a hair
    {
      const planks = [];
      const n = Math.max(10, Math.round(span / 0.24));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const z = lerp(-span * 0.5, span * 0.5, t);
        const y = yAt(t);
        const slope = (yAt(t + 0.5 / n) - yAt(t - 0.5 / n)) * n;
        const g = new BoxGeometry(width, 0.075, span / n - 0.012);
        const m = new Matrix4().makeRotationX(-Math.atan(slope));
        m.setPosition((rnd() - 0.5) * 0.012, y + (rnd() - 0.5) * 0.006, z);
        g.applyMatrix4(m);
        normalizeGeo(g);
        const k = 0.88 + rnd() * 0.22;
        tintGeo(g, k, k * 0.98, k * 0.94);
        planks.push(g);
      }
      const deck = mergeGeometries(planks, false);
      bakeAO(deck, { ground: 0, cavity: 0.14, down: 0.45, floor: 0.4 });
      PropFactory.add(b, deck, 'cedar');
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        PropFactory.addCollider(b, PropFactory.boxCollider(width, 0.3, span / 6, 0, yAt(t) - 0.2, lerp(-span * 0.5, span * 0.5, t)), 'wood', true, true);
      }
    }

    // handrails
    {
      const rails = [];
      for (const sx of [-1, 1]) {
        const samples = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          samples.push({ x: sx * (width * 0.5 + 0.02), y: yAt(t) + 0.94, z: lerp(-span * 0.5, span * 0.5, t), sx: 0.13, sy: 0.11, ao: 1.0 });
        }
        rails.push(sweepProfile(samples, rectProfile(0.25), { ref: [1, 0, 0], uvScale: 1.1 }));
        const np = 7;
        for (let i = 0; i <= np; i++) {
          const t = i / np;
          const z = lerp(-span * 0.5, span * 0.5, t);
          const g = sweepProfile([
            { x: sx * (width * 0.5 + 0.02), y: yAt(t) - 0.05, z, sx: 0.13, sy: 0.13, ao: 0.6 },
            { x: sx * (width * 0.5 + 0.02), y: yAt(t) + 0.96, z, sx: 0.11, sy: 0.11, ao: 1.0 },
          ], rectProfile(0.2), { uvScale: 1.2 });
          rails.push(g);
          if (i === 0 || i === np) {
            const knob = sweepProfile([
              { x: sx * (width * 0.5 + 0.02), y: yAt(t) + 0.96, z, sx: 0.19, sy: 0.19, ao: 0.85 },
              { x: sx * (width * 0.5 + 0.02), y: yAt(t) + 1.12, z, sx: 0.22, sy: 0.22, ao: 1.0 },
              { x: sx * (width * 0.5 + 0.02), y: yAt(t) + 1.24, z, sx: 0.08, sy: 0.08, ao: 1.0 },
            ], circleProfile(8), { smooth: true, uvScale: 1.6 });
            rails.push(knob);
          }
        }
      }
      const merged = mergeGeometries(rails.map((g) => normalizeGeo(g)), false);
      bakeAO(merged, { ground: 0, cavity: 0.26, down: 0.34, floor: 0.36 });
      PropFactory.add(b, merged, 'vermilion');
    }

    // stone abutments driven down into the bank
    for (const [sz, drop] of [[-1, dropL], [1, dropR]]) {
      const g = new BoxGeometry(width + 0.9, drop + 0.7, 1.5);
      g.translate(0, -drop * 0.5 - 0.05, sz * (span * 0.5 + 0.55));
      normalizeGeo(g);
      roughen(g, 0.03, 2.2, [1, 0, 1]);
      bakeAO(g, { ground: 0, cavity: 0.2, down: 0.3, floor: 0.3 });
      weatherBand(g, -drop, -drop * 0.2, 0.6, 0.78, 0.56, 0.6);
      PropFactory.add(b, g, 'stone');
      PropFactory.addCollider(b, PropFactory.boxCollider(width + 0.9, drop + 0.7, 1.5, 0, -drop - 0.05, sz * (span * 0.5 + 0.55)), 'stone', true, true);
    }

    b.anchors.north = [0, 0, -span * 0.5];
    b.anchors.south = [0, 0, span * 0.5];
    b.bounds = { r: span * 0.6 + 1, h: camber + 1.4 };
    return b;
  }

  // =====================================================================
  //  FENCES
  // =====================================================================

  /**
   * 玉垣 tamagaki — the vertical-slat shrine fence. `pts` is a polyline in the
   * local XZ frame; `gaps` are [t0,t1] parameter ranges left open for gateways.
   */
  tamagaki(opts = {}) {
    const pts = opts.points ?? [[-4, 0], [4, 0]];
    const h = opts.height ?? 1.35;
    const slat = opts.slatSpacing ?? 0.20;
    const mat = opts.material ?? 'cedar';
    const rnd = makeRandom(opts.seed ?? 41);
    const b = PropFactory.build();
    const geos = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.1) continue;
      const ang = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / slat));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = lerp(x0, x1, t), z = lerp(z0, z1, t);
        const hh = h * (0.97 + rnd() * 0.06);
        const g = sweepProfile([
          { x, y: 0, z, sx: 0.085, sy: 0.055, ao: 0.42 },
          { x, y: hh - 0.06, z, sx: 0.082, sy: 0.052, ao: 0.95 },
          { x, y: hh, z, sx: 0.055, sy: 0.036, ao: 1.0 },
        ], rectProfile(0), { uvScale: 1.4, ref: [Math.cos(ang), 0, -Math.sin(ang)] });
        geos.push(g);
      }
      // posts, top rail and bottom rail
      const rail = (y, w, d) => {
        const g = new BoxGeometry(w, 0.10, len);
        const m = new Matrix4().makeRotationY(ang);
        m.setPosition((x0 + x1) * 0.5, y, (z0 + z1) * 0.5);
        g.applyMatrix4(m);
        normalizeGeo(g);
        geos.push(g);
      };
      rail(h * 0.92, 0.14);
      rail(0.16, 0.13);
      const np = Math.max(1, Math.round(len / 2.1));
      for (let k = 0; k <= np; k++) {
        const t = k / np;
        const x = lerp(x0, x1, t), z = lerp(z0, z1, t);
        const g = sweepProfile([
          { x, y: -0.05, z, sx: 0.20, sy: 0.20, ao: 0.4 },
          { x, y: h + 0.14, z, sx: 0.17, sy: 0.17, ao: 0.95 },
          { x, y: h + 0.24, z, sx: 0.10, sy: 0.10, ao: 1.0 },
        ], rectProfile(0.16), { uvScale: 1.1 });
        geos.push(g);
      }
      PropFactory.addCollider(b, (() => {
        const g = new BoxGeometry(0.3, h, len);
        const m = new Matrix4().makeRotationY(ang);
        m.setPosition((x0 + x1) * 0.5, h * 0.5, (z0 + z1) * 0.5);
        g.applyMatrix4(m);
        g.deleteAttribute('uv'); g.deleteAttribute('normal');
        return g;
      })(), 'wood', true, false);
    }

    if (!geos.length) return b;
    const merged = mergeGeometries(geos.map((g) => normalizeGeo(g)), false);
    bakeAO(merged, { ground: 0.5, groundH: 0.45, cavity: 0.24, down: 0.28, floor: 0.3 });
    weatherBand(merged, 0, 0.55, 0.7, 0.76, 0.64, 0.35);
    PropFactory.add(b, merged, mat);
    b.bounds = { r: 1, h: h + 0.3 };
    return b;
  }

  /** 竹垣 a rustic bamboo fence — uneven culms lashed to two horizontal rails. */
  bambooFence(opts = {}) {
    const pts = opts.points ?? [[-4, 0], [4, 0]];
    const h = opts.height ?? 1.5;
    const rnd = makeRandom(opts.seed ?? 63);
    const b = PropFactory.build();
    const culms = [];
    const ropes = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.1) continue;
      const ang = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 0.13));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = lerp(x0, x1, t) + (rnd() - 0.5) * 0.02;
        const z = lerp(z0, z1, t) + (rnd() - 0.5) * 0.02;
        const hh = h * (0.86 + rnd() * 0.28);
        const r = 0.032 + rnd() * 0.014;
        const lean = (rnd() - 0.5) * 0.06;
        const g = sweepProfile([
          { x, y: 0, z, sx: r * 2.1, sy: r * 2.1, ao: 0.4 },
          { x: x + lean * 0.4, y: hh * 0.55, z: z + lean * 0.2, sx: r * 2, sy: r * 2, ao: 0.85 },
          { x: x + lean, y: hh, z: z + lean * 0.5, sx: r * 1.7, sy: r * 1.7, ao: 1.0 },
        ], circleProfile(5), { smooth: true, uvScale: 1.6, capStart: false });
        const k2 = 0.82 + rnd() * 0.34;
        tintGeo(g, k2, k2 * (0.95 + rnd() * 0.12), k2 * 0.85);
        culms.push(g);
      }
      for (const ry of [h * 0.3, h * 0.78]) {
        const g = sweepProfile([
          { x: x0, y: ry, z: z0, sx: 0.055, sy: 0.055, ao: 0.75 },
          { x: x1, y: ry, z: z1, sx: 0.055, sy: 0.055, ao: 0.9 },
        ], circleProfile(6), { smooth: true, ref: [Math.cos(ang), 0, -Math.sin(ang)], uvScale: 2.4 });
        culms.push(g);
        // diagonal lashings at intervals
        const nl = Math.max(1, Math.round(len / 0.85));
        for (let k = 0; k < nl; k++) {
          const t = (k + 0.5) / nl;
          const x = lerp(x0, x1, t), z = lerp(z0, z1, t);
          const lg = sweepProfile([
            { x: x - Math.cos(ang) * 0.05, y: ry - 0.08, z: z + Math.sin(ang) * 0.05, sx: 0.028, sy: 0.028, ao: 0.7 },
            { x: x + Math.cos(ang) * 0.05, y: ry + 0.08, z: z - Math.sin(ang) * 0.05, sx: 0.028, sy: 0.028, ao: 1.0 },
          ], circleProfile(5), { smooth: true, uvScale: 3 });
          ropes.push(lg);
        }
      }
      PropFactory.addCollider(b, (() => {
        const g = new BoxGeometry(0.22, h, len);
        const m = new Matrix4().makeRotationY(ang);
        m.setPosition((x0 + x1) * 0.5, h * 0.5, (z0 + z1) * 0.5);
        g.applyMatrix4(m);
        g.deleteAttribute('uv'); g.deleteAttribute('normal');
        return g;
      })(), 'wood', true, false);
    }

    if (culms.length) {
      const merged = mergeGeometries(culms.map((g) => normalizeGeo(g)), false);
      bakeAO(merged, { ground: 0.48, groundH: 0.4, cavity: 0.18, down: 0.24, floor: 0.32 });
      PropFactory.add(b, merged, 'bambooCulm');
    }
    if (ropes.length) {
      const merged = mergeGeometries(ropes.map((g) => normalizeGeo(g)), false);
      PropFactory.add(b, merged, 'rope');
    }
    b.bounds = { r: 1, h: h + 0.2 };
    return b;
  }

  // =====================================================================
  //  幟 NOBORI / 絵馬 EMA / おみくじ OMIKUJI / 提灯 CHŌCHIN
  // =====================================================================

  /** A banner on a pole with a crossarm. Cloth is limp; the pole is rigid. */
  nobori(opts = {}) {
    const poleH = opts.height ?? 3.6;
    const bw = opts.bannerWidth ?? 0.62;
    const bh = opts.bannerHeight ?? 2.5;
    const mat = opts.material ?? 'clothCrimson';
    const rnd = makeRandom(opts.seed ?? 12);
    const b = PropFactory.build();

    const pole = sweepProfile([
      { x: 0, y: -0.1, z: 0, sx: 0.085, sy: 0.085, ao: 0.4 },
      { x: 0, y: poleH * 0.5, z: 0, sx: 0.075, sy: 0.075, ao: 0.85 },
      { x: 0, y: poleH, z: 0, sx: 0.055, sy: 0.055, ao: 1.0 },
    ], circleProfile(7), { smooth: true, uvScale: 1.4, capStart: false });
    bakeAO(pole, { ground: 0.5, groundH: 0.5, cavity: 0.1, floor: 0.34 });
    PropFactory.add(b, pole, 'bambooCulm');

    const arm = sweepProfile([
      { x: -0.06, y: poleH - 0.06, z: 0, sx: 0.05, sy: 0.05, ao: 0.8 },
      { x: bw + 0.10, y: poleH - 0.02, z: 0, sx: 0.045, sy: 0.045, ao: 1.0 },
    ], circleProfile(6), { smooth: true, ref: [0, 0, -1], uvScale: 2 });
    PropFactory.add(b, arm, 'bambooCulm');
    PropFactory.addCollider(b, PropFactory.boxCollider(0.22, poleH, 0.22, 0, 0), 'wood');

    // Banner: hung from the arm and tied along the pole, so the free corner is
    // the far bottom one.
    // Was 5x8 with a 12 mm ripple, one flat vertex-colour ramp and nothing else.
    // Round 8: "a single near-uniform dark rectangle with faint noise, no lettering,
    // no hem, no fold, no wind curl, and no lit face despite a clear key light from
    // frame-left". A plane 12 mm off flat has exactly one normal in it, so whether
    // any of it takes the key is decided entirely by the bearing it was planted on —
    // and at this hour three of the four bearings lose. 11x22 costs 968 triangles
    // against 320 and is what lets the cloth have a shape at all.
    const NX = 11, NY = 22;
    const verts = [], uvs = [], cols = [], idx = [], fl = [];
    const y0 = poleH - 0.10, y1 = y0 - bh;
    // Kanji column: three glyph blocks down the middle third, drawn into the vertex
    // colour because the cloth material is shared and its map is not ours (§8). Each
    // block is a 5x5 on/off stamp — not lettering that reads at a metre, but at the
    // 350 px this banner occupies in 'torii' it is the difference between printed
    // cloth and a blank rectangle.
    const GLYPH = [0x1f, 0x04, 0x1f, 0x04, 0x1f, 0x0e, 0x11, 0x1f, 0x11, 0x11, 0x1f, 0x08, 0x1f, 0x02, 0x1f];
    const inkAt = (u, v) => {
      const gv = (v - 0.10) / 0.76;
      if (gv < 0 || gv >= 1) return 0;
      const g = Math.min(2, (gv * 3) | 0);
      const ry = ((gv * 3 - g) * 5) | 0;
      const gu = (u - 0.30) / 0.40;
      if (gu < 0 || gu >= 1) return 0;
      const rx = (gu * 5) | 0;
      return (GLYPH[g * 5 + ry] >> (4 - rx)) & 1;
    };
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NY;
        const x = lerp(0.07, bw + 0.07, u);
        const y = lerp(y0, y1, v);
        // The rest curl. Cloth hung from one edge and tied along another does not
        // hang flat: it takes an S down its free edge, and the S deepens toward the
        // bottom where nothing holds it. Amplitude scales with the free-edge
        // distance 'u', so the tied edge stays on the pole. 0.16 * bw of relief
        // gives the surface normals a ±38 degree spread about the plane, so some
        // band of it faces the key from any bearing the banner is planted on.
        const curl = Math.sin(v * 4.3 + u * 1.7) * 0.16 * bw * u * (0.35 + 0.65 * v)
                   + Math.sin(u * 5.9 + v * 2.2) * 0.045 * bw * u;
        verts.push(x, y, curl);
        uvs.push(u, v);
        // Hem: a stitched double border, darker and slightly warm, one cell wide.
        const hem = (i === 0 || i === NX || j === 0 || j === NY) ? 1
                  : (i === 1 || i === NX - 1 || j === 1 || j === NY - 1) ? 0.55 : 0;
        const ink = inkAt(u, v);
        let k = lerp(0.82, 1.0, 1 - v * 0.4);
        k *= 1 - hem * 0.34;
        cols.push(k * (1 - ink * 0.80), k * (1 - ink * 0.86), k * (1 - ink * 0.88));
        // Anchored along the pole edge and the top rail.
        fl.push(clamp(Math.max(u, v * 0.25) * (0.35 + v * 0.65), 0, 1), 0.9);
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, c = (j + 1) * (NX + 1) + i;
        idx.push(a, c, c + 1, a, c + 1, a + 1);
      }
    }
    const banner = new BufferGeometry();
    banner.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    banner.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    banner.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    banner.setAttribute('aFlutter', new BufferAttribute(new Float32Array(fl), 2));
    banner.setIndex(idx);
    banner.computeVertexNormals();
    tintGeo(banner, 0.92 + rnd() * 0.16, 0.92 + rnd() * 0.12, 0.92 + rnd() * 0.12);
    PropFactory.add(b, banner, mat);

    b.bounds = { r: bw + 0.4, h: poleH + 0.2 };
    return b;
  }

  /** 絵馬 a single votive plaque: pentagonal board on a loop of string. */
  emaPlaque(opts = {}) {
    const w = opts.width ?? 0.16;
    const h = opts.height ?? 0.12;
    const rnd = makeRandom(opts.seed ?? 3);
    const b = PropFactory.build();
    // House-shaped outline, extruded.
    const poly = [[-w, -h * 0.55], [w, -h * 0.55], [w, h * 0.3], [0, h * 0.85], [-w, h * 0.3]];
    const verts = [], uvs = [], cols = [], idx = [];
    const t = 0.012;
    for (let side = 0; side < 2; side++) {
      const z = side === 0 ? t : -t;
      const base = verts.length / 3;
      for (const p of poly) { verts.push(p[0], p[1], z); uvs.push(p[0] * 4 + 0.5, p[1] * 4 + 0.5); cols.push(1, 1, 1); }
      for (let i = 1; i < poly.length - 1; i++) {
        if (side === 0) idx.push(base, base + i, base + i + 1);
        else idx.push(base, base + i + 1, base + i);
      }
    }
    const base = verts.length / 3;
    for (const p of poly) {
      verts.push(p[0], p[1], t, p[0], p[1], -t);
      uvs.push(p[0], 0, p[0], 1);
      cols.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7);
    }
    for (let i = 0; i < poly.length; i++) {
      const a = base + i * 2, c = base + i * 2 + 1;
      const d = base + ((i + 1) % poly.length) * 2 + 1, e = base + ((i + 1) % poly.length) * 2;
      idx.push(a, c, d, a, d, e);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.translate(0, -h * 0.85 - 0.10, 0);
    bakeAO(geo, { ground: 0, cavity: 0.2, down: 0.25, floor: 0.5 });
    tintGeo(geo, 0.95 + rnd() * 0.12, 0.9 + rnd() * 0.14, 0.82 + rnd() * 0.14);
    PropFactory.add(b, geo, 'cedar');

    const cord = sweepProfile([
      { x: -w * 0.5, y: -0.02, z: 0, sx: 0.012, sy: 0.012, ao: 0.9 },
      { x: 0, y: -0.09, z: 0, sx: 0.012, sy: 0.012, ao: 1.0 },
      { x: w * 0.5, y: -0.02, z: 0, sx: 0.012, sy: 0.012, ao: 0.9 },
    ], circleProfile(4), { smooth: true, ref: [0, 0, -1], uvScale: 4 });
    PropFactory.add(b, cord, 'clothCrimson');
    b.bounds = { r: w * 1.2, h: h * 2 };
    return b;
  }

  /** The rack the ema hang from — posts, rails, and a little pent roof. */
  emaRack(opts = {}) {
    const w = opts.width ?? 3.0;
    const h = opts.height ?? 1.85;
    const b = PropFactory.build();
    const timber = [];
    for (const sx of [-1, 1]) {
      timber.push(sweepProfile([
        { x: sx * w * 0.5, y: -0.05, z: 0, sx: 0.16, sy: 0.16, ao: 0.42 },
        { x: sx * w * 0.5, y: h, z: 0, sx: 0.14, sy: 0.14, ao: 0.95 },
        { x: sx * w * 0.5, y: h + 0.09, z: 0, sx: 0.09, sy: 0.09, ao: 1.0 },
      ], rectProfile(0.16), { uvScale: 1.2 }));
      PropFactory.addCollider(b, PropFactory.boxCollider(0.24, h, 0.24, sx * w * 0.5, 0, 0), 'wood');
    }
    for (const [ry, rd] of [[h - 0.14, 0.13], [h * 0.55, 0.10]]) {
      const g = new BoxGeometry(w + 0.28, rd, 0.11);
      g.translate(0, ry, 0);
      normalizeGeo(g);
      timber.push(g);
    }
    // pent roof over the rack
    for (const sz of [-1, 1]) {
      const g = new BoxGeometry(w + 0.7, 0.06, 0.52);
      const m = new Matrix4().makeRotationX(sz * 0.42);
      m.setPosition(0, h + 0.20, sz * 0.22);
      g.applyMatrix4(m);
      normalizeGeo(g);
      timber.push(g);
    }
    const merged = mergeGeometries(timber.map((g) => normalizeGeo(g)), false);
    bakeAO(merged, { ground: 0.48, groundH: 0.45, cavity: 0.26, down: 0.34, floor: 0.32 });
    weatherBand(merged, 0, 0.6, 0.72, 0.76, 0.66, 0.32);
    PropFactory.add(b, merged, 'cedar');
    b.anchors.rail = [0, h - 0.14, 0];
    b.anchors.rail2 = [0, h * 0.55, 0];
    b.bounds = { r: w * 0.6, h: h + 0.4 };
    return b;
  }

  /** おみくじ paper fortunes knotted in rows onto a rack of taut cords. */
  omikujiRack(opts = {}) {
    const w = opts.width ?? 2.6;
    const h = opts.height ?? 1.6;
    const rows = opts.rows ?? 3;
    const density = clamp(opts.density ?? 1, 0, 1);
    const rnd = makeRandom(opts.seed ?? 88);
    const b = PropFactory.build();

    const frame = [];
    for (const sx of [-1, 1]) {
      frame.push(sweepProfile([
        { x: sx * w * 0.5, y: -0.05, z: 0, sx: 0.10, sy: 0.10, ao: 0.4 },
        { x: sx * w * 0.5, y: h, z: 0, sx: 0.085, sy: 0.085, ao: 1.0 },
      ], circleProfile(7), { smooth: true, uvScale: 1.5 }));
      PropFactory.addCollider(b, PropFactory.boxCollider(0.18, h, 0.18, sx * w * 0.5, 0, 0), 'wood');
    }
    const strips = [];
    for (let r = 0; r < rows; r++) {
      const y = h - 0.14 - r * (h * 0.30);
      frame.push(sweepProfile([
        { x: -w * 0.5, y, z: 0, sx: 0.028, sy: 0.028, ao: 0.85 },
        { x: 0, y: y - 0.03, z: 0, sx: 0.028, sy: 0.028, ao: 1.0 },
        { x: w * 0.5, y, z: 0, sx: 0.028, sy: 0.028, ao: 0.85 },
      ], circleProfile(5), { smooth: true, ref: [0, 0, -1], uvScale: 3 }));

      const n = Math.max(4, Math.round(w / 0.075 * density));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = lerp(-w * 0.48, w * 0.48, t) + (rnd() - 0.5) * 0.01;
        const sy = y - 0.03 * Math.sin(t * Math.PI);
        const len = 0.16 + rnd() * 0.08;
        const sw = 0.018;
        const g = new BufferGeometry();
        const vs = new Float32Array([
          -sw, sy, 0, sw, sy, 0,
          sw + (rnd() - 0.5) * 0.01, sy - len, (rnd() - 0.5) * 0.02,
          -sw + (rnd() - 0.5) * 0.01, sy - len, (rnd() - 0.5) * 0.02,
        ]);
        for (let k = 0; k < 4; k++) vs[k * 3] += x;
        g.setAttribute('position', new BufferAttribute(vs, 3));
        g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
        g.setAttribute('color', new BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86]), 3));
        g.setAttribute('aFlutter', new BufferAttribute(new Float32Array([0.1, 0.7, 0.1, 0.7, 1.0, 0.7, 1.0, 0.7]), 2));
        g.setIndex([0, 3, 2, 0, 2, 1]);
        g.computeVertexNormals();
        strips.push(g);
      }
    }
    const fm = mergeGeometries(frame.map((g) => normalizeGeo(g)), false);
    bakeAO(fm, { ground: 0.45, groundH: 0.4, cavity: 0.2, floor: 0.34 });
    PropFactory.add(b, fm, 'cedar');
    if (strips.length) {
      const sm = mergeGeometries(strips.map((g) => normalizeGeo(g, true)), false);
      PropFactory.add(b, sm, 'paper');
    }
    b.bounds = { r: w * 0.6, h: h + 0.2 };
    return b;
  }

  /** 提灯 a ribbed paper lantern, lit, swinging gently from its cord. */
  hangingLantern(opts = {}) {
    const h = opts.height ?? 0.52;
    const r = opts.radius ?? 0.17;
    const cord = opts.cord ?? 0.35;
    const b = PropFactory.build();

    const samples = [];
    const RN = 18;
    for (let i = 0; i <= RN; i++) {
      const t = i / RN;
      const bulge = Math.sin(t * Math.PI);
      // 竹ひご the split-bamboo ribs the paper is pasted over. Twice the samples
      // so the rib ripple resolves, and the ripple is carried in the vertex
      // colour as well as the radius — `lanternPaperMaterial` multiplies the
      // emissive by it, so each rib lands as a genuine darker line across the
      // belly instead of a shading detail lost under a flat 250.
      const rib = Math.sin(t * Math.PI * 9);
      const rr = lerp(r * 0.42, r, bulge) + rib * 0.006;
      samples.push({
        x: 0, y: -cord - t * h, z: 0, sx: rr * 2, sy: rr * 2,
        // Hot across the belly opposite the flame, dying into both metal rings.
        ao: lerp(0.44, 1.0, Math.pow(bulge, 0.5)) * (1 - Math.max(0, -rib) * 0.20),
      });
    }
    // Lit paper, not paper. A row of these under a dark eave is the single most
    // characteristic highlight in this setting and the whole surface has to carry
    // it — the AO stays in the vertex colour so the ribs still read.
    const body = sweepProfile(samples, circleProfile(14), { smooth: true, uvScale: 1.4, capStart: false, capEnd: false });
    bakeFlutter(body, 3.0, (x, y) => clamp((-y) / (cord + h), 0, 1));
    PropFactory.add(b, body, '__lanternPaper');

    // cord and the cap/base rings — the rings in leaf, for a glint off the metal
    const bits = [];
    const rings = [];
    for (const [y, rr] of [[-cord, r * 0.46], [-cord - h, r * 0.46]]) {
      rings.push(sweepProfile([
        { x: 0, y: y - 0.015, z: 0, sx: rr * 2.2, sy: rr * 2.2, ao: 0.7 },
        { x: 0, y: y + 0.015, z: 0, sx: rr * 2.2, sy: rr * 2.2, ao: 0.9 },
      ], circleProfile(10), { smooth: true, uvScale: 2 }));
    }
    // The hanging cord rides in the leaf bucket with the rings: it is a brass
    // fitting either way, and it keeps the prototype to four instanced meshes.
    rings.push(sweepProfile([
      { x: 0, y: 0, z: 0, sx: 0.018, sy: 0.018, ao: 0.7 },
      { x: 0, y: -cord, z: 0, sx: 0.018, sy: 0.018, ao: 0.9 },
    ], circleProfile(4), { smooth: true, uvScale: 4 }));
    PropFactory.add(b, mergeGeometries(rings.map((g) => normalizeGeo(g)), false), '__goldPolished');

    const flame = sweepProfile([
      { x: 0, y: -cord - h * 0.22, z: 0, sx: r * 1.05, sy: r * 1.05, ao: 1 },
      { x: 0, y: -cord - h * 0.72, z: 0, sx: r * 1.15, sy: r * 1.15, ao: 1 },
    ], circleProfile(8), { smooth: true, uvScale: 1 });
    PropFactory.add(b, flame, '__ember');
    b.lights.push({ x: 0, y: -cord - h * 0.5, z: 0, color: 0xffb060, intensity: 1.4, distance: 4.2, flicker: 0.7 });
    b.bounds = { r: r * 1.2, h: cord + h };
    return b;
  }

  // =====================================================================
  //  CLUTTER — the stuff that says someone lives here
  // =====================================================================

  /** A staved barrel with iron hoops. `cask` swaps to a straw-wrapped komodaru. */
  barrel(opts = {}) {
    const h = opts.height ?? 0.82;
    const r = opts.radius ?? 0.28;
    const staves = opts.staves ?? 12;
    const rnd = makeRandom(opts.seed ?? 19);
    const b = PropFactory.build();

    const samples = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const rr = r * (0.86 + 0.14 * Math.sin(t * Math.PI));
      samples.push({ x: 0, y: t * h, z: 0, sx: rr * 2, sy: rr * 2, ao: lerp(0.5, 1.0, t) });
    }
    const body = sweepProfile(samples, circleProfile(staves), { uvScale: 1.6, capStart: false });
    bakeAO(body, { ground: 0.45, groundH: 0.3, cavity: 0.2, down: 0.3, floor: 0.32 });
    const k = 0.9 + rnd() * 0.2;
    tintGeo(body, k, k * 0.97, k * 0.92);
    PropFactory.add(b, body, opts.material ?? 'cedar');

    const hoops = [];
    for (const t of [0.14, 0.5, 0.86]) {
      const rr = r * (0.87 + 0.14 * Math.sin(t * Math.PI)) * 1.035;
      hoops.push(sweepProfile([
        { x: 0, y: t * h - 0.028, z: 0, sx: rr * 2, sy: rr * 2, ao: 0.65 },
        { x: 0, y: t * h + 0.028, z: 0, sx: rr * 2, sy: rr * 2, ao: 1.0 },
      ], circleProfile(staves), { smooth: true, uvScale: 3, capStart: false, capEnd: false }));
    }
    PropFactory.add(b, mergeGeometries(hoops, false), 'steelDark');
    PropFactory.addCollider(b, PropFactory.boxCollider(r * 2, h, r * 2, 0, 0), 'wood');
    b.bounds = { r: r * 1.1, h };
    return b;
  }

  /** 菰樽 a straw-wrapped sake cask: the bright painted band is the whole point. */
  sakeCask(opts = {}) {
    const h = opts.height ?? 0.60;
    const r = opts.radius ?? 0.25;
    const rnd = makeRandom(opts.seed ?? 21);
    const b = PropFactory.build();

    const samples = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const rr = r * (0.94 + 0.06 * Math.sin(t * Math.PI));
      samples.push({ x: 0, y: t * h, z: 0, sx: rr * 2, sy: rr * 2, ao: lerp(0.55, 1.0, t) });
    }
    const straw = sweepProfile(samples, circleProfile(14), { smooth: true, uvScale: 2.4, capStart: false, capEnd: false });
    roughen(straw, 0.008, 9);
    bakeAO(straw, { ground: 0.4, groundH: 0.25, cavity: 0.2, down: 0.3, floor: 0.35 });
    PropFactory.add(b, straw, 'rope');

    // painted band + the head, in one of the classic cask colours
    const palette = [[1.0, 0.42, 0.28], [0.95, 0.90, 0.86], [0.32, 0.42, 0.66], [0.90, 0.76, 0.30], [0.36, 0.52, 0.36]];
    const c = palette[(rnd() * palette.length) | 0];
    const band = sweepProfile([
      { x: 0, y: h * 0.26, z: 0, sx: r * 2.03, sy: r * 2.03, ao: 0.85 },
      { x: 0, y: h * 0.74, z: 0, sx: r * 2.03, sy: r * 2.03, ao: 1.0 },
    ], circleProfile(14), { smooth: true, uvScale: 1.8, capStart: false, capEnd: false });
    tintGeo(band, c[0], c[1], c[2]);
    const head = sweepProfile([
      { x: 0, y: h - 0.02, z: 0, sx: r * 1.9, sy: r * 1.9, ao: 0.9 },
      { x: 0, y: h + 0.015, z: 0, sx: r * 1.9, sy: r * 1.9, ao: 1.0 },
    ], circleProfile(12), { smooth: true, uvScale: 2 });
    tintGeo(head, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
    PropFactory.add(b, mergeGeometries([normalizeGeo(band), normalizeGeo(head)], false), 'clothCrimson');
    PropFactory.addCollider(b, PropFactory.boxCollider(r * 2, h, r * 2, 0, 0), 'wood');
    b.bounds = { r: r * 1.1, h };
    return b;
  }

  /** Slatted wooden crate. */
  crate(opts = {}) {
    const s = opts.size ?? 0.55;
    const rnd = makeRandom(opts.seed ?? 29);
    const b = PropFactory.build();
    const parts = [];
    const t = 0.045;
    for (const [ax, sgn] of [['z', 1], ['z', -1], ['x', 1], ['x', -1]]) {
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        const y = lerp(t, s - t, i / (rows - 1));
        const g = new BoxGeometry(ax === 'z' ? s : t, s / rows - 0.02, ax === 'z' ? t : s);
        g.translate(ax === 'x' ? sgn * s * 0.5 : 0, y, ax === 'z' ? sgn * s * 0.5 : 0);
        normalizeGeo(g);
        parts.push(g);
      }
      const post = new BoxGeometry(ax === 'z' ? s : t * 1.4, s, ax === 'z' ? t * 1.4 : s);
      post.translate(ax === 'x' ? sgn * s * 0.5 : 0, s * 0.5, ax === 'z' ? sgn * s * 0.5 : 0);
      normalizeGeo(post);
      if (Math.abs(sgn) === 1 && ax === 'x') parts.push(post);
    }
    const top = new BoxGeometry(s, t, s);
    top.translate(0, s - t * 0.5, 0);
    normalizeGeo(top);
    parts.push(top);
    const merged = mergeGeometries(parts, false);
    bakeAO(merged, { ground: 0.45, groundH: 0.3, cavity: 0.3, down: 0.32, floor: 0.32 });
    const k = 0.88 + rnd() * 0.24;
    tintGeo(merged, k, k * 0.97, k * 0.9);
    PropFactory.add(b, merged, 'cedar');
    PropFactory.addCollider(b, PropFactory.boxCollider(s, s, s, 0, 0), 'wood');
    b.bounds = { r: s * 0.75, h: s };
    return b;
  }

  /** Straw bale, bound at three points. */
  strawBale(opts = {}) {
    const l = opts.length ?? 0.9;
    const r = opts.radius ?? 0.24;
    const b = PropFactory.build();
    const samples = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const rr = r * (0.72 + 0.28 * Math.sin(t * Math.PI) + 0.1);
      samples.push({ x: lerp(-l * 0.5, l * 0.5, t), y: r * 0.95, z: 0, sx: rr * 2, sy: rr * 2, ao: lerp(0.7, 1.0, Math.sin(t * Math.PI)) });
    }
    const body = sweepProfile(samples, circleProfile(10), { smooth: true, ref: [0, 0, -1], uvScale: 2.6 });
    roughen(body, 0.012, 8);
    bakeAO(body, { ground: 0.42, groundH: 0.3, cavity: 0.24, down: 0.32, floor: 0.32 });
    PropFactory.add(b, body, 'rope');
    const ties = [];
    for (const t of [0.2, 0.5, 0.8]) {
      const x = lerp(-l * 0.5, l * 0.5, t);
      const rr = r * (0.72 + 0.28 * Math.sin(t * Math.PI) + 0.1) * 1.05;
      ties.push(sweepProfile([
        { x: x - 0.02, y: r * 0.95, z: 0, sx: rr * 2, sy: rr * 2, ao: 0.75 },
        { x: x + 0.02, y: r * 0.95, z: 0, sx: rr * 2, sy: rr * 2, ao: 1.0 },
      ], circleProfile(10), { smooth: true, ref: [0, 0, -1], uvScale: 3, capStart: false, capEnd: false }));
    }
    const tm = mergeGeometries(ties, false);
    tintGeo(tm, 0.72, 0.66, 0.55);
    PropFactory.add(b, tm, 'rope');
    PropFactory.addCollider(b, PropFactory.boxCollider(l, r * 2, r * 2, 0, 0), 'wood');
    b.bounds = { r: l * 0.6, h: r * 2 };
    return b;
  }

  /** Split logs stacked with real per-log rotation and a couple fallen off. */
  woodpile(opts = {}) {
    const w = opts.width ?? 2.2;
    const rows = opts.rows ?? 4;
    const rnd = makeRandom(opts.seed ?? 37);
    const b = PropFactory.build();
    const logs = [];
    const lr = 0.075;
    for (let row = 0; row < rows; row++) {
      const n = Math.max(2, Math.round(w / (lr * 2.15)) - row);
      for (let i = 0; i < n; i++) {
        const x = lerp(-w * 0.5 + lr, w * 0.5 - lr, n === 1 ? 0.5 : i / (n - 1)) + (rnd() - 0.5) * 0.02;
        const y = lr + row * lr * 1.78 + (rnd() - 0.5) * 0.01;
        const r2 = lr * (0.78 + rnd() * 0.42);
        const len = 0.52 + rnd() * 0.14;
        const g = sweepProfile([
          { x, y, z: -len * 0.5, sx: r2 * 2, sy: r2 * 2 * (0.85 + rnd() * 0.3), roll: rnd() * 3, ao: 0.72 },
          { x: x + (rnd() - 0.5) * 0.02, y, z: len * 0.5, sx: r2 * 1.94, sy: r2 * 1.9, roll: rnd() * 3, ao: 1.0 },
        ], circleProfile(7), { ref: [1, 0, 0], uvScale: 2.2 });
        const k = 0.8 + rnd() * 0.4;
        tintGeo(g, k, k * (0.94 + rnd() * 0.12), k * 0.86);
        logs.push(g);
      }
    }
    for (let i = 0; i < 3; i++) {
      const g = sweepProfile([
        { x: w * 0.5 + 0.2 + rnd() * 0.4, y: lr, z: -0.3 + rnd() * 0.6, sx: lr * 2, sy: lr * 2, ao: 0.6 },
        { x: w * 0.5 + 0.5 + rnd() * 0.5, y: lr * (0.9 + rnd() * 0.4), z: -0.1 + rnd() * 0.6, sx: lr * 1.8, sy: lr * 1.8, ao: 0.95 },
      ], circleProfile(6), { uvScale: 2.4 });
      logs.push(g);
    }
    const merged = mergeGeometries(logs.map((g) => normalizeGeo(g)), false);
    bakeAO(merged, { ground: 0.4, groundH: 0.4, cavity: 0.34, down: 0.3, floor: 0.3 });
    PropFactory.add(b, merged, 'bark');
    PropFactory.addCollider(b, PropFactory.boxCollider(w, rows * lr * 1.78, 0.62, 0, 0), 'wood');
    b.bounds = { r: w * 0.7, h: rows * lr * 1.78 };
    return b;
  }

  /** A coil of rope lying on the ground: a flat spiral sweep. */
  ropeCoil(opts = {}) {
    const r0 = opts.radius ?? 0.30;
    const turns = opts.turns ?? 3.2;
    const b = PropFactory.build();
    const samples = [];
    const N = 46;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * Math.PI * 2 * turns;
      const rr = lerp(r0, r0 * 0.34, t);
      samples.push({
        x: Math.cos(a) * rr, y: 0.036 + t * 0.045, z: Math.sin(a) * rr,
        sx: 0.055, sy: 0.05, roll: a * 1.2, ao: lerp(0.7, 1.0, t),
      });
    }
    const coil = sweepProfile(samples, ropeProfile(8, 3, 0.18), { smooth: true, uvScale: 3 });
    bakeAO(coil, { ground: 0.4, groundH: 0.09, cavity: 0.28, down: 0.3, floor: 0.34 });
    PropFactory.add(b, coil, 'rope');
    b.bounds = { r: r0 * 1.2, h: 0.12 };
    return b;
  }

  /** Wooden bucket, wider at the rim, with a rope bail. */
  bucket(opts = {}) {
    const h = opts.height ?? 0.30;
    const r = opts.radius ?? 0.17;
    const b = PropFactory.build();
    const body = sweepProfile([
      { x: 0, y: 0, z: 0, sx: r * 1.62, sy: r * 1.62, ao: 0.45 },
      { x: 0, y: h * 0.9, z: 0, sx: r * 2.0, sy: r * 2.0, ao: 0.92 },
      { x: 0, y: h, z: 0, sx: r * 2.04, sy: r * 2.04, ao: 1.0 },
      { x: 0, y: h - 0.03, z: 0, sx: r * 1.86, sy: r * 1.86, ao: 0.45 },
      { x: 0, y: h * 0.25, z: 0, sx: r * 1.55, sy: r * 1.55, ao: 0.28 },
    ], circleProfile(11), { uvScale: 2, capStart: false, capEnd: false });
    const bail = sweepProfile([
      { x: -r, y: h * 0.95, z: 0, sx: 0.016, sy: 0.016, ao: 0.8 },
      { x: 0, y: h * 1.35, z: 0, sx: 0.016, sy: 0.016, ao: 1.0 },
      { x: r, y: h * 0.95, z: 0, sx: 0.016, sy: 0.016, ao: 0.8 },
    ], circleProfile(5), { smooth: true, ref: [0, 0, -1], uvScale: 4 });
    tintGeo(bail, 0.74, 0.68, 0.58);       // a withy bail, not a rope one
    const merged = mergeGeometries([normalizeGeo(body), normalizeGeo(bail)], false);
    bakeAO(merged, { ground: 0.45, groundH: 0.2, cavity: 0.22, down: 0.3, floor: 0.3 });
    PropFactory.add(b, merged, 'cedar');
    b.bounds = { r: r * 1.2, h: h * 1.4 };
    return b;
  }

  /** A bamboo broom leaning against something. */
  broom(opts = {}) {
    const h = opts.height ?? 1.45;
    const rnd = makeRandom(opts.seed ?? 44);
    const b = PropFactory.build();
    const handle = sweepProfile([
      { x: 0, y: 0.02, z: 0, sx: 0.05, sy: 0.05, ao: 0.5 },
      { x: 0, y: h, z: 0, sx: 0.042, sy: 0.042, ao: 1.0 },
    ], circleProfile(6), { smooth: true, uvScale: 2 });
    PropFactory.add(b, handle, 'bambooCulm');
    const twigs = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const spread = 0.12 + rnd() * 0.09;
      twigs.push(sweepProfile([
        { x: 0, y: 0.42, z: 0, sx: 0.018, sy: 0.018, ao: 0.9 },
        { x: Math.cos(a) * spread, y: 0.02, z: Math.sin(a) * spread, sx: 0.012, sy: 0.012, ao: 0.45 },
      ], circleProfile(4), { smooth: true, uvScale: 4 }));
    }
    const tm = mergeGeometries(twigs, false);
    bakeAO(tm, { ground: 0.4, groundH: 0.2, floor: 0.34 });
    PropFactory.add(b, tm, 'rope');
    b.bounds = { r: 0.24, h };
    return b;
  }

  /** A cairn of prayer stones — good arena cover at knee height. */
  prayerStones(opts = {}) {
    const n = opts.count ?? 6;
    const rnd = makeRandom(opts.seed ?? 66);
    const b = PropFactory.build();
    const geos = [];
    let y = 0;
    let rr = opts.radius ?? 0.34;
    for (let i = 0; i < n; i++) {
      const hh = 0.09 + rnd() * 0.10;
      const g = sweepProfile([
        { x: (rnd() - 0.5) * 0.03, y, z: (rnd() - 0.5) * 0.03, sx: rr * 2, sy: rr * 1.72, ao: 0.55 },
        { x: (rnd() - 0.5) * 0.03, y: y + hh, z: (rnd() - 0.5) * 0.03, sx: rr * 1.86, sy: rr * 1.6, ao: 1.0 },
      ], circleProfile(7, rnd() * 3), { uvScale: 1.8 });
      roughen(g, 0.018, 6);
      const k = 0.86 + rnd() * 0.28;
      tintGeo(g, k, k * (0.98 + rnd() * 0.05), k * (0.94 + rnd() * 0.07));
      geos.push(g);
      y += hh * 0.92;
      rr *= 0.86;
    }
    const merged = mergeGeometries(geos.map((g) => normalizeGeo(g)), false);
    bakeAO(merged, { ground: 0.5, groundH: 0.3, cavity: 0.3, down: 0.3, floor: 0.28 });
    weatherBand(merged, 0, y * 0.5, 0.7, 0.84, 0.66, 0.4);
    PropFactory.add(b, merged, 'stone');
    PropFactory.addCollider(b, PropFactory.boxCollider((opts.radius ?? 0.34) * 2, y, (opts.radius ?? 0.34) * 1.8, 0, 0), 'stone');
    b.bounds = { r: (opts.radius ?? 0.34) * 1.2, h: y };
    return b;
  }

  /** 地蔵 a moss-covered jizō in a red bib. */
  jizo(opts = {}) {
    const h = opts.height ?? 0.78;
    const rnd = makeRandom(opts.seed ?? 99);
    const b = PropFactory.build();
    const s = h / 0.78;

    const base = sweepProfile([
      { x: 0, y: -0.04, z: 0, sx: 0.42 * s, sy: 0.42 * s, ao: 0.4 },
      { x: 0, y: 0.13 * s, z: 0, sx: 0.38 * s, sy: 0.38 * s, ao: 0.65 },
    ], circleProfile(8), { capStart: false, uvScale: 1.4 });
    const body = sweepProfile([
      { x: 0, y: 0.12 * s, z: 0, sx: 0.30 * s, sy: 0.28 * s, ao: 0.62 },
      { x: 0, y: 0.40 * s, z: 0, sx: 0.30 * s, sy: 0.28 * s, ao: 0.85 },
      { x: 0, y: 0.56 * s, z: 0, sx: 0.24 * s, sy: 0.23 * s, ao: 0.95 },
    ], circleProfile(10), { smooth: true, capStart: false, capEnd: false, uvScale: 1.6 });
    const head = sweepProfile([
      { x: 0, y: 0.54 * s, z: 0, sx: 0.19 * s, sy: 0.19 * s, ao: 0.8 },
      { x: 0, y: 0.64 * s, z: 0, sx: 0.24 * s, sy: 0.23 * s, ao: 1.0 },
      { x: 0, y: 0.74 * s, z: 0, sx: 0.20 * s, sy: 0.20 * s, ao: 1.0 },
      { x: 0, y: 0.78 * s, z: 0, sx: 0.09 * s, sy: 0.09 * s, ao: 1.0 },
    ], circleProfile(10), { smooth: true, capStart: false, uvScale: 1.8 });
    const merged = mergeGeometries([base, body, head].map((g) => normalizeGeo(g)), false);
    roughen(merged, 0.006 * s, 7);
    bakeAO(merged, { ground: 0.5, groundH: 0.3 * s, cavity: 0.32, down: 0.3, floor: 0.28 });
    // Moss on the shaded side and creeping up from the base.
    shadeGeo(merged, (x, y, z, nx, ny, nz) => 1);
    weatherBand(merged, 0, 0.42 * s, 0.62, 0.86, 0.58, 0.42);
    PropFactory.add(b, merged, 'stone');

    // the bib
    const bib = new BufferGeometry();
    const bw = 0.24 * s, by = 0.52 * s, bl = 0.26 * s;
    const vs = new Float32Array([
      -bw, by, 0.20 * s, bw, by, 0.20 * s,
      bw * 0.72, by - bl, 0.23 * s, -bw * 0.72, by - bl, 0.23 * s,
    ]);
    bib.setAttribute('position', new BufferAttribute(vs, 3));
    bib.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    bib.setAttribute('color', new BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]), 3));
    bib.setAttribute('aFlutter', new BufferAttribute(new Float32Array([0, 0.8, 0, 0.8, 0.5, 0.8, 0.5, 0.8]), 2));
    bib.setIndex([0, 3, 2, 0, 2, 1]);
    bib.computeVertexNormals();
    PropFactory.add(b, bib, 'clothCrimson');

    PropFactory.addCollider(b, PropFactory.boxCollider(0.5 * s, h, 0.5 * s, 0, 0), 'stone');
    b.bounds = { r: 0.42 * s, h };
    return b;
  }

  /** A drift of fallen leaves — a few crumpled cards, instanced by the thousand. */
  fallenLeaves(opts = {}) {
    const n = opts.count ?? 5;
    const rnd = makeRandom(opts.seed ?? 71);
    const b = PropFactory.build();
    const geos = [];
    for (let i = 0; i < n; i++) {
      const s = 0.045 + rnd() * 0.05;
      const a = rnd() * Math.PI * 2;
      const g = new BufferGeometry();
      const cx = (rnd() - 0.5) * 0.5, cz = (rnd() - 0.5) * 0.5;
      const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
      const lift = 0.004 + rnd() * 0.01;
      const vs = new Float32Array([
        cx - ca, 0.002, cz - sa,
        cx + sa, lift, cz - ca,
        cx + ca, 0.002, cz + sa,
        cx - sa, lift * 0.6, cz + ca,
      ]);
      g.setAttribute('position', new BufferAttribute(vs, 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      const k = 0.7 + rnd() * 0.5;
      const c = new Float32Array(12);
      for (let v = 0; v < 4; v++) { c[v * 3] = k * 1.15; c[v * 3 + 1] = k * 0.72; c[v * 3 + 2] = k * 0.42; }
      g.setAttribute('color', new BufferAttribute(c, 3));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      geos.push(g);
    }
    const merged = mergeGeometries(geos.map((g) => normalizeGeo(g)), false);
    PropFactory.add(b, merged, 'dirt');
    b.bounds = { r: 0.5, h: 0.02 };
    return b;
  }

  // =====================================================================
  //  御神木  SACRED TREE
  // =====================================================================

  /**
   * A recursive branch generator. Children inherit a tapered radius, split at a
   * believable 26–48°, and are pulled toward the horizontal by their own weight,
   * which is what stops a procedural tree from looking like a firework.
   */
  sacredTree(opts = {}) {
    const height = opts.height ?? 9.5;
    const depth = clamp(opts.depth ?? 4, 2, 5);
    const rnd = makeRandom(opts.seed ?? 1861);
    const leafy = opts.leafy !== false;
    const b = PropFactory.build();
    const wood = [];
    const leaves = [];
    let tips = 0;

    const grow = (x, y, z, dx, dy, dz, len, r, level) => {
      const segs = level === 0 ? 7 : Math.max(2, 5 - level);
      const samples = [];
      let cx = x, cy = y, cz = z;
      let vx = dx, vy = dy, vz = dz;
      // A little gnarl per segment; heavier limbs sag harder.
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const rr = r * (1 - t * (0.42 + level * 0.06)) + (level === 0 ? Math.pow(1 - t, 6) * r * 0.9 : 0);
        samples.push({ x: cx, y: cy, z: cz, sx: rr * 2, sy: rr * 2, roll: t * 0.4, ao: lerp(level === 0 ? 0.45 : 0.7, 1.0, t) });
        if (i === segs) break;
        const step = len / segs;
        const wob = 0.20 / (1 + level);
        vx += (noise.noise2(cx * 1.7 + level * 4, cz * 1.7) * wob);
        vz += (noise.noise2(cz * 1.7 - level * 3, cx * 1.7) * wob);
        vy -= 0.055 * (1 + level * 0.55);            // gravity
        const l = Math.hypot(vx, vy, vz) || 1;
        vx /= l; vy /= l; vz /= l;
        cx += vx * step; cy += vy * step; cz += vz * step;
      }
      const g = sweepProfile(samples, circleProfile(level === 0 ? 10 : level === 1 ? 7 : 5), {
        smooth: true, uvScale: 1.2, capStart: false, capEnd: level >= depth - 1,
      });
      wood.push(g);

      const terminal = level >= depth - 1 || r < 0.035;

      // Blossom is carried by the whole outer branch, not just the last point of
      // it. Emitting only at terminal tips gave ~20 clumps on a 9.5 m tree, which
      // covered about 15% of the crown silhouette and read as a diseased tree
      // rather than one in bloom. Every branch from level 2 outward now flowers
      // along its length, and terminal twigs carry a cluster of clumps.
      if (leafy && level >= 1) {
        const n = terminal ? 5 : 4;
        for (let k = 0; k < n; k++) {
          const t = 0.30 + 0.70 * ((k + rnd() * 0.9) / n);
          const si = Math.min(segs, Math.max(0, Math.round(t * segs)));
          const sp = samples[si];
          const j = len * 0.16;
          this._blossomCluster(
            leaves,
            sp.x + (rnd() - 0.5) * j, sp.y + (rnd() - 0.5) * j * 0.7, sp.z + (rnd() - 0.5) * j,
            rnd,
          );
        }
      }

      if (terminal) { tips++; return; }

      const kids = level === 0 ? 3 : (rnd() < 0.32 ? 3 : 2);
      const baseA = rnd() * Math.PI * 2;
      for (let k = 0; k < kids; k++) {
        const spreadA = baseA + (k / kids) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
        const tilt = lerp(0.45, 0.85, rnd());          // 26°–48° from the parent
        const nx2 = vx + Math.cos(spreadA) * tilt;
        const ny2 = vy + 0.30 - level * 0.05;
        const nz2 = vz + Math.sin(spreadA) * tilt;
        const l = Math.hypot(nx2, ny2, nz2) || 1;
        grow(cx, cy, cz, nx2 / l, ny2 / l, nz2 / l,
          len * (0.60 + rnd() * 0.16), r * (0.56 + rnd() * 0.14), level + 1);
      }
    };

    const trunkR = height * 0.052;
    grow(0, 0, 0, (rnd() - 0.5) * 0.14, 1, (rnd() - 0.5) * 0.14, height * 0.42, trunkR, 0);

    // Root flare so the trunk grips the ground instead of stabbing it.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.3;
      const rr = trunkR * (0.30 + rnd() * 0.2);
      wood.push(sweepProfile([
        { x: Math.cos(a) * trunkR * 2.2, y: -0.06, z: Math.sin(a) * trunkR * 2.2, sx: rr * 2, sy: rr * 1.3, ao: 0.34 },
        { x: Math.cos(a) * trunkR * 1.0, y: trunkR * 1.6, z: Math.sin(a) * trunkR * 1.0, sx: rr * 2.4, sy: rr * 2, ao: 0.55 },
        { x: Math.cos(a) * trunkR * 0.4, y: trunkR * 3.4, z: Math.sin(a) * trunkR * 0.4, sx: rr * 1.6, sy: rr * 1.6, ao: 0.8 },
      ], circleProfile(6), { smooth: true, uvScale: 1.4, capStart: false, capEnd: false }));
    }

    const merged = mergeGeometries(wood.map((g) => normalizeGeo(g)), false);
    bakeAO(merged, { ground: 0.45, groundH: 1.1, cavity: 0.26, down: 0.24, floor: 0.28 });
    weatherBand(merged, 0, 2.2, 0.68, 0.84, 0.62, 0.6);       // moss up the north face
    PropFactory.add(b, merged, 'bark');
    if (leaves.length) {
      PropFactory.add(b, mergeGeometries(leaves.map((g) => normalizeGeo(g, true)), false), '__blossom');
    }
    PropFactory.addCollider(b, PropFactory.boxCollider(trunkR * 2.6, height * 0.6, trunkR * 2.6, 0, 0), 'wood');

    b.anchors.girth = [trunkR * 1.15, height * 0.22, 0];
    b.bounds = { r: height * 0.42, h: height };
    b.tips = tips;
    return b;
  }

  /**
   * One clump of blossom: a **crossed pair** of alpha-tested cards, fully tumbled
   * in yaw, pitch and roll.
   *
   * A single quad per tip reads as a card from every angle no matter how good the
   * texture is, and a set of them that all share an up vector reads as a set of
   * cards. Crossing two planes gives the clump depth from any approach, and the
   * tumble means no two clumps in the crown present the same plane to the camera.
   *
   * Clump size is the cheap half of crown coverage: it buys silhouette without
   * buying instances, so it is pushed as far as it goes before adding mass.
   */
  _blossomCluster(out, cx, cy, cz, rnd) {
    const s = 1.00 + rnd() * 0.68;
    const rot = new Matrix4()
      .makeRotationY(rnd() * Math.PI * 2)
      .multiply(new Matrix4().makeRotationX((rnd() - 0.5) * 1.25))
      .multiply(new Matrix4().makeRotationZ((rnd() - 0.5) * 1.0));
    // Blush to bone, with the variation kept inside that band — a clump is never
    // allowed to wander toward the vermilion the torii owns.
    const k = 0.90 + rnd() * 0.20;
    const bone = rnd() * 0.5;
    const cr = k, cg = k * lerp(0.99, 0.94, bone), cb = k * lerp(0.97, 0.90, bone);

    for (let q = 0; q < 3; q++) {
      const hw = s * (q === 0 ? 1.0 : q === 1 ? 0.86 : 0.78);
      const hh = s * (q === 0 ? 0.82 : q === 1 ? 0.94 : 0.78);
      const vs = q === 0
        ? new Float32Array([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0])
        : q === 1
          ? new Float32Array([0, -hh, -hw, 0, -hh, hw, 0, hh, hw, 0, hh, -hw])
          : new Float32Array([-hw, 0, -hh, hw, 0, -hh, hw, 0, hh, -hw, 0, hh]);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(vs, 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      const cc = new Float32Array(12);
      for (let v = 0; v < 4; v++) { cc[v * 3] = cr; cc[v * 3 + 1] = cg; cc[v * 3 + 2] = cb; }
      g.setAttribute('color', new BufferAttribute(cc, 3));
      // Blossom on a thin twig: whippy, and the whole clump moves as one.
      g.setAttribute('aFlutter', new BufferAttribute(new Float32Array([1, 1.3, 1, 1.3, 1, 1.3, 1, 1.3]), 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.applyMatrix4(rot);
      g.translate(cx, cy, cz);
      g.computeVertexNormals();
      out.push(g);
    }
  }

  /** Wrap a finished build as an instancing prototype. */
  proto(build, opts) { return new InstancedProto(this, build, opts); }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
    this._mats.clear();
    this._fallbackTex.clear();
  }
}

export default PropFactory;
