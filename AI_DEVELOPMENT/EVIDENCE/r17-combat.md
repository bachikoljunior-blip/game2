# R17 combat repair evidence

Scope: `src/gameplay/Combat.js`. Baseline is commit `4e6d23a`. No browser, build,
capture, commit or threshold change was performed by the combat owner.

The required BM-COMBAT-02 gate remains **pending**: at least 20 scripted encounters,
with at least 60% of enemy deaths resolved by posture. The checks below prove concrete
resolution defects and repairs; they are not that encounter sample or a human play test.

## Measured repairs

Command: `node tools/check-combat-r17.mjs` — PASS. The script imports the baseline
Combat module directly from Git for before/after comparisons. It uses the current real
Enemy/EnemyManager callbacks and timers, the real EventBus, and Player's real `onKill`
callback with small render-free fixtures. It does not run AI, animation, physics, DOM
input or rendering.

| Check | Baseline | Repaired |
| --- | --- | --- |
| Ashigaru posture 1 s after a 10 HP hit; its authored regen lock still has 0.4 s left | 46.5 → 55, all pressure lost prematurely | 46.5 → 46.5, pressure retained during the lock |
| First-contact ronin: 40 HP hit reduces posture 110 → 76, then add 10 pressure | Misclassified as accumulating; 76 → 86 | Classified before callback as draining; 76 → 66 |
| Player receives its real `onKill` pressure reward, 40 → 22; then 1 s recovery | 22 → 22, recovery permanently disabled by drift inference | 22 → 9.56236, recovery continues |
| Perfect deflect of a 15 damage attack, default difficulty | Initial pre-repair integration observed 52.54 attacker pressure | Exactly 28.34 pressure: 26 × 1.09 first streak step; player HP remains 100 |
| Late deflect of the same attack | Initial pre-repair integration observed 35.2 attacker pressure | Exactly 11 pressure; player HP 97.195, the authored late chip |
| Two successive perfect deflects, then execute the broken ashigaru | Full default-runtime sample was unavailable | Enemy HP remains 70 before finisher, one break, one death, execution phases start/impact/end |
| Retry while execution, projectile and attack token are live | No Combat reset API | After reset and 80 update frames: zero live projectiles/tokens/executions, player HP100 unchanged, no invulnerability, timeScale1 |

The first three baseline measurements are reproduced on every check invocation. The
pre-repair perfect/late numbers were observed before the Enemy owner removed duplicate
callbacks; the current assertions verify the authored values with the repaired Enemy
implementation.

### Mechanisms

- Combat previously waited for visible outward posture drift to infer entity ownership.
  That both bypassed Enemy's initial recovery lock and mistook Player's one-off parry or
  kill rewards for ongoing recovery, disabling Combat's recovery forever. The entity
  capability `managesPostureRegen` now controls this explicitly: Enemy is `true`, Player
  is `false`; legacy entities without the capability retain inference.
- A newly registered entity's posture convention was classified after its first callback
  could already drain the bar below the 75% threshold. `_rec()` now records the convention
  before that mutation.
- The Enemy owner removed parry bus mutations because Combat already invokes the entity
  callbacks directly. `Enemy.onParried(defender, payload)` now treats Combat's payload as
  authoritative for pressure and supplies the reaction only. Combat's parry constants and
  difficulty remain unchanged.
- `Combat.reset()` clears transient fight state, pending projectiles, execution, tokens,
  rewards, slow motion and cinematic bars. Level should invoke it after despawning enemies
  and before respawning the player. Difficulty and the monotonic combat clock are retained.

## Harness findings and recommendation for root

Source read: `tools/harness/runtime.js`, `tools/interaction-scenarios.mjs`,
`tools/interaction-metrics.mjs`.

The original aggressive policy ends each encounter after 12 s, approaches only while the
nearest enemy is farther than 2.6 m, and repeatedly schedules guard after a 200 ms reaction
to a published telegraph. It does not establish that a complete fight occurred. None of
these policy issues by itself proves why the historical run had zero deaths.

Recommended policy repair, preserving the criterion and default tuning:

1. Use a published telegraph's identity/start time to schedule one reaction, instead of
   repeatedly treating the same cue as a new event. Preserve the >=200 ms reaction latency.
2. Release held touch buttons/gestures between encounters, restore the player through its
   reset/respawn API, and reset the authored arena position. HP assignment alone does not
   revive a dead FSM or return a wandering player to the encounter.
3. Approach to a physically reachable attack distance. When the enemy is visibly posture
   broken, continue inside the authored execution range of 2.05 m and send ordinary attack
   input. Player already converts that input into a finisher; no state-injection shortcut
   or special execution key is needed.
4. Run at least 20 encounters with enough simulated time to resolve fights. Keep raw event
   counts for slash, hit, parry, break and death so a zero sample is diagnosed before a
   complete expensive capture. Report the scripted policy as a condition of the result.
5. `postureResolution()` currently reads `execution.entity.id`, but the authoritative
   execution payload contains `victim`, and the runtime tap preserves it. Match
   `execution.victim.id` (with a historical `entity` fallback if needed), using the impact
   phase to associate an execution with its death. Existing break-to-death matching still
   works; this mismatch alone cannot explain zero break/death events.

## Remaining gate

Root must build the integrated owners' changes, verify Level retry through the runtime,
and run the corrected DOM-input encounter capture at default tuning for >=20 encounters.
Only that capture can settle BM-COMBAT-02. No project-wide PASS is claimed here.
