# Kit rollout — the single record for this workstream

This file is the **only** state record for rolling the shared kit across the eight
repositories. It lives here because `game2` is reliably pushable from a session and already
has a resume procedure; the kit's *contents* are authoritative in
`bachikoljunior-blip/kit`, not here.

Do not start a second record. This repository has already paid for that once: three
competing handoff documents made two sessions independently solve the same problem.

Update the **Verified state** table after every step that lands, and tick the step. A step is
done when its acceptance line has been *observed*, not when the edit was made.

---

## Verified state

Measured 2026-08-01. Every SHA below was read back from the remote with `git ls-remote`, not
assumed. Both game repositories moved from `claude/past-work-skill-candidates-v6l3xm` onto
`claude/kit-rollout-game2-survival-0vspel` by fast-forward — the old branch head was a strict
ancestor with no commits of its own left behind, checked with `merge-base --is-ancestor`.

All eight target repositories now carry the kit, on one branch name:
`claude/kit-rollout-game2-survival-0vspel`.

| Repo | SHA (remote-read) | Kit | Skills |
|---|---|---|---|
| `kit` | `d334e77` on `main` + `claude/kit-template-creation-ndursc` | source of truth, v0.2.0, 52 files, 34 tests | n/a |
| `game2` | branch head — this file's own commit is the last one | v0.2.0, `check:kit` passes, validator on `lib/state` | 9 + `round` |
| `survival` | `54c541e` | v0.2.0, harness on `lib/browser` + `lib/image`, validator on `lib/state` | 9 |
| `Gptgame` | `4586c66` | v0.2.0, validator on `lib/state`, self-test in CI | 9 |
| `Q` | `1720d47` | v0.2.0, both gates on `lib/state`, self-test in CI | 9 |
| `game` | `6247fd2` | v0.2.0, `check:kit` chained into `npm run check` | 9 |
| `Simple-browser-cookie-clicker-game` | `4375dde` | v0.2.0, `check:kit` only — no build manufactured | 9 |
| `Cooky` | `b431196` | v0.2.0, `check:kit` only — no build manufactured | 9 |
| `exist-debug` | `418f8bf` | v0.2.0, `check:kit` only — no build manufactured | 9 |

What is already proven, so nobody re-proves it:

- `lib/plan/dispatch.mjs` reproduces the original `game2/tools/dispatch.mjs` on all nine real
  review files. Baseline frozen at `AI_DEVELOPMENT/EVIDENCE/dispatch-replacement-baseline.json`.
- `lib/image` reproduces the original `game2/tools/luma.mjs` on a real captured frame — all
  twelve fields identical (p50 86, p1 3, p99 196, pctBelow16 8.024, pctAbove240 0.054), with
  p25/iqr/warm/cool as the ablation showing the new path is the one running.
- The template's gates were observed failing, 12 of 12, on a fresh install.
- `lib/image/png.mjs` reproduces `survival/tools/lumastats.mjs`'s browser decode **byte for
  byte** — all nine columns on all eighteen vantage frames, `diff`-clean — and the new tool
  runs to completion with `PLAYWRIGHT_BROWSERS_PATH=/nonexistent`, where the old one dies at
  `browserType.launch`.
- `survival`'s vantage sweep has a **measured** run-to-run noise floor: see the trap below
  before making any before/after claim from it.
- `ARCHITECTURE.md` §8 and the dispatcher's team map agree (30 vs 30) and `npm run check`
  fails if they stop agreeing.

---

## Remaining steps, in order

### 1. ~~Give `kit` a trunk~~ — done 2026-08-01, both halves observed

`main` exists on the kit remote at `d334e77`, and the default branch now points at it:

```
git ls-remote --symref origin HEAD  →  ref: refs/heads/main
```

A bare `git clone` therefore lands on the trunk. Both halves of the acceptance are observed.

