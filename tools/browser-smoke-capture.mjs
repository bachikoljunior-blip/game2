#!/usr/bin/env node
/**
 * Two fresh production-build boots, real touch input and a real WebGL loss/restore.
 * Run after `npm run build`: node tools/browser-smoke-capture.mjs
 * The capture filename shares the existing rigs' lock protocol. No virtual clock,
 * harness runtime or replacement renderer is installed. SwiftShader results prove
 * browser functionality only; they are not phone performance or visual benchmark scores.
 */
import { devices } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';
import { launchHeadless, SWIFTSHADER_ARGS } from '../.kit/lib/browser/launch.mjs';
import { waitForBoot } from '../.kit/lib/browser/boot.mjs';
import { attachPageDiagnostics } from '../.kit/lib/browser/diagnostics.mjs';
import { acquireLock, releaseOnExit } from '../.kit/lib/browser/lock.mjs';
import { decodePNG } from '../.kit/lib/image/png.mjs';
import { loadImage, regionStats, measureLuma, cut } from '../.kit/lib/image/measure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const REPORT = join(OUT, 'browser-smoke-r17.json');
const TIMEOUT = 420000;
const PROFILE = {
  viewport: { width: 568, height: 320 }, deviceScaleFactor: 1,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  colorScheme: 'dark',
};
const report = {
  schema: 'kagerou-browser-smoke-r17', startedAt: new Date().toISOString(),
  status: 'FAIL', profile: PROFILE, timeoutMs: TIMEOUT, bootCount: 0,
  renderer: { requested: 'SwiftShader', args: SWIFTSHADER_ARGS },
  scope: 'Built dist served locally; fresh production and capture contexts; native viewport PNGs.',
  limits: ['Software rendering is not device performance evidence.',
    'Functional pixel checks are not a human visual review or reference-title comparison.'],
  stages: [], errors: [], staticResponses: [],
};
let activeStage = null, activeContext = 'startup', lossExperimentPhase = 'none';

