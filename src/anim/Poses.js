/**
 * Poses.js — the hand-authored pose and clip library for KAGEROU 陽炎.
 *
 * There are no imported animations in this game, so every joint angle in here was
 * placed by hand against a silhouette. A samurai reads almost entirely through
 * silhouette: the hanmi (bladed) hips, the elbow that never locks, the back heel that
 * stays loaded. Sloppy numbers here cannot be rescued by anything downstream.
 *
 * ---------------------------------------------------------------------------
 * DATA CONTRACT
 * ---------------------------------------------------------------------------
 *   pose  = { boneName: { rot:[x,y,z] radians, pos?:[x,y,z] metres } }
 *   clip  = { name, duration, loop, layer, mask, keys:[{t, pose, ease?}], events:[{t,name}] }
 *
 * `rot` is a *delta from the rest skeleton* expressed as an XYZ euler in the bone's
 * local frame. `pos` is a *delta from the rest offset* in metres (only the hips and
 * a handful of dramatic poses use it). A bone absent from a pose keeps its rest value.
 *
 * ---------------------------------------------------------------------------
 * AXIS CONVENTION  (read this before editing a number)
 * ---------------------------------------------------------------------------
 * Rig.js builds every bone with an identity bind rotation, so at rest every bone's
 * local frame is world-aligned: +Y up, -Z forward, +X = the character's right.
 * That makes the deltas below directly readable:
 *
 *   spine / neck / head   +X lean back or look up   -X hunch or look down
 *                         +Y turn left              -Y turn right
 *                         +Z tilt left              -Z tilt right
 *   hips                  +Y right hip forward (this is how hanmi is authored)
 *                         +Z right hip up / left hip drops
 *   thigh                 +X swing leg forward      -X swing leg back
 *                         +Z (right) abduct out     -Z (left) abduct out
 *   shin                  -X knee flexion  (0 straight … -2.4 fully folded)
 *   foot                  +X toes up (dorsiflex)    -X point toes (plantarflex)
 *   toe                   +X toes bend up at the ball (toe-off)
 *   upperArm              +X swing arm forward      -X swing arm back
 *                         +Z (right) raise laterally  -Z (left) raise laterally
 *                         ±Y humeral twist
 *   foreArm               +X elbow flexion (0 straight … 2.4 folded)
 *                         ±Y pronation / supination — this is the wrist roll that
 *                            sets the edge direction on a cut, so it matters
 *   clavicle              +X shrug back  -X shrug forward  ±Z shoulder up/down
 *
 * Mirroring a pose across the sagittal plane is exact: swap the L/R bone names,
 * negate the Y and Z rotation components, negate the X position component. XYZ
 * euler order survives the reflection (S·Rx·S = Rx, S·Ry·S = Ry⁻¹, S·Rz·S = Rz⁻¹).
 *
 * ---------------------------------------------------------------------------
 * TIMING PHILOSOPHY
 * ---------------------------------------------------------------------------
 * Attacks are authored as anticipation → strike → recovery with roughly a 40/8/52
 * split. The strike itself is deliberately shorter than a keyframe interval would
 * naturally give you (three frames at 60 Hz ≈ 0.05 s) because a katana cut that is
 * legible in motion is a cut you cannot see. Recovery is long and is where all the
 * cancel windows live — that is the entire combat design in one sentence.
 *
 * Event markers drive Combat.js. `hit-active-start` / `hit-active-end` bracket the
 * frames on which the weapon capsule is live; `cancel-window-open` is the earliest
 * frame the clip may be interrupted by another attack; `swoosh` and `footstep` are
 * audio/FX cues. Never move a hit window without moving its swoosh.
 */

// ---------------------------------------------------------------------------
// authoring helpers
// ---------------------------------------------------------------------------

/**
 * Compact pose authoring: `bone: [rx,ry,rz]` or `bone: [rx,ry,rz, px,py,pz]`.
 * Expands to the documented `{rot, pos}` contract shape so consumers never have to
 * know about the shorthand. Frozen because clips share pose objects by reference.
 */
function P(src) {
  const out = {};
  for (const k in src) {
    const a = src[k];
    out[k] = a.length > 3
      ? { rot: [a[0], a[1], a[2]], pos: [a[3], a[4], a[5]] }
      : { rot: [a[0], a[1], a[2]] };
    Object.freeze(out[k].rot);
    if (out[k].pos) Object.freeze(out[k].pos);
    Object.freeze(out[k]);
  }
  return Object.freeze(out);
}

function mirrorName(n) {
  const last = n.charCodeAt(n.length - 1);
  if (last === 76 /* L */) return n.slice(0, -1) + 'R';
  if (last === 82 /* R */) return n.slice(0, -1) + 'L';
  return n;
}

/** Exact sagittal mirror of a pose. Used for every clip whose read is symmetric. */
function mirror(pose) {
  const out = {};
  for (const k in pose) {
    const e = pose[k];
    const r = e.rot;
    const v = { rot: [r[0], -r[1], -r[2]] };
    if (e.pos) v.pos = [-e.pos[0], e.pos[1], e.pos[2]];
    Object.freeze(v.rot);
    if (v.pos) Object.freeze(v.pos);
    out[mirrorName(k)] = Object.freeze(v);
  }
  return Object.freeze(out);
}

/**
 * Weighted blend of two poses, evaluated once at module load. Lets a derived pose
 * ("three quarters of the way into the windup") be expressed without retyping 22
 * joints, which is how most of the in-between keys below were built.
 */
function blend(a, b, t) {
  const out = {};
  const keys = new Set();
  for (const k in a) keys.add(k);
  for (const k in b) keys.add(k);
  for (const k of keys) {
    const ea = a[k], eb = b[k];
    const ra = ea ? ea.rot : ZERO3, rb = eb ? eb.rot : ZERO3;
    const pa = ea && ea.pos ? ea.pos : ZERO3, pb = eb && eb.pos ? eb.pos : ZERO3;
    const v = { rot: [
      ra[0] + (rb[0] - ra[0]) * t,
      ra[1] + (rb[1] - ra[1]) * t,
      ra[2] + (rb[2] - ra[2]) * t,
    ] };
    if ((ea && ea.pos) || (eb && eb.pos)) {
      v.pos = [
        pa[0] + (pb[0] - pa[0]) * t,
        pa[1] + (pb[1] - pa[1]) * t,
        pa[2] + (pb[2] - pa[2]) * t,
      ];
      Object.freeze(v.pos);
    }
    Object.freeze(v.rot);
    out[k] = Object.freeze(v);
  }
  return Object.freeze(out);
}

const ZERO3 = Object.freeze([0, 0, 0]);

/** Easing curve names understood by Rig's sampler. */
export const EASINGS = Object.freeze([
  'linear', 'smooth', 'smoother', 'in', 'out', 'inOut', 'back', 'snap', 'hold', 'elastic',
]);

// ===========================================================================
// 1. REST + IDLES
// ===========================================================================

/** The zero pose. Everything else is a delta from the rest skeleton in Rig.js. */
const rest = P({});

/**
 * 自然体 shizentai. Sheathed, not expecting trouble, but a swordsman's "relaxed"
 * still keeps the left thumb resting on the tsuba and the right foot loaded back.
 */
const idle_sheathed = P({
  hips:      [0.02, 0.06, 0.010, 0, -0.014, 0],
  spine1:    [-0.030, -0.010, 0],
  spine2:    [-0.028, 0.020, -0.006],
  spine3:    [-0.018, 0.030, -0.006],
  neck:      [0.040, -0.020, 0.004],
  head:      [0.022, -0.055, 0.006],
  clavicleR: [0.020, 0, -0.050],
  upperArmR: [0.130, 0.180, -0.270],
  foreArmR:  [0.290, 0.180, 0],
  handR:     [-0.060, 0.120, -0.080],
  clavicleL: [0.010, 0, 0.040],
  upperArmL: [0.180, -0.240, 0.240],
  foreArmL:  [0.620, -0.420, 0],
  handL:     [-0.120, -0.260, 0.140],
  thighR:    [-0.070, -0.120, 0.055],
  shinR:     [-0.130, 0, 0],
  footR:     [0.020, -0.100, 0],
  toeR:      [0.030, 0, 0],
  thighL:    [0.040, 0.100, -0.048],
  shinL:     [-0.070, 0, 0],
  footL:     [-0.010, 0.080, 0],
  toeL:      [0.020, 0, 0],
});

/** Second breath of the sheathed idle — weight rolls onto the back foot. */
const idle_sheathed_b = P({
  hips:      [0.006, 0.048, -0.014, 0.010, -0.024, 0.004],
  spine1:    [-0.010, -0.004, 0.010],
  spine2:    [-0.006, 0.024, 0.014],
  spine3:    [0.004, 0.034, 0.012],
  neck:      [0.020, -0.010, -0.010],
  head:      [0.010, -0.020, -0.012],
  clavicleR: [0.010, 0, -0.028],
  upperArmR: [0.090, 0.180, -0.230],
  foreArmR:  [0.340, 0.180, 0],
  handR:     [-0.040, 0.120, -0.060],
  clavicleL: [0.004, 0, 0.020],
  upperArmL: [0.150, -0.240, 0.210],
  foreArmL:  [0.660, -0.420, 0],
  handL:     [-0.100, -0.260, 0.120],
  thighR:    [-0.120, -0.120, 0.070],
  shinR:     [-0.060, 0, 0],
  footR:     [0.060, -0.100, 0],
  toeR:      [0.010, 0, 0],
  thighL:    [0.080, 0.100, -0.062],
  shinL:     [-0.130, 0, 0],
  footL:     [-0.040, 0.080, 0],
  toeL:      [0.040, 0, 0],
});

/**
 * 中段 chūdan-no-kamae (seigan). The default fighting stance: right foot forward,
 * hips bladed, kissaki aimed at the opponent's throat, both elbows soft. The left
 * hand does the work at the kashira, the right hand only steers.
 */
const idle_seigan = P({
  hips:      [0.050, 0.320, 0.004, 0, -0.052, -0.010],
  spine1:    [-0.055, -0.055, 0],
  spine2:    [-0.045, -0.060, 0],
  spine3:    [-0.030, -0.065, 0],
  neck:      [0.070, -0.055, 0],
  head:      [0.030, -0.075, 0],
  clavicleR: [-0.030, -0.090, -0.070],
  upperArmR: [0.880, 0.140, -0.400],
  foreArmR:  [1.230, 0.260, 0],
  handR:     [-0.180, 0.180, 0.090],
  clavicleL: [-0.020, 0.090, 0.060],
  upperArmL: [0.700, -0.140, 0.300],
  foreArmL:  [1.060, -0.260, 0],
  handL:     [-0.140, -0.180, -0.090],
  thighR:    [0.300, -0.170, 0.060],
  shinR:     [-0.150, 0, 0],
  footR:     [-0.080, -0.060, 0],
  toeR:      [0.020, 0, 0],
  thighL:    [-0.300, 0.150, -0.070],
  shinL:     [-0.420, 0, 0],
  footL:     [-0.140, 0.110, 0],
  toeL:      [0.180, 0, 0],
});

/** Seigan, exhale — the tip drifts a few centimetres and settles. */
const idle_seigan_b = P({
  hips:      [0.032, 0.320, -0.010, 0, -0.062, -0.010],
  spine1:    [-0.030, -0.050, 0.010],
  spine2:    [-0.018, -0.055, 0.014],
  spine3:    [-0.004, -0.060, 0.012],
  neck:      [0.050, -0.050, -0.010],
  head:      [0.014, -0.070, -0.012],
  clavicleR: [-0.014, -0.090, -0.050],
  upperArmR: [0.840, 0.140, -0.375],
  foreArmR:  [1.280, 0.260, 0],
  handR:     [-0.150, 0.180, 0.090],
  clavicleL: [-0.008, 0.090, 0.042],
  upperArmL: [0.665, -0.140, 0.280],
  foreArmL:  [1.110, -0.260, 0],
  handL:     [-0.110, -0.180, -0.090],
  thighR:    [0.330, -0.170, 0.070],
  shinR:     [-0.190, 0, 0],
  footR:     [-0.060, -0.060, 0],
  toeR:      [0.010, 0, 0],
  thighL:    [-0.270, 0.150, -0.082],
  shinL:     [-0.460, 0, 0],
  footL:     [-0.160, 0.110, 0],
  toeL:      [0.200, 0, 0],
});

/**
 * 上段 jōdan-no-kamae. Sword above and slightly behind the head, hands framing the
 * right temple. Reads as pure threat: the whole silhouette is a loaded spring.
 */
const idle_jodan = P({
  hips:      [0.010, 0.260, 0.004, 0, -0.030, -0.008],
  spine1:    [-0.075, -0.040, 0],
  spine2:    [-0.060, -0.045, 0],
  spine3:    [-0.045, -0.050, 0],
  neck:      [0.110, -0.045, 0],
  head:      [0.060, -0.060, 0],
  clavicleR: [-0.140, -0.060, -0.150],
  upperArmR: [2.450, 0.100, -0.330],
  foreArmR:  [0.980, 0.320, 0],
  handR:     [-0.260, 0.140, 0.080],
  clavicleL: [-0.130, 0.060, 0.140],
  upperArmL: [2.300, -0.100, 0.250],
  foreArmL:  [0.860, -0.320, 0],
  handL:     [-0.210, -0.140, -0.080],
  thighR:    [0.250, -0.150, 0.055],
  shinR:     [-0.110, 0, 0],
  footR:     [-0.060, -0.050, 0],
  thighL:    [-0.260, 0.130, -0.065],
  shinL:     [-0.330, 0, 0],
  footL:     [-0.120, 0.100, 0],
  toeL:      [0.150, 0, 0],
});

const idle_jodan_b = blend(idle_jodan, P({
  hips:      [-0.010, 0.260, -0.010, 0, -0.042, -0.008],
  spine1:    [-0.050, -0.040, 0.012],
  spine2:    [-0.034, -0.045, 0.016],
  clavicleR: [-0.120, -0.060, -0.125],
  upperArmR: [2.400, 0.100, -0.310],
  foreArmR:  [1.030, 0.320, 0],
  clavicleL: [-0.110, 0.060, 0.118],
  upperArmL: [2.255, -0.100, 0.232],
  foreArmL:  [0.910, -0.320, 0],
  thighR:    [0.285, -0.150, 0.068],
  shinR:     [-0.150, 0, 0],
  thighL:    [-0.230, 0.130, -0.078],
  shinL:     [-0.370, 0, 0],
}), 1.0);

/**
 * 下段 gedan-no-kamae. Tip below the knee, hands at the hips, chest open. An
 * invitation. Everything about it is designed to make the opponent commit first.
 */
const idle_gedan = P({
  hips:      [0.030, 0.290, 0.004, 0, -0.058, -0.010],
  spine1:    [-0.020, -0.050, 0],
  spine2:    [-0.014, -0.055, 0],
  spine3:    [0.010, -0.060, 0],
  neck:      [0.030, -0.050, 0],
  head:      [0.010, -0.070, 0],
  clavicleR: [0.030, -0.070, -0.030],
  upperArmR: [0.360, 0.160, -0.290],
  foreArmR:  [0.560, 0.220, 0],
  handR:     [-0.120, 0.160, 0.070],
  clavicleL: [0.020, 0.070, 0.030],
  upperArmL: [0.280, -0.160, 0.220],
  foreArmL:  [0.440, -0.220, 0],
  handL:     [-0.090, -0.160, -0.070],
  thighR:    [0.340, -0.180, 0.070],
  shinR:     [-0.230, 0, 0],
  footR:     [-0.060, -0.060, 0],
  thighL:    [-0.330, 0.160, -0.080],
  shinL:     [-0.500, 0, 0],
  footL:     [-0.150, 0.120, 0],
  toeL:      [0.200, 0, 0],
});

const idle_gedan_b = blend(idle_gedan, P({
  hips:      [0.010, 0.290, -0.010, 0, -0.070, -0.010],
  spine1:    [0.004, -0.045, 0.012],
  spine2:    [0.010, -0.050, 0.015],
  upperArmR: [0.330, 0.160, -0.270],
  foreArmR:  [0.600, 0.220, 0],
  upperArmL: [0.255, -0.160, 0.205],
  foreArmL:  [0.480, -0.220, 0],
  thighR:    [0.370, -0.180, 0.082],
  shinR:     [-0.270, 0, 0],
  thighL:    [-0.300, 0.160, -0.092],
  shinL:     [-0.540, 0, 0],
}), 1.0);

