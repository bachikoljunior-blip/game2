# Independent implementation diagnostic

Reviewer: `/root/game2_ultra_seven_fixes/independent_runtime_review`.
Reviewed implementation: `5ffb1cfe36c583f622595dff0c889e9adaf9bfe1`.
Scope: generated actor geometry/motion, environment wind, optional exploration, simulation integration and related tests. Audio/input review belongs to the other independent reviewer. No repository source or remote mutation performed by this reviewer.

This is implementation diagnosis. It is not a blind comparison or a judgment of the ten fixed quality elements. No reference work was substituted, no actual rendering was available at this static stage, and all quality elements remain not measured. Node/Three calculations below are synthetic nonrendering probes, not player footage.

## Findings

1. **P1 / major — mainline camera continues during optional exploration.** `fresh/camera-framing.js:6-13,44-55`. After the selected branch enemy is defeated, the rejoin camera applies for every player position with `z <= -12.85` until physical reconvergence. Leaving the left route for the rear optional loop can therefore keep the camera at `(0,11.5,-7)` while the player moves to `(-12,-39)`; projected player feet are NDC y=1.14, outside the frame. At sun-ring `(26,-20)`, NDC x=1.93. After all duels, the arrival camera is also global; optional discovery points lie 22-43m from that camera, making the player only 18-41px tall at 844x390. Restrict both compositions to a bounded mainline region and return to follow elsewhere. The integrator subsequently made `214d9aa`, which adds those spatial restrictions; final-revision verification remains to follow.

2. **P1 / major — delayed first attack observation renders an idle sword during the actual hit window.** `fresh/character-motion.js:144-154`. Entering a visually new state always sets transition=0; blending uses elapsed rendering time, even when simulation age has advanced past the active threshold. Repro: createWorld, legal close-range fixture player.z=2.7 and sentinel.z=1, render idle, `advance(world,.25,{attack:true})`, then `updateCharacterRig(...,.25)`. Observed attack age `.2333333333333333`, sentinel HP66, real hit event at simulation time .20 and `attackActive=true`, but sword position remains idle `[.225,1.045,-.285]`. The only blade movement is the root lunge. Account for actual state age and bypass entry blending by the active interval. Add 150-250ms first-observation cases, checking actual sword transform rather than the copied boolean.

3. **P2 — generated feet and fallen equipment penetrate new sloped terrain.** `fresh/character-motion.js:130,167-177,208-225`. Only moving planted contacts query the ground at each foot. Idle/guard/attack targets use a shared actor-centre elevation, and foot orientation is horizontal. At sun-ring `(26,-20)`, yaw `2.356194490192345`, CPU evaluation of generated mesh vertices against the shared terrain gives 0.130m idle ankle penetration, 0.179m guard penetration and 0.228m attack penetration. Final death at yaw `4.71238898038469` puts the scabbard 0.328m inside terrain. Project both feet in all relevant poses, account for actual sole footprint/surface orientation, and fit the fallen figure to terrain. Existing geometry tests only use the default flat ground.

4. **P2 — touching an entrance permanently locks optional-loop progress direction.** `fresh/exploration.js:74-85`. Repro: touch water first node `(-8,15)`, abandon the entrance, move through central x=-8 to z=-15, reach the opposite entrance `(-5,-15)`, then walk every water node in reverse at 3.8m/s sampling. Both places are discovered, but `completed=[]` and water progress is `{direction:1,next:2}`. A physical reverse circuit is discarded. Allow an incomplete circuit to restart direction upon renewed endpoint entry or track both sequences. Existing fresh-world direction tests do not cover a cancelled entrance.

5. **P2 — old sunlight shadow region excludes expanded discovery locations.** `fresh/presentation.js:24-25`. With the actual Three directional-light shadow camera matrices, spring-basin, sun-ring and white-tree have shadow NDC x of 1.1163, -1.1606 and -1.0321, respectively. They are outside the fixed +/-28 width. Their figures and foliage cannot receive the expected direct sunlight shadows. Use an appropriate player-following or expanded region while preserving useful shadow resolution.

6. **P2 — new solid discovery props have no shared collision footprint.** `fresh/presentation.js:252-290`; `fresh/exploration.js:44-59`; `fresh/simulation.js:6-11,28-44`. The water basin at `(-29.9,14)`, waystone at `(-13.9,-39)` and white-tree trunk `(13.15,-39.8)` are visibly solid but every centre is inside the walkable clearing and excluded from collision definitions. The actor can move through them at ground elevation. Define the relevant solid footprints once, share them with placement/movement, and retain a clear central walking lane.

## Positives and limits

- Mainline damage, speed, attack timings, three enemies and living-only victory logic remain unchanged in the reviewed simulation diff.
- Fixed-step route choice/rejoin and explicit signal action are still required. Optional discoveries do not directly change combat values.
- Generated geometry and textures use boot resources and local Three modules; no external runtime asset loads were observed in the reviewed implementation.
- Wind visible/depth passes share shader deformation and the wind clock; trunk roots and cloth fixed edges have explicit anchors.
- Actor defeat/victory clocks continue after simulation stop, while ordinary pause freezes the rig when `animate=false`; retry replaces its actor memory.
- These properties and nonrendering probes do not establish perceptual naturalness, mobile device performance, coherent full-scene geometry, or acceptable final animation. Same-revision rendered footage and independent visual examination are still needed.