function gitText(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

function fingerprintTree(dir) {
  const hash = createHash('sha256');
  const walk = (base, relative = '') => {
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const path = join(base, entry.name);
      if (entry.isDirectory()) walk(path, name);
      else if (entry.isFile()) hash.update(name).update('\0').update(readFileSync(path)).update('\0');
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function check(stage, name, passed, evidence = null) {
  stage.checks.push({ name, passed: !!passed, evidence });
  if (!passed) throw new Error(`${stage.name}: ${name}`);
}

async function stage(name, run) {
  const result = { name, status: 'FAIL', checks: [], screenshots: [] };
  report.stages.push(result);
  activeStage = name;
  const start = Date.now();
  console.log(`[browser-smoke] ${name}`);
  const progress = setInterval(() => {
    console.log(`[browser-smoke] ${name}: ${Math.round((Date.now() - start) / 1000)}s`);
  }, 20000);
  try { await run(result); result.status = 'PASS'; }
  catch (error) {
    result.error = error.stack || String(error);
    console.error(`[browser-smoke] FAIL ${name}: ${error.message || error}`);
  } finally {
    clearInterval(progress);
    result.seconds = (Date.now() - start) / 1000;
    writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
    activeStage = null;
  }
  return result;
}

function classifyGLMessage(text, phase) {
  const lossNotice = /^(?:THREE\.WebGLRenderer:\s*Context Lost\.?|(?:WebGL:\s*)?CONTEXT_LOST(?:_WEBGL)?:\s*(?:loseContext:\s*)?context lost\.?)$/i.test(text);
  // Only the loss notification itself belongs to the experiment. An invalid
  // delete/draw/allocation during the same interval remains a product fault.
  if (lossNotice && ['losing', 'lost', 'restoring'].includes(phase)) return 'expected-context-loss';
  const fault = /\b(?:GL_)?(?:INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|OUT_OF_MEMORY|CONTEXT_LOST(?:_WEBGL)?|STACK_(?:OVERFLOW|UNDERFLOW))\b/i;
  return lossNotice || fault.test(text) ? 'gl-error' : null;
}

function observe(page) {
  const diagnostic = attachPageDiagnostics(page, { consoleTypes: [] });
  const consoleErrors = [], consoleErrorDetails = [], warnings = [], warningDetails = [];
  const glErrors = [], expectedContextLossNotices = [];
  const context = activeContext, responseStart = report.staticResponses.length;
  page.on('console', (message) => {
    const type = message.type(), text = message.text(), location = message.location();
    const classification = classifyGLMessage(text, lossExperimentPhase);
    const detail = { type, text, location, context, stage: activeStage,
      lossExperimentPhase, classification, at: new Date().toISOString() };
    if (type === 'error') {
      const source = location.url
        ? ` @ ${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1}` : '';
      consoleErrors.push(`error: ${text}${source}`);
      consoleErrorDetails.push(detail);
    }
    if (type === 'warning') { warnings.push(text); warningDetails.push(detail); }
    if (classification === 'expected-context-loss') expectedContextLossNotices.push(detail);
    else if (classification === 'gl-error' && type !== 'error') glErrors.push(detail);
  });
  return () => {
    const serverErrors = report.staticResponses.slice(responseStart)
      .filter((response) => response.context === context && response.status >= 400);
    return { counts: { ...diagnostic.summary(), console: consoleErrors.length,
      gl: glErrors.length, server: serverErrors.length }, consoleErrors: [...consoleErrors],
    consoleErrorDetails: [...consoleErrorDetails], pageErrors: [...diagnostic.pageErrors],
    requestFailures: [...diagnostic.requestFailures], badResponses: [...diagnostic.badResponses],
    serverErrors, glErrors: [...glErrors], warnings: [...warnings], warningDetails: [...warningDetails],
    expectedContextLossNotices: [...expectedContextLossNotices],
    total: diagnostic.count() + consoleErrors.length + glErrors.length + serverErrors.length };
  };
}

function observeStaticServer(server) {
  // Chromium sometimes reports browser-owned icon requests only to the console.
  // Observe the real response finish as an independent record of the requested URL.
  server.server.prependListener('request', (request, response) => {
    const context = activeContext, stage = activeStage, started = Date.now();
    response.once('finish', () => {
      report.staticResponses.push({ method: request.method, requestUrl: request.url,
        url: new URL(request.url, server.origin).href, status: response.statusCode,
        referer: request.headers.referer || null, destination: request.headers['sec-fetch-dest'] || null,
        contentType: response.getHeader('content-type') || null, context, stage,
        at: new Date().toISOString(), milliseconds: Date.now() - started });
    });
  });
}

async function wait(page, predicate, arg) {
  await page.waitForFunction(predicate, arg, { timeout: TIMEOUT, polling: 500 });
}

async function frames(page, count = 3) {
  const before = await page.evaluate(() => window.__kagerou.engine.frame);
  await wait(page, (target) => {
    const k = window.__kagerou;
    return k.engine.frame >= target && k.engine.running && !k.engine.contextLost &&
      k.engine.stats.drawCalls > 0 && k.engine.stats.triangles > 0;
  }, before + count);
}

async function boot(page, url, result) {
  report.bootCount++;
  result.url = url;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  result.boot = await waitForBoot(page, {
    readyExpr: 'window.__kagerouReady === true', statusSelector: '#boot-status', timeout: TIMEOUT,
  });
  check(result, 'ready within boot budget', result.boot.booted, result.boot);
  await wait(page, () => document.querySelector('#game-canvas')?.dataset.state === 'running' &&
    document.querySelector('#boot')?.classList.contains('hidden'));
}

function pixels(png) {
  let sum = 0, sum2 = 0, lit = 0, below16 = 0, above240 = 0;
  const colours = new Set();
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const offset = i * png.channels;
    const r = png.data[offset], g = png.data[offset + 1], b = png.data[offset + 2];
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    sum += y; sum2 += y * y; if (y > 8) lit++;
    if (y < 16) below16++;
    if (y >= 241) above240++;
    colours.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const mean = sum / n;
  return { meanLuma: mean, stdLuma: Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
    fractionAbove8: lit / n, quantizedColours: colours.size,
    pctBelow16: 100 * below16 / n, pctAbove240: 100 * above240 / n };
}

function crosscheckPixels(path, measurement) {
  const img = loadImage(path);
  const box = { x0: 0, y0: 0, w: img.width, h: img.height };
  const trustedRegion = regionStats(img, box);
  const trustedHistogram = measureLuma(path, [], { ignoreTransparent: false });
  const rgb = cut(img, box);
  let mean = 0, m2 = 0, lit = 0;
  const colours = new Set(), n = img.width * img.height;
  // Welford variance on the kit's packed RGB copy checks the direct sum/squares
  // path independently, including channel stride and nearly uniform lost frames.
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, delta = y - mean;
    mean += delta / (i + 1); m2 += delta * (y - mean);
    if (y > 8) lit++;
    colours.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const reference = { meanLuma: mean, stdLuma: Math.sqrt(Math.max(0, m2 / n)),
    fractionAbove8: lit / n, quantizedColours: colours.size,
    pctBelow16: trustedHistogram.pctBelow16, pctAbove240: trustedHistogram.pctAbove240 };
  const roundedRGBMean = 0.2126 * trustedRegion.meanRGB[0] +
    0.7152 * trustedRegion.meanRGB[1] + 0.0722 * trustedRegion.meanRGB[2];
  const errors = Object.fromEntries(Object.keys(reference)
    .map((key) => [key, measurement.pixels[key] - reference[key]]));
  errors.meanLumaFromRoundedRGB = measurement.pixels.meanLuma - roundedRGBMean;
  // regionStats rounds RGB means to 0.1; measureLuma rounds percentages to 0.001.
  const tolerances = { meanLuma: 1e-8, stdLuma: 1e-4, fractionAbove8: 0, quantizedColours: 0,
    pctBelow16: 0.000500001, pctAbove240: 0.000500001, meanLumaFromRoundedRGB: 0.050000001 };
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  const samePNG = sha256 === measurement.sha256 && img.width === measurement.width && img.height === measurement.height;
  return { source: '.kit/lib/image/measure.mjs: loadImage, regionStats, measureLuma, cut',
    method: 'Whole saved PNG; kit RGB means/histogram and independent Welford variance over kit.cut.',
    samePNG, sha256, trustedRegion, trustedHistogram, roundedRGBMean, reference, errors, tolerances,
    passed: samePNG && Object.keys(errors).every((key) =>
      Number.isFinite(errors[key]) && Math.abs(errors[key]) <= tolerances[key]) };
}

function difference(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('PNG dimensions changed');
  let sum = 0, changed = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta += Math.abs(a.data[i * a.channels + c] - b.data[i * b.channels + c]);
    sum += delta; if (delta > 12) changed++;
  }
  return { meanAbsoluteRGB: sum / (n * 3), fractionChangedByMoreThan4: changed / n };
}

async function screenshot(page, result, name) {
  const filename = `browser-smoke-r17-${name}.png`;
  const buffer = await page.screenshot({ path: join(OUT, filename), type: 'png',
    fullPage: false, scale: 'device', timeout: TIMEOUT });
  const png = decodePNG(buffer);
  const measurement = { file: `shots/${filename}`, width: png.width, height: png.height,
    bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), pixels: pixels(png) };
  measurement.crosscheck = crosscheckPixels(join(OUT, filename), measurement);
  result.screenshots.push(measurement);
  check(result, `${name}: native PNG dimensions`,
    png.width === PROFILE.viewport.width * PROFILE.deviceScaleFactor &&
    png.height === PROFILE.viewport.height * PROFILE.deviceScaleFactor,
    { width: png.width, height: png.height });
  check(result, `${name}: saved PNG metrics agree with kit crosscheck`,
    measurement.crosscheck.passed, { errors: measurement.crosscheck.errors,
      tolerances: measurement.crosscheck.tolerances, samePNG: measurement.crosscheck.samePNG });
  return { png, measurement };
}

function visibleWorld(measurement) {
  const p = measurement.pixels;
  return p.meanLuma > 3 && p.stdLuma > 3 && p.fractionAbove8 > 0.01 && p.quantizedColours >= 12;
}

async function production(browser, origin) {
  activeContext = 'ordinary-production';
  let context, diagnostics;
  const result = await stage('ordinary-production', async (s) => {
    context = await browser.newContext(PROFILE);
    // This observes DOM startup without adding an inspection global to release mode.
    await context.addInitScript(() => {
      let clicked = false, runningWrites = 0;
      const observer = new MutationObserver((records) => {
        const button = document.querySelector('#boot-start');
        for (const record of records) {
          if (record.target.id === 'game-canvas' && record.attributeName === 'data-state' &&
            record.target.dataset.state === 'running') runningWrites++;
        }
        if (button) button.dataset.smokeRunningWrites = String(runningWrites);
        if (!clicked && button?.classList.contains('ready')) {
          clicked = true;
          for (let i = 0; i < 12; i++) button.click();
          button.dataset.smokeStartClicks = '12';
        }
      });
      observer.observe(document, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'data-state'] });
    });
    const page = await context.newPage();
    diagnostics = observe(page);
    await boot(page, `${origin}/?q=medium&autostart`, s);
    await wait(page, () => document.querySelector('#boot-start')?.dataset.smokeRunningWrites === '1' &&
      getComputedStyle(document.querySelector('#boot')).visibility === 'hidden');
    s.beforeRepeatedClicks = await page.evaluate(() => ({
      ready: window.__kagerouReady, state: document.querySelector('#game-canvas').dataset.state,
      inspectionGlobals: Object.getOwnPropertyNames(window).filter((name) =>
        (/^__kagerou/.test(name) && name !== '__kagerouReady') || name === '__kh'),
      initialClicks: Number(document.querySelector('#boot-start').dataset.smokeStartClicks),
    }));
    check(s, 'release inspection globals absent before repeated clicks',
      s.beforeRepeatedClicks.inspectionGlobals.length === 0, s.beforeRepeatedClicks);
    await page.evaluate(() => {
      const button = document.querySelector('#boot-start');
      for (let i = 0; i < 12; i++) button.click();
      button.dataset.smokeStartClicks = String(Number(button.dataset.smokeStartClicks) + 12);
    });
    const shot = await screenshot(page, s, 'production');
    check(s, 'production world reaches the compositor', visibleWorld(shot.measurement), shot.measurement.pixels);
    s.afterRepeatedClicks = await page.evaluate(() => ({
      ready: window.__kagerouReady, state: document.querySelector('#game-canvas').dataset.state,
      bootHidden: document.querySelector('#boot').classList.contains('hidden'),
      inspectionGlobals: Object.getOwnPropertyNames(window).filter((name) =>
        (/^__kagerou/.test(name) && name !== '__kagerouReady') || name === '__kh'),
      clicks: Number(document.querySelector('#boot-start').dataset.smokeStartClicks),
      runningWrites: Number(document.querySelector('#boot-start').dataset.smokeRunningWrites),
      fatalVisible: getComputedStyle(document.querySelector('#fatal')).display !== 'none',
      search: location.search,
    }));
    const a = s.afterRepeatedClicks;
    check(s, 'ordinary URL has no capture or debug mode',
      !new URLSearchParams(a.search).has('capture') && !new URLSearchParams(a.search).has('debug'), a.search);
    check(s, '24 DOM start clicks leave one successful start',
      s.beforeRepeatedClicks.initialClicks === 12 && a.clicks === 24 && a.runningWrites === 1 &&
      a.ready === true && a.state === 'running' && a.bootHidden && !a.fatalVisible, a);
    check(s, 'release inspection globals remain absent', a.inspectionGlobals.length === 0, a.inspectionGlobals);
  });
  if (diagnostics) {
    result.diagnostics = diagnostics();
    result.checks.push({ name: 'zero runtime errors', passed: result.diagnostics.total === 0 });
    if (result.diagnostics.total) result.status = 'FAIL';
  }
  await context?.close();
}

