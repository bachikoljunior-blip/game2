#!/usr/bin/env node
/**
 * floor-gate.mjs — deterministic checks for the Section 0 floor.
 *
 * These exist because a run that skipped a floor item and reported it as satisfied is
 * otherwise indistinguishable from a run that performed it. Round 17 proved the point: a
 * commit removed the entire foliage system from every frame and the capture report still
 * came back booted, zero dead shaders, correct tier, every budget green — a *cleaner*
 * looking report than the working build it replaced, because a build that renders less
 * passes every cap more comfortably.
 *
 * Each check exits non-zero on failure. That is the whole contract: a job that only reports
 * and never fails does not satisfy F9.
 *
 *   node tools/floor-gate.mjs f2 --base=<ref>    state updated alongside product changes
 *   node tools/floor-gate.mjs f5                 independence level recorded in STATE.yaml
 *   node tools/floor-gate.mjs f6 --url=<url> --expect=<rev>   served revision matches
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'AI_DEVELOPMENT', 'STATE.yaml');

const argv = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function die(msg) { console.error(`FLOOR GATE FAIL: ${msg}`); process.exit(1); }
function ok(msg) { console.log(`floor gate ok: ${msg}`); process.exit(0); }

/** Product files whose change obliges an F2 state update. Docs and the state file itself
 *  are excluded: requiring a state update for a typo fix trains people to bypass the gate. */
const PRODUCT = /^(src\/|tools\/|vite\.config\.js|package\.json|index\.html)/;

function changedFiles(base) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: ROOT, encoding: 'utf8',
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function f2(base) {
  if (!base) die('f2 needs --base=<ref> to diff against');
  const files = changedFiles(base);
  const product = files.filter((f) => PRODUCT.test(f));
  if (!product.length) ok('no product files changed; no state update required');
  const stateTouched = files.some((f) => f === 'AI_DEVELOPMENT/STATE.yaml');
  if (!stateTouched) {
    die(`${product.length} product file(s) changed since ${base} without updating ` +
      `AI_DEVELOPMENT/STATE.yaml (F2 continuity write).\n  ` + product.slice(0, 20).join('\n  '));
  }
  ok(`${product.length} product file(s) changed and STATE.yaml was updated`);
}

function readState() {
  if (!existsSync(STATE)) die('AI_DEVELOPMENT/STATE.yaml missing (F1/F2 artifact)');
  return readFileSync(STATE, 'utf8');
}

function f5() {
  const s = readState();
  const m = s.match(/independence_level_used:\s*"?([A-D])\b/);
  if (!m) {
    die('floor.independence_level_used is absent or is not one of A/B/C/D in STATE.yaml ' +
      '(F5 requires the level actually used to be recorded)');
  }
  if (!/last_check:/.test(s)) die('floor.last_check missing from STATE.yaml');
  ok(`independence level ${m[1]} recorded`);
}

async function f6(url, expect) {
  if (!url || !expect) die('f6 needs --url=<public url> and --expect=<revision>');
  let body;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) die(`public surface returned HTTP ${res.status} for ${url}`);
    body = await res.text();
  } catch (e) {
    // Unreachable is NOT a pass. A gate that goes green when it cannot see the surface is
    // exactly the kind of check this file exists to replace.
    die(`could not reach ${url}: ${e.message}`);
  }
  if (!body.includes(expect)) {
    die(`served surface at ${url} does not carry the expected revision ${expect}; ` +
      `the intended revision is not the one being served`);
  }
  ok(`served revision ${expect} confirmed at ${url}`);
}

const cmd = process.argv[2];
if (cmd === 'f2') f2(argv.base);
else if (cmd === 'f5') f5();
else if (cmd === 'f6') await f6(argv.url, argv.expect);
else { console.error('usage: floor-gate.mjs f2|f5|f6 [...]'); process.exit(2); }
