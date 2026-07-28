/**
 * Quality.js — device profiling and quality tiers.
 *
 * Mobile-first: we assume a phone until proven otherwise, pick a conservative
 * tier from static signals, then let the adaptive resolution scaler in
 * Engine.js walk the render scale up or down to hold the frame budget.
 */

export const TIER = { LOW: 0, MEDIUM: 1, HIGH: 2, ULTRA: 3 };
export const TIER_NAME = ['low', 'medium', 'high', 'ultra'];

/** Per-tier knobs. Every system reads from here — never hard-code a quality decision. */
const PRESETS = {
  [TIER.LOW]: {
    name: 'low',
    renderScale: 0.62, maxPixelRatio: 1.5,
    shadows: true, shadowMapSize: 1024, shadowCascades: 1, shadowDistance: 42, softShadows: false,
    envMapSize: 128,
    bloom: true, bloomIterations: 4,
    ssao: false, godRays: false, motionBlur: false, taa: false, dof: false,
    grain: true, chromatic: false, sharpen: true,
    grassDensity: 0.0, grassRadius: 0, foliageShadows: false,
    particleBudget: 220, decalBudget: 24, trailSegments: 12,
    anisotropy: 4, textureSize: 512,
    terrainSegments: 96, waterQuality: 0, reflections: false,
    maxEnemies: 5, cloth: false, ragdoll: false, weather: 0.35,
  },
  [TIER.MEDIUM]: {
    name: 'medium',
    renderScale: 0.8, maxPixelRatio: 2.0,
    shadows: true, shadowMapSize: 1536, shadowCascades: 2, shadowDistance: 70, softShadows: true,
    envMapSize: 256,
    bloom: true, bloomIterations: 5,
    ssao: true, godRays: true, motionBlur: false, taa: false, dof: false,
    grain: true, chromatic: true, sharpen: true,
    grassDensity: 0.55, grassRadius: 34, foliageShadows: false,
    particleBudget: 900, decalBudget: 64, trailSegments: 20,
    anisotropy: 8, textureSize: 1024,
    terrainSegments: 160, waterQuality: 1, reflections: false,
    maxEnemies: 8, cloth: true, ragdoll: true, weather: 0.7,
  },
  [TIER.HIGH]: {
    name: 'high',
    renderScale: 1.0, maxPixelRatio: 2.0,
    shadows: true, shadowMapSize: 2048, shadowCascades: 3, shadowDistance: 110, softShadows: true,
    envMapSize: 512,
    bloom: true, bloomIterations: 6,
    ssao: true, godRays: true, motionBlur: true, taa: true, dof: true,
    grain: true, chromatic: true, sharpen: true,
    grassDensity: 1.0, grassRadius: 52, foliageShadows: true,
    particleBudget: 2200, decalBudget: 128, trailSegments: 28,
    anisotropy: 16, textureSize: 2048,
    terrainSegments: 220, waterQuality: 2, reflections: true,
    maxEnemies: 12, cloth: true, ragdoll: true, weather: 1.0,
  },
  [TIER.ULTRA]: {
    name: 'ultra',
    renderScale: 1.0, maxPixelRatio: 2.0,
    shadows: true, shadowMapSize: 3072, shadowCascades: 4, shadowDistance: 160, softShadows: true,
    envMapSize: 512,
    bloom: true, bloomIterations: 7,
    ssao: true, godRays: true, motionBlur: true, taa: true, dof: true,
    grain: true, chromatic: true, sharpen: true,
    grassDensity: 1.45, grassRadius: 68, foliageShadows: true,
    particleBudget: 4000, decalBudget: 192, trailSegments: 36,
    anisotropy: 16, textureSize: 2048,
    terrainSegments: 300, waterQuality: 2, reflections: true,
    maxEnemies: 16, cloth: true, ragdoll: true, weather: 1.0,
  },
};

export function detectDevice() {
  const ua = navigator.userAgent || '';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const noHover = matchMedia('(hover: none)').matches;
  const touchPoints = navigator.maxTouchPoints || 0;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && touchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || (coarse && noHover && touchPoints > 0);
  const cores = navigator.hardwareConcurrency || (isMobile ? 4 : 8);
  const memory = navigator.deviceMemory || (isMobile ? 4 : 8);
  const dpr = window.devicePixelRatio || 1;
  const screenArea = (screen.width * dpr) * (screen.height * dpr);
  return { ua, isMobile, isIOS, isAndroid, coarse, touchPoints, cores, memory, dpr, screenArea };
}

