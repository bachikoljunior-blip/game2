# Kit rollout — the single record for this workstream

> ## 🔑 この作業は「名指しされたときだけ」動く — 2026-08-02、利用者の指示
>
> **止まっているのではなく、鍵がかかっている。** 誤って再開するのも、頼まれたのに
> 動かないのも、どちらも誤作動。判定は入口の一点だけ:
>
> | 言われたこと | どうするか |
> |---|---|
> | 「続けて」「再開」だけ、あるいは別の作業の話 | **この作業を再開しない。** 何をやるか利用者に聞く |
> | **この作業を名指し**（例:「kit ロールアウトを続けて」「KIT_ROLLOUT を再開」） | **通常どおり全力で進める。追加の確認は不要。** |
>
> 名指しされた場合、`CLAUDE.md` の常時許可（検証済みなら確認なしで push・`main` 統合・
> Pages 公開）は**そのまま有効**。鍵は入口だけで、中では足枷にならない。名指しされた
> のに「停止中と書いてあるので確認します」と止まるのは、この行の誤読であり誤作動。
>
> 名指しされていないときに、`CLAUDE.md` の「記録を読んで最高価値のタスクを続けろ、
> 何をやるか聞くな」条項を根拠に再開しないこと。この行のほうが新しく、**入口の判断
> だけ**を上書きする。
>
> 再開時の最初の一手は下の Traps どおり **`ls-remote` で全 SHA を読み直す**こと。
> この記録は過去3回古くなっている。
>
> 中断による破損なし: 実行中プロセスなし、全リポジトリ clean、計測の生データは
> `survival/AI_DEVELOPMENT/EVIDENCE/VANTAGE-LAUNCH-SWAP-SAMPLES.jsonl` に保全済み
> （`shots/` は git 管理外のため）。
>
> スキル検証は **2026-08-02 に完了**した（9スキルすべて実行、欠陥3件を修正、kit 0.2.1）。
> 詳細は下の「Skill validation」。残るのは統合判断のみ。


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
| `Simple-browser-cookie-clicker-game` | `391c2d2` | v0.2.0, `check:kit` only — no build manufactured | 9 |
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

## Integration — **complete, 2026-08-02.** Seven of eight on `main`; one excluded by the user.

Every SHA below was read back with `git ls-remote` after the fact, not assumed.

| Repo | `main` | how |
|---|---|---|
| `game` | `6247fd2` | fast-forward |
| `exist-debug` | `418f8bf` | fast-forward |
| `game2` | `a7f9987` | merge |
| `Cooky` | `b431196` | fast-forward, **both `main` and the default branch**, still identical |
| `Q` | `2a9ff40` | merge |
| `Gptgame` | `8c952d8` | rebuilt + follow-up fix |
| `survival` | `325b1e1` | rebuilt, via **PR #10 and #11** — `main` is ruleset-protected |
| `Simple-browser-cookie-clicker-game` | `640cdaa` | **excluded by the user. Untouched. Do not merge.** |

The cookie clicker's work still sits on `claude/kit-rollout-game2-survival-0vspel`, verified but
deliberately unintegrated — at **`391c2d2`**, not the `4375dde` this file carried until
2026-08-02. `4375dde` is **not a valid object in that repository at all**; the branch was
rebuilt onto the newer `main` at 04:43 UTC, two minutes after the 04:41 integration table above
was measured, and the SHA was never re-read. Measured this session with `ls-remote`: head
`391c2d2`, **1 ahead of `main` (`640cdaa`) and 0 behind**, one commit, *"Install the shared kit
v0.2.0 and its nine skills"*. `check:kit` exits 0 on it against the 34-file ledger and
`.claude/skills/` lists nine, so the work itself is intact — only the pointer was wrong.

## Skill validation — done 2026-08-02. Nine skills executed; three defects found and fixed.

**They had been counted, never run.** `kit/test/run.mjs` covered `lib/` with 34 tests and
nothing covered `.claude/skills/`, so every instruction in the nine documents was an
unverified claim. By this project's own standard that is `prepared_not_executed`.

`kit/test/skills.mjs` now tests the documents themselves — 30 tests, and `npm test` in the
kit runs both suites: **64 tests, 64 pass** (`AI_DEVELOPMENT/EVIDENCE/skill-validation-tests.tap`).
Claims are extracted *mechanically from the SKILL.md text*, so the test cannot drift from the
document it checks: every `import` must resolve from an installed repository and export every
symbol it names, and every `node …` command must resolve somewhere real.

**Three defects, every one found by executing an instruction rather than reading it.** This is
now the fourth, fifth and sixth defect on this workstream found by running a control, against
zero found by code reading.

