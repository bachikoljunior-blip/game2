# Round 17 — [foliage] evidence

Owner: `src/render/Foliage.js` (one file).
Findings acted on: the `wide` + `valley` ground-cover **blocker**, the `valley` treeline
**major**. The still-open round-8 item "no instanced ground cover in the basin,
`grassRadius` 34 m against regions at 15–90 m" is the same defect from the other end and
is treated here as one problem.

---

## 0. The apparatus, checked before anything was believed

`tools/capture.mjs` takes a serialising file lock and three other owners were working, so
every number below comes from a private single-boot probe (`<scratch>/fprobe2.mjs`,
`fmeasure.mjs`, `attrib.mjs`, `fcomp.mjs`, `leaffrac.mjs`, `tuft.mjs` — none committed).
Same profile as the review set: `viewport 844x390 @ dsf 3`, `?autostart&q=medium&capture`,
native 2532x1170, screenshots at native.

**The round brief says tier HIGH. It is not.** `shots/report-r17.json` records
`profiles.phone.stats.tier: 1` = MEDIUM, and `capture.mjs` passes `q=medium` for the
`phone` profile. Everything below is therefore measured at MEDIUM: `grassRadius` 34,
`grassDensity` 0.55, `foliageShadows` false. Tuning against HIGH's 52/1.0 would have been
tuning a build nobody photographed.

Three apparatus checks before any number was used:

| check | result |
|---|---|
| my region reader vs `tools/probe.mjs`, `wide` box `1300,820 900x180` | identical: `meanRGB [50.4,44.0,43.1]`, `saturation 0.244`, `detail 8.31` |
| my `band` metric vs the critic's own quoted figures, `valley` | sky box **167.04 / sat 0.552**, band box **76.02 / 0.417**, near ground **58.53 / 0.598** — the critic's numbers to two decimals |
| my probe's frame vs the committed review frame, same `wide` box | review `50.4/44.0/43.1`; probe `52.4/45.7/44.6`, whole-frame p50 100 vs 102 — a ~2 luma grain/exposure wobble, not a different build |

**Two apparatus faults found and fixed inside this round:**

1. **The first probe photographed the title card.** Issuing `__kagerouStart()` and
   `menus.skipIntro()` in one `page.evaluate` leaves the card up — `onGameStart` arms it
   when the boot veil lifts, i.e. *after* `__kagerouStart` returns. The frames came back at
   whole-frame p50 **3.4** with 95.6% of pixels below luma 16 and would have "measured" the
   ground cover off a black screen. This is the round-16 fault in a new place. The probe now
   splits the two calls, polls `menus._title < 0 && _titleA <= 0.004 && _introWash <= 0.004`
   until it is true, and asserts screenshot p50 > 25 before believing anything.
2. **A per-pixel ablation of two *running* frames is unusable.** Diffing foliage-on against
   foliage-off with the engine live put **92.3%** of the box over a 3-code threshold: PostFX
   advances temporal grain and TAA phase every call. The rig now follows `capture.mjs`'s
   `--ab-object` path — stop the engine, save `pipeline._frame/_time`, re-seed both members
   of the pair, render one explicit frame each. Residual noise floor after that: **0.07%**
   of the box over a 24-code threshold, measured by ablating two layers that draw nothing
   there and getting the same 0.07% to three decimals.

Also recorded: **the browser was killed mid-run when I started a `vite build` beside it**,
even to a different `outDir`. `HANDOFF.md` says not to build while a capture is in flight;
that applies to a private rig too. Cost one valley baseline pass.

---

## 1. Hypotheses tested before anything was changed

### DISPROVED — "a single card archetype at a single scale" (the critic's blocker hypothesis)

The critic wrote: *"the stub population being one size and one shape suggests a single card
archetype at a single scale rather than a density shortfall, in which case raising instance
count alone will make the litter denser without making it read as vegetation. Test by
measuring the size distribution of the connected dark components."*

Measured, exactly as asked — connected components of pixels below luma 18 in the critic's
own box `1300,820 900x180` on `shots/phone-wide-r17.png`:

