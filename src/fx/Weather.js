/**
 * Weather.js — wind, petals, rain, mist. The layer that makes the valley breathe.
 *
 * The load-bearing idea here is that **wind is one field**, not a per-system fudge.
 * A gust is a travelling wavefront: an analytic phase term along the wind direction
 * plus a noise detail layer. The analytic part is identical in JS (`windAt`) and in
 * GLSL (`WIND_GLSL`), so when a gust crosses the valley the grass, the bamboo, the
 * banners, the cloth, the petals and the smoke all bend on the *same* front. That
 * coherence is the difference between "there is wind" and "the wind is blowing".
 *
 * Other systems consume it in one of two ways:
 *   - CPU:   `ctx.weather.windAt(x, z, y, outVec3)`
 *   - GLSL:  splice `ctx.weather.windUniforms` into your material's uniforms and
 *            paste `WIND_GLSL` into the shader; call `kagerouWind(worldPos)` or
 *            `kagerouBend(worldPos, height, stiffness)`.
 * The uniform objects are shared by identity, so they update for free.
 */

import {
  AdditiveBlending, CanvasTexture, ClampToEdgeWrapping, Color, DoubleSide,
  DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, LinearFilter, Mesh, NormalBlending, RepeatWrapping,
  ShaderMaterial, SRGBColorSpace, Vector3, Vector4,
} from 'three';

import { noise, makeRandom, clamp, lerp, damp, smoothstep, glslNoise } from '../core/Noise.js';

const TAU = Math.PI * 2;

// ============================================================================
//  The shared wind field
// ============================================================================

/**
 * Uniform block for `WIND_GLSL`. Declare these (or reuse the objects returned by
 * `ctx.weather.windUniforms`, which have exactly these names).
 *
 *   uWind : vec4( dirX, dirZ, baseStrength, time )
 *   uGust : vec4( amplitude, invWavelength, frontSpeed, turbulence )
 */
export const WIND_UNIFORMS_GLSL = /* glsl */`
uniform vec4 uWind;
uniform vec4 uGust;
`;

/**
 * Paste into any shader that needs to bend with the weather. Requires
 * `WIND_UNIFORMS_GLSL` and `glslNoise` (this string already includes the noise).
 *
 *   float kagerouGust(vec2 xz)                       0..1 gust envelope
 *   vec3  kagerouWind(vec3 wp)                       m/s wind vector
 *   vec3  kagerouBend(vec3 wp, float h, float stiff) displacement for a rooted object
 */
export const WIND_GLSL = /* glsl */`
${glslNoise}
${WIND_UNIFORMS_GLSL}

/**
 * The gust envelope. The phase term travels along the wind direction, so the
 * ridge of the wave sweeps across the world instead of pulsing everywhere.
 */
float kagerouGust(vec2 xz){
  vec2 dir = normalize(uWind.xy + vec2(1e-5, 0.0));
  float phase = dot(xz, dir) * uGust.y - uWind.w * uGust.z;
  float wave = 0.5 + 0.5 * sin(phase * 6.2831853);
  float front = wave * wave * wave;                       // sharpen into a front
  float detail = 0.5 + 0.5 * fbm2(xz * 0.035 + dir * (uWind.w * 0.12), 3);
  return front * mix(0.55, 1.0, detail);
}

vec3 kagerouWind(vec3 wp){
  vec2 dir = normalize(uWind.xy + vec2(1e-5, 0.0));
  float g = kagerouGust(wp.xz);
  float speed = uWind.z + uGust.x * g;

  // Fine chop rides on top, otherwise a strong gust reads as a rigid push.
  vec2 perp = vec2(-dir.y, dir.x);
  float chop = snoise2(wp.xz * 0.35 + vec2(uWind.w * 1.7, uWind.w * 1.1));
  vec2 flow = dir * speed + perp * chop * uGust.w * (0.35 + speed * 0.25);

  float lift = snoise2(wp.xz * 0.22 + vec2(uWind.w * 0.9, -uWind.w * 0.7)) * uGust.w * 0.25;
  return vec3(flow.x, lift * speed, flow.y);
}

/**
 * Displacement for something rooted at wp with normalised height h (0 at the
 * root, 1 at the tip). stiffness > 1 is a bamboo culm, < 1 is a grass blade.
 */
vec3 kagerouBend(vec3 wp, float h, float stiffness){
  vec3 w = kagerouWind(wp);
  float amp = pow(clamp(h, 0.0, 1.0), 1.0 + stiffness) / max(stiffness, 0.25);
  // per-instance flutter, phase-offset by world position so nothing marches in step
  float flut = sin(uWind.w * (5.0 + stiffness) + (wp.x + wp.z) * 1.7) * 0.12 * h;
  return w * amp * 0.12 + vec3(flut, 0.0, flut * 0.6) * length(w.xz) * 0.08;
}
`;

// ============================================================================
//  Presets
// ============================================================================

/**
 * Every preset is a full target state; `setPreset` cross-fades between two.
 *
 * `fog` drives the valley cloud sea (down at the datum, out of the shrine's way).
 * `wisp` is the separate, much smaller ground-hugging drift on whatever ground the
 * player is standing on — kept decoupled so the default 'petals' preset can have a
 * thick sea below the cliff and still leave the courtyard flagstone readable.
 */
export const WEATHER_PRESETS = {
  clear: { petals: 0.25, leaves: 0.15, embers: 0.00, motes: 0.60, rain: 0.00, fog: 0.30, wisp: 0.00, wetness: 0.00, wind: 0.35, gust: 0.35 },
  mist: { petals: 0.30, leaves: 0.20, embers: 0.00, motes: 0.30, rain: 0.00, fog: 1.00, wisp: 0.55, wetness: 0.18, wind: 0.20, gust: 0.22 },
  rain: { petals: 0.05, leaves: 0.30, embers: 0.00, motes: 0.00, rain: 1.00, fog: 0.60, wisp: 0.14, wetness: 0.90, wind: 0.60, gust: 0.60 },
  storm: { petals: 0.00, leaves: 0.60, embers: 0.00, motes: 0.00, rain: 1.60, fog: 0.45, wisp: 0.10, wetness: 1.00, wind: 1.00, gust: 1.00 },
  petals: { petals: 1.00, leaves: 0.35, embers: 0.15, motes: 0.60, rain: 0.00, fog: 0.70, wisp: 0.09, wetness: 0.00, wind: 0.45, gust: 0.50 },
  night: { petals: 0.50, leaves: 0.20, embers: 1.00, motes: 0.10, rain: 0.00, fog: 0.85, wisp: 0.28, wetness: 0.05, wind: 0.25, gust: 0.30 },
};

const PRESET_KEYS = ['petals', 'leaves', 'embers', 'motes', 'rain', 'fog', 'wisp', 'wetness', 'wind', 'gust'];
const CROSSFADE = 4.0;      // seconds, per the brief

/**
 * Altitude the valley mist pools at, used only until Terrain has published its
 * own `waterLevel`. Mirrors `WORLD.WATER_LEVEL`; Terrain owns the real number.
 */
const VALLEY_DATUM_FALLBACK = 782;

// Field modes, matched by `#define MODE` in the shader.
const MODE_PETAL = 0, MODE_LEAF = 1, MODE_EMBER = 2, MODE_RAIN = 3, MODE_MOTE = 4;

// Weather atlas cells (4×4).
const W_PETAL = 0, W_LEAF = 1, W_EMBER = 2, W_STREAK = 3;
const W_MOTE = 4, W_RING = 5, W_MIST = 6, W_GLOW = 7;

/** Default out-param for `windAt`, so a caller that ignores it allocates nothing. */
const _v1 = new Vector3();

