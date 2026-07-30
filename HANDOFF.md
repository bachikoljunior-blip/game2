# Handoff — the art-direction review loop

This file exists because the work happens in ephemeral containers. `shots/` is
gitignored and the review images do **not** survive a session; everything a later
session needs to continue has to be in the repo. Read this, then `README.md`
("Where this build actually stands") for the current measured numbers, then
`tools/CRITIC.md` for the standing bar.

Update this file at the end of every round. It is the only thing that carries state.

---

## Where the work is

- Branch: **`main`**. Commit and push there unless a human names something else.
  This branch's history came from `claude/2-rounds-only-9uukb7` and was merged to `main`
  because a new session starts from the default branch — work parked on a feature branch is
  invisible to the next session no matter how well it is documented. Two sessions branched
  from stale points and lost the brief entirely before this was fixed, and each spent a
  round solving the same triangle-count problem. `claude/round-q78i6x` is that other line,
  still on the remote and not merged; see the note at the end of this file.
- Last three rounds: `f0543b2` (round 5), `16f21e4` (round 6), round 7 = four owner commits
  `60275bf` (foliage), `48af465` (world), `4f8c9c7` (sky), `64fd0ba` (postfx).
- **Round 7 was run on branch `claude/kagerou-round-7-review-1tk2pn`, not `main`, because the
  session operator named that branch.** It is pushed. **Merge it to `main`** — everything in
  `CLAUDE.md` about work parked on a feature branch being invisible to the next session
  applies to it.
- Rounds 1–3 scored 34 → 48 → 58 out of 100 against a Ghost of Tsushima / SEKIRO bar.
  Round 4 was stopped before its verdict. Rounds 5–6 were not scored — they were run
  as measure-fix-verify rather than as a scored critique. Round 7 scored **44**.
  **The build has not passed.**
- **The 58 → 44 drop is not a regression measurement.** Round 3's 58 and round 7's 44 come
  from two different critic instances, four rounds and two unscored rounds apart, against a
  review set that has since had the HUD blanked (which removed the authored white ink the
  highlight gate used to pass on). Treat 44 as round 7's baseline, not as evidence that
  rounds 5–6 made the build worse.

## How to run a round

```bash
npm install
npm run build
node tools/capture.mjs --review --profile=phone --tag=rN     # the five review framings
node tools/probe.mjs stats shots/phone-wide-rN.png 0.05,0.50,0.22,0.16
node tools/probe.mjs crop  shots/phone-wide-rN.png 0.05,0.50,0.22,0.16 /tmp/c.png
```

Facts about the rig that cost this session real time:

- **Boot is ~35 s on phone/MEDIUM but ~200 s on desktop/ULTRA**, and each 1920×1080
  ULTRA screenshot took minutes under SwiftShader. A full `--profile=phone,desktop
  --review` run did not finish inside a reasonable window. Capture phone first; add
  desktop only when you specifically want to judge the showcase tier.
- `shots/.capture.lock` serialises runs. If a run is killed the lock survives — `rm -f
  shots/.capture.lock` before the next one.
- **Never `npm run build` while a capture is running.** It rewrites `dist/` out from
  under the server. It did not break anything this session, but only by luck.
- The report is written at the *end* of the run. Kill the run and you lose the console
  error list and histograms even though the PNGs are on disk.
- The review set is captured with the HUD blanked (`HUD.__hide`, and `Menus` honours it
  too). The `hud` shot still draws it. `luma.mjs`'s `HUD_MASKS` are therefore applied
  only to the `hud` shot now — do not reintroduce them elsewhere or you throw away 8%
  of the world, including the darkest corner the black gate reads.

## Judge the frames yourself, at native resolution

The images are 2532×1170. Anything read off a whole-frame view has been downscaled by
about 1.3× and **you will misread it**. This session nearly filed "no cast shadows
anywhere" as a blocker off a downscaled view; the `sun` frame plainly has them. It also
called a field of black ellipses "lantern shadows" when they were grass LOD2 cards
casting into the shadow map.

