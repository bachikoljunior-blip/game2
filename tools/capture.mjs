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
 *   node tools/capture.mjs --review --diff      # review set, skipping unchanged shots
 */

import { chromium, devices } from 'playwright';
import { measureLuma, HUD_MASKS } from './luma.mjs';
import { plan as diffPlan, record as recordShot } from './manifest.mjs';
import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

// The screenshot allowance. 420 s was measured against the desktop/ultra profile's
// steady state, but the *first* frame after boot also pays SwiftShader's lazy pipeline
// compilation and has now missed 420 s twice while every later frame landed at ~390 s.
// `--shot-timeout=<ms>` widens it for a targeted retry without touching the default.
const SHOT_TIMEOUT = Number(argv['shot-timeout']) || 420000;

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
  valley: { wait: 2600, script: `k.debugCam?.('valley')` },
  sun: { wait: 2600, script: `k.debugCam?.('sun')` },
  combat: { wait: 3200, script: `k.debugCam?.('combat'); k.enemies?.spawnWave?.(3)` },
  parry: { wait: 3400, script: `k.debugCam?.('combat'); k.combat?.__demoParry?.()` },
  closeup: { wait: 2200, script: `k.debugCam?.('closeup')` },
  dusk: { wait: 2600, script: `k.sky?.setTime?.(0.86); k.debugCam?.('hero')` },
  night: { wait: 2600, script: `k.sky?.setTime?.(0.02); k.debugCam?.('hero')` },
  noon: { wait: 2600, script: `k.sky?.setTime?.(0.5); k.debugCam?.('wide')` },
  rain: { wait: 3000, script: `k.weather?.setPreset?.('rain'); k.debugCam?.('hero')` },
  hud: { wait: 2400, script: `k.hud?.__demo?.()` },
};

/**
 * `--review` is the set the art critic judges. It has to be captured in one pass from
 * one build: round 2 was handed three shots from one build and one from the next, and
 * the reviewer nearly filed an already-fixed bug as a regression off the stale frame.
 */
const REVIEW_SET = ['hero', 'wide', 'torii', 'valley', 'sun'];

/**
 * SwiftShader renders on one thread and saturates it, so two capture runs do not take
 * twice as long — they starve each other. A boot that normally takes 200 s has been
 * measured at 639 s under contention, past the point where it times out and produces
 * nothing. Several agents share this repo, so serialise at the file level rather than
 * trusting everyone to coordinate.
 */
