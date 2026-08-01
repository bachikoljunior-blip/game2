# template — protocol, state and CI scaffolding

The kit gives a repository the tooling. This gives it the discipline the tooling assumes:
one operating protocol, two machine-readable state files, and a CI job that runs the gates
*and proves they can fail*.

```bash
node tools/bootstrap.mjs --target=/path/to/repo --template
```

Existing files are never overwritten. A repository that already has a protocol has one for a
reason, and the only thing worse than two disagreeing records is one that quietly replaced
the other.

```
PROJECT_OPERATING_PROTOCOL.md          12 sections, product-neutral
AI_DEVELOPMENT/INDEX.md                the loader and authority table (byte-capped)
AI_DEVELOPMENT/PROJECT_STATE.yaml      canonical machine state — the file the floor gate names
AI_DEVELOPMENT/SESSION_STATE.yaml      the active session and the exact resume point
AI_DEVELOPMENT/DECISIONS.md            accepted and superseded decisions
AI_DEVELOPMENT/FAILURES.md             disproved mechanisms — read before proposing one
tools/validate-state.mjs               the state gate, plus --selftest and --gate
tools/verify-published.mjs             prove the public surface serves what was published
.github/workflows/check.yml            gates, in the order they get cheaper to fix
.github/workflows/pages.yml            publish, then verify the served bytes
```

## Read this before adopting it

The repositories this was extracted from **genuinely disagree on fifteen points**. They are
not stylistic; several are cases where the two implementations of the same gate cannot both
pass as written. The template settles each one, and every row below says what it chose and
what that choice costs.

