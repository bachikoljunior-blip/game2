# Character draw census and exact static indexing — 2026-09-15

## Authorship and scope

Author: `/root/game2_ultra_art_sound_physics/character_art`, continuing the accepted Ultra assignment. No re-delegation or remote writes. This is source-known production analysis, not blind evaluation. Source base is `4fa13484c88dfa3d572c189e3a8999e8f254e70e`; the isolated branch is `codex/local-character-static-index-20260915` in `/workspace/scratch/27301e95ee53/game2-character-index`.

The integrator first requested a read-only, finite cost diagnosis and then authorized only exact indexing of immutable character batches. The runtime delta is one new helper and two added lines in the rig factory. No runtime geometry shape, triangle, material, draw call, animation, camera, texture or threshold was changed. The original source checkpoint is preserved. The deadline remains `2026-09-20T07:51:53Z`; all ten formal comparison elements remain unmeasured. The requested PS4 visual target and fixed references remain unchanged.

## Source-derived draw census

[Full census](20260915-character-render-cost-census.json) contains every mesh and each actor's ten largest meshes, with materials, triangle/vertex counts, visibility flags, main/shadow frustum membership, source-camera distances and projected bounds. This is Node geometry analysis without rendering or environment occlusion queries. Counts describe eligible submissions, not observed renderer statistics or a GPU-time estimate.

| Actor | Total triangles | Total meshes | Initial camera submissions | Initial shadow submissions |
| --- | ---: | ---: | ---: | ---: |
| Player | 53,748 | 57 | 55 | 53 |
| Sentinel | 54,940 | 57 | 55 | 53 |
| Retainer | 54,940 | 57 | 55 | 53 |
| Warden | 61,396 | 59 | 57 | 55 |

The warden exceeds the preliminary 53–55k estimate because its helmet/guard and extra shoulder rows add geometry. Hidden lock/signal meshes remain in the total metric. The initial source camera gives 222 eligible colour submissions and 214 sun-shadow submissions across all four actors, with 223,712 and 222,864 triangles respectively. Actual occlusion, fragment cost and driver work were not measured.

The principal mesh sizes are:

| Mesh | Player triangles | Sentinel / retainer triangles | Warden triangles |
| --- | ---: | ---: | ---: |
| Continuous head/neck | 8,770 | 8,770 | 8,770 |
| Helmet and guard, same material/bone | absent | absent | 5,120 |
| Left hand | 3,308 | 3,308 | 3,308 |
| Right hand | 3,308 | 3,308 | 3,308 |
| Torso outer cloth and collar | 2,656 | 2,656 | 2,656 |
| Each forearm cloth batch | 2,020 | 2,020 | 2,020 |
| Each shoulder armour batch | 1,192 | 1,788 | 2,384 |
| Each upper sleeve | 1,728 | 1,728 | 1,728 |
| Each tabi/ankle cloth batch | 1,468 | 1,468 | 1,468 |

The JSON retains the separate left/right entries and exact ranked top ten for all four actors. The table combines symmetric entries for readability.

At the initial source camera, body-centre distances are 6.16 / 22.89 / 33.08 / 39.90 m. The head/neck bounding boxes project to approximately 43.9 / 10.9 / 7.5 / 6.3 pixels at a 720-pixel raster height and the actual 52° field of view. All four remain in both frusta at full geometry density. In the synthetic close-lock source layout (player z=3.2, sentinel z=1), the landscape camera puts their heads at 48.0 / 36.1 pixels; distant retainer/warden heads remain 19.3 / 11.3 pixels. These are source-camera projections, not native-image visibility measurements. The portrait close-lock frame culls the retainer from the main pass while its shadow remains eligible. There is no actor distance LOD or environment occlusion gate in the current presentation loop.

## Decisions from the census

1. **Exact static indexing is the concrete low-risk waste removal implemented here.** The existing rig merges same-bone/same-material details but converts every batch to nonindexed geometry. Identical attribute tuples are repeated for neighbouring triangles. Indexing these exact tuples reduces storage and permits post-transform vertex reuse without changing any surface or triangle ordering. Near and far representations remain identical.
2. **Distance LOD is a later visual candidate, not part of this delta.** The head plus hands account for 15,386 triangles per actor even when the entire distant head occupies 6–11 pixels. An illustrative 25% geometry budget for those parts would remove about 11.5k triangles per distant actor, but that is arithmetic, not a achieved visual or timing result. Any future LOD should leave close characters and the current lock target untouched, use projected size and transition hysteresis, preserve the collar deformation boundary and grip silhouette, and receive both native close/normal-distance and shadow review.
3. **No further simple same-material merge is demonstrated.** Existing rigid batches are already merged per bone/material. Combining hands, arms or actors requires instance/skin transforms and changes culling, contact or ownership of rendered meshes. Combining palette/material variants also requires preserving roughness, maps and sidedness. These are broader changes than this repair.
4. **Concealed surfaces need evidence before deletion.** Closed sleeve/leg/knot caps and armour backs cost geometry, but their closures previously repaired real openings. Collar, wrist and knee movement can expose them. The source alone does not prove these surfaces invisible for every relevant pose and shadow. No cap, mouth interior, armour back or covered body region was deleted. Coarser distant meshes remain a possible way to reduce their cost without reopening the near model.

