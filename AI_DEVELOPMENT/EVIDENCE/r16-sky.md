# Round 16 — [sky] evidence

Owner: `src/render/Sky.js`, `src/render/Lighting.js`. **`Lighting.js` was not modified.**
Base: `4811ba0`, branch `claude/kagerou-round-16-q5h1ah`. Review set `shots/phone-*-r16.png`,
2532×1170, phone/MEDIUM.

Everything below is offline: no build, no capture, no rig lock taken. Five agents were live.

---

## 1. The apparatus, and its validation

`SkySystem` was instantiated against a stub `ctx` (`{ scene: {} }`) so `_evalSky` — the file's
own JS twin of the dome fragment — could be evaluated on the exact view rays of each review
framing (`Cinematic.SHOTS`, vertical FOV, aspect 2532/1170). The cloud deck was ported to JS
from the fragment, including an exact port of `glslNoise`'s `snoise2`/`fbm2`. Composite = ACES
(three's `RRTAndODTFit`, same matrices as `PostFX`) → sRGB, times one scalar `k` per box fitted
on the r16 frame's own luminance, which stands in for bloom + auto-exposure + grade.

**Validation, on the critic's three boxes, against `phone-hero-r16.png` measured with
`tools/probe.mjs`:**

| box | frame (probe.mjs) | model | Δ |
|---|---|---|---|
| sunward `0.88,0.03,0.10,0.12` | `[162.2,165.0,163.4]` sat 0.030 | `[163.2,164.2,165.5]` sat 0.031 | ≤ 2.1 code, sat 0.001 |
| near-horizon `0.88,0.28,0.10,0.08` | `[178.2,180.0,172.9]` sat 0.051 | `[179.2,179.2,175.3]` sat 0.043 | ≤ 2.4 code, sat 0.008 |
| anti-sun `0.38,0.01,0.10,0.12` | `[146.9,171.5,178.4]` sat 0.177 | `[151.0,170.2,179.9]` sat 0.161 | ≤ 4.1 code, sat 0.016 |

R−B tracks to within 2.6 code values on all three. Structure metrics are understated by a
constant: the model has no film grain, so `detail` reads ≈ 0.45 below the frame and
`lumaSpread` ≈ 8 below it. Fitted `k`: 1.237 sunward, 1.272 near-horizon, 1.672 anti-sun.

The shader itself was compiled at all four cloud tiers under the real SwiftShader GLSL ES
compiler via Playwright (`LOW0 [1,2,0]`, `LOW1 [2,3,0]`, `MEDIUM [2,3,1]`, `ULTRA [3,3,1]`) —
all four `ok`. Apparatus check: deleting the `uHorizonTint` declaration makes it report
`ERROR: 0:378: 'uHorizonTint' : undeclared identifier`, so "ok" is not vacuous.

---

## 2. Disproof — the critic's mechanism hypothesis, run as asked

> *"…looks like the sky's own colour is being computed independently of the sun's colour…
> ablate by pushing the sun azimuth 90 degrees and re-measuring UV (0.88,0.03): if the neutral
> patch stays neutral in the new sunward direction, the sky gradient is not tracking the sun."*

Run on the **unmodified** dome, rotating `sunDirection` about +Y and re-running `_applyGrade`:

| sun rotated | box-to-sun angle | box linear | box sRGB | R−B |
|---|---|---|---|---|
| −90° | 133.9° | 0.2268, 0.3026, 0.3403 | 124.7, 143.3, 151.1 | −26.4 |
| −45° | 95.3° | 0.2626, 0.3462, 0.3848 | 135.6, 153.2, 160.1 | −24.5 |
| 0° (shipped) | 53.0° | 0.3826, 0.4780, 0.5072 | 162.7, 175.8, 179.3 | −16.6 |
| +90° | 34.1° | 0.4670, 0.5371, 0.5297 | 175.5, 183.4, 182.6 | −7.1 |
| +45° | 10.5° | 0.4784, 0.4633, 0.3706 | 175.9, 173.9, 160.4 | **+15.5** |

**Disproved.** The gradient does track the sun — the patch swings 42 code values of R−B as the
sun moves. But the ablation also gives the real mechanism, which neither of the critic's two
guesses named: **the dome's warm response is far too narrow.** Even with the sun brought to
10.5° of the patch it only reaches R−B +15.5, below the +25 the finding asks for at 53°.

The cause is in the model, not in a bug. Preetham is single-scattering; the only sun-tinted
terms outside the disc are `pow(cos,2400)·2.2 + pow(cos,220)·0.20 + pow(cos,26)·0.012`. The
widest of those is half-strength at 13.2° and is 1.5 × 10⁻⁶ of its peak by 53°. Past ~25° from
the sun the dome has no memory of the sun's colour at all. Mapping the shipped dome at 13°
elevation (JS twin), linear R−B:

| elev \ azimuth from sun | 0° | 15° | 30° | 45° | 60° | 90° | 180° |
|---|---|---|---|---|---|---|---|
| 3° | +0.34 | +0.26 | +0.17 | +0.10 | +0.05 | +0.02 | 0.00 |
| 10° | +0.26 | +0.19 | +0.08 | −0.00 | −0.04 | −0.06 | −0.06 |
| 20° | +0.10 | +0.04 | −0.06 | −0.14 | −0.15 | −0.14 | −0.12 |
| 45° | −0.19 | −0.20 | −0.22 | −0.21 | −0.20 | −0.18 | −0.16 |

`hero`'s sky sits at 10–24° of elevation and ~50° of azimuth: entirely above and outside the
one warm cell in that table.

## 3. Disproof — the sun disc is already amber before the composite touches it

Modelling the `sun` framing's disc + glare skirt + sky **pre-bloom** (disc centre located by
maximising `dot(rd, sunDirection)`: UV (0.6050, 0.4550), 0.018° off axis, which matches
`Cinematic.js`'s stated pose and the two critics' measurements):