/**
 * The cool anchor every body of mist is pulled toward — the contract's shadow/ambient
 * (§5). Mist is lit by the sky dome, not by the key, so it belongs on the cool side of
 * the frame even at magic hour; a neutral or warm veil is what makes a shot read as a
 * sunset filter over a grey render.
 */
const MIST_COOL = new Color('#4a6b8f');
const _fogTarget = new Color();

/**
 * How many valley slabs the *reference* (ULTRA) build stacks. Lower tiers build fewer,
 * and each surviving slab is thickened by `REF_SEA_LAYERS / seaLayers` so the composited
 * sea reaches the same opacity on a phone as on a desktop. Before this, MEDIUM built 4
 * slabs against ULTRA's 6 and additionally scaled density by `quality.weather` (0.7),
 * which left the phone's mist 2.0x thinner across the band and 13x thinner at its top —
 * measured, not estimated: see the alpha envelope in the round-5 report.
 */
const REF_SEA_LAYERS = 5;

export class WeatherSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRandom(0x5A6B7C);

    this.time = 0;
    this.enabled = true;

    // --- the wind field --------------------------------------------------------
    this.windDir = { x: 0.82, z: 0.57 };
    this.windStrength = 0.45;      // m/s base
    this.gustAmplitude = 3.2;      // m/s added at the crest of a front
    this.gustWavelength = 34;      // metres between fronts
    this.gustSpeed = 0.22;         // fronts per second
    this.turbulence = 0.55;
    this.gust = 0;                 // sampled at the camera, mirrored into ctx.wind

    /**
     * Shared uniform objects. Splice these straight into another material's
     * `uniforms` — same object identity means they stay in sync for free.
     */
    this.windUniforms = {
      uWind: { value: new Vector4(this.windDir.x, this.windDir.z, this.windStrength, 0) },
      uGust: { value: new Vector4(this.gustAmplitude, 1 / this.gustWavelength, this.gustSpeed, this.turbulence) },
    };

    /**
     * Mirrored onto the instance because every consumer reaches the wind through
     * `ctx.weather`, not through a module import — Foliage and Props both probe
     * `ctx.weather.WIND_GLSL` to decide whether to use the shared field or their own
     * fallback, and a missing property there silently forks the gust wavefront.
     */
    this.WIND_GLSL = WIND_GLSL;
    this.WIND_UNIFORMS_GLSL = WIND_UNIFORMS_GLSL;

    // --- broadcast state -------------------------------------------------------
    this.wetness = 0;              // 0..1, read by Materials/Terrain
    this._wetnessSent = -1;
    this.lensTexture = null;       // raindrop-on-lens overlay for PostFX
    this.lensStrength = 0;
    this._lensSent = -1;
    this._lensPayload = { texture: null, strength: 0 };

    // --- preset blending -------------------------------------------------------
    this.preset = 'petals';
    this.current = Object.assign({}, WEATHER_PRESETS.petals);
    this._from = Object.assign({}, WEATHER_PRESETS.petals);
    this._to = Object.assign({}, WEATHER_PRESETS.petals);
    this._blend = 1;

    // --- systems ---------------------------------------------------------------
    this.fields = [];
    this.fog = null;
    this.splash = null;
    this._splashTimer = 0;

    this.baseY = 0;
    this.groundY = 0;
    this._baseYInit = false;
    /** Absolute world altitude the valley cloud sea pools at (Terrain's waterLevel). */
    this.valleyDatum = VALLEY_DATUM_FALLBACK;
    this.origin = new Vector3();
    this.sunDir = new Vector3(0.3, 0.55, 0.78).normalize();
    this.sunColor = new Color('#ffd9a8');
    this.fogColor = new Color('#9fb0c4');
    this.nightFactor = 0;

    this._resolution = new Vector4(1280, 720, 1 / 1280, 1 / 720);
    this._depthWired = false;
    this._disposed = false;
  }

  // ============================================================================ init

  async init() {
    const q = this.ctx.quality;
    const weather = clamp(q?.weather ?? 0.7, 0, 1.6);

    this.atlas = makeWeatherAtlas((q?.tier ?? 1) >= 2 ? 512 : 256);
    this.lensTexture = makeLensTexture((q?.tier ?? 1) >= 2 ? 512 : 256);

    // Counts are the *maximum* instance capacity; density scales instanceCount.
    this.fields.push(this._buildField({
      name: 'petals', mode: MODE_PETAL, sprite: W_PETAL,
      count: Math.round(1100 * weather),
      box: new Vector3(64, 30, 64), size: 0.085, sizeVar: 0.5,
      fall: 1.05, tumble: 1.5, flutter: 1.0, drag: 0.9,
      colorA: '#ffe3ec', colorB: '#f4b3cb',
      additive: false, transmit: 1.3, fogged: true,
    }));

    this.fields.push(this._buildField({
      name: 'leaves', mode: MODE_LEAF, sprite: W_LEAF,
      count: Math.round(420 * weather),
      box: new Vector3(52, 24, 52), size: 0.13, sizeVar: 0.6,
      fall: 1.35, tumble: 2.4, flutter: 1.6, drag: 1.15,
      colorA: '#d8862f', colorB: '#8c4a1e',
      additive: false, transmit: 1.0, fogged: true,
    }));

    this.fields.push(this._buildField({
      name: 'embers', mode: MODE_EMBER, sprite: W_EMBER,
      count: Math.round(340 * weather),
      box: new Vector3(44, 18, 44), size: 0.055, sizeVar: 0.9,
      fall: -0.55, tumble: 0.4, flutter: 0.5, drag: 0.55,
      colorA: '#ffcf7a', colorB: '#ff6a1c',
      additive: true, transmit: 0, fogged: false,
    }));

    this.fields.push(this._buildField({
      name: 'motes', mode: MODE_MOTE, sprite: W_MOTE,
      count: Math.round(420 * weather),
      box: new Vector3(18, 10, 18), size: 0.022, sizeVar: 1.1,
      fall: 0.06, tumble: 0.2, flutter: 0.3, drag: 0.3,
      colorA: '#fff0d2', colorB: '#ffd9a8',
      additive: true, transmit: 0, fogged: false,
    }));

    this.fields.push(this._buildField({
      name: 'rain', mode: MODE_RAIN, sprite: W_STREAK,
      count: Math.round(1800 * weather),
      box: new Vector3(38, 28, 38), size: 0.028, sizeVar: 0.35,
      fall: 16.0, tumble: 0, flutter: 0.15, drag: 0.05,
      colorA: '#cfe2ef', colorB: '#9fb6c6',
      additive: false, transmit: 0, fogged: true,
    }));

    this._buildFog(weather);
    this._buildSplash(Math.max(24, Math.round(140 * weather)));

    this.setPreset('petals', true);
  }

  // ============================================================================ wind

  /**
   * The JS twin of `kagerouWind`. The travelling front is bit-identical maths;
   * only the noise detail differs (different permutation table), which is why
   * gusts line up across CPU and GPU consumers.
   */
  windAt(x, z, y = 0, out = _v1) {
    const dx = this.windDir.x, dz = this.windDir.z;
    const invLen = 1 / Math.max(1e-5, Math.hypot(dx, dz));
    const nx = dx * invLen, nz = dz * invLen;

    const phase = (x * nx + z * nz) / this.gustWavelength - this.time * this.gustSpeed;
    const wave = 0.5 + 0.5 * Math.sin(phase * TAU);
    const front = wave * wave * wave;
    const detail = 0.5 + 0.5 * noise.fbm2(x * 0.035 + nx * this.time * 0.12, z * 0.035 + nz * this.time * 0.12, 3);
    const g = front * lerp(0.55, 1.0, detail);

    const speed = this.windStrength + this.gustAmplitude * g;
    const px = -nz, pz = nx;
    const chop = noise.noise2(x * 0.35 + this.time * 1.7, z * 0.35 + this.time * 1.1);
    const t = this.turbulence * (0.35 + speed * 0.25);
    const lift = noise.noise2(x * 0.22 + this.time * 0.9, z * 0.22 - this.time * 0.7) * this.turbulence * 0.25;

    out.set(nx * speed + px * chop * t, lift * speed, nz * speed + pz * chop * t);
    return out;
  }

  /** 0..1 gust envelope at a world XZ. Cheap; use it for LOD or audio ducking. */
  gustAt(x, z) {
    const invLen = 1 / Math.max(1e-5, Math.hypot(this.windDir.x, this.windDir.z));
    const nx = this.windDir.x * invLen, nz = this.windDir.z * invLen;
    const phase = (x * nx + z * nz) / this.gustWavelength - this.time * this.gustSpeed;
    const wave = 0.5 + 0.5 * Math.sin(phase * TAU);
    const detail = 0.5 + 0.5 * noise.fbm2(x * 0.035 + nx * this.time * 0.12, z * 0.035 + nz * this.time * 0.12, 3);
    return wave * wave * wave * lerp(0.55, 1.0, detail);
  }

  // ========================================================================= presets

  /** Cross-fades over 4 s unless `immediate`. Unknown names are ignored. */
  setPreset(name, immediate = false) {
    const target = WEATHER_PRESETS[name];
    if (!target) return;
    this.preset = name;
    for (let i = 0; i < PRESET_KEYS.length; i++) {
      const k = PRESET_KEYS[i];
      this._from[k] = this.current[k];
      this._to[k] = target[k];
    }
    this._blend = immediate ? 1 : 0;
    if (immediate) {
      for (let i = 0; i < PRESET_KEYS.length; i++) {
        const k = PRESET_KEYS[i];
        this.current[k] = target[k];
      }
      this._applyCurrent();
    }
    this.ctx.bus?.emit('weather-preset', name);
  }

  _applyCurrent() {
    const c = this.current;
    this.windStrength = 0.25 + c.wind * 2.6;
    this.gustAmplitude = 1.2 + c.gust * 6.5;
    this.gustSpeed = 0.16 + c.gust * 0.26;
    this.turbulence = 0.35 + c.gust * 0.75;

    this.wetness = clamp(c.wetness, 0, 1);
    this.lensStrength = clamp(c.rain * 0.8, 0, 1);
  }

  // ========================================================================== update

  update(dt, elapsed, rawDt) {
    if (this._disposed || !this.enabled) return;
    const rdt = rawDt || dt || 0;
    this.time += dt || 0;

    // --- preset cross-fade ----------------------------------------------------
    if (this._blend < 1) {
      this._blend = Math.min(1, this._blend + rdt / CROSSFADE);
      const s = this._blend * this._blend * (3 - 2 * this._blend);
      for (let i = 0; i < PRESET_KEYS.length; i++) {
        const k = PRESET_KEYS[i];
        this.current[k] = lerp(this._from[k], this._to[k], s);
      }
      this._applyCurrent();
    }

    // --- follow the camera ----------------------------------------------------
    const cam = this.ctx.camera;
    if (cam) this.origin.copy(cam.position);
    this.groundY = this._groundY(this.origin.x, this.origin.z);
    // Snap on the first frame: damping up from 0 would sweep the ground wisp
    // through 800 m of world during the first two seconds of play.
    if (!this._baseYInit) { this.baseY = this.groundY; this._baseYInit = true; }
    else this.baseY = damp(this.baseY, this.groundY, 2.5, rdt);

    // The cloud sea is pinned to the world, not to us. Terrain owns the datum.
    const wl = this.ctx.terrain?.waterLevel;
    if (typeof wl === 'number' && isFinite(wl)) this.valleyDatum = wl;

    // --- sun / time of day ----------------------------------------------------
    this._readSun();

    // --- publish the wind -----------------------------------------------------
    this.gust = this.gustAt(this.origin.x, this.origin.z);
    const w = this.ctx.wind;
    if (w) {
      // Write into the object main.js created; never replace it.
      if (w.direction) { w.direction.x = this.windDir.x; w.direction.z = this.windDir.z; }
      w.strength = this.windStrength;
      w.gust = this.gustAmplitude * this.gust;
      w.time = this.time;
    }
    const uw = this.windUniforms.uWind.value;
    uw.set(this.windDir.x, this.windDir.z, this.windStrength, this.time);
    const ug = this.windUniforms.uGust.value;
    ug.set(this.gustAmplitude, 1 / this.gustWavelength, this.gustSpeed, this.turbulence);

    // Slowly rotate the prevailing direction so the valley never feels on rails.
    const swing = noise.noise2(this.time * 0.017, 5.5) * 0.55;
    const baseAngle = 0.6 + swing;
    this.windDir.x = Math.cos(baseAngle);
    this.windDir.z = Math.sin(baseAngle);

    this._updateFields(rdt);
    this._updateFog(rdt);
    this._updateSplashes(rdt);

    // --- broadcast wetness / lens ---------------------------------------------
    if (Math.abs(this.wetness - this._wetnessSent) > 0.01) {
      this._wetnessSent = this.wetness;
      this.ctx.bus?.emit('weather-wetness', this.wetness);
    }
    if (Math.abs(this.lensStrength - this._lensSent) > 0.01) {
      this._lensSent = this.lensStrength;
      this._lensPayload.texture = this.lensTexture;
      this._lensPayload.strength = this.lensStrength;
      this.ctx.bus?.emit('weather-lens', this._lensPayload);
      // Push straight at PostFX too — it boots after us and may never subscribe.
      this.ctx.pipeline?.setRainLens?.(this.lensTexture, this.lensStrength);
    }
  }

  _readSun() {
    const s = this.ctx.sky;
    const l = this.ctx.lighting;
    const d = s?.sunDirection || l?.sunDirection || s?.sunPosition;
    if (d && d.isVector3 && d.lengthSq() > 1e-6) this.sunDir.copy(d).normalize();
    else if (l?.sun?.position && l.sun.position.lengthSq() > 1e-6) this.sunDir.copy(l.sun.position).normalize();

    const c = s?.sunColor || l?.sunColor || l?.sun?.color;
    if (c && c.isColor) this.sunColor.copy(c);

    // SkySystem publishes its aerial-perspective colours on `fogParams`, not as a bare
    // `fogColor` — the old probe for `sky.fogColor || sky.horizonColor` matched neither
    // property, so the mist has been frozen at its constructor value all along and never
    // tracked time of day. Read the real field, and anchor the result to the contract's
    // cool shadow/ambient: `fogParams.color` is 0xa9a8ad at magic hour (R-B = -4, a
    // neutral grey), and ARCHITECTURE §5 forbids neutral grey in the shadow band. The
    // *top* colour is the cool one, so bias toward it and toward #4a6b8f.
    const fp = s?.fogParams;
    const fc = fp?.topColor?.isColor ? fp.topColor : (fp?.color?.isColor ? fp.color : null);
    if (fc) {
      _fogTarget.copy(MIST_COOL).lerp(fc, 0.45);
      if (isFinite(_fogTarget.r) && isFinite(_fogTarget.g) && isFinite(_fogTarget.b)) {
        this.fogColor.copy(_fogTarget);
      }
    }

    // Fireflies and embers only belong after the sun has gone down.
    this.nightFactor = clamp(1 - (this.sunDir.y + 0.08) * 4.5, 0, 1);
  }

  _groundY(x, z) {
    const h = this.ctx.terrain?.heightAt?.(x, z);
    return typeof h === 'number' && isFinite(h) ? h : 0;
  }

  // ==================================================================== fields

  _quadGeometry() {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.instanceCount = 0;
    return g;
  }

  /**
   * One instanced quad field. Every particle's whole life is a pure function of
   * (uTime, its own random attributes) — nothing is ever written back, so a
   * 1800-drop rainstorm costs one draw call and zero JS.
   */
  _buildField(o) {
    const count = Math.max(8, o.count | 0);
    const geo = this._quadGeometry();
    const rnd = this.rng;

    const aRand = new Float32Array(count * 4);   // rx, ry, rz, seed
    const aRand2 = new Float32Array(count * 4);  // sizeVar, speedVar, tumbleVar, phase
    const aAxis = new Float32Array(count * 3);   // tumble axis

    for (let i = 0; i < count; i++) {
      aRand[i * 4] = rnd(); aRand[i * 4 + 1] = rnd(); aRand[i * 4 + 2] = rnd(); aRand[i * 4 + 3] = rnd();
      aRand2[i * 4] = 1 + (rnd() - 0.5) * o.sizeVar;
      aRand2[i * 4 + 1] = 0.7 + rnd() * 0.6;
      aRand2[i * 4 + 2] = 0.6 + rnd() * 0.9;
      aRand2[i * 4 + 3] = rnd();
      // uniform-ish axis on the sphere
      const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(Math.max(0, 1 - z * z));
      aAxis[i * 3] = Math.cos(a) * s; aAxis[i * 3 + 1] = z; aAxis[i * 3 + 2] = Math.sin(a) * s;
    }

    const bind = (key, arr, size) => {
      const at = new InstancedBufferAttribute(arr, size);
      at.setUsage(DynamicDrawUsage);
      geo.setAttribute(key, at);
    };
    bind('aRand', aRand, 4); bind('aRand2', aRand2, 4); bind('aAxis', aAxis, 3);

    const mat = new ShaderMaterial({
      name: 'weather-' + o.name,
      defines: { MODE: o.mode },
      uniforms: {
        uWind: this.windUniforms.uWind,        // shared by identity
        uGust: this.windUniforms.uGust,
        uTime: { value: 0 },
        uMap: { value: this.atlas },
        uOrigin: { value: new Vector3() },
        uBox: { value: o.box.clone() },
        uBaseY: { value: 0 },
        uGroundY: { value: 0 },
        uSize: { value: o.size },
        uFall: { value: o.fall },
        uTumble: { value: o.tumble },
        uFlutter: { value: o.flutter },
        uDrag: { value: o.drag },
        uSprite: { value: o.sprite },
        uColorA: { value: new Color(o.colorA) },
        uColorB: { value: new Color(o.colorB) },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color('#ffd9a8') },
        uTransmit: { value: o.transmit },
        uOpacity: { value: 1 },
        uFade: { value: 1 },
      },
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: o.additive ? AdditiveBlending : NormalBlending,
      side: DoubleSide,
      fog: !!o.fogged,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = o.additive ? 11 : 9;
    this.ctx.scene?.add(mesh);

    return { name: o.name, mode: o.mode, capacity: count, geo, mat, mesh, additive: !!o.additive };
  }

  _updateFields(rdt) {
    const q = this.ctx.quality;
    const wq = clamp(q?.weather ?? 0.7, 0, 1.6);

    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      const u = f.mat.uniforms;

      let density = 0;
      switch (f.name) {
        case 'petals': density = this.current.petals; break;
        case 'leaves': density = this.current.leaves; break;
        // Embers and fireflies only exist once the light goes; motes need the sun.
        case 'embers': density = this.current.embers * (0.25 + 0.75 * this.nightFactor); break;
        case 'motes': density = this.current.motes * (1 - this.nightFactor * 0.9); break;
        case 'rain': density = this.current.rain; break;
        default: density = 0;
      }
      density = clamp(density, 0, 1.6) * wq;

      const n = Math.round(f.capacity * clamp(density, 0, 1));
      f.geo.instanceCount = n;
      f.mesh.visible = n > 0;
      if (n === 0) continue;

      u.uTime.value = this.time;
      u.uOrigin.value.copy(this.origin);
      u.uBaseY.value = this.baseY;
      u.uGroundY.value = this.groundY;
      u.uSunDir.value.copy(this.sunDir);
      u.uSunColor.value.copy(this.sunColor);
      // The last 25% of density fades out rather than popping instances off.
      u.uFade.value = clamp(density * 4, 0, 1);
      u.uOpacity.value = f.name === 'rain' ? clamp(this.current.rain, 0, 1) : 1;
    }
  }

  // ======================================================================= fog
  /**
   * Three bodies of mist, because they are three different phenomena. All of them are
   * instances of one quad on one mesh, so the whole system is a single draw call and the
   * instance count is identical to the pre-r5 build — the mid-ground bank below is paid
   * for out of the sea's own layer budget, not added on top of it.
   *
   *  1. **The valley cloud sea** (mode 0, altitude −34…+13 m about the datum) — pinned
   *     to *absolute world altitude* around the valley datum (`terrain.waterLevel`,
   *     782 m), NOT to the camera. The shrine plateau is flat at 812 m, so every slab
   *     sits tens of metres below the flagstone and is simply occluded by the plateau
   *     itself: the player looks *down* onto a sea of cloud, which is what §5 asks for.
   *     Camera-anchoring this was what flooded the courtyard.
   *
   *  2. **The mid-ground bank** (mode 0, altitude +26 m = 808 m) — one slab in the
   *     altitude gap between the sea's 795 m top and the 812 m flagstone. It exists
   *     because r5 measured *nothing* between the wisp (which is explicitly killed past
   *     70 m) and the sea's rim, so the ~120 m grass and the ~500 m bamboo slope sat at
   *     one depth with no cue between them. Being 4 m *under* the flagstone it is still
   *     occluded by the plateau, so it cannot flood the courtyard; it only shows past
   *     the rim, where the ground has fallen away. In the `wide` pose that puts it in
   *     rows ~486-545 — exactly the strip where the sea contributes a computed zero.
   *
   *  3. **The ground wisp** (mode 1) — a couple of centimetres of drift that does follow
   *     the local ground, for the low sun to rake between the lanterns. Deliberately
   *     tiny: driven by its own `wisp` preset knob so 'clear' and 'petals' get a whisper
   *     and only 'mist' gets ankle-deep.
   *
   * Horizontal layers are the only volumetric-looking mist inside a mobile budget; the
   * tell-tale flatness is hidden by a grazing-angle term, a horizon feather (fPar2.w), a
   * camera-plane proximity fade and a soft-particle depth fade.
   */
  _buildFog(weather) {
    // Total instances per tier is unchanged (8 / 6 / 4); only the split moved.
    const seaLayers = weather >= 0.9 ? 5 : weather >= 0.6 ? 3 : 2;
    const wispLayers = weather >= 0.6 ? 2 : 1;
    const layers = seaLayers + 1 + wispLayers;
    const geo = this._quadGeometry();

    const fPar = new Float32Array(layers * 4);   // altitude, scale, phase, speed
    const fPar2 = new Float32Array(layers * 4);  // mode, alphaScale, grazePow, horizonFeather

    // Fewer slabs must not mean a thinner sea: normalise so N layers over-composite to
    // roughly the reference stack's opacity. First-order (alpha is small per layer), and
    // it is the difference between a phone that has mist and one that does not.
    const seaNorm = REF_SEA_LAYERS / seaLayers;

    for (let i = 0; i < seaLayers; i++) {
      const t = i / Math.max(1, seaLayers - 1);
      // −34 m to +13 m about the datum. The top of the sea lands near 795 m: high
      // enough to be a real cloud surface from the overlook, still 17 m under the
      // 812 m flagstone and 10 m under the 805 m near rim, so neither can flood.
      const alt = -34 + t * 47;
      fPar[i * 4] = alt;
      // The basin is read from 200 m (750 m ASL) out to 600 m (591 m ASL), and the
      // radial edge fade eats the outer 40% of every plane — so the plane has to be
      // several times the distance it must cover. Sized so the fully-opaque disc
      // reaches ~306-707 m and the feathered rim lands past the far ridge.
      //
      // The span grew from 820 to 1180 because the *upper* slabs were the ones running
      // out of radius: a sightline that only grazes 5-10 m below the datum travels
      // 600-900 m to get there, past the old top plane's rim, so on any tier that
      // dropped a middle slab a hole opened in the band. Measured on the `wide` pose,
      // row 550: MEDIUM alpha 0.046 -> 0.103, and the worst ULTRA/MEDIUM row ratio
      // across the band falls from 2.24 to 1.56. Triangles are unchanged — this is a
      // vertex-position scale on the same two-triangle instance.
      fPar[i * 4 + 1] = 900 + t * 1180;
      fPar[i * 4 + 2] = this.rng() * 100;
      fPar[i * 4 + 3] = 0.30 + this.rng() * 0.45;
      fPar2[i * 4] = 0;
      // Inversion profile, folded in on the CPU: it is a pure function of the layer's
      // own altitude, so there is no reason to pay for it per fragment. Widened from
      // smoothstep(−16, 10) — at (−16, 10) the 795 m top slab came out at 0.037 and the
      // sea had no top surface at all, which left a hole in the middle of the band on
      // any tier that dropped the layer below it.
      fPar2[i * 4 + 1] = seaNorm * smoothstep(-26, 12, -alt);
      fPar2[i * 4 + 2] = 0.65;
      fPar2[i * 4 + 3] = 0.032;                         // horizon feather, |V.y| units
    }

    {
      const i = seaLayers;
      fPar[i * 4] = 26;                                 // 808 m: over the sea, under the floor
      fPar[i * 4 + 1] = 1150;                           // opaque to ~390 m, feathered to 575 m
      fPar[i * 4 + 2] = this.rng() * 100;
      fPar[i * 4 + 3] = 0.42;
      fPar2[i * 4] = 0;
      fPar2[i * 4 + 1] = 1.15;
      fPar2[i * 4 + 2] = 0.85;
      fPar2[i * 4 + 3] = 0.022;
    }

    for (let j = 0; j < wispLayers; j++) {
      const i = seaLayers + 1 + j;
      fPar[i * 4] = 0.10 + j * 0.28;                    // centimetres, not metres
      fPar[i * 4 + 1] = 70 + j * 40;
      fPar[i * 4 + 2] = this.rng() * 100;
      fPar[i * 4 + 3] = 0.5 + this.rng() * 0.5;
      fPar2[i * 4] = 1;
      fPar2[i * 4 + 1] = 0.34 - j * 0.10;
      fPar2[i * 4 + 2] = 2.4;                           // only visible near grazing
      fPar2[i * 4 + 3] = 0.0;                           // the wisp has no horizon to feather
    }

    geo.setAttribute('fPar', new InstancedBufferAttribute(fPar, 4));
    geo.setAttribute('fPar2', new InstancedBufferAttribute(fPar2, 4));
    geo.instanceCount = layers;

    const mat = new ShaderMaterial({
      name: 'weather-fog',
      uniforms: {
        uWind: this.windUniforms.uWind,
        uGust: this.windUniforms.uGust,
        uTime: { value: 0 },
        uOrigin: { value: new Vector3() },
        uBaseY: { value: 0 },
        uDatum: { value: VALLEY_DATUM_FALLBACK },
        uDensity: { value: 0.6 },
        uWisp: { value: 0.1 },
        uColor: { value: new Color('#9fb0c4') },
        uSunColor: { value: new Color('#ffd9a8') },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uResolution: { value: this._resolution.clone() },
        uDepth: { value: null },
        uNear: { value: 0.12 },
        uFar: { value: 900 },
        uSoftness: { value: 4.5 },
      },
      vertexShader: FOG_VERT,
      fragmentShader: FOG_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 8;
    this.ctx.scene?.add(mesh);

    this.fog = { layers, seaLayers, bankLayers: 1, wispLayers, geo, mat, mesh };
  }

  _updateFog(rdt) {
    const f = this.fog;
    if (!f) return;
    const u = f.mat.uniforms;
    const q = clamp(this.ctx.quality?.weather ?? 0.7, 0.2, 1.2);
    // Blending a slab that is already rasterised costs the same at alpha 0.1 and 0.2, so
    // scaling *opacity* by the tier bought no frame time and cost the phone its only
    // mid-ground depth cue. Cost still scales with the tier — via the layer count in
    // `_buildFog`, which is what actually drives overdraw. Opacity gets a much shallower
    // curve so the mist is present on MEDIUM (0.955x) and LOW (0.903x) rather than 0.7x.
    const qMist = 0.85 + 0.15 * q;
    const density = clamp(this.current.fog, 0, 1.4) * qMist;
    const wisp = clamp(this.current.wisp, 0, 1) * q;
    f.mesh.visible = density > 0.01 || wisp > 0.01;
    if (!f.mesh.visible) return;

    u.uTime.value = this.time;
    u.uOrigin.value.copy(this.origin);
    u.uBaseY.value = this.baseY;
    u.uDatum.value = this.valleyDatum;
    u.uDensity.value = density;
    u.uWisp.value = wisp;
    u.uColor.value.copy(this.fogColor);
    u.uSunColor.value.copy(this.sunColor);
    u.uSunDir.value.copy(this.sunDir);

    const cam = this.ctx.camera;
    if (cam) { u.uNear.value = cam.near; u.uFar.value = cam.far; }

    // PostFX boots after us, so the depth texture is wired the first frame it
    // exists. One recompile, then soft particles for the rest of the session.
    if (!this._depthWired) {
      const dt = this.ctx.pipeline?.depthTexture;
      if (dt && dt.isTexture) {
        u.uDepth.value = dt;
        f.mat.defines.SOFT_DEPTH = 1;
        f.mat.needsUpdate = true;
        this._depthWired = true;
      }
    }
  }

  // =================================================================== splashes

  /** Rain hitting the ground. A ring card per impact, spawned into a ring buffer. */
  _buildSplash(capacity) {
    const geo = this._quadGeometry();
    const sT = new Float32Array(capacity * 4);   // spawn, life, seed, unused
    const sPos = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) { sT[i * 4] = -1e6; sT[i * 4 + 1] = 1; }

    const attrs = [];
    const bind = (key, arr, size) => {
      const a = new InstancedBufferAttribute(arr, size);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(key, a); attrs.push(a);
    };
    bind('sT', sT, 4); bind('sPos', sPos, 3);

    const mat = new ShaderMaterial({
      name: 'weather-splash',
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.atlas },
        uColor: { value: new Color('#d7e6f0') },
        uSize: { value: 0.26 },
      },
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 10;
    this.ctx.scene?.add(mesh);

    this.splash = {
      capacity, geo, mat, mesh, attrs, sT, sPos,
      head: 0, used: 0, wrapped: false, deadAfter: -1,
      dirtyMin: 1e9, dirtyMax: -1,
    };
  }

  _updateSplashes(rdt) {
    const s = this.splash;
    if (!s) return;
    const rain = clamp(this.current.rain, 0, 1.6);
    s.mat.uniforms.uTime.value = this.time;

    if (rain > 0.02) {
      // Rate is per second; the accumulator keeps it frame-rate independent.
      const rate = 70 * rain * clamp(this.ctx.quality?.weather ?? 0.7, 0.2, 1.2);
      this._splashTimer += rdt * rate;
      let budget = 8;                       // never more than 8 heightAt calls a frame
      while (this._splashTimer >= 1 && budget-- > 0) {
        this._splashTimer -= 1;
        const a = this.rng() * TAU;
        const r = Math.sqrt(this.rng()) * 14;
        const x = this.origin.x + Math.cos(a) * r;
        const z = this.origin.z + Math.sin(a) * r;
        this._emitSplash(x, this._groundY(x, z) + 0.015, z);
      }
      if (this._splashTimer > 4) this._splashTimer = 4;
    }

    if (s.deadAfter >= 0 && this.time > s.deadAfter) {
      s.geo.instanceCount = 0;
      s.head = 0; s.used = 0; s.wrapped = false; s.deadAfter = -1;
    } else {
      s.geo.instanceCount = s.used;
    }

    if (s.dirtyMin > s.dirtyMax) return;
    const lo = s.dirtyMin, hi = s.dirtyMax;
    for (let i = 0; i < s.attrs.length; i++) {
      const at = s.attrs[i];
      if (at.clearUpdateRanges) { at.clearUpdateRanges(); at.addUpdateRange(lo * at.itemSize, (hi - lo + 1) * at.itemSize); }
      at.needsUpdate = true;
    }
    s.dirtyMin = 1e9; s.dirtyMax = -1;
  }

  _emitSplash(x, y, z) {
    const s = this.splash;
    const i = s.head;
    s.head = (i + 1) % s.capacity;
    if (s.head === 0) s.wrapped = true;
    s.used = s.wrapped ? s.capacity : Math.max(s.used, s.head);
    if (i < s.dirtyMin) s.dirtyMin = i;
    if (i > s.dirtyMax) s.dirtyMax = i;

    const life = 0.32 + this.rng() * 0.16;
    s.sT[i * 4] = this.time; s.sT[i * 4 + 1] = life;
    s.sT[i * 4 + 2] = this.rng(); s.sT[i * 4 + 3] = 0;
    s.sPos[i * 3] = x; s.sPos[i * 3 + 1] = y; s.sPos[i * 3 + 2] = z;
    const dead = this.time + life;
    if (dead > s.deadAfter) s.deadAfter = dead;
  }

  // ------------------------------------------------------------------ lifecycle

  resize(w, h, bufW, bufH) {
    this._resolution.set(bufW || w, bufH || h, 1 / Math.max(1, bufW || w), 1 / Math.max(1, bufH || h));
    if (this.fog) this.fog.mat.uniforms.uResolution.value.copy(this._resolution);
  }

  applyQuality(q) {
    if (!q || this._disposed) return;
    this._qualityScale = clamp(q.weather ?? 0.7, 0, 1.6);
    // Densities are re-derived from quality every frame in _updateFields, so a
    // tier change only needs the scale; no buffers are reallocated.
  }

  dispose() {
    this._disposed = true;
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      this.ctx.scene?.remove(f.mesh);
      f.geo.dispose(); f.mat.dispose();
    }
    this.fields.length = 0;
    if (this.fog) {
      this.ctx.scene?.remove(this.fog.mesh);
      this.fog.geo.dispose(); this.fog.mat.dispose();
      this.fog = null;
    }
    if (this.splash) {
      this.ctx.scene?.remove(this.splash.mesh);
      this.splash.geo.dispose(); this.splash.mat.dispose();
      this.splash = null;
    }
    this.atlas?.dispose();
    this.lensTexture?.dispose();
  }
}

