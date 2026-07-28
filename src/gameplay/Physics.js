/**
 * Physics.js — the hand-written physics layer for KAGEROU.
 *
 * No external physics engine: a samurai game needs exactly four things from
 * physics — a capsule character controller that never pops, fast raycasts for
 * foot IK and combat, a handful of knock-around props, and ragdolls. A general
 * solver would cost 300 kB and 3 ms/frame to give us all the things we do not
 * need, so everything here is purpose-built, scalar-math, and allocation-free
 * once warm.
 *
 * Layout of this file:
 *   1. constants, layers, module-scope scratch
 *   2. scalar geometry kernels (closest-point / ray tests)
 *   3. triangle BVH
 *   4. uniform spatial hash broadphase
 *   5. PhysicsWorld — colliders, queries, characters, bodies, ragdolls, debug
 *
 * Determinism: the dynamic simulation runs on a fixed 60 Hz accumulator and the
 * visual layer reads `world.alpha` to interpolate. The character controller
 * substeps internally so a 30 fps phone and a 120 Hz desktop resolve the same
 * geometry.
 */

import {
  Vector3, Quaternion, Matrix4, BufferGeometry, BufferAttribute,
  LineSegments, LineBasicMaterial,
} from 'three';

// ============================================================ 1. constants

/** Collision layer bitflags. Everything that filters uses these. */
export const LAYER = {
  WORLD: 1,
  CHARACTER: 2,
  PLAYER: 4,
  ENEMY: 8,
  PROP: 16,
  WATER: 32,
  TRIGGER: 64,
};

/** Every layer at once — the default mask for queries that do not care. */
export const LAYER_ALL = 127;

/** Everything solid a character is expected to stand on or bump into. */
export const LAYER_SOLID = LAYER.WORLD | LAYER.PROP;

export const GRAVITY = -22;
export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 4;
export const TERMINAL_VELOCITY = -58;
export const COYOTE_TIME = 0.12;
export const DEFAULT_STEP_HEIGHT = 0.42;
export const DEFAULT_SLOPE_LIMIT = 50;

const BLOCK_EPS = 0.003;       // closer than this counts as a blocking contact
const PUSH_OUT = 0.002;        // gap left behind after depenetration
const SLIDE_ITERATIONS = 4;    // classic collide-and-slide budget
const CELL_SIZE = 4;           // broadphase cell, metres
const LEAF_TRIS = 12;          // BVH leaf size
const SURFACES = ['stone', 'wood', 'grass', 'water', 'gravel'];

// ------------------------------------------------------ module scratch pools
//
// Nothing below is ever reallocated. Each scratch has a single owner comment so
// two functions never fight over the same slot.

const _v0 = new Vector3(), _v1 = new Vector3(), _v2 = new Vector3();
const _v3 = new Vector3(), _v4 = new Vector3(), _v5 = new Vector3();
const _q0 = new Quaternion(), _q1 = new Quaternion(), _q2 = new Quaternion();
const _q3 = new Quaternion(), _q4 = new Quaternion();
const _m0 = new Matrix4();

/** Closest-query result records (scalar, so they can never alias a Vector3). */
function makeHit() {
  return {
    d: 0, nx: 0, ny: 1, nz: 0, px: 0, py: 0, pz: 0, c: null, t: 0, inside: false,
    x: 0, y: 0, z: 0, hit: false, steep: false, collider: null,
  };
}
const _hA = makeHit();   // per-collider narrowphase scratch
const _hB = makeHit();   // best-so-far accumulator
const _hC = makeHit();   // nested (triangle inside mesh loop)
const _hD = makeHit();   // sweep / depenetration
const _hE = makeHit();   // ground probe
const _hF = makeHit();   // rigid body contact probe

/** Point-on-segment / point-on-shape scratch. */
const _p0 = { x: 0, y: 0, z: 0, t: 0 };
const _p1 = { x: 0, y: 0, z: 0, t: 0 };
const _p2 = { x: 0, y: 0, z: 0, t: 0, inside: false, nx: 0, ny: 0, nz: 0, depth: 0 };
const _p3 = { x: 0, y: 0, z: 0, t: 0, inside: false, nx: 0, ny: 0, nz: 0, depth: 0 };
const _ss = { s: 0, t: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
const _clip = { x: 0, y: 0, z: 0 };

/** Sweep / slide / depenetration results (scalar, never aliased). */
const _slideA = makeHit();    // primary collide-and-slide
const _slideB = makeHit();    // step-up trial slide
const _dep = makeHit();       // depenetration
const _swA = makeHit();       // step-up sub-sweeps

let _idCounter = 1;

// ------------------------------------------------------------ ragdoll rig spec
//
// The rig is authored by anim/Rig.js, which we do not own, so bone lookup goes
// through an alias table: whatever naming scheme lands (mixamo, UE, or our own)
// resolves to the same joint set. A rig that matches fewer than five joints is
// rejected rather than producing a mangled ragdoll.

const BONE_ALIASES = {
  hips: ['hips', 'hip', 'pelvis', 'root', 'spine00', 'bip01pelvis'],
  spine: ['spine', 'spine1', 'spine01', 'abdomen', 'waist', 'lowerspine'],
  chest: ['chest', 'spine2', 'spine02', 'upperchest', 'torso', 'ribcage', 'upperbody'],
  neck: ['neck', 'neck1', 'neck01'],
  head: ['head', 'skull'],
  upperArmL: ['upperarml', 'leftarm', 'leftupperarm', 'armleft', 'upperarmleft', 'lupperarm', 'larm'],
  lowerArmL: ['lowerarml', 'leftforearm', 'forearml', 'leftlowerarm', 'forearmleft', 'lforearm'],
  handL: ['handl', 'lefthand', 'handleft', 'lhand'],
  upperArmR: ['upperarmr', 'rightarm', 'rightupperarm', 'armright', 'upperarmright', 'rupperarm', 'rarm'],
  lowerArmR: ['lowerarmr', 'rightforearm', 'forearmr', 'rightlowerarm', 'forearmright', 'rforearm'],
  handR: ['handr', 'righthand', 'handright', 'rhand'],
  upperLegL: ['upperlegl', 'leftupleg', 'thighl', 'leftthigh', 'upperlegleft', 'uplegl', 'lthigh'],
  lowerLegL: ['lowerlegl', 'leftleg', 'calfl', 'shinl', 'leftcalf', 'lowerlegleft', 'lcalf', 'legl'],
  footL: ['footl', 'leftfoot', 'footleft', 'lfoot', 'anklel', 'leftankle'],
  upperLegR: ['upperlegr', 'rightupleg', 'thighr', 'rightthigh', 'upperlegright', 'uplegr', 'rthigh'],
  lowerLegR: ['lowerlegr', 'rightleg', 'calfr', 'shinr', 'rightcalf', 'lowerlegright', 'rcalf', 'legr'],
  footR: ['footr', 'rightfoot', 'footright', 'rfoot', 'ankler', 'rightankle'],
};

/**
 * Joint graph. `p` is the parent joint; the link p→j is the capsule and it
 * drives the bone named `p`. `cone` is the maximum deviation from straight at
 * the parent joint, `bend` the minimum. Virtual tips give the leaf bones
 * (head, hands, feet) something to point at.
 */
const RAG_BONES = [
  { j: 'hips', p: null, r: 0.15, m: 11 },
  { j: 'spine', p: 'hips', r: 0.14, m: 8, cone: 30, bend: 0, twist: 30 },
  { j: 'chest', p: 'spine', r: 0.15, m: 9, cone: 26, bend: 0, twist: 30 },
  { j: 'neck', p: 'chest', r: 0.08, m: 2, cone: 34, bend: 0, twist: 45 },
  { j: 'head', p: 'neck', r: 0.11, m: 4, cone: 40, bend: 0, twist: 50 },
  { j: 'headTip', p: 'head', r: 0.10, m: 2, cone: 22, bend: 0, twist: 20, tip: ['neck', 'head', 0.9] },

  { j: 'upperArmL', p: 'chest', r: 0.07, m: 3, cone: 88, bend: 0, twist: 70 },
  { j: 'lowerArmL', p: 'upperArmL', r: 0.06, m: 2, cone: 100, bend: 6, twist: 20 },
  { j: 'handL', p: 'lowerArmL', r: 0.05, m: 1, cone: 55, bend: 0, twist: 40 },
  { j: 'handTipL', p: 'handL', r: 0.05, m: 0.6, cone: 40, bend: 0, twist: 20, tip: ['lowerArmL', 'handL', 0.8] },

  { j: 'upperArmR', p: 'chest', r: 0.07, m: 3, cone: 88, bend: 0, twist: 70 },
  { j: 'lowerArmR', p: 'upperArmR', r: 0.06, m: 2, cone: 100, bend: 6, twist: 20 },
  { j: 'handR', p: 'lowerArmR', r: 0.05, m: 1, cone: 55, bend: 0, twist: 40 },
  { j: 'handTipR', p: 'handR', r: 0.05, m: 0.6, cone: 40, bend: 0, twist: 20, tip: ['lowerArmR', 'handR', 0.8] },

  { j: 'upperLegL', p: 'hips', r: 0.09, m: 7, cone: 62, bend: 0, twist: 30 },
  { j: 'lowerLegL', p: 'upperLegL', r: 0.08, m: 5, cone: 96, bend: 5, twist: 14 },
  { j: 'footL', p: 'lowerLegL', r: 0.07, m: 2, cone: 42, bend: 0, twist: 20 },
  { j: 'footTipL', p: 'footL', r: 0.06, m: 0.6, cone: 30, bend: 0, twist: 15, tip: ['lowerLegL', 'footL', 0.7] },

  { j: 'upperLegR', p: 'hips', r: 0.09, m: 7, cone: 62, bend: 0, twist: 30 },
  { j: 'lowerLegR', p: 'upperLegR', r: 0.08, m: 5, cone: 96, bend: 5, twist: 14 },
  { j: 'footR', p: 'lowerLegR', r: 0.07, m: 2, cone: 42, bend: 0, twist: 20 },
  { j: 'footTipR', p: 'footR', r: 0.06, m: 0.6, cone: 30, bend: 0, twist: 15, tip: ['lowerLegR', 'footR', 0.7] },
];

const normaliseBoneName = (s) => String(s || '')
  .toLowerCase()
  .replace(/mixamorig/g, '')
  .replace(/bip0?1/g, '')
  .replace(/[^a-z0-9]/g, '');

/** Signed twist angle of `q` about unit axis A, clamped to ±maxRad. */
function clampTwist(q, ax, ay, az, maxRad) {
  const d = q.x * ax + q.y * ay + q.z * az;
  _q3.set(ax * d, ay * d, az * d, q.w);
  const l = Math.sqrt(_q3.x * _q3.x + _q3.y * _q3.y + _q3.z * _q3.z + _q3.w * _q3.w);
  if (l < 1e-8) return q;
  _q3.set(_q3.x / l, _q3.y / l, _q3.z / l, _q3.w / l);
  const angle = 2 * Math.atan2(_q3.x * ax + _q3.y * ay + _q3.z * az, _q3.w);
  if (Math.abs(angle) <= maxRad) return q;
  const target = clampf(angle, -maxRad, maxRad);
  _q4.copy(_q3).invert();
  q.multiply(_q4);                       // strip the twist, leaving the swing
  const s = Math.sin(target * 0.5);
  _q4.set(ax * s, ay * s, az * s, Math.cos(target * 0.5));
  q.multiply(_q4);
  return q;
}

// ====================================================== 2. geometry kernels

const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Parameter of the point on segment AB closest to P, clamped to [0,1]. */
function segParam(px, py, pz, ax, ay, az, bx, by, bz) {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const l2 = ex * ex + ey * ey + ez * ez;
  if (l2 < 1e-12) return 0;
  return clamp01(((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / l2);
}

/** Closest point on segment AB to P → out.{x,y,z,t}. */
function closestPtSegment(px, py, pz, ax, ay, az, bx, by, bz, out) {
  const t = segParam(px, py, pz, ax, ay, az, bx, by, bz);
  out.t = t;
  out.x = ax + (bx - ax) * t;
  out.y = ay + (by - ay) * t;
  out.z = az + (bz - az) * t;
  return out;
}

/**
 * Closest points between segments P1Q1 and P2Q2 (Ericson, Real-Time Collision
 * Detection §5.1.9). Writes both witness points into `out`.
 */
function closestPtSegSeg(
  p1x, p1y, p1z, q1x, q1y, q1z,
  p2x, p2y, p2z, q2x, q2y, q2z, out,
) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a < 1e-12 && e < 1e-12) {
    s = 0; t = 0;
  } else if (a < 1e-12) {
    s = 0; t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-12) {
      t = 0; s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  out.s = s; out.t = t;
  out.ax = p1x + d1x * s; out.ay = p1y + d1y * s; out.az = p1z + d1z * s;
  out.bx = p2x + d2x * t; out.by = p2y + d2y * t; out.bz = p2z + d2z * t;
  return out;
}

/** Closest point on triangle ABC to P (barycentric region test). */
function closestPtTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out.x = ax; out.y = ay; out.z = az; return out; }

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out.x = bx; out.y = by; out.z = bz; return out; }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out.x = ax + abx * v; out.y = ay + aby * v; out.z = az + abz * v; return out;
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out.x = cx; out.y = cy; out.z = cz; return out; }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out.x = ax + acx * w; out.y = ay + acy * w; out.z = az + acz * w; return out;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out.x = bx + (cx - bx) * w; out.y = by + (cy - by) * w; out.z = bz + (cz - bz) * w;
    return out;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out.x = ax + abx * v + acx * w;
  out.y = ay + aby * v + acy * w;
  out.z = az + abz * v + acz * w;
  return out;
}

/**
 * Closest point on an OBB to P. When P is inside, `out.inside` is set and
 * out.{nx,ny,nz,depth} carry the least-penetration escape axis.
 */
function closestPtOBB(px, py, pz, b, out) {
  const dx = px - b.cx, dy = py - b.cy, dz = pz - b.cz;
  const u = b.u, v = b.v, w = b.w;
  const a0 = dx * u[0] + dy * u[1] + dz * u[2];
  const a1 = dx * v[0] + dy * v[1] + dz * v[2];
  const a2 = dx * w[0] + dy * w[1] + dz * w[2];
  const c0 = clampf(a0, -b.ex, b.ex);
  const c1 = clampf(a1, -b.ey, b.ey);
  const c2 = clampf(a2, -b.ez, b.ez);
  out.x = b.cx + u[0] * c0 + v[0] * c1 + w[0] * c2;
  out.y = b.cy + u[1] * c0 + v[1] * c1 + w[1] * c2;
  out.z = b.cz + u[2] * c0 + v[2] * c1 + w[2] * c2;
  out.inside = (c0 === a0 && c1 === a1 && c2 === a2);
  if (out.inside) {
    const p0 = b.ex - Math.abs(a0), p1 = b.ey - Math.abs(a1), p2 = b.ez - Math.abs(a2);
    if (p0 <= p1 && p0 <= p2) {
      const s = a0 < 0 ? -1 : 1;
      out.nx = u[0] * s; out.ny = u[1] * s; out.nz = u[2] * s; out.depth = p0;
    } else if (p1 <= p2) {
      const s = a1 < 0 ? -1 : 1;
      out.nx = v[0] * s; out.ny = v[1] * s; out.nz = v[2] * s; out.depth = p1;
    } else {
      const s = a2 < 0 ? -1 : 1;
      out.nx = w[0] * s; out.ny = w[1] * s; out.nz = w[2] * s; out.depth = p2;
    }
  }
  return out;
}

/**
 * Distance from segment AB to a convex shape by alternating projection — four
 * rounds converge to within a millimetre for boxes and triangles, which is well
 * under our skin width. Writes a signed distance (negative = segment core is
 * inside the shape) plus the push-out normal into `out`.
 */
