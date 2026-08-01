# Handoff — the art-direction review loop

This file exists because the work happens in ephemeral containers. `shots/` is
gitignored and the review images do **not** survive a session; everything a later
session needs to continue has to be in the repo. Read this, then `README.md`
("Where this build actually stands") for the current measured numbers, then
`tools/CRITIC.md` for the standing bar.

The bar itself is now per element:
`AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` holds the reference title and criteria for each
of the sixteen elements. This loop covers **E11-VISUALS** and **E05-WORLD** (plus
**E07-CHARACTER** and **E09-UI** where the frame shows them); the other twelve elements are
outside what a still frame can judge and are not passed or failed here. Element criteria live
in that file — measurements stay here.

Update this file after every meaningful art-round iteration. It is the only detailed
art-direction state record; project-wide session, plan and criterion pointers live under
`AI_DEVELOPMENT/` and must not duplicate the measurements below.

---

## Where the work is

- Logical session: **active** (`2026-07-31-game2-continuation`). It ends only when the user
  explicitly says so.
- Current working branch: **`claude/kagerou-round-16-q5h1ah`**, created from the
  BENCH-APPARATUS checkpoint `4a53d74` and fast-forwarded onto `main` at **`4811ba0`**.
  It carries **Round 16** (eight commits) plus the TD-010 physics fix. The
  benchmark branch `claude/game-reference-benchmark-qh0v0q` is merged at `0a4fd14`, the
  interaction-capture branch `claude/kagerou-benchmark-verification-7fb2zd` is merged at
  **`4811ba0`**, and the round-15 branch `claude/1-round-execution-r6rdfs` and the
  rounds-13–14 branch `agent/rounds-13-14` are merged and historical. Persistent
  cross-session authorization is active to push verified checkpoints, integrate them into
  `main`, and publish GitHub Pages without asking again. Paid, destructive, credential, and
  account actions remain outside that authorization.
- **Round 16 is COMPLETE.** Opening set `r16`, verification set `r16v1`. Opening verdict
  **FAIL** at **58/100**, 3 blockers / 4 majors / 1 minor. Four owners were dispatched and
  ten gated out; one blocker was re-routed mid-round. All contract gates hold on `r16v1`
  (below). Full measurements: `AI_DEVELOPMENT/EVIDENCE/r16-{sky,world,foliage,postfx}.md`.
- **Do not read 58 as a fall from round 15's 65.** `src/` at the `r16` capture was
  byte-identical to the tree the round-15 closing instance scored 65. Four fresh critic
  instances have now scored essentially the same pixels **50 → 62 → 65 → 58**. That spread
  is inter-instance variance, measured directly and now four points wide of the 12 recorded
  last round. **No round-over-round score comparison on this project is evidence of
  anything** unless it is the same instance or carries the variance with it.
- **Round 15 is COMPLETE.** Working branch **`claude/1-round-execution-r6rdfs`**, created
  from published `main` at **`8e72e01`**. Opening set `r15`, verification set `r15v1`.
  Verdict **FAIL** at **65/100**, 3 blockers / 5 majors / 3 minors, from 62/100 with
  4 blockers. Full measurements: `AI_DEVELOPMENT/EVIDENCE/r15-final.md`.
- **Read this before quoting the round-15 score.** The `r15` opening capture was taken on a
  tree byte-identical to `r14final` (build fingerprint `6693aa47…`). Round 14 closed at
  **50**; a fresh critic instance opened the identical pixels at **62**. That 12-point gap
  is **inter-critic-instance variance measured directly**, and the 62 → 65 closing delta is
  from a third instance, so it is not a progress measurement either. What *is*
  instance-independent this round: the detached-sky-dash blocker disappeared from the
  closing review entirely and is confirmed gone by pixel measurement and by eye, and the
  blocker count fell 4 → 3.
