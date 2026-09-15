# Moving native neck and cheek-guard repair — 2026-09-15

## Author, authority and preserved base

- Author: `/root/game2_ultra_art_sound_physics/character_art`, continuing the formally accepted Ultra assignment, without re-delegation. This is source-known production self-review, not blind comparison or an independent acceptance record.
- Worktree: `/workspace/scratch/27301e95ee53/game2-mpfb-pilot`; branch `codex/local-mpfb-head-hands-20260915`.
- Preserved base: `c824c1a61ba3e78c6a7c46d140d2b7ef256288c1`. This repair is a subsequent local delta; the base was not amended. No canonical-worktree, remote, Pages or automation writes.
- The integrator authorized head/neck/guard construction, its finite tests and diagnostic tools, and one surface update immediately after the existing neck rotation. The four textures, readiness, input, sword timing, leg IK and closed-hakama motion remain within their existing contract.
- Deadline remains `2026-09-20T07:51:53Z`. All ten formal comparison elements remain unmeasured. Fixed references, including C06 SEKIRO, remain unchanged. Neither these technical results nor part density establish the requested PS4 visual level.

## Defect and repair

Independent source/geometry review of c824 found that clipping a moving neck only 7 mm below a chest-fixed collar was insufficient. The original rest-pose checks did not test this dynamic connection. With the real animation advanced at 1/60 s, the reviewer's full-rig positive-control fixture found openings in idle .3 / broken .3 / dead .5 / victory 1.45 / stagger .05: respectively **0 / 139 / 84 / 49 / 51** rays out of 3,264 per pose. These are the independent reviewer's baseline results, not a newly repeated author baseline.

The current native head keeps the original MPFB head topology, coordinates, normals and UV source arrays. Its original CC0 game-engine head influences are now included by the derivation script. The lower neck is anchored to the chest; the influence blends continuously to the existing neck rotation above the neckline. The upper head follows the original bone pose. No skeletal joint, authored pose or animation clock was changed. The same 7 mm clipped lower edge is now stationary relative to the collar.

The head is a separately updated mesh beneath the existing neck bone. The local deformation cancels the parent rotation for anchored points and blends the real influence toward the rotating head. It updates the actual position buffer, area-weighted moving-surface normals with fixed-neighbour and original smoothing contributions, deduplicated contact points, bounds and GPU update ranges together. Paused/repeated poses retain their buffers. Legacy geometry has an explicit no-op fallback. Adjacent neck triangles and their normal neighbours occupy contiguous buffer ranges; the player updates 70,524 bytes of position/normal ranges per changing pose. This is a byte count, not measured GPU time.

The collar wrap now uses exactly identical coordinates at both copies of its closing seam. The lining is fitted against the actual native neck across its complete surface, with 4 mm radial clearance, rather than just its upper rim; its narrow inner strip has four rows. Author inspection had found 34 lining/skin edge crossings even at rest with the earlier rim-only fit. The current fit removes the measured crossings through all tested poses. Immutable collar templates are cached and cloned before batching.

The guard's upper side contour now curves forward away from the ears while retaining its lower jaw span and continuous shell. The fitting samples the actual native head at the revised contour. The prior independent report found 28 real edge/head crossings across 6,168 unique guard edges. The withdrawn radial value of 15.5 mm was not a valid penetration depth and is not used here. All 6,168 current unique edges were retested against the actual head with no crossings.

## Current verification

All results below use the final current runtime and derived data, not the earlier intermediate candidates.

| Verification | Result |
| --- | --- |
| Related asset, tailoring, motion, cloth, sculpt, presentation-contract and new neck tests | **58/58 pass**, 77,800 ms |
| Existing actual-terrain regression | **4/4 pass**, 163,676 ms |
| Positive-control full-rig neck rays: four actors × five real animated poses × 3,264 rays | **65,280 rays; zero openings** |
| Actual collar/lining edges against deformed skin, the same 20 poses | **Zero intersections** |
| All actual warden guard unique edges against native head triangles | **6,168 edges; zero intersections** |
| Current head positions, normals, contact points, bounds, pause and fresh retry | Pass |
| Fresh Vite production build | Pass, 4.68 s |
| Native derivation repeated from the same tracked sources | Byte-identical native output |

