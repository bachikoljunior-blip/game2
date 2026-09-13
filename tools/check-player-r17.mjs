import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { Input } from '../src/core/Input.js';
import { Player } from '../src/gameplay/Player.js';
import { PlayerCamera } from '../src/gameplay/PlayerCamera.js';
import { CombatDirector } from '../src/gameplay/Combat.js';
import { PhysicsWorld, LAYER_SOLID } from '../src/gameplay/Physics.js';

// These are deterministic controller/geometry fixtures, not rendered device evidence.
const results = { movement: [], collision: [], lockOn: [], combatWindow: null, combatLunge: null };
const round = value => +value.toFixed(4);
function newInput() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  return new Input(new EventTarget());
}

function combatMarkerWindow() {
  const calls = { begin: 0, deferredEnd: 0, immediateEnd: 0 };
  const ctx = {
    quality: {},
    combat: {
      beginSwing(entity, opts) {
        calls.begin++;
        assert.equal(entity, player);
        assert.equal(opts.entity, player);
        assert.equal(opts.move, 'h_r');
        assert.equal(opts.lunge, 1.25);
      },
      endSwingAfterSample(entity) { calls.deferredEnd++; assert.equal(entity, player); },
      endSwing(entity) { calls.immediateEnd++; assert.equal(entity, player); },
    },
  };
  const player = new Player(ctx);
  player.state = 'attack';
  player.sheathed = false;
  player._beginAttack({ key: 'h_r', heavy: false, finisher: false });

  player._onHitActiveStart();
  const afterStart = {
    opened: player.attack.opened,
    active: player.weapon.active,
    trailOpen: player._trailOpen,
    calls: { ...calls },
  };
  player._onHitActiveStart();
  player._onHitActiveEnd();
  const afterEnd = {
    closed: player.attack.closed,
    active: player.weapon.active,
    trailOpen: player._trailOpen,
    calls: { ...calls },
  };
  assert.deepEqual(afterStart, {
    opened: true, active: true, trailOpen: true,
    calls: { begin: 1, deferredEnd: 0, immediateEnd: 0 },
  });
  assert.deepEqual(afterEnd, {
    closed: true, active: false, trailOpen: false,
    calls: { begin: 1, deferredEnd: 1, immediateEnd: 0 },
  });
  return { afterStart, afterEnd };
}

results.combatWindow = combatMarkerWindow();

function lungeFixture({ targetX = 0, targetZ, wallZ = null }) {
  const ctx = { quality: {}, terrain: { heightAt: () => 0 } };
  ctx.physics = new PhysicsWorld(ctx);
  ctx.physics.addStatic({ type: 'box', position: new Vector3(0, -0.25, 0),
    size: new Vector3(30, 0.5, 30) });
  if (wallZ !== null) ctx.physics.addStatic({ type: 'box',
    position: new Vector3(0, 2, wallZ), size: new Vector3(10, 4, 0.2) });
  const player = ctx.player = new Player(ctx);
  player.position.set(0, 0, 0);
  player.grounded = true;
  player.controller = ctx.physics.createCharacter({ radius: player.radius,
    height: player.height, stepHeight: 0.42, slopeLimit: 52, mass: 74 });
  player.controller.position.copy(player.position);
  player.controller.smoothPosition.copy(player.position);
  player.controller.grounded = true;
  player.controller.coyote = 0.1;
  player.bladeBase.set(0, 100, -0.25);
  player.bladeTip.set(0, 100, -0.8);
  const target = { id: 99, faction: 'oni', position: new Vector3(targetX, 0, targetZ),
    forward: new Vector3(0, 0, 1), velocity: new Vector3(), isAlive: true,
    health: 70, maxHealth: 70, posture: 0, maxPosture: 70,
    height: 1.75, radius: 0.4, state: 'idle', weapon: { active: false } };
  ctx.enemies = { list: [target] };
  ctx.combat = new CombatDirector(ctx);
  ctx.combat.update(0, 0, 0);
  player.state = 'attack';
  player.sheathed = false;
  player._beginAttack({ key: 'h_r', heavy: false, finisher: false });
  assert.equal(player._combatLungeTarget, target);
  assert.equal(player._combatLungeRemaining, 1.25);
  player._onHitActiveStart();
  return { ctx, player, target };
}