Crop with `tools/probe.mjs crop` and look. Quote numbers: `detail` is mean |Laplacian|
and is what "flat putty" actually means; `lumaSpread` and `saturation` are the other two
that have been load-bearing.

## Open items, each with the measurement that states it

Ordered by what a hostile art director would hit first. Numbers are round-7 verification
(`r7v`) unless stated.

1. **The god-ray pass is overwriting the shadow-cooling fix on exactly the two frames that
   carry it.** This is the round-7 regression and it is fully attributed, not a guess.
   Dark-population (p05–15 of the lower 45% of frame) **R−B**, before → after round 7:

   | frame | R−B | god-ray term |
   |---|---|---|
   | hero | 3.9 → **2.9** ✓ | 0 |
   | wide | 11.8 → **3.7** ✓ | 0 |
   | torii | 5.9 → **5.5** ✓ | 0 |
   | valley | 10.8 → **16.6** ✗ | 0.97 |
   | sun | 12.2 → **29.4** ✗ | 1.00 |

   The three that improved are precisely the three where `PostFX` measured
   `_sunScreenStrength = 0`; the two that got worse are precisely the two where it is live.
   On `sun` the tight-shadow probe `0.360,0.9125,0.030,0.005` went **R/B 3.71 → 14.60**
   against a predicted ≤ 1.3. `postfx` raised `godRayStrength` 0.18 → **1.25** and overshot
   its own falsifiable targets by 60–100% (post luma at the sun's height: predicted 90,
   measured **146.4**; predicted 48, measured **71.7**).
   **Do not simply revert it** — the same commit delivered the lantern halation and the
   `hero` highlight gate, both of which passed. Damp the god-ray gain back toward the
   numbers `postfx` itself predicted and re-measure the R−B table above.
   Owner: `src/render/PostFX.js`. Round 8's critic should judge the veil blind first — it
   may read as magic-hour haze rather than as a wash, and that judgement is not the
   coordinator's to make.

