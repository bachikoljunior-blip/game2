#!/usr/bin/env node
/**
 * validate-project-state.mjs — this repository's state and benchmark gate.
 *
 * The generic half of this file used to be hand-written here, and the same half was
 * hand-written again in `survival/tools/check_operating_state.mjs`,
 * `Gptgame/scripts/verify-continuity.mjs` and `Q/tools/validate-protocol.mjs` — four
 * implementations of one job that disagreed on the details. Unique ids, referential
 * integrity, secret scanning and the anti-fabrication rule now come from `.kit/lib/state/`.
 *
 * What stays here is what is genuinely this project's: the twelve-value status vocabulary,
 * the eight state files, the handoff contract, and the reference-benchmark rules that keep
 * the per-element bar from quietly rotting.
 *
 *   node tools/validate-project-state.mjs             # validate
 *   node tools/validate-project-state.mjs --selftest  # prove every check here can fail
 *
 * `--selftest` is the part this file never had. A silently inert gate and a passing gate are
 * indistinguishable from outside: both print nothing and exit 0. This repository has already
 * shipped a gate that measured a cleared canvas and a draw-call counter frozen on a dead
 * frame; a state gate can rot the same way, and nothing would say so.
 *
 * One deliberate gain beyond the swap: the kit brings a dependency-cycle detector, which no
 * validator here had. A cycle is worth catching precisely because it is invisible — the state
 * file reads fine and the resume procedure simply never selects a next task.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireFiles, requireNonEmpty } from '../.kit/lib/state/files.mjs';
import { uniqueIds, checkRefs, detectCycles, antiFabrication } from '../.kit/lib/state/graph.mjs';
import { scanSecretKeys } from '../.kit/lib/state/secrets.mjs';
import { reportGateSelfTests } from '../.kit/lib/state/selftest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = new Set(process.argv.slice(2));

/* ------------------------------------------------------- this project's vocabulary */

const STATUS = new Set([
  'proposed', 'accepted', 'ready', 'active', 'blocked', 'awaiting_verification',
  'under_review', 'verified', 'rejected', 'deferred', 'superseded', 'archived',
]);

const REQUIRED = [
  'PROJECT_OPERATING_PROTOCOL.md',
  'AI_DEVELOPMENT/INDEX.md',
  'AI_DEVELOPMENT/PROJECT_STATE.yaml',
  'AI_DEVELOPMENT/SESSION_STATE.yaml',
  'AI_DEVELOPMENT/REQUIREMENTS.md',
  'AI_DEVELOPMENT/CONSTRAINTS.md',
  'AI_DEVELOPMENT/ACCEPTANCE_CRITERIA.yaml',
  'AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml',
  'AI_DEVELOPMENT/PLAN_TREE.yaml',
  'AI_DEVELOPMENT/ACTIVE_FRONTIER.yaml',
  'AI_DEVELOPMENT/TASK_GRAPH.yaml',
  'AI_DEVELOPMENT/DECISIONS.md',
  'AI_DEVELOPMENT/FAILURES.md',
  'AI_DEVELOPMENT/TECHNICAL_DEBT.md',
  'AI_DEVELOPMENT/HANDOFFS/handoff.schema.json',
  'AI_DEVELOPMENT/HANDOFFS/r9-verification.json',
];

const HANDOFF_REQUIRED = [
  'taskId', 'producer', 'consumer', 'objective', 'allowedScope', 'inputs', 'outputs',
  'dependencies', 'invariants', 'assumptions', 'unresolvedQuestions',
  'acceptanceCriteria', 'testsRequired', 'risks', 'rollback', 'status',
];

const APPARATUS = new Set(['exists', 'partial', 'missing']);
const EVIDENCE = new Set([
  'none', 'source-audit', 'frame-measured', 'runtime-measured', 'device-measured', 'review-judged',
]);
const SELECTION_AXES = ['elementQuality', 'reception', 'longevity', 'fitToConcept', 'applicability'];