async function installCaptureProbe(page) {
  await page.evaluate(() => {
    const k = window.__kagerou;
    const probe = k.__browserSmokeR17 = { consumed: { dodge: 0, interact: 0 },
      dodgeEntries: [], touches: [], objectives: [], contextEvents: [] };
    const consume = k.input.consume;
    k.input.consume = function (name) {
      const value = consume.call(this, name);
      if (value && Object.hasOwn(probe.consumed, name)) probe.consumed[name]++;
      return value;
    };
    const setState = k.player._setState;
    k.player._setState = function (...args) {
      const before = this.state;
      const value = setState.apply(this, args);
      if (this.state === 'dodge' && before !== 'dodge') probe.dodgeEntries.push({ frame: k.engine.frame });
      return value;
    };
    k.engine.canvas.addEventListener('pointerdown', (event) => {
      probe.touches.push({ type: event.pointerType, trusted: event.isTrusted, x: event.clientX,
        y: event.clientY, zone: k.input._hitZone(event.clientX, event.clientY)?.name || null });
    });
    k.bus.on('objective', (objective) => probe.objectives.push({ ...objective, frame: k.engine.frame }));
    for (const type of ['webglcontextlost', 'webglcontextrestored']) {
      k.engine.canvas.addEventListener(type, (event) => probe.contextEvents.push({
        type, trusted: event.isTrusted, frame: k.engine.frame, contextLost: k.engine.contextLost,
      }));
    }
  });
}

