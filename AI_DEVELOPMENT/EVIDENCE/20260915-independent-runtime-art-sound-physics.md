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

## Reopened technical review after native-image rejection — 2026-09-15T12:48Z

The integrator reported that actual before/after images from CI `34969080023` exposed neck/shoulder joins, exposed forearm skin, hakama intersections, eye-socket treatment, and a floating helmet band. The integrator rejected publication of `037fd9d`. **This reviewer did not view those images**; the preceding static review is not evidence against those reported visual defects. The same accepted independent reviewer was assigned two finite follow-ups: read-only CI media-flow review, followed by the frozen character repair. No delegation or runtime/workflow edit was made by this reviewer.

### CI media flow

Final reviewed identities:

| File | SHA-256 |
| --- | --- |
| `.github/workflows/fresh-game.yml` | `109767383aeab27356ad3c6b4132ddf77b686e5034eb317f329c06e883d46741` |
| `.github/scripts/emit-fresh-media.py` | `f7d458df0807cc120b8eb6738f510fcb1f53a6965c30ba908edd697b76f8f3c0` |

The figure job now finishes independently of the plant job. Each job checks out `github.sha`, the workflow retains read-only repository permissions, and the scoped diff does not weaken runtime tests, capture thresholds, original media, or publishing gates. The emitter reads local generated output and writes original bytes to the existing job log as a ZIP/base64 envelope; it performs no network/authentication requests or environment dump. Its only environment metadata is the declared GitHub source SHA/run/job. The integrator reported that the normal artifact connector's signed download was rejected with Cloudflare 403/1010 and that a same-owned-artifact read-only CI log transfer succeeded. That recovery was not personally executed or re-verified by this reviewer.

The first reviewed emitter selected recursive file suffixes, and the inline figure variant had no suffix restriction. This reviewer returned the scope weakness and file-symlink issue. The owner replaced both with one helper using **explicit capture filename allowlists**, rejected file symlinks, and required resolved paths to remain within each fixed output root. The output roots had **zero tracked files** in the reviewed checkout; therefore a fresh Actions checkout does not carry this local workspace's old untracked outputs into the job. The source paths for other-work comparison assets are outside the selected roots. No actual secret, other-work media, or local old evidence was read or emitted by this review.

A second concrete failure-flow issue was identified: putting `before` and `after` emits sequentially inside one default `-e` shell block allowed an absent/failed baseline emit to prevent an existing candidate from being recovered. The owner split them into **separate `if: always()` steps**. The final workflow preserves the candidate emit attempt independently of the baseline emit's result.

This reviewer executed the final helper against a **purely virtual Path provider with synthetic bytes**, without traversing or emitting existing evidence. All six groups (`before`, `after`, `vegetation`, `experience`, `fresh`, `public`) preserved the two selected synthetic files exactly after ZIP/base64 round-trip; archive SHA-256, each file's SHA-256/byte count, and ZIP CRC all matched. Negative controls rejected an allowlisted symlink, an allowlisted resolved-path escape, a nonallowlisted JSON, and an out-of-root reference path. The helper's actual byte-packaging logic was used; only the filesystem provider was substituted. This is a helper test, not proof of future remote log completeness. Recovered real archives must still be checked against their envelope.

The selected logs deliberately omit the four full normal-input route WEBMs, their derived visual media, and the exploration WEBMs. The integrator acknowledged this coverage limit, retains the original artifacts/full-decode reports, and will request finite specific originals when needed. This review does not claim those omitted videos were independently observed. No further concrete media-flow defect remained at the final identities above.

### Frozen character repair

| File | SHA-256 |
| --- | --- |
| `fresh/character-rig.js` | `4d3ee3249123879c35dfc4a617f28e74e3489669098ee93a4ff6ee6f57315f65` |
| `fresh/character-sculpt.js` | `0d40059bcb748e47c08f2ec66163aafb266d5eff7729b671070722b727479639` |
| `fresh/character-sculpt.test.mjs` | `2140f00718f85027d07d1cac8abdb7488ab01231a818ab5537e28ca41d7df907` |

These supplied hashes were independently verified before and after this review. The scoped diff adjusts the neck attachment height and chest/sleeve/forearm/hakama surfaces, caps loft sections, adds rounded iris/pupil surfaces, reduces procedural skin/hair contrast, and replaces the helmet-band ribbon with a shell-following surface. Arm/leg bone lengths and pivots, sword geometry/attachment, motion rules, and input files are unchanged by this repair.

Technical inspection covered cap triangle winding, exact deformed endpoint rims, separate cap/side normals, iris/pupil facing and offsets, neck/collar attachment coordinates, covered forearm geometry, helmet band/mask winding, material cache behavior, and contact geometry generation. The new cap test shoots at both ends of a rotated actual loft from outside with a range shorter than the opposite-cap distance, so its success does not merely hit the other end of an uncapped tube. The eye ray tests verify local facing but alone do not establish assembly visibility.

This reviewer independently ran `node --test fresh/character-sculpt.test.mjs fresh/character-motion.test.mjs`: **25/25 PASS** (5 local ray tests and 20 existing motion tests; no skipped/cancelled tests). To check the local eye test's assembly limitation, additional reviewer-authored stdin code built all four actual rigs, advanced the normal idle pose for 24 frames, and cast **16 rays in total against the complete neck assemblies**: left/right pupil and iris on all four characters. Every nearest hit was the intended actual pupil or iris material, rather than the skull, hair, or helmet. All geometry attributes on all four generated rigs were finite.

| Current generated rig | Triangles | Contact positions | Draw meshes | Attribute bytes |
| --- | ---: | ---: | ---: | ---: |
| Player | 52,348 | 28,321 | 64 | 4,996,928 |
| Sentinel | 52,668 | 28,531 | 64 | 5,027,648 |
| Retainer | 52,668 | 28,531 | 64 | 5,027,648 |
| Warden | 54,620 | 29,666 | 66 | 5,215,040 |

No additional source-known blocker/major was found in this frozen character delta. The character owner separately reported the full four terrain tests passing; this reviewer did not duplicate that terrain run. **The reported neck/shoulder, forearm, hakama, eye-socket, and helmet appearance defects are not declared visually closed by these technical checks.** New native images remain required, as do the existing independent media and formal comparison work. All 10 formal elements remain **not measured**, deadline **2026-09-20T07:51:53Z** unchanged.

## Recovery-input observer review — 2026-09-15T13:16Z

The integrator assigned this same independent reviewer a further finite, read-only review of source **`acf0f9ec86996245ad712d6adc72e5d6159f6711`**: the new recovery-dodge observation helper/tests and its two smoke-test callers. The checkout HEAD and all four below hashes matched that source; the files remained unchanged through the review. Only this evidence file was edited.

| Reviewed file | SHA-256 |
| --- | --- |
| `fresh/input-observation.mjs` | `e7455432f66621d0c78d1b45cc3927895f9b67d9fbb0bb1af593fe79f3376a8d` |
| `fresh/input-observation.test.mjs` | `9bfff0b910d86346a0735be94afb81a64c700ec44a8df318a93be3d25ff43a42` |
| `fresh/browser-smoke.mjs` | `abbef0903b5ce3f4b7dc6a68d514eba36b8dc9756a105415cb277869036dc56a` |
| `fresh/route-matrix-smoke.mjs` | `a9ff6dd8f63c2c870ccc86acb2872bf6fe2ba6320cfc5ee40417423669488c69` |

### Scope and source findings