/** Read the unmasked GPU string when WEBGL_debug_renderer_info is available. */
export function probeGPU(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return String(gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}

/**
 * Score the device 0..1 from every signal we can cheaply read, then map to a tier.
 * Deliberately pessimistic on mobile: it is far better to boot at MEDIUM and let
 * the adaptive scaler climb than to boot at HIGH and stutter through first contact.
 */
export function pickTier(device, gpuString = '') {
  const g = gpuString.toLowerCase();
  let score = 0.5;

  if (device.isMobile) {
    score = 0.3;
    // Apple silicon in phones/tablets is dramatically ahead of the Android median.
    if (device.isIOS) {
      score = 0.55;
      const m = /apple a(\d+)/.exec(g);
      if (m) score = Math.min(0.95, 0.30 + (parseInt(m[1], 10) - 9) * 0.075);
      if (/apple m\d/.test(g)) score = 0.95;
    } else {
      if (/adreno/.test(g)) {
        const m = /adreno[^0-9]*(\d{3})/.exec(g);
        const n = m ? parseInt(m[1], 10) : 600;
        score = n >= 740 ? 0.85 : n >= 700 ? 0.7 : n >= 640 ? 0.55 : n >= 610 ? 0.38 : 0.25;
      } else if (/mali/.test(g)) {
        const m = /mali-g(\d+)/.exec(g);
        const n = m ? parseInt(m[1], 10) : 57;
        score = n >= 710 ? 0.72 : n >= 78 ? 0.62 : n >= 76 ? 0.5 : n >= 57 ? 0.4 : 0.25;
      } else if (/powervr|immortalis/.test(g)) {
        score = 0.6;
      }
    }
  } else {
    score = 0.68;
    if (/rtx\s*(40|50)/.test(g) || /rx\s*7\d{3}/.test(g)) score = 1.0;
    else if (/rtx\s*(20|30)/.test(g) || /rx\s*6\d{3}/.test(g)) score = 0.9;
    else if (/apple m[1-9]/.test(g)) score = 0.88;
    else if (/gtx\s*1[06]\d{2}/.test(g)) score = 0.72;
    else if (/(uhd|hd) graphics|iris/.test(g)) score = 0.42;
    else if (/llvmpipe|swiftshader|software/.test(g)) score = 0.05;
  }

  // Blend in CPU/RAM: they gate our animation, physics and particle simulation.
  const cpuScore = Math.min(1, device.cores / 8);
  const memScore = Math.min(1, device.memory / 8);
  score = score * 0.7 + cpuScore * 0.15 + memScore * 0.15;

  // A 3x-DPR phone pushing a huge native buffer is effectively a slower device.
  if (device.isMobile && device.screenArea > 3.2e6) score -= 0.06;

  if (score >= 0.85) return TIER.ULTRA;
  if (score >= 0.62) return TIER.HIGH;
  if (score >= 0.36) return TIER.MEDIUM;
  return TIER.LOW;
}

export class Quality {
  constructor(gl) {
    this.device = detectDevice();
    this.gpu = gl ? probeGPU(gl) : '';
    const stored = this._readOverride();
    this.autoTier = pickTier(this.device, this.gpu);
    this.tier = stored ?? this.autoTier;
    this.auto = stored === null;
    Object.assign(this, PRESETS[this.tier]);

    /** Live render scale, driven by the adaptive scaler. */
    this.dynamicScale = 1.0;
    this.targetFPS = 60;
  }

  _readOverride() {
    try {
      const p = new URLSearchParams(location.search).get('q');
      if (p) { const i = TIER_NAME.indexOf(p.toLowerCase()); if (i >= 0) return i; }
      const s = localStorage.getItem('kagerou.tier');
      if (s !== null) { const i = parseInt(s, 10); if (i >= 0 && i <= 3) return i; }
    } catch { /* private mode */ }
    return null;
  }

  setTier(tier, persist = true) {
    this.tier = Math.max(0, Math.min(3, tier | 0));
    Object.assign(this, PRESETS[this.tier]);
    this.auto = false;
    if (persist) { try { localStorage.setItem('kagerou.tier', String(this.tier)); } catch { /* ignore */ } }
  }

  get effectiveScale() {
    return this.renderScale * this.dynamicScale;
  }

  get pixelRatio() {
    return Math.min(this.device.dpr, this.maxPixelRatio) * this.effectiveScale;
  }

  describe() {
    return `${TIER_NAME[this.tier]} · ${this.device.isMobile ? 'mobile' : 'desktop'} · ${this.gpu || 'unknown gpu'}`;
  }
}

export { PRESETS };
