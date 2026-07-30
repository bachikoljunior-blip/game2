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
  ShaderChunk, Vector2, Vector3,
} from 'three';

const DEG2RAD = MathUtils.DEG2RAD;

/**
 * Gain on the image-based ambient probe (`Scene.environmentIntensity`), expressed as a
 * fraction of the hour's authored ambient level so the time-of-day ladder still drives it.
 *
 * three defaults `environmentIntensity` to 1.0, and until now nobody set it — the one
 * number in the whole rig that no one chose. Sky captures its PMREM *pre-knee and
 * pre-display-scale* (SkySystem._renderEnvironment), so left at 1.0 the probe alone lands
 * roughly 2.0 of diffuse irradiance on an up-facing surface and out-votes the key entirely;
 * that was the original "the sun is not reaching the surface" bug, and it is why this number
 * exists. ARCHITECTURE §4 budgets the ambient at ~0.35 against a key of ~3.0; §8 puts light
 * probes in this file, so this is where that ratio is held.
 *
 * Deliberately multiplied by the *un-raked* ambient (`sky.ambientIntensity`), not by the
 * raked fill level: the probe supplies specular and IBL shape — the thing wet stone and the
 * blade mirror — and a raking-sun exposure correction has no business scaling a mirror. The
 * diffuse fill's level is the hemisphere's job, where we control the colour.
 *
 * Round-5 measurement that set 0.60, through a JS twin of the whole composite chain validated
 * against the r5 captures (it reproduces desktop-torii's lit flagstone at (64,41,31) against a
 * measured (62,37,22) and the dark-population mean at luminance 16.7 against a measured 17.4):
 * at 0.60 the probe carries ~40% of the fill's luminance and the hemisphere the rest, which
 * lands open shadow on the plaza at code (46, 60, 82) — luminance 58.6, R-B −36, the sign and
 * the magnitude §5 asks for, up from (14, 17, 21) at luminance 16.7. Every step further is
 * bought from the hemisphere's authored hue: 0.68 costs a point of R-B for four of luminance,
 * and at 1.00 the probe out-votes the hue entirely, which is what the earlier experiment
 * recorded — flagstone (84, 84, 97), neutral, with the cast shadow invisible.
 */
const ENV_AMBIENT_GAIN = 0.60;

/**
 * The contract's shadow/ambient swatch, #4a6b8f, as a linear peak-normalised direction —
 * i.e. its *hue*, with the level stripped off. ARCHITECTURE §5 does not permit a neutral or
 * warm shadow side, and a probe that averages the whole sky dome cannot deliver this on its
 * own: the r5 probe's cosine-weighted mean was (0.851, 0.973, 1.057), B/R = 1.24, against
 * this swatch's B/R = 4.01. So the hemisphere light — the term whose colour we actually
 * choose — is biased this far toward the swatch and given the authority to carry the fill.
 */
const SHADOW_HUE = new Vector3(0.249, 0.535, 1.0);
/** How far the hemisphere's sky colour is pulled from the computed sky bounce to SHADOW_HUE. */
const SHADOW_HUE_BIAS = 0.72;
/**
 * Ground-bounce level, as a fraction of the sky term, and how far it is pulled toward the
 * sky's hue. A soffit under the honden eaves sees mostly the veranda deck, so the bounce has
 * to stay warm — but at r5's levels it was the *only* thing on that surface, which is how a
 * shadowed veranda measured (37, 29, 24), warm dark brown, where §5 wants cool.
 */
const GROUND_BOUNCE = 0.55;
const GROUND_BOUNCE_HUE_BIAS = 0.60;

/** Ceiling on cascades, and the fixed length of the `kagCascades` uniform array. */
const MAX_CASCADES = 4;

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
const _colFill = new Color();
const _colBounce = new Color();
const _sparkPos = new Vector3();
const _standPos = new Vector3();

// ------------------------------------------------------------------ glsl

/**
 * Injected right after `shadowmap_pars_fragment`, so the sampler declarations and the
 * `packing` helpers it needs already exist.
 */