// ===========================================================================
// 2. LOCOMOTION
// ===========================================================================
// Every locomotion clip is authored as a normalised 1.0-second cycle with the
// RIGHT foot contacting at phase 0. Rig.js drives the phase from distance
// travelled, not from wall time, which is the only reliable cure for foot skate.
// Because every cycle shares that convention, the 2D blend space can cross-fade
// walk↔run↔strafe mid-stride without the feet ever disagreeing about which one
// is planted.

/** Right heel strike. Pelvis rotated right-forward, shoulders counter-rotated. */
const walk_c_r = P({
  hips:      [0.030, 0.115, 0.010, 0, -0.019, 0],
  spine1:    [-0.020, -0.055, 0],
  spine2:    [-0.018, -0.065, 0],
  spine3:    [-0.012, -0.075, 0],
  neck:      [0.030, 0.060, 0],
  head:      [0.014, 0.040, 0],
  clavicleR: [0.060, 0.070, 0],
  upperArmR: [-0.400, 0.140, -0.115],
  foreArmR:  [0.320, 0.120, 0],
  handR:     [0.060, 0.060, 0],
  clavicleL: [-0.060, 0.070, 0],
  upperArmL: [0.470, -0.140, 0.115],
  foreArmL:  [0.540, -0.120, 0],
  handL:     [0.060, -0.060, 0],
  thighR:    [0.460, -0.055, 0.030],
  shinR:     [-0.075, 0, 0],
  footR:     [0.215, 0, 0],
  toeR:      [0.020, 0, 0],
  thighL:    [-0.480, 0.055, -0.030],
  shinL:     [-0.300, 0, 0],
  footL:     [-0.400, 0, 0],
  toeL:      [0.560, 0, 0],
});

/** Mid-stance on the right, left knee driving through. Highest point of the walk. */
const walk_p_r = P({
  hips:      [0.024, 0.005, 0.032, 0, 0.013, 0],
  spine1:    [-0.020, 0, -0.010],
  spine2:    [-0.018, 0, -0.014],
  spine3:    [-0.012, 0, -0.014],
  neck:      [0.030, 0, 0.010],
  head:      [0.014, 0, 0.012],
  clavicleR: [0.010, 0.010, 0],
  upperArmR: [-0.070, 0.140, -0.150],
  foreArmR:  [0.330, 0.120, 0],
  handR:     [0.030, 0.060, 0],
  clavicleL: [-0.010, 0.010, 0],
  upperArmL: [0.120, -0.140, 0.150],
  foreArmL:  [0.400, -0.120, 0],
  handL:     [0.030, -0.060, 0],
  thighR:    [-0.115, -0.020, 0.035],
  shinR:     [-0.045, 0, 0],
  footR:     [-0.040, 0, 0],
  toeR:      [0.060, 0, 0],
  thighL:    [0.155, 0.020, -0.035],
  shinL:     [-0.740, 0, 0],
  footL:     [0.170, 0, 0],
  toeL:      [0.020, 0, 0],
});

const walk_c_l = mirror(walk_c_r);
const walk_p_l = mirror(walk_p_r);

/** Run contact — forward lean, longer stride, arms driving hard. */
const run_c_r = P({
  hips:      [0.075, 0.190, 0.018, 0, -0.032, 0],
  spine1:    [-0.075, -0.090, 0],
  spine2:    [-0.070, -0.105, 0],
  spine3:    [-0.055, -0.120, 0],
  neck:      [0.150, 0.100, 0],
  head:      [0.060, 0.070, 0],
  clavicleR: [0.110, 0.120, 0],
  upperArmR: [-0.780, 0.220, -0.150],
  foreArmR:  [1.180, 0.260, 0],
  handR:     [0.100, 0.100, 0],
  clavicleL: [-0.110, 0.120, 0],
  upperArmL: [0.860, -0.220, 0.150],
  foreArmL:  [1.420, -0.260, 0],
  handL:     [0.100, -0.100, 0],
  thighR:    [0.640, -0.070, 0.038],
  shinR:     [-0.360, 0, 0],
  footR:     [0.130, 0, 0],
  toeR:      [0.030, 0, 0],
  thighL:    [-0.560, 0.070, -0.038],
  shinL:     [-0.560, 0, 0],
  footL:     [-0.320, 0, 0],
  toeL:      [0.480, 0, 0],
});

/** Loading — the right leg absorbs, hips at their lowest, chest closes down. */
const run_low_r = P({
  hips:      [0.085, 0.090, 0.045, 0, -0.070, 0],
  spine1:    [-0.095, -0.045, -0.014],
  spine2:    [-0.090, -0.050, -0.018],
  spine3:    [-0.070, -0.055, -0.018],
  neck:      [0.170, 0.050, 0.012],
  head:      [0.070, 0.030, 0.014],
  clavicleR: [0.060, 0.060, 0],
  upperArmR: [-0.430, 0.220, -0.180],
  foreArmR:  [1.240, 0.260, 0],
  handR:     [0.060, 0.100, 0],
  clavicleL: [-0.060, 0.060, 0],
  upperArmL: [0.470, -0.220, 0.180],
  foreArmL:  [1.320, -0.260, 0],
  handL:     [0.060, -0.100, 0],
  thighR:    [0.200, -0.040, 0.042],
  shinR:     [-0.500, 0, 0],
  footR:     [-0.100, 0, 0],
  toeR:      [0.080, 0, 0],
  thighL:    [0.100, 0.040, -0.042],
  shinL:     [-1.150, 0, 0],
  footL:     [0.220, 0, 0],
  toeL:      [0.020, 0, 0],
});

/** Flight — right leg extended behind after toe-off, left knee high, both feet clear. */
const run_air_r = P({
  hips:      [0.070, -0.060, -0.030, 0, 0.055, 0],
  spine1:    [-0.085, 0.030, 0.012],
  spine2:    [-0.080, 0.035, 0.016],
  spine3:    [-0.060, 0.040, 0.016],
  neck:      [0.160, -0.030, -0.010],
  head:      [0.065, -0.020, -0.012],
  clavicleR: [-0.040, -0.040, 0],
  upperArmR: [0.180, 0.220, -0.170],
  foreArmR:  [1.300, 0.260, 0],
  handR:     [0.040, 0.100, 0],
  clavicleL: [0.040, -0.040, 0],
  upperArmL: [-0.160, -0.220, 0.170],
  foreArmL:  [1.240, -0.260, 0],
  handL:     [0.040, -0.100, 0],
  thighR:    [-0.620, 0.030, 0.030],
  shinR:     [-1.320, 0, 0],
  footR:     [-0.400, 0, 0],
  toeR:      [0.300, 0, 0],
  thighL:    [0.760, -0.030, -0.030],
  shinL:     [-0.820, 0, 0],
  footL:     [0.180, 0, 0],
  toeL:      [0.020, 0, 0],
});

const run_c_l = mirror(run_c_r);
const run_low_l = mirror(run_low_r);
const run_air_l = mirror(run_air_r);

/** Sprint: everything from the run pushed further, chest almost over the lead knee. */
const sprint_c_r = P({
  hips:      [0.130, 0.240, 0.022, 0, -0.040, 0],
  spine1:    [-0.140, -0.115, 0],
  spine2:    [-0.135, -0.130, 0],
  spine3:    [-0.110, -0.150, 0],
  neck:      [0.280, 0.125, 0],
  head:      [0.120, 0.090, 0],
  clavicleR: [0.150, 0.150, 0],
  upperArmR: [-1.020, 0.260, -0.160],
  foreArmR:  [1.500, 0.300, 0],
  handR:     [0.140, 0.120, 0],
  clavicleL: [-0.150, 0.150, 0],
  upperArmL: [1.120, -0.260, 0.160],
  foreArmL:  [1.680, -0.300, 0],
  handL:     [0.140, -0.120, 0],
  thighR:    [0.790, -0.080, 0.040],
  shinR:     [-0.520, 0, 0],
  footR:     [0.060, 0, 0],
  toeR:      [0.040, 0, 0],
  thighL:    [-0.700, 0.080, -0.040],
  shinL:     [-0.700, 0, 0],
  footL:     [-0.360, 0, 0],
  toeL:      [0.560, 0, 0],
});

const sprint_low_r = P({
  hips:      [0.150, 0.120, 0.052, 0, -0.086, 0],
  spine1:    [-0.165, -0.060, -0.016],
  spine2:    [-0.160, -0.065, -0.020],
  spine3:    [-0.130, -0.070, -0.020],
  neck:      [0.310, 0.060, 0.014],
  head:      [0.135, 0.040, 0.016],
  clavicleR: [0.080, 0.075, 0],
  upperArmR: [-0.560, 0.260, -0.190],
  foreArmR:  [1.560, 0.300, 0],
  handR:     [0.080, 0.120, 0],
  clavicleL: [-0.080, 0.075, 0],
  upperArmL: [0.600, -0.260, 0.190],
  foreArmL:  [1.580, -0.300, 0],
  handL:     [0.080, -0.120, 0],
  thighR:    [0.250, -0.050, 0.045],
  shinR:     [-0.660, 0, 0],
  footR:     [-0.140, 0, 0],
  toeR:      [0.100, 0, 0],
  thighL:    [0.180, 0.050, -0.045],
  shinL:     [-1.450, 0, 0],
  footL:     [0.260, 0, 0],
});

const sprint_air_r = P({
  hips:      [0.120, -0.090, -0.036, 0, 0.080, 0],
  spine1:    [-0.150, 0.045, 0.014],
  spine2:    [-0.145, 0.050, 0.018],
  spine3:    [-0.115, 0.055, 0.018],
  neck:      [0.290, -0.045, -0.012],
  head:      [0.125, -0.030, -0.014],
  clavicleR: [-0.060, -0.055, 0],
  upperArmR: [0.320, 0.260, -0.180],
  foreArmR:  [1.620, 0.300, 0],
  handR:     [0.060, 0.120, 0],
  clavicleL: [0.060, -0.055, 0],
  upperArmL: [-0.280, -0.260, 0.180],
  foreArmL:  [1.480, -0.300, 0],
  handL:     [0.060, -0.120, 0],
  thighR:    [-0.820, 0.040, 0.032],
  shinR:     [-1.620, 0, 0],
  footR:     [-0.440, 0, 0],
  toeR:      [0.340, 0, 0],
  thighL:    [1.030, -0.040, -0.032],
  shinL:     [-0.960, 0, 0],
  footL:     [0.140, 0, 0],
});

const sprint_c_l = mirror(sprint_c_r);
const sprint_low_l = mirror(sprint_low_r);
const sprint_air_l = mirror(sprint_air_r);

/**
 * Backpedal. Short steps, weight over the back foot, torso stays square to the
 * enemy — you never turn your back walking out of a duel.
 */
const back_c_r = P({
  hips:      [-0.055, 0.080, 0.010, 0, -0.020, 0],
  spine1:    [0.045, -0.040, 0],
  spine2:    [0.040, -0.045, 0],
  spine3:    [0.030, -0.050, 0],
  neck:      [-0.030, 0.045, 0],
  head:      [-0.020, 0.030, 0],
  clavicleR: [0.030, 0.040, 0],
  upperArmR: [0.230, 0.150, -0.180],
  foreArmR:  [0.560, 0.180, 0],
  clavicleL: [-0.030, 0.040, 0],
  upperArmL: [0.120, -0.150, 0.180],
  foreArmL:  [0.680, -0.180, 0],
  thighR:    [-0.330, -0.045, 0.035],
  shinR:     [-0.230, 0, 0],
  footR:     [-0.220, 0, 0],
  toeR:      [0.180, 0, 0],
  thighL:    [0.180, 0.045, -0.035],
  shinL:     [-0.360, 0, 0],
  footL:     [0.120, 0, 0],
});

const back_p_r = P({
  hips:      [-0.045, -0.010, 0.028, 0, 0.008, 0],
  spine1:    [0.038, 0.005, -0.010],
  spine2:    [0.034, 0.005, -0.013],
  spine3:    [0.026, 0.005, -0.013],
  neck:      [-0.024, 0, 0.010],
  head:      [-0.016, 0, 0.012],
  upperArmR: [0.160, 0.150, -0.190],
  foreArmR:  [0.600, 0.180, 0],
  upperArmL: [0.180, -0.150, 0.190],
  foreArmL:  [0.620, -0.180, 0],
  thighR:    [0.060, -0.020, 0.038],
  shinR:     [-0.120, 0, 0],
  footR:     [0.040, 0, 0],
  thighL:    [-0.180, 0.020, -0.038],
  shinL:     [-0.620, 0, 0],
  footL:     [-0.060, 0, 0],
  toeL:      [0.140, 0, 0],
});

const back_c_l = mirror(back_c_r);
const back_p_l = mirror(back_p_r);

/**
 * Side-step cycle, leading with the LEFT foot. Authored so that phase 0 still has
 * the right foot loaded — that keeps it phase-compatible with the forward gaits so
 * a diagonal blend does not produce a limp.
 */
const strafe_l_0 = P({
  hips:      [0.020, 0.040, 0.030, 0, -0.030, 0],
  spine1:    [-0.020, -0.020, 0.045],
  spine2:    [-0.018, -0.020, 0.050],
  spine3:    [-0.012, -0.020, 0.040],
  neck:      [0.030, 0.020, -0.045],
  head:      [0.014, 0.030, -0.050],
  clavicleR: [0.020, 0.020, -0.040],
  upperArmR: [0.190, 0.160, -0.240],
  foreArmR:  [0.520, 0.200, 0],
  clavicleL: [0.020, -0.020, 0.040],
  upperArmL: [0.170, -0.160, 0.300],
  foreArmL:  [0.560, -0.200, 0],
  thighR:    [-0.060, -0.060, 0.090],
  shinR:     [-0.180, 0, 0],
  footR:     [0.020, -0.040, 0],
  thighL:    [-0.020, 0.060, -0.320],
  shinL:     [-0.240, 0, 0],
  footL:     [0.040, 0.040, 0],
});

const strafe_l_1 = P({
  hips:      [0.020, 0.030, -0.020, -0.010, -0.048, 0],
  spine1:    [-0.024, -0.014, 0.070],
  spine2:    [-0.022, -0.014, 0.078],
  spine3:    [-0.016, -0.014, 0.062],
  neck:      [0.034, 0.014, -0.070],
  head:      [0.016, 0.020, -0.078],
  clavicleR: [0.020, 0.015, -0.055],
  upperArmR: [0.220, 0.160, -0.310],
  foreArmR:  [0.500, 0.200, 0],
  clavicleL: [0.020, -0.015, 0.055],
  upperArmL: [0.200, -0.160, 0.400],
  foreArmL:  [0.540, -0.200, 0],
  thighR:    [-0.020, -0.050, 0.150],
  shinR:     [-0.140, 0, 0],
  footR:     [-0.060, -0.040, 0],
  toeR:      [0.120, 0, 0],
  thighL:    [-0.040, 0.050, -0.520],
  shinL:     [-0.120, 0, 0],
  footL:     [0.120, 0.040, 0],
});

const strafe_l_2 = P({
  hips:      [0.020, 0.040, -0.045, -0.014, -0.026, 0],
  spine1:    [-0.020, -0.020, 0.050],
  spine2:    [-0.018, -0.020, 0.056],
  spine3:    [-0.012, -0.020, 0.045],
  neck:      [0.030, 0.020, -0.050],
  head:      [0.014, 0.030, -0.056],
  clavicleR: [0.020, 0.020, -0.040],
  upperArmR: [0.190, 0.160, -0.230],
  foreArmR:  [0.520, 0.200, 0],
  clavicleL: [0.020, -0.020, 0.040],
  upperArmL: [0.170, -0.160, 0.290],
  foreArmL:  [0.560, -0.200, 0],
  thighR:    [-0.030, -0.060, 0.330],
  shinR:     [-0.300, 0, 0],
  footR:     [0.140, -0.040, 0],
  thighL:    [-0.030, 0.060, -0.330],
  shinL:     [-0.220, 0, 0],
  footL:     [0.020, 0.040, 0],
});

const strafe_l_3 = P({
  hips:      [0.020, 0.045, 0.010, -0.006, -0.044, 0],
  spine1:    [-0.022, -0.022, 0.040],
  spine2:    [-0.020, -0.022, 0.045],
  spine3:    [-0.014, -0.022, 0.036],
  neck:      [0.032, 0.022, -0.040],
  head:      [0.015, 0.032, -0.045],
  clavicleR: [0.020, 0.022, -0.036],
  upperArmR: [0.200, 0.160, -0.210],
  foreArmR:  [0.520, 0.200, 0],
  clavicleL: [0.020, -0.022, 0.036],
  upperArmL: [0.180, -0.160, 0.260],
  foreArmL:  [0.560, -0.200, 0],
  thighR:    [-0.060, -0.060, 0.140],
  shinR:     [-0.520, 0, 0],
  footR:     [0.140, -0.040, 0],
  toeR:      [0.060, 0, 0],
  thighL:    [-0.010, 0.060, -0.190],
  shinL:     [-0.200, 0, 0],
  footL:     [0.020, 0.040, 0],
});

