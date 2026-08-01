# Project-wide persistent autonomous development protocol

Status: active
Adopted: YYYY-MM-DD
Scope: the entire `owner/repo` project

This is the durable operating protocol: how work is selected, executed, verified, recorded,
resumed and handed off. It is **not** a product brief. Nothing about what to build may be
derived from this file; the product comes from the documents named in
`AI_DEVELOPMENT/PROJECT_STATE.yaml` → `authorities`, and from the user's latest instruction.

Twelve sections, deliberately. Every rule below is here because something went wrong without
it, and rules nobody can hold in their head are not rules. Where a section says a thing is
forbidden, the failure it prevents is named.

## 1. Authority

Resolve conflicts in this order:

1. the user's latest explicit instruction;
2. active requirements and constraints;
3. verified files, runtime behaviour, and test results;
4. accepted decisions that have not been superseded;
5. the active plan and frontier;
6. explicitly labelled assumptions and hypotheses.

When a conflict is found, record it in `AI_DEVELOPMENT/DECISIONS.md`, say what it replaced,
update the affected plans and criteria, and preserve still-valid completed work. Never turn
an assumption into a fact by repetition, and never let an earlier agent's assertion outrank a
measurement.

## 2. Sources of truth

`AI_DEVELOPMENT/INDEX.md` is the loader and the authority table. Give every file one job. Do
not create a second authority for something that already has one: this project has already
paid for that mistake, with three competing handoff documents that disagreed and cost two
sessions the same round of work.

Machine state — ids, parents, dependencies, statuses, criteria, evidence references — lives in
`AI_DEVELOPMENT/PROJECT_STATE.yaml`. Prose lives in the documents that state file points at.
Do not copy prose into the state file, and do not copy state into prose.

## 3. Resume

At the start of every run: read this file and `INDEX.md`, then `PROJECT_STATE.yaml` and
`SESSION_STATE.yaml`, then whatever the active task points at, then the relevant decisions,
failures and evidence. Then inspect actual branches, commits, working tree and runtime, and
reconcile the records against them. Run the smallest relevant health check. Continue from the
exact recorded stopping point.

Do not repeat verified work or re-test a mechanism `FAILURES.md` already disproved. If state
files are missing or damaged, reconstruct them from the repository and evidence, mark the
uncertainty, and record the reconstruction.

Record the exact working branch, base ref and SHA. A new session often starts from the
default branch, so work that exists only on a feature branch is otherwise invisible.

## 4. Logical sessions

A logical session ends only when the user explicitly says it is finished. A new chat, a
closed app, a finished turn, a commit, a merged pull request, a tool failure, a context
compression and the passage of time are checkpoints, not endings.

While the session is active, keep `SESSION_STATE.yaml` `active` and keep the objective,
modified files, last verified action, next action, rollback point and pending verification
current after every meaningful verified iteration. Do not archive, re-prioritise from
scratch, or mark incomplete work complete. Do not promise background work that nothing is
scheduled to perform.

Only after an explicit end instruction: reconcile the records, write the final handoff,
archive the session and set `end_declared_by_user`. Ending a session is not completing the
project.

## 5. Planning and selection

Maintain the full hierarchy and the actionable subset separately, so the frontier can move
without rewriting the plan. Leaf tasks must be bounded, independently verifiable, reversible,
dependency-safe and tied to a real requirement and criterion.

Select the highest-value ready task by contribution to the objective, dependencies unblocked,
risk and uncertainty reduced, user-visible value, regression prevention, cost of execution
and verification, reversibility and learning value. Prefer the smallest task with the largest
verified effect.

Build infrastructure first only when it unlocks a concrete requirement or prevents a known
failure. Do not execute an obsolete plan, do not choose cosmetic work over a structural
blocker, and do not silently broaden or narrow scope.

## 6. Implementation and integration

Make small, isolated, reviewable changes. Before changing an interface, inspect its consumers,
invariants, migration needs, tests and rollback path. Identify the last working state before
risky work.

Parallel work must be genuinely independent: one owner per file, never two. Stage the exact
paths you changed — `git add -A` has already swept three owners' work into a commit whose
message named one system.

A specialist's isolated output is not complete until integration is verified. Never hide a
failed experiment; record its evidence and cause.

## 7. Measurement, experiments and repair

Measure behaviour. Do not trust configuration that looks correct — almost every defect on
these projects was silent: no exception, no log, plausible-looking settings.

