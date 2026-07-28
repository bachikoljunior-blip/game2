/**
 * PlayerCamera.js — the cinematic third-person camera.
 *
 * A naive orbit camera reads as amateur in the first two seconds, so almost none
 * of this file is "point the camera at the player":
 *
 *   · a spring arm off a shoulder pivot, with the *look* target on a slower spring
 *     than the position so the camera trails the character instead of welding to it;
 *   · sphere-cast collision that pulls in instantly and pushes back out slowly,
 *     because a camera that snaps out when it clears a corner is a camera the
 *     player notices;
 *   · lock-on that composes a genuine two-shot — both bodies framed, the target
 *     parked on a third, distance and height opening with the separation;
 *   · framing that reacts to speed, to heavy hits and to hit-stop.
 *
 * Shake is applied dead last, after every spring, or the smoothing eats it.
 * All smoothing is frame-rate independent: `damp()` for scalars, a critically
 * damped SmoothDamp for vectors. No per-frame allocation.
 */

import { Vector3, Quaternion, Euler } from 'three';
import { clamp, damp, lerp, smoothstep, noise } from '../core/Noise.js';

const DEG = Math.PI / 180;

const PITCH_MIN = -42 * DEG;      // camera below the pivot, looking up
const PITCH_MAX = 68 * DEG;       // camera high, looking down
const BOOM_BASE = 3.4;
const BOOM_MIN = 0.55;
const PIVOT_HEIGHT = 1.42;        // chest, not eyes — eye height makes the camera bob
const SHOULDER = 0.44;
const CAM_RADIUS = 0.22;          // sphere-cast probe

/**
 * Aperture is an f-number: **lower is shallower**. These are the only three
 * values the camera ever hands to `pipeline.setFocus`.
 *
 * A third-person action camera is not a portrait lens. At f/1.15 on a 50 mm lens
 * the circle of confusion runs ~15 px on the near ground and ~3 px across the mid
 * and far field — only a ~0.4 m slab is sharp, which is narrower than the player
 * character is tall. The character's head and feet cannot both resolve, and any
 * enemy half a metre off the focal plane turns to mush. Gameplay therefore sits at
 * f/5.6, which keeps the fighter and everyone they are fighting inside the sharp
 * range while still separating the valley behind them.
 *
 * Shallow depth of field is a deliberate beat, not a default: the lock-on rack
 * eases to f/4 and an execution close-up to f/2.8. PostFX clamps at f/2.4 as a
 * backstop; nothing here should ever reach it.
 */
const APERTURE_GAMEPLAY = 5.6;
const APERTURE_LOCK = 4.0;        // rack focus onto a locked duel
const APERTURE_CINEMATIC = 2.8;   // execution / scripted close-up
const APERTURE_NO_DOF = 8.0;      // DOF off — keep the value honest anyway

const LOCK_ACQUIRE_DIST = 19;
const LOCK_BREAK_DIST = 24;
const LOCK_CONE = Math.cos(62 * DEG);
const LOCK_OCCLUDE_TIME = 1.1;

// ------------------------------------------------------------- module scratch

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _v4 = new Vector3();
const _dir = new Vector3();
const _right = new Vector3();
const _qTmp = new Quaternion();

/** True only for a fully finite vector — `typeof NaN === 'number'` is not enough. */
function isFiniteVec(v) {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * Critically damped SmoothDamp on a Vector3, in place. Unlike a lerp factor this
 * is stable across frame rates and never overshoots.
 */
function smoothDampV3(cur, target, vel, smoothTime, dt) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cx = cur.x - target.x, cy = cur.y - target.y, cz = cur.z - target.z;
  const tx = (vel.x + omega * cx) * dt;
  const ty = (vel.y + omega * cy) * dt;
  const tz = (vel.z + omega * cz) * dt;
  vel.set((vel.x - omega * tx) * exp, (vel.y - omega * ty) * exp, (vel.z - omega * tz) * exp);
  cur.set(target.x + (cx + tx) * exp, target.y + (cy + ty) * exp, target.z + (cz + tz) * exp);
}

