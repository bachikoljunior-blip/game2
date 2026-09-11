# Round 17 source-blind motion review

Status: **FAIL — 35/100; one blocker, two majors, and an impact-evidence blocker.**
This is an independent model review of the captured motion artifact, followed by a separate
source-blind refutation pass. It is not interactive play, a human blind study, a real-device
performance result, or a matched reference-gameplay comparison.

## Identity and isolation

- Source artifact: GitHub Actions run
  [34622792639](https://github.com/bachikoljunior-blip/game2/actions/runs/34622792639),
  artifact `game2-motion-9a2e0395772315115ab7214475eef74cab3091f1`.
- Candidate: `9a2e0395772315115ab7214475eef74cab3091f1`.
- Artifact SHA-256:
  `fe446e8bff0930765dfe1ca8a32e62b2323b0126988beb593fba4d3fda1c9137`.
- Reviewed sequences: locomotion, 120 frames / 2 s / 60 fps; combat, 180 frames / 3 s /
  60 fps; both 2532x1170. Video hashes and the apparatus failure are recorded in
  `r17-motion-9a2.md`.
- The critic received the decoded video and five representative PNGs, but no source, git
  history, prior scores, or reference images. A separate source-blind refuter challenged
  each visual claim before this record was frozen. Source-level mechanisms are intentionally
  not asserted.

## Findings that survived refutation

1. **Blocker — black staircase rendering artifacts (E11-VISUALS / animation readability).**
   `combat-enemy-startup-007.png` at 0.117 s contains an opaque staircase-edged diagonal
   entering the enemy head/weapon region from the upper frame. `combat-enemy-active-038.png`
   at 0.633 s contains another spanning about half the upper-left width. They recur during
   combat; a smaller black trailing streak also disappears between 1.033 and 1.050 s.
   Presence in decoded PNG frames rules out MP4 compression as the sole cause. The refuter
   agreed the artifacts are conspicuous, while noting that the stills alone do not establish
   their severity. The motion critic retained blocker severity because they dominate the
   moving action. Target: no spanning black streak or discontinuous trailing geometry in a
   complete replacement sequence.

2. **Major — insufficient combat-body separation (E03-CAMERA / E07-CHARACTER).** At 0.117
   and 0.633 s both heads and the enemy upper torso remain distinguishable, but the player
   hides much of the enemy lower body. The near-collinear framing conceals stance and attack
   pose. The refuter rejected the stronger phrase “near-complete silhouette overlap” but
   retained the observed readability loss. Target: the replacement attack sequence keeps
   the enemy stance and space between both fighters readable without pushing the target out
   of frame.

3. **Major — construction-proxy character forms (E07-CHARACTER / E11-VISUALS).** Combat
   setup and both locomotion representative frames show plain oval heads, capsule-like
   sleeves, largely undifferentiated torsos, and sharply tapered legs/feet. Sashes and swords
   do provide identity, so “uniformly featureless” was rejected as too absolute. Target:
   readable joint, garment, and foot forms throughout the replacement motion sequence.

4. **Evidence blocker — no impact reaction.** The apparatus registered 60 enemy startup
   frames and 17 active frames but no enemy-attributable hit, damage-taken, parry, or clash.
   The visual reviewer did not independently validate telemetry. This sample cannot clear
   impact-feedback coverage regardless of its visual score.

## Scope and continuation

Locomotion progression and the walk/run camera transition appear progressive in the decoded
sequence; no gross camera teleport was observed. This does not certify blend limits, foot
planting, audio, contact telemetry, numerical timing, or real-device pacing. No supplied
reference images were available to this motion reviewer, so any reference preference would
be memory-based and is not recorded as a measured blind comparison.

The next candidate must remove the rendering artifact, improve combat pose separation and
character construction, produce a real registered impact through ordinary input, rerun the
full capture at native phone resolution, and undergo a new independent review. None of the
affected criteria pass from this sample.
