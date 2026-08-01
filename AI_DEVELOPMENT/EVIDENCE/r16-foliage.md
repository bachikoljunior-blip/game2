# Round 16 — [foliage] evidence

Owner: `src/render/Foliage.js`. Review set `shots/phone-*-r16.png`, 2532×1170, phone/MEDIUM,
commit `4811ba0`. All measurements below are at native resolution.

Two findings were routed here. **One of them is not in this file** — see §1. The other is
§2.

---

## 0. Apparatus, and its calibration

Two tools were used and both were calibrated against something already true in the
repository before any conclusion was drawn from them.

**Pixel statistics.** `tools/probe.mjs stats` unmodified, plus three thin readers built on
its own `decodePNG`/`region`/`cut` so they cannot disagree about strides:
`fol-report.mjs` (box table), `fol-split.mjs` (luma-decile split), `fol-hue.mjs` (hue
histogram), `fol-diff.mjs` (per-pixel A/B). The box table reproduces the critic's numbers
to the digit:

| box | critic | measured here |
|---|---|---|
| `hero` (0.28,0.13,0.04,0.05) | 174.5, 118.9, 117.1 @ sat 0.380 | 174.5, 118.9, 117.1 @ 0.380 |
| `hero` (0.17,0.20,0.04,0.05) | 127.0, 81.3, 98.3 @ sat 0.359 | 127.0, 81.3, 98.3 @ 0.359 |
| `wide` (0.12,0.36,0.10,0.14) | 98.4, 98.3, 88.5 @ 0.132, spread 51.2 | 98.4, 98.3, 88.5 @ 0.132, spread 51.2 |

**Projection.** `fol-project.mjs` reconstructs each review framing from `SHOTS` in
`src/core/Cinematic.js` at aspect 2532/1170 and reports where a world point lands. It is
calibrated against the one documented ground truth in the repo — `SHOTS.sun`'s comment
states the sun disc lands at UV (0.605, 0.455) for sun direction (0.86, 0.225, 0.457):

```
CALIBRATION  sun disc in `sun`, expected 0.605, 0.455
   uv 0.605, 0.455
```

Exact. The projection is therefore trusted for §1.

**Ablation rig.** `fol-ablate.mjs` — one boot, many A/B renders of the same pose, served from
a private `git worktree` at `4811ba0` built to its own `dist`, so nothing touches the shared
`dist/` that other owners' captures are running against. Rig mutex taken per the
coordinator's protocol.

**The apparatus broke once and was caught before it produced a finding.** The first version
copied `capture.mjs`'s `--ab-object` pattern — stop the engine, pin the post pipeline's
temporal phase, drive `pipeline.render(0)` — and every frame came back at whole-frame mean
RGB (7.2, 5.8, 5.7), p50 luma 4.4, with the 陽炎 title glyphs stamped across the middle. That
is the opening ink wash `capture.mjs`'s own comment warns about ("dims every shot by roughly
two stops"). The cause was not the engine stop: `window.__kagerouStart()` and
`menus.skipIntro()` were issued inside **one** `page.evaluate`, so no frame ran between them
and the intro did not exist yet when `skipIntro` was called. `capture.mjs` splits them across
two CDP round-trips and therefore never sees it.

Had that pair been measured, it would have read a perfect 0.0% difference across the hero
canopy and "proved" the routing conclusion in §1 off two black frames. The fix is: start and
skip on separate round-trips, skip again after the settle, engine left running, and — the
part that matters — **the rig now asserts its own frame** (`APPARATUS <shot> p50 …`, refuses
to measure below p50 luma 30) before any box is read. Every number below is from a frame that
passed that assertion.

---

## 1. DISPROOF — the sakura canopy finding is `src/world/Props.js`, not this file

The finding names the canopy at `hero` UV x 0.12–0.34, y 0.10–0.35 and at `torii` UV
(0.30,0.48,0.06,0.08). Three independent lines put those pixels on `Props.sacredTree`.