| # | Skill | Defect, as measured |
|---|---|---|
| 1 | `bootstrap` | Its four commands resolve in **none of the eight** installed repositories — they are kit-repository paths and the skill never said so. Following it in `game2` gives `Cannot find module`, which reads as a broken kit. The vendored `.kit/README.md` had the correct path all along; only the skill was wrong. |
| 2 | `probe`, `ja-ui-check` | Both tell you to combine `serveStatic` with `launchHeadless` and **neither mentions `proxy: false`**. Measured: HTTP **405 with zero page errors**, so a run proceeds and times out on ready — it reads as a failed boot, not a proxy fault. `proxy: false` → 200. |
| 3 | `probe` (and `lib`) | `readyExpr` takes an expression; Playwright evaluates the string, so `'() => window.READY === true'` is a truthy **function object** and the wait resolves on the first poll — **21 ms to `booted: true`** against a page where `window.READY` is `undefined`. |

Defect 2 is the instructive one: **the mechanism was already measured and recorded in this
file during the vantage work, and the skills were never updated.** A trap written down in one
section and left live in another is how it gets rediscovered.

Defect 3 is fixed in the library, not just the document: `waitForBoot` and `verifyLive` now
throw on a function source. In `verifyLive` that form would have signed off a publication —
the boot half of the two orthogonal publish checks, passing on a page that never ran.

*What "executed" means per skill, since the nine are not the same kind of thing:*

| Skill | How it was executed | Negative control that had to fire |
|---|---|---|
| `critic` | `validateFindings` against the **documented** contract, extracted from the skill's own prose | each documented field deleted in turn; bad severity/verdict/score/resolution; unknown owner |
| `dispatch` | `buildPlan`/`formatPlan` on the real 14-team map | two teams claiming one file → throws; unrouted finding surfaced; 12 of 14 teams gated out and named in the output |
| `resume` | all six `graph.mjs` checks | duplicate id, dangling ref, cycle (with trail), two active, zero active, missing evidence, and each `antiFabrication` branch |
| `publish` | stamp → mirror → `verifyServed` | **one changed byte rejected**; zero or two meta tags refused; obsolete bundle on the mirror caught |
| `bootstrap` | install, `--check`, second install, `--skills`, `--template` | in-place edit → `stale`; unshipped file → `orphaned`; template must not overwrite an edited file |
| `probe` | real Chromium: four diagnostic channels, `waitForBoot`, screenshot → `measureLuma`/`regionStats`/`compareRegion` | 404 asset, console error and page error each caught; clean page reports nothing; byte-identical frames labelled as a failed edit |
| `ja-ui-check` | shares `probe`'s browser path; the `proxy: false` defect was filed against both | as above |
| `balance-audit` | **applied for real** — 5 policies × 60 simulated hours against the cookie clicker's 16-tier ladder | 5 of 5 injected defects detected: collapsed ladder, reversed tier, dead upgrade, NaN parameter, saturation to `Infinity` |
| `findings-run` | the only one with no executable surface | see below |

**`findings-run` is honestly unverified as a mechanism.** It is a commit-discipline process —
one finding, one commit, the message naming the number that moved — and it has no API and no
command to run. It was *followed* for the three defects above rather than tested. Do not read
the row above as an executed gate; it is the one skill still resting on inspection.

*What `balance-audit` actually found, and its scope:* six of sixteen upgrades — `blackHoleMixer`,
`universeOven`, `godFinger`, `cookieSingularity`, `quantumBakery`, `antimatterOven` — are
bought by **no policy** in 60 simulated hours, and the longest gap between unlocks is
~146,360 s (≈40.7 h). **Scope, stated because the simulation cannot see it:** this models the
base `UPGRADES` ladder only — no prestige multipliers, no `RESEARCH`, no golden-cookie boosts,
no endless tier. Those accelerate progression, so this is a claim about base play, not about
the shipped game. Nothing in that repository was modified. Raw data:
`AI_DEVELOPMENT/EVIDENCE/skill-validation-balance-audit.{json,mjs}`.

**Two apparatus failures in my own validation, caught before they reached a conclusion** —
recorded because both are the shapes this file already warns about:

- The first `balance-audit` simulator bought *everything affordable* every tick, so four of
  the five policies returned **byte-identical** traces and the per-policy report was one row
  printed five times. Fixed to one decision per tick, with the policy allowed to decline.
- Having fixed it, three policies *still* agreed, and I nearly filed "the policy is not
  reaching the simulation". **Disproved by replay:** the affordable set has more than one
  member on 87 of 382 purchases and the three choose differently on 69 of them (18.1%). Play
  is cost-limited, so a different purchase order converges to the same multiset by 60 h — the
  endpoints agree while the paths do not. The apparatus check now keys on `firstBought`, the
  trajectory, which separates all five. A mechanism guess was wrong again; the symptom was real.

