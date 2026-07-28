/**
 * HUD.js — the ink layer.
 *
 * One 2D canvas is stacked over the WebGL canvas and composited exactly once per
 * frame. Everything that does not change between frames (brush strokes, seals,
 * kanji, paper grain) is rendered once into an offscreen sprite at boot/resize and
 * then blitted; per-frame work is limited to blits, a handful of short paths, and
 * the few strokes that genuinely animate. That is what keeps the whole layer
 * inside the 1.5 ms phone budget.
 *
 * This module also owns the shared ink vocabulary (`Ink`, `PALETTE`, fonts) that
 * TouchControls and Menus draw with, so the three surfaces stay one language.
 * TouchControls receives the toolkit through its constructor rather than importing
 * it, which keeps the module graph acyclic.
 */

import { Vector3, Quaternion } from 'three';
import { TouchControls } from './TouchControls.js';

// ---------------------------------------------------------------- vocabulary

export const PALETTE = {
  ink: '#141110',
  inkSoft: '#26201c',
  vermilion: '#c8321e',
  bone: '#f2e3cf',
  gold: '#c9a227',
  blood: '#7a0d12',
  steel: '#c9d3dc',
  ash: '#8e8072',
};

/** Mincho first: the wedge-serif shapes read as brushed, not as UI. */
export const FONT_JP =
  '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC","MS Mincho","Source Han Serif",serif';
export const FONT_UI =
  'ui-sans-serif,system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
export const FONT_MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Frame-rate independent exponential approach. */
export function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
export function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }
export function easeOutBack(t) { const u = t - 1; return 1 + u * u * (2.2 * u + 1.2); }

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fixed random table gives per-frame ink shapes that are deterministic and cost
// nothing to produce — reseed the cursor and exactly the same wobble comes back.
const RTAB = new Float32Array(2048);
{
  const r = mulberry32(0x5eed01);
  for (let i = 0; i < RTAB.length; i++) RTAB[i] = r();
}
let _rt = 0;
function rtSeed(s) { _rt = (s | 0) & 2047; }
function rt() { _rt = (_rt + 1) & 2047; return RTAB[_rt]; }

function rgbStr(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Precomputed colour ramps, so string building never happens inside update(). */
function ramp(hexA, hexB, steps) {
  const a = hexRGB(hexA), b = hexRGB(hexB), out = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    out[i] = rgbStr(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }
  return out;
}
function alphaRamp(hex, steps) {
  const c = hexRGB(hex), out = new Array(steps);
  for (let i = 0; i < steps; i++) {
    out[i] = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (i / (steps - 1)).toFixed(3) + ')';
  }
  return out;
}

const JP_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function jpNumber(n) {
  n = clamp(n | 0, 0, 999);
  if (n < 10) return JP_DIGITS[n];
  if (n < 20) return n === 10 ? '十' : '十' + JP_DIGITS[n - 10];
  if (n < 100) {
    const t = (n / 10) | 0, r = n % 10;
    return JP_DIGITS[t] + '十' + (r ? JP_DIGITS[r] : '');
  }
  const h = (n / 100) | 0, rest = n % 100;
  return JP_DIGITS[h] + '百' + (rest ? jpNumber(rest) : '');
}

// ------------------------------------------------------------------- the ink

export const Ink = {
  /** Offscreen surface authored in CSS px with a device-pixel backing store. */
  surface(cssW, cssH, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(cssW * dpr));
    c.height = Math.max(1, Math.ceil(cssH * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, g, w: cssW, h: cssH };
  },

  /** Bake a sprite: `paint(g, w, h)` runs once, the result is blitted forever. */
  sprite(cssW, cssH, dpr, paint) {
    const s = Ink.surface(cssW, cssH, dpr);
    paint(s.g, cssW, cssH);
    return s;
  },

  /** Blit a sprite with its top-left at x,y. */
  blit(g, sp, x, y, alpha) {
    if (!sp) return;
    const a = alpha === undefined ? 1 : alpha;
    if (a <= 0.002) return;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * a;
    g.drawImage(sp.c, x, y, sp.w, sp.h);
    g.globalAlpha = prev;
  },

  /** Blit a sprite centred on x,y with optional rotation and uniform scale. */
  blitC(g, sp, x, y, alpha, rot, scale) {
    if (!sp) return;
    const a = alpha === undefined ? 1 : alpha;
    if (a <= 0.002) return;
    const s = scale === undefined ? 1 : scale;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * a;
    if (rot) {
      g.translate(x, y); g.rotate(rot);
      g.drawImage(sp.c, -sp.w * 0.5 * s, -sp.h * 0.5 * s, sp.w * s, sp.h * s);
      g.rotate(-rot); g.translate(-x, -y);
    } else {
      g.drawImage(sp.c, x - sp.w * 0.5 * s, y - sp.h * 0.5 * s, sp.w * s, sp.h * s);
    }
    g.globalAlpha = prev;
  },

  /**
   * Punch paper grain out of whatever has been drawn so far. Only ever called
   * while baking a sprite — it is far too many small paths for a live frame.
   */
  grain(g, w, h, amount, seed, dotMax) {
    const r = mulberry32(seed | 0);
    const n = Math.min(2600, Math.round(w * h * 0.055 * amount));
    const dm = dotMax || 1.6;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h;
      const rad = 0.22 + r() * dm;
      g.globalAlpha = 0.05 + r() * 0.30;
      g.beginPath();
      g.arc(x, y, rad, 0, 6.2831853);
      g.fill();
    }
    g.restore();
  },

  /**
   * One brush stroke from a to b: fat in the middle, tapered to a point at both
   * ends, with an irregular edge so it never reads as a rectangle.
   */
  stroke(g, x0, y0, x1, y1, width, wobble, seg) {
    const n = seg || 14;
    const wob = wobble === undefined ? 0.34 : wobble;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const taper = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.5);
      const w = width * 0.5 * taper * (1 - wob * 0.5 + wob * rt());
      const px = x0 + dx * t + nx * w + (rt() - 0.5) * width * 0.16;
      const py = y0 + dy * t + ny * w + (rt() - 0.5) * width * 0.16;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const taper = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.5);
      const w = width * 0.5 * taper * (1 - wob * 0.5 + wob * rt());
      const px = x0 + dx * t - nx * w + (rt() - 0.5) * width * 0.16;
      const py = y0 + dy * t - ny * w + (rt() - 0.5) * width * 0.16;
      g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  },

  /** The same brush, bent around an arc. Angles in radians, +x is 0. */
  arcStroke(g, cx, cy, r, a0, a1, width, wobble, taperEnds, seg) {
    const n = seg || 22;
    const wob = wobble === undefined ? 0.3 : wobble;
    const da = a1 - a0;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + da * t;
      const taper = taperEnds === false ? 1 : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.42);
      const w = width * 0.5 * taper * (1 - wob * 0.5 + wob * rt());
      const rr = r + w + (rt() - 0.5) * width * 0.2;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, a = a0 + da * t;
      const taper = taperEnds === false ? 1 : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.42);
      const w = width * 0.5 * taper * (1 - wob * 0.5 + wob * rt());
      const rr = r - w + (rt() - 0.5) * width * 0.2;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  },

  /** An irregular filled blob — the base of every seal and stamp. */
  blob(g, cx, cy, rx, ry, roughness, seg) {
    const n = seg || 26;
    const k = roughness === undefined ? 0.09 : roughness;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 6.2831853;
      const j = 1 + (rt() - 0.5) * 2 * k;
      const px = cx + Math.cos(a) * rx * j, py = cy + Math.sin(a) * ry * j;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  },

  /** Ragged-edged rectangle: menu panels, cards, seals. */
  ragRect(g, x, y, w, h, rough, step) {
    const st = step || 14;
    g.beginPath();
    const edge = (ax, ay, bx, by, first) => {
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const n = Math.max(2, Math.round(len / st));
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const o = (rt() - 0.5) * 2 * rough;
        const px = ax + (bx - ax) * t + nx * o, py = ay + (by - ay) * t + ny * o;
        if (first && i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    };
    edge(x, y, x + w, y, true);
    edge(x + w, y, x + w, y + h, false);
    edge(x + w, y + h, x, y + h, false);
    edge(x, y + h, x, y, false);
    g.closePath();
    g.fill();
  },

  /** Stack characters down the page, centred on `x`. Returns the height used. */
  vertText(g, text, x, y, size, lineGap) {
    const gap = lineGap === undefined ? size * 1.14 : lineGap;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < text.length; i++) {
      g.fillText(text[i], x, y + i * gap + size * 0.5);
    }
    return text.length * gap;
  },

  /** Reseed the shared ink noise cursor (exported for the other UI surfaces). */
  seed(s) { rtSeed(s); },
  rand() { return rt(); },
};

