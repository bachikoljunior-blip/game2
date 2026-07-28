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
 *  - LOD/cull transitions dissolve per *instance*, not per pixel. Nothing downstream of
 *    this pass resolves a screen-door dither — no MSAA on the HDR target, no TAA — so a
 *    stipple here goes straight into the frame. Each plant owns a stable threshold and
 *    shrinks as it crosses it instead.
 *
 * Wind is NOT implemented here. `WeatherSystem` owns the gust field (ARCHITECTURE.md §10)
 * and Weather boots before Foliage precisely so we can consume it: we import `WIND_GLSL`
 * and splice `ctx.weather.windUniforms` in by object identity, so one wavefront crosses
 * the valley and bends grass, bamboo, banners and petals on the same beat. There is
 * deliberately no local fallback — if Weather is missing the foliage stands still, which
 * is far better than a second implementation quietly drifting out of phase.
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
  Vector4,
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
// ARCHITECTURE.md §10: Weather owns the wind. This is the only wind implementation in the
// build; `WIND_GLSL` already carries `glslNoise` and the `uWind`/`uGust` uniform block.
import { WIND_GLSL } from '../fx/Weather.js';

// =============================================================================
// 1. Shared helpers
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

// Module-scope scratch. Nothing in update() or the tile generator may allocate.
const _colScratch = new Color();
const _windScratch = new Vector3();

/**
 * ARCHITECTURE §5b — nothing non-finite may cross a system boundary. That rule bites
 * harder here than anywhere else in the build, so this is the reasoning in full.
 *
 * `uChars`, `uDisturbP` and `uDisturbA` are the only Float32Array *array* uniforms in the
 * project. three's `WebGLUniforms.flatten` decides "is this an array of numbers or of
 * objects?" by testing element 0 with `if ( firstElem <= 0 || firstElem > 0 ) return array;`
 * — and **both comparisons are false for NaN**. So a single NaN in element 0 falls through
 * to the object branch and calls `.toArray()` on a number. The renderer throws mid-frame,
 * before the composite runs, and the failure surfaces as `i.toArray is not a function` in
 * whatever system happens to be downstream. One bad character position takes the frame
 * down and freezes every stat anyone is trying to measure.
 *
 * Hence: every gate gating a write into those arrays is written in the *rejecting* form.
 * `x > limit` is false for NaN and therefore **admits** it; `!(x <= limit)` rejects it.
 * Two things that look like defences and are not: `clamp()` passes NaN straight through,
 * and `typeof NaN === 'number'` is true.
 */
const finite = Number.isFinite;
const finiteVec = (p) => !!p && finite(p.x) && finite(p.y) && finite(p.z);

/** Entity contract §3 gives us id and faction; enough to name the culprit in a warning. */
const entityName = (e) => (e && (e.faction || e.name) ? `${e.faction || e.name}#${e.id}` : 'unknown');

/**
 * A non-finite value arriving here is an upstream fault worth surfacing, not something to
 * swallow — but it arrives every frame, so it is reported once per offender and then
 * silently dropped rather than flooding the console for the rest of the session.
 */
