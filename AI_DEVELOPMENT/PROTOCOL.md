# PROJECT OPERATING PROTOCOL — Adaptive Edition with Enforced Floor, v2.2

Governing contract for autonomous development in this repository. Installed by migration
from the earlier project-wide protocol on 2026-08-01. Version 2.2 takes precedence over any
earlier instruction **only to the extent of an actual conflict**; every non-conflicting past
instruction remains in force.

Layer map: `CLAUDE.md` holds the short loader (Layer 1). `START_HERE.md` and
`AI_DEVELOPMENT/STATE.yaml` plus Section 0 below are always-relevant (Layer 2). The rest of
this file and `AI_DEVELOPMENT/MODULES/` load on demand (Layer 3).

---

# 0. MANDATORY FLOOR (NON-DISCRETIONARY CORE)

A deliberately small set of obligations never subject to your own cost, value, effort or
sufficiency judgment. Everything else in this protocol is adaptive. This section is not.

## 0.1 Precedence

No other part of this protocol may reduce, defer, compress or waive a floor obligation.

The following may never be used as a reason to skip a floor obligation: adaptive rigor
selection including LIGHT; "the lowest sufficient level of process"; "only when its value
exceeds its maintenance cost"; "do not mistake more process for better work"; "do not perform
a procedure merely because it appears in this instruction"; efficiency, brevity, remaining
context, remaining time, usage limits or token cost; confidence that the change is obviously
correct; the work being small, local, familiar or easy.

Only the user's explicit instruction can waive a floor obligation. Record the waiver, its
scope, and when it expires.

## 0.2 Trigger form

Each floor item is a trigger and an obligation. You do not decide whether the obligation is
worthwhile. You determine only whether the trigger fired, answerable from verified reality
rather than preference.

**If it is unclear whether a trigger fired, treat it as fired.** Uncertainty always resolves
toward performing the obligation, never toward skipping it.

Self-report is the weakest acceptable state of this floor, never the target state. F9 exists
because a run that skipped a floor item and reported it as satisfied is otherwise
indistinguishable from a run that performed it.

### F1 — Continuity read

**TRIGGER** A run is about to inspect, change, verify or deliver anything in this project.

**OBLIGATION** Before the first substantive action, read `START_HERE.md` and the active
portion of `STATE.yaml`, and verify the parts relevant to the intended next action against
actual project reality. If those files do not exist, perform the minimum durable installation
in Section 5 first.

**NOT SATISFIED BY** Conversation history; a summary written earlier in this chat; recall
from a previous run; assuming recorded state is still accurate because nothing seemed to
change.

### F2 — Continuity write

**TRIGGER** A run materially changed the project, or is ending while an objective remains
incomplete.

**OBLIGATION** Before the run ends, update canonical state with: objective status; last
verified checkpoint; modified but unverified artifacts; blockers; recovery information;
remote or deployment state where relevant; and the exact next action. Reserve capacity for
this — when a run may end soon because of context pressure, usage limits or interruption
risk, F2 takes priority over starting additional implementation.

**NOT SATISFIED BY** Describing state only in chat; deciding the change was "not meaningful"
after files were actually edited; deferring on the assumption a later run will record it.

### F3 — Execution verification

**TRIGGER** A change was made to code, configuration, data, schema, assets, or build and
release settings, and the environment permits running, building, loading or otherwise
exercising it.

**OBLIGATION** Actually execute the relevant path and inspect the real result before treating
the change as complete.

**NOT SATISFIED BY** Successful generation; reading the source; type-level or logical
plausibility; a build that was never run; a test written but not executed; user approval of a
diff.

**IF EXECUTION IS UNAVAILABLE** Record as `prepared_not_executed`, keep it open, state the
confidence limitation. Do not upgrade it to complete in a later run without actually
executing it.

### F4 — Status honesty

**TRIGGER** Any status is recorded in durable state or stated to the user.

**OBLIGATION** Use only these statuses, accurately: `complete_verified`,
`complete_unverified`, `prepared_not_applied`, `prepared_not_executed`, `blocked`,
`inconclusive`, `failed`, `rejected`, `rolled_back`, `superseded`. Prose must not upgrade the
recorded status. If a message says a feature works, F3 evidence must already exist.

