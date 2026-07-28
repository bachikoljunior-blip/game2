/**
 * Rig.js — the skeleton, the procedurally generated character, and the animation engine.
 *
 * There are no imported assets in KAGEROU, which means the character mesh, the costume,
 * the katana and every frame of animation are generated here, in code, at boot. That
 * constraint turns out to be liberating: because we own the mesh generator we can bind
 * skin weights analytically from bone-segment distance, and because we own the animation
 * system we can use a pose-blend graph with procedural layers instead of baked clips.
 *
 * Design notes worth knowing before editing:
 *
 * - **Bind rotations are identity.** Every bone's rest orientation is world-aligned and
 *   the A-pose lives entirely in the bone *offsets*. That is what lets Poses.js author
 *   readable euler deltas ("+X on the thigh swings the leg forward") instead of the
 *   unreadable numbers you get from a rig whose bone axes follow the limbs.
 * - **No AnimationMixer.** Clips are keyframed poses; the sampler slerps them and four
 *   layers compose the result. Locomotion is a 2D blend space driven by *distance
 *   travelled*, which is the only real cure for foot skate.
 * - **Zero per-frame allocation.** Everything transient comes from the scratch pools at
 *   the top of the file. If you add a `new Vector3()` inside `update()`, you have
 *   regressed the frame budget on mobile.
 *
 * See ARCHITECTURE §4 for units and §7 for the triangle budget this file must respect.
 */

import {
  Bone, Skeleton, SkinnedMesh, Mesh, Group, Object3D, InstancedMesh,
  BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute,
  Vector3, Quaternion, Matrix4, Euler, Color, Sphere,
  MeshStandardMaterial, DoubleSide, FrontSide, DynamicDrawUsage,
} from 'three';
import { noise, clamp, lerp, smootherstep, damp } from '../core/Noise.js';
import { getClip, CLIPS, LOCOMOTION_FORWARD } from './Poses.js';

// ===========================================================================
// SKELETON DEFINITION
// ===========================================================================

/**
 * 26 bones. The four that are not classic humanoid joints — `root`, `topknot`,
 * `sayaMount`, `backMount` — exist because they are load-bearing: root gives the
 * controller a clean parent, topknot drives the hair chain, and the two mount bones
 * are the attachment sockets the entity contract asks for.
 *
 * Offsets are for a 1.75 m character (ARCHITECTURE §4): eye at 1.615, top of skull
 * at 1.752, fingertips at mid-thigh. `opts.height` scales all of it uniformly.
 */
const BONE_DEFS = [
  ['root',      null,        0,       0,       0],
  ['hips',      'root',      0,       0.960,   0],
  ['spine1',    'hips',      0,       0.095,   0.005],
  ['spine2',    'spine1',    0,       0.125,   0.002],
  ['spine3',    'spine2',    0,       0.140,  -0.002],
  ['neck',      'spine3',    0,       0.115,  -0.012],
  ['head',      'neck',      0,       0.095,   0.012],
  ['topknot',   'head',      0,       0.170,   0.050],
  ['clavicleR', 'spine3',    0.045,   0.125,   0.005],
  ['upperArmR', 'clavicleR', 0.135,  -0.015,   0],
  ['foreArmR',  'upperArmR', 0.0896, -0.2758,  0],
  ['handR',     'foreArmR',  0.0530, -0.2494,  0],
  ['clavicleL', 'spine3',   -0.045,   0.125,   0.005],
  ['upperArmL', 'clavicleL', -0.135, -0.015,   0],
  ['foreArmL',  'upperArmL', -0.0896, -0.2758, 0],
  ['handL',     'foreArmL',  -0.0530, -0.2494, 0],
  ['thighR',    'hips',      0.092,  -0.055,   0],
  ['shinR',     'thighR',    0,      -0.435,   0.012],
  ['footR',     'shinR',     0,      -0.385,  -0.012],
  ['toeR',      'footR',     0,      -0.055,  -0.130],
  ['thighL',    'hips',     -0.092,  -0.055,   0],
  ['shinL',     'thighL',    0,      -0.435,   0.012],
  ['footL',     'shinL',     0,      -0.385,  -0.012],
  ['toeL',      'footL',     0,      -0.055,  -0.130],
  ['sayaMount', 'hips',     -0.118,   0.020,   0.055],
  ['backMount', 'spine3',    0,       0.060,   0.090],
];

export const BONE_NAMES = Object.freeze(BONE_DEFS.map((d) => d[0]));
export const BONE_COUNT = BONE_DEFS.length;
const NB = BONE_COUNT;

const BONE_INDEX = Object.create(null);
for (let i = 0; i < BONE_DEFS.length; i++) BONE_INDEX[BONE_DEFS[i][0]] = i;

const BONE_PARENT = new Int8Array(NB);
for (let i = 0; i < NB; i++) {
  const p = BONE_DEFS[i][1];
  BONE_PARENT[i] = p === null ? -1 : BONE_INDEX[p];
}

/** Precomputed subtree membership — masks are specified as subtree roots. */
const SUBTREE = Object.create(null);
for (let i = 0; i < NB; i++) {
  const m = new Uint8Array(NB);
  for (let j = 0; j < NB; j++) {
    let k = j;
    while (k >= 0) { if (k === i) { m[j] = 1; break; } k = BONE_PARENT[k]; }
  }
  SUBTREE[BONE_NAMES[i]] = m;
}

/** Leaf bones need a synthetic tip so skin binding has a segment, not a point. */
const BONE_TIP = {
  handR: [0.062, -0.098, 0], handL: [-0.062, -0.098, 0],
  toeR: [0, -0.010, -0.062], toeL: [0, -0.010, -0.062],
  head: [0, 0.190, 0.010], topknot: [0, 0.050, 0.075],
  sayaMount: [0, 0, 0.10], backMount: [0, 0.05, 0], root: [0, 0.10, 0],
};

/** Bones that never receive skin weights — sockets and the controller parent. */
const NON_SKIN = new Set(['root', 'sayaMount', 'backMount']);

// ===========================================================================
// SCRATCH POOLS — every transient in update() comes from here
// ===========================================================================

const _v = []; for (let i = 0; i < 20; i++) _v.push(new Vector3());
const _q = []; for (let i = 0; i < 14; i++) _q.push(new Quaternion());
const _m = []; for (let i = 0; i < 6; i++) _m.push(new Matrix4());
const _e = new Euler();
const _col = new Color();
const _IDENTITY = new Matrix4();
const _UP = new Vector3(0, 1, 0);
const _FWD = new Vector3(0, 0, -1);

// ===========================================================================
// EASING
// ===========================================================================

const EASE_FN = {
  linear: (x) => x,
  smooth: (x) => x * x * (3 - 2 * x),
  smoother: (x) => x * x * x * (x * (x * 6 - 15) + 10),
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  // Anticipation overshoot — used on guard raises so the block "sets".
  back: (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2),
  // Three-frame strike: almost all of the motion in the first sixth of the interval.
  snap: (x) => 1 - Math.pow(1 - x, 6),
  hold: () => 0,
  elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1
    : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * 2.0944) + 1),
};

// ===========================================================================
// FLAT-ARRAY QUATERNION MATH (poses live in Float32Arrays, not objects)
// ===========================================================================

function qFromEuler(out, o, x, y, z) {
  const c1 = Math.cos(x * 0.5), c2 = Math.cos(y * 0.5), c3 = Math.cos(z * 0.5);
  const s1 = Math.sin(x * 0.5), s2 = Math.sin(y * 0.5), s3 = Math.sin(z * 0.5);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 - s1 * s2 * s3;
}

function qSlerp(a, ao, b, bo, t, out, oo) {
  let ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  if (t <= 0) { out[oo] = ax; out[oo + 1] = ay; out[oo + 2] = az; out[oo + 3] = aw; return; }
  if (t >= 1) { out[oo] = bx; out[oo + 1] = by; out[oo + 2] = bz; out[oo + 3] = bw; return; }
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  let sx = bx, sy = by, sz = bz, sw = bw;
  if (cos < 0) { cos = -cos; sx = -sx; sy = -sy; sz = -sz; sw = -sw; }
  let s0, s1;
  if (cos > 0.9995) { s0 = 1 - t; s1 = t; }
  else {
    const theta = Math.acos(cos), sin = Math.sqrt(1 - cos * cos);
    s0 = Math.sin((1 - t) * theta) / sin;
    s1 = Math.sin(t * theta) / sin;
  }
  ax = s0 * ax + s1 * sx; ay = s0 * ay + s1 * sy;
  az = s0 * az + s1 * sz; aw = s0 * aw + s1 * sw;
  const inv = 1 / Math.hypot(ax, ay, az, aw);
  out[oo] = ax * inv; out[oo + 1] = ay * inv; out[oo + 2] = az * inv; out[oo + 3] = aw * inv;
}