const strafe_r_0 = mirror(strafe_l_0);
const strafe_r_1 = mirror(strafe_l_1);
const strafe_r_2 = mirror(strafe_l_2);
const strafe_r_3 = mirror(strafe_l_3);

// ===========================================================================
// 3. 抜刀 / 納刀 — DRAW AND SHEATHE
// ===========================================================================

/** Saya-biki begins: hips drop and blade, left hand rolls the saya, right hand finds the tsuka. */
const draw_grip = P({
  hips:      [0.020, 0.420, 0.020, 0, -0.075, -0.020],
  spine1:    [-0.070, -0.090, 0],
  spine2:    [-0.060, -0.100, 0],
  spine3:    [-0.045, -0.110, 0],
  neck:      [0.090, -0.090, 0],
  head:      [0.040, -0.130, 0],
  clavicleR: [0.040, -0.140, -0.030],
  upperArmR: [0.520, 0.300, -0.560],
  foreArmR:  [1.480, 0.520, 0],
  handR:     [-0.150, 0.400, 0.140],
  clavicleL: [0.030, 0.160, 0.030],
  upperArmL: [0.180, -0.320, 0.150],
  foreArmL:  [0.980, -0.620, 0],
  handL:     [-0.100, -0.440, 0.180],
  thighR:    [0.360, -0.200, 0.070],
  shinR:     [-0.380, 0, 0],
  footR:     [0.040, -0.070, 0],
  thighL:    [-0.240, 0.180, -0.085],
  shinL:     [-0.560, 0, 0],
  footL:     [-0.120, 0.130, 0],
  toeL:      [0.220, 0, 0],
});

/** Full coil — saya drawn back hard, weight on the back leg, blade still hidden. */
const draw_coil = P({
  hips:      [0.010, 0.560, 0.030, 0, -0.098, -0.026],
  spine1:    [-0.090, -0.130, 0],
  spine2:    [-0.080, -0.150, 0],
  spine3:    [-0.060, -0.165, 0],
  neck:      [0.110, -0.140, 0],
  head:      [0.050, -0.190, 0],
  clavicleR: [0.060, -0.200, -0.020],
  upperArmR: [0.480, 0.360, -0.700],
  foreArmR:  [1.720, 0.640, 0],
  handR:     [-0.180, 0.500, 0.180],
  clavicleL: [0.050, 0.240, 0.020],
  upperArmL: [-0.180, -0.400, 0.120],
  foreArmL:  [1.180, -0.760, 0],
  handL:     [-0.120, -0.520, 0.220],
  thighR:    [0.420, -0.250, 0.075],
  shinR:     [-0.480, 0, 0],
  footR:     [0.070, -0.080, 0],
  thighL:    [-0.180, 0.220, -0.090],
  shinL:     [-0.720, 0, 0],
  footL:     [-0.140, 0.150, 0],
  toeL:      [0.300, 0, 0],
});

/** 抜き付け nukitsuke — the horizontal draw-cut. Blade leaves the saya already cutting. */
const draw_cut = P({
  hips:      [0.040, -0.180, -0.020, 0, -0.048, 0.020],
  spine1:    [-0.030, 0.150, 0],
  spine2:    [-0.020, 0.180, 0],
  spine3:    [0.000, 0.200, 0],
  neck:      [0.040, 0.060, 0],
  head:      [0.020, -0.060, 0],
  clavicleR: [-0.060, 0.180, -0.120],
  upperArmR: [0.760, -0.120, -0.980],
  foreArmR:  [0.260, -0.360, 0],
  handR:     [-0.120, -0.300, 0.060],
  clavicleL: [0.020, -0.180, 0.060],
  upperArmL: [-0.280, 0.180, 0.560],
  foreArmL:  [0.760, 0.320, 0],
  handL:     [-0.060, 0.260, -0.120],
  thighR:    [0.180, 0.120, 0.070],
  shinR:     [-0.180, 0, 0],
  footR:     [-0.060, 0.060, 0],
  thighL:    [-0.400, -0.100, -0.075],
  shinL:     [-0.320, 0, 0],
  footL:     [-0.100, -0.060, 0],
  toeL:      [0.140, 0, 0],
});

/** 残心 zanshin — the settle after the cut, blade coming to seigan. */
const draw_settle = blend(draw_cut, idle_seigan, 0.72);

/** 納刀 nōtō, phase 1 — the kissaki finds the koiguchi. Eyes stay off the sword. */
const sheathe_align = P({
  hips:      [0.020, 0.240, 0.010, 0, -0.045, -0.008],
  spine1:    [-0.040, -0.060, 0],
  spine2:    [-0.035, -0.070, 0],
  spine3:    [-0.020, -0.075, 0],
  neck:      [0.060, -0.040, 0],
  head:      [0.030, -0.060, 0],
  clavicleR: [0.020, -0.120, -0.040],
  upperArmR: [0.520, 0.260, -0.480],
  foreArmR:  [1.560, 0.480, 0],
  handR:     [-0.180, 0.420, 0.140],
  clavicleL: [0.020, 0.130, 0.040],
  upperArmL: [0.240, -0.300, 0.190],
  foreArmL:  [1.060, -0.600, 0],
  handL:     [-0.100, -0.420, 0.180],
  thighR:    [0.180, -0.140, 0.060],
  shinR:     [-0.260, 0, 0],
  footR:     [-0.040, -0.050, 0],
  thighL:    [-0.180, 0.130, -0.070],
  shinL:     [-0.380, 0, 0],
  footL:     [-0.100, 0.100, 0],
  toeL:      [0.140, 0, 0],
});

/** Phase 2 — the blade runs home along the left hand, right elbow trailing back. */
const sheathe_slide = P({
  hips:      [0.020, 0.300, 0.010, 0, -0.050, -0.010],
  spine1:    [-0.045, -0.075, 0],
  spine2:    [-0.040, -0.085, 0],
  spine3:    [-0.025, -0.095, 0],
  neck:      [0.070, -0.050, 0],
  head:      [0.035, -0.075, 0],
  clavicleR: [0.070, -0.190, 0.010],
  upperArmR: [0.140, 0.320, -0.640],
  foreArmR:  [1.760, 0.560, 0],
  handR:     [-0.200, 0.480, 0.160],
  clavicleL: [0.030, 0.170, 0.030],
  upperArmL: [0.180, -0.330, 0.170],
  foreArmL:  [0.940, -0.560, 0],
  handL:     [-0.090, -0.440, 0.170],
  thighR:    [0.150, -0.170, 0.060],
  shinR:     [-0.230, 0, 0],
  footR:     [-0.030, -0.060, 0],
  thighL:    [-0.150, 0.150, -0.070],
  shinL:     [-0.340, 0, 0],
  footL:     [-0.090, 0.110, 0],
  toeL:      [0.120, 0, 0],
});

// ===========================================================================
// 4. ATTACKS
// ===========================================================================
// Shared vocabulary: `wind_*` are anticipation extremes, `strike_*` are the
// follow-through extremes. The frame in between is generated by the sampler, and
// the arc is correct because the windup and the follow-through were authored as
// two ends of the same circle around the hara.

/** Windup over the right shoulder for a horizontal sweep to the left. */
const wind_horiz_r = P({
  hips:      [0.020, 0.560, 0.020, 0, -0.056, -0.016],
  spine1:    [-0.060, -0.230, 0.030],
  spine2:    [-0.055, -0.260, 0.040],
  spine3:    [-0.040, -0.290, 0.040],
  neck:      [0.090, 0.140, -0.030],
  head:      [0.045, 0.060, -0.030],
  clavicleR: [-0.080, -0.180, -0.130],
  upperArmR: [1.180, 0.320, -0.640],
  foreArmR:  [1.720, 0.460, 0],
  handR:     [-0.240, 0.320, 0.150],
  clavicleL: [-0.020, 0.140, 0.110],
  upperArmL: [1.220, -0.260, 0.500],
  foreArmL:  [1.560, -0.420, 0],
  handL:     [-0.180, -0.300, -0.130],
  thighR:    [0.180, -0.300, 0.060],
  shinR:     [-0.320, 0, 0],
  footR:     [-0.020, -0.100, 0],
  thighL:    [-0.220, 0.260, -0.075],
  shinL:     [-0.500, 0, 0],
  footL:     [-0.130, 0.180, 0],
  toeL:      [0.220, 0, 0],
});

/** End of the horizontal sweep — hips have driven all the way through to the left. */
const strike_horiz_r = P({
  hips:      [0.030, -0.420, -0.030, 0, -0.070, 0.020],
  spine1:    [-0.070, 0.280, -0.040],
  spine2:    [-0.065, 0.320, -0.050],
  spine3:    [-0.045, 0.350, -0.050],
  neck:      [0.100, -0.180, 0.040],
  head:      [0.050, -0.120, 0.040],
  clavicleR: [0.030, 0.220, -0.060],
  upperArmR: [0.980, -0.240, -1.060],
  foreArmR:  [0.420, -0.400, 0],
  handR:     [-0.140, -0.340, 0.060],
  clavicleL: [0.040, -0.220, 0.040],
  upperArmL: [0.180, 0.240, 0.900],
  foreArmL:  [0.960, 0.400, 0],
  handL:     [-0.100, 0.340, -0.060],
  thighR:    [0.320, 0.240, 0.075],
  shinR:     [-0.300, 0, 0],
  footR:     [-0.080, 0.140, 0],
  thighL:    [-0.360, -0.200, -0.070],
  shinL:     [-0.420, 0, 0],
  footL:     [-0.100, -0.140, 0],
  toeL:      [0.180, 0, 0],
});

/** Windup on the left side, for the return sweep back to the right. */
const wind_horiz_l = P({
  hips:      [0.020, -0.320, -0.020, 0, -0.056, 0.016],
  spine1:    [-0.060, 0.260, -0.030],
  spine2:    [-0.055, 0.290, -0.040],
  spine3:    [-0.040, 0.320, -0.040],
  neck:      [0.090, -0.180, 0.030],
  head:      [0.045, -0.140, 0.030],
  clavicleR: [-0.020, 0.180, -0.110],
  upperArmR: [1.320, -0.180, -1.180],
  foreArmR:  [1.480, -0.300, 0],
  handR:     [-0.200, -0.280, 0.120],
  clavicleL: [-0.070, -0.160, 0.130],
  upperArmL: [1.080, 0.220, 0.700],
  foreArmL:  [1.720, 0.360, 0],
  handL:     [-0.220, 0.280, -0.140],
  thighR:    [0.240, 0.200, 0.060],
  shinR:     [-0.380, 0, 0],
  footR:     [-0.040, 0.120, 0],
  thighL:    [-0.260, -0.180, -0.075],
  shinL:     [-0.460, 0, 0],
  footL:     [-0.120, -0.120, 0],
  toeL:      [0.200, 0, 0],
});

/** End of the return sweep. */
const strike_horiz_l = P({
  hips:      [0.030, 0.520, 0.030, 0, -0.070, -0.020],
  spine1:    [-0.070, -0.300, 0.040],
  spine2:    [-0.065, -0.340, 0.050],
  spine3:    [-0.045, -0.370, 0.050],
  neck:      [0.100, 0.200, -0.040],
  head:      [0.050, 0.140, -0.040],
  clavicleR: [0.040, -0.240, -0.020],
  upperArmR: [0.520, 0.280, -0.220],
  foreArmR:  [0.880, 0.420, 0],
  handR:     [-0.100, 0.360, 0.060],
  clavicleL: [0.030, 0.240, 0.060],
  upperArmL: [0.760, -0.260, 0.980],
  foreArmL:  [0.460, -0.420, 0],
  handL:     [-0.120, -0.360, -0.060],
  thighR:    [0.340, -0.260, 0.075],
  shinR:     [-0.420, 0, 0],
  footR:     [-0.100, -0.160, 0],
  thighL:    [-0.320, 0.220, -0.070],
  shinL:     [-0.400, 0, 0],
  footL:     [-0.090, 0.160, 0],
  toeL:      [0.160, 0, 0],
});

/** Windup for 袈裟斬り kesa-giri — blade cocked high over the right shoulder. */
const wind_kesa = P({
  hips:      [0.010, 0.400, 0.020, 0, -0.048, -0.014],
  spine1:    [-0.100, -0.180, 0.020],
  spine2:    [-0.090, -0.200, 0.030],
  spine3:    [-0.070, -0.220, 0.030],
  neck:      [0.150, 0.110, -0.020],
  head:      [0.075, 0.050, -0.020],
  clavicleR: [-0.180, -0.130, -0.180],
  upperArmR: [2.360, 0.220, -0.480],
  foreArmR:  [1.180, 0.400, 0],
  handR:     [-0.280, 0.240, 0.130],
  clavicleL: [-0.160, 0.110, 0.170],
  upperArmL: [2.180, -0.180, 0.420],
  foreArmL:  [1.020, -0.360, 0],
  handL:     [-0.230, -0.220, -0.120],
  thighR:    [0.220, -0.230, 0.060],
  shinR:     [-0.280, 0, 0],
  footR:     [-0.030, -0.090, 0],
  thighL:    [-0.240, 0.200, -0.075],
  shinL:     [-0.480, 0, 0],
  footL:     [-0.120, 0.150, 0],
  toeL:      [0.200, 0, 0],
});

/** Kesa follow-through — the blade finishes low on the character's LEFT hip. */
const strike_kesa_dl = P({
  hips:      [0.070, -0.300, -0.030, 0, -0.100, 0.020],
  spine1:    [-0.190, 0.220, -0.060],
  spine2:    [-0.180, 0.250, -0.070],
  spine3:    [-0.140, 0.270, -0.070],
  neck:      [0.260, -0.150, 0.060],
  head:      [0.120, -0.100, 0.060],
  clavicleR: [0.060, 0.180, -0.040],
  upperArmR: [0.560, -0.180, -0.340],
  foreArmR:  [0.300, -0.280, 0],
  handR:     [-0.080, -0.260, 0.040],
  clavicleL: [0.050, -0.180, 0.030],
  upperArmL: [0.180, 0.180, 0.260],
  foreArmL:  [0.360, 0.260, 0],
  handL:     [-0.060, 0.260, -0.040],
  thighR:    [0.400, 0.180, 0.080],
  shinR:     [-0.560, 0, 0],
  footR:     [-0.020, 0.110, 0],
  thighL:    [-0.320, -0.160, -0.080],
  shinL:     [-0.520, 0, 0],
  footL:     [-0.080, -0.110, 0],
  toeL:      [0.170, 0, 0],
});

/** Windup for the reverse diagonal — blade cocked high over the LEFT shoulder. */
const wind_kesa_l = mirrorArms(wind_kesa);

/** Reverse-diagonal follow-through — finishes low on the character's RIGHT hip. */
const strike_kesa_dr = P({
  hips:      [0.070, 0.420, 0.030, 0, -0.100, -0.020],
  spine1:    [-0.190, -0.240, 0.060],
  spine2:    [-0.180, -0.270, 0.070],
  spine3:    [-0.140, -0.290, 0.070],
  neck:      [0.260, 0.160, -0.060],
  head:      [0.120, 0.110, -0.060],
  clavicleR: [0.050, -0.180, -0.030],
  upperArmR: [0.240, 0.180, -0.700],
  foreArmR:  [0.400, 0.280, 0],
  handR:     [-0.060, 0.260, 0.040],
  clavicleL: [0.060, 0.180, 0.040],
  upperArmL: [0.480, -0.180, 0.640],
  foreArmL:  [0.320, -0.260, 0],
  handL:     [-0.080, -0.260, -0.040],
  thighR:    [0.320, -0.180, 0.080],
  shinR:     [-0.520, 0, 0],
  footR:     [-0.080, -0.110, 0],
  thighL:    [-0.340, 0.160, -0.080],
  shinL:     [-0.500, 0, 0],
  footL:     [-0.060, 0.110, 0],
  toeL:      [0.150, 0, 0],
});

