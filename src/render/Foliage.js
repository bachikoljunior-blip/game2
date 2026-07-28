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
  // Share the underlying BufferAttributes (one GPU buffer for every batch that uses this
  // base mesh) but never the attributes *map*, or setAttribute below would leak sideways.
  g.attributes = Object.assign({}, base.attributes);
  g.drawRange = { start: base.drawRange.start, count: base.drawRange.count };
  g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;

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

// =============================================================================
// 5. Procedural geometry
// =============================================================================

/**
 * A grass blade: a tapered quad strip with a curved spine. The edge normals are splayed
 * outward from the face normal so a blade catches the rim light along its silhouette
 * instead of reading as a black sliver against a bright sky — this single detail is most
 * of the difference between "grass" and "green noise".
 */
function buildBladeGeometry(segments, curve = 0.22) {
  const g = new GeoBuilder();
  const rows = segments + 1;
  let prevL = -1, prevR = -1;
  for (let r = 0; r < rows; r++) {
    const t = r / segments;
    // Width profile: swells just above the ground, then tapers to a point.
    const w = (0.5 * (1.0 - Math.pow(t, 1.55))) * (0.72 + 0.28 * Math.sin(t * Math.PI * 0.9));
    // The spine arcs forward; the arc is baked so even an unbent blade is not a plank.
    const z = curve * t * t;
    const splay = 0.55 * (1.0 - t * 0.5);
    const nl = nrm3([-splay, 0.12 * t, 1]);
    const nr = nrm3([splay, 0.12 * t, 1]);
    const l = g.vert(-w, t, z, nl[0], nl[1], nl[2], 0, t, t, 0);
    const rr = g.vert(w, t, z, nr[0], nr[1], nr[2], 1, t, t, 0);
    if (prevL >= 0) g.quad(prevL, prevR, rr, l);
    prevL = l; prevR = rr;
  }
  return g.toGeometry();
}

/** Crossed quads. Used for grass clump cards, leaf clusters and shrub fronds. */
function buildCrossCard(planes = 2, aspect = 1.0, centred = false, flex = 1.0) {
  const g = new GeoBuilder();
  const y0 = centred ? -0.5 : 0.0;
  const y1 = centred ? 0.5 : 1.0;
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = 0.5 * aspect * ca, rz = 0.5 * aspect * sa;
    const nx = -sa * 0.55, nz = ca * 0.55;
    const n = nrm3([nx, 0.72, nz]);
    const a0 = g.vert(-rx, y0, -rz, n[0], n[1], n[2], 0, 0, flex * 0.15, p * 0.37);
    const b0 = g.vert(rx, y0, rz, n[0], n[1], n[2], 1, 0, flex * 0.15, p * 0.37);
    const b1 = g.vert(rx, y1, rz, n[0], n[1], n[2], 1, 1, flex, p * 0.37);
    const a1 = g.vert(-rx, y1, -rz, n[0], n[1], n[2], 0, 1, flex, p * 0.37);
    g.quad(a0, b0, b1, a1);
  }
  return g.toGeometry();
}

/**
 * A bamboo culm: tapered, nodded, and never quite straight. The node rings are a small
 * radial bulge plus a UV band, which is all it takes for the silhouette to read as bamboo
 * rather than as a green pipe.
 */
function buildCulmGeometry(sides = 5, internodes = 9, curve = 0.035) {
  const g = new GeoBuilder();
  const rows = internodes * 2 + 1;
  let prev = -1;
  const n = [1, 0, 0], b = [0, 0, 1];
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const nodeT = (r % 2) === 0 ? 1 : 0;                 // even rows sit on a node
    const taper = 0.5 * (1.0 - 0.55 * t * t) * (0.62 + 0.38 * (1.0 - t));
    const radius = taper * (1.0 + 0.13 * nodeT);
    // A natural culm leans away from vertical and straightens near the base.
    const c = [curve * t * t * 1.0, t, curve * t * t * 0.35];
    const ring = g.ring(c, n, b, radius, sides, t * internodes, t * 0.35, 0);
    if (prev >= 0) g.linkRings(prev, ring, sides);
    prev = ring;
  }
  return g.toGeometry();
}

/** Ground-hugging card, used for fallen leaves and moss patches. */
function buildGroundCard(count = 3, seed = 11) {
  const g = new GeoBuilder();
  const rnd = makeRandom(seed);
  const up = [0, 1, 0];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const s = 0.24 + rnd() * 0.26;
    const cx = (rnd() - 0.5) * 0.5, cz = (rnd() - 0.5) * 0.5;
    const y = 0.004 + i * 0.004;
    const r = [Math.cos(a) * s, 0, Math.sin(a) * s];
    const u = [-Math.sin(a) * s, 0, Math.cos(a) * s];
    g.card([cx, y, cz], r, u, up, 0, 0, 1, 1, 0.1, rnd());
  }
  return g.toGeometry();
}

/**
 * Susuki (Japanese pampas grass). Arching blades plus a silvery plume — the plume is a
 * separate, very translucent card set, which is exactly what a low sun wants to shine
 * through in the background of a duel.
 */
