/**
 * Sky.js — analytic atmosphere, sun disc, cloud deck, time-of-day and aerial perspective.
 *
 * The single biggest lever on whether KAGEROU reads as AAA is the sky. So this is a real
 * Preetham daylight model (Rayleigh/Mie split, Perez-style zenith attenuation, forward
 * scattering aureole) rather than a gradient: the Mie lobe around a low sun and the
 * desaturated horizon band are exactly what a hand-painted ramp cannot fake.
 *
 * Everything expensive is precomputed on the JS side and uploaded as uniforms — the
 * fragment shader only does the per-direction work. The cloud deck is a flat analytic
 * slab intersected per layer, so "volumetric-looking" costs 2–12 noise taps, tier-gated.
 *
 * Owns: the sky dome, the environment cubemap + PMREM, and the shared aerial-perspective
 * fog chunks that every other author injects into their materials via `applyFog()`.
 */

import {
  BackSide, Color, CubeCamera, LinearSRGBColorSpace, Mesh, PMREMGenerator,
  ShaderMaterial, SphereGeometry, Vector2, Vector3, WebGLCubeRenderTarget,
  HalfFloatType, Scene,
} from 'three';
import { glslNoise, clamp, lerp, smoothstep } from '../core/Noise.js';

// ------------------------------------------------------------------ constants

const DEG = Math.PI / 180;

/** Preetham's total Rayleigh scattering at 680/550/450 nm, and the Mie constant. */
const TOTAL_RAYLEIGH = new Vector3(5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5);
const MIE_CONST = new Vector3(1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14);

const RAYLEIGH_ZENITH_LENGTH = 8.4e3;
const MIE_ZENITH_LENGTH = 1.25e3;
const SUN_E0 = 1000.0;
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;

/** The sun subtends 0.53°; half of that in radians is the disc radius we draw. */
const SUN_ANGULAR_RADIUS = 0.53 * 0.5 * DEG;
const MOON_ANGULAR_RADIUS = 0.52 * 0.5 * DEG;

/** Shrine latitude (central Honshū) and an autumn solar declination. */
const LATITUDE = 35.7 * DEG;
const DECLINATION = -6.5 * DEG;

// --------------------------------------------------------- module scratch space
// Pre-allocated so update() never allocates. Never hold a reference to these.

const _colA = new Color();

// -------------------------------------------------------------- colour ladder
//
// Hand-authored grade. Preetham gives us the physics; this gives us the film.
// `t` is the fraction of a 24 h day. Entries must be sorted and the table wraps.

function K(t, o) { o.t = t; return o; }

