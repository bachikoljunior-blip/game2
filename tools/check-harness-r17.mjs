import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Scene, Vector3 } from 'three';
import { Input } from '../src/core/Input.js';
import { EventBus } from '../src/core/EventBus.js';
import { Player } from '../src/gameplay/Player.js';
import { CombatDirector } from '../src/gameplay/Combat.js';
import { Level } from '../src/world/Level.js';
import { buildPlans } from './interaction-scenarios.mjs';

const source = readFileSync(new URL('./harness/runtime.js', import.meta.url), 'utf8');
const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

class Target {
  constructor() { this.listeners = new Map(); this.seen = []; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter((f) => f !== fn)); }
  dispatchEvent(e) { this.seen.push(e); for (const fn of this.listeners.get(e.type) || []) fn(e); return true; }
}
class DomEvent {
  constructor(type, opts) { this.type = type; Object.assign(this, opts); }
  preventDefault() {}
}

function fixture() {
  const window = new Target(), canvas = new Target(), document = new Target();
  window.innerWidth = 844; window.innerHeight = 390;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  document.getElementById = (id) => id === 'game-canvas' ? canvas : null;
  const performance = { now: () => 1000 };
  globalThis.window = window; globalThis.document = document;
  Object.defineProperty(globalThis, 'performance', { value: performance, configurable: true });
  const input = new Input(canvas);
  const guardRect = { x: 620, y: 285, w: 78, h: 78 };
  input.registerZone('guard', () => guardRect, 'hold');
  // A valid UI may cover the old hard-coded centre. The harness must find a
  // gesture origin without silently turning camera gestures into HUD presses.
  input.registerZone('special', () => ({ x: 580, y: 125, w: 80, h: 80 }), 'press');
  const ctx = {
    input, bus: new EventBus(), scene: new Scene(), quality: {},
    terrain: { heightAt: () => 812 },
    engine: { frame: 0, elapsed: 0, paused: false, setTimeScale() {} },
    playerCamera: { yaw: 0, enabled: true, lockTarget: null, snap() { this.yaw = ctx.player.yaw; } },
    physics: {
      raycastDown: () => ({ hit: true, point: new Vector3(0, 812, 0) }),
      raycast(origin, dir) { ctx.lastClearance = { ...dir }; return { hit: false }; },
    },
    enemies: {
      list: [],
      despawnAll() { this.list.length = 0; },
      spawnWave(count) {
        for (let i = 0; i < count; i++) this.list.push({ id: 9000 + i, faction: 'oni', isAlive: true, state: 'idle', position: ctx.player.position.clone().add(new Vector3(i, 0, -4)) });
      },
      alertAll() {},
    },
  };
  ctx.player = new Player(ctx);
  ctx.player.respawn(new Vector3(0, 812, 26));
  ctx.combat = new CombatDirector(ctx);
  ctx.level = new Level(ctx);
  ctx.level._bellInteractPos = new Vector3(14.2, 813.25, 29.3);
  ctx.level._buildInteractables();
  const near = { id: 7, faction: 'oni', isAlive: true, state: 'idle', position: new Vector3(0, 812, 24.6) };
  ctx.enemies.list.push(near);
  ctx.test = { telegraph() { ctx.bus.emit('telegraph', { entity: near, kind: 'parryable', duration: 0.55 }); } };
  window.__kagerou = ctx;
  const sandbox = { window, document, performance, PointerEvent: DomEvent, KeyboardEvent: DomEvent, setTimeout, console };
  vm.runInNewContext(source, sandbox, { filename: 'tools/harness/runtime.js' });
  const h = window.__kh;
  h.lock();
  const frames = [];
  window.requestAnimationFrame(function step() {
    ctx.engine.frame++;
    input.update();
    ctx.level._tickInteraction(1 / 60);
    frames.push({ f: h.frame, guard: input.state.guard, mag: input.state.moveMag, pressed: [...input.state.pressed] });
    input.endFrame();
    window.requestAnimationFrame(step);
  });
  return { ctx, h, canvas, window, input, near, frames, guardRect };
}

function plan(actions, frames = 130, probes = []) {
  return { id: 'pure-harness-check', actions, frames, probes, render: false };
}