/* ------------------------------------------------------------------------ the checks */

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {(relative: string) => string} [options.readText] Injectable so the self-test can
 *   run the real checks against fabricated state without writing to disk.
 * @returns {{errors: string[], summary: object}}
 */
export function validate({ root = ROOT, readText } = {}) {
  const errors = [];
  const read = readText || ((relative) => readFileSync(resolve(root, relative), 'utf8'));

  errors.push(...requireFiles(root, REQUIRED));
  errors.push(...requireNonEmpty(root, REQUIRED));

  const load = (relative) => {
    try {
      return JSON.parse(read(relative));
    } catch (error) {
      errors.push(`${relative}: ${error.message}`);
      return {};
    }
  };
  const checkVersion = (value, label) => {
    if (value?.schemaVersion !== 1) errors.push(`${label}: schemaVersion must be 1`);
  };
  const checkStatus = (value, label) => {
    if (!STATUS.has(value)) errors.push(`${label}: invalid status ${JSON.stringify(value)}`);
  };
  /** The kit reports `{failures, ids}`; this file has always worked in a flat error list. */
  const ids = (items, label) => {
    const { failures, ids: set } = uniqueIds(items ?? [], label);
    errors.push(...failures);
    return set;
  };

  const project = load('AI_DEVELOPMENT/PROJECT_STATE.yaml');
  const session = load('AI_DEVELOPMENT/SESSION_STATE.yaml');
  const acceptance = load('AI_DEVELOPMENT/ACCEPTANCE_CRITERIA.yaml');
  const plan = load('AI_DEVELOPMENT/PLAN_TREE.yaml');
  const frontier = load('AI_DEVELOPMENT/ACTIVE_FRONTIER.yaml');
  const graph = load('AI_DEVELOPMENT/TASK_GRAPH.yaml');
  const benchmarks = load('AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml');

  const handoffs = handoffNames(root).map((name) => [name, load(`AI_DEVELOPMENT/HANDOFFS/${name}`)]);

  for (const [label, value] of Object.entries({ project, session, acceptance, plan, frontier, graph, benchmarks })) {
    checkVersion(value, label);
    errors.push(...scanSecretKeys(value, label));
  }
  for (const [name, handoff] of handoffs) {
    checkVersion(handoff, `handoff ${name}`);
    errors.push(...scanSecretKeys(handoff, `handoff ${name}`));
  }

  checkStatus(project.status, 'project.status');
  if (typeof session.logicalSession?.active !== 'boolean') {
    errors.push('session.logicalSession.active must be boolean');
  }
  if (session.logicalSession?.active && session.logicalSession?.endedAt !== null) {
    errors.push('an active logical session must have endedAt: null');
  }

  const criteriaIds = ids(acceptance.criteria, 'acceptance.criteria');
  for (const criterion of acceptance.criteria ?? []) checkStatus(criterion.status, `criterion ${criterion.id}`);

  const planIds = ids(plan.nodes, 'plan.nodes');
  const nodes = plan.nodes ?? [];
  for (const node of nodes) checkStatus(node.status, `plan node ${node.id}`);
  // `parent` may legitimately be null at the root, which checkRefs skips; a self-parent or a
  // dangling id is what it catches.
  errors.push(...checkRefs(nodes, 'parent', planIds, { label: 'plan node' }));
  errors.push(...checkRefs(nodes, 'children', planIds, { label: 'plan node' }));
  errors.push(...checkRefs(nodes, 'dependencies', planIds, { label: 'plan node' }));
  errors.push(...checkRefs(nodes, 'criteria', criteriaIds, { label: 'plan node' }));
  errors.push(...detectCycles(nodes, 'dependencies'));

  const frontierIds = ids(frontier.tasks, 'frontier.tasks');
  for (const task of frontier.tasks ?? []) {
    checkStatus(task.status, `frontier task ${task.id}`);
    if (!planIds.has(task.planNode)) errors.push(`${task.id}: unknown planNode ${task.planNode}`);
  }

  const graphIds = ids(graph.tasks, 'graph.tasks');
  const graphTasks = graph.tasks ?? [];
  for (const task of graphTasks) checkStatus(task.status, `graph task ${task.id}`);
  errors.push(...checkRefs(graphTasks, 'dependsOn', graphIds, { label: 'graph task' }));
  errors.push(...checkRefs(graphTasks, 'unblocks', graphIds, { label: 'graph task' }));
  errors.push(...detectCycles(graphTasks, 'dependsOn'));
  for (const id of frontierIds) if (!graphIds.has(id)) errors.push(`frontier task ${id} is absent from task graph`);

  for (const [name, handoff] of handoffs) {
    for (const key of HANDOFF_REQUIRED) {
      if (!(key in handoff)) errors.push(`handoff ${name}: missing required field ${key}`);
    }
    checkStatus(handoff.status, `handoff ${name}.status`);
    if (!graphIds.has(handoff.taskId)) errors.push(`handoff ${name}: taskId ${handoff.taskId} is absent from task graph`);
    for (const criterion of handoff.acceptanceCriteria ?? []) {
      if (!criteriaIds.has(criterion)) errors.push(`handoff ${name}: unknown criterion ${criterion}`);
    }
  }

  const summary = checkBenchmarks(benchmarks, errors, { checkStatus, ids });
  return {
    errors,
    summary: {
      ...summary,
      criteria: criteriaIds.size,
      planNodes: planIds.size,
      frontierTasks: frontierIds.size,
      graphTasks: graphIds.size,
    },
  };
}