**(a) Geometry.** `LAYOUT.sacredTree` (`src/world/Level.js:60`) is at plateau-local
(−12.0, 19.5), height 11.0, built by `PropFactory.sacredTree` with blossom emitted by
`Props._blossomCluster` under the `__blossom` material. Projected into the `hero` pose:

```
hero  trunk base         uv 0.228, 0.681   depth 24.5 m
hero  girth/shimenawa    uv 0.230, 0.565   depth 24.6 m
hero  crown 7 m          uv 0.232, 0.346
hero  crown 9 m          uv 0.233, 0.253
hero  crown top 12.3 m   uv 0.235, 0.099
hero  crown −4.6 m       uv 0.112, 0.228
hero  crown +4.6 m       uv 0.337, 0.274
torii crown 8.5 m        uv 0.374, 0.539
```

The crown occupies UV x 0.112–0.337, y 0.099–0.346. The critic's box is 0.12–0.34,
0.10–0.35. That is the same object to within a pixel row.

**(b) The frame agrees.** A native crop at UV (0.13, 0.33, 0.22, 0.55) — i.e. straight down
from the canopy — shows a single ~2.5 m trunk with a shimenawa and its four shide tied round
it at chest height, centred at UV x ≈ 0.237. `Level._buildTrees` ties exactly that rope round
exactly that tree. No other object in the build has it.

**(c) No `Foliage` sakura can be there.** `_scatterTrees` rejects any candidate with
`plateauMask(x, z) > 0.5`, which is `r < 95.0 m` from the world origin. The sacred tree is at
`r = 22.9 m`. From the `hero` eye the nearest surviving Foliage sakura is 87–142 m away and
lands at v ≈ 0.48–0.51 — on the horizon line, not in the canopy:

```
hero  az  90deg r=95   uv 0.985, 0.475   depth  86.6 m
hero  az 120deg r=95   uv 0.701, 0.500   depth 124.7 m
hero  az 150deg r=95   uv 0.500, 0.506   depth 142.0 m
hero  az 180deg r=95   uv 0.303, 0.504   depth 134.1 m
```

Further, MEDIUM is `TIER.MEDIUM = 1`, so `meshLod = q.tier >= 2` is **false** and
`_scatterTrees` sets the tree mesh LOD's `uFadeFar` to `RANGE.treeCardOnly[0] + 8 = 46 m`.
Every Foliage tree past 46 m of the camera is a flat impostor card. Nothing in this file can
draw a 10 m-wide branching crown at 25 m in the `hero` framing.

**(d) Runtime ablation.** `hero-after` vs `hero-no-foliage` (whole `FoliageSystem.group`
hidden, same frame, same temporal phase):

```
after (all of FoliageSystem visible) vs no-foliage (`k.foliage.group.visible = false`),
same boot, same pose, hero:

  4x4 hue grid over UV (0.12-0.34, 0.10-0.35), sat-gated 0.12, 36 bins
    foliage ON   modes [[0, 10.6], [190, 6.5], [320, 24.9]]   n = 18,140
    foliage OFF  modes [[190, 6.6], [320, 25.5], [350, 10.2]] n = 17,715
```

With every instanced grass blade, bamboo culm, bamboo card, tree mesh, tree impostor, far
cover and canopy shell removed from the scene, **the crown is still there, complete, and both
of its hue populations are intact** — the violet mode at 320 deg holds at 25.5% against 24.9%,
and the whole 300-350 deg population is unmoved. The only thing that leaves is the warm
0-20 deg tail (18.8% -> 13.6%), which is the far forest behind the mountain, not the blossom.
A native crop of the same region with foliage off shows the tree unchanged against a clean
snowcap.

A caution for whoever re-runs this: the *whole-box* difference is 68% of pixels at >12, which
looks at first like foliage owning the crown. It is not — the crown is alpha-tested and about
two thirds of the box is background seen through its gaps, and that background is the distant
forest. Only the population test separates them.

