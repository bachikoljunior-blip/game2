#!/usr/bin/env node
/**
 * interaction-capture.mjs — the interaction review rig.
 *
 * The screenshot rig (tools/capture.mjs) can photograph the game; it cannot play it.
 * Twelve of the sixteen elements in AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml have never
 * been verified at all for exactly that reason: combat feel, movement, camera behaviour,
 * animation timing, touch misfire, audio level and AI legibility are invisible to a still
 * frame by construction. This rig is the missing apparatus. It drives the built game
 * through scripted play at a fixed simulation timestep, records what happened, and writes
 * traces that tools/interaction-metrics.mjs turns into per-criterion verdicts.
 *
 *   node tools/interaction-capture.mjs --tag=r1
 *   node tools/interaction-capture.mjs --scenarios=move-speeds,touch-drags
 *   node tools/interaction-capture.mjs --self-check       # apparatus validation only
 *
 * What it deliberately does NOT claim:
 *   - it is not a human playing, and no number here is a play test;
 *   - it renders under SwiftShader, so nothing here is device performance evidence;
 *   - it measures our own build against our own thresholds, never against reference
 *     footage, which this container has never had.
 *
 * Apparatus first. `--self-check` runs three validations before any verdict is believed:
 * determinism (same scenario twice), the render substitution (the same scenario with the
 * real post pipeline and with the matrix-only stub), and agreement with the trusted
 * screenshot rig on draw calls and triangles at an identical pose. This project has had
 * five separate rounds ruined by an apparatus fault reported as a game defect.
 */

import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

import { buildPlans } from './interaction-scenarios.mjs';
import { evaluateAll, summarise } from './interaction-metrics.mjs';
import { decodePNG } from './luma.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const RUNTIME = join(ROOT, 'tools', 'harness', 'runtime.js');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const TAG = argv.tag ? String(argv.tag) : 'i1';
const TRACE_DIR = join(OUT, `interaction-${TAG}`);
const BOOT_TIMEOUT = Number(argv['boot-timeout']) || 420000;
const CHUNK = 300;                       // frames per evaluate — keeps progress visible

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