The old loop read the dodge counter, sent a touch pulse, then checked its deadline before reading again. A completed pulse that crossed the deadline could therefore be discarded without observing its result. The new loop reads after each completed pulse, including the last crossing pulse, then rejects another input when its host start timestamp is at or beyond the same 3000 ms deadline. It does not add a post-deadline polling loop or extend the new-input window. A slow initial diagnostic read also cannot initiate a fresh pulse after the deadline. Both callers capture `startedAt` **before** the helper's dynamic import, so setup remains within that input window.

The success predicate remains an increase of the actual `world.totals.dodges` counter relative to the caller's prior observation. Source inspection confirmed that the simulation increments this counter when the player dodge is accepted, and the diagnostic API returns a read-only JSON copy. No timer, event timestamp, visual state, or fabricated result substitutes for counter growth. The callers use one diagnostic snapshot per read and preserve the original CDP touch pulse, including its existing 50 ms and 110 ms waits. Runtime input/simulation and the overall mission success checks are unchanged by this repair.

The recorded clock fields have different meanings: `readStartedAtMs`/`receivedAtMs` and pulse times are host wall timestamps; `browserObservedAtMs` is browser snapshot wall time; `worldTime` and `lastDodgeEventTime` are simulation seconds. Only host receipt time classifies an observation as inside or after the input window. Missing/pruned event history remains null. The code correctly states that **actual input-to-acceptance latency and acceptance within 3000 ms are not measured**. A final read may finish later; this is a recovery-input acknowledgement, not a latency PASS.

One existing ordering nuance was explicitly checked: counter growth is tested before terminal mission mode, as in the old loop. A snapshot with `mode:'defeat'` and a newly increased dodge counter therefore acknowledges the dodge, but does **not** declare the mission successful. The unchanged callers still require actual victory, its observed 180-second bound, route/arrival/signal progression, and real guarding/block-or-parry conditions. The new unit test's terminal-state case covers absence of counter growth; it should not be read as proving all terminal snapshots are rejected by the helper. This preserved ordering is not a newly weakened whole-mission criterion.

### Independently performed checks

- `node --test fresh/input-observation.test.mjs`: **5/5 PASS**, no failures/skips/cancellations. This includes a negative reproduction of the old missed-final-read loop, crossing-pulse success/failure, no fresh tap at 3000/3001 ms, already-observed success without a duplicate tap, setup time, and terminal failure without counter growth.
- Reviewer-authored stdin code exercised **120 additional injected-clock combinations**: two setup durations, five read durations, three pulse durations, and success on the first/second/fifth/no pulse. Results were **47 expected acknowledgements and 73 expected rejections**. Every completed-pulse trace had `reads = taps + 1`, every new pulse's host start was `< 3000 ms`, acknowledgements required counter growth, and late/within classification used host receipt despite deliberately unrelated browser/simulation timestamps.
- **Two exception cases** verified read and tap failures propagate without retries or false success; the failing pulse's finish timestamp is retained.
- **One terminal-with-counter-growth case** verified the preserved ordering described above and retained the terminal mode in the acknowledgement record.
- Both changed smoke files passed `node --check`. The commit diff and both call sites were inspected, including the unchanged whole-mission assertions.

**Finding:** no source-known blocker/major was found in this bounded observer repair. The five repository tests plus 123 supplemental fixture cases are apparatus checks, not a new browser mission or input-latency measurement. The integrator reported CI `34971788118` **fresh job `104389572336` succeeded** while experience/motion work was still running. This reviewer made no remote CI call and does **not** label the entire CI successful. Remaining checks belong to the ongoing exact-source CI/media work. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

## Independent motion-media inspection — 2026-09-15T13:30Z

The same accepted Ultra reviewer was assigned six actual rendered motion clips from source **`acf0f9ec86996245ad712d6adc72e5d6159f6711`**, CI **`34971788118`**. The integrator now reports all four CI jobs succeeded and that the original experience archive was recovered through the regular job log with ZIP CRC/archive SHA verification. Those remote/recovery checks are attributed to the integrator; this reviewer made no remote call. This reviewer personally read the recovered `motion-study/report.json`, verified its exact source revision, hashed the six original MP4s below, and independently decoded each complete clip using `ffmpeg -v error -xerror -i <clip> -f null -`.

All six complete decodes passed: **204 encoded frames, 17 authored seconds**, 960 × 540 at 12 fps. This is a codec-integrity result. Visual inspection consisted of **53 unique native extracted frames individually displayed**, plus seven exact native crops of already-counted frames, with no continuous playback. Original MP4s were unchanged. The other eight motion-study clips and the four normal-input route videos were not independently viewed in this task.

| Original clip | Frames / seconds | Independently calculated SHA-256 |
| --- | --- | --- |
| `start-run-stop.mp4` | 48 / 4 | `e4dcc4e9ed0f873f7516ee008c6b0ddf46594265340e984abc0d991ec5cc9f31` |
| `guard.mp4` | 24 / 2 | `a1370e0197a7f3c391b77c73c91482cebc6a07b2222bf488460978fda6895526` |
| `parry.mp4` | 24 / 2 | `6b51a5f2fee6e3df5c4ae1e8f347b28b9b4ef8906b9eb3f455cdfef799349217` |
| `hit.mp4` | 24 / 2 | `b37af1b7947cb7f42cd66cf27bfe00d4ff79dd4c63787e5c5896349f760023ae` |
| `death.mp4` | 36 / 3 | `5e844c26c49f23bf0e17312d5e3189af3ebb5fe6b9c889162bc8427ca9e17d3f` |
| `victory.mp4` | 48 / 4 | `92f64d85013cae98f85d16f8f07392fe951a7d82be84efcd73094e2b799c1598` |

### Actual visual coverage

Frame indices below are zero-based. Authored time is exactly `frame / 12` seconds; decimal values are rounded only for display. Thus the table identifies every actually viewed source frame, without treating the unviewed intervening frames as visually approved.

| Clip | Viewed frame indices | Corresponding authored seconds |
| --- | --- | --- |
| start-run-stop | 0, 6, 10, 11, 12, 13, 14, 15, 16, 18, 24, 32, 40, 47 | 0, .5, .8333, .9167, 1, 1.0833, 1.1667, 1.25, 1.3333, 1.5, 2, 2.6667, 3.3333, 3.9167 |
| guard | 0, 3, 6, 12, 23 | 0, .25, .5, 1, 1.9167 |
| parry | 0, 3, 6, 9, 12, 18, 23 | 0, .25, .5, .75, 1, 1.5, 1.9167 |
| hit | 0, 3, 6, 9, 12, 18, 23 | 0, .25, .5, .75, 1, 1.5, 1.9167 |
| death | 0, 3, 6, 9, 10, 11, 12, 15, 18, 24, 35 | 0, .25, .5, .75, .8333, .9167, 1, 1.25, 1.5, 2, 2.9167 |
| victory | 0, 6, 12, 18, 24, 30, 36, 42, 47 | 0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 3.9167 |

The seven additional crop views were run frame 14, guard frame 12, death frames 9/12/35, and victory frames 18/30, each using the identical native rectangle `[390,150,570,420)` with no resampling or enhancement. Extraction/viewing files are in `/workspace/scratch/27301e95ee53/independent-motion-view-34971788118/`; `independent-view-index.json` records all source and extracted-frame SHA-256 identities. These are disposable viewing intermediates outside the repository. The original clips remain under `.review/34971788118/experience/motion-study/`.

### Finding returned immediately: major visual clothing residual

**The hakama repair cannot yet be considered complete in motion.** In `start-run-stop` frame **13 (1.0833 s)**, the lifted dark knee appears as an oval patch partway through the hanging blue front panel; in frame **14 (1.1667 s)** the knee/upper leg projects prominently in front of that still largely straight panel. Frames 11–16 were viewed consecutively to distinguish the changing leg from a single-frame reading error. The garment does not visibly bend or gather around the rising knee. This is an apparent clothing-intersection/rigid-panel appearance; no geometric intersection depth has been measured.

