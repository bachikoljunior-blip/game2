#!/usr/bin/env node
/**
 * harness/profile-cpu.mjs — a V8 CPU profile of a few stepped frames.
 *
 * `diagnose.mjs` narrowed a 1,104 ms frame down to one system; the production bundle is
 * minified, so it could not say which function inside it. This runs the same measurement
 * against the Vite dev server, where the names are real, and reports the heaviest
 * self-time functions. Diagnosis only — it is not part of any criterion.
 */

import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNTIME = join(ROOT, 'tools', 'harness', 'runtime.js');
const FRAMES = Number(process.argv[2]) || 6;

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5199'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => {
  vite.stdout.on('data', (d) => { if (String(d).includes('ready in') || String(d).includes('Local:')) r(); });
  setTimeout(r, 15000);
});

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage', '--mute-audio'],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: devices['iPhone 13'].userAgent,
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript({ path: RUNTIME });
await page.goto('http://127.0.0.1:5199/index.html?autostart&q=medium&capture', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__kagerouReady === true', undefined, { timeout: 600000, polling: 500 });
await page.evaluate(() => { window.__kagerouStart?.(); window.__kagerou.menus?.skipIntro?.(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__kh.lock(); window.__kh.setRender(false); });
await page.evaluate(() => window.__kagerou.enemies.spawnWave(3, { seed: 0x51ed, alerted: true }));
await page.evaluate(() => window.__kh.pump(4));            // past first-spawn construction

const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const wall = await page.evaluate((n) => { const t = performance.now ? Date.now() : 0; window.__kh.pump(n); return Date.now() - t; }, FRAMES);
const { profile } = await cdp.send('Profiler.stop');

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
for (const n of profile.nodes) {
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} @ ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (n.hitCount || 0));
}
const totalHits = [...self.values()].reduce((a, b) => a + b, 0);
console.log(`\nframes=${FRAMES} wallMs=${wall} samples=${totalHits}\n`);
console.log('top self-time functions:');
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
  console.log(`  ${(100 * v / totalHits).toFixed(1).padStart(5)}%  ${v.toString().padStart(6)}  ${k}`);
}

// Heaviest total-time paths, so a cheap leaf called from one place is attributable.
const children = new Map();
for (const n of profile.nodes) for (const c of n.children || []) children.set(c, n.id);
const chain = (id) => {
  const out = [];
  for (let i = id, guard = 0; i && guard < 12; guard++) {
    const n = byId.get(i);
    if (!n) break;
    out.unshift(n.callFrame.functionName || '(anonymous)');
    i = children.get(i);
  }
  return out.join(' → ');
};
const hottest = profile.nodes.filter((n) => n.hitCount > totalHits * 0.03).sort((a, b) => b.hitCount - a.hitCount).slice(0, 6);
console.log('\nhottest call paths:');
for (const n of hottest) console.log(`  ${(100 * n.hitCount / totalHits).toFixed(1)}%  ${chain(n.id)}`);

await browser.close();
vite.kill();
process.exit(0);