Two of my own test cases were also vacuous before they were fixed: an `ARCHITECTURE.md`
mutation keyed to `src/core/Engine.js` matched nothing (that file is an indented tree entry,
not a path) and reported a confident pass for a check it never ran, and a "contract fields"
extractor read one line of a sentence that wraps and silently truncated the contract to five
of six fields. Both now assert the mutation changed the text first.

### Reconciliation with the parallel session — measured 2026-08-02, and I was first

A second session is working on the same branch with a different remit (`survival/tools/validate.mjs`,
`survival/AI_DEVELOPMENT/PROTOCOL.md`, `survival/docs/STATE.md`, `game2/CLAUDE.md`,
`game2/ROUND.md`, and a new evidence location in `survival`). **None of it was on the branch
when this was written** — `git rev-list --count HEAD..FETCH_HEAD` was **0 in all eight
repositories**, and the newest ref on any remote was my own push. Checked, not assumed. The
four reconciliation points are therefore recorded as work, not performed: see
`KIT-SKILL-RECONCILE` in `AI_DEVELOPMENT/ACTIVE_FRONTIER.yaml`.

One of the four was in my own scope and is done. **`tools/CRITIC.md` and the shared `critic`
skill were saying the same thing differently, and the difference was live:** CRITIC.md's JSON
template omitted `round`, `profile`, `tier` and `nativeResolution`, so a critic following the
brief exactly produced a file that `validateFindings(review, { strict: true })` **rejects** —
measured against the template as committed at `17ce484`. CRITIC.md now defers to the skill and
the validator for the schema and keeps only the KAGEROU-specific bar, and a kit test parses
CRITIC.md's own template and validates it, so the two cannot drift apart silently again.

**Do not force-push this branch.** A rejected push here means the other session pushed first,
not that the network failed; `--force`/`--force-with-lease` is the only operation that would
destroy their work irrecoverably. Fetch, merge, re-run both suites, stage the exact paths, push.

## What is still open — the only list of it

Integration is complete and every numbered step above is ticked, so a session reading
top-down finds nothing to do and stops. That is wrong: four things outlive the rollout, and
until 2026-08-02 they existed only in a chat message. They live here now.

| # | Open item | State, measured |
|---|---|---|
| A | `Simple-browser-cookie-clicker-game` stays unintegrated | **Not work. A standing instruction.** Excluded by the user; do not merge without a new explicit go-ahead. Verified at `391c2d2`. |
| B | `survival`'s four Chromium launches still carry their own flag arrays | **`vantage.mjs` done and measured.** The other three are open — see below. |
| C | Per-frame distribution for the vantage sweep | **Closed by measurement, 44 sweeps.** The answer is that this rig cannot tell the configurations apart. |
| D | `kit`'s default branch | **Closed — measured, not assumed.** See below. |
| E | The nine skills had never been executed | **Closed 2026-08-02.** 30 tests, three defects fixed, kit 0.2.1. `findings-run` remains process-only — see the Skill validation section. |
| F | Skill-validation work is **not merged** | Eight branches at `claude/kit-rollout-skill-validation-rsenmi`, pushed and read back. `survival` needs a PR (ruleset). Nothing was merged and no PR was opened — awaiting instruction. |
| G | `Simple-browser-cookie-clicker-game` carries kit **0.2.0**, not 0.2.1 | Deliberate. Item A excludes it, so it was not re-installed into and holds the older skills, including all three defects. Fix it in the same go-ahead that integrates it. |

**D is done, and the brief that reached this session said it was not.** `git ls-remote --symref
origin HEAD` in `kit` returns `ref: refs/heads/main` at `d334e77`. The user flipped it from a
browser (step 1 records how, and why no session can do it). Do not spend a turn retrying the
API proxy for it, and do not carry it forward as open again.

### B and C, stated so the next session does not do them in the wrong order

The four launches in `tools/{shot,perf,playthrough,vantage}.mjs` do not call
`.kit/lib/browser/launchHeadless`. Step 3 left them deliberately. The exact delta, read off
both sides rather than assumed — swapping in `launchHeadless({ noSandbox: true,
angleSwiftshader: true })` **removes nothing** and **adds five flags**:

`--enable-webgl` (already present in `shot.mjs` only), `--disable-dev-shm-usage`,
`--hide-scrollbars`, `--mute-audio`, `--force-color-profile=srgb`.

Two of those five can move pixels — `--hide-scrollbars` changes the layout the frame is taken
of, and `--force-color-profile=srgb` changes how it is encoded. `survival` has never captured
under either.