In `death` frames **9–12 (.75–1 s)**, the blue hem projects sideways as thin, pointed rigid fins around the bent legs. The native frame and crop show this in the lower-body silhouette, not solely at subpixel detail. The two observations are treated as **one major clothing-motion appearance residual**, because running and falling are ordinary, repeated character states and the current repair specifically addresses hakama appearance. This severity is a visual-art diagnostic judgment, not a runtime crash or gameplay blocker.

After observing the images, the reviewer read the corresponding unchanged source. `character-motion.js:446` rotates each whole panel using `hipPitch * .34` with a clamped rotation; `character-sculpt.js:143` builds a fixed pleated surface. This is consistent with the visible rigid-panel behavior. The source corroborates the diagnosis but is not a substitute for the observed frames. The inspection-time checkout had advanced to documentation-only commit `3bcc5df515eb394c484e6eaf9caf0efcd50e78c5`; `git diff --name-only acf0f9ec... HEAD` confirmed no runtime file delta, so this source explanation still applies to the exact media revision.

### Other observations and limits

No obvious detached neck/shoulder, missing forearm section, free-floating hand/sword, or reversed knee was found in the **viewed samples at this camera angle**. Guard/parry samples show the hands clustered at the hilt; victory samples show raised sword, turn toward the waist, and a sheathed ending; death samples show a bent-knee fall and a separate sword resting ahead of the body. These observations do not validate grip geometry, all sheath-transition frames, clothing contact, or motion timing as a whole.

The upright player is approximately 220 pixels tall in these native frames. Fingers, facial joins, and small surface intersections have limited visibility; rear surfaces and the helmeted enemies are not shown. This review therefore does not close the earlier neck/shoulder, face, sleeve, and helmet findings for all four characters. The report itself identifies an isolated inspection camera and synthetic scene states: these are actual rendered generated assets, but they are not normal-input combat recordings or real-time/device performance evidence. No listening was performed.

The prior `037fd9d` image rejection remains integrator-reported context; this reviewer did not conduct a paired native-image comparison against that source. This is a source-known technical/art diagnosis, **not a blind comparison, PS4 acceptance, formal comparison, or real-device PASS**. CC0 materials are absent from these media and the proposed next pilot is unevaluated. Only this owned evidence file was changed in the repository; no production/runtime, remote, staging, or automation action was taken. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

## Frozen scene-art source review — 2026-09-15T13:38Z

The integrator assigned the same independent Ultra reviewer author commit **`3622a5827fa196e7aeea25c89bfda4fde2dc51bd`**, based on **`acf0f9ec86996245ad712d6adc72e5d6159f6711`**. Review and tests ran in the frozen isolated checkout `/workspace/scratch/27301e95ee53/game2-scene-art`; its HEAD matched the assigned author commit. The three runtime/test files also matched the copies transferred to the canonical checkout. Other pending character/vegetation work was excluded. No author source, report, test, stage, commit, remote, or automation was changed by this reviewer; only this canonical evidence file was appended.

| Reviewed file | SHA-256 |
| --- | --- |
| `fresh/scene-art.js` | `66f301ef74e70783571cc309aa5d1d37e121d46f188424d5e77fae607a181b88` |
| `fresh/presentation.js` | `e30465c962e84836c7db9feffee3510aac936a359174288a31d34a2981b3e507` |
| `fresh/scene-art.test.mjs` | `99e38775bf223aafe55fe16617baa910263f153fd20bdea08972b0f816fd2fce` |

### Source and fixture review

The scoped diff replaces the central ridge, shrine structure, paving shapes, ground material, and side-outcrop shapes. Collision rectangles, route coordinates, terrain sampling, actor/input rules, foreground algorithms, and existing tests remain unchanged. New procedural variation uses its own hash; each retained call to the presentation's original random generator consumes the same number of values in the same order. `addOutcrop` receives the same placement/scale/rotation arguments as the prior decorative rocks. Material batches merge static pieces and dispose intermediate geometries; the nine ridge sections remain separate registered foreground meshes so that opacity, depth writing, and shadows can reset locally.

The new ridge tests intersect the actual generated triangles for positive footprint coverage and assert no intersection in both walking corridors. The historic actor/head/blade fixture now correctly represents an unobstructed case at the lower far end; a separate ray through a real triangle exercises the positive fade. This does not delete or weaken the existing old-shape regression fixture. The positive test alone covers one section/triangle, rather than proving every possible ray, and the explicit reset assertions retain opacity, depth writing, and cast-shadow requirements.

The shrine test has both a negative ray at the stopped-foot boundary and a positive wall hit. Its actual base is contained in the unchanged 10 × 7 collision footprint; front decorative posts extend less than the actor's existing .35 m exclusion radius, and roof overhangs are above actor height. Ridge side/end profiles and paving caps were inspected for winding and ground placement. The new material data is generated locally; this delta introduces no fetch, model loader, external asset, or dependency.

One coverage distinction matters: the existing presentation-contract test named “clears the shrine lattice” still analytically checks **old** red/brass lattice coordinates. Its success does not prove visibility through the rebuilt wall. The direct geometry check below therefore tested the unchanged signal lamp against the actual candidate shrine, rather than treating that old formula as evidence for the new surfaces. No actual lamp occlusion was found in those new checks.

### Independently performed checks

- `node --test fresh/scene-art.test.mjs fresh/foreground-visibility.test.mjs fresh/terrain.test.mjs fresh/route-layout.test.mjs fresh/presentation-contract.test.mjs`: **39/39 PASS**, no failures/skips/cancellations, 5.72 s in this run. These are the final assigned scene files, not the author's earlier pre-adjustment 201-test run.
- Reviewer-authored stdin code constructed both the base and candidate presentations using the same installed dependencies, with **WebGLRenderer and Canvas2D drawing stubbed**. All **114 vegetation assemblies** matched exactly in every geometry attribute, index data, world matrix, instance matrix, and instance count. The actual ground mesh's complete position buffer also matched exactly. This supports retained plant placement/support geometry and terrain, without claiming a rendered image or GPU execution.
- The candidate's **17 scene-art meshes, 92,394 vertices and 30,798 triangles** had zero nonfinite attribute values, zero non-unit normals within `1e-5`, zero degenerate triangles at the checked `1e-16` squared-area threshold, and zero vertex normals facing against their corresponding triangle. All 17 retained cast/receive shadow flags. Geometry attribute storage was **4,065,336 bytes**. These counts exclude the rest of the game. The four generated 256 × 256 RGBA textures total **1,048,576 data bytes**, excluding mipmaps, GPU expansion and the retained old textures.
- **104 real FrontSide ray checks** hit correctly facing nearest surfaces: 60 down onto both roof slopes, 36 up beneath both eaves, and 8 inward toward the two gables. These used the generated candidate meshes and original FrontSide materials, without substituting DoubleSide to conceal a winding error.
- **15 additional signal rays** used the actual lamp cylinder dimensions/position and candidate shrine geometry: five lamp heights at each of 16:9, 844:390 and 390:844 authored arrival-camera aspects. Every nearest intersection was the lamp, rather than the replacement lattice/wall. This is finite geometric visibility evidence; it does not measure emitted light, tone mapping, HUD coverage or final perceptual prominence.

**Finding:** no source-known blocker/major was found in this bounded frozen scene delta. The author separately records final build success and 39 related tests; this reviewer independently repeated the relevant tests above, and did not relabel the author's earlier **201-test pre-final-adjustment run** as a final full-suite result. This review did not rerun an unnecessary complete suite or produce a WebGL capture.

