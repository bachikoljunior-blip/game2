# 2026-09-15 — conservative terrain contact acceleration

Performing agent: `/root/game2_ultra_art_sound_physics/sound_revision`.
Own finite task completed: `2026-09-15T12:24:21Z`.
New finite role accepted from `/root/game2_ultra_art_sound_physics`: terrain and
fallen-character contact CPU repair after completing the separate sound task.
This is my own acceptance/result record. The parent states that this reuses my
previously accepted formal Ultra/none assignment after a new-agent thread limit;
I did not delegate or manufacture another spawn receipt. Hidden backend strength
is not independently asserted here. My completed sound files remain unchanged
by this new role.

Repository / branch: `bachikoljunior-blip/game2`,
`codex/game2-rebuild-20260913`. Canonical starting SHA supplied by the integrator:
`b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`. This bounded repair uses the current
shared worktree's newly generated **48,516-triangle / 144,748-position-entry**
player figure. It does not reduce, reshape or replace that figure.

The independent runtime reviewer reported that the new geometry increased
fallen-character exact height lookups from 402,808 to 1,693,906 in its 90-frame
sun-ring probe. These are its preceding observations, not my own old/new-geometry
benchmark. My paired test below instead holds the **same current geometry**
constant and compares the preserved old contact path against the new acceleration.

## Implementation and conservativeness

`fresh/terrain.js` adds `maximumGroundInRect(minX,minZ,maxX,maxZ)` and exposes
it as `groundHeightAt.maximumInRect`. Its domain clamp is identical to the
existing height field, including the final-cell `1e-9` grid-coordinate clamp.
Reversed endpoints, degenerate rectangles, negative coordinates and out-of-domain
rectangles are supported. NaN input returns Infinity, preventing unsafe rejection.

For every grid cell intersected by the clamped rectangle, the maximum considers
the four clipped rectangle corners and every intersection of the cell's
`u+v=1` triangle diagonal with its edges. Each clipped triangle is affine, so its
maximum occurs at one of these polygon vertices. This includes terrain peaks
along an interior grid line/diagonal; it does not assume that sparse surrounding
samples or only the overall rectangle corners provide a safe upper bound.
Tiny outward floating-point rounding makes the bound more conservative.

Terrain vertices used by the bound are cached lazily in 5,265 float64 slots
(42,120 bytes). The original `terrainVertexHeight` and `groundHeightAt`
calculations and returned geometry heights are unchanged.

The only `fresh/character-motion.js` edit is inside `groundPenetration`:
after the existing five height queries that establish its local plane, it
computes both the exact terrain rectangle maximum and the maximum of that
existing fitted plane at the bounding-box corners. It uses the larger value.
This preserves the old locally planar approximation, including its seam-test
tolerance, rather than assuming that an exact terrain bound necessarily also
bounds that approximation. A mesh is skipped only if neither possible surface
can exceed the penetration already found, using its unchanged world AABB minimum
y and outward rounding. Otherwise the entire original planarity test and exact
contact-vertex loop run unchanged. Providers without the optional bound property
follow the old path.

No contact vertex was removed or coarsened. Shape, shadow, IK, animation,
contact/clearance thresholds, authored poses, movement, input and terrain geometry
were not changed. I performed no stage, commit, remote, main, publication or
automation write, and did not touch the historical untracked
`AI_DEVELOPMENT/EVIDENCE/fresh-20260913/` tree.

## Paired verification

`fresh/terrain-contact-bound.test.mjs` passed **3 / 3** tests:

1. An independent Sutherland–Hodgman triangle/rectangle clipping oracle agrees
   with the bound for 92 rectangles, including full-domain, boundary, diagonal,
   thin/point/line, reversed, negative and clamped/outside cases. Tightness is
   within `1e-10` metres and conservativeness within floating-point tolerance.
2. At `(30,10)`, yaw `3π/4`, the same generated resources and two separate rigs
   run **90 dead + 90 broken + 90 dodge frames**. Each frame's complete reported
   contact/pose metrics and **every node's matrixWorld** are `deepEqual` between
   the old path and bounded path. All 270 frames match exactly.
3. Generic flat and planar providers without the optional property retain the
   previous fallback and finite contact results.

The paired test uses the same modified module for both branches: the reference
wrapper exposes only `heightAt`; the accelerated wrapper also exposes
`maximumInRect`. The source diff confirms that omitting the new optional branch
leaves the original `groundPenetration` implementation unchanged. This avoids
mixing an older, lower-detail figure into the control.

| State, 90 frames | Old heightAt calls | New heightAt calls | Reduction | Bound calls |
|---|---:|---:|---:|---:|
| Dead | 1,702,902 | 222,017 | 86.96% | 5,400 |
| Broken | 233,640 | 6,840 | 97.07% | 360 |
| Dodge | 233,640 | 6,840 | 97.07% | 360 |

