/**
 * Input.js — one intent model, three control surfaces.
 *
 * Everything downstream (Player, Combat, Camera) reads `input.state`, which is
 * identical whether the frame was driven by a thumb, a mouse or a gamepad. The
 * touch layer is the primary target: one side of the screen is a floating analogue
 * stick (`stickSide`, mirrored by the left-handed setting), the other is camera look
 * *and* the slash gesture surface, and HUD buttons register themselves as named zones.
 */

import { Vector2 } from 'three';

const DEADZONE = 0.14;
const STICK_RADIUS = 62;          // px at 1x; scaled by UI scale
const SWIPE_MIN_DIST = 26;        // px before a drag counts as a slash
const SWIPE_MAX_TIME = 420;       // ms
const TAP_MAX_DIST = 14;
const TAP_MAX_TIME = 240;

/** Quantise a gesture vector into one of the eight katana slash directions. */
export function slashDirection(dx, dy) {
  const a = Math.atan2(dy, dx);                 // screen space, +y down
  const oct = Math.round(a / (Math.PI / 4)) & 7;
  return ['r', 'dr', 'd', 'dl', 'l', 'ul', 'u', 'ur'][oct];
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.usingTouch = false;
    this.uiScale = 1;
    /**
     * Touch layout. `stickSide` mirrors with the left-handed setting; the HUD mirrors
     * its own buttons independently, so both halves have to be told, not inferred.
     * `stickHalf` is the fraction of the viewport the stick owns — the rest is the
     * camera/gesture surface.
     */
    this.stickSide = 'left';
    this.stickHalf = 0.42;
    this.invertY = false;
    this.lookSensitivity = 1;

    this.state = {
      move: new Vector2(),        // -1..1, y = forward
      moveMag: 0,
      look: new Vector2(),        // radians consumed per frame
      run: false,
      guard: false,
      lockHeld: false,
      /** Edge-triggered actions, consumed via `consume(name)`. */
      pressed: new Set(),
      /** Queued slashes: { dir, power, t } */
      slashes: [],
    };

    this._keys = new Set();
    this._pointers = new Map();   // pointerId -> pointer record
    this._moveId = null;
    this._lookId = null;
    this._zones = [];             // registered HUD button zones
    this._lookSens = { mouse: 0.0022, touch: 0.0040 };
    this._pendingLook = new Vector2();
    this._gamepadIndex = null;

    this._bind();
  }

  // ---------------------------------------------------------------- lifecycle

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', this._onDown = (e) => this._down(e), opts);
    window.addEventListener('pointermove', this._onMove = (e) => this._move(e), opts);
    window.addEventListener('pointerup', this._onUp = (e) => this._up(e), opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', this._onKeyDown = (e) => this._key(e, true));
    window.addEventListener('keyup', this._onKeyUp = (e) => this._key(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });

    window.addEventListener('gamepadconnected', (e) => { this._gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this._gamepadIndex = null; });
  }

  dispose() {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  releaseAll() {
    this._keys.clear();
    this._pointers.clear();
    this._moveId = this._lookId = null;
    this.state.move.set(0, 0);
    this.state.moveMag = 0;
    this.state.guard = false;
    this.state.run = false;
  }

  // -------------------------------------------------------------- HUD zones

  /**
   * Register a screen-space button. `rect()` returns {x,y,w,h} in CSS pixels.
   * `mode` is 'press' (edge on touch down) or 'hold' (sets state[name] true).
   */
  registerZone(name, rect, mode = 'press') {
    this._zones.push({ name, rect, mode });
    return () => { this._zones = this._zones.filter((z) => z.name !== name); };
  }

  _hitZone(x, y) {
    for (let i = this._zones.length - 1; i >= 0; i--) {
      const z = this._zones[i];
      const r = z.rect();
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return z;
    }
    return null;
  }

  // -------------------------------------------------------------- pointers

  _down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (touch) this.usingTouch = true;

    const x = e.clientX, y = e.clientY;
    const zone = touch ? this._hitZone(x, y) : null;
    const rec = {
      id: e.pointerId, type: e.pointerType, zone,
      x0: x, y0: y, x, y, px: x, py: y,
      t0: performance.now(), moved: 0, role: null,
    };
    this._pointers.set(e.pointerId, rec);

    if (zone) {
      rec.role = 'zone';
      if (zone.mode === 'press') this.state.pressed.add(zone.name);
      else this.state[zone.name] = true;
      return;
    }

    if (touch) {
      const w = window.innerWidth;
      const onStickSide = this.stickSide === 'left'
        ? x < w * this.stickHalf
        : x > w * (1 - this.stickHalf);
      if (onStickSide && this._moveId === null) {
        rec.role = 'stick';
        this._moveId = e.pointerId;
      } else {
        rec.role = 'look';
        if (this._lookId === null) this._lookId = e.pointerId;
      }
    } else {
      // Desktop: LMB = slash gesture surface / attack, RMB = look, MMB = free.
      if (e.button === 2) {
        rec.role = 'look';
        this._lookId = e.pointerId;
        if (!this.pointerLocked && this.canvas.requestPointerLock) {
          this.canvas.requestPointerLock();
        }
      } else if (e.button === 0) {
        rec.role = 'click';
        this.state.pressed.add(e.shiftKey ? 'heavy' : 'attack');
      }
    }
  }

  _move(e) {
    const rec = this._pointers.get(e.pointerId);
    // Mouse look while pointer-locked has no button held.
    if (!rec) {
      if (this.pointerLocked && e.pointerType === 'mouse') {
        const s = this._lookSens.mouse * this.lookSensitivity;
        this._pendingLook.x -= (e.movementX || 0) * s;
        this._pendingLook.y -= (e.movementY || 0) * s * (this.invertY ? -1 : 1);
      }
      return;
    }
    if (e.cancelable) e.preventDefault();

    const x = e.clientX, y = e.clientY;
    const dx = x - rec.x, dy = y - rec.y;
    rec.px = rec.x; rec.py = rec.y;
    rec.x = x; rec.y = y;
    rec.moved += Math.hypot(dx, dy);

    if (rec.role === 'stick') {
      const r = STICK_RADIUS * this.uiScale;
      let ox = (x - rec.x0) / r, oy = (y - rec.y0) / r;
      const mag = Math.hypot(ox, oy);
      if (mag > 1) { ox /= mag; oy /= mag; }
      // Drag the stick origin along when the thumb overshoots — feels far better
      // than clamping, which makes the stick feel "stuck" during long holds.
      if (mag > 1.35) {
        rec.x0 = x - ox * r * 1.0;
        rec.y0 = y - oy * r * 1.0;
      }
      this.state.move.set(ox, -oy);
      const m = Math.min(1, Math.hypot(ox, oy));
      this.state.moveMag = m < DEADZONE ? 0 : (m - DEADZONE) / (1 - DEADZONE);
      if (this.state.moveMag === 0) this.state.move.set(0, 0);
      else this.state.move.normalize().multiplyScalar(this.state.moveMag);
      this.state.run = this.state.moveMag > 0.82;
    } else if (rec.role === 'look' && e.pointerId === this._lookId) {
      const s = (rec.type === 'mouse' ? this._lookSens.mouse : this._lookSens.touch) * this.lookSensitivity;
      this._pendingLook.x -= dx * s;
      this._pendingLook.y -= dy * s * (this.invertY ? -1 : 1);
    }
  }

  _up(e) {
    const rec = this._pointers.get(e.pointerId);
    if (!rec) return;
    this._pointers.delete(e.pointerId);
    const dt = performance.now() - rec.t0;

    if (rec.role === 'zone') {
      if (rec.zone.mode === 'hold') this.state[rec.zone.name] = false;
      this.state.pressed.add(rec.zone.name + ':up');
      return;
    }
    if (rec.role === 'stick') {
      this._moveId = null;
      this.state.move.set(0, 0);
      this.state.moveMag = 0;
      this.state.run = false;
      return;
    }
    if (rec.role === 'look') {
      if (this._lookId === e.pointerId) this._lookId = null;
      const dx = rec.x - rec.x0, dy = rec.y - rec.y0;
      const dist = Math.hypot(dx, dy);
      if (rec.type !== 'mouse') {
        if (dist >= SWIPE_MIN_DIST * this.uiScale && dt <= SWIPE_MAX_TIME) {
          // Power scales with gesture speed — a flick lands a heavier cut.
          const speed = dist / Math.max(40, dt);
          this.state.slashes.push({
            dir: slashDirection(dx, dy),
            power: Math.min(1, speed / 1.5),
            t: performance.now(),
          });
        } else if (dist < TAP_MAX_DIST * this.uiScale && dt < TAP_MAX_TIME) {
          this.state.pressed.add('attack');
        }
      }
    }
  }

  // ------------------------------------------------------------------ keys

  _key(e, down) {
    if (!this.enabled) return;
    const k = e.code;
    if (down && this._keys.has(k)) return;
    down ? this._keys.add(k) : this._keys.delete(k);
    if (!down) return;
    const map = {
      Space: 'dodge', ShiftLeft: null, KeyQ: 'lockOn', KeyE: 'special',
      KeyF: 'interact', KeyR: 'sheathe', Escape: 'pause', Tab: 'pause',
      Digit1: 'stance1', Digit2: 'stance2', Digit3: 'stance3',
    };
    if (map[k]) { this.state.pressed.add(map[k]); e.preventDefault(); }
  }

  // ---------------------------------------------------------------- gamepad

  _pollGamepad() {
    if (this._gamepadIndex === null || !navigator.getGamepads) return false;
    const gp = navigator.getGamepads()[this._gamepadIndex];
    if (!gp) return false;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const mx = dz(gp.axes[0] || 0), my = dz(gp.axes[1] || 0);
    if (mx || my) {
      this.state.move.set(mx, -my);
      this.state.moveMag = Math.min(1, Math.hypot(mx, my));
      this.state.run = !!gp.buttons[10]?.pressed || this.state.moveMag > 0.9;
    }
    const lx = dz(gp.axes[2] || 0), ly = dz(gp.axes[3] || 0);
    this._pendingLook.x -= lx * 0.055 * this.lookSensitivity;
    this._pendingLook.y -= ly * 0.045 * this.lookSensitivity * (this.invertY ? -1 : 1);

    const edge = (i, name) => {
      const p = !!gp.buttons[i]?.pressed;
      this._gpPrev = this._gpPrev || {};
      if (p && !this._gpPrev[i]) this.state.pressed.add(name);
      this._gpPrev[i] = p;
    };
    edge(0, 'dodge'); edge(2, 'attack'); edge(3, 'heavy');
    edge(4, 'lockOn'); edge(5, 'special'); edge(9, 'pause');
    this.state.guard = !!gp.buttons[6]?.pressed || (gp.buttons[6]?.value || 0) > 0.4;
    return true;
  }

  // ----------------------------------------------------------------- update

  update() {
    if (!this.usingTouch) {
      const k = this._keys;
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      if (x || y) {
        this.state.move.set(x, y).normalize();
        this.state.moveMag = 1;
      } else if (this._gamepadIndex === null) {
        this.state.move.set(0, 0);
        this.state.moveMag = 0;
      }
      this.state.run = k.has('ShiftLeft') || k.has('ShiftRight');
      this.state.guard = k.has('KeyC') || this._mouseRightGuard === true;
      this.state.lockHeld = k.has('KeyQ');
    }
    this._pollGamepad();

    this.state.look.copy(this._pendingLook);
    this._pendingLook.set(0, 0);

    // Expire stale gestures so a queued slash never fires a second later.
    const now = performance.now();
    if (this.state.slashes.length) {
      this.state.slashes = this.state.slashes.filter((s) => now - s.t < 220);
    }
  }

  /** Called once at the very end of the frame. */
  endFrame() {
    this.state.pressed.clear();
    this.state.slashes.length = 0;
  }

  consume(name) {
    if (this.state.pressed.has(name)) { this.state.pressed.delete(name); return true; }
    return false;
  }

  isDown(code) { return this._keys.has(code); }

  /** Live stick geometry for the HUD to draw against. */
  stickVisual() {
    if (this._moveId === null) return null;
    const rec = this._pointers.get(this._moveId);
    if (!rec) return null;
    const r = STICK_RADIUS * this.uiScale;
    let ox = (rec.x - rec.x0), oy = (rec.y - rec.y0);
    const m = Math.hypot(ox, oy);
    if (m > r) { ox = ox / m * r; oy = oy / m * r; }
    return { ox: rec.x0, oy: rec.y0, kx: rec.x0 + ox, ky: rec.y0 + oy, r };
  }

  /** Live look-drag trail so the HUD can draw the slash arc being charged. */
  gestureVisual() {
    if (this._lookId === null) return null;
    const rec = this._pointers.get(this._lookId);
    if (!rec || rec.type === 'mouse') return null;
    const dist = Math.hypot(rec.x - rec.x0, rec.y - rec.y0);
    if (dist < 8) return null;
    return { x0: rec.x0, y0: rec.y0, x: rec.x, y: rec.y, dist };
  }
}