// -------------------------------------------------------------- PlayerCamera

export class PlayerCamera {
  constructor(ctx) {
    this.ctx = ctx;
    this.camera = ctx.camera;

    /** Cinematic.js flips this to park the camera for the screenshot rig. */
    this.enabled = true;

    this.yaw = 0;
    this.pitch = 14 * DEG;
    this.target = new Vector3();          // smoothed look point
    this.lockTarget = null;

    // ---- settings (Menus writes these) -------------------------------------
    this.sensitivity = 1.0;
    this.invertY = false;
    this.shakeScale = 1.0;
    this.shoulderSide = 1;                // +1 right shoulder, -1 mirrored
    /** Gameplay f-number. Shallower values are opt-in, per beat — see the block above. */
    this.aperture = APERTURE_GAMEPLAY;
    this._apertureNow = APERTURE_GAMEPLAY;

    // ---- spring state -------------------------------------------------------
    this._pivot = new Vector3();
    this._pivotSmooth = new Vector3();
    this._pivotVel = new Vector3();
    this._lookTarget = new Vector3();
    this._lookVel = new Vector3();
    this._camPos = new Vector3();
    this._camVel = new Vector3();
    this._desired = new Vector3();
    this._lastGoodPos = new Vector3();
    this._lastGoodQuat = new Quaternion();
    this._lastGoodPivot = new Vector3();
    this._hasGoodPose = false;
    this._warnedNaN = false;

    this._boom = BOOM_BASE;               // wanted boom length
    this._boomActual = BOOM_BASE;         // after collision
    this._boomWanted = BOOM_BASE;
    this._shoulder = SHOULDER;
    this._fov = 58;
    this._baseFov = 58;
    this._lockBlend = 0;
    this._lockOcclusion = 0;
    this._punch = 0;
    this._punchDecay = 3.2;
    this._cine = false;
    this._cineSubject = null;
    this._cineLockWas = null;
    this._hitstop = 0;
    this._snapBoost = 0;
    this._speedNorm = 0;
    this._fade = 1;
    this._collideMask = undefined;        // Physics decides; undefined = everything

    // ---- shake --------------------------------------------------------------
    this.trauma = 0;
    this._traumaDecay = 1.6;
    this._shakeFreq = 24;
    this._shakeTime = 0;
    this._shakePos = new Vector3();
    this._shakeQuat = new Quaternion();
    this._shakeEuler = new Euler();

    // Pooled payload — 'lock-on' is not in the §2 table, so nothing is required
    // to listen, but the HUD wants the reticle and pooling keeps emit alloc-free.
    this._evLock = { entity: null, target: null };
    this._offs = [];
    this._initialised = false;
  }

  async init() {
    const bus = this.ctx.bus;
    if (bus) {
      this._offs.push(bus.on('camera-shake', (p) => {
        this.addShake(p?.amount ?? 0.3, p?.duration ?? 0.3, p?.freq ?? 24);
      }));
      this._offs.push(bus.on('hitstop', (p) => {
        this._hitstop = Math.max(this._hitstop, p?.duration ?? 0.08);
      }));
      this._offs.push(bus.on('hit', (p) => {
        // Only *our* heavy connects earn the punch-in; every hit doing it is noise.
        if (p?.attacker !== this.ctx.player) return;
        const heavy = (p.damage ?? 0) > 24 || p.crit;
        this._punch = Math.max(this._punch, heavy ? 1 : 0.35);
      }));
      this._offs.push(bus.on('death', (p) => {
        if (p?.entity === this.lockTarget) this._releaseLock();
      }));
    }
    this.resize(window.innerWidth, window.innerHeight);
    this.snap();
    return this;
  }

  // ------------------------------------------------------------------ public

