/**
 * The kit's own test suite.
 *
 * Every gate here is tested in **both** directions: it must fire on a broken input and stay
 * quiet on a good one. A gate that fires on everything is as broken as one that never fires,
 * and it is the easier mistake to make while tightening one.
 *
 *   node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodePNG, encodePNG } from '../lib/image/png.mjs';
import { measureLuma, region, regionStats, cut, compareRegion } from '../lib/image/measure.mjs';
import { createRevisionCodec, revision } from '../lib/release/revision.mjs';
import { verifyServed, compareRelease } from '../lib/release/verifyServed.mjs';
import { checkMirror, writeMirror, sameBytes } from '../lib/release/mirror.mjs';
import { evaluateFloorGate, floorGateScenarios } from '../lib/state/floorGate.mjs';
import { runGateSelfTests } from '../lib/state/selftest.mjs';
import { uniqueIds, checkRefs, detectCycles, exactlyOne, antiFabrication } from '../lib/state/graph.mjs';
import { scanSecretKeys, scanSecretValues } from '../lib/state/secrets.mjs';
import { requireFiles, requireByteCeiling, requireContains } from '../lib/state/files.mjs';
import { buildPlan, invertOwnership } from '../lib/plan/dispatch.mjs';
import { validateFindings } from '../lib/plan/findings.mjs';
import { parseOwnershipTree, extractFencedBlock, checkOwnershipDrift } from '../lib/plan/ownership.mjs';
import { createContentPlanner, dependencyTable } from '../lib/plan/contentHash.mjs';

const GAME2 = '/home/user/game2';
const SPRITES = '/home/user/Simple-browser-cookie-clicker-game/images';
const hasGame2 = existsSync(join(GAME2, 'tools/dispatch.mjs'));
const hasSprites = existsSync(SPRITES);

const tmp = () => mkdtempSync(join(tmpdir(), 'kit-test-'));

/* ------------------------------------------------------------------ image */

test('encodePNG/decodePNG round-trips losslessly over real images', { skip: !hasSprites }, () => {
  const files = readdirSync(SPRITES).filter((f) => f.endsWith('.png'));
  assert.ok(files.length >= 10, 'expected a real corpus to test against');
  for (const f of files) {
    const img = decodePNG(readFileSync(join(SPRITES, f)));
    const r = region(img, '0.25,0.25,0.5,0.5');
    const rgb = cut(img, r);
    assert.equal(Buffer.compare(decodePNG(encodePNG(r.w, r.h, rgb)).data, rgb), 0, `${f} did not round-trip`);
  }
});

test('decodePNG rejects what it cannot honestly read', () => {
  assert.throws(() => decodePNG(Buffer.alloc(64)), /not a PNG/);
});

test('ignoreTransparent is a no-op on an opaque frame and changes a sprite', () => {
  const w = 32, h = 32;
  const opaque = { width: w, height: h, channels: 4, data: Buffer.alloc(w * h * 4) };
  for (let i = 0; i < w * h; i++) {
    opaque.data[i * 4] = i % 256; opaque.data[i * 4 + 1] = (i * 3) % 256;
    opaque.data[i * 4 + 2] = (i * 7) % 256; opaque.data[i * 4 + 3] = 255;
  }
  assert.deepEqual(measureLuma(opaque), measureLuma(opaque, [], { ignoreTransparent: false }));

  // Transparent padding carries RGB 0 in a real sprite, which is exactly why counting it
  // drags the median to black and reports the padding instead of the artwork.
  const sprite = { width: w, height: h, channels: 4, data: Buffer.alloc(w * h * 4) };
  for (let i = 0; i < w * h; i++) {
    const opaquePixel = i > (w * h) / 2;
    const value = opaquePixel ? 200 : 0;
    sprite.data[i * 4] = value; sprite.data[i * 4 + 1] = value; sprite.data[i * 4 + 2] = value;
    sprite.data[i * 4 + 3] = opaquePixel ? 255 : 0;
  }
  const counted = measureLuma(sprite, [], { ignoreTransparent: false });
  const skipped = measureLuma(sprite);
  assert.notEqual(counted.p50, skipped.p50, 'transparent surround must change the median');
  assert.ok(skipped.transparentSkipped > 0);
});

