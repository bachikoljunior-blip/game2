# Independent CPU closure of the startup contact-phase finding

Reviewed exact checkout: `f578df097d984d1063e0cd0af3c9b3df2fee36c8`.
Reviewer: `/root/game2_ultra_seven_fixes/independent_runtime_review`.
Scope: only the startup/retry P2 reported at 47d5. No production source, remote or automation changes were made.

**P2 startup phase mismatch: closed in the nonrendering CPU reproduction scope.**

Source integration now calls `view.beginWorld(world)` immediately after Start/retry creates the new world. It seeds all rig memories from the starting actor positions and world time before the first advance. Audio then seeds its tracker from that same boundary. Resume follows the existing world and does not call `beginWorld` again.

I independently repeated the original main-loop ordering: render the intro rig, create a new world, seed at the new-world boundary, then five frames of `advance(.25,{x:1}) -> footstepTracker.update -> updateCharacterRig`. I repeated the same sequence for retry, reusing the rig rather than constructing a new one. There is no zero-time rendering of the new world before movement.

| Render | Travel | Visual cycles | Scheduled contact | Computed planted foot |
| --- | --- | --- | --- | --- |
| 1 | .95m | .4241071428571429 | none | neither |
| 2 | 1.90m | .8482142857142851 | right | right |
| 3 | 2.85m | 1.2723214285714288 | left | left |
| 4 | 3.80m | 1.6964285714285725 | right | right |
| 5 | 4.75m | 2.120535714285716 | left | left |

Both attempts produce the same results. Maximum difference from the correct shared cycles is `2.220446049250313e-16`; each has four scheduled contacts and four computed half-cycle crossings. The old permanent `.4241071428571429` cycle offset and opposite-foot assignment are gone. The first moved frame now has smoothed visual speed 3.68525m/s instead of zero, approaching 3.8m/s thereafter.

The two relevant existing regressions also pass: new Start/retry before-first-render movement, and shared phase across 4/50/60/120Hz fixed-tick sampling.

This result describes CPU pose and scheduling calculations. No sound was listened to and no rendered video was evaluated in this closure. The earlier actual-media camera defect remains awaiting native corrected-revision visual recheck despite its verified source correction. Final matching CI media for the thirteen motions, vegetation, six POIs and ordinary missions remain the next evidence step. No formal comparison verdict is issued; all ten formal quality elements remain not measured.
