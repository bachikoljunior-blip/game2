#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const tag = String(args.tag || '').replace(/^-/, '');
if (!tag) {
  console.error('usage: gate-capture-report.mjs --tag=<tag> [--profile=phone] [--allow-carried]');
  process.exit(2);
}

const profileName = String(args.profile || 'phone');
const reportPath = join(root, 'shots', `report-${tag}.json`);
const errors = [];
const requiredShots = ['hero', 'wide', 'torii', 'valley', 'sun'];

if (!existsSync(reportPath)) {
  console.error(`[capture-gate] FAIL: missing ${reportPath}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`[capture-gate] FAIL: ${error.message}`);
  process.exit(1);
}

if (report.schemaVersion !== 1) errors.push('report schemaVersion must be 1');
if (report.mode !== 'review') errors.push(`mode must be review, got ${report.mode}`);
if (!report.revision?.sha) errors.push('missing git revision SHA');
if (!report.build?.fingerprint) errors.push('missing build fingerprint');

const profile = report.profiles?.[profileName];
if (!profile) errors.push(`missing profile ${profileName}`);
if (profile) {
  if (!profile.booted) errors.push(`${profileName}: booted is false`);
  if (profile.carriedOnly && !args['allow-carried']) {
    errors.push(`${profileName}: carried-only report cannot establish a full verification baseline`);
  }
  if (!profile.stats) errors.push(`${profileName}: missing runtime stats`);
  if (profile.stats && profileName === 'phone' && profile.stats.tier !== 1) {
    errors.push(`${profileName}: expected MEDIUM tier 1, got ${profile.stats.tier}`);
  }
  const spill = profile.stats?.lanternSpill;
  if (spill) {
    if (!(spill.count > 0)) errors.push(`${profileName}: lantern spill has no instances`);
    if (!spill.matchesLanternCount) errors.push(`${profileName}: lantern spill count does not match lantern count`);
    if (!Number.isFinite(spill.minTerrainClearance) || spill.minTerrainClearance < 0.005) {
      errors.push(`${profileName}: lantern spill is buried (minimum clearance ${spill.minTerrainClearance})`);
    }
    if (!Number.isFinite(spill.maxTilt) || spill.maxTilt > 0.00001) {
      errors.push(`${profileName}: lantern spill is tilted (${spill.maxTilt})`);
    }
    if (!Number.isFinite(spill.localNormalY) || spill.localNormalY < 0.99) {
      errors.push(`${profileName}: lantern spill faces away from the camera (normal Y ${spill.localNormalY})`);
    }
    if (spill.blending !== 2) errors.push(`${profileName}: lantern spill must use additive blending`);
    if (!Number.isFinite(spill.opacity) || spill.opacity <= 0 || spill.opacity >= 0.75) {
      errors.push(`${profileName}: lantern spill opacity must preserve the ground texture (${spill.opacity})`);
    }
    if (spill.depthWrite) errors.push(`${profileName}: lantern spill must not write depth`);
  }
  for (const shot of requiredShots) {
    const file = profile.shots?.[shot];
    if (!file || !existsSync(file)) errors.push(`${profileName}/${shot}: missing screenshot`);
    const histogram = profile.histograms?.[shot];
    if (!histogram) errors.push(`${profileName}/${shot}: missing histogram`);
    if (histogram) {
      if (histogram.width !== 2532 || histogram.height !== 1170) {
        errors.push(`${profileName}/${shot}: expected 2532x1170, got ${histogram.width}x${histogram.height}`);
      }
      if (!histogram.blackOk) errors.push(`${profileName}/${shot}: black gate failed at p0.1=${histogram.p01}`);
      if (!histogram.whiteOk) errors.push(`${profileName}/${shot}: highlight gate failed at p99.9=${histogram.p999}`);
    }
    if (!profile.perShot?.[shot]) errors.push(`${profileName}/${shot}: missing per-pose budget stats`);
  }

  const critical = /pageerror:|DEAD SHADER:|REVIEW SET INCOMPLETE|BUDGET:|histogram .*FAIL|screenshot .*:|shot .*:/;
  for (const message of profile.errors ?? []) {
    if (critical.test(message)) errors.push(`${profileName}: ${message}`);
  }

  const perShot = Object.entries(profile.perShot ?? {});
  const worstCalls = Math.max(0, ...perShot.map(([, value]) => value.drawCalls ?? 0));
  const worstTriangles = Math.max(0, ...perShot.map(([, value]) => value.triangles ?? 0));
  if (profileName === 'phone' && worstCalls > 140) errors.push(`draw calls ${worstCalls} exceed 140`);
  if (profileName === 'phone' && worstTriangles > 900000) errors.push(`triangles ${worstTriangles} exceed 900000`);
}

if (errors.length) {
  console.error(`[capture-gate] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const poses = Object.values(profile.perShot);
const worstCalls = Math.max(...poses.map((value) => value.drawCalls));
const worstTriangles = Math.max(...poses.map((value) => value.triangles));
console.log(`[capture-gate] PASS ${profileName}/${tag}: revision ${report.revision.sha.slice(0, 12)}, build ${report.build.fingerprint.slice(0, 12)}, worst ${worstCalls} calls / ${worstTriangles} triangles`);
