# Handoff — the art-direction review loop

This file exists because the work happens in ephemeral containers. `shots/` is
gitignored and the review images do **not** survive a session; everything a later
session needs to continue has to be in the repo. Read this, then `README.md`
("Where this build actually stands") for the current measured numbers, then
`tools/CRITIC.md` for the standing bar.

Update this file after every meaningful art-round iteration. It is the only detailed
art-direction state record; project-wide session, plan and criterion pointers live under
`AI_DEVELOPMENT/` and must not duplicate the measurements below.

---

## Where the work is

- Logical session: **active** (`2026-07-31-game2-continuation`). It ends only when the user
  explicitly says so.
- Working branch: **`codex/persistent-protocol-round10`**, created from
  `origin/claude/kagerou-round9-measurement-inj5qq` at **`6c4c093`**. Persistent
  cross-session authorization is active to push verified checkpoints, integrate them into
  `main`, and publish GitHub Pages without asking again. Paid, destructive, credential, and
  account actions remain outside that authorization.
- **Rounds 10, 11, and 12 are complete; Round 13 has not started.** The coherent `r12v1`
  checkpoint is complete, but integrated Round 9 product acceptance is not.
  `r9v1` proved that
  the six Round 9 fixes did not meet their integrated predictions. Round 10 rejected the
  shadow-erasure and toe candidates and fixed the vacuous edge verifier. Round 11 fixed the
  lantern receiver: the hero near/far ground ratio moved **1.121 → 2.394**, one horizontal
  additive pool now exists per lantern, and the black staircase-shaped band disappeared.
- Round 12 passes its targeted checkpoints: hero p99.9 **236**, torii **251**, all five
  black gates, 119 calls, 767,124 triangles, lantern A/B at **99.336%** positive / **+22.53**
  mean luma / **2.206** tail-core coverage. The final independent five-frame review confirms
  the staircase removal and lantern/tone gains but returns **FAIL overall**: fill, sky,
  mountains, foliage, layout, and sun framing remain below the premium bar.
