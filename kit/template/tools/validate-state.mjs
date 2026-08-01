#!/usr/bin/env node
/**
 * validate-state.mjs — the state gate for a repository that adopted `kit/template/`.
 *
 * It is assembled from the four validators the survey found
 * (`game2/tools/validate-project-state.mjs`, `survival/tools/check_operating_state.mjs`,
 * `Gptgame/scripts/verify-continuity.mjs`, `Q/tools/validate-protocol.mjs`), which between
 * them were about 70% the same code written four times and disagreed on the rest. Everything
 * substantive lives in `.kit/lib/state/`; this file is the wiring and the vocabulary.
 *
 *   node tools/validate-state.mjs               # validate the recorded state
 *   node tools/validate-state.mjs --gate=<ref>  # also run the floor gate against a base ref
 *   node tools/validate-state.mjs --selftest    # prove every gate here can fail
 *
 * `--selftest` is not optional decoration. A gate that is silently inert looks exactly like a
 * gate that is passing: both print nothing and exit 0. Run it in CI beside the real check.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseYaml, at } from '../.kit/lib/state/yaml.mjs';
import { requireFiles, requireNonEmpty, requireByteCeiling, requireContains } from '../.kit/lib/state/files.mjs';
import { uniqueIds, checkRefs, detectCycles, exactlyOne, evidenceExists, antiFabrication } from '../.kit/lib/state/graph.mjs';
import { scanSecretKeys, scanSecretValues } from '../.kit/lib/state/secrets.mjs';
import { evaluateFloorGate, floorGateScenarios } from '../.kit/lib/state/floorGate.mjs';
import { reportGateSelfTests } from '../.kit/lib/state/selftest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));

/* ------------------------------------------------------------------ the vocabulary */

export const STATE_PATH = 'AI_DEVELOPMENT/PROJECT_STATE.yaml';
export const SESSION_PATH = 'AI_DEVELOPMENT/SESSION_STATE.yaml';

/** The twelve values `INDEX.md` publishes. Kept here so the two cannot drift silently. */
export const STATUSES = [
  'proposed', 'accepted', 'ready', 'active', 'blocked', 'awaiting_verification',
  'under_review', 'verified', 'rejected', 'deferred', 'superseded', 'archived',
];

export const GATE_RESULTS = [
  'passed', 'failed', 'blocked', 'not_applicable', 'prepared_not_executed', 'inconclusive',
];

/** See `template/README.md` divergence 4. `passed` is deliberately not accepted here. */
export const ACCEPTED_REVIEW_OUTCOMES = ['complete_verified'];

const REQUIRED = [
  'PROJECT_OPERATING_PROTOCOL.md',
  'AI_DEVELOPMENT/INDEX.md',
  STATE_PATH,
  SESSION_PATH,
];

/** A loader that stops fitting in one read stops being a loader. */
const CEILINGS = { 'AI_DEVELOPMENT/INDEX.md': 8000 };

/* ------------------------------------------------------------------ the checks */

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {(path: string) => boolean} [options.exists] Injectable so the self-test can run
 *   the same code against fabricated state without touching the disk.
 * @param {(path: string) => string} [options.read]
 * @returns {string[]} failures, empty when the state is valid
 */