- **Rounds 10–14 are complete.** Round 14 opened at
  source-blind **44/100** with one blocker and two majors and closed on coherent
  `r14final` at **50/100** with one blocker and two majors. The exact sun-glare region moved
  **38.112% → 11.330%** over 90% luma and disappeared from the final review. Detached
  bamboo skyline fragments remain blocking; terrain scale and sparse courtyard dressing
  remain major findings. The foliage collar and terrain range gates produced bounded partial
  moves, while a follow-up leaf-angle hypothesis failed and was explicitly reverted.
  (Round 15 has since been authorized, run and closed — see above.) Round 13 had opened at **36/100** with two
  blockers and closed on `r13v2` at **43/100** with one blocker. The coherent `r12v1`
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
  [#4](https://github.com/bachikoljunior-blip/game2/pull/4), and
  [#6](https://github.com/bachikoljunior-blip/game2/pull/6) are merged. The Rounds 13–14
  publication branch is **`b2a7433de7ff72082287d6b5429ca8af54a8642b`** and its verified
  publication-bearing `main` merge is **`4a3eff701af0f6db52f5b780247e38422d40aad6`**. The canonical
  [Pages URL](https://bachikoljunior-blip.github.io/game2/) redirects to the production
  `/docs/` build, loads current **`index-D_EFhYS4.js`**, reaches ready/running, and has zero
  page, console, request, or HTTP errors.
  The initial HTTP-200 development entry and two speculative-module variants were rejected
  before this state was accepted.
- **Round 16 publication is repository-verified but NOT publicly verified.** `origin/main`
  is **`d357cbd`**; `docs/assets` carries `index-BDxY4oFM.js`, `main-CEfIoK1B.js`,
  `Rig-aFbvwGGB.js` and `three-BTL71eav.js`, `docs/index.html` references
  `assets/index-BDxY4oFM.js`, and the superseded `index-BoUb9vMW.js`, `main-0qGNkpyh.js`
  and `Rig-DmfyOsEa.js` are gone. Bundle 482 kB gzip against a 1.6 MB budget. **The live
  surface was not checked**, for the same reason as round 15: the agent proxy in this
  container denies `bachikoljunior-blip.github.io:443` by policy (403 on CONNECT, confirmed
  again via `$HTTPS_PROXY/__agentproxy/status`), so both `npm run verify:pages` and `curl`
  fail before reaching GitHub. **Do not record a Round 16 public browser gate until it is
  actually run from a network that can reach github.io.** The last verified public browser
  gate remains the Rounds 13–14 one at `4a3eff7`.
- **Round 15 publication is repository-verified but NOT publicly verified.** `origin/main`
  is **`e40a188`**; `docs/assets` carries `index-BoUb9vMW.js`, `main-0qGNkpyh.js`,
  `Rig-DmfyOsEa.js` and `three-BTL71eav.js`, `docs/index.html` references
  `assets/index-BoUb9vMW.js`, and the superseded `index-D_EFhYS4.js`, `main-Ctu2PmB7.js`
  and `Rig-DXuvNL97.js` are gone. **The live surface was not checked**: the agent proxy in
  this container denies `bachikoljunior-blip.github.io:443` by policy (403 on CONNECT,
  confirmed via `$HTTPS_PROXY/__agentproxy/status`), so both `npm run verify:pages` and
  `curl` fail before reaching GitHub. **Do not record a Round 15 public browser gate until
  it is actually run from a network that can reach github.io.** The last verified public
  browser gate remains the Rounds 13–14 one at `4a3eff7`.
- Exact next action: await a future user instruction. The user closed Round 16 explicitly
  ("今途中のラウンドが終わるまでにして") after authorizing five rounds, so **Rounds 17–20
  were cancelled, not deferred for cost** — do not resume them as if they were queued.
- Current rollback point for round 16: **`4811ba0`** (the branch base). Owner commits are
  `e503c95` sky, `6decc1c` world, `2314ae8` foliage, `9330fa8` physics, `b38c71b` postfx,
  `391c0f4` world (canopy re-route), with `4388b3d` the critique and `c6d0eb5` the debt
  reconciliation.
- Previous rollback point for round 15: **`8e72e01`** (published `main`, the branch base).
  Owner commits are `65617e7` foliage, `11c8795` world, `30f20f4` materials, `c8ce3ee` sky,
  `b196bb8` postfx. Previous verified publication implementation checkpoint: **`5fb4c3c`**.
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

## Round 16, measured

Opening `r16` and verification `r16v1`, both phone/MEDIUM, both full captures with nothing
carried forward. `r16v1` was taken on a clean tree at `391c0f4`, build fingerprint
`69f5890f…` — not a mixed build.

| | r16 | r16v1 | contract |
|---|---|---|---|
| draw calls, worst pose | 119 | **120** (`torii`) | ≤ 140 ✓ |
| triangles, worst pose | 784,449 | **781,386** (`wide`) | ≤ 900,000 ✓ |
| black gate p0.1, all five | 0, 11, 0, 1, 5 | **0, 11, 0, 0, 0** | < 15 ✓ |
| white gate, gated shots | hero 236, torii 251 | **hero 236, torii 251** | > 235 ✓ |

Triangles *fell* by 3,063 across a round in which five owners added visible content.

What each owner measured, on its own regions:

| owner | measurement that moved |
|---|---|
| `Sky.js` | `hero` sunward sky R−B **−2.3 → +38.7**, saturation 0.031 → **0.228**, lumaSpread 20.4 → 48.2; pure-sky patches over lumaSpread 45 **0 → 31 of 162** |
| `Terrain.js`/`Props.js` | far-range saturation 0.119 → **0.145**, snowcap R−B 37.3 → **43.1**, backlit nobori detail 3.09 → **4.62**, plaza path separation 9.5% → **19.5%** |
| `Foliage.js` | band box G−R −0.1 → **+2.3**; card-owned pixels +5.8 → **+9.1**, card-owned spread 93.6 → **106.3** |
| `PostFX.js` | `rtGodB` visible coverage `sun` 89.0% → **39.2%**, `valley` 87.8% → **30.1%**; `sun` band16 on the left upright's wedge 5.99 → **15.47**; `valley` mid p50 158.9 → **106.8**, column max:min 1.58 → **2.24** against an ablation ceiling of 2.25 |
| `Props.js` (canopy) | violet crown population 0.552 → **0.328**, mean B−G **+5.7 → −2.8**, shaded-cluster B−G +11.0 → **−0.6** |
| `Physics.js` | narrow-phase tests **209,886 → 8,062**; three-enemy JS frame **161.6 → 3.7 ms** |

**Shortfalls, recorded as shortfalls.** `sun` band16 on the r15 strip reached 4.72 against a
7.0 target (the sweep says gain 0.28 reads 6.38 and gain 0 reads 10.88 — not taken further
with no review left to judge the trade). The canopy transition band reached 0.234 against
≥ 0.30, crown `detail` **fell** 7.67 → 7.05 where a rise was predicted, and the **crown
silhouette got worse**: longest straight run 23 → 27 px against a ~12 px target. All three
far-range numeric targets were missed, with the levers measured into hard diminishing
returns (+40% aspect chroma buys +0.009 saturation). `torii`'s sky structure moved only
11.7 → 14.6 lumaSpread.

**One unverified line, carried deliberately.** `Props.js:1783`'s `kagBias = 0.45 + 0.55 *
kagJoint` shipped in `6decc1c` and was never frame-measured — the rig was contended all
round. It is reasoned (the joint mask measures ≈ 0, so the term contributed nothing; this
lifts it to ≈ 0.45 of authored weight, a 7–10% albedo modulation at 1.6 m) but it is an
unverified line, not a claim.

## What round 16 disproved — do not re-test these

- **The sakura canopy in `hero` is `Props.sacredTree`, not `Foliage.js`.** Proved three
  ways: a projection reconstructed from `Cinematic.js` and calibrated against the documented
  sun-disc UV puts the crown at `hero` UV 0.112–0.337, 0.099–0.346 against the critic's
  0.12–0.34, 0.10–0.35, with the trunk landing where the frame shows the shimenawa-tied
  trunk; `_scatterTrees` rejects `plateauMask > 0.5` so the nearest Foliage sakura is
  87–142 m away and lands on the horizon; and hiding the entire `FoliageSystem` leaves the
  crown and both hue populations intact (violet mode 24.9% → 25.5%). **Round 15's
  `uWarmFill` fix was sized from this exact measurement and applied to Foliage's leaf
  material, which cannot draw a pixel of that crown.** That misroute cost two rounds.
- **The canopy's two-hue split was a normals defect, not a tint or sidedness defect.**
  `computeVertexNormals()` on planar quads gave every card a single normal — max intra-quad
  normal spread **0.000°**, now 129.6°. A constant-shaded polygon under one hard key can
  only take two values, which is exactly why nothing sat between the populations.
- **The god-ray pass had no scattering phase function at all.** Its angular weight was at the
  *source* (`prox`), and since `delta = (vUv − uSunUv)·uDensity/N` every march terminates
  inside the emitter, so every pixel collected the same near-sun taps. That is the mechanism
  behind round 15's "common mode, not differential" measurement. Removing `prox` as well is
  **worse** (`rtGodA` 23.4% → 40.7%, strip band16 2.65 → 1.74) — it stays.
- **The `sun` mid-field wash is not `PostFX.js`.** Predicted >10 codes of movement on the
  wash box under full ablation; measured **1.1**. That box is sky. The same ablation moves
  `valley` mid p50 158.9 → 81.2, so the two framings do not share a cause.
- **The sun-disc desaturation is neither `Sky.js`'s nor `PostFX.js`'s as scoped.** The disc
  leaves `Sky.js` at saturation **0.238**, lumaSpread 77.6, >100 px falloff; the frame reads
  0.036 / 21.9. But at 293 scene-linear the ACES fit returns 255/255/255 before anything
  additive, and the disc core measures 254.7 flat — the 53× peak cut costed from the sky side
  returns saturation **0.010**, not 0.25. Only a hue-preserving highlight rolloff fixes it,
  and that is a whole-frame grade decision nobody currently owns.
- **The critic's "achromatic sky" mechanism guess was wrong.** Rotating the sun on the
  *unmodified* dome swings the box 42 code values of R−B, so the gradient always tracked the
  sun; the defect was that the response was too narrow (only +15.5 at 10.5° from the patch).
- **The critic's "open ground" box in `wide` is not distant terrain.** Ray-marching puts it on
  plateau apron at **49.8 m**, where `kgA` evaluates to exactly zero — no aerial term draws
  those pixels. Its warm/cool split also already passes (+12.1 / −9.0 R−B against +12 / +6);
  only the mean cancels.
- **The plaza joint mask cannot be driven off `Props.js`'s normal map**, and `greenFrac` is
  the wrong metric for moss under a `[1, 0.412, 0.134]` key — a green albedo still comes out
  R-leading. Two dressing criteria (R9-DRESSING-001 a and b) already pass in `Level.js`,
  reproduced through its private RNG: spacing ±28.7% / ±31.2%, heights ±21.6%, 6 of 16
  lanterns leaning, 4 of 16 weathered.
- **`impostor` uniforms `uTipGlow`, `uBaseAO` and `uGrain` were uploaded every frame and
  compiled out** — proven at the driver (`getUniformLocation` null before, non-null after).
  The impostor was the only foliage material with no light model at all.

## Apparatus faults found in round 16 — the rig has now broken ten times

- **An interaction run defaulted to `--tag=i1` and overwrote `shots/interaction-i1.json`**,
  the committed BENCH-APPARATUS baseline cited by `README.md`, this file and the frontier.
  Caught by the coordinator, restored from git, and the run's data preserved. Same shape as
  round 5's per-profile retry erasing the phone baseline mid-round. **Always pass an explicit
  distinct `--tag` to `interaction-capture.mjs`.**
- **Container CPU time is not comparable across runs.** The clobbered run measured
  `noEnemies.msPerFrame` **0.888** against i1's recorded **1.41** on a path nothing had
  changed, because five agents were sharing four cores. Millisecond baselines from a
  different container are not valid comparisons; `narrowphaseChecks` is deterministic and is
  the number to lead with.
- **A `--ab-object`-style rig returned frames at mean RGB (7.2, 5.8, 5.7)** because
  `__kagerouStart()` and `skipIntro()` were issued in one `page.evaluate` and the title card
  was still up. It would have "proved" the canopy routing off two black frames. Caught by
  [foliage] before it produced a finding; its rig now asserts screenshot p50 > 30 before
  measuring. Note the obvious in-page check is itself wrong — `drawImage(canvas)` returns
  black under `preserveDrawingBuffer: false`.
- **Two owners stalled silently for ~6 hours** with no error and no notification, holding
  uncommitted edits. Detected by comparing evidence-file mtimes against wall clock and by
  finding no rig process and no lock held; both were recovered by resuming from transcript.
  A quiet agent is not a working agent — check mtimes, not elapsed time.
- **The highlight gate is a floor, not a ceiling.** `capture.mjs:645` tests `p99.9 > 235`.
  An owner wrote its own acceptance bound as `≤ 240`, the wrong sense, which would have
  passed a frame that fails the build. It caught and corrected this itself.

## What round 15 disproved — do not re-test these

Round 15 was mostly a disproof round, and three of its results retire items that had been
steering work for several rounds. Full numbers in `AI_DEVELOPMENT/EVIDENCE/r15-final.md`.

- **Open item 2 is DEAD. The cool fill was never being eaten; the measurement omitted
  albedo.** Three owners eliminated all three named suspects independently.
  `MaterialLibrary.triplanarPatch` has exactly one call site, `Terrain.js:1608`, called with
  **no material**, so it returns at its first line and the cited `TRI_AO` block never runs.
  `PostFX.js`'s `FRAG_RESOLVE` receives only `tScene`, the *composited* radiance — there is
  no indirect-only buffer, `c *= occTint * k` multiplies key and fill alike, and its only
  colour term `uAoTint (0.78,0.85,1.0)` has B/R 1.282, so it can only make occluded pixels
  cooler. Ablating both at once (`aoMapIntensity = 0` everywhere, `uAoStrength = 0`) moves
  the fill-only plaza **21.0 → 21.6 p50, +2.9%**, against a noise floor where 77–87% of
  pixels already differ by > 0.5; "a tenth survives" needs ≈ −90%. The fill measures
  **52.9% of the illuminant, exactly as budgeted**. The reason the original number looked
  damning: an illuminant fitted from a frame's own pixels returns illuminant × albedo, and
  these albedos are warm by authored construction (cobble 0.700, cedar 0.519, dirt 0.369
  linear B/R), with `Terrain.js` multiplying dirt by a further (0.58,0.46,0.35). That is
  exactly why `valley` fitted 0.141 against the key's own 0.134.
  **The genuine defect in the same area** was a unit bug: `SHADOW_FILL_MAX_RB = 0.52` is
  §5 `#4a6b8f`'s R/B in **sRGB** compared against three's **linear** `Color.r/Color.b`,
  where it is **0.2493** — a ceiling 2.08× too warm, so the clamp had never fired. Fixed.
- **Open item 7 is CLOSED — trees no longer float.** `_scatterTrees` already plants through
  `_plantY`, both tree materials declare `sink: true`, the impostor reads the deficit from
  `aFoliageB.z`, and the runtime placement audit reports `floating: 0`.
- **Open item 11 is STALE — the `SHOTS.sun` pose is not the fault.** `_sunUv` reads
  **(0.60509, 0.54474)** live with `_sunScreenStrength = 1.0`, and the round-15 critic
  independently measured the disc at (0.604, 0.453). Its (0.500,0.500)-on-the-tassel figure
  describes a pose that has since been replaced. Nothing should be routed to `Cinematic.js`
  for the god rays.
- **"No cast shadow on the plaza" is WRONG for the third time.** The critic's own box
  (152,1006,152×59), labelled "shaded plaza", is **84.6% cast shadow** — it measured the
  shadow and called it the ground. The closing critic independently killed the same
  candidate by cropping at native. **Nobody should touch cascade code.** The real limit is
  an exposure ratio: `ambientReport` omitted `this.rim`, an unshadowed scene-wide
  directional worth 0.1482 luminous irradiance, so fill is **0.5937 against key 0.3960 =
  1.50×** and the best achievable contrast is 1 + key/fill = **1.67×** against 1.38×
  measured.
- **The dark plaza blobs are not drawn by `Materials.js`.** Scale: the plaza tile is 1.61 m
  with weathering fields at 27/31 cm, so nothing in it can be a 2–3 m blob. Value: the
  critic's box reads **0.051 of its neighbour in linear, 4× darker than the darkest
  reflectance this file can produce**. Light is being removed, not reflectance. The closing
  critic independently re-filed the same patch against `Lighting.js`.
- **Undersampling is not what stops the god rays.** Holding gain via `uDecay = 0.94^(24/N)`,
  `rtGodB` mean/p90 = 0.1194/0.2928 at N=24, 0.1088/0.2703 at N=48, 0.1083/0.2740 at N=96 —
  converged by 48. Do not spend fill on `GOD_SAMPLES`. The emitter is not empty either:
  `rtGodA` is 10.2–11.0% non-zero with the uprights, shimenawa, shide and bamboo present.
  **What the pass actually does is smear a 10%-coverage emitter across 99.9% of the frame —
  it delivers common mode, not differential.** `sky` reached the same place from the other
  side: removing 100% of the aerial perspective moves the haze finding's boxes by nothing
  (p50 226.3 → 226.2), while turning **bloom and god rays off** moves them decisively
  (saturation 0.188 → **0.348**, p50 226.3 → **206.4**). The god-ray finding and the
  mid-field-wash finding are one defect. **If anyone acts here it must be less spread, not
  more gain** — more gain is the round-7 regression.
- **The sky's flatness is NOT a round-15 regression.** Measured before/after on the same
  regions: `sun` upper sky saturation 0.069 → 0.069, anti-solar 0.038 → 0.038, `hero` sky
  band 0.076 → 0.075. The largest move anywhere is −0.018 on `valley`, whose lumaSpread
  *rose* 59.8 → 65.7. The closing critic's "achromatic grey card" blocker is a real
  long-standing defect newly surfaced, not something this round broke.
- **Vermilion is correct** — torii posts measure RGB [170.6,49.7,23.7] and [142.7,42.0,19.7]
  at saturation 0.87 against the contract's `#c8321e`. Earlier "washed pink" readings were
  edge contamination from the sky. Sky banding is cleanly dithered under a 16× contrast
  stretch. Lantern ground-spill discs are soft warm pools, not hard-edged coasters.

## Apparatus faults found in round 15 — the rig has now broken eight times

- **`detail` cannot measure a light shaft, and a finding's acceptance target was therefore
  unsatisfiable by any physical fix.** Synthetic shaft banding of ±40 code values at a 60 px
  period scores `detail` **0.47** — *below* the 0.57 the same critic called "mathematically
  smooth". Only ±25 at a 12 px period reaches 4.33, which is grain. Calibrated replacement:
  row-averaged high-pass of the 506×23 strip at lag 16 px (`band16`) ≥ 7.0 with the
  clean-sky control below 0.5 — synthetic ±10 @ 60 px = 7.06, current strip = 1.75, clean
  sky = 0.155, real ground = 11.43. **Use `detail` for fine texture only.**
- **Screenshots taken after `engine.stop()` are void.** `Engine` sets
  `preserveDrawingBuffer: false`, so the buffer is already gone; an owner's run came back
  98.7% below code 16. **Unverified consequence that must be checked before the retained
  `r12ab` lantern A/B evidence is cited again: `capture.mjs --ab-object` screenshots in a
  separate round trip after `engine.stop()`, so those pairs may be black.**
- **Hiding the HUD while the title card is live stamps 陽炎 permanently into every later
  frame.** `HUD.update()` clears the overlay once when hidden and returns, while
  `Menus.update()` keeps painting the intro wash into the same canvas. Owner
  `src/ui/HUD.js`. Related: `menus.skipIntro()` issued in the *same* `page.evaluate` as
  `window.__kagerouStart()` runs before the intro exists, because `begin()` is async;
  `capture.mjs` avoids this only by using two separate evaluates.
- **An ablation harness returned byte-identical results across all eight configurations**
  because `_passAdapt` writes the target the next composite reads. Caught by its own owner,
  which rebuilt it to settle like `capture.mjs` and hash every shot.
- **The round-7 four-byte-stride bug recurred**, this time in the closing critic's own
  decoder reading a 3-channel PNG, and produced a phantom "field of RGB confetti". It caught
  and corrected it before filing. The standing rule holds and earned itself again: **run one
  region through `tools/probe.mjs` first and require agreement to the digit.**

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

2. **CLOSED IN ROUND 15 — DISPROVED. Do not act on the text below; it is kept only so the
   reasoning that produced it stays legible.** The fill is not eaten: it measures 52.9% of
   the illuminant as budgeted, and all three named suspects were eliminated independently.
   The apparent loss was an illuminant fitted without dividing out albedo. See "What round
   15 disproved" above. ~~The cool fill is eaten between the rig and the pixel.~~ This was
   the round's most consequential unfixed finding and two independent agents reached it. The rig delivers fill
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

7. **CLOSED IN ROUND 15 — already fixed and the item was stale.** `_scatterTrees` plants
   through `_plantY`, both tree materials declare `sink: true`, the impostor reads the
   deficit from `aFoliageB.z`, and the runtime placement audit reports `floating: 0`.
   No change was needed.

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

11. **CLOSED IN ROUND 15 — STALE.** `_sunUv` reads (0.60509, 0.54474) live with
   `_sunScreenStrength = 1.0`, and the round-15 critic independently measured the disc at
   (0.604, 0.453); the current `SHOTS.sun` already documents (0.605, 0.455). The figure
   below describes a pose that has since been replaced. Nothing routes to `Cinematic.js`
   for the god rays. ~~Its comment claims
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
