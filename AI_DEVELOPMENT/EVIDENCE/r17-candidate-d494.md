# Round 17 candidate `d4941ca` — rendered CI result

Source revision: `d4941ca027e805798e02837c0fac6f4158ebc5cd`

Workflow: [Game2 criteria evidence run 34615869197](https://github.com/bachikoljunior-blip/game2/actions/runs/34615869197)

## Native five-frame gate

The `2532x1170`, phone/MEDIUM set completed with zero shader or console faults. All
five tone gates passed. The worst pose submitted 119 draw calls and 804,744 triangles,
within the unchanged limits of 140 and 900,000. The identical-build fingerprint was
`1505f579d26626494ea1c94d539a8c64a9ff3658baa35cd11b0148fb86326692`.

Preserved artifacts (90-day retention):

- early frames: artifact `10270732248`, SHA-256
  `13db7c6a4c269f07db45617f7fee98c5220f76f727cb852d9205c1df5e5fe12e`
- full candidate: artifact `10271911160`, SHA-256
  `3b8b0a17fc7f45ce00aea2b0bbedc66043b998e9e457d7a0a52a061409dc064a`

The repaired frames have not received a fresh independent visual verdict. The previous
source-blind foliage and terrain findings therefore remain open.

## Twenty encounters

The required 20 encounters completed with 14 pass, 1 fail and 3 inconclusive metric
outputs. Determinism and render-substitution self-checks were both byte-stable for 120
frames (worst divergence 0), and the screenshot report was linked by hash and the same
build fingerprint.

- `BM-ANIM-01`: PASS. 37/37 attacks measured, zero uncalibrated; shortest onset 233 ms,
  median 450 ms, against the unchanged 140 ms floor. The separate same-Rig idle
  calibration collected 197/132/176 eligible samples for the three enemies.
- `BM-COMBAT-02`: FAIL. The stored report initially counted 66 enemy deaths and reported
  22.73%. Inspection proved that every authoritative entity death is followed by an
  anonymous compatibility `death` notification. The evaluator incorrectly counted those
  anonymous notifications as enemies. Re-evaluation of the unchanged raw trace after
  requiring an entity ID gives 31 enemy deaths, 17 posture breaks and 15 posture-resolved
  deaths: **48.39%**, still below the unchanged **60%** requirement. A regression test now
  preserves this distinction.
- `BM-CAMERA-04`: INCONCLUSIVE. The ablation pair diverged by 12.581 m, so shake cannot be
  isolated from this run.
- `BM-CHAR-02`: INCONCLUSIVE because the long encounter job intentionally used
  `--no-pixels`.
- `BM-AUDIO-03`: INCONCLUSIVE. The sampled peak is not an ITU-R BS.1770 true-peak
  measurement.
- `BM-PERF-05`: container-only PASS; it is not physical-phone performance evidence.

## Motion job continuation

The first motion attempt did not reach capture because `ffmpeg` was absent. The repaired
workflow then generated all 300 frames and both MP4s at `9a2e039`, but correctly failed its
combat-coverage gate because no real impact reaction occurred. The exact hashes, failure
and replacement player script are recorded in `r17-motion-9a2.md`. No motion or visual
criterion is treated as passed until a complete replacement artifact is produced and
independently reviewed.

Next: verify the post-9a2 gameplay/render repairs recorded in `r17-repairs-after-9a2.md`
through the full five-frame, 20-encounter and 300-frame CI, then obtain a fresh independent
visual review. Do not merge to `main` or publish Pages while the round remains FAIL.