**NOT SATISFIED BY** "Implemented", "done", "fixed", "should now work", or a completion
summary covering work that is `prepared_not_executed`, `inconclusive` or `blocked`.

### F5 — Falsification before objective completion

**TRIGGER** An objective is about to be marked complete, or a STRICT operation (§2.3) is
about to proceed.

**OBLIGATION** Perform at least a Level C deliberate falsification pass (§9.3) and record
which independence level was actually used. For STRICT work use Level A or B when the
environment supports it; otherwise use the strongest available substitute and record the
limitation. Choosing the level is adaptive. Performing no pass, or leaving the level
unrecorded, is not permitted.

**NOT SATISFIED BY** The implementation pass itself; a test written by the implementer with
no attempt to break the result; calling a review independent when it was not.

### F6 — Real-surface verification of delivery

**TRIGGER** A merge, release, deployment or publication changed what a user actually
receives.

**OBLIGATION** After the operation, verify through the real public or production surface
that: the intended revision is the one actually being served; the primary user journey works;
and no blocking runtime error occurs. Record the verified revision identifier.

**NOT SATISFIED BY** A deployment job starting or reporting success; the URL loading; a
previously verified revision; a local build of the same commit; a screenshot taken before the
deployment completed.

### F7 — Acceptance mapping at objective completion

**TRIGGER** An objective is marked complete.

**OBLIGATION** For each agreed acceptance criterion, record whether it is satisfied and the
specific evidence that shows it.

**NOT SATISFIED BY** A general statement that the work looks finished, or a summary of
activity performed.

### F8 — Skip accounting

**TRIGGER** A floor trigger plausibly applied and you concluded it did not fire, or a floor
obligation could not be performed.

**OBLIGATION** Record one line in durable state: which floor item, which trigger, why it did
not fire or why it was impossible, the supporting evidence, and whether it must be revisited.
One line is enough. Do not expand this into a report.

### F9 — Deterministic enforcement

**TRIGGER** The environment exposes a mechanism that can fail, block or revert an operation
independently of your judgment and your report — repository CI, a required status check,
branch protection, a deployment job, a post-deploy check, or equivalent — and the active
objective involves repeated implementation or delivery.

**OBLIGATION** Install the smallest reliable mechanism for each of the following, and record
which are actually active:

- **F2 gate** — a check that fails when a commit changing product files carries no
  corresponding update to the canonical state file.
- **F3 gate** — build, startup or test execution as a required status check, so unexecuted or
  failing work cannot merge.
- **F5 gate** — a required record of the independence level and review outcome, enforced by
  branch protection or a required check, so a merge without it fails.
- **F6 gate** — a post-deploy check that fetches the real public surface, compares the served
  revision identifier with the intended one, and fails the delivery when they do not match.
  Where the product can be reverted safely, wire that failure to an automatic revert.

To make the F6 gate possible, ensure the build embeds a revision identifier reachable from
the public surface.

**NOT SATISFIED BY** A rule written in a document; an instruction added to a loader file;
your own promise to check; a job that only reports and never fails; a check that can be
bypassed without the bypass being recorded.

**BOUNDED** Use the smallest mechanism that fails correctly. Do not build an elaborate
pipeline, do not add gates beyond the four above on your own initiative, and stop as soon as
each required gate exists and has been observed to fail at least once on a deliberately bad
input. A gate never observed failing is `prepared_not_executed`, not active.

**IF ENFORCEMENT IS UNAVAILABLE** Do not assume it is unavailable; a missing capability must
be demonstrated (§4). When genuinely unavailable: record which floor items remain
self-reported only; state the limitation in the floor check line of every run; treat affected
work as `complete_unverified` wherever the missing gate was the only independent evidence;
treat installing enforcement as P3 work as soon as the capability appears.

## 0.3 End-of-run floor check

Before ending any run that touched the project, evaluate every floor item and include one
compact line in the final message, e.g.

`Floor: F1 ok | F2 ok | F3 executed (browser) | F4 ok | F5 C | F6 n/a | F7 n/a | F8 1 skip (F5: objective still open) | F9 gates: F2,F3 active / F5,F6 absent`

Short and mandatory. It is a diagnostic signal you produce, not proof the obligation was
performed; it exists so omission is visible, and it does not substitute for F9.

## 0.4 Unattended operation

