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
const handoffs = readdirSync(resolve(ai, 'HANDOFFS'))
  .filter((name) => name.endsWith('.json') && name !== 'handoff.schema.json')
  .map((name) => [name, load(`AI_DEVELOPMENT/HANDOFFS/${name}`)]);

for (const [label, value] of Object.entries({ project, session, acceptance, plan, frontier, graph })) {
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

if (errors.length) {
  console.error(`[project-state] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[project-state] PASS: ${criteriaIds.size} criteria, ${planIds.size} plan nodes, ${frontierIds.size} active-frontier tasks, ${graphIds.size} graph tasks`);
