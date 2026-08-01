/**
 * interaction-scenarios.mjs — the scripted play the interaction rig runs.
 *
 * Every scenario is plain data: a frame count, a probe list, and an input timeline of
 * atomic verbs the page-side runtime knows how to dispatch. That is deliberate. A
 * closure would have to be re-authored to be re-run, and the exact stimulus that
 * produced a number is the first thing a disagreement about that number needs. The
 * timeline is serialised into the trace alongside the measurements.
 *
 * Frames are simulation frames at the authored timestep (1/60 s), not wall clock — see
 * the clock note in tools/harness/runtime.js.
 *
 * Each scenario names the REFERENCE_BENCHMARKS criteria it feeds. If a criterion is not
 * in some scenario's `criteria` list, this rig cannot speak to it, and
 * tools/interaction-metrics.mjs will not invent a verdict for it.
 */

const F = 60;                       // frames per simulated second
const DEADZONE = 0.14;              // Input.js DEADZONE — must track it, not guess it

/**
 * Why the combat scenarios are short, in one place.
 *
 * Measured, not assumed: with no enemies the harness simulates ~650-850 frames per second
 * of wall clock; with three enemies engaged it manages roughly 1.2. The cost is pure JS in
 * the physics narrow phase (see the BM-PERF-05 result in the report), so a twenty-encounter
 * run at twenty seconds each — what BM-COMBAT-02 asks for — is about six hours of wall
 * clock in this container.
 *
 * The honest response is to run what is affordable and let the metric return
 * `inconclusive` for the criterion whose sample size is not met, rather than quietly
 * redefining twenty encounters as four. Raise these once the physics cost is fixed.
 */
const COMBAT = {
  lockOnSeconds: 10,
  startupSeconds: 15,
  bellSeconds: 8,
  swings: 12,
  encounters: 4,
  encounterSeconds: 12,
};

/**
 * Stick offset in px that produces a given `state.moveMag`.
 *
 * Input.js maps |offset|/radius through the deadzone: mag = (m - 0.14) / 0.86. The
 * speed scenario needs the *authored* blend points (Player.js: 0.55 → walk, 0.92 → run,
 * 1.0 + run flag → sprint), so this inverts the mapping rather than eyeballing a
 * fraction of the radius.
 */
export function stickOffset(moveMag, radius) {
  const m = Math.min(1, DEADZONE + moveMag * (1 - DEADZONE));
  return m * radius;
}

/** Push the stick to `moveMag` at `angle` radians (0 = forward/up the screen). */
function stickTo(out, f, layout, moveMag, angle = 0, id = 80) {
  const r = stickOffset(moveMag, layout.stickRadius);
  out.push({
    f, do: 'touchMove', id,
    x: layout.stickOrigin.x + Math.sin(angle) * r,
    y: layout.stickOrigin.y - Math.cos(angle) * r,
  });
}

function stickDown(out, f, layout, id = 80) {
  out.push({ f, do: 'touchDown', id, x: layout.stickOrigin.x, y: layout.stickOrigin.y });
}

function stickUp(out, f, layout, id = 80) {
  out.push({ f, do: 'touchUp', id, x: layout.stickOrigin.x, y: layout.stickOrigin.y });
}

function mark(out, f, label) { out.push({ f, do: 'mark', label }); }

/**
 * The open gravel arena, and a heading with a clear run across it.
 *
 * The first run of this rig measured the authored walk speed as 0.001 m/s and would have
 * filed it as a controller defect. The player boots at (0, 8) — inside the haiden's
 * footprint — and the scenario walked it into an interior wall at z = 4.59 after 3.4 m,
 * while `Player.speed` went on reporting a perfectly correct 1.9. The controller was
 * right and the run-up was wrong.
 *
 * So locomotion is measured where the game's own encounters happen: LAYOUT.arena, 26 × 20
 * of flat gravel centred on (0, 26). Starting at the west edge on a due-east heading gives
 * ~24 m of clear ground, and every such scenario records its measured clearance in the
 * trace so a short run can never again be mistaken for a slow one.
 */
const ARENA = { x: 0, z: 26, halfX: 13, halfZ: 10 };
const EAST = Math.PI / 2;               // +X in the game's yaw convention (0 = -Z)

function toArena(out, f, { x = -11, z = ARENA.z, yaw = EAST, label = 'run-up' } = {}) {
  out.push({ f, do: 'teleport', x, z, yaw });
  out.push({ f: f + 1, do: 'clearance', yaw, label });
}

