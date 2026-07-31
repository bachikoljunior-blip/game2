# Project-wide persistent autonomous development protocol

Status: active  
Adopted: 2026-07-31  
Scope: the entire `bachikoljunior-blip/game2` project

This file is the durable operating protocol for the project. It governs how work is
selected, executed, verified, recorded, resumed, and handed off. It is not a product brief;
the product comes from the verified repository, the active requirements, and the user's
latest explicit instructions.

## 1. Authority

Resolve conflicts in this order:

1. The user's latest explicit instruction.
2. Active project requirements and constraints.
3. Verified repository files, runtime behaviour, and test results.
4. Accepted decisions that have not been superseded.
5. The active plan and frontier.
6. Explicitly labelled assumptions and hypotheses.

When a conflict is found, record it in `AI_DEVELOPMENT/DECISIONS.md`, state what was
replaced, update affected plans and criteria, and preserve still-valid completed work.
Never turn an assumption into a fact by repetition.

## 2. Existing sources of truth

The project already had a valuable review system. Keep it and give each file one job:

- `ARCHITECTURE.md`: binding product architecture, ownership, art, UX, and performance
  contract.
- `CLAUDE.md`: standing KAGEROU product and visual-review rules, subject to this protocol.
- `HANDOFF.md`: the only authoritative detailed state for the art-direction review loop,
  including measurements, disproved mechanisms, and open visual findings.
- `ROUND.md`: executable procedure for an art-direction round.
- `README.md`: public product and last verified release-facing status.
- `AI_DEVELOPMENT/*`: concise project-wide control state, session state, requirements,
  criteria, plan, dependencies, decisions, failures, debt, evidence, and typed handoffs.

Do not copy the detailed art-review history out of `HANDOFF.md`. Project-wide state files
point to it. If two records disagree, inspect the repository and runtime; verified reality
wins and both records are reconciled.

## 3. Resume procedure

At the start of every Work run or project chat:

1. Read this file and `AI_DEVELOPMENT/INDEX.md`.
2. Read `PROJECT_STATE.yaml` and `SESSION_STATE.yaml`.
3. Read requirements, constraints, criteria, the active frontier, and task graph.
4. Read relevant decisions, failures, technical debt, and reusable workflows.
5. For visual work, read `HANDOFF.md`, the current-status section of `README.md`, and
   `ROUND.md`.
6. Inspect actual branches, commits, files, and uncommitted changes.
7. Reconcile recorded state with verified reality.
8. Run the smallest relevant health check.
9. Continue from the exact recorded stopping point; do not repeat verified or rejected work.

If state files are missing or damaged, reconstruct them from the repository and evidence,
mark uncertainty, and record the reconstruction.

## 4. User-controlled logical sessions

A logical development session ends only when the user explicitly says it is finished.
Starting a new chat, closing the app, a tool failure, context compression, passage of time,
or a short reply does not end it.

While the session is active:

- keep `SESSION_STATE.yaml` active;
- preserve the objective, modified files, last verified action, next action, rollback point,
  and pending verification;
- update durable state after every meaningful verified iteration;
- do not archive, reset priorities, or mark incomplete work complete;
- do not promise unsupported background work.

Only after an explicit session-end instruction: reconcile state, record completed and
partial work, tests, benchmarks, defects, failures, exact resumption instructions, archive
the session, and mark it inactive. Ending a session is not the same as completing the
project.

## 5. Planning and autonomous selection

Maintain both:

- `PLAN_TREE.yaml`: the complete living hierarchy; and
- `ACTIVE_FRONTIER.yaml`: only actionable work now.

Leaf tasks must be bounded, independently verifiable where practical, dependency-safe,
reversible, and tied to a real requirement and criterion. Use statuses defined in
`AI_DEVELOPMENT/INDEX.md`.

Select the highest-value next task by final-value contribution, dependencies unblocked,
risk and uncertainty reduced, user-visible value, regression prevention, cost of execution
and verification, reversibility, and learning value. Prefer the smallest task with the
largest verified effect. Build missing state, test, measurement, recovery, or integration
infrastructure first only when it unlocks a concrete requirement or prevents a known
failure.

Do not preserve an obsolete plan, choose easy cosmetic work over structural blockers,
rewrite functioning systems without evidence, or silently broaden or reduce scope.

## 6. Implementation and integration

- Make small, isolated, reviewable changes.
- Inspect interface consumers, invariants, migration needs, tests, and rollback before
  changing an interface.
- Do not modify overlapping files concurrently without an explicit integration strategy.
- Preserve user-authored work unless a verified project reason requires replacement.
- A specialist's isolated output is not complete until integration is verified.
- Before risky work, identify the last working state and a recoverable rollback point.
- Never hide a failed experiment; record its evidence and cause.

The user's request to modify this project authorizes reversible project-scoped file changes,
local builds, tests, and local commits. On 2026-07-31 the user additionally gave persistent,
cross-session authorization and direction to push verified work, integrate it into `main`,
and publish the GitHub Pages build without asking again. Inspect each resulting ref and public
surface before reporting success. Paid actions, account changes, credential changes,
destructive external changes, production-data changes, and unrelated publication remain
outside this authorization.