function handoffNames(root) {
  try {
    return readdirSync(resolve(root, 'AI_DEVELOPMENT/HANDOFFS'))
      .filter((name) => name.endsWith('.json') && name !== 'handoff.schema.json')
      .sort();
  } catch {
    return [];
  }
}

/**
 * The per-element bar. These rules exist so it cannot quietly rot: a title cannot be
 * referenced without being declared, an element cannot lose its bar, and — the one that
 * matters most — a criterion cannot be marked verified without an apparatus that could have
 * verified it and a measurement that did.
 */
function checkBenchmarks(benchmarks, errors, { checkStatus, ids }) {
  const titleIds = new Set((benchmarks.titleSet?.titles ?? []).map((t) => t.id));
  const antiIds = new Set((benchmarks.antiReferences?.entries ?? []).map((a) => a.id));
  const methods = new Set(Object.keys(benchmarks.methodVocabulary ?? {}));
  if (!titleIds.size) errors.push('benchmarks: titleSet.titles is empty');
  if (!methods.size) errors.push('benchmarks: methodVocabulary is empty');

  const elementIds = ids(benchmarks.elements, 'benchmarks.elements');
  const usedTitles = new Set();
  const benchCriteria = new Set();
  const counts = { total: 0, verified: 0, underReview: 0, blocked: 0, proposed: 0 };

  for (const element of benchmarks.elements ?? []) {
    const label = `benchmark element ${element.id}`;
    if (typeof element.inScope !== 'boolean') errors.push(`${label}: inScope must be boolean`);

    if (element.inScope) {
      if (!titleIds.has(element.reference)) {
        errors.push(`${label}: reference ${JSON.stringify(element.reference)} is not in titleSet`);
      } else usedTitles.add(element.reference);
      if (!(element.principles?.length > 0)) errors.push(`${label}: an in-scope element needs at least one principle`);
      if (!(element.criteria?.length > 0)) errors.push(`${label}: an in-scope element needs at least one criterion`);
      if (!element.currentGap) errors.push(`${label}: an in-scope element must state its current gap`);
      for (const axis of SELECTION_AXES) {
        if (!element.selection?.[axis]) errors.push(`${label}: selection.${axis} is required — a reference without a stated reason is an opinion`);
      }
    } else if (!element.scopeNote || !/re-entry|reopen|re-open/i.test(element.scopeNote)) {
      errors.push(`${label}: an out-of-scope element must record why, and the trigger that brings it back`);
    }

    if (element.secondaryReference) {
      if (!titleIds.has(element.secondaryReference)) {
        errors.push(`${label}: secondaryReference ${JSON.stringify(element.secondaryReference)} is not in titleSet`);
      } else usedTitles.add(element.secondaryReference);
      if (!element.secondaryJustification) {
        errors.push(`${label}: a second reference on one element must justify why one title cannot cover it`);
      }
    }
    if (element.antiReference && !antiIds.has(element.antiReference)) {
      errors.push(`${label}: unknown antiReference ${element.antiReference}`);
    }

    for (const criterion of element.criteria ?? []) {
      const clabel = `benchmark criterion ${criterion.id}`;
      if (!criterion.id) { errors.push(`${label}: criterion without an id`); continue; }
      if (benchCriteria.has(criterion.id)) errors.push(`${clabel}: duplicate id`);
      benchCriteria.add(criterion.id);
      checkStatus(criterion.status, clabel);
      if (!methods.has(criterion.method)) errors.push(`${clabel}: unknown method ${JSON.stringify(criterion.method)}`);
      if (!APPARATUS.has(criterion.apparatus)) errors.push(`${clabel}: apparatus must be one of ${[...APPARATUS].join('/')}`);
      if (!EVIDENCE.has(criterion.evidenceState)) errors.push(`${clabel}: unknown evidenceState ${JSON.stringify(criterion.evidenceState)}`);
      if (!criterion.threshold) errors.push(`${clabel}: a criterion without a threshold cannot be failed, so it is not a criterion`);

      counts.total += 1;
      if (criterion.status === 'verified') counts.verified += 1;
      else if (criterion.status === 'under_review') counts.underReview += 1;
      else if (criterion.status === 'blocked') counts.blocked += 1;
      else if (criterion.status === 'proposed') counts.proposed += 1;
    }

    // The anti-fabrication rule. Its defaults already read camelCase `evidenceState`,
    // `apparatus` and `measured`, because the kit extracted it from this file.
    errors.push(...antiFabrication(element.criteria ?? [], { label: 'benchmark criterion' }));
  }

  for (const id of titleIds) {
    if (!usedTitles.has(id)) errors.push(`benchmarks: title ${id} is declared but referenced by no element — remove it rather than growing the set`);
  }

  const declared = benchmarks.gapSummary?.criteriaCounts ?? {};
  for (const [key, value] of Object.entries(counts)) {
    if (declared[key] !== value) errors.push(`benchmarks.gapSummary.criteriaCounts.${key}: says ${declared[key]}, actual ${value}`);
  }

  const bucketed = Object.values(benchmarks.gapSummary?.byApparatus ?? {}).flat();
  for (const id of bucketed) if (!elementIds.has(id)) errors.push(`benchmarks.gapSummary.byApparatus: unknown element ${id}`);
  if (new Set(bucketed).size !== bucketed.length) errors.push('benchmarks.gapSummary.byApparatus: an element is listed in two buckets');
  for (const id of elementIds) {
    if (!bucketed.includes(id)) errors.push(`benchmarks.gapSummary.byApparatus: ${id} is not accounted for`);
  }

  return { elements: elementIds.size, titles: titleIds.size, counts };
}

