# Round 17 world: reachable interactions and a complete encounter loop

Scope: `src/world/Level.js`, `src/world/Props.js`. No terrain, material, lighting or layout retuning. Evidence collected with `node tools/check-world-r17.mjs`; no browser, renderer, production build or phone run was performed by this owner.

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

Six behavioral groups passed using the actual Input queue and EnemyManager with a flat-ground fixture and no GL:

| Check | Result |
|---|---|
| Spawn interface | Old fallback inside haiden; getter returns exact existing `(0,812,73)` spawn |
| Deliberate bell | 0 rings during 120 combat-command frames; 1 ring from held/repeated F; first two enemies both ronin after at least 2.0 simulated seconds |
| Invalid states and recovery | 7 states reject and drain the intent; no deferred ring; one valid ring after recovery |
| Optional discoveries | Ema, omikuji and purification each emit a distinct authored response; health 55 → 85; repeated purification adds 0 |
| Spawn contract and capacity | Real ronin/oyoroi archetypes at exact authored coordinates; a request beyond a one-enemy cap is retained and delivered after capacity frees |
| Encounter completion and retry | Four encounter states, 12 authored arrivals, exactly one victory; retry order `despawnAll → combat.reset → respawn`, clean interactions/queue/encounters, player at `(0,812,73)` with 100 health |

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
- Real-device performance and independent hostile review remain unmeasured here. No project PASS is claimed.