function qMul(a, ao, b, bo, out, oo) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[oo] = aw * bx + ax * bw + ay * bz - az * by;
  out[oo + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[oo + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[oo + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Blend a delta rotation in by `w`, expressed as slerp-from-identity then multiply. */
const _addTmp = new Float32Array(4);
function qAddDelta(target, to, dq, dqo, w) {
  if (w <= 0.0005) return;
  _addTmp[0] = 0; _addTmp[1] = 0; _addTmp[2] = 0; _addTmp[3] = 1;
  qSlerp(_addTmp, 0, dq, dqo, w, _addTmp, 0);
  qMul(target, to, _addTmp, 0, target, to);
}

/** In-place additive euler delta — the workhorse of the procedural layers. */
const _eulTmp = new Float32Array(4);
function qAddEuler(target, to, x, y, z, w) {
  if (w <= 0) return;
  qFromEuler(_eulTmp, 0, x * w, y * w, z * w);
  qMul(target, to, _eulTmp, 0, target, to);
}

// ===========================================================================
// CLIP COMPILATION — shared across every Rig instance
// ===========================================================================

const _compiled = new Map();

function compileClip(clipDef) {
  const cached = _compiled.get(clipDef.name);
  if (cached) return cached;

  // Union of every bone any key touches; missing bones fall back to rest (identity),
  // which makes the sampler a straight loop with no per-key branching.
  const used = [];
  const seen = new Uint8Array(NB);
  for (const k of clipDef.keys) {
    for (const b in k.pose) {
      const i = BONE_INDEX[b];
      if (i === undefined || seen[i]) continue;
      seen[i] = 1; used.push(i);
    }
  }
  used.sort((a, b) => a - b);
  const n = used.length;

  const keys = clipDef.keys.map((k) => {
    const q = new Float32Array(n * 4);
    const p = new Float32Array(n * 3);
    let anyPos = 0;
    for (let j = 0; j < n; j++) {
      const entry = k.pose[BONE_NAMES[used[j]]];
      if (entry) {
        const r = entry.rot;
        qFromEuler(q, j * 4, r[0], r[1], r[2]);
        if (entry.pos) {
          p[j * 3] = entry.pos[0]; p[j * 3 + 1] = entry.pos[1]; p[j * 3 + 2] = entry.pos[2];
          anyPos = 1;
        }
      } else {
        q[j * 4 + 3] = 1;
      }
    }
    return { t: k.t, q, p, anyPos, ease: EASE_FN[k.ease] || EASE_FN.smoother };
  });

  const out = {
    name: clipDef.name,
    duration: clipDef.duration,
    loop: clipDef.loop,
    layer: clipDef.layer,
    mask: clipDef.mask,
    fade: clipDef.fade,
    speed: clipDef.speed,
    stride: clipDef.stride,
    travel: clipDef.travel,
    events: clipDef.events,
    bones: Int8Array.from(used),
    keys,
    def: (() => { const d = new Float32Array(NB); for (const b of used) d[b] = 1; return d; })(),
  };
  _compiled.set(clipDef.name, out);
  return out;
}

/** Sample a compiled clip at time `t` into full-width buffers. */
function sampleClip(c, t, outQ, outP, outDef) {
  const keys = c.keys, nk = keys.length;
  let i = 0;
  // Linear scan: clips top out at 13 keys, so a binary search costs more than it saves.
  while (i < nk - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1] || keys[i];
  const span = k1.t - k0.t;
  const u = span > 1e-6 ? k0.ease(clamp((t - k0.t) / span, 0, 1)) : 0;

  const bones = c.bones, n = bones.length;
  outDef.set(c.def);
  for (let j = 0; j < n; j++) {
    const b = bones[j];
    qSlerp(k0.q, j * 4, k1.q, j * 4, u, outQ, b * 4);
    const o3 = b * 3, j3 = j * 3;
    if (k0.anyPos || k1.anyPos) {
      outP[o3] = k0.p[j3] + (k1.p[j3] - k0.p[j3]) * u;
      outP[o3 + 1] = k0.p[j3 + 1] + (k1.p[j3 + 1] - k0.p[j3 + 1]) * u;
      outP[o3 + 2] = k0.p[j3 + 2] + (k1.p[j3 + 2] - k0.p[j3 + 2]) * u;
    } else {
      outP[o3] = 0; outP[o3 + 1] = 0; outP[o3 + 2] = 0;
    }
  }
}

// ===========================================================================
// MASKS
// ===========================================================================

const _maskCache = new Map();

/**
 * Graded masks, not binary ones. `upper` fades in across the pelvis and lumbar spine
 * so an attack played over a run does not produce a visible seam at the waist.
 */
function buildMask(spec) {
  if (spec instanceof Float32Array) return spec;
  const key = typeof spec === 'string' ? spec : JSON.stringify(spec);
  const hit = _maskCache.get(key);
  if (hit) return hit;

  const m = new Float32Array(NB);
  const set = (name, w) => { const i = BONE_INDEX[name]; if (i !== undefined) m[i] = w; };
  const setSub = (name, w) => {
    const s = SUBTREE[name];
    if (!s) return;
    for (let i = 0; i < NB; i++) if (s[i]) m[i] = w;
  };

  if (typeof spec === 'string') {
    switch (spec) {
      case 'full': m.fill(1); break;
      case 'upper':
        setSub('spine1', 1); set('spine1', 0.55); set('spine2', 0.85);
        set('hips', 0.15); set('backMount', 1);
        break;
      case 'lower':
        setSub('thighL', 1); setSub('thighR', 1); set('hips', 1); set('sayaMount', 1);
        set('spine1', 0.35); set('spine2', 0.12);
        break;
      case 'arms': setSub('clavicleL', 1); setSub('clavicleR', 1); break;
      case 'armR': setSub('clavicleR', 1); break;
      case 'armL': setSub('clavicleL', 1); break;
      case 'head': setSub('neck', 1); set('neck', 0.8); break;
      case 'spine': set('spine1', 1); set('spine2', 1); set('spine3', 1); break;
      case 'none': break;
      default: m.fill(1); break;
    }
  } else if (Array.isArray(spec)) {
    for (const name of spec) setSub(name, 1);
  } else if (spec && typeof spec === 'object') {
    if (spec.include) for (const name of spec.include) setSub(name, 1); else m.fill(1);
    if (spec.exclude) for (const name of spec.exclude) setSub(name, 0);
    if (spec.weights) for (const name in spec.weights) set(name, spec.weights[name]);
  } else {
    m.fill(1);
  }
  _maskCache.set(key, m);
  return m;
}

// ===========================================================================
// ANIMATION LAYER
// ===========================================================================

const LAYER_BASE = 0, LAYER_UPPER = 1, LAYER_ACTION = 2, LAYER_ADD = 3;
const LAYER_NAMES = ['base', 'upper', 'action', 'additive'];

class Layer {
  constructor(index, name, additive, defaultMask) {
    this.index = index;
    this.name = name;
    this.additive = additive;
    this.mask = buildMask(defaultMask);
    this.weight = 0;
    this.targetWeight = 0;
    this.fadeRate = 8;

    this.clip = null;
    this.time = 0;
    this.speed = 1;
    this.loop = false;
    this.finished = false;
    this.onEnd = null;

    // Cross-fade: the outgoing clip keeps playing under the incoming one.
    this.prev = null;
    this.prevTime = 0;
    this.prevSpeed = 1;
    this.blend = 1;
    this.blendRate = 0;

    this.q = new Float32Array(NB * 4);
    this.p = new Float32Array(NB * 3);
    this.def = new Float32Array(NB);
    this.qb = new Float32Array(NB * 4);
    this.pb = new Float32Array(NB * 3);
    this.defb = new Float32Array(NB);

    this._eventCursor = 0;
    this._prevEventCursor = 0;
  }
}

// ===========================================================================
// PROCEDURAL MESH GENERATION
// ===========================================================================

/** UV metres→tile scale. One texture repeat covers 0.5 m, which reads right for cloth. */
const UV_PER_METRE = 2.0;

/**
 * Accumulates one welded BufferGeometry. Skin weights are resolved analytically from
 * bone-segment distance with a gaussian falloff: on the shaft of a limb one bone wins
 * outright, and at a joint the two neighbours land at 50/50 and blend smoothly across
 * roughly a 10 cm band. That is the whole trick — no painted weights required.
 */
class Mesher {
  constructor(segA, segB, falloff) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
    this.segA = segA;      // Float32Array(NB*3) segment start, root space
    this.segB = segB;      // Float32Array(NB*3) segment end
    this.falloff = falloff || 0.055;
    this._cand = null;
    this._ao = 1;
    this._d = new Float32Array(NB);
  }

  begin(candidates, aoBias) {
    this._cand = candidates;
    this._ao = aoBias === undefined ? 1 : aoBias;
  }

  get vertexCount() { return this.pos.length / 3; }

  _skin(x, y, z) {
    const cand = this._cand, d = this._d;
    let dmin = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i];
      const dd = pointSegDist(x, y, z, this.segA, this.segB, b);
      d[i] = dd;
      if (dd < dmin) dmin = dd;
    }
    // Top two by gaussian score. Two influences is deliberate: it keeps deformation
    // predictable at joints and halves the skinning cost on mobile.
    let i0 = -1, i1 = -1, w0 = -1, w1 = -1;
    const f = this.falloff;
    for (let i = 0; i < cand.length; i++) {
      const t = (d[i] - dmin) / f;
      const w = Math.exp(-t * t);
      if (w > w0) { w1 = w0; i1 = i0; w0 = w; i0 = i; }
      else if (w > w1) { w1 = w; i1 = i; }
    }
    if (i0 < 0) { i0 = 0; w0 = 1; }
    if (i1 < 0 || w1 < 1e-4) { i1 = i0; w1 = 0; }
    const inv = 1 / (w0 + w1);
    w0 *= inv; w1 *= inv;
    this.si.push(cand[i0], cand[i1], 0, 0);
    this.sw.push(w0, w1, 0, 0);
    // A vertex split evenly between two bones is, by construction, at a joint crease.
    return 4 * w0 * w1;
  }

  vertex(x, y, z, nx, ny, nz, u, vv) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, vv);
    const jointness = this._skin(x, y, z);
    let ao = this._ao;
    ao *= 1 - 0.22 * jointness;              // creases at every joint
    ao *= 1 - 0.16 * Math.max(0, -ny);       // downward faces catch less sky
    ao *= aoHotspots(x, y, z);
    this.col.push(ao, ao, ao);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  toGeometry(name) {
    const g = new BufferGeometry();
    g.name = name || 'body';
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    // Skinned bounds must survive a jōdan windup and a death sprawl.
    if (g.boundingSphere) g.boundingSphere.radius *= 2.1;
    return g;
  }
}

