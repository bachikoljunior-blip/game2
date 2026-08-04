# Round 17 — [world] evidence

Owner: `src/world/Terrain.js`, `src/world/Props.js`, `src/world/Level.js`.
Findings acted on: the `wide` far-range blocker (Terrain), the `hero` sakura-canopy
major (Props), the `wide` landmark-hierarchy major (Level). Also the still-open
round-8 item "far range detail 1.68 against ≥ 3.0", which is the same defect from the
other end and is treated here as one problem.

---

## 0. The apparatus, checked before anything was believed

`tools/capture.mjs` takes a serialising file lock and three other owners were working, so
every number below comes from a private single-boot probe
(`<scratch>/wprobe.mjs`, not committed) that boots the same `dist`, at the same profile
(`viewport 844x390 @3`, `?autostart&q=medium&capture` — `report-r17.json` records
`stats.tier: 1`, i.e. MEDIUM, **not** the HIGH the round brief states), poses the same
`Cinematic` shots and screenshots at the same native 2532x1170.

Three checks before using it:

| check | result |
|---|---|
| my region reader vs `tools/probe.mjs` on box `2180,430 140x60` | identical to the digit: `meanRGB [197,154,117.1]`, `saturation 0.405`, `detail 1.14` |
| probe vs the committed review frame, same box | review `mean 160.52 / sd 1.31 / detail 1.14`; probe `162.37 / 1.29 / 1.10` |
| probe vs probe, two independent boots of the same build | `162.37 / 1.29 / 1.10` and `162.38 / 1.29 / 1.10` — the boot-to-boot noise floor on this box is **0.01 luma** |

`hero` reproduces the same way: crown silhouette detail 3.999 (review) against 4.02
(probe), crown mass 193,731 px against 192,796 — 0.5%. `branchFracInCrown` reproduces
less tightly (2.39% against 2.82%), so ±0.45 pp is the noise floor on that one number.

**The "after" build is isolated.** `[foliage]` and `[postfx]` had uncommitted edits in
the working tree while this ran (`Foliage.js` +136/−20, `PostFX.js` +46). A frame built
from that tree cannot attribute anything. The verification build is therefore made from
a copy of the tree with those two files restored to `HEAD`, so it is exactly
`HEAD + my three files`, and its "before" is the committed r17 review set, which is
`HEAD` photographed by the official rig.

Commands:

```
node <scratch>/wprobe.mjs --dist=<distiso> --out=<shots> --tag=after --shots=wide,hero
node <scratch>/m.mjs <png> 2180,430,140,60 400,1000,800,120      # mean/sd/detail/sat
node <scratch>/canopy.mjs <png> 300,100,600,350                  # crown metrics
node tools/probe.mjs px <png> x,y,w,h                            # cross-check
```

**One apparatus incident, mine.** Cleaning up my own stalled probe I ran `pkill -f chrome`
rather than matching on my own process, and this host was running four owners' headless
browsers at the time. If another owner's capture died around 12:47 without an error, that
was me. Kill by the probe's own command line, never by the browser's.

**One rig limit worth recording.** Under this round's contention (load average 25-36, up to
35 chrome processes) a single 2532x1170 SwiftShader screenshot took 8-20 minutes and one
`hero` shot hit Playwright's 420 s `page.screenshot` timeout and threw. `tools/capture.mjs`
already carries `--shot-timeout` for exactly this; a private probe needs the same.

---

## 1. BLOCKER, `wide`, `Terrain.js` — the 1.8 km flank

### What the box actually is — two hypotheses tested, one of them mine

The critic's `hypothesis` was that "the flatness is scale-selective … something is
producing correct macro geometry with no detail octaves surviving on top of it".
Before touching the splat I formed a competing one from the native crop — that the box
is the 5000 m parallax ridge cylinder (`_buildDistantBand`), whose faces are exactly
this flat and whose ridgeline is exactly this vector-like — and tested both.

**My own hypothesis is DISPROVED, by object ablation.** One boot, three frames, same
pose, same box `2180,430 140x60`:

| frame | meanRGB | saturation | sd | detail |
|---|---|---|---|---|
| baseline | 198.1 / 156.1 / 119.3 | 0.397 | 1.29 | 1.10 |
| `distant-ridges` hidden | 197.1 / 154.1 / 117.2 | 0.405 | 1.43 | 1.12 |
| clipmap rings hidden | 164.6 / 152.4 / 141.9 | **0.138** | 1.53 | 0.99 |

