# The iPhone SE 3 round

Two tiers of automated phone testing, plus the comparison step that turns them into a round.

## Where each tier stands in this repository

| Tier | What it proves | Where it lives here | Status |
|---|---|---|---|
| 1 — Playwright WebKit, ubuntu | 667×375 landscape, DPR 2, touch, Mobile Safari UA, layout, two-pointer play, soak, screenshot diff | `tools/test-iphone-webkit.mjs` | **still on a branch** — PR #8 and PR #9 both add it |
| 2 — iPhone SE 3 simulator + Appium, macOS | the same paths in real iOS Safari with trusted multi-touch | `tools/test-ios-safari.mjs` | **still on a branch** — both PRs add it; PR #8 runs it from `ios-safari-simulator.yml`, PR #9 from a second job inside `iphone-webkit.yml` |
| 3 — round comparison | that this round is not **worse** than the last one | `.kit/tools/compare-round.mjs` + `iphone-se3-round.config.json`, run by `.github/workflows/iphone-se3-round.yml` | added on `main` |

Tier 3 was added **without touching a single file either open PR changes**, so it merges with
whichever of them lands. It contributes nothing to the choice between them.

Two things to know before picking one:

- PR #8 and PR #9 overlap heavily — both add `tools/test-iphone-webkit.mjs`,
  `tools/test-ios-safari.mjs`, `.github/workflows/iphone-webkit.yml` and
  `publish-verified-pages.yml`, and both rewrite the same `AI_DEVELOPMENT` state files. They
  cannot both be merged as they stand. Measured against `main` at `22ef064`: **PR #8 conflicts
  in nine files** (eight `AI_DEVELOPMENT/*` records plus `README.md`) and needs a rebase before
  it can land at all; **PR #9 merges cleanly**. Both were branched from commits that are no
  longer `main`.
- They disagree on a field name: PR #9 writes `soak.maxFrameGapMs` where `Gptgame` and
  `survival` both write `soak.maximumFrameGapMs`. Whichever lands, spelling it the way the
  other two repositories already do is one character of work now and a drift report later.
  The config declares both so the round works either way.

## What the harness on both branches does not check

Audited by listing the actual `check()` names in each branch's `tools/test-iphone-webkit.mjs`,
against what `Gptgame` and `survival` already assert. Both PRs are identical on all four
points, so this is a gap in the work, not a reason to prefer one branch:

- **No layout assertion at all.** Neither branch checks `document.scrollWidth` against the
  viewport, so horizontal page overflow on a 667 px screen passes. Both siblings check it.
- **No 44 CSS px touch-target floor.** Every control could be 20 px and the gate stays green.
  `Gptgame`, `survival` and Q's branch all check it; this is the same drift
  `.kit/lib/mobile/device.mjs` was written to stop, and `touchTargetCheck` there is ready to
  drop in.
- **No saved-run restore.** `settings save and restore` is the only persistence check — it
  covers the options screen, not a run. Both siblings save mid-play, reload, and assert the
  player came back to the same position.
- **No Mobile Safari user-agent assertion.** The user agent is read into the report and never
  checked, so a run that silently fell back to Chromium still reports the phone surface.
  `deviceChecks()` in the shared module covers all of this.

Fixing these is a change to whichever harness lands, so it is deliberately not done here —
this file records the finding rather than editing a file two open PRs are already fighting
over.

## Running one round, once a harness is on `main`

```bash
npm run test:iphone-webkit      # (added by whichever PR lands)
node .kit/tools/compare-round.mjs --config=iphone-se3-round.config.json
node .kit/tools/compare-round.mjs --selftest   # watch every refusal fire on a broken round
```

The one-line `package.json` script both PRs already touch was left alone on purpose. Add it
once the merge conflict is gone:

```json
"round:iphone": "npm run test:iphone-webkit && node .kit/tools/compare-round.mjs --config=iphone-se3-round.config.json",
```

First round: `--bootstrap` records the bar instead of judging against one, then commit
`tests/baselines/iphone-se3-round.json`. When a round is slower on purpose, `--accept`
records that decision rather than silencing it.

## Why a comparison and not another threshold

The phone harnesses in these repositories judge each run against fixed limits — a frame-gap
hang guard, a diff ratio, a triangle ceiling — set loose enough not to flake on a shared
runner. They catch a build that broke. None catches a build that got worse: boot climbing from
900 ms to 2.4 s and p95 frame gap from 18 ms to 39 ms passes every one of them.

That is the same problem this project already knows from the art loop: telemetry read
`intensity 3.41, castShadow true` while the key light contributed nothing measurable. A number
that is inside a loose limit is not a number that was checked.

## This is not the variance measurement, and must not become it

A variance pass is starting in this repository, and it also produces timing numbers. The risk
is not that one of the two is wrong — it is that in six months nobody can say which to believe.
So the boundary, before either grows into the other:

| | round comparison (this) | variance measurement |
|---|---|---|
| runs | one run of this build vs one recorded run of an earlier build | the **same** build, N times |
| answers | did it get **worse** | how much does it **move on its own** |
| emits | a per-metric verdict, and a non-zero exit | a spread, and no verdict |
| tolerance | **declared** in `iphone-se3-round.config.json` | measures what the tolerance should have been |

The seam is concrete: **the variance pass is what should replace the tolerance this gate is
currently guessing.** `DEFAULT_TOLERANCE` in `.kit/lib/mobile/roundCompare.mjs` is 25% because
that is loose enough not to flake — and the two verified `survival` runs the comparison was
built against moved boot time from 11854 ms to 9474 ms with nothing changed between them. That
is 20% of run-to-run spread from a sample of two, sitting under a 25% gate. The gate is barely
above a noise floor nobody has measured yet.

So the variance work is not a duplicate of this. It is the missing input. When it lands, the
tolerances here should stop being defaults and start citing its measurement.

Two rules keep them from colliding:

- **If it re-runs the same build, it is variance measurement — it must not emit a pass/fail.**
  (`compare-round` already refuses this shape: two runs of one build read as a round compared
  against itself, and it says so rather than returning a verdict.)
- **If it compares two different builds, it is a round comparison — it must not invent its own
  tolerance.**

## What the comparison refuses to do

- **Compare a round against itself.**
- **Treat a metric that vanished as a metric that passed.**
- **Accept byte-identical timings as a new measurement** — two real runs do not reproduce
  milliseconds exactly; if every metric matches, the report was copied. Same rule the capture
  rig already applies to pixels.
- **Score a failed run** — a harness that aborted at step three reports a very fast boot.
- **Return a pass when nothing was compared.**

Every one of those fires on a deliberately broken round under `--selftest`, alongside a
must-pass control, and the workflow runs that proof before it runs the gate.

## What none of this is evidence for

Playwright reproduces the viewport, DPR, touch emulation and user agent of an iPhone SE 3, and
none of its performance: measured in the same container, `survival`'s harness under the
SwiftShader surrogate reported a **1333 ms median frame gap — 0.75 FPS**. The simulator tier
is real iOS and real Safari, but still a Mac.

So neither tier may be cited for sustained 30 FPS on the device, thermal throttling, memory
pressure, GPU load, real-glass multi-touch, or audio latency — the same honesty
`REFERENCE_BENCHMARKS.yaml` already applies to the twelve elements with no working review
loop. Those need the physical phone.
