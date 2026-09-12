import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { Level, LAYOUT } from '../src/world/Level.js';
import { Player } from '../src/gameplay/Player.js';
import { PhysicsWorld } from '../src/gameplay/Physics.js';
import { Input } from '../src/core/Input.js';

// Integration regression: real Level placement -> Player.init -> capsule/input.
// The flat terrain and absent render-only rig keep this a Node contract test;
// the production-browser check separately exercises the authored mountain.
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
const ctx = {
  scene: new Scene(), engine: { frame: 0 }, playerCamera: { yaw: 0 },
  terrain: { heightAt: () => 812, normalAt: () => new Vector3(0, 1, 0) },
};
ctx.input = new Input(new EventTarget());
ctx.level = new Level(ctx);
ctx.level._buildSpawnPoints();
ctx.physics = new PhysicsWorld(ctx);
await ctx.physics.init();
ctx.player = new Player(ctx);
ctx.player._createRig = async () => {}; // only the rendered body is omitted
await ctx.player.init();
const expected = ctx.level.spawnPoints.player.position;
const initial = ctx.player.position.toArray();
console.log(JSON.stringify({ authoredSpawn: expected.toArray(), actualSpawn: initial }));
assert.equal(ctx.player.position.distanceTo(expected), 0, 'new game must use the authored approach spawn');
assert.equal(ctx.player.controller.position.distanceTo(expected), 0, 'capsule and player must agree at boot');
assert.equal(ctx.player.yaw, ctx.level.spawnPoints.player.yaw);
assert.ok(Math.abs(initial[2] - LAYOUT.haiden.z) > LAYOUT.haiden.d / 2,
  'new game must not start inside the haiden footprint');

function key(type, code) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  window.dispatchEvent(event);
}
key('keydown', 'KeyW');
for (let frame = 0; frame < 120; frame++) {
  ctx.engine.frame++;
  ctx.input.update();
  ctx.player.update(1 / 60, ctx.engine.frame / 60, 1 / 60);
  ctx.input.endFrame();
}
key('keyup', 'KeyW');
const afterWalk = ctx.player.position.toArray();
assert.ok(initial[2] - afterWalk[2] > 5, 'forward input must leave the start by more than 5 m');
assert.ok(afterWalk.every(Number.isFinite));
ctx.player.respawn(); // the existing main menu's restart path
assert.equal(ctx.player.position.distanceTo(expected), 0, 'retry must return to the same safe spawn');
assert.equal(ctx.player.controller.position.distanceTo(expected), 0, 'retry must reset the capsule too');
ctx.input.dispose();
console.log(JSON.stringify({ status: 'PASS', initial, afterWalk, retry: ctx.player.position.toArray() }));