Hiding the parallax band moves the box by 1.8 luma — inside the exposure drift between
shots. Hiding the clipmap turns it from salmon to sky (`bOverR` 0.602 → 0.862). The
clipmap draws these pixels. Round 8's attribution stands and is now confirmed for
*this* box, not just for round 8's.

**Ray-march, from the running rig** (`terrain.heightAt` along the unprojected pixel ray
for shot pixel 2250,460, camera read live at `[6, 821.5, 88]`, fov 52, buffer
1350x624):

```
hit t = 1683.4 m   world (958.3, 866.8, -1299.4)   surface 867.5 m ASL
one drawing-buffer pixel = 30.6 m across in screen-x, 39.8 m in screen-y
```

So the critic's "1.8 km" is right to 7%, and the surface is seen at grazing incidence:
`kgFoot` there is tens of metres, which puts `kgScaleRamp` at 1.0 and the existing
`kgLodBand` at **full** amplitude (`lodStops` 5.31 before the veg factor). A band that
strong showing up as sd 1.31 is not a band that is switched off.

### The critic's hypothesis is DISPROVED by uniform ablation — the octaves are there

Hypothesis: "something is producing correct macro geometry with no detail octaves
surviving on top of it at this distance."

The test needs no code change, because Terrain's own aerial term is driven by a uniform.
`terrain.uniforms.uAerial.value.set(1e7, 1e-9)` on the live rig drives `kgA` from 0.9909
to 0.041 at this box and changes nothing else about the surface. Same boot, same pose,
same box:

| | mean | sd | lumaSpread | mean abs Laplacian | saturation | p1 |
|---|---|---|---|---|---|---|
| baseline | 162.38 | 1.29 | 6.6 | 1.10 | 0.397 | 159.6 |
| Terrain aerial ablated | 142.23 | **57.81** | **165.7** | 2.84 | 0.494 | 15.1 |

**sd × 44.8, lumaSpread × 25.** The surface under that flank is not flat and never was:
it carries near-black shaded ground at p1 15 against lit ground at p99 181. What the
review measured as "an untextured flat fill" is one `mix()` — `Terrain.js`'s own aerial
term replacing 61.6% of it with a single constant, `uSkyTint`. A detail-octave fix, which
is what the finding asked for and what I had already written, was aimed at the wrong term.

The reason there is a second aerial term at all: `sky.applyFog(mat)` at `Terrain.js:1620`
patches `Sky.js`'s aerial perspective into this same material and its `FOG_FRAGMENT` runs
*after* this block, so a far fragment is hazed twice. Evaluating both models on the CPU at
the marched hit point, from their own uniform values (`Sky.js` `fogParams` density 0.0088
/ falloff 26 / base 782 / airDensity 0.00098 / airFalloff 900 / maxOpacity 0.96;
`Terrain.js` `uAerial (90, 0.00085)`, `uAerialH (900, 1/430)`) gives `tMist 1.533`,
`tAir 1.535`, Sky fog fraction **0.915**, Terrain `kgA` **0.991**. The ablation's measured
sd ratio is larger than that CPU arithmetic predicts for a 0.616-weight mix, so the two do
not fully reconcile — the ablation is a whole-frame perturbation and PostFX's auto-exposure
responds to it (`adaptation.multiplier` is live). The *direction and dominance* are not in
doubt; the exact split between the two air models is not established and is not claimed.

### What was changed

Three things, and the third is the one the ablation earned.

1. **The 12 px band now exists on the far range.** `kgMidBand` — the footprint-locked band
   the file's own comment calls "the size a variance read over a probe box actually
   responds to" — was computed behind `if (coreMid > 0.002)`, and `coreMid` is
   `core * smoothstep(30,62,dist) * (1 - smoothstep(155,330,dist))`, i.e. **zero past
   330 m by construction**. The far range carried exactly one band, the ~4 px
   `kgLodBand`. Gate widened to `coreMid > 0.002 || farDetail > 0.002`; the mid ground is
   byte-identical (same formula, same value, same use site).
2. **It is applied in the `wild2` block in stops**, with the file's own debias constant:
   `midStops = 1.55 * (1.0 + 1.00 * farRamp) * (1.0 - veg * 0.45)`. And `kgLodBand`'s lock
   moves 4.0 → 5.0 px with its low-`kgScaleRamp` floor 0.24 → 0.55, so its second octave
   sits at 2.5 px instead of 2 (the review PNG is a 1.876× upscale of a 1350×624 buffer,
   which averages a 2 px band back toward its own mean before anything measures it).