function movingLunge() {
  const { ctx, player, target } = lungeFixture({ targetZ: -1.6 });
  let minGap = Infinity;
  for (let frame = 0; frame < 2; frame++) {
    // Production order and deltas: Player(0.25) -> Enemy(0.25) -> Combat,
    // whose raw-time windows intentionally cap their own step to 0.1.
    player._integrate(0.25);
    target.position.z -= 3.2 * 0.25;
    ctx.combat.update(0.25, (frame + 1) * 0.25, 0.25);
    minGap = Math.min(minGap, Math.abs(target.position.z - player.position.z));
  }
  return { playerZ: round(player.position.z), targetZ: round(target.position.z),
    gap: round(Math.abs(target.position.z - player.position.z)),
    minGap: round(minGap), remaining: round(player._combatLungeRemaining) };
}

function authoredCap() {
  const { ctx, player } = lungeFixture({ targetZ: -4.6 });
  for (let i = 0; i < 3; i++) ctx.combat.update(0.25, (i + 1) * 0.25, 0.25);
  return { travel: round(Math.abs(player.position.z)), remaining: round(player._combatLungeRemaining) };
}

function wallBlock() {
  const { ctx, player } = lungeFixture({ targetZ: -4, wallZ: -1 });
  for (let i = 0; i < 3; i++) ctx.combat.update(0.25, (i + 1) * 0.25, 0.25);
  return { playerZ: round(player.position.z), remaining: round(player._combatLungeRemaining) };
}

function diagonalWallSlide() {
  const { ctx, player } = lungeFixture({ targetX: 2, targetZ: -4, wallZ: -1 });
  const rec = ctx.combat._records.get(player);
  const rootBefore = player.position.clone();
  const bladeBefore = rec.base.clone();
  ctx.combat.update(0.25, 0.25, 0.25);
  const rootDelta = player.position.clone().sub(rootBefore);
  const bladeDelta = rec.base.clone().sub(bladeBefore);
  return { rootDelta: rootDelta.toArray().map(round), bladeDelta: bladeDelta.toArray().map(round) };
}

results.combatLunge = {
  coarseMoving: movingLunge(),
  cap: authoredCap(),
  wall: wallBlock(),
  diagonalWall: diagonalWallSlide(),
};
assert.ok(results.combatLunge.cap.travel <= 1.2501, JSON.stringify(results.combatLunge.cap));
assert.equal(results.combatLunge.cap.remaining, 0, JSON.stringify(results.combatLunge.cap));
assert.ok(results.combatLunge.wall.playerZ > -0.6, JSON.stringify(results.combatLunge.wall));
assert.equal(results.combatLunge.wall.remaining, 0, JSON.stringify(results.combatLunge.wall));
assert.deepEqual(results.combatLunge.diagonalWall.bladeDelta,
  results.combatLunge.diagonalWall.rootDelta, JSON.stringify(results.combatLunge.diagonalWall));
assert.ok(results.combatLunge.coarseMoving.minGap < 1.25,
  JSON.stringify(results.combatLunge.coarseMoving));