Unattended operation means any chain of runs that continues without the user reading the
output between them: a scheduled workflow, a self-restarting loop, a routine, an automation,
or a run triggered by another agent. Under it the floor check line reaches no reader, so
self-report provides no protection at all. Therefore:

- Do not start, enable, extend or continue unattended chaining for delivery-capable work
  while the four F9 gates are not active, unless the user explicitly waives this and the
  waiver is recorded with scope and expiry.
- An unattended chain must have a stop mechanism independent of your judgment: a bounded run
  count, and a file or flag whose presence halts the chain, checked before each run.
- An unattended run that cannot satisfy F2 must halt the chain rather than continue.
- Public release and production deployment inside an unattended chain require the F6 gate and
  a working automatic revert. Without both, prepare the release and stop.

## 0.5 Enforcement state

Recorded in the `floor.enforcement` block of `STATE.yaml`. Each field records the mechanism
actually installed and verified, or the accurate reason it is absent. Never record a gate as
active on the basis of having written it. When an active gate and your own report disagree,
**the gate result governs** — inspect the real mechanism, correct the record, and report the
discrepancy promptly as a serious defect.

## 0.6 Floor discipline

The floor is intentionally small. Do not expand it, do not add mandatory items on your own
initiative, and do not generate extra files, roles, schemas, dashboards or reports in its
name. F9 is the single exception and is bounded by its own BOUNDED clause.

---

# 1. CORE NON-NEGOTIABLE RULES

Section 0 and the principles here are universally mandatory. All other procedures, files,
roles, reports, schemas, tests and modules apply only to the degree they materially improve
correctness, safety, continuity, verification, recoverability, delivery, or progress toward
the active objective. Do not perform a procedure merely because it appears here. Do not
mistake more process for better work. **Neither sentence applies to Section 0.**

**1.1 Authority and truth.** Conflict order: (1) user's latest explicit instruction; (2) the
floor; (3) active requirements, constraints, explicit policies; (4) verified repository,
file, environment, runtime, deployment and test reality; (5) accepted decisions not
superseded; (6) active plan/work graph/task contract; (7) proposals, assumptions, hypotheses,
generated suggestions, unverified claims. Never let an older prompt, previous agent
statement, stale plan or repeated assumption override verified reality or a newer user
instruction. Distinguish `user_requirement`, `verified_fact`, `accepted_decision`,
`proposal`, `assumption`, `hypothesis`, `generated_suggestion`, `unverified_claim` where
confusing them could cause an incorrect decision. Repeating an assumption does not make it a
fact. When recorded state conflicts with reality: inspect evidence, follow the higher
authority, correct active state, preserve still-valid completed work, record the replaced
statement when important.

**1.2 Claim integrity.** Never claim to have edited, created, deleted, executed, tested,
opened, installed, captured, committed, pushed, merged, deployed, published or verified
anything unless it actually completed and its result was inspected. An unexecuted,
incomplete, blocked or inconclusive test must never be recorded as passed. The F4 vocabulary
is binding for both durable records and messages.

**1.3 Scope discipline.** Do not invent objectives, requirements, dependencies or scope. Do
not rewrite functioning systems for preference or cleaner-looking architecture. Do not
replace user-authored work without a concrete project reason. Prefer the smallest change that
completely advances a real requirement. Preserve unrelated user work.

**1.4 Safety and confidentiality.** Never expose or store secrets in project files, source,
prompts, logs, screenshots, evidence, reports, commits, PRs, releases or deployed artifacts.
Do not perform paid, destructive, irreversible, security-bypassing, ownership-changing or
visibility-changing external actions without explicit authorization.

**1.5 Continuity.** Do not rely on conversation history as the only project memory. Persist
enough verified state for a later run to determine the objective, what is complete, what is
uncertain, what was last verified, what is modified but unverified, what is blocked, how to
recover, and the exact next action. The minimum required by F1/F2 is never ceremonial.

**1.6 Proportionate verification.** Do not mark work complete without verification
appropriate to its risk, scope and user impact. Small reversible changes may need only a
focused check — but that check must still be **executed** (F3). Integrated, stateful, public,
security-sensitive or hard-to-reverse changes need broader verification.

**1.7 Progress over ceremony.** When safe execution is possible, perform the work rather than
responding only with a plan. Do not ask the user to decide routine reversible details
resolvable from requirements, conventions, verified facts, comparison, tests or bounded
experiments. When one branch is blocked, continue other useful unblocked work.

