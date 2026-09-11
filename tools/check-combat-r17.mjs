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

function authoredHeavyContact(Director, key, finisher) {
  const { ctx, combat, enemy } = fixture(Director);
  const player = new Player(ctx);
  ctx.player = player;
  player.state = 'attack';
  player.sheathed = false;
  player.position.set(0, 0, 0);
  player._beginAttack({ key, heavy: true, finisher });
  const authoredDamage = player.attack.damage;
  const opts = player._fillSwingOpts(player.attack);
  combat.beginSwing(player, opts);
  const rec = combat._records.get(player);
  rec.base.set(0, 1, -0.7); rec.tip.set(0, 1, -2);
  rec.prevBase.copy(rec.base); rec.prevTip.copy(rec.tip);
  rec.bladeValid = true; rec.hasPrev = true;
  let hit = null;
  ctx.bus.on('hit', (p) => { hit = { damage: p.damage, posture: p.posture, crit: p.crit }; });
  const contact = combat._sweepAgainst(rec, player, enemy, 1, combat.time);
  return { authoredDamage, contact, ...hit, enemyHealth: enemy.health, enemyAlive: enemy.isAlive };
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

function defensiveContract() {
  const { combat, enemy, player, events } = fixture();
  combat.update(1 / 60, 0, 1 / 60);

  combat.grantIFrames(player);
  const dodged = combat.applyDamage(enemy, player, 15);
  const healthAfterDodge = player.health;
  combat.time += TUNING.DODGE_IFRAMES + 0.01;

  enemy.weapon.posture = 12;
  combat.setGuard(player, true, 1);
  const guarded = combat.applyDamage(enemy, player, 15);
  const healthAfterGuard = player.health;
  const playerPostureAfterGuard = player.posture;
  const attackerPostureAfterGuard = enemy.posture;

  combat.time += 2;
  combat.requestParry(player);
  combat.applyDamage(enemy, player, 15);
  const punishRemaining = combat._records.get(enemy).punishUntil - combat.time;

  return {
    perfectWindow: TUNING.PARRY_PERFECT,
    lateWindow: TUNING.PARRY_LATE,
    punishWindow: TUNING.PUNISH_WINDOW,
    dodged, healthAfterDodge,
    guarded, healthAfterGuard, playerPostureAfterGuard, attackerPostureAfterGuard,
    punishRemaining,
    perfectParries: events.filter((e) => e.name === 'parry' && e.perfect).length,
  };
}

function defaultPressureRace(archetype, damages) {
  const { combat, enemy, player, events } = fixture(CombatDirector, archetype);
  const samples = [];
  for (const damage of damages) {
    combat.applyDamage(player, enemy, damage, { ignoreDefence: true, poise: 0 });
    samples.push({ damage, health: enemy.health, posture: enemy.posture, state: enemy.state });
    if (enemy.state === 'postureBroken' || enemy.health <= 0) break;
  }
  return {
    archetype,
    samples,
    brokeAlive: enemy.state === 'postureBroken' && enemy.health > 0,
    breaks: events.filter((e) => e.name === 'posture-break').length,
    deaths: events.filter((e) => e.name === 'death').length,
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
  baseline: { regen: regenDuringEnemyLock(BaselineCombat), firstContact: firstContactClassification(BaselineCombat), playerRecovery: playerRewardRecovery(BaselineCombat), heavySlash: authoredHeavyContact(BaselineCombat, 'd_dr', false), heavyFinisher: authoredHeavyContact(BaselineCombat, 'heavy', true) },
  current: { regen: regenDuringEnemyLock(CombatDirector), firstContact: firstContactClassification(CombatDirector), playerRecovery: playerRewardRecovery(CombatDirector), heavySlash: authoredHeavyContact(CombatDirector, 'd_dr', false), heavyFinisher: authoredHeavyContact(CombatDirector, 'heavy', true), perfect: parryResolution(false), late: parryResolution(true), defence: defensiveContract(), ashigaruRace: defaultPressureRace('ashigaru', [34, 25.5, 49.4]), roninRace: defaultPressureRace('ronin', [24, 17, 25.5, 35.1, 28.5]), finisher: pressureFinisher(), retry: retryCleanup() },
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
  for (const heavy of [evidence.current.heavySlash, evidence.current.heavyFinisher]) {
    assert.equal(heavy.contact, true);
    assert.equal(heavy.crit, false);
    assert.equal(heavy.damage, heavy.authoredDamage, 'A swept hit must honor the already-authored heavy damage exactly once');
    assert.equal(heavy.enemyAlive, true, 'The authored heavy must leave the 70 HP opponent alive for a follow-up');
  }
  assert.ok(Math.abs(evidence.current.perfect.attackerPressure - TUNING.PARRY_PERFECT_POSTURE * (1 + TUNING.PARRY_STREAK_POSTURE)) < 1e-9);
  assert.equal(evidence.current.perfect.playerHealth, 100);
  assert.equal(evidence.current.late.attackerPressure, TUNING.PARRY_LATE_POSTURE);
  assert.equal(evidence.current.late.playerHealth, 100 - 15 * TUNING.PARRY_LATE_DAMAGE * TUNING.DIFFICULTY.normal.enemyDamage);
  assert.equal(evidence.current.defence.perfectWindow, 0.130);
  assert.ok(evidence.current.defence.lateWindow > 0);
  assert.equal(evidence.current.defence.punishWindow, 0.75);
  assert.equal(evidence.current.defence.dodged, false);
  assert.equal(evidence.current.defence.healthAfterDodge, 100);
  assert.equal(evidence.current.defence.guarded, true);
  assert.ok(Math.abs(evidence.current.defence.healthAfterGuard -
    (100 - 15 * TUNING.DIFFICULTY.normal.enemyDamage * TUNING.CHIP_RESIDUE)) < 1e-9);
  assert.ok(evidence.current.defence.playerPostureAfterGuard > 0,
    'Guard must convert the incoming blow into posture pressure');
  assert.ok(evidence.current.defence.attackerPostureAfterGuard < 55,
    'Guard must return some posture pressure to the attacker');
  assert.ok(Math.abs(evidence.current.defence.punishRemaining - 0.75) < 1e-9);
  assert.equal(evidence.current.defence.perfectParries, 1);
  for (const race of [evidence.current.ashigaruRace, evidence.current.roninRace]) {
    assert.equal(race.brokeAlive, true,
      `${race.archetype} must enter a posture-break execution opening before HP depletion`);
    assert.equal(race.breaks, 1);
    assert.equal(race.deaths, 0);
  }
  assert.deepEqual(evidence.current.finisher, { broken: true, healthBeforeExecution: 70, accepted: true, healthAfterExecution: 0, breaks: 1, deaths: 1, phases: ['start', 'impact', 'end'] });
  assert.deepEqual(evidence.current.retry, { projectileCount: 0, executionActive: false, activeTokens: 0, invulnerable: false, healthBefore: 100, healthAfter: 100, timeScale: 1, clockRemainsMonotonic: true });
  console.log('R17 combat checks passed. BM-COMBAT-02 still requires the full encounter capture.');
}