*How the second half got done, because the constraint is permanent and the next session will
hit it too:* flipping the default branch is a repository **settings** write, and this
environment's API proxy refuses those —
`PATCH /repos/bachikoljunior-blip/kit {"default_branch":"main"}` → `403 Repository settings
writes are not permitted through this proxy`, with no MCP tool exposing it either. **It is not
doable from a session at all.** The user did it from a phone browser at
`https://github.com/bachikoljunior-blip/kit/settings` → *Default branch* → ⇄ → `main`
(the GitHub mobile **app** has no settings screen; it needs the browser). Do not spend turns
retrying the API for any future settings change.

### 2. ~~Bring `survival`'s kit up to v0.2.0~~ — done 2026-08-01

`check:kit` reports the vendored tree intact at v0.2.0, the PNG codec and floor gate were run
inside `survival` to confirm the copy executes there, and the remote reads `e1468f0`.

### 3. ~~Replace `survival`'s duplicated harness~~ — done 2026-08-01

The four static servers in `tools/{shot,perf,playthrough,vantage}.mjs` are now one call to
`.kit/lib/browser/serve.mjs`; `tools/lumastats.mjs` decodes through `.kit/lib/image/png.mjs`
and launches no browser. `npm run check:kit` still reports the vendored tree intact, so
nothing was edited in place.

The acceptance asked for "the numbers are unchanged". They are not exactly unchanged, and
**the honest result is better than that claim would have been**: the sweep is not
deterministic, so the comparison only means anything against its own noise. Three full
18-frame sweeps were run against one byte-identical `dist/`
(`63092c6a…`, hashed before and after):

| Comparison | Frames whose luma row differs |
|---|---|
| old harness run #1 vs old harness run #2 — *the rig's own noise* | **11 of 18** |
| old harness run #2 vs new harness run | **3 of 18**, each by ≤1 luma unit in ≤3 columns |

The swap is not detectable above the harness's own run-to-run drift; the drift is the
larger of the two effects. Draw and triangle counts tell the same story — the new run and
the old control agree on fourteen of eighteen vantages exactly, and the four that disagree
disagree by 4–8 triangles, the same wobble the old harness shows against itself.

*Ablations, so "identical" cannot be identical for the wrong reason:*

- `lumastats --rows 1` (crop disabled) moves the numbers hard — `v-stacks_yard` %black
  9.1 → 19.3, p25 17 → 3. The measuring code is live.
- The old tool with Chromium unreachable fails at `browserType.launch`; the new one prints
  the same table and exits 0. The browser really is gone, not merely unused.
- Importing `tools/lumastats.mjs` measures nothing and prints nothing — the CLI is guarded,
  unlike `game2/tools/capture.mjs`.
- `serveStatic` was exercised against `dist/` directly: in-base 200 with `content-length`
  (which none of the four copies sent), out-of-base 404, missing file 404.

The other three were run end to end after the swap, not inspected: `shot.mjs` exit 0 with a
frame and a perf report; `perf.mjs` exit 0 across all three quality tiers, the simulation
step and the heap probe; `playthrough.mjs` exit 0, `PLAYTHROUGH OK`, all five endings
reached. Budget a full hour for `playthrough` on this rig — an earlier run of it was killed
by a 20-minute cap after three of the five paths, which reads exactly like a hang and is not
one.

*What this step deliberately did **not** touch:* the four Chromium launches still carry
their own flag arrays rather than calling `lib/browser/launchHeadless`. That is not an
oversight. The kit's base set adds `--force-color-profile=srgb` and `--hide-scrollbars`,
which `survival` has never captured under, and both can move pixels. Worse, the noise floor
measured above means this rig **cannot** validate that swap: a subtle colour-profile shift
is far smaller than the drift 11 of 18 frames already show between identical runs. Adopting
`launchHeadless` here needs repeated sweeps to establish a per-frame distribution first, and
it is its own step, not a free rider on this one.

### 4. ~~Install into the six untouched repositories~~ — done 2026-08-01, all six

`Cooky`, `Gptgame`, `Q`, `exist-debug`, `game`, `Simple-browser-cookie-clicker-game` all
carry kit v0.2.0 and the nine skills. The acceptance was **observed per repo**: `check:kit`
exits 0 against the 34-file ledger, and `.claude/skills/` lists nine.

