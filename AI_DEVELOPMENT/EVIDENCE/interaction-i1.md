# Interaction capture — first run (tag `i1`)

Apparatus: `tools/interaction-capture.mjs` at phone/MEDIUM (844×390 @3, SwiftShader).
Brief: `tools/INTERACTION.md`. Report: `shots/interaction-i1.json`. Traces:
`shots/interaction-i1/<scenario>.json`.

This is the first time any element of KAGEROU other than the image has been measured in
motion. Read the limitations before quoting a number from it.

## Apparatus validation (tag `sc1`, carried forward against an identical build fingerprint)

| check | prediction | measured |
|---|---|---|
| Determinism | the same stimulus twice produces the same simulation | worst absolute divergence **0** across position, heading and speed over 120 frames |
| Render substitution | replacing the post pipeline with a matrix-only stub does not change the simulation | worst absolute divergence **0** over the same 120 frames |
| Cost of that substitution | — | **8.73 s** per rendered frame vs **2.2 ms** per simulated frame (120 rendered frames took 1047.4 s; 120 simulated took 0.3 s) |
| Agreement with the screenshot rig | same order at an identical pose | 117 draw calls / 751,557 triangles at `hero`, phone/MEDIUM. `shots/report.json` was absent in this container, so the comparison is against the recorded r15v1 worst-shot figures (119 / 784,449) rather than a live rerun — same order, and below the worst-of-five as expected for a single pose. |

The render substitution is what makes the rig usable at all: without it a single 900-frame
scenario would cost over two hours. It was measured rather than assumed, because it is the
rig's largest assumption.

## What this run may not be used to claim

- **Not a play test.** Every combat scenario is driven by the scripted policy in
  `tools/harness/runtime.js`. It reads only what a player can see and acts through the same
  synthetic touch surface, and it is still not a person.
- **Not device evidence.** SwiftShader, in a container, under a virtual clock.
- **No reference comparison.** No footage of any reference title was fetched, here or
  anywhere in this repository. Every threshold is measured on our own build.
- **`inconclusive` is not `pass`.** Where a probe or a sample size fell short the metric
  says so, and the criterion keeps its previous status.

## Findings that came out of building the rig, not out of running it

Both are recorded in `AI_DEVELOPMENT/TECHNICAL_DEBT.md`.

**TD-010 — enemy movement costs 194–850 ms of JS per frame.** With no enemies the harness
simulates a frame in **1.25–1.7 ms**; with three engaged, **194–850 ms** depending on what
the enemies are doing — 137× to 500×. The spread is real and was measured twice: the
in-report figure is 194.2 ms with 209,886 narrow-phase triangle tests, the standalone
diagnostic peaked at 850 ms with 419,414. A V8 CPU profile against unminified source
attributes **91.6%** of that frame to
`Physics._closestToMesh → segToTriangle / closestPtTriangle`, reached from
`_integrate → move → _moveCharacter → _charStep` via `_slide`, `_depenetrate` and
`_probeGround`. The entire static world is **five** triangle-mesh colliders totalling
**2,148** triangles, so a single frame is re-testing the whole world about a hundred times
over. Because this is JavaScript rather than rasterisation it is not a SwiftShader
artifact and should be expected to reproduce on the target phone against a ≤ 5 ms budget —
though a container CPU is not a phone, so the ratio and the mechanism are the transferable
part, not the absolute milliseconds. It is also why the combat scenarios here are short and
why `encounters` was not run at all.

**TD-011 — the interactables are unreachable.** `Level.interact()`,
`Level.nearestInteractable()` and `Level.ringBell()` have no caller in `src/`, and Input's
`interact` intent (KeyF) is consumed by nobody. The bell, the ema and the chōzuya have
authored responses that no player input can reach, and ringing the bell is also the trigger
for a wave set. BM-EXPLORE-02 was marked `verified` on a source audit that read those
authored responses without checking that anything invokes them — which is precisely the
trap in the standing warning that the eighteen `verified` criteria are overwhelmingly source
audits rather than play verification.

## Results

See `shots/interaction-i1.json` → `results` for the per-criterion verdicts, each with the
number it measured, the threshold it was measured against, and the method. The summary
block records how many elements gained a real measurement.

## Verdicts — 5 pass, 9 fail, 4 inconclusive over 18 criteria

Ten of sixteen elements now carry an executed measurement, against one before this run.

