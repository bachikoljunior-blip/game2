# R17 player and camera bounded repair

Source baseline: `4e6d23a`. Owned source changes: `src/gameplay/Player.js`,
`src/gameplay/PlayerCamera.js`. Check: `node tools/check-player-r17.mjs`.
The command passes using installed Three.js, the real Player/Input/PlayerCamera
classes, and the real PhysicsWorld queries. No browser, build, capture, or commit
was run by this owner. These are deterministic simulation results, not rendered
phone evidence or a complete project PASS.

## Diagnosis before editing

- Read the movement/camera reference entries, `interaction-i1.md`, the i1 result
  records in `shots/interaction-i1.json`, current metric implementations and
  scenario stimuli. The raw trace files referenced by that manifest are absent
  from this checkout, so historical failing frame positions cannot be replayed.
- The reversal scenario used magnitude 1.0, which Input promotes to sprint.
  A baseline real-Player fixture reproduced 283.3 ms to 90% heading at sprint,
  versus 250 ms at run. Full 180-degree completion was 300 ms at sprint and
  283.3 ms at run. The metric currently calls 90% of a turn a completed reversal.
  The combat/harness owner was notified to use magnitude 0.92 for the run-speed
  criterion. The new check independently measures full 180-degree completion.
- The current baseline `_score` contains no occlusion rejection. Actual Input
  keydown dispatch, Player update, Camera update and late-update ordering acquired
  and held a clear 4 m target for 840/840 baseline frames. The historical zero-lock
  claim was therefore not reproduced as a current acquisition failure. The world
  owner separately identified the initial player spawn inside the hall.
- Backing to 0.4 m from a solid wall produced 23 eye overlaps in a 100-frame
  baseline fixture. The minimum collision boom was 0.55 m, longer than available
  space; camera-position smoothing and shake also followed the collision solve.
- Once clipping was corrected, a separate two-wall corner fixture revealed the
  composition defect the zero-lock trace could not measure: the player center
  remained outside the central frame for all 840 locked frames. The open-space
  counterpart had both centers central for 840/840 frames.
- Long portrait camera arms exposed the Physics sphere-sweep sample cap: a 12 m
  sweep could skip a 0.4 m wall. Camera queries now split into at-most-2 m sweeps;
  no Physics source change was made.

## Repair

The movement heading rate now completes a full run reversal within the existing
250 ms criterion. Walk/run/sprint velocity constants and acceleration, capsule,
gravity, combat-state and rig semantics are unchanged. At the combat owner's
request, Player also declares `managesPostureRegen = false`, making the existing
delegation to Combat explicit; posture tuning is unchanged.

The camera can contract below its aesthetic minimum boom when geometry requires
it. A sweep from the actual player chest constrains the smoothed eye and the final
shaken eye, including the entire near-plane corner radius. The collision query
mask is explicitly the solid world/prop mask.

Under lock-on, a blocked rear view selects a clear side of the pair. Cached side
selection avoids unnecessary candidate sweeps and oscillation. Candidate clearance
uses the distance needed for that angle, body size and viewport; portrait therefore
gets enough horizontal room. A constrained composition keeps the target visible
while the camera leaves the corner, then frames both bodies by angular weight.
The safety check includes heads, feet and capsule width, not only centers. FOV
event tuning is unchanged.

## Current measured results

All authored ground speeds, measured from world-position displacement, are
1.900 / 5.400 / 7.200 m/s at 120, 60, 30 and 4 Hz (the last is `dt = 0.25`).

| Run-speed reversal | First heading response | Full 180 degrees |
|---|---:|---:|
| 120 Hz | 8.3 ms | 225.0 ms |
| 60 Hz | 16.7 ms | 233.3 ms |
| 30 Hz | 33.3 ms | 233.3 ms |
| `dt = 0.25` | 250 ms, one sampled frame | 250 ms |

The 4 Hz row proves bounded stepping and speed preservation; it does not claim
sub-100 ms input response on a 250 ms sampling interval. Sprint full-turn time is
250 ms at 60/120 Hz and 266.7 ms at 30 Hz; the binding reversal criterion is at run
speed. Walking retains its slower turn-in-place behavior.