// =============================================================================
//  GLSL
// =============================================================================

const FIELD_VERT = /* glsl */`
attribute vec4 aRand;    // rx, ry, rz, seed
attribute vec4 aRand2;   // sizeVar, speedVar, tumbleVar, phase
attribute vec3 aAxis;

uniform float uTime;
uniform vec3  uOrigin;
uniform vec3  uBox;
uniform float uBaseY;
uniform float uGroundY;
uniform float uSize;
uniform float uFall;
uniform float uTumble;
uniform float uFlutter;
uniform float uDrag;
uniform float uSprite;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uTransmit;
uniform float uOpacity;
uniform float uFade;

varying vec2 vUv;
varying vec4 vColor;

${WIND_GLSL}

vec3 rotAxis(vec3 v, vec3 a, float ang){
  float c = cos(ang), s = sin(ang);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}

#include <fog_pars_vertex>

void main(){
  float seed = aRand.w;
  vec2 wdir = normalize(uWind.xy + vec2(1e-5, 0.0));

  // Vertical: a plain wrap through the box. Negative uFall rises (embers).
  float fall = uFall * aRand2.y;
  float y = mod(aRand.y * uBox.y - fall * uTime, uBox.y);

  // Horizontal: bulk advection by the wind plus a per-particle wander.
  vec2 drift = wdir * (uWind.z * uTime * uDrag);
  drift += vec2(
    snoise2(vec2(seed * 57.0, uTime * 0.33)),
    snoise2(vec2(seed * 57.0 + 31.0, uTime * 0.29))
  ) * uFlutter * 1.6;

  vec2 hbox = uBox.xz * 0.5;
  vec2 basePos = vec2(aRand.x, aRand.z) * uBox.xz + drift;
  vec2 xz = mod(basePos - uOrigin.xz + hbox, uBox.xz) - hbox + uOrigin.xz;

  vec3 wp = vec3(xz.x, uBaseY + y - uBox.y * 0.18, xz.y);

  // The gust surge: as a front sweeps past, everything inside it leans together.
  vec3 wnd = kagerouWind(wp);
  wp.xz += wnd.xz * uFlutter * 0.16;

#if MODE == 2
  wp.y += sin(uTime * (0.7 + aRand2.z) + seed * 6.2831) * 0.55;
  wp.xz += vec2(sin(uTime * 0.6 + seed * 12.0), cos(uTime * 0.53 + seed * 9.0)) * 0.65;
#endif
#if MODE == 4
  wp += vec3(
    sin(uTime * 0.40 + seed * 21.0),
    sin(uTime * 0.31 + seed * 13.0),
    cos(uTime * 0.37 + seed * 17.0)
  ) * 0.35;
#endif

  float size = uSize * aRand2.x;

  float aGround = smoothstep(uGroundY - 0.5, uGroundY + 1.1, wp.y);
  float aTop = 1.0 - smoothstep(uBox.y * 0.74, uBox.y * 0.96, y);
  float rad = length(wp.xz - uOrigin.xz);
  float aDist = 1.0 - smoothstep(max(hbox.x, hbox.y) * 0.70, max(hbox.x, hbox.y) * 0.98, rad);
  float alpha = uOpacity * uFade * aGround * aTop * aDist;

  vec3 nrm = vec3(0.0, 0.0, 1.0);
  vec4 mvPosition;

#if MODE == 0 || MODE == 1
  // True 3-axis tumble with a flutter phase — a spin about the view axis reads
  // as a rotating sticker and instantly kills the illusion.
  float ph = uTime * uTumble * aRand2.z + aRand2.w * 6.2831;
  float ph2 = ph * 0.43 + seed * 6.2831;
  vec3 ax = normalize(aAxis);
  vec3 corner = vec3(position.x * size, position.y * size * 1.3, 0.0);
  corner = rotAxis(corner, ax, ph);
  corner = rotAxis(corner, vec3(0.0, 1.0, 0.0), ph2);
  nrm = rotAxis(rotAxis(vec3(0.0, 0.0, 1.0), ax, ph), vec3(0.0, 1.0, 0.0), ph2);
  mvPosition = viewMatrix * vec4(wp + corner, 1.0);
#elif MODE == 3
  // Rain: stretch the quad along the drop's velocity.
  vec3 vel = vec3(wnd.x * 0.35, -fall, wnd.z * 0.35);
  vec3 vv = mat3(viewMatrix) * vel;
  mvPosition = viewMatrix * vec4(wp, 1.0);
  float vl = length(vv.xy);
  vec2 off = position.xy * size;
  if (vl > 1e-4){
    vec2 axv = vv.xy / vl;
    vec2 ayv = vec2(-axv.y, axv.x);
    off = axv * (position.y * size * (2.5 + vl * 0.30)) + ayv * (position.x * size);
  }
  mvPosition.xy += off;
#else
  mvPosition = viewMatrix * vec4(wp, 1.0);
  mvPosition.xy += position.xy * size;
#endif

  gl_Position = projectionMatrix * mvPosition;

  float cell = floor(uSprite + 0.5);
  vec2 grid = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vUv = (uv + grid) * 0.25;

  vec3 col = mix(uColorA, uColorB, fract(seed * 7.3));

#if MODE == 0 || MODE == 1
  // Subsurface: a petal lit from behind glows, and that is the shot.
  float facing = abs(dot(nrm, uSunDir));
  vec3 V = normalize(wp - cameraPosition);
  float back = pow(max(dot(V, -uSunDir), 0.0), 3.0);
  col *= 0.45 + 0.65 * facing;
  col += uSunColor * back * uTransmit * (1.0 - facing * 0.55) * 0.55;
#endif
#if MODE == 2
  float pulse = 0.55 + 0.45 * sin(uTime * (2.0 + aRand2.z * 3.0) + seed * 20.0);
  col *= pulse * 1.7;
  alpha *= 0.5 + 0.5 * pulse;
#endif
#if MODE == 4
  vec3 Vm = normalize(wp - cameraPosition);
  float shaft = pow(max(dot(Vm, -uSunDir), 0.0), 8.0);
  alpha *= 0.12 + 0.88 * shaft;
  col *= 1.4;
#endif
#if MODE == 3
  alpha *= 0.55;
#endif

  vColor = vec4(col, alpha);

  #include <fog_vertex>
}
`;