| | mean RGB | saturation | lumaSpread |
|---|---|---|---|
| `phone-sun-r16.png` box `0.595,0.42,0.03,0.06` (post-composite) | 247.7, 247.2, 238.9 | **0.036** | **21.9** |
| the same box as `Sky.js` hands it to `PostFX` | 225.7, 206.1, 173.5 | **0.238** | **77.6** |

Pre-bloom radial profile from the disc centre (sRGB, saturation): r = 0 px `255,255,254` 0.002
· 18 px `231,206,163` 0.294 · 38 px `217,192,152` 0.299 · 70 px `189,170,140` 0.256 · 134 px
`167,158,136` 0.186.

**The dome already delivers a saturated amber disc with a falloff spanning >100 px.** The
achromatic ~60 px ball and the "near-binary edge" are made downstream, in the bloom/glare pass.
This corroborates the round's own independently-measured disproof ("turning bloom and god rays
off moves them decisively, saturation 0.188 → 0.348").

Why the finding's three targets cannot all be met from this file: saturation ≥ 0.25 on that box
requires its mean scene-linear radiance near x ≈ 5.5 (ACES on the sun's own `(1, 0.421, 0.068)`
hue gives sat 0.328 at x = 4 and 0.176 at x = 8). The disc peaks at x ≈ 293. Bringing it to 5.5
is a ~53× cut in the source the bloom and god-ray passes work from — ARCHITECTURE §5.4 — and
growing the disc, which the same finding asks for, moves the box *further* toward clipped white
because more of it is core.

**So the disc was left unchanged this round**, deliberately, on two grounds: the measurement
above puts the defect downstream, and its apparent size and colour in the frame are set by a
pass another owner is rewriting in this same round, so anything I tuned against it would be
tuned against a pass that no longer exists.

One thing for the coordinator: `SUN_DISC_SCALE = 3.0`'s comment claims it matches
`Lighting._computeSplits`'s `spread = 0.055` ("artistic sun size, ~3°"). It does not.
`spread` is a penumbra-per-metre, i.e. an angular *diameter* of 0.055 rad = 3.15°, which is
5.94 × the physical 0.53°; the disc is drawn at 3.0 ×, so the disc and the penumbra still
describe two suns a factor of two apart. Left alone for the reason above; worth a round of its
own once the composite is settled.

---

