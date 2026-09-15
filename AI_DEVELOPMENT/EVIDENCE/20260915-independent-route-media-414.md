# Independent actual-media diagnosis — 4141633 / CI 34952868959

This is a finite implementation/visibility diagnosis of source `414163336db8a5a73a090ad12ebf88999475491c`, not a review of final `927743f` media. Chromium/SwiftShader recordings are actual browser renders, but do not establish physical-device performance. No audio was heard or evaluated. The fixed ten-element anonymous real-work comparison remains **not measured**.

## Finding: P1 — opaque scenery hides the actors during ordinary locked combat

**Touch right route, second enemy:** `touch-continuous.webm`, decoded first frames at/after raw video 68–76 seconds. Two foreground red banners cover nearly all the actors' torsos and blades. At 70s the target HUD reads 100/100, at 71–72s 66/100, at 73–74s 32/100; at 75s the kill message appears, still behind the cloth. A narrow shoulder/foot or the top of a head occasionally remains visible; the combat actions cannot be read. This is not the earlier camera lag moving the actor outside the viewport.

Evidence: `touch-cloth-detail.png`, `touch-070s-exact.png`, `touch-073s-exact.png`. The exact seek frames are unscaled native 844x844 capture frames with actual 844x390 landscape content at the top. Grey padding is a recorder consequence, not a game defect. Only the overview sheet crops the padding.

The recorded route's ridgeSamples place the player at x=5.113044932508011,z=-9.749571194670013 from worldTime35.73333333333259 through37.733333333332475, during the overlook-warden encounter. The preceding encounter trigger is x=5.284444678067459,z=-9.631600271115849. These points constrain reproduction; they are not claimed to be frame-exact synchronization with video seconds.

**Desktop right route, final enemy:** native raw video 73–74s, particularly `desktop-right-074s-exact.png`, also demonstrates scenery occlusion. The central ridge fills the foreground, leaving only the enemy's head cap while the target HUD reads66/100. At75–77s the camera brings the enemy back into view. This is another instance of the same combat-sightline omission, though shorter than the cloth case.

Relevant source at exact414: `fresh/presentation.js`183–191 builds opaque route cloth;539–547 fades only `toriiPosts`. Ridge meshes are built164–174. `computeCameraFrame` determines lock position from actor positions but checks no scene sightline. Native checkpoints do not include these combat intermediate frames, so the reports' passed checkpoints are consistent with this defect.

Concrete correction: keep both actors' torso/head and the attack-bearing hands/blades readable from the active combat camera. Account for individual foreground cloth and solid scenery along those sightlines, using local object fading or a bounded camera alternative with confirmed visibility. Shared cloth/stone materials require care: changing one shared opacity must not fade every banner or every rock across the world. Preserve physical collision, landmark identity, wind/depth alignment, and normal camera transitions. Re-run the same raw input routes and inspect these battle intervals; projection of a point into the viewport alone does not test visibility through opaque scenery.

The camera module is identical in local927 versus414. The presentation diff adds only startup rig seeding/beginWorld. Thus the later startup correction does not independently close this scene-occlusion finding.

## Other bounded observations

- All32 supplied checkpoints were inspected in four route overviews. Rejoin4 and two initially suspect arrival/signal checkpoints were inspected at native resolution. All four real-route records were sampled across gameplay; all four reach an illuminated signal and a readable victory/retry panel in the viewed frames. The original report also records successful real-input completion, pause/retry and no browser errors. This does not claim every frame was watched.
- Native route imagery now contains bamboo leaves, grass, cloth and cast shadows. The old missing-vegetation shader failure is not reproduced in these mainline samples.
- Both physical branch exits and the shrine appear in the authored rejoin camera samples. The global exploration camera defect cannot be considered visually closed from these mainline routes alone; the corrected exploration media are still awaited.
- Touch-right arrival has a temporary foot/lower-leg crop at raw108s. Torso remains visible; raw109–111s returns the complete player to frame before the signal. This is not escalated to a new major finding.
- Portrait victory/retry at the end of touch-right was directly viewed in the uncropped native844x844 recording: the actual390x844 viewport retains readable text and retry within it.
- Startup cadence defect in414 was already separately identified and CPU-closed at localf578df0. These videos predate that correction and are not evidence for its visual/audio closure.
- The13 motion studies, plants/6POIs/exploration records have not yet arrived for this CI run. No claims about their final quality are made here.

## Scope and provenance

Source files were read only. No production edits or remote changes were performed. Diagnostic extraction and this report exist only under the independent `runtime-review` directory. Original SHA256 hashes and sample counts are in `review-provenance.json`; the earlier coarse temporal sampling settings are in `sampling.json`. The source/raw videos were not modified.