async function bellFixture(page, initial) {
  await page.evaluate((initialSetup) => {
    const k = window.__kagerou;
    k.menus.skipIntro(); k.menus.resume(); k.hud.__show(); k.hud.setAlpha(1);
    k.debugCam('off'); k.enemies.despawnAll(); k.combat.reset();
    k.level.spawnQueue.length = 0;
    k.level._advanceEncounter(3); // The waiting bell; startEncounter('bell') deliberately arms it.
    const bell = k.level.interactables.find((item) => item.id === 'bell');
    if (initialSetup) bell.used = false;
    else if (bell.used) throw new Error('Dodge rang the bell; fixture must not erase that result');
    k.level._interactionCooldown = 0;
    const position = bell.position.clone();
    position.y = k.terrain.heightAt(position.x, position.z);
    k.input.releaseAll(); k.player.respawn(position);
    k.player.controller.teleport(position.x, position.y, position.z);
    k.playerCamera.lockTarget = null; k.playerCamera.snap();
  }, initial);
  await frames(page);
  await wait(page, () => window.__kagerou.hud._interaction?.id === 'bell');
}

async function hitRects(page) {
  return page.evaluate(() => {
    const k = window.__kagerou;
    return k.input._zones.flatMap((zone) => {
      const rect = zone.rect();
      if (!rect) return [];
      const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
      return [{ name: zone.name, ...rect, center: { x, y },
        resolvedZone: k.input._hitZone(x, y)?.name,
        elementAtCenter: document.elementFromPoint(x, y)?.id || null }];
    });
  });
}

