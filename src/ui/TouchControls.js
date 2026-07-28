/**
 * TouchControls.js — the thumb layer.
 *
 * Drawn into the HUD's canvas (HUD owns the surface and calls `update(dt, g)`
 * after its own layers) so the whole UI is still a single composite per frame.
 * Everything static — the ink seals, the stick ring, the keyboard card — is baked
 * once per resize; the live frame only draws the stick offset, the gesture trail
 * and the press/cooldown overlays.
 *
 * The four action zones are registered with Input under the names Combat expects:
 * `guard` (hold), `dodge`, `special`, `lockOn` (press).
 */

import { slashDirection } from '../core/Input.js';

/** Input's STICK_RADIUS, mirrored here so the ring we draw matches the maths. */
const STICK_RADIUS = 62;

/** Screen-space angle (y down) for each of the eight quantised cuts. */
const CUT_ANGLE = {
  r: 0, dr: Math.PI * 0.25, d: Math.PI * 0.5, dl: Math.PI * 0.75,
  l: Math.PI, ul: -Math.PI * 0.75, u: -Math.PI * 0.5, ur: -Math.PI * 0.25,
};

const HINTS = [
  ['WASD', '移動'],
  ['MOUSE', '視点'],
  ['L-CLICK', '斬'],
  ['SPACE', '回避'],
  ['C', '受'],
  ['Q', '敵'],
  ['E', '技'],
  ['ESC', '休'],
];

export class TouchControls {
  constructor(ctx, hud) {
    this.ctx = ctx;
    this.hud = hud;

    this.visible = false;
    this.forceVisible = false;
    this.enabled = true;
    this.fancy = true;

    this._vis = 0;              // eased visibility 0..1
    this._hintTimer = 8;        // desktop keyboard card lifetime, seconds
    this._demoTimer = 0;
    this.time = 0;

    // Stick.
    this._stickA = 0;
    this._stickX = 0; this._stickY = 0;
    this._knobX = 0; this._knobY = 0;
    this._stickR = STICK_RADIUS;

    // Gesture trail (ring buffer of screen points; never reallocated).
    this._trail = new Float32Array(16 * 2);
    this._trailN = 0;
    this._gestA = 0;
    this._gestDir = 'r';
    this._gestDist = 0;
    this._gestX = 0; this._gestY = 0;

    // Four action seals, laid out on a thumb arc from the bottom corner.
    this.buttons = [
      this._mkButton('guard', '受', 'hold', 180),
      this._mkButton('dodge', '避', 'press', 209),
      this._mkButton('special', '技', 'press', 238),
      this._mkButton('lockOn', '敵', 'press', 267),
    ];
    this._byName = Object.create(null);
    for (let i = 0; i < this.buttons.length; i++) this._byName[this.buttons[i].name] = this.buttons[i];

    this._unregister = [];
    this._sprites = { hint: null };
    this._demoStick = null;
    this._demoGesture = false;
  }

  _mkButton(name, kanji, mode, angleDeg) {
    return {
      name, kanji, mode,
      angle: (angleDeg * Math.PI) / 180,
      cx: 0, cy: 0, r: 30, hit: 36,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      press: 0,            // 0..1 press animation
      down: false,
      seen: false,         // edge detector for press-mode zones
      cd: 0, cdMax: 0,     // cooldown seconds
      disabled: false, forcedDisabled: false,
      idle: null, active: null,
    };
  }

  // --------------------------------------------------------------- lifecycle

  async init() {
    const input = this.ctx.input;
    if (input?.registerZone) {
      for (let i = 0; i < this.buttons.length; i++) {
        const b = this.buttons[i];
        // Returning null while hidden makes Input skip the zone entirely.
        const off = input.registerZone(b.name, () => (this.visible && this.enabled ? b.rect : null), b.mode);
        if (typeof off === 'function') this._unregister.push(off);
      }
    }
    this.resize(this.hud?.w || window.innerWidth, this.hud?.h || window.innerHeight);
    return this;
  }

  dispose() {
    for (let i = 0; i < this._unregister.length; i++) {
      try { this._unregister[i](); } catch { /* zone already gone */ }
    }
    this._unregister.length = 0;
    this._sprites = { hint: null };
    for (let i = 0; i < this.buttons.length; i++) {
      this.buttons[i].idle = null;
      this.buttons[i].active = null;
    }
  }