## 4. The blocker's mechanism, measured

Two independent defects, both quantified against the shipped build.

**(i) The cloud deck could not reach opacity.** `cloudMass` returns
`smoothstep(cov + 0.01, cov + 0.38, f)`, so a solid cloud needs the driving field at
`f = 0.835` (`cov = 0.455` at magic hour). Sampling `f` along 1715 rays over `hero`'s visible
sky with a CPU mirror of the fragment:

- `f`: min 0.198, **median 0.462**, **max 0.772** — the field never reaches the top of its own
  ramp anywhere in the frame, and starts 0.003 above the bottom of it.
- resulting deck alpha: **p50 0.020, p90 0.255, p99 0.457, max 0.61**.

Half the sky had no deck at all; the rest carried a near-uniform ~30% veil. On the critic's
sunward box the mean alpha is 0.302 and the deck's own colour there is linear
(0.426, 0.231, 0.193) — correctly amber — but at 30% over a sky at (0.383, 0.478, 0.507) the
composite is (0.396, 0.404, 0.412): achromatic. That is the finding, exactly: a warm deck with
no opacity paints grey and shows no silhouette (`lumaSpread` 13.9).

**(ii) The atmosphere has no wide warm band** — §2 above.

---

## 5. What changed

Only `src/render/Sky.js`.

1. **Horizon band** (new). A hue rotation applied to the graded radiance in `skyRadiance`,
   `atmos *= mix(vec3(1.0), uHorizonTint, band)`, with
   `band = pow(clamp(1 - rd.y*1.6, 0, 1), 1.2) * smoothstep(-0.10, 0.75, cosTheta)` — zero
   above 38.7° of elevation, zero past 95.7° from the sun, full inside 41.4°. `uHorizonTint`
   is `_sunTransmittance()` (the same extinction the key light is built from) renormalised to
   unit Rec.709 luminance: **(1.9274, 0.8121, 0.1302)** at magic hour. Because it is
   luminance-normalised it is a pure hue rotation and cannot move an exposure or a level.
   Faded off by `smoothstep(-0.05, 0.05, sunY) * (1 - smoothstep(0.26, 0.62, sunY))`, both
   inert at magic hour (sunY 0.2248), so the tuned hour is the untouched one.
   Mirrored exactly in the `_evalSky` twin, including `raw` mode, so the fog targets, the
   ambient hue and the baked probe are all sampled from the sky that is on screen.
2. **`uCloudDensity` 1.25 → 2.2.** The coverage ramp is untouched — round 7 measured a
   0.17-wide ramp as a traceable edge, and narrowing it was not the lever. `dens` clamps at 1,
   so what moves is where the top of the curve lands: alpha now saturates at `f = 0.638`
   instead of 0.705, an effective 0→1 transition spanning 0.177 of the field, against round 7's
   rejected 0.110 and its accepted 0.246.
3. **Disc/deck attenuation floor `mix(1.0, 0.25, cloudAlpha)` → `mix(1.0, 0.50, …)`.** Not
   cosmetic — see §7.

---

## 6. Prediction, stated before the fix, and the result

> *Prediction: with the deck reaching opacity and a sun-tinted horizon band confined below
> ~39° of elevation and ~96° of azimuth, the sunward box reaches R−B ≥ +25 at saturation
> ≥ 0.20 and lumaSpread ≥ 45; the near-horizon box reaches R−B ≥ +35; the anti-solar box moves
> by less than 2 code values, so the swing exceeds 60; and no framing's sky mean luma moves by
> more than 8 code values.*

Model, per-box `k` fitted on r16 and held fixed:

| box | metric | before | after | target |
|---|---|---|---|---|
| sunward `0.88,0.03,0.10,0.12` | mean RGB | 163, 164, 166 | **170, 147, 131** | — |
| | R−B | −2.3 | **+38.7** | ≥ +25 |
| | saturation | 0.031 | **0.228** | ≥ 0.20 |
| | lumaSpread | 20.4 | **48.2** | — |
| near-horizon `0.88,0.28,0.10,0.08` | R−B | +3.9 | **+68.5** | ≥ +35 |
| | saturation | 0.043 | 0.341 | — |
| anti-sun `0.38,0.01,0.10,0.12` | R−B | −28.9 | **−28.6** | stay cool |
| swing (sunward − anti-sun) | R−B | 26.6 | **67.3** | ≥ 60 |