**And this rig cannot currently judge whether they did.** The measured noise floor is 11 of 18
frames differing between two runs of the *unmodified* harness against one byte-identical
`dist/`. A colour-profile shift is smaller than that. So the order is fixed: **C before B.**

C is not "run the sweep a few more times". The 11-of-18 figure is a *frame-level* verdict, and
a frame is eleven numbers — nine luma columns plus draws and triangles. If one column wobbles
and the other ten repeat exactly, ten cells still carry signal. What is needed is the
distribution **per cell**, which then says exactly which cells a later before/after is allowed
to be judged on. `survival/tools/vantage_distribution.mjs` does this; it hashes `dist/` around
every sweep and voids any sample the build moved under, and it refuses to report across two
build hashes.

### B and C, settled 2026-08-02 — the swap is undetectable, and the finding against it was mine

`tools/vantage.mjs` now calls `launchHeadless`. Five arms of four sweeps against one
byte-identical `dist/`, plus the eight-sweep baseline — **28 sweeps, 504 frames**. The raw
samples are preserved at `survival/AI_DEVELOPMENT/EVIDENCE/VANTAGE-LAUNCH-SWAP-SAMPLES.jsonl`,
because `shots/` is gitignored and would not have survived the container. Net luma
shift against the baseline, with the sign-test asymmetry beside it:

| arm | what it changes | net shift | asymmetry |
|---|---|---|---|
| **`legacynow`** | **nothing at all — the control** | **−17.4** | **10** |
| `kitfull` | flags + binary | −14.4 | 20 |
| `kitfull2` | the same, replicated | −20.6 | 9 |
| `binary` | binary only | −7.1 | 4 |
| `flags` | flags only | −16.1 | 6 |

**The control darkened more than the swap did.** `binary` and `flags` sit inside it on both
measures. The two `kitfull` arms exceed it on *different* measures and each falls inside it on
the other — noise, since a real effect exceeds the same measure both times.

*Correction:* the commit that first landed this section, and `survival`'s `ab65a46`, say "six
arms … 44 sweeps, 792 frames". That count was wrong; it is five arms, 28 sweeps, 504 frames,
counted back out of the sample file. Every per-arm number above is unaffected — only the
total was miscounted. This is not a claim
that the frames are identical; it is the measured answer to the question the record asked.

**Three things this settles, so nobody re-derives them:**

- **The binary hypothesis is disproved.** This file recorded the `headless_shell` → full
  `chrome` swap as the likely pixel-mover with the flags as the smaller suspect. The
  binary-only arm is the **quietest of all five**.
- **`proxy: false` is mandatory, and this one is a real blocker.** `launchHeadless` honours
  `HTTPS_PROXY` by default; Playwright then force-appends `<-loopback>` to
  `--proxy-bypass-list`, which *un*-bypasses loopback. Measured: the default returns **HTTP 405
  with zero page errors** against the harness's own server, so a run proceeds and times out on
  `CINDERLINE.ready` — reading as a game boot failure, not a proxy fault. `proxy: false` returns
  200. **Every harness in every one of these repositories that serves its own content on
  127.0.0.1 will break the same way.** The kit's default is wrong for that whole class of
  caller; its own comment says the option exists for reaching *public* URLs.
- **The rig drifts between collection batches by as much as any change moves it.** Within the
  baseline alone, runs 1–4 against 5–8 differ by +16.9 with asymmetry 12. Any before/after taken
  as two separate batches carries that difference regardless of what changed.

**The instructive part is that this file nearly gained a false finding, and it would have been
mine.** The first `kitfull` arm was reported as a measured directional shift — 31 luma cells
down against 11 up, "exceeding every one of the 70 baseline splits". The arithmetic was right;
the null was invalid. **68 of those 70 splits interleave the two baseline collection batches**,
cancelling batch drift by construction, while every candidate arm *is* a separate later batch.
A null built by splitting one baseline structurally cannot contain the effect being tested for.

The fix is not a cleverer computed null. It is a **control arm** — the unchanged configuration
collected as a separate later batch — and it outranks any null derived from the baseline.
`tools/vantage_distribution.mjs --control` gates the verdict on it now.

*What is still open in B:* `shot.mjs`, `perf.mjs` and `playthrough.mjs` still carry their own
flag arrays. They are functional harnesses rather than pixel ones, so they do not need this
apparatus — but any of them adopting `launchHeadless` **must** pass `proxy: false`.

### The bug this session nearly shipped, recorded because it is the most instructive thing here

Both re-measured batteries were, at various points, **reporting agreement on checks they never
ran.** Four separate instances, none of which announced itself:

1. `survival`'s "session status disagrees" mutation replaced `project.status`, not
   `logical_session.status`. Printed `ok`.
2. `Gptgame`'s "logical session no longer active" hit an earlier key's `active: true`. Printed
   `ok`.