function movement(fps, magnitude, sprint) {
  const ctx = { engine: { frame: 0 }, terrain: { heightAt: () => 812 }, playerCamera: { yaw: 0 } };
  ctx.input = newInput();
  ctx.input.usingTouch = true;
  ctx.input.state.move.set(0, magnitude);
  ctx.input.state.moveMag = magnitude;
  ctx.input.state.run = sprint;
  const player = ctx.player = new Player(ctx);
  player.position.set(0, 812, 0);
  player.sheathed = false;
  player.state = 'idle';
  const dt = 1 / fps;
  const tick = () => {
    ctx.engine.frame++;
    player.update(dt, ctx.engine.frame * dt, dt);
    player.lateUpdate();
  };
  for (let frame = 0; frame < fps; frame++) tick();
  const start = player.position.clone();
  for (let frame = 0; frame < fps; frame++) tick();
  const speed = player.position.distanceTo(start);
  ctx.input.state.move.y *= -1;
  const yaw = player.yaw;
  let responseMs = null, turn90Ms = null, turn180Ms = null;
  for (let frame = 1; frame <= fps; frame++) {
    tick();
    const angle = Math.abs(Math.atan2(Math.sin(player.yaw - yaw), Math.cos(player.yaw - yaw)));
    if (responseMs === null && angle > 1e-5) responseMs = frame * dt * 1000;
    if (turn90Ms === null && angle >= Math.PI * 0.9) turn90Ms = frame * dt * 1000;
    if (turn180Ms === null && angle >= Math.PI - 1e-5) turn180Ms = frame * dt * 1000;
    assert.ok(player.position.toArray().every(Number.isFinite));
  }
  ctx.input.dispose();
  const row = { fps, magnitude, sprint, speed: round(speed), responseMs: round(responseMs),
    turn90Ms: round(turn90Ms), full180Ms: round(turn180Ms) };
  results.movement.push(row);
  return row;
}

for (const fps of [120, 60, 30, 4]) {
  for (const [mag, sprint, authored] of [[0.55, false, 1.9], [0.92, false, 5.4], [1, true, 7.2]]) {
    const row = movement(fps, mag, sprint);
    assert.ok(Math.abs(row.speed - authored) <= authored * 0.05, JSON.stringify(row));
    if (mag === 0.92) {
      assert.ok(row.full180Ms <= 250, JSON.stringify(row));
      if (fps >= 30) assert.ok(row.responseMs <= 100, JSON.stringify(row));
    }
  }
}

function cameraContext(aspect = 844 / 390) {
  const ctx = { camera: new PerspectiveCamera(58, aspect, 0.12, 900),
    input: { state: { look: new Vector2() } },
    player: { position: new Vector3(0, 812, 0), yaw: 0, height: 1.75, radius: 0.34, speed: 0, isAlive: true } };
  ctx.physics = new PhysicsWorld(ctx);
  ctx.playerCamera = new PlayerCamera(ctx);
  ctx.playerCamera.resize(aspect * 390, 390);
  return ctx;
}

function wall(ctx, x, z, sx, sz) {
  ctx.physics.addStatic({ type: 'box', position: new Vector3(x, 814, z), size: new Vector3(sx, 8, sz) });
}

for (const shape of ['back-wall', 'shoulder-wall', 'pillar', 'shake-wall', 'downward-floor']) {
  const ctx = cameraContext(), pc = ctx.playerCamera;
  if (shape === 'shoulder-wall') {
    wall(ctx, 2, 0, 0.4, 30);
    ctx.player.position.set(-5, 812, 0);
  } else if (shape === 'pillar') {
    wall(ctx, 0.44, 2.8, 0.6, 0.6);
    pc.yaw = ctx.player.yaw = -1.2;
  } else if (shape === 'downward-floor') {
    ctx.physics.addStatic({ type: 'box', position: new Vector3(0, 811.75, 0), size: new Vector3(30, 0.5, 30) });
    pc.pitch = -0.7;
  } else {
    wall(ctx, 0, 2, 30, 0.4);
    ctx.player.position.z = -5;
  }
  let phase = 0;
  if (shape === 'shake-wall') ctx.fx = { getShakeOffset(pos, quat) {
    pos.set(Math.sin(phase) * 0.16, 0, 0.16); quat.identity(); return true;
  } };
  pc.snap();
  let overlaps = ctx.physics.overlapSphere(ctx.camera.position, ctx.camera.near * 1.05, LAYER_SOLID) > 0 ? 1 : 0;
  let worstJump = 0;
  const previous = ctx.camera.position.clone();
  for (let frame = 0; frame < 180; frame++) {
    phase = frame * 0.3;
    if (shape === 'back-wall' || shape === 'shake-wall') ctx.player.position.z = Math.min(1.4, -5 + frame * 0.09);
    if (shape === 'shoulder-wall') ctx.player.position.x = Math.min(1.4, -5 + frame * 0.09);
    if (shape === 'pillar') pc.yaw = -1.2 + frame / 179 * 2.4;
    pc.update(1 / 60, frame / 60, 1 / 60);
    overlaps += ctx.physics.overlapSphere(ctx.camera.position, ctx.camera.near * 1.05, LAYER_SOLID) > 0 ? 1 : 0;
    worstJump = Math.max(worstJump, ctx.camera.position.distanceTo(previous));
    previous.copy(ctx.camera.position);
    assert.ok(ctx.camera.position.toArray().every(Number.isFinite));
  }
  results.collision.push({ shape, frames: 181, overlaps, worstJumpM: round(worstJump) });
  assert.equal(overlaps, 0, shape);
  assert.ok(worstJump <= 1.5, shape);
}

