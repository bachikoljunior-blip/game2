#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ai = resolve(root, 'AI_DEVELOPMENT');
const errors = [];

const STATUS = new Set([
  'proposed', 'accepted', 'ready', 'active', 'blocked', 'awaiting_verification',
  'under_review', 'verified', 'rejected', 'deferred', 'superseded', 'archived',
]);

const required = [
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

for (const path of required) {
  if (!existsSync(resolve(root, path))) errors.push(`missing required file: ${path}`);
}

function load(relative) {
  const path = resolve(root, relative);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return {};
  }
}

function checkVersion(value, label) {
  if (value?.schemaVersion !== 1) errors.push(`${label}: schemaVersion must be 1`);
}

function checkStatus(value, label) {
  if (!STATUS.has(value)) errors.push(`${label}: invalid status ${JSON.stringify(value)}`);
}

function uniqueIds(items, label) {
  const seen = new Set();
  for (const [index, item] of (items ?? []).entries()) {
    if (!item?.id || typeof item.id !== 'string') {
      errors.push(`${label}[${index}]: missing string id`);
      continue;
    }
    if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function scanSecretKeys(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|secret|api_?key|access_?token|private_?key)$/i.test(key)) {
      errors.push(`${path}.${key}: secret-shaped fields are forbidden in project state`);
    }
    scanSecretKeys(child, `${path}.${key}`);
  }
}

const project = load('AI_DEVELOPMENT/PROJECT_STATE.yaml');
const session = load('AI_DEVELOPMENT/SESSION_STATE.yaml');
const acceptance = load('AI_DEVELOPMENT/ACCEPTANCE_CRITERIA.yaml');
const plan = load('AI_DEVELOPMENT/PLAN_TREE.yaml');
const frontier = load('AI_DEVELOPMENT/ACTIVE_FRONTIER.yaml');
const graph = load('AI_DEVELOPMENT/TASK_GRAPH.yaml');
const benchmarks = load('AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml');
const handoffs = readdirSync(resolve(ai, 'HANDOFFS'))
  .filter((name) => name.endsWith('.json') && name !== 'handoff.schema.json')
  .map((name) => [name, load(`AI_DEVELOPMENT/HANDOFFS/${name}`)]);

for (const [label, value] of Object.entries({ project, session, acceptance, plan, frontier, graph, benchmarks })) {
  checkVersion(value, label);
  scanSecretKeys(value, label);
}
for (const [name, handoff] of handoffs) {
  checkVersion(handoff, `handoff ${name}`);
  scanSecretKeys(handoff, `handoff ${name}`);
}

checkStatus(project.status, 'project.status');
if (typeof session.logicalSession?.active !== 'boolean') {
  errors.push('session.logicalSession.active must be boolean');
}
if (session.logicalSession?.active && session.logicalSession?.endedAt !== null) {
  errors.push('an active logical session must have endedAt: null');
}

const criteriaIds = uniqueIds(acceptance.criteria, 'acceptance.criteria');
for (const criterion of acceptance.criteria ?? []) checkStatus(criterion.status, `criterion ${criterion.id}`);

const planIds = uniqueIds(plan.nodes, 'plan.nodes');
for (const node of plan.nodes ?? []) {
  checkStatus(node.status, `plan node ${node.id}`);
  if (node.parent !== null && !planIds.has(node.parent)) errors.push(`${node.id}: unknown parent ${node.parent}`);
  for (const child of node.children ?? []) if (!planIds.has(child)) errors.push(`${node.id}: unknown child ${child}`);
  for (const dependency of node.dependencies ?? []) if (!planIds.has(dependency)) errors.push(`${node.id}: unknown dependency ${dependency}`);
  for (const criterion of node.criteria ?? []) if (!criteriaIds.has(criterion)) errors.push(`${node.id}: unknown criterion ${criterion}`);
}

const frontierIds = uniqueIds(frontier.tasks, 'frontier.tasks');
for (const task of frontier.tasks ?? []) {
  checkStatus(task.status, `frontier task ${task.id}`);
  if (!planIds.has(task.planNode)) errors.push(`${task.id}: unknown planNode ${task.planNode}`);
}

