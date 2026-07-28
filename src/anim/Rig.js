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

export { loftTube, loftSphere };