  setSensitivity(v) { this.sensitivity = clamp(v, 0.15, 4); }
  setInvertY(v) { this.invertY = !!v; }
  setShakeScale(v) { this.shakeScale = clamp(v, 0, 2); }
  mirrorShoulder(right = true) { this.shoulderSide = right ? 1 : -1; }

  /**
   * CombatDirector calls this to take the camera for an execution: frame the pair
   * tight, drop the shoulder offset and hold until it releases. It is not the
   * same thing as `enabled = false` — we keep smoothing, we just re-compose.
   */
  cinematic(on, subject) {
    this._cine = !!on;
    this._cineSubject = on ? (subject || null) : null;
    if (on && subject) {
      this._cineLockWas = this.lockTarget;
      this.lockTarget = subject;
      this._lockOcclusion = 0;
    } else if (!on) {
      const prev = this._cineLockWas;
      this._cineLockWas = null;
      if (prev && prev.isAlive) this.lockTarget = prev;
      else if (this.lockTarget && !this.lockTarget.isAlive) this._releaseLock();
    }
  }

  /** A timed punch-in (Combat uses it on executions). `amount` is 0..1. */
  push(amount, duration = 0.3) {
    this._punch = Math.max(this._punch, clamp(amount ?? 0.5, 0, 1.5));
    this._punchDecay = 1 / Math.max(0.05, duration);
  }

  /** Fallback shake when Effects does not own it. Trauma is squared on use. */
  addShake(trauma, duration = 0.35, freq = 24) {
    if (this.ctx.fx?.addShake) { this.ctx.fx.addShake(trauma, duration, freq); return; }
    this.trauma = clamp(this.trauma + trauma, 0, 1);
    this._traumaDecay = 1 / Math.max(0.08, duration);
    this._shakeFreq = freq;
  }