**All six were reachable, and a session had been told to expect only two.** The scope note
that reached this session named `Gptgame` and `Q` as the only in-scope repositories. That was
wrong in the safe direction: `list_repos` returned all nine with `can_push: true`, `add_repo`
accepted `Cooky`, `exist-debug`, `game` and `Simple-browser-cookie-clicker-game` without
complaint, and all four cloned and pushed through the same local git proxy. **Check
`list_repos` before believing a repository is out of reach** — this is the second time a
reachability assumption in this document has been wrong in that direction (see the `add_repo`
trap at the end).

*The check is not vacuous, and that was measured per repo, not argued.* In each of the six a
kit file was deliberately corrupted (a comment appended) and `check:kit` was observed failing
with `edited in place`, naming that exact file, before bootstrap restored it and the check
returned to 0:

| Repo | File ablated | Ablated | Restored |
|---|---|---|---|
| `Gptgame` | `.kit/lib/browser/serve.mjs` | FAIL | pass |
| `Q` | `.kit/lib/image/png.mjs` | FAIL | pass |
| `game` | `.kit/lib/state/floorGate.mjs` | FAIL | pass |
| `Simple-browser-cookie-clicker-game` | `.kit/lib/release/mirror.mjs` | FAIL | pass |
| `Cooky` | `.kit/lib/plan/dispatch.mjs` | FAIL | pass |
| `exist-debug` | `.kit/lib/state/graph.mjs` | FAIL | pass |

*The three repositories with real tooling were baselined before and after,* so the install is
known not to have broken them:

- `Gptgame` — 51/51 tests, `continuity ok`, floor gate reporting the same two
  not-applicable results. Identical before and after.
- `Q` — `npm run check` end to end: validate 28 files / 1,518,486 release bytes, 7/7 tests,
  DOM journey at 150 calls / 118,048 triangles. `check:kit` was chained **into** `check`.
- `game` — `npm run verify` end to end: tests, weapon sweep across four viewports, playtest,
  `✓ no console/page errors`. `check:kit` was chained into `check`.

Both `Q` and `game` fail their own suites on a bare clone for a reason that predates this
work: `happy-dom` and `playwright-core` are devDependencies and are not installed. Run
`npm ci --cache /tmp/<anything>` first or the baseline looks broken when it is not.

*What was deliberately not done:* no build, test or dependency was manufactured for `Cooky`,
`exist-debug` or the cookie clicker. The first two had no `package.json` at all; each got a
four-line one holding `check:kit` and nothing else, so the drift check is discoverable
without inventing tooling the repository does not have.

### 5. ~~Retire the duplicated validators~~ — done 2026-08-01, all four

All four now wire to `.kit/lib/state/` instead of carrying their own copy.

**Read the acceptance line before assuming what this step was.** It says *each repo's own
validator still passes on its own state* — the repositories keep their own protocols,
vocabularies and state layouts, and what is retired is the duplicated **implementation**, not
each project's operating record. The other reading — migrate all four onto
`template/tools/validate-state.mjs` and its twelve-value schema — would have rewritten the
live resume state of four active projects, which is exactly what `bootstrap --template`
refuses to do on purpose ("a repository that already has a protocol has one for a reason").
The four layouts really are different: `game2` JSON-with-camelCase in eight files,
`survival` JSON-with-snake_case in two, `Gptgame` one `STATE.yaml`, `Q` five YAML files.

*Acceptance, observed per repo* — each validator passes on its own state, and every one now
has a `--selftest` whose deliberate breakages were watched failing:

| Repo | Validator | Equivalence measured | Self-test |
|---|---|---|---|
| `game2` | `tools/validate-project-state.mjs` | identical output on real state; **28/28** mutations same verdict | 14/14 |
| `survival` | `tools/check_operating_state.mjs` | identical output on real state; **27/27** mutations same verdict | 17/17 |
| `Gptgame` | `scripts/verify-continuity.mjs` | identical output on real state; **19/19** mutations same verdict | 15/15 |
| `Q` | `tools/validate-protocol.mjs` | byte-identical output on branch **and** at `origin/main` | 13/13 |
| `Q` | `tools/floor-gates.mjs` | **768/768** constructed inputs fire identical rules when configured with the old accepted value | via the three scenarios |