**Consequence for the round.** `HANDOFF.md` open item 6 already routes the sakura canopy
emissive to `src/world/Props.js`. Round 15 nevertheless put its fix — the `uWarmFill` term
in `FRAGMENT_SSS`, sized in the comment at `_buildTreeAssets` from *this exact measurement*
("the hero crown's shadowed clusters read (135.8, 82.6, 91.3)") — on **`Foliage`'s** sakura
leaf material, which cannot rasterise a single pixel of that crown. That is why round 16
re-measured the same defect with the same character (127.0, 81.3, 98.3; B over G by 17.0).
The finding needs re-routing to [world]; it has now survived two rounds because it was
fixed on the wrong tree.

For the record, the critic's hue-population claim is confirmed. A 4×4 grid of 0.02×0.02
boxes across UV (0.12–0.34, 0.10–0.35), sat-gated at 0.12, 36 hue bins, `fol-hue.mjs`:

```
hue%   0:11.92  10:4.67  20:2.14 | 190:6.61 | 300:3.61 310:14.24 320:24.72 330:11.02 340:9.58 350:10.65
modes  [[0, 11.9], [190, 6.6], [320, 24.7]]   n = 17,733
```

Two blossom modes 40° apart (red-orange 0–20°, violet 300–350°) with nothing between 20° and
300° except the 190° cyan of sky showing through the crown. Unimodal it is not. That
measurement is handed to [world] rather than acted on here.

---

## 2. The mid-ground forest band — `wide` UV (0.12, 0.36, 0.10, 0.14)

### 2.1 What draws it

**Geometric cross-check, before the ablation.** `wide` has fov 52° vertical over 1170 px, so
`f_px = 585 / tan(26°) = 1199.5`. The streaks in a native crop of the critic's box measure
roughly 15–25 px wide by 40–80 px tall — aspect ≈ 0.3.

- A **bamboo card** is planted at `cardB[o+1] = h·(0.54–0.66)`, i.e. aspect ≈ 0.6, and at
  `h ≈ 16 m` at that range would subtend 74 × 44 px. Too wide.
- A **cedar impostor** card is square (`size` scales x and y alike) at side `2·frameRel·h ≈
  1.06 h`, but the *tree* inside it is a 13 m trunk with a crown ~4 m across — aspect ≈ 0.3,
  and the alpha cutout trims the rest of the card. At 60 px tall that puts it
  `13 · 1199.5 / 60 = 260 m` from the eye, which is exactly `RANGE.treeCardOnly[1] = 260`,
  the MEDIUM impostor cutoff.

So the band should be tree impostors, not bamboo. The runtime ablation is the test:

```
band box UV (0.12, 0.36, 0.10, 0.14), `wide`, one boot, layer hidden vs `after`.
% of pixels changing by more than 12 code values:

  no-bamboo-cards    61.5%          <- the band
  no-foliage         62.4%          <- and essentially nothing else in it
  no-canopy-shell     8.3%
  no-impostors        8.4%
  no-far-cover        7.2%
  (grain floor: two consecutive live frames of the same scene differ on 6.9%)
```

**The geometric cross-check above was wrong, and so was the mechanism I built on it.** The
mid-ground band in the critic's box is `bamboo-cards` — 61.5% of the box — and `tree-impostors`
contribute 8.4%, which is the grain floor. There are 196 tree impostors in the whole world
against 9,875 bamboo cards; 196 cannot fill a band that spans the framing. Reported as a
disproof of my own hypothesis, because the first version of this round's fix was aimed
entirely at the impostor material and moved the critic's box by 0.1 code values — the
"byte-identical numbers mean the branch you edited does not draw those pixels" outcome, caught
by measuring rather than by reasoning.

The impostors are not absent from `wide`, they are just somewhere else: the tile scan puts
them at UV (0.40, 0.40) (64% owned) — a sakura crown on the right of frame, well outside the
finding's box.

What the band actually is, measured on the pixels the cards own:

| | mean RGB | G−R | R−B | sat | spread |
|---|---|---|---|---|---|
| the cards (61.5% of box) | 89.5, 95.3, 84.0 | +5.8 | +5.5 | 0.119 | 42.6 |
| what is behind them (terrain) | 114.0, 100.7, 94.6 | −13.3 | +19.3 | 0.166 | 31.5 |