export function validateState({ root = ROOT, exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  const abs = (rel) => join(root, rel);
  const failures = [];

  failures.push(...requireFiles(root, REQUIRED));
  failures.push(...requireNonEmpty(root, REQUIRED));
  if (failures.length) return failures;

  failures.push(...requireByteCeiling(root, CEILINGS));

  // The protocol must still have all twelve sections. Structural, not prose: sections get
  // deleted during a hurried edit far more often than they get rewritten.
  failures.push(...requireContains(root, 'PROJECT_OPERATING_PROTOCOL.md',
    Array.from({ length: 12 }, (_, i) => new RegExp(`^## ${i + 1}\\. `, 'm'))));
  failures.push(...requireContains(root, 'AI_DEVELOPMENT/INDEX.md', STATUSES.map((s) => `\`${s}\``)));

  let state;
  let session;
  try {
    state = parseYaml(read(abs(STATE_PATH)), { path: STATE_PATH });
  } catch (error) {
    return [...failures, `${STATE_PATH} does not parse: ${error.message}`];
  }
  try {
    session = parseYaml(read(abs(SESSION_PATH)), { path: SESSION_PATH });
  } catch (error) {
    return [...failures, `${SESSION_PATH} does not parse: ${error.message}`];
  }

  // A half-applied edit — one file saved, the other not — reads exactly like a consistent
  // state. This is the cheapest check in the file and the one most likely to fire.
  const revA = at(state, 'state_revision');
  const revB = at(session, 'state_revision');
  if (!revA) failures.push(`${STATE_PATH} has no state_revision`);
  if (revA && revB !== revA) {
    failures.push(`state_revision disagrees: ${STATE_PATH} says ${JSON.stringify(revA)}, ${SESSION_PATH} says ${JSON.stringify(revB)}`);
  }

  const nodes = at(state, 'plan_nodes') || [];
  const tasks = at(state, 'tasks') || [];
  const criteria = at(state, 'criteria') || [];
  if (!Array.isArray(nodes) || !Array.isArray(tasks) || !Array.isArray(criteria)) {
    return [...failures, `${STATE_PATH}: plan_nodes, tasks and criteria must be sequences`];
  }

  const planItems = [...nodes, ...tasks];
  const { failures: idFailures, ids } = uniqueIds(planItems, 'plan item');
  failures.push(...idFailures);
  failures.push(...checkRefs(planItems, 'parent', ids, { label: 'plan item' }));
  failures.push(...checkRefs(planItems, 'dependencies', ids, { label: 'plan item' }));
  failures.push(...detectCycles(planItems, 'dependencies'));
  failures.push(...exactlyOne(nodes, (n) => n?.parent === null || n?.parent === undefined, 'root plan node (parent: null)'));

  for (const item of planItems) {
    if (item?.status && !STATUSES.includes(item.status)) {
      failures.push(`plan item ${item.id} has status ${JSON.stringify(item.status)}, which is outside the vocabulary`);
    }
  }

  const { failures: critIdFailures, ids: critIds } = uniqueIds(criteria, 'criterion');
  failures.push(...critIdFailures);
  failures.push(...checkRefs(criteria, 'task', ids, { label: 'criterion' }));
  // snake_case field names, or the check reads `undefined` from every criterion and passes
  // everything while looking like it works.
  failures.push(...antiFabrication(criteria, { evidenceField: 'evidence_state' }));
  for (const c of criteria) {
    if (c?.status && !STATUSES.includes(c.status)) {
      failures.push(`criterion ${c.id} has status ${JSON.stringify(c.status)}, which is outside the vocabulary`);
    }
    if (c?.gate_result && !GATE_RESULTS.includes(c.gate_result)) {
      failures.push(`criterion ${c.id} has gate_result ${JSON.stringify(c.gate_result)}; use one of ${GATE_RESULTS.join(', ')}`);
    }
  }
  failures.push(...checkRefs(tasks, 'criteria', critIds, { label: 'task' }));

  // Evidence that is not on disk is not evidence.
  failures.push(...evidenceExists(tasks, 'evidence', (p) => exists(join(root, p))));

  // The review record the floor gate will read.
  const outcome = at(state, 'review.review_outcome');
  if (outcome !== null && outcome !== undefined && !ACCEPTED_REVIEW_OUTCOMES.includes(outcome)) {
    failures.push(`review.review_outcome is ${JSON.stringify(outcome)}; this project accepts ${ACCEPTED_REVIEW_OUTCOMES.join(' | ')} only`);
  }
  const level = at(state, 'review.independence_level_used');
  if (level !== null && level !== undefined && !['A', 'B', 'C'].includes(String(level))) {
    failures.push(`review.independence_level_used is ${JSON.stringify(level)}; use A, B or C`);
  }

  // Session close conditions. The boolean is the whole point: it is the one part of "only
  // the user ends a session" that a machine can hold.
  const declared = at(session, 'session.end_declared_by_user');
  const status = at(session, 'session.status');
  if (declared !== true && status !== 'active') {
    failures.push(`${SESSION_PATH}: session.status is ${JSON.stringify(status)} but the user has not declared the session ended`);
  }
  if (declared === true) {
    if (status !== 'closed') failures.push(`${SESSION_PATH}: the user ended the session, so session.status must be closed`);
    if (!at(session, 'session.final_handoff')) failures.push(`${SESSION_PATH}: a closed session needs a final_handoff`);
    if (!at(session, 'session.archive_reference')) failures.push(`${SESSION_PATH}: a closed session needs an archive_reference`);
  }
  if (!at(session, 'checkpoint.next_action')) {
    failures.push(`${SESSION_PATH}: checkpoint.next_action is empty — the next session has nothing to resume from`);
  }
  for (const id of at(session, 'session.active_frontier') || []) {
    if (!ids.has(id)) failures.push(`${SESSION_PATH}: active_frontier names ${id}, which is not in ${STATE_PATH}`);
  }
  const activeTask = at(session, 'session.active_task');
  if (activeTask && !ids.has(activeTask)) {
    failures.push(`${SESSION_PATH}: active_task ${activeTask} is not in ${STATE_PATH}`);
  }

  // Two complementary secret scans: suspicious key names in the parsed state, and
  // credential-shaped values in the document text. Neither finds what the other does.
  for (const [label, parsed] of [[STATE_PATH, state], [SESSION_PATH, session]]) {
    failures.push(...scanSecretKeys(parsed, label));
  }
  for (const rel of REQUIRED) failures.push(...scanSecretValues(read(abs(rel)), rel));

  return failures;
}

/** The floor gate, wired to git. Returns failures. */
export function runFloorGate(baseRef, { root = ROOT } = {}) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  // An unresolvable base ref must fail as a gate failure, not as a stack trace. In CI the
  // usual cause is a shallow checkout, where every diff is empty and the gate would
  // otherwise pass by finding nothing to complain about.
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${baseRef}^{commit}`], { stdio: 'ignore' });
  } catch {
    return [`floor gate: base ref ${baseRef} does not resolve — with a shallow checkout the diff is empty and this gate cannot run (use fetch-depth: 0)`];
  }
  const changedFiles = git('diff', '--name-only', `${baseRef}...HEAD`).split('\n').filter(Boolean);
  return evaluateFloorGate({
    changedFiles,
    stateText: readFileSync(join(root, STATE_PATH), 'utf8'),
    stateDiffText: git('diff', `${baseRef}...HEAD`, '--', STATE_PATH),
  }, { statePath: STATE_PATH, acceptedOutcomes: ACCEPTED_REVIEW_OUTCOMES });
}

/* ------------------------------------------------------------------ self-test */

/**
 * Every case here must make a gate fire, except the control, which must not. Both halves are
 * load-bearing: a gate that fires on everything is as broken as one that never fires.
 */
export function selfTestCases({ root = ROOT } = {}) {
  const realState = readFileSync(join(root, STATE_PATH), 'utf8');
  const realSession = readFileSync(join(root, SESSION_PATH), 'utf8');
  const fake = (state, session) => ({
    root,
    exists: () => true,
    read: (p) => (p.endsWith('PROJECT_STATE.yaml') ? state
      : p.endsWith('SESSION_STATE.yaml') ? session
        : readFileSync(p, 'utf8')),
  });
  const sub = (text, from, to) => {
    const out = text.replace(from, to);
    if (out === text) throw new Error(`self-test fixture did not apply: ${from}`);
    return out;
  };

  const gate = floorGateScenarios({ statePath: STATE_PATH, acceptedOutcomes: ACCEPTED_REVIEW_OUTCOMES });
  const floor = (input) => () => evaluateFloorGate(input, { statePath: STATE_PATH, acceptedOutcomes: ACCEPTED_REVIEW_OUTCOMES });

  return [
    {
      name: 'control: the repository\'s own state passes',
      shouldFire: false,
      evaluate: () => validateState({ root }),
    },
    {
      name: 'state_revision drift between the two files',
      evaluate: () => validateState(fake(realState, sub(realSession, /state_revision: .*/, 'state_revision: "9999-99-99.9"'))),
    },
    {
      name: 'a status outside the vocabulary',
      evaluate: () => validateState(fake(sub(realState, /status: active/, 'status: in_progress'), realSession)),
    },
    {
      name: 'a criterion marked verified with no apparatus or measurement',
      evaluate: () => validateState(fake(
        sub(realState, /(criteria:\n)/, '$1  - id: CRIT-FAKE\n    task: null\n    status: verified\n    apparatus: null\n    measured: null\n    evidence_state: none\n'),
        realSession,
      )),
    },
    {
      // Isolates the evidence clause: apparatus and measured are both filled in, so this
      // fires only if `evidence_state` is actually read. It did not, until it was.
      name: 'a criterion marked verified whose only defect is evidence_state: none',
      evaluate: () => validateState(fake(
        sub(realState, /(criteria:\n)/, '$1  - id: CRIT-FAKE\n    task: null\n    status: verified\n    apparatus: node tools/measure.mjs\n    measured: "0.42"\n    evidence_state: none\n'),
        realSession,
      )),
    },
    {
      name: 'review_outcome set to a value the vocabulary does not contain',
      evaluate: () => validateState(fake(sub(realState, /review_outcome: .*/, 'review_outcome: passed'), realSession)),
    },
    {
      name: 'a session closed without the user declaring it',
      evaluate: () => validateState(fake(realState, sub(realSession, /status: active/, 'status: closed'))),
    },
    {
      name: 'a credential-shaped value pasted into the state file',
      evaluate: () => validateState(fake(`${realState}\nleaked: ghp_0123456789abcdefghijklmnopqrstuvwxyz\n`, realSession)),
    },
    {
      name: 'a duplicate key, which YAML would otherwise resolve last-wins',
      evaluate: () => validateState(fake(`${realState}\nschema_version: 2\n`, realSession)),
    },
    { name: `floor gate F2: ${gate.F2.why}`, evaluate: floor(gate.F2.input) },
    { name: `floor gate F5: ${gate.F5.why}`, evaluate: floor(gate.F5.input) },
    { name: `floor gate F5: ${gate.F5_STALE.why}`, evaluate: floor(gate.F5_STALE.input) },
  ];
}

/* ------------------------------------------------------------------ cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.selftest) {
    const ok = await reportGateSelfTests(selfTestCases(), { label: 'validate-state' });
    process.exit(ok ? 0 : 1);
  }

  const failures = validateState();
  if (argv.gate) failures.push(...runFloorGate(String(argv.gate)));

  if (failures.length) {
    console.error(`FAIL ${failures.length} state problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`state is valid: ${REQUIRED.join(', ')}${argv.gate ? `, floor gate against ${argv.gate}` : ''}`);
}