Frame equivalents of "before" from `probe.mjs`: −1.1 / +5.4 / −31.5, swing 30.4.

**Target (d), structure.** Best pure-sky 0.10×0.12 patch in `hero` (162 candidates screened
against the r16 frame so none contains geometry): at UV (0.54, 0.21), `lumaSpread` 37.7 → 72.6
and `detail` 0.61 → 1.31. **31 of 162** patches now exceed `lumaSpread` 45; **0** did before.
The near-horizon box reaches `detail` 0.62 → 1.41.

`detail ≥ 2.0` is **not** met and I do not claim it. Adding the ~0.45 the film grain
contributes puts the best patch near 1.8. Reaching 2.0 needs higher-frequency deck content,
and it was measured to cost the thing the same finding asks for: raising `uCloudScale`
0.00055 → 0.0013 takes `detail` to 2.08 but drives the anti-solar box's R−B from −29 to −9 and
the swing from 67 to 38, and raising the erosion band 0.11 → 0.26 reads as speckle rather than
the "soft banding" the finding specifies. Declined on both counts.

**Contributions, isolated** (each alone, same boxes, same `k`):

| | sunward R−B | sunward sat | sunward spread | horizon R−B | anti R−B |
|---|---|---|---|---|---|
| neither | −2.3 | 0.031 | 20.4 | +3.9 | −28.9 |
| band only | +36.3 | 0.203 | 20.2 | +71.0 | −28.7 |
| deck only | +9.3 | 0.075 | 49.3 | +7.0 | −28.9 |
| both | +38.7 | 0.228 | 48.2 | +68.5 | −28.6 |

Neither alone passes: the band supplies the colour, the deck supplies the structure.

---

## 7. Knock-on effects, all measured

**Sky level, per framing** (top 35%, model at fixed k = 1.5, mean / min / max display luma):

| | mean | min | max |
|---|---|---|---|
| hero | 167.2 → 164.2 | 136.6 → 98.5 | 194.4 → 191.3 |
| wide | 161.2 → 157.8 | 128.3 → 98.5 | 181.8 → 180.9 |
| torii | 150.3 → 150.0 | 133.0 → 111.5 | 176.4 → 178.1 |
| valley | 191.5 → 184.2 | 139.4 → 126.5 | 212.8 → 211.1 |
| sun | 187.6 → 184.4 | 164.9 → 132.5 | 205.2 → 203.6 |

No framing's sky mean moves more than 7.3 code values, and no sky maximum rises.

**White gate (p99.9 > 235 on `hero` and `torii`).** Measured on the r16 frames, the top 0.1%
population is at mean row **645 of 1170 in `hero`** and **659 in `torii`**, and **0.0% of it
lies in the top 40% of either frame** — the sky supplies none of the highlights the gate tests.
The sky's own maximum is 194 (`hero`) and 176 (`torii`) at k = 1.5, nowhere near 235, and both
fall under the change. The only coupling left is auto-exposure, which is on at MEDIUM
(`PostFX._autoExposure = this._hdr && tier >= TIER.MEDIUM`); a sky mean 3.0 code values darker
over ~35% of `hero` raises `ev` slightly, which moves p99.9 **up**, away from the 236.2 → 235
edge. I claim the gate is not reachable from a dome hue change, and I claim the direction of
the one indirect path is safe. I did not re-shoot the frames, so I cannot quote a new p99.9.

**Black gate (p0.1 < 15 on all five; currently 0.1 / 11.9 / 0.0 / 1.0 / 5.8).** The key light
is byte-identical (`sunColor` 1.0000, 0.4118, 0.1339; `sunIntensity` 3.4087; `ambientIntensity`
0.330 before and after). The hemisphere fill is byte-identical in level (`skyColor` luminance
0.2589 → 0.2589) and its R/B stays clamped on §5's `#4a6b8f` at **0.2493** — round 15's
`SHADOW_FILL_MAX_RB` fix absorbs the warmer computed irradiance exactly as intended. The
environment probe's *level* is solved by `Lighting` against `lum709(probeIrradiance)`, which
moves 2.8222 → 2.8402 (+0.6%), so `environmentIntensity` re-solves to the same delivered
irradiance. The deck's 3.3% luminance loss in the cube is **not** compensated (`probeIrradiance`
is a sky-only estimate) so the fill lands ~3% darker — the safe direction for a `< 15` gate,
and `wide` at 11.9 is the tight one.

