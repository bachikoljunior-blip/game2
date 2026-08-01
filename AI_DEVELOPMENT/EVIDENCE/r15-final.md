# Round 15 — measured evidence

Profile `phone` / `TIER.MEDIUM`, native 2532×1170, HUD blanked.
Opening set `r15` (build fingerprint `6693aa47…`, byte-identical tree to `r14final`).
Verification set `r15v1` (build `main-0qGNkpyh.js`, all five owners integrated).

Every number below comes from `tools/probe.mjs stats` on the two capture sets, or from
`shots/report-r15.json` / `shots/report-r15v1.json`.

---

## 1. The score is not a measurement this round

The `r15` opening capture was taken on a tree byte-identical to `r14final`. Round 14 closed
at **50/100**; the round-15 source-blind critic opened the same pixels at **62/100**.

**That 12-point gap is inter-critic-instance variance on identical pixels, not progress.**
It is the first time this project has measured that variance directly, because it is the
first time two critic instances have scored the same build. It quantifies the standing
warning in `HANDOFF.md` that the 58 → 44 → 46 sequence is not a trend line.

Treat any single round's score as that round's baseline only.

## 2. Apparatus gate

Checked before anything went to a critic, on both sets.

| gate | r15 | r15v1 | required |
|---|---|---|---|
| booted (phone) | true | true | true |
| `stats.tier` | 1 (MEDIUM) | 1 (MEDIUM) | MEDIUM |
| linked dead shaders | 0 of 117 programs | 0 of 117 programs | 0 |
| review set coherence | 5 shots, `carriedForward: []` | 5 shots, full capture | coherent 5 |
| console errors | 0 (22 entries, all `warning:`) | 0 (22 entries, all `warning:`) | 0 |
| resolution | 2532×1170 | 2532×1170 | native |

The r15v1 program count is unchanged at 117 with zero dead links, which is what clears
`world`'s five GLSL statements that had never been compiled at the time it committed.

## 3. Performance contract (ARCHITECTURE §7)

| | r15 | r15v1 | cap |
|---|---|---|---|
| draw calls, worst pose | 119 (`torii`) | **119** (`torii`) | ≤ 140 |
| submitted triangles, worst pose | 776,373 (`wide`) | **784,449** (`wide`) | ≤ 900,000 |
| bundle, main chunk gzip | 314.83 KB | **317.77 KB** | ≤ 1.6 MB |

Per-shot triangles r15 → r15v1: hero 756,503 → 759,865; wide 776,373 → 784,449;
torii 739,815 → 741,409; valley 685,423 → 684,283; sun 710,443 → 710,121.
Draw calls unchanged on every pose.

## 4. Tonal gates

| shot | p0.1 | p99.9 | pctBelow16 | pctAbove240 |
|---|---|---|---|---|
| hero | 0 → 0 | 236 → **236** | 8.279 → 8.774 | 0.049 → 0.049 |
| wide | 12 → 11 | 219 → 219 | 0.458 → 0.554 | 0.005 → 0.005 |
| torii | 0 → 0 | 250 → **251** | 9.432 → 9.13 | 0.298 → 0.304 |
| valley | 1 → 1 | 233 → **240** | 7.564 → 7.688 | 0.010 → 0.099 |
| sun | 6 → 5 | 245 → **250** | 1.243 → 1.77 | 0.138 → 0.274 |

Black gate (p0.1 < 15) holds on all five. White gate (p99.9 > 235) holds on both eligible
shots, `hero` 236 and `torii` 251. No gate regressed; three improved.

## 5. Finding-by-finding, opening target → measured

Boxes are the critic's own, quoted in native pixels.

### Blocker — detached dark dashes in open sky (`Foliage.js`) — RESOLVED

| box | metric | r15 | r15v1 | note |
|---|---|---|---|---|
| valley (51,94,405×117) | detail | 5.95 | **2.85** | cards-off floor is 2.15 |
| valley (760,59,253×70) clean-sky control | detail | 0.48 | 0.45 | unchanged — no global blur |

Confirmed visually at native resolution: the dash field is gone from open sky.
The critic's literal target (`detail ≤ 1.2`, `p1 ≥ 190`) is **unsatisfiable and was proved
so**: with the entire bamboo card mesh hidden the box still measures detail 2.15 / p1 88.3,
because it contains real near-bamboo and sakura. 2.85 against a 2.15 floor is essentially
the achievable value.