const evidence = {};
try {
  const first = fixture();
  const layout = first.h.layout();
  assert.equal(layout.gestureSafe, true);
  for (const dx of [-30, 0, 30]) for (const dy of [-20, 0, 20]) {
    assert.equal(first.input._hitZone(layout.gestureCentre.x + dx, layout.gestureCentre.y + dy), null);
  }
  const plans = buildPlans(layout);
  const encounter = plans.find((p) => p.id === 'encounters');
  assert.equal(encounter.conditions.encounterCount, 20);
  assert.equal(encounter.conditions.maxEncounterSeconds, 30);
  assert.equal(encounter.actions.filter((a) => a.do === 'resetEncounter').length, 20);
  assert.equal(encounter.actions.filter((a) => a.do === 'mark' && a.label.startsWith('encounter:')).length, 20);
  assert.equal(encounter.actions.filter((a) => a.do === 'set' && a.target === 'player').length, 0);
  const reversal = plans.find((p) => p.id === 'move-reversal');
  assert.equal(reversal.conditions.moveMag, 0.92);
  assert.equal(reversal.actions.find((a) => a.do === 'teleport').yaw, -Math.PI / 2);
  evidence.plans = { encounters: 20, secondsEach: 30, resets: 20, reversalMag: 0.92, eastYaw: -Math.PI / 2, gestureCentre: layout.gestureCentre };

  const facingDots = [];
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const t = fixture();
    t.ctx.playerCamera.yaw = yaw;
    t.near.position.copy(t.ctx.player.position).add(new Vector3(4, 0, 3));
    t.h.begin(plan([{ f: 0, do: 'bot', on: true, policy: 'aggressive' }], 1));
    t.h.advance(1);
    t.ctx.player._locomotion(1 / 60, t.input.state, 1);
    const desired = t.near.position.clone().sub(t.ctx.player.position).normalize();
    const dot = t.ctx.player.moveDir.dot(desired);
    assert.ok(dot > 0.999999, `bot must approach target at camera yaw ${yaw}`);
    assert.ok(Math.abs(t.input.state.moveMag - 0.92) < 1e-10);
    facingDots.push(dot);
    t.h.finish();
  }
  evidence.approach = { testedCameraYaws: 4, minimumDirectionDot: Math.min(...facingDots), moveMag: 0.92 };

  const cue = fixture();
  cue.h.begin(plan([
    { f: 0, do: 'bot', on: true },
    { f: 0, do: 'call', target: 'test', method: 'telegraph' },
    { f: 70, do: 'call', target: 'test', method: 'telegraph' },
  ]));
  cue.h.advance(130);
  const cueTrace = cue.h.finish();
  const reactions = cueTrace.events.filter((e) => e.name === 'bot-reaction');
  assert.equal(reactions.length, 2);
  assert.ok(reactions.every((e) => e.reactionFrames >= 12));
  assert.equal(cue.canvas.seen.filter((e) => e.type === 'pointerdown' && e.pointerId === 81).length, 2);
  assert.equal(cueTrace.events.filter((e) => e.name === 'harness-error').length, 0);
  assert.equal(cue.input._pointers.size, 0);
  assert.equal(cue.input.state.guard, false);
  evidence.cues = { emitted: 2, reactions: reactions.length, responseFrames: reactions.map((e) => e.reactionFrames), guardPresses: 2, duplicatePointers: 0 };

  const reset = fixture();
  reset.ctx.player.isAlive = false; reset.ctx.player.health = 0; reset.ctx.player.state = 'dead';
  reset.ctx.level.spawnQueue.push({ stale: true });
  reset.h.begin(plan([
    { f: 0, do: 'keyDown', code: 'KeyW' },
    { f: 0, do: 'touchDown', id: 81, x: reset.guardRect.x + 10, y: reset.guardRect.y + 10 },
    { f: 1, do: 'resetEncounter', x: 0, z: 26, yaw: -Math.PI / 2 },
    { f: 2, do: 'clearance', yaw: -Math.PI / 2 },
  ], 3));
  reset.h.advance(3);
  assert.equal(reset.ctx.player.isAlive, true);
  assert.equal(reset.ctx.player.health, reset.ctx.player.maxHealth);
  assert.equal(reset.ctx.player.state, 'sheathed');
  assert.equal(reset.ctx.player.position.x, 0); assert.equal(reset.ctx.player.position.z, 26);
  assert.equal(reset.input._pointers.size, 0); assert.equal(reset.input._keys.size, 0);
  assert.equal(reset.input.state.guard, false); assert.equal(reset.ctx.level.spawnQueue.length, 0);
  assert.ok(reset.ctx.lastClearance.x > 0.999999);
  evidence.reset = { alive: true, health: reset.ctx.player.health, state: reset.ctx.player.state, position: reset.ctx.player.position.toArray(), heldPointers: 0, heldKeys: 0, eastClearanceX: reset.ctx.lastClearance.x };
  reset.h.finish();

  const bell = fixture();
  const bellPlan = buildPlans(bell.h.layout()).find((p) => p.id === 'bell-accident');
  bell.h.begin(bellPlan);
  bell.h.advance(bellPlan.frames);
  const bt = bell.h.finish();
  assert.equal(bt.failedActions.length, 0);
  const setups = bt.events.filter((e) => e.name === 'bell-setup');
  assert.equal(setups.length, 2); assert.ok(setups.every((e) => e.waiting));
  const deliberate = bt.events.find((e) => e.name === 'mark' && e.label === 'deliberate-interact');
  const rings = bt.events.filter((e) => e.name === 'objective' && e.text === '鐘が谷を渡る');
  assert.equal(rings.length, 1); assert.ok(rings[0].f >= deliberate.f);
  assert.equal(bell.ctx.level.interactables.find((it) => it.id === 'bell').used, true);
  evidence.bell = { waitingSetups: 2, accidentalRings: 0, deliberateRings: 1, ringFrame: rings[0].f, authoritativeStrikerUsed: true };
  evidence.scope = 'Pure Node VM with real Input, Player locomotion/respawn, Combat reset and Level interaction; no browser, renderer, AI battle sample, or benchmark victory claim.';
  console.log(JSON.stringify(evidence, null, 2));
  console.log('R17 harness checks passed. New traces identify changed comparison conditions in their conditions field.');
} finally {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, 'performance', originalPerformance);
}
