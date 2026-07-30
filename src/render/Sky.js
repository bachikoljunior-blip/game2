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
  BackSide, Color, CubeCamera, LinearSRGBColorSpace, Mesh, NoToneMapping, PMREMGenerator,
  ShaderMaterial, SphereGeometry, Vector2, Vector3, WebGLCubeRenderTarget,
  HalfFloatType, Scene,
} from 'three';
import { glslNoise, clamp, lerp, smoothstep } from '../core/Noise.js';
import { WORLD } from '../world/Constants.js';

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

/**
 * Preetham's closing `pow(x, 1/(1.2+1.2*fade))` is a *display-referred* tone curve: it
 * lands the zenith near 1.0 but leaves the forward-scatter lobe at 10–100. We hand that
 * to ACES, which turns a 25° cap of sky around the sun into flat white with no hue left
 * — and the disc, which used to be summed in *before* that pow, was crushed to within 3×
 * of its own aureole and disappeared into the haze. So: scale the dome down into a
 * display range, soft-knee whatever still overshoots, and add the disc afterwards as the
 * one genuinely HDR emitter in the frame. Everything downstream (bloom, god rays) then
 * has a single, well-defined, correctly-coloured source to work from.
 */
const SKY_LUMINANCE = 0.45;
/**
 * Ceiling the atmosphere rolls into, in graded units. Measured, not guessed: the composite
 * downstream reaches its white point around 2x the mid-sky level, so anything the dome puts
 * above that lands on the same clipped colour as the disc and the disc stops being visible.
 * Capping the atmosphere at roughly twice the 50-degree sky keeps a real gradient toward the
 * sun and still leaves the disc a clear step above everything around it.
 *
 * Lowered 0.62 -> 0.46 in round 7, and only because the knee now runs on luminance. Once the
 * ratios survive compression the knee's height sets *where on the ACES curve* the near-sun
 * sky lands, and ACES desaturates monotonically with level. Transcribing the dome fragment
 * and the composite and evaluating both: at 10 degrees off the sun, 0.62 gives display
 * (199 luma, R-B 47, saturation 0.225) and 0.46 gives (178, R-B 55, 0.285). The far sky
 * barely moves — 60 degrees off loses 8 code values, the zenith 1 — because it never reached
 * the knee. This is also where the frame's missing highlight room comes from: round 7 found
 * 0.000% of `phone-valley` above luma 240, with the sky itself sitting at 210.
 */
const SKY_KNEE = 0.46;
/**
 * Undoes the dome's display scale for the cloud deck. `1 / SKY_LUMINANCE` exactly, which is
 * the same correction `uStarStrength` and `uMoonStrength` already apply: the deck's colours
 * are authored as display values and must not be pulled down into the atmosphere's range,
 * or a fully lit cloud cannot exceed SKY_KNEE and the sky is always the brighter of the two.
 */
const CLOUD_GAIN = 1 / SKY_LUMINANCE;
/** Disc radiance is `uSunE * gain * Fex` — ~150 linear at 13° elevation, deep amber. */
const SUN_DISC_GAIN = 1.8;
/** The tight forward-scatter glare hugging the limb; this is the bloom pass's skirt. */
const SUN_GLARE_GAIN = 0.006;
/** Glare reach, in disc radii. 9 ≈ 2.4°: tight enough to still read as *around* a disc. */
const SUN_GLARE_SPREAD = 9.0;

/** Shrine latitude (central Honshū) and an autumn solar declination. */
const LATITUDE = 35.7 * DEG;
const DECLINATION = -6.5 * DEG;
/**
 * Offset between the game clock and solar time — the game's day is a stylised 24 h, and
 * this is the one knob that decides where in the clock the interesting light lands.
 *
 * It is tuned so the default magic hour (t = 0.78) sits at **13° of solar elevation**,
 * not the 6° a literal autumn sun at this latitude would give. That is deliberate and it
 * is the difference between the shot working and not: at 6°, a horizontal surface only
 * receives sin(6°) = 0.10 of the key, so the cool sky ambient out-competes it and every
 * cobblestone reads blue-grey. At 13° it receives 0.22, and with the low-sun boost below
 * the ground visibly *catches* the light — which is the whole point of golden hour.
 * Still low enough for long raking shadows and a backlit valley.
 */
const SOLAR_OFFSET = 0.0887;

/** The default magic-hour time of day. ARCHITECTURE §5: this is the shot. */
const MAGIC_HOUR = 0.78;

/**
 * Ceiling on the ambient fill's red/blue ratio. ARCHITECTURE §5 binds shadow/ambient to
 * `#4a6b8f`, whose R/B is 0.52; this is the number that keeps the computed sky irradiance
 * from quietly warming the one cool light in the rig past its own art direction.
 */
const SHADOW_FILL_MAX_RB = 0.52;

/**
 * Solar elevation and compass azimuth (radians, clockwise from world −Z) for a day
 * fraction. Split out because the module needs it once at load to solve the site
 * rotation below.
 */
function solarElevation(t) {
  const hourAngle = (t - 0.5 - SOLAR_OFFSET) * 2 * Math.PI;
  const sinEl = Math.sin(DECLINATION) * Math.sin(LATITUDE) +
    Math.cos(DECLINATION) * Math.cos(LATITUDE) * Math.cos(hourAngle);
  return Math.asin(clamp(sinEl, -1, 1));
}

function solarAzimuthRaw(t) {
  const hourAngle = (t - 0.5 - SOLAR_OFFSET) * 2 * Math.PI;
  // Measured from due south, then rotated to a compass bearing from north.
  return Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(LATITUDE) - Math.tan(DECLINATION) * Math.cos(LATITUDE),
  ) + Math.PI;
}

/**
 * The shrine's site is not aligned to true north. ARCHITECTURE §9 fixes the magic-hour
 * sun at `WORLD.SUN_AZIMUTH_DEFAULT` (118°) so it rakes straight down the bamboo valley
 * at azimuth 135 and backlights it; we rotate the whole solar arc to land there. The
 * path stays internally consistent — same elevation profile, same arc, rotated site.
 */
const AZIMUTH_OFFSET = WORLD.SUN_AZIMUTH_DEFAULT * DEG - solarAzimuthRaw(MAGIC_HOUR);

// --------------------------------------------------------- module scratch space
// Pre-allocated so update() never allocates. Never hold a reference to these.

const _colA = new Color();
const _colB = new Color();
const _colCool = new Color();
const _irr = [0, 0, 0];
const _skySample = { r: 0, g: 0, b: 0 };
/** Rec.709 luminance — used to re-hue the ambient without changing its level. */
const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
/**
 * JS twin of the shader's soft knee. Order 4, so the low and mid sky pass through almost
 * untouched (0.45 loses 1%) and only the forward-scatter lobe gets folded onto the ceiling.
 *
 * Returns a *scalar* the caller multiplies all three channels by, because the knee has to
 * run on luminance. See the shader for the measurement; the twin has to match it exactly or
 * the ambient hue is sampled from a sky that is not on screen.
 */