| # | Divergence | What the repositories do | Adopted | Why |
|---|---|---|---|---|
| 1 | State serialisation | `game2`: JSON with camelCase keys in a file named `.yaml`. `survival`: JSON with snake_case keys in `.json`. | **Real YAML, snake_case** | Both chose JSON for the same reason — `JSON.parse` is in the runtime and a YAML parser is a dependency. But a state file is the one artefact edited by hand under pressure, and JSON has no comments, so the reason a field exists lives somewhere else and rots. Every field in these files is there because something went wrong once. `.kit/lib/state/yaml.mjs` is a strict subset parser that keeps the kit dependency-free; it refuses what it cannot fully understand rather than guessing. |
| 2 | How many state files | `game2`: eight (`PROJECT_STATE`, `SESSION_STATE`, `PLAN_TREE`, `ACTIVE_FRONTIER`, `TASK_GRAPH`, `ACCEPTANCE_CRITERIA` and Markdown ledgers). `survival`: two JSON files plus `docs/`. | **Two**: plan, tasks and criteria in `PROJECT_STATE.yaml`; session, frontier and checkpoint in `SESSION_STATE.yaml` | The split has to fall where the *write frequency* changes, not where the concepts do. The frontier moves several times a session and the plan rarely, which is the one boundary both designs agree on. Eight files means eight chances for a partial update, and no single file the floor gate can name. |
| 3 | Canonical state path | Neither `game2` nor `survival` has one. `Q` has a floor gate that requires one. | **`AI_DEVELOPMENT/PROJECT_STATE.yaml`** | `evaluateFloorGate` takes exactly one `statePath`: the file a product change must move. Without a single canonical path the F2 rule cannot be stated, let alone enforced. |
| 4 | `review_outcome` accepted value | `Q` demands `passed`; `Gptgame` demands `complete_verified`. | **`complete_verified`** | The two gates cannot both pass as written. `passed` is not in the status vocabulary either protocol defines, and it collides with the gate-result vocabulary where `passed` means "this check ran and was green" — a different claim from "this change was reviewed end to end". This is recorded in `.kit/lib/state/floorGate.mjs`. |
| 5 | Protocol language | `game2`: English. `survival`: Japanese. | **English body, product language untouched** | The protocol is read by agents that also read the kit's module documentation, its skills and its error strings, all of which are English. The *product* brief keeps whatever language the product uses — `survival`'s Japanese directive is not a defect and the template does not touch it. |
| 6 | Protocol size | `game2`: 14 sections. `survival`: 32. | **12 sections** | Length is what turns a protocol into a document people cite rather than follow. `survival`'s §14–§22 are product-domain rules (asset pipelines, autonomous entities, experiment diversity) that belong in a product brief; removing them from the operating protocol is not weakening it, it is putting them where they are actually read. |
| 7 | Where the product brief lives | `game2`: `CLAUDE.md` + `ARCHITECTURE.md` + `README.md`. `survival`: `docs/directive.md` + `bible.md` + `DONE.md` + `STATE.md`. | **Named by role in `PROJECT_STATE.yaml` → `authorities`, never by path** | Both layouts are fine and neither should have to change to adopt this. Hard-coding paths into the protocol is what forces a repository to choose between its own history and the template. |
| 8 | Resume entry point | Both use `AI_DEVELOPMENT/INDEX.md`, uncapped. | **`INDEX.md` under an 8 KB ceiling, enforced** | The only agreement of the fifteen, and it still needed a gate: a loader document that grows past a few kilobytes stops being loaded and starts being skimmed. `requireByteCeiling` is how "concise" survives six months of additions. |
| 9 | Session-end rule | `game2`: a paragraph of prose. `survival`: `end_declared_by_user`, a boolean. | **The boolean** | "Only the user ends a session" is the rule most often broken by accident, at exactly the moment nobody is reading prose. A boolean is the part of it a validator can hold, and the validator additionally requires a closed session to carry a final handoff and an archive reference. |
| 10 | Staleness detection | `game2`: `updatedAt` + `schemaVersion`, unchecked. `survival`: `state_revision` echoed in three files and cross-checked. | **`state_revision`, cross-checked between the two files** | A timestamp cannot fail. A half-applied edit — one file saved, the other not — reads exactly like a consistent state, and this is the cheapest check in the validator and the one most likely to fire. |
| 11 | Evidence location | `game2`: `shots/` and `AI_DEVELOPMENT/EVIDENCE/`. `survival`: `EVIDENCE/`, `TEST_HISTORY/`, `BENCHMARKS/`. | **`AI_DEVELOPMENT/EVIDENCE/` canonical, paths checked for existence** | The directory matters less than the check. `evidenceExists` fails a task whose evidence path is not on disk, which is what stops a plausible-looking path from standing in for a measurement. Large disposable captures stay wherever the project already puts them; commit the compact verdict, not every frame. |
| 12 | Where skills live | `game2`: `.claude/skills/`. `survival`'s protocol §15: `AI_DEVELOPMENT/SKILLS/`. | **`.claude/skills/`** | Claude Code loads that directory automatically. `AI_DEVELOPMENT/SKILLS/` was never loaded by anything — a skill nobody loads is a document, and it was being maintained as though it were executable. |
| 13 | CI | `game2`: none. `survival`: `pages.yml` plus an `autopilot.yml` that chains itself, self-merges with a PAT, and stops on `docs/STOP`. | **`check.yml` + optional `pages.yml`. No autopilot.** | Autopilot needs two secrets, a PAT that bypasses the "GITHUB_TOKEN does not trigger workflows" rule, and permission to merge its own work. That is a deliberate decision for a specific repository, not a default anything should inherit by installing scaffolding. |
| 14 | CI Node version | `survival/.github/workflows/pages.yml` pins `node-version: '20'`. | **22** | Not a preference — a defect the template would otherwise inherit. `.kit/` uses `node:fs.globSync` and the built-in test runner, both Node 22. `survival` can install the kit today and its own CI cannot run it. |
| 15 | Proving the gates | Neither repository's CI proves a gate can fail. Three tools in `Q` carry a `--deliberate-failure` mode; nothing calls them. | **`--selftest` runs in CI, before the gates themselves** | A silently inert gate and a passing gate are indistinguishable from outside: both print nothing and exit 0. Two migrations on record ended with gates installed but never observed failing, and their state files honestly say `prepared_not_applied`. The self-test includes a must-pass control, because a gate that fires on everything is as broken as one that never fires. |

Rows 1, 4 and 14 are the ones that will bite. Row 1 changes how every state file is written;
row 4 makes one of the two existing floor gates fail until its state file is updated; row 14
means a repository that adopts `check.yml` while keeping a Node 20 pin elsewhere now has two
Node versions in CI.

## Adopting it into a repository that already has a protocol

Do not delete the existing one first. Install the template, then reconcile:

1. Install: `node tools/bootstrap.mjs --target=<repo> --template`. Files that already exist
   are left alone and named in the output, so the output *is* the reconciliation list.
2. Move machine state into `PROJECT_STATE.yaml` — ids, parents, dependencies, statuses,
   criteria, evidence paths. Leave prose where it is and point `authorities` at it.
3. Run `node tools/validate-state.mjs`. Expect it to fail. The first run against real state
   normally finds a criterion marked verified with no apparatus, a dependency that names a
   task id that no longer exists, or an evidence path that was deleted.
4. Run `node tools/validate-state.mjs --selftest` and read the table. Every case must fire
   and the control must not.
5. Wire both into CI, then delete whatever the old protocol duplicated — and record what was
   replaced in `DECISIONS.md`, including the reason, so the rejected option does not come
   back in a month.

## What this does not do

It does not check that the protocol is *followed*. `validate-state.mjs` checks structure,
vocabulary, referential integrity, staleness, secrets and the review record; it cannot tell
whether a measurement was real or whether a review happened. That is what independence level
`A` and an adversarial critic are for, and both live outside this file.
