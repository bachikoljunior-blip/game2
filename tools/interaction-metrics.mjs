/**
 * interaction-metrics.mjs — turn interaction traces into criterion verdicts.
 *
 * Kept out of the page and out of the driver on purpose. The rig records; this file
 * judges; and because it is a pure function of a written trace, a disputed verdict can
 * be re-derived from the same JSON without re-running a two-hour capture. Every metric
 * reports the number it measured and how it got it, so "it feels responsive" can never
 * be what lands in a record (CLAUDE.md, *Measure. Do not assert.*).
 *
 * Verdicts are `pass`, `fail`, or `inconclusive`. `inconclusive` is a first-class
 * result: a probe that returned nothing is an apparatus fault, and reporting it as a
 * failure of the game would be a wrong critique — this project has already paid for
 * that mistake five separate times (CLAUDE.md, *Check the apparatus before trusting it*).
 */

const DT = 1 / 60;

// ---------------------------------------------------------------- small helpers

const col = (trace, name) => trace?.columns?.[name] || [];
const marks = (trace, prefix) =>
  (trace?.events || []).filter((e) => e.name === 'mark' && String(e.label || '').startsWith(prefix));
const eventsNamed = (trace, name) => (trace?.events || []).filter((e) => e.name === name);

/** Map an event's frame index onto the sampled-column index that frame produced. */
function sampleIndexOf(trace, frame) {
  const stride = trace?.stride || 1;
  return Math.floor(frame / stride);
}

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function max(a) { return a.length ? a.reduce((m, v) => (v > m ? v : m), -Infinity) : null; }
function percentile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
function round(v, d = 4) { return v == null || !Number.isFinite(v) ? null : +v.toFixed(d); }

function result(criterion, element, scenario, verdict, measured, threshold, detail, method = 'interaction-capture') {
  return { criterion, element, scenario, method, verdict, measured, threshold, detail };
}

// ------------------------------------------------------------------- E02 movement

/**
 * BM-MOVE-01 — the authored speed set.
 *
 * `Player.speed` is the controller's own belief about how fast it is going, and this
 * project has been burned by trusting a system's self-report (a telemetry line read
 * `intensity 3.41` while the light contributed nothing). So the primary number here is
 * differentiated world position; `Player.speed` is reported beside it, and a
 * disagreement between them is itself a finding.
 */