### Required next native-media observations

The final integrated source still needs actual PC/touch route and arrival media. Particular visual risks are the **FrontSide half-cylinder tile strips from both oblique sides**, roof undersides and layered edges, lattice/shingle flicker at distance, the new 2 m ground-pattern scale, paving contact and conspicuity, and ridge-section fade transitions against the actor/weapon. Static batching reduces object count but does not measure browser frame time, fill rate or mobile loading. The author's Node construction timings and CPU shape plots remain diagnostic only; no CPU plot was treated as a game screenshot here.

This scene-only review does **not** close the separately observed hakama motion major, evaluate the pending CC0 character or vegetation candidates, or establish integrated visual improvement. It remains a source-known technical review, not a blind comparison or PS4 acceptance. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

## First CC0 character candidate source review — 2026-09-15T13:45Z

The same independent Ultra reviewer was assigned the first preserved native-character candidate **`1e7eed79e7dec1ce28470c77c1fb93a74e40cd15`**, base **`acf0f9ec86996245ad712d6adc72e5d6159f6711`**. Because the author was continuing a separate hakama repair in `/workspace/scratch/27301e95ee53/game2-mpfb-pilot`, source reads used **`git show 1e7eed79:<path>`**. The corresponding canonical character files matched that frozen source before and after independent tests; the separately merged scene-art delta was not treated as part of this character commit. The revised CLAUDE section explicitly records the integrator's authorized method change to bundled CC0 anatomy/materials; this was not represented as a new user-specified asset name or a change to the fixed quality goal.

| Frozen file | SHA-256 |
| --- | --- |
| `fresh/character-assets.js` | `4951b0257e6a1cde08c0fab76fe38b902f6bb441773d54c539bb5fb10c515ac3` |
| `fresh/character-assets/native-data.js` | `b0300de3b9e1a554af7d4586dff412857e262c9a4e88ffb3510b14dbb8ca001b` |
| `fresh/character-tools/derive-mpfb.mjs` | `a54fd2121badf4daed9f3e8802039c0504e4a5ef10b8f8ea696d363096e3c7a5` |
| `fresh/character-assets/provenance.json` | `e71011bdf4cdcc10a6b68d955f4292cb3ed5cea9c399912cad5d05f02325f991` |
| `fresh/character-assets/LICENSE.CC0.md` | `f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c` |
| `fresh/character-rig.js` | `5266988e51e0f49aaa30beb69fc55a1d6922cc0805bffe01de9f31ff4e1fa47a` |
| `fresh/character-motion.js` | `0f47020978f7b651d865479a108ced355d55faf5f4d574c4d996e5f1e8442352` |
| `fresh/main.js` | `0a38ad3342bc964502134e1f49d6d831b3d418d975039ba9485e25e47af91c03` |
| `fresh/character-assets.test.mjs` | `5ae04cf0fa3fbafa8a0ba5cceba01169c770264ede265d5f1684009e6f5c29d5` |

### Stored origin, license statements and exact derivation

This reviewer read the retained MPFB license, CC0 text, base mesh header, and eye/hair/brow fitting/material headers. The original headers explicitly declare the CC0 asset release and named holders; the stored MPFB license distinguishes GPL program logic from CC0 mesh, texture, target, rig and related graphical data. The actual derivation imports Three.js and Node utilities, rather than MPFB program code. Original source helper data is retained for fitting, while rendered extraction uses the `body` faces and excludes helper vertex ranges. The fixed comparison game's creative material is not an input to this derivation.

All **27 provenance entries** independently matched both stored-file SHA-256 and recorded original-byte SHA-256/length. Where a source was newly gzip-wrapped, its decompressed bytes matched; targets whose original source already ended in `.gz` correctly matched the original compressed bytes. The README's general decompression wording should be read with that distinction. This review verifies the retained statements and byte lineage; the supplier's original upstream acquisition/archive verification remains attributed to that supplier. No upstream download or external legal determination was performed by this reviewer.

The exact frozen `derive-mpfb.mjs` was then executed with only its filesystem reads routed to the frozen commit and its writes captured in memory. Its fitting, morph, bone, skinning, UV and packing calculations were unchanged. Both outputs reproduced **byte-for-byte**: `native-data.js`, **3,428,098 bytes**, hash as above; and `derivation-report.json`, **13,077 bytes**, SHA-256 `bc45d9ca164c1e43245305b6be55007ef072443edf5606b5082dc2f77d3b72b1`. No asset or report file was rewritten.

### Independent tests and geometry/attachment checks

- `node --test fresh/character-assets.test.mjs fresh/character-motion.test.mjs`: **25/25 PASS**, no failures/skips/cancellations, 7.00 s. The native eye/nose rays use FrontSide geometry, UV-split indices address actual vertices, and head/hand source IDs exclude the helper range. The small changes to the old costume test remove the superseded generated-part/headband counts and zero-import assertion; motion timing, leg/contact tolerances, grasp tolerance, and draw-mesh bound remain intact. Legacy procedural facial utility tests were not counted as proof of the native face.
- Head, eye, hair, brow, mask and hand data had finite positions/normals/UVs, valid indices, no zero normals, and unit normals within the checked rounding tolerance. Native eyes/hair/brows had no triangle-versus-vertex-normal reversal; the face/mask exceptions are recorded separately below. Each generated collar contains 370 triangles and showed no face-versus-averaged-normal reversal in all four figures.
- **432 pose frames** across nine states compared the old base motion implementation against the new implementation using identical native rigs with `gripOffset` removed. **Every node's full world matrix matched exactly**, establishing the explicit zero-offset fallback independently of the new test's wrist-only assertion.
- For **384 non-death frames** using the actual nonzero grasp offset, pelvis, sword, scabbard, hip, knee and ankle world matrices exactly matched the same rig without that offset. **195 zero-grasp wrist observations**, including ordinary free hands, scabbard support and released hands, matched exactly; maximum difference was zero. The offset changes the arm target while preserving the existing weapon target. This is not a claim that a differently shaped whole figure has identical ground clearance in every falling pose.
- Existing tests check connected finger-chain lengths and skin-vertex clearance. An additional **26,464 hand triangle-interior samples** (centroids and edge midpoints across both 3,308-triangle hands) remained outside the actual handle cylinder's tapered circular envelope. This strengthens the vertex-only check but is not an exhaustive triangle collision proof and does not include every raised cord-wrap detail.

### Bounded normal concern, not an independently established major

The warden's face guard is made by offsetting selected head vertices **6 mm along the original normals** while retaining those normals. Of its **2,884 triangles**, **232** face against their averaged stored normals, totaling approximately **0.000563 m²**. Many are internal mouth/nose surfaces. The unoffset player/warden heads each have 16 such tiny lip triangles, totaling approximately **0.00000588 m²**; each posed hand has two small exceptions totaling approximately **0.00000332 m²**. These observations prevent a blanket claim of perfect normal consistency.

To distinguish hidden folds from exposed ones, the reviewer cast **4,505 actual FrontSide rays** over the warden lower face. The face guard was the nearest surface for **3,330** rays; **two** exposed upper-side samples had an interpolated normal pointing significantly away from the front view: local `(x,y,z) ≈ (±.079,.134,-.037374)`, face indices **1386/2807**, normal Z approximately **+.6474**. The issue was immediately reported to the integrator. Its limited measured exposure does not establish a new major visible defect without native imagery; it remains a concrete local offset/normal concern for the face-guard close views. Flipping material sides would not establish that the offset surface itself is sound.

### Loading, size and remaining validation