const LADDER = [
  K(0.00, {
    turbidity: 2.2, rayleigh: 1.35, mie: 0.0035, mieG: 0.76,
    exposure: 0.42, sunIntensity: 0.10, ambient: 0.20,
    tint: new Color(0.62, 0.74, 1.00), sunTint: new Color(0.72, 0.80, 1.00),
    sky: new Color(0x1b2740), ground: new Color(0x0d1017),
    fogColor: new Color(0x1a2537), fogSun: new Color(0x2b3a55), fogTop: new Color(0x121a2a),
    fogDensity: 0.0085, stars: 1.0, cloudCoverage: 0.56,
    cloudLit: new Color(0x39456a), cloudDark: new Color(0x10151f), moon: 1.0,
  }),
  K(0.19, {   // 04:33 — astronomical to nautical twilight, the deepest blue
    turbidity: 2.6, rayleigh: 1.9, mie: 0.0045, mieG: 0.78,
    exposure: 0.50, sunIntensity: 0.22, ambient: 0.24,
    tint: new Color(0.66, 0.78, 1.05), sunTint: new Color(0.80, 0.82, 1.00),
    sky: new Color(0x24365c), ground: new Color(0x151a24),
    fogColor: new Color(0x27374f), fogSun: new Color(0x4b5170), fogTop: new Color(0x1a2438),
    fogDensity: 0.0125, stars: 0.55, cloudCoverage: 0.53,
    cloudLit: new Color(0x5a5f84), cloudDark: new Color(0x1b2130), moon: 0.7,
  }),
  K(0.265, {  // 06:22 — sunrise, the coldest warm light of the day
    turbidity: 4.2, rayleigh: 2.6, mie: 0.011, mieG: 0.80,
    exposure: 0.78, sunIntensity: 1.5, ambient: 0.30,
    tint: new Color(1.02, 0.95, 0.94), sunTint: new Color(1.00, 0.68, 0.44),
    sky: new Color(0x5c7ba6), ground: new Color(0x35322e),
    fogColor: new Color(0x8f93a0), fogSun: new Color(0xffb27a), fogTop: new Color(0x6d84a6),
    fogDensity: 0.020, stars: 0.0, cloudCoverage: 0.48,
    cloudLit: new Color(0xffc79a), cloudDark: new Color(0x4a4a5c), moon: 0.0,
  }),
  K(0.35, {   // 08:24 — morning, air still cold, contrast climbing
    turbidity: 3.4, rayleigh: 2.1, mie: 0.006, mieG: 0.78,
    exposure: 0.98, sunIntensity: 2.6, ambient: 0.34,
    tint: new Color(1.00, 1.00, 1.02), sunTint: new Color(1.00, 0.90, 0.76),
    sky: new Color(0x7ba0cc), ground: new Color(0x4a4740),
    fogColor: new Color(0xa8b4c4), fogSun: new Color(0xffd9a8), fogTop: new Color(0x8aa6c8),
    fogDensity: 0.013, stars: 0.0, cloudCoverage: 0.50,
    cloudLit: new Color(0xfff0dc), cloudDark: new Color(0x63697c), moon: 0.0,
  }),
  K(0.50, {   // noon — flattest, least interesting light; we grade it down deliberately
    turbidity: 2.9, rayleigh: 1.7, mie: 0.0042, mieG: 0.76,
    exposure: 1.05, sunIntensity: 3.2, ambient: 0.36,
    tint: new Color(0.99, 1.00, 1.03), sunTint: new Color(1.00, 0.97, 0.92),
    sky: new Color(0x8fb2d9), ground: new Color(0x585349),
    fogColor: new Color(0xb6c2d0), fogSun: new Color(0xf2e3c8), fogTop: new Color(0x93b0d4),
    fogDensity: 0.0105, stars: 0.0, cloudCoverage: 0.52,
    cloudLit: new Color(0xffffff), cloudDark: new Color(0x6f7688), moon: 0.0,
  }),
  K(0.66, {   // 15:50 — the light starts to lengthen and warm
    turbidity: 3.6, rayleigh: 2.0, mie: 0.0062, mieG: 0.79,
    exposure: 1.02, sunIntensity: 3.0, ambient: 0.35,
    tint: new Color(1.03, 0.99, 0.97), sunTint: new Color(1.00, 0.90, 0.74),
    sky: new Color(0x86a8d2), ground: new Color(0x5a5142),
    fogColor: new Color(0xb9bfc6), fogSun: new Color(0xffdda6), fogTop: new Color(0x8ba9cf),
    fogDensity: 0.0125, stars: 0.0, cloudCoverage: 0.51,
    cloudLit: new Color(0xfff3e0), cloudDark: new Color(0x6a7085), moon: 0.0,
  }),
  K(0.78, {   // 18:43 — THE SHOT. Low amber sun, cool blue shadow, mist in the valley.
    turbidity: 5.4, rayleigh: 2.9, mie: 0.0165, mieG: 0.815,
    exposure: 0.96, sunIntensity: 2.35, ambient: 0.33,
    tint: new Color(1.06, 0.97, 0.92), sunTint: new Color(1.00, 0.66, 0.34),
    sky: new Color(0x6f8db8), ground: new Color(0x4c3f31),
    fogColor: new Color(0xa9a8ad), fogSun: new Color(0xff9b52), fogTop: new Color(0x7d97bd),
    fogDensity: 0.0215, stars: 0.0, cloudCoverage: 0.455,
    cloudLit: new Color(0xffb06a), cloudDark: new Color(0x4e4f68), moon: 0.0,
  }),
  K(0.845, {  // 20:17 — dusk, the sun is under the ridge, only the top of the sky is lit
    turbidity: 4.4, rayleigh: 3.3, mie: 0.013, mieG: 0.80,
    exposure: 0.68, sunIntensity: 0.75, ambient: 0.28,
    tint: new Color(0.94, 0.90, 1.02), sunTint: new Color(1.00, 0.47, 0.30),
    sky: new Color(0x4a5f8c), ground: new Color(0x2c2a2c),
    fogColor: new Color(0x6d7085), fogSun: new Color(0xd4623a), fogTop: new Color(0x4c608c),
    fogDensity: 0.0185, stars: 0.18, cloudCoverage: 0.49,
    cloudLit: new Color(0xc4664a), cloudDark: new Color(0x2e3348), moon: 0.25,
  }),
  K(0.90, {   // 21:36 — civil twilight gone, stars in
    turbidity: 3.0, rayleigh: 1.8, mie: 0.0055, mieG: 0.77,
    exposure: 0.48, sunIntensity: 0.18, ambient: 0.22,
    tint: new Color(0.70, 0.80, 1.05), sunTint: new Color(0.78, 0.80, 1.00),
    sky: new Color(0x243352), ground: new Color(0x14161d),
    fogColor: new Color(0x263349), fogSun: new Color(0x3a4664), fogTop: new Color(0x18213a),
    fogDensity: 0.0115, stars: 0.85, cloudCoverage: 0.54,
    cloudLit: new Color(0x424e73), cloudDark: new Color(0x131824), moon: 0.85,
  }),
];

// ----------------------------------------------------------------- glsl chunks

/**
 * Aerial perspective. Exponential *height* fog (so the valley pools with mist while
 * the ridge line stays clear) plus in-scattering biased toward the sun, which is what
 * gives you the warm halo around anything silhouetted against a low sun.
 *
 * Exported so other authors can inline it into hand-written ShaderMaterials.
 */
export const FOG_PARS_VERTEX = /* glsl */`
varying vec3 vKagWorldPos;
`;

export const FOG_VERTEX = /* glsl */`
{
  vec4 kagWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    kagWorld = batchingMatrix * kagWorld;
  #endif
  #ifdef USE_INSTANCING
    kagWorld = instanceMatrix * kagWorld;
  #endif
  vKagWorldPos = ( modelMatrix * kagWorld ).xyz;
}
`;

