import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = 'https://bachikoljunior-blip.github.io/game2/preview/';
const source = 'a6722c5cf7b1933f1956c6c33ec4edc6adf47640';
const out = new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-public-preview/', import.meta.url);
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('../preview/build-provenance.json', import.meta.url), 'utf8'));
const report = { checkedAt: new Date().toISOString(), checkerRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceRevision: source, base, environment: 'GitHub-hosted Chromium with SwiftShader; not physical-device performance',
  files: [], checks: [], errors: [], states: {}, result: 'running' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const state = page => page.evaluate(() => { const d = freshDiagnostics(); return { running: d.running, paused: d.paused,
  worldTime: d.world.time, player: d.world.player, totals: d.world.totals, orbit: d.input.orbit, render: d.render }; });
let browser;
const launch = () => chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const attach = page => {
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()}: ${r.url()}`); });
};
async function open(page) {
  attach(page);
  const response = await page.goto(`${base}?diagnostic=1`);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.freshDiagnostics?.().render.calls > 0, null, { timeout: 90000 });
  assert.equal(await page.locator('#start').isEnabled(), true);
}
try {
  assert.equal(manifest.sourceRevision, source);
  for (const file of manifest.files) {
    const url = new URL(file.path, base).href;
    const response = await fetch(url); assert.equal(response.status, 200, url);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = digest(bytes); assert.equal(actual, file.sha256, `published bytes: ${url}`);
    report.files.push({ url, status: response.status, bytes: bytes.length, sha256: actual, matchesVerifiedBuild: true });
  }
  report.checks.push('public HTML, JavaScript and CSS match verified preview manifest');
  browser = await launch();
  const pc = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await open(pc); await pc.click('#start'); await pc.waitForFunction(() => freshDiagnostics().running);
  report.states.pcStart = await state(pc);
  await pc.screenshot({ path: new URL('pc-start.png', out).pathname });
  await pc.keyboard.down('KeyW');
  try { await pc.waitForFunction(z => Math.abs(freshDiagnostics().world.player.z - z) > .5, report.states.pcStart.player.z, { timeout: 30000 }); }
  finally { await pc.keyboard.up('KeyW'); }
  report.states.pcMoved = await state(pc);
  assert.equal(report.states.pcMoved.totals.swings, 0);
  await pc.mouse.move(800, 250); await pc.mouse.down(); await pc.mouse.move(875, 250, { steps: 4 }); await pc.mouse.up();
  await pc.waitForFunction(() => Math.abs(freshDiagnostics().input.orbit) > .2);
  assert.equal((await state(pc)).totals.swings, 0);
  await pc.mouse.click(800, 250); await pc.waitForFunction(() => freshDiagnostics().world.totals.swings === 1);
  report.states.pcAttack = await state(pc);
  await pc.screenshot({ path: new URL('pc-moved-attack.png', out).pathname });
  report.checks.push('public PC starts and moves by keyboard; drag rotates without attacking; click attacks once');
  await browser.close(); browser = await launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage(); await open(page); await page.tap('#start');
  await page.waitForFunction(() => freshDiagnostics().running);
  report.states.touchStart = await state(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  for (const [name, x] of [['short', 545], ['long', 410]]) {
    const before = await state(page);
    await touch('touchStart', [{ id: 11, x: 540, y: 145 }]);
    await touch('touchMove', [{ id: 11, x, y: 147 }]);
    await touch('touchEnd', []);
    await page.waitForFunction(t => freshDiagnostics().world.time > t + .3, before.worldTime);
    const after = await state(page); assert.equal(after.totals.swings, before.totals.swings, `${name} swipe must not attack`);
    if (name === 'long') assert.ok(Math.abs(after.orbit - before.orbit) > .2);
    report.states[`touch${name}Swipe`] = after;
  }
  await touch('touchStart', [{ id: 11, x: 540, y: 145 }]); await touch('touchCancel', []);
  assert.equal((await state(page)).totals.swings, 0);
  await page.screenshot({ path: new URL('touch-view-rotated.png', out).pathname });
  await page.tap('[data-action=attack]'); await page.waitForFunction(() => freshDiagnostics().world.totals.swings === 1);
  report.states.touchAttack = await state(page);
  await page.screenshot({ path: new URL('touch-dedicated-attack.png', out).pathname });
  report.checks.push('public touch starts; short/long/cancelled canvas gestures do not attack; long swipe rotates; dedicated button attacks once');
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error); process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