/** 正面打ち shōmen-uchi windup — straight up the centre line, no telegraph sideways. */
const wind_overhead = P({
  hips:      [-0.030, 0.260, 0.010, 0, -0.030, -0.008],
  spine1:    [-0.120, -0.110, 0],
  spine2:    [-0.110, -0.120, 0],
  spine3:    [-0.085, -0.130, 0],
  neck:      [0.190, 0.070, 0],
  head:      [0.095, 0.030, 0],
  clavicleR: [-0.200, -0.070, -0.170],
  upperArmR: [2.620, 0.120, -0.360],
  foreArmR:  [1.060, 0.340, 0],
  handR:     [-0.300, 0.160, 0.090],
  clavicleL: [-0.190, 0.070, 0.160],
  upperArmL: [2.520, -0.120, 0.290],
  foreArmL:  [0.960, -0.340, 0],
  handL:     [-0.260, -0.160, -0.090],
  thighR:    [0.180, -0.150, 0.055],
  shinR:     [-0.230, 0, 0],
  footR:     [-0.020, -0.060, 0],
  thighL:    [-0.220, 0.130, -0.070],
  shinL:     [-0.420, 0, 0],
  footL:     [-0.110, 0.100, 0],
  toeL:      [0.180, 0, 0],
});

/** Overhead follow-through — the kissaki stops at the opponent's knee height. */
const strike_overhead = P({
  hips:      [0.110, 0.180, 0, 0, -0.115, 0],
  spine1:    [-0.260, -0.070, 0],
  spine2:    [-0.250, -0.080, 0],
  spine3:    [-0.190, -0.085, 0],
  neck:      [0.360, 0.045, 0],
  head:      [0.170, 0.020, 0],
  clavicleR: [0.070, -0.040, -0.020],
  upperArmR: [0.420, 0.100, -0.320],
  foreArmR:  [0.240, 0.220, 0],
  handR:     [-0.060, 0.140, 0.040],
  clavicleL: [0.070, 0.040, 0.020],
  upperArmL: [0.360, -0.100, 0.260],
  foreArmL:  [0.200, -0.220, 0],
  handL:     [-0.050, -0.140, -0.040],
  thighR:    [0.520, -0.110, 0.075],
  shinR:     [-0.680, 0, 0],
  footR:     [0.020, -0.050, 0],
  thighL:    [-0.320, 0.100, -0.080],
  shinL:     [-0.560, 0, 0],
  footL:     [-0.060, 0.080, 0],
  toeL:      [0.160, 0, 0],
});

/** 突き tsuki windup — hands draw back to the right hip, kissaki stays on line. */
const wind_thrust = P({
  hips:      [0.010, 0.480, 0.010, 0, -0.070, -0.014],
  spine1:    [-0.045, -0.190, 0],
  spine2:    [-0.040, -0.210, 0],
  spine3:    [-0.030, -0.230, 0],
  neck:      [0.070, 0.150, 0],
  head:      [0.035, 0.100, 0],
  clavicleR: [0.050, -0.170, -0.020],
  upperArmR: [0.260, 0.280, -0.400],
  foreArmR:  [1.900, 0.460, 0],
  handR:     [-0.180, 0.320, 0.120],
  clavicleL: [0.030, 0.150, 0.030],
  upperArmL: [0.440, -0.240, 0.260],
  foreArmL:  [1.660, -0.400, 0],
  handL:     [-0.150, -0.300, -0.110],
  thighR:    [0.140, -0.260, 0.055],
  shinR:     [-0.400, 0, 0],
  footR:     [0.020, -0.100, 0],
  thighL:    [-0.150, 0.230, -0.075],
  shinL:     [-0.560, 0, 0],
  footL:     [-0.130, 0.170, 0],
  toeL:      [0.230, 0, 0],
});

/** The thrust itself — everything extends along one line from the back heel to the kissaki. */
const strike_thrust = P({
  hips:      [0.040, 0.140, 0, 0, -0.060, 0],
  spine1:    [-0.070, -0.060, 0],
  spine2:    [-0.065, -0.070, 0],
  spine3:    [-0.045, -0.075, 0],
  neck:      [0.110, 0.040, 0],
  head:      [0.055, 0.020, 0],
  clavicleR: [-0.070, -0.050, -0.090],
  upperArmR: [1.240, 0.130, -0.320],
  foreArmR:  [0.320, 0.230, 0],
  handR:     [-0.100, 0.170, 0.060],
  clavicleL: [-0.060, 0.050, 0.080],
  upperArmL: [1.140, -0.130, 0.250],
  foreArmL:  [0.280, -0.230, 0],
  handL:     [-0.080, -0.170, -0.060],
  thighR:    [0.560, -0.080, 0.070],
  shinR:     [-0.400, 0, 0],
  footR:     [-0.040, -0.040, 0],
  thighL:    [-0.480, 0.070, -0.078],
  shinL:     [-0.280, 0, 0],
  footL:     [-0.240, 0.060, 0],
  toeL:      [0.400, 0, 0],
});

/** 切り上げ kiriage windup — blade dropped low behind the right hip, edge up. */
const wind_rising = P({
  hips:      [0.060, 0.500, 0.020, 0, -0.090, -0.018],
  spine1:    [0.060, -0.200, 0.020],
  spine2:    [0.055, -0.220, 0.030],
  spine3:    [0.040, -0.240, 0.030],
  neck:      [-0.040, 0.150, -0.020],
  head:      [-0.020, 0.090, -0.020],
  clavicleR: [0.090, -0.160, 0.030],
  upperArmR: [-0.260, 0.300, -0.360],
  foreArmR:  [0.760, 0.500, 0],
  handR:     [-0.100, 0.360, 0.140],
  clavicleL: [0.060, 0.140, 0.030],
  upperArmL: [0.060, -0.260, 0.240],
  foreArmL:  [0.640, -0.440, 0],
  handL:     [-0.080, -0.340, -0.120],
  thighR:    [0.200, -0.270, 0.060],
  shinR:     [-0.480, 0, 0],
  footR:     [0.040, -0.100, 0],
  thighL:    [-0.180, 0.240, -0.080],
  shinL:     [-0.640, 0, 0],
  footL:     [-0.140, 0.170, 0],
  toeL:      [0.260, 0, 0],
});

/** Kiriage finish — hands finish above the left ear, blade pointing up-left. */
const strike_rising = P({
  hips:      [-0.040, -0.180, -0.020, 0, 0.020, 0.014],
  spine1:    [-0.120, 0.180, -0.040],
  spine2:    [-0.110, 0.200, -0.050],
  spine3:    [-0.085, 0.220, -0.050],
  neck:      [0.180, -0.120, 0.040],
  head:      [0.090, -0.080, 0.040],
  clavicleR: [-0.170, 0.140, -0.140],
  upperArmR: [2.180, -0.140, -0.860],
  foreArmR:  [0.680, -0.300, 0],
  handR:     [-0.200, -0.240, 0.060],
  clavicleL: [-0.150, -0.140, 0.150],
  upperArmL: [1.980, 0.140, 0.520],
  foreArmL:  [0.820, 0.300, 0],
  handL:     [-0.180, 0.240, -0.060],
  thighR:    [-0.060, 0.140, 0.070],
  shinR:     [-0.180, 0, 0],
  footR:     [-0.080, 0.080, 0],
  thighL:    [0.020, -0.120, -0.075],
  shinL:     [-0.220, 0, 0],
  footL:     [-0.020, -0.070, 0],
});

/** Heavy: a deep, greedy jōdan coil. Weight fully back, both heels loaded. */
const wind_heavy = P({
  hips:      [-0.090, 0.640, 0.030, 0, -0.140, -0.026],
  spine1:    [-0.180, -0.280, 0.030],
  spine2:    [-0.170, -0.310, 0.040],
  spine3:    [-0.130, -0.340, 0.040],
  neck:      [0.280, 0.220, -0.030],
  head:      [0.140, 0.140, -0.030],
  clavicleR: [-0.230, -0.190, -0.200],
  upperArmR: [2.760, 0.300, -0.560],
  foreArmR:  [1.320, 0.520, 0],
  handR:     [-0.320, 0.320, 0.160],
  clavicleL: [-0.210, 0.170, 0.190],
  upperArmL: [2.560, -0.260, 0.480],
  foreArmL:  [1.180, -0.460, 0],
  handL:     [-0.280, -0.300, -0.150],
  thighR:    [0.240, -0.360, 0.070],
  shinR:     [-0.620, 0, 0],
  footR:     [0.060, -0.130, 0],
  thighL:    [-0.140, 0.320, -0.090],
  shinL:     [-0.860, 0, 0],
  footL:     [-0.160, 0.230, 0],
  toeL:      [0.320, 0, 0],
});

/** Heavy follow-through — the kissaki reaches the floor, the back knee nearly does too. */
const strike_heavy = P({
  hips:      [0.280, 0.120, 0, 0, -0.290, 0],
  spine1:    [-0.400, -0.060, 0],
  spine2:    [-0.380, -0.070, 0],
  spine3:    [-0.290, -0.075, 0],
  neck:      [0.540, 0.040, 0],
  head:      [0.260, 0.020, 0],
  clavicleR: [0.130, -0.030, 0.010],
  upperArmR: [0.180, 0.090, -0.280],
  foreArmR:  [0.180, 0.200, 0],
  handR:     [-0.040, 0.130, 0.030],
  clavicleL: [0.130, 0.030, -0.010],
  upperArmL: [0.140, -0.090, 0.230],
  foreArmL:  [0.150, -0.200, 0],
  handL:     [-0.030, -0.130, -0.030],
  thighR:    [0.860, -0.090, 0.080],
  shinR:     [-1.060, 0, 0],
  footR:     [0.140, -0.040, 0],
  thighL:    [-0.240, 0.080, -0.090],
  shinL:     [-1.320, 0, 0],
  footL:     [-0.420, 0.060, 0],
  toeL:      [0.700, 0, 0],
});

// ===========================================================================
// 5. DEFENCE
// ===========================================================================

/** Blade up and across, both elbows in tight — this is a structure, not a pose. */
const guard_high = P({
  hips:      [-0.030, 0.280, 0.006, 0, -0.070, -0.008],
  spine1:    [-0.090, -0.060, 0],
  spine2:    [-0.080, -0.065, 0],
  spine3:    [-0.060, -0.070, 0],
  neck:      [0.140, -0.045, 0],
  head:      [0.070, -0.060, 0],
  clavicleR: [-0.090, -0.060, -0.110],
  upperArmR: [1.560, 0.180, -0.520],
  foreArmR:  [1.560, 0.300, 0],
  handR:     [-0.240, 0.220, 0.100],
  clavicleL: [-0.080, 0.060, 0.100],
  upperArmL: [1.400, -0.180, 0.420],
  foreArmL:  [1.420, -0.300, 0],
  handL:     [-0.200, -0.220, -0.100],
  thighR:    [0.360, -0.160, 0.070],
  shinR:     [-0.460, 0, 0],
  footR:     [-0.020, -0.060, 0],
  thighL:    [-0.300, 0.140, -0.085],
  shinL:     [-0.620, 0, 0],
  footL:     [-0.140, 0.110, 0],
  toeL:      [0.220, 0, 0],
});

/** Guard under load — the whole frame compresses back a few centimetres. */
const guard_press = blend(guard_high, P({
  hips:      [-0.100, 0.300, 0.006, 0, -0.105, -0.008],
  spine1:    [-0.150, -0.060, 0],
  spine2:    [-0.140, -0.065, 0],
  spine3:    [-0.110, -0.070, 0],
  clavicleR: [-0.040, -0.060, -0.070],
  upperArmR: [1.320, 0.180, -0.440],
  foreArmR:  [1.860, 0.300, 0],
  clavicleL: [-0.030, 0.060, 0.060],
  upperArmL: [1.180, -0.180, 0.360],
  foreArmL:  [1.720, -0.300, 0],
  thighR:    [0.460, -0.160, 0.070],
  shinR:     [-0.640, 0, 0],
  thighL:    [-0.260, 0.140, -0.085],
  shinL:     [-0.800, 0, 0],
}), 1.0);

/** The parry itself: a wrist snap, not an arm swing. Elbows barely move. */
const parry_snap = P({
  hips:      [-0.010, 0.180, 0.006, 0, -0.048, -0.008],
  spine1:    [-0.060, 0.060, -0.030],
  spine2:    [-0.055, 0.070, -0.036],
  spine3:    [-0.040, 0.075, -0.036],
  neck:      [0.100, -0.050, 0.030],
  head:      [0.050, -0.070, 0.032],
  clavicleR: [-0.110, 0.040, -0.150],
  upperArmR: [1.640, 0.120, -0.760],
  foreArmR:  [1.320, -0.320, 0],
  handR:     [-0.180, -0.620, 0.240],
  clavicleL: [-0.100, -0.040, 0.140],
  upperArmL: [1.500, -0.120, 0.640],
  foreArmL:  [1.240, 0.320, 0],
  handL:     [-0.160, 0.600, -0.240],
  thighR:    [0.300, -0.100, 0.070],
  shinR:     [-0.380, 0, 0],
  footR:     [-0.020, -0.040, 0],
  thighL:    [-0.260, 0.090, -0.085],
  shinL:     [-0.540, 0, 0],
  footL:     [-0.120, 0.070, 0],
  toeL:      [0.200, 0, 0],
});

/** Sword bounces off — arms thrown open, spine whips back, feet stay planted. */
const clash_recoil_pose = P({
  hips:      [-0.150, 0.220, 0.010, 0, -0.055, -0.010],
  spine1:    [0.190, -0.040, 0],
  spine2:    [0.180, -0.045, 0],
  spine3:    [0.140, -0.050, 0],
  neck:      [-0.220, -0.030, 0],
  head:      [-0.120, -0.040, 0],
  clavicleR: [-0.180, -0.040, -0.180],
  upperArmR: [1.960, 0.200, -0.760],
  foreArmR:  [1.060, 0.320, 0],
  handR:     [-0.280, 0.260, 0.140],
  clavicleL: [-0.170, 0.040, 0.170],
  upperArmL: [1.820, -0.200, 0.660],
  foreArmL:  [0.980, -0.320, 0],
  handL:     [-0.260, -0.260, -0.140],
  thighR:    [0.400, -0.130, 0.075],
  shinR:     [-0.560, 0, 0],
  footR:     [0.040, -0.050, 0],
  thighL:    [-0.220, 0.110, -0.090],
  shinL:     [-0.700, 0, 0],
  footL:     [-0.100, 0.090, 0],
  toeL:      [0.260, 0, 0],
});

// ===========================================================================
// 6. DODGES
// ===========================================================================

const roll_launch = P({
  hips:      [-0.320, 0.060, 0, 0, -0.230, 0],
  spine1:    [-0.240, -0.020, 0],
  spine2:    [-0.230, -0.020, 0],
  spine3:    [-0.180, -0.020, 0],
  neck:      [0.140, 0, 0],
  head:      [0.060, 0, 0],
  clavicleR: [-0.060, 0, -0.060],
  upperArmR: [0.860, 0.200, -0.300],
  foreArmR:  [1.560, 0.300, 0],
  clavicleL: [-0.060, 0, 0.060],
  upperArmL: [0.780, -0.200, 0.260],
  foreArmL:  [1.480, -0.300, 0],
  thighR:    [0.900, -0.060, 0.070],
  shinR:     [-1.240, 0, 0],
  footR:     [0.180, 0, 0],
  thighL:    [0.320, 0.060, -0.070],
  shinL:     [-1.500, 0, 0],
  footL:     [0.220, 0, 0],
});

/** Mid-roll: a ball. Chin tucked, knees to chest, spine fully flexed. */
const roll_tuck = P({
  hips:      [-2.600, 0.060, 0, 0, -0.560, -0.150],
  spine1:    [-0.340, -0.020, 0],
  spine2:    [-0.320, -0.020, 0],
  spine3:    [-0.260, -0.020, 0],
  neck:      [-0.360, 0, 0],
  head:      [-0.320, 0, 0],
  clavicleR: [-0.140, 0, -0.100],
  upperArmR: [1.360, 0.300, -0.420],
  foreArmR:  [2.100, 0.420, 0],
  clavicleL: [-0.140, 0, 0.100],
  upperArmL: [1.280, -0.300, 0.380],
  foreArmL:  [2.020, -0.420, 0],
  thighR:    [1.700, -0.060, 0.090],
  shinR:     [-2.150, 0, 0],
  footR:     [0.300, 0, 0],
  thighL:    [1.620, 0.060, -0.090],
  shinL:     [-2.100, 0, 0],
  footL:     [0.300, 0, 0],
});

