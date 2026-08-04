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

/**
 * The archetype-atlas grid, as preprocessor constants rather than a uniform.
 *
 * Both halves matter. The dimensions have to be *in the shader body* because as a
 * `uniform vec2 uAtlas` the divide in KAG_ATLAS evaluated against (0,0) and every fragment
 * of the material alpha-tested away — the mid-ground bamboo band drew literally nothing.
 * And they have to be *in the cache key* because three hands back a program by key: a bare
 * `#define KAG_ATLAS` made a 2x2 material and a 2x1 material indistinguishable, so whether
 * you got the right grid depended on which compiled first.
 */
const atlasDefines = (a) =>
  `#define KAG_ATLAS\n#define KAG_ATLAS_C ${a[0].toFixed(1)}\n#define KAG_ATLAS_R ${a[1].toFixed(1)}\n`;
const atlasKey = (a) => (a ? `x${a[0]}x${a[1]}` : '-');
/**
 * Spliced in at the `kagFoliageVertex()` call site, which is inside main() and therefore
 * after `#include <uv_pars_vertex>` has declared `vMapUv` and `#include <uv_vertex>` has
 * written it. It must not move back into vertexPars(): that text lands at
 * `#include <common>`, above the declaration, and the shader silently fails to compile.
 */
const KAG_ATLAS_UV = /* glsl */`
#if defined( KAG_ATLAS ) && defined( USE_MAP )
  vMapUv = ( clamp( uv, 0.0, 1.0 ) + kagAtlasIJ ) / vec2( KAG_ATLAS_C, KAG_ATLAS_R );
#endif
`;

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

  /**
   * One ring of a tube. Returns the first vertex index.
   *
   * `u0`/`u1` map the way round the tube into a sub-range of the texture, so a culm can
   * take a narrow bark strip out of a sheet it shares with its own leaf cards. The strip
   * is painted dark at both ends, which is what keeps the wrap seam invisible.
   */
  ring(c, n, b, radius, sides, v, flex, jit, u0 = 0, u1 = 1) {
    const start = this.vertexCount;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = n[0] * ca + b[0] * sa;
      const ny = n[1] * ca + b[1] * sa;
      const nz = n[2] * ca + b[2] * sa;
      this.vert(c[0] + nx * radius, c[1] + ny * radius, c[2] + nz * radius, nx, ny, nz,
        u0 + (u1 - u0) * (s / sides), v, flex, jit);
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
// The archetype grid is NOT a uniform. See KAG_ATLAS below.

varying float vKagFade;
varying float vKagT;
varying vec3  vKagTint;
varying vec3  vKagWorld;

vec3 kagPosG;
vec3 kagNrmG;
#ifdef KAG_ATLAS
// Written here, consumed at the call site — see KAG_ATLAS_UV.
vec2 kagAtlasIJ;
#endif

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

#ifdef KAG_ATLAS
  // Which cell of the archetype atlas this instance draws. Written unconditionally, so it
  // is defined on the degenerate path too — an undefined varying downstream is a
  // driver-dependent NaN source (§5b).
  //
  // The *write into vMapUv* deliberately does not happen here. This whole function is
  // injected at the common include, and three declares vMapUv further down in the
  // uv_pars_vertex include — so touching the varying from in here is a reference before
  // declaration and the shader does not compile. It does not throw, either: three
  // logs and carries on, the material keeps a program with zero active uniforms, and the
  // symptom is that every fragment of that material vanishes. That is what "there is no
  // bamboo sea" was — 11 390 mid-ground cards, all inside their fade window, all submitted
  // by the renderer, not one of them rasterising a pixel, for three review rounds. It took
  // out every atlas material in the file at once: the bamboo band, the fallen leaves and
  // the moss. The assignment now lives in KAG_ATLAS_UV, spliced in at the call site inside
  // main(), which is after both the declaration and three's own write to it.
  //
  // The grid is a compile-time constant rather than a uniform for a second, independent
  // reason: a bare KAG_ATLAS define carried no dimensions into the program cache key, so a
  // 2x2 material and a 2x1 material were indistinguishable to three's program cache and
  // which grid you got depended on which compiled first.
  kagAtlasIJ = vec2( mod( kagCell, KAG_ATLAS_C ), floor( kagCell / KAG_ATLAS_C ) );
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
uniform vec3  uWarmFill;
#ifdef KAG_AERIAL
uniform vec4  uAerial;     // x,y = range over which it blends in; z = desaturation; w = gain
#endif

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
  //
  // The lift is scaled by the albedo's own luminance rather than being a flat colour. A
  // constant lift is a *replacement*: at floor 0.5 half of every fragment became the same
  // authored green regardless of what the texture said, so the near bamboo leaf cards
  // rasterised as unlit flat 0x5cc233 blobs with their blade structure erased — read, quite
  // reasonably, as a debug overlay in review. Scaling by aLum keeps the card's internal
  // value range intact while still pulling a near-black blade up off the floor.
  float aLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 through = mix( diffuseColor.rgb, uSSSColor * ( 0.26 + aLum * 1.9 ), uSSSFloor );

  // Ceiling. Transmission may lift a leaf out of silhouette; it may never *become* the
  // leaf. Without this, sss and sssFloor multiply without bound and the only symptom is a
  // flat saturated fill that no amount of texture work can be seen through.
  vec3 glow = min( through * trans, vec3( 0.85 ) );
  outgoingLight += glow + diffuseColor.rgb * uSunColor * wrap * 0.14 * lit;

  // Inter-reflection inside a dense crown, opt-in per material and zero everywhere it is
  // not set. Every light path above is either the amber key or the scene's cool sky bounce,
  // so a cluster of cards facing away from the sun is lit by #4a6b8f and nothing else — and
  // on the sakura, whose albedo is authored with B over G by 16-36 to keep it out of brick,
  // that lands as cold purple: round 15 measured the hero crown's shadowed clusters at
  // meanRGB 135.8, 82.6, 91.3, i.e. B above G by 8.7. A real blossom mass is not lit only
  // from outside; light that entered the lit face scatters through the mass and comes back
  // out of the shaded one carrying the key's warmth. This is that term, gated on the same
  // wrap factor the direct lighting uses so it can only ever add where the sun does not
  // reach.
  outgoingLight += diffuseColor.rgb * uWarmFill * ( 1.0 - wrap );

#ifdef KAG_AERIAL
  // The distant LOD's own depth response. Opt-in, and only the mid-ground bamboo band
  // declares it.
  //
  // This is NOT a second fog integral and must never become one — Sky.js owns aerial
  // perspective and every material in this file already goes through applyFog(). What it
  // is: at 150-280 m one of these cards is 20-40 px of a stand several hundred culms deep,
  // and the eye is integrating multiple scattering between culms, not one card's own
  // terminator. Rendering it as a single lit cutout is what makes the band read as a wall
  // of stamps at full local contrast.
  //
  // Sized from the frame, not from taste. On phone-valley-r17.png the band box
  // (220,200,300x200) reads sRGB 80.6, 77.6, 46.9 = luma 76.02 at saturation 0.417 against
  // sky (220,120,300x50) at 167.04 / 0.552. Those are post-ACES: inverting the curve puts
  // the band at scene-linear 0.079 and the sky at 0.58, and since the fog colour Sky
  // uploads at magic hour is ~0.31 linear, a band at 0.079 total bounds the fog opacity
  // there at f < 0.25 however dark the band's own radiance is — i.e. the 91-luma step is
  // not a missing fog term, it is a band that leaves this shader at a twentieth of the
  // sky's radiance. Reaching the critic's 105 luma needs scene-linear 0.115, +46%, which
  // is uAerial.w; the saturation target (0.417 -> 0.30) is uAerial.z.
  {
    float aerD = distance( cameraPosition, vKagWorld );
    float aer = smoothstep( uAerial.x, uAerial.y, aerD );
    float aerL = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
    vec3 aerC = mix( outgoingLight, vec3( aerL ), uAerial.z ) * uAerial.w;
    outgoingLight = mix( outgoingLight, aerC, aer );
  }
#endif
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
 * UV layout of the combined bamboo-plant sheet. The left fifth is the opaque bark strip
 * the culm tube wraps; the right two thirds is the alpha-cut leaf spray. The gap between
 * them is dead space so the mip chain cannot bleed the opaque bark into the cut-out card
 * — bleeding the other way is the failure that matters, because it would make the culm
 * itself alpha-test away at range and put us straight back to floating leaves.
 */
const PLANT_UV = { culmU0: 0.014, culmU1: 0.196, leafU0: 0.302, leafU1: 0.996 };

/**
 * A whole bamboo plant — culm AND its leaf sprays — as one mesh.
 *
 * This is the structural fix for foliage floating in open sky, and it is structural rather
 * than a tuned agreement between two numbers.
 *
 * The culm and its leaf clusters used to be two instanced meshes. Both ran the same LOD
 * dissolve, `grow = smoothstep(thr*0.72, thr*0.72+0.28, fade)`, and both keyed `thr` off
 * `fract(phase * 31.7 + 0.137)` — but the leaf's phase was its parent's plus `l * 0.13`,
 * and multiplying by 31.7 turns a 0.13 offset into a completely uncorrelated threshold.
 * So inside the fade window a leaf and the culm holding it crossed *independently*.
 * Measured on the shipped build at the valley pose: 810 culms scattered, six of them
 * drawn, against forty-seven leaf clusters — seventeen of which had no culm at all, eight
 * of those inside the 400x240 px the critic counted. Equalising the two thresholds would
 * only have narrowed the window; the leaf's own base is up to 1.6 m off the culm's, so
 * `dist` differs too and the divergence comes back at the boundary.
 *
 * One instance cannot half-exist. There is no threshold left to agree on, the shadow pass
 * gets the same treatment for free, and it costs one draw call fewer than before.
 *
 * Canonical space is ISOTROPIC here: `aFoliageB.y` (width) is set equal to `aFoliageB.x`
 * (height) by the scatterer, so x/z and y scale together and a square leaf card stays
 * square. Everything below is therefore a fraction of the plant's height.
 */
function buildBambooPlantGeometry(sides, internodes, sprays, seed = 0x8B0011) {
  const g = new GeoBuilder();
  const rnd = makeRandom(seed);

  // Radius as a fraction of height, and deliberately shallow. A 12 m moso is 12-18 cm
  // through and still 10 cm at the top; the old profile tapered 0.5 -> 0.14, which put the
  // upper half of every culm under one pixel at the distance its leaves were still being
  // drawn, and a sub-pixel line does not fade — it aliases into the dashes the critic
  // measured. At 0.0065 a 12 m culm is 15.6 cm at the base and 11.5 cm at the tip, which
  // is 3.6 and 2.6 px at the 46 m edge of the fade window.
  const rBase = 0.0065, rTip = 0.0048;
  const lean = 0.055;

  const rows = internodes * 2 + 1;
  const nAx = [1, 0, 0], bAx = [0, 0, 1];
  let prev = -1;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    // Even rows sit on a node: a small radial bulge, and the bark strip carries the ring.
    const node = (r % 2) === 0 ? 1 : 0;
    const rad = (rBase + (rTip - rBase) * t) * (1 + 0.11 * node);
    const c = [lean * t * t, t, lean * t * t * 0.35];
    // Stiff: the culm may bend as a whole but must not shiver, or it reads as a reed.
    const ring = g.ring(c, nAx, bAx, rad, sides, t, 0.10, 0, PLANT_UV.culmU0, PLANT_UV.culmU1);
    if (prev >= 0) g.linkRings(prev, ring, sides);
    prev = ring;
  }

  // Leaf sprays over the upper *two thirds* — a real culm leafs out over its top 40-50%,
  // and a tuft on the end of a bare pole is a palm, not bamboo. Successive sprays step
  // round by the golden angle so the crown has an outline instead of stacking into a
  // bottle-brush, and the attachment radius grows with height.
  //
  // 0.54 was measured to fail its own intent in frame. On `phone-valley-r17.png` the
  // culm zone above the band (x1250-1900, y0-250) carries occluders over 10.21% of the
  // box at mean RGB 123.5, 88.6, 46.2 — khaki, not leaf — and only 0.4% of those pixels
  // are green-dominant; the leaf-coloured fraction of the full box by ninth reads
  // 0 / 0.1 / 0 / 0 / 0.1 / 8.0 / 48.2 / 76.5 / 81.6, i.e. every green pixel in it belongs
  // to the far band and none to the near culms. Eight sprays over the top 46% of a culm
  // whose visible length is ~300 px leaves the sprays 40 px apart with bare stem between,
  // which is exactly the "dark pole with a tuft at the extreme tip" the review filed.
  // Reaching to 0.30 and carrying more of them is what closes a crown.
  const leafFrom = 0.30;
  for (let i = 0; i < sprays; i++) {
    const f = i / Math.max(1, sprays - 1);
    const t = leafFrom + f * (1.0 - leafFrom) + (rnd() - 0.5) * 0.03;
    const ang = i * 2.39996 + rnd() * 0.5;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    // Attachment sits on the culm surface at that height, offset by its own short branch.
    const rr = rBase + (rTip - rBase) * t;
    const branch = rr + (0.020 + rnd() * 0.045) * (0.5 + t * 0.7);
    const ax = lean * t * t + dx * branch, az = lean * t * t * 0.35 + dz * branch;
    const ay = t + (rnd() - 0.5) * 0.02;

    // Card size as a fraction of height. A 12 m culm carries sprays about 1.5-2.2 m across;
    // the lower ones on a mature culm are the biggest, which is why the profile below still
    // grows with `t` but from a base 19% wider than the round-16 value.
    const s = (0.125 + rnd() * 0.065) * (0.62 + t * 0.55);
    // paintBambooLeaves hangs its branch from about (0.24, 0.78) of the cell, so shift the
    // card until that point lands on the attachment rather than the card's centre.
    const hw = s * 0.5, hh = s * 0.5;
    const cx = ax + dx * hw * 0.52, cz = az + dz * hw * 0.52;
    const cy = ay - hh * 0.56;

    for (let p = 0; p < 2; p++) {
      const pa = ang + p * Math.PI * 0.5;
      const px = Math.cos(pa), pz = Math.sin(pa);
      const rv = [px * hw, 0, pz * hw];
      const uv = [0, hh, 0];
      const nv = nrm3([px * 0.45, 0.86, pz * 0.45]);
      g.card([cx, cy, cz], rv, uv, nv,
        PLANT_UV.leafU0, 0, PLANT_UV.leafU1, 1, 1.0, rnd());
    }
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
  // Plumes: five slender feathers on visible stems, at five different heights.
  //
  // Three fat crossed cards all sitting at h ~ 0.9 within half a metre of each other is
  // most of why a clump rasterised as ONE cream lozenge rather than as a spray: the cards
  // union into a single convex blob before the shading ever gets a say. A susuki head is
  // narrow — roughly 1:3 — and the heads in a clump sit at obviously different heights.
  const plumes = 5;
  for (let i = 0; i < plumes; i++) {
    const a = (i / plumes) * Math.PI * 2 + rnd() * 0.9;
    const lean = 0.10 + rnd() * 0.32;
    const h = 0.62 + (i / plumes) * 0.34 + rnd() * 0.10;
    const cx = Math.cos(a) * lean, cz = Math.sin(a) * lean;
    const s = 0.80 + rnd() * 0.45;

    // The stem, sampled off the opaque blade strip. A plume floating free of the clump is
    // the same failure as a leaf cluster floating free of its culm, one scale down.
    const sw = 0.008;
    const nx = -Math.sin(a), nz = Math.cos(a);
    const s0 = g.vert(-nx * sw, 0.10, -nz * sw, nx, 0.3, nz, SUSUKI_UV.bladeU0, 0, 0.25, i * 0.19);
    const s1 = g.vert(nx * sw, 0.10, nz * sw, nx, 0.3, nz, SUSUKI_UV.bladeU1, 0, 0.25, i * 0.19);
    const s2 = g.vert(cx + nx * sw * 0.6, h - 0.16 * s, cz + nz * sw * 0.6, nx, 0.3, nz, SUSUKI_UV.bladeU1, 1, 0.8, i * 0.19);
    const s3 = g.vert(cx - nx * sw * 0.6, h - 0.16 * s, cz - nz * sw * 0.6, nx, 0.3, nz, SUSUKI_UV.bladeU0, 1, 0.8, i * 0.19);
    g.quad(s0, s1, s2, s3);

    for (let p = 0; p < 2; p++) {
      const pa = a + p * Math.PI * 0.5;
      const r = [Math.cos(pa) * 0.062 * s, 0, Math.sin(pa) * 0.062 * s];
      const u = [0, 0.165 * s, 0];
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
    // leafSize down from 1.05 and spread up from 0.62: the crown was a solid convex mass
    // with no branch visible inside it, and the cross-card above hands back the coverage
    // that shrinking the cluster costs. The review wants twig structure reading *through*
    // the blossom, which needs daylight between clusters, not more cards.
    phyllotaxis: 2.39996, leavesPerTip: 3, leafSize: 0.96, leafSpread: 0.70,
    leafFrom: 3, wood: 0x4a3a33, foliage: 0xf6e2e4, crossLeaf: true,
  },
  momiji: {
    height: 4.6, trunkRadius: 0.145, depth: 4, segs: 4, sides: 5,
    children: [3, 3, 2, 2], split: 0.80, splitJitter: 0.30, lengthRatio: 0.70,
    radiusRatio: 0.63, upBias: 0.04, gravity: -0.075, wobble: 0.18, trunkFrac: 0.24,
    phyllotaxis: 2.39996, leavesPerTip: 3, leafSize: 0.88, leafSpread: 0.54,
    leafFrom: 3, wood: 0x4d4038, foliage: 0xb02418, crossLeaf: true,
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
      // A SECOND plane at ninety degrees. One quad per cluster is invisible edge-on, and
      // "edge-on" is not an edge case in a crown of 200 of them scattered over every
      // azimuth — round 15 measured the hero sakura as "chunky flat blossom slabs ... and
      // long thin horizontal slivers (cards seen near edge-on)". Those slivers are single
      // quads at grazing incidence and no amount of texture work removes them. Crossing the
      // card guarantees a plane within 45 degrees of facing from any direction, which is
      // also what stops the crown flickering between slab and sliver as the camera orbits.
      // Cost is one quad per cluster on a mesh LOD that ends at 46 m: 486 -> 972 triangles
      // per sakura instance, against a 900 k contract and a handful of instances in range.
      // Opt-in per species. Cedar is the one with 97 instances and it carries needle
      // sprays whose silhouette survives edge-on, so it keeps the single quad and the
      // triangle ceiling stays where the budget was measured.
      if (spec.crossLeaf) {
        const r2 = [-sa * size * 0.5, tilt * size * 0.12, ca * size * 0.5];
        leaf.card(c, r2, u, nrm3([oz * 0.5, 0.9, -ox * 0.5]), 0, 0, 1, 1, 1.0, rnd());
      }
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

/**
 * GREEN_RATIO — why every green in this file looks "too green" as a hex code.
 *
 * The magic-hour key is `(1.0, 0.412, 0.134)` (Sky publishes it; the capture report prints
 * it). A sunlit surface therefore leaves the shader with `R = r_lin`, `G = g_lin * 0.412`,
 * so it can only be green-dominant if its albedo satisfies
 *
 *     g_lin / r_lin  >  1 / 0.412  =  2.43
 *
 * in *linear* space — roughly `r_srgb < 0.6 * g_srgb`. Every foliage albedo in this file
 * used to sit between 1.1 and 2.1, i.e. plausibly green as a swatch and reliably orange
 * once the key hit it. That, not the instance count and not the silhouette, is why four
 * consecutive review frames measured green-dominant pixels at 0.06-0.15% of 2.07 M and the
 * build was called a duotone. The cool `#4a6b8f` sky bounce is green-dominant against any
 * of these, so shadowed foliage was always fine; it is the *lit* half that inverted.
 *
 * Autumn is unaffected: momiji, susuki and the dry grass members are meant to be warm and
 * are deliberately left below the bar. Bamboo, cedar and moss are evergreen and are the
 * three things that carry the green.
 */

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

/**
 * Morphological CLOSE on the alpha channel: dilate by `r`, then erode by `r`.
 *
 * This is aimed at exactly one failure, and it is the one the review keeps photographing
 * above the canopy line: a cutout sheet whose content is *nearly* connected breaks into
 * detached specks when it is minified. A blade tip joined to the leaf mass by a two-texel
 * stem is one object at mip 0 and two objects at mip 3, because the stem's coverage
 * averages below `alphaTest` two levels before the tip's does. What reaches the frame is a
 * mass with a scatter of unattached fragments hanging over it — measured on
 * `phone-valley-r8`, the flagged dashes sit a median 6 px from the solid canopy mass
 * (p90 18 px), i.e. in the fringe zone rather than in open sky.
 *
 * A close is the right operator because it is *silhouette-preserving by construction*:
 * dilate-then-erode can only fill gaps narrower than 2r and can never push the outer
 * boundary of a region outward at all. It costs nothing at runtime — this runs once, at
 * boot, on the canvas. It does not touch RGB, so `dilateAlpha` still has the same work to
 * do afterwards and the cutout's colour behaviour is unchanged.
 *
 * `r` must stay well under any deliberate dead space in the sheet: `PLANT_UV` leaves 0.106
 * of the sheet width (27 texels at px = 256) between the bark strip and the leaf spray, and
 * `paintBambooClump`'s side ramp leaves 14% of a cell width (18 texels) at every atlas seam.
 * At r = 2 neither can be bridged.
 */
function closeAlpha(canvas, r = 2) {
  if (r < 1) return canvas;
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const a = new Uint8Array(w * h);
  const t = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const sweep = (src, dst, pick) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = src[y * w + x];
        for (let o = -r; o <= r; o++) {
          const xx = x + o < 0 ? 0 : x + o >= w ? w - 1 : x + o;
          v = pick(v, src[y * w + xx]);
        }
        dst[y * w + x] = v;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = dst[y * w + x];
        for (let o = -r; o <= r; o++) {
          const yy = y + o < 0 ? 0 : y + o >= h ? h - 1 : y + o;
          v = pick(v, dst[yy * w + x]);
        }
        src[y * w + x] = v;
      }
    }
  };
  const mx = (p, q) => (q > p ? q : p);
  const mn = (p, q) => (q < p ? q : p);
  sweep(a, t, mx);   // dilate — result lands back in `a`
  sweep(a, t, mn);   // erode
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = a[i];
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * An *organic* alpha boundary, for the one card whose silhouette is read directly.
 *
 * `feather()` is the right tool for a card that only ever appears inside a mass: its
 * cut contour is `box * 0.55 + rad * 0.45`, and that box term is deliberate — it kills
 * the corners fastest. But the contour it leaves is a rounded rectangle. Solved
 * numerically on the blossom card's own parameters (inner 0.50, power 1.05, floret alpha
 * 0.95 against alphaTest 0.36) that contour holds |ny| constant to within 0.01 over 22.3%
 * of the card width, at |ny| = 0.769 — a flat top edge nearly a quarter of the card wide,
 * and the same on all four sides. Its radius varies only 16.1% between the flats and the
 * corners, and it carries no concavity deeper than 15% of its own maximum anywhere. The
 * sacred tree's crown is built from these cards, so its outermost ones contribute straight
 * horizontal and vertical segments to the tree's silhouette and nothing else: exactly the
 * "visible rectangular card boundaries" note, and half of why the crown reads as one
 * convex blob.
 *
 * The replacement measures, on the same solver and the same `makeRandom`: longest straight
 * run 10.0% of the card width against 22.3%, radius 0.447 to 0.940 — a 52.4% depth against
 * feather's 16.1% — and THREE concavities reaching below 70% of the maximum radius, against
 * feather's none. Three is the review's own number for what the crown's silhouette has to
 * show. The bites are narrow on purpose: the enclosed area is 89.3% of feather's, so the
 * crown buys those notches for 11% of its cover rather than by being thinned out.
 *
 * `base` and `biteDepth` are not free. `paintBlossom` caps its twig armature at 0.37 in
 * these units precisely because the minimum radius here is 0.447; move either and re-check
 * that margin, or the twigs come back out through the silhouette.
 *
 * So the blossom card gets a boundary authored as a function of angle instead: three
 * lobes with two harmonics on top, and a small number of deep *bites* that take the
 * radius well inside the painted content. The bites are the point — they are what puts
 * concavities (sky gaps) into the silhouette of a crown built from these cards, rather
 * than another convex blob. `rMax` is capped below 1 so the alpha still reaches zero
 * before the quad border and the card can never show its own rectangle.
 */
function lobeMask(canvas, {
  lobes = 3, base = 0.86, amp = 0.12, softness = 0.30,
  bites = 3, biteDepth = 0.34, biteWidth = 0.34, rMax = 0.94, seed = 0x51A7,
} = {}) {
  const rnd = makeRandom(seed);
  const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2, p3 = rnd() * Math.PI * 2;
  const biteAt = [];
  for (let i = 0; i < bites; i++) biteAt.push(((i + rnd() * 0.7) / bites) * Math.PI * 2);
  // Exported so the outline can be measured without rasterising a canvas.
  const radiusAt = (th) => {
    let r = base * (1
      + amp * Math.cos(lobes * th + p1)
      + amp * 0.55 * Math.cos((lobes + 2) * th + p2)
      + amp * 0.35 * Math.cos((lobes * 2 + 1) * th + p3));
    for (let i = 0; i < biteAt.length; i++) {
      let dth = th - biteAt[i];
      dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      r -= base * biteDepth * Math.exp(-(dth * dth) / (biteWidth * biteWidth));
    }
    return Math.min(r, rMax);
  };
  lobeMask.lastRadiusAt = radiusAt;

  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ny = ((y + 0.5) / h) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = ((x + 0.5) / w) * 2 - 1;
      const rad = Math.hypot(nx, ny);
      const R = radiusAt(Math.atan2(ny, nx));
      const a = 1 - smoothstep(R * (1 - softness), R, rad);
      const i = (y * w + x) * 4 + 3;
      d[i] = d[i] * a;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Bleed the nearest opaque colour outward into every transparent texel.
 *
 * This is the fix for "isolated dark sprites in the sky" and "black speckles inside the
 * canopy", and it is a property of the mip chain, not of the art.
 *
 * Every paint function here starts from `clearRect`, so an untouched texel is
 * `rgba(0,0,0,0)`, and `feather()` only ever scales alpha — it never writes RGB. Three
 * uploads these with `generateMipmaps = true` and no premultiply, so the driver box-filters
 * RGB and A *independently*. A mip texel that is 30% covered therefore comes out as
 * `0.30 * leafColour` with `alpha = 0.30` — the alpha still clears `alphaTest` (0.14 on the
 * bamboo card, 0.36 on blossom) while the colour has been multiplied 0.30 toward black.
 * Measured in the shipped valley frame: the isolated specks over the canopy read
 * RGB 72.9, 61.7, 41.7 against a canopy body of 164.3, 154.9, 122.6 in the same shot —
 * the same hue at 0.44x the value, which is a scalar darkening, not a shaded leaf. At
 * 250 m through `fogDensity` 0.0088 a real leaf cannot be darker than the sky at all.
 *
 * Filling the transparent RGB with the nearest opaque colour makes that average colour-
 * correct at every level. The alpha channel is not touched, so the cutout silhouette is
 * bit-identical and no card changes shape.
 *
 * Two raster sweeps (a chamfer distance transform carrying the nearest opaque texel's
 * index) rather than an iterative flood: the deep mips average over the *whole* card, so a
 * few passes of neighbour-bleed would still be filtering against black out in the corners.
 * O(w*h), about 12 ms on a 512x1024 sheet.
 */
function dilateAlpha(canvas, threshold = 8) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const src = new Int32Array(n).fill(-1);
  const dist = new Float32Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] >= threshold) { src[i] = i; dist[i] = 0; }
  }

  // Two 3x3 chamfer sweeps, written out rather than through a helper: this runs over
  // ~2.6 M texels at boot and a closure call per neighbour is most of the cost.
  const D = 1.4142;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      let bd = dist[i];
      if (bd === 0) continue;
      let bs = src[i];
      let j, nd;
      if (x > 0) { j = i - 1; if (src[j] >= 0 && (nd = dist[j] + 1) < bd) { bd = nd; bs = src[j]; } }
      if (y > 0) {
        j = i - w; if (src[j] >= 0 && (nd = dist[j] + 1) < bd) { bd = nd; bs = src[j]; }
        if (x > 0) { j = i - w - 1; if (src[j] >= 0 && (nd = dist[j] + D) < bd) { bd = nd; bs = src[j]; } }
        if (x < w - 1) { j = i - w + 1; if (src[j] >= 0 && (nd = dist[j] + D) < bd) { bd = nd; bs = src[j]; } }
      }
      dist[i] = bd; src[i] = bs;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x;
      let bd = dist[i];
      if (bd === 0) continue;
      let bs = src[i];
      let j, nd;
      if (x < w - 1) { j = i + 1; if (src[j] >= 0 && (nd = dist[j] + 1) < bd) { bd = nd; bs = src[j]; } }
      if (y < h - 1) {
        j = i + w; if (src[j] >= 0 && (nd = dist[j] + 1) < bd) { bd = nd; bs = src[j]; }
        if (x < w - 1) { j = i + w + 1; if (src[j] >= 0 && (nd = dist[j] + D) < bd) { bd = nd; bs = src[j]; } }
        if (x > 0) { j = i + w - 1; if (src[j] >= 0 && (nd = dist[j] + D) < bd) { bd = nd; bs = src[j]; } }
      }
      dist[i] = bd; src[i] = bs;
    }
  }
  for (let i = 0; i < n; i++) {
    if (dist[i] === 0) continue;
    const s = src[i];
    // A wholly empty sheet leaves src at -1; leave those texels alone rather than
    // reading index -1 and writing NaN-adjacent garbage into the atlas.
    if (s < 0) continue;
    d[i * 4] = d[s * 4];
    d[i * 4 + 1] = d[s * 4 + 1];
    d[i * 4 + 2] = d[s * 4 + 2];
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Blur the alpha channel only, by `r` texels.
 *
 * A canvas fill lays down a one-texel alpha step at every bezier edge. Against
 * `alphaTest` that step is the silhouette, so a petal edge is a hard staircase with
 * nothing for the mip chain to resolve into — the "crunchy 1-pixel alpha cutoff" the
 * review names on the sakura cards. Softening alpha (and only alpha) gives the cutoff a
 * gradient to land on at every mip level, without moving any colour.
 */
function softenAlpha(canvas, r = 1) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const a = new Float32Array(w * h);
  const t = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const k = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let o = -r; o <= r; o++) s += a[y * w + clamp(x + o, 0, w - 1)];
      t[y * w + x] = s / k;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let o = -r; o <= r; o++) s += t[clamp(y + o, 0, h - 1) * w + x];
      d[(y * w + x) * 4 + 3] = s / k;
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

