#!/usr/bin/env node
/**
 * Render 300 consecutive simulation frames for an independent motion review.
 *
 *   node tools/motion-capture.mjs --carry-self-check=r17
 *
 * Build and run interaction-capture's self-check separately first. This tool never
 * builds, substitutes a renderer, retimes a recorded action, or declares visual PASS.
 */
import { chromium, devices } from 'playwright';
import {
  accessSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stickOffset } from './interaction-scenarios.mjs';
import { decodePNG } from '../.kit/lib/image/png.mjs';
import { measureLuma } from '../.kit/lib/image/measure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, 'shots');
const OUT = join(SHOTS, 'motion-r17');
const RUNTIME = join(ROOT, 'tools/harness/runtime.js');
const FPS = 60;
const DT_MS = 1000 / FPS;
const FRAME_BUDGET = 300;
const PROFILE = {
  name: 'phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent, tier: 'medium',
};
const ARGS = [
  '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--enable-webgl', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--mute-audio', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required',
];
const argv = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg.replace(/^--/, ''), true]
    : [arg.slice(0, split).replace(/^--/, ''), arg.slice(split + 1)];
}));
const fatalLog = (line) => /(?:^|\s)(?:error:|pageerror:|crash:)|shader.*(?:error|failed|dead)|(?:non.?finite|invalid ground sample|\bNaN\b|\bInfinity\b)|WebGL.*(?:INVALID|CONTEXT_LOST|OUT_OF_MEMORY)/i.test(line);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rel = (path) => relative(ROOT, path).split('\\').join('/');

/**
 * Inspect saved screenshot bytes, never the cleared WebGL drawing buffer.
 * Importable without starting capture so an existing PNG can be compared with
 * tools/luma.mjs: `inspectMotionPNG(path).luma` is exactly `measureLuma(path, [])`.
 * Supply the same `exclude` rectangles for an existing HUD-masked measurement.
 * Native size, opacity and more than one RGB value are apparatus requirements;
 * there is deliberately no exposure, percentile or artistic quality threshold.
 */
