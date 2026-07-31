#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './luma.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const tag = String(args.tag || '').replace(/^-/, '');
if (!tag) {
  console.error('usage: verify-lantern-spill.mjs --tag=<A/B capture tag>');
  process.exit(2);
}

const reportPath = join(root, 'shots', `report-${tag}.json`);
if (!existsSync(reportPath)) {
  console.error(`[lantern-spill] missing capture report: ${reportPath}`);
  process.exit(2);
}
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const profile = report.profiles?.phone;
const pair = profile?.abShots?.hero;
const runtime = profile?.stats?.lanternSpill;
if (!pair?.on || !pair?.off || !runtime) {
  console.error('[lantern-spill] report needs phone hero A/B images and lanternSpill runtime data');
  process.exit(2);
}

const localPath = (value) => isAbsolute(value) ? value : resolve(root, value);
const onPath = localPath(pair.on), offPath = localPath(pair.off);
if (!existsSync(onPath) || !existsSync(offPath)) {
  console.error(`[lantern-spill] missing A/B image: ${!existsSync(onPath) ? onPath : offPath}`);
  process.exit(2);
}
const on = decodePNG(readFileSync(onPath));
const off = decodePNG(readFileSync(offPath));
if (on.width !== off.width || on.height !== off.height || on.channels !== off.channels) {
  console.error('[lantern-spill] A/B image dimensions differ');
  process.exit(2);
}

// Ignore sub-four-code-value noise. The capture rig freezes the engine and re-seeds
// PostFX temporal phase for the pair; this small floor also makes the gate insensitive
// to the final PNG encoder's one-code-value rounding at a pool rim.
const deltaThreshold = 4;
// A second population distinguishes a broad, low-energy falloff from a stamped
// high-energy disc. The old aggregate on/off ratio rewarded concentrating the
// same light into a hard centre; a soft receiver must retain both populations.
const strongDeltaThreshold = 32;
let changed = 0, strong = 0, positive = 0, negative = 0;
let sumDeltaLuma = 0, sumOnLuma = 0, sumOffLuma = 0;
let sumDr = 0, sumDg = 0, sumDb = 0;
let minX = on.width, minY = on.height, maxX = -1, maxY = -1;
for (let y = 0; y < on.height; y++) {
  for (let x = 0; x < on.width; x++) {
    const i = (y * on.width + x) * on.channels;
    const dr = on.data[i] - off.data[i];
    const dg = on.data[i + 1] - off.data[i + 1];
    const db = on.data[i + 2] - off.data[i + 2];
    const maxDelta = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
    if (maxDelta < deltaThreshold) continue;
    if (maxDelta >= strongDeltaThreshold) strong++;
    const deltaLuma = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
    const onLuma = 0.2126 * on.data[i] + 0.7152 * on.data[i + 1] + 0.0722 * on.data[i + 2];
    const offLuma = 0.2126 * off.data[i] + 0.7152 * off.data[i + 1] + 0.0722 * off.data[i + 2];
    changed++;
    if (deltaLuma > 0) positive++;
    else if (deltaLuma < 0) negative++;
    sumDeltaLuma += deltaLuma;
    sumOnLuma += onLuma;
    sumOffLuma += offLuma;
    sumDr += dr; sumDg += dg; sumDb += db;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
}

const total = on.width * on.height;
const metrics = changed ? {
  deltaThreshold,
  strongDeltaThreshold,
  changedPixels: changed,
  changedCoverage: +(changed / total).toFixed(5),
  strongPixels: strong,
  strongCoverage: +(strong / total).toFixed(5),
  tailToCoreCoverage: strong ? +(changed / strong).toFixed(3) : null,
  positiveShare: +(positive / changed).toFixed(5),
  negativeShare: +(negative / changed).toFixed(5),
  meanLumaDelta: +(sumDeltaLuma / changed).toFixed(2),
  onOffLumaRatio: +(sumOnLuma / sumOffLuma).toFixed(3),
  meanDeltaRGB: [sumDr, sumDg, sumDb].map((value) => +(value / changed).toFixed(2)),
  changedBounds: { minX, minY, maxX, maxY, minYRatio: +(minY / on.height).toFixed(3) },
} : null;

const [dr, dg, db] = metrics?.meanDeltaRGB ?? [0, 0, 0];
const checks = [
  {
    id: 'instance-surface-contract',
    pass: runtime.count > 0 && runtime.matchesLanternCount
      && runtime.minTerrainClearance >= 0.01 && runtime.maxTerrainClearance <= 0.18
      && runtime.maxTilt <= 0.0001 && runtime.localNormalY >= 0.99
      && runtime.blending === 2 && runtime.depthWrite === false,
    metrics: runtime,
    expected: 'One upward-facing, horizontal additive pool per lantern, 10-180 mm above terrain/slab reference.',
  },
  {
    id: 'visible-warm-receiver-contribution',
    pass: !!metrics
      && metrics.changedCoverage >= 0.03 && metrics.changedCoverage <= 0.06
      && metrics.strongCoverage >= 0.015 && metrics.tailToCoreCoverage >= 1.8
      && metrics.positiveShare >= 0.99 && metrics.negativeShare <= 0.01
      && metrics.meanLumaDelta >= 20
      && dr > dg && dg > db && db > 0
      && metrics.changedBounds.minYRatio >= 0.55,
    metrics,
    expected: 'The stopped-frame A/B adds a warm lower-frame pool with a measurable core and broad soft tail, without a dark card or unrelated upper-frame change.',
  },
];

const output = {
  schemaVersion: 1,
  criterion: 'R9-LANTERN-SPILL-001',
  tag,
  generatedAt: new Date().toISOString(),
  revision: report.revision,
  build: report.build,
  command: `node tools/verify-lantern-spill.mjs --tag=${tag}`,
  sourcePair: { on: pair.on, off: pair.off },
  checks,
  pass: checks.every((check) => check.pass),
  limitation: 'This verifies the baked ground receiver only. R9-LANTERN-001 still separately requires post illumination and a readable 1-2 m falloff.',
};

const outDir = join(root, 'AI_DEVELOPMENT', 'EVIDENCE');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${tag}-lantern-spill.json`);
writeFileSync(outPath, JSON.stringify(output, null, 2));
for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.id}`);
console.log(`wrote ${outPath}`);
process.exit(output.pass ? 0 : 1);