  applyQuality(q) { this.fancy = (q?.tier ?? 3) >= 1; }

  /**
   * Which half the analogue stick lives on. Input is authoritative (main.js maps
   * handedness onto it); the settings flag is only a fallback for the frame
   * before that mapping has run.
   */
  stickSide() {
    const side = this.ctx.input?.stickSide;
    if (side === 'left' || side === 'right') return side;
    return this.ctx.settings?.leftHanded ? 'right' : 'left';
  }

  /** True when the action cluster sits bottom-left, i.e. the stick is on the right. */
  get mirrored() { return this.stickSide() === 'right'; }

  // ------------------------------------------------------------------ layout

  resize(w, h) {
    const hud = this.hud;
    if (!hud) return;
    const s = hud.s, safe = hud.safe, Ink = hud.ink;
    this.w = w; this.h = h;

    // One UI scale for the whole touch layer — Input reads this for the stick.
    if (this.ctx.input) this.ctx.input.uiScale = s;
    this._stickR = STICK_RADIUS * s;

    // The buttons always take the half the stick does not own.
    const mirror = this.mirrored;
    // Absolute minimums are in CSS px, not scaled units: a small phone must not
    // shrink a 56 px target into something a thumb cannot hit.
    const D = Math.max(56, 62 * s);
    const HIT = Math.max(72, 78 * s);
    // The arc radius is chosen so 29° of separation puts ≥ HIT px between
    // adjacent centres — the four hit zones must never overlap, or Input's
    // last-registered-wins resolution would steal presses from guard.
    const arcR = Math.max(HIT / 0.506 + 6, 150 * s);

    const ax = mirror ? safe.left + 40 * s : w - safe.right - 40 * s;
    const ay = h - safe.bottom - 34 * s;

    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const a = mirror ? Math.PI - b.angle : b.angle;
      b.r = D * 0.5;
      b.hit = HIT * 0.5;
      b.cx = ax + Math.cos(a) * arcR;
      b.cy = ay + Math.sin(a) * arcR;
      // Never let a seal escape the safe area on a narrow device.
      b.cx = Math.min(Math.max(b.cx, safe.left + b.r + 4), w - safe.right - b.r - 4);
      b.cy = Math.min(Math.max(b.cy, safe.top + b.r + 4), h - safe.bottom - b.r - 4);
      b.rect.x = b.cx - b.hit;
      b.rect.y = b.cy - b.hit;
      b.rect.w = b.hit * 2;
      b.rect.h = b.hit * 2;
      b.idle = this._bakeSeal(b, D, false);
      b.active = this._bakeSeal(b, D, true);
    }

    const d = hud.dpr;

    // Stick ring + knob.
    const R = this._stickR;
    this._sprites.ring = Ink.sprite(R * 2 + 22 * s, R * 2 + 22 * s, d, (g, W, H) => {
      Ink.seed(1301);
      const cx = W * 0.5, cy = H * 0.5;
      g.fillStyle = 'rgba(242,227,207,0.34)';
      for (let i = 0; i < 5; i++) {
        const a0 = (i / 5) * 6.2831853 + 0.14;
        Ink.arcStroke(g, cx, cy, R, a0, a0 + 1.02, 2.6 * s, 0.6, true, 13);
      }
      g.fillStyle = 'rgba(20,17,16,0.24)';
      Ink.blob(g, cx, cy, R - 2 * s, R - 2 * s, 0.03, 34);
      Ink.grain(g, W, H, 1.1, 0x3311, 2.1);
    });

    const kr = Math.max(17, 24 * s);
    this._sprites.knob = Ink.sprite(kr * 2 + 10 * s, kr * 2 + 10 * s, d, (g, W, H) => {
      Ink.seed(1499);
      const cx = W * 0.5, cy = H * 0.5;
      g.fillStyle = 'rgba(242,227,207,0.86)';
      Ink.blob(g, cx, cy, kr, kr, 0.07, 26);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      Ink.blob(g, cx, cy, kr * 0.42, kr * 0.42, 0.16, 18);
      g.globalCompositeOperation = 'source-over';
      Ink.grain(g, W, H, 1.4, 0x7731, 1.6);
    });

