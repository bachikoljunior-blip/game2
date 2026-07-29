/**
 * EnemyAI.js — one utility-scored brain per oni.
 *
 * Not a behaviour tree and not a naive state machine. Every tick each enemy scores a
 * fixed set of candidate behaviours against the situation — distance, angle, token,
 * its own health and posture, what the player is doing, where its allies are, whether
 * the ground ahead is a cliff — and commits to the winner with hysteresis so it does
 * not twitch between decisions on adjacent frames.
 *
 * Cost control:
 *   - decisions run at ~8 Hz on a per-enemy phase offset, so twelve enemies never
 *     think on the same frame; steering runs every frame so movement stays smooth
 *   - line-of-sight raycasts run at the archetype's `losInterval`, not per frame
 *   - obstacle probes run at 8 Hz and cache a steering rotation in between
 *   - zero allocation after construction: scratch vectors are module scope, the
 *     situation is one reused struct, callbacks are bound once
 *
 * Two Ronin never behave identically: `reset(seed)` draws a personality (aggression,
 * patience, circling hand, reaction sharpness, flankiness) from a seeded RNG, so an
 * encounter reads as a group of people rather than a group of clones.
 */

import { Vector3 } from 'three';
import { makeRandom, clamp, lerp, smoothstep, damp } from '../core/Noise.js';

// ------------------------------------------------------------------ behaviours

export const BEHAVIOURS = [
  'hold',        // 0  stand your ground, read the opponent
  'approach',    // 1  close to weapon range
  'circleLeft',  // 2  orbit counter-clockwise at the preferred radius
  'circleRight', // 3  orbit clockwise
  'backOff',     // 4  break distance
  'attack',      // 5  commit to the selected move
  'feint',       // 6  sell a windup and abort — bait a parry
  'guard',       // 7  raise the weapon
  'parry',       // 8  reactive deflect (armed by the reaction system)
  'dodge',       // 9  reactive evade
  'reposition',  // 10 walk to the assigned slot around the player
  'flank',       // 11 swing around to the player's back
  'ranged',      // 12 throw
  'taunt',       // 13 posture at the player
  'regroup',     // 14 fall back toward an ally
];

const B = {
  hold: 0, approach: 1, circleLeft: 2, circleRight: 3, backOff: 4, attack: 5,
  feint: 6, guard: 7, parry: 8, dodge: 9, reposition: 10, flank: 11,
  ranged: 12, taunt: 13, regroup: 14,
};
const NB = BEHAVIOURS.length;

/** How long we stay with a decision before it may be re-evaluated, in seconds. */
const COMMIT = new Float32Array([
  0.55,  // hold
  0.70,  // approach
  1.45,  // circleLeft
  1.45,  // circleRight
  0.65,  // backOff
  0.30,  // attack
  0.35,  // feint
  0.60,  // guard
  0.20,  // parry
  0.20,  // dodge
  0.90,  // reposition
  1.30,  // flank
  0.45,  // ranged
  1.10,  // taunt
  1.20,  // regroup
]);

/** A new winner must beat the incumbent by this much while the commit timer runs. */
const HYSTERESIS = 0.14;

/** Decision rate. Steering is per-frame; only the scoring is throttled. */
const TICK_INTERVAL = 1 / 8;

/** Human-like reaction latency floor/ceiling, seconds (ARCHITECTURE feel bar). */
const REACTION_FLOOR = 0.140;
const REACTION_CEIL = 0.320;

/** Rotations tried, in order, when the desired heading is blocked. */
const AVOID_ANGLES = [0, 0.42, -0.42, 0.90, -0.90, 1.45, -1.45, 2.25, -2.25, Math.PI];
const AVOID_INTERVAL = 0.12;

// module-scope scratch — never allocate inside update()
const _a1 = new Vector3();
const _a2 = new Vector3();
const _a3 = new Vector3();
const _a4 = new Vector3();
const _a5 = new Vector3();
const _a6 = new Vector3();

// ============================================================================= AI

export class EnemyAI {
  /** @param {import('./Enemy.js').Enemy} enemy */
  constructor(enemy) {
    this.enemy = enemy;
    this.ctx = enemy.ctx;
    this.def = enemy.def;

    this._rng = makeRandom((enemy.id * 2654435761) >>> 0);

    // ---- decision state -----------------------------------------------------
    this.behaviour = 'hold';
    this._bi = B.hold;
    this._scores = new Float64Array(NB);
    this._commitTimer = 0;
    this._tickTimer = this._rng() * TICK_INTERVAL;   // phase offset staggers the tick
    this._tickDt = TICK_INTERVAL;
    this._sinceTick = 0;
    this.time = 0;

    // ---- perception ---------------------------------------------------------
    this.alertness = 0;
    this.canSee = false;
    this.lastSeen = -99;
    this.lastKnown = new Vector3();
    this._losTimer = 0;
    this._losClear = true;
    this._scanPhase = this._rng() * 6.28;

    // ---- combat memory ------------------------------------------------------
    this._move = null;
    this._moveScore = 0;
    this._attackBlock = 0;
    this._attackTryTimer = 0;
    this._whiffTimer = 0;
    this._forceBackOff = 0;
    this._cautious = 0;
    this._feintCooldown = 2 + this._rng() * 3;
    this._tauntCooldown = 6;
    this._lastHitLandedAt = -99;
    this._lastAttackTime = -99;
    this._riposteUrge = 0;
    this._morale = 1;
    this.difficulty = 1;

    // ---- reaction system ----------------------------------------------------
    this._reaction = { armed: false, timer: 0, type: 'none', unblockable: false };
    this._playerPhase = 'none';
    this._playerPhaseTime = 0;
    this._playerWasActive = false;
    this._recoverTimer = 0;

    // ---- steering -----------------------------------------------------------
    this._avoidTimer = 0;
    this._avoidRot = 0;
    this._avoidBlocked = false;
    this._sepX = 0; this._sepZ = 0; this._sepN = 0;
    this._circleSign = this._rng() < 0.5 ? -1 : 1;
    this._nearestAlly = null;
    this._allyCount = 0;
    this._tokenAlly = false;

    // ---- personality --------------------------------------------------------
    this.p = {
      aggression: 0.5, patience: 0.5, courage: 0.5, flankiness: 0.5,
      reaction: 0.5, feint: 0.5, ranged: 0.5, hand: 1, jitter: 0.5,
    };

    /** Reused situation struct — filled once per tick, read by every scorer. */
    this.s = {
      dist: 99, distSq: 9801, los: true,
      toX: 0, toZ: 1, angle: 0, facing: 0, playerFacing: 0,
      hp: 1, post: 1, token: false,
      playerPhase: 'none', playerGuarding: false, playerVulnerable: false,
      playerHeavy: false, sinceAttack: 99, crowding: 0, allyCount: 0,
      slotError: 0, wantRange: 2.5, circleRange: 3,
    };

    // bound once — `forEachInRadius` must not allocate a closure per tick
    this._sepCb = (other) => {
      if (other === this.enemy || !other.isAlive) return;
      const dx = this.enemy.position.x - other.position.x;
      const dz = this.enemy.position.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-4 || d2 > 6.25) return;
      const d = Math.sqrt(d2);
      const w = (2.5 - d) / 2.5;
      this._sepX += (dx / d) * w;
      this._sepZ += (dz / d) * w;
      this._sepN++;
      if (other.hasToken) this._tokenAlly = true;
    };