**1.8 No fictional background work.** No work continues outside an active run unless an
actual supported and authorized scheduled process exists and was verified. Never promise
automatic later continuation. When such a process does exist it is unattended operation and
§0.4 governs.

---

# 2. ADAPTIVE RIGOR

Operates **above** the floor; it never selects less than Section 0.

**2.1 LIGHT** — narrow, local, easily reversible, low-risk, verifiable with a focused check.
Requires: inspect current state; identify intended result; make the change; run the smallest
meaningful check, **actually executed** (F3); update durable state (F2). No separate task
contract, evidence directory, role structure or formal checkpoint unless it adds real value.
LIGHT reduces documentation, decomposition and review depth. It does not remove F1–F4.

**2.2 STANDARD** — multiple files, new functionality, integration, persistent state,
nontrivial migration, moderate uncertainty, regression risk, dependent steps, or a
user-visible workflow. Requires a bounded task description, explicit completion conditions,
dependencies and risks, a recoverable baseline where needed, targeted checks, integration or
user-flow verification where applicable, a deliberate falsification pass, and a meaningful
persisted checkpoint.

**2.3 STRICT** — public release; production deployment; protected-branch merge; security,
auth or privacy; schema or user-data migration; destructive or hard-to-reverse operations;
high-impact architectural replacement; critical recovery behavior; legal/financial/ownership
consequences; secret handling; major compatibility risk; high uncertainty with high
consequence; or a blocking regression in a released system. Requires an explicit task
contract, verified baseline, tested rollback, linked acceptance criteria, broader gates,
preserved evidence, appropriately independent review, integration and recovery verification,
exact release verification, and a coherent durable checkpoint. STRICT triggers F5; delivery
within it triggers F6.

**2.4 Selection.** Default to the lowest sufficient level, subject to Section 0. Escalate on
newly discovered risk. Reduce when evidence shows the work is simpler than expected. Never
choose a level to avoid a floor obligation. **If the choice between two levels is genuinely
unclear, choose the higher one.** Judge by consequence, coupling, uncertainty, reversibility
and verification needs — not word count or apparent ease.

---

# 3. DISTINCT LIFECYCLES

Track separately: **Project** (whole body of work); **Logical session** (user-controlled
continuity boundary spanning conversations, devices, context resets, runs); **Current
objective**; **Run** (one opportunity to act); **Iteration** (one bounded change cycle).

A logical session ends **only** when the user explicitly says so. Do not infer its end from a
new chat, app closure, device change, context compression, elapsed time, objective
completion, a short acknowledgment, a tool failure or a usage limit.

On objective completion: mark complete only after F5 and F7; preserve the verified result;
select or await the next objective; keep the logical session active. On explicit session end:
reconcile state with reality, record completed/partial/blocked/deferred/rejected/rolled-back
work, the last verified checkpoint, changed artifacts, risks, unresolved uncertainty, and the
exact continuation point; mark only that session inactive.

Project completion is separate; declare it only when the user does, or when all agreed
project-level criteria are objectively satisfied.

---

# 4. CAPABILITY-AWARE OPERATION

Determine the actual surface rather than assuming one. A GitHub connection is not proof of
write, PR, merge, release or deployment permission. Do not assume a desktop, terminal, local
filesystem, OS, editor, browser automation, background execution, external APIs, paid
services, writable repositories, network access, credentials or unrestricted permissions.

Inspect the capabilities needed for the current objective or next action; do not perform a
full inventory every run. Recheck when a new task requires them, their state is uncertain,
permissions may have changed, a tool failed unexpectedly, a remote or deployment operation is
imminent, or the last record is unreliable.

**A capability limitation must be demonstrated, not assumed.** Do not record a floor
obligation as impossible under F8, or enforcement as unavailable under F9, without an actual
attempt or clear evidence of absence.

If direct action is unavailable: continue every unblocked part; prepare complete files,
patches, commands, tests or handoffs; label them accurately as unapplied or unexecuted;
preserve the exact continuation point; state the confidence limitation; use the closest
reliable substitute without presenting simulation as reality.

Keep root `CLAUDE.md` concise and use it as a loader. For F9, prefer repository-native
mechanisms that run on the remote — a workflow in the repository, required status checks,
branch protection, a post-deploy job. Local hooks may supplement but never substitute,
because a local hook is skipped by any run that does not execute it.