| quantity | value |
|---|---|
| fraction below luma 18 | **2.03%** (the critic's 2.0%, reproduced) |
| components | 561 (74 of area ≥ 8 px) |
| area p10 / p50 / p90 / max | 8 / 13 / 69 / 205 px |
| p90:p10 area ratio | **8.6 : 1** |
| median component bounding box | **5 x 6 px** |

An 8.6:1 spread of areas is not one stamp at one scale. What the distribution says instead
is that the median vegetation island in that box is **5 x 6 pixels** — the layer is not
repetitive, it is *too small and too sparse to resolve as a plant*. So the fix is coverage
(count x card area x fade window), which is what was done, and archetype variety was
correctly **not** worked on.

### DISPROVED — "the plateau apron is classified as swept ground, so nothing may plant there"

My own first guess, and wrong. A live census through `Terrain.surfaceAt` over 624 points
(r = 20…120 m, 24 azimuths) returns **grass 512, gravel 61, stone 30, dirt 21**, and
`FoliageSystem._siteWeight` over the same points averages **0.834**. The ground in the box
accepts vegetation at 83% weight and is still bare in frame; classification is not the gate.

### CONFIRMED, and quantified — the specks are `far-cover`, and they are lit by the haze

Deterministic A/B over the critic's box, one mesh hidden at a time:

| layer hidden | fraction of the box it draws | its own mean RGB |
|---|---|---|
| `far-cover` | **5.62%** | 25.0, 25.6, 27.3 — luma **25.6**, G−R **+0.6**, blue-leading |
| `grass-l2` | 0.07% | — (this is the rig's noise floor) |
| `ferns` | 0.07% | — (identical to three decimals: neither draws there) |
| rest of the box | — | 49.7, 42.9, 41.9 — luma 44.3 |

Blue-leading is the mechanism. Those cards' own radiance is so low that Sky's near-air term
(~9% opacity over a fog colour near linear 0.3 at 30-45 m) is contributing several times
more light than the plant, so the "vegetation" in that box is mostly *haze colour*. That is
why it reads as cool dirt shadow. It also rules out fixing it with the instance tint:
`KAG_TINT_MODULATE` divides the tint by its own luminance, so `shade` on a mapped material
is a pure hue rotation and cannot add value.

### The `valley` culms: the sprays exist, they are not green, and there are too few

| measurement, `shots/phone-valley-r17.png` | value |
|---|---|
| leaf-coloured (G−R > 4 and G ≥ 35) over the critic's box `1250,0 650x450` | 23.83% |
| the same, by ninth of the box, top to bottom | **0 / 0.1 / 0 / 0 / 0.1 / 8.0 / 48.2 / 76.5 / 81.6** |
| occluders (luma < 120) in the upper culm zone `1250,0 650x250` | 10.21% of the box |
| their mean RGB | 123.5, 88.6, 46.2 — luma 92.9, khaki |
| green-dominant share of those occluders | **0.4%** |

Every green pixel in that box belongs to the far band; the near culms contribute none. The
culms are *not* absent and *not* black — they are khaki poles with 10% coverage and no
crown. Transmission is the whole lighting model there (backlit, `forward` ≈ 1), and at
`sssSat 0.88` the transmitted light left the material at linear g/r **1.13**: green-dominant
by a hair, which does not survive the tone map.

### The treeline: the 91-luma step is not a missing fog term

Band box `220,200 300x200` reads sRGB 80.6, 77.6, 46.9 (luma 76.02, sat 0.417) against sky
`220,120 300x50` at 211.3, 161.2, 94.8 (167.04, 0.552). Inverting ACES puts the band at
scene-linear **0.079** and the sky at **0.58**. Sky uploads a magic-hour fog colour near
linear 0.31, so a band whose *total* radiance is 0.079 bounds the fog opacity there at
**f < 0.25** however dark the band's own contribution is. The band is not under-fogged; it
leaves the foliage shader at about a twentieth of the sky's radiance.

Top-edge geometry, per column over x200-2300 (first row falling more than 45 luma below the
sky directly above it, band floor pinned at y=620):

| quantity | before |
|---|---|
| edge standard deviation | 52.04 px |
| as % of the 403.8 px band depth | 12.9% |
| emergent crowns (> 25% above the local 128-column mean) | **0** |

So (a) of that finding is already at its numeric target on standard deviation and fails
completely on emergent crowns — the band has no hierarchy, which is the part a stranger
reads as "a fence".

---

## 2. What changed

All in `src/render/Foliage.js`.

| # | change | why, in one line |
|---|---|---|
| 1 | `_coverAt()` — new; `_siteWeight` and `_buildFarCover` now multiply by it | `Terrain.coverAt()` was published for this file and **nothing called it**; the name `grass` hides a cover field of mean 0.613, sd 0.260, p10 0.039 vs p90 0.888, so density was flat where the ground says it should clump |
| 2 | far cover fades in over [18, 20.7] m, was [28, 36.4] | the box is 23-45 m out and the ring ends at 34: the two layers were handing over inside the finding |
| 3 | far cover count 6 500 → 10 500 base | coverage |
| 4 | far cover card 0.55-1.30 x 1.05-2.35 m → 0.62-1.87 x 1.25-3.00 m | mean area 1.57 → 2.86 m² (1.82x) |
| 5 | far cover `baseAO` 0.36 → 0.20 | the shaded half is lit by the cool fill alone; a second AO term on top of that is what makes it near-black |
| 6 | `paintGrassClump` root stop `30,44,24` → `62,92,46` | 2.9x the linear radiance at the one place the mip chain averages the whole card toward |
| 7 | bamboo plant sprays 8 → 15 (MEDIUM), 13 → 20 (HIGH); `leafFrom` 0.54 → 0.30; spray card +19% | a crown instead of a tuft on a pole |
| 8 | bamboo plant `sssSat` 0.88 → 1.0, `sssFloor` 0.22 → 0.38, `sss` 0.80 → 1.05 | transmitted light g/r 1.13 → 2.00 |
| 9 | bamboo card height gains a ~38 m correlated `stand` field and a 5.5% emergent tail | the skyline is the *maximum* over independent draws, which concentrates however wide the per-card jitter is; correlation and emergents are the only things that break it |
| 10 | new opt-in `KAG_AERIAL` term, declared only by the bamboo card | the distant LOD's own depth response — see §3 for why this is not a second fog integral |

**Reverted inside the round:** `GRASS_LOD_DENSITY[2]` 0.85 → 1.35. It was the obvious answer
and it is measurably the wrong layer: grass LOD2 draws 0.07% of the box, i.e. the rig's own
noise floor. It would have cost triangles and drawn none of the finding.

---

## 3. The one term that is new, and its guard rails

`KAG_AERIAL` lifts and desaturates a fragment with distance, gated behind a `#ifdef` that
only `bamboo-card` sets, with the uniform declared only when the define is:

```glsl
float aer  = smoothstep( uAerial.x, uAerial.y, distance( cameraPosition, vKagWorld ) );
float aerL = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
outgoingLight = mix( outgoingLight, mix( outgoingLight, vec3( aerL ), uAerial.z ) * uAerial.w, aer );
```

`uAerial = (70, 190, 0.62, 1.46)`.

- It is **not** a second aerial-perspective integral. `Sky.js` owns fog and every material
  in this file already goes through `applyFog()`; this is the mid-ground LOD's own response
  to being a 20-40 px slice of a stand several hundred culms deep, in the same class as the
  `broad` octave already on that material. The measurement in §1 is the justification: fog
  at that range is bounded at f < 0.25 and the deficit is the band's own radiance.
- The `#define` is spliced into the **fragment** shader explicitly. The `defines` block in
  `_makeMaterial` goes into the vertex shader only, and an `#ifdef` whose define lives in
  the other stage is silently always-false — the same class of failure as the atlas uniform
  that compiled out and cost three rounds.
- `aerial` is in `chainCacheKey`. Two materials differing only by a define are
  indistinguishable to three's program cache, and which one you get depends on which
  compiled first.
- It is zero inside 70 m by construction, which is why `valley`'s near-ground control box
  cannot move.

---

## 4. Results

(filled in from the verification run — see the table below)

---

## 5. Cost

(see below)