function segToOBB(ax, ay, az, bx, by, bz, box, out) {
  let t = segParam(box.cx, box.cy, box.cz, ax, ay, az, bx, by, bz);
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < 4; i++) {
    sx = ax + (bx - ax) * t; sy = ay + (by - ay) * t; sz = az + (bz - az) * t;
    closestPtOBB(sx, sy, sz, box, _p2);
    if (_p2.inside) break;
    const nt = segParam(_p2.x, _p2.y, _p2.z, ax, ay, az, bx, by, bz);
    if (Math.abs(nt - t) < 1e-5) { t = nt; break; }
    t = nt;
  }
  sx = ax + (bx - ax) * t; sy = ay + (by - ay) * t; sz = az + (bz - az) * t;
  closestPtOBB(sx, sy, sz, box, _p2);
  out.px = _p2.x; out.py = _p2.y; out.pz = _p2.z; out.t = t;
  if (_p2.inside) {
    out.d = -_p2.depth;
    out.nx = _p2.nx; out.ny = _p2.ny; out.nz = _p2.nz;
    out.inside = true;
    return out;
  }
  out.inside = false;
  let ox = sx - _p2.x, oy = sy - _p2.y, oz = sz - _p2.z;
  const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
  if (len > 1e-9) { ox /= len; oy /= len; oz /= len; } else { ox = 0; oy = 1; oz = 0; }
  out.d = len; out.nx = ox; out.ny = oy; out.nz = oz;
  return out;
}

/** Same alternating projection against a triangle. Distance is always >= 0. */
function segToTriangle(ax, ay, az, bx, by, bz,
  t0x, t0y, t0z, t1x, t1y, t1z, t2x, t2y, t2z,
  fnx, fny, fnz, out) {
  const ccx = (t0x + t1x + t2x) / 3, ccy = (t0y + t1y + t2y) / 3, ccz = (t0z + t1z + t2z) / 3;
  let t = segParam(ccx, ccy, ccz, ax, ay, az, bx, by, bz);
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < 4; i++) {
    sx = ax + (bx - ax) * t; sy = ay + (by - ay) * t; sz = az + (bz - az) * t;
    closestPtTriangle(sx, sy, sz, t0x, t0y, t0z, t1x, t1y, t1z, t2x, t2y, t2z, _p3);
    const nt = segParam(_p3.x, _p3.y, _p3.z, ax, ay, az, bx, by, bz);
    if (Math.abs(nt - t) < 1e-5) { t = nt; break; }
    t = nt;
  }
  sx = ax + (bx - ax) * t; sy = ay + (by - ay) * t; sz = az + (bz - az) * t;
  closestPtTriangle(sx, sy, sz, t0x, t0y, t0z, t1x, t1y, t1z, t2x, t2y, t2z, _p3);
  out.px = _p3.x; out.py = _p3.y; out.pz = _p3.z; out.t = t;
  out.inside = false;
  let ox = sx - _p3.x, oy = sy - _p3.y, oz = sz - _p3.z;
  const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
  if (len > 1e-7) {
    out.d = len; out.nx = ox / len; out.ny = oy / len; out.nz = oz / len;
  } else {
    // Degenerate: sitting exactly on the plane. Fall back to the face normal,
    // oriented toward whichever side the segment mid-point lies on.
    const mx = (ax + bx) * 0.5 - t0x, my = (ay + by) * 0.5 - t0y, mz = (az + bz) * 0.5 - t0z;
    const s = (mx * fnx + my * fny + mz * fnz) < 0 ? -1 : 1;
    out.d = 0; out.nx = fnx * s; out.ny = fny * s; out.nz = fnz * s;
  }
  return out;
}

// ---------------------------------------------------------------- ray tests

/** Slab test. Returns entry distance, or -1 when the ray misses within tmax. */
function rayAABB(ox, oy, oz, idx, idy, idz, minx, miny, minz, maxx, maxy, maxz, tmax) {
  let t0 = (minx - ox) * idx, t1 = (maxx - ox) * idx;
  let tn = t0 < t1 ? t0 : t1, tf = t0 < t1 ? t1 : t0;
  t0 = (miny - oy) * idy; t1 = (maxy - oy) * idy;
  const ln = t0 < t1 ? t0 : t1, lf = t0 < t1 ? t1 : t0;
  if (ln > tn) tn = ln; if (lf < tf) tf = lf;
  t0 = (minz - oz) * idz; t1 = (maxz - oz) * idz;
  const mn = t0 < t1 ? t0 : t1, mf = t0 < t1 ? t1 : t0;
  if (mn > tn) tn = mn; if (mf < tf) tf = mf;
  if (tf < 0 || tn > tf || tn > tmax) return -1;
  return tn < 0 ? 0 : tn;
}

/** Möller–Trumbore, double sided. Returns t or -1. */
function rayTriangle(ox, oy, oz, dx, dy, dz,
  ax, ay, az, bx, by, bz, cx, cy, cz, tmax) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-10 && det < 1e-10) return -1;
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1.000001) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1.000001) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return (t >= 0 && t <= tmax) ? t : -1;
}

/** Ray vs sphere; returns nearest non-negative root or -1. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, tmax) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > tmax) return -1;
  return t;
}

/** Ray vs capsule (segment PQ, radius r). Returns t or -1. */
function rayCapsule(ox, oy, oz, dx, dy, dz, px, py, pz, qx, qy, qz, r, tmax) {
  const ax = qx - px, ay = qy - py, az = qz - pz;
  const mx = ox - px, my = oy - py, mz = oz - pz;
  const md = mx * ax + my * ay + mz * az;
  const nd = dx * ax + dy * ay + dz * az;
  const dd = ax * ax + ay * ay + az * az;
  if (dd < 1e-12) return raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r, tmax);
  const nn = 1;                       // dir is unit
  const mn = mx * dx + my * dy + mz * dz;
  const a = dd * nn - nd * nd;
  const k = (mx * mx + my * my + mz * mz) - r * r;
  const c = dd * k - md * md;
  if (Math.abs(a) < 1e-10) {
    // Parallel to the axis: only the caps can be hit.
    const t0 = raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r, tmax);
    const t1 = raySphere(ox, oy, oz, dx, dy, dz, qx, qy, qz, r, tmax);
    if (t0 < 0) return t1;
    if (t1 < 0) return t0;
    return t0 < t1 ? t0 : t1;
  }
  const b = dd * mn - nd * md;
  const disc = b * b - a * c;
  if (disc < 0) {
    const t0 = raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r, tmax);
    const t1 = raySphere(ox, oy, oz, dx, dy, dz, qx, qy, qz, r, tmax);
    if (t0 < 0) return t1;
    if (t1 < 0) return t0;
    return t0 < t1 ? t0 : t1;
  }
  let t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) t = (-b + Math.sqrt(disc)) / a;
  if (t < 0 || t > tmax) return -1;
  const proj = md + t * nd;
  if (proj < 0) return raySphere(ox, oy, oz, dx, dy, dz, px, py, pz, r, tmax);
  if (proj > dd) return raySphere(ox, oy, oz, dx, dy, dz, qx, qy, qz, r, tmax);
  return t;
}

/** Ray vs OBB. Returns t or -1; writes the face normal into `out`. */
function rayOBB(ox, oy, oz, dx, dy, dz, b, tmax, out) {
  const px = b.cx - ox, py = b.cy - oy, pz = b.cz - oz;
  let tmin = 0, tmaxv = tmax, axis = -1, sign = 1;
  const ext = _v0.set(b.ex, b.ey, b.ez);
  for (let i = 0; i < 3; i++) {
    const A = i === 0 ? b.u : i === 1 ? b.v : b.w;
    const e = A[0] * px + A[1] * py + A[2] * pz;
    const f = A[0] * dx + A[1] * dy + A[2] * dz;
    const h = i === 0 ? ext.x : i === 1 ? ext.y : ext.z;
    if (Math.abs(f) > 1e-9) {
      let t1 = (e + h) / f, t2 = (e - h) / f;
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmaxv) tmaxv = t2;
      if (tmin > tmaxv) return -1;
    } else if (-e - h > 0 || -e + h < 0) {
      return -1;
    }
  }
  if (tmin > tmax) return -1;
  if (axis < 0) { out.nx = 0; out.ny = 1; out.nz = 0; return tmin; }
  const A = axis === 0 ? b.u : axis === 1 ? b.v : b.w;
  out.nx = A[0] * sign; out.ny = A[1] * sign; out.nz = A[2] * sign;
  return tmin;
}

// ============================================================== 3. triangle BVH

/**
 * Compact median-split BVH over a BufferGeometry's triangles. Nodes live in
 * flat typed arrays so traversal never chases a pointer; triangles are copied
 * (and reordered) into a dense Float32Array so a leaf is a contiguous span.
 */
class TriBVH {
  constructor(geometry, matrix = null) {
    const pos = geometry.attributes.position;
    const idx = geometry.index ? geometry.index.array : null;
    const triCount = idx ? (idx.length / 3) | 0 : (pos.count / 3) | 0;
    this.triCount = triCount;

    const src = new Float32Array(triCount * 9);
    const parr = pos.array, itemSize = pos.itemSize;
    const v = _v0;
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[t * 3 + k] : t * 3 + k;
        v.set(parr[vi * itemSize], parr[vi * itemSize + 1], parr[vi * itemSize + 2]);
        if (matrix) v.applyMatrix4(matrix);
        src[t * 9 + k * 3] = v.x;
        src[t * 9 + k * 3 + 1] = v.y;
        src[t * 9 + k * 3 + 2] = v.z;
      }
    }

    const cent = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      cent[t * 3] = (src[t * 9] + src[t * 9 + 3] + src[t * 9 + 6]) / 3;
      cent[t * 3 + 1] = (src[t * 9 + 1] + src[t * 9 + 4] + src[t * 9 + 7]) / 3;
      cent[t * 3 + 2] = (src[t * 9 + 2] + src[t * 9 + 5] + src[t * 9 + 8]) / 3;
    }

    const order = new Uint32Array(triCount);
    for (let i = 0; i < triCount; i++) order[i] = i;

    const maxNodes = Math.max(1, triCount * 2 + 8);
    this.bmin = new Float32Array(maxNodes * 3);
    this.bmax = new Float32Array(maxNodes * 3);
    this.left = new Int32Array(maxNodes).fill(-1);
    this.right = new Int32Array(maxNodes).fill(-1);
    this.start = new Int32Array(maxNodes);
    this.count = new Int32Array(maxNodes);
    this.nodeCount = 0;

    if (triCount > 0) this._build(order, cent, src, 0, triCount);
    else { this.nodeCount = 1; this.left[0] = -1; this.start[0] = 0; this.count[0] = 0; }

    // Reorder triangles so every leaf is a contiguous run.
    this.tris = new Float32Array(triCount * 9);
    this.normals = new Float32Array(triCount * 3);
    for (let i = 0; i < triCount; i++) {
      const s = order[i] * 9, d = i * 9;
      for (let k = 0; k < 9; k++) this.tris[d + k] = src[s + k];
      const e1x = this.tris[d + 3] - this.tris[d], e1y = this.tris[d + 4] - this.tris[d + 1],
        e1z = this.tris[d + 5] - this.tris[d + 2];
      const e2x = this.tris[d + 6] - this.tris[d], e2y = this.tris[d + 7] - this.tris[d + 1],
        e2z = this.tris[d + 8] - this.tris[d + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      this.normals[i * 3] = nx / l;
      this.normals[i * 3 + 1] = ny / l;
      this.normals[i * 3 + 2] = nz / l;
    }

    this.rootMin = new Float32Array(3);
    this.rootMax = new Float32Array(3);
    for (let k = 0; k < 3; k++) { this.rootMin[k] = this.bmin[k]; this.rootMax[k] = this.bmax[k]; }

    this._stack = new Int32Array(64);
  }

  /** Recursive-by-hand median split; returns the node index. */
  _build(order, cent, src, from, to) {
    const node = this.nodeCount++;
    let minx = Infinity, miny = Infinity, minz = Infinity;
    let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let i = from; i < to; i++) {
      const b = order[i] * 9;
      for (let k = 0; k < 3; k++) {
        const x = src[b + k * 3], y = src[b + k * 3 + 1], z = src[b + k * 3 + 2];
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (z < minz) minz = z; if (z > maxz) maxz = z;
      }
    }
    this.bmin[node * 3] = minx; this.bmin[node * 3 + 1] = miny; this.bmin[node * 3 + 2] = minz;
    this.bmax[node * 3] = maxx; this.bmax[node * 3 + 1] = maxy; this.bmax[node * 3 + 2] = maxz;

    const n = to - from;
    if (n <= LEAF_TRIS) {
      this.left[node] = -1; this.start[node] = from; this.count[node] = n;
      return node;
    }
    const ex = maxx - minx, ey = maxy - miny, ez = maxz - minz;
    const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
    const mid = (from + to) >> 1;
    quickSelect(order, cent, from, to - 1, mid, axis);
    // Nodes are handed out depth-first, so the right child's index is whatever
    // the allocator is sitting on once the left subtree is complete.
    const l = this._build(order, cent, src, from, mid);
    const r = this.nodeCount;
    this._build(order, cent, src, mid, to);
    this.left[node] = l;
    this.right[node] = r;
    this.start[node] = -1; this.count[node] = 0;
    return node;
  }

  /** Ray query. Returns distance or -1; writes normal + tri index into `out`. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out) {
    const idx = 1 / (dx || 1e-20), idy = 1 / (dy || 1e-20), idz = 1 / (dz || 1e-20);
    const st = this._stack;
    let sp = 0;
    st[sp++] = 0;
    let best = maxDist, bestTri = -1;
    while (sp > 0) {
      const n = st[--sp];
      const b3 = n * 3;
      if (rayAABB(ox, oy, oz, idx, idy, idz,
        this.bmin[b3], this.bmin[b3 + 1], this.bmin[b3 + 2],
        this.bmax[b3], this.bmax[b3 + 1], this.bmax[b3 + 2], best) < 0) continue;
      const l = this.left[n];
      if (l < 0) {
        const s = this.start[n], c = this.count[n];
        for (let i = s; i < s + c; i++) {
          const b = i * 9;
          const t = rayTriangle(ox, oy, oz, dx, dy, dz,
            this.tris[b], this.tris[b + 1], this.tris[b + 2],
            this.tris[b + 3], this.tris[b + 4], this.tris[b + 5],
            this.tris[b + 6], this.tris[b + 7], this.tris[b + 8], best);
          if (t >= 0 && t < best) { best = t; bestTri = i; }
        }
      } else {
        if (sp + 2 < st.length) { st[sp++] = l; st[sp++] = this.right[n]; }
      }
    }
    if (bestTri < 0) return -1;
    let nx = this.normals[bestTri * 3], ny = this.normals[bestTri * 3 + 1], nz = this.normals[bestTri * 3 + 2];
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    out.nx = nx; out.ny = ny; out.nz = nz; out.t = bestTri;
    return best;
  }

  /** Collect triangle indices whose leaf AABB overlaps the query box. */
  overlapAABB(minx, miny, minz, maxx, maxy, maxz, outArr) {
    const st = this._stack;
    let sp = 0, count = 0;
    st[sp++] = 0;
    while (sp > 0) {
      const n = st[--sp];
      const b3 = n * 3;
      if (this.bmax[b3] < minx || this.bmin[b3] > maxx ||
        this.bmax[b3 + 1] < miny || this.bmin[b3 + 1] > maxy ||
        this.bmax[b3 + 2] < minz || this.bmin[b3 + 2] > maxz) continue;
      const l = this.left[n];
      if (l < 0) {
        const s = this.start[n], c = this.count[n];
        for (let i = s; i < s + c && count < outArr.length; i++) outArr[count++] = i;
      } else if (sp + 2 < st.length) {
        st[sp++] = l; st[sp++] = this.right[n];
      }
    }
    return count;
  }
}

/** In-place nth-element on `order`, comparing centroids on `axis`. */
function quickSelect(order, cent, lo, hi, nth, axis) {
  while (lo < hi) {
    const pivot = cent[order[(lo + hi) >> 1] * 3 + axis];
    let i = lo, j = hi;
    while (i <= j) {
      while (cent[order[i] * 3 + axis] < pivot) i++;
      while (cent[order[j] * 3 + axis] > pivot) j--;
      if (i <= j) { const t = order[i]; order[i] = order[j]; order[j] = t; i++; j--; }
    }
    if (nth <= j) hi = j;
    else if (nth >= i) lo = i;
    else return;
  }
}

// ================================================ 4. uniform spatial hash grid

