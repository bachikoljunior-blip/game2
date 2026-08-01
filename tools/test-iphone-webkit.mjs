#!/usr/bin/env node

/**
 * End-to-end mobile gate for the primary device.
 *
 * The browser is Playwright WebKit with the built-in iPhone SE (3rd gen)
 * landscape descriptor. The test deliberately drives PointerEvents through the
 * same canvas listeners as a thumb, including a two-pointer move-and-attack beat.
 * It is an interaction and rendering regression gate, not evidence about a real
 * phone's GPU, thermals, memory pressure, multi-touch hardware, or audio latency.
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { chromium, devices, webkit } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, process.env.KAGEROU_TEST_OUTPUT || 'test-results/iphone-webkit');
const baselinePath = resolve(root, 'tests/baselines/iphone-se3-webkit-steady.png');
const actualPath = resolve(outputDir, 'iphone-se3-webkit-steady.png');
const candidatePath = resolve(outputDir, 'iphone-se3-webkit-baseline-candidate.png');
const diffPath = resolve(outputDir, 'iphone-se3-webkit-diff.png');
const reportPath = resolve(outputDir, 'report.json');
const tracePath = resolve(outputDir, 'trace.zip');
const browserName = process.env.KAGEROU_BROWSER || 'webkit';
const externalUrl = process.env.KAGEROU_TEST_URL || '';
const baseUrl = externalUrl || 'http://127.0.0.1:4173/';
const requireBaseline = process.env.KAGEROU_REQUIRE_BASELINE === '1';
const bootTimeout = Number(process.env.KAGEROU_BOOT_TIMEOUT || 300000);
const actionTimeout = Number(process.env.KAGEROU_ACTION_TIMEOUT || 30000);
const frameGapHangLimit = Number(process.env.KAGEROU_FRAME_GAP_HANG_LIMIT || 5000);

mkdirSync(outputDir, { recursive: true });

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd gen) landscape',
  browser: browserName,
  baseUrl,
  timings: {},
  checks: [],
  errors: { page: [], console: [], request: [], http: [] },
  screenshots: {},
  visualRegression: null,
  status: 'running',
  failures: [],
};

function check(condition, name, detail) {
  const passed = !!condition;
  report.checks.push({ name, passed, detail });
  if (!passed) report.failures.push(`${name}: ${detail}`);
  return passed;
}

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function imageStats(png) {
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let bright = 0;
  const pixels = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const luma = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    sum += luma;
    sumSq += luma * luma;
    if (luma < 4) dark++;
    if (luma > 245) bright++;
  }
  const mean = sum / pixels;
  return {
    width: png.width,
    height: png.height,
    meanLuma: +mean.toFixed(3),
    lumaStdDev: +Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)).toFixed(3),
    nearBlackRatio: +(dark / pixels).toFixed(5),
    nearWhiteRatio: +(bright / pixels).toFixed(5),
  };
}

function compareScreenshot() {
  const actual = PNG.sync.read(readFileSync(actualPath));
  const stats = imageStats(actual);
  const result = {
    baseline: baselinePath.slice(root.length + 1),
    baselinePresent: existsSync(baselinePath),
    actual: actualPath.slice(root.length + 1),
    diff: null,
    diffPixels: null,
    diffRatio: null,
    threshold: 0.25,
    maximumDiffRatio: 0.35,
    stats,
  };

  check(stats.meanLuma > 6 && stats.meanLuma < 248, 'render has usable luminance', JSON.stringify(stats));
  check(stats.lumaStdDev > 12, 'render is not a flat or cleared canvas', JSON.stringify(stats));
  check(stats.nearBlackRatio < 0.82, 'render is not predominantly black', JSON.stringify(stats));

  if (!result.baselinePresent) {
    copyFileSync(actualPath, candidatePath);
    report.screenshots.baselineCandidate = candidatePath.slice(root.length + 1);
    if (requireBaseline) {
      check(false, 'visual baseline exists', `promote ${candidatePath.slice(root.length + 1)} to ${baselinePath.slice(root.length + 1)}`);
    }
    return result;
  }

  const baseline = PNG.sync.read(readFileSync(baselinePath));
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    check(false, 'visual baseline dimensions match', `${baseline.width}x${baseline.height} != ${actual.width}x${actual.height}`);
    return result;
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: result.threshold, includeAA: false, diffColor: [255, 68, 68] },
  );
  const diffRatio = diffPixels / (actual.width * actual.height);
  writeFileSync(diffPath, PNG.sync.write(diff));
  result.diff = diffPath.slice(root.length + 1);
  result.diffPixels = diffPixels;
  result.diffRatio = +diffRatio.toFixed(6);
  check(diffRatio <= result.maximumDiffRatio, 'visual regression stays within tolerance', `ratio=${result.diffRatio}, limit=${result.maximumDiffRatio}`);
  return result;
}

async function waitForServer(url, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`preview did not become reachable: ${last?.message || 'timeout'}`);
}

async function touch(page, type, pointerId, x, y, isPrimary = true) {
  await page.evaluate(({ type, pointerId, x, y, isPrimary }) => {
    const target = type === 'pointerdown' ? document.getElementById('game-canvas') : window;
    if (!target) throw new Error('game canvas is missing');
    target.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      isPrimary,
      clientX: x,
      clientY: y,
      width: 18,
      height: 18,
      pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : 0.65,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
  }, { type, pointerId, x, y, isPrimary });
}

/** Dispatch a down/up pair in one browser task so a software-rendered CI frame
 * cannot stretch a nominal tap beyond the game's 240 ms tap window. */
