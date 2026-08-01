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

Measured 2026-08-01. Every SHA below was read back from the remote, not assumed. Both game
repositories moved from `claude/past-work-skill-candidates-v6l3xm` onto
`claude/kit-rollout-game2-survival-0vspel` by fast-forward — the old branch head was a strict
ancestor with no commits of its own left behind, checked with `merge-base --is-ancestor`.

| Repo | Branch | SHA | Kit | Skills load? |
|---|---|---|---|---|
| `kit` | `main` + `claude/kit-template-creation-ndursc`, both `d334e77` | `d334e77` | source of truth, v0.2.0, 52 files, 34 tests | n/a |
| `game2` | `claude/kit-rollout-game2-survival-0vspel` | see git | `.kit/` v0.2.0 installed | **yes** — 9 + `round` |
| `survival` | `claude/kit-rollout-game2-survival-0vspel` | see git | `.kit/` v0.2.0 installed, harness on `lib/browser` + `lib/image` | **yes** — 9 |
| `Cooky` `Gptgame` `Q` `exist-debug` `game` `Simple-browser-cookie-clicker-game` | — | — | none | no |

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

### 1. Give `kit` a trunk — branch created 2026-08-01, default branch still not flipped

`main` now exists on the kit remote at `d334e77`, pushed from a session and read back with
`git ls-remote --heads`. So the first half of the acceptance is observed and a clone can now
name a trunk.

*Remaining:* `git ls-remote --symref origin HEAD` still resolves to
`refs/heads/claude/kit-template-creation-ndursc`, so a bare `git clone` still lands on the
feature branch. Flipping the default branch is a repository **settings** write, and the
session's API proxy refuses those explicitly:
`PATCH /repos/bachikoljunior-blip/kit {"default_branch":"main"}` → `403 Repository settings
writes are not permitted through this proxy`. No MCP tool in this environment exposes it
either. **This half is not doable from a session — the user flips it in the repository
settings, or with `gh repo edit bachikoljunior-blip/kit --default-branch main`.** Do not
spend turns retrying the API.

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

### 4. Install into the six untouched repositories

`Cooky`, `Gptgame`, `Q`, `exist-debug`, `game`,
`Simple-browser-cookie-clicker-game`. Three of them (`Cooky`, `exist-debug`, the cookie
clicker) have no `package.json` worth the name and no tooling — for those, installing the
skills alone is the whole value; do not manufacture a build for them.

*Acceptance:* per repo, `check:kit` passes and `.claude/skills/` lists the nine.

### 5. Retire the duplicated validators

`game2/tools/validate-project-state.mjs`, `survival/tools/check_operating_state.mjs`,
`Gptgame/scripts/verify-continuity.mjs` and `Q/tools/validate-protocol.mjs` are four
implementations of one job; the last two are roughly 70% the same file, independently
written. `lib/state` and `template/tools/validate-state.mjs` already cover it.

*Acceptance:* each repo's own validator still passes on its own state after the swap, and at
least one deliberate breakage per repo is **observed** failing.

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
- **Do not conclude the kit is unreachable because `add_repo` refuses it.** That was recorded
  on 2026-08-01 and is misleading: a session started with the kit in scope has it already
  cloned at `/home/user/kit` with a working `origin`, and `git push` to it **succeeds** —
  that is how `main` was created. Check the local clone before believing the repo is
  read-only. What is genuinely refused is repository *settings* writes through the API proxy
  (403), which is why the default branch is still the feature branch.