    this._bakeHint();
  }

  _bakeSeal(b, D, active) {
    const hud = this.hud, s = hud.s, Ink = hud.ink, P = hud.palette;
    const pad = 10 * s;
    const size = D + pad * 2;
    return Ink.sprite(size, size, hud.dpr, (g, W, H) => {
      Ink.seed(active ? 2200 + b.name.length * 37 : 1700 + b.name.length * 41);
      const cx = W * 0.5, cy = H * 0.5, r = D * 0.5;

      g.fillStyle = active ? 'rgba(200,50,30,0.80)' : 'rgba(20,17,16,0.46)';
      Ink.blob(g, cx, cy, r - 2.5 * s, r - 2.5 * s, 0.035, 32);

      g.fillStyle = active ? 'rgba(242,227,207,0.95)' : 'rgba(242,227,207,0.55)';
      for (let i = 0; i < 4; i++) {
        const a0 = i * 1.5707963 + 0.2;
        Ink.arcStroke(g, cx, cy, r - 1 * s, a0, a0 + 1.19, active ? 3.0 * s : 2.1 * s, 0.55, true, 14);
      }

      if (active) {
        g.fillStyle = 'rgba(242,227,207,0.55)';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 6.2831853 + 0.4;
          Ink.stroke(g,
            cx + Math.cos(a) * (r + 1 * s), cy + Math.sin(a) * (r + 1 * s),
            cx + Math.cos(a) * (r + 7 * s), cy + Math.sin(a) * (r + 7 * s),
            2.2 * s, 0.6, 5);
        }
      }

      g.fillStyle = active ? '#fdf6ea' : P.bone;
      g.font = `600 ${Math.round(D * 0.44)}px ${FONT_JP_LOCAL}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.kanji, cx, cy + D * 0.02);

      Ink.grain(g, W, H, 1.25, active ? 0x9a1 : 0x4c2, 1.7);
    });
  }

  _bakeHint() {
    const hud = this.hud, s = hud.s, Ink = hud.ink, P = hud.palette;
    const rowH = 17 * s;
    const W = 210 * s, H = 18 * s + HINTS.length * rowH;
    this._sprites.hint = Ink.sprite(W, H, hud.dpr, (g, w, h) => {
      Ink.seed(1900);
      g.fillStyle = 'rgba(14,11,10,0.62)';
      Ink.ragRect(g, 2 * s, 2 * s, w - 4 * s, h - 4 * s, 1.8 * s, 22 * s);
      g.fillStyle = P.vermilion;
      Ink.stroke(g, 12 * s, 10 * s, w - 12 * s, 10 * s, 2.4 * s, 0.6, 14);
      g.textBaseline = 'middle';
      for (let i = 0; i < HINTS.length; i++) {
        const y = 18 * s + i * rowH + rowH * 0.4;
        g.textAlign = 'left';
        g.fillStyle = 'rgba(242,227,207,0.52)';
        g.font = `500 ${Math.round(9 * s)}px ${FONT_UI_LOCAL}`;
        g.fillText(HINTS[i][0], 14 * s, y);
        g.textAlign = 'right';
        g.fillStyle = P.bone;
        g.font = `500 ${Math.round(12 * s)}px ${FONT_JP_LOCAL}`;
        g.fillText(HINTS[i][1], w - 14 * s, y);
      }
      Ink.grain(g, w, h, 1.0, 0x6f6f, 1.9);
    });
  }

  // -------------------------------------------------------------- public API

  /** Start a cooldown sweep on a button, in seconds. */
  setCooldown(name, seconds) {
    const b = this._byName[name];
    if (!b) return;
    b.cdMax = Math.max(0.0001, seconds);
    b.cd = b.cdMax;
  }

  setDisabled(name, flag) {
    const b = this._byName[name];
    if (b) { b.forcedDisabled = !!flag; b.disabled = !!flag; }
  }

  /** Force the touch layer on and fake a stick/gesture for the capture rig. */
  __demo() {
    this.forceVisible = true;
    this._demoTimer = 45;
    const hud = this.hud;
    const R = this._stickR;
    const s = hud?.s || 1;
    const right = this.mirrored;
    const ox = right
      ? (hud?.w || 800) - (hud?.safe.right || 0) - R - 34 * s
      : (hud?.safe.left || 0) + R + 34 * s;
    const oy = (hud?.h || 400) - (hud?.safe.bottom || 0) - R - 34 * s;
    this._demoStick = {
      ox, oy, kx: ox + (right ? -1 : 1) * R * 0.62, ky: oy - R * 0.48, r: R,
    };
    this._demoGesture = true;
    this.setCooldown('special', 3.2);
    this._byName.special.cd = 2.1;
    return this;
  }

  // --------------------------------------------------------------- per frame

  _shouldShow() {
    if (this.forceVisible) return true;
    if (!this.enabled) return false;
    const input = this.ctx.input;
    if (input?.usingTouch === true) return true;
    // Before the first touch we still show on a coarse-pointer device: a phone
    // must never boot into an invisible control scheme.
    const dev = this.ctx.quality?.device;
    return !!(dev && dev.isMobile && dev.coarse);
  }

  update(dt, g) {
    const hud = this.hud;
    if (!hud || !g) return;
    this.time += dt;
    if (this._demoTimer > 0) {
      this._demoTimer -= dt;
      if (this._demoTimer <= 0) { this.forceVisible = false; this._demoStick = null; this._demoGesture = false; }
    }

    this.visible = this._shouldShow();
    const target = this.visible ? 1 : 0;
    this._vis += (target - this._vis) * (1 - Math.exp(-13 * dt));
    if (Math.abs(this._vis - target) < 0.004) this._vis = target;

    this._pollButtons(dt);

    const a = this._vis * (hud.alpha === undefined ? 1 : hud.alpha);
    if (a > 0.004) {
      const prev = g.globalAlpha;
      g.globalAlpha = prev * a;
      this._drawStick(dt, g);
      this._drawGesture(dt, g);
      this._drawButtons(g);
      g.globalAlpha = prev;
    }

    if (!this.visible && this._hintTimer > 0) {
      this._hintTimer -= dt;
      this._drawHint(g);
    }
  }

  _pollButtons(dt) {
    const input = this.ctx.input;
    const st = input?.state;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];

      if (b.cd > 0) b.cd = Math.max(0, b.cd - dt);
      // A cooldown published by gameplay wins over our local timer.
      const ext = this._externalCooldown(b.name);
      if (ext >= 0) { b.cd = ext; b.cdMax = Math.max(b.cdMax, ext, 0.0001); }
      b.disabled = b.forcedDisabled || this._externalDisabled(b.name);

      let down = false;
      if (st) {
        if (b.mode === 'hold') {
          down = st[b.name] === true;
        } else {
          // `pressed` is edge-triggered and cleared by Input.endFrame(); detect the
          // rising edge ourselves so the flash fires exactly once either way.
          const now = st.pressed?.has(b.name) === true;
          down = now && !b.seen;
          b.seen = now;
        }
      }
      if (down && !b.disabled) b.press = 1;
      b.down = b.mode === 'hold' ? down : b.press > 0.5;
      if (b.press > 0 && !(b.mode === 'hold' && down)) {
        b.press = Math.max(0, b.press - dt * 5.4);
      }
    }
  }

  _externalCooldown(name) {
    const src = this.ctx.player?.cooldowns || this.ctx.combat?.cooldowns;
    if (!src) return -1;
    const v = src[name];
    return typeof v === 'number' && v > 0 ? v : -1;
  }

  _externalDisabled(name) {
    const src = this.ctx.player?.disabledActions || this.ctx.combat?.disabledActions;
    return !!(src && src[name]);
  }

  // ---------------------------------------------------------------- 1. stick

  _drawStick(dt, g) {
    const hud = this.hud, s = hud.s, Ink = hud.ink;
    const sv = this._demoStick || this.ctx.input?.stickVisual?.() || null;
    const live = !!sv;
    if (live) {
      this._stickX = sv.ox; this._stickY = sv.oy;
      this._knobX = sv.kx; this._knobY = sv.ky;
    }
    this._stickA += ((live ? 1 : 0) - this._stickA) * (1 - Math.exp(-(live ? 22 : 8) * dt));
    if (this._stickA < 0.005) return;

    const ring = this._sprites.ring, knob = this._sprites.knob;
    const R = this._stickR;
    const dx = this._knobX - this._stickX, dy = this._knobY - this._stickY;
    const mag = Math.min(1, Math.hypot(dx, dy) / (R || 1));

    Ink.blitC(g, ring, this._stickX, this._stickY, this._stickA * 0.9);

    // Directional bloom: a soft brush arc on the ring toward the push direction.
    if (mag > 0.05) {
      const a = Math.atan2(dy, dx);
      g.save();
      g.globalAlpha = g.globalAlpha * this._stickA * mag * 0.75;
      g.fillStyle = 'rgba(242,227,207,0.55)';
      Ink.seed(1601);
      Ink.arcStroke(g, this._stickX, this._stickY, R, a - 0.62, a + 0.62, 4.4 * s, 0.4, true, 16);
      g.fillStyle = 'rgba(200,50,30,0.5)';
      Ink.stroke(g, this._stickX, this._stickY,
        this._stickX + Math.cos(a) * R * mag, this._stickY + Math.sin(a) * R * mag,
        3.0 * s, 0.5, 8);
      g.restore();
    }

    Ink.blitC(g, knob, this._knobX, this._knobY, this._stickA);
  }

  // -------------------------------------------------------------- 2. gesture

  _drawGesture(dt, g) {
    const hud = this.hud, s = hud.s, Ink = hud.ink;
    let gv = this.ctx.input?.gestureVisual?.() || null;

    if (!gv && this._demoGesture) {
      // A believable flick for the capture rig, mid-charge, on the half the
      // stick does not own.
      const away = this.mirrored ? -1 : 1;
      const x0 = this.w * (this.mirrored ? 0.30 : 0.70), y0 = this.h * 0.62;
      const x = x0 + away * 78 * s, y = y0 - 62 * s;
      this._demoGV = this._demoGV || { x0: 0, y0: 0, x: 0, y: 0, dist: 0 };
      this._demoGV.x0 = x0; this._demoGV.y0 = y0;
      this._demoGV.x = x; this._demoGV.y = y;
      this._demoGV.dist = Math.hypot(x - x0, y - y0);
      gv = this._demoGV;
    }

    if (gv) {
      // Sample the thumb into a short ring buffer so the ink follows, not snaps.
      if (this._trailN === 0) {
        this._trail[0] = gv.x0; this._trail[1] = gv.y0;
        this._trailN = 1;
      }
      const n = this._trailN;
      const lx = this._trail[(n - 1) * 2], ly = this._trail[(n - 1) * 2 + 1];
      if (Math.hypot(gv.x - lx, gv.y - ly) > 3) {
        if (n < 16) {
          this._trail[n * 2] = gv.x; this._trail[n * 2 + 1] = gv.y;
          this._trailN = n + 1;
        } else {
          for (let i = 0; i < 15; i++) {
            this._trail[i * 2] = this._trail[(i + 1) * 2];
            this._trail[i * 2 + 1] = this._trail[(i + 1) * 2 + 1];
          }
          this._trail[30] = gv.x; this._trail[31] = gv.y;
        }
      }
      this._gestDist = gv.dist;
      this._gestX = gv.x; this._gestY = gv.y;
      this._gestDir = slashDirection(gv.x - gv.x0, gv.y - gv.y0);
    } else if (this._gestA < 0.01) {
      this._trailN = 0;
    }

    this._gestA += ((gv ? 1 : 0) - this._gestA) * (1 - Math.exp(-(gv ? 26 : 9) * dt));
    if (this._gestA < 0.01 || this._trailN < 2) return;

    const charge = Math.min(1, this._gestDist / (140 * s));
    const wMax = (3.5 + charge * 12) * s;

    g.save();
    g.globalAlpha = g.globalAlpha * this._gestA;
    g.fillStyle = 'rgba(242,227,207,0.82)';
    Ink.seed(1777);
    const n = this._trailN;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const w = wMax * (0.25 + 0.75 * t);
      Ink.stroke(g, this._trail[(i - 1) * 2], this._trail[(i - 1) * 2 + 1],
        this._trail[i * 2], this._trail[i * 2 + 1], w, 0.35, 6);
    }

    // The glyph tells you which of the eight cuts is armed.
    const a = CUT_ANGLE[this._gestDir] || 0;
    const gx = this._gestX + Math.cos(a) * 26 * s;
    const gy = this._gestY + Math.sin(a) * 26 * s;
    g.globalAlpha = g.globalAlpha * (0.45 + charge * 0.55);
    g.fillStyle = charge > 0.72 ? '#c9a227' : '#c8321e';
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 2; k++) {
      const o = k * 7 * s;
      Ink.stroke(g,
        gx - ca * 6 * s - sa * 8 * s + ca * o, gy - sa * 6 * s + ca * 8 * s + sa * o,
        gx + ca * 6 * s + ca * o, gy + sa * 6 * s + sa * o, 2.8 * s, 0.4, 5);
      Ink.stroke(g,
        gx - ca * 6 * s + sa * 8 * s + ca * o, gy - sa * 6 * s - ca * 8 * s + sa * o,
        gx + ca * 6 * s + ca * o, gy + sa * 6 * s + sa * o, 2.8 * s, 0.4, 5);
    }
    g.restore();
  }

  // -------------------------------------------------------------- 3. buttons

  _drawButtons(g) {
    const hud = this.hud, s = hud.s, Ink = hud.ink;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const cooling = b.cd > 0 && b.cdMax > 0;
      const dim = b.disabled ? 0.3 : cooling ? 0.72 : 1;

      Ink.blitC(g, b.idle, b.cx, b.cy, dim * (1 - b.press * 0.85), 0, 1);
      if (b.press > 0.004) {
        Ink.blitC(g, b.active, b.cx, b.cy, dim * b.press, 0, 1 + b.press * 0.06);
      }

      if (cooling) {
        // Ink sweep that unwinds clockwise from the top as the ability returns.
        const frac = b.cd / b.cdMax;
        g.save();
        g.globalAlpha = g.globalAlpha * 0.62;
        g.fillStyle = 'rgba(10,8,8,0.85)';
        g.beginPath();
        g.moveTo(b.cx, b.cy);
        g.arc(b.cx, b.cy, b.r, -Math.PI * 0.5, -Math.PI * 0.5 + 6.2831853 * frac);
        g.closePath();
        g.fill();
        g.globalAlpha = g.globalAlpha * 1.3;
        g.strokeStyle = '#c9a227';
        g.lineWidth = 1.4 * s;
        g.beginPath();
        g.arc(b.cx, b.cy, b.r - 1 * s, -Math.PI * 0.5, -Math.PI * 0.5 + 6.2831853 * frac);
        g.stroke();
        g.restore();
      }

      if (b.disabled) {
        g.save();
        g.globalAlpha = g.globalAlpha * 0.6;
        g.fillStyle = 'rgba(20,17,16,0.7)';
        Ink.seed(2600 + i);
        Ink.stroke(g, b.cx - b.r * 0.7, b.cy - b.r * 0.7, b.cx + b.r * 0.7, b.cy + b.r * 0.7, 3.4 * s, 0.5, 8);
        g.restore();
      }
    }
  }

  // ------------------------------------------------------- 4. keyboard card

  _drawHint(g) {
    const sp = this._sprites.hint;
    if (!sp) return;
    const hud = this.hud, s = hud.s;
    const a = Math.min(1, this._hintTimer / 1.2) * (hud.alpha === undefined ? 1 : hud.alpha) * 0.92;
    const x = this.mirrored
      ? hud.safe.left + 18 * s
      : hud.w - hud.safe.right - sp.w - 18 * s;
    hud.ink.blit(g, sp, x, hud.h - hud.safe.bottom - sp.h - 18 * s, a);
  }
}

// Fonts are duplicated as module constants rather than imported from HUD.js so
// this module has no dependency back on its owner (see the note in HUD.js).
const FONT_JP_LOCAL =
  '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC","MS Mincho","Source Han Serif",serif';
const FONT_UI_LOCAL =
  'ui-sans-serif,system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