- "It looks better" is not a result. Give the number that moved and how it was obtained.
- Verify by measuring the same region before and after. **Byte-identical numbers mean the
  branch you edited does not affect those bytes**, not that the change was subtle.
- Check the apparatus before trusting it. It has broken repeatedly, and every time it turned
  a correct critique into a wrong fix.
- Validate a new measurement tool against a trusted one on one identical input before using
  its output.

Symptoms are reliable; mechanisms are not. Keep `problem` and `hypothesis` apart, disprove a
hypothesis before acting on it, and record the disproof — ruling out a wrong cause is worth as
much as a fix, because it stops the next round building on it.

State a falsifiable prediction, change one variable, remeasure the same region, check
secondary effects, keep only net improvements, and record shortfalls. On repeated failure,
stop repeating: compare the failures, challenge the shared assumption, record the failed
pattern, and change strategy.

## 8. Acceptance, gates and evidence

Every significant requirement gets a concrete criterion in `PROJECT_STATE.yaml`, traceable to
its source, plan node, files, tests and evidence. Do not weaken a criterion because it is
difficult; a material change requires the user's approval.

A criterion may be `verified` only when it names the apparatus that verified it, what that
apparatus measured, and evidence that is not `none`. This is enforced, because otherwise
`verified` costs nothing to write.

Use layered gates in proportion to the change: state and schema validation, syntax and
configuration checks, production build, focused automated checks, integration and
deterministic checkpoint tests, end-to-end flows through the real surface, independent
review, then performance, clean-setup and release checks.

A successful build is not a successful feature. An unexecuted test is `prepared_not_executed`,
not `passed`. A failed mandatory gate blocks acceptance; repair the implementation unless
evidence proves the gate itself is wrong, and never change a gate to let a defect through.

**A gate must be seen to fail.** A silently inert gate and a passing gate look identical —
both print nothing and exit 0. Prove each gate fires on a deliberately broken input before
trusting that it passed. Two migrations on record ended with gates installed but never
observed failing.

## 9. Independent review and typed handoffs

Implementation does not approve itself. After a material change, a different agent — or at
minimum a fresh context with a sanitized evidence package — tries to refute it: assumptions,
regressions, lifecycle and state handling, interfaces, recovery, security, performance,
hidden coupling, and tests that pass for the wrong reason. Record which independence level
was actually used; an honest `C` is worth more than a claimed `A`.

A finding carries an id, a severity, the evidence, the reproduction, and the retest.
Disagreements are settled by reproducing, not by discussion. An unresolved high-severity
finding blocks completion.

Every material handoff is typed: task, scope, inputs, outputs, interfaces, dependencies,
invariants, assumptions, unresolved questions, criteria, tests, risks, rollback, status.
Reject a contradictory or incomplete upstream contract rather than silently compensating for
it downstream.

## 10. Dependencies, secrets and privacy

Verify a dependency's source, version, licence, attribution, compatibility, maintenance and
security before adopting it. Prefer existing code and deterministic local systems over new
services.

Never store passwords, tokens, API keys, private keys, recovery information or personal data
in source, state, logs, screenshots, reports or evidence. This is scanned, in two directions:
suspicious key names in the state files and credential-shaped values in the documents.

Do not disable a security control, and do not leave a development or test hook reachable in
normal release behaviour.

## 11. External actions

Without an explicit user instruction, do not purchase anything, change accounts or
credentials, push or merge to a remote, publish or deploy publicly, run destructive database
or cloud operations, perform irreversible migrations, delete user data, or publish private
data.

A standing authorization for some of these may be recorded in `PROJECT_STATE.yaml` →
`remote_authorization`, quoting the instruction that granted it. It stays in force until the
user changes it, and it never extends to the categories above that it does not name.

Where an action is authorized, verify it after the fact: inspect the actual remote ref, the
merged SHA and the served public bytes. **Never call a thing published until the served bytes
were fetched and checked** — a push that succeeded is not evidence that the site serves the
new build. Two failures in exactly that gap are on record, and neither was caught by the
build.

## 12. Completion

A task is complete when its criteria pass, integration and regressions are verified, the user
surface and relevant performance are checked, failure and recovery behaviour is tested,
records and evidence are current, and no unresolved blocking or high-severity finding
remains.

Generated code, a clean compile, a screenshot, or one review is not completion. State
remaining uncertainty in proportion to the evidence — and if something cannot be done, say so
plainly and say why. Never narrow the target and report success.
