/** Focused Enemy regressions. Real rigs, pure Node; no browser or renderer. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Group, Scene, Vector3 } from 'three';
import { Enemy, EnemyManager, ARCHETYPES } from '../src/gameplay/Enemy.js';
import { PhysicsWorld } from '../src/gameplay/Physics.js';
import { Rig } from '../src/anim/Rig.js';
import { EventBus } from '../src/core/EventBus.js';
import { WORLD } from '../src/world/Constants.js';
import { animStartup } from './interaction-metrics.mjs';
import { buildPlans } from './interaction-scenarios.mjs';

const FLOOR = WORLD.PLATEAU_HEIGHT;
const measureOnly = process.argv.includes('--measure');
const details = process.argv.includes('--details');
const failures = [];
const results = {};
function check(name, fn) {
  try { results[name] = fn(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
function context() {
  return {
    quality: { cloth: false, ragdoll: false },
    engine: { elapsed: 0 },
    bus: new EventBus(),
    terrain: { heightAt: () => FLOOR },
    player: { position: new Vector3(0, FLOOR, -2), isAlive: true },
  };
}
function managerStub() {
  return {
    difficulty: 1, damageScale: 1,
    _requestToken: () => true, _releaseToken() {}, _noise() {},
  };
}
function finite(v) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
const harnessSource = readFileSync(new URL('./harness/runtime.js', import.meta.url), 'utf8');
const probeStart = harnessSource.indexOf('  const _emotionPrev = new Map();');
const probeEnd = harnessSource.indexOf('  function probeFeet(', probeStart);
assert.ok(probeStart >= 0 && probeEnd > probeStart);
const makeMotionProbe = new Function('scratchA', 'round', 'stateId',
  `${harnessSource.slice(probeStart, probeEnd)}\nreturn probeEnemyMotion;`);
function motionProbe(states) {
  return makeMotionProbe(new Vector3(), (v, digits = 3) => Number.isFinite(v) ? +v.toFixed(digits) : null,
    (state) => {
      let index = states.indexOf(state);
      if (index < 0) { index = states.length; states.push(state); }
      return index;
    });
}

check('scalarTeleport', () => {
  const ctx = context();
  const calls = [];
  const controller = {
    position: new Vector3(),
    teleport(...args) { calls.push(args); this.position.set(...args); },
  };
  ctx.physics = { createCharacter: () => controller };
  const e = new Enemy(ctx, 'ashigaru', managerStub());
  for (const position of [new Vector3(2, FLOOR, 3), new Vector3(-8, FLOOR, 12)]) {
    e.reset(position, { faceTarget: false });
    const call = calls.at(-1);
    assert.equal(call.length, 3);
    assert.ok(call.every(Number.isFinite));
    assert.ok(controller.position.equals(position));
  }
  return { respawns: calls.length, numericArgumentsPerTeleport: 3 };
});

check('controllerBoundary', () => {
  const ctx = context();
  const e = new Enemy(ctx, 'ronin', managerStub());
  const safe = new Vector3(2, FLOOR, 3);
  e.reset(safe, { faceTarget: false });
  e.controller = { position: new Vector3(NaN, FLOOR, 3), move: () => null };
  let warnings = 0;
  const warn = console.warn;
  console.warn = () => warnings++;
  try {
    for (const axis of ['x', 'y', 'z']) {
      e.controller.position.copy(safe);
      e.controller.position[axis] = NaN;
      e._integrate(0.25);
      assert.ok(e.position.equals(safe), `${axis}: last good root was lost`);
      assert.ok(finite(e.velocity));
    }
  } finally { console.warn = warn; }
  assert.equal(warnings, 1);
  e.controller.position.set(4, FLOOR, 6);
  e._integrate(1 / 60);
  assert.ok(e.position.equals(e.controller.position));
  return { rejectedAxes: 3, warnings, resumesFromValidController: true };
});

check('slopeUnits', () => {
  const cases = [];
  for (const [degrees, legacy] of [[15, true], [0, false], [15, false], [45, false], [55, false]]) {
    const ctx = context();
    const grade = Math.tan(degrees * Math.PI / 180);
    ctx.terrain = { heightAt: x => FLOOR + x * grade };
    ctx.physics = new PhysicsWorld(ctx);
    ctx.physics.addHeightfield();
    const e = new Enemy(ctx, 'ashigaru', managerStub());
    e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false });
    if (legacy) e.controller.setSlopeLimit(0.86);
    let groundedFrames = 0;
    for (let f = 0; f < 120; f++) {
      e.velocity.x = 1.9;
      e._integrate(1 / 60);
      if (e.controller.grounded) groundedFrames++;
    }
    const entry = {
      terrainDegrees: degrees, legacyUnits: legacy,
      controllerLimitDegrees: +e.controller.slopeLimit.toFixed(6),
      uphillDisplacementM: +e.position.x.toFixed(6), groundedFrames,
    };
    cases.push(entry);
    if (legacy || degrees === 55) {
      assert.equal(groundedFrames, 0);
      assert.ok(e.position.x < 0.1);
    } else {
      assert.equal(groundedFrames, 120);
      assert.ok(e.position.x > 3.3, `${degrees} degree walkable slope did not advance`);
    }
    e.dispose();
  }
  return { framesPerCase: 120, horizontalIntentMps: 1.9, cases };
});

check('parryOwnership', () => {
  const ctx = context();
  const manager = new EnemyManager(ctx);
  manager._subscribe();
  const e = new Enemy(ctx, 'ronin', manager);
  e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false });
  const initial = e.posture;
  let callbacks = 0;
  e.ai.onParried = () => callbacks++;
  const event = { defender: ctx.player, attacker: e, point: new Vector3(), perfect: true };
  ctx.bus.emit('parry', event);
  assert.equal(callbacks, 0, 'event notification repeated a gameplay callback');
  e.onParried(ctx.player, event);
  assert.equal(callbacks, 1);
  assert.equal(e.posture, initial, 'Combat callback charged extra pressure');
  assert.equal(e.state, 'stagger');
  assert.ok(e.postureLocked > 0);
  assert.equal(e.managesPostureRegen, true);
  e.onParried(ctx.player);
  assert.ok(Math.abs(e.posture - initial * 0.78) < 1e-8);
  manager._unsubscribe();
  return { callbacksPerCombatNotification: 1, duplicatePressure: 0, legacyFallbackFraction: 0.22 };
});

check('pooledResetSensorBoundary', () => {
  const ctx = context();
  const e = new Enemy(ctx, 'ronin', managerStub());
  e.buildVisual(Rig);
  const seed = 0x5eed17;
  e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false, seed });

  // Reproduce the prior-life fault directly: steering runs every frame while
  // perception is staggered, so two cached neighbours move an otherwise idle body.
  e.ai._tickTimer = 1;
  e.ai.behaviour = 'hold';
  e.ai._sepX = 1; e.ai._sepZ = 0; e.ai._sepN = 2;
  e.ai.s.dist = 8; e.ai.s.toX = 0; e.ai.s.toZ = -1;
  const staleStart = e.position.clone();
  e.update(1 / 60, 1 / 60, 2);
  const staleDisplacementM = Math.hypot(e.position.x - staleStart.x, e.position.z - staleStart.z);
  assert.ok(staleDisplacementM > 0, 'fixture must reproduce stale-separation first-frame movement');
  assert.equal(e.intent.moveGain, 0.28);

  let rigResets = 0;
  const resetRig = e.rig.reset.bind(e.rig);
  e.rig.reset = (...args) => { rigResets++; return resetRig(...args); };
  const spawn = new Vector3(11, FLOOR, 7);
  e.reset(spawn, { faceTarget: false, seed });
  const personality = JSON.stringify(e.ai.p);
  assert.ok(e.ai._tickTimer > 1 / 60, 'fixture must exercise steering before the staggered perception tick');
  assert.equal(e.ai._sepX, 0); assert.equal(e.ai._sepZ, 0); assert.equal(e.ai._sepN, 0);
  assert.equal(e.ai.s.crowding, 0); assert.equal(e.ai.s.allyCount, 0);
  assert.equal(e.intent.moveGain, 0); assert.ok(e.intent.moveDir.lengthSq() === 0);
  assert.equal(rigResets, 1, 'a pooled Rig resets exactly once at the entity lifecycle boundary');

  const cleanStart = e.position.clone();
  e.update(1 / 60, 1 / 60, 2);
  const cleanDisplacementM = Math.hypot(e.position.x - cleanStart.x, e.position.z - cleanStart.z);
  assert.equal(cleanDisplacementM, 0, 'the first pre-perception frame must not inherit movement');
  assert.equal(e.intent.moveGain, 0);

  const sameSeed = new Enemy(ctx, 'ronin', managerStub());
  sameSeed.reset(spawn, { faceTarget: false, seed });
  assert.equal(JSON.stringify(sameSeed.ai.p), personality, 'reset must retain deterministic seed/personality');
  sameSeed.dispose();
  e.dispose();
  return { staleDisplacementM, staleMoveGain: 0.28, cleanDisplacementM,
    cleanMoveGain: 0, rigResets, deterministicSeed: seed };
});

check('idleCalibrationProbe', () => {
  const ctx = context();
  const e = new Enemy(ctx, 'ronin', managerStub());
  e.buildVisual(Rig);
  e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false });
  e.ai.update = () => {};
  e._idleTimer = 999;
  e.rig._breath = e.rig._swayPhase = e._breathPhase = 0;
  ctx.enemies = { list: [e] };
  const states = [], out = { emotion: [] }, probe = motionProbe(states);
  e.intent.moveGain = 1;
  e.intent.moveDir.set(0, 0, -1);
  for (let f = 0; f < 120; f++) { e.update(1 / 60, f / 60, 2); probe(ctx, out); }
  e.intent.moveGain = 0;
  const stopping = [];
  for (let f = 0; f < 240; f++) {
    e.update(1 / 60, (120 + f) / 60, 2);
    probe(ctx, out);
    stopping.push(out.emotion.at(-1)[0]);
  }
  const early = stopping.slice(0, 30);
  assert.ok(early.every(r => states[r[2]] === 'idle'));
  assert.ok(early.every(r => r[6] === 0), 'an idle state still braking/settling cannot calibrate motion');
  const settled = stopping.slice(-30);
  assert.ok(settled.every(r => r[6] === 1), 'a real stationary settled idle must remain measurable');
  const earlyDs = stopping.slice(0, 13).map(r => r[1]).sort((a, b) => a - b);
  const lateDs = settled.map(r => r[1]).sort((a, b) => a - b);
  for (let f = 0; f < 60; f++) {
    const yaw = (f + 1) * 0.02;
    e.intent.faceDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    e.update(1 / 60, (360 + f) / 60, 2);
    probe(ctx, out);
    const row = out.emotion.at(-1)[0];
    assert.equal(row[6], 0, 'turning without translation is not stationary idle');
    assert.ok(row[11] & 8, 'the root yaw diagnostic must identify the rejection');
  }
  e.dispose();
  return { idleStateTransitionFramesRejected: early.length, steadyFramesAccepted: settled.length,
    earlyIdleMedianM: earlyDs[6], steadyIdleMedianM: lateDs[15], stationaryTurnFramesRejected: 60 };
});

// Exercise the exact driver and injected runtime together, including the ordinary
// spawn action and its reset boundary. The scene/rig/AI run, without a browser.
const cosmeticRandom = Math.random;
try {
  let seed = 0x2f19;
  Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const ctx = context();
  ctx.scene = new Scene();
  ctx.physics = { raycast: () => ({ hit: false }) };
  ctx.player.root = new Group();
  ctx.player.root.position.copy(ctx.player.position);
  ctx.player.position = ctx.player.root.position;
  ctx.player.forward = new Vector3(0, 0, -1);
  ctx.player.velocity = new Vector3();
  ctx.player.radius = .35;
  ctx.player.height = 1.75;
  ctx.player.health = ctx.player.maxHealth = 100;
  ctx.player.posture = 0;
  ctx.player.state = 'idle';
  ctx.input = { releaseAll() {} };
  const manager = new EnemyManager(ctx);
  manager.RigClass = Rig;
  manager.maxEnemies = 3;
  manager._lodNear = 40;
  manager._lodFar = 80;
  ctx.enemies = manager;
  let spawned = 0, animationCalls = 0, aiCalls = 0, resets = 0;
  const originalSpawn = manager.spawn;
  manager.spawn = function (...args) {
    const e = originalSpawn.apply(this, args);
    if (e) {
      spawned++;
      const animate = e._updateAnim, think = e.ai.update, reset = e.reset;
      e._updateAnim = function (...a) { animationCalls++; return animate.apply(this, a); };
      e.ai.update = function (...a) { aiCalls++; return think.apply(this, a); };
      e.reset = function (...a) { resets++; return reset.apply(this, a); };
    }
    return e;
  };
  const spawnWrapper = manager.spawn;
  const window = { innerWidth: 844, innerHeight: 390, requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}, dispatchEvent() {}, __kagerou: ctx };
  const document = { getElementById: () => null };
  const performance = { now: () => 1000 };
  vm.runInNewContext(harnessSource, { window, document, performance, console, setTimeout }, { filename: 'tools/harness/runtime.js' });
  const h = window.__kh;
  h.lock();
  let gameplayFrames = 0;
  window.requestAnimationFrame(function step() {
    gameplayFrames++;
    ctx.engine.elapsed += 1 / 60;
    manager.update(1 / 60, ctx.engine.elapsed, 1 / 60);
    ctx.scene.updateMatrixWorld(true);
    window.requestAnimationFrame(step);
  });
  const captureSource = readFileSync(new URL('./interaction-capture.mjs', import.meta.url), 'utf8');
  const driverStart = captureSource.indexOf('async function runPlan(');
  const driverEnd = captureSource.indexOf('// ------------------------------------------------------------------------ extras', driverStart);
  assert.ok(driverStart >= 0 && driverEnd > driverStart);
  const runPlan = new Function('window', 'CHUNK', 'process', 'console',
    `${captureSource.slice(driverStart, driverEnd)}\nreturn runPlan;`)(window, 300, { stdout: { write() {} } }, { log() {} });
  const plan = buildPlans(h.layout()).find(p => p.id === 'anim-startup');
  const originalActions = JSON.stringify(plan.actions), authoredFrames = plan.frames;
  const trace = await runPlan({ evaluate: (fn, arg) => fn(arg) }, plan);
  const calibration = trace.idleCalibration;
  assert.equal(JSON.stringify(plan.actions), originalActions);
  assert.equal(plan.frames, authoredFrames, 'the authored plan must not be mutated');
  assert.equal(trace.frames, 1800);
  assert.equal(gameplayFrames, 1800, 'calibration must not consume observation frames');
  assert.equal(trace.columns.emotion.length, 1800);
  assert.equal(calibration.columns.emotion.length, 300);
  assert.equal(calibration.completedFrames, 300);
  assert.equal(calibration.dtMs, 1000 / 60);
  assert.equal(calibration.attacks, 0);
  assert.equal(calibration.activeSamples, 0);
  assert.equal(calibration.attackStateSamples, 0);
  assert.equal(calibration.errors.length, 0);
  assert.equal(trace.failedActions.length, 0);
  assert.equal(trace.events.filter(e => e.name === 'frame-error').length, 0);
  assert.equal(spawned, 3);
  assert.equal(resets, 3, 'each actual spawned entity must receive its ordinary reset after calibration');
  assert.equal(manager.spawn, spawnWrapper, 'temporary argument recorder must be removed');
  assert.equal(aiCalls, (1800 - 6) * 3, 'AI may advance only in the gameplay phase');
  assert.equal(animationCalls, aiCalls + 300 * 3, 'every calibration step must use real Enemy animation');
  const eligible = calibration.subjects.map(subject => {
    const observed = calibration.observationSubjects.find(s => s.enemy === subject.enemy);
    assert.equal(subject.rig, observed.rig);
    assert.equal(subject.archetype, observed.archetype);
    assert.equal(subject.rigScale, observed.rigScale);
    assert.equal(subject.spawn.alerted, true);
    assert.ok(Number.isInteger(subject.spawn.seed));
    return calibration.columns.emotion.flat().filter(r => r[0] === subject.enemy && r[6] === 1).length;
  });
  assert.ok(eligible.every(n => n >= 30), 'this real-Rig fixture must yield independently qualified idle samples');
  const metric = animStartup(trace)[0];
  let windows = 0;
  const active = new Map();
  for (const rows of trace.columns.emotion) for (const row of rows) {
    if (row[3] === 1 && !active.get(row[0])) windows++;
    active.set(row[0], row[3] === 1);
  }
  assert.equal(metric.measured.attacks, windows, 'every observed active window must be retained');
  assert.equal(metric.measured.uncalibratedAttacks, 0);
  results.startupCalibrationPipeline = { cosmeticSeed: 0x2f19, authoredFrames, observationFrames: trace.frames, calibrationFrames: 300,
    spawned, ordinaryResetsAfterCalibration: resets, calibrationAttacks: 0, aiCallsDuringCalibration: 0,
    eligibleSamplesPerRig: eligible, observedAttacks: windows, metricVerdict: metric.verdict,
    shortestStartupMs: metric.measured.shortestStartupMs };
  manager.dispose();
} catch (error) { failures.push(`startupCalibrationPipeline: ${error.message}`); }
finally { Math.random = cosmeticRandom; }

function measureMoves(lod, dt) {
  const measured = [];
  const trace = { stateNames: [], columns: { emotion: [] } };
  for (const key of Object.keys(ARCHETYPES)) {
    for (const move of ARCHETYPES[key].moveList) {
      const ctx = context();
      const e = new Enemy(ctx, key, managerStub());
      e.buildVisual(Rig);
      e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false });
      e.ai.update = () => {};
      e.ai.rand = () => 1;
      e.setLOD(lod);
      e.rig._breath = 0;
      e.rig._swayPhase = 0;
      e._breathPhase = 0;
      e._idleTimer = 999;
      const prev = new Vector3();
      const hand = new Vector3();
      const rows = [];
      const handBone = e.rig.bones.hand_r;
      handBone.getWorldPosition(prev);
      ctx.enemies = { list: [e] };
      const probe = motionProbe(trace.stateNames), probeOutput = { emotion: [] };
      let time = 0;
      function step() {
        time += dt;
        ctx.engine.elapsed = time;
        e.update(dt, time, 2);
        handBone.getWorldPosition(hand);
        assert.ok(finite(hand) && finite(e.position) && finite(e.weapon.bladeTip));
        const d = hand.distanceTo(prev);
        prev.copy(hand);
        probe(ctx, probeOutput);
        const row = probeOutput.emotion.at(-1)[0];
        rows.push(row);
        if (dt === 1 / 60) trace.columns.emotion.push([row]);
        return d;
      }
      // A fixed, independently sampled idle floor prevents attack motion raising
      // its own onset threshold in this focused mechanism check.
      for (let f = 0; f < Math.round(2 / dt); f++) step();
      const idle = rows.slice(-Math.round(1 / dt)).map(r => r[1]).sort((a, b) => a - b);
      const floor = idle[Math.floor(idle.length / 2)];
      const attackRows = [];
      const windows = [];
      let active = false;
      e._beginMove(move);
      const knownMarkers = e._markerDriven;
      for (let f = 0; f < Math.ceil((move.total + 0.15) / dt); f++) {
        const displacement = step();
        attackRows.push(displacement);
        if (e.weapon.active !== active) windows.push({ frame: f + 1, ms: Math.round((f + 1) * dt * 1000), active: e.weapon.active });
        active = e.weapon.active;
      }
      const opened = windows.filter(w => w.active);
      const firstMotion = attackRows.findIndex(d => d > Math.max(floor * 3, 1e-5));
      const firstActiveMs = opened[0]?.ms ?? null;
      const observedStartupMs = firstMotion < 0 || firstActiveMs === null ? null
        : Math.round((opened[0].frame - firstMotion - 1) * dt * 1000);
      const activeIndex = opened[0] ? opened[0].frame - 1 : -1;
      let continuousStart = activeIndex;
      while (continuousStart > 0 && attackRows[continuousStart - 1] > floor * 3) continuousStart--;
      measured.push({
        move: `${key}:${move.id}`, knownMarkers, windows, firstMotionMs: firstMotion < 0 ? null : Math.round((firstMotion + 1) * dt * 1000),
        visibleStartupMs: observedStartupMs, authoredStartupMs: Math.round(move.startup * 1000),
        firstActiveErrorMs: firstActiveMs === null ? null : firstActiveMs - Math.round(move.startup * 1000),
        idleHandFloorM: floor,
        continuousPreActiveMotionMs: activeIndex < 0 ? null : Math.round((activeIndex - continuousStart) * dt * 1000),
        lastPreActiveDisplacementsM: activeIndex < 0 ? [] : attackRows.slice(Math.max(0, activeIndex - 12), activeIndex).map(d => +d.toFixed(5)),
      });
      if (!measureOnly) {
        assert.equal(opened.length, move.feint ? 0 : 1, `${key}:${move.id} unexpected damage-window count`);
        assert.equal(active, false, `${key}:${move.id} never closed`);
        if (!move.feint) {
          assert.ok(knownMarkers, `${key}:${move.id} lost marker ownership`);
          assert.ok(Math.abs(firstActiveMs / 1000 - move.startup) <= dt + 1e-7,
            `${key}:${move.id} damage start drifted from authored startup`);
          assert.ok(observedStartupMs >= 140, `${key}:${move.id} only ${observedStartupMs} ms of first-motion lead`);
        }
      }
      e.dispose();
    }
  }
  const existingStartupMetric = dt === 1 / 60 ? animStartup(trace)[0] : null;
  if (!measureOnly && existingStartupMetric) {
    assert.equal(existingStartupMetric.verdict, 'pass', 'the actual probe must retain every calibrated real-Rig attack');
    assert.equal(existingStartupMetric.measured.attacks, measured.filter(m => m.firstActiveErrorMs !== null).length);
    assert.equal(existingStartupMetric.measured.uncalibratedAttacks, 0);
  }
  return { lod, dt, moves: measured, existingStartupMetric };
}

check('moves60Hz', () => measureMoves(0, 1 / 60));
check('moves30Hz', () => measureMoves(1, 1 / 30));
check('clampedDtFinite', () => {
  let checked = 0;
  for (const key of Object.keys(ARCHETYPES)) {
    const ctx = context();
    const e = new Enemy(ctx, key, managerStub());
    e.buildVisual(Rig);
    e.reset(new Vector3(0, FLOOR, 0), { faceTarget: false });
    e.ai.update = () => {};
    e.ai.rand = () => 1;
    for (let f = 0; f < 240; f++) {
      if (f % 16 === 0) e._beginMove(e.def.moveList[Math.floor(f / 16) % e.def.moveList.length]);
      e.update(0.25, f * 0.25, 2);
      assert.ok(finite(e.position) && finite(e.forward) && finite(e.weapon.bladeTip));
      for (const bone of e.rig.boneList) assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
      checked++;
    }
    e.dispose();
  }
  return { clampedFrames: checked, nonFiniteExports: 0 };
});

const output = {};
for (const [name, result] of Object.entries(results)) {
  if (details || !result.moves) { output[name] = result; continue; }
  const damaging = result.moves.filter(m => m.firstActiveErrorMs !== null);
  output[name] = {
    lod: result.lod, dt: result.dt, moves: result.moves.length,
    damagingMoves: damaging.length,
    damageWindows: damaging.reduce((n, m) => n + m.windows.filter(w => w.active).length, 0),
    minimumFirstMotionLeadMs: Math.min(...damaging.map(m => m.visibleStartupMs)),
    maximumAuthoredStartupErrorMs: Math.max(...damaging.map(m => Math.abs(m.firstActiveErrorMs))),
    existingStartupMetric: result.existingStartupMetric ? {
      verdict: result.existingStartupMetric.verdict,
      attacks: result.existingStartupMetric.measured.attacks,
      uncalibratedAttacks: result.existingStartupMetric.measured.uncalibratedAttacks,
      shortestStartupMs: result.existingStartupMetric.measured.shortestStartupMs,
      medianStartupMs: result.existingStartupMetric.measured.medianStartupMs,
    } : null,
  };
}
console.log(JSON.stringify({ measurement: 'pure-node Enemy + real Rig; not a rendered interaction capture', results: output, failures }, null, 2));
if (failures.length) process.exitCode = 1;