test('compareRegion names a byte-identical result as a failed edit', () => {
  const w = 16, h = 16, rgb = Buffer.alloc(w * h * 3, 120);
  const png = encodePNG(w, h, rgb);
  const img = decodePNG(png);
  const same = compareRegion(img, img, '0,0,1,1');
  assert.equal(same.identical, true);
  assert.match(same.note, /failed edit/);

  const other = decodePNG(encodePNG(w, h, Buffer.alloc(w * h * 3, 30)));
  assert.equal(compareRegion(img, other, '0,0,1,1').identical, false);
});

test('regionStats reports the warm/cool ratio a shadow argument turns on', () => {
  const w = 8, h = 8, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 40; rgb[i * 3 + 1] = 50; rgb[i * 3 + 2] = 90; }
  const img = decodePNG(encodePNG(w, h, rgb));
  assert.ok(regionStats(img, region(img, '0,0,1,1')).bOverR > 2, 'a cool surface must read bOverR > 1');
});

/* ---------------------------------------------------------------- release */

const HTML = '<!doctype html><html><head><meta name="artifact-revision" content="__ARTIFACT_REVISION__"><title>DEMO</title></head><body>hi</body></html>';

test('a stamped artifact verifies against itself', () => {
  const { revision: rev, source } = revision.stamp(HTML);
  assert.match(rev, /^[0-9a-f]{64}$/);
  assert.equal(revision.verify(source), rev);
});

test('verification fires on a one-byte change to the served content', () => {
  const { source } = revision.stamp(HTML);
  assert.throws(() => revision.verify(source.replace('>hi<', '>ho<')), /does not match the document content/);
});

test('zero or two revision tags are both rejected', () => {
  assert.throws(() => revision.compute('<html></html>'), /exactly one/);
  assert.throws(() => revision.compute(HTML + '<meta name="artifact-revision" content="__ARTIFACT_REVISION__">'), /exactly one/);
});

test('the meta tag name is configurable without changing behaviour', () => {
  const codec = createRevisionCodec({ metaName: 'build-revision' });
  const html = HTML.replace('artifact-revision', 'build-revision');
  const { revision: rev, source } = codec.stamp(html);
  assert.equal(codec.verify(source), rev);
});

const mockFetch = (body, status = 200) => async () => ({
  status, ok: status === 200, text: async () => body, json: async () => ({}),
});

test('verifyServed passes on the published bytes and fails on every corruption', async () => {
  const { revision: rev, source } = revision.stamp(HTML);
  const markers = ['<title>DEMO</title>'];

  const good = await verifyServed({ url: 'https://x.test/', expectedRevision: rev, markers, attempts: 1, fetchImpl: mockFetch(source) });
  assert.equal(good.ok, true, good.failures.join('; '));

  const tampered = await verifyServed({ url: 'https://x.test/', expectedRevision: rev, markers, attempts: 1, delayMs: 1, fetchImpl: mockFetch(source.replace('>hi<', '>ho<')) });
  assert.equal(tampered.ok, false);

  const wrongPage = await verifyServed({ url: 'https://x.test/', expectedRevision: rev, markers: ['<title>OTHER</title>'], attempts: 1, delayMs: 1, fetchImpl: mockFetch(source) });
  assert.equal(wrongPage.ok, false);

  const notFound = await verifyServed({ url: 'https://x.test/', expectedRevision: rev, markers, attempts: 1, delayMs: 1, fetchImpl: mockFetch('nope', 404) });
  assert.equal(notFound.ok, false);
});

test('verifyServed retries across propagation and reports how many it took', async () => {
  const { revision: rev, source } = revision.stamp(HTML);
  let call = 0;
  const flaky = async () => {
    call += 1;
    return call < 3 ? { status: 404, ok: false, text: async () => 'not yet' } : { status: 200, ok: true, text: async () => source };
  };
  const result = await verifyServed({ url: 'https://x.test/', expectedRevision: rev, attempts: 5, delayMs: 1, fetchImpl: flaky });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
});

test('compareRelease catches a mismatched and a missing id', () => {
  assert.deepEqual(compareRelease({ release_id: 'a' }, { release_id: 'a' }), []);
  assert.equal(compareRelease({ release_id: 'a' }, { release_id: 'b' }).length, 1);
  assert.ok(compareRelease({ release_id: 'a' }, {}).length >= 1);
});