/** Over the top — the roll has passed vertical and is unfolding. */
const roll_over = P({
  hips:      [-4.900, 0.060, 0, 0, -0.430, -0.060],
  spine1:    [-0.180, -0.020, 0],
  spine2:    [-0.170, -0.020, 0],
  spine3:    [-0.140, -0.020, 0],
  neck:      [-0.120, 0, 0],
  head:      [-0.100, 0, 0],
  upperArmR: [1.020, 0.260, -0.360],
  foreArmR:  [1.760, 0.360, 0],
  upperArmL: [0.960, -0.260, 0.320],
  foreArmL:  [1.700, -0.360, 0],
  thighR:    [1.240, -0.060, 0.080],
  shinR:     [-1.760, 0, 0],
  footR:     [0.240, 0, 0],
  thighL:    [1.100, 0.060, -0.080],
  shinL:     [-1.820, 0, 0],
  footL:     [0.260, 0, 0],
});

/** Landing out of the roll, coming back up into a low guard. */
const roll_land = P({
  hips:      [0.180, 0.180, 0.020, 0, -0.230, -0.020],
  spine1:    [-0.220, -0.060, 0],
  spine2:    [-0.210, -0.065, 0],
  spine3:    [-0.160, -0.070, 0],
  neck:      [0.280, -0.045, 0],
  head:      [0.130, -0.060, 0],
  clavicleR: [-0.040, -0.050, -0.070],
  upperArmR: [0.960, 0.180, -0.400],
  foreArmR:  [1.360, 0.300, 0],
  clavicleL: [-0.030, 0.050, 0.060],
  upperArmL: [0.820, -0.180, 0.340],
  foreArmL:  [1.240, -0.300, 0],
  thighR:    [0.780, -0.140, 0.080],
  shinR:     [-1.180, 0, 0],
  footR:     [0.180, -0.050, 0],
  thighL:    [-0.180, 0.120, -0.090],
  shinL:     [-1.020, 0, 0],
  footL:     [-0.140, 0.090, 0],
  toeL:      [0.420, 0, 0],
});

/** Compression before a lateral push-off to the left. */
const step_l_push = P({
  hips:      [0.020, 0.220, -0.060, 0.020, -0.140, 0],
  spine1:    [-0.060, -0.050, 0.100],
  spine2:    [-0.055, -0.055, 0.110],
  spine3:    [-0.040, -0.060, 0.090],
  neck:      [0.090, -0.040, -0.100],
  head:      [0.045, -0.055, -0.110],
  clavicleR: [-0.020, -0.050, -0.080],
  upperArmR: [0.980, 0.180, -0.440],
  foreArmR:  [1.300, 0.280, 0],
  clavicleL: [-0.020, 0.050, 0.070],
  upperArmL: [0.860, -0.180, 0.380],
  foreArmL:  [1.180, -0.280, 0],
  thighR:    [0.180, -0.140, 0.360],
  shinR:     [-0.760, 0, 0],
  footR:     [0.140, -0.050, 0],
  thighL:    [-0.100, 0.120, -0.420],
  shinL:     [-0.520, 0, 0],
  footL:     [0.060, 0.090, 0],
});

/** Airborne, drifting left, legs scissored. */
const step_l_air = P({
  hips:      [0.020, 0.200, 0.090, -0.070, -0.020, 0],
  spine1:    [-0.050, -0.045, -0.070],
  spine2:    [-0.045, -0.050, -0.080],
  spine3:    [-0.032, -0.055, -0.065],
  neck:      [0.075, -0.035, 0.070],
  head:      [0.038, -0.050, 0.078],
  upperArmR: [0.900, 0.180, -0.560],
  foreArmR:  [1.220, 0.280, 0],
  upperArmL: [0.800, -0.180, 0.520],
  foreArmL:  [1.120, -0.280, 0],
  thighR:    [-0.140, -0.140, -0.180],
  shinR:     [-0.320, 0, 0],
  footR:     [-0.180, -0.050, 0],
  thighL:    [0.100, 0.120, -0.140],
  shinL:     [-0.940, 0, 0],
  footL:     [0.140, 0.090, 0],
});

/** Landing left, absorbing on the lead foot. */
const step_l_land = P({
  hips:      [0.030, 0.240, -0.030, -0.020, -0.120, 0],
  spine1:    [-0.070, -0.055, 0.055],
  spine2:    [-0.065, -0.060, 0.060],
  spine3:    [-0.048, -0.065, 0.050],
  neck:      [0.100, -0.045, -0.055],
  head:      [0.050, -0.060, -0.060],
  clavicleR: [-0.030, -0.050, -0.075],
  upperArmR: [0.980, 0.180, -0.430],
  foreArmR:  [1.320, 0.280, 0],
  clavicleL: [-0.030, 0.050, 0.065],
  upperArmL: [0.860, -0.180, 0.370],
  foreArmL:  [1.200, -0.280, 0],
  thighR:    [0.140, -0.140, 0.140],
  shinR:     [-0.520, 0, 0],
  footR:     [0.060, -0.050, 0],
  thighL:    [-0.060, 0.120, -0.260],
  shinL:     [-0.760, 0, 0],
  footL:     [0.020, 0.090, 0],
});

const step_r_push = mirror(step_l_push);
const step_r_air = mirror(step_l_air);
const step_r_land = mirror(step_l_land);

const hop_back_crouch = P({
  hips:      [0.140, 0.260, 0.010, 0, -0.180, -0.010],
  spine1:    [-0.180, -0.060, 0],
  spine2:    [-0.170, -0.065, 0],
  spine3:    [-0.130, -0.070, 0],
  neck:      [0.240, -0.045, 0],
  head:      [0.110, -0.060, 0],
  clavicleR: [-0.040, -0.050, -0.080],
  upperArmR: [1.100, 0.180, -0.460],
  foreArmR:  [1.400, 0.280, 0],
  clavicleL: [-0.040, 0.050, 0.070],
  upperArmL: [0.980, -0.180, 0.400],
  foreArmL:  [1.280, -0.280, 0],
  thighR:    [0.640, -0.140, 0.075],
  shinR:     [-0.980, 0, 0],
  footR:     [0.260, -0.050, 0],
  thighL:    [0.200, 0.120, -0.085],
  shinL:     [-1.060, 0, 0],
  footL:     [0.280, 0.090, 0],
});

const hop_back_air = P({
  hips:      [-0.200, 0.260, 0.010, 0, 0.060, -0.010],
  spine1:    [0.140, -0.060, 0],
  spine2:    [0.130, -0.065, 0],
  spine3:    [0.100, -0.070, 0],
  neck:      [-0.140, -0.045, 0],
  head:      [-0.070, -0.060, 0],
  clavicleR: [-0.080, -0.050, -0.100],
  upperArmR: [1.320, 0.180, -0.560],
  foreArmR:  [1.180, 0.280, 0],
  clavicleL: [-0.080, 0.050, 0.090],
  upperArmL: [1.200, -0.180, 0.480],
  foreArmL:  [1.100, -0.280, 0],
  thighR:    [-0.260, -0.140, 0.070],
  shinR:     [-0.560, 0, 0],
  footR:     [-0.240, -0.050, 0],
  thighL:    [-0.140, 0.120, -0.080],
  shinL:     [-0.760, 0, 0],
  footL:     [-0.200, 0.090, 0],
});

const hop_back_land = blend(hop_back_crouch, idle_seigan, 0.45);

// ===========================================================================
// 7. STAGGER / POSTURE BREAK
// ===========================================================================

/** Hit from the character's right — everything whips to the left, lead foot skids. */
const stagger_l_1 = P({
  hips:      [-0.060, 0.140, -0.180, -0.040, -0.070, 0.030],
  spine1:    [-0.040, 0.120, 0.280],
  spine2:    [-0.036, 0.140, 0.310],
  spine3:    [-0.026, 0.150, 0.250],
  neck:      [0.060, -0.100, -0.280],
  head:      [0.030, -0.140, -0.320],
  clavicleR: [0.080, 0.120, 0.140],
  upperArmR: [0.560, 0.240, -0.140],
  foreArmR:  [1.180, 0.360, 0],
  clavicleL: [-0.040, 0.120, -0.060],
  upperArmL: [0.420, -0.240, 0.760],
  foreArmL:  [1.020, -0.360, 0],
  thighR:    [0.140, -0.100, 0.320],
  shinR:     [-0.480, 0, 0],
  footR:     [0.060, -0.040, 0],
  thighL:    [-0.180, 0.090, -0.420],
  shinL:     [-0.640, 0, 0],
  footL:     [0.100, 0.070, 0],
});

const stagger_l_2 = blend(stagger_l_1, idle_seigan, 0.55);
const stagger_r_1 = mirror(stagger_l_1);
const stagger_r_2 = mirror(stagger_l_2);

/** Hit from the front — folded over the impact, both heels driven back. */
const stagger_b_1 = P({
  hips:      [0.220, 0.180, 0, 0, -0.130, 0],
  spine1:    [-0.320, -0.040, 0],
  spine2:    [-0.300, -0.045, 0],
  spine3:    [-0.230, -0.050, 0],
  neck:      [0.180, -0.030, 0],
  head:      [-0.140, -0.040, 0],
  clavicleR: [-0.080, -0.040, -0.120],
  upperArmR: [1.240, 0.220, -0.320],
  foreArmR:  [1.560, 0.340, 0],
  clavicleL: [-0.080, 0.040, 0.110],
  upperArmL: [1.140, -0.220, 0.280],
  foreArmL:  [1.480, -0.340, 0],
  thighR:    [0.520, -0.120, 0.075],
  shinR:     [-0.860, 0, 0],
  footR:     [0.220, -0.050, 0],
  thighL:    [0.060, 0.100, -0.085],
  shinL:     [-0.940, 0, 0],
  footL:     [0.240, 0.080, 0],
});

const stagger_b_2 = blend(stagger_b_1, idle_seigan, 0.5);

/** 体勢崩し — posture broken. Sword arm drops, guard gone, knees give. */
const posture_break_1 = P({
  hips:      [0.320, 0.240, -0.060, 0, -0.240, 0.020],
  spine1:    [-0.420, -0.070, 0.060],
  spine2:    [-0.400, -0.080, 0.070],
  spine3:    [-0.310, -0.085, 0.060],
  neck:      [0.240, -0.060, -0.060],
  head:      [-0.280, -0.080, -0.070],
  clavicleR: [0.140, -0.050, 0.120],
  upperArmR: [0.180, 0.180, -0.120],
  foreArmR:  [0.520, 0.280, 0],
  handR:     [-0.100, 0.220, 0.060],
  clavicleL: [0.140, 0.050, -0.110],
  upperArmL: [0.140, -0.180, 0.100],
  foreArmL:  [0.460, -0.280, 0],
  handL:     [-0.080, -0.220, -0.060],
  thighR:    [0.660, -0.130, 0.090],
  shinR:     [-1.120, 0, 0],
  footR:     [0.240, -0.050, 0],
  thighL:    [0.180, 0.110, -0.100],
  shinL:     [-1.240, 0, 0],
  footL:     [0.280, 0.090, 0],
});

const posture_break_2 = P({
  hips:      [0.380, 0.180, 0.070, 0, -0.320, -0.020],
  spine1:    [-0.480, -0.050, -0.070],
  spine2:    [-0.460, -0.055, -0.080],
  spine3:    [-0.350, -0.060, -0.070],
  neck:      [0.280, -0.040, 0.070],
  head:      [-0.320, -0.055, 0.080],
  clavicleR: [0.170, -0.040, 0.140],
  upperArmR: [0.120, 0.180, -0.080],
  foreArmR:  [0.640, 0.280, 0],
  clavicleL: [0.170, 0.040, -0.130],
  upperArmL: [0.100, -0.180, 0.070],
  foreArmL:  [0.560, -0.280, 0],
  thighR:    [0.820, -0.100, 0.100],
  shinR:     [-1.360, 0, 0],
  footR:     [0.300, -0.040, 0],
  thighL:    [0.260, 0.090, -0.110],
  shinL:     [-1.420, 0, 0],
  footL:     [0.320, 0.080, 0],
});

// ===========================================================================
// 8. DEATHS
// ===========================================================================

const death_f_1 = P({
  hips:      [0.220, 0.100, -0.040, 0, -0.180, 0],
  spine1:    [-0.360, -0.040, 0.050],
  spine2:    [-0.340, -0.045, 0.060],
  spine3:    [-0.260, -0.050, 0.050],
  neck:      [0.120, -0.030, -0.050],
  head:      [-0.300, -0.040, -0.060],
  clavicleR: [0.140, -0.030, 0.120],
  upperArmR: [0.060, 0.160, -0.080],
  foreArmR:  [0.320, 0.240, 0],
  clavicleL: [0.140, 0.030, -0.110],
  upperArmL: [0.040, -0.160, 0.060],
  foreArmL:  [0.280, -0.240, 0],
  thighR:    [0.520, -0.100, 0.080],
  shinR:     [-1.020, 0, 0],
  footR:     [0.240, -0.040, 0],
  thighL:    [0.180, 0.090, -0.090],
  shinL:     [-1.140, 0, 0],
  footL:     [0.260, 0.070, 0],
});

/** Knees hit the ground first. This is the beat the player reads as "it's over". */
const death_f_2 = P({
  hips:      [0.420, 0.080, -0.030, 0, -0.520, 0],
  spine1:    [-0.520, -0.030, 0.040],
  spine2:    [-0.480, -0.035, 0.050],
  spine3:    [-0.360, -0.040, 0.040],
  neck:      [0.100, -0.020, -0.040],
  head:      [-0.420, -0.030, -0.050],
  clavicleR: [0.180, -0.020, 0.150],
  upperArmR: [-0.120, 0.140, -0.060],
  foreArmR:  [0.220, 0.200, 0],
  clavicleL: [0.180, 0.020, -0.140],
  upperArmL: [-0.140, -0.140, 0.040],
  foreArmL:  [0.200, -0.200, 0],
  thighR:    [0.880, -0.080, 0.090],
  shinR:     [-2.000, 0, 0],
  footR:     [0.420, -0.030, 0],
  thighL:    [0.760, 0.070, -0.100],
  shinL:     [-2.060, 0, 0],
  footL:     [0.440, 0.060, 0],
});

/** Face down, arms trailing. Hips are dropped to floor height by the pos delta. */
const death_f_end = P({
  hips:      [-1.480, 0.060, -0.020, 0, -0.815, -0.140],
  spine1:    [-0.140, -0.020, 0.030],
  spine2:    [-0.120, -0.025, 0.040],
  spine3:    [-0.080, -0.030, 0.030],
  neck:      [0.240, -0.020, -0.030],
  head:      [-0.180, -0.020, 0.240],
  clavicleR: [0.120, -0.020, 0.100],
  upperArmR: [-0.640, 0.140, -0.720],
  foreArmR:  [0.460, 0.180, 0],
  handR:     [-0.100, 0.200, 0],
  clavicleL: [0.120, 0.020, -0.090],
  upperArmL: [-0.700, -0.140, 0.640],
  foreArmL:  [0.380, -0.180, 0],
  handL:     [-0.080, -0.200, 0],
  thighR:    [-0.180, -0.060, 0.180],
  shinR:     [-0.320, 0, 0],
  footR:     [-0.200, -0.020, 0],
  thighL:    [-0.120, 0.050, -0.200],
  shinL:     [-0.240, 0, 0],
  footL:     [-0.180, 0.020, 0],
});

const death_b_1 = P({
  hips:      [-0.240, 0.080, 0.060, 0, -0.120, -0.030],
  spine1:    [0.280, -0.030, -0.070],
  spine2:    [0.260, -0.035, -0.080],
  spine3:    [0.200, -0.040, -0.070],
  neck:      [-0.260, -0.030, 0.070],
  head:      [-0.180, -0.040, 0.080],
  clavicleR: [-0.140, -0.030, -0.160],
  upperArmR: [0.640, 0.180, -0.560],
  foreArmR:  [0.760, 0.280, 0],
  clavicleL: [-0.140, 0.030, 0.150],
  upperArmL: [0.580, -0.180, 0.500],
  foreArmL:  [0.700, -0.280, 0],
  thighR:    [0.360, -0.100, 0.080],
  shinR:     [-0.560, 0, 0],
  footR:     [-0.180, -0.040, 0],
  thighL:    [0.180, 0.090, -0.090],
  shinL:     [-0.480, 0, 0],
  footL:     [-0.220, 0.070, 0],
});

const death_b_2 = P({
  hips:      [0.480, 0.060, 0.040, 0, -0.480, -0.060],
  spine1:    [0.180, -0.020, -0.050],
  spine2:    [0.160, -0.025, -0.060],
  spine3:    [0.120, -0.030, -0.050],
  neck:      [-0.180, -0.020, 0.050],
  head:      [-0.120, -0.030, 0.060],
  clavicleR: [-0.100, -0.020, -0.180],
  upperArmR: [0.420, 0.160, -0.860],
  foreArmR:  [0.560, 0.240, 0],
  clavicleL: [-0.100, 0.020, 0.170],
  upperArmL: [0.380, -0.160, 0.780],
  foreArmL:  [0.500, -0.240, 0],
  thighR:    [1.020, -0.080, 0.090],
  shinR:     [-1.240, 0, 0],
  footR:     [0.180, -0.030, 0],
  thighL:    [0.860, 0.070, -0.100],
  shinL:     [-1.320, 0, 0],
  footL:     [0.200, 0.060, 0],
});

