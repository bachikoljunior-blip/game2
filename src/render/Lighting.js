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
    this.shadowsActive = true;

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
    this.cascadeCount = this._shadowsEnabled ? Math.max(1, Math.min(4, q.shadowCascades | 0)) : 1;
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

    const arr = [];
    for (let i = 0; i < this.cascadeCount; i++) arr.push(new Vector2(0, 1));
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
    if (this.shadowsActive) this._u.kagShadowFade.value.set(far * 0.80, far * 0.97);

    // PCSS is expressed in shadow-map UV: a world penumbra of
    // (receiver-blocker) * depthRange * spread, divided by the ortho width.
    const r0 = this._sphereR[0];
    const depthRange = 2 * r0 + this._backoff * 2;
    const spread = 0.055;                       // artistic sun size, ~3° not 0.53°
    this._u.kagPcssScale.value = depthRange * spread / (2 * r0);
    this._u.kagPcssSearch.value = MathUtils.clamp(2.5 / this.shadowMapSize * 4.0, 0.002, 0.02);
    this._u.kagPcssMax.value = MathUtils.clamp(14.0 / this.shadowMapSize, 0.004, 0.02);
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

  // -------------------------------------------------------------- dynamic pool

  /**
   * Borrow a point light. Returns the THREE.PointLight so the caller can retarget it
   * while it lives, or null when the pool is empty (never happens — we steal).
   *
   * @param {Vector3} pos    world position
   * @param {number|Color} color
   * @param {number} intensity
   * @param {number} radius   metres of influence
   * @param {number} ttl      seconds; the envelope decays across it
   */
  requestLight(pos, color = 0xffffff, intensity = 3, radius = 8, ttl = 0.35) {
    const pool = this._pool;
    if (!pool.length) return null;

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

  update(dt) {
    const sky = this.ctx.sky;
    const camera = this.ctx.camera;

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

      this.hemi.color.copy(sky.skyColor);
      this.hemi.groundColor.copy(sky.groundColor);
      this.hemi.intensity = sky.ambientIntensity !== undefined ? sky.ambientIntensity : 0.35;

      // Cool the rim toward the sky bounce so it always reads as the opposite of key.
      _col2.setRGB(0.55, 0.7, 1.0);
      this.rim.color.copy(sky.skyColor).lerp(_col2, 0.55);
      this.rim.intensity = 0.22 + 0.18 * (1 - MathUtils.clamp(sky.sunDirection.y * 2.5, 0, 1));
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
    const wantCascades = q.shadows ? Math.max(1, Math.min(4, q.shadowCascades | 0)) : 1;
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
    if (this.hemi) { scene.remove(this.hemi); this.hemi.dispose?.(); this.hemi = null; }
    if (this.rim) { scene.remove(this.rim); scene.remove(this.rim.target); this.rim.dispose?.(); this.rim = null; }
    this._materials.clear();
    this.sun = null;
  }
}

export default LightingSystem;