function buildSusukiGeometry(seed = 5) {
  const g = new GeoBuilder();
  const rnd = makeRandom(seed);
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rnd() * 0.5;
    const lean = 0.18 + rnd() * 0.30;
    const top = 0.42 + rnd() * 0.30;
    const dx = Math.cos(a), dz = Math.sin(a);
    const segs = 4;
    let pl = -1, pr = -1;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Arching: rises then falls away, so the clump reads as a fountain.
      const y = top * Math.sin(t * 1.35);
      const rad = lean * t * t;
      const w = 0.028 * (1.0 - t * 0.85);
      const px = dx * rad, pz = dz * rad;
      const nx = -dz, nz = dx;
      const n = nrm3([dx * 0.35, 0.5, dz * 0.35]);
      const l = g.vert(px - nx * w, y, pz - nz * w, n[0], n[1], n[2], 0, t, t, i * 0.31);
      const r = g.vert(px + nx * w, y, pz + nz * w, n[0], n[1], n[2], 1, t, t, i * 0.31);
      if (pl >= 0) g.quad(pl, pr, r, l);
      pl = l; pr = r;
    }
  }
  // Plumes: three stems, each capped by a crossed card.
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const lean = 0.12 + rnd() * 0.14;
    const h = 0.82 + rnd() * 0.18;
    const cx = Math.cos(a) * lean, cz = Math.sin(a) * lean;
    for (let p = 0; p < 2; p++) {
      const pa = a + p * Math.PI * 0.5;
      const r = [Math.cos(pa) * 0.11, 0, Math.sin(pa) * 0.11];
      const u = [0, 0.17, 0];
      const n = nrm3([Math.sin(pa) * 0.4, 0.9, -Math.cos(pa) * 0.4]);
      g.card([cx, h, cz], r, u, n, 0, 0, 1, 1, 1.0, rnd());
    }
  }
  return g.toGeometry();
}

/** Fern / low shrub: a rosette of fronds, each a single card leaning outward. */
function buildFrondClumpGeometry(fronds = 7, lean = 0.55, rise = 0.62, seed = 3) {
  const g = new GeoBuilder();
  const rnd = makeRandom(seed);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.6;
    const dx = Math.cos(a), dz = Math.sin(a);
    const l = 0.34 + rnd() * 0.20;
    const h = rise * (0.55 + rnd() * 0.6);
    const cx = dx * lean * l, cz = dz * lean * l;
    const cy = h * 0.5;
    const r = [dx * l * 0.55, h * 0.22, dz * l * 0.55];
    const u = [-dx * l * 0.18, h * 0.5, -dz * l * 0.18];
    const n = nrm3([dx * 0.3, 1.0, dz * 0.3]);
    g.card([cx, cy, cz], r, u, n, 0, 0, 1, 1, 1.0, rnd());
  }
  return g.toGeometry();
}

// =============================================================================
// 6. Recursive tree generator
// =============================================================================

/**
 * Species parameters. The numbers that matter for believability are `split` (a real tree
 * branches at 25-50 degrees, not 90), `taper` (the child's radius follows Leonardo's rule,
 * roughly r_parent = sum of r_children) and `phyllotaxis` (successive children are offset
 * by the golden angle around the parent, which is why real canopies never look like forks).
 */
const TREE_SPECIES = {
  sakura: {
    height: 6.4, trunkRadius: 0.185, depth: 4, segs: 5, sides: 6,
    children: [3, 3, 3, 2], split: 0.62, splitJitter: 0.26, lengthRatio: 0.72,
    radiusRatio: 0.66, upBias: 0.10, gravity: -0.055, wobble: 0.14, trunkFrac: 0.30,
    phyllotaxis: 2.39996, leavesPerTip: 5, leafSize: 0.95, leafSpread: 0.60,
    leafFrom: 2, wood: 0x4a3a33, foliage: 0xf3c9d6,
  },
  momiji: {
    height: 4.6, trunkRadius: 0.145, depth: 4, segs: 4, sides: 5,
    children: [3, 3, 2, 2], split: 0.80, splitJitter: 0.30, lengthRatio: 0.70,
    radiusRatio: 0.63, upBias: 0.04, gravity: -0.075, wobble: 0.18, trunkFrac: 0.24,
    phyllotaxis: 2.39996, leavesPerTip: 6, leafSize: 0.80, leafSpread: 0.52,
    leafFrom: 2, wood: 0x4d4038, foliage: 0xb02418,
  },
  cedar: {
    height: 13.5, trunkRadius: 0.32, depth: 2, segs: 7, sides: 6,
    children: [6, 3], split: 1.05, splitJitter: 0.18, lengthRatio: 0.42,
    radiusRatio: 0.34, upBias: 0.02, gravity: -0.12, wobble: 0.07, trunkFrac: 1.0,
    phyllotaxis: 1.2566, leavesPerTip: 4, leafSize: 0.62, leafSpread: 0.34,
    leafFrom: 1, wood: 0x4b3a2c, foliage: 0x2f4a33,
    whorls: true,
  },
};

/**
 * Build one canonical tree. Returns geometries normalised so y in [0,1] is the full tree
 * height — the instance shader then scales uniformly, which is what lets one geometry
 * serve trees from 3 m to 15 m without a second buffer.
 */