2. **~~The mid-ground dark expanse is unidentified.~~ SOLVED in round 7 — terrain draws it.**
   Two rounds and two disproved hypotheses went into this. `world` settled it with a
   prediction rather than a debug boot: *if `wide` region `0.05,0.50,0.22,0.16` moves when
   only the terrain dressing changes, terrain draws those pixels.* It moved
   **detail 2.60 → 4.79**. Ray-marching the pose independently confirms it: 79 rays land
   17–79 m out on the plateau at y=812, splat grass 0.646 ± 0.072 / dirt 0.327, where
   `coreFar = smoothstep(55,240,dist)` ≈ 0 and `wild2` is exactly 0 — which *explains* why
   both earlier hypotheses were no-ops rather than merely repeating that they were.
   The hole was **spatial, not tonal**: per-octave luma RMS at 1–64 px was
   `2.89/1.92/1.44/0.92/0.67/0.84/1.40` against `4.09/4.07/6.59/8.91/10.22/10.17/6.79` for
   dressed ground at the same depth in the same frame. Library ground textures are authored
   at 0.07–0.3 m and mip to their mean by ~20 m; every term `Terrain.js` added was 8–48 m.
   Nothing occupied 0.3–7 m. Still short of the target (`detail` 4.79 against dressed
   ground's 9.19) — this is now ordinary tuning with a known owner.

3. **~~Phone draw calls over cap.~~ MET in round 7.** 146 → **117** worst pose (`torii`),
   against the 140 cap, by baking 13 instanced meshes with ≤ 8 copies into the merged
   statics, merging four shadow proxies to one, and raising `_collapseSmallBuckets` 4200 →
   12000. Triangles 686,202 → **735,886** against 900,000. **§7 is fully met for the first
   time.** Do not let a later round quietly spend this back.

4. **~~`hero` under the highlight gate.~~ CLOSED in round 7.** p99.9 **233 → 236** against
   the 235 gate. All five framings now pass both the black and the white gate
   (p0.1 = 0/5/0/0/0, p99.9 = 236/213/253/224/254). `wide` p0.1 rose 1 → 5; still passing,
   but it is the one gate number that moved the wrong way — watch it.

5. **Aerial perspective still converges above the sky.** `wide` and `torii` still show the
   massif as a pale cut-out. **Round 7's critic did not file this** — it is judged blind and
   files only what it sees, and it spent its blockers elsewhere. It is recorded here because
   it is measured, not because it was re-filed. Round 5 fixed the *amount* of air; the
   target colour is the other half. `sky` cooled the magic-hour fog base `#a9a8ad` →
   `#97a6bd` at constant luminance in round 7, which is a partial step. Note `uFogColor`
   also tints valley mist and Weather particles, so a blind global dim is not safe —
   deriving it from the dome's own horizon radiance is the honest fix.
   Owner: `src/render/Sky.js`.

6. **The far massif is low-contrast at every range** (detail 2.29), and the parallax
   ridge band's near rank measured detail **1.06** — dead-white geometric cones above the
   haiden roofline in `hero`. Round 6 rederived the band's three haze constants from the
   new fog law; **it changed nothing measurable, so the cones are not the ridge band.**
   Unidentified.

7. **`wide` is front-lit by construction** — sun 123° off the view axis, so no specular
   in frame reflects toward the viewer. It is exempt from the highlight gate for that
   reason, recorded in `tools/capture.mjs`. A real fix means moving
   `WORLD.SUN_AZIMUTH_DEFAULT` off the valley or re-siting the shot, and that reaches
   every framing and four rounds of lighting tuning. Do not attempt it in the same round
   as tonal work.

8. **Contact shadows are still missing under props**, and the cascade is *not* the reason.
   The critic's own measurement stands: on `torii`, flagstone under a 2.5 m stone lantern
   is a **local maximum** — 4.5× brighter than open ground 210 px away. Two mechanism
   guesses are now disproved (see below). The live suspect, unverified, is
   `kagGetShadow`'s `found < 0.5` early-out over a **36.9 cm** blocker disk sampled with 8
   taps: a 0.35 m lantern shaft can return zero blockers and be shaded fully lit.
   Owner: `src/render/Lighting.js`.

9. **The bamboo band still under-reads on `wide`.** `foliage` predicted green-dominant
   pixels in `wide 0.00,0.20,0.30,0.25` would pass 21%; measured **13.55 → 17.25**. Right
   direction, short of target. On `valley 0.30,0.20,0.16,0.22` the same metric went
   **3.02% → 0.00%** and warm pixels 91% → 100% — that region is now entirely washed by the
   god-ray veil of item 1, so it cannot be read as a foliage result until item 1 is damped.

10. **The sakura canopy's value break.** `foliage` fixed the *hue* (canopy core R−B
   29.2 → **40.0**, hitting its target — the violet was albedo, not grade: solving
   measured ÷ albedo per channel gave an almost exactly neutral light vector
   0.2788/0.2767/0.2784). The *value* break is unfixed and is **not foliage's file**: the
   `hero` canopy is `level:static:0,0:__blossom`, i.e. Props' sacred tree, and
   `src/world/Props.js:1413` adds `totalEmissiveRadiance += diffuseColor.rgb *
   vec3(0.155,0.200,0.268)` — a flat, blue-weighted (B/R 1.73) floor applied equally to
   crown and underside, which is why top:underside measures 0.86 rather than the 3:1 a
   backlit canopy needs. Owner: `src/world/Props.js`.

## Found in round 7, routed but not acted on

Each was found by an owner working outside its own file and handed over rather than edited.
None is verified beyond the reading that produced it.

- `src/world/Props.js:1195/1364/1484/1506` set `envMapIntensity` 1.35–2.6. Three.js
  overwrites this from `scene.environmentIntensity` for any `MeshStandardMaterial` with
  `envMap === null` while `scene.environment` is set, so the file's authored cool bounce is
  not reaching the frame. Owner: `world`.
- `src/render/Materials.js:2237` multiplies `reflectedLight.indirectDiffuse` by a triplanar
  AO with `aoMapIntensity` up to 1.25 — it scales the fill and not the key. Owner:
  `materials`.