| criterion | element | verdict | measured |
|---|---|---|---|
| BM-MOVE-01 | 移動 | **pass** | 1.900 / 5.400 / 7.200 m/s from world position against authored 1.9 / 5.4 / 7.2, all inside ±5% |
| BM-MOVE-02 | 移動 | **fail** | planted-foot drift p95 **25.9 cm/frame**, worst 29.9, against a 2 cm bar (181 contact samples) |
| BM-MOVE-03 | 移動 | **fail** | 180° reversal **283 ms** against 250 ms; response latency 17 ms against 100 ms — nothing is eaten, the turn is slow |
| BM-CAMERA-01 | カメラ | inconclusive | lock-on engaged for **0 of 840 frames** with three living enemies at 3–5 m |
| BM-CAMERA-02 | カメラ | **fail** | **36 of 1,896 frames** put a solid collider inside the near plane; worst eye jump 0.599 m against 1.5 m |
| BM-CAMERA-04 | カメラ | inconclusive | ablation pair diverged **22.55 m**; the bot steers off camera yaw, so shake feeds its input |
| BM-COMBAT-02 | 戦闘 | inconclusive | not run — ≥20 encounters is hours of wall clock at the cost in TD-010 |
| BM-AI-03 | AI | inconclusive | not run — same scenario, same cost |
| BM-TOUCH-03 | タッチ操作 | **fail** | **0 misfires in 120** deliberate camera drags (passes); 2 of 4 action seals sit inside a 16 px screen-edge margin (fails) |
| BM-TOUCH-04 | タッチ操作 | **pass** | 60 of 60 taps consumed in the frame they arrived; worst deferral **0 frames** |
| BM-ANIM-01 | アニメーション | **fail** | shortest visible windup **17 ms**, median 50 ms, against the 140 ms floor the AI holds itself to (7 attacks) |
| BM-ANIM-02 | アニメーション | **pass** | 12 swings; damaging window and visible sweep start and end on the **same frame** every time |
| BM-STORY-03 | 物語 | **pass** | control never removed for a single frame of 1,440; the 4.2 s title beat is ink only — the player moved 3.41 m through it |
| BM-CHOICE-02 | 選択と結果 | **fail** | 0 accidental rings **and 0 deliberate ones**: the bell is unreachable, not protected (TD-011) |
| BM-EXPLORE-01 | 探索 | **fail** | 7 of 8 approach points see a landmark; `east-edge` (22, 34) sees none |
| BM-CHAR-02 | キャラクター | **fail** | 4 of 8 archetype placements below a 0.06 luma edge step; worst shinobi/shaded **0.031** |
| BM-AUDIO-03 | 音響 | **pass*** | post-limiter sample peak **−12.43 dBFS** with five simultaneous impacts, 11.4 dB of headroom. *Sample peak, not ITU-R BS.1770 true peak — held at `under_review`. |
| BM-PERF-05 | 性能 | **fail** | **194.2 ms** of JS per frame with three enemies against **1.41 ms** with none — 137×, against a 5 ms budget |

## Apparatus faults found and fixed during the run

Recorded because ruling out a wrong cause is worth as much as a fix, and because each of
these would have been filed as a game defect:

1. A ground raycast originating at y = 3 (and later y = 60) under a world at y = 812. It
   produced **zero** foot-contact samples and **zero** visible landmarks from all eight
   approach points before anyone looked at why.
2. An inferred measurement window that swallowed a scripted teleport and reported a
   correct 1.9 m/s walk as **5.8 m/s**. Windows are now marked explicitly by the scenario.
3. A stale `camera.matrixWorldInverse` — three only rebuilds it inside `renderer.render`,
   which the sim-only path skips, so every NDC projection used a camera frozen at boot.
4. A rim-contrast metric that returned **PASS** from a set containing only screenshot
   errors, because `undefined < 0.06` is false.
5. Steady-state motion counted as an input-ignored window, reporting 950 ms of ignored
   input on every reversal in a run whose turns took 283 ms.

A sixth was a scenario fault rather than a metric one: the first locomotion run walked the
player from the boot spawn — which is **inside the haiden's footprint** — into an interior
wall 3.4 m north, while `Player.speed` reported a perfectly correct 1.9 m/s. Locomotion is
now measured on the gravel arena with its clear run-up recorded in the trace, and the
metric returns `inconclusive` rather than `fail` whenever the controller's self-report and
world position disagree.