`0.615 x (+5.8) + 0.385 x (−13.3) = −1.6`, against the −0.1 the whole box measures. The band
is not olive because the bamboo is olive; it is olive because a mildly green foliage layer is
being averaged with the warm terrain it only two-thirds covers.

### 2.2 Mechanism

The band past 46 m is `tree-impostors`: `_makeImpostorMaterial` on a `MeshBasicMaterial`
sampling the atlas `_bakeImpostors` renders under a neutral 2.35 white key with tone mapping
off. It is the **only** foliage material in the file with no light model at all. Its entire
shading was one line:

```glsl
diffuseColor.rgb *= vKagTint * mix( vec3( 1.0 ), uSunColor, 0.55 );
```

— one constant amber multiply, identical on every card regardless of which way the card
faced or where the sun was. Two consequences, both of them exactly what the critic measured:

1. **"no light-side/shade-side on any single plant"** is not an art problem, it is the
   literal absence of a directional term.
2. **"G and R equal to within 0.1 code values"**: this file's own `GREEN_RATIO` note
   (line 1139) derives that a lit surface is green-dominant only if its linear `g/r` exceeds
   `1/0.412 = 2.43`. The 0.55 amber mix is `(1.0, 0.6766, 0.5237)`, so it divides any
   albedo's `g/r` by 1.478 before anything else happens.

`uChroma` was a **scalar** 0.72, authored in round 15 against the *sakura* row measuring 1.9×
the frame's saturation. `aFoliageC.w` already carries the atlas row, so that pull was also
taking 28% of the chroma out of the cedar row — the row that has to carry the green.

`uTipGlow (0.10)`, `uBaseAO (0.16)`, `uGrain (0.10)`, `uSSSColor` and `uSSSStrength` were all
being uploaded to this material every frame and **read by nothing** — configuration that
looks correct and is not evidence.

That is measured, not inferred. `fol-glsl.mjs` rebuilds the exact strings this method splices
into three's `MeshBasicMaterial`, compiles and links them on the same SwiftShader driver the
review rig runs, and asks the driver which uniforms survived. Before/after, same tool, same
driver:

```
r16 (git show 4811ba0:src/render/Foliage.js)
 { ok: true, activeUniforms: { uSunDir:false, uLitMix:false, uGrain:false,
   uChroma:true, uFillColor:false, uTipGlow:false, uBaseAO:false, uCamPos:true, uSink:true } }

after
 { ok: true, activeUniforms: { uSunDir:true, uLitMix:true, uGrain:true,
   uChroma:true, uFillColor:true, uTipGlow:true, uBaseAO:true, uCamPos:true, uSink:true } }
```

`getUniformLocation` returning null means the compiler removed the uniform because nothing
read it. `uTipGlow`, `uBaseAO` and `uGrain` were exactly that. Both programs link, so this
change does not repeat the "11,390 cards whose shader linked dead" failure.

### 2.3 What the band is made of, before

Population split of the critic's box (`G−R > 8` green / `G−R < −8` brown / neutral):

| population | share | mean RGB | sat |
|---|---|---|---|
| green (foliage) | 19.1% | 91.5, 103.9, 83.7 | 0.192 |
| brown (terrain between) | 25.0% | 120.3, 105.5, 99.3 | 0.172 |
| neutral (veiled) | 55.8% | 90.9, 93.2, 85.3 | 0.094 |

Luma-decile split of the same box (`fol-split.mjs`):

| decile | mean RGB | R−B | G−R | sat |
|---|---|---|---|---|
| top 10% | 126.3, 115.8, 101.2 | +25.1 | −10.5 | 0.217 |
| top 30% | 115.1, 109.6, 96.1 | +19.0 | −5.5 | 0.193 |
| bottom 30% | 82.4, 86.1, 80.7 | +1.6 | +3.7 | 0.073 |
| bottom 10% | 75.7, 79.8, 76.7 | −1.0 | +4.1 | 0.065 |