// ------------------------------------------------------------------ scratch

const _v3 = new Vector3();
const _q = new Quaternion();

const HEALTH_RAMP = ramp('#7a0d12', '#c8321e', 12);
const POSTURE_RAMP = ramp('#8c5a2a', '#c9a227', 12);
const BONE_A = alphaRamp('#f2e3cf', 12);

const STANCES = [
  { key: 'seigan', kanji: '正', romaji: 'seigan' },
  { key: 'jodan', kanji: '上', romaji: 'jodan' },
  { key: 'gedan', kanji: '下', romaji: 'gedan' },
];
const STAMPS = ['一閃', '連撃', '必殺'];
/** Objectives are short by design; the column is sized for exactly this many. */
const OBJ_MAX = 7;

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;

    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.s = 1;                       // UI scale
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };

    /** Master fade, driven by Menus during the opening title card. */
    this.alpha = 1;
    this.fancy = true;
    this.time = 0;
    this.demoMode = false;

    // Live sampled state — written in place every frame, never reallocated.
    this.v = {
      health: 1, posture: 0, postureDisp: 0, stance: 0, lowPulse: 0,
      hasTarget: false, tHealth: 1, tPosture: 0,
    };
    this.demo = {
      health: 0.52, posture: 0.63, stance: 1,
      objective: '鳥居を抜けよ', objectiveSub: 'pass beneath the torii',
    };

    // ---- animation state (all scalars — no allocation in update) ----
    this._chip = 1;
    this._chipHold = 0;
    this._breakFlash = 0;
    this._parry = 0;
    this._parryPerfect = 0;
    this._retSpring = 1;
    this._retVel = 0;
    this._retAngle = 0;
    this._lastTargetId = -1;
    this._targetFade = 0;
    this._targetX = 0;
    this._targetY = 0;
    this._targetInit = false;
    this._sx = 0; this._sy = 0;
    this._behind = false; this._onScreen = false;

    this._stampIndex = -1;
    this._stampLife = 0;
    this._stampNumeral = '';
    this._combo = 0;
    this._comboTimer = 0;

    this._objText = '';
    this._objSub = '';
    this._objLife = 0;
    this._objIn = 0;
    this._objDirty = false;

    // Damage-direction marks (fixed pool: angle, life, strength).
    this._marks = new Float32Array(8 * 3);
    this._markHead = 0;

    // Posture shatter shards (fixed pool: x, y, vx, vy, spin, len).
    this._shards = new Float32Array(18 * 6);
    this._shardLife = 0;

    this._dbgTimer = 0;
    this._hudMs = 0;
    this._demoTarget = false;
    this._fake = null;

    this._sprites = {};
    this._bound = [];
    this._lastW = -1; this._lastH = -1; this._lastDpr = -1;
  }

  // ---------------------------------------------------------------- lifecycle

  async init() {
    const c = document.createElement('canvas');
    c.id = 'kagerou-hud';
    const st = c.style;
    st.position = 'fixed';
    st.left = '0'; st.top = '0'; st.right = '0'; st.bottom = '0';
    st.width = '100%'; st.height = '100%';
    st.display = 'block';
    st.pointerEvents = 'none';
    st.zIndex = '10';
    st.touchAction = 'none';
    document.body.appendChild(c);
    this.canvas = c;
    this.g = c.getContext('2d', { alpha: true, desynchronized: true });

    // A hidden probe is the only reliable way to read env() insets from script.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    this._probe = probe;

    this.ink = Ink;
    this.palette = PALETTE;

    this.touch = new TouchControls(this.ctx, this);
    this.ctx.touch = this.touch;
    await this.touch.init();

    this._listen();
    this.resize(this.w, this.h);
    return this;
  }

  _on(name, fn) {
    const off = this.ctx.bus?.on(name, fn);
    if (off) this._bound.push(off);
  }

  _listen() {
    this._on('damage-taken', (p) => {
      if (!p) return;
      const player = this.ctx.player;
      if (player && p.entity && p.entity !== player) return;
      this._pushMark(p.direction, clamp01((p.amount || 12) / 40));
      this._chipHold = 0.16;
    });
    this._on('parry', (p) => {
      const player = this.ctx.player;
      if (player && p?.defender && p.defender !== player) return;
      this._parry = 1;
      this._parryPerfect = p?.perfect ? 1 : 0;
      if (p?.perfect) this._stamp(0);
    });
    this._on('posture-break', (p) => {
      const player = this.ctx.player;
      this._breakFlash = (p?.entity && player && p.entity === player) ? 1 : 0.7;
      this._shatter();
    });
    this._on('hit', (p) => {
      if (!p) return;
      const player = this.ctx.player;
      const mine = player ? p.attacker === player : p.attacker?.faction === 'player';
      if (!mine) return;
      this._combo++;
      this._comboTimer = 1.7;
      if (p.crit) this._stamp(0);
      else if (this._combo >= 3 && this._combo % 3 === 0) this._stamp(1);
    });
    this._on('death', (p) => {
      const ent = p?.entity;
      if (!ent) return;
      if (ent === this.ctx.player || ent.faction === 'player') return;
      this._stamp(2);
    });
    this._on('stance-change', (p) => {
      const player = this.ctx.player;
      if (player && p?.entity && p.entity !== player) return;
      this.setStance(p?.stance);
    });
    this._on('objective', (p) => {
      if (p) this.setObjective(p.text, p.sub);
    });
  }

  dispose() {
    for (let i = 0; i < this._bound.length; i++) {
      try { this._bound[i](); } catch { /* handler already gone */ }
    }
    this._bound.length = 0;
    this.touch?.dispose?.();
    this.canvas?.remove();
    this._probe?.remove();
    this.canvas = null;
    this.g = null;
    this._sprites = {};
  }

  applyQuality(q) {
    // Grain and multi-pass ink are cached, so the only real lever left is how
    // much live path work we allow per frame.
    this.fancy = (q?.tier ?? 3) >= 1;
    this.touch?.applyQuality?.(q);
  }

  // ------------------------------------------------------------------ layout

  /** Force a full re-bake (layout-affecting setting changed, e.g. left-handed). */
  relayout() {
    this._lastW = -1;
    this.resize(this.w, this.h);
  }

  resize(w, h) {
    const nw = Math.max(1, w || window.innerWidth);
    const nh = Math.max(1, h || window.innerHeight);
    const ndpr = Math.min(window.devicePixelRatio || 1, 2);
    // The engine re-resizes every time the adaptive scaler moves the render
    // scale; re-baking 27 offscreen canvases for that would be pure waste.
    if (nw === this._lastW && nh === this._lastH && ndpr === this._lastDpr) return;
    this._lastW = nw; this._lastH = nh; this._lastDpr = ndpr;
    this.w = nw; this.h = nh; this.dpr = ndpr;

    if (this.canvas) {
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
    }

    if (this._probe) {
      const cs = getComputedStyle(this._probe);
      this.safe.top = parseFloat(cs.paddingTop) || 0;
      this.safe.right = parseFloat(cs.paddingRight) || 0;
      this.safe.bottom = parseFloat(cs.paddingBottom) || 0;
      this.safe.left = parseFloat(cs.paddingLeft) || 0;
    }
    // Notched phones in landscape report the inset on one side only; pad both so
    // the layout does not visibly jump when the device is flipped.
    const sideMax = Math.max(this.safe.left, this.safe.right);
    this.safe.left = Math.max(this.safe.left, sideMax);
    this.safe.right = Math.max(this.safe.right, sideMax);

    this.s = clamp(Math.min(this.w * 0.55, this.h) / 430, 0.8, 1.35);

    this._buildSprites();
    this.touch?.resize?.(this.w, this.h);
  }

  get uiScale() { return this.s; }

  setAlpha(a) { this.alpha = clamp01(a); }

  // ----------------------------------------------------------- sprite baking

  _buildSprites() {
    const d = this.dpr, s = this.s, sp = this._sprites;

    // --- health column -------------------------------------------------------
    const hw = 17 * s, hh = 176 * s;
    sp.health = Ink.sprite(hw, hh, d, (g, W, H) => {
      rtSeed(11);
      const cx = W * 0.5, top = 4 * s, bot = H - 4 * s;
      g.fillStyle = PALETTE.ink;
      // A spine plus stacked dashes: reads as a column of brush marks, not a bar.
      Ink.stroke(g, cx, top + 3 * s, cx, bot - 3 * s, hw * 0.46, 0.5, 20);
      const rows = 9;
      for (let i = 0; i < rows; i++) {
        const t = i / (rows - 1);
        const y = lerp(bot - 6 * s, top + 6 * s, t);
        const wgt = (0.6 + rt() * 0.4) * hw;
        const tilt = (rt() - 0.5) * 3 * s;
        Ink.stroke(g, cx - wgt * 0.5, y + tilt, cx + wgt * 0.5, y - tilt, 5.4 * s, 0.45, 8);
      }
      Ink.grain(g, W, H, 1.15, 0x1a2b, 1.5);
    });

    sp.healthTrack = Ink.sprite(hw, hh, d, (g, W, H) => {
      rtSeed(37);
      g.fillStyle = 'rgba(242,227,207,0.13)';
      Ink.stroke(g, W * 0.5, 5 * s, W * 0.5, H - 5 * s, hw * 0.86, 0.4, 22);
      Ink.grain(g, W, H, 1.4, 0x77aa, 1.9);
    });

    // --- lock-on reticle -----------------------------------------------------
    const rr = 34 * s;
    sp.reticle = Ink.sprite(rr * 2 + 16 * s, rr * 2 + 16 * s, d, (g, W, H) => {
      rtSeed(101);
      const cx = W * 0.5, cy = H * 0.5;
      g.fillStyle = 'rgba(242,227,207,0.72)';
      for (let i = 0; i < 4; i++) {
        const a0 = i * 1.5707963 + 0.22;
        Ink.arcStroke(g, cx, cy, rr, a0, a0 + 1.13, 1.9 * s, 0.55, true, 14);
      }
      g.fillStyle = PALETTE.vermilion;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.5707963 - 0.7853982;
        Ink.stroke(g,
          cx + Math.cos(a) * (rr - 5 * s), cy + Math.sin(a) * (rr - 5 * s),
          cx + Math.cos(a) * (rr + 6 * s), cy + Math.sin(a) * (rr + 6 * s),
          3.1 * s, 0.5, 7);
      }
      Ink.grain(g, W, H, 0.8, 0x33cc, 1.2);
    });

    // --- directional damage smear -------------------------------------------
    const dw = 210 * s, dh = 62 * s;
    sp.smear = Ink.sprite(dw, dh, d, (g, W, H) => {
      rtSeed(213);
      const grd = g.createLinearGradient(0, H, 0, 0);
      grd.addColorStop(0, 'rgba(200,50,30,0.92)');
      grd.addColorStop(0.55, 'rgba(122,13,18,0.40)');
      grd.addColorStop(1, 'rgba(122,13,18,0)');
      g.fillStyle = grd;
      const R = H * 3.4;
      Ink.arcStroke(g, W * 0.5, H + R - 6 * s, R, -Math.PI * 0.60, -Math.PI * 0.40,
        H * 1.35, 0.4, true, 26);
      Ink.grain(g, W, H, 1.5, 0x99ff, 2.4);
    });

    // --- perfect-parry splash ------------------------------------------------
    const ps = 300 * s;
    sp.splash = Ink.sprite(ps, ps, d, (g, W, H) => {
      rtSeed(404);
      const cx = W * 0.5, cy = H * 0.5;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.5);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.32, 'rgba(242,227,207,0.40)');
      grd.addColorStop(1, 'rgba(242,227,207,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cy, W * 0.5, 0, 6.2831853); g.fill();
      g.fillStyle = 'rgba(255,252,246,0.9)';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * 6.2831853 + rt() * 0.18;
        const r0 = W * (0.12 + rt() * 0.06), r1 = W * (0.26 + rt() * 0.22);
        Ink.stroke(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
          cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, (1.4 + rt() * 3.4) * s, 0.7, 6);
      }
      Ink.grain(g, W, H, 0.9, 0xbeef, 2.0);
    });

    // --- stance seals --------------------------------------------------------
    const ss = 38 * s;
    sp.stance = STANCES.map((st, i) => Ink.sprite(ss, ss, d, (g, W, H) => {
      rtSeed(500 + i * 17);
      g.fillStyle = PALETTE.vermilion;
      Ink.ragRect(g, 2.5 * s, 2.5 * s, W - 5 * s, H - 5 * s, 1.4 * s, 7 * s);
      // Knock the kanji out of the seal so the paper shows through, as a real
      // hanko does — far more convincing than white text on red.
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.font = `600 ${Math.round(H * 0.62)}px ${FONT_JP}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st.kanji, W * 0.5, H * 0.54);
      g.globalCompositeOperation = 'source-over';
      Ink.grain(g, W, H, 1.6, 0x5a5a + i, 1.7);
    }));

    // --- combo / kill stamps -------------------------------------------------
    const stW = 74 * s, stH = 152 * s;
    sp.stamps = STAMPS.map((txt, i) => Ink.sprite(stW, stH, d, (g, W, H) => {
      rtSeed(700 + i * 31);
      const size = Math.round(52 * s);
      g.font = `600 ${size}px ${FONT_JP}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // Ink ghost behind, colour on top: the mark bleeds like wet sumi.
      g.fillStyle = 'rgba(20,17,16,0.75)';
      for (let k = 0; k < txt.length; k++) {
        g.fillText(txt[k], W * 0.5 + 1.6 * s, size * 0.62 + k * size * 1.16 + 1.6 * s);
      }
      g.fillStyle = i === 2 ? PALETTE.vermilion : PALETTE.bone;
      for (let k = 0; k < txt.length; k++) {
        g.fillText(txt[k], W * 0.5, size * 0.62 + k * size * 1.16);
      }
      g.fillStyle = i === 2 ? PALETTE.vermilion : 'rgba(242,227,207,0.6)';
      Ink.stroke(g, W * 0.5 - 15 * s, H - 13 * s, W * 0.5 + 15 * s, H - 15 * s, 3.4 * s, 0.5, 8);
      Ink.grain(g, W, H, 1.3, 0xa100 + i, 1.9);
    }));

    // --- objective plate (repainted in place when the objective changes) -----
    // Sized to exactly OBJ_MAX glyphs so the column cannot reach down into the
    // top button of the thumb arc on a short landscape phone.
    const objW = 48 * s, objH = Math.round((OBJ_MAX * 17 * 1.22 + 26) * s);
    if (!sp.objective || sp.objective.w !== objW || sp.objective.h !== objH) {
      sp.objective = Ink.surface(objW, objH, d);
    }
    this._objDirty = true;

    // --- locked-target bar frame --------------------------------------------
    const ebW = 104 * s, ebH = 22 * s;
    this._enemyBarW = ebW;
    sp.enemyFrame = Ink.sprite(ebW + 10 * s, ebH, d, (g, W, H) => {
      rtSeed(880);
      g.fillStyle = 'rgba(242,227,207,0.16)';
      Ink.stroke(g, 5 * s, 6 * s, W - 5 * s, 6 * s, 5.4 * s, 0.4, 16);
      g.fillStyle = 'rgba(242,227,207,0.10)';
      Ink.stroke(g, 8 * s, 14 * s, W - 8 * s, 14 * s, 3.2 * s, 0.4, 14);
      Ink.grain(g, W, H, 1.5, 0xd00d, 1.4);
    });

    // --- posture arc track ---------------------------------------------------
    this._postR = 108 * s;
    this._postCX = this.w * 0.5;
    this._postCY = this.h * 0.5 + 132 * s;
    const paW = this._postR * 2 + 30 * s, paH = 74 * s;
    this._postAnchorY = paH - 6 * s;              // arc circle-centre inside sprite
    sp.postureTrack = Ink.sprite(paW, paH, d, (g, W, H) => {
      rtSeed(950);
      const cx = W * 0.5, cy = this._postAnchorY;
      g.fillStyle = 'rgba(242,227,207,0.20)';
      Ink.arcStroke(g, cx, cy, this._postR, -Math.PI * 0.735, -Math.PI * 0.265, 5.2 * s, 0.34, true, 30);
      g.fillStyle = 'rgba(20,17,16,0.5)';
      Ink.arcStroke(g, cx, cy, this._postR, -Math.PI * 0.735, -Math.PI * 0.265, 2.8 * s, 0.34, true, 30);
      Ink.grain(g, W, H, 1.2, 0x2468, 1.6);
    });

    // --- debug plate (repainted in place, never reallocated) ------------------
    if (!sp.debug) sp.debug = Ink.surface(216, 96, d);
  }

  // -------------------------------------------------------------- public API

  setObjective(text, sub) {
    if (!text) return;
    this._objText = String(text);
    this._objSub = sub ? String(sub) : '';
    this._objLife = 7.5;
    this._objIn = 0;
    this._objDirty = true;
  }

  setStance(stance) {
    if (stance === undefined || stance === null) return;
    if (typeof stance === 'number') { this.v.stance = clamp(stance | 0, 0, 2); return; }
    const k = String(stance).toLowerCase();
    for (let i = 0; i < STANCES.length; i++) {
      if (STANCES[i].key === k || STANCES[i].kanji === stance) { this.v.stance = i; return; }
    }
  }

  /** Fire a combo/kill stamp by index (0 一閃, 1 連撃, 2 必殺). */
  stamp(index) { this._stamp(index); }

  /** Populate the HUD with a believable mid-combat state for the capture rig. */
  __demo() {
    this.demoMode = true;
    this.alpha = 1;
    this.v.stance = this.demo.stance;
    this._chip = 0.78;
    this._chipHold = 999;
    this._combo = 4;
    this._comboTimer = 999;
    this._stamp(1);
    this._stampLife = 0.72;
    this.setObjective(this.demo.objective, this.demo.objectiveSub);
    this._objLife = 999;
    this._pushMarkAngle(-2.35, 0.85);
    this._marks[1] = 0.75;
    this._pushMarkAngle(1.15, 0.5);
    this._marks[4] = 0.45;
    this._demoTarget = true;
    this.touch?.__demo?.();
    return this;
  }

  // ------------------------------------------------------------------ events

  _stamp(index) {
    this._stampIndex = clamp(index | 0, 0, STAMPS.length - 1);
    this._stampLife = 1.15;
    this._stampNumeral = this._combo >= 2 ? jpNumber(this._combo) : '';
  }

  _pushMark(dir, strength) {
    let ang = 0;
    const cam = this.ctx.camera;
    if (dir && cam) {
      // `direction` runs from the source toward the victim, so the bearing back
      // to the source is the negated vector expressed in camera space.
      _v3.set(-(dir.x || 0), 0, -(dir.z || 0));
      if (_v3.lengthSq() < 1e-6) _v3.set(0, 0, -1);
      _q.copy(cam.quaternion).invert();
      _v3.applyQuaternion(_q);
      ang = Math.atan2(_v3.x, -_v3.z);
    }
    this._pushMarkAngle(ang, strength);
  }

  _pushMarkAngle(ang, strength) {
    const i = this._markHead * 3;
    this._marks[i] = ang;
    this._marks[i + 1] = 1;
    this._marks[i + 2] = clamp(strength || 0.5, 0.25, 1);
    this._markHead = (this._markHead + 1) % 8;
  }

  _shatter() {
    const n = this._shards.length / 6;
    rtSeed(1234);
    const cx = this._postCX, cy = this._postCY, r = this._postR;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const a = lerp(-Math.PI * 0.735, -Math.PI * 0.265, i / (n - 1));
      this._shards[o] = cx + Math.cos(a) * r;
      this._shards[o + 1] = cy + Math.sin(a) * r;
      this._shards[o + 2] = Math.cos(a) * (90 + rt() * 190) + (rt() - 0.5) * 90;
      this._shards[o + 3] = Math.sin(a) * (90 + rt() * 190) - 40;
      this._shards[o + 4] = (rt() - 0.5) * 9;
      this._shards[o + 5] = 0.55 + rt() * 0.45;
    }
    this._shardLife = 1;
  }

  // --------------------------------------------------------------- per frame

  _read(dt) {
    const c = this.ctx, v = this.v;
    const p = c.player;

    const maxH = (p && p.maxHealth) || 100;
    v.health = (p && typeof p.health === 'number') ? clamp01(p.health / maxH) : this.demo.health;
    const maxP = (p && p.maxPosture) || 100;
    v.posture = (p && typeof p.posture === 'number') ? clamp01(p.posture / maxP) : this.demo.posture;

    if (p && p.stance !== undefined) this.setStance(p.stance);

    // White chip: hold briefly, then drain to the real value over ~0.4 s.
    if (this._chip < v.health) this._chip = v.health;
    if (this._chipHold > 0) this._chipHold -= dt;
    else if (this._chip > v.health) this._chip = Math.max(v.health, this._chip - dt * 0.62);

    v.postureDisp = damp(v.postureDisp, v.posture, 12, dt);
    v.lowPulse = v.health < 0.3
      ? (Math.sin(this.time * 5.2) * 0.5 + 0.5) * (1 - v.health / 0.3) : 0;

    if (this._comboTimer > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) this._combo = 0;
    }

    // ---- lock-on target ----
    const t = this._lockTarget();
    v.hasTarget = false;
    if (t) {
      const id = t.id !== undefined ? t.id : 0;
      if (id !== this._lastTargetId) {
        this._lastTargetId = id;
        this._retSpring = 1.75;
        this._retVel = 0;
        this._targetInit = false;
      }
      const maxTH = t.maxHealth || 100, maxTP = t.maxPosture || 100;
      v.tHealth = clamp01((t.health !== undefined ? t.health : maxTH) / maxTH);
      v.tPosture = clamp01((t.posture !== undefined ? t.posture : 0) / maxTP);
      v.hasTarget = this._project(t);
    } else {
      this._lastTargetId = -1;
    }
    this._targetFade = damp(this._targetFade, v.hasTarget ? 1 : 0, 11, dt);

    // Reticle: critically-ish damped spring back to 1 after a target swap.
    this._retVel += (1 - this._retSpring) * 190 * dt;
    this._retVel -= this._retVel * 21 * dt;
    this._retSpring += this._retVel * dt;
    this._retAngle += dt * 0.24;
    if (this._retAngle > 6.2831853) this._retAngle -= 6.2831853;

    // Decays.
    if (this._parry > 0) this._parry = Math.max(0, this._parry - dt / 0.16);
    if (this._breakFlash > 0) this._breakFlash = Math.max(0, this._breakFlash - dt * 1.6);
    if (this._stampLife > 0) this._stampLife = Math.max(0, this._stampLife - dt);
    if (this._objLife > 0) {
      this._objLife -= dt;
      this._objIn = damp(this._objIn, 1, 6, dt);
    } else {
      this._objIn = damp(this._objIn, 0, 5, dt);
    }
    if (this._shardLife > 0) this._shardLife = Math.max(0, this._shardLife - dt * 1.15);
    for (let i = 0; i < 8; i++) {
      const o = i * 3 + 1;
      if (this._marks[o] > 0) this._marks[o] = Math.max(0, this._marks[o] - dt * 1.15);
    }
  }

  _lockTarget() {
    const c = this.ctx;
    const t = c.player?.lockTarget || c.player?.target ||
      c.combat?.lockTarget || c.playerCamera?.lockTarget ||
      c.enemies?.lockTarget || null;
    if (t && (t.isAlive === undefined || t.isAlive)) return t;
    if (this._demoTarget) {
      const list = c.enemies?.list || c.enemies?.enemies;
      if (Array.isArray(list) && list.length) return list[0];
      return this._fakeTarget();
    }
    return null;
  }

  /** A synthetic target so `__demo()` can show the lock-on furniture headless. */
  _fakeTarget() {
    if (!this._fake) {
      this._fake = {
        id: -99, faction: 'oni', health: 62, maxHealth: 100,
        posture: 74, maxPosture: 100, height: 1.8, isAlive: true,
        __screenX: 0.60, __screenY: 0.40,
      };
    }
    return this._fake;
  }

  /** Project the target's head into screen space. Returns false if unprojectable. */
  _project(t) {
    if (t.__screenX !== undefined) {
      this._sx = this.w * t.__screenX;
      this._sy = this.h * t.__screenY;
      this._behind = false;
      this._onScreen = true;
      return true;
    }
    const cam = this.ctx.camera;
    const pos = t.position || t.root?.position;
    if (!cam || !pos) return false;
    _v3.set(pos.x, pos.y + (t.height || 1.75) * 1.08, pos.z);
    _v3.project(cam);
    this._behind = _v3.z > 1;
    const x = (_v3.x * 0.5 + 0.5) * this.w;
    const y = (-_v3.y * 0.5 + 0.5) * this.h;
    // Behind the camera the projection mirrors; flip it so the off-screen arrow
    // still points at the real bearing instead of the antipode.
    this._sx = this._behind ? this.w - x : x;
    this._sy = this._behind ? this.h * 0.92 : y;
    const m = 26 * this.s;
    this._onScreen = !this._behind && x > m && x < this.w - m && y > m && y < this.h - m;
    return true;
  }

  update(dt, elapsed, rawDt) {
    const g = this.g;
    if (!g) return;
    const debug = !!this.ctx.debug;
    const t0 = debug ? performance.now() : 0;
    const rd = Math.min(rawDt === undefined ? 0.0166 : rawDt, 0.1);
    this.time += rd;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    this._read(rd);

    const a = this.alpha;
    if (a > 0.004) {
      g.globalAlpha = a;
      this._drawHealth();
      this._drawStance();
      this._drawPosture();
      this._drawTarget(rd);
      this._drawMarks();
      this._drawStamp();
      this._drawObjective();
      this._drawParry();
      g.globalAlpha = 1;
    }

    this.touch?.update(rd, g);

    if (debug) {
      this._drawDebug(rd);
      this._hudMs = this._hudMs * 0.9 + (performance.now() - t0) * 0.1;
    }
  }

  // --------------------------------------------------------------- 1. health

  _drawHealth() {
    const g = this.g, s = this.s, v = this.v, sp = this._sprites;
    if (!sp.health) return;
    const mirror = this.ctx.settings?.leftHanded === true;
    const w = sp.health.w, h = sp.health.h;
    const x = mirror ? this.w - this.safe.right - 22 * s - w : this.safe.left + 22 * s;
    const y = this.h - this.safe.bottom - 26 * s - h;

    Ink.blit(g, sp.healthTrack, x, y, 1);

    const chipTop = y + h * (1 - this._chip);
    const realTop = y + h * (1 - v.health);

    // White chip — the damage taken but not yet conceded.
    if (this._chip > v.health + 0.002) {
      g.save();
      g.beginPath();
      g.rect(x - 2, chipTop, w + 4, realTop - chipTop);
      g.clip();
      Ink.blit(g, sp.health, x, y, 1);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(248,244,236,0.92)';
      g.fillRect(x - 2, chipTop, w + 4, realTop - chipTop);
      g.restore();
    }

    // The real ink column.
    g.save();
    g.beginPath();
    g.rect(x - 2, realTop, w + 4, y + h - realTop + 2);
    g.clip();
    Ink.blit(g, sp.health, x, y, 1);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = HEALTH_RAMP[Math.round((1 - v.health) * (HEALTH_RAMP.length - 1))];
    g.globalAlpha = g.globalAlpha * clamp01(0.30 + 0.42 * (1 - v.health) + v.lowPulse * 0.30);
    g.fillRect(x - 2, realTop, w + 4, y + h - realTop + 2);
    g.restore();

    // The edge frays and bleeds as the column empties.
    const fray = 1 - v.health;
    if (fray > 0.03) {
      const room = Math.max(2, y + h - realTop);
      rtSeed(64);
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      for (let i = 0; i < 7; i++) {
        const ny = realTop + rt() * Math.min(34 * s, room);
        const depth = (0.18 + rt() * 0.72) * fray * w * 0.95;
        const right = rt() < 0.5;
        const nx = right ? x + w : x;
        Ink.stroke(g, nx, ny, nx + (right ? -depth : depth), ny + (rt() - 0.5) * 8 * s,
          (2 + rt() * 5) * s, 0.6, 6);
      }
      // A ragged waterline where the ink stops.
      Ink.stroke(g, x - 1, realTop + 1.5 * s, x + w + 1, realTop + (rt() - 0.5) * 3 * s,
        (2.4 + fray * 5) * s, 0.8, 9);
      g.restore();

      // …and it bleeds a little where it tore.
      g.save();
      g.globalAlpha = g.globalAlpha * clamp01(fray * 0.85);
      g.fillStyle = PALETTE.blood;
      rtSeed(64);
      Ink.stroke(g, x + w * 0.18, realTop + 2 * s, x + w * 0.86, realTop + 5 * s, 2.6 * s, 0.7, 8);
      g.restore();
    }
  }

  // --------------------------------------------------------------- 8. stance

  _drawStance() {
    const g = this.g, s = this.s, sp = this._sprites;
    if (!sp.stance || !sp.health) return;
    const seal = sp.stance[this.v.stance] || sp.stance[0];
    const mirror = this.ctx.settings?.leftHanded === true;
    const gap = sp.health.w + 14 * s;
    const x = mirror
      ? this.w - this.safe.right - 22 * s - gap - seal.w
      : this.safe.left + 22 * s + gap;
    const y = this.h - this.safe.bottom - 26 * s - seal.h;
    Ink.blit(g, seal, x, y, 0.92);

    g.save();
    g.globalAlpha = g.globalAlpha * 0.4;
    g.fillStyle = PALETTE.bone;
    g.font = `500 ${Math.round(8 * s)}px ${FONT_UI}`;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(STANCES[this.v.stance].romaji, x + seal.w * 0.5, y + seal.h + 5 * s);
    g.restore();
  }

  // -------------------------------------------------------------- 2. posture

  _drawPosture() {
    const g = this.g, s = this.s, v = this.v, sp = this._sprites;
    if (!sp.postureTrack) return;
    const cx = this._postCX, cy = this._postCY, r = this._postR;

    Ink.blit(g, sp.postureTrack, cx - sp.postureTrack.w * 0.5, cy - this._postAnchorY, 0.9);

    const near = clamp01((v.postureDisp - 0.6) / 0.4);
    if (v.postureDisp > 0.004 && this._shardLife <= 0) {
      const half = (Math.PI * 0.235) * v.postureDisp;
      g.save();
      rtSeed(300);
      g.fillStyle = POSTURE_RAMP[Math.round(near * (POSTURE_RAMP.length - 1))];
      Ink.arcStroke(g, cx, cy, r, -Math.PI * 0.5 - half, -Math.PI * 0.5 + half,
        (4.6 + near * 2.6) * s, 0.3, true, 24);
      // Near break the gauge crackles: gold ticks re-jittering at ~14 Hz.
      if (near > 0.25 && this.fancy) {
        rtSeed(((this.time * 14) | 0) * 7);
        g.fillStyle = PALETTE.gold;
        g.globalAlpha = g.globalAlpha * (0.35 + near * 0.6);
        const ticks = 3 + ((near * 5) | 0);
        for (let i = 0; i < ticks; i++) {
          const a = -Math.PI * 0.5 + (rt() - 0.5) * 2 * half;
          const r0 = r - (3 + rt() * 5) * s, r1 = r + (4 + rt() * 11) * s * near;
          Ink.stroke(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
            cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, (1.1 + rt() * 1.6) * s, 0.7, 5);
        }
      }
      g.restore();
    }

    // Shatter: on break the arc bursts into shards that fly out and fall.
    if (this._shardLife > 0) {
      const t = 1 - this._shardLife;
      const n = this._shards.length / 6;
      g.save();
      g.globalAlpha = g.globalAlpha * this._shardLife;
      g.fillStyle = PALETTE.gold;
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        const px = this._shards[o] + this._shards[o + 2] * t * s * 0.55;
        const py = this._shards[o + 1] + this._shards[o + 3] * t * s * 0.55 + 220 * t * t * s * 0.35;
        const rot = this._shards[o + 4] * t;
        const len = this._shards[o + 5] * 15 * s;
        const c = Math.cos(rot), sn = Math.sin(rot);
        g.beginPath();
        g.moveTo(px - c * len, py - sn * len);
        g.lineTo(px + c * len, py + sn * len);
        g.lineTo(px + c * len - sn * 3 * s, py + sn * len + c * 3 * s);
        g.lineTo(px - c * len - sn * 3.4 * s, py - sn * len + c * 3.4 * s);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    if (this._breakFlash > 0) {
      g.save();
      g.globalAlpha = g.globalAlpha * this._breakFlash * 0.9;
      g.fillStyle = PALETTE.gold;
      g.font = `600 ${Math.round(20 * s)}px ${FONT_JP}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('崩', cx, cy - r - 22 * s);
      g.restore();
    }
  }

  // ---------------------------------------------------- 3+4. target + reticle

  _drawTarget(dt) {
    const g = this.g, s = this.s, v = this.v, sp = this._sprites;
    const fade = this._targetFade;
    if (fade < 0.01 || !v.hasTarget) return;

    // Ease the marker toward the projected point so a physics spike never snaps it.
    if (!this._targetInit) {
      this._targetX = this._sx; this._targetY = this._sy; this._targetInit = true;
    } else {
      this._targetX = damp(this._targetX, this._sx, 26, dt);
      this._targetY = damp(this._targetY, this._sy, 26, dt);
    }

    const m = 30 * s;
    const cx = clamp(this._targetX, m + this.safe.left, this.w - m - this.safe.right);
    const cy = clamp(this._targetY, m + this.safe.top, this.h - m - this.safe.bottom);

    g.save();
    g.globalAlpha = g.globalAlpha * fade;

    if (!this._onScreen) {
      // Off-screen: a small ink arrow at the clamped edge position.
      const ang = Math.atan2(this._targetY - this.h * 0.5, this._targetX - this.w * 0.5);
      g.translate(cx, cy); g.rotate(ang);
      g.fillStyle = PALETTE.vermilion;
      g.beginPath();
      g.moveTo(12 * s, 0); g.lineTo(-6 * s, -7.5 * s); g.lineTo(-2.5 * s, 0); g.lineTo(-6 * s, 7.5 * s);
      g.closePath(); g.fill();
      g.restore();
      return;
    }

    Ink.blitC(g, sp.reticle, cx, cy + 16 * s, 0.95, this._retAngle, this._retSpring);

    // Health and posture, just above the projected head.
    const bw = this._enemyBarW;
    const bx = cx - bw * 0.5, by = cy - 26 * s;
    Ink.blit(g, sp.enemyFrame, bx - 5 * s, by, 0.95);

    rtSeed(57);
    g.fillStyle = PALETTE.vermilion;
    if (v.tHealth > 0.004) {
      Ink.stroke(g, bx, by + 6 * s, bx + bw * v.tHealth, by + 6 * s, 4.6 * s, 0.28, 12);
    }
    if (v.tPosture > 0.004) {
      const pn = clamp01((v.tPosture - 0.6) / 0.4);
      g.fillStyle = POSTURE_RAMP[Math.round(pn * (POSTURE_RAMP.length - 1))];
      const halfW = (bw - 6 * s) * 0.5 * v.tPosture;
      Ink.stroke(g, cx - halfW, by + 14 * s, cx + halfW, by + 14 * s, 2.9 * s, 0.28, 10);
    }
    g.restore();
  }

  // --------------------------------------------------- 5. directional damage

  _drawMarks() {
    const g = this.g, sp = this._sprites;
    if (!sp.smear) return;
    const cx = this.w * 0.5, cy = this.h * 0.5;
    const rad = Math.min(this.w, this.h) * 0.5 - sp.smear.h * 0.42;
    for (let i = 0; i < 8; i++) {
      const o = i * 3;
      const life = this._marks[o + 1];
      if (life <= 0) continue;
      const str = this._marks[o + 2];
      // Screen bearing: 0 rad is straight ahead, i.e. the top of the screen.
      const sa = this._marks[o] - Math.PI * 0.5;
      Ink.blitC(g, sp.smear,
        cx + Math.cos(sa) * rad, cy + Math.sin(sa) * rad,
        life * life * (0.5 + str * 0.5), sa + Math.PI * 0.5,
        0.72 + str * 0.5 + (1 - life) * 0.22);
    }
  }

  // --------------------------------------------------- 6. combo / kill stamp

  _drawStamp() {
    const g = this.g, s = this.s, sp = this._sprites;
    if (this._stampLife <= 0 || this._stampIndex < 0 || !sp.stamps) return;
    const stamp = sp.stamps[this._stampIndex];
    const t = 1 - this._stampLife / 1.15;
    const inT = clamp01(t / 0.16);
    const scale = t < 0.16 ? easeOutBack(inT) : 1 + (t - 0.16) * 0.06;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const mirror = this.ctx.settings?.leftHanded === true;
    const cx = mirror ? this.w * 0.72 : this.w * 0.28;
    const cy = this.h * 0.34;
    Ink.blitC(g, stamp, cx, cy, alpha, (1 - inT) * 0.16 - 0.03, scale);

    if (this._stampNumeral) {
      g.save();
      g.globalAlpha = g.globalAlpha * alpha * 0.8;
      g.fillStyle = PALETTE.gold;
      g.font = `600 ${Math.round(17 * s)}px ${FONT_JP}`;
      Ink.vertText(g, this._stampNumeral, cx, cy + stamp.h * 0.5, 17 * s, 18 * s);
      g.restore();
    }
  }

  // ------------------------------------------------------------ 7. objective

  _drawObjective() {
    const g = this.g, s = this.s, sp = this._sprites;
    if (!sp.objective || !this._objText) return;

    if (this._objDirty) {
      this._objDirty = false;
      const og = sp.objective.g, W = sp.objective.w, H = sp.objective.h;
      og.clearRect(0, 0, W, H);
      const size = Math.round(17 * s);
      const gap = size * 1.22;
      const chars = this._objText.slice(0, OBJ_MAX);
      og.fillStyle = PALETTE.bone;
      og.font = `500 ${size}px ${FONT_JP}`;
      og.textAlign = 'center'; og.textBaseline = 'middle';
      for (let i = 0; i < chars.length; i++) {
        og.fillText(chars[i], W * 0.62, 10 * s + i * gap + size * 0.5);
      }
      // A vertical line of text is "underlined" down its right-hand side.
      rtSeed(88);
      og.fillStyle = PALETTE.vermilion;
      Ink.stroke(og, W * 0.24, 8 * s, W * 0.24, 12 * s + chars.length * gap, 3.4 * s, 0.55, 16);
      if (this._objSub) {
        og.save();
        og.globalAlpha = 0.5;
        og.fillStyle = PALETTE.ash;
        og.font = `500 ${Math.round(8 * s)}px ${FONT_UI}`;
        og.translate(W * 0.9, 10 * s);
        og.rotate(Math.PI * 0.5);
        og.textAlign = 'left'; og.textBaseline = 'middle';
        og.fillText(this._objSub.slice(0, 22).toUpperCase(), 0, 0);
        og.restore();
      }
      Ink.grain(og, W, H, 0.9, 0xfeed, 1.6);
    }

    const inT = easeOutCubic(clamp01(this._objIn));
    if (inT < 0.01) return;
    const mirror = this.ctx.settings?.leftHanded === true;
    const x = mirror
      ? this.safe.left + 14 * s
      : this.w - this.safe.right - 14 * s - sp.objective.w;
    const y = this.safe.top + 26 * s + (1 - inT) * 12 * s;
    Ink.blit(g, sp.objective, x, y, inT);
  }

  // -------------------------------------------------------- 9. perfect parry

  _drawParry() {
    if (this._parry <= 0) return;
    const g = this.g, s = this.s, sp = this._sprites;
    const t = 1 - this._parry;
    const scale = 0.55 + t * 0.85;
    Ink.blitC(g, sp.splash, this.w * 0.5, this.h * 0.5,
      this._parry * (this._parryPerfect ? 1 : 0.5), t * 0.4, scale);
    if (this._parryPerfect) {
      g.save();
      g.globalAlpha = g.globalAlpha * this._parry;
      g.strokeStyle = BONE_A[BONE_A.length - 1];
      g.lineWidth = 1.6 * s;
      g.beginPath();
      g.arc(this.w * 0.5, this.h * 0.5, 96 * s * scale, 0, 6.2831853);
      g.stroke();
      g.restore();
    }
  }

  // -------------------------------------------------------------- 10. debug

  _drawDebug(dt) {
    const sp = this._sprites;
    if (!sp.debug) return;
    this._dbgTimer -= dt;
    if (this._dbgTimer <= 0) {
      this._dbgTimer = 0.25;
      const g2 = sp.debug.g, W = sp.debug.w, H = sp.debug.h;
      const st = this.ctx.engine?.stats;
      const q = this.ctx.quality;
      g2.clearRect(0, 0, W, H);
      g2.fillStyle = 'rgba(12,10,9,0.55)';
      g2.fillRect(0, 0, W, H);
      g2.font = `500 11px ${FONT_MONO}`;
      g2.textAlign = 'left'; g2.textBaseline = 'top';
      g2.fillStyle = '#8fe0b0';
      g2.fillText(`fps ${(st ? st.fps : 0).toFixed(0)}   ms ${(st ? st.ms : 0).toFixed(2)}`, 8, 7);
      g2.fillStyle = '#d9cbb6';
      g2.fillText(`draws ${st ? st.drawCalls : 0}`, 8, 22);
      g2.fillText(`tris  ${st ? (st.triangles / 1000).toFixed(0) + 'k' : '0'}`, 8, 36);
      g2.fillText(`scale ${q ? q.effectiveScale.toFixed(2) : '-'}  dpr ${this.dpr}`, 8, 50);
      g2.fillText(`tier  ${q ? (q.name || q.tier) : '-'}${q && q.auto ? ' auto' : ''}`, 8, 64);
      g2.fillText(`hud   ${this._hudMs.toFixed(2)} ms`, 8, 78);
    }
    // Offset below the pause seal Menus draws in the same corner.
    Ink.blit(this.g, sp.debug, this.safe.left + 10, this.safe.top + 56, 0.92);
  }
}
