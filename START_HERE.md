# START HERE — KAGEROU 陽炎

Boot loader for every Claude Code run in this repository. Read this first, then the active
part of `AI_DEVELOPMENT/STATE.yaml`, then verify both against actual repository, runtime and
remote reality before acting.

- **Protocol version:** Adaptive Edition with Enforced Floor, 2.2
- **Full protocol:** `AI_DEVELOPMENT/PROTOCOL.md` (contains Section 0 in full)
- **Canonical active state:** `AI_DEVELOPMENT/STATE.yaml`
- **Modules (Layer 3, load only when a trigger fires):** `AI_DEVELOPMENT/MODULES/`

## Canonical file locations

| What | Where |
|---|---|
| Operating rules, Section 0 in full | `AI_DEVELOPMENT/PROTOCOL.md` |
| Active state, floor block, enforcement | `AI_DEVELOPMENT/STATE.yaml` |
| Product architecture, ownership, art/perf contract | `ARCHITECTURE.md` |
| Detailed art-review state and disproved mechanisms | `HANDOFF.md` |
| Art-round procedure | `ROUND.md` |
| Public/release-facing status | `README.md` |
| Standing KAGEROU product brief | `CLAUDE.md` |
| Historical legacy records | `AI_DEVELOPMENT/` (see PROTOCOL.md §Migration) |

## Authority order

1. The user's latest explicit instruction.
2. The mandatory floor (Section 0 of `PROTOCOL.md`).
3. Active requirements, constraints, explicit project policies.
4. Verified repository, file, runtime, deployment and test reality.
5. Accepted decisions not superseded.
6. Active plan / work graph / task contract.
7. Proposals, assumptions, hypotheses, unverified claims.

Repeating an assumption never makes it a fact.

## The floor — triggers, compressed

Non-discretionary. Never waived for cost, brevity, context, confidence, or because the work
is small. If it is unclear whether a trigger fired, **treat it as fired**.

- **F1 Continuity read** — about to inspect/change/verify/deliver anything → read this file
  and the active part of `STATE.yaml`, and verify the relevant parts against reality.
- **F2 Continuity write** — run materially changed the project, or is ending with an
  objective open → persist status, last verified checkpoint, unverified artifacts, blockers,
  recovery, remote state, exact next action. Reserve capacity for this.
- **F3 Execution verification** — changed code/config/data/schema/assets/build and execution
  is possible → actually run it and inspect the real result. Generation is not verification.
- **F4 Status honesty** — any status recorded or stated → use only `complete_verified`,
  `complete_unverified`, `prepared_not_applied`, `prepared_not_executed`, `blocked`,
  `inconclusive`, `failed`, `rejected`, `rolled_back`, `superseded`. Prose must not upgrade
  the recorded status.
- **F5 Falsification** — objective about to be marked complete, or STRICT work → deliberate
  falsification pass, at least Level C; record the independence level actually used.
- **F6 Real-surface verification** — a merge/release/deploy/publication changed what a user
  receives → verify through the real public surface that the intended revision is served, the
  primary journey works, and no blocking runtime error occurs. Record the verified revision.
- **F7 Acceptance mapping** — objective marked complete → per criterion, satisfied or not,
  with the specific evidence.
- **F8 Skip accounting** — a floor trigger plausibly applied but you concluded it did not
  fire, or the obligation was impossible → one line in `STATE.yaml`.
- **F9 Deterministic enforcement** — environment exposes a mechanism that can fail/block/revert
  independently of your report, and the objective involves repeated implementation or delivery
  → install the smallest reliable F2/F3/F5/F6 gates and record which are actually active. A
  gate never observed failing is `prepared_not_executed`, not active. Bounded: those four only.

**End every run that touched the project with the floor check line**, e.g.
`Floor: F1 ok | F2 ok | F3 executed (capture rig) | F4 ok | F5 C | F6 n/a | F7 n/a | F8 0 | F9 gates: none active`

## Enforcement status — one line

**No F9 gate is active.** The repository has no CI, no required status checks and no branch
protection reachable from this environment; the public surface is unreachable from this
container by agent-proxy policy. All floor items are therefore **self-reported only**, and
work whose sole independent evidence would have been a missing gate is recorded
`complete_unverified`. See `floor.enforcement` in `STATE.yaml` for the per-gate record.

## Resume procedure

1. Read this file and the active portion of `STATE.yaml`.
2. Load only the protocol detail and module files the current work actually reaches.
3. Inspect the real git/worktree/remote/runtime state needed for the next action.
4. Reconcile recorded state against verified reality; verified reality wins.
5. Resume from `execution.exact_next_action`.

For an art round specifically, also read `HANDOFF.md` and `ROUND.md`. Do not derive the
active round number from `shots/` — most of it is gitignored.

## Unattended operation

None is installed. Do not start any scheduled workflow, self-restarting loop or routine for
delivery-capable work while the four F9 gates are inactive (Section 0.4).