**Mechanism, proven by five ablations rather than guessed.** The bamboo card atlas was
packed 2×2, so bilinear sampling at v=0.5 pulled cells 2/3's deliberately opaque rooted
skirt (canvas row 511 measures 86.7% opaque at meanRGB 76,112,48) through the transparent
culm tips of every row-0 card. Ablation table:

| ablation | luma p1 | detail |
|---|---|---|
| base | 85.6 | 5.87 |
| all Weather emitters off | 87.4 | 5.66 (unchanged) |
| bamboo cards hidden | 88.3 | 2.15 (gone) |
| all instances forced to atlas row 1 | 89.7 | 2.71 (gone) |
| all instances forced to atlas row 0 | 83.1 | 6.24 (doubled) |

Fixed by repacking the atlas 4×1 so every cell edge is the texture's own edge. Zero
triangle, draw-call or texture-memory cost.

### Blocker — no cool sky-bounce in any shadow (`Lighting.js`) — PARTIAL, guard held

| box | target | r15 | r15v1 | predicted |
|---|---|---|---|---|
| hero facade (760,515,127×47) | B/R ≥ 1.30 | 0.579 | **0.865** | 0.719 |
| hero plaza (152,1006,152×59) | B/R ≥ 1.25 | 0.822 | **1.073** | 1.145 |
| torii plaza (1393,1076,203×59) | B/R ≥ 1.25 | 0.838 | **1.035** | 1.111 |
| sun sunlit stone (1266,702,506×23) | B/R ≤ 0.75 (guard) | 0.682 | **0.693** | hold |

Every shaded box moved cool by +0.20 to +0.29 B/R while the sunlit guard held — so the
change is hue-selective, not a global tint. No target was reached.

**Root cause found and fixed at source:** `SHADOW_FILL_MAX_RB = 0.52` is §5 `#4a6b8f`'s R/B
in **sRGB**, compared against `Color.r`/`Color.b`, which three stores **linear**, where the
same constant is **0.2493**. The ceiling was 2.08× too warm, so the clamp had never fired
(live value 0.4431). Corrected hue-only: fill B/R 1.839 → 2.598 at unchanged luminous
irradiance 0.4454.

**Target (a) proved unreachable from these files**: under a *pure* `#4a6b8f` illuminant with
everything else zeroed, the facade box still measures B/R 0.378 — it is cedar (linear
albedo B/R 0.361) and straddles the haiden's emissive shoji.

### Blocker — no readable cast shadow on the plaza (`Lighting.js`) — MISATTRIBUTED

Symptom real; the critic's own probe box was measuring the thing it said was absent.

- **Box (152,1006,152×59), labelled "shaded plaza", is 84.6% cast shadow.** 7 of its 11
  scan boxes brighten by +7.0…+11.2 luma when the shadow term is removed.
- Differential (`kagShadowFade` forced negative): full rig → 30.8% of the plaza band is
  cast shadow, lit p50 46.0 vs shadowed 33.4 = **1.38×**. Ambient zeroed → 34.2%,
  19.7 vs 8.8 = **2.24×**, with lantern-, post- and fence-shaped bars appearing at once.
- **Nobody should touch cascade code.** This is the third independent confirmation, after
  round 7 and round 8.

**Real cause is an exposure ratio:** `ambientReport` omitted `this.rim`, an unshadowed
scene-wide directional worth 0.1482 luminous irradiance. Counted, fill is 0.5937 against
key 0.3960 = **1.50×**, not the 1.125× the report implied, so the best achievable shadow
contrast is 1 + key/fill = **1.67×** against a measured 1.38×. The report was fixed; the
rim's level was deliberately left alone.

### Blocker — bamboo sea does not read as bamboo (`Foliage.js`) — PARTIAL

| box | target | r15 | r15v1 |
|---|---|---|---|
| valley (253,187,506×117) | G−R ≥ +12, sat ≥ 0.45 | −22.9, 0.397 | **−21.3, 0.371** |
| hero (127,351,253×140) | sat ≥ 0.30, G > R | 0.194, false | **0.207, false** |
| valley (253,187,506×117) | detail ≥ 9.0 | 5.97 | **3.61** |

