#!/usr/bin/env node
/**
 * interaction-score.mjs — re-derive the verdicts from traces already on disk.
 *
 * The rig's whole point is that it records and something else judges, so a metric that
 * turns out to be wrong should never cost another capture. This reads
 * `shots/interaction-<tag>/*.json` plus the extras already in the report, runs
 * `interaction-metrics.mjs` over them, and rewrites the report's `results` and `summary`
 * in place. Nothing about the recorded evidence changes.
 *
 *   node tools/interaction-score.mjs --tag=i1
 *   node tools/interaction-score.mjs --tag=i1 --print
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAll, summarise } from './interaction-metrics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shots');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const TAG = argv.tag ? String(argv.tag) : 'i1';

const reportPath = join(OUT, `interaction-${TAG}.json`);
const traceDir = join(OUT, `interaction-${TAG}`);
if (!existsSync(reportPath)) { console.error(`no ${reportPath}`); process.exit(2); }
if (!existsSync(traceDir)) { console.error(`no ${traceDir}`); process.exit(2); }

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const traces = readdirSync(traceDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => { try { return JSON.parse(readFileSync(join(traceDir, f), 'utf8')); } catch { return null; } })
  .filter(Boolean);

report.results = evaluateAll(traces, report.extras || {});
report.summary = summarise(report.results);
report.rescoredAt = new Date().toISOString();
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`re-scored ${traces.length} traces → ${reportPath}`);
console.log(`verdicts: ${JSON.stringify(report.summary.verdicts)}`);
for (const r of report.results) {
  console.log(`  ${r.verdict.toUpperCase().padEnd(12)} ${r.criterion.padEnd(16)} ${r.element.padEnd(16)} ${r.scenario}`);
  if (argv.print) {
    console.log(`      measured: ${JSON.stringify(r.measured)}`);
    console.log(`      detail:   ${r.detail ?? ''}`);
  }
}
