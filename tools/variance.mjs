#!/usr/bin/env node
/**
 * variance.mjs — the run-to-run noise floor of this repository's review rig.
 *
 * Why this exists.
 *
 * Every before/after claim this project has made about a frame compares one capture against
 * one earlier capture. That is only evidence if the rig, run twice against a byte-identical
 * `dist/`, produces the same numbers — and nobody has ever checked whether it does. `survival`
 * checked its own vantage rig and found it does not: runs 1-4 against 5-8, within the baseline
 * alone and with nothing changed, differ by +16.9 with asymmetry 12, which is as much as a real
 * change moves it. That number is `survival`'s apparatus, not this one. It is the reason to
 * measure, never the measurement.
 *
 * What this produces is the number that lets a later round say "that moved more than noise".
 * Until it exists, fetching reference material buys nothing: the comparison it enables cannot
 * be told from drift.
 *
 * The design, and why it is 4+4 rather than some rounder number.
 *
 * Two batches of four, one unchanged build, the second batch collected as its own later run —
 * the control arm. `survival` proved the obvious cheaper defence does not work: build a null by
 * splitting one baseline every possible way and compare the candidate against it. With eight
 * runs there are C(8,4) = 70 such splits and **68 of them interleave the two collection
 * batches**, cancelling by construction exactly the drift being tested for, while every real
 * candidate arm *is* a separate later batch. Only 2 of the 70 — A|B and its mirror — separate
 * the batches at all.
 *
 * Matching that shape here is deliberate. It means `--analyse` can re-run the failed reasoning
 * on *this* rig's data and report whether the same structural blindness holds, instead of
 * importing a conclusion from another repository's apparatus. Either answer is a result: if the
 * true batch split sits in the tail of the 70, this rig drifts like `survival`'s and a control
 * arm is mandatory here too; if it sits mid-distribution, this rig does not, and that difference
 * between the two apparatuses is worth knowing before anyone assumes it either way.
 *
 * What this is NOT, and must not be used as.
 *
 * This measures the *capture rig* — the same build photographed repeatedly. It says nothing
 * about the variance of a critic's judgement of those frames, which is a separate arm nobody has
 * collected. Do not report a stable noise floor here as evidence that a review verdict is
 * reproducible.
 *
 * Relationship to `kit`'s `lib/mobile/roundCompare.mjs` (branch
 * `claude/iphone-se3-auto-testing-bu73vn`, kit 0.3.x — not vendored here yet).
 *
 * That module is the consumer of this file's output and the two do not overlap. It answers "is
 * this round worse than the last one" for a single pair of runs, and it carries
 * `DEFAULT_TOLERANCE = { relative: 0.25, absolute: 0 }`, which its own header describes as
 * "loose by design ... a gate that flakes gets switched off". That 25% is asserted, not
 * measured; this file measures what it should be. Its five refusals — self-comparison, a lost
 * metric, a vacuous comparison, a byte-identical copied report, a changed apparatus — are good
 * and are NOT re-implemented here; the checks below are the sixth one it does not have, which is
 * batch drift. When kit 0.3.x lands in this repository, the per-cell numbers written by
 * `--analyse` are what its tolerance should be read from. Do not copy that module into this
 * repository to make that link; this project has already paid once for a second copy of a
 * record.
 *
 *   node tools/variance.mjs --collect            # 4+4 captures, one frozen build, ~60 min
 *   node tools/variance.mjs --collect --runs=2   # shorter, for checking the apparatus itself
 *   node tools/variance.mjs --analyse            # per-cell distribution, batch shift, split null
 *
 * Exit codes: 0 clean, 1 a refusal fired, 2 usage error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, 'shots');
const OUT = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE', 'kit-variance.json');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));

const PROFILE = String(argv.profile || 'phone');
const RUNS = Number(argv.runs) || 4;
const BATCHES = ['a', 'b'];

/**
 * The cells. Every finite number the review rig emits per shot, from both of its two
 * independent measurement paths: the luma histogram read off the saved PNG, and the renderer's
 * own per-shot counters.
 *
 * `width`/`height`/`samples`/`transparentSkipped` are excluded because they are properties of
 * the framing rather than of the frame, and including constants would dilute every summary
 * statistic below with cells that cannot vary. `blackOk`/`whiteOk` are excluded because they are
 * the gate's verdict, not a measurement — a gate flipping is worth knowing, and is reported
 * separately rather than averaged.
 */