This is the finding stated numerically and it is **inverted** with respect to what criterion
(c) asks for. The brightest pixels in the band are already warm (R−B +25.1) — but they are
the mauve *terrain* showing between the cards (G−R −10.5). The foliage is entirely in the
bottom deciles, cool and desaturated. There is no sun-struck crown anywhere in the band; the
brightest thing in it is the ground behind it.

### 2.4 Ceiling: the band is mostly inscatter, and the inscatter is Sky's

Forward calculation of one cedar impostor texel through the whole chain, from the authored
constants:

- `paintCedarSpray` strokes `rgb(38, 76, 48)` → linear (0.0194, 0.0722, 0.0295).
- `bakeLeaf.color` = `def.tint` `0x8fae86` → linear (0.2732, 0.4179, 0.2384).
- albedo = product = (0.00530, 0.03017, 0.00703); `g/r = 5.69`.
- bake = albedo × (2.35·N·L + hemi) ≈ (0.0105, 0.0616, 0.0155) linear at N·L 0.7.
- × `vKagTint` (≈1) × `mix(1, key, 0.55)` = (0.0105, 0.0417, 0.0081).
- × scalar chroma 0.72 toward luma → (0.0167, 0.0392, 0.0150).
- ACES + sRGB, no fog → roughly **(25, 42, 24)** in 8-bit.

The green population actually measures **(91.5, 103.9, 83.7)**. The difference is aerial
perspective: about **(67, 62, 60)** of additive inscatter, i.e. roughly **65–70% of the
band's luma is fog, not foliage**, and that fog's colour comes from `Sky.applyFog`, which the
same round's blocker measures as achromatic — `hero` sunward sky RGB (162.2, 165.0, 163.4) at
saturation 0.030.

**This is a disproof of the reachability of two of the four targets from this file.**
Criterion (a) `saturation ≥ 0.30` and criterion (b) `G−R ≥ +12` on the *box mean* require
moving a quantity that is ~2/3 neutral veil owned by `src/render/Sky.js` and ~1/4 terrain
owned by `src/world/Terrain.js`; the foliage's own share of the box is 19% by population.
No albedo or illuminant change available in `Foliage.js` multiplies through a 70% additive
neutral term. Recorded as a shortfall, not narrowed.

Criteria (c) — lumaSpread and the warm/cool split — and (d) survive the veil, because an
additive term compresses contrast but does not remove structure. Those are what the change
below is aimed at.

### 2.5 The change (as finally landed)

The first version of this round's change was aimed at the tree impostors. §2.1 shows why that
was wrong, and it was measured as a 0.1-code-value no-op on the finding's box before anything
was claimed for it. The impostor work is kept — it fixes a real, separately-measured defect
(three dead uniforms and a mis-scoped chroma pull) and is measured as neutral everywhere in
the review set — but the fix for *this finding* is on the bamboo card:

**Bamboo card (`_buildBambooAssets` / `_scatterBamboo`) — the band itself**

1. The per-instance card tint is re-authored against this file's own `GREEN_RATIO` note. It
   sat at linear `g/r` 1.16–1.22; the magic-hour key is (1.0, 0.412, 0.134), so a lit card
   could not be green-dominant at any density — it needs `g/r > 1/0.412 = 2.43`. The new form
   holds 2.70–2.76 across its whole range.
2. `tintAmount` 0.55 → 0.85. `KAG_TINT_MODULATE` normalises the tint to unit luminance, and
   `lum(mix(vec3(1), t/lum(t), a)) == 1` for any `a`, so this knob is a pure hue rotation and
   cannot re-expose the band however far it is pushed.
3. `broad` 0.20 → 0.34 — `fbm2(worldXZ * 0.26)`, ~24 m features, ≈145 px across at the band's
   range in `wide`. The only value variation in the band that survives minification.

**Tree impostor (`_makeImpostorMaterial` / `_scatterTrees`) — the dead-uniform fix**

4. A light model where there was none: `vKagLit` from the card's facing against the sun, and
   `mix(uFillColor, key, vKagLit)` in place of one constant amber multiply.