- Remote publication is complete. PRs [#1](https://github.com/bachikoljunior-blip/game2/pull/1),
  [#2](https://github.com/bachikoljunior-blip/game2/pull/2),
  [#3](https://github.com/bachikoljunior-blip/game2/pull/3), and
  [#4](https://github.com/bachikoljunior-blip/game2/pull/4) are merged. The publication
  branch is **`bc598850ee34b4c5624f12f066f0b1692978ee5f`** and the verified publication-bearing
  `main` is **`025a079428e4374e8d8fc6912b1f858673228252`**. The canonical
  [Pages URL](https://bachikoljunior-blip.github.io/game2/) redirects to the production
  `/docs/` build, reaches ready/running, and has zero page, console, request, or HTTP errors.
  The initial HTTP-200 development entry and two speculative-module variants were rejected
  before this state was accepted.
- Exact next action: **await a future user instruction**. There is no active art round; do
  not start or infer Round 13 from the still-active logical-session flag.
- Verified local publication implementation checkpoint: **`5fb4c3c`**; rollback base:
  **`6c4c093`**.
- Round 8 is six commits: `bc96c3c` (critique), `e9b9717` (postfx), `4a310ed` (foliage),
  `1be775a` (world), `55693b9` (sky), `26bf937` (postfx, gate repair). Round 8 was run on
  `claude/kagerou-round-8-start-jk5lox` because the session operator named that branch, and
  merged to `main` at the end. **Round 7 had to be merged by round 8's session** — it had
  been left on its own branch, and `main` was two rounds stale. The standing remote
  authorization prevents that stale-default-branch failure from recurring.
- Rounds 1–3 scored 34 → 48 → 58. Round 4 was stopped before its verdict. Rounds 5–6 were
  unscored (run as measure-fix-verify). Round 7 scored **44**, round 8 **46**.
  Round 9's pre-fix critic scored **47**. The `r12v1` reviewer returned a qualitative overall
  FAIL with finding-specific measurements, not a comparable numeric score; do not invent one.
- **The 58 → 44 → 46 sequence is not a trend line.** Those scores come from different critic
  instances against a review set that has since had the HUD blanked (which removed the
  authored white ink the highlight gate used to pass on). Treat each as that round's
  baseline, not as evidence about the previous one.

## How to run a round

`ROUND.md` is the operational brief and carries the round number. In short:

```bash
npm run build
node tools/capture.mjs --review --diff --profile=phone --tag=rN
node tools/contact-sheet.mjs --tag=rN
# critic (opus/high) -> shots/review-rN.json
node tools/dispatch.mjs --round=N
```

For a release-candidate set, omit `--diff`, then run:

```bash
node tools/gate-capture-report.mjs --tag=rN --profile=phone
node tools/verify-r9.mjs --tag=rN
node tools/verify-lantern-spill.mjs --tag=<stopped-A/B-tag>
```

Facts about the rig that have cost real time:

- **Boot is ~35 s on phone/MEDIUM but ~200 s on desktop/ULTRA**, and each 1920×1080
  ULTRA screenshot took minutes under SwiftShader. Capture phone first; add desktop only
  when you specifically want to judge the showcase tier.
- `shots/.capture.lock` serialises runs. If a run is killed the lock survives — `rm -f
  shots/.capture.lock` before the next one.
- **Never `npm run build` while a capture is running.** It rewrites `dist/` under the server.
- The report is written at the *end* of the run. Kill the run and you lose the console
  error list and histograms even though the PNGs are on disk.
- The review set is captured with the HUD blanked. `luma.mjs`'s `HUD_MASKS` apply only to
  the `hud` shot — do not reintroduce them elsewhere or you throw away 8% of the world.
- `--diff` carries unchanged shots forward. **It reads `tools/manifest.mjs`'s last stamp**,
  so after a mid-round re-shoot under a new tag the next `--diff` carries from *that* tag.
  This continuation is a fresh clone: ignored Round 8/9 PNGs and manifest history are absent,
  so `r9v1` must be a full capture rather than relying on differential carry-forward.

## Judge the frames yourself, at native resolution

The images are 2532×1170. Anything read off a whole-frame view has been downscaled by
about 1.3× and **you will misread it**. Crop with `tools/probe.mjs crop` and look. Quote
numbers: `detail` is mean |Laplacian|, `lumaSpread` and `saturation` are the other two that
have been load-bearing.

This is not a stylistic preference. It has now produced three filed-and-wrong findings:
"no cast shadows anywhere" against a frame that plainly has them, a field of grass LOD2
cards called "lantern shadows", and round 8's blocker below.

## What round 8 disproved — do not re-test these

Round 8's most valuable output was disproof. **Two of the critic's four blockers described
real pixels but misattributed them**, and one of the two had been an open item for three
rounds.

- **"No object casts a shadow onto the ground in any daylight framing": WRONG, three ways.**
  (i) Ablation — forcing `kagShadowFade` negative collapses the shadow term without a
  recompile; diffing shows **45% of `torii`'s near ground band is cast shadow**, p50 **43.0
  lit against 19.9 shadowed, a factor of 2.16**, which is exactly the factor the critic's own
  `fix` field asked for. On `wide`, 72,239 px of the lower band, p50 42.2 against 23.1.
  (ii) Native crops of the r8 frames show the post-and-crossbeam cross shadow on the sand and
  lantern, plinth and pole shadows under the torii. (iii) At the 13° sun elevation the build
  runs, a shadow lands **4.33× the caster's height downsun** — a 6 m post throws 26 m, and the
  critic's probe boxes sit beside the post, ~26 m short of the shadow they were looking for.
  That same arithmetic disposes of the separate "dark ovals with no caster above them"
  finding: detached-looking ground shadows are the *correct* output at this elevation.
- **The `kagGetShadow` `found < 0.5` early-out is innocent.** Live readback puts the PCSS
  search at **0.180 m**, not the 36.9 cm in the standing note — that figure described the
  pre-round-7 code state. Any receiver inside a shadow bar has the caster's depth in its own
  texel, so the early-out can only touch a sub-0.18 m penumbra fringe. Disabling PCSS
  entirely moves the frame 8.74% darker against its own 9.08% brighter noise floor, i.e.
  indistinguishable from noise.
- **The edge fringe is not lens dispersion and not radius-dependent.** The chromatic offset
  is correctly radial; mean fringe by radial fifth is **flat and largest on axis**
  (6.55/7.10/6.36/5.77/5.01). CAS weights the wrong channel by an order of magnitude, and
  FXAA cannot reach the measured G/R ratio because its output is a convex combination of its
  neighbours. **Confirmed cause instead:** `USE_CHROMATIC` assigned `color.r`/`color.b` from
  raw texture fetches, discarding `resolveAA()` for two of three channels.
- **The far range in `wide` is macro heightfield, not the parallax ridge band.** Ray-marching
  the pose puts the critic's box on terrain at **1000–1080 m, surface 940–1055 m ASL**,
  corroborated independently by the snow line landing exactly there. The ridge band is a
  5000 m cylinder. **This is finally why round 6's ridge-band haze retune measured as a
  no-op** — it was retuning something that does not draw those pixels.
- **The `wide` ridgeline silhouette is not the defect.** Measured as the 32 m clipmap lattice
  actually samples it, the longest straight run over the critic's full span is **72 px** and
  over the far half **42 px** — already inside the critic's own "no straight segment longer
  than 60 px" target, with 2nd-difference RMS 0.97 px.
- **The magenta sky dashes are not degenerate billboards and are not "floating in clear
  sky".** 112 components have a height histogram of `{1:35, 2:65, 3:10, 4:2}` and a **median
  aspect of 1:1** — specks, not slivers of a collapsed quad. BFS to the nearest solid canopy
  mass has a median of **6 px** (valley) and 8 px (sun); the critic's "60+ px above the
  canopy" is the extreme tail. A luma-only detector, immune to the chromatic fix, finds
  **2/2/0/0/0** genuinely detached specks.
- **Weather particles are not the dashes.** The chroma-based speck population is
  framing-independent at 396–612 across all five frames, which fits a camera-boxed particle
  field — but the luma test kills it.
- **`valley` saturation cannot be fixed from `Terrain.js`.** Fitting the illuminant from the
  frame's own mean gives **R:G:B = 0.935 : 0.375 : 0.132**. Under that illuminant a
  *perfectly achromatic* ground albedo still measures sRGB saturation **0.593–0.609** against
  a 0.55 target. Note sat = (R−B)/R here, so green content cannot move it at all — only blue.
- **`envMapIntensity` in `Props.js` was dead, confirmed at source.**
  `three.module.js:17343` overwrites it from `scene.environmentIntensity` for any
  `MeshStandardMaterial` with a null `envMap` while `scene.environment` is set. All four
  authored values (1.35–2.6) were overwritten before upload. Removed.

Also disproved in round 7 and still not worth re-testing: cascade coverage as the cause of
missing contact shadows; the lanterns being absent from the caster set; the `#4a6b8f` fill
being delivered at 0.09 against an authored 0.35 (the *level* was right, the *share* was
wrong); a regular stipple pitch (2-D autocorrelation has no peak above r = 0.08 at any lag
from 3 to 60 px); the near mesh plants being the floating culms; and `PostFX.js`'s own
authored god-ray gain derivation, which claimed an upright removes ~22% of the disc term
when it removes none — `delta = (vUv − sunUv)/N`, so every pixel's march terminates at the
sun's UV and collects the disc as its last tap.

## Open items, each with the measurement that states it

Ordered by what a hostile art director would hit first. Numbers are the round-8 verification
capture (`r8w`) unless stated. Round 9 attempted several of these and added new findings;
the current source-level predictions are not replacements for measured post-fix values.

1. **There is no instanced ground cover in the basin at all.** `grassRadius` is **34 m** at
   MEDIUM; the `valley` measurement box spans **15–90 m** and `wide`'s plain sits entirely at
   **55–82 m**. Terrain shading can raise `detail` — round 8 took valley **7.57 → 10.3** and
   wide's mid-ground **4.78 → 6.12**, both past target — but it cannot put grass where none
   is instanced. This is the dominant remaining part of the bare-ground blocker and it is
   **not** in `Terrain.js`. Owner: `src/render/Foliage.js`.

2. **The cool fill is eaten between the rig and the pixel.** This is the round's most
   consequential unfixed finding and two independent agents reached it. The rig delivers fill
   0.446 against key 0.396 (53% of the illuminant) and a term ablation confirms the fill
   itself *is* cool and *is* arriving — fill-only on `torii`'s ground band measures meanRGB
   **13.0, 16.0, 17.0**, R−B −3.9. Yet the illuminant fitted from `valley`'s own pixels is
   B/R **0.141**, which is `sunColor`'s own B/R of 0.134 — **the ground is lit by the key
   nearly neat**. Roughly a tenth of the budgeted fill survives. The two multiplications that
   scale `indirectDiffuse` and *not* the key are `Materials.js:2237` (triplanar AO,
   `aoMapIntensity` to 1.25) and `PostFX.js:397` (SSAO at `uAoStrength · indirect`, → the
   full 0.85 as luma → 0). **Do not raise the fill in `Lighting.js` to compensate** — two
   successive `sky` agents declined for the same reason and both were right; it would be
   paying twice for something eaten downstream. This is also where `valley`'s saturation has
   to come from (item 4). Owner: `src/render/Materials.js`, with `PostFX.js` second.

3. **The far range is still under-textured.** detail **1.28 → 1.68** against the ≥ 3.0 the
   owner predicted — a real move, well short of target. The mechanism is known and recorded:
   every far band is gated by `kgFine = 1 − smoothstep(1.15, 2.70, kgFoot)`, which evaluates
   to ~0.06 at 1.6–2.5 m of rock per drawing-buffer pixel. Round 8 added one footprint-locked
   band (`kgLodBand`); it needs more. Owner: `src/world/Terrain.js`.

4. **`valley` saturation 0.609 against a 0.55 target.** Not reachable from albedo — see the
   disproof above. Only blue moves it, and the blue is being eaten by item 2. Owner:
   `src/render/Lighting.js`, but do not act before item 2.

5. **The god-ray warm cast is damped, not gone.** `sun` shadow probe R/B **14.75 → 8.85**
   against a ≤ 7.0 prediction. Whole-frame R−B on `valley` is 57.1 and `sun` 39.8. Round 8
   found the real driver was not the gain but the **tint**: round 7 set `uGodTint` to
   (1.0, 0.52, 0.26) in the same commit that raised the gain, and deposited R−B scales as
   `gain × (tintR − tintB)` — a **73× rise in colour against 4× in luminance**, which is why
   it read as a warm cast rather than a brightening. Now gain 0.80, tint (1.0, 0.94, 0.88).
   Owner: `src/render/PostFX.js`.

6. **The sakura canopy now emits less than it did.** Round 8 made the blossom emissive floor
   directional (crown luma 0.233, underside 0.068, ratio **3.42:1** against a flat 1.00:1),
   which was the right fix for the value break — but it cost **301 of `hero`'s highlight
   pixels**, the largest single contributor to the gate regression below. That is an art
   question about how much a backlit canopy should emit, now decoupled from the contract
   check. Owner: `src/world/Props.js`.

7. **Trees float over the clipmap chord.** `_scatterTrees` plants through `_heightAt`, not
   `_plantY`, and neither tree material declares `sink` — the exact defect round 7 fixed for
   bamboo, still live for trees. Found by the foliage owner and flagged rather than changed
   blind. Unmeasured. Owner: `src/render/Foliage.js`.

8. **`wide` is front-lit by construction** — sun 123° off the view axis, so no specular in
   frame reflects toward the viewer. It is exempt from the highlight gate for that reason,
   recorded in `tools/capture.mjs`. A real fix means moving `WORLD.SUN_AZIMUTH_DEFAULT` or
   re-siting the shot, and that reaches every framing and five rounds of lighting tuning. Do
   not attempt it in the same round as tonal work.

9. **The world has almost no environment reflection.** `scene.environmentIntensity` reads
   **0.0643** live (probe luminance 2.823 → 0.182 irradiance, exactly as designed). It also
   scales specular IBL. A look cost, but not something to change blind while the diffuse half
   is being eaten by item 2.

10. **1.25% of macro heightfield cells exceed `HEIGHT_MAX = 1200` and clamp flat at 1199 m.**
   Pre-existing and not made worse by round 8 (1.25% → 1.17%). Worth a look if flat summits
   ever show. Unowned.

11. **`Cinematic.js`'s `SHOTS.sun` pose is wrong about its own framing.** Its comment claims
   the sun "sits in the open bay at ~3.2 m"; it actually lands dead centre behind the
   shimenawa's tassel (the disc's UV is 0.500,0.500 and that pixel is rope at RGB 114,86,30),
   so the ~150-linear disc never enters the depth-masked emitter. "No sun disc in frame" is a
   **pose** fault, not a renderer fault. A ~1.2° nudge of the target recovers it. Carried
   from round 7, still unactioned. Owner: `src/core/Cinematic.js`.

12. **`Terrain.js`'s displacement-aware blend runs on ~10% of its designed range**, and
   round 8 measured *why* fixing it would not help the blocker: at 15–90 m the library
   textures have mipped to their mean, so the `kgLum()` micro-heights are constants and
   interlocking is impossible at any window width. It only affects ground inside ~20 m.
   Deliberately deferred. Owner: `src/world/Terrain.js`.

## The gate regression, and the lesson in it

`hero`'s white gate (p99.9 > 235) failed on the first verification capture at exactly 235,
down from round 7's 236. Bisecting by rebuilding each revision and counting pixels above
luma 235 (the gate needs 2,962 of 2,962,440):

| tree | px > 235 | p99.9 |
|---|---|---|
| r8 baseline | 3,073 | 236 PASS |
| + PostFX only | 2,939 | 235 FAIL |
| full round 8 | 2,627 | 235 FAIL |

**No single owner caused it and no single revert fixes it.** The four changes cost 301
(Props' directional emissive), 198 (PostFX's AA fix), 73 (Sky's derived fog) and 60
(Foliage's rebuilt mask) — off a cushion of **3.7%**. The frame legitimately lost ~15% of its
highlight population to four changes we wanted.

Two things worth carrying forward:

- **A margin of 3.7% on a contract gate is not a pass, it is a coincidence.** It is now 52%,
  by `filmicShoulder` 1.14 → 1.20 — a change that cannot touch the black end, because
  `filmicToeShoulder` pins both exponents at `uFilmicPivot` so nothing at or below code 112
  moves by construction. Watch this number rather than the boolean.
- **The owner's own bound on its change was wrong twice**, and it recorded both: structurally,
  it bounded the percentile at 235.6 while the gate is `> 235` on an **integer bucket**, so
  the bound permitted the outcome it existed to exclude; numerically, it bounded only FXAA's
  edge-gated pixels, but routing red and blue through the resolve also sends them through
  **CAS, which runs on every pixel**. Bound the metric the gate actually tests, at the
  precision it actually tests it.

## Rules this loop keeps learning the hard way

- `tools/CRITIC.md`'s central rule applies to whoever is fixing, not just whoever is
  reviewing: **a finding right about the symptom and silent about the cause is worth more
  than one that guesses the mechanism.** Round 8 is the strongest evidence yet — two of four
  blockers were real symptoms with wrong causes, and both would have produced wasted or
  harmful fixes if acted on directly.
- **Ablation beats inspection.** Every one of round 8's disproofs came from removing a term
  and diffing, not from reading the code and reasoning about it. Configuration that looks
  correct is not evidence.
- Verify a change by measuring the same region before and after. Byte-identical numbers mean
  the branch you edited does not draw those pixels — not that the change was subtle.
- **State a falsifiable prediction before the fix, then measure it.** Round 8's owners did,
  and it is how two shortfalls (far-range detail 1.68 against ≥ 3.0, god-ray probe 8.85
  against ≤ 7.0) got recorded as shortfalls instead of reported as successes.
- **When two owners change the same frame, their predictions stop being separable.** Round 8
  could not evaluate postfx's dark-population R−B targets because sky's fog change moved the
  same metric on the same pixels. Predict on a metric your own change is the only plausible
  mover of, or say plainly that the number is contaminated.
- The performance contract counts *submitted* triangles. `Engine.auditDraws` reports it per
  object; `capture.mjs` rolls it up by owning system whenever a cap is missed.
- Budgets are frustum-dependent. The rig samples every pose and asserts the worst.

## The apparatus held in round 8 — the first round in a while

No apparatus break this round, and it was not luck: three owners independently wrote offline
evaluators and **all three validated against `tools/probe.mjs` on an identical region before
trusting a number**. `world`'s ray-marched terrain simulator reproduces
`probe.mjs stats shots/phone-valley-r8.png 0.10,0.35,0.45,0.25` to the digit; `foliage`'s
speck detector likewise; `sky`'s diff decoder likewise. One owner caught itself mid-round
using an xorshift replica where the repo uses `mulberry32` and re-ran every figure.

Keep doing this. The rule stands: **run one region through `probe.mjs` first and require
agreement to the digit.** Six apparatus breaks, every one of which turned a correct critique
into a wrong fix.

---

## The other line: `claude/round-q78i6x`

Not merged. A parallel round-5 run from a different base. Its round kit (`dispatch.mjs`,
`manifest.mjs`, `capture.mjs --diff`, `AGENT-PREAMBLE.md`, `ROUND.md`) has since been brought
onto `main` and is in use. Its remaining unmerged content is art-direction work that
overlaps `Foliage.js`, `Terrain.js`, `Sky.js`, `capture.mjs`, `HUD.js` and `Menus.js`.
Merging it is a real conflict-resolution job and a decision for a human. Ask before starting.
