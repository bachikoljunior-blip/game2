/**
 * Combat.js — the combat director.
 *
 * Player.js and Enemy.js own *intent* (what a character wants to do) and Rig.js owns the
 * pose. This file owns *resolution*: where the blade actually was, what it touched, and
 * what that contact feels like. Everything that reads as "weight" in a Sekiro-grade action
 * game is decided here — the parry window, the posture economy, hit-stop, and the attack
 * token pool that keeps six enemies from all swinging at once.
 *
 * Design notes that are easy to lose:
 *
 * - **Swept detection, not point tests.** A katana tip travels ~4 m in one 30 fps frame.
 *   We keep last frame's blade segment ourselves (entities are never asked to store it),
 *   span the quad between the two segments, and sub-step across it. Nothing tunnels.
 * - **Raw time everywhere.** Every window (parry, hit-stop, telegraph, execution) runs on
 *   the unscaled clock. If they ran on scaled time a hit-stop would freeze the timer that
 *   is supposed to end the hit-stop.
 * - **Posture is Sekiro's, not a health bar.** `entity.posture` *accumulates* from 0 toward
 *   `maxPosture`; reaching max is a break. It regenerates downward, slower at low health,
 *   faster the longer the entity goes unpressured. `getPostureRatio()` is the HUD's read.
 * - **Every sibling access is optional-chained.** This module is expected to keep running
 *   when Physics, FX, Audio, PostFX or even the Player failed to boot.
 * - **Zero per-frame allocation.** Scratch vectors live at module scope, hit records are
 *   pooled per entity, event payloads come from small rings, and physics queries are handed
 *   a caller-owned results array.
 */

import { Vector3 } from 'three';

/* ══════════════════════════════════════════════════════════════════════════════
 *  TUNING — every timing and magic number in the combat system lives here.
 *  All durations are in SECONDS (the millisecond figure the design calls for is
 *  in the comment). This table is expected to be edited constantly; nothing
 *  below it should contain a bare number a designer would want to change.
 * ══════════════════════════════════════════════════════════════════════════════ */
export const TUNING = {
  // ── swept hit detection ────────────────────────────────────────────────────
  SWEEP_SUBSTEPS: 4,            // blade positions tested between last frame and this one (3–5)
  SWEEP_PAD: 0.055,             // m of "blade thickness"; a graze should still read as a hit
  BROAD_SLACK: 0.75,            // m of extra radius on the cheap broadphase reject
  MULTIHIT_INTERVAL: 0.20,      // s before a `weapon.multiHit` swing may hit one target again
  SWING_MERGE: 0.12,            // s in which a beginSwing() call refines the swing the
                                // weapon.active edge already opened, instead of re-arming it
  MAX_BLADE_LENGTH: 3.0,        // m; a longer resolved segment means bad bone data — ignore it
  MAX_TRAVEL: 6.0,              // m of tip travel in one frame we still trust (teleport guard)
  FRIENDLY_FIRE: false,         // same-faction blades pass through each other

  // ── damage & poise ─────────────────────────────────────────────────────────
  BASE_DAMAGE: 12,              // fallback when weapon.damage is missing
  HEAVY_MULT: 1.85,             // damage multiplier for a heavy swing
  CRIT_MULT: 1.65,              // backstab / punish-window multiplier
  BACKSTAB_ARC: 1.92,           // rad (~110°) behind the victim that counts as a backstab
  CHIP_RESIDUE: 0.14,           // fraction of blocked damage that still reaches health
  GUARD_ARC: 2.09,              // rad (120°) total front cone a guard actually covers
  GUARD_POSTURE_MULT: 1.30,     // blocked damage converts to this much posture on the defender
  GUARD_ATTACKER_POSTURE: 0.35, // ...and this much back onto the attacker
  POISE_STAGGER_RATIO: 0.55,    // damage/poise ratio above which a hit forces a stagger clip
  STAGGER_TIME: 0.42,           // s of a normal directional stagger (420 ms)

  // ── posture ────────────────────────────────────────────────────────────────
  POSTURE_PER_DAMAGE: 0.85,     // posture added per point of damage dealt to health
  POSTURE_REGEN: 22.0,          // posture/s baseline regeneration
  POSTURE_REGEN_DELAY: 0.55,    // s of no pressure before regeneration starts at all (550 ms)
  POSTURE_REGEN_RAMP: 1.6,      // s of continued calm needed to reach the unpressured rate
  POSTURE_REGEN_CALM_MULT: 2.4, // regeneration multiplier once fully unpressured
  POSTURE_REGEN_LOW_HP: 0.32,   // regen multiplier floor at 0 health (Sekiro's cruel curve)
  POSTURE_BREAK_TIME: 2.6,      // s of helpless stagger after a break (2600 ms)
  POSTURE_BREAK_DRAIN: 0.55,    // posture left (fraction of max) after recovering from a break
  POSTURE_ESCALATE: 0.12,       // each break makes the next one this much easier (capped)

  // ── parry ──────────────────────────────────────────────────────────────────
  PARRY_PERFECT: 0.130,         // s of the perfect deflect window (130 ms)
  PARRY_LATE: 0.110,            // s of the forgiving window after that (110 ms)
  PARRY_RECOVERY: 0.18,         // s after the window closes before another parry may open
  PARRY_ARC: 2.44,              // rad (140°) in front of the defender that can be deflected
  PARRY_PERFECT_POSTURE: 26,    // posture dealt to the ATTACKER by a perfect deflect
  PARRY_LATE_POSTURE: 11,       // ...by a late one
  PARRY_SELF_POSTURE: 4.5,      // posture the defender eats on a late parry
  PARRY_LATE_DAMAGE: 0.22,      // fraction of damage that still lands on a late parry
  PARRY_STREAK_WINDOW: 3.6,     // s to land the next deflect and keep the streak alive
  PARRY_STREAK_MAX: 8,          // streak cap used to normalise the escalating FX/audio
  PARRY_STREAK_POSTURE: 0.09,   // extra attacker posture per streak step (fraction)
  PUNISH_WINDOW: 0.75,          // s of guaranteed-crit opening a perfect deflect creates
  PARRY_KNOCKBACK: 3.4,         // m/s the attacker is pushed back by a perfect deflect

  // ── weapon clash ───────────────────────────────────────────────────────────
  CLASH_TOLERANCE: 0.20,        // m between two blade segments that counts as steel-on-steel
  CLASH_POSTURE: 9,             // posture both fighters take from a clash
  CLASH_RECOIL: 2.8,            // m/s both fighters recoil at
  CLASH_COOLDOWN: 0.28,         // s before the same pair may clash again

  // ── impact feel ────────────────────────────────────────────────────────────
  HITSTOP_LIGHT: 0.045,         // s (45 ms)
  HITSTOP_HEAVY: 0.090,         // s (90 ms)
  HITSTOP_PARRY: 0.090,         // s (90 ms) — a deflect must land as heavy as a heavy hit
  HITSTOP_FINISHER: 0.160,      // s (160 ms)
  HITSTOP_SCALE: 0.045,         // time scale during a hit-stop (not 0 — a full freeze reads dead)
  HITSTOP_DEADZONE: 0.060,      // s; two hits inside this merge into one stop (60 ms)
  HEAVY_DAMAGE_THRESHOLD: 18,   // damage at or above which a hit uses the heavy stop
  SHAKE_LIGHT: 0.16,            // camera-shake amplitude for a light hit
  SHAKE_HEAVY: 0.34,            // ...for a heavy hit or a clash
  SHAKE_PARRY: 0.42,            // ...for a perfect deflect
  SHAKE_BREAK: 0.55,            // ...for a posture break or a finisher
  SHAKE_DURATION: 0.26,         // s default shake decay
  SHAKE_FREQ: 26,               // Hz of the shake oscillation
  SLOWMO_BREAK: 0.28,           // time scale of the posture-break dip
  SLOWMO_BREAK_TIME: 0.55,      // s the dip holds (550 ms)
  SLOWMO_EXEC: 0.42,            // time scale during an execution wind-up
  LUNGE_SPEED: 3.2,             // m/s the attacker drifts into their target while swinging
  LUNGE_MIN_GAP: 0.95,          // m; stop lunging here so bodies never interpenetrate
  LUNGE_MAX: 0.30,              // s of lunge per swing (300 ms)
  KNOCKBACK_LIGHT: 2.1,         // m/s impulse away from a light hit
  KNOCKBACK_HEAVY: 4.2,         // ...from a heavy hit
  KNOCKBACK_MASS: 78,           // kg reference mass; heavier entities move less
  KNOCK_DECAY: 7.5,             // 1/s exponential decay of a combat impulse

  // ── i-frames ───────────────────────────────────────────────────────────────
  DODGE_IFRAMES: 0.30,          // s granted by grantIFrames() by default (300 ms)

  // ── execution / finisher ───────────────────────────────────────────────────
  EXECUTE_RANGE: 2.05,          // m the player may start a finisher from
  EXECUTE_ARC: 1.75,            // rad (~100°) the player must be facing within
  EXEC_WINDUP: 0.42,            // s from start to the killing frame
  EXEC_RECOVER: 0.85,           // s from the killing frame to control returning
  EXEC_LETTERBOX: 0.13,         // fraction of screen height each cinematic bar takes
  EXEC_DAMAGE_MULT: 6.0,        // finisher damage multiplier (it is meant to kill)

  // ── group AI arbitration ───────────────────────────────────────────────────
  TOKEN_HOLD_MAX: 2.6,          // s a token may be held before it is reclaimed
  TOKEN_MIN_INTERVAL: 0.90,     // s minimum between two granted attacks (the anti-chaos rule)
  TOKEN_RANGED_INTERVAL: 1.6,   // s minimum between granted ranged attacks
  TOKEN_COOLDOWN: 0.55,         // s before the same enemy may hold another token
  TENSION_RADIUS: 14.0,         // m within which an enemy contributes to tension
  TENSION_SMOOTH: 1.6,          // 1/s smoothing of the published tension value

  // ── telegraphs ─────────────────────────────────────────────────────────────
  TELEGRAPH_MIN: 0.22,          // s a cue must be visible for to be readable at all
  TELEGRAPH_DEFAULT: 0.55,      // s default cue length
  TELEGRAPH_COLOR: {            // legibility is a hard requirement: colour == meaning
    unblockable: 0xd42a1e,      // 危 red — must be dodged; ignores guard AND parry
    parryable: 0xe8f0ff,        // white — deflectable
    ranged: 0xffb347,           // amber — incoming projectile
    grab: 0xb02fd0,             // violet — unblockable grab
  },

  // ── enemy parry AI (per archetype) ─────────────────────────────────────────
  ARCHETYPES: {
    // skill: base chance to attempt a deflect · react: s of reaction lag ·
    // window: multiplier on their perfect window · mass/poise: knockback resistance
    ashigaru: { skill: 0.10, react: 0.30, window: 0.75, mass: 72, poise: 14 },
    ronin: { skill: 0.30, react: 0.21, window: 1.00, mass: 80, poise: 20 },
    yumi: { skill: 0.04, react: 0.36, window: 0.60, mass: 66, poise: 10 },
    oni: { skill: 0.06, react: 0.38, window: 0.55, mass: 150, poise: 42 },
    samurai: { skill: 0.46, react: 0.16, window: 1.20, mass: 84, poise: 26 },
    default: { skill: 0.16, react: 0.26, window: 0.85, mass: 78, poise: 18 },
  },
  SPAM_PARRY_BONUS: 0.55,       // added parry chance when the player repeats one attack
  SPAM_DECAY: 0.55,             // multiplier on the spam score when the player mixes it up
  SPAM_REPEAT_WINDOW: 1.1,      // s within which a repeated attack counts as spam

  // ── difficulty & assists ───────────────────────────────────────────────────
  // `scale` is the single scalar EnemyAI reads off `ctx.combat.difficulty`; it must
  // stay inside the 0.4–2.2 band Enemy.js clamps to.
  DEFAULT_DIFFICULTY: 'normal', // generous but not trivial — the touch-play default
  DIFFICULTY: {
    story: {
      scale: 0.55,
      enemyDamage: 0.55, playerDamage: 1.25, aggression: 0.55, parryScale: 1.60,
      aimAssist: 1.00, melee: 1, ranged: 1, interval: 1.30, postureGain: 0.80,
      enemyParry: 0.45,
    },
    normal: {
      scale: 1.00,
      enemyDamage: 0.85, playerDamage: 1.00, aggression: 0.80, parryScale: 1.25,
      aimAssist: 0.70, melee: 2, ranged: 1, interval: 0.90, postureGain: 1.00,
      enemyParry: 0.80,
    },
    hard: {
      scale: 1.40,
      enemyDamage: 1.15, playerDamage: 0.92, aggression: 1.00, parryScale: 1.00,
      aimAssist: 0.38, melee: 2, ranged: 1, interval: 0.78, postureGain: 1.15,
      enemyParry: 1.00,
    },
    kagerou: {
      scale: 1.90,
      enemyDamage: 1.55, playerDamage: 0.85, aggression: 1.25, parryScale: 0.85,
      aimAssist: 0.12, melee: 3, ranged: 1, interval: 0.62, postureGain: 1.30,
      enemyParry: 1.30,
    },
  },

  // ── projectiles (Enemy.js hands us kunai/shuriken through spawnProjectile) ──
  PROJECTILE_MAX: 24,           // pooled projectiles in flight; beyond this the oldest recycles
  PROJECTILE_RADIUS: 0.075,     // m of the projectile body, used for the swept overlap test
  PROJECTILE_LIFE: 2.4,         // s default lifetime when the caller does not give one
  PROJECTILE_GRAVITY: -3.2,     // m/s²; a thrown blade drops a little, an arrow barely
  PROJECTILE_POISE: 7,          // poise of a projectile hit (light — it should not floor you)
  PROJECTILE_SUBSTEPS: 3,       // sweep sub-steps per frame; a 24 m/s kunai must not tunnel
  PROJECTILE_PARRY_POSTURE: 8,  // posture a deflected projectile returns to its thrower

  // ── aim assist ─────────────────────────────────────────────────────────────
  ASSIST_RANGE: 4.6,            // m within which a swing bends toward a target
  ASSIST_ARC: 1.40,             // rad (~80°) of search cone
  ASSIST_MAX_TURN: 0.80,        // rad the assist may rotate a swing by at full strength

  // ── demo / capture rig ─────────────────────────────────────────────────────
  DEMO_SEED: 0x5a3c19f7,        // fixed RNG seed so __demoParry is identical every run
  DEMO_GAP: 1.70,               // m between the two staged fighters
  DEMO_PULSES: 3,               // FX pulses so the capture always lands on a lit frame
  DEMO_PULSE_GAP: 0.80,         // s between those pulses
  DEMO_SLOWMO: 0.30,            // time scale held through the staged clash
  DEMO_HOLD: 2.8,               // s the staged pose is held
};

