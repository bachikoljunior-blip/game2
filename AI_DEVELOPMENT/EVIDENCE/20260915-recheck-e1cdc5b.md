# Independent bounded recheck

Reviewed checkout: `e1cdc5b5a80570bc62493b26b5dfa2b57a91b472`.
Reviewer: `/root/game2_ultra_seven_fixes/independent_runtime_review`.
Scope: only the previously reported P1 camera and P2 optional-loop direction findings. No new finding search was performed. No production source, remote state, automation, or other producer files were modified.

`git diff --name-only bd4e64f9 HEAD -- fresh` reports only `fresh/audio-pcm.test.mjs`; the candidate's runtime modules are unchanged between these revisions.

## Results

- **P1 camera: original nonrendering repro resolved.** Repeated the twelve exact camera fixtures (six discovery points, both chosen-enemy-dead/branch and all-enemies-dead/rejoined modes). All twelve now disable the authored rejoin/arrival camera and select ordinary following. At 844x390, every fixture places the player about 6.496m from the camera, with feet NDC y=-0.4371, head y=0.1539, and projected height 115.25px. Previously affected points were outside the frame or reduced to 18-41px. This checks the settled target frame, not the perceptual quality of the camera transition in a real recording.
- **P2 abandoned entrance: original nonrendering repro resolved.** Repeated the same continuous 3.8m/s water route: touch `(-8,15)`, abandon via central x=-8, reach `(-5,-15)`, then visit every node in reverse. Both discoveries are recorded, `completed=["water"]`, direction=-1, next=-1, and exactly one completion event is emitted. Previously completion remained empty.
- **Related existing regression checks: 5/5 pass.** Selected only the relevant tests: ordinary loop completion, cancelled/partial entrance restart, camera release on optional walks, both physical exits visible in the rejoin vista, and unlit arrival preserving the signal/victory frame. The cancellation test covers all three loops, both directions and entrance-only/partial abandonment.

These two original static findings are closed for the reviewed implementation. Same-revision real rendered evidence is still required to assess visible transitions and exploration usability. The other previously reported actor/shadow/solid-prop items are under separate repair and are not reclassified here. No audible media was listened to, and no formal quality element verdict is made; all ten formal comparisons remain not measured.
