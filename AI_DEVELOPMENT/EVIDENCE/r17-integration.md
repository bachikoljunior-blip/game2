# Round 17 integration checkpoint — 2026-09-11

Base: `4e6d23a40af33bb3ba409b3826e77666262ce353` on remote main. User explicitly requested development until the existing criteria are met, superseding the prior Round 16 stop. Overall product verdict remains **NOT PASSED**.

## Executed locally

- `node --test tools/check-*-r17.mjs`: 8 files passed, zero failed/skipped. These exercise actual Input, Player, Camera, Rig, Enemy, Combat, Level and the injected harness where a GPU is unnecessary. Owner evidence is in the adjacent `r17-{player,anim,enemy,combat,world}.md` files.
- UI: all six actual targets (four actions, context action, pause) remain disjoint in eight landscape/notch/handedness layouts, including 568×320 at the real HUD scale of 0.8. Visible targets ≥48px, hit zones ≥64px and safe-area/OS margins ≥16px. Cancelled gestures, paused pending inputs, neutral gamepad release, mouse interaction and Space retry leakage were tested.
- Corrected metrics retain the existing thresholds. Synthetic traces distinguish held windups from attacks with <140ms warning, reject repeated/short chained windows, and classify execution deaths by the real event's `victim` and impact phase.
- Project-state schema, 30-file ownership map and 43-file vendored-kit integrity passed.
- Production build passed: main 328.80kB gzip, Rig 38.18kB, Three 119.64kB, entry 1.13kB, HTML 2.25kB. Total approximately 490kB gzip, below the 1.6MB bundle cap. Browser boot time and working-set texture memory are separate gates.

## Changes requiring the browser gate

Normal production no longer publishes mutable inspection globals unless explicitly loaded with capture/debug mode. Start is idempotent. Context loss suspends the loop and input; restoration regenerates the sky environment, rebuilds temporal/exposure/focus targets, and resumes input according to the current menu/death state. These graphics recovery paths have been reviewed in source; GPU restoration has **not** yet been measured.

The browser driver resets through real Combat.reset and Player.respawn. Landmark anchors come from the authored geometry; approach eyes raycast from walking head height rather than above roofs. Neither correction is a visual quality claim.

## Measurement conditions and outstanding work

Local Chromium exits SIGTRAP before opening a page. The supported Cloud Browser reaches the existing public game but cannot create a WebGL context. Neither environment produced usable 3D evidence. The candidate branch's CI therefore requests coherent baseline/candidate phone-MEDIUM five-shot sets plus interaction traces with 20 encounters.

The baseline job uses the unchanged historical harness. The candidate fixes its run/sprint value, yaw sign, encounter reset, reaction policy and deliberate-bell prerequisites, and records these differences in each trace. Cross-version values are **not** identical-stimulus comparisons. The pure Node before/after fixtures hold their stimulus constant. A rendered holdout run and independent visual critique remain required before integration into main.

No real-device frame-rate, thermal, digitiser, audio, human usability or reference-footage comparison is claimed. The 62 benchmark entries and their thresholds have not been relaxed or marked passed on the strength of these focused checks.