    /** "Behind me!" — passed to forEachInRadius when we first spot the player. */
    this._shoutCb = (other) => {
      if (other === this.enemy || !other.isAlive || other.aware >= 2) return;
      other.ai?.alertTo?.(this.lastKnown, 0.75);
    };

    /** Any living ally that is not us — used by `regroup`. */
    this._allyCb = (other) => other !== this.enemy && other.isAlive;
  }

  /** Deterministic per-enemy randomness. Enemy.js borrows this for its own rolls. */
  rand() { return this._rng(); }

  /** Re-seed and redraw the personality. Called every time we come out of the pool. */
  reset(seed) {
    this._rng = makeRandom((seed >>> 0) || 1);
    const r = this._rng;
    const t = this.def.temperament;

    // Personality is a spread around the archetype, never a replacement for it.
    const p = this.p;
    p.aggression = clamp(t.aggression + (r() - 0.5) * 0.34, 0.05, 1);
    p.patience = clamp(t.patience * (0.75 + r() * 0.5), 0.2, 3);
    p.courage = clamp(t.courage + (r() - 0.5) * 0.3, 0.05, 1);
    p.flankiness = clamp(t.flankiness + (r() - 0.5) * 0.35, 0, 1);
    p.reaction = clamp(0.5 + (r() - 0.5) * 0.8, 0, 1);
    p.feint = clamp(t.feintChance * (0.6 + r() * 0.9), 0, 1);
    p.ranged = 0.35 + r() * 0.65;
    p.hand = r() < 0.5 ? -1 : 1;
    p.jitter = r();

    this.behaviour = 'hold';
    this._bi = B.hold;
    this._commitTimer = 0;
    this._tickTimer = r() * TICK_INTERVAL;
    this._sinceTick = 0;
    this.alertness = 0;
    this.canSee = false;
    this.lastSeen = -99;
    this.lastKnown.copy(this.enemy.position);
    this._losTimer = 0;
    this._losClear = true;
    this._move = null;
    this._attackBlock = 0;
    this._attackTryTimer = 0;
    this._whiffTimer = 0;
    this._forceBackOff = 0;
    this._cautious = 0;
    this._feintCooldown = 2 + r() * 3;
    this._tauntCooldown = 5 + r() * 6;
    this._riposteUrge = 0;
    this._morale = 1;
    this._reaction.armed = false;
    this._reaction.timer = 0;
    this._reaction.type = 'none';
    this._playerPhase = 'none';
    this._playerWasActive = false;
    this._recoverTimer = 0;
    this._lastAttackTime = -99;
    this._lastHitLandedAt = -99;
    this._avoidRot = 0;
    this._avoidBlocked = false;
    this._circleSign = p.hand;
    this._scanPhase = r() * 6.28;
  }

  // ---------------------------------------------------------------------- update

  update(dt, elapsed) {
    const e = this.enemy;
    this.time += dt;
    this._sinceTick += dt;

    // Intent flags are single-frame edges — clear them before anything can set them.
    const it = e.intent;
    it.parry = false;
    it.dodge = false;
    it.taunt = false;
    it.guard = false;
    it.attack = null;

    this.difficulty = clamp(this.ctx.combat?.difficulty ?? 1, 0.4, 2.2);
    if (e.state === 'attack') this._lastAttackTime = this.time;

    if (!e.target || !e.target.isAlive) {
      const p = this.ctx.player;
      if (p && p.isAlive !== false) e.target = p;
    }

    // Timers that must run at frame rate for the feel to land.
    if (this._attackBlock > 0) this._attackBlock -= dt;
    if (this._whiffTimer > 0) this._whiffTimer -= dt;
    if (this._forceBackOff > 0) this._forceBackOff -= dt;
    if (this._cautious > 0) this._cautious -= dt;
    if (this._feintCooldown > 0) this._feintCooldown -= dt;
    if (this._tauntCooldown > 0) this._tauntCooldown -= dt;
    if (this._riposteUrge > 0) this._riposteUrge -= dt;
    if (this._recoverTimer > 0) this._recoverTimer -= dt;
    this._commitTimer -= dt;

    this._observeTarget(dt);
    this._updateReaction(dt);

    this._tickTimer -= dt;
    if (this._tickTimer <= 0) {
      this._tickDt = this._sinceTick;
      this._sinceTick = 0;
      // Jitter the interval so twelve enemies do not resynchronise over time.
      this._tickTimer = TICK_INTERVAL * (0.85 + this._rng() * 0.3);
      this._perceive(this._tickDt);
      this._think();
    }

    // An attack that was chosen but denied a token must not leave us posing: give
    // up on it, blacklist attacking briefly, and go find something busy to do.
    if (this.behaviour === 'attack' && e.state !== 'attack') {
      this._attackTryTimer += dt;
      if (this._attackTryTimer > 0.22) {
        this._attackBlock = 0.4 + this._rng() * 0.3;
        this._commitTimer = 0;
        this._attackTryTimer = 0;
        this._think();
      }
    } else {
      this._attackTryTimer = 0;
    }

    this._steer(dt);
  }

  // ------------------------------------------------------------------ perception

  _perceive(dt) {
    const e = this.enemy;
    const per = this.def.perception;
    const tgt = e.target;

    if (!tgt?.position || tgt.isAlive === false) {
      this.canSee = false;
      this.alertness = Math.max(0, this.alertness - per.calmRate * dt);
      this._applyAwareness();
      return;
    }

    _a1.set(tgt.position.x - e.position.x, 0, tgt.position.z - e.position.z);
    const dist = _a1.length();

    let visible = false;
    if (dist < per.sight) {
      if (dist > 1e-3) _a1.multiplyScalar(1 / dist);
      const dot = _a1.x * e.forward.x + _a1.z * e.forward.z;
      const inCone = dot > Math.cos(per.fov * 0.5);
      // Close in, you feel someone behind you — a strict cone reads as blindness.
      const inPeripheral = dist < per.peripheral;
      if (inCone || inPeripheral) {
        this._losTimer -= dt;
        if (this._losTimer <= 0) {
          this._losTimer = per.losInterval;
          this._losClear = this._checkLOS(tgt);
        }
        visible = this._losClear;
      }
    }

    this.canSee = visible;
    if (visible) {
      // Distance falloff: a figure at the edge of sight registers slowly.
      const near = 1 - smoothstep(per.sight * 0.35, per.sight, dist);
      const gain = per.alertRate * (0.35 + 0.65 * near) *
        (1 + 0.5 * clamp((tgt.speed ?? 0) / 5, 0, 1));
      this.alertness = Math.min(1, this.alertness + gain * dt);
      this.lastSeen = this.time;
      this.lastKnown.copy(tgt.position);
    } else {
      const decay = this.alertness > 0.7 ? per.calmRate * 0.55 : per.calmRate;
      this.alertness = Math.max(0, this.alertness - decay * dt);
    }
    this._applyAwareness();
  }

  /** Escalation ladder with hysteresis so the state does not flutter on a threshold. */
  _applyAwareness() {
    const e = this.enemy;
    const prev = e.aware;
    let next = prev;
    if (prev >= 2) next = this.alertness < 0.34 ? 1 : 2;
    else if (prev === 1) next = this.alertness >= 0.75 ? 2 : this.alertness < 0.14 ? 0 : 1;
    else next = this.alertness >= 0.30 ? 1 : 0;

    if (next !== prev) {
      e.aware = next;
      if (next === 1 && prev === 0) {
        // Visible "did I hear something?" beat before the fight starts.
        e._playAdditive?.('look_around');
      } else if (next === 2 && prev < 2) {
        e._play?.('alert', 0.12, false);
        // One shout brings the neighbours — that is how a shrine turns hostile.
        this.ctx.enemies?.forEachInRadius?.(e.position, 14, this._shoutCb);
      }
    }
  }

  _checkLOS(tgt) {
    const e = this.enemy;
    const phys = this.ctx.physics;
    _a2.set(e.position.x, e.position.y + this.def.body.eye, e.position.z);
    _a3.set(tgt.position.x, tgt.position.y + (tgt.height ?? 1.75) * 0.6, tgt.position.z).sub(_a2);
    const dist = _a3.length();
    if (dist < 0.05) return true;
    _a3.multiplyScalar(1 / dist);
    if (!phys?.raycast) return true;
    try {
      const hit = phys.raycast(_a2, _a3, dist - 0.3, phys.LAYER?.WORLD);
      if (!hit) return true;
      const hd = hit.distance ?? hit.t ?? hit.dist;
      if (typeof hd === 'number') return hd >= dist - 0.35;
      return false;
    } catch { return true; }
  }

  // ------------------------------------------------------------ external stimuli

  /** Manager fan-out from `slash`/`hit`/`footstep`. `strength` is 0..1 by distance. */
  hear(point, strength, source) {
    if (!this.enemy.isAlive) return;
    const s = clamp(strength, 0, 1);
    this.alertness = Math.min(1, this.alertness + s * 0.55);
    if (this.alertness > 0.22) this.lastKnown.copy(point);
    if (source && source.faction !== 'oni' && this.enemy.aware < 2 && s > 0.55) {
      this.enemy.target = source;
    }
  }

  /** Hard alert — an ally shouted, we were hit, or an encounter opened. */
  alertTo(point, amount = 1) {
    this.alertness = Math.max(this.alertness, clamp(0.32 + 0.68 * amount, 0, 1));
    if (point) this.lastKnown.copy(point);
    if (amount >= 1) { this.alertness = 1; this.lastSeen = this.time; }
    this._applyAwareness();
  }

  witnessAttack(attacker, victim) {
    if (!attacker?.position) return;
    this.alertness = Math.max(this.alertness, 0.85);
    this.lastKnown.copy(attacker.position);
    if (attacker.faction !== 'oni') this.enemy.target = attacker;
    this._applyAwareness();
  }

  onAllyDeath(ally) {
    this.alertness = Math.max(this.alertness, 0.9);
    if (ally?.position) this.lastKnown.copy(ally.position);
    // Morale: the third body on the ground changes how the fourth one fights.
    this._morale = Math.max(0.25, this._morale - 0.22);
    this._cautious = Math.max(this._cautious, 1.2 * (1.4 - this.p.courage));
    this.enemy._playAdditive?.('look_around');
    this._commitTimer = 0;
    this._applyAwareness();
  }

  onTargetLost() {
    this.alertness *= 0.4;
    this._commitTimer = 0;
  }

  onDamaged(payload) {
    this.alertness = 1;
    this._reaction.armed = false;
    this._commitTimer = 0;
    if (payload?.attacker?.position) this.lastKnown.copy(payload.attacker.position);
    const hp = this.enemy.health / Math.max(this.enemy.maxHealth, 1);
    if (hp < 0.3) this._cautious = Math.max(this._cautious, 1.6 * (1.3 - this.p.courage));
  }

  /** Manager tells us our swing connected, so `onAttackFinished` can spot a whiff. */
  onHitLanded() { this._lastHitLandedAt = this.time; }

  onAttackFinished(move, fromFeint) {
    if (!move) return;
    if (fromFeint) { this._feintCooldown = 2.5 + this._rng() * 2.5; return; }
    const landed = (this.time - this._lastHitLandedAt) < move.total + 0.1;
    if (!landed) {
      // Whiffing a big committed swing should visibly cost you space.
      this._whiffTimer = 0.85 * (this.def.temperament.whiffBackoff || 0.2);
    }
    if (move.retreatAfter) this._forceBackOff = Math.max(this._forceBackOff, 0.8);
    this._commitTimer = 0;
  }

  onParrySuccess(attacker) {
    this._riposteUrge = 0.9;
    this._commitTimer = 0;
    this._morale = Math.min(1.3, this._morale + 0.1);
  }

  onParried(defender) {
    this._whiffTimer = 1.2;
    this._cautious = Math.max(this._cautious, 1.8);
    this._commitTimer = 0;
  }

  forceBackOff(seconds) {
    this._forceBackOff = Math.max(this._forceBackOff, seconds);
    this._commitTimer = 0;
  }

  // ------------------------------------------------------------ reaction system

  /**
   * Watch the player's attack phases. When one starts inside our threat ring we arm
   * a reaction after a human-like latency: parry if we are skilled and it is
   * parryable, dodge if it is unblockable, otherwise raise the guard. Reacting on
   * the same frame the animation starts is what makes AI feel like a cheat.
   */
  _observeTarget(dt) {
    const e = this.enemy;
    const tgt = e.target;
    if (!tgt) { this._playerPhase = 'none'; return; }

    const attacking = tgt.state === 'attack';
    const active = !!tgt.weapon?.active;
    let phase = 'none';
    if (attacking) {
      if (active) phase = 'active';
      else if (this._playerWasActive) phase = 'recover';
      else phase = this._playerPhase === 'recover' ? 'recover' : 'windup';
    } else if (this._recoverTimer > 0) {
      phase = 'recover';
    }
    if (attacking && active) this._playerWasActive = true;
    if (!attacking) this._playerWasActive = false;

    // A swing that just closed its damage window leaves the player planted — that
    // window is the punish, and it survives a frame or two past `state`.
    if (this._playerPhase === 'active' && phase !== 'active') this._recoverTimer = 0.42;

    if (phase !== this._playerPhase) {
      const prev = this._playerPhase;
      this._playerPhase = phase;
      this._playerPhaseTime = 0;
      if (phase === 'windup' && prev !== 'windup') this._armReaction(tgt);
    } else {
      this._playerPhaseTime += dt;
    }
  }

  _armReaction(tgt) {
    const e = this.enemy;
    if (!e.isAlive || e.aware < 2 || !this.canSee) return;
    const reach = (tgt.weapon?.length ?? 1.1) + 1.9;
    const dist = e.position.distanceTo(tgt.position);
    if (dist > reach + 1.2) return;

    const t = this.def.temperament;
    const diff = this.difficulty;
    const unblockable = !!(tgt.weapon?.unblockable || tgt.attack?.unblockable);
    const heavy = unblockable || !!(tgt.weapon?.heavy || tgt.attack?.heavy);

    // Latency: sharper personalities and higher difficulty react sooner, but never
    // faster than a good human and never slower than a distracted one.
    const base = lerp(t.reactionMax, t.reactionMin, this.p.reaction);
    const latency = clamp(base * (1.3 - 0.3 * diff), REACTION_FLOOR, REACTION_CEIL);

    const roll = this._rng();
    let type = 'none';
    if (unblockable) {
      type = roll < clamp(t.dodgeSkill * (0.7 + 0.35 * diff), 0, 0.95) ? 'dodge'
        : roll < 0.85 ? 'backOff' : 'none';
    } else if (roll < clamp(t.parrySkill * (0.65 + 0.4 * diff) * this._morale, 0, 0.92)) {
      type = 'parry';
    } else if (heavy && this._rng() < t.dodgeSkill * 0.8) {
      type = 'dodge';
    } else if (this._rng() < clamp(t.guardSkill * (0.7 + 0.3 * diff), 0, 0.95)) {
      type = 'guard';
    }
    if (type === 'none') return;

    const r = this._reaction;
    r.armed = true;
    r.timer = latency;
    r.type = type;
    r.unblockable = unblockable;
  }

  _updateReaction(dt) {
    const r = this._reaction;
    if (!r.armed) return;
    r.timer -= dt;
    if (r.timer > 0) return;
    r.armed = false;

    const e = this.enemy;
    const it = e.intent;
    if (!e.isAlive || e.state === 'stagger' || e.state === 'postureBroken' ||
      e.state === 'dodge') return;
    // Mid-windup we can still change our mind; past the commit point we cannot.
    if (e.state === 'attack' && !e.cancelAttack()) return;

    if (r.type === 'parry') {
      it.parry = true;
      this.behaviour = 'parry';
      this._bi = B.parry;
      this._commitTimer = COMMIT[B.parry];
    } else if (r.type === 'dodge') {
      this._pickDodgeDirection(it.dodgeDir, r.unblockable);
      it.dodge = true;
      this.behaviour = 'dodge';
      this._bi = B.dodge;
      this._commitTimer = COMMIT[B.dodge];
    } else if (r.type === 'guard') {
      this.behaviour = 'guard';
      this._bi = B.guard;
      this._commitTimer = COMMIT[B.guard] * 1.4;
    } else if (r.type === 'backOff') {
      this._forceBackOff = 0.55;
      this.behaviour = 'backOff';
      this._bi = B.backOff;
      this._commitTimer = COMMIT[B.backOff];
    }
  }

  /** Sideways for a sweep, straight back for a thrust — and never off the cliff. */
  _pickDodgeDirection(out, unblockable) {
    const e = this.enemy;
    const tgt = e.target;
    out.set(0, 0, 0);
    if (!tgt?.position) { out.copy(e.forward).negate(); return; }
    _a4.set(e.position.x - tgt.position.x, 0, e.position.z - tgt.position.z);
    if (_a4.lengthSq() < 1e-5) _a4.set(0, 0, 1);
    _a4.normalize();
    const sideways = unblockable || this._rng() < 0.6;
    if (sideways) {
      const sign = this._rng() < 0.5 ? 1 : -1;
      // perpendicular in the ground plane
      _a5.set(-_a4.z * sign, 0, _a4.x * sign);
      _a5.addScaledVector(_a4, 0.45).normalize();
    } else {
      _a5.copy(_a4);
    }
    if (!this._dirClear(_a5.x, _a5.z, 1.6)) {
      _a5.set(-_a5.x, 0, -_a5.z);
      if (!this._dirClear(_a5.x, _a5.z, 1.6)) _a5.copy(_a4);
    }
    out.copy(_a5);
  }

  // ------------------------------------------------------------------- decision

  _computeSituation() {
    const e = this.enemy;
    const s = this.s;
    const t = this.def.temperament;
    const tgt = e.target;

    s.wantRange = t.preferredRange;
    s.circleRange = t.circleRange;
    s.token = e.hasToken;
    s.hp = e.health / Math.max(e.maxHealth, 1);
    s.post = e.posture / Math.max(e.maxPosture, 1);
    s.sinceAttack = this.time - this._lastAttackTime;
    s.los = this._losClear;
    s.playerPhase = this._playerPhase;
    s.playerGuarding = tgt?.state === 'guard';
    s.playerVulnerable = tgt?.state === 'stagger' || tgt?.state === 'postureBroken' ||
      this._recoverTimer > 0;
    s.playerHeavy = !!(tgt?.weapon?.unblockable || tgt?.weapon?.heavy);

    if (!tgt?.position) {
      s.dist = 99; s.distSq = 9801; s.toX = 0; s.toZ = 1; s.angle = 0; s.facing = 0;
      s.playerFacing = 0;
      return;
    }
    const dx = tgt.position.x - e.position.x;
    const dz = tgt.position.z - e.position.z;
    s.distSq = dx * dx + dz * dz;
    s.dist = Math.sqrt(s.distSq);
    const inv = s.dist > 1e-4 ? 1 / s.dist : 0;
    s.toX = dx * inv;
    s.toZ = dz * inv;
    s.facing = s.toX * e.forward.x + s.toZ * e.forward.z;
    // +1 when the player is looking straight at us.
    const pf = tgt.forward;
    s.playerFacing = pf ? -(s.toX * pf.x + s.toZ * pf.z) : 0;
    s.angle = Math.atan2(s.toX, s.toZ);

    // Slot error: how far from our assigned place in the ring we are.
    let se = Math.atan2(e.position.x - tgt.position.x, e.position.z - tgt.position.z) - e.slotAngle;
    while (se > Math.PI) se -= Math.PI * 2;
    while (se < -Math.PI) se += Math.PI * 2;
    s.slotError = se;

    // Ally awareness — the separation accumulator doubles as a crowding metre.
    this._sepX = 0; this._sepZ = 0; this._sepN = 0; this._tokenAlly = false;
    const mgr = this.ctx.enemies;
    if (mgr?.forEachInRadius) mgr.forEachInRadius(e.position, 2.5, this._sepCb);
    s.crowding = Math.min(1, this._sepN / 2);
    s.allyCount = mgr ? Math.max(0, (mgr.aliveCount ?? 1) - 1) : 0;
    this._allyCount = s.allyCount;
  }

  _think() {
    const e = this.enemy;
    if (!e.isAlive) return;
    this._computeSituation();

    if (e.aware < 2) { this._thinkPassive(); return; }

    const s = this.s;
    const p = this.p;
    const sc = this._scores;
    const t = this.def.temperament;
    const diff = this.difficulty;
    for (let i = 0; i < NB; i++) sc[i] = -Infinity;

    this._move = this._selectMove();

    const aggr = p.aggression * (0.6 + 0.4 * this._morale) * (0.85 + 0.3 * diff);
    const timid = this._cautious > 0 ? 0.55 : 1;
    const inRing = 1 - smoothstep(0, 3.5, Math.abs(s.dist - s.circleRange));

    // ---- hold ---------------------------------------------------------------
    sc[B.hold] = 0.22 * p.patience
      + inRing * 0.28
      + (s.playerPhase === 'windup' ? 0.42 : 0)
      + (s.token ? -0.25 : 0.1)
      - aggr * 0.2;

    // ---- approach -----------------------------------------------------------
    if (s.dist > s.wantRange + 0.35) {
      const gap = clamp((s.dist - s.wantRange) / 7, 0, 1);
      sc[B.approach] = (0.45 + gap * 0.85) * aggr * timid
        + (s.token ? 0.55 : -0.18)
        + (s.playerVulnerable ? 0.55 : 0)
        - s.crowding * 0.3
        - (s.hp < 0.3 ? (1 - p.courage) * 0.8 : 0);
      if (s.playerPhase === 'windup' && s.dist < 4) sc[B.approach] -= 0.5;
    }

    // ---- circling -----------------------------------------------------------
    // Enemies without a token must look busy: this is where that happens.
    if (s.dist < s.circleRange + 3.5 && s.dist > s.wantRange * 0.6) {
      const base = 0.32 + inRing * 0.5 + (s.token ? -0.35 : 0.34) + p.flankiness * 0.22;
      const towardSlot = s.slotError > 0 ? -1 : 1;   // which way closes the slot gap
      const bias = 0.22 * Math.min(1, Math.abs(s.slotError) / 0.8);
      sc[B.circleLeft] = base + (towardSlot < 0 ? bias : -bias) + (p.hand < 0 ? 0.1 : 0);
      sc[B.circleRight] = base + (towardSlot > 0 ? bias : -bias) + (p.hand > 0 ? 0.1 : 0);
      // Do not orbit into an ally.
      if (this._sepN > 0) {
        const sideDot = this._sepX * -s.toZ + this._sepZ * s.toX;
        if (sideDot > 0) sc[B.circleLeft] -= 0.3; else sc[B.circleRight] -= 0.3;
      }
      if (t.unstoppable) { sc[B.circleLeft] -= 0.35; sc[B.circleRight] -= 0.35; }
    }

    // ---- back off -----------------------------------------------------------
    {
      let v = -0.9;
      if (s.dist < s.wantRange * 0.6) v += 1.25;
      if (this._whiffTimer > 0) v += 0.9;
      if (this._forceBackOff > 0) v += 1.5;
      if (s.hp < 0.28) v += (1 - p.courage) * 1.1;
      if (s.post < 0.25) v += 0.7;
      if (s.playerPhase === 'windup' && s.dist < 2.6) v += 0.45 * (1 - t.guardSkill);
      if (t.unstoppable) v -= 1.2;
      sc[B.backOff] = v;
    }

    // ---- attack -------------------------------------------------------------
    if (this._move && this._attackBlock <= 0) {
      const m = this._move;
      let v = 0.55 * aggr + this._moveScore * 0.55;
      if (s.dist >= m.minRange && s.dist <= m.maxRange + m.advance * 0.6) v += 0.85;
      if (s.playerVulnerable) v += 0.9;
      if (this._recoverTimer > 0) v += 0.7;             // punish the recovery frames
      if (this._riposteUrge > 0 && m.punish) v += 1.6;  // the parry payoff
      if (s.playerGuarding && !m.guardBreak) v -= 0.55;
      // A defensive fighter respects the tell: swinging into a windup is what
      // separates the Ashigaru from the Ronin.
      if (s.playerPhase === 'windup' && s.dist < 3.4) {
        v -= 0.35 + 0.75 * t.parrySkill + (m.startup > 0.45 ? 0.4 : 0);
      }
      if (!s.token) v -= 0.15;                          // slight bias to the holder
      // Rhythm: the longer since our last swing, the more we want this one.
      v += clamp(s.sinceAttack / Math.max(t.attackCooldown, 0.2), 0, 1) * 0.5;
      if (this._cautious > 0) v -= 0.35;
      sc[B.attack] = v;
    }

    // ---- feint --------------------------------------------------------------
    if (this.def.feintMove && this._feintCooldown <= 0 && !s.token) {
      const m = this.def.feintMove;
      if (s.dist > m.minRange && s.dist < m.maxRange + 0.6) {
        sc[B.feint] = 0.35 + p.feint * 0.9 + (s.playerGuarding ? 0.45 : 0)
          + (s.playerFacing > 0.5 ? 0.2 : -0.2);
      }
    }

    // ---- guard --------------------------------------------------------------
    sc[B.guard] = -0.4 + t.guardSkill * 0.5
      + (s.playerPhase === 'windup' && s.dist < 3 ? 1.0 : 0)
      + (s.hp < 0.35 ? 0.4 : 0)
      + (this._cautious > 0 ? 0.5 : 0)
      - (s.token ? 0.7 : 0)
      - (s.dist > 4 ? 1.2 : 0);

    // ---- reposition ---------------------------------------------------------
    sc[B.reposition] = -0.5
      + Math.min(1, Math.abs(s.slotError) / 1.1) * 0.85
      + s.crowding * 0.75
      - (s.token ? 0.5 : 0);

    // ---- flank --------------------------------------------------------------
    if (!s.token && this._tokenAlly && s.dist < 12) {
      sc[B.flank] = 0.25 + p.flankiness * 0.95 + (s.playerFacing > 0.4 ? 0.3 : 0);
    }

    // ---- ranged -------------------------------------------------------------
    if (this.def.rangedMove) {
      const m = this.def.rangedMove;
      if (e.moveCooldowns[m.index] <= 0 && s.dist >= m.minRange && s.dist <= m.maxRange && s.los) {
        sc[B.ranged] = 0.5 + p.ranged * 0.5 + (s.token ? -0.2 : 0.35)
          + (s.dist > s.wantRange * 2.4 ? 0.4 : 0);
      }
    }

    // ---- taunt --------------------------------------------------------------
    if (this._tauntCooldown <= 0 && !s.token && s.dist > 3.2 && s.dist < 9) {
      sc[B.taunt] = 0.18 + (1 - p.patience) * 0.3 + this._morale * 0.2;
    }

    // ---- regroup ------------------------------------------------------------
    if (s.hp < 0.3 && s.allyCount > 0) {
      sc[B.regroup] = 0.2 + (1 - p.courage) * 1.0 + (1 - s.hp) * 0.5;
    }

    // ---- terrain veto -------------------------------------------------------
    // A behaviour that can only be executed by walking off the cliff is not a
    // behaviour. The steering probe already knows; kill the option here too.
    if (this._avoidBlocked) {
      sc[B.approach] -= 0.6;
      sc[B.backOff] -= 0.6;
      sc[B.flank] -= 0.8;
    }

    // ---- pick with hysteresis ----------------------------------------------
    let bestI = B.hold, best = -Infinity;
    for (let i = 0; i < NB; i++) {
      // Reactive behaviours are never chosen by scoring; they are armed instead.
      if (i === B.parry || i === B.dodge) continue;
      const v = sc[i] + (i === this._bi ? 0 : (this._rng() - 0.5) * 0.06);
      if (v > best) { best = v; bestI = i; }
    }
    if (this._commitTimer > 0 && this._bi !== B.parry && this._bi !== B.dodge) {
      const cur = sc[this._bi];
      if (Number.isFinite(cur) && best <= cur + HYSTERESIS) bestI = this._bi;
    }

    if (bestI !== this._bi) {
      this._bi = bestI;
      this.behaviour = BEHAVIOURS[bestI];
      this._commitTimer = COMMIT[bestI] * (0.8 + this._rng() * 0.45);
      if (bestI === B.circleLeft) this._circleSign = -1;
      else if (bestI === B.circleRight) this._circleSign = 1;
      if (bestI === B.taunt) this._tauntCooldown = 9 + this._rng() * 8;
      if (bestI === B.feint) this._feintCooldown = 3.5 + this._rng() * 3;
      this._attackTryTimer = 0;
    }
  }

  /** Unaware or investigating: no combat scoring, just a believable search. */
  _thinkPassive() {
    const e = this.enemy;
    if (e.aware === 1) {
      if (this.behaviour !== 'reposition') {
        this.behaviour = 'reposition';
        this._bi = B.reposition;
        this._commitTimer = 1.2;
      }
    } else if (this.behaviour !== 'hold') {
      this.behaviour = 'hold';
      this._bi = B.hold;
      this._commitTimer = 1.6 + this._rng() * 2;
    }
  }

  /**
   * Choose the move to swing. Range fit dominates; the situation adjusts.
   * Returns null when nothing is appropriate, which makes `attack` unscoreable.
   */
  _selectMove() {
    const e = this.enemy;
    const s = this.s;
    if (this._attackBlock > 0) return null;

    // Riposte first — the punish window is short and it is the whole point.
    const punish = this.def.punishMove;
    if (punish && e.riposteWindow > 0 && e.moveCooldowns[punish.index] <= 0 &&
      s.dist <= punish.maxRange + 0.4) {
      this._moveScore = 1.4;
      return punish;
    }

    const list = this.def.moveList;
    let best = null, bestScore = 0;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.follower || m.feint || m.punish) continue;
      if (e.moveCooldowns[m.index] > 0) continue;
      const lo = m.minRange;
      const hi = m.maxRange + m.advance * 0.65;
      if (s.dist < lo - 0.35 || s.dist > hi) continue;

      let v = m.weight;
      if (v <= 0) continue;
      const mid = (lo + hi) * 0.5;
      v *= 1 - 0.45 * Math.min(1, Math.abs(s.dist - mid) / Math.max(hi - lo, 0.6));
      if (m.ranged) {
        if (!s.los) continue;
        v *= 0.7 + 0.6 * this.p.ranged;
      }
      if (s.playerGuarding) v *= (m.guardBreak || m.unblockable) ? 2.1 : 0.5;
      if (s.playerVulnerable && m.heavy) v *= 1.55;
      if (s.playerPhase === 'windup' && m.startup > 0.5) v *= 0.5;
      if (m.unblockable) v *= 0.65 + 0.7 * this.p.aggression;
      v *= 0.75 + 0.5 * this._rng();
      if (v > bestScore) { bestScore = v; best = m; }
    }
    this._moveScore = bestScore;
    return best;
  }

  // ------------------------------------------------------------------- steering

  _steer(dt) {
    const e = this.enemy;
    const it = e.intent;
    const s = this.s;
    const tgt = e.target;

    it.behaviour = this.behaviour;

    let dx = 0, dz = 0, gain = 0;
    let faceX = e.forward.x, faceZ = e.forward.z;

    const hasTarget = !!tgt?.position;
    if (hasTarget) { faceX = s.toX; faceZ = s.toZ; }

    switch (this.behaviour) {
      case 'approach':
        if (hasTarget) {
          dx = s.toX; dz = s.toZ;
          // Slow to a walk on the last stride so it is not a bowling ball.
          gain = s.dist > s.wantRange + 2 ? 1 : 0.62;
        }
        break;

      case 'circleLeft':
      case 'circleRight': {
        if (!hasTarget) break;
        const sign = this.behaviour === 'circleLeft' ? -1 : 1;
        // Tangent plus a radial correction that holds the preferred radius.
        const tx = -s.toZ * sign, tz = s.toX * sign;
        const radial = clamp((s.dist - s.circleRange) * 0.6, -1, 1);
        dx = tx + s.toX * radial;
        dz = tz + s.toZ * radial;
        gain = 0.85;
        break;
      }

      case 'backOff':
        if (hasTarget) {
          dx = -s.toX; dz = -s.toZ;
          gain = 0.9;
        }
        break;

      case 'attack':
        it.attack = this._move;
        gain = 0;
        break;

      case 'feint':
        it.attack = this.def.feintMove;
        gain = 0;
        break;

      case 'guard':
        it.guard = true;
        if (hasTarget && s.dist < s.wantRange * 0.7) { dx = -s.toX; dz = -s.toZ; gain = 0.35; }
        break;

      case 'parry':
      case 'dodge':
        gain = 0;
        break;

      case 'reposition': {
        if (e.aware < 2) {
          // Investigating: walk to the last known position, then look around.
          _a1.set(this.lastKnown.x - e.position.x, 0, this.lastKnown.z - e.position.z);
          const d = _a1.length();
          if (d > 1.2) {
            dx = _a1.x / d; dz = _a1.z / d; gain = 0.42;
            faceX = dx; faceZ = dz;
          } else {
            gain = 0;
            this._scanPhase += dt * 0.9;
            faceX = Math.sin(this._scanPhase);
            faceZ = Math.cos(this._scanPhase);
          }
          break;
        }
        if (!hasTarget) break;
        // Walk to the assigned slot on the ring around the player.
        const a = e.slotAngle;
        const px = tgt.position.x + Math.sin(a) * s.circleRange;
        const pz = tgt.position.z + Math.cos(a) * s.circleRange;
        _a1.set(px - e.position.x, 0, pz - e.position.z);
        const d = _a1.length();
        if (d > 0.35) { dx = _a1.x / d; dz = _a1.z / d; gain = 0.8; }
        break;
      }

      case 'flank': {
        if (!hasTarget) break;
        const pf = tgt.forward;
        const bx = pf ? tgt.position.x - pf.x * s.circleRange : tgt.position.x;
        const bz = pf ? tgt.position.z - pf.z * s.circleRange : tgt.position.z;
        _a1.set(bx - e.position.x, 0, bz - e.position.z);
        const d = _a1.length();
        if (d > 0.4) { dx = _a1.x / d; dz = _a1.z / d; gain = 0.95; }
        break;
      }

      case 'ranged':
        it.attack = this.def.rangedMove;
        if (hasTarget && s.dist < (this.def.rangedMove?.minRange ?? 5)) {
          dx = -s.toX; dz = -s.toZ; gain = 0.7;
        }
        break;

      case 'taunt':
        it.taunt = true;
        gain = 0;
        break;

      case 'regroup': {
        const ally = this._findAlly();
        if (ally) {
          _a1.set(ally.position.x - e.position.x, 0, ally.position.z - e.position.z);
          const d = _a1.length();
          if (d > 1.6) { dx = _a1.x / d; dz = _a1.z / d; gain = 0.95; }
        } else if (hasTarget) {
          dx = -s.toX; dz = -s.toZ; gain = 0.8;
        }
        break;
      }

      case 'hold':
      default:
        gain = 0;
        if (e.aware < 1) {
          // Unaware idle still turns its head — a statue reads as a bug.
          this._scanPhase += dt * 0.35;
          faceX = Math.sin(this._scanPhase * 0.7 + this.p.jitter * 6);
          faceZ = Math.cos(this._scanPhase * 0.7 + this.p.jitter * 6);
        }
        break;
    }

    // ---- never stand inside the target ---------------------------------------
    // Physics resolves the capsule overlap, but steering should not be shoving
    // into it in the first place — that is what makes crowds read as a scrum.
    if (hasTarget && this.behaviour !== 'attack' && this.behaviour !== 'feint') {
      const standoff = e.radius + (tgt.radius ?? 0.35) + 0.2;
      if (s.dist < standoff) {
        const push = (standoff - s.dist) / standoff;
        dx -= s.toX * push * 2.2;
        dz -= s.toZ * push * 2.2;
        if (gain < 0.45) gain = 0.45;
      }
    }

    // ---- boids-ish separation: allies push each other apart --------------------
    if (this._sepN > 0 && gain > 0.02) {
      const w = 0.75;
      dx += this._sepX * w;
      dz += this._sepZ * w;
    } else if (this._sepN > 1 && gain <= 0.02) {
      // Even standing still, unstack.
      dx = this._sepX; dz = this._sepZ;
      gain = 0.28;
    }

    // ---- obstacle + cliff avoidance ------------------------------------------
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) { dx /= len; dz /= len; } else { dx = 0; dz = 0; gain = 0; }

    if (gain > 0.02) {
      this._avoidTimer -= dt;
      if (this._avoidTimer <= 0) {
        this._avoidTimer = AVOID_INTERVAL;
        this._refreshAvoidance(dx, dz);
      }
      if (this._avoidBlocked) {
        gain = 0;
      } else if (this._avoidRot !== 0) {
        const c = Math.cos(this._avoidRot), sn = Math.sin(this._avoidRot);
        const nx = dx * c - dz * sn;
        const nz = dx * sn + dz * c;
        dx = nx; dz = nz;
      }
    } else {
      this._avoidBlocked = false;
      this._avoidRot = 0;
    }

    it.moveDir.set(dx, 0, dz);
    it.moveGain = gain;

    // Facing is smoothed here so the enemy's head does not snap between decisions.
    const fl = Math.hypot(faceX, faceZ);
    if (fl > 1e-4) {
      it.faceDir.x = damp(it.faceDir.x, faceX / fl, 12, dt);
      it.faceDir.z = damp(it.faceDir.z, faceZ / fl, 12, dt);
      const l2 = Math.hypot(it.faceDir.x, it.faceDir.z);
      if (l2 > 1e-4) { it.faceDir.x /= l2; it.faceDir.z /= l2; }
    }

    // Look target: eyes on the player when engaged, on the noise when curious.
    if (tgt?.position && e.aware >= 1) {
      it.lookAt.set(tgt.position.x, tgt.position.y + (tgt.height ?? 1.75) * 0.85, tgt.position.z);
      it.hasLook = true;
    } else if (e.aware === 1) {
      it.lookAt.copy(this.lastKnown);
      it.lookAt.y += 1.4;
      it.hasLook = true;
    } else {
      it.lookAt.set(
        e.position.x + faceX * 6,
        e.position.y + 1.5,
        e.position.z + faceZ * 6,
      );
      it.hasLook = false;
    }
  }

  _findAlly() {
    const mgr = this.ctx.enemies;
    if (!mgr?.nearest) return null;
    return mgr.nearest(this.enemy.position, 22, this._allyCb) || null;
  }

  // ------------------------------------------------------------- navigation aid

  /**
   * Try the desired heading, then progressively wider deflections. This is what
   * keeps an enemy off the cliff edge and out of the shrine wall without a navmesh:
   * a terrain height/slope probe plus one short physics ray.
   */
  _refreshAvoidance(dx, dz) {
    const e = this.enemy;
    const probe = 1.3 + e.speed * 0.22;
    for (let i = 0; i < AVOID_ANGLES.length; i++) {
      const a = AVOID_ANGLES[i];
      const c = Math.cos(a), s = Math.sin(a);
      const nx = dx * c - dz * s;
      const nz = dx * s + dz * c;
      if (this._dirClear(nx, nz, probe)) {
        this._avoidRot = a;
        this._avoidBlocked = false;
        return;
      }
    }
    this._avoidRot = 0;
    this._avoidBlocked = true;
  }

  _dirClear(dx, dz, probe) {
    const e = this.enemy;
    const x = e.position.x + dx * probe;
    const z = e.position.z + dz * probe;
    const terr = this.ctx.terrain;
    if (terr?.heightAt) {
      const h = terr.heightAt(x, z);
      if (Number.isFinite(h)) {
        if (e.position.y - h > 1.7) return false;    // a drop we must not walk off
        if (h - e.position.y > 1.45) return false;   // a wall of terrain
        if (terr.normalAt) {
          const n = terr.normalAt(x, z, _a6);
          if (n && (n.y ?? 1) < 0.5) return false;
        }
      }
    }
    const phys = this.ctx.physics;
    if (phys?.raycast) {
      _a2.set(e.position.x, e.position.y + e.height * 0.55, e.position.z);
      _a3.set(dx, 0, dz);
      try {
        const hit = phys.raycast(_a2, _a3, probe + e.radius, phys.LAYER?.WORLD);
        if (hit) {
          const hd = hit.distance ?? hit.t ?? hit.dist;
          if (typeof hd !== 'number' || hd < probe) return false;
        }
      } catch { /* physics stub — terrain probe stands alone */ }
    }
    return true;
  }

  dispose() {
    this.enemy = null;
    this.ctx = null;
  }
}

export default EnemyAI;