- `src/render/PostFX.js:397` composites SSAO at `uAoStrength · indirect` where
  `indirect → 1` as luma → 0, so shadowed pixels take the full 0.85. Owner: `postfx`.
  Together with the item above, roughly 75% of the fill appears to be eaten downstream:
  `sky` measured the rig delivering fill 0.446 against key 0.396 while the pixels show ~5:1.
  `sky` deliberately did **not** raise the fill to compensate, which was the right call.
- `src/core/Cinematic.js`: `SHOTS.sun`'s comment claims the sun "sits in the open bay at
  ~3.2 m"; it actually lands dead centre behind the shimenawa's tassel (the disc's UV is
  0.500,0.500 and that pixel is rope at RGB 114,86,30), so the ~150-linear disc never enters
  the depth-masked emitter. "No sun disc in frame" is a **pose** fault, not a renderer
  fault. A ~1.2° nudge of the target recovers it. Owner: `core`.
- `src/world/Terrain.js`'s displacement-aware blend feeds `kgLum()` of the *linear* albedo
  into a 0.17-wide window at `HI = 0.62`. Moss's linear luma is 0.04–0.22 and earth's
  0.02–0.19, so for a grass+dirt pair `b1` pins at exactly 0.17 and `b0` never clears ~0.07
  — the interlocking its comment describes cannot occur for any pair of dark layers. It is
  running on ~10% of its designed range. Owner: `world`.
- `src/world/Terrain.js` cost is unmeasured: round 7 added 3 fbm octaves and 9 `hash22` per
  terrain fragment at tier ≥ 1. If phone ms regresses, the cheapest cut is the `kgCell2`
  stone scatter.

## Disproved in round 7 — do not re-test these

Ruling a cause out is a result. Each of these cost an owner real time; re-testing them costs
it again.

- **The critic's cascade-coverage hypothesis for the missing contact shadows: wrong.**
  Cascade 0 covers view depth −6.1 → 36.3 m with a 42.4 m ortho box centred on the camera.
  The fit is camera-relative and rotation-invariant, so no height or pitch can drop a 4–8 m
  prop out of it.
- **The 24 stone lanterns are in the caster set.** The rig's own rollup shows
  `lantern:__lanternStone` at the `torii` pose as 3 calls / 121,824 tris = 40,608 × 3, i.e.
  colour plus both cascades. The shadows are being lost **after** rasterisation, not before.
- **`claude/round-q78i6x`'s lead "the `#4a6b8f` cool fill is delivered at 0.09 against its
  authored 0.35" does not describe this code state.** The hemisphere was at its authored
  level with R/B 0.446. The *level* was right; the *share* was wrong — probe 0.283 / hemi
  0.085, with 77% of the fill arriving at R/B 0.79.
- **"The stipple repeats at a regular pitch": wrong.** 2-D autocorrelation of high-passed
  luma over `valley 0.22,0.42,0.16,0.13` at native resolution has no peak above r = 0.08 at
  any lag from 3 to 60 px (best r = 0.079 at 7 px, which is the blob size). It is uniform
  grain with no macro content, not a tiling period. Chasing a tile-break would be a no-op.
- **"The floating bamboo culms are the near mesh plants": wrong.** 0 of 35 in-frustum near
  plants at `valley` had a > 0.5 m chord deficit; all 1,053 floaters were mid-ground cards.
- **`PostFX.js`'s own authored god-ray gain derivation was wrong.** It claimed an upright
  crossing the ray removes ~22% of a 120-clamped disc term. It removes none: `delta =
  (vUv − sunUv)/N`, so *every* pixel's march terminates at the sun's UV and collects the
  disc as its last tap. The disc is common-mode; wedges come only from the sky field being
  cut. That is why the pass produced a symmetric veil rather than shafts.
- **"The god-ray pass contributes nothing": wrong.** It was depositing 0.09–0.33 linear
  before round 7. It ran; it had no legible structure. It is **exactly 0** on
  hero/torii/wide (sun behind the camera plane), so god rays explain nothing seen there.