Source inspection confirms four same-origin Vite-resolved PNG assets, shared native materials, explicit pending/ready/failed states, and start/render gating in `main.js`. Node-only construction reports `geometry-only`. The independent browser-readiness apparatus review belongs to another assigned reviewer and was not duplicated here. Source readiness and the injected-loader unit test do not prove actual browser decoding/upload time or first rendered appearance.

The four exact frozen PNGs independently decoded fully with Pillow: skin **2048² RGB**, eye **1024² RGBA**, hair **2048² RGBA**, brow **512² RGBA**. Total original PNG bytes are **6,601,667**. A four-channel GPU representation would require **38,797,312 base-level bytes**, approximately **51.7 MB with a full mip chain**; that is a layout estimate, not measured GPU allocation or device performance. Native geometry also adds the parsed data module plus derived typed buffers. These costs require the real browser/mobile-oriented capture and existing timing gates.

**Finding:** no additional source-known blocker/major was established for this frozen first CC0 candidate; the limited face-guard normal issue is retained explicitly. The author reports 48 related tests and terrain tests from before the final collar extension. This reviewer independently ran the 25 tests above and does **not** reuse that earlier terrain result for the final collar; the exact integration terrain run remains the integrator's separate check. No native WebGL image of this candidate was viewed here. Static grasp after release, collar/head motion, skin/hair/eye appearance, helmet/face-guard fit, startup cost, and the separately reported hakama major remain relevant to the next native media. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

## Integrated Node scene-fixture repair — 2026-09-15

The integrator reported **205 passing / 6 failing out of 211** integrated tests: the vegetation helper's canvas-only fake document caused the native image loader to call an absent `createElementNS`. The assigned repair was limited to an optional character-resource argument in production presentation construction and explicit real Node geometry-only resource injection in the vegetation test helper. The previously failed foreground/leaf test rerun belongs to the integrator; this review did not claim or repeat a complete suite result.

| Reviewed integrated file | SHA-256 |
| --- | --- |
| `fresh/presentation.js` | `c1a8d323a62b8107682b23b8b85834d278812db4d11be125358cf0006731fe22` |
| `fresh/vegetation-test-support.mjs` | `fec52309bc6e323fbb67ce630682851089674d21dea0eb87cb5e3c6748f7a87d` |

The exact diff changes `createPresentation(canvas,{characterResources}={})` and chooses `characterResources ?? createCharacterResources()`. The test helper creates its real character resources **before** installing the canvas-only fake document, passes those resources explicitly, awaits `view.assetsReady`, and restores global descriptors in `finally`. It does not inject fake meshes, textures, a successful image-load count, or a `ready` status. The production `main.js` and `character-assets.js` hashes remained **`0a38ad3342bc964502134e1f49d6d831b3d418d975039ba9485e25e47af91c03`** and **`4951b0257e6a1cde08c0fab76fe38b902f6bb441773d54c539bb5fb10c515ac3`**. Main still calls the single-argument `createPresentation(canvas)`, so its four actual image loads, failure path, and start/render gate are unchanged.

This reviewer independently generated **one actual integrated Node scene, 236 meshes**, with the helper's renderer/Canvas2D stubs. Its diagnostic asset state was **`geometry-only`**, `textureCount:4`, `readyCount:0`, `pendingCount:0`, `failedCount:0`, `error:null`. Exact prior property descriptors for `document`, `innerWidth`, `innerHeight`, and `devicePixelRatio` were restored, including a deliberately non-enumerable preexisting width property. One additional **synthetic constructor-failure control**, without generating another scene, also restored every descriptor and propagated the original error. Reviewed hashes remained unchanged afterward, and the two-file diff passed whitespace checks.

Current callers await the helper sequentially within their test process. Because it temporarily replaces shared globals and yields while awaiting readiness, it is **not a guarantee of safe concurrent helper calls inside one process**; no such concurrent call was found in the reviewed callers. The success/failure restoration result concerns the actual sequential usage. The helper does not persist its fake document or alter the separately run production browser.

**Finding:** no blocker/major was found in this bounded apparatus repair. It preserves the distinction between geometry-only Node checks and production image readiness. This single-scene result is not a full-suite PASS, browser decode result, rendered quality finding, or a closure of the existing character/art findings. Only this owned evidence file was edited by the reviewer. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

## Closed-hakama candidate source review — 2026-09-15

The integrator assigned the same independent Ultra reviewer the cloth repair **`f869fc24b2bc0143e33eda8d104fe474f16cd1b7`**, based on the first CC0 candidate **`1e7eed79e7dec1ce28470c77c1fb93a74e40cd15`**. Its nine-file delta was present in the canonical checkout over **`e18820165d6008fedfca28d2cc7073a9c4b74b28`**. The three runtime files matched the frozen author commit before and after this review. The concurrent whole-scene capture timeout investigation was assigned elsewhere and was not diagnosed or attributed to cloth by this reviewer.

| Frozen runtime file | SHA-256 |
| --- | --- |
| `fresh/character-rig.js` | `7ab85050957c92c1dab84ff560ea51ab9a2420bf94b7a156d483c3071a55c667` |
| `fresh/character-sculpt.js` | `f608c38f6f2e3b8fb9b02b52a3b1aac8cdde1a46e34242535ec1c1a00983eb4c` |
| `fresh/character-motion.js` | `488d5f2f8994272e5473f36b5ed7dc7ba8427caa4e079ce1092b9df6b74a009b` |

### Implementation and test meaning

Each leg now has front/back semicircular surfaces meeting at the side seams, with a rolled inner hem. The four indexed meshes contain **2,592 current vertices**. Below the fixed waist, their centreline and cross-section rotation follow the actual thigh and calf matrices; the existing cloth driver, world-down sag, and local thigh/calf capsule projections affect only the cloth. The floor pass uses the current transformed cloth box for its optional terrain maximum early-out, then updates current vertex positions against actual terrain. The old whole-panel path remains available when the new rest-surface data is absent.

Source inspection confirmed that actor input, authored pose tracks/action times, leg IK, native arm grasp-offset rules, and weapon construction/trajectory were not edited. The dynamic surface directly owns its Mesh, sets the position update flag, recomputes normals and box/sphere bounds, and aliases `userData.contactPositions` to the exact current position buffer. Consequently the ordinary visible/depth passes and the existing CPU contact scan consume the same geometry; this is not a GPU-only deformation with a stale CPU proxy. Pause and settled-death early returns occur before the cloth mutation path.

The three new tests use actual knee and cloth intersections at the specified running/falling fixture times. They assert that a ray genuinely hits the leg and that its corresponding cloth is in front of it; their success is stronger than merely checking for any cloth hit. They also check current contact/position equality, finite normal coverage, current bounds, a fixed waistband, and pause/retry behavior. Their finite camera rays do **not** prove coverage of the whole leg from all angles, absence of self-intersection, or a natural silhouette. No existing test threshold was relaxed by this delta.

### Independently performed checks