/* ── module-scope scratch (never allocate inside update) ───────────────────── */
const _vA = new Vector3(), _vB = new Vector3(), _vC = new Vector3(), _vD = new Vector3();
const _vE = new Vector3(), _vF = new Vector3(), _vG = new Vector3(), _vH = new Vector3();
const _p0 = new Vector3(), _p1 = new Vector3();
const _c1 = new Vector3(), _c2 = new Vector3();
const _d1 = new Vector3(), _d2 = new Vector3(), _r = new Vector3();
const _hbA = new Vector3(), _hbB = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwdDefault = new Vector3(0, 0, -1);

const EPS = 1e-8;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic PRNG so the capture rig and the demo staging never drift. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Closest points between segments p1q1 and p2q2 (Ericson, Real-Time Collision Detection).
 * Writes the two closest points and returns the squared distance between them.
 */
function segmentSegment(p1, q1, p2, q2, out1, out2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.lengthSq();
  const e = _d2.lengthSq();
  const f = _d2.dot(_r);
  let s, t;

  if (a <= EPS && e <= EPS) {
    out1.copy(p1); out2.copy(p2);
    return out1.distanceToSquared(out2);
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = _d1.dot(_r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  out1.copy(p1).addScaledVector(_d1, s);
  out2.copy(p2).addScaledVector(_d2, t);
  return out1.distanceToSquared(out2);
}

/** Unsigned horizontal angle (rad) between an entity's facing and a world direction. */
function facingAngle(forward, dir) {
  const fx = forward.x, fz = forward.z;
  const flen = Math.hypot(fx, fz) || 1;
  const dx = dir.x, dz = dir.z;
  const dlen = Math.hypot(dx, dz) || 1;
  const dot = clamp((fx * dx + fz * dz) / (flen * dlen), -1, 1);
  return Math.acos(dot);
}

/** +1 when `dir` lies to the entity's left, −1 to its right (Y-up, right-handed). */
function sideOf(forward, dir) {
  const cy = forward.z * dir.x - forward.x * dir.z;
  return cy >= 0 ? 1 : -1;
}

/** Small ring of pooled payload objects; handlers that retain get a few frames of grace. */
function makeRing(n, factory) {
  const items = new Array(n);
  for (let i = 0; i < n; i++) items[i] = factory();
  let idx = 0;
  return () => { const it = items[idx]; idx = (idx + 1) % n; return it; };
}

/** Per-entity combat record. Pooled and reset, never reallocated per frame. */
class CombatRecord {
  constructor(uid) {
    this.uid = uid;
    this.entity = null;
    this.alive = true;
    this.seen = 0;

    // blade tracking (we own prev/current so entities never have to)
    this.base = new Vector3();
    this.tip = new Vector3();
    this.prevBase = new Vector3();
    this.prevTip = new Vector3();
    this.hasPrev = false;
    this.bladeValid = false;

    // swing
    this.swinging = false;
    this.swingId = 0;
    this.swingStart = 0;
    this.swingHeavy = false;
    this.swingKind = 'slash';
    this.swingDamage = null;
    this.swingPoise = null;
    this.swingPosture = null;
    this.swingMulti = false;
    this.hitIds = [];
    this.hitTimes = [];

    // defence
    this.guarding = false;
    this.guardUntil = 0;
    this.parryStart = -999;
    this.parryEnd = -999;
    this.parryReady = 0;
    this.parrySched = -1;
    this.streak = 0;
    this.streakUntil = 0;
    this.iframeUntil = 0;
    this.punishUntil = 0;

    // posture (mode: 0 unknown, +1 fills 0→max, −1 drains max→0)
    this.lastPressure = -999;
    this.calm = 0;
    this.brokenUntil = 0;
    this.breaks = 0;
    this.staggerUntil = 0;
    this.postureMode = 0;
    this.postureSeen = 0;
    this.selfRegen = false;

    // impulses
    this.knock = new Vector3();
    this.lungeUntil = 0;
    this.lungeTarget = null;

    // telegraph
    this.telegraphKind = null;
    this.telegraphUntil = 0;
    this.telegraphDur = 0;

    // arbitration
    this.token = null;
    this.tokenUntil = 0;
    this.tokenCooldown = 0;
    this.lastAttack = -999;

    this.lastClash = -999;
  }

  reset(entity) {
    this.entity = entity;
    this.alive = true;
    this.hasPrev = false;
    this.bladeValid = false;
    this.swinging = false;
    this.swingId = 0;
    this.swingDamage = null;
    this.swingPoise = null;
    this.swingPosture = null;
    this.swingMulti = false;
    this.swingHeavy = false;
    this.swingKind = 'slash';
    this.hitIds.length = 0;
    this.hitTimes.length = 0;
    this.guarding = false;
    this.guardUntil = 0;
    this.parryStart = -999;
    this.parryEnd = -999;
    this.parryReady = 0;
    this.parrySched = -1;
    this.streak = 0;
    this.streakUntil = 0;
    this.iframeUntil = 0;
    this.punishUntil = 0;
    this.lastPressure = -999;
    this.calm = 0;
    this.brokenUntil = 0;
    this.breaks = 0;
    this.staggerUntil = 0;
    this.postureMode = 0;
    this.postureSeen = entity?.posture ?? 0;
    this.selfRegen = false;
    this.knock.set(0, 0, 0);
    this.lungeUntil = 0;
    this.lungeTarget = null;
    this.telegraphKind = null;
    this.telegraphUntil = 0;
    this.telegraphDur = 0;
    this.token = null;
    this.tokenUntil = 0;
    this.tokenCooldown = 0;
    this.lastAttack = -999;
    this.lastClash = -999;
    return this;
  }
}

export class CombatDirector {
  constructor(ctx) {
    this.ctx = ctx;

    /** Raw (unscaled) combat clock. Every window in this file is measured against it. */
    this.time = 0;
    /** Published 0..1 threat score. Audio drives the score from it; Weather/Post may too. */
    this.tension = 0;
    /** Live parry streak of the player, mirrored here for the HUD. */
    this.parryStreak = 0;
    this.enabled = true;

    /**
     * `difficulty` is the NUMERIC scalar EnemyAI multiplies its damage/aggression by
     * (Enemy.js clamps it to 0.4–2.2); `difficultyName` is the preset key. Keeping the
     * number on the short name is deliberate — that is the property the AI reads.
     */
    this.difficultyName = TUNING.DEFAULT_DIFFICULTY;
    this.diff = TUNING.DIFFICULTY[this.difficultyName];
    this.difficulty = this.diff.scale;

    this._rand = mulberry32(TUNING.DEMO_SEED);
    this._uid = 1;
    this._swingSeq = 1;

    this._records = new Map();
    this._pool = [];
    this._entities = [];
    this._overlapOut = [];          // caller-supplied results array for physics queries
    this._physCandidates = [];
    this._frame = 0;

    // hit-stop / slow-mo arbitration
    this._stopUntil = -999;
    this._stopStart = -999;
    this._stopScale = 1;
    this._slowUntil = -999;
    this._slowScale = 1;
    this._timeScaleApplied = 1;

    // attack tokens
    this._tokens = { melee: [], ranged: [] };
    this._lastGrantMelee = -999;
    this._lastGrantRanged = -999;

    // player attack-spam tracking (drives how eagerly enemies deflect)
    this._spam = 0;
    this._lastPlayerKind = '';
    this._lastPlayerSwing = -999;

    // execution state machine
    this._exec = {
      active: false, phase: 0, t: 0, attacker: null, victim: null,
      point: new Vector3(), dir: new Vector3(),
    };

    // demo staging for the screenshot rig
    this._demo = { active: false, t: 0, pulses: 0, a: null, b: null, point: new Vector3() };

    // projectile pool — pre-allocated, never grown at runtime
    this._projectiles = new Array(TUNING.PROJECTILE_MAX);
    for (let i = 0; i < TUNING.PROJECTILE_MAX; i++) {
      this._projectiles[i] = {
        alive: false, owner: null, kind: 'kunai', damage: 0, posture: 0, poise: 0,
        speed: 0, life: 0, age: 0, gravity: 0, radius: TUNING.PROJECTILE_RADIUS,
        pos: new Vector3(), prev: new Vector3(), vel: new Vector3(), spawn: 0,
      };
    }
    this._projCursor = 0;
    this._rayOut = null;            // lazily borrowed from PhysicsWorld, then reused

    // pooled event payloads
    // `direction`, `posture`, `heavy`, `unblockable`, `blocked`, `parried` and
    // `guarded` are additive fields Player/Enemy/Effects read; the seven fields the
    // contract names are always present and always mean exactly what §2 says.
    this._hitP = makeRing(6, () => ({
      attacker: null, target: null, point: new Vector3(), normal: new Vector3(),
      damage: 0, poise: 0, kind: 'slash', crit: false,
      direction: new Vector3(), posture: 0, heavy: false, unblockable: false,
      blocked: false, parried: false, guarded: undefined,
    }));
    this._parryP = makeRing(4, () => ({
      defender: null, attacker: null, point: new Vector3(), perfect: false,
    }));
    this._clashP = makeRing(4, () => ({ a: null, b: null, point: new Vector3() }));
    this._deathP = makeRing(4, () => ({
      entity: null, point: new Vector3(), direction: new Vector3(),
    }));
    this._slashP = makeRing(4, () => ({
      entity: null, from: new Vector3(), to: new Vector3(), arc: 0, heavy: false,
    }));
    this._dmgP = makeRing(6, () => ({ entity: null, amount: 0, direction: new Vector3() }));
    this._shakeP = makeRing(6, () => ({
      amount: 0, duration: 0, freq: 0, dir: new Vector3(),
    }));
    this._stopP = makeRing(4, () => ({ scale: 1, duration: 0 }));
    this._breakP = makeRing(3, () => ({ entity: null }));
    this._telP = makeRing(4, () => ({
      entity: null, kind: 'parryable', duration: 0, color: 0xffffff,
    }));
    this._execP = makeRing(3, () => ({ attacker: null, victim: null, phase: 'start' }));
    this._streakP = makeRing(3, () => ({ defender: null, streak: 0, perfect: false }));

    this._onDeath = (p) => this._releaseAllFor(p?.entity);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  system interface
   * ══════════════════════════════════════════════════════════════════════════ */

  async init() {
    this.setDifficulty(this._readStoredDifficulty() || TUNING.DEFAULT_DIFFICULTY);
    // A dead entity's attack token has to come back immediately or the pool starves,
    // and Enemy.js may kill an entity without going through us (a cliff fall, a script).
    this.ctx?.bus?.on?.('death', this._onDeath);
    return this;
  }

  update(dt, elapsed, rawDt) {
    if (!this.enabled) return;
    const rdt = Math.min(0.1, rawDt != null ? rawDt : (dt || 0));
    this.time += rdt;
    this._frame++;
    const now = this.time;

    this._collectEntities();
    this._updateRecords(rdt, now);
    this._updateDemo(rdt);
    this._clashPass(now);
    this._sweepPass(now);
    this._updateProjectiles(rdt, now);
    this._integrateImpulses(rdt);
    this._updateTokens(now);
    this._updateTension(rdt);
    this._updateExecution(rdt);
    this._updateTimeScale(now);
  }

  dispose() {
    this.ctx?.bus?.off?.('death', this._onDeath);
    this._records.clear();
    this._pool.length = 0;
    this._entities.length = 0;
    this._tokens.melee.length = 0;
    this._tokens.ranged.length = 0;
    this._exec.active = false;
    this._demo.active = false;
    this.ctx?.engine?.setTimeScale?.(1, true);
    this.ctx?.pipeline?.setLetterbox?.(0, 0);
  }

  applyQuality() { /* combat resolution is deliberately tier-independent */ }

  /* ══════════════════════════════════════════════════════════════════════════
   *  PUBLIC API — intent in, resolution out
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Open a parry window on `entity`: perfect for TUNING.PARRY_PERFECT, late for
   * TUNING.PARRY_LATE after that, then it degrades into a plain guard.
   * @returns {boolean} false when the request was eaten by the anti-mash cooldown
   *                    (the entity still ends up guarding).
   */
  requestParry(entity) {
    if (!entity) return false;
    const rec = this._rec(entity);
    if (!rec) return false;
    const now = this.time;
    if (now < rec.parryReady) { rec.guarding = true; rec.guardUntil = now + 0.25; return false; }

    const scale = this._parryScaleFor(entity);
    rec.parryStart = now;
    rec.parryEnd = now + (TUNING.PARRY_PERFECT + TUNING.PARRY_LATE) * scale;
    rec.parryReady = rec.parryEnd + TUNING.PARRY_RECOVERY;
    // The window decaying into a guard is what makes a mistimed parry survivable.
    rec.guarding = true;
    rec.guardUntil = rec.parryEnd + 0.35;
    return true;
  }

  /** Hold/release a plain guard. `entity.state === 'guard'` is honoured as a fallback. */
  setGuard(entity, on, holdSeconds) {
    const rec = this._rec(entity);
    if (!rec) return;
    rec.guarding = !!on;
    rec.guardUntil = on ? this.time + (holdSeconds != null ? holdSeconds : 3600) : 0;
  }

  /** True while `entity` is inside any deflect window. */
  isParrying(entity) {
    const rec = this._records.get(entity);
    return !!rec && this.time < rec.parryEnd;
  }

  /** 1 = perfect window, 0.5 = late window, 0 = no window. HUD feedback reads this. */
  parryQuality(entity) {
    const rec = this._records.get(entity);
    if (!rec || this.time >= rec.parryEnd) return 0;
    return (this.time - rec.parryStart) <= TUNING.PARRY_PERFECT * this._parryScaleFor(entity)
      ? 1 : 0.5;
  }

  /** Grant invulnerability frames (a dodge roll's i-frames). */
  grantIFrames(entity, seconds) {
    const rec = this._rec(entity);
    if (!rec) return;
    rec.iframeUntil = Math.max(rec.iframeUntil, this.time + (seconds ?? TUNING.DODGE_IFRAMES));
  }

  /**
   * Optional metadata for a swing. Entities do not have to call this — the director
   * detects the rising edge of `weapon.active` itself — but calling it lets an attack
   * declare heavy / multi-hit / kind and override the damage for this swing only.
   */
  beginSwing(entity, opts) {
    const rec = this._rec(entity);
    if (!rec) return 0;
    // Player.js may call this in the same frame we already detected the rising edge of
    // `weapon.active`; refine that swing rather than re-arming its per-swing hit set,
    // which would let one animation hit the same target twice.
    if (rec.swinging && this.time - rec.swingStart < TUNING.SWING_MERGE) {
      this._applySwingOpts(rec, entity, opts);
      return rec.swingId;
    }
    this._openSwing(rec, entity, opts, this.time);
    return rec.swingId;
  }

  /**
   * Compatibility alias for the attack-descriptor shape Player.js builds
   * (`{ entity, move, clip, damage, poise, kind, reach, heavy, finisher, base, tip }`).
   * Everything routes through beginSwing; `base`/`tip` are adopted as the live blade
   * segment so we sweep exactly the geometry the trail ribbon draws.
   */
  beginAttack(info) {
    const e = info?.entity;
    if (!e) return 0;
    if (info.base?.isVector3 && info.tip?.isVector3 && e.weapon) {
      e.weapon.base = info.base;
      e.weapon.tip = info.tip;
    }
    return this.beginSwing(e, info);
  }

  /** Compatibility alias for `endSwing`. */
  endAttack(entity) { this.endSwing(entity?.entity || entity); }

  /** Close a swing early (animation cancel, stagger interrupt, deflect). */
  endSwing(entity) {
    const rec = this._records.get(entity);
    if (!rec || !rec.swinging) return;
    rec.swinging = false;
    rec.hitIds.length = 0;
    rec.hitTimes.length = 0;
    rec.lungeUntil = 0;
    rec.lungeTarget = null;
  }

  /**
   * Damage that did not come from a blade sweep (arrows, explosions, environment).
   * Runs the same resolution pipeline; pass `{ ignoreDefence: true }` to skip
   * parry/guard entirely (fall damage, scripted deaths).
   */
  applyDamage(attacker, target, amount, opts) {
    if (!target) return false;
    const point = _vA;
    if (opts?.point) point.copy(opts.point);
    else this._centerOf(target, point);

    const normal = _vB;
    if (opts?.normal) normal.copy(opts.normal);
    else {
      const src = attacker?.position || attacker?.root?.position;
      if (src) normal.subVectors(point, src).setY(0);
      else normal.copy(_fwdDefault);
    }
    if (normal.lengthSq() < EPS) normal.copy(_fwdDefault); else normal.normalize();

    return this._resolveContact(
      attacker, target, point, normal,
      amount, opts?.kind || 'blunt', !!opts?.heavy,
      opts?.ignoreDefence === true, opts?.poise,
    );
  }

  /**
   * Launch a projectile (Enemy.js hands us kunai/shuriken from the Shinobi's ranged
   * move). Accepts the descriptor Enemy already builds:
   *   { owner, kind, origin:Vector3, direction:Vector3, speed, damage, posture, life }
   * Vectors are copied — the caller may reuse its scratch immediately.
   *
   * A projectile is swept exactly like a blade and resolved through the same pipeline,
   * so it can be dodged (i-frames), deflected (a perfect parry returns posture to the
   * thrower and destroys it) or guarded (chip + posture). Returns true when we took
   * ownership, which tells the caller not to spawn its own visual-only fallback.
   */
  spawnProjectile(opts) {
    if (!opts?.origin || !opts?.direction) return false;
    const list = this._projectiles;
    let p = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[(this._projCursor + i) % list.length];
      if (!c.alive) { p = c; break; }
    }
    if (!p) {
      // Pool exhausted: recycle the oldest rather than allocate or drop the shot.
      let oldest = list[0];
      for (let i = 1; i < list.length; i++) if (list[i].spawn < oldest.spawn) oldest = list[i];
      p = oldest;
    }
    this._projCursor = (this._projCursor + 1) % list.length;

    p.alive = true;
    p.owner = opts.owner || null;
    p.kind = opts.kind || 'kunai';
    p.damage = opts.damage ?? TUNING.BASE_DAMAGE * 0.6;
    p.posture = opts.posture ?? p.damage * 0.7;
    p.poise = opts.poise ?? TUNING.PROJECTILE_POISE;
    p.speed = opts.speed || 24;
    p.life = opts.life || TUNING.PROJECTILE_LIFE;
    p.gravity = opts.gravity ?? TUNING.PROJECTILE_GRAVITY;
    p.radius = opts.radius ?? TUNING.PROJECTILE_RADIUS;
    p.age = 0;
    p.spawn = this.time;
    p.pos.copy(opts.origin);
    p.prev.copy(opts.origin);
    p.vel.copy(opts.direction);
    if (p.vel.lengthSq() < EPS) p.vel.copy(_fwdDefault);
    p.vel.normalize().multiplyScalar(p.speed);

    this.ctx.fx?.spawnProjectile?.(p.pos, opts.direction, p.speed, p.kind);
    return true;
  }

  /** Projectiles in flight (debug/HUD). */
  get projectileCount() {
    let n = 0;
    for (let i = 0; i < this._projectiles.length; i++) if (this._projectiles[i].alive) n++;
    return n;
  }

  /** Direct posture pressure (a shove, a heavy block, a shout). */
  addPosture(entity, amount, sourceDir) { this._addPosture(entity, amount, sourceDir); }

  /**
   * 0..1 posture *pressure* — 0 is composed, 1 is broken — regardless of whether the
   * entity counts posture up (Player) or down (Enemy). This is the HUD's read.
   */
  getPostureRatio(entity) {
    if (!entity) return 0;
    const rec = this._records.get(entity);
    if (!rec) {
      const max = entity.maxPosture || 100;
      return clamp01((entity.posture ?? 0) / max);
    }
    this._classifyPosture(entity, rec);
    return this._pressureOf(entity, rec);
  }

  /** True while the entity is in the helpless window after a posture break. */
  isPostureBroken(entity) {
    if (!entity) return false;
    if (entity.state === 'postureBroken' || entity.state === 'posture_break') return true;
    const rec = this._records.get(entity);
    return !!rec && this.time < rec.brokenUntil;
  }

  /** True while a perfect deflect has left `entity` open to a guaranteed crit. */
  isPunishable(entity) {
    const rec = this._records.get(entity);
    return !!rec && this.time < rec.punishUntil;
  }

  /** Seconds of stagger/break lockout remaining — the AI uses it to pick a reaction. */
  staggerRemaining(entity) {
    const rec = this._records.get(entity);
    if (!rec) return 0;
    return Math.max(0, Math.max(rec.brokenUntil, rec.staggerUntil) - this.time);
  }

  /** Can the player start a finisher on `target` right now? */
  canExecute(target, attacker) {
    const atk = attacker || this.ctx?.player;
    if (!atk || !target || this._exec.active) return false;
    if (atk.isAlive === false || target.isAlive === false) return false;
    if (!this.isPostureBroken(target)) return false;
    const ap = atk.position || atk.root?.position;
    const tp = target.position || target.root?.position;
    if (!ap || !tp) return false;
    _vA.subVectors(tp, ap);
    _vA.y = 0;
    const dist = _vA.length();
    if (dist > TUNING.EXECUTE_RANGE) return false;
    if (dist > EPS) {
      _vA.divideScalar(dist);
      const fwd = atk.forward && atk.forward.lengthSq() > EPS ? atk.forward : _fwdDefault;
      if (facingAngle(fwd, _vA) > TUNING.EXECUTE_ARC * 0.5) return false;
    }
    return true;
  }

  /**
   * Run the paired finisher: `execution_attacker` / `execution_victim` clips on the two
   * rigs, a cinematic camera push, letterbox, slow-mo, a 160 ms stop on the killing
   * frame and a decisive audio beat.
   */
  execute(target, attacker) {
    const atk = attacker || this.ctx?.player;
    if (!this.canExecute(target, atk)) return false;

    const ex = this._exec;
    ex.active = true;
    ex.phase = 0;
    ex.t = 0;
    ex.attacker = atk;
    ex.victim = target;
    this._centerOf(target, ex.point);
    const ap = atk.position || atk.root?.position;
    const tp = target.position || target.root?.position;
    if (ap && tp) ex.dir.subVectors(tp, ap).setY(0); else ex.dir.copy(_fwdDefault);
    if (ex.dir.lengthSq() < EPS) ex.dir.copy(_fwdDefault); else ex.dir.normalize();

    // Both fighters are locked out of their own controllers for the duration.
    atk.invulnerable = true;
    target.invulnerable = true;
    this._setState(atk, 'attack');
    this._setState(target, 'stagger');
    const total = TUNING.EXEC_WINDUP + TUNING.EXEC_RECOVER;
    this._playClip(atk, 'execution_attacker', total);
    this._playClip(target, 'execution_victim', total);
    atk.onExecuteStart?.(target);
    target.onExecuted?.(atk);

    this.ctx?.pipeline?.setLetterbox?.(TUNING.EXEC_LETTERBOX, 0.25);
    this._slowMo(TUNING.SLOWMO_EXEC, TUNING.EXEC_WINDUP);
    this.ctx?.playerCamera?.cinematic?.(true, target);
    this.ctx?.playerCamera?.push?.(0.55, TUNING.EXEC_WINDUP);
    this.ctx?.audio?.cue?.('execution');

    const p = this._execP();
    p.attacker = atk; p.victim = target; p.phase = 'start';
    this.ctx?.bus?.emit?.('execution', p);
    return true;
  }

  /**
   * Request permission to commit to an attack. Only token holders may swing; everyone
   * else circles, feints and repositions. This is what makes a group read as
   * choreographed instead of chaotic.
   */
  requestToken(enemy, kind) {
    if (!enemy || enemy.isAlive === false) return false;
    const k = kind === 'ranged' ? 'ranged' : 'melee';
    const rec = this._rec(enemy);
    if (!rec) return false;
    const now = this.time;
    if (rec.token === k) { rec.tokenUntil = now + TUNING.TOKEN_HOLD_MAX; return true; }
    if (rec.token) return false;
    if (now < rec.tokenCooldown) return false;
    if (now < rec.brokenUntil || now < rec.staggerUntil) return false;

    const pool = this._tokens[k];
    const cap = k === 'ranged' ? this.diff.ranged : this.diff.melee;
    if (pool.length >= cap) return false;

    // The minimum interval is what stops two unblockables landing on the same frame.
    const interval = k === 'ranged' ? TUNING.TOKEN_RANGED_INTERVAL : this.diff.interval;
    const last = k === 'ranged' ? this._lastGrantRanged : this._lastGrantMelee;
    if (now - last < interval) return false;
    // Cross-pool floor: a melee and a ranged commit still cannot coincide.
    if (now - Math.max(this._lastGrantMelee, this._lastGrantRanged) <
      TUNING.TOKEN_MIN_INTERVAL * 0.55) return false;

    pool.push(enemy);
    rec.token = k;
    rec.tokenUntil = now + TUNING.TOKEN_HOLD_MAX;
    rec.lastAttack = now;
    if (k === 'ranged') this._lastGrantRanged = now; else this._lastGrantMelee = now;
    return true;
  }

  /** Hand a token back. Safe to call for an enemy that holds nothing. */
  releaseToken(enemy) {
    const rec = this._records.get(enemy);
    if (!rec || !rec.token) return;
    const pool = this._tokens[rec.token];
    const i = pool.indexOf(enemy);
    if (i >= 0) pool.splice(i, 1);
    rec.token = null;
    rec.tokenUntil = 0;
    rec.tokenCooldown = this.time + TUNING.TOKEN_COOLDOWN;
  }

  hasToken(enemy) {
    const rec = this._records.get(enemy);
    return !!rec && rec.token != null;
  }

  /** 0..1 fraction of the attack pool currently committed (AI/debug read). */
  tokenLoad() {
    return (this._tokens.melee.length + this._tokens.ranged.length) /
      Math.max(1, this.diff.melee + this.diff.ranged);
  }

  /** Seconds until the next attack may be granted — AI times a feint against it. */
  timeToNextAttack(kind) {
    const ranged = kind === 'ranged';
    const interval = ranged ? TUNING.TOKEN_RANGED_INTERVAL : this.diff.interval;
    const last = ranged ? this._lastGrantRanged : this._lastGrantMelee;
    return Math.max(0, interval - (this.time - last));
  }

  /**
   * Show a readable cue. Red = 危 unblockable (must be dodged, ignores guard AND parry),
   * white = parryable, amber = ranged, violet = grab. Returns the duration used.
   */
  registerTelegraph(entity, kind, duration) {
    const rec = this._rec(entity);
    if (!rec) return 0;
    const k = TUNING.TELEGRAPH_COLOR[kind] != null ? kind : 'parryable';
    const dur = Math.max(TUNING.TELEGRAPH_MIN, duration || TUNING.TELEGRAPH_DEFAULT);
    rec.telegraphKind = k;
    rec.telegraphDur = dur;
    rec.telegraphUntil = this.time + dur;

    const p = this._telP();
    p.entity = entity; p.kind = k; p.duration = dur; p.color = TUNING.TELEGRAPH_COLOR[k];
    this.ctx?.bus?.emit?.('telegraph', p);
    this.ctx?.fx?.telegraph?.(entity, k, dur);
    this.ctx?.audio?.cue?.(k === 'unblockable' ? 'telegraph_danger' : 'telegraph');
    return dur;
  }

  /** Current cue kind on an entity, or null. The HUD draws the 危 glyph from this. */
  getTelegraph(entity) {
    const rec = this._records.get(entity);
    if (!rec || this.time >= rec.telegraphUntil) return null;
    return rec.telegraphKind;
  }

  /** Nearest living hostile inside a cone, or null. */
  nearestTarget(entity, maxDist, arc) {
    if (!entity) return null;
    const from = entity.position || entity.root?.position;
    if (!from) return null;
    const range = maxDist ?? TUNING.ASSIST_RANGE;
    const cone = arc ?? TUNING.ASSIST_ARC;
    const fwd = entity.forward && entity.forward.lengthSq() > EPS ? entity.forward : _fwdDefault;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < this._entities.length; i++) {
      const t = this._entities[i];
      if (!t || t === entity) continue;
      if (t.faction === entity.faction) continue;
      if (t.isAlive === false || t.state === 'dead') continue;
      const tp = t.position || t.root?.position;
      if (!tp) continue;
      _vA.subVectors(tp, from); _vA.y = 0;
      const d = _vA.length();
      if (d > range || d < EPS) continue;
      _vA.divideScalar(d);
      const ang = facingAngle(fwd, _vA);
      if (ang > cone * 0.5) continue;
      // Prefer close and central; this weighting is what makes the assist feel intentional.
      const score = d * (1 + ang * 0.9);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /**
   * Aim assist: bends the unit XZ direction `outDir` toward the best target by at most
   * ASSIST_MAX_TURN * strength. Returns the target it snapped toward, or null.
   */
  aimAssist(entity, outDir, strength) {
    const s = strength != null ? strength : this.diff.aimAssist;
    if (!entity || !outDir || s <= 0) return null;
    const target = this.nearestTarget(entity, TUNING.ASSIST_RANGE, TUNING.ASSIST_ARC);
    if (!target) return null;
    const from = entity.position || entity.root?.position;
    const tp = target.position || target.root?.position;
    if (!from || !tp) return null;
    _vA.subVectors(tp, from); _vA.y = 0;
    if (_vA.lengthSq() < EPS) return null;
    _vA.normalize();
    const ang = facingAngle(outDir, _vA);
    const maxTurn = TUNING.ASSIST_MAX_TURN * clamp01(s);
    const t = ang <= EPS ? 1 : clamp01(maxTurn / ang);
    outDir.lerp(_vA, t);
    outDir.y = 0;
    if (outDir.lengthSq() > EPS) outDir.normalize();
    return target;
  }

  /** Switch difficulty: enemy damage/aggression, parry width, aim assist, token count. */
  setDifficulty(name) {
    const key = TUNING.DIFFICULTY[name] ? name : TUNING.DEFAULT_DIFFICULTY;
    this.difficultyName = key;
    this.diff = TUNING.DIFFICULTY[key];
    this.difficulty = this.diff.scale;
    // Shrink the pools immediately if the new tier allows fewer simultaneous attackers.
    this._trimPool('melee', this.diff.melee);
    this._trimPool('ranged', this.diff.ranged);
    try { localStorage.setItem('kagerou.difficulty', key); } catch { /* private mode */ }
    return key;
  }

  /** Aggression multiplier the AI should scale its approach/attack rates by. */
  get aggression() { return this.diff.aggression; }

  /** Manual hit-stop (seconds). Overlapping stops extend, never fight. */
  hitStop(duration, scale) { this._hitStop(duration, scale); }

  /** Manual slow-motion dip (seconds). */
  slowMo(scale, duration) { this._slowMo(scale, duration); }

  /** Manual camera shake, direction-aware. */
  shake(amount, duration, dir, freq) { this._shake(amount, duration, dir, freq); }

  /**
   * Deterministically stage a parry clash and fire the whole effect chain.
   * Driven by tools/capture.mjs — it must produce the same frame every run, and it
   * must still do something legible when Player/Enemy failed to boot.
   */
  __demoParry() {
    this._rand = mulberry32(TUNING.DEMO_SEED);
    this._collectEntities();

    const player = this.ctx?.player || null;
    let foe = null;
    const list = this.ctx?.enemies?.list;
    if (Array.isArray(list)) {
      if (list.length === 0) this.ctx?.enemies?.spawnWave?.(1);
      const l2 = this.ctx?.enemies?.list;
      if (Array.isArray(l2)) {
        for (let i = 0; i < l2.length; i++) {
          if (l2[i] && l2[i].isAlive !== false) { foe = l2[i]; break; }
        }
      }
    }

    const d = this._demo;
    d.a = player; d.b = foe;
    d.active = true; d.t = 0; d.pulses = 0;

    if (player && foe) {
      // Stage the pose: face each other across DEMO_GAP, blades crossed at chest height.
      const pp = player.position || player.root?.position;
      const fp = foe.position || foe.root?.position;
      if (pp && fp) {
        _vA.subVectors(fp, pp); _vA.y = 0;
        if (_vA.lengthSq() < EPS) _vA.copy(_fwdDefault); else _vA.normalize();
        fp.copy(pp).addScaledVector(_vA, TUNING.DEMO_GAP);
        foe.root?.position?.copy?.(fp);
        this._faceAlong(player, _vA, 1);
        this._faceAlong(foe, _vA, -1);
        d.point.copy(pp).addScaledVector(_vA, TUNING.DEMO_GAP * 0.5);
        d.point.y = (pp.y || 0) + 1.32;
      } else {
        this._cameraAnchor(d.point);
        _vA.copy(_fwdDefault);
      }
      this._setState(player, 'parry');
      this._setState(foe, 'attack');
      if (foe.weapon) foe.weapon.active = true;
      player.invulnerable = false;
      const prec = this._rec(player);
      if (prec) { prec.streak = 3; prec.streakUntil = this.time + TUNING.DEMO_HOLD + 1; }
      this.parryStreak = 3;
      this.requestParry(player);
      this._doParry(player, foe, d.point, _vA, true, this._weaponDamage(foe));
    } else {
      // No fighters: still fire the effect chain in front of the camera so the
      // capture shows the parry language rather than an empty frame.
      this._cameraAnchor(d.point);
      this._parryFX(d.point, _fwdDefault, true, 3);
      this._hitStop(TUNING.HITSTOP_PARRY, TUNING.HITSTOP_SCALE);
      this._shake(TUNING.SHAKE_PARRY, TUNING.SHAKE_DURATION, _fwdDefault);
      const p = this._parryP();
      p.defender = player; p.attacker = foe; p.point.copy(d.point); p.perfect = true;
      this.ctx?.bus?.emit?.('parry', p);
    }
    this._slowMo(TUNING.DEMO_SLOWMO, TUNING.DEMO_HOLD);
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  per-frame passes
   * ══════════════════════════════════════════════════════════════════════════ */

  _collectEntities() {
    const list = this._entities;
    list.length = 0;
    const p = this.ctx?.player;
    if (p) list.push(p);
    const enemies = this.ctx?.enemies?.list;
    if (Array.isArray(enemies)) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e && e !== p) list.push(e);
      }
    }
  }

  /** Blade tracking, posture regeneration, window expiry, scheduled enemy deflects. */
  _updateRecords(rdt, now) {
    const list = this._entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const rec = this._rec(e);
      if (!rec) continue;
      rec.seen = this._frame;

      const dead = e.isAlive === false || e.state === 'dead' ||
        (e.health != null && e.health <= 0);
      if (dead) {
        if (rec.alive) { rec.alive = false; this.releaseToken(e); }
        rec.swinging = false;
        continue;
      }
      rec.alive = true;

      // ── blade segment: this frame's becomes last frame's, then resample ──
      if (rec.bladeValid) {
        rec.prevBase.copy(rec.base);
        rec.prevTip.copy(rec.tip);
        rec.hasPrev = true;
      }
      rec.bladeValid = this._sampleBlade(e, rec.base, rec.tip);
      if (rec.bladeValid && !rec.hasPrev) {
        rec.prevBase.copy(rec.base);
        rec.prevTip.copy(rec.tip);
        rec.hasPrev = true;
      }
      // A teleport (respawn, cinematic cut) must not register as a 40 m/s swing.
      if (rec.hasPrev &&
        rec.prevTip.distanceToSquared(rec.tip) > TUNING.MAX_TRAVEL * TUNING.MAX_TRAVEL) {
        rec.prevBase.copy(rec.base);
        rec.prevTip.copy(rec.tip);
      }

      // ── swing edge detection ──
      const active = !!e.weapon?.active;
      if (active && !rec.swinging) this._openSwing(rec, e, null, now);
      else if (!active && rec.swinging) this.endSwing(e);

      // ── window expiry ──
      if (rec.guarding && now > rec.guardUntil && e.state !== 'guard') rec.guarding = false;
      if (rec.telegraphKind && now >= rec.telegraphUntil) rec.telegraphKind = null;
      if (rec.streak > 0 && now > rec.streakUntil) {
        rec.streak = 0;
        if (e === this.ctx?.player) this.parryStreak = 0;
      }

      // ── scheduled enemy deflect (reaction time already elapsed) ──
      if (rec.parrySched > 0 && now >= rec.parrySched) {
        rec.parrySched = -1;
        if (e.state !== 'stagger' && now >= rec.brokenUntil) {
          this.requestParry(e);
          e.onParryIntent?.();
        }
      }

      this._regenPosture(e, rec, rdt, now);

      // ── recovery from break / stagger ──
      if (rec.brokenUntil > 0 && now >= rec.brokenUntil) {
        rec.brokenUntil = 0;
        e.posture = (e.maxPosture || 100) * TUNING.POSTURE_BREAK_DRAIN;
        if (e.state === 'stagger') this._setState(e, 'idle');
        e.onPostureRecover?.();
      }
      if (rec.staggerUntil > 0 && now >= rec.staggerUntil) {
        rec.staggerUntil = 0;
        if (e.state === 'stagger' && now >= rec.brokenUntil) this._setState(e, 'idle');
      }

      // ── lunge: the attacker drifts into their target through the active window ──
      if (now < rec.lungeUntil && rec.lungeTarget) {
        const tp = rec.lungeTarget.position || rec.lungeTarget.root?.position;
        const sp = e.position || e.root?.position;
        if (tp && sp) {
          _vA.subVectors(tp, sp); _vA.y = 0;
          const dist = _vA.length();
          if (dist > TUNING.LUNGE_MIN_GAP) {
            _vA.divideScalar(dist);
            const step = Math.min(TUNING.LUNGE_SPEED * rdt, dist - TUNING.LUNGE_MIN_GAP);
            sp.addScaledVector(_vA, step);
            e.root?.position?.copy?.(sp);
          }
        }
      }
    }
    this._prune();
  }

  /** Steel on steel: two live blades crossing resolve as a clash, not as two hits. */
  _clashPass(now) {
    const list = this._entities;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ra = this._records.get(a);
      if (!ra || !ra.swinging || !ra.bladeValid || !ra.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!TUNING.FRIENDLY_FIRE && a.faction === b.faction) continue;
        const rb = this._records.get(b);
        if (!rb || !rb.swinging || !rb.bladeValid || !rb.alive) continue;
        if (now - ra.lastClash < TUNING.CLASH_COOLDOWN) continue;
        if (now - rb.lastClash < TUNING.CLASH_COOLDOWN) continue;

        const d2 = segmentSegment(ra.base, ra.tip, rb.base, rb.tip, _c1, _c2);
        const tol = TUNING.CLASH_TOLERANCE;
        if (d2 > tol * tol) continue;

        _vC.addVectors(_c1, _c2).multiplyScalar(0.5);
        ra.lastClash = now;
        rb.lastClash = now;
        // A deflect always beats a clash — that is the whole point of the window.
        if (now < ra.parryEnd) { this._doParryFromClash(a, b, _vC); continue; }
        if (now < rb.parryEnd) { this._doParryFromClash(b, a, _vC); continue; }
        this._doClash(a, b, _vC);
      }
    }
  }

  /** The swept blade test. Sub-stepped so a fast arc at 30 fps cannot tunnel. */
  _sweepPass(now) {
    const list = this._entities;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ra = this._records.get(a);
      if (!ra || !ra.swinging || !ra.bladeValid || !ra.hasPrev || !ra.alive) continue;
      if (this._exec.active && (a === this._exec.attacker || a === this._exec.victim)) continue;

      const bladeLen = ra.base.distanceTo(ra.tip);
      if (bladeLen > TUNING.MAX_BLADE_LENGTH) continue;
      // A clash this frame consumed the swing entirely.
      if (now - ra.lastClash < 1e-4) continue;

      this._physicsBroadphase(ra);

      const travel = ra.prevTip.distanceTo(ra.tip);
      const steps = Math.max(1, Math.min(
        TUNING.SWEEP_SUBSTEPS,
        1 + Math.round(travel / Math.max(0.35, bladeLen * 0.5)),
      ));

      for (let j = 0; j < list.length; j++) {
        const t = list[j];
        if (!t || t === a) continue;
        if (!TUNING.FRIENDLY_FIRE && t.faction === a.faction) continue;
        if (t.isAlive === false || t.state === 'dead') continue;
        if (this._alreadyHit(ra, t, now)) continue;
        if (!this._nearSwing(ra, t, bladeLen, travel) &&
          this._physCandidates.indexOf(t) < 0) continue;
        this._sweepAgainst(ra, a, t, steps, now);
      }
    }
  }

  /** Test the swept quad against one target's hitboxes. Returns true on contact. */
  _sweepAgainst(ra, attacker, target, steps, now) {
    const boxes = Array.isArray(target.hitboxes) && target.hitboxes.length
      ? target.hitboxes : null;
    const count = boxes ? boxes.length : 1;

    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      _p0.lerpVectors(ra.prevBase, ra.base, u);
      _p1.lerpVectors(ra.prevTip, ra.tip, u);

      // h === count is the body-capsule fallback, used only when not one bone-driven
      // hitbox could be resolved (rig not ready, or an entity authored without one).
      let resolved = 0;
      for (let h = 0; h <= count; h++) {
        if (h === count && resolved > 0) break;
        const hb = (h < count && boxes) ? boxes[h] : null;
        const radius = this._hitboxSegment(target, hb, _hbA, _hbB);
        if (radius <= 0) continue;
        if (h < count) resolved++;
        const total = radius + TUNING.SWEEP_PAD;
        const d2 = segmentSegment(_p0, _p1, _hbA, _hbB, _c1, _c2);
        if (d2 > total * total) continue;

        // Contact point on the capsule surface, normal pointing out of the body —
        // decals and blood cards are only convincing when these are honest.
        _vD.subVectors(_c1, _c2);
        if (_vD.lengthSq() < EPS) {
          _vD.subVectors(_c1, this._centerOf(target, _vE));
          if (_vD.lengthSq() < EPS) _vD.copy(_up);
        }
        _vD.normalize();
        _vE.copy(_c2).addScaledVector(_vD, radius);

        const dmg = this._weaponDamage(attacker) * (ra.swingHeavy ? TUNING.HEAVY_MULT : 1);
        this._markHit(ra, target, now);
        this._resolveContact(
          attacker, target, _vE, _vD, dmg, ra.swingKind, ra.swingHeavy, false, null,
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Advance every projectile, sweeping its path so a 24 m/s kunai cannot pass through
   * a body between frames. World geometry stops it first — an arrow must not fly
   * through the shrine wall to reach you.
   */
  _updateProjectiles(rdt, now) {
    const list = this._projectiles;
    const ents = this._entities;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;

      p.age += rdt;
      if (p.age >= p.life) { p.alive = false; p.owner = null; continue; }

      p.prev.copy(p.pos);
      p.vel.y += p.gravity * rdt;
      p.pos.addScaledVector(p.vel, rdt);

      // world blocking
      const ph = this.ctx?.physics;
      if (typeof ph?.raycast === 'function') {
        _vA.subVectors(p.pos, p.prev);
        const span = _vA.length();
        if (span > EPS) {
          try {
            const L = ph.LAYER;
            const mask = L ? (L.WORLD | L.PROP) : 0xffffffff;
            const hit = ph.raycast(p.prev, _vA, span, mask, null);
            if (hit && hit.hit !== false) {
              if (hit.point) p.pos.copy(hit.point);
              this.ctx.fx?.stoneChip?.(p.pos, hit.normal || _up, 0.5);
              p.alive = false; p.owner = null;
              continue;
            }
          } catch { /* physics not ready — let it fly */ }
        }
      }

      // entity sweep
      let consumed = false;
      for (let s = 1; s <= TUNING.PROJECTILE_SUBSTEPS && !consumed; s++) {
        const u = s / TUNING.PROJECTILE_SUBSTEPS;
        _p0.lerpVectors(p.prev, p.pos, (s - 1) / TUNING.PROJECTILE_SUBSTEPS);
        _p1.lerpVectors(p.prev, p.pos, u);
        for (let j = 0; j < ents.length && !consumed; j++) {
          const t = ents[j];
          if (!t || t === p.owner) continue;
          if (!TUNING.FRIENDLY_FIRE && p.owner && t.faction === p.owner.faction) continue;
          if (t.isAlive === false || t.state === 'dead') continue;
          const boxes = Array.isArray(t.hitboxes) && t.hitboxes.length ? t.hitboxes : null;
          const count = boxes ? boxes.length : 1;
          let resolved = 0;
          for (let h = 0; h <= count && !consumed; h++) {
            if (h === count && resolved > 0) break;
            const hb = (h < count && boxes) ? boxes[h] : null;
            const radius = this._hitboxSegment(t, hb, _hbA, _hbB);
            if (radius <= 0) continue;
            if (h < count) resolved++;
            const total = radius + p.radius;
            if (segmentSegment(_p0, _p1, _hbA, _hbB, _c1, _c2) > total * total) continue;

            _vD.subVectors(_c1, _c2);
            if (_vD.lengthSq() < EPS) _vD.copy(_up); else _vD.normalize();
            _vE.copy(_c2).addScaledVector(_vD, radius);
            _vB.copy(p.vel);
            _vB.y = 0;
            if (_vB.lengthSq() < EPS) _vB.copy(_fwdDefault); else _vB.normalize();

            this._resolveContact(
              p.owner, t, _vE, _vD, p.damage, p.kind === 'arrow' ? 'thrust' : 'thrust',
              false, false, p.poise, _vB, p.posture,
            );
            p.alive = false; p.owner = null;
            consumed = true;
          }
        }
      }
      if (consumed) continue;

      // A moving glint so the shot is readable even before Effects grows a
      // dedicated projectile visual.
      if ((this._frame & 1) === 0) this.ctx.fx?.sparkGrind?.(p.pos, p.vel, 0.18);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  hit resolution pipeline — the order below is contractual:
   *  i-frames → parry → guard → clash → hit → death
   * ══════════════════════════════════════════════════════════════════════════ */

  _resolveContact(attacker, target, point, normal, rawDamage, kind, heavy, ignoreDefence,
    poiseOverride, dirOverride, postureOverride) {
    if (!target) return false;
    const now = this.time;
    const trec = this._rec(target);
    if (!trec) return false;
    const arec = attacker ? this._rec(attacker) : null;

    // ── 1. i-frames ─────────────────────────────────────────────────────────
    if (target.invulnerable === true || now < trec.iframeUntil) {
      target.onWhiff?.(attacker);
      this.ctx?.fx?.whiff?.(point, normal);
      return false;
    }

    // Direction of travel of the blow, flattened. Every step below uses it.
    const dir = _vF;
    if (dirOverride) dir.copy(dirOverride);
    else {
      const ap = attacker?.position || attacker?.root?.position;
      const tp = target.position || target.root?.position;
      if (ap && tp) dir.subVectors(tp, ap); else dir.copy(normal);
    }
    dir.y = 0;
    if (dir.lengthSq() < EPS) dir.copy(_fwdDefault); else dir.normalize();

    // 危 attacks cannot be blocked or deflected — the red flash means *dodge*. Both the
    // telegraph and the weapon's own flags count; `guardBreak` beats a guard but is
    // still deflectable, which is exactly what makes learning the deflect worth it.
    const aw = attacker?.weapon;
    const unblockable = !ignoreDefence &&
      ((arec != null && arec.telegraphKind === 'unblockable' && now < arec.telegraphUntil) ||
        aw?.unblockable === true);
    const guardBreak = unblockable || aw?.guardBreak === true;

    // How far off the victim's facing the blow arrives.
    const tfwd = target.forward && target.forward.lengthSq() > EPS ? target.forward : _fwdDefault;
    _vG.copy(dir).multiplyScalar(-1);            // victim → attacker
    const incomingAngle = facingAngle(tfwd, _vG);

    // ── 2. parry ────────────────────────────────────────────────────────────
    if (!ignoreDefence && !unblockable && now < trec.parryEnd &&
      incomingAngle <= TUNING.PARRY_ARC * 0.5) {
      const perfect = (now - trec.parryStart) <=
        TUNING.PARRY_PERFECT * this._parryScaleFor(target);
      this._doParry(target, attacker, point, dir, perfect, rawDamage);
      return true;
    }

    // ── 3. guard (a facing cone — behind or outside it, guard does nothing) ──
    const guarding = !ignoreDefence && !guardBreak &&
      (trec.guarding || target.state === 'guard');
    if (guarding && incomingAngle <= TUNING.GUARD_ARC * 0.5) {
      this._doGuard(target, attacker, point, normal, dir, rawDamage, kind, heavy, poiseOverride);
      return true;
    }

    // ── 4. clash ────────────────────────────────────────────────────────────
    // (_clashPass resolves mutual blade crossings before any body contact; this
    //  catches the frame where the defender's blade goes live mid-resolution.)
    if (!ignoreDefence && arec && trec.swinging && trec.bladeValid && arec.bladeValid &&
      now - trec.lastClash > TUNING.CLASH_COOLDOWN &&
      now - arec.lastClash > TUNING.CLASH_COOLDOWN) {
      const d2 = segmentSegment(arec.base, arec.tip, trec.base, trec.tip, _c1, _c2);
      const tol = TUNING.CLASH_TOLERANCE;
      if (d2 <= tol * tol) {
        _vH.addVectors(_c1, _c2).multiplyScalar(0.5);
        arec.lastClash = now;
        trec.lastClash = now;
        this._doClash(attacker, target, _vH);
        return true;
      }
    }

    // ── 5. hit ──────────────────────────────────────────────────────────────
    let damage = rawDamage;
    // Only damage *incoming to the player* is softened; enemies are not nerfed twice.
    damage *= (target === this.ctx?.player) ? this.diff.enemyDamage : this.diff.playerDamage;

    const backstab = incomingAngle >= Math.PI - TUNING.BACKSTAB_ARC * 0.5;
    const punish = now < trec.punishUntil;
    const crit = backstab || punish;
    if (crit) damage *= TUNING.CRIT_MULT;
    damage = Math.max(0, damage);

    const attackPoise = poiseOverride != null ? poiseOverride : this._attackPoise(attacker);
    const heavyHit = !!heavy || damage >= TUNING.HEAVY_DAMAGE_THRESHOLD;
    const posture = (postureOverride != null ? postureOverride : aw?.posture) ??
      damage * TUNING.POSTURE_PER_DAMAGE;

    const hp = this._hitP();
    hp.attacker = attacker; hp.target = target;
    hp.point.copy(point); hp.normal.copy(normal); hp.direction.copy(dir);
    hp.damage = damage;
    hp.poise = this._poiseFor(target, attackPoise);
    hp.posture = posture * this.diff.postureGain;
    hp.kind = kind || 'slash'; hp.crit = crit;
    hp.heavy = heavyHit; hp.unblockable = unblockable;
    hp.blocked = false; hp.parried = false; hp.guarded = undefined;

    // The entity resolves its own damage first — Player and Enemy both own their
    // health, posture, reaction clip and FSM. We only fill in what they left alone.
    const h0 = target.health, p0 = target.posture, s0 = target.state;
    const verdict = target.onDamage?.(hp);

    // `false` means the entity converted the blow (Player's own parry timer). If it
    // opened a deflect window doing so, resolve the full parry beat instead of a hit.
    if (verdict === false) {
      if (now < trec.parryEnd) {
        const perfect = (now - trec.parryStart) <=
          TUNING.PARRY_PERFECT * this._parryScaleFor(target);
        this._doParry(target, attacker, point, dir, perfect, rawDamage);
        return true;
      }
      return false;
    }

    const tookHealth = target.health !== h0;
    const tookPosture = target.posture !== p0;
    const tookState = target.state !== s0;
    if (!tookHealth) this._safeSet(target, 'health', Math.max(0, (h0 ?? 0) - damage));
    this.ctx?.bus?.emit?.('hit', hp);

    // Player emits its own `damage-taken` (it returns true to say so); everyone else
    // relies on us for it.
    if (verdict !== true) {
      const dp = this._dmgP();
      dp.entity = target; dp.amount = damage; dp.direction.copy(dir);
      this.ctx?.bus?.emit?.('damage-taken', dp);
    }

    if (!tookPosture) this._addPosture(target, hp.posture, dir);
    else this._noteExternalPosture(target, trec, dir);
    trec.punishUntil = 0;

    // impact feel — Effects/Audio already react to the events above, so we only add
    // what they cannot know: the weight of *this* blow and the knockback.
    this._hitStop(heavyHit ? TUNING.HITSTOP_HEAVY : TUNING.HITSTOP_LIGHT, TUNING.HITSTOP_SCALE);
    this._shake(heavyHit ? TUNING.SHAKE_HEAVY : TUNING.SHAKE_LIGHT, TUNING.SHAKE_DURATION, dir);
    this._knockback(target, dir, heavyHit ? TUNING.KNOCKBACK_HEAVY : TUNING.KNOCKBACK_LIGHT);

    // Directional stagger — only when the entity did not already react for itself.
    if (!tookState && attackPoise >= this._poiseOf(target) * TUNING.POISE_STAGGER_RATIO) {
      this._stagger(target, incomingAngle, tfwd, _vG, heavyHit);
    }

    // ── 6. death ────────────────────────────────────────────────────────────
    if ((target.health ?? 0) <= 0 && target.isAlive !== false) {
      this._kill(target, attacker, point, dir);
    }
    return true;
  }

  /**
   * A block is steel on steel, not flesh: it emits `clash` (sparks, ring, flash)
   * rather than `hit`, so no blood sprays off a clean parry-less guard.
   */
  _doGuard(defender, attacker, point, normal, dir, rawDamage, kind, heavy, poiseOverride) {
    const damage = rawDamage *
      ((defender === this.ctx?.player) ? this.diff.enemyDamage : this.diff.playerDamage);
    const chip = damage * TUNING.CHIP_RESIDUE;
    const attackPoise = poiseOverride != null ? poiseOverride : this._attackPoise(attacker);

    const hp = this._hitP();
    hp.attacker = attacker; hp.target = defender;
    hp.point.copy(point); hp.normal.copy(normal); hp.direction.copy(dir);
    hp.damage = chip;
    hp.poise = this._poiseFor(defender, attackPoise * 0.4);
    hp.posture = damage * TUNING.GUARD_POSTURE_MULT * this.diff.postureGain;
    hp.kind = kind || 'slash'; hp.crit = false;
    hp.heavy = !!heavy; hp.unblockable = false;
    hp.blocked = true; hp.parried = false;
    hp.guarded = true;          // tells Enemy.onDamage we already resolved the guard

    const h0 = defender.health, p0 = defender.posture;
    const verdict = defender.onDamage?.(hp);
    if (defender.health === h0) this._safeSet(defender, 'health', Math.max(0, (h0 ?? 0) - chip));
    defender.onGuardHit?.(attacker, hp);

    if (verdict !== true) {
      const dp = this._dmgP();
      dp.entity = defender; dp.amount = chip; dp.direction.copy(dir);
      this.ctx?.bus?.emit?.('damage-taken', dp);
    }

    const cp = this._clashP();
    cp.a = attacker; cp.b = defender; cp.point.copy(point);
    this.ctx?.bus?.emit?.('clash', cp);

    // Blocking converts the blow into posture on both sides — hold guard forever and break.
    if (defender.posture === p0) this._addPosture(defender, hp.posture, dir);
    else this._noteExternalPosture(defender, this._rec(defender), dir);
    if (attacker) {
      _vB.copy(dir).multiplyScalar(-1);
      this._addPosture(attacker, damage * TUNING.GUARD_ATTACKER_POSTURE, _vB);
    }

    this._hitStop(TUNING.HITSTOP_LIGHT, TUNING.HITSTOP_SCALE);
    this._shake(TUNING.SHAKE_LIGHT * (heavy ? 1.4 : 1), TUNING.SHAKE_DURATION, dir);
    this._knockback(defender, dir, TUNING.KNOCKBACK_LIGHT * 0.6);
    if ((defender.health ?? 0) <= 0 && defender.isAlive !== false) {
      this._kill(defender, attacker, point, dir);
    }
  }

  /** The heart of the game. */
  _doParry(defender, attacker, point, dir, perfect, rawDamage) {
    const drec = this._rec(defender);
    if (!drec) return;
    const arec = attacker ? this._rec(attacker) : null;
    const now = this.time;

    // streak: escalate the response so improving *feels* like improving
    if (perfect) {
      drec.streak = Math.min(TUNING.PARRY_STREAK_MAX, drec.streak + 1);
      drec.streakUntil = now + TUNING.PARRY_STREAK_WINDOW;
    } else {
      drec.streakUntil = now + TUNING.PARRY_STREAK_WINDOW * 0.6;
    }
    if (defender === this.ctx?.player) this.parryStreak = drec.streak;
    const streakBoost = 1 + drec.streak * TUNING.PARRY_STREAK_POSTURE;

    // Close the window so one deflect cannot absorb a whole flurry for free.
    drec.parryStart = -999;
    drec.parryEnd = perfect ? now + 0.03 : -999;
    drec.parryReady = now + TUNING.PARRY_RECOVERY;
    drec.guarding = true;
    drec.guardUntil = now + 0.30;

    const p = this._parryP();
    p.defender = defender; p.attacker = attacker; p.point.copy(point); p.perfect = perfect;
    this.ctx?.bus?.emit?.('parry', p);
    defender.onParry?.(p);
    // Enemy.onParried(defender) runs its own recoil, posture loss and stagger clip.
    attacker?.onParried?.(defender, p);

    const sp = this._streakP();
    sp.defender = defender; sp.streak = drec.streak; sp.perfect = perfect;
    this.ctx?.bus?.emit?.('parry-streak', sp);

    _vC.copy(dir).multiplyScalar(-1);   // defender → attacker

    if (perfect) {
      // zero damage, heavy posture onto the ATTACKER, 90 ms stop, punish window
      if (attacker) {
        this._addPosture(attacker, TUNING.PARRY_PERFECT_POSTURE * streakBoost, _vC);
        if (arec) {
          arec.punishUntil = now + TUNING.PUNISH_WINDOW;
          arec.lungeUntil = 0;
        }
        this._knockback(attacker, _vC, TUNING.PARRY_KNOCKBACK);
        this.endSwing(attacker);
        if (attacker.weapon) attacker.weapon.active = false;
        attacker.onDeflected?.(defender, true);
      }
      defender.onParrySuccess?.(attacker);
      drec.punishUntil = 0;
      this._hitStop(TUNING.HITSTOP_PARRY, TUNING.HITSTOP_SCALE);
      this._shake(TUNING.SHAKE_PARRY * (1 + drec.streak * 0.06),
        TUNING.SHAKE_DURATION * 1.2, dir);
      this._parryFX(point, dir, true, drec.streak);
    } else {
      // late: reduced damage still lands, moderate posture, a duller clash
      const dmg = rawDamage * TUNING.PARRY_LATE_DAMAGE *
        ((defender === this.ctx?.player) ? this.diff.enemyDamage : this.diff.playerDamage);
      const h0 = defender.health, p0 = defender.posture;

      const hp = this._hitP();
      hp.attacker = attacker; hp.target = defender;
      hp.point.copy(point); hp.normal.copy(_vC); hp.direction.copy(dir);
      hp.damage = dmg;
      hp.poise = this._poiseFor(defender, this._attackPoise(attacker) * 0.3);
      hp.posture = TUNING.PARRY_SELF_POSTURE;
      hp.kind = 'slash'; hp.crit = false; hp.heavy = false; hp.unblockable = false;
      hp.blocked = false; hp.parried = true; hp.guarded = true;
      const verdict = defender.onDamage?.(hp);
      if (defender.health === h0) this._safeSet(defender, 'health', Math.max(0, (h0 ?? 0) - dmg));
      this.ctx?.bus?.emit?.('hit', hp);

      if (verdict !== true) {
        const dp = this._dmgP();
        dp.entity = defender; dp.amount = dmg; dp.direction.copy(dir);
        this.ctx?.bus?.emit?.('damage-taken', dp);
      }

      if (attacker) this._addPosture(attacker, TUNING.PARRY_LATE_POSTURE, _vC);
      if (defender.posture === p0) this._addPosture(defender, TUNING.PARRY_SELF_POSTURE, dir);
      this._hitStop(TUNING.HITSTOP_LIGHT, TUNING.HITSTOP_SCALE);
      this._shake(TUNING.SHAKE_LIGHT * 1.3, TUNING.SHAKE_DURATION, dir);
      this._parryFX(point, dir, false, drec.streak);
      attacker?.onDeflected?.(defender, false);
      if ((defender.health ?? 0) <= 0 && defender.isAlive !== false) {
        this._kill(defender, attacker, point, dir);
      }
    }
  }

  /** A parry resolved out of the clash pass (both blades were live). */
  _doParryFromClash(defender, attacker, point) {
    const ap = attacker.position || attacker.root?.position;
    const dp = defender.position || defender.root?.position;
    if (ap && dp) _vD.subVectors(dp, ap).setY(0); else _vD.copy(_fwdDefault);
    if (_vD.lengthSq() < EPS) _vD.copy(_fwdDefault); else _vD.normalize();
    const drec = this._records.get(defender);
    const perfect = !!drec && (this.time - drec.parryStart) <=
      TUNING.PARRY_PERFECT * this._parryScaleFor(defender);
    this._doParry(defender, attacker, point, _vD, perfect, this._weaponDamage(attacker));
  }

  _doClash(a, b, point) {
    const cp = this._clashP();
    cp.a = a; cp.b = b; cp.point.copy(point);
    this.ctx?.bus?.emit?.('clash', cp);
    a.onClash?.(b, cp);
    b.onClash?.(a, cp);

    const ap = a.position || a.root?.position;
    const bp = b.position || b.root?.position;
    if (ap && bp) _vD.subVectors(bp, ap).setY(0); else _vD.copy(_fwdDefault);
    if (_vD.lengthSq() < EPS) _vD.copy(_fwdDefault); else _vD.normalize();

    this._addPosture(a, TUNING.CLASH_POSTURE, _vD);
    _vE.copy(_vD).multiplyScalar(-1);
    this._addPosture(b, TUNING.CLASH_POSTURE, _vE);
    this._knockback(b, _vD, TUNING.CLASH_RECOIL);
    this._knockback(a, _vE, TUNING.CLASH_RECOIL);

    this._hitStop(TUNING.HITSTOP_HEAVY * 0.8, TUNING.HITSTOP_SCALE);
    this._shake(TUNING.SHAKE_HEAVY, TUNING.SHAKE_DURATION, _vD);
    this.ctx?.fx?.sparks?.(point, _up, 26);
    this.ctx?.fx?.clashFlash?.(point, 0.7);
    this.ctx?.audio?.cue?.('clash');

    // Neither swing survives the collision — both fighters recoil and recover.
    this.endSwing(a); this.endSwing(b);
    if (a.weapon) a.weapon.active = false;
    if (b.weapon) b.weapon.active = false;
  }

  _parryFX(point, dir, perfect, streak) {
    const s = clamp01(streak / TUNING.PARRY_STREAK_MAX);
    this.ctx?.fx?.pulseParry?.(point, perfect ? 0.8 + s * 0.6 : 0.4, perfect);
    this.ctx?.fx?.clashFlash?.(point, perfect ? 1.0 + s * 0.5 : 0.45);
    this.ctx?.fx?.sparks?.(point, dir, perfect ? 34 + Math.round(s * 26) : 14);
    this.ctx?.pipeline?.flash?.(perfect ? 0.28 + s * 0.2 : 0.10, perfect ? 0.16 : 0.09);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  posture
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Two conventions exist in this codebase and both are legitimate: Player counts
   * posture UP from 0 to maxPosture (break at max), Enemy counts it DOWN from
   * maxPosture to 0 (break at zero). We detect which an entity uses the first time we
   * see it — a full bar at first sight means the draining kind — and then speak its
   * language for the rest of its life. `pressure` is always 0 (fresh) → 1 (broken).
   */
  _classifyPosture(entity, rec) {
    if (rec.postureMode !== 0) return;
    const max = entity.maxPosture || 100;
    rec.postureMode = (entity.posture ?? 0) >= max * 0.75 ? -1 : 1;   // -1 drains, +1 fills
    rec.postureSeen = entity.posture ?? 0;
  }

  /** Pressure 0..1 in whichever convention the entity uses. */
  _pressureOf(entity, rec) {
    const max = entity.maxPosture || 100;
    if (max <= 0) return 0;
    const v = entity.posture ?? 0;
    return rec.postureMode < 0 ? clamp01(1 - v / max) : clamp01(v / max);
  }

  _addPosture(entity, amount, dir) {
    if (!entity || !(amount > 0)) return;
    const rec = this._rec(entity);
    if (!rec) return;
    const now = this.time;
    if (now < rec.brokenUntil) return;    // already helpless; more pressure means nothing
    this._classifyPosture(entity, rec);

    const max = entity.maxPosture || 100;
    if (entity.posture == null) this._safeSet(entity, 'posture', rec.postureMode < 0 ? max : 0);
    // Each break makes the next one easier — pressure compounds, exactly like Sekiro.
    const escalate = 1 + Math.min(0.36, rec.breaks * TUNING.POSTURE_ESCALATE);
    const delta = amount * escalate * (rec.postureMode < 0 ? -1 : 1);
    this._safeSet(entity, 'posture', clamp((entity.posture || 0) + delta, 0, max));
    rec.postureSeen = entity.posture;
    rec.lastPressure = now;
    rec.calm = 0;
    entity.onPosture?.(entity.posture, max);
    this._checkBreak(entity, rec, dir);
  }

  /** The entity moved its own posture — adopt the value and keep the break check honest. */
  _noteExternalPosture(entity, rec, dir) {
    if (!rec) return;
    this._classifyPosture(entity, rec);
    rec.postureSeen = entity.posture;
    rec.lastPressure = this.time;
    rec.calm = 0;
    this._checkBreak(entity, rec, dir);
  }

  _checkBreak(entity, rec, dir) {
    if (this.time < rec.brokenUntil) return;
    const stateBroken = entity.state === 'postureBroken' || entity.state === 'posture_break';
    if (stateBroken || this._pressureOf(entity, rec) >= 0.999) {
      this._breakPosture(entity, rec, dir, stateBroken);
    }
  }

  /**
   * Slower at low health, faster the longer the entity goes unpressured — but only for
   * entities that do not already regenerate for themselves. Player and Enemy both do;
   * we detect their drift and stand down rather than fight them.
   */
  _regenPosture(entity, rec, rdt, now) {
    if (entity.posture == null) return;
    this._classifyPosture(entity, rec);

    const drift = entity.posture - rec.postureSeen;
    if (Math.abs(drift) > 1e-4) {
      // Movement we did not cause. If it is heading away from a break, the entity owns
      // its own regeneration and we must never write posture on idle frames again.
      const towardBreak = rec.postureMode < 0 ? drift < 0 : drift > 0;
      if (!towardBreak) rec.selfRegen = true;
      rec.postureSeen = entity.posture;
      if (towardBreak) this._checkBreak(entity, rec, null);
    }
    if (rec.selfRegen) return;
    if (now < rec.brokenUntil) return;
    if (now - rec.lastPressure < TUNING.POSTURE_REGEN_DELAY) return;
    const pressure = this._pressureOf(entity, rec);
    if (pressure <= 0) return;

    rec.calm = Math.min(TUNING.POSTURE_REGEN_RAMP, rec.calm + rdt);
    const calmMult = 1 + (TUNING.POSTURE_REGEN_CALM_MULT - 1) *
      (rec.calm / TUNING.POSTURE_REGEN_RAMP);

    const hpFrac = entity.maxHealth ? clamp01((entity.health || 0) / entity.maxHealth) : 1;
    const hpMult = TUNING.POSTURE_REGEN_LOW_HP +
      (1 - TUNING.POSTURE_REGEN_LOW_HP) * (hpFrac * hpFrac);

    const max = entity.maxPosture || 100;
    const step = TUNING.POSTURE_REGEN * calmMult * hpMult * rdt * (rec.postureMode < 0 ? 1 : -1);
    this._safeSet(entity, 'posture', clamp((entity.posture || 0) + step, 0, max));
    rec.postureSeen = entity.posture;
  }

  _breakPosture(entity, rec, dir, alreadyStaged) {
    const now = this.time;
    rec.breaks++;
    rec.brokenUntil = now + TUNING.POSTURE_BREAK_TIME;
    rec.staggerUntil = rec.brokenUntil;
    rec.parryEnd = -999;
    rec.guarding = false;
    this.endSwing(entity);
    if (entity.weapon) entity.weapon.active = false;
    this.releaseToken(entity);
    if (!alreadyStaged) {
      // Let the entity run its own break if it has one (Enemy sets its FSM, clip and
      // timers); only pose it ourselves when it has no idea what a break is.
      let handled = false;
      try {
        handled = entity.onPostureBreak?.() !== undefined || entity.breakPosture?.() !== undefined;
        if (!handled && typeof entity._breakPosture === 'function') { entity._breakPosture(); handled = true; }
      } catch { handled = false; }
      if (!handled) {
        this._setState(entity, 'stagger', TUNING.POSTURE_BREAK_TIME);
        this._playClip(entity, 'posture_break', TUNING.POSTURE_BREAK_TIME);
      }
    }

    const bp = this._breakP();
    bp.entity = entity;
    this.ctx?.bus?.emit?.('posture-break', bp);

    this._shake(TUNING.SHAKE_BREAK, TUNING.SHAKE_DURATION * 1.6, dir || _fwdDefault);
    this._slowMo(TUNING.SLOWMO_BREAK, TUNING.SLOWMO_BREAK_TIME);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  death, stagger, impulses
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Combat is the only emitter of `death` (EnemyManager explicitly defers to us).
   * The entity's own death path runs first when it has one — ragdoll, loot, pooling.
   */
  _kill(entity, attacker, point, dir) {
    if (!entity || entity.isAlive === false) return;
    this._safeSet(entity, 'health', 0);
    this.endSwing(entity);
    if (entity.weapon) entity.weapon.active = false;
    this.releaseToken(entity);
    const rec = this._records.get(entity);
    if (rec) { rec.alive = false; rec.brokenUntil = 0; rec.parryEnd = -999; }

    const dp = this._deathP();
    dp.entity = entity; dp.point.copy(point); dp.direction.copy(dir);

    let handled = false;
    try {
      if (typeof entity.die === 'function') { entity.die(dp); handled = true; }
    } catch { handled = false; }
    if (!handled) {
      entity.onDeath?.(dp);
      // `isAlive` is a getter on some entities — never let that throw.
      this._safeSet(entity, 'isAlive', false);
      this._setState(entity, 'dead');
    }
    attacker?.onKill?.(entity);
    this.ctx?.bus?.emit?.('death', dp);

    this._hitStop(TUNING.HITSTOP_HEAVY, TUNING.HITSTOP_SCALE);
    this._shake(TUNING.SHAKE_HEAVY, TUNING.SHAKE_DURATION * 1.4, dir);
  }

  /** Pick stagger_l / stagger_r / stagger_back from where the blow came from. */
  _stagger(entity, incomingAngle, forward, toAttacker, heavy) {
    const rec = this._rec(entity);
    if (!rec) return;
    const now = this.time;
    if (now < rec.brokenUntil) return;
    let clip = 'stagger_back';
    if (incomingAngle < Math.PI * 0.75) {
      clip = sideOf(forward, toAttacker) > 0 ? 'stagger_l' : 'stagger_r';
    }
    const dur = TUNING.STAGGER_TIME * (heavy ? 1.35 : 1);
    rec.staggerUntil = now + dur;
    rec.parryEnd = -999;
    this.endSwing(entity);
    if (entity.weapon) entity.weapon.active = false;
    this.releaseToken(entity);
    if (typeof entity.onStagger === 'function') { entity.onStagger(clip, dur); return; }
    this._setState(entity, 'stagger', dur);
    this._playClip(entity, clip, dur);
  }

  _knockback(entity, dir, speed) {
    if (!entity) return;
    const rec = this._rec(entity);
    if (!rec) return;
    const massRef = TUNING.KNOCKBACK_MASS;
    const mass = entity.mass || this._archetype(entity).mass || massRef;
    const poise = Math.max(1, this._poiseOf(entity));
    const scale = (massRef / mass) * clamp(20 / poise, 0.35, 1.4);
    _vA.copy(dir); _vA.y = 0;
    if (_vA.lengthSq() < EPS) return;
    _vA.normalize().multiplyScalar(speed * scale);
    if (typeof entity.applyImpulse === 'function') { entity.applyImpulse(_vA); return; }
    rec.knock.add(_vA);
  }

  /** Integrate the combat-owned impulse so knockback works without a controller too. */
  _integrateImpulses(rdt) {
    const list = this._entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const rec = this._records.get(e);
      if (!rec) continue;
      const k2 = rec.knock.lengthSq();
      if (k2 < 1e-6) { if (k2 > 0) rec.knock.set(0, 0, 0); continue; }
      const pos = e.position || e.root?.position;
      if (pos) {
        pos.addScaledVector(rec.knock, rdt);
        e.root?.position?.copy?.(pos);
      }
      rec.knock.multiplyScalar(Math.exp(-TUNING.KNOCK_DECAY * rdt));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  impact feel — hit-stop, slow-mo, shake
   * ══════════════════════════════════════════════════════════════════════════ */

  _hitStop(duration, scale) {
    const now = this.time;
    // Deadzone: two hits inside 60 ms are one impact, not two competing stops.
    if (now - this._stopStart < TUNING.HITSTOP_DEADZONE) {
      this._stopUntil = Math.max(this._stopUntil, this._stopStart + duration);
      return;
    }
    this._stopStart = now;
    this._stopUntil = Math.max(this._stopUntil, now + duration);   // overlapping extends
    this._stopScale = Math.min(this._stopScale, scale ?? TUNING.HITSTOP_SCALE);

    const p = this._stopP();
    p.scale = this._stopScale;
    p.duration = this._stopUntil - now;
    this.ctx?.bus?.emit?.('hitstop', p);
  }

  _slowMo(scale, duration) {
    const end = this.time + duration;
    if (end > this._slowUntil) { this._slowUntil = end; this._slowScale = scale; }
    else this._slowScale = Math.min(this._slowScale, scale);
  }

  _updateTimeScale(now) {
    let target = 1;
    if (now < this._slowUntil) target = this._slowScale;
    else if (this._slowUntil > -900) { this._slowUntil = -999; this._slowScale = 1; }
    if (now < this._stopUntil) target = Math.min(target, this._stopScale);
    else if (this._stopUntil > -900) { this._stopUntil = -999; this._stopScale = 1; }

    if (target !== this._timeScaleApplied) {
      this._timeScaleApplied = target;
      // A stop must bite on the frame it happens; Engine eases the ramp back out.
      this.ctx?.engine?.setTimeScale?.(target, target < 1);
    }
  }

  _shake(amount, duration, dir, freq) {
    const p = this._shakeP();
    p.amount = amount;
    p.duration = duration ?? TUNING.SHAKE_DURATION;
    p.freq = freq ?? TUNING.SHAKE_FREQ;
    if (dir) p.dir.copy(dir); else p.dir.copy(_fwdDefault);
    p.dir.y = 0;
    if (p.dir.lengthSq() > EPS) p.dir.normalize(); else p.dir.copy(_fwdDefault);
    this.ctx?.bus?.emit?.('camera-shake', p);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  group arbitration & tension
   * ══════════════════════════════════════════════════════════════════════════ */

  _updateTokens(now) {
    this._reclaim(this._tokens.melee, now);
    this._reclaim(this._tokens.ranged, now);
  }

  _reclaim(pool, now) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const e = pool[i];
      const rec = this._records.get(e);
      const dead = !e || e.isAlive === false || e.state === 'dead';
      if (dead || !rec || now > rec.tokenUntil ||
        now < rec.brokenUntil || now < rec.staggerUntil) {
        pool.splice(i, 1);
        if (rec) {
          rec.token = null;
          rec.tokenUntil = 0;
          rec.tokenCooldown = now + TUNING.TOKEN_COOLDOWN;
        }
      }
    }
  }

  _trimPool(key, cap) {
    const pool = this._tokens[key];
    while (pool.length > cap) {
      const e = pool.pop();
      const rec = this._records.get(e);
      if (rec) { rec.token = null; rec.tokenCooldown = this.time + TUNING.TOKEN_COOLDOWN; }
    }
  }

  /** Threat score: how many, how close, how hurt, how committed. */
  _updateTension(rdt) {
    const player = this.ctx?.player;
    let raw = 0;
    const pp = player?.position || player?.root?.position;
    if (player && pp) {
      let count = 0, proximity = 0;
      const list = this._entities;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e === player || e.faction === player.faction) continue;
        if (e.isAlive === false || e.state === 'dead') continue;
        const ep = e.position || e.root?.position;
        if (!ep) continue;
        const d = ep.distanceTo(pp);
        if (d > TUNING.TENSION_RADIUS) continue;
        count++;
        const near = 1 - d / TUNING.TENSION_RADIUS;
        if (near > proximity) proximity = near;
      }
      const crowd = clamp01(count / 4);
      const hurt = player.maxHealth ? 1 - clamp01((player.health || 0) / player.maxHealth) : 0;
      const committed = clamp01(this._tokens.melee.length / Math.max(1, this.diff.melee));
      raw = clamp01(crowd * 0.42 + proximity * 0.26 + hurt * 0.20 + committed * 0.12);
    }
    this.tension += (raw - this.tension) * (1 - Math.exp(-TUNING.TENSION_SMOOTH * rdt));
    if (this.tension < 1e-4) this.tension = 0;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  execution sequence
   * ══════════════════════════════════════════════════════════════════════════ */

  _updateExecution(rdt) {
    const ex = this._exec;
    if (!ex.active) return;
    ex.t += rdt;

    if (ex.phase === 0 && ex.t >= TUNING.EXEC_WINDUP) {
      ex.phase = 1;
      const victim = ex.victim, attacker = ex.attacker;
      this._hitStop(TUNING.HITSTOP_FINISHER, TUNING.HITSTOP_SCALE * 0.6);
      this._shake(TUNING.SHAKE_BREAK, TUNING.SHAKE_DURATION * 1.8, ex.dir);
      this.ctx?.fx?.bloodMist?.(ex.point, ex.dir, 2.0);
      this.ctx?.audio?.cue?.('execution_impact');

      const p = this._execP();
      p.attacker = attacker; p.victim = victim; p.phase = 'impact';
      this.ctx?.bus?.emit?.('execution', p);

      if (victim) {
        victim.invulnerable = false;
        const hp = this._hitP();
        hp.attacker = attacker; hp.target = victim;
        hp.point.copy(ex.point); hp.normal.copy(ex.dir);
        hp.damage = (victim.maxHealth || 100) * TUNING.EXEC_DAMAGE_MULT;
        hp.poise = 999; hp.kind = 'thrust'; hp.crit = true;
        hp.blocked = false; hp.parried = false;
        victim.onDamage?.(hp);
        victim.health = 0;
        this.ctx?.bus?.emit?.('hit', hp);
        this._kill(victim, attacker, ex.point, ex.dir);
      }
    } else if (ex.phase === 1 && ex.t >= TUNING.EXEC_WINDUP + TUNING.EXEC_RECOVER) {
      const attacker = ex.attacker, victim = ex.victim;
      ex.active = false;
      ex.phase = 2;
      if (attacker) {
        attacker.invulnerable = false;
        if (attacker.state === 'attack') this._setState(attacker, 'idle');
      }
      this.ctx?.pipeline?.setLetterbox?.(0, 0.3);
      this.ctx?.playerCamera?.cinematic?.(false, null);
      this._slowUntil = -999;
      this._slowScale = 1;

      const p = this._execP();
      p.attacker = attacker; p.victim = victim; p.phase = 'end';
      this.ctx?.bus?.emit?.('execution', p);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  demo staging (capture rig)
   * ══════════════════════════════════════════════════════════════════════════ */

  _updateDemo(rdt) {
    const d = this._demo;
    if (!d.active) return;
    d.t += rdt;
    // Repeated pulses guarantee the screenshot lands on a lit frame no matter when
    // the capture rig decides to shoot.
    if (d.pulses < TUNING.DEMO_PULSES && d.t >= d.pulses * TUNING.DEMO_PULSE_GAP) {
      d.pulses++;
      this._parryFX(d.point, _fwdDefault, true, 3 + d.pulses);
      this._shake(TUNING.SHAKE_PARRY, TUNING.SHAKE_DURATION, _fwdDefault);
    }
    if (d.a) this._setState(d.a, 'parry');
    if (d.b) this._setState(d.b, 'attack');
    if (d.t >= TUNING.DEMO_HOLD) {
      d.active = false;
      if (d.b?.weapon) d.b.weapon.active = false;
      if (d.a) this._setState(d.a, 'idle');
      if (d.b) this._setState(d.b, 'idle');
      this._slowUntil = -999;
      this._slowScale = 1;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  blade / hitbox sampling
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Resolve an entity's blade segment this frame. Tries, in order: an explicit
   * accessor, cached Vector3s on the weapon, the rig's bones, and finally a
   * procedural guess from the root transform so a rig-less entity still fights.
   */
  _sampleBlade(e, outBase, outTip) {
    const w = e?.weapon;
    if (!w) return false;

    if (typeof e.getWeaponSegment === 'function') {
      try {
        if (e.getWeaponSegment(outBase, outTip) !== false &&
          Number.isFinite(outTip.x) && Number.isFinite(outBase.x)) return true;
      } catch { /* fall through to the next strategy */ }
    }
    // Enemy exports on the weapon, Player on the entity; both keep them live each frame.
    if (w.bladeBase?.isVector3 && w.bladeTip?.isVector3 &&
      (w.bladeTip.lengthSq() > 0 || w.bladeBase.lengthSq() > 0)) {
      outBase.copy(w.bladeBase); outTip.copy(w.bladeTip);
      if (Number.isFinite(outTip.x)) return true;
    }
    if (e.bladeBase?.isVector3 && e.bladeTip?.isVector3 &&
      (e.bladeTip.lengthSq() > 0 || e.bladeBase.lengthSq() > 0)) {
      outBase.copy(e.bladeBase); outTip.copy(e.bladeTip);
      if (Number.isFinite(outTip.x)) return true;
    }
    if (w.base?.isVector3 && w.tip?.isVector3) {
      outBase.copy(w.base); outTip.copy(w.tip);
      if (Number.isFinite(outTip.x)) return true;
    }

    const len = w.length || 0.98;
    const rig = e.rig;
    if (rig && w.tipBone && this._bonePos(rig, w.tipBone, outTip)) {
      if (!(w.handBone && this._bonePos(rig, w.handBone, outBase)) &&
        !this._bonePos(rig, 'hand_r', outBase) &&
        !this._bonePos(rig, 'weapon_root', outBase)) {
        // No hilt bone: reconstruct the hilt by walking back along the entity's facing.
        const fwd = e.forward && e.forward.lengthSq() > EPS ? e.forward : _fwdDefault;
        outBase.copy(outTip).addScaledVector(fwd, -len);
      }
      return true;
    }

    // Procedural fallback: a plausible ready-stance blade in front of the chest.
    const pos = e.position || e.root?.position;
    if (!pos) return false;
    if (e.forward && e.forward.lengthSq() > EPS) _vA.copy(e.forward); else _vA.copy(_fwdDefault);
    _vA.y = 0;
    if (_vA.lengthSq() < EPS) _vA.copy(_fwdDefault); else _vA.normalize();
    _vB.crossVectors(_vA, _up).normalize();      // right-hand side of the body
    const h = e.height || 1.75;
    outBase.copy(pos).addScaledVector(_up, h * 0.62)
      .addScaledVector(_vB, 0.20).addScaledVector(_vA, 0.16);
    outTip.copy(outBase).addScaledVector(_vA, len * 0.82).addScaledVector(_up, len * 0.34);
    return true;
  }

  /** Try every rig accessor we know of; true when `out` holds a world position. */
  _bonePos(rig, name, out) {
    if (!rig || !name) return false;
    try {
      if (typeof rig.getBoneWorldPosition === 'function' &&
        rig.getBoneWorldPosition(name, out) !== false && Number.isFinite(out.x)) return true;
      if (typeof rig.boneWorldPosition === 'function' &&
        rig.boneWorldPosition(name, out) !== false && Number.isFinite(out.x)) return true;
      const bone = (typeof rig.getBone === 'function' ? rig.getBone(name) : null) ||
        rig.bones?.[name] || rig.boneMap?.get?.(name);
      if (bone?.getWorldPosition) { bone.getWorldPosition(out); return Number.isFinite(out.x); }
      if (bone?.position?.isVector3) { out.copy(bone.position); return true; }
    } catch { /* rig not ready this frame */ }
    return false;
  }

  /**
   * Write a hitbox as a capsule segment (outA→outB) and return its radius, or 0 when
   * the hitbox cannot be resolved this frame. `hb === null` means "the body capsule".
   */
  _hitboxSegment(e, hb, outA, outB) {
    const pos = e.position || e.root?.position;
    if (!pos) return 0;
    const r = e.radius || 0.34;
    if (!hb) {
      const h = e.height || 1.75;
      outA.copy(pos); outA.y += r;
      outB.copy(pos); outB.y += Math.max(r, h - r);
      return r;
    }
    // A bone-driven hitbox whose bone we cannot find is *not* guessable — the offset
    // is authored in bone space. Report failure and let the caller use the body capsule.
    if (hb.bone) { if (!this._bonePos(e.rig, hb.bone, outA)) return 0; }
    else outA.copy(pos);
    if (hb.offset) {
      // Offsets are authored in the entity's local frame.
      _vC.copy(hb.offset);
      if (e.root?.quaternion) _vC.applyQuaternion(e.root.quaternion);
      outA.add(_vC);
    }
    if (hb.tipOffset) {
      _vC.copy(hb.tipOffset);
      if (e.root?.quaternion) _vC.applyQuaternion(e.root.quaternion);
      outB.copy(outA).add(_vC);
    } else {
      outB.copy(outA);
    }
    return hb.radius || r * 0.6;
  }

  /** Cheap reject before the sub-stepped test. */
  _nearSwing(ra, target, bladeLen, travel) {
    const tp = target.position || target.root?.position;
    if (!tp) return false;
    _vA.addVectors(ra.base, ra.tip).multiplyScalar(0.5);
    _vB.addVectors(ra.prevBase, ra.prevTip).multiplyScalar(0.5);
    _vA.add(_vB).multiplyScalar(0.5);              // centre of the swept quad
    const reach = bladeLen * 0.5 + travel * 0.5 + (target.radius || 0.34) +
      (target.height || 1.75) * 0.5 + TUNING.BROAD_SLACK;
    return _vA.distanceToSquared(tp) <= reach * reach;
  }

  /**
   * Optional physics broadphase. `capsuleOverlap` is handed our own results array so
   * the query never allocates; anything it reports that maps back to an entity joins
   * the candidate set. Missing or throwing physics is simply ignored — the analytic
   * sweep is authoritative either way.
   */
  _physicsBroadphase(ra) {
    this._physCandidates.length = 0;
    const ph = this.ctx?.physics;
    if (typeof ph?.capsuleOverlap !== 'function') return 0;
    try {
      const out = this._overlapOut;
      out.length = 0;
      _vA.addVectors(ra.prevBase, ra.base).multiplyScalar(0.5);
      _vB.addVectors(ra.prevTip, ra.tip).multiplyScalar(0.5);
      const radius = Math.max(
        TUNING.SWEEP_PAD,
        0.5 * Math.max(ra.prevBase.distanceTo(ra.base), ra.prevTip.distanceTo(ra.tip)),
      );
      const L = ph.LAYER;
      const mask = L ? ((L.CHARACTER | L.PLAYER | L.ENEMY) || L.CHARACTER) : 0xffffffff;
      // capsuleOverlap writes by index and returns the count — never trust out.length.
      const n = ph.capsuleOverlap(_vA, _vB, radius, mask, out);
      for (let i = 0; i < n; i++) {
        const hit = out[i];
        const ent = hit?.owner || hit?.entity || hit?.userData?.entity || null;
        if (ent) this._physCandidates.push(ent);
      }
      return this._physCandidates.length;
    } catch {
      return 0;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  swing bookkeeping
   * ══════════════════════════════════════════════════════════════════════════ */

  _applySwingOpts(rec, e, opts) {
    rec.swingHeavy = opts?.heavy ?? !!e.weapon?.heavy;
    rec.swingKind = opts?.kind || e.weapon?.kind || 'slash';
    rec.swingMulti = opts?.multiHit ?? !!e.weapon?.multiHit;
    rec.swingDamage = opts?.damage ?? null;
    rec.swingPoise = opts?.poise ?? e.weapon?.poise ?? e.weapon?.posture ?? null;
    rec.swingPosture = opts?.posture ?? e.weapon?.posture ?? null;
  }

  _openSwing(rec, e, opts, now) {
    rec.swinging = true;
    rec.swingId = this._swingSeq++;
    rec.swingStart = now;
    rec.hitIds.length = 0;
    rec.hitTimes.length = 0;
    this._applySwingOpts(rec, e, opts);
    rec.lastAttack = now;

    // Lunge toward whatever this swing is most plausibly aimed at.
    rec.lungeTarget = this.nearestTarget(e, TUNING.ASSIST_RANGE, Math.PI * 1.1);
    rec.lungeUntil = rec.lungeTarget ? now + TUNING.LUNGE_MAX : 0;

    // Trail/whoosh cue, emitted at the start of the active window.
    if (rec.bladeValid) {
      const sp = this._slashP();
      sp.entity = e;
      sp.from.copy(rec.base);
      sp.to.copy(rec.tip);
      sp.arc = e.weapon?.arc ?? (rec.swingHeavy ? 2.6 : 2.0);
      sp.heavy = rec.swingHeavy;
      this.ctx?.bus?.emit?.('slash', sp);
    }

    if (e === this.ctx?.player) this._onPlayerSwing(rec, now);
  }

  /**
   * Enemies react to the player's swing: an archetype-weighted roll, delayed by that
   * archetype's reaction time. Repeating one attack raises the odds sharply — this is
   * the mechanism that teaches players not to mash.
   */
  _onPlayerSwing(rec, now) {
    const kind = rec.swingKind + (rec.swingHeavy ? '_h' : '');
    if (kind === this._lastPlayerKind && now - this._lastPlayerSwing < TUNING.SPAM_REPEAT_WINDOW) {
      this._spam = clamp01(this._spam + 0.28);
    } else {
      this._spam *= TUNING.SPAM_DECAY;
    }
    this._lastPlayerKind = kind;
    this._lastPlayerSwing = now;

    const player = this.ctx?.player;
    const pp = player?.position || player?.root?.position;
    if (!pp) return;
    const list = this._entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e === player || e.faction === player.faction) continue;
      if (e.isAlive === false || e.state === 'dead') continue;
      const erec = this._records.get(e);
      if (!erec || erec.parrySched > 0 || now < erec.parryReady) continue;
      if (now < erec.brokenUntil || now < erec.staggerUntil) continue;
      const ep = e.position || e.root?.position;
      if (!ep || ep.distanceToSquared(pp) > 16) continue;   // 4 m — inside blade reach

      const arch = this._archetype(e);
      const chance = clamp01(
        (arch.skill + this._spam * TUNING.SPAM_PARRY_BONUS) * this.diff.enemyParry,
      );
      if (this._rand() < chance) erec.parrySched = now + arch.react;
    }
  }

  _alreadyHit(rec, target, now) {
    const trec = this._rec(target);
    if (!trec) return false;
    const id = trec.uid;
    for (let i = 0; i < rec.hitIds.length; i++) {
      if (rec.hitIds[i] !== id) continue;
      // multi-hit spins opt back in on a timer; everything else is once per swing.
      if (rec.swingMulti && now - rec.hitTimes[i] >= TUNING.MULTIHIT_INTERVAL) return false;
      return true;
    }
    return false;
  }

  _markHit(rec, target, now) {
    const trec = this._rec(target);
    if (!trec) return;
    const id = trec.uid;
    for (let i = 0; i < rec.hitIds.length; i++) {
      if (rec.hitIds[i] === id) { rec.hitTimes[i] = now; return; }
    }
    rec.hitIds.push(id);
    rec.hitTimes.push(now);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   *  helpers
   * ══════════════════════════════════════════════════════════════════════════ */

  _rec(entity) {
    if (!entity) return null;
    let rec = this._records.get(entity);
    if (!rec) {
      rec = this._pool.pop() || new CombatRecord(0);
      rec.uid = this._uid++;
      rec.reset(entity);
      rec.seen = this._frame;
      this._records.set(entity, rec);
    }
    return rec;
  }

  /** Recycle records for entities that have left the world (despawned enemies). */
  _prune() {
    if ((this._frame & 63) !== 0) return;
    for (const [entity, rec] of this._records) {
      if (this._frame - rec.seen < 240) continue;    // ~4 s of grace
      this._records.delete(entity);
      rec.entity = null;
      if (this._pool.length < 32) this._pool.push(rec);
    }
  }

  _releaseAllFor(entity) {
    if (!entity) return;
    this.releaseToken(entity);
    const rec = this._records.get(entity);
    if (rec) { rec.swinging = false; rec.parryEnd = -999; rec.knock.set(0, 0, 0); }
  }

  _archetype(e) {
    const key = e?.archetype || e?.kind || e?.type;
    return TUNING.ARCHETYPES[key] || TUNING.ARCHETYPES.default;
  }

  /** The victim's poise *resistance*, in whatever units that entity authored. */
  _poiseOf(e) {
    return e?.poise ?? this._archetype(e).poise ?? 18;
  }

  /** The attacking move's poise weight (Player: 10–26; enemy moves: their posture value). */
  _attackPoise(attacker) {
    const rec = attacker ? this._records.get(attacker) : null;
    if (rec?.swingPoise != null) return rec.swingPoise;
    const w = attacker?.weapon;
    return w?.poise ?? w?.posture ?? TUNING.BASE_DAMAGE;
  }

  /**
   * Poise scales differ per author: Player rates its cuts 10–26 and calls anything
   * over 22 heavy, while enemy archetypes rate their own resistance 0.05–1.0. Report
   * the blow in the *victim's* units so both read it the way they were designed to.
   */
  _poiseFor(target, attackPoise) {
    const resist = target?.poise;
    if (resist != null && resist <= 3) return attackPoise / 20;
    return attackPoise;
  }

  /** Assign a field that may be a read-only accessor on the entity. */
  _safeSet(obj, key, value) {
    try { obj[key] = value; } catch { /* getter-only — the entity owns it */ }
  }

  _weaponDamage(e) {
    const rec = e ? this._records.get(e) : null;
    if (rec?.swingDamage != null) return rec.swingDamage;
    return e?.weapon?.damage ?? TUNING.BASE_DAMAGE;
  }

  /** Parry width: difficulty-scaled for the player, archetype-scaled for the AI. */
  _parryScaleFor(entity) {
    if (entity === this.ctx?.player) return this.diff.parryScale;
    return this._archetype(entity).window;
  }

  _centerOf(e, out) {
    const pos = e?.position || e?.root?.position;
    if (!pos) { out.set(0, 1.2, 0); return out; }
    out.copy(pos);
    out.y += (e.height || 1.75) * 0.55;
    return out;
  }

  _cameraAnchor(out) {
    const cam = this.ctx?.camera;
    if (!cam) { out.set(0, 1.35, 0); return out; }
    cam.getWorldDirection(_vH);
    out.copy(cam.position).addScaledVector(_vH, 3.0);
    return out;
  }

  _faceAlong(e, dir, sign) {
    if (!e) return;
    _vC.copy(dir).multiplyScalar(sign);
    _vC.y = 0;
    if (_vC.lengthSq() < EPS) return;
    _vC.normalize();
    if (e.forward?.isVector3) e.forward.copy(_vC);
    const root = e.root;
    if (root?.position && typeof root.lookAt === 'function') {
      _vD.copy(root.position).add(_vC);
      root.lookAt(_vD);
    }
    e.onFace?.(_vC);
  }

  /**
   * Entities that expose `setState` run their own FSM — we ask, we never assign. An
   * entity with an `onDamage` handler also owns its reactions, so we leave its `state`
   * alone entirely; only a passive entity gets its field written.
   */
  _setState(e, state, duration) {
    if (!e) return false;
    if (typeof e.setState === 'function') {
      try { e.setState(state, duration || 0); return true; } catch { /* fall through */ }
    }
    if (typeof e.onDamage === 'function' || typeof e._setState === 'function') return false;
    this._safeSet(e, 'state', state);
    return true;
  }

  _playClip(e, clip, duration) {
    try {
      if (typeof e?.playClip === 'function') { e.playClip(clip, duration); return; }
      e?.rig?.play?.(clip, duration);
    } catch { /* rig not ready */ }
  }

  _readStoredDifficulty() {
    try {
      const q = new URLSearchParams(location.search).get('difficulty');
      if (q && TUNING.DIFFICULTY[q]) return q;
      const s = localStorage.getItem('kagerou.difficulty');
      if (s && TUNING.DIFFICULTY[s]) return s;
    } catch { /* private mode / non-browser */ }
    return null;
  }
}

export default CombatDirector;
