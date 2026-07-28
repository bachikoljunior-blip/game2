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