The neck fixture preserves the independent reviewer's configuration: 64 radial directions at 51 heights, chest-local ray origin `(axis * .2) + (0, -.030 + j * .001 + .315, .010)`, target at the corresponding centre, near 0 / far .2. It uses the entire real rig as the candidate and the unclipped original head at the same neck world transform as the positive control. Every candidate miss is tested against that control. Tested ages are idle .3, broken .3, dead .5, victory 1.45 and stagger .05, advanced through the unchanged real update path at 1/60 s.

The terrain suite includes 1,680 action poses across six discoveries and eight facings, sloped running, steep state blends and parry/block grip checks. Its lowest clearance is `-0.0004444457185170947` m at sun-ring, inside the unchanged `-0.004` m allowance. No clearance, reach or timing threshold was relaxed.

Commands:

```sh
node --test fresh/character-neck.test.mjs fresh/character-assets.test.mjs fresh/character-tailoring.test.mjs fresh/character-motion.test.mjs fresh/character-cloth.test.mjs fresh/character-sculpt.test.mjs fresh/presentation-contract.test.mjs
node --test fresh/character-terrain.test.mjs
npx vite build --config fresh/vite.config.mjs
node fresh/character-tools/derive-mpfb.mjs
```

Source hashes, exact retained-content checks and raw CPU measurements are in [20260915-character-neck-invariants-cpu.json](20260915-character-neck-invariants-cpu.json). Native data: **3,629,987 bytes**, SHA256 `1ba22c09d05f7bfee14766e70a22b90dac3694697f05ed8127252f6abf6c3adc`. The MPFB source geometry and weights retain the CC0 provenance recorded with the original pilot; this is a derivative of acquired assets, not a generated-asset claim.

The original head source arrays, hands, eyes, hair, brows, profile and bounds compare equal to c824 except for the new head influence metadata and repaired guard. The complete sculpt module, input entrypoint, four PNG files and native-material/readiness factory are byte-identical. The complete motion module is identical after removing the new import and single head-surface update call. The 24 existing joints remain.

Build output is `index-CAvyTZ5H.js`, 4,007.79 kB / 1,387.25 kB gzip. The four PNG fingerprints remain `eyebrows-CAObckBg.png`, `brown-eye-DsUMil5J.png`, `short-hair-hshXq62u.png` and `young-asian-male-CWnOsWsU.png`. The integrator must obtain the final combined-build fingerprint and public readback.

## Cost, visual evidence and limits

The local Node comparison uses the exact c824 snapshot, the same actor/input/terrain, 180 frames per case, warmup and three measured runs. Median added CPU per actor/frame is **0.181 ms running**, **0.116 ms attacking**, **0.018 ms falling** (factors 1.159, 1.103 and 1.011). This excludes initial rig creation, texture upload and rendering. It is neither mobile timing nor GPU performance; real CI/browser timing remains necessary.

I viewed the final CPU geometry/texture projections `production-head-shoulders-broken-0.3.png` and `production-head-shoulders-warden.png` produced by the diagnostic scripts. They show a continuous neck/lining connection in the broken pose and the guard contour turning in front of the ear. A thin garment/skin seam, the broad plain shirt and plain guard remain visible. These projections are not native WebGL media. New native stills and motion, including the same animated poses, remain unmeasured and are the next acceptance point with independent review.

The finite rays and edge checks are not universal proof of absence of all openings or triangle/triangle intersections. There is no new blind quality result. The broader costume remains stylized; static facial expression and fixed grasp do not reach shipped-console character production by themselves. The previously reported closed-hakama side-seam normal differences (run14 about 15°, flat death10 138.9°, sun-ring death13 159°) remain explicit visual-review points; this delta does not change cloth geometry or motion to hide them.

The author stops at this verified candidate and local commit as requested. Integration, independent fixture replay, native visual acceptance and publication remain with their assigned owners.