---

# 5. MINIMUM DURABLE INSTALLATION

Installation is idempotent; receiving the instruction again must not duplicate the system,
reset valid state, erase history, create conflicting files or reactivate superseded work.

**5.0 Layer map.** Layer 1 = the short loader block in `CLAUDE.md`. Layer 2 = `START_HERE.md`,
`STATE.yaml`, and Section 0 in full inside this file; read every run under F1. Layer 3 = the
rest of this file, the optional files below, and `AI_DEVELOPMENT/MODULES/`. Section 0 is never
demoted to Layer 3. Module texts are always Layer 3. Do not copy the full protocol into Layer
1 or restate Layer 3 inside Layer 2 — reproducing a rule in two layers creates a second
authority.

**5.1 Minimum canonical files** — `START_HERE.md`, `AI_DEVELOPMENT/PROTOCOL.md`,
`AI_DEVELOPMENT/STATE.yaml`. These are floor artifacts; F1 and F2 depend on them. Keep
committed state secret-free and publication-safe; this repository is public.

**5.2 Optional files** — create only when value exceeds maintenance cost:
`AI_DEVELOPMENT/MODULES/`, `REQUIREMENTS.yaml`, `WORK_GRAPH.yaml`, `CAPABILITIES.yaml`,
`POLICIES.yaml`, `LEDGER.jsonl`, `SCHEMAS/`, `EVIDENCE/`, `RECIPES/`, `ARCHIVE/`. Prefer
consolidating a small project into `STATE.yaml` over many nearly empty files.

**5.3 Source-of-truth rule.** One authoritative source per kind of active information.
Derived views must not become competing authorities.

**5.4 Loader.** A clearly marked concise block in root `CLAUDE.md`, preserving unrelated
valid instructions.

**5.5 No-file fallback.** If durable file creation is unavailable, reproduce the F2
continuation record in full in chat each run and say plainly that continuity is not
guaranteed. F9 is then almost certainly unavailable too — say so rather than implying the
floor is protected.

---

# 6. BOOT, RESUME, RECONCILIATION

Each run: read `START_HERE.md`; read the relevant active parts of this file and `STATE.yaml`;
load only the optional records and modules the current work reaches; inspect the actual
files, repository, runtime, remote state and capabilities needed for the next action; compare
recorded state with verified reality; correct material discrepancies; health-check
proportionate to rigor; resume from the last verified checkpoint. Steps 1, 2, 4 and 5 are F1
and mandatory.

Do not reread the whole archive, module library or all historical evidence every run. Broader
audit only on migration, apparent corruption, conflicting records, unexplained repository
changes, a major release, a serious regression, a security concern, or insufficient active
state. Do not repeat verified work unless the implementation or environment changed, the
evidence became unreliable, a regression is suspected, or the user asks. Do not retry a
rejected approach unless the user asks, constraints changed, new evidence justifies it, or
the rejection rested on a false assumption — record what changed before retrying.

When the enforcement block claims a gate is active, confirm the mechanism still exists before
relying on it. A deleted, disabled or never-merged gate is **absent**, not active.

---

# 7. REQUIREMENTS, PLANNING, NEXT-WORK SELECTION

**7.1** Use only as much planning as the objective requires. Decompose recursively only until
a leaf can be assigned, completed in a bounded iteration, verified, integrated safely, and
rolled back or repaired.

**7.2** LIGHT work may be one concise statement. STANDARD/STRICT record enough of: objective,
reason, allowed scope, prohibited changes, dependencies, affected files and interfaces,
invariants, assumptions, expected result, acceptance criteria, required checks, risk,
rollback, completion conditions. Do not fill irrelevant fields.

**7.3 Priority classes.** P0 safety and integrity; P1 blocking correctness; P2 critical-path
requirement; P3 enabling foundation (including installing F9 enforcement once the capability
appears); P4 quality; P5 exploration. Within the highest applicable class compare
user-visible value, objective contribution, dependencies unblocked, risk and uncertainty
reduced, evidence gained, implementation and verification cost, reversibility, urgency,
maintenance impact. Choose the smallest independently verifiable task with the highest
defensible value. Do not repeatedly pick easy cosmetic work while structural blockers remain.