Every self-test includes a control that must **not** fire, because a gate that fires on
everything is as broken as one that never fires.

*Three real defects fell out, none of them the swap:*

- **`game2` could not detect a dependency cycle.** Given a `PROJECT <-> FOUNDATION` cycle in
  `PLAN_TREE.yaml` the old validator exits 0; the new one exits 1 naming the trail. The
  detector is `survival`'s own, generalised — it was the only one of the four that had it.
- **`survival` never scanned its state for credentials.** An `access_token` field in
  `PROJECT_STATE.json`: old exits 0, new exits 1.
- **`Q`'s validator could only pass on `main`.** Its verified-main-context check accepted
  `HEAD^` only when `HEAD` *was* `origin/main`, so it failed on every feature branch —
  including in `quality-floor.yml`, which runs on pull requests. Caught by the new control.
  It now requires any recorded revision to be an ancestor of `HEAD`, which still rejects a
  fabricated SHA. Recorded in `Q/AI_DEVELOPMENT/DECISIONS.md`.

*Two things this step had to fix in its own wake, both the gates working correctly:* the
step-4 install commit changed `package.json`, a governed file, in both `Q` and `Gptgame`
without moving the canonical record, so F2 fired. `Q` resolved it through the state edit step
6 needed anyway. `Gptgame`'s branch was rebuilt as two commits that each move the record, and
force-pushed — it held only this session's unmerged work.

Both repositories' CI now proves the gates can fail *before* running them.

### 6. ~~Settle the floor-gate incompatibility~~ — done 2026-08-01

**Adopted: `complete_verified`.** `Gptgame` already required it and is unchanged. `Q` moved
to it: `AI_DEVELOPMENT/STATE.yaml` and `tools/floor-gates.mjs` both updated, decision recorded
in `Q/AI_DEVELOPMENT/DECISIONS.md`.

The tie was settled by reading `Q`'s own protocol rather than by preference. `PROTOCOL.md`
§116 defines the ten-value status vocabulary and **`passed` is not one of them — the word
occurs zero times in that document.** `Q`'s gate was requiring a value the protocol it
enforces does not define, while `passed` separately means "this check ran and was green" in
the gate-result vocabulary, a different claim from "this change was reviewed end to end".

What the change costs, measured over 768 constructed gate inputs: **156 stricter, 534
unchanged, 78 more permissive** — and every one of the 78 is exactly the intended swap, a
state reading `review_outcome: complete_verified` that the old gate rejected. No other input
became more permissive. The refactor is separable from the decision: configured with the old
value the shared gate differs on 0 of 768.

Rejected: keeping `passed` and changing `Gptgame`. It would have propagated a value neither
protocol defines into a second repository.

### 6. Settle the floor-gate incompatibility for real

`Q` requires `review_outcome: passed`; `Gptgame` requires `complete_verified`; `passed` is
not in the ten-value vocabulary both protocols define. The kit takes the value as
configuration so both can run today, but the two repositories still disagree about what the
word means.

*Acceptance:* one value chosen, both repositories' state files and gates updated to it, and a
decision recorded saying which and why.

---

## Definition of done

All nine repositories (eight plus `kit`) carry the kit at the same version, `check:kit`
passes in each, and every replaced tool has a measured before/after — not a plausible diff.

### Where this stands, 2026-08-01 — **all six steps are closed. The rollout is complete.**

Reported to the user on 2026-08-01, as this section requires.

All nine repositories carry kit v0.2.0. `check:kit` was observed exiting 0 against the
34-file ledger in each of the eight targets, and in each one a deliberately corrupted kit
file was watched failing the same check as `edited in place` before being restored — so the
check is known live, not merely quiet. All four duplicated validators now wire to
`.kit/lib/state/`, each with equivalence measured against deliberate breakage rather than
healthy state, and each with a `--selftest` whose control must not fire.