function pointSegDist(px, py, pz, A, B, b) {
  const i = b * 3;
  const ax = A[i], ay = A[i + 1], az = A[i + 2];
  const bx = B[i], by = B[i + 1], bz = B[i + 2];
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const len2 = ex * ex + ey * ey + ez * ez;
  let t = len2 > 1e-9 ? ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + ex * t), dy = py - (ay + ey * t), dz = pz - (az + ez * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Hand-placed ambient occlusion. Baked vertex AO in crevices is an explicit
 * ARCHITECTURE §5 requirement and it is what stops a procedural body reading as a
 * balloon animal: armpits, the crotch, under the jaw and the backs of the knees.
 */
let AO_SPOTS = [];
function aoHotspots(x, y, z) {
  let ao = 1;
  for (let i = 0; i < AO_SPOTS.length; i++) {
    const s = AO_SPOTS[i];
    const dx = x - s[0], dy = y - s[1], dz = z - s[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= s[3]) continue;
    const t = 1 - d / s[3];
    ao *= 1 - s[4] * t * t;
  }
  return ao;
}

/** Catmull-Rom resample of a control-station list into `n` evenly spaced stations. */
function resampleStations(ctrl, n, out) {
  const m = ctrl.length;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * (m - 1);
    const i1 = Math.min(m - 1, Math.floor(s));
    const t = s - i1;
    const i0 = Math.max(0, i1 - 1), i2 = Math.min(m - 1, i1 + 1), i3 = Math.min(m - 1, i1 + 2);
    const o = out[i] || (out[i] = new Float64Array(6));
    for (let c = 0; c < 5; c++) {
      const p0 = ctrl[i0][c], p1 = ctrl[i1][c], p2 = ctrl[i2][c], p3 = ctrl[i3][c];
      o[c] = 0.5 * ((2 * p1) + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    }
    o[5] = i / (n - 1);
  }
  return out;
}

/**
 * Loft an elliptical tube through a station list. Stations are
 * `[x, y, z, radiusN, radiusB]`; the cross-section frame is parallel-transported so a
 * bent limb does not twist. Normals are analytic (ellipse gradient plus the taper
 * term) rather than accumulated, which keeps the UV seam smooth instead of faceted.
 */
function loftTube(mesher, ctrl, nStations, nSeg, opts) {
  const o = opts || {};
  const st = resampleStations(ctrl, nStations, []);
  const capStart = o.capStart !== false;
  const capEnd = o.capEnd !== false;
  const uOff = o.uOffset || 0;

  // Parallel-transported frames.
  const T = new Float64Array(nStations * 3);
  const N = new Float64Array(nStations * 3);
  const Bn = new Float64Array(nStations * 3);
  for (let i = 0; i < nStations; i++) {
    const a = st[Math.max(0, i - 1)], b = st[Math.min(nStations - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    T[i * 3] = tx; T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
  }
  {
    // Seed the frame with whichever world axis is least parallel to the first tangent.
    let rx = 1, ry = 0, rz = 0;
    if (Math.abs(T[0]) > 0.85) { rx = 0; ry = 0; rz = 1; }
    let nx = ry * T[2] - rz * T[1], ny = rz * T[0] - rx * T[2], nz = rx * T[1] - ry * T[0];
    let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    N[0] = nx; N[1] = ny; N[2] = nz;
    Bn[0] = T[1] * nz - T[2] * ny; Bn[1] = T[2] * nx - T[0] * nz; Bn[2] = T[0] * ny - T[1] * nx;
    for (let i = 1; i < nStations; i++) {
      const i3 = i * 3, p3 = i3 - 3;
      // Project the previous normal onto the new station's plane.
      const d = N[p3] * T[i3] + N[p3 + 1] * T[i3 + 1] + N[p3 + 2] * T[i3 + 2];
      nx = N[p3] - T[i3] * d; ny = N[p3 + 1] - T[i3 + 1] * d; nz = N[p3 + 2] - T[i3 + 2] * d;
      l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      N[i3] = nx; N[i3 + 1] = ny; N[i3 + 2] = nz;
      Bn[i3] = T[i3 + 1] * nz - T[i3 + 2] * ny;
      Bn[i3 + 1] = T[i3 + 2] * nx - T[i3] * nz;
      Bn[i3 + 2] = T[i3] * ny - T[i3 + 1] * nx;
    }
  }

  // Arc length for V, average circumference for U — both in metres so cloth tiles.
  const arc = new Float64Array(nStations);
  for (let i = 1; i < nStations; i++) {
    arc[i] = arc[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1], st[i][2] - st[i - 1][2]);
  }

  const ringStart = mesher.vertexCount;
  const cols = nSeg + 1;   // duplicated seam column for a clean UV wrap
  for (let i = 0; i < nStations; i++) {
    const s = st[i], i3 = i * 3;
    const r1 = s[3], r2 = s[4];
    const circ = Math.PI * (1.5 * (r1 + r2) - Math.sqrt(r1 * r2)) * 0.5;
    // dr/ds gives the tangential tilt of the surface normal on a tapering limb.
    const ip = Math.max(0, i - 1), inx = Math.min(nStations - 1, i + 1);
    const ds = Math.max(1e-4, arc[inx] - arc[ip]);
    const dr1 = (st[inx][3] - st[ip][3]) / ds, dr2 = (st[inx][4] - st[ip][4]) / ds;
    for (let j = 0; j < cols; j++) {
      const a = (j / nSeg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = s[0] + N[i3] * r1 * ca + Bn[i3] * r2 * sa;
      const py = s[1] + N[i3 + 1] * r1 * ca + Bn[i3 + 1] * r2 * sa;
      const pz = s[2] + N[i3 + 2] * r1 * ca + Bn[i3 + 2] * r2 * sa;
      // Ellipse normal in the ring plane, then lean it back along the taper.
      let gu = ca / Math.max(1e-4, r1), gv = sa / Math.max(1e-4, r2);
      const gl = Math.hypot(gu, gv) || 1; gu /= gl; gv /= gl;
      const taper = -(dr1 * ca * gu + dr2 * sa * gv);
      let nx = N[i3] * gu + Bn[i3] * gv + T[i3] * taper;
      let ny = N[i3 + 1] * gu + Bn[i3 + 1] * gv + T[i3 + 1] * taper;
      let nz = N[i3 + 2] * gu + Bn[i3 + 2] * gv + T[i3 + 2] * taper;
      const nl = Math.hypot(nx, ny, nz) || 1;
      mesher.vertex(px, py, pz, nx / nl, ny / nl, nz / nl,
        (uOff + (j / nSeg) * circ) * UV_PER_METRE, arc[i] * UV_PER_METRE);
    }
  }
  for (let i = 0; i < nStations - 1; i++) {
    for (let j = 0; j < nSeg; j++) {
      const a = ringStart + i * cols + j;
      const b = a + 1, c = a + cols + 1, d = a + cols;
      mesher.quad(a, b, c, d);
    }
  }

  // Caps: a single centre vertex fanned to the end ring. Cheap and never seen.
  if (capStart) capRing(mesher, st[0], N, Bn, T, 0, nSeg, ringStart, cols, -1);
  if (capEnd) {
    const i = nStations - 1;
    capRing(mesher, st[i], N, Bn, T, i, nSeg, ringStart + i * cols, cols, 1);
  }
  return ringStart;
}

function capRing(mesher, s, N, Bn, T, i, nSeg, base, cols, dir) {
  const i3 = i * 3;
  const cx = s[0] + T[i3] * 0.004 * dir;
  const cy = s[1] + T[i3 + 1] * 0.004 * dir;
  const cz = s[2] + T[i3 + 2] * 0.004 * dir;
  const c = mesher.vertex(cx, cy, cz, T[i3] * dir, T[i3 + 1] * dir, T[i3 + 2] * dir, 0, 0);
  for (let j = 0; j < nSeg; j++) {
    const a = base + j, b = base + j + 1;
    if (dir > 0) mesher.tri(a, b, c); else mesher.tri(b, a, c);
  }
}

/** Lathed ellipsoid with a profile modulator — used for the skull and the jingasa. */
function loftSphere(mesher, cx, cy, cz, rx, ry, rz, nLat, nLon, shape) {
  const start = mesher.vertexCount;
  const cols = nLon + 1;
  for (let i = 0; i <= nLat; i++) {
    const v = i / nLat;
    const phi = v * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const k = shape ? shape(v) : 1;
    for (let j = 0; j < cols; j++) {
      const u = j / nLon;
      const th = u * Math.PI * 2;
      const nx = sp * Math.cos(th), ny = -cp, nz = sp * Math.sin(th);
      const px = cx + nx * rx * k, py = cy + ny * ry, pz = cz + nz * rz * k;
      let gx = nx / rx, gy = ny / ry, gz = nz / rz;
      const gl = Math.hypot(gx, gy, gz) || 1;
      mesher.vertex(px, py, pz, gx / gl, gy / gl, gz / gl,
        u * Math.PI * 2 * rx * UV_PER_METRE, v * Math.PI * ry * UV_PER_METRE);
    }
  }
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = start + i * cols + j;
      mesher.quad(a, a + 1, a + cols + 1, a + cols);
    }
  }
  return start;
}

// ===========================================================================
// BODY / COSTUME GEOMETRY
// ===========================================================================

/** Ring and station density per tier. Bone count is fixed; only the skin scales. */
function meshDensity(quality) {
  const tier = quality ? quality.tier : 1;
  if (tier <= 0) return { ringL: 6, ringT: 8, lon: 0.72, sphere: [6, 8] };
  if (tier === 1) return { ringL: 10, ringT: 14, lon: 1.0, sphere: [8, 12] };
  return { ringL: 14, ringT: 18, lon: 1.35, sphere: [11, 16] };
}

const _P3 = new Vector3();
/** Bind-pose world position of a bone, root space. */
function bindPos(bones, name, out) {
  const b = bones[name];
  out.setFromMatrixPosition(b.matrixWorld);
  return out;
}

/**
 * The skinned body. Torso is one loft from the crotch to the neck with an elliptical
 * section that widens at the ribcage; the limbs are tapered tubes; hands and feet are
 * short lofts with flattened sections. Candidate bone lists are scoped per part, which
 * is what stops the left thigh from claiming vertices on the right thigh at the crotch.
 */
function buildBody(rig, dens) {
  const bones = rig.bones;
  const mesher = new Mesher(rig._segA, rig._segB, 0.055);
  const S = rig.scale;
  const a = _v[0], b = _v[1], c = _v[2];
  const L = dens.lon;
  const R = (n) => Math.max(3, Math.round(n * L));

  const hips = bindPos(bones, 'hips', a).clone();
  const sp1 = bindPos(bones, 'spine1', a).clone();
  const sp2 = bindPos(bones, 'spine2', a).clone();
  const sp3 = bindPos(bones, 'spine3', a).clone();
  const neck = bindPos(bones, 'neck', a).clone();
  const head = bindPos(bones, 'head', a).clone();

  // ---- torso
  mesher.begin(rig._candTorso, 1.0);
  loftTube(mesher, [
    [hips.x, hips.y - 0.105 * S, hips.z + 0.010 * S, 0.108 * S, 0.098 * S],
    [hips.x, hips.y - 0.020 * S, hips.z + 0.004 * S, 0.136 * S, 0.110 * S],
    [sp1.x, sp1.y, sp1.z, 0.122 * S, 0.099 * S],
    [sp2.x, sp2.y, sp2.z, 0.142 * S, 0.107 * S],
    [sp3.x, sp3.y - 0.020 * S, sp3.z, 0.163 * S, 0.114 * S],
    [sp3.x, sp3.y + 0.075 * S, sp3.z - 0.004 * S, 0.150 * S, 0.104 * S],
    [neck.x, neck.y + 0.006 * S, neck.z + 0.006 * S, 0.076 * S, 0.074 * S],
  ], R(11), dens.ringT, { capStart: true, capEnd: false });

  // ---- neck + skull
  mesher.begin(rig._candHead, 0.94);
  loftTube(mesher, [
    [neck.x, neck.y - 0.020 * S, neck.z + 0.004 * S, 0.070 * S, 0.070 * S],
    [neck.x, neck.y + 0.040 * S, neck.z + 0.006 * S, 0.062 * S, 0.062 * S],
    [head.x, head.y + 0.010 * S, head.z + 0.010 * S, 0.066 * S, 0.068 * S],
  ], R(4), dens.ringT, { capStart: false, capEnd: false });
  // Jaw is narrower than the cranium; the shape function does that in one line.
  loftSphere(mesher, head.x, head.y + 0.098 * S, head.z + 0.008 * S,
    0.089 * S, 0.116 * S, 0.099 * S, dens.sphere[0], dens.sphere[1],
    (v) => 0.72 + 0.30 * Math.sin(Math.min(1, v * 1.22) * Math.PI * 0.86));

  // ---- arms
  for (const side of ['R', 'L']) {
    const sh = bindPos(bones, 'upperArm' + side, a).clone();
    const el = bindPos(bones, 'foreArm' + side, b).clone();
    const wr = bindPos(bones, 'hand' + side, c).clone();
    const sgn = side === 'R' ? 1 : -1;
    mesher.begin(side === 'R' ? rig._candArmR : rig._candArmL, 0.97);
    loftTube(mesher, [
      [sh.x - sgn * 0.030 * S, sh.y + 0.048 * S, sh.z, 0.050 * S, 0.052 * S],
      [sh.x, sh.y - 0.010 * S, sh.z, 0.059 * S, 0.058 * S],
      [lerp(sh.x, el.x, 0.45), lerp(sh.y, el.y, 0.45), lerp(sh.z, el.z, 0.45), 0.050 * S, 0.049 * S],
      [el.x, el.y, el.z, 0.043 * S, 0.044 * S],
      [lerp(el.x, wr.x, 0.30), lerp(el.y, wr.y, 0.30), lerp(el.z, wr.z, 0.30), 0.046 * S, 0.045 * S],
      [lerp(el.x, wr.x, 0.72), lerp(el.y, wr.y, 0.72), lerp(el.z, wr.z, 0.72), 0.034 * S, 0.033 * S],
      [wr.x, wr.y, wr.z, 0.028 * S, 0.026 * S],
    ], R(9), dens.ringL, { capStart: true, capEnd: false });

    // Hand: a flattened mitten. Fingers would cost more than they are worth at this
    // silhouette scale, and the hands are wrapped around a tsuka most of the time.
    const dx = (wr.x - el.x), dy = (wr.y - el.y), dz = (wr.z - el.z);
    const dl = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / dl, uy = dy / dl, uz = dz / dl;
    mesher.begin(side === 'R' ? rig._candHandR : rig._candHandL, 0.93);
    loftTube(mesher, [
      [wr.x, wr.y, wr.z, 0.028 * S, 0.024 * S],
      [wr.x + ux * 0.035 * S, wr.y + uy * 0.035 * S, wr.z + uz * 0.035 * S, 0.040 * S, 0.023 * S],
      [wr.x + ux * 0.085 * S, wr.y + uy * 0.085 * S, wr.z + uz * 0.085 * S, 0.041 * S, 0.021 * S],
      [wr.x + ux * 0.125 * S, wr.y + uy * 0.125 * S, wr.z + uz * 0.125 * S, 0.032 * S, 0.017 * S],
      [wr.x + ux * 0.155 * S, wr.y + uy * 0.155 * S, wr.z + uz * 0.155 * S, 0.014 * S, 0.010 * S],
    ], R(5), Math.max(6, dens.ringL - 2), { capStart: false, capEnd: true });
  }

  // ---- legs
  for (const side of ['R', 'L']) {
    const hp = bindPos(bones, 'thigh' + side, a).clone();
    const kn = bindPos(bones, 'shin' + side, b).clone();
    const an = bindPos(bones, 'foot' + side, c).clone();
    mesher.begin(side === 'R' ? rig._candLegR : rig._candLegL, 0.98);
    loftTube(mesher, [
      [hp.x, hp.y + 0.050 * S, hp.z, 0.088 * S, 0.092 * S],
      [hp.x, hp.y - 0.030 * S, hp.z, 0.097 * S, 0.098 * S],
      [lerp(hp.x, kn.x, 0.45), lerp(hp.y, kn.y, 0.45), lerp(hp.z, kn.z, 0.45), 0.085 * S, 0.088 * S],
      [kn.x, kn.y + 0.030 * S, kn.z, 0.068 * S, 0.071 * S],
      [kn.x, kn.y, kn.z, 0.064 * S, 0.066 * S],
      [lerp(kn.x, an.x, 0.28), lerp(kn.y, an.y, 0.28), lerp(kn.z, an.z, 0.28) + 0.012 * S, 0.070 * S, 0.072 * S],
      [lerp(kn.x, an.x, 0.68), lerp(kn.y, an.y, 0.68), lerp(kn.z, an.z, 0.68), 0.048 * S, 0.049 * S],
      [an.x, an.y, an.z, 0.037 * S, 0.040 * S],
    ], R(10), dens.ringL, { capStart: true, capEnd: false });

    // Foot: heel behind the ankle, ball forward, tapering toe box.
    const to = bindPos(bones, 'toe' + side, _v[3]).clone();
    mesher.begin(side === 'R' ? rig._candFootR : rig._candFootL, 0.86);
    loftTube(mesher, [
      [an.x, an.y + 0.012 * S, an.z + 0.070 * S, 0.032 * S, 0.036 * S],
      [an.x, an.y - 0.020 * S, an.z + 0.045 * S, 0.040 * S, 0.043 * S],
      [an.x, an.y - 0.048 * S, an.z - 0.010 * S, 0.043 * S, 0.038 * S],
      [to.x, to.y - 0.005 * S, to.z + 0.010 * S, 0.045 * S, 0.030 * S],
      [to.x, to.y - 0.002 * S, to.z - 0.048 * S, 0.038 * S, 0.024 * S],
      [to.x, to.y + 0.004 * S, to.z - 0.070 * S, 0.020 * S, 0.014 * S],
    ], R(6), Math.max(6, dens.ringL - 2), { capStart: true, capEnd: true });
  }

  return mesher.toGeometry('kagerou-body');
}

/**
 * The kimono / haori upper: an inflated shell over the torso and upper arms, skinned
 * to the same skeleton so it deforms with the body for free. The wide sleeve *hems*
 * are cloth-simulated separately; this is only the part that stays on the arm.
 */
function buildUpperGarment(rig, dens, opts) {
  const bones = rig.bones;
  const mesher = new Mesher(rig._segA, rig._segB, 0.065);
  const S = rig.scale;
  const a = _v[0], b = _v[1], c = _v[2];
  const L = dens.lon;
  const R = (n) => Math.max(3, Math.round(n * L));
  const puff = opts.puff === undefined ? 0.022 : opts.puff;

  const hips = bindPos(bones, 'hips', a).clone();
  const sp1 = bindPos(bones, 'spine1', a).clone();
  const sp2 = bindPos(bones, 'spine2', a).clone();
  const sp3 = bindPos(bones, 'spine3', a).clone();
  const neck = bindPos(bones, 'neck', a).clone();

  mesher.begin(rig._candTorso, 1.0);
  loftTube(mesher, [
    [hips.x, hips.y - 0.150 * S, hips.z, (0.128 + puff) * S, (0.116 + puff) * S],
    [hips.x, hips.y - 0.020 * S, hips.z, (0.140 + puff) * S, (0.114 + puff) * S],
    [sp1.x, sp1.y, sp1.z, (0.128 + puff) * S, (0.104 + puff) * S],
    [sp2.x, sp2.y, sp2.z, (0.148 + puff) * S, (0.112 + puff) * S],
    [sp3.x, sp3.y - 0.020 * S, sp3.z, (0.170 + puff) * S, (0.120 + puff) * S],
    [sp3.x, sp3.y + 0.080 * S, sp3.z - 0.004 * S, (0.156 + puff) * S, (0.110 + puff) * S],
    // The collar stands away from the neck — that gap is most of the kimono read.
    [neck.x, neck.y + 0.030 * S, neck.z + 0.030 * S, 0.098 * S, 0.100 * S],
  ], R(10), dens.ringT, { capStart: true, capEnd: true });

  // Sleeves: they start tight at the shoulder and flare hard past the elbow.
  for (const side of ['R', 'L']) {
    const sh = bindPos(bones, 'upperArm' + side, a).clone();
    const el = bindPos(bones, 'foreArm' + side, b).clone();
    const wr = bindPos(bones, 'hand' + side, c).clone();
    const sgn = side === 'R' ? 1 : -1;
    mesher.begin(side === 'R' ? rig._candArmR : rig._candArmL, 0.96);
    loftTube(mesher, [
      [sh.x - sgn * 0.020 * S, sh.y + 0.055 * S, sh.z, 0.070 * S, 0.072 * S],
      [sh.x, sh.y - 0.010 * S, sh.z, 0.082 * S, 0.080 * S],
      [lerp(sh.x, el.x, 0.5), lerp(sh.y, el.y, 0.5), lerp(sh.z, el.z, 0.5), 0.082 * S, 0.082 * S],
      [el.x, el.y, el.z, 0.088 * S, 0.090 * S],
      [lerp(el.x, wr.x, 0.45), lerp(el.y, wr.y, 0.45), lerp(el.z, wr.z, 0.45), 0.096 * S, 0.098 * S],
    ], R(6), dens.ringL, { capStart: true, capEnd: false });
  }
  return mesher.toGeometry('kagerou-kimono');
}

/** 帯 obi — a flat wrapped band. Rigid, parented to spine1; it never needs to flex. */
function buildObi(rig, dens) {
  const mesher = new Mesher(rig._segA, rig._segB, 0.08);
  const S = rig.scale;
  const p = bindPos(rig.bones, 'spine1', _v[0]).clone();
  mesher.begin(rig._candTorso, 0.88);
  loftTube(mesher, [
    [p.x, p.y - 0.075 * S, p.z, 0.152 * S, 0.126 * S],
    [p.x, p.y - 0.040 * S, p.z, 0.160 * S, 0.132 * S],
    [p.x, p.y + 0.030 * S, p.z, 0.158 * S, 0.130 * S],
    [p.x, p.y + 0.062 * S, p.z, 0.148 * S, 0.122 * S],
  ], Math.max(4, Math.round(5 * dens.lon)), dens.ringT, { capStart: true, capEnd: true });
  // Knot at the back — a small offset lump, but it is what makes the obi read as tied.
  mesher.begin(rig._candTorso, 0.8);
  loftSphere(mesher, p.x, p.y - 0.005 * S, p.z + 0.140 * S,
    0.062 * S, 0.048 * S, 0.045 * S, Math.max(4, dens.sphere[0] - 3), Math.max(6, dens.sphere[1] - 4));
  return mesher.toGeometry('kagerou-obi');
}

/**
 * 胴 dō — the oni's lamellar cuirass, built as instanced plates laced in rows. One
 * InstancedMesh for the plates and one for the lacing keeps the whole torso armour at
 * two draw calls, which is what the ARCHITECTURE §7 budget demands with 8 enemies up.
 */
function buildLamellar(rig, dens, materials) {
  const S = rig.scale;
  const group = new Group();
  group.name = 'do';
  const rows = dens.lon > 1.1 ? 6 : 5;
  const cols = dens.lon > 1.1 ? 16 : 13;
  const plateGeo = plateGeometry(0.030 * S, 0.040 * S, 0.005 * S);
  const cordGeo = plateGeometry(0.006 * S, 0.030 * S, 0.004 * S);

  const plates = new InstancedMesh(plateGeo, materials.lamellar, rows * cols);
  const cords = new InstancedMesh(cordGeo, materials.lacing, rows * cols);
  plates.name = 'do-plates'; cords.name = 'do-lacing';
  plates.castShadow = true;

  const m4 = _m[0], qq = _q[0], pv = _v[0], sv = _v[1].set(1, 1, 1);
  const sp1 = bindPos(rig.bones, 'spine1', _v[2]).clone();
  const sp3 = bindPos(rig.bones, 'spine3', _v[3]).clone();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = lerp(sp1.y - 0.055 * S, sp3.y + 0.045 * S, t);
    // The cuirass is barrel-shaped: widest at the ribs, drawn in at the waist.
    const flare = 1 + 0.16 * Math.sin(t * Math.PI);
    const rx = (0.168 * S) * flare, rz = (0.128 * S) * flare;
    for (let cI = 0; cI < cols; cI++) {
      const ang = (cI / cols) * Math.PI * 2 + (r % 2) * (Math.PI / cols) * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      pv.set(ca * rx, y, sa * rz);
      _v[4].set(ca / rx, 0.16, sa / rz).normalize();
      qq.setFromUnitVectors(_FWD, _v[4].multiplyScalar(-1));
      m4.compose(pv, qq, sv);
      plates.setMatrixAt(n, m4);
      pv.set(ca * (rx + 0.006 * S), y - 0.018 * S, sa * (rz + 0.006 * S));
      m4.compose(pv, qq, sv);
      cords.setMatrixAt(n, m4);
      n++;
    }
  }
  plates.instanceMatrix.needsUpdate = true;
  cords.instanceMatrix.needsUpdate = true;
  plates.frustumCulled = false; cords.frustumCulled = false;
  group.add(plates, cords);
  return group;
}