**7.4** A user change is authoritative: identify affected work, preserve valid completed
work, supersede/reopen/split/merge/defer/archive only affected parts, recalculate the next
action, continue without unnecessary restart.

**7.5** Parallelize only when tasks are genuinely independent, write scopes do not overlap
unsafely, shared state is controlled, integration ownership is clear, and the environment
supports it.

---

# 8. ADAPTIVE EXECUTION CONTROLLER

Conceptual loop; do not create a report per stage. A LIGHT change may pass through it in one
compact operation, but **stages 6 and 9 can never be empty**.

1 RECONCILE (F1) · 2 SELECT · 3 DEFINE · 4 PREPARE · 5 EXECUTE · 6 VERIFY (F3 — scope
adaptive, execution not) · 7 REVIEW (F5 at objective completion or STRICT) · 8 REPAIR OR
ROLLBACK · 9 CHECKPOINT (F2 at run end) · 10 DELIVER (§14, verified under F6) · 11 CONTINUE.

**8.1 Meaningful checkpoints** when a feature is verified, a risky change begins, a release
boundary is reached, a migration completes, a serious failure is diagnosed, a rollback
occurs, a handoff must survive a context change, the run may end, or the verified
continuation state materially changes. Not for every trivial edit. An investigation, rejected
experiment or rollback may still be a successful iteration when it produces verified
knowledge and leaves the project safe.

---

# 9. ACCEPTANCE, EVIDENCE, REVIEW, COMPLETION

**9.1** Translate vague requirements into observable behavior, measurable thresholds,
repeatable comparisons or explicit review standards where that materially improves
verification. Do not invent numerical thresholds merely to look objective. Maintain
traceability `requirement -> criterion -> work item -> artifact -> check -> evidence ->
result` for complex or high-risk work; concise direct traceability suffices for small work,
but F7 still requires an evidence link at objective completion.

**9.2** Run only the gates relevant to the change, environment, risk and criteria. Fast
targeted checks during implementation; broader checks at integration, migration, merge,
release or deployment boundaries. A successful generation, build, startup, screenshot or
single passing test does not prove feature completion. A failed mandatory gate blocks
acceptance — repair the implementation unless evidence shows the gate itself is invalid. **Do
not weaken a valid criterion or gate to make defective work pass; removing, disabling or
narrowing an F9 gate is prohibited (§14.5).** Results other than `passed` and
`not_applicable` must never be summarized as success.

**9.3 Independence levels.** **A** independent or source-blind (separate context evaluates
the runnable result without implementation source or implementer explanation); **B**
source-restricted (fresh context receives only minimum artifacts and evidence); **C** separate
falsification pass by the same agent, deliberately separated from implementation; **D**
prepared only, not executed. Never describe C or D as source-blind or fully independent.
STRICT should use A or B when supported. Under F5 the level actually used is recorded in
`STATE.yaml`. **Level D alone never satisfies objective completion.**

**9.4** When the product has an interactive surface and interaction is available, verify
through that surface. Static screenshot inspection is not equivalent to interaction testing.

**9.5** A task is complete only when its completion conditions and mandatory checks pass,
including F3. An objective is complete only when acceptance criteria are satisfied and mapped
to evidence (F7), a falsification pass was performed and its level recorded (F5), required
integration is complete, no blocking finding remains, durable state reflects reality, and any
required delivery is verified (F6).

---

# 10. MODULE ACTIVATION

Module texts are in `AI_DEVELOPMENT/MODULES/` (Layer 3). Activate a module only when its
trigger is satisfied by the actual project and its expected value exceeds its cost. Load a
module file only when activating it or checking whether its trigger fired. Record activation
briefly when it affects scope, cost, risk or continuation. Deactivate when its purpose is
satisfied. **Writing a module file is storage, not activation.** Module optionality never
reduces Section 0.

---

# 11. LOCAL-FIRST PRODUCT AND DEPENDENCY POLICY

Do not make the shipped product depend on an external AI API, paid inference service, hosted
agent or third-party cloud service without explicit authorization. Prefer, in order: existing
project capabilities; deterministic local or bundled code; compatible open-source libraries;
rule-based systems; practical local models; optional external services after explicit
authorization. Core functionality must remain usable when optional services are unavailable.

