#!/usr/bin/env node

/**
 * Mobile Safari gate for an iPhone SE (3rd generation) iOS Simulator.
 *
 * Appium/XCUITest owns the real Mobile Safari session. This script uses only
 * W3C WebDriver endpoints so it needs no client SDK and drives trusted touch
 * actions through the same public surface as a player.
 *
 * The simulator exercises iOS and Mobile Safari, but it is not evidence about
 * physical-phone GPU speed, thermals, memory pressure, hardware multi-touch,
 * haptics, speakers, or audio latency.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, process.env.KAGEROU_IOS_OUTPUT || 'test-results/ios-safari');
const reportPath = resolve(outputDir, 'report.json');
const screenshotPath = resolve(outputDir, 'ios-safari-steady.png');
const pausedScreenshotPath = resolve(outputDir, 'ios-safari-pause.png');
const appiumUrl = new URL(process.env.APPIUM_URL || 'http://127.0.0.1:4723/');
const externalUrl = process.env.KAGEROU_TEST_URL || '';
const baseUrl = externalUrl || 'http://127.0.0.1:4173/';
const udid = process.env.IOS_SIMULATOR_UDID || '';
const platformVersion = process.env.IOS_SIMULATOR_PLATFORM_VERSION || '';
const timeout = Number(process.env.KAGEROU_IOS_TIMEOUT || 240000);

mkdirSync(outputDir, { recursive: true });

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  target: 'iPhone SE (3rd generation) iOS Simulator / Mobile Safari / landscape',
  appiumUrl: appiumUrl.href,
  baseUrl,
  device: null,
  interaction: {},
  checks: [],
  errors: [],
  status: 'running',
  failures: [],
};

function check(condition, name, detail) {
  const passed = Boolean(condition);
  report.checks.push({ name, passed, detail });
  if (!passed) report.failures.push(`${name}: ${detail}`);
  return passed;
}

async function waitForHttp(url, waitMs = 60000) {
  const deadline = Date.now() + waitMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`endpoint did not become reachable: ${lastError?.message || 'timeout'}`);
}

async function webdriver(pathname, { method = 'POST', body } = {}) {
  const url = new URL(pathname.replace(/^\//, ''), appiumUrl);
  const encoded = body === undefined ? '' : JSON.stringify(body);
  const response = await new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(url, {
      method,
      headers: body === undefined ? undefined : {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(encoded),
      },
    }, (incoming) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk) => { text += chunk; });
      incoming.on('end', () => resolveRequest({ ok: incoming.statusCode >= 200 && incoming.statusCode < 300, status: incoming.statusCode, text }));
    });
    request.setTimeout(900000, () => request.destroy(new Error(`WebDriver ${method} ${pathname} exceeded 15 minutes`)));
    request.on('error', rejectRequest);
    if (encoded) request.write(encoded);
    request.end();
  });
  const text = response.text;
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { value: text }; }
  if (!response.ok || payload?.value?.error) {
    const message = payload?.value?.message || payload?.value || `HTTP ${response.status}`;
    throw new Error(`WebDriver ${method} ${pathname}: ${message}`);
  }
  return payload.value;
}

let sessionId = '';
const sessionPath = (suffix = '') => `session/${sessionId}${suffix}`;

async function execute(script, args = []) {
  return webdriver(sessionPath('/execute/sync'), { body: { script, args } });
}

async function waitForScript(script, waitMs = 30000) {
  const deadline = Date.now() + waitMs;
  let value;
  while (Date.now() < deadline) {
    try {
      value = await execute(script);
      if (value) return value;
    } catch (error) {
      report.errors.push(`poll: ${error.message}`);
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Safari condition timed out: ${script.slice(0, 120)}`);
}

async function performActions(actions) {
  await webdriver(sessionPath('/actions'), { body: { actions } });
  await webdriver(sessionPath('/actions'), { method: 'DELETE' }).catch(() => {});
}

function finger(id, actions) {
  return { type: 'pointer', id, parameters: { pointerType: 'touch' }, actions };
}

const move = (x, y, duration = 0) => ({ type: 'pointerMove', duration, x: Math.round(x), y: Math.round(y), origin: 'viewport' });
const down = () => ({ type: 'pointerDown', button: 0 });
const up = () => ({ type: 'pointerUp', button: 0 });
const pause = (duration) => ({ type: 'pause', duration });

async function tap(x, y) {
  await performActions([finger(`tap-${Date.now()}`, [move(x, y), down(), pause(90), up()])]);
}

async function saveScreenshot(path) {
  const encoded = await webdriver(sessionPath('/screenshot'), { method: 'GET' });
  writeFileSync(path, Buffer.from(encoded, 'base64'));
}

let preview = null;
let previewLog = '';

try {
  if (!udid) throw new Error('IOS_SIMULATOR_UDID is required');
  if (!platformVersion) throw new Error('IOS_SIMULATOR_PLATFORM_VERSION is required');

  if (!externalUrl) {
    const vite = resolve(root, 'node_modules/vite/bin/vite.js');
    preview = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    preview.stdout.on('data', (chunk) => { previewLog += chunk.toString(); });
    preview.stderr.on('data', (chunk) => { previewLog += chunk.toString(); });
    await waitForHttp(baseUrl);
  }
  await waitForHttp(new URL('status', appiumUrl), 90000);

  const created = await webdriver('session', {
    body: {
      capabilities: {
        alwaysMatch: {
          platformName: 'iOS',
          browserName: 'Safari',
          'appium:automationName': 'XCUITest',
          'appium:deviceName': 'iPhone SE (3rd generation)',
          'appium:udid': udid,
          'appium:platformVersion': platformVersion,
          'appium:noReset': true,
          'appium:newCommandTimeout': 300,
          'appium:safariAllowPopups': true,
          'appium:includeSafariInWebviews': true,
          'appium:simulatorStartupTimeout': 300000,
          'appium:wdaLaunchTimeout': 180000,
          'appium:wdaStartupRetries': 3,
          'appium:wdaStartupRetryInterval': 10000,
          'appium:showXcodeLog': true,
        },
        firstMatch: [{}],
      },
    },
  });
  sessionId = created?.sessionId || created?.capabilities?.sessionId || '';
  if (!sessionId) {
    // Appium's W3C response places the session id next to value on some versions.
    const sessions = await webdriver('sessions', { method: 'GET' });
    sessionId = sessions?.at?.(-1)?.id || '';
  }
  if (!sessionId) throw new Error('Appium did not return a session id');

  await webdriver(sessionPath('/orientation'), { body: { orientation: 'LANDSCAPE' } });
  const url = new URL(baseUrl);
  url.searchParams.set('autostart', '');
  url.searchParams.set('q', 'medium');
  url.searchParams.set('e2e', 'ios-simulator');
  await webdriver(sessionPath('/url'), { body: { url: url.href } });
  await waitForScript('return window.__kagerouReady === true;', timeout);
  await execute(`
    window.__kagerouIosErrors = [];
    window.addEventListener('error', function (event) {
      window.__kagerouIosErrors.push(String(event.message || 'error'));
    });
    window.addEventListener('unhandledrejection', function (event) {
      window.__kagerouIosErrors.push(String(event.reason || 'unhandled rejection'));
    });
    return true;
  `);
  await execute(`
    return Promise.resolve(window.__kagerouStart && window.__kagerouStart()).then(function () {
      if (window.__kagerou && window.__kagerou.menus) window.__kagerou.menus.skipIntro();
      if (window.__kagerou && window.__kagerou.hud) window.__kagerou.hud.__show();
      return true;
    });
  `);
  await waitForScript(`return Boolean(
    document.getElementById('boot') && document.getElementById('boot').classList.contains('hidden') &&
    window.__kagerou && window.__kagerou.engine && window.__kagerou.engine.running
  );`, 60000);

  report.device = await execute(`
    return {
      viewport: { width: innerWidth, height: innerHeight },
      visualViewport: window.visualViewport ? { width: visualViewport.width, height: visualViewport.height } : null,
      dpr: devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      coarse: matchMedia('(pointer: coarse)').matches,
      landscape: matchMedia('(orientation: landscape)').matches,
      quality: window.__kagerou.quality && window.__kagerou.quality.name,
      detected: window.__kagerou.quality && window.__kagerou.quality.device,
      running: window.__kagerou.engine.running,
      drawCalls: window.__kagerou.engine.stats.drawCalls,
      triangles: window.__kagerou.engine.stats.triangles
    };
  `);
  const device = report.device;
  check(device.viewport.width === 667, 'iPhone SE 3 landscape width', JSON.stringify(device.viewport));
  check(device.viewport.height >= 300 && device.viewport.height <= 375, 'Mobile Safari landscape height', JSON.stringify(device.viewport));
  check(device.dpr === 2, 'iPhone SE 3 DPR', `dpr=${device.dpr}`);
  check(device.landscape && device.maxTouchPoints > 0 && device.coarse, 'landscape touch surface is active', JSON.stringify(device));
  check(device.detected?.isIOS === true && device.detected?.isMobile === true, 'game detects iOS mobile mode', JSON.stringify(device.detected));
  check(String(device.quality).toLowerCase() === 'medium', 'primary quality tier is MEDIUM', `quality=${device.quality}`);
  check(device.running, 'engine enters running state', `running=${device.running}`);
  check(device.drawCalls > 0 && device.drawCalls <= 140, 'draw-call budget holds', `drawCalls=${device.drawCalls}`);
  check(device.triangles > 0 && device.triangles <= 900000, 'triangle budget holds', `triangles=${device.triangles}`);

  const before = await execute(`return {
    position: window.__kagerou.player.position.toArray(),
    yaw: window.__kagerou.playerCamera.yaw,
    pitch: window.__kagerou.playerCamera.pitch
  };`);
  const gesturePoint = await execute(`
    var input = window.__kagerou.input;
    var best = null;
    for (var y = 54; y <= innerHeight - 54; y += 20) {
      for (var x = Math.ceil(innerWidth * 0.48); x <= innerWidth - 54; x += 20) {
        if (input._hitZone(x, y)) continue;
        var edge = Math.min(x - innerWidth * 0.42, innerWidth - x, y, innerHeight - y);
        if (!best || edge > best.score) best = { x: x, y: y, score: edge };
      }
    }
    return best;
  `);
  check(Boolean(gesturePoint), 'unclaimed attack/camera surface exists', JSON.stringify(gesturePoint));
  if (!gesturePoint) throw new Error('no unclaimed gesture point exists');

  await execute(`
    var player = window.__kagerou.player;
    window.__kagerouIosTransitions = [];
    window.__kagerouIosOriginalSetState = player._setState;
    player._setState = function (next) {
      window.__kagerouIosTransitions.push(next);
      return window.__kagerouIosOriginalSetState.apply(this, arguments);
    };
    return true;
  `);
  const width = device.viewport.width;
  const height = device.viewport.height;
  await performActions([
    finger('move-thumb', [move(width * 0.14, height * 0.80), down(), move(width * 0.14, height * 0.55, 300), pause(0), pause(0), pause(120), up()]),
    finger('attack-thumb', [pause(0), pause(0), pause(300), move(gesturePoint.x, gesturePoint.y), down(), pause(120), up()]),
  ]);
  await new Promise((done) => setTimeout(done, 700));
  const after = await execute(`
    var player = window.__kagerou.player;
    player._setState = window.__kagerouIosOriginalSetState;
    return {
      position: player.position.toArray(),
      transitions: window.__kagerouIosTransitions.slice(),
      moveMagnitude: window.__kagerou.input.state.moveMag,
      activePointers: window.__kagerou.input._pointers.size
    };
  `);
  const moved = Math.hypot(...after.position.map((value, index) => value - before.position[index]));
  const attacked = after.transitions.includes('drawing') || after.transitions.includes('attack');
  report.interaction.simultaneous = { before, after, moved, attacked, gesturePoint };
  check(moved > 0.08, 'trusted touch movement moves the player', `distance=${moved.toFixed(4)}`);
  check(attacked, 'second trusted touch starts an attack', JSON.stringify(after.transitions));
  check(after.moveMagnitude === 0 && after.activePointers === 0, 'touch release clears active input', JSON.stringify(after));

  const cameraBefore = await execute('return { yaw: window.__kagerou.playerCamera.yaw, pitch: window.__kagerou.playerCamera.pitch };');
  await performActions([finger('camera-thumb', [
    move(width * 0.72, height * 0.50), down(), move(width * 0.86, height * 0.35, 450), up(),
  ])]);
  await new Promise((done) => setTimeout(done, 250));
  const cameraAfter = await execute('return { yaw: window.__kagerou.playerCamera.yaw, pitch: window.__kagerou.playerCamera.pitch };');
  const cameraDelta = Math.hypot(cameraAfter.yaw - cameraBefore.yaw, cameraAfter.pitch - cameraBefore.pitch);
  report.interaction.camera = { before: cameraBefore, after: cameraAfter, delta: cameraDelta };
  check(cameraDelta > 0.02, 'trusted right-thumb drag moves camera', `delta=${cameraDelta.toFixed(5)}`);

  const pausePoint = await execute(`
    window.__kagerou.menus.skipIntro(); window.__kagerou.hud.__show();
    var r = window.__kagerou.menus._pauseZoneRect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, visible: window.__kagerou.menus._pauseZoneVisible };
  `);
  check(pausePoint.visible, 'pause touch target is visible', JSON.stringify(pausePoint));
  await tap(pausePoint.x, pausePoint.y);
  await waitForScript(`return window.__kagerou.menus.mode === 'pause';`, 10000);
  const paused = await execute(`return {
    mode: window.__kagerou.menus.mode,
    paused: window.__kagerou.engine.paused,
    inputEnabled: window.__kagerou.input.enabled
  };`);
  await saveScreenshot(pausedScreenshotPath);
  check(paused.mode === 'pause' && paused.paused && !paused.inputEnabled, 'pause freezes gameplay input', JSON.stringify(paused));

  const resumePoint = await execute(`
    var row = window.__kagerou.menus.rows[0];
    return { x: row.x + row.w / 2, y: row.y + row.h / 2 };
  `);
  await tap(resumePoint.x, resumePoint.y);
  await waitForScript(`return window.__kagerou.menus.mode === 'none' && !window.__kagerou.engine.paused;`, 10000);
  const resumed = await execute(`return {
    mode: window.__kagerou.menus.mode,
    paused: window.__kagerou.engine.paused,
    inputEnabled: window.__kagerou.input.enabled
  };`);
  check(resumed.mode === 'none' && !resumed.paused && resumed.inputEnabled, 'resume restores gameplay input', JSON.stringify(resumed));

  const persistence = await execute(`
    var menus = window.__kagerou.menus;
    menus.settings.leftHanded = true; menus.apply(false); menus.save();
    var stored = JSON.parse(localStorage.getItem('kagerou.settings'));
    menus.settings.leftHanded = false; menus.load(); menus.apply(true);
    var result = { stored: stored.leftHanded, restored: menus.settings.leftHanded, side: window.__kagerou.input.stickSide };
    menus.settings.leftHanded = false; menus.apply(true); menus.save();
    return result;
  `);
  report.interaction.persistence = persistence;
  check(persistence.stored && persistence.restored && persistence.side === 'right', 'settings save and restore', JSON.stringify(persistence));

  await execute(`
    window.__kagerou.weather.setPreset('petals', true);
    window.__kagerou.sky.setTime(0.78);
    window.__kagerou.debugCam('hero');
    return true;
  `);
  await new Promise((done) => setTimeout(done, 1500));
  await saveScreenshot(screenshotPath);
  const errors = await execute('return (window.__kagerouIosErrors || []).slice();');
  report.errors.push(...errors);
  check(errors.length === 0, 'no captured Safari runtime errors', JSON.stringify(errors));
} catch (error) {
  report.failures.push(error.stack || error.message || String(error));
} finally {
  if (sessionId) await webdriver(sessionPath(), { method: 'DELETE' }).catch((error) => report.errors.push(`session cleanup: ${error.message}`));
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

console.log(`[ios-safari] ${report.status.toUpperCase()}: ${report.failures.length} failure(s)`);
for (const failure of report.failures) console.error(`- ${failure}`);
if (report.failures.length) process.exit(1);