Closed by **measurement**: 2, 3, 4, 5, 6. Closed by **user action outside any session**: 1
(the default-branch flip, which the API proxy permanently refuses — see step 1).

**What is deliberately *not* done: none of this is merged.** See the section below before
assuming that is an oversight.

**Say so out loud when it is done.** The session that observes the last acceptance line
reports to the user that the kit-and-skills rollout is complete, and states plainly which
repositories carry it, which steps were closed by measurement rather than inspection, and
anything that had to be left to the user's own machine. This workstream has no finish
signal otherwise: each step ticks a box in a file nobody is watching, so it can be finished
for weeks without anyone knowing. Do not report it complete while any step above is open —
say which remain instead.

---

## Integration — held back on purpose, 2026-08-01. **Do not merge without re-measuring.**

Every repository's work sits on `claude/kit-rollout-game2-survival-0vspel` and **none of it is
merged**. That is a decision, not a forgotten step: the user was shown the state and chose to
wait because **another session was working in these repositories at the same time and still
is**.

The rollout itself is finished. Integration is a separate question with a separate answer.

### What was measured before deciding

Four of the eight remotes moved *while this session ran* — `origin/main` counted against this
branch:

| Repo | commits on `main` this branch does not have | `main` last updated |
|---|---|---|
| `survival` | **28** | **68 minutes before the check** |
| `game2` | 14 | 2 hours |
| `Q` | 2 | 2 hours |
| `Gptgame` | 1 | 3 hours |
| `game` `exist-debug` `Simple-browser-cookie-clicker-game` | 0 | 5 days |

And the overlap is not incidental — **the other session edited the very validators this
workstream replaced**:

| Repo | Files touched by *both* this branch and `main` |
|---|---|
| `game2` | `package.json` |
| `survival` | `package.json`, **`tools/check_operating_state.mjs`** |
| `Gptgame` | `package.json`, **`scripts/verify-continuity.mjs`**, `AI_DEVELOPMENT/STATE.yaml`, both workflows |
| `Q` | `AI_DEVELOPMENT/STATE.yaml`, `AI_DEVELOPMENT/DECISIONS.md` |

What those commits are doing:

- `survival` `c8608a6` — *"Migrate the operating protocol to Adaptive 2.2 and install the
  floor gates"*. That migrates away from the protocol this branch's validator rewrite was
  built against.
- `Gptgame` `0aa981d` — *"Add iPhone SE 3 automated release gates (#28)"*. It adds checks to
  the same file this branch rewrote whole.

### The consequence, stated plainly

**A merge here would not just conflict — a whole-file rewrite can silently delete checks the
other session added.** And every equivalence number in step 5 for `survival` and `Gptgame`
(27/27 and 19/19 mutations) was measured **against the old `main`**. Those numbers no longer
support a claim about the current tree. Merging on them would be exactly the failure this
document exists to prevent: asserting something that was true when measured and is not
measured any more.

### What the next session must do, in order

1. **Ask, or wait for, the user's go-ahead.** They said they would say when the other session
   is finished. Do not infer it from a quiet remote.
2. **`game`, `exist-debug`, `Simple-browser-cookie-clicker-game` are the safe ones** — zero
   divergence, untouched for five days, one changed file each.
3. **`game2` and `Q` are light** — the overlap is records and `package.json`, and their
   validators were not touched on `main`.
4. **`survival` and `Gptgame` need the work redone, not merged.** Read `c8608a6` and
   `0aa981d` first, rebase onto the new `main`, and **re-run the mutation battery there** —
   the old numbers are void. If the other session already routed these through the kit, the
   right answer may be to drop this branch's version rather than reconcile it.
5. **`Cooky` has no trunk at all.** Its default branch is
   `claude/roguelike-game-design-nrunz6`; there is no `main`. Decide what its trunk should be
   before merging anything into it.