function buildTree(spec, seed) {
  const rnd = makeRandom(seed);
  const wood = new GeoBuilder();
  const leaf = new GeoBuilder();
  let maxY = 0.001;
  let crownY = 0, crownW = 0.001, crownN = 0;

  const nA = [0, 0, 0], bA = [0, 0, 0], tmp = [0, 0, 0];

  function frame(d, outN, outB) {
    const axis = Math.abs(d[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
    cross3(d, axis, outN); nrm3(outN);
    cross3(d, outN, outB); nrm3(outB);
  }

  function placeLeaves(p, dir, radius, depth) {
    const count = spec.leavesPerTip;
    const size = spec.leafSize * Math.pow(0.86, depth);
    for (let i = 0; i < count; i++) {
      const a = i * spec.phyllotaxis + rnd() * 0.7;
      const tilt = 0.35 + rnd() * 0.75;
      frame(dir, nA, bA);
      const ox = (nA[0] * Math.cos(a) + bA[0] * Math.sin(a)) * spec.leafSpread * size;
      const oy = (nA[1] * Math.cos(a) + bA[1] * Math.sin(a)) * spec.leafSpread * size;
      const oz = (nA[2] * Math.cos(a) + bA[2] * Math.sin(a)) * spec.leafSpread * size;
      const c = [p[0] + ox + dir[0] * size * 0.2, p[1] + oy + dir[1] * size * 0.2, p[2] + oz + dir[2] * size * 0.2];
      const ca = Math.cos(a), sa = Math.sin(a);
      const r = [ca * size * 0.5, tilt * size * 0.12, sa * size * 0.5];
      const u = [-sa * size * 0.30, size * 0.42, ca * size * 0.30];
      const n = nrm3([ox * 0.5, 0.9, oz * 0.5]);
      leaf.card(c, r, u, n, 0, 0, 1, 1, 1.0, rnd());
      crownY += c[1]; crownN++;
      crownW = Math.max(crownW, Math.hypot(c[0], c[2]));
      if (c[1] > maxY) maxY = c[1];
    }
  }

  function grow(p0, dir, len, radius, depth) {
    const segs = Math.max(2, spec.segs - depth);
    const sides = Math.max(3, spec.sides - depth);
    const cur = [p0[0], p0[1], p0[2]];
    const cd = [dir[0], dir[1], dir[2]];
    let prev = -1;
    const flexBase = depth / (spec.depth + 1);

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = Math.max(radius * (1 - t * 0.62), 0.006);
      frame(cd, nA, bA);
      const ring = wood.ring(cur, nA, bA, r, sides, t * len * 0.7, flexBase * t * 0.6, depth * 0.21);
      if (prev >= 0) wood.linkRings(prev, ring, sides);
      prev = ring;
      if (cur[1] > maxY) maxY = cur[1];
      if (s < segs) {
        const step = len / segs;
        cur[0] += cd[0] * step; cur[1] += cd[1] * step; cur[2] += cd[2] * step;
        cd[0] += (rnd() - 0.5) * spec.wobble + 0;
        cd[1] += spec.gravity * (depth > 0 ? 1 : 0.2) + spec.upBias * (1 - t);
        cd[2] += (rnd() - 0.5) * spec.wobble;
        nrm3(cd);
      }
    }

    if (depth >= spec.leafFrom) placeLeaves(cur, cd, radius, depth);

    if (depth >= spec.depth) return;

    const n = spec.children[Math.min(depth, spec.children.length - 1)];
    // A conifer puts a whorl of laterals around a continuing leader; a broadleaf forks.
    const leader = spec.whorls && depth === 0;
    const childLen = len * spec.lengthRatio;
    const childRad = radius * spec.radiusRatio;

    if (leader) {
      // Laterals spaced up the trunk, shorter toward the top: the classic sugi cone.
      const whorlCount = 7;
      for (let w = 0; w < whorlCount; w++) {
        const ft = 0.22 + 0.76 * (w / (whorlCount - 1));
        const anchor = [
          p0[0] + (cur[0] - p0[0]) * ft,
          p0[1] + (cur[1] - p0[1]) * ft,
          p0[2] + (cur[2] - p0[2]) * ft,
        ];
        const branches = 5;
        for (let i = 0; i < branches; i++) {
          const a = (i / branches) * Math.PI * 2 + w * spec.phyllotaxis;
          const outward = Math.sin(spec.split + (rnd() - 0.5) * spec.splitJitter);
          const rise = Math.cos(spec.split) * 0.5 - ft * 0.25;
          const d = nrm3([Math.cos(a) * outward, rise, Math.sin(a) * outward]);
          grow(anchor, d, childLen * (1.25 - ft) * (0.8 + rnd() * 0.4), childRad * (1.2 - ft * 0.7), depth + 1);
        }
      }
      // ...and the leader itself keeps going.
      grow(cur, cd, childLen * 1.5, childRad * 1.7, depth + 1);
      return;
    }

    for (let i = 0; i < n; i++) {
      const a = i * spec.phyllotaxis + rnd() * 0.4;
      const split = spec.split + (rnd() - 0.5) * spec.splitJitter;
      frame(cd, nA, bA);
      const so = Math.sin(split), co = Math.cos(split);
      tmp[0] = cd[0] * co + (nA[0] * Math.cos(a) + bA[0] * Math.sin(a)) * so;
      tmp[1] = cd[1] * co + (nA[1] * Math.cos(a) + bA[1] * Math.sin(a)) * so;
      tmp[2] = cd[2] * co + (nA[2] * Math.cos(a) + bA[2] * Math.sin(a)) * so;
      nrm3(tmp);
      const jitter = 0.78 + rnd() * 0.44;
      grow(cur, [tmp[0], tmp[1], tmp[2]], childLen * jitter, childRad * jitter, depth + 1);
    }
  }

  const trunkLen = spec.height * spec.trunkFrac;
  grow([0, 0, 0], [0, 1, 0], trunkLen, spec.trunkRadius, 0);

  const inv = 1 / Math.max(maxY, 0.001);
  wood.scaleAll(inv);
  leaf.scaleAll(inv);

  return {
    wood: wood.toGeometry(),
    leaf: leaf.toGeometry(),
    /** Crown centre and radius in canonical units — the Weather system needs these. */
    crown: {
      y: crownN ? (crownY / crownN) * inv : 0.7,
      radius: Math.max(crownW * inv, 0.18),
    },
    /** Real-world default height for this species, before per-instance variation. */
    height: spec.height,
  };
}

// =============================================================================
// 7. Procedural textures
// =============================================================================

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texFromCanvas(canvas, srgb, aniso) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso || 1;
  t.needsUpdate = true;
  return t;
}