const FIELD_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;

#include <fog_pars_fragment>

void main(){
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const FOG_VERT = /* glsl */`
attribute vec4 fPar;     // altitude, scale, phase, speed
attribute vec4 fPar2;    // mode (0 = altitude-pinned slab, 1 = ground wisp), alphaScale,
                         // grazePow, horizonFeather

uniform float uTime;
uniform vec3 uOrigin;
uniform float uBaseY;    // damped terrain height under the camera (wisp anchor)
uniform float uDatum;    // absolute valley altitude (cloud-sea anchor)

varying vec3 vWorld;
varying vec2 vQuad;
varying float vViewZ;
varying float vPhase;
varying float vSpeed;
varying float vMode;
varying float vAlphaScale;
varying float vGrazePow;
varying float vHorizon;
varying float vNFreq;

void main(){
  vQuad = position.xy + 0.5;
  vPhase = fPar.z;
  vSpeed = fPar.w;
  vMode = fPar2.x;
  vGrazePow = fPar2.z;
  vHorizon = fPar2.w;
  // Noise frequency from the layer's own reach: a slab that covers 500 m needs pools
  // hundreds of metres across, a 70 m wisp needs metres. One expression for both, and it
  // is the reason the band had "no variation along its length".
  //
  // A horizontal plane compresses depth savagely near its vanishing line: on the wide
  // pose one pixel row spans 20.8 m along the 795 m slab at row 500 (measured — t goes
  // 803.6 m to 762.0 m between rows 500 and 502). At the old fixed 0.018 that is 0.37
  // periods of the base octave per row, so octaves 2-4 sat at 0.75, 1.5 and 3.0
  // periods/row, all past Nyquist, and the fbm integrated to a constant. 6/scale gives
  // 150-347 m wavelengths: 0.06-0.14 periods/row at the base, three octaves resolved.
  vNFreq = 6.0 / max(fPar.y, 1.0);

  // Mode 0 pins to world altitude, so the plateau at 812 m is simply above the
  // whole stack and occludes it. Mode 1 rides the ground the player is on.
  float anchor = mix(uDatum, uBaseY, step(0.5, fPar2.x));
  float wy = anchor + fPar.x;

  // The inversion profile now arrives baked into fPar2.y (it is a function of the
  // layer's altitude alone, so _buildFog computes it once instead of per fragment).
  vAlphaScale = fPar2.y;

  // Only the XZ extent follows the camera; the layer never rides our height.
  vec3 wp = vec3(position.x, 0.0, position.y) * fPar.y + vec3(uOrigin.x, wy, uOrigin.z);
  vWorld = wp;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FOG_FRAG = /* glsl */`
uniform sampler2D uDepth;
uniform vec4 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uSoftness;
uniform float uDensity;
uniform float uWisp;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;

varying vec3 vWorld;
varying vec2 vQuad;
varying float vViewZ;
varying float vPhase;
varying float vSpeed;
varying float vMode;
varying float vAlphaScale;
varying float vGrazePow;
varying float vHorizon;
varying float vNFreq;

${WIND_GLSL}

float perspectiveDepthToViewZ_(float invClipZ, float near, float far){
  return (near * far) / ((far - near) * invClipZ - far);
}

void main(){
  vec2 wdir = normalize(uWind.xy + vec2(1e-5, 0.0));
  vec2 q = vWorld.xz * vNFreq - wdir * (uWind.w * (0.05 + vSpeed * 0.05)) + vPhase;

  // Two terms, same total noise cost as before (4 + 3 octaves):
  //   n  — pools, at the layer's own scale, so opacity varies *along* the band instead
  //        of sitting level. This is what makes the mist gather in hollows.
  //   g  — the shared gust envelope. Not a second gust implementation: it is the same
  //        kagerouGust() every other consumer calls (§10), so the ripple travelling
  //        through the mist is the same wavefront that is bending the grass under it.
  float n = fbm2(q, 4);
  float g = kagerouGust(vWorld.xz);
  float density = smoothstep(-0.30, 0.55, n + (g - 0.5) * 0.55);

  float radial = 1.0 - smoothstep(0.34, 0.50, length(vQuad - 0.5));

  vec3 V = vWorld - cameraPosition;
  float dist = length(V);
  V /= max(dist, 1e-4);

  // Mist reads as volume edge-on; looking straight down at a plane exposes it.
  // The wisp uses a much sharper exponent so it only shows raking across the
  // flagstone and never as a lid over the courtyard.
  float grazing = pow(clamp(1.0 - abs(V.y), 0.0, 1.0), vGrazePow);
  // ...and never reveal the sheet while the camera sits inside it.
  float camFade = smoothstep(0.0, 1.8, abs(cameraPosition.y - vWorld.y));

  // A horizontal plane below the eye has a vanishing line, and 'grazing' peaks exactly
  // on it — so the slab reached full opacity in the same pixel row it appeared in, which
  // is the hard horizontal top edge r5 measured across the bamboo treeline. Feather the
  // last fraction of a degree instead: alpha now ramps to zero as the ray flattens onto
  // the plane, which converts that discontinuity into a gradient tens of rows deep.
  //
  // The max() is not decoration: the wisp passes vHorizon = 0, and smoothstep with equal
  // edges is 0/0. A ternary would not save it — GLSL compilers routinely flatten both
  // sides of one — and a NaN here would cross into gl_FragColor (§5b). At 1e-4 the
  // wisp's factor is 1.0 for every ray steeper than 0.006 degrees, i.e. the identity.
  float horizonFade = smoothstep(0.0, max(vHorizon, 1e-4), abs(V.y));

  float strength = mix(uDensity, uWisp, step(0.5, vMode));
  float alpha = density * radial * grazing * horizonFade * camFade * strength * vAlphaScale * 0.32;
  alpha *= 0.15 + 0.85 * smoothstep(3.0, 24.0, dist);

  // The wisp is a foreground detail; do not let it haze the far half of the shot.
  alpha *= mix(1.0, 1.0 - smoothstep(28.0, 70.0, dist), step(0.5, vMode));

  #ifdef SOFT_DEPTH
    vec2 suv = gl_FragCoord.xy * uResolution.zw;
    float sceneZ = perspectiveDepthToViewZ_(texture2D(uDepth, suv).x, uNear, uFar);
    alpha *= clamp((vViewZ - sceneZ) / uSoftness, 0.0, 1.0);
  #endif

  if (alpha < 0.003) discard;

  float scat = pow(max(dot(V, uSunDir), 0.0), 4.0);
  vec3 col = mix(uColor, uSunColor, scat * 0.55);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SPLASH_VERT = /* glsl */`
attribute vec4 sT;      // spawn, life, seed, unused
attribute vec3 sPos;

uniform float uTime;
uniform float uSize;

varying vec2 vUv;
varying float vAlpha;

void main(){
  float life = max(sT.y, 1e-4);
  float t01 = (uTime - sT.x) / life;
  if (t01 < 0.0 || t01 > 1.0){
    vUv = vec2(0.0); vAlpha = 0.0;
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }
  float e = 1.0 - pow(1.0 - t01, 2.0);
  float s = uSize * (0.15 + e) * (0.6 + sT.z * 0.8);
  vec3 wp = sPos + vec3(position.x * s, 0.0, position.y * s);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = (uv + vec2(1.0, 1.0)) * 0.25;      // cell 5 = splash ring
  vAlpha = (1.0 - t01) * 0.5;
}
`;

const SPLASH_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
void main(){
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * tex.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// =============================================================================
//  Procedural textures
// =============================================================================

function cellCtx(g, size, i) {
  const cell = size / 4;
  g.save();
  g.beginPath();
  g.rect((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
  g.clip();
  g.translate((i % 4) * cell + cell * 0.5, Math.floor(i / 4) * cell + cell * 0.5);
  return cell;
}

function makeWeatherAtlas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rnd = makeRandom(31337);
  g.clearRect(0, 0, size, size);
  const R = (i) => cellCtx(g, size, i) * 0.5 * 0.88;
  const done = () => g.restore();

  // 0 — sakura petal, notched tip, slightly cupped shading
  {
    const r = R(W_PETAL);
    const grd = g.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.78)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0.88)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, r * 0.94);
    g.bezierCurveTo(r * 0.82, r * 0.34, r * 0.58, -r * 0.60, r * 0.15, -r * 0.88);
    g.quadraticCurveTo(0, -r * 0.60, -r * 0.15, -r * 0.88);
    g.bezierCurveTo(-r * 0.58, -r * 0.60, -r * 0.82, r * 0.34, 0, r * 0.94);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.14)';
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath(); g.moveTo(0, r * 0.82); g.lineTo(0, -r * 0.66); g.stroke();
    done();
  }

  // 1 — autumn leaf
  {
    const r = R(W_LEAF);
    g.fillStyle = 'rgba(255,255,255,0.97)';
    g.beginPath();
    g.moveTo(0, -r * 0.94);
    g.bezierCurveTo(r * 0.70, -r * 0.34, r * 0.56, r * 0.54, 0, r * 0.94);
    g.bezierCurveTo(-r * 0.56, r * 0.54, -r * 0.70, -r * 0.34, 0, -r * 0.94);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = Math.max(1, r * 0.055);
    g.beginPath(); g.moveTo(0, -r * 0.9); g.lineTo(0, r * 0.9); g.stroke();
    g.lineWidth = Math.max(1, r * 0.03);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const y = k * r * 0.22;
      g.beginPath(); g.moveTo(0, y); g.lineTo(r * 0.44, y + r * 0.2); g.stroke();
      g.beginPath(); g.moveTo(0, y); g.lineTo(-r * 0.44, y + r * 0.2); g.stroke();
    }
    done();
  }

  // 2 — ember
  {
    const r = R(W_EMBER);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.14, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.38, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 3 — rain streak (vertical, stretched by the shader)
  {
    const r = R(W_STREAK);
    const grd = g.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -r);
    g.quadraticCurveTo(r * 0.34, 0, 0, r);
    g.quadraticCurveTo(-r * 0.34, 0, 0, -r);
    g.fill();
    done();
  }

  // 4 — dust mote
  {
    const r = R(W_MOTE);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 5 — splash ring with a small crown
  {
    const r = R(W_RING);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1, r * 0.09);
    g.beginPath(); g.arc(0, 0, r * 0.7, 0, 6.2832); g.stroke();
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath(); g.arc(0, 0, r * 0.42, 0, 6.2832); g.stroke();
    g.globalAlpha = 0.75;
    g.fillStyle = '#fff';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.2832 + rnd() * 0.3;
      const h = r * (0.10 + rnd() * 0.18);
      g.save(); g.rotate(a);
      g.beginPath();
      g.moveTo(r * 0.64, -r * 0.04); g.lineTo(r * 0.70 + h, 0); g.lineTo(r * 0.64, r * 0.04);
      g.closePath(); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    done();
  }

  // 6 — mist blob (unused by the layered fog, handy for one-off puffs)
  {
    const r = R(W_MIST);
    for (let k = 0; k < 8; k++) {
      const a = rnd() * 6.2832, d = rnd() * r * 0.45, rr = r * (0.4 + rnd() * 0.45);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, rr);
      grd.addColorStop(0, 'rgba(255,255,255,0.22)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.09)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d);
      g.fillStyle = grd;
      g.beginPath(); g.arc(0, 0, rr, 0, 6.2832); g.fill();
      g.restore();
    }
    done();
  }

  // 7 — wide soft glow (firefly halo)
  {
    const r = R(W_GLOW);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.16)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = false;      // 4×4 atlas: mips bleed between cells
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Raindrop-on-lens overlay for PostFX to composite.
 *   RG — screen-space refraction offset, remapped to [0,1]
 *   B  — a broad smear/streak mask
 *   A  — droplet coverage
 */