**Confirmed** (it had been a labelled hypothesis): the per-channel tone knee in `Sky.js` was
converging all three channels to neutral. Two agents reached it independently — `sky` by
inverting the composite (scene-linear 0.628/0.550/0.567, all three pinned on the 0.62 knee),
`postfx` by reading the shader — and it matches what `claude/round-q78i6x` recorded. Fixed by
moving the knee from per-channel to luminance; near-sun sky R−B **16.4 → 57.8**, saturation
0.049 → 0.28.

## The apparatus broke again in round 7 — this is the sixth time

`tools/verify-r7.mjs`, written this round to check the owners' predictions mechanically,
indexed the decoded frames with a hard-coded 4-byte stride. The captures are **3-channel
RGB**, and `decodePNG` returns the stride in `channels`. The wrong stride walked the buffer
at the wrong offset and produced *plausible-looking* numbers — `detail` 38.91 where
`probe.mjs` says 2.58, an R−B of −0.11 on a region whose mean RGB is 199.9/193.4/183.5, and
NaN/Infinity where it ran off the end. Nothing threw.

It was caught only by cross-checking one region against `probe.mjs` before trusting the
table. **Do that every time you write a new measurement tool here**: run one region through
the existing tool and require the two to agree to the digit. After the fix the two agree
exactly (2.58 = 2.58).

## Rules this loop keeps learning the hard way

- `tools/CRITIC.md`'s central rule applies to whoever is fixing, not just whoever is
  reviewing: **a finding right about the symptom and silent about the cause is worth more
  than one that guesses the mechanism.** Round 5 shipped a fix built on a wrong
  diagnosis; round 6 measured it as a no-op and reverted it. That is the correct
  outcome, and it is cheaper if the diagnosis is proved before the fix is written.
- Verify a change by measuring the same region before and after. Byte-identical numbers
  mean the branch you edited does not draw those pixels — not that the change was subtle.
- The performance contract counts *submitted* triangles. An instance the vertex shader
  collapses costs no fill but costs vertex fetch, the wind shader, and primitive
  assembly, and those are real on the target device. `Engine.auditDraws` reports it per
  object; `capture.mjs` rolls it up by owning system whenever a cap is missed.
- Budgets are frustum-dependent. The rig samples every pose and asserts the worst, and
  names it. Do not go back to sampling once at the end of a run.

---

## The other line: `claude/round-q78i6x`

Not merged. It is a parallel round 5 run from a different base, and it is worth reading
before repeating anything it already did — it reached several results independently:

- Phone budget met on its own line: 628,216 triangles and 117 draw calls, by the same
  insight recorded above (`renderer.info.render.triangles` counts *submitted* geometry, so
  instances the vertex shader collapses still land in the count). It re-packed each layer's
  survivors to the front of its buffer, which *raised* near-field density while cutting the
  count — the phone valley framing went 61 → 715 bamboo instances.
- Sky chroma: saturation 0.052 → 0.342 on the `sun` frame. A per-channel tone knee had been
  converging all three channels to neutral.
- Shadow-side colour: dark-population R−B +12 → −36. §5's authored `#4a6b8f` cool fill was
  being delivered at 0.09 irradiance against its authored 0.35.
- Aerial perspective: far massif 3.70× → 1.09× the airlight luminance. This is the same
  defect listed as open item 1 above, approached from the other side.
- Wet stone: 16.4% of paving below roughness 0.25, from 0.00%.

It also carries a round kit this branch does not have: `tools/dispatch.mjs` (spawn only the
owners the critic named), `tools/manifest.mjs` plus `capture.mjs --diff` (carry unchanged
shots forward instead of re-photographing them), `tools/AGENT-PREAMBLE.md` (a byte-identical
cacheable prompt prefix) and `ROUND.md`.

Merging it is a real conflict-resolution job — both lines edited `Foliage.js`, `Terrain.js`,
`Sky.js`, `capture.mjs`, `HUD.js` and `Menus.js` — so it is a decision for a human, not
something to attempt mid-round. Ask before starting it.