function validateRects(s, rects, label) {
  const required = ['guard', 'dodge', 'special', 'lockOn', 'interact', 'pause'];
  check(s, `${label}: all six live hit targets`,
    required.every((name) => rects.filter((r) => r.name === name).length === 1), rects);
  const invalid = rects.filter((r) => ![r.x, r.y, r.w, r.h].every(Number.isFinite) ||
    r.w < 64 || r.h < 64 || r.x < 16 || r.y < 16 ||
    r.x + r.w > PROFILE.viewport.width - 16 || r.y + r.h > PROFILE.viewport.height - 16 ||
    r.resolvedZone !== r.name || r.elementAtCenter !== 'game-canvas');
  check(s, `${label}: targets are reachable inside actual viewport`, invalid.length === 0, invalid);
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    // Input includes rectangle boundaries, so even a shared edge is ambiguous.
    if (w >= 0 && h >= 0) overlaps.push({ a: a.name, b: b.name, w, h });
  }
  check(s, `${label}: hit rectangles do not overlap`, overlaps.length === 0, overlaps);
}

async function touch(page, s) {
  await bellFixture(page, true);
  s.fixture = await page.evaluate(() => {
    const k = window.__kagerou, bell = k.level.interactables.find((item) => item.id === 'bell');
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      touch: { maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches,
        visible: k.touch.visible }, alive: k.player.isAlive, health: k.player.health,
      state: k.player.state, player: k.player.position.toArray(), bell: bell.position.toArray(),
      used: bell.used, nearest: k.level.nearestInteractable(k.player.position)?.id,
      encounter: k.level._enc.active?.id, armed: k.level._enc.armed,
      enemies: k.enemies.aliveCount };
  });
  const f = s.fixture;
  check(s, 'actual 568x320 touch viewport', f.viewport.width === 568 && f.viewport.height === 320 &&
    f.touch.maxTouchPoints > 0 && f.touch.coarse && f.touch.visible, f.viewport);
  check(s, 'living player in range of a waiting unused bell', f.alive && f.health > 0 &&
    !f.used && f.nearest === 'bell' && f.encounter === 'bell' && !f.armed && f.enemies === 0, f);
  s.hitRects = await hitRects(page);
  validateRects(s, s.hitRects, 'before Dodge');
  await screenshot(page, s, 'touch-before');
  const dodge = s.hitRects.find((rect) => rect.name === 'dodge').center;
  await page.touchscreen.tap(dodge.x, dodge.y);
  await wait(page, () => window.__kagerou.__browserSmokeR17.dodgeEntries.length > 0);
  await frames(page, 2);
  s.afterDodge = await page.evaluate(() => {
    const k = window.__kagerou;
    return { used: k.level.interactables.find((item) => item.id === 'bell').used,
      armed: k.level._enc.armed, consumed: { ...k.__browserSmokeR17.consumed },
      dodgeEntries: [...k.__browserSmokeR17.dodgeEntries], touches: [...k.__browserSmokeR17.touches],
      position: k.player.position.toArray(), state: k.player.state };
  });
  check(s, 'native Dodge touch executes Dodge without using the bell',
    s.afterDodge.consumed.dodge === 1 && s.afterDodge.dodgeEntries.length === 1 &&
    s.afterDodge.consumed.interact === 0 && !s.afterDodge.used && !s.afterDodge.armed &&
    s.afterDodge.touches.some((event) => event.type === 'touch' && event.trusted && event.zone === 'dodge'),
    s.afterDodge);
  // Dodge may leave the radius. Restore only the legitimate approach conditions.
  await bellFixture(page, false);
  s.contextRects = await hitRects(page);
  validateRects(s, s.contextRects, 'before context touch');
  const context = s.contextRects.find((rect) => rect.name === 'interact').center;
  await page.touchscreen.tap(context.x, context.y);
  await wait(page, () => window.__kagerou.level.interactables.find((item) => item.id === 'bell').used);
  s.afterContextTouch = await page.evaluate(() => {
    const k = window.__kagerou, probe = k.__browserSmokeR17;
    return { used: k.level.interactables.find((item) => item.id === 'bell').used,
      armed: k.level._enc.armed, consumed: { ...probe.consumed }, touches: [...probe.touches],
      objectives: [...probe.objectives] };
  });
  const a = s.afterContextTouch;
  check(s, 'native context touch deliberately rings the bell', a.used && a.armed &&
    a.consumed.interact === 1 && a.consumed.dodge === 1 &&
    a.touches.some((event) => event.type === 'touch' && event.trusted && event.zone === 'interact'), a);
  await screenshot(page, s, 'touch-after');
}