- `node --test fresh/character-cloth.test.mjs fresh/character-motion.test.mjs`: **23/23 PASS**, no failures/skips/cancellations, 7.99 s. The author's separate 51-test and four-test terrain results were read as author evidence, not substituted for these independently executed checks. A complete terrain/full suite was not repeated.
- Reviewer-authored stdin code sampled **150 frames / 388,800 current cloth vertices**: running and death on the flat route and sun-ring shoulder, plus broken stance on the shoulder. It compared the real terrain function with its `maximumInRect` optimization against an otherwise identical wrapper without that method. **All motion metrics, cloth positions, and cloth normals matched exactly.** This checks the optional bound's result preservation, not a timing improvement.
- Every sampled current contact array was the same array as the draw positions, every vertex was inside its current box, and every normal was finite and nonzero; minimum normal length was approximately **0.9999999543**. Minimum sampled cloth clearance over actual terrain was **+0.0029999984 m**. The maximum paired front/back seam-position gap was approximately **3.35e-17 m**.
- The exact preserved 1e7 rig/sculpt/motion sources were loaded in memory for a compatibility comparison. Across **270 frames in nine states**, running the new motion code on the old rig produced **identical complete world matrices and motion metrics** to the old motion code, confirming the fallback rather than only reading its branch.
- Comparing the actual new cloth rig with the preserved old rig, **240 non-death frames** retained identical common articulated-joint matrices and motion metrics. The sword world matrix matched in **all 270 frames**, including death; the 30 sampled death frames also had zero body-position difference. These finite observations support unchanged leg/weapon/timing behavior, without making a universal contact or geometry claim.

### Concrete remaining seam-normal concern

The front/back seam positions coincide, but the two meshes compute normals separately. The additional seam check found a maximum normal difference of approximately **15.0° at running frame 14**, **138.9° at flat-ground death frame 10**, and **159.0° at sun-ring death frame 13**. The last case is the right leg, row 11, front boundary column 0; world point approximately `(-11.112925,1.076544,7.371242)` for actor origin `(-11.2,7)`, yaw `.7`. Front/back local normals there are approximately `(-.331,.942,.054)` and `(.603,-.787,.131)`. At the previously identified flat-ground death frame 12, the maximum seam difference is approximately **93.0°**.

This is a concrete discontinuity to inspect in the native death silhouette and shading. Large differences may coincide with a sharp local fold; the static diagnostic alone does not determine whether it becomes an objectionable visible line or folded-over surface. It was returned immediately to the integrator. The current construction does not solve cloth self-collision, and no blanket claim of smooth normals or all-view body coverage is made. Averaging a seam's normals alone would not establish that any underlying fold geometry is sound.

**Finding:** no new source-known blocker/major was established in this bounded technical review; the seam-normal concern remains explicit. The author's reported additional **0.9–1.3 ms per actor/frame** is retained as a local Node result, not independently rebenchmarked or interpreted as browser/mobile performance here. No new WebGL cloth frame was viewed. The earlier independently observed running-knee and fallen-board **visual major is not declared closed** by these source tests or the author's CPU projections. Its closure requires the exact integrated candidate's actual run/death media, including the seam locations above. The CC0 face-guard concern and other native-art limits are unchanged. Only this owned evidence file was edited by the reviewer; no production, remote, staging or automation changes were made. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.


## First CC0 candidate actual motion media review — e188 / CI 34978382509

This review used the recovered original media at `.review/34978382509/experience/motion-study/`, whose report identifies **`e18820165d6008fedfca28d2cc7073a9c4b74b28`**. The integrator reports retrieval of these owned artifact bytes from the ordinary CI job log with ZIP/CRC/SHA checks. This reviewer independently hashed the received report and every original MP4, decoded every video, and inspected the finite native frames below. The artifact retrieval itself was performed by the integrator. The media contain the first CC0 head/neck/hands candidate; **neither the closed-hakama f869 repair nor the later collar/shoulder/face-guard c824 repair is present**. The source reviewed above and these media must not be combined into a visual closure of either later candidate.

The exact e188 Git objects independently yielded these character runtime SHA-256 values: rig **`5266988e51e0f49aaa30beb69fc55a1d6922cc0805bffe01de9f31ff4e1fa47a`**, motion **`0f47020978f7b651d865479a108ced355d55faf5f4d574c4d996e5f1e8442352`**, native data **`b0300de3b9e1a554af7d4586dff412857e262c9a4e88ffb3510b14dbb8ca001b`**. This avoids attributing the current working tree's later cloth or anatomy changes to the older film. The report SHA-256 is **`0900910642ffff819a0b045b1b2e0d30243718764c4f72ead2c3754b5eb7046b`**.

### Independent decode and exact visual sample

`ffprobe -count_frames` independently confirmed **14 clips / 474 frames / 39.5 seconds**, all **960×540, 12 fps**. All 14 originals passed `ffmpeg -v error -xerror -i <original> -f null -` with no error output. The report's own `fullDecode:passed` was not used as a substitute for this independent execution. Original media hashes remained unchanged after inspection.

The reviewer individually viewed **94 distinct native, unscaled extracted frames across all 14 clips**, including consecutive running frames 12–15 and falling frames 9–12. Frame numbers below are **zero-based**, and each exact displayed time is **frame / 12 seconds**. There was **no continuous playback and no audio listening**. Full decoding of 474 frames does not establish that every frame's content was visually examined. The review also directly revisited three previously inspected acf frames—run 14, death 12, victory 18—for a **source-known, non-blind diagnostic comparison**. Those revisits are not included in the 94 new-frame count.

| Original clip | Decoded frames | Independently viewed zero-based frames | Original SHA-256 |
| --- | ---: | --- | --- |
| `attack.mp4` | 36 | 0, 3, 6, 12, 18, 24, 30, 35 | `f792e00db03d06db74925bffabef5b58d24162377d61d99607b301e32cee8f77` |
| `block.mp4` | 24 | 0, 3, 6, 12, 18, 23 | `676dca42e8dec96b4c6d0260f904e4ac841f70f1ba375cb12c1c0a90a315841b` |
| `broken.mp4` | 30 | 0, 6, 12, 18, 24, 29 | `b39a70b9907f5741b742d8d78c294e400408cadad0d1240eff003b0f4ae215fb` |
| `death.mp4` | 36 | 0, 3, 6, 9, 10, 11, 12, 15, 18, 24, 35 | `ff066e8b6a1638712385d55adbda8f54a2b70e9a3450f4a94bbb5ca3c465349c` |
| `dodge.mp4` | 24 | 0, 3, 6, 12, 18, 23 | `907798213b7530953605ee282fceddee7cbcfdb50a1e7ad89819a92bae260a47` |
| `guard.mp4` | 24 | 0, 6, 12, 23 | `f788666b3b3b9b301a937981154f215aab1de20fe800d58957007f80baae4450` |
| `hit.mp4` | 24 | 0, 3, 6, 12, 18, 23 | `ad19b2f54f0fa7518fd7caca8b1bc81858801d9beb59c0103bcdd74c57f4f5ea` |
| `idle.mp4` | 36 | 0, 18, 35 | `f0de382f0f31786d0fc68da6c3b735c497bb6d712724e2b692061b405db22884` |
| `parry.mp4` | 24 | 0, 3, 6, 12, 18, 23 | `010b9b5b279c763512ed5dc9d5033bd5ea6b314190081c11d924d224cc70c3d3` |
| `start-run-stop.mp4` | 48 | 0, 6, 10, 12, 13, 14, 15, 18, 24, 32, 40, 47 | `89fdd232815ec03a14987fad3170add7157f74011de398a9ff8804fa3d127c35` |
| `turn.mp4` | 36 | 0, 9, 18, 27, 35 | `b48cd5095483b62a059fa86159ce892da29ea7bbe3746894315e488390fbf46c` |
| `victory.mp4` | 48 | 0, 6, 12, 18, 24, 30, 36, 42, 47 | `e6dc16a69d3f738ef7bfa46e211e426302aaacd08d7c53410b51a15d3764bb93` |
| `wind.mp4` | 48 | 0, 12, 24, 36, 47 | `18e6cda9134ab3919a797bf215ac1d978772ae4ac17d509e80ac653604fd72b6` |
| `windup-attack.mp4` | 36 | 0, 6, 12, 18, 24, 30, 35 | `29dbcd685d24c3f2a2c2f345953d10b03c1b76153567d382269139685c3d2119` |