/**
 * Uniform hash grid over static colliders. Rebuilt wholesale when the level
 * changes — inserts are cheap and levels change maybe twice per session.
 * Colliders too large to bucket sensibly (terrain-scale meshes) go into
 * `oversized` and are always considered; their own BVH does the real culling.
 */
class SpatialHash {
  constructor(cell = CELL_SIZE) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.map = new Map();
    this.oversized = [];
    this.stamp = 0;
  }

  clear() { this.map.clear(); this.oversized.length = 0; }

  /**
   * 32-bit spatial hash. Deliberately a small integer (never a boxed double)
   * because Map lookups with heap numbers allocate, and this runs thousands of
   * times per frame. Collisions are harmless: every candidate is AABB-tested.
   */
  static key(ix, iy, iz) {
    return (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) | 0;
  }

  insert(c) {
    const a = c.aabb;
    const x0 = Math.floor(a[0] * this.inv), x1 = Math.floor(a[3] * this.inv);
    const y0 = Math.floor(a[1] * this.inv), y1 = Math.floor(a[4] * this.inv);
    const z0 = Math.floor(a[2] * this.inv), z1 = Math.floor(a[5] * this.inv);
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (!isFinite(cells) || cells > 512) { this.oversized.push(c); return; }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const k = SpatialHash.key(x, y, z);
          let bucket = this.map.get(k);
          if (!bucket) { bucket = []; this.map.set(k, bucket); }
          bucket.push(c);
        }
      }
    }
  }

  /**
   * Gather colliders whose AABB overlaps the query box into `out` (an array we
   * reuse — the caller reads `count` entries). De-duplicated by a query stamp
   * so a collider spanning many cells is only visited once.
   */
  query(minx, miny, minz, maxx, maxy, maxz, mask, out) {
    const stamp = ++this.stamp;
    let count = 0;
    const big = this.oversized;
    for (let i = 0; i < big.length; i++) {
      const c = big[i];
      c._stamp = stamp;
      if (!c.enabled || (c.layer & mask) === 0) continue;
      const a = c.aabb;
      if (a[0] > maxx || a[3] < minx || a[1] > maxy || a[4] < miny || a[2] > maxz || a[5] < minz) continue;
      out[count++] = c;
    }
    const x0 = Math.floor(minx * this.inv), x1 = Math.floor(maxx * this.inv);
    const y0 = Math.floor(miny * this.inv), y1 = Math.floor(maxy * this.inv);
    const z0 = Math.floor(minz * this.inv), z1 = Math.floor(maxz * this.inv);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4096) return count;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const bucket = this.map.get(SpatialHash.key(x, y, z));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const c = bucket[i];
            if (c._stamp === stamp) continue;
            c._stamp = stamp;
            if (!c.enabled || (c.layer & mask) === 0) continue;
            const a = c.aabb;
            if (a[0] > maxx || a[3] < minx || a[1] > maxy || a[4] < miny ||
              a[2] > maxz || a[5] < minz) continue;
            out[count++] = c;
          }
        }
      }
    }
    return count;
  }
}

// ================================================================ 5. the world

/**
 * PhysicsWorld — the single system instance registered with the engine.
 *
 * Ownership: static colliders, dynamic bodies, character controllers and
 * ragdolls. Everything else in the game talks to it through the query API.
 */
export class PhysicsWorld {
  constructor(ctx) {
    this.ctx = ctx;
    this.LAYER = LAYER;

    this.statics = [];
    this.bodies = [];
    this.characters = [];
    this.ragdolls = [];

    this.hash = new SpatialHash(CELL_SIZE);
    this.heightfield = null;
    this._hashDirty = true;
    this.levelVersion = 0;

    this.gravity = GRAVITY;
    this.accumulator = 0;
    this.alpha = 0;
    this.time = 0;

    this.stats = {
      statics: 0, dynamics: 0, ragdolls: 0,
      broadphaseChecks: 0, narrowphaseChecks: 0, ms: 0,
    };

    // --- reusable query buffers ------------------------------------------
    this._cand = [];            // broadphase candidate colliders
    this._candCount = 0;
    // Sweep filter: while sweeping we ignore surfaces we are moving away from
    // or exactly parallel to. Without it a character resting on the floor is
    // "already touching the world" and every horizontal sweep stops at t=0.
    this._filterOn = false;
    this._fdx = 0; this._fdy = 0; this._fdz = 0;
    this._tri = new Int32Array(4096);
    this._contacts = [];        // contact record pool
    this._contactCount = 0;
    this._spawnCounter = 0;

    this.maxBodies = 32;
    this.maxRagdolls = 4;

    // Shared, reused query results. Documented as volatile: copy what you keep.
    this._rayHit = this._makeRayHit();
    this._downHit = this._makeRayHit();
    this._sweepHit = this._makeRayHit();

    this._debug = null;
    this._debugEnabled = false;
    this._debugScene = null;
    this._debugStaticVersion = -1;
  }

  _makeRayHit() {
    return {
      hit: false,
      point: new Vector3(),
      normal: new Vector3(0, 1, 0),
      distance: 0,
      collider: null,
      surface: 'stone',
      fraction: 0,
    };
  }

  async init() {
    this.applyQuality(this.ctx.quality);
    // Terrain may register before or after us; either way the heightfield
    // collider is virtual and resolves through ctx.terrain at query time.
    if (!this.heightfield) this.addHeightfield();
    return this;
  }

  applyQuality(q) {
    if (!q) return;
    this.maxBodies = Math.max(6, Math.floor((q.particleBudget || 400) / 20));
    this.maxRagdolls = q.ragdoll ? Math.max(1, Math.floor((q.maxEnemies || 6) / 2)) : 0;
    while (this.bodies.length > this.maxBodies) this._retireOldestBody();
    while (this.ragdolls.length > this.maxRagdolls) this._freezeOldestRagdoll(true);
  }

  // -------------------------------------------------------------- terrain

  _terrainHeight(x, z) {
    const t = this.ctx && this.ctx.terrain;
    if (!t || typeof t.heightAt !== 'function') return null;
    const h = t.heightAt(x, z);
    return (typeof h === 'number' && isFinite(h)) ? h : null;
  }

  /** Terrain normal into `out.{nx,ny,nz}`; falls back to central differences. */
  _terrainNormal(x, z, out) {
    const t = this.ctx && this.ctx.terrain;
    if (t && typeof t.normalAt === 'function') {
      const n = t.normalAt(x, z);
      if (n && typeof n.x === 'number') {
        const l = Math.hypot(n.x, n.y, n.z) || 1;
        out.nx = n.x / l; out.ny = n.y / l; out.nz = n.z / l;
        return out;
      }
    }
    const e = 0.35;
    const hl = this._terrainHeight(x - e, z), hr = this._terrainHeight(x + e, z);
    const hd = this._terrainHeight(x, z - e), hu = this._terrainHeight(x, z + e);
    if (hl === null || hr === null || hd === null || hu === null) {
      out.nx = 0; out.ny = 1; out.nz = 0; return out;
    }
    let nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    return out;
  }

  _terrainSurface(x, z) {
    const t = this.ctx && this.ctx.terrain;
    if (t && typeof t.surfaceAt === 'function') {
      const s = t.surfaceAt(x, z);
      if (typeof s === 'string') return s;
      if (typeof s === 'number') return SURFACES[s % SURFACES.length];
    }
    return 'grass';
  }

  // ------------------------------------------------------------- colliders

  /**
   * Register a static collider. Accepts a loose descriptor and normalises it
   * into the flat scalar form the narrowphase wants.
   *
   *   { type:'sphere',   position, radius }
   *   { type:'capsule',  position, radius, height }  or { p0, p1, radius }
   *   { type:'box',      position, size|halfExtents, quaternion|rotation }
   *   { type:'triangleMesh', geometry, matrix }
   *   { type:'heightfield' }
   * Common: { layer, surface, userData, owner }
   */
  addStatic(desc) {
    const c = {
      id: _idCounter++,
      _phkind: 'static',
      kind: desc.type || 'box',
      layer: desc.layer !== undefined ? desc.layer : LAYER.WORLD,
      surface: desc.surface || null,
      userData: desc.userData || null,
      owner: desc.owner || null,
      enabled: desc.enabled !== false,
      aabb: new Float32Array(6),
      _stamp: -1,
      cx: 0, cy: 0, cz: 0, r: 0,
      ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0,
      ex: 0, ey: 0, ez: 0,
      u: null, v: null, w: null,
      bvh: null,
    };

    const p = desc.position || desc.center;
    if (p) { c.cx = p.x; c.cy = p.y; c.cz = p.z; }

    switch (c.kind) {
      case 'sphere': {
        c.r = desc.radius !== undefined ? desc.radius : 0.5;
        break;
      }
      case 'capsule': {
        c.r = desc.radius !== undefined ? desc.radius : 0.3;
        if (desc.p0 && desc.p1) {
          c.ax = desc.p0.x; c.ay = desc.p0.y; c.az = desc.p0.z;
          c.bx = desc.p1.x; c.by = desc.p1.y; c.bz = desc.p1.z;
        } else {
          // Upright capsule whose feet sit at `position`.
          const h = desc.height !== undefined ? desc.height : 2;
          c.ax = c.cx; c.ay = c.cy + c.r; c.az = c.cz;
          c.bx = c.cx; c.by = c.cy + Math.max(c.r, h - c.r); c.bz = c.cz;
        }
        c.cx = (c.ax + c.bx) * 0.5; c.cy = (c.ay + c.by) * 0.5; c.cz = (c.az + c.bz) * 0.5;
        break;
      }
      case 'box': {
        const he = desc.halfExtents;
        if (he) { c.ex = he.x; c.ey = he.y; c.ez = he.z; }
        else if (desc.size) { c.ex = desc.size.x * 0.5; c.ey = desc.size.y * 0.5; c.ez = desc.size.z * 0.5; }
        else { c.ex = 0.5; c.ey = 0.5; c.ez = 0.5; }
        c.u = new Float32Array(3); c.v = new Float32Array(3); c.w = new Float32Array(3);
        _q0.identity();
        if (desc.quaternion) _q0.copy(desc.quaternion);
        else if (desc.rotation) _q0.setFromEuler(desc.rotation);
        else if (desc.rotationY !== undefined) _q0.setFromAxisAngle(_v0.set(0, 1, 0), desc.rotationY);
        _m0.makeRotationFromQuaternion(_q0);
        const e = _m0.elements;
        c.u[0] = e[0]; c.u[1] = e[1]; c.u[2] = e[2];
        c.v[0] = e[4]; c.v[1] = e[5]; c.v[2] = e[6];
        c.w[0] = e[8]; c.w[1] = e[9]; c.w[2] = e[10];
        c.quaternion = new Quaternion().copy(_q0);
        break;
      }
      case 'triangleMesh': {
        const geo = desc.geometry;
        if (!geo || !geo.attributes || !geo.attributes.position) {
          console.warn('[physics] triangleMesh collider without geometry — ignored');
          return null;
        }
        c.bvh = new TriBVH(geo, desc.matrix || null);
        break;
      }
      case 'heightfield': {
        c.layer = LAYER.WORLD;
        break;
      }
      default:
        console.warn('[physics] unknown collider type', c.kind);
        return null;
    }

    this._computeAABB(c);
    if (c.kind === 'heightfield') {
      this.heightfield = c;
    } else {
      this.statics.push(c);
      this._hashDirty = true;
    }
    this.levelVersion++;
    this.stats.statics = this.statics.length;
    return c;
  }

  /** Convenience: the terrain heightfield collider (idempotent). */
  addHeightfield(surface = null) {
    if (this.heightfield) return this.heightfield;
    return this.addStatic({ type: 'heightfield', surface, layer: LAYER.WORLD });
  }

  _computeAABB(c) {
    const a = c.aabb;
    switch (c.kind) {
      case 'sphere':
        a[0] = c.cx - c.r; a[1] = c.cy - c.r; a[2] = c.cz - c.r;
        a[3] = c.cx + c.r; a[4] = c.cy + c.r; a[5] = c.cz + c.r;
        break;
      case 'capsule':
        a[0] = Math.min(c.ax, c.bx) - c.r; a[1] = Math.min(c.ay, c.by) - c.r;
        a[2] = Math.min(c.az, c.bz) - c.r;
        a[3] = Math.max(c.ax, c.bx) + c.r; a[4] = Math.max(c.ay, c.by) + c.r;
        a[5] = Math.max(c.az, c.bz) + c.r;
        break;
      case 'box': {
        const rx = Math.abs(c.u[0]) * c.ex + Math.abs(c.v[0]) * c.ey + Math.abs(c.w[0]) * c.ez;
        const ry = Math.abs(c.u[1]) * c.ex + Math.abs(c.v[1]) * c.ey + Math.abs(c.w[1]) * c.ez;
        const rz = Math.abs(c.u[2]) * c.ex + Math.abs(c.v[2]) * c.ey + Math.abs(c.w[2]) * c.ez;
        a[0] = c.cx - rx; a[1] = c.cy - ry; a[2] = c.cz - rz;
        a[3] = c.cx + rx; a[4] = c.cy + ry; a[5] = c.cz + rz;
        break;
      }
      case 'triangleMesh': {
        const b = c.bvh;
        a[0] = b.rootMin[0]; a[1] = b.rootMin[1]; a[2] = b.rootMin[2];
        a[3] = b.rootMax[0]; a[4] = b.rootMax[1]; a[5] = b.rootMax[2];
        c.cx = (a[0] + a[3]) * 0.5; c.cy = (a[1] + a[4]) * 0.5; c.cz = (a[2] + a[5]) * 0.5;
        break;
      }
      default:
        a[0] = a[1] = a[2] = -Infinity;
        a[3] = a[4] = a[5] = Infinity;
    }
  }

  /** Remove any handle returned by addStatic / addDynamic / createCharacter / createRagdoll. */
  remove(handle) {
    if (!handle) return false;
    let arr = null;
    switch (handle._phkind) {
      case 'static': arr = this.statics; this._hashDirty = true; this.levelVersion++; break;
      case 'body': arr = this.bodies; break;
      case 'character': arr = this.characters; break;
      case 'ragdoll': arr = this.ragdolls; break;
      default: return false;
    }
    const i = arr.indexOf(handle);
    if (i < 0) return false;
    arr.splice(i, 1);
    handle.enabled = false;
    if (handle === this.heightfield) this.heightfield = null;
    this.stats.statics = this.statics.length;
    this.stats.dynamics = this.bodies.length;
    this.stats.ragdolls = this.ragdolls.length;
    return true;
  }

  /** Drop every static collider — called by Level when it rebuilds. */
  clearStatics() {
    this.statics.length = 0;
    this.hash.clear();
    this._hashDirty = true;
    this.levelVersion++;
    this.stats.statics = 0;
  }

  _rebuildHash() {
    this.hash.clear();
    for (let i = 0; i < this.statics.length; i++) this.hash.insert(this.statics[i]);
    this._hashDirty = false;
  }

  // ------------------------------------------------------------ broadphase

  /** Fill `this._cand` with candidates overlapping the box. Never nests. */
  _gather(minx, miny, minz, maxx, maxy, maxz, mask) {
    if (this._hashDirty) this._rebuildHash();
    this._candCount = this.hash.query(minx, miny, minz, maxx, maxy, maxz, mask, this._cand);
    this.stats.broadphaseChecks += this._candCount;
    return this._candCount;
  }

  // ------------------------------------------------------------ narrowphase