/**
 * A camera drag: pointer down, `frames` interpolated moves, pointer up.
 *
 * Duration is expressed in frames because Input.js classifies a gesture by elapsed
 * `performance.now`, which the harness ties to the simulation clock. A 30-frame drag is
 * seen by the game as 500 ms on any machine, so the SWIPE_MAX_TIME boundary is under the
 * scenario's control instead of the rasteriser's.
 */
function drag(out, f0, id, x0, y0, x1, y1, frames) {
  out.push({ f: f0, do: 'touchDown', id, x: x0, y: y0 });
  for (let i = 1; i <= frames; i++) {
    const t = i / frames;
    out.push({ f: f0 + i, do: 'touchMove', id, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  out.push({ f: f0 + frames + 1, do: 'touchUp', id, x: x1, y: y1 });
  return f0 + frames + 2;
}

// ============================================================================ plans

/** E02 — the authored speed set is what the controller actually produces. */
function moveSpeeds(layout) {
  const a = [];
  // 2.5 s per speed: a sprint covers 18 m of the arena's 24 m clear run, and the metric
  // only reads the settled tail. Each speed gets a fresh run-up from the west edge rather
  // than continuing from wherever the previous one ended.
  const seg = Math.round(2.5 * F);
  let f = 30;
  for (const [name, mag] of [['walk', 0.55], ['run', 0.92], ['sprint', 1.0]]) {
    toArena(a, f, { label: `speed:${name}` });
    stickDown(a, f + 4, layout);
    stickTo(a, f + 6, layout, mag, 0);
    // The measurement window is marked explicitly rather than inferred as "the tail of
    // the segment". The first version inferred it, and the window swallowed the release
    // ramp and the next segment's teleport: a 1.9 m/s walk measured 5.8 m/s from
    // position while the controller reported 1.81, and it was filed as a controller
    // fault. The window now starts a second after the stick and ends before the release.
    mark(a, f + 6 + F, `speed:${name}`);
    mark(a, f + seg - 14, `speed-end:${name}`);
    f += seg;
    stickUp(a, f - 10, layout);
  }
  return {
    id: 'move-speeds',
    criteria: ['BM-MOVE-01'],
    frames: f + F,
    render: false,
    probes: ['player', 'input'],
    setup: ['skipIntro', 'freeCamera'],
    actions: a,
  };
}

/** E02 — a 180° stick reversal must turn the character, and never eat the input. */
function moveReversal(layout) {
  const a = [];
  let f = 30;
  toArena(a, f, { x: -6, label: 'reversal-run-up' });
  f += 6;
  stickDown(a, f, layout);
  stickTo(a, f + 1, layout, 1.0, 0);
  f += 2 * F;
  for (let i = 0; i < 4; i++) {
    mark(a, f, `reversal:${i}`);
    stickTo(a, f, layout, 1.0, Math.PI);
    f += Math.round(1.6 * F);
    mark(a, f, `reversal-back:${i}`);
    stickTo(a, f, layout, 1.0, 0);
    f += Math.round(1.6 * F);
  }
  stickUp(a, f, layout);
  return {
    id: 'move-reversal',
    criteria: ['BM-MOVE-03'],
    frames: f + F,
    render: false,
    probes: ['player', 'input'],
    setup: ['skipIntro', 'freeCamera'],
    actions: a,
  };
}

/** E02 — planted feet must not slide, at every speed and on a slope. */
function footPlant(layout) {
  const a = [];
  const seg = Math.round(2.5 * F);
  let f = 30;
  for (const [name, mag] of [['walk', 0.55], ['run', 0.92], ['sprint', 1.0]]) {
    toArena(a, f, { label: `foot:${name}` });
    stickDown(a, f + 4, layout);
    stickTo(a, f + 6, layout, mag, 0);
    mark(a, f + 6 + F, `foot:${name}`);
    mark(a, f + seg - 14, `foot-end:${name}`);
    f += seg;
    stickUp(a, f - 10, layout);
  }
  return {
    id: 'foot-plant',
    criteria: ['BM-MOVE-02'],
    frames: f + F,
    render: false,
    probes: ['player', 'feet', 'input'],
    setup: ['skipIntro', 'freeCamera'],
    actions: a,
  };
}

/** E03 — a traversal of the playable region; the eye must never enter geometry. */
function cameraTraverse(layout) {
  const a = [];
  let f = 30;
  toArena(a, f, { x: 0, label: 'traverse-start' });
  f += 6;
  stickDown(a, f, layout);
  // A circuit of the plateau: down the processional axis, round the buildings, back.
  // Each leg is a heading held at run speed, with a camera drag laid over it so the
  // boom is being re-solved against different geometry while the body moves.
  const legs = [0, 0.5, 1.4, 2.6, 3.0, 3.9, 4.7, 5.6, 0.2, 1.0];
  for (let i = 0; i < legs.length; i++) {
    mark(a, f, `leg:${i}`);
    stickTo(a, f, layout, 0.92, legs[i]);
    drag(a, f + 10, 70 + (i % 3), layout.gestureCentre.x, layout.gestureCentre.y,
      layout.gestureCentre.x + (i % 2 ? 150 : -150), layout.gestureCentre.y + 30, 40);
    f += 3 * F;
  }
  stickUp(a, f, layout);
  return {
    id: 'camera-traverse',
    criteria: ['BM-CAMERA-02'],
    frames: f + F,
    render: false,
    probes: ['player', 'camera'],
    setup: ['skipIntro', 'freeCamera'],
    actions: a,
  };
}

/**
 * E03 — lock-on framing, and the shake ablation.
 *
 * Run twice with identical input: once with the camera's shake authority at its normal
 * value and once at zero. Shake does not feed gameplay, so the two runs stay in
 * lockstep and the per-frame difference in the target's on-screen position *is* the
 * shake contribution. Measuring the shake directly out of the frame is the only way to
 * answer BM-CAMERA-04 without confusing shake with the camera doing its job.
 */
function lockOn(layout, { shake = 1, id = 'lockon-framing' } = {}) {
  const a = [];
  let f = 20;
  a.push({ f: 1, do: 'set', target: 'playerCamera', prop: 'shakeScale', value: shake });
  // In the arena, not wherever the player happens to boot. The first run of this scenario
  // fought inside the haiden: `PlayerCamera._score` rejects an occluded candidate, so every
  // target scored as unreachable and lock-on never engaged for a single frame of 840.
  toArena(a, 2, { x: -2, label: 'lockon-arena' });
  a.push({ f: 6, do: 'call', target: 'enemies', method: 'spawnWave', args: [3, { seed: 0x51ed, alerted: true }] });
  // Lock-on is a toggle that releases when the pick is unchanged, so it is pressed once
  // and then only re-pressed if nothing is held — see the re-arm presses below.
  a.push({ f: 20, do: 'keyDown', code: 'KeyQ' });
  a.push({ f: 21, do: 'keyUp', code: 'KeyQ' });
  mark(a, 22, 'lock-on');
  a.push({ f: 30, do: 'bot', on: true, policy: 'aggressive' });
  // Re-arm the lock every two seconds: a target dying releases it, and the criterion is
  // about how the camera frames a held lock rather than about how long one target lives.
  for (let t = 2; t < COMBAT.lockOnSeconds; t += 2) {
    a.push({ f: t * F, do: 'keyDown', code: 'KeyQ' });
    a.push({ f: t * F + 1, do: 'keyUp', code: 'KeyQ' });
  }
  f = COMBAT.lockOnSeconds * F;
  // Back into a corner: the anti-reference case AR-01 names explicitly.
  mark(a, f, 'corner');
  stickDown(a, f, layout);
  stickTo(a, f + 1, layout, 0.92, Math.PI);
  f += 3 * F;
  stickUp(a, f, layout);
  return {
    id,
    criteria: shake ? ['BM-CAMERA-01', 'BM-CAMERA-04'] : ['BM-CAMERA-04'],
    frames: f + F,
    render: false,
    probes: ['player', 'camera', 'ndc', 'enemies'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/**
 * E01 + E14 — twenty scripted encounters back to back.
 *
 * BM-COMBAT-02 asks for ≥ 20 encounters and counts how enemies die; BM-AI-03 asks how
 * many enemies hold an attack token at once. Both come out of the same run, so it is
 * run once. The player is the scripted policy in tools/harness/runtime.js, and every
 * number taken from this scenario carries that policy as a stated condition — it is not
 * a human, and no result here may be reported as a play test.
 */
function encounters(layout, { count = COMBAT.encounters, seconds = COMBAT.encounterSeconds } = {}) {
  const a = [];
  const span = seconds * F;
  toArena(a, 2, { x: 0, label: 'encounters-arena' });
  a.push({ f: 5, do: 'bot', on: true, policy: 'aggressive' });
  for (let i = 0; i < count; i++) {
    const f = 10 + i * span;
    a.push({ f, do: 'call', target: 'enemies', method: 'despawnAll', args: [] });
    // Health and posture are restored between encounters so a run of twenty is twenty
    // encounters rather than one encounter and nineteen corpses. The intervention is in
    // the timeline, so it cannot be mistaken for the game doing it.
    a.push({ f: f + 1, do: 'set', target: 'player', prop: 'health', value: 100 });
    a.push({ f: f + 1, do: 'set', target: 'player', prop: 'posture', value: 0 });
    a.push({ f: f + 1, do: 'set', target: 'player', prop: 'stamina', value: 100 });
    mark(a, f + 2, `encounter:${i}`);
    a.push({
      f: f + 3, do: 'call', target: 'enemies', method: 'spawnWave',
      args: [3, { seed: (0x51ed + i * 7919) >>> 0, alerted: true }],
    });
  }
  return {
    id: 'encounters',
    criteria: ['BM-COMBAT-02', 'BM-AI-03'],
    frames: 10 + count * span + F,
    render: false,
    stride: 3,
    probes: ['player', 'tokens'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/**
 * E10 — 120 camera drags that a player means as camera drags.
 *
 * "Misfire" has to be defined against intent, and a fast flick is a slash *by design*
 * (ARCHITECTURE.md §6). So every drag here is authored outside the flick envelope —
 * 30-70 frames, i.e. 500-1160 ms against Input.js's 420 ms SWIPE_MAX_TIME — and outside
 * the tap envelope. Any slash or button press these produce is unambiguously unintended.
 */
function touchDrags(layout) {
  const a = [];
  let f = 30;
  const gx = layout.gestureCentre.x, gy = layout.gestureCentre.y;
  const count = 120;
  for (let i = 0; i < count; i++) {
    const ang = (i * 2.39996);                       // golden-angle spread over directions
    const len = 40 + (i % 7) * 38;                   // 40-268 px
    const frames = 30 + (i % 5) * 10;                // 500-1160 ms
    const jitterX = ((i * 37) % 11 - 5) * 6;
    const jitterY = ((i * 53) % 9 - 4) * 5;
    mark(a, f, `drag:${i}`);
    f = drag(a, f + 1, 60 + (i % 4),
      gx + jitterX, gy + jitterY,
      gx + jitterX + Math.cos(ang) * len, gy + jitterY + Math.sin(ang) * len,
      frames);
    f += 4;
  }
  return {
    id: 'touch-drags',
    criteria: ['BM-TOUCH-03'],
    frames: f + F,
    render: false,
    probes: ['input', 'player'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/** E10 — a tap must be consumed by game state in the frame it arrives. */
function touchLatency(layout) {
  const a = [];
  let f = 60;
  const gx = layout.gestureCentre.x, gy = layout.gestureCentre.y;
  for (let i = 0; i < 60; i++) {
    mark(a, f, `tap:${i}`);
    a.push({ f, do: 'touchDown', id: 50, x: gx, y: gy });
    a.push({ f: f + 1, do: 'touchUp', id: 50, x: gx, y: gy });
    f += 40;
  }
  return {
    id: 'touch-latency',
    criteria: ['BM-TOUCH-04'],
    frames: f + F,
    render: false,
    probes: ['input', 'player'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/**
 * E12 — enemy attack startup, measured from first visible motion.
 *
 * The player stands still and does not defend, so the AI is free to commit; the probe
 * samples every enemy's weapon-hand displacement per frame, and the metric finds the
 * first frame of real motion before each landed or whiffed swing.
 */
function animStartup() {
  const a = [];
  toArena(a, 2, { x: 0, label: 'startup-arena' });
  a.push({ f: 6, do: 'call', target: 'enemies', method: 'spawnWave', args: [3, { seed: 0x2f19, alerted: true }] });
  mark(a, 7, 'startup-observe');
  return {
    id: 'anim-startup',
    criteria: ['BM-ANIM-01'],
    frames: COMBAT.startupSeconds * F,
    render: false,
    probes: ['player', 'emotion', 'enemies'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/** E12 — the damaging window must coincide with the visible blade sweep. */
function bladeWindow(layout) {
  const a = [];
  let f = 30;
  toArena(a, 2, { x: 0, label: 'blade-arena' });
  a.push({ f: 6, do: 'call', target: 'enemies', method: 'spawnWave', args: [1, { seed: 0x77aa, alerted: true }] });
  const gx = layout.gestureCentre.x, gy = layout.gestureCentre.y;
  for (let i = 0; i < COMBAT.swings; i++) {
    mark(a, f, `swing:${i}`);
    // A flick, inside the slash envelope this time: 6 frames is 100 ms.
    f = drag(a, f, 40, gx, gy, gx + (i % 2 ? 160 : -160), gy + (i % 3 ? 80 : -80), 6);
    f += 50;
  }
  return {
    id: 'blade-window',
    criteria: ['BM-ANIM-02'],
    frames: f + F,
    render: false,
    probes: ['player', 'blade'],
    setup: ['skipIntro'],
    actions: a,
  };
}

/**
 * E06 — control is never removed for more than a beat.
 *
 * The only scenario that must NOT skip the intro: the title beat is exactly the thing
 * being measured, and it must be measured from a fresh boot before anything cancels it.
 *
 * It does not press pause. `Menus.togglePause` is a no-op while the title is up, and if
 * it were not, the pause it opened would be a control-removing state the *scenario*
 * caused — which the metric would then read as a defect in the game. Instead the stick
 * goes down during the title beat: whether the world responds while the ink is on screen
 * is the direct evidence for whether the beat is interactive at all.
 */
function controlContinuity(layout) {
  const a = [];
  mark(a, 2, 'intro-start');
  stickDown(a, 40, layout);
  stickTo(a, 42, layout, 0.92, 0);
  mark(a, 44, 'stick-during-title');
  stickUp(a, 14 * F, layout);
  return {
    id: 'control-continuity',
    criteria: ['BM-STORY-03'],
    frames: 24 * F,
    render: false,
    probes: ['control', 'player', 'input'],
    setup: [],
    actions: a,
  };
}

/**
 * E08 — the bell must not be rung by accident during combat movement.
 *
 * The player is teleported to the bell tower and then driven with the input a fight
 * produces — stick pressure in every direction, taps, flicks, guard — while the trace
 * watches for the bell's authored response. It also presses the mapped interact key
 * deliberately, so a null result separates "cannot be rung by accident" from "cannot be
 * rung at all".
 */
function bellAccident(layout) {
  const a = [];
  // The bell's world position is resolved in-page from Level's own record of where it
  // built the tower, so this cannot drift from the layout table.
  a.push({ f: 2, do: 'teleport', to: 'bell', dx: 2.0, dz: 2.0 });
  a.push({ f: 6, do: 'call', target: 'enemies', method: 'spawnWave', args: [2, { seed: 0x9931, alerted: true }] });
  a.push({ f: 10, do: 'bot', on: true, policy: 'aggressive' });
  let f = COMBAT.bellSeconds * F;
  a.push({ f, do: 'bot', on: false });
  mark(a, f + 1, 'deliberate-interact');
  const gx = layout.gestureCentre.x, gy = layout.gestureCentre.y;
  for (let i = 0; i < 6; i++) {
    a.push({ f: f + 10 + i * 30, do: 'keyDown', code: 'KeyF' });
    a.push({ f: f + 11 + i * 30, do: 'keyUp', code: 'KeyF' });
    a.push({ f: f + 20 + i * 30, do: 'touchDown', id: 55, x: gx, y: gy });
    a.push({ f: f + 21 + i * 30, do: 'touchUp', id: 55, x: gx, y: gy });
  }
  return {
    id: 'bell-accident',
    criteria: ['BM-CHOICE-02'],
    frames: f + 6 * 30 + F,
    render: false,
    probes: ['player'],
    setup: ['skipIntro'],
    actions: a,
  };
}

export function buildPlans(layout, opts = {}) {
  const plans = [
    moveSpeeds(layout),
    moveReversal(layout),
    footPlant(layout),
    cameraTraverse(layout),
    lockOn(layout, { shake: 1, id: 'lockon-framing' }),
    lockOn(layout, { shake: 0, id: 'lockon-noshake' }),
    touchDrags(layout),
    touchLatency(layout),
    animStartup(),
    bladeWindow(layout),
    controlContinuity(layout),
    bellAccident(layout),
    encounters(layout, {
      count: opts.encounters ?? COMBAT.encounters,
      seconds: opts.encounterSeconds ?? COMBAT.encounterSeconds,
    }),
  ];
  return plans;
}

export const PLAN_IDS = [
  'move-speeds', 'move-reversal', 'foot-plant', 'camera-traverse',
  'lockon-framing', 'lockon-noshake', 'touch-drags', 'touch-latency',
  'anim-startup', 'blade-window', 'control-continuity', 'bell-accident', 'encounters',
];