/** Speckle a drawn sprite so no leaf is ever a flat fill. */
function speckle(c2d, w, h, amount, seed) {
  const img = c2d.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = makeRandom(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const n = 1 + (rnd() - 0.5) * amount;
    d[i] = clamp(d[i] * n, 0, 255);
    d[i + 1] = clamp(d[i + 1] * n, 0, 255);
    d[i + 2] = clamp(d[i + 2] * n, 0, 255);
  }
  c2d.putImageData(img, 0, 0);
}

/** One lanceolate leaf, drawn from base to tip along +y. */
function drawLeafShape(g, len, wid, colA, colB, veins) {
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, colA);
  grad.addColorStop(1, colB);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, -len * 0.22, wid * 0.85, -len * 0.68, 0, -len);
  g.bezierCurveTo(-wid * 0.85, -len * 0.68, -wid, -len * 0.22, 0, 0);
  g.fill();
  if (veins) {
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = Math.max(1, len * 0.012);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len); g.stroke();
  }
}

/** Grass clump silhouette for the far LOD card. */
function paintGrassClump(size, palette) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(9001);
  const blades = 26;
  for (let i = 0; i < blades; i++) {
    const x = size * (0.08 + rnd() * 0.84);
    const h = size * (0.42 + rnd() * 0.56);
    const w = size * (0.012 + rnd() * 0.016);
    const lean = (rnd() - 0.5) * size * 0.30;
    const col = palette[(rnd() * palette.length) | 0];
    const grad = g.createLinearGradient(x, size, x + lean, size - h);
    grad.addColorStop(0, 'rgba(30,44,24,1)');
    grad.addColorStop(0.35, col);
    grad.addColorStop(1, col);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w, size);
    g.quadraticCurveTo(x + lean * 0.4 - w * 0.5, size - h * 0.55, x + lean, size - h);
    g.quadraticCurveTo(x + lean * 0.4 + w * 0.5, size - h * 0.55, x + w, size);
    g.closePath();
    g.fill();
  }
  speckle(g, size, size, 0.30, 4411);
  return c;
}

/** Bamboo leaf cluster — long, narrow, drooping, radiating from one point. */
function paintBambooLeaves(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(2205);
  g.translate(size * 0.5, size * 0.62);
  for (let i = 0; i < 15; i++) {
    const a = -Math.PI * 0.5 + (rnd() - 0.5) * 2.5;
    const len = size * (0.30 + rnd() * 0.28);
    const wid = size * (0.020 + rnd() * 0.018);
    g.save();
    g.rotate(a);
    const shade = 0.62 + rnd() * 0.38;
    const cA = `rgb(${(46 * shade) | 0},${(84 * shade) | 0},${(40 * shade) | 0})`;
    const cB = `rgb(${(96 * shade) | 0},${(140 * shade) | 0},${(62 * shade) | 0})`;
    drawLeafShape(g, len, wid, cA, cB, true);
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  speckle(g, size, size, 0.26, 771);
  return c;
}

/** Sakura past peak: pale petals, a few gone brown, gaps where the wind already took them. */
function paintBlossom(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(3312);
  const flowers = 13;
  for (let f = 0; f < flowers; f++) {
    const cx = size * (0.15 + rnd() * 0.70);
    const cy = size * (0.15 + rnd() * 0.70);
    const r = size * (0.055 + rnd() * 0.055);
    const spent = rnd() < 0.22;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + rnd() * 0.3;
      const px = cx + Math.cos(a) * r * 0.72;
      const py = cy + Math.sin(a) * r * 0.72;
      const grad = g.createRadialGradient(px, py, 0, px, py, r * 0.8);
      if (spent) {
        grad.addColorStop(0, 'rgba(214,186,170,0.95)');
        grad.addColorStop(1, 'rgba(180,146,132,0.0)');
      } else {
        grad.addColorStop(0, 'rgba(255,246,248,1)');
        grad.addColorStop(0.55, 'rgba(247,205,218,1)');
        grad.addColorStop(1, 'rgba(233,168,190,0.0)');
      }
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, r * 0.62, r * 0.48, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(196,140,72,0.85)';
    g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
  }
  // A few dark twigs so the cluster is not a floating cloud of pink.
  g.strokeStyle = 'rgba(58,44,40,0.8)';
  g.lineWidth = Math.max(1, size * 0.010);
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(size * rnd(), size * rnd());
    g.lineTo(size * rnd(), size * rnd());
    g.stroke();
  }
  speckle(g, size, size, 0.16, 5521);
  return c;
}

