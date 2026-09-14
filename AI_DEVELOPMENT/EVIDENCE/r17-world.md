# Round 17 world: interactions, encounter loop and critic-directed landform/prop repair

Scope: `src/world/Level.js` from the earlier interaction pass, plus the current owner's
`src/world/Terrain.js`, `src/world/Props.js`, `tools/check-world-r17.mjs` and this record.
No lighting, camera, layout or Foliage source was retuned. Evidence collected with
`node tools/check-world-r17.mjs`; no browser, renderer, production build or phone run was
performed by this owner.

## Round 17 source-blind critic follow-up

The separate refuter retained the mountain as a blocker, narrowed the close hanging lantern
to a minor local-legibility issue, and retained the hero sacred-tree symptom. None of the
source changes below is a visual PASS: the unchanged native framings and 25% views still need
new rendered capture and independent review.

### Mountain: the visible owner and the repeated-fold mechanism

Rays through the critic's native `wide [800,130,480,165]` mountain-only crop strike the
macro terrain at **480 / 438 / 410 m** for its top-left, centre and bottom-right samples.
All are outside the 256 m core but far inside the 1.8 km distant-band hand-off. This proves
that the visible construction is `Terrain._macro` carried by the clipmap, not the distant
ridge-band shader and not a missing fine-texture path.

The largest north-west term there was isotropic `ridged2`: every maximum used the same
radial construction, so adjacent maxima produced the repeated pyramid/fold organisation
seen beneath the already-measured fine surface ripple. That term is now broadly blended,
only across the visible north-west massif, into one warped primary ridge plus two lower
branching shoulders. They share a backbone and different widths instead of forming a row
of independent cones. The three structural samples are pinned at **1021.94 m** for the
primary against **914.37 / 917.94 m** outer flanks, **961.07 vs 872.81 m** on the western
shoulder, and **893.40 vs 843.35 m** on the eastern shoulder. Terrain topology, clipmap
triangle count, WORLD constants and the core/plateau hand-off are unchanged.

### Hanging lantern: persistent form-following supports

The old sinusoidal belly ripple could affect shading but did not provide a persistent
support silhouette under strong emission. Three narrow split-bamboo hoops now follow the
actual body radius at 27%, 50% and 73% of its height. They use the existing lit-paper
material at lower vertex intensity and are merged with the body: paper remains **one part**,
while its source geometry changes **504 → 660 triangles**. Each hoop contributes 58 tested
support vertices. Emissive intensity, colour, flame, spill and the standing tone gate were
not changed. With nine authored chōchin placements, the conservative all-visible submitted
increase is 1,404 triangles and zero draw calls; rendered counters remain required.

### Sacred tree: remove the exact-centre plate construction

Source inspection after the critic/refuter pass established that the hero pink landmark is
`Props.sacredTree`, not `FoliageSystem`: `_blossomCluster` emitted three rectangular cards
crossing at the same centre. The material already alpha-tested a generated blossom texture,
but the full-width card boundaries remained available as long straight construction edges.

Each clump now uses three staggered ten-lobed convex fans. Their centres differ, their
perimeters are scalloped, and their existing common tumble, blob-normal field, generated
texture, alpha test and wind attributes remain. The depth-5 hero tree still has one merged
blossom material part/draw; blossom geometry changes **1,818 → 9,090 triangles**. This is
+7,272 submitted triangles at the authored hero tree and no per-frame work or allocation.
Together with the conservative lantern increase, the previous measured 789,214-triangle
worst frame would estimate to 797,890 before unrelated concurrent changes, still 102,110
below the 900,000 MEDIUM limit. That arithmetic is not a renderer measurement; the coherent
candidate must re-run the actual counter.

## Mechanisms found

- TD-011 was a real input integration gap. `KeyF` authored `interact`, but Level never consumed it. Merely adding the caller would still have left `used` unchecked, allowed early bell use before its encounter was waiting, and provided no touch-facing consequence label.
- Player boot read `level.playerSpawn` or `level.spawns.player`, while Level exposed `spawnPoints.player`. The fallback `(0,8)` sits inside the haiden bounds `x=[-7.5,7.5], z=[3,14]`. Level now publishes a getter to the existing authored approach spawn `(0,73)`; no placement was invented.
- Level called `EnemyManager.spawn` with one descriptor object. Its actual signature is `(archetype, position, opts)`. The object selected the default ashigaru and omitted the requested position. The final heavy was additionally called `oni`, which is a faction rather than an available archetype; the valid heavy is `oyoroi`.
- A full enemy budget returned `null`, but Level treated the request as delivered. The queue now preserves and retries those requests, and an encounter cannot clear while arrivals remain queued.
- Completion had no `victory` event, and Menus' existing `level.restart()` branch had no implementation. The level now finishes with one victory and resets enemies, combat transients, player, wave state and interaction state on retry.
- Authored `uiSoft` and `water` sound names were not present in Audio's bank. The reachable responses now use its existing `uiConfirm` and `footstep_water` cues.

## Interaction contract

`level.nearestInteractable(player.position)` returns an existing record or `null`. The record has `id`, `prompt`, `consequence`, `position` and `radius`; no per-frame result object or strings are allocated. `level.landmarks` contains `{id, position}` records built from real prop anchors. `level.playerSpawn` aliases `level.spawnPoints.player` by identity.

