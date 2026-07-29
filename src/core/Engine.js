/**
 * Engine.js — renderer ownership, the frame loop, and adaptive resolution.
 *
 * Systems register themselves with `add()` and get `update(dt, elapsed)` in
 * insertion order. The engine owns nothing about the game itself; it owns the
 * WebGL context, the frame budget, and the render graph handoff to PostFX.
 */

import {
  WebGLRenderer, Scene, PerspectiveCamera, Clock, ACESFilmicToneMapping,
  SRGBColorSpace, PCFSoftShadowMap, BasicShadowMap, Color, FogExp2, Vector2,
} from 'three';
import { Quality } from './Quality.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.systems = [];
    this.running = false;
    this.paused = false;
    this.timeScale = 1;
    this._targetTimeScale = 1;
    this.elapsed = 0;
    this.frame = 0;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,             // resolved by the post chain (FXAA/TAA), cheaper on mobile
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    const gl = this.renderer.getContext();
    this.quality = new Quality(gl);
    // WebGL2 folded half-float filtering into core, so `OES_texture_half_float_linear`
    // does not exist there and probing for it reports false on hardware that supports
    // it perfectly well — a consumer that trusts the flag falls back to an 8-bit
    // encoded path for no reason. Full-float filtering genuinely stayed an extension.
    const isWebGL2 = this.renderer.capabilities.isWebGL2 !== false &&
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.capabilities = {
      isWebGL2,
      floatLinear: !!gl.getExtension('OES_texture_float_linear'),
      halfFloatLinear: isWebGL2 || !!gl.getExtension('OES_texture_half_float_linear'),
      colorBufferFloat: isWebGL2
        ? !!gl.getExtension('EXT_color_buffer_float')
        : !!gl.getExtension('WEBGL_color_buffer_float'),
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
    };

    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = this.quality.softShadows ? PCFSoftShadowMap : BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    this.captureMode = new URLSearchParams(location.search).has('capture');

    this.scene = new Scene();
    this.scene.background = new Color(0x0a0d12);
    this.scene.fog = new FogExp2(0x8a9bb0, 0.012);

    this.camera = new PerspectiveCamera(58, 1, 0.12, 900);
    this.camera.position.set(0, 2, 6);

    this.clock = new Clock();
    this.size = new Vector2(1, 1);
    this.drawingBufferSize = new Vector2(1, 1);

    // --- adaptive resolution -------------------------------------------------
    this._frameTimes = new Float32Array(45);
    this._ftIndex = 0;
    this._ftFilled = 0;
    this._lastScaleChange = 0;
    this.stats = { fps: 60, ms: 16.7, drawCalls: 0, triangles: 0, scale: 1 };

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 220));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.running = false;
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => { this.onContextRestored?.(); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.getDelta();   // swallow the gap
    });

    this.resize();
  }

  add(system) {
    this.systems.push(system);
    return system;
  }

  remove(system) {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  /** PostFX registers itself here; when absent the engine renders straight to screen. */
  setRenderPipeline(pipeline) { this.pipeline = pipeline; }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.size.set(w, h);
    const pr = this.quality.pixelRatio;
    this.renderer.setPixelRatio(1);                   // we manage scaling explicitly
    this.renderer.setSize(Math.round(w * pr), Math.round(h * pr), false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);

    this.camera.aspect = w / h;
    // Widen the vertical FOV on tall/narrow phone viewports so the framing
    // matches what a 16:9 desktop player sees horizontally.
    const baseFov = 58;
    const aspect = w / h;
    this.camera.fov = aspect < 1.5
      ? Math.min(78, baseFov + (1.5 - aspect) * 26)
      : baseFov;
    this.camera.updateProjectionMatrix();

    const bw = this.drawingBufferSize.x, bh = this.drawingBufferSize.y;
    this.pipeline?.setSize(bw, bh);
    for (const s of this.systems) s.resize?.(w, h, bw, bh);
    this.onResize?.(w, h);
  }

  applyQuality() {
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = this.quality.softShadows ? PCFSoftShadowMap : BasicShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    for (const s of this.systems) s.applyQuality?.(this.quality);
    this.pipeline?.applyQuality?.(this.quality);
    this.resize();
  }

  /** Slow-motion hook used by parry/execution beats. */
  setTimeScale(v, immediate = false) {
    this._targetTimeScale = v;
    if (immediate) this.timeScale = v;
  }

  _adapt(rawMs) {
    // The capture rig renders under SwiftShader, where every frame is far over
    // budget; left alone the scaler would walk the resolution to its floor and the
    // art-direction review would be judging a soft, half-res image instead of the
    // frame a real GPU produces. `?capture` pins the scale.
    if (this.captureMode) return;
    const q = this.quality;
    this._frameTimes[this._ftIndex] = rawMs;
    this._ftIndex = (this._ftIndex + 1) % this._frameTimes.length;
    this._ftFilled = Math.min(this._ftFilled + 1, this._frameTimes.length);
    if (this._ftFilled < this._frameTimes.length) return;

    // Median is far more stable than a mean when a single GC spike lands.
    const sorted = Array.from(this._frameTimes.slice(0, this._ftFilled)).sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    this.stats.ms = med;
    this.stats.fps = 1000 / med;

    const now = performance.now();
    if (now - this._lastScaleChange < 900) return;

    const budget = 1000 / q.targetFPS;
    let changed = false;
    if (med > budget * 1.14 || p90 > budget * 1.55) {
      const next = Math.max(0.5, q.dynamicScale - 0.08);
      if (next !== q.dynamicScale) { q.dynamicScale = next; changed = true; }
    } else if (med < budget * 0.80 && p90 < budget * 1.02) {
      const next = Math.min(1.0, q.dynamicScale + 0.05);
      if (next !== q.dynamicScale) { q.dynamicScale = next; changed = true; }
    }
    if (changed) {
      this._lastScaleChange = now;
      this.stats.scale = q.dynamicScale;
      this.resize();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.clock.getDelta();
    const tick = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      this._frame();
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _frame() {
    const t0 = performance.now();
    let raw = this.clock.getDelta();
    if (raw > 0.25) raw = 0.25;                      // tab-switch guard

    // Ease the time scale so hit-stop ramps read as intentional, not as a hitch.
    const k = 1 - Math.exp(-raw * 14);
    this.timeScale += (this._targetTimeScale - this.timeScale) * k;
    if (Math.abs(this.timeScale - this._targetTimeScale) < 0.004) this.timeScale = this._targetTimeScale;

    const dt = this.paused ? 0 : raw * this.timeScale;
    this.elapsed += dt;
    this.frame++;

    this.renderer.info.reset();
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i].update?.(dt, this.elapsed, raw);
    }

    if (this.pipeline) this.pipeline.render(dt);
    else this.renderer.render(this.scene, this.camera);

    for (let i = 0; i < this.systems.length; i++) this.systems[i].lateUpdate?.(dt, this.elapsed, raw);

    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this._adapt(performance.now() - t0);
  }

  /**
   * One-shot audit for silently dead shader programs.
   *
   * A material whose vertex shader references a varying *before* three declares it —
   * easy to do when injecting at `#include <common>` — fails to link on some drivers
   * without raising anything three checks for. The mesh is still submitted, the
   * instances are still correct, no exception is thrown, and nothing rasterises. That
   * shipped here: 11,390 bamboo cards drew zero pixels across three art reviews before
   * anyone thought to interrogate the program rather than the geometry.
   *
   * A linked program with no active uniforms cannot be doing useful work, so that is
   * the tell. Runs once, only under `?capture` or `?debug`, and costs nothing at
   * runtime.
   */
  auditPrograms() {
    if (this._auditedPrograms) return [];
    this._auditedPrograms = true;
    const gl = this.renderer.getContext();
    const dead = [];
    for (const p of this.renderer.info.programs || []) {
      const prog = p.program;
      if (!prog) continue;
      const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
      const uniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      if (!linked || uniforms === 0) {
        dead.push({ name: p.name || '(unnamed)', linked: !!linked, uniforms });
        console.error(
          `[engine] shader program "${p.name || '(unnamed)'}" is dead — ` +
          `linked=${!!linked} activeUniforms=${uniforms}. Anything using this material ` +
          'is being submitted and drawing nothing.',
        );
      }
    }
    return dead;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    for (const s of this.systems) s.dispose?.();
    this.pipeline?.dispose?.();
    this.renderer.dispose();
  }
}