/** Momiji: palmate, five-to-seven lobed, crimson through orange. */
function paintMomiji(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(6612);
  for (let f = 0; f < 9; f++) {
    const cx = size * (0.16 + rnd() * 0.68);
    const cy = size * (0.16 + rnd() * 0.68);
    const r = size * (0.10 + rnd() * 0.10);
    const rot = rnd() * Math.PI * 2;
    const heat = rnd();
    const col = `rgb(${(150 + heat * 90) | 0},${(24 + heat * 78) | 0},${(16 + heat * 20) | 0})`;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.fillStyle = col;
    const lobes = 5 + ((rnd() * 3) | 0);
    for (let l = 0; l < lobes; l++) {
      const a = -Math.PI * 0.5 + (l - (lobes - 1) * 0.5) * (Math.PI * 0.30);
      g.save();
      g.rotate(a);
      const ll = r * (l === ((lobes - 1) >> 1) ? 1.0 : 0.78 - Math.abs(l - (lobes - 1) * 0.5) * 0.07);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-r * 0.16, -ll * 0.55);
      g.lineTo(-r * 0.05, -ll * 0.62);
      g.lineTo(0, -ll);
      g.lineTo(r * 0.05, -ll * 0.62);
      g.lineTo(r * 0.16, -ll * 0.55);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }
  speckle(g, size, size, 0.30, 8812);
  return c;
}

/** Cedar needle spray: dark, dense, vertical. */
function paintCedarSpray(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(4404);
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = size * (0.08 + rnd() * 0.84);
    const y = size * (0.06 + rnd() * 0.88);
    const len = size * (0.06 + rnd() * 0.14);
    const a = -Math.PI * 0.5 + (rnd() - 0.5) * 1.9;
    const shade = 0.55 + rnd() * 0.45;
    g.strokeStyle = `rgb(${(38 * shade) | 0},${(76 * shade) | 0},${(48 * shade) | 0})`;
    g.lineWidth = Math.max(1, size * (0.007 + rnd() * 0.008));
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  speckle(g, size, size, 0.28, 1177);
  return c;
}

/** Fern frond: pinnate, one rachis with paired pinnae. */
function paintFern(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(7723);
  g.translate(size * 0.5, size);
  const len = size * 0.94;
  g.strokeStyle = 'rgb(72,96,52)';
  g.lineWidth = Math.max(1, size * 0.012);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(size * 0.06, -len * 0.5, 0, -len); g.stroke();
  const pairs = 13;
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1);
    const y = -len * t;
    const pl = size * 0.34 * (1 - t * 0.85) * (0.8 + rnd() * 0.4);
    for (const s of [-1, 1]) {
      g.save();
      g.translate(0, y);
      g.rotate(s * (Math.PI * 0.5 - 0.45 - t * 0.25));
      const shade = 0.6 + rnd() * 0.4;
      drawLeafShape(g, pl, pl * 0.20,
        `rgb(${(44 * shade) | 0},${(76 * shade) | 0},${(38 * shade) | 0})`,
        `rgb(${(96 * shade) | 0},${(134 * shade) | 0},${(62 * shade) | 0})`, false);
      g.restore();
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  speckle(g, size, size, 0.26, 331);
  return c;
}

