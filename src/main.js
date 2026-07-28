/**
 * main.js — boot orchestration.
 *
 * Systems come up in dependency order and each one publishes itself onto `ctx`
 * before the next starts, so a later system can rely on an earlier one existing
 * (see the ordering table in ARCHITECTURE.md §2). Boot is chunked and yields to
 * the browser between steps: on a phone the whole thing is several hundred
 * milliseconds of texture synthesis and we must not trip the watchdog.
 */

import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { EventBus } from './core/EventBus.js';

import { MaterialLibrary } from './render/Materials.js';
import { SkySystem } from './render/Sky.js';
import { LightingSystem } from './render/Lighting.js';
import { PostFX } from './render/PostFX.js';
import { FoliageSystem } from './render/Foliage.js';

import { Terrain } from './world/Terrain.js';
import { Level } from './world/Level.js';

import { PhysicsWorld } from './gameplay/Physics.js';
import { Player } from './gameplay/Player.js';
import { PlayerCamera } from './gameplay/PlayerCamera.js';
import { CombatDirector } from './gameplay/Combat.js';
import { EnemyManager } from './gameplay/Enemy.js';

import { EffectsSystem } from './fx/Effects.js';
import { WeatherSystem } from './fx/Weather.js';

import { AudioSystem } from './core/Audio.js';
import { installCinematic } from './core/Cinematic.js';
import { HUD } from './ui/HUD.js';
import { Menus } from './ui/Menus.js';

const bootEl = document.getElementById('boot');
const barEl = document.querySelector('#boot-bar > i');
const statusEl = document.getElementById('boot-status');
const startEl = document.getElementById('boot-start');
const fatalEl = document.getElementById('fatal');

/** Yield to the compositor so the loading bar actually paints between steps. */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function setProgress(p, label) {
  if (barEl) barEl.style.width = `${Math.round(p * 100)}%`;
  if (statusEl && label) statusEl.textContent = label;
}

function fatal(err) {
  console.error(err);
  if (!fatalEl) return;
  fatalEl.style.display = 'block';
  fatalEl.textContent =
    'KAGEROU failed to start.\n\n' +
    (err?.stack || err?.message || String(err)) +
    '\n\nGPU: ' + (window.__kagerou?.quality?.describe?.() || 'unknown');
}

