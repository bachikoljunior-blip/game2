/**
 * Audio.js — KAGEROU's entire soundtrack and sound library, synthesised at boot.
 *
 * There are no audio files in this build. Every impact, footstep, bell and note is
 * rendered into an AudioBuffer by hand-written DSP during the loading bar (chunked so
 * the main thread never stalls), then played back through a small, cheap graph:
 *
 *     voices ─┬─> sfx ──┐
 *             ├─> ui ───┤
 *             ├─> music ┼─> master ─> limiter ─> destination
 *             └─> amb ──┘      ▲
 *                  └─ sends ─> convolver A/B (cross-faded room IRs) ─┘
 *
 * Everything here is defensive: if the AudioContext cannot start (iOS Low Power Mode,
 * autoplay policy, a browser without Web Audio) the system silently degrades to a no-op
 * rather than throwing into the boot sequence.
 */

import { Vector3 } from 'three';

/* ────────────────────────────────────────────────────────────────────────────
   Small utilities
   ──────────────────────────────────────────────────────────────────────────── */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic PRNG so a given sound variant is byte-identical on every device. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 都節 miyako-bushi — the scale that makes five notes sound Japanese. */
const MIYAKO = [0, 1, 5, 7, 8];

/** Combat taiko ostinato: accent weight per eighth note. 0 = rest. */
const TAIKO_PATTERN = [1.0, 0.0, 0.45, 0.0, 0.8, 0.0, 0.5, 0.35];

/** Whatever a gameplay system calls a surface, we resolve it to one of six footsteps. */
const SURFACE_MAP = {
  grass: 'grass', moss: 'grass', foliage: 'grass', leaf: 'grass', leaves: 'grass',
  dirt: 'dirt', earth: 'dirt', soil: 'dirt', mud: 'dirt', sand: 'dirt', path: 'dirt',
  stone: 'stone', rock: 'stone', tile: 'stone', marble: 'stone', metal: 'stone',
  gravel: 'gravel', pebble: 'gravel', scree: 'gravel', snow: 'gravel',
  wood: 'wood', plank: 'wood', timber: 'wood', bridge: 'wood', tatami: 'wood', deck: 'wood',
  water: 'water', shallow: 'water', puddle: 'water', river: 'water', stream: 'water',
};

/* ────────────────────────────────────────────────────────────────────────────
   Offline DSP toolkit — used only during boot synthesis, never per frame.
   ──────────────────────────────────────────────────────────────────────────── */

/** RBJ biquad, transposed direct form II. Cheap enough to run a few dozen passes at boot. */
class BQ {
  constructor(sr) {
    this.sr = sr;
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  reset() { this.z1 = 0; this.z2 = 0; }

  set(type, f0, Q, gainDb) {
    const sr = this.sr;
    f0 = clamp(f0, 8, sr * 0.475);
    Q = Math.max(0.0005, Q || 0.7071);
    const w0 = (2 * Math.PI * f0) / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Q);
    const A = Math.pow(10, (gainDb || 0) / 40);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (type) {
      case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'ls': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
        a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
        break;
      }
      case 'hs': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
        a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
        break;
      }
      default: break;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }

  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  run(d, from, to) {
    const hi = to === undefined ? d.length : to;
    for (let i = from || 0; i < hi; i++) d[i] = this.tick(d[i]);
  }
}

function filt(d, sr, type, f, Q, gainDb) {
  const bq = new BQ(sr);
  bq.set(type, f, Q, gainDb);
  bq.run(d, 0, d.length);
}

/** Time-varying filter: coefficients are refreshed every 32 samples, which is inaudible. */
function sweep(d, sr, type, f0, f1, Q, curve) {
  const bq = new BQ(sr);
  const n = d.length;
  const c = curve === undefined ? 1 : curve;
  for (let i = 0; i < n; i += 32) {
    const t = Math.pow(i / n, c);
    bq.set(type, f0 + (f1 - f0) * t, Q, 0);
    const to = Math.min(n, i + 32);
    for (let j = i; j < to; j++) d[j] = bq.tick(d[j]);
  }
}

function fillWhite(d, rng, amp, from, to) {
  const a = amp === undefined ? 1 : amp;
  const hi = to === undefined ? d.length : to;
  for (let i = from || 0; i < hi; i++) d[i] = (rng() * 2 - 1) * a;
}

/** Paul Kellet's economy pink filter — the spectrum wind and rain actually have. */
function fillPink(d, rng, amp) {
  const a = amp === undefined ? 1 : amp;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.24 * a;
  }
}

/**
 * Attack/decay envelope. `shape` > 1 holds the head then falls off a cliff (percussive),
 * shape = 1 is a plain exponential.
 */
function ampEnv(d, sr, atk, dec, shape, startSec) {
  const n = d.length;
  const a = Math.max(1, Math.floor(atk * sr));
  const s = Math.floor((startSec || 0) * sr);
  const sh = shape === undefined ? 1 : shape;
  const tau = Math.max(1e-4, dec);
  for (let i = 0; i < n; i++) {
    if (i < s) { d[i] = 0; continue; }
    const k = i - s;
    let e;
    if (k < a) e = k / a;
    else e = Math.exp(-Math.pow((k - a) / sr / tau, sh));
    d[i] *= e;
  }
}

/**
 * One decaying sinusoidal partial, generated with a magic-circle oscillator: two
 * multiplies per sample and numerically stable over the eight seconds a bonshō rings.
 */
function addPartial(d, sr, freq, amp, tau, phase, startIdx) {
  if (!(freq > 0) || freq >= sr * 0.5 || !(amp > 0)) return;
  const n = d.length;
  const eps = 2 * Math.sin(Math.PI * freq / sr);
  let u = Math.cos(phase || 0);
  let v = Math.sin(phase || 0);
  const dec = Math.exp(-1 / (Math.max(1e-4, tau) * sr));
  let e = amp;
  for (let i = startIdx || 0; i < n; i++) {
    u += eps * v;
    v -= eps * u;
    d[i] += v * e;
    e *= dec;
    if (e < 1e-6) break;
  }
}

/** A sine whose pitch collapses — the thump under every drum and body impact. */
function addPitchedSine(d, sr, fStart, fEnd, tauPitch, amp, tauAmp, startIdx) {
  const n = d.length;
  let ph = 0;
  const s = startIdx || 0;
  for (let i = s; i < n; i++) {
    const t = (i - s) / sr;
    const f = fEnd + (fStart - fEnd) * Math.exp(-t / Math.max(1e-4, tauPitch));
    ph += (2 * Math.PI * f) / sr;
    const e = amp * Math.exp(-t / Math.max(1e-4, tauAmp));
    if (e < 1e-6) break;
    d[i] += Math.sin(ph) * e;
  }
}

/**
 * Karplus-Strong with a one-pole bridge filter and an off-centre pluck comb — the koto's
 * plectrum strikes close to the bridge, which is why it sounds nasal rather than round.
 */
function karplus(d, sr, freq, amp, damp, bright, rng, startIdx) {
  const N = Math.max(2, Math.round(sr / Math.max(20, freq)));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rng() * 2 - 1;
  const p = Math.max(1, Math.floor(N * 0.12));
  for (let i = N - 1; i >= p; i--) line[i] -= line[i - p] * 0.7;
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += (line[i] - lp) * bright; line[i] = lp; }
  let idx = 0, last = 0, dc = 0;
  const n = d.length;
  for (let i = startIdx || 0; i < n; i++) {
    const cur = line[idx];
    let y = (cur + last) * 0.5 * damp;
    last = cur;
    dc += (y - dc) * 0.0006;
    y -= dc;
    line[idx] = y;
    d[i] += cur * amp;
    idx++; if (idx >= N) idx = 0;
  }
}

/** Filtered noise burst mixed into `d` at `startSec`. */
function addNoiseBurst(d, sr, startSec, dur, amp, type, f, Q, rng, atk, shape) {
  const n = Math.max(2, Math.floor(dur * sr));
  const tmp = new Float32Array(n);
  fillWhite(tmp, rng, 1);
  if (type) filt(tmp, sr, type, f, Q, 0);
  ampEnv(tmp, sr, atk === undefined ? 0.0008 : atk, dur * 0.42, shape === undefined ? 1 : shape, 0);
  const s = Math.floor(startSec * sr);
  const to = Math.min(d.length, s + n);
  for (let i = s; i < to; i++) d[i] += tmp[i - s] * amp;
}

function softClip(d, drive) {
  const k = drive || 1;
  for (let i = 0; i < d.length; i++) {
    const x = d[i] * k;
    d[i] = x / (1 + Math.abs(x)) * 1.35;
  }
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  if (m < 1e-7) return;
  const g = (peak === undefined ? 0.92 : peak) / m;
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

function fadeEdges(d, sr, inSec, outSec) {
  const n = d.length;
  const a = Math.min(n >> 1, Math.floor((inSec || 0.002) * sr));
  const b = Math.min(n >> 1, Math.floor((outSec || 0.01) * sr));
  for (let i = 0; i < a; i++) d[i] *= i / a;
  for (let i = 0; i < b; i++) d[n - 1 - i] *= i / b;
}

/**
 * Fold the tail of an over-long buffer back over its head so a bed can loop forever
 * without a seam. Equal-power weights keep the noise energy constant through the splice.
 */
function crossfadeLoop(src, sr, fadeSec) {
  const f = Math.max(1, Math.min(Math.floor(fadeSec * sr), Math.floor(src.length / 3)));
  const n = src.length - f;
  const out = new Float32Array(n);
  out.set(src.subarray(0, n));
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = out[i] * Math.sqrt(t) + src[n + i] * Math.sqrt(1 - t);
  }
  return out;
}

function mixInto(dst, src, gain, offsetSamples) {
  const o = offsetSamples || 0;
  const to = Math.min(dst.length, o + src.length);
  for (let i = o; i < to; i++) dst[i] += src[i - o] * gain;
}