Colour targets not met, and the `detail` target moved away from its goal — but the two
targets are in direct conflict: the dash removal that closed the other blocker *lowers*
`detail` in the same box, since the dashes were contributing 12× the local contrast of the
sky they sat in. Silhouette and canopy did improve visibly at native resolution.

**Critic hypothesis disproved:** the cards are not culm-only. 78.7–82.8% of opaque atlas
texels are green. The defect is scale — opaque coverage is 26.1–34.7% of a cell, blades are
2–4 texels against a 9–14 texel constant-width culm, so the culm survives minification and
the crown averages under the alpha cutoff.

**A measured ceiling on the green target:** the key is (1.0, 0.412, 0.134), so only an
albedo above g/r 2.43 can be green-dominant under it. A pale culm cannot be, at any
saturation setting.

### Major — plateau is a featureless smeared plane (`Terrain.js`) — PARTIAL

| box | target | r15 | r15v1 |
|---|---|---|---|
| wide (2152,702,304×117) | lumaSpread ≥ 70 | 44.9 | **47.0** |
| wide (2152,702,304×117) | one box G > R | R 64.3 G 52.7 | **R 48.5 G 50.4 → G > R** |
| wide whole frame | pctBelow16 ≥ 3.0% | 0.458% | 0.554% |

lumaSpread fell well short of both the target and the owner's own modelled 91.

**Mechanism found — another arithmetically dead branch.** `coreFar` was gated on
`core * smoothstep(55,240,dist) * kgNearGrain`, and since `kgNearGrain = 1 − smoothstep(34,78,dist)`
the product's **maximum over all distances is 0.001887 at 67 m**, against its own
`if (coreFar > 0.002)` guard. It had never drawn a pixel, leaving 45–90 m of ground
carrying only mipped library texture. Corroborated in-frame: ground-only strips fall
7.31 → 6.91 → 5.84 → 5.36 detail from 33 m to 67 m, exactly where `kgNearGrain` fades.

**Two targets proved unreachable from `Terrain.js`:** `pctAbove240 ≥ 0.05%` (the `wide` pose
is front-lit by construction, so no specular returns to the viewer) and `pctBelow16 ≥ 3.0%`
(it needs ~74,061 more sub-16 pixels; only 3.68% of the acted-on 40–100 m strip is even
below luma 32).

### Major — sun disc does not read as a sun (`Sky.js`) — TARGET (a) MET, (b)/(c) impossible

| box | target | r15 | r15v1 |
|---|---|---|---|
| sun core (1514,515,30×29) | luma p50 ≥ 254 | 251.9 | **255.0** |
| sun sky guard (1620,515,51×35) | p50 within ±12 of 225.9 | 225.9 | **227.6** |
| sun core | B/R ≤ 0.80 | 0.923 | **0.998** |
| valley disc (919,23,51×47) | — | 238.1 | **245.9** |

Target (a) met and the sky guard held. **Targets (b) and (c) are arithmetically impossible
alongside (a) in 8-bit** and were declared as such rather than chased: a fully clipped core
is by definition achromatic. The owner declared the annulus-saturation regression
(0.122 → 0.063) itself.

### Major — no god rays (`PostFX.js`) — ACCEPTANCE METRIC INVALID

**The finding's own target could not be satisfied by the phenomenon it asks for.**
Measured on synthetic strips with `probe.mjs`: shaft banding of ±40 code values at a 60 px
period scores `detail` **0.47** — *below* the 0.57 the critic called "mathematically
smooth", and level with the clean-sky control's 0.46. Only ±25 at a 12 px period reaches
4.33, which is grain. `detail` is a 1-px Laplacian and cannot see a shaft; chasing
`detail ≥ 3.0` drives an owner to add noise.

Calibrated replacement proposed: row-averaged high-pass of the 506×23 strip at lag 16 px
(`band16`) ≥ 7.0 with the clean-sky control below 0.5. Calibration — synthetic ±10 @ 60 px
= 7.06; current strip (1266,585) = 1.75; clean sky = 0.155; real ground structure
(1266,819) = 11.43.

**Three disproofs:**
- The pose is not the fault. `_sunUv` reads (0.60509, 0.54474) live with
  `_sunScreenStrength = 1.0`; the critic independently measured (0.604, 0.453).
  **`HANDOFF.md` open item 11 is stale — close it.**