test('checkMirror detects a stale copy and an obsolete leftover bundle', () => {
  const root = tmp();
  const src = join(root, 'dist'), dest = join(root, 'docs');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'index.html'), '<html>v2</html>');
  writeFileSync(join(src, 'app.abc123.js'), 'v2');
  const opts = { src, dest, files: ['index.html'], bundlePattern: /^app\.[A-Za-z0-9]+\.js$/ };

  writeMirror(opts);
  assert.equal(checkMirror(opts).ok, true, 'a fresh mirror must pass');
  assert.ok(sameBytes(join(src, 'index.html'), join(dest, 'index.html')));

  writeFileSync(join(dest, 'index.html'), '<html>v1</html>');
  assert.equal(checkMirror(opts).ok, false, 'a stale file must fail');

  writeMirror(opts);
  writeFileSync(join(dest, 'app.old999.js'), 'v1');
  const leftover = checkMirror(opts);
  assert.equal(leftover.ok, false);
  assert.match(leftover.errors.join(), /obsolete bundle/);

  rmSync(root, { recursive: true, force: true });
});

test('resolveMirrorSet refuses to publish when the bundle count is not exactly one', () => {
  const root = tmp();
  const src = join(root, 'dist');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'index.html'), 'x');
  writeFileSync(join(src, 'app.a.js'), 'a');
  writeFileSync(join(src, 'app.b.js'), 'b');
  assert.throws(
    () => checkMirror({ src, dest: src, files: ['index.html'], bundlePattern: /^app\.[a-z]\.js$/ }),
    /exactly one bundle/,
  );
  rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ state */

test('the floor gate fires on each violation and stays quiet on a compliant change', async () => {
  const scenarios = floorGateScenarios();
  const cases = Object.entries(scenarios).map(([name, s]) => ({ name, evaluate: () => evaluateFloorGate(s.input) }));
  cases.push({
    name: 'CONTROL compliant change set',
    shouldFire: false,
    evaluate: () => evaluateFloorGate({
      changedFiles: ['src/game.js', 'AI_DEVELOPMENT/STATE.yaml'],
      stateText: 'independence_level_used: B\nreview_outcome: complete_verified\n',
      stateDiffText: '+review_outcome: complete_verified\n',
    }),
  });
  cases.push({
    name: 'CONTROL docs-only change is not gated',
    shouldFire: false,
    evaluate: () => evaluateFloorGate({ changedFiles: ['README.md'], stateText: '', stateDiffText: '' }),
  });
  const { ok, summary } = await runGateSelfTests(cases);
  assert.equal(ok, true, summary);
});

test('the two repositories\' review_outcome values are genuinely incompatible', () => {
  const input = {
    changedFiles: ['src/game.js', 'AI_DEVELOPMENT/STATE.yaml'],
    stateText: 'independence_level_used: B\nreview_outcome: passed\n',
    stateDiffText: '+review_outcome: passed\n',
  };
  assert.ok(evaluateFloorGate(input).length > 0, 'Q\'s value must fail Gptgame\'s configuration');
  assert.deepEqual(evaluateFloorGate(input, { acceptedOutcomes: ['passed'] }), []);
});

test('an unset independence level is reported as unset, not as a letter', () => {
  const failures = evaluateFloorGate({
    changedFiles: ['src/x.js', 'AI_DEVELOPMENT/STATE.yaml'],
    stateText: 'independence_level_used: null\nreview_outcome: complete_verified\n',
    stateDiffText: '+review_outcome: complete_verified\n',
  });
  assert.match(failures.join(), /found none/);
});

test('graph integrity: duplicates, dangling refs, cycles, exactly-one', () => {
  assert.equal(uniqueIds([{ id: 'a' }, { id: 'a' }]).failures.length, 1);
  const { ids } = uniqueIds([{ id: 'a' }, { id: 'b' }]);
  assert.equal(checkRefs([{ id: 'a', dependencies: ['ghost'] }], 'dependencies', ids).length, 1);
  assert.deepEqual(checkRefs([{ id: 'a', dependencies: ['b'] }], 'dependencies', ids), []);
  assert.equal(checkRefs([{ id: 'a', dependencies: ['a'] }], 'dependencies', ids).length, 1, 'self-reference must fail');

  const cyclic = [{ id: 'a', dependencies: ['b'] }, { id: 'b', dependencies: ['c'] }, { id: 'c', dependencies: ['a'] }];
  const cycles = detectCycles(cyclic);
  assert.equal(cycles.length > 0, true);
  assert.match(cycles[0], /a -> b -> c -> a/);
  assert.deepEqual(detectCycles([{ id: 'a', dependencies: [] }, { id: 'b', dependencies: ['a'] }]), []);

  assert.deepEqual(exactlyOne([{ s: 'active' }, { s: 'ready' }], (t) => t.s === 'active', 'active task'), []);
  assert.equal(exactlyOne([{ s: 'active' }, { s: 'active' }], (t) => t.s === 'active', 'active task').length, 1);
});