/** Silvery susuki plume — deliberately low alpha so a low sun blows through it. */
function paintSusukiPlume(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(1919);
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const t = rnd();
    const x = size * (0.5 + (rnd() - 0.5) * (0.24 + t * 0.5));
    const y = size * (0.92 - t * 0.86);
    const len = size * (0.06 + rnd() * 0.13);
    const a = -Math.PI * 0.5 + (rnd() - 0.5) * 1.5;
    const v = 190 + rnd() * 60;
    g.strokeStyle = `rgba(${v | 0},${(v * 0.93) | 0},${(v * 0.80) | 0},${0.30 + rnd() * 0.42})`;
    g.lineWidth = Math.max(1, size * 0.006);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/** Fallen leaves lying on the ground. */
function paintFallenLeaves(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(2468);
  for (let i = 0; i < 22; i++) {
    const cx = size * rnd(), cy = size * rnd();
    const r = size * (0.05 + rnd() * 0.07);
    const heat = rnd();
    g.save();
    g.translate(cx, cy);
    g.rotate(rnd() * Math.PI * 2);
    g.fillStyle = `rgba(${(126 + heat * 96) | 0},${(58 + heat * 62) | 0},${(28 + heat * 26) | 0},${0.72 + rnd() * 0.28})`;
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  speckle(g, size, size, 0.34, 9182);
  return c;
}

/**
 * Ground detail. At LOW tier there is no grass at all, so the terrain has to carry the
 * read on its own — we hand it a tuft-shaped albedo/normal pair rather than letting it
 * fall back to flat dirt.
 */
function paintGroundDetail(size) {
  const albedo = newCanvas(size, size);
  const ga = albedo.getContext('2d');
  ga.fillStyle = '#3f5230';
  ga.fillRect(0, 0, size, size);
  const rnd = makeRandom(5150);
  const height = new Float32Array(size * size);

  for (let i = 0; i < size * 3.2; i++) {
    const x = rnd() * size, y = rnd() * size;
    const h = size * (0.02 + rnd() * 0.05);
    const lean = (rnd() - 0.5) * size * 0.02;
    const shade = 0.55 + rnd() * 0.6;
    const autumn = rnd() < 0.28;
    const r = autumn ? 132 * shade : 78 * shade;
    const gcol = autumn ? 112 * shade : 107 * shade;
    const b = autumn ? 62 * shade : 60 * shade;
    ga.strokeStyle = `rgb(${r | 0},${gcol | 0},${b | 0})`;
    ga.lineWidth = Math.max(1, size * 0.004);
    ga.beginPath();
    ga.moveTo(x, y);
    ga.lineTo(x + lean, y - h);
    ga.stroke();
    // Accumulate a height field for the normal map from the same strokes.
    const steps = Math.max(2, h | 0);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = (x + lean * t) | 0, py = (y - h * t) | 0;
      const idx = ((py % size) + size) % size * size + (((px % size) + size) % size);
      height[idx] = Math.max(height[idx], 1 - t * 0.6);
    }
  }
  speckle(ga, size, size, 0.22, 6161);

  const normal = newCanvas(size, size);
  const gn = normal.getContext('2d');
  const img = gn.createImageData(size, size);
  const d = img.data;
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const dn = height[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      d[i * 4] = (nx * 0.5 + 0.5) * 255;
      d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      d[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      d[i * 4 + 3] = 255;
    }
  }
  gn.putImageData(img, 0, 0);
  return { albedo, normal };
}

// =============================================================================
// 8. LOD and density tables
// =============================================================================

/**
 * Grass LOD bands, as a fraction of `quality.grassRadius`. A tile is assigned a LOD from
 * its ring distance in the camera-relative grid, so LOD is a property of the *tile*, and
 * the instance buffers only care when a tile actually crosses a band.
 */
const GRASS_LOD_BAND = [0.34, 0.66, 1.0];
/** Blades (or clump cards) per square metre at `grassDensity` 1.0. */
const GRASS_LOD_DENSITY = [18.0, 7.0, 0.85];
/** Per-LOD (height, width) multiplier — coarser LODs grow to keep the same visual mass. */
const GRASS_LOD_SIZE = [[1.0, 1.0], [1.15, 1.6], [2.0, 24.0]];
/** Batches per LOD, per tier: more batches = finer frustum culling, more draw calls. */
const GRASS_BATCHES = {
  0: [0, 0, 0],
  1: [4, 2, 1],
  2: [4, 4, 2],
  3: [4, 4, 2],
};

/** Everything else keys its cull radius off these, scaled by grassRadius where it makes sense. */
const RANGE = {
  bambooCulm: [0, 46],
  bambooLeaf: [0, 38],
  bambooCard: [30, 190],
  canopy: [110, 900],
  treeMesh: [0, 55],
  treeReduced: [42, 96],
  treeCard: [88, 340],
  treeCardOnly: [38, 260],     // MEDIUM and below: mesh LOD straight to impostor
  undergrowth: [0, 30],
  groundCard: [0, 26],
};

const AUTUMN_A = new Color(0x4e6b3c);
const AUTUMN_B = new Color(0x9c8548);
const AUTUMN_C = new Color(0xc07a3a);

// =============================================================================
// 9. FoliageSystem
// =============================================================================

export class FoliageSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.onProgress = null;

    this.group = new Group();
    this.group.name = 'foliage';
    this.group.matrixAutoUpdate = false;

    /** Sakura crown positions, consumed by Weather to emit falling petals. */
    this.petalEmitters = [];
    /** Momiji crowns — the same contract, different colour. */
    this.leafEmitters = [];

    /**
     * The authoritative wind field GLSL. If Weather already published one we defer to it
     * so there is exactly one field in the build; otherwise ours is the source of truth.
     */
    this.WIND_GLSL = ctx?.weather?.WIND_GLSL || FOLIAGE_WIND_GLSL;

    // --- shared uniform objects (written once per frame, read by every material) ------
    this.uniforms = {
      uWindDir: { value: new Vector2(0.82, 0.57) },
      uWindStrength: { value: 0.45 },
      uWindGust: { value: 0.0 },
      uWindTime: { value: 0.0 },
      uCamPos: { value: new Vector3() },
      uChars: { value: new Float32Array(MAX_CHARACTERS * 4) },
      uDisturbP: { value: new Float32Array(MAX_DISTURB * 4) },
      uDisturbA: { value: new Float32Array(MAX_DISTURB * 4) },
      uSunDir: { value: new Vector3(0.3, 0.35, -0.88) },
      uSunColor: { value: new Color(1, 0.86, 0.68) },
    };

    this._materials = [];
    this._geometries = [];
    this._textures = [];
    this._meshes = [];
    this._renderTargets = [];

    this._elapsed = 0;
    this._disturbCursor = 0;
    this._characters = [];
    this._extraCharacters = [];

    this._grass = null;
    this._bamboo = null;
    this._trees = null;
    this._undergrowth = null;
    this._impostors = null;
    this.groundDetail = null;

    this._yBias = 0;
    this._drawEstimate = 0;

    this._onSlash = (p) => {
      if (!p || !p.to) return;
      this.disturb(p.to, p.heavy ? 2.6 : 1.7, p.heavy ? 1.35 : 0.85);
    };
    this._onHit = (p) => {
      if (!p || !p.point) return;
      this.disturb(p.point, 1.5, 0.7);
    };
  }

  // ---------------------------------------------------------------- lifecycle

  async init() {
    const q = this.ctx.quality;
    const steps = 11;
    let done = 0;
    const step = async (label, fn) => {
      this.onProgress?.(done, steps, label);
      await fn();
      done++;
      this.onProgress?.(done, steps, label);
      await new Promise((r) => setTimeout(r, 0));
    };

    this._calibrateTerrain();

    await step('sowing textures', () => this._buildTextures(q));
    await step('shaping blades', () => this._buildGrassAssets(q));
    await step('laying the grass ring', () => this._buildGrassBuckets(q));
    await step('growing bamboo', () => this._buildBambooAssets(q));
    await step('planting the bamboo sea', () => this._scatterBamboo(q));
    await step('branching the sakura', () => this._buildTreeAssets(q));
    await step('baking impostors', () => this._bakeImpostors(q));
    await step('planting the grove', () => this._scatterTrees(q));
    await step('seeding undergrowth', () => this._buildUndergrowth(q));
    await step('scattering leaves', () => this._buildGroundCards(q));
    await step('hanging the canopy', () => this._buildCanopy(q));

    this.ctx.scene.add(this.group);
    this.ctx.bus?.on?.('slash', this._onSlash);
    this.ctx.bus?.on?.('hit', this._onHit);

    // Terrain owns the ground material; offer it our detail maps rather than reaching in.
    this.ctx.terrain?.setGroundDetail?.(this.groundDetail);

    this._recomputeDrawEstimate();
    return this;
  }

  /**
   * Terrain may not have published real heights yet (or may be a stub returning 0). All
   * world Y is absolute metres above sea level, so a terrain that answers ~0 at the origin
   * is not answering at all — bias to the plateau so nothing spawns at sea level.
   */
  _calibrateTerrain() {
    const h = this.ctx.terrain?.heightAt?.(0, 0);
    this._yBias = (typeof h === 'number' && Math.abs(h) > 1) ? 0 : WORLD.PLATEAU_HEIGHT;
  }

  _heightAt(x, z) {
    const h = this.ctx.terrain?.heightAt?.(x, z);
    return (typeof h === 'number' && Number.isFinite(h) ? h : 0) + this._yBias;
  }

  _slopeAt(x, z) {
    const s = this.ctx.terrain?.slopeAt?.(x, z);
    if (typeof s === 'number' && Number.isFinite(s)) return s;
    const n = this.ctx.terrain?.normalAt?.(x, z);
    if (n && typeof n.y === 'number') return clamp(1 - n.y, 0, 1);
    return 0;
  }

  _surfaceAt(x, z) {
    const s = this.ctx.terrain?.surfaceAt?.(x, z);
    return typeof s === 'string' ? s : 'soil';
  }

  /**
   * How much vegetation belongs at this spot, 0..1. Stone, gravel, water and the shrine's
   * swept courtyard get none; soil gets all of it; slope thins it out.
   */
  _siteWeight(x, z, y) {
    const surf = this._surfaceAt(x, z);
    let w;
    switch (surf) {
      case 'rock': case 'stone': case 'gravel': case 'water': case 'wood': case 'path':
        w = 0; break;
      case 'sand': w = 0.12; break;
      case 'dirt': w = 0.7; break;
      case 'soil': case 'grass': case 'moss': w = 1.0; break;
      default: w = 0.65;
    }
    if (w <= 0) return 0;
    if (y < WORLD.WATER_LEVEL + 0.35) return 0;
    w *= 1 - smoothstep(0.34, 0.78, this._slopeAt(x, z));
    // The plateau immediately around the honden is swept gravel, not meadow.
    w *= lerp(1, 0.18, plateauMask(x, z));
    return clamp(w, 0, 1);
  }

  // ------------------------------------------------------------------ textures

  _buildTextures(q) {
    const px = Math.min(512, Math.max(128, (q.textureSize || 512) >> 1));
    const aniso = q.anisotropy || 1;
    const T = (canvas, srgb = true) => {
      const t = texFromCanvas(canvas, srgb, aniso);
      this._textures.push(t);
      return t;
    };

    const palette = ['#4e6b3c', '#5d7a41', '#77883f', '#9c8548', '#c07a3a'];
    this.tex = {
      clump: T(paintGrassClump(px, palette)),
      bambooLeaf: T(paintBambooLeaves(px)),
      blossom: T(paintBlossom(px)),
      momiji: T(paintMomiji(px)),
      cedar: T(paintCedarSpray(px)),
      fern: T(paintFern(px)),
      susuki: T(paintSusukiPlume(px)),
      fallen: T(paintFallenLeaves(px)),
    };

    const gd = paintGroundDetail(Math.min(512, px * 2));
    const gdAlbedo = texFromCanvas(gd.albedo, true, aniso);
    const gdNormal = texFromCanvas(gd.normal, false, aniso);
    gdAlbedo.wrapS = gdAlbedo.wrapT = RepeatWrapping;
    gdNormal.wrapS = gdNormal.wrapT = RepeatWrapping;
    this._textures.push(gdAlbedo, gdNormal);
    /** Published for Terrain: at LOW tier this is the only thing selling ground cover. */
    this.groundDetail = { map: gdAlbedo, normalMap: gdNormal, repeat: 2.5, strength: 0.85 };
  }

  // ----------------------------------------------------------------- materials

  /**
   * Every foliage material is a MeshLambertMaterial with our vertex/fragment injection.
   * Lambert because it is per-fragment, takes shadows and an env map, and costs a third of
   * Standard on a phone — the look here comes from the translucency term, not from a BRDF.
   */
  _makeMaterial(opts) {
    const {
      name, mode = 0, map = null, color = 0xffffff, alphaTest = 0.42,
      bendExp = 2.0, whip = 0, bendGain = 1.0, flutter = 1.0,
      fadeNear = [-2, -1], fadeFar = [30, 34], size = [1, 1],
      sss = 1.0, sssColor = 0xb8d07a, tipGlow = 0.16, baseAO = 0.34, grain = 0.16,
      side = DoubleSide, depthWrite = true,
    } = opts;

    const mat = new MeshLambertMaterial({
      name: `foliage/${name}`,
      color,
      map,
      side,
      alphaTest: map ? alphaTest : 0,
      transparent: false,
      depthWrite,
      // Foliage is cutout, never blended: no sort order to get wrong, and it casts a
      // correct alpha-tested shadow for free.
      forceSinglePass: true,
    });

    const local = {
      uFadeNear: { value: new Vector2(fadeNear[0], fadeNear[1]) },
      uFadeFar: { value: new Vector2(fadeFar[0], fadeFar[1]) },
      uSize: { value: new Vector2(size[0], size[1]) },
      uBendGain: { value: bendGain },
      uFlutter: { value: flutter },
      uSSSColor: { value: new Color(sssColor) },
      uSSSStrength: { value: sss },
      uTipGlow: { value: tipGlow },
      uBaseAO: { value: baseAO },
      uGrain: { value: grain },
    };
    mat.userData.kag = local;

    const shared = this.uniforms;
    const windGLSL = this.WIND_GLSL;
    const pars = vertexPars(windGLSL);
    const defines = `#define KAG_MODE ${mode}\n#define KAG_BEND_EXP ${bendExp.toFixed(2)}\n` +
      (whip > 0 ? `#define KAG_WHIP ${whip.toFixed(3)}\n` : '');

    chainBeforeCompile(mat, (shader) => {
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + defines + pars)
        .replace('#include <beginnormal_vertex>', 'kagFoliageVertex();\nvec3 objectNormal = kagNrmG;')
        .replace('#include <begin_vertex>', 'vec3 transformed = kagPosG;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + glslNoise + FRAGMENT_PARS)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAGMENT_DITHER)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_TINT)
        .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n' + FRAGMENT_SHADOW_CAPTURE)
        .replace('#include <envmap_fragment>', FRAGMENT_SSS + '\n#include <envmap_fragment>');
    });
    chainCacheKey(mat, `kagfol|${mode}|${bendExp}|${whip}`);

    this.ctx.sky?.applyFog?.(mat);
    this._materials.push(mat);
    return mat;
  }

  /**
   * The matching depth material. Without this, a wind-bent blade would cast the shadow of
   * the blade it *would* have been if it were standing still.
   */
  _makeDepthMaterial(mat, opts) {
    const { mode = 0, bendExp = 2.0, whip = 0, map = null, alphaTest = 0.42 } = opts;
    const depth = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      map,
      alphaTest: map ? alphaTest : 0,
      side: mat.side,
    });

    const shared = this.uniforms;
    const local = mat.userData.kag;
    const pars = vertexPars(this.WIND_GLSL);
    const defines = `#define KAG_MODE ${mode}\n#define KAG_BEND_EXP ${bendExp.toFixed(2)}\n` +
      (whip > 0 ? `#define KAG_WHIP ${whip.toFixed(3)}\n` : '');

    chainBeforeCompile(depth, (shader) => {
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + defines + pars +
          '\nvarying float vKagFadeD;')
        .replace('#include <begin_vertex>', 'kagFoliageVertex();\nvKagFadeD = vKagFade;\nvec3 transformed = kagPosG;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKagFadeD;\n' +
          'float kagBayer2( vec2 a ) { a = floor( a ); return fract( a.x * 0.5 + a.y * a.y * 0.75 ); }\n' +
          '#define kagBayer4( a ) ( kagBayer2( 0.5 * ( a ) ) * 0.25 + kagBayer2( a ) )\n' +
          '#define kagBayer8( a ) ( kagBayer4( 0.5 * ( a ) ) * 0.25 + kagBayer2( a ) )')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ( vKagFadeD < kagBayer8( gl_FragCoord.xy ) ) discard;');
    });
    chainCacheKey(depth, `kagfold|${mode}|${bendExp}|${whip}`);
    this._materials.push(depth);
    return depth;
  }

  /**
   * One drawable batch. Position/scale live entirely in the instance buffers so the mesh
   * itself never moves; its bounding sphere is authored from the batch extent because an
   * InstancedBufferGeometry's own bounds only describe a single blade.
   */
  _makeBatchMesh(baseGeo, material, depthMaterial, capacity, castShadow) {
    const geo = makeInstanced(baseGeo, capacity);
    const mesh = new Mesh(geo, material);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = !!castShadow;
    if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
    mesh.boundingSphere = new Sphere(new Vector3(), 0.0001);
    mesh.userData.foliage = true;
    // Foliage must never answer a gameplay raycast; the capsule controller walks through it.
    mesh.raycast = () => {};
    mesh.visible = false;
    this.group.add(mesh);
    this._meshes.push(mesh);
    this._geometries.push(geo);
    return mesh;
  }

  //@@SECTION_11@@
}

export default FoliageSystem;
