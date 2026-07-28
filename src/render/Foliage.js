/**
 * Foliage.js — grass, bamboo, trees, shrubs, and the wind that moves all of them.
 *
 * This is the most visible system in the game and the easiest one to blow the mobile
 * frame budget with, so every decision here is a trade between those two facts:
 *
 *  - Everything is GPU-instanced. One `InstancedBufferGeometry` per (kind, LOD, batch).
 *  - Grass lives in a camera-following tile grid. A tile's instance data is generated
 *    once, cached by (worldTile, lod), and re-emitted into the batch buffers only when
 *    the grid shifts — never per frame.
 *  - All animation is in the vertex shader. `update()` writes ~20 uniforms and nothing else.
 *  - LOD/cull transitions are a screen-door dither so nothing pops.
 *
 * The wind field is the contract that ties grass, bamboo, banners and cloth together.
 * `FOLIAGE_WIND_GLSL` below is the authoritative implementation; Weather.js must publish
 * a byte-identical `WIND_GLSL` or the gust wavefronts will disagree across systems.
 * If `ctx.weather.WIND_GLSL` exists at init we use theirs instead, so there is exactly
 * one field in the build either way.
 */

import {
  Group,
  Mesh,
  Scene,
  BufferGeometry,
  BufferAttribute,
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  Sphere,
  Vector2,
  Vector3,
  Color,
  MeshLambertMaterial,
  MeshBasicMaterial,
  MeshDepthMaterial,
  RGBADepthPacking,
  DoubleSide,
  FrontSide,
  CanvasTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  ClampToEdgeWrapping,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  DynamicDrawUsage,
  WebGLRenderTarget,
  OrthographicCamera,
  DirectionalLight,
  HemisphereLight,
} from 'three';

import { WORLD, plateauMask } from '../world/Constants.js';
import { glslNoise, noise, makeRandom, clamp, lerp, smoothstep } from '../core/Noise.js';

// =============================================================================
// 1. Wind field — the authoritative formula
// =============================================================================

/** Metres between successive gust wavefronts. */
export const WIND_WAVELENGTH = 34.0;
/** Metres per second the gust front travels along the wind axis. */
export const WIND_SPEED = 11.0;

/**
 * The shared wind field.
 *
 *   kagGustField(p, t) -> 0..1   scalar gust strength, a wavefront travelling along uWindDir
 *   kagWindField(p, t) -> vec3   xy = horizontal flow vector, z = gust 0..1
 *
 * Requires `snoise2`/`fbm2` from `glslNoise` to already be present in the shader, plus
 * these uniforms: uWindDir (vec2, normalised), uWindStrength, uWindGust, uWindTime.
 *
 * WEATHER.JS MUST MATCH THIS EXACTLY, or the gust that sweeps the grass will not be the
 * gust that sweeps the banners and the illusion dies.
 */
export const FOLIAGE_WIND_GLSL = /* glsl */`
#ifndef KAG_WIND_FIELD
#define KAG_WIND_FIELD

#define KAG_WIND_WAVELENGTH ${WIND_WAVELENGTH.toFixed(1)}
#define KAG_WIND_SPEED ${WIND_SPEED.toFixed(1)}
#define KAG_TAU 6.28318530718

uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uWindGust;
uniform float uWindTime;

// A gust is a travelling wavefront, not a global oscillation: the phase depends on how
// far the sample sits *along* the wind axis, so you watch the gust arrive.
float kagGustField( vec2 p, float t ) {
  float travel = dot( p, uWindDir );
  float ph = ( travel - t * KAG_WIND_SPEED ) / KAG_WIND_WAVELENGTH;
  float w = 0.62 * sin( ph * KAG_TAU ) + 0.38 * sin( ph * KAG_TAU * 0.437 + 1.7 );
  // Broad patchiness, advected downwind at half the front speed so patches travel too.
  vec2 adv = p - uWindDir * ( t * KAG_WIND_SPEED * 0.5 );
  float env = fbm2( adv * 0.0125, 3 );
  return clamp( ( w * ( 0.55 + 0.45 * env ) ) * 0.5 + 0.5, 0.0, 1.0 );
}

vec3 kagWindField( vec2 p, float t ) {
  float g = kagGustField( p, t );
  vec2 sw = p * 0.085 - uWindDir * ( t * 1.65 );
  float tx = snoise2( sw );
  float tz = snoise2( sw + vec2( 37.2, 11.9 ) );
  vec2 dir = normalize( uWindDir + vec2( tx, tz ) * 0.35 );
  float amp = uWindStrength * ( 0.45 + 0.55 * g ) + uWindGust * g * 0.9;
  return vec3( dir * amp, g );
}

#endif
`;

