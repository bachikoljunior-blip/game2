/**
 * Lighting.js — cascaded shadow maps, the key/fill/rim rig, and the dynamic light pool.
 *
 * three's `csm/CSM.js` addon does exist in this three build (checked), but it cannot do
 * contact hardening and it does not texel-snap its cascades, and shadow crawl during a
 * camera orbit is an instant AAA fail. So this is a self-contained CSM:
 *
 *   - N DirectionalLights share one sun direction; each owns one cascade's shadow map.
 *   - `lights_fragment_begin` is re-authored so a fragment only pays for the cascade it
 *     falls in, with a smoothstep cross-fade across the boundary (the two weights sum
 *     to exactly 1, and RE_Direct is linear in irradiance, so the blend is energy safe).
 *   - Each cascade is fitted with the *bounding sphere* of its sub-frustum — rotation
 *     invariant, so the ortho box never changes size — and the box centre is snapped to
 *     whole shadow texels, which is what actually kills the crawl.
 *   - The near cascade gets a PCSS-ish blocker search so contact shadows tighten under
 *     a foot and soften under a torii ten metres away.
 *
 * Everything is tier-gated: TIER.LOW collapses to one cascade with a fixed 4-tap PCF.
 */

import {
  Color, DirectionalLight, HemisphereLight, MathUtils, Matrix4, PointLight,
  ShaderChunk, Vector2, Vector3, Vector4,
} from 'three';

const DEG2RAD = MathUtils.DEG2RAD;

/**
 * The ambient budget, as **luminous irradiance on an up-facing surface**, expressed as a
 * fraction of the hour's authored ambient level (`sky.ambientIntensity`). Not as a gain.
 *
 * A gain is unverifiable, and that is how round 7 was lost. `environmentIntensity` was
 * held at 0.42 * ambient against a probe whose delivered irradiance no one had measured;
 * reading it back off the live grade it turns out to be 2.82 per unit intensity at magic
 * hour, so the probe was carrying 0.28 of luminous irradiance against the hemisphere's
 * 0.085 — 77% of the fill, at the sky's own physical R/B of 0.79 rather than the 0.45 the
 * hemisphere carries on §5's authored `#4a6b8f` (0.52). The one light that is *supposed* to be
 * the cool half
 * of magic hour was contributing a quarter of the fill. Sky now publishes
 * `sky.probeIrradiance`, so both terms are set to a stated number instead of a knob.
 *
 * The split: the probe supplies the bounce's *shape* (a sky-facing surface sees more of it,
 * a wall less, and wet stone and the blade mirror it), the hemisphere supplies the authored
 * colour. Round 7 measured R-B between +4 and +12 in the dark population of all five frames
 * where §5 wants it deeply negative, so the authored term takes the larger share.
 *
 * At magic hour this is probe 0.55 * 0.33 = 0.182 and hemisphere 0.80 * 0.33 = 0.264 of
 * luminous irradiance, total 0.446 against a key of 0.396 — the same order the round-7 rig
 * had (0.368) but with the fill's R/B moved from 0.677 to 0.543, i.e. onto §5's 0.52.
 *
 * On ARCHITECTURE §4's "ambient/hemi ~0.35": that figure is an *intensity*, and it was
 * written for a white hemisphere. Ours is #4a6b8f-family at 0.259 relative luminance, so
 * the intensity these shares imply (~1.02) still delivers less luminous irradiance than a
 * white hemisphere at 0.35 would. The budget §4 is protecting is the irradiance, and this
 * is under it.
 */
const PROBE_AMBIENT_SHARE = 0.55;
const HEMI_AMBIENT_SHARE = 0.80;
/**
 * Ceilings on the two derived intensities. Both are `target / measured luminance`, and the
 * denominators go to zero at midnight — nothing non-finite may reach a light uniform
 * (ARCHITECTURE §5b), and a divide that is merely *large* blanks the frame just as well.
 */
const AMBIENT_INTENSITY_MAX = 3.0;
/** The round-7 probe gain, kept verbatim for the sunless half of the ladder. */
const NIGHT_PROBE_GAIN = 0.42;
/** Rec.709 luminance. The two shares above are stated in it, so it has to be the same one. */
const lum709 = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

/** Ceiling on cascades, and the fixed length of the `kagCascades` uniform array. */
const MAX_CASCADES = 4;

/**
 * PCSS blocker search, in **metres of world**, not texels. It has to be near the scale of
 * the thing casting the contact — a stone lantern shaft is ~0.35 m — because the search is
 * what decides whether a fragment gets a shadow at all: `kagGetShadow` returns fully lit
 * when no tap finds a blocker. See `_computeSplits` for the measurement that set it.
 */
const PCSS_SEARCH_METRES = 0.18;
/** Ceiling on the contact-hardened penumbra, also in metres of world. */
const PCSS_PENUMBRA_MAX_METRES = 0.26;

/**
 * Hardware point-light slots reserved for *standing* lights (lanterns, braziers,
 * chōchin), indexed by `quality.tier`. Deliberately a separate budget from the spark
 * pool: a ten-hit flurry must never blow out the shrine's lanterns, and a corridor of
 * lanterns must never starve the sparks. `NUM_POINT_LIGHTS` is a compile-time constant
 * in three, so these are allocated once and rebound — never added or removed.
 */
const STANDING_SLOTS = [1, 2, 3, 5];
/** Registrations are free; past this many, nearest-N binding cannot change a frame. */
const STANDING_MAX = 256;
/**
 * A light already holding a slot is treated as this much nearer than it is, so two
 * lanterns at almost equal range do not trade the slot back and forth as you walk.
 */
const STANDING_HYSTERESIS = 0.8;

// --------------------------------------------------------- module scratch space

const _center = new Vector3();
const _lightPos = new Vector3();
const _camDir = new Vector3();
const _side = new Vector3();
const _snap = new Vector3();
const _rimTarget = new Vector3();
const _upY = new Vector3(0, 1, 0);
const _upZ = new Vector3(0, 0, 1);
const _m = new Matrix4();
const _mInv = new Matrix4();
const _col = new Color();
const _col2 = new Color();
const _sparkPos = new Vector3();
const _standPos = new Vector3();

// ------------------------------------------------------------------ glsl

/**
 * Injected right after `shadowmap_pars_fragment`, so the sampler declarations and the
 * `packing` helpers it needs already exist.
 */