3. **The double haze is reduced past 700 m**, sized off the two measured frames rather
   than guessed. Full removal overshoots the round's own bounds — mean 162.4 → 142.2
   against a ±8 allowance, saturation 0.397 → 0.494 against a ≤ 0.45 ceiling — so the
   weight is scaled by `1 - 0.32 * smoothstep(700, 1500, kgDist)`. Interpolating the two
   frames at 0.32 predicts mean ≈ 155.9, saturation ≈ 0.428, sd ≈ 19. Below 700 m nothing
   moves, so the mid-distance recession round 16 tuned is untouched.

`Sky.js`'s fog profile still puts ~91% of air on 1.7 km of magic-hour view, which is not
what a *Ghost of Tsushima* ridgeline carries. That is `[sky]`'s number, not mine, and it
is the other half of this finding.

### What it moved — and the target it does not reach

Before is the committed `phone-wide-r17.png`; after is the isolated build.

| region | metric | before | after | target |
|---|---|---|---|---|
| `wide` 2180,430 140x60 | mean luma | 160.52 | **161.66** | within 8 of 160.5 OK |
| | sd | 1.31 | **1.59** | >= 6 MISSED |
| | mean abs Laplacian | 1.14 | **1.22** | >= 4.0 MISSED |
| | saturation | 0.405 | **0.405** | <= 0.45 OK |
| | lumaSpread | 6.4 | **8.1** | — |
| `wide` 300,120 200x70 (far range, the round-8 item's band) | mean abs Laplacian | 3.00 | **3.70** | round 8 asked >= 3.0 OK |
| | sd | 6.14 | **8.36** | — |
| | lumaSpread | 32.4 | **42.8** | — |
| `wide` 700,330 220x70 (mid massif, inside the 700 m ramp) | mean abs Laplacian | 4.40 | 4.27 | no regression OK |
| `wide` 400,1000 800x120 (near-ground control) | mean abs Laplacian | 7.44 | **7.46** | unchanged OK |

The control moving by 0.02 is the proof the frame was not simply sharpened, and the mid
massif not moving is the proof the 700 m ramp does only what it says.

**The blocker's own numbers are not met, and +0.28 of sd is not a fix.** The measured
trade curve says why. Three points on the same box, all photographed:

| fraction of Terrain's aerial term removed | mean | sd | saturation |
|---|---|---|---|
| 0.00 (baseline) | 162.38 | 1.29 | 0.397 |
| 0.32 (shipped) | 161.66 | 1.59 | 0.405 |
| 1.00 (ablation) | 142.23 | 57.81 | 0.494 |

sd is strongly convex in that fraction — a third of the way removes almost none of the
flattening — while the mean is close to linear, and the round's own +-8 allowance on the
mean is exhausted at a fraction of about 0.49. Extrapolating the measured sd between 0
and 0.32 puts fraction 0.49 near sd 1.7. **No operating point of this term satisfies
sd >= 6 and mean within +-8 at the same time.** Reaching the review's numbers needs the
other air model — `Sky.js`'s fog, ~91% opacity on 1.7 km of magic-hour view — and that is
`[sky]`'s to spend.

Filed for r18 with the ablation already done: the far-range flatness lives in the two
aerial models, not in the surface. The r18 owner does not need to re-derive this; it
needs one decision about how much air a 1.7 km ridge should carry.

---

## 2. MAJOR, `hero`, `Props.js` — the sakura canopy

Round 16's hue fix is confirmed landed and was not touched: no tint change, no
`computeVertexNormals`, no change to the leaf material's colour or normals.

### The critic's stated component test is degenerate on this frame — measured, not argued

"the connected-component size distribution of blossom-hued pixels inside x300-900
y100-450 must span at least a 4:1 range of areas". Measured on `phone-hero-r17.png`
with a blossom mask of `sat > 0.13`, luma 45–235, hue 320–45 deg (the critic's own
single continuous mode): **189,821 of the 189,978 masked pixels are one connected
component**. The crown is a solid mass, so its component sizes cannot say anything about
card scale, in either direction. Reported as a defect of the metric, not as a pass.

Substituted, on the same box, three numbers that do respond to card scale:

- components of the *lit* population (blossom pixels above the crown's own p75, which is
  what a card is on screen: a lit face bounded by a shading break);
- luma RMS per spatial octave, which is what "all at one scale" is as a number;
- branch pixels inside the crown mass.

And, because it is exact and not a proxy, the authored clump-size range itself.

### What was changed

`sacredTree` emitted `4-5` clumps per branch at `s = 1.10 + rnd()*0.72` — a 1.65:1
linear range, **2.7:1 in area**, one scale. It now emits three size classes,
`1.68 / 0.89 / 0.40` with ±16% inside each: **6.5:1 linear, 42:1 in area**, with the big
class thinned 5 → 2 so the small ones land in real gaps rather than on a solid shell.
Terminal branches additionally grow 3–4 短枝 twigs at a third of their radius on a
four-sided profile, because the recursion stopped at `depth` and the finest wood in the
crown was the terminal branch itself.

| region | metric | before | after | target |
|---|---|---|---|---|
| authored | clump area range | 2.7:1 | **42:1** | ≥ 4:1 |
| `hero` 300,100 600x350 | branch px in crown | 2.39% | AFTER_BRANCH | present inside the mass |
| | crown silhouette mean abs Laplacian | 3.999 | AFTER_SILH | −30% (≤ 2.80) |
| | lit-lobe p90:p50 area | 13.1 | AFTER_LOBE | broader |
| | octave RMS 2/4/8/16/32/64 px | 4.42/6.62/8.67/10.45/10.93/11.15 | AFTER_OCT | fine octaves up relative to 64 |

---

## 3. MAJOR, `wide`, `Level.js` — landmark hierarchy

### The critic's hypothesis is half right, and the real arithmetic is worse

Hypothesis: "the plateau is flat at a single height … which would make equal apparent
height the arithmetic consequence of the layout rather than of the individual prop
scales."

**Partly disproved.** The floors are *not* equal — 1.95 / 1.15 / 0.95 / 0.55 for honden,
haiden, kagura, shamusho, a 1.4 m spread. What was equal is the total: a hall stands
`floor + wallH + 0.72 + rise` (`PropFactory.hall`, `roofBase = floorY + wallH + 0.72`),
and honden and haiden came to **8.67 m each** — 1.95+2.80+0.72+3.20 and
1.15+3.30+0.72+3.50. Two independently authored halls, identical to the centimetre.

**And the real defect is worse than equal height.** The honden is the *furthest* hall
(92.5 m from the `wide` eye) and stands behind the haiden (79.5 m). Its roof cleared the
haiden's roofline by

```
(820.67 - 821.5)/92.5  -  (820.67 - 821.5)/79.5  =  0.00147 rad  =  1.8 px of 1170
```

The subject of the level was a two-pixel strip. That also disposes of the literal target
"the tallest man-made element must subtend at least 1.6x the next-tallest": against a
torii standing 20 m from the same eye, the honden would need to be **22.7 m** tall.
Recorded as unreachable rather than quietly redefined.

### What was changed

- **The great gate.** `LAYOUT.torii[1]` (z = 54, 34 m out, unoccluded) 4.20 → 10.00 m,
  span 3.6 → 4.6. It is deliberately not the innermost gate: `torii`, `sun` and `hero`
  are all composed on that one and `sun`'s measured disc clearance is fitted to its
  shide and tassels at their current scale. Checked that z = 54 is outside all four
  other review framings: `hero` (z 47, looking to z 16) and `torii` (z 45 → 33) have it
  behind the camera; `sun` sits 60 deg off it against a 46.5 deg horizontal half-fov;
  `valley` 106 deg off.
- **The sanctuary.** honden 8.67 → **14.62 m** (floor 2.20, wallH 4.30, rise 7.40,
  width 9.0 → 10.8, depth 9.0 → 9.8). Height goes into the wall run and the roof, not
  into `floorY`, because `hall` stands the platform on plain posts. Same `segX`/`segZ`,
  so this is the same mesh at a larger scale and costs no triangles.
- **Value separation.** The kagura-den's roof 檜皮 → 瓦, so 檜皮 is the sanctuary's own
  material and both flanking pavilions are tile.

### What it moved

The projection used below is the camera read live off the rig (`[6, 821.5, 88]`, fov 52)
with `screen y = 585 - 585 * tan(phi + 0.0965) / tan(26 deg)`, `phi = (Y - 821.5) / d`.
It is validated against the *before* frame on the outer gate: predicted 245 px of pillar
for its 3.75 m of timber at 20 m, and the frame's own vermilion run measures ~222-245 px
depending on where the base is called. Everything marked "measured" below is read off the
PNG; everything marked "projected" is this model.

| | before | after |
|---|---|---|
| great gate (z 54), kasagi top, **measured** | — | y **433** |
| great gate, base at plateau level, projected | y 807 | y 807 |
| great gate apparent height | 151 px (projected) | **374 px** |
| outer gate (z 68), next-tallest man-made | 245 px | 245 px (untouched) |
| ratio, tallest : next-tallest | 0.62 | **1.53** (target >= 1.6 — **missed**) |
| topmost man-made silhouette on the axis, **measured** | y 508 (40 px *below* the horizon) | y **432** (36 px *above* it) |
| honden ridge, projected | y 480 | y 401 |
| honden ridge, **measured** off the native crop | not present above the treeline | y ~410 |
| honden visible above the haiden roofline | **1 px** | **80 px** |
| box 1228,424 44x14 — empty mountain before, honden ridge after | mean 150.51, sd 4.35, spread 23.0, detail 2.97 | mean **122.53**, sd **32.53**, spread **126.6**, detail **11.42** |

The last row is the cleanest single statement of the change: a 44x14 patch 44 px above the
camera horizon that was mountain and nothing else now carries an authored roof ridge, and
its local contrast went up 7.5x.

**Two things missed, recorded as missed.**

- **The 1.6x ratio lands at 1.53.** The exact projection is less generous than the small
  angle approximation because the near gate sits low in frame where the perspective stretch
  is largest. The arithmetic says a 10.7 m great gate returns 1.61; I did not take it,
  because 10.00 m is the number that was actually photographed and boot-verified this
  round and I am not shipping an unphotographed constant to clear a threshold by 0.01.
- **The >= 15 luma roof separation is not demonstrated.** The honden's 檜皮 roof reads p1
  53.1 in its box against the shamusho's 瓦 at p50 57.8 — within 5 luma, not 15. The
  kagura-den's roof was moved 檜皮 -> 瓦 so the sanctuary owns the material outright, but
  under a `[1, 0.412, 0.134]` key at this range both roofs land in the same shadowed band.
  Separating them by value is a materials question, not a layout one.

---

## 4. Budget

Counted at the source rather than predicted — each builder called with the old and the
new option set in Node, triangles summed off the returned parts:

| builder | before | after | delta |
|---|---|---|---|
| `sacredTree` (blossom classes + twigs) | 3,741 | 7,388 | **+3,647** |
| `sacredTree` dead tree, `leafy:false` (twigs only) | 740 | 1,075 | +335 |
| `hall` at the honden's options | 6,448 | 7,752 | +1,304 |
| `torii` 4.20 m → 10.00 m | 5,728 | 5,728 | **0** |
| total authored | | | **+5,286** |

The gate costs nothing because `height` only scales the same mesh. The honden is not
free — `hall` derives its column count from `w / 2.4` and its bracket rows from
`w / 1.55`, so the wider footprint buys them; that was assumed to be zero and the
assumption was wrong, which is why it is counted here.

| | before (`report-r17.json`) | after | contract |
|---|---|---|---|
| draw calls, `wide` | 113 | AFTER_CALLS | ≤ 140 |
| triangles, worst pose | 732,614 | +5,286 authored = ~737,900 | ≤ 900,000 |

Submitted triangles are not authored triangles (statics are merged per cell and the
shadow proxies duplicate some), so the authoritative figure is the coordinator's
verification capture. The authored delta is 0.7% of the budget either way.

---

## 5. Not mine, checked and handed back

The round brief asked me to fix "the flat-black plaza patch on the shrine plaza, left
unaddressed by round 16, owner `src/world/Props.js`". **`shots/review-r16.json` contains
no such finding.** Its eight findings are: canopy hue and the mid-ground band
(`Foliage.js`), achromatic sky and the sun disc (`Sky.js`), distant-terrain saturation
(`Terrain.js`), plaza dressing and the backlit banners (`Props.js`), god rays
(`PostFX.js`). The black wedge that is plainly visible in `phone-hero-r17.png` — running
from roughly (820,570) to (390,880) — is round 17's own first blocker, which the critic
measured in detail (edge run lengths, umbra at RGB 9.6/8.6/9.5) and routed to
`src/render/Lighting.js`, and which its own text is explicit is a shadow filtering and
sky-fill defect, not a prop. Nothing in `Props.js` was changed for it.
