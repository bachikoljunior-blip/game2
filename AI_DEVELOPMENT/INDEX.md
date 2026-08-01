# AI development index

This directory is the concise, reloadable control plane for the whole project. Detailed
visual-round measurements stay in `../HANDOFF.md`; they are referenced, not duplicated.

## Load order

1. `../PROJECT_OPERATING_PROTOCOL.md`
2. `PROJECT_STATE.yaml` and `SESSION_STATE.yaml`
3. `REQUIREMENTS.md`, `CONSTRAINTS.md`, `REFERENCE_BENCHMARKS.yaml`, and
   `ACCEPTANCE_CRITERIA.yaml`
4. `ACTIVE_FRONTIER.yaml`, `TASK_GRAPH.yaml`, and relevant branches of `PLAN_TREE.yaml`
5. Relevant `DECISIONS.md`, `FAILURES.md`, `TECHNICAL_DEBT.md`, handoffs, and evidence
6. For an art round: `../HANDOFF.md`, `../README.md`, `../ROUND.md`, and
   `../tools/CRITIC.md`
7. Actual git state, source, runtime, and test results

## Authority by category

| Category | Authoritative file |
|---|---|
| Operating rules and conflict order | `../PROJECT_OPERATING_PROTOCOL.md` |
| Product architecture, owners, art/UX/performance contract | `../ARCHITECTURE.md` |
| Current concise project state | `PROJECT_STATE.yaml` |
| Active logical session and exact continuation point | `SESSION_STATE.yaml` |
| Requirements and constraints | `REQUIREMENTS.md`, `CONSTRAINTS.md` |
| Per-element reference titles, why each was chosen, and the bar it sets | `REFERENCE_BENCHMARKS.yaml` |
| Testable completion conditions | `ACCEPTANCE_CRITERIA.yaml` |
| Complete plan and current actionable work | `PLAN_TREE.yaml`, `ACTIVE_FRONTIER.yaml` |
| Dependencies between tasks | `TASK_GRAPH.yaml` |
| Accepted and superseded decisions | `DECISIONS.md` |
| Failed patterns and recovery facts | `FAILURES.md` |
| Known non-blocking liabilities | `TECHNICAL_DEBT.md` |
| Detailed art-review state and disproved visual hypotheses | `../HANDOFF.md` |
| Art-round procedure and number | `../ROUND.md` |
| Public verified status | `../README.md` |
| Specialist contracts | `HANDOFFS/` |
| Objective outputs | `EVIDENCE/`, `TEST_HISTORY/`, `BENCHMARKS/`, and tracked `../shots/*.json` |

## Status vocabulary

`proposed`, `accepted`, `ready`, `active`, `blocked`, `awaiting_verification`,
`under_review`, `verified`, `rejected`, `deferred`, `superseded`, `archived`.

## Update and archive rules

- Update state after each meaningful verified iteration, not only at a chat boundary.
- Keep active files concise; move closed session history to `SESSION_ARCHIVE/` only after
  the user explicitly ends the logical session.
- Preserve a decision's reason when it is superseded.
- `REFERENCE_BENCHMARKS.yaml` holds the *bar* for each element; `ACCEPTANCE_CRITERIA.yaml`
  holds the gates a round *ran*. A benchmark criterion moves into acceptance when it is
  actually executed. Do not duplicate one into the other.
- A benchmark criterion may become stricter freely. It may be weakened only when proved
  unsatisfiable as stated, with the disproof stored — never to let the build pass.
- Put large disposable captures under `shots/`; commit the compact JSON verdict and report,
  not every frame.
- Run `npm run validate:project` after state changes.