/** A short metallic cluster: what armour and a sword guard sound like when struck. */
function addMetalCluster(d, sr, f0, spread, count, amp, tauBase, rng, startSec) {
  const s = Math.floor((startSec || 0) * sr);
  for (let k = 0; k < count; k++) {
    const r = 1 + k * spread * (0.7 + rng() * 0.6);
    const tau = tauBase * (0.9 - k * 0.09) * (0.7 + rng() * 0.6);
    addPartial(d, sr, f0 * r, (amp / (1 + k * 0.85)) * (0.6 + rng() * 0.8), Math.max(0.02, tau), rng() * 6.283, s);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   AudioSystem
   ──────────────────────────────────────────────────────────────────────────── */

export class AudioSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.ac = null;
    this.ok = false;              // graph exists and buffers rendered
    this._runtime = false;        // beds + music are live (post-unlock)
    this._unlockWanted = false;
    this.onProgress = null;

    /** name -> [{ buffer, base }] — `base` is the rendered pitch for pitched material. */
    this.buffers = new Map();
    this.irs = new Map();

    this.buses = null;
    this.busList = [];
    this._chans = [];
    this.maxVoices = 32;

    // Mix state
    this.vol = { master: 0.9, sfx: 1.0, music: 0.62, ambience: 0.5, ui: 0.7 };
    this._settingsRaw = '';
    this._rateScale = 1;
    this._tsSmooth = 1;
    this._pain = 0;
    this._lastSfxCut = 20000;
    this._lastMusCut = 20000;
    this._victoryUntil = 0;
    this._ambDensity = 1;
    this._hrtf = true;
    this._noiseBuf = null;
    this._irBuild = null;
    this._musicTimer = null;
    this.bedWind = null;
    this.bedRain = null;
    this.bedStream = null;

    // Listener / spatial scratch — allocated once, mutated in place.
    this._lx = 0; this._ly = 1.6; this._lz = 0;
    this._rayOrigin = new Vector3();
    this._rayDir = new Vector3();
    this._probe = new Vector3();
    this._occlusionOk = true;
    this._occlBudget = 0;

    // Reverb
    this.convs = [null, null];
    this.convGains = [null, null];
    this._activeConv = 0;
    this.zone = '';
    this._zoneFnOk = true;

    // Timers (seconds, real time)
    this._acc025 = 0;
    this._acc2 = 0;
    this._tCrow = 6 + Math.random() * 14;
    this._tBamboo = 9 + Math.random() * 12;
    this._tLeaf = 3 + Math.random() * 6;
    this._tChime = 12 + Math.random() * 20;
    this._tThunder = 40 + Math.random() * 60;
    this._tBell = 95 + Math.random() * 120;
    this._gustArmed = true;

    // Combat / mood heuristics
    this._heat = 0;
    this._engaged = 0;
    this._silentUntil = 0;
    this._lastStab = 0;
    this._stanceOf = new Map();

    // Per-name retrigger guard
    this._lastPlay = new Map();

    this.music = {
      enabled: true,
      mood: 'explore',
      prev: null,
      blendStart: 0,
      blendEnd: 0,
      step: 0,
      nextTime: 0,
      root: 146.832,            // D3 — low enough for taiko to sit under, high enough for koto
      intensity: 0,
      density: 1,
      thin: 0,
      drone: null,
    };

    this._live = new Set();
    this._unsubs = [];
    this._tasks = [];

    // Bound handlers (subscribed once, unsubscribed in dispose).
    this._onHit = (p) => this._handleHit(p);
    this._onParry = (p) => this._handleParry(p);
    this._onClash = (p) => this._handleClash(p);
    this._onDeath = (p) => this._handleDeath(p);
    this._onFootstep = (p) => this._handleFootstep(p);
    this._onSlash = (p) => this._handleSlash(p);
    this._onHitstop = (p) => this._handleHitstop(p);
    this._onPostureBreak = (p) => this._handlePostureBreak(p);
    this._onDamage = (p) => this._handleDamage(p);
    this._onStance = (p) => this._handleStance(p);
    this._onObjective = (p) => this._handleObjective(p);
    this._onStorage = () => { this._settingsRaw = ''; this._loadSettings(); };
    this._onVisibility = () => {
      if (!document.hidden && this._unlockWanted) this.unlock();
    };
    this._retryUnlock = () => { if (this._unlockWanted || this.ok) this.unlock(); };
  }

  /* ── lifecycle ──────────────────────────────────────────────────────────── */

  async init() {
    try {
      if (!this._createContext()) return;
      this._buildGraph();
      this._loadSettings();
      this._buildTasks();
      await this._synthesize();
      this._buildIRIndex();
      this.ok = true;
      this.applyQuality(this.ctx.quality);
      this._wireEvents();
      window.addEventListener('storage', this._onStorage);
      document.addEventListener('visibilitychange', this._onVisibility);
      // iOS can suspend the context again after an interruption; any later gesture re-arms it.
      window.addEventListener('pointerdown', this._retryUnlock, { passive: true });
      if (this._unlockWanted) await this.unlock();
    } catch (err) {
      console.warn('[audio] disabled:', err);
      this.ok = false;
    }
  }

  _createContext() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      // Constructing before a gesture is legal; it simply starts suspended, and we need
      // the real sample rate now so every buffer we render matches the device.
      this.ac = new AC({ latencyHint: 'interactive' });
      return !!this.ac;
    } catch {
      this.ac = null;
      return false;
    }
  }

  /** Idempotent, safe before init() has finished, and never throws. */
  async unlock() {
    this._unlockWanted = true;
    try {
      if (!this.ac && !this._createContext()) return;
      if (this.ac.state !== 'running') await this.ac.resume();
    } catch { /* autoplay policy or low-power mode: stay silent */ }
    try {
      if (this.ok && this.ac && this.ac.state === 'running' && !this._runtime) this._startRuntime();
    } catch (err) {
      console.warn('[audio] runtime start failed', err);
    }
  }

  get running() {
    return this.ok && this._runtime && this.ac !== null && this.ac.state === 'running';
  }

  /* ── graph ──────────────────────────────────────────────────────────────── */

  _buildGraph() {
    const ac = this.ac;

    // Brickwall-ish limiter: a compressor with no knee, a huge ratio and a fast attack.
    // It exists so a five-enemy clash cannot clip the phone speaker, not to glue the mix.
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.0015;
    this.limiter.release.value = 0.12;
    this.limiter.connect(ac.destination);

    this.master = ac.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(this.limiter);

    // Reverb return: two convolvers so a room change is a cross-fade, not a cut.
    this.reverbIn = ac.createGain();
    this.reverbIn.gain.value = 1;
    this.reverbHP = ac.createBiquadFilter();
    this.reverbHP.type = 'highpass';
    this.reverbHP.frequency.value = 150;
    this.reverbLP = ac.createBiquadFilter();
    this.reverbLP.type = 'lowpass';
    this.reverbLP.frequency.value = 7200;
    this.reverbOut = ac.createGain();
    this.reverbOut.gain.value = 1;
    this.reverbHP.connect(this.reverbLP);
    this.reverbLP.connect(this.reverbOut);
    this.reverbOut.connect(this.master);
    for (let i = 0; i < 2; i++) {
      const cv = ac.createConvolver();
      cv.normalize = true;
      const g = ac.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      this.reverbIn.connect(cv);
      cv.connect(g);
      g.connect(this.reverbHP);
      this.convs[i] = cv;
      this.convGains[i] = g;
    }

    const mkBus = (name, level, send) => {
      const input = ac.createGain();
      const duck = ac.createGain();
      const filter = ac.createBiquadFilter();
      const vol = ac.createGain();
      const sendGain = ac.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.Q.value = 0.5;
      duck.gain.value = 1;
      vol.gain.value = level;
      sendGain.gain.value = send;
      input.connect(duck);
      duck.connect(filter);
      filter.connect(vol);
      vol.connect(this.master);
      input.connect(sendGain);
      sendGain.connect(this.reverbIn);
      const bus = { name, input, duck, filter, vol, send: sendGain, level, sendLevel: send };
      this.busList.push(bus);
      return bus;
    };

    this.buses = {
      sfx: mkBus('sfx', this.vol.sfx, 0.22),
      music: mkBus('music', this.vol.music, 0.10),
      ambience: mkBus('ambience', this.vol.ambience, 0.16),
      ui: mkBus('ui', this.vol.ui, 0.0),
    };
  }

  /* ── voice pool ─────────────────────────────────────────────────────────── */

  _makeChannel() {
    const ac = this.ac;
    const ch = {
      gain: ac.createGain(),
      lp: ac.createBiquadFilter(),
      panner: ac.createPanner(),
      src: null,
      out: null,
      busNode: null,
      active: false,
      retiring: false,
      name: '',
      priority: 0,
      startTime: 0,
      endTime: 0,
      onEnded: null,
    };
    ch.lp.type = 'lowpass';
    ch.lp.frequency.value = 20000;
    ch.lp.Q.value = 0.4;
    const p = ch.panner;
    p.panningModel = this._hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2.6;
    p.rolloffFactor = 0.92;
    p.maxDistance = 140;
    p.coneInnerAngle = 360;
    ch.gain.connect(ch.lp);
    ch.lp.connect(ch.panner);
    ch.onEnded = (e) => { if (ch.src === e.target) this._release(ch); };
    this._chans.push(ch);
    return ch;
  }

  _acquire(priority) {
    for (let i = 0; i < this._chans.length; i++) {
      const c = this._chans[i];
      if (!c.active && !c.retiring) return c;
    }
    if (this._chans.length < this.maxVoices) return this._makeChannel();
    // Steal the least important voice; ties break toward the oldest.
    let victim = null;
    for (let i = 0; i < this._chans.length; i++) {
      const c = this._chans[i];
      if (!c.active) continue;
      if (!victim || c.priority < victim.priority ||
        (c.priority === victim.priority && c.startTime < victim.startTime)) victim = c;
    }
    if (!victim || victim.priority > priority) return null;
    this._retire(victim);
    return this._makeChannel();
  }

  /** Fade the victim out over 12 ms so stealing never clicks. */
  _retire(ch) {
    const t = this.ac.currentTime;
    ch.active = false;
    ch.retiring = true;
    try {
      ch.gain.gain.cancelScheduledValues(t);
      ch.gain.gain.setTargetAtTime(0.0001, t, 0.004);
      if (ch.src) ch.src.stop(t + 0.03);
    } catch { this._release(ch); }
  }

  _release(ch) {
    if (ch.src) {
      try { ch.src.onended = null; ch.src.disconnect(); } catch { /* already gone */ }
      ch.src = null;
    }
    if (ch.out && ch.busNode) { try { ch.out.disconnect(ch.busNode); } catch { /* already gone */ } }
    ch.out = null; ch.busNode = null; ch.active = false; ch.retiring = false; ch.name = '';
    // Stealing can push us past the tier's voice cap; drop the surplus permanently.
    if (this._chans.length > this.maxVoices) {
      const i = this._chans.indexOf(ch);
      if (i >= 0) {
        this._chans.splice(i, 1);
        try { ch.gain.disconnect(); ch.lp.disconnect(); ch.panner.disconnect(); } catch { /* ignore */ }
      }
    }
  }

  _countName(name) {
    let n = 0;
    for (let i = 0; i < this._chans.length; i++) if (this._chans[i].active && this._chans[i].name === name) n++;
    return n;
  }

  /* ── playback core ──────────────────────────────────────────────────────── */

  /**
   * The single path every sound takes. `o` may carry:
   *   gain, rate, detune (cents), bus, priority, when (absolute), loop, lowpass,
   *   variant, freq (for pitched material), minGap, maxSame, noJitter, occlude.
   */
  _playInternal(name, o, positional, x, y, z) {
    if (!this.running) return null;
    const list = this.buffers.get(name);
    if (!list || list.length === 0) return null;
    const ac = this.ac;
    const now = ac.currentTime;
    const when = o && o.when ? Math.max(o.when, now) : now;

    const minGap = o && o.minGap !== undefined ? o.minGap : 0.03;
    if (minGap > 0) {
      const last = this._lastPlay.get(name) || 0;
      if (when - last < minGap) return null;
      this._lastPlay.set(name, when);
    }
    const maxSame = o && o.maxSame !== undefined ? o.maxSame : (name.charCodeAt(0) === 102 ? 3 : 5);
    if (this._countName(name) >= maxSame) return null;

    let dist = 0;
    if (positional) {
      const dx = x - this._lx, dy = y - this._ly, dz = z - this._lz;
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 130) return null;
    }

    const priority = o && o.priority !== undefined ? o.priority : 2;
    const ch = this._acquire(priority);
    if (!ch) return null;

    // Pick a variant so a repeated sound is never the same waveform twice in a row.
    let idx;
    if (o && o.variant !== undefined && o.variant >= 0) idx = o.variant % list.length;
    else idx = (Math.random() * list.length) | 0;
    const entry = list[idx];

    let rate = (o && o.rate !== undefined ? o.rate : 1) * this._rateScale;
    if (o && o.freq && entry.base > 0) rate = (o.freq / entry.base) * (o.rate !== undefined ? o.rate : 1) * this._rateScale;
    let gain = o && o.gain !== undefined ? o.gain : 1;
    if (!(o && o.noJitter)) {
      rate *= 1 + (Math.random() - 0.5) * 0.055;
      gain *= 0.9 + Math.random() * 0.18;
    }
    rate = clamp(rate, 0.06, 6);

    const busName = (o && o.bus) || 'sfx';
    const bus = this.buses[busName] || this.buses.sfx;

    // Occlusion: a wall between us and the source costs level and, mostly, treble.
    let lpFreq = o && o.lowpass ? o.lowpass : 20000;
    if (positional && dist > 3.5 && (!o || o.occlude !== false)) {
      const occ = this._occlusion(x, y, z, dist);
      if (occ > 0) {
        gain *= 1 - 0.55 * occ;
        lpFreq = Math.min(lpFreq, lerp(20000, 520, occ));
      }
    }
    // Air absorption: distant swords are dull, not just quiet.
    if (positional && dist > 12) lpFreq = Math.min(lpFreq, 20000 - Math.min(16000, (dist - 12) * 130));

    const src = ac.createBufferSource();
    src.buffer = entry.buffer;
    src.playbackRate.value = rate;
    if (o && o.detune && src.detune) { try { src.detune.value = o.detune; } catch { /* unsupported */ } }
    if (o && o.loop) { src.loop = true; }
    src.connect(ch.gain);

    const g = ch.gain.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(clamp(gain, 0, 8), when);
    ch.lp.frequency.cancelScheduledValues(when);
    ch.lp.frequency.setValueAtTime(clamp(lpFreq, 120, 20000), when);

    if (positional) {
      const p = ch.panner;
      if (p.positionX) {
        p.positionX.setValueAtTime(x, when);
        p.positionY.setValueAtTime(y, when);
        p.positionZ.setValueAtTime(z, when);
      } else if (p.setPosition) {
        p.setPosition(x, y, z);
      }
      ch.out = p;
    } else {
      ch.out = ch.lp;
    }
    ch.busNode = bus.input;
    try { ch.out.connect(bus.input); } catch { this._release(ch); return null; }

    ch.src = src;
    ch.active = true;
    ch.retiring = false;
    ch.name = name;
    ch.priority = priority;
    ch.startTime = when;
    // Belt and braces: if an `ended` event is ever dropped (it happens on some mobile
    // browsers when the page is backgrounded mid-sound) the sweep in update() reclaims
    // the voice, so the pool cannot silently fill up and mute the game.
    ch.endTime = (o && o.loop) ? Infinity : when + (entry.buffer.duration / rate) + 0.12;
    src.onended = ch.onEnded;
    try { src.start(when); } catch { this._release(ch); return null; }
    return ch;
  }

  /** Cheap binary occlusion probe, budgeted to a few rays per frame. */
  _occlusion(x, y, z, dist) {
    const phys = this.ctx.physics;
    if (!this._occlusionOk || !phys || typeof phys.raycast !== 'function') return 0;
    if (this._occlBudget <= 0) return 0;
    this._occlBudget--;
    try {
      const o = this._rayOrigin, d = this._rayDir;
      o.set(this._lx, this._ly, this._lz);
      d.set(x - this._lx, y - this._ly, z - this._lz);
      const len = d.length();
      if (len < 0.001) return 0;
      d.multiplyScalar(1 / len);
      const hit = phys.raycast(o, d, len - 0.35);
      if (!hit) return 0;
      if (typeof hit === 'object' && typeof hit.distance === 'number' && hit.distance >= len - 0.35) return 0;
      return dist > 25 ? 1 : 0.8;
    } catch {
      this._occlusionOk = false;     // wrong signature — never probe again
      return 0;
    }
  }

  /* ── public API ─────────────────────────────────────────────────────────── */

  play(name, opts) {
    return this._playInternal(name, opts, false, 0, 0, 0);
  }

  playAt(name, position, opts) {
    if (!position) return this._playInternal(name, opts, false, 0, 0, 0);
    return this._playInternal(name, opts, true, position.x || 0, position.y || 0, position.z || 0);
  }

  playXYZ(name, x, y, z, opts) {
    return this._playInternal(name, opts, true, x, y, z);
  }

  setVolume(bus, v) {
    const val = clamp(typeof v === 'number' ? v : 1, 0, 2);
    if (bus === 'master') {
      this.vol.master = val;
      if (this.master) this.master.gain.setTargetAtTime(val, this.ac.currentTime, 0.05);
      return;
    }
    const b = this.buses && this.buses[bus];
    if (!b) return;
    this.vol[bus] = val;
    b.level = val;
    b.vol.gain.setTargetAtTime(val, this.ac.currentTime, 0.05);
  }

  /** Sidechain: pull music and ambience down under an impact, then let them breathe back. */
  duckFor(ms, amount) {
    if (!this.ok || !this.ac) return;
    const t = this.ac.currentTime;
    const target = clamp(1 - (amount === undefined ? 0.4 : amount), 0.02, 1);
    const hold = Math.max(0.02, (ms === undefined ? 220 : ms) / 1000);
    for (let i = 0; i < this.busList.length; i++) {
      const b = this.busList[i];
      if (b.name !== 'music' && b.name !== 'ambience') continue;
      const g = b.duck.gain;
      // Only deepen an existing duck — a light hit must not lift a heavy one.
      if (g.value <= target && g.value < 0.99) continue;
      try {
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
      } catch { g.cancelScheduledValues(t); }
      g.linearRampToValueAtTime(target, t + 0.018);
      g.setTargetAtTime(1, t + hold, 0.16);
    }
  }

  /* ── boot synthesis ─────────────────────────────────────────────────────── */

  get sr() { return this.ac ? this.ac.sampleRate : 48000; }

  _alloc(sec, channels) {
    const n = Math.max(2, Math.floor(sec * this.sr));
    return this.ac.createBuffer(channels || 1, n, this.sr);
  }

  /**
   * Buffers may be rendered at a lower rate than the context and are resampled on
   * playback. Every bed here is band-limited well under 12 kHz, so half rate halves both
   * the synthesis cost and the memory for no audible loss. (Convolver IRs cannot do this
   * — a ConvolverNode rejects any buffer whose rate differs from its context.)
   */
  _allocAt(sec, channels, rate) {
    const n = Math.max(2, Math.floor(sec * rate));
    return this.ac.createBuffer(channels || 1, n, rate);
  }

  get bedRate() { return Math.max(11025, Math.round(this.sr / 2)); }

  /** One channel of a seamless stereo bed; the buffer is published on the last channel. */
  _bedChannel(name, secs, fade, ch, rate, fill) {
    if (!this._bedBuild) this._bedBuild = new Map();
    let buf = this._bedBuild.get(name);
    if (!buf) { buf = this._allocAt(secs, 2, rate); this._bedBuild.set(name, buf); }
    const data = fill();
    buf.copyToChannel(crossfadeLoop(data, rate, fade), ch, 0);
    if (ch === 1) { this._bedBuild.delete(name); this._store(name, buf); }
  }

  _store(name, buffer, base) {
    let l = this.buffers.get(name);
    if (!l) { l = []; this.buffers.set(name, l); }
    l.push({ buffer, base: base || 0 });
  }

  /**
   * Every unit of synthesis is a small closure. The runner spends at most ~9 ms in any
   * one slice and then yields, so the loading bar keeps painting on a phone.
   */
  _buildTasks() {
    const t = this._tasks;
    const push = (label, fn) => t.push({ label, fn });
    let seed = 0x5f3a;
    const nx = () => (seed = (seed * 1664525 + 1013904223) >>> 0);

    // Breath/noise source used by the live shakuhachi voice.
    push('breath', () => {
      const b = this._alloc(2.0, 1);
      const d = b.getChannelData(0);
      fillWhite(d, mulberry32(nx()), 0.5);
      const c = crossfadeLoop(d, this.sr, 0.05);
      b.copyToChannel(c, 0, 0);
      this._noiseBuf = b;
    });

    // ── combat ──────────────────────────────────────────────────────────────
    for (let v = 0; v < 3; v++) push('forging steel', () => this._rSwoosh(false, nx()));
    for (let v = 0; v < 3; v++) push('forging steel', () => this._rSwoosh(true, nx()));
    for (let v = 0; v < 3; v++) push('forging steel', () => this._rHit('Flesh', nx()));
    for (let v = 0; v < 3; v++) push('forging steel', () => this._rHit('Armor', nx()));
    for (let v = 0; v < 2; v++) push('forging steel', () => this._rHit('Wood', nx()));
    for (let v = 0; v < 2; v++) push('forging steel', () => this._rHit('Stone', nx()));
    for (let v = 0; v < 5; v++) {
      const st = { seed: nx(), perfect: v >= 3, data: null };
      push('striking sparks', () => this._clashBegin(st));
      for (let g = 0; g < 3; g++) push('striking sparks', () => this._clashGroup(st, g));
      push('striking sparks', () => this._clashFinish(st));
    }
    for (let v = 0; v < 2; v++) push('抜刀', () => this._rDrawBlade(nx()));
    for (let v = 0; v < 2; v++) push('鯉口', () => this._rSheathe(nx()));
    for (let v = 0; v < 2; v++) push('forging steel', () => this._rBloodSpray(nx()));
    for (let v = 0; v < 2; v++) push('forging steel', () => this._rBodyFall(nx()));
    for (let v = 0; v < 3; v++) push('forging steel', () => this._rDeathGrunt(nx()));

    // ── movement ────────────────────────────────────────────────────────────
    const surfaces = ['grass', 'dirt', 'stone', 'gravel', 'wood', 'water'];
    for (let s = 0; s < surfaces.length; s++) {
      for (let v = 0; v < 4; v++) {
        const sf = surfaces[s];
        push('laying the path', () => this._rFootstep(sf, nx()));
      }
    }
    for (let v = 0; v < 3; v++) push('laying the path', () => this._rDodge(nx()));
    for (let v = 0; v < 2; v++) push('laying the path', () => this._rLand(nx()));
    for (let v = 0; v < 2; v++) push('laying the path', () => this._rJump(nx()));

    // ── world ───────────────────────────────────────────────────────────────
    for (let v = 0; v < 2; v++) push('raising the wind', () => this._rWindGust(nx()));
    const windSeed = nx();
    for (let c = 0; c < 2; c++) { const ch = c; push('raising the wind', () => this._rWindBed(windSeed, ch)); }
    for (let v = 0; v < 3; v++) push('the bamboo sea', () => this._rBamboo(nx()));
    for (let v = 0; v < 3; v++) push('the bamboo sea', () => this._rLeafRustle(nx()));
    const streamSeed = nx();
    for (let c = 0; c < 2; c++) { const ch = c; push('the valley stream', () => this._rWaterStream(streamSeed, ch)); }
    const rainSeed = nx();
    for (let c = 0; c < 2; c++) { const ch = c; push('the coming rain', () => this._rRain(rainSeed, ch)); }
    for (let v = 0; v < 2; v++) push('distant thunder', () => this._rThunder(nx()));
    for (let v = 0; v < 3; v++) push('crows', () => this._rCrow(nx(), v === 2));
    for (let v = 0; v < 2; v++) push('windchime', () => this._rWindChime(nx()));

    // The 梵鐘 is the signature sound and by far the heaviest render, so it is split
    // into one task per partial group to keep every slice short.
    for (let v = 0; v < 2; v++) {
      const st = { seed: nx(), data: null, sr: 0 };
      push('鋳造 the temple bell', () => this._bellBegin(st));
      for (let g = 0; g < 10; g++) push('鋳造 the temple bell', () => this._bellGroup(st, g));
      push('鋳造 the temple bell', () => this._bellFinish(st));
    }

    // ── ui ──────────────────────────────────────────────────────────────────
    push('inking the seal', () => this._rUiTap(nx()));
    push('inking the seal', () => this._rUiConfirm(nx()));
    push('inking the seal', () => this._rUiBack(nx()));
    push('inking the seal', () => this._rUiError(nx()));
    for (let v = 0; v < 2; v++) push('inking the seal', () => this._rStamp(nx()));

    // ── instruments ─────────────────────────────────────────────────────────
    const kotoBases = [146.832, 220.0, 293.665];
    for (let i = 0; i < kotoBases.length; i++) {
      for (let v = 0; v < 2; v++) {
        const f = kotoBases[i];
        push('stringing the koto', () => this._rKoto(f, nx()));
      }
    }
    for (let v = 0; v < 3; v++) push('skinning the taiko', () => this._rTaiko(true, nx()));
    for (let v = 0; v < 3; v++) push('skinning the taiko', () => this._rTaiko(false, nx()));
    for (let v = 0; v < 2; v++) push('skinning the taiko', () => this._rTaikoRim(nx()));
    for (let v = 0; v < 3; v++) push('鈴 suzu', () => this._rSuzu(nx()));

    // ── impulse responses ───────────────────────────────────────────────────
    const zones = ['forest', 'stoneCourtyard', 'interiorWood', 'valley'];
    for (let i = 0; i < zones.length; i++) {
      for (let c = 0; c < 2; c++) {
        const z = zones[i], ch = c, s = nx();
        push('measuring the room', () => this._irTail(z, ch, s));
        push('measuring the room', () => this._irFinish(z, ch, s));
      }
    }
  }

  async _synthesize() {
    const tasks = this._tasks;
    const total = tasks.length;
    let i = 0;
    while (i < total) {
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      while (i < total) {
        const task = tasks[i++];
        try { task.fn(); } catch (err) { console.warn('[audio] synth failed:', task.label, err); }
        const el = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        if (el > 9) break;
      }
      if (this.onProgress) {
        try { this.onProgress(i, total, tasks[Math.min(i, total - 1)].label); } catch { /* ignore */ }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    this._tasks.length = 0;
  }

  /* ── renderers: combat ──────────────────────────────────────────────────── */

  /**
   * A sword swoosh is air, not metal: broadband noise squeezed through a bandpass whose
   * centre rises and falls with the arc (the doppler-ish bend), plus a low resonant body
   * so the heavy variant has weight behind it.
   */
  _rSwoosh(heavy, seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = heavy ? 0.58 : 0.34;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillWhite(nz, rng, 1);

    const fLo = heavy ? 380 : 700;
    const fHi = heavy ? 1900 : 3400;
    const bq = new BQ(sr), bq2 = new BQ(sr);
    const body = new Float32Array(n);
    for (let i = 0; i < n; i += 32) {
      const t = i / n;
      // Rise into the middle of the arc, fall away past it — that is the whole illusion.
      const k = Math.sin(Math.PI * Math.pow(t, 0.85));
      bq.set('bp', fLo + (fHi - fLo) * k, 1.5 + k * 1.4, 0);
      bq2.set('bp', (heavy ? 165 : 260) * (1 + k * 0.35), 4.5, 0);
      const to = Math.min(n, i + 32);
      for (let j = i; j < to; j++) {
        const x = nz[j];
        d[j] = bq.tick(x);
        body[j] = bq2.tick(x);
      }
    }
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const env = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), heavy ? 1.5 : 1.25);
      d[i] = (d[i] * 1.0 + body[i] * (heavy ? 1.5 : 0.8)) * env;
    }
    if (heavy) addPitchedSine(d, sr, 150, 62, 0.16, 0.22, 0.24, Math.floor(n * 0.28));
    // The blade edge cutting past the ear: a brief bright hiss at the apex.
    addNoiseBurst(d, sr, dur * 0.44, 0.09, heavy ? 0.16 : 0.22, 'hp', heavy ? 4200 : 6200, 0.8, rng, 0.006, 1.4);
    fadeEdges(d, sr, 0.004, 0.02);
    normalize(d, heavy ? 0.86 : 0.78);
    this._store(heavy ? 'swordSwooshHeavy' : 'swordSwooshLight', buf);
  }

  _rHit(kind, seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = kind === 'Armor' ? 0.8 : kind === 'Wood' ? 0.45 : kind === 'Stone' ? 0.4 : 0.5;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const n = d.length;

    if (kind === 'Flesh') {
      // Meat is a dull thud with a wet slap on top and almost no ring.
      addPitchedSine(d, sr, 190, 62, 0.035, 0.75, 0.11, 0);
      const wet = new Float32Array(Math.floor(0.16 * sr));
      fillWhite(wet, rng, 1);
      sweep(wet, sr, 'lp', 2400, 320, 1.1, 0.6);
      ampEnv(wet, sr, 0.0006, 0.045, 1.6, 0);
      mixInto(d, wet, 0.55, 0);
      addNoiseBurst(d, sr, 0.0, 0.05, 0.28, 'bp', 1500, 1.1, rng, 0.0004, 1.8);
      addPartial(d, sr, 118, 0.16, 0.09, 0, 0);
    } else if (kind === 'Armor') {
      // Lacquered iron: a hard transient, a clank, and a cluster of inharmonic ring.
      addNoiseBurst(d, sr, 0, 0.03, 0.5, 'hp', 3600, 0.7, rng, 0.0002, 2.2);
      addPitchedSine(d, sr, 260, 96, 0.02, 0.42, 0.07, 0);
      addMetalCluster(d, sr, 1180, 0.62, 7, 0.3, 0.55, rng, 0);
      addMetalCluster(d, sr, 3350, 0.44, 5, 0.14, 0.3, rng, 0.002);
      addPartial(d, sr, 176, 0.2, 0.16, 0, 0);
      softClip(d, 1.15);
    } else if (kind === 'Wood') {
      // A hollow box: three strong modes, damped fast, over a dry knock.
      addNoiseBurst(d, sr, 0, 0.028, 0.42, 'bp', 2100, 0.9, rng, 0.0003, 2.0);
      addPartial(d, sr, 212, 0.4, 0.17, 0, 0);
      addPartial(d, sr, 437 * (0.99 + rng() * 0.02), 0.26, 0.12, 1.1, 0);
      addPartial(d, sr, 861 * (0.99 + rng() * 0.02), 0.16, 0.08, 2.3, 0);
      addPartial(d, sr, 1420, 0.09, 0.05, 0.4, 0);
      addPitchedSine(d, sr, 150, 84, 0.02, 0.3, 0.06, 0);
    } else {
      // Stone: almost all transient, a short grit tail, no sustain at all.
      addNoiseBurst(d, sr, 0, 0.05, 0.62, 'hp', 2600, 0.7, rng, 0.0002, 2.4);
      addNoiseBurst(d, sr, 0.001, 0.09, 0.22, 'bp', 900, 1.2, rng, 0.0004, 1.6);
      addPartial(d, sr, 340, 0.18, 0.035, 0, 0);
      addPartial(d, sr, 1750, 0.1, 0.02, 1.5, 0);
      for (let g = 0; g < 5; g++) {
        addNoiseBurst(d, sr, 0.03 + rng() * 0.16, 0.02, 0.06 * rng(), 'bp', 3000 + rng() * 4000, 2.2, rng, 0.0003, 1.5);
      }
    }
    fadeEdges(d, sr, 0.0004, 0.02);
    normalize(d, 0.9);
    this._store('swordHit' + kind, buf);
  }

  /**
   * Metal on metal. A struck bar is inharmonic — its partials sit near the free-free bar
   * ratios rather than the harmonic series, and each one decays at its own rate. Detuned
   * twins on the loud partials give the beating that makes it feel like real steel.
   */
  _clashBegin(st) {
    st.sr = this.sr;
    st.dur = st.perfect ? 2.8 : 1.5;
    st.data = new Float32Array(Math.floor(st.dur * st.sr));
    st.rng = mulberry32(st.seed);
    st.f0 = (st.perfect ? 660 : 740) * (0.95 + st.rng() * 0.1);
  }

  _clashGroup(st, group) {
    if (!st.data) return;
    const sr = st.sr, d = st.data, rng = st.rng, perfect = st.perfect;
    const ratios = [1, 2.756, 5.404, 8.933, 13.34, 18.64, 24.8];
    const taus = perfect ? [1.7, 1.3, 0.95, 0.7, 0.5, 0.36, 0.26] : [0.8, 0.6, 0.44, 0.31, 0.21, 0.15, 0.11];
    const amps = [0.42, 0.34, 0.26, 0.19, 0.13, 0.09, 0.06];
    const from = group * 3, to = Math.min(ratios.length, from + 3);
    for (let k = from; k < to; k++) {
      const f = st.f0 * ratios[k] * (1 + (rng() - 0.5) * 0.012);
      addPartial(d, sr, f, amps[k], taus[k], rng() * 6.283, 0);
      // A twin a few cents away: the beating is what makes two blades sound like steel.
      addPartial(d, sr, f * (1 + 0.0016 + rng() * 0.0015), amps[k] * 0.7, taus[k] * 0.92, rng() * 6.283, 0);
    }
  }

  _clashFinish(st) {
    if (!st.data) return;
    const sr = st.sr, d = st.data, rng = st.rng;
    if (st.perfect) {
      // The shimmer: a high, slow-decaying halo that keeps ringing after the strike.
      addMetalCluster(d, sr, 4200, 0.31, 8, 0.05, 1.7, rng, 0.004);
      // ...and a sub that rises into the moment instead of falling out of it.
      addPitchedSine(d, sr, 42, 88, 0.5, 0.24, 1.1, 0);
    }
    addNoiseBurst(d, sr, 0, 0.02, 0.55, 'hp', 3800, 0.7, rng, 0.0002, 2.4);
    addNoiseBurst(d, sr, 0, 0.05, 0.2, 'bp', 1500, 1.0, rng, 0.0004, 1.6);
    softClip(d, 1.2);
    fadeEdges(d, sr, 0.0004, 0.06);
    normalize(d, 0.9);
    const buf = this._alloc(st.dur, 1);
    buf.copyToChannel(d, 0, 0);
    st.data = null;
    this._store(st.perfect ? 'parryPerfect' : 'clash', buf);
  }

  /** 抜刀 — the long scrape of the blade leaving the saya, ending in a bright ring. */
  _rDrawBlade(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = 1.15;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillWhite(nz, rng, 1);
    const bq = new BQ(sr);
    // Grain: the scrape is amplitude-modulated by slow noise, not a smooth hiss.
    let g = 0;
    for (let i = 0; i < n; i += 32) {
      const t = i / n;
      bq.set('bp', 1100 + 3600 * Math.pow(t, 1.4), 2.6, 0);
      const to = Math.min(n, i + 32);
      for (let j = i; j < to; j++) {
        g += ((rng() * 2 - 1) - g) * 0.02;
        const env = Math.pow(t, 0.5) * (1 - Math.pow(t, 3)) * (0.6 + 0.4 * (g * 0.5 + 0.5));
        d[j] = bq.tick(nz[j]) * env * 0.7;
      }
    }
    const ringAt = Math.floor(n * 0.62);
    addPartial(d, sr, 2380, 0.2, 0.62, 0, ringAt);
    addPartial(d, sr, 3710, 0.13, 0.48, 1.2, ringAt);
    addPartial(d, sr, 5150, 0.08, 0.34, 2.4, ringAt);
    addPartial(d, sr, 7400, 0.04, 0.2, 0.6, ringAt);
    addNoiseBurst(d, sr, 0.6, 0.05, 0.16, 'hp', 5200, 0.8, rng, 0.001, 1.6);
    fadeEdges(d, sr, 0.01, 0.06);
    normalize(d, 0.72);
    this._store('drawBlade', buf);
  }

  /** 鯉口 — a short descending scrape and the little wooden click as it seats home. */
  _rSheathe(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = 0.55;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(Math.floor(n * 0.7));
    fillWhite(nz, rng, 1);
    sweep(nz, sr, 'bp', 3400, 820, 2.2, 0.8);
    ampEnv(nz, sr, 0.02, 0.16, 1.3, 0);
    mixInto(d, nz, 0.5, 0);
    const clickAt = Math.floor(n * 0.72);
    addNoiseBurst(d, sr, clickAt / sr, 0.02, 0.45, 'bp', 2300, 1.4, rng, 0.0002, 2.2);
    addPartial(d, sr, 940, 0.18, 0.035, 0, clickAt);
    addPartial(d, sr, 1830, 0.1, 0.022, 1.4, clickAt);
    addPartial(d, sr, 320, 0.12, 0.05, 0, clickAt);
    fadeEdges(d, sr, 0.006, 0.03);
    normalize(d, 0.8);
    this._store('sheathe', buf);
  }

  /** Kept deliberately abstract: a wet hiss, not gore. */
  _rBloodSpray(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.4, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillWhite(nz, rng, 1);
    sweep(nz, sr, 'bp', 3600, 700, 1.0, 0.55);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const wob = 0.75 + 0.25 * Math.sin(i * 0.004 + rng() * 0.02);
      d[i] = nz[i] * Math.exp(-t * 5.5) * wob * 0.6;
    }
    for (let k = 0; k < 4; k++) {
      addNoiseBurst(d, sr, 0.05 + rng() * 0.2, 0.03, 0.08, 'bp', 800 + rng() * 1400, 3.0, rng, 0.0005, 1.4);
    }
    fadeEdges(d, sr, 0.002, 0.03);
    normalize(d, 0.55);
    this._store('bloodSpray', buf);
  }

  _rBodyFall(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.85, 1);
    const d = buf.getChannelData(0);
    addPitchedSine(d, sr, 120, 44, 0.05, 0.8, 0.16, 0);
    addNoiseBurst(d, sr, 0, 0.16, 0.34, 'lp', 700, 0.8, rng, 0.001, 1.5);
    addNoiseBurst(d, sr, 0.004, 0.1, 0.14, 'bp', 2400, 1.0, rng, 0.001, 1.4);
    // The armour and scabbard land a beat after the body does.
    const second = 0.17 + rng() * 0.08;
    addPitchedSine(d, sr, 90, 40, 0.04, 0.32, 0.1, Math.floor(second * sr));
    addNoiseBurst(d, sr, second, 0.1, 0.16, 'lp', 900, 0.8, rng, 0.001, 1.4);
    addMetalCluster(d, sr, 2600, 0.5, 4, 0.05, 0.18, rng, second + 0.01);
    fadeEdges(d, sr, 0.001, 0.05);
    normalize(d, 0.85);
    this._store('bodyFall', buf);
  }

  /**
   * A restrained vocal burst: a glottal pulse train with a falling pitch, shaped by three
   * formants. Enough to read as human, deliberately short of anything graphic.
   */
  _rDeathGrunt(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.6, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const src = new Float32Array(n);
    const f0 = 108 + rng() * 34;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * (1 - 0.28 * Math.min(1, t / 0.42));
      ph += f / sr;
      if (ph >= 1) ph -= 1;
      // Rosenberg-ish glottal pulse — richer than a saw, less buzzy than a square.
      const x = ph < 0.42 ? 0.5 - 0.5 * Math.cos(Math.PI * ph / 0.42) : (ph < 0.62 ? Math.cos(Math.PI * 0.5 * (ph - 0.42) / 0.2) : 0);
      src[i] = x * 2 - 0.6 + (rng() * 2 - 1) * 0.08;
    }
    const F = [560 + rng() * 90, 1120 + rng() * 160, 2480 + rng() * 300];
    const Q = [7, 9, 11];
    for (let k = 0; k < 3; k++) {
      const band = new Float32Array(n);
      band.set(src);
      filt(band, sr, 'bp', F[k], Q[k], 0);
      mixInto(d, band, [1, 0.5, 0.22][k], 0);
    }
    ampEnv(d, sr, 0.014, 0.16, 1.3, 0);
    addNoiseBurst(d, sr, 0.05, 0.28, 0.09, 'bp', 1400, 0.7, rng, 0.02, 1.1);
    fadeEdges(d, sr, 0.006, 0.05);
    normalize(d, 0.62);
    this._store('deathGrunt', buf);
  }

  /* ── renderers: movement ────────────────────────────────────────────────── */

  /** Cloth: band-limited noise with a slow amplitude wobble, so it breathes. */
  _addCloth(d, sr, rng, amp, startSec, dur) {
    const n = Math.floor(dur * sr);
    const tmp = new Float32Array(n);
    fillWhite(tmp, rng, 1);
    filt(tmp, sr, 'bp', 1800 + rng() * 900, 0.8, 0);
    filt(tmp, sr, 'hp', 700, 0.7, 0);
    let w = 0;
    for (let i = 0; i < n; i++) {
      w += ((rng() * 2 - 1) - w) * 0.006;
      const t = i / n;
      tmp[i] *= Math.pow(Math.sin(Math.PI * t), 1.4) * (0.55 + 0.45 * (w * 0.5 + 0.5));
    }
    mixInto(d, tmp, amp, Math.floor(startSec * sr));
  }

  /** Armour jingle: a couple of tiny high inharmonic pings, sparse enough to stay classy. */
  _addJingle(d, sr, rng, amp, startSec) {
    const count = 2 + ((rng() * 3) | 0);
    for (let k = 0; k < count; k++) {
      const at = startSec + rng() * 0.06;
      const f = 3200 + rng() * 4200;
      addPartial(d, sr, f, amp * (0.5 + rng() * 0.5), 0.05 + rng() * 0.09, rng() * 6.28, Math.floor(at * sr));
      addPartial(d, sr, f * 2.31, amp * 0.35 * rng(), 0.03 + rng() * 0.05, rng() * 6.28, Math.floor(at * sr));
    }
  }

  /**
   * A footstep is a transient plus a body resonance. The transient carries the surface
   * (what the boot lands *on*); the resonance carries the mass (who is wearing the boot).
   */
  _rFootstep(surface, seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = surface === 'water' ? 0.5 : 0.34;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);

    switch (surface) {
      case 'grass': {
        addNoiseBurst(d, sr, 0, 0.13, 0.34, 'bp', 2600 + rng() * 900, 0.7, rng, 0.001, 1.3);
        addNoiseBurst(d, sr, 0.012, 0.09, 0.16, 'hp', 5200, 0.6, rng, 0.002, 1.2);
        addPitchedSine(d, sr, 95, 62, 0.03, 0.16, 0.05, 0);
        for (let k = 0; k < 3; k++) addNoiseBurst(d, sr, 0.03 + rng() * 0.1, 0.03, 0.05, 'bp', 3500 + rng() * 3000, 2.0, rng, 0.001, 1.2);
        break;
      }
      case 'dirt': {
        addNoiseBurst(d, sr, 0, 0.1, 0.4, 'lp', 1100 + rng() * 300, 0.8, rng, 0.0008, 1.5);
        addPitchedSine(d, sr, 128, 58, 0.025, 0.34, 0.06, 0);
        addPartial(d, sr, 190, 0.1, 0.04, 0, 0);
        break;
      }
      case 'stone': {
        addNoiseBurst(d, sr, 0, 0.045, 0.5, 'bp', 2700 + rng() * 700, 1.1, rng, 0.0003, 2.0);
        addNoiseBurst(d, sr, 0, 0.02, 0.24, 'hp', 6000, 0.7, rng, 0.0002, 2.4);
        addPartial(d, sr, 410 * (0.96 + rng() * 0.08), 0.16, 0.045, 0, 0);
        addPartial(d, sr, 1180, 0.08, 0.022, 1.2, 0);
        addPitchedSine(d, sr, 150, 78, 0.018, 0.2, 0.04, 0);
        break;
      }
      case 'gravel': {
        // Many small grains rather than one hit — the ear counts them and hears loose stone.
        addNoiseBurst(d, sr, 0, 0.05, 0.3, 'bp', 2200, 0.9, rng, 0.0005, 1.6);
        const grains = 7 + ((rng() * 5) | 0);
        for (let k = 0; k < grains; k++) {
          addNoiseBurst(d, sr, rng() * 0.11, 0.018, 0.1 + rng() * 0.16, 'bp', 3200 + rng() * 5200, 2.6, rng, 0.0002, 2.0);
        }
        addPitchedSine(d, sr, 112, 60, 0.02, 0.16, 0.045, 0);
        break;
      }
      case 'wood': {
        addNoiseBurst(d, sr, 0, 0.035, 0.34, 'bp', 1900, 1.0, rng, 0.0004, 2.0);
        addPartial(d, sr, 178 * (0.97 + rng() * 0.06), 0.36, 0.11, 0, 0);
        addPartial(d, sr, 424 * (0.97 + rng() * 0.06), 0.2, 0.075, 1.3, 0);
        addPartial(d, sr, 905, 0.11, 0.045, 2.6, 0);
        addPartial(d, sr, 1560, 0.05, 0.025, 0.9, 0);
        addPitchedSine(d, sr, 90, 52, 0.03, 0.2, 0.07, 0);
        break;
      }
      default: {
        // Water: a rising splash, then droplets falling back.
        const n = Math.floor(0.3 * sr);
        const tmp = new Float32Array(n);
        fillWhite(tmp, rng, 1);
        sweep(tmp, sr, 'bp', 500, 4200, 0.8, 0.6);
        ampEnv(tmp, sr, 0.004, 0.075, 1.2, 0);
        mixInto(d, tmp, 0.62, 0);
        addNoiseBurst(d, sr, 0, 0.06, 0.22, 'lp', 900, 0.8, rng, 0.001, 1.4);
        for (let k = 0; k < 6; k++) {
          const at = 0.06 + rng() * 0.26;
          addPartial(d, sr, 1600 + rng() * 2600, 0.05 + rng() * 0.05, 0.012, rng() * 6.28, Math.floor(at * sr));
          addNoiseBurst(d, sr, at, 0.02, 0.05, 'bp', 2400 + rng() * 2400, 3.0, rng, 0.0004, 1.6);
        }
        break;
      }
    }
    this._addCloth(d, sr, rng, 0.1, 0.005, 0.2);
    if (rng() < 0.75) this._addJingle(d, sr, rng, 0.035, 0.01);
    fadeEdges(d, sr, 0.0005, 0.02);
    normalize(d, 0.8);
    this._store('footstep_' + surface, buf);
  }

  _rDodge(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.42, 1);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillPink(nz, rng, 1);
    const bq = new BQ(sr);
    for (let i = 0; i < n; i += 32) {
      const t = i / n;
      const k = Math.sin(Math.PI * Math.pow(t, 0.9));
      bq.set('bp', 420 + 1500 * k, 1.1, 0);
      const to = Math.min(n, i + 32);
      for (let j = i; j < to; j++) d[j] = bq.tick(nz[j]) * Math.pow(Math.sin(Math.PI * Math.pow(j / n, 0.8)), 1.3);
    }
    this._addCloth(d, sr, rng, 0.5, 0.0, 0.34);
    this._addJingle(d, sr, rng, 0.05, 0.02);
    fadeEdges(d, sr, 0.004, 0.03);
    normalize(d, 0.62);
    this._store('dodgeWhoosh', buf);
  }

  _rLand(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.6, 1);
    const d = buf.getChannelData(0);
    addPitchedSine(d, sr, 150, 46, 0.035, 0.9, 0.13, 0);
    addNoiseBurst(d, sr, 0, 0.12, 0.4, 'lp', 1400, 0.8, rng, 0.0006, 1.6);
    addNoiseBurst(d, sr, 0, 0.04, 0.2, 'bp', 3200, 1.0, rng, 0.0003, 2.0);
    this._addCloth(d, sr, rng, 0.22, 0.005, 0.26);
    this._addJingle(d, sr, rng, 0.09, 0.008);
    fadeEdges(d, sr, 0.0005, 0.04);
    normalize(d, 0.88);
    this._store('land', buf);
  }

  _rJump(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.4, 1);
    const d = buf.getChannelData(0);
    addNoiseBurst(d, sr, 0, 0.07, 0.3, 'bp', 1700, 0.9, rng, 0.002, 1.4);
    addPitchedSine(d, sr, 110, 70, 0.02, 0.18, 0.05, 0);
    this._addCloth(d, sr, rng, 0.34, 0.0, 0.3);
    // A short exhale, very quiet — effort, not a shout.
    addNoiseBurst(d, sr, 0.01, 0.18, 0.09, 'bp', 900, 0.9, rng, 0.01, 1.1);
    fadeEdges(d, sr, 0.003, 0.03);
    normalize(d, 0.6);
    this._store('jump', buf);
  }

  /* ── renderers: world ───────────────────────────────────────────────────── */

  _rWindGust(seed) {
    const sr = this.bedRate, rng = mulberry32(seed);
    const buf = this._allocAt(4.2, 1, sr);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillPink(nz, rng, 1);
    const bq = new BQ(sr), whistle = new BQ(sr);
    let w = 0;
    for (let i = 0; i < n; i += 32) {
      const t = i / n;
      const swell = Math.pow(Math.sin(Math.PI * t), 1.6);
      w += ((rng() * 2 - 1) - w) * 0.08;
      bq.set('bp', 300 + 700 * swell + w * 120, 0.7, 0);
      whistle.set('bp', 1400 + 2200 * swell, 6.0, 0);
      const to = Math.min(n, i + 32);
      for (let j = i; j < to; j++) {
        const x = nz[j];
        d[j] = (bq.tick(x) * 1.0 + whistle.tick(x) * 0.35 * swell) * swell;
      }
    }
    fadeEdges(d, sr, 0.25, 0.5);
    normalize(d, 0.62);
    this._store('windGust', buf);
  }

  /** The always-on wind bed: a seamless stereo loop, decorrelated between channels. */
  _rWindBed(seed, ch) {
    const sr = this.bedRate;
    const secs = 7.5, fade = 0.9;
    this._bedChannel('windBed', secs, fade, ch, sr, () => {
      const nFull = Math.floor((secs + fade) * sr);
      const rng = mulberry32(seed + ch * 7919);
      const tmp = new Float32Array(nFull);
      fillPink(tmp, rng, 1);
      const bq = new BQ(sr);
      let w = 0;
      for (let i = 0; i < nFull; i += 64) {
        w += ((rng() * 2 - 1) - w) * 0.05;
        bq.set('lp', 520 + w * 260, 0.6, 0);
        const to = Math.min(nFull, i + 64);
        for (let j = i; j < to; j++) tmp[j] = bq.tick(tmp[j]);
      }
      filt(tmp, sr, 'hp', 60, 0.7, 0);
      normalize(tmp, 0.7);
      return tmp;
    });
  }

  /** ししおどし flavour: a struck bamboo tube — closed-pipe modes plus a hard clack. */
  _rBamboo(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(1.1, 1);
    const d = buf.getChannelData(0);
    const f0 = 240 + rng() * 220;
    const ratios = [1, 2.76, 5.02, 8.1];
    const taus = [0.5, 0.3, 0.18, 0.1];
    for (let k = 0; k < ratios.length; k++) {
      addPartial(d, sr, f0 * ratios[k] * (1 + (rng() - 0.5) * 0.01), 0.4 / (1 + k * 1.1), taus[k], rng() * 6.28, 0);
    }
    addPartial(d, sr, f0 * 1.005, 0.18, 0.42, 1.2, 0);      // a twin for the hollow beat
    addNoiseBurst(d, sr, 0, 0.02, 0.42, 'bp', 3100, 1.2, rng, 0.0002, 2.2);
    addNoiseBurst(d, sr, 0, 0.05, 0.16, 'lp', 800, 0.8, rng, 0.0006, 1.6);
    fadeEdges(d, sr, 0.0004, 0.05);
    normalize(d, 0.75);
    this._store('bambooKnock', buf);
  }

  _rLeafRustle(seed) {
    const sr = this.bedRate, rng = mulberry32(seed);
    const buf = this._allocAt(1.4, 1, sr);
    const d = buf.getChannelData(0);
    const grains = 26 + ((rng() * 16) | 0);
    for (let k = 0; k < grains; k++) {
      const at = rng() * 1.15;
      const env = Math.pow(Math.sin(Math.PI * (at / 1.4)), 0.7);
      addNoiseBurst(d, sr, at, 0.035 + rng() * 0.05, (0.05 + rng() * 0.12) * env, 'bp', 2400 + rng() * 5200, 1.6, rng, 0.004, 1.1);
    }
    filt(d, sr, 'hp', 900, 0.7, 0);
    fadeEdges(d, sr, 0.05, 0.2);
    normalize(d, 0.45);
    this._store('leafRustle', buf);
  }

  _rWaterStream(seed, ch) {
    const sr = this.bedRate;
    const secs = 6.0, fade = 0.8;
    this._bedChannel('waterStream', secs, fade, ch, sr, () => {
      const nFull = Math.floor((secs + fade) * sr);
      const rng = mulberry32(seed + ch * 104729);
      const tmp = new Float32Array(nFull);
      fillWhite(tmp, rng, 1);
      filt(tmp, sr, 'bp', 1500, 0.55, 0);
      filt(tmp, sr, 'hp', 420, 0.7, 0);
      // Bubbles: short rising sines are what separate a stream from plain hiss.
      for (let k = 0; k < 140; k++) {
        const at = rng() * secs;
        const f = 900 + rng() * 2600;
        addPartial(tmp, sr, f, 0.05 + rng() * 0.07, 0.008 + rng() * 0.02, rng() * 6.28, Math.floor(at * sr));
      }
      normalize(tmp, 0.6);
      return tmp;
    });
  }

  _rRain(seed, ch) {
    const sr = this.bedRate;
    const secs = 5.0, fade = 0.7;
    this._bedChannel('rain', secs, fade, ch, sr, () => {
      const nFull = Math.floor((secs + fade) * sr);
      const rng = mulberry32(seed + ch * 15485863);
      const tmp = new Float32Array(nFull);
      fillWhite(tmp, rng, 1);
      filt(tmp, sr, 'hp', 700, 0.7, 0);
      filt(tmp, sr, 'lp', 7000, 0.6, 0);
      for (let i = 0; i < nFull; i++) tmp[i] *= 0.5;
      // Individual drops land on top of the hiss; density is what sells the downpour.
      const drops = Math.floor(secs * 240);
      for (let k = 0; k < drops; k++) {
        const at = Math.floor(rng() * nFull);
        const len = 20 + ((rng() * 45) | 0);
        const f = 2200 + rng() * 6000;
        const a = 0.04 + rng() * 0.1;
        const to = Math.min(nFull, at + len);
        const w = (2 * Math.PI * f) / sr;
        for (let i = at; i < to; i++) tmp[i] += Math.sin((i - at) * w) * a * Math.exp(-(i - at) / (len * 0.35));
      }
      normalize(tmp, 0.65);
      return tmp;
    });
  }

  _rThunder(seed) {
    const sr = this.bedRate, rng = mulberry32(seed);
    const buf = this._allocAt(4.6, 1, sr);
    const d = buf.getChannelData(0);
    const n = d.length;
    const nz = new Float32Array(n);
    fillPink(nz, rng, 1);
    const bq = new BQ(sr);
    let w = 0;
    for (let i = 0; i < n; i += 64) {
      w += ((rng() * 2 - 1) - w) * 0.09;
      bq.set('lp', 110 + w * 55, 0.7, 0);
      const to = Math.min(n, i + 64);
      for (let j = i; j < to; j++) {
        const t = j / sr;
        // Rolls: several overlapping swells rather than one clean decay.
        const roll = 0.5 + 0.5 * Math.sin(t * 1.7 + w * 2) * Math.sin(t * 0.63);
        d[j] = bq.tick(nz[j]) * Math.exp(-t / 1.6) * (0.55 + 0.45 * roll);
      }
    }
    // The far-off crack, already softened by kilometres of air.
    addNoiseBurst(d, sr, 0.02, 0.35, 0.28, 'lp', 900, 0.7, rng, 0.004, 1.2);
    addNoiseBurst(d, sr, 0.9 + rng() * 0.6, 0.5, 0.12, 'lp', 420, 0.7, rng, 0.05, 1.1);
    filt(d, sr, 'hp', 28, 0.7, 0);
    fadeEdges(d, sr, 0.02, 0.6);
    normalize(d, 0.7);
    this._store('distantThunder', buf);
  }

  _rCrow(seed, doubled) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = doubled ? 1.0 : 0.55;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const caws = doubled ? 2 : 1;
    for (let c = 0; c < caws; c++) {
      const at = c * (0.42 + rng() * 0.1);
      const n = Math.floor(0.34 * sr);
      const tmp = new Float32Array(n);
      const f0 = 430 + rng() * 90;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = f0 * (1 + 0.16 * Math.exp(-t / 0.05) - 0.22 * Math.min(1, t / 0.3));
        ph += f / sr; if (ph >= 1) ph -= 1;
        // A harsh, glottal rasp — a bird is nothing like a sine.
        tmp[i] = (ph < 0.35 ? 1 : -0.55) * (0.85 + 0.15 * (rng() * 2 - 1));
      }
      filt(tmp, sr, 'bp', 1250 + rng() * 320, 3.2, 0);
      filt(tmp, sr, 'peak', 2900, 2.0, 7);
      ampEnv(tmp, sr, 0.012, 0.11, 1.4, 0);
      mixInto(d, tmp, 0.7 - c * 0.12, Math.floor(at * sr));
    }
    filt(d, sr, 'hp', 500, 0.7, 0);
    fadeEdges(d, sr, 0.004, 0.05);
    normalize(d, 0.5);
    this._store('crow', buf);
  }

  _rWindChime(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(2.6, 1);
    const d = buf.getChannelData(0);
    const strikes = 3 + ((rng() * 3) | 0);
    for (let k = 0; k < strikes; k++) {
      const at = k * (0.09 + rng() * 0.22);
      const deg = (rng() * 5) | 0;
      const f = 880 * Math.pow(2, (MIYAKO[deg] + 12 * ((rng() * 2) | 0)) / 12);
      const s = Math.floor(at * sr);
      // Free-free bar ratios: why a chime sounds like glass and not like a flute.
      addPartial(d, sr, f, 0.3, 1.4, rng() * 6.28, s);
      addPartial(d, sr, f * 2.756, 0.14, 0.9, rng() * 6.28, s);
      addPartial(d, sr, f * 5.404, 0.06, 0.5, rng() * 6.28, s);
      addNoiseBurst(d, sr, at, 0.008, 0.1, 'hp', 5000, 0.8, rng, 0.0002, 2.4);
    }
    fadeEdges(d, sr, 0.002, 0.15);
    normalize(d, 0.5);
    this._store('windChime', buf);
  }

  /* ── the 梵鐘 ───────────────────────────────────────────────────────────── */

  /**
   * A temple bell is not a chord: it is ~20 inharmonic modes, each with its own decay,
   * over a hum tone that outlasts everything. Every loud mode gets a twin a fraction of a
   * hertz away, and the slow beating between them is the sound people actually remember.
   */
  _bellBegin(st) {
    st.sr = this.sr;
    st.dur = 6.8;
    st.data = new Float32Array(Math.floor(st.dur * st.sr));
    st.rng = mulberry32(st.seed);
    st.f0 = 63 + st.rng() * 7;
  }

  _bellGroup(st, group) {
    if (!st.data) return;
    const sr = st.sr, d = st.data, rng = st.rng, f0 = st.f0;
    // ratio, amplitude, decay (seconds) — measured-bell-flavoured, tuned by ear.
    const P = [
      [1.000, 0.50, 7.0], [2.000, 0.42, 5.4], [2.400, 0.20, 3.4], [3.011, 0.30, 4.2],
      [3.620, 0.15, 2.6], [4.166, 0.22, 3.0], [5.043, 0.16, 2.2], [5.412, 0.12, 1.9],
      [6.234, 0.13, 1.7], [6.801, 0.10, 1.5], [7.502, 0.09, 1.3], [8.213, 0.08, 1.15],
      [9.041, 0.07, 1.0], [9.930, 0.06, 0.9], [10.84, 0.055, 0.8], [11.92, 0.05, 0.7],
      [13.10, 0.042, 0.6], [14.41, 0.036, 0.52], [15.88, 0.03, 0.44], [17.52, 0.026, 0.38],
    ];
    // Two partials (four oscillators, counting twins) per slice: the hum and the prime
    // ring for six seconds each, so they are the expensive ones and get their own slots.
    const per = 2;
    const from = group * per;
    const to = Math.min(P.length, from + per);
    for (let k = from; k < to; k++) {
      const p = P[k];
      const f = f0 * p[0] * (1 + (rng() - 0.5) * 0.004);
      addPartial(d, sr, f, p[1], p[2], rng() * 6.28, 0);
      // The twin: 0.15–0.5 Hz away, which is one slow warble every few seconds.
      addPartial(d, sr, f + 0.15 + rng() * 0.35, p[1] * 0.8, p[2] * 0.95, rng() * 6.28, 0);
    }
    if (group === 9) {
      // Strike noise — the shumoku hitting bronze, gone in 40 ms.
      addNoiseBurst(d, sr, 0, 0.04, 0.3, 'bp', 2600, 0.9, rng, 0.0004, 2.0);
      addNoiseBurst(d, sr, 0, 0.012, 0.18, 'hp', 6000, 0.8, rng, 0.0002, 2.6);
      addPitchedSine(d, sr, 160, f0 * 2, 0.03, 0.2, 0.25, 0);
    }
  }

  _bellFinish(st) {
    if (!st.data) return;
    const sr = st.sr;
    const buf = this._alloc(st.dur, 1);
    const d = st.data;
    softClip(d, 0.85);
    fadeEdges(d, sr, 0.0005, 0.5);
    normalize(d, 0.95);
    buf.copyToChannel(d, 0, 0);
    st.data = null;
    this._store('templeBell', buf, st.f0);
  }

  /* ── renderers: UI ──────────────────────────────────────────────────────── */

  /** A little wooden blip — closer to a kokyū tap than a synth beep. */
  _rUiTap(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.18, 1);
    const d = buf.getChannelData(0);
    addPartial(d, sr, 1180, 0.4, 0.035, 0, 0);
    addPartial(d, sr, 2380, 0.16, 0.02, 1.1, 0);
    addPartial(d, sr, 620, 0.14, 0.05, 0.4, 0);
    addNoiseBurst(d, sr, 0, 0.01, 0.2, 'bp', 3400, 1.2, rng, 0.0002, 2.2);
    fadeEdges(d, sr, 0.0004, 0.02);
    normalize(d, 0.55);
    this._store('uiTap', buf);
  }

  _rUiConfirm(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.9, 1);
    const d = buf.getChannelData(0);
    const f = 293.665;
    karplus(d, sr, f, 0.5, 0.995, 0.55, rng, 0);
    karplus(d, sr, f * Math.pow(2, 7 / 12), 0.4, 0.995, 0.5, rng, Math.floor(0.09 * sr));
    filt(d, sr, 'peak', 480, 1.2, 4);
    filt(d, sr, 'lp', 5200, 0.7, 0);
    ampEnv(d, sr, 0.002, 0.35, 1.1, 0);
    fadeEdges(d, sr, 0.001, 0.06);
    normalize(d, 0.6);
    this._store('uiConfirm', buf);
  }

  _rUiBack(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.7, 1);
    const d = buf.getChannelData(0);
    const f = 220;
    karplus(d, sr, f * Math.pow(2, 5 / 12), 0.42, 0.992, 0.4, rng, 0);
    karplus(d, sr, f, 0.38, 0.992, 0.35, rng, Math.floor(0.075 * sr));
    filt(d, sr, 'lp', 2600, 0.7, 0);
    ampEnv(d, sr, 0.002, 0.26, 1.1, 0);
    fadeEdges(d, sr, 0.001, 0.05);
    normalize(d, 0.55);
    this._store('uiBack', buf);
  }

  _rUiError(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.5, 1);
    const d = buf.getChannelData(0);
    // A minor second, low and buzzing: unpleasant on purpose, but not a klaxon.
    addPartial(d, sr, 155, 0.4, 0.22, 0, 0);
    addPartial(d, sr, 164.5, 0.36, 0.2, 1.4, 0);
    addPartial(d, sr, 310, 0.14, 0.12, 0.6, 0);
    addNoiseBurst(d, sr, 0, 0.05, 0.16, 'lp', 1400, 0.9, rng, 0.001, 1.6);
    softClip(d, 1.4);
    fadeEdges(d, sr, 0.002, 0.05);
    normalize(d, 0.6);
    this._store('uiError', buf);
  }

  /** 印 — the hanko coming down: paper, ink, and a soft wooden thud. */
  _rStamp(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.55, 1);
    const d = buf.getChannelData(0);
    addPitchedSine(d, sr, 165, 62, 0.02, 0.55, 0.09, 0);
    addNoiseBurst(d, sr, 0, 0.05, 0.4, 'bp', 1700, 0.9, rng, 0.0003, 2.0);
    addNoiseBurst(d, sr, 0.002, 0.09, 0.16, 'hp', 3800, 0.7, rng, 0.001, 1.4);
    addPartial(d, sr, 320, 0.18, 0.07, 0, 0);
    addPartial(d, sr, 760, 0.09, 0.04, 1.2, 0);
    fadeEdges(d, sr, 0.0005, 0.04);
    normalize(d, 0.85);
    this._store('stampImpact', buf);
  }

  /* ── renderers: instruments ─────────────────────────────────────────────── */

  /** 琴 — Karplus-Strong through a bridge filter, with the plectrum noise left in. */
  _rKoto(base, seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(1.9, 1);
    const d = buf.getChannelData(0);
    karplus(d, sr, base, 0.65, 0.9968, 0.42 + rng() * 0.12, rng, 0);
    // Body: a paulownia soundboard is warm and slightly nasal.
    filt(d, sr, 'peak', 420, 1.1, 5);
    filt(d, sr, 'peak', 1250, 1.6, 3);
    filt(d, sr, 'hp', base * 0.7, 0.7, 0);
    filt(d, sr, 'lp', 6200, 0.7, 0);
    addNoiseBurst(d, sr, 0, 0.012, 0.14, 'bp', 3200, 1.4, rng, 0.0002, 2.2);
    ampEnv(d, sr, 0.0015, 1.15, 1.05, 0);
    fadeEdges(d, sr, 0.001, 0.1);
    normalize(d, 0.72);
    this._store('koto', buf, base);
  }

  /**
   * 太鼓 — a membrane, not a kick drum: a fast pitch collapse under a noise burst that a
   * resonant lowpass sweeps shut, plus the circular-membrane modes that give it its body.
   */
  _rTaiko(low, seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const dur = low ? 1.3 : 0.9;
    const buf = this._alloc(dur, 1);
    const d = buf.getChannelData(0);
    const skin = new Float32Array(Math.floor(dur * 0.5 * sr));
    fillWhite(skin, rng, 1);
    sweep(skin, sr, 'lp', low ? 950 : 1600, low ? 95 : 170, 2.4, 0.4);
    ampEnv(skin, sr, 0.0008, low ? 0.13 : 0.085, 1.5, 0);
    mixInto(d, skin, 0.55, 0);

    const f0 = low ? 57 : 92;
    const modes = [1, 1.594, 2.136, 2.296, 2.653, 2.918];
    for (let k = 0; k < modes.length; k++) {
      addPartial(d, sr, f0 * modes[k] * (1 + (rng() - 0.5) * 0.012), 0.34 / (1 + k * 1.3),
        (low ? 0.6 : 0.4) / (1 + k * 0.55), rng() * 6.28, 0);
    }
    addPitchedSine(d, sr, f0 * 3.2, f0, 0.028, low ? 0.85 : 0.6, low ? 0.34 : 0.2, 0);
    // Shell resonance — the hollowed keyaki trunk behind the skin.
    addPartial(d, sr, low ? 148 : 216, 0.1, 0.12, 0, 0);
    softClip(d, 1.1);
    filt(d, sr, 'hp', 32, 0.7, 0);
    fadeEdges(d, sr, 0.0004, 0.08);
    normalize(d, 0.95);
    this._store('taiko' + (low ? 'Low' : 'High'), buf, f0);
  }

  _rTaikoRim(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(0.35, 1);
    const d = buf.getChannelData(0);
    addNoiseBurst(d, sr, 0, 0.03, 0.5, 'bp', 2600, 1.3, rng, 0.0002, 2.2);
    addPartial(d, sr, 620, 0.24, 0.06, 0, 0);
    addPartial(d, sr, 1490, 0.14, 0.035, 1.3, 0);
    addPartial(d, sr, 2870, 0.07, 0.02, 2.1, 0);
    fadeEdges(d, sr, 0.0004, 0.03);
    normalize(d, 0.7);
    this._store('taikoRim', buf);
  }

  /** 鈴 — a fistful of tiny bells; dozens of short, very high inharmonic taps. */
  _rSuzu(seed) {
    const sr = this.sr, rng = mulberry32(seed);
    const buf = this._alloc(1.25, 1);
    const d = buf.getChannelData(0);
    const hits = 16 + ((rng() * 12) | 0);
    for (let k = 0; k < hits; k++) {
      const at = Math.pow(rng(), 1.4) * 0.9;
      const s = Math.floor(at * sr);
      const f = 3400 + rng() * 4200;
      const a = (0.09 + rng() * 0.13) * (1 - at * 0.6);
      addPartial(d, sr, f, a, 0.1 + rng() * 0.3, rng() * 6.28, s);
      addPartial(d, sr, f * (1.42 + rng() * 0.5), a * 0.5, 0.06 + rng() * 0.16, rng() * 6.28, s);
      addNoiseBurst(d, sr, at, 0.006, a * 0.5, 'hp', 6500, 0.9, rng, 0.0002, 2.4);
    }
    filt(d, sr, 'hp', 1800, 0.7, 0);
    fadeEdges(d, sr, 0.002, 0.2);
    normalize(d, 0.5);
    this._store('suzu', buf);
  }

  /* ── renderers: impulse responses ───────────────────────────────────────── */

  /**
   * Rooms are early reflections plus a frequency-dependent decaying noise tail. Splitting
   * the tail into a bright bed that dies fast and a dark bed that lingers is a cheap,
   * convincing stand-in for air absorption.
   */
  _irConfig(zone) {
    const CFG = {
      forest: { len: 1.7, pre: 0.012, er: 16, erGain: 0.42, lp: 3000, hiTau: 0.20, loTau: 0.5, spread: 0.09 },
      stoneCourtyard: { len: 2.4, pre: 0.020, er: 11, erGain: 0.72, lp: 6800, hiTau: 0.30, loTau: 0.62, spread: 0.06 },
      interiorWood: { len: 0.95, pre: 0.005, er: 20, erGain: 0.65, lp: 2500, hiTau: 0.22, loTau: 0.45, spread: 0.025 },
      valley: { len: 3.3, pre: 0.055, er: 7, erGain: 0.34, lp: 4200, hiTau: 0.26, loTau: 0.58, spread: 0.24 },
    };
    return CFG[zone];
  }

  /** Pass one: the diffuse tail, split into a bright bed and a dark one. */
  _irTail(zone, channel, seed) {
    const cfg = this._irConfig(zone);
    if (!cfg) return;
    const sr = this.sr;
    if (!this._irBuild) this._irBuild = new Map();
    let buf = this._irBuild.get(zone);
    if (!buf) { buf = this._alloc(cfg.len, 2); this._irBuild.set(zone, buf); }
    const rng = mulberry32(seed);
    const d = buf.getChannelData(channel);
    const n = d.length;
    const hi = new Float32Array(n);
    fillWhite(hi, rng, 1);
    filt(hi, sr, 'lp', cfg.lp, 0.7, 0);
    filt(hi, sr, 'hp', 260, 0.7, 0);
    const lo = new Float32Array(n);
    fillWhite(lo, rng, 1);
    filt(lo, sr, 'lp', cfg.lp * 0.22, 0.7, 0);
    const pre = Math.floor(cfg.pre * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      // Two decay rates standing in for air absorption: treble dies first.
      d[i] = hi[i] * Math.exp(-t / (cfg.len * cfg.hiTau)) * 0.75 +
        lo[i] * Math.exp(-t / (cfg.len * cfg.loTau)) * 0.55;
    }
    for (let i = 0; i < pre; i++) d[i] = 0;
    if (zone === 'valley') {
      // A real slapback off the far ridge — the reason a valley reads as a valley.
      const at = pre + Math.floor((0.28 + rng() * 0.06) * sr);
      if (at < n) for (let i = 0; i < 2400 && at + i < n; i++) d[at + i] += hi[i] * 0.35 * Math.exp(-i / 900);
    }
  }

  /** Pass two: early reflections — the geometry cue — then trim and normalise. */
  _irFinish(zone, channel, seed) {
    const cfg = this._irConfig(zone);
    if (!cfg || !this._irBuild) return;
    const buf = this._irBuild.get(zone);
    if (!buf) return;
    const sr = this.sr;
    const rng = mulberry32(seed ^ 0x9e37);
    const d = buf.getChannelData(channel);
    const n = d.length;
    const pre = Math.floor(cfg.pre * sr);
    for (let k = 0; k < cfg.er; k++) {
      const at = pre + Math.floor((0.004 + Math.pow(rng(), 1.3) * cfg.spread) * sr) + channel * 17;
      if (at >= n) continue;
      const a = cfg.erGain * (1 - k / cfg.er) * (0.5 + rng() * 0.7) * (rng() < 0.5 ? -1 : 1);
      d[at] += a;
      if (at + 2 < n) { d[at + 1] += a * 0.5; d[at + 2] += a * 0.22; }
    }
    filt(d, sr, 'hp', zone === 'interiorWood' ? 130 : 85, 0.7, 0);
    fadeEdges(d, sr, 0.0002, cfg.len * 0.25);
    normalize(d, 0.9);
  }

  _buildIRIndex() {
    if (!this._irBuild) return;
    this._irBuild.forEach((buf, zone) => this.irs.set(zone, buf));
    this._irBuild = null;
    const first = this.irs.get('forest') || this.irs.values().next().value;
    if (first && this.convs[0]) {
      try { this.convs[0].buffer = first; } catch { /* ignore */ }
      this.zone = this.irs.has('forest') ? 'forest' : '';
    }
  }

  /* ── runtime: ambience beds and the drone ───────────────────────────────── */

  _startRuntime() {
    if (this._runtime) return;
    const ac = this.ac;
    this._runtime = true;
    this.bedWind = this._bed('windBed');
    this.bedRain = this._bed('rain');
    this.bedStream = this._bed('waterStream');
    this._startDrone();
    this.music.nextTime = ac.currentTime + 0.2;
    this.music.step = 0;
    // A 25 ms tick with 120 ms of lookahead: tight enough for taiko, loose enough that a
    // dropped frame never stutters the score. update() drives it too, as a safety net.
    this._musicTimer = setInterval(() => { try { this._musicTick(); } catch { /* keep playing */ } }, 25);
    this._applyMoodMix(1);
    this._updateZone();
  }

  _bed(name) {
    const list = this.buffers.get(name);
    if (!list || list.length === 0) return null;
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = list[0].buffer;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.buses.ambience.input);
    try { src.start(ac.currentTime + Math.random() * 0.1); } catch { return null; }
    return { src, lp, g };
  }

  _startDrone() {
    const ac = this.ac;
    const root = this.music.root;
    const out = ac.createGain();
    out.gain.value = 0.0001;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 1.2;
    lp.connect(out);
    out.connect(this.buses.music.input);
    const oscs = [];
    const mk = (f, type, g, detune) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      if (o.detune) o.detune.value = detune;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(lp);
      try { o.start(); } catch { /* ignore */ }
      oscs.push(o);
      return o;
    };
    mk(root * 0.5, 'sawtooth', 0.16, -6);
    mk(root * 0.5, 'sawtooth', 0.14, 7);
    mk(root * 0.25, 'sine', 0.4, 0);
    mk(root * 0.75, 'sine', 0.07, 3);      // a bare fifth above — no third, no mode
    // Slow filter drift keeps a held drone from sounding like a stuck oscillator.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.055;
    const lg = ac.createGain();
    lg.gain.value = 110;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    try { lfo.start(); } catch { /* ignore */ }
    this.music.drone = { out, lp, oscs, lfo, base: root };
  }

  /* ── music ──────────────────────────────────────────────────────────────── */

  _noteFreq(deg, octaveOffset) {
    const oct = Math.floor(deg / 5) + (octaveOffset || 0);
    const i = ((deg % 5) + 5) % 5;
    return this.music.root * Math.pow(2, (MIYAKO[i] + 12 * oct) / 12);
  }

  _bpm() {
    const m = this.music;
    switch (m.mood) {
      case 'combat': return 96 + 30 * m.intensity;
      case 'tension': return 62;
      case 'victory': return 72;
      case 'death': return 44;
      default: return 52;
    }
  }

  _stepDur() { return 60 / this._bpm() / 2; }

  setMood(name) {
    if (!this.ok || !this.music) return;
    const m = this.music;
    if (m.mood === name) return;
    const valid = name === 'explore' || name === 'tension' || name === 'combat' ||
      name === 'victory' || name === 'death';
    if (!valid) return;
    const t = this.ac ? this.ac.currentTime : 0;
    const bars = name === 'combat' ? 2 : name === 'death' ? 4 : 3;
    m.prev = m.mood;
    m.mood = name;
    m.blendStart = t;
    m.blendEnd = t + bars * 8 * this._stepDur();
    this._applyMoodMix(0);
    this._onMoodEnter(name, t);
  }

  /** Bus/drone levels for the mood, ramped rather than switched. */
  _applyMoodMix() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const m = this.music;
    const d = m.drone;
    let droneG = 0.0001, musicG = this.vol.music;
    switch (m.mood) {
      case 'explore': droneG = 0.05; musicG = this.vol.music * 0.85; break;
      case 'tension': droneG = 0.24; musicG = this.vol.music; break;
      case 'combat': droneG = 0.14; musicG = this.vol.music * 1.05; break;
      case 'victory': droneG = 0.09; musicG = this.vol.music; break;
      case 'death': droneG = 0.22; musicG = this.vol.music * 0.9; break;
      default: break;
    }
    if (d) {
      d.out.gain.setTargetAtTime(droneG, t, 1.2);
      const f = m.mood === 'death' ? d.base * 0.47 : d.base;
      for (let i = 0; i < d.oscs.length; i++) {
        const o = d.oscs[i];
        const ratio = [0.5, 0.5, 0.25, 0.75][i] || 0.5;
        try { o.frequency.setTargetAtTime(f * ratio, t, m.mood === 'death' ? 3.5 : 1.5); } catch { /* ignore */ }
      }
    }
    if (this.buses) this.buses.music.vol.gain.setTargetAtTime(musicG, t, 1.0);
  }

  /** One-shot gestures that mark the moment a mood begins. */
  _onMoodEnter(mood, t) {
    if (mood === 'victory') {
      this._playInternal('templeBell', { gain: 0.55, bus: 'music', when: t + 0.15, priority: 4, minGap: 0, noJitter: true }, false, 0, 0, 0);
      this._playInternal('suzu', { gain: 0.4, bus: 'music', when: t + 0.5, priority: 3, minGap: 0 }, false, 0, 0, 0);
      this._phrase(t + 1.1, 4, 1, 0.5);
      this._victoryUntil = t + 12;
    } else if (mood === 'death') {
      this._playInternal('templeBell', { gain: 0.6, bus: 'music', when: t + 0.2, rate: 0.82, priority: 4, minGap: 0, noJitter: true }, false, 0, 0, 0);
      this._playInternal('taikoLow', { gain: 0.5, bus: 'music', when: t + 0.05, rate: 0.7, priority: 4, minGap: 0 }, false, 0, 0, 0);
    } else if (mood === 'combat') {
      this._playInternal('taikoLow', { gain: 0.85, bus: 'music', when: t + 0.02, rate: 0.92, priority: 4, minGap: 0 }, false, 0, 0, 0);
    }
  }

  _musicTick() {
    const m = this.music;
    if (!this.running || !m.enabled) return;
    const ac = this.ac;
    const now = ac.currentTime;
    if (m.nextTime < now) m.nextTime = now + 0.02;
    let guard = 0;
    while (m.nextTime < now + 0.12 && guard++ < 48) {
      this._musicStep(m.nextTime, m.step);
      m.step++;
      m.nextTime += this._stepDur();
    }
    if (m.blendEnd > 0 && now >= m.blendEnd) { m.prev = null; m.blendEnd = 0; this._applyMoodMix(); }
    if (this._victoryUntil && now > this._victoryUntil && m.mood === 'victory') {
      this._victoryUntil = 0;
      this.setMood('explore');
    }
  }

  _musicStep(t, step) {
    const m = this.music;
    // Hit-stop and slow-motion pull the score down to almost nothing; the silence is
    // what makes the impact land.
    if (t < this._silentUntil) return;
    if (m.thin > 0.5 && Math.random() < m.thin) return;
    let mood = m.mood;
    if (m.prev && m.blendEnd > m.blendStart) {
      const w = clamp((t - m.blendStart) / (m.blendEnd - m.blendStart), 0, 1);
      if (Math.random() > w) mood = m.prev;
    }
    switch (mood) {
      case 'combat': this._stepCombat(t, step); break;
      case 'tension': this._stepTension(t, step); break;
      case 'victory': this._stepVictory(t, step); break;
      case 'death': break;
      default: this._stepExplore(t, step); break;
    }
  }

  /** Sparse to the point of emptiness. Silence is the instrument. */
  _stepExplore(t, step) {
    const dens = this.music.density;
    if (step % 8 === 0 && Math.random() < 0.11 * dens) {
      this._phrase(t, 2 + ((Math.random() * 3) | 0), 0, 0.32);
      return;
    }
    if (step % 4 === 0 && Math.random() < 0.06 * dens) {
      this._koto(t, this._noteFreq((Math.random() * 5) | 0, Math.random() < 0.3 ? 1 : 0), 0.3 + Math.random() * 0.2);
    }
    if (step % 32 === 0 && Math.random() < 0.10) {
      this._playInternal('suzu', { gain: 0.2, bus: 'music', when: t, priority: 1, minGap: 0 }, false, 0, 0, 0);
    }
    if (step % 64 === 0 && Math.random() < 0.16) {
      this._playInternal('taikoLow', { gain: 0.24, bus: 'music', when: t, rate: 0.85, priority: 1, minGap: 0 }, false, 0, 0, 0);
    }
  }

  /** A drone and a heartbeat that will not settle into a pulse. */
  _stepTension(t, step) {
    const dens = this.music.density;
    if (Math.random() < (0.10 + 0.10 * this.music.intensity) * dens) {
      const low = Math.random() < 0.7;
      this._taiko(t, low, 0.3 + Math.random() * 0.35);
    }
    if (step % 16 === 0 && Math.random() < 0.2 * dens) {
      this._koto(t, this._noteFreq((Math.random() * 3) | 0, -1), 0.3);
    }
    if (step % 24 === 0 && Math.random() < 0.12) {
      this._playInternal('taikoRim', { gain: 0.22, bus: 'music', when: t, priority: 1, minGap: 0 }, false, 0, 0, 0);
    }
  }

  _stepCombat(t, step) {
    const m = this.music;
    const inten = m.intensity;
    const w = TAIKO_PATTERN[step % 8];
    if (w > 0 && Math.random() < 0.55 + 0.45 * inten) {
      this._taiko(t, w > 0.7, (0.45 + 0.55 * w) * (0.65 + 0.45 * inten));
    }
    // Flams and doubles arrive only when the fight is genuinely busy.
    if (inten > 0.55 && step % 8 === 6 && Math.random() < 0.35 + 0.3 * inten) {
      this._taiko(t + 0.055, false, 0.45);
    }
    if (step % 16 === 8 && Math.random() < 0.3 * m.density) {
      this._playInternal('taikoRim', { gain: 0.3, bus: 'music', when: t, priority: 2, minGap: 0 }, false, 0, 0, 0);
    }
    if (step % 32 === 0 && Math.random() < 0.3 + 0.2 * inten) {
      this._phrase(t, 2, 1, 0.42);
    }
    if (step % 64 === 48 && Math.random() < 0.35) {
      this._playInternal('suzu', { gain: 0.22, bus: 'music', when: t, priority: 1, minGap: 0 }, false, 0, 0, 0);
    }
  }

  _stepVictory(t, step) {
    if (step % 8 === 0 && Math.random() < 0.4) {
      this._koto(t, this._noteFreq((Math.random() * 5) | 0, 1), 0.34);
    }
    if (step % 16 === 0 && Math.random() < 0.25) {
      this._playInternal('suzu', { gain: 0.24, bus: 'music', when: t, priority: 1, minGap: 0 }, false, 0, 0, 0);
    }
  }

  _taiko(t, low, vel) {
    this._playInternal(low ? 'taikoLow' : 'taikoHigh', {
      gain: 0.85 * clamp(vel, 0, 1.4), bus: 'music', when: t, priority: 2,
      rate: 0.95 + Math.random() * 0.1, minGap: 0, maxSame: 6,
    }, false, 0, 0, 0);
  }

  _koto(t, freq, vel) {
    this._playInternal('koto', {
      gain: 0.7 * vel, bus: 'music', when: t, freq, priority: 2, minGap: 0, maxSame: 5,
    }, false, 0, 0, 0);
  }

  /**
   * 尺八 — breathy pulse plus noise, with the meri/kari bend into the note and a vibrato
   * that only arrives once the tone has settled. Rendered live because the expression is
   * the instrument; a sampled buffer would flatten it.
   */
  _shakuhachi(freq, when, dur, vel) {
    if (!this.running || !this._noiseBuf) return;
    const ac = this.ac;
    const out = ac.createGain();
    out.gain.value = 0.0001;
    out.connect(this.buses.music.input);

    const body = ac.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = clamp(freq * 5.5, 900, 4600);
    body.Q.value = 0.9;
    const form = ac.createBiquadFilter();
    form.type = 'peaking';
    form.frequency.value = 1150;
    form.Q.value = 1.1;
    form.gain.value = 6;
    body.connect(form);
    form.connect(out);

    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    const oscG = ac.createGain();
    oscG.gain.value = 0.22;
    osc.connect(oscG); oscG.connect(body);

    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    const osc2G = ac.createGain();
    osc2G.gain.value = 0.5;
    osc2.connect(osc2G); osc2G.connect(body);

    const nz = ac.createBufferSource();
    nz.buffer = this._noiseBuf;
    nz.loop = true;
    const nzBP = ac.createBiquadFilter();
    nzBP.type = 'bandpass';
    nzBP.frequency.value = clamp(freq * 2.6, 700, 6000);
    nzBP.Q.value = 0.8;
    const nzG = ac.createGain();
    nzG.gain.value = 0.0001;
    nz.connect(nzBP); nzBP.connect(nzG); nzG.connect(out);

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.3 + Math.random() * 1.4;
    const lfoG = ac.createGain();
    lfoG.gain.value = 0;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    lfoG.connect(osc2.frequency);

    const bendFrom = freq * (Math.random() < 0.55 ? 0.945 : 1.0);
    const atk = 0.075 + Math.random() * 0.06;
    const rel = 0.42;
    osc.frequency.setValueAtTime(bendFrom, when);
    osc2.frequency.setValueAtTime(bendFrom, when);
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.16);
    osc2.frequency.exponentialRampToValueAtTime(freq, when + 0.16);
    // A gentle fall away at the end of the breath.
    osc.frequency.setTargetAtTime(freq * 0.985, when + dur * 0.8, 0.2);
    osc2.frequency.setTargetAtTime(freq * 0.985, when + dur * 0.8, 0.2);
    lfoG.gain.setValueAtTime(0, when);
    lfoG.gain.linearRampToValueAtTime(freq * 0.011, when + Math.min(dur * 0.7, atk + 0.35));

    const g = clamp(vel, 0, 1) * 0.5;
    out.gain.setValueAtTime(0.0001, when);
    out.gain.linearRampToValueAtTime(g, when + atk);
    out.gain.setValueAtTime(g, when + dur);
    out.gain.exponentialRampToValueAtTime(0.0001, when + dur + rel);
    nzG.gain.setValueAtTime(0.0001, when);
    nzG.gain.linearRampToValueAtTime(g * 0.55, when + atk * 0.5);   // breath leads the tone
    nzG.gain.linearRampToValueAtTime(g * 0.18, when + atk + 0.2);
    nzG.gain.setTargetAtTime(0.0001, when + dur, 0.15);

    const stopAt = when + dur + rel + 0.08;
    osc.start(when); osc2.start(when); lfo.start(when); nz.start(when);
    osc.stop(stopAt); osc2.stop(stopAt); lfo.stop(stopAt); nz.stop(stopAt);
    const rec = { nodes: [osc, osc2, lfo, nz, out] };
    this._live.add(rec);
    osc.onended = () => {
      try { out.disconnect(); } catch { /* ignore */ }
      this._live.delete(rec);
    };
  }

  /** A short shakuhachi line: mostly steps within the mode, one leap if it wants one. */
  _phrase(t, count, octave, vel) {
    let deg = 1 + ((Math.random() * 4) | 0);
    let at = t;
    for (let i = 0; i < count; i++) {
      const dur = 0.55 + Math.random() * 1.5;
      this._shakuhachi(this._noteFreq(deg, 1 + (octave || 0)), at, dur, vel * (0.75 + Math.random() * 0.35));
      at += dur + 0.15 + Math.random() * 0.9;
      deg += Math.random() < 0.72 ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() < 0.5 ? -3 : 3);
      deg = clamp(deg, -2, 8);
    }
  }

  /* ── event wiring ───────────────────────────────────────────────────────── */

  _wireEvents() {
    const bus = this.ctx.bus;
    if (!bus) return;
    const u = this._unsubs;
    u.push(bus.on('hit', this._onHit));
    u.push(bus.on('parry', this._onParry));
    u.push(bus.on('clash', this._onClash));
    u.push(bus.on('death', this._onDeath));
    u.push(bus.on('footstep', this._onFootstep));
    u.push(bus.on('slash', this._onSlash));
    u.push(bus.on('hitstop', this._onHitstop));
    u.push(bus.on('posture-break', this._onPostureBreak));
    u.push(bus.on('damage-taken', this._onDamage));
    u.push(bus.on('stance-change', this._onStance));
    u.push(bus.on('objective', this._onObjective));
  }

  _isPlayer(e) {
    return !!e && (e === this.ctx.player || e.faction === 'player');
  }

  _heatUp(v) {
    this._heat = Math.max(this._heat, v);
    if (this.music.mood !== 'combat' && this.music.mood !== 'death' && this.music.mood !== 'victory') {
      this.setMood('combat');
    }
  }

  _handleHit(p) {
    if (!p) return;
    const pt = p.point;
    const x = pt ? pt.x : 0, y = pt ? pt.y : 1.2, z = pt ? pt.z : 0;
    let mat = 'Flesh';
    const t = p.target;
    if (p.surface && (p.surface === 'wood' || p.surface === 'stone')) {
      mat = p.surface === 'wood' ? 'Wood' : 'Stone';
    } else if (t && (t.armored === true || (typeof t.armor === 'number' && t.armor > 0.4))) {
      mat = 'Armor';
    } else if (p.kind === 'blunt' && t && t.faction === 'oni') {
      mat = 'Armor';
    }
    const dmg = clamp((p.damage || 10) / 40, 0.25, 1.6);
    const g = (p.crit ? 1.25 : 1.0) * (0.7 + 0.5 * dmg);
    this._playInternal('swordHit' + mat, { gain: g, priority: 4, minGap: 0.01, maxSame: 4 }, true, x, y, z);
    if (mat === 'Flesh') {
      this._playInternal('bloodSpray', { gain: 0.5 * dmg, priority: 2, minGap: 0.04 }, true, x, y, z);
    } else if (mat === 'Armor' || mat === 'Stone') {
      this._playInternal('clash', { gain: 0.32 * dmg, rate: 1.15, priority: 3, minGap: 0.02 }, true, x, y, z);
    }
    this.duckFor(180 + 160 * dmg, 0.3 + 0.2 * dmg);
    this._heatUp(1);
    // Koto stabs punctuate the fight, but only a few per second or it turns to mush.
    const now = this.ac.currentTime;
    if (this.music.mood === 'combat' && now - this._lastStab > 0.22 && Math.random() < 0.55) {
      this._lastStab = now;
      this._koto(now + 0.01, this._noteFreq((Math.random() * 5) | 0, Math.random() < 0.4 ? 1 : 0), 0.45 + 0.3 * dmg);
    }
  }

  _handleParry(p) {
    if (!p) return;
    const pt = p.point;
    const x = pt ? pt.x : 0, y = pt ? pt.y : 1.2, z = pt ? pt.z : 0;
    if (p.perfect) {
      this._playInternal('parryPerfect', { gain: 1.0, priority: 5, minGap: 0.02, maxSame: 2 }, true, x, y, z);
      this.duckFor(700, 0.62);
      // The accent: a struck bell-toned suzu and a taiko under it, on the beat we are on.
      const now = this.ac.currentTime;
      this._playInternal('suzu', { gain: 0.5, bus: 'music', when: now + 0.02, priority: 4, minGap: 0 }, false, 0, 0, 0);
      this._playInternal('taikoLow', { gain: 0.8, bus: 'music', when: now + 0.01, rate: 0.88, priority: 4, minGap: 0 }, false, 0, 0, 0);
      this._silentUntil = now + 0.32;
    } else {
      this._playInternal('clash', { gain: 0.8, rate: 1.05, priority: 4, minGap: 0.02 }, true, x, y, z);
      this.duckFor(220, 0.32);
    }
    this._heatUp(1);
  }

  _handleClash(p) {
    if (!p) return;
    const pt = p.point;
    this._playInternal('clash', { gain: 0.95, priority: 4, minGap: 0.02, maxSame: 3 },
      true, pt ? pt.x : 0, pt ? pt.y : 1.2, pt ? pt.z : 0);
    this.duckFor(260, 0.38);
    this._heatUp(1);
  }

  _handleDeath(p) {
    if (!p) return;
    const pt = p.point;
    const x = pt ? pt.x : 0, y = pt ? pt.y : 1.0, z = pt ? pt.z : 0;
    const now = this.ac.currentTime;
    this._playInternal('deathGrunt', { gain: 0.75, priority: 4, minGap: 0.02 }, true, x, y, z);
    this._playInternal('bodyFall', { gain: 0.9, when: now + 0.34 + Math.random() * 0.16, priority: 3, minGap: 0.02 }, true, x, y, z);
    this._playInternal('bloodSpray', { gain: 0.4, priority: 2, minGap: 0.03 }, true, x, y, z);
    this.duckFor(520, 0.45);
    if (this._isPlayer(p.entity)) {
      this.setMood('death');
    } else {
      this._heat = Math.min(this._heat, 0.6);
      this._engaged = Math.max(0, this._readEngaged() - 1);
      if (this._engaged <= 0 && this.music.mood === 'combat') this.setMood('victory');
    }
  }

  _handleFootstep(p) {
    if (!p) return;
    const pt = p.point;
    const key = SURFACE_MAP[String(p.surface || 'dirt').toLowerCase()] || 'dirt';
    const spd = clamp((p.speed || 1.9) / 5.4, 0.25, 1.6);
    const player = this._isPlayer(p.entity);
    const gain = (player ? 0.55 : 0.42) * (0.5 + 0.65 * spd);
    // Faster feet are brighter as well as louder — the boot slaps rather than rolls.
    const lp = 2200 + 15000 * Math.pow(spd, 1.2);
    this._playInternal('footstep_' + key, {
      gain, priority: 1, rate: 0.94 + spd * 0.14, lowpass: lp, minGap: 0.055, maxSame: 3,
    }, true, pt ? pt.x : 0, pt ? pt.y : 0.05, pt ? pt.z : 0);
  }

  _handleSlash(p) {
    if (!p) return;
    const a = p.from, b = p.to;
    let x = 0, y = 1.3, z = 0;
    if (a && b) { x = (a.x + b.x) * 0.5; y = (a.y + b.y) * 0.5; z = (a.z + b.z) * 0.5; }
    else if (a) { x = a.x; y = a.y; z = a.z; }
    const heavy = !!p.heavy;
    const arc = clamp((p.arc || 1.6) / 2.4, 0.4, 1.4);
    this._playInternal(heavy ? 'swordSwooshHeavy' : 'swordSwooshLight', {
      gain: (heavy ? 0.85 : 0.62) * arc, rate: heavy ? 0.94 : 1.0 + (1.4 - arc) * 0.12,
      priority: 3, minGap: 0.05, maxSame: 3,
    }, true, x, y, z);
  }

  _handleHitstop(p) {
    if (!p) return;
    const dur = clamp(p.duration || 0.08, 0.02, 1.2);
    const now = this.ac ? this.ac.currentTime : 0;
    this._silentUntil = Math.max(this._silentUntil, now + dur * 1.4);
    this.duckFor(dur * 1000 + 120, 0.55);
  }

  _handlePostureBreak(p) {
    const e = p && p.entity;
    const pos = e && e.position;
    const x = pos ? pos.x : 0, y = pos ? pos.y + 1.2 : 1.2, z = pos ? pos.z : 0;
    this._playInternal('clash', { gain: 1.0, rate: 0.72, priority: 5, minGap: 0.02 }, true, x, y, z);
    this._playInternal('swordHitArmor', { gain: 0.8, rate: 0.8, priority: 4, minGap: 0.02 }, true, x, y, z);
    const now = this.ac.currentTime;
    this._playInternal('taikoLow', { gain: 1.0, bus: 'music', when: now, rate: 0.72, priority: 5, minGap: 0 }, false, 0, 0, 0);
    this._playInternal('suzu', { gain: 0.35, bus: 'music', when: now + 0.06, priority: 3, minGap: 0 }, false, 0, 0, 0);
    this.duckFor(900, 0.6);
    this._heatUp(1);
  }

  _handleDamage(p) {
    if (!p) return;
    const e = p.entity;
    const pos = e && e.position;
    const x = pos ? pos.x : 0, y = pos ? pos.y + 1.1 : 1.1, z = pos ? pos.z : 0;
    if (this._isPlayer(e)) {
      // Taking a hit briefly stuffs the whole mix, like a blow to the head. The amount is
      // handed to _updateSlowMo rather than written straight to the filter, so the two
      // effects share one automation curve instead of fighting over it.
      this._pain = Math.min(1, this._pain + clamp((p.amount || 10) / 30, 0.3, 1));
      this._playInternal('deathGrunt', { gain: 0.35, rate: 1.1, priority: 3, minGap: 0.08 }, false, 0, 0, 0);
      this.duckFor(420, 0.5);
    } else {
      this._playInternal('deathGrunt', { gain: 0.22, rate: 0.92 + Math.random() * 0.2, priority: 1, minGap: 0.1 }, true, x, y, z);
    }
    this._heatUp(1);
  }

  _handleStance(p) {
    if (!p || !p.entity) return;
    const e = p.entity;
    const id = e.id !== undefined ? e.id : e;
    const prev = this._stanceOf.get(id);
    const now = String(p.stance || '');
    this._stanceOf.set(id, now);
    if (prev === now) return;
    const pos = e.position;
    const x = pos ? pos.x : 0, y = pos ? pos.y + 1.1 : 1.1, z = pos ? pos.z : 0;
    const sheathed = now === 'sheathed' || now === 'idle_sheathed' || now === 'noto';
    if (sheathed) {
      this._playInternal('sheathe', { gain: 0.6, priority: 3, minGap: 0.1 }, true, x, y, z);
    } else if (prev === undefined || prev === 'sheathed' || prev === 'idle_sheathed' || prev === 'noto') {
      this._playInternal('drawBlade', { gain: 0.7, priority: 3, minGap: 0.1 }, true, x, y, z);
    } else {
      // Guard-to-mid and friends: cloth and a whisper of steel, nothing more.
      this._playInternal('dodgeWhoosh', { gain: 0.22, rate: 1.25, priority: 1, minGap: 0.08 }, true, x, y, z);
    }
  }

  _handleObjective() {
    const now = this.ac ? this.ac.currentTime : 0;
    this.play('uiConfirm', { gain: 0.5, bus: 'ui', priority: 4, minGap: 0.1 });
    this._playInternal('suzu', { gain: 0.3, bus: 'music', when: now + 0.12, priority: 3, minGap: 0 }, false, 0, 0, 0);
    this.duckFor(400, 0.28);
  }

  /* ── per-frame ──────────────────────────────────────────────────────────── */

  update(dt, elapsed, rawDt) {
    if (!this.ok || !this.ac) return;
    const rd = rawDt || dt || 0.0166;
    if (!this._runtime) return;
    this._occlBudget = 3;
    this._updateListener();
    this._updateSlowMo(rd);
    this._acc025 += rd;
    if (this._acc025 >= 0.25) {
      this._acc025 = 0;
      this._updateZone();
      this._updateBeds();
      this._updateCombatState();
      this._sweepVoices();
    }
    this._acc2 += rd;
    if (this._acc2 >= 2) { this._acc2 = 0; this._loadSettings(); }
    this._updateAmbience(rd);
    this._musicTick();
  }

  /** Listener follows the camera exactly, straight out of its world matrix. */
  _updateListener() {
    const cam = this.ctx.camera;
    if (!cam) return;
    const e = cam.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    this._lx = px; this._ly = py; this._lz = pz;
    const L = this.ac.listener;
    const t = this.ac.currentTime;
    if (L.positionX) {
      // A tiny smoothing constant kills zipper noise on a camera that snaps.
      L.positionX.setTargetAtTime(px, t, 0.012);
      L.positionY.setTargetAtTime(py, t, 0.012);
      L.positionZ.setTargetAtTime(pz, t, 0.012);
      L.forwardX.setTargetAtTime(-e[8], t, 0.012);
      L.forwardY.setTargetAtTime(-e[9], t, 0.012);
      L.forwardZ.setTargetAtTime(-e[10], t, 0.012);
      L.upX.setTargetAtTime(e[4], t, 0.012);
      L.upY.setTargetAtTime(e[5], t, 0.012);
      L.upZ.setTargetAtTime(e[6], t, 0.012);
    } else if (L.setPosition) {
      L.setPosition(px, py, pz);
      L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  /** Below 1x time the world sounds submerged: darker, slower, and thinner. */
  _updateSlowMo(rd) {
    const ts = clamp(this.ctx.engine ? this.ctx.engine.timeScale : 1, 0.05, 1);
    const k = Math.min(1, rd * 9);
    this._tsSmooth += (ts - this._tsSmooth) * k;
    this._pain = Math.max(0, this._pain - rd * 1.8);
    const s = this._tsSmooth;
    this._rateScale = 0.58 + 0.42 * s;
    this.music.thin = 1 - s;
    const sfxCut = clamp((320 + 19680 * Math.pow(s, 1.7)) * (1 - 0.86 * this._pain), 300, 20000);
    const musCut = clamp((700 + 19300 * Math.pow(s, 1.3)) * (1 - 0.7 * this._pain), 400, 20000);
    // Only touch the automation when something actually moved: at 60 fps an unconditional
    // setTargetAtTime is thousands of scheduled events a minute for no audible gain.
    if (Math.abs(sfxCut - this._lastSfxCut) < 12 && Math.abs(musCut - this._lastMusCut) < 12) return;
    this._lastSfxCut = sfxCut;
    this._lastMusCut = musCut;
    const t = this.ac.currentTime;
    this.buses.sfx.filter.frequency.setTargetAtTime(sfxCut, t, 0.06);
    this.buses.music.filter.frequency.setTargetAtTime(musCut, t, 0.08);
    const br = 0.7 + 0.3 * s;
    if (this.bedWind) this.bedWind.src.playbackRate.setTargetAtTime(br, t, 0.12);
    if (this.bedRain) this.bedRain.src.playbackRate.setTargetAtTime(br, t, 0.12);
  }

  _updateZone() {
    const lv = this.ctx.level;
    let zone = null;
    if (this._zoneFnOk && lv && typeof lv.reverbZoneAt === 'function') {
      try {
        this._probe.set(this._lx, this._ly, this._lz);
        const z = lv.reverbZoneAt(this._probe);
        if (typeof z === 'string') zone = z;
      } catch { this._zoneFnOk = false; }
    }
    if (!zone && lv && typeof lv.reverbZone === 'string') zone = lv.reverbZone;
    if (!zone) {
      // Fallback by altitude and shelter: the shrine sits above the bamboo sea, and the
      // valley opens up below it.
      const pl = this.ctx.player;
      if (pl && pl.indoors) zone = 'interiorWood';
      else if (this._ly > 28) zone = 'valley';
      else if (this._ly > 11) zone = 'stoneCourtyard';
      else zone = 'forest';
    }
    if (!this.irs.has(zone)) zone = 'forest';
    if (zone === this.zone || !this.irs.has(zone)) return;
    const idle = this._activeConv === 0 ? 1 : 0;
    try { this.convs[idle].buffer = this.irs.get(zone); } catch { return; }
    const t = this.ac.currentTime;
    this.convGains[idle].gain.setTargetAtTime(1, t, 0.55);
    this.convGains[this._activeConv].gain.setTargetAtTime(0.0001, t, 0.55);
    this._activeConv = idle;
    this.zone = zone;
  }

  /** Beds track the world state: the wind you hear is the wind you see. */
  _updateBeds() {
    const t = this.ac.currentTime;
    const w = this.ctx.wind;
    const strength = w && typeof w.strength === 'number' ? w.strength : 0.4;
    const gust = w && typeof w.gust === 'number' ? clamp(w.gust, 0, 2) : 0;
    if (this.bedWind) {
      this.bedWind.g.gain.setTargetAtTime(clamp(0.12 + strength * 0.3 + gust * 0.34, 0, 1.1), t, 0.35);
      this.bedWind.lp.frequency.setTargetAtTime(clamp(480 + gust * 1900 + strength * 500, 200, 9000), t, 0.4);
    }
    if (this.bedRain) {
      const we = this.ctx.weather;
      let rain = 0;
      if (we) {
        if (typeof we.rainIntensity === 'number') rain = we.rainIntensity;
        else if (typeof we.rain === 'number') rain = we.rain;
        else if (typeof we.wetness === 'number') rain = we.wetness * 0.5;
      }
      this.bedRain.g.gain.setTargetAtTime(clamp(rain, 0, 1) * 0.55, t, 0.8);
    }
    if (this.bedStream) {
      const near = this.zone === 'valley' ? 0.2 : this.zone === 'forest' ? 0.1 : 0.03;
      this.bedStream.g.gain.setTargetAtTime(near, t, 1.2);
    }
    // A visible gust should be audible as an event, not just a level change.
    if (gust > 0.55 && this._gustArmed) {
      this._gustArmed = false;
      this._playInternal('windGust', { gain: 0.35 + gust * 0.3, bus: 'ambience', priority: 1, minGap: 2.5 }, false, 0, 0, 0);
      this._playInternal('leafRustle', { gain: 0.22 + gust * 0.2, bus: 'ambience', priority: 1, minGap: 1.5 }, false, 0, 0, 0);
    } else if (gust < 0.3) {
      this._gustArmed = true;
    }
  }

  /** Sparse one-shots placed around the listener; the shrine should never feel dead. */
  _updateAmbience(rd) {
    const q = this._ambDensity === undefined ? 1 : this._ambDensity;
    this._tCrow -= rd;
    if (this._tCrow <= 0) {
      this._tCrow = (14 + Math.random() * 34) / q;
      this._ambientAt('crow', 18 + Math.random() * 26, 6 + Math.random() * 9, 0.5);
    }
    this._tBamboo -= rd;
    if (this._tBamboo <= 0) {
      this._tBamboo = (7 + Math.random() * 16) / q;
      this._ambientAt('bambooKnock', 5 + Math.random() * 14, 0.6 + Math.random() * 2.5, 0.4);
    }
    this._tLeaf -= rd;
    if (this._tLeaf <= 0) {
      this._tLeaf = (5 + Math.random() * 9) / q;
      this._ambientAt('leafRustle', 3 + Math.random() * 12, 1.5 + Math.random() * 4, 0.3);
    }
    this._tChime -= rd;
    if (this._tChime <= 0) {
      this._tChime = (20 + Math.random() * 40) / q;
      const w = this.ctx.wind;
      const gust = w && typeof w.gust === 'number' ? w.gust : 0.3;
      if (gust > 0.15) this._ambientAt('windChime', 4 + Math.random() * 7, 2.4 + Math.random(), 0.28 + gust * 0.2);
    }
    this._tThunder -= rd;
    if (this._tThunder <= 0) {
      this._tThunder = 70 + Math.random() * 110;
      this._playInternal('distantThunder', { gain: 0.3 + Math.random() * 0.2, bus: 'ambience', priority: 1, minGap: 5 }, false, 0, 0, 0);
    }
    this._tBell -= rd;
    if (this._tBell <= 0) {
      this._tBell = 150 + Math.random() * 240;
      if (this.music.mood === 'explore') {
        this._ambientAt('templeBell', 22 + Math.random() * 18, 5 + Math.random() * 3, 0.5);
      }
    }
  }

  _ambientAt(name, dist, height, gain) {
    const a = Math.random() * Math.PI * 2;
    this._playInternal(name, { gain, bus: 'ambience', priority: 1, minGap: 0.5 },
      true, this._lx + Math.cos(a) * dist, this._ly + height, this._lz + Math.sin(a) * dist);
  }

  /** Reclaim voices whose buffer must have finished but whose `ended` never arrived. */
  _sweepVoices() {
    const now = this.ac.currentTime;
    for (let i = this._chans.length - 1; i >= 0; i--) {
      const c = this._chans[i];
      if ((c.active || c.retiring) && now > c.endTime) this._release(c);
    }
  }

  _readEngaged() {
    const e = this.ctx.enemies;
    if (!e) return 0;
    if (typeof e.engagedCount === 'number') return e.engagedCount;
    if (typeof e.aliveCount === 'number') return e.aliveCount;
    const arr = e.enemies || e.list || e.active;
    if (Array.isArray(arr)) {
      let n = 0;
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i];
        if (x && x.isAlive !== false && x.state !== 'dead' && (x.health === undefined || x.health > 0)) n++;
      }
      return n;
    }
    return 0;
  }

  _updateCombatState() {
    this._engaged = this._readEngaged();
    this.music.intensity += (clamp(this._engaged / 4, 0, 1) - this.music.intensity) * 0.35;
    this._heat = Math.max(0, this._heat - 0.25 / 8);       // ~8 s of memory after the last blow
    const m = this.music;
    if (m.mood === 'combat' && this._heat <= 0.02) {
      this.setMood(this._engaged > 0 ? 'tension' : 'explore');
    } else if (m.mood === 'tension' && this._engaged <= 0 && this._heat <= 0.02) {
      this.setMood('explore');
    } else if (m.mood === 'explore' && this._engaged > 0 && this._heat <= 0.02) {
      this.setMood('tension');
    }
  }

  /* ── settings, quality, teardown ────────────────────────────────────────── */

  _loadSettings() {
    let raw = null;
    try { raw = localStorage.getItem('kagerou.settings'); } catch { return; }
    if (raw === this._settingsRaw) return;
    this._settingsRaw = raw || '';
    if (!raw) return;
    let s = null;
    try { s = JSON.parse(raw); } catch { return; }
    if (!s || typeof s !== 'object') return;
    if (typeof s.volMaster === 'number') this.setVolume('master', s.volMaster);
    if (typeof s.volSfx === 'number') { this.setVolume('sfx', s.volSfx); this.setVolume('ui', s.volSfx * 0.7); }
    if (typeof s.volMusic === 'number') { this.setVolume('music', s.volMusic * 0.62); this.setVolume('ambience', s.volMusic * 0.5); }
  }

  applyQuality(q) {
    const tier = q && typeof q.tier === 'number' ? q.tier : 2;
    this.maxVoices = tier <= 0 ? 24 : tier === 1 ? 32 : 48;
    // HRTF is a per-voice convolution; on the low tier equalpower buys back the CPU.
    this._hrtf = tier >= 1;
    const model = this._hrtf ? 'HRTF' : 'equalpower';
    for (let i = 0; i < this._chans.length; i++) {
      try { this._chans[i].panner.panningModel = model; } catch { /* ignore */ }
    }
    this.music.density = tier <= 0 ? 0.7 : 1;
    this._ambDensity = tier <= 0 ? 0.6 : 1;
    if (this.busList.length && this.ac) {
      const t = this.ac.currentTime;
      const scale = tier <= 0 ? 0.6 : 1;
      for (let i = 0; i < this.busList.length; i++) {
        const b = this.busList[i];
        b.send.gain.setTargetAtTime(b.sendLevel * scale, t, 0.2);
      }
    }
  }

  dispose() {
    for (let i = 0; i < this._unsubs.length; i++) {
      try { this._unsubs[i](); } catch { /* ignore */ }
    }
    this._unsubs.length = 0;
    try { window.removeEventListener('storage', this._onStorage); } catch { /* ignore */ }
    try { document.removeEventListener('visibilitychange', this._onVisibility); } catch { /* ignore */ }
    try { window.removeEventListener('pointerdown', this._retryUnlock); } catch { /* ignore */ }
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    this._live.forEach((rec) => {
      for (let i = 0; i < rec.nodes.length; i++) {
        try { rec.nodes[i].stop && rec.nodes[i].stop(); } catch { /* ignore */ }
        try { rec.nodes[i].disconnect(); } catch { /* ignore */ }
      }
    });
    this._live.clear();
    const beds = [this.bedWind, this.bedRain, this.bedStream];
    for (let i = 0; i < beds.length; i++) {
      const b = beds[i];
      if (!b) continue;
      try { b.src.stop(); } catch { /* ignore */ }
      try { b.src.disconnect(); b.lp.disconnect(); b.g.disconnect(); } catch { /* ignore */ }
    }
    this.bedWind = this.bedRain = this.bedStream = null;
    const d = this.music.drone;
    if (d) {
      for (let i = 0; i < d.oscs.length; i++) { try { d.oscs[i].stop(); } catch { /* ignore */ } }
      try { d.lfo.stop(); } catch { /* ignore */ }
      try { d.out.disconnect(); d.lp.disconnect(); } catch { /* ignore */ }
      this.music.drone = null;
    }
    for (let i = 0; i < this._chans.length; i++) {
      const c = this._chans[i];
      try { if (c.src) { c.src.stop(); c.src.disconnect(); } } catch { /* ignore */ }
      try { c.gain.disconnect(); c.lp.disconnect(); c.panner.disconnect(); } catch { /* ignore */ }
    }
    this._chans.length = 0;
    this.buffers.clear();
    this.irs.clear();
    this._runtime = false;
    this.ok = false;
    if (this.ac) { try { this.ac.close(); } catch { /* ignore */ } this.ac = null; }
  }
}






