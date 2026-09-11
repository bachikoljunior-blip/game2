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

## First rendered-CI trace: idle calibration contamination

The first CI candidate supplied a real 900-frame (15 s), 60 Hz, stride-1 trace at
`shots/ci-candidate-first/shots/interaction-ci-candidate/anim-startup.json` and its
original report at `shots/ci-candidate-first/shots/interaction-ci-candidate.json`.
Neither artifact was changed. SHA-256 of the raw trace is
`1d320f117ff311a8c0238a97292bb0c11b54dedc366eb537c9dd409206b4f4d8`; original report is
`3eeccb7ec43b6e498602dceff2d5fdf38ae7ea12b452a31d7ca55c7748a84e10`.

The original BM-ANIM-01 result was FAIL: 20 attacks, shortest 0 ms, median 450 ms,
mean per-enemy idle floor 0.02307 m/frame. Two active windows produced the zeroes:

| Enemy / move | Attack-state entry | First active | Largest pre-active hand displacement | Old idle median / 3× onset threshold |
| --- | --- | --- | --- | --- |
| 9000 / thrust | frame 138 | frame 169 | 0.05623 m at frame 141 | 0.02583 / 0.07749 m |
| 9001 / slash1 | frame 489 | frame 509 | 0.05598 m at frame 493 | 0.03094 / 0.09282 m |

These are ordinary attack-state entries, not same-state chains. In enemy 9000's
frames 138–152, the recorded root XZ is unchanged at (0.539, 28.355), while its hand
moves 56.23 mm in frame 141. The old threshold is larger than every pre-active hand
sample in that tell. At the first active frame 169 the displacement is 59.51 mm;
that is not a pre-active sample. This trace demonstrates above-zero motion and an
inflated calibration, but it lacks root yaw and settled-pose diagnostics needed to
certify the first valid tell frame. It does not prove a product PASS.

Idle-state labels were admitting stop/turn/pose transitions. Some representative
raw intervals are below; frame numbers are zero-based and inclusive. Root drift is
net XZ displacement, from the original millimetre-rounded entity-position column.

| Enemy | Idle-state frames | Samples | Hand median, m/frame | Net root XZ drift, m |
| --- | --- | --- | --- | --- |
| 9000 | 6–21 | 16 | 0.02549 | 0 |
| 9000 | 52–60 | 9 | 0.04642 | 0.084172 |
| 9000 | 223–235 | 13 | 0.00061 | 0 |
| 9000 | 404–416 | 13 | 0.03232 | 0.078230 |
| 9000 | 794–806 | 13 | 0.03861 | 0.099363 |
| 9000 | 853–865 | 13 | 0.03986 | 0.100846 |
| 9001 | 63–75 | 13 | 0.00048 | 0.004123 |
| 9001 | 876–888 | 13 | 0.00149 | 0.005385 |
| 9002 | 465–497 | 33 | 0.00605 | 0.040608 |

Even low-median intervals start with large pose transitions: enemy 9000 at frame
223 has 0.11819 m hand travel; enemy 9001 at frame 876 has 0.33699 m. Selecting a
lower percentile or the lowest hand-motion samples would let the measured quantity
choose its own baseline. That was not done. No Enemy/Rig product change was inferred
from this rendered-CI failure.

## Independent idle qualification and honest re-evaluation

The runtime preserves emotion columns 0–5. It appends column 6 eligible flag,
7–9 actual root world XYZ, 10 actual root world yaw, 11 rejection bit mask, and
12 continuously quiet simulation seconds. The flag does not depend on hand travel.
It requires an idle/non-active entity, unchanged root translation and yaw
(tolerance 1e-5 m / rad per sample), a known idle base with its blend settled, no
visible overlay, planted feet when foot control is active, and unchanged active
look target. This must persist for one advancing simulation second. Frozen or
non-finite Rig clocks cannot qualify. Overlay weight tolerance 0.0008 is the Rig's
existing renderer cutoff; one second exceeds the normal 0.22 s fades and allows
turn/recoil settling. Rejection bits are: missing/invalid baseline 1, non-idle 2,
translation 4, yaw 8, non-idle base 16, base blend 32, overlay 64, feet 128, look
target 256.

The metric then requires at least 0.5 s of independently eligible samples for each
enemy before deriving its median idle floor. The 3× motion multiplier and 140 ms
criterion are unchanged. Every active window is retained in `measured.perAttack`,
including those with unknown startup. A demonstrated short tell remains FAIL even
when another enemy is uncalibrated; unknown attacks cannot be omitted to pass.

Re-evaluate without rewriting any source artifact:

```sh
node tools/check-metrics-r17.mjs --trace=shots/ci-candidate-first/shots/interaction-ci-candidate/anim-startup.json
```

| Result on the unchanged first CI trace | Original report | Re-evaluation |
| --- | --- | --- |
| Verdict | FAIL | INCONCLUSIVE |
| Attacks retained | 20 | 20 |
| Attacks with valid settled-idle calibration | not checked | 0 |
| Unknown attacks | not represented | 20 |
| Shortest / median startup | 0 / 450 ms | unknown / unknown |
| Enemy 9000 / 9001 / 9002 eligible samples | not recorded | 0 / 0 / 0; each needs 30 |
| Unfiltered idle medians | 0.02583 / 0.03094 / 0.01244 m | unchanged, diagnostic only |

The old trace cannot acquire missing calibration evidence retroactively. This is a
withdrawal of an unsupported measurement, not a game benchmark victory.