## Exact indexing implementation

`indexStaticCharacterGeometry` runs immediately after a rigid batch is merged and before its contact cache is built. The dynamic head and four hakama surfaces never enter this batch path. The helper also refuses existing indices, nonempty user metadata, morph attributes/relative morphs, interleaved or instanced attributes, differing attribute counts, non-static usage, update ranges, previously updated attributes and custom upload callbacks. It neither remaps nor clears unknown caches.

The hash is only a candidate lookup. Every match is confirmed by exact bytes across **all** attributes before sharing a vertex. Signed zero and different NaN payloads remain distinct. Position, normal, UV, colour, skin and custom attributes retain type, normalized flag, GPU type, name and usage. Index entries remain in original corner order; winding, groups, draw ranges, bounds and triangle count remain unchanged. The contact-point cache is built afterward from the same first-occurrence position order. No source anatomy, materials, four PNG assets, readiness or motion code changes.

## Baseline comparison

[Comparison script](20260915-character-static-index-compare.mjs) loads a separately extracted fixed Git baseline, independently expands both geometries by their indices and compares every attribute byte for every mesh. It also compares groups, draw ranges, materials, shadow flags, visibility, contact-point order and world matrices. All four actors and twenty real update-stream state checkpoints match; the sampled idle/attack/broken/dead/victory streams use the existing update function and terrain. Their dynamic head/hakama indices, counts and update ranges are also identical. This is an executable compatibility comparison, not a claim about native image equality.

[Complete output](20260915-character-static-index-comparison.json) includes per-mesh expanded-attribute SHA256 values and the retained runtime/PNG file checks. The rig source compares exactly to 4fa after removing the added helper import and one call. Results:

| Actor | Static vertices before → after | All vertices before → after | Triangles / mesh count |
| --- | ---: | ---: | --- |
| Player | 119,782 → 25,186 | 148,684 → 54,088 | unchanged |
| Sentinel | 123,358 → 25,786 | 152,260 → 54,688 | unchanged |
| Retainer | 123,358 → 25,786 | 152,260 → 54,688 | unchanged |
| Warden | 142,726 → 29,094 | 171,628 → 57,996 | unchanged |
| Total | **509,224 → 105,852** | **624,832 → 221,460** | unchanged |

The 115,608 vertices outside the static total remain untouched. Combined attribute-plus-index typed-array storage decreases from **20,130,848 to 8,221,200 bytes** for these four rigs. This excludes textures, contacts, JS objects and driver allocations. Fewer vertex records and potential vertex-shader reuse do not imply the same percentage improvement in GPU frame time; triangle rasterization, materials, fragments, draw submissions and dynamic updates remain.

Reproduction: extract `fresh` and `package.json` from commit `4fa13484c88dfa3d572c189e3a8999e8f254e70e` into an isolated directory using `git archive`, supply the same installed dependencies, then run the comparison script with `CHARACTER_INDEX_BASELINE` set to that absolute directory. No baseline source is synthesized by disabling the candidate helper.

## Validation and remaining limits

The generic tests exercise attribute seams, byte-exact signed zero/NaN retention, indexed ray face order/material/UV, groups/drawRange, and all metadata/update/morph exclusion paths. The real-rig comparison passes for all meshes and twenty animated checkpoints.

Final candidate validation:

- **38/38 tests pass**, 75,732 ms: `node --test fresh/character-static-index.test.mjs fresh/character-motion.test.mjs fresh/character-assets.test.mjs fresh/character-neck.test.mjs fresh/character-cloth.test.mjs fresh/character-terrain.test.mjs`.
- This retains the real-neck positive-control rays, collar/skin/guard edge checks, native sword grip, dynamic cloth cache and ground constraints. The 1,680 terrain action samples have the identical lowest clearance, `-0.0004444457185170947` m at sun-ring, with unchanged thresholds.
- **Fresh Vite build passes**, 5.54 s: `npx vite build --config fresh/vite.config.mjs`. Output `index-Ci61v9pE.js`, 4,043.88 kB / 1,401.10 kB gzip. All four texture fingerprints remain unchanged. The final combined build/public fingerprint belongs to the integrator's next verification.
- `git diff --check` passes. No further optional testing or runtime changes were added after these gates.

No native renderer, real device or GPU measurement was performed for this candidate. The integrator's prior same-host timings (906 approximately 1,040–1,053 ms; 4fa approximately 1,005–1,010 ms; acf approximately 818–822 ms) were supplied context; I did not reproduce them or attribute those differences to this change. Rig-construction hashing adds unmeasured startup work. The next CI must measure the actual combined scene, startup readiness and native image/motion equivalence. This candidate does not change or certify the remaining visual quality of the character, costume or environment.