export function inspectMotionPNG(source, {
  expectedDimensions = { width: PROFILE.viewport.width * PROFILE.deviceScaleFactor,
    height: PROFILE.viewport.height * PROFILE.deviceScaleFactor },
  exclude = [], hud = null,
} = {}) {
  const { width, height } = expectedDimensions;
  const bytes = typeof source === 'string' ? readFileSync(source) : source;
  const result = { sha256: sha256(bytes), expectedSize: [width, height], faults: [] };
  let img;
  try { img = decodePNG(bytes); }
  catch (error) { result.faults.push(`PNG decoding failed: ${error.message}`); return result; }
  result.width = img.width; result.height = img.height; result.channels = img.channels;
  if (img.width !== width || img.height !== height)
    result.faults.push(`PNG is ${img.width}x${img.height}; expected native ${width}x${height}.`);
  const pixels = img.width * img.height;
  if (!Number.isSafeInteger(pixels) || pixels <= 0 || ![3, 4].includes(img.channels)
    || img.data.length !== pixels * img.channels) {
    result.faults.push('PNG decoder did not return nonempty packed RGB/RGBA pixels.');
    return result;
  }
  // Exact 24-bit RGB cardinality; a bounded 2 MiB bitset avoids a multi-million
  // object Set for each native frame. Ignore RGB hidden by fully zero alpha.
  const colours = new Uint8Array(1 << 21), worldColours = hud ? new Uint8Array(1 << 21) : null;
  let uncovered = null;
  if (hud) {
    try {
      const overlay = decodePNG(hud.png);
      const [left, top, cssW, cssH] = hud.bounds, [viewW, viewH] = hud.viewport;
      if (![left, top, cssW, cssH, viewW, viewH].every(Number.isFinite)
        || cssW <= 0 || cssH <= 0 || viewW <= 0 || viewH <= 0
        || hud.transform !== 'none' || hud.bitmap[0] !== overlay.width || hud.bitmap[1] !== overlay.height)
        throw new Error('HUD bitmap/CSS mapping cannot identify unoccluded page pixels.');
      if (![3, 4].includes(overlay.channels) || overlay.data.length !== overlay.width * overlay.height * overlay.channels)
        throw new Error('HUD PNG is not packed RGB/RGBA.');
      // Integral alpha occupancy, not HUD colour or authored screen rectangles.
      // Exclude every source pixel touched by bilinear sampling plus a one-source-
      // pixel guard. A black WebGL canvas cannot pass because its HUD has colours.
      const stride = overlay.width + 1, occupancy = new Uint32Array(stride * (overlay.height + 1));
      let occupied = 0;
      for (let y = 0; y < overlay.height; y++) {
        let row = 0;
        for (let x = 0; x < overlay.width; x++) {
          const p = (y * overlay.width + x) * overlay.channels;
          if (overlay.channels === 3 || overlay.data[p + 3] > 0) { row++; occupied++; }
          occupancy[(y + 1) * stride + x + 1] = occupancy[y * stride + x + 1] + row;
        }
      }
      uncovered = (x, y) => {
        const cssX = (x + 0.5) * viewW / img.width, cssY = (y + 0.5) * viewH / img.height;
        if (cssX < left || cssX >= left + cssW || cssY < top || cssY >= top + cssH) return true;
        const u = Math.floor((cssX - left) * overlay.width / cssW - 0.5);
        const v = Math.floor((cssY - top) * overlay.height / cssH - 0.5);
        const x0 = Math.max(0, u - 1), x1 = Math.min(overlay.width, u + 3);
        const y0 = Math.max(0, v - 1), y1 = Math.min(overlay.height, v + 3);
        return occupancy[y1 * stride + x1] - occupancy[y0 * stride + x1]
          - occupancy[y1 * stride + x0] + occupancy[y0 * stride + x0] === 0;
      };
      result.hudMask = { sha256: sha256(hud.png), bitmap: [overlay.width, overlay.height],
        channels: overlay.channels, bounds: hud.bounds, viewport: hud.viewport,
        nonzeroAlphaSourcePixels: occupied,
        rule: 'Only PNG pixels whose HUD resampling footprint has exactly zero alpha; bilinear support plus one source-pixel guard.' };
    } catch (error) { result.faults.push(`HUD exclusion apparatus inconclusive: ${error.message}`); }
  }
  let unique = 0, visible = 0, transparent = 0, partial = 0, black = 0;
  let worldSamples = 0, worldUnique = 0, worldBlack = 0;
  const worldMean = [0, 0, 0], worldM2 = [0, 0, 0];
  let alphaMin = 255, alphaMax = 0, lumaMean = 0, lumaM2 = 0;
  const rgbMean = [0, 0, 0], rgbM2 = [0, 0, 0];
  for (let p = 0; p < img.data.length; p += img.channels) {
    const alpha = img.channels === 4 ? img.data[p + 3] : 255;
    alphaMin = Math.min(alphaMin, alpha); alphaMax = Math.max(alphaMax, alpha);
    if (alpha === 0) { transparent++; continue; }
    if (alpha < 255) partial++;
    visible++;
    const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
    const colour = (r << 16) | (g << 8) | b, slot = colour >>> 3, bit = 1 << (colour & 7);
    if (!(colours[slot] & bit)) { colours[slot] |= bit; unique++; }
    if (colour === 0) black++;
    for (let c = 0; c < 3; c++) {
      const delta = img.data[p + c] - rgbMean[c];
      rgbMean[c] += delta / visible;
      rgbM2[c] += delta * (img.data[p + c] - rgbMean[c]);
    }
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const delta = luma - lumaMean;
    lumaMean += delta / visible; lumaM2 += delta * (luma - lumaMean);
    const index = p / img.channels;
    if (uncovered?.(index % img.width, Math.floor(index / img.width))) {
      worldSamples++;
      if (!(worldColours[slot] & bit)) { worldColours[slot] |= bit; worldUnique++; }
      if (colour === 0) worldBlack++;
      for (let c = 0; c < 3; c++) {
        const d = img.data[p + c] - worldMean[c];
        worldMean[c] += d / worldSamples;
        worldM2[c] += d * (img.data[p + c] - worldMean[c]);
      }
    }
  }
  result.pixels = pixels;
  result.alpha = { min: alphaMin, max: alphaMax, fullyTransparentPixels: transparent,
    partiallyTransparentPixels: partial, visiblePixels: visible };
  result.uniqueVisibleRGB = unique;
  result.blackVisiblePixels = black;
  result.meanRGB = visible ? rgbMean : null;
  result.populationVarianceRGB = visible ? rgbM2.map((value) => Math.max(0, value / visible)) : null;
  result.meanLuma = visible ? lumaMean : null;
  result.populationVarianceLuma = visible ? Math.max(0, lumaM2 / visible) : null;
  result.lumaExclude = exclude;
  try { result.luma = measureLuma(img, exclude); }
  catch (error) { result.luma = null; result.faults.push(`Existing measureLuma failed: ${error.message}`); }
  if (transparent || partial) result.faults.push('Page PNG is not fully opaque despite omitBackground=false.');
  if (!visible) result.faults.push('PNG contains no visible pixels.');
  else if (black === visible) result.faults.push('Every visible PNG pixel is black.');
  else if (unique < 2 || !result.populationVarianceRGB.some((value) => value > 0))
    result.faults.push('PNG has a single visible RGB colour and no image variance.');
  if (hud) {
    result.unoccludedWorld = { samples: worldSamples, uniqueRGB: worldUnique, blackPixels: worldBlack,
      meanRGB: worldSamples ? worldMean : null,
      populationVarianceRGB: worldSamples ? worldM2.map((value) => Math.max(0, value / worldSamples)) : null };
    if (!worldSamples) result.faults.push('No unoccluded background pixels; PNG apparatus is inconclusive.');
    else if (worldBlack === worldSamples) result.faults.push('Every PNG background pixel outside the HUD is black.');
    else if (worldUnique < 2 || !result.unoccludedWorld.populationVarianceRGB.some((value) => value > 0))
      result.faults.push('PNG background outside the HUD is a single colour with no image variance.');
  }
  return result;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function revisionIdentity() {
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  const rows = status ? status.split('\n') : [];
  // The workflow intentionally downloads its same-build interaction report
  // before motion capture. That report is untracked because shots/ is evidence,
  // not source. Preserve it in the identity record without calling the source
  // revision dirty; every other tracked or untracked change still does.
  const carriedEvidence = rows.filter((row) => /^\?\? shots\/interaction-[\w.-]+\.json$/.test(row));
  const unexpected = rows.filter((row) => !carriedEvidence.includes(row));
  return {
    sha: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    dirty: unexpected.length > 0,
    carriedEvidence: carriedEvidence.map((row) => row.slice(3)),
    unexpectedStatus: unexpected,
  };
}

// Byte-for-byte identical to the identity algorithm in both existing capture tools.
function fingerprintTree(dir) {
  const hash = createHash('sha256');
  const walk = (base, prefix = '') => {
    for (const item of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      const path = join(base, item.name);
      if (item.isDirectory()) walk(path, name);
      else if (item.isFile()) { hash.update(name); hash.update('\0'); hash.update(readFileSync(path)); hash.update('\0'); }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function binary(name, override) {
  const candidates = override ? [String(override)]
    : (process.env.PATH || '').split(delimiter).filter(Boolean).map((dir) => join(dir, name));
  for (const candidate of candidates) {
    const path = resolve(candidate);
    try { accessSync(path, constants.X_OK); return path; } catch { /* try the next installed binary */ }
  }
  throw new Error(`${name} executable unavailable; install it or pass --${name}=<absolute-path>. No video was fabricated.`);
}

function carrySelfCheck(tag, fingerprint) {
  if (typeof tag !== 'string' || !/^[\w.-]+$/.test(tag)) {
    throw new Error('Required: --carry-self-check=<tag>. First run node tools/interaction-capture.mjs --self-check --tag=<tag> against this exact dist/.');
  }
  const path = join(SHOTS, `interaction-${tag}.json`);
  const bytes = readFileSync(path);
  const report = JSON.parse(bytes);
  const checks = report.selfCheck;
  if (report.build?.fingerprint !== fingerprint) throw new Error(`Self-check ${tag} belongs to a different dist fingerprint; re-run the self-check on this build.`);
  if (!checks || checks.carried === false || checks.error) throw new Error(`Self-check ${tag} is missing or unsuccessful.`);
  if (checks.buildFingerprint && checks.buildFingerprint !== fingerprint) throw new Error('Carried self-check chain identifies another build.');
  if (report.profile?.name !== 'phone' || report.profile.tier !== 'medium'
    || report.profile.viewport?.width !== 844 || report.profile.viewport?.height !== 390
    || report.profile.deviceScaleFactor !== 3) throw new Error('Self-check must use the identical phone/MEDIUM profile.');
  for (const key of ['determinism', 'renderSubstitution']) {
    const check = checks[key];
    if (!check || check.identical !== true || check.worstAbsoluteDivergence !== 0 || check.frames < 120)
      throw new Error(`Self-check ${tag}: ${key} must have 120 or more identical measured frames.`);
    for (const column of ['px', 'pz', 'pyaw', 'pspeed']) {
      if (check.columns?.[column] !== 0) throw new Error(`Self-check ${tag}: missing or divergent ${key}.${column}.`);
    }
  }
  const agreement = checks.agreementWithScreenshotRig;
  for (const source of ['measuredHere', 'screenshotRig']) {
    if (!agreement?.[source] || !Number.isFinite(agreement[source].draws) || agreement[source].draws <= 0
      || !Number.isFinite(agreement[source].tris) || agreement[source].tris <= 0)
      throw new Error(`Self-check ${tag}: ${source} screenshot control is missing; generate shots/report.json and repeat the self-check.`);
  }
  if (agreement.measuredHere.tier !== 'medium' || agreement.error || agreement.passed === false)
    throw new Error(`Self-check ${tag}: screenshot control failed or used a different tier.`);
  const screenshotSource = agreement.screenshotRig.source || 'shots/report.json';
  if (!/^shots\/report(?:-[\w.-]+)?\.json$/.test(screenshotSource))
    throw new Error('Self-check names an invalid screenshot-control path.');
  const screenshotPath = join(ROOT, screenshotSource);
  const screenshotBytes = readFileSync(screenshotPath);
  const screenshot = JSON.parse(screenshotBytes);
  if (screenshot.build?.fingerprint !== fingerprint || screenshot.at !== agreement.screenshotRig.tag
    || screenshot.profiles?.phone?.stats?.drawCalls !== agreement.screenshotRig.draws
    || screenshot.profiles?.phone?.stats?.triangles !== agreement.screenshotRig.tris)
    throw new Error('shots/report.json does not identify the same build and screenshot control carried by the self-check.');
  const errors = (report.errors || []).filter((line) => fatalLog(String(line)));
  if (errors.length) throw new Error(`Self-check ${tag} contains runtime/shader errors: ${errors.join(' | ')}`);
  return { from: rel(path), reportSha256: sha256(bytes), at: report.at,
    buildFingerprint: fingerprint, revision: report.revision, checks,
    screenshotControl: { from: rel(screenshotPath), reportSha256: sha256(screenshotBytes), at: screenshot.at,
      buildFingerprint: screenshot.build.fingerprint },
    validation: 'Identical 120-frame determinism and render substitution; both screenshot counters present; no reported runtime/shader/nonfinite errors.',
    screenshotComparison: 'Independent screenshot-rig runtime snapshot from the identical build; exact counter equality is not claimed.' };
}

async function acquireLock() {
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, '.capture.lock');
  const deadline = Date.now() + 120 * 60 * 1000;
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      return () => {
        try { if (readFileSync(path, 'utf8').trim() === String(process.pid)) rmSync(path, { force: true }); } catch { /* already released */ }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let live = false;
      try {
        const owner = Number(readFileSync(path, 'utf8'));
        if (Number.isInteger(owner) && owner > 0) {
          process.kill(owner, 0); live = true;
          if (process.platform === 'linux') live = readFileSync(`/proc/${owner}/cmdline`, 'utf8').includes('capture.mjs');
        }
      } catch { live = false; }
      if (!live) { rmSync(path, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error('capture lock held for over 2 h');
      console.log('[motion] another capture owns shots/.capture.lock; waiting…');
      await new Promise((done) => setTimeout(done, 15000));
    }
  }
}

async function serve() {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  const server = createServer(async (request, response) => {
    try {
      let name = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const path = resolve(DIST, `.${name}`);
      const inside = relative(DIST, path);
      if (inside.startsWith('..') || isAbsolute(inside)) { response.writeHead(403).end(); return; }
      if (!(await stat(path)).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return server;
}

export function motionPlans(layout) {
  if (!layout.gestureSafe) throw new Error('No safe live gesture area; cannot synthesize a reliable touch sequence.');
  const origin = layout.stickOrigin;
  const stick = (f, magnitude) => ({ f, do: 'touchMove', id: 80, x: origin.x,
    y: origin.y - stickOffset(magnitude, layout.stickRadius) });
  const reset = (yaw) => ({ f: 0, do: 'resetEncounter', x: -5, z: 26, yaw, label: 'motion-fixture' });
  return [
    { id: 'locomotion', frames: 120, render: true, dtMs: DT_MS,
      probes: ['player', 'input', 'feet', 'camera', 'stats'],
      actions: [reset(-Math.PI / 2), { f: 1, do: 'clearance', yaw: -Math.PI / 2, label: 'motion-run-up' },
        { f: 2, do: 'touchDown', id: 80, x: origin.x, y: origin.y }, stick(3, 0.55),
        { f: 3, do: 'mark', label: 'walk-input' }, stick(60, 0.92),
        { f: 60, do: 'mark', label: 'run-input' },
        { f: 116, do: 'touchUp', id: 80, x: origin.x, y: origin.y }],
      description: 'Player locomotion and normal following camera: 57 frames walk input, then 56 frames run input, then release.' },
    { id: 'combat', frames: 180, render: true, dtMs: DT_MS,
      probes: ['player', 'input', 'feet', 'camera', 'enemies', 'emotion', 'blade', 'stats'],
      actions: [reset(0),
        { f: 1, do: 'call', target: 'enemies', method: 'spawnWave', args: [1,
          { seed: 0x77aa, alerted: true, archetypes: ['ashigaru'], radius: 2.8 }] },
        { f: 2, do: 'lockIfFree' },
        // The aggressive-v2 script approaches, guards and attacks only through
        // real DOM input. The prior fixed tap/flick timeline stayed outside an
        // enemy hit volume and captured no actual combat reaction.
        { f: 3, do: 'bot', on: true, policy: 'aggressive' },
        { f: 3, do: 'mark', label: 'scripted-input-combat' },
        { f: 178, do: 'bot', on: false }],
      conditions: { playerScript: 'aggressive-v2', reactionFloorMs: 200,
        inputPath: 'DOM pointer and registered guard zone', injectedCombatState: false },
      description: 'One alerted AI enemy and real lock-on. The aggressive-v2 player script approaches, guards and attacks through DOM input; no attack, hit or reaction state is injected.' },
  ];
}

async function boot(context, base, logs) {
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) logs.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.stack || error.message}`));
  page.on('crash', () => logs.push('crash: browser page crashed'));
  await page.addInitScript({ path: RUNTIME });
  const started = Date.now();
  const ticker = setInterval(() => console.log(`[motion] boot waiting ${(Date.now() - started) / 1000}s`), 20000);
  try {
    await page.goto(`${base}/index.html?autostart&q=medium&capture`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__kagerouReady === true, undefined, { timeout: 600000, polling: 500 });
  } finally { clearInterval(ticker); }
  const info = await page.evaluate(() => {
    const k = window.__kagerou, h = window.__kh;
    if (!k || !h) throw new Error('Explicit capture hooks or harness unavailable.');
    window.__kagerouStart?.();
    if (!document.getElementById('boot')?.classList.contains('hidden')) throw new Error('Boot veil remained visible.');
    // Cancel the native engine callback before locking, then queue exactly one
    // virtual callback. No native RAF can add an unrecorded gameplay step later.
    k.engine.stop();
    h.lock();
    k.engine.start();
    k.menus?.skipIntro?.(); k.menus?.resume?.();
    k.debugCam?.('off');
    h.installTaps();
    if (!k.engine.pipeline || k.quality?.name !== 'medium') throw new Error('Expected real pipeline and MEDIUM tier.');
    const data = { renderCalls: 0, lastRenderFrame: null, previousFeet: {}, setupEngineFrame: k.engine.frame };
    const render = k.engine.pipeline.render;
    k.engine.pipeline.render = function (...args) {
      const result = render.apply(this, args);
      data.renderCalls++;
      data.lastRenderFrame = k.engine.frame;
      return result;
    };
    window.__motionCapture = data;
    const gl = k.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { layout: h.layout(), engineFrameBeforeCapture: k.engine.frame,
      contextAttributes: gl.getContextAttributes(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      cssViewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], quality: k.quality.name };
  });
  if (!/swiftshader/i.test(info.renderer)) throw new Error(`Requested SwiftShader but observed renderer ${info.renderer}.`);
  return { page, info };
}

// Sampling happens after the same engine callback that produced the PNG. The
// existing harness trace is also retained, with its documented pre-step semantics.
async function sampleFrame(page, frame, scenario) {
  return page.evaluate(({ frame, scenario }) => {
    const k = window.__kagerou, h = window.__kh, capture = window.__motionCapture;
    const faults = [];
    const finite = (value, label) => { if (!Number.isFinite(value)) faults.push(`nonfinite ${label}`); return value; };
    const xyz = (v, label) => [finite(v.x, `${label}.x`), finite(v.y, `${label}.y`), finite(v.z, `${label}.z`)];
    const scratch = k.player.position.clone();
    const extent = (rig) => {
      const names = ['head', 'footL', 'footR', 'handL', 'handR'];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity, seen = 0;
      for (const name of names) {
        const bone = rig?.bones?.[name];
        if (!bone) continue;
        bone.getWorldPosition(scratch);
        if (name === 'head') scratch.y += 0.2 * (rig.scale || 1);
        if (name.startsWith('foot')) scratch.y -= 0.085 * (rig.scale || 1);
        scratch.project(k.camera);
        finite(scratch.x, `${name}.ndc.x`); finite(scratch.y, `${name}.ndc.y`); finite(scratch.z, `${name}.ndc.z`);
        minX = Math.min(minX, scratch.x); maxX = Math.max(maxX, scratch.x);
        minY = Math.min(minY, scratch.y); maxY = Math.max(maxY, scratch.y);
        minZ = Math.min(minZ, scratch.z); maxZ = Math.max(maxZ, scratch.z); seen++;
      }
      if (!seen) { faults.push('rig body landmarks absent'); return null; }
      return { minX, maxX, minY, maxY, minZ, maxZ, landmarks: seen,
        inside: minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1 && minZ >= -1 && maxZ <= 1 };
    };
    const entity = (e) => {
      const rig = e.rig;
      const feet = {};
      for (const [side, name, index] of [['left', 'footL', 1], ['right', 'footR', 0]]) {
        const bone = rig?.bones?.[name];
        if (!bone) { faults.push(`entity ${e.id} missing ${name}`); continue; }
        bone.getWorldPosition(scratch);
        const world = xyz(scratch, `${e.id}.${name}`);
        const ray = k.physics.raycastDown(world[0], e.position.y + 2.5, world[2], 8, 17);
        const groundY = ray?.hit ? finite(ray.point.y, `${e.id}.${name}.ground`) : null;
        const normal = ray?.hit ? xyz(ray.normal, `${e.id}.${name}.normal`) : null;
        const key = `${scenario}:${e.id}:${side}`, previous = capture.previousFeet[key];
        const clearance = groundY === null ? null : world[1] - groundY;
        feet[side] = { world, groundY, groundNormal: normal, ankleClearanceM: clearance,
          horizontalDriftM: previous ? Math.hypot(world[0] - previous.world[0], world[2] - previous.world[2]) : null,
          verticalClearanceChangeM: previous?.clearance != null && clearance !== null ? clearance - previous.clearance : null,
          rigStance: !!rig._footLocked?.[index],
          rigTarget: rig._footTarget?.[index] ? xyz(rig._footTarget[index], `${e.id}.${name}.target`) : null };
        capture.previousFeet[key] = { world, clearance };
      }
      const move = e.currentMove;
      return { id: e.id, archetype: e.archetype ?? 'player', state: e.state, health: finite(e.health, `${e.id}.health`),
        position: xyz(e.position, `${e.id}.position`), velocity: xyz(e.velocity, `${e.id}.velocity`),
        grounded: e.grounded ?? rig?.grounded ?? null, speed: e.speed ?? null,
        weaponActive: !!e.weapon?.active, attackTime: Number.isFinite(e.attackTime) ? e.attackTime : null,
        move: move ? { id: move.id, startup: move.startup, active: move.active, recovery: move.recovery } : null,
        animation: (rig?.layers || []).map((layer) => ({ name: layer.name, clip: layer.clip?.name ?? null,
          sourceTime: finite(layer.time, `${e.id}.${layer.name}.time`), attackTimed: !!layer.attackTimed,
          attackTime: Number.isFinite(layer.attackTime) ? layer.attackTime : null, weight: finite(layer.weight, `${e.id}.${layer.name}.weight`) })),
        locoPhase: rig ? finite(rig.locoPhase, `${e.id}.locoPhase`) : null, feet, ndcBounds: extent(rig) };
    };
    k.scene.traverse((object) => {
      if (!object.matrixWorld.elements.every(Number.isFinite)) faults.push(`nonfinite matrix ${object.name || object.type}`);
    });
    if (!k.camera.matrixWorld.elements.every(Number.isFinite) || !k.camera.projectionMatrix.elements.every(Number.isFinite))
      faults.push('nonfinite camera matrix');
    const gl = k.renderer.getContext();
    gl.finish();
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) faults.push(`WebGL error ${glError}`);
    if (gl.isContextLost()) faults.push('WebGL context lost');
    const deadPrograms = [];
    for (const program of k.renderer.info.programs || []) {
      if (!program.program) continue;
      const linked = gl.getProgramParameter(program.program, gl.LINK_STATUS);
      const uniforms = gl.getProgramParameter(program.program, gl.ACTIVE_UNIFORMS);
      if (!linked || uniforms === 0) deadPrograms.push({ name: program.name, linked, uniforms });
    }
    if (deadPrograms.length) faults.push('shader program failed the existing link/active-uniform audit');
    const player = entity(k.player), enemies = k.enemies.list.map(entity);
    const events = h.events.filter((event) => event.f === frame);
    for (const event of events) if (event.name === 'frame-error' || event.name === 'harness-error') faults.push(`${event.name}: ${event.message}`);
    if (capture.lastRenderFrame !== k.engine.frame) faults.push('engine frame did not complete the real rendering pipeline');
    if (k.quality.name !== 'medium') faults.push('quality changed from MEDIUM');
    if (k.engine.stats.drawCalls <= 0 || k.engine.stats.triangles <= 0) faults.push('frame has no rendered geometry');
    let hudCapture = null;
    try {
      const hud = k.hud?.canvas;
      if (!hud || hud !== document.getElementById('kagerou-hud') || k.hud.g?.canvas !== hud)
        throw new Error('Expected the real HUD 2D canvas.');
      const bounds = hud.getBoundingClientRect(), style = getComputedStyle(hud);
      if (style.transform !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal')
        throw new Error('HUD CSS transform/filter/blending prevents alpha mapping.');
      for (const id of ['boot', 'rotate', 'fatal']) {
        const element = document.getElementById(id);
        if (!element) continue;
        const css = getComputedStyle(element);
        if (css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0)
          throw new Error(`DOM ${id} veil covers the game.`);
      }
      // This is the independent, persistent 2D overlay, not a WebGL canvas read.
      // It masks HUD pixels only; every colour measurement comes from the PNG.
      hudCapture = { dataUrl: hud.toDataURL('image/png'), bitmap: [hud.width, hud.height],
        bounds: [bounds.left, bounds.top, bounds.width, bounds.height],
        viewport: [innerWidth, innerHeight], transform: style.transform };
    } catch (error) { faults.push(`HUD exclusion apparatus inconclusive: ${error.message}`); }
    return { frame, presentationTimeSec: frame / 60, virtualNowMs: finite(h.virtualNow, 'virtualNow'),
      engineFrame: k.engine.frame, elapsedGameSec: finite(k.engine.elapsed, 'engine.elapsed'),
      timeScale: finite(k.engine.timeScale, 'engine.timeScale'), completedRenderCalls: capture.renderCalls,
      camera: { position: xyz(k.camera.position, 'camera'), fov: finite(k.camera.fov, 'camera.fov') },
      render: { drawCalls: k.engine.stats.drawCalls, triangles: k.engine.stats.triangles,
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], deadPrograms },
      input: { moveMag: k.input.state.moveMag, usingTouch: k.input.usingTouch, inputEnabled: k.input.enabled },
      player, enemies, events, faults, _hudCapture: hudCapture };
  }, { frame, scenario });
}

async function encode(ffmpeg, ffprobe, directory, target, count) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-start_number', '0',
    '-i', join(directory, 'frame-%04d.png'), '-frames:v', String(count), '-an', '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough',
    '-video_track_timescale', '60000', '-movflags', '+faststart', target];
  await new Promise((done, reject) => {
    const child = spawn(ffmpeg, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (bytes) => { errorText += bytes.toString(); if (errorText.length > 20000) errorText = errorText.slice(-20000); });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`ffmpeg failed (${code ?? signal}): ${errorText}`)));
  });
  const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames,duration', '-of', 'json', target],
  { encoding: 'utf8', timeout: 120000 }));
  const stream = info.streams?.[0];
  if (!stream || Number(stream.nb_read_frames) !== count || stream.avg_frame_rate !== '60/1'
    || Math.abs(Number(stream.duration) - count / FPS) > 0.0001
    || stream.width !== PROFILE.viewport.width * PROFILE.deviceScaleFactor
    || stream.height !== PROFILE.viewport.height * PROFILE.deviceScaleFactor)
    throw new Error(`Encoded frame count, timebase or native size differs from capture: ${JSON.stringify(stream)}`);
  return { file: rel(target), sha256: sha256(readFileSync(target)), ffmpegArgs: args, probe: stream,
    retiming: 'None: one consecutive rendered PNG per 1/60 s virtual interval, no interpolation, duplicated frames or decimation.' };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifestPath = join(OUT, 'manifest.json');
  if (existsSync(manifestPath) && !argv.replace) throw new Error('shots/motion-r17/manifest.json exists; use --replace to replace this exact capture intentionally.');
  const manifest = { schemaVersion: 1, tool: 'tools/motion-capture.mjs', at: new Date().toISOString(), status: 'preflight',
    criterion: 'BM-VIS-04', visualVerdict: 'pending independent critic', profile: PROFILE,
    frameBudget: FRAME_BUDGET, fps: FPS, dtMs: DT_MS, videos: {}, scenarios: {}, errors: [],
    limitations: ['SwiftShader software rendering is not phone performance evidence.',
      'The clock advances at virtual 60 Hz; wall rendering time is recorded separately. Game hit-stop timeScale remains active.',
      'DOM PointerEvents/KeyboardEvents use the existing harness, not hardware digitizer input or a human player.',
      'Capture-only encounter reset and enemy spawn set up the sample; movement, targeting and attacks go through actual gameplay systems.',
      'Audio is muted and omitted because Web Audio runs on its real clock; this video cannot judge audio timing.',
      'Foot metadata contains measured world positions and ground rays; rig stance flags are diagnostic, not an independent foot-contact verdict.',
      'Native page PNGs include the actual phone-profile viewport and HUD. No crop, camera substitution or frame resizing is applied.',
      'PNG apparatus checks require native size, opacity and nonzero RGB variation in both the frame and pixels outside the actual HUD alpha. They do not establish visual quality.',
      'Two separate contiguous clips have an explicit encounter-reset cut between them; no simulation intervals inside a clip are removed.'] };
  const flush = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  let release = () => {}, server = null, browser = null, temporary = null;
  const signal = (name) => { manifest.status = 'fail'; manifest.errors.push(`Interrupted by ${name}`); flush(); release(); process.exit(name === 'SIGINT' ? 130 : 143); };
  const interrupt = () => signal('SIGINT'), terminate = () => signal('SIGTERM');
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try {
    if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/index.html missing; build separately before running motion capture.');
    manifest.revision = revisionIdentity();
    manifest.build = { fingerprint: fingerprintTree(DIST) };
    manifest.harness = { file: rel(RUNTIME), sha256: sha256(readFileSync(RUNTIME)) };
    manifest.pngApparatus = { decoder: '.kit/lib/image/png.mjs', measurement: '.kit/lib/image/measure.mjs',
      decoderSha256: sha256(readFileSync(join(ROOT, '.kit/lib/image/png.mjs'))),
      measurementSha256: sha256(readFileSync(join(ROOT, '.kit/lib/image/measure.mjs'))),
      lumaComparison: 'Each row.png.luma uses the same measureLuma(decodedPNG, []) as the existing screenshot tool.',
      hudMask: 'Read the real kagerou-hud 2D bitmap to exclude nonzero alpha; never read the WebGL canvas. Retain mask sidecars with representative and failed PNGs.',
      thresholds: 'Exact apparatus conditions only: dimensions, full opacity, at least two RGB values and positive RGB variance. No exposure or art threshold.' };
    manifest.selfCheck = carrySelfCheck(argv['carry-self-check'], manifest.build.fingerprint);
    const ffmpeg = binary('ffmpeg', argv.ffmpeg), ffprobe = binary('ffprobe', argv.ffprobe);
    const encoders = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!/\blibx264\b/.test(encoders)) throw new Error('Installed ffmpeg has no libx264 encoder.');
    manifest.encoder = { ffmpeg, ffprobe,
      version: execFileSync(ffmpeg, ['-version'], { encoding: 'utf8', timeout: 10000 }).split('\n')[0] };
    flush();
    release = await acquireLock();
    process.once('exit', release);
    if (fingerprintTree(DIST) !== manifest.build.fingerprint) throw new Error('dist changed while waiting for capture lock.');
    server = await serve();
    browser = await chromium.launch({ args: ARGS,
      ...(argv.browser ? { executablePath: String(argv.browser) } : {}) });
    const context = await browser.newContext({ viewport: PROFILE.viewport, deviceScaleFactor: PROFILE.deviceScaleFactor,
      isMobile: PROFILE.isMobile, hasTouch: PROFILE.hasTouch, userAgent: PROFILE.userAgent, colorScheme: 'dark' });
    manifest.browser = { version: browser.version(), args: ARGS };
    const { page, info } = await boot(context, `http://127.0.0.1:${server.address().port}`, manifest.errors);
    manifest.boot = info;
    temporary = mkdtempSync(join(OUT, '.frames-'));
    const sequences = motionPlans(info.layout);
    if (sequences.reduce((sum, plan) => sum + plan.frames, 0) > FRAME_BUDGET) throw new Error('Plan exceeds 300-frame budget.');
    manifest.status = 'capturing'; flush();
    for (const plan of sequences) {
      const directory = join(temporary, plan.id);
      mkdirSync(directory);
      const record = { plan, frames: [], representatives: [], startedAt: new Date().toISOString() };
      manifest.scenarios[plan.id] = record;
      const start = await page.evaluate((plan) => {
        const h = window.__kh, k = window.__kagerou;
        if (h.mode !== 'locked') throw new Error('Virtual clock was released unexpectedly.');
        const begun = h.begin(plan);
        if (!begun.ok) throw new Error(begun.error);
        window.__motionCapture.previousFeet = {};
        return { engineFrame: k.engine.frame, virtualNow: h.virtualNow, renderCalls: window.__motionCapture.renderCalls };
      }, plan);
      record.start = start;
      const started = Date.now();
      const representativeKinds = new Set();
      for (let frame = 0; frame < plan.frames; frame++) {
        const step = await page.evaluate(() => window.__kh.advance(1));
        if (!step.ok || step.frame !== frame + 1) throw new Error(`Frame advance failed in ${plan.id}: ${JSON.stringify(step)}`);
        const row = await sampleFrame(page, frame, plan.id);
        const hudCapture = row._hudCapture;
        delete row._hudCapture;
        record.frames.push(row);
        if (row.engineFrame !== start.engineFrame + frame + 1 || row.completedRenderCalls !== start.renderCalls + frame + 1)
          throw new Error(`${plan.id} frame ${frame}: missing or extra simulation/render callback.`);
        if (Math.abs(row.virtualNowMs - start.virtualNow - (frame + 1) * DT_MS) > 0.001)
          throw new Error(`${plan.id} frame ${frame}: virtual timestep changed.`);
        const errors = [...row.faults, ...manifest.errors.filter(fatalLog)];
        if (errors.length) throw new Error(`${plan.id} frame ${frame}: ${errors.join(' | ')}`);
        const path = join(directory, `frame-${String(frame).padStart(4, '0')}.png`);
        const bytes = await page.screenshot({ path, type: 'png', scale: 'device', animations: 'allow', caret: 'initial', timeout: 240000 });
        row.pngSha256 = sha256(bytes);
        const { dataUrl, ...hudMetadata } = hudCapture;
        if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('HUD alpha bitmap is not a PNG data URL.');
        const hudBytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        row.png = inspectMotionPNG(bytes, { hud: { ...hudMetadata, png: hudBytes } });
        if (row.png.faults.length) {
          const failure = join(OUT, `${plan.id}-apparatus-fail-${String(frame).padStart(3, '0')}.png`);
          copyFileSync(path, failure);
          const mask = failure.replace(/\.png$/, '-hud.png');
          writeFileSync(mask, hudBytes);
          record.representatives.push({ label: 'apparatus-fail', frame, file: rel(failure),
            sha256: row.pngSha256, hud: { ...hudMetadata, file: rel(mask), sha256: sha256(hudBytes) } });
          throw new Error(`${plan.id} frame ${frame}: PNG apparatus FAIL: ${row.png.faults.join(' | ')}`);
        }
        const after = await page.evaluate(() => ({ engineFrame: window.__kagerou.engine.frame, virtualNow: window.__kh.virtualNow }));
        if (after.engineFrame !== row.engineFrame || after.virtualNow !== row.virtualNowMs)
          throw new Error(`${plan.id} frame ${frame}: screenshot advanced simulation.`);
        const labels = [];
        if (frame === (plan.id === 'locomotion' ? 40 : 0)) labels.push(plan.id === 'locomotion' ? 'walk' : 'combat-setup');
        if (plan.id === 'locomotion' && frame === 100) labels.push('run');
        if (row.enemies.some((e) => e.state === 'attack' && !e.weaponActive && e.move && e.attackTime < e.move.startup)) labels.push('enemy-startup');
        if (row.enemies.some((e) => e.weaponActive)) labels.push('enemy-active');
        if (row.events.some((e) => ['hit', 'damage-taken', 'parry', 'clash'].includes(e.name))) labels.push('reaction');
        for (const label of labels) {
          if (representativeKinds.has(label)) continue;
          representativeKinds.add(label);
          const destination = join(OUT, `${plan.id}-${label}-${String(frame).padStart(3, '0')}.png`);
          copyFileSync(path, destination);
          const mask = destination.replace(/\.png$/, '-hud.png');
          writeFileSync(mask, hudBytes);
          record.representatives.push({ label, frame, file: rel(destination), sha256: row.pngSha256,
            hud: { ...hudMetadata, file: rel(mask), sha256: sha256(hudBytes) } });
        }
        if ((frame + 1) % 30 === 0) {
          record.wallMs = Date.now() - started;
          flush();
          console.log(`[motion] ${plan.id} ${frame + 1}/${plan.frames} rendered PNGs; ${(record.wallMs / 1000).toFixed(1)}s wall, ${((frame + 1) / FPS).toFixed(2)}s virtual`);
          if (fingerprintTree(DIST) !== manifest.build.fingerprint) throw new Error('dist changed during capture.');
        }
      }
      record.trace = await page.evaluate(() => window.__kh.finish());
      if (record.trace.failedActions.length) throw new Error(`${plan.id}: ${record.trace.failedActions.length} harness actions failed.`);
      record.wallMs = Date.now() - started;
      record.coverage = {
        playerBodyInFrame: record.frames.filter((row) => row.player.ndcBounds?.inside).length,
        frames: record.frames.length,
        enemyStartupFrames: record.frames.filter((row) => row.enemies.some((e) => e.state === 'attack' && e.move && e.attackTime < e.move.startup)).length,
        enemyActiveFrames: record.frames.filter((row) => row.enemies.some((e) => e.weaponActive)).length,
        reactionEvents: record.trace.events.filter((event) => ['hit', 'damage-taken', 'parry', 'clash'].includes(event.name)),
        enemyActiveClippedFrames: record.frames.filter((row) => row.enemies.some((e) => e.weaponActive && !e.ndcBounds?.inside)).length,
      };
      if (plan.id === 'locomotion') {
        record.coverage.movement = [['walk', 35, 55, 1.9], ['run', 90, 112, 5.4]].map(([name, a, b, expected]) => {
          const speeds = [];
          for (let f = a; f <= b; f++) {
            const p = record.frames[f].player.position, q = record.frames[f - 1].player.position;
            speeds.push(Math.hypot(p[0] - q[0], p[2] - q[2]) * FPS);
          }
          speeds.sort((a, b) => a - b);
          const median = speeds[Math.floor(speeds.length / 2)];
          return { name, fromFrame: a, toFrame: b, expectedMps: expected, medianWorldMps: median,
            withinAuthoredFivePercent: Math.abs(median / expected - 1) <= 0.05 };
        });
      }
      const firstActive = record.frames.find((row) => row.enemies.some((enemy) => enemy.weaponActive))?.frame;
      const enemyIds = new Set(record.frames.flatMap((row) => row.enemies.map((enemy) => enemy.id)));
      record.coverage.enemyReactionEvents = record.coverage.reactionEvents.filter((event) =>
        firstActive !== undefined && event.f >= firstActive && (enemyIds.has(event.attacker?.id)
          || enemyIds.has(event.a?.id) || enemyIds.has(event.b?.id)
          || (event.name === 'damage-taken' && event.entity?.id === record.frames[0].player.id)));
      manifest.videos[plan.id] = await encode(ffmpeg, ffprobe, directory, join(OUT, `${plan.id}.mp4`), plan.frames);
      rmSync(directory, { recursive: true, force: true });
      if (record.coverage.playerBodyInFrame !== plan.frames || record.coverage.enemyActiveClippedFrames > 0)
        throw new Error(`${plan.id}: body landmarks leave the viewport; inspect the preserved native PNGs and framing metadata.`);
      if (plan.id === 'locomotion' && record.coverage.movement.some((measurement) => !measurement.withinAuthoredFivePercent))
        throw new Error('Locomotion clip did not achieve the actual authored walk and run speeds; inspect world-position measurements.');
      if (plan.id === 'combat' && (!record.coverage.enemyStartupFrames || !record.coverage.enemyActiveFrames || !record.coverage.enemyReactionEvents.length))
        throw new Error('Combat clip did not contain a real enemy startup, damaging window and impact reaction; preserved video is incomplete evidence.');
      flush();
    }
    if (fingerprintTree(DIST) !== manifest.build.fingerprint) throw new Error('dist changed before capture completed.');
    if (sha256(readFileSync(RUNTIME)) !== manifest.harness.sha256) throw new Error('Harness runtime changed during capture.');
    manifest.status = 'captured';
    manifest.completedAt = new Date().toISOString();
    manifest.totalRenderedFrames = Object.values(manifest.scenarios).reduce((sum, record) => sum + record.frames.length, 0);
    manifest.independentReviewRequired = true;
    flush();
    console.log(`[motion] Captured ${manifest.totalRenderedFrames} consecutive 60 Hz frames in two MP4s. Visual verdict remains pending. ${rel(manifestPath)}`);
  } catch (error) {
    manifest.status = 'fail';
    manifest.errors.push(error.stack || String(error));
    flush();
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    if (server) await new Promise((done) => server.close(done));
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    release();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`[motion] FAIL: ${error.message}`); process.exitCode = 1; });
}