**This project's binding form of this rule is stronger and is set by `ARCHITECTURE.md` §0.1:
zero external asset downloads — every texture, mesh, animation and sound is generated
procedurally at boot.** That constraint is a product requirement and is not relaxed by this
section.

Before adding a dependency or asset, verify source, license, version, attribution,
compatibility, maintenance state, security implications, runtime cost and replacement risk.
Do not copy license-incompatible code or assets. Do not purchase anything without explicit
authorization.

---

# 12. CONTROLLED CHANGE, TESTING, RECOVERY

Prefer small, isolated, reviewable changes. For risky replacements: verified baseline;
recoverable state; isolated implementation; compare old and new behavior; migrate data;
regression checks; remove obsolete code only after verification; update documentation and
durable state. Do not leave duplicate authoritative systems active indefinitely.

A specialist result is not integrated merely because it was generated. Integration verifies
interfaces, dependencies, state flow, configuration, failure behavior, performance,
regression impact, and separation between development and release behavior.

Use deterministic tests and isolated state where practical. Avoid unnecessary dependence on
external networks, mutable third-party services, unstable timing, unordered behavior and
shared test state. **A quarantined flaky test does not count as passing.**

On significant failure: preserve logs and failing state; identify affected requirements;
determine the last verified state; restore safety when necessary; revalidate assumptions;
avoid blindly repeating the same approach; choose a materially different strategy when
justified; retest the repair or verify the rollback; preserve the exact continuation point.
On repeated failure: stop repeating, compare the failures, identify the common cause,
challenge the underlying assumption, record the failed pattern. Do not hide failed
experiments by deleting useful history, and do not leave the project broken.

---

# 13. QUESTIONS, EFFICIENCY, REPORTING

Efficiency rules apply **above the floor only**. Never cite conciseness, cost, remaining
context or time as a reason to skip a Section 0 obligation. The correct way to reduce context
cost is to leave Layer 3 unloaded, never to skip Layer 1 or 2.

Do not create unnecessary agents, roles, dashboards, schemas, files, abstractions, reports,
plans, tests, tools or infrastructure. Use deterministic tools before model judgment when
they answer reliably.

Ask the user only when the missing decision blocks all valuable progress, materially changes
the requested product, creates an irreversible consequence, or requires credentials, payment,
private information, legal acceptance or authority not already granted. When ambiguity is
non-blocking: choose a conservative reversible assumption, record it if it may matter,
continue, revise on better evidence.

Report promptly on a serious defect, changed assumptions, material scope impact, security or
privacy risk, data-loss risk, major architectural conflict, **a disabled, deleted or bypassed
enforcement gate**, or a release blocker. End every run that materially changed the project
with the §0.3 floor check line. Do not claim future automatic continuation.

---

# 14. REMOTE DELIVERY AND PUBLICATION POLICY

Active policies:

```
remote_delivery: standing_authorized
public_release: authorized_when_required_by_active_objective
routine_connected_credentials: authorized_without_secret_disclosure
paid_actions: prohibited
repository_visibility_change: prohibited
destructive_external_actions: prohibited
security_control_bypass: prohibited
private_information_exposure: prohibited
```

Standing authorization covers branch creation/reuse, commits, pushes, PR creation/updates,
remote checks, permitted review operations, merges, releases, deployments, publication and
public verification, when required to satisfy the active objective. Do not ask for separate
confirmation for each routine step. It persists across conversations, devices, context resets
and runs until the user revokes or restricts it, subject to platform capability, repository
permissions, branch protection, required human approval, §0.4, and valid mandatory gates.

Public release, production deployment and protected-branch merge are STRICT: F5 before, F6
after.

**Project-specific restriction currently in force.** This session additionally carries an
operator-level directive to develop and push only on the designated working branch and never
push to another branch without explicit permission. Where that conflicts with the standing
authorization above, the narrower restriction is honoured: push the working branch freely; do
**not** merge to `main` or publish Pages without an explicit user instruction. Recorded in
`STATE.yaml` under `remote.status` rather than silently resolved.

**14.1** Before delivery inspect remote repository, target branch, current remote revision,
concurrent changes, protections, required checks, existing branches and PRs, release
configuration, deployment mechanism, public target and rollback method. Confirm artifacts
expose no secrets, private data, development-only controls, unauthorized assets or
inappropriate source maps.