5. `uTipGlow` / `uBaseAO` are now read (see §2.2 for the driver-level proof that they were not).
6. `uChroma` becomes per atlas row, so round 15's sakura-authored pull stops being applied to
   the cedar row.
7. Per-plant value and warm/cool spread in `_scatterTrees`, at **exactly three `rnd()` draws**
   as before so tree placement stays byte-identical to r16.

Nothing outside `src/render/Foliage.js` was touched.

### 2.6 Prediction, stated before the after-measurement

On `phone-wide` box UV (0.12, 0.36, 0.10, 0.14):

| # | quantity | before | predicted | critic target |
|---|---|---|---|---|
| P1 | saturation | 0.132 | 0.16–0.20 | ≥ 0.30 — predicted miss |
| P2 | G−R | −0.1 | +2 to +6 | ≥ +12 — predicted miss |
| P3 | lumaSpread | 51.2 | ≥ 70 | ≥ 90 |
| P4 | top-10% R−B | +25.1 (terrain) | ≥ +25, carried by foliage | ≥ +25 |
| P5 | bottom-10% B−R | +1.0 | ≥ +3 | ≥ 0 |
| P6 | `hero` canopy | — | unchanged | n/a (§1) |

### 2.7 Measured

Harness validation first. On the build whose band code was still r16-equivalent, the rig's
`wide` frame reproduced the review PNG **to 0.1 code values in every statistic**, whole frame
and band box alike:

```
whole frame   r16 review PNG  [100.5, 95.1, 91.0] sat 0.178 p50 89.4 spread 178.1 detail 5.36
              rig             [100.5, 95.1, 91.0] sat 0.178 p50 89.4 spread 178.1 detail 5.36
band box      r16 review PNG  [ 98.4, 98.3, 88.5] sat 0.132 spread 51.2
              rig             [ 98.3, 98.3, 88.4] sat 0.132 spread 50.5
```

**Band box UV (0.12, 0.36, 0.10, 0.14), `phone-wide`:**

| quantity | r16 | after | predicted | target | verdict |
|---|---|---|---|---|---|
| mean RGB | 98.4, 98.3, 88.5 | 96.1, 98.4, 88.3 | — | — | — |
| G−R | −0.1 | **+2.3** | +2…+6 | ≥ +12 | **SHORTFALL** — 20% of the way |
| saturation | 0.132 | **0.136** | 0.16–0.20 | ≥ 0.30 | **SHORTFALL**, and short of my own prediction |
| lumaSpread | 51.2 | **51.5** | ≥ 70 | ≥ 90 | **SHORTFALL** |
| top-10% R−B | +25.1 | +23.8 | ≥ +25 | ≥ +25 | missed; still terrain, G−R −9.7 |
| bottom-10% B−R | +1.0 | **+2.4** | ≥ +3 | ≥ 0 | met the target, missed my prediction |
| bottom-10% G−R | +4.1 | **+5.7** | — | — | — |

**On the pixels the cards actually own (61.5% of the box), which is what this change can
reach at all:**

| | mean RGB | G−R | R−B | sat | spread |
|---|---|---|---|---|---|
| r16 | 89.5, 95.3, 84.0 | +5.8 | +5.5 | 0.119 | 42.6 |
| after | 86.7, 95.8, 83.9 | **+9.1** | +2.8 | **0.126** | 41.8 |

**Band-wide strip UV (0.04, 0.36, 0.60, 0.14)** — the `broad` term has ~145 px features, so a
253 px box cannot contain one and the 253 px result above is a window-size artefact, not a
null. On the pixels the cards own in a strip six times wider:

```
uniforms at r16 (broad 0.20, tintAmount 0.55)   spread  93.6
after           (broad 0.34, tintAmount 0.85)   spread 106.3      +13.6%
```

**No regression in the two backlit framings** (they were the risk from giving the impostor a
facing-dependent illuminant). Whole frame, r16 review PNG vs after:

