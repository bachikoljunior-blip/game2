# Handoff — the art-direction review loop

This file exists because the work happens in ephemeral containers. `shots/` is
gitignored and the review images do **not** survive a session; everything a later
session needs to continue has to be in the repo. Read this, then `README.md`
("Where this build actually stands") for the current measured numbers, then
`tools/CRITIC.md` for the standing bar.

Update this file at the end of every round. It is the only thing that carries state.

---

## Where the work is

- Branch: `claude/2-rounds-only-9uukb7` (pushed). No pull request has been opened.
- Last two rounds: `f0543b2` (round 5), `16f21e4` (round 6).
- Rounds 1–3 scored 34 → 48 → 58 out of 100 against a Ghost of Tsushima / SEKIRO bar.
  Round 4 was stopped before its verdict. Rounds 5–6 were not scored — they were run
  as measure-fix-verify rather than as a scored critique. **The build has not passed.**

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

Ordered by what a hostile art director would hit first.

1. **Aerial perspective converges above the sky.** Distant terrain hazes toward
   `fogParams.color`, authored `0xa9a8ad` at magic hour — brighter than the sky it sits
   against. Round-6 `wide`: massif p50 **161**, sky beside it p50 **145**. At full haze a
   mountain should vanish into the sky, not become a pale cut-out. Round 5 fixed the
   *amount* of air (`Sky.js`, `kagApplyFog`, two layers); the target colour is the other
   half. Note `uFogColor` also tints valley mist and Weather particles, so a blind global
   dim is not safe — deriving it from the dome's own horizon radiance is the honest fix.
   Owner: `src/render/Sky.js`.

2. **The mid-ground of `wide` and `valley` reads as a dark expanse.** detail **2.59**
   against **9.19** for dressed ground at the same depth in the same frame, p50 55.
   **Two mechanism guesses have already been disproved — do not repeat them:**
   the terrain far-ground reconstruction (`Terrain.js`, `wild2` / `coreFar`) and the
   canopy shell (`Foliage._buildCanopy`). Changes to both moved the region by *nothing*
   measurable. At native resolution the region has grain; it is too dark and too hazed,
   not untextured. Identify what actually draws those pixels before changing anything —
   an object-id debug pass would settle it in one boot.

3. **Phone draw calls 146 at the `torii` pose against a 140 cap.** No longer unowned:
   the rollup puts **74 of 146 in `src/world/Level.js` across 52 objects**, then player
   14, foliage 13, terrain 12, post chain 32 fullscreen passes, sky 1. Triangles are
   fine (686,202 against 900,000) so this is purely a batching question.

4. **`hero` is 2 luma under the highlight gate** — p99.9 **233** against 235. It was
   passing partly on the HUD's authored white ink, which the set no longer contains. The
   lanterns reach 254; under 0.1% of the frame clears 235. The bloom is deliberately
   tuned (`PostFX.js`, strength 0.105 / threshold 1.0 / radius 1.35) and was left alone
   rather than widened to move a number. If you widen it, do it as an art call about
   halation on emitters and verify the whole grade, not just this percentile.

5. **The far massif is low-contrast at every range** (detail 2.29), and the parallax
   ridge band's near rank measured detail **1.06** — dead-white geometric cones above the
   haiden roofline in `hero`. Round 6 rederived the band's three haze constants from the
   new fog law; **it changed nothing measurable, so the cones are not the ridge band.**
   Unidentified.

6. **`wide` is front-lit by construction** — sun 123° off the view axis, so no specular
   in frame reflects toward the viewer. It is exempt from the highlight gate for that
   reason, recorded in `tools/capture.mjs`. A real fix means moving
   `WORLD.SUN_AZIMUTH_DEFAULT` off the valley or re-siting the shot, and that reaches
   every framing and four rounds of lighting tuning. Do not attempt it in the same round
   as tonal work.

7. **The sakura canopy** is a solid opaque mass with visible straight card edges at its
   silhouette and no branch structure reading through. **The bamboo band** reads as a row
   of similar cards rather than a grove. Neither has been touched.

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
