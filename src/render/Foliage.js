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

// =============================================================================
// 3. The foliage shader
// =============================================================================

const MAX_CHARACTERS = 8;
const MAX_DISTURB = 4;

/**
 * Vertex pars. Injected after `#include <common>` so declarations and functions land at
 * file scope. Two placement modes:
 *
 *   KAG_MODE 0 (upright)  — geometry is canonical unit space, t = position.y.
 *   KAG_MODE 1 (attached) — geometry is a card in metres attached at parameter
 *                           aFoliageC.w along a parent stem (bamboo leaf clusters).
 */
function vertexPars(windGLSL) {
  return /* glsl */`
attribute vec4 aFoliageA;   // xyz = world base, w = yaw
attribute vec4 aFoliageB;   // x = height (m), y = width (m), z = stiffness, w = phase
attribute vec4 aFoliageC;   // rgb = tint, w = attach param / variant
attribute vec2 aFlex;       // x = flutter flexibility, y = per-vertex jitter

uniform vec3  uCamPos;
uniform vec4  uChars[ ${MAX_CHARACTERS} ];      // xyz = world pos, w = influence radius
uniform vec4  uDisturbP[ ${MAX_DISTURB} ];      // xyz = world pos, w = radius
uniform vec4  uDisturbA[ ${MAX_DISTURB} ];      // x = strength, y = start time

uniform vec2  uFadeNear;    // x = start of fade-in, y = end of fade-in
uniform vec2  uFadeFar;     // x = start of fade-out, y = fully culled
uniform vec2  uSize;        // per-LOD global (height, width) multiplier
uniform float uBendGain;
uniform float uFlutter;

varying float vKagFade;
varying float vKagT;
varying vec3  vKagTint;
varying vec3  vKagWorld;

vec3 kagPosG;
vec3 kagNrmG;

${glslNoise}
${windGLSL}

vec3 kagRodrigues( vec3 v, vec3 axis, float ang ) {
  float c = cos( ang ), s = sin( ang );
  return v * c + cross( axis, v ) * s + axis * dot( axis, v ) * ( 1.0 - c );
}

/**
 * The money function.
 *
 * Deflection is a *rotation about the base* whose angle grows with the height parameter
 * (theta(t) = theta0 * t^KAG_BEND_EXP). Because every vertex is rotated by its own angle
 * about the same origin, the blade's arc length is preserved — it bends, it does not
 * shear, and shear is what makes cheap grass read as a wobbling decal.
 */
void kagFoliageVertex() {

  vec3  base   = aFoliageA.xyz;
  float yaw    = aFoliageA.w;
  float height = aFoliageB.x * uSize.x;
  float width  = aFoliageB.y * uSize.y;
  float stiff  = max( aFoliageB.z, 0.12 );
  float phase  = aFoliageB.w;

  float dist = distance( base, uCamPos );
  vKagFade = smoothstep( uFadeNear.x, uFadeNear.y, dist ) * ( 1.0 - smoothstep( uFadeFar.x, uFadeFar.y, dist ) );

  // ---- wind ----------------------------------------------------------------
  vec3  wf   = kagWindField( base.xz, uWindTime );
  vec2  flow = wf.xy;
  float gust = wf.z;

  float f1 = sin( uWindTime * ( 2.1 + 2.6 * gust ) + phase * KAG_TAU + dot( base.xz, vec2( 0.31, 0.27 ) ) );
  float f2 = sin( uWindTime * 5.7 + phase * 12.566 + aFlex.y * 9.42 );
  flow += uWindDir * ( ( f1 * 0.17 + f2 * 0.07 ) * ( 0.35 + uWindStrength ) );

  // ---- characters part the grass ------------------------------------------
  vec2  push = vec2( 0.0 );
  float trample = 0.0;
  for ( int i = 0; i < ${MAX_CHARACTERS}; i++ ) {
    vec4 ch = uChars[ i ];
    if ( ch.w > 0.001 ) {
      vec2 d = base.xz - ch.xz;
      float dd = length( d ) + 1e-4;
      float vert = 1.0 - smoothstep( 1.4, 3.4, abs( base.y - ch.y ) );
      float infl = ( 1.0 - smoothstep( ch.w * 0.22, ch.w, dd ) ) * vert;
      push += ( d / dd ) * infl * 2.4;
      trample = max( trample, infl );
    }
  }

  // ---- slashes and impacts -------------------------------------------------
  for ( int i = 0; i < ${MAX_DISTURB}; i++ ) {
    vec4 dp = uDisturbP[ i ];
    if ( dp.w > 0.001 ) {
      vec4 da = uDisturbA[ i ];
      float age = uWindTime - da.y;
      if ( age >= 0.0 && age < 2.4 ) {
        vec2 d = base.xz - dp.xz;
        float dd = length( d ) + 1e-4;
        float ring = 1.0 - smoothstep( 0.0, dp.w, dd );
        float env = exp( -age * 2.8 ) * ( 0.55 + 0.45 * cos( age * 30.0 - dd * 2.4 ) );
        push += ( d / dd ) * ring * env * da.x * 3.6;
      }
    }
  }

  vec2  total = flow + push;
  float mag   = length( total );
  vec2  dirn  = mag > 1e-4 ? total / mag : uWindDir;
  vec3  axis  = vec3( dirn.y, 0.0, -dirn.x );   // = normalize( cross( up, flow ) )
  float a     = mag * uBendGain / stiff;
  float theta = 1.5 * a / ( 1.0 + a );          // saturating: a blade never folds past ~86 deg

  // Trampled blades also lose height, which is what actually reads as "flattened".
  height *= ( 1.0 - 0.45 * trample );

  // ---- placement -----------------------------------------------------------
  float sy = sin( yaw ), cy = cos( yaw );
  mat2 rot = mat2( cy, sy, -sy, cy );

  vec3 nrm = normal;
  nrm.xz = rot * nrm.xz;

#if KAG_MODE == 1
  float t = clamp( aFoliageC.w, 0.0, 1.0 );
  vec3 off = position * width;
  off.xz = rot * off.xz;
  // Leaf clusters flutter about their own attachment point at a higher frequency.
  float lf = sin( uWindTime * ( 6.5 + 3.4 * gust ) + phase * 21.0 + aFlex.y * 15.0 );
  float la = lf * ( 0.24 + 0.55 * mag ) * aFlex.x * uFlutter;
  off = kagRodrigues( off, axis, la );
  nrm = kagRodrigues( nrm, axis, la );
  vec3 local = vec3( 0.0, t * height, 0.0 ) + off;
#else
  float t = clamp( position.y, 0.0, 1.0 );
  vec3 local = vec3( position.x * width, position.y * height, position.z * width );
  local.xz = rot * local.xz;
  // Leaf-tip shiver: small, tangential, scaled by the authored flexibility.
  float lf = sin( uWindTime * ( 5.2 + 2.4 * gust ) + phase * 7.0 + aFlex.y * 19.0 + t * 4.0 );
  local += vec3( dirn.x, 0.0, dirn.y ) * ( lf * 0.045 * aFlex.x * ( 0.3 + mag ) * uFlutter * height );
#endif

  float prof = pow( t, KAG_BEND_EXP );
#ifdef KAG_WHIP
  // A tall culm does not simply arc: the top overshoots and whips back a beat late.
  prof += KAG_WHIP * sin( uWindTime * 3.1 + phase * KAG_TAU - t * 2.2 ) * t * t * t;
#endif

  float ang = theta * prof;
  kagPosG = base + kagRodrigues( local, axis, ang );
  kagNrmG = normalize( kagRodrigues( nrm, axis, ang ) + 1e-6 );

  vKagT = t;
  vKagTint = aFoliageC.rgb;
  vKagWorld = kagPosG;
}
`;
}

