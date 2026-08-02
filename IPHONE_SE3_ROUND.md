# The iPhone SE 3 round

Two tiers of automated phone testing, plus the comparison step that turns them into a round.

## Where each tier stands in this repository

| Tier | What it proves | Where it lives here | Status |
|---|---|---|---|
| 1 — Playwright WebKit, ubuntu | 667×375 landscape, DPR 2, touch, Mobile Safari UA, layout, two-pointer play, soak, screenshot diff | `tools/test-iphone-webkit.mjs` | **still on a branch** — PR #8 and PR #9 both add it |
| 2 — iPhone SE 3 simulator + Appium, macOS | the same paths in real iOS Safari with trusted multi-touch | `tools/test-ios-safari.mjs` | **still on a branch** — PR #8 (PR #9 drops it) |
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