/**
 * Grass clump silhouette for the far LOD card — grass LOD2 and the basin's far cover.
 *
 * The root stop is the one number in here that decides whether the layer reads as a plant
 * or as dirt shadow. Deterministic A/B on the round-17 review build (engine stopped, grain
 * phase re-seeded, `far-cover` hidden) puts that layer at 5.62% of the critic's `wide` box
 * with a mean of sRGB 25.0, 25.6, 27.3 — luma 25.6, BLUE-leading — against the rest of the
 * box at 49.7, 42.9, 41.9. Blue-leading is the tell: at 30-45 m Sky's near-air term is
 * about 9% opacity over a fog colour near linear 0.3, and the card's own radiance was so
 * low (root stop 30,44,24 = linear 0.012, 0.027, 0.008, then averaged over the whole card
 * by the mip chain) that the haze was contributing several times more than the plant. A
 * card cannot be tinted out of that — KAG_TINT_MODULATE divides the instance tint by its
 * own luminance, so `shade` here is a pure hue rotation — so the value has to come from
 * the sheet.
 */
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
    // 30,44,24 -> 62,92,46: still the darkest thing on the sheet and still G-leading by
    // more than R and B (which is what makes an ambient-lit card come out green under a
    // key that cannot), but 2.9x the linear radiance, so the near-air haze is a haze over
    // a plant rather than the plant's dominant light path. The stop at 0.35 is unchanged,
    // so the blade's own value ramp is untouched above the root.
    grad.addColorStop(0, 'rgba(62,92,46,1)');
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
 * A mid-distance spray is one connected branch mass, not a fan of metre-long leaves.
 * At the card's 20-40 px working size an isolated leaf cannot resolve botanically; it
 * becomes the horizontal dash the skyline review counted. The round-capped armature stays
 * above the 0.14 alpha cutoff through mip 4 and every blade overlaps that armature, so the
 * cluster can simplify into one crown shape instead of breaking into independent flecks.
 */
