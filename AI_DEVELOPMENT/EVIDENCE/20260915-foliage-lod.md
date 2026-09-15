# Foliage representation and load checkpoint — 2026-09-15

Owner: `/root/game2_ultra_art_sound_physics/vegetation_physics` (existing formally accepted Ultra owner; no redelegation). Worktree `game2-foliage-pilot`, base `374e9b1e907a4aefbe965a320d6c4847d4b363a6`. Parent authorized this finite follow-up after the integrated e188 native footage failed to show a convincing bamboo crown and rendering timed out. This record is the owner's work and source-known self-review, not an independent or blind comparison. No remote write/publication is performed here. All ten formal quality comparisons remain **not measured**.

## Evidence that changed the method

I viewed the native e188 `title.png`, `mobile.png`, and `encounter.png` in the recovered CI34978382509 `fresh` artifact. The 108 small, roughly 1 cm-wide leaves per bamboo did not provide visible crown volume at ordinary distance: culms and thin rods dominated. Merely decimating that sparse geometry would preserve this defect. Original 037fd9d star leaves were not restored.

The parent also reported desktop rAF median 1366.6 ms versus JS render 22.2 ms, touch rAF 883.3 ms versus JS render 22.2 ms, and screenshot timeouts. Those are evidence of delay outside the JS call, not disjoint GPU timer measurements. CI profile gl.finish/flush results do not establish completion of GPU rendering. The separate already-integrated 374e capture change removes unseen ordinary draws while preserving production updates; it cannot by itself solve ordinary play cost.

## Finite representation

- Each of the existing 900 bamboo twig supports now carries 3 connected short shoots × 12 real leaves: 32,400 bamboo leaves, 216/tree. Blades before instance scale are 13–16 cm long and 2.1–2.4 cm wide. They keep their narrow attached petiole, curved section, transported normals and independent leaf hinge/curl. The 3,888 maple leaves keep their near geometry.
- Three original 256-pixel frond tiles are rasterized at boot from those exact near leaf triangles, positions, UVs and colours. A fourth tile contains the original opaque bamboo leaf colour/roughness surface. No external art or reference-game asset is used. Atlas size is 512×512, colour + roughness base data 2,097,152 bytes. Colour mip levels explicitly preserve each frond's covered fraction; roughness uses ordinary generated mipmaps. Very small mip levels cannot preserve each individual subpixel leaf.
- At ordinary/far distances one 2-triangle cutout replaces one detailed 36-leaf frond. It remains in the authored support plane and uses the exact current twig field; it does not face the camera. Individual leaf hinge/curl is an explicitly omitted subpixel approximation at that distance. Near geometry is retained in memory and restored using projected blade size, with 6/8-pixel hysteresis. Grazing angles retain full geometry.
- Distant maple leaves use 13 triangles instead of 23, sharing the original positions, pivot, support and normals. All five principal lobes and their separating sinuses remain; minor margin/basal detail is simplified. Near full geometry returns with 7/10-pixel hysteresis.
- Each support selects its own indices inside the existing 16 m spatial cell. No new drawable or oscillator is added. Main colour and depth passes read the same active index buffer. All original wood triangles occur in both representations. Only the index upload changes when a support crosses a threshold.
- The foliage material's shared atlas has an explicit per-vertex cutout mode. Only negative-kind frond faces apply alpha discard. Real leaves and wood remain opaque even when the last mip mixes atlas tiles. Wood UVs explicitly use the opaque fourth tile, preserving their source surface and vertex colour. Culm materials remain separate.
- `forceSinglePass=true` applies only to the two leaf materials and their clones. Three r180 `Material.js` documents this thin-vegetation case; `WebGLRenderer.js:2012` otherwise renders transparent DoubleSide material twice. Ordinary opaque foliage was not constantly double-drawn. This only saves the extra pass while foreground fading is active. Bamboo batches also contain their thin attached wood, so transparency ordering there is a remaining visual consideration.
- Foreground rays use each support's active near/far triangles. Cutout hits sample the base atlas's bilinear alpha and reject holes. Near wood/leaf faces do not perform alpha rejection. Existing bounds, near/far ray limits, hysteresis, fade targets, route and camera decisions are unchanged. GPU mip/derivative edge filtering is not exactly reproducible by a base-level CPU ray: this is a documented subpixel boundary approximation, not a claim of pixel-perfect filtered equality.

