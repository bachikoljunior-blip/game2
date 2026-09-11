# R17 animation repair evidence — 2026-09-11

Owner: anim. Baseline: `4e6d23a`. Files: `src/anim/Rig.js`,
`src/anim/Poses.js`, `tools/check-anim-r17.mjs`, and this record.
This is a pure Node rig measurement, not a rendered-game or complete-project PASS.

## BM-MOVE-02: hypothesis and repair

The baseline foot solver changed both ankle heights toward the ground on every frame,
including swing. It retained the pose's changing XZ ankle location and only applied a
35% standing lock below 0.4 m/s. Phase-driven cadence therefore did not create a
stationary stance foot. The unchanged `footPlant()` evaluator reproduced the defect on
a flat plane: p95 10.347 / 28.884 / 22.936 cm per frame at 1.9 / 5.4 / 7.2 m/s.
These are fixture measurements; the historical browser result is separately 25.903 cm
aggregated over its three windows.

The repair stores a world position and heading at touchdown, keeps them during stance,
and raises the swing ankle along an arc to a predicted next landing. Walk/run/sprint
stance fractions are 0.50 / 0.34 / 0.30 of a full gait cycle; swing lifts are
0.12 / 0.23 / 0.30 m. These values live beside each gait's existing speed and stride.
The pelvis drops enough to make the target reachable before analytic leg IK; otherwise
the IK reach clamp itself drags the ankle. Phase uses measured root displacement and
the gait table's stride, rather than a second, inconsistent stride interpolation.
Stopping finishes an airborne step instead of placing it instantly below the body.

No metric threshold or contact filter was changed. The existing low-point band (2 cm)
and vertical-stillness threshold (4 mm/frame) determine the measured population.

Run from the repository root:

```sh
node tools/check-anim-r17.mjs
```

The fixture runs the real Rig's update, pose composition, bone transforms, ground
queries and IK. Only the root controller and ground surface are substituted. Each
steady condition has 600 frames at 60 Hz, with frames 121–599 measured (479 frames).
`--baseline` merely disables assertions for measuring an unfixed checkout; it does not
restore old source. The baseline numbers below were measured before editing Rig.js.

| Slope | Speed m/s | Baseline p95 cm/frame | Repaired p95 | Repaired worst | Contact samples |
|---|---:|---:|---:|---:|---:|
| −15° | 1.9 | 2.591 | 0.000 | 0.040 | 466 |
| −15° | 5.4 | 14.149 | 0.000 | 0.008 | 290 |
| −15° | 7.2 | inconclusive: zero contacts | 0.000 | 0.000 | 246 |
| 0° | 1.9 | 10.347 | 0.000 | 0.040 | 466 |
| 0° | 5.4 | 28.884 | 0.000 | 0.008 | 290 |
| 0° | 7.2 | 22.936 | 0.000 | 0.000 | 246 |
| +15° | 1.9 | 10.094 | 0.000 | 0.040 | 466 |
| +15° | 5.4 | 25.656 | 0.000 | 0.008 | 290 |
| +15° | 7.2 | inconclusive: zero contacts | 0.000 | 0.000 | 246 |

Zeroes are rounded metric outputs, not a claim of exact floating-point zero. Every
condition retained a minimum ankle clearance of 0.085 m. Maximum clearances were
0.205 / 0.315 / 0.38493 m, so the passing population does not come from hiding all
contacts or leaving both feet on the ground. The independent consecutive-stance
checks had 456 / 283 / 234 samples and maximum drift below the displayed 0.00001 cm.

Three additional trials use Player's controller → leaning body → rig nesting with
0.8 rad yaw, speed-dependent forward pitch, 0.2 rad roll and a compound slope
`h = 812 − 0.15x − tan(15°)z`. Their p95/worst values match the table. A 1200-frame
idle → walk → run → sprint → stop → restart trial retained 884 contact samples,
p95 0.000 and worst 0.040 cm/frame. It catches an actual intermediate regression
where an idle-phase wrap relocated the stance foot by 33.5 cm when movement began.

Ground sampling now rejects Physics' shared record when `hit === false`; previously
the stale `point` was consumed even after a miss. Non-finite height/normal samples are
rejected, with one warning, and never become foot targets.

## BM-ANIM-01: explicit attack phase clock

Root authorized this interface while enemy's owner removed its duplicate timer and
marker authority. The additive play option is:

```js
rig.play(name, { attack: move, duration: move.total, speed: 1, layer: 'base' });
// move.startup > 0, move.active > 0, move.recovery >= 0, all finite
```

Rig maps the first source `hit-active-start` marker to `startup`, the first
`hit-active-end` to `startup + active`, and source clip end to the total. Pose sampling
and event crossing use that same mapped source clock. Returned `layer.attackTimed`
confirms a supported marker pair; `layer.attackTime` is gameplay seconds and
`layer.time` remains source-clip seconds. An explicit positive speed scales the
gameplay clock. `duration` retains its previous behavior when attack timing is absent
or has zero active duration (including feints). Existing player calls are unchanged.

The test exercises all 13 clips containing a damaging marker pair, with two timing
sets at both 60 and 30 Hz: 52 cases. Every case emits exactly one start and one end;
maximum event timing error is 20 ms and never exceeds that case's frame interval.
The mapped startup pose matches an ordinary sample at the source startup marker with
maximum quaternion-component error 0. Default-duration and zero-active fallback
semantics also pass. Enemy's owner separately measures actual enemy move tables and
visible startup; these Rig tests do not claim the visual reaction-time gate passed.

## BM-ANIM-04: concrete spring failure

The old chest spring was numerically unstable despite the Rig's private 0.1 s cap.
Driving the root at 5.4 m/s with `yaw = 0.2 sin(frame × 0.03)` and calling
`rig.update(0.25)` first produced non-finite bone matrices at frame 795;
`_lagSpine` reached Infinity. Its maximum preceding magnitude was approximately
1.22 × 10^306 rad.

Chest, head, flinch and recoil now use the exact damped-oscillator solution. The
animation clock accepts Engine's full 0.25 s cap so the attack clock does not lag
Enemy's timers; cloth retains its existing separate limit of three 1/60 s steps.
The test runs 2000 frames at each of 60 Hz, 30 Hz and 0.25 s, adding recoil/flinch every
23 frames. All bone matrices remain finite. Maximum chest lag is respectively
0.03026 / 0.01526 / 0.00205 rad. Invalid dt and a repeated invalid ground sample also
leave finite bone matrices; the invalid ground warns once.

## Remaining integration evidence

- Run the existing browser `foot-plant` scenario on the actual Player and Physics;
  keep its contact threshold and measured fields unchanged. Add an actual ≥15°
  ground segment and report achieved ground normals, per-speed coverage and drift.
- Record a rendered walk/run/sprint/stop sequence. These bone tests cannot judge
  knee silhouette, clothing deformation, foot/terrain visual contact, or naturalism.
- Run enemy startup and blade-window captures after integrating enemy's marker
  authority changes. The source pose/event mapping tests do not substitute for
  measuring first visible movement in the rendered game.
- Recheck bundle/performance and the complete interaction gate at root. No build,
  browser, capture, install, commit or push was performed by this owner.

For diagnosis, the rig's private `_footLocked`, `_footTarget`, `_footLock` and
`_footPhase` arrays can be read inside the existing capture harness. The verdict must
continue to use measured bone positions/ground clearance rather than those flags.