function drawBambooCardSpray(g, len, colA, colB, droop, leafCount, anchorWidth, rnd, widthGain = 1) {
  const bx = len * 0.58;
  const by = len * droop * 0.28;
  g.strokeStyle = colA;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = anchorWidth * widthGain;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(bx * 0.48, by * 0.18, bx, by);
  g.stroke();

  const count = Math.max(3, leafCount | 0);
  for (let i = 0; i < count; i++) {
    const t = 0.06 + (i / Math.max(1, count - 1)) * 0.86;
    const u = 1 - t;
    const x = 2 * u * t * bx * 0.48 + t * t * bx;
    const y = 2 * u * t * by * 0.18 + t * t * by;
    const side = (i & 1) ? -1 : 1;
    const a = side * (0.24 + rnd() * 0.34) + (rnd() - 0.5) * 0.12;
    const l = len * (0.34 + rnd() * 0.22) * (1.0 - t * 0.18);
    const w = l * (0.14 + rnd() * 0.035) * widthGain;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    drawDroopLeaf(g, l, w, colA, colB, 0.36 + rnd() * 0.24);
    g.restore();
  }
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
/**
 * `culms` and `spread` are the density knobs, and they are the ones that may be raised.
 *
 * A card is four triangles and one draw call's worth of instance data whatever is painted
 * on it, so coverage bought inside the cell is free and coverage bought by adding instances
 * is not. The review measured "more than half the hillside surface is bare pink-brown dirt
 * showing between squat, near-identical clumps": these counts are up 1.6-2x and the spreads
 * roughly 1.5x, so one card now closes about 2.4x the silhouette area it did.
 *
 * `bow` is capped hard. The review reads a 20-40 degree lean as broken rather than
 * windblown and asks for ~8 degrees; the card is planted at width = 0.62 x height, so a bow
 * of `b` cell-widths is `atan(0.62 b)` off vertical — 0.13 is 4.6 degrees and is the most
 * any archetype now carries. The rest of the motion is bend, from the wind shader.
 */
/**
 * `sprayLen` is up 1.7x and `leafFrom` is down across the board, and both are answering a
 * measurement rather than a taste. At the band's working size a card is roughly 43 px wide
 * and 72 px tall in a phone review frame, drawn from a 128x256 cell — so the old
 * `sprayLen 0.082` put a whole leaf cluster inside 6 screen pixels and an individual blade
 * inside 2 px by 0.4 px. A 0.4 px blade does not minify, it *averages*: its alpha falls
 * under the 0.14 cutoff two mip levels before the culm's does, so what reaches the frame is
 * the culm and nothing else. The culm strokes were already sized to survive that
 * (`wid` 3.4-5.6% of cell width, i.e. 1.5-2.4 px) — which is why round 15 measured a field
 * of "blunt yellow-olive stubs" and no canopy anywhere in the mass.
 *
 * Everything that has to read at range therefore has to be authored at range's scale. A
 * spray is now 12-16 px on screen with 2-4 px blades, and `drawBambooCardSpray` is run
 * twice per node — once wide as a connected mass, once narrow for the blade structure over
 * it — so the cluster still has a leaf outline at arm's length and still has *alpha* at
 * 200 m. Cost is canvas time at boot; the card stays four triangles.
 */
const BAMBOO_ARCHETYPES = [
  /** 0 — young grove: visible leaders, with crown mass below every leader tip. */
  { culms: 11, hMin: 0.68, hMax: 0.94, bow: 0.03, leafFrom: 0.44, sprays: 6, sprayLen: 0.132, spread: 0.34, hScale: 1.14 },
  /** 1 — mature stand: the default read; heavy sprays over the top half. */
  { culms: 14, hMin: 0.52, hMax: 0.91, bow: 0.06, leafFrom: 0.36, sprays: 7, sprayLen: 0.140, spread: 0.42, hScale: 1.00 },
  /** 2 — edge clump: culms leaning off the slope, long weeping sprays below horizontal. */
  { culms: 10, hMin: 0.52, hMax: 0.86, bow: 0.08, leafFrom: 0.30, sprays: 7, sprayLen: 0.150, spread: 0.38, hScale: 0.92 },
  /** 3 — understorey: short, bushy, sprays right down to the ground. */
  { culms: 13, hMin: 0.30, hMax: 0.62, bow: 0.07, leafFrom: 0.16, sprays: 8, sprayLen: 0.128, spread: 0.46, hScale: 0.72 },
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
      // Width at the ROOT. A clump card is 20-40 px tall where the band is actually read,
      // so a culm at 2% of the cell width is a sub-pixel line that mipmaps straight out of
      // the silhouette; the culm is the only thing that says bamboo rather than shrub, so
      // the base is drawn wider than scale strictly wants. `strokeCulm` tapers from here to
      // 42% at the tip, so the readable lower stem is unchanged and the part that stands
      // against sky — which round 15 called a blunt stub — is the part that narrows.
      wid: w * (0.034 + rnd() * 0.022),
      // Far culms sit back in the haze; near ones catch the light. The old 0.62 floor put
      // the back half of every clump at 62% value before the sun even touched it, which is
      // most of why the band read as a dark mass rather than a canopy.
      shade: 0.74 + depth * 0.26,
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

  // Quantised attachment bands keep the sprays distributed up each culm. Do not paint
  // node collars at this LOD: the 4-9 texel horizontal strokes survive alphaTest after
  // the culm behind them is depth-occluded, so thousands of crossed cards turn them into
  // detached 2-18 px skyline dashes. Near bamboo still carries explicit node geometry;
  // here the pale culm, vertical rim and attached crown are the readable bamboo cues.
  // `nI` runs to `sprayBands` inclusive below, so a cluster lands at t = 1.0 — on the tip.
  // It used to stop at 8/9, leaving the top eleven per cent of every culm a bare pale
  // stroke ending in its own round cap. That is the "flat cut-off tops, no taper, no leaf
  // canopy" the review filed: the tallest thing in the clump, standing against sky, with
  // nothing on it.
  const sprayBands = 9;
  // The culm is a TAPERED polygon, not a constant-width stroke.
  //
  // Round 15: "short, blunt, disconnected vertical yellow-olive STUBS ... with flat cut-off
  // tops, no taper". Both halves of that are authored here. The stroke ran at one lineWidth
  // from root to tip, and on the dumped 256x512 cell that is a 9-14 texel bar of uniform
  // width — a fence post, not a culm, and the widest contiguous high-alpha structure on the
  // sheet, so it is also the last thing standing when the mip chain has averaged the 2-4
  // texel blades under the 0.14 cutoff. Tapering to 42% at the tip narrows exactly the part
  // that stands against sky, which is where the crown has to win.
  //
  // `fadeTop` is for the front re-stroke pass: a stem laid over the finished crown has to
  // dissolve into it rather than end on a cut, and canvas has no per-vertex alpha, so the
  // ramp lives in the fill gradient's own stops.
  const strokeCulm = (cu, alpha, fadeTop = 1) => {
    const pts = cu.pts;
    const k = cu.shade;
    const halfAt = (t) => cu.wid * 0.5 * (1 - 0.58 * Math.pow(t, 0.85));
    g.globalAlpha = alpha;
    // Still pale — a backlit culm at magic hour is near luma 200 and that is the cue that
    // says bamboo rather than shrub. But shifted off the warm axis: GREEN_RATIO's key is
    // (1.0, 0.412, 0.134), so an albedo at g/r 1.03 (the old 216,222,168) renders warmer
    // than anything else in the mid-ground however pale it is, and the review measured
    // exactly that — meanRGB 182.7,159.8,112.8 with R over G in every luma band of the
    // valley box. These stops sit at g/r 1.14-1.20, which does not make a lit culm green
    // (nothing under 2.43 can be) but stops it being the frame's most saturated khaki.
    const fade = (t) => (fadeTop >= 1 ? 1 : 1 - smoothstep(fadeTop * 0.62, fadeTop, t));
    const stop = (v, r, gg, b) =>
      `rgba(${(r * k) | 0},${(gg * k) | 0},${(b * k) | 0},${fade(v).toFixed(3)})`;
    const grad = g.createLinearGradient(0, base, 0, base - cu.len);
    grad.addColorStop(0, stop(0, 64, 88, 44));
    grad.addColorStop(0.35, stop(0.35, 138, 164, 92));
    grad.addColorStop(0.70, stop(0.70, 178, 206, 128));
    grad.addColorStop(1, stop(1, 196, 224, 150));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(pts[0][0] - halfAt(0), pts[0][1]);
    for (let s = 1; s <= steps; s++) g.lineTo(pts[s][0] - halfAt(pts[s][2]), pts[s][1]);
    for (let s = steps; s >= 0; s--) g.lineTo(pts[s][0] + halfAt(pts[s][2]), pts[s][1]);
    g.closePath();
    g.fill();
    // Round the tip off, or the taper still ends on a horizontal cut — just a narrower one.
    g.beginPath();
    g.arc(pts[steps][0], pts[steps][1], Math.max(0.5, halfAt(1)), 0, Math.PI * 2);
    g.fill();

    // A specular-ish rim down the sunward side; a cylinder needs one to stop reading flat.
    const rim = g.createLinearGradient(0, base, 0, base - cu.len);
    rim.addColorStop(0, `rgba(${(232 * k) | 0},${(248 * k) | 0},${(196 * k) | 0},${(0.42 * fade(0)).toFixed(3)})`);
    rim.addColorStop(1, `rgba(${(232 * k) | 0},${(248 * k) | 0},${(196 * k) | 0},${(0.42 * fade(1)).toFixed(3)})`);
    g.strokeStyle = rim;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1, cu.wid * 0.24);
    g.beginPath();
    g.moveTo(pts[0][0] + cu.wid * 0.24, pts[0][1]);
    for (let s = 1; s <= steps; s++) g.lineTo(pts[s][0] + halfAt(pts[s][2]) * 0.48, pts[s][1]);
    g.stroke();
    g.globalAlpha = 1;
  };

  for (const cu of culms) {
    strokeCulm(cu, 1);
    for (let nI = 1; nI <= sprayBands; nI++) {
      const t = nI / sprayBands;
      if (t < spec.leafFrom) continue;
      const p = cu.pts[Math.min(steps, Math.round(t * steps))];
      spraysAt.push([p[0], p[1], t, cu.shade, cu.phase]);
    }
  }

  // Leaf sprays over every culm, so the canopy closes across the clump.
  //
  // Two passes per node, and the first one is the one that reaches the review frame. The
  // MASS pass draws the same branch with blades 2.15x wide and a deeper green; the DETAIL
  // pass draws normal blades over it. At arm's length the eye reads the detail pass and the
  // mass is just the shaded interior of the cluster; two mip levels down the detail has
  // averaged away and the mass is still above the 0.14 cutoff, so the clump thins toward a
  // leafy silhouette instead of collapsing to bare culms. One pass at either width cannot
  // do both jobs — that is the whole finding.
  for (const [sx, sy, t, k, phase] of spraysAt) {
    const side = rnd() < 0.5 ? -1 : 1;
    const a = 0.56 + rnd() * 0.72;
    const len = h * spec.sprayLen * (0.82 + rnd() * 0.36) * (0.82 + t * 0.30);
    const shade = k * (0.78 + rnd() * 0.30);
    // g/r of 4.99 and 3.45 in linear — comfortably over GREEN_RATIO's 2.43, so these are
    // the only pixels on the card that can still be green-dominant once the amber key is
    // through them. The cured-yellow minority is down from 18% to 9% and its own g/r is up
    // from 0.95 to 1.06: at 18% it was a fifth of the canopy pulling the wrong way.
    const cA = `rgb(${(46 * shade) | 0},${(114 * shade) | 0},${(38 * shade) | 0})`;
    const cB = rnd() < 0.09
      ? `rgb(${(180 * shade) | 0},${(192 * shade) | 0},${(98 * shade) | 0})`
      : `rgb(${(102 * shade) | 0},${(194 * shade) | 0},${(74 * shade) | 0})`;
    const mA = `rgb(${(34 * shade) | 0},${(88 * shade) | 0},${(30 * shade) | 0})`;
    const mB = `rgb(${(66 * shade) | 0},${(148 * shade) | 0},${(52 * shade) | 0})`;
    const leaves = Math.max(4, Math.round(spec.sprays * (0.72 + rnd() * 0.22)));
    const anchor = Math.max(2, w * 0.012);
    g.save();
    g.translate(sx + (rnd() - 0.5) * w * 0.006, sy + (rnd() - 0.5) * h * 0.002);
    if (side < 0) g.scale(-1, 1);
    g.rotate(a);
    drawBambooCardSpray(g, len * 0.92, mA, mB, 0.46 + phase * 0.10, leaves, anchor, rnd, 2.15);
    drawBambooCardSpray(g, len, cA, cB, 0.46 + phase * 0.10, leaves, anchor, rnd, 1.0);
    g.restore();
  }

  // The nearest two culms again, in front of the foliage, and only over their lower 70%. A
  // stand seen from outside always has stems crossing the leaf mass, and those pale
  // verticals are the entire reason this silhouette says "bamboo" at 120 m rather than
  // "dark shrub" — but re-stroking all three full length put the pale khaki back on top of
  // the crown that has to close, which is a third of why the card measures R over G.
  for (let i = culms.length - 1; i >= Math.max(0, culms.length - 2); i--) strokeCulm(culms[i], 0.82, 0.74);

  // A rooted understorey band across the whole cell width, over the bottom 18%.
  //
  // This is the part of the density note that a wider scatter cannot fix. A row of clump
  // cards standing on a slope closes at canopy height and stays open at the ankles, because
  // every archetype's culms converge toward the middle of its own cell — so the eye reads a
  // continuous strip of lit ground running under the whole band, which is the "bare
  // pink-brown dirt" measurement. Litter and low blades at the foot of the card close that
  // strip for free: it is the cheapest coverage on the sheet, since the base is also where
  // neighbouring cards overlap most.
  // The old litter loop placed its leaf *base* at a random height in this strip. Several
  // survived alphaTest as islands (including two at mip 4) because nothing joined them to
  // the soil. A narrow organic skirt makes every low blade share one root mass; it lives
  // below the skyline and costs no extra geometry or overdraw beyond the card already here.
  const bandTop = h * 0.84;
  const skirt = g.createLinearGradient(0, bandTop, 0, h);
  skirt.addColorStop(0, 'rgba(42,92,34,0.84)');
  skirt.addColorStop(1, 'rgba(26,52,22,1)');
  g.fillStyle = skirt;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h * 0.940);
  const skirtSteps = 28;
  for (let i = 0; i <= skirtSteps; i++) {
    const x = (i / skirtSteps) * w;
    // Above the shortest rooted blade's shoulder, so minification cannot sever a blade
    // one pixel before it reaches the shared base.
    const y = h * (0.915 + rnd() * 0.025);
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();

  for (let i = 0; i < 64; i++) {
    const bx = rnd() * w;
    const len = h * (0.035 + rnd() * 0.050);
    const lean = (rnd() - 0.5) * len * 0.72;
    const wid = Math.max(1.5, len * (0.08 + rnd() * 0.05));
    const tipY = h - len;
    const shade = 0.58 + rnd() * 0.40;
    g.fillStyle = rnd() < 0.28
      ? `rgb(${(178 * shade) | 0},${(160 * shade) | 0},${(88 * shade) | 0})`
      : `rgb(${(74 * shade) | 0},${(156 * shade) | 0},${(58 * shade) | 0})`;
    g.beginPath();
    g.moveTo(bx - wid, h);
    g.quadraticCurveTo(bx + lean * 0.35 - wid * 0.3, h - len * 0.58, bx + lean, tipY);
    g.quadraticCurveTo(bx + lean * 0.35 + wid * 0.3, h - len * 0.58, bx + wid, h);
    g.closePath();
    g.fill();
  }

  speckle(g, w, h, 0.24, seed ^ 0x5f5f);
  // Sides only: the base has to reach the card's bottom edge or the clump hovers, and the
  // tops already stop well short of the frame.
  //
  // The side ramp starts at 0.72, not 0.58. The archetype spreads above put outer culms at
  // |nx| up to 0.75, and at the old start those stems were multiplied down to 55% alpha —
  // i.e. the extra width was painted and then feathered back off, and the clump kept the
  // same narrow silhouette it had before. 0.72 leaves a 28%-of-half-width ramp, which is
  // still 3x the mip footprint at the distance this card is read.
  const gi = g.getImageData(0, 0, w, h);
  const d = gi.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = Math.abs(((x + 0.5) / w) * 2 - 1);
      const ny = ((y + 0.5) / h) * 2 - 1;          // -1 canvas top, +1 canvas bottom
      const a = Math.pow(1 - smoothstep(0.72, 1.0, nx), 1.35) *
        Math.pow(1 - smoothstep(0.84, 1.0, -ny), 1.2);
      const i = (y * w + x) * 4 + 3;
      d[i] *= a;
    }
  }
  g.putImageData(gi, 0, 0);
  return c;
}

/**
 * The four archetypes packed 4x1 — one ROW, never a 2x2 grid. That layout is the whole
 * point of this function and it is not a packing preference.
 *
 * THE SKYLINE DASHES. Round 15 measured "roughly forty dark maroon dashes, 8-14 px long
 * and 3-4 px tall, strung through open sky along the bamboo canopy contour" in four of five
 * review frames. Round 8 had attributed them to a camera-boxed particle field. Both
 * attributions were tested at runtime against the shipped build at the `valley` pose:
 * disabling every Weather emitter (petals, leaves, embers, motes, rain) left the dash box
 * (51,94,405x117) at luma p1 85.6 -> 87.4 and detail 5.87 -> 5.66, i.e. unchanged; hiding
 * this card mesh alone took the same box to detail 2.15 with no dash visible anywhere.
 * The dashes are this sheet.
 *
 * The mechanism is the atlas seam. In the old 2x2 pack, cells 0 and 1 sat in UV row 0
 * (v 0..0.5) and cells 2 and 3 in row 1, so cell 0's TOP edge — the culm tips, which is
 * exactly the part of a card that stands against open sky — was one texel from cell 2's
 * BASE. `paintBambooClump` deliberately keeps that base **opaque edge to edge** (a rooted
 * skirt at `rgba(26,52,22,1)`, so the clump cannot appear to hover). The card samples
 * `vMapUv.y` up to the seam, bilinear filtering pulls ~50% of that opaque near-black skirt
 * across, 0.5 clears the 0.14 alpha test, and every row-0 card draws a dark horizontal bar
 * the width of its own crown along its top edge. The bar's length is the card width less
 * the 28% side ramp — about 13 px at the band's working size, which is the measured 8-14.
 *
 * Packed 4x1 there is no horizontal seam at all: every cell's top and bottom edges are the
 * texture's own edges under ClampToEdgeWrapping. The vertical seams that remain are between
 * cells whose outer 28% of width is already ramped to alpha 0, so what bleeds across them is
 * transparency.
 */
function paintBambooCard(cellW, cellH) {
  const c = newCanvas(cellW * 4, cellH);
  const g = c.getContext('2d');
  g.clearRect(0, 0, cellW * 4, cellH);
  for (let i = 0; i < 4; i++) {
    // Soften before compositing. Blurring the finished atlas crosses the cell boundaries
    // and copies one rooted base into its neighbour as a detached strip.
    const cell = softenAlpha(
      paintBambooClump(cellW, cellH, BAMBOO_ARCHETYPES[i], 0xBA0001 + i * 0x9E37), 2,
    );
    g.drawImage(cell, i * cellW, 0);
  }
  return c;
}

/**
 * The leaf cluster hung on a *near* culm (KAG_MODE 1). It shares the mid-ground card's
 * vocabulary — the same weeping blades and the same palette — so walking from the overlook
 * down into the sea never crosses a seam where the bamboo changes species.
 *
 * It is a *branch*, not a rosette. Two earlier versions both radiated their blades from a
 * single point: the first as fifteen straight lances (a thistle) and the second as
 * twenty-two drooping ones (a closed palmate dome). Ten of those tumbled around one culm
 * built a bottle-brush, because a rosette has no direction and stacking rosettes just
 * thickens a column. A real spray leaves the culm sideways and carries its blades along
 * its length with daylight between them, so a crown made of them has depth and an outline.
 */
function paintBambooLeaves(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(2205);

  // Canvas +y is down, and flipY carries that straight through to down on the card. The
  // branch leaves the attachment at the upper left and sweeps down and out to the right;
  // per-instance yaw spins that around the culm, so one asymmetric card is all it takes.
  // Kept inside r ~ 0.55 of centre because feather() starts eating alpha at 0.46.
  const ax = size * 0.24, ay = size * 0.22;
  const bx = size * 0.56, by = size * 0.34;      // quadratic control
  const tx = size * 0.78, ty = size * 0.62;      // tip
  const at = (t) => {
    const u = 1 - t;
    return [u * u * ax + 2 * u * t * bx + t * t * tx, u * u * ay + 2 * u * t * by + t * t * ty];
  };

  g.strokeStyle = 'rgba(150,162,98,0.9)';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1, size * 0.011);
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo(bx, by, tx, ty);
  g.stroke();

  const nodes = 9;
  for (let i = 0; i < nodes; i++) {
    const t = 0.06 + (i / (nodes - 1)) * 0.92;
    const [nx, ny] = at(t);
    // Ones and twos, not a comb: the gaps are what let the sky through a real crown.
    const blades = rnd() < 0.45 ? 2 : 1;
    for (let b = 0; b < blades; b++) {
      // Mostly below the twig; one in five cocked above it, or the spray reads as a rake.
      const up = rnd() < 0.20;
      const a = up ? -(0.18 + rnd() * 0.42) : (0.28 + rnd() * 0.95);
      // Blades shorten toward the tip — that taper is most of what reads as "a branch".
      const len = size * (0.30 - t * 0.15) * (0.76 + rnd() * 0.48);
      const wid = len * (0.085 + rnd() * 0.045);
      const shade = 0.72 + rnd() * 0.40;
      const cA = `rgb(${(52 * shade) | 0},${(116 * shade) | 0},${(44 * shade) | 0})`;
      const cB = rnd() < 0.16
        ? `rgb(${(198 * shade) | 0},${(188 * shade) | 0},${(104 * shade) | 0})`
        : `rgb(${(108 * shade) | 0},${(192 * shade) | 0},${(80 * shade) | 0})`;
      g.save();
      g.translate(nx, ny);
      g.rotate(a);
      drawDroopLeaf(g, len, wid, cA, cB, up ? 0.18 + rnd() * 0.28 : 0.45 + rnd() * 0.55);
      g.restore();
    }
  }
  speckle(g, size, size, 0.26, 771);
  return c;
}

/**
 * The sheet a whole near bamboo plant is drawn from: an OPAQUE bark strip on the left, the
 * alpha-cut leaf spray on the right (see PLANT_UV).
 *
 * The bark strip is the piece the critic was missing. It carries three things a per-instance
 * tint could never carry: the node rings that separate bamboo from a green pipe, the
 * green-at-the-base to straw-at-the-top gradient a mature moso actually has, and a cylinder
 * shading ramp that is *dark at both edges*. That last one does two jobs — it stops the
 * culm silhouetting brighter than the sky it stands against, and because both ends of the
 * strip are dark the tube's wrap seam disappears.
 */