/** Fragment pars: screen-door dither, subsurface term, and a little grain. */
const FRAGMENT_PARS = /* glsl */`
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSSSColor;
uniform float uSSSStrength;
uniform float uTipGlow;
uniform float uBaseAO;
uniform float uGrain;

varying float vKagFade;
varying float vKagT;
varying vec3  vKagTint;
varying vec3  vKagWorld;

float kagBayer2( vec2 a ) { a = floor( a ); return fract( a.x * 0.5 + a.y * a.y * 0.75 ); }
#define kagBayer4( a ) ( kagBayer2( 0.5 * ( a ) ) * 0.25 + kagBayer2( a ) )
#define kagBayer8( a ) ( kagBayer4( 0.5 * ( a ) ) * 0.25 + kagBayer2( a ) )
`;

/** Discard early — before any texture fetch — so a faded-out LOD costs almost nothing. */
const FRAGMENT_DITHER = /* glsl */`
if ( vKagFade < kagBayer8( gl_FragCoord.xy ) ) discard;
`;

/**
 * Albedo shaping: per-instance tint, a base-to-tip gradient (roots sit in their own
 * shadow, tips catch the gold), and a world-space grain so nothing is ever flat colour.
 */
const FRAGMENT_TINT = /* glsl */`
{
  float grain = fbm2( vKagWorld.xz * 3.7, 2 ) * 0.5 + 0.5;
  vec3 tint = vKagTint * mix( 1.0 - uBaseAO, 1.0 + uTipGlow, vKagT );
  tint *= mix( 1.0 - uGrain, 1.0 + uGrain, grain );
  diffuseColor.rgb *= tint;
}
`;