The extraction/index directory is `/workspace/scratch/27301e95ee53/independent-motion-view-34978382509/`. Its `independent-view-index.json` records every original file's byte size, probe result and hash, plus every extracted frame's exact time/hash and viewed flag. Its final SHA-256 is **`da8286fc189c1eef02fcec1d7f53a47026f0072f23b4d8ac2b90baa35a59caf8`**. No scale, repainting, interpolation or contrast adjustment was applied to the inspected PNGs. Extraction and the index were stored separately from the preserved original films.

### Character findings within these samples

- **The existing open-hakama visual major persists.** At run frame **13 / 1.0833 s**, the dark knee appears as an oval patch in the blue front panel; at frame **14 / 1.1667 s**, the lifted thigh/knee projects in front of the straight hanging panel. Death frames **9–12 / .75–1.00 s** retain the thin blue hems projecting outward as rigid fins. The same failure pattern is visible in the explicitly revisited acf samples. This is not evidence against the unfilmed f869 repair, and that repair is not declared successful by these older media.
- The visible native head remains associated with the neck/body through the sampled run, front-to-side/back turn, windup, hit, broken stance and early fall poses. No newly detached head, separated hand, inverted knee or grossly displaced sword was established in these **finite** samples. The late fallen head is largely hidden by the torso/legs from this camera; absence of a visible head in those views is not independently classified as disappearance or ground penetration. The samples do not show its hidden contact surface.
- Guard, windup and attack samples show the hands around the hilt; victory frames **6/12** show the raised sword, **18/24** the turn toward the waist, and **30/36/42/47** the sheathed ending. Death samples show the sword lowering and then lying separately near the fallen actor. These observations establish only the visible large-scale attachment sequence; they do not establish exact finger-to-wrap contact, collision-free sheathing, hand relaxation after release, or the quality of motion between sampled frames. Windup frames 6 and 24 place the hands/hilt in front of the face from the inspection camera; 2D overlap alone does not establish penetration.
- The roughly 220-pixel standing figure, with a face only a few tens of pixels high and much smaller fingers, limits this motion medium's ability to judge collar seams, skin/eye/hair texture, grip details or face-guard normal defects. Only the player is inspected here. The other three character faces, helmet/warden guard, underside/back contacts and actual four-character combat are not covered. The later author-reported collar/shoulder repairs remain unviewed in native media.

### Additional actual landscape concern

The direct **acf versus e188 run frame 14** comparison shows a conspicuous background difference: the earlier bamboo carries readily visible leaf clusters, while the e188 view is dominated by long bare-looking stems with extremely thin horizontal lines or dots where foliage would be expected. The e188 guard, victory and five wind samples show the same weak foliage readability. This was reported immediately to the integrator as a **visible landscape regression candidate requiring investigation**. Changes in source, geometry, shading and scene assets coexist between revisions, so this review does not assert that the leaves were deleted, that a particular shader caused it, or that every leaf is affected. The optional wind samples show pointed foreground grass, broad dark ground shadows, lanterns and paving, but do not establish beam/leaf physical correctness, foreground transparency behavior, or environmental quality acceptance. This concern is separate from CC0 anatomy and does not constitute a new head/hand collision finding.

**Bounded result:** all 14 received videos decoded successfully, and 94 actual native frames were independently inspected. No additional large character attachment/collision blocker was established beyond the known open-hakama major in this finite view; the foliage appearance concern remains explicit. The integrator reports the ordinary fresh route was cancelled after its 211-test pass when the subsequent capture did not complete before its deadline, while the experience job's input/exploration/audio/14-motion steps succeeded. This review neither re-verifies that entire CI status nor calls the complete CI successful or the slowdown resolved. The authored 12-fps isolated study uses synthetic states and an inspection camera; it is not real-time gameplay, real-device FPS, a normal-input route evaluation, or a formal reference comparison. No audio was heard. All 10 formal elements remain **not measured**, and deadline **2026-09-20T07:51:53Z** is unchanged. Only this owned evidence file was edited in the repository; no runtime, remote, staging or automation changes were made by the reviewer.


## Collar, shoulder and face-guard candidate c824 — independent technical review

**Disposition: a concrete moving-neck opening was found; the integrator placed c824 adoption on hold.** This is a source/geometry finding, not a new native-image judgment. The assigned frozen source is **`c824c1a61ba3e78c6a7c46d140d2b7ef256288c1`**, immediately after **`f869fc24b2bc0143e33eda8d104fe474f16cd1b7`**, in `/workspace/scratch/27301e95ee53/game2-mpfb-pilot`. The isolated checkout's HEAD matched c824 and its tracked files were unchanged. The corresponding canonical runtime files matched those Git objects. The canonical diagnostic HEAD and its separate capture-runner changes were not used as the character source identifier. The prior e188 film does not contain c824 and supplies no proof of this repair's behavior.

| Frozen reviewed file | SHA-256 |
| --- | --- |
| `fresh/character-rig.js` | `c46614da78db499e726b2a0a6456b95714081cb4ef60fbf18d88ea2ac5137348` |
| `fresh/character-sculpt.js` | `89c5045e3760230948b1b0b6f6ee3d12d3512dbd61bc733b198bca80e3713689` |
| `fresh/character-assets.js` | `9c644cf2a8cda1021e12a47213054c0b414d90cc5426cf5ecb8f20fc9474d3a3` |
| `fresh/character-assets/native-data.js` | `18b4a2265516c11ef7a71da2ff47de00f172598acc58d1d6f4f0daf8c2fa3dc4` |
| `fresh/character-tools/derive-mpfb.mjs` | `deebea6f837630bde10e47a30fd0c64628aaef5221e2f0abd53e8bce48daf5c9` |
| `fresh/character-tailoring.test.mjs` | `547af0fc21568165a7ce6dcf4acf7e8da3d1104922c74cbdd544543cf6c704f0` |
| unchanged `fresh/character-motion.js` | `488d5f2f8994272e5473f36b5ed7dc7ba8427caa4e079ce1092b9df6b74a009b` |

### Major technical finding: the rotating neck cut leaves an opening above the fixed collar

`tailoredHead()` removes the original lower skin at a cut nominally **7 mm below** the collar neckline. The clipped skin follows the neck joint; the collar is attached to the chest. The clearance is adequate for the inspected idle pose but insufficient for existing authored neck rotations. Checking 231 near-cut vertices over seven authored states at .05-second intervals found the cut rising approximately **12.34 mm above the neckline in broken stance at age .30**, **7.27 mm in death near .50**, **6.23 mm in victory near 1.45**, and **5.20 mm during stagger near .05**. These heights are geometric relations in the chest/neck frame, not image pixel sizes or a measured penetration depth.

The reviewer then checked the **complete generated player rig**, advanced with the real `updateCharacterRig()` at 1/60-second increments. For each pose, **64 directions × 51 heights = 3,264 rays** traveled from outside the neck toward its axis. A defect sample required both of these conditions: the ray hit **no mesh anywhere in the complete candidate rig**, while the same ray hit the **original unclipped head** at the exact same `neck.matrixWorld`. This includes potential occlusion by the collar, tunic, arms, armour and all other actor meshes; it is not a standalone collar test. The positive-control head uses **FrontSide**, matching the production skin's face-culling setting. A preceding DoubleSide control yielded the same counts and was explicitly repeated with FrontSide to avoid a permissive positive control.

