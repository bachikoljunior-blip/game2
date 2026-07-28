/**
 * Menus.js — title card, pause, settings, and the death/victory cards.
 *
 * Everything is drawn into the HUD's canvas (Menus is registered after HUD, so its
 * update lands on top of the same composite) in the same ink language. Interaction
 * is handled here rather than through Input's zone system because menus must work
 * for mouse and keyboard too, and because Input is deliberately disabled while a
 * menu is open so no stray drag reaches the player.
 */

import { PALETTE, FONT_JP, FONT_UI, FONT_MONO, Ink, clamp, clamp01, damp, easeOutCubic } from './HUD.js';

const STORE_KEY = 'kagerou.settings';

const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high', 'ultra'];
const QUALITY_LABEL = ['自動', '低', '中', '高', '極'];

const DEFAULTS = {
  quality: 'auto',
  lookSensitivity: 1.0,
  invertY: false,
  aimAssist: 0.6,
  cameraShake: 1.0,
  master: 0.85,
  sfx: 0.9,
  music: 0.7,
  leftHanded: false,
};

export class Menus {
  constructor(ctx) {
    this.ctx = ctx;

    this.settings = Object.assign({}, DEFAULTS);
    this.mode = 'none';                  // none | pause | settings | death | victory
    this.index = 0;
    this.time = 0;

    this._open = 0;                      // eased 0..1 panel presence
    this._selY = 0;
    this._selInit = false;
    this._drag = null;
    this._swallowPause = 0;
    this._perfText = '';
    this._perfTimer = 0;
    this._saveTimer = -1;                // > 0 while a settings write is pending
    this._appliedMirror = false;         // matches TouchControls' default layout

    // Opening title card.
    this._title = -1;                    // < 0 = not playing
    this._titleSub = '';

    // Death / victory card.
    this._card = 0;                      // elapsed seconds since the card began

    this._pauseRows = [];
    this._settingsRows = [];
    this.rows = this._pauseRows;

    this._pauseZoneRect = { x: 0, y: 0, w: 0, h: 0 };
    this._pauseZoneVisible = false;
    this._unregister = [];
    this._sprites = {};
    this._panelKey = '';
    this._bound = [];

    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
  }

  // --------------------------------------------------------------- lifecycle

  async init() {
    this.load();
    this.ctx.settings = this.settings;
    this.apply(true);

    this._buildRows();

    const input = this.ctx.input;
    if (input?.registerZone) {
      const off = input.registerZone(
        'pause',
        () => (this._pauseZoneVisible ? this._pauseZoneRect : null),
        'press',
      );
      if (typeof off === 'function') this._unregister.push(off);
    }

    this._onKey = (e) => this._key(e);
    this._onDown = (e) => this._pointer(e, 'down');
    this._onMove = (e) => this._pointer(e, 'move');
    this._onUp = (e) => this._pointer(e, 'up');
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('pointerdown', this._onDown, true);
    window.addEventListener('pointermove', this._onMove, true);
    window.addEventListener('pointerup', this._onUp, true);
    window.addEventListener('pointercancel', this._onUp, true);

    const bus = this.ctx.bus;
    if (bus) {
      this._bound.push(bus.on('death', (p) => {
        const ent = p?.entity;
        if (!ent) return;
        const player = this.ctx.player;
        if ((player && ent === player) || ent.faction === 'player') this.showDeath();
      }));
      this._bound.push(bus.on('victory', () => this.showVictory()));
      this._bound.push(bus.on('objective', (p) => { if (p?.text) this._titleSub = p.text; }));
    }

    this.resize(this.w, this.h);
    return this;
  }

  dispose() {
    if (this._saveTimer > 0) { this._saveTimer = -1; this.save(); }
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('pointerdown', this._onDown, true);
    window.removeEventListener('pointermove', this._onMove, true);
    window.removeEventListener('pointerup', this._onUp, true);
    window.removeEventListener('pointercancel', this._onUp, true);
    for (let i = 0; i < this._unregister.length; i++) {
      try { this._unregister[i](); } catch { /* gone */ }
    }
    for (let i = 0; i < this._bound.length; i++) {
      try { this._bound[i](); } catch { /* gone */ }
    }
    this._unregister.length = 0;
    this._bound.length = 0;
    this._sprites = {};
  }

  applyQuality() { this._panelKey = ''; }