**Environment probe hue — declared, not buried.** Cosine-weighted over the upper hemisphere,
including the deck, the baked cube's R/B moves:

| | R/B | luma |
|---|---|---|
| r16 | 0.7396 | 0.3007 |
| band only | 0.8192 | 0.3004 |
| deck only | 0.8083 | 0.2908 |
| both | **0.8865** | 0.2905 |

That is +20% on the probe's red/blue. The probe carries 0.182 of the 0.594 luminous fill
(`Lighting`'s `PROBE_AMBIENT_SHARE = 0.55`), ~31%, and the other two thirds (hemisphere, rim)
are unchanged and cool. §5's authored shadow colour is held by the clamp; what warms is the
bounce's own hue. A sky that is genuinely amber on one side does light that side amber, but
this is a change to the cool half of the rig and the next round should know it was a choice.

**Aerial perspective — the largest unverified consequence.** `_airColor` samples the dome to
build the fog targets, so the band propagates into them by design (that link is what round 8's
"pale cut-out ridge" fix established, and breaking it would reintroduce that defect):

| | before | after |
|---|---|---|
| `fogColor` (anti-solar horizon) | 0.3177, 0.3104, 0.3153 | **unchanged**, byte for byte |
| `fogTopColor` (33°) R/B | 0.612 | 0.664 |
| `fogSunHaze` (1°, sunward) | 0.6163, 0.4245, 0.3450, R/B 1.787 | **1.0725, 0.3188, 0.0504, R/B 21.267** |
| `hazePower` (fitted) | 1.329 | 1.327 |

The sunward end of the haze becomes strongly orange. It is self-consistent — a fully-fogged
surface converges on the dome it is silhouetted against, which is the invariant `_airColor`
exists to hold — and the luminance fit is unmoved, so `hazePower` did not shift. But it changes
the aerial perspective's hue across the sunward half of every framing, and I could not render a
frame to see it. **Flagged for [postfx] and the coordinator**: the mid-field haze finding this
round is on the same pixels.

**God rays / bloom source.** Raising the deck's density raised the cloud alpha on the solar ray
from **0.620 to 0.950**, and the disc is multiplied by `mix(1.0, floor, cloudAlpha)`. At the
old floor of 0.25 the disc would have lost 46% of its energy (factor 0.5353 → 0.2875) as a
silent side effect of a cloud change — ARCHITECTURE §5.4, in a round that already has a god-ray
finding. The floor moves 0.25 → 0.50, which holds the disc on the `sun` pose at **0.5250
against 0.5353 before (−1.9%)** and the mean attenuation over the ±8° cap the god rays are
sourced from at **0.8491 against 0.8697 (−2.4%)**. That floor was only ever a floor on paper:
the deck's alpha could not exceed 0.61 anywhere in the review set before this change.

---

## 8. Not reached

- `detail ≥ 2.0` on a 0.10×0.12 `hero` sky patch — §6, with the two measurements that say why
  the available levers cost more than they buy.
- `torii`'s sky structure moves only a little: its critic box `0.88,0.03,0.10,0.12` goes
  `lumaSpread` 11.7 → 14.6, mean `[135.7,155.1,167.4]` → `[141.1,153.9,161.9]`. That framing
  looks steeply up (fov 62), where the flat-slab deck's features subtend most of the frame and
  a 253×140 box contains almost no variation. The band is correctly zero there — the sun is
  119.8° off axis and that sky is supposed to be cool.
- No frame was rendered. Every number here is the offline model, whose agreement with r16 is
  quantified in §1. The verification pass needs
  `node tools/capture.mjs --profile=phone --review --diff` under the rig mutex.