test('anti-fabrication blocks a verified criterion with no evidence', () => {
  assert.deepEqual(antiFabrication([{ id: 'C1', status: 'verified', evidenceState: 'frame-measured', apparatus: 'exists', measured: 'p50 113' }]), []);
  assert.equal(antiFabrication([{ id: 'C2', status: 'verified', evidenceState: 'none', apparatus: 'exists', measured: 'x' }]).length, 1);
  assert.equal(antiFabrication([{ id: 'C3', status: 'verified', evidenceState: 'frame-measured', apparatus: 'missing', measured: 'x' }]).length, 1);
  assert.equal(antiFabrication([{ id: 'C4', status: 'verified', evidenceState: 'frame-measured', apparatus: 'exists', measured: '' }]).length, 1);
  assert.deepEqual(antiFabrication([{ id: 'C5', status: 'ready', evidenceState: 'none', apparatus: 'missing' }]), []);
});

test('secret scanning catches both a key name and a value shape', () => {
  assert.equal(scanSecretKeys({ deploy: { api_key: 'x' } }).length, 1);
  assert.deepEqual(scanSecretKeys({ deploy: { url: 'https://example.test' } }), []);
  assert.equal(scanSecretValues('token: ghp_' + 'a'.repeat(36)).length, 1);
  assert.deepEqual(scanSecretValues('nothing to see here'), []);
});