/**
 * r180 has no `getShadowMask()` any more, so grab the near cascade's shadow term
 * ourselves. One extra fetch, and it is what stops backlit grass glowing *through*
 * the shrine roof.
 */
const FRAGMENT_SHADOW_CAPTURE = /* glsl */`
float kagLit = 1.0;
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
  kagLit = getShadow(
    directionalShadowMap[ 0 ],
    directionalLightShadows[ 0 ].shadowMapSize,
    directionalLightShadows[ 0 ].shadowIntensity,
    directionalLightShadows[ 0 ].shadowBias,
    directionalLightShadows[ 0 ].shadowRadius,
    vDirectionalShadowCoord[ 0 ]
  );
#endif
`;

/**
 * Translucency. A blade backlit by a low sun has to glow or golden hour reads as cardboard.
 * Wrapped diffuse pulls the terminator around the thin blade; the forward-scatter lobe is
 * what actually sells it, and it is strongest at the thin tips.
 */
const FRAGMENT_SSS = /* glsl */`
{
  vec3 V = normalize( cameraPosition - vKagWorld );
  vec3 N = normalize( normal );
  float forward = pow( clamp( dot( V, -uSunDir ) * 0.5 + 0.5, 0.0, 1.0 ), 4.0 );
  float wrap = clamp( ( dot( N, uSunDir ) + 0.55 ) / 1.55, 0.0, 1.0 );
  float thin = mix( 0.30, 1.0, vKagT );
  float lit = mix( 0.35, 1.0, kagLit );
  vec3 trans = uSSSColor * uSunColor * ( forward * 1.7 + 0.18 ) * thin * uSSSStrength * lit;
  outgoingLight += diffuseColor.rgb * ( trans + uSunColor * wrap * 0.16 * lit );
}
`;

// =============================================================================
// 4. Material + instanced-geometry factories
// =============================================================================

/**
 * Wrap a base geometry for instancing and attach the three per-instance vec4s.
 * `capacity` is the instance count the buffers are sized for; `instanceCount` is what
 * actually gets drawn and is what the tile system moves around.
 */
function makeInstanced(base, capacity) {
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.attributes = base.attributes;
  g.groups = base.groups;
  g.drawRange = base.drawRange;
  g.boundingSphere = base.boundingSphere;
  g.boundingBox = base.boundingBox;

  const a = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const b = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const c = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  a.setUsage(DynamicDrawUsage);
  b.setUsage(DynamicDrawUsage);
  c.setUsage(DynamicDrawUsage);
  g.setAttribute('aFoliageA', a);
  g.setAttribute('aFoliageB', b);
  g.setAttribute('aFoliageC', c);
  g.instanceCount = 0;
  g.userData.capacity = capacity;
  return g;
}

/** Grow an instanced geometry's buffers in place (quality changes, denser tiers). */
function resizeInstanced(g, capacity) {
  if (g.userData.capacity >= capacity) return g;
  for (const key of ['aFoliageA', 'aFoliageB', 'aFoliageC']) {
    const attr = g.getAttribute(key);
    const next = new Float32Array(capacity * 4);
    next.set(attr.array.subarray(0, Math.min(attr.array.length, next.length)));
    attr.array = next;
    attr.count = capacity;
    attr.needsUpdate = true;
  }
  g.userData.capacity = capacity;
  return g;
}

//@@SECTION_5@@