  /**
   * Signed distance from segment AB to a collider's *surface*, with the push-out
   * normal (pointing from the collider toward the segment). Negative when the
   * segment core is inside the collider.
   */
  _closestToCollider(ax, ay, az, bx, by, bz, c, out) {
    this.stats.narrowphaseChecks++;
    switch (c.kind) {
      case 'sphere': {
        closestPtSegment(c.cx, c.cy, c.cz, ax, ay, az, bx, by, bz, _p0);
        let dx = _p0.x - c.cx, dy = _p0.y - c.cy, dz = _p0.z - c.cz;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l > 1e-9) { dx /= l; dy /= l; dz /= l; } else { dx = 0; dy = 1; dz = 0; }
        out.d = l - c.r;
        out.nx = dx; out.ny = dy; out.nz = dz;
        out.px = c.cx + dx * c.r; out.py = c.cy + dy * c.r; out.pz = c.cz + dz * c.r;
        out.c = c;
        return out;
      }
      case 'capsule': {
        closestPtSegSeg(ax, ay, az, bx, by, bz, c.ax, c.ay, c.az, c.bx, c.by, c.bz, _ss);
        let dx = _ss.ax - _ss.bx, dy = _ss.ay - _ss.by, dz = _ss.az - _ss.bz;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l > 1e-9) { dx /= l; dy /= l; dz /= l; } else { dx = 0; dy = 1; dz = 0; }
        out.d = l - c.r;
        out.nx = dx; out.ny = dy; out.nz = dz;
        out.px = _ss.bx + dx * c.r; out.py = _ss.by + dy * c.r; out.pz = _ss.bz + dz * c.r;
        out.c = c;
        return out;
      }
      case 'box': {
        segToOBB(ax, ay, az, bx, by, bz, c, out);
        out.c = c;
        return out;
      }
      case 'triangleMesh': {
        const r = 0.001;
        const minx = Math.min(ax, bx) - r, maxx = Math.max(ax, bx) + r;
        const miny = Math.min(ay, by) - r, maxy = Math.max(ay, by) + r;
        const minz = Math.min(az, bz) - r, maxz = Math.max(az, bz) + r;
        return this._closestToMesh(ax, ay, az, bx, by, bz, c,
          minx, miny, minz, maxx, maxy, maxz, out);
      }
      case 'heightfield':
        return this._closestToHeightfield(ax, ay, az, bx, by, bz, c, out);
      default:
        out.d = Infinity; out.c = null;
        return out;
    }
  }

  /**
   * Mesh variant takes an explicit query box so a swept query can inflate it by
   * the capsule radius once instead of per triangle.
   */
  _closestToMesh(ax, ay, az, bx, by, bz, c, minx, miny, minz, maxx, maxy, maxz, out) {
    const bvh = c.bvh;
    const n = bvh.overlapAABB(minx, miny, minz, maxx, maxy, maxz, this._tri);
    out.d = Infinity; out.c = null;
    const filter = this._filterOn;
    for (let i = 0; i < n; i++) {
      const ti = this._tri[i], b = ti * 9;
      this.stats.narrowphaseChecks++;
      if (filter) {
        // Cheap pre-reject on the face normal before the closest-point work.
        const fn = bvh.normals[ti * 3] * this._fdx + bvh.normals[ti * 3 + 1] * this._fdy +
          bvh.normals[ti * 3 + 2] * this._fdz;
        if (Math.abs(fn) < 1e-4) continue;
      }
      segToTriangle(ax, ay, az, bx, by, bz,
        bvh.tris[b], bvh.tris[b + 1], bvh.tris[b + 2],
        bvh.tris[b + 3], bvh.tris[b + 4], bvh.tris[b + 5],
        bvh.tris[b + 6], bvh.tris[b + 7], bvh.tris[b + 8],
        bvh.normals[ti * 3], bvh.normals[ti * 3 + 1], bvh.normals[ti * 3 + 2], _hC);
      if (filter && (_hC.nx * this._fdx + _hC.ny * this._fdy + _hC.nz * this._fdz) >= -1e-4) continue;
      if (_hC.d < out.d) {
        out.d = _hC.d; out.nx = _hC.nx; out.ny = _hC.ny; out.nz = _hC.nz;
        out.px = _hC.px; out.py = _hC.py; out.pz = _hC.pz;
        out.c = c; out.t = ti;
      }
    }
    if (out.c === null) { out.d = Infinity; out.nx = 0; out.ny = 1; out.nz = 0; }
    return out;
  }

  /**
   * Heightfield: sample the terrain under three points along the segment and
   * take the closest tangent plane. Three samples is enough because a character
   * capsule is short relative to terrain curvature.
   */
  _closestToHeightfield(ax, ay, az, bx, by, bz, c, out) {
    out.d = Infinity; out.c = null;
    for (let i = 0; i < 3; i++) {
      const t = i * 0.5;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const h = this._terrainHeight(x, z);
      if (h === null) continue;
      this.stats.narrowphaseChecks++;
      this._terrainNormal(x, z, _p2);
      const d = (y - h) * _p2.ny;   // signed distance to the tangent plane
      if (d < out.d) {
        out.d = d;
        out.nx = _p2.nx; out.ny = _p2.ny; out.nz = _p2.nz;
        out.px = x; out.py = h; out.pz = z;
        out.c = c;
      }
    }
    if (out.c === null) { out.d = Infinity; out.nx = 0; out.ny = 1; out.nz = 0; }
    return out;
  }

  /**
   * Closest distance from a capsule (segment AB, radius r) to the whole static
   * world, over the candidates already gathered into `this._cand`.
   * Returns the surface gap (negative = penetrating) in `out.d`.
   */
  _closestWorld(ax, ay, az, bx, by, bz, r, mask, out) {
    out.d = Infinity; out.c = null; out.nx = 0; out.ny = 1; out.nz = 0;
    const minx = Math.min(ax, bx) - r, maxx = Math.max(ax, bx) + r;
    const miny = Math.min(ay, by) - r, maxy = Math.max(ay, by) + r;
    const minz = Math.min(az, bz) - r, maxz = Math.max(az, bz) + r;
    for (let i = 0; i < this._candCount; i++) {
      const c = this._cand[i];
      const a = c.aabb;
      if (a[0] > maxx || a[3] < minx || a[1] > maxy || a[4] < miny ||
        a[2] > maxz || a[5] < minz) continue;
      if (c.kind === 'triangleMesh') {
        this._closestToMesh(ax, ay, az, bx, by, bz, c, minx, miny, minz, maxx, maxy, maxz, _hA);
      } else {
        this._closestToCollider(ax, ay, az, bx, by, bz, c, _hA);
        if (this._filterOn && _hA.c &&
          (_hA.nx * this._fdx + _hA.ny * this._fdy + _hA.nz * this._fdz) >= -1e-4) continue;
      }
      if (_hA.c && _hA.d - r < out.d) {
        out.d = _hA.d - r;
        out.nx = _hA.nx; out.ny = _hA.ny; out.nz = _hA.nz;
        out.px = _hA.px; out.py = _hA.py; out.pz = _hA.pz;
        out.c = _hA.c;
      }
    }
    const hf = this.heightfield;
    if (hf && hf.enabled !== false && (hf.layer & mask) !== 0) {
      this._closestToHeightfield(ax, ay, az, bx, by, bz, hf, _hA);
      if (this._filterOn && _hA.c &&
        (_hA.nx * this._fdx + _hA.ny * this._fdy + _hA.nz * this._fdz) >= -1e-4) _hA.c = null;
      if (_hA.c && _hA.d - r < out.d) {
        out.d = _hA.d - r;
        out.nx = _hA.nx; out.ny = _hA.ny; out.nz = _hA.nz;
        out.px = _hA.px; out.py = _hA.py; out.pz = _hA.pz;
        out.c = _hA.c;
      }
    }
    return out;
  }

  /** Surface tag for a contact — collider override first, then the terrain splat. */
  _surfaceOf(collider, x, z) {
    if (collider && collider.surface) return collider.surface;
    if (collider && collider.kind === 'heightfield') return this._terrainSurface(x, z);
    if (collider && collider.layer === LAYER.WATER) return 'water';
    return collider ? 'stone' : this._terrainSurface(x, z);
  }

  // ============================================================ sweeps

  /**
   * Sweep an upright capsule (segment y+lo → y+hi around x,z) along a delta.
   *
   * Discrete marching plus four bisection refinements rather than analytic TOI:
   * a per-substep character delta is ~0.1 m against a 0.34 m radius, so the
   * common case is a single distance evaluation, and the march can never tunnel
   * through anything thicker than half the capsule radius.
   */
  _sweep(px, py, pz, lo, hi, r, dx, dy, dz, mask, out) {
    out.hit = false; out.t = 1; out.collider = null;
    out.nx = 0; out.ny = 1; out.nz = 0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const margin = r + 0.06;
    const minx = Math.min(px, px + dx) - margin, maxx = Math.max(px, px + dx) + margin;
    const miny = Math.min(py + lo, py + lo + dy) - margin, maxy = Math.max(py + hi, py + hi + dy) + margin;
    const minz = Math.min(pz, pz + dz) - margin, maxz = Math.max(pz, pz + dz) + margin;
    this._gather(minx, miny, minz, maxx, maxy, maxz, mask);

    if (len < 1e-9) {
      this._closestWorld(px, py + lo, pz, px, py + hi, pz, r, mask, _hD);
      if (_hD.c && _hD.d <= BLOCK_EPS) {
        out.hit = true; out.t = 0;
        out.nx = _hD.nx; out.ny = _hD.ny; out.nz = _hD.nz;
        out.collider = _hD.c; out.px = _hD.px; out.py = _hD.py; out.pz = _hD.pz;
      }
      return out;
    }

    // Only surfaces we are actually driving into can stop us. This is what lets
    // a grounded character move horizontally at all: the floor it is resting on
    // is a zero-distance contact whose normal is perpendicular to the motion.
    this._filterOn = true;
    this._fdx = dx / len; this._fdy = dy / len; this._fdz = dz / len;

    const steps = Math.min(12, Math.max(1, Math.ceil(len / Math.max(0.06, r * 0.5))));
    let free = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = px + dx * t, cy = py + dy * t, cz = pz + dz * t;
      this._closestWorld(cx, cy + lo, cz, cx, cy + hi, cz, r, mask, _hD);
      if (_hD.c && _hD.d <= BLOCK_EPS) {
        let a = free, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) * 0.5;
          const mx = px + dx * m, my = py + dy * m, mz = pz + dz * m;
          this._closestWorld(mx, my + lo, mz, mx, my + hi, mz, r, mask, _hA);
          if (_hA.c && _hA.d <= BLOCK_EPS) {
            b = m;
            _hD.d = _hA.d; _hD.nx = _hA.nx; _hD.ny = _hA.ny; _hD.nz = _hA.nz;
            _hD.px = _hA.px; _hD.py = _hA.py; _hD.pz = _hA.pz; _hD.c = _hA.c;
          } else {
            a = m;
          }
        }
        out.hit = true; out.t = a;
        out.nx = _hD.nx; out.ny = _hD.ny; out.nz = _hD.nz;
        out.collider = _hD.c; out.px = _hD.px; out.py = _hD.py; out.pz = _hD.pz;
        this._filterOn = false;
        return out;
      }
      free = t;
    }
    this._filterOn = false;
    return out;
  }

  /**
   * Push an upright capsule out of anything it starts inside. Returns the
   * corrected position in `out` and the deepest normal seen.
   */
  _depenetrate(px, py, pz, lo, hi, r, mask, out) {
    out.x = px; out.y = py; out.z = pz;
    out.hit = false; out.nx = 0; out.ny = 1; out.nz = 0; out.c = null;
    const margin = r + 0.25;
    this._gather(px - margin, py + lo - margin, pz - margin,
      px + margin, py + hi + margin, pz + margin, mask);
    for (let i = 0; i < 4; i++) {
      this._closestWorld(out.x, out.y + lo, out.z, out.x, out.y + hi, out.z, r, mask, _hD);
      if (!_hD.c || _hD.d > -1e-5) break;
      const push = -_hD.d + PUSH_OUT;
      out.x += _hD.nx * push; out.y += _hD.ny * push; out.z += _hD.nz * push;
      out.hit = true;
      out.nx = _hD.nx; out.ny = _hD.ny; out.nz = _hD.nz; out.c = _hD.c;
    }
    return out;
  }

  // ============================================================ 3. queries

  /**
   * Ray against the whole world. Returns a *shared, volatile* hit record (or
   * null) — copy `point`/`normal` if you keep them past the next query. Pass
   * `out` to write into your own record instead.
   */
  raycast(origin, dir, maxDist = 1000, mask = LAYER_ALL, out = null) {
    const res = out || this._rayHit;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl < 1e-9) { res.hit = false; return null; }
    dx /= dl; dy /= dl; dz /= dl;
    return this._rayInternal(ox, oy, oz, dx, dy, dz, maxDist, mask, res);
  }

  _rayInternal(ox, oy, oz, dx, dy, dz, maxDist, mask, res) {
    res.hit = false; res.collider = null; res.distance = maxDist; res.fraction = 1;

    const ex = ox + dx * maxDist, ey = oy + dy * maxDist, ez = oz + dz * maxDist;
    this._gather(Math.min(ox, ex) - 0.01, Math.min(oy, ey) - 0.01, Math.min(oz, ez) - 0.01,
      Math.max(ox, ex) + 0.01, Math.max(oy, ey) + 0.01, Math.max(oz, ez) + 0.01, mask);

    let best = maxDist, bestC = null;
    const idx = 1 / (dx || 1e-20), idy = 1 / (dy || 1e-20), idz = 1 / (dz || 1e-20);

    for (let i = 0; i < this._candCount; i++) {
      const c = this._cand[i];
      const a = c.aabb;
      if (rayAABB(ox, oy, oz, idx, idy, idz, a[0], a[1], a[2], a[3], a[4], a[5], best) < 0) continue;
      this.stats.narrowphaseChecks++;
      let t = -1;
      switch (c.kind) {
        case 'sphere':
          t = raySphere(ox, oy, oz, dx, dy, dz, c.cx, c.cy, c.cz, c.r, best);
          break;
        case 'capsule':
          t = rayCapsule(ox, oy, oz, dx, dy, dz, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r, best);
          break;
        case 'box':
          t = rayOBB(ox, oy, oz, dx, dy, dz, c, best, _hA);
          break;
        case 'triangleMesh':
          t = c.bvh.raycast(ox, oy, oz, dx, dy, dz, best, _hA);
          break;
        default:
          t = -1;
      }
      if (t >= 0 && t < best) { best = t; bestC = c; }
    }

    // Normals are resolved once, for the winner only — the loop above reuses
    // `_hA` and a farther candidate would otherwise clobber it.
    if (bestC) this._rayNormalFor(bestC, ox, oy, oz, dx, dy, dz, best, _hA);

    const hf = this.heightfield;
    if (hf && hf.enabled !== false && (hf.layer & mask) !== 0) {
      const t = this._rayHeightfield(ox, oy, oz, dx, dy, dz, best);
      if (t >= 0 && t < best) {
        best = t; bestC = hf;
        this._terrainNormal(ox + dx * t, oz + dz * t, _hA);
      }
    }

    if (!bestC) { res.hit = false; return null; }
    res.hit = true;
    res.distance = best;
    res.fraction = maxDist > 0 ? best / maxDist : 0;
    res.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    res.normal.set(_hA.nx, _hA.ny, _hA.nz);
    res.collider = bestC;
    res.surface = this._surfaceOf(bestC, res.point.x, res.point.z);
    return res;
  }

  /** Recompute the surface normal for a known ray hit. */
  _rayNormalFor(c, ox, oy, oz, dx, dy, dz, t, out) {
    switch (c.kind) {
      case 'sphere': {
        let nx = ox + dx * t - c.cx, ny = oy + dy * t - c.cy, nz = oz + dz * t - c.cz;
        const l = Math.hypot(nx, ny, nz) || 1;
        out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
        break;
      }
      case 'capsule': {
        closestPtSegment(ox + dx * t, oy + dy * t, oz + dz * t,
          c.ax, c.ay, c.az, c.bx, c.by, c.bz, _p0);
        let nx = ox + dx * t - _p0.x, ny = oy + dy * t - _p0.y, nz = oz + dz * t - _p0.z;
        const l = Math.hypot(nx, ny, nz) || 1;
        out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
        break;
      }
      case 'box':
        rayOBB(ox, oy, oz, dx, dy, dz, c, t + 1e-3, out);
        break;
      case 'triangleMesh':
        c.bvh.raycast(ox, oy, oz, dx, dy, dz, t + 1e-3, out);
        break;
      default:
        out.nx = 0; out.ny = 1; out.nz = 0;
    }
    return out;
  }

  /** March the heightfield looking for the first crossing. Returns t or -1. */
  _rayHeightfield(ox, oy, oz, dx, dy, dz, maxDist) {
    if (this._terrainHeight(ox, oz) === null) return -1;
    // Straight down is the overwhelmingly common case and has a closed form.
    if (dy < -0.9999) {
      const h = this._terrainHeight(ox, oz);
      const t = oy - h;
      return (t >= 0 && t <= maxDist) ? t : -1;
    }
    const step = Math.max(0.2, maxDist / 96);
    let prevT = 0;
    let prevDiff = oy - this._terrainHeight(ox, oz);
    if (prevDiff <= 0) return 0;
    for (let t = step; t <= maxDist; t += step) {
      const h = this._terrainHeight(ox + dx * t, oz + dz * t);
      if (h === null) return -1;
      const diff = (oy + dy * t) - h;
      if (diff <= 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) * 0.5;
          const hm = this._terrainHeight(ox + dx * m, oz + dz * m);
          if ((oy + dy * m) - hm <= 0) b = m; else a = m;
        }
        return a;
      }
      prevT = t; prevDiff = diff;
    }
    return -1;
  }

  /**
   * The foot-IK fast path: a downward ray from (x,y,z). Allocation-free, skips
   * the generic ray plumbing, and returns a shared record reused every call.
   */
  raycastDown(x, y, z, maxDist = 3, mask = LAYER_SOLID) {
    const res = this._downHit;
    res.hit = false; res.collider = null; res.distance = maxDist; res.fraction = 1;
    let best = maxDist, bestC = null;

    this._gather(x - 0.01, y - maxDist, z - 0.01, x + 0.01, y, z + 0.01, mask);
    const idy = -1;
    for (let i = 0; i < this._candCount; i++) {
      const c = this._cand[i];
      const a = c.aabb;
      if (a[0] > x || a[3] < x || a[2] > z || a[5] < z || a[1] > y || a[4] < y - best) continue;
      this.stats.narrowphaseChecks++;
      let t = -1;
      switch (c.kind) {
        case 'sphere': t = raySphere(x, y, z, 0, -1, 0, c.cx, c.cy, c.cz, c.r, best); break;
        case 'capsule': t = rayCapsule(x, y, z, 0, -1, 0, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r, best); break;
        case 'box': t = rayOBB(x, y, z, 0, -1, 0, c, best, _hA); break;
        case 'triangleMesh': t = c.bvh.raycast(x, y, z, 0, -1, 0, best, _hA); break;
        default: t = -1;
      }
      if (t >= 0 && t < best) { best = t; bestC = c; }
    }
    if (bestC) this._rayNormalFor(bestC, x, y, z, 0, -1, 0, best, _hA);

    const hf = this.heightfield;
    if (hf && hf.enabled !== false && (hf.layer & mask) !== 0) {
      const h = this._terrainHeight(x, z);
      if (h !== null) {
        const t = y - h;
        if (t >= 0 && t < best) { best = t; bestC = hf; this._terrainNormal(x, z, _hA); }
      }
    }
    if (!bestC) return null;
    res.hit = true;
    res.distance = best;
    res.fraction = maxDist > 0 ? best / maxDist : 0;
    res.point.set(x, y - best, z);
    res.normal.set(_hA.nx, _hA.ny, _hA.nz);
    res.collider = bestC;
    res.surface = this._surfaceOf(bestC, x, z);
    // Guard against a degenerate normal from a vertical wall triangle.
    if (res.normal.y < 0) res.normal.negate();
    return res;
  }

  /**
   * Sphere cast — a zero-length capsule sweep. Returns a shared, volatile hit
   * record or null.
   */
  sphereCast(origin, dir, radius, maxDist = 20, mask = LAYER_SOLID) {
    const res = this._sweepHit;
    res.hit = false; res.collider = null;
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dl < 1e-9) return null;
    dx = dx / dl * maxDist; dy = dy / dl * maxDist; dz = dz / dl * maxDist;
    this._sweep(origin.x, origin.y, origin.z, 0, 0, radius, dx, dy, dz, mask, _hD);
    if (!_hD.hit) return null;
    res.hit = true;
    res.distance = _hD.t * maxDist;
    res.fraction = _hD.t;
    res.point.set(_hD.px !== undefined ? _hD.px : origin.x,
      _hD.py !== undefined ? _hD.py : origin.y,
      _hD.pz !== undefined ? _hD.pz : origin.z);
    res.normal.set(_hD.nx, _hD.ny, _hD.nz);
    res.collider = _hD.collider;
    res.surface = this._surfaceOf(_hD.collider, res.point.x, res.point.z);
    return res;
  }

  /**
   * Everything whose surface is within `radius` of `center`. Writes colliders,
   * bodies and characters into `outArray` and returns the count — never
   * allocates, so combat can call it per swing frame.
   */
  overlapSphere(center, radius, mask = LAYER_ALL, outArray = null) {
    return this.capsuleOverlap(center, center, radius, mask, outArray);
  }

  /**
   * Swept blade volume: everything within `radius` of the segment a→b.
   * Same contract as overlapSphere.
   */
  capsuleOverlap(a, b, radius, mask = LAYER_ALL, outArray = null) {
    const out = outArray;
    let count = 0;
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    const minx = Math.min(ax, bx) - radius, maxx = Math.max(ax, bx) + radius;
    const miny = Math.min(ay, by) - radius, maxy = Math.max(ay, by) + radius;
    const minz = Math.min(az, bz) - radius, maxz = Math.max(az, bz) + radius;

    if (mask & (LAYER.WORLD | LAYER.PROP | LAYER.WATER | LAYER.TRIGGER)) {
      this._gather(minx, miny, minz, maxx, maxy, maxz, mask);
      for (let i = 0; i < this._candCount; i++) {
        const c = this._cand[i];
        if (c.kind === 'triangleMesh') {
          this._closestToMesh(ax, ay, az, bx, by, bz, c, minx, miny, minz, maxx, maxy, maxz, _hA);
        } else {
          this._closestToCollider(ax, ay, az, bx, by, bz, c, _hA);
        }
        if (_hA.c && _hA.d <= radius) { if (out) out[count] = c; count++; }
      }
    }

    // Dynamic bodies (bounding-sphere test — props are small and round enough).
    if (mask & LAYER.PROP) {
      for (let i = 0; i < this.bodies.length; i++) {
        const bd = this.bodies[i];
        if (!bd.enabled || (bd.layer & mask) === 0) continue;
        closestPtSegment(bd.position.x, bd.position.y, bd.position.z, ax, ay, az, bx, by, bz, _p0);
        const dx = _p0.x - bd.position.x, dy = _p0.y - bd.position.y, dz = _p0.z - bd.position.z;
        if (dx * dx + dy * dy + dz * dz <= (radius + bd.boundRadius) * (radius + bd.boundRadius)) {
          if (out) out[count] = bd; count++;
        }
      }
    }

    // Characters — capsule vs capsule, which is what combat actually wants.
    if (mask & (LAYER.CHARACTER | LAYER.PLAYER | LAYER.ENEMY)) {
      for (let i = 0; i < this.characters.length; i++) {
        const ch = this.characters[i];
        if (!ch.enabled || (ch.layer & mask) === 0) continue;
        const p = ch.position;
        closestPtSegSeg(ax, ay, az, bx, by, bz,
          p.x, p.y + ch.radius, p.z, p.x, p.y + Math.max(ch.radius, ch.height - ch.radius), p.z, _ss);
        const dx = _ss.ax - _ss.bx, dy = _ss.ay - _ss.by, dz = _ss.az - _ss.bz;
        const rr = radius + ch.radius;
        if (dx * dx + dy * dy + dz * dz <= rr * rr) { if (out) out[count] = ch; count++; }
      }
    }
    return count;
  }

  // ================================================= 4. character controller

  /**
   * Create a kinematic capsule controller. The returned handle owns its own
   * vertical velocity and ground state; the gameplay layer supplies horizontal
   * intent through `move(displacement, dt)`.
   */
  createCharacter(opts = {}) {
    const world = this;
    const radius = opts.radius !== undefined ? opts.radius : 0.34;
    const height = opts.height !== undefined ? opts.height : 1.75;
    const slopeLimit = opts.slopeLimit !== undefined ? opts.slopeLimit : DEFAULT_SLOPE_LIMIT;

    const ch = {
      id: _idCounter++,
      _phkind: 'character',
      enabled: true,
      radius,
      height,
      stepHeight: opts.stepHeight !== undefined ? opts.stepHeight : DEFAULT_STEP_HEIGHT,
      slopeLimit,
      cosSlope: Math.cos(slopeLimit * Math.PI / 180),
      mass: opts.mass !== undefined ? opts.mass : 70,
      layer: opts.layer !== undefined ? opts.layer : LAYER.CHARACTER,
      collisionMask: opts.collisionMask !== undefined ? opts.collisionMask : LAYER_SOLID,
      pushable: opts.pushable !== false,
      owner: opts.owner || null,

      position: new Vector3(),
      /** Pop-free render position: identical to `position` except the y-axis is
       *  damped for one or two frames after a step-up. */
      smoothPosition: new Vector3(),
      velocity: new Vector3(),

      grounded: false,
      coyote: 0,
      stepOffset: 0,
      lastDisplacement: new Vector3(),

      groundInfo: {
        grounded: false,
        normal: new Vector3(0, 1, 0),
        surface: 'stone',
        distance: Infinity,
        slopeAngle: 0,
        collider: null,
      },

      move(displacement, dt) { return world._moveCharacter(ch, displacement, dt); },
      jump(speed) { ch.velocity.y = speed; ch.grounded = false; ch.coyote = 0; ch.groundInfo.grounded = false; },
      canJump() { return ch.grounded || ch.coyote > 0; },
      teleport(x, y, z) {
        ch.position.set(x, y, z);
        ch.smoothPosition.copy(ch.position);
        ch.velocity.set(0, 0, 0);
        ch.grounded = false; ch.coyote = 0;
      },
      setSlopeLimit(deg) { ch.slopeLimit = deg; ch.cosSlope = Math.cos(deg * Math.PI / 180); },
      remove() { world.remove(ch); },
    };
    if (opts.position) ch.position.copy(opts.position);
    ch.smoothPosition.copy(ch.position);
    this.characters.push(ch);
    return ch;
  }

  /** Capsule segment ends, relative to the feet position. */
  _segLo(ch) { return ch.radius; }
  _segHi(ch) { return Math.max(ch.radius + 1e-4, ch.height - ch.radius); }

  /**
   * Move a character. `displacement` is the desired positional delta for this
   * frame excluding gravity; gravity, step-up, slope limiting and ground
   * snapping are handled here. Returns the (reused) groundInfo record.
   */
  _moveCharacter(ch, displacement, dt) {
    if (!ch.enabled || dt <= 0) return ch.groundInfo;
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / FIXED_DT)));
    const sdt = dt / steps;
    const dx = (displacement ? displacement.x : 0) / steps;
    const dy = (displacement ? displacement.y : 0) / steps;
    const dz = (displacement ? displacement.z : 0) / steps;
    ch.lastDisplacement.set(0, 0, 0);
    ch.stepOffset = 0;
    for (let i = 0; i < steps; i++) this._charStep(ch, dx, dy, dz, sdt);

    // Damp the render y toward the physical y so a 0.42 m stair does not pop.
    const k = 1 - Math.exp(-22 * dt);
    ch.smoothPosition.x = ch.position.x;
    ch.smoothPosition.z = ch.position.z;
    const dyv = ch.position.y - ch.smoothPosition.y;
    ch.smoothPosition.y += Math.abs(dyv) > 0.55 ? dyv : dyv * k;
    return ch.groundInfo;
  }

  _charStep(ch, dx, dy, dz, dt) {
    const lo = this._segLo(ch), hi = this._segHi(ch), r = ch.radius;
    const mask = ch.collisionMask;
    const pos = ch.position;

    // --- 0. gravity ---------------------------------------------------------
    ch.velocity.y += GRAVITY * dt;
    if (ch.velocity.y < TERMINAL_VELOCITY) ch.velocity.y = TERMINAL_VELOCITY;

    // --- 1. shove out of anything we start inside ---------------------------
    this._depenetrate(pos.x, pos.y, pos.z, lo, hi, r, mask, _dep);
    pos.set(_dep.x, _dep.y, _dep.z);

    const wasGrounded = ch.grounded || ch.coyote > 0;
    const sx = pos.x, sy = pos.y, sz = pos.z;

    // --- 2. horizontal collide-and-slide ------------------------------------
    this._slide(sx, sy, sz, lo, hi, r, dx, dy, dz, mask, ch.cosSlope, _slideA);
    let fx = _slideA.x, fy = _slideA.y, fz = _slideA.z;

    // --- 3. step-up over ledges --------------------------------------------
    // Only worth trying when we actually got stopped and we had footing.
    if (_slideA.hit && wasGrounded && ch.stepHeight > 0.01 && (dx * dx + dz * dz) > 1e-8) {
      const gained = (fx - sx) * (fx - sx) + (fz - sz) * (fz - sz);
      const wanted = dx * dx + dz * dz;
      if (gained < wanted * 0.98) {
        if (this._tryStepUp(ch, sx, sy, sz, dx, dz, lo, hi, r, mask, _slideB)) {
          const stepped = (_slideB.x - sx) * (_slideB.x - sx) + (_slideB.z - sz) * (_slideB.z - sz);
          if (stepped > gained + 1e-6) {
            ch.stepOffset = Math.max(ch.stepOffset, _slideB.y - sy);
            fx = _slideB.x; fy = _slideB.y; fz = _slideB.z;
          }
        }
      }
    }
    pos.set(fx, fy, fz);

    // --- 4. vertical ---------------------------------------------------------
    const vy = ch.velocity.y * dt;
    this._slide(pos.x, pos.y, pos.z, lo, hi, r, 0, vy, 0, mask, ch.cosSlope, _slideA);
    pos.set(_slideA.x, _slideA.y, _slideA.z);
    let landed = false;
    if (_slideA.hit) {
      if (vy <= 0) {
        if (_slideA.ny >= ch.cosSlope) { ch.velocity.y = 0; landed = true; }
        else {
          // Too steep to stand on: keep accelerating, but along the surface so
          // the character visibly slides off instead of sticking.
          const d = ch.velocity.y * _slideA.ny;
          ch.velocity.y -= d * _slideA.ny;
          const slideSpeed = -GRAVITY * dt * 0.55;
          const hl = Math.hypot(_slideA.nx, _slideA.nz) || 1;
          pos.x += (_slideA.nx / hl) * slideSpeed * dt;
          pos.z += (_slideA.nz / hl) * slideSpeed * dt;
        }
      } else {
        ch.velocity.y = 0;             // clipped the ceiling
      }
    }

    // --- 5. ground snap ------------------------------------------------------
    // Without this, walking down stairs or a convex ridge launches the capsule.
    if (!landed && wasGrounded && ch.velocity.y <= 0.05) {
      const snap = Math.min(0.55, Math.max(0.08, ch.stepHeight));
      this._sweep(pos.x, pos.y, pos.z, lo, hi, r, 0, -snap, 0, mask, _swA);
      if (_swA.hit && _swA.ny >= ch.cosSlope) {
        pos.y -= snap * _swA.t;
        ch.velocity.y = 0;
        landed = true;
      }
    }

    // --- 6. ground info ------------------------------------------------------
    this._probeGround(ch, landed);

    // --- 7. coyote time ------------------------------------------------------
    if (ch.grounded) ch.coyote = COYOTE_TIME;
    else if (ch.coyote > 0) ch.coyote = Math.max(0, ch.coyote - dt);

    ch.lastDisplacement.x += pos.x - sx;
    ch.lastDisplacement.y += pos.y - sy;
    ch.lastDisplacement.z += pos.z - sz;
    if (dt > 1e-6) {
      ch.velocity.x = (pos.x - sx) / dt;
      ch.velocity.z = (pos.z - sz) / dt;
    }
  }

  /**
   * The classic collide-and-slide: sweep, advance to the contact, project the
   * remainder onto the contact plane, repeat. Four iterations is enough to
   * resolve a corner (two walls + floor) without the residual jitter you get
   * from letting it run longer.
   */
  _slide(px, py, pz, lo, hi, r, dx, dy, dz, mask, cosSlope, out) {
    out.x = px; out.y = py; out.z = pz;
    out.hit = false; out.steep = false; out.c = null;
    out.nx = 0; out.ny = 1; out.nz = 0;
    let rx = dx, ry = dy, rz = dz;

    for (let it = 0; it < SLIDE_ITERATIONS; it++) {
      if (rx * rx + ry * ry + rz * rz < 1e-10) break;
      this._sweep(out.x, out.y, out.z, lo, hi, r, rx, ry, rz, mask, _hD);
      const t = _hD.t;
      out.x += rx * t; out.y += ry * t; out.z += rz * t;
      if (!_hD.hit) break;

      out.hit = true;
      out.nx = _hD.nx; out.ny = _hD.ny; out.nz = _hD.nz; out.c = _hD.collider;

      rx *= (1 - t); ry *= (1 - t); rz *= (1 - t);

      let nx = _hD.nx, ny = _hD.ny, nz = _hD.nz;
      if (ny < cosSlope && ny > -0.999) {
        // Steeper than the slope limit — behave like a vertical wall so the
        // character neither walks up it nor gets flung along it.
        out.steep = true;
        const hl = Math.hypot(nx, nz);
        if (hl > 1e-6) { nx /= hl; ny = 0; nz /= hl; }
      }
      const dot = rx * nx + ry * ny + rz * nz;
      rx -= nx * dot; ry -= ny * dot; rz -= nz * dot;
    }
    return out;
  }

  /**
   * up-trace → forward-trace → down-trace. Returns true and fills `out` with a
   * valid stepped-up position, or false when the ledge is too tall, the landing
   * is too steep, or there is nothing to land on.
   */
  _tryStepUp(ch, sx, sy, sz, dx, dz, lo, hi, r, mask, out) {
    const step = ch.stepHeight;

    // up
    this._sweep(sx, sy, sz, lo, hi, r, 0, step, 0, mask, _swA);
    const upDist = step * _swA.t;
    if (upDist < 0.02) return false;
    const uy = sy + upDist - 1e-3;

    // forward
    this._slide(sx, uy, sz, lo, hi, r, dx, 0, dz, mask, ch.cosSlope, out);
    const moved = (out.x - sx) * (out.x - sx) + (out.z - sz) * (out.z - sz);
    if (moved < 1e-6) return false;

    // down — a hair further than we rose so we can settle onto the ledge
    const drop = upDist + 0.02;
    this._sweep(out.x, out.y, out.z, lo, hi, r, 0, -drop, 0, mask, _swA);
    if (!_swA.hit) return false;
    if (_swA.ny < ch.cosSlope) return false;
    out.y -= drop * _swA.t;
    if (out.y < sy - 1e-3) return false;      // stepped down, not up — let gravity do it
    return true;
  }

  /** Short downward capsule probe that fills the character's groundInfo. */
  _probeGround(ch, landed) {
    const lo = this._segLo(ch), hi = this._segHi(ch), r = ch.radius;
    const gi = ch.groundInfo;
    const probe = 0.14;
    this._sweep(ch.position.x, ch.position.y, ch.position.z, lo, hi, r,
      0, -probe, 0, ch.collisionMask, _hE);
    if (_hE.hit) {
      const dist = probe * _hE.t;
      const ny = clampf(_hE.ny, -1, 1);
      gi.slopeAngle = Math.acos(ny) * 180 / Math.PI;
      gi.normal.set(_hE.nx, ny, _hE.nz);
      gi.distance = dist;
      gi.collider = _hE.collider;
      gi.surface = this._surfaceOf(_hE.collider, ch.position.x, ch.position.z);
      gi.grounded = (ny >= ch.cosSlope) && dist <= 0.06;
    } else {
      gi.grounded = false;
      gi.distance = Infinity;
      gi.slopeAngle = 0;
      gi.normal.set(0, 1, 0);
      gi.collider = null;
      gi.surface = this._terrainSurface(ch.position.x, ch.position.z);
    }
    if (landed) gi.grounded = gi.grounded || _hE.hit;
    ch.grounded = gi.grounded;
    return gi;
  }

  /**
   * Soft radial separation between character capsules so a pack of oni cannot
   * occupy the same metre. Mass-weighted: the heavier body yields less, which
   * keeps the player from being shoved around by three lightweight enemies.
   */
  _resolveCharacterOverlaps(dt) {
    const list = this.characters;
    const n = list.length;
    if (n < 2) return;
    const k = 1 - Math.exp(-16 * dt);
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (!a.enabled || !a.pushable) continue;
      const aTop = a.position.y + a.height;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (!b.enabled || !b.pushable) continue;
        const bTop = b.position.y + b.height;
        // Vertical overlap first — standing on someone's head should not push.
        if (a.position.y > bTop || b.position.y > aTop) continue;
        let dx = b.position.x - a.position.x;
        let dz = b.position.z - a.position.z;
        const rr = a.radius + b.radius;
        let d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Perfectly stacked: nudge along a deterministic axis derived from ids.
          const ang = ((a.id * 2654435761) % 1000) / 1000 * Math.PI * 2;
          dx = Math.cos(ang); dz = Math.sin(ang); d = 1;
        } else { dx /= d; dz /= d; }
        const pen = (rr - d) * k;
        const ma = a.mass > 0 ? a.mass : 1, mb = b.mass > 0 ? b.mass : 1;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.position.x -= dx * pen * wa; a.position.z -= dz * pen * wa;
        b.position.x += dx * pen * wb; b.position.z += dz * pen * wb;
        a.smoothPosition.x = a.position.x; a.smoothPosition.z = a.position.z;
        b.smoothPosition.x = b.position.x; b.smoothPosition.z = b.position.z;
      }
    }
  }

  // ==================================================== 5. rigid body props

  /**
   * Add a knock-around prop: bamboo culms, lanterns, buckets, dropped weapons,
   * cut debris. Deliberately light — isotropic inertia, bounding-sphere
   * body/body contacts — because these exist to sell impact, not to be
   * simulated furniture.
   */
  addDynamic(desc = {}) {
    if (this.bodies.length >= this.maxBodies) this._retireOldestBody();
    const kind = desc.type === 'box' ? 'box' : 'sphere';
    const mass = desc.mass !== undefined ? desc.mass : 4;
    const b = {
      id: _idCounter++,
      _phkind: 'body',
      kind,
      enabled: true,
      layer: desc.layer !== undefined ? desc.layer : LAYER.PROP,
      collisionMask: desc.collisionMask !== undefined ? desc.collisionMask : LAYER_SOLID,
      surface: desc.surface || 'wood',
      owner: desc.owner || null,
      object3D: desc.object3D || null,

      position: new Vector3(),
      prevPosition: new Vector3(),
      velocity: new Vector3(),
      quaternion: new Quaternion(),
      prevQuaternion: new Quaternion(),
      angularVelocity: new Vector3(),

      radius: desc.radius !== undefined ? desc.radius : 0.2,
      half: new Vector3(0.2, 0.2, 0.2),
      boundRadius: 0.2,

      mass,
      invMass: mass > 0 ? 1 / mass : 0,
      invInertia: 0,
      restitution: desc.restitution !== undefined ? desc.restitution : 0.18,
      friction: desc.friction !== undefined ? desc.friction : 0.62,
      linearDamping: desc.linearDamping !== undefined ? desc.linearDamping : 0.06,
      angularDamping: desc.angularDamping !== undefined ? desc.angularDamping : 0.14,

      sleeping: false,
      sleepTimer: 0,
      age: 0,
      ttl: desc.ttl !== undefined ? desc.ttl : 0,
      spawnOrder: this._spawnCounter++,
    };
    if (desc.position) b.position.copy(desc.position);
    if (desc.quaternion) b.quaternion.copy(desc.quaternion);
    if (desc.velocity) b.velocity.copy(desc.velocity);
    if (desc.angularVelocity) b.angularVelocity.copy(desc.angularVelocity);
    if (desc.halfExtents) b.half.copy(desc.halfExtents);
    else if (desc.size) b.half.set(desc.size.x * 0.5, desc.size.y * 0.5, desc.size.z * 0.5);
    else b.half.setScalar(b.radius);

    if (kind === 'box') {
      b.boundRadius = b.half.length();
      const i = (mass / 12) * (4 * (b.half.x * b.half.x + b.half.y * b.half.y + b.half.z * b.half.z) / 3);
      b.invInertia = i > 0 ? 1 / i : 0;
    } else {
      b.boundRadius = b.radius;
      const i = 0.4 * mass * b.radius * b.radius;
      b.invInertia = i > 0 ? 1 / i : 0;
    }
    b.prevPosition.copy(b.position);
    b.prevQuaternion.copy(b.quaternion);

    this.bodies.push(b);
    this.stats.dynamics = this.bodies.length;
    return b;
  }

  _retireOldestBody() {
    if (!this.bodies.length) return;
    let oldest = 0;
    for (let i = 1; i < this.bodies.length; i++) {
      if (this.bodies[i].spawnOrder < this.bodies[oldest].spawnOrder) oldest = i;
    }
    const b = this.bodies[oldest];
    b.enabled = false;
    if (b.onRetire) b.onRetire(b);
    this.bodies.splice(oldest, 1);
    this.stats.dynamics = this.bodies.length;
  }

  /** Apply an impulse at a world point (defaults to the centre of mass). */
  applyImpulse(body, ix, iy, iz, px, py, pz) {
    if (!body || !body.enabled) return;
    body.sleeping = false; body.sleepTimer = 0;
    body.velocity.x += ix * body.invMass;
    body.velocity.y += iy * body.invMass;
    body.velocity.z += iz * body.invMass;
    if (px !== undefined) {
      const rx = px - body.position.x, ry = py - body.position.y, rz = pz - body.position.z;
      body.angularVelocity.x += (ry * iz - rz * iy) * body.invInertia;
      body.angularVelocity.y += (rz * ix - rx * iz) * body.invInertia;
      body.angularVelocity.z += (rx * iy - ry * ix) * body.invInertia;
    }
  }

  /** Wake everything within `radius` and shove it outward — sword impacts. */
  explode(center, radius, strength) {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.enabled) continue;
      const dx = b.position.x - center.x, dy = b.position.y - center.y, dz = b.position.z - center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const f = strength * (1 - d / radius);
      this.applyImpulse(b, (dx / d) * f, (dy / d) * f + f * 0.35, (dz / d) * f,
        b.position.x, b.position.y, b.position.z);
    }
  }

  _contact() {
    let c = this._contacts[this._contactCount];
    if (!c) {
      c = {
        a: null, b: null,
        nx: 0, ny: 1, nz: 0,
        rax: 0, ray: 0, raz: 0,
        rbx: 0, rby: 0, rbz: 0,
        depth: 0, restitution: 0, friction: 0,
        jn: 0, jt: 0,
      };
      this._contacts[this._contactCount] = c;
    }
    this._contactCount++;
    return c;
  }

  _stepBodies(dt) {
    const bodies = this.bodies;
    const n = bodies.length;
    if (!n) return;

    // --- integrate ----------------------------------------------------------
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.age += dt;
      b.prevPosition.copy(b.position);
      b.prevQuaternion.copy(b.quaternion);
      if (b.sleeping || !b.enabled) continue;
      b.velocity.y += GRAVITY * dt;
      const ld = Math.max(0, 1 - b.linearDamping * dt);
      const ad = Math.max(0, 1 - b.angularDamping * dt);
      b.velocity.multiplyScalar(ld);
      b.angularVelocity.multiplyScalar(ad);
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;
      const w = b.angularVelocity;
      const wl = w.length();
      if (wl > 1e-5) {
        _q0.setFromAxisAngle(_v0.set(w.x / wl, w.y / wl, w.z / wl), wl * dt);
        b.quaternion.premultiply(_q0).normalize();
      }
    }

    // --- contacts -----------------------------------------------------------
    this._contactCount = 0;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.enabled || b.sleeping) continue;
      this._bodyWorldContacts(b);
    }
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (!a.enabled) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (!b.enabled) continue;
        if (a.sleeping && b.sleeping) continue;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dz = b.position.z - a.position.z;
        const rr = a.boundRadius + b.boundRadius;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-5;
        const c = this._contact();
        c.a = a; c.b = b;
        c.nx = dx / d; c.ny = dy / d; c.nz = dz / d;
        c.depth = rr - d;
        c.rax = c.nx * a.boundRadius; c.ray = c.ny * a.boundRadius; c.raz = c.nz * a.boundRadius;
        c.rbx = -c.nx * b.boundRadius; c.rby = -c.ny * b.boundRadius; c.rbz = -c.nz * b.boundRadius;
        c.restitution = Math.min(a.restitution, b.restitution);
        c.friction = Math.sqrt(a.friction * b.friction);
        c.jn = 0; c.jt = 0;
        a.sleeping = false; b.sleeping = false;
      }
    }

    // --- solve --------------------------------------------------------------
    for (let it = 0; it < 4; it++) this._solveContacts(dt);

    // --- sleeping -----------------------------------------------------------
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.enabled || b.sleeping) continue;
      const e = b.velocity.lengthSq() + b.angularVelocity.lengthSq() * 0.25;
      if (e < 0.035) {
        b.sleepTimer += dt;
        if (b.sleepTimer > 0.55) {
          b.sleeping = true;
          b.velocity.set(0, 0, 0);
          b.angularVelocity.set(0, 0, 0);
        }
      } else {
        b.sleepTimer = 0;
      }
    }

    // --- lifetime -----------------------------------------------------------
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.ttl > 0 && b.age > b.ttl) {
        b.enabled = false;
        if (b.onRetire) b.onRetire(b);
        bodies.splice(i, 1);
      }
    }
    this.stats.dynamics = bodies.length;
  }

  /** Contacts between one body and the static world. */
  _bodyWorldContacts(b) {
    const mask = b.collisionMask;
    const br = b.boundRadius + 0.05;
    this._gather(b.position.x - br, b.position.y - br, b.position.z - br,
      b.position.x + br, b.position.y + br, b.position.z + br, mask);

    if (b.kind === 'sphere') {
      this._closestWorld(b.position.x, b.position.y, b.position.z,
        b.position.x, b.position.y, b.position.z, b.radius, mask, _hF);
      if (_hF.c && _hF.d < 0) this._pushWorldContact(b, _hF, 0, 0, 0);
      return;
    }

    // Box: eight corners is crude but stable enough for a lantern, and it
    // resolves the resting-on-an-edge case that a bounding sphere cannot.
    _m0.makeRotationFromQuaternion(b.quaternion);
    const e = _m0.elements;
    const hx = b.half.x, hy = b.half.y, hz = b.half.z;
    for (let k = 0; k < 8; k++) {
      const sx = (k & 1) ? 1 : -1, sy = (k & 2) ? 1 : -1, sz = (k & 4) ? 1 : -1;
      const lx = hx * sx, ly = hy * sy, lz = hz * sz;
      const wx = e[0] * lx + e[4] * ly + e[8] * lz;
      const wy = e[1] * lx + e[5] * ly + e[9] * lz;
      const wz = e[2] * lx + e[6] * ly + e[10] * lz;
      const px = b.position.x + wx, py = b.position.y + wy, pz = b.position.z + wz;
      this._closestWorld(px, py, pz, px, py, pz, 0, mask, _hF);
      if (_hF.c && _hF.d < 0) this._pushWorldContact(b, _hF, wx, wy, wz);
    }
  }

  _pushWorldContact(b, h, rx, ry, rz) {
    const c = this._contact();
    c.a = b; c.b = null;
    c.nx = h.nx; c.ny = h.ny; c.nz = h.nz;
    c.depth = -h.d;
    c.rax = rx; c.ray = ry; c.raz = rz;
    c.rbx = 0; c.rby = 0; c.rbz = 0;
    c.restitution = b.restitution;
    c.friction = b.friction * 0.9;
    c.jn = 0; c.jt = 0;
    b.sleeping = false;
  }

  /**
   * One sequential-impulse pass. The Baumgarte bias is applied on *every*
   * iteration (Box2D-lite style) — applying it once and then solving for
   * vn = 0 in the following iterations simply cancels the push-out again,
   * which is how bodies end up slowly sinking through the floor.
   */
  _solveContacts(dt) {
    const SLOP = 0.004, BETA = 0.2, MAX_BIAS = 3, REST_THRESHOLD = 1.1;
    for (let i = 0; i < this._contactCount; i++) {
      const c = this._contacts[i];
      const a = c.a, b = c.b;
      const nx = c.nx, ny = c.ny, nz = c.nz;

      // Relative velocity at the contact.
      let vx = a.velocity.x + (a.angularVelocity.y * c.raz - a.angularVelocity.z * c.ray);
      let vy = a.velocity.y + (a.angularVelocity.z * c.rax - a.angularVelocity.x * c.raz);
      let vz = a.velocity.z + (a.angularVelocity.x * c.ray - a.angularVelocity.y * c.rax);
      if (b) {
        vx -= b.velocity.x + (b.angularVelocity.y * c.rbz - b.angularVelocity.z * c.rby);
        vy -= b.velocity.y + (b.angularVelocity.z * c.rbx - b.angularVelocity.x * c.rbz);
        vz -= b.velocity.z + (b.angularVelocity.x * c.rby - b.angularVelocity.y * c.rbx);
      }
      const vn = vx * nx + vy * ny + vz * nz;

      // Effective mass along the normal.
      const ranx = c.ray * nz - c.raz * ny;
      const rany = c.raz * nx - c.rax * nz;
      const ranz = c.rax * ny - c.ray * nx;
      let denom = a.invMass + a.invInertia * (ranx * ranx + rany * rany + ranz * ranz);
      let rbnx = 0, rbny = 0, rbnz = 0;
      if (b) {
        rbnx = c.rby * nz - c.rbz * ny;
        rbny = c.rbz * nx - c.rbx * nz;
        rbnz = c.rbx * ny - c.rby * nx;
        denom += b.invMass + b.invInertia * (rbnx * rbnx + rbny * rbny + rbnz * rbnz);
      }
      if (denom < 1e-9) continue;

      const e = (-vn > REST_THRESHOLD) ? c.restitution : 0;
      const bias = Math.min(MAX_BIAS, (BETA / dt) * Math.max(0, c.depth - SLOP));
      let jn = (-(1 + e) * vn + bias) / denom;
      const oldJn = c.jn;
      c.jn = Math.max(0, oldJn + jn);
      jn = c.jn - oldJn;

      this._applyContactImpulse(c, nx * jn, ny * jn, nz * jn);

      // --- friction ---------------------------------------------------------
      vx = a.velocity.x + (a.angularVelocity.y * c.raz - a.angularVelocity.z * c.ray);
      vy = a.velocity.y + (a.angularVelocity.z * c.rax - a.angularVelocity.x * c.raz);
      vz = a.velocity.z + (a.angularVelocity.x * c.ray - a.angularVelocity.y * c.rax);
      if (b) {
        vx -= b.velocity.x + (b.angularVelocity.y * c.rbz - b.angularVelocity.z * c.rby);
        vy -= b.velocity.y + (b.angularVelocity.z * c.rbx - b.angularVelocity.x * c.rbz);
        vz -= b.velocity.z + (b.angularVelocity.x * c.rby - b.angularVelocity.y * c.rbx);
      }
      const vnn = vx * nx + vy * ny + vz * nz;
      let tx = vx - nx * vnn, ty = vy - ny * vnn, tz = vz - nz * vnn;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tl < 1e-6) continue;
      tx /= tl; ty /= tl; tz /= tl;

      const ratx = c.ray * tz - c.raz * ty;
      const raty = c.raz * tx - c.rax * tz;
      const ratz = c.rax * ty - c.ray * tx;
      let tdenom = a.invMass + a.invInertia * (ratx * ratx + raty * raty + ratz * ratz);
      if (b) {
        const rbtx = c.rby * tz - c.rbz * ty;
        const rbty = c.rbz * tx - c.rbx * tz;
        const rbtz = c.rbx * ty - c.rby * tx;
        tdenom += b.invMass + b.invInertia * (rbtx * rbtx + rbty * rbty + rbtz * rbtz);
      }
      if (tdenom < 1e-9) continue;
      let jt = -tl / tdenom;
      const maxT = c.friction * c.jn;
      const oldJt = c.jt;
      c.jt = clampf(oldJt + jt, -maxT, maxT);
      jt = c.jt - oldJt;
      this._applyContactImpulse(c, tx * jt, ty * jt, tz * jt);
    }
  }

  _applyContactImpulse(c, ix, iy, iz) {
    const a = c.a, b = c.b;
    a.velocity.x += ix * a.invMass;
    a.velocity.y += iy * a.invMass;
    a.velocity.z += iz * a.invMass;
    a.angularVelocity.x += (c.ray * iz - c.raz * iy) * a.invInertia;
    a.angularVelocity.y += (c.raz * ix - c.rax * iz) * a.invInertia;
    a.angularVelocity.z += (c.rax * iy - c.ray * ix) * a.invInertia;
    if (b) {
      b.velocity.x -= ix * b.invMass;
      b.velocity.y -= iy * b.invMass;
      b.velocity.z -= iz * b.invMass;
      b.angularVelocity.x -= (c.rby * iz - c.rbz * iy) * b.invInertia;
      b.angularVelocity.y -= (c.rbz * ix - c.rbx * iz) * b.invInertia;
      b.angularVelocity.z -= (c.rbx * iy - c.rby * ix) * b.invInertia;
    }
  }

  /**
   * Interpolated transform for the visual layer. Reads `alpha` so a 30 fps
   * phone still shows smooth motion from the 60 Hz simulation.
   */
  getInterpolatedTransform(body, outPos, outQuat) {
    const a = this.alpha;
    if (outPos) outPos.lerpVectors(body.prevPosition, body.position, a);
    if (outQuat) outQuat.copy(body.prevQuaternion).slerp(body.quaternion, a);
  }

  // ========================================================== 6. ragdolls

  /** Resolve the rig's bones into our canonical joint names. */
  _collectBones(rig, explicitMap) {
    const found = Object.create(null);
    if (explicitMap) {
      for (const k in explicitMap) if (explicitMap[k]) found[k] = explicitMap[k];
      return found;
    }
    const byName = new Map();
    const visit = (o) => {
      if (!o) return;
      if (o.name) {
        const n = normaliseBoneName(o.name);
        if (!byName.has(n)) byName.set(n, o);
      }
      const kids = o.children;
      if (kids) for (let i = 0; i < kids.length; i++) visit(kids[i]);
    };
    const candidates = [];
    if (rig) {
      if (Array.isArray(rig.bones)) candidates.push(...rig.bones);
      else if (rig.bones && typeof rig.bones === 'object') {
        for (const k in rig.bones) candidates.push(rig.bones[k]);
      }
      if (rig.skeleton && Array.isArray(rig.skeleton.bones)) candidates.push(...rig.skeleton.bones);
      if (rig.root) candidates.push(rig.root);
      if (rig.isObject3D) candidates.push(rig);
    }
    for (let i = 0; i < candidates.length; i++) visit(candidates[i]);

    for (const joint in BONE_ALIASES) {
      const aliases = BONE_ALIASES[joint];
      for (let i = 0; i < aliases.length; i++) {
        const b = byName.get(aliases[i]);
        if (b) { found[joint] = b; break; }
      }
    }
    return found;
  }

  /**
   * Build a ragdoll from a rig: a particle-and-link skeleton where each link is
   * a capsule, joints are distance constraints, and cone-twist limits fall out
   * of an inequality distance constraint across each joint (plus an explicit
   * twist clamp when the pose is written back onto the bones).
   *
   * Returns null when the tier has ragdolls disabled or the rig cannot be
   * matched — callers must handle that and fall back to a death animation.
   */
  createRagdoll(rig, opts = {}) {
    const q = this.ctx && this.ctx.quality;
    if (q && q.ragdoll === false) return null;
    if (this.maxRagdolls <= 0) return null;

    const bones = this._collectBones(rig, opts.boneMap);
    let matched = 0;
    for (const k in bones) matched++;
    if (matched < 5 || !bones.hips) return null;

    const particles = [];
    const index = Object.create(null);
    const links = [];
    const constraints = [];

    // --- particles ----------------------------------------------------------
    for (let i = 0; i < RAG_BONES.length; i++) {
      const spec = RAG_BONES[i];
      let px = 0, py = 0, pz = 0;
      if (spec.tip) {
        const a = index[spec.tip[0]], b = index[spec.tip[1]];
        if (a === undefined || b === undefined) continue;
        const pa = particles[a], pb = particles[b];
        px = pb.x + (pb.x - pa.x) * spec.tip[2];
        py = pb.y + (pb.y - pa.y) * spec.tip[2];
        pz = pb.z + (pb.z - pa.z) * spec.tip[2];
      } else {
        const bone = bones[spec.j];
        if (!bone) continue;
        bone.updateWorldMatrix(true, false);
        bone.getWorldPosition(_v0);
        px = _v0.x; py = _v0.y; pz = _v0.z;
      }
      index[spec.j] = particles.length;
      particles.push({
        name: spec.j, x: px, y: py, z: pz,
        px, py, pz,
        vx: 0, vy: 0, vz: 0,
        invMass: 0, mass: 0, r: spec.r,
      });
    }

    // --- links + distance constraints --------------------------------------
    for (let i = 0; i < RAG_BONES.length; i++) {
      const spec = RAG_BONES[i];
      if (spec.p === null) continue;
      const ci = index[spec.j], pi = index[spec.p];
      if (ci === undefined || pi === undefined) continue;
      const a = particles[pi], b = particles[ci];
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (len < 1e-4) continue;

      const half = spec.m * 0.5;
      a.mass += half; b.mass += half;

      const bone = bones[spec.p] || null;
      const link = {
        a: pi, b: ci, rest: len, radius: spec.r,
        bone, boneName: spec.p,
        restDir: new Vector3((b.x - a.x) / len, (b.y - a.y) / len, (b.z - a.z) / len),
        restWorldQuat: new Quaternion(),
        animQuat: new Quaternion(),
        localAxis: new Vector3(0, 1, 0),
        twist: (spec.twist !== undefined ? spec.twist : 30) * Math.PI / 180,
        parentLink: -1,
      };
      if (bone) {
        bone.updateWorldMatrix(true, false);
        bone.getWorldQuaternion(link.restWorldQuat);
        link.animQuat.copy(bone.quaternion);
        // The bone's local twist axis is its rest direction pulled into local space.
        link.localAxis.copy(link.restDir)
          .applyQuaternion(_q0.copy(link.restWorldQuat).invert()).normalize();
        if (!isFinite(link.localAxis.x)) link.localAxis.set(0, 1, 0);
      }
      links.push(link);
      constraints.push({ i: pi, j: ci, min: len, max: len });
    }
    for (let i = 0; i < links.length; i++) {
      for (let k = 0; k < links.length; k++) {
        if (links[k].b === links[i].a) { links[i].parentLink = k; break; }
      }
    }

    // --- cone limits as inequality distance constraints ---------------------
    for (let i = 0; i < RAG_BONES.length; i++) {
      const spec = RAG_BONES[i];
      if (spec.p === null || spec.cone === undefined) continue;
      const ci = index[spec.j], pi = index[spec.p];
      if (ci === undefined || pi === undefined) continue;
      // Grandparent joint.
      let gp = null;
      for (let k = 0; k < RAG_BONES.length; k++) {
        if (RAG_BONES[k].j === spec.p) { gp = RAG_BONES[k].p; break; }
      }
      if (!gp) continue;
      const gi = index[gp];
      if (gi === undefined) continue;
      const A = particles[gi], B = particles[pi], C = particles[ci];
      const l1 = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      const l2 = Math.hypot(C.x - B.x, C.y - B.y, C.z - B.z);
      const cone = clampf(spec.cone, 1, 170) * Math.PI / 180;
      const bend = clampf(spec.bend || 0, 0, 170) * Math.PI / 180;
      const minD = Math.sqrt(Math.max(1e-6, l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(cone)));
      const maxD = Math.sqrt(Math.max(1e-6, l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(bend)));
      constraints.push({ i: gi, j: ci, min: minD, max: Math.max(minD + 1e-4, maxD) });
    }

    // --- masses -------------------------------------------------------------
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.mass <= 0) p.mass = 1;
      p.invMass = 1 / p.mass;
    }

    const rd = {
      id: _idCounter++,
      _phkind: 'ragdoll',
      enabled: true,
      rig,
      bones,
      particles,
      links,
      constraints,
      index,
      layer: opts.layer !== undefined ? opts.layer : LAYER.CHARACTER,
      collisionMask: opts.collisionMask !== undefined ? opts.collisionMask : LAYER_SOLID,
      owner: opts.owner || null,

      blend: 0,
      blendTime: opts.blendTime !== undefined ? opts.blendTime : 0.15,
      age: 0,
      lowMotion: 0,
      frozen: false,
      fade: 1,
      fadeTime: opts.fadeTime !== undefined ? opts.fadeTime : 2.0,
      done: false,
      spawnOrder: this._spawnCounter++,

      launch: (dir, strength) => this._launchRagdoll(rd, dir, strength),
      freeze: () => { rd.frozen = true; },
      remove: () => this.remove(rd),
    };

    if (opts.velocity) {
      for (let i = 0; i < particles.length; i++) {
        particles[i].vx = opts.velocity.x;
        particles[i].vy = opts.velocity.y;
        particles[i].vz = opts.velocity.z;
      }
    }
    if (opts.impulse && opts.impulse.direction) {
      this._launchRagdoll(rd, opts.impulse.direction, opts.impulse.strength || 4);
    }

    while (this.ragdolls.length >= this.maxRagdolls) this._freezeOldestRagdoll(true);
    this.ragdolls.push(rd);
    this.stats.ragdolls = this.ragdolls.length;
    return rd;
  }

  _launchRagdoll(rd, dir, strength) {
    const s = strength !== undefined ? strength : 4;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    for (let i = 0; i < rd.particles.length; i++) {
      const p = rd.particles[i];
      // Upper body takes more of the hit so the body folds instead of skidding.
      const bias = (p.name.indexOf('Leg') >= 0 || p.name.indexOf('foot') >= 0) ? 0.45 : 1;
      p.vx += (dir.x / l) * s * bias;
      p.vy += (dir.y / l) * s * bias + s * 0.18;
      p.vz += (dir.z / l) * s * bias;
    }
    rd.frozen = false;
    rd.lowMotion = 0;
  }

  _freezeOldestRagdoll(drop = false) {
    if (!this.ragdolls.length) return;
    let oldest = 0;
    for (let i = 1; i < this.ragdolls.length; i++) {
      if (this.ragdolls[i].spawnOrder < this.ragdolls[oldest].spawnOrder) oldest = i;
    }
    const rd = this.ragdolls[oldest];
    rd.frozen = true;
    if (drop) { rd.done = true; rd.fade = 0; this.ragdolls.splice(oldest, 1); }
    this.stats.ragdolls = this.ragdolls.length;
  }

  _stepRagdolls(dt) {
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const rd = this.ragdolls[i];
      rd.age += dt;
      if (rd.blend < 1) rd.blend = Math.min(1, rd.blend + dt / Math.max(1e-3, rd.blendTime));
      if (!rd.frozen) this._simulateRagdoll(rd, dt);
      else if (rd.fade > 0) {
        rd.fade = Math.max(0, rd.fade - dt / Math.max(1e-3, rd.fadeTime));
        if (rd.fade === 0) rd.done = true;
      }
      this._applyRagdoll(rd);
    }
    this.stats.ragdolls = this.ragdolls.length;
  }

  _simulateRagdoll(rd, dt) {
    const ps = rd.particles;
    const n = ps.length;

    // 1. integrate velocities
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      p.vy += GRAVITY * dt;
      const d = Math.max(0, 1 - 0.9 * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      if (p.vy < TERMINAL_VELOCITY) p.vy = TERMINAL_VELOCITY;
    }

    // 2. sequential impulses on the joint constraints
    const cs = rd.constraints;
    const beta = 0.25 / dt;
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        const a = ps[c.i], b = ps[c.j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-6) continue;
        dx /= L; dy /= L; dz /= L;
        const C = L < c.min ? L - c.min : (L > c.max ? L - c.max : 0);
        if (C === 0) continue;
        const relv = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy + (b.vz - a.vz) * dz;
        const im = a.invMass + b.invMass;
        if (im < 1e-9) continue;
        const lambda = (-beta * C - relv) / im;
        a.vx -= dx * lambda * a.invMass; a.vy -= dy * lambda * a.invMass; a.vz -= dz * lambda * a.invMass;
        b.vx += dx * lambda * b.invMass; b.vy += dy * lambda * b.invMass; b.vz += dz * lambda * b.invMass;
      }
    }

    // 3. integrate positions
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }

    // 4. world collision, one sphere per particle
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const r = p.r;
      this._gather(p.x - r - 0.05, p.y - r - 0.05, p.z - r - 0.05,
        p.x + r + 0.05, p.y + r + 0.05, p.z + r + 0.05, rd.collisionMask);
      this._closestWorld(p.x, p.y, p.z, p.x, p.y, p.z, r, rd.collisionMask, _hF);
      if (!_hF.c || _hF.d >= 0) continue;
      const push = -_hF.d;
      p.x += _hF.nx * push; p.y += _hF.ny * push; p.z += _hF.nz * push;
      const vn = p.vx * _hF.nx + p.vy * _hF.ny + p.vz * _hF.nz;
      if (vn < 0) {
        p.vx -= _hF.nx * vn * 1.15;
        p.vy -= _hF.ny * vn * 1.15;
        p.vz -= _hF.nz * vn * 1.15;
        // Coulomb-ish friction so limbs do not skate across wet stone.
        p.vx *= 0.62; p.vz *= 0.62;
      }
    }

    // 5. two position passes so the limbs never visibly stretch
    for (let it = 0; it < 2; it++) {
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        const a = ps[c.i], b = ps[c.j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-6) continue;
        const C = L < c.min ? L - c.min : (L > c.max ? L - c.max : 0);
        if (C === 0) continue;
        const im = a.invMass + b.invMass;
        if (im < 1e-9) continue;
        const s = (C / L) * 0.7 / im;
        a.x += dx * s * a.invMass; a.y += dy * s * a.invMass; a.z += dz * s * a.invMass;
        b.x -= dx * s * b.invMass; b.y -= dy * s * b.invMass; b.z -= dz * s * b.invMass;
      }
    }

    // 6. sleep / freeze budget
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      energy += p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
    }
    energy /= n;
    if (energy < 0.09) rd.lowMotion += dt; else rd.lowMotion = 0;
    if (rd.lowMotion > 3) {
      rd.frozen = true;
      for (let i = 0; i < n; i++) { ps[i].vx = 0; ps[i].vy = 0; ps[i].vz = 0; }
    }
  }

  /** Write the simulated pose back onto the rig, blended over ~0.15 s. */
  _applyRagdoll(rd) {
    const t = rd.blend;
    if (t <= 0) return;
    const ps = rd.particles;

    // Root translation first — everything else is rotation in its parent space.
    const hips = rd.bones.hips;
    const hipsIdx = rd.index.hips;
    if (hips && hipsIdx !== undefined) {
      const p = ps[hipsIdx];
      _v1.set(p.x, p.y, p.z);
      if (hips.parent) {
        hips.parent.updateWorldMatrix(true, false);
        _m0.copy(hips.parent.matrixWorld).invert();
        _v1.applyMatrix4(_m0);
      }
      hips.position.lerp(_v1, t);
    }

    for (let i = 0; i < rd.links.length; i++) {
      const link = rd.links[i];
      const bone = link.bone;
      if (!bone) continue;
      const a = ps[link.a], b = ps[link.b];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 1e-6) continue;
      dx /= l; dy /= l; dz /= l;

      _q0.setFromUnitVectors(link.restDir, _v2.set(dx, dy, dz));
      _q1.copy(_q0).multiply(link.restWorldQuat);          // desired world rotation
      if (bone.parent) {
        bone.parent.updateWorldMatrix(true, false);
        bone.parent.getWorldQuaternion(_q2);
        _q1.premultiply(_q2.invert());
      }
      clampTwist(_q1, link.localAxis.x, link.localAxis.y, link.localAxis.z, link.twist);
      bone.quaternion.slerp(_q1, t);
      bone.updateMatrix();
    }
  }

  // ================================================= 7. system lifecycle

  update(dt) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    this.stats.broadphaseChecks = 0;
    this.stats.narrowphaseChecks = 0;
    if (this._hashDirty) this._rebuildHash();

    const step = Math.min(dt, 0.25);
    this.accumulator += step;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this._stepBodies(FIXED_DT);
      this._stepRagdolls(FIXED_DT);
      this.accumulator -= FIXED_DT;
      this.time += FIXED_DT;
      steps++;
    }
    // Never let the accumulator spiral: a phone that drops to 12 fps should run
    // slow, not stall trying to catch up.
    if (steps === MAX_SUBSTEPS && this.accumulator > FIXED_DT) this.accumulator = 0;
    this.alpha = this.accumulator / FIXED_DT;

    this._resolveCharacterOverlaps(step);

    this.stats.statics = this.statics.length;
    this.stats.dynamics = this.bodies.length;
    this.stats.ragdolls = this.ragdolls.length;
    this.stats.ms = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
  }

  lateUpdate() {
    // Push interpolated body transforms onto any attached meshes.
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.object3D) continue;
      this.getInterpolatedTransform(b, b.object3D.position, b.object3D.quaternion);
    }
    if (this._debugEnabled) this._updateDebugDynamic();
  }

  // ==================================================== 8. debug wireframes

  /**
   * Toggle a wireframe of every collider. Statics are baked once per level
   * version; characters, bodies and ragdolls refresh into a fixed-capacity
   * buffer each frame, so toggling costs nothing while it is off.
   */
  debugDraw(scene, enabled = true) {
    this._debugEnabled = !!enabled;
    if (!enabled) {
      if (this._debug) {
        if (this._debug.statics.parent) this._debug.statics.parent.remove(this._debug.statics);
        if (this._debug.dynamic.parent) this._debug.dynamic.parent.remove(this._debug.dynamic);
      }
      return this._debug;
    }
    if (!scene) return this._debug;
    this._debugScene = scene;

    if (!this._debug) {
      const sg = new BufferGeometry();
      sg.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
      const sm = new LineBasicMaterial({ color: 0x4e6b3c, depthTest: true, transparent: true, opacity: 0.75 });
      const statics = new LineSegments(sg, sm);
      statics.frustumCulled = false;
      statics.name = 'physics-debug-static';

      const cap = 60000;
      const dg = new BufferGeometry();
      dg.setAttribute('position', new BufferAttribute(new Float32Array(cap), 3));
      const dm = new LineBasicMaterial({ color: 0xc8321e, depthTest: false, transparent: true, opacity: 0.9 });
      const dynamic = new LineSegments(dg, dm);
      dynamic.frustumCulled = false;
      dynamic.renderOrder = 999;
      dynamic.name = 'physics-debug-dynamic';

      this._debug = { statics, dynamic, cap };
    }
    if (this._debug.statics.parent !== scene) scene.add(this._debug.statics);
    if (this._debug.dynamic.parent !== scene) scene.add(this._debug.dynamic);
    if (this._debugStaticVersion !== this.levelVersion) this._buildDebugStatics();
    return this._debug;
  }

  _buildDebugStatics() {
    const arr = [];
    _sink.arr = arr; _sink.buf = null; _sink.i = 0; _sink.cap = Infinity;
    for (let i = 0; i < this.statics.length; i++) {
      const c = this.statics[i];
      if (!c.enabled) continue;
      switch (c.kind) {
        case 'sphere': dbgSphere(c.cx, c.cy, c.cz, c.r); break;
        case 'capsule': dbgCapsule(c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r); break;
        case 'box': dbgBox(c); break;
        case 'triangleMesh': dbgMesh(c.bvh); break;
        default: break;
      }
    }
    _sink.arr = null;
    const g = this._debug.statics.geometry;
    g.setAttribute('position', new BufferAttribute(new Float32Array(arr), 3));
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();
    this._debugStaticVersion = this.levelVersion;
  }

  _updateDebugDynamic() {
    if (!this._debug) return;
    const attr = this._debug.dynamic.geometry.attributes.position;
    _sink.arr = null; _sink.buf = attr.array; _sink.i = 0; _sink.cap = this._debug.cap;

    for (let i = 0; i < this.characters.length; i++) {
      const ch = this.characters[i];
      if (!ch.enabled) continue;
      const p = ch.position;
      dbgCapsule(p.x, p.y + this._segLo(ch), p.z, p.x, p.y + this._segHi(ch), p.z, ch.radius);
      const gi = ch.groundInfo;
      if (gi.grounded) {
        emitLine(p.x, p.y, p.z,
          p.x + gi.normal.x * 0.5, p.y + gi.normal.y * 0.5, p.z + gi.normal.z * 0.5);
      }
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.enabled) continue;
      if (b.kind === 'sphere') dbgSphere(b.position.x, b.position.y, b.position.z, b.radius);
      else dbgBodyBox(b);
    }
    for (let i = 0; i < this.ragdolls.length; i++) {
      const rd = this.ragdolls[i];
      for (let k = 0; k < rd.links.length; k++) {
        const l = rd.links[k];
        const a = rd.particles[l.a], b = rd.particles[l.b];
        dbgCapsule(a.x, a.y, a.z, b.x, b.y, b.z, l.radius);
      }
    }

    attr.needsUpdate = true;
    this._debug.dynamic.geometry.setDrawRange(0, _sink.i / 3);
    _sink.buf = null;
  }

  dispose() {
    if (this._debug) {
      const { statics, dynamic } = this._debug;
      if (statics.parent) statics.parent.remove(statics);
      if (dynamic.parent) dynamic.parent.remove(dynamic);
      statics.geometry.dispose(); statics.material.dispose();
      dynamic.geometry.dispose(); dynamic.material.dispose();
      this._debug = null;
    }
    this.statics.length = 0;
    this.bodies.length = 0;
    this.characters.length = 0;
    this.ragdolls.length = 0;
    this._contacts.length = 0;
    this._cand.length = 0;
    this.hash.clear();
    this.heightfield = null;
  }
}