async function tap(page, pointerId, x, y, isPrimary = true) {
  return page.evaluate(({ pointerId, x, y, isPrimary }) => {
    const canvas = document.getElementById('game-canvas');
    const input = window.__kagerou?.input;
    if (!canvas || !input) throw new Error('tap surface is unavailable');
    const event = (type) => new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      isPrimary,
      clientX: x,
      clientY: y,
      width: 18,
      height: 18,
      pressure: type === 'pointerup' ? 0 : 0.65,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const hitZone = input._hitZone(x, y)?.name || null;
    canvas.dispatchEvent(event('pointerdown'));
    window.dispatchEvent(event('pointerup'));
    return {
      hitZone,
      pressed: [...input.state.pressed],
      slashes: input.state.slashes.map((slash) => ({ dir: slash.dir, power: slash.power })),
    };
  }, { pointerId, x, y, isPrimary });
}

let preview = null;
let browser = null;
let context = null;
let page = null;
let previewLog = '';

try {
  if (!externalUrl) {
    const vite = resolve(root, 'node_modules/vite/bin/vite.js');
    preview = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    preview.stdout.on('data', (chunk) => { previewLog += chunk.toString(); });
    preview.stderr.on('data', (chunk) => { previewLog += chunk.toString(); });
    await waitForServer(baseUrl);
  }

  const browserType = browserName === 'chromium' ? chromium : webkit;
  browser = await browserType.launch({ headless: true });
  const profile = devices['iPhone SE (3rd gen) landscape'];
  context = await browser.newContext({
    ...profile,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'dark',
    recordVideo: { dir: resolve(outputDir, 'video'), size: profile.viewport },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);

  page.on('pageerror', (error) => report.errors.page.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.console.push(message.text());
  });
  page.on('requestfailed', (request) => report.errors.request.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.http.push({ url: response.url(), status: response.status() });
  });

  const bootStarted = Date.now();
  const url = new URL(baseUrl);
  url.searchParams.set('autostart', '');
  url.searchParams.set('q', 'medium');
  url.searchParams.set('e2e', 'iphone-se3');
  const entry = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__kagerouReady === true, null, { timeout: bootTimeout, polling: 500 });
  await page.evaluate(async () => {
    await window.__kagerouStart?.();
    window.__kagerou?.menus?.skipIntro?.();
    window.__kagerou?.menus?.resume?.();
  });
  await page.waitForFunction(() => (
    document.getElementById('boot')?.classList.contains('hidden')
    && window.__kagerou?.engine?.running === true
  ), null, { timeout: 30000, polling: 100 });
  // `?autostart` schedules the same public start hook independently. Let that
  // idempotent retry drain before cancelling the intro, otherwise it can start a
  // second title wash after the test has already dismissed the first one.
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__kagerou?.menus?.skipIntro?.();
    window.__kagerou?.hud?.__show?.();
  });
  await page.waitForTimeout(950);
  report.timings.bootMs = Date.now() - bootStarted;

  const device = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
    coarse: matchMedia('(pointer: coarse)').matches,
    landscape: matchMedia('(orientation: landscape)').matches,
    quality: window.__kagerou?.quality?.name || null,
    detected: window.__kagerou?.quality?.device || null,
    running: window.__kagerou?.engine?.running === true,
    drawCalls: window.__kagerou?.engine?.stats?.drawCalls ?? null,
    triangles: window.__kagerou?.engine?.stats?.triangles ?? null,
  }));
  report.device = device;
  check(entry?.status() === 200, 'entry responds successfully', `status=${entry?.status()}`);
  check(device.viewport.width === 667 && device.viewport.height === 375, 'iPhone SE 3 landscape viewport', JSON.stringify(device.viewport));
  check(device.dpr === 2, 'iPhone SE 3 DPR', `dpr=${device.dpr}`);
  check(device.maxTouchPoints > 0 && device.coarse, 'touch and coarse pointer are active', `touchPoints=${device.maxTouchPoints}, coarse=${device.coarse}`);
  check(device.landscape, 'landscape orientation is active', `landscape=${device.landscape}`);
  check(device.detected?.isIOS === true && device.detected?.isMobile === true, 'game detects iOS mobile mode', JSON.stringify(device.detected));
  check(String(device.quality).toLowerCase() === 'medium', 'primary quality tier is MEDIUM', `quality=${device.quality}`);
  check(device.running, 'engine enters the running state', `running=${device.running}`);
  check(device.drawCalls > 0 && device.drawCalls <= 140, 'draw-call budget holds', `drawCalls=${device.drawCalls}`);
  check(device.triangles > 0 && device.triangles <= 900000, 'triangle budget holds', `triangles=${device.triangles}`);

  const bootShot = resolve(outputDir, 'booted.png');
  await page.screenshot({ path: bootShot });
  report.screenshots.booted = bootShot.slice(root.length + 1);

  const before = await page.evaluate(() => ({
    position: window.__kagerou.player.position.toArray(),
    frame: window.__kagerou.engine.frame,
  }));
  const gesturePoint = await page.evaluate(() => {
    const input = window.__kagerou.input;
    const w = innerWidth;
    const h = innerHeight;
    let best = null;
    for (let y = 54; y <= h - 54; y += 24) {
      for (let x = Math.ceil(w * 0.48); x <= w - 54; x += 24) {
        if (input._hitZone(x, y)) continue;
        const edge = Math.min(x - w * 0.42, w - x, y, h - y);
        if (!best || edge > best.score) best = { x, y, score: edge };
      }
    }
    if (!best) throw new Error('no unclaimed camera/gesture point exists');
    return { x: best.x, y: best.y, hitZone: input._hitZone(best.x, best.y)?.name || null };
  });
  report.interaction = { before, gesturePoint };
  await page.evaluate(() => {
    const player = window.__kagerou.player;
    const original = player._setState;
    window.__kagerouE2ETransitions = [];
    player._setState = function instrumentedState(next, ...args) {
      window.__kagerouE2ETransitions.push(next);
      return original.call(this, next, ...args);
    };
    window.__kagerouE2ERestoreState = () => { player._setState = original; };
  });

  // Simultaneous thumbs: move with the left pointer and attack with the right.
  await touch(page, 'pointerdown', 41, 92, 300, true);
  await touch(page, 'pointermove', 41, 92, 210, true);
  await page.waitForTimeout(250);
  const attackTap = await tap(page, 42, gesturePoint.x, gesturePoint.y, false);
  await page.waitForTimeout(1050);
  const transitions = await page.evaluate(() => {
    window.__kagerouE2ERestoreState?.();
    return window.__kagerouE2ETransitions || [];
  });
  const attackObserved = transitions.includes('drawing') || transitions.includes('attack');
  const duringMoveShot = resolve(outputDir, 'simultaneous-move-attack.png');
  await page.screenshot({ path: duringMoveShot });
  report.screenshots.simultaneousMoveAttack = duringMoveShot.slice(root.length + 1);
  await touch(page, 'pointerup', 41, 92, 210, true);
  await page.waitForTimeout(250);

  const after = await page.evaluate(() => ({
    position: window.__kagerou.player.position.toArray(),
    usingTouch: window.__kagerou.input.usingTouch,
    touchVisible: window.__kagerou.touch?.visible ?? false,
    moveMagnitude: window.__kagerou.input.state.moveMag,
    activePointers: window.__kagerou.input._pointers.size,
    frame: window.__kagerou.engine.frame,
  }));
  const moved = Math.hypot(
    after.position[0] - before.position[0],
    after.position[1] - before.position[1],
    after.position[2] - before.position[2],
  );
  Object.assign(report.interaction, { after, moved: +moved.toFixed(4), attackObserved, attackTap, transitions });
  check(moved > 0.12, 'touch stick moves the player', `distance=${moved.toFixed(4)}`);
  check(attackObserved, 'second simultaneous touch starts an attack', `playerState=${await page.evaluate(() => window.__kagerou?.player?.state)}`);
  check(after.usingTouch && after.touchVisible, 'touch HUD becomes visible', `usingTouch=${after.usingTouch}, visible=${after.touchVisible}`);
  check(after.moveMagnitude === 0 && after.activePointers === 0, 'touch release clears movement and pointers', `move=${after.moveMagnitude}, pointers=${after.activePointers}`);

  const cameraBefore = await page.evaluate(() => ({
    yaw: window.__kagerou.playerCamera.yaw,
    pitch: window.__kagerou.playerCamera.pitch,
  }));
  await touch(page, 'pointerdown', 51, 490, 175, true);
  await touch(page, 'pointermove', 51, 575, 125, true);
  await page.waitForTimeout(480);
  await touch(page, 'pointerup', 51, 575, 125, true);
  await page.waitForTimeout(250);
  const cameraAfter = await page.evaluate(() => ({
    yaw: window.__kagerou.playerCamera.yaw,
    pitch: window.__kagerou.playerCamera.pitch,
  }));
  const cameraDelta = Math.hypot(cameraAfter.yaw - cameraBefore.yaw, cameraAfter.pitch - cameraBefore.pitch);
  report.interaction.camera = { before: cameraBefore, after: cameraAfter, delta: +cameraDelta.toFixed(5) };
  check(cameraDelta > 0.02, 'right-thumb drag moves the camera', `delta=${cameraDelta.toFixed(5)}`);

  await page.evaluate(() => {
    window.__kagerou?.menus?.skipIntro?.();
    window.__kagerou?.hud?.__show?.();
  });
  let pauseZoneReady = true;
  try {
    await page.waitForFunction(() => window.__kagerou?.menus?._pauseZoneVisible === true, null, { timeout: 10000, polling: 50 });
  } catch {
    pauseZoneReady = false;
  }
  const pauseInfo = await page.evaluate(() => {
    const rect = { ...window.__kagerou.menus._pauseZoneRect };
    const x = rect.x + rect.w / 2;
    const y = rect.y + rect.h / 2;
    return {
      rect,
      visible: window.__kagerou.menus._pauseZoneVisible,
      hitZone: window.__kagerou.input._hitZone(x, y)?.name || null,
      titleTime: window.__kagerou.menus._title,
      titleAlpha: window.__kagerou.menus._titleA,
      introWash: window.__kagerou.menus._introWash,
      hudHidden: window.__kagerou.hud.hidden,
      hudAlpha: window.__kagerou.hud.alpha,
      inputEnabled: window.__kagerou.input.enabled,
    };
  });
  report.interaction.pauseTarget = pauseInfo;
  check(pauseZoneReady && pauseInfo.visible && pauseInfo.hitZone === 'pause', 'pause touch target is live', JSON.stringify(pauseInfo));
  const pauseRect = pauseInfo.rect;
  const pauseX = pauseRect.x + pauseRect.w / 2;
  const pauseY = pauseRect.y + pauseRect.h / 2;
  const pauseTap = await tap(page, 61, pauseX, pauseY, true);
  report.interaction.pauseTap = pauseTap;
  let pauseOpened = true;
  try {
    await page.waitForFunction(() => window.__kagerou?.menus?.mode === 'pause', null, { timeout: actionTimeout, polling: 50 });
  } catch {
    pauseOpened = false;
    await page.evaluate(() => window.__kagerou?.menus?.openPause?.());
  }
  const pauseState = await page.evaluate(() => ({
    mode: window.__kagerou.menus.mode,
    paused: window.__kagerou.engine.paused,
    inputEnabled: window.__kagerou.input.enabled,
  }));
  const pauseShot = resolve(outputDir, 'pause-menu.png');
  await page.screenshot({ path: pauseShot });
  report.screenshots.pause = pauseShot.slice(root.length + 1);
  check(pauseOpened && pauseState.mode === 'pause' && pauseState.paused && !pauseState.inputEnabled, 'touch pause freezes gameplay input', JSON.stringify({ pauseTap, pauseState }));

  const resumePoint = await page.evaluate(() => {
    const row = window.__kagerou.menus.rows[0];
    return { x: row.x + row.w / 2, y: row.y + row.h / 2 };
  });
  const resumeTap = await tap(page, 62, resumePoint.x, resumePoint.y, true);
  let resumeSucceeded = true;
  try {
    await page.waitForFunction(() => window.__kagerou?.menus?.mode === 'none', null, { timeout: actionTimeout, polling: 50 });
  } catch {
    resumeSucceeded = false;
    await page.evaluate(() => window.__kagerou?.menus?.resume?.());
  }
  report.interaction.resumeTap = { point: resumePoint, syntheticTouch: resumeTap, succeeded: resumeSucceeded };
  const resumeState = await page.evaluate(() => ({
    mode: window.__kagerou.menus.mode,
    paused: window.__kagerou.engine.paused,
    inputEnabled: window.__kagerou.input.enabled,
  }));
  check(resumeSucceeded && resumeState.mode === 'none' && !resumeState.paused && resumeState.inputEnabled, 'touch resume restores gameplay input', JSON.stringify(resumeState));

  const persistence = await page.evaluate(() => {
    const menus = window.__kagerou.menus;
    menus.settings.leftHanded = true;
    menus.apply(false);
    menus.save();
    const stored = JSON.parse(localStorage.getItem('kagerou.settings'));
    menus.settings.leftHanded = false;
    menus.load();
    menus.apply(true);
    const result = {
      storedLeftHanded: stored.leftHanded,
      restoredLeftHanded: menus.settings.leftHanded,
      stickSide: window.__kagerou.input.stickSide,
    };
    // Restore the default layout before the soak so this persistence check cannot
    // change the control geometry of the tests that follow it.
    menus.settings.leftHanded = false;
    menus.apply(true);
    menus.save();
    return result;
  });
  report.persistence = persistence;
  check(persistence.storedLeftHanded && persistence.restoredLeftHanded && persistence.stickSide === 'right', 'settings save and restore', JSON.stringify(persistence));

  // Short automated play soak with frame-gap sampling. These timings detect hangs
  // and severe relative regressions on this runner; they are not real-phone FPS.
  await page.evaluate(() => {
    window.__kagerouE2EFrames = [];
    window.__kagerouE2EActive = true;
    let previous = performance.now();
    const sample = (now) => {
      if (!window.__kagerouE2EActive) return;
      window.__kagerouE2EFrames.push(now - previous);
      previous = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await touch(page, 'pointerdown', 71, 100, 298, true);
  await touch(page, 'pointermove', 71, 120, 205, true);
  const soakStarted = Date.now();
  for (let i = 0; i < 8; i++) {
    const id = 80 + i;
    const x = gesturePoint.x + (i % 2) * 8;
    const y = gesturePoint.y + (i % 3) * 5;
    await tap(page, id, x, y, false);
    await page.waitForTimeout(500);
  }
  await touch(page, 'pointerup', 71, 120, 205, true);
  const soak = await page.evaluate(() => {
    window.__kagerouE2EActive = false;
    return {
      frameGaps: window.__kagerouE2EFrames.slice(1),
      engineFrame: window.__kagerou.engine.frame,
      position: window.__kagerou.player.position.toArray(),
      health: window.__kagerou.player.health,
      state: window.__kagerou.player.state,
      running: window.__kagerou.engine.running,
      finite: window.__kagerou.player.position.toArray().every(Number.isFinite),
    };
  });
  report.timings.autoPlayMs = Date.now() - soakStarted;
  report.soak = {
    samples: soak.frameGaps.length,
    medianFrameGapMs: quantile(soak.frameGaps, 0.5),
    p95FrameGapMs: quantile(soak.frameGaps, 0.95),
    maxFrameGapMs: soak.frameGaps.length ? Math.max(...soak.frameGaps) : null,
    engineFrame: soak.engineFrame,
    position: soak.position,
    health: soak.health,
    state: soak.state,
    running: soak.running,
    finite: soak.finite,
  };
  check(soak.running && soak.finite, 'automated play remains running with finite state', JSON.stringify(report.soak));
  check(soak.frameGaps.length >= 8, 'automated play continues producing frames', `samples=${soak.frameGaps.length}`);
  check((report.soak.p95FrameGapMs ?? Infinity) < frameGapHangLimit, 'runner frame-gap hang guard', `p95=${report.soak.p95FrameGapMs}ms, limit=${frameGapHangLimit}ms`);

  await page.evaluate(() => {
    const k = window.__kagerou;
    k?.menus?.skipIntro?.();
    k?.menus?.resume?.();
    k?.hud?.__show?.();
    k?.weather?.setPreset?.('petals', true);
    k?.sky?.setTime?.(0.78);
    k?.debugCam?.('hero');
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: actualPath });
  report.screenshots.steady = actualPath.slice(root.length + 1);
  report.visualRegression = compareScreenshot();

  check(report.errors.page.length === 0, 'no page errors', `${report.errors.page.length} error(s)`);
  check(report.errors.console.length === 0, 'no console errors', `${report.errors.console.length} error(s)`);
  check(report.errors.request.length === 0, 'no failed requests', `${report.errors.request.length} failure(s)`);
  check(report.errors.http.length === 0, 'no HTTP error responses', `${report.errors.http.length} error response(s)`);
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
} finally {
  if (context) {
    try { await context.tracing.stop({ path: tracePath }); } catch (error) { report.failures.push(`trace: ${error.message}`); }
  }
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (preview) {
    preview.kill('SIGTERM');
    await new Promise((done) => {
      const timer = setTimeout(done, 2000);
      preview.once('exit', () => { clearTimeout(timer); done(); });
    });
  }
  writeFileSync(resolve(outputDir, 'preview.log'), previewLog);
  report.status = report.failures.length ? 'failed' : 'passed';
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`[iphone-webkit] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
console.log(`[iphone-webkit] boot=${report.timings.bootMs ?? 'n/a'}ms autoplay=${report.timings.autoPlayMs ?? 'n/a'}ms`);
if (report.visualRegression?.diffRatio != null) {
  console.log(`[iphone-webkit] visual diff ratio=${report.visualRegression.diffRatio}`);
}
for (const failure of report.failures) console.error(`- ${failure}`);
if (report.failures.length) process.exit(1);