## 7. Specialists and typed handoffs

Use the fewest specialist roles that materially improve expertise or independence. Parallel
work must be genuinely independent and file ownership in `ARCHITECTURE.md` remains binding.
When strict source-blind isolation is unavailable, use a fresh context and a sanitized
evidence package and record the limitation.

Every material specialist handoff uses the schema in
`AI_DEVELOPMENT/HANDOFFS/handoff.schema.json` and states task, scope, inputs, outputs,
interfaces, dependencies, invariants, assumptions, unresolved questions, criteria, tests,
risks, rollback, and status. Reject contradictory or incomplete upstream contracts rather
than silently compensating downstream.

## 8. Acceptance, gates, and evidence

Every significant requirement gets a concrete criterion in
`AI_DEVELOPMENT/ACCEPTANCE_CRITERIA.yaml`, traceable to its source, plan node, files, tests,
and evidence. Do not weaken a criterion because it is difficult; material changes require
the user's approval.

Use layered gates appropriate to the change:

1. state and schema validation;
2. configuration and syntax checks;
3. production build;
4. focused automated checks;
5. integration and deterministic checkpoint tests;
6. end-to-end user flows through the real surface;
7. independent user-surface and code review;
8. performance, stress, clean-setup, clean-build, and release checks.

A successful build is not a successful feature. Unexecuted tests are `prepared`, not
`passed`. A failed mandatory gate blocks acceptance; repair the implementation unless
evidence proves the gate is wrong. Store objective outputs, commands, screenshots,
measurements, and reports under the established `shots/` system or `AI_DEVELOPMENT/EVIDENCE/`.

## 9. Interactive and checkpoint verification

Interactive behaviour must be exercised through the same touch, pointer, keyboard, or
rendered surface available to users whenever practical. Test normal and incorrect use,
edges, rapid and repeated actions, interruption, recovery, orientation, small screens,
long-running behaviour, and degraded/offline states as relevant.

Checkpoint and state-injection hooks must be deterministic, documented, test-covered, and
unreachable in ordinary production use. They may be exposed only by an explicit development
or capture mode. Synthetic states complement rather than replace normal progression tests.

For KAGEROU visual work, the existing five-shot capture set is the deterministic checkpoint
surface. Verify `booted`, requested tier, complete coherent shot set, no page errors, no dead
shader programs, tonal gates, draw calls, triangles, and finding-specific regions before
asking a critic to judge the frames.

## 10. Measurement, experiments, and repair

Measure behaviour rather than trusting plausible configuration. Validate new measurement
tools against an existing trusted tool on one identical region before using their output.
State a falsifiable prediction, change one variable or a small related group, remeasure the
same region, check secondary effects, keep only net improvements, and record shortfalls.

When multiple solutions are genuinely plausible, isolate meaningfully different candidates,
define diversity dimensions and stopping criteria, preserve a strong shortlist, and promote
only the best verified candidate. A simplified simulator is evidence about only the property
it models, not visual quality, feel, integration, or real-device performance.

On repeated failure, stop repeating the attempt, compare failures, challenge the shared
assumption, record the failed pattern, change strategy, and verify the new approach narrowly.

## 11. Local-first product policy

The shipped product must not require an external AI API, hosted agent, paid inference
service, or third-party cloud service unless the user explicitly authorizes it. Prefer
existing code, bundled deterministic systems, compatible open-source libraries, rule-based
systems, and optional local models with deterministic fallbacks. Do not request an API key
for convenience.

Autonomous game entities are added only when required by the actual product. Their memory,
goals, relationships, planning, and behaviour must work locally and deterministically,
persist through the normal save system where applicable, obey protected canon and progression
facts, and stay inside measured CPU, memory, and storage budgets.

## 12. Dependencies, assets, security, and privacy

- Verify dependency source, version, licence, attribution, compatibility, maintenance, and
  security risk before adoption.
- KAGEROU's binding contract currently forbids external runtime assets.
- Never store passwords, tokens, API keys, private keys, recovery information, personal
  data, or other secrets in source, state, logs, screenshots, reports, or evidence.
- Do not disable security controls or expose test hooks in normal release behaviour.
- Prefer project-scoped, reproducible, removable infrastructure.

## 13. Continuous operating loop

For each meaningful iteration: reload and reconcile state; inspect the plan; choose the
highest-value ready leaf; confirm criteria and prerequisites; assign the minimum useful
roles; implement the smallest complete change; run fast checks; integrate; run checkpoints
and user-surface tests; review independently; collect evidence; repair failures; compare to
baseline; roll back regressions; update reusable workflows and failed patterns; update the
plan, frontier, project state, and active session; then select the next task.

Every verified iteration must leave the project more functional, tested, recoverable,
understandable, maintainable, or reusable than before.

## 14. Completion

A task is complete only when its criteria pass, integration and regressions are verified,
the user surface and relevant performance are checked, failure/recovery behaviour is tested,
records and evidence are current, and no unresolved blocking or high-severity finding
remains. Never equate generated code, compilation, a screenshot, or one review with
completion. State remaining uncertainty in proportion to the evidence.
