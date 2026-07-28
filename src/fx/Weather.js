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

import { noise, makeRandom, clamp, lerp, damp, glslNoise } from '../core/Noise.js';

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
 * The gust envelope. `phase` travels along the wind direction, so the ridge of
 * the wave sweeps across the world instead of pulsing everywhere at once.
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
 * root, 1 at the tip). `stiffness` > 1 is a bamboo culm, < 1 is a grass blade.
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

/** Every preset is a full target state; `setPreset` cross-fades between two. */
export const WEATHER_PRESETS = {
  clear: { petals: 0.25, leaves: 0.15, embers: 0.00, motes: 0.60, rain: 0.00, fog: 0.22, wetness: 0.00, wind: 0.35, gust: 0.35 },
  mist: { petals: 0.30, leaves: 0.20, embers: 0.00, motes: 0.30, rain: 0.00, fog: 1.00, wetness: 0.18, wind: 0.20, gust: 0.22 },
  rain: { petals: 0.05, leaves: 0.30, embers: 0.00, motes: 0.00, rain: 1.00, fog: 0.55, wetness: 0.90, wind: 0.60, gust: 0.60 },
  storm: { petals: 0.00, leaves: 0.60, embers: 0.00, motes: 0.00, rain: 1.60, fog: 0.42, wetness: 1.00, wind: 1.00, gust: 1.00 },
  petals: { petals: 1.00, leaves: 0.35, embers: 0.15, motes: 0.60, rain: 0.00, fog: 0.58, wetness: 0.00, wind: 0.45, gust: 0.50 },
  night: { petals: 0.50, leaves: 0.20, embers: 1.00, motes: 0.10, rain: 0.00, fog: 0.80, wetness: 0.05, wind: 0.25, gust: 0.30 },
};

const PRESET_KEYS = ['petals', 'leaves', 'embers', 'motes', 'rain', 'fog', 'wetness', 'wind', 'gust'];
const CROSSFADE = 4.0;      // seconds, per the brief

// Field modes, matched by `#define MODE` in the shader.
const MODE_PETAL = 0, MODE_LEAF = 1, MODE_EMBER = 2, MODE_RAIN = 3, MODE_MOTE = 4;

// Weather atlas cells (4×4).
const W_PETAL = 0, W_LEAF = 1, W_EMBER = 2, W_STREAK = 3;
const W_MOTE = 4, W_RING = 5, W_MIST = 6, W_GLOW = 7;

const _v0 = new Vector3(), _v1 = new Vector3();
const _c0 = new Color();

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

    // --- broadcast state -------------------------------------------------------
    this.wetness = 0;              // 0..1, read by Materials/Terrain
    this._wetnessSent = -1;
    this.lensTexture = null;       // raindrop-on-lens overlay for PostFX
    this.lensStrength = 0;

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
    this.baseY = damp(this.baseY, this.groundY, 2.5, rdt);

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

    // --- broadcast wetness ----------------------------------------------------
    if (Math.abs(this.wetness - this._wetnessSent) > 0.01) {
      this._wetnessSent = this.wetness;
      this.ctx.bus?.emit('weather-wetness', this.wetness);
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
    const fc = s?.fogColor || s?.horizonColor;
    if (fc && fc.isColor) this.fogColor.copy(fc);

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
   * Layered horizontal noise planes at valley altitude. Horizontal layers are the
   * only volumetric-looking mist that stays inside a mobile budget; the tell-tale
   * flatness is hidden by a grazing-angle term, a camera-plane proximity fade and
   * a soft-particle depth fade against the scene.
   */
  _buildFog(weather) {
    const layers = weather >= 0.9 ? 7 : weather >= 0.6 ? 5 : 3;
    const geo = this._quadGeometry();

    const fPar = new Float32Array(layers * 4);   // height, scale, phase, speed
    for (let i = 0; i < layers; i++) {
      const t = i / Math.max(1, layers - 1);
      fPar[i * 4] = -0.6 + t * 7.5;                        // metres above the valley floor
      fPar[i * 4 + 1] = 110 + t * 130;                     // plane size
      fPar[i * 4 + 2] = this.rng() * 100;
      fPar[i * 4 + 3] = 0.35 + this.rng() * 0.5;
    }
    const at = new InstancedBufferAttribute(fPar, 4);
    geo.setAttribute('fPar', at);
    geo.instanceCount = layers;

    const mat = new ShaderMaterial({
      name: 'weather-fog',
      uniforms: {
        uWind: this.windUniforms.uWind,
        uGust: this.windUniforms.uGust,
        uTime: { value: 0 },
        uOrigin: { value: new Vector3() },
        uBaseY: { value: 0 },
        uDensity: { value: 0.6 },
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

    this.fog = { layers, geo, mat, mesh };
  }

  _updateFog(rdt) {
    const f = this.fog;
    if (!f) return;
    const u = f.mat.uniforms;
    const density = clamp(this.current.fog, 0, 1.4) * clamp(this.ctx.quality?.weather ?? 0.7, 0.2, 1.2);
    f.mesh.visible = density > 0.01;
    if (!f.mesh.visible) return;

    u.uTime.value = this.time;
    u.uOrigin.value.copy(this.origin);
    u.uBaseY.value = this.baseY;
    u.uDensity.value = density;
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

// FIELDS_MARKER

// SHADERS_MARKER
