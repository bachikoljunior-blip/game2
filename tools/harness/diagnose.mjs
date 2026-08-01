#!/usr/bin/env node
/**
 * harness/diagnose.mjs — per-system frame cost, with and without enemies.
 *
 * Written because a scenario with three enemies ran roughly 800× slower than the same
 * harness with none, and the rig cannot be trusted until that is explained: an apparatus
 * this asymmetric would silently make every combat criterion unaffordable, and "probably
 * the AI" is a guess, not a measurement.
 */

import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const RUNTIME = join(ROOT, 'tools', 'harness', 'runtime.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = await new Promise((res) => {
  const s = createServer(async (req, rq) => {
    let p = normalize(decodeURIComponent(req.url.split('?')[0]));
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = join(DIST, p);
    const st = await stat(file).catch(() => null);
    if (!st?.isFile()) { rq.writeHead(404).end(); return; }
    rq.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  });
  s.listen(4711, '127.0.0.1', () => res(s));
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
await page.goto('http://127.0.0.1:4711/index.html?autostart&q=medium&capture', { waitUntil: 'load' });
await page.waitForFunction('window.__kagerouReady === true', undefined, { timeout: 420000, polling: 500 });
await page.evaluate(() => { window.__kagerouStart?.(); window.__kagerou.menus?.skipIntro?.(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__kh.lock(); window.__kh.setRender(false); });

console.log('--- no enemies ---');
console.log(JSON.stringify(await page.evaluate(() => window.__kh.profile(120)), null, 1));

console.log('--- 3 enemies (first spawn, includes rig construction) ---');
await page.evaluate(() => window.__kagerou.enemies.spawnWave(3, { seed: 0x51ed, alerted: true }));
console.log(JSON.stringify(await page.evaluate(() => window.__kh.profile(60)), null, 1));

console.log('--- 3 enemies (warm) ---');
console.log(JSON.stringify(await page.evaluate(() => window.__kh.profile(30)), null, 1));

// The CPU profile put 91.6% of a three-enemy frame in `_closestToMesh → segToTriangle`,
// reached from every enemy capsule step. If that cost is driven by *which* triangle-mesh
// collider the capsule is near, the fix for the rig is to fight where the game's own
// encounters fight; if it is uniform, the rig cannot afford combat at all and the
// scenarios have to shrink. Either way it is measured, not assumed.
console.log('--- collider inventory ---');
console.log(JSON.stringify(await page.evaluate(() => {
  const ph = window.__kagerou.physics;
  const cols = ph.statics || [];
  const byKind = {};
  let meshTris = 0;
  const big = [];
  for (const c of cols) {
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    if (c.kind === 'triangleMesh' && c.bvh) {
      const n = c.bvh.triCount || 0;
      meshTris += n;
      if (n > 200) big.push({ tris: n, owner: c.owner?.name || c.userData?.name || null, surface: c.surface });
    }
  }
  return {
    total: cols.length, byKind, triangleMeshTriangles: Math.round(meshTris),
    largest: big.sort((a, b) => b.tris - a.tris).slice(0, 8),
    narrowphaseChecksLastFrame: ph.stats.narrowphaseChecks,
    broadphaseChecksLastFrame: ph.stats.broadphaseChecks,
  };
}), null, 1));

console.log('--- 3 enemies at the gravel arena (LAYOUT.arena 0, 26) ---');
console.log(JSON.stringify(await page.evaluate(() => {
  const k = window.__kagerou;
  k.enemies.despawnAll();
  const p = k.player;
  const g = k.physics.raycastDown(0, 60, 26, 200, 17);
  const y = g && g.hit ? g.point.y : p.root.position.y;
  p.root.position.set(0, y, 26);
  p.controller?.teleport?.(0, y, 26);
  k.enemies.spawnWave(3, { seed: 0x51ed, alerted: true });
  return { x: 0, y: +y.toFixed(2), z: 26 };
}), null, 1));
await page.evaluate(() => window.__kh.pump(4));
console.log(JSON.stringify(await page.evaluate(() => window.__kh.profile(30)), null, 1));

await browser.close();
server.close();