function screenPoint(ctx, entity, height, side = 0) {
  const p = entity.position.clone(); p.y += height;
  if (side) p.add(new Vector3(side, 0, 0).applyQuaternion(ctx.camera.quaternion));
  return p.project(ctx.camera);
}
const within = (point, margin) => Math.abs(point.x) <= margin && Math.abs(point.y) <= margin && point.z >= -1 && point.z < 1;
function bodyWithin(ctx, e, margin) {
  return [[0.08, 0], [e.height, 0], [e.height * 0.55, e.radius], [e.height * 0.55, -e.radius]]
    .every(([height, side]) => within(screenPoint(ctx, e, height, side), margin));
}

for (const aspect of [844 / 390, 390 / 844]) for (const corner of [false, true]) {
  const ctx = cameraContext(aspect), pc = ctx.playerCamera;
  ctx.player.position.set(1.4, 812, 1.4);
  const target = { id: 99, position: new Vector3(1.4, 812, -2.6), height: 2.15, radius: 0.45, isAlive: true, faction: 'oni' };
  ctx.enemies = { list: [target] };
  if (corner) { wall(ctx, 0, 2, 30, 0.4); wall(ctx, 2, 0, 0.4, 30); }
  ctx.input = newInput();
  pc.snap();
  const key = new Event('keydown', { cancelable: true });
  Object.defineProperty(key, 'code', { value: 'KeyQ' });
  window.dispatchEvent(key);
  let locked = 0, centralCenters = 0, centralBodies = 0, targetOff = 0, overlaps = 0, worstJump = 0;
  const previous = ctx.camera.position.clone();
  for (let frame = 0; frame < 840; frame++) {
    ctx.input.update();
    pc.update(1 / 60, frame / 60, 1 / 60);
    ctx.input.endFrame();
    if (pc.lockTarget === target) {
      locked++;
      if (within(screenPoint(ctx, ctx.player, ctx.player.height * 0.55), 0.8) && within(screenPoint(ctx, target, target.height * 0.55), 0.8)) centralCenters++;
      if (bodyWithin(ctx, ctx.player, 0.8) && bodyWithin(ctx, target, 0.8)) centralBodies++;
      if (!within(screenPoint(ctx, target, target.height * 0.55), 1)) targetOff++;
    }
    overlaps += ctx.physics.overlapSphere(ctx.camera.position, ctx.camera.near * 1.05, LAYER_SOLID) > 0 ? 1 : 0;
    worstJump = Math.max(worstJump, ctx.camera.position.distanceTo(previous));
    previous.copy(ctx.camera.position);
  }
  ctx.input.dispose();
  const row = { aspect: round(aspect), corner, lockedFrames: locked,
    centersCentral: centralCenters, bodiesCentral: centralBodies, targetOff, overlaps, worstJumpM: round(worstJump) };
  results.lockOn.push(row);
  assert.equal(locked, 840, JSON.stringify(row));
  assert.ok(centralCenters / locked >= 0.95, JSON.stringify(row));
  assert.ok(centralBodies / locked >= 0.95, JSON.stringify(row));
  assert.equal(targetOff, 0, JSON.stringify(row));
  assert.equal(overlaps, 0, JSON.stringify(row));
  assert.ok(worstJump <= 1.5, JSON.stringify(row));
}

console.log(JSON.stringify(results, null, 2));