3. After #10 merged, both batteries' base tracked `origin/main` — which had *become* the new
   validator. The next run would have compared each file against itself and printed a perfect
   score. `survival`'s also read the old copy from a hardcoded `/tmp` path that does not
   survive a session.
4. The worst one: `Gptgame`'s `logical_session` assertion used
   `/logical_session:[\s\S]*?active: true/`, which matches that literal **anywhere later in
   the file** — so the `STATE.yaml` note written to *document* this class of bug contained the
   string that satisfied the check. **The gate was passing on the text of its own bug report,
   with the session marked inactive.**

All four are fixed: mutations anchored to the block they claim to break, bases pinned to the
pre-integration revisions (`02339ce`, `0aa981d`) and read out of git, and both batteries now
refuse to run when the base resolves to the working tree's own source. `Gptgame`'s battery
additionally fails any mutation that changes no text, and reports declared strictness gains
separately from agreement — **and only excuses a divergence that runs in the strict direction.
A new gate passing where the old one fired is a lost check, and no annotation may excuse it.**

`Gptgame` is 32/33 with 1 declared strictness gain and 0 unexplained divergences, not 33/33.
That number went *down* because the measurement got honest, which is the only direction that
matters.

---

## How it got there — the working record for this integration

The rollout itself is finished. Integration is a separate question with a separate answer,
and this section is where that answer is being worked out. The hold below is kept verbatim
because it records *why* the numbers had to be retaken.

### Integration state — measured 2026-08-02 04:41 UTC

| Repo | behind `main` | overlap | merge target | state |
|---|---|---|---|---|
| `game` | 0 | none | `main` | **merged `6247fd2`, pushed, read back** |
| `exist-debug` | 0 | none | `main` | **merged `418f8bf`, pushed, read back** |
| `game2` | 14 | `package.json` | `main` | **merged `b2a201d`, pushed, read back** |
| `Cooky` | 0 | none | `main` **and** default | **merged `b431196`, both refs pushed, read back** |
| `Q` | 2 | `AI_DEVELOPMENT/STATE.yaml`, `DECISIONS.md` | `main` | **merged `2a9ff40`, pushed, read back; Pages verified green** |
| `Gptgame` | 1 | 5 files incl. `scripts/verify-continuity.mjs` | `main` | **rebuilt `1cf5ef7`, pushed, read back; quality gates green** |
| `survival` | 28 | `package.json`, `tools/check_operating_state.mjs` | `main` | rebuilt `1156dfb`; **`main` is ruleset-protected — open at PR #10** |
| `Simple-browser-cookie-clicker-game` | 0 | none | — | **excluded by the user, 2026-08-02. Do not merge.** |

### `survival`'s `main` cannot be pushed to. This is new and permanent.

`git push origin main` is refused: `GH013`, *"Changes must be made through a pull request"*
and *"3 of 3 required status checks are expected"*. The other session installed that ruleset;
the record's earlier note that "`main` has no branch protection — every branch reports
protected=false" is now **out of date for `survival` and only for `survival`**. `Q` and
`Gptgame` still report `protected: false` and took a direct push.

So integration there runs through **pull request #10** (`claude/kit-rollout-integration-a4zihp`
→ `main`), created on the user's explicit go-ahead. Its three required checks are F2, F3 and
F5 — the repository's own floor gates.

**PR #10 is green: F2, F3 and F5 all `success`, `mergeable_state: clean`.** It is *not*
merged — the user was asked for the PR only, and merging is a separate confirmation.

F5 failed on the first attempt and that was correct, not a hiccup: the PR body carried no
`Floor-Review:` trailer, so the gate refused a delivery with no recorded review level. The
trailer is `Floor-Review: C / pass`, which is same-agent falsification — the level
`AI_DEVELOPMENT/STATE.yaml` already records for this run, and the only level available since
no separate reviewing agent was used. Worth keeping: **F5 reads the pull-request body, not the
commits**, so it cannot be satisfied from a local run.

### What the two public sites actually did

The user's concern was that merging `Q` and `Gptgame` would regenerate their public surfaces.
Measured after the fact:

- **`Q` redeployed and verified.** *Verify Pages publication* completed **success** on the
  merge commit `2a9ff40`.
- **`Gptgame` did not deploy at all**, and that is not a regression. Its `deploy` job is gated
  behind `ios-safari`, which fails at *"Exercise Mobile Safari through Appium"* — **and fails
  identically on `0aa981d`, the commit before this work.** Both runs have the exact same
  shape: `test` success, `ios-safari` failure at the same step, `deploy` skipped. The gate is
  doing its job; nothing was published, so nothing about the public surface changed. That
  matches the repository's own record, which already carries
  `ios_mobile_safari: prepared_not_executed`.