// --------------------------------------------------------- debug primitives
//
// One sink so the same emitters serve both the baked static buffer (a growable
// JS array) and the fixed-capacity per-frame buffer.

const _sink = { arr: null, buf: null, i: 0, cap: 0 };

function emitLine(x1, y1, z1, x2, y2, z2) {
  if (_sink.buf) {
    if (_sink.i + 6 > _sink.cap) return;
    const b = _sink.buf;
    b[_sink.i++] = x1; b[_sink.i++] = y1; b[_sink.i++] = z1;
    b[_sink.i++] = x2; b[_sink.i++] = y2; b[_sink.i++] = z2;
  } else if (_sink.arr) {
    _sink.arr.push(x1, y1, z1, x2, y2, z2);
  }
}

/** Circle in the plane spanned by U and V, centred at C. */
function dbgCircle(cx, cy, cz, ux, uy, uz, vx, vy, vz, r, segs = 16) {
  let px = cx + ux * r, py = cy + uy * r, pz = cz + uz * r;
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const nx = cx + ux * ca + vx * sa;
    const ny = cy + uy * ca + vy * sa;
    const nz = cz + uz * ca + vz * sa;
    emitLine(px, py, pz, nx, ny, nz);
    px = nx; py = ny; pz = nz;
  }
}

