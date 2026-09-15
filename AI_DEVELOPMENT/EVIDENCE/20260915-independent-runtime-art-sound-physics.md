# Independent runtime review — art, sound, vegetation

- Reviewer: `/root/game2_ultra_art_sound_physics/independent_runtime_review`.
- Review began 2026-09-15; this first checkpoint is 2026-09-15T12:18Z.
- Canonical repository/branch: `bachikoljunior-blip/game2`, `codex/game2-rebuild-20260913`.
- Assigned baseline: `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`.
- This reviewer did not implement the runtime changes. Only this evidence file is writable by this assignment. No remote, stage, commit, PR, main, Pages, automation, or old `fresh-20260913` artifact writes were performed.
- This is a **source-known technical review**, not a blind comparison. No actual images were evaluated, no audio was listened to, and no PS4 visual-quality or perceptual sound-quality conclusion is made. All 10 formal elements remain **not measured**. Deadline remains **2026-09-20T07:51:53Z**.
- The assignment specifies Ultra; private effective model strength was not independently observable. This reviewer read `CLAUDE.md`, the complete fixed instructions, and the relevant current-session/delegation/deadline state.

## Source identity and boundaries

Initial supplied hashes were independently verified before review:

| File | Initial SHA-256 |
| --- | --- |
| `fresh/audio.js` | `d38cc9a7e5055c6c8bfa4c849bfbab27046790327223e55dff098f293ecc5dcf` |
| `fresh/character-rig.js` | `6418ba2189b68b02620367f6d04cde1778156df082eb309e22e3105b2031c5f6` |
| `fresh/character-sculpt.js` | `199c96f76b815f9c23a945afec5f0c2ec7b4a733e67ed89b03eb95abaa256361` |

The owner subsequently authorized two nose-depth coefficient changes. The resulting sculpt hash `32066a5ed8bed1a9b3bfe0897860ae81fd880e84d46f37412a72678460136151` was verified and was the basis of the first reproduced face-normal defects below. Reviewer-requested winding repairs then produced `222943987838efe77b90fce511833005b8dbc0b59e138ec0b002239c4d5a16aa`, independently rechecked. The separate sash material repair produced rig hash `b8f7834be99c52a458b07f331eda8d69d139694fd3292c44405631e644ed884a`, also independently rechecked. These changes were made by the character owner, not by this reviewer.

| Additional reviewed file | Verified SHA-256 |
| --- | --- |
| `fresh/audio-audition.mjs` | `1310b6f918da6facadc193b3c0420d56d4ebcc636c453ab70862456d5910b6e2` |
| `fresh/audio-analysis.mjs` | `30197433e5fca30e2506d65fbe276374b75b8fe31a32beba4fa5ae37498fbc8e` |
| `fresh/audio.test.mjs` | `a0bd20ac425b18dd3992709251f8d87c84fccd4eb11b9863e83d53809db6c684` |
| `fresh/character-motion.js` before CPU repair | `a476a5c666126de69a8326abc837bb04f85a7aedfb53df649fe33af1b0f13681` |
| `fresh/vegetation-physics.js` | `1d43d75891d9ac065e7126b4022052b24b103f66f8bdd7ffe75ada4467cf11be` |
| `fresh/wind.js` | `1aa335cbff255dac5b27011b7d6c4960009e3984fc3e8a57e6a5c9b0699cba2e` |
| `fresh/presentation.js` | `7f5930db8bd48045ca5b6fbadc8a9e8061429603bb434eec8edd89388e4473a6` |
| `fresh/foreground-visibility.js` | `eac57b378bdbdfa26c949d834667b6065f131bee33f85afcc539f6376029eec5` |

Plants were not read until the integrator supplied the frozen plant hashes and explicitly extended this review's scope.

## Findings and independent closure

1. **Confirmed face-surface defect, repaired.** `eyeSurface` initially used `flip:true` for both upper and lower lids although lower-lid parameter direction is reversed. Both lower lids pointed inward while their skin material was `FrontSide`. Generated mean normal Z was +0.837672/+0.837774, versus the upper lids' -0.741777/-0.741271. The left nostril `faceRibbon` also reversed its U direction while keeping a fixed flip, giving mean Z +0.582469 versus the right's -0.582469. These are source/geometry-confirmed culling defects, not an assessed pixel-level severity. The sculpt owner changed the lid flip and direction-dependent ribbon flip. This reviewer independently regenerated all six surfaces at `222943...`: lower lids now -0.837672/-0.837774 and both nostrils -0.582469. Closed for the identified winding defects.