async function boot() {
  const canvas = document.getElementById('game-canvas');

  const engine = new Engine(canvas);
  const ctx = {
    engine,
    renderer: engine.renderer,
    scene: engine.scene,
    camera: engine.camera,
    quality: engine.quality,
    bus: new EventBus(),
    input: new Input(canvas),
    /** Global wind state, written by Weather, read by Foliage/Rig cloth/FX. */
    wind: { direction: { x: 0.82, z: 0.57 }, strength: 0.45, gust: 0, time: 0 },
    debug: new URLSearchParams(location.search).has('debug'),
  };
  window.__kagerou = ctx;

  // Landscape is the intended framing; portrait phones get the rotate veil.
  if (ctx.quality.device.isMobile) document.body.classList.add('needs-landscape');

  const steps = [
    ['materials', 'weaving materials', async () => {
      const m = new MaterialLibrary(ctx);
      m.onProgress = (done, total, label) => setProgress(0.06 + 0.30 * (done / total), label || 'weaving materials');
      ctx.materials = m;
      await m.init();
      engine.add(m);
    }],
    ['sky', 'raising the sky', async () => {
      ctx.sky = new SkySystem(ctx);
      await ctx.sky.init();
      engine.add(ctx.sky);
    }],
    ['lighting', 'hanging the sun', async () => {
      ctx.lighting = new LightingSystem(ctx);
      await ctx.lighting.init();
      engine.add(ctx.lighting);
    }],
    ['physics', 'settling the world', async () => {
      ctx.physics = new PhysicsWorld(ctx);
      await ctx.physics.init();
      engine.add(ctx.physics);
    }],
    ['terrain', 'carving the mountain', async () => {
      ctx.terrain = new Terrain(ctx);
      await ctx.terrain.init();
      engine.add(ctx.terrain);
    }],
    ['level', 'building the shrine', async () => {
      ctx.level = new Level(ctx);
      await ctx.level.init();
      engine.add(ctx.level);
    }],
    ['foliage', 'planting the bamboo sea', async () => {
      ctx.foliage = new FoliageSystem(ctx);
      await ctx.foliage.init();
      engine.add(ctx.foliage);
    }],
    ['fx', 'sharpening the steel', async () => {
      ctx.fx = new EffectsSystem(ctx);
      await ctx.fx.init();
      engine.add(ctx.fx);
      ctx.weather = new WeatherSystem(ctx);
      await ctx.weather.init();
      engine.add(ctx.weather);
    }],
    ['player', 'drawing breath', async () => {
      ctx.player = new Player(ctx);
      await ctx.player.init();
      engine.add(ctx.player);
      ctx.playerCamera = new PlayerCamera(ctx);
      await ctx.playerCamera.init();
      engine.add(ctx.playerCamera);
    }],
    ['enemies', 'the oni gather', async () => {
      ctx.enemies = new EnemyManager(ctx);
      await ctx.enemies.init();
      engine.add(ctx.enemies);
      ctx.combat = new CombatDirector(ctx);
      await ctx.combat.init();
      engine.add(ctx.combat);
    }],
    ['audio', 'tuning the shakuhachi', async () => {
      ctx.audio = new AudioSystem(ctx);
      await ctx.audio.init();
      engine.add(ctx.audio);
    }],
    ['postfx', 'grading the frame', async () => {
      ctx.pipeline = new PostFX(ctx);
      await ctx.pipeline.init();
      engine.setRenderPipeline(ctx.pipeline);
    }],
    ['ui', 'inking the hud', async () => {
      ctx.hud = new HUD(ctx);
      await ctx.hud.init();
      engine.add(ctx.hud);
      ctx.menus = new Menus(ctx);
      await ctx.menus.init();
      engine.add(ctx.menus);
    }],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [key, label, fn] = steps[i];
    setProgress(0.04 + 0.9 * (i / steps.length), label);
    await nextFrame();
    try {
      await fn();
    } catch (err) {
      console.error(`[boot] system "${key}" failed`, err);
      if (key === 'materials' || key === 'sky' || key === 'terrain') throw err;
      // Non-essential systems degrade rather than block the whole game.
    }
  }

  // Menus owns the persisted settings but Input owns the touch layout, so the
  // left-handed flag has to be pushed across the seam — and re-pushed whenever the
  // player changes it, since the stick half is resolved on every touch-down.
  const applyHandedness = () => {
    ctx.input.stickSide = ctx.settings?.leftHanded ? 'right' : 'left';
  };
  applyHandedness();
  ctx.bus.on('settings-changed', applyHandedness);

  installCinematic(ctx);

  engine.resize();
  setProgress(1, 'ready');
  await nextFrame();

  // Warm the shader cache with one hidden frame so the first visible frame
  // is not a 400 ms compile stall on a phone.
  setProgress(1, 'compiling shaders');
  await nextFrame();
  try { engine.renderer.compile(engine.scene, engine.camera); } catch { /* best effort */ }
  await nextFrame();

  startEl?.classList.add('ready');
  if (statusEl) statusEl.textContent = 'ready';

  const begin = async () => {
    startEl?.removeEventListener('click', begin);
    bootEl?.classList.add('hidden');
    await ctx.audio?.unlock?.();
    ctx.menus?.onGameStart?.();
    engine.start();
    // Autoplay-safe: the first user gesture is also our audio unlock.
    if (ctx.quality.device.isMobile && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
  };
  startEl?.addEventListener('click', begin);

  // Headless capture and `?autostart` skip the gate entirely.
  if (new URLSearchParams(location.search).has('autostart') || navigator.webdriver) {
    setTimeout(begin, 60);
  }

  // Expose a tiny harness the screenshot rig drives.
  window.__kagerouReady = true;
  window.__kagerouStart = begin;

  return ctx;
}

boot().catch(fatal);
