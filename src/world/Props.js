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
  MeshStandardMaterial, DoubleSide, InstancedMesh, Mesh, DataTexture, RGBAFormat,
  SRGBColorSpace, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter,
  InstancedBufferAttribute, Sphere,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise, makeRandom, clamp, lerp, smoothstep, worley2 } from '../core/Noise.js';

// ---------------------------------------------------------------- scratch

const _v3 = new Vector3();

/** Materials whose geometry carries the wind attribute. Kept in its own bucket. */
export const CLOTH_MATERIALS = new Set(['clothIndigo', 'clothCrimson', 'paper']);

/**
 * Wind hook. `ctx.weather?.WIND_GLSL` is expected to define
 * `vec3 kagWind(vec3 worldPos, float phase, float stiffness)`. Weather boots after
 * Level, so in practice we use this fallback and drive it from `ctx.wind`, which
 * Weather writes every frame — the gusts still propagate.
 */
export const FALLBACK_WIND_GLSL = /* glsl */`
uniform float uWindTime;
uniform vec4  uWindParams;      // xy = direction, z = strength, w = gust
vec3 kagWind(vec3 wp, float phase, float stiffness){
  float t = uWindTime;
  float amp = (uWindParams.z + uWindParams.w * 1.6) * stiffness;
  float travel = wp.x * uWindParams.x + wp.z * uWindParams.y;
  float w1 = sin(t * 2.15 - travel * 0.55 + phase);
  float w2 = sin(t * 4.30 - travel * 1.30 + phase * 1.73);
  float w3 = sin(t * 8.10 + phase * 3.11);
  float f  = w1 * 0.58 + w2 * 0.29 + w3 * 0.13;
  vec3 d = vec3(uWindParams.x, 0.0, uWindParams.y);
  vec3 side = vec3(-uWindParams.y, 0.0, uWindParams.x);
  return d * (amp * (f * 0.55 + 0.45)) + side * (amp * f * 0.42) + vec3(0.0, amp * 0.16 * f, 0.0);
}
`;

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