export const FOG_PARS_FRAGMENT = /* glsl */`
varying vec3 vKagWorldPos;
uniform vec3  uFogColor;
uniform vec3  uFogTopColor;
uniform vec3  uFogSunColor;
uniform vec3  uFogSunDir;
uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform float uFogBaseHeight;
uniform float uFogStart;
uniform float uFogMaxOpacity;
uniform float uFogSunPower;
uniform float uFogSunStrength;

/**
 * Closed-form integral of an exponentially decaying density along the view ray.
 * Returns the blended colour. Linear space — call this *before* tone mapping.
 */
vec3 kagApplyFog( vec3 color, vec3 worldPos, vec3 camPos ) {
  vec3 d = worldPos - camPos;
  float dist = length( d );
  if ( dist < 1e-4 ) return color;
  vec3 rd = d / dist;

  float travel = max( dist - uFogStart, 0.0 );
  float H = max( uFogHeightFalloff, 0.05 );
  float baseH = exp( - ( camPos.y - uFogBaseHeight ) / H );
  float ry = rd.y;
  float integral;
  if ( abs( ry ) > 1e-3 ) {
    integral = baseH * H * ( 1.0 - exp( - travel * ry / H ) ) / ry;
  } else {
    integral = baseH * travel;
  }
  float f = 1.0 - exp( - uFogDensity * integral );
  f = clamp( f, 0.0, 1.0 ) * uFogMaxOpacity;
  if ( f <= 0.0005 ) return color;

  // Looking up we see the clean upper air; looking along the ground we see the valley.
  vec3 fogCol = mix( uFogColor, uFogTopColor, smoothstep( 0.02, 0.55, rd.y ) );

  // In-scattering: Henyey-Greenstein-ish forward lobe toward the sun.
  float cs = max( dot( rd, uFogSunDir ), 0.0 );
  float mie = pow( cs, uFogSunPower );
  fogCol = mix( fogCol, uFogSunColor, clamp( mie * uFogSunStrength, 0.0, 1.0 ) );

  return mix( color, fogCol, f );
}
`;

export const FOG_FRAGMENT = /* glsl */`
gl_FragColor.rgb = kagApplyFog( gl_FragColor.rgb, vKagWorldPos, cameraPosition );
`;

// -------------------------------------------------------------------- shaders

const SKY_VERT = /* glsl */`
varying vec3 vWorldDirection;
void main() {
  vWorldDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w;   // pin to the far plane; depth writes are off anyway
}
`;

