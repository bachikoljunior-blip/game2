# Inclined bamboo crown — source-known native symptom and finite repair

Author: `/root/game2_ultra_art_sound_physics/vegetation_physics`, existing formally accepted Ultra vegetation assignee. Parent authorized this finite repair after native candidate `906852`; no re-delegation or remote write. Work is in `codex/local-foliage-canopy-906`, based on preserved `57a2d750a003c593e00429279da9ea348e581732`. The previous local branch retains that frozen commit.

## Native evidence actually seen

- Viewed the original 960×720 baseline/candidate `full.png` from run `34988388499` and candidate normal gameplay PNG from `34988388555`, using `view_image`. Same-camera baseline has readable green feather-like groups; candidate is dominated by bare culms and short dark marks. Successful mip arithmetic and GL error zero did not establish visual recovery.
- Viewed original candidate bamboo `0000/0132`, maple `0000`, and maple-leaf `0000`. The bamboo sprays remain thin and horizontal even in the whole-plant inspection. Maple's close view has broad, sharp leaves, while its whole-tree crown is sparse in the image; this bamboo change does not close the maple issue.
- Fully decoded the candidate bamboo MP4 (144 frames, 12 seconds, no ffmpeg decode errors), and extracted/viewed native frames 36, 72 and 108 in addition to the two endpoints. Roots stay in the same ground region and thin branches/sprays shift slightly; the small leaf image does not permit confident visual separation of individual leaf flutter from twig motion. This is five sampled frames, not a claim that all 144 frames were visually reviewed. No source-blind comparison occurred.
- Parent reports native combined render/readback time baseline about 705 ms versus candidate 1213 ms, with diagnostic no-shadow/no-leaves about 1100/977 ms. These include synchronization/readback and are not pure GPU times. The present candidate has not undergone that native test.

## Cause and chosen finite repair

The old three spray templates all lay approximately horizontally. Exact production-camera projection `[0.85,2.8,23.8]` shows a median height of 1.145 pixels among fully onscreen crowns. Half of these twigs returned to all 36 real leaves because the grazing-view LOD condition fired, spending vertices on surfaces that still appeared as lines.

Rotate each complete spray by a fixed roll around its existing twig axis: template values −1.10, +1.24 and −1.35 radians. Existing world branch azimuths provide additional direction diversity. This changes neither camera nor a camera-facing billboard. The leaf surfaces, their petiole metadata, two short side shoots, and already baked frond receive the identical rigid transform. The main twig stays on its original axis; its root/end, parent beams and support count stay fixed. The atlas is baked before this common rigid rotation, so every mip byte is unchanged. Visible and depth shaders, normal transport, alpha/fade rules and CPU deformation remain shared and unchanged.

Mass, stiffness, damping, shelter `.65` and vertical-eddy `.03` coefficients are unchanged. Recompute actual projected leaf-union drag area after inclination. Initial moderate inclination sets failed the existing short-member strain limit (`.21574%` and `.26837%`, limit `.2%`); these were rejected, not counted as passes. The final steeper spread has maximum 20-second short-member strain `.156743%`, root drift `0`, and unchanged total added lamina mass `3.1595769577481696 kg` across 150 culms. Its stronger exposure changes the bamboo modal displacement; no amplitude-identity claim is made.

## Source/numeric verification

Full results: `20260915-inclined-canopy-counts.json`.

| Same camera and world | Old → new median spray height | Old → new median quad area | Old → new active bamboo triangles |
|---|---:|---:|---:|
| Native arrival | 1.145 → 8.466 px | 6.300 → 38.971 px² | 134,850 → 99,600 |
| Arrival, orbit −.65 | 1.050 → 8.202 px | 5.967 → 33.613 px² | 127,100 → 90,600 |
| Arrival, orbit +.65 | 1.471 → 9.619 px | 8.986 → 47.454 px² | 122,350 → 89,350 |
| Historical water position | 1.860 → 12.321 px | 14.678 → 69.502 px² | 151,100 → 92,350 |

Quad area is the geometric card area before alpha coverage/shading; it is not visible green pixel area. At arrival, selected far representations change from 167/329 to 301/328 fully onscreen twig crowns. The normal index buffer/draw range contains exactly the selected near/far faces. A finite ordinary-camera woody-ray probe (three alpha-covered samples on each of the nearest 20 crowns) gives old self/other/all `3/1/4`, new `2/2/4` of 60. Thus these samples do not support wholesale self-occlusion as the principal loss; they do not certify complete leaf/terrain/building visibility.

Stored vegetation remains 440,338 vertices, 408,812 triangles and 112 batches; bamboo remains 32,400 leaves / 900 twig supports, total support count 2,317. Grass matrix, original woody mode dimensions/rest transforms/mass/stiffness/damping, and all seven colour mip hashes compare equal. No drawables or shader texture samples were added. CPU update-only median samples are arrival 3.99→4.18 ms, left 4.03→3.94, right 4.76→4.16, water 6.54→5.10; these stub-renderer values neither explain nor establish native performance.

- Final related tests: **21 passed, 0 failed**, 21.046 s (`canopy-projection`, `foliage-lod`, `leaf-surface`, `foreground-visibility`, `frond-fade`, `frond-mip`). Includes actual animated positive/negative leaf rays, attachment tests, unchanged inspection-camera fixtures and alpha/mip checks.
- The historical water fixture's old required-positive intersection failed after the actual side shoots tilted away. It now explicitly verifies the negative result against fully deformed nearby geometry in all 13 wind phases. Separate moving-triangle tests retain positive rays; opacity/ray thresholds are unchanged. The old horizontal-only projected-area bound `.3 × lamina area` was replaced by the eight-azimuth geometric upper bound `.66`; the dynamic `.2%` strain gate was retained.
- Fresh Vite build passed in 1.75 s, output only in task scratch. An initial command named nonexistent `fresh/vite.config.js`, failed before build, and was corrected to the repository's `fresh/vite.config.mjs`. Syntax and diff whitespace checks passed.

## Remaining native questions

The steeper sprays may still be too sparse, dark, or repetitive; some remain edge-on from particular viewpoints. The fixed planes may show a near/far transition, and wider coverage may cost additional raster work despite lower submitted triangle counts. Native normal/inspection frames and matched render/readback tests must decide these points. This repair is not visual completion, PS4-quality acceptance, a blind comparison, or closure of any fixed comparison element.