**14.2** Perform only the relevant steps: reconcile; create or reuse branch; commit
task-scoped changes; push and confirm the remote revision; create or update the PR with
objective, changes, checks, risks, deployment impact and rollback; inspect remote checks;
repair project-controlled failures rather than bypassing; review at the required level; merge
per repository convention after mandatory conditions pass; trigger the established release;
**verify the actually deployed revision through the real public surface (F6)**; record final
remote state including the verified public revision. Do not bypass branch protections. When
auto-merge later completes a deployment outside your observation, F6 is still owed at the
next run before it may be recorded `complete_verified`.

**14.3** A deployment starting is not proof of success; an existing public URL is not proof
the intended revision is active. On a blocking regression: stop expanding, repair or revert,
return to the last verified release, redeploy, verify recovery.

**14.4** On remote failure: inspect the real failure, preserve evidence, repair
project-controlled causes, update the existing branch/PR, rerun gates, retry, verify. If
blocked by an unavailable or prohibited action: complete every safe step, preserve the ready
state, record the exact blocker, do not claim success.

**14.5 Prohibited without separate explicit authorization** — force-push protected history;
bypass branch protection; suppress valid mandatory checks; **disable, delete, narrow or make
advisory any F9 enforcement gate**; falsify results; expose secrets; change repository
visibility; purchase anything; change subscriptions; transfer ownership; delete repositories;
delete production user data; destructive production operations; disable security controls;
accept legal terms; unrelated irreversible migrations.

---

# 15. GOVERNING RULE

Always satisfy the floor in Section 0, and prefer a mechanism that enforces it over a promise
that reports it. Above the floor, protect truth, safety, continuity, verification and the
active objective with the least necessary process. Increase rigor when consequence, coupling,
uncertainty or irreversibility demands it. Reduce rigor when additional procedure would not
materially improve the result. **When it is unclear whether a floor obligation applies,
perform it.**

---

# MIGRATION RECORD — legacy to 2.2, 2026-08-01

Performed on branch `claude/1-round-execution-kgtb9r` at pre-migration checkpoint `29cbe9c`,
mid-objective (rounds 16–20). No unattended chain existed to halt: the repository has no
`.github/workflows`, no cron and no scheduled process.

Legacy records are **preserved, not deleted**. Mapping by meaning:

| Legacy | Status under 2.2 |
|---|---|
| `PROJECT_OPERATING_PROTOCOL.md` | superseded as operating authority by this file; retained as historical record |
| `AI_DEVELOPMENT/INDEX.md` | superseded as loader by `START_HERE.md`; retained |
| `AI_DEVELOPMENT/PROJECT_STATE.yaml`, `SESSION_STATE.yaml` | superseded as canonical state by `STATE.yaml`; **were stale** (described round 15 as last completed and a different working branch); retained as history |
| `ACTIVE_FRONTIER.yaml`, `PLAN_TREE.yaml`, `TASK_GRAPH.yaml` | retained; must not act as competing authorities. No `WORK_GRAPH.yaml` created — the objective is a linear five-round sequence and does not justify a graph |
| `REQUIREMENTS.md`, `CONSTRAINTS.md`, `ACCEPTANCE_CRITERIA.yaml` | retained and still active; no consolidation, it would not improve reliability |
| `DECISIONS.md`, `FAILURES.md`, `TECHNICAL_DEBT.md`, `EVIDENCE/`, `HANDOFFS/`, `TEST_HISTORY/`, `BENCHMARKS/`, `EXPERIMENTS/`, `SESSION_ARCHIVE/` | retained unchanged |
| `AI_DEVELOPMENT/SKILLS/` | retained; genuine Claude Code skills remain under `.claude/skills/`. Not renamed |
| `HANDOFF.md`, `ROUND.md`, `ARCHITECTURE.md`, `README.md` | **unchanged and still authoritative** in their domains; §5.3 one-authority rule points at them |
| standing push/merge/publish authorization | preserved under §14, with the operator branch restriction recorded |

Non-conflicting past instructions remain in force, including the whole KAGEROU art-direction
method: measure don't assert, symptom before mechanism, disprove before acting, dispatch only
named owners, the critic is always a separate agent, and the capture-rig cautions in
`HANDOFF.md`. The five-round objective (16–20) and the active logical session were preserved
across the migration and were not restarted.

No product behavior was changed by the migration itself.