async function contextState(page) {
  return page.evaluate(() => {
    const k = window.__kagerou;
    return { contextLost: k.engine.contextLost, glLost: k.renderer.getContext().isContextLost(),
      running: k.engine.running, paused: k.engine.paused, mode: k.menus.mode,
      inputEnabled: k.input.enabled, frame: k.engine.frame, canvasState: k.engine.canvas.dataset.state,
      environment: k.scene.environment?.uuid || null, stats: { ...k.engine.stats },
      pressed: [...k.input.state.pressed], moveMag: k.input.state.moveMag,
      alive: k.player.isAlive, health: k.player.health,
      finite: [...k.player.position.toArray(), ...k.camera.position.toArray()].every(Number.isFinite),
      events: [...k.__browserSmokeR17.contextEvents],
      dodgeCount: k.__browserSmokeR17.consumed.dodge,
      dodgeEntries: k.__browserSmokeR17.dodgeEntries.length };
  });
}

async function contextRecovery(page, s) {
  await page.evaluate(() => {
    const k = window.__kagerou;
    k.menus.skipIntro(); k.menus.resume(); k.hud.__hide(); k.debugCam('off');
    k.level._advanceEncounter(-1); k.level.spawnQueue.length = 0;
    k.enemies.despawnAll(); k.combat.reset(); k.input.releaseAll();
    k.player.respawn(k.level.playerSpawn.position);
    const p = k.player.position;
    k.player.controller.teleport(p.x, p.y, p.z); k.playerCamera.lockTarget = null; k.playerCamera.snap();
  });
  await frames(page);
  s.before = await contextState(page);
  check(s, 'healthy running context before loss', s.before.running && !s.before.paused &&
    !s.before.contextLost && !s.before.glLost && s.before.inputEnabled && s.before.environment &&
    s.before.alive && s.before.finite, s.before);
  const before = await screenshot(page, s, 'context-before');
  check(s, 'world pixels present before loss', visibleWorld(before.measurement), before.measurement.pixels);

  await page.keyboard.press('Escape');
  await wait(page, () => window.__kagerou.menus.mode === 'pause' && window.__kagerou.engine.paused &&
    !window.__kagerou.input.enabled);
  s.paused = await contextState(page);
  const extension = await page.evaluateHandle(() =>
    window.__kagerou.renderer.getContext().getExtension('WEBGL_lose_context'));
  try {
    check(s, 'actual WEBGL_lose_context extension available',
      await extension.evaluate((ext) => !!ext && typeof ext.loseContext === 'function' &&
        typeof ext.restoreContext === 'function'));
    lossExperimentPhase = 'losing';
    await extension.evaluate((ext) => ext.loseContext());
    await wait(page, () => window.__kagerou.engine.contextLost && !window.__kagerou.engine.running);
    lossExperimentPhase = 'lost';
    s.lost = await contextState(page);
    check(s, 'real context loss stops rendering and disables input', s.lost.glLost &&
      s.lost.contextLost && !s.lost.running && !s.lost.inputEnabled && s.lost.canvasState === 'recovering' &&
      s.lost.events.some((event) => event.type === 'webglcontextlost' && event.trusted), s.lost);
    await page.keyboard.press('Escape');
    await wait(page, () => window.__kagerou.menus.mode === 'none' && !window.__kagerou.engine.paused);
    await page.keyboard.press('Space');
    s.resumeWhileLost = await contextState(page);
    check(s, 'Escape resumes the menu while lost input remains disabled',
      s.resumeWhileLost.contextLost && !s.resumeWhileLost.running && !s.resumeWhileLost.paused &&
      !s.resumeWhileLost.inputEnabled && s.resumeWhileLost.pressed.length === 0 &&
      s.resumeWhileLost.moveMag === 0 && s.resumeWhileLost.frame === s.lost.frame &&
      s.resumeWhileLost.dodgeCount === s.before.dodgeCount, s.resumeWhileLost);
    const lost = await screenshot(page, s, 'context-lost');
    lossExperimentPhase = 'restoring';
    await extension.evaluate((ext) => ext.restoreContext());
    await wait(page, () => {
      const k = window.__kagerou;
      return !k.engine.contextLost && !k.renderer.getContext().isContextLost() &&
        k.engine.running && k.input.enabled && k.engine.canvas.dataset.state === 'running';
    });
    lossExperimentPhase = 'restored';
    await frames(page);
    s.restored = await contextState(page);
    check(s, 'restore resumes living gameplay and replaces environment texture',
      s.restored.running && !s.restored.paused && !s.restored.contextLost && !s.restored.glLost &&
      s.restored.inputEnabled && s.restored.environment !== s.before.environment &&
      !!s.restored.environment && s.restored.frame > s.lost.frame && s.restored.finite &&
      s.restored.alive && s.restored.events.some((event) => event.type === 'webglcontextrestored' && event.trusted),
      s.restored);
    const after = await screenshot(page, s, 'context-after');
    s.pixelComparison = { beforeToAfter: difference(before.png, after.png),
      lostToAfter: difference(lost.png, after.png),
      retainedMean: after.measurement.pixels.meanLuma / before.measurement.pixels.meanLuma,
      retainedContrast: after.measurement.pixels.stdLuma / before.measurement.pixels.stdLuma };
    check(s, 'world pixels return in a native PNG after real rendered frames',
      visibleWorld(after.measurement) && s.pixelComparison.retainedMean >= 0.25 &&
      s.pixelComparison.retainedContrast >= 0.25 &&
      s.restored.stats.drawCalls > 0 && s.restored.stats.triangles > 0,
      { pixels: after.measurement.pixels, comparison: s.pixelComparison });
    await page.keyboard.press('Space');
    await wait(page, (count) => window.__kagerou.__browserSmokeR17.dodgeEntries.length > count,
      s.restored.dodgeEntries);
    s.afterRestoredInput = await contextState(page);
    check(s, 'restored input executes a real Dodge',
      s.afterRestoredInput.dodgeCount === s.before.dodgeCount + 1 &&
      s.afterRestoredInput.dodgeEntries === s.restored.dodgeEntries + 1, s.afterRestoredInput);
  } finally { lossExperimentPhase = 'none'; await extension.dispose(); }
}