/** Add the wind attribute. `stiffFn` returns 0 at the anchor, ~1 at the free edge. */
export function bakeFlutter(geo, phase, stiffFn) {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    arr[i * 2] = clamp(stiffFn(pos.getX(i), pos.getY(i), pos.getZ(i)), 0, 4);
    arr[i * 2 + 1] = phase;
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

/** Tiny procedural grain so a missing library material is never a flat colour. */
function grainTexture(hex, seed) {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  const base = new Color(hex);
  const rnd = makeRandom(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise.warp2((x / S) * 4 + seed * 0.11, (y / S) * 4 - seed * 0.07, 0.7, 4);
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
      const mat = part.material === '__ember' ? this.factory.emberMaterial
        : part.material === '__water' ? this.factory.waterMaterial
          : this.factory.material(part.material);
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
    this.windUniforms = {
      uWindTime: { value: 0 },
      uWindParams: { value: [0.82, 0.57, 0.45, 0] },
    };
    this.windGLSL = FALLBACK_WIND_GLSL;
    this.disposables = [];
  }

  async init() {
    const w = this.ctx?.weather?.WIND_GLSL;
    if (typeof w === 'string' && w.indexOf('kagWind') >= 0) this.windGLSL = w;
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
  material(name, repeat = 1) {
    const key = `${name}@${repeat}`;
    const cached = this._mats.get(key);
    if (cached) return cached;

    const lib = this.ctx?.materials;
    let src = null;
    try {
      src = lib?.getTextured?.(name, repeat) ?? lib?.get?.(name) ?? null;
    } catch { src = null; }

    let mat;
    if (src && src.isMaterial) {
      mat = src.clone();
      if (Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile')) mat.onBeforeCompile = src.onBeforeCompile;
      if (Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey')) mat.customProgramCacheKey = src.customProgramCacheKey;
      mat.userData = Object.assign({}, mat.userData);
      delete mat.userData.kagFog;
    } else {
      const [hex, rough, metal] = FALLBACK[name] || [0x9a8f80, 0.85, 0.0];
      let map = this._fallbackTex.get(name);
      if (!map) {
        map = grainTexture(hex, name.length * 37 + 11);
        this._fallbackTex.set(name, map);
        this.disposables.push(map);
      }
      map.repeat.set(repeat, repeat);
      mat = new MeshStandardMaterial({ color: 0xffffff, map, roughness: rough, metalness: metal });
    }

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

  /** Emissive material for lantern fireboxes / chōchin; one instance, animated. */
  get emberMaterial() {
    if (this._ember) return this._ember;
    const m = new MeshStandardMaterial({
      color: 0x2a1a10, emissive: new Color(0xff9040), emissiveIntensity: 2.4,
      roughness: 0.9, metalness: 0, vertexColors: true,
    });
    m.name = 'prop:ember';
    this.ctx?.sky?.applyFog?.(m);
    this._ember = m;
    this.disposables.push(m);
    return m;
  }

  /** Thin running water for the chōzuya spout. */
  get waterMaterial() {
    if (this._water) return this._water;
    const m = new MeshStandardMaterial({
      color: 0xbfd8dd, roughness: 0.08, metalness: 0.0,
      transparent: true, opacity: 0.55, vertexColors: true, depthWrite: false,
    });
    m.name = 'prop:water';
    const u = this.windUniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = u.uWindTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          transformed.x += sin(uWindTime * 9.0 + transformed.y * 22.0) * 0.012;
          transformed.z += cos(uWindTime * 11.0 + transformed.y * 19.0) * 0.012;
        `);
    };
    m.customProgramCacheKey = () => 'kagWater1';
    this.ctx?.sky?.applyFog?.(m);
    this._water = m;
    this.disposables.push(m);
    return m;
  }

  _installWind(mat) {
    const u = this.windUniforms;
    const glsl = this.windGLSL;
    const prev = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(mat, shader, renderer);
      shader.uniforms.uWindTime = u.uWindTime;
      shader.uniforms.uWindParams = u.uWindParams;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFlutter;\n' + glsl)
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          {
            #ifdef USE_INSTANCING
              vec3 kagWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            #else
              vec3 kagWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            #endif
            transformed += kagWind(kagWp, aFlutter.y, aFlutter.x);
          }
        `);
    };
    mat.customProgramCacheKey = () => 'kagWind1';
  }

  /** Feed `ctx.wind` into the cloth shaders. Called once per frame by Level. */
  updateWind(elapsed, wind) {
    this.windUniforms.uWindTime.value = elapsed;
    const p = this.windUniforms.uWindParams.value;
    if (wind) {
      p[0] = wind.direction?.x ?? 0.82;
      p[1] = wind.direction?.z ?? 0.57;
      p[2] = wind.strength ?? 0.45;
      p[3] = wind.gust ?? 0;
    }
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

      const plaqueH = (y1 - y0) * 0.62;
      const plaque = new BoxGeometry(0.46 * s, plaqueH, 0.07 * s);
      plaque.translate(0, (y0 + y1) * 0.5, 0.15 * s);
      normalizeGeo(plaque);
      bakeAO(plaque, { ground: 0, cavity: 0.25, down: 0.3, floor: 0.42 });
      tintGeo(plaque, 0.92, 0.86, 0.72);
      PropFactory.add(b, plaque, 'gold');
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
      bakeFlutter(g, i * 2.13 + rnd() * 3, (px, py) => clamp((y - py) / 0.45, 0, 1) * 0.55);
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
    const fbY = saoTop + 0.26 * s;
    const fbH = 0.44 * s;
    const fbR = 0.235 * s;
    const panelW = fbR * 1.02;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      let panel;
      if (i === 0) {
        panel = panelWithHole(panelW, fbH * 0.86, 0.035 * s, circleProfile(12).map((p) => [p[0] * fbH * 0.46, p[1] * fbH * 0.46]));
      } else if (i === 3) {
        // Crescent: a circle with a shallow bite, kept star-shaped so the
        // outward projection in panelWithHole stays well defined.
        const pts = [];
        for (let k = 0; k < 14; k++) {
          const th = (k / 14) * Math.PI * 2;
          const r = fbH * (0.24 - 0.11 * Math.max(0, Math.cos(th)));
          pts.push([Math.cos(th) * r, Math.sin(th) * r]);
        }
        panel = panelWithHole(panelW, fbH * 0.86, 0.035 * s, pts);
      } else if (i === 1 || i === 4) {
        const w2 = panelW * 0.30, h2 = fbH * 0.28;
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

    // 宝珠 hōju — the jewel finial.
    const jewel = sweepProfile([
      { x: 0, y: kasaY + 0.30 * s, z: 0, sx: 0.13 * s, sy: 0.13 * s, ao: 0.7 },
      { x: 0, y: kasaY + 0.36 * s, z: 0, sx: 0.17 * s, sy: 0.17 * s, ao: 0.9 },
      { x: 0, y: kasaY + 0.46 * s, z: 0, sx: 0.13 * s, sy: 0.13 * s, ao: 1.0 },
      { x: 0, y: kasaY + 0.53 * s, z: 0, sx: 0.045 * s, sy: 0.045 * s, ao: 1.0 },
    ], circleProfile(8), { smooth: true, uvScale: 1.6, capStart: false });
    push(jewel);

    let merged = stone.length === 1 ? stone[0] : mergeGeometries(stone.map((g) => normalizeGeo(g)), false);
    roughen(merged, 0.006 * s, 6.5);
    bakeAO(merged, { ground: 0.5, groundH: 0.4 * s, cavity: 0.3, down: 0.34, floor: 0.3 });
    weatherBand(merged, 0, 0.5 * s, 0.72, 0.82, 0.66, 0.3);   // moss creeping up the base
    PropFactory.add(b, merged, 'stone');

    // The flame itself: a small emissive core that reads through the cutouts.
    const flame = new BoxGeometry(fbR * 0.9, fbH * 0.5, fbR * 0.9);
    flame.translate(0, fbY + fbH * 0.44, 0);
    normalizeGeo(flame);
    PropFactory.add(b, flame, '__ember');

    PropFactory.addCollider(b, PropFactory.boxCollider(0.7 * s, kasaY, 0.7 * s, 0, 0, 0), 'stone', true, false);
    b.lights.push({
      x: 0, y: fbY + fbH * 0.5, z: 0,
      color: 0xffa martial => 0, intensity: 2.6 * s, distance: 6.5 * s, flicker: 1,
    });
    b.anchors.fire = [0, fbY + fbH * 0.5, 0];
    b.bounds = { r: 0.62 * s, h: kasaY + 0.55 * s };
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
