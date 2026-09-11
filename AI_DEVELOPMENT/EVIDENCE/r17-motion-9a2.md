# Round 17 motion sample `9a2e039` — complete frames, failed combat coverage

Source revision: `9a2e0395772315115ab7214475eef74cab3091f1`

Workflow: [Game2 criteria evidence run 34622792639](https://github.com/bachikoljunior-blip/game2/actions/runs/34622792639)

Artifact: `10276198837`, 43,951,084 bytes, ZIP SHA-256
`fe446e8bff0930765dfe1ca8a32e62b2323b0126988beb593fba4d3fda1c9137`
(90-day retention).

## What was genuinely captured

- 120 consecutive locomotion PNGs at a virtual 60 Hz, encoded as a 2.000 s,
  2532x1170 H.264 video. SHA-256:
  `905847afd93b7b9ac9d58954e6c5b93021f0e58e84661600dd750c3aaf4f42cc`.
- 180 consecutive combat PNGs at a virtual 60 Hz, encoded as a 3.000 s,
  2532x1170 H.264 video. SHA-256:
  `13745d240e11090657f4ad958543a2732fe0e8041e4158927fbf9857b523a450`.
- `ffprobe` counted exactly 120 and 180 frames at `60/1`; no interpolation,
  duplicated-frame insertion, decimation or retiming was requested.
- Every frame completed the real SwiftShader WebGL pipeline and passed the native-size,
  opacity, non-black and non-constant PNG apparatus checks outside the real HUD alpha.
- The carried self-check came from the identical dist fingerprint
  `1505f579d26626494ea1c94d539a8c64a9ff3658baa35cd11b0148fb86326692`;
  both 120-frame determinism and render-substitution divergence were zero.

This is software-rendered evidence, not physical-phone performance evidence.

## Why the sample is FAIL

The combat clip contained 60 enemy-startup frames and 17 enemy-active frames, but zero
registered `hit`, `damage-taken`, `parry` or `clash` reactions attributable to an enemy
attack. The fixed late tap/flick player timeline never intersected a hit volume. The two
MP4 files are valid and preserved, but this does not meet the authored requirement that
the combat clip show startup, a damaging window and a real impact reaction.

The manifest also reported the checkout as dirty only because the workflow downloaded
the intentionally untracked `shots/interaction-ci-candidate.json` control report. The
next tool revision separates this carried evidence path from unexpected source changes.

## Repair

The replacement combat plan enables the already-measured `aggressive-v2` player script
for frames 3–177. It approaches, guards and attacks solely through the real DOM pointer
surface and registered guard zone. Enemy spawn and reset remain explicit capture setup;
no attack, hit, reaction, health or animation state is injected. A structure test fixes
the plan at 180 frames, preserves the total 300-frame budget and rejects direct `set`
actions.

The retry reuses run 34622792639's interaction and screenshot control because the game
dist fingerprint is unchanged; it skips a duplicate 20-encounter job. A future game-source
change returns to same-run control generation.

Fresh independent review is still required. Neither this failed sample nor its replacement
plan establishes `BM-VIS-04`, visual quality, physical-device performance or human play
quality.