Camera probes use actual output position/quaternion, PerspectiveCamera projection,
and PhysicsWorld overlap queries. Bodies are tested independently at head, foot and
left/right capsule extents. The locked target is 2.15 m tall and 0.45 m in radius.
Each encounter includes the initial camera transition; no settling frames are
excluded.

| Locked fixture | Locked frames | Both centers central | Both full bounds central | Target off | Solid overlaps | Worst eye jump |
|---|---:|---:|---:|---:|---:|---:|
| 844×390, open | 840 | 840 (100%) | 840 (100%) | 0 | 0 | 0.0124 m |
| 844×390, corner | 840 | 824 (98.10%) | 821 (97.74%) | 0 | 0 | 0.2916 m |
| 390×844, open | 840 | 840 (100%) | 840 (100%) | 0 | 0 | 0.0124 m |
| 390×844, corner | 840 | 814 (96.90%) | 799 (95.12%) | 0 | 0 | 0.5788 m |

Separate back-wall, shoulder-wall, orbiting-pillar, shaken-wall and downward-floor
fixtures cover 181 samples each, including the initial snap: 0 overlaps in 905
samples. Their worst single-frame motion is 0.3252 m, below 1.5 m.

## Gates still pending

- Root must build and run the corrected interaction scenarios against the full
  procedural level. Synthetic wall fixtures do not establish zero collisions
  everywhere in the playable region, nor rendered silhouette visibility.
- The corner fixtures use stationary, living targets. Moving enemies, repeated
  target death/reacquisition, executions and actual shrine occlusion require the
  integrated encounter capture. Portrait full-body framing has only a small margin
  above 95% in this fixture; do not generalize it to unmeasured encounters.
- Side-orbit selection, final framing constraints and segmented casts add camera
  work. Full-scene JS cost and mobile performance remain for root's profiler/device
  gates. The local Node runtime is not an Android performance measurement.
- Camera shake ablation and visual review remain pending. Neither historical
  benchmark status nor shared project state was marked PASS by this owner.

## Camera-shake ownership repair

Follow-up source audit found a concrete recursion in the production event path.
Both `EffectsSystem` and `PlayerCamera` subscribed to `camera-shake`.
`EffectsSystem.addShake()` then called `PlayerCamera.addShake()`, while that method
delegated back to `EffectsSystem.addShake()`. A single bus event therefore recursed
until `EventBus` caught a `RangeError`; Effects trauma saturated at 1 while the
camera's duplicate local trauma remained zero.

Effects is now the sole owner of trauma, decay, frequency and generated 6-DOF
offsets. PlayerCamera consumes those offsets after its springs and retains only a
one-way compatibility method for direct callers. It no longer subscribes to the
same bus event or carries a fallback trauma generator. The production order
already creates and initializes Effects before PlayerCamera.

`node tools/check-camera-shake-r17.mjs` uses the real `EventBus`, `EffectsSystem`,
`PlayerCamera` and `PerspectiveCamera`. One `{ amount: 0.42, duration: 0.4,
freq: 26 }` event produced exactly 0.42 trauma, a 2.5/s decay and 26 Hz frequency,
with zero bus errors. Through the actual final-pose application, its greatest
horizontal centroid displacement over eight 60 Hz samples (133 ms) was 0.1595%
of frame width, below the 4% local threshold. This deterministic class fixture
proves routing and authored amplitude; the integrated capture is still required
to close BM-CAMERA-04.

The existing CI ablation pair also exposed independent reset contamination before
shake could have caused it. At frame 0 its camera positions were
`(0.429, 816.556, 74.273)` and `(0.429, 815.528, 75.654)` while the player poses
matched. Immediately after the same frame-2 teleport, camera X was -3.274 versus
-4.654: `snap()` had retained pitch and FOV transients from the preceding
scenario. It now restores the canonical 14-degree pitch and dynamic camera
transients at respawn/teleport discontinuities.

That source repair is necessary but not sufficient to make the old pair a valid
ablation. Enemy behaviour already differed at frame 7, before lock-on at frame 20
and before the first `camera-shake` event at frame 81. The integrated harness must
also reset or isolate enemy decision state, then demonstrate world-state agreement
before any BM-CAMERA-04 result can be attributed to shake.
