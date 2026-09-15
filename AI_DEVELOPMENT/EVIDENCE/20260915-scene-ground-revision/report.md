# Scene fracture and ground surface candidate — 2026-09-15

Author: c06_reference_material, existing formally accepted Ultra unit. No redelegation. Known-source technical art production, not an anonymous comparison.

## Scope and source

Base/worktree: `3622a5827fa196e7aeea25c89bfda4fde2dc51bd`, isolated `game2-scene-art` / `codex/local-scene-art-20260915`. Canonical e188 production PNGs from CI 34978382509 — title, encounter, mobile and desktop-right-victory — were all actually opened with view_image before this design. Their exact original paths/hashes are in `input-images.json`.

The encounter PNG shows the previous ridge's high flat end cap, long straight contact edge and broad unbroken soil areas. The shrine and paving remain this candidate's existing construction. This task changes only `fresh/scene-art.js`, a new independent `fresh/scene-surface.js`, the ground color/deposit connection in `fresh/presentation.js`, and this evidence folder. Character, four imported character PNGs, motion, input, collision, routes, sound, terrain elevation, plant beams, leaf clusters and original grass-root placement are outside the changes. Integration with the newer character/vegetation runtime belongs to the integrator.

## Concrete changes

The ridge is rebuilt as four intersecting unequal rock masses, divided into 36 irregular fracture regions. Each region has actual sloping faces, differing levels, recessed joints and variable chipped edges. Both ends emerge from lower material instead of being closed by a tall single cap. Nine foreground fade meshes remain, with existing local opacity/reset behavior. All rock triangles remain within the exact 4.4 × 10 m collision envelope and below its 2.8 m height. A thin conservative 5.5 cm foot still covers the full footprint and is colored toward the adjacent soil; its remaining contact seam needs native inspection.

The first CPU shape pass looked too much like a regularly joined stone shell. It was revised once into unequal masses with larger changes of level and bevel width. `ridge-shape.png` is the resulting actual triangle/color CPU projection with its limitation written on the image. It contains no native game material, shadow or WebGL output and is not PS4-quality evidence.

The new ground helper creates broad dry/damp color changes and a path-distance mask for accumulation. This is authored material variation, not hydrology simulation. Original lanceolate dry-leaf artwork is synchronously rasterized into one 256 × 256 RGBA DataTexture, using asymmetric veins, curled-edge shading and varying size/orientation. A separate accumulation attribute blends that tile into undisturbed shoulders while keeping walked bands clearer. Leaf detail is not added as thousands of scene objects. The tile repeats every 2 m through the existing ground UV scale; the broad mask breaks uniform coverage but does not prove visible repetition has disappeared.

No scan or third-party image/model was used; no reference-game content was copied. The leaf image is original deterministic algorithmic artwork, not an acquired photograph or AI-generated-image claim. No additional HTTP request, TextureLoader, fetch, async loading state or external URL is introduced. It is created before rendering and assigned to the ground shader. Actual GPU upload/compilation remains unmeasured until the next native capture.

## Cost, measured separately from quality

| Initial scene geometry | Base 3622 | Candidate | Delta |
| --- | ---: | ---: | ---: |
| Meshes | 238 | 238 | 0 |
| Vertex instances | 358296 | 359826 | +1530 |
| Triangle instances | 231290 | 231800 | +510 |
| Scene-art meshes | 17 | 17 | 0 |
| Generated RGBA base-level bytes | 1048576 | 1310720 | +262144 |

The soilDeposit Float32 attribute adds 5265 × 4 = **21060 bytes**. The new texture is **262144 bytes** at its base level; a complete RGBA8 mip chain would be **349524 bytes**, excluding driver overhead. The ground shader adds one texture sample per shaded ground fragment and a distinct shader variant. No GPU or browser timing is inferred from these counts.