const graphIds = uniqueIds(graph.tasks, 'graph.tasks');
for (const task of graph.tasks ?? []) {
  checkStatus(task.status, `graph task ${task.id}`);
  for (const dependency of task.dependsOn ?? []) if (!graphIds.has(dependency)) errors.push(`${task.id}: unknown graph dependency ${dependency}`);
  for (const dependent of task.unblocks ?? []) if (!graphIds.has(dependent)) errors.push(`${task.id}: unknown graph dependent ${dependent}`);
}
for (const id of frontierIds) if (!graphIds.has(id)) errors.push(`frontier task ${id} is absent from task graph`);

const handoffRequired = [
  'taskId', 'producer', 'consumer', 'objective', 'allowedScope', 'inputs', 'outputs',
  'dependencies', 'invariants', 'assumptions', 'unresolvedQuestions',
  'acceptanceCriteria', 'testsRequired', 'risks', 'rollback', 'status',
];
for (const [name, handoff] of handoffs) {
  for (const key of handoffRequired) {
    if (!(key in handoff)) errors.push(`handoff ${name}: missing required field ${key}`);
  }
  checkStatus(handoff.status, `handoff ${name}.status`);
  if (!graphIds.has(handoff.taskId)) errors.push(`handoff ${name}: taskId ${handoff.taskId} is absent from task graph`);
  for (const criterion of handoff.acceptanceCriteria ?? []) {
    if (!criteriaIds.has(criterion)) errors.push(`handoff ${name}: unknown criterion ${criterion}`);
  }
}

// ── reference benchmarks ────────────────────────────────────────────────────
// These rules exist so the per-element bar cannot quietly rot: a title cannot be
// referenced without being declared, an element cannot lose its bar, and — the one
// that matters most — a criterion cannot be marked verified without an apparatus
// that could have verified it and a measurement that did.
const APPARATUS = new Set(['exists', 'partial', 'missing']);
const EVIDENCE = new Set([
  'none', 'source-audit', 'frame-measured', 'runtime-measured', 'device-measured', 'review-judged',
]);
const SELECTION_AXES = [
  'elementQuality', 'reception', 'longevity', 'fitToConcept', 'applicability',
];

const titleIds = new Set((benchmarks.titleSet?.titles ?? []).map((t) => t.id));
const antiIds = new Set((benchmarks.antiReferences?.entries ?? []).map((a) => a.id));
const methods = new Set(Object.keys(benchmarks.methodVocabulary ?? {}));
if (!titleIds.size) errors.push('benchmarks: titleSet.titles is empty');
if (!methods.size) errors.push('benchmarks: methodVocabulary is empty');

const elementIds = uniqueIds(benchmarks.elements, 'benchmarks.elements');
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

    // The anti-fabrication rule.
    if (criterion.status === 'verified') {
      if (criterion.evidenceState === 'none') errors.push(`${clabel}: verified with evidenceState none`);
      if (criterion.apparatus === 'missing') errors.push(`${clabel}: verified through an apparatus that does not exist`);
      if (!criterion.measured) errors.push(`${clabel}: verified without recording what was measured`);
    }

    counts.total += 1;
    if (criterion.status === 'verified') counts.verified += 1;
    else if (criterion.status === 'under_review') counts.underReview += 1;
    else if (criterion.status === 'blocked') counts.blocked += 1;
    else if (criterion.status === 'proposed') counts.proposed += 1;
  }
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

if (errors.length) {
  console.error(`[project-state] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[project-state] PASS: ${criteriaIds.size} criteria, ${planIds.size} plan nodes, ${frontierIds.size} active-frontier tasks, ${graphIds.size} graph tasks`);
console.log(`[benchmarks]    PASS: ${elementIds.size} elements, ${titleIds.size} reference titles, ${counts.total} criteria (${counts.verified} verified, ${counts.underReview} under review, ${counts.blocked} blocked, ${counts.proposed} proposed)`);