export function moveSpeeds(trace) {
  if (!trace) return [result('BM-MOVE-01', 'E02-MOVEMENT', 'move-speeds', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const px = col(trace, 'px'), pz = col(trace, 'pz'), sp = col(trace, 'pspeed');
  const targets = { walk: 1.9, run: 5.4, sprint: 7.2 };
  // The window is whatever the scenario marked, not a fraction of a segment inferred
  // here: an inferred window swallowed a teleport and turned a correct 1.9 m/s walk into
  // a 5.8 m/s reading.
  const segs = marks(trace, 'speed:');
  const ends = marks(trace, 'speed-end:');
  const rows = {};
  for (let i = 0; i < segs.length; i++) {
    const name = segs[i].label.split(':')[1];
    const end = ends.find((e) => e.label.split(':')[1] === name);
    if (!end) continue;
    const a = sampleIndexOf(trace, segs[i].f), b = sampleIndexOf(trace, end.f);
    const disp = [], self = [];
    for (let j = a; j < b; j++) {
      if (px[j] == null || px[j + 1] == null) continue;
      disp.push(Math.hypot(px[j + 1] - px[j], pz[j + 1] - pz[j]) / DT);
      if (sp[j] != null) self.push(sp[j]);
    }
    rows[name] = {
      target: targets[name] ?? null,
      measuredFromPosition: round(mean(disp), 3),
      controllerSelfReport: round(mean(self), 3),
      samples: disp.length,
    };
  }
  const bad = Object.entries(rows).filter(([, r]) =>
    r.target == null || r.measuredFromPosition == null ||
    Math.abs(r.measuredFromPosition - r.target) / r.target > 0.05);
  const anyData = Object.values(rows).some((r) => r.samples > 4);

  // A character pinned against a wall reports its authored speed perfectly while going
  // nowhere, and the first run of this rig nearly filed that as a controller defect. If
  // the controller insists it is moving and the world position disagrees, the run-up was
  // obstructed and the correct verdict is that the measurement did not happen.
  const clearance = eventsNamed(trace, 'clearance');
  const obstructed = Object.entries(rows).filter(([, r]) =>
    r.controllerSelfReport > 0.2 && (r.measuredFromPosition ?? 0) < r.controllerSelfReport * 0.5);
  if (obstructed.length) {
    return [result('BM-MOVE-01', 'E02-MOVEMENT', 'move-speeds', 'inconclusive',
      { rows, clearance: clearance.map((c) => ({ label: c.label, metres: c.metres, blocked: c.blocked })) },
      'within ±5% of 1.9 / 5.4 / 7.2 m/s',
      `the run was obstructed for ${obstructed.map(([n]) => n).join(', ')}: the controller reported its authored speed while world position barely changed. Apparatus fault, not a controller result.`,
      'instrumented-runtime')];
  }

  return [result('BM-MOVE-01', 'E02-MOVEMENT', 'move-speeds',
    !anyData ? 'inconclusive' : bad.length === 0 ? 'pass' : 'fail',
    { rows, clearance: clearance.map((c) => ({ label: c.label, metres: c.metres, blocked: c.blocked })) },
    'within ±5% of 1.9 / 5.4 / 7.2 m/s',
    bad.length ? `outside ±5%: ${bad.map(([n]) => n).join(', ')}` : 'all three speeds inside ±5%',
    'instrumented-runtime')];
}

/**
 * BM-MOVE-03 — a 180° reversal turns within 250 ms and never eats the input.
 *
 * "Input ignored" is measured as a window in which neither the heading nor the speed
 * moved at all after the stick reversed — the observable a player calls lag.
 */
export function moveReversal(trace) {
  if (!trace) return [result('BM-MOVE-03', 'E02-MOVEMENT', 'move-reversal', 'inconclusive', null, null, 'scenario did not run')];
  const yaw = col(trace, 'pyaw'), sp = col(trace, 'pspeed');
  const turns = [];
  const deadWindows = [];
  for (const m of marks(trace, 'reversal')) {
    const i0 = sampleIndexOf(trace, m.f);
    if (yaw[i0] == null) continue;
    const start = yaw[i0];
    // "Input ignored" is the latency before the character responds *at all* — the frames
    // between the stick reversing and the first movement in heading or speed. It is not
    // "frames in which nothing changed": once the turn is done the character runs at a
    // constant heading and a constant speed, and counting that as ignored input reported
    // a 950 ms dead window on every reversal in a run where each turn took 283 ms.
    let turnedAt = null, dead = 0;
    for (let j = i0 + 1; j < Math.min(yaw.length, i0 + 90); j++) {
      const d = Math.abs(Math.atan2(Math.sin(yaw[j] - start), Math.cos(yaw[j] - start)));
      if (turnedAt == null && d >= Math.PI * 0.9) turnedAt = (j - i0) * DT;
      if (dead === 0) {
        const moved = Math.abs(yaw[j] - yaw[j - 1]) > 1e-4 || Math.abs((sp[j] ?? 0) - (sp[j - 1] ?? 0)) > 1e-4;
        if (moved) dead = j - 1 - i0;
      }
    }
    turns.push({ label: m.label, turnMs: turnedAt == null ? null : Math.round(turnedAt * 1000), responseLatencyMs: Math.round(dead * DT * 1000) });
    deadWindows.push(dead * DT * 1000);
  }
  const times = turns.map((t) => t.turnMs).filter((v) => v != null);
  const slowest = times.length ? Math.max(...times) : null;
  const worstDead = deadWindows.length ? Math.max(...deadWindows) : null;
  const ok = times.length === turns.length && turns.length > 0 && slowest <= 250 && worstDead <= 100;
  return [result('BM-MOVE-03', 'E02-MOVEMENT', 'move-reversal',
    turns.length === 0 ? 'inconclusive' : ok ? 'pass' : 'fail',
    { reversals: turns, slowestTurnMs: slowest, worstResponseLatencyMs: round(worstDead, 1) },
    '180° heading change ≤ 250 ms; no input-ignored window > 100 ms',
    times.length < turns.length ? `${turns.length - times.length} reversals never reached 180°` : 'all reversals completed')];
}

/** BM-MOVE-02 — planted-foot drift. */
export function footPlant(trace) {
  if (!trace) return [result('BM-MOVE-02', 'E02-MOVEMENT', 'foot-plant', 'inconclusive', null, null, 'scenario did not run')];
  const feet = col(trace, 'feet');
  const present = feet.filter((f) => f != null);
  if (present.length < 20) {
    return [result('BM-MOVE-02', 'E02-MOVEMENT', 'foot-plant', 'inconclusive',
      { framesWithFootData: present.length },
      'planted-foot drift ≤ 2 cm/frame',
      'the rig could not read foot bones — probe fault, not a game result')];
  }
  // "Planted" is calibrated from the data rather than assumed to be a clearance near
  // zero. The probe reports the foot *bone* height minus the height the downward ray
  // found, and those two are separated by a constant offset — measured at about -0.43 m
  // here, because the bone origin is not the sole and the ray does not stop at the same
  // surface. A fixed 6 cm threshold therefore produced zero contact samples across a
  // whole walk/run/sprint run. Taking each foot's own low point as the floor makes the
  // definition offset-independent, which is what "the foot is down" actually means.
  const drift = [];
  // Only inside the marked windows, so the teleport frame between segments cannot enter
  // the drift population as a one-frame 11 m "slide".
  const starts = marks(trace, 'foot:'), ends = marks(trace, 'foot-end:');
  const windows = starts.map((sm) => {
    const name = sm.label.split(':')[1];
    const e = ends.find((x) => x.label.split(':')[1] === name);
    return e ? [sampleIndexOf(trace, sm.f), sampleIndexOf(trace, e.f)] : null;
  }).filter(Boolean);
  const inWindow = (i) => windows.length === 0 || windows.some(([a, b]) => i >= a && i <= b);
  const rows = [];
  for (let i = 0; i < feet.length; i++) {
    const f = feet[i];
    if (!f || !inWindow(i)) continue;
    rows.push(f);
  }
  const lows = [percentile(rows.map((f) => f[0]).filter((v) => v != null), 0.05),
    percentile(rows.map((f) => f[2]).filter((v) => v != null), 0.05)];
  // Two conditions, not one. Height alone counts the frames where a swinging foot passes
  // low through the stride, which inflates the contact population with exactly the frames
  // that are *supposed* to travel: a height-only band called 79% of foot-frames planted
  // during a run, when at most one foot is down at a time. A planted foot is also
  // vertically still, so the second condition is that its clearance is not changing.
  const BAND = 0.02;                 // m above each foot's own low point
  const STILL = 0.004;               // m of vertical change per frame
  for (let i = 1; i < rows.length; i++) {
    const f = rows[i], prev = rows[i - 1];
    if (f[0] != null && lows[0] != null && f[0] <= lows[0] + BAND
      && prev[0] != null && Math.abs(f[0] - prev[0]) < STILL) drift.push(f[1] * 100);
    if (f[2] != null && lows[1] != null && f[2] <= lows[1] + BAND
      && prev[2] != null && Math.abs(f[2] - prev[2]) < STILL) drift.push(f[3] * 100);
  }
  const worst = max(drift), p95 = percentile(drift, 0.95);
  return [result('BM-MOVE-02', 'E02-MOVEMENT', 'foot-plant',
    drift.length < 10 ? 'inconclusive' : (p95 <= 2 ? 'pass' : 'fail'),
    {
      contactSamples: drift.length, p95DriftCm: round(p95, 3), worstDriftCm: round(worst, 3),
      contactFloorMetres: lows.map((v) => round(v, 4)), bandMetres: BAND, verticalStillnessMetres: STILL,
      windows: windows.length, sampledFrames: rows.length,
    },
    'planted-foot world drift ≤ 2 cm per frame',
    `${drift.length} contact samples across walk/run/sprint`)];
}

// --------------------------------------------------------------------- E03 camera

/** BM-CAMERA-02 — the eye never enters geometry, and never teleports. */
export function cameraTraverse(trace) {
  if (!trace) return [result('BM-CAMERA-02', 'E03-CAMERA', 'camera-traverse', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const inside = col(trace, 'cinside'), jump = col(trace, 'cjump');
  const insideFrames = inside.filter((v) => v === 1).length;
  // A scripted teleport is a discontinuity the harness created, not a pull-in the camera
  // made; the first run reported its 18 m run-up jump as a camera defect. Excluded by the
  // teleport events the runtime records, plus the first samples where there is no
  // predecessor and the camera is still snapping.
  const skip = new Set();
  for (const t of eventsNamed(trace, 'teleport')) {
    const i = sampleIndexOf(trace, t.f);
    for (let j = i - 1; j <= i + 4; j++) skip.add(j);
  }
  for (let j = 0; j < 3; j++) skip.add(j);
  const jumps = jump.map((v, i) => (skip.has(i) ? null : v)).filter((v) => v != null);
  const worst = max(jumps);
  return [result('BM-CAMERA-02', 'E03-CAMERA', 'camera-traverse',
    inside.length < 50 ? 'inconclusive' : (insideFrames === 0 && worst <= 1.5 ? 'pass' : 'fail'),
    { frames: inside.length, framesInsideGeometry: insideFrames, worstFrameJumpM: round(worst, 3), framesExcludedNearTeleports: skip.size },
    'zero frames with the near plane inside a collider; no single-frame pull-in > 1.5 m',
    'inside-geometry is a conservative proxy: a solid collider within one near-plane radius of the eye',
    'instrumented-runtime')];
}

/** BM-CAMERA-01 — both bodies stay resolvable under lock-on. */
export function lockOnFraming(trace) {
  if (!trace) return [result('BM-CAMERA-01', 'E03-CAMERA', 'lockon-framing', 'inconclusive', null, null, 'scenario did not run')];
  const ndc = col(trace, 'ndc'), lock = col(trace, 'clock');
  let locked = 0, bothIn = 0, targetOff = 0;
  for (let i = 0; i < ndc.length; i++) {
    if (lock[i] !== 1) continue;
    const [p, t] = ndc[i] || [];
    if (!p || !t) continue;
    locked++;
    const inCentral = (v) => v && Math.abs(v[0]) <= 0.8 && Math.abs(v[1]) <= 0.8 && v[2] < 1;
    if (inCentral(p) && inCentral(t)) bothIn++;
    if (!(Math.abs(t[0]) <= 1 && Math.abs(t[1]) <= 1 && t[2] < 1)) targetOff++;
  }
  const frac = locked ? bothIn / locked : null;
  return [result('BM-CAMERA-01', 'E03-CAMERA', 'lockon-framing',
    locked < 60 ? 'inconclusive' : (frac >= 0.95 && targetOff === 0 ? 'pass' : 'fail'),
    { lockedFrames: locked, bothInCentral80Pct: round(frac, 4), framesTargetOffScreen: targetOff },
    'both bodies inside the central 80% for ≥ 95% of the encounter; target never leaves frame',
    locked < 60 ? 'lock-on was never held long enough to measure' : 'includes a scripted back-into-a-corner leg')];
}

/**
 * BM-CAMERA-04 — shake must not cost legibility during a deflect window.
 *
 * Measured by ablation, not by reading the shake amplitude: two runs with identical
 * input, one with the camera's shake authority zeroed. Shake feeds nothing in gameplay,
 * so the runs should stay in lockstep — and if they do not, the ablation is invalid and
 * this returns inconclusive rather than a number that means nothing.
 */
export function shakeAblation(withShake, without) {
  const id = 'lockon-framing/lockon-noshake';
  if (!withShake || !without) return [result('BM-CAMERA-04', 'E03-CAMERA', id, 'inconclusive', null, null, 'one of the ablation pair did not run')];
  const ax = col(withShake, 'px'), bx = col(without, 'px');
  const n = Math.min(ax.length, bx.length);
  let divergence = 0;
  for (let i = 0; i < n; i++) divergence = Math.max(divergence, Math.abs((ax[i] ?? 0) - (bx[i] ?? 0)));
  if (divergence > 0.02) {
    return [result('BM-CAMERA-04', 'E03-CAMERA', id, 'inconclusive',
      { pairDivergenceM: round(divergence, 4) },
      'target centroid moves ≤ 4% of frame width from shake alone',
      'the ablation pair did not stay in lockstep, so the difference is not attributable to shake')];
  }
  const parries = eventsNamed(withShake, 'parry');
  const na = col(withShake, 'ndc'), nb = col(without, 'ndc');
  const win = Math.ceil(0.130 / DT);
  let worst = 0, windows = 0;
  for (const p of parries) {
    const i0 = sampleIndexOf(withShake, p.f);
    windows++;
    for (let i = i0; i < Math.min(n, i0 + win); i++) {
      const ta = na[i]?.[1], tb = nb[i]?.[1];
      if (!ta || !tb) continue;
      // NDC x spans [-1, 1], so a fraction of frame width is |Δx| / 2.
      const dx = Math.abs(ta[0] - tb[0]) / 2;
      const dy = Math.abs(ta[1] - tb[1]) / 2;
      worst = Math.max(worst, Math.hypot(dx, dy));
    }
  }
  return [result('BM-CAMERA-04', 'E03-CAMERA', id,
    windows === 0 ? 'inconclusive' : (worst <= 0.04 ? 'pass' : 'fail'),
    { deflectWindows: windows, worstShakeDisplacementFrac: round(worst, 5), pairDivergenceM: round(divergence, 5) },
    'target on-screen centroid moves ≤ 4% of frame width from shake alone during a 130 ms window',
    windows === 0 ? 'no deflect occurred in the run, so the window was never entered' : 'shake isolated by ablation')];
}

// --------------------------------------------------------------- E01 combat / E14 AI

/** BM-COMBAT-02 — posture, not an HP race, resolves fights. */
export function postureResolution(trace) {
  if (!trace) return [result('BM-COMBAT-02', 'E01-COMBAT', 'encounters', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const deaths = eventsNamed(trace, 'death').filter((d) => d.entity?.faction !== 'player');
  const breaks = eventsNamed(trace, 'posture-break');
  const execs = eventsNamed(trace, 'execution');
  const WINDOW = 6 / DT;             // frames — a break has to still be the cause
  let postureResolved = 0;
  const per = [];
  for (const d of deaths) {
    const id = d.entity?.id ?? null;
    const brokeFirst = breaks.some((b) => (b.entity?.id ?? null) === id && b.f <= d.f && d.f - b.f <= WINDOW);
    const executed = execs.some((e) => (e.entity?.id ?? null) === id && Math.abs(e.f - d.f) <= WINDOW);
    if (brokeFirst || executed) postureResolved++;
    per.push({ id, frame: d.f, postureBreakFirst: brokeFirst, executed });
  }
  const encounters = marks(trace, 'encounter:').length;
  const frac = deaths.length ? postureResolved / deaths.length : null;
  return [result('BM-COMBAT-02', 'E01-COMBAT', 'encounters',
    (encounters < 20 || deaths.length < 5) ? 'inconclusive' : (frac >= 0.6 ? 'pass' : 'fail'),
    {
      encounters, enemyDeaths: deaths.length, postureBreaks: breaks.length,
      executions: execs.length, postureResolvedFraction: round(frac, 4),
    },
    '≥ 60% of enemy deaths follow a posture break, over ≥ 20 scripted encounters',
    'played by the harness bot policy, not by a human — this is not a play test',
    'instrumented-runtime')];
}

/** BM-AI-03 — simultaneous attack commitment stays inside the authored token pool. */
export function tokenDiscipline(trace) {
  if (!trace) return [result('BM-AI-03', 'E14-AI', 'encounters', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const tokens = col(trace, 'etokens'), alive = col(trace, 'ealive'), limit = col(trace, 'etokenmax');
  let considered = 0, within = 0, worst = 0, worstLimit = null;
  for (let i = 0; i < tokens.length; i++) {
    if ((alive[i] ?? 0) < 3) continue;             // the criterion is stated for ≥ 3 engaged
    const lim = limit[i];
    if (lim == null) continue;
    considered++;
    if (tokens[i] <= lim) within++;
    if (tokens[i] > worst) { worst = tokens[i]; worstLimit = lim; }
  }
  const frac = considered ? within / considered : null;
  return [result('BM-AI-03', 'E14-AI', 'encounters',
    considered < 200 ? 'inconclusive' : (frac >= 0.95 ? 'pass' : 'fail'),
    { framesWith3PlusEngaged: considered, withinLimitFraction: round(frac, 4), peakSimultaneousAttackers: worst, authoredLimit: worstLimit },
    'simultaneous attack commitment inside the authored token limit for ≥ 95% of the encounter',
    considered < 200 ? 'three enemies were rarely alive at once, so the criterion was barely exercised' : null,
    'instrumented-runtime')];
}

// ---------------------------------------------------------------------- E10 touch

/** BM-TOUCH-03 — deliberate camera drags must not misfire into slashes or buttons. */
export function touchMisfire(trace, zoneAudit) {
  if (!trace) return [result('BM-TOUCH-03', 'E10-TOUCH', 'touch-drags', 'inconclusive', null, null, 'scenario did not run')];
  const slash = col(trace, 'islash'), pressed = col(trace, 'ipressed');
  const dragMarks = marks(trace, 'drag:');
  let misfires = 0;
  const detail = [];
  for (let i = 0; i < dragMarks.length; i++) {
    const a = sampleIndexOf(trace, dragMarks[i].f);
    const b = i + 1 < dragMarks.length ? sampleIndexOf(trace, dragMarks[i + 1].f) : slash.length;
    let bad = null;
    for (let j = a; j < b; j++) {
      if ((slash[j] ?? 0) > 0) { bad = 'slash'; break; }
      const p = pressed[j] || '';
      if (p.includes('attack') || p.includes('heavy') || p.includes('dodge') || p.includes('special')) { bad = p; break; }
    }
    if (bad) { misfires++; detail.push({ drag: dragMarks[i].label, produced: bad }); }
  }
  const rate = dragMarks.length ? misfires / dragMarks.length : null;
  const edgeOk = zoneAudit ? zoneAudit.zonesInsideEdgeMargin === 0 : null;
  const pass = dragMarks.length >= 100 && rate < 0.01 && edgeOk !== false;
  return [result('BM-TOUCH-03', 'E10-TOUCH', 'touch-drags',
    dragMarks.length < 100 ? 'inconclusive' : (pass ? 'pass' : 'fail'),
    { drags: dragMarks.length, misfires, misfireRate: round(rate, 5), examples: detail.slice(0, 5), edgeMargin: zoneAudit ?? null },
    '< 1% of ≥ 100 camera drags produce an unintended slash or press; no gesture starts inside the OS edge margin',
    'every drag is authored outside the flick and tap envelopes, so anything it fires is unintended by construction')];
}

/** BM-TOUCH-04 — a touch is consumed by game state in the frame it arrives. */
export function touchLatency(trace) {
  if (!trace) return [result('BM-TOUCH-04', 'E10-TOUCH', 'touch-latency', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const pressed = col(trace, 'ipressed');
  const taps = marks(trace, 'tap:');
  const offsets = [];
  for (const t of taps) {
    // The tap is classified on pointer-up, dispatched one frame after the mark.
    const arrival = sampleIndexOf(trace, t.f) + 1;
    let seen = null;
    for (let j = arrival; j < Math.min(pressed.length, arrival + 12); j++) {
      if ((pressed[j] || '').includes('attack')) { seen = j - arrival; break; }
    }
    offsets.push(seen);
  }
  const found = offsets.filter((o) => o != null);
  const worst = found.length ? Math.max(...found) : null;
  return [result('BM-TOUCH-04', 'E10-TOUCH', 'touch-latency',
    found.length < taps.length * 0.9 ? 'fail' : (worst === 0 ? 'pass' : 'fail'),
    { taps: taps.length, registered: found.length, worstDeferralFrames: worst, histogram: histogram(found) },
    'a touch event is consumed by game state in the frame it arrives; never deferred more than one frame',
    found.length < taps.length ? `${taps.length - found.length} taps never produced an attack intent` : null,
    'instrumented-runtime')];
}

function histogram(values) {
  const h = {};
  for (const v of values) h[v] = (h[v] || 0) + 1;
  return h;
}

// ------------------------------------------------------------------ E12 animation

/**
 * BM-ANIM-01 — attack startup, measured from first visible motion.
 *
 * The criterion is explicit that the state change is not the measurement: it must be
 * taken from when the body actually starts to move. So the metric walks backwards from
 * the first damaging frame through the weapon-hand displacement series until motion
 * falls to the idle floor, and calls that the startup.
 */
export function animStartup(trace) {
  if (!trace) return [result('BM-ANIM-01', 'E12-ANIMATION', 'anim-startup', 'inconclusive', null, null, 'scenario did not run')];
  const em = col(trace, 'emotion');
  const rows = em.filter((r) => Array.isArray(r) && r.length);
  if (rows.length < 60) {
    return [result('BM-ANIM-01', 'E12-ANIMATION', 'anim-startup', 'inconclusive',
      { framesWithEnemyMotion: rows.length }, 'startup ≥ 0.140 s for every enemy attack',
      'the rig could not read enemy weapon-hand bones — probe fault, not a game result')];
  }
  // Rebuild per-enemy series: [frameIndex] -> displacement, active flag.
  const byId = new Map();
  for (let i = 0; i < em.length; i++) {
    for (const r of em[i] || []) {
      if (!r || r[1] == null) continue;
      const id = r[0];
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id)[i] = { d: r[1], active: r[3] === 1 };
    }
  }
  const floors = [];
  for (const series of byId.values()) {
    const ds = series.filter(Boolean).map((s) => s.d).sort((a, b) => a - b);
    floors.push(ds.length ? ds[Math.floor(ds.length * 0.5)] : 0);
  }
  const idleFloor = mean(floors) || 0;
  const startups = [];
  for (const [id, series] of byId) {
    let prevActive = false;
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (!s) continue;
      if (s.active && !prevActive) {
        let j = i;
        while (j > 0 && series[j - 1] && series[j - 1].d > idleFloor * 3) j--;
        startups.push({ enemy: id, frame: i, startupMs: Math.round((i - j) * DT * 1000) });
      }
      prevActive = s.active;
    }
  }
  const ms = startups.map((s) => s.startupMs);
  const shortest = ms.length ? Math.min(...ms) : null;
  return [result('BM-ANIM-01', 'E12-ANIMATION', 'anim-startup',
    ms.length < 3 ? 'inconclusive' : (shortest >= 140 ? 'pass' : 'fail'),
    { attacks: ms.length, shortestStartupMs: shortest, medianStartupMs: percentile(ms, 0.5), idleMotionFloorM: round(idleFloor, 6) },
    'visible startup ≥ 140 ms (EnemyAI REACTION_FLOOR) for every enemy attack',
    ms.length < 3 ? 'not enough enemy attacks were observed to judge' : 'startup taken from first frame of weapon-hand motion above 3× the idle floor')];
}

/** BM-ANIM-02 — the damaging window matches the visible sweep. */
export function bladeWindow(trace) {
  if (!trace) return [result('BM-ANIM-02', 'E12-ANIMATION', 'blade-window', 'inconclusive', null, null, 'scenario did not run', 'instrumented-runtime')];
  const blade = col(trace, 'blade').filter((b) => b != null);
  if (blade.length < 60) {
    return [result('BM-ANIM-02', 'E12-ANIMATION', 'blade-window', 'inconclusive',
      { framesWithBladeData: blade.length }, 'weapon-active frames coincide with the visible sweep within one frame',
      'the rig could not read blade transforms — probe fault, not a game result')];
  }
  const all = col(trace, 'blade');
  const swings = [];
  let start = -1;
  for (let i = 0; i < all.length; i++) {
    const active = all[i]?.[4] === 1;
    if (active && start < 0) start = i;
    if (!active && start >= 0) { swings.push([start, i - 1]); start = -1; }
  }
  const peaks = [];
  for (const [a, b] of swings) {
    // The visible sweep: contiguous frames around the active window whose tip speed is
    // at least 30% of that swing's peak.
    let peak = 0;
    for (let i = Math.max(0, a - 20); i < Math.min(all.length, b + 20); i++) peak = Math.max(peak, all[i]?.[3] ?? 0);
    if (peak <= 0) continue;
    const thresh = peak * 0.3;
    let s = a, e = b;
    while (s > 0 && (all[s - 1]?.[3] ?? 0) >= thresh) s--;
    while (e + 1 < all.length && (all[e + 1]?.[3] ?? 0) >= thresh) e++;
    peaks.push({ activeStart: a, activeEnd: b, sweepStart: s, sweepEnd: e, leadFrames: a - s, lagFrames: e - b });
  }
  const worstLead = peaks.length ? Math.max(...peaks.map((p) => Math.abs(p.leadFrames))) : null;
  const worstLag = peaks.length ? Math.max(...peaks.map((p) => Math.abs(p.lagFrames))) : null;
  return [result('BM-ANIM-02', 'E12-ANIMATION', 'blade-window',
    peaks.length < 3 ? 'inconclusive' : ((worstLead <= 1 && worstLag <= 1) ? 'pass' : 'fail'),
    { swings: peaks.length, worstLeadFrames: worstLead, worstLagFrames: worstLag, sample: peaks.slice(0, 5) },
    'weapon-active frames coincide with the visible blade sweep within one frame at both ends',
    peaks.length < 3 ? 'not enough player swings landed in the run' : null,
    'instrumented-runtime')];
}

// ------------------------------------------------------------------ E06 narrative

/**
 * BM-STORY-03 — control is never removed for more than a beat.
 *
 * Two separate questions, kept separate. Was control ever actually removed, and for how
 * long? And was the title beat interactive — did the world move while the ink was on
 * screen? The second is the one a still frame can never answer, and it is answered by
 * the player's own displacement during the beat.
 */
export function controlContinuity(trace) {
  if (!trace) return [result('BM-STORY-03', 'E06-NARRATIVE', 'control-continuity', 'inconclusive', null, null, 'scenario did not run')];
  const c = col(trace, 'control');
  const intro = col(trace, 'intro');
  if (c.length < 60) return [result('BM-STORY-03', 'E06-NARRATIVE', 'control-continuity', 'inconclusive', { frames: c.length }, null, 'probe returned nothing')];
  let longest = 0, run = 0, longestAt = -1;
  for (let i = 0; i < c.length; i++) {
    if (c[i] === 0) { run++; if (run > longest) { longest = run; longestAt = i - run + 1; } }
    else run = 0;
  }
  const introFrames = intro.filter((v) => v === 1).length;
  const px = col(trace, 'px'), pz = col(trace, 'pz');
  let movedDuringIntro = null;
  const introIdx = intro.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);
  if (introIdx.length > 2 && px.length) {
    const a = introIdx[0], b = introIdx[introIdx.length - 1];
    if (px[a] != null && px[b] != null) movedDuringIntro = +Math.hypot(px[b] - px[a], pz[b] - pz[a]).toFixed(3);
  }
  const seconds = longest * DT;
  return [result('BM-STORY-03', 'E06-NARRATIVE', 'control-continuity',
    seconds <= 5 ? 'pass' : 'fail',
    {
      longestNoControlSeconds: round(seconds, 3),
      startedAtFrame: longestAt,
      titleBeatSeconds: round(introFrames * DT, 3),
      playerDisplacementDuringTitleBeatM: movedDuringIntro,
    },
    'no non-interactive sequence longer than 5 s outside the title beat; every such beat is skippable',
    'measured from a fresh boot with the intro deliberately NOT skipped. A non-zero displacement during the title beat means the beat never took control away, so skippability does not arise for it.')];
}

// --------------------------------------------------------------------- E08 choice

/**
 * BM-CHOICE-02 — escalation is deliberate, and reachable at all.
 *
 * `Level.ringBell()` emits no objective of its own, so the unambiguous evidence is the
 * interactable's `used` flag read straight after the run; the event stream is kept beside
 * it as corroboration. The scenario is in two halves — bot-driven combat movement over
 * the bell, then deliberate interact presses — precisely so a null result can be told
 * apart from a protected one.
 */
export function bellEscalation(trace, interactables) {
  if (!trace) return [result('BM-CHOICE-02', 'E08-CHOICE', 'bell-accident', 'inconclusive', null, null, 'scenario did not run')];
  const split = marks(trace, 'deliberate-interact')[0];
  const cut = split ? split.f : Infinity;
  const rings = (trace.events || []).filter((e) =>
    (e.name === 'objective' && /鐘|bell/i.test(String(e.text || '') + String(e.sub || ''))) ||
    e.name === 'bell-rung');
  const accidental = rings.filter((r) => r.f < cut).length;
  const deliberateEvents = rings.filter((r) => r.f >= cut).length;
  const bell = (interactables || []).find((i) => i.id === 'bell') || null;
  const everRung = bell ? bell.used : (deliberateEvents + accidental) > 0;
  return [result('BM-CHOICE-02', 'E08-CHOICE', 'bell-accident',
    !everRung ? 'fail' : (accidental === 0 ? 'pass' : 'fail'),
    {
      accidentalRingEvents: accidental,
      deliberateRingEvents: deliberateEvents,
      bellUsedFlagAfterRun: bell ? bell.used : null,
      interactablesSeen: (interactables || []).map((i) => `${i.id}:${i.used}`),
      objectiveEventsTotal: eventsNamed(trace, 'objective').length,
    },
    'the bell cannot be rung by accident during combat movement, and its consequence is signalled before the wave commits',
    !everRung
      ? 'the deliberate half of the scenario produced nothing either: the bell was never struck even when the mapped interact intent was pressed, so it is unreachable in play rather than protected'
      : null)];
}

// ------------------------------------------------- extras measured outside a scenario

/** BM-EXPLORE-01 — navigable by landmark alone. */
export function landmarks(survey) {
  if (!survey || !survey.points?.length) {
    return [result('BM-EXPLORE-01', 'E04-EXPLORATION', 'landmark-survey', 'inconclusive', null,
      'at least one landmark visible in silhouette from every approach point', 'survey did not run')];
  }
  // A survey that resolved no anchors, or whose every eye point failed to find ground,
  // measured nothing. Reporting that as "no landmark is visible anywhere" would be an
  // apparatus fault dressed up as a world-design defect — and it was, on the first run.
  const errored = survey.points.filter((p) => p.error);
  if (!survey.anchors?.length || errored.length === survey.points.length) {
    return [result('BM-EXPLORE-01', 'E04-EXPLORATION', 'landmark-survey', 'inconclusive',
      { points: survey.points.length, anchorsResolved: survey.anchors?.length ?? 0, errors: errored.map((p) => `${p.name}: ${p.error}`) },
      'from every spawn and approach point, ≥ 1 navigational landmark is visible',
      'the survey could not resolve its anchors or its eye points, so nothing was measured')];
  }
  const blind = survey.points.filter((p) => p.visible.length === 0);
  return [result('BM-EXPLORE-01', 'E04-EXPLORATION', 'landmark-survey',
    blind.length === 0 ? 'pass' : 'fail',
    {
      points: survey.points.length,
      anchorsResolved: survey.anchors.length,
      pointsWithNoLandmark: blind.length,
      blindPoints: blind.map((p) => p.name),
      perPoint: survey.points.map((p) => ({ name: p.name, visible: p.visible })),
    },
    'from every spawn and approach point, ≥ 1 navigational landmark is visible',
    'visibility = inside the frustum at eye height and not occluded on a ray to the landmark anchor; it does not judge whether the silhouette reads')];
}

/** BM-CHAR-02 — enemies separated from the background by rim light. */
export function rimContrast(measurements) {
  if (!measurements || !measurements.length) {
    return [result('BM-CHAR-02', 'E07-CHARACTER', 'archetype-rim', 'inconclusive', null,
      'measured luma difference across the enemy edge in every combat framing', 'measurement did not run', 'frame-measurement')];
  }
  // Entries that failed to produce a frame carry an `error` and no delta. Comparing
  // `undefined < 0.06` is false, so an all-errors set previously returned PASS — a
  // fabricated verification of the exact kind the project's honesty guard exists to stop.
  const ok = measurements.filter((m) => typeof m.edgeLumaDelta === 'number');
  const errored = measurements.filter((m) => m.error);
  if (ok.length === 0) {
    return [result('BM-CHAR-02', 'E07-CHARACTER', 'archetype-rim', 'inconclusive',
      { attempted: measurements.length, errors: errored.map((m) => `${m.archetype ?? '?'}/${m.placement ?? '?'}: ${String(m.error).split('\n')[0]}`) },
      'measured luma difference across the enemy edge in every combat framing',
      'no frame pair was captured, so nothing was measured', 'frame-measurement')];
  }
  const worst = ok.reduce((w, m) => (w == null || m.edgeLumaDelta < w.edgeLumaDelta ? m : w), null);
  const failing = ok.filter((m) => m.edgeLumaDelta < 0.06);
  return [result('BM-CHAR-02', 'E07-CHARACTER', 'archetype-rim',
    errored.length ? 'inconclusive' : (failing.length === 0 ? 'pass' : 'fail'),
    {
      samples: ok.length, attempted: measurements.length, worst,
      failing: failing.map((m) => `${m.archetype}/${m.placement}`),
      errors: errored.map((m) => `${m.archetype ?? '?'}/${m.placement ?? '?'}: ${String(m.error).split('\n')[0]}`),
    },
    'a measurable luma step across the enemy edge in sunlit and shaded placement (≥ 0.06 linear luma, the smallest step this rig can separate from dither)',
    'threshold is this rig\'s own floor: ARCHITECTURE.md §5.10 states the requirement but no number, so a stricter one must come from the art contract, not from here',
    'frame-measurement')];
}

/** BM-AUDIO-03 — peak output under worst-case simultaneity. */
export function audioPeak(m) {
  if (!m || m.peak == null) {
    return [result('BM-AUDIO-03', 'E13-AUDIO', 'audio-peak', 'inconclusive', null,
      '≤ -1 dBFS with five simultaneous impacts plus the full bed', m?.error || 'measurement did not run', 'instrumented-runtime')];
  }
  const db = 20 * Math.log10(Math.max(1e-6, m.peak));
  return [result('BM-AUDIO-03', 'E13-AUDIO', 'audio-peak',
    m.samples < 4 ? 'inconclusive' : (db <= -1 ? 'pass' : 'fail'),
    { samplePeak: round(m.peak, 5), samplePeakDbfs: round(db, 2), oversampledEstimateDbfs: m.truePeakEstimateDb ?? null, windows: m.samples, impacts: m.impacts },
    '≤ -1 dBFS true peak with five simultaneous impacts plus the full bed',
    'this is a SAMPLE peak taken post-limiter through an AnalyserNode, with a 4× interpolated estimate beside it. It is not an ITU-R BS.1770 true-peak meter and must not be recorded as one.',
    'instrumented-runtime')];
}

/**
 * BM-PERF-05 — the JS frame budget.
 *
 * Not a criterion this apparatus set out to measure. It is here because building the rig
 * ran straight into it: a scenario with three enemies engaged took roughly 800× longer
 * per frame than the same harness with none, and that had to be explained before any
 * combat number could be believed. The cost is pure JavaScript in the physics narrow
 * phase, so unlike everything else in this report it is *not* a SwiftShader artifact —
 * the same V8 does an enemy-free frame in under 2 ms.
 *
 * It is still not device evidence. A container CPU is not a phone, and the number that
 * matters is the ratio and the mechanism, not the absolute millisecond count.
 */
export function jsFrameBudget(m) {
  const id = 'js-frame-cost';
  if (!m || m.error || !m.threeEnemies) {
    return [result('BM-PERF-05', 'E15-PERFORMANCE', id, 'inconclusive', null,
      '≤ 5 ms JS per frame at MEDIUM (ARCHITECTURE.md §7)', m?.error || 'measurement did not run', 'instrumented-runtime')];
  }
  const idle = m.noEnemies?.msPerFrame ?? null;
  const busy = m.threeEnemies.msPerFrame;
  const worst = (m.threeEnemies.systems || [])[0] || null;
  return [result('BM-PERF-05', 'E15-PERFORMANCE', id,
    busy == null ? 'inconclusive' : (busy <= 5 ? 'pass' : 'fail'),
    {
      msPerFrameNoEnemies: idle,
      msPerFrameThreeEnemies: busy,
      ratio: idle ? +(busy / idle).toFixed(1) : null,
      heaviestSystem: worst,
      narrowphaseChecksNoEnemies: m.noEnemiesPhysics?.narrowphaseChecks ?? null,
      narrowphaseChecksThreeEnemies: m.threeEnemiesPhysics?.narrowphaseChecks ?? null,
      colliders: m.colliders ?? null,
    },
    '≤ 5 ms JS per frame at MEDIUM (ARCHITECTURE.md §7)',
    'Measured in a container, not on a phone — the absolute milliseconds are not device evidence. What is device-independent is the shape: the whole static world is a handful of triangle-mesh colliders totalling ~2.1k triangles, and three engaged enemies drive hundreds of thousands of narrow-phase triangle tests in a single frame.',
    'instrumented-runtime')];
}

// -------------------------------------------------------------------- aggregation

export function evaluateAll(traces, extras = {}) {
  const t = (id) => traces.find((x) => x && x.id === id) || null;
  const out = [
    ...moveSpeeds(t('move-speeds')),
    ...moveReversal(t('move-reversal')),
    ...footPlant(t('foot-plant')),
    ...cameraTraverse(t('camera-traverse')),
    ...lockOnFraming(t('lockon-framing')),
    ...shakeAblation(t('lockon-framing'), t('lockon-noshake')),
    ...postureResolution(t('encounters')),
    ...tokenDiscipline(t('encounters')),
    ...touchMisfire(t('touch-drags'), extras.zoneAudit),
    ...touchLatency(t('touch-latency')),
    ...animStartup(t('anim-startup')),
    ...bladeWindow(t('blade-window')),
    ...controlContinuity(t('control-continuity')),
    ...bellEscalation(t('bell-accident'), extras.interactables),
    ...landmarks(extras.landmarks),
    ...rimContrast(extras.rimContrast),
    ...audioPeak(extras.audioPeak),
    ...jsFrameBudget(extras.jsFrameCost),
  ];
  return out;
}

export function summarise(results) {
  const by = { pass: 0, fail: 0, inconclusive: 0 };
  for (const r of results) by[r.verdict] = (by[r.verdict] || 0) + 1;
  const elements = [...new Set(results.map((r) => r.element))].sort();
  return {
    criteria: results.length,
    verdicts: by,
    elements: elements.length,
    elementsCovered: elements,
    elementsWithAMeasurement: [...new Set(results.filter((r) => r.verdict !== 'inconclusive').map((r) => r.element))].sort(),
  };
}