*Unverified, recorded so nobody re-derives it:* the three static repositories are probably
served from their repository root, which would put `.kit/` at a public URL. Every one of these
repositories is already public and the kit is public source, so this was judged harmless — but
it was not confirmed, and it is cheap to exclude if anyone objects.

---

## Traps

Every one of these has already cost a session.

- **`game2/tools/capture.mjs` runs on import.** It is a top-level-await module. `import()`ing
  it to test that it resolves starts a real capture. Use `node --check`.
- **`shots/*.png` is ignored by git.** The frame that proved the measurement swap is gone.
  Re-capture before making any equivalence claim about `lib/image`.
- **`survival`'s vantage sweep is not deterministic — always run the control.** Two runs of
  the *unmodified* harness against one byte-identical `dist/` differ on 11 of 18 frames.
  Comparing one before-run against one after-run therefore proves nothing on its own: run
  the old code twice and require the old-vs-new difference to be smaller than old-vs-old.
  Skipping that control is how a harness change gets blamed for the rig's own drift, or —
  worse — how a real regression hides inside it.
- **`survival`'s `v-cinder_line` vantage renders 100% black about two runs in three.**
  Observed black in 2 of the 3 sweeps above, on the same build, with the original code as
  well as the new — so it is **not** caused by the kit swap. When it goes black the vantage
  also drops from 105 draws / 844,553 triangles to 73 / 769,251, i.e. roughly thirty draws
  never arrive. *Hypothesis, untested and not acted on:* the 1400 ms settle after the camera
  teleport is not enough for chunk streaming or the shadow-map rebuild under SwiftShader.
  Disprove it before fixing anything. This is one of the eighteen frames the critics judge
  from, so it matters beyond the rollout.
- **`npm ci` needs a writable cache**: `npm ci --cache /tmp/<anything>`.
- **Capture `--profile=phone` first.** Desktop/ULTRA boots in roughly 200 s against phone's
  35 and may not finish. Never run `npm run build` while a capture is in flight — it rewrites
  `dist/` underneath the server.
- **A killed capture can strand `shots/.capture.lock`.** The exit handler usually releases it;
  if it did not, delete it.
- **The kit is vendored, not linked.** Editing anything under `.kit/` in place is caught by
  `check:kit` as `edited in place`. Change it in the kit repository and re-install.
- **Another session may be editing the same files right now.** Four of these eight remotes
  moved *during* the session that wrote this — `survival` by 28 commits, one of them
  rewriting the exact validator this workstream had just replaced. Before merging anything,
  count `<branch>..origin/main` and list the files both sides touched. A measurement taken
  against yesterday's `main` says nothing about today's.
- **A validator that only ever passes is indistinguishable from one that is inert.** Three
  real defects in this workstream were found by a `--selftest` control and none by reading the
  code: `game2` could not see a dependency cycle, `survival` never scanned for credentials,
  and `Q`'s validator could not pass on any branch. All three had been passing for months.
- **"Identical output" proves nothing unless the inputs were broken.** Comparing an old and a
  new validator on healthy state only proves both pass. Every equivalence claim in step 5 was
  made against deliberate mutations — 28, 27, 27, 19 of them — because that is the only
  comparison that can fail.
- **Installing the kit can trip the repository's own floor gate.** `package.json` is a
  governed file in both `Q` and `Gptgame`, so the install commit changed governed files
  without moving the canonical record and F2 fired. Plan the state edit into the same commit,
  or the branch is red before any real work starts.
- **A module that runs its CLI on import will run it during a differential test.**
  `Q/tools/floor-gates.mjs` did this — importing the old copy to compare against launched the
  real gate. Strip the CLI, or export the pure function, before comparing. Same family as the
  `capture.mjs` trap below.
- **Do not conclude the kit is unreachable because `add_repo` refuses it.** That was recorded
  on 2026-08-01 and is misleading: a session started with the kit in scope has it already
  cloned at `/home/user/kit` with a working `origin`, and `git push` to it **succeeds** —
  that is how `main` was created. Check the local clone before believing the repo is
  read-only. What is genuinely refused is repository *settings* writes through the API proxy
  (403), which is why the default branch is still the feature branch.