/** On the back, head turned, one knee still folded. */
const death_b_end = P({
  hips:      [1.520, 0.040, 0.020, 0, -0.845, 0.120],
  spine1:    [0.120, -0.020, -0.040],
  spine2:    [0.100, -0.020, -0.050],
  spine3:    [0.070, -0.020, -0.040],
  neck:      [-0.220, -0.020, 0.040],
  head:      [-0.160, -0.360, 0.050],
  clavicleR: [-0.060, -0.020, -0.100],
  upperArmR: [0.260, 0.140, -1.040],
  foreArmR:  [0.340, 0.180, 0],
  handR:     [-0.060, 0.200, 0],
  clavicleL: [-0.060, 0.020, 0.090],
  upperArmL: [0.220, -0.140, 0.940],
  foreArmL:  [0.280, -0.180, 0],
  handL:     [-0.040, -0.200, 0],
  thighR:    [0.180, -0.060, 0.240],
  shinR:     [-0.680, 0, 0],
  footR:     [-0.120, -0.020, 0],
  thighL:    [0.060, 0.050, -0.180],
  shinL:     [-0.300, 0, 0],
  footL:     [-0.160, 0.020, 0],
});

const death_k_1 = P({
  hips:      [0.180, 0.140, -0.030, 0, -0.220, 0],
  spine1:    [-0.240, -0.050, 0.040],
  spine2:    [-0.220, -0.055, 0.050],
  spine3:    [-0.170, -0.060, 0.040],
  neck:      [0.180, -0.040, -0.040],
  head:      [-0.160, -0.055, -0.050],
  clavicleR: [0.100, -0.040, 0.080],
  upperArmR: [0.220, 0.170, -0.180],
  foreArmR:  [0.640, 0.260, 0],
  clavicleL: [0.100, 0.040, -0.070],
  upperArmL: [0.180, -0.170, 0.140],
  foreArmL:  [0.580, -0.260, 0],
  thighR:    [0.700, -0.120, 0.085],
  shinR:     [-1.280, 0, 0],
  footR:     [0.300, -0.050, 0],
  thighL:    [0.420, 0.100, -0.095],
  shinL:     [-1.360, 0, 0],
  footL:     [0.320, 0.080, 0],
});

/** 正座 seiza — both knees down, back still straight. A samurai's death. */
const death_k_2 = P({
  hips:      [0.120, 0.100, 0, 0, -0.560, 0],
  spine1:    [-0.120, -0.040, 0],
  spine2:    [-0.100, -0.045, 0],
  spine3:    [-0.070, -0.050, 0],
  neck:      [0.140, -0.035, 0],
  head:      [-0.080, -0.045, 0],
  clavicleR: [0.130, -0.030, 0.100],
  upperArmR: [0.060, 0.150, -0.120],
  foreArmR:  [0.420, 0.220, 0],
  clavicleL: [0.130, 0.030, -0.090],
  upperArmL: [0.040, -0.150, 0.100],
  foreArmL:  [0.380, -0.220, 0],
  thighR:    [1.180, -0.100, 0.090],
  shinR:     [-2.260, 0, 0],
  footR:     [-0.560, -0.040, 0],
  toeR:      [0.360, 0, 0],
  thighL:    [1.140, 0.090, -0.100],
  shinL:     [-2.280, 0, 0],
  footL:     [-0.560, 0.030, 0],
  toeL:      [0.360, 0, 0],
});

/** The head goes last, and the body follows it down sideways. */
const death_k_end = P({
  hips:      [0.060, 0.080, 0.640, -0.180, -0.640, 0],
  spine1:    [-0.060, -0.030, 0.220],
  spine2:    [-0.040, -0.035, 0.240],
  spine3:    [-0.020, -0.040, 0.200],
  neck:      [0.060, -0.030, -0.180],
  head:      [-0.240, -0.040, -0.280],
  clavicleR: [0.140, -0.020, 0.120],
  upperArmR: [-0.140, 0.140, -0.100],
  foreArmR:  [0.240, 0.200, 0],
  clavicleL: [0.140, 0.020, -0.110],
  upperArmL: [-0.180, -0.140, 0.080],
  foreArmL:  [0.200, -0.200, 0],
  thighR:    [1.220, -0.090, 0.100],
  shinR:     [-2.300, 0, 0],
  footR:     [-0.580, -0.030, 0],
  toeR:      [0.380, 0, 0],
  thighL:    [1.180, 0.080, -0.110],
  shinL:     [-2.320, 0, 0],
  footL:     [-0.580, 0.020, 0],
  toeL:      [0.380, 0, 0],
});

// ===========================================================================
// 9. EXECUTION (paired — attacker and victim share a timeline)
// ===========================================================================

/** Attacker raises for the 止め tome. Blade vertical, point down, both hands high. */
const exec_a_raise = P({
  hips:      [-0.040, 0.180, 0.010, 0, -0.060, -0.010],
  spine1:    [-0.120, -0.060, 0],
  spine2:    [-0.110, -0.065, 0],
  spine3:    [-0.085, -0.070, 0],
  neck:      [0.060, -0.045, 0],
  head:      [-0.180, -0.060, 0],
  clavicleR: [-0.220, -0.060, -0.190],
  upperArmR: [2.680, 0.180, -0.420],
  foreArmR:  [0.680, 0.760, 0],
  handR:     [-0.300, 0.600, 0.140],
  clavicleL: [-0.210, 0.060, 0.180],
  upperArmL: [2.560, -0.180, 0.360],
  foreArmL:  [0.600, -0.760, 0],
  handL:     [-0.260, -0.600, -0.140],
  thighR:    [0.320, -0.120, 0.070],
  shinR:     [-0.560, 0, 0],
  footR:     [0.020, -0.050, 0],
  thighL:    [-0.180, 0.100, -0.085],
  shinL:     [-0.680, 0, 0],
  footL:     [-0.120, 0.090, 0],
  toeL:      [0.260, 0, 0],
});

/** The downward thrust. Weight drops with it; this is a whole-body movement. */
const exec_a_thrust = P({
  hips:      [0.360, 0.140, 0, 0, -0.330, 0],
  spine1:    [-0.320, -0.050, 0],
  spine2:    [-0.300, -0.055, 0],
  spine3:    [-0.230, -0.060, 0],
  neck:      [0.180, -0.040, 0],
  head:      [-0.280, -0.055, 0],
  clavicleR: [0.060, -0.040, -0.040],
  upperArmR: [0.760, 0.160, -0.320],
  foreArmR:  [0.240, 0.700, 0],
  handR:     [-0.100, 0.560, 0.060],
  clavicleL: [0.060, 0.040, 0.030],
  upperArmL: [0.680, -0.160, 0.260],
  foreArmL:  [0.200, -0.700, 0],
  handL:     [-0.080, -0.560, -0.060],
  thighR:    [0.860, -0.110, 0.085],
  shinR:     [-1.280, 0, 0],
  footR:     [0.240, -0.050, 0],
  thighL:    [-0.140, 0.090, -0.095],
  shinL:     [-1.180, 0, 0],
  footL:     [-0.320, 0.080, 0],
  toeL:      [0.520, 0, 0],
});

/** Withdraw and rise. Zanshin: the attacker never looks away. */
const exec_a_pull = blend(exec_a_thrust, idle_seigan, 0.62);

/** Victim on one knee, sword arm hanging, still upright by will alone. */
const exec_v_kneel = P({
  hips:      [0.220, -0.180, -0.040, 0, -0.400, 0],
  spine1:    [-0.280, 0.060, 0.050],
  spine2:    [-0.260, 0.065, 0.060],
  spine3:    [-0.200, 0.070, 0.050],
  neck:      [0.220, 0.050, -0.050],
  head:      [-0.200, 0.065, -0.060],
  clavicleR: [0.140, 0.040, 0.120],
  upperArmR: [0.140, 0.160, -0.140],
  foreArmR:  [0.520, 0.240, 0],
  clavicleL: [0.140, -0.040, -0.110],
  upperArmL: [0.100, -0.160, 0.120],
  foreArmL:  [0.460, -0.240, 0],
  thighR:    [1.180, -0.100, 0.090],
  shinR:     [-2.180, 0, 0],
  footR:     [-0.480, -0.040, 0],
  toeR:      [0.320, 0, 0],
  thighL:    [0.760, 0.090, -0.100],
  shinL:     [-1.420, 0, 0],
  footL:     [0.260, 0.070, 0],
});

/** The moment of impact — arched back, chin up. */
const exec_v_impact = P({
  hips:      [0.140, -0.160, -0.030, 0, -0.440, 0],
  spine1:    [0.180, 0.050, 0.040],
  spine2:    [0.170, 0.055, 0.050],
  spine3:    [0.130, 0.060, 0.040],
  neck:      [-0.240, 0.040, -0.040],
  head:      [0.260, 0.055, -0.050],
  clavicleR: [-0.160, 0.030, -0.180],
  upperArmR: [0.420, 0.180, -0.760],
  foreArmR:  [0.360, 0.260, 0],
  clavicleL: [-0.160, -0.030, 0.170],
  upperArmL: [0.380, -0.180, 0.700],
  foreArmL:  [0.320, -0.260, 0],
  thighR:    [1.220, -0.100, 0.090],
  shinR:     [-2.220, 0, 0],
  footR:     [-0.500, -0.040, 0],
  toeR:      [0.340, 0, 0],
  thighL:    [0.820, 0.090, -0.100],
  shinL:     [-1.480, 0, 0],
  footL:     [0.280, 0.070, 0],
});

/** Collapses sideways off the kneeling leg. */
const exec_v_fall = P({
  hips:      [0.060, -0.140, -0.820, 0.220, -0.660, 0],
  spine1:    [-0.120, 0.040, -0.240],
  spine2:    [-0.100, 0.045, -0.260],
  spine3:    [-0.070, 0.050, -0.210],
  neck:      [0.100, 0.040, 0.200],
  head:      [-0.220, 0.050, 0.300],
  clavicleR: [0.140, 0.020, 0.120],
  upperArmR: [-0.160, 0.140, -0.120],
  foreArmR:  [0.220, 0.200, 0],
  clavicleL: [0.140, -0.020, -0.110],
  upperArmL: [-0.200, -0.140, 0.100],
  foreArmL:  [0.180, -0.200, 0],
  thighR:    [1.100, -0.090, 0.140],
  shinR:     [-2.100, 0, 0],
  footR:     [-0.460, -0.030, 0],
  thighL:    [0.640, 0.080, -0.240],
  shinL:     [-1.240, 0, 0],
  footL:     [0.200, 0.060, 0],
});

// ===========================================================================
// 10. 血振り + 納刀 — THE FLOURISH
// ===========================================================================

/** Chiburi wind: blade comes up and across to the right ear, edge outward. */
const chiburi_wind = P({
  hips:      [0.010, 0.300, 0.010, 0, -0.060, -0.010],
  spine1:    [-0.070, -0.110, 0.020],
  spine2:    [-0.065, -0.120, 0.026],
  spine3:    [-0.045, -0.130, 0.026],
  neck:      [0.110, 0.080, -0.020],
  head:      [0.055, 0.040, -0.024],
  clavicleR: [-0.150, -0.090, -0.160],
  upperArmR: [2.020, 0.240, -0.520],
  foreArmR:  [1.360, 0.420, 0],
  handR:     [-0.260, 0.320, 0.140],
  clavicleL: [-0.040, 0.080, 0.060],
  upperArmL: [0.420, -0.200, 0.240],
  foreArmL:  [0.680, -0.340, 0],
  handL:     [-0.100, -0.280, -0.100],
  thighR:    [0.260, -0.170, 0.060],
  shinR:     [-0.320, 0, 0],
  footR:     [-0.040, -0.060, 0],
  thighL:    [-0.260, 0.150, -0.075],
  shinL:     [-0.460, 0, 0],
  footL:     [-0.120, 0.110, 0],
  toeL:      [0.180, 0, 0],
});

/** The flick — a hard, short snap down and out to the right. Blood leaves the steel. */
const chiburi_flick = P({
  hips:      [0.020, 0.220, 0.010, 0, -0.058, -0.010],
  spine1:    [-0.040, -0.060, -0.030],
  spine2:    [-0.035, -0.065, -0.036],
  spine3:    [-0.025, -0.070, -0.036],
  neck:      [0.060, 0.045, 0.030],
  head:      [0.030, 0.020, 0.034],
  clavicleR: [0.060, -0.060, -0.020],
  upperArmR: [0.320, 0.220, -0.640],
  foreArmR:  [0.180, 0.940, 0],
  handR:     [-0.060, 0.820, 0.200],
  clavicleL: [-0.020, 0.060, 0.040],
  upperArmL: [0.320, -0.200, 0.200],
  foreArmL:  [0.620, -0.320, 0],
  handL:     [-0.080, -0.260, -0.090],
  thighR:    [0.300, -0.130, 0.060],
  shinR:     [-0.380, 0, 0],
  footR:     [-0.040, -0.050, 0],
  thighL:    [-0.280, 0.120, -0.075],
  shinL:     [-0.500, 0, 0],
  footL:     [-0.130, 0.090, 0],
  toeL:      [0.190, 0, 0],
});

/** Hold. Two full beats of nothing. This is what sells it. */
const chiburi_hold = blend(chiburi_flick, P({
  hips:      [0.010, 0.230, 0, 0, -0.066, -0.010],
  spine1:    [-0.020, -0.060, -0.020],
  spine2:    [-0.014, -0.065, -0.024],
  neck:      [0.040, 0.045, 0.020],
  head:      [0.016, 0.020, 0.024],
  upperArmR: [0.280, 0.220, -0.600],
  foreArmR:  [0.220, 0.900, 0],
  thighR:    [0.320, -0.130, 0.066],
  shinR:     [-0.420, 0, 0],
  thighL:    [-0.260, 0.120, -0.082],
  shinL:     [-0.540, 0, 0],
}), 1.0);

/** Formal closing bow of the head as the tsuba clicks home. */
const noto_bow = blend(idle_sheathed, P({
  spine1:    [-0.140, -0.010, 0],
  spine2:    [-0.130, 0.020, -0.006],
  spine3:    [-0.100, 0.030, -0.006],
  neck:      [0.060, -0.020, 0.004],
  head:      [-0.260, -0.055, 0.006],
}), 1.0);

/**
 * Mirror only the ARM chain of a pose, keeping the legs and hips as authored.
 * A two-handed grip means a "mirrored" cut still has the right hand on top —
 * the stance mirrors, the grip does not. Declared after use via hoisting, which
 * is intentional: it keeps the attack poses reading in swing order.
 */
function mirrorArms(pose) {
  const armish = /^(clavicle|upperArm|foreArm|hand)/;
  const out = {};
  for (const k in pose) {
    const e = pose[k];
    if (armish.test(k)) {
      const r = e.rot;
      out[mirrorName(k)] = Object.freeze({ rot: Object.freeze([r[0], -r[1], -r[2]]) });
    } else if (k === 'hips' || k.startsWith('spine') || k === 'neck' || k === 'head') {
      const r = e.rot;
      const v = { rot: Object.freeze([r[0], -r[1] * 0.8, -r[2]]) };
      if (e.pos) v.pos = e.pos;
      out[k] = Object.freeze(v);
    } else {
      out[k] = e;
    }
  }
  return Object.freeze(out);
}

// ===========================================================================
// POSE REGISTRY
// ===========================================================================