## Separate same-Rig calibration before the next observation

Natural unalerted AI does not provide a stationary root: `EnemyAI` hold increases
scan phase by `dt*0.35` and faces phase times 0.7, continuously turning at about
0.245 rad/s. Investigating AI scans at 0.9 rad/s after reaching its destination.
Simply spawning farther away would never satisfy the stationary-root condition.

The tools therefore insert a separately labelled, five-second, 300-frame authored
idle-noise calibration after the existing spawnWave action and before its first
AI update. They use those same three entity/Rig instances. Each step calls the real
`Enemy._updateAnim(1/60)` and scene world-matrix update. Breathing, visual sway,
authored idle flourishes, IK and configured cloth run through their real code.
No root or bone is held or rewritten each frame. AI, FSM, combat, gameplay time and
input time do not advance during this phase. This measures Rig idle noise; it does
not validate natural waiting AI. The limitation is explicit in trace and report.

A temporary spawn-argument recorder saves each actual position, generated AI seed,
target and alerted option; it is removed immediately after spawnWave. At the phase
boundary, the usual Rig reset clears calibration layers/locks once and Enemy reset
uses those original spawn arguments. The normal game then handles every observation
frame. Calibration and observation record matching enemy ID, archetype, Rig UUID,
Rig height/scale and entity/visual scales. Raw calibration emotion rows, frame
indices, row schema, state names and phase events are stored under
`trace.idleCalibration`; gameplay columns/events remain separate. Calibration must
contain zero weapon-active and attack-state samples. Metrics independently check the
raw rows for attacks, complete duration/sample interval, and Rig/scale correspondence;
a failed check yields unavailable calibration, without dropping observation attacks.

The source plan was **15 seconds**, despite the later request referring to an existing
30-second plan. The driver explicitly extends the observation to 1,800 frames
(30 seconds), preserving every authored action and its original frame. It records
`authoredFrames: 900` separately. The 300 calibration frames are additional and are
never included in gameplay frame count or startup durations.

The focused `startupCalibrationPipeline` fixture runs the exact driver `runPlan`
and injected runtime in a Node VM with the real EnemyManager, Enemy, Rig and AI.
Only the driver transport, flat terrain/physics and player target are lightweight
stand-ins; no browser or rendered image is involved. Its cosmetic RNG seed is fixed
at 0x2f19 in the fixture only. Observed results:

| Check | Result |
| --- | --- |
| Source action array and authored duration | unchanged; 900 authored frames |
| Gameplay frames / raw observation emotion rows | 1,800 / 1,800 |
| Separate calibration frames / real animation calls | 300 / 900 across three Rigs |
| AI updates during calibration | 0 |
| Calibration active windows / active or attack-state samples | 0 / 0 |
| Spawned entities / ordinary Enemy resets after calibration | 3 / 3 |
| Eligible samples per Rig | 171 / 71 / 189; each exceeds 30 |
| Observed damage windows / metric attacks retained | 11 / 11 |
| Metric on this VM fixture only | PASS, shortest 233 ms |

The actual probe fixture also runs an idle-state stopping transition: its first
30 idle-labelled frames are rejected; the final 30 stationary frames are eligible.
Early and late hand medians are 0.01004 / 0.00107 m. All 60 stationary-position
turning frames are rejected with yaw bit 8. The real-Rig all-move fixture still
retains 21 attacks with shortest 217 ms and median 433 ms at 60 Hz.

`check-metrics-r17.mjs` retains negative controls for 83 ms, same-state chained
83 ms, and motionless tells. Separate calibration retains both 83 ms and motionless
FAIL results. Contaminated idle labels do not raise the floor; 29 eligible samples,
missing legacy diagnostics, a missing requested calibration, partial calibration,
different Rig/scale, incomplete raw calibration, or any calibration attack remain
INCONCLUSIVE. A known short tell plus another unknown enemy remains FAIL.

Verification performed: both focused Node checks, runtime/driver syntax, and diff
whitespace checks passed. The new rendered capture and full integration gates remain
root-owned and were not run by this owner. In particular, the unchanged first CI
trace remains INCONCLUSIVE, and the Node fixtures do not substitute for the next
real rendered/matrix-validated capture or a full-project PASS.

## Pooled-lifecycle sensor boundary

`EnemyAI.reset()` previously left its last situation struct, separation accumulator,
avoidance timer and several reaction clocks intact. Perception is deliberately
staggered, but `_steer()` runs on every frame, so a pooled enemy could consume those
old sensors once before its first new-life perception tick. The focused real-class
fixture injected two cached neighbours into an idle Ronin and reproduced a 0.28 move
gain plus 0.001748 m XZ displacement on that first frame.

Reset now clears those caches and restores a neutral situation snapshot while keeping
the staggered decision phase and seeded personality deterministic. `Enemy.reset()`
also clears every reusable intent field and calls the existing `Rig.reset()` exactly
once at the entity lifecycle boundary before playing idle, preventing attack layers,
look locks and cloth springs from crossing lives. With the same poisoned prior life,
the first pre-perception frame measured 0 move gain and 0 m XZ displacement; repeating
seed `0x5eed17` produced the same personality. The calibration harness now re-enters
through `Enemy.reset(position, opts)` alone rather than duplicating private Rig reset
logic, and its exact-driver fixture still retained 11/11 attacks with a 233 ms
shortest startup. This is a focused Node regression, not a rendered-camera or full
BM-ANIM-01 result.
