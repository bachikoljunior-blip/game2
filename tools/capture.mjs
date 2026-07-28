#!/usr/bin/env node
/**
 * capture.mjs — the visual review rig.
 *
 * Boots the built game in headless Chromium at a set of device profiles, drives it
 * through scripted beats (idle, combat, parry, dusk, rain), and writes PNGs plus a
 * perf/console report. The art-direction critic pass reads these images directly,
 * so framing here is deliberately cinematic rather than diagnostic.
 *
 *   node tools/capture.mjs                      # default set
 *   node tools/capture.mjs --profile=phone      # one profile
 *   node tools/capture.mjs --shots=hero,combat  # one beat
 */

import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
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
        const body = await readFile(file);
        rq.writeHead(200, {
          'content-type': MIME[extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store',
        }).end(body);
      } catch (e) { rq.writeHead(500).end(String(e)); }
    });
    server.listen(port, '127.0.0.1', () => res(server));
  });
}

/** Device profiles. `phone` is the pass/fail target; `desktop` is the showcase. */
const PROFILES = {
  phone: {
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true,
    hasTouch: true, userAgent: devices['iPhone 13'].userAgent, tier: 'medium',
  },
  phoneLow: {
    viewport: { width: 800, height: 360 }, deviceScaleFactor: 2, isMobile: true,
    hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent, tier: 'low',
  },
  tablet: {
    viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true,
    hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent, tier: 'high',
  },
  desktop: {
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false,
    hasTouch: false, tier: 'ultra',
  },
};

/**
 * Scripted beats. Each is evaluated in the page against `window.__kagerou`.
 * Systems expose `__cinematic` hooks so the rig can pose the world deterministically.
 */