- `Gptgame`'s *Project quality gates* passed on the merge commit, including the two steps this
  work added to the workflow: `verify-continuity --selftest` and `check:kit`.

`Cooky`'s trunk was settled by the user: push **both** `main` and the default branch
`claude/roguelike-game-design-nrunz6`. They were the same SHA, so no divergence was created,
and whichever ref the repository opens on carries the kit. That avoids needing the default
branch flipped, which the API proxy refuses (step 1).

The three rebuilt/merged branches all sit on `claude/kit-rollout-integration-a4zihp`, cut
from each repository's current `main`.

### What the rebuilds actually found — the merge would have been wrong in both

Neither `survival` nor `Gptgame` was a case of "merge would have conflicted". In both, the
merge would have produced a **worse** tree than either side:

- **`Gptgame` would have been broken outright, not merely risky.** `0aa981d` changed the
  objective id to `iphone-se3-automation-2026-08-01` and loosened the assertion that had
  pinned it. The kit branch's rewritten `verify-continuity.mjs` still hardcoded the old id,
  so the merged gate would have failed on `main`'s own state. main's loosening is adopted.
- **`survival` would have silently lost eleven checks.** `c8608a6` added an 84-line
  protocol-2.2 `STATE.yaml` block to `check_operating_state.mjs` while the kit branch was
  rewriting the same file whole. Every one of those checks is carried over and now has a
  self-test, which they did not have before.

**Disproved, so nobody re-derives it:** routing `survival`'s `STATE.yaml` block through
`.kit/lib/state/yaml.mjs` does not work. That parser is strict and rejects folded block
scalars (`>`); `STATE.yaml` uses them and it throws at line 22 of the real file. Swapping it
in would have replaced eleven working checks with a crash. `main`'s hand-rolled indentation
walker is kept verbatim, with only its I/O made injectable so the self-test can drive it.

*Two vacuous assertions fell out of `Gptgame`, neither caused by the swap.* Both used
`/key:[\s\S]*?field/`, which matches the field **anywhere later in the file**: deleting the
objective id entirely still satisfied its check, and the logical-session `active: true` check
could be satisfied by a different key's value. Both are now anchored to their own block,
keeping main's intent that the id is not pinned to a value. Same shape as the two mislabelled
mutations caught inside the batteries themselves — see the trap at the end.

### Re-measured equivalence — the old numbers are void and are not reused

Every number below was taken against each repository's **current** `main`, with both
validators run as **subprocesses**: neither old copy has a CLI guard, so importing one to
compare would run the real gate instead of the fabricated one.

| Repo | battery | agreement | breakages that fired | self-test |
|---|---|---|---|---|
| `survival` | `tools/equivalence_operating_state.mjs` | **46/46** | 43 of 45 (2 are deliberate valid-input controls) | **23/23** incl. control |
| `Gptgame` | `scripts/equivalence-continuity.mjs` | **33/33** | 31 of 32 (1 is the objective-id change main made legal) | **15/15** incl. control |

The superseded figures — `survival` 27/27, `Gptgame` 19/19 — were measured against the old
`main` and say nothing about these trees. They are not quoted anywhere as current.

`Q` needed no rebuild: `main` moved to r3 but never touched its validators. Its one real
conflict was the step-6 vocabulary decision meeting main's newer review record; main's r3
record is kept whole with `review_outcome` moved `passed` → `complete_verified`, which is the
decision already recorded in `Q/AI_DEVELOPMENT/DECISIONS.md`.

*Verified per repo on the merged/rebuilt tree, not inherited from the pre-merge branch:*

| Repo | evidence |
|---|---|
| `survival` | `check:kit` 34 files intact; validator PASS on main's state; F2 fired on the tooling commits then passed once `STATE.yaml` moved; F3 6/6 steps; `tools/perf.mjs` end to end; `validate`, `check_benchmarks` clean |
| `Gptgame` | `check:kit` intact; `npm test` **51/51**; `verify-floor` F2+F5 pass after the governed digest was recomputed; `pages.yml` auto-merge kept all 16 of main's SE3 references |
| `Q` | `check:kit` intact **and observed failing** on a corrupted kit file; `validate-protocol` 13/13; floor gates pass on 44 changed files while **all three** deliberate-failure scenarios (F2, F2_ASSET, F5) still fire; `npm run check` exit 0 end to end |

**The other session has stopped, and that is measured rather than assumed.** Every
`<branch>..origin/main` count above is *identical* to the 2026-08-01 reading — 14 / 28 / 1 /
2 and four zeroes — and the most recent push to any of the eight remotes was 5.5 hours before
the check. Nothing moved between the two measurements.