export const POSES = Object.freeze({
  rest,
  idle_sheathed, idle_sheathed_b,
  idle_seigan, idle_seigan_b,
  idle_jodan, idle_jodan_b,
  idle_gedan, idle_gedan_b,
  walk_c_r, walk_p_r, walk_c_l, walk_p_l,
  run_c_r, run_low_r, run_air_r, run_c_l, run_low_l, run_air_l,
  sprint_c_r, sprint_low_r, sprint_air_r, sprint_c_l, sprint_low_l, sprint_air_l,
  back_c_r, back_p_r, back_c_l, back_p_l,
  strafe_l_0, strafe_l_1, strafe_l_2, strafe_l_3,
  strafe_r_0, strafe_r_1, strafe_r_2, strafe_r_3,
  draw_grip, draw_coil, draw_cut, draw_settle,
  sheathe_align, sheathe_slide,
  wind_horiz_r, strike_horiz_r, wind_horiz_l, strike_horiz_l,
  wind_kesa, wind_kesa_l, strike_kesa_dl, strike_kesa_dr,
  wind_overhead, strike_overhead,
  wind_thrust, strike_thrust,
  wind_rising, strike_rising,
  wind_heavy, strike_heavy,
  guard_high, guard_press, parry_snap, clash_recoil_pose,
  roll_launch, roll_tuck, roll_over, roll_land,
  step_l_push, step_l_air, step_l_land,
  step_r_push, step_r_air, step_r_land,
  hop_back_crouch, hop_back_air, hop_back_land,
  stagger_l_1, stagger_l_2, stagger_r_1, stagger_r_2,
  stagger_b_1, stagger_b_2, posture_break_1, posture_break_2,
  death_f_1, death_f_2, death_f_end,
  death_b_1, death_b_2, death_b_end,
  death_k_1, death_k_2, death_k_end,
  exec_a_raise, exec_a_thrust, exec_a_pull,
  exec_v_kneel, exec_v_impact, exec_v_fall,
  chiburi_wind, chiburi_flick, chiburi_hold, noto_bow,
});

export const POSE_NAMES = Object.freeze(Object.keys(POSES));

// ===========================================================================
// CLIPS
// ===========================================================================

/**
 * Layer routing. `base` is the locomotion bed, `action` is a full-body override
 * (attacks, dodges, deaths), `upper` overrides only the spine-and-up subtree so a
 * character can swing while running, and `additive` stacks deltas on everything.
 */
const L_BASE = 'base', L_ACTION = 'action', L_UPPER = 'upper';

function clip(name, duration, keys, opts) {
  const o = opts || {};
  return Object.freeze({
    name,
    duration,
    loop: o.loop !== undefined ? o.loop : false,
    layer: o.layer || L_ACTION,
    mask: o.mask || 'full',
    /** Blend-space metadata; only locomotion clips carry it. */
    speed: o.speed !== undefined ? o.speed : 0,
    stride: o.stride !== undefined ? o.stride : 0,
    /** Approximate root travel in metres, for controllers that want to match a dodge. */
    travel: o.travel ? Object.freeze(o.travel) : null,
    /** Default fade-in when this clip is played without an explicit one. */
    fade: o.fade !== undefined ? o.fade : 0.14,
    keys: Object.freeze(keys.map((k) => Object.freeze({
      t: k.t, pose: k.pose, ease: k.ease || 'smoother',
    }))),
    events: Object.freeze((o.events || []).map((e) => Object.freeze({ t: e.t, name: e.name, foot: e.foot }))),
  });
}

const CLIPS = {};
function def(c) { CLIPS[c.name] = c; return c; }

// ---------------------------------------------------------------- idles

def(clip('idle_sheathed', 4.2, [
  { t: 0.00, pose: idle_sheathed },
  { t: 1.90, pose: idle_sheathed_b },
  { t: 2.40, pose: idle_sheathed_b },
  { t: 4.20, pose: idle_sheathed },
], { loop: true, layer: L_BASE, fade: 0.30 }));

def(clip('idle_drawn_seigan', 3.4, [
  { t: 0.00, pose: idle_seigan },
  { t: 1.55, pose: idle_seigan_b },
  { t: 1.95, pose: idle_seigan_b },
  { t: 3.40, pose: idle_seigan },
], { loop: true, layer: L_BASE, fade: 0.26 }));

def(clip('idle_drawn_jodan', 3.0, [
  { t: 0.00, pose: idle_jodan },
  { t: 1.35, pose: idle_jodan_b },
  { t: 1.70, pose: idle_jodan_b },
  { t: 3.00, pose: idle_jodan },
], { loop: true, layer: L_BASE, fade: 0.26 }));

def(clip('idle_drawn_gedan', 3.6, [
  { t: 0.00, pose: idle_gedan },
  { t: 1.65, pose: idle_gedan_b },
  { t: 2.05, pose: idle_gedan_b },
  { t: 3.60, pose: idle_gedan },
], { loop: true, layer: L_BASE, fade: 0.26 }));

// ------------------------------------------------------------ locomotion
// Duration is exactly 1.0 for every gait: Rig.js treats clip time as *phase* and
// derives cadence from ground speed, so these never need retiming.

def(clip('walk', 1.0, [
  { t: 0.00, pose: walk_c_r, ease: 'smooth' },
  { t: 0.25, pose: walk_p_r, ease: 'smooth' },
  { t: 0.50, pose: walk_c_l, ease: 'smooth' },
  { t: 0.75, pose: walk_p_l, ease: 'smooth' },
  { t: 1.00, pose: walk_c_r, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: 1.9, stride: 1.34, fade: 0.20,
  events: [{ t: 0.02, name: 'footstep', foot: 'R' }, { t: 0.52, name: 'footstep', foot: 'L' }],
}));

def(clip('run', 1.0, [
  { t: 0.000, pose: run_c_r, ease: 'smooth' },
  { t: 0.130, pose: run_low_r, ease: 'smooth' },
  { t: 0.290, pose: run_air_r, ease: 'smooth' },
  { t: 0.500, pose: run_c_l, ease: 'smooth' },
  { t: 0.630, pose: run_low_l, ease: 'smooth' },
  { t: 0.790, pose: run_air_l, ease: 'smooth' },
  { t: 1.000, pose: run_c_r, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: 5.4, stride: 2.05, fade: 0.18,
  events: [{ t: 0.01, name: 'footstep', foot: 'R' }, { t: 0.51, name: 'footstep', foot: 'L' }],
}));

def(clip('sprint', 1.0, [
  { t: 0.000, pose: sprint_c_r, ease: 'smooth' },
  { t: 0.120, pose: sprint_low_r, ease: 'smooth' },
  { t: 0.300, pose: sprint_air_r, ease: 'smooth' },
  { t: 0.500, pose: sprint_c_l, ease: 'smooth' },
  { t: 0.620, pose: sprint_low_l, ease: 'smooth' },
  { t: 0.800, pose: sprint_air_l, ease: 'smooth' },
  { t: 1.000, pose: sprint_c_r, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: 7.2, stride: 2.48, fade: 0.16,
  events: [{ t: 0.01, name: 'footstep', foot: 'R' }, { t: 0.51, name: 'footstep', foot: 'L' }],
}));

def(clip('walk_back', 1.0, [
  { t: 0.00, pose: back_c_r, ease: 'smooth' },
  { t: 0.25, pose: back_p_r, ease: 'smooth' },
  { t: 0.50, pose: back_c_l, ease: 'smooth' },
  { t: 0.75, pose: back_p_l, ease: 'smooth' },
  { t: 1.00, pose: back_c_r, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: -1.7, stride: 1.05, fade: 0.20,
  events: [{ t: 0.02, name: 'footstep', foot: 'R' }, { t: 0.52, name: 'footstep', foot: 'L' }],
}));

def(clip('strafe_l', 1.0, [
  { t: 0.00, pose: strafe_l_0, ease: 'smooth' },
  { t: 0.25, pose: strafe_l_1, ease: 'smooth' },
  { t: 0.50, pose: strafe_l_2, ease: 'smooth' },
  { t: 0.75, pose: strafe_l_3, ease: 'smooth' },
  { t: 1.00, pose: strafe_l_0, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: 2.4, stride: 1.15, fade: 0.20,
  events: [{ t: 0.03, name: 'footstep', foot: 'R' }, { t: 0.53, name: 'footstep', foot: 'L' }],
}));

def(clip('strafe_r', 1.0, [
  { t: 0.00, pose: strafe_r_0, ease: 'smooth' },
  { t: 0.25, pose: strafe_r_1, ease: 'smooth' },
  { t: 0.50, pose: strafe_r_2, ease: 'smooth' },
  { t: 0.75, pose: strafe_r_3, ease: 'smooth' },
  { t: 1.00, pose: strafe_r_0, ease: 'smooth' },
], {
  loop: true, layer: L_BASE, speed: 2.4, stride: 1.15, fade: 0.20,
  events: [{ t: 0.03, name: 'footstep', foot: 'L' }, { t: 0.53, name: 'footstep', foot: 'R' }],
}));

// ------------------------------------------------------------- draw/sheathe

def(clip('draw_iai', 0.74, [
  { t: 0.000, pose: idle_sheathed, ease: 'out' },
  { t: 0.140, pose: draw_grip, ease: 'smooth' },
  { t: 0.300, pose: draw_coil, ease: 'out' },
  { t: 0.340, pose: draw_coil, ease: 'hold' },
  { t: 0.400, pose: draw_cut, ease: 'in' },
  { t: 0.470, pose: draw_cut, ease: 'hold' },
  { t: 0.740, pose: draw_settle, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.06,
  events: [
    { t: 0.120, name: 'footstep', foot: 'R' },
    { t: 0.355, name: 'swoosh' },
    { t: 0.368, name: 'hit-active-start' },
    { t: 0.470, name: 'hit-active-end' },
    { t: 0.560, name: 'cancel-window-open' },
  ],
}));

def(clip('sheathe', 1.15, [
  { t: 0.000, pose: idle_seigan, ease: 'smooth' },
  { t: 0.280, pose: sheathe_align, ease: 'smoother' },
  { t: 0.420, pose: sheathe_align, ease: 'hold' },
  { t: 0.760, pose: sheathe_slide, ease: 'in' },
  { t: 0.900, pose: sheathe_slide, ease: 'hold' },
  { t: 1.150, pose: idle_sheathed, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.16,
  events: [
    { t: 0.300, name: 'swoosh' },
    { t: 0.880, name: 'sheathe-click' },
    { t: 0.950, name: 'cancel-window-open' },
  ],
}));

// ---------------------------------------------------------------- attacks
// Every attack: anticipation (~40%), a strike measured in single frames, then a
// recovery that is longer than it feels, with the cancel window opening inside it.

def(clip('slash_horizontal_r', 0.78, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.150, pose: blend(idle_seigan, wind_horiz_r, 0.62), ease: 'smooth' },
  { t: 0.300, pose: wind_horiz_r, ease: 'out' },
  { t: 0.340, pose: wind_horiz_r, ease: 'hold' },
  { t: 0.400, pose: blend(wind_horiz_r, strike_horiz_r, 0.62), ease: 'in' },
  { t: 0.470, pose: strike_horiz_r, ease: 'in' },
  { t: 0.560, pose: strike_horiz_r, ease: 'hold' },
  { t: 0.780, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.330, name: 'swoosh' },
    { t: 0.352, name: 'hit-active-start' },
    { t: 0.478, name: 'hit-active-end' },
    { t: 0.560, name: 'cancel-window-open' },
  ],
}));

def(clip('slash_horizontal_l', 0.82, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.160, pose: blend(idle_seigan, wind_horiz_l, 0.62), ease: 'smooth' },
  { t: 0.320, pose: wind_horiz_l, ease: 'out' },
  { t: 0.360, pose: wind_horiz_l, ease: 'hold' },
  { t: 0.420, pose: blend(wind_horiz_l, strike_horiz_l, 0.62), ease: 'in' },
  { t: 0.495, pose: strike_horiz_l, ease: 'in' },
  { t: 0.590, pose: strike_horiz_l, ease: 'hold' },
  { t: 0.820, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.350, name: 'swoosh' },
    { t: 0.372, name: 'hit-active-start' },
    { t: 0.502, name: 'hit-active-end' },
    { t: 0.590, name: 'cancel-window-open' },
  ],
}));

def(clip('slash_diagonal_dl', 0.86, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.170, pose: blend(idle_seigan, wind_kesa, 0.60), ease: 'smooth' },
  { t: 0.340, pose: wind_kesa, ease: 'out' },
  { t: 0.385, pose: wind_kesa, ease: 'hold' },
  { t: 0.445, pose: blend(wind_kesa, strike_kesa_dl, 0.60), ease: 'in' },
  { t: 0.520, pose: strike_kesa_dl, ease: 'in' },
  { t: 0.620, pose: strike_kesa_dl, ease: 'hold' },
  { t: 0.860, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.375, name: 'swoosh' },
    { t: 0.398, name: 'hit-active-start' },
    { t: 0.528, name: 'hit-active-end' },
    { t: 0.620, name: 'cancel-window-open' },
  ],
}));

def(clip('slash_diagonal_dr', 0.86, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.170, pose: blend(idle_seigan, wind_kesa_l, 0.60), ease: 'smooth' },
  { t: 0.340, pose: wind_kesa_l, ease: 'out' },
  { t: 0.385, pose: wind_kesa_l, ease: 'hold' },
  { t: 0.445, pose: blend(wind_kesa_l, strike_kesa_dr, 0.60), ease: 'in' },
  { t: 0.520, pose: strike_kesa_dr, ease: 'in' },
  { t: 0.620, pose: strike_kesa_dr, ease: 'hold' },
  { t: 0.860, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.375, name: 'swoosh' },
    { t: 0.398, name: 'hit-active-start' },
    { t: 0.528, name: 'hit-active-end' },
    { t: 0.620, name: 'cancel-window-open' },
  ],
}));

def(clip('slash_overhead', 0.88, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.175, pose: blend(idle_seigan, wind_overhead, 0.60), ease: 'smooth' },
  { t: 0.350, pose: wind_overhead, ease: 'out' },
  { t: 0.400, pose: wind_overhead, ease: 'hold' },
  { t: 0.455, pose: blend(wind_overhead, strike_overhead, 0.65), ease: 'in' },
  { t: 0.520, pose: strike_overhead, ease: 'in' },
  { t: 0.640, pose: strike_overhead, ease: 'hold' },
  { t: 0.880, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.390, name: 'swoosh' },
    { t: 0.412, name: 'hit-active-start' },
    { t: 0.528, name: 'hit-active-end' },
    { t: 0.560, name: 'footstep', foot: 'R' },
    { t: 0.650, name: 'cancel-window-open' },
  ],
}));

def(clip('thrust', 0.64, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.130, pose: blend(idle_seigan, wind_thrust, 0.70), ease: 'smooth' },
  { t: 0.245, pose: wind_thrust, ease: 'out' },
  { t: 0.285, pose: wind_thrust, ease: 'hold' },
  { t: 0.345, pose: strike_thrust, ease: 'in' },
  { t: 0.430, pose: strike_thrust, ease: 'hold' },
  { t: 0.640, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.06,
  events: [
    { t: 0.275, name: 'swoosh' },
    { t: 0.298, name: 'hit-active-start' },
    { t: 0.352, name: 'hit-active-end' },
    { t: 0.330, name: 'footstep', foot: 'R' },
    { t: 0.440, name: 'cancel-window-open' },
  ],
}));

def(clip('rising_cut', 0.80, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.160, pose: blend(idle_seigan, wind_rising, 0.62), ease: 'smooth' },
  { t: 0.310, pose: wind_rising, ease: 'out' },
  { t: 0.355, pose: wind_rising, ease: 'hold' },
  { t: 0.415, pose: blend(wind_rising, strike_rising, 0.62), ease: 'in' },
  { t: 0.485, pose: strike_rising, ease: 'in' },
  { t: 0.580, pose: strike_rising, ease: 'hold' },
  { t: 0.800, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.345, name: 'swoosh' },
    { t: 0.368, name: 'hit-active-start' },
    { t: 0.492, name: 'hit-active-end' },
    { t: 0.580, name: 'cancel-window-open' },
  ],
}));

def(clip('heavy_overhead', 1.58, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.240, pose: blend(idle_seigan, wind_heavy, 0.55), ease: 'smooth' },
  { t: 0.520, pose: wind_heavy, ease: 'out' },
  { t: 0.640, pose: wind_heavy, ease: 'hold' },
  { t: 0.700, pose: blend(wind_heavy, strike_heavy, 0.55), ease: 'in' },
  { t: 0.770, pose: strike_heavy, ease: 'in' },
  { t: 0.980, pose: strike_heavy, ease: 'hold' },
  { t: 1.580, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.10,
  events: [
    { t: 0.180, name: 'heavy-charge' },
    { t: 0.630, name: 'swoosh' },
    { t: 0.658, name: 'hit-active-start' },
    { t: 0.790, name: 'hit-active-end' },
    { t: 0.800, name: 'footstep', foot: 'R' },
    { t: 1.080, name: 'cancel-window-open' },
  ],
}));

// ------------------------------------------------------------------ combos
// The chain is horizontal → return → overhead finisher. Each link opens its cancel
// window before its recovery finishes, which is what makes the chain feel elastic.

