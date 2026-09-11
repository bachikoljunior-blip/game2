import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Group, Vector3 } from 'three';
import { CombatDirector, TUNING } from '../src/gameplay/Combat.js';
import { Enemy, EnemyManager } from '../src/gameplay/Enemy.js';
import { Player } from '../src/gameplay/Player.js';
import { EventBus } from '../src/core/EventBus.js';

const baselineSource = execFileSync('git', ['show', '4e6d23a:src/gameplay/Combat.js'], { encoding: 'utf8' })
  .replace("from 'three'", `from '${pathToFileURL(resolve('node_modules/three/build/three.module.js')).href}'`);
const { CombatDirector: BaselineCombat } = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);

function fixture(Director = CombatDirector, archetype = 'ashigaru') {
  const events = [];
  const bus = new EventBus();
  const root = new Group();
  const player = {
    id: 1, faction: 'player', root, position: root.position,
    forward: new Vector3(0, 0, -1), velocity: new Vector3(),
    health: 100, maxHealth: 100, posture: 0, maxPosture: 100,
    radius: 0.34, height: 1.75, state: 'idle', isAlive: true,
    invulnerable: false, weapon: { active: false, damage: 16, length: 1 },
  };
  const ctx = {
    player, bus, quality: {},
    engine: { elapsed: 0, timeScale: 1, setTimeScale(scale) { this.timeScale = scale; } },
  };
  ctx.combat = new Director(ctx);
  ctx.enemies = new EnemyManager(ctx);
  ctx.enemies._subscribe();
  const enemy = new Enemy(ctx, archetype, ctx.enemies);
  enemy.active = true;
  enemy.aware = 2;
  enemy.position.set(0, 0, -1.7);
  enemy.forward.set(0, 0, 1);
  ctx.enemies.list.push(enemy);
  for (const name of ['hit', 'parry', 'posture-break', 'death', 'execution']) {
    bus.on(name, (p) => events.push({ name, time: ctx.combat.time, entity: p.entity?.id, attacker: p.attacker?.id, victim: p.victim?.id, phase: p.phase, perfect: p.perfect }));
  }
  return { ctx, combat: ctx.combat, enemy, player, events };
}

function regenDuringEnemyLock(Director) {
  const { combat, enemy, player } = fixture(Director);
  // Capability is explicit even when running the baseline director against the
  // repaired entity: the comparison isolates Combat's handling of that contract.
  enemy.managesPostureRegen = true;
  combat.update(1 / 60, 0, 1 / 60);
  combat.applyDamage(player, enemy, 10, { ignoreDefence: true, poise: 0 });
  const afterHit = enemy.posture;
  for (let f = 0; f < 60; f++) {
    enemy._tickTimers(1 / 60);
    combat.update(1 / 60, 0, 1 / 60);
  }
  return { afterHit, afterOneSecond: enemy.posture, lockRemaining: enemy.postureLocked };
}

function firstContactClassification(Director) {
  const { combat, enemy, player } = fixture(Director, 'ronin');
  combat.applyDamage(player, enemy, 40, { ignoreDefence: true, poise: 0 });
  const afterHit = enemy.posture;
  combat.addPosture(enemy, 10);
  return { afterHit, afterPressure: enemy.posture, mode: combat._records.get(enemy).postureMode };
}

function playerRewardRecovery(Director) {
  const { combat, player, enemy } = fixture(Director);
  player.managesPostureRegen = false;
  combat.addPosture(player, 40);
  Player.prototype.onKill.call(player, enemy);
  const afterReward = player.posture;
  for (let f = 0; f < 60; f++) combat.update(1 / 60, 0, 1 / 60);
  return { afterReward, afterOneSecond: player.posture };
}

function parryResolution(late) {
  const { combat, enemy, player, events } = fixture();
  combat.update(1 / 60, 0, 1 / 60);
  const initial = enemy.posture;
  combat.requestParry(player);
  if (late) combat.time += TUNING.PARRY_PERFECT * combat.diff.parryScale + 0.025;
  combat.applyDamage(enemy, player, 15);
  return {
    attackerPressure: initial - enemy.posture,
    playerHealth: player.health,
    parries: events.filter((e) => e.name === 'parry').length,
    perfect: events.find((e) => e.name === 'parry')?.perfect,
  };
}

