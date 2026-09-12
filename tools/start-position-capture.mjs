#!/usr/bin/env node
// Real production rendering and DOM input. No teleports, virtual clock or replacement renderer.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { devices } from 'playwright';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';
import { launchHeadless } from '../.kit/lib/browser/launch.mjs';
import { waitForBoot } from '../.kit/lib/browser/boot.mjs';
import { revision } from '../.kit/lib/release/revision.mjs';
import { verifyServed } from '../.kit/lib/release/verifyServed.mjs';

const opts = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
const root = resolve(opts.root || 'docs');
const tag = opts.tag || 'start-position';
assert.match(tag, /^[a-zA-Z0-9_-]+$/);
const out = resolve('shots', tag);
mkdirSync(out, { recursive: true });
const control = opts.control === 'true';
const report = { status: 'FAIL', startedAt: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: control ? 'Baseline observation; not a passing start-position gate' : 'Start-position hotfix only',
  limits: ['SwiftShader is not physical-device performance.', 'No full-game or art acceptance is claimed.'],
  profile: { width: 568, height: 320, deviceScaleFactor: 1, quality: 'low' }, sessions: [] };
let server, browser;
const save = () => writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = (base, rel = '') => readdirSync(join(base, rel), { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap(e => e.isDirectory() ? files(base, join(rel, e.name)) : [join(rel, e.name)]);

try {
  if (!opts.url) server = await serveStatic({ root, basePath: '/game2/docs' });
  const url = (opts.url || server.origin).replace(/\/$/, '') + '/';
  report.url = url;
  if (!control) {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const expected = revision.verify(html);
    // The same integrity gate must reject a one-byte change, not silently accept it.
    const tamper = await verifyServed({ url, expectedRevision: expected, attempts: 1,
      fetchImpl: async () => new Response(html.replace('<title>', '<title>X')) });
    assert.equal(tamper.ok, false, 'tampered HTML must fail');
    const served = await verifyServed({ url, expectedRevision: expected, attempts: opts.url ? 36 : 1,
      markers: ['id="game-canvas"', 'assets/index-'],
      onAttempt: x => console.log('[start-position] served verification', JSON.stringify(x).slice(0, 400)) });
    report.served = { ...served, html: undefined, tamperRejected: !tamper.ok };
    assert.equal(served.ok, true, JSON.stringify(served.failures));
    report.payload = [];
    for (const file of files(root).filter(x => x !== '.nojekyll')) {
      const res = await fetch(new URL(file + '?verify=' + Date.now(), url), { cache: 'no-store' });
      assert.equal(res.status, 200, file);
      const expectedHash = sha(readFileSync(join(root, file)));
      const actualHash = sha(Buffer.from(await res.arrayBuffer()));
      report.payload.push({ file, expectedHash, actualHash });
      assert.equal(actualHash, expectedHash, file + ' served bytes');
    }
  }
  browser = await launchHeadless({ proxy: false });
  report.browser = browser.version();
  for (const surface of control ? ['keyboard'] : ['keyboard', 'touch']) {
    console.log('[start-position] boot ' + surface);
    const row = { surface, errors: [], warnings: [], positions: [], screenshots: [] };
    report.sessions.push(row); save();
    const context = await browser.newContext({ viewport: { width: 568, height: 320 }, deviceScaleFactor: 1,
      hasTouch: surface === 'touch', isMobile: surface === 'touch',
      ...(surface === 'touch' ? { userAgent: devices['iPhone 13'].userAgent } : {}) });
    // Exercise the normal Enter gate instead of the app's webdriver-only autostart.
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await context.newPage();
    page.on('pageerror', e => row.errors.push({ type: 'pageerror', text: e.message }));
    page.on('console', m => {
      if (m.type() === 'error') row.errors.push({ type: 'console', text: m.text() });
      if (m.type() === 'warning') row.warnings.push(m.text());
    });
    page.on('requestfailed', r => row.errors.push({ type: 'request', url: r.url(), text: r.failure()?.errorText }));
    page.on('response', r => { if (r.status() >= 400) row.errors.push({ type: 'http', url: r.url(), status: r.status() }); });
    const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 240000, polling: 500 });
    const snapshot = () => page.evaluate(() => {
      const k = window.__kagerou;
      return { position: k.player.position.toArray(), capsule: k.player.controller.position.toArray(),
        authored: k.level.spawnPoints.player.position.toArray(), frame: k.engine.frame,
        running: k.engine.running, paused: k.engine.paused, alive: k.player.isAlive,
        inputEnabled: k.input.enabled, moveMag: k.input.state.moveMag, drawCalls: k.engine.stats.drawCalls,
        triangles: k.engine.stats.triangles, menu: k.menus.mode, terrainY: k.terrain.heightAt(k.player.position.x, k.player.position.z) };
    });
    await page.goto(url + '?q=low', { waitUntil: 'load', timeout: 120000 });
    row.boot = await waitForBoot(page, { readyExpr: 'window.__kagerouReady === true', statusSelector: '#boot-status', timeout: 420000 });
    assert.equal(row.boot.booted, true, JSON.stringify(row.boot));
    row.initial = await snapshot();
    assert.equal(row.initial.position[2], control ? 8 : 73, 'actual normal-boot spawn');
    if (!control) assert.deepEqual(row.initial.position, row.initial.authored);
    if (surface === 'touch') await page.locator('#boot-start').tap();
    else await page.locator('#boot-start').click();
    await wait(() => window.__kagerou.engine.frame >= 3 && window.__kagerou.engine.running);
    const shot = async name => {
      const path = join(out, surface + '-' + name + '.png');
      await page.screenshot({ path }); row.screenshots.push(path);
    };
    await shot('start');
    row.beforeInput = await snapshot();
    let cdp;
    if (surface === 'keyboard') await page.keyboard.down('KeyW');
    else {
      cdp = await context.newCDPSession(page);
      // A real browser touch stream on the floating movement-stick half.
      const point = { x: 110, y: 240, id: 1, radiusX: 4, radiusY: 4, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: 164 }] });
    }
    await wait(() => window.__kagerou.input.state.moveMag > 0.9);
    row.acceptedInput = await snapshot();
    if (control) await wait(f => window.__kagerou.engine.frame >= f + 90, row.beforeInput.frame);
    else await wait(() => window.__kagerou.player.position.z < 61);
    if (surface === 'keyboard') await page.keyboard.up('KeyW');
    else await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    row.afterWalk = await snapshot();
    await shot('after-walk');
    if (!control) {
      assert.ok(row.beforeInput.position[2] - row.afterWalk.position[2] > 10, 'leave the start and pass the first torii');
      assert.ok(row.afterWalk.alive && row.afterWalk.running && row.afterWalk.drawCalls > 0 && row.afterWalk.triangles > 0);
      assert.ok(row.afterWalk.position.every(Number.isFinite));
      await wait(() => window.__kagerou.menus._title < 0);
      await page.keyboard.press('Escape');
      await wait(() => window.__kagerou.menus.mode === 'pause');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await wait(() => window.__kagerou.menus.mode === 'none' && window.__kagerou.player.position.z > 72.5);
      row.afterRetry = await snapshot();
      assert.ok(Math.abs(row.afterRetry.position[0]) < 0.1 && Math.abs(row.afterRetry.position[2] - 73) < 0.1);
      assert.ok(row.afterRetry.inputEnabled && !row.afterRetry.paused && row.afterRetry.alive);
      await shot('retry');
      assert.equal(row.errors.length, 0, JSON.stringify(row.errors));
    }
    row.status = control ? 'OBSERVED_CONTROL' : 'PASS';
    save(); console.log('[start-position] ' + JSON.stringify(row));
    await context.close();
  }
  report.status = control ? 'OBSERVED_CONTROL' : 'PASS';
} catch (error) {
  report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); save();
  await browser?.close(); await server?.close();
}