/** 袖 sode — the big square shoulder guards. Four descending plates per side. */
function buildSode(rig, dens, materials, side) {
  const S = rig.scale;
  const rows = 4;
  const geo = plateGeometry(0.085 * S, 0.048 * S, 0.006 * S);
  const im = new InstancedMesh(geo, materials.lamellar, rows);
  im.name = 'sode' + side;
  im.castShadow = true;
  const sgn = side === 'R' ? 1 : -1;
  const m4 = _m[0], qq = _q[0], pv = _v[0], sv = _v[1].set(1, 1, 1);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    pv.set(sgn * (0.055 + t * 0.030) * S, (-0.010 - t * 0.088) * S, 0.004 * S);
    _e.set(0.12 * t, 0, sgn * (0.34 + t * 0.22));
    qq.setFromEuler(_e);
    m4.compose(pv, qq, sv);
    im.setMatrixAt(r, m4);
  }
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

/** A slightly domed rounded plate — flat quads read as cardboard under a rim light. */
function plateGeometry(w, h, d) {
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const nx = 4, ny = 4;
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const base = pos.length / 3;
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny;
        const x = (u - 0.5) * w, y = (v - 0.5) * h;
        const dome = Math.cos((u - 0.5) * Math.PI) * Math.cos((v - 0.5) * Math.PI * 0.5);
        const z = sign * (d * 0.5 + d * 0.9 * dome);
        pos.push(x, y, z);
        const gx = -sign * (Math.sin((u - 0.5) * Math.PI) * d * 1.6) / Math.max(1e-4, w);
        const gy = -sign * (Math.sin((v - 0.5) * Math.PI * 0.5) * d * 0.8) / Math.max(1e-4, h);
        const l = Math.hypot(gx, gy, 1);
        nor.push(gx / l, gy / l, sign / l);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        if (sign > 0) idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1);
        else idx.push(a, a + nx + 2, a + 1, a, a + nx + 1, a + nx + 2);
      }
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 面頬 menpō — the snarling half mask. Built as a shell swept under the cheekbones. */
function buildMenpo(rig, dens, materials) {
  const S = rig.scale;
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const cols = dens.ringT >= 14 ? 11 : 8;
  const rowsDef = [
    // [y, zFront, halfWidth, bulge]
    [0.070, -0.086, 0.082, 0.30],
    [0.030, -0.098, 0.080, 0.55],
    [-0.005, -0.100, 0.072, 0.70],
    [-0.042, -0.088, 0.058, 0.85],
    [-0.072, -0.058, 0.040, 0.60],
  ];
  for (let r = 0; r < rowsDef.length; r++) {
    const [y, zf, hw, bl] = rowsDef[r];
    for (let cI = 0; cI <= cols; cI++) {
      const u = cI / cols;
      const ang = (u - 0.5) * Math.PI * 1.08;
      const x = Math.sin(ang) * hw * S;
      const z = (zf + (1 - Math.cos(ang)) * 0.085) * S;
      pos.push(x, y * S, z);
      const l = Math.hypot(Math.sin(ang), 0.22 * bl, -Math.cos(ang));
      nor.push(Math.sin(ang) / l, (0.22 * bl) / l, -Math.cos(ang) / l);
      uv.push(u, r / (rowsDef.length - 1));
    }
  }
  for (let r = 0; r < rowsDef.length - 1; r++) {
    for (let cI = 0; cI < cols; cI++) {
      const a = r * (cols + 1) + cI;
      idx.push(a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new Mesh(g, materials.lacquerRed);
  mesh.name = 'menpo';
  mesh.castShadow = true;
  return mesh;
}

/** 陣笠 jingasa — the conical field hat. A lathe with a flat brim and a shallow dome. */
function buildJingasa(rig, dens, materials) {
  const S = rig.scale;
  const seg = Math.max(10, dens.ringT);
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const prof = [
    [0.000, 0.098], [0.070, 0.088], [0.140, 0.060], [0.205, 0.024], [0.255, 0.000], [0.250, -0.012],
  ];
  for (let r = 0; r < prof.length; r++) {
    for (let cI = 0; cI <= seg; cI++) {
      const u = cI / seg, th = u * Math.PI * 2;
      const rad = prof[r][0] * S, y = prof[r][1] * S;
      pos.push(Math.cos(th) * rad, y, Math.sin(th) * rad);
      const dr = (prof[Math.min(prof.length - 1, r + 1)][0] - prof[Math.max(0, r - 1)][0]);
      const dy = (prof[Math.min(prof.length - 1, r + 1)][1] - prof[Math.max(0, r - 1)][1]);
      const l = Math.hypot(dr, dy) || 1;
      nor.push(Math.cos(th) * (-dy / l), (dr / l), Math.sin(th) * (-dy / l));
      uv.push(u, r / (prof.length - 1));
    }
  }
  for (let r = 0; r < prof.length - 1; r++) {
    for (let cI = 0; cI < seg; cI++) {
      const a = r * (seg + 1) + cI;
      idx.push(a, a + seg + 2, a + 1, a, a + seg + 1, a + seg + 2);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new Mesh(g, materials.lacquer);
  mesh.name = 'jingasa';
  mesh.castShadow = true;
  mesh.position.set(0, 0.145 * S, 0.012 * S);
  return mesh;
}

// ===========================================================================
// KATANA + SAYA
// ===========================================================================

const KATANA = {
  nagasa: 0.720,     // blade length, machi to kissaki
  sori: 0.019,       // max deviation from the chord — this is what "curved" means
  motohaba: 0.0320,  // width at the machi
  sakihaba: 0.0225,  // width at the yokote
  kasane: 0.0072,    // thickness at the mune
  tsuka: 0.258,      // handle length
  yokoteU: 0.955,    // where the kissaki facet begins
};

/** Blade spine at parameter u ∈ [-tsuka/nagasa, 1]: chord along +Y, sori toward +Z. */
function bladePoint(u, out, s) {
  const K = KATANA;
  const y = u * K.nagasa * s;
  // Parabolic arc: zero at both ends of the chord, max `sori` at the middle. The
  // handle continues the same curve backwards, which is exactly how a mounted
  // katana's tsuka ends up angled relative to the blade.
  const z = K.sori * s * (1 - (2 * u - 1) * (2 * u - 1));
  out[0] = 0; out[1] = y; out[2] = z;
  return out;
}

/**
 * The blade. Five flat-shaded bands — mune, two ji faces, two ha bevels — so the
 * shinogi ridge stays a crisp highlight line instead of a smeared gradient. That
 * ridge is where the anisotropic specular in Materials.js does its work.
 */
function buildBlade(seg, scale, material) {
  const K = KATANA;
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const p = [0, 0, 0], pn = [0, 0, 0];
  const S = scale;

  // Section outline in (x, zOffsetFromMune) as fractions of kasane/width.
  const ring = new Float64Array(10);
  const bands = 5;
  const vertsPerStation = bands * 2;

  for (let i = 0; i < seg; i++) {
    const u = i / (seg - 1);
    bladePoint(u, p, S);
    bladePoint(Math.min(1, u + 0.01), pn, S);
    let ty = pn[1] - p[1], tz = pn[2] - p[2];
    const tl = Math.hypot(ty, tz) || 1; ty /= tl; tz /= tl;

    let w = lerp(K.motohaba, K.sakihaba, u) * S;
    let k = K.kasane * S * lerp(1.0, 0.72, u);
    if (u > K.yokoteU) {
      const kt = (u - K.yokoteU) / (1 - K.yokoteU);
      const shrink = Math.sqrt(Math.max(0, 1 - kt * kt));
      w *= shrink; k *= Math.max(0.12, shrink);
    }
    // Outline points: mune+, shinogi+, ha, shinogi-, mune-
    ring[0] = k * 0.16; ring[1] = 0;
    ring[2] = k * 0.5; ring[3] = -0.30 * w;
    ring[4] = 0; ring[5] = -w;
    ring[6] = -k * 0.5; ring[7] = -0.30 * w;
    ring[8] = -k * 0.16; ring[9] = 0;

    for (let bIdx = 0; bIdx < bands; bIdx++) {
      const a0 = bIdx * 2, a1 = ((bIdx + 1) % bands) * 2;
      const x0 = ring[a0], d0 = ring[a0 + 1];
      const x1 = ring[a1], d1 = ring[a1 + 1];
      // Facet normal in the section plane, lifted into world by the tangent frame.
      let ex = x1 - x0, ed = d1 - d0;
      const el = Math.hypot(ex, ed) || 1; ex /= el; ed /= el;
      const nx = ed, nd = -ex;
      const wnx = nx;
      const wny = nd * -tz;
      const wnz = nd * ty;
      const nl = Math.hypot(wnx, wny, wnz) || 1;
      for (const [xx, dd] of [[x0, d0], [x1, d1]]) {
        pos.push(p[0] + xx, p[1] + dd * -tz, p[2] + dd * ty);
        nor.push(wnx / nl, wny / nl, wnz / nl);
        // U runs along the blade so the tangent (and the anisotropy) does too.
        uv.push(u, bIdx / bands);
      }
    }
  }
  for (let i = 0; i < seg - 1; i++) {
    for (let bIdx = 0; bIdx < bands; bIdx++) {
      const a = i * vertsPerStation + bIdx * 2;
      const c = a + vertsPerStation;
      idx.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new Mesh(g, material);
  mesh.name = 'blade';
  mesh.castShadow = true;
  return mesh;
}

/** Lathed ring solid — tsuba, habaki, fuchi, kashira all come out of this. */
function latheRing(profile, seg, material, name) {
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const rows = profile.length;
  for (let r = 0; r < rows; r++) {
    for (let cI = 0; cI <= seg; cI++) {
      const u = cI / seg, th = u * Math.PI * 2;
      const ca = Math.cos(th), sa = Math.sin(th);
      // Tsuba and fuchi are ovals, not discs — the third profile column squashes Z.
      const rad = profile[r][0];
      pos.push(ca * rad, profile[r][1], sa * rad * (profile[r][2] || 1));
      const rp = profile[Math.max(0, r - 1)], rn = profile[Math.min(rows - 1, r + 1)];
      const dr = rn[0] - rp[0], dy = rn[1] - rp[1];
      const l = Math.hypot(dr, dy) || 1;
      nor.push(ca * (dy / l), -(dr / l), sa * (dy / l));
      uv.push(u, r / (rows - 1));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let cI = 0; cI < seg; cI++) {
      const a = r * (seg + 1) + cI;
      idx.push(a, a + 1, a + seg + 2, a, a + seg + 2, a + seg + 1);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new Mesh(g, material);
  mesh.name = name || 'lathe';
  mesh.castShadow = true;
  return mesh;
}

/**
 * 柄巻き ito wrap, in geometry. Two pairs of counter-wound ribbons laid on the tsuka
 * surface; where they cross they form the diamond lattice, and the gaps between the
 * crossings show the samegawa underneath. Doing this with geometry rather than a
 * normal map means the silhouette of the handle is correct in a close-up finisher.
 */
function buildItoWrap(scale, turns, ribbons, material) {
  const S = scale;
  const L = KATANA.tsuka * S;
  const rx = 0.0175 * S, rz = 0.0128 * S;
  const g = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const samples = 26;
  const halfW = 0.0062 * S;

  for (let rb = 0; rb < ribbons; rb++) {
    const dir = rb % 2 === 0 ? 1 : -1;
    const phase = Math.floor(rb / 2) * Math.PI;
    const base = pos.length / 3;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const y = 0.012 * S + t * (L - 0.030 * S);
      const ang = dir * (t * turns * Math.PI * 2) + phase;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // Surface tangent along the helix, used to widen the ribbon across the wrap.
      const cx = ca * rx, cz = sa * rz;
      const nx = ca / rx, nz = sa / rz;
      const nl = Math.hypot(nx, nz) || 1;
      const ux = -sa * rx * dir, uz = ca * rz * dir;
      const dy = (L - 0.030 * S) / (samples - 1);
      const tl = Math.hypot(ux, dy, uz) || 1;
      // Across-vector = tangent × normal.
      let ax = (dy / tl) * (nz / nl) - 0;
      let az = 0 - (dy / tl) * (nx / nl);
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      for (let s = -1; s <= 1; s += 2) {
        pos.push(cx + ax * halfW * s + (nx / nl) * 0.0016 * S, y,
          cz + az * halfW * s + (nz / nl) * 0.0016 * S);
        nor.push(nx / nl, 0.12, nz / nl);
        uv.push(t * 4, (s + 1) * 0.5);
      }
    }
    for (let i = 0; i < samples - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new Mesh(g, material);
  mesh.name = 'ito';
  mesh.castShadow = true;
  return mesh;
}

/**
 * The full koshirae. Local origin sits at the grip point on the tsuka with the blade
 * running along +Y; the attachment node on the hand supplies the rest of the transform
 * so Player.js can tune the grip without touching geometry.
 */
export function buildKatana(quality, materials, scale) {
  const S = scale === undefined ? 1 : scale;
  const dens = meshDensity(quality);
  const seg = dens.lon > 1.1 ? 22 : dens.lon > 0.8 ? 16 : 11;
  const latheSeg = dens.lon > 1.1 ? 16 : dens.lon > 0.8 ? 12 : 8;
  const g = new Group();
  g.name = 'katana';

  const blade = buildBlade(seg, S, materials.steel);
  blade.position.y = KATANA.tsuka * S * 0.42;
  g.add(blade);

  const habaki = latheRing([
    [0.0125 * S, -0.004 * S, 0.62], [0.0142 * S, 0.000, 0.62],
    [0.0140 * S, 0.026 * S, 0.62], [0.0118 * S, 0.030 * S, 0.62],
  ], latheSeg, materials.brass, 'habaki');
  habaki.position.y = blade.position.y - 0.002 * S;
  g.add(habaki);

  const tsuba = latheRing([
    [0.0110 * S, -0.0026 * S, 0.68], [0.0380 * S, -0.0030 * S, 0.86],
    [0.0392 * S, 0.0000, 0.88], [0.0380 * S, 0.0030 * S, 0.86],
    [0.0110 * S, 0.0026 * S, 0.68],
  ], latheSeg, materials.iron, 'tsuba');
  tsuba.position.y = blade.position.y - 0.006 * S;
  g.add(tsuba);

  // Tsuka core, tapering slightly toward the kashira like a real oval handle.
  const core = latheRing([
    [0.0176 * S, 0.006 * S, 0.73], [0.0182 * S, 0.030 * S, 0.73],
    [0.0170 * S, KATANA.tsuka * S * 0.55, 0.72], [0.0166 * S, KATANA.tsuka * S - 0.020 * S, 0.72],
    [0.0150 * S, KATANA.tsuka * S - 0.004 * S, 0.72],
  ], latheSeg, materials.samegawa, 'tsuka');
  core.position.y = blade.position.y - KATANA.tsuka * S;
  g.add(core);

  const wrap = buildItoWrap(S, dens.lon > 1.1 ? 5 : 4, dens.lon > 0.8 ? 4 : 2, materials.ito);
  wrap.position.y = core.position.y;
  g.add(wrap);

  const fuchi = latheRing([
    [0.0184 * S, 0.000, 0.73], [0.0196 * S, 0.004 * S, 0.74],
    [0.0192 * S, 0.016 * S, 0.74], [0.0176 * S, 0.018 * S, 0.73],
  ], latheSeg, materials.brass, 'fuchi');
  fuchi.position.y = core.position.y + KATANA.tsuka * S - 0.020 * S;
  g.add(fuchi);

  const kashira = latheRing([
    [0.0120 * S, -0.002 * S, 0.72], [0.0168 * S, 0.002 * S, 0.72],
    [0.0164 * S, 0.014 * S, 0.72], [0.0090 * S, 0.019 * S, 0.72],
  ], latheSeg, materials.brass, 'kashira');
  kashira.position.y = core.position.y - 0.014 * S;
  g.add(kashira);

  // Socket at the kissaki: Combat.js reads this for the weapon capsule and Effects.js
  // hangs the blade trail off it, so it must be an object, not a computed offset.
  const tip = new Object3D();
  tip.name = 'kissaki';
  tip.position.set(0, blade.position.y + KATANA.nagasa * S, KATANA.sori * S * 0.05);
  g.add(tip);
  const guard = new Object3D();
  guard.name = 'tsuba-point';
  guard.position.copy(tsuba.position);
  g.add(guard);

  g.userData.tip = tip;
  g.userData.guard = guard;
  g.userData.length = KATANA.nagasa * S;
  return g;
}

/** 鞘 saya — the lacquered scabbard, curved to match the blade, with a kurigata knob. */
export function buildSaya(quality, materials, scale) {
  const S = scale === undefined ? 1 : scale;
  const dens = meshDensity(quality);
  const seg = dens.lon > 1.1 ? 14 : dens.lon > 0.8 ? 10 : 7;
  const latheSeg = dens.lon > 1.1 ? 12 : 8;
  const g = new Group();
  g.name = 'saya';

  const geo = new BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  const ringSeg = dens.lon > 0.8 ? 8 : 6;
  const p = [0, 0, 0], pn = [0, 0, 0];
  for (let i = 0; i < seg; i++) {
    const u = (i / (seg - 1)) * 1.028 - 0.010;
    bladePoint(u, p, S);
    bladePoint(u + 0.01, pn, S);
    let ty = pn[1] - p[1], tz = pn[2] - p[2];
    const tl = Math.hypot(ty, tz) || 1; ty /= tl; tz /= tl;
    const t = clamp(u, 0, 1);
    let hw = lerp(KATANA.motohaba, KATANA.sakihaba, t) * 0.5 * S + 0.0052 * S;
    let hk = KATANA.kasane * S * lerp(1.0, 0.78, t) * 0.5 + 0.0048 * S;
    if (u > 0.99) { const k = (u - 0.99) / 0.038; hw *= Math.max(0.25, 1 - k); hk *= Math.max(0.25, 1 - k); }
    for (let j = 0; j <= ringSeg; j++) {
      const a = (j / ringSeg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ox = ca * hk, od = sa * hw - lerp(KATANA.motohaba, KATANA.sakihaba, t) * 0.5 * S;
      pos.push(p[0] + ox, p[1] + od * -tz, p[2] + od * ty);
      let gx = ca / hk, gd = sa / hw;
      const gl = Math.hypot(gx, gd) || 1;
      nor.push(gx / gl, (gd / gl) * -tz, (gd / gl) * ty);
      uv.push(j / ringSeg, u * KATANA.nagasa * S * UV_PER_METRE);
    }
  }
  for (let i = 0; i < seg - 1; i++) {
    for (let j = 0; j < ringSeg; j++) {
      const a = i * (ringSeg + 1) + j, c = a + ringSeg + 1;
      idx.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const body = new Mesh(geo, materials.lacquer);
  body.name = 'saya-body';
  body.castShadow = true;
  g.add(body);

  const koiguchi = latheRing([
    [0.0150 * S, -0.004 * S, 0.60], [0.0166 * S, 0.000, 0.60],
    [0.0162 * S, 0.020 * S, 0.60], [0.0148 * S, 0.024 * S, 0.60],
  ], latheSeg, materials.horn, 'koiguchi');
  g.add(koiguchi);

  const kojiri = latheRing([
    [0.0090 * S, KATANA.nagasa * S * 0.985, 0.58], [0.0116 * S, KATANA.nagasa * S * 0.995, 0.58],
    [0.0110 * S, KATANA.nagasa * S * 1.020, 0.58], [0.0040 * S, KATANA.nagasa * S * 1.030, 0.58],
  ], latheSeg, materials.horn, 'kojiri');
  kojiri.position.z = KATANA.sori * S * 0.06;
  g.add(kojiri);

  // 栗形 kurigata: the little knob the sageo threads through.
  const kurigata = latheRing([
    [0.0040 * S, 0.000, 1], [0.0072 * S, 0.004 * S, 1],
    [0.0070 * S, 0.016 * S, 1], [0.0038 * S, 0.020 * S, 1],
  ], 8, materials.horn, 'kurigata');
  kurigata.rotation.z = Math.PI * 0.5;
  kurigata.position.set(0.0, 0.100 * S, -0.014 * S);
  g.add(kurigata);

  const mouth = new Object3D();
  mouth.name = 'koiguchi-point';
  g.add(mouth);
  g.userData.mouth = mouth;
  g.userData.cordAnchor = kurigata;
  return g;
}

// ===========================================================================
// VERLET CLOTH
// ===========================================================================

const WIND_FORCE = 8.5;
const CLOTH_GRAVITY = -14.0;   // softer than game gravity; real cloth has drag

/**
 * A cols × rows particle grid solved with Verlet integration and distance
 * constraints. Everything soft on the character is one of these: the hakama is a
 * closed ring, the sash tail and sageo are two-column ribbons, the topknot is three.
 *
 * Particles live in the rig's root-local space, which means the whole simulation is
 * unaffected by the character running across the map — only the anchors move, and
 * they move by the amount the *bones* moved, which is exactly the excitation cloth
 * should receive. World-space cloth on a fast-moving character is a lag machine.
 */
class ClothPatch {
  constructor(cols, rows, closed, opts) {
    const o = opts || {};
    this.cols = cols;
    this.rows = rows;
    this.closed = !!closed;
    this.n = cols * rows;
    this.pos = new Float32Array(this.n * 3);
    this.prev = new Float32Array(this.n * 3);
    this.invMass = new Float32Array(this.n);
    this.damping = o.damping === undefined ? 0.020 : o.damping;
    this.windScale = o.windScale === undefined ? 1 : o.windScale;
    this.stiffness = o.stiffness === undefined ? 1 : o.stiffness;
    this.maxStretch = o.maxStretch === undefined ? 1.35 : o.maxStretch;
    this.collide = o.collide !== false;
    this.doubleSided = o.doubleSided !== false;

    /** Pin descriptors for row 0: `{bone, off:[x,y,z]}` resolved to root space each frame. */
    this.anchors = new Array(cols);
    this.anchorPos = new Float32Array(cols * 3);
    this.restDown = new Float32Array(cols * 3);
    this.segLen = o.segLen || 0.08;

    this.constraints = [];   // flat [i, j, rest, w]
    this._cIdx = null;
    this._cRest = null;

    this.geometry = null;
    this.mesh = null;
    this._nor = null;
    this._swayPhase = o.phase === undefined ? 0 : o.phase;
  }

  index(c, r) { return r * this.cols + c; }

  /** `fn(c, r, out3)` writes the initial root-space position of each particle. */
  layout(fn) {
    const out = _v[0];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = this.index(c, r) * 3;
        fn(c, r, out);
        this.pos[i] = out.x; this.pos[i + 1] = out.y; this.pos[i + 2] = out.z;
        this.prev[i] = out.x; this.prev[i + 1] = out.y; this.prev[i + 2] = out.z;
        this.invMass[this.index(c, r)] = r === 0 ? 0 : 1;
      }
    }
    // Row-0 rest direction, used by the LOW-tier fallback and the stretch clamp.
    for (let c = 0; c < this.cols; c++) {
      const a = this.index(c, 0) * 3, b = this.index(c, Math.min(1, this.rows - 1)) * 3;
      this.restDown[c * 3] = this.pos[b] - this.pos[a];
      this.restDown[c * 3 + 1] = this.pos[b + 1] - this.pos[a + 1];
      this.restDown[c * 3 + 2] = this.pos[b + 2] - this.pos[a + 2];
    }
    this._buildConstraints();
    return this;
  }

  _buildConstraints() {
    const add = (a, b, w) => {
      const i = a * 3, j = b * 3;
      const d = Math.hypot(this.pos[i] - this.pos[j], this.pos[i + 1] - this.pos[j + 1],
        this.pos[i + 2] - this.pos[j + 2]);
      this.constraints.push(a, b, d, w);
    };
    const C = this.cols, R = this.rows;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = this.index(c, r);
        if (r + 1 < R) add(i, this.index(c, r + 1), 1);                    // structural
        if (c + 1 < C) add(i, this.index(c + 1, r), 0.9);
        else if (this.closed && C > 2) add(i, this.index(0, r), 0.9);
        // Shear keeps a skirt from collapsing into a fan; bend keeps it from folding
        // back on itself. Both at reduced weight so the cloth still reads as soft.
        if (r + 1 < R && c + 1 < C) add(i, this.index(c + 1, r + 1), 0.35);
        if (r + 1 < R && c > 0) add(i, this.index(c - 1, r + 1), 0.35);
        if (r + 2 < R) add(i, this.index(c, r + 2), 0.22);
      }
    }
    const n = this.constraints.length / 4;
    this._cIdx = new Uint16Array(n * 2);
    this._cRest = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      this._cIdx[k * 2] = this.constraints[k * 4];
      this._cIdx[k * 2 + 1] = this.constraints[k * 4 + 1];
      this._cRest[k * 2] = this.constraints[k * 4 + 2];
      this._cRest[k * 2 + 1] = this.constraints[k * 4 + 3];
    }
    this.constraints.length = 0;
  }

  buildGeometry(material, uvScale) {
    const C = this.cols, R = this.rows;
    const wrap = this.closed ? C : C - 1;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(this.n * 3), 3));
    g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(this.n * 3), 3));
    const uv = new Float32Array(this.n * 2);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = this.index(c, r) * 2;
        uv[i] = (c / C) * (uvScale || 1);
        uv[i + 1] = (r / (R - 1)) * (uvScale || 1);
      }
    }
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const idx = [];
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < wrap; c++) {
        const c1 = (c + 1) % C;
        const a = this.index(c, r), b = this.index(c1, r);
        const d = this.index(c, r + 1), e = this.index(c1, r + 1);
        idx.push(a, d, e, a, e, b);
      }
    }
    g.setIndex(idx);
    g.attributes.position.setUsage(DynamicDrawUsage);
    g.attributes.normal.setUsage(DynamicDrawUsage);
    g.boundingSphere = new Sphere(new Vector3(0, 1, 0), 2.2);
    this.geometry = g;
    this._nor = g.attributes.normal.array;
    const mesh = new Mesh(g, material);
    mesh.name = 'cloth';
    mesh.frustumCulled = false;   // bounds change every frame; culling would pop
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    return mesh;
  }

  /** Resolve the pin row from bone matrices. `toLocal` maps world → rig-root space. */
  updateAnchors(bones, toLocal) {
    const v = _v[5];
    for (let c = 0; c < this.cols; c++) {
      const a = this.anchors[c];
      if (!a) continue;
      const bone = bones[a.bone];
      if (!bone) continue;
      v.set(a.off[0], a.off[1], a.off[2]).applyMatrix4(bone.matrixWorld).applyMatrix4(toLocal);
      const i = c * 3;
      this.anchorPos[i] = v.x; this.anchorPos[i + 1] = v.y; this.anchorPos[i + 2] = v.z;
      const p = this.index(c, 0) * 3;
      this.pos[p] = v.x; this.pos[p + 1] = v.y; this.pos[p + 2] = v.z;
      this.prev[p] = v.x; this.prev[p + 1] = v.y; this.prev[p + 2] = v.z;
    }
  }

  step(dt, wx, wy, wz, colliders, iterations) {
    const pos = this.pos, prev = this.prev, im = this.invMass;
    const d = 1 - this.damping;
    const dt2 = dt * dt;
    const ax = wx * this.windScale, ay = CLOTH_GRAVITY + wy * this.windScale, az = wz * this.windScale;
    for (let i = 0; i < this.n; i++) {
      if (im[i] === 0) continue;
      const o = i * 3;
      for (let k = 0; k < 3; k++) {
        const cur = pos[o + k];
        const a = k === 0 ? ax : k === 1 ? ay : az;
        pos[o + k] = cur + (cur - prev[o + k]) * d + a * dt2;
        prev[o + k] = cur;
      }
    }
    const idx = this._cIdx, rest = this._cRest, nc = idx.length / 2;
    const stiff = this.stiffness;
    for (let it = 0; it < iterations; it++) {
      for (let k = 0; k < nc; k++) {
        const a = idx[k * 2], b = idx[k * 2 + 1];
        const wa = im[a], wb = im[b];
        const w = wa + wb;
        if (w === 0) continue;
        const ao = a * 3, bo = b * 3;
        const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-6) continue;
        const diff = ((len - rest[k * 2]) / len) * rest[k * 2 + 1] * stiff;
        const sa = (wa / w) * diff, sb = (wb / w) * diff;
        pos[ao] += dx * sa; pos[ao + 1] += dy * sa; pos[ao + 2] += dz * sa;
        pos[bo] -= dx * sb; pos[bo + 1] -= dy * sb; pos[bo + 2] -= dz * sb;
      }
      if (this.collide && colliders) this._collide(colliders);
    }
    this._clampStretch();
  }

  /** Push particles out of the body capsules. Two passes of this is plenty. */
  _collide(colliders) {
    const pos = this.pos, im = this.invMass;
    for (let i = 0; i < this.n; i++) {
      if (im[i] === 0) continue;
      const o = i * 3;
      const px = pos[o], py = pos[o + 1], pz = pos[o + 2];
      for (let k = 0; k < colliders.length; k++) {
        const cp = colliders[k];
        const ex = cp[3] - cp[0], ey = cp[4] - cp[1], ez = cp[5] - cp[2];
        const l2 = ex * ex + ey * ey + ez * ez;
        let t = l2 > 1e-9 ? ((px - cp[0]) * ex + (py - cp[1]) * ey + (pz - cp[2]) * ez) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = cp[0] + ex * t, cy = cp[1] + ey * t, cz = cp[2] + ez * t;
        let dx = px - cx, dy = py - cy, dz = pz - cz;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dl >= cp[6] || dl < 1e-6) continue;
        const push = (cp[6] - dl) / dl;
        pos[o] += dx * push; pos[o + 1] += dy * push; pos[o + 2] += dz * push;
      }
    }
  }

  /** Hard limit on how far a particle can drift from its pin — no exploding hakama. */
  _clampStretch() {
    const pos = this.pos, C = this.cols, R = this.rows;
    const maxPerRow = this.segLen * this.maxStretch;
    for (let c = 0; c < C; c++) {
      for (let r = 1; r < R; r++) {
        const a = this.index(c, r - 1) * 3, b = this.index(c, r) * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l <= maxPerRow || l < 1e-6) continue;
        const s = maxPerRow / l;
        pos[b] = pos[a] + dx * s; pos[b + 1] = pos[a + 1] + dy * s; pos[b + 2] = pos[a + 2] + dz * s;
      }
    }
  }

  /**
   * LOW-tier fallback: no solver, just a travelling wave down each column driven by
   * the wind vector. Costs nothing and, at the distance a LOW-tier device renders
   * these characters, is genuinely hard to tell from the simulation.
   */
  sway(t, wx, wy, wz) {
    const pos = this.pos, C = this.cols, R = this.rows;
    const wl = Math.hypot(wx, wy, wz) || 1;
    const ux = wx / wl, uz = wz / wl;
    const amp = Math.min(0.10, 0.012 + wl * 0.006);
    for (let c = 0; c < C; c++) {
      const a = c * 3;
      const ax = this.anchorPos[a], ay = this.anchorPos[a + 1], az = this.anchorPos[a + 2];
      const dxr = this.restDown[a], dyr = this.restDown[a + 1], dzr = this.restDown[a + 2];
      const phase = this._swayPhase + c * 0.55;
      for (let r = 0; r < R; r++) {
        const o = this.index(c, r) * 3;
        const f = r;
        const s = Math.sin(t * 2.4 + phase - r * 0.7) * amp * (r / (R - 1));
        pos[o] = ax + dxr * f + ux * s;
        pos[o + 1] = ay + dyr * f - Math.abs(s) * 0.35;
        pos[o + 2] = az + dzr * f + uz * s;
      }
    }
  }

  /** Write positions and recomputed normals into the dynamic geometry. */
  flush() {
    const g = this.geometry;
    if (!g) return;
    g.attributes.position.array.set(this.pos);
    g.attributes.position.needsUpdate = true;
    const nor = this._nor, pos = this.pos, C = this.cols, R = this.rows;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = this.index(c, r);
        const cL = this.closed ? (c - 1 + C) % C : Math.max(0, c - 1);
        const cR = this.closed ? (c + 1) % C : Math.min(C - 1, c + 1);
        const rU = Math.max(0, r - 1), rD = Math.min(R - 1, r + 1);
        const l = this.index(cL, r) * 3, rr = this.index(cR, r) * 3;
        const u = this.index(c, rU) * 3, dn = this.index(c, rD) * 3;
        const ax = pos[rr] - pos[l], ay = pos[rr + 1] - pos[l + 1], az = pos[rr + 2] - pos[l + 2];
        const bx = pos[dn] - pos[u], by = pos[dn + 1] - pos[u + 1], bz = pos[dn + 2] - pos[u + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const o = i * 3;
        nor[o] = nx / nl; nor[o + 1] = ny / nl; nor[o + 2] = nz / nl;
      }
    }
    g.attributes.normal.needsUpdate = true;
  }

  dispose() {
    if (this.geometry) this.geometry.dispose();
  }
}

