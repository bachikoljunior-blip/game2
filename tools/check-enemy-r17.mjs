/** Focused Enemy regressions. Real rigs, pure Node; no browser or renderer. */
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Enemy, EnemyManager, ARCHETYPES } from '../src/gameplay/Enemy.js';
import { PhysicsWorld } from '../src/gameplay/Physics.js';
import { Rig } from '../src/anim/Rig.js';
import { EventBus } from '../src/core/EventBus.js';
import { WORLD } from '../src/world/Constants.js';
import { animStartup } from './interaction-metrics.mjs';

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
      let time = 0;
      function step() {
        time += dt;
        ctx.engine.elapsed = time;
        e.update(dt, time, 2);
        handBone.getWorldPosition(hand);
        assert.ok(finite(hand) && finite(e.position) && finite(e.weapon.bladeTip));
        const d = hand.distanceTo(prev);
        prev.copy(hand);
        let state = trace.stateNames.indexOf(e.state);
        if (state < 0) { state = trace.stateNames.length; trace.stateNames.push(e.state); }
        const row = [e.id, +d.toFixed(5), state, e.weapon.active ? 1 : 0, +e.attackTime.toFixed(5)];
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
  return { lod, dt, moves: measured, existingStartupMetric: dt === 1 / 60 ? animStartup(trace)[0] : null };
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
    existingStartupMetric: result.existingStartupMetric,
  };
}
console.log(JSON.stringify({ measurement: 'pure-node Enemy + real Rig; not a rendered interaction capture', results: output, failures }, null, 2));
if (failures.length) process.exitCode = 1;