const SHOTS = {
  hero: { wait: 2600, script: `k.debugCam?.('hero')` },
  wide: { wait: 2200, script: `k.debugCam?.('wide')` },
  torii: { wait: 2200, script: `k.debugCam?.('torii')` },
  combat: { wait: 3200, script: `k.debugCam?.('combat'); k.enemies?.spawnWave?.(3)` },
  parry: { wait: 3400, script: `k.debugCam?.('combat'); k.combat?.__demoParry?.()` },
  closeup: { wait: 2200, script: `k.debugCam?.('closeup')` },
  dusk: { wait: 2600, script: `k.sky?.setTime?.(0.86); k.debugCam?.('hero')` },
  night: { wait: 2600, script: `k.sky?.setTime?.(0.02); k.debugCam?.('hero')` },
  noon: { wait: 2600, script: `k.sky?.setTime?.(0.5); k.debugCam?.('wide')` },
  rain: { wait: 3000, script: `k.weather?.setPreset?.('rain'); k.debugCam?.('hero')` },
  hud: { wait: 2400, script: `k.hud?.__demo?.()` },
};

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ is missing — run `npm run build` first.');
    process.exit(2);
  }
  const port = 4319 + (process.pid % 200);
  const server = await serve(DIST, port);
  const base = `http://127.0.0.1:${port}/index.html`;

  const wantProfiles = argv.profile ? String(argv.profile).split(',') : ['phone', 'desktop'];
  const wantShots = argv.shots ? String(argv.shots).split(',') : Object.keys(SHOTS);
  const tag = argv.tag ? `-${argv.tag}` : '';

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
    ],
  });

  const report = { at: new Date().toISOString(), profiles: {} };

  for (const pname of wantProfiles) {
    const prof = PROFILES[pname];
    if (!prof) { console.warn(`unknown profile ${pname}`); continue; }
    const context = await browser.newContext({
      viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor,
      isMobile: prof.isMobile, hasTouch: prof.hasTouch,
      userAgent: prof.userAgent, colorScheme: 'dark',
    });
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

    const url = `${base}?autostart&q=${prof.tier}&capture`;
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });

    // SwiftShader is software rendering: procedural texture synthesis, terrain erosion
    // and the foliage impostor bakes all run one to two orders of magnitude slower here
    // than on a real GPU, so the boot budget has to be generous. If it does time out we
    // want to know *which* step it died on, not just that it did.
    let booted = true;
    const bootStarted = Date.now();
    try {
      // `polling: 'raf'` is Playwright's default, and rAF does not tick while the main
      // thread is inside `renderer.compile()` — under SwiftShader that is long enough to
      // look like a hang even though the page is healthy. Poll on a timer instead.
      await page.waitForFunction(
        'window.__kagerouReady === true',
        undefined,
        { timeout: 420000, polling: 500 },
      );
    } catch {
      booted = false;
      const stalledAt = await page
        .evaluate(() => document.getElementById('boot-status')?.textContent || '(no status)')
        .catch(() => '(unreachable)');
      logs.unshift(`boot timed out after ${((Date.now() - bootStarted) / 1000) | 0}s at step: ${stalledAt}`);
    }
    console.log(`[${pname}] boot ${booted ? 'ok' : 'FAILED'} in ${((Date.now() - bootStarted) / 1000).toFixed(1)}s`);

    const shots = {};
    if (booted) {
      // The opening title card runs a full-screen ink wash over the first few seconds.
      // Left alone it dims every shot by roughly two stops and stamps 陽炎 across the
      // middle of frame, so dismiss it and let the world settle before composing.
      await page.evaluate(() => {
        const k = window.__kagerou;
        k?.menus?.skipIntro?.();
        k?.menus?.resume?.();
        k?.weather?.setPreset?.('petals', true);
      }).catch(() => {});
      await page.waitForTimeout(6000);
      for (const sname of wantShots) {
        const shot = SHOTS[sname];
        if (!shot) continue;
        try {
          await page.evaluate(`(() => { const k = window.__kagerou; ${shot.script}; })()`);
        } catch (e) { logs.push(`shot ${sname}: ${e.message}`); }
        await page.waitForTimeout(shot.wait);
        const file = join(OUT, `${pname}-${sname}${tag}.png`);
        // Playwright blocks the capture on `document.fonts.ready`, and the default 30 s
        // is not enough while SwiftShader is saturating the one render thread. We load no
        // webfonts, so this wait has nothing to find — it just needs room to resolve.
        // One bad shot must not cost us the rest of the profile's set either.
        try {
          await page.screenshot({ path: file, type: 'png', timeout: 180000 });
          shots[sname] = file;
        } catch (e) { logs.push(`screenshot ${sname}: ${e.message}`); }
      }
    } else {
      const file = join(OUT, `${pname}-FAILED${tag}.png`);
      await page.screenshot({ path: file, type: 'png', timeout: 180000 }).catch(() => {});
      shots.FAILED = file;
    }

    const stats = await page.evaluate(() => {
      const k = window.__kagerou;
      if (!k?.engine) return null;
      return {
        fps: Math.round(k.engine.stats.fps),
        ms: +k.engine.stats.ms.toFixed(2),
        drawCalls: k.engine.stats.drawCalls,
        triangles: k.engine.stats.triangles,
        renderScale: +k.quality.effectiveScale.toFixed(2),
        tier: k.quality.tier,
        programs: k.renderer.info.programs?.length ?? 0,
        textures: k.renderer.info.memory.textures,
        geometries: k.renderer.info.memory.geometries,
      };
    }).catch(() => null);

    report.profiles[pname] = { booted, stats, errors: logs.slice(0, 40), shots };
    console.log(`[${pname}] booted=${booted}`, stats ? JSON.stringify(stats) : '(no stats)');
    if (logs.length) console.log(`[${pname}] ${logs.length} console problems; first: ${logs[0]}`);

    await context.close();
  }

  await browser.close();
  server.close();
  writeFileSync(join(OUT, `report${tag}.json`), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${OUT}/report${tag}.json`);

  const anyFailed = Object.values(report.profiles).some((p) => !p.booted);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