function paintBambooPlant(size) {
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const rnd = makeRandom(0x3AC012);

  // Fill past PLANT_UV.culmU1 all the way to the leaf card's edge: the surplus is opaque
  // gutter, so the mip chain has bark to bleed *into* rather than transparency to bleed
  // out of. Bark that alpha-tests away at range is exactly how leaves end up orphaned.
  const stripW = Math.max(2, Math.round(size * 0.27));
  const uSpan = PLANT_UV.culmU1 - PLANT_UV.culmU0;

  for (let x = 0; x < stripW; x++) {
    // Where this column sits across the visible strip, saturating outside it.
    const u = clamp(((x + 0.5) / size - PLANT_UV.culmU0) / uSpan, 0, 1);
    // Lambert-ish across a cylinder, keyed a third of the way round so the culm has a lit
    // side and a shadow side rather than a symmetric highlight.
    //
    // The floor is high on purpose. A culm is 2-3 px wide at the far edge of its own fade
    // window, so almost every texel a distant one samples comes from the *edges* of this
    // ramp, and a ramp that reaches 0.34 at its edges averages a thin backlit culm down to
    // a black hairline. §5.10 wants silhouette readability and the culm is the one thing
    // in the mid-ground that may not go to black. 0.52 keeps the shading gradient a real
    // gradient while putting the mean where a pale straw stem belongs; both ends still
    // match, which is what hides the tube's wrap seam.
    const round = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u * 0.88 + 0.06, 0, 1))), 0.85);
    const k = 0.52 + 0.48 * round + 0.18 * Math.exp(-Math.pow((u - 0.36) / 0.13, 2));
    const grad = g.createLinearGradient(0, size, 0, 0);
    // v = 0 is the canvas bottom under flipY, which is the base of the culm.
    grad.addColorStop(0.00, `rgb(${(72 * k) | 0},${(94 * k) | 0},${(46 * k) | 0})`);
    grad.addColorStop(0.30, `rgb(${(112 * k) | 0},${(136 * k) | 0},${(64 * k) | 0})`);
    grad.addColorStop(0.66, `rgb(${(168 * k) | 0},${(178 * k) | 0},${(104 * k) | 0})`);
    grad.addColorStop(1.00, `rgb(${(214 * k) | 0},${(210 * k) | 0},${(150 * k) | 0})`);
    g.fillStyle = grad;
    g.fillRect(x, 0, 1, size);
  }

  // Node rings. Sixteen reads as segmented at arm's length and still leaves a visible tick
  // every few pixels once the culm is 200 px tall in frame, which is where the overlook
  // composes it. A dark groove with a pale collar just above is the whole trick.
  const nodes = 16;
  for (let n = 1; n < nodes; n++) {
    const v = n / nodes;
    const y = Math.round((1 - v) * size);
    const k = 0.55 + 0.45 * v;
    g.fillStyle = `rgba(${(48 * k) | 0},${(58 * k) | 0},${(28 * k) | 0},0.62)`;
    g.fillRect(0, y, stripW, Math.max(1, size * 0.006));
    g.fillStyle = `rgba(${(232 * k) | 0},${(230 * k) | 0},${(178 * k) | 0},0.42)`;
    g.fillRect(0, y - Math.max(1, size * 0.009), stripW, Math.max(1, size * 0.005));
    // A sheath scar: a couple of short flecks below the node, never a clean machined band.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${(96 * k) | 0},${(96 * k) | 0},${(58 * k) | 0},${0.14 + rnd() * 0.2})`;
      g.fillRect(rnd() * stripW, y + size * 0.008 + rnd() * size * 0.02,
        Math.max(1, size * 0.02), Math.max(1, size * 0.004));
    }
  }

  // Lengthwise fibre. Without it the strip is a smooth gradient and §5.9 forbids that.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * stripW;
    const y0 = rnd() * size;
    g.strokeStyle = rnd() < 0.5
      ? `rgba(40,52,26,${0.05 + rnd() * 0.14})`
      : `rgba(226,224,178,${0.05 + rnd() * 0.12})`;
    g.lineWidth = Math.max(1, size * 0.004);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rnd() - 0.5) * size * 0.008, y0 + rnd() * size * 0.28); g.stroke();
  }

  // The leaf spray, feathered on its own square so the card can never show its quad, then
  // laid into the right-hand region.
  const leaf = feather(paintBambooLeaves(size), { inner: 0.44, power: 1.30 });
  const lx = Math.round(size * 0.29);
  g.drawImage(leaf, lx, 0, size - lx, size);

  return c;
}

/**
 * One five-petal floret with a real throat. Each petal is a notched teardrop with a bright
 * outer edge and a deeper blush at the base, so a cluster has internal structure at any
 * size instead of being a flat fill with a ragged alpha edge.
 */