/** Half circle from U toward W (used for capsule caps). */
function dbgArc(cx, cy, cz, ux, uy, uz, wx, wy, wz, r, segs = 8) {
  let px = cx + ux * r, py = cy + uy * r, pz = cz + uz * r;
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * Math.PI;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const nx = cx + ux * ca + wx * sa;
    const ny = cy + uy * ca + wy * sa;
    const nz = cz + uz * ca + wz * sa;
    emitLine(px, py, pz, nx, ny, nz);
    px = nx; py = ny; pz = nz;
  }
}

function dbgSphere(cx, cy, cz, r) {
  dbgCircle(cx, cy, cz, 1, 0, 0, 0, 1, 0, r);
  dbgCircle(cx, cy, cz, 1, 0, 0, 0, 0, 1, r);
  dbgCircle(cx, cy, cz, 0, 1, 0, 0, 0, 1, r);
}

function dbgCapsule(ax, ay, az, bx, by, bz, r) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (l < 1e-6) { dbgSphere(ax, ay, az, r); return; }
  dx /= l; dy /= l; dz /= l;
  // Any perpendicular basis will do.
  let ux, uy, uz;
  if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 1; uy = 0; uz = 0; }
  let ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;

  dbgCircle(ax, ay, az, ux, uy, uz, vx, vy, vz, r);
  dbgCircle(bx, by, bz, ux, uy, uz, vx, vy, vz, r);
  emitLine(ax + ux * r, ay + uy * r, az + uz * r, bx + ux * r, by + uy * r, bz + uz * r);
  emitLine(ax - ux * r, ay - uy * r, az - uz * r, bx - ux * r, by - uy * r, bz - uz * r);
  emitLine(ax + vx * r, ay + vy * r, az + vz * r, bx + vx * r, by + vy * r, bz + vz * r);
  emitLine(ax - vx * r, ay - vy * r, az - vz * r, bx - vx * r, by - vy * r, bz - vz * r);
  dbgArc(ax, ay, az, ux, uy, uz, -dx, -dy, -dz, r);
  dbgArc(ax, ay, az, vx, vy, vz, -dx, -dy, -dz, r);
  dbgArc(bx, by, bz, ux, uy, uz, dx, dy, dz, r);
  dbgArc(bx, by, bz, vx, vy, vz, dx, dy, dz, r);
}

