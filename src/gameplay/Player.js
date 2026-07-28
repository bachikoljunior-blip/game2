/**
 * Player.js — the samurai.
 *
 * Three things live here and nothing else does:
 *   1. Locomotion. An acceleration model with separate accel/decel/turn rates, a
 *      turn-in-place, slope response and a 2D locomotion blend fed to the rig. The
 *      analogue magnitude picks walk/run/sprint *continuously* — a light stick push
 *      has to actually walk, which is the single biggest tell of a hand-made
 *      character controller versus a demo.
 *   2. A combat FSM with a 250 ms input buffer and cancel windows driven by the
 *      rig's clip event markers. Buffering is what makes an action game feel
 *      responsive: the player presses during recovery and it *still* comes out.
 *   3. The weapon transform export (`bladeBase`/`bladeTip`/`weapon.active`), which
 *      Combat sweeps for hits and Effects turns into the blade ribbon.
 *
 * Everything reached through `ctx` is optional-chained: sibling systems are written
 * in parallel and a missing one must degrade, never throw. The player still walks
 * around a bare heightfield with no Physics, no Combat and no FX present.
 */

import { Object3D, Vector3, Quaternion } from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/Noise.js';

// ------------------------------------------------------------------ constants

const DEG = Math.PI / 180;

const SPEED_WALK = 1.9;
const SPEED_RUN = 5.4;
const SPEED_SPRINT = 7.2;

const ACCEL = 24;              // m/s² toward the requested velocity
const DECEL = 32;              // m/s² when the request is slower than we are
const TURN_ACCEL = 16;         // m/s² applied to the lateral (direction-change) component
const GROUND_FRICTION = 9.5;   // exponential damping with no input
const AIR_CONTROL = 0.28;
const GRAVITY = -22;           // §4 — game-feel gravity, not 9.81

const SLOPE_LIMIT = 52 * DEG;  // above this we slide instead of walking
const STEP_HEIGHT = 0.42;

const CAP_RADIUS = 0.34;
const CAP_HEIGHT = 1.75;
const CHEST_Y = 1.34;

const INPUT_BUFFER = 0.25;     // §"250 ms input buffer"
const TURN_IN_PLACE_DOT = Math.cos(110 * DEG);
const TURN_IN_PLACE_RATE = 8.2;

const DODGE_COST = 24;
/** Per-clip dodge timelines, mirrored from the iframe markers in Poses.js. */
const DODGE_T = {
  dodge_roll: { in: 0.09, out: 0.56, cancel: 0.68, dur: 0.88 },
  dodge_back: { in: 0.085, out: 0.32, cancel: 0.39, dur: 0.52 },
  dodge_step_l: { in: 0.07, out: 0.27, cancel: 0.32, dur: 0.44 },
  dodge_step_r: { in: 0.07, out: 0.27, cancel: 0.32, dur: 0.44 },
};

const PARRY_WINDOW = 0.18;     // ~180 ms from the guard press/release
const BLADE_LENGTH = 1.02;     // 三尺 katana blade, tsuba to kissaki

// Stances: 中段 seigan (balanced), 上段 jodan (heavy/slow), 下段 gedan (fast/pressure).
const STANCES = {
  seigan: { key: 'seigan', kanji: '中段', damage: 1.00, poise: 1.00, reach: 1.00, startup: 1.00, guardMul: 1.00 },
  jodan: { key: 'jodan', kanji: '上段', damage: 1.30, poise: 1.14, reach: 1.07, startup: 1.24, guardMul: 0.86 },
  gedan: { key: 'gedan', kanji: '下段', damage: 0.84, poise: 1.34, reach: 0.93, startup: 0.82, guardMul: 1.16 },
};
const STANCE_ORDER = ['seigan', 'jodan', 'gedan'];

/**
 * Clip timelines, mirrored from the authored marker times in anim/Poses.js. The
 * rig's `hit-active-start`/`hit-active-end`/`cancel-window-open` markers are the
 * authority at runtime; these are the fallback so the FSM stays correct if the
 * rig is missing, and so `_beginAttack` can size the lunge before the clip runs.
 * `hit`/`end`/`cancel`/`dur` are seconds at playback rate 1.
 */
const CLIP_T = {
  slash_horizontal_r: { hit: 0.352, end: 0.478, cancel: 0.56, dur: 0.78 },
  slash_horizontal_l: { hit: 0.372, end: 0.502, cancel: 0.59, dur: 0.82 },
  slash_diagonal_dr: { hit: 0.398, end: 0.528, cancel: 0.62, dur: 0.86 },
  slash_diagonal_dl: { hit: 0.398, end: 0.528, cancel: 0.62, dur: 0.86 },
  slash_overhead: { hit: 0.412, end: 0.528, cancel: 0.65, dur: 0.88 },
  rising_cut: { hit: 0.368, end: 0.492, cancel: 0.58, dur: 0.80 },
  thrust: { hit: 0.298, end: 0.352, cancel: 0.44, dur: 0.64 },
  heavy_overhead: { hit: 0.658, end: 0.790, cancel: 1.08, dur: 1.58 },
  combo_1: { hit: 0.262, end: 0.382, cancel: 0.40, dur: 0.62 },
  combo_2: { hit: 0.254, end: 0.382, cancel: 0.42, dur: 0.68 },
  combo_3: { hit: 0.374, end: 0.505, cancel: 0.76, dur: 1.06 },
  draw_iai: { hit: 0.368, end: 0.470, cancel: 0.56, dur: 0.74 },
};

/**
 * Gameplay data per move. Timing comes from the clip; this is only what the
 * design owns — damage, posture pressure, reach and how far the cut travels.
 */
const MOVES = {
  h_r: { clip: 'slash_horizontal_r', damage: 16, poise: 12, reach: 2.15, lunge: 1.25, kind: 'slash' },
  h_l: { clip: 'slash_horizontal_l', damage: 17, poise: 13, reach: 2.15, lunge: 1.20, kind: 'slash' },
  d_dr: { clip: 'slash_diagonal_dr', damage: 19, poise: 14, reach: 2.25, lunge: 1.45, kind: 'slash' },
  d_dl: { clip: 'slash_diagonal_dl', damage: 19, poise: 14, reach: 2.25, lunge: 1.45, kind: 'slash' },
  over: { clip: 'slash_overhead', damage: 24, poise: 20, reach: 2.35, lunge: 1.70, kind: 'slash' },
  rise: { clip: 'rising_cut', damage: 20, poise: 18, reach: 2.10, lunge: 1.30, kind: 'slash' },
  thrust: { clip: 'thrust', damage: 22, poise: 10, reach: 2.70, lunge: 2.30, kind: 'thrust' },
  iai: { clip: 'draw_iai', damage: 34, poise: 26, reach: 2.95, lunge: 2.10, kind: 'slash' },
  c1: { clip: 'combo_1', damage: 15, poise: 11, reach: 2.05, lunge: 1.10, kind: 'slash' },
  c2: { clip: 'combo_2', damage: 17, poise: 13, reach: 2.10, lunge: 1.15, kind: 'slash' },
  c3: { clip: 'combo_3', damage: 27, poise: 22, reach: 2.30, lunge: 1.60, kind: 'slash' },
  heavy: { clip: 'heavy_overhead', damage: 38, poise: 34, reach: 2.45, lunge: 1.90, kind: 'slash' },
};

/** 8 gesture directions → the 7 authored cuts. Up-diagonals read as a 突き thrust. */
const DIR_TO_MOVE = {
  r: 'h_r', l: 'h_l', dr: 'd_dr', dl: 'd_dl',
  d: 'over', u: 'rise', ur: 'thrust', ul: 'thrust',
};

/** A hard flick on a vertical gesture promotes to the authored 大上段 heavy. */
const HEAVY_PROMOTE = { over: 'heavy', rise: 'heavy', iai: 'iai' };
/** Everything else stays on its own clip, slowed and committed. */
const HEAVY_RATE = 0.78;

/**
 * Combo strings. The opener decides the string, so a horizontal opening cut and an
 * overhead opening cut are genuinely different sequences. `!` marks the finisher:
 * bigger numbers, more lunge, and the heavy clip where the string calls for it.
 */
const CHAIN_SPEC = {
  h_r: ['h_r', 'c1', 'c2', 'heavy!'],
  h_l: ['h_l', 'c2', 'c1', 'c3!'],
  d_dr: ['d_dr', 'c1', 'd_dl', 'heavy!'],
  d_dl: ['d_dl', 'c2', 'd_dr', 'c3!'],
  over: ['over', 'c1', 'c2', 'heavy!'],
  rise: ['rise', 'c2', 'c3!'],
  thrust: ['thrust', 'h_r', 'c1', 'c3!'],
  iai: ['iai', 'c1', 'c2', 'heavy!'],
};

/**
 * Fallback locomotion blend space, mirroring LOCOMOTION_FORWARD in Poses.js. Only
 * used when the rig exposes no blend-space API of its own.
 */
const LOCO_FWD = [
  { clip: 'idle_drawn_seigan', speed: 0.0 },
  { clip: 'walk', speed: 1.9 },
  { clip: 'run', speed: 5.4 },
  { clip: 'sprint', speed: 7.2 },
];
const LOCO_BACK = { clip: 'walk_back', speed: 1.7 };
const LOCO_STRAFE = { l: 'strafe_l', r: 'strafe_r', speed: 2.4 };
const CHAINS = {};
for (const k of Object.keys(CHAIN_SPEC)) {
  CHAINS[k] = CHAIN_SPEC[k].map((s) => (
    s.endsWith('!') ? { key: s.slice(0, -1), finisher: true } : { key: s, finisher: false }
  ));
}