// ===========================================================================
// MATERIALS
// ===========================================================================

/**
 * Materials.js owns the procedural PBR library, but it is written in parallel and may
 * not be up yet — and enemy archetypes carry their own palettes anyway. Resolution
 * order is: the shared library, then a palette-tinted standard material cached by
 * palette signature so eight enemies of one archetype still share one material set.
 */
const _matCache = new Map();

function resolveMaterials(ctx, palette, variant) {
  const p = palette || {};
  const key = variant + '|' + [p.cloth, p.armour, p.lacing, p.trim, p.metal, p.skin].join(',');
  const hit = _matCache.get(key);
  if (hit) return hit;

  const lib = ctx && ctx.materials;
  const pick = (name, fallback) => {
    if (lib) {
      try {
        const m = (typeof lib.get === 'function' ? lib.get(name) : lib[name]);
        if (m && m.isMaterial) return m;
      } catch { /* library not ready */ }
    }
    return fallback();
  };
  const std = (color, rough, metal, opts) => new MeshStandardMaterial(Object.assign({
    color: new Color(color), roughness: rough, metalness: metal || 0,
    vertexColors: false, side: FrontSide,
  }, opts || {}));

  const cloth = p.cloth !== undefined ? p.cloth : 0x2a2f38;
  const armour = p.armour !== undefined ? p.armour : 0x3a3128;
  const lacing = p.lacing !== undefined ? p.lacing : 0x7a1d16;
  const trim = p.trim !== undefined ? p.trim : 0xc8321e;
  const metal = p.metal !== undefined ? p.metal : 0xc9d3dc;
  const skin = p.skin !== undefined ? p.skin : 0xb08a63;

  const set = {
    // Vertex colours carry the baked crevice AO, so the skin material must read them.
    skin: pick('skin', () => std(skin, 0.74, 0, { vertexColors: true })),
    cloth: pick('cloth_kimono', () => std(cloth, 0.92, 0, { vertexColors: true })),
    clothAlt: pick('cloth_hakama', () => std(_col.set(cloth).multiplyScalar(0.72).getHex(), 0.94, 0)),
    obi: pick('cloth_obi', () => std(trim, 0.86, 0)),
    sash: pick('cloth_sash', () => std(trim, 0.80, 0, { side: DoubleSide })),
    skirt: pick('cloth_hakama', () => std(_col.set(cloth).multiplyScalar(0.78).getHex(), 0.94, 0, { side: DoubleSide })),
    hair: pick('hair', () => std(0x14100e, 0.62, 0, { side: DoubleSide })),
    steel: pick('steel_blade', () => std(metal, 0.16, 1.0)),
    iron: pick('iron_dark', () => std(0x35383c, 0.44, 0.9)),
    brass: pick('gold_leaf', () => std(0xc9a227, 0.34, 0.92)),
    lacquer: pick('lacquer_black', () => std(0x101014, 0.22, 0.12)),
    lacquerRed: pick('lacquer_red', () => std(_col.set(armour).getHex(), 0.30, 0.16)),
    horn: pick('horn', () => std(0x1a1614, 0.42, 0.05)),
    samegawa: pick('samegawa', () => std(0xd8d2c4, 0.66, 0)),
    ito: pick('leather_wrap', () => std(_col.set(lacing).multiplyScalar(0.85).getHex(), 0.78, 0)),
    lamellar: pick('lamellar', () => std(armour, 0.42, 0.35)),
    lacing: pick('lacing_cord', () => std(lacing, 0.86, 0)),
    cord: pick('cord', () => std(lacing, 0.88, 0, { side: DoubleSide })),
  };
  _matCache.set(key, set);
  return set;
}