function makeLensTexture(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rnd = makeRandom(777);

  g.fillStyle = 'rgba(128,128,0,0)';
  g.fillRect(0, 0, size, size);

  const drop = (x, y, r, squash) => {
    // Offset field: a fake normal, encoded so 0.5 is "no deflection".
    const grd = g.createRadialGradient(x - r * 0.28, y - r * 0.28, 0, x, y, r);
    grd.addColorStop(0, 'rgba(215,215,255,0.95)');
    grd.addColorStop(0.55, 'rgba(150,150,190,0.75)');
    grd.addColorStop(0.86, 'rgba(60,60,120,0.55)');
    grd.addColorStop(1, 'rgba(128,128,90,0)');
    g.save();
    g.translate(x, y); g.scale(1, squash); g.translate(-x, -y);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    g.restore();
  };

  for (let i = 0; i < 90; i++) {
    drop(rnd() * size, rnd() * size, size * (0.008 + Math.pow(rnd(), 2.2) * 0.055), 1 + rnd() * 0.6);
  }
  // A few running streaks: the drops that have already been dragged down the glass.
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size, y = rnd() * size;
    const len = size * (0.05 + rnd() * 0.18);
    const w = size * (0.004 + rnd() * 0.010);
    const grd = g.createLinearGradient(x, y, x, y + len);
    grd.addColorStop(0, 'rgba(150,150,190,0.5)');
    grd.addColorStop(1, 'rgba(128,128,90,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y + len * 0.5, w, len * 0.5, 0, 0, 6.2832);
    g.fill();
    drop(x, y + len, w * 2.1, 1.25);
  }

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
