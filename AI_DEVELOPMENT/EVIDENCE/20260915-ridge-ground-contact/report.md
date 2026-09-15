# Ridge root-contact repair after 613efa — 2026-09-15

Author: c06_reference_material, existing accepted Ultra unit; no delegation or remote write. This is a bounded technical repair on isolated `game2-scene-art`, directly after `613efa56fa3d2f43314212c21935c8f01ee4e914`.

## Correction by the author

The independent runtime reviewer correctly found that **every lowest ridge vertex in 613efa was 5.5 cm above the exact ground at Y=0**. I reproduced minimum clearance **+0.054999999701976776 m** across all nine meshes / 2934 vertices / 978 triangles. The earlier 3622 minimum was **-0.1599999964237213 m**. My code/commentary described soil contact or burial without testing horizontal contact. That description was wrong: soil-colored vertex blending does not connect geometry, and the previous vertical coverage test could pass a floating surface. The earlier 28 tests and build did not establish root contact. They remain historical results, not a reason to dismiss this defect.

## Exact repair

Every fracture cell's lowest ring now extends to **Y=-.08 m**. Each of the nine conservative footprint strips retains its prior top at **Y=.055 m**, but now includes its four side faces and a bottom at **Y=-.08 m**. Thus both long sides and both ends continue through the true Y=0 ground. Upper shape, material/texture pipeline, nine independently fading meshes and collision footprint are retained. No additional decoration, new texture or presentation connection was changed in this repair.

Current ridge: **9 meshes / 3204 vertices / 1068 triangles**. Increment from 613efa: **0 meshes / 270 vertices / 90 triangles**. All nine meshes have minimum actual terrain difference **-0.07999999821186066 m**. The sorted multiset hash of every vertex with Y >= .059 m is unchanged between 613efa and the repair (`382fec2f0feb2bc3ab1fb6219ece113d7bbe32d851c056d16fd60f1c133b30f7`); this proves those upper vertex positions stayed fixed, not a claim about unchanged lower-face normals or native shadows.

## Reproduced positive and negative controls

All rays originate at `(-3, y, -9.25)`, point `(1,0,0)`, near 0, far 6 m unless otherwise stated.

| Y | Old 3622, DoubleSide | 613efa, DoubleSide | Repaired, DoubleSide | Repaired production FrontSide |
| --- | ---: | ---: | ---: | ---: |
| .025 | 2 | 0 | 10 | 5 |
| .054 | 2 | 0 | 10 | 5 |
| .056 | 2 | 8 | 8 | 4 |

The DoubleSide control reproduces the independent review's exact fixture; the production FrontSide runs separately avoid hiding a face-winding defect. Reverse rays from X=+3 at Y=0/.025/.054 also hit (five each), and at Y=.056 hit four times. Low rays toward both short ends hit (12 front / 10 back within their 6 m range). Negative FrontSide controls below the buried base at Y=-.09, above the ridge at Y=3, and outside front/back Z boundaries all return zero. Extra hits count internal cell/strip surfaces; they are not separate objects or a visual-quality measure.

A regression test was added to `fresh/scene-art.test.mjs` for all-nine-section ground penetration, the low side/end positives and below/above/outside negatives. Existing envelope, playable corridor, historic anatomy ray, actual-triangle fading and restoration checks were retained. Final related run: **22 tests passed, zero failures**. The production Vite build passed, preserving its existing bundle-size warning. Original output: `related-tests.txt` and `build.txt`; exact source/build bytes: `source-and-build-sha256.json`.

`verify-contact.mjs` loads each revision's actual scene-art source and creates actual Three.js geometry. It records complete per-mesh clearances, production-ray controls, independent DoubleSide controls, geometry counts, upper-position identity and local CPU construction duration. These are Node geometry/CPU measurements, **not native WebGL rendering or physical-device performance**. The previous soil/leaf material and terrain/source positions were not edited by this repair.

## Native work still required

Ground penetration and lateral face closure are now established geometrically. Native root lighting/shadows and the remaining low footprint edge still require the integrator's ordinary low-angle/front/back and encounter/mobile captures. No PS4 appearance, GPU performance or fixed-reference acceptance is claimed. The ten fixed comparison statuses and deadline 2026-09-20T07:51:53Z remain unchanged. No further decoration is proposed in this repair.

Reproduce:

```sh
node AI_DEVELOPMENT/EVIDENCE/20260915-ridge-ground-contact/verify-contact.mjs
node --test fresh/scene-art.test.mjs fresh/foreground-visibility.test.mjs fresh/terrain.test.mjs fresh/route-layout.test.mjs
npx vite build --config fresh/vite.config.mjs
```