```
valley  [117.6, 97.4, 76.4] sat 0.390  ->  [117.2, 97.2, 76.1] sat 0.392
sun     [154.0, 135.2, 114.2] sat 0.302 -> [154.4, 135.3, 114.0] sat 0.304
sun, PostFX's own box (0.10,0.30,0.25,0.25)  sat 0.105 -> 0.117
```

The impostor-dominant tile in `wide`, UV (0.38, 0.40, 0.06, 0.06) — 65.2% owned by
`tree-impostors`, and a sakura crown, whose chroma pull is deliberately unchanged:

```
r16 review PNG              [197.6, 135.5, 131.4] sat 0.339 spread 98.3
impostor uniforms at r16    [196.8, 135.5, 131.4] sat 0.337 spread 99.0
after                       [198.4, 136.4, 131.9] sat 0.339 spread 95.8
```

### 2.8 Why the targets were not reached, with the transfer coefficient measured

This is the part that should stop the next round rebuilding on the same ground.

The change rotated the card albedo's effective `G/R` by **1.88×** (from `mix(1, t, 0.55)` on a
`g/r` 1.19 tint to `mix(1, t, 0.85)` on a `g/r` 2.73 tint — 1.103 → 2.096). That bought
**+3.3 code values of G−R on the cards' own pixels** and **+2.4 on the box**. That is the
measured transfer coefficient, and it is small for one reason: the cards' own pixels sit at
saturation 0.119, i.e. max−min ≈ 11 code values, because roughly two thirds of each of them is
aerial-perspective inscatter. Forward-calculating a bamboo texel through albedo → bake →
key → chroma → ACES lands near (25, 42, 24); it measures (89.5, 95.3, 84.0). The difference is
the veil.

To reach the critic's `G−R ≥ +12` **on the box**, with the cards covering 61.5% of it and the
terrain behind them at G−R −13.3, the cards would have to reach

```
(12 + 0.385 x 13.3) / 0.615 = +27.8
```

from +5.8 — five times the shift a full 1.88× hue rotation of the entire albedo just bought.
There is no green inside any plausible authoring range that gets there through a 65% neutral
veil. The same arithmetic on saturation asks the cards for 0.384 against the 0.126 they now
measure.

The two quantities that would move it are **not in this file**:

- the veil's colour, which is `Sky.applyFog` — and the same round's sky blocker measures that
  fog's source as achromatic, `hero` sunward sky (162.2, 165.0, 163.4) at saturation 0.030;
- the 38.5% of the box that is terrain at G−R −13.3, which is `src/world/Terrain.js` and is
  its own major this round.

So the honest statement is: **the band finding is not closable from `Foliage.js` alone.** The
foliage half of it has moved in the right direction on every axis and is short on all of them.
Recommend the coordinator re-measure this box after the sky and terrain findings land, before
asking foliage for another pass — if the veil gains colour, this box moves without another
line of foliage code.

### 2.9 What was disproved

1. **The band is not tree impostors.** 61.5% bamboo cards, 8.4% impostors against a 6.9%
   grain floor. My own hypothesis, and the first version of the fix was built on it.
2. **Impostor atlas resolution is not why there is "no trunk".** The MEDIUM cell is 128 px and
   a cedar impostor subtends ~60 px at the band's range, so the atlas is minified, not
   magnified. Raising the cell cannot add a trunk. Not attempted.
3. **`uTipGlow`, `uBaseAO` and `uGrain` were compiled out of the impostor program** — measured
   at the driver, not inferred (§2.2).
4. **A 253 px box cannot measure a 145 px noise feature.** The `broad` change reads as a null
   in the critic's box and as +13.6% of lumaSpread in a window wide enough to hold the term.
   Worth knowing before someone reverts it as a no-op.

### 2.10 Not reached

- Criterion (d), "top edge varies by ±15% of mean plant height", was not measured. A greenness
  edge-detector over the band could not separate the card tops from the mauve terrain behind
  them, and the ablation pair that would separate them cleanly (`after` minus `no-cards`,
  silhouette only) was not run before the rig had to be handed back.
- `torii` was not re-shot. The band is its whole backdrop, so it should be in the verification
  set for the next pass on this finding.
