#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((part) => {
  const [key, ...value] = part.replace(/^--/, '').split('=');
  return [key, value.join('=') || true];
}));
const url = String(args.url || 'https://bachikoljunior-blip.github.io/game2/');
const timeout = Number(args.timeout || 120000);
const output = resolve(root, String(args.out || 'AI_DEVELOPMENT/EVIDENCE/pages-verification.json'));

const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
const badResponses = [];
const browser = await chromium.launch({
  headless: true,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: [
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
  ],
});

let report;
try {
  const page = await browser.newPage({
    viewport: { width: 1266, height: 585 },
    ignoreHTTPSErrors: process.env.CODEX_NETWORK_PROXY_ACTIVE === '1',
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });

  const entry = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForURL(/\/docs\//, { timeout });
  await page.waitForFunction(() => window.__kagerouReady === true, null, { timeout });
  const ready = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    module: [...document.scripts].find((script) => script.type === 'module')?.src || null,
    ready: window.__kagerouReady === true,
    startReady: document.querySelector('#boot-start')?.classList.contains('ready') || false,
    bootStatus: document.querySelector('#boot-status')?.textContent || null,
    tier: window.__kagerou?.quality?.name || null,
    drawingBuffer: window.__kagerou?.engine?.drawingBufferSize?.toArray?.() || null,
  }));
  const wasAlreadyRunning = await page.evaluate(() => (
    document.querySelector('#boot')?.classList.contains('hidden')
    && window.__kagerou?.engine?.running === true
  ));
  // `navigator.webdriver` deliberately autostarts the capture surface. A DOM click invokes
  // the same user control when still pending and is harmless after the idempotent start ran.
  await page.locator('#boot-start').evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector('#boot')?.classList.contains('hidden')
    && window.__kagerou?.engine?.running === true
  ), null, { timeout });
  await page.waitForTimeout(750);
  const running = await page.evaluate(() => ({
    bootHidden: document.querySelector('#boot')?.classList.contains('hidden') || false,
    engineRunning: window.__kagerou?.engine?.running === true,
    drawCalls: window.__kagerou?.engine?.stats?.drawCalls ?? null,
    triangles: window.__kagerou?.engine?.stats?.triangles ?? null,
  }));
  running.wasAlreadyRunning = wasAlreadyRunning;
  if (args.screenshot) await page.screenshot({ path: resolve(root, String(args.screenshot)), fullPage: true });

  report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    requestedUrl: url,
    entryStatus: entry?.status() ?? null,
    finalUrl: ready.url,
    ready,
    running,
    pageErrors,
    consoleErrors,
    requestFailures,
    badResponses,
  };
} finally {
  await browser.close();
}

const failures = [];
if (report.entryStatus !== 200) failures.push(`entry status ${report.entryStatus}`);
if (!report.finalUrl.includes('/docs/')) failures.push(`not on production path: ${report.finalUrl}`);
if (!report.ready.ready || !report.ready.startReady || report.ready.bootStatus !== 'ready') failures.push('boot readiness failed');
if (!/\/assets\/index-[^/]+\.js$/.test(report.ready.module || '')) failures.push(`unexpected module ${report.ready.module}`);
if (!report.running.bootHidden || !report.running.engineRunning) failures.push('interactive start failed');
if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);
if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`);
if (requestFailures.length) failures.push(`${requestFailures.length} request failure(s)`);
if (badResponses.length) failures.push(`${badResponses.length} HTTP error response(s)`);

report.status = failures.length ? 'failed' : 'passed';
report.failures = failures;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[pages] ${report.status.toUpperCase()}: ${report.finalUrl}`);
console.log(`[pages] ready=${report.ready.ready} running=${report.running.engineRunning} module=${report.ready.module}`);
console.log(`[pages] errors page=${pageErrors.length} console=${consoleErrors.length} request=${requestFailures.length} http=${badResponses.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