// ===========================================================================
// NAME COMPATIBILITY
// ===========================================================================

/** camelCase → snake_case, so `bones.hand_r` and `bones.handR` are the same Bone. */
function snakeName(n) {
  return n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Attachment point aliases — the two call sites spell these differently. */
const ATTACH_ALIAS = {
  'hand.r': 'handR', 'hand_r': 'handR', 'handr': 'handR', 'righthand': 'handR',
  'hand.l': 'handL', 'hand_l': 'handL', 'handl': 'handL', 'lefthand': 'handL',
  'hip.l': 'sayaMount', 'hip_l': 'sayaMount', 'hipl': 'sayaMount', 'saya': 'sayaMount',
  'hip.r': 'hipR', 'hip_r': 'hipR',
  'head': 'head', 'back': 'backMount', 'spine': 'backMount', 'root': 'root', 'hips': 'hips',
};

/**
 * Enemy.js and Player.js were authored against their own move vocabularies. Rather
 * than force three files to agree on 60 strings, the rig maps their names onto the
 * clips Poses.js actually shipped. An unmapped name is a no-op, never a throw.
 */
const CLIP_ALIAS = {
  idle: 'idle_drawn_seigan', idle_alert: 'idle_drawn_seigan', idle_drawn: 'idle_drawn_seigan',
  idle_sheathed: 'idle_sheathed', alert: 'idle_drawn_jodan', stance_shift: 'idle_drawn_gedan',
  look_around: 'idle_drawn_seigan', riposte_ready: 'guard',
  back: 'walk_back', walk_backward: 'walk_back', turn_l: 'strafe_l', turn_r: 'strafe_r',
  strafe_left: 'strafe_l', strafe_right: 'strafe_r',
  taunt: 'taunt_sheathe_flourish', sheathe_flourish: 'taunt_sheathe_flourish',
  draw: 'draw_iai', iai: 'draw_iai',

  guard_hit: 'guard_impact', block: 'guard', deflect: 'parry',
  dodge_left: 'dodge_step_l', dodge_right: 'dodge_step_r', roll_back: 'dodge_roll',
  dodge: 'dodge_roll', roll: 'dodge_roll',

  hit_light: 'stagger_back', hit_heavy: 'stagger_back', hit_l: 'stagger_l', hit_r: 'stagger_r',
  flinch: 'stagger_back', stagger: 'stagger_back',
  death: 'death_forward', death_front: 'death_forward', dead: 'death_forward',
  executed: 'execution_victim', execute: 'execution_attacker',

  // 足軽 — yari. A spear has no katana arc, but the body mechanics of a thrust and a
  // sweep are the same shapes, and these enemies are read at 6 m through a rim light.
  atk_spear_thrust: 'thrust', atk_spear_thrust_step: 'thrust',
  atk_spear_sweep: 'slash_horizontal_r', atk_spear_shove: 'slash_overhead',
  // 浪人 — katana
  atk_katana_slash1: 'combo_1', atk_katana_slash2: 'combo_2', atk_katana_slash3: 'combo_3',
  atk_katana_kesa: 'slash_diagonal_dl', atk_katana_tsuki: 'thrust',
  atk_katana_feint: 'slash_horizontal_r', atk_katana_riposte: 'rising_cut',
  // 大鎧 — ōdachi
  atk_odachi_overhead: 'heavy_overhead', atk_odachi_cleave: 'slash_diagonal_dl',
  atk_odachi_cleave_back: 'slash_diagonal_dr', atk_odachi_charge: 'slash_overhead',
  atk_odachi_slam: 'heavy_overhead',
  // 忍 — kusarigama
  atk_kama_flurry1: 'combo_1', atk_kama_flurry2: 'combo_2', atk_kama_flurry3: 'slash_horizontal_l',
  atk_kama_dash: 'thrust', atk_kama_chain: 'slash_horizontal_r', atk_kama_throw: 'rising_cut',

  light_attack: 'combo_1', heavy_attack: 'heavy_overhead',
};

/** Base-layer clips that mean "drive the blend space", not "override locomotion". */
const LOCO_CLIP_SPEED = {
  idle_sheathed: [0, 0], idle_drawn_seigan: [0, 0], idle_drawn_jodan: [0, 0], idle_drawn_gedan: [0, 0],
  walk: [1.9, 0], run: [5.4, 0], sprint: [7.2, 0], walk_back: [-1.7, 0],
  strafe_l: [0, -2.4], strafe_r: [0, 2.4],
};

const STANCE_IDLE = {
  sheathed: 'idle_sheathed', seigan: 'idle_drawn_seigan', chudan: 'idle_drawn_seigan',
  mid: 'idle_drawn_seigan', jodan: 'idle_drawn_jodan', high: 'idle_drawn_jodan',
  gedan: 'idle_drawn_gedan', low: 'idle_drawn_gedan',
};