const KAG_SHADOW_PARS = /* glsl */`
#if defined( KAG_CSM ) && defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )

	uniform vec2  kagCascades[ KAG_CASCADES ];
	uniform vec2  kagShadowFade;
	uniform float kagBlendFrac;
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
	 * Cascade membership with a symmetric cross-fade band straddling each split, so the
	 * two neighbouring cascades' weights always sum to 1 across the seam.
	 */
	float kagCascadeWeight( float d, vec2 sp, int idx ) {
		float bw = max( ( sp.y - sp.x ) * kagBlendFrac, 0.02 );
		float wIn = 1.0;
		float wOut = 1.0;
		if ( idx > 0 ) wIn = smoothstep( sp.x - bw * 0.5, sp.x + bw * 0.5, d );
		if ( idx < KAG_CASCADES - 1 ) wOut = 1.0 - smoothstep( sp.y - bw * 0.5, sp.y + bw * 0.5, d );
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
    /**
     * The fill's colour at the level it is actually delivered at — i.e. the frame's cool
     * shadow-side light. Published because FX has to tint dust, mist and petals with the
     * same fill that is lighting the geometry they sit in front of.
     */
    this.ambientColor = new Color(0.09, 0.17, 0.30);
    this.shadowsActive = true;
    /** Live handle on the ambient probe's share of the light budget; see ENV_AMBIENT_GAIN. */
    this.envAmbientGain = ENV_AMBIENT_GAIN;

    this._splits = null;
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
    this._patchToken = 'kagcsm1-0';
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
    this._sphereZ = new Float32Array(this.cascadeCount);
    this._sphereR = new Float32Array(this.cascadeCount);
    this.csm.splits = this._splits;

    // Always MAX_CASCADES long, never `cascadeCount`. three's `WebGLUniforms.flatten`
    // walks an array uniform to the size the *compiled program* declares, so if this
    // array is ever shorter than KAG_CASCADES — one tier step down, before every
    // material has recompiled, or if an author's `customProgramCacheKey` has dropped
    // our token and a stale program gets reused — it reads past the end and throws
    // inside the renderer. Padding costs three Vector2s and removes the whole class.
    const arr = [];
    for (let i = 0; i < MAX_CASCADES; i++) arr.push(new Vector2(0, 1));
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
    this._patchToken = `kagcsm1-${this.cascadeCount}-${this.softShadows ? 1 : 0}-${this._pcfTaps()}`;
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

  /**
   * The blocker-search disk is now ~3x wider than it was (see `_computeSplits`), and its
   * failure mode is asymmetric: a disk that finds no blocker returns *fully lit*, so
   * undersampling a thin caster — a shimenawa rope, a banner edge — punches a lit hole
   * through its own shadow. Tier 3 pays four more taps for that; the phone tiers keep the
   * count they had, and their maximum penumbra is scaled down to match.
   */
  _blockerTaps() {
    const t = this.ctx.quality.tier;
    return t >= 3 ? 16 : t >= 2 ? 12 : 8;
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
      shader.uniforms.kagBlendFrac = u.kagBlendFrac;
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
   * Practical (PSSM) split scheme: lambda 0.6 between the logarithmic and uniform
   * distributions. Logarithmic alone wastes the far cascades on a 0.12 m near plane.
   */
  _computeSplits(camera) {
    const n = this.cascadeCount;
    const near = camera.near;
    const far = Math.min(camera.far, this.shadowDistance);
    const lambda = 0.6;
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

    for (let i = 0; i < n; i++) {
      const bw = (s[i + 1] - s[i]) * blend * 0.5;
      const cn = Math.max(near, s[i] - bw);
      const cf = s[i + 1] + bw;

      let zc = (cf + cn) * (a2 + 1) * 0.5;
      if (zc > cf) zc = cf;
      const rFar = Math.sqrt(cf * cf * a2 + (cf - zc) * (cf - zc));
      const rNear = Math.sqrt(cn * cn * a2 + (cn - zc) * (cn - zc));

      this._sphereZ[i] = zc;
      this._sphereR[i] = Math.max(rFar, rNear) * 1.02;
      this._u.kagCascades.value[i].set(s[i], s[i + 1]);
    }

    // Fade the shadow contribution out before the last cascade's far edge so the
    // boundary dissolves instead of popping. Skipped while the sun is down, where
    // update() has parked the band behind the camera to disable sampling entirely.
    //
    // 0.92-1.00, not 0.80-0.97. The old band spent the outer fifth of the shadow range on a
    // crossfade the last cascade did not need — its own kagCascadeWeight already dissolves at
    // the seam — and at TIER.MEDIUM, where q.shadowDistance is 70 m, that meant every caster
    // past 56 m stopped shadowing. That is inside the `wide` composition: the approach
    // lanterns sit 20-75 m from that camera, which is why the far half of the row threw
    // nothing. Ending the band at `far` recovers 56 -> 64.4 m of full-strength reach on the
    // phone and 128 -> 147 m on desktop, for no samples and no memory.
    if (this.shadowsActive) this._u.kagShadowFade.value.set(far * 0.92, far);

    // PCSS is expressed in shadow-map UV: a world penumbra of
    // (receiver-blocker) * depthRange * spread, divided by the ortho width.
    const r0 = this._sphereR[0];
    const depthRange = 2 * r0 + this._backoff * 2;
    const spread = 0.055;                       // artistic sun size, ~3° not 0.53°
    this._u.kagPcssScale.value = depthRange * spread / (2 * r0);

    // The two caps below, and *not* the scale above, are why r5 had no contact hardening.
    //
    // Worked through for the `torii` shot at ULTRA (fov 62, 4 cascades, 3072 map, shadow
    // distance 160): the near cascade fits r0 = 24.1 m, so depthRange = 224 m and
    // kagPcssScale = 0.256 — which turns out to be exactly right. It gives 3.5 texels of
    // penumbra per metre of receiver-blocker separation, i.e. a torii post's shadow 8 m out
    // wants 29 texels, which at that cascade's 0.0157 m/texel is a 0.45 m penumbra, ~18 px
    // on screen. That is the middle of the 15-25 px the brief asks for. The old caps then
    // threw it away: `kagPcssMax` allowed 14 texels, reached at 4 m of separation, and
    // `kagPcssSearch` allowed 10 — and the search is the harder ceiling, because a receiver
    // whose disk finds no blocker returns fully lit, so the soft edge can never be wider
    // than the search. Net: everything past ~3 m of separation got the same ~6 px penumbra,
    // which is the "uniformly soft along its entire length" the critic measured.
    //
    // Expressed in texels, and tied to the tap count rather than to a bare constant: asking
    // 8 taps to cover a 44-texel disk buys banding, not softness. LOW/MEDIUM therefore get a
    // proportionally tighter maximum, which also keeps the phone's fill rate where it was —
    // both loops are fixed-tap, so nothing here costs a sample.
    const taps = this._pcfTaps();
    const maxTexels = 2.75 * taps;              // 11 / 22 / 33 / 44 by tier
    const searchTexels = maxTexels * 0.72;      // never the binding constraint again
    const texel = 1 / Math.max(this.shadowMapSize, 1);
    this._u.kagPcssSearch.value = MathUtils.clamp(searchTexels * texel, 0.002, 0.05);
    this._u.kagPcssMax.value = MathUtils.clamp(maxTexels * texel, 0.004, 0.06);
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
        this._u.kagShadowFade.value.set(far * 0.92, far);
      }

      _col.copy(sky.sunColor);
      const intensity = sky.sunIntensity;
      for (let i = 0; i < this.cascadeLights.length; i++) {
        const l = this.cascadeLights[i];
        l.color.copy(_col);
        l.intensity = intensity;
      }

      const ambient = Number.isFinite(sky.ambientIntensity) ? sky.ambientIntensity : 0.35;

      // --- the fill -------------------------------------------------------------
      // Two bugs lived here, and together they are why 30-42% of every r5 frame was an
      // undifferentiated warm-black void.
      //
      // 1. `intensity = ambient` was multiplied by an *un-normalised* colour. three's
      //    HemisphereLight computes `mix(groundColor, skyColor, w) * intensity`, so a sky
      //    colour of #6f8db8 — linear (0.18, 0.27, 0.40) — silently scaled the whole term by
      //    its own peak of 0.40. The key does not suffer this: `Sky._applyGrade` peak-
      //    normalises `sunColor` before publishing it. So §4's "ambient/hemi ~0.35" was
      //    being delivered at 0.09 while "sun ~3.0" was delivered neat — a 4x error in the
      //    fill that no amount of telemetry would show, because `hemiIntensity` reads 0.33.
      // 2. The level that *was* reaching the shadows came overwhelmingly from the probe,
      //    whose hemisphere-averaged hue is only mildly cool, so the fill had no authored
      //    colour at all.
      //
      // Fixed by normalising both hemisphere colours — so the intensity means what §4 says
      // — biasing the sky end toward the contract's #4a6b8f, and carrying the same raking-sun
      // exposure compensation the key carries, so the key:fill *ratio* is untouched. Measured
      // through the composite twin: shadowed plaza (14,17,21) -> (43,57,78), luminance
      // 16.7 -> 55.5, R-B -7 -> -35; a downward-facing eave soffit 1.2 -> 20.2.
      _colFill.copy(sky.skyColor);
      const peak = Math.max(_colFill.r, _colFill.g, _colFill.b);
      if (peak > 1e-5) _colFill.multiplyScalar(1 / peak);
      else _colFill.setRGB(SHADOW_HUE.x, SHADOW_HUE.y, SHADOW_HUE.z);
      _colFill.setRGB(
        MathUtils.lerp(_colFill.r, SHADOW_HUE.x, SHADOW_HUE_BIAS),
        MathUtils.lerp(_colFill.g, SHADOW_HUE.y, SHADOW_HUE_BIAS),
        MathUtils.lerp(_colFill.b, SHADOW_HUE.z, SHADOW_HUE_BIAS),
      );
      this.hemi.color.copy(_colFill);
      // Ground bounce: normalised the same way, pulled part way to the sky's hue so a soffit
      // is warm-*leaning* rather than warm-only, and held below the sky term.
      _colBounce.copy(sky.groundColor);
      const gPeak = Math.max(_colBounce.r, _colBounce.g, _colBounce.b);
      if (gPeak > 1e-5) _colBounce.multiplyScalar(1 / gPeak);
      else _colBounce.setRGB(0.5, 0.5, 0.5);
      _colBounce.lerp(_colFill, GROUND_BOUNCE_HUE_BIAS).multiplyScalar(GROUND_BOUNCE);
      this.hemi.groundColor.copy(_colBounce);

      // §5b: `rakeCompensation` multiplies the fill, so a non-finite one would blank every
      // lit surface in the frame. Hold 1 rather than propagate it.
      const rake = Number.isFinite(sky.rakeCompensation) && sky.rakeCompensation > 0
        ? Math.min(sky.rakeCompensation, 4.2) : 1;
      const fill = ambient * rake;
      this.hemi.intensity = Number.isFinite(fill) ? fill : ambient;
      // Effects.js already reaches for `lighting.ambientColor` and has been falling through
      // to `sky.groundColor` — the warm ground bounce — because nothing ever published it.
      this.ambientColor.copy(_colFill).multiplyScalar(this.hemi.intensity);

      // The probe supplies the sky bounce's *shape*; its level is a key/fill decision
      // and therefore ours. See ENV_AMBIENT_GAIN — left at three's default of 1.0 this
      // single line is worth more irradiance than the sun.
      this.ctx.scene.environmentIntensity = ambient * this.envAmbientGain;

      // Cool the rim toward the sky bounce so it always reads as the opposite of key. Built
      // from the *normalised* fill colour, not from `sky.skyColor` — the same un-normalised
      // multiply that was costing the hemisphere 4x was costing the rim the same 4x, and a
      // rim at 40% of its authored intensity is a rim that does not separate a black-lacquered
      // oni from a shadowed cedar wall, which is the one job §5.10 gives it.
      _col2.setRGB(0.55, 0.7, 1.0);
      this.rim.color.copy(_colFill).lerp(_col2, 0.55);
      this.rim.intensity = (0.22 + 0.18 * (1 - MathUtils.clamp(sky.sunDirection.y * 2.5, 0, 1))) * rake;
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
      this._patchToken = `kagcsm1-${this.cascadeCount}-${this.softShadows ? 1 : 0}-${this._pcfTaps()}`;
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
