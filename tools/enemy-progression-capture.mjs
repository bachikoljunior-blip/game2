#!/usr/bin/env node
// Normal production boot + real DOM keyboard input. No teleport, encounter reset,
// spawnWave call, virtual clock, replacement renderer, or injected game state.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';
import { launchHeadless } from '../.kit/lib/browser/launch.mjs';
import { waitForBoot } from '../.kit/lib/browser/boot.mjs';
import { revision } from '../.kit/lib/release/revision.mjs';
import { verifyServed } from '../.kit/lib/release/verifyServed.mjs';

const opts = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const root = resolve(opts.root || 'docs');
const tag = opts.tag || 'enemy-progression';
assert.match(tag, /^[a-zA-Z0-9_-]+$/);
const out = resolve('shots', tag);
mkdirSync(out, { recursive: true });
const report = {
  status: 'FAIL',
  startedAt: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Normal production boot, real keyboard movement, authored Level trigger and EnemyManager spawn.',
  exclusions: ['No spawnWave or teleport.', 'SwiftShader is not physical-device performance.', 'No full-game or visual-quality acceptance is claimed.'],
  errors: [],
};
const save = () => writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let server;
let browser;

try {
  if (!opts.url) server = await serveStatic({ root, basePath: '/game2/docs' });
  const url = (opts.url || server.origin).replace(/\/$/, '') + '/';
  report.url = url;
  const expectedRevision = revision.verify(readFileSync(join(root, 'index.html'), 'utf8'));
  const served = await verifyServed({
    url,
    expectedRevision,
    attempts: opts.url ? 36 : 1,
    markers: ['id="game-canvas"', 'assets/index-'],
    onAttempt: (attempt, failures) => console.log('[enemy-progression] served attempt', attempt, failures),
  });
  report.served = { ...served, html: undefined };
  assert.equal(served.ok, true, JSON.stringify(served.failures));
  browser = await launchHeadless({ proxy: false });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ type: 'console', text: message.text(), location: message.location() });
  });
  page.on('requestfailed', (request) => report.errors.push({ type: 'request', url: request.url(), text: request.failure()?.errorText }));
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push({ type: 'http', url: response.url(), status: response.status() });
  });

  // debug only exposes the existing runtime for observation; movement and spawning stay on normal production paths.
  await page.goto(url + '?q=low&debug=1', { waitUntil: 'load', timeout: 120000 });
  report.boot = await waitForBoot(page, {
    readyExpr: 'window.__kagerouReady === true', statusSelector: '#boot-status', timeout: 420000,
  });
  assert.equal(report.boot.booted, true, JSON.stringify(report.boot));

  // Observe the real call without changing its arguments, return value or timing.
  await page.evaluate(() => {
    const k = window.__kagerou;
    window.__normalSpawnEvidence = { calls: [], hits: [] };
    const original = k.enemies.spawn.bind(k.enemies);
    k.enemies.spawn = (...args) => {
      const [archetype, position, options] = args;
      window.__normalSpawnEvidence.calls.push({
        archetype,
        position: position?.toArray?.() || null,
        spawnPoint: options?.spawnPoint || null,
        alerted: options?.alerted === true,
      });
      return original(...args);
    };
    k.bus.on('hit', (event) => window.__normalSpawnEvidence.hits.push({
      attacker: event?.attacker?.faction || null,
      target: event?.target?.faction || null,
      damage: event?.damage || 0,
    }));
  });

  await page.locator('#boot-start').click();
  await page.waitForFunction(() => window.__kagerou.engine.running && window.__kagerou.engine.frame >= 3,
    null, { timeout: 240000, polling: 250 });
  report.initial = await page.evaluate(() => ({
    position: window.__kagerou.player.position.toArray(),
    encounter: window.__kagerou.level._enc.active?.id || null,
  }));
  assert.ok(report.initial.position[2] > 72.5, 'normal start must begin on the authored approach');

  // Clear the opening card and most of the approach at normal speed, then tap
  // through the final metres. Software rendering can block the test-side poll
  // for several game frames; holding W all the way to the trigger would carry
  // the player through the waiting formation before key-up is delivered.
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__kagerou.player.position.z < 52,
    null, { timeout: 240000, polling: 50 });
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.__kagerou.menus._title < 0,
    null, { timeout: 15000, polling: 100 });
  for (let step = 0; step < 40; step++) {
    const armed = await page.evaluate(() => window.__kagerou.level._enc.active?.id === 'forecourt'
      && window.__kagerou.level._enc.armed === true);
    if (armed) break;
    await page.keyboard.press('KeyW', { delay: 90 });
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => window.__kagerou.level._enc.active?.id === 'forecourt'
      && window.__kagerou.level._enc.armed === true,
    null, { timeout: 10000, polling: 50 });
  await page.waitForFunction(() => window.__normalSpawnEvidence.calls.length >= 2,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(100);

  report.appearance = await page.evaluate(() => {
    const k = window.__kagerou;
    return {
      position: k.player.position.toArray(),
      encounter: k.level._enc.active?.id || null,
      calls: window.__normalSpawnEvidence.calls.slice(),
      enemies: k.enemies.list.map((enemy) => {
        const screen = enemy.position.clone().setY(enemy.position.y + enemy.height * 0.55).project(k.camera);
        return {
          archetype: enemy.archetype,
          position: enemy.position.toArray(),
          screen: screen.toArray(),
          inFrame: Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && screen.z >= -1 && screen.z <= 1,
          rootVisible: enemy.root.visible,
          alive: enemy.isAlive,
          health: enemy.health,
        };
      }),
      drawCalls: k.engine.stats.drawCalls,
      triangles: k.engine.stats.triangles,
    };
  });
  assert.equal(report.appearance.encounter, 'forecourt');
  assert.deepEqual(report.appearance.calls.slice(0, 2).map((call) => call.archetype), ['ashigaru', 'ashigaru']);
  assert.deepEqual(report.appearance.calls.slice(0, 2).map((call) => call.spawnPoint), ['torii_c', 'torii_l']);
  assert.ok(report.appearance.calls.slice(0, 2).every((call) => call.alerted));
  assert.ok(report.appearance.enemies.length >= 2);
  assert.ok(report.appearance.enemies.slice(0, 2).every((enemy) => enemy.rootVisible && enemy.alive));
  assert.ok(report.appearance.enemies.some((enemy) => enemy.inFrame), 'at least one live enemy must project into the rendered frame');
  assert.ok(report.appearance.drawCalls > 0 && report.appearance.triangles > 0);
  await page.screenshot({ path: join(out, 'enemy-visible.png') });

  // Stay on the public input surface and demonstrate that the spawned actors are
  // live combatants. Either faction landing a hit is sufficient for this smoke gate.
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => window.__kagerou.playerCamera.lockTarget?.isAlive === true,
    null, { timeout: 10000, polling: 50 });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => {
    const k = window.__kagerou;
    const target = k.playerCamera.lockTarget;
    return target && Math.hypot(target.position.x - k.player.position.x,
      target.position.z - k.player.position.z) <= 1.60;
  }, null, { timeout: 10000, polling: 50 });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
  for (let i = 0; i < 18; i++) {
    // Ashigaru will circle and back-step between swings. Re-close through the
    // normal movement input instead of assuming the first approach remains in
    // katana range for the whole exchange.
    const distance = await page.evaluate(() => {
      const k = window.__kagerou;
      const target = k.playerCamera.lockTarget;
      return target ? Math.hypot(target.position.x - k.player.position.x,
        target.position.z - k.player.position.z) : Infinity;
    });
    if (distance > 1.65) {
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => {
        const k = window.__kagerou;
        const target = k.playerCamera.lockTarget;
        return target && Math.hypot(target.position.x - k.player.position.x,
          target.position.z - k.player.position.z) <= 1.55;
      }, null, { timeout: 5000, polling: 50 });
      await page.keyboard.up('KeyW');
    }
    await page.mouse.click(360, 165);
    if (await page.evaluate(() => window.__normalSpawnEvidence.hits.length > 0)) break;
    await page.waitForTimeout(320);
  }
  report.combat = await page.evaluate(() => {
    const k = window.__kagerou;
    const target = k.playerCamera.lockTarget;
    return {
      hits: window.__normalSpawnEvidence.hits.slice(),
      playerHealth: k.player.health,
      playerState: k.player.state,
      targetDistance: target ? Math.hypot(target.position.x - k.player.position.x,
        target.position.z - k.player.position.z) : null,
      enemies: k.enemies.list.map((enemy) => ({ archetype: enemy.archetype,
        health: enemy.health, state: enemy.state })),
    };
  });
  await page.waitForFunction(() => window.__normalSpawnEvidence.hits.length > 0,
    null, { timeout: 30000, polling: 100 });
  await page.screenshot({ path: join(out, 'enemy-combat.png') });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.status = 'PASS';
  await context.close();
} catch (error) {
  report.error = error.stack || String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  await browser?.close();
  await server?.close();
}

console.log(JSON.stringify(report, null, 2));