const KAG_SHADOW_PARS = /* glsl */`
#if defined( KAG_CSM ) && defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )

	// xy = this cascade's (near, far) view depth; zw = the cross-fade band width at each
	// of those two splits. The bands are properties of the *split*, not of the cascade,
	// which is what makes the weights a partition of unity — see kagCascadeWeight.
	uniform vec4  kagCascades[ KAG_CASCADES ];
	uniform vec2  kagShadowFade;
	uniform float kagPcssSearch;
	uniform float kagPcssScale;
	uniform float kagPcssMax;

	// Interleaved gradient noise: a per-pixel rotation for the sampling disk. Far
	// cheaper than a random texture and it dithers into a stable, filmic grain.
	float kagIGN( vec2 p ) {
		return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
	}

	// Golden-angle spiral. Uniform coverage without a const array (GLSL ES 1.0).
	vec2 kagVogel( int i, int n, float phi ) {
		float fi = float( i ) + 0.5;
		float r = sqrt( fi / float( n ) );
		float th = fi * 2.39996323 + phi;
		return vec2( cos( th ), sin( th ) ) * r;
	}

	float kagDepthAt( sampler2D m, vec2 uv ) {
		return unpackRGBAToDepth( texture2D( m, uv ) );
	}

	float kagLit( float stored, float z ) {
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( stored, z );
		#else
			return step( z, stored );
		#endif
	}

	/**
	 * Cascade membership. Both neighbours of a split fade across the *same* two edges, so
	 * wOut(i) + wIn(i+1) is identically 1 there and the sum over cascades is a partition
	 * of unity. It used to derive the band from each cascade's own extent, which is not
	 * the same width on the two sides of a split — see _computeSplits for the frame this
	 * measurably brightened and darkened.
	 */
	float kagCascadeWeight( float d, vec4 sp, int idx ) {
		float wIn = 1.0;
		float wOut = 1.0;
		if ( idx > 0 ) wIn = smoothstep( sp.x - sp.z * 0.5, sp.x + sp.z * 0.5, d );
		if ( idx < KAG_CASCADES - 1 ) wOut = 1.0 - smoothstep( sp.y - sp.w * 0.5, sp.y + sp.w * 0.5, d );
		return clamp( wIn * wOut, 0.0, 1.0 );
	}

	float kagPCF( sampler2D map, vec2 uv, float z, float radius, float phi ) {
		float s = 0.0;
		for ( int i = 0; i < KAG_PCF_TAPS; i ++ ) {
			vec2 o = kagVogel( i, KAG_PCF_TAPS, phi ) * radius;
			s += kagLit( kagDepthAt( map, uv + o ), z );
		}
		return s / float( KAG_PCF_TAPS );
	}

	#ifdef KAG_PCSS
	float kagBlockerSearch( sampler2D map, vec2 uv, float z, float radius, float phi, out float found ) {
		float sum = 0.0;
		found = 0.0;
		for ( int i = 0; i < KAG_BLOCKER_TAPS; i ++ ) {
			vec2 o = kagVogel( i, KAG_BLOCKER_TAPS, phi ) * radius;
			float d = kagDepthAt( map, uv + o );
			#ifdef USE_REVERSED_DEPTH_BUFFER
				if ( d > z ) { sum += d; found += 1.0; }
			#else
				if ( d < z ) { sum += d; found += 1.0; }
			#endif
		}
		return found > 0.0 ? sum / found : 0.0;
	}
	#endif

	float kagGetShadow( sampler2D map, vec2 mapSize, float intensity, float bias, float radius, vec4 coord, int cascade, float phi ) {
		vec3 c = coord.xyz / coord.w;
		c.z += bias;
		if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;

		vec2 texel = 1.0 / mapSize;
		float r = texel.x * max( radius, 1.0 );

		#ifdef KAG_PCSS
		if ( cascade == 0 ) {
			float found;
			float zb = kagBlockerSearch( map, c.xy, c.z, kagPcssSearch, phi, found );
			if ( found < 0.5 ) return 1.0;                 // fully lit, skip the filter
			// Penumbra grows with receiver-blocker separation: contact hardening.
			float pen = abs( c.z - zb ) * kagPcssScale;
			r = clamp( pen, texel.x * 0.6, kagPcssMax );
		}
		#endif

		float s = kagPCF( map, c.xy, c.z, r, phi );
		return mix( 1.0, s, intensity );
	}

#endif
`;

/** Replacement for the directional-light section of `lights_fragment_begin`. */
const KAG_DIR_BLOCK = /* glsl */`
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#if defined( KAG_CSM ) && defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )

		// vViewPosition is -mvPosition, so .z is metres along the view axis.
		float kagDepth = vViewPosition.z;
		float kagPhi = kagIGN( gl_FragCoord.xy ) * 6.2831853;
		float kagFade = 1.0 - smoothstep( kagShadowFade.x, kagShadowFade.y, kagDepth );
		float kagW = 1.0;
		float kagS = 1.0;

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );

			#if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS ) && ( UNROLLED_LOOP_INDEX < KAG_CASCADES )

				kagW = kagCascadeWeight( kagDepth, kagCascades[ UNROLLED_LOOP_INDEX ], UNROLLED_LOOP_INDEX );
				if ( kagW > 0.001 ) {
					directionalLightShadow = directionalLightShadows[ i ];
					kagS = ( directLight.visible && receiveShadow ) ? kagGetShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ], UNROLLED_LOOP_INDEX, kagPhi ) : 1.0;
					directLight.color *= mix( 1.0, kagS, kagFade ) * kagW;
					RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
				}

			#else

				RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

			#endif

		}
		#pragma unroll_loop_end

	#else

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];

			getDirectionalLightInfo( directionalLight, directLight );

			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
			directionalLightShadow = directionalLightShadows[ i ];
			directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			#endif

			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}
		#pragma unroll_loop_end

	#endif

#endif
`;

const DIR_MARK = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const RECT_MARK = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';

/**
 * Splice our directional block into three's chunk. Done once at module load; if three
 * ever reshapes the chunk we detect it and silently fall back to stock shadows rather
 * than emitting a shader that will not compile.
 */
const KAG_LIGHTS_FRAGMENT_BEGIN = (function build() {
  const src = ShaderChunk.lights_fragment_begin;
  const a = src.indexOf(DIR_MARK);
  const b = src.indexOf(RECT_MARK);
  if (a < 0 || b < 0 || b <= a) return null;
  return src.slice(0, a) + KAG_DIR_BLOCK + '\n' + src.slice(b);
})();

/** Material types whose fragment shader actually contains lights_fragment_begin. */
function isLitMaterial(m) {
  return !!(m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial ||
    m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshToonMaterial ||
    (m.isShaderMaterial && m.lights === true && !m.isRawShaderMaterial)));
}