async function acquireLock() {
  const lock = join(OUT, '.capture.lock');
  mkdirSync(OUT, { recursive: true });
  // Six owners share this rig and a SwiftShader boot is 2-5 min, so a queue of four is
  // routine. Thirty minutes was timing out the agents at the back of the line, which
  // cost real verification runs rather than preventing a deadlock.
  const deadline = Date.now() + 120 * 60 * 1000;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return () => { try { rmSync(lock, { force: true }); } catch { /* ignore */ } };
    } catch {
      // Reclaim a lock whose owner died without releasing it.
      try {
        const owner = Number(readFileSync(lock, 'utf8'));
        process.kill(owner, 0);
      } catch {
        rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error('capture lock held for over 2 h');
      console.log('[capture] another run holds the lock; waiting…');
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ is missing — run `npm run build` first.');
    process.exit(2);
  }
  // Resolve `--diff` before taking the lock. A run in which every shot is carried
  // forward never launches a browser, so it has nothing to serialise against — and
  // queueing it behind a live capture would make the cheap path wait two to five
  // minutes for permission to do nothing.
  const wantProfilesEarly = argv.profile ? String(argv.profile).split(',') : ['phone', 'desktop'];
  const wantShotsEarly = argv.review
    ? REVIEW_SET
    : argv.shots ? String(argv.shots).split(',') : Object.keys(SHOTS);
  const needsBrowser = !argv.diff || wantProfilesEarly
    .filter((p) => PROFILES[p])
    .some((p) => diffPlan(p, wantShotsEarly).stale.length > 0);

  const releaseLock = needsBrowser ? await acquireLock() : () => {};
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(130); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

  const port = 4319 + (process.pid % 200);
  const server = await serve(DIST, port);
  const base = `http://127.0.0.1:${port}/index.html`;

  const wantProfiles = wantProfilesEarly;
  const wantShots = wantShotsEarly;
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

    // `--diff` carries an unchanged shot forward from the previous round rather than
    // paying another SwiftShader boot for a byte-identical frame. The copy is what
    // makes it safe to do: downstream (the histogram pass, the review-set completeness
    // check, the contact sheet) all key off `shots`, and every one of them keeps
    // working on a carried file without knowing it was carried.
    const shotPlan = argv.diff ? diffPlan(pname, wantShots) : null;
    const carried = {};
    let takeShots = wantShots;
    if (shotPlan) {
      takeShots = shotPlan.stale.map((s) => s.shot);
      for (const f of shotPlan.fresh) {
        const dest = join(OUT, `${pname}-${f.shot}${tag}.png`);
        try {
          if (resolve(f.from) !== resolve(dest)) copyFileSync(f.from, dest);
          carried[f.shot] = dest;
        } catch (e) {
          // Carrying it failed, so take it. Never let a copy error silently drop a
          // frame out of a review set.
          takeShots = [...takeShots, f.shot];
          console.warn(`[${pname}] could not carry ${f.shot} forward (${e.message}); recapturing`);
        }
      }
      console.log(`[${pname}] --diff: capturing ${takeShots.join(', ') || '(none)'}; ` +
        `carried ${Object.keys(carried).join(', ') || '(none)'}`);
    }

    // Nothing to take means nothing to boot — this is where the saving actually lands.
    if (shotPlan && takeShots.length === 0) {
      const histograms = {};
      for (const [sname, file] of Object.entries(carried)) {
        try { histograms[sname] = measureLuma(file, HUD_MASKS); } catch { /* reported below */ }
      }
      report.profiles[pname] = {
        booted: true, carriedOnly: true, stats: null, histograms,
        errors: ['all shots carried forward from the previous round; no browser was booted'],
        shots: carried,
      };
      console.log(`[${pname}] all ${Object.keys(carried).length} shots unchanged — skipped`);
      continue;
    }

    const context = await browser.newContext({
      viewport: prof.viewport, deviceScaleFactor: prof.deviceScaleFactor,
      isMobile: prof.isMobile, hasTouch: prof.hasTouch,
      userAgent: prof.userAgent, colorScheme: 'dark',
    });
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    // A bare message is not enough to route a crash — `i.toArray is not a function`
    // could be any of a dozen systems. Keep the first few frames of the stack.
    page.on('pageerror', (e) => {
      const stack = (e.stack || '').split('\n').slice(1, 5).map((l) => l.trim()).join(' | ');
      logs.push(`pageerror: ${e.message}${stack ? ' @ ' + stack : ''}`);
    });

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

    const shots = { ...carried };
    const histograms = {};
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
      for (const sname of takeShots) {
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
          await page.screenshot({ path: file, type: 'png', timeout: SHOT_TIMEOUT });
          shots[sname] = file;
          // Stamp the manifest per shot rather than once at the end: a run that dies
          // on shot four should still let the next round carry shots one to three.
          recordShot(pname, sname, file, argv.tag || null);
        } catch (e) { logs.push(`screenshot ${sname}: ${e.message}`); }
      }
    } else {
      const file = join(OUT, `${pname}-FAILED${tag}.png`);
      await page.screenshot({ path: file, type: 'png', timeout: SHOT_TIMEOUT }).catch(() => {});
      shots.FAILED = file;
    }

    // Catch materials that linked dead before judging what is in the frame — a bamboo
    // sea that never rasterised looked exactly like a density problem for three rounds.
    const deadPrograms = await page.evaluate(() => {
      const k = window.__kagerou;
      return k?.engine?.auditPrograms?.() ?? [];
    }).catch(() => []);
    if (deadPrograms.length) {
      for (const d of deadPrograms) {
        logs.unshift(`DEAD SHADER: ${d.name} linked=${d.linked} activeUniforms=${d.uniforms}`);
      }
      console.log(`[${pname}] ${deadPrograms.length} dead shader program(s) — see report`);
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
        // Hard numbers for the lighting review — "it looks grey" is not actionable,
        // "the key is 0.83,0.40,0.23 and the sun is 13 degrees up" is.
        sun: k.sky ? {
          time: +(k.sky.time ?? 0).toFixed(3),
          dir: [k.sky.sunDirection?.x, k.sky.sunDirection?.y, k.sky.sunDirection?.z]
            .map((v) => +(v ?? 0).toFixed(3)),
          elevationDeg: +(Math.asin(k.sky.sunDirection?.y ?? 0) * 180 / Math.PI).toFixed(1),
          color: k.sky.sunColor ? [k.sky.sunColor.r, k.sky.sunColor.g, k.sky.sunColor.b]
            .map((v) => +v.toFixed(3)) : null,
          intensity: +(k.sky.sunIntensity ?? 0).toFixed(2),
          fogDensity: +(k.sky.fogParams?.density ?? 0).toFixed(5),
        } : null,
        light: k.lighting ? {
          sunIntensity: +(k.lighting.sun?.intensity ?? 0).toFixed(2),
          sunColor: k.lighting.sun ? [k.lighting.sun.color.r, k.lighting.sun.color.g,
            k.lighting.sun.color.b].map((v) => +v.toFixed(3)) : null,
          castShadow: !!k.lighting.sun?.castShadow,
          cascades: k.lighting.cascadeCount ?? 0,
          shadowsActive: !!k.lighting.shadowsActive,
          hemiIntensity: +(k.lighting.hemi?.intensity ?? 0).toFixed(3),
        } : null,
        exposure: +(k.renderer.toneMappingExposure ?? 1).toFixed(3),
        programs: k.renderer.info.programs?.length ?? 0,
        textures: k.renderer.info.memory.textures,
        geometries: k.renderer.info.memory.geometries,
      };
    }).catch(() => null);

    // Tonal range is the cheapest objective read on whether the grade ships: a frame
    // with no true black and no true white looks amateur long before a viewer can say
    // why. Measured off the saved PNG rather than the canvas — the WebGL context has
    // no preserved drawing buffer, so an in-page readback returns cleared black.
    // Fog shots legitimately hold no highlights, so only shots with real speculars
    // are held to the ceiling.
    const HIGHLIGHT_SHOTS = new Set(['hero', 'torii', 'wide', 'combat', 'closeup']);
    for (const [sname, file] of Object.entries(shots)) {
      try {
        const h = measureLuma(file, HUD_MASKS);
        h.blackOk = h.p01 < 15;
        h.whiteOk = !HIGHLIGHT_SHOTS.has(sname) || h.p999 > 235;
        histograms[sname] = h;
        if (!h.blackOk || !h.whiteOk) {
          logs.push(`histogram ${sname}: p0.1=${h.p01} p99.9=${h.p999} ` +
            `(black ${h.blackOk ? 'ok' : 'FAIL'}, white ${h.whiteOk ? 'ok' : 'FAIL'})`);
        }
      } catch (e) { logs.push(`histogram ${sname}: ${e.message}`); }
    }

    // Stamp the build so a reviewer can tell at a glance whether a set is coherent.
    if (argv.review) {
      const missing = REVIEW_SET.filter((s) => !shots[s]);
      if (missing.length) {
        logs.unshift(`REVIEW SET INCOMPLETE — missing ${missing.join(', ')}; do not send to review`);
      }
    }
    // The phone profile is the pass/fail line in ARCHITECTURE §7, and it drifted 676k →
    // 1.15M triangles across two review rounds without anyone noticing: every owner was
    // given a draw-call budget for their own system, nobody owned the total. Assert it
    // here so the next drift is named the moment it lands rather than two rounds later.
    if (pname === 'phone' && stats) {
      const BUDGET = { drawCalls: 140, triangles: 900000 };
      for (const [k, cap] of Object.entries(BUDGET)) {
        if (stats[k] > cap) {
          const over = Math.round((stats[k] / cap - 1) * 100);
          logs.unshift(`BUDGET: ${k} ${stats[k].toLocaleString()} over the ${cap.toLocaleString()} cap by ${over}%`);
          console.log(`[${pname}] BUDGET ${k} ${stats[k]} > ${cap} (+${over}%)`);
        }
      }
    }

    report.profiles[pname] = {
      booted, stats, histograms, errors: logs.slice(0, 40), shots,
      carriedForward: Object.keys(carried),
    };
    console.log(`[${pname}] booted=${booted}`, stats ? JSON.stringify(stats) : '(no stats)');
    if (logs.length) console.log(`[${pname}] ${logs.length} console problems; first: ${logs[0]}`);

    await context.close();
  }

  await browser.close();
  server.close();
  releaseLock();
  writeFileSync(join(OUT, `report${tag}.json`), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${OUT}/report${tag}.json`);

  const anyFailed = Object.values(report.profiles).some((p) => !p.booted);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
