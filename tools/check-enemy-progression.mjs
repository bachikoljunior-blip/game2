import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { EnemyManager } from '../src/gameplay/Enemy.js';
import { EventBus } from '../src/core/EventBus.js';
import { Level } from '../src/world/Level.js';
import { WORLD } from '../src/world/Constants.js';

// Contract-level companion to enemy-progression-capture.mjs. This runs the real
// Level encounter sequencer and EnemyManager, omitting only rendering and player
// locomotion. The browser check covers those two omitted boundaries.
const floor = WORLD.PLATEAU_HEIGHT;
const events = [];
const ctx = {
  scene: new Group(),
  quality: { tier: 1, maxEnemies: 6 },
  engine: { elapsed: 0 },
  terrain: { heightAt: () => floor },
  bus: new EventBus(),
  player: {
    position: new Vector3(0, floor, 73),
    forward: new Vector3(0, 0, -1),
    isAlive: true,
  },
};
ctx.bus.on('objective', (data) => events.push({ name: 'objective', data }));

const level = ctx.level = new Level(ctx);
level._probeGround();
level._applyQualityKnobs(ctx.quality);
level._buildSpawnPoints();
level._built = true;
level._foliageBound = true;
const enemies = ctx.enemies = new EnemyManager(ctx);
enemies.maxEnemies = 6;

const spawnCalls = [];
const spawn = enemies.spawn.bind(enemies);
enemies.spawn = (...args) => {
  spawnCalls.push(args);
  return spawn(...args);
};
const tick = (dt = 0.25) => {
  ctx.engine.elapsed += dt;
  level.update(dt, ctx.engine.elapsed, dt);
};

level._advanceEncounter(0);
tick();
assert.equal(level._enc.active.id, 'gate');
ctx.player.position.z = 47;
tick();
tick();
assert.equal(level._enc.active.id, 'forecourt');
ctx.player.position.z = 42;
for (let i = 0; i < 5; i++) tick();

assert.equal(enemies.aliveCount, 2, 'normal forecourt progression must create the first pair');
assert.deepEqual(enemies.list.map((enemy) => enemy.archetype), ['ashigaru', 'ashigaru']);
assert.equal(spawnCalls.length, 2);
for (let i = 0; i < spawnCalls.length; i++) {
  const [archetype, position, options] = spawnCalls[i];
  const pointId = i === 0 ? 'torii_c' : 'torii_l';
  const authored = level.spawnPoints.byId.get(pointId).position;
  assert.equal(archetype, 'ashigaru');
  assert.equal(options.spawnPoint, pointId);
  assert.equal(options.alerted, true);
  assert.equal(position.distanceTo(authored), 0, `${pointId} must retain its authored position`);
}

// A full quality-tier pool must retain the next authored arrival and deliver it
// once capacity returns, rather than silently dropping the wave.
enemies.maxEnemies = 2;
level._spawnEnemy('ronin', 'east');
assert.equal(level.spawnQueue.length, 1);
level._enc.waveIndex = level._enc.active.waves.length;
level._enc.t = 99;
enemies.despawnAll();
tick();
assert.equal(level.spawnQueue.length, 0);
assert.equal(level._enc.active.id, 'forecourt', 'a queued enemy must block premature encounter completion');
assert.equal(enemies.list.at(-1).archetype, 'ronin');
assert.equal(enemies.list.at(-1).position.distanceTo(level.spawnPoints.byId.get('east').position), 0);

console.log(JSON.stringify({
  status: 'PASS',
  scope: 'Real Level encounter sequencer and EnemyManager; no renderer or physical device.',
  normalProgression: ['arrival', 'gate', 'forecourt'],
  firstWave: spawnCalls.slice(0, 2).map(([archetype, position, options]) => ({
    archetype, spawnPoint: options.spawnPoint, position: position.toArray(),
  })),
  tierOverflowDelivered: true,
  queuedArrivalBlockedPrematureClear: true,
  objectiveEvents: events.filter((event) => event.name === 'objective').length,
}, null, 2));

enemies.dispose();