// ------------------------------------------------------------- module scratch
// Zero per-frame allocation (§0.4): every vector below is reused.

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _v4 = new Vector3();
const _v5 = new Vector3();
const _v6 = new Vector3();
const _q1 = new Quaternion();

let _nextId = 1;

/** Shortest signed angle from a to b, in radians. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ------------------------------------------------------------------- Player

export class Player {
  constructor(ctx) {
    this.ctx = ctx;

    // ---- §3 entity contract (names are read by Combat, Enemy AI and the HUD) --
    this.id = _nextId++;
    this.faction = 'player';
    this.root = new Object3D();
    this.root.name = 'player';
    this.position = this.root.position;          // alias, never copied
    this.forward = new Vector3(0, 0, -1);
    this.velocity = new Vector3();
    this.radius = CAP_RADIUS;
    this.height = CAP_HEIGHT;
    this.maxHealth = 100; this.health = 100;
    /** Sekiro-style: posture is *accumulated pressure*, 0 fresh → maxPosture breaks. */
    this.maxPosture = 100; this.posture = 0;
    this.state = 'sheathed';
    this.invulnerable = false;
    this.hitboxes = [
      { bone: 'head', offset: new Vector3(0, 0.06, 0), radius: 0.15 },
      { bone: 'spine_02', offset: new Vector3(0, 0.06, 0), radius: 0.26 },
      { bone: 'hips', offset: new Vector3(0, 0.02, 0), radius: 0.24 },
      { bone: 'upperarm_l', offset: new Vector3(0, 0, 0), radius: 0.13 },
      { bone: 'upperarm_r', offset: new Vector3(0, 0, 0), radius: 0.13 },
      { bone: 'thigh_l', offset: new Vector3(0, 0, 0), radius: 0.15 },
      { bone: 'thigh_r', offset: new Vector3(0, 0, 0), radius: 0.15 },
    ];
    this.weapon = { tipBone: 'weapon_tip', length: BLADE_LENGTH, active: false, damage: MOVES.h_r.damage };
    this.isAlive = true;

    // ---- weapon transform export -------------------------------------------
    this.bladeBase = new Vector3();
    this.bladeTip = new Vector3();
    this.prevBladeBase = new Vector3();
    this.prevBladeTip = new Vector3();
    /** Blade axis in hand-bone space; -Z is forward for a default-facing bone (§4). */
    this.bladeAxisLocal = new Vector3(0, 0, -1);
    this.bladeOriginLocal = new Vector3(0, 0, -0.06);

    // ---- resources ----------------------------------------------------------
    this.maxStamina = 100; this.stamina = 100;
    this.staminaRegen = 30;
    this.postureRegen = 16;

    // ---- locomotion state ---------------------------------------------------
    this.yaw = 0;                 // facing, radians (0 = -Z)
    this.desiredYaw = 0;
    this.speed = 0;               // horizontal speed, m/s
    this.grounded = true;
    this.groundInfo = null;
    this.groundNormal = new Vector3(0, 1, 0);
    this.groundSurface = 'dirt';
    this.slopeAngle = 0;
    this.sliding = false;
    this.airTime = 0;
    this.turningInPlace = false;
    this.sprinting = false;
    this.moveDir = new Vector3();      // world-space requested direction
    this.locoBlend = {                 // shared by reference with the rig
      speed: 0, strafe: 0, forward: 0, x: 0, y: 0,
      normalized: 0, sprint: 0, guard: 0, sheathed: 1, slope: 0, stance: 'seigan',
    };

    // ---- combat state -------------------------------------------------------
    this.stance = 'seigan';
    this.stanceDef = STANCES.seigan;
    this.sheathed = true;
    this.guarding = false;
    this.lockTarget = null;
    this.attack = null;                // live attack instance (reused object)
    this.chain = null;
    this.chainIndex = 0;
    this.canCancel = false;
    this.comboCount = 0;
    this.aimAssist = ctx.quality?.device?.isMobile === false ? 0.6 : 1.0;  // §6 — on by default
    this.allowRagdoll = ctx.quality?.ragdoll !== false;

    this.attackInfo = {                // handed to ctx.combat.beginAttack, reused
      entity: this, move: 'h_r', clip: 'slash_horizontal_r', damage: 16, poise: 12,
      kind: 'slash', reach: 2.15, heavy: false, finisher: false, stance: 'seigan',
      combo: 0, base: this.bladeBase, tip: this.bladeTip,
    };

    // ---- timers -------------------------------------------------------------
    this.stateTime = 0;
    this._parryTimer = 0;
    this._guardTime = 0;
    this._staminaHold = 0;
    this._postureHold = 0;
    this._iframe = 0;
    this._specialDown = -1;
    this._landDip = 0;
    this._landDipVel = 0;
    this._lean = 0;
    this._pitchLean = 0;
    this._strideAcc = 0;
    this._footSide = 0;
    this._rigFootsteps = false;
    this._trailOpen = false;
    this._chainGrace = 0;
    this._ragdollAt = -1;
    this._dodgeT = null;
    this._staggerTime = 0.6;
    this._prevYaw = 0;
    this._yawRate = 0;
    this._locoClip = '';
    this._fadeMats = null;
    this._opacity = 1;

    // ---- input buffer (pre-allocated ring, never grows) ----------------------
    this._buf = [];
    for (let i = 0; i < 8; i++) this._buf.push({ action: '', dir: 'r', power: 0, t: -99, live: false });
    this._bufHead = 0;

    // ---- pooled event payloads ---------------------------------------------
    this._evFootstep = { entity: this, point: new Vector3(), surface: 'dirt', speed: 0 };
    this._evStance = { entity: this, stance: 'seigan' };
    this._evDamage = { entity: this, amount: 0, direction: new Vector3() };
    this._evShake = { amount: 0, duration: 0.2, freq: 22 };

    this.spawnPosition = new Vector3(0, 0, 8);
    this.spawnYaw = 0;

    this._disp = new Vector3();
    this._lungeVel = new Vector3();
    this._dodgeDir = new Vector3();
    this._lookAt = new Vector3();
  }

  // ------------------------------------------------------------------- boot

  async init() {
    const ctx = this.ctx;

    // Spawn: the level owns placement; fall back to the shrine approach.
    const sp = ctx.level?.playerSpawn ?? ctx.level?.spawns?.player ?? null;
    const p = sp?.position ?? sp;
    if (p && typeof p.x === 'number') this.spawnPosition.set(p.x, p.y ?? 0, p.z);
    if (typeof sp?.yaw === 'number') this.spawnYaw = sp.yaw;
    this.root.position.copy(this.spawnPosition);
    this.yaw = this.desiredYaw = this._prevYaw = this.spawnYaw;
    const h = ctx.terrain?.heightAt?.(this.root.position.x, this.root.position.z);
    if (typeof h === 'number') this.root.position.y = h;
    this.spawnPosition.copy(this.root.position);

    // `body` sits between the entity root and the rig so lean/land-dip never fight
    // whatever the rig writes into its own root.
    this.body = new Object3D();
    this.body.name = 'player-body';
    this.root.add(this.body);
    ctx.scene?.add(this.root);

    await this._createRig();

    // Capsule controller. Without Physics we integrate against the heightfield.
    this.controller = ctx.physics?.createCharacter?.({
      radius: CAP_RADIUS, height: CAP_HEIGHT, stepHeight: STEP_HEIGHT,
      slopeLimit: SLOPE_LIMIT / DEG, mass: 74,
    }) ?? null;
    if (this.controller?.position?.copy) this.controller.position.copy(this.root.position);
    else if (this.controller?.setPosition) this.controller.setPosition(this.root.position);

    this._applyForward();
    this._play('idle_sheathed', 0.0, 1, true);
    return this;
  }

  /**
   * Rig.js is written in parallel; a dynamic import means a broken or missing rig
   * costs us a visible character, not the whole boot.
   */
  async _createRig() {
    try {
      const mod = await import('../anim/Rig.js');
      const Rig = mod?.Rig;
      if (typeof Rig === 'function') {
        this.rig = new Rig(this.ctx, {
          entity: this, faction: 'player', height: CAP_HEIGHT,
          weapon: 'katana', armour: 'ronin',
        });
      }
    } catch (err) {
      console.warn('[player] rig unavailable, running without a body', err);
    }
    if (!this.rig) return;

    const rigRoot = this.rig.root;
    if (rigRoot && rigRoot.parent !== this.body) this.body.add(rigRoot);

    // Weapon mount: an empty parented to the hand so the blade transform is exact
    // even when the rig re-authors the hand pose mid-frame.
    this.weaponMount = new Object3D();
    this.weaponMount.name = 'weapon-mount';
    try { this.rig.attach?.('hand_r', this.weaponMount); } catch { /* rig may not expose it */ }
    if (!this.weaponMount.parent) this.body.add(this.weaponMount);

    // Clip markers are the authority for the hit-active, cancel and i-frame
    // windows (names come from EVENT_NAMES in Poses.js). The timers in the FSM are
    // the fallback so everything still resolves with a marker-less rig.
    const on = (name, fn) => { try { this.rig.on?.(name, fn); } catch { /* optional */ } };
    on('hit-active-start', () => this._setWeaponActive(true));
    on('hit-active-end', () => this._setWeaponActive(false));
    on('cancel-window-open', () => { this.canCancel = true; });
    on('footstep', (e) => { this._rigFootsteps = true; this._footstep(e?.foot ?? e?.side ?? null); });
    on('iframe-start', () => {
      if (this.state !== 'dodge') return;
      this.invulnerable = true;
      this._iframe = 0.5;
      const T = this._dodgeT || DODGE_T.dodge_roll;
      this.ctx.combat?.grantIFrames?.(this, T.out - T.in);
    });
    on('iframe-end', () => {
      if (this.state === 'dodge') { this.invulnerable = false; this._iframe = 0; }
    });
    on('sheathe-click', () => { this.sheathed = true; this._locoClip = ''; });
    on('chiburi', () => this.ctx.fx?.bloodFlick?.(this.bladeTip, this.forward));
    on('ragdoll-handoff', () => this._handoffRagdoll());
    on('clip-end', () => { if (this.attack) this.attack.markerEnd = true; });
  }

  // ------------------------------------------------------------------ frame

  update(dt, elapsed, rawDt) {
    // Pump before the pause guard: Input.update() is what zeroes the accumulated
    // look delta, and a stale non-zero delta would spin the camera while paused.
    this._pumpInput();
    if (dt <= 0) { this._exportWeapon(); return; }
    const ctx = this.ctx;
    const input = ctx.input;
    const st = input?.state ?? null;

    this.lockTarget = ctx.playerCamera?.lockTarget ?? null;
    this.stateTime += dt;

    if (this.isAlive) {
      this._readInput(st, input, dt);
      this._tickTimers(dt);
      this._runState(dt, st);
    } else {
      this._deadUpdate(dt);
    }

    this._integrate(dt);
    this._applyFacing(dt);
    this._updateRig(dt);
    this._exportWeapon(dt);
    this._footstepFallback(dt);
    this._regen(dt);
  }

  lateUpdate() {
    // Input is not registered as an engine system; someone has to close the frame
    // and the player is the earliest consumer, so it does it (idempotently).
    const input = this.ctx.input;
    if (!input) return;
    const f = this.ctx.engine?.frame ?? 0;
    if (input.__kagEndFrame !== f) { input.__kagEndFrame = f; input.endFrame?.(); }
  }

  /** Pump Input once per frame regardless of who else remembered to. */
  _pumpInput() {
    const input = this.ctx.input;
    if (!input) return;
    const f = this.ctx.engine?.frame ?? 0;
    if (input.__kagPumpFrame === f) return;
    input.__kagPumpFrame = f;
    input.update?.();
  }

  // ------------------------------------------------------------------ input

  _readInput(st, input, dt) {
    if (!st) return;

    // Stances. Direct keys on desktop, cycle button on touch.
    if (input.consume?.('stance1')) this.setStance('seigan');
    if (input.consume?.('stance2')) this.setStance('jodan');
    if (input.consume?.('stance3')) this.setStance('gedan');
    if (input.consume?.('stance')) {
      this.setStance(STANCE_ORDER[(STANCE_ORDER.indexOf(this.stance) + 1) % STANCE_ORDER.length]);
    }

    // Guard is a hold. The parry window opens on the *edge* in either direction:
    // a press at the moment of impact and a release at the moment of impact both
    // read as a deflect, which is what players actually try.
    const wantGuard = !!st.guard && this._canGuard();
    if (wantGuard !== this.guarding) {
      this.guarding = wantGuard;
      this._parryTimer = PARRY_WINDOW;
      if (wantGuard) this._guardTime = 0;
      // Combat's guard cone reads `rec.guarding` (or state === 'guard'); tell it
      // on the edge rather than every frame.
      this.ctx.combat?.setGuard?.(this, wantGuard);
      // The edge is also the deflect attempt — Combat owns the window timing.
      if (this.ctx.combat?.requestParry) this.ctx.combat.requestParry(this);
    }
    if (this.guarding) this._guardTime += dt;

    // Slash gestures → buffered attacks. `power` promotes to the heavy variant.
    const slashes = st.slashes;
    if (slashes && slashes.length) {
      for (let i = 0; i < slashes.length; i++) {
        const s = slashes[i];
        this._buffer('attack', s.dir, s.power ?? 0);
      }
    }
    if (input.consume?.('attack')) this._buffer('attack', this._defaultDir(), 0.3);
    if (input.consume?.('heavy')) this._buffer('attack', this._defaultDir(), 1.0);
    if (input.consume?.('dodge')) this._buffer('dodge', 'b', 0);
    if (input.consume?.('sheathe')) this._buffer('sheathe', 'b', 0);

    // Long-press on 技 sheathes / draws; a tap is the special (heaviest) cut.
    if (input.consume?.('special')) this._specialDown = 0;
    if (this._specialDown >= 0) this._specialDown += dt;
    if (input.consume?.('special:up')) {
      if (this._specialDown > 0.45) this._buffer('sheathe', 'b', 0);
      else this._buffer('attack', this._defaultDir(), 1.0);
      this._specialDown = -1;
    } else if (this._specialDown > 0.9) {
      this._buffer('sheathe', 'b', 0);
      this._specialDown = -1;
    }
  }

  /** Tap/click has no direction, so derive one from the stance for variety. */
  _defaultDir() {
    if (this.stance === 'jodan') return 'd';
    if (this.stance === 'gedan') return 'u';
    return (this.comboCount & 1) ? 'l' : 'r';
  }

  _buffer(action, dir, power) {
    const slot = this._buf[this._bufHead];
    this._bufHead = (this._bufHead + 1) % this._buf.length;
    slot.action = action; slot.dir = dir; slot.power = power;
    slot.t = 0; slot.live = true;
  }

  /** Most-recent-first search of the buffer; consuming clears the whole queue. */
  _takeBuffered(action) {
    let best = null;
    for (let i = 0; i < this._buf.length; i++) {
      const s = this._buf[i];
      if (!s.live || s.action !== action) continue;
      if (!best || s.t < best.t) best = s;
    }
    if (!best) return null;
    for (let i = 0; i < this._buf.length; i++) this._buf[i].live = false;
    return best;
  }

  _clearBuffer() {
    for (let i = 0; i < this._buf.length; i++) this._buf[i].live = false;
  }

  _tickTimers(dt) {
    for (let i = 0; i < this._buf.length; i++) {
      const s = this._buf[i];
      if (!s.live) continue;
      s.t += dt;
      if (s.t > INPUT_BUFFER) s.live = false;
    }
    if (this._parryTimer > 0) this._parryTimer -= dt;
    if (this._iframe > 0) {
      this._iframe -= dt;
      if (this._iframe <= 0) this.invulnerable = false;
    }
    if (this._staminaHold > 0) this._staminaHold -= dt;
    if (this._postureHold > 0) this._postureHold -= dt;
    if (this._chainGrace > 0) {
      this._chainGrace -= dt;
      if (this._chainGrace <= 0) { this._chainGrace = 0; this.chain = null; }
    }
  }

  _regen(dt) {
    if (!this.isAlive) return;
    if (this._staminaHold <= 0 && this.state !== 'sprint') {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
    }
    if (this.state === 'sprint') {
      this.stamina = Math.max(0, this.stamina - 9 * dt);
      if (this.stamina <= 0) this.sprinting = false;
    }
    // CombatDirector runs its own posture regen (TUNING.POSTURE_REGEN); running
    // ours on top would drain the bar at double rate.
    if (this.ctx.combat?.addPosture) return;
    // Guarding correctly bleeds posture off faster — holding the line is rewarded.
    if (this._postureHold <= 0 && this.posture > 0) {
      const rate = this.postureRegen * (this.guarding ? 1.65 : 1) * (this.state === 'attack' ? 0.4 : 1);
      this.posture = Math.max(0, this.posture - rate * dt);
    }
  }

  // ------------------------------------------------------------------- FSM

  /**
   * `force` re-enters a state we are already in — chaining attack→attack and
   * dodge→dodge both need the exit/entry pair to run again.
   */
  _setState(next, data, force = false) {
    if (this.state === next && !force) return;
    this._exitState(this.state);
    this.state = next;
    this.stateTime = 0;
    this._enterState(next, data);
  }

  _exitState(prev) {
    switch (prev) {
      case 'attack':
      case 'drawing':
        this._setWeaponActive(false);
        this.attack = null;
        this.canCancel = false;
        this._lungeVel.set(0, 0, 0);
        break;
      case 'dodge':
        this.invulnerable = false;
        this._iframe = 0;
        break;
      case 'guard':
        this.locoBlend.guard = 0;
        break;
      default:
        break;
    }
  }

  _enterState(next, data) {
    switch (next) {
      case 'idle':
      case 'sheathed':
        this._locoClip = '';   // the blend space owns the idle pose
        break;
      case 'move':
      case 'sprint':
        this._locoClip = '';
        break;
      case 'guard':
        this._play('guard', 0.12, 1, false);
        this.locoBlend.guard = 1;
        break;
      case 'parry':
        if (!this._external) this._play('parry', 0.05, 1, false);
        break;
      case 'dodge':
        this._beginDodge(data);
        break;
      case 'attack':
      case 'drawing':
        this._beginAttack(data);
        break;
      case 'stagger':
        // Combat plays its own directional stagger right after pushing the state.
        if (!this._external) this._play(data?.clip || 'stagger_back', 0.06, 1, false);
        this._postureHold = 1.1;
        break;
      case 'execution':
        if (!this._external) this._play('execution_attacker', 0.08, 1, false);
        this.invulnerable = true;
        this._iframe = 2.4;
        break;
      case 'dead':
        if (!this._external) this._play(data?.clip || 'death_back', 0.08, 1, false);
        break;
      default:
        break;
    }
  }

  _runState(dt, st) {
    switch (this.state) {
      case 'attack':
      case 'drawing': this._updateAttack(dt, st); break;
      case 'dodge': this._updateDodge(dt); break;
      case 'stagger': this._updateStagger(dt); break;
      case 'parry': this._updateParry(dt); break;
      case 'execution':
        this.velocity.x = damp(this.velocity.x, 0, 12, dt);
        this.velocity.z = damp(this.velocity.z, 0, 12, dt);
        if (this.stateTime > 1.6) this._setState('idle');
        break;
      default: this._updateGrounded(dt, st); break;
    }
  }

  /** idle / move / sprint / guard / sheathed all share the locomotion body. */
  _updateGrounded(dt, st) {
    // Actions take priority over movement, in the order a player expects them.
    if (this._tryDodge()) return;
    if (this._tryAttack()) return;
    this._trySheathe();

    this._locomotion(dt, st, 1);

    const moving = this.speed > 0.12 || (st?.moveMag ?? 0) > 0.02;
    let next;
    if (this.guarding) next = 'guard';
    else if (this.sprinting && this.speed > SPEED_RUN * 0.86) next = 'sprint';
    else if (moving) next = 'move';
    else next = this.sheathed ? 'sheathed' : 'idle';
    this._setState(next);
  }

  // ------------------------------------------------------------- locomotion

  /**
   * `authority` scales how much control the current state grants (attacks get a
   * sliver so the character does not feel nailed to the floor).
   */
  _locomotion(dt, st, authority) {
    const mag = st ? st.moveMag : 0;
    const camYaw = this._cameraYaw();

    // Camera-relative stick → world direction.
    if (mag > 0.001 && st) {
      const sx = st.move.x, sy = st.move.y;
      const len = Math.hypot(sx, sy) || 1;
      const nx = sx / len, ny = sy / len;
      const cf = -Math.sin(camYaw), cfz = -Math.cos(camYaw);   // camera forward on XZ
      const cr = Math.cos(camYaw), crz = -Math.sin(camYaw);    // camera right on XZ
      this.moveDir.set(cf * ny + cr * nx, 0, cfz * ny + crz * nx);
      if (this.moveDir.lengthSq() > 1e-6) this.moveDir.normalize();
    } else {
      this.moveDir.set(0, 0, 0);
    }

    // Continuous walk → run → sprint from the analogue magnitude. The first band
    // is deliberately wide: most of a thumb's travel should be a walk.
    let target = 0;
    if (mag > 0.06) {
      if (mag < 0.55) target = lerp(0.55, SPEED_WALK, smoothstep(0.06, 0.55, mag));
      else if (mag < 0.92) target = lerp(SPEED_WALK, SPEED_RUN, (mag - 0.55) / 0.37);
      else target = lerp(SPEED_RUN, SPEED_SPRINT, (mag - 0.92) / 0.08);
    }
    const wantSprint = !!st?.run && mag > 0.85 && this.stamina > 4 && !this.guarding && !this.lockTarget;
    this.sprinting = wantSprint && target > SPEED_RUN * 0.8;
    if (!this.sprinting) target = Math.min(target, SPEED_RUN);
    if (this.guarding) target = Math.min(target, SPEED_WALK * 1.15);
    target *= authority;

    // Slope: uphill costs speed, downhill gives it back (Rig lengthens the stride
    // off `locoBlend.slope`). slopeSign > 0 means we are climbing.
    let slopeSign = 0;
    if (this.moveDir.lengthSq() > 1e-6 && this.groundNormal.y < 0.999) {
      slopeSign = clamp(-(this.moveDir.x * this.groundNormal.x + this.moveDir.z * this.groundNormal.z), -1, 1);
      const steep = clamp(this.slopeAngle / SLOPE_LIMIT, 0, 1.4);
      target *= 1 - slopeSign * steep * (slopeSign > 0 ? 0.34 : 0.30);
      target = Math.max(0, target);
    }
    this.locoBlend.slope = slopeSign;

    // Turn-in-place: a big direction change from a standstill rotates first and
    // only then commits, instead of pivoting the whole body while sliding.
    if (this.moveDir.lengthSq() > 1e-6) {
      const fdot = this.forward.x * this.moveDir.x + this.forward.z * this.moveDir.z;
      if (!this.turningInPlace && fdot < TURN_IN_PLACE_DOT && this.speed < 1.35) {
        // No turn clip is authored: we hold the idle pose and rotate the root at
        // TURN_IN_PLACE_RATE, which is what the blend space expects at speed 0.
        this.turningInPlace = true;
      }
      this.desiredYaw = Math.atan2(-this.moveDir.x, -this.moveDir.z);
      if (this.turningInPlace) {
        target = 0;
        if (fdot > 0.9) { this.turningInPlace = false; this._locoClip = ''; }
      }
    } else {
      this.turningInPlace = false;
    }

    // When locked on, face the target and strafe; sprinting overrides so the
    // player can always disengage cleanly.
    if (this.lockTarget && !this.sprinting) {
      const tp = this.lockTarget.position;
      if (tp) this.desiredYaw = Math.atan2(-(tp.x - this.position.x), -(tp.z - this.position.z));
    }

    // --- acceleration model -------------------------------------------------
    _v1.copy(this.moveDir).multiplyScalar(target);            // target velocity
    _v2.set(this.velocity.x, 0, this.velocity.z);             // current planar
    const cur = _v2.length();

    if (target < 0.02) {
      // Friction, not a lerp to zero: it keeps a little slide on a fast stop.
      const k = Math.exp(-GROUND_FRICTION * dt * (this.grounded ? 1 : 0.15));
      this.velocity.x *= k;
      this.velocity.z *= k;
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.05) { this.velocity.x = 0; this.velocity.z = 0; }
    } else {
      _v3.copy(_v1).sub(_v2);                                 // delta to target
      const dl = _v3.length();
      const grip = this.grounded ? 1 : AIR_CONTROL;
      if (dl > 1e-5 && cur <= 1e-4) {
        // From a standstill the whole correction is a change of speed.
        const step = Math.min(1, (ACCEL * grip * dt) / dl);
        this.velocity.x += _v3.x * step;
        this.velocity.z += _v3.z * step;
      } else if (dl > 1e-5) {
        // Split the correction into "change of speed" and "change of direction"
        // so a hard turn does not read as a hard brake.
        const along = (_v3.x * _v2.x + _v3.z * _v2.z) / cur;
        _v4.copy(_v2).multiplyScalar(along / cur);
        _v5.copy(_v3).sub(_v4);                               // lateral part
        const rateAlong = along >= 0 ? ACCEL : DECEL;
        _v4.multiplyScalar(Math.min(1, (rateAlong * grip * dt) / Math.max(1e-4, Math.abs(along))));
        const ll = _v5.length();
        if (ll > 1e-5) _v5.multiplyScalar(Math.min(1, (TURN_ACCEL * grip * dt) / ll));
        this.velocity.x += _v4.x + _v5.x;
        this.velocity.z += _v4.z + _v5.z;
      }
    }

    // Sliding: above the slope limit control is lost and gravity wins.
    if (this.sliding) {
      const n = this.groundNormal;
      _v6.set(n.x, 0, n.z);
      const l = _v6.length();
      if (l > 1e-4) {
        _v6.multiplyScalar(1 / l);
        const push = 14 * (this.slopeAngle - SLOPE_LIMIT) / SLOPE_LIMIT;
        this.velocity.x += _v6.x * push * dt;
        this.velocity.z += _v6.z * push * dt;
      }
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  _cameraYaw() {
    const pc = this.ctx.playerCamera;
    if (pc && typeof pc.yaw === 'number') return pc.yaw;
    const cam = this.ctx.camera;
    if (!cam) return this.yaw;
    _v1.set(0, 0, -1).applyQuaternion(cam.quaternion);
    return Math.atan2(-_v1.x, -_v1.z);
  }

  // -------------------------------------------------------------- integrate

  _integrate(dt) {
    // Gravity, then the capsule controller (or the heightfield when it is absent).
    if (!this.grounded) this.velocity.y += GRAVITY * dt;
    else if (this.velocity.y < 0) this.velocity.y = -2.0;      // stick to slopes

    this._disp.copy(this.velocity).multiplyScalar(dt);
    if (this._lungeVel.lengthSq() > 1e-6) {
      this._disp.x += this._lungeVel.x * dt;
      this._disp.z += this._lungeVel.z * dt;
    }

    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    let gi = null;

    if (this.controller?.move) {
      // Combat's lunge, knockback and execution lock write straight into
      // `root.position`; re-seat the capsule before we move or we undo them.
      const cpos = this.controller.position;
      if (cpos && typeof cpos.x === 'number') {
        if (Math.abs(cpos.x - this.root.position.x) > 1e-4
          || Math.abs(cpos.y - this.root.position.y) > 1e-4
          || Math.abs(cpos.z - this.root.position.z) > 1e-4) {
          if (cpos.copy) cpos.copy(this.root.position);
          else this.controller.setPosition?.(this.root.position);
        }
      }
      gi = this.controller.move(this._disp, dt) || null;
      const cp = this.controller.position ?? gi?.position;
      if (cp && typeof cp.x === 'number') this.root.position.set(cp.x, cp.y, cp.z);
      else this.root.position.add(this._disp);
    } else {
      this.root.position.add(this._disp);
    }

    if (gi) {
      this.grounded = !!gi.grounded;
      if (gi.normal && typeof gi.normal.x === 'number') this.groundNormal.set(gi.normal.x, gi.normal.y, gi.normal.z);
      if (gi.surface) this.groundSurface = gi.surface;
      this.groundInfo = gi;
    } else {
      // Heightfield fallback so the player is never stuck mid-air without Physics.
      const h = this.ctx.terrain?.heightAt?.(this.root.position.x, this.root.position.z);
      const gy = typeof h === 'number' ? h : 0;
      if (this.root.position.y <= gy + 0.02) {
        this.root.position.y = gy;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
      const n = this.ctx.terrain?.normalAt?.(this.root.position.x, this.root.position.z);
      if (n && typeof n.x === 'number') this.groundNormal.set(n.x, n.y, n.z);
      else this.groundNormal.set(0, 1, 0);
      const s = this.ctx.terrain?.surfaceAt?.(this.root.position.x, this.root.position.z);
      if (s) this.groundSurface = s;
    }

    this.slopeAngle = Math.acos(clamp(this.groundNormal.y, -1, 1));
    this.sliding = this.grounded && this.slopeAngle > SLOPE_LIMIT;

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.16) this._land(fallSpeed);
      this.airTime = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else {
      this.airTime += dt;
    }

    // Lunge decays fast; it is a nudge into the cut, not a dash.
    if (this._lungeVel.lengthSq() > 1e-6) {
      const k = Math.exp(-9 * dt);
      this._lungeVel.multiplyScalar(k);
      if (this._lungeVel.lengthSq() < 1e-4) this._lungeVel.set(0, 0, 0);
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  _land(fallSpeed) {
    const impact = clamp((fallSpeed - 3.0) / 12, 0, 1);
    if (impact <= 0.001) return;
    // No landing clip is authored — the absorb is the procedural dip below plus
    // whatever the rig's foot IK does with the new ground plane.
    this._landDip = -0.10 - impact * 0.26;
    this._landDipVel = 0;
    this._locoClip = '';
    _v1.copy(this.root.position);
    this.ctx.fx?.dustPuff?.(_v1, 0.4 + impact * 1.2, this.groundSurface);
    if (impact > 0.35) {
      this._evShake.amount = impact * 0.5;
      this._evShake.duration = 0.22;
      this._evShake.freq = 26;
      this.ctx.bus?.emit?.('camera-shake', this._evShake);
    }
    this._emitFootstep(1.2);
  }

  // ----------------------------------------------------------------- facing

  _applyFacing(dt) {
    // Angular speed falls off with speed: snappy at a walk, committed at a sprint.
    const t = clamp(this.speed / SPEED_SPRINT, 0, 1);
    let rate = lerp(14.0, 5.2, t);
    if (this.turningInPlace) rate = TURN_IN_PLACE_RATE;
    else if (this.state === 'attack' || this.state === 'drawing') rate = 3.0;
    else if (this.lockTarget) rate = 12.0;

    const d = angleDelta(this.yaw, this.desiredYaw);
    const step = clamp(d, -rate * dt, rate * dt);
    this.yaw += step;
    this._yawRate = damp(this._yawRate, dt > 0 ? step / dt : 0, 10, dt);

    this.root.rotation.y = this.yaw;
    this._applyForward();

    // Body lean: into the turn, and forward under acceleration. Small numbers —
    // the moment it reads as "leaning" it has gone too far.
    const leanTarget = clamp(-this._yawRate * 0.055 * (0.35 + t), -0.20, 0.20);
    this._lean = damp(this._lean, leanTarget, 6, dt);
    const pitchTarget = clamp((this.speed / SPEED_SPRINT) * 0.075 + (this.sliding ? -0.08 : 0), -0.12, 0.12);
    this._pitchLean = damp(this._pitchLean, pitchTarget, 5, dt);

    if (this.body) {
      this.body.rotation.z = this._lean;
      this.body.rotation.x = this._pitchLean;
      // Critically-damped absorb on landing.
      const k = 26, c = 2 * Math.sqrt(k);
      this._landDipVel += (-k * this._landDip - c * this._landDipVel) * dt;
      this._landDip += this._landDipVel * dt;
      if (Math.abs(this._landDip) < 1e-4 && Math.abs(this._landDipVel) < 1e-3) {
        this._landDip = 0; this._landDipVel = 0;
      }
      this.body.position.y = this._landDip;
    }
  }

  _applyForward() {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  // -------------------------------------------------------------------- rig

  _updateRig(dt) {
    const rig = this.rig;
    if (!rig) return;

    // 2D blend space: forward speed × strafe, both in m/s so the rig can match
    // stride length to ground speed and the feet never skate.
    const fwdX = this.forward.x, fwdZ = this.forward.z;
    const rightX = -fwdZ, rightZ = fwdX;
    const vf = this.velocity.x * fwdX + this.velocity.z * fwdZ;
    const vs = this.velocity.x * rightX + this.velocity.z * rightZ;
    const b = this.locoBlend;
    b.forward = damp(b.forward, vf, 16, dt);
    b.strafe = damp(b.strafe, vs, 16, dt);
    b.speed = Math.hypot(b.forward, b.strafe);
    b.x = b.strafe; b.y = b.forward;
    b.normalized = clamp(b.speed / SPEED_SPRINT, 0, 1);
    b.sprint = this.sprinting ? 1 : 0;
    b.sheathed = this.sheathed ? 1 : 0;
    b.stance = this.stance;

    const acting = this.state === 'attack' || this.state === 'drawing' || this.state === 'dodge'
      || this.state === 'stagger' || this.state === 'parry' || this.state === 'execution'
      || this.state === 'dead';
    if (!acting) {
      // Blend params are shared by reference, but push them through every setter
      // the rig might implement — whichever exists gets fresh numbers.
      let handled = false;
      if (rig.setLocomotion) { rig.setLocomotion(b.forward, b.strafe, b.normalized); handled = true; }
      if (rig.setBlend) { rig.setBlend('locomotion', b.x, b.y); handled = true; }
      if (rig.setParam) { rig.setParam('speed', b.speed); rig.setParam('strafe', b.strafe); }
      if (!handled) this._driveLocoClip(b);
    }
    rig.setStance?.(this.stance);

    // Head/eye aim: the lock target, else a point down the facing.
    if (this.lockTarget?.position) {
      this._lookAt.copy(this.lockTarget.position);
      this._lookAt.y += 1.35;
    } else {
      this._lookAt.copy(this.position).addScaledVector(this.forward, 8);
      this._lookAt.y += 1.55;
    }
    rig.setLookTarget?.(this._lookAt);

    // Foot planting wants the ground under each foot; hand the rig what we know.
    rig.setGround?.(this.groundNormal, this.grounded, this.groundSurface);
    rig.update?.(dt);
  }

  /**
   * Fallback blend space: pick the clip from the authored gait table and set the
   * playback rate from ground speed so the feet do not skate. Only runs when the
   * rig has no blend-space API of its own.
   */
  _driveLocoClip(b) {
    let clip, rate = 1;
    const sp = b.speed;
    if (sp < 0.25) {
      clip = this.sheathed ? 'idle_sheathed' : 'idle_drawn_' + this.stance;
    } else if (Math.abs(b.strafe) > Math.abs(b.forward) * 1.15) {
      clip = b.strafe > 0 ? LOCO_STRAFE.r : LOCO_STRAFE.l;
      rate = clamp(sp / LOCO_STRAFE.speed, 0.55, 1.7);
    } else if (b.forward < -0.35) {
      clip = LOCO_BACK.clip;
      rate = clamp(sp / LOCO_BACK.speed, 0.55, 1.7);
    } else {
      let e = LOCO_FWD[1];
      for (let i = 1; i < LOCO_FWD.length; i++) {
        e = LOCO_FWD[i];
        if (sp <= LOCO_FWD[i].speed || i === LOCO_FWD.length - 1) break;
      }
      clip = e.clip;
      rate = clamp(sp / e.speed, 0.55, 1.6);
    }
    if (this._locoClip !== clip) {
      this._locoClip = clip;
      this._play(clip, 0.20, rate, true);
    } else {
      this.rig?.setSpeed?.(clip, rate);
    }
  }

  _play(clip, fade = 0.15, speed = 1, loop = false) {
    if (!this.rig?.play) return;
    try {
      this.rig.play(clip, { fade, speed, loop, blend: this.locoBlend, stance: this.stance });
    } catch { /* an unknown clip must never break the frame */ }
  }

  // ----------------------------------------------------------------- attack

  _tryAttack() {
    const b = this._takeBuffered('attack');
    if (!b) return false;
    if (this.stamina < 4) { this._clearBuffer(); return false; }

    // 忍殺 — a broken-posture enemy in front converts the attack into a finisher.
    // Combat owns the whole sequence once it accepts.
    const combat = this.ctx.combat;
    if (combat?.canExecute) {
      const victim = this.lockTarget?.isAlive ? this.lockTarget : this._findTarget(2.6, 50 * DEG);
      if (victim && combat.canExecute(victim, this) && combat.execute(victim, this)) {
        this._clearBuffer();
        return true;
      }
    }

    let key = DIR_TO_MOVE[b.dir] || 'h_r';
    let heavy = (b.power ?? 0) > 0.7;
    let finisher = false;

    if (this.sheathed) {
      // 抜刀 — the draw itself is the attack, and it is the best one.
      key = 'iai';
      heavy = false;
      this.chain = CHAINS.iai;
      this.chainIndex = 0;
      this.comboCount = 0;
      this._setState('drawing', { key, heavy, finisher, dir: b.dir }, true);
      return true;
    }

    // Chain advance inside the cancel window (or its grace tail); otherwise the
    // gesture direction opens a fresh string.
    if ((this.canCancel || this._chainGrace > 0) && this.chain && this.chainIndex + 1 < this.chain.length) {
      this.chainIndex++;
      const node = this.chain[this.chainIndex];
      key = node.key;
      finisher = node.finisher;
      if (key === 'heavy') heavy = true;   // the string's own heavy ender
    } else {
      this.chain = CHAINS[key] || CHAINS.h_r;
      this.chainIndex = 0;
      this.comboCount = 0;
    }

    this._setState('attack', { key, heavy, finisher, dir: b.dir }, true);
    return true;
  }

  _beginAttack(data) {
    let key = data?.key || 'h_r';
    const heavy = !!data?.heavy;
    // A heavy on a vertical gesture becomes the authored 大上段; on anything else
    // it is the same cut, slowed and committed.
    if (heavy && HEAVY_PROMOTE[key]) key = HEAVY_PROMOTE[key];
    const src = MOVES[key] || MOVES.h_r;
    const s = this.stanceDef;

    // One playback rate scales the clip and our timeline together, so the marker
    // times and the fallback timers can never drift apart.
    const rate = (1 / s.startup) * (heavy && key !== 'heavy' ? HEAVY_RATE : 1);
    const T = CLIP_T[src.clip] || CLIP_T.slash_horizontal_r;
    const hv = heavy && key !== 'heavy' ? 1 : 0;   // same-clip heavy gets the bonus

    const a = this.attack = this.attack || {};
    a.key = key;
    a.heavy = heavy;
    a.finisher = !!data?.finisher;
    a.clip = src.clip;
    a.rate = rate;
    a.damage = src.damage * s.damage * (a.finisher ? 1.3 : 1) * (hv ? 1.5 : 1);
    a.poise = src.poise * s.poise * (a.finisher ? 1.35 : 1) * (hv ? 1.6 : 1);
    a.reach = src.reach * s.reach * (hv ? 1.06 : 1);
    a.lunge = src.lunge * (a.finisher ? 1.25 : 1) * (hv ? 1.3 : 1);
    a.kind = src.kind;
    a.activeAt = T.hit / rate;
    a.activeEnd = T.end / rate;
    a.cancelAt = T.cancel / rate;
    a.total = T.dur / rate;
    a.active = a.activeEnd - a.activeAt;
    a.opened = false;
    a.closed = false;
    a.markerEnd = false;

    if (key === 'iai') this.sheathed = false;   // the draw *is* the first cut
    this.comboCount++;
    this.canCancel = false;
    this.stamina = Math.max(0, this.stamina - (heavy ? 16 : 9));
    this._staminaHold = 0.45;
    this._postureHold = Math.max(this._postureHold, 0.25);

    // Aim assist / auto-face (§6): rotate the *whole attack* toward the nearest
    // valid target inside a cone. On touch this is the difference between the
    // game being playable one-handed and not. Combat owns both the target search
    // and the turn clamp, so we hand it our facing and use what it gives back.
    this._assistTarget = this._findTarget(a.reach + 3.2, 62 * DEG);
    const combat = this.ctx.combat;
    if (this.aimAssist > 0) {
      let want = null;
      if (combat?.aimAssist) {
        _v1.copy(this.forward);
        if (combat.aimAssist(this, _v1, this.aimAssist) && _v1.lengthSq() > 1e-6) {
          want = Math.atan2(-_v1.x, -_v1.z);
        }
      } else if (this._assistTarget?.position) {
        const tp = this._assistTarget.position;
        want = Math.atan2(-(tp.x - this.position.x), -(tp.z - this.position.z));
      }
      if (want !== null) {
        this.desiredYaw = this.yaw + angleDelta(this.yaw, want);
        this.yaw = this.desiredYaw;
        this.root.rotation.y = this.yaw;
        this._applyForward();
      }
    }

    // Combat reads these off `weapon` when it detects the rising edge of
    // `weapon.active` itself, which can happen a frame before beginSwing lands.
    this.weapon.damage = a.damage;
    this.weapon.kind = a.kind;
    this.weapon.heavy = a.heavy;
    this.weapon.multiHit = false;
    this.weapon.arc = a.heavy ? 2.6 : 2.0;
    this._play(a.clip, 0.07, a.rate, false);
    this._clearBuffer();
  }

  _updateAttack(dt, st) {
    const a = this.attack;
    if (!a) { this._setState('idle'); return; }
    const t = this.stateTime;

    // A sliver of movement authority keeps attacks from feeling like a hard stop.
    this._locomotion(dt, st, t > a.activeEnd ? 0.34 : 0.06);

    if (!a.opened && t >= a.activeAt) {
      a.opened = true;
      this._setWeaponActive(true);
      this._startLunge(a);
    }
    if (a.opened && !a.closed && t >= a.activeEnd) {
      a.closed = true;
      this._setWeaponActive(false);
    }
    if (t >= a.cancelAt) this.canCancel = true;

    // Buffered actions resolve the instant the window opens — that is the whole
    // point of the buffer.
    if (this.canCancel) {
      if (this._tryDodge()) return;
      if (this._tryAttack()) return;
    }

    if (t >= a.total || a.markerEnd) {
      // A short grace period after the clip ends keeps the string alive. Without
      // it the combo window closes on the exact frame the animation does, which
      // players read as the game dropping their input.
      this._chainGrace = this.chainIndex + 1 < (this.chain?.length ?? 0) ? 0.22 : 0;
      this._setState(this.guarding ? 'guard' : 'idle');
    }
  }

  /**
   * Open the swing with Combat and close the gap so cuts connect (§5).
   * CombatDirector runs its own lunge off `beginSwing` (TUNING.LUNGE_*), so we
   * only drive our own when it is absent — otherwise the player double-lunges.
   */
  _startLunge(a) {
    const combat = this.ctx.combat;
    if (combat?.beginSwing) {
      combat.beginSwing(this, this._fillSwingOpts(a));
      this._lungeVel.set(0, 0, 0);
      return;
    }
    const tgt = this._assistTarget;
    let dist = a.lunge;
    if (tgt?.position) {
      const dx = tgt.position.x - this.position.x;
      const dz = tgt.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      dist = clamp(Math.max(0, d - a.reach * 0.78), 0, a.lunge * 1.6);
    }
    const speed = dist / Math.max(0.06, a.active + 0.06);
    this._lungeVel.set(this.forward.x * speed, 0, this.forward.z * speed);
  }

  /** The `opts` shape CombatDirector.beginSwing consumes (`_applySwingOpts`). */
  _fillSwingOpts(a) {
    const i = this.attackInfo;
    i.entity = this; i.move = a.key; i.clip = a.clip;
    i.damage = a.damage; i.poise = a.poise; i.kind = a.kind; i.heavy = a.heavy;
    i.multiHit = false;
    i.reach = a.reach; i.finisher = a.finisher; i.stance = this.stance;
    i.combo = this.comboCount;
    i.base = this.bladeBase; i.tip = this.bladeTip;
    return i;
  }

  // ------------------------------------------------------------------ dodge

  _tryDodge() {
    const b = this._takeBuffered('dodge');
    if (!b) return false;
    if (this.stamina < DODGE_COST * 0.5) return false;
    this._setState('dodge', null, true);
    return true;
  }

  _beginDodge() {
    const st = this.ctx.input?.state;
    const mag = st?.moveMag ?? 0;
    if (mag > 0.15 && this.moveDir.lengthSq() > 1e-6) {
      this._dodgeDir.copy(this.moveDir);
    } else if (mag > 0.15 && st) {
      const camYaw = this._cameraYaw();
      const cf = -Math.sin(camYaw), cfz = -Math.cos(camYaw);
      const cr = Math.cos(camYaw), crz = -Math.sin(camYaw);
      this._dodgeDir.set(cf * st.move.y + cr * st.move.x, 0, cfz * st.move.y + crz * st.move.x).normalize();
    } else {
      this._dodgeDir.copy(this.forward).multiplyScalar(-1);   // backstep
    }

    this.stamina = Math.max(0, this.stamina - DODGE_COST);
    this._staminaHold = 0.6;
    // i-frames open on the clip's `iframe-start` marker, not on the input — a
    // dodge has to be a read, not a panic button.
    this.invulnerable = false;
    this._iframe = 0;

    // Rolling breaks lock-on framing; a locked player steps instead.
    let clip = 'dodge_roll';
    if (this.lockTarget) {
      const fdot = this._dodgeDir.x * this.forward.x + this._dodgeDir.z * this.forward.z;
      const side = this._dodgeDir.x * -this.forward.z + this._dodgeDir.z * this.forward.x;
      if (fdot > 0.5) clip = 'dodge_roll';
      else if (fdot < -0.5) clip = 'dodge_back';
      else clip = side > 0 ? 'dodge_step_r' : 'dodge_step_l';
    } else if (mag <= 0.15) {
      clip = 'dodge_back';
    } else {
      this.desiredYaw = Math.atan2(-this._dodgeDir.x, -this._dodgeDir.z);
    }
    this._dodgeT = DODGE_T[clip] || DODGE_T.dodge_roll;
    this._play(clip, 0.05, 1, false);

    const burst = 8.4;
    this.velocity.x = this._dodgeDir.x * burst;
    this.velocity.z = this._dodgeDir.z * burst;
    this._clearBuffer();
    this.ctx.fx?.dustPuff?.(this.position, 0.5, this.groundSurface);
  }

  _updateDodge(dt) {
    const t = this.stateTime;
    const T = this._dodgeT || DODGE_T.dodge_roll;
    if (!this.invulnerable && t >= T.in && t < T.out) {
      this.invulnerable = true;
      this._iframe = T.out - t;
      this.ctx.combat?.grantIFrames?.(this, T.out - t);
    }
    if (t >= T.out && this._iframe <= 0) this.invulnerable = false;

    // Speed curve: fast out of the gate, decaying into the recovery.
    const k = Math.exp(-6.5 * dt);
    this.velocity.x *= k;
    this.velocity.z *= k;

    if (t > T.cancel || this.canCancel) {
      if (this._tryAttack()) return;
      if (this._tryDodge()) return;
    }
    if (t >= T.dur) this._setState(this.guarding ? 'guard' : 'idle');
  }

  // ------------------------------------------------------------- guard/parry

  _canGuard() {
    const s = this.state;
    return this.isAlive && !this.sheathed
      && s !== 'dodge' && s !== 'stagger' && s !== 'dead' && s !== 'execution' && s !== 'drawing';
  }

  _updateParry(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 14, dt);
    this.velocity.z = damp(this.velocity.z, 0, 14, dt);
    if (this.stateTime > 0.36) this._setState(this.guarding ? 'guard' : 'idle');
  }

  _updateStagger(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 8, dt);
    this.velocity.z = damp(this.velocity.z, 0, 8, dt);
    if (this.stateTime > (this._staggerTime || 0.7)) {
      this._setState('idle');
      this.posture = Math.min(this.posture, this.maxPosture * 0.55);
    }
  }

  // --------------------------------------------------------------- iai/sheathe

  _trySheathe() {
    const b = this._takeBuffered('sheathe');
    if (!b) return false;
    if (this.sheathed) {
      // Drawing without attacking: a plain 抜刀 into seigan. The clip carries a
      // hit-active window we deliberately ignore — see _setWeaponActive.
      this.sheathed = false;
      this._play('draw_iai', 0.10, 0.85, false);
      this._locoClip = '';
      return false;
    }
    // 血振り — the full flourish only when nothing is about to kill us for it.
    const threat = this._findTarget(9, Math.PI);
    this.guarding = false;
    this._play(threat ? 'sheathe' : 'taunt_sheathe_flourish', 0.10, 1, false);
    this.sheathed = true;         // the rig's `sheathe-click` marker re-confirms
    this._locoClip = '';
    this._setWeaponActive(false);
    this.chain = null;
    return false;
  }

  // ------------------------------------------------------------------ stance

  setStance(name) {
    if (!STANCES[name] || this.stance === name) return;
    this.stance = name;
    this.stanceDef = STANCES[name];
    this.locoBlend.stance = name;
    this.rig?.setStance?.(name);
    this._locoClip = '';
    if (!this.sheathed && (this.state === 'idle' || this.state === 'move')) {
      this._play('idle_drawn_' + name, 0.22, 1, true);
    }
    this._evStance.entity = this;
    this._evStance.stance = name;
    this.ctx.bus?.emit?.('stance-change', this._evStance);
  }

  // --------------------------------------------------------------- targeting

  /** Nearest valid enemy inside a cone around the facing. */
  _findTarget(maxDist, coneRad) {
    if (this.lockTarget?.isAlive) return this.lockTarget;
    // CombatDirector keeps the authoritative entity list (it sees enemies the
    // manager has not published yet), so prefer its search.
    const viaCombat = this.ctx.combat?.nearestTarget?.(this, maxDist, coneRad * 2);
    if (viaCombat) return viaCombat;
    const list = this.ctx.enemies?.list;
    if (!list || !list.length) return null;
    let best = null, bestScore = Infinity;
    const cosCone = Math.cos(coneRad);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e === this || !e.isAlive || e.faction === this.faction || !e.position) continue;
      const dx = e.position.x - this.position.x;
      const dz = e.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || d < 1e-3) continue;
      const dot = (dx / d) * this.forward.x + (dz / d) * this.forward.z;
      if (dot < cosCone) continue;
      const score = d * 0.55 + (1 - dot) * 4.0;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------- weapon

  _setWeaponActive(on) {
    // `draw_iai` also plays as a plain unsheathe, and it carries a hit-active
    // marker; only an actual attack state may open a hitbox.
    if (on && this.state !== 'attack' && this.state !== 'drawing' && this.state !== 'execution') return;
    if (this.weapon.active === on) return;
    this.weapon.active = on;
    if (on) {
      if (!this._trailOpen) {
        this._trailOpen = true;
        this.ctx.fx?.beginTrail?.(this, { heavy: !!this.attack?.heavy, kind: this.attack?.kind || 'slash' });
      }
    } else if (this._trailOpen) {
      this._trailOpen = false;
      this.ctx.fx?.endTrail?.(this);
      this.ctx.combat?.endSwing?.(this);
    }
  }

  /**
   * Blade base/tip in world space, from the hand bone plus the blade length.
   * Combat sweeps prev→current between frames, Effects ribbons the same segment.
   */
  _exportWeapon() {
    this.prevBladeBase.copy(this.bladeBase);
    this.prevBladeTip.copy(this.bladeTip);

    const mount = this.weaponMount;
    const bone = this.rig?.bones?.[this.weapon.tipBone] || this.rig?.bones?.weapon_tip
      || this.rig?.bones?.hand_r || null;
    const src = (mount && mount.parent) ? mount : bone;

    if (src) {
      src.updateWorldMatrix?.(true, false);
      _v1.copy(this.bladeOriginLocal).applyMatrix4(src.matrixWorld);
      _q1.setFromRotationMatrix(src.matrixWorld);
      _v2.copy(this.bladeAxisLocal).applyQuaternion(_q1).normalize();
      this.bladeBase.copy(_v1);
      this.bladeTip.copy(_v1).addScaledVector(_v2, this.weapon.length);
    } else {
      // No rig: keep the export sane so Combat/FX never read NaN.
      this.bladeBase.copy(this.position);
      this.bladeBase.y += 1.15;
      this.bladeTip.copy(this.bladeBase).addScaledVector(this.forward, this.weapon.length);
    }

    if (this.prevBladeTip.lengthSq() === 0) {
      this.prevBladeBase.copy(this.bladeBase);
      this.prevBladeTip.copy(this.bladeTip);
    }
    if (this.weapon.active && this._trailOpen) {
      this.ctx.fx?.pushTrail?.(this, this.bladeBase, this.bladeTip);
    }
  }

  // --------------------------------------------------------------- footsteps

  _footstepFallback(dt) {
    if (this._rigFootsteps || !this.grounded) return;
    if (this.speed < 0.35) { this._strideAcc = 0; return; }
    // Stride grows with speed: a sprint should not machine-gun footsteps.
    const stride = lerp(0.78, 1.85, clamp(this.speed / SPEED_SPRINT, 0, 1));
    this._strideAcc += this.speed * dt;
    if (this._strideAcc >= stride) {
      this._strideAcc -= stride;
      this._footSide ^= 1;
      this._emitFootstep(1);
    }
  }

  _footstep(side) {
    if (typeof side === 'string') this._footSide = side === 'l' ? 0 : 1;
    else if (typeof side === 'number') this._footSide = side & 1;
    else this._footSide ^= 1;
    this._emitFootstep(1);
  }

  _emitFootstep(scale) {
    const ev = this._evFootstep;
    const boneName = this._footSide ? 'foot_r' : 'foot_l';
    const bone = this.rig?.bones?.[boneName];
    if (bone) bone.getWorldPosition?.(ev.point);
    else ev.point.copy(this.position);
    ev.point.y = this.position.y + 0.02;
    ev.entity = this;
    ev.surface = this.groundInfo?.surface
      || this.ctx.terrain?.surfaceAt?.(ev.point.x, ev.point.z)
      || this.groundSurface || 'dirt';
    ev.speed = this.speed * scale;
    this.ctx.bus?.emit?.('footstep', ev);
  }

  // ------------------------------------------------------------------ damage

  /**
   * CombatDirector resolves the whole pipeline (i-frames → parry → guard → hit)
   * and calls this with `{attacker, target, point, normal, damage, poise, kind,
   * crit, blocked, parried}`. It applies posture, knockback, stagger, death and
   * the `hit`/`damage-taken` events itself, so all we own here is *our health*
   * and our reaction. Duplicating any of the rest double-counts it.
   *
   * When Combat is absent the payload has no blocked/parried fields and we fall
   * back to resolving defence ourselves, so the player still works standalone.
   */
  onDamage(payload) {
    if (!this.isAlive || !payload) return false;
    const fromCombat = payload.blocked !== undefined || payload.parried !== undefined;
    const amount = payload.damage ?? payload.amount ?? 0;
    const poise = payload.poise ?? payload.posture ?? amount * 0.7;

    if (!fromCombat && (this.invulnerable || this._iframe > 0)) {
      this.ctx.fx?.dodgeFlash?.(this.position);
      return false;
    }

    // Direction of the blow, planar, pointing away from the attacker.
    const dir = this._evDamage.direction;
    if (payload.direction && typeof payload.direction.x === 'number') dir.copy(payload.direction);
    else if (payload.attacker?.position) dir.copy(this.position).sub(payload.attacker.position);
    else dir.copy(this.forward).multiplyScalar(-1);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.copy(this.forward).multiplyScalar(-1);
    dir.normalize();

    this._postureHold = 1.1;
    this._staminaHold = 0.5;

    if (fromCombat) {
      // Combat already scaled the number for guard chip / late parry.
      this.health = Math.max(0, this.health - amount);
      if (payload.blocked) {
        this._play('guard_impact', 0.04, 1, false);
      } else if (payload.parried) {
        this._setState('parry', null, true);
      }
      // Health, posture, stagger, death and the events are Combat's from here.
      return true;
    }

    const frontal = -(dir.x * this.forward.x + dir.z * this.forward.z);   // 1 = from the front
    let health = amount;
    let posture = poise;

    if (this._parryTimer > 0 && frontal > 0.1 && !payload.unblockable) {
      this._parryTimer = 0;
      this._setState('parry', null, true);
      this.posture = Math.max(0, this.posture - 6);
      this.health = Math.max(0, this.health - 0.0001);   // "handled" — see above
      return true;
    }

    if (this.guarding && frontal > 0.34 && !payload.unblockable) {
      // Guarding converts most of the damage into posture pressure (Sekiro-style).
      health = amount * 0.12;
      posture = poise * 1.55 * (2 - this.stanceDef.guardMul);
      this._play('guard_impact', 0.04, 1, false);
      this.velocity.x += dir.x * 1.6;
      this.velocity.z += dir.z * 1.6;
      this.ctx.fx?.sparks?.(payload.point ?? this.bladeBase, dir, 0.6);
    } else {
      this._staggerFrom(dir, poise, payload);
    }

    this.health = Math.max(0, this.health - health);
    this.posture = Math.min(this.maxPosture, this.posture + posture);

    this._evDamage.entity = this;
    this._evDamage.amount = health;
    this.ctx.bus?.emit?.('damage-taken', this._evDamage);

    if (this.health <= 0) { this._die(payload); return true; }
    if (this.posture >= this.maxPosture) {
      this.posture = this.maxPosture;
      this._staggerTime = 1.18;                 // matches the posture_break clip
      this._setState('stagger', { clip: 'posture_break' }, true);
    }
    return true;
  }

  // ------------------------------------------------- CombatDirector callbacks

  /**
   * Combat pushes state changes through `entity.setState(name)` when it exists —
   * routing them into the FSM keeps entry/exit consistent instead of silently
   * overwriting the `state` field behind our back.
   */
  setState(name) {
    if (!name || name === this.state) return;
    this._external = true;
    try {
      switch (name) {
        case 'stagger':
          this._setState('stagger', null, true);
          break;
        case 'dead':
          if (this.isAlive) this._die(null);
          else this._setState('dead', null, true);
          break;
        case 'parry':
          this._setState('parry', null, true);
          break;
        case 'idle':
          if (this.isAlive) this._setState(this.guarding ? 'guard' : 'idle', null, true);
          break;
        case 'attack':
          break;                                 // Combat's execution lock; onExecuteStart owns it
        default:
          this._setState(name, null, true);
          break;
      }
    } finally {
      this._external = false;
    }
  }

  /** Combat's `_playClip`; `duration` is how long it expects the clip to own us. */
  playClip(clip, duration) {
    this._play(clip, 0.08, 1, false);
    if (typeof duration === 'number' && duration > 0 && this.state === 'stagger') {
      this._staggerTime = duration;
    }
  }

  onStagger(clip, dur) {
    if (typeof dur === 'number' && dur > 0) this._staggerTime = dur;
  }

  onPosture(value) {
    // Combat owns the number; we only use it to hold our own regen off.
    if (value > 0) this._postureHold = Math.max(this._postureHold, 0.6);
  }

  onParry() {
    this._setState('parry', null, true);
    this.posture = Math.max(0, this.posture - 4);
  }

  /** Our blade was deflected: recoil, drop the string, no cancel window. */
  onDeflected() {
    this._setWeaponActive(false);
    this.chain = null;
    this._chainGrace = 0;
    this.canCancel = false;
    this._staggerTime = 0.44;
    this._setState('stagger', { clip: 'clash_recoil' }, true);
  }

  onDeath(payload) {
    if (this.state !== 'dead') {
      this.isAlive = false;
      this._die(payload);
    }
  }

  onExecuteStart(target) {
    this._execTarget = target || null;
    this._external = true;                       // Combat already played the clip
    this._setState('execution', null, true);
    this._external = false;
  }

  onKill() { this.posture = Math.max(0, this.posture - 18); }

  /** Alias — some systems reach for the verb rather than the handler. */
  takeDamage(payload) { return this.onDamage(payload); }

  _staggerFrom(dir, poise, payload) {
    const heavy = poise > 22 || payload?.heavy;
    if (!heavy && (this.state === 'attack' || this.state === 'drawing') && this.posture < this.maxPosture * 0.8) {
      // Light hits do not interrupt a committed swing; that is what poise is for.
      this.ctx.fx?.bloodMist?.(payload?.point ?? this.position, dir, 0.5);
      return;
    }
    const f = -(dir.x * this.forward.x + dir.z * this.forward.z);
    const s = dir.x * -this.forward.z + dir.z * this.forward.x;
    // Only three stagger clips are authored; sides read best when the blow is
    // genuinely lateral, everything else knocks us backwards.
    const clip = Math.abs(f) < 0.5 ? (s > 0 ? 'stagger_r' : 'stagger_l') : 'stagger_back';
    this._staggerTime = heavy ? 0.86 : 0.52;
    const push = heavy ? 3.4 : 1.8;
    this.velocity.x = dir.x * push;
    this.velocity.z = dir.z * push;
    this._setState('stagger', { clip }, true);
  }

  _die(payload) {
    this.isAlive = false;
    this.health = 0;
    this.invulnerable = true;
    this.guarding = false;
    this._setWeaponActive(false);

    // Pick the fall from where the blow came; a low-posture death kneels.
    const dir = this._evDamage.direction;
    const f = -(dir.x * this.forward.x + dir.z * this.forward.z);
    let clip = 'death_back';
    if (this.posture > this.maxPosture * 0.85) clip = 'death_kneel';
    else if (f < -0.3) clip = 'death_forward';
    this._deathDir = dir;
    this._deathPoint = payload?.point ?? null;

    this._setState('dead', { clip }, true);
    this.velocity.set(0, this.velocity.y, 0);
    // The rig hands off on its `ragdoll-handoff` marker; this is the fallback for
    // a marker-less rig so the body never freezes mid-fall.
    this._ragdollAt = 1.4;
  }

  /** Ragdoll is a tier knob; on LOW the death clip carries the whole beat. */
  _handoffRagdoll() {
    if (this.ragdoll || this.isAlive || !this.allowRagdoll) return;
    this._ragdollAt = -1;
    const rag = this.ctx.physics?.createRagdoll?.(this.rig, {
      impulse: this._deathDir, point: this._deathPoint,
    });
    if (rag) this.ragdoll = rag;
  }

  _deadUpdate(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 6, dt);
    this.velocity.z = damp(this.velocity.z, 0, 6, dt);
    this.stateTime += dt;
    if (this._ragdollAt > 0 && this.stateTime >= this._ragdollAt) this._handoffRagdoll();
    this.ragdoll?.update?.(dt);
  }

  // ----------------------------------------------------------------- respawn

  respawn(position) {
    if (position && typeof position.x === 'number') this.spawnPosition.copy(position);
    this.ragdoll?.dispose?.();
    this.ragdoll = null;
    this.health = this.maxHealth;
    this.posture = 0;
    this.stamina = this.maxStamina;
    this.isAlive = true;
    this.invulnerable = false;
    this._iframe = 0;
    this.velocity.set(0, 0, 0);
    this._lungeVel.set(0, 0, 0);
    this.speed = 0;
    this.sheathed = true;
    this.guarding = false;
    this.chain = null;
    this.chainIndex = 0;
    this.comboCount = 0;
    this.attack = null;
    this._clearBuffer();
    this.root.position.copy(this.spawnPosition);
    const h = this.ctx.terrain?.heightAt?.(this.spawnPosition.x, this.spawnPosition.z);
    if (typeof h === 'number') this.root.position.y = h;
    this.yaw = this.desiredYaw = this.spawnYaw;
    this.root.rotation.set(0, this.yaw, 0);
    this._applyForward();
    if (this.controller?.position?.copy) this.controller.position.copy(this.root.position);
    else if (this.controller?.setPosition) this.controller.setPosition(this.root.position);
    this.setOpacity(1);
    this.state = 'idle';
    this._setState('sheathed');
    this.rig?.reset?.();
    this.ctx.playerCamera?.snap?.();
  }

  // ------------------------------------------------------------------ misc

  /** Called by PlayerCamera when the boom pulls in close enough to clip us. */
  setOpacity(a) {
    a = clamp(a, 0, 1);
    if (Math.abs(a - this._opacity) < 0.01 && a !== 1) return;
    this._opacity = a;
    if (!this._fadeMats) {
      this._fadeMats = [];
      this.body?.traverse?.((o) => {
        const m = o.material;
        if (!m) return;
        if (Array.isArray(m)) { for (const mm of m) this._fadeMats.push(mm); }
        else this._fadeMats.push(m);
      });
    }
    for (let i = 0; i < this._fadeMats.length; i++) {
      const m = this._fadeMats[i];
      m.transparent = a < 0.999;
      m.opacity = a;
      m.depthWrite = a > 0.985;
    }
  }

  /** Set by Menus: 0 disables aim assist, 1 is the touch default. */
  setAimAssist(v) { this.aimAssist = clamp(v, 0, 1); }

  applyQuality(q) {
    // Ragdolls are a tier knob; without them death just plays the clip.
    this.allowRagdoll = !!q?.ragdoll;
  }

  dispose() {
    this._setWeaponActive(false);
    this.ragdoll?.dispose?.();
    this.rig?.dispose?.();
    this.root.parent?.remove(this.root);
  }
}