## Added leaf load and failure repaired

Keeping the sparse crown's old load with six times the lamina area was inconsistent. Leaf mass increment uses measured triangle area × an **authored** effective areal mass of 0.06 kg/m². These are design coefficients, not measured species properties. Added lamina mass is 3.159577 kg over 150 bamboos, about 21.1 g/tree. Existing mode lengths, stiffness and damping remain fixed.

An initial summed-face drag estimate raised 20-second short-side-shoot strain to **0.213687%**, failing the existing 0.2% bound. I did not relax that bound or the springs. The corrected drag estimate rasterizes the actual leaf union at 96×96 in eight horizontal wind directions, avoiding repeated loading of overlapping laminae. It includes an authored 0.65 shelter factor and 3% unresolved vertical-eddy fraction. Each ancestor receives the corresponding cantilever-mode participation (mass f², force f), rather than treating the same leaves as newly created masses on every level. This remains a one-way reduced modal/optical-shelter approximation, not fluid simulation or a measured botanical model.

Template old/new lamina area is 0.01047–0.01195 / 0.06291–0.07147 m²; old/new projected union area is 0.001825–0.001887 / 0.007687–0.008117 m². Final 20-second maximum short-member strain is **0.166841%**, root drift **0**. At the final sampled time, maximum twig deflection is 0.01719 m; larger/heavier new crowns are not claimed to have the old deflection amplitude. Physical motion and naturalness still require video review.

## Verification and measured limits

51 related tests passed in 20.31 s (the final bamboo-specific count assertion then passed the 4-test LOD subset in 8.26 s): leaf shapes/attachments, wind/normal/depth contracts, support mechanics, camera contracts, foreground regressions, cutout positive/negative rays and draw:false update equivalence. The atlas ray fixture includes 18 hole rays and 6 opaque rays across moving support states. The maple LOD fixture probes active coarse geometry at three wind times. Original inspection camera coordinates and self/other/all woody counts remain unchanged. Syntax and `git diff --check` passed. Fresh Vite production build passed (the existing bundle-size advisory remains).

The separate final headless CPU/count run uses exact 374e presentation and foreground modules for baseline, 30 warmups + 60 measured updates/case. Other common modules are shared. No WebGL draw occurs. See `20260915-foliage-lod-counts.json` for full count definitions, hashes and values. Root/support coordinates, lengths, stiffness, damping and all grass instance matrices match; support count 2317, grass 3000 clumps / 9000 blades, existing drawable count unchanged. Buffered vegetation vertices increase 307,138→440,338 because near leaves are retained; buffer capacity includes unused frond alternatives. This is a memory tradeoff, not a memory optimization.

| Headless case | Active vegetation triangles old→new | Geometric main-frustum triangle estimate old→new | JS render median / p95 ms old→new |
|---|---:|---:|---:|
| Approach | 293,612→220,882 | 500,132→445,096 | 4.93 / 7.06 → 3.72 / 6.47 |
| Water | 293,612→258,922 | 238,382→223,722 | 3.82 / 4.92 → 5.57 / 9.05 |
| Waystone | 293,612→238,352 | 130,894→134,124 | 4.85 / 6.88 → 7.07 / 8.94 |

The frustum estimates omit hidden descendants but are not renderer statistics or shadow totals. In the waystone view the denser nearby leaves slightly **increase** estimated visible triangles. Water/waystone CPU calls also cost more. These mixed values cannot certify correction of e188's large raster/IPC/compositor delay. Actual SwiftShader readback/render timings and normal input routes remain required.

## Media scope and remaining checks