| Actual sampled state | Actor age, seconds | Rays per pose | Candidate misses with original-head positive hit |
| --- | ---: | ---: | ---: |
| idle | .30 | 3,264 | 0 |
| broken | .30 | 3,264 | 139 |
| dead | .50 | 3,264 | 84 |
| victory | 1.45 | 3,264 | 49 |
| stagger | .05 | 3,264 | 51 |

Thus the final FrontSide control covers **16,320 finite ray configurations / five poses**. A concrete front-facing broken-stance example is ray origin **`(-.0402068298,1.0742587477,-.3457899789)`**, direction **`(.1141934800,.4429518354,.8892432292)`**, near 0, far .2 m. The complete c824 rig returns no hit; the original head returns a front-facing hit on face **6589** at approximately **`(-.0255741234,1.1310184170,-.2318427108)`**. The actor origin is `(0,0)`, yaw 0, on the default flat ground. This supplies a concrete reproducible opening, not merely an assumption from the relative cut height.

The four new tailoring tests check neckline/hem support at rest and therefore miss this existing-motion failure. Closing or hiding the cut only at rest does not repair the moving attachment. The finding was returned immediately as a **Major technical candidate** against the repair's neck-continuity purpose, and the integrator explicitly put adoption on hold and assigned the next author repair. How prominent the opening appears in the next native camera/light configuration remains **unmeasured**. No production edit or extra approval flow was introduced by the reviewer.

### Separate local face-guard intersection residual

Independent inspection of the warden's **4,112-triangle** guard found **zero nonfinite attributes, degenerate triangles, negative face-versus-average-normal triangles, or invalid oriented indexed edges**. Every indexed edge has two incident faces with opposite edge directions, and its signed volume is positive. The same checks passed all **eight 596-triangle shoulder shells** (both sides, rows 0–3). This is useful closed-surface and orientation evidence; it is not a guarantee of clearance from the body or smooth shading.

A separate guard/head clearance investigation initially used **2,949 radial probes** at the inner vertices and inner-triangle centroids. A -15.51 mm radial result was **not retained as penetration depth**: the ray crosses the front and rear of the projecting ear before reaching the cheek, so a nearest radial surface alone does not identify solid-body penetration. The reviewer explicitly corrected this interpretation with the integrator.

To test actual contact, all **6,168 unique guard edges** were cast as finite segments against the real original head triangles. They yielded **28 surface-crossing hits**, including both outer and inner guard edges near the two upper side rims. Example outer-edge crossings on edge `(1026,1027)` lie at approximately **`(.085873273,.135895741,-.020823044)`** and **`(.081650713,.136048838,-.018190056)`**, on head faces 3896 and 3625. The corresponding left-side crossings occur around X = -.082 to -.086. This is a concrete surface-intersection residual near the ears/upper cheeks, independent of the guard's otherwise valid topology. Its depth and visual severity were **not established**; the 28 results are edge/surface crossing hits, not 28 independent visible flaws or an exhaustive triangle-pair intersection count. It was returned for the next native side/three-quarter views rather than declared visually resolved.

### Preserved source and independently executed existing tests

The reviewer parsed both frozen native-data versions and compared every field. **All four original head, eye, hair and brow position/normal/UV/index/source arrays, profiles and bounds are identical; both posed hands, grip offsets and landmarks are identical; all non-figure data are identical. Only the figures' mask data changed.** The worn head is a new clipped runtime derivative, so preservation of the stored original head must not be described as an unchanged rendered neckline.

All four original texture PNGs were byte-identical to f869, retaining their previously recorded SHA-256 values. `character-motion.js`, `main.js` and the provenance file were byte-identical. The entire `createNativeCharacterResources()` implementation, including texture materials, loading/readiness and failure logic, was also byte-identical. The changes introduce no new image/network dependency or readiness bypass. The new synchronous collar-fitting helper samples the original neck with rays and caches its ring by data object; its temporary fitting geometry/material are disposed. Its startup cost was not independently benchmarked here.

`node --test fresh/character-tailoring.test.mjs fresh/character-assets.test.mjs` independently completed **9/9 PASS**, no failures/skips/cancellations, **2.84 s**. These include four new actual-surface checks for shoulder support/closed edges, the rest neckline and tunic seam, the guard's clear nose and closed rim, and the hair knot ahead of its uncapped winding band; the five asset tests cover native eye-facing geometry, hand lengths/clearance, actual grasp trajectories, free-wrist exclusions and texture readiness/failure. They were read for their actual assertions; none proves the moving neckline remains closed. The author's **55 + 4 terrain PASS** remains author evidence and was not substituted for this independent result. No complete suite, build, terrain grid or performance benchmark was repeated. The reviewed source diff passed whitespace checks.

The next exact repaired candidate needs native **broken .30, death .50, victory 1.45 and stagger .05** views of the front/back neckline, plus both side/three-quarter warden ears and upper guard rims. Shoulder attachment should also be viewed with raised arms, and the small hair knot from above/back. The earlier cloth seam-normal concern and run/death visual closure remain separate open work. None of the earlier e188 motion observations is applied to c824 as an acceptance result. All 10 formal elements remain **not measured**; deadline **2026-09-20T07:51:53Z** is unchanged.

### Read-only reproduction of the complete-rig neckline finding

Run the following stdin script from an exact c824 checkout with its existing dependencies. It writes no file and does not modify geometry; the original head is a separate positive-control mesh. Expected counts in order are **0,139,84,49,51**. The fixed state inputs are a finite synthetic geometry diagnostic, not a normal-input gameplay claim.

```bash
node --input-type=module <<'JS'
import * as T from 'three';
import {createCharacterRig,createCharacterResources} from './fresh/character-rig.js';
import {nativeFigure,nativeGeometry} from './fresh/character-assets.js';
import {updateCharacterRig} from './fresh/character-motion.js';
const resources=createCharacterResources();
const controlMaterial=new T.MeshBasicMaterial({side:T.FrontSide});
for(const [state,age] of [
  ['idle',.3],['broken',.3],['dead',.5],['victory',1.45],['stagger',.05]
]){
  const rig=createCharacterRig('player',resources);
  const actor={id:'player',x:0,z:0,yaw:0,hp:state==='dead'?0:100,
    state:state==='victory'?'idle':state,age:0};
  const world={time:0,mode:state==='victory'?'victory':
    state==='dead'?'defeat':'playing',events:[],locked:null};
  for(let t=0;t<=age+1e-8;t+=1/60){
    actor.age=t;world.time=t;
    updateCharacterRig(rig,actor,world,1/60);
  }
  rig.root.updateMatrixWorld(true);
  const control=new T.Mesh(nativeGeometry(nativeFigure('player').head),controlMaterial);
  control.matrixAutoUpdate=false;
  control.matrix.copy(rig.neck.matrixWorld);
  control.updateMatrixWorld(true);
  let gaps=0;
  for(let i=0;i<64;i++)for(let j=0;j<51;j++){
    const a=i/64*Math.PI*2,y=-.03+j*.001;
    const axis=new T.Vector3(Math.sin(a),0,Math.cos(a));
    const origin=rig.chest.localToWorld(axis.multiplyScalar(.2)
      .add(new T.Vector3(0,y+.315,.01)));
    const target=rig.chest.localToWorld(new T.Vector3(0,y+.315,.01));
    const ray=new T.Raycaster(origin,target.sub(origin).normalize(),0,.2);
    if(ray.intersectObject(rig.root,true).length===0 &&
       ray.intersectObject(control,false).length>0)gaps++;
  }
  console.log({state,age,rays:3264,gaps});
}
JS
```

Only this owned evidence file was edited in the repository. No author source, native asset, runtime test, remote, staging or automation file was changed. The integrator requested the bounded review end after recording these findings; no additional discretionary checks were started afterward.
