# R17 enemy boundary and attack-window repair

Date: 2026-09-11. Baseline: `4e6d23a`. Owner: enemy.

Changed source: `src/gameplay/Enemy.js`. Focused apparatus:
`tools/check-enemy-r17.mjs`. `EnemyAI.js` required no source change.
Read the full architecture/preamble, dispatch skill, and the combat, animation and AI
benchmark entries. No build, browser, capture, commit or push was run by this owner.

## Demonstrated mechanisms

**TD-012.** `Enemy.reset` passed a Vector3 to the numeric controller teleport boundary.
Physics had contained the bad signature by accepting both forms; this did not repair
the caller. Reset now passes three finite coordinate components. The adjacent return
boundary previously checked only `typeof cp.x === 'number'`, which accepts NaN and
ignores bad Y/Z. It now checks all three components, holds the last valid root on bad
controller output, clears motion, and warns once. A later valid controller position
resumes ordinary movement.

**Attack clocks.** The original Enemy timer and retimed Rig markers owned the same
weapon flag on different schedules. A complete Enemy+Rig Node simulation reproduced
these extra windows before repair:

| Move | Intended first observed window | Extra observed window |
| --- | --- | --- |
| ashigaru shove | 433–567 ms | 600–617 ms |
| oyoroi cleaveBack | 550–750 ms | 817–833 ms |
| shinobi flurry3 | 267–367 ms | 400–417 ms |

The timer closed the attack, a late animation marker reopened it, and the timer closed
it again on the following frame. Ronin riposte also had mismatched clocks but its
boundaries overlapped in one sampled frame, so it did **not** reproduce an extra window.

Enemy now determines marker availability from the returned Rig layer before the first
update. A known clip owns both ends of its blade window; only markerless clips use the
timer fallback. A marker cannot reopen an attack already in recovery. Enemy supplies
the immutable normalized move through `rig.play(..., {attack: move})`; the animation
owner added piecewise phase mapping so the pose and markers respect the authored
startup/active/recovery durations together. Feints never open a damage window.

**Parry ownership.** EnemyManager's parry bus listener invoked the same entity callbacks
that Combat subsequently invoked directly. Enemy pressure could therefore include two
flat 22% deductions plus the Combat perfect/late amount; successful-deflect reactions
also ran twice. The duplicate bus mutations are removed. `onParried(defender,payload)`
now leaves pressure to Combat while retaining the Enemy recoil, animation and regen
lockout; standalone legacy calls retain their existing 22% fallback. The new
`managesPostureRegen` capability lets Combat respect Enemy's own regeneration lockout
from the first hit, rather than infer ownership after observing drift. Combat owns the
corresponding consumer repair and exact perfect/late pressure checks.

**Slope units.** Enemy passed `slopeLimit: 0.86` to an API that interprets degrees.
Player already stores slope angles in radians and explicitly converts this boundary;
Physics's native default is 50 degrees. The original Enemy literal had no unit comment.
The repair preserves 0.86 as the authored radian angle and explicitly converts it to
49.274370 degrees, following the gameplay angle convention rather than introducing a
new balance value. This interpretation is an inference from those existing conventions.

## Reproduction and actual measurements

Run:

```sh
node tools/check-enemy-r17.mjs
node tools/check-enemy-r17.mjs --details
```

These checks instantiate the real Enemy, Rig and (for slope cases) PhysicsWorld in
Node. They do not render pixels or drive user input. The explicit top-level test output
labels this limitation. All focused assertions passed in the final owner run.

| Check | Result |
| --- | --- |
| Strict scalar teleport stand-in | 2 respawns; exactly 3 numeric arguments each |
| Invalid controller coordinate, each axis separately | 3 rejected samples; last valid root held; 1 warning; valid output resumes |
| Combat-style parry event followed by callback | 1 Enemy callback; no duplicate posture deduction; recoil retained |
| All moves, real Rig at 60 Hz | 22 moves: 21 damaging moves, exactly 21 windows; feint 0 |
| All moves, real Rig at 30 Hz / LOD 1 | 22 moves: 21 damaging moves, exactly 21 windows; feint 0 |
| First active frame vs authored startup | Maximum rounded error 13 ms at 60 Hz / 27 ms at 30 Hz; within one sample |
| First measured hand motion to active | Minimum 217 ms at 60 Hz / 200 ms at 30 Hz |
| Repaired root-owned BM-ANIM-01 metric on the 60 Hz Node trace | 21 attacks; shortest 217 ms, median 433 ms; pass on this trace |
| Clamped-delta finite-output check | 960 frames at dt = 0.25 s across all 4 archetypes; no non-finite root, forward, blade or bone matrices |

The slope fixture supplies 1.9 m/s uphill intent for 120 frames at 60 Hz. Terrain normals
are derived by the real PhysicsWorld from the heightfield, avoiding a fixture-specific
normal convention.

| Terrain angle | Controller limit | Horizontal displacement | Controller grounded frames |
| --- | --- | --- | --- |
| 15°, legacy units ablation | 0.86° | −0.403793 m | 0 / 120 |
| 0°, repaired | 49.274370° | 3.800000 m | 120 / 120 |
| 15°, repaired | 49.274370° | 3.619019 m | 120 / 120 |
| 45°, repaired | 49.274370° | 3.347597 m | 120 / 120 |
| 55°, repaired | 49.274370° | −0.467366 m | 0 / 120 |

## Apparatus disproof and remaining gates

The original startup metric incorrectly required **continuous** above-idle hand motion
immediately before damage. After the real extra windows were removed it still reported
0 ms on oyoroi slam: the first hand motion was at 17 ms and damage began at 850 ms, but
the lifted weapon visibly settled before the swing. Its last pre-active displacement
was 0.69 mm against a 0.65 mm idle floor, below the metric's 3× threshold. Ronin slash2
likewise had a 233 ms first-motion lead but a 1.21 mm mid-startup dip shortened the
continuous segment to 133 ms.

Root repaired the metric to measure first above-idle motion inside the current attack
episode. State bounds the search but does not substitute for visible motion. The trace
includes stateNames and optional `emotion[4] = attackTime`; decreasing attack time splits
chained moves that never leave the attack state. Root's separate synthetic checks retain
failure for genuinely short and motionless tells. No benchmark threshold changed.

The pure Node measurements do not certify the full benchmark. Root must still complete
the rendered interaction capture, thumbnail warning separability, >=20-encounter
posture/death and group-token sample, phone performance/device gates, production-hook
gate and review. The slope check proves the boundary on analytic surfaces; it does not
replace navigation on the full shrine layout. The animation owner also aligned the Rig
delta cap with Engine's 0.25 s cap; this owner's large-delta check proves finite output,
not rendered reaction legibility at four frames per second. No complete-project PASS
is claimed.