Level pumps Input once per engine frame using the same `__kagPumpFrame` guard as Player, consumes only the dedicated `interact` edge, and drains rejected edges. Paused, disabled, dead, invalid-health, invalid-position, out-of-range and combat-busy states cannot activate a target. A simultaneous combat command takes precedence. An interaction cooldown rejects duplicate independent presses. Bell use additionally requires the waiting bell encounter, no living enemies, and an unused bell. A held key, movement, attack tap or swipe does not substitute for this intent.

The prompt announces `奥の敵を呼び寄せる` before the bell is rung. Ringing immediately emits the bell sound and `鐘が谷を渡る / 奥から足音が近づく`. The first pair of ronin arrives two simulated seconds later; the action does not remove movement control. The bell is one-use until retry. Purification restores up to 30 health once per attempt and is unavailable at full health or with living enemies. Ema and the already-built omikuji rack provide repeatable, distinct authored text. These provide three optional discoveries in addition to the critical-path bell; all primary objective lines added here fit the 12-character narrative bar.

The tower has a 1.71 m raised deck with no entrance stair. A pull rope now hangs from the existing striker down to 1.25 m above the path. Its interaction record is `(14.2019,813.25,29.2981)` on the flat plateau. A radius 0.35 m standing capsule at its XZ clears the local world's original collider geometry. The added rope is merged into the existing rope part: bell parts remain **16**, colliders remain **6**, and local bell triangles change **1,626 → 1,652**. This is +26 source triangles and no additional material/mesh part; actual renderer counters remain an integration gate.

## Executed checks

Nine Node groups passed. The first six use the actual Input queue and EnemyManager with a
flat-ground fixture; the final three inspect the real procedural terrain/prop geometry:

| Check | Result |
|---|---|
| Spawn interface | Old fallback inside haiden; getter returns exact existing `(0,812,73)` spawn |
| Deliberate bell | 0 rings during 120 combat-command frames; 1 ring from held/repeated F; first two enemies both ronin after at least 2.0 simulated seconds |
| Invalid states and recovery | 7 states reject and drain the intent; no deferred ring; one valid ring after recovery |
| Optional discoveries | Ema, omikuji and purification each emit a distinct authored response; health 55 → 85; repeated purification adds 0 |
| Spawn contract and capacity | Real ronin/oyoroi archetypes at exact authored coordinates; a request beyond a one-enemy cap is retained and delivered after capacity frees |
| Encounter completion and retry | Four encounter states, 12 authored arrivals, exactly one victory; retry order `despawnAll → combat.reset → respawn`, clean interactions/queue/encounters, player at `(0,812,73)` with 100 health |
| Mountain owner and hierarchy | Crop rays hit macro terrain at 410–480 m; one primary mass and two subordinate shoulder samples retain the pinned height separation |
| Lantern supports | 3 continuous hoop rows, 58 tested support vertices each; 1 paper part; 504 → 660 source triangles |
| Sacred-tree clumps | 0 rectangular cards; 3 ten-lobed sprays at 3 distinct centres; 1 merged blossom part; depth-5 blossom 1,818 → 9,090 triangles |

The loop test deliberately despawns defeated enemies to check orchestration; it is not combat balance or player-completion evidence. Combat's reset body is independently checked by its owner; the world fixture checks call order rather than duplicating those tests.

## East-edge: the missing landmark hypothesis was disproved

An 83-collider Node reproduction uses exact procedural torii, hall, bell, bridge, fence, chōzuya and votive collision geometry on the flat plateau. Its east-edge eye is **814.835698 m**, agreeing with the saved interaction-i1 eye **814.84 m** to rounding. Both old roof rays really hit the bell tower; the torii is outside the view. But the old bell target was not on the bell tower.

The survey raycast downward at the bell centre hit the **suspended bell top at 816.630005 m**. Adding the guessed `up: 4.6` put the target in empty sky at **821.230005 m**, with vertical NDC **1.2864**, outside the frame. The actual geometry ridge is **819.13 m**, vertical NDC **0.8607**, inside the same camera with an unoccluded ray. This is an apparatus-height defect, not evidence to move the tower or expand the camera.

Level now supplies the actual torii top, haiden ridge, honden ridge and bell ridge in `landmarks`, so the integration survey can stop adding guessed landmark heights to whatever a downward ray happens to hit. The same Node query confirms the real bell ridge visible from east-edge. Layout stayed unchanged. Silhouette readability still requires a rendered review; a visible point is not a visual acceptance verdict.

## Remaining integration gates

- Actual keyboard and dedicated touch-zone dispatch, readable prompt/consequence pixels, cancellation behavior and frame ordering in a built page.
- Full-terrain landmark survey using the geometry-derived anchors. The old survey also places some eyes on the tops of torii crossbars because its support ray starts above all geometry; a standing-eye survey must not mistake overhead structure for a walkable player surface.
- Rendered view of the small pull rope and the temple bell interaction; draw/triangle counters on the coherent MEDIUM build.
- Complete playable encounter behavior with live AI, real defeat/victory/retry and Combat's implemented reset. This owner did not measure combat balance.
- Native `wide`, `hero` and `sun` recapture plus 25% views. The terrain must lose the
  conspicuous repeated fold read, the sacred crown must lose its long plate intersections,
  and all three lantern supports must remain continuous in the actual framing.
- Standing tonal gate after the lantern change and coherent MEDIUM renderer counters after
  the estimated +8,676 submitted triangles. No threshold was changed.
- Real-device performance and independent hostile review remain unmeasured here. No project PASS is claimed.
