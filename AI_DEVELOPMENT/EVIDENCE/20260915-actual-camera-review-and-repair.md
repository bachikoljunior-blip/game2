# Independent actual-media camera diagnosis

Reviewer: `/root/game2_ultra_seven_fixes/independent_runtime_review`.
Original media: CI `34949745102`, `experience/experience-report.json` identifies exact source `bd4e64f9a46e7c6873a8057e420095b278c9e5e7`. This run reports failed with 30 console errors. It predates the actor/ground/shadow/solid fixes and includes the already identified wind-shader compilation problem. It is historical diagnostic material, not evidence for accepting the corrected game.

Scope was limited to camera/player visibility: all six native POI screenshots, decoded frames every four video seconds in all three exploration recordings, and selected native-size video frames around disappearance/reappearance. I did not watch every video frame, listen to sound, or evaluate the unrelated motion studies or overall art quality.

## New actual-rendered P1: ordinary follow can leave the actor outside the screen

The `spring-basin` and `valley-frame` native PNGs both lack a visible player body. `stream-stones` shows a central full figure; `sun-ring` shows a smaller figure in the middle distance; `old-waystone` shows a markedly small, distant figure; `white-tree` shows a large figure at the right edge.

The point records establish that all six are ordinary precombat exploration: `routePhase=approach`, `routeChoice=null`, player HP100. They therefore do not use the previously reported authored rejoin/arrival camera. Snapshot records associated with the missing-body discoveries are:

| Discovery | Recorded player X/Z | Simulation time |
| --- | --- | --- |
| spring-basin | -27.4033647593 / 14.1761886943 | 9.1666666667 |
| valley-frame | 29.4061184575 / 10.2997877473 | 11.6666666667 |

These are the report's point snapshots taken near screenshot capture, not frame-synchronized actor telemetry for every video frame.

The recordings confirm that the absent body is not limited to one screenshot:

| Recording | Video sample seconds | Direct observation |
| --- | --- | --- |
| water | 16, 20, 22, 24 | Body at left edge; no visible body; only sword fragment at left edge; full figure returns. |
| ridge | 20, 24, 26, 28 | Body to right; no visible body; only sword fragment at right edge; full figure returns. |
| memory | 32, 36, 40, 42 | Small distant figure at 32/36; a broad opaque horizontal surface crosses the frame and obscures almost all of the player at 40; full figure visible again at 42. The obstructing surface's identity cannot be established from the image alone. |

The discovery text has already appeared in the 22s water and 26s ridge samples while the body is still absent. Increasing screenshot delay alone would hide a defect that remains in normal play. The exact continuity duration of each disappearance was not measured from these sparse samples.

## Cause check and corrective recheck

I loaded the exact bd4 camera source for a nonrendering comparison. Its interpolation clamps dt to .1, then limits focus translation to .5m and camera translation to .7m per rendered frame. The simulation can resolve .95m player movement during a .25s frame at 3.8m/s. Sustained ordinary translation therefore outruns tracking; this is consistent with the observed departure and eventual return.

An independent synthetic path model from ridge `(17,17)` to `(30,10)` at 250ms steps reproduced 2 out-of-frame steps among 16, maximum absolute horizontal NDC 1.03593 and final focus lag 5.04688m. At 60Hz the same model has no out-of-frame step and final lag 0.39575m. The water leg `(-17,19)` to `(-28,14)` independently accumulates 4.53187m focus lag at 250ms. These are models using the shared terrain and actual functions, not a reconstruction of precise browser frame timings.

The integrator's corrective commit is `a30568e568f6995d2e48b9c89011759ad3e5a441`; the independently rechecked checkout was `bddeda249a9f12660d3a16091477520b51b51753` (additional audio repair). `cameraTrackingTranslation` transfers actual resolved player displacement and terrain-height change to camera and focus before retaining the ordinary rotation/composition smoothing. It excludes authored vista, arrival and victory compositions, and the presentation resets camera memory for a new world.

Repeating the same two 250ms path models with the corrected implementation gives zero focus lag and zero out-of-frame steps in both. Maximum absolute horizontal NDC is 0.015386; minimum projected figure height at 960x540 is 159.57px. Four relevant tests pass: all three complete circuits with slow frames, reversed lock bearing, large authored composition continuity and vista/arrival boundary continuity.

The source correction matches the demonstrated cause and resolves the nonrendering repro. **Native rendered verification of the corrected revision remains pending.** At minimum, inspect actual movement and discovery arrival on both outward lateral legs, the rear-loop sample corresponding to the old 40s obstruction, and the return/reversal segments; keep the player visible during movement, not only after a stationary wait. Preserve source revision and capture-frame camera/player state together when practical.

## Preserved evidence

`bd4-camera-media/media-provenance.json` records SHA256 and sizes for the ten original report/image/video files. `sampling.json` records extraction scope. Contact sheets use exact decoded frame indices 0,100,200,... from 25fps recordings (0s,4s,8s,...), scaled to 480x270 per tile only for overview. Separately inspected frames retain 960x540 native size. Empty tiles after the end of a recording are layout padding, not missing game frames.

No production source or remote state was modified by this reviewer. This does not reverse the six earlier bounded static rechecks; it is a separate ordinary-tracking defect exposed by actual media. No formal comparison was conducted and all ten formal quality elements remain not measured.