2. **Confirmed back-facing sash defect, repaired.** The rear `sash-tail` used a thin `clothRibbon` with a `FrontSide` cord material. Its mean normal Z was -0.985473 although the sash hangs behind the body at local Z +0.138. The owner added a separate optional-double-sided material cache entry only for this ribbon. At rig `b8f783...`, this reviewer aimed a ray from the rear through an actual generated triangle centroid: the actual `DoubleSide` material returned one hit; the same geometry with an explicit old-`FrontSide` negative control returned zero. The material cache includes the new flag, so closed cord volumes retain their original side setting. Closed for the identified culling defect.

3. **Major integration risk: enlarged contact-scan cost; repair pending at this checkpoint.** The authored player retains exact joint lengths and uses fewer draw meshes, but increases geometry and CPU contact samples substantially. A comparative Node probe ran the same unmodified motion implementation against the baseline and candidate rigs at `(30,10)`, yaw `3π/4`, for 90 frames per state. The deterministic call increase was communicated immediately. The integrator has assigned a conservative terrain-bound early-out repair to the existing sound owner; that delta has not yet been reviewed at this checkpoint.

| Player measurement | Baseline | Candidate before CPU repair |
| --- | ---: | ---: |
| Draw meshes | 75 | 63 |
| Geometry attribute bytes | 921,344 | 4,629,056 |
| Contact-position bytes | 65,076 | 328,116 |
| `heightAt` calls, 90 falling frames | 402,808 | 1,693,906 |
| `heightAt` calls, 90 broken frames | 33,096 | 233,640 |
| `heightAt` calls, 90 dodge frames | 34,368 | 233,640 |
| `heightAt` calls, 90 settled frames | 90 | 90 |

One exploratory Node timing run observed falling-frame averages 1.56 → 7.80 ms, broken 0.22 → 0.94 ms, and dodge 0.18 → 0.86 ms. These are diagnostic local CPU observations, affected by JIT/order/load, and are not browser frame timing, mobile hardware inference, GPU timing, or a performance verdict. The run occurred during the character winding-repair handoff; those repairs preserve the measured positions/triangle counts, but these timings are not represented as a final immutable-build benchmark.

## Other performed checks

- Reviewed the scoped Git diffs and complete audio/character/plant implementations, including material caching, geometry merging/disposal, shared character resources, contact-point deduplication, existing IK/grounding APIs, event identity, gait phase, resume/pause invalidation, mixer buses, and authored analysis/export schedules. No input or gameplay-state mutation was added by the reviewed deltas; `fresh/main.js`, `fresh/input.js`, and the pre-repair `fresh/character-motion.js` had no local diff.
- Independently generated player, sentinel, retainer, and warden at sculpt `222943...`. Every geometry attribute value was finite. Triangle counts were respectively 48,516 / 48,836 / 48,836 / 50,764; contact-position counts 27,343 / 27,553 / 27,553 / 28,677. Finiteness/counts do not establish anatomical quality or rendering performance.
- Independently executed `node --test fresh/audio.test.mjs`: **16/16 PASS**, zero failed/skipped/cancelled. This covers generated PCM bounds, event mapping and same-tick identity, material contacts, 250 ms delivery and speed-transition phase, lifecycle and delayed resume, FFT known-tone checks, spectra/envelopes, and air-bus routing. Audio output was **not listened to**. The analysis script correctly describes a controlled authored schedule with constant pressure, not actual browser PCM or a simulation trace. The audition script was read, not executed; its old default output directory was never written.
- Reviewed plant support registration order, relative rotations, beam frames, leaf pivots/axes under nonuniform authoring scale, bounded force response, texture packing, shared CPU/render deformation, normal transport, matching shadow hooks, time freeze/reset, and inspection-camera opacity/shadow reset. No additional static blocker/major was found in these paths.
- Constructed the **exact authored scene in memory with only WebGLRenderer and 2D canvas drawing stubbed**. No file or runtime source was modified. This is geometry/CPU evidence, not actual rendering. The scene registered 2,317 beams: wood 5, woodBranch 38, bamboo 150, bambooBranch 900, twig 1,224. All support attributes were finite across 114 meshes / 180,628 vertices; maximum support ID was 2,316; no vegetation mesh lacked its custom depth material. Sampled CPU deformations remained finite, root drift was 0, repeated-time pause preserved the complete mode texture exactly, and the texture held 112,640 bytes.
- A 120-frame Node solver-only probe of that authored plant population observed median 2.57 ms, p95 4.27 ms, maximum 5.63 ms. This additional CPU cost must be assessed with actual integrated capture/frame data. It does not prove a browser or smartphone budget is met.

