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
  MeshStandardMaterial, DoubleSide, InstancedMesh, DataTexture, RGBAFormat,
  SRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter,
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
export const CLOTH_MATERIALS = new Set(['clothIndigo', 'clothCrimson', 'paper', '__lanternPaper']);

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
  /** Flame inside a hibukuro / chōchin. Rec709 luma ≈ 4.4 linear. */
  flame: { color: 0xffd9a8, intensity: 6.0 },
  /** Lit paper seen from outside. Rec709 luma ≈ 1.93 linear → ~248/255. */
  paper: { color: 0xffc07a, intensity: 3.2 },
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

/** Five-sided kasagi/beam section: flat soffit, sloped shoulders, ridged top. */
export function kasagiProfile() {
  return [
    [-0.50, -0.50], [0.50, -0.50],
    [0.50, 0.16], [0.30, 0.40], [0.00, 0.50], [-0.30, 0.40], [-0.50, 0.16],
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
    for (const part of this.build.parts) {
      const mat = this.factory.specialMaterial(part.material);
      const mesh = new InstancedMesh(part.geometry, mat, n);
      mesh.name = `${this.name}:${part.material}`;
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
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
      case '__wetStone': return this.wetStoneMaterial;
      case '__groundStone': return this.groundMaterial;
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
    this.ctx?.sky?.applyFog?.(mat);
    mat.needsUpdate = true;
    this._mats.set(key, mat);
    this.disposables.push(mat);
    return mat;
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
   * paper albedo so it still has grain, plus an emissive that puts it just past
   * the 2.2-linear mark where the grade reaches 250.
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
      transparent: true, opacity: 0.85, depthWrite: false,
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
    m.envMapIntensity = 2.4;
    m.vertexColors = true;
    m.name = 'prop:goldPolished';
    this.ctx?.sky?.applyFog?.(m);
    this._goldPol = m;
    this.disposables.push(m);
    return m;
  }

  /** Wet stone — the chōzuya basin and the splash apron around it. */
  get wetStoneMaterial() {
    if (this._wetStone) return this._wetStone;
    const m = this._libMaterial('stone', 1.6) || new MeshStandardMaterial({ color: 0x8b8778 });
    m.roughness = 0.17;
    m.metalness = 0.03;
    m.envMapIntensity = 1.9;
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
      envMapIntensity: 2.6,
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
        `)
        .replace('#include <map_fragment>', /* glsl */`
        #ifdef USE_MAP
          {
            vec2 P = vKagGroundW.xz;
            // (1) domain warp: long wavelength decorrelates, short bends the seam
            vec2 wLo = vec2(fbm2(P * 0.0730 + 12.7, 2), fbm2(P * 0.0730 - 5.1, 2));
            vec2 wHi = vec2(fbm2(P * 0.3300 + 41.3, 1), fbm2(P * 0.3300 - 9.6, 1));
            vec2 q = P + wLo * 1.25 + wHi * 0.28;
            // (2) irrational rotation — 0.3746/0.9272 is Terrain's gravel angle
            vec2 uvA = kagRot(q, vec2(0.3746, 0.9272)) * 0.62;
            // (3) second lookup at 0.617x under a low-frequency mask
            vec2 uvB = kagRot(q + vec2(37.13, -18.77), vec2(0.7071, 0.7071)) * (0.62 * 0.617);
            float gn = fbm2(P * 0.058 + 27.5, 2);
            vec4 texA = texture2D(map, uvA);
            vec4 texB = texture2D(map, uvB);
            vec4 sampledDiffuseColor = mix(texA, texB, smoothstep(-0.24, 0.24, gn));
            #ifdef DECODE_VIDEO_TEXTURE
              sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
            #endif
            diffuseColor *= sampledDiffuseColor;

            // Terrain's weathering mask: grime in the hollows, scrubbed out of the
            // traffic band down the middle of the sandō.
            float wear = 1.0 - smoothstep(1.6, 4.4, abs(P.x));
            float weather = clamp((gn * 0.5 + 0.5) * 0.8 - wear * 0.75, 0.0, 1.0);
            diffuseColor.rgb *= mix(1.0, 0.76, weather * 0.65);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.12, 1.06), wear * 0.75);
          }
        #endif
        `);
    };
    m.customProgramCacheKey = () => 'kagGround1';
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

    const pillarProfile = circleProfile(12);
    const SEG = 9;

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
      PropFactory.add(b, pillar, 'vermilion');

      // Bare cedar showing through where the lacquer has gone at the foot.
      this._lacquerChips(b, x0, 0, rBase, 0.95 * s, 7, rnd, s);

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
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const x = lerp(-half, half, t);
        const taper = 1 - Math.pow(Math.abs(t * 2 - 1), 6) * 0.22;
        samples.push({ x, y: nukiY, z: 0, sx: nukiD * taper, sy: nukiH * taper, ao: 0.92 });
      }
      const nuki = sweepProfile(samples, rectProfile(0.16), { ref: [0, 0, -1], uvScale: 1.0 });
      bakeAO(nuki, { ground: 0, cavity: 0.22, down: 0.34, floor: 0.4 });
      PropFactory.add(b, nuki, 'vermilion');
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

    const shimaki = curved(shimakiL, shimakiH, shimakiD, h + shimakiH * 0.5, sori * 0.55, flick * 0.5, rectProfile(0.10), 0.88);
    bakeAO(shimaki, { ground: 0, cavity: 0.2, down: 0.42, floor: 0.36 });
    PropFactory.add(b, shimaki, 'vermilion');

    const kasagiY = h + shimakiH + kasagiH * 0.5;
    const kasagi = curved(kasagiL, kasagiH, kasagiD, kasagiY, sori, flick, kasagiProfile(), 1.0);
    bakeAO(kasagi, { ground: 0, cavity: 0.16, down: 0.4, floor: 0.38 });
    PropFactory.add(b, kasagi, 'vermilion');

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

  /** Flakes of bare cedar where the vermilion has come off the foot of a post. */
  _lacquerChips(build, cx, cz, radius, maxY, count, rnd, s) {
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const y = Math.pow(rnd(), 1.9) * maxY;
      const w = (0.05 + rnd() * 0.11) * s;
      const hh = (0.05 + rnd() * 0.16) * s;
      const g = new BoxGeometry(w, hh, 0.014 * s);
      const m = new Matrix4().makeRotationY(-a);
      m.setPosition(cx + Math.sin(a) * (radius * 0.995), y + hh * 0.5, cz + Math.cos(a) * (radius * 0.995));
      g.applyMatrix4(m);
      normalizeGeo(g);
      tintGeo(g, 0.9 + rnd() * 0.2, 0.86 + rnd() * 0.16, 0.8 + rnd() * 0.14);
      shadeGeo(g, (x, yy) => lerp(0.55, 1.0, clamp(yy / (maxY + 0.2), 0, 1)));
      PropFactory.add(build, g, 'cedar');
    }
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

    const N = 26;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = t * 2 - 1;
      // cosh-ish belly; the ends are pulled up hard so it looks tied, not draped.
      const y = -sag * (1 - u * u) * (1 - 0.22 * u * u);
      const r = lerp(rEnd, rMid, Math.pow(1 - Math.abs(u), 0.55));
      samples.push({
        x: u * span * 0.5,
        y,
        z: noise.noise2(t * 4.1, 0.3) * 0.012,
        sx: r * 2, sy: r * 2,
        roll: t * Math.PI * 2.4,             // the twist of the plait
        ao: lerp(0.78, 1.0, 1 - Math.abs(u) * 0.5),
      });
    }
    const rope = sweepProfile(samples, ropeProfile(14, 3, 0.17), { smooth: true, uvScale: 1.6, ref: [0, 0, -1] });
    bakeAO(rope, { ground: 0, cavity: 0.34, down: 0.3, floor: 0.34 });
    PropFactory.add(b, rope, 'rope');

    // 紙垂 shide — folded paper zigzags, and the straw tassels between them.
    for (let i = 0; i < shideCount; i++) {
      const t = (i + 0.5) / shideCount;
      const u = t * 2 - 1;
      const x = u * span * 0.42;
      const y = -sag * (1 - u * u) * (1 - 0.22 * u * u) - rMid * 0.8;
      const g = this._shide(0.13 + rnd() * 0.03, 0.40 + rnd() * 0.14, rnd);
      g.translate(x, y, 0.02);
      // Paper shide: limp, hanging free below the rope.
      bakeFlutter(g, 0.55, (px, py) => clamp((y - py) / 0.45, 0, 1));
      PropFactory.add(b, g, 'paper');

      if (i < shideCount - 1) {
        const tx = lerp(u, ((i + 1.5) / shideCount) * 2 - 1, 0.5) * span * 0.42;
        const ty = -sag * (1 - (tx / (span * 0.5)) ** 2) - rMid * 0.7;
        const tas = sweepProfile([
          { x: tx, y: ty, z: 0, sx: 0.075, sy: 0.075, ao: 0.6 },
          { x: tx + (rnd() - 0.5) * 0.03, y: ty - 0.20 - rnd() * 0.1, z: 0, sx: 0.03, sy: 0.03, ao: 0.95 },
        ], circleProfile(6), { smooth: true, uvScale: 2 });
        PropFactory.add(b, tas, 'rope');
      }
    }

    b.bounds = { r: span * 0.5, h: sag + 0.6 };
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
   * Six parts stacked the way a real one is dry-stacked: kiso, sao, chūdai,
   * hibukuro (fire box, pierced with a full moon and a crescent), kasa with
   * upturned warabi-te corners, and the hōju jewel. The fire box gets an emissive
   * core and, when the lighting system will take it, a real flickering point light.
   */
  stoneLantern(opts = {}) {
    const H = opts.height ?? 2.05;
    const s = H / 2.05;
    const rnd = makeRandom(opts.seed ?? 91);
    const b = PropFactory.build();
    const hex = hexProfile();

    const stone = [];
    const push = (g) => stone.push(g);

    // 基礎 kiso — a squat hexagonal footing, half-sunk and lipped.
    push(sweepProfile([
      { x: 0, y: -0.10 * s, z: 0, sx: 0.62 * s, sy: 0.62 * s, ao: 0.42 },
      { x: 0, y: 0.16 * s, z: 0, sx: 0.60 * s, sy: 0.60 * s, ao: 0.6 },
      { x: 0, y: 0.24 * s, z: 0, sx: 0.50 * s, sy: 0.50 * s, ao: 0.78 },
      { x: 0, y: 0.30 * s, z: 0, sx: 0.40 * s, sy: 0.40 * s, ao: 0.85 },
    ], hex, { uvScale: 1.1, capStart: false }));

    // 竿 sao — the shaft, with two swollen nodes.
    const saoTop = 1.06 * s;
    const saoSamples = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = lerp(0.28 * s, saoTop, t);
      const node = Math.exp(-Math.pow((t - 0.34) * 7, 2)) + Math.exp(-Math.pow((t - 0.74) * 7, 2));
      const r = (0.145 - t * 0.016 + node * 0.038) * s;
      saoSamples.push({ x: 0, y, z: 0, sx: r * 2, sy: r * 2, ao: lerp(0.7, 1.0, t) });
    }
    push(sweepProfile(saoSamples, circleProfile(10), { smooth: true, uvScale: 1.4 }));

    // 中台 chūdai — the flared platform the fire box sits on.
    push(sweepProfile([
      { x: 0, y: saoTop - 0.01 * s, z: 0, sx: 0.30 * s, sy: 0.30 * s, ao: 0.55 },
      { x: 0, y: saoTop + 0.10 * s, z: 0, sx: 0.52 * s, sy: 0.52 * s, ao: 0.78 },
      { x: 0, y: saoTop + 0.20 * s, z: 0, sx: 0.55 * s, sy: 0.55 * s, ao: 0.92 },
      { x: 0, y: saoTop + 0.26 * s, z: 0, sx: 0.47 * s, sy: 0.47 * s, ao: 0.85 },
    ], hex, { uvScale: 1.1, capStart: false, capEnd: false }));

    // 火袋 hibukuro — six panels: moon, crescent, two windows, two solid.
    // The apertures are cut generously: at magic hour this is the brightest thing
    // in the frame and a coin-sized hole at 8 m is a sub-pixel highlight, which is
    // to say no highlight at all.
    const fbY = saoTop + 0.26 * s;
    const fbH = 0.44 * s;
    const fbR = 0.235 * s;
    const panelW = fbR * 1.02;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      let panel;
      if (i === 0) {
        panel = panelWithHole(panelW, fbH * 0.86, 0.035 * s, circleProfile(12).map((p) => [p[0] * fbH * 0.62, p[1] * fbH * 0.62]));
      } else if (i === 3) {
        // Crescent: a circle with a shallow bite, kept star-shaped so the
        // outward projection in panelWithHole stays well defined.
        const pts = [];
        for (let k = 0; k < 14; k++) {
          const th = (k / 14) * Math.PI * 2;
          const r = fbH * (0.33 - 0.13 * Math.max(0, Math.cos(th)));
          pts.push([Math.cos(th) * r, Math.sin(th) * r]);
        }
        panel = panelWithHole(panelW, fbH * 0.86, 0.035 * s, pts);
      } else if (i === 1 || i === 4) {
        const w2 = panelW * 0.38, h2 = fbH * 0.34;
        panel = panelWithHole(panelW, fbH * 0.86, 0.035 * s,
          [[-w2, -h2], [w2, -h2], [w2, h2], [-w2, h2]]);
      } else {
        panel = new BoxGeometry(panelW, fbH * 0.86, 0.035 * s);
        normalizeGeo(panel);
      }
      const m = new Matrix4().makeRotationY(a);
      m.setPosition(Math.sin(a) * fbR, fbY + fbH * 0.5, Math.cos(a) * fbR);
      panel.applyMatrix4(m);
      normalizeGeo(panel);
      push(panel);
      // Corner posts between panels so the box does not read as a paper drum.
      const ap = a + Math.PI / 6;
      const post = new BoxGeometry(0.05 * s, fbH, 0.05 * s);
      post.translate(Math.sin(ap) * fbR * 1.03, fbY + fbH * 0.5, Math.cos(ap) * fbR * 1.03);
      normalizeGeo(post);
      push(post);
    }

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
          const a0 = ((e + f) / SEG) * Math.PI * 2 + Math.PI / 6;
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
    const kasa = loftRings(kasaRings, { uvScale: 1.2 });
    push(kasa);
    // Underside so the deep eave is not a one-sided sheet.
    const under = loftRings(kasaRings.map((r, i) => ({
      pts: r.pts.map((p) => [p[0] * 0.985, p[1] - 0.055 * s, p[2] * 0.985]),
      pao: r.pao.map((v) => v * 0.5),
    })), { flip: true, uvScale: 1.2 });
    push(under);

    let merged = stone.length === 1 ? stone[0] : mergeGeometries(stone.map((g) => normalizeGeo(g)), false);
    roughen(merged, 0.006 * s, 6.5);
    bakeAO(merged, { ground: 0.5, groundH: 0.4 * s, cavity: 0.3, down: 0.34, floor: 0.3 });
    weatherBand(merged, 0, 0.5 * s, 0.72, 0.82, 0.66, 0.3);   // moss creeping up the base
    PropFactory.add(b, merged, 'stone');

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
    const liner = sweepProfile([
      { x: 0, y: fbY + 0.012 * s, z: 0, sx: fbR * 1.86, sy: fbR * 1.86, ao: 1 },
      { x: 0, y: fbY + fbH - 0.012 * s, z: 0, sx: fbR * 1.86, sy: fbR * 1.86, ao: 1 },
    ], hex, { uvScale: 1.4, capStart: false, capEnd: false });
    bakeFlutter(liner, 4, () => 0);              // rigid: it is glued to the stone
    PropFactory.add(b, liner, '__lanternPaper');

    // The flame core, sitting behind the liner so the apertures read hottest.
    const flame = sweepProfile([
      { x: 0, y: fbY + fbH * 0.18, z: 0, sx: fbR * 1.15, sy: fbR * 1.15, ao: 1 },
      { x: 0, y: fbY + fbH * 0.72, z: 0, sx: fbR * 1.30, sy: fbR * 1.30, ao: 1 },
      { x: 0, y: fbY + fbH * 0.92, z: 0, sx: fbR * 0.55, sy: fbR * 0.55, ao: 1 },
    ], circleProfile(8), { smooth: true, uvScale: 1, capStart: false });
    PropFactory.add(b, flame, '__ember');

    // The spill on the flagstone. Radially faded in vertex colour so it lands as a
    // pool rather than a disc with an edge. Level sinks a lantern 4 cm to bed the
    // kiso into the ground, so the disc has to clear that or it lands underneath
    // the terrain it is supposed to be lighting.
    const poolR = 1.15 * s;
    PropFactory.add(b, this._spillDisc(poolR, 0.075 * s), '__glowPool');

    PropFactory.addCollider(b, PropFactory.boxCollider(0.7 * s, kasaY, 0.7 * s, 0, 0, 0), 'stone', true, false);
    b.lights.push({
      x: 0, y: fbY + fbH * 0.5, z: 0,
      color: 0xffa050, intensity: 2.6 * s, distance: 6.5 * s, flicker: 1,
    });
    b.anchors.fire = [0, fbY + fbH * 0.5, 0];
    b.bounds = { r: Math.max(0.62 * s, poolR), h: kasaY + 0.55 * s };
    return b;
  }

  /**
   * A ground-hugging disc with a vertex-colour gradient from centre to rim. Used
   * for baked light spill (centre 1 → rim 0, so the emissive dies out) and for wet
   * ground (centre dark → rim 1, so the damp patch dries off at its edge).
   */
  _spillDisc(radius, y, segments = 14, centre = 1, rim = 0) {
    const verts = [0, y, 0];
    const uvs = [0.5, 0.5];
    const cols = [centre, centre, centre];
    const idx = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wob = 0.86 + 0.14 * noise.noise2(Math.cos(a) * 2.3, Math.sin(a) * 2.3);
      verts.push(Math.cos(a) * radius * wob, y, Math.sin(a) * radius * wob);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      cols.push(rim, rim, rim);
      if (i > 0) idx.push(0, i, i + 1);
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
    const NX = 5, NY = 8;
    const verts = [], uvs = [], cols = [], idx = [], fl = [];
    const y0 = poleH - 0.10, y1 = y0 - bh;
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NY;
        const x = lerp(0.07, bw + 0.07, u);
        const y = lerp(y0, y1, v);
        verts.push(x, y, Math.sin(u * 3.1) * 0.012);
        uvs.push(u, v);
        const k = lerp(0.82, 1.0, 1 - v * 0.4);
        cols.push(k, k, k);
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
    const RN = 9;
    for (let i = 0; i <= RN; i++) {
      const t = i / RN;
      const bulge = Math.sin(t * Math.PI);
      const rr = lerp(r * 0.42, r, bulge) + Math.sin(t * Math.PI * RN) * 0.006;
      samples.push({ x: 0, y: -cord - t * h, z: 0, sx: rr * 2, sy: rr * 2, ao: lerp(1.05, 0.8, t) });
    }
    // Lit paper, not paper. A row of these under a dark eave is the single most
    // characteristic highlight in this setting and the whole surface has to carry
    // it — the AO stays in the vertex colour so the ribs still read.
    const body = sweepProfile(samples, circleProfile(12), { smooth: true, uvScale: 1.4, capStart: false, capEnd: false });
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

      if (level >= depth - 1 || r < 0.035) {
        tips++;
        if (leafy && level >= 2) {
          const s = 0.55 + rnd() * 0.5;
          const cluster = new BufferGeometry();
          const vs = new Float32Array(12);
          const a = rnd() * Math.PI * 2;
          const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
          vs.set([
            cx - ca, cy - s * 0.35, cz - sa,
            cx + ca, cy - s * 0.35, cz + sa,
            cx + ca, cy + s * 0.45, cz + sa,
            cx - ca, cy + s * 0.45, cz - sa,
          ]);
          cluster.setAttribute('position', new BufferAttribute(vs, 3));
          cluster.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
          const k = 0.8 + rnd() * 0.45;
          const cc = new Float32Array(12);
          for (let v = 0; v < 4; v++) { cc[v * 3] = k * 1.25; cc[v * 3 + 1] = k * 0.66; cc[v * 3 + 2] = k * 0.34; }
          cluster.setAttribute('color', new BufferAttribute(cc, 3));
          cluster.setAttribute('aFlutter', new BufferAttribute(new Float32Array([0.5, 1.4, 0.5, 1.4, 1, 1.4, 1, 1.4]), 2));
          cluster.setIndex([0, 1, 2, 0, 2, 3]);
          cluster.computeVertexNormals();
          leaves.push(cluster);
        }
        return;
      }

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
      PropFactory.add(b, mergeGeometries(leaves.map((g) => normalizeGeo(g, true)), false), 'clothCrimson');
    }
    PropFactory.addCollider(b, PropFactory.boxCollider(trunkR * 2.6, height * 0.6, trunkR * 2.6, 0, 0), 'wood');

    b.anchors.girth = [trunkR * 1.15, height * 0.22, 0];
    b.bounds = { r: height * 0.42, h: height };
    b.tips = tips;
    return b;
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