function buildSkyFragment(cloudLayers, cloudOct) {
  return /* glsl */`
precision highp float;

varying vec3 vWorldDirection;

uniform vec3  uSunDirection;
uniform vec3  uMoonDirection;
uniform vec3  uBetaR;
uniform vec3  uBetaM;
uniform float uSunE;
uniform float uSunFade;
uniform float uMieG;
uniform vec3  uSkyTint;
uniform float uSkyExposure;
uniform vec3  uGroundColor;
uniform float uStarStrength;
uniform float uMoonStrength;
uniform float uTime;

uniform float uCloudCoverage;
uniform float uCloudScale;
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudDensity;
uniform vec2  uCloudWind;
uniform vec3  uCloudLit;
uniform vec3  uCloudDark;
uniform float uCloudOpacity;

#define CLOUD_LAYERS ${cloudLayers}
#define CLOUD_OCT ${cloudOct}
#define SUN_ANG_R ${SUN_ANGULAR_RADIUS.toFixed(8)}
#define MOON_ANG_R ${MOON_ANGULAR_RADIUS.toFixed(8)}

${glslNoise}

const float PI = 3.141592653589793;
const vec3  UP = vec3( 0.0, 1.0, 0.0 );
const float RAY_ZENITH = ${RAYLEIGH_ZENITH_LENGTH.toFixed(1)};
const float MIE_ZENITH = ${MIE_ZENITH_LENGTH.toFixed(1)};

float rayleighPhase( float c ) {
  return ( 3.0 / ( 16.0 * PI ) ) * ( 1.0 + c * c );
}

float hgPhase( float c, float g ) {
  float g2 = g * g;
  float inv = 1.0 / max( pow( 1.0 - 2.0 * g * c + g2, 1.5 ), 1e-4 );
  return ( 1.0 / ( 4.0 * PI ) ) * ( ( 1.0 - g2 ) * inv );
}

/**
 * Sun disc with quadratic limb darkening. The core stays well above 1.0 so the bloom
 * pass has something real to bleed from — a clamped disc reads as a sticker.
 */
vec3 sunDisc( float cosTheta, vec3 Fex ) {
  float ang = acos( clamp( cosTheta, -1.0, 1.0 ) );
  float t = clamp( ang / SUN_ANG_R, 0.0, 1.0 );
  float limb = sqrt( max( 1.0 - t * t, 0.0 ) );
  float darkening = 1.0 - 0.62 * ( 1.0 - limb );
  float edge = 1.0 - smoothstep( SUN_ANG_R * 0.92, SUN_ANG_R * 1.12, ang );
  float disc = edge * darkening;
  // Aureole: the tight forward-scattered glare that sits just outside the limb.
  float g = max( cosTheta, 0.0 );
  float aureole = pow( g, 2400.0 ) * 2.2 + pow( g, 220.0 ) * 0.20 + pow( g, 26.0 ) * 0.012;
  return ( uSunE * 19000.0 * disc + uSunE * 900.0 * aureole ) * Fex;
}

vec3 moonDisc( vec3 rd ) {
  if ( uMoonStrength <= 0.001 ) return vec3( 0.0 );
  float c = dot( rd, uMoonDirection );
  float ang = acos( clamp( c, -1.0, 1.0 ) );
  float disc = 1.0 - smoothstep( MOON_ANG_R * 0.94, MOON_ANG_R * 1.10, ang );
  // Cheap maria: a couple of noise octaves across the visible face.
  vec2 face = ( rd - uMoonDirection * c ).xz * ( 1.0 / MOON_ANG_R ) * 0.5;
  float maria = 0.78 + 0.22 * fbm2( face * 1.7 + 11.0, 2 );
  float glow = pow( max( c, 0.0 ), 340.0 ) * 0.35 + pow( max( c, 0.0 ), 40.0 ) * 0.03;
  return uMoonStrength * ( vec3( 1.0, 0.98, 0.92 ) * disc * maria * 1.6 + vec3( 0.55, 0.66, 0.9 ) * glow );
}

float stars( vec3 rd ) {
  if ( uStarStrength <= 0.001 || rd.y < -0.02 ) return 0.0;
  vec2 uv = vec2( atan( rd.z, rd.x ) * ( 1.0 / ( 2.0 * PI ) ), acos( clamp( rd.y, -1.0, 1.0 ) ) * ( 1.0 / PI ) );
  uv *= vec2( 260.0, 130.0 );
  vec2 cell = floor( uv );
  float h = hash21( cell );
  if ( h < 0.955 ) return 0.0;
  vec2 o = hash22( cell + 3.7 ) * 0.72 + 0.14;
  float d = length( fract( uv ) - o );
  float s = smoothstep( 0.13, 0.0, d );
  float mag = ( h - 0.955 ) * 22.2;
  float twinkle = 0.62 + 0.38 * sin( uTime * ( 1.4 + h * 9.0 ) + h * 61.0 );
  return s * mag * twinkle * uStarStrength * smoothstep( -0.02, 0.14, rd.y );
}

// ---------------------------------------------------------------- cloud deck

#if CLOUD_LAYERS > 0
float cloudField( vec2 p, float cov ) {
  float f = fbm2( p, CLOUD_OCT ) * 0.5 + 0.5;
  return smoothstep( cov, cov + 0.30, f );
}

/**
 * Flat-slab "raymarch lite": intersect the view ray with CLOUD_LAYERS stacked planes.
 * The parallax between layers, plus a single toward-sun tap for self-shadowing, reads
 * as volume for a fraction of the cost of a real march.
 */
vec4 clouds( vec3 rd, vec3 Fex ) {
  float horizon = smoothstep( 0.008, 0.10, rd.y );
  if ( horizon <= 0.0 ) return vec4( 0.0 );

  float acc = 0.0;
  float topDens = 0.0;
  vec2 topP = vec2( 0.0 );

  for ( int i = 0; i < CLOUD_LAYERS; i++ ) {
    float k = float( i ) / float( CLOUD_LAYERS );
    float h = uCloudHeight * ( 1.0 + k * uCloudThickness );
    float t = h / max( rd.y, 0.008 );
    vec2 p = rd.xz * t * uCloudScale + uCloudWind * ( 1.0 + k * 0.18 );
    float d = cloudField( p, uCloudCoverage + k * 0.055 );
    acc += d * ( 1.0 - k * 0.35 );
    if ( i == 0 ) { topDens = d; topP = p; }
  }
  float dens = clamp( acc / float( CLOUD_LAYERS ) * uCloudDensity, 0.0, 1.0 );
  if ( dens <= 0.001 ) return vec4( 0.0 );

  // One extra tap displaced toward the sun approximates the transmittance through
  // the deck; the difference is what makes the sunward edges glow.
  vec2 sunOff = normalize( uSunDirection.xz + vec2( 1e-4, 0.0 ) ) * 0.55;
  float toSun = cloudField( topP + sunOff, uCloudCoverage );
  float transmit = exp( -2.6 * toSun );

  float cs = dot( rd, uSunDirection );
  float silver = pow( max( cs, 0.0 ), 12.0 ) * ( 1.0 - dens ) * 2.4 + hgPhase( cs, 0.62 ) * 1.2;

  vec3 lit = uCloudLit * ( 0.35 + 0.65 * transmit ) * ( 1.0 + silver );
  vec3 col = mix( uCloudDark, lit, clamp( transmit + silver * 0.35, 0.0, 1.0 ) );
  col *= Fex * 0.6 + 0.4;

  float alpha = dens * horizon * uCloudOpacity;
  // Thin the deck out toward the zenith edge of the slab so it never hard-cuts.
  alpha *= smoothstep( 0.0, 0.06, rd.y );
  return vec4( col, clamp( alpha, 0.0, 1.0 ) );
}
#endif

// ------------------------------------------------------------ Preetham daylight

vec3 skyRadiance( vec3 rd, out vec3 FexOut ) {
  float cosUp = max( dot( UP, rd ), 0.0 );
  float zenithAngle = acos( cosUp );
  float denom = cos( zenithAngle ) + 0.15 * pow( max( 93.885 - zenithAngle * ( 180.0 / PI ), 1e-3 ), -1.253 );
  float inverse = 1.0 / max( denom, 1e-4 );

  float sR = RAY_ZENITH * inverse;
  float sM = MIE_ZENITH * inverse;
  vec3 Fex = exp( -( uBetaR * sR + uBetaM * sM ) );
  FexOut = Fex;

  float cosTheta = dot( rd, uSunDirection );
  vec3 betaRTheta = uBetaR * rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaMTheta = uBetaM * hgPhase( cosTheta, uMieG );
  vec3 ratio = ( betaRTheta + betaMTheta ) / ( uBetaR + uBetaM );

  vec3 Lin = pow( uSunE * ratio * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix(
    vec3( 1.0 ),
    pow( uSunE * ratio * Fex, vec3( 0.5 ) ),
    clamp( pow( 1.0 - dot( UP, uSunDirection ), 5.0 ), 0.0, 1.0 )
  );

  vec3 L0 = vec3( 0.1 ) * Fex;
  L0 += sunDisc( cosTheta, Fex );

  vec3 tex = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  return pow( max( tex, vec3( 0.0 ) ), vec3( 1.0 / ( 1.2 + 1.2 * uSunFade ) ) );
}

void main() {
  vec3 rd = normalize( vWorldDirection );

  vec3 Fex;
  vec3 col = skyRadiance( rd, Fex );

  col += moonDisc( rd );
  col += vec3( 0.86, 0.90, 1.0 ) * stars( rd );

#if CLOUD_LAYERS > 0
  vec4 cl = clouds( rd, Fex );
  col = mix( col, cl.rgb, cl.a );
#endif

  // Below the horizon we fade into the ground haze so the dome never shows a hard seam
  // where the terrain silhouette does not quite reach.
  col = mix( col, uGroundColor, smoothstep( 0.0, -0.16, rd.y ) );

  col *= uSkyTint * uSkyExposure;

  gl_FragColor = vec4( max( col, vec3( 0.0 ) ), 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

// ------------------------------------------------------------------- helpers

/** Chain onto an existing onBeforeCompile instead of stomping another author's patch. */
function chainBeforeCompile(material, fn) {
  const prev = material.onBeforeCompile;
  if (prev && prev !== Material_noop) {
    material.onBeforeCompile = function (shader, renderer) {
      prev.call(this, shader, renderer);
      fn.call(this, shader, renderer);
    };
  } else {
    material.onBeforeCompile = fn;
  }
}
function Material_noop() {}

/** Program cache keys must differ once we inject code, or three hands us a stale program. */
function chainCacheKey(material, token) {
  const prev = material.customProgramCacheKey;
  material.customProgramCacheKey = function () {
    return (prev ? prev.call(this) : '') + '|' + token;
  };
}

// =============================================================================

export class SkySystem {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.sky = this;

    /** Fraction of a 24 h day. Magic hour is the shot we are chasing. */
    this.time = 0.78;
    /** Day fractions advanced per second of wall clock. 0 = frozen. */
    this.autoAdvance = 0;

    this.sunDirection = new Vector3(0, 0.2, -1);
    this.moonDirection = new Vector3(0, -0.2, 1);
    this.sunColor = new Color(0xffd9a8);
    this.moonColor = new Color(0x8fa6d8);
    this.skyColor = new Color(0x6f8db8);
    this.groundColor = new Color(0x4c3f31);
    this.sunIntensity = 2.35;
    this.ambientIntensity = 0.33;
    this.envMap = null;

    /** Read-only view of the fog for other systems (Weather tints its own particles). */
    this.fogParams = {
      color: new Color(0xa9a8ad),
      topColor: new Color(0x7d97bd),
      sunColor: new Color(0xff9b52),
      density: 0.0215,
      heightFalloff: 26,
      baseHeight: 0,
      start: 6,
      maxOpacity: 0.96,
      sunPower: 9,
      sunStrength: 0.85,
    };

    /** Shared uniform objects — patched materials hold these by reference. */
    this.fogUniforms = {
      uFogColor: { value: new Color(0xa9a8ad) },
      uFogTopColor: { value: new Color(0x7d97bd) },
      uFogSunColor: { value: new Color(0xff9b52) },
      uFogSunDir: { value: new Vector3(0, 0.2, -1) },
      uFogDensity: { value: 0.0215 },
      uFogHeightFalloff: { value: 26 },
      uFogBaseHeight: { value: 0 },
      uFogStart: { value: 6 },
      uFogMaxOpacity: { value: 0.96 },
      uFogSunPower: { value: 9 },
      uFogSunStrength: { value: 0.85 },
    };

    /** GLSL for authors who hand-write ShaderMaterials and want the same fog. */
    this.chunks = {
      fogParsVertex: FOG_PARS_VERTEX,
      fogVertex: FOG_VERTEX,
      fogParsFragment: FOG_PARS_FRAGMENT,
      fogFragment: FOG_FRAGMENT,
    };

    this.uniforms = null;
    this.material = null;
    this.mesh = null;

    this._fogMaterials = new Set();
    this._cubeRT = null;
    this._cubeCamera = null;
    this._pmrem = null;
    this._pmremRT = null;
    this._envScene = null;
    this._envSky = null;
    this._envSunDir = new Vector3(0, -1, 0);
    this._envCooldown = 0;
    this._envDirty = true;

    this._grade = this._makeGrade();
    this._cloudWind = new Vector2(0, 0);
    this._elapsed = 0;
    this._windSpeed = 0.012;
  }

  // ----------------------------------------------------------------- lifecycle

  async init() {
    const q = this.ctx.quality;

    this.uniforms = {
      uSunDirection: { value: this.sunDirection },
      uMoonDirection: { value: this.moonDirection },
      uBetaR: { value: new Vector3() },
      uBetaM: { value: new Vector3() },
      uSunE: { value: 1000 },
      uSunFade: { value: 0.5 },
      uMieG: { value: 0.8 },
      uSkyTint: { value: new Vector3(1, 1, 1) },
      uSkyExposure: { value: 1 },
      uGroundColor: { value: new Vector3(0.06, 0.05, 0.04) },
      uStarStrength: { value: 0 },
      uMoonStrength: { value: 0 },
      uTime: { value: 0 },
      uCloudCoverage: { value: 0.46 },
      uCloudScale: { value: 0.00055 },
      uCloudHeight: { value: 1700 },
      uCloudThickness: { value: 0.42 },
      uCloudDensity: { value: 1.25 },
      uCloudWind: { value: this._cloudWind },
      uCloudLit: { value: new Vector3(1, 0.69, 0.42) },
      uCloudDark: { value: new Vector3(0.3, 0.31, 0.4) },
      uCloudOpacity: { value: 0.95 },
    };

    // radius 420 with the engine's 900 m far plane: the dome follows the camera, so it
    // is always exactly half a far-plane away and never clips against distant terrain.
    this._geometry = new SphereGeometry(420, 40, 24);
    this.material = new ShaderMaterial({
      name: 'KagerouSky',
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: buildSkyFragment(...this._cloudTier(q)),
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    });

    this.mesh = new Mesh(this._geometry, this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = true;
    this.ctx.scene.add(this.mesh);
    this.ctx.scene.background = null;   // the dome is the background

    // A private scene holding a second dome at the origin, so the cube camera captures
    // only the atmosphere and never the geometry the player is standing next to.
    this._envScene = new Scene();
    this._envSky = new Mesh(this._geometry, this.material);
    this._envSky.frustumCulled = false;
    this._envScene.add(this._envSky);

    this._pmrem = new PMREMGenerator(this.ctx.renderer);
    this._pmrem.compileCubemapShader();
    this._makeCubeTarget(q.envMapSize);

    this.setTime(this.time);
    this._renderEnvironment(true);
  }

  _cloudTier(q) {
    // taps = layers * octaves; the brief allows 6-10, LOW gets a token 2-tap deck.
    switch (q.tier) {
      case 0: return [1, 2];
      case 1: return [2, 3];
      case 2: return [3, 3];
      default: return [3, 4];
    }
  }

  _makeCubeTarget(size) {
    if (this._cubeRT) this._cubeRT.dispose();
    this._cubeRT = new WebGLCubeRenderTarget(Math.max(32, size | 0), {
      type: HalfFloatType,
      colorSpace: LinearSRGBColorSpace,
      generateMipmaps: false,
    });
    this._cubeCamera = new CubeCamera(1, 1000, this._cubeRT);
  }

  // ------------------------------------------------------------ time of day

  /**
   * `t` is the fraction of a 24 h day (0.78 ≈ 18:43, magic hour). Drives the solar
   * position from a real (if simplified) sun path, then the whole grade ladder.
   */
  setTime(t) {
    this.time = t - Math.floor(t);
    const hourAngle = (this.time - 0.5) * 2 * Math.PI;

    const sinDec = Math.sin(DECLINATION), cosDec = Math.cos(DECLINATION);
    const sinLat = Math.sin(LATITUDE), cosLat = Math.cos(LATITUDE);
    const sinEl = sinDec * sinLat + cosDec * cosLat * Math.cos(hourAngle);
    const elevation = Math.asin(clamp(sinEl, -1, 1));
    // Azimuth measured from due south, then rotated to a compass bearing from north.
    const azSouth = Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * sinLat - Math.tan(DECLINATION) * cosLat,
    );
    const azimuth = azSouth + Math.PI;

    const ce = Math.cos(elevation);
    this.sunDirection.set(ce * Math.sin(azimuth), Math.sin(elevation), -ce * Math.cos(azimuth)).normalize();
    // The moon rides the opposite arc with a small orbital tilt so it is never a
    // perfect mirror of the sun (which reads as a bug).
    this.moonDirection.set(-this.sunDirection.x, -this.sunDirection.y, -this.sunDirection.z);
    this.moonDirection.y += 0.22;
    this.moonDirection.x += 0.12;
    this.moonDirection.normalize();

    this._sampleLadder(this.time, this._grade);
    this._applyGrade();
    this._envDirty = true;
  }

  _makeGrade() {
    return {
      turbidity: 5.4, rayleigh: 2.9, mie: 0.0165, mieG: 0.815,
      exposure: 0.96, sunIntensity: 2.35, ambient: 0.33,
      tint: new Color(), sunTint: new Color(),
      sky: new Color(), ground: new Color(),
      fogColor: new Color(), fogSun: new Color(), fogTop: new Color(),
      fogDensity: 0.02, stars: 0, cloudCoverage: 0.46,
      cloudLit: new Color(), cloudDark: new Color(), moon: 0,
    };
  }

  /** Cyclic keyframe lookup. Writes into `out` — never allocates. */
  _sampleLadder(t, out) {
    const n = LADDER.length;
    let i = n - 1;
    for (let k = 0; k < n; k++) {
      if (LADDER[k].t <= t) i = k; else break;
    }
    const a = LADDER[i];
    const b = LADDER[(i + 1) % n];
    let span = b.t - a.t;
    if (span <= 0) span += 1;
    let u = (t - a.t) / span;
    if (u < 0) u += 1 / span;
    u = smoothstep(0, 1, clamp(u, 0, 1));

    out.turbidity = lerp(a.turbidity, b.turbidity, u);
    out.rayleigh = lerp(a.rayleigh, b.rayleigh, u);
    out.mie = lerp(a.mie, b.mie, u);
    out.mieG = lerp(a.mieG, b.mieG, u);
    out.exposure = lerp(a.exposure, b.exposure, u);
    out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, u);
    out.ambient = lerp(a.ambient, b.ambient, u);
    out.fogDensity = lerp(a.fogDensity, b.fogDensity, u);
    out.stars = lerp(a.stars, b.stars, u);
    out.cloudCoverage = lerp(a.cloudCoverage, b.cloudCoverage, u);
    out.moon = lerp(a.moon, b.moon, u);
    out.tint.copy(a.tint).lerp(b.tint, u);
    out.sunTint.copy(a.sunTint).lerp(b.sunTint, u);
    out.sky.copy(a.sky).lerp(b.sky, u);
    out.ground.copy(a.ground).lerp(b.ground, u);
    out.fogColor.copy(a.fogColor).lerp(b.fogColor, u);
    out.fogSun.copy(a.fogSun).lerp(b.fogSun, u);
    out.fogTop.copy(a.fogTop).lerp(b.fogTop, u);
    out.cloudLit.copy(a.cloudLit).lerp(b.cloudLit, u);
    out.cloudDark.copy(a.cloudDark).lerp(b.cloudDark, u);
    return out;
  }

  /** Push the graded state into the shader uniforms, the key light and the fog. */
  _applyGrade() {
    const g = this._grade;
    const u = this.uniforms;
    if (!u) return;

    // Preetham's per-frame constants; all direction-independent, so JS not GLSL.
    const sunY = this.sunDirection.y;
    const sunFade = 1 - clamp(1 - Math.exp(sunY), 0, 1);
    const rayleighCoefficient = g.rayleigh - 1.0 * (1 - sunFade);
    const c = 0.2 * g.turbidity * 10e-18;

    u.uBetaR.value.copy(TOTAL_RAYLEIGH).multiplyScalar(rayleighCoefficient);
    u.uBetaM.value.copy(MIE_CONST).multiplyScalar(0.434 * c * g.mie);
    u.uSunFade.value = sunFade;
    u.uMieG.value = g.mieG;

    const zenithCos = clamp(sunY, -1, 1);
    u.uSunE.value = SUN_E0 * Math.max(0, 1 - Math.pow(Math.E, -((CUTOFF_ANGLE - Math.acos(zenithCos)) / STEEPNESS)));

    u.uSkyTint.value.set(g.tint.r, g.tint.g, g.tint.b);
    u.uSkyExposure.value = g.exposure;
    u.uGroundColor.value.set(g.ground.r, g.ground.g, g.ground.b);
    u.uStarStrength.value = g.stars;
    u.uMoonStrength.value = g.moon;
    u.uCloudCoverage.value = g.cloudCoverage;
    u.uCloudLit.value.set(g.cloudLit.r, g.cloudLit.g, g.cloudLit.b);
    u.uCloudDark.value.set(g.cloudDark.r, g.cloudDark.g, g.cloudDark.b);

    // --- key light -----------------------------------------------------------
    // Extinction along the sun's own ray gives the physically-motivated warm shift;
    // the ladder's sunTint is the art direction on top of it.
    this._sunTransmittance(_colA);
    this.sunColor.copy(_colA).multiply(g.sunTint);
    const peak = Math.max(this.sunColor.r, this.sunColor.g, this.sunColor.b, 1e-4);
    this.sunColor.multiplyScalar(1 / peak);
    // Below the ridge line the key light has to die or shadows go black-on-black.
    const horizonFade = smoothstep(-0.09, 0.06, sunY);
    this.sunIntensity = g.sunIntensity * lerp(0.18, 1, horizonFade);
    this.ambientIntensity = g.ambient;
    this.skyColor.copy(g.sky);
    this.groundColor.copy(g.ground);
    this.moonColor.setRGB(0.62, 0.72, 1.0);

    // --- fog -----------------------------------------------------------------
    const fp = this.fogParams;
    fp.color.copy(g.fogColor);
    fp.topColor.copy(g.fogTop);
    fp.sunColor.copy(g.fogSun);
    fp.density = g.fogDensity;
    fp.sunPower = lerp(16, 6, smoothstep(0.5, 0.0, Math.abs(sunY)));
    fp.sunStrength = lerp(0.35, 0.95, smoothstep(0.45, 0.02, Math.abs(sunY)));

    const fu = this.fogUniforms;
    fu.uFogColor.value.copy(fp.color);
    fu.uFogTopColor.value.copy(fp.topColor);
    fu.uFogSunColor.value.copy(fp.sunColor);
    fu.uFogSunDir.value.copy(this.sunDirection);
    fu.uFogDensity.value = fp.density;
    fu.uFogHeightFalloff.value = fp.heightFalloff;
    fu.uFogBaseHeight.value = fp.baseHeight;
    fu.uFogStart.value = fp.start;
    fu.uFogMaxOpacity.value = fp.maxOpacity;
    fu.uFogSunPower.value = fp.sunPower;
    fu.uFogSunStrength.value = fp.sunStrength;

    // Keep the engine's built-in FogExp2 roughly in step for anything unpatched.
    const fog = this.ctx.scene.fog;
    if (fog) {
      fog.color.copy(fp.color);
      if ('density' in fog) fog.density = fp.density * 0.55;
    }
  }

  /** Atmospheric extinction along the ray to the sun, normalised to a Color. */
  _sunTransmittance(out) {
    const sunY = clamp(this.sunDirection.y, -1, 1);
    const zenithAngle = Math.acos(Math.max(0, sunY));
    const deg = zenithAngle * (180 / Math.PI);
    const denom = Math.cos(zenithAngle) + 0.15 * Math.pow(Math.max(93.885 - deg, 1e-3), -1.253);
    const inverse = 1 / Math.max(denom, 1e-4);
    const sR = RAYLEIGH_ZENITH_LENGTH * inverse;
    const sM = MIE_ZENITH_LENGTH * inverse;
    const bR = this.uniforms.uBetaR.value;
    const bM = this.uniforms.uBetaM.value;
    out.setRGB(
      Math.exp(-(bR.x * sR + bM.x * sM)),
      Math.exp(-(bR.y * sR + bM.y * sM)),
      Math.exp(-(bR.z * sR + bM.z * sM)),
    );
    const peak = Math.max(out.r, out.g, out.b, 1e-5);
    out.multiplyScalar(1 / peak);
    return out;
  }

  // ------------------------------------------------------------------- fog api

  /**
   * Inject the aerial-perspective fog into any lit or unlit material. Idempotent, and
   * it disables three's own linear fog on that material so we never double-fog.
   */
  applyFog(material) {
    if (!material || material.userData?.kagFog) return material;
    if (material.isRawShaderMaterial) return material;   // author owns their own prefix

    material.userData = material.userData || {};
    material.userData.kagFog = true;
    material.fog = false;
    this._fogMaterials.add(material);

    const uniforms = this.fogUniforms;
    chainBeforeCompile(material, (shader) => {
      // Share the uniform *objects* so one write per frame updates every material.
      for (const k in uniforms) shader.uniforms[k] = uniforms[k];

      let vs = shader.vertexShader;
      if (vs.indexOf('#include <project_vertex>') >= 0) {
        vs = vs.replace('#include <common>', '#include <common>\n' + FOG_PARS_VERTEX);
        vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + FOG_VERTEX);
        shader.vertexShader = vs;

        let fs = shader.fragmentShader;
        fs = fs.replace('#include <common>', '#include <common>\n' + FOG_PARS_FRAGMENT);
        // Linear space, before tone mapping — fog is radiance, not a screen tint.
        if (fs.indexOf('#include <tonemapping_fragment>') >= 0) {
          fs = fs.replace('#include <tonemapping_fragment>', FOG_FRAGMENT + '\n#include <tonemapping_fragment>');
        } else {
          fs = fs.replace(/\}\s*$/, FOG_FRAGMENT + '\n}');
        }
        shader.fragmentShader = fs;
      }
    });
    chainCacheKey(material, 'kagfog1');
    material.needsUpdate = true;
    return material;
  }

  /** Walk a subtree and fog everything in it. Convenience for world/prop authors. */
  applyFogToObject(object3D) {
    object3D.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this.applyFog(m[i]); }
      else this.applyFog(m);
    });
    return object3D;
  }

  // ------------------------------------------------------------- environment

  /** Cube-render the dome, PMREM it, and hand it to the scene. Never per frame. */
  _renderEnvironment(force = false) {
    if (!this._cubeCamera || !this._pmrem) return;
    if (!force && !this._envDirty) return;

    const renderer = this.ctx.renderer;
    this._cubeCamera.update(renderer, this._envScene);

    const prev = this._pmremRT;
    this._pmremRT = this._pmrem.fromCubemap(this._cubeRT.texture);
    if (prev) prev.dispose();

    this.envMap = this._pmremRT.texture;
    this.ctx.scene.environment = this.envMap;
    this._envSunDir.copy(this.sunDirection);
    this._envDirty = false;
    this._envCooldown = 0.25;
  }

  // ------------------------------------------------------------------ system

  update(dt, elapsed) {
    if (!this.material) return;

    if (this.autoAdvance !== 0) this.setTime(this.time + this.autoAdvance * dt);

    this._elapsed = elapsed;
    this.uniforms.uTime.value = elapsed;

    // Wind-advected deck. Wrapped so the float never grows big enough to lose precision.
    this._cloudWind.x = (this._cloudWind.x + this._windSpeed * dt) % 4096;
    this._cloudWind.y = (this._cloudWind.y + this._windSpeed * 0.42 * dt) % 4096;

    // The dome rides the camera so a 420 m sphere behaves like an infinite one.
    this.mesh.position.copy(this.ctx.camera.position);

    // Environment refresh: only when the sun has actually moved, and never more than
    // four times a second. A PMREM every frame is a guaranteed mobile stall.
    this._envCooldown -= dt;
    if (this._envCooldown <= 0) {
      const moved = this._envSunDir.dot(this.sunDirection) < 0.99939;   // ~2 degrees
      if (this._envDirty || moved) this._renderEnvironment(true);
      else this._envCooldown = 0.25;
    }
  }

  resize() { /* the dome is view-independent */ }

  applyQuality(q) {
    if (!this.material) return;
    const [layers, oct] = this._cloudTier(q);
    const next = buildSkyFragment(layers, oct);
    if (next !== this.material.fragmentShader) {
      this.material.fragmentShader = next;
      this.material.needsUpdate = true;
    }
    if (!this._cubeRT || this._cubeRT.width !== q.envMapSize) {
      this._makeCubeTarget(q.envMapSize);
      this._envDirty = true;
    }
  }

  dispose() {
    if (this.mesh) this.ctx.scene.remove(this.mesh);
    if (this._envScene && this._envSky) this._envScene.remove(this._envSky);
    this._geometry?.dispose();
    this.material?.dispose();
    this._cubeRT?.dispose();
    this._pmremRT?.dispose();
    this._pmrem?.dispose();
    this._fogMaterials.clear();
    if (this.ctx.scene.environment === this.envMap) this.ctx.scene.environment = null;
    this.envMap = null;
  }
}

export default SkySystem;