async function capture(browser, origin) {
  activeContext = 'capture';
  let context, page, diagnostics;
  const bootResult = await stage('capture-boot', async (s) => {
    context = await browser.newContext(PROFILE);
    page = await context.newPage(); diagnostics = observe(page);
    await boot(page, `${origin}/?q=medium&autostart&capture`, s);
    check(s, 'capture inspection API available', await page.evaluate(() => !!window.__kagerou &&
      typeof window.__kagerouStart === 'function' && window.__kagerou.engine.captureMode));
    await frames(page);
    await installCaptureProbe(page);
    s.renderer = await page.evaluate(() => ({ description: window.__kagerou.quality.describe(),
      webglVersion: window.__kagerou.renderer.getContext().getParameter(
        window.__kagerou.renderer.getContext().VERSION) }));
  });
  const results = [bootResult];
  if (bootResult.status === 'PASS') {
    results.push(await stage('native-touch-bell', (s) => touch(page, s)));
    results.push(await stage('webgl-context-recovery', (s) => contextRecovery(page, s)));
  } else {
    for (const name of ['native-touch-bell', 'webgl-context-recovery']) {
      report.stages.push({ name, status: 'SKIPPED', reason: 'Capture boot failed', checks: [] });
    }
  }
  if (diagnostics) {
    report.captureDiagnostics = diagnostics();
    // Runtime faults cannot be downgraded because a later observable still looked healthy.
    if (report.captureDiagnostics.total) for (const result of results) result.status = 'FAIL';
    report.stages.push({ name: 'capture-runtime-errors',
      status: report.captureDiagnostics.total === 0 ? 'PASS' : 'FAIL',
      checks: [{ name: 'zero runtime errors', passed: report.captureDiagnostics.total === 0 }],
      diagnostics: report.captureDiagnostics });
  }
  await context?.close();
}