Full initial presentation CPU construction (Canvas/WebGL stubs), three finite samples per source: baseline **928.862, 699.430, 693.318 ms**, candidate **743.445, 892.167, 703.364 ms**. Medians: **699.430 → 743.445 ms**. Scene-art construction itself: baseline **210.111, 123.834, 119.345 ms**, candidate **181.059, 123.850, 128.014 ms**. Order, JIT and shared CPU load are uncontrolled; these are local generation costs, not hardware performance or evidence of improvement.

The standalone leaf rasterizer took **22.065, 11.577, 10.388 ms** in three calls. All produced exact RGBA SHA-256 `03d6c991fd60335f83772bd56209f79fa1afcd5a42bfa5655aecbda43839edd5`; 30188 / 65536 pixels have nonzero alpha. Its reproduction is the source function `createLitterTexture()`. Static tile/color/deposit previews are CPU diagrams of generated data only.

## Verification and next native checks

- Syntax checks and `git diff --check` passed.
- Production Vite build passed: 29 modules, 661.67 kB JS before gzip. The existing >500 kB bundle warning is preserved in `build.txt`. Source and built-file hashes are in `source-and-build-sha256.json`.
- The measurement script compared actual current geometry with the old 3622 presentation/scene-art module. It reports exact ground-position and vegetation-position equality. It uses actual geometry constructors with Canvas/WebGL stubs, not a rendered-device substitute.
- Existing collision-envelope coverage, clear walking corridor, historic anatomy ray, positive actual triangle fade, retry reset, route movement and terrain tests are retained. **Final 28 tests passed, zero failures**, across scene-art, foreground visibility, route layout, terrain, terrain-contact bounds and character-terrain checks. The run took 138994 ms; its existing exhaustive character-terrain cases account for most of that duration. Full original output is `related-tests.txt`. No tests were weakened or changed.
- No native WebGL image, GPU shader compilation, real image upload, browser timing, audio review, PS4 appearance acceptance or fixed-reference verdict is claimed. The ten comparison statuses and fixed deadline 2026-09-20T07:51:53Z remain unchanged.

Next capture should use the integrated source's ordinary title / first encounter / mobile / right victory views, plus the already-required route and motion sightlines. Inspect rock seams and silhouette, front/rear contact with the earth, leaf scale/repetition and foot visibility. Preserve complete GL errors and runtime timing failures. This candidate is finite; no further decorations were added while awaiting those native images.

## Evidence reproduction

`node AI_DEVELOPMENT/EVIDENCE/20260915-scene-ground-revision/measure.mjs` regenerates counts and exact ridge surface arrays from old 3622 and the current candidate. `python AI_DEVELOPMENT/EVIDENCE/20260915-scene-ground-revision/render-shape.py` makes the explicitly labeled CPU triangle preview. `measurements.json`, `surface-generation.json`, `source-and-build-sha256.json`, `build.txt` and final test log are the primary original measurements; the static PNGs are limited inspection aids. Old untracked files in `20260915-scene-art` were left untouched and are not the final evidence for this revision.

Commands run for the final candidate:

```sh
node --check fresh/scene-art.js
node --check fresh/scene-surface.js
node --check fresh/presentation.js
node --test fresh/scene-art.test.mjs fresh/foreground-visibility.test.mjs fresh/terrain.test.mjs fresh/terrain-contact-bound.test.mjs fresh/character-terrain.test.mjs fresh/route-layout.test.mjs
npx vite build --config fresh/vite.config.mjs
git diff --check
```

## Author correction: root contact was not established at 613efa

The independent reviewer and my subsequent reproduction confirmed that all 2934 ridge vertices at 613efa were above Y=0, with the lowest at +0.0549999997 m. The soil-colored footprint and all cell bases began at +.055 m without connecting side geometry. My prior soil-contact/burial description was incorrect; the vertical coverage tests and this CPU shape preview could not detect the lateral air gap. The 28 tests/build above remain historical results with that limitation. The following isolated repair extends all cell roots to -.08 m and closes each footprint strip's sides/bottom; see `../20260915-ridge-ground-contact/report.md` and its original positive/negative ray evidence. No native shadow/appearance acceptance is implied by the repair.
