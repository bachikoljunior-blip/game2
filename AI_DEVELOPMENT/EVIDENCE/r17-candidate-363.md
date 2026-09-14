# Round 17 — candidate 3633597 evidence and next repair

Inspected 2026-09-11. Candidate `3633597b1499d60a25a41a94c4fe02677cdaca35`,
PR #10, branch `codex/game2-criteria-20260911`.
[CI 34640487523](https://github.com/bachikoljunior-blip/game2/actions/runs/34640487523)
finished at 21:16 UTC: evidence job PASS, motion job FAIL.
main and Pages remain at `4e6d23a40af33bb3ba409b3826e77666262ce353`.

## Reproducible evidence

| artifact | ID | SHA-256 |
|---|---|---|
| candidate frames and interactions | 10280852853 | `91ca2571af71638f0964dc9e34eb73d3cb83c4ad52898518d58c24a2a6ce7929` |
| motion videos and manifest | 10282473093 | `24eef0a8b6d4c7111be70f298dc42bd297f47b37f7341fe5af74cc05c572e6a9` |

Both downloaded ZIPs matched the server digests. Build fingerprint:
`688eb51ffa158ec76dd2934faccf3716b32f3213724a1ae01ffaaa4f31efd400`.
The motion manifest identifies clean source and the carried interaction report separately.

- Five native 2532x1170 phone/MEDIUM frames: technical and tone gates PASS.
  Maximum captured 119 draw calls / 803,596 triangles. The end-of-run statistics counter
  is 804,744 triangles; do not confuse it with the maximum captured frame.
- 20 scripted encounters: 30 enemy deaths, 21 posture-resolved deaths = **70%**, above
  the unchanged 60% threshold. The 59 execution phase events are not 59 kills.
- 18 interaction metrics: 15 PASS / 0 FAIL / 3 INCONCLUSIVE. Attack startup: 18/18
  calibrated attacks, shortest 233 ms, above the unchanged 140 ms threshold.
- Still inconclusive: shake isolation (paired paths differ 2.118 m), enemy pixel-edge
  survey, and audio true peak. Sample peak is not a BS.1770 true-peak measurement.
- Locomotion MP4: 120 frames, 2 s, 60 fps;
  SHA-256 `87c8455f57a6362c5b81f7d978128de0bb5e8c8c1323192e37b67769a2c95950`.
- Combat MP4: 180 frames, 3 s, 60 fps;
  SHA-256 `fffc31d117b094b98b0e371b5e8afed4afb251788e2cc10b3988e5d47818d0c0`.
- All 300 body-framing samples passed; no enemy-active body landmarks left the viewport.
  Walk/run position-derived medians were 1.9 / 5.4 m/s.

## Why motion failed

The enemy has 32 startup frames and 6 active frames (38–43), but **zero incoming
enemy-attributable impact reactions**. Player hit events at frames 78 and 143 and enemy
damage at frame 78 are real, but cannot satisfy the incoming-attack gate. The first hit
breaks posture and the second is an execution. The prior report's phrase “no reaction”
must be read as no *incoming* reaction, not no combat effects whatsoever.

The player approaches immediately and closes from 2.8 m to about 0.63 m by frame 38;
at frame 43 both entities almost coincide. Hypothesis: entering the spear's minimum
range causes the first thrust to miss, and the counterattack kills the enemy before
another incoming attack. The replacement input plan waits stationary until frame 60,
then uses the same aggressive-v2 DOM-input script. This prediction is **not yet proven**.

## Independent review and diagnostics

The separate source-blind critic and refuter retained recurring black stair-step ribbons,
primitive character forms and combat-body occlusion. Exact frames, pixel coordinates,
limitations and refutation are in `r17-motion-363-review.json`.
In particular, combat frame 38 still contains a black diagonal across the tree/banner.
The prior claim that the god-ray change solved the artifact was not verified. Do not
infer its mechanism from shape alone or reinterpret the yellow posture ring as this defect.

The next apparatus checkpoint changes no game source. It adds:

1. A 300-step input rehearsal with rendering substituted, recorded as `preflight.json`.
   It must find the same startup/active/incoming-reaction coverage before expensive video.
   It produces zero video evidence and cannot pass BM-VIS-04.
2. A stopped-frame render diagnostic replaying the **old** input at frame 38, then real
   A/A, god-rays-off, all-FX-off, trails-off, alpha-particles-off and restored-control images.
   Interpret only if controls match and baseline actually reproduces the artifact.
3. The complete native 120+180 rendered-frame gate remains unchanged for normal motion runs.

`[motion-retry] [diagnose]` selects the preserved 3633597 control and runs the short
rehearsal/diagnostic without repeating the completed 20 encounters or producing another
known-bad hour-long video. Exact build-fingerprint checks still fail closed. Source changes
require the normal full five-frame/20-encounter/300-frame path. Static apparatus review is
in `r17-motion-apparatus-review.json`; it is not runtime acceptance.

## Integration boundary

The standing protocol authorizes incremental verified checkpoints on main/Pages even while
overall product criteria remain open. The old state text “do not publish while any criteria
remain unmet” overstated that rule and is corrected. This particular checkpoint remains
unaccepted for release because the incoming-attack gate and recurring render defect are
unresolved. Repair and verify those boundaries before integration; do not mark the game
complete after one merge. Physical-device performance and human evaluations remain open.