test('file assertions catch a missing file, an oversized doc and a missing marker', () => {
  const root = tmp();
  writeFileSync(join(root, 'A.md'), 'hello F1 world');
  assert.deepEqual(requireFiles(root, ['A.md']), []);
  assert.equal(requireFiles(root, ['B.md']).length, 1);
  assert.deepEqual(requireByteCeiling(root, { 'A.md': 100 }), []);
  assert.equal(requireByteCeiling(root, { 'A.md': 3 }).length, 1);
  assert.deepEqual(requireContains(root, 'A.md', ['F1', /hello/]), []);
  assert.equal(requireContains(root, 'A.md', ['F9']).length, 1);
  rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------- plan */

test('invertOwnership refuses a file claimed by two teams', () => {
  assert.throws(() => invertOwnership({ a: ['src/x.js'], b: ['src/x.js'] }), /claimed by both/);
});

test('buildPlan spawns only named owners and reports the skips', () => {
  const teams = { alpha: ['src/a.js'], beta: ['src/b.js'], gamma: ['src/c.js'] };
  const review = {
    verdict: 'FAIL', score: 50, blindComparison: 'x'.repeat(50),
    findings: [
      { severity: 'minor', shot: 's', problem: 'p'.repeat(25), why: 'w'.repeat(15), owner: 'src/a.js', fix: 'f'.repeat(15) },
      { severity: 'blocker', shot: 's', problem: 'p'.repeat(25), why: 'w'.repeat(15), owner: 'src/a.js', fix: 'f'.repeat(15) },
      { severity: 'major', shot: 's', problem: 'p'.repeat(25), why: 'w'.repeat(15), owner: 'src/missing.js', fix: 'f'.repeat(15) },
    ],
  };
  const plan = buildPlan(review, { teams });
  assert.deepEqual(plan.dispatch.map((d) => d.team), ['alpha']);
  assert.equal(plan.dispatch[0].worst, 'blocker', 'the worst severity must sort first');
  assert.deepEqual(plan.skipped.sort(), ['beta', 'gamma']);
  assert.equal(plan.unrouted.length, 1, 'an unowned finding must surface, never vanish');
});

test('validateFindings accepts the real review files and strict mode catches their drift', { skip: !hasGame2 }, () => {
  const drifted = [];
  for (const f of readdirSync(join(GAME2, 'shots')).filter((n) => n.startsWith('review-'))) {
    const review = JSON.parse(readFileSync(join(GAME2, 'shots', f), 'utf8'));
    const base = validateFindings(review);
    assert.equal(base.ok, true, `${f}: ${base.failures.join('; ')}`);
    if (!validateFindings(review, { strict: true }).ok) drifted.push(f);
  }
  assert.ok(drifted.length > 0, 'strict mode must catch the known format drift in the older files');
});

test('validateFindings rejects a finding the dispatcher could not route', () => {
  const bad = { verdict: 'FAIL', score: 10, blindComparison: 'x'.repeat(50), findings: [{ severity: 'urgent', shot: 's', problem: 'p'.repeat(25), why: 'w'.repeat(15), owner: 'src/a.js', fix: 'f'.repeat(15) }] };
  assert.equal(validateFindings(bad).ok, false);
  assert.match(validateFindings(bad).failures.join(), /severity must be/);
});

test('parseOwnershipTree reads the architecture document and the drift check finds real drift', { skip: !hasGame2 }, () => {
  const block = extractFencedBlock(readFileSync(join(GAME2, 'ARCHITECTURE.md'), 'utf8'), { heading: '## 8. Files and ownership' });
  const doc = parseOwnershipTree(block);
  assert.ok(doc.files.size >= 25, 'the tree must actually parse');
  assert.deepEqual(doc.untagged, [], 'every file in the contract must carry an owner tag');
  assert.equal(doc.files.get('src/render/Sky.js'), 'sky');
  assert.equal(doc.files.get('src/gameplay/EnemyAI.js'), 'enemy');

  // Identical maps must not drift; the real comparison lives in tools/check-ownership.mjs.
  assert.equal(checkOwnershipDrift(doc.teams, doc.teams).ok, true);
  const missing = { ...doc.teams, core: [...doc.teams.core, 'src/core/Nonexistent.js'] };
  assert.equal(checkOwnershipDrift(missing, doc.teams).ok, false);
});

test('kit buildPlan reproduces the existing dispatcher exactly', { skip: !hasGame2 }, async () => {
  const legacy = await import(join(GAME2, 'tools/dispatch.mjs'));
  const src = readFileSync(join(GAME2, 'tools/dispatch.mjs'), 'utf8');
  const body = src.slice(src.indexOf('const TEAMS = {') + 'const TEAMS = '.length);
  const teams = JSON.parse(body.slice(0, body.indexOf('\n};') + 2)
    .replace(/'/g, '"').replace(/,(\s*[}\]])/g, '$1').replace(/([a-z]+):/g, '"$1":'));

  const norm = (p) => JSON.stringify({
    d: p.dispatch.map((x) => [x.team, x.model, x.effort, x.findings, x.blockers, x.worst, x.files, x.summary]),
    s: p.skipped, u: p.unrouted.map((x) => x.reason),
  });

  const files = readdirSync(join(GAME2, 'shots')).filter((n) => n.startsWith('review-'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const review = JSON.parse(readFileSync(join(GAME2, 'shots', f), 'utf8'));
    assert.equal(
      norm(buildPlan(review, { teams, fileExists: (p) => existsSync(join(GAME2, p)) })),
      norm(legacy.buildPlan(review)),
      `${f} produced a different plan`,
    );
  }
});

test('contentHash carries unchanged artefacts forward and re-takes changed ones', () => {
  const root = tmp();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.js'), 'v1');
  writeFileSync(join(root, 'src/b.js'), 'v1');
  const out = join(root, 'out.png');
  writeFileSync(out, 'image');

  const planner = createContentPlanner({
    root,
    manifestPath: join(root, 'manifest.json'),
    depsFor: dependencyTable(['src/a.js'], { one: ['src/b.js'], two: [] }),
  });

  assert.equal(planner.plan('p', ['one']).stale[0].why, 'never generated');
  planner.record('p', 'one', out);
  assert.equal(planner.plan('p', ['one']).fresh.length, 1, 'unchanged sources must carry forward');

  writeFileSync(join(root, 'src/b.js'), 'v2');
  assert.equal(planner.plan('p', ['one']).stale[0].why, 'sources changed');

  planner.record('p', 'one', out);
  rmSync(out);
  assert.equal(planner.plan('p', ['one']).stale[0].why, 'previous output is gone');

  // Content-keyed, not mtime-keyed: rewriting identical bytes is not a change.
  writeFileSync(out, 'image');
  planner.record('p', 'one', out);
  const before = planner.hashOf('one');
  writeFileSync(join(root, 'src/b.js'), 'v2');
  assert.equal(planner.hashOf('one'), before, 'identical bytes must not change the hash');

  // An unknown key depends on everything.
  assert.equal(planner.plan('p', ['unknown']).stale.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test('a deleted dependency registers as a change', () => {
  const root = tmp();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.js'), 'v1');
  const planner = createContentPlanner({
    root, manifestPath: join(root, 'm.json'), depsFor: () => ['src/a.js'],
  });
  const before = planner.hashOf('k');
  rmSync(join(root, 'src/a.js'));
  assert.notEqual(planner.hashOf('k'), before, 'deleting a dependency must not hash the same');
  rmSync(root, { recursive: true, force: true });
});
