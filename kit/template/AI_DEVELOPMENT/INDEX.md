# AI development index

The loader for this repository's operating state. Read it first; it tells you what to read
next and which file wins when two disagree.

It is held under a byte ceiling by `tools/validate-state.mjs`. That is not fussiness: a
loader document that grows past a few kilobytes stops being read as a loader, and the next
session starts by skimming it instead of loading it.

## Load order

1. `../PROJECT_OPERATING_PROTOCOL.md`
2. this file
3. `PROJECT_STATE.yaml`, then `SESSION_STATE.yaml`
4. whatever the active task's `authorities` entries point at
5. relevant `DECISIONS.md`, `FAILURES.md`, handoffs and evidence
6. actual git state, working tree, runtime and test results

Reconcile the records against step 6 before acting. Where they disagree, verified reality
wins and both records are corrected.

## Authority by category

| Category | Authoritative file |
|---|---|
| Operating rules and conflict order | `../PROJECT_OPERATING_PROTOCOL.md` |
| Machine state: ids, parents, dependencies, statuses, criteria | `PROJECT_STATE.yaml` |
| Active logical session and exact continuation point | `SESSION_STATE.yaml` |
| Requirements, design, acceptance prose | the paths in `PROJECT_STATE.yaml` → `authorities` |
| Accepted and superseded decisions | `DECISIONS.md` |
| Failed approaches and what disproved them | `FAILURES.md` |
| Objective outputs | `EVIDENCE/` |
| Specialist contracts | `HANDOFFS/` |
| Closed sessions | `SESSION_ARCHIVE/` |

## Status vocabulary

Plan nodes and tasks use exactly these twelve values:

`proposed`, `accepted`, `ready`, `active`, `blocked`, `awaiting_verification`,
`under_review`, `verified`, `rejected`, `deferred`, `superseded`, `archived`.

Gate and test results use exactly these six:

`passed`, `failed`, `blocked`, `not_applicable`, `prepared_not_executed`, `inconclusive`.

`prepared_not_executed` is the one that earns its place. A check that was written but never
run is not a passing check, and recording it as one is the cheapest way to lose a session's
worth of trust in the whole record.

## Rules this directory is under

- Update state after each meaningful verified iteration, not at a chat boundary.
- `state_revision` must match in `PROJECT_STATE.yaml` and `SESSION_STATE.yaml`. If it does
  not, stop and reconcile before doing anything else — a half-applied edit reads exactly
  like a consistent state.
- A criterion may be `verified` only with an apparatus, a measured value, and evidence that
  is not `none`.
- Never delete a superseded decision. Record what replaced it and why.
- Move closed sessions to `SESSION_ARCHIVE/` only after the user explicitly ends the
  session.
- Run `node tools/validate-state.mjs` after changing anything here.
