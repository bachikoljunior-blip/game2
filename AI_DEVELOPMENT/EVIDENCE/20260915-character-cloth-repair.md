# Character cloth repair — author record

Author: `/root/game2_ultra_art_sound_physics/character_art`, continuing the
formally accepted Ultra assignment without re-delegation. This is source-known
production self-review. It does not stand in for independent or blind review,
the integrator's acceptance, or PS4 visual attainment.

Base: local CC0 anatomy preservation commit
`1e7eed79e7dec1ce28470c77c1fb93a74e40cd15`, itself based on
`acf0f9ec86996245ad712d6adc72e5d6159f6711`. Work is confined to the authorized
`game2-mpfb-pilot` worktree. No shared runtime, remote, main, Pages, automation,
reference content or fixed instructions were edited. All ten comparison elements
remain **not measured**. The deadline remains `2026-09-20T07:51:53Z`.

## Visible cause and bounded repair

I viewed the actual acf CI motion-study source frames from run
`34971788118`: `start-run-stop.mp4` frames 13/14 at 1.0833/1.1667 seconds and
`death.mp4` frames 9/12 at 0.75/1.0 seconds. The running knee emerged through
the middle of the flat front cloth. Fallen hems became thin pointed lateral
boards. This agrees with the previous construction: four open front/back
surfaces rotated as complete panels, without a surface that bends around knees.

The integrator expanded my bounded motion ownership to repair those observed
defects. Each trouser leg now has joined front/back semicircular sections, broad
pleats and a turned inner hem. The waist remains fixed to the pelvis; the
centreline and cross-section rotation follow the actual thigh and knee
continuously. Separating centreline blending from rotation preserves a cloth
ring's volume at a sharply bent knee. The earlier linear vertex blend collapsed
there during development and was replaced before this checkpoint.

Cloth receives the existing damped inertia driver, restrained world-gravity sag
on falling, and unilateral clearance against its own thigh/calf capsules.
Ground contact adjusts the cloth vertices along the floor/capsule intersection.
An exact terrain rectangle upper bound skips per-point floor queries when the
whole cloth is above terrain. It does not reduce terrain accuracy or loosen the
ground solver's thresholds.

Four indexed surfaces (2,592 current vertices total) remain CPU-visible.
Position, normal, box, sphere and `geometry.userData.contactPositions` update
together, so drawing, shadows, culling and contact tests see the deformed cloth.
The contact array aliases current positions. An intermediate hem construction
had retained an undersized normal attribute; the final candidate deletes and
rebuilds that attribute, and the regression checks every drawn vertex has a
finite normal. The existing whole-panel compatibility path remains for rigs
without the new dynamic surface.

The anatomy assets and their source/texture bytes are unchanged from 1e7. The
old leg IK, foot anchors, knee constraints, sword/handle trajectory, native wrist
grip-offset calculation, authored poses and action times were not edited. No
test tolerance was relaxed. The changes to `character-motion.js` only select
surface deformation and stop the old whole-panel ground tilt for these surfaces.

## Verification and cost

- 51/51 native-asset, existing motion, legacy sculpt, presentation and new cloth
  checks passed on the frozen candidate. The three new checks use the actual
  failing source-camera/pose times to test cloth occlusion before the real knee;
  verify animated drawing/contact/bounds/normal agreement and a fixed waistband;
  and check pause/retry preserves or resets current surface state correctly.
- All four existing terrain regressions passed on this same frozen candidate:
  1,680 action/location/facing poses; sloped running and planted soles; steep-bank
  state blends; and parry/block contact with reachable grips. Lowest clearance
  was -0.444 mm at sun-ring, within the unchanged -4 mm allowance. All six
  discoveries and eight action facings were checked. The local suite completed
  in 135.989 seconds; this is test duration, not frame performance.
- Fresh Vite production build succeeded. Imported PNG names and bytes remain
  unchanged. The isolated output JS was `index-nVBFjYVm.js`, 3,814.50 kB /
  1,340.65 kB gzip. This is not the final integration fingerprint.
- `20260915-character-cloth-cpu.json` retains raw measurements and exact runtime
  SHA-256 values. Baseline and candidate use the same local Node process, one
  actor, terrain, three actions, 180 frames per sample, one warmup and three
  measured repetitions. The baseline is the preserved 1e7 source. CPU increases
  per actor/frame are running **1.035 ms**, attack **0.907 ms**, and fall
  **1.266 ms**. Relative CPU factors are 9.847, 9.728 and 4.960 because the old
  rigid-panel update was very cheap. Running/attack performed zero per-point
  cloth ground queries in this probe; falling performed 95,256 over 180 frames.
  Approximately 4–5 ms/frame additional CPU for four active actors is a concrete
  risk requiring the unchanged native-browser/mobile-oriented gates. This is
  neither GPU nor mobile-device timing. A prior profiling run is excluded from
  these final numbers.
- Four actual-rig CPU diagnostic projections, front/back of run frame 14 and
  death frame 12, were generated and viewed. The raised knee is surrounded by a
  continuous blue trouser form, and the fallen cloth retains a bent volume
  instead of the former sideways flat hem. Back views retain that volume. These
  scratch images omit actual WebGL lighting, shadows, camera projection details
  and other renderer behavior; they are **not native acceptance media**.

## Remaining judgment

The broad cloth silhouette is noticeably baggy and may need art-direction
adjustment after actual video. The model is a finite kinematic cloth
approximation, not a full cloth solver; it does not solve cloth self-collision
or detailed fabric mass/friction. Actual run/death video, diagonal banks,
normal-distance silhouettes, hand release and sheathing still require the
integrator's native capture and independent image judgment. The initial CC0
pilot's stiff shoulders/shirt, fixed expression and grip, adapted short-hair
topknot and overall material/art quality remain limitations. No extra ornaments
were added to obscure them. The warden mask residual reported by independent
review is unchanged and remains a native-image inspection point.

Runtime was frozen at `2026-09-15T14:00:14Z` for this measurement/checkpoint.
The supporting CPU JSON records its exact three file hashes. The final local
commit is supplied to the integrator separately; only that single writer decides
integration and publication after current native evidence.