/** 12 edges of an OBB described by centre, three unit axes and half extents. */
function dbgOBB(cx, cy, cz, ux, uy, uz, vx, vy, vz, wx, wy, wz, ex, ey, ez) {
  const px = [], py = [], pz = [];
  for (let i = 0; i < 8; i++) {
    const sx = (i & 1) ? 1 : -1, sy = (i & 2) ? 1 : -1, sz = (i & 4) ? 1 : -1;
    px.push(cx + ux * ex * sx + vx * ey * sy + wx * ez * sz);
    py.push(cy + uy * ex * sx + vy * ey * sy + wy * ez * sz);
    pz.push(cz + uz * ex * sx + vz * ey * sy + wz * ez * sz);
  }
  const E = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let i = 0; i < E.length; i += 2) {
    emitLine(px[E[i]], py[E[i]], pz[E[i]], px[E[i + 1]], py[E[i + 1]], pz[E[i + 1]]);
  }
}

function dbgBox(c) {
  dbgOBB(c.cx, c.cy, c.cz,
    c.u[0], c.u[1], c.u[2], c.v[0], c.v[1], c.v[2], c.w[0], c.w[1], c.w[2],
    c.ex, c.ey, c.ez);
}

function dbgBodyBox(b) {
  _m0.makeRotationFromQuaternion(b.quaternion);
  const e = _m0.elements;
  dbgOBB(b.position.x, b.position.y, b.position.z,
    e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10],
    b.half.x, b.half.y, b.half.z);
}