  // ---------------------------------------------------------------- settings

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      for (const k in DEFAULTS) {
        if (parsed[k] === undefined) continue;
        const d = DEFAULTS[k];
        if (typeof d === 'number' && typeof parsed[k] === 'number') this.settings[k] = parsed[k];
        else if (typeof d === 'boolean') this.settings[k] = !!parsed[k];
        else if (typeof d === 'string' && QUALITY_OPTIONS.indexOf(parsed[k]) >= 0) this.settings[k] = parsed[k];
      }
    } catch { /* private mode / corrupt payload — defaults are fine */ }
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); }
    catch { /* private mode */ }
  }

  /**
   * Push every setting into the systems that own it. `boot` suppresses the
   * expensive quality re-apply when nothing actually changed at start-up.
   */
  apply(boot) {
    const c = this.ctx, s = this.settings;
    c.settings = s;

    const input = c.input;
    if (input) {
      // Input owns the look pipeline — it applies both of these to pointer drag,
      // pointer-lock mouse and the gamepad stick. Never touch `_lookSens` here or
      // the multiplier gets applied twice.
      input.lookSensitivity = s.lookSensitivity;
      input.invertY = s.invertY;
    }

    c.aimAssist = s.aimAssist;
    c.shakeScale = s.cameraShake;

    const audio = c.audio;
    if (audio) {
      audio.setVolume?.('master', s.master);
      audio.setVolume?.('sfx', s.sfx);
      audio.setVolume?.('music', s.music);
      if (audio.volumes) {
        audio.volumes.master = s.master;
        audio.volumes.sfx = s.sfx;
        audio.volumes.music = s.music;
      }
    }

    this._applyQualitySetting();

    // Announce before relaying out: main.js maps handedness onto
    // `input.stickSide`, and TouchControls reads that value when it re-bakes.
    c.bus?.emit('settings-changed', s);

    // Only the mirrored layout invalidates the baked UI sprites — re-baking on
    // every slider tick would allocate dozens of canvases per drag.
    if (this._appliedMirror !== s.leftHanded) {
      this._appliedMirror = s.leftHanded;
      c.hud?.relayout?.();
      this._layout();
    }
  }

  _applyQualitySetting() {
    const c = this.ctx, q = c.quality;
    if (!q) return;
    const want = this.settings.quality;
    const wantTier = want === 'auto' ? (q.autoTier ?? q.tier) : QUALITY_OPTIONS.indexOf(want) - 1;
    if (wantTier < 0) return;
    const sameTier = q.tier === wantTier;
    const sameMode = want === 'auto' ? q.auto === true : q.auto === false;
    if (sameTier && sameMode) return;
    q.setTier?.(wantTier, want !== 'auto');
    if (want === 'auto') {
      q.auto = true;
      try { localStorage.removeItem('kagerou.tier'); } catch { /* ignore */ }
    }
    c.engine?.applyQuality?.();
  }

  // -------------------------------------------------------------------- rows

  _buildRows() {
    const s = this.settings;
    this._pauseRows.length = 0;
    this._pauseRows.push(
      { type: 'action', label: '再開', sub: 'resume', act: () => this.resume() },
      { type: 'action', label: '設定', sub: 'settings', act: () => this.openSettings() },
      { type: 'action', label: '再挑戦', sub: 'restart', act: () => this.restart() },
    );

    this._settingsRows.length = 0;
    this._settingsRows.push(
      {
        type: 'enum', label: '画質', sub: 'quality',
        options: QUALITY_OPTIONS, display: QUALITY_LABEL,
        get: () => Math.max(0, QUALITY_OPTIONS.indexOf(s.quality)),
        set: (i) => { s.quality = QUALITY_OPTIONS[clamp(i, 0, QUALITY_OPTIONS.length - 1)]; this._commit(); },
      },
      {
        type: 'slider', label: '感度', sub: 'sensitivity', min: 0.3, max: 2.2, step: 0.05,
        get: () => s.lookSensitivity, set: (v) => { s.lookSensitivity = v; this._commit(); },
      },
      {
        type: 'toggle', label: 'Y反転', sub: 'invert y',
        get: () => s.invertY, set: (v) => { s.invertY = v; this._commit(); },
      },
      {
        type: 'slider', label: '補助', sub: 'aim assist', min: 0, max: 1, step: 0.05,
        get: () => s.aimAssist, set: (v) => { s.aimAssist = v; this._commit(); },
      },
      {
        type: 'slider', label: '揺れ', sub: 'camera shake', min: 0, max: 1.5, step: 0.05,
        get: () => s.cameraShake, set: (v) => { s.cameraShake = v; this._commit(); },
      },
      {
        type: 'slider', label: '音量', sub: 'master', min: 0, max: 1, step: 0.05,
        get: () => s.master, set: (v) => { s.master = v; this._commit(); },
      },
      {
        type: 'slider', label: '効果音', sub: 'sfx', min: 0, max: 1, step: 0.05,
        get: () => s.sfx, set: (v) => { s.sfx = v; this._commit(); },
      },
      {
        type: 'slider', label: '音楽', sub: 'music', min: 0, max: 1, step: 0.05,
        get: () => s.music, set: (v) => { s.music = v; this._commit(); },
      },
      {
        type: 'toggle', label: '左利き', sub: 'left-handed',
        get: () => s.leftHanded, set: (v) => { s.leftHanded = v; this._commit(); },
      },
      { type: 'action', label: '戻る', sub: 'back', act: () => this.openPause() },
    );

    for (const list of [this._pauseRows, this._settingsRows]) {
      for (let i = 0; i < list.length; i++) {
        list[i].x = 0; list[i].y = 0; list[i].w = 0; list[i].h = 0;
      }
    }
  }

  /** Slider drags fire many times a second — coalesce the localStorage write. */
  _commit() {
    this._saveTimer = 0.4;
    this.apply(false);
  }

  // ------------------------------------------------------------------ layout

  resize(w, h) {
    const nw = Math.max(1, w || window.innerWidth);
    const nh = Math.max(1, h || window.innerHeight);
    // The engine resizes on every adaptive render-scale step; the menu art only
    // depends on CSS size, so drop the no-op calls before discarding sprites.
    if (nw === this.w && nh === this.h && this._sprites.wash) return;
    this.w = nw;
    this.h = nh;
    this._panelKey = '';
    this._sprites.wash = null;
    this._sprites.title = null;
    this._sprites.death = null;
    this._sprites.victory = null;
    this._sprites.pauseSeal = null;
    this._selInit = false;
    this._layout();
  }

  get s() { return this.ctx.hud?.s || clamp(Math.min(this.w * 0.55, this.h) / 430, 0.8, 1.35); }
  get safe() { return this.ctx.hud?.safe || { top: 0, right: 0, bottom: 0, left: 0 }; }

  _layout() {
    const s = this.s;
    const rows = this.rows;
    const rowH = Math.round(34 * s);
    const panelW = Math.min(430 * s, this.w - 72 * s);
    const panelH = rows.length * rowH + 96 * s;
    this._panel = this._panel || { x: 0, y: 0, w: 0, h: 0 };
    this._panel.w = panelW;
    this._panel.h = panelH;
    this._panel.x = (this.w - panelW) * 0.5;
    this._panel.y = Math.max(this.safe.top + 12 * s, (this.h - panelH) * 0.5);

    const x = this._panel.x + 30 * s;
    const w = panelW - 60 * s;
    let y = this._panel.y + 66 * s;
    for (let i = 0; i < rows.length; i++) {
      rows[i].x = x; rows[i].y = y; rows[i].w = w; rows[i].h = rowH;
      y += rowH;
    }

    // Discreet touch-only pause seal, always in the corner opposite the HUD's
    // objective column (which mirrors with the left-handed layout).
    const seal = Math.max(34, 34 * s);
    const mirror = this.settings.leftHanded;
    this._pauseZoneRect.w = seal + 16;
    this._pauseZoneRect.h = seal + 16;
    this._pauseZoneRect.x = mirror
      ? this.w - this.safe.right - seal - 8 * s - 8
      : this.safe.left + 8 * s;
    this._pauseZoneRect.y = this.safe.top + 8 * s;
    this._sealSize = seal;
  }

  // -------------------------------------------------------------- public API

  /** Called by main.js the moment the boot veil lifts. */
  onGameStart() {
    this._title = 0;
    this.ctx.hud?.setAlpha?.(0);
    if (!this._titleSub) this._titleSub = '山の社を目指せ';
  }

  isOpen() { return this.mode !== 'none'; }

  openPause() {
    this.mode = 'pause';
    this.rows = this._pauseRows;
    this.index = 0;
    this._selInit = false;
    this._panelKey = '';
    this._layout();
    this._setPaused(true);
  }

  openSettings() {
    this.mode = 'settings';
    this.rows = this._settingsRows;
    this.index = 0;
    this._selInit = false;
    this._panelKey = '';
    this._layout();
    this._setPaused(true);
  }

  resume() {
    this.mode = 'none';
    this._drag = null;
    if (this._saveTimer > 0) { this._saveTimer = -1; this.save(); }
    this._setPaused(false);
  }

  togglePause() {
    if (this.mode === 'pause' || this.mode === 'settings') this.resume();
    else if (this.mode === 'none' && this._title < 0) this.openPause();
  }

  restart() {
    const c = this.ctx;
    this.mode = 'none';
    this._card = 0;
    this._setPaused(false);
    if (c.level?.restart) c.level.restart();
    else if (c.player?.respawn) c.player.respawn();
    else if (c.enemies?.reset) { c.enemies.reset(); c.player?.reset?.(); }
    else { window.location.reload(); return; }
    c.hud?.setAlpha?.(1);
  }

  showDeath() {
    if (this.mode === 'death') return;
    this.mode = 'death';
    this._card = 0;
    this._drag = null;
    if (this.ctx.input) this.ctx.input.enabled = false;
  }

  showVictory() {
    if (this.mode === 'victory') return;
    this.mode = 'victory';
    this._card = 0;
    this._drag = null;
    if (this.ctx.input) this.ctx.input.enabled = false;
  }

  _setPaused(flag) {
    const c = this.ctx;
    if (c.engine) c.engine.paused = flag;
    if (c.input) {
      c.input.enabled = !flag;
      if (flag) c.input.releaseAll?.();
    }
    c.audio?.setPaused?.(flag);
  }

  // ------------------------------------------------------------------- input

  _key(e) {
    const code = e.code;
    if (code === 'Escape' || code === 'Tab') {
      e.preventDefault();
      if (this.mode === 'death' || this.mode === 'victory') return;
      if (this.mode === 'settings') this.openPause();
      else this.togglePause();
      // Input also queues 'pause' on these keys; swallow the duplicate.
      this._swallowPause = 0.3;
      return;
    }
    if (this.mode === 'death' || this.mode === 'victory') {
      if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
        e.preventDefault();
        this.restart();
      }
      return;
    }
    if (this.mode === 'none') return;

    const rows = this.rows;
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.index = (this.index - 1 + rows.length) % rows.length; e.preventDefault();
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.index = (this.index + 1) % rows.length; e.preventDefault();
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      this._nudge(rows[this.index], -1); e.preventDefault();
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this._nudge(rows[this.index], 1); e.preventDefault();
    } else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      this._activate(rows[this.index]); e.preventDefault();
    }
  }

  _pointer(e, phase) {
    const x = e.clientX, y = e.clientY;

    if (this.mode === 'none') {
      // The pause seal is a real target for the mouse too; touch goes through
      // Input's zone list so the game canvas never sees the tap.
      if (phase === 'down' && this._pauseZoneVisible && e.pointerType !== 'touch' &&
        this._inRect(x, y, this._pauseZoneRect)) {
        e.preventDefault(); e.stopPropagation();
        this.openPause();
      }
      return;
    }

    if (this.mode === 'death' || this.mode === 'victory') {
      if (phase === 'down' && this._card > 1.6) {
        e.preventDefault(); e.stopPropagation();
        this.restart();
      }
      return;
    }

    e.stopPropagation();
    if (e.cancelable) e.preventDefault();

    const rows = this.rows;
    if (phase === 'down') {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (y >= r.y && y <= r.y + r.h && x >= r.x - 14 && x <= r.x + r.w + 14) {
          this.index = i;
          if (r.type === 'slider') {
            this._drag = r;
            this._sliderFromX(r, x);
          } else {
            this._activate(r);
          }
          return;
        }
      }
      return;
    }

    if (phase === 'move') {
      if (this._drag) { this._sliderFromX(this._drag, x); return; }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (y >= r.y && y <= r.y + r.h && x >= r.x - 14 && x <= r.x + r.w + 14) { this.index = i; break; }
      }
      return;
    }

    this._drag = null;
  }

  _inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  _trackRect(r) {
    // Slider track occupies the right-hand 44% of the row.
    const tx = r.x + r.w * 0.5;
    return { x: tx, w: r.w * 0.5, y: r.y + r.h * 0.5 };
  }

  _sliderFromX(r, x) {
    const t = this._trackRect(r);
    const f = clamp01((x - t.x) / (t.w || 1));
    let v = r.min + (r.max - r.min) * f;
    if (r.step) v = Math.round(v / r.step) * r.step;
    r.set(clamp(v, r.min, r.max));
  }

  _nudge(r, dir) {
    if (!r) return;
    if (r.type === 'slider') {
      r.set(clamp(r.get() + dir * (r.step || 0.05), r.min, r.max));
    } else if (r.type === 'toggle') {
      r.set(!r.get());
    } else if (r.type === 'enum') {
      const n = r.options.length;
      r.set((r.get() + dir + n) % n);
    }
  }

  _activate(r) {
    if (!r) return;
    if (r.type === 'action') r.act();
    else if (r.type === 'toggle') r.set(!r.get());
    else if (r.type === 'enum') r.set((r.get() + 1) % r.options.length);
    else if (r.type === 'slider') this._nudge(r, 1);
  }

  // --------------------------------------------------------------- per frame

  update(dt, elapsed, rawDt) {
    const hud = this.ctx.hud;
    const g = hud?.g;
    const rd = Math.min(rawDt === undefined ? 0.0166 : rawDt, 0.1);
    this.time += rd;
    if (this._swallowPause > 0) this._swallowPause -= rd;
    if (this._saveTimer > 0) {
      this._saveTimer -= rd;
      if (this._saveTimer <= 0) this.save();
    }

    // Gamepad / touch-zone pause requests arrive through Input.
    if (this.ctx.input?.consume?.('pause')) {
      if (this._swallowPause <= 0) this.togglePause();
    }

    this._pauseZoneVisible = this.mode === 'none' && this._title < 0 &&
      (this.ctx.input?.usingTouch === true || this.ctx.quality?.device?.isMobile === true);

    const open = this.mode === 'pause' || this.mode === 'settings';
    this._open = damp(this._open, open ? 1 : 0, 15, rd);
    if (this.mode === 'death' || this.mode === 'victory') this._card += rd;

    if (!g) return;
    g.setTransform(hud.dpr, 0, 0, hud.dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    if (this._title >= 0) this._drawTitle(rd, g);
    if (this._pauseZoneVisible) this._drawPauseSeal(g);
    if (this._open > 0.004) this._drawPanel(rd, g);
    if (this.mode === 'death' || this.mode === 'victory') this._drawCard(g);
  }

  // -------------------------------------------------------------- sprite bake

  _wash() {
    if (this._sprites.wash) return this._sprites.wash;
    const dpr = this.ctx.hud?.dpr || 1;
    this._sprites.wash = Ink.sprite(320, 320, dpr, (g, W, H) => {
      Ink.seed(3001);
      const grd = g.createRadialGradient(W * 0.5, H * 0.46, W * 0.08, W * 0.5, H * 0.5, W * 0.72);
      grd.addColorStop(0, 'rgba(10,8,8,0.58)');
      grd.addColorStop(0.55, 'rgba(10,8,8,0.80)');
      grd.addColorStop(1, 'rgba(6,5,5,0.95)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      // A few wide sumi sweeps so the wash has a direction, like wet paper.
      g.fillStyle = 'rgba(4,3,3,0.35)';
      for (let i = 0; i < 6; i++) {
        const y = 30 + i * 46 + Ink.rand() * 20;
        Ink.stroke(g, -20, y, W + 20, y + (Ink.rand() - 0.5) * 34, 26 + Ink.rand() * 26, 0.5, 12);
      }
      Ink.grain(g, W, H, 0.7, 0x2c2c, 2.4);
    });
    return this._sprites.wash;
  }

  _bigKanji(key, ch, colour) {
    if (this._sprites[key]) return this._sprites[key];
    const s = this.s, dpr = this.ctx.hud?.dpr || 1;
    const size = Math.round(Math.min(this.w * 0.34, this.h * 0.42, 220 * s));
    this._sprites[key] = Ink.sprite(size * 1.25, size * 1.25, dpr, (g, W, H) => {
      Ink.seed(4100 + ch.charCodeAt(0));
      g.font = `600 ${Math.round(size)}px ${FONT_JP}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(10,8,8,0.55)';
      g.fillText(ch, W * 0.5 + size * 0.02, H * 0.52 + size * 0.02);
      g.fillStyle = colour;
      g.fillText(ch, W * 0.5, H * 0.5);
      Ink.grain(g, W, H, 1.0, 0x51a0 + ch.charCodeAt(0), 2.2);
    });
    return this._sprites[key];
  }

  _panelSprite() {
    const key = `${this._panel.w | 0}x${this._panel.h | 0}`;
    if (this._panelKey === key && this._sprites.panel) return this._sprites.panel;
    const s = this.s, dpr = this.ctx.hud?.dpr || 1;
    this._panelKey = key;
    this._sprites.panel = Ink.sprite(this._panel.w, this._panel.h, dpr, (g, W, H) => {
      Ink.seed(3301);
      g.fillStyle = 'rgba(16,12,11,0.80)';
      Ink.ragRect(g, 4 * s, 4 * s, W - 8 * s, H - 8 * s, 2.4 * s, 30 * s);
      g.fillStyle = 'rgba(242,227,207,0.16)';
      Ink.stroke(g, 22 * s, 12 * s, W - 22 * s, 12 * s, 2.0 * s, 0.6, 16);
      Ink.stroke(g, 22 * s, H - 12 * s, W - 22 * s, H - 12 * s, 2.0 * s, 0.6, 16);
      g.fillStyle = PALETTE.vermilion;
      Ink.stroke(g, 30 * s, 46 * s, 84 * s, 46 * s, 3.2 * s, 0.55, 10);
      Ink.grain(g, W, H, 0.85, 0x8d8d, 2.0);
    });
    return this._sprites.panel;
  }

  // -------------------------------------------------------------- title card

  _drawTitle(dt, g) {
    const s = this.s;
    this._title += dt;
    const t = this._title;
    const hud = this.ctx.hud;

    const fadeOut = clamp01((t - 3.6) / 1.0);
    const a = 1 - fadeOut;
    if (t > 4.7) {
      this._title = -1;
      hud?.setAlpha?.(1);
      return;
    }
    // Hand the HUD back as the card leaves.
    hud?.setAlpha?.(clamp01((t - 3.0) / 1.1));
    if (a <= 0.003) return;

    g.save();
    g.globalAlpha = a;
    const wash = this._wash();
    g.globalAlpha = a * clamp01(1.2 - t / 3.4);
    g.drawImage(wash.c, 0, 0, this.w, this.h);
    g.globalAlpha = a;

    const cx = this.w * 0.5;
    const size = Math.round(Math.min(this.w * 0.2, this.h * 0.3, 132 * s));
    const gap = size * 1.06;
    const topY = this.h * 0.5 - gap * 0.5;

    g.font = `600 ${size}px ${FONT_JP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // Each glyph is revealed top-to-bottom, as a brush lays it down.
    const chars = '陽炎';
    for (let i = 0; i < 2; i++) {
      const start = 0.25 + i * 0.55;
      const p = easeOutCubic(clamp01((t - start) / 0.85));
      if (p <= 0.001) continue;
      const y = topY + i * gap;
      g.save();
      g.beginPath();
      g.rect(cx - size, y - size * 0.62, size * 2, size * 1.24 * p);
      g.clip();
      g.fillStyle = 'rgba(10,8,8,0.6)';
      g.fillText(chars[i], cx + 2.5 * s, y + 2.5 * s);
      g.fillStyle = PALETTE.bone;
      g.fillText(chars[i], cx, y);
      g.restore();
      // Wet leading edge of the stroke.
      if (p < 1) {
        g.save();
        g.globalAlpha = g.globalAlpha * (1 - p) * 0.8;
        g.fillStyle = PALETTE.vermilion;
        Ink.seed(3700 + i);
        Ink.stroke(g, cx - size * 0.34, y - size * 0.62 + size * 1.24 * p,
          cx + size * 0.34, y - size * 0.62 + size * 1.24 * p, 4 * s, 0.7, 8);
        g.restore();
      }
    }

    const subA = clamp01((t - 1.85) / 0.7);
    if (subA > 0.004) {
      g.save();
      g.globalAlpha = g.globalAlpha * subA;
      g.fillStyle = PALETTE.ash;
      g.font = `500 ${Math.round(11 * s)}px ${FONT_UI}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('K A G E R O U', cx, topY - size * 0.86);
      g.fillStyle = PALETTE.bone;
      g.font = `500 ${Math.round(15 * s)}px ${FONT_JP}`;
      g.fillText(this._titleSub, cx, topY + gap + size * 0.82);
      g.fillStyle = PALETTE.vermilion;
      Ink.seed(3811);
      Ink.stroke(g, cx - 46 * s, topY + gap + size * 1.02, cx + 46 * s, topY + gap + size * 1.02,
        3 * s, 0.6, 10);
      g.restore();
    }
    g.restore();
  }

  // -------------------------------------------------------------- pause seal

  _drawPauseSeal(g) {
    const s = this.s;
    if (!this._sprites.pauseSeal) {
      const size = this._sealSize;
      this._sprites.pauseSeal = Ink.sprite(size, size, this.ctx.hud?.dpr || 1, (gg, W, H) => {
        Ink.seed(3901);
        gg.fillStyle = 'rgba(20,17,16,0.5)';
        Ink.blob(gg, W * 0.5, H * 0.5, W * 0.46, H * 0.46, 0.05, 24);
        gg.fillStyle = 'rgba(242,227,207,0.5)';
        for (let i = 0; i < 3; i++) {
          const a0 = (i / 3) * 6.2831853 + 0.3;
          Ink.arcStroke(gg, W * 0.5, H * 0.5, W * 0.44, a0, a0 + 1.6, 1.8, 0.55, true, 12);
        }
        gg.fillStyle = PALETTE.bone;
        gg.font = `600 ${Math.round(W * 0.46)}px ${FONT_JP}`;
        gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillText('休', W * 0.5, H * 0.54);
        Ink.grain(gg, W, H, 1.3, 0x9191, 1.6);
      });
    }
    const a = (this.ctx.hud?.alpha === undefined ? 1 : this.ctx.hud.alpha) * 0.72;
    Ink.blit(g, this._sprites.pauseSeal,
      this._pauseZoneRect.x + 8, this._pauseZoneRect.y + 8, a);
  }

  // ------------------------------------------------------------- pause panel

  _drawPanel(dt, g) {
    const s = this.s, p = this._panel, rows = this.rows;
    const k = easeOutCubic(this._open);

    g.save();
    g.globalAlpha = k;
    const wash = this._wash();
    g.drawImage(wash.c, 0, 0, this.w, this.h);

    const slide = (1 - k) * 18 * s;
    g.translate(0, slide);
    Ink.blit(g, this._panelSprite(), p.x, p.y, 1);

    // Header.
    g.fillStyle = PALETTE.bone;
    g.font = `600 ${Math.round(21 * s)}px ${FONT_JP}`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(this.mode === 'settings' ? '設定' : '休止', p.x + 30 * s, p.y + 30 * s);
    g.fillStyle = PALETTE.ash;
    g.font = `500 ${Math.round(9 * s)}px ${FONT_UI}`;
    g.fillText(this.mode === 'settings' ? 'settings' : 'paused', p.x + 74 * s, p.y + 32 * s);

    // Selection underline springs between rows.
    const sel = rows[clamp(this.index, 0, rows.length - 1)];
    if (sel) {
      if (!this._selInit) { this._selY = sel.y; this._selInit = true; }
      else this._selY = damp(this._selY, sel.y, 22, dt);
      g.save();
      g.globalAlpha = g.globalAlpha * 0.9;
      g.fillStyle = 'rgba(200,50,30,0.13)';
      g.fillRect(sel.x - 14 * s, this._selY, sel.w + 28 * s, sel.h);
      g.fillStyle = PALETTE.vermilion;
      Ink.seed(4001);
      Ink.stroke(g, sel.x - 12 * s, this._selY + sel.h - 3 * s,
        sel.x + sel.w + 12 * s, this._selY + sel.h - 3 * s, 2.6 * s, 0.6, 14);
      g.restore();
    }

    for (let i = 0; i < rows.length; i++) this._drawRow(g, rows[i], i === this.index);

    // Performance readout.
    this._perfTimer -= dt;
    if (this._perfTimer <= 0) {
      this._perfTimer = 0.25;
      const st = this.ctx.engine?.stats, q = this.ctx.quality;
      this._perfText = st
        ? `${st.fps.toFixed(0)} fps · ${st.ms.toFixed(1)} ms · ${st.drawCalls} draws · ` +
          `${(st.triangles / 1000).toFixed(0)}k tris · x${q ? q.effectiveScale.toFixed(2) : '1.00'}`
        : '—';
    }
    g.fillStyle = 'rgba(242,227,207,0.42)';
    g.font = `500 ${Math.round(9 * s)}px ${FONT_MONO}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this._perfText, p.x + p.w * 0.5, p.y + p.h - 26 * s);
    g.fillStyle = 'rgba(242,227,207,0.26)';
    g.font = `500 ${Math.round(8 * s)}px ${FONT_UI}`;
    g.fillText(this.ctx.quality ? this.ctx.quality.describe() : '', p.x + p.w * 0.5, p.y + p.h - 14 * s);

    g.restore();
  }

  _drawRow(g, r, selected) {
    const s = this.s;
    const cy = r.y + r.h * 0.5;
    g.fillStyle = selected ? PALETTE.bone : 'rgba(242,227,207,0.66)';
    g.font = `500 ${Math.round(16 * s)}px ${FONT_JP}`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(r.label, r.x, cy);
    g.fillStyle = selected ? 'rgba(201,162,39,0.85)' : 'rgba(142,128,114,0.6)';
    g.font = `500 ${Math.round(8 * s)}px ${FONT_UI}`;
    g.fillText(r.sub, r.x + 2, cy + 12 * s);

    if (r.type === 'action') {
      if (selected) {
        g.fillStyle = PALETTE.vermilion;
        Ink.seed(4200);
        Ink.stroke(g, r.x + r.w - 16 * s, cy, r.x + r.w - 4 * s, cy, 3 * s, 0.4, 6);
      }
      return;
    }

    if (r.type === 'toggle') {
      const on = !!r.get();
      const bx = r.x + r.w - 40 * s, by = cy;
      g.save();
      Ink.seed(4300);
      g.fillStyle = on ? PALETTE.vermilion : 'rgba(242,227,207,0.22)';
      Ink.blob(g, bx + 20 * s, by, 11 * s, 11 * s, 0.09, 18);
      if (on) {
        g.fillStyle = PALETTE.bone;
        Ink.stroke(g, bx + 15 * s, by + 1 * s, bx + 19 * s, by + 5 * s, 2.6 * s, 0.4, 5);
        Ink.stroke(g, bx + 19 * s, by + 5 * s, bx + 26 * s, by - 5 * s, 2.6 * s, 0.4, 6);
      }
      g.restore();
      return;
    }

    if (r.type === 'enum') {
      g.fillStyle = selected ? PALETTE.gold : 'rgba(242,227,207,0.7)';
      g.font = `500 ${Math.round(15 * s)}px ${FONT_JP}`;
      g.textAlign = 'right';
      const i = r.get();
      g.fillText(r.display ? r.display[i] : String(r.options[i]), r.x + r.w, cy - 2 * s);
      g.fillStyle = 'rgba(142,128,114,0.7)';
      g.font = `500 ${Math.round(8 * s)}px ${FONT_UI}`;
      g.fillText(String(r.options[i]), r.x + r.w, cy + 11 * s);
      return;
    }

    // slider
    const t = this._trackRect(r);
    const f = clamp01((r.get() - r.min) / (r.max - r.min || 1));
    g.save();
    Ink.seed(4400);
    g.fillStyle = 'rgba(242,227,207,0.18)';
    Ink.stroke(g, t.x, t.y, t.x + t.w, t.y, 3.0 * s, 0.45, 14);
    g.fillStyle = selected ? PALETTE.gold : PALETTE.vermilion;
    if (f > 0.005) Ink.stroke(g, t.x, t.y, t.x + t.w * f, t.y, 4.4 * s, 0.4, 12);
    g.fillStyle = PALETTE.bone;
    Ink.blob(g, t.x + t.w * f, t.y, 5.4 * s, 5.4 * s, 0.16, 14);
    g.restore();
  }

  // -------------------------------------------------------- death / victory

  _drawCard(g) {
    const s = this.s, t = this._card;
    const win = this.mode === 'victory';
    const washA = clamp01(t / 1.3);
    g.save();
    g.globalAlpha = washA * 0.98;
    g.drawImage(this._wash().c, 0, 0, this.w, this.h);

    const kA = clamp01((t - 0.5) / 1.5);
    if (kA > 0.004) {
      const sp = win
        ? this._bigKanji('victory', '勝', PALETTE.gold)
        : this._bigKanji('death', '死', PALETTE.vermilion);
      // Slow and weighty: it settles rather than pops.
      const scale = 1.16 - 0.16 * easeOutCubic(kA);
      g.globalAlpha = washA * kA;
      Ink.blitC(g, sp, this.w * 0.5, this.h * 0.46, 1, 0, scale);
    }

    const pA = clamp01((t - 1.8) / 1.0) * (0.55 + 0.45 * Math.sin(t * 2.1));
    if (pA > 0.004) {
      g.globalAlpha = clamp01(pA);
      g.fillStyle = PALETTE.bone;
      g.font = `500 ${Math.round(15 * s)}px ${FONT_JP}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(win ? 'もう一度' : 'もう一度', this.w * 0.5, this.h * 0.78);
      g.fillStyle = 'rgba(142,128,114,0.9)';
      g.font = `500 ${Math.round(9 * s)}px ${FONT_UI}`;
      g.fillText(
        this.ctx.input?.usingTouch ? 'TAP TO TRY AGAIN' : 'PRESS ENTER TO TRY AGAIN',
        this.w * 0.5, this.h * 0.78 + 17 * s,
      );
    }
    g.restore();
  }
}