**Counting scope:** these counts include calls through the counted heightAt
wrappers throughout `updateCharacterRig`. They do **not** include the
`terrainVertexHeight` calculations inside `maximumInRect`, cached bound vertex
reads, polygon extrema calculations or other math. They are not total CPU
operation counts.

**Timing scope:** timers wrap each complete `updateCharacterRig` call and thus
include bound lookup, vertex-cache work, contact geometry and all other pose
updates. Resource/rig construction and the subsequent equality assertions are
outside the timed region. Both sides run the same 90-frame protocol in one Node
process; these are Node CPU diagnostics, not WebGL, mobile-device or frame-rate
measurements.

| State | Initial test, old → new ms/frame | New-process cold-start test, old → new ms/frame |
|---|---:|---:|
| Dead | 9.595 → 1.721 | 7.461 → 1.312 |
| Broken | 1.035 → 0.144 | 1.378 → 0.193 |
| Dodge | 1.197 → 0.161 | 0.998 → 0.148 |

The initial 3-test run executed the clipping oracle first, warming the bound
cache; its timings are explicitly **warm-cache**. I corrected an intermediate
message that had included initial cache creation in that description. To resolve
the distinction, a new Node process ran only the paired contact test:

```sh
node --test --test-name-pattern='bound preserves each' fresh/terrain-contact-bound.test.mjs
```

That second process begins with an unpopulated bound cache. Its dead sequence
includes initial cache fills; subsequent states naturally reuse entries. It again
passed all 270 metric/matrix equality comparisons and reproduced identical
heightAt call counts. Timing variation between the two processes is retained,
not replaced with a single favorable device-performance claim. The cold-start
pair process ran while the separate existing character/terrain suite was active
in this shared environment; the integrator also began its final suite. These
timings therefore include shared-host contention and are not isolated hardware
benchmarks. The deterministic query-count and exact-pose results do not depend
on those wall-time fluctuations.

## Source identity and evidence

Runtime froze before independent review; only this evidence record was then
completed. SHA-256 identities:

| File / condition | SHA-256 |
|---|---|
| Original `fresh/terrain.js` at b06ade1 | `b4d4205283407d0f1ee1188f514abbb60cf4c02ff2f71ee22aa7c3c5ff7f694c` |
| Revised `fresh/terrain.js` | `8d33d411734ca5cc7a46d15dd63057856acca8df0bb3ba9634da49fd41a0fdb2` |
| Original `fresh/character-motion.js` at b06ade1 | `a476a5c666126de69a8326abc837bb04f85a7aedfb53df649fe33af1b0f13681` |
| Revised `fresh/character-motion.js` | `bf2b523fe34c33df5af25bc7deb9864393b5caabe831996ff3796de10fda0a7b` |
| Same figure `fresh/character-rig.js` in both measured paths | `b8f7834be99c52a458b07f331eda8d69d139694fd3292c44405631e644ed884a` |
| Same figure `fresh/character-sculpt.js` in both measured paths | `222943987838efe77b90fce511833005b8dbc0b59e138ec0b002239c4d5a16aa` |
| `fresh/terrain-contact-bound.test.mjs` | `a423300963fd7f43a33fe916bfc5a22e407272455ace90350379ef80e25edcf8` |

Actual logs are in the new scratch directory
`/workspace/scratch/27301e95ee53/terrain-contact-20260915/`:
`bound-test.tap`, `cold-pair-test.tap`, and the separately run existing
`character-regression.tap`.

The separately run existing
`node --test fresh/character-motion.test.mjs fresh/character-terrain.test.mjs`
finished **24 / 24 PASS**, exit 0, in 129.97 seconds. It covered 1,680 sampled
action poses over all six discoveries/eight facings, slope running, sun-ring
state blending, defense contact and the existing character-motion assertions.
The lowest reported discovery pose clearance was −0.00044445 m at sun-ring,
inside the unchanged existing clearance criterion. My test process had already
finished when the integrator requested stopping any duplicate still-running
suite; exit 0 was collected, and no process remains active from this task.
The integrator retains ownership of the final full-suite/build/CI gate against
its complete frozen runtime.

The independent runtime reviewer separately reports checking the frozen hashes,
reproducing the 3 tests/270 exact frame comparisons, and finding no under-bound
among 55,419 independently sampled boundary/degenerate/tiny-rectangle points.
Its own evidence and acceptance belong to that reviewer; this paragraph is an
attributed handoff, not my independent-review result.

This correction closes a measured Node CPU regression mechanism while preserving
the same poses. Actual rendered performance remains for integration validation.
All 10 formal source-concealed concept comparisons stay **not measured** and the
deadline remains **2026-09-20T07:51:53Z**.