/**
 * Triangle meshes draw their real edges when small enough to read, and their
 * BVH leaf boxes when not — a 20 k-triangle shrine as wireframe is unreadable
 * anyway, and the leaf boxes are what a raycast actually walks.
 */
function dbgMesh(bvh) {
  if (bvh.triCount <= 900) {
    for (let i = 0; i < bvh.triCount; i++) {
      const b = i * 9;
      emitLine(bvh.tris[b], bvh.tris[b + 1], bvh.tris[b + 2],
        bvh.tris[b + 3], bvh.tris[b + 4], bvh.tris[b + 5]);
      emitLine(bvh.tris[b + 3], bvh.tris[b + 4], bvh.tris[b + 5],
        bvh.tris[b + 6], bvh.tris[b + 7], bvh.tris[b + 8]);
      emitLine(bvh.tris[b + 6], bvh.tris[b + 7], bvh.tris[b + 8],
        bvh.tris[b], bvh.tris[b + 1], bvh.tris[b + 2]);
    }
    return;
  }
  for (let n = 0; n < bvh.nodeCount; n++) {
    if (bvh.left[n] >= 0) continue;
    const b = n * 3;
    dbgAABB(bvh.bmin[b], bvh.bmin[b + 1], bvh.bmin[b + 2],
      bvh.bmax[b], bvh.bmax[b + 1], bvh.bmax[b + 2]);
  }
}

function dbgAABB(x0, y0, z0, x1, y1, z1) {
  dbgOBB((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5,
    1, 0, 0, 0, 1, 0, 0, 0, 1,
    (x1 - x0) * 0.5, (y1 - y0) * 0.5, (z1 - z0) * 0.5);
}

export default PhysicsWorld;