/* ------------------------------------------------------------------------- self-test */

export function selfTestCases({ root = ROOT } = {}) {
  const real = (relative) => readFileSync(resolve(root, relative), 'utf8');
  /** Serve one state file altered and every other file unchanged. */
  const withEdit = (target, edit) => ({
    root,
    readText: (relative) => (relative === target ? edit(real(relative)) : real(relative)),
  });
  /** Edit a parsed document and re-serialise it, so fixtures cannot depend on formatting. */
  const patch = (target, mutate) => withEdit(target, (text) => {
    const doc = JSON.parse(text);
    mutate(doc);
    return JSON.stringify(doc, null, 2);
  });
  const run = (options) => validate(options).errors;

  const PLAN = 'AI_DEVELOPMENT/PLAN_TREE.yaml';
  const BENCH = 'AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml';
  const SESSION = 'AI_DEVELOPMENT/SESSION_STATE.yaml';

  return [
    { name: 'control: this repository\'s own state passes', shouldFire: false, evaluate: () => run({ root }) },
    {
      name: 'a status outside the twelve-value vocabulary',
      evaluate: () => run(patch(PLAN, (d) => { d.nodes[0].status = 'in_progress'; })),
    },
    {
      name: 'a duplicate plan-node id',
      evaluate: () => run(patch(PLAN, (d) => { d.nodes.push({ ...d.nodes[0] }); })),
    },
    {
      name: 'a plan node depending on an id that does not exist',
      evaluate: () => run(patch(PLAN, (d) => { d.nodes[0].dependencies = ['PLAN-NOT-REAL']; })),
    },
    {
      // No validator in this repository could catch this before the kit brought a cycle
      // detector. The state file reads fine and the resume procedure just never advances.
      name: 'a dependency cycle between two plan nodes',
      evaluate: () => run(patch(PLAN, (d) => {
        const [a, b] = d.nodes;
        a.dependencies = [b.id];
        b.dependencies = [a.id];
      })),
    },
    {
      name: 'the schema version bumped without the validator knowing',
      evaluate: () => run(patch(PLAN, (d) => { d.schemaVersion = 2; })),
    },
    {
      name: 'a closed session still marked active',
      evaluate: () => run(patch(SESSION, (d) => {
        d.logicalSession.active = true;
        d.logicalSession.endedAt = '2026-08-01T00:00:00Z';
      })),
    },
    {
      name: 'a credential-shaped field pasted into the session state',
      evaluate: () => run(patch(SESSION, (d) => { d.access_token = 'x'; })),
    },
    {
      name: 'a benchmark criterion marked verified with no evidence',
      evaluate: () => run(patch(BENCH, (d) => {
        const element = d.elements.find((e) => e.criteria?.length);
        element.criteria[0].status = 'verified';
        element.criteria[0].evidenceState = 'none';
      })),
    },
    {
      name: 'a benchmark criterion verified through an apparatus that does not exist',
      evaluate: () => run(patch(BENCH, (d) => {
        const element = d.elements.find((e) => e.criteria?.length);
        element.criteria[0].status = 'verified';
        element.criteria[0].apparatus = 'missing';
      })),
    },
    {
      name: 'a benchmark criterion with no threshold, which cannot be failed',
      evaluate: () => run(patch(BENCH, (d) => {
        const element = d.elements.find((e) => e.criteria?.length);
        delete element.criteria[0].threshold;
      })),
    },
    {
      name: 'an element pointing at a reference title that was never declared',
      evaluate: () => run(patch(BENCH, (d) => {
        const element = d.elements.find((e) => e.inScope);
        element.reference = 'TITLE-NOT-REAL';
      })),
    },
    {
      name: 'the declared criteria counts drifting from the actual ones',
      evaluate: () => run(patch(BENCH, (d) => { d.gapSummary.criteriaCounts.total += 1; })),
    },
    {
      name: 'a required state file missing',
      evaluate: () => requireFiles(root, ['AI_DEVELOPMENT/NO_SUCH_FILE.yaml']),
    },
  ];
}

/* ------------------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.has('--selftest')) {
    const ok = await reportGateSelfTests(selfTestCases(), { label: 'project-state' });
    process.exit(ok ? 0 : 1);
  }

  const { errors, summary } = validate();
  if (errors.length) {
    console.error(`[project-state] FAIL (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const { counts } = summary;
  console.log(`[project-state] PASS: ${summary.criteria} criteria, ${summary.planNodes} plan nodes, ${summary.frontierTasks} active-frontier tasks, ${summary.graphTasks} graph tasks`);
  console.log(`[benchmarks]    PASS: ${summary.elements} elements, ${summary.titles} reference titles, ${counts.total} criteria (${counts.verified} verified, ${counts.underReview} under review, ${counts.blocked} blocked, ${counts.proposed} proposed)`);
}