const _nanWarned = new Set();
function warnNonFinite(sink, who, p) {
  const key = `${sink}|${who}`;
  if (_nanWarned.has(key)) return;
  _nanWarned.add(key);
  const at = p ? `${p.x}, ${p.y}, ${p.z}` : String(p);
  console.warn(`[foliage] dropped a non-finite position bound for ${sink}, from ${who} (${at}). ` +
    'Left in, this crashes WebGLUniforms.flatten and kills the frame — fix it at the source.');
}
/** Scratch for _plantY's out-parameter. Scatter is a build-time pass, but no allocation is free. */
const _plant = { sag: 0 };

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

  /**
   * Bridge two rings. The winding matters: `ring()` walks its vertices anticlockwise
   * about the tube axis, so the quad has to go up-then-around, not around-then-up, or
   * every culm and every trunk is built inside out and renders as an unlit black shell.
   */
  linkRings(a, b, sides) {
    for (let s = 0; s < sides; s++) this.quad(a + s, b + s, b + s + 1, a + s + 1);
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
// 2. The foliage shader
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
function vertexPars() {
  return /* glsl */`
#define KAG_TAU 6.28318530718

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
uniform vec2  uSink;        // x, y = range over which the clipmap chord sink blends in
uniform vec2  uSize;        // per-LOD global (height, width) multiplier
uniform float uBendGain;
uniform float uFlutter;
#ifdef KAG_ATLAS
uniform vec2  uAtlas;       // x = columns, y = rows of the archetype atlas
#endif

varying float vKagFade;
varying float vKagT;
varying vec3  vKagTint;
varying vec3  vKagWorld;

vec3 kagPosG;
vec3 kagNrmG;

// The shared field: brings in glslNoise, the uWind/uGust block, kagerouGust/Wind/Bend.
${WIND_GLSL}

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
#ifdef KAG_ATLAS
  // One base mesh, several silhouettes: the archetype index rides in the *integer* part
  // of the phase slot, which is otherwise pure fraction. Doing it this way costs no extra
  // attribute and leaves every non-atlas material's phase byte-identical to before.
  float phase  = fract( aFoliageB.w );
  float kagCell = floor( aFoliageB.w );
#else
  float phase  = aFoliageB.w;
#endif

#if defined( KAG_ATLAS ) && defined( USE_MAP )
  // Remap into the archetype's cell. Unconditional, so the varying is written on the
  // degenerate path too — an undefined varying is a driver-dependent NaN source (§5b).
  vec2 kagCellIJ = vec2( mod( kagCell, uAtlas.x ), floor( kagCell / uAtlas.x ) );
  vMapUv = ( clamp( uv, 0.0, 1.0 ) + kagCellIJ ) / uAtlas;
#endif

  float dist = distance( base, uCamPos );

#ifdef KAG_SINK
  // The ground is a camera-centred clipmap: past the near ring its triangles are chords
  // several metres wide, and a chord drawn across a convex crest runs *below* the
  // heightfield the scatter sampled. That gap is what left a whole band of susuki hanging
  // over the far ridge with open sky under it. aFoliageC.w carries the chord deficit
  // measured at build time; blend it in across the range where the clipmap coarsens so a
  // plant sits in the surface actually being drawn, at every distance.
  base.y -= aFoliageC.w * smoothstep( uSink.x, uSink.y, dist );
#endif

  float fade = smoothstep( uFadeNear.x, uFadeNear.y, dist ) * ( 1.0 - smoothstep( uFadeFar.x, uFadeFar.y, dist ) );

  // LOD dissolve, per *plant*, not per pixel. A screen-door dither has to be resolved by
  // MSAA or TAA and this is a forward pass with neither, so the stipple survived all the
  // way into the frame — a clump sitting at fade 0.5 rendered as a checkerboard block.
  // Each instance instead owns a stable threshold drawn from its own phase, so the band
  // thins out plant by plant and leaves no screen-space pattern behind at all.
  float thr = fract( phase * 31.7 + 0.137 );
  float grow = smoothstep( thr * 0.72, thr * 0.72 + 0.28, fade );
  vKagFade = grow > 0.0 ? 1.0 : 0.0;

  // Collapse an out-of-range instance to a single point: a degenerate triangle is never
  // rasterised at all, which is what lets one buffer hold every plant in the valley and
  // still cost only the ones in range.
  if ( grow <= 0.0 ) {
    kagPosG = base;
    kagNrmG = vec3( 0.0, 1.0, 0.0 );
    vKagT = 0.0;
    vKagTint = aFoliageC.rgb;
    vKagWorld = base;
    return;
  }

  // Shrink on the way out so nothing pops in at full size. The floor keeps the band
  // reading as a thinning of *count*, which is what a real meadow does at range, rather
  // than as everything quietly getting smaller.
  float shrink = mix( 0.62, 1.0, grow );
  height *= shrink;
  width *= shrink;

  // ---- wind ----------------------------------------------------------------
  // The gust field is Weather's, sampled at the plant's root. kagerouBend with h = 1
  // gives the tip deflection for this stiffness; the falloff along the stem is ours
  // (see KAG_BEND_EXP below), because rotating about the base is what makes it bend
  // rather than shear.
  float gust = kagerouGust( base.xz );
  vec3  bendV = kagerouBend( base, 1.0, stiff );
  vec2  flow = bendV.xz;
  vec2  wdir = normalize( uWind.xy + vec2( 1e-5, 0.0 ) );
  float wtime = uWind.w;

  // Per-blade turbulence and phase offset on top of the shared front, so neighbours
  // never march in step even inside one gust.
  float f1 = sin( wtime * ( 2.1 + 2.6 * gust ) + phase * KAG_TAU + dot( base.xz, vec2( 0.31, 0.27 ) ) );
  float f2 = sin( wtime * 5.7 + phase * 12.566 + aFlex.y * 9.42 );
  flow += wdir * ( ( f1 * 0.17 + f2 * 0.07 ) * ( 0.35 + uWind.z ) * 0.28 );

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
      float age = wtime - da.y;
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
  vec2  dirn  = mag > 1e-4 ? total / mag : wdir;
  vec3  axis  = vec3( dirn.y, 0.0, -dirn.x );   // = normalize( cross( up, flow ) )
  // kagerouBend already divided by stiffness, so do not do it twice here.
  float a     = mag * uBendGain;
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
  float lf = sin( wtime * ( 6.5 + 3.4 * gust ) + phase * 21.0 + aFlex.y * 15.0 );
  float la = lf * ( 0.24 + 0.55 * mag ) * aFlex.x * uFlutter;
  off = kagRodrigues( off, axis, la );
  nrm = kagRodrigues( nrm, axis, la );
  vec3 local = vec3( 0.0, t * height, 0.0 ) + off;
#else
  float t = clamp( position.y, 0.0, 1.0 );
  vec3 local = vec3( position.x * width, position.y * height, position.z * width );
  local.xz = rot * local.xz;
  // Leaf-tip shiver: small, tangential, scaled by the authored flexibility.
  float lf = sin( wtime * ( 5.2 + 2.4 * gust ) + phase * 7.0 + aFlex.y * 19.0 + t * 4.0 );
  local += vec3( dirn.x, 0.0, dirn.y ) * ( lf * 0.045 * aFlex.x * ( 0.3 + mag ) * uFlutter * height );
#endif

  float prof = pow( t, KAG_BEND_EXP );
#ifdef KAG_WHIP
  // A tall culm does not simply arc: the top overshoots and whips back a beat late.
  prof += KAG_WHIP * sin( wtime * 3.1 + phase * KAG_TAU - t * 2.2 ) * t * t * t;
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
uniform float uSSSFloor;
uniform float uSSSSat;
uniform float uTipGlow;
uniform float uBaseAO;
uniform float uGrain;
uniform float uBroad;
uniform float uTintAmount;

varying float vKagFade;
varying float vKagT;
varying vec3  vKagTint;
varying vec3  vKagWorld;
`;

/**
 * Discard early — before any texture fetch — so a culled LOD costs almost nothing.
 * The vertex stage already collapsed these to a point; this is the belt to that braces.
 */
const FRAGMENT_DITHER = /* glsl */`
if ( vKagFade <= 0.0 ) discard;
`;

/**
 * Albedo shaping: per-instance tint, a base-to-tip gradient (roots sit in their own
 * shadow, tips catch the gold), and a world-space grain so nothing is ever flat colour.
 */
const FRAGMENT_TINT = /* glsl */`
{
  float grain = fbm2( vKagWorld.xz * 3.7, 2 ) * 0.5 + 0.5;
  // A second, far coarser octave. The fine grain is sub-pixel past ~30 m and averages
  // straight back to a flat tone, which is exactly how the distant LOD collapses into one
  // dark mass with no internal value. This one has ~4 m features, so it survives the trip.
  float broad = fbm2( vKagWorld.xz * 0.26 + 17.3, 2 ) * 0.5 + 0.5;
  vec3 tint = vKagTint;
#ifdef KAG_TINT_MODULATE
  // When the material has a map, the map IS the albedo. Multiplying a second albedo on
  // top of it is how every leaf card in the frame ends up near black: two 0.1-ish linear
  // values multiply to 0.01. Normalise the tint to unit luminance so it shifts hue and
  // saturation per instance without ever removing energy.
  float lum = max( dot( tint, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 );
  tint = mix( vec3( 1.0 ), tint / lum, uTintAmount );
#endif
  tint *= mix( 1.0 - uBaseAO, 1.0 + uTipGlow, vKagT );
  tint *= mix( 1.0 - uGrain, 1.0 + uGrain, grain );
  tint *= mix( 1.0 - uBroad, 1.0 + uBroad, broad );
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

  // Transmission is a *tint on the light*, not a second saturated colour multiplied into
  // it. Desaturating uSSSColor toward white before it meets the (strongly amber) magic-hour
  // sun is what stops pale blossom from coming out of the tone mapper as a hot primary red.
  //
  // uSSSSat is that desaturation, per material, and it is the only knob in the file that
  // can put green into the frame. The magic-hour sun is (1.0, 0.41, 0.13): at the 0.6
  // default every transmission product comes out red-dominant no matter how green the
  // leaf is, which is precisely why a bamboo sea backlit by it measured as a duotone.
  // Chlorophyll really does filter that hard, so bamboo runs near 1.0 and keeps its
  // yellow-green; grass and blossom stay at 0.6 and are unchanged.
  vec3 sssTint = mix( vec3( 1.0 ), uSSSColor, uSSSSat );
  vec3 trans = sssTint * uSunColor * ( forward * 0.85 + 0.10 ) * thin * uSSSStrength * lit;

  // What comes *through* a leaf is not its reflectance. Gating transmission on the albedo
  // is what turned the backlit grass sea into black paper: a 0.08 linear blade transmitted
  // 0.08 x 0.08 and landed on nothing. uSSSFloor lifts the transmission colour off the
  // albedo toward the authored translucency tint — it is 0 for blossom and canopy leaves,
  // which are already bright and are tuned exactly as they are, and high for grass, susuki
  // and ferns, whose whole reason to exist in this shot is that the low sun comes through.
  vec3 through = mix( diffuseColor.rgb, uSSSColor * 0.85, uSSSFloor );
  outgoingLight += through * trans + diffuseColor.rgb * uSunColor * wrap * 0.14 * lit;
}
`;

// =============================================================================
// 3. Material + instanced-geometry factories
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

// =============================================================================
// 4. Procedural geometry
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
      const l = g.vert(px - nx * w, y, pz - nz * w, n[0], n[1], n[2], SUSUKI_UV.bladeU0, t, t, i * 0.31);
      const r = g.vert(px + nx * w, y, pz + nz * w, n[0], n[1], n[2], SUSUKI_UV.bladeU1, t, t, i * 0.31);
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
      g.card([cx, h, cz], r, u, n, SUSUKI_UV.plumeU0, 0, SUSUKI_UV.plumeU1, 1, 1.0, rnd());
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
// 5. Recursive tree generator
// =============================================================================

/**
 * Species parameters. The numbers that matter for believability are `split` (a real tree
 * branches at 25-50 degrees, not 90), `taper` (the child's radius follows Leonardo's rule,
 * roughly r_parent = sum of r_children) and `phyllotaxis` (successive children are offset
 * by the golden angle around the parent, which is why real canopies never look like forks).
 */
const TREE_SPECIES = {
  sakura: {
    height: 6.4, trunkRadius: 0.185, depth: 4, segs: 5, sides: 5,
    children: [3, 3, 3, 2], split: 0.62, splitJitter: 0.26, lengthRatio: 0.72,
    radiusRatio: 0.66, upBias: 0.10, gravity: -0.055, wobble: 0.14, trunkFrac: 0.30,
    // leafFrom 3 + 3 per tip keeps the crown at ~4x overdraw instead of 15x. Past 6x the
    // alpha holes of neighbouring cards fill each other in and the crown fuses solid.
    phyllotaxis: 2.39996, leavesPerTip: 3, leafSize: 1.05, leafSpread: 0.62,
    leafFrom: 3, wood: 0x4a3a33, foliage: 0xf6e2e4,
  },
  momiji: {
    height: 4.6, trunkRadius: 0.145, depth: 4, segs: 4, sides: 5,
    children: [3, 3, 2, 2], split: 0.80, splitJitter: 0.30, lengthRatio: 0.70,
    radiusRatio: 0.63, upBias: 0.04, gravity: -0.075, wobble: 0.18, trunkFrac: 0.24,
    phyllotaxis: 2.39996, leavesPerTip: 3, leafSize: 0.88, leafSpread: 0.54,
    leafFrom: 3, wood: 0x4d4038, foliage: 0xb02418,
  },
  cedar: {
    height: 13.5, trunkRadius: 0.32, depth: 2, segs: 7, sides: 6,
    children: [3, 2], split: 1.05, splitJitter: 0.18, lengthRatio: 0.42,
    radiusRatio: 0.34, upBias: 0.02, gravity: -0.12, wobble: 0.07, trunkFrac: 1.0,
    phyllotaxis: 1.2566, leavesPerTip: 3, leafSize: 0.70, leafSpread: 0.36,
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
      const whorlCount = 4;
      for (let w = 0; w < whorlCount; w++) {
        const ft = 0.22 + 0.76 * (w / (whorlCount - 1));
        const anchor = [
          p0[0] + (cur[0] - p0[0]) * ft,
          p0[1] + (cur[1] - p0[1]) * ft,
          p0[2] + (cur[2] - p0[2]) * ft,
        ];
        const branches = 3;
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
// 6. Procedural textures
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

/**
 * Force a card texture's alpha to zero at its own border.
 *
 * A foliage card must never be able to show its quad. If the painted content runs to the
 * edge of the canvas — which every dense cluster texture does — then the outermost cards
 * in a crown read as hard-edged rectangular slabs, because the rectangle IS the silhouette.
 * Feathering the alpha guarantees the card dissolves before it reaches the geometry.
 *
 * `keepBottom` is for ground-rooted cards (grass clumps, ferns): with flipY the canvas's
 * bottom row is v=0, which is where the plant meets the soil, and fading that would leave
 * the clump hovering.
 */
function feather(canvas, { inner = 0.46, power = 1.35, keepBottom = false } = {}) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ny = ((y + 0.5) / h) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = ((x + 0.5) / w) * 2 - 1;
      // Blend a box distance (kills the straight edges) with a radial one (rounds it off).
      const box = Math.max(Math.abs(nx), keepBottom ? Math.max(ny, 0) : Math.abs(ny));
      const rad = Math.min(1, Math.hypot(nx, keepBottom ? Math.max(ny, 0) : ny));
      const r = box * 0.55 + rad * 0.45;
      const a = Math.pow(1 - smoothstep(inner, 0.99, r), power);
      const i = (y * w + x) * 4 + 3;
      d[i] = d[i] * a;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
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

/**
 * One bamboo leaf, drawn from its attachment at the origin out along +x and *hooking
 * downward*. The droop is the whole point: a straight lanceolate blade radiating from a
 * point reads as a thistle, which is exactly what the mid-ground impostor used to be.
 */
function drawDroopLeaf(g, len, wid, colA, colB, droop) {
  const tx = len, ty = droop * len;
  const grad = g.createLinearGradient(0, 0, tx, ty);
  grad.addColorStop(0, colA);
  grad.addColorStop(0.55, colB);
  grad.addColorStop(1, colB);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  // Upper edge bows away from the chord, lower edge bows toward it: a curved blade, not
  // a symmetric spike. The tip lands below the attachment, which is what "weeping" is.
  g.bezierCurveTo(len * 0.30, ty * 0.10 - wid, len * 0.74, ty * 0.52 - wid * 0.72, tx, ty);
  g.bezierCurveTo(len * 0.70, ty * 0.60 + wid * 0.55, len * 0.28, ty * 0.16 + wid * 0.85, 0, 0);
  g.fill();
}

/**
 * Bamboo silhouette archetypes. §5 names the setting as a shrine above a bamboo sea, and
 * the one shape that says so is a *slender segmented pale culm with leaf sprays that
 * droop*. Four of them, because a mid-ground band drawn from a single stamp reads as a
 * wall at every depth and costs the composition its layering.
 *
 * `hScale` is the instance height multiplier the scatterer applies, so the archetypes also
 * separate in world height rather than only in outline.
 */
const BAMBOO_ARCHETYPES = [
  /** 0 — young grove: tall, near-vertical, sparse sprays only in the top third. */
  { culms: 5, hMin: 0.80, hMax: 0.97, bow: 0.04, leafFrom: 0.68, sprays: 6, sprayLen: 0.095, spread: 0.16, hScale: 1.30 },
  /** 1 — mature stand: the default read; heavy sprays over the top half. */
  { culms: 8, hMin: 0.55, hMax: 0.93, bow: 0.09, leafFrom: 0.52, sprays: 7, sprayLen: 0.110, spread: 0.24, hScale: 1.00 },
  /** 2 — edge clump: culms bowed hard off the slope, long weeping sprays below horizontal. */
  { culms: 4, hMin: 0.56, hMax: 0.88, bow: 0.22, leafFrom: 0.44, sprays: 8, sprayLen: 0.125, spread: 0.28, hScale: 0.84 },
  /** 3 — understorey: short, bushy, sprays right down to the ground. */
  { culms: 7, hMin: 0.30, hMax: 0.58, bow: 0.12, leafFrom: 0.26, sprays: 8, sprayLen: 0.115, spread: 0.28, hScale: 0.56 },
];

/**
 * One archetype cell, painted into a 1:2 (w:h) frame so the card never has to stretch a
 * square texture up a 12 m culm — that stretch is what turned every leaf into a dagger.
 *
 * Culms are deliberately *pale*: backlit bamboo at magic hour sits near luma 200 in
 * albedo, and the mid-ground band was reading as black spikes partly because the impostor
 * had no culm in it at all and partly because everything in it was painted at luma 60.
 */
function paintBambooClump(w, h, spec, seed) {
  const c = newCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const rnd = makeRandom(seed);
  const base = h * 0.995;

  // Back to front, so the near culms overlap the far ones and the clump has depth.
  const culms = [];
  for (let i = 0; i < spec.culms; i++) {
    const depth = i / Math.max(1, spec.culms - 1);
    culms.push({
      x: w * (0.5 + (rnd() - 0.5) * spec.spread * 1.7),
      len: h * (spec.hMin + rnd() * (spec.hMax - spec.hMin)),
      bow: (rnd() - 0.5) * 2 * spec.bow + (spec.bow > 0.25 ? spec.bow * 0.7 : 0),
      wid: w * (0.020 + rnd() * 0.016),
      // Far culms sit back in the haze; near ones catch the light.
      shade: 0.62 + depth * 0.38,
      phase: rnd(),
    });
  }
  culms.sort((a, b) => a.shade - b.shade);

  const spraysAt = [];
  const steps = 22;
  for (const cu of culms) {
    cu.pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // A culm bows as t^1.7 — straight at the root, all of the lean in the top third.
      cu.pts.push([cu.x + Math.pow(t, 1.7) * cu.bow * w, base - t * cu.len, t]);
    }
  }

  const strokeCulm = (cu, alpha) => {
    const pts = cu.pts;
    const k = cu.shade;
    g.globalAlpha = alpha;
    const grad = g.createLinearGradient(0, base, 0, base - cu.len);
    grad.addColorStop(0, `rgb(${(74 * k) | 0},${(88 * k) | 0},${(52 * k) | 0})`);
    grad.addColorStop(0.35, `rgb(${(150 * k) | 0},${(164 * k) | 0},${(104 * k) | 0})`);
    grad.addColorStop(1, `rgb(${(216 * k) | 0},${(222 * k) | 0},${(168 * k) | 0})`);
    g.strokeStyle = grad;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = cu.wid;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let s = 1; s <= steps; s++) g.lineTo(pts[s][0], pts[s][1]);
    g.stroke();

    // Node rings. A small dark tick plus a bright collar just above it is all it takes
    // for the stalk to read as segmented rather than as a green pipe.
    const nodes = 15;
    for (let nI = 1; nI < nodes; nI++) {
      const t = nI / nodes;
      const p = pts[Math.round(t * steps)];
      const nw = cu.wid * (1.0 - t * 0.35);
      g.strokeStyle = `rgba(${(52 * k) | 0},${(62 * k) | 0},${(34 * k) | 0},0.75)`;
      g.lineWidth = Math.max(1, w * 0.006);
      g.beginPath(); g.moveTo(p[0] - nw * 0.62, p[1]); g.lineTo(p[0] + nw * 0.62, p[1]); g.stroke();
      g.strokeStyle = `rgba(${(238 * k) | 0},${(242 * k) | 0},${(198 * k) | 0},0.55)`;
      g.beginPath();
      g.moveTo(p[0] - nw * 0.5, p[1] - w * 0.010);
      g.lineTo(p[0] + nw * 0.5, p[1] - w * 0.010);
      g.stroke();
    }

    // A specular-ish rim down the sunward side; a cylinder needs one to stop reading flat.
    g.strokeStyle = `rgba(${(246 * k) | 0},${(248 * k) | 0},${(212 * k) | 0},0.42)`;
    g.lineWidth = Math.max(1, cu.wid * 0.28);
    g.beginPath();
    g.moveTo(pts[0][0] + cu.wid * 0.3, pts[0][1]);
    for (let s = 1; s <= steps; s++) g.lineTo(pts[s][0] + cu.wid * 0.3, pts[s][1]);
    g.stroke();
    g.globalAlpha = 1;
  };

  for (const cu of culms) {
    strokeCulm(cu, 1);
    const nodes = 15;
    for (let nI = 1; nI < nodes; nI++) {
      const t = nI / nodes;
      if (t < spec.leafFrom) continue;
      const p = cu.pts[Math.round(t * steps)];
      spraysAt.push([p[0], p[1], t, cu.shade, cu.phase]);
    }
  }

  // Leaf sprays over every culm, so the canopy closes across the clump.
  for (const [sx, sy, t, k, phase] of spraysAt) {
    const nSpray = Math.max(1, Math.round(spec.sprays * (0.45 + rnd())));
    for (let sI = 0; sI < nSpray; sI++) {
      // Mostly outward and down: 20 deg below horizontal through to nearly vertical, with
      // one in four cocked slightly above it so the spray is not a fan of parallel lines.
      const side = rnd() < 0.5 ? -1 : 1;
      const a = (0.35 + rnd() * 1.25) * (rnd() < 0.26 ? -0.42 : 1.0);
      // A bamboo leaf is *small* against its own culm — 15 cm on a 10 m stem. Sized any
      // larger the sprays swamp the culms and the clump collapses back into a leaf blob
      // with no stalk in the silhouette, which is the failure this whole card exists to fix.
      const len = h * spec.sprayLen * (0.55 + rnd() * 0.70) * (0.72 + t * 0.50);
      const wid = len * (0.10 + rnd() * 0.05);
      const shade = k * (0.66 + rnd() * 0.44);
      // Kept genuinely green and genuinely light. Under the magic-hour sun the ambient
      // path is the only one that can come out green-dominant, and it can only do that
      // if the albedo it multiplies is not near-black.
      const cA = `rgb(${(56 * shade) | 0},${(92 * shade) | 0},${(44 * shade) | 0})`;
      const cB = rnd() < 0.18
        ? `rgb(${(186 * shade) | 0},${(178 * shade) | 0},${(96 * shade) | 0})`   // an old, yellowed blade
        : `rgb(${(126 * shade) | 0},${(174 * shade) | 0},${(84 * shade) | 0})`;
      g.save();
      g.translate(sx + (rnd() - 0.5) * w * 0.02, sy + (rnd() - 0.5) * h * 0.006);
      // Mirror rather than rotate through pi: rotating would carry the droop *upward* on
      // the left-hand side and the spray would read as a starburst again.
      if (side < 0) g.scale(-1, 1);
      g.rotate(a);
      drawDroopLeaf(g, len, wid, cA, cB, 0.42 + rnd() * 0.5 + phase * 0.1);
      g.restore();
    }
  }

  // The two nearest culms again, in front of the foliage. A stand seen from outside always
  // has stems crossing the leaf mass, and those pale verticals are the entire reason this
  // silhouette says "bamboo" at 120 m rather than "dark shrub".
  for (let i = culms.length - 1; i >= Math.max(0, culms.length - 3); i--) strokeCulm(culms[i], 0.9);

  speckle(g, w, h, 0.24, seed ^ 0x5f5f);
  // Sides only: the base has to reach the card's bottom edge or the clump hovers, and the
  // tops already stop well short of the frame.
  const gi = g.getImageData(0, 0, w, h);
  const d = gi.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = Math.abs(((x + 0.5) / w) * 2 - 1);
      const ny = ((y + 0.5) / h) * 2 - 1;          // -1 canvas top, +1 canvas bottom
      const a = Math.pow(1 - smoothstep(0.58, 1.0, nx), 1.35) *
        Math.pow(1 - smoothstep(0.84, 1.0, -ny), 1.2);
      const i = (y * w + x) * 4 + 3;
      d[i] *= a;
    }
  }
  g.putImageData(gi, 0, 0);
  return c;
}

/** The four archetypes, packed 2x2. `uAtlas` and the per-instance cell do the rest. */
function paintBambooCard(cellW, cellH) {
  const c = newCanvas(cellW * 2, cellH * 2);
  const g = c.getContext('2d');
  g.clearRect(0, 0, cellW * 2, cellH * 2);
  for (let i = 0; i < 4; i++) {
    const cell = paintBambooClump(cellW, cellH, BAMBOO_ARCHETYPES[i], 0xBA0001 + i * 0x9E37);
    // Cell (col,row) in UV space; UV row 0 is the canvas *bottom* row band under flipY.
    const col = i % 2, row = (i / 2) | 0;
    g.drawImage(cell, col * cellW, (1 - row) * cellH);
  }
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

/**
 * One five-petal floret with a real throat. Each petal is a notched teardrop with a bright
 * outer edge and a deeper blush at the base, so a cluster has internal structure at any
 * size instead of being a flat fill with a ragged alpha edge.
 */
function drawFloret(g, r, edge, mid, throat, rnd) {
  const spin = rnd() * Math.PI * 2;
  for (let p = 0; p < 5; p++) {
    const a = spin + (p / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.22;
    const pr = r * (0.86 + rnd() * 0.28);
    g.save();
    g.rotate(a);
    const grad = g.createLinearGradient(0, 0, 0, -pr);
    grad.addColorStop(0, throat);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1, edge);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    // Sakura's notch: the petal tip is cleft, which is the one detail that says sakura
    // rather than plum at any distance you can still resolve a petal.
    g.bezierCurveTo(pr * 0.62, -pr * 0.20, pr * 0.52, -pr * 0.86, pr * 0.16, -pr);
    g.lineTo(0, -pr * 0.82);
    g.lineTo(-pr * 0.16, -pr);
    g.bezierCurveTo(-pr * 0.52, -pr * 0.86, -pr * 0.62, -pr * 0.20, 0, 0);
    g.fill();
    g.restore();
  }
  // Stamens: a warm centre is what stops the floret reading as a paper punch-out.
  g.fillStyle = 'rgba(214,150,120,0.85)';
  g.beginPath(); g.arc(0, 0, r * 0.20, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(232,196,140,0.8)';
  g.lineWidth = Math.max(1, r * 0.07);
  for (let s = 0; s < 6; s++) {
    const a = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46);
    g.stroke();
  }
}

/**
 * Sakura at peak (ARCHITECTURE §5). This card is the sacred tree's whole read, and the
 * previous version aimed at "past peak, bone and blush" and landed on lichen: measured off
 * the hero frame, its bright pixels were (138.5, 122.7, 131.1) — saturation 0.11, R-B of
 * +7.5. That is a grey, and a grey crown on the top-left compositional weight drags the
 * whole frame toward dead winter.
 *
 * So: blush, and enough of it to survive the material's `0xf6e2e4` multiplier, the cool
 * `#4a6b8f` sky bounce that lands on every up-facing petal, and ACES desaturating the
 * highlights. The card is now a *mass* — florets laid down on a radial density profile,
 * dense and overlapping at the centre, thinning to singles at the rim — so the alpha
 * falls off from the inside rather than being cut off from the outside.
 */
function paintBlossom(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(3312);
  const cx = size * 0.5, cy = size * 0.5;

  // Twig armature first, so blossom sits on it rather than floating in front of it.
  g.strokeStyle = 'rgba(78,60,52,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.7;
    g.lineWidth = Math.max(1, size * (0.013 - i * 0.0012));
    g.beginPath();
    g.moveTo(cx, cy + size * 0.06);
    g.quadraticCurveTo(cx + Math.cos(a) * size * 0.18, cy + Math.sin(a) * size * 0.18,
      cx + Math.cos(a) * size * 0.40, cy + Math.sin(a) * size * 0.40);
    g.stroke();
  }

  // A blush underlay that deliberately stays *below* the 0.36 alpha test on its own: it
  // only survives where a floret has already laid alpha over it, so it fills the pinholes
  // between overlapping flowers without ever becoming a pink disc with a hard rim.
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46);
  halo.addColorStop(0, 'rgba(250,182,192,0.30)');
  halo.addColorStop(0.55, 'rgba(240,158,176,0.22)');
  halo.addColorStop(1, 'rgba(224,130,152,0.0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(cx, cy, size * 0.46, 0, Math.PI * 2); g.fill();

  // Florets on a radial density profile: biased inward, so count per unit area falls off
  // smoothly outward and the silhouette dissolves into individual flowers at the rim.
  // That falloff *is* the cluster's internal structure — the previous card had nine
  // scattered blobs and then a feather pass cutting a ragged hole out of the result.
  const florets = 72;
  for (let f = 0; f < florets; f++) {
    const t = Math.pow(rnd(), 0.70);              // 0 at the core, 1 at the rim
    const a = rnd() * Math.PI * 2;
    const rad = t * size * 0.40;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    const r = size * (0.085 - t * 0.032) * (0.78 + rnd() * 0.5);
    // One in six has gone over: bone, not brown. Kept as a minority accent so the mean
    // stays blush instead of being dragged grey the way a third of them did.
    const spent = rnd() < 0.16;
    const k = 0.90 + rnd() * 0.16;
    const edge = spent ? `rgba(${(246 * k) | 0},${(228 * k) | 0},${(220 * k) | 0},0.95)`
      : `rgba(${(255 * k) | 0},${(212 * k) | 0},${(214 * k) | 0},0.98)`;
    const mid = spent ? `rgba(${(238 * k) | 0},${(206 * k) | 0},${(196 * k) | 0},0.94)`
      : `rgba(${(250 * k) | 0},${(172 * k) | 0},${(186 * k) | 0},0.97)`;
    const throat = spent ? `rgba(${(214 * k) | 0},${(176 * k) | 0},${(160 * k) | 0},0.92)`
      : `rgba(${(232 * k) | 0},${(134 * k) | 0},${(154 * k) | 0},0.95)`;
    g.save();
    g.translate(px, py);
    drawFloret(g, r, edge, mid, throat, rnd);
    g.restore();
  }

  speckle(g, size, size, 0.10, 5521);
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

/**
 * Susuki, in two zones of one texture: the left quarter is an OPAQUE blade strip and the
 * right three quarters is the silvery plume. The arching blades sample the strip and the
 * plume cards sample the plume — sampling one texture for both is what turned every clump
 * into a black spiky starburst, because the blades were reading empty plume space.
 */
const SUSUKI_UV = { bladeU0: 0.02, bladeU1: 0.22, plumeU0: 0.30, plumeU1: 0.99 };

function paintSusuki(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(1919);

  // --- blade strip (opaque) --------------------------------------------------
  const bw = Math.round(size * 0.25);
  const grad = g.createLinearGradient(0, size, 0, 0);
  grad.addColorStop(0, '#43552c');
  grad.addColorStop(0.45, '#7d8a45');
  grad.addColorStop(1, '#b39a5c');
  g.fillStyle = grad;
  g.fillRect(0, 0, bw, size);
  // A central rib and some lengthwise streaking so the blade is never a flat fill.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * bw;
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '32,44,22' : '198,182,120'},${0.06 + rnd() * 0.16})`;
    g.lineWidth = Math.max(1, size * 0.004);
    g.beginPath();
    g.moveTo(x, rnd() * size);
    g.lineTo(x + (rnd() - 0.5) * size * 0.01, rnd() * size);
    g.stroke();
  }
  g.strokeStyle = 'rgba(30,40,20,0.35)';
  g.lineWidth = Math.max(1, size * 0.006);
  g.beginPath(); g.moveTo(bw * 0.5, 0); g.lineTo(bw * 0.5, size); g.stroke();

  // --- plume (low alpha, so a low sun blows straight through it) --------------
  const px0 = size * 0.30, pw = size * 0.70;
  g.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const t = rnd();
    const x = px0 + pw * (0.5 + (rnd() - 0.5) * (0.24 + t * 0.62));
    const y = size * (0.94 - t * 0.88);
    const len = size * (0.05 + rnd() * 0.12);
    const a = -Math.PI * 0.5 + (rnd() - 0.5) * 1.5;
    const v = 190 + rnd() * 60;
    g.strokeStyle = `rgba(${v | 0},${(v * 0.93) | 0},${(v * 0.80) | 0},${0.34 + rnd() * 0.44})`;
    g.lineWidth = Math.max(1, size * 0.006);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // A stem so the plume is attached to something.
  g.strokeStyle = 'rgba(150,142,96,0.75)';
  g.lineWidth = Math.max(1, size * 0.008);
  g.beginPath(); g.moveTo(px0 + pw * 0.5, size); g.lineTo(px0 + pw * 0.5, size * 0.35); g.stroke();
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
 * Moss, the other half of the ground-card atlas.
 *
 * This is the cheapest genuine green in the build and the only one the aerial perspective
 * cannot reach: it lies flat inside 26 m, it faces up, and at a 13 deg sun elevation an
 * up-facing surface is lit mostly by the cool sky bounce (§5's `#4a6b8f`) rather than by
 * the amber key — which is the one lighting path whose product with a green albedo comes
 * out green-dominant instead of orange.
 */
function paintMossPatch(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(6402);

  // A few overlapping lobes rather than one disc: moss creeps along a crack.
  for (let i = 0; i < 7; i++) {
    const cx = size * (0.28 + rnd() * 0.44);
    const cy = size * (0.28 + rnd() * 0.44);
    const r = size * (0.16 + rnd() * 0.20);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const k = 0.78 + rnd() * 0.42;
    grad.addColorStop(0, `rgba(${(96 * k) | 0},${(134 * k) | 0},${(62 * k) | 0},0.98)`);
    grad.addColorStop(0.58, `rgba(${(70 * k) | 0},${(102 * k) | 0},${(48 * k) | 0},0.86)`);
    grad.addColorStop(1, `rgba(${(48 * k) | 0},${(72 * k) | 0},${(36 * k) | 0},0.0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Fibre: short bright strands catching the sky, so the patch is never a flat blob.
  g.lineCap = 'round';
  for (let i = 0; i < size * 1.6; i++) {
    const x = size * (0.16 + rnd() * 0.68);
    const y = size * (0.16 + rnd() * 0.68);
    const len = size * (0.010 + rnd() * 0.026);
    const a = rnd() * Math.PI * 2;
    const v = 0.7 + rnd() * 0.6;
    g.strokeStyle = `rgba(${(128 * v) | 0},${(170 * v) | 0},${(78 * v) | 0},${0.18 + rnd() * 0.4})`;
    g.lineWidth = Math.max(1, size * 0.005);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  speckle(g, size, size, 0.30, 4477);
  return c;
}

/** Ground-card atlas: fallen leaves in cell 0, moss in cell 1. Two silhouettes, one draw. */
function paintGroundAtlas(size) {
  const c = newCanvas(size * 2, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size * 2, size);
  g.drawImage(feather(paintFallenLeaves(size), { inner: 0.50, power: 1.2 }), 0, 0);
  g.drawImage(feather(paintMossPatch(size), { inner: 0.54, power: 1.15 }), size, 0);
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
// 7. LOD and density tables
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
/**
 * A fade *window* from a [near, far] range: full strength until 88% of the far distance,
 * gone by the far distance. Passing a raw [near, far] pair as a window is the bug that
 * had every bamboo culm fading from zero metres and thus invisible everywhere.
 */
const fadeOut = (range) => [range[1] * 0.88, range[1]];
const fadeIn = (range) => [range[0], range[0] + Math.max(6, range[0] * 0.25)];

const RANGE = {
  bambooCulm: [0, 46],
  bambooLeaf: [0, 38],
  bambooCard: [30, 190],
  canopy: [110, 900],
  treeMesh: [0, 55],
  treeCard: [88, 340],
  treeCardOnly: [38, 260],     // MEDIUM and below: mesh LOD straight to impostor
  undergrowth: [0, 30],
  groundCard: [0, 26],
};

const AUTUMN_A = new Color(0x4e6b3c);
const AUTUMN_B = new Color(0x9c8548);
const AUTUMN_C = new Color(0xc07a3a);

/**
 * Placement against a clipmapped ground (see `_plantY` and KAG_SINK).
 *
 * `heightAt()` is the authoritative heightfield, but the *mesh* is a camera-centred
 * clipmap: past the near ring, a triangle spans several metres and its surface is the
 * chord, not the field. Across a convex crest the chord runs below the field, so an
 * instance planted at `heightAt()` hangs in the air over the ridge line — the exact
 * failure the susuki band showed. We measure that deficit at scatter time and blend it
 * in over the range where the clipmap actually coarsens.
 */
const SINK_FADE = [38, 96];
/** Fallback chord cell if Terrain has not published its ring sizes; ~ring 2 at ULTRA. */
const SINK_CELL_FALLBACK = 5.6;
/**
 * Ceiling on the measured deficit, purely as a sanity rail. It can be generous because the
 * sink is distance-faded to nothing inside SINK_FADE[0], so a deep sink only ever applies
 * where the ground really is being drawn as a chord that far below the field. At 3.0 the
 * placement audit still reported five clamped instances out of 22 772; at 8.0 it is clean.
 */
const SINK_MAX = 8.0;
/** Bury the base rather than leaving it tangent, so a card never shows daylight under it. */
const PLANT_BURY = 0.14;

// =============================================================================
// 8. FoliageSystem
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
     * PUBLIC — read outside this file. Do not rename without checking consumers.
     *
     * The two blossom cards, published so a prop author does not have to reach into
     * `this.tex` or hand-roll a card of their own. Props.js's sacred tree binds
     * `blossomTexture`, and the dead tree `momijiTexture`; that makes these part of the
     * contract, not an implementation detail.
     *
     * Both are 512² feathered cutout cards: alpha is zero along all four borders, so a
     * card can never show its own quad, and they are authored for `alphaTest` ~0.36 with
     * `transparent: false`. `blossomTexture` is the pale sakura in ARCHITECTURE §5's
     * pink-to-bone band; `momijiTexture` is the crimson maple.
     *
     * Null until `init()` runs. They are assigned eagerly in `_buildTextures()` — the
     * first step of `init()` — and never lazily, because FoliageSystem boots after Level:
     * a consumer polling for them on a later frame has to be able to treat "not null" as
     * "ready to bind", with no chance of observing a half-built texture.
     */
    this.blossomTexture = null;
    this.momijiTexture = null;

    /**
     * Weather's wind uniforms, spliced in BY IDENTITY so its per-frame write reaches every
     * foliage material for free. No local fallback field exists: if Weather is somehow
     * absent these stay zeroed and the foliage simply stands still, which is the correct
     * failure mode — a second gust implementation is what desynchronises a scene.
     */
    this._windUniforms = ctx?.weather?.windUniforms || {
      uWind: { value: new Vector4(0, 0, 0, 0) },
      uGust: { value: new Vector4(0, 0, 0, 0) },
    };

    // --- shared uniform objects (written once per frame, read by every material) ------
    this.uniforms = {
      uCamPos: { value: new Vector3() },
      uChars: { value: new Float32Array(MAX_CHARACTERS * 4) },
      uDisturbP: { value: new Float32Array(MAX_DISTURB * 4) },
      uDisturbA: { value: new Float32Array(MAX_DISTURB * 4) },
      uSunDir: { value: new Vector3(0.3, 0.35, -0.88) },
      uSunColor: { value: new Color(1, 0.86, 0.68) },
      // Where the terrain clipmap stops resolving crests: see _plantY / KAG_SINK.
      uSink: { value: new Vector2(SINK_FADE[0], SINK_FADE[1]) },
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
    const steps = 12;
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
    await step('sowing the meadow', () => this._primeGrass());

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
    // Already fails safe on NaN (Math.abs(NaN) > 1 is false, so we bias to the plateau),
    // but state it rather than rely on it — the whole point of §5b is not having to reason
    // about which side of a comparison NaN happens to land on.
    this._yBias = (finite(h) && Math.abs(h) > 1) ? 0 : WORLD.PLATEAU_HEIGHT;

    // Ring 2 is the clipmap level drawing the ground at the distance where a plant first
    // silhouettes against the sky, so its cell is the span the render chord has to bridge.
    const rings = this.ctx.terrain?.rings;
    const cell = Array.isArray(rings) ? rings[2]?.userData?.cell : undefined;
    this._chordCell = (finite(cell) && cell > 0.5) ? cell : SINK_CELL_FALLBACK;
    this._placement = { planted: 0, sunk: 0, maxSink: 0, floating: 0 };
  }

  _heightAt(x, z) {
    const h = this.ctx.terrain?.heightAt?.(x, z);
    return (finite(h) ? h : 0) + this._yBias;
  }

  /**
   * Where to put the base of an instance, and how far it has to drop once the clipmap
   * stops resolving the crest it stands on.
   *
   * Returns the planted Y (already buried by PLANT_BURY) and writes the far-view sink into
   * `out.sag`, which the scatterers stash in aFoliageC.w for the KAG_SINK vertex path. The
   * deficit is the exact first-order error of a bilinear patch at its own centre: the field
   * height minus the mean of its four cell-corner neighbours, which is positive precisely
   * where the ground is convex and the chord passes underneath.
   */
  _plantY(x, z, out) {
    const h = this._heightAt(x, z);
    const e = this._chordCell;
    const mean = 0.25 * (
      this._heightAt(x - e, z) + this._heightAt(x + e, z) +
      this._heightAt(x, z - e) + this._heightAt(x, z + e));
    const raw = h - mean;
    const sag = clamp(raw, 0, SINK_MAX);

    const p = this._placement;
    if (p) {
      p.planted++;
      if (sag > 0.05) { p.sunk++; if (sag > p.maxSink) p.maxSink = sag; }
      // The placement assert. Every instance ends up at least PLANT_BURY below the surface
      // it was sampled from *and* below the far-view chord — unless the measured deficit
      // was clipped by SINK_MAX, which is the only way one can still be left in the air.
      // getStats() reports the count; a non-zero `floating` means SINK_MAX is too tight.
      if (raw - SINK_MAX > 0.05) p.floating++;
    }

    if (out) out.sag = sag;
    return h - PLANT_BURY;
  }

  _slopeAt(x, z) {
    const s = this.ctx.terrain?.slopeAt?.(x, z);
    if (finite(s)) return s;
    const n = this.ctx.terrain?.normalAt?.(x, z);
    // `typeof n.y === 'number'` was true for NaN and clamp() would have passed it through,
    // so a degenerate normal used to leak a NaN slope into every site-weight downstream.
    if (n && finite(n.y)) return clamp(1 - n.y, 0, 1);
    return 0;
  }

  _surfaceAt(x, z) {
    const s = this.ctx.terrain?.surfaceAt?.(x, z);
    return typeof s === 'string' ? s : 'soil';
  }

  /**
   * How much vegetation belongs at this spot, 0..1. Stone, gravel, water and the shrine's
   * swept courtyard get none; soil gets all of it; slope thins it out.
   *
   * The surface classification is the single source of truth for "is this swept ground".
   * There used to be a second `plateauMask` multiplier here, from when Terrain reported the
   * whole plateau as gravel and this needed its own defence; now that the courtyard is
   * classified honestly it was thinning the entire rim out to r = 78 to 18% — the exact
   * band ARCHITECTURE §5 wants planted — so the belt came off and the braces stayed.
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
    // Rejecting form: `y < level` is false for NaN and would plant into the stream.
    if (!(y >= WORLD.WATER_LEVEL + 0.35)) return 0;
    w *= 1 - smoothstep(0.34, 0.78, this._slopeAt(x, z));
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

    // Every cluster card gets its alpha feathered to zero at the quad border, or the
    // outermost cards in a crown read as hard rectangular slabs. Ground-rooted cards keep
    // their bottom edge so they stay planted, and susuki is excluded entirely because its
    // left-hand blade strip has to stay opaque edge to edge.
    const rooted = { keepBottom: true, inner: 0.52, power: 1.1 };
    this.tex = {
      clump: T(feather(paintGrassClump(px, palette), rooted)),
      bambooLeaf: T(feather(paintBambooLeaves(px))),
      // The mid-ground impostor: four archetypes in 2x2, each painted in a 1:2 frame so a
      // 12 m culm never has to stretch a square texture. Its own feathering is per cell
      // and side-only, so `feather()` must not run over the whole atlas.
      bambooCard: T(paintBambooCard(px >> 1, px)),
      blossom: T(feather(paintBlossom(px), { inner: 0.50, power: 1.05 })),
      momiji: T(feather(paintMomiji(px), { inner: 0.40, power: 1.4 })),
      cedar: T(feather(paintCedarSpray(px), { inner: 0.42, power: 1.3 })),
      fern: T(feather(paintFern(px), rooted)),
      susuki: T(paintSusuki(px)),
      // Two cells: fallen leaves and moss. Each is feathered before it is composited.
      fallen: T(paintGroundAtlas(px)),
    };

    // Publish the two blossom cards (see the constructor). Assigned here, at the end of
    // init()'s first step, so the fields are live for the whole rest of the boot and for
    // any consumer that binds later — never populated on first use.
    this.blossomTexture = this.tex.blossom;
    this.momijiTexture = this.tex.momiji;

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
      sss = 1.0, sssColor = 0xb8d07a, sssFloor = 0, sssSat = 0.6,
      tipGlow = 0.16, baseAO = 0.34,
      grain = 0.16, broad = 0.08, sink = false, atlas = null,
      side = DoubleSide, depthWrite = true, tintAmount = 0.85,
    } = opts;

    // A mapped material's albedo comes from the texture; the instance tint may only
    // modulate it. An unmapped one (a grass blade, a culm) carries its albedo in the tint.
    const tintModulate = !!map;

    if (map === undefined) throw new Error(`foliage material "${name}" has an undefined map`);

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
      uSSSFloor: { value: sssFloor },
      uSSSSat: { value: sssSat },
      uTipGlow: { value: tipGlow },
      uBaseAO: { value: baseAO },
      uGrain: { value: grain },
      uBroad: { value: broad },
      uTintAmount: { value: tintAmount },
    };
    if (atlas) local.uAtlas = { value: new Vector2(atlas[0], atlas[1]) };
    mat.userData.kag = local;

    const shared = this.uniforms;
    const wind = this._windUniforms;
    const pars = vertexPars();
    // KAG_SINK claims aFoliageC.w for the clipmap chord deficit, so it is opt-in: trees and
    // impostors already spend that slot on their atlas row, and bamboo leaves on the attach
    // parameter. Only the scatterers that go through _plantY() set it.
    const defines = `#define KAG_MODE ${mode}\n#define KAG_BEND_EXP ${bendExp.toFixed(2)}\n` +
      (whip > 0 ? `#define KAG_WHIP ${whip.toFixed(3)}\n` : '') +
      (sink ? '#define KAG_SINK\n' : '') +
      (atlas ? '#define KAG_ATLAS\n' : '') +
      (tintModulate ? '#define KAG_TINT_MODULATE\n' : '');

    chainBeforeCompile(mat, (shader) => {
      shader.uniforms.uWind = wind.uWind;   // same object as Weather's — never a copy
      shader.uniforms.uGust = wind.uGust;
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
    chainCacheKey(mat, `kagfol|${mode}|${bendExp}|${whip}|${sink ? 's' : '-'}|${atlas ? 'x' : '-'}|${tintModulate ? 'm' : 'a'}`);

    this.ctx.sky?.applyFog?.(mat);
    this._materials.push(mat);
    return mat;
  }

  /**
   * The matching depth material. Without this, a wind-bent blade would cast the shadow of
   * the blade it *would* have been if it were standing still.
   */
  _makeDepthMaterial(mat, opts) {
    const {
      mode = 0, bendExp = 2.0, whip = 0, map = null, alphaTest = 0.42,
      sink = false, atlas = null,
    } = opts;
    const depth = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      map,
      alphaTest: map ? alphaTest : 0,
      side: mat.side,
    });

    const shared = this.uniforms;
    const wind = this._windUniforms;
    const local = mat.userData.kag;
    const pars = vertexPars();
    const defines = `#define KAG_MODE ${mode}\n#define KAG_BEND_EXP ${bendExp.toFixed(2)}\n` +
      (whip > 0 ? `#define KAG_WHIP ${whip.toFixed(3)}\n` : '') +
      (sink ? '#define KAG_SINK\n' : '') +
      (atlas ? '#define KAG_ATLAS\n' : '');

    chainBeforeCompile(depth, (shader) => {
      shader.uniforms.uWind = wind.uWind;
      shader.uniforms.uGust = wind.uGust;
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + defines + pars)
        .replace('#include <begin_vertex>', 'kagFoliageVertex();\nvec3 transformed = kagPosG;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKagFade;')
        // The shadow must dissolve on the same per-instance threshold as the lit pass, or a
        // plant the colour pass has culled keeps casting a shadow onto the ground.
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ( vKagFade <= 0.0 ) discard;');
    });
    chainCacheKey(depth, `kagfold|${mode}|${bendExp}|${whip}|${sink ? 's' : '-'}|${atlas ? 'x' : '-'}`);
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

  // --------------------------------------------------------------------- grass

  _buildGrassAssets(q) {
    const segs = q.tier >= 2 ? 6 : 4;
    const bladeHi = buildBladeGeometry(segs, 0.24);
    const bladeLo = buildBladeGeometry(2, 0.16);
    const clump = buildCrossCard(2, 1.0, false, 1.0);
    this._geometries.push(bladeHi, bladeLo, clump);

    // Depth materials are always built but only compiled once a mesh actually casts, so
    // applyQuality can flip foliage shadows on at runtime without a rebuild.
    const mk = (name, lod, map, extra) => {
      const opts = Object.assign({
        name, mode: 0, map, bendExp: 2.0, bendGain: 1.0, flutter: 1.0,
        size: GRASS_LOD_SIZE[lod], sink: true,
        sss: 1.25, sssColor: 0xc2d884, sssFloor: 0.42,
        tipGlow: 0.22, baseAO: 0.38, grain: 0.18, broad: 0.12,
      }, extra || {});
      const mat = this._makeMaterial(opts);
      const depth = this._makeDepthMaterial(mat, opts);
      return { mat, depth, opts };
    };

    this._grassMat = [
      mk('grass-lod0', 0, null, {}),
      mk('grass-lod1', 1, null, { bendGain: 0.92 }),
      // LOD2 is a 24 m-wide clump card seen from 20-60 m: the fine grain is sub-pixel out
      // there, so it leans on the broad octave to keep any value inside the silhouette.
      mk('grass-lod2', 2, this.tex.clump, {
        bendGain: 0.55, flutter: 0.5, alphaTest: 0.34, sss: 1.0, sssFloor: 0.50, broad: 0.22,
      }),
    ];
    this._grassBase = [bladeHi, bladeLo, clump];
  }

  /**
   * Lay out the camera-following ring: a square grid of tiles, each assigned a LOD from its
   * ring distance and a batch from its quadrant. Batches are the frustum-cull unit — one
   * draw call each, with a bounding sphere we author from the tiles they contain.
   */
  _buildGrassBuckets(q) {
    this._disposeGrass();

    const radius = q.grassRadius || 0;
    const density = q.grassDensity || 0;
    if (radius <= 0 || density <= 0) {
      this._grass = { enabled: false, buckets: [], cache: new Map(), queue: [] };
      return;
    }

    const tileSize = clamp(Math.round(radius / 4), 8, 18);
    const gridRadius = Math.max(1, Math.floor(radius / tileSize));
    const batches = GRASS_BATCHES[q.tier] || GRASS_BATCHES[1];
    const shadows = !!q.foliageShadows;

    const perTile = GRASS_LOD_DENSITY.map((d) =>
      Math.max(8, Math.ceil(tileSize * tileSize * d * density)) + 4);

    const buckets = [];
    const bucketIndex = [[], [], []];
    for (let lod = 0; lod < 3; lod++) {
      for (let b = 0; b < batches[lod]; b++) {
        const bucket = {
          lod, batch: b, slots: [], mesh: null, geo: null,
          a: null, bArr: null, c: null, cap: 0, dirty: true,
        };
        bucketIndex[lod][b] = buckets.length;
        buckets.push(bucket);
      }
    }

    const slots = [];
    for (let dj = -gridRadius; dj <= gridRadius; dj++) {
      for (let di = -gridRadius; di <= gridRadius; di++) {
        const ring = Math.max(Math.abs(di), Math.abs(dj));
        const ringDist = ring * tileSize;
        if (ringDist - tileSize * 0.5 > radius) continue;
        let lod = 2;
        if (ringDist <= GRASS_LOD_BAND[0] * radius) lod = 0;
        else if (ringDist <= GRASS_LOD_BAND[1] * radius) lod = 1;
        const n = batches[lod];
        if (!n) continue;
        let batch = 0;
        if (n === 2) batch = dj >= 0 ? 0 : 1;
        else if (n >= 4) batch = (di >= 0 ? 0 : 1) + (dj >= 0 ? 0 : 2);
        const slot = { di, dj, lod, batch, tx: 0, tz: 0, key: '', ready: false };
        slots.push(slot);
        buckets[bucketIndex[lod][batch]].slots.push(slot);
      }
    }

    for (const bucket of buckets) {
      const cap = Math.max(1, bucket.slots.length * perTile[bucket.lod]);
      const m = this._grassMat[bucket.lod];
      const mesh = this._makeBatchMesh(this._grassBase[bucket.lod], m.mat, m.depth, cap, shadows);
      mesh.name = `grass-l${bucket.lod}-b${bucket.batch}`;
      bucket.mesh = mesh;
      bucket.geo = mesh.geometry;
      bucket.cap = cap;
      bucket.a = mesh.geometry.getAttribute('aFoliageA').array;
      bucket.bArr = mesh.geometry.getAttribute('aFoliageB').array;
      bucket.c = mesh.geometry.getAttribute('aFoliageC').array;
    }

    // Fade windows: LODs partition space by tile, so the only real fade is the outer edge.
    const maxH = 2.2;
    this._grassMat[0].mat.userData.kag.uFadeFar.value.set(radius * 1.6, radius * 1.8);
    this._grassMat[1].mat.userData.kag.uFadeFar.value.set(radius * 1.6, radius * 1.8);
    this._grassMat[2].mat.userData.kag.uFadeFar.value.set(radius * 0.86, radius * 1.02);

    this._grass = {
      enabled: true,
      tileSize, gridRadius, radius, perTile, batches, maxH,
      buckets, slots,
      cache: new Map(),
      queue: [],
      centerX: Number.NaN,
      centerZ: Number.NaN,
      emitDirty: false,
      sinceShift: 0,
    };
  }

  /** Deterministic per-tile scatter. Runs on a shift, never per frame. */
  _generateGrassTile(tx, tz, lod) {
    const g = this._grass;
    const q = this.ctx.quality;
    const size = g.tileSize;
    const x0 = tx * size, z0 = tz * size;
    const attempts = g.perTile[lod] - 4;
    const rnd = makeRandom(hashTileSeed(tx, tz, lod));

    const a = new Float32Array(attempts * 4);
    const b = new Float32Array(attempts * 4);
    const c = new Float32Array(attempts * 4);
    let n = 0;

    const col = _colScratch;
    for (let i = 0; i < attempts; i++) {
      const x = x0 + rnd() * size;
      const z = z0 + rnd() * size;

      // Clumping first: it is a pure noise lookup and rejects most candidates before we
      // ever pay for a terrain height/slope/surface query.
      const clump = noise.fbm2(x * 0.09, z * 0.09, 3) * 0.5 + 0.5;
      const accept = 0.18 + 0.95 * Math.pow(clamp(clump, 0, 1), 1.6);
      if (rnd() > accept) continue;

      const w = this._siteWeight(x, z, this._heightAt(x, z));
      if (w <= 0.02 || rnd() > w) continue;
      const y = this._plantY(x, z, _plant);

      // Autumn drift: broad patches turn from moss green through straw to rust.
      const dry = clamp(noise.fbm2(x * 0.021 + 41.3, z * 0.021 - 17.7, 3) * 0.5 + 0.5, 0, 1);
      const burn = clamp(noise.fbm2(x * 0.055 - 7.1, z * 0.055 + 3.9, 2) * 0.5 + 0.5, 0, 1);
      col.copy(AUTUMN_A).lerp(AUTUMN_B, Math.pow(dry, 1.35));
      col.lerp(AUTUMN_C, Math.pow(burn, 2.6) * dry * 0.85);
      // The tint IS the albedo for unmapped blades, so keep it in the 0.10-0.20 linear
      // band real grass actually sits in rather than the near-black it started at.
      const shade = 1.15 + rnd() * 0.55;

      const lush = 0.7 + 0.6 * clump;
      const o = n * 4;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
      b[o] = (0.28 + rnd() * 0.46) * lush;            // height, metres
      b[o + 1] = 0.021 + rnd() * 0.017;               // width, metres
      // Weather's convention: < 1 is limp (a grass blade), > 1 is stiff (a bamboo culm).
      b[o + 2] = 0.42 + rnd() * 0.48;                 // stiffness
      b[o + 3] = rnd();                               // phase
      c[o] = col.r * shade; c[o + 1] = col.g * shade; c[o + 2] = col.b * shade;
      c[o + 3] = _plant.sag;
      n++;
    }

    return { a, b, c, n, stamp: this._elapsed };
  }

  /** Re-pack every bucket from the tile cache. One pass, only after the grid shifts. */
  _emitGrass() {
    const g = this._grass;
    if (!g || !g.enabled) return;

    for (const bucket of g.buckets) {
      let off = 0;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const slot of bucket.slots) {
        const e = g.cache.get(slot.key);
        if (!e || e.n === 0) continue;
        const n = Math.min(e.n, bucket.cap - off);
        if (n <= 0) break;
        bucket.a.set(e.a.subarray(0, n * 4), off * 4);
        bucket.bArr.set(e.b.subarray(0, n * 4), off * 4);
        bucket.c.set(e.c.subarray(0, n * 4), off * 4);
        for (let i = 0; i < n; i++) {
          const o = (off + i) * 4;
          const x = bucket.a[o], y = bucket.a[o + 1], z = bucket.a[o + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        off += n;
      }

      const geo = bucket.geo;
      geo.instanceCount = off;
      bucket.mesh.visible = off > 0;
      if (off > 0) {
        const attrA = geo.getAttribute('aFoliageA');
        const attrB = geo.getAttribute('aFoliageB');
        const attrC = geo.getAttribute('aFoliageC');
        attrA.clearUpdateRanges(); attrB.clearUpdateRanges(); attrC.clearUpdateRanges();
        attrA.addUpdateRange(0, off * 4); attrB.addUpdateRange(0, off * 4); attrC.addUpdateRange(0, off * 4);
        attrA.needsUpdate = true; attrB.needsUpdate = true; attrC.needsUpdate = true;

        const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5, cy = (minY + maxY) * 0.5;
        const r = Math.hypot(maxX - cx, maxZ - cz, (maxY - cy) + g.maxH * 2) + g.maxH;
        bucket.mesh.boundingSphere.center.set(cx, cy + g.maxH, cz);
        bucket.mesh.boundingSphere.radius = r;
      }
    }
    g.emitDirty = false;
  }

  /** Grid recentring + a budgeted generation queue. Called once per frame from update(). */
  _updateGrass(dt) {
    const g = this._grass;
    if (!g || !g.enabled) return;
    const cam = this.ctx.camera;
    if (!cam) return;

    const ts = g.tileSize;
    const cx = Math.floor(cam.position.x / ts);
    const cz = Math.floor(cam.position.z / ts);

    if (cx !== g.centerX || cz !== g.centerZ) {
      g.centerX = cx; g.centerZ = cz;
      g.sinceShift = 0;
      g.queue.length = 0;
      for (const slot of g.slots) {
        slot.tx = cx + slot.di;
        slot.tz = cz + slot.dj;
        slot.key = `${slot.tx},${slot.tz},${slot.lod}`;
        const hit = g.cache.get(slot.key);
        if (hit) { hit.stamp = this._elapsed; slot.ready = true; }
        else { slot.ready = false; g.queue.push(slot); }
      }
      // Nearest tiles first so the ground under the player is never briefly bald.
      g.queue.sort((p, r) => (Math.abs(p.di) + Math.abs(p.dj)) - (Math.abs(r.di) + Math.abs(r.dj)));
      g.emitDirty = true;
    }

    g.sinceShift += dt;

    if (g.queue.length) {
      // Two tiles a frame keeps the spike under ~1 ms; if we are falling behind (fast
      // sprint across the meadow) the budget opens up rather than letting the ring lag.
      const budget = g.sinceShift > 0.3 ? 8 : 4;
      for (let i = 0; i < budget && g.queue.length; i++) {
        const slot = g.queue.shift();
        const entry = this._generateGrassTile(slot.tx, slot.tz, slot.lod);
        g.cache.set(slot.key, entry);
        slot.ready = true;
      }
      if (g.cache.size > 512) this._trimGrassCache(384);
    }

    // Emit once the queue drains, or force it if we have been waiting too long.
    if (g.emitDirty && (g.queue.length === 0 || g.sinceShift > 0.25)) this._emitGrass();
  }

  /**
   * Fill the whole ring once at boot. Without this the first second of gameplay — and
   * every screenshot the capture rig takes — is a bald field, because the runtime queue
   * deliberately dribbles tiles in a few per frame.
   */
  _primeGrass() {
    const g = this._grass;
    if (!g || !g.enabled) return;
    this._updateGrass(0);
    let guard = g.slots.length + 8;
    while (g.queue.length && guard-- > 0) {
      const slot = g.queue.shift();
      g.cache.set(slot.key, this._generateGrassTile(slot.tx, slot.tz, slot.lod));
      slot.ready = true;
    }
    this._emitGrass();

    // A silent empty meadow is indistinguishable from a broken one, and the usual cause is
    // outside this file: every sampled tile came back as stone/gravel/path from
    // ctx.terrain.surfaceAt, which we correctly refuse to plant. Say so rather than
    // shipping a bald field and letting someone hunt for it in the shader.
    let total = 0;
    for (const bucket of g.buckets) total += bucket.geo.instanceCount || 0;
    if (total === 0) {
      console.warn('[foliage] grass ring primed to 0 instances — every candidate was ' +
        'rejected. Check ctx.terrain.surfaceAt (stone/gravel/rock/path/wood and water all ' +
        'refuse grass) and ctx.terrain.slopeAt.');
    } else if (this.ctx.debug) {
      console.info(`[foliage] grass primed: ${total} instances across ${g.buckets.length} batches`);
    }
  }

  _trimGrassCache(target) {
    const g = this._grass;
    const entries = Array.from(g.cache.entries());
    entries.sort((a, b) => a[1].stamp - b[1].stamp);
    const drop = entries.length - target;
    for (let i = 0; i < drop; i++) g.cache.delete(entries[i][0]);
  }

  _disposeGrass() {
    const g = this._grass;
    if (!g || !g.buckets) return;
    for (const bucket of g.buckets) {
      if (!bucket.mesh) continue;
      this.group.remove(bucket.mesh);
      const i = this._meshes.indexOf(bucket.mesh);
      if (i >= 0) this._meshes.splice(i, 1);
      const j = this._geometries.indexOf(bucket.geo);
      if (j >= 0) this._geometries.splice(j, 1);
      bucket.geo.dispose();
    }
    g.buckets.length = 0;
    g.cache?.clear?.();
  }

  // -------------------------------------------------------------------- bamboo

  _buildBambooAssets(q) {
    const sides = q.tier >= 2 ? 6 : 5;
    const culm = buildCulmGeometry(sides, q.tier >= 2 ? 10 : 8, 0.045);
    const leaf = buildCrossCard(2, 1.0, true, 1.0);
    const card = buildCrossCard(2, 1.0, false, 0.55);
    this._geometries.push(culm, leaf, card);

    // Culms: stiff, and they whip. A bamboo sea reads as bamboo because the tops lag.
    const culmOpts = {
      // No map: the per-instance tint carries the albedo, so the material must be white.
      name: 'bamboo-culm', mode: 0, map: null, color: 0xffffff,
      bendExp: 1.6, whip: 0.28, bendGain: 1.35, flutter: 0.35,
      fadeFar: fadeOut(RANGE.bambooCulm), size: [1, 1], side: DoubleSide,
      sss: 0.55, sssColor: 0xd9dd8e, tipGlow: 0.10, baseAO: 0.28, grain: 0.20,
    };
    const culmMat = this._makeMaterial(culmOpts);
    const culmDepth = this._makeDepthMaterial(culmMat, culmOpts);

    // Leaves hang off the culm and flutter at a much higher frequency.
    const leafOpts = {
      name: 'bamboo-leaf', mode: 1, map: this.tex.bambooLeaf, color: 0xffffff,
      bendExp: 1.6, whip: 0.28, bendGain: 1.35, flutter: 1.6, alphaTest: 0.38,
      fadeFar: fadeOut(RANGE.bambooLeaf), size: [1, 1],
      sss: 1.45, sssColor: 0xcfe07f, tipGlow: 0.18, baseAO: 0.22, grain: 0.16,
    };
    const leafMat = this._makeMaterial(leafOpts);
    const leafDepth = this._makeDepthMaterial(leafMat, leafOpts);

    // Impostor cards for the mid distance. This is the *only* bamboo the critic's four
    // framings can see — every one of them is composed from 45 m or further out, past the
    // culm and leaf fade windows — so the whole silhouette read of "shrine above a bamboo
    // sea" lives or dies on this card and nothing else.
    //
    // It used to sample `bambooLeaf`: a leaf spray with no culm in it at all, painted at
    // luma 60, stretched 4x vertically because the card is 12 m tall and 3 m wide. That is
    // exactly a black dagger burst. Now it samples the four-archetype atlas, which carries
    // a pale segmented culm all the way down to v = 0, and it runs the file's second
    // highest transmission floor with a near-undesaturated green so the low sun coming
    // through the sea reads as chlorophyll rather than as more amber.
    const cardOpts = {
      name: 'bamboo-card', mode: 0, map: this.tex.bambooCard, color: 0xffffff,
      atlas: [2, 2],
      bendExp: 1.8, bendGain: 0.9, flutter: 0.6, alphaTest: 0.24,
      fadeNear: fadeIn(RANGE.bambooCard),
      fadeFar: fadeOut(RANGE.bambooCard),
      size: [1, 1], sss: 1.6, sssColor: 0x86c24a, sssFloor: 0.52, sssSat: 0.95,
      tipGlow: 0.20, baseAO: 0.16, grain: 0.10, broad: 0.20, tintAmount: 0.55,
    };
    const cardMat = this._makeMaterial(cardOpts);

    this._bambooAssets = {
      culm: { geo: culm, mat: culmMat, depth: culmDepth },
      leaf: { geo: leaf, mat: leafMat, depth: leafDepth },
      card: { geo: card, mat: cardMat, depth: null },
    };
  }

  /**
   * Which way the ground actually falls away, measured rather than assumed.
   *
   * `WORLD.VALLEY_AZIMUTH` is 135 deg and `sin/cos` of it points at +X -Z, but Terrain
   * builds its landform from `ax = (-x - z)` and its descent runs toward +X +Z — ninety
   * degrees away. Scattering the bamboo sea into the documented wedge put most of it up
   * the ridge, where the height and slope filters then threw it away; the near culms
   * survived at a couple of dozen instances world-wide and none of the four review
   * framings could see one. Probing the heightfield cannot disagree with the landform
   * Terrain is actually drawing, and it costs 32 samples once at boot.
   */
  _valleyDir() {
    let sx = 0, sz = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (const r of [190, 340]) {
        // `_heightAt` is already NaN-hardened, so `drop` cannot be non-finite here.
        const drop = Math.max(0, WORLD.PLATEAU_HEIGHT - this._heightAt(dx * r, dz * r));
        sx += dx * drop; sz += dz * drop;
      }
    }
    const len = Math.hypot(sx, sz);
    // Hold the documented value if the probe is degenerate — a flat or stubbed terrain.
    if (!(len > 1e-3)) {
      const a = (WORLD.VALLEY_AZIMUTH * Math.PI) / 180;
      return [Math.sin(a), Math.cos(a)];
    }
    return [sx / len, sz / len];
  }

  /**
   * The bamboo sea. Near culms are real geometry; everything past ~30 m is a card, and
   * past ~110 m the canopy shell takes over. All of it is scattered once at boot — the
   * playable region is only 220 m across, so recycling would buy nothing but bugs.
   */
  _scatterBamboo(q) {
    const A = this._bambooAssets;
    const density = clamp(0.35 + (q.grassDensity || 0.4) * 0.8, 0.3, 1.6);
    const rnd = makeRandom(0xBA9B00);

    const [vx, vz] = this._valleyDir();

    const nearTarget = Math.round(520 * density);
    const cardTarget = Math.round(2600 * density);

    const nearA = new Float32Array(nearTarget * 4);
    const nearB = new Float32Array(nearTarget * 4);
    const nearC = new Float32Array(nearTarget * 4);
    const leavesPer = q.tier >= 2 ? 7 : 5;
    const leafA = new Float32Array(nearTarget * leavesPer * 4);
    const leafB = new Float32Array(nearTarget * leavesPer * 4);
    const leafC = new Float32Array(nearTarget * leavesPer * 4);
    const cardA = new Float32Array(cardTarget * 4);
    const cardB = new Float32Array(cardTarget * 4);
    const cardC = new Float32Array(cardTarget * 4);

    let n = 0, ln = 0, cn = 0;
    const col = _colScratch;

    // Bamboo wants the sheltered, damp, valley-facing ground below the plateau lip.
    const sample = (maxR) => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * maxR;
      // Bias toward the valley azimuth without ever becoming a visible wedge.
      const bias = 0.55;
      const x = Math.cos(a) * r * (1 - bias) + vx * r * bias + (rnd() - 0.5) * r * 0.6;
      const z = Math.sin(a) * r * (1 - bias) + vz * r * bias + (rnd() - 0.5) * r * 0.6;
      return [x, z];
    };

    const clumpNoise = (x, z) => clamp(noise.fbm2(x * 0.035, z * 0.035, 3) * 0.5 + 0.5, 0, 1);

    // The rim is at r = 78 and `plateauMask` does not reach zero until r = 112, so a 96 m
    // sampling disc against a 0.35 mask threshold left an annulus about six metres wide
    // for the near culms to live in — a handful of survivors for the whole world. Sample
    // out to the far edge of the playable region and let the mask only defend the swept
    // courtyard itself.
    for (let i = 0; i < nearTarget * 5 && n < nearTarget; i++) {
      const [x, z] = sample(180);
      const y = this._heightAt(x, z);
      if (y < WORLD.WATER_LEVEL + 0.4) continue;
      // Never inside the swept courtyard, and never on the stone stair.
      if (plateauMask(x, z) > 0.82) continue;
      const surf = this._surfaceAt(x, z);
      if (surf === 'stone' || surf === 'gravel' || surf === 'rock' || surf === 'path' || surf === 'water') continue;
      if (this._slopeAt(x, z) > 0.62) continue;
      const c = clumpNoise(x, z);
      if (rnd() > 0.22 + c * 0.95) continue;

      // Skewed toward the shorter culms, with a long tail — a real stand is mostly waist
      // to head height with a scatter of 15 m leaders through it, and that spread is what
      // stops the band from reading as one wall at one depth.
      const h = 3.2 + Math.pow(rnd(), 0.75) * 13.0;   // 3.2-16.2 m
      const lean = 0.55 + rnd() * 0.9;
      const yaw = rnd() * Math.PI * 2;
      const green = 0.55 + rnd() * 0.45;
      // The tint IS the albedo here (no map), and a culm is *pale* — straw-green, near
      // sRGB 200. It is the one thing in the mid-ground that must not silhouette black.
      col.setRGB(0.50 * green + 0.28, 0.62 * green + 0.24, 0.28 * green + 0.14);
      // Older culms yellow off; a monoculture of one green reads as plastic.
      if (rnd() < 0.24) col.lerp(AUTUMN_B, 0.35 + rnd() * 0.4);

      const o = n * 4;
      nearA[o] = x; nearA[o + 1] = y; nearA[o + 2] = z; nearA[o + 3] = yaw;
      nearB[o] = h;
      nearB[o + 1] = (0.055 + rnd() * 0.055) * (0.75 + h / 20);
      nearB[o + 2] = 2.0 + rnd() * 1.5 + h * 0.04;   // stiff: >1 per Weather's convention
      nearB[o + 3] = rnd();
      nearC[o] = col.r; nearC[o + 1] = col.g; nearC[o + 2] = col.b; nearC[o + 3] = lean;
      n++;

      // Leaf clusters live on the top third, where a real culm actually leafs out.
      for (let l = 0; l < leavesPer; l++) {
        const t = 0.58 + (l / leavesPer) * 0.40 + rnd() * 0.04;
        const lo = ln * 4;
        leafA[lo] = x; leafA[lo + 1] = y; leafA[lo + 2] = z;
        leafA[lo + 3] = yaw + l * 2.39996 + rnd() * 0.4;
        leafB[lo] = h;
        leafB[lo + 1] = 0.85 + rnd() * 0.75;          // card size, metres
        leafB[lo + 2] = nearB[o + 2];
        leafB[lo + 3] = nearB[o + 3] + l * 0.13;
        leafC[lo] = col.r * 1.12; leafC[lo + 1] = col.g * 1.18; leafC[lo + 2] = col.b * 0.9;
        leafC[lo + 3] = clamp(t, 0, 1);
        ln++;
      }
    }

    for (let i = 0; i < cardTarget * 3 && cn < cardTarget; i++) {
      const [x, z] = sample(420);
      const d = Math.hypot(x, z);
      if (d < RANGE.bambooCard[0] * 0.5) continue;
      const y = this._heightAt(x, z);
      if (y < WORLD.WATER_LEVEL + 0.2) continue;
      if (this._slopeAt(x, z) > 0.75) continue;
      const c = clumpNoise(x, z);
      if (rnd() > 0.15 + c) continue;

      // Archetype, then height *around that archetype's* mean. Two independent spreads:
      // the four outlines separate the band into layers, and a +/-38% jitter inside each
      // one stops any layer reading as a repeated stamp.
      const cell = (rnd() * 4) | 0;
      const spec = BAMBOO_ARCHETYPES[cell];
      const h = 9.0 * spec.hScale * (0.62 + rnd() * 0.76);
      const green = 0.5 + rnd() * 0.5;
      col.setRGB(0.52 * green + 0.30, 0.70 * green + 0.30, 0.30 * green + 0.16);
      const o = cn * 4;
      cardA[o] = x; cardA[o + 1] = y; cardA[o + 2] = z; cardA[o + 3] = rnd() * Math.PI * 2;
      cardB[o] = h;
      // The atlas cell is painted in a 1:2 frame, so the card must be planted at that
      // aspect. It used to be 12 m tall and 3 m wide, which stretched every leaf in the
      // texture into a four-times-too-long dagger — half of why the band read as thistles.
      cardB[o + 1] = h * (0.46 + rnd() * 0.14);
      cardB[o + 2] = 2.2 + rnd() * 1.2;
      // Integer part = archetype (see KAG_ATLAS), fraction = the dissolve/wind phase.
      cardB[o + 3] = cell + rnd() * 0.999;
      cardC[o] = col.r; cardC[o + 1] = col.g; cardC[o + 2] = col.b; cardC[o + 3] = 0;
      cn++;
    }

    const shadows = !!q.foliageShadows;
    const culmMesh = this._makeBatchMesh(A.culm.geo, A.culm.mat, A.culm.depth, Math.max(1, n), shadows);
    const leafMesh = this._makeBatchMesh(A.leaf.geo, A.leaf.mat, A.leaf.depth, Math.max(1, ln), shadows);
    const cardMesh = this._makeBatchMesh(A.card.geo, A.card.mat, null, Math.max(1, cn), false);
    culmMesh.name = 'bamboo-culms';
    leafMesh.name = 'bamboo-leaves';
    cardMesh.name = 'bamboo-cards';

    this._fill(culmMesh, nearA, nearB, nearC, n, 16);
    this._fill(leafMesh, leafA, leafB, leafC, ln, 16);
    this._fill(cardMesh, cardA, cardB, cardC, cn, 20);

    this._bamboo = { culmMesh, leafMesh, cardMesh, near: n, cards: cn };
  }

  /**
   * Upload a finished instance set and author the bounding sphere from its own extent.
   * An InstancedBufferGeometry's bounds describe one blade, so without this every batch
   * would be frustum-culled the moment the camera looked away from the world origin.
   */
  _fill(mesh, a, b, c, count, padY) {
    const geo = mesh.geometry;
    const attrA = geo.getAttribute('aFoliageA');
    const attrB = geo.getAttribute('aFoliageB');
    const attrC = geo.getAttribute('aFoliageC');
    attrA.array.set(a.subarray(0, count * 4));
    attrB.array.set(b.subarray(0, count * 4));
    attrC.array.set(c.subarray(0, count * 4));
    attrA.needsUpdate = attrB.needsUpdate = attrC.needsUpdate = true;
    geo.instanceCount = count;
    mesh.visible = count > 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const x = a[o], y = a[o + 1], z = a[o + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!count) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
    const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
    mesh.boundingSphere.center.set(cx, cy + padY * 0.5, cz);
    mesh.boundingSphere.radius = Math.hypot(maxX - cx, maxZ - cz, maxY - cy) + padY;
  }

  // --------------------------------------------------------------------- trees

  _buildTreeAssets(q) {
    const defs = [
      // Sakura sits in the pale-pink-to-bone band and stays there; momiji owns the crimson.
      { key: 'sakura', seed: 0x5A1201, tex: this.tex.blossom, tint: 0xf6e2e4, sss: 0.55, emitter: 'petal' },
      { key: 'momiji', seed: 0x30D311, tex: this.tex.momiji, tint: 0xb02418, sss: 0.95, emitter: 'leaf' },
      { key: 'cedar', seed: 0x0CED11, tex: this.tex.cedar, tint: 0x8fae86, sss: 0.30, emitter: null },
    ];

    const list = [];
    for (const def of defs) {
      const spec = TREE_SPECIES[def.key];
      const built = buildTree(spec, def.seed);
      this._geometries.push(built.wood, built.leaf);

      const woodOpts = {
        name: `${def.key}-wood`, mode: 0, map: null, color: spec.wood,
        bendExp: 2.4, bendGain: 0.55, flutter: 0.20, side: FrontSide,
        fadeFar: fadeOut(RANGE.treeMesh), size: [1, 1],
        sss: 0.10, sssColor: 0x8a6a4a, tipGlow: 0.10, baseAO: 0.30, grain: 0.22,
      };
      const leafOpts = {
        name: `${def.key}-leaf`, mode: 0, map: def.tex, color: 0xffffff,
        bendExp: 2.4, bendGain: 0.60, flutter: 1.35, alphaTest: 0.36,
        fadeFar: fadeOut(RANGE.treeMesh), size: [1, 1],
        sss: def.sss, sssColor: def.tint, tipGlow: 0.20, baseAO: 0.18, grain: 0.15,
      };
      const woodMat = this._makeMaterial(woodOpts);
      const leafMat = this._makeMaterial(leafOpts);

      // Plain, non-instanced twins used only for the impostor bake.
      const bakeWood = new MeshLambertMaterial({ color: spec.wood, side: FrontSide });
      const bakeLeaf = new MeshLambertMaterial({ map: def.tex, alphaTest: 0.36, side: DoubleSide, color: def.tint });
      this._materials.push(bakeWood, bakeLeaf);

      built.wood.computeBoundingBox();
      built.leaf.computeBoundingBox();
      const bb = built.leaf.boundingBox;
      const radius = Math.max(
        Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), 0.2);
      // Square impostor frame around the whole canopy, in canonical (height = 1) units.
      const frameRel = Math.max(radius, 0.5) * 1.06;

      list.push({
        key: def.key, spec, built, woodMat, leafMat, bakeWood, bakeLeaf,
        depthWood: this._makeDepthMaterial(woodMat, woodOpts),
        depthLeaf: this._makeDepthMaterial(leafMat, leafOpts),
        frameRel, emitter: def.emitter, tint: new Color(def.tint),
        woodMesh: null, leafMesh: null,
      });
    }
    this._treeAssets = { list };
  }

  /**
   * Render each species from 8 azimuths into one atlas. Hand-drawing an impostor is how
   * you get a card that does not match the mesh it replaces; this is the mesh, so the LOD
   * swap is invisible even mid-crossfade.
   */
  _bakeImpostors(q) {
    const renderer = this.ctx.renderer;
    const assets = this._treeAssets;
    if (!renderer || !assets || !assets.list.length) { this._impostors = null; return; }

    const cols = 8;
    const rows = assets.list.length;
    const cell = q.tier >= 2 ? 256 : 128;

    const rt = new WebGLRenderTarget(cell * cols, cell * rows, {
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.texture.colorSpace = SRGBColorSpace;
    rt.texture.wrapS = rt.texture.wrapT = ClampToEdgeWrapping;
    rt.texture.anisotropy = q.anisotropy || 1;
    this._renderTargets.push(rt);

    const scene = new Scene();
    const pivot = new Group();
    scene.add(pivot);

    const sun = new DirectionalLight(0xffffff, 2.35);
    const sunDir = this.ctx.sky?.sunDirection;
    sun.position.set(sunDir ? sunDir.x : 0.45, sunDir ? Math.max(sunDir.y, 0.35) : 0.7, sunDir ? sunDir.z : -0.6)
      .normalize().multiplyScalar(50);
    scene.add(sun);
    scene.add(new HemisphereLight(0xbcd4ff, 0x6b6046, 1.05));

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 400);

    // Save every piece of renderer state we are about to stomp.
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevToneMapping = renderer.toneMapping;
    const prevScissorTest = renderer.getScissorTest();
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = new Color();
    renderer.getClearColor(prevColor);
    const prevViewport = new Vector4();
    renderer.getViewport(prevViewport);

    renderer.setRenderTarget(rt);
    renderer.autoClear = false;
    // Tone mapping is applied again at final composite; baking it would double it.
    renderer.toneMapping = 0;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.setScissorTest(true);

    for (let r = 0; r < rows; r++) {
      const item = assets.list[r];
      const h = item.spec.height;
      const half = item.frameRel * h;

      const wood = new Mesh(item.built.wood, item.bakeWood);
      const leaf = new Mesh(item.built.leaf, item.bakeLeaf);
      wood.scale.setScalar(h);
      leaf.scale.setScalar(h);
      pivot.add(wood, leaf);

      camera.left = -half; camera.right = half;
      camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();

      for (let c = 0; c < cols; c++) {
        const az = (c / cols) * Math.PI * 2;
        pivot.rotation.set(0, -az, 0);
        // A slight downward look matches how the player actually sees a distant tree.
        const el = 0.14;
        camera.position.set(0, h * 0.5 + Math.sin(el) * 120, Math.cos(el) * 120);
        camera.lookAt(0, h * 0.5, 0);
        camera.updateMatrixWorld();

        const x = c * cell;
        const y = (rows - 1 - r) * cell;
        renderer.setViewport(x, y, cell, cell);
        renderer.setScissor(x, y, cell, cell);
        renderer.render(scene, camera);
      }

      pivot.remove(wood, leaf);
      item.atlasRow = rows - 1 - r;
    }

    renderer.setScissorTest(prevScissorTest);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.toneMapping = prevToneMapping;
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.setViewport(prevViewport.x, prevViewport.y, prevViewport.z, prevViewport.w);

    this._impostors = { rt, cols, rows, cell };
  }

  /** Billboard material for the baked atlas. Y-locked, cell chosen from the view azimuth. */
  _makeImpostorMaterial(atlas, fadeNear, fadeFar) {
    const mat = new MeshBasicMaterial({
      name: 'foliage/impostor',
      map: atlas.rt.texture,
      alphaTest: 0.42,
      transparent: false,
      side: FrontSide,
      toneMapped: true,
    });

    const local = {
      uFadeNear: { value: new Vector2(fadeNear[0], fadeNear[1]) },
      uFadeFar: { value: new Vector2(fadeFar[0], fadeFar[1]) },
      uAtlas: { value: new Vector2(atlas.cols, atlas.rows) },
      uSize: { value: new Vector2(1, 1) },
      uBendGain: { value: 1 },
      uFlutter: { value: 1 },
      uSSSColor: { value: new Color(0xffffff) },
      uSSSStrength: { value: 0 },
      uTipGlow: { value: 0.10 },
      uBaseAO: { value: 0.16 },
      uGrain: { value: 0.10 },
    };
    mat.userData.kag = local;

    const shared = this.uniforms;
    const wind = this._windUniforms;

    const pars = /* glsl */`
#define KAG_TAU 6.28318530718
attribute vec4 aFoliageA;
attribute vec4 aFoliageB;
attribute vec4 aFoliageC;
attribute vec2 aFlex;

uniform vec3 uCamPos;
uniform vec2 uFadeNear;
uniform vec2 uFadeFar;
uniform vec2 uAtlas;

varying float vKagFade;
varying vec3  vKagTint;

vec3 kagPosG;

${WIND_GLSL}
`;

    const body = /* glsl */`
{
  vec3  base = aFoliageA.xyz;
  float yaw  = aFoliageA.w;
  float size = aFoliageB.x;
  float yOff = aFoliageB.y;

  vec3 toCam = uCamPos - base;
  toCam.y = 0.0;
  float len = length( toCam );
  toCam = len > 1e-4 ? toCam / len : vec3( 0.0, 0.0, 1.0 );
  vec3 right = vec3( toCam.z, 0.0, -toCam.x );

  float fade = smoothstep( uFadeNear.x, uFadeNear.y, len ) * ( 1.0 - smoothstep( uFadeFar.x, uFadeFar.y, len ) );
  // Per-tree dissolve rather than a screen-door dither: nothing downstream resolves a
  // stipple, so a card at half fade used to render as a checkerboard of the tree.
  float thr = fract( aFoliageB.w * 31.7 + 0.137 );
  float grow = smoothstep( thr * 0.72, thr * 0.72 + 0.28, fade );
  vKagFade = grow > 0.0 ? 1.0 : 0.0;
  vKagTint = aFoliageC.rgb;
  vMapUv = vec2( 0.0 );

  if ( grow <= 0.0 ) {
    kagPosG = base;      // degenerate: never rasterised
  } else {
  // Shrink toward the base, not the card centre, or a dissolving tree lifts off the hill.
  float shrink = mix( 0.62, 1.0, grow );
  size *= shrink;
  yOff *= shrink;

  // Even a distant grove has to breathe on the same front as the near culms.
  vec3 w = kagerouBend( base, 1.0, 2.4 );
  float sway = ( position.y + 0.5 );

  kagPosG = base
    + right * ( position.x * size )
    + vec3( 0.0, yOff + position.y * size, 0.0 )
    + vec3( w.x, 0.0, w.z ) * sway * 0.45;

  float az = atan( toCam.x, toCam.z ) - yaw;
  float cellIdx = floor( mod( az / KAG_TAU * uAtlas.x + 0.5, uAtlas.x ) );
  vec2 q = position.xy + 0.5;
  vMapUv = vec2( ( q.x + cellIdx ) / uAtlas.x, ( q.y + aFoliageC.w ) / uAtlas.y );
  }
}
`;

    chainBeforeCompile(mat, (shader) => {
      shader.uniforms.uWind = wind.uWind;
      shader.uniforms.uGust = wind.uGust;
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + pars)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + body)
        .replace('#include <begin_vertex>', 'vec3 transformed = kagPosG;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' +
          'uniform vec3 uSunColor;\nvarying float vKagFade;\nvarying vec3 vKagTint;')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ( vKagFade <= 0.0 ) discard;')
        .replace('#include <map_fragment>',
          '#include <map_fragment>\ndiffuseColor.rgb *= vKagTint * mix( vec3( 1.0 ), uSunColor, 0.55 );');
    });
    chainCacheKey(mat, 'kagimpostor2');

    this.ctx.sky?.applyFog?.(mat);
    this._materials.push(mat);
    return mat;
  }

  /**
   * Plant the grove. Cedars mass behind the shrine on the ridge side, sakura line the
   * approach, momiji cluster where the ground breaks toward the valley — the autumn
   * crimson wants to be the accent, not the field.
   */
  _scatterTrees(q) {
    const assets = this._treeAssets;
    if (!assets) return;
    const rnd = makeRandom(0x7BEE51);
    const shadows = !!q.foliageShadows;
    const meshLod = q.tier >= 2;

    const ridge = (WORLD.RIDGE_AZIMUTH * Math.PI) / 180;
    const valley = (WORLD.VALLEY_AZIMUTH * Math.PI) / 180;
    const approach = (WORLD.APPROACH_AZIMUTH * Math.PI) / 180;

    const bias = {
      cedar: { ax: Math.sin(ridge), az: Math.cos(ridge), weight: 0.55, count: 110, near: 34, far: 300, hMin: 9, hMax: 17 },
      sakura: { ax: Math.sin(approach), az: Math.cos(approach), weight: 0.35, count: 48, near: 14, far: 130, hMin: 4.5, hMax: 8.5 },
      momiji: { ax: Math.sin(valley), az: Math.cos(valley), weight: 0.40, count: 64, near: 12, far: 160, hMin: 3.2, hMax: 6.4 },
    };

    this.petalEmitters.length = 0;
    this.leafEmitters.length = 0;

    for (const item of assets.list) {
      const cfg = bias[item.key];
      const target = Math.max(8, Math.round(cfg.count * clamp(0.5 + (q.grassDensity || 0.5) * 0.7, 0.45, 1.35)));
      const a = new Float32Array(target * 4);
      const b = new Float32Array(target * 4);
      const c = new Float32Array(target * 4);
      let n = 0;

      for (let i = 0; i < target * 12 && n < target; i++) {
        const ang = rnd() * Math.PI * 2;
        const r = cfg.near + Math.sqrt(rnd()) * (cfg.far - cfg.near);
        const x = Math.cos(ang) * r * (1 - cfg.weight) + cfg.ax * r * cfg.weight + (rnd() - 0.5) * r * 0.7;
        const z = Math.sin(ang) * r * (1 - cfg.weight) + cfg.az * r * cfg.weight + (rnd() - 0.5) * r * 0.7;

        const y = this._heightAt(x, z);
        if (y < WORLD.WATER_LEVEL + 1.2) continue;
        if (plateauMask(x, z) > 0.5) continue;             // keep the courtyard clear
        if (this._slopeAt(x, z) > 0.66) continue;
        const surf = this._surfaceAt(x, z);
        if (surf === 'water' || surf === 'path' || surf === 'stone' || surf === 'wood') continue;
        const clump = clamp(noise.fbm2(x * 0.018 + item.key.length, z * 0.018, 3) * 0.5 + 0.5, 0, 1);
        if (rnd() > 0.2 + clump * 0.95) continue;

        const h = cfg.hMin + rnd() * (cfg.hMax - cfg.hMin);
        const o = n * 4;
        a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
        b[o] = h;
        b[o + 1] = h * (0.9 + rnd() * 0.22);               // trees scale near-uniformly
        b[o + 2] = 1.7 + rnd() * 0.9;                      // stiff: trunks barely move
        b[o + 3] = rnd();
        const v = 0.86 + rnd() * 0.28;
        c[o] = v; c[o + 1] = v * (0.96 + rnd() * 0.08); c[o + 2] = v * (0.94 + rnd() * 0.10);
        c[o + 3] = item.atlasRow !== undefined ? item.atlasRow : 0;
        n++;

        // Publish crowns for Weather. Petals fall from sakura, leaves from momiji.
        if (item.emitter && this.petalEmitters.length + this.leafEmitters.length < 96) {
          const cy = y + item.built.crown.y * h;
          const cr = item.built.crown.radius * h;
          const rec = {
            position: new Vector3(x, cy, z),
            radius: cr,
            rate: item.emitter === 'petal' ? 1.0 : 0.55,
            color: item.tint.clone(),
            kind: item.key,
          };
          if (item.emitter === 'petal') this.petalEmitters.push(rec);
          else this.leafEmitters.push(rec);
        }
      }

      const woodMesh = this._makeBatchMesh(item.built.wood, item.woodMat, item.depthWood, Math.max(1, n), shadows);
      const leafMesh = this._makeBatchMesh(item.built.leaf, item.leafMat, item.depthLeaf, Math.max(1, n), shadows);
      woodMesh.name = `${item.key}-wood`;
      leafMesh.name = `${item.key}-leaf`;
      this._fill(woodMesh, a, b, c, n, cfg.hMax);
      this._fill(leafMesh, a, b, c, n, cfg.hMax);
      item.woodMesh = woodMesh;
      item.leafMesh = leafMesh;
      item.instances = { a, b, c, n };

      // Below HIGH we go straight from mesh to impostor and save three draw calls.
      const meshFar = meshLod ? RANGE.treeMesh[1] : RANGE.treeCardOnly[0] + 8;
      item.woodMat.userData.kag.uFadeFar.value.set(meshFar * 0.88, meshFar);
      item.leafMat.userData.kag.uFadeFar.value.set(meshFar * 0.88, meshFar);
    }

    // One impostor draw call for every species: same atlas, same material, row per species.
    if (this._impostors) {
      let total = 0;
      for (const item of assets.list) total += item.instances.n;
      const a = new Float32Array(total * 4);
      const b = new Float32Array(total * 4);
      const c = new Float32Array(total * 4);
      let k = 0;
      for (const item of assets.list) {
        const src = item.instances;
        for (let i = 0; i < src.n; i++) {
          const o = i * 4, d = k * 4;
          const h = src.b[o];
          const half = item.frameRel * h;
          a[d] = src.a[o]; a[d + 1] = src.a[o + 1]; a[d + 2] = src.a[o + 2]; a[d + 3] = src.a[o + 3];
          b[d] = half * 2;              // card world size
          b[d + 1] = h * 0.5;           // card centre height above the base
          b[d + 2] = 2.4; b[d + 3] = src.b[o + 3];
          c[d] = src.c[o]; c[d + 1] = src.c[o + 1]; c[d + 2] = src.c[o + 2];
          c[d + 3] = item.atlasRow !== undefined ? item.atlasRow : 0;
          k++;
        }
      }
      const range = meshLod ? RANGE.treeCard : RANGE.treeCardOnly;
      const mat = this._makeImpostorMaterial(this._impostors,
        [range[0], range[0] + 14], [range[1] * 0.9, range[1]]);
      const quad = buildCrossCard(1, 1.0, true, 0.0);
      this._geometries.push(quad);
      const mesh = this._makeBatchMesh(quad, mat, null, Math.max(1, k), false);
      mesh.name = 'tree-impostors';
      this._fill(mesh, a, b, c, k, 24);
      this._impostors.mesh = mesh;
      this._impostors.material = mat;
    }
  }

  // -------------------------------------------------------------- undergrowth

  /**
   * Ferns, low shrubs and susuki, in two draw calls. Susuki gets its own material because
   * its plume wants a much higher translucency than a fern ever should.
   */
  _buildUndergrowth(q) {
    const density = q.grassDensity || 0;
    const radius = Math.max(RANGE.undergrowth[1], (q.grassRadius || 30));
    const rnd = makeRandom(0xFE211A);

    const fernGeo = buildFrondClumpGeometry(7, 0.55, 0.62, 3);
    const susukiGeo = buildSusukiGeometry(5);
    this._geometries.push(fernGeo, susukiGeo);

    const fernOpts = {
      name: 'fern', mode: 0, map: this.tex.fern, color: 0xffffff,
      bendExp: 2.1, bendGain: 0.85, flutter: 1.0, alphaTest: 0.40,
      fadeFar: [radius * 0.85, radius], size: [1, 1], sink: true,
      sss: 1.35, sssColor: 0xa8c86a, sssFloor: 0.45,
      tipGlow: 0.20, baseAO: 0.42, grain: 0.20, broad: 0.14,
    };
    const susukiOpts = {
      name: 'susuki', mode: 0, map: this.tex.susuki, color: 0xffffff,
      bendExp: 2.2, bendGain: 1.15, flutter: 1.25, alphaTest: 0.18,
      fadeFar: [radius * 1.35, radius * 1.6], size: [1, 1], sink: true,
      // The whole point of susuki is that a low sun blows straight through the plume, so
      // it runs the highest transmission floor in the file: the blade strip is an opaque,
      // dark texture and without the floor the money shot renders as black paper.
      sss: 2.6, sssColor: 0xf0e2c0, sssFloor: 0.58,
      tipGlow: 0.45, baseAO: 0.30, grain: 0.10, broad: 0.16,
    };
    const shadows = !!q.foliageShadows;
    const fernMat = this._makeMaterial(fernOpts);
    const susukiMat = this._makeMaterial(susukiOpts);

    const mk = (geo, mat, depth, targetCount, cfg) => {
      const a = new Float32Array(targetCount * 4);
      const b = new Float32Array(targetCount * 4);
      const c = new Float32Array(targetCount * 4);
      let n = 0;
      for (let i = 0; i < targetCount * 8 && n < targetCount; i++) {
        const ang = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * cfg.far;
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        const w = this._siteWeight(x, z, this._heightAt(x, z));
        if (w <= 0.05 || rnd() > w * cfg.bias) continue;
        const clump = clamp(noise.fbm2(x * cfg.scale + cfg.seed, z * cfg.scale, 3) * 0.5 + 0.5, 0, 1);
        if (rnd() > Math.pow(clump, cfg.clumpPow)) continue;
        const y = this._plantY(x, z, _plant);
        const h = cfg.hMin + rnd() * (cfg.hMax - cfg.hMin);
        const o = n * 4;
        a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
        b[o] = h; b[o + 1] = h * (cfg.aspect * (0.8 + rnd() * 0.4));
        b[o + 2] = cfg.stiff * (0.8 + rnd() * 0.4);
        b[o + 3] = rnd();
        _colScratch.set(cfg.color).lerp(AUTUMN_B, rnd() * cfg.dry);
        const v = 0.82 + rnd() * 0.34;
        c[o] = _colScratch.r * v; c[o + 1] = _colScratch.g * v; c[o + 2] = _colScratch.b * v;
        c[o + 3] = _plant.sag;
        n++;
      }
      const mesh = this._makeBatchMesh(geo, mat, depth, Math.max(1, n), shadows && cfg.shadow);
      mesh.name = cfg.name;
      this._fill(mesh, a, b, c, n, cfg.hMax + 1);
      return mesh;
    };

    const scale = clamp(density, 0, 1.5);
    const fernMesh = mk(fernGeo, fernMat, this._makeDepthMaterial(fernMat, fernOpts),
      Math.round(900 * scale) + 40, {
        name: 'ferns', far: radius, bias: 1.0, scale: 0.075, seed: 3.1, clumpPow: 2.4,
        hMin: 0.35, hMax: 0.95, aspect: 1.5, stiff: 0.75, color: 0x4e6b3c, dry: 0.35, shadow: false,
      });

    const susukiMesh = mk(susukiGeo, susukiMat, null,
      Math.round(420 * scale) + 24, {
        name: 'susuki', far: radius * 1.5, bias: 0.85, scale: 0.032, seed: 19.7, clumpPow: 3.2,
        hMin: 1.1, hMax: 2.0, aspect: 1.15, stiff: 0.62, color: 0x9c8548, dry: 0.75, shadow: false,
      });

    this._undergrowth = { fernMesh, susukiMesh, fernMat, susukiMat };
  }

  /** Fallen leaves and moss, lying flat. One draw call, no bend, the barest flutter. */
  _buildGroundCards(q) {
    const density = q.grassDensity || 0;
    const radius = RANGE.groundCard[1];
    const geo = buildGroundCard(3, 11);
    this._geometries.push(geo);

    const opts = {
      name: 'ground-cards', mode: 0, map: this.tex.fallen, color: 0xffffff,
      atlas: [2, 1],
      bendExp: 2.0, bendGain: 0.06, flutter: 0.25, alphaTest: 0.34,
      fadeFar: [radius * 0.82, radius], size: [1, 1], sink: true,
      sss: 0.35, sssColor: 0xd8a068, sssFloor: 0.25, tipGlow: 0.06, baseAO: 0.10, grain: 0.24,
      tintAmount: 0.95,
    };
    const mat = this._makeMaterial(opts);

    // These survive at LOW tier: with no grass at all they are the only thing breaking up
    // the terrain's own texture near the camera.
    const target = Math.round(1750 * clamp(0.55 + density, 0.55, 1.8));
    const a = new Float32Array(target * 4);
    const b = new Float32Array(target * 4);
    const c = new Float32Array(target * 4);
    const rnd = makeRandom(0xFA11EE);
    let n = 0;
    for (let i = 0; i < target * 6 && n < target; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius * 1.6;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (this._heightAt(x, z) < WORLD.WATER_LEVEL + 0.2) continue;
      const surf = this._surfaceAt(x, z);
      if (surf === 'water') continue;
      if (this._slopeAt(x, z) > 0.55) continue;
      const y = this._plantY(x, z, _plant);
      // Leaves collect where the ground dips and against the courtyard edge.
      const drift = clamp(noise.fbm2(x * 0.05 + 4.4, z * 0.05 - 2.2, 3) * 0.5 + 0.5, 0, 1);
      if (rnd() > 0.18 + drift * 0.9) continue;

      // Moss where the ground is damp and shaded, leaf litter where it is not. Moss is
      // the cheapest true green in the build: it lies flat inside 26 m so the aerial
      // perspective never touches it, and an up-facing surface under a 13 deg sun is lit
      // mostly by the cool sky bounce, which is the only light path in the frame whose
      // product with a green albedo comes out green-dominant rather than orange.
      const damp = clamp(noise.fbm2(x * 0.032 - 11.9, z * 0.032 + 6.3, 3) * 0.5 + 0.5, 0, 1);
      const moss = rnd() < clamp(0.16 + damp * 1.05, 0, 0.86);

      const o = n * 4;
      // A fallen leaf lies *on* the ground; it is the one thing here that must not be
      // buried, so undo _plantY's bury and float it a centimetre clear of z-fighting.
      a[o] = x; a[o + 1] = y + PLANT_BURY + 0.012; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
      b[o] = 1.0; b[o + 1] = (moss ? 0.85 : 0.55) + rnd() * 0.85;
      b[o + 2] = 3.0;
      // Integer part = atlas cell (0 litter, 1 moss); fraction = the dissolve/wind phase.
      b[o + 3] = (moss ? 1 : 0) + rnd() * 0.999;
      const v = 0.78 + rnd() * 0.4;
      if (moss) {
        _colScratch.copy(AUTUMN_A).lerp(AUTUMN_B, Math.pow(rnd(), 2.2) * 0.42);
      } else {
        _colScratch.copy(AUTUMN_B).lerp(AUTUMN_C, rnd());
      }
      c[o] = _colScratch.r * v; c[o + 1] = _colScratch.g * v; c[o + 2] = _colScratch.b * v;
      c[o + 3] = _plant.sag;
      n++;
    }

    const mesh = this._makeBatchMesh(geo, mat, null, Math.max(1, n), false);
    mesh.name = 'ground-cards';
    this._fill(mesh, a, b, c, n, 1);
    this._groundCards = { mesh, mat };
  }

  /**
   * The far canopy: one noise-displaced shell over the valley. It is not a field of props,
   * it is a *surface* — which is exactly why it can read as an endless bamboo sea for one
   * draw call while the aerial perspective does the rest of the work.
   */
  _buildCanopy(q) {
    const rings = q.tier >= 2 ? 28 : 20;
    const segs = q.tier >= 2 ? 128 : 96;
    const rInner = RANGE.canopy[0];
    const rOuter = RANGE.canopy[1];

    const g = new GeoBuilder();
    const idx = [];
    for (let j = 0; j <= rings; j++) {
      const tr = j / rings;
      // Log-ish spacing: dense near the lip where the silhouette matters, sparse far out.
      const r = rInner + (rOuter - rInner) * Math.pow(tr, 1.9);
      const row = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const ground = this._heightAt(x, z);
        // The sea only exists below the plateau lip; on the ridge side it dies away.
        const below = clamp((WORLD.PLATEAU_HEIGHT - 6 - ground) / 26, 0, 1);
        const canopyH = lerp(0, 13, below) * (0.65 + 0.35 * (noise.fbm2(x * 0.006, z * 0.006, 3) * 0.5 + 0.5));
        const bump = noise.fbm2(x * 0.045, z * 0.045, 4) * 2.6 + noise.fbm2(x * 0.011, z * 0.011, 3) * 5.0;
        const y = ground + canopyH + bump * clamp(below, 0.15, 1);
        const n = nrm3([
          noise.noise2(x * 0.05 + 3, z * 0.05) * 0.5,
          1,
          noise.noise2(x * 0.05, z * 0.05 + 7) * 0.5,
        ]);
        row.push(g.vert(x, y, z, n[0], n[1], n[2], i / segs * 12, tr * 12, 0.55, i * 0.11));
      }
      idx.push(row);
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        g.quad(idx[j][i], idx[j][i + 1], idx[j + 1][i + 1], idx[j + 1][i]);
      }
    }
    const geo = g.toGeometry();
    this._geometries.push(geo);

    // A plain lit material — no instancing, no bend function, just fog and a slow ripple.
    const mat = new MeshLambertMaterial({
      name: 'foliage/canopy',
      color: 0x59703f,
      side: FrontSide,
      fog: true,
    });
    const wind = this._windUniforms;
    const shared = this.uniforms;
    chainBeforeCompile(mat, (shader) => {
      shader.uniforms.uWind = wind.uWind;
      shader.uniforms.uGust = wind.uGust;
      shader.uniforms.uSunColor = shared.uSunColor;
      shader.uniforms.uSunDir = shared.uSunDir;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + WIND_GLSL +
          '\nvarying vec3 vCanopyW;\nvarying float vCanopyG;')
        .replace('#include <begin_vertex>', /* glsl */`
vec3 transformed = vec3( position );
vec3 wp = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
float cg = kagerouGust( wp.xz );
vec3 cw = kagerouWind( wp );
// The whole surface breathes on the shared front: a gust visibly rolls across the sea.
transformed.xz += cw.xz * ( 0.55 + cg * 1.6 );
transformed.y += cg * 0.9 - 0.4;
vCanopyW = wp;
vCanopyG = cg;
`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + glslNoise +
          '\nuniform vec3 uSunColor;\nuniform vec3 uSunDir;\nvarying vec3 vCanopyW;\nvarying float vCanopyG;')
        .replace('#include <map_fragment>', /* glsl */`
#include <map_fragment>
{
  // Break the shell up so it never reads as a single tinted dome.
  float n1 = fbm2( vCanopyW.xz * 0.22, 3 ) * 0.5 + 0.5;
  float n2 = fbm2( vCanopyW.xz * 0.9, 2 ) * 0.5 + 0.5;
  vec3 deep = vec3( 0.16, 0.23, 0.14 );
  vec3 lit = vec3( 0.46, 0.53, 0.26 );
  diffuseColor.rgb *= mix( deep, lit, n1 * 0.75 + n2 * 0.25 ) * ( 0.85 + vCanopyG * 0.35 ) * 2.0;
}
`)
        .replace('#include <envmap_fragment>', /* glsl */`
{
  // Cheap canopy translucency so the sea glows where the sun grazes it.
  vec3 V = normalize( cameraPosition - vCanopyW );
  float forward = pow( clamp( dot( V, -uSunDir ) * 0.5 + 0.5, 0.0, 1.0 ), 3.0 );
  outgoingLight += diffuseColor.rgb * uSunColor * forward * 0.55;
}
#include <envmap_fragment>
`);
    });
    chainCacheKey(mat, 'kagcanopy1');
    this.ctx.sky?.applyFog?.(mat);
    this._materials.push(mat);

    const mesh = new Mesh(geo, mat);
    mesh.name = 'bamboo-canopy';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.raycast = () => {};
    mesh.userData.foliage = true;
    this.group.add(mesh);
    this._meshes.push(mesh);
    this._canopy = { mesh, mat };
  }

  // ------------------------------------------------------------------- runtime

  /** Weather's clock, which is the clock every disturbance timestamp is measured against. */
  _windTime() {
    return this._windUniforms.uWind.value.w;
  }

  /**
   * Gather up to 8 characters into the uniform array. Nearest first, so on a crowded
   * field the blades part around whoever the player can actually see.
   */
  _addCharacter(e, k, arr, cx, cz, maxD2) {
    if (k >= MAX_CHARACTERS || !e) return k;
    if (e.isAlive === false) return k;
    const p = e.position || (e.root && e.root.position);
    if (!p) return k;
    // Checked before it is measured, because the distance test alone cannot tell a NaN
    // apart from "far away" and this slot is element 0 of uChars for the player.
    if (!finiteVec(p)) { warnNonFinite('uChars', entityName(e), p); return k; }
    const dx = p.x - cx, dz = p.z - cz;
    // Rejecting form, deliberately: `> maxD2` is false for NaN and would admit it. This
    // also catches a non-finite camera, which would otherwise poison every slot at once.
    if (!(dx * dx + dz * dz <= maxD2)) return k;
    const o = k * 4;
    arr[o] = p.x; arr[o + 1] = p.y; arr[o + 2] = p.z;
    // Influence radius is generous: you want to see the parting ahead of the feet.
    // `e.radius || 0.4` already survives a NaN radius (NaN is falsy), but say so explicitly
    // rather than leave the next reader to work out why Math.max cannot see one.
    arr[o + 3] = Math.max(finite(e.radius) ? e.radius : 0.4, 0.3) * 3.4;
    return k + 1;
  }

  _updateCharacters() {
    const arr = this.uniforms.uChars.value;
    const cam = this.ctx.camera;
    const cx = cam ? cam.position.x : 0;
    const cz = cam ? cam.position.z : 0;
    const maxD = (this.ctx.quality?.grassRadius || 34) + 10;
    const maxD2 = maxD * maxD;

    let k = this._addCharacter(this.ctx.player, 0, arr, cx, cz, maxD2);
    const en = this.ctx.enemies;
    const list = (en && (en.active || en.enemies || en.list)) || null;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length && k < MAX_CHARACTERS; i++) {
        k = this._addCharacter(list[i], k, arr, cx, cz, maxD2);
      }
    }
    for (let i = 0; i < this._extraCharacters.length && k < MAX_CHARACTERS; i++) {
      k = this._addCharacter(this._extraCharacters[i], k, arr, cx, cz, maxD2);
    }
    // Clear the whole slot, not just the influence radius. Zeroing only .w disables the
    // slot in the shader but leaves its x behind in the buffer — and if that stale x were
    // ever non-finite it would sit in element 0 poisoning `flatten` for the rest of the
    // run, long after whatever wrote it had gone away.
    for (; k < MAX_CHARACTERS; k++) {
      const o = k * 4;
      arr[o] = 0; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    }
  }

  update(dt, elapsed) {
    this._elapsed = elapsed || (this._elapsed + dt);

    // Everything below is ingest from another system, so it gets §5b treatment: on a
    // non-finite reading we hold the last good value rather than propagate it. A NaN
    // camera position would otherwise reach every material's `dist` at once and collapse
    // the whole field to nothing — a far more confusing symptom than one frozen frame.
    const cam = this.ctx.camera;
    if (cam && finiteVec(cam.position)) this.uniforms.uCamPos.value.copy(cam.position);

    const sky = this.ctx.sky;
    if (sky) {
      if (finiteVec(sky.sunDirection)) this.uniforms.uSunDir.value.copy(sky.sunDirection);
      if (sky.sunColor && finite(sky.sunColor.r)) {
        this.uniforms.uSunColor.value.copy(sky.sunColor);
        // `typeof NaN === 'number'`, so the old typeof guard let a NaN intensity through
        // and clamp() would have passed it on to every foliage fragment.
        const i = finite(sky.sunIntensity) ? clamp(sky.sunIntensity / 3.0, 0.05, 1.6) : 1;
        this.uniforms.uSunColor.value.multiplyScalar(i);
      }
    }

    this._updateCharacters();
    this._updateGrass(dt);
  }

  resize(w, h, bufW, bufH) {
    this._bufW = bufW || w;
    this._bufH = bufH || h;
  }

  // -------------------------------------------------------------- public API

  /**
   * A brief, violent local displacement — a sword arc through the grass, a body landing.
   * Four slots, round-robin; a fifth call in the same beat overwrites the oldest, which is
   * correct because the oldest is the one you have already stopped looking at.
   */
  disturb(position, radius = 2.0, strength = 1.0) {
    // This is a public entry point off the combat hot path, so it is where a bad hit point
    // would enter the uniform buffers. Reject rather than clamp: clamp() passes NaN.
    if (!finiteVec(position)) {
      if (position) warnNonFinite('uDisturbP', 'disturb()', position);
      return;
    }
    const i = this._disturbCursor % MAX_DISTURB;
    this._disturbCursor = (this._disturbCursor + 1) % (MAX_DISTURB * 64);
    const P = this.uniforms.uDisturbP.value;
    const A = this.uniforms.uDisturbA.value;
    const t = this._windTime();
    const o = i * 4;
    P[o] = position.x; P[o + 1] = position.y; P[o + 2] = position.z;
    P[o + 3] = Math.max(finite(radius) ? radius : 2.0, 0.2);
    A[o] = clamp(finite(strength) ? strength : 1.0, 0, 3);
    A[o + 1] = finite(t) ? t : 0;
    A[o + 2] = 0; A[o + 3] = 0;
  }

  /**
   * A cut through bamboo: a hard local sway plus a fall of leaves. Kept deliberately cheap
   * and rate-limited — this fires off the combat hot path.
   */
  strike(position, direction) {
    // Checked here as well as in disturb(), because this one also forwards the position on
    // to EffectsSystem — §5b is about the boundary, not about our own buffers.
    if (!finiteVec(position)) {
      if (position) warnNonFinite('uDisturbP', 'strike()', position);
      return;
    }
    this.disturb(position, 3.4, 1.7);

    const now = this._elapsed;
    if (now - (this._lastStrikeFx || -1) < 0.12) return;
    this._lastStrikeFx = now;

    const fx = this.ctx.fx;
    if (!fx) return;
    if (typeof fx.leafBurst === 'function') fx.leafBurst(position, direction, 12);
    else if (typeof fx.spawnLeaves === 'function') fx.spawnLeaves(position, direction, 12);
    else if (typeof fx.burst === 'function') fx.burst('leaves', position, direction);
  }

  /** Extra entities (a mount, a boss part) that should part the grass. */
  registerCharacter(entity) {
    if (entity && this._extraCharacters.indexOf(entity) < 0) this._extraCharacters.push(entity);
  }

  unregisterCharacter(entity) {
    const i = this._extraCharacters.indexOf(entity);
    if (i >= 0) this._extraCharacters.splice(i, 1);
  }

  /** CPU wind sample. Weather owns the maths; we never re-derive it. */
  windAt(x, z, y = 0, out = _windScratch) {
    const w = this.ctx.weather?.windAt?.(x, z, y, out);
    // §5b applies on the way out too: this is a re-export of another system's value and
    // callers integrate it into positions, so a NaN here would surface somewhere else again.
    if (finiteVec(w)) return w;
    out.set(0, 0, 0);
    return out;
  }

  /** Rough draw-call accounting, for the debug overlay and for keeping us honest. */
  getStats() {
    let draws = 0, instances = 0, meshes = 0;
    for (const m of this._meshes) {
      if (!m.visible) continue;
      meshes++;
      draws++;
      instances += m.geometry.instanceCount || 1;
    }
    const p = this._placement;
    return {
      draws, instances, meshes, estimate: this._drawEstimate,
      // Placement audit (see _plantY): `floating` must stay 0. Anything else means the
      // measured clipmap chord deficit hit SINK_MAX and a plant may still be in the air.
      planted: p ? p.planted : 0,
      sunk: p ? p.sunk : 0,
      maxSink: p ? +p.maxSink.toFixed(3) : 0,
      floating: p ? p.floating : 0,
    };
  }

  _recomputeDrawEstimate() {
    this._drawEstimate = this._meshes.length;
  }

  // ------------------------------------------------------------------ quality

  /**
   * Rebuild densities and LOD distances live. The grass ring is torn down and relaid
   * because its capacities are a function of density; everything else only needs its
   * fade windows and shadow flags moved.
   */
  applyQuality(q) {
    if (!q || !this._grassMat) return;      // a tier flip before init() finishes
    const shadows = !!q.foliageShadows;
    const meshLod = q.tier >= 2;

    this._buildGrassBuckets(q);

    // Grass fade windows are set inside _buildGrassBuckets; the rest scale off the radius.
    const radius = Math.max(q.grassRadius || 0, 18);

    if (this._bambooAssets) {
      const A = this._bambooAssets;
      const culmFar = clamp(radius * 1.35, 26, RANGE.bambooCulm[1]);
      const leafFar = clamp(radius * 1.1, 22, RANGE.bambooLeaf[1]);
      A.culm.mat.userData.kag.uFadeFar.value.set(culmFar * 0.9, culmFar);
      A.leaf.mat.userData.kag.uFadeFar.value.set(leafFar * 0.9, leafFar);
      A.card.mat.userData.kag.uFadeNear.value.set(culmFar * 0.82, culmFar);
      A.card.mat.userData.kag.uFadeFar.value.set(RANGE.bambooCard[1] * 0.86, RANGE.bambooCard[1]);
    }
    if (this._bamboo) {
      this._bamboo.culmMesh.castShadow = shadows;
      this._bamboo.leafMesh.castShadow = shadows;
    }

    if (this._treeAssets) {
      const meshFar = meshLod ? RANGE.treeMesh[1] : RANGE.treeCardOnly[0] + 8;
      for (const item of this._treeAssets.list) {
        item.woodMat.userData.kag.uFadeFar.value.set(meshFar * 0.88, meshFar);
        item.leafMat.userData.kag.uFadeFar.value.set(meshFar * 0.88, meshFar);
        if (item.woodMesh) item.woodMesh.castShadow = shadows;
        if (item.leafMesh) item.leafMesh.castShadow = shadows;
      }
      if (this._impostors?.material) {
        const range = meshLod ? RANGE.treeCard : RANGE.treeCardOnly;
        const k = this._impostors.material.userData.kag;
        k.uFadeNear.value.set(range[0], range[0] + 14);
        k.uFadeFar.value.set(range[1] * 0.9, range[1]);
      }
    }

    if (this._undergrowth) {
      this._undergrowth.fernMat.userData.kag.uFadeFar.value.set(radius * 0.85, radius);
      this._undergrowth.susukiMat.userData.kag.uFadeFar.value.set(radius * 1.35, radius * 1.6);
      this._undergrowth.fernMesh.castShadow = shadows;
    }
    if (this._groundCards) {
      const r = RANGE.groundCard[1];
      this._groundCards.mat.userData.kag.uFadeFar.value.set(r * 0.82, r);
    }
    if (this._canopy) this._canopy.mesh.visible = q.tier > 0;

    this._recomputeDrawEstimate();
  }

  // ------------------------------------------------------------------ dispose

  dispose() {
    this.ctx.bus?.off?.('slash', this._onSlash);
    this.ctx.bus?.off?.('hit', this._onHit);

    this._disposeGrass();
    this.group.parent?.remove(this.group);

    for (const g of this._geometries) g.dispose?.();
    for (const m of this._materials) m.dispose?.();
    for (const t of this._textures) t.dispose?.();
    for (const rt of this._renderTargets) rt.dispose?.();

    this._geometries.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
    this._renderTargets.length = 0;
    this._meshes.length = 0;
    this.petalEmitters.length = 0;
    this.leafEmitters.length = 0;
    this._extraCharacters.length = 0;

    this._grass = null;
    this._bamboo = null;
    this._treeAssets = null;
    this._bambooAssets = null;
    this._undergrowth = null;
    this._groundCards = null;
    this._impostors = null;
    this._canopy = null;
    this.groundDetail = null;
    // Drop the published cards last: everything in `_textures` has just been disposed, so
    // a consumer still polling must see null rather than bind a dead GPU texture.
    this.blossomTexture = null;
    this.momijiTexture = null;
  }
}

export default FoliageSystem;