def(clip('combo_1', 0.62, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.110, pose: blend(idle_seigan, wind_horiz_r, 0.70), ease: 'smooth' },
  { t: 0.215, pose: wind_horiz_r, ease: 'out' },
  { t: 0.250, pose: wind_horiz_r, ease: 'hold' },
  { t: 0.310, pose: blend(wind_horiz_r, strike_horiz_r, 0.65), ease: 'in' },
  { t: 0.375, pose: strike_horiz_r, ease: 'in' },
  { t: 0.450, pose: strike_horiz_r, ease: 'hold' },
  { t: 0.620, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.06,
  events: [
    { t: 0.240, name: 'swoosh' },
    { t: 0.262, name: 'hit-active-start' },
    { t: 0.382, name: 'hit-active-end' },
    { t: 0.400, name: 'cancel-window-open' },
  ],
}));

def(clip('combo_2', 0.68, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.100, pose: blend(idle_seigan, wind_horiz_l, 0.74), ease: 'smooth' },
  { t: 0.205, pose: wind_horiz_l, ease: 'out' },
  { t: 0.240, pose: wind_horiz_l, ease: 'hold' },
  { t: 0.305, pose: blend(wind_horiz_l, strike_horiz_l, 0.65), ease: 'in' },
  { t: 0.375, pose: strike_horiz_l, ease: 'in' },
  { t: 0.470, pose: strike_horiz_l, ease: 'hold' },
  { t: 0.680, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.06,
  events: [
    { t: 0.232, name: 'swoosh' },
    { t: 0.254, name: 'hit-active-start' },
    { t: 0.382, name: 'hit-active-end' },
    { t: 0.420, name: 'cancel-window-open' },
  ],
}));

def(clip('combo_3', 1.06, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.140, pose: blend(idle_seigan, wind_overhead, 0.72), ease: 'smooth' },
  { t: 0.290, pose: wind_overhead, ease: 'out' },
  { t: 0.360, pose: wind_overhead, ease: 'hold' },
  { t: 0.420, pose: blend(wind_overhead, strike_heavy, 0.55), ease: 'in' },
  { t: 0.495, pose: strike_heavy, ease: 'in' },
  { t: 0.680, pose: strike_heavy, ease: 'hold' },
  { t: 1.060, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.07,
  events: [
    { t: 0.348, name: 'swoosh' },
    { t: 0.374, name: 'hit-active-start' },
    { t: 0.505, name: 'hit-active-end' },
    { t: 0.520, name: 'footstep', foot: 'R' },
    { t: 0.760, name: 'cancel-window-open' },
  ],
}));

// ----------------------------------------------------------------- defence

def(clip('guard', 0.30, [
  { t: 0.000, pose: idle_seigan, ease: 'out' },
  { t: 0.130, pose: guard_high, ease: 'back' },
  { t: 0.300, pose: guard_high, ease: 'smoother' },
], { layer: L_UPPER, mask: 'upper', fade: 0.09, events: [{ t: 0.10, name: 'guard-up' }] }));

def(clip('guard_impact', 0.30, [
  { t: 0.000, pose: guard_high, ease: 'in' },
  { t: 0.060, pose: guard_press, ease: 'snap' },
  { t: 0.300, pose: guard_high, ease: 'smoother' },
], { layer: L_UPPER, mask: 'upper', fade: 0.03 }));

def(clip('parry', 0.34, [
  { t: 0.000, pose: guard_high, ease: 'out' },
  { t: 0.055, pose: parry_snap, ease: 'snap' },
  { t: 0.110, pose: parry_snap, ease: 'hold' },
  { t: 0.340, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_UPPER, mask: 'upper', fade: 0.04,
  events: [
    { t: 0.020, name: 'parry-window-open' },
    { t: 0.058, name: 'swoosh' },
    { t: 0.140, name: 'parry-window-close' },
    { t: 0.180, name: 'cancel-window-open' },
  ],
}));

def(clip('clash_recoil', 0.44, [
  { t: 0.000, pose: guard_high, ease: 'in' },
  { t: 0.070, pose: clash_recoil_pose, ease: 'snap' },
  { t: 0.150, pose: clash_recoil_pose, ease: 'hold' },
  { t: 0.440, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_UPPER, mask: 'upper', fade: 0.03,
  events: [{ t: 0.02, name: 'clash' }, { t: 0.30, name: 'cancel-window-open' }],
}));

// ------------------------------------------------------------------ dodges

def(clip('dodge_roll', 0.88, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.100, pose: roll_launch, ease: 'in' },
  { t: 0.280, pose: roll_tuck, ease: 'linear' },
  { t: 0.480, pose: roll_over, ease: 'linear' },
  { t: 0.640, pose: roll_land, ease: 'out' },
  { t: 0.880, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.05, travel: [0, 0, -3.4],
  events: [
    { t: 0.090, name: 'iframe-start' },
    { t: 0.120, name: 'footstep', foot: 'R' },
    { t: 0.560, name: 'iframe-end' },
    { t: 0.620, name: 'footstep', foot: 'L' },
    { t: 0.680, name: 'cancel-window-open' },
  ],
}));

def(clip('dodge_step_l', 0.44, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.075, pose: step_l_push, ease: 'in' },
  { t: 0.200, pose: step_l_air, ease: 'linear' },
  { t: 0.300, pose: step_l_land, ease: 'out' },
  { t: 0.440, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.05, travel: [-2.1, 0, 0],
  events: [
    { t: 0.070, name: 'iframe-start' },
    { t: 0.080, name: 'footstep', foot: 'R' },
    { t: 0.270, name: 'iframe-end' },
    { t: 0.300, name: 'footstep', foot: 'L' },
    { t: 0.320, name: 'cancel-window-open' },
  ],
}));

def(clip('dodge_step_r', 0.44, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.075, pose: step_r_push, ease: 'in' },
  { t: 0.200, pose: step_r_air, ease: 'linear' },
  { t: 0.300, pose: step_r_land, ease: 'out' },
  { t: 0.440, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.05, travel: [2.1, 0, 0],
  events: [
    { t: 0.070, name: 'iframe-start' },
    { t: 0.080, name: 'footstep', foot: 'L' },
    { t: 0.270, name: 'iframe-end' },
    { t: 0.300, name: 'footstep', foot: 'R' },
    { t: 0.320, name: 'cancel-window-open' },
  ],
}));

def(clip('dodge_back', 0.52, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.090, pose: hop_back_crouch, ease: 'in' },
  { t: 0.240, pose: hop_back_air, ease: 'linear' },
  { t: 0.360, pose: hop_back_land, ease: 'out' },
  { t: 0.520, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.05, travel: [0, 0, 2.4],
  events: [
    { t: 0.085, name: 'iframe-start' },
    { t: 0.095, name: 'footstep', foot: 'R' },
    { t: 0.320, name: 'iframe-end' },
    { t: 0.365, name: 'footstep', foot: 'L' },
    { t: 0.390, name: 'cancel-window-open' },
  ],
}));

// ---------------------------------------------------------------- staggers

def(clip('stagger_l', 0.52, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.070, pose: stagger_l_1, ease: 'snap' },
  { t: 0.150, pose: stagger_l_1, ease: 'hold' },
  { t: 0.300, pose: stagger_l_2, ease: 'out' },
  { t: 0.520, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.04,
  events: [{ t: 0.18, name: 'footstep', foot: 'L' }, { t: 0.36, name: 'cancel-window-open' }],
}));

def(clip('stagger_r', 0.52, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.070, pose: stagger_r_1, ease: 'snap' },
  { t: 0.150, pose: stagger_r_1, ease: 'hold' },
  { t: 0.300, pose: stagger_r_2, ease: 'out' },
  { t: 0.520, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.04,
  events: [{ t: 0.18, name: 'footstep', foot: 'R' }, { t: 0.36, name: 'cancel-window-open' }],
}));

def(clip('stagger_back', 0.60, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.080, pose: stagger_b_1, ease: 'snap' },
  { t: 0.170, pose: stagger_b_1, ease: 'hold' },
  { t: 0.340, pose: stagger_b_2, ease: 'out' },
  { t: 0.600, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.04,
  events: [
    { t: 0.170, name: 'footstep', foot: 'R' },
    { t: 0.280, name: 'footstep', foot: 'L' },
    { t: 0.420, name: 'cancel-window-open' },
  ],
}));

def(clip('posture_break', 1.18, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.110, pose: posture_break_1, ease: 'snap' },
  { t: 0.300, pose: posture_break_2, ease: 'smooth' },
  { t: 0.560, pose: posture_break_1, ease: 'smooth' },
  { t: 0.820, pose: posture_break_2, ease: 'smooth' },
  { t: 1.180, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.05,
  events: [
    { t: 0.020, name: 'posture-break' },
    { t: 0.120, name: 'footstep', foot: 'R' },
    { t: 0.320, name: 'footstep', foot: 'L' },
    { t: 0.100, name: 'vulnerable-start' },
    { t: 1.000, name: 'vulnerable-end' },
  ],
}));

// ----------------------------------------------------------------- deaths
// Non-looping and never returning to idle: the last key is held forever, which is
// exactly what a ragdoll handoff wants if Physics decides to take over.

def(clip('death_forward', 1.70, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.130, pose: death_f_1, ease: 'snap' },
  { t: 0.420, pose: death_f_1, ease: 'smooth' },
  { t: 0.720, pose: death_f_2, ease: 'in' },
  { t: 1.150, pose: death_f_end, ease: 'in' },
  { t: 1.700, pose: death_f_end, ease: 'hold' },
], {
  layer: L_ACTION, fade: 0.05,
  events: [
    { t: 0.040, name: 'death-start' },
    { t: 0.740, name: 'body-impact' },
    { t: 1.180, name: 'body-impact' },
    { t: 1.300, name: 'ragdoll-handoff' },
  ],
}));

def(clip('death_back', 1.80, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.140, pose: death_b_1, ease: 'snap' },
  { t: 0.460, pose: death_b_1, ease: 'smooth' },
  { t: 0.800, pose: death_b_2, ease: 'in' },
  { t: 1.220, pose: death_b_end, ease: 'in' },
  { t: 1.800, pose: death_b_end, ease: 'hold' },
], {
  layer: L_ACTION, fade: 0.05,
  events: [
    { t: 0.040, name: 'death-start' },
    { t: 0.820, name: 'body-impact' },
    { t: 1.250, name: 'body-impact' },
    { t: 1.400, name: 'ragdoll-handoff' },
  ],
}));

def(clip('death_kneel', 2.10, [
  { t: 0.000, pose: idle_seigan, ease: 'in' },
  { t: 0.180, pose: death_k_1, ease: 'out' },
  { t: 0.620, pose: death_k_2, ease: 'in' },
  { t: 1.050, pose: death_k_2, ease: 'hold' },
  { t: 1.560, pose: death_k_end, ease: 'in' },
  { t: 2.100, pose: death_k_end, ease: 'hold' },
], {
  layer: L_ACTION, fade: 0.06,
  events: [
    { t: 0.040, name: 'death-start' },
    { t: 0.650, name: 'body-impact' },
    { t: 1.620, name: 'body-impact' },
    { t: 1.760, name: 'ragdoll-handoff' },
  ],
}));

// -------------------------------------------------------------- executions

def(clip('execution_attacker', 2.30, [
  { t: 0.000, pose: idle_seigan, ease: 'smooth' },
  { t: 0.420, pose: blend(idle_seigan, exec_a_raise, 0.70), ease: 'smooth' },
  { t: 0.760, pose: exec_a_raise, ease: 'out' },
  { t: 1.060, pose: exec_a_raise, ease: 'hold' },
  { t: 1.180, pose: exec_a_thrust, ease: 'in' },
  { t: 1.520, pose: exec_a_thrust, ease: 'hold' },
  { t: 1.880, pose: exec_a_pull, ease: 'smooth' },
  { t: 2.300, pose: idle_seigan, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.20,
  events: [
    { t: 0.020, name: 'execution-start' },
    { t: 0.800, name: 'footstep', foot: 'L' },
    { t: 1.120, name: 'swoosh' },
    { t: 1.150, name: 'hit-active-start' },
    { t: 1.230, name: 'hit-active-end' },
    { t: 1.900, name: 'swoosh' },
    { t: 2.150, name: 'cancel-window-open' },
  ],
}));

def(clip('execution_victim', 2.30, [
  { t: 0.000, pose: stagger_b_1, ease: 'smooth' },
  { t: 0.420, pose: exec_v_kneel, ease: 'out' },
  { t: 1.060, pose: exec_v_kneel, ease: 'hold' },
  { t: 1.180, pose: exec_v_impact, ease: 'snap' },
  { t: 1.520, pose: exec_v_impact, ease: 'hold' },
  { t: 1.900, pose: exec_v_fall, ease: 'in' },
  { t: 2.300, pose: exec_v_fall, ease: 'hold' },
], {
  layer: L_ACTION, fade: 0.14,
  events: [
    { t: 0.020, name: 'execution-start' },
    { t: 0.440, name: 'body-impact' },
    { t: 1.150, name: 'death-start' },
    { t: 1.940, name: 'body-impact' },
    { t: 2.120, name: 'ragdoll-handoff' },
  ],
}));

// ---------------------------------------------------------------- flourish

def(clip('taunt_sheathe_flourish', 2.45, [
  { t: 0.000, pose: idle_seigan, ease: 'smooth' },
  { t: 0.300, pose: chiburi_wind, ease: 'out' },
  { t: 0.420, pose: chiburi_wind, ease: 'hold' },
  { t: 0.480, pose: chiburi_flick, ease: 'snap' },
  { t: 0.560, pose: chiburi_flick, ease: 'hold' },
  { t: 0.900, pose: chiburi_hold, ease: 'smoother' },
  { t: 1.240, pose: chiburi_hold, ease: 'hold' },
  { t: 1.520, pose: sheathe_align, ease: 'smoother' },
  { t: 1.680, pose: sheathe_align, ease: 'hold' },
  { t: 1.980, pose: sheathe_slide, ease: 'in' },
  { t: 2.100, pose: sheathe_slide, ease: 'hold' },
  { t: 2.280, pose: noto_bow, ease: 'smoother' },
  { t: 2.450, pose: idle_sheathed, ease: 'smoother' },
], {
  layer: L_ACTION, fade: 0.22,
  events: [
    { t: 0.300, name: 'swoosh' },
    { t: 0.470, name: 'chiburi' },
    { t: 0.500, name: 'blood-flick' },
    { t: 1.540, name: 'swoosh' },
    { t: 2.090, name: 'sheathe-click' },
    { t: 2.320, name: 'cancel-window-open' },
  ],
}));

// ===========================================================================
// PUBLIC API
// ===========================================================================

Object.freeze(CLIPS);

export const CLIP_NAMES = Object.freeze(Object.keys(CLIPS));

/** clipName → frozen array of `{t, name, foot?}` event markers. Combat.js drives off this. */
export const CLIP_EVENTS = Object.freeze(
  CLIP_NAMES.reduce((acc, n) => { acc[n] = CLIPS[n].events; return acc; }, {})
);

/** Every distinct event name the library can emit — useful for wiring assertions. */
export const EVENT_NAMES = Object.freeze([
  'hit-active-start', 'hit-active-end', 'footstep', 'swoosh', 'cancel-window-open',
  'parry-window-open', 'parry-window-close', 'guard-up', 'clash', 'heavy-charge',
  'iframe-start', 'iframe-end', 'posture-break', 'vulnerable-start', 'vulnerable-end',
  'death-start', 'body-impact', 'ragdoll-handoff', 'execution-start',
  'chiburi', 'blood-flick', 'sheathe-click',
]);

export function getClip(name) {
  return CLIPS[name] || null;
}

export function getPose(name) {
  return POSES[name] || null;
}

export function hasClip(name) {
  return Object.prototype.hasOwnProperty.call(CLIPS, name);
}

/**
 * Ordered speed axis of the locomotion blend space. Rig.js picks the bracketing
 * pair from this and cross-fades; adding a gait means adding it here, in order.
 */
export const LOCOMOTION_FORWARD = Object.freeze([
  { clip: 'idle_drawn_seigan', speed: 0.0, stride: 1.0 },
  { clip: 'walk', speed: 1.9, stride: 1.34 },
  { clip: 'run', speed: 5.4, stride: 2.05 },
  { clip: 'sprint', speed: 7.2, stride: 2.48 },
]);

export const LOCOMOTION_BACK = Object.freeze({ clip: 'walk_back', speed: 1.7, stride: 1.05 });
export const LOCOMOTION_STRAFE = Object.freeze({ left: 'strafe_l', right: 'strafe_r', speed: 2.4, stride: 1.15 });

/** The sheathed variants of the blend space, used before the sword is drawn. */
export const LOCOMOTION_SHEATHED_IDLE = 'idle_sheathed';

export { CLIPS };
export default CLIPS;