function serve(root, port) {
  return new Promise((res) => {
    const server = createServer(async (req, rq) => {
      try {
        let p = normalize(decodeURIComponent(req.url.split('?')[0]));
        if (p === '/' || p.endsWith('/')) p += 'index.html';
        const file = join(root, p);
        if (!file.startsWith(root)) { rq.writeHead(403).end(); return; }
        const s = await stat(file).catch(() => null);
        if (!s || !s.isFile()) { rq.writeHead(404).end('not found'); return; }
        rq.writeHead(200, {
          'content-type': MIME[extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store',
        }).end(await readFile(file));
      } catch (e) { rq.writeHead(500).end(String(e)); }
    });
    server.listen(port, '127.0.0.1', () => res(server));
  });
}

/**
 * The same lock file the screenshot rig takes, on purpose.
 *
 * Both rigs saturate the single SwiftShader thread, and two of them running at once is
 * how a 200 s boot became a 639 s boot and then a timeout. The staleness check keys off
 * the owner's command line containing `capture.mjs` — which `interaction-capture.mjs`
 * also contains, so each rig recognises the other as a live owner rather than reclaiming
 * its lock. That is deliberate; do not "fix" the substring.
 */
async function acquireLock() {
  const lock = join(OUT, '.capture.lock');
  mkdirSync(OUT, { recursive: true });
  const deadline = Date.now() + 120 * 60 * 1000;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return () => { try { rmSync(lock, { force: true }); } catch { /* ignore */ } };
    } catch {
      let ownerLive = false;
      try {
        const owner = Number(readFileSync(lock, 'utf8'));
        process.kill(owner, 0);
        ownerLive = true;
        if (process.platform === 'linux') {
          const cmdline = readFileSync(`/proc/${owner}/cmdline`, 'utf8').replaceAll('\0', ' ');
          ownerLive = cmdline.includes('capture.mjs');
        }
      } catch { ownerLive = false; }
      if (!ownerLive) { rmSync(lock, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error('capture lock held for over 2 h');
      console.log('[interaction] another rig holds the capture lock; waiting…');
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
}

function gitText(args, fallback = null) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return fallback; }
}

function fingerprintTree(dir) {
  const hash = createHash('sha256');
  const walk = (base, rel = '') => {
    for (const e of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const p = join(base, e.name);
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) { hash.update(r); hash.update('\0'); hash.update(readFileSync(p)); hash.update('\0'); }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

const PROFILE = {
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true,
  hasTouch: true, userAgent: devices['iPhone 13'].userAgent, tier: 'medium',
};

// ------------------------------------------------------------------- page steps

async function bootGame(context, base, logs) {
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => {
    const stack = (e.stack || '').split('\n').slice(1, 4).map((l) => l.trim()).join(' | ');
    logs.push(`pageerror: ${e.message}${stack ? ' @ ' + stack : ''}`);
  });
  await page.addInitScript({ path: RUNTIME });
  const t0 = Date.now();
  console.log(`[interaction] loading ${base}`);
  await page.goto(`${base}?autostart&q=${PROFILE.tier}&capture`, { waitUntil: 'load', timeout: 120000 });
  // Report which boot step we are on rather than sitting silent for minutes: a stall is
  // the difference between "SwiftShader is slow" and "the harness broke the page", and
  // the last run cost twenty-five minutes to not answer that.
  const ticker = setInterval(async () => {
    const step = await page.evaluate(() => document.getElementById('boot-status')?.textContent || '(none)').catch(() => '(unreachable)');
    console.log(`[interaction] booting ${((Date.now() - t0) / 1000).toFixed(0)}s — step "${step}"`);
  }, 20000);
  try {
    await page.waitForFunction('window.__kagerouReady === true', undefined, { timeout: BOOT_TIMEOUT, polling: 500 });
  } finally { clearInterval(ticker); }
  const started = await page.evaluate(() => {
    void window.__kagerouStart?.();
    return document.getElementById('boot')?.classList.contains('hidden') === true;
  });
  if (!started) logs.push('start failed: the boot veil stayed visible');
  console.log(`[interaction] boot ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // A few real frames so the first simulated frame is not also the first shader compile.
  await page.waitForTimeout(1500);
  const harness = await page.evaluate(() => !!window.__kh && window.__kh.installTaps());
  if (!harness) logs.push('harness runtime did not attach');
  return page;
}

/** World state each scenario starts from, so one run cannot contaminate the next. */
async function resetWorld(page, home, opts = {}) {
  await page.evaluate(({ home: h, skipIntro, render }) => {
    const k = window.__kagerou;
    if (!k) return;
    if (skipIntro) { k.menus?.skipIntro?.(); k.menus?.resume?.(); }
    k.enemies?.despawnAll?.();
    k.debugCam?.('off');
    k.input?.releaseAll?.();
    if (k.player && h) {
      k.player.root.position.set(h[0], h[1], h[2]);
      k.player.controller?.teleport?.(h[0], h[1], h[2]);
      k.player.controller?.setPosition?.(k.player.root.position);
      k.player.velocity?.set?.(0, 0, 0);
      k.player.health = k.player.maxHealth;
      k.player.posture = 0;
      k.player.stamina = k.player.maxStamina;
      k.player.isAlive = true;
    }
    if (k.playerCamera) { k.playerCamera.enabled = true; k.playerCamera.lockTarget = null; k.playerCamera.shakeScale = 1; k.playerCamera.snap?.(); }
    // The settling frames below are stepped, and a *drawn* frame costs 8.7 s here against
    // 1.5 ms simulated. Settling with the real pipeline attached spent four and a half
    // minutes per scenario producing pixels nobody looks at. Only the pixel extras ask
    // for `render: true`.
    window.__kh.setRender(render === true);
  }, { home, skipIntro: opts.skipIntro !== false, render: opts.render === true });
  await page.evaluate(() => window.__kh.pump(30));
}

async function runPlan(page, plan) {
  const begun = await page.evaluate((p) => window.__kh.begin(p), plan);
  if (!begun.ok) throw new Error(`begin(${plan.id}) failed: ${begun.error}`);
  let done = false;
  const t0 = Date.now();
  while (!done) {
    const r = await page.evaluate((n) => window.__kh.advance(n), CHUNK);
    if (!r.ok) throw new Error(`advance(${plan.id}) failed: ${r.error}`);
    done = r.done;
    process.stdout.write(`\r[interaction] ${plan.id}: ${r.frame}/${plan.frames} frames`);
  }
  const trace = await page.evaluate(() => window.__kh.finish());
  const secs = (Date.now() - t0) / 1000;
  console.log(`\r[interaction] ${plan.id}: ${trace.frames} frames in ${secs.toFixed(1)}s wall ` +
    `(${(trace.frames / secs).toFixed(1)} fps sim), ${trace.events.length} events` +
    (trace.failedActions.length ? `, ${trace.failedActions.length} FAILED ACTIONS` : ''));
  trace.plan = { id: plan.id, criteria: plan.criteria, frames: plan.frames, probes: plan.probes, actions: plan.actions.length };
  return trace;
}

// ------------------------------------------------------------------------ extras

/** Touch-target geometry, read from the live HUD zone registry rather than from source. */
async function zoneAudit(page) {
  return page.evaluate(() => {
    const k = window.__kagerou;
    const zones = (k.input?._zones || []).map((z) => {
      const r = z.rect?.() || null;
      return r ? { name: z.name, mode: z.mode, x: r.x, y: r.y, w: r.w, h: r.h } : { name: z.name, mode: z.mode, rect: null };
    });
    const W = window.innerWidth, H = window.innerHeight;
    const EDGE = 16;                      // px of OS edge-gesture margin to stay clear of
    const withRect = zones.filter((z) => z.w);
    // The registered rect is the *padded* hit zone (ARCHITECTURE.md §6 asks for ≥ 48 px
    // visible padded to ≥ 64). Judging the edge margin on the padded rect flags a control
    // whose visible circle is comfortably inside the screen, so the visual geometry is
    // read from TouchControls where it is available and the padded rect is reported
    // beside it rather than instead of it.
    const buttons = (window.__kagerou.hud?.touch?.buttons || []).map((b) => ({
      name: b.name, cx: b.cx, cy: b.cy, visualRadius: b.r, hitRadius: b.hit,
    }));
    const outside = buttons.filter((b) =>
      b.cx - b.visualRadius < EDGE || b.cy - b.visualRadius < EDGE ||
      b.cx + b.visualRadius > W - EDGE || b.cy + b.visualRadius > H - EDGE);
    return {
      viewport: { w: W, h: H },
      zones,
      buttons,
      smallestVisualDiameterPx: buttons.length ? Math.min(...buttons.map((b) => b.visualRadius * 2)) : null,
      smallestHitDiameterPx: buttons.length ? Math.min(...buttons.map((b) => b.hitRadius * 2)) : null,
      zonesInsideEdgeMargin: buttons.length
        ? outside.length
        : withRect.filter((z) => z.x < EDGE || z.y < EDGE || z.x + z.w > W - EDGE || z.y + z.h > H - EDGE).length,
      edgeMarginBasis: buttons.length ? 'visible control geometry' : 'padded hit rect (visual geometry unavailable)',
      paddedRectsCrossingMargin: withRect.filter((z) => z.x < EDGE || z.y < EDGE || z.x + z.w > W - EDGE || z.y + z.h > H - EDGE).length,
      edgeMarginPx: EDGE,
    };
  });
}

/**
 * JS cost per frame, with no enemies and with three engaged.
 *
 * Not originally planned. It exists because a combat scenario ran roughly 800× slower
 * than the same harness with no enemies, and running the rig at all required knowing
 * whether that was the apparatus or the game. It is the game: the cost is pure JS in the
 * physics narrow phase, so it is not a SwiftShader artifact — the same V8 does an
 * enemy-free frame in under 2 ms. Reported as a first-class measurement rather than left
 * in a scratchpad, because it is the largest thing this rig found.
 */
async function jsFrameCost(page, home) {
  const out = {};
  await page.evaluate(() => { window.__kagerou.enemies?.despawnAll?.(); });
  await page.evaluate(() => window.__kh.pump(10));
  out.noEnemies = await page.evaluate(() => window.__kh.profile(120));
  out.noEnemiesPhysics = await page.evaluate(() => ({ ...window.__kagerou.physics.stats }));
  await page.evaluate(() => window.__kagerou.enemies.spawnWave(3, { seed: 0x51ed, alerted: true }));
  await page.evaluate(() => window.__kh.pump(6));
  out.threeEnemies = await page.evaluate(() => window.__kh.profile(30));
  out.threeEnemiesPhysics = await page.evaluate(() => ({ ...window.__kagerou.physics.stats }));
  out.colliders = await page.evaluate(() => {
    const ph = window.__kagerou.physics;
    const cols = ph.statics || [];
    const byKind = {};
    let tris = 0;
    for (const c of cols) {
      byKind[c.kind] = (byKind[c.kind] || 0) + 1;
      if (c.kind === 'triangleMesh' && c.bvh) tris += c.bvh.triCount || 0;
    }
    return { statics: cols.length, byKind, triangleMeshTriangles: tris };
  });
  await page.evaluate(() => window.__kagerou.enemies?.despawnAll?.());
  return out;
}

/** Landmark visibility from the approach points a player actually arrives from. */
async function landmarkSurvey(page) {
  return page.evaluate(() => {
    const k = window.__kagerou;
    if (!k?.physics || !k?.camera) return null;
    const THREE_V = k.player.position.constructor;
    // Cast from above the *player's* height, not from an absolute constant. The shrine
    // plateau stands at y ≈ 812, so an origin of y = 60 starts every ray underground: the
    // first run of this survey resolved zero anchors and zero eye points and reported
    // "no landmark visible from any approach point", which was a fact about the rig.
    const base = k.player?.root?.position?.y ?? 0;
    const ground = (x, z) => {
      const h = k.physics.raycastDown?.(x, base + 80, z, 400, 17);
      return h && h.hit ? h.point.y : null;
    };
    // Plateau-local layout numbers from world/Level.js LAYOUT, resolved to world height
    // by raycast so this cannot drift from the terrain.
    const anchors = [
      { name: 'great-torii', x: 0, z: 38.5, up: 5.6 },
      { name: 'honden-roof', x: 0, z: -4.5, up: 8.0 },
      { name: 'bell-tower', x: 16.5, z: 27.0, up: 4.6 },
      { name: 'haiden-roof', x: 0, z: 8.5, up: 7.0 },
    ].map((a) => {
      const g = ground(a.x, a.z);
      return g == null ? null : { name: a.name, p: new THREE_V(a.x, g + a.up, a.z) };
    }).filter(Boolean);

    const points = [
      { name: 'stair-top', x: 0, z: 72.0 },
      { name: 'first-torii', x: 0, z: 68.0 },
      { name: 'second-torii', x: 0, z: 54.0 },
      { name: 'arena', x: 0, z: 26.0 },
      { name: 'chozuya', x: -14.5, z: 30.0 },
      { name: 'ema-rack', x: 10.5, z: 43.0 },
      { name: 'west-edge', x: -22, z: 34 },
      { name: 'east-edge', x: 22, z: 34 },
    ];

    const cam = k.camera;
    const savePos = cam.position.clone();
    const saveQuat = cam.quaternion.clone();
    const saveFov = cam.fov;
    const out = [];
    const probe = new THREE_V();
    for (const pt of points) {
      const g = ground(pt.x, pt.z);
      if (g == null) { out.push({ name: pt.name, visible: [], error: 'no ground' }); continue; }
      const eye = new THREE_V(pt.x, g + 1.62, pt.z);
      cam.position.copy(eye);
      // Face the shrine axis — the direction a player walking the approach is looking.
      cam.lookAt(0, g + 2.0, -4.5);
      cam.fov = 58; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      // Same trap as the render stub: `project()` reads matrixWorldInverse, which three
      // only rebuilds during a real render.
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      const visible = [];
      for (const a of anchors) {
        probe.copy(a.p).project(cam);
        const inFrame = Math.abs(probe.x) <= 1 && Math.abs(probe.y) <= 1 && probe.z < 1;
        if (!inFrame) continue;
        const dir = a.p.clone().sub(eye);
        const dist = dir.length();
        dir.normalize();
        const hit = k.physics.raycast(eye, dir, dist - 0.6, 17);
        if (!hit || !hit.hit) visible.push(a.name);
      }
      out.push({ name: pt.name, eye: [+eye.x.toFixed(2), +eye.y.toFixed(2), +eye.z.toFixed(2)], visible });
    }
    cam.position.copy(savePos);
    cam.quaternion.copy(saveQuat);
    cam.fov = saveFov;
    cam.updateProjectionMatrix();
    return { points: out, anchors: anchors.map((a) => a.name) };
  });
}

/**
 * Rim separation, measured by difference rather than by guessing where the edge is.
 *
 * Two frames from an identical camera, one with the enemy present and one without: the
 * changed pixels *are* the silhouette, exactly, with no edge detector to tune. The
 * contrast is then the luma step between a band just inside that silhouette and a band
 * just outside it — which is what "separated from the background by rim light" means.
 */
async function rimContrastSurvey(page, archetypes) {
  const results = [];
  // A rendered frame costs ~8.7 s under SwiftShader at this profile (measured in the
  // self-check), so a fixed sleep either wastes minutes or screenshots a frame composed
  // before the world changed. Wait on the frame counter instead.
  const settle = async (n = 2) => {
    const from = await page.evaluate(() => window.__kagerou.engine.frame);
    await page.waitForFunction((f) => window.__kagerou.engine.frame >= f, from + n, { timeout: 180000, polling: 1000 });
  };
  for (const placement of ['sunlit', 'shaded']) {
    for (const archetype of archetypes) {
      const ok = await page.evaluate(({ a, p }) => {
        const k = window.__kagerou;
        k.enemies?.despawnAll?.();
        // The sun is ESE, direction (0.86, 0.225, 0.457), so shadows fall toward -X/-Z.
        // Sunlit is the open gravel arena; shaded is inside the haiden's own shadow on
        // its west flank, which is the only reliably shaded standing space on the plateau.
        const spot = p === 'sunlit' ? { x: 0, z: 26 } : { x: -9.5, z: 8.5 };
        k.player.root.position.set(spot.x, k.player.root.position.y, spot.z + 5);
        k.player.controller?.teleport?.(spot.x, k.player.root.position.y, spot.z + 5);
        const e = k.enemies?.spawnWave?.(1, { archetypes: [a], radius: 3.2, seed: 0x31, alerted: false });
        k.debugCam?.('combat');
        return !!(e && e.length);
      }, { a: archetype, p: placement });
      if (!ok) { results.push({ archetype, placement, error: 'spawn failed' }); continue; }
      await settle(3);
      // A drawn frame costs ~8.7 s here, so Playwright's 30 s screenshot default is not
      // generous — it timed out on the first attempt and produced no measurement at all.
      const withEnemy = await page.screenshot({ type: 'png', timeout: 240000 });
      await page.evaluate(() => window.__kagerou.enemies?.despawnAll?.());
      await settle(3);
      const without = await page.screenshot({ type: 'png', timeout: 240000 });
      try {
        results.push({ archetype, placement, ...silhouetteContrast(withEnemy, without) });
      } catch (e) {
        results.push({ archetype, placement, error: String(e.message || e) });
      }
    }
  }
  return results;
}

/** Luma step across the silhouette produced by an A/B difference mask. */
function silhouetteContrast(pngA, pngB) {
  const a = decodePNG(pngA), b = decodePNG(pngB);
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame size changed between A and B');
  if (a.channels !== b.channels) throw new Error('channel count changed between A and B');
  const { width: W, height: H, channels: C } = a;
  const lumaOf = (img, i) => (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
  const mask = new Uint8Array(W * H);
  let count = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 24) { mask[p] = 1; count++; }
  }
  if (count < 400) throw new Error(`silhouette too small to measure (${count} px)`);
  // Bands: a pixel is "inside" if it is masked with an unmasked neighbour within 3 px,
  // "outside" if it is unmasked with a masked neighbour within 3 px.
  const inside = [], outside = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x, i = p * C;
      let near = 0, far = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) (at(x + dx, y + dy) ? near++ : far++);
      if (mask[p] && far > 0) inside.push(lumaOf(a, i));
      if (!mask[p] && near > 0) outside.push(lumaOf(a, i));
    }
  }
  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const li = mean(inside), lo = mean(outside);
  return {
    silhouettePx: count,
    innerEdgeLuma: +li.toFixed(4),
    outerEdgeLuma: +lo.toFixed(4),
    edgeLumaDelta: +Math.abs(li - lo).toFixed(4),
    edgeSamples: { inside: inside.length, outside: outside.length },
  };
}

/**
 * Post-limiter output level under worst-case simultaneity.
 *
 * The AudioContext runs on its own real-time clock and cannot be virtualised, so this is
 * the one measurement taken with the harness clock released. The analyser window is sized
 * so consecutive polls overlap: a gap between windows would silently drop the loudest
 * sample, which is the only sample this criterion is about.
 */
async function audioPeakSurvey(page) {
  return page.evaluate(async () => {
    const k = window.__kagerou;
    const audio = k?.audio;
    if (!audio) return { error: 'no audio system' };
    try { await audio.unlock?.(); } catch { /* handled below */ }
    if (!audio.ac || audio.ac.state !== 'running') return { error: `audio context not running (${audio.ac?.state ?? 'absent'})` };
    if (!audio.limiter) return { error: 'no limiter node to tap' };

    const ac = audio.ac;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 32768;
    try {
      audio.limiter.disconnect();
      audio.limiter.connect(analyser);
      analyser.connect(ac.destination);
    } catch (e) { return { error: `could not tap the master path: ${e.message}` }; }

    const names = [...(audio.buffers?.keys?.() || [])];
    const impacts = names.filter((n) => /hit|clash|impact|break|parry|slash|death/i.test(n)).slice(0, 5);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0, oversampled = 0, windows = 0;

    const poll = () => {
      analyser.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
        // Cheap inter-sample estimate: the midpoint of a cubic through four samples.
        if (i > 1 && i < buf.length - 2) {
          const m = Math.abs((-buf[i - 2] + 9 * buf[i - 1] + 9 * buf[i] - buf[i + 1]) / 16);
          if (m > oversampled) oversampled = m;
        }
      }
      windows++;
    };

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Five impacts inside one analyser window, on top of whatever bed is already playing.
    for (let round = 0; round < 3; round++) {
      for (const n of impacts) { try { audio.play(n, { gain: 1 }); } catch { /* name may not accept opts */ } }
      await wait(120);
      poll();
      await wait(180);
      poll();
    }
    try { analyser.disconnect(); audio.limiter.disconnect(); audio.limiter.connect(ac.destination); } catch { /* leave the tap in place */ }
    return {
      peak, samples: windows, impacts,
      truePeakEstimateDb: +(20 * Math.log10(Math.max(1e-6, oversampled))).toFixed(2),
      soundNamesAvailable: names.length,
    };
  });
}

// ------------------------------------------------------------------- self-checks

/**
 * Three apparatus validations. Each states a falsifiable prediction and measures it;
 * none of them are allowed to be assumed.
 */
async function selfCheck(page, home, layout) {
  const checks = {};

  // 120 frames is two simulated seconds — long enough for the controller to reach steady
  // state and short enough that the rendered leg of the comparison is affordable: under
  // SwiftShader at this profile a drawn frame costs three orders of magnitude more than a
  // simulated one, and the self-check must not cost more than the run it validates.
  const FRAMES = 120;
  const shortPlan = (id, render) => ({
    id, frames: FRAMES, render, probes: ['player', 'input', 'camera'],
    actions: [
      { f: 10, do: 'touchDown', id: 80, x: layout.stickOrigin.x, y: layout.stickOrigin.y },
      { f: 12, do: 'touchMove', id: 80, x: layout.stickOrigin.x, y: layout.stickOrigin.y - layout.stickRadius },
      { f: FRAMES - 10, do: 'touchUp', id: 80, x: layout.stickOrigin.x, y: layout.stickOrigin.y - layout.stickRadius },
    ],
  });

  // 1. Determinism: the same stimulus twice must produce the same simulation.
  await resetWorld(page, home);
  const a = await runPlan(page, shortPlan('selfcheck-det-a', false));
  await resetWorld(page, home);
  const b = await runPlan(page, shortPlan('selfcheck-det-b', false));
  checks.determinism = seriesDivergence(a, b, ['px', 'pz', 'pyaw', 'pspeed']);

  // 2. The render substitution. `setRender(false)` replaces the post pipeline with a stub
  //    that only updates world matrices. Prediction: the simulation is unchanged. If it
  //    is not, every sim-only trace in this run is suspect and the report says so.
  await resetWorld(page, home);
  const c = await runPlan(page, shortPlan('selfcheck-render-on', true));
  checks.renderSubstitution = seriesDivergence(a, c, ['px', 'pz', 'pyaw', 'pspeed']);
  checks.renderSubstitution.note =
    'sim-only vs fully-rendered run of an identical stimulus; a non-zero divergence invalidates every render:false trace in this report';

  // 3. Agreement with the trusted screenshot rig: same pose, same counters.
  await resetWorld(page, home);
  const stats = await page.evaluate(async () => {
    const k = window.__kagerou;
    window.__kh.setRender(true);
    k.debugCam?.('hero');
    window.__kh.pump(8);
    return { draws: k.engine.stats.drawCalls, tris: k.engine.stats.triangles, tier: k.quality?.name ?? null };
  });
  const prev = readReport();
  checks.agreementWithScreenshotRig = {
    pose: 'hero', measuredHere: stats,
    screenshotRig: prev ? { draws: prev.worstDrawCalls, tris: prev.worstTriangles, tag: prev.tag } : null,
    note: prev
      ? 'the screenshot rig reports its worst shot, so equality is not expected; a same-order match is the check'
      : 'no shots/report.json to compare against in this run',
  };
  return checks;
}

function seriesDivergence(a, b, cols) {
  const out = { frames: Math.min(a.frames, b.frames), columns: {} };
  let worst = 0;
  for (const c of cols) {
    const x = a.columns[c] || [], y = b.columns[c] || [];
    let d = 0;
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] == null || y[i] == null) continue;
      d = Math.max(d, Math.abs(x[i] - y[i]));
    }
    out.columns[c] = +d.toFixed(6);
    worst = Math.max(worst, d);
  }
  out.worstAbsoluteDivergence = +worst.toFixed(6);
  out.identical = worst === 0;
  return out;
}

/**
 * Reuse a previous run's self-check, but only against a byte-identical build.
 *
 * A carried validation that silently applies to a different build is worse than no
 * validation, so this refuses rather than warns when the fingerprint moves.
 */
function carrySelfCheck(tag, fingerprint) {
  const f = join(OUT, `interaction-${tag}.json`);
  if (!existsSync(f)) return { carried: false, error: `no ${f}` };
  try {
    const prev = JSON.parse(readFileSync(f, 'utf8'));
    if (!prev.selfCheck) return { carried: false, error: `${f} has no selfCheck` };
    if (prev.build?.fingerprint !== fingerprint) {
      return { carried: false, error: `build fingerprint differs (${prev.build?.fingerprint?.slice(0, 12)} vs ${fingerprint.slice(0, 12)}) — re-run --self-check` };
    }
    return { carried: true, from: `shots/interaction-${tag}.json`, at: prev.at, buildFingerprint: fingerprint, ...prev.selfCheck };
  } catch (e) { return { carried: false, error: String(e.message || e) }; }
}

function readReport() {
  const f = join(OUT, 'report.json');
  if (!existsSync(f)) return null;
  try {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    const phone = r.profiles?.phone;
    if (!phone?.stats) return null;
    return { worstDrawCalls: phone.stats.drawCalls ?? null, worstTriangles: phone.stats.triangles ?? null, tag: r.at ?? null };
  } catch { return null; }
}

// ------------------------------------------------------------------------- main

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ is missing — run `npm run build` first.');
    process.exit(2);
  }
  const release = await acquireLock();
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
  process.on('SIGTERM', () => { release(); process.exit(143); });

  mkdirSync(TRACE_DIR, { recursive: true });
  const port = 4519 + (process.pid % 200);
  const server = await serve(DIST, port);
  const base = `http://127.0.0.1:${port}/index.html`;

  const logs = [];
  const browser = await chromium.launch({
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--force-color-profile=srgb',
      // Audio is deliberately NOT muted: BM-AUDIO-03 measures the output path.
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({
    viewport: PROFILE.viewport, deviceScaleFactor: PROFILE.deviceScaleFactor,
    isMobile: PROFILE.isMobile, hasTouch: PROFILE.hasTouch,
    userAgent: PROFILE.userAgent, colorScheme: 'dark',
  });

  const previous = existsSync(join(OUT, `interaction-${TAG}.json`))
    ? (() => { try { return JSON.parse(readFileSync(join(OUT, `interaction-${TAG}.json`), 'utf8')); } catch { return null; } })()
    : null;

  const report = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    tool: 'tools/interaction-capture.mjs',
    tag: TAG,
    revision: {
      sha: gitText(['rev-parse', 'HEAD']),
      branch: gitText(['branch', '--show-current']),
      dirty: (gitText(['status', '--porcelain'], '') || '').length > 0,
    },
    build: { fingerprint: fingerprintTree(DIST) },
    profile: { name: 'phone', ...PROFILE },
    limitations: [
      'SwiftShader software rendering — no statement here is device performance evidence.',
      'The player is a scripted policy in tools/harness/runtime.js, not a human.',
      'No reference-title footage was fetched or compared; thresholds are measured on our own build.',
      'Input is synthesised as DOM PointerEvents in-page; the browser\'s own digitiser-to-event path is not exercised.',
    ],
    scenarios: { ...(previous?.scenarios || {}) },
    selfCheck: null,
    // Extras from a previous run of the same tag survive a partial re-run for the same
    // reason traces do; anything re-measured below overwrites its own key.
    extras: { ...(previous?.extras || {}) },
    results: null, summary: null, errors: logs,
  };

  let page;
  try {
    page = await bootGame(context, base, logs);
    const layout = await page.evaluate(() => window.__kh.layout());
    const home = await page.evaluate(() => {
      const p = window.__kagerou.player.root.position;
      return [p.x, p.y, p.z];
    });
    console.log(`[interaction] layout ${JSON.stringify(layout)}`);

    await page.evaluate(() => window.__kh.lock());

    const all = buildPlans(layout, { encounters: Number(argv.encounters) || 20 });
    const wanted = argv.scenarios ? String(argv.scenarios).split(',') : null;
    const selected = all.filter((p) => !wanted || wanted.includes(p.id));
    const traces = [];

    // control-continuity runs before everything, including the self-check: its subject is
    // the opening title beat, and every other step — the self-check included — cancels the
    // intro on its way to a clean world. Running it second would measure nothing and look
    // like a pass.
    const introPlan = argv['self-check'] ? null : selected.find((p) => p.id === 'control-continuity');
    if (introPlan) {
      const trace = await runPlan(page, introPlan);
      writeFileSync(join(TRACE_DIR, `${introPlan.id}.json`), JSON.stringify(trace));
      traces.push(trace);
      report.scenarios[introPlan.id] = {
        frames: trace.frames, wallMs: trace.wallMs, events: trace.events.length,
        failedActions: trace.failedActions.length, criteria: introPlan.criteria,
        trace: `shots/interaction-${TAG}/${introPlan.id}.json`,
        note: 'run first, from a fresh boot, before anything cancelled the intro',
      };
    }

    if (argv['self-check'] || !argv['carry-self-check']) {
      console.log('[interaction] apparatus self-check…');
      report.selfCheck = await selfCheck(page, home, layout);
      console.log(`[interaction] determinism divergence ${report.selfCheck.determinism.worstAbsoluteDivergence}; ` +
        `render-substitution divergence ${report.selfCheck.renderSubstitution.worstAbsoluteDivergence}`);
    } else {
      // The rendered leg of the self-check costs ~17 minutes because a drawn frame is
      // 8.7 s here. Carrying it forward is safe only when the built surface is
      // byte-identical, so the fingerprint is checked rather than assumed — the same rule
      // the screenshot rig's --diff uses, and for the same reason.
      report.selfCheck = carrySelfCheck(String(argv['carry-self-check']), report.build.fingerprint);
      console.log(`[interaction] self-check: ${report.selfCheck.carried ? 'carried from ' + report.selfCheck.from : 'NOT CARRIED — ' + report.selfCheck.error}`);
    }

    // Write the report after every scenario rather than once at the end. Two runs have
    // already been lost whole because they were interrupted while the last scenario was
    // still going, and a partial set of verdicts with the rest honestly marked
    // inconclusive is worth far more than nothing.
    const flush = () => {
      report.results = evaluateAll(traces, report.extras);
      report.summary = summarise(report.results);
      writeFileSync(join(OUT, `interaction-${TAG}.json`), JSON.stringify(report, null, 2));
    };
    flush();

    if (!argv['self-check']) {
      for (const plan of selected.filter((p) => p.id !== 'control-continuity')) {
        const skipIntro = (plan.setup || []).includes('skipIntro');
        await resetWorld(page, home, { skipIntro });
        try {
          const trace = await runPlan(page, plan);
          writeFileSync(join(TRACE_DIR, `${plan.id}.json`), JSON.stringify(trace));
          traces.push(trace);
          report.scenarios[plan.id] = {
            frames: trace.frames, wallMs: trace.wallMs, events: trace.events.length,
            failedActions: trace.failedActions.length, criteria: plan.criteria,
            trace: `shots/interaction-${TAG}/${plan.id}.json`,
          };
          // `ringBell` emits no objective of its own — it plays a sound, shakes the camera
          // and fires a wave trigger — so the only unambiguous evidence that the bell was
          // struck is the interactable's own `used` flag, read straight after the run.
          if (plan.id === 'bell-accident') {
            report.extras.interactables = await page.evaluate(() =>
              (window.__kagerou.level?.interactables || []).map((i) => ({ id: i.id, kind: i.kind, used: !!i.used })),
            ).catch(() => null);
          }
        } catch (e) {
          console.error(`[interaction] ${plan.id} FAILED: ${e.message}`);
          report.scenarios[plan.id] = { error: String(e.message || e), criteria: plan.criteria };
        }
        flush();
      }

      // Traces from a previous run of the same tag are folded back in when this run did
      // not re-take them. A combat scenario costs an hour here, so re-running the four
      // fast locomotion scenarios after a scenario bug must not silently drop every
      // verdict that depended on the slow ones. Carried traces are labelled as carried.
      for (const plan of all) {
        if (traces.some((t) => t.id === plan.id)) continue;
        const f = join(TRACE_DIR, `${plan.id}.json`);
        if (!existsSync(f)) continue;
        try {
          const trace = JSON.parse(readFileSync(f, 'utf8'));
          traces.push(trace);
          report.scenarios[plan.id] = {
            ...(report.scenarios[plan.id] || {}),
            frames: trace.frames, events: trace.events?.length ?? null, criteria: plan.criteria,
            trace: `shots/interaction-${TAG}/${plan.id}.json`, carriedForward: true,
          };
          console.log(`[interaction] carried ${plan.id} forward from a previous run of this tag`);
        } catch { /* an unreadable carried trace is simply not carried */ }
      }
      flush();

      console.log('[interaction] extras…');
      await resetWorld(page, home);
      report.extras.zoneAudit = await zoneAudit(page).catch((e) => ({ error: String(e.message) }));
      report.extras.landmarks = await landmarkSurvey(page).catch((e) => ({ error: String(e.message) }));
      report.extras.jsFrameCost = await jsFrameCost(page, home).catch((e) => ({ error: String(e.message) }));
      flush();

      // The pixel and audio extras need the real clock and the real pipeline back.
      await page.evaluate(() => { window.__kh.setRender(true); window.__kh.free(); });
      await resetWorld(page, home, { render: true });
      report.extras.audioPeak = await audioPeakSurvey(page).catch((e) => ({ error: String(e.message) }));
      flush();
      if (!argv['no-pixels']) {
        report.extras.rimContrast = await rimContrastSurvey(page, ['ashigaru', 'ronin', 'oyoroi', 'shinobi'])
          .catch((e) => [{ error: String(e.message) }]);
      }

      flush();
    }
  } catch (e) {
    console.error(e);
    report.errors.push(`fatal: ${e.message || e}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    server.close();
    release();
  }

  const file = join(OUT, `interaction-${TAG}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${file}`);
  if (report.summary) {
    console.log(`verdicts: ${JSON.stringify(report.summary.verdicts)} over ${report.summary.criteria} criteria, ` +
      `${report.summary.elementsWithAMeasurement.length}/${report.summary.elements} elements measured`);
    for (const r of report.results) {
      console.log(`  ${r.verdict.toUpperCase().padEnd(12)} ${r.criterion.padEnd(16)} ${r.element}`);
    }
  }
  process.exit(report.errors.some((l) => l.startsWith('fatal')) ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