I viewed the generated atlas PNG and verified actual small pointed leaves with clear gaps, attached shoot directions and three distinct layouts. It is source artwork, not an in-game frame. No candidate gameplay/vegetation frames or GPU timings were available at this local freeze. Near/far switching collapses a frond's 9.3–10.0 cm total depth into a plane, so silhouette/normal/overlap changes and visible switching are possible despite hysteresis. The base and mip alpha masks preserve aggregate coverage, not every tiny leaf identity. No visual quality or performance completion is claimed.

Next native review: ordinary title/mobile/encounter crown volume and repetition; full bamboo and branch close views; maple near/far margins; root/main branch/leaf motion differences; cutout silhouette and moving shadows; any switch pop during ordinary camera travel; unchanged foreground fade/route completion. Keep the 374e one-inspection-draw capture behavior. If ordinary playback remains slow, use real readback/timing evidence to separate vertex, shadow, fragment/overdraw and compositor costs before extending the implementation.

## Follow-up: separate cutout coverage from foreground fading

Owner remains `/root/game2_ultra_art_sound_physics/vegetation_physics`; finite correction on `1dd29a763a6521e0aadb52a8d5d8fba1df471b4e`, authorized by the integrator after independent source review. The reviewer correctly found that Three's standard map chunk multiplied `diffuseColor.a` (foreground opacity) by atlas alpha, and the unchanged alpha-test chunk then compared that product against 0.4. Consequently foreground fading removed edge texels early and erased even alpha=1 leaf centres below opacity 0.4. The earlier opaque-mask tests did not cover this case. The prior claim of a shared mask did not hold during fading; the CPU used the atlas alpha alone.

The shared visible/depth hook now stores incoming fade alpha, reuses Three's existing map sample to store **mask alpha separately**, restores fade alpha, and discards a frond fragment only when mask alpha is below the existing 0.4 threshold. Surviving fragments carry the requested fade alpha. There is no extra texture lookup. The program cache key changes from v1 to v2. Wood and detailed leaves keep their non-cutout mode, including in mixed atlas mips. The CPU mask definition already used the correct field and needs no change. Existing shadow enable/disable at foreground opacity 0.55 remains unchanged; when enabled, the depth shader uses the same independent mask. No leaf geometry, support dynamics, atlas data, terrain, route, LOD distance, fade threshold or input code changes in this follow-up.

`frond-fade.test.mjs` hooks the actual Three physical and depth shader sources, expands their real map/colour/alpha chunks and executes the alpha-related scalar operations in JavaScript. This is source/numerical validation, **not GLSL compilation or GPU raster validation**. It checks 7,396 actual atlas samples per opacity, compares the CPU mask, and includes exact threshold cases 0, 0.399999, 0.4, 0.400001, 0.5 and 1 for both frond and opaque modes.

| Foreground opacity | Fixed visible / depth / CPU mask survivors | Old product-alpha survivors | Fixed holes |
|---|---:|---:|---:|
| 1 | 1,214 / 1,214 / 1,214 | 1,214 | 6,182 |
| 0.5 | 1,214 / 1,214 / 1,214 | 865 | 6,182 |
| 0.4 | 1,214 / 1,214 / 1,214 | 865 | 6,182 |
| 0.2 | 1,214 / 1,214 / 1,214 | 0 | 6,182 |
| 0.08 | 1,214 / 1,214 / 1,214 | 0 | 6,182 |

All fixed visible survivors preserve alpha equal to the requested opacity; the enabled depth mask is evaluated with its actual opaque depth input. Related fade/LOD/foreground tests passed **14/14 in 19.39 s**; source syntax and diff checks passed. Fresh production build passed. Candidate GPU media is still pending CI. The independent reviewer was given the concrete shader design and test outputs, and will receive the commit SHA for read-only rechecking.

Separate reviewer observations remain unresolved visual/filtering risks: coarse mips brighten covered RGB due to the transparent gutter colour; the smallest mip levels lose the frond mask; per-triangle max coverage undercounts the projected union at roughly 0.6% of covered base texels. This fade repair does not alter those atlas bytes. Neither these source observations nor the mask regression tests establish in-game naturalness or rendering performance. The previous caveat about CPU base-level filtering versus GPU derivatives/mips still applies.