/** CPU twin of the field. Structurally identical; the simplex permutation tables differ. */
function windFieldJS(x, z, t, dirX, dirZ, strength, gust, out) {
  const TAU = Math.PI * 2;
  const travel = x * dirX + z * dirZ;
  const ph = (travel - t * WIND_SPEED) / WIND_WAVELENGTH;
  const w = 0.62 * Math.sin(ph * TAU) + 0.38 * Math.sin(ph * TAU * 0.437 + 1.7);
  const ax = x - dirX * (t * WIND_SPEED * 0.5);
  const az = z - dirZ * (t * WIND_SPEED * 0.5);
  const env = noise.fbm2(ax * 0.0125, az * 0.0125, 3);
  const g = clamp((w * (0.55 + 0.45 * env)) * 0.5 + 0.5, 0, 1);

  const sx = x * 0.085 - dirX * (t * 1.65);
  const sz = z * 0.085 - dirZ * (t * 1.65);
  let nx = dirX + noise.noise2(sx, sz) * 0.35;
  let nz = dirZ + noise.noise2(sx + 37.2, sz + 11.9) * 0.35;
  const inv = 1 / Math.max(Math.hypot(nx, nz), 1e-5);
  nx *= inv; nz *= inv;
  const amp = strength * (0.45 + 0.55 * g) + gust * g * 0.9;
  out.x = nx * amp; out.y = nz * amp; out.z = g;
  return out;
}

// =============================================================================
// 2. Shared helpers
// =============================================================================

/** three's onBeforeCompile is a single slot; chain so Sky's fog injection survives ours. */
function chainBeforeCompile(material, fn) {
  const prev = material.onBeforeCompile;
  if (typeof prev === 'function' && prev.length > 0) {
    material.onBeforeCompile = function (shader, renderer) {
      prev.call(this, shader, renderer);
      fn.call(this, shader, renderer);
    };
  } else {
    material.onBeforeCompile = fn;
  }
}

/** Program cache keys must differ once we inject code or three hands back a stale program. */
function chainCacheKey(material, token) {
  const prev = material.customProgramCacheKey;
  material.customProgramCacheKey = function () {
    return (prev ? prev.call(this) : '') + '|' + token;
  };
}

const _wind3 = { x: 0, y: 0, z: 0 };
const _sphereScratch = new Sphere();

function hashTileSeed(tx, tz, lod) {
  let h = Math.imul(tx | 0, 0x27d4eb2d) ^ Math.imul(tz | 0, 0x165667b1) ^ Math.imul(lod + 7, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

function nrm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}
function cross3(a, b, out) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

/**
 * Accumulates triangles into flat arrays. Every foliage mesh is authored in a canonical
 * unit space (y in [0,1] = full plant height, x/z in [-0.5,0.5] = full plant width) so a
 * single vertex shader can drive grass, bamboo and trees alike.
 *
 * `aFlex` is (flexibility, jitter): flexibility scales the high-frequency flutter so
 * leaf tips shiver while trunks do not, jitter decorrelates neighbouring cards.
 */
class GeoBuilder {
  constructor() {
    this.p = []; this.n = []; this.u = []; this.f = []; this.i = [];
  }

  get vertexCount() { return this.p.length / 3; }

  vert(px, py, pz, nx, ny, nz, u, v, flex, jit) {
    this.p.push(px, py, pz);
    this.n.push(nx, ny, nz);
    this.u.push(u, v);
    this.f.push(flex, jit);
    return this.p.length / 3 - 1;
  }

  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  /**
   * A textured card. `r` and `up` are the half-extent vectors; `nrm` is authored rather
   * than derived so foliage cards can carry a canopy-ish normal instead of a flat one.
   */
  card(c, r, up, nrm, u0, v0, u1, v1, flex, jit) {
    const a = this.vert(c[0] - r[0] - up[0], c[1] - r[1] - up[1], c[2] - r[2] - up[2], nrm[0], nrm[1], nrm[2], u0, v0, flex * 0.35, jit);
    const b = this.vert(c[0] + r[0] - up[0], c[1] + r[1] - up[1], c[2] + r[2] - up[2], nrm[0], nrm[1], nrm[2], u1, v0, flex * 0.35, jit);
    const d2 = this.vert(c[0] + r[0] + up[0], c[1] + r[1] + up[1], c[2] + r[2] + up[2], nrm[0], nrm[1], nrm[2], u1, v1, flex, jit);
    const e = this.vert(c[0] - r[0] + up[0], c[1] - r[1] + up[1], c[2] - r[2] + up[2], nrm[0], nrm[1], nrm[2], u0, v1, flex, jit);
    this.quad(a, b, d2, e);
  }

  /** One ring of a tube. Returns the first vertex index. */
  ring(c, n, b, radius, sides, v, flex, jit) {
    const start = this.vertexCount;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = n[0] * ca + b[0] * sa;
      const ny = n[1] * ca + b[1] * sa;
      const nz = n[2] * ca + b[2] * sa;
      this.vert(c[0] + nx * radius, c[1] + ny * radius, c[2] + nz * radius, nx, ny, nz, s / sides, v, flex, jit);
    }
    return start;
  }

  linkRings(a, b, sides) {
    for (let s = 0; s < sides; s++) this.quad(a + s, a + s + 1, b + s + 1, b + s);
  }

  scaleAll(s) {
    for (let i = 0; i < this.p.length; i++) this.p[i] *= s;
    return this;
  }

  translateY(dy) {
    for (let i = 1; i < this.p.length; i += 3) this.p[i] += dy;
    return this;
  }

  toGeometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.u), 2));
    g.setAttribute('aFlex', new BufferAttribute(new Float32Array(this.f), 2));
    const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new BufferAttribute(new IndexArray(this.i), 1));
    g.computeBoundingSphere();
    return g;
  }
}

//@@SECTION_3@@