**Two things the 2026-08-01 record got wrong, both corrected by measurement:**

- **`Cooky` does have a `main`.** It is `15ce6ec`, the same SHA as the default branch
  `claude/roguelike-game-design-nrunz6`. The trunk question is therefore not "create one" but
  "which of the two identical refs is the trunk" — and the default branch still points at the
  feature branch, which only the user can change (step 1's proxy limit).
- **No `main` anywhere carries the kit.** `.kit/` file count on `origin/main` is 0 in all
  eight. The escape hatch in point 4 below — *"if the other session already routed these
  through the kit, drop this branch's version"* — **does not apply**. This branch's install is
  the only one that exists, so `survival` and `Gptgame` must be rebuilt, not dropped.

*Verified on each merged tree, not inherited from the pre-merge branch:*

| Repo | `check:kit` | ablation | own gates |
|---|---|---|---|
| `game` | 34 files intact, exit 0 | `.kit/lib/state/graph.mjs` corrupted → `edited in place`, exit 1 | — |
| `exist-debug` | 34 files intact, exit 0 | same file, same failure, restored to 0 | — |
| `game2` | 34 files intact, exit 0 | — | `check:ownership` 30 vs 30; `validate:project` PASS on the **new** main's state (52 criteria, 31 plan nodes); `--selftest` **14/14** incl. the control |

`game2`'s validator passing matters more than the other two lines: the other session rewrote
45 files on that `main`, including the `AI_DEVELOPMENT` records the rewired validator reads.
It passes against their state, and the self-test still fires on all thirteen deliberate
mutations, so it is not passing by being inert.

`game` and `exist-debug` were fast-forwards — `origin/main` was a strict ancestor of the
branch, so no merge commit and no resolution was involved.

---

### The hold, as recorded 2026-08-01 — kept because it explains the re-measurement

Every repository's work sat on `claude/kit-rollout-game2-survival-0vspel` and none of it was
merged. That was a decision, not a forgotten step: the user was shown the state and chose to
wait because **another session was working in these repositories at the same time**.

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

### The order this integration is following

1. ~~**Ask, or wait for, the user's go-ahead.**~~ Given 2026-08-02, and backed by the
   measurement above rather than by a quiet remote.
2. ~~**`game`, `exist-debug` are the safe ones**~~ — done. `Simple-browser-cookie-clicker-game`
   was in this tier and is **now excluded by the user**; it stays on the branch.
3. ~~**`game2` is light**~~ — done. **`Q` is light** and still open, held to last with
   `Gptgame` because merging republishes its public site.
4. **`survival` and `Gptgame` need the work redone, not merged.** Read `c8608a6` and
   `0aa981d` first, rebase onto the new `main`, and **re-run the mutation battery there** —
   the old numbers are void. ~~If the other session already routed these through the kit, the
   right answer may be to drop this branch's version~~ — **measured false on 2026-08-02: no
   `main` carries `.kit/`. Rebuild is the only option.**
5. **`Cooky`'s trunk is a real question, but not the one recorded.** `main` exists at
   `15ce6ec`, byte-identical to the default branch `claude/roguelike-game-design-nrunz6`.
   Merging into `main` alone would leave the branch the repository actually opens on without
   the kit. Decide with the user before pushing anything.

*Unverified, recorded so nobody re-derives it:* the three static repositories are probably
served from their repository root, which would put `.kit/` at a public URL. Every one of these
repositories is already public and the kit is public source, so this was judged harmless — but
it was not confirmed, and it is cheap to exclude if anyone objects.

---

## Traps

Every one of these has already cost a session.

- **A SHA in this file can stop existing.** `Simple-browser-cookie-clicker-game` was recorded
  at `4375dde`; that object is not in the repository — the branch was rebuilt two minutes
  after the table was written and the pointer was never re-read. This is the third time a
  fact here has gone stale under a session that trusted it (the other two: `Cooky` having no
  `main`, and `survival` having no branch protection). **Re-read every SHA you are about to
  act on with `git ls-remote`, and every default branch with `--symref`, before acting.** A
  SHA that fails `git cat-file -e` is the cheap version of this lesson; a SHA that still
  resolves but has moved is the expensive one.

  **It went stale twice more on 2026-08-02**, which is the fourth and fifth time, so treat
  this as certain rather than likely. The brief handed to the skill-validation session named
  `game2` `main` at `15d4fd3` and `survival`'s continuation branch at `7d3d449`; `ls-remote`
  read `22ef064` and `7574ffa`. Both old SHAs still resolve — they are real ancestors, two
  commits back in each case — so `git cat-file -e` passes and nothing looks wrong. The two
  missing commits were the ones that *parked* each repository, which is exactly the state a
  resuming session most needs. Re-read with `ls-remote` before acting, every time; a SHA in
  this file is a claim about the past.
- **A before/after split across two collection batches measures elapsed time.** The
  `survival` vantage rig drifts between batches by about as much as a real change moves it
  (+16.9, asymmetry 12, within the baseline alone). Worse, the obvious defence — building a
  null by splitting the baseline every possible way — *cannot* catch it: 68 of the 70 4/4
  splits interleave the batches and cancel exactly the effect. **Run a control arm**: the
  unchanged configuration, collected as its own later batch. On 2026-08-02 the control
  darkened more than the change under test, which is the only reason a false finding did not
  reach this file.
- **`game2/tools/capture.mjs` runs on import.** It is a top-level-await module. `import()`ing
  it to test that it resolves starts a real capture. Use `node --check`.
- **A skill's commands are written for the kit's working directory, not yours.** `bootstrap`
  said `node tools/bootstrap.mjs`, which resolves in the kit clone and in **none** of the
  eight installed repositories. From inside an installed repo the vendored copy checks itself
  with `node .kit/tools/bootstrap.mjs --target=. --check` — and that answers a *different*
  question: it verifies the copy against its own ledger and **cannot** tell you the version is
  stale, because it has no kit to compare against.
- **`readyExpr` is an expression; a function source silently defeats it.** Playwright
  evaluates the string, so `'() => window.READY === true'` is a truthy function object and
  `waitForBoot` returns `booted: true` on the first poll — 21 ms against a page that never
  readied. Write `'window.READY === true'`. Both `waitForBoot` and `verifyLive` now throw on a
  function source, but any harness pinned to kit ≤ 0.2.0 still accepts it.
- **A headless run serving its own content on `127.0.0.1` needs `proxy: false`.** This is in
  the vantage section too, and it stayed live in the `probe` and `ja-ui-check` skills for a
  whole workstream because the skills were never executed. HTTP 405, **zero page errors**,
  reads as a failed boot.
- **A served page that outlives its test keeps the test runner alive.** `serveStatic`'s
  listener is a live handle: `test/skills.mjs` passed every case and then hung at exit until
  the server was `unref()`d. It looks exactly like a hung test.
- **A favicon 404 lands on the console channel, not the HTTP one.** Chromium requests
  `/favicon.ico` unprompted; the 404 surfaces as a console error while `badResponses` stays
  at 0. A "clean page" control without an icon fails on noise the page never asked for.
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
- **An equivalence battery whose base tracks `origin/main` goes vacuous the moment it merges.**
  Both did. After the integration landed, `origin/main` *is* the new implementation, so the
  battery compares a file against itself and prints a perfect score. Pin the base to the
  pre-integration revision, read it out of git rather than off the filesystem, and make the
  battery refuse to run when the base resolves to the working tree's own source.
- **Prose describing a bug can satisfy the buggy check.** `Gptgame`'s `logical_session`
  assertion matched `active: true` anywhere after the key, and the `STATE.yaml` note written
  to document that very defect contained the literal. The gate passed on its own bug report.
  Anchor assertions, and never assume a state file's free-text fields are inert input.
- **A mutation that changes nothing reports agreement on a check it never ran.** Both
  re-measured batteries had one. `survival`'s "session status disagrees" replaced the first
  `status: active` in `STATE.yaml`, which belongs to `project`, not `logical_session`;
  `Gptgame`'s "logical session no longer active" hit an earlier key's `active: true` the same
  way. Both printed a confident `ok` for a check they never exercised. Anchor a mutation to
  the block it claims to break, and assert the text actually changed — `Gptgame`'s battery
  now throws if a transform is a no-op.
- **A loosened assertion can loosen to nothing.** `/objective:[\s\S]*?id: "[^"]+"/` reads as
  "the objective has an id"; `[\s\S]*?` runs past the objective block, so it matches any
  quoted id later in the file and deleting the objective id outright still satisfies it. Two
  of these were live in `Gptgame`. Anchor to the block's own first key.
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
- **`survival`'s `main` refuses direct pushes; the other seven do not.** `GH013` — pull
  request required, 3 required status checks. Do not read the older "no branch protection
  anywhere" note as still true; it was measured before the ruleset existed, and it was only
  ever true of `survival` at that moment. Check per repository, not once.
- **Do not conclude the kit is unreachable because `add_repo` refuses it.** That was recorded
  on 2026-08-01 and is misleading: a session started with the kit in scope has it already
  cloned at `/home/user/kit` with a working `origin`, and `git push` to it **succeeds** —
  that is how `main` was created. Check the local clone before believing the repo is
  read-only. What is genuinely refused is repository *settings* writes through the API proxy
  (403), which is why the default branch is still the feature branch.