## Follow-up: preserve colour and coverage in frond mipmaps

Same accepted owner; this finite correction starts from `26a7b47cda779980a968ceb3a48a1ae44e8a8b49`. The integrator authorized it after independent review found covered linear luminance rising from about 51 to 62–64 at global mip 64 and 69–72 at mip 32, with all fronds absent at the smallest mips. Those levels can affect ordinary LOD distances, so this required a source repair before the next candidate capture.

Transparent RGB now extends the nearest painted colour within its own tile. Actual base comparison against the retained 1dd/26a atlas confirms **0 changed alpha bytes and 0 changed painted RGB bytes**; only 486,948 unused transparent RGB channel values change. Geometry, leaf population, physics, near painted texture, roughness texture and LOD distance thresholds are unchanged. See `20260915-frond-mip-check.json` for both base hashes and numerical evidence.

Mip colour uses original coverage as its weight. The unscaled intermediate colour/coverage values stay in Float64 working arrays, rather than repeatedly rounding to 8-bit or feeding coverage-corrected alpha into later colour averages. Output bytes are rounded once per mip. The initial check exposed intermediate byte-rounding error; this was fixed before freeze. Direct integration from base texels independently verifies every surviving mip pixel with maximum RGB error **0.5/255**. A poison-colour fixture confirms that neither transparent magenta nor neighbouring tiles enter painted colours.

Alpha scaling now preserves **bilinearly filtered area**, not merely the count of texel centres above 0.4. Coarse tiles have a one-texel alpha-zero guard, preventing bilinear mask leakage from neighbouring fronds or the opaque detail tile. Wood and detailed leaves retain their explicit non-cutout mode and the prior separated fade alpha. Their opacity does not depend on those guard alpha values.

The colour texture has seven immutable mip levels, **512, 256, 128, 64, 32, 16, 8**. It does not allocate the empty 4/2/1 levels. Each terminal frond retains a 4×4 mask; a roughly 16% binary mask cannot retain its area as a single empty/filled texel. This is a valid partial immutable chain: OpenGL ES 3.0.6 §3.8.7 equation 3.15 limits the effective maximum level to the allocated immutable level count minus one. [Khronos specification](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf). The actual installed Three `WebGLTextures` uploader was executed against recorded GL-call stubs: it allocated exactly seven levels with `texStorage2D`, uploaded each exact mip buffer, and did not regenerate a full chain or use mutable `texImage2D`. That checks the real JavaScript upload path; **driver completeness, rasterization and native colour remain unmeasured**.

| Global mip size | Mean covered linear luminance, three fronds | Independent bilinear coverage |
|---|---:|---:|
| 512 base | 50.75–50.98 | 16.11–16.36% |
| 64 | 50.41–50.57 | 16.16–16.93% |
| 32 | 50.08–50.27 | 16.47–16.70% |
| 8 terminal | 50.39–50.72 | 16.24–16.60% |

Terminal texel-centre coverage is 4/16 = 25%; its interpolated mask area is about 16.5%. These are different quantities and neither is a native visibility score. Independent 127×127 bilinear samples and 54 additional fractional-mip/trilinear cases passed colour/coverage bounds. The old total disappearance and 23–40% colour brightening do not occur in these numerical samples. The shared visible/depth map and opacity 1/.5/.4/.2/.08 regressions remain valid.

Related tests passed **16/16 in 18.04 s**; the subsequently added trilinear checks passed the two-test mip subset in **4.06 s**. Fresh build passed in **2.06 s**, and syntax/diff checks passed. No GPU result is claimed. Partial-chain minification can retain aliasing/shimmer in very small distant fronds; ordinary-camera/native shadow and colour review is still needed. The separate roughly 0.6% base union approximation is intentionally unchanged. The independent reviewer received the design, concrete metrics, actual-uploader scope and will receive the frozen SHA.