function pressureFinisher() {
  const { combat, enemy, player, events } = fixture();
  combat.update(1 / 60, 0, 1 / 60);
  for (let i = 0; i < 2; i++) {
    combat.requestParry(player);
    combat.applyDamage(enemy, player, 15);
    if (i === 0) combat.time += TUNING.PARRY_RECOVERY + 0.01;
  }
  const broken = combat.isPostureBroken(enemy);
  const healthBeforeExecution = enemy.health;
  const accepted = combat.execute(enemy, player);
  for (let f = 0; f < 80; f++) combat.update(1 / 60, 0, 1 / 60);
  return {
    broken, healthBeforeExecution, accepted,
    healthAfterExecution: enemy.health,
    breaks: events.filter((e) => e.name === 'posture-break').length,
    deaths: events.filter((e) => e.name === 'death').length,
    phases: events.filter((e) => e.name === 'execution').map((e) => e.phase),
  };
}

function retryCleanup() {
  const { combat, ctx, enemy, player } = fixture();
  if (typeof combat.reset !== 'function') return { resetMissing: true };
  combat.update(1 / 60, 0, 1 / 60);
  combat.addPosture(enemy, enemy.maxPosture);
  combat.execute(enemy, player);
  combat.spawnProjectile({ owner: enemy, origin: enemy.position, direction: new Vector3(0, 0, 1), speed: 8, damage: 20 });
  const other = new Enemy(ctx, 'ronin', ctx.enemies);
  other.active = true;
  other.position.set(8, 0, 0);
  ctx.enemies.list.push(other);
  assert.equal(combat.requestToken(other, 'melee'), true, 'Retry must cancel a real granted token');
  assert.equal(combat._exec.active, true, 'Retry must interrupt an actual execution');
  assert.equal(combat._projectiles.filter((p) => p.alive).length, 1, 'Retry must clear an actual projectile');
  combat._updateTimeScale(combat.time);
  const timeBefore = combat.time;
  combat.reset();
  const healthBefore = player.health;
  for (let f = 0; f < 80; f++) combat.update(1 / 60, 0, 1 / 60);
  return {
    projectileCount: combat._projectiles.filter((p) => p.alive).length,
    executionActive: combat._exec.active,
    activeTokens: combat._tokens.melee.length + combat._tokens.ranged.length,
    invulnerable: player.invulnerable,
    healthBefore, healthAfter: player.health,
    timeScale: ctx.engine.timeScale,
    clockRemainsMonotonic: combat.time >= timeBefore,
  };
}

const evidence = {
  baseline: { regen: regenDuringEnemyLock(BaselineCombat), firstContact: firstContactClassification(BaselineCombat), playerRecovery: playerRewardRecovery(BaselineCombat) },
  current: { regen: regenDuringEnemyLock(CombatDirector), firstContact: firstContactClassification(CombatDirector), playerRecovery: playerRewardRecovery(CombatDirector), perfect: parryResolution(false), late: parryResolution(true), finisher: pressureFinisher(), retry: retryCleanup() },
  scope: 'Pure Node integration of Combat with real Enemy/EnemyManager callbacks; no renderer, DOM input, AI encounter policy, or BM-COMBAT-02 runtime sample.',
};
console.log(JSON.stringify(evidence, null, 2));
if (!process.argv.includes('--observe')) {
  assert.equal(evidence.current.regen.afterOneSecond, evidence.current.regen.afterHit, 'Enemy regen lock must remain authoritative');
  assert.ok(evidence.current.regen.lockRemaining > 0);
  assert.equal(evidence.current.firstContact.mode, -1, 'Draining posture mode must be recorded before first damage');
  assert.equal(evidence.current.firstContact.afterPressure, evidence.current.firstContact.afterHit - 10);
  assert.equal(evidence.current.playerRecovery.afterReward, 22);
  assert.ok(evidence.current.playerRecovery.afterOneSecond < evidence.current.playerRecovery.afterReward, 'An onKill reward must not disable ongoing player recovery');
  assert.ok(Math.abs(evidence.current.perfect.attackerPressure - TUNING.PARRY_PERFECT_POSTURE * (1 + TUNING.PARRY_STREAK_POSTURE)) < 1e-9);
  assert.equal(evidence.current.perfect.playerHealth, 100);
  assert.equal(evidence.current.late.attackerPressure, TUNING.PARRY_LATE_POSTURE);
  assert.equal(evidence.current.late.playerHealth, 100 - 15 * TUNING.PARRY_LATE_DAMAGE * TUNING.DIFFICULTY.normal.enemyDamage);
  assert.deepEqual(evidence.current.finisher, { broken: true, healthBeforeExecution: 70, accepted: true, healthAfterExecution: 0, breaks: 1, deaths: 1, phases: ['start', 'impact', 'end'] });
  assert.deepEqual(evidence.current.retry, { projectileCount: 0, executionActive: false, activeTokens: 0, invulnerable: false, healthBefore: 100, healthAfter: 100, timeScale: 1, clockRemainsMonotonic: true });
  console.log('R17 combat checks passed. BM-COMBAT-02 still requires the full encounter capture.');
}