## Remaining limits

No independent actual-image review, actual listening, browser/GPU shader compilation, WebKit/iOS run, 10-minute smartphone-targeted measurement, full-scene frame-time validation, or blind comparison was performed by this reviewer. The integrator's CI and a separate media reviewer handle those artifacts. The three reproduced surface defects are closed at the stated hashes. Apart from the contact-CPU finding awaiting its assigned repair, no further static blocker/major was found within the reviewed scope; this is not product acceptance.

## CPU repair independent closure — final technical checkpoint

This later checkpoint supersedes the CPU-pending status above. The integrator explicitly extended this review to the frozen terrain/contact delta, implemented by `/root/game2_ultra_art_sound_physics/sound_revision`.

| File | Independently verified SHA-256 |
| --- | --- |
| `fresh/terrain.js` | `8d33d411734ca5cc7a46d15dd63057856acca8df0bb3ba9634da49fd41a0fdb2` |
| `fresh/character-motion.js` | `bf2b523fe34c33df5af25bc7deb9864393b5caabe831996ff3796de10fda0a7b` |
| `fresh/terrain-contact-bound.test.mjs` | `a423300963fd7f43a33fe916bfc5a22e407272455ace90350379ef80e25edcf8` |

The added `maximumGroundInRect` enumerates the rectangle's overlap with each terrain cell. It evaluates clipped rectangle corners and both sets of diagonal intersections, which include the vertices where a piecewise-affine triangular height field can attain its maximum. It uses the same domain clamp and deterministic terrain vertices as `groundHeightAt`, with outward rounding. Reversed, degenerate, grid-boundary, diagonal, and clamped-domain inputs were reviewed. Caching terrain vertices does not alter their values.

The `groundPenetration` early-out bounds **both** possible preexisting algorithms: exact terrain lookup and the previously fitted local plane. The plane maximum over the world AABB occurs at one of its four XZ corners. Combining their maximum with the mesh AABB minimum Y and outward rounding gives an upper bound on any additional penetration; rejecting only when it cannot exceed the already found penetration preserves the previous result. Providers without the optional bound method continue through the unchanged fallback. No geometry, gameplay input, pose, contact threshold, or exact fallback changed.

This reviewer independently executed `node --test fresh/terrain-contact-bound.test.mjs`: **3/3 PASS**. The test's independent triangle-polygon clipping oracle agreed for 92 rectangles. Across all 270 compared falling/broken/dodge frames, every motion metric and every articulated node's complete world matrix matched the old no-bound fallback exactly. Additional reviewer-authored stdin code sampled **55,419 points** against bounds across random log-scale rectangle extents, exact and ±1e-12 grid boundaries, approximately 1e-10-wide rectangles, zero-area/reversed rectangles, and out-of-domain rectangles. There were **zero** underestimated sampled bounds; the greatest `height - bound` was `-3.552713678800501e-15`.

| Same current player, 90 frames/state | No-bound fallback | With bound | Reduction |
| --- | ---: | ---: | ---: |
| Falling `heightAt` calls | 1,702,902 | 222,017 | 86.96% |
| Broken `heightAt` calls | 233,640 | 6,840 | 97.07% |
| Dodge `heightAt` calls | 233,640 | 6,840 | 97.07% |

The independent run observed Node average milliseconds/frame of falling 7.51 → 1.28, broken 1.00 → 0.14, dodge 0.97 → 0.12. These timings measure the same current generated figure and include the new bound lookup in the accelerated call, but remain local Node diagnostic timing; the exact call-count/pose equality is the stronger reproducible evidence. They do not establish integrated browser/GPU or smartphone performance.

**Final source-known finding:** the identified face, sash, and avoidable contact-scan defects are closed at the stated final hashes. No remaining static blocker/major was found in the reviewed scope. Actual integrated frame timing, native visual inspection, and listening remain necessary. No perceptual or formal-comparison result is changed: all 10 elements remain **not measured**, deadline unchanged.