- The emitter is not empty. `rtGodA` is 10.2–11.0% non-zero, max channel-mean 0.998,
  p99 0.479, with the uprights, shimenawa, shide and bamboo present as occluders.
- Undersampling is not the limiter (the owner's own leading hypothesis). Holding gain via
  `uDecay = 0.94^(24/N)`, `rtGodB` mean/p90 = 0.1194/0.2928 at N=24, 0.1088/0.2703 at
  N=48, 0.1083/0.2740 at N=96 — converged by 48. Do not spend fill on `GOD_SAMPLES`.

**What the pass actually does:** `rtGodA` is non-zero on ~10% of texels while `rtGodB`,
the marched result, is non-zero on **99.9%**, mean 0.1194 / p90 0.2928. It smears a
10%-coverage emitter across the whole frame — **it delivers common mode, not differential.**

**This reconciles two findings into one defect.** The `sky` owner ablated the haze minor
independently and found that removing 100% of the aerial perspective moves that finding's
own boxes by nothing (mid band p50 226.3 → 226.2, saturation 0.188 → 0.188), while turning
**bloom and god rays off** moves them decisively (saturation 0.188 → **0.348**, p50
226.3 → **206.4**, both past target; near torii post detail 1.42 → 2.55). The mid-field
wash *is* the god-ray veil. Raising gain to satisfy the god-ray finding would deepen it —
which is exactly the round-7 regression. **If anyone acts here it must be less spread, not
more gain.** Neither owner shipped a change for it, on purpose.

Shipped instead: `uDecay` anchored to `GOD_SAMPLES`. It is a per-march-step falloff while
`GOD_SAMPLES` is a tier knob (24/32/48) under 1/N normalisation, so the decay-weighted tap
count 12.89/14.37/15.81 was divided by 24/32/48 — the same scene emitted
**1.612 / 1.347 / 0.988×** the marched radiance at MEDIUM/HIGH/ULTRA, i.e. the desktop
showcase tier rendered shafts **39% dimmer than the phone**. Now 1.612/1.599/1.587. At 24
taps the expression evaluates to exactly 0.94, so the phone MEDIUM review set is unchanged
by construction.

### Major — puddles render as near-black voids (`Materials.js`) — MISATTRIBUTED

| box | r15 | r15v1 |
|---|---|---|
| hero puddle (1304,977,89×53) luma p50 | 4.1 | **4.1** |
| hero dry stone (1177,1006,76×35) luma p50 | 43.6 | 43.1 |

Unchanged, exactly as the owner predicted — it explicitly did **not** claim the targets.

**Disproved by two independent bounds.** *Scale:* the plaza tile is 1.61 m with weathering
fields at 27/31 cm, so nothing authored in it can be a 2–3 m blob. *Value:* the darkest
cobble albedo texel is 0.249 of the tile mean in linear luminance (p1 0.350), and with
Props' own weathering multiply the absolute floor is 0.210 — while the critic's box reads
**0.051 of its neighbour in linear, 4× darker than the darkest reflectance this file can
produce**, over an area three orders of magnitude larger than a texel. **Light is being
removed, not reflectance.** The leading candidate is that these *are* the plaza's cast
shadows crushed to black, which would also reconcile the shadow blocker.

Shipped anyway, because it found a real silent defect: both `cobble` and `stone` had an
authored standing-water roughness (0.26 / 0.16) that reached **zero texels**, because
`pool * 0.75` and `pool * 0.85` act on a bilerped `wet` field whose measured max is
0.759 / 0.823 — so they only ever travelled about half way. Water was authored and never
delivered.

| baked 256² tile | cobble | stone |
|---|---|---|
| roughness floor | 0.569 → **0.129** | 0.455 → **0.129** |
| share ≤ 0.35 | 0.00% → **5.28%** | 0.00% → **3.71%** |
| albedo linear mean | unchanged to 5 dp | unchanged to 5 dp |

Albedo was held byte-identical on purpose: `Terrain.js` takes `cobble.map`/`stone.map` as
its gravel, streambed and rock layers and derives `hGravel`/`hRock` from their luminance.

## 6. `HANDOFF.md` open item 2 is dead — all three named suspects eliminated

Item 2 ("the cool fill is eaten between the rig and the pixel", called there the most
consequential unfixed finding on the project) drove work across several rounds. Three
owners eliminated it independently this round:

- **`Materials.js:2237` never runs.** `MaterialLibrary.triplanarPatch` has exactly one call
  site, `Terrain.js:1608`, called with **no material**, so it returns at its first line and
  `applyTriplanar` never executes — the cited `TRI_AO` block is dead code. (`addDetailNormal`
  has zero call sites anywhere.)
- **`PostFX.js:397` cannot be it, at source.** `FRAG_RESOLVE` receives one colour input,
  `tScene`, the **composited** radiance; there is no indirect-only buffer. `c *= occTint * k`
  is a per-pixel scalar multiply on key and fill alike, and its only colour term
  `uAoTint (0.78, 0.85, 1.0)` has B/R 1.282 — it can only make occluded pixels *cooler*.
- **Ablation kills both together.** Forcing `aoMapIntensity = 0` on every material and
  `uAoStrength = 0` moves the fill-only plaza 21.0 → 21.6 p50, **+2.9%**, against a noise
  floor where 77–87% of pixels already differ by > 0.5. "A tenth of the fill survives"
  needs ≈ −90%.
- Independently: the live AO's effective indirect multiplier is bounded far too high to be
  the eater — cobble 0.962, lanternStone 0.968, plaster 0.946, stone 0.900, cedar 0.897,
  dirt 0.786, roofTile 0.766.
- And the fill is arriving in full: plaza illuminant is key lum 0.396 + fill lum 0.446 =
  **52.9% of the illuminant, exactly as budgeted**.

**Why the original number looked damning.** An illuminant fitted from a frame's own pixels
returns illuminant × albedo, and these albedos are warm by authored construction — cobble
0.700, stone 0.712, plaster 0.857, cedar 0.519, dirt 0.369, vermilion 0.032 (linear B/R).
`Terrain.js` then multiplies dirt by (0.58, 0.46, 0.35), another ×0.60 on B/R. That is
exactly why `valley` fitted 0.141 and looked like the key's own 0.134. **The fill was never
being eaten; the measurement omitted albedo.**

The genuine defect in the same area was the sRGB-against-linear ceiling in §5 above.

## 7. Apparatus faults found this round

The rig has now broken eight times on this project. Three more were found here, all caught
before they reached a verdict.

1. **`detail` cannot measure shafts** (§5, god rays). A finding's acceptance metric was
   unsatisfiable by any physical version of the fix. Replacement calibrated.
2. **Screenshots after `engine.stop()` are void.** `Engine` sets
   `preserveDrawingBuffer: false`, so the buffer is already gone — an owner's run came back
   98.7% below code 16. **Unverified but important consequence to check: `capture.mjs
   --ab-object` screenshots in a separate round trip after `engine.stop()`, so the
   stopped-frame A/B pairs may be black.** The retained `r12ab` lantern evidence should be
   re-verified before it is cited again.
3. **Hiding the HUD while the title card is live permanently stamps 陽炎 into every later
   frame.** `HUD.update()` clears the overlay once when hidden and returns, while
   `Menus.update()` keeps painting the intro wash into the same canvas. Owner
   `src/ui/HUD.js`. Separately, `menus.skipIntro()` issued in the *same* `page.evaluate` as
   `window.__kagerouStart()` runs before the intro exists, because `begin()` is async;
   `capture.mjs` avoids this only by using two separate evaluates.

A fourth was caught by an owner mid-round: an ablation harness returned **byte-identical
results across all eight configurations** because `_passAdapt` writes the target the next
composite reads. It rebuilt to settle like `capture.mjs` and hash every shot.

## 8. Coordinator decisions recorded

- **`core` / `src/core/Cinematic.js` was gated out** despite carrying a routed minor
  (the `wide` establishing frame has no foreground plane). Acting on it would have re-framed
  `wide` and invalidated the native box coordinates that one blocker and three majors are
  measured against in that exact frame. Deferred with reason, not dropped.
- **`fx` was not spawned** and did not need to be: the dash blocker's Weather attribution
  was tested and cleared by ablation.
- **The sakura trunk target (d)** — "a trunk must be visible connecting canopy to ground" —
  is not a `Foliage.js` defect. The tree's base is occluded by the honden roof and the
  torii, and the impostor bake does include the trunk (`frameRel` puts the card's lower edge
  at 0.023 × height). Re-siting belongs to `src/world/Level.js`.