let release, server, browser;
try {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('Built dist/index.html is required; run npm run build first.');
  release = releaseOnExit(await acquireLock({ path: join(OUT, '.capture.lock'), ownerMatch: 'capture.mjs' }));
  report.gitHead = gitText(['rev-parse', 'HEAD']);
  report.gitDirty = gitText(['status', '--short']);
  report.distSha256 = fingerprintTree(DIST);
  server = await serveStatic({ root: DIST });
  observeStaticServer(server);
  browser = await launchHeadless({ proxy: false, extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
  report.browserVersion = browser.version();
  await production(browser, server.origin);
  await capture(browser, server.origin);
  report.distSha256After = fingerprintTree(DIST);
  if (report.distSha256After !== report.distSha256) report.errors.push('dist changed during measurement');
  if (report.bootCount !== 2) report.errors.push(`Expected two fresh boots; observed ${report.bootCount}`);
  report.status = report.errors.length === 0 && report.stages.every((s) => s.status === 'PASS') ? 'PASS' : 'FAIL';
} catch (error) {
  report.errors.push(error.stack || String(error));
  console.error(`[browser-smoke] ${error.message || error}`);
} finally {
  try { await browser?.close(); } catch (error) { report.errors.push(`Browser close: ${error.message}`); }
  try { await server?.close(); } catch (error) { report.errors.push(`Server close: ${error.message}`); }
  if (server) {
    const serverErrors = report.staticResponses.filter((response) => response.status >= 400);
    report.stages.push({ name: 'static-server-responses', status: serverErrors.length ? 'FAIL' : 'PASS',
      checks: [{ name: 'zero HTTP errors observed at response finish', passed: serverErrors.length === 0,
        evidence: serverErrors }] });
    if (serverErrors.length) report.status = 'FAIL';
  }
  if (report.errors.length) report.status = 'FAIL';
  report.finishedAt = new Date().toISOString();
  report.seconds = (Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000;
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  release?.();
  console.log(`[browser-smoke] ${report.status}: ${REPORT}`);
  if (report.status !== 'PASS') process.exitCode = 1;
}