const LUMA_FIELDS = ['p01', 'p1', 'p10', 'p25', 'p50', 'p75', 'p90', 'p99', 'p999', 'iqr',
  'pctBelow16', 'pctAbove240', 'pctWarm', 'pctCool'];
const SHOT_FIELDS = ['drawCalls', 'triangles'];

function die(message) {
  console.error(`FAIL ${message}`);
  process.exit(2);
}

/** Content digest of the built tree, so "one unchanged build" is observed rather than assumed. */
function distDigest() {
  if (!existsSync(DIST)) die(`no build at ${DIST} — run npm run build before collecting`);
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) files.push(p);
    }
  })(DIST);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f.slice(DIST.length));
    h.update(createHash('sha256').update(readFileSync(f)).digest());
  }
  return { digest: h.digest('hex'), files: files.length };
}

/* ---------------------------------------------------------------- collect */

if (argv.collect) {
  const frozen = distDigest();
  console.log(`build frozen at ${frozen.digest.slice(0, 12)} (${frozen.files} files)`);
  console.log(`collecting ${BATCHES.length} batches of ${RUNS} at profile "${PROFILE}"\n`);

  const runs = [];
  for (const batch of BATCHES) {
    for (let i = 1; i <= RUNS; i += 1) {
      const tag = `var-${batch}${i}`;
      // Checked before every single run, not once at the start. The failure this catches is a
      // parallel `npm run build` rewriting `dist/` under the collection — which is a standing
      // trap in this repository's capture rig, and would otherwise turn "the rig drifted" into
      // the reported result of what was actually a different build.
      const now = distDigest();
      if (now.digest !== frozen.digest) {
        die(`dist changed before ${tag} (${frozen.digest.slice(0, 12)} -> ${now.digest.slice(0, 12)}) `
          + '— something rebuilt mid-collection; every run after the change measures a different build');
      }
      const startedAt = new Date().toISOString();
      const t0 = process.hrtime.bigint();
      console.log(`[${tag}] capturing...`);
      let failed = '';
      try {
        // Deliberately NOT `npm run review`, which passes `--diff`. That flag carries an
        // unchanged shot forward from the previous round instead of re-taking it, so a variance
        // run driven through it would compare frames to copies of themselves and report a noise
        // floor of exactly zero. The rig would look perfectly deterministic because it never ran.
        execFileSync('node', ['tools/capture.mjs', '--review', `--profile=${PROFILE}`, `--tag=${tag}`],
          { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      } catch (error) {
        failed = `capture exited ${error.status}`;
      }
      const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
      runs.push({ tag, batch, index: i, startedAt, seconds: +seconds.toFixed(1), failed });
      console.log(`[${tag}] ${failed || 'done'} in ${seconds.toFixed(0)}s`);
    }
  }

  const after = distDigest();
  const manifest = {
    schemaVersion: 1,
    profile: PROFILE,
    runsPerBatch: RUNS,
    build: { digest: frozen.digest, files: frozen.files, unchangedAfter: after.digest === frozen.digest },
    runs,
  };
  writeFileSync(join(SHOTS, 'variance-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nwrote shots/variance-manifest.json — now run: node tools/variance.mjs --analyse`);
  process.exit(runs.some((r) => r.failed) ? 1 : 0);
}

/* ---------------------------------------------------------------- analyse */

if (!argv.analyse) die('usage: node tools/variance.mjs --collect | --analyse');

const manifestPath = join(SHOTS, 'variance-manifest.json');
if (!existsSync(manifestPath)) die(`no collection to analyse at ${manifestPath} — run --collect first`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const refusals = [];
const observations = [];

if (!manifest.build?.unchangedAfter) {
  refusals.push('the build digest differed between the start and end of collection — these runs are not all of one build');
}

/** Load each run's profile block, refusing rather than skipping anything that did not measure. */
const loaded = [];
for (const run of manifest.runs) {
  const file = join(SHOTS, `report-${run.tag}.json`);
  if (!existsSync(file)) { refusals.push(`${run.tag}: no report at ${file}`); continue; }
  let report;
  try { report = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { refusals.push(`${run.tag}: unreadable report — ${e.message}`); continue; }
  const p = report.profiles?.[manifest.profile];
  if (!p) { refusals.push(`${run.tag}: report carries no "${manifest.profile}" profile`); continue; }
  if (!p.booted) { refusals.push(`${run.tag}: booted=false — a failed run's numbers are not a measurement`); continue; }
  if (p.carriedForward?.length) {
    refusals.push(`${run.tag}: carried ${p.carriedForward.length} shot(s) forward (${p.carriedForward.join(', ')}) `
      + '— a frame copied from an earlier run has zero variance by construction, not by measurement');
    continue;
  }
  loaded.push({ ...run, profile: p });
}

if (loaded.length < 4) {
  refusals.push(`only ${loaded.length} usable run(s) — too few to say anything about spread`);
}

/** The shots every usable run actually measured. A shot missing from one run is named, not dropped silently. */
const shotNames = [...new Set(loaded.flatMap((r) => Object.keys(r.profile.histograms || {})))].sort();
for (const shot of shotNames) {
  const missing = loaded.filter((r) => !r.profile.histograms?.[shot]).map((r) => r.tag);
  if (missing.length) refusals.push(`shot "${shot}" is absent from ${missing.length} run(s): ${missing.join(', ')}`);
}

/** cells: `${shot}.${field}` -> per-run value, in collection order. */
const cells = new Map();
for (const shot of shotNames) {
  for (const field of LUMA_FIELDS) {
    const values = loaded.map((r) => r.profile.histograms?.[shot]?.[field]);
    if (values.every((v) => typeof v === 'number' && Number.isFinite(v))) cells.set(`${shot}.${field}`, values);
  }
  for (const field of SHOT_FIELDS) {
    const values = loaded.map((r) => r.profile.perShot?.[shot]?.[field]);
    if (values.every((v) => typeof v === 'number' && Number.isFinite(v))) cells.set(`${shot}.${field}`, values);
  }
}
if (cells.size === 0) refusals.push('not one cell could be read from any run — nothing was measured');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * A cell that never moves across every run is reported, because it is ambiguous and the
 * ambiguity matters: either the rig is genuinely deterministic on that cell, or that cell is
 * not being recomputed at all. The second is what a carried frame or a dead code path looks
 * like, and it reads identically to the first.
 */
const rows = [];
for (const [cell, values] of cells) {
  const a = values.filter((_, i) => loaded[i].batch === 'a');
  const b = values.filter((_, i) => loaded[i].batch === 'b');
  const range = Math.max(...values) - Math.min(...values);
  const withinA = a.length > 1 ? Math.max(...a) - Math.min(...a) : null;
  const withinB = b.length > 1 ? Math.max(...b) - Math.min(...b) : null;
  const batchShift = a.length && b.length ? mean(b) - mean(a) : null;
  rows.push({
    cell,
    values,
    min: Math.min(...values),
    max: Math.max(...values),
    range: +range.toFixed(6),
    mean: +mean(values).toFixed(4),
    sd: +sd(values).toFixed(4),
    withinBatchRange: withinA === null || withinB === null ? null : +Math.max(withinA, withinB).toFixed(6),
    batchShift: batchShift === null ? null : +batchShift.toFixed(4),
    constant: range === 0,
  });
}

/**
 * The split null, re-run on this rig's data.
 *
 * Enumerate every way of cutting the runs into two halves, take the difference of means for
 * each, and ask where the *true* batch cut falls in that distribution. A split that puts runs
 * from both collection batches on both sides cancels batch drift by construction; if those
 * splits dominate the enumeration, a null built this way structurally cannot contain the effect
 * a real before/after is exposed to. That is the reasoning `survival` shipped and had to
 * retract, reproduced here so this repository's answer is its own.
 */
function splitNull(values) {
  const n = values.length;
  const half = n / 2;
  if (!Number.isInteger(half) || n < 4) return null;
  const idx = [...values.keys()];
  const splits = [];
  (function choose(start, picked) {
    if (picked.length === half) { splits.push([...picked]); return; }
    for (let i = start; i < n; i += 1) { picked.push(i); choose(i + 1, picked); picked.pop(); }
  })(0, []);
  const trueCut = new Set(loaded.map((r, i) => (r.batch === 'b' ? i : -1)).filter((i) => i >= 0));
  let interleaving = 0;
  let trueDiff = null;
  const diffs = [];
  for (const pick of splits) {
    const left = new Set(pick);
    const l = values.filter((_, i) => left.has(i));
    const r = values.filter((_, i) => !left.has(i));
    const diff = Math.abs(mean(r) - mean(l));
    diffs.push(diff);
    const pure = pick.every((i) => trueCut.has(i)) || pick.every((i) => !trueCut.has(i));
    if (!pure) interleaving += 1; else trueDiff = Math.abs(mean(r) - mean(l));
  }
  diffs.sort((x, y) => x - y);
  const rank = trueDiff === null ? null : diffs.filter((d) => d < trueDiff).length;
  return { splits: splits.length, interleaving, trueDiff, rank, percentile: rank === null ? null : +(100 * rank / diffs.length).toFixed(1) };
}

const moving = rows.filter((r) => !r.constant);
const nulls = moving.map((r) => ({ cell: r.cell, ...(splitNull(r.values) || {}) })).filter((n) => n.splits);
const tailCells = nulls.filter((n) => n.percentile !== null && n.percentile >= 90);

/** Gate verdicts are counted, never averaged: a gate that flipped between identical runs is the loudest result here. */
const gateFlips = [];
for (const shot of shotNames) {
  for (const gate of ['blackOk', 'whiteOk']) {
    const seen = [...new Set(loaded.map((r) => r.profile.histograms?.[shot]?.[gate]))];
    if (seen.length > 1) gateFlips.push({ shot, gate, values: loaded.map((r) => ({ tag: r.tag, value: r.profile.histograms?.[shot]?.[gate] })) });
  }
}

const constants = rows.filter((r) => r.constant).map((r) => r.cell);
observations.push(`${rows.length} cell(s) across ${shotNames.length} shot(s) and ${loaded.length} run(s)`);
observations.push(`${constants.length} cell(s) never moved; ${moving.length} did`);
if (gateFlips.length) observations.push(`${gateFlips.length} gate(s) flipped verdict between runs of one unchanged build`);
if (nulls.length) {
  const inter = nulls[0].interleaving;
  observations.push(`split null: ${nulls[0].splits} splits per cell, ${inter} of them interleave the two batches`);
  observations.push(`${tailCells.length} of ${nulls.length} moving cell(s) put the true batch cut at or above the 90th percentile of their own split null`);
}

const result = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  profile: manifest.profile,
  build: manifest.build,
  runs: loaded.map((r) => ({ tag: r.tag, batch: r.batch, startedAt: r.startedAt, seconds: r.seconds })),
  refusals,
  observations,
  gateFlips,
  splitNull: nulls,
  cells: rows.sort((x, y) => y.sd - x.sd),
};
writeFileSync(OUT, JSON.stringify(result, null, 2));

console.log(`\n=== KIT-VARIANCE — ${manifest.profile}, build ${String(manifest.build?.digest).slice(0, 12)} ===\n`);
for (const o of observations) console.log(`  ${o}`);
if (gateFlips.length) {
  console.log('\n  GATE FLIPS (one build, nothing changed):');
  for (const g of gateFlips) console.log(`    ${g.shot}.${g.gate}: ${g.values.map((v) => `${v.tag}=${v.value}`).join(' ')}`);
}
console.log('\n  widest cells by standard deviation:');
for (const r of result.cells.slice(0, 12)) {
  console.log(`    ${r.cell.padEnd(24)} sd ${String(r.sd).padStart(9)}  range ${String(r.range).padStart(9)}`
    + `  within-batch ${String(r.withinBatchRange).padStart(9)}  batch shift ${String(r.batchShift).padStart(9)}`);
}
if (tailCells.length) {
  console.log('\n  cells whose true batch cut sits in the tail of their own split null:');
  for (const n of tailCells.slice(0, 12)) console.log(`    ${n.cell.padEnd(24)} diff ${String(+n.trueDiff.toFixed(4)).padStart(9)}  percentile ${n.percentile}`);
}
console.log(`\nwrote ${OUT.slice(ROOT.length + 1)}`);

if (refusals.length) {
  console.log('\n  REFUSALS:');
  for (const r of refusals) console.log(`    - ${r}`);
  process.exit(1);
}
process.exit(0);