  /** Drop the camera straight behind the player with no smoothing (spawn/respawn). */
  snap() {
    const p = this.ctx.player;
    if (p && typeof p.yaw === 'number') this.yaw = p.yaw;
    this._computePivot(this._pivot);
    this._pivotSmooth.copy(this._pivot);
    this._pivotVel.set(0, 0, 0);
    this._lookVel.set(0, 0, 0);
    this._camVel.set(0, 0, 0);
    this._boomActual = this._boom = this._boomWanted = BOOM_BASE;
    this._orbit(this._camPos, this._pivotSmooth, this._boomActual);
    this._lookTarget.copy(this._pivotSmooth);
    this.target.copy(this._lookTarget);
    if (this.camera) {
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._lookTarget);
    }
    this._initialised = true;
  }

  resize(w, h) {
    // Mirror Engine.resize so the sprint push is relative to the *device* FOV,
    // not a hard-coded desktop one; tall phone viewports already run wider.
    const aspect = Math.max(0.2, (w || 1) / Math.max(1, h || 1));
    this._baseFov = aspect < 1.5 ? Math.min(78, 58 + (1.5 - aspect) * 26) : 58;
  }

  // ------------------------------------------------------------------- frame

  update(dt, elapsed, rawDt) {
    if (!this.enabled) return;
    const player = this.ctx.player;
    if (!player || !this.camera) return;
    if (!this._initialised) this.snap();

    // A non-finite dt would poison every spring in one frame and they would never
    // recover, so it is clamped to a sane step before anything reads it.
    const rraw = rawDt ?? dt ?? 0.016;
    const rdt = Number.isFinite(rraw) ? Math.min(Math.max(rraw, 0), 0.05) : 0.016;
    const sraw = dt ?? 0;
    const sdt = Number.isFinite(sraw) ? Math.min(Math.max(sraw, 0), 0.05) : 0;

    this._readLook(rdt);
    this._updateLock(rdt);
    this._computePivot(this._pivot);

    // Hit-stop freezes the rig *and* the camera; the snap afterwards is what sells
    // the impact, so we bank a short boost to the springs on the way out.
    if (this._hitstop > 0) {
      this._hitstop -= rdt;
      if (this._hitstop <= 0) this._snapBoost = 0.16;
      this._applyPose(rdt);
      return;
    }
    if (this._snapBoost > 0) this._snapBoost -= rdt;
    const boost = this._snapBoost > 0 ? 2.1 : 1;

    // Pivot spring (fast) and look-target spring (slow — the lag is the feel).
    smoothDampV3(this._pivotSmooth, this._pivot, this._pivotVel, 0.085 / boost, sdt);
    this._composeLookTarget(_v4);
    smoothDampV3(this._lookTarget, _v4, this._lookVel, 0.19 / boost, sdt);
    this.target.copy(this._lookTarget);

    this._updateFraming(player, sdt);
    this._orbit(this._desired, this._pivotSmooth, this._boom);
    this._collide(sdt);
    this._orbit(this._desired, this._pivotSmooth, this._boomActual);
    smoothDampV3(this._camPos, this._desired, this._camVel, 0.075 / boost, sdt);

    this._applyPose(rdt);
    this._updateFade(sdt);
    this._updateFocus(rdt);
  }

  // -------------------------------------------------------------------- look

  _readLook(dt) {
    const st = this.ctx.input?.state;
    if (!st) return;
    // Look deltas come from raw pointer/gamepad maths upstream; one non-finite
    // sample would land in `yaw` permanently and take the whole transform with it.
    if (!Number.isFinite(st.look.x) || !Number.isFinite(st.look.y)) { st.look.set(0, 0); return; }
    const lx = st.look.x * this.sensitivity;
    const ly = st.look.y * this.sensitivity * (this.invertY ? -1 : 1);
    if (lx !== 0 || ly !== 0) {
      this.yaw += lx;
      // pitch is the camera's *elevation*: dragging up lowers the camera.
      this.pitch = clamp(this.pitch - ly, PITCH_MIN, PITCH_MAX);
      // A deliberate hard drag breaks the lock — never trap the player in it.
      if (this.lockTarget && Math.abs(lx) + Math.abs(ly) > 0.9) this._releaseLock();
    }
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  /** Chest pivot plus a lateral shoulder offset, in world space. */
  _computePivot(out) {
    const p = this.ctx.player;
    out.set(0, PIVOT_HEIGHT, 0);
    // The subject is another system's output: validate it at the boundary rather
    // than smoothing a bad value into state we can never clean up.
    if (isFiniteVec(p?.position)) out.add(p.position);
    else out.add(this._lastGoodPivot);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    out.addScaledVector(_right, this._shoulder * this.shoulderSide);
  }

  /** Camera position for a given pivot and boom, from yaw/pitch. */
  _orbit(out, pivot, boom) {
    const cp = Math.cos(this.pitch);
    out.set(
      pivot.x + Math.sin(this.yaw) * cp * boom,
      pivot.y + Math.sin(this.pitch) * boom,
      pivot.z + Math.cos(this.yaw) * cp * boom,
    );
  }

  // ------------------------------------------------------------------ framing

  /**
   * When locked the look point is the *pair*, not the player: the composition
   * slides toward the midpoint and the target is pushed off-centre onto a third.
   */
  _composeLookTarget(out) {
    out.copy(this._pivotSmooth);
    const t = this.lockTarget;
    const p = this.ctx.player?.position;
    if (!t?.position || !p || this._lockBlend <= 0.001) return;

    const sep = Math.hypot(t.position.x - p.x, t.position.z - p.z);
    if (sep < 0.01) return;

    // Bias toward the player so the character never drifts out of frame.
    _v2.copy(t.position);
    _v2.y += (t.height ?? 1.7) * 0.55;
    _v3.copy(this._pivotSmooth).lerp(_v2, 0.38);

    // Rule of thirds: shift the composition laterally so the target sits off the
    // centre line rather than nailed to it.
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _v3.addScaledVector(_right, clamp(sep * 0.055, 0, 0.55) * this.shoulderSide);

    out.lerp(_v3, this._lockBlend);
  }

  _updateFraming(player, dt) {
    // `clamp()` is a comparison chain, so NaN falls through it unchanged — the
    // read has to be validated, not clamped.
    const sp = Number.isFinite(player.speed) ? player.speed : 0;
    this._speedNorm = damp(this._speedNorm, clamp(sp / 7.2, 0, 1), 4.5, dt);
    const sprinting = player.state === 'sprint';

    // Boom: base, plus a pull-back with speed, plus lock-on separation, minus a
    // punch-in on a heavy connect.
    let boom = BOOM_BASE + this._speedNorm * 0.55;
    let pitchGoal = null;

    if (this.lockTarget?.position && this._lockBlend > 0.001 && player.position) {
      const dx = this.lockTarget.position.x - player.position.x;
      const dz = this.lockTarget.position.z - player.position.z;
      const sep = Math.hypot(dx, dz);
      // Yaw follows the pair's axis; the player can still fight it with a drag.
      // View direction is (-sin yaw, -cos yaw), hence the negated arguments.
      const wantYaw = Math.atan2(-dx, -dz);
      const d = ((wantYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += d * (1 - Math.exp(-7 * dt)) * this._lockBlend;
      // Distance and height open up with separation so both bodies stay framed.
      boom = lerp(boom, BOOM_BASE + clamp(sep * 0.22, 0, 1.9), this._lockBlend);
      pitchGoal = lerp(this.pitch, (10 + clamp(sep, 0, 12) * 0.9) * DEG, this._lockBlend);
    }

    if (this._punch > 0) {
      this._punch = Math.max(0, this._punch - dt * (this._punchDecay || 3.2));
      boom -= this._punch * 0.42;
    }
    // The execution two-shot sits closer and lower than the fighting camera.
    if (this._cine) boom = Math.min(boom, 2.55);
    this._boomWanted = Math.max(BOOM_MIN, boom);
    this._boom = damp(this._boom, this._boomWanted, 4.0, dt);

    if (pitchGoal !== null) {
      this.pitch = clamp(damp(this.pitch, pitchGoal, 3.0, dt), PITCH_MIN, PITCH_MAX);
    }

    // FOV: sprint pushes +6°, a heavy connect pulls in.
    const fovGoal = this._baseFov
      + (sprinting ? 6 : this._speedNorm * 2.2)
      - this._punch * 3.0;
    this._fov = damp(this._fov, fovGoal, 5.0, dt);
  }

  // ---------------------------------------------------------------- collision

  _collide(dt) {
    const phys = this.ctx.physics;
    let hitDist = this._boom;

    if (phys?.sphereCast) {
      _dir.copy(this._desired).sub(this._pivotSmooth);
      const len = _dir.length();
      if (len > 1e-4) {
        _dir.multiplyScalar(1 / len);
        const hit = phys.sphereCast(this._pivotSmooth, _dir, CAM_RADIUS, len + CAM_RADIUS, this._collideMask);
        const d = typeof hit === 'number' ? hit : (hit?.distance ?? hit?.t ?? -1);
        if (hit && d >= 0 && d < len) hitDist = Math.max(BOOM_MIN, d - CAM_RADIUS * 0.5);
      }
    } else if (this.ctx.terrain?.heightAt) {
      // Without Physics, at least never bury the camera in the hillside.
      this._orbit(_v1, this._pivotSmooth, this._boom);
      const h = this.ctx.terrain.heightAt(_v1.x, _v1.z);
      if (typeof h === 'number' && _v1.y < h + 0.35) {
        const drop = (h + 0.35) - _v1.y;
        const cp = Math.max(0.15, Math.cos(this.pitch));
        hitDist = Math.max(BOOM_MIN, this._boom - (drop / cp) * 0.8);
      }
    }

    // Fast in, slow out. Popping out of a corner is far more noticeable than
    // sliding out of one.
    if (hitDist < this._boomActual) this._boomActual = hitDist;
    else this._boomActual = damp(this._boomActual, hitDist, 1.8, dt);
    this._boomActual = clamp(this._boomActual, BOOM_MIN, this._boom);
  }

  /** Fade the character out when the boom is pulled in past the body. */
  _updateFade(dt) {
    const want = smoothstep(0.75, 1.55, this._boomActual);
    this._fade = damp(this._fade, want, 9, dt);
    this.ctx.player?.setOpacity?.(this._fade);
  }

  // ------------------------------------------------------------------ lock-on

  _updateLock(dt) {
    const input = this.ctx.input;
    if (input?.consume?.('lockOn')) this._cycleLock();

    const t = this.lockTarget;
    if (t) {
      const player = this.ctx.player;
      const dead = !t.isAlive || !player?.isAlive;
      const far = (player?.position && t.position)
        ? player.position.distanceTo(t.position) > LOCK_BREAK_DIST
        : false;
      if (dead || far) {
        this._releaseLock();
      } else {
        // Occlusion has to persist — a lamppost crossing the sightline must not
        // drop the lock.
        if (this._occluded(player, t)) this._lockOcclusion += dt;
        else this._lockOcclusion = Math.max(0, this._lockOcclusion - dt * 2);
        if (this._lockOcclusion > LOCK_OCCLUDE_TIME) this._releaseLock();
      }
    }
    // Blend in/out rather than cutting; a hard cut on lock reads as a bug.
    this._lockBlend = damp(this._lockBlend, this.lockTarget ? 1 : 0, 6.5, dt);
    if (!this.lockTarget && this._lockBlend < 0.002) this._lockBlend = 0;
  }

  _occluded(player, target) {
    const phys = this.ctx.physics;
    if (!phys?.raycast || !player?.position || !target?.position) return false;
    _v1.copy(player.position); _v1.y += 1.3;
    _v2.copy(target.position); _v2.y += 1.2;
    _dir.copy(_v2).sub(_v1);
    const len = _dir.length();
    if (len < 0.4) return false;
    _dir.multiplyScalar(1 / len);
    const hit = phys.raycast(_v1, _dir, len - 0.35, this._collideMask);
    const d = typeof hit === 'number' ? hit : (hit?.distance ?? -1);
    return !!hit && d > 0 && d < len - 0.35;
  }

  /**
   * Cycle: score every candidate by screen-centre alignment and distance, then
   * take the next-worst score after the current lock, wrapping to the best.
   * No sorting, so no allocation.
   */
  _cycleLock() {
    const list = this.ctx.enemies?.list;
    const player = this.ctx.player;
    if (!list || !list.length || !player?.position) { this._releaseLock(); return; }

    const curScore = this.lockTarget ? this._score(this.lockTarget, player) : -Infinity;
    let best = null, bestScore = Infinity;
    let next = null, nextScore = Infinity;

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.isAlive || !e.position || e === player || e.faction === 'player') continue;
      const s = this._score(e, player);
      if (s === Infinity) continue;
      if (s < bestScore) { bestScore = s; best = e; }
      if (e !== this.lockTarget && s > curScore && s < nextScore) { nextScore = s; next = e; }
    }

    const pick = next || best;
    if (!pick || pick === this.lockTarget) { this._releaseLock(); return; }   // toggles off
    this.lockTarget = pick;
    this._lockOcclusion = 0;
    this._evLock.entity = player;
    this._evLock.target = pick;
    this.ctx.bus?.emit?.('lock-on', this._evLock);
  }

  _score(e, player) {
    const dx = e.position.x - player.position.x;
    const dz = e.position.z - player.position.z;
    const d = Math.hypot(dx, dz);
    if (d > LOCK_ACQUIRE_DIST || d < 1e-3) return Infinity;
    // Screen-centre weighting: alignment with the current view direction.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot < LOCK_CONE) return Infinity;
    return (1 - dot) * 6.0 + d * 0.28;
  }

  _releaseLock() {
    if (!this.lockTarget) return;
    this.lockTarget = null;
    this._lockOcclusion = 0;
    this._evLock.entity = this.ctx.player ?? null;
    this._evLock.target = null;
    this.ctx.bus?.emit?.('lock-on', this._evLock);
  }

  // -------------------------------------------------------------------- pose

  /** Write the transform, then add shake — after every spring, never before. */
  _applyPose(dt) {
    const cam = this.camera;
    if (!isFiniteVec(this._camPos) || !isFiniteVec(this._lookTarget)
      || this._camPos.distanceToSquared(this._lookTarget) < 1e-8) {
      this._recoverPose();
      return;
    }
    cam.position.copy(this._camPos);
    cam.lookAt(this._lookTarget);

    if (Number.isFinite(this._fov) && Math.abs(cam.fov - this._fov) > 0.02) {
      cam.fov = clamp(this._fov, 20, 100);
      cam.updateProjectionMatrix();
    }

    const fx = this.ctx.fx;
    let shaken = false;
    if (fx?.getShakeOffset) {
      this._shakePos.set(0, 0, 0);
      this._shakeQuat.identity();
      shaken = fx.getShakeOffset(this._shakePos, this._shakeQuat) !== false;
      // Effects derives shake from impact points, which are derived from bone
      // transforms — another system's arithmetic, so it is checked like any input.
      if (!isFiniteVec(this._shakePos) || !Number.isFinite(this._shakeQuat.w)) {
        this._shakePos.set(0, 0, 0);
        this._shakeQuat.identity();
      }
    }
    if (!shaken) this._localShake(dt);

    if (this.shakeScale > 0 && (this._shakePos.lengthSq() > 1e-9 || this._shakeQuat.w < 0.999999)) {
      const s = this.shakeScale;
      // Offset is authored in view space so a lateral shake stays lateral.
      _v1.copy(this._shakePos).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(_v1, s);
      _qTmp.copy(cam.quaternion).multiply(this._shakeQuat);
      if (s >= 0.999) cam.quaternion.copy(_qTmp);
      else cam.quaternion.slerp(_qTmp, s);
    }

    // Last line of defence. Nothing non-finite leaves this system: Audio, the
    // light rig and the post chain all read `camera.position`, and a single bad
    // frame throws inside Engine._frame() *before* the render call, so the
    // canvas silently stops updating while `engine.frame` keeps counting.
    if (!isFiniteVec(cam.position) || !Number.isFinite(cam.quaternion.w)) {
      this._recoverPose();
      return;
    }
    this._lastGoodPos.copy(cam.position);
    this._lastGoodQuat.copy(cam.quaternion);
    this._lastGoodPivot.copy(this._pivotSmooth);
    this._hasGoodPose = true;
    cam.updateMatrixWorld();
  }

  /**
   * Hold the previous frame's transform and scrub the springs. Restoring the
   * output alone is not enough: the smoothing state is what makes a single NaN
   * permanent, so `_camVel`/`_pivotVel`/`_lookVel` are reset too and the whole
   * arm is re-seated from the last good pivot.
   */
  _recoverPose() {
    const cam = this.camera;
    if (this._hasGoodPose) {
      cam.position.copy(this._lastGoodPos);
      cam.quaternion.copy(this._lastGoodQuat);
      this._camPos.copy(this._lastGoodPos);
      this._pivotSmooth.copy(this._lastGoodPivot);
      this._lookTarget.copy(this._lastGoodPivot);
    }
    this._camVel.set(0, 0, 0);
    this._pivotVel.set(0, 0, 0);
    this._lookVel.set(0, 0, 0);
    if (!Number.isFinite(this.yaw)) this.yaw = 0;
    if (!Number.isFinite(this.pitch)) this.pitch = 14 * DEG;
    if (!Number.isFinite(this._boom)) this._boom = BOOM_BASE;
    if (!Number.isFinite(this._boomActual)) this._boomActual = BOOM_BASE;
    if (!Number.isFinite(this._fov)) this._fov = this._baseFov;
    if (!Number.isFinite(this.trauma)) this.trauma = 0;
    if (!Number.isFinite(this._apertureNow)) this._apertureNow = this.aperture;
    // Smoothed scalars poison the next frame's target if left non-finite, which
    // is what turns one bad frame into a permanently frozen camera.
    if (!Number.isFinite(this._speedNorm)) this._speedNorm = 0;
    if (!Number.isFinite(this._lockBlend)) this._lockBlend = 0;
    if (!Number.isFinite(this._punch)) this._punch = 0;
    if (!Number.isFinite(this._fade)) this._fade = 1;
    this._shakePos.set(0, 0, 0);
    this._shakeQuat.identity();
    if (!this._warnedNaN) {
      this._warnedNaN = true;
      console.warn('[camera] non-finite transform recovered; holding the last good pose');
    }
    cam.updateMatrixWorld();
  }

  _localShake(dt) {
    if (this.trauma <= 0) {
      this._shakePos.set(0, 0, 0);
      this._shakeQuat.identity();
      return;
    }
    this.trauma = Math.max(0, this.trauma - this._traumaDecay * dt);
    this._shakeTime += dt * (this._shakeFreq || 24);
    const a = this.trauma * this.trauma;      // squared: small traumas stay subtle
    const t = this._shakeTime;
    const nx = noise.noise2(t, 0.0);
    const ny = noise.noise2(0.0, t + 31.7);
    const nz = noise.noise2(t * 0.7 + 11.3, t * 0.3);
    this._shakePos.set(nx * 0.16 * a, ny * 0.13 * a, nz * 0.05 * a);
    this._shakeEuler.set(ny * 0.045 * a, nx * 0.045 * a, nz * 0.06 * a);
    this._shakeQuat.setFromEuler(this._shakeEuler);
  }

  // ------------------------------------------------------------------- focus

  _updateFocus(dt) {
    const pipe = this.ctx.pipeline;
    if (!pipe?.setFocus) return;

    // Distance is measured camera→subject every frame, so it is independent of
    // where in the world the shrine plateau happens to sit.
    let dist;
    if (this.lockTarget?.position && this._lockBlend > 0.4) {
      _v1.copy(this.lockTarget.position);
      _v1.y += 1.2;
      dist = this.camera.position.distanceTo(_v1);
    } else {
      dist = this.camera.position.distanceTo(this._pivotSmooth);
    }

    // Rack, never cut: an aperture step reads as a lens swap. Lock-on eases one
    // stop open onto the duel; an execution opens further, and both restore to the
    // gameplay value on their own blends.
    let want = this.aperture;
    if (this._lockBlend > 0) want = lerp(want, APERTURE_LOCK, this._lockBlend);
    if (this._cine) want = APERTURE_CINEMATIC;
    this._apertureNow = damp(this._apertureNow, want, 3.5, dt);

    pipe.setFocus(dist, this._apertureNow);
  }

  lateUpdate() {
    // Backstop for the input frame close: if Player failed to boot, someone still
    // has to clear the edge-triggered actions or every press latches forever.
    const input = this.ctx.input;
    if (!input) return;
    const f = this.ctx.engine?.frame ?? 0;
    if (input.__kagEndFrame !== f) { input.__kagEndFrame = f; input.endFrame?.(); }
  }

  applyQuality(q) {
    this.aperture = q?.dof ? APERTURE_GAMEPLAY : APERTURE_NO_DOF;
  }

  dispose() {
    for (const off of this._offs) { try { off?.(); } catch { /* already gone */ } }
    this._offs.length = 0;
  }
}