const kneeScale = (r, g, b) => {
  const y = Math.max(r * 0.2126 + g * 0.7152 + b * 0.0722, 1e-6);
  const t = (y * y) / (SKY_KNEE * SKY_KNEE);
  return 1 / Math.pow(1 + t * t, 0.25);
};

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
    fogDensity: 0.0035, stars: 1.0, cloudCoverage: 0.56,
    cloudLit: new Color(0x39456a), cloudDark: new Color(0x10151f), moon: 1.0,
  }),
  K(0.314, {  // 07:32 — sun 11 degrees down: nautical twilight, the deepest blue
    turbidity: 2.6, rayleigh: 1.9, mie: 0.0045, mieG: 0.78,
    exposure: 0.50, sunIntensity: 0.22, ambient: 0.24,
    tint: new Color(0.66, 0.78, 1.05), sunTint: new Color(0.80, 0.82, 1.00),
    sky: new Color(0x24365c), ground: new Color(0x151a24),
    fogColor: new Color(0x27374f), fogSun: new Color(0x4b5170), fogTop: new Color(0x1a2438),
    fogDensity: 0.0051, stars: 0.55, cloudCoverage: 0.53,
    cloudLit: new Color(0x5a5f84), cloudDark: new Color(0x1b2130), moon: 0.7,
  }),
  K(0.360, {  // 08:38 — sunrise, the coldest warm light of the day
    turbidity: 4.2, rayleigh: 2.6, mie: 0.011, mieG: 0.80,
    exposure: 0.78, sunIntensity: 1.5, ambient: 0.30,
    tint: new Color(1.02, 0.95, 0.94), sunTint: new Color(1.00, 0.68, 0.44),
    sky: new Color(0x5c7ba6), ground: new Color(0x35322e),
    fogColor: new Color(0x8f93a0), fogSun: new Color(0xffb27a), fogTop: new Color(0x6d84a6),
    fogDensity: 0.0082, stars: 0.0, cloudCoverage: 0.48,
    cloudLit: new Color(0xffc79a), cloudDark: new Color(0x4a4a5c), moon: 0.0,
  }),
  K(0.435, {  // 10:26 — morning, air still cold, contrast climbing
    turbidity: 3.4, rayleigh: 2.1, mie: 0.006, mieG: 0.78,
    exposure: 0.98, sunIntensity: 2.6, ambient: 0.34,
    tint: new Color(1.00, 1.00, 1.02), sunTint: new Color(1.00, 0.90, 0.76),
    sky: new Color(0x7ba0cc), ground: new Color(0x4a4740),
    fogColor: new Color(0xa8b4c4), fogSun: new Color(0xffd9a8), fogTop: new Color(0x8aa6c8),
    fogDensity: 0.0053, stars: 0.0, cloudCoverage: 0.50,
    cloudLit: new Color(0xfff0dc), cloudDark: new Color(0x63697c), moon: 0.0,
  }),
  K(0.589, {  // 14:08 solar noon — flattest light of the day; graded down deliberately
    turbidity: 2.9, rayleigh: 1.7, mie: 0.0042, mieG: 0.76,
    exposure: 1.05, sunIntensity: 3.2, ambient: 0.36,
    tint: new Color(0.99, 1.00, 1.03), sunTint: new Color(1.00, 0.97, 0.92),
    sky: new Color(0x8fb2d9), ground: new Color(0x585349),
    fogColor: new Color(0xb6c2d0), fogSun: new Color(0xf2e3c8), fogTop: new Color(0x93b0d4),
    fogDensity: 0.0043, stars: 0.0, cloudCoverage: 0.52,
    cloudLit: new Color(0xffffff), cloudDark: new Color(0x6f7688), moon: 0.0,
  }),
  K(0.725, {  // 17:24 — the light starts to lengthen and warm
    turbidity: 3.6, rayleigh: 2.0, mie: 0.0062, mieG: 0.79,
    exposure: 1.02, sunIntensity: 3.0, ambient: 0.35,
    tint: new Color(1.03, 0.99, 0.97), sunTint: new Color(1.00, 0.90, 0.74),
    sky: new Color(0x86a8d2), ground: new Color(0x5a5142),
    fogColor: new Color(0xb9bfc6), fogSun: new Color(0xffdda6), fogTop: new Color(0x8ba9cf),
    fogDensity: 0.0051, stars: 0.0, cloudCoverage: 0.51,
    cloudLit: new Color(0xfff3e0), cloudDark: new Color(0x6a7085), moon: 0.0,
  }),
  K(0.78, {   // 18:43 — THE SHOT. Low amber sun, cool blue shadow, mist in the valley.
    turbidity: 5.4, rayleigh: 2.9, mie: 0.0165, mieG: 0.815,
    exposure: 0.96, sunIntensity: 2.35, ambient: 0.33,
    tint: new Color(1.06, 0.97, 0.92), sunTint: new Color(1.00, 0.66, 0.34),
    sky: new Color(0x6f8db8), ground: new Color(0x4c3f31),
    // The bulk-air colour away from the sun. #a9a8ad was neutral grey (R/B 0.95) and it is
    // what every surface in the set fades toward — the aerial perspective is the largest
    // single tint in a frame with a 1.5 km vista in it, and a neutral one guarantees a
    // single colour temperature. §5's shade is #4a6b8f; this keeps the authored luminance
    // (0.394 -> 0.375 linear) and moves R/B from 0.95 to 0.60, so distance goes blue and
    // the warm in-scatter stays confined to the sun's own aureole.
    fogColor: new Color(0x97a6bd), fogSun: new Color(0xff9b52), fogTop: new Color(0x7d97bd),
    fogDensity: 0.0088, stars: 0.0, cloudCoverage: 0.455,
    cloudLit: new Color(0xffb06a), cloudDark: new Color(0x4e4f68), moon: 0.0,
  }),
  K(0.840, {  // 20:10 — dusk, the sun is under the ridge, only the top of the sky is lit
    turbidity: 4.4, rayleigh: 3.3, mie: 0.013, mieG: 0.80,
    exposure: 0.68, sunIntensity: 0.75, ambient: 0.28,
    tint: new Color(0.94, 0.90, 1.02), sunTint: new Color(1.00, 0.47, 0.30),
    sky: new Color(0x4a5f8c), ground: new Color(0x2c2a2c),
    fogColor: new Color(0x6d7085), fogSun: new Color(0xd4623a), fogTop: new Color(0x4c608c),
    fogDensity: 0.0076, stars: 0.18, cloudCoverage: 0.49,
    cloudLit: new Color(0xc4664a), cloudDark: new Color(0x2e3348), moon: 0.25,
  }),
  K(0.894, {  // 21:27 — civil twilight gone, stars in
    turbidity: 3.0, rayleigh: 1.8, mie: 0.0055, mieG: 0.77,
    exposure: 0.48, sunIntensity: 0.18, ambient: 0.22,
    tint: new Color(0.70, 0.80, 1.05), sunTint: new Color(0.78, 0.80, 1.00),
    sky: new Color(0x243352), ground: new Color(0x14161d),
    fogColor: new Color(0x263349), fogSun: new Color(0x3a4664), fogTop: new Color(0x18213a),
    fogDensity: 0.0047, stars: 0.85, cloudCoverage: 0.54,
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
uniform float uFogAirDensity;
uniform float uFogAirFalloff;

/** Optical depth of one exponentially-stratified layer along the ray. */
float kagFogDepth( float travel, float ry, float dh, float H ) {
  float baseH = exp( - dh / max( H, 0.05 ) );
  if ( abs( ry ) > 1e-3 ) {
    return baseH * H * ( 1.0 - exp( - travel * ry / H ) ) / ry;
  }
  return baseH * travel;
}

/**
 * Closed-form integral of an exponentially decaying density along the view ray.
 * Returns the blended colour. Linear space — call this *before* tone mapping.
 *
 * Two layers, because one cannot do this job. The 26 m mist deck is authored on the
 * stream at 782 m and is what pools in the valley — but the plateau stands 30 m above
 * it and the review camera another 9, so on that ray the deck has already decayed to
 * 22% before the first metre of travel. Measured on the round-5 wide frame that left a
 * 1.5 km snow massif at luma p99 226 against a sky at 155 and a 200 m mid-ground at
 * 150: the furthest thing in frame was the brightest and most contrasty, so distance
 * read as a matte painting pasted in *front* of the air rather than behind it.
 * Aerial perspective is bulk air, whose scale height is kilometres, not tens of metres.
 */
vec3 kagApplyFog( vec3 color, vec3 worldPos, vec3 camPos ) {
  vec3 d = worldPos - camPos;
  float dist = length( d );
  if ( dist < 1e-4 ) return color;
  vec3 rd = d / dist;

  float travel = max( dist - uFogStart, 0.0 );
  float ry = rd.y;
  float dh = camPos.y - uFogBaseHeight;
  float tMist = uFogDensity * kagFogDepth( travel, ry, dh, max( uFogHeightFalloff, 0.05 ) );
  float tAir = uFogAirDensity * kagFogDepth( travel, ry, dh, max( uFogAirFalloff, 1.0 ) );
  float f = 1.0 - exp( - ( tMist + tAir ) );
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

function buildSkyFragment(cloudLayers, cloudOct, cloudDetail) {
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
uniform float uSkyKnee;
uniform float uSunDiscGain;
uniform float uSunGlareGain;
uniform float uTime;

uniform float uCloudCoverage;
uniform float uCloudScale;
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudDensity;
uniform vec2  uCloudWind;
uniform vec3  uCloudLit;
uniform vec3  uCloudCool;
uniform vec3  uCloudDark;
uniform float uCloudOpacity;
uniform float uCloudGain;

#define CLOUD_LAYERS ${cloudLayers}
#define CLOUD_OCT ${cloudOct}
#define CLOUD_DETAIL ${cloudDetail}
// Precomputed on the JS side: GLSL ES 1.00 has no integer max(), and this is a constant.
#define CLOUD_SPAN ${Math.max(cloudLayers - 1, 1).toFixed(1)}
#define CLOUD_MID_OCT ${Math.max(cloudOct - 1, 2)}
#define SUN_ANG_R ${SUN_ANGULAR_RADIUS.toFixed(8)}
#define MOON_ANG_R ${MOON_ANGULAR_RADIUS.toFixed(8)}
#define SUN_GLARE_R ${(SUN_ANGULAR_RADIUS * SUN_GLARE_SPREAD).toFixed(8)}

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
 * The solar disc, in the sun's own colour — Fex, the extinction along the sun's ray,
 * which at 13° of elevation is a deep amber (1.0, 0.42, 0.07). Never the sky's colour.
 *
 * This is added to the frame *after* the atmosphere's tone curve and after the knee, so
 * it is the only part of the dome allowed to be a true HDR value. That is what gives it
 * a limb: the core sits ~130× above the sky it is drawn against, so the tone mapper
 * clips the disc and nothing else, and the bloom pass gets a real, amber-tinted source
 * instead of a broad pale wash.
 */
vec3 sunDisc( float cosTheta, vec3 Fex ) {
  if ( uSunDiscGain <= 0.0 ) return vec3( 0.0 );
  // acos() is worst-conditioned exactly where the disc lives, and drivers disagree about
  // its accuracy there. The chord — 2·sin(θ/2) — equals θ to within 3e-9 relative across
  // a 0.005 rad disc and is a sqrt of an exact subtraction, so it is the same on every GPU.
  float ang = sqrt( max( 2.0 - 2.0 * min( cosTheta, 1.0 ), 0.0 ) );
  float t = ang / SUN_ANG_R;
  float limb = sqrt( max( 1.0 - min( t, 1.0 ) * min( t, 1.0 ), 0.0 ) );
  // Deeper than the physical 0.34 so the outermost pixels of the disc fall out of clip
  // and read amber against the white core, which is what sells the edge at 10 px wide.
  float darkening = 1.0 - 0.55 * ( 1.0 - limb );
  // ~4% of the radius of softness: one pixel of antialiasing, and no more.
  float core = ( 1.0 - smoothstep( 0.975, 1.015, t ) ) * darkening;
  // Tight glare hugging the limb — the skirt bloom widens. Deliberately short-range:
  // the broad forward-scatter halo is the atmosphere's job, not the disc's.
  float glare = pow( max( 1.0 - ang / SUN_GLARE_R, 0.0 ), 3.0 );
  return uSunE * Fex * ( uSunDiscGain * core + uSunGlareGain * glare );
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
  // GLSL smoothstep is undefined for edge0 > edge1, so always invert rather than swap.
  float s = 1.0 - smoothstep( 0.0, 0.13, d );
  float mag = ( h - 0.955 ) * 22.2;
  float twinkle = 0.62 + 0.38 * sin( uTime * ( 1.4 + h * 9.0 ) + h * 61.0 );
  return s * mag * twinkle * uStarStrength * smoothstep( -0.02, 0.14, rd.y );
}

// ---------------------------------------------------------------- cloud deck

#if CLOUD_LAYERS > 0
/**
 * The deck's mass at one point on one slab plane, at two frequencies. The low band carves
 * the cells; the high band is *subtracted* before the coverage threshold, so it erodes the
 * silhouette into billows rather than adding another layer of blur on top of it. One band
 * against a 0.30-wide threshold is what made the old deck a uniformly soft smear: there
 * was nowhere in it for an edge to happen.
 *
 * detailAmp is faded out toward the horizon by the caller. On a flat slab the high band
 * is the first thing to cross Nyquist, and when it does it stops being cloud and becomes
 * the horizontal dashes the deck was showing a couple of degrees above the skyline.
 */
float cloudMass( vec2 p, float cov, float detailAmp ) {
  // Three bands, and they do three different jobs. mass runs at a quarter of the deck's
  // own frequency and decides *where* cloud is, so a single bank spans a large fraction of
  // the sky instead of terminating a few hundred metres away. mid at deck scale is what
  // gives one bank bright and dark regions inside itself. The fine band is subtracted, so
  // it erodes the silhouette into billows rather than adding blur on top of it.
  //
  // Round 7 measured the previous single-band version as "dozens of small, isolated,
  // hard-edged elliptical lozenges, each roughly 120x40 px". A CPU mirror of this shader at
  // the review framing reproduces that exactly and scores it: at matched coverage (0.234 vs
  // 0.244 of the sky above the horizon) the old field breaks into 473 connected components
  // whose largest is 8.9 k px and 312 px wide, and this one into 297 whose largest is 40.4 k
  // px and spans the full frame width. That is the difference between confetti and weather.
  float mass = fbm2( p * 0.24, CLOUD_OCT ) * 0.5 + 0.5;
  float mid  = fbm2( p + 7.3, CLOUD_MID_OCT ) * 0.5 + 0.5;
  float f = mass * 0.70 + mid * 0.30;
#if CLOUD_DETAIL
  f -= fbm2( p * 5.9 + 23.1, 2 ) * 0.11 * detailAmp;   // zero-mean, so coverage is preserved
#endif
  // 0.37 wide, not 0.17. A narrow ramp on a field this smooth is a hard edge — it was
  // traceable pixel by pixel at native resolution, which is the thing that reads as a bug.
  // The offsets are chosen so the sky the deck covers is unchanged (see the component
  // measurement above): this shader is also what the cube camera bakes into the PMREM probe
  // that lights the world, and softening an edge must not quietly repaint the sky.
  return smoothstep( cov + 0.01, cov + 0.38, f );
}

/**
 * Flat-slab "raymarch lite": intersect the view ray with CLOUD_LAYERS stacked planes, the
 * lowest being the deck's underside and the highest its sunlit top. Returns an already
 * *graded* colour, because the aerial-perspective blend at the bottom needs the deck and
 * the sky behind it in the same space.
 *
 * Every warm pixel here is a function of the angle between the view ray and the sun. That
 * is the whole point of the rewrite: the previous version keyed its lit/dark mix on a
 * self-shadow tap taken at a fixed offset that did not depend on the sun's position at
 * all, so the key colour landed wherever the noise happened to be thin — orange overhead,
 * orange in the upper left, orange in the upper right, all at once.
 */
vec4 clouds( vec3 rd, vec3 Fex, vec3 grade, vec3 skyCol ) {
  float horizon = smoothstep( 0.006, 0.070, rd.y );
  if ( horizon <= 0.0 ) return vec4( 0.0 );

  // Slant range to the deck in units of its height, soft-saturating. Taken raw this is
  // 1/rd.y, which runs to 80 a degree above the horizon and drags the noise far past the
  // sampling rate. Saturating the growth keeps features shrinking with distance — so the
  // deck still reads as receding — while holding the frequency finite.
  float sr = 1.0 / max( rd.y, 0.014 );
  float slant = sr / ( 1.0 + sr * 0.055 );
  float detailAmp = 1.0 - smoothstep( 5.0, 14.0, slant );

  float acc = 0.0;
  float dBase = 0.0;
  float dTop = 0.0;
  vec2 pTop = vec2( 0.0 );

  for ( int i = 0; i < CLOUD_LAYERS; i++ ) {
    float k = float( i ) / CLOUD_SPAN;                 // 0 at the base plane, 1 at the top
    vec2 p = rd.xz * ( uCloudHeight * ( 1.0 + k * uCloudThickness ) * slant * uCloudScale )
           + uCloudWind * ( 1.0 + k * 0.18 );
    // Coverage tightens with height, so the stack domes instead of reading as a slab and
    // the lower planes show through the gaps in the upper ones.
    float d = cloudMass( p, uCloudCoverage + k * 0.085, detailAmp );
    acc += d * ( 1.0 - 0.22 * k );
    if ( i == 0 ) dBase = d;
    dTop = d; pTop = p;
  }
  float dens = clamp( acc / float( CLOUD_LAYERS ) * uCloudDensity, 0.0, 1.0 );
  if ( dens <= 0.002 ) return vec4( 0.0 );

  // Self-shadow, one tap, displaced by the horizontal throw of the deck's own thickness at
  // this solar elevation — nearly two cell widths at 13 degrees. That elevation dependence
  // is what makes a low sun light one flank of every cell and leave the rest of it dark.
  vec2 sunAz = normalize( uSunDirection.xz + vec2( 1e-5, 0.0 ) );
  float throwP = min( uCloudHeight * uCloudThickness / max( uSunDirection.y, 0.07 ), 5200.0 ) * uCloudScale;
  // The shade tap dominates; the deck's own depth only contributes a little, because what
  // is being lit here is the top surface and it is not behind itself.
  float shade = cloudMass( pTop + sunAz * throwP, uCloudCoverage, 0.0 );
  float lightT = exp( -2.9 * shade - 0.7 * dens );

  // ---- colour: a function of the angle to the sun, and of nothing else ---------------
  float cs = dot( rd, uSunDirection );
  // cos 62 deg = 0.47, cos 18 deg = 0.95. Past 62 degrees the deck is lit by the sky dome
  // rather than by the key, so it falls to the cool colour. The weak wrap term keeps the
  // sun's own hemisphere from ending in a hard-edged ring and is exactly zero past 84.
  float warm = smoothstep( 0.47, 0.95, cs );
  warm = clamp( warm + 0.22 * smoothstep( 0.10, 0.75, cs ) * ( 1.0 - warm ), 0.0, 1.0 );

  // A cloud's warm/cool split is set by which of its flanks the sun reaches, not by
  // where the viewer happens to be standing. At 13 degrees the key arrives under the
  // deck almost horizontally, which is why a magic-hour sky is warm from horizon to
  // horizon rather than only inside a 62-degree cone around the sun. Measured on the
  // round-5 torii frame, where the sun sits 119.8 degrees off axis: every cloud pixel
  // in the upper 45% of the image came back 20-30 luma below the sky with no hue
  // separation from it — grey soot, under a key of (1.00, 0.41, 0.13).
  //
  // This is not the round-3 failure returning. That one keyed warmth on a self-shadow
  // tap taken at a fixed offset with no dependence on the sun's position, so warmth
  // landed wherever the noise happened to be thin. lightT is sampled along sunAz at
  // throwP, both functions of the sun, so the warmth still lands on the flank the sun
  // is actually on — now at every azimuth instead of only in its own quadrant.
  float lowSun = 1.0 - smoothstep( 0.08, 0.46, uSunDirection.y );
  // 0.45, not the 0.75 round 5 set. The deck is no longer scaled down into the
  // atmosphere's range (see uCloudGain below), so every unit of this wrap now shows: at
  // 0.75 a backlit cloud 120 degrees off the sun came out at R-B 61, which is the round-3
  // "orange in every quadrant" failure with a different cause. At 0.45 the same cloud is
  // R-B 36 while the sunward flank stays at 139, so the dome carries a warm-to-cool
  // gradient instead of one temperature.
  warm = clamp( warm + lowSun * lightT * 0.45 * ( 1.0 - warm ), 0.0, 1.0 );
  vec3 keyCol = mix( uCloudCool, uCloudLit, warm );

  // Forward scatter through thin cloud, with the phase function's isotropic pedestal taken
  // off: an HG lobe still returns 0.0115 straight backwards, and multiplied up that was
  // depositing a silver lining on the anti-solar side of the dome.
  float fwd = max( hgPhase( cs, 0.74 ) - 0.021, 0.0 );
  float thin = 1.0 - dens;
  float burn = ( fwd * 1.9 + pow( max( cs, 0.0 ), 16.0 ) * 1.6 ) * thin * thin;

  // Lit top against shaded base. The upper plane is the one the sun reaches, and the
  // parallax between it and the base plane is positive on the far flank of every cell —
  // where the light is — and negative on the underside we are looking up into.
  float topFace = clamp( ( dTop - dBase ) * 1.7 + 0.5, 0.0, 1.0 );
  vec3 base = mix( uCloudDark, uCloudCool, 0.22 );
  // The underside is the face a ground observer sees across most of the sky, and at
  // this solar elevation it is lit rather than self-shadowed. Left at uCloudDark the
  // deck reads as smoke no matter what the lit top does, because the top is only
  // visible near the anti-solar horizon.
  base = mix( base, mix( uCloudDark, uCloudLit, 0.55 ), lowSun * 0.60 * ( 0.3 + 0.7 * warm ) );
  // At a 13-degree sun the key arrives under the deck almost horizontally, so the face a
  // ground observer sees is the lit one across most of the sky, not only where the parallax
  // between the two slab planes happens to be positive. topFace alone held the lit mix
  // near 0.25 over most of the deck, which is a shaded cloud.
  float litMix = clamp( topFace * ( 0.28 + 0.72 * lightT ), 0.0, 1.0 );
  litMix = mix( litMix, max( litMix, 0.72 * warm ), lowSun );
  vec3 col = mix( base, keyCol * ( 0.55 + 1.5 * lightT ), litMix );
  col += uCloudLit * burn * warm;

  // Extinction along the ray to the deck. Fex is the whole-atmosphere figure and the deck
  // is 1.7 km up, so take a third of it. Taken neat it reddened every low cloud in the
  // dome — including the ones behind us — which is the other half of the misplaced orange.
  col *= mix( vec3( 1.0 ), Fex, 0.34 );
  // grade carries uSkyExposure, which is exposure * SKY_LUMINANCE — the *dome's*
  // display scale, 0.432 at magic hour. The deck's colours are authored as display values
  // (uCloudLit is #ffb06a, peak 1.0), so multiplying them by 0.432 caps a fully lit cloud
  // at 0.46 linear against a sky whose own ceiling is uSkyKnee = 0.62: arithmetically the
  // deck could not be the brightest thing in the sky. Round 7 measured exactly that — every
  // cloud darker than the sky behind it, including within 30 degrees of the sun. Stars and
  // the moon already divide this scale back out (see uStarStrength) for the same reason:
  // they are objects in the sky, not the sky. So does the deck now.
  col *= grade * uCloudGain;

  // Aerial perspective on the deck itself: it dissolves into the air in front of it as it
  // recedes, which is what makes it read as a plane going away rather than as a texture
  // smeared across the bottom of the sky. It also disposes of whatever structure survives
  // down there, which is where a flat slab is worst behaved.
  col = mix( col, skyCol, smoothstep( 4.5, 14.0, slant ) * 0.85 );

  return vec4( col, clamp( dens * horizon * uCloudOpacity, 0.0, 1.0 ) );
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

  // The aureole — the broad forward-scattered glare — stays *inside* the tone curve with
  // the rest of the atmosphere. It is sky, not sun. The disc is added by the caller.
  float g = max( cosTheta, 0.0 );
  float aureole = pow( g, 2400.0 ) * 2.2 + pow( g, 220.0 ) * 0.20 + pow( g, 26.0 ) * 0.012;
  vec3 L0 = ( 0.1 + uSunE * 900.0 * aureole ) * Fex;

  vec3 tex = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  vec3 atmos = pow( max( tex, vec3( 0.0 ) ), vec3( 1.0 / ( 1.2 + 1.2 * uSunFade ) ) );
  atmos *= uSkyTint * uSkyExposure;

  // Soft knee, order 4, on LUMINANCE — never per channel. A per-channel knee is a
  // per-channel *ceiling*: every channel that overshoots lands on the same uSkyKnee, so the
  // 25-degree cap of sky around a low sun converges on neutral grey no matter what colour
  // the air is. Measured on the round-7 sun frame by inverting the composite: the sky 10
  // degrees off the sun sits at scene-linear (0.628, 0.550, 0.567) — all three channels on
  // the 0.62 ceiling, saturation 0.049, R-B = 16, in the one frame that exists to look into
  // a magic-hour sun. Compressing luminance and scaling all three channels by the same
  // factor rolls the aureole off exactly as before while keeping its ratios, so it stays
  // amber. Clouds, moon and stars are deliberately outside this: they are objects in the
  // sky, not the sky. The disc is outside it too, and is added by the caller.
  float y = max( dot( atmos, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
  float t = ( y * y ) / ( uSkyKnee * uSkyKnee );
  return atmos * inversesqrt( sqrt( 1.0 + t * t ) );
}

void main() {
  vec3 rd = normalize( vWorldDirection );
  float cosTheta = dot( rd, uSunDirection );
  vec3 grade = uSkyTint * uSkyExposure;

  vec3 Fex;
  vec3 col = skyRadiance( rd, Fex );      // already graded, already kneed

  col += ( moonDisc( rd ) + vec3( 0.86, 0.90, 1.0 ) * stars( rd ) ) * grade;

  float cloudAlpha = 0.0;
#if CLOUD_LAYERS > 0
  // col goes in as the sky the deck is drawn against — the deck hazes into it as it
  // recedes — and comes back already graded.
  vec4 cl = clouds( rd, Fex, grade, col );
  col = mix( col, cl.rgb, cl.a );
  cloudAlpha = cl.a;
#endif

  // Below the horizon we fade into the ground haze so the dome never shows a hard seam
  // where the terrain silhouette does not quite reach.
  float below = 1.0 - smoothstep( -0.16, 0.0, rd.y );
  col = mix( col, uGroundColor * grade, below );

  // The disc goes on last and uncapped: the one part of the dome allowed to be a true HDR
  // highlight, so it is the only thing the tone mapper clips and the only thing the bloom
  // and god-ray passes have to work from. A thick deck dims it rather than deleting it —
  // thin cloud lets it burn through, which is the whole look of a low sun behind autumn cloud.
  //
  // The floor is what guarantees the limb: the core is ~147 linear in red at 13 degrees
  // against a dome capped at uSkyKnee = 0.62, so a quarter of it is still 59x the brightest
  // sky it can be drawn against and clips while nothing around it does. The old 0.12 also
  // clipped, but there is no reason to spend that much of the margin on a cloud tap.
  col += sunDisc( cosTheta, Fex ) * mix( 1.0, 0.25, cloudAlpha ) * ( 1.0 - below );

  gl_FragColor = vec4( max( col, vec3( 0.0 ) ), 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

// ------------------------------------------------------------------- helpers

/**
 * Chain onto an existing onBeforeCompile instead of stomping another author's patch.
 * three's default program cache key is `onBeforeCompile.toString()`, so the wrapper
 * forwards the original's source — otherwise every wrapped material would hash to the
 * same key and two materials with different author patches would share one program.
 */
function chainBeforeCompile(material, fn, tag) {
  const prev = material.onBeforeCompile;
  const prevSrc = prev ? String(prev) : '';   // String() so a chained wrapper's own toString wins
  const wrapper = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    fn.call(this, shader, renderer);
  };
  wrapper.toString = () => prevSrc + '|' + tag;
  material.onBeforeCompile = wrapper;
}

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
    this.time = MAGIC_HOUR;
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
    /**
     * Diffuse irradiance the environment probe puts on an up-facing surface at
     * `scene.environmentIntensity = 1`. Lighting owns the probe's *level* (§8) and needs
     * this to set it as a ratio against the key instead of as a blind gain.
     */
    this.probeIrradiance = new Color(1, 1, 1);
    this.envMap = null;

    /** Read-only view of the fog for other systems (Weather tints its own particles). */
    this.fogParams = {
      color: new Color(0xa9a8ad),
      topColor: new Color(0x7d97bd),
      sunColor: new Color(0xff9b52),
      density: 0.0088,
      heightFalloff: 26,
      // ARCHITECTURE §9: world Y is absolute metres above sea level. The mist deck sits
      // on the stream at 782 and thins with height, so the valley pools and the shrine
      // plateau 30 m above it keeps roughly a third of the density — which is the shot.
      baseHeight: WORLD.WATER_LEVEL,
      start: 6,
      maxOpacity: 0.96,
      sunPower: 9,
      sunStrength: 0.85,
      /**
       * Bulk air: the term that actually makes distance read. Tuned against the two
       * ranges the review set contains rather than by eye — from the plateau camera
       * this puts ~17% of atmosphere on the 200 m mid-ground and ~70% on the 1.5 km
       * massif, which together with the mist deck lands the massif near 77%.
       */
      airDensity: 0.00098,
      airFalloff: 900,
    };

    /** Shared uniform objects — patched materials hold these by reference. */
    this.fogUniforms = {
      uFogColor: { value: new Color(0xa9a8ad) },
      uFogTopColor: { value: new Color(0x7d97bd) },
      uFogSunColor: { value: new Color(0xff9b52) },
      uFogSunDir: { value: new Vector3(0, 0.2, -1) },
      uFogDensity: { value: 0.0088 },
      uFogHeightFalloff: { value: 26 },
      uFogBaseHeight: { value: WORLD.WATER_LEVEL },
      uFogStart: { value: 6 },
      uFogMaxOpacity: { value: 0.96 },
      uFogSunPower: { value: 9 },
      uFogSunStrength: { value: 0.85 },
      uFogAirDensity: { value: 0.00098 },
      uFogAirFalloff: { value: 900 },
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
    this._betaR = new Vector3();
    this._betaM = new Vector3();
    this._cloudWind = new Vector2(0, 0);
    this._elapsed = 0;
    this._windSpeed = 0.012;

    /**
     * Sweep the scene periodically and fog anything new. Aerial perspective is not
     * optional in this art direction, and it is not reasonable to make every author
     * remember to call applyFog. Set false to take manual control.
     */
    this.autoFog = true;
    this._fogScanTimer = 0;
    this._onFogScan = (o) => {
      const m = o.material;
      if (!m || o === this.mesh) return;
      if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this.applyFog(m[i]); }
      else this.applyFog(m);
    };

    // Resolve the sun and the whole grade immediately, so a system constructed before
    // our init() (Lighting reads ctx.sky) never sees placeholder values.
    this.setTime(this.time);
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
      uSkyKnee: { value: SKY_KNEE },
      uSunDiscGain: { value: SUN_DISC_GAIN },
      uSunGlareGain: { value: SUN_GLARE_GAIN },
      uTime: { value: 0 },
      uCloudCoverage: { value: 0.46 },
      uCloudScale: { value: 0.00055 },
      uCloudHeight: { value: 1700 },
      uCloudThickness: { value: 0.42 },
      uCloudDensity: { value: 1.25 },
      uCloudWind: { value: this._cloudWind },
      uCloudLit: { value: new Vector3(1, 0.69, 0.42) },
      uCloudCool: { value: new Vector3(0.53, 0.60, 0.71) },
      uCloudDark: { value: new Vector3(0.3, 0.31, 0.4) },
      uCloudOpacity: { value: 0.95 },
      uCloudGain: { value: CLOUD_GAIN },
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
    // [slab planes, octaves in the low band, high band on]. cloudMass now costs
    // `oct + CLOUD_MID_OCT + 2 * detail` per call and is called `layers + 1` times, so the
    // totals are 8 / 15 / 21 / 28 against the old 4 / 9 / 13 / 18. The mid band runs one
    // octave short of the mass band because its only job is to put bright and dark regions
    // inside a bank — it does not set the silhouette, so it does not need the range. On the
    // MEDIUM phone target that is +6 snoise2 taps on the sky pixels only, about +3% of the
    // fragment ALU on an Adreno 640; it buys the difference between a field of lozenges and
    // a cloud mass, which is the round-7 blocker.
    // The high band is the expensive half and the half that aliases first, so it is still
    // what goes away below HIGH.
    switch (q.tier) {
      case 0: return [1, 2, 0];
      case 1: return [2, 3, 0];
      case 2: return [2, 3, 1];
      default: return [3, 3, 1];
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

    const elevation = solarElevation(this.time);
    const azimuth = solarAzimuthRaw(this.time) + AZIMUTH_OFFSET;

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

    // Preetham's per-frame constants; all direction-independent, so JS not GLSL.
    const sunY = this.sunDirection.y;
    const sunFade = 1 - clamp(1 - Math.exp(sunY), 0, 1);
    const rayleighCoefficient = g.rayleigh - 1.0 * (1 - sunFade);
    const c = 0.2 * g.turbidity * 10e-18;

    this._betaR.copy(TOTAL_RAYLEIGH).multiplyScalar(rayleighCoefficient);
    this._betaM.copy(MIE_CONST).multiplyScalar(0.434 * c * g.mie);

    const zenithCos = clamp(sunY, -1, 1);
    const sunE = SUN_E0 * Math.max(0, 1 - Math.pow(Math.E, -((CUTOFF_ANGLE - Math.acos(zenithCos)) / STEEPNESS)));
    // Cached for _evalSky, which mirrors the shader exactly.
    this._sunE = sunE;
    this._sunFade = sunFade;

    if (u) {
      u.uBetaR.value.copy(this._betaR);
      u.uBetaM.value.copy(this._betaM);
      u.uSunFade.value = sunFade;
      u.uMieG.value = g.mieG;
      u.uSunE.value = sunE;
      u.uSkyTint.value.set(g.tint.r, g.tint.g, g.tint.b);
      u.uSkyExposure.value = g.exposure * SKY_LUMINANCE;
      u.uGroundColor.value.set(g.ground.r, g.ground.g, g.ground.b);
      // Stars and the moon are emitters, not atmosphere: undo the dome's display scale
      // for them so pulling the sky down does not also dim the night sky's own lights.
      u.uStarStrength.value = g.stars / SKY_LUMINANCE;
      u.uMoonStrength.value = g.moon / SKY_LUMINANCE;
      u.uCloudCoverage.value = g.cloudCoverage;
      u.uCloudLit.value.set(g.cloudLit.r, g.cloudLit.g, g.cloudLit.b);
      u.uCloudDark.value.set(g.cloudDark.r, g.cloudDark.g, g.cloudDark.b);

      // Cloud more than ~60 degrees off the sun is lit by the sky dome, not by the key,
      // and it has to have somewhere cool to go or the warmth spreads over the whole deck.
      // Derived from the ladder's own sky colour rather than added as a tenth keyframe
      // knob, so it tracks every hour for free; held at a fixed fraction of the lit
      // colour's luminance so the deck keeps its tops-brighter-than-bases ordering; and
      // pulled part way to white because cloud is never as saturated as the air behind it.
      _colCool.copy(g.sky);
      const lCool = lum(_colCool);
      if (lCool > 1e-5) _colCool.multiplyScalar(lum(g.cloudLit) * 0.52 / lCool);
      u.uCloudCool.value.set(
        lerp(_colCool.r, 1, 0.18), lerp(_colCool.g, 1, 0.18), lerp(_colCool.b, 1, 0.18),
      );
    }

    // --- key light -----------------------------------------------------------
    // Extinction along the sun's own ray gives the physically-motivated warm shift.
    // Taken neat it collapses to a saturated red at 6° of elevation — true, but not
    // what a DP would put on a face — so we lerp it against white and let the ladder's
    // authored sunTint carry the rest. At magic hour this lands on ~#ff9760.
    this._sunTransmittance(_colA);
    // Below the ridge the extinction model saturates and would hand us a red key at
    // midnight; fade it out there and let the ladder's cool moonlight tint take over.
    const w = 0.65 * smoothstep(-0.12, 0.02, sunY);
    _colA.setRGB(lerp(1, _colA.r, w), lerp(1, _colA.g, w), lerp(1, _colA.b, w));
    this.sunColor.copy(_colA).multiply(g.sunTint);
    const peak = Math.max(this.sunColor.r, this.sunColor.g, this.sunColor.b, 1e-4);
    this.sunColor.multiplyScalar(1 / peak);
    // Below the ridge line the key light has to die or shadows go black-on-black.
    const horizonFade = smoothstep(-0.09, 0.06, sunY);
    // Low-sun key boost. A raking sun deposits N·L = sin(elev) of its energy on flat
    // ground — a tenth of it at 6°, a fifth at 13° — so without a compensating gain the
    // cool ambient wins on every horizontal surface and the golden hour reads grey.
    // Standard practice, costs nothing, and it only lifts the *key*, never the ambient.
    const lowSunBoost = 1 + 0.9 * (1 - smoothstep(0, 0.45, Math.max(sunY, 0)));
    this.sunIntensity = g.sunIntensity * lerp(0.18, 1, horizonFade) * lowSunBoost;
    this.ambientIntensity = g.ambient;

    // --- ambient ---------------------------------------------------------------
    // The sky bounce is taken from the irradiance of our own atmosphere rather than a
    // hand-picked constant, so it is amber-biased at a low sun by construction instead
    // of by an artist remembering to do it. We keep the ladder's authored *level* and
    // only borrow the computed hue, so this can never turn into a global exposure lift,
    // and we only lerp part way — ARCHITECTURE §5 wants shadows to stay recognisably
    // cool (#4a6b8f), not to go warm along with everything else.
    this._skyIrradiance(_colB);
    const lAuthored = lum(g.sky);
    const lComputed = lum(_colB);
    if (lComputed > 1e-5) _colB.multiplyScalar(lAuthored / lComputed);
    this.skyColor.copy(g.sky).lerp(_colB, 0.5);
    // Floor on how cool the fill is allowed to be. The computed irradiance is honest
    // physics and at a 13-degree sun it is dominated by the forward-scatter lobe, so
    // borrowing its hue drags the one authored cool light in the rig toward the key —
    // and ARCHITECTURE §5 binds shadow/ambient to #4a6b8f, R/B 0.52, precisely so it
    // cannot. Rebalanced at constant luminance, so this is a hue clamp and never a
    // level change: it can only ever move blue against red.
    const rb = this.skyColor.r / Math.max(this.skyColor.b, 1e-5);
    if (rb > SHADOW_FILL_MAX_RB) {
      const lKeep = lum(this.skyColor);
      const s = SHADOW_FILL_MAX_RB / rb;
      this.skyColor.setRGB(this.skyColor.r * s, this.skyColor.g, this.skyColor.b / s);
      const lNow = lum(this.skyColor);
      if (lNow > 1e-5) this.skyColor.multiplyScalar(lKeep / lNow);
    }

    // Down-facing normals see light bounced off warm autumn ground. Nudge the bounce
    // toward the key as the sun drops and the whole valley turns amber — but *only* the
    // hue. Lerping toward a key normalised to peak 1.0 more than doubled the bounce's
    // luminance (0.054 -> 0.115 at magic hour, measured off the live values), which left
    // the hemisphere's warm half brighter than its cool half and handed every downward
    // and side-facing normal in the frame a stronger, warmer fill than an up-facing one.
    // That is the inverse of what a low sun does, and it is a large part of why round 7
    // measured one colour temperature across all five frames. Bounce cannot exceed what
    // bounced: hold the level at the authored ground albedo's.
    const lGround = lum(g.ground);
    this.groundColor.copy(g.ground).lerp(this.sunColor, 0.22 * (1 - smoothstep(0, 0.5, Math.max(sunY, 0))) * horizonFade);
    const lBounce = lum(this.groundColor);
    if (lBounce > 1e-5) this.groundColor.multiplyScalar(lGround / lBounce);
    this.moonColor.setRGB(0.62, 0.72, 1.0);

    // What the PMREM probe will deliver as diffuse irradiance on an up-facing surface at
    // `scene.environmentIntensity = 1`. Published rather than left implicit because it is
    // the largest single term in the ambient budget and nothing downstream could see it:
    // Lighting held a bare 0.42 gain against a number no one had measured. Upper
    // hemisphere only and sky only — the deck and the below-horizon ground are in the real
    // cube and are not here — so treat it as the probe's *sky* share, which is the part
    // that has to stay in ratio with the key.
    this._skyIrradiance(_colB, true);
    this.probeIrradiance.copy(_colB).multiplyScalar(Math.PI);
    if (!Number.isFinite(this.probeIrradiance.r + this.probeIrradiance.g + this.probeIrradiance.b)) {
      this.probeIrradiance.setRGB(1, 1, 1);
    }

    // --- fog -----------------------------------------------------------------
    const fp = this.fogParams;
    fp.color.copy(g.fogColor);
    fp.topColor.copy(g.fogTop);
    fp.sunColor.copy(g.fogSun);
    fp.density = g.fogDensity;
    // The in-scattering lobe. At magic hour the old curve gave power 10.3 / strength 0.671,
    // which puts the fog colour 57% of the way to #ff9b52 ten degrees off the sun and still
    // 23% of the way there at thirty — i.e. a warm wash over essentially the whole `sun`
    // framing, on every surface, at every distance. Fitting the round-7 measurement of the
    // banner-pole shadow on sand (scene-linear 0.0399, 0.0296, 0.0268 against lit sand at
    // 0.2420, 0.1370, 0.0806) puts the fog opacity there at ~0.05, which makes in-scatter
    // 89% of that shadow's red and only 41% of its blue. That, not the ambient's hue, is
    // why round 7 measured the shadow *warmer* than the key that made it. A raking sun does
    // give a warm aureole; it does not paint the whole sky orange, so the lobe narrows.
    // At magic hour this lands on power 24.0 / strength 0.549: 38% of the way to #ff9b52
    // ten degrees off the sun (was 57%) and 1.8% at thirty (was 23%).
    fp.sunPower = lerp(32, 18, smoothstep(0.5, 0.0, Math.abs(sunY)));
    fp.sunStrength = lerp(0.35, 0.70, smoothstep(0.45, 0.02, Math.abs(sunY)));

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
    fu.uFogAirDensity.value = fp.airDensity;
    fu.uFogAirFalloff.value = fp.airFalloff;

    // Keep the engine's built-in FogExp2 roughly in step for anything that escapes the
    // patch. FogExp2 squares the distance term, so the curves can only be matched at one
    // range — 300 m, the mid-ground where a mismatch would be most obvious.
    const fog = this.ctx.scene.fog;
    if (fog) {
      fog.color.copy(fp.color);
      if ('density' in fog) fog.density = fp.density * 0.32;
    }
  }

  /**
   * Evaluate the same Preetham radiance the fragment shader does, in JS, for one
   * direction. Writes into `out` ({r,g,b}); no allocation. The sun disc is deliberately
   * excluded — that energy is carried by the DirectionalLight, and double-counting it
   * would blow the ambient out every time the camera faced the sun.
   *
   * `raw = true` returns the radiance in the state `_renderEnvironment` bakes the cube in
   * (no display scale, no knee), which is what the PMREM probe lights the world with.
   */
  _evalSky(dx, dy, dz, out, raw = false) {
    const g = this._grade;
    const cosUp = Math.max(dy, 0);
    const zenithAngle = Math.acos(clamp(cosUp, -1, 1));
    const deg = zenithAngle * (180 / Math.PI);
    const denom = Math.cos(zenithAngle) + 0.15 * Math.pow(Math.max(93.885 - deg, 1e-3), -1.253);
    const inverse = 1 / Math.max(denom, 1e-4);
    const sR = RAYLEIGH_ZENITH_LENGTH * inverse;
    const sM = MIE_ZENITH_LENGTH * inverse;

    const bR = this._betaR, bM = this._betaM;
    const fx = Math.exp(-(bR.x * sR + bM.x * sM));
    const fy = Math.exp(-(bR.y * sR + bM.y * sM));
    const fz = Math.exp(-(bR.z * sR + bM.z * sM));

    const s = this.sunDirection;
    const cosTheta = dx * s.x + dy * s.y + dz * s.z;
    const c = cosTheta * 0.5 + 0.5;
    const rPhase = (3 / (16 * Math.PI)) * (1 + c * c);
    const gg = g.mieG, g2 = gg * gg;
    const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) /
      Math.max(Math.pow(1 - 2 * gg * cosTheta + g2, 1.5), 1e-4));

    const sunE = this._sunE;
    const sunFade = this._sunFade;
    const horizonMix = clamp(Math.pow(1 - s.y, 5), 0, 1);
    const invGamma = 1 / (1.2 + 1.2 * sunFade);
    const lift = [0, 0.0003, 0.00075];
    const bRc = [bR.x, bR.y, bR.z], bMc = [bM.x, bM.y, bM.z];
    const fex = [fx, fy, fz];
    const rgb = _irr;

    for (let i = 0; i < 3; i++) {
      const ratio = (bRc[i] * rPhase + bMc[i] * mPhase) / (bRc[i] + bMc[i]);
      let lin = Math.pow(Math.max(sunE * ratio * (1 - fex[i]), 0), 1.5);
      lin *= lerp(1, Math.sqrt(Math.max(sunE * ratio * fex[i], 0)), horizonMix);
      const l0 = 0.1 * fex[i];
      rgb[i] = Math.pow(Math.max((lin + l0) * 0.04 + lift[i], 0), invGamma);
    }
    // Same display scale and soft knee the dome gets, so the ambient hue is sampled from
    // the sky that is actually on screen and not from the raw radiance behind it. `raw`
    // skips both, which is the state `_renderEnvironment` bakes the cube in — that is what
    // the PMREM probe actually lights the world with, so it is what Lighting must be told.
    const e = g.exposure * (raw ? 1 : SKY_LUMINANCE);
    const cr = rgb[0] * g.tint.r * e, cg = rgb[1] * g.tint.g * e, cb = rgb[2] * g.tint.b * e;
    const k = raw ? 1 : kneeScale(cr, cg, cb);
    out.r = cr * k;
    out.g = cg * k;
    out.b = cb * k;
    return out;
  }

  /**
   * Cosine-weighted irradiance arriving on an up-facing surface from our own sky —
   * i.e. the colour a HemisphereLight's `skyColor` should actually be. 32 samples,
   * rotated so one azimuth column always faces the sun, which is where all the
   * interesting (amber, forward-scattered) energy lives at a low sun.
   *
   * `raw` is forwarded to `_evalSky`: false for the on-screen sky's hue, true for the
   * level the environment probe is baked at. Sky only, upper hemisphere only — the cloud
   * deck and the below-horizon ground are in the real cube and not in this estimate.
   */
  _skyIrradiance(out, raw = false) {
    const s = this.sunDirection;
    let hx = s.x, hz = s.z;
    const hl = Math.hypot(hx, hz);
    if (hl > 1e-5) { hx /= hl; hz /= hl; } else { hx = 0; hz = -1; }

    let r = 0, g = 0, b = 0, wsum = 0;
    for (let ring = 0; ring < 4; ring++) {
      const e = (ring + 0.5) * (Math.PI / 8);          // 11.25° .. 78.75°
      const se = Math.sin(e), ce = Math.cos(e);
      const w = se * ce;                                // cosθ · sinθ from dω
      for (let a = 0; a < 8; a++) {
        const ang = a * (Math.PI / 4);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        // Rotate the sample ring so a = 0 points at the sun's azimuth.
        const dx = (ca * hx - sa * hz) * ce;
        const dz = (ca * hz + sa * hx) * ce;
        this._evalSky(dx, se, dz, _skySample, raw);
        r += _skySample.r * w; g += _skySample.g * w; b += _skySample.b * w;
        wsum += w;
      }
    }
    out.setRGB(r / wsum, g / wsum, b / wsum);
    return out;
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
    const bR = this._betaR;
    const bM = this._betaM;
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
    // The dome *is* the aerial perspective. Fogging it would paint the in-scattering term
    // straight over the sun disc, which is the fastest way to lose it.
    if (material === this.material) return material;
    if (material.isRawShaderMaterial) return material;   // author owns their own prefix
    // Sprites build gl_Position themselves and never run <project_vertex>, so there is
    // no hook — leave three's own fog on them rather than disabling it for nothing.
    if (material.isSpriteMaterial) return material;

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
    }, 'kagfog1');
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

    // Capture the atmosphere only. The disc's energy is already carried by Lighting's
    // directional — baking it into the IBL as well double-counts the sun, and a 128 px
    // cube face smears a 0.53° disc across a 3° texel anyway. Rendering the cube at the
    // pre-knee, pre-display-scale level also keeps the environment byte-identical to what
    // it was before the dome was rescaled, so this change cannot perturb anyone's lighting.
    const u = this.uniforms;
    const keepExposure = u.uSkyExposure.value;
    const keepKnee = u.uSkyKnee.value;
    const keepDisc = u.uSunDiscGain.value;
    // The dome material is `toneMapped: true`, so whatever `renderer.toneMapping` happens
    // to be at this instant is baked into the probe. `SkySystem.init()` runs at main.js:93
    // and PostFX — the system that switches the renderer to NoToneMapping — is not built
    // until main.js:154, so the boot bake ran through Engine's ACESFilmicToneMapping and
    // was clamped to [0,1]. With `autoAdvance = 0` the sun never moves, `_envDirty` is
    // false from the first frame on, and the cube was never re-baked: the world was lit for
    // the whole session by a tone-mapped, clipped copy of the sky. Measured on the
    // magic-hour ladder, cosine-weighted over the upper hemisphere: intended
    // (0.662, 0.843, 0.988) R/B 0.670, actually baked (0.577, 0.665, 0.727) R/B 0.794 —
    // 20% of the probe's luminance gone and the rest warmed, in the one light that is
    // supposed to be the cool half of magic hour.
    const keepTone = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;
    u.uSkyExposure.value = keepExposure / SKY_LUMINANCE;
    u.uSkyKnee.value = 1e6;
    u.uSunDiscGain.value = 0;
    this._cubeCamera.update(renderer, this._envScene);
    u.uSkyExposure.value = keepExposure;
    u.uSkyKnee.value = keepKnee;
    u.uSunDiscGain.value = keepDisc;
    renderer.toneMapping = keepTone;

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

    if (this.autoFog) {
      this._fogScanTimer -= dt;
      if (this._fogScanTimer <= 0) {
        this._fogScanTimer = 0.5;
        this.ctx.scene.traverse(this._onFogScan);
      }
    }

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
    const next = buildSkyFragment(...this._cloudTier(q));
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
