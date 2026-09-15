# Character MPFB pilot — author record

Author: `/root/game2_ultra_art_sound_physics/character_art`, continuing the formally
accepted Ultra assignment, without re-delegation. This is source-known production
self-review, not blind review and not the integrator's acceptance record.

Base: `acf0f9ec86996245ad712d6adc72e5d6159f6711`. Authorized isolated worktree:
`/workspace/scratch/27301e95ee53/game2-mpfb-pilot`, branch
`codex/local-mpfb-head-hands-20260915`. Shared runtime and remotes were not edited.
The ten comparison elements remain **not measured** and the fixed deadline remains
`2026-09-20T07:51:53Z`.

## Actual work

The previous author-created continuous-section face improved on the rejected
sphere assembly, but actual CI images still showed mannequin anatomy and poor
neck/shoulder/wrist joins. The acquired MPFB native head/shoulder preview and the
official skin/hair thumbnails were read as actual asset evidence. Their contents
were not mistaken for an in-game candidate capture.

The authorized method change uses actual CC0 hm08 anatomy, four real PNGs, native
eye/hair/brow fitting data, actual game_engine joint definitions/weights, and CC0
male/age/chin/cheek targets. Asset identities, source SHA-256s and original license
statements are preserved in `fresh/character-assets/`. Full-body 53-bone replacement
was excluded. The neutral base was morphed before extraction; all 19,158 source
indices remained available for fitting helpers. Native head/neck and posed hands
then attach to the existing joints. No reference-game creative content or MPFB
program source was copied.

The imported anatomy exposed an existing anatomical error: the old IK placed a
biological wrist at the centre of the handle. The integrator specifically expanded
the isolated scope to allow the arm-target correction in `character-motion.js`.
The native wrist-to-grip offset is rotated into the existing sword pose and
subtracted only in proportion to grasp. Free left wrists, scabbard support and
released hands are not shifted by a grasp offset. Old rigs retain zero-offset
behavior. Sword trajectory, blade dimensions, handle targets, leg IK, knee bends,
state timing and terrain thresholds were not changed.

An initial fixed-angle finger bake visibly penetrated the handle in the actual
derived-geometry CPU projection. I replaced it with circle/sphere intersections
that preserve each phalanx length and follow the existing handle's exterior.
Residual LBS flesh penetration receives a static unilateral contact projection.
The maximum source-point correction is 9.282 mm (210 affected weighted source
points per side, including non-rendered helpers); this is an explicit approximation,
not a measured soft-tissue simulation. The finished static grasp remains visible
in the CPU projection on both sides of the hilt. The native UVs preserve palm,
nail and knuckle differences within one surface.

The first native face projection revealed missing brows and overly amber irises.
The official eyebrow001 asset was acquired and verified by the independent asset
supplier and fitted using its real source data. An iris-only vertex tint reduces
the source eye texture's amber saturation without recoloring the sclera or editing
the original PNG. The native head extraction edge is hidden by a garment collar
derived from the same surface and extended down into the shirt after the first
CPU production-pose projection exposed a floating band.

Runtime loading now explicitly handles imported art. All four texture decodes
must complete before rendering or starting. One failed asset rejects readiness,
keeps Start disabled and shows a failure message. Context restoration respects
that gate. Node-only tests identify their asset state as `geometry-only`.

## Verification at the preservation checkpoint

- Derived geometry rebuild succeeded and emitted a source/data SHA report. All
  native geometry contains finite positions/normals and valid UV-split indices.
- 48/48 native anatomy, original motion, legacy sculpt and presentation tests
  passed. The five new tests cover actual native eye openings with FrontSide rays,
  source helper exclusion, connected finger bone lengths/solid-hilt clearance,
  world-space native grasp centres through turns/actions, unchanged free-wrist
  behavior/old-rig fallback, and all-texture readiness/failure. The old procedural
  eyelid/nostril tests do **not** certify the new native face and are counted only
  as legacy utility regressions.
- The candidate before the final collar hem extension passed all four existing
  terrain tests: 1,680 sampled action/facing/location poses, sloped running, state
  transitions and parry/block. Lowest measured clearance was -0.444 mm on the
  existing sun-ring surface, inside the unchanged -4 mm allowance. This run took
  138.784 seconds locally. The subsequent collar extension is excluded from that
  exact-geometry result and receives current integration terrain testing.
- Fresh Vite production build succeeded. Actual PNG outputs were
  `eyebrows-CAObckBg.png` (89,619 B), `brown-eye-DsUMil5J.png` (610,817 B),
  `short-hair-hshXq62u.png` (2,308,132 B), and
  `young-asian-male-CWnOsWsU.png` (3,593,099 B). Application JS contains the imported
  data and is about 3.81 MB / 1.34 MB gzip in this local build. The final integration
  fingerprint must be regenerated after the final source merge.
- Ten scratch CPU fitting/production-pose views were generated from actual
  geometry/UVs and viewed by me. They are explicitly **not WebGL**, omit important
  rendering behavior, and are not staged. The provenance-producing diagnostic
  scripts are retained. The new candidate's actual CI stills, normal gameplay,
  smartphone timing and loading failure browser behavior remain unmeasured here.

## Limits and next work

This is a concrete method-change pilot, not PS4 attainment. Existing broad rigid
shirt/shoulder forms, plated garment appearance, fixed neutral face, small facial
differences despite shape targets, the original knot added to a short-hair sample,
and static grasp during hand release still need work. The old fixed handle spacing
and unusually broad handle cross-section constrain natural two-hand placement.
The original arm and leg behavior was preserved rather than claiming those
constraints solved. Four shared imported PNGs also add real startup and GPU memory
cost; the browser and smartphone-oriented CI must measure it without weakened gates.

The integrator additionally identified actual acf video defects in running and
fallen hakama. That clothing repair is a separately authorized next finite step:
first preserve this CC0 checkpoint, then inspect the specified original frames and
design actual thigh/knee-following surface deformation, retaining leg/contact/
weapon invariants. It is not silently folded into the native-anatomy result.
