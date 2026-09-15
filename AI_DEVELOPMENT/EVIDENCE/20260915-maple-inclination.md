# Maple petiole inclination — finite follow-up to native 906

Author: `/root/game2_ultra_art_sound_physics/vegetation_physics`, existing accepted Ultra vegetation assignee. Parent authorized checking the common leaf-orientation cause and a separate fixed-orientation correction after preserving bamboo commit `ef36bc10a117a6e193b9bf59d0c271dd43289df4`. No re-delegation or remote operation.

## Native finding and source diagnosis

I viewed the original `34988388555` whole-maple `0000.png` and maple-leaf `0000.png` using `view_image`. Whole-tree leaves appear as narrow dark fragments along conspicuous branches, whereas the close overhead view shows broad sharp laminae. The parent separately supplied the independent reviewer's full decode/sample-frame findings; I do not claim to have visually reviewed all of those frames myself.

The existing roll distribution confines the leaves near one horizontal band. On the same whole-tree native camera, actual CPU-deformed triangles at wind time 8 give median surface-facing factor `.1364`, with 310 of all 972 visible leaves below `.1`. Median near-surface projected area is `4.006 px²`. In the original close camera the factor is `.8367` and the area `608.36 px²`. The report's `.0187` is the inspection helper's single representative twig normal; it is not the measured distribution of all leaf normals.

## Change and preserved scope

Broaden the fixed petiole-roll distribution using the existing per-twig phase and tilt, with a different static phase for each pair/side. The variation is evaluated once at scene creation; it is not a new time-varying sine. Rotate each leaf about its unchanged petiole attachment. Shape, width/length, leaf count, topology, materials, wind coefficients, stiffness/damping, main/branch/twig geometry and cameras stay unchanged. The existing visible/depth/CPU leaf deformation uses the resulting correctly transformed pivot, hinge axis and normals.

All beam records compare hash-identical to `ef36bc1`, as do woody vertex positions/support IDs, maple petiole pivots/support IDs, grass matrices and maple colour texture bytes. Maple remains 3,888 leaves. Stored vegetation remains 440,338 vertices, 408,812 triangles and 112 batches. Maple continues to use its pre-existing effective canopy drag areas; this change does not introduce a direction-dependent aerodynamic solver or claim exact botanical forces.

## Numeric checks, distinct from native appearance

Raw results: `20260915-maple-inclination-counts.json`. The same original cameras and near triangles are used before/after; area is unshaded geometric projection, not visible foliage pixels.

| Camera | Median projected area, old → new | Median facing factor, old → new | Leaves below .1 facing, old → new |
|---|---:|---:|---:|
| Original whole tree | 4.006 → 9.436 px² | .1364 → .3529 | 310 → 124 / 972 |
| Original close | 608.36 → 556.46 px² | .8367 → .7335 | 0 → 8 / 150 fully visible |
| Opposite whole tree | 10.093 → 10.312 px² | .3651 → .3742 | 45 → 96 / 972 |

The spread improves the original whole-tree footprint and retains broad close leaves, but some leaves become more edge-on in the other views. This is a fixed three-dimensional distribution, not optimization of every leaf toward one camera. Submitted maple triangle counts are unchanged in these views: 67,104 / 69,984 / 69,984. Shading/overlap can still change raster cost; no GPU speedup is claimed.

- Related regression run: 18 of 19 passed in 19.973 s. The sole failure was a new exact-mass assertion's arithmetic grouping (`mass * length / nominalLength` differed by one floating-point rounding bit from `mass * (length / nominalLength)`). Corrected that expectation to the actual documented ratio calculation; the one new test then passed in 5.326 s. No production change followed the regression run. Thus all 19 related cases were validated, with the separate rerun explicitly recorded.
- Existing moving-leaf positive/negative rays, petiole connections, 20-second bamboo strain, fixed inspection cameras, grass/root constraints and bamboo projection tests passed. No visibility threshold or fixture was changed in this follow-up.
- Fresh build passed in 1.63 s; output stayed in task scratch. Syntax and diff whitespace checks passed.

## Not yet verified

The new maple orientation has no native render yet. Crown density, dark versus lit surfaces, repeated sharp leaf outlines, wind readability, self-shadowing and actual frame cost remain media questions. This does not establish naturalness, PS4-level quality, a source-blind comparison, or completion of a fixed comparison element.