function drawFloret(g, r, edge, mid, throat, rnd, boss = true) {
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
  // Stamens: a warm centre is what stops the floret reading as a paper punch-out — but
  // only on the florets that face the viewer. Drawn on all of them it is a fixed-radius
  // disc repeated 72 times per card, which is the motif the review counted.
  if (!boss) return;
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
  //
  // Confined to the core, and that is the whole point. These used to run to 0.40 of the
  // canvas — 0.80 in the half-card units `lobeMask` works in — against an alpha cut that
  // sits between 0.418 and 0.897, so on every card the outer third of a twig was drawn
  // *at or past* the blossom's own outline: a hard, straight, unlit dark line leaving the
  // pink mass at a random angle, times six per card, times every card in the crown. That
  // is the review's "hard straight dark spikes radiating out of the blossom mass ... which
  // at a glance reads as pine needles stuck into a pink cloud", and it is authored here
  // rather than in the tree's branch mesh.
  //
  // Origin offset 0.03 and reach 0.155 put the far end of the longest twig at 0.37 in
  // half-card units, strictly inside the 0.447 minimum of the mask — so no twig texel can
  // reach the silhouette from any direction, at any bite angle. The armature still reads:
  // it is what the florets are hung on, and it is visible *through* the mass, which is the
  // "branch structure reading through" the review asks for.
  g.strokeStyle = 'rgba(78,60,52,0.72)';
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.7;
    g.lineWidth = Math.max(1, size * (0.013 - i * 0.0012));
    g.beginPath();
    g.moveTo(cx, cy + size * 0.03);
    g.quadraticCurveTo(cx + Math.cos(a) * size * 0.08, cy + Math.sin(a) * size * 0.08,
      cx + Math.cos(a) * size * 0.155, cy + Math.sin(a) * size * 0.155);
    g.stroke();
  }

  // A blush underlay that deliberately stays *below* the 0.36 alpha test on its own: it
  // only survives where a floret has already laid alpha over it, so it fills the pinholes
  // between overlapping flowers without ever becoming a pink disc with a hard rim.
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46);
  // Widened along R-G with the floret stops below, and for the same reason: this underlay
  // fills the pinholes between overlapping flowers, so its hue is a real fraction of the
  // card's mean and an orange one drags the mass back to brick whatever the petals do.
  halo.addColorStop(0, 'rgba(254,196,214,0.30)');
  halo.addColorStop(0.55, 'rgba(246,168,196,0.22)');
  halo.addColorStop(1, 'rgba(232,142,168,0.0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(cx, cy, size * 0.46, 0, Math.PI * 2); g.fill();

  // Florets on a radial density profile: biased inward, so count per unit area falls off
  // smoothly outward and the silhouette dissolves into individual flowers at the rim.
  // That falloff *is* the cluster's internal structure — the previous card had nine
  // scattered blobs and then a feather pass cutting a ragged hole out of the result.
  //
  // Three sub-clumps rather than one radial mass. A single radially-graded disc of florets
  // has a convex outline by construction, and a crown built out of convex cards is the
  // "pink cauliflower" — no amount of card count adds a concavity that none of the cards
  // has. Hanging the florets off three centres puts real gaps between the lobes, so the
  // card's own silhouette has notches in it and a crown of them can show sky between
  // clumps. It is also what a cherry actually does: blossom comes in bunches on spurs.
  const clumps = [];
  for (let i = 0; i < 3; i++) {
    const ca = ((i + rnd() * 0.55) / 3) * Math.PI * 2;
    const cr = size * (0.10 + rnd() * 0.06);
    clumps.push([cx + Math.cos(ca) * cr, cy + Math.sin(ca) * cr]);
  }
  const florets = 72;
  for (let f = 0; f < florets; f++) {
    const t = Math.pow(rnd(), 0.70);              // 0 at the clump core, 1 at its rim
    const a = rnd() * Math.PI * 2;
    const rad = t * size * 0.215;
    const home = clumps[(rnd() * clumps.length) | 0];
    const px = home[0] + Math.cos(a) * rad;
    const py = home[1] + Math.sin(a) * rad;
    // Radius spread widened from 1.9:1 to 3.4:1, with a heavy tail toward the small end.
    // 72 rosettes cut to within 20% of one radius is what the review measured as "one
    // repeating ~12 px pink circle motif ... bubble wrap": a repeated motif reads as a
    // repeat because it is the same SIZE, before it is the same shape. `pow(rnd, 2.1)`
    // puts most florets small and a handful large, which is what a real cluster does.
    const r = size * (0.078 - t * 0.028) * (0.42 + Math.pow(rnd(), 2.1) * 1.30);
    // One in six has gone over: bone, not brown. Kept as a minority accent so the mean
    // stays blush instead of being dragged grey the way a third of them did.
    const spent = rnd() < 0.16;
    const k = 0.90 + rnd() * 0.16;
    // The axis this card kept being retuned along was the wrong one, and both ends of it
    // have now been measured in frame.
    //
    // Round 7's stops ran B over G by 12-32 and the crown measured (137.1, 94.4, 107.8) —
    // B/R 0.786, which is *exactly* the >= 0.78 a later review asked for, and it was still
    // called a violet-grey. Round 8 answered by putting G above B by 6-16, and the crown
    // measured (84.8, 50.0, 48.3) at the lit cluster — B/R 0.570, which the next review
    // called brick. Neither reading is about blue. Round 7's card had R-G of only 42.7 on
    // a 137 red; round 8's has 34.8 on an 84.8 red. Both are *low chroma*, and a low-chroma
    // pale carries whatever hue the illuminant hands it: grey-violet under the fill, brick
    // under a B/R-0.134 key.
    //
    // So the axis is R-G, not G-B. Every stop below widens R-G (throat 82 -> 100, mid 57 ->
    // 72, edge 25 -> 39) and puts B back above G by 16-36, which is where sakura actually
    // sits — #ffb7c5 is B over G by 14 on a 72-wide R-G. Mean albedo over the floret area
    // moves (246.7, 199.4, 187.3) -> (244.7, 184.2, 205.6): B/R 0.759 -> 0.840, R-G 47.3 ->
    // 60.5. Reaching the review's own 0.78 target in frame would need a mean albedo B/R of
    // 0.96 *after* the 0.927 the sacred tree's own 0xf6e2e4 multiplier costs, i.e. B >= R in
    // the paint — lilac, not blossom. That last stretch is not available from albedo; see
    // the shading measurement in the round-9 foliage report.
    const edge = spent ? `rgba(${(243 * k) | 0},${(228 * k) | 0},${(226 * k) | 0},0.95)`
      : `rgba(${(255 * k) | 0},${(216 * k) | 0},${(232 * k) | 0},0.98)`;
    const mid = spent ? `rgba(${(233 * k) | 0},${(208 * k) | 0},${(208 * k) | 0},0.94)`
      : `rgba(${(250 * k) | 0},${(178 * k) | 0},${(205 * k) | 0},0.97)`;
    const throat = spent ? `rgba(${(212 * k) | 0},${(178 * k) | 0},${(182 * k) | 0},0.92)`
      : `rgba(${(232 * k) | 0},${(132 * k) | 0},${(168 * k) | 0},0.95)`;
    g.save();
    g.translate(px, py);
    // Only a third of the florets are drawn face-on with a full stamen boss. The rest are
    // seen at an angle — squashed on one axis and turned — so the card stops being a field
    // of identical discs. `drawFloret`'s boss was on every one of the 72, which is the
    // literal source of the repeated circle.
    g.rotate(rnd() * Math.PI * 2);
    g.scale(1, 0.42 + rnd() * 0.58);
    drawFloret(g, r, edge, mid, throat, rnd, rnd() < 0.34);
    g.restore();
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

  // --- plume ----------------------------------------------------------------
  // A plume is a *spray of separate filaments*, and it has to stay one at every distance,
  // because the alternative is what shipped: a filled cream lozenge measured at (134, 111,
  // 106) with an internal luma standard deviation of 5.3 and a hard rectangular-ish edge —
  // "spilled paint", correctly. Two things caused that. Two hundred and twenty short
  // strokes at alpha 0.34-0.78 packed into a third of the card averaged to solid coverage
  // the moment the card was minified, and the material's transmission then clipped on the
  // FRAGMENT_SSS ceiling, which replaces every surviving fragment with the same constant.
  //
  // So: fewer, longer, thinner filaments, radiating from a real rachis, with an explicit
  // radial alpha falloff, and roughly a third of them dark. The dark ones are what give
  // the plume internal value structure that survives a mip level.
  const px0 = size * 0.30, pw = size * 0.70;
  const cxP = px0 + pw * 0.5;
  g.lineCap = 'round';

  // The rachis first, so filaments read as leaving something.
  g.strokeStyle = 'rgba(158,148,100,0.8)';
  g.lineWidth = Math.max(1, size * 0.009);
  g.beginPath(); g.moveTo(cxP, size); g.quadraticCurveTo(cxP + size * 0.03, size * 0.55, cxP + size * 0.05, size * 0.10); g.stroke();

  for (let i = 0; i < 120; i++) {
    // Attachment along the rachis; the plume opens out toward its top.
    const t = Math.pow(rnd(), 0.75);
    const ax = cxP + size * 0.05 * t * t;
    const ay = size * (0.92 - t * 0.84);
    // Filaments sweep up and out, then nod over — a fountain, not a brush.
    const side = rnd() < 0.5 ? -1 : 1;
    const spread = (0.12 + t * 0.40) * pw * (0.35 + rnd() * 0.75) * side;
    const rise = size * (0.10 + rnd() * 0.22);
    const tipX = ax + spread, tipY = ay - rise + size * 0.03 * rnd();
    // Radial falloff, measured from the plume's own centre of mass: the outermost
    // filaments have to be able to disappear or the silhouette is the card again.
    const rN = Math.min(1, Math.hypot((tipX - cxP) / (pw * 0.5), (tipY - size * 0.46) / (size * 0.46)));
    const edge = Math.pow(1 - smoothstep(0.42, 1.0, rN), 1.2);
    // A third dark. Silver-on-silver is a fill; silver-on-shadow is a plume.
    const dark = rnd() < 0.34;
    const v = dark ? 96 + rnd() * 46 : 196 + rnd() * 56;
    const alpha = (dark ? 0.30 + rnd() * 0.26 : 0.44 + rnd() * 0.42) * edge;
    if (alpha < 0.04) continue;
    g.strokeStyle = `rgba(${v | 0},${(v * 0.93) | 0},${(v * 0.78) | 0},${alpha.toFixed(3)})`;
    g.lineWidth = Math.max(1, size * (dark ? 0.0045 : 0.0055));
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(ax + spread * 0.55, ay - rise * 0.85, tipX, tipY);
    g.stroke();
  }
  return c;
}

/**
 * Four low-shrub silhouettes in a 2x2 atlas.
 *
 * One stamp repeated across a hillside is legible as a stamp no matter how good the stamp
 * is — the eye finds the repeat before it finds the plant. Cell 0 is the pinnate fern the
 * file already had; 1 is a broader, blunter frond; 2 is a sparse wiry shrub; 3 is a dense
 * low cushion. Per-instance yaw and scale then do the rest.
 */
function paintFernAtlas(size) {
  const half = size >> 1;
  const c = newCanvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const specs = [
    { pairs: 13, lean: 0.45, taper: 0.85, plen: 0.34, pwid: 0.20, fronds: 1, dry: 0.0, seed: 7723 },
    { pairs: 9, lean: 0.62, taper: 0.55, plen: 0.42, pwid: 0.34, fronds: 1, dry: 0.35, seed: 3311 },
    { pairs: 7, lean: 0.30, taper: 0.95, plen: 0.26, pwid: 0.12, fronds: 3, dry: 0.55, seed: 9157 },
    { pairs: 15, lean: 0.78, taper: 0.40, plen: 0.30, pwid: 0.28, fronds: 2, dry: 0.15, seed: 2087 },
  ];
  for (let i = 0; i < 4; i++) {
    const cell = newCanvas(half, half);
    const cg = cell.getContext('2d');
    cg.clearRect(0, 0, half, half);
    const s = specs[i];
    const rnd = makeRandom(s.seed);
    for (let f = 0; f < s.fronds; f++) {
      cg.save();
      cg.translate(half * (0.5 + (s.fronds > 1 ? (f / (s.fronds - 1) - 0.5) * 0.44 : 0)), half);
      cg.rotate((s.fronds > 1 ? (f / (s.fronds - 1) - 0.5) * 0.7 : 0));
      const len = half * (0.90 - f * 0.10);
      cg.strokeStyle = 'rgb(72,96,52)';
      cg.lineWidth = Math.max(1, half * 0.014);
      cg.beginPath(); cg.moveTo(0, 0); cg.quadraticCurveTo(half * 0.06, -len * 0.5, 0, -len); cg.stroke();
      for (let p = 1; p <= s.pairs; p++) {
        const t = p / (s.pairs + 1);
        const y = -len * t;
        const pl = half * s.plen * (1 - t * s.taper) * (0.78 + rnd() * 0.44);
        for (const side of [-1, 1]) {
          cg.save();
          cg.translate(0, y);
          cg.rotate(side * (Math.PI * 0.5 - s.lean - t * 0.25));
          const shade = 0.58 + rnd() * 0.44;
          const dry = s.dry * rnd();
          const r0 = (38 + dry * 110) * shade, g0 = (80 + dry * 50) * shade, b0 = (36 + dry * 16) * shade;
          const r1 = (74 + dry * 120) * shade, g1 = (140 + dry * 40) * shade, b1 = (58 + dry * 24) * shade;
          drawLeafShape(cg, pl, pl * s.pwid,
            `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`, `rgb(${r1 | 0},${g1 | 0},${b1 | 0})`, false);
          cg.restore();
        }
      }
      cg.restore();
    }
    speckle(cg, half, half, 0.26, s.seed ^ 0x77);
    // Rooted feathering per cell: sides and top only, so the clump still meets the soil.
    feather(cell, { inner: 0.50, power: 1.15, keepBottom: true });
    // Cell (col,row); UV row 0 is the canvas bottom band under flipY.
    g.drawImage(cell, (i % 2) * half, (1 - ((i / 2) | 0)) * half);
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
    // Moss is the most saturated green a shrine courtyard owns and it is evergreen, so it
    // is one of the few things here allowed well past GREEN_RATIO. §5 names moss #4e6b3c,
    // which is a *dry* moss; wet stone in the same frame carries this.
    grad.addColorStop(0, `rgba(${(72 * k) | 0},${(142 * k) | 0},${(56 * k) | 0},0.98)`);
    grad.addColorStop(0.58, `rgba(${(48 * k) | 0},${(104 * k) | 0},${(42 * k) | 0},0.86)`);
    grad.addColorStop(1, `rgba(${(34 * k) | 0},${(74 * k) | 0},${(32 * k) | 0},0.0)`);
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
    g.strokeStyle = `rgba(${(104 * v) | 0},${(186 * v) | 0},${(74 * v) | 0},${0.18 + rnd() * 0.4})`;
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
/**
 * Blades (or clump cards) per square metre at `grassDensity` 1.0.
 *
 * LOD2 stays at 0.85, and that is a round-17 result rather than an omission. Raising it was
 * the obvious answer to "the near plain is bare" and it is measurably the wrong layer:
 * a deterministic A/B over the critic's own `wide` box (engine stopped, grain phase
 * re-seeded, one mesh hidden) attributes 5.62% of that box to `far-cover` and 0.07% to
 * `grass-l2` — where 0.07% is the rig's own noise floor, because hiding `ferns` returns the
 * same 0.07% to three decimal places. The ring is camera-centred and 34 m across at MEDIUM;
 * the box is 23-45 m out. Density added here would have been paid for in triangles and
 * would not have drawn a pixel of the finding.
 */
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
  // There is no separate leaf range any more, and there must never be one again: culm and
  // leaves are ONE instance of ONE mesh (see buildBambooPlantGeometry). Two ranges that
  // happen to be equal is not the same thing — the dissolve threshold is derived from each
  // instance's own phase, so two meshes diverge inside the window however the numbers are
  // set, and that is what filled the valley overlook with leaves hanging in open sky.
  bambooCulm: [0, 46],
  // Out to 300, not 190. The overlook and the wide framing both compose their mid-ground
  // on ground 200-400 m out, and between the old card cutoff at 190 and the canopy shell —
  // which only exists where the ground has already dropped 6 m below the plateau, so not on
  // the far ridge that rises again — there was a band with no bamboo in it at all. That gap
  // is exactly where the critic measured "no bamboo" and read the leftover scrub instead.
  bambooCard: [23, 300],
  canopy: [110, 900],
  treeMesh: [0, 55],
  treeCard: [88, 340],
  treeCardOnly: [38, 260],     // MEDIUM and below: mesh LOD straight to impostor
  undergrowth: [0, 30],
  groundCard: [0, 26],
  // The basin beyond the grass ring. `grassRadius` is 34 m at MEDIUM and the ring follows
  // the camera, so `wide`'s plain (55-82 m from its eye) and `valley`'s measurement box
  // (15-90 m) sit entirely outside it and were bare ground in every review from round 4 on.
  // Round 8 raised the ground *shading* past target in both (valley detail 7.57 -> 10.3,
  // wide mid-ground 4.78 -> 6.12) and the frames were still called a uniform plane, which
  // is the expected outcome: shading cannot put a plant where none is instanced.
  // The near edge is authored in `_buildFarCover`'s fade window (18 m), not here: this
  // pair is the *scatter* range and the pack cut, and the layer now deliberately overlaps
  // the camera-centred grass ring rather than starting where the ring stops.
  farCover: [18, 118],
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
/**
 * Slack added to every pack radius, and the distance the camera may travel before the
 * sets are repacked. One number for both, so an instance can never leave the packed set
 * while still being inside its own fade window: at sprint speed 7.2 m/s that is a repack
 * about every 1.7 s, and the pass is a linear scan over a few thousand vec4s.
 */
const PACK_MARGIN = 12.0;
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
    /** Instanced sets compacted against their own fade window. See `_registerPack`. */
    this._packs = [];
    this._packAt = new Vector3(Infinity, Infinity, Infinity);

    this._elapsed = 0;
    this._disturbCursor = 0;
    this._characters = [];
    this._extraCharacters = [];

    this._grass = null;
    this._bamboo = null;
    this._undergrowth = null;
    this._farCover = null;
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
    await step('dressing the basin', () => this._buildFarCover(q));
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
    w *= this._coverAt(x, z);
    w *= 1 - smoothstep(0.34, 0.78, this._slopeAt(x, z));
    return clamp(w, 0, 1);
  }

  /**
   * The splat's own continuous turf weight, as a density *modulation* — never as a cut.
   *
   * `Terrain.coverAt()` was published for this file and, until round 17, nothing called
   * it. Terrain's own note says why it exists: `surfaceAt` collapses five continuous
   * weights to one of five names, 83.9% of the plateau the establishing frame sees comes
   * back as the single name 'grass', and the weight underneath that name is mean 0.613,
   * sd 0.260, p10 0.039 against p90 0.888. Reading the name alone plants a 23:1 density
   * range at one flat density — which is exactly the "uniform stochastic scatter, no
   * clumping, no drift" read, and it is also why the bare parts stay bare when the global
   * count is raised: raising a flat density raises it everywhere including the swept-looking
   * ground, and the eye reads the *variance*, not the mean.
   *
   * Mapped so cover 0 keeps 0.45 (there is always some scrub) and cover 1 gives 1.45, which
   * holds the mean at 1.02 of the old flat value over Terrain's measured distribution —
   * this redistributes density, it does not thin the field. Falls back to 1 if the accessor
   * or the splat is missing, so nothing depends on Terrain having baked yet.
   */
  _coverAt(x, z) {
    const c = this.ctx.terrain?.coverAt?.(x, z);
    if (!finite(c)) return 1;
    return 0.45 + c * 1.0;
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

    // Half live grass, half cured — this is autumn, and the dry members are meant to read
    // warm. But every member used to sit below GREEN_RATIO, so the *whole* meadow went
    // orange the moment the key touched it and the frame had no green at any distance.
    // #4e6b3c is §5's moss and stays; #3f7330 and #48792f are the two that survive the key.
    const palette = ['#3f7330', '#3f7330', '#48792f', '#4e6b3c', '#5d7a41', '#77883f', '#9c8548', '#c07a3a'];

    // Every cluster card gets its alpha feathered to zero at the quad border, or the
    // outermost cards in a crown read as hard rectangular slabs. Ground-rooted cards keep
    // their bottom edge so they stay planted, and susuki is excluded entirely because its
    // left-hand blade strip has to stay opaque edge to edge.
    const rooted = { keepBottom: true, inner: 0.52, power: 1.1 };
    // EVERY cutout sheet goes through dilateAlpha last. See the function for the
    // measurement; in short, a transparent texel here is rgba(0,0,0,0) and the GPU
    // box-filters RGB and alpha independently, so without this the mip chain multiplies
    // every partially-covered texel toward black while its alpha still passes alphaTest.
    // That is the "dark sprites in the sky" and the "black speckles in the canopy" in one
    // mechanism. Alpha is untouched, so no silhouette moves.
    const D = (canvas) => dilateAlpha(canvas);
    this.tex = {
      clump: T(D(feather(paintGrassClump(px, palette), rooted))),
      // Culm bark and leaf spray on ONE sheet, because the near plant is one mesh — see
      // buildBambooPlantGeometry for why that is not negotiable.
      // `closeAlpha` before `dilateAlpha`, on both bamboo sheets and on nothing else:
      // these two are the only cutouts in the build that are read at 100-300 m, where the
      // mip footprint is wide enough to disconnect a blade from the spray holding it. See
      // closeAlpha for the measurement of where the review's floating dashes actually sit.
      bambooPlant: T(D(closeAlpha(paintBambooPlant(px), 2))),
      // The mid-ground impostor: four archetypes in 4x1, each painted in a 1:2 frame so a
      // 12 m culm never has to stretch a square texture. Its own feathering is per cell
      // and side-only, so neither `feather()` nor the alpha-only blur may run over the
      // whole atlas. paintBambooCard softens each cell before compositing; the close then
      // makes real branch joins mip-stable and dilateAlpha still owns RGB colour bleed.
      // The row layout is load-bearing, not cosmetic — see paintBambooCard for the
      // measurement that put the skyline dashes on the 2x2 pack's horizontal seam.
      bambooCard: T(D(closeAlpha(paintBambooCard(px >> 1, px), 2))),
      // The blossom card is also alpha-softened: it is the one sheet drawn as filled
      // beziers rather than strokes, so it is the one whose alpha steps 0 -> 250 across a
      // single texel at every petal edge.
      // NOT `feather()`. Its cut contour is `box * 0.55 + rad * 0.45`, which on this card's
      // own parameters holds the top edge flat to within 0.01 for 22.3% of the card width —
      // a straight horizontal segment contributed to the sacred tree's silhouette by every
      // outermost card in the crown, i.e. the "visible rectangular card boundaries" note.
      // `lobeMask` replaces it with an angular outline that is concave in three places.
      blossom: T(D(softenAlpha(lobeMask(paintBlossom(px)), 1))),
      momiji: T(D(softenAlpha(feather(paintMomiji(px), { inner: 0.40, power: 1.4 }), 1))),
      cedar: T(D(feather(paintCedarSpray(px), { inner: 0.42, power: 1.3 }))),
      // Four shrub silhouettes, 2x2. A hillside carrying one repeated stamp reads as a
      // stamp; the atlas cell rides in the integer part of the instance phase.
      fern: T(D(paintFernAtlas(px))),
      susuki: T(D(paintSusuki(px))),
      // Two cells: fallen leaves and moss. Each is feathered before it is composited.
      fallen: T(D(paintGroundAtlas(px))),
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
      warmFill = null,
      // [nearD, farD, desaturation, gain] — the distant LOD's depth response, off unless a
      // material asks for it. See FRAGMENT_SSS's KAG_AERIAL block.
      aerial = null,
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
      // Zero unless a material asks for it, so this uniform cannot change any surface that
      // has not been measured. See FRAGMENT_SSS.
      uWarmFill: { value: warmFill ? new Color(warmFill[0], warmFill[1], warmFill[2]) : new Color(0, 0, 0) },
    };
    // Declared only when asked for: the block that reads it is behind KAG_AERIAL, and an
    // unused uniform on a material whose program never declares it is exactly the dead
    // upload round 16 found on the impostor.
    if (aerial) local.uAerial = { value: new Vector4(aerial[0], aerial[1], aerial[2], aerial[3]) };
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
      (atlas ? atlasDefines(atlas) : '') +
      (tintModulate ? '#define KAG_TINT_MODULATE\n' : '');

    chainBeforeCompile(mat, (shader) => {
      shader.uniforms.uWind = wind.uWind;   // same object as Weather's — never a copy
      shader.uniforms.uGust = wind.uGust;
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + defines + pars)
        .replace('#include <beginnormal_vertex>',
          'kagFoliageVertex();\n' + (atlas ? KAG_ATLAS_UV : '') + 'vec3 objectNormal = kagNrmG;')
        .replace('#include <begin_vertex>', 'vec3 transformed = kagPosG;');

      // The `defines` block above is spliced into the VERTEX shader only. KAG_AERIAL is
      // read in the fragment stage, so it has to be declared there in its own right — an
      // #ifdef whose define lives in the other stage is silently always-false, which is
      // the same class of failure as the atlas uniform that compiled out.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' +
          (aerial ? '#define KAG_AERIAL\n' : '') + glslNoise + FRAGMENT_PARS)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAGMENT_DITHER)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_TINT)
        .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n' + FRAGMENT_SHADOW_CAPTURE)
        .replace('#include <envmap_fragment>', FRAGMENT_SSS + '\n#include <envmap_fragment>');
    });
    // `aerial` is in the key for the reason atlasKey is: two materials that differ only by
    // a define are indistinguishable to three's program cache, and which one you get then
    // depends on which compiled first.
    chainCacheKey(mat, `kagfol|${mode}|${bendExp}|${whip}|${sink ? 's' : '-'}|${atlasKey(atlas)}|${tintModulate ? 'm' : 'a'}|${aerial ? 'ae' : '-'}`);

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
      (atlas ? atlasDefines(atlas) : '');

    chainBeforeCompile(depth, (shader) => {
      shader.uniforms.uWind = wind.uWind;
      shader.uniforms.uGust = wind.uGust;
      for (const k in shared) shader.uniforms[k] = shared[k];
      for (const k in local) shader.uniforms[k] = local[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + defines + pars)
        .replace('#include <begin_vertex>',
          'kagFoliageVertex();\n' + (atlas ? KAG_ATLAS_UV : '') + 'vec3 transformed = kagPosG;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKagFade;')
        // The shadow must dissolve on the same per-instance threshold as the lit pass, or a
        // plant the colour pass has culled keeps casting a shadow onto the ground.
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ( vKagFade <= 0.0 ) discard;');
    });
    chainCacheKey(depth, `kagfold|${mode}|${bendExp}|${whip}|${sink ? 's' : '-'}|${atlasKey(atlas)}`);
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
      // LOD2 never casts, at any tier. It is a two-triangle stand-in for a few hundred
      // blades, blown to 24x width (GRASS_LOD_SIZE) with a painted bush silhouette, and
      // that silhouette is a lie the moment anything reads it at shadow-map scale rather
      // than as a distant mass. Measured on the round-5 ULTRA hero frame, where
      // foliageShadows is on: the flagstone in front of the great torii carried a field
      // of hard-edged near-black ellipses 2-4 m across with no caster anywhere in frame —
      // one 24 m card each, projected by a 13° sun. It reads as decals dropped on the
      // ground, which is worse than the shadow being absent.
      const casts = shadows && bucket.lod < 2;
      const mesh = this._makeBatchMesh(this._grassBase[bucket.lod], m.mat, m.depth, cap, casts);
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
    const hi = q.tier >= 2;
    // One geometry for the whole near plant. Culm and sprays scale together — the
    // scatterer sets width = height so canonical space stays isotropic.
    // Sprays up from 13/8 to 20/15. The culm tube is 128 triangles at MEDIUM and each
    // spray is two crossed quads = 4, so this is 160 -> 188 triangles per plant: the near
    // band is a few hundred instances inside a 46 m window, and the crown is the whole
    // reason the near bamboo is drawn at all.
    const plant = buildBambooPlantGeometry(hi ? 6 : 4, hi ? 13 : 8, hi ? 20 : 15);
    const card = buildCrossCard(2, 1.0, false, 0.55);
    this._geometries.push(plant, card);

    // Stiff, and it whips: a bamboo sea reads as bamboo because the tops lag the gust.
    // `flutter` now drives both parts of one mesh, which is fine because aFlex.x separates
    // them — the bark ring vertices carry 0.10 and the spray corners carry 1.0, so the
    // sprays shiver at the culm's own frequency without the culm shivering with them.
    const plantOpts = {
      name: 'bamboo-plant', mode: 0, map: this.tex.bambooPlant, color: 0xffffff,
      // bendGain down from 1.35 and whip from 0.28. `theta = 1.5a/(1+a)` with `a = mag *
      // uBendGain`, so at the gust amplitudes Weather publishes the old gain was putting
      // the crown tens of degrees off vertical — the review reads that as broken rather
      // than windblown and asks for a lean capped near 8 degrees. See KAG_SINK below for
      // the other half of "the bamboo does not stand up".
      bendExp: 1.6, whip: 0.16, bendGain: 0.62, flutter: 1.15, alphaTest: 0.30,
      fadeFar: fadeOut(RANGE.bambooCulm), size: [1, 1], side: DoubleSide, sink: true,
      // A leaf held up to a low sun passes green, and at the 0.6 default desaturation the
      // amber key turns that into another orange surface in a frame that already has too
      // many. The green itself comes from the sheet's albedo (see paintBambooLeaves); this
      // only tints the light coming *through* it. Pulled back from the old leaf-only 1.05
      // because the same term now also lands on the opaque bark strip, and a culm that
      // transmits is a culm that silhouettes brighter than the sky behind it.
      //
      // sssSat to 1.0 and the floor to 0.38, measured. `trans = mix(1, sssColor, sssSat) *
      // uSunColor`, and the key is (1.0, 0.412, 0.134): at 0.88 the transmitted light left
      // this material at linear g/r 1.13, which is green-dominant by a hair and does not
      // survive the tone map. In `valley` the near culms stand backlit against the sky with
      // `forward` near 1 — the one place in the build where transmission is the whole
      // lighting model — and they measured 0.4% green-dominant pixels against a 25% target.
      // At sssSat 1.0 the tint is the leaf's own filter (linear g/r 4.85) and the product
      // with the key is 2.00 rather than 1.13. The floor is what stops that being gated
      // back to nothing by a dark albedo (see FRAGMENT_SSS).
      sss: 1.05, sssColor: 0x5cc233, sssFloor: 0.38, sssSat: 1.0,
      // baseAO down from the old culm's 0.28: the sheet now paints its own base-to-tip
      // value ramp, and stacking a second one on top of it drove the lower half of every
      // culm toward black at exactly the distance the culm has to stay readable.
      tipGlow: 0.14, baseAO: 0.16, grain: 0.16, broad: 0.10,
      // The sheet is the albedo now, so the instance tint may only shift its hue.
      tintAmount: 0.55,
    };
    const plantMat = this._makeMaterial(plantOpts);
    const plantDepth = this._makeDepthMaterial(plantMat, plantOpts);

    // Impostor cards for the mid distance. This is the *only* bamboo the critic's four
    // framings can see — every one of them is composed from 45 m or further out, past the
    // near plant's fade window — so the whole silhouette read of "shrine above a bamboo
    // sea" lives or dies on this card and nothing else.
    //
    // It is also the material that was drawing nothing at all: 11 390 instances, 10 933 of
    // them inside their fade window, every fragment discarded because KAG_ATLAS divided by
    // an unbound uniform. See atlasDefines(). Everything below about how the card is tuned
    // was therefore never actually visible in a review frame.
    const cardOpts = {
      name: 'bamboo-card', mode: 0, map: this.tex.bambooCard, color: 0xffffff,
      // 4x1, not 2x2 — see paintBambooCard. A vertical seam here put the neighbouring
      // cell's opaque rooted skirt through the top edge of every row-0 card, which is the
      // skyline-dash artifact the review has now filed three times.
      atlas: [4, 1],
      // Alpha test low, deliberately. This card is only ever seen minified, and minifying
      // an alpha cutout averages its coverage down: at 0.24 every thin blade tip fell under
      // the threshold past ~120 m and the clump collapsed to whatever core was dense enough
      // to survive — a small dark blob, i.e. the "black scrub" the whole band was read as.
      // The silhouette has to survive its own mip chain.
      //
      // The threshold is now safe to leave low for the *other* reason as well: with the
      // sheet dilated (see dilateAlpha) a partially-covered mip texel keeps the leaf's
      // colour instead of being multiplied toward black, so a card that thins out at range
      // thins toward green rather than toward the dark specks the review found in open sky.
      bendExp: 1.8, bendGain: 0.38, flutter: 0.6, alphaTest: 0.14, sink: true,
      fadeNear: fadeIn(RANGE.bambooCard),
      fadeFar: fadeOut(RANGE.bambooCard),
      // 0x4fbf2e is not a leaf's reflectance, it is what a leaf *transmits*: chlorophyll
      // absorbs red and blue hard, so at uSSSSat 0.95 the product with the (1, 0.41, 0.13)
      // sun still lands green-dominant at G/R 1.8. Anything paler and the amber wins and
      // the whole sea comes out orange again.
      //
      // Strength and floor are back to sane values. Transmission cannot be the thing that
      // makes the sea green — a card only reads as bamboo if the culm stays pale and the
      // blades keep their own value structure, and at 2.2/0.52 both were being flooded.
      //
      // sssSat to 1.0 and the tint deepened. `trans = mix(vec3(1), uSSSColor, uSSSSat) *
      // uSunColor`, so the desaturation toward white is *undone* by the key: at 0.95 the
      // product with GREEN_RATIO's (1.0, 0.412, 0.134) sun came out at g/r 1.79, and at 1.0
      // with 0x3fb520 it is 3.3. That is the only light path on this card that can be
      // green-dominant at all — everything else is albedo times an amber key.
      size: [1, 1], sss: 1.15, sssColor: 0x3fb520, sssFloor: 0.34, sssSat: 1.0,
      // The band's depth response — see the KAG_AERIAL block in FRAGMENT_SSS for the
      // derivation and for why this is not a second fog term. Zero inside 70 m (which is
      // where `valley`'s near ground control box sits, and it must not move), full by
      // 190 m, 0.62 desaturation and a 1.46 gain.
      aerial: [70, 190, 0.62, 1.46],
      // `broad` up from 0.20. This is `fbm2(worldXZ * 0.26)`, i.e. ~24 m features — about
      // 145 px across in the `wide` framing at the band's own range, which is the scale a
      // grove is actually patchy at. It was the only value variation in the band that
      // survives minification, and at 0.20 the round-16 review measured the whole band at
      // lumaSpread 51.2 against a 90 target and called it "a stamped texture".
      //
      // `tintAmount` up from 0.55. KAG_TINT_MODULATE normalises the per-instance tint to
      // unit luminance before applying it — `lum(mix(vec3(1), t/lum(t), a)) == 1` for any
      // `a` — so this knob is a pure hue rotation and cannot re-expose the band however far
      // it is pushed. At 0.55 the plant-to-plant hue authored below was arriving at roughly
      // half strength, which is why 12 500 cards with a green tint measured G - R = -0.1.
      tipGlow: 0.20, baseAO: 0.16, grain: 0.10, broad: 0.34, tintAmount: 0.85,
    };
    const cardMat = this._makeMaterial(cardOpts);

    this._bambooAssets = {
      plant: { geo: plant, mat: plantMat, depth: plantDepth },
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

    // Density, measured rather than guessed. §5 calls the setting a shrine *above a bamboo
    // sea*, and a sea has to close: the band only reads as a canopy once neighbouring
    // clumps overlap in silhouette, and it only hides a ridgeline once they overlap
    // several deep. Both layers are single instanced draws whatever the count, and
    // anything outside its fade window collapses to a degenerate point in the vertex
    // shader, so raising these costs vertex invocations on instances that are never
    // rasterised — not draw calls, not fill. The bamboo draw-call budget is two, down from
    // three now that a plant is one mesh.
    //
    // A plant is one instance rather than one culm plus ten leaf clusters, so this count
    // buys eleven times less buffer than it used to and the difference goes into coverage.
    // It is also spent over an annulus round the plateau shoulder rather than a disc
    // centred on the shrine: the plant fades out 46 m from the camera, so the old disc was
    // handing five sixths of its budget to instances inside the courtyard that the mask
    // then threw away. Measured at the valley pose on the shipped build, 810 scattered
    // plants put SIX culms on screen.
    const nearTarget = Math.round((q.tier >= 2 ? 2400 : 1100) * density);
    // 17 000 over a 310 m disc was one clump per 57 m2. A clump every seven and a half
    // metres does not close: at range you read individual bushes on open ground, which is
    // the "scrub" note, and the ridgeline stays visible straight through the band.
    //
    // Up 14%, and that is the *smallest* of the three levers under "no density" — the card
    // is 28% wider in world and its archetypes carry 1.6-2x the culms over 1.5x the spread,
    // so the coverage bought inside the cell is worth more than the coverage bought here.
    // A card is four triangles and shares one draw call however many there are, so 1 185
    // more of them at MEDIUM is +4 740 submitted triangles against a 214 k headroom and no
    // change at all to the 146/140 draw-call breach.
    const cardTarget = Math.round((q.tier >= 2 ? 29000 : 12500) * density);

    const nearA = new Float32Array(nearTarget * 4);
    const nearB = new Float32Array(nearTarget * 4);
    const nearC = new Float32Array(nearTarget * 4);
    const cardA = new Float32Array(cardTarget * 4);
    const cardB = new Float32Array(cardTarget * 4);
    const cardC = new Float32Array(cardTarget * 4);

    let n = 0, cn = 0;
    const col = _colScratch;

    // Bamboo wants the sheltered, damp, valley-facing ground below the plateau lip.
    //
    // The radius is now honoured. The old form built its point by summing three vectors —
    // a unit-circle direction at 0.6 r, the valley direction at 0.4 r, and a +/-0.3 r box
    // jitter — and those partly cancel, so a nominal 105 m disc actually put most of its
    // mass inside 50 m. Measured: of 20 000 near candidates, 16 805 landed inside the
    // plateau mask and were thrown away, and the whole world got 465 plants out of a 3 600
    // target. The bias now steers the *direction* only; `r` is the real distance from the
    // shrine, area-uniform across [rMin, rMax], so an annulus is an annulus.
    // `pull` warps the radial CDF. 1 is area-uniform, which is the right default and the
    // wrong choice for the card band: area grows as r, so an area-uniform annulus spends
    // most of its instances at 200-285 m where a card is a dozen pixels wide, and thins
    // exactly where each card is worth the most screen. Above 1 it pulls the mass inward
    // without moving either end of the annulus.
    const sample = (rMin, rMax, pull = 1) => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * Math.pow(rnd(), pull));
      // Under half, deliberately: the shrine sits *in* the sea, so bamboo has to wrap the
      // plateau below the lip on every side and only thicken toward the valley. At 0.55 it
      // was a visible lobe and the framings that look up the ridge saw no bamboo at all.
      const bias = 0.40;
      let dx = Math.cos(a) * (1 - bias) + vx * bias + (rnd() - 0.5) * 0.5;
      let dz = Math.sin(a) * (1 - bias) + vz * bias + (rnd() - 0.5) * 0.5;
      const l = Math.hypot(dx, dz) || 1;
      return [(dx / l) * r, (dz / l) * r];
    };

    const clumpNoise = (x, z) => clamp(noise.fbm2(x * 0.035, z * 0.035, 3) * 0.5 + 0.5, 0, 1);

    // The rim is at r = 78 and `plateauMask` does not reach zero until r = 112, so a 96 m
    // sampling disc against a 0.35 mask threshold left an annulus about six metres wide
    // for the near culms to live in — a handful of survivors for the whole world. Sample
    // out to the far edge of the playable region and let the mask only defend the swept
    // courtyard itself.
    for (let i = 0; i < nearTarget * 8 && n < nearTarget; i++) {
      // A ring around the plateau shoulder. The plant fades out 46 m from the camera and
      // the overlook stands at r = 47, so where this ring starts decides whether the lip
      // carries any bamboo at all: at a 0.82 mask threshold nothing could grow inside
      // 88.5 m, which put the entire near band 41.5 m from that camera — on the far side
      // of the 40.5 m fade-out ramp. Three plants rendered.
      const [x, z] = sample(76, 126);
      const y = this._heightAt(x, z);
      // Same correction as the card loop below: the channel test belongs to `_surfaceAt`,
      // which is already consulted a few lines down. This ring only reaches 126 m, where
      // the ground is still above the stream, so the floor was costing little here — but
      // leaving the two loops disagreeing about what "water" means is how the card loop
      // came to be excluding the whole basin.
      if (y < WORLD.WATER_LEVEL - 240) continue;
      // The courtyard guard is `_surfaceAt` below, which knows where the swept stone and
      // the stair actually are. This one only has to keep the mask's dead-flat core clear,
      // so it sits at the top of the falloff (d < 80.3 m) rather than a third of the way
      // down it. A stand that stops ten metres short of the rim is not a sea the shrine
      // sits in, it is a hedge with a moat.
      if (plateauMask(x, z) > 0.995) continue;
      const surf = this._surfaceAt(x, z);
      if (surf === 'stone' || surf === 'gravel' || surf === 'rock' || surf === 'path' || surf === 'water') continue;
      // Bamboo is the plant that holds a hillside together and the wall below the plateau
      // lip is the one place the sea has to be thickest. At 0.62 this filter rejected
      // exactly that wall — the ground the overlook actually frames — and left the lip bare.
      if (this._slopeAt(x, z) > 0.88) continue;
      const c = clumpNoise(x, z);
      if (rnd() > 0.34 + c * 0.95) continue;

      // Skewed toward the shorter culms with a long tail: a real stand is mostly head to
      // two-storey height with a scatter of 16 m leaders through it, and that spread is
      // what stops the band reading as one wall at one depth. The floor is 5 m rather than
      // 3 — below that the culm is under two pixels wide at the far edge of its own fade
      // window, and a sub-pixel culm is the thing that aliased into dashes.
      const h = 5.0 + Math.pow(rnd(), 1.20) * 11.0;   // 5.0-16.0 m, mean ~10.0
      const yaw = rnd() * Math.PI * 2;
      const green = 0.55 + rnd() * 0.45;
      // The sheet carries the albedo now (bark gradient, nodes, blades), so this only
      // shifts hue per plant — KAG_TINT_MODULATE normalises it to unit luminance first.
      col.setRGB(0.50 * green + 0.28, 0.62 * green + 0.24, 0.28 * green + 0.14);
      // Older culms yellow off; a monoculture of one green reads as plastic.
      if (rnd() < 0.24) col.lerp(AUTUMN_B, 0.35 + rnd() * 0.4);

      // Planted through _plantY, not _heightAt — see the card loop for the measurement.
      const py = this._plantY(x, z, _plant);

      const o = n * 4;
      nearA[o] = x; nearA[o + 1] = py - Math.min(0.5, h * 0.02); nearA[o + 2] = z; nearA[o + 3] = yaw;
      nearB[o] = h;
      // Width EQUALS height. buildBambooPlantGeometry authors culm radius and spray size as
      // fractions of height, so canonical space has to scale isotropically or a square leaf
      // card comes out stretched by height/width. The culm's real thickness lives in the
      // geometry (0.0065 of height at the base), not here.
      nearB[o + 1] = h;
      nearB[o + 2] = 3.2 + rnd() * 1.6 + h * 0.06;   // stiff: >1 per Weather's convention
      nearB[o + 3] = rnd();
      nearC[o] = col.r; nearC[o + 1] = col.g; nearC[o + 2] = col.b; nearC[o + 3] = _plant.sag;
      n++;
    }

    // The card fades out 190 m from the *camera* and no camera sits more than ~90 m from
    // the origin, so a card past ~280 m can never be rasterised. Sampling to 420 spent
    // more than half the budget on instances the frustum and the fade window both throw
    // away; pulling the disc in concentrates the same count where the band is actually read.
    for (let i = 0; i < cardTarget * 10 && cn < cardTarget; i++) {
      // An annulus that starts *below the lip*, not at it. The plateau is flat out to 78 m
      // and the overlook stands at 47, so cards planted from 56 m grew to their full 14-20 m
      // at plateau height ten metres in front of the camera and the framing stopped being a
      // view over a sea and became a view into a thicket. From 88 m the ground has already
      // begun to fall, so the band's tops sit at the horizon where the composition wants
      // them. Beyond ~290 the valley floor is under WATER_LEVEL along the overlook's own
      // ray and the height filter would reject the candidates one at a time anyway.
      const [x, z] = sample(96, 285, 1.55);
      const d = Math.hypot(x, z);
      const y = this._heightAt(x, z);
      // NOT a WATER_LEVEL height floor. WATER_LEVEL is the *stream's* surface at 782 m,
      // 30 m below the plateau, and the valley this sea is named for keeps falling past
      // it — measured along the overlook's own ray, the ground is 791 m at 150 out, 750
      // at 200 and 634 at 400. A `y < WATER_LEVEL` reject therefore threw away roughly
      // three quarters of the annulus on the valley bearing: the entire basin, which is
      // the one place §5 says the sea has to be. What reached the screen was the ring on
      // the ridge sides where the ground stays high, i.e. a band at the horizon over an
      // empty brown bowl — which is exactly what the round-5 valley frame photographed.
      //
      // The real question is "is this the wetted channel", and `surfaceAt` already
      // answers it off the river spline and its per-station surface. The absolute floor
      // stays only as a rail against the sea bed itself.
      if (y < WORLD.WATER_LEVEL - 240) continue;
      if (this._surfaceAt(x, z) === 'water') continue;
      // Bamboo takes steep ground — it is the plant that holds a hillside together, and
      // the wall below the plateau lip is the one place the sea has to be thickest. At
      // 0.75 this filter was rejecting exactly that wall and leaving the lip bare, which
      // is why the band never appeared under the overlook.
      if (this._slopeAt(x, z) > 0.95) continue;
      // Keep the noise as *modulation* — thicker in the hollows, thinner on the spurs —
      // rather than as a second density cut. At a 0.30 floor it was throwing away a third
      // of the disc outright and the thin half of the field never reached the screen.
      const c = clumpNoise(x, z);
      if (rnd() > 0.52 + c * 0.85) continue;

      // Archetype, then height *around that archetype's* mean. Two independent spreads:
      // the four outlines separate the band into layers, and a +/-38% jitter inside each
      // one stops any layer reading as a repeated stamp.
      const cell = (rnd() * 4) | 0;
      const spec = BAMBOO_ARCHETYPES[cell];
      // Height grades with distance from the shrine, and that grading is the difference
      // between a sea and a hedge.
      //
      // The terrain only starts to fall in earnest past r ~ 200: along the overlook's own
      // ray it is still 812 m at 100 out and 791 at 150, against a camera at 817.5. So a
      // flat 13-20 m band planted from the rim stands with its crown well ABOVE the eye
      // line and the shot stops being a view over a valley — the first version of this
      // fix walled off the horizon, the cloud deck and the sky together. Grading it puts
      // the near canopy at roughly 200 px, under the horizon, and lets the tall leaders be
      // the ones 200 m out where they break the skyline and hide the ridge.
      //
      // It is also true: bamboo on a wind-exposed shoulder is half the height of the same
      // grove down in the sheltered basin.
      const rF = clamp((Math.hypot(x, z) - 96) / 150, 0, 1);
      // Keep the height hierarchy without 30 m outliers. Those outliers exposed one sparse
      // stamp above the shared crown line; the only pixels left visible were its leaf tips,
      // which is how a connected card became detached bars after depth compositing.
      //
      // THE FLAT TOP. Height used to be `distance grade x archetype x an INDEPENDENT
      // +/-18% per card`. A dense band's skyline is the *maximum* over the cards behind
      // each column, and the maximum of many independent draws from a narrow distribution
      // concentrates hard: measured on `phone-valley-r17.png`, the sky/canopy boundary
      // across x200-2300 has a standard deviation of 52.0 px on a band 404 px deep (12.9%)
      // and ZERO emergent crowns rising more than 25% above their local mean. Per-card
      // jitter cannot fix that however wide it is made — independence is the defect.
      //
      // `stand` is a ~38 m correlated field, so neighbouring cards agree and whole stands
      // rise and fall together; `emergent` is the 5.5% of culms that overtop a real grove.
      // Its mean is held at 1.02 of the old value (0.70 + 0.62/2 = 1.01, times 1.039 for
      // the emergent tail) so this is silhouette, not a taller band.
      const stand = clamp(noise.fbm2(x * 0.026 + 61.7, z * 0.026 - 22.1, 3) * 0.5 + 0.5, 0, 1);
      const emergent = rnd() < 0.055 ? 1.45 + rnd() * 0.45 : 1.0;
      const h = (7.0 + 9.0 * rF) * spec.hScale
        * (0.70 + stand * 0.62) * (0.86 + rnd() * 0.28) * emergent;
      const green = 0.45 + rnd() * 0.62;
      // Authored against GREEN_RATIO (line 1139), which this member was failing. The tint
      // is applied luminance-normalised, so only the *ratio* matters: the old form sat at
      // linear g/r 1.16-1.22 and the magic-hour key is (1.0, 0.412, 0.134), so a lit card
      // could not come out green-dominant at any density — it needs g/r > 1/0.412 = 2.43.
      // This form holds 2.70-2.76 across the whole `green` range. Measured: the band's own
      // pixels (the 61.5% of the critic's box that disappears when `bamboo-cards` is
      // hidden) read G - R = +5.8 at saturation 0.119 before this.
      col.setRGB(0.24 * green + 0.13, 0.62 * green + 0.38, 0.18 * green + 0.11);

      // THE FLOATING CULMS. Both bamboo layers were the only ground-planted scatters in
      // this file still using `_heightAt` — grass, undergrowth and the ground cards have
      // all gone through `_plantY` since the susuki band was caught hanging over the far
      // ridge, and neither bamboo material declared `sink`, so `aFoliageC.w` was written as
      // a literal 0 and the KAG_SINK branch subtracted nothing.
      //
      // Measured on this branch with the real heightfield at MEDIUM (ring-2 cell 8 m):
      // of the 2 920 cards inside the frustum and the fade window at the `valley` pose,
      // 848 — 29% — stand on ground whose drawn clipmap chord is more than 0.5 m below the
      // height they were planted at, mean deficit 1.80 m and up to 6.70 m. The card's alpha
      // ramp keeps its bottom edge hard on purpose (see paintBambooClump), so what that
      // deficit looks like in frame is a culm running down out of the canopy and stopping
      // on a clean flat horizontal cut with lit ground visible underneath it — which is
      // exactly the defect the review measured at five separate crop coordinates.
      //
      // The extra bury is 40 cm plus 6% of the card's own height, on top of PLANT_BURY's
      // flat 14 cm — which is a fifth of a pixel on a 6 m card at 200 m. The constant term
      // covers the near end of the band, where `uSink`'s smoothstep(38, 96, dist) has
      // barely opened and the shader is applying almost none of the measured deficit. With
      // it, the residual at the `valley` pose is 6 cards of 3 352 (0.18%) still more than
      // 0.5 m clear of the drawn chord, against 1 053 of 3 352 (31.4%) before.
      const py = this._plantY(x, z, _plant);

      const o = cn * 4;
      cardA[o] = x; cardA[o + 1] = py - Math.min(1.6, 0.4 + h * 0.06); cardA[o + 2] = z;
      cardA[o + 3] = rnd() * Math.PI * 2;
      cardB[o] = h;
      // The atlas cell is painted in a 1:2 frame, so the card must be planted at that
      // aspect. It used to be 12 m tall and 3 m wide, which stretched every leaf in the
      // texture into a four-times-too-long dagger — half of why the band read as thistles.
      // The cell is 1:2, so 0.5 is aspect-correct. Keep only a small overlap allowance;
      // 0.60-0.76 stretched every already-oversized leaf horizontally by 20-52%.
      cardB[o + 1] = h * (0.54 + rnd() * 0.12);
      cardB[o + 2] = 3.6 + rnd() * 1.8;
      // Integer part = archetype (see KAG_ATLAS), fraction = the dissolve/wind phase.
      cardB[o + 3] = cell + rnd() * 0.999;
      cardC[o] = col.r; cardC[o + 1] = col.g; cardC[o + 2] = col.b; cardC[o + 3] = _plant.sag;
      cn++;
    }

    const shadows = !!q.foliageShadows;
    const plantMesh = this._makeBatchMesh(A.plant.geo, A.plant.mat, A.plant.depth, Math.max(1, n), shadows);
    const cardMesh = this._makeBatchMesh(A.card.geo, A.card.mat, null, Math.max(1, cn), false);
    plantMesh.name = 'bamboo-plants';
    cardMesh.name = 'bamboo-cards';

    this._fill(plantMesh, nearA, nearB, nearC, n, 18);
    this._fill(cardMesh, cardA, cardB, cardC, cn, 22);

    this._bamboo = { plantMesh, cardMesh, near: n, cards: cn };
    // The plant is 160 triangles and lives in a 46 m window on a 220 m plateau; the card
    // is four and is wanted out to 300 m, so only the first is worth compacting.
    this._registerPack(plantMesh, nearA, nearB, nearC, n, A.plant.mat, 18);

    // §5's setting is a shrine above a bamboo sea. When the filters starve this scatter the
    // symptom in frame is not "less bamboo" — it is a mid-ground of unrelated scrub that a
    // reviewer reads as a texture or silhouette problem, and three rounds get spent on the
    // card art while the real fault is that eighty per cent of the instances were rejected
    // at placement. Say which filter ate them, here, once, at boot.
    if (cn < cardTarget * 0.6 || n < nearTarget * 0.6) {
      console.warn(`[foliage] bamboo scatter starved: ${n}/${nearTarget} plants, ` +
        `${cn}/${cardTarget} cards. Candidates are rejected by _slopeAt (plants > 0.88, ` +
        `cards > 0.95), _surfaceAt (stone/gravel/rock/path/water), plateauMask > 0.82 and ` +
        `the WATER_LEVEL floor — check those against the landform Terrain is drawing.`);
    } else if (this.ctx.debug) {
      console.info(`[foliage] bamboo: ${n} plants, ${cn} cards`);
    }
  }

  /**
   * Upload a finished instance set and author the bounding sphere from its own extent.
   * An InstancedBufferGeometry's bounds describe one blade, so without this every batch
   * would be frustum-culled the moment the camera looked away from the world origin.
   */
  /**
   * Register an instanced set for distance compaction, and pack it once now.
   *
   * Every set here already has a fade window, and past `uFadeFar.y` the vertex shader
   * collapses the instance to a degenerate point — so it costs no fill. It costs
   * everything else. `renderer.info.render.triangles` counts submitted primitives, and
   * so does the GPU: vertex fetch, the wind/noise vertex shader, primitive assembly and
   * the cull all run before the triangle is discovered to be degenerate. The round-5
   * phone audit measured 1,138,406 triangles against a 900 k cap, and the six largest
   * holders were all sets like this — 184,688 for 97 cedar trunks whose mesh LOD ends
   * 46 m from the camera, 139,040 for 869 bamboo plants at the same window, on a
   * plateau 220 m across. A handful were inside their window; the rest were paid for.
   *
   * Packing drops exactly the instances that are already fully faded, so the rendered
   * frame is unchanged by construction — this is not a quality knob and must never be
   * used as one. `padY` and the bounding sphere stay authored from the *full* extent:
   * an over-large bound only costs a frustum test that passes, whereas re-fitting it to
   * the packed subset would let the mesh cull itself out the moment the camera turned.
   */
  _registerPack(mesh, a, b, c, n, mat, padY) {
    if (!mesh || !mat?.userData?.kag?.uFadeFar) return;
    const rec = { mesh, a, b, c, n, mat, padY, packed: -1 };
    this._packs.push(rec);
    this._packOne(rec, this.ctx.camera?.position);
    return rec;
  }

  _packOne(rec, camPos) {
    if (!camPos) return;
    const { mesh, a, b, c, n, mat } = rec;
    // Cull at the far *end* of the fade, where the instance contributes nothing, plus a
    // margin covering how far the camera may travel before the next repack.
    const cut = mat.userData.kag.uFadeFar.value.y + PACK_MARGIN;
    const cut2 = cut * cut;
    const geo = mesh.geometry;
    const dstA = geo.getAttribute('aFoliageA').array;
    const dstB = geo.getAttribute('aFoliageB').array;
    const dstC = geo.getAttribute('aFoliageC').array;
    const cap = geo.getAttribute('aFoliageA').count;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    let k = 0;
    for (let i = 0; i < n && k < cap; i++) {
      const o = i * 4;
      const dx = a[o] - cx, dy = a[o + 1] - cy, dz = a[o + 2] - cz;
      // Height matters: a 16 m culm 40 m away is inside its window at the crown and
      // outside it at the base. Measure to the nearest point of the instance's own
      // vertical extent rather than to its root, or tall stock pops at the boundary.
      const h = rec.b[o];
      const dyN = dy > 0 ? dy : (dy + h > 0 ? 0 : dy + h);
      if (dx * dx + dyN * dyN + dz * dz > cut2) continue;
      const d = k * 4;
      dstA[d] = a[o]; dstA[d + 1] = a[o + 1]; dstA[d + 2] = a[o + 2]; dstA[d + 3] = a[o + 3];
      dstB[d] = b[o]; dstB[d + 1] = b[o + 1]; dstB[d + 2] = b[o + 2]; dstB[d + 3] = b[o + 3];
      dstC[d] = c[o]; dstC[d + 1] = c[o + 1]; dstC[d + 2] = c[o + 2]; dstC[d + 3] = c[o + 3];
      k++;
    }
    if (k === rec.packed) return;
    rec.packed = k;
    geo.getAttribute('aFoliageA').needsUpdate = true;
    geo.getAttribute('aFoliageB').needsUpdate = true;
    geo.getAttribute('aFoliageC').needsUpdate = true;
    geo.instanceCount = k;
    mesh.visible = k > 0;
  }

  /** Repack every registered set. Hysteresis lives in the caller. */
  _repackAll(camPos) {
    for (let i = 0; i < this._packs.length; i++) this._packOne(this._packs[i], camPos);
  }

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
        fadeFar: fadeOut(RANGE.treeMesh), size: [1, 1], sink: true,
        sss: 0.10, sssColor: 0x8a6a4a, tipGlow: 0.10, baseAO: 0.30, grain: 0.22,
      };
      const leafOpts = {
        name: `${def.key}-leaf`, mode: 0, map: def.tex, color: 0xffffff,
        bendExp: 2.4, bendGain: 0.60, flutter: 1.35, alphaTest: 0.36,
        fadeFar: fadeOut(RANGE.treeMesh), size: [1, 1], sink: true,
        sss: def.sss, sssColor: def.tint, tipGlow: 0.20, baseAO: 0.18, grain: 0.15,
        // Sakura only — momiji's albedo is already red-dominant and cedar's is green, so
        // neither has the cold-purple failure and neither gets the term. See FRAGMENT_SSS.
        // Sized from the measurement: the hero crown's shadowed clusters read (135.8, 82.6,
        // 91.3), and the blossom albedo is about (0.85, 0.48, 0.60) linear, so the shift
        // this adds is (0.85, 0.48, 0.60) * warmFill * (1 - wrap), with (1 - wrap) = 0.774
        // on a card facing away from the sun. At these values that is roughly +0.056 R,
        // +0.050 G, +0.008 B in linear, which turns B - G of +8.7 into G - B of about +5.
        warmFill: def.key === 'sakura' ? [0.095, 0.135, 0.018] : null,
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
      // Chroma pull, applied after the key multiply, PER ATLAS ROW. The atlas is baked
      // under a neutral 2.35 white key with tone mapping off, so a pale blossom leaves the
      // bake at roughly (245, 184, 206); the amber key below then turns that pale pink into
      // a salmon, and round 15 measured the result at saturation 0.350 against a frame mean
      // of 0.232 and a neighbouring mid-ground at 0.186 — 1.9x the saturation of everything
      // near it. Mixing toward the fragment's own luminance scales chroma without moving
      // luma, which is exactly the shape of that finding.
      //
      // It was a scalar, and that is why round 16 measured the mid-ground forest band at
      // saturation 0.132 with G - R = -0.1: one pull authored for the sakura row was also
      // taking 28% of the chroma out of the cedar row, which is the row that has to carry
      // the green. `aFoliageC.w` already carries the row (see _scatterTrees), so the pull
      // is now per species: x = row 0 (cedar), y = row 1 (momiji), z = row 2 (sakura).
      uChroma: { value: new Vector3(1.0, 0.86, 0.72) },
      // The cool half of the impostor's illuminant. Everything past the mesh LOD is a
      // MeshBasicMaterial sampling a neutrally-baked atlas, so it has no light model at all
      // — the whole band used to be multiplied by one amber constant whatever way it faced.
      // ARCHITECTURE §5's shadow/ambient is #4a6b8f; this is that hue as a multiplier,
      // normalised so it costs luminance rather than adding it.
      uFillColor: { value: new Color(0.42, 0.56, 0.78) },
      // How hard the key/fill split is driven. x = face term (is the camera on the sun's
      // side of this tree), y = the lateral ramp across the card, z = overall gain on the
      // resulting illuminant. Setting x and y to 0, z to 1 and uFillColor to the key itself
      // reproduces the round-16 constant-amber behaviour exactly — which is how the
      // before/after pair for this change was measured out of a single boot.
      uLitMix: { value: new Vector3(0.34, 0.55, 1.08) },
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
uniform vec2 uSink;
uniform vec3 uSunDir;
uniform vec3 uLitMix;
uniform float uGrain;

varying float vKagFade;
varying vec3  vKagTint;
varying float vKagLit;
varying float vKagH;
varying float vKagRow;

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

  // Impostors draw from 38 m out, which is the far half of the clipmap sink range, so a
  // tree that has just handed off from its mesh LOD would otherwise step back up onto the
  // heightfield while the ground under it is still being drawn as a chord. aFoliageC.w is
  // the atlas row here, so the deficit rides in aFoliageB.z, which this shader had left
  // unread. Same smoothstep as KAG_SINK; horizontal len against the mesh path's 3-D
  // distance differs by under 0.1 m at the 38-46 m handoff, where the ramp is at 0.006.
  base.y -= aFoliageB.z * smoothstep( uSink.x, uSink.y, len );

  float fade = smoothstep( uFadeNear.x, uFadeNear.y, len ) * ( 1.0 - smoothstep( uFadeFar.x, uFadeFar.y, len ) );
  // Per-tree dissolve rather than a screen-door dither: nothing downstream resolves a
  // stipple, so a card at half fade used to render as a checkerboard of the tree.
  float thr = fract( aFoliageB.w * 31.7 + 0.137 );
  float grow = smoothstep( thr * 0.72, thr * 0.72 + 0.28, fade );
  vKagFade = grow > 0.0 ? 1.0 : 0.0;
  // A grove is patchy at the grove's own scale, not at the card's. One broad lookup on the
  // instance's base position — ~20 m features, one evaluation per card, no per-fragment
  // cost — is what stops several thousand identically-tinted cards averaging into the flat
  // stamped field the round-16 review measured at lumaSpread 51.2.
  float kagBroad = fbm2( base.xz * 0.048 + 9.3, 2 ) * 0.5 + 0.5;
  vKagTint = aFoliageC.rgb * mix( 1.0 - uGrain, 1.0 + uGrain, kagBroad );
  vKagRow = aFoliageC.w;
  vKagH = clamp( position.y + 0.5, 0.0, 1.0 );

  // The impostor is the ONLY foliage in the file with no light model: it is a
  // MeshBasicMaterial sampling an atlas baked under a fixed neutral key, and every card in
  // the band was multiplied by the same amber constant regardless of which way it faced.
  // That is the mechanism behind "no light-side/shade-side on any single plant" and behind
  // the band measuring G - R = -0.1: the key is (1, 0.412, 0.134), so a 0.55 mix of it
  // takes cedar's linear g/r of 1.53 down to 1.03 — dead olive, exactly as measured.
  //
  // The card has no normal to shade with, but it does have two angles that are free here:
  // whether the camera stands on the sun's side of the tree, and which way the card's own
  // horizontal axis is turned against the sun. The first separates front-lit stands from
  // back-lit ones; the second puts a real sun-struck flank and a shaded flank on every
  // individual card, which is what the band has to have before a crown can read at all.
  vec2 kagSunXZ = normalize( vec2( uSunDir.x, uSunDir.z ) + vec2( 1e-5, 0.0 ) );
  float kagFront = dot( vec2( toCam.x, toCam.z ), kagSunXZ );
  float kagLat   = dot( vec2( right.x, right.z ), kagSunXZ );
  vKagLit = clamp( 0.5 + uLitMix.x * kagFront + uLitMix.y * ( position.x * 2.0 ) * kagLat,
                   0.0, 1.0 );
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
          'uniform vec3 uSunColor;\nuniform vec3 uChroma;\nuniform vec3 uFillColor;\n' +
          'uniform vec3 uLitMix;\nuniform float uTipGlow;\nuniform float uBaseAO;\n' +
          'varying float vKagFade;\nvarying vec3 vKagTint;\n' +
          'varying float vKagLit;\nvarying float vKagH;\nvarying float vKagRow;')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ( vKagFade <= 0.0 ) discard;')
        .replace('#include <map_fragment>', /* glsl */`
#include <map_fragment>
{
  // Warm key against cool fill (ARCHITECTURE §5), interpolated by the card's own facing.
  // uLitMix.z holds the overall gain: the split costs luminance on the shaded half, and
  // this is what keeps the band's median where the round-16 measurement found it instead
  // of paying for the contrast with two thirds of a stop.
  vec3 kagKey  = mix( vec3( 1.0 ), uSunColor, 0.55 );
  vec3 kagIllum = mix( uFillColor, kagKey, vKagLit ) * uLitMix.z;
  // A crown sits in the light its own trunk does not reach. uTipGlow and uBaseAO were
  // already being uploaded to this material and read by nothing.
  kagIllum *= mix( 1.0 - uBaseAO, 1.0 + uTipGlow, vKagH );
  diffuseColor.rgb *= vKagTint * kagIllum;

  // Per-row chroma pull; see uChroma. step() rather than an index so this stays valid on
  // every profile the build targets.
  float kagCh = uChroma.x;
  kagCh = mix( kagCh, uChroma.y, step( 0.5, vKagRow ) );
  kagCh = mix( kagCh, uChroma.z, step( 1.5, vKagRow ) );
  float kagLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  diffuseColor.rgb = mix( vec3( kagLum ), diffuseColor.rgb, kagCh );
}
`);
    });
    chainCacheKey(mat, 'kagimpostor4');

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

        if (this._heightAt(x, z) < WORLD.WATER_LEVEL + 1.2) continue;
        if (plateauMask(x, z) > 0.5) continue;             // keep the courtyard clear
        if (this._slopeAt(x, z) > 0.66) continue;
        const surf = this._surfaceAt(x, z);
        if (surf === 'water' || surf === 'path' || surf === 'stone' || surf === 'wood') continue;
        const clump = clamp(noise.fbm2(x * 0.018 + item.key.length, z * 0.018, 3) * 0.5 + 0.5, 0, 1);
        if (rnd() > 0.2 + clump * 0.95) continue;

        // Last, so the placement audit in _plantY counts trees that were actually planted.
        // Trees used to plant through _heightAt, which is the heightfield rather than the
        // chord the clipmap draws — the defect round 7 fixed for bamboo, still live here.
        const y = this._plantY(x, z, _plant);
        const h = cfg.hMin + rnd() * (cfg.hMax - cfg.hMin);
        const o = n * 4;
        a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
        b[o] = h;
        b[o + 1] = h * (0.9 + rnd() * 0.22);               // trees scale near-uniformly
        b[o + 2] = 1.7 + rnd() * 0.9;                      // stiff: trunks barely move
        b[o + 3] = rnd();
        // Per-plant value and warm/cool bias. At 0.86-1.14 with a 4% hue wobble the whole
        // grove sat inside one eighth of a stop, and the round-16 review measured the band
        // it makes at lumaSpread 51.2 against a 90 target — "every element the same height
        // and the same value". The spread is doubled and given a hue axis: an individual
        // plant is now either an older, warmer, drier one or a fresher, cooler one, which
        // is the variation a real treeline separates its crowns with. The mean is held at
        // 1.00 (pow 0.85 over [0.70, 1.25]) so nothing downstream re-exposes.
        //
        // EXACTLY THREE DRAWS, as before. `rnd` is one stream shared by all three species
        // loops, so taking two here or four would reshuffle every tree planted after this
        // one and the before/after boxes would then be comparing different trees in
        // different places as well as different shading. `jitter` is the third draw and is
        // spent on a small green wobble so it is not a dead call.
        const v = 0.70 + Math.pow(rnd(), 0.85) * 0.55;
        const warm = rnd();
        const jitter = rnd();
        c[o] = v * (0.94 + warm * 0.16);
        c[o + 1] = v * (0.99 + (1 - warm) * 0.06 + (jitter - 0.5) * 0.04);
        c[o + 2] = v * (0.86 + (1 - warm) * 0.26);
        // aFoliageC.w is the clipmap chord deficit here, not an atlas row. The standing
        // note that trees could not take KAG_SINK because "trees and impostors already
        // spend that slot on their atlas row" is only true of the impostor shader: the
        // shared foliage vertex path reads its atlas cell from `floor(aFoliageB.w)`, and
        // neither tree material declares an atlas at all, so the slot was free and being
        // written with a value nothing reads. The impostor buffer below builds its own `c`
        // and still carries the row.
        c[o + 3] = _plant.sag;
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
      // The trunks are the single largest submission in the build — 1,904 triangles per
      // cedar against a mesh LOD that ends 46 m out at MEDIUM.
      this._registerPack(woodMesh, a, b, c, n, item.woodMat, cfg.hMax);
      this._registerPack(leafMesh, a, b, c, n, item.leafMat, cfg.hMax);

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
          // z carries the chord deficit the mesh path keeps in aFoliageC.w — see the
          // impostor vertex body. It held an unread 2.4 before.
          b[d + 2] = src.c[o + 3]; b[d + 3] = src.b[o + 3];
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
      // Four silhouettes, 2x2 — the archetype rides in the integer part of the phase slot.
      atlas: [2, 2],
      bendExp: 2.1, bendGain: 0.85, flutter: 1.0, alphaTest: 0.40,
      fadeFar: [radius * 0.85, radius], size: [1, 1], sink: true,
      sss: 1.35, sssColor: 0xa8c86a, sssFloor: 0.45,
      tipGlow: 0.20, baseAO: 0.42, grain: 0.20, broad: 0.14,
    };
    const susukiOpts = {
      name: 'susuki', mode: 0, map: this.tex.susuki, color: 0xffffff,
      // 0.18 let a plume's outermost filaments survive at any coverage, and once minified
      // that averaged the whole spray up into solid coverage: measured in frame at
      // (134, 111, 106) with an internal luma standard deviation of 5.3, i.e. a filled
      // cream lozenge with a hard edge. The card has to be able to lose its edges.
      bendExp: 2.2, bendGain: 1.15, flutter: 1.25, alphaTest: 0.34,
      fadeFar: [radius * 1.35, radius * 1.6], size: [1, 1], sink: true,
      // A low sun blowing through the plume is still the point, but 2.6 x 0.58 was not
      // transmission — it was a *replacement*. FRAGMENT_SSS clamps `through * trans` at
      // 0.85, and at that strength every fragment with any alpha reached the ceiling, so
      // the clamp handed back the same constant for all of them and erased the plume's
      // entire internal value range. That is the mechanism behind "no lighting response,
      // 1.33x the ground around it". Below the ceiling the filaments shade again.
      sss: 1.10, sssColor: 0xf0e2c0, sssFloor: 0.26,
      tipGlow: 0.26, baseAO: 0.30, grain: 0.14, broad: 0.16,
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
        // Integer part = atlas cell where the material has one (see KAG_ATLAS); fraction is
        // always the dissolve/wind phase. `cells` is 1 for a single-silhouette material,
        // which leaves the slot byte-identical to a plain phase.
        b[o + 3] = ((rnd() * cfg.cells) | 0) + rnd() * 0.999;
        _colScratch.set(cfg.color).lerp(AUTUMN_B, rnd() * cfg.dry);
        const v = 0.82 + rnd() * 0.34;
        c[o] = _colScratch.r * v; c[o + 1] = _colScratch.g * v; c[o + 2] = _colScratch.b * v;
        c[o + 3] = _plant.sag;
        n++;
      }
      const mesh = this._makeBatchMesh(geo, mat, depth, Math.max(1, n), shadows && cfg.shadow);
      mesh.name = cfg.name;
      this._fill(mesh, a, b, c, n, cfg.hMax + 1);
      this._registerPack(mesh, a, b, c, n, mat, cfg.hMax + 1);
      return mesh;
    };

    const scale = clamp(density, 0, 1.5);
    // clumpPow 2.4 on top of the site weight was compounding two rejections: of a 535-fern
    // target the scatter was landing TWENTY-NINE instances world-wide, which is not a
    // clumping bias, it is an empty layer. 1.5 keeps the hollows thicker than the spurs
    // without deleting the field.
    const fernMesh = mk(fernGeo, fernMat, this._makeDepthMaterial(fernMat, fernOpts),
      Math.round(1600 * scale) + 60, {
        name: 'ferns', far: radius, bias: 1.35, scale: 0.075, seed: 3.1, clumpPow: 1.5, cells: 4,
        hMin: 0.32, hMax: 1.10, aspect: 1.5, stiff: 0.75, color: 0x4e6b3c, dry: 0.35, shadow: false,
      });

    const susukiMesh = mk(susukiGeo, susukiMat, null,
      Math.round(560 * scale) + 30, {
        name: 'susuki', far: radius * 1.5, bias: 1.05, scale: 0.032, seed: 19.7, clumpPow: 2.0, cells: 1,
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
    this._registerPack(mesh, a, b, c, n, mat, 1);
    this._groundCards = { mesh, mat };
  }

  /**
   * Dry basin cover, 28-118 m. One draw call, one static scatter, no tiles.
   *
   * This is the part of the bare-ground blocker the grass ring structurally cannot reach.
   * The ring is camera-centred and 34 m across at MEDIUM, and widening it is not affordable:
   * it is a 7x7 tile grid whose LOD is a function of `radius`, so covering 110 m means a
   * 21x21 grid — 441 tiles against 49, refilled two to eight a frame after every shift.
   * A world-anchored batch costs one draw call and a triangle count fixed at build time,
   * because the mesh capacity is the number of instances the scatter actually placed.
   *
   * Budget, at MEDIUM: `target` is 6,760, geometry is `buildCrossCard(2)` = 4 triangles,
   * so the hard ceiling is 27,040 submitted triangles — 3.0% of the 900 k contract and 18%
   * of the 153 k `wide` had spare — plus one draw call against a 118/140 worst pose.
   * `_packOne` culls to the fade window, so the frame cost is below that ceiling, never
   * above it.
   *
   * Its site rule is `_siteWeight`'s, relaxed by `1 - plateauMask` and only there. Inside
   * the shrine grounds gravel and stone stay a hard zero, which is what keeps the courtyard
   * swept and is the single source of truth this file already uses for "is this swept
   * ground"; out past the rim the same classification would leave the whole scree basin
   * bare, and dry tussock plainly does grow on scree. Note what this means for `wide`: its
   * plain is 6-50 m from the world origin, i.e. inside PLATEAU_RADIUS, so wherever the
   * splat calls that ground gravel this layer will correctly refuse it. Dressing the
   * courtyard is `Props.js`'s finding, not this one.
   */
  _buildFarCover(q) {
    const density = q.grassDensity || 0;
    if (density <= 0) { this._farCover = null; return; }

    const far = RANGE.farCover[1];
    const geo = buildCrossCard(2, 1.0, false, 1.0);
    this._geometries.push(geo);

    const opts = {
      name: 'far-cover', mode: 0, map: this.tex.clump, color: 0xffffff,
      // Read at 30-120 m, which is beyond where any per-blade detail survives minification;
      // `broad` is what keeps value inside the silhouette once the fine grain has mipped
      // away, exactly as on grass LOD2, whose alphaTest this shares for the same reason.
      bendExp: 2.0, bendGain: 0.50, flutter: 0.45, alphaTest: 0.34,
      // THE SEAM. `wide` composes its plain at 23-45 m from its own eye (camera 9.5 m over
      // the plateau, box rows y820-1000 at 14.4-22.4 degrees of depression, widened by
      // 1/cos of up to 33.7 degrees of azimuth). The grass ring is camera-centred and ends
      // at grassRadius = 34 m; this layer used to fade IN over [28, 36.4]. So the far half
      // of that box was covered by a layer at 0-100% of its strength and the near half by
      // the ring's outermost LOD at 0.47 cards/m2, and the band where they were supposed to
      // hand over is exactly where the review measured bare dirt with 2.03% dark specks on
      // it. Fading in from 18 puts this layer at full strength by 20.7 m, i.e. *inside* the
      // ring's outer LOD, so the two overlap instead of meeting.
      fadeNear: [18, 18 * 1.15], fadeFar: [far * 0.86, far],
      size: [1, 1], sink: true,
      sss: 1.0, sssColor: 0xc2d884, sssFloor: 0.50,
      // baseAO 0.36 -> 0.20. At a 13-degree sun half of these cards face away from the key
      // and are lit by the cool #4a6b8f fill and nothing else; the review measured that
      // population at mean RGB 12.4, 15.7, 19.8 against lit ground at 76.0, 60.4, 53.7 —
      // "a cool near-black speck four times darker than the surface it sits on". An AO term
      // that removes another 36% of the only light those fragments get is most of the way
      // to black before the tone map sees them.
      tipGlow: 0.18, baseAO: 0.20, grain: 0.16, broad: 0.22,
    };
    const mat = this._makeMaterial(opts);

    // 6 500 -> 10 500, which is the smaller half of the change. Deterministic A/B puts this
    // layer at 5.62% of the critic's `wide` box today; the fade window above is worth about
    // 1.8x of that on its own (most of the box sits inside the old 28-36.4 m fade-in), the
    // card area below 1.82x, and this 1.6x — the three multiply, against a 12% target from
    // 5.62%. The card is four triangles and shares one draw call however many there are, so
    // the cost is submitted triangles only: 10 920 at MEDIUM, of which `_packOne` was
    // keeping 79% in range at the `wide` pose, is about 34 500 against 21 340 before.
    const target = Math.round(10500 * clamp(0.6 + density * 0.8, 0.6, 1.5));
    const a = new Float32Array(target * 4);
    const b = new Float32Array(target * 4);
    const c = new Float32Array(target * 4);
    const rnd = makeRandom(0xC0FFEE);
    const col = _colScratch;
    let n = 0;

    // Scattered over a 150 m disc, not the 118 m fade range: `valley` looks away from the
    // origin from 46.7 m out, so the far end of its own measurement box lands at 133 m of
    // world radius. The fade window, which is camera-relative, is what bounds the cost.
    const scatterR = 150;
    for (let i = 0; i < target * 5 && n < target; i++) {
      // Uniform over the disc, so density per square metre is flat rather than piling the
      // whole population against the centre where the grass ring already sits.
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * scatterR;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;

      // Cheapest rejections first — a noise lookup before any terrain query, which is the
      // same ordering _generateGrassTile uses.
      const clump = clamp(noise.fbm2(x * 0.043 + 12.7, z * 0.043 - 5.1, 3) * 0.5 + 0.5, 0, 1);
      if (rnd() > 0.20 + Math.pow(clump, 1.5) * 0.92) continue;
      if (this._slopeAt(x, z) > 0.62) continue;

      const h0 = this._heightAt(x, z);
      if (!(h0 >= WORLD.WATER_LEVEL + 0.4)) continue;   // rejecting form: false for NaN
      const surf = this._surfaceAt(x, z);
      // 0 on the swept plateau, 1 out in the basin. Only the mineral surfaces are relaxed.
      const off = 1 - plateauMask(x, z);
      let w;
      switch (surf) {
        case 'water': case 'path': case 'wood': w = 0; break;
        case 'rock': w = 0.08 * off; break;
        case 'stone': w = 0.18 * off; break;
        case 'gravel': case 'sand': w = 0.50 * off; break;
        case 'dirt': w = 0.85; break;
        default: w = 1.0;
      }
      // The splat's own turf weight, as a modulation — see `_coverAt`. Without it this
      // scatter is flat inside every named surface, and a flat scatter is what the review
      // reads as litter: raising the count alone thickens the litter everywhere instead of
      // massing it where the ground says cover belongs.
      w *= this._coverAt(x, z);
      if (w <= 0.02 || rnd() > w) continue;

      const y = this._plantY(x, z, _plant);

      // Same autumn drift field as the near grass, at the same frequencies, so the two
      // layers agree on where the basin is dry and where it is still mossy. A second
      // palette here would read as a colour seam at the ring's edge.
      const dry = clamp(noise.fbm2(x * 0.021 + 41.3, z * 0.021 - 17.7, 3) * 0.5 + 0.5, 0, 1);
      const burn = clamp(noise.fbm2(x * 0.055 - 7.1, z * 0.055 + 3.9, 2) * 0.5 + 0.5, 0, 1);
      col.copy(AUTUMN_A).lerp(AUTUMN_B, Math.pow(dry, 1.15));
      col.lerp(AUTUMN_C, Math.pow(burn, 2.2) * dry * 0.9);
      const shade = 0.86 + rnd() * 0.40;

      const o = n * 4;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = rnd() * Math.PI * 2;
      // Tussock scale: tall enough to break the ground plane at a 6-10 degree grazing
      // angle, short enough that it never silhouettes against the far ridge.
      //
      // Up from 0.55-1.30 x 1.05-2.35. The dark-component census of the review frame is
      // the reason: over the critic's own box the vegetation islands run area p10 8 px,
      // p50 13 px, p90 69 px with a median bounding box of 5 x 6 px, i.e. the layer is
      // not one stamp (that spread is 8.6:1) — it is a field of things too small to read
      // as plants at all. Screen area goes as width x height: mean height 0.925 -> 1.346 m
      // (the 0.72 power has mean 1/1.72, i.e. it skews toward the taller end without moving
      // either end of the range) and mean width 1.70 -> 2.125 m, so 1.82x the area per card
      // — silhouette rather than uniform bulk, and the top of the range is unchanged so
      // nothing here can start silhouetting against the far ridge that did not before.
      b[o] = 0.62 + Math.pow(rnd(), 0.72) * 1.25;       // height, metres
      b[o + 1] = 1.25 + rnd() * 1.75;                   // width, metres
      b[o + 2] = 0.55 + rnd() * 0.45;                   // limp, like grass
      b[o + 3] = rnd();
      c[o] = col.r * shade; c[o + 1] = col.g * shade; c[o + 2] = col.b * shade;
      c[o + 3] = _plant.sag;
      n++;
    }

    const mesh = this._makeBatchMesh(geo, mat, null, Math.max(1, n), false);
    mesh.name = 'far-cover';
    this._fill(mesh, a, b, c, n, 2);
    this._registerPack(mesh, a, b, c, n, mat, 2);
    this._farCover = { mesh, mat, count: n };
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
    const bel = [];
    for (let j = 0; j <= rings; j++) {
      const tr = j / rings;
      // Log-ish spacing: dense near the lip where the silhouette matters, sparse far out.
      const r = rInner + (rOuter - rInner) * Math.pow(tr, 1.9);
      const row = [];
      const brow = [];
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
        brow.push(below);
      }
      idx.push(row);
      bel.push(brow);
    }
    // Where `below` is zero the shell has no canopy height and no bump either, so it
    // degenerates into a skin lying a few centimetres over the terrain — and the shell
    // reaches 900 m, which is the mountain. That skin was painting the entire ridge and
    // both peaks in canopy green: a flat unlit fill following a region boundary rather
    // than any geometry, which is exactly what a debug overlay looks like in review.
    // Drop those quads. The sea keeps its silhouette and the mountain gets its rock back.
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const maxBelow = Math.max(bel[j][i], bel[j][i + 1], bel[j + 1][i + 1], bel[j + 1][i]);
        if (maxBelow < 0.06) continue;
        g.quad(idx[j][i], idx[j][i + 1], idx[j + 1][i + 1], idx[j + 1][i]);
      }
    }
    const geo = g.toGeometry();
    this._geometries.push(geo);

    // A plain lit material — no instancing, no bend function, just fog and a slow ripple.
    const mat = new MeshLambertMaterial({
      name: 'foliage/canopy',
      // The single biggest patch of green in the wide and valley framings: this shell is
      // the bamboo sea from 110 m out. 0x59703f is linear G/R 1.62 and, multiplied by the
      // two tone vectors below, still landed under GREEN_RATIO — so the one surface that
      // covers half the valley was rendering amber and the "bamboo sea" had no colour to
      // give the frame at all.
      color: 0x4a7a30,
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
  // These multiply an already-linear albedo, so their own G/R compounds with it.
  vec3 deep = vec3( 0.13, 0.26, 0.13 );
  vec3 lit = vec3( 0.36, 0.58, 0.24 );
  diffuseColor.rgb *= mix( deep, lit, n1 * 0.75 + n2 * 0.25 ) * ( 0.85 + vCanopyG * 0.35 ) * 2.0;
}
`)
        .replace('#include <envmap_fragment>', /* glsl */`
{
  // Cheap canopy translucency so the sea glows where the sun grazes it. Kept modest: this
  // term is the amber key multiplied straight into the albedo, so it is the one place the
  // shell can be dragged back over to red, and it faces the camera across the whole valley.
  vec3 V = normalize( cameraPosition - vCanopyW );
  float forward = pow( clamp( dot( V, -uSunDir ) * 0.5 + 0.5, 0.0, 1.0 ), 3.0 );
  outgoingLight += diffuseColor.rgb * uSunColor * forward * 0.38;
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

    // Compact the fixed instanced sets against their fade windows. Hysteresis is the
    // whole point — a repack per frame would cost more than the submissions it saves —
    // and PACK_MARGIN is both the slack and the trigger, so nothing can leave the packed
    // set while it is still inside its own window. See `_registerPack`.
    if (cam && finiteVec(cam.position) &&
        cam.position.distanceToSquared(this._packAt) > PACK_MARGIN * PACK_MARGIN) {
      this._packAt.copy(cam.position);
      this._repackAll(cam.position);
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
    // Every fade window below is about to move, and the packed sets are cut against
    // those windows — so invalidate the hysteresis rather than wait for the camera to
    // travel PACK_MARGIN. A tier flip that widened a window would otherwise leave the
    // newly in-range instances missing until the player walked twelve metres.
    this._packAt.set(Infinity, Infinity, Infinity);

    this._buildGrassBuckets(q);

    // Grass fade windows are set inside _buildGrassBuckets; the rest scale off the radius.
    const radius = Math.max(q.grassRadius || 0, 18);

    if (this._bambooAssets) {
      const A = this._bambooAssets;
      const plantFar = clamp(radius * 1.35, 26, RANGE.bambooCulm[1]);
      A.plant.mat.userData.kag.uFadeFar.value.set(plantFar * 0.88, plantFar);
      // The card has to be at FULL strength before the near plant starts thinning, or the
      // two layers hand off through a band where neither is at full density and the slope
      // goes thin exactly where the overlook frames it. Fade in over the 40% of the plant's
      // range below its own fade-out, never later.
      A.card.mat.userData.kag.uFadeNear.value.set(plantFar * 0.50, plantFar * 0.80);
      A.card.mat.userData.kag.uFadeFar.value.set(RANGE.bambooCard[1] * 0.88, RANGE.bambooCard[1]);
    }
    if (this._bamboo) {
      this._bamboo.plantMesh.castShadow = shadows;
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
    if (this._farCover) {
      // The near edge tracks the ring it hands off from, so a tier that shrinks the ring
      // does not open a bare annulus between the two layers.
      // Overlapping, not abutting: see the fadeNear note in _buildFarCover. The near edge
      // is held at 18 or below so this layer is at full strength inside the ring's outer
      // LOD rather than fading in exactly where the ring is fading out.
      const k = this._farCover.mat.userData.kag;
      const near = Math.min(18, Math.max(12, radius * 0.55));
      k.uFadeNear.value.set(near, near * 1.15);
      k.uFadeFar.value.set(RANGE.farCover[1] * 0.86, RANGE.farCover[1]);
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
    this._farCover = null;
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