/**
 * three's default program cache key is `onBeforeCompile.toString()`, so the wrapper has
 * to forward the original's source or two materials carrying different author patches
 * would hash identically and share one compiled program.
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

function chainCacheKey(material, tokenFn) {
  const prev = material.customProgramCacheKey;
  material.customProgramCacheKey = function () {
    return (prev ? prev.call(this) : '') + '|' + tokenFn();
  };
}

// =============================================================================

export class LightingSystem {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.lighting = this;

    this.cascadeCount = 1;
    this.shadowMapSize = 1024;
    this.shadowDistance = 60;
    this.softShadows = false;

    /** All cascade lights; `sun` is the first and the one other systems should read. */
    this.cascadeLights = [];
    this.sun = null;
    this.hemi = null;
    this.rim = null;

    this.sunDirection = new Vector3(0, 1, 0);
    this.shadowsActive = true;
    /** Live handles on the two halves of the ambient budget; see PROBE_AMBIENT_SHARE. */
    this.probeAmbientShare = PROBE_AMBIENT_SHARE;
    this.hemiAmbientShare = HEMI_AMBIENT_SHARE;
    /**
     * Diagnostics, written every frame: what every non-key term is actually putting on an
     * up-facing surface, in luminous irradiance, next to the key. Read these rather than
     * the intensities — an intensity is meaningless without the colour it multiplies, which
     * is exactly the mistake that let a probe carry three quarters of the fill unnoticed.
     *
     * `rim` is here because it was **not**, and its absence has been quietly distorting
     * every key/fill argument on this project. `this.rim` is a scene-wide DirectionalLight
     * with `castShadow = false`; read live off the magic-hour rig it is intensity 0.2988 on
     * (0.3832, 0.5055, 0.7321), i.e. **0.1482 of luminous irradiance** — a third of the
     * stated fill again, cool (B/R 1.910), and landing on every lit surface in the frame
     * whether or not the sun reaches it. With it counted the fill is 0.5937 against a key of
     * 0.3960: the fill is **1.50x the key**, not the 1.125x the three-term report implied.
     *
     * That number is the whole of round 15's "no readable cast shadow on the plaza". On a
     * horizontal plane the best a shadow can do is `1 + key/fill` = **1.67x**, and the
     * differential ablation measures the full rig at **1.38x** and the same frame with the
     * ambient zeroed at **2.24x**. The shadow map is not the problem and never was; the
     * exposure ratio is, and it cannot be reasoned about from a report that omits a third
     * of its denominator.
     */
    this.ambientReport = { key: 0, probe: 0, hemi: 0, rim: 0, fill: 0 };

    this._splits = null;
    this._band = null;
    this._sphereZ = null;
    this._sphereR = null;
    // Cached camera signature; compared numerically so frameShadows never allocates.
    this._fitFov = -1;
    this._fitAspect = -1;
    this._fitNear = -1;
    this._fitFar = -1;
    this._backoff = 60;

    this._pool = [];
    this._poolSize = 0;
    this._lightCull = 60;

    // --- standing lights ------------------------------------------------------
    /** Registrations, unbounded. Slots are not; see STANDING_SLOTS. */
    this._standing = [];
    this._standingPool = [];
    this._standingOrder = new Int32Array(32);
    this._standingDist = new Float32Array(32);
    this._standingId = 0;
    this._time = 0;
    /** Diagnostics that must not spam a 60 Hz loop; see `_warnOnce`. */
    this._warned = new Set();

    this._materials = new Set();
    this._scanTimer = 0;
    this._patchToken = 'kagcsm2-0';
    this._onMaterialScan = (o) => this._scanObject(o);

    // Uniform objects are shared by reference with every patched material, so one
    // write per frame updates the whole scene.
    this._u = {
      kagCascades: { value: [] },
      kagShadowFade: { value: new Vector2(50, 60) },
      kagBlendFrac: { value: 0.12 },
      kagPcssSearch: { value: 0.006 },
      kagPcssScale: { value: 6.0 },
      kagPcssMax: { value: 0.012 },
    };

    /** Public CSM handle (mirrors the shape other engines expose). */
    this.csm = {
      cascades: 1,
      lights: this.cascadeLights,
      splits: null,
      uniforms: this._u,
      setupMaterial: (m) => this.setupMaterial(m),
      update: () => this.frameShadows(this.ctx.camera),
    };
  }

  // ----------------------------------------------------------------- lifecycle

  async init() {
    this._build(this.ctx.quality);
  }

  _build(q) {
    const scene = this.ctx.scene;

    // With shadows off, USE_SHADOWMAP is undefined and the shader falls back to the
    // stock directional loop — which would sum all N cascade lights at full intensity.
    // One light is the only safe configuration there.
    this._shadowsEnabled = !!q.shadows;
    this.cascadeCount = this._shadowsEnabled ? Math.max(1, Math.min(MAX_CASCADES, q.shadowCascades | 0)) : 1;
    this.shadowMapSize = q.shadowMapSize | 0;
    this.shadowDistance = q.shadowDistance;
    this.softShadows = !!q.softShadows;
    this._backoff = MathUtils.clamp(this.shadowDistance * 0.55, 30, 130);

    // --- cascades ------------------------------------------------------------
    for (const l of this.cascadeLights) {
      scene.remove(l);
      scene.remove(l.target);
      l.shadow.map?.dispose();
      l.dispose?.();
    }
    this.cascadeLights.length = 0;

    for (let i = 0; i < this.cascadeCount; i++) {
      const light = new DirectionalLight(0xffd9a8, 3.0);
      light.name = `sunCascade${i}`;
      light.castShadow = q.shadows;
      light.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 400;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      // We reinterpret `radius` as our own PCF disk radius in texels.
      light.shadow.radius = i === 0 ? 2.2 : 1.4;
      light.shadow.intensity = 1.0;
      scene.add(light);
      scene.add(light.target);
      this.cascadeLights.push(light);
    }
    this.sun = this.cascadeLights[0];
    this.csm.cascades = this.cascadeCount;
    this.csm.lights = this.cascadeLights;

    this._splits = new Float32Array(this.cascadeCount + 1);
    // One band per *split*, so the two cascades either side of a split fade over the same
    // interval. `band[0]` and `band[n]` stay 0: the outer edges of the outermost cascades
    // are not seams and must not be padded.
    this._band = new Float32Array(this.cascadeCount + 1);
    this._sphereZ = new Float32Array(this.cascadeCount);
    this._sphereR = new Float32Array(this.cascadeCount);
    this.csm.splits = this._splits;

    // Always MAX_CASCADES long, never `cascadeCount`. three's `WebGLUniforms.flatten`
    // walks an array uniform to the size the *compiled program* declares, so if this
    // array is ever shorter than KAG_CASCADES — one tier step down, before every
    // material has recompiled, or if an author's `customProgramCacheKey` has dropped
    // our token and a stale program gets reused — it reads past the end and throws
    // inside the renderer. Padding costs three Vector4s and removes the whole class.
    const arr = [];
    for (let i = 0; i < MAX_CASCADES; i++) arr.push(new Vector4(0, 1, 0.02, 0.02));
    this._u.kagCascades.value = arr;
    this._fitFov = -1;

    // --- ambient / bounce ----------------------------------------------------
    if (!this.hemi) {
      this.hemi = new HemisphereLight(0x6f8db8, 0x4c3f31, 0.35);
      this.hemi.name = 'skyBounce';
      scene.add(this.hemi);
    }

    // --- rim fill ------------------------------------------------------------
    // ARCHITECTURE §5.10: silhouettes must read at all times. A weak cool light kept
    // behind whatever the camera is looking at guarantees separation even when a
    // black-lacquered oni stands in front of a shadowed cedar wall.
    if (!this.rim) {
      this.rim = new DirectionalLight(0x7fa3d6, 0.32);
      this.rim.name = 'rimFill';
      this.rim.castShadow = false;
      scene.add(this.rim);
      scene.add(this.rim.target);
    }

    // --- dynamic point pool --------------------------------------------------
    const want = [2, 4, 6, 8][MathUtils.clamp(q.tier | 0, 0, 3)];
    if (want !== this._poolSize) {
      for (const e of this._pool) { scene.remove(e.light); e.light.dispose?.(); }
      this._pool.length = 0;
      for (let i = 0; i < want; i++) {
        const light = new PointLight(0xffffff, 0, 8, 2);
        light.name = `dynLight${i}`;
        light.castShadow = false;
        // Kept permanently in the scene at zero intensity: removing a light changes
        // NUM_POINT_LIGHTS, which recompiles every shader in the frame it happens.
        light.visible = true;
        scene.add(light);
        this._pool.push({ light, active: false, age: 0, ttl: 1, base: 0, radius: 8 });
      }
      this._poolSize = want;
    }

    // --- standing point slots -------------------------------------------------
    // Same "allocate once, rebind forever" rule as the spark pool, and for the same
    // reason: the count is baked into every compiled shader.
    const wantStanding = STANDING_SLOTS[MathUtils.clamp(q.tier | 0, 0, 3)];
    if (wantStanding !== this._standingPool.length) {
      for (const l of this._standingPool) { scene.remove(l); l.dispose?.(); }
      this._standingPool.length = 0;
      for (let i = 0; i < wantStanding; i++) {
        const light = new PointLight(0xffffff, 0, 8, 2);
        light.name = `standingLight${i}`;
        light.castShadow = false;
        light.visible = true;
        scene.add(light);
        this._standingPool.push(light);
      }
      for (const e of this._standing) e._bound = false;
    }

    // --- shader ---------------------------------------------------------------
    this._patchToken = `kagcsm2-${this.cascadeCount}-${this.softShadows ? 1 : 0}-${this._pcfTaps()}`;
    for (const m of this._materials) m.needsUpdate = true;

    this.frameShadows(this.ctx.camera);
  }

  _pcfTaps() {
    switch (this.ctx.quality.tier) {
      case 0: return 4;
      case 1: return 8;
      case 2: return 12;
      default: return 16;
    }
  }

  _blockerTaps() {
    return this.ctx.quality.tier >= 2 ? 12 : 8;
  }

  // ------------------------------------------------------------ material patch

  /**
   * Make a material CSM-aware. Idempotent, chains onto any existing onBeforeCompile,
   * and no-ops for materials that do not go through the standard lighting chunk.
   */
  setupMaterial(material) {
    if (!material || !KAG_LIGHTS_FRAGMENT_BEGIN) return material;
    if (material.userData?.kagCSM) return material;
    if (!isLitMaterial(material)) return material;

    material.userData = material.userData || {};
    material.userData.kagCSM = true;
    this._materials.add(material);

    const u = this._u;
    const self = this;
    chainBeforeCompile(material, (shader) => {
      if (shader.fragmentShader.indexOf('#include <lights_fragment_begin>') < 0) return;

      shader.uniforms.kagCascades = u.kagCascades;
      shader.uniforms.kagShadowFade = u.kagShadowFade;
      shader.uniforms.kagPcssSearch = u.kagPcssSearch;
      shader.uniforms.kagPcssScale = u.kagPcssScale;
      shader.uniforms.kagPcssMax = u.kagPcssMax;

      const defines =
        '#define KAG_CSM\n' +
        `#define KAG_CASCADES ${self.cascadeCount}\n` +
        `#define KAG_PCF_TAPS ${self._pcfTaps()}\n` +
        `#define KAG_BLOCKER_TAPS ${self._blockerTaps()}\n` +
        (self.softShadows ? '#define KAG_PCSS\n' : '');

      shader.fragmentShader = defines + shader.fragmentShader
        .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + KAG_SHADOW_PARS)
        .replace('#include <lights_fragment_begin>', KAG_LIGHTS_FRAGMENT_BEGIN);
    }, 'kagcsm');
    chainCacheKey(material, () => this._patchToken);
    material.needsUpdate = true;
    return material;
  }

  _scanObject(o) {
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) {
      for (let i = 0; i < m.length; i++) this.setupMaterial(m[i]);
    } else {
      this.setupMaterial(m);
    }
  }

  /** Periodic sweep so systems that build materials later still get cascades. */
  _scanScene() {
    this.ctx.scene.traverse(this._onMaterialScan);
  }

  // ------------------------------------------------------------------ cascades

  /**
   * Practical (PSSM) split scheme: lambda between the logarithmic and uniform
   * distributions. Logarithmic alone wastes the far cascades on a 0.12 m near plane.
   *
   * 0.78, not the 0.6 it was. Evaluated for the phone review framing (MEDIUM: 2 cascades,
   * 1536 map, 70 m; 2532x1170 so aspect 2.164) the old lambda put the first split at 19.0 m
   * and gave cascade 0 a bounding sphere of radius 28.3 m — a 56.7 m ortho box, 3.69 cm per
   * texel, and a 5.90 cm normal bias, which is 6 cm of the base of every prop pushed out
   * from under its own shadow before the map is ever sampled. At 0.78 the split is 14.2 m,
   * the sphere 21.2 m, the texel 2.76 cm and the bias 4.41 cm.
   *
   * The trade is explicit: the sharp band shortens from 19 m to 14 m, so props between those
   * two ranges drop to the far cascade. It is priced against round 7's finding, which is
   * about the *foreground* — "the two large stone lanterns", 4-8 m out — and about the near
   * cascade's job under ARCHITECTURE §5.2. It costs nothing on the far cascade, which is the
   * surprising part: that sphere's radius is set by `rFar`, which depends only on the outer
   * split. Measured before and after, the far cascade moves 102.57 m -> 102.97 m.
   */
  _computeSplits(camera) {
    const n = this.cascadeCount;
    const near = camera.near;
    const far = Math.min(camera.far, this.shadowDistance);
    const lambda = 0.78;
    const s = this._splits;

    s[0] = near;
    const logNear = Math.max(near, 1.0);
    for (let i = 1; i < n; i++) {
      const p = i / n;
      const logSplit = logNear * Math.pow(far / logNear, p);
      const uniSplit = near + (far - near) * p;
      s[i] = lambda * logSplit + (1 - lambda) * uniSplit;
    }
    s[n] = far;

    // Bounding sphere of each sub-frustum, in closed form. Depends only on fov,
    // aspect and the splits, so the ortho box size is constant frame to frame —
    // that is half of what stops the cascade from shimmering.
    const tanV = Math.tan(camera.fov * 0.5 * DEG2RAD);
    const tanH = tanV * camera.aspect;
    const a2 = tanH * tanH + tanV * tanV;
    const blend = this._u.kagBlendFrac.value;

    // The cross-fade band belongs to the split, not to the cascade, and getting that wrong
    // is not a subtlety — it breaks energy conservation across a band several metres deep.
    // The old code derived `bw` from each cascade's own extent, so at the single MEDIUM
    // split the near cascade faded out over 1.69 m while the far cascade faded in over
    // 6.69 m. Two smoothsteps of different width do not sum to 1. Measured on the phone
    // review framing (2 cascades, splits 0.12 / 14.24 / 70 m, fov 46, aspect 2.164), the
    // weights summed to **1.296 at 13.4 m and 0.702 at 15.1 m** — up to 30% too much key
    // and then 30% too little, in a ~7 m deep band that crosses the plaza in every
    // framing. Sizing the band off the *narrower* neighbour (so it can never run past
    // either cascade's own coverage) and handing that one width to both sides makes the
    // pair sum to exactly 1 at every depth.
    const band = this._band;
    band[0] = 0;
    band[n] = 0;
    for (let i = 1; i < n; i++) {
      band[i] = Math.max(Math.min(s[i] - s[i - 1], s[i + 1] - s[i]) * blend, 0.02);
    }

    for (let i = 0; i < n; i++) {
      const cn = Math.max(near, s[i] - band[i] * 0.5);
      const cf = s[i + 1] + band[i + 1] * 0.5;

      let zc = (cf + cn) * (a2 + 1) * 0.5;
      if (zc > cf) zc = cf;
      const rFar = Math.sqrt(cf * cf * a2 + (cf - zc) * (cf - zc));
      const rNear = Math.sqrt(cn * cn * a2 + (cn - zc) * (cn - zc));

      this._sphereZ[i] = zc;
      this._sphereR[i] = Math.max(rFar, rNear) * 1.02;
      this._u.kagCascades.value[i].set(s[i], s[i + 1], band[i], band[i + 1]);
    }

    // Fade the shadow contribution out before the last cascade's far edge so the
    // boundary dissolves instead of popping. Skipped while the sun is down, where
    // update() has parked the band behind the camera to disable sampling entirely.
    if (this.shadowsActive) this._u.kagShadowFade.value.set(far * 0.80, far * 0.97);

    // PCSS is expressed in shadow-map UV: a world penumbra of
    // (receiver-blocker) * depthRange * spread, divided by the ortho width.
    const r0 = this._sphereR[0];
    const depthRange = 2 * r0 + this._backoff * 2;
    const spread = 0.055;                       // artistic sun size, ~3° not 0.53°
    this._u.kagPcssScale.value = depthRange * spread / (2 * r0);
    // Both of these were expressed in texels, which means they were expressed in nothing:
    // a texel is a different world size in every quality tier and at every aspect ratio.
    // On the phone review framing `2.5 / 1536 * 4` came out as a **36.9 cm** blocker-search
    // disk, sampled with eight Vogel taps whose radii are 0.13 .. 0.39 m — so for a stone
    // lantern whose shaft is about 35 cm across, at most one or two taps can land on the
    // caster, and when none do `kagGetShadow` takes the `found < 0.5` early-out and returns
    // *fully lit* without running the PCF at all. That is the shape of round 7's finding
    // exactly: a long thin banner-pole shadow 20 m out survives (its blocker is nowhere near
    // its receiver, so the wide search finds it), while the tight contact under a 2.5 m
    // lantern in the same build does not exist. Stating both in metres of world and dividing
    // by the cascade's own ortho width makes them mean the same thing on every device.
    this._u.kagPcssSearch.value = MathUtils.clamp(
      PCSS_SEARCH_METRES / (2 * r0), 2.0 / this.shadowMapSize, 0.02);
    this._u.kagPcssMax.value = MathUtils.clamp(
      PCSS_PENUMBRA_MAX_METRES / (2 * r0), 4.0 / this.shadowMapSize, 0.02);
  }

  /**
   * Refit every cascade against the camera. Public because a cutscene camera may want
   * to force a refit before its first frame is drawn.
   */
  frameShadows(camera) {
    if (!camera || !this.cascadeLights.length) return;

    const far = Math.min(camera.far, this.shadowDistance);
    if (camera.fov !== this._fitFov || camera.aspect !== this._fitAspect ||
        camera.near !== this._fitNear || far !== this._fitFar) {
      this._computeSplits(camera);
      this._fitFov = camera.fov;
      this._fitAspect = camera.aspect;
      this._fitNear = camera.near;
      this._fitFar = far;
    }

    camera.getWorldDirection(_camDir);
    const dir = this.sunDirection;
    const up = Math.abs(dir.y) > 0.995 ? _upZ : _upY;

    for (let i = 0; i < this.cascadeLights.length; i++) {
      const light = this.cascadeLights[i];
      const r = this._sphereR[i];
      const back = r + this._backoff;

      _center.copy(camera.position).addScaledVector(_camDir, this._sphereZ[i]);
      _lightPos.copy(_center).addScaledVector(dir, back);

      // Build the light camera's world matrix ourselves so we can snap in its space.
      _m.lookAt(_lightPos, _center, up);
      _m.setPosition(_lightPos);
      _mInv.copy(_m).invert();

      const texel = (2 * r) / this.shadowMapSize;
      _snap.copy(_center).applyMatrix4(_mInv);
      _snap.x = Math.round(_snap.x / texel) * texel;
      _snap.y = Math.round(_snap.y / texel) * texel;
      _snap.applyMatrix4(_m);

      light.position.copy(_snap).addScaledVector(dir, back);
      light.target.position.copy(_snap);
      light.target.updateMatrixWorld();

      const cam = light.shadow.camera;
      cam.up.copy(up);
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.near = 0.1;
      cam.far = back + r + this._backoff;
      cam.updateProjectionMatrix();

      // Bias in normalised depth has to track the box, or a big far cascade acnes
      // while a tight near one peter-pans.
      const depthRange = cam.far - cam.near;
      light.shadow.normalBias = texel * 1.6;
      light.shadow.bias = -1.6 * texel / depthRange;
    }
  }

  // ------------------------------------------------------------- diagnostics

  /**
   * A rejected light and a light nobody asked for look identical on screen, so every
   * rejection has to say so — exactly once, because these sit inside a 60 Hz loop.
   */
  _warnOnce(key, message) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[Lighting] ${message}`);
  }

  /** Duck-typed world position: a Vector3, or anything with finite x/y/z. */
  static _readPos(o, out) {
    if (!o) return false;
    const p = (o.position !== undefined && o.position !== null) ? o.position : o;
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      out.set(p.x, p.y, p.z);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------- spark pool

  /**
   * Borrow a point light for a **transient** flash — a hit spark, a parry, an ember
   * pop. The slot is on a `(1-u)²` envelope and is gone inside `ttl`; the allocator
   * steals the oldest when every slot is busy. Returns the THREE.PointLight so the
   * caller can retarget it while it lives.
   *
   * If you want a light that *stays on* — a lantern, a brazier, a chōchin — this is
   * the wrong function; use `addLight()`.
   *
   * Accepts either positional arguments or a single options object
   * (`{ position, color, intensity, distance | radius, duration | ttl }`), because
   * both call styles already exist in the codebase and a mis-shaped call used to
   * produce a NaN-positioned light rather than an error.
   *
   * @param {Vector3|object} pos  world position, or an options object
   * @param {number|Color} color
   * @param {number} intensity
   * @param {number} radius   metres of influence
   * @param {number} ttl      seconds; the envelope decays across it
   */
  requestSpark(pos, color = 0xffffff, intensity = 3, radius = 8, ttl = 0.35) {
    const pool = this._pool;
    if (!pool.length) return null;

    // Options-object form. Detected rather than declared so existing callers work.
    if (pos && pos.isVector3 !== true && typeof pos === 'object' &&
        (pos.position !== undefined || pos.distance !== undefined || pos.duration !== undefined)) {
      const o = pos;
      if (!LightingSystem._readPos(o, _sparkPos)) {
        this._warnOnce('spark:pos',
          'requestSpark()/requestLight() got an options object with no usable position. ' +
          'Expected { position: Vector3, color, intensity, distance, duration }. Spark dropped.');
        return null;
      }
      return this.requestSpark(
        _sparkPos,
        o.color !== undefined ? o.color : 0xffffff,
        Number.isFinite(o.intensity) ? o.intensity : 3,
        Number.isFinite(o.distance) ? o.distance : (Number.isFinite(o.radius) ? o.radius : 8),
        Number.isFinite(o.duration) ? o.duration : (Number.isFinite(o.ttl) ? o.ttl : 0.35),
      );
    }

    if (!LightingSystem._readPos(pos, _sparkPos)) {
      this._warnOnce('spark:args',
        'requestSpark(pos, color, intensity, radius, ttl) needs a Vector3 position. ' +
        'For a light that has to stay lit, use addLight({ position, color, intensity, radius, flicker }) ' +
        '— the spark pool decays to nothing within its ttl. Spark dropped.');
      return null;
    }
    pos = _sparkPos;

    let slot = -1;
    let worst = -1;
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i];
      if (!e.active) { slot = i; break; }
      const progress = e.age / e.ttl;
      if (progress > worst) { worst = progress; slot = i; }
    }

    const e = pool[slot];
    e.active = true;
    e.age = 0;
    e.ttl = Math.max(ttl, 1 / 60);
    e.base = intensity;
    e.radius = radius;
    e.light.position.copy(pos);
    e.light.distance = radius;
    if (color && color.isColor) e.light.color.copy(color);
    else e.light.color.set(color);
    e.light.intensity = 0;
    return e.light;
  }

  /** Former name of `requestSpark`. Kept so existing FX/Combat call sites keep working. */
  requestLight(pos, color, intensity, radius, ttl) {
    return this.requestSpark(pos, color, intensity, radius, ttl);
  }

  // ---------------------------------------------------------- standing lights

  /**
   * Register a light that stays lit until it is removed: a lantern flame, a brazier,
   * a chōchin. The opposite of `requestSpark` in every way that matters — no envelope,
   * no stealing, and its own hardware budget (STANDING_SLOTS) so combat and the
   * shrine's lighting cannot starve each other.
   *
   * Registrations are unbounded and cheap; *slots* are not, because NUM_POINT_LIGHTS is
   * baked into every compiled shader. Each frame the nearest `STANDING_SLOTS[tier]`
   * enabled registrations are bound to the real PointLights, so the lantern you are
   * standing next to always wins, and one you can barely see costs nothing but a
   * distance compare.
   *
   * The returned handle is a live record, not a THREE.Light — mutate `position` in
   * place, or set `color` / `intensity` / `radius` / `flicker` / `enabled` at any time.
   *
   * `position` may be a Vector3 or any `{x, y, z}`; the whole options object may also
   * be flat (`{ x, y, z, ... }`) and `radius` may be spelled `distance`, so a record
   * built by Level's prop pass can be handed straight in.
   *
   * @param {object} options { position | x,y,z, color, intensity, radius|distance, flicker, enabled }
   * @returns {object|null} handle for `removeLight`, or null if the request was rejected
   */
  addLight(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      this._warnOnce('add:shape',
        `addLight() takes an options object — { position, color, intensity, radius, flicker } — ` +
        `and got ${Array.isArray(options) ? 'an array' : typeof options}. Light ignored.`);
      return null;
    }
    if (!LightingSystem._readPos(options, _standPos)) {
      this._warnOnce('add:position',
        'addLight() needs a world position: options.position as a Vector3/{x,y,z}, or x/y/z on the ' +
        'options object itself. Light ignored.');
      return null;
    }
    if (this._standing.length >= STANDING_MAX) {
      this._warnOnce('add:full',
        `addLight() registry is full at ${STANDING_MAX}. Only the nearest ` +
        `${this._standingPool.length} are ever bound, so further registrations could not change a ` +
        'frame — but this many probably means something is registering in a loop. Light ignored.');
      return null;
    }
    if (options.castShadow) {
      this._warnOnce('add:castShadow',
        'addLight({ castShadow: true }) is not honoured. A shadow-casting point light renders the ' +
        'whole caster set to six cube faces; on this scene that is several hundred draw calls for ' +
        'one lantern. The light is added without a shadow.');
    }

    const radius = Number.isFinite(options.radius) ? options.radius
      : (Number.isFinite(options.distance) ? options.distance : 8);
    const handle = {
      id: ++this._standingId,
      position: new Vector3().copy(_standPos),
      color: new Color(),
      intensity: Number.isFinite(options.intensity) ? options.intensity : 2,
      radius: Math.max(0.05, radius),
      flicker: Number.isFinite(options.flicker) ? MathUtils.clamp(options.flicker, 0, 1) : 0,
      enabled: options.enabled !== false,
      // Decorrelate the flames: without this every lantern in the shrine breathes in
      // perfect unison, which reads as a global exposure wobble rather than as fire.
      phase: (this._standingId * 2.39996323) % 6.2831853,
      _bound: false,
    };
    if (options.color !== undefined && options.color !== null) {
      if (options.color.isColor) handle.color.copy(options.color);
      else handle.color.set(options.color);
    } else {
      handle.color.setHex(0xffb060);
    }

    this._standing.push(handle);
    this._growStandingScratch(this._standing.length);
    return handle;
  }

  /** Release a handle from `addLight`. Safe to call twice, or with null. */
  removeLight(handle) {
    if (!handle) return false;
    const i = this._standing.indexOf(handle);
    if (i < 0) return false;
    // Order is recomputed every frame, so a swap-pop is free here.
    const last = this._standing.pop();
    if (i < this._standing.length) this._standing[i] = last;
    handle._bound = false;
    return true;
  }

  /** Drop every standing light. Used by level teardown. */
  clearLights() {
    this._standing.length = 0;
    for (const l of this._standingPool) l.intensity = 0;
  }

  /** Index scratch grows amortised, never inside the frame loop. */
  _growStandingScratch(n) {
    if (this._standingOrder.length >= n) return;
    let cap = this._standingOrder.length;
    while (cap < n) cap *= 2;
    this._standingOrder = new Int32Array(cap);
    this._standingDist = new Float32Array(cap);
  }

  /**
   * Bind the nearest N registrations to the hardware slots. O(registrations) plus
   * O(registrations x slots) for the partial selection — with slots capped at 5 that is
   * a handful of compares, and it allocates nothing.
   */
  _updateStanding() {
    const pool = this._standingPool;
    const k = pool.length;
    if (k === 0) return;

    const reg = this._standing;
    const n = reg.length;
    const camPos = this.ctx.camera.position;
    const order = this._standingOrder;
    const dist = this._standingDist;

    let live = 0;
    for (let i = 0; i < n; i++) {
      const e = reg[i];
      if (!e.enabled || e.intensity <= 0) { e._bound = false; continue; }
      const reach = this._lightCull + e.radius;
      const d2 = e.position.distanceToSquared(camPos);
      // Written as "not in range" so a NaN camera (it happens) drops the light rather
      // than binding it at a NaN distance and poisoning every intensity downstream.
      if (!(d2 <= reach * reach)) { e._bound = false; continue; }
      // Sitting tenants get a discount so a rival has to be clearly closer to evict them.
      dist[live] = e._bound ? d2 * STANDING_HYSTERESIS : d2;
      order[live] = i;
      live++;
    }

    const take = Math.min(live, k);
    for (let s = 0; s < take; s++) {
      let best = s;
      for (let j = s + 1; j < live; j++) if (dist[j] < dist[best]) best = j;
      if (best !== s) {
        const td = dist[s]; dist[s] = dist[best]; dist[best] = td;
        const to = order[s]; order[s] = order[best]; order[best] = to;
      }
    }
    for (let j = take; j < live; j++) reg[order[j]]._bound = false;

    // ARCHITECTURE §10: Weather owns the gust. A flame leans on it rather than
    // inventing its own, so the lanterns breathe on the same front that bends the grass.
    // Weather writes `gust` during *its* update, which runs after ours, so on the first
    // frame the field is still whatever main.js seeded. Read defensively.
    const w = this.ctx.wind;
    const gust = (w && Number.isFinite(w.gust)) ? w.gust : 0;
    const t = this._time;

    for (let s = 0; s < k; s++) {
      const light = pool[s];
      if (s >= take) {
        if (light.intensity !== 0) light.intensity = 0;
        continue;
      }
      const e = reg[order[s]];
      e._bound = true;
      light.position.copy(e.position);
      light.color.copy(e.color);
      light.distance = e.radius;

      let inten = e.intensity;
      if (e.flicker > 0) {
        const p = e.phase;
        const wobble = Math.sin(t * 11.0 + p) * 0.5 +
          Math.sin(t * 17.3 + p * 2.1) * 0.3 +
          Math.sin(t * 29.7 + p * 3.7) * 0.2;
        inten *= Math.max(0, 1 + e.flicker * wobble * (0.55 + 0.9 * gust));
      }

      // Fade rather than pop as a lantern leaves the culling range.
      const reach = this._lightCull + e.radius;
      const d = e.position.distanceTo(camPos);
      if (d > reach * 0.78) inten *= Math.max(0, 1 - (d - reach * 0.78) / (reach * 0.22));

      // A single non-finite intensity uploads NaN into the light uniform block and
      // blanks every lit material in the frame. Never let one out of here.
      light.intensity = Number.isFinite(inten) ? Math.max(0, inten) : 0;
    }
  }

  _updatePool(dt) {
    const camPos = this.ctx.camera.position;
    const cull = this._lightCull;
    for (let i = 0; i < this._pool.length; i++) {
      const e = this._pool[i];
      if (!e.active) { if (e.light.intensity !== 0) e.light.intensity = 0; continue; }

      e.age += dt;
      if (e.age >= e.ttl) {
        e.active = false;
        e.light.intensity = 0;
        continue;
      }
      const u = e.age / e.ttl;
      // Fast attack (a spark is bright before you see it move), quadratic decay.
      const attack = u < 0.06 ? u / 0.06 : 1;
      const decay = (1 - u) * (1 - u);
      let inten = e.base * attack * decay;

      // Distance cull: a lantern 80 m away contributes nothing but a uniform upload.
      const d = e.light.position.distanceTo(camPos);
      if (d > cull) inten = 0;
      else if (d > cull * 0.75) inten *= 1 - (d - cull * 0.75) / (cull * 0.25);

      e.light.intensity = inten;
    }
  }

  // ------------------------------------------------------------------- system

  update(dt, elapsed) {
    const sky = this.ctx.sky;
    const camera = this.ctx.camera;
    // Own clock: flicker must keep breathing through hit-stop, where dt is scaled to 0.
    this._time = Number.isFinite(elapsed) ? elapsed : this._time + dt;

    if (sky && sky.sunDirection) {
      this.sunDirection.copy(sky.sunDirection);
      const active = this.sunDirection.y > 0.015 && this.ctx.quality.shadows;
      if (active !== this.shadowsActive) {
        this.shadowsActive = active;
        for (const l of this.cascadeLights) l.shadow.autoUpdate = active;
        // Pushing the fade band behind the camera switches shadows off in-shader
        // without touching castShadow, which would recompile every material.
        if (!active) this._u.kagShadowFade.value.set(-2, -1);
      }
      if (active) {
        const far = Math.min(camera.far, this.shadowDistance);
        this._u.kagShadowFade.value.set(far * 0.80, far * 0.97);
      }

      _col.copy(sky.sunColor);
      const intensity = sky.sunIntensity;
      for (let i = 0; i < this.cascadeLights.length; i++) {
        const l = this.cascadeLights[i];
        l.color.copy(_col);
        l.intensity = intensity;
      }

      const ambient = sky.ambientIntensity !== undefined ? sky.ambientIntensity : 0.35;
      this.hemi.color.copy(sky.skyColor);
      this.hemi.groundColor.copy(sky.groundColor);

      // Both terms are solved for a *stated irradiance*, not dialled. `hemi.intensity`
      // multiplies a colour whose luminance swings 12x across the ladder, so holding the
      // intensity fixed does not hold the fill fixed — it is why the cool half of the rig
      // silently shrank to a quarter of the ambient at exactly the hour §5 cares about.
      const skyLum = lum709(this.hemi.color);
      const solvedHemi = skyLum > 1e-4
        ? MathUtils.clamp(this.hemiAmbientShare * ambient / skyLum, 0, AMBIENT_INTENSITY_MAX) : 0;

      // The probe supplies the sky bounce's *shape*; its level is a key/fill decision and
      // therefore ours (§8). `sky.probeIrradiance` is what one unit of environmentIntensity
      // actually lands on an up-facing surface — 2.82 at magic hour, so three's default of
      // 1.0 would have been worth seven times the key.
      const probeIrr = sky.probeIrradiance;
      const probeLum = probeIrr ? lum709(probeIrr) : 0;
      const probeOk = Number.isFinite(probeLum) && probeLum > 1e-4;
      const solvedProbe = probeOk
        ? MathUtils.clamp(this.probeAmbientShare * ambient / probeLum, 0, AMBIENT_INTENSITY_MAX) : 0;

      // A share of the *key* only means something while there is a key. Below the horizon
      // both solvers divide by a night sky's luminance — 0.021 at midnight against magic
      // hour's 0.259 — and run straight into the clamp, which would silently make the night
      // ambient fifteen times brighter than the ladder authored it. So cross-fade to the
      // ladder's own numbers as the sun sets: at sunY <= 0 this block is byte-identical to
      // what round 7 shipped, and the whole change lives in daylight where it was measured.
      const dayW = MathUtils.clamp(this.sunDirection.y / 0.06, 0, 1);
      this.hemi.intensity = MathUtils.lerp(ambient, solvedHemi, dayW);
      // A Sky that does not publish probeIrradiance keeps the round-7 gain outright, rather
      // than solving against a zero and silently switching the probe off in daylight.
      this.ctx.scene.environmentIntensity =
        MathUtils.lerp(ambient * NIGHT_PROBE_GAIN, solvedProbe, probeOk ? dayW : 0);

      // Cool the rim toward the sky bounce so it always reads as the opposite of key.
      _col2.setRGB(0.55, 0.7, 1.0);
      this.rim.color.copy(sky.skyColor).lerp(_col2, 0.55);
      this.rim.intensity = 0.22 + 0.18 * (1 - MathUtils.clamp(sky.sunDirection.y * 2.5, 0, 1));

      // Reported after the rim is solved, not before — the ordering is why it was missed.
      const r = this.ambientReport;
      r.key = lum709(_col) * intensity * Math.max(this.sunDirection.y, 0);
      r.hemi = this.hemi.intensity * skyLum;
      r.probe = this.ctx.scene.environmentIntensity * probeLum;
      // A directional's irradiance on a surface facing it is intensity x colour; the rim is
      // aimed roughly down the view axis from above and behind, so a horizontal plane sees
      // most of this. Unshadowed, so it is present in the cast shadow too.
      r.rim = this.rim.intensity * lum709(this.rim.color);
      r.fill = r.hemi + r.probe + r.rim;
    }

    // --- rim placement: always behind the subject, from the camera's point of view.
    camera.getWorldDirection(_camDir);
    _rimTarget.copy(camera.position).addScaledVector(_camDir, 6);
    _side.crossVectors(_camDir, _upY);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0); else _side.normalize();
    this.rim.position.copy(_rimTarget).addScaledVector(_camDir, 16).addScaledVector(_side, 7);
    this.rim.position.y += 6;
    this.rim.target.position.copy(_rimTarget);
    this.rim.target.updateMatrixWorld();

    this.frameShadows(camera);
    this._updatePool(dt);
    this._updateStanding();

    // Late-created materials (props, FX, enemies) get folded in without every author
    // having to remember to call setupMaterial.
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) {
      this._scanTimer = 0.4;
      this._scanScene();
    }
  }

  resize() {
    // Aspect (and on phones, fov) changed — the bounding spheres must be recomputed.
    this._fitFov = -1;
  }

  applyQuality(q) {
    const wantCascades = q.shadows ? Math.max(1, Math.min(MAX_CASCADES, q.shadowCascades | 0)) : 1;
    const cascadesChanged = wantCascades !== this.cascadeCount;
    const sizeChanged = (q.shadowMapSize | 0) !== this.shadowMapSize;
    const shadowsChanged = !!q.shadows !== this._shadowsEnabled;
    const softChanged = !!q.softShadows !== this.softShadows;
    const distChanged = q.shadowDistance !== this.shadowDistance;

    if (cascadesChanged || sizeChanged || shadowsChanged) {
      this._build(q);
      this._scanScene();
      return;
    }

    this.softShadows = !!q.softShadows;
    this.shadowDistance = q.shadowDistance;
    this._backoff = MathUtils.clamp(this.shadowDistance * 0.55, 30, 130);
    for (const l of this.cascadeLights) l.castShadow = q.shadows;

    if (softChanged || distChanged) {
      this._patchToken = `kagcsm2-${this.cascadeCount}-${this.softShadows ? 1 : 0}-${this._pcfTaps()}`;
      for (const m of this._materials) m.needsUpdate = true;
      this._fitFov = -1;
    }
  }

  dispose() {
    const scene = this.ctx.scene;
    for (const l of this.cascadeLights) {
      scene.remove(l);
      scene.remove(l.target);
      l.shadow.map?.dispose();
      l.dispose?.();
    }
    this.cascadeLights.length = 0;
    for (const e of this._pool) { scene.remove(e.light); e.light.dispose?.(); }
    this._pool.length = 0;
    for (const l of this._standingPool) { scene.remove(l); l.dispose?.(); }
    this._standingPool.length = 0;
    this._standing.length = 0;
    if (this.hemi) { scene.remove(this.hemi); this.hemi.dispose?.(); this.hemi = null; }
    if (this.rim) { scene.remove(this.rim); scene.remove(this.rim.target); this.rim.dispose?.(); this.rim = null; }
    this._materials.clear();
    // We are the only writer of this, so hand it back the way three left it.
    scene.environmentIntensity = 1;
    this.sun = null;
  }
}

export default LightingSystem;
