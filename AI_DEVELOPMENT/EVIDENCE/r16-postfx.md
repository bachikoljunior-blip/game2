# Round 16 — [postfx] `src/render/PostFX.js`

Finding acted on: **major, `sun` + `valley`, "flat milky veil over the mid-field instead of
separated light shafts"**. Written by the critic as a *spread* problem, on the standing
round-15 disproof that gain was already tried and regressed.

Branch `claude/kagerou-round-16-q5h1ah`, base `4811ba0`.

---

## 0. Apparatus check, before any measurement was trusted

`tools/_r16pfx-measure.mjs` reads every pixel through `luma.mjs`'s decoder and
`probe.mjs`'s `stats`, so it cannot re-acquire the four-byte-stride bug. Validated to the
digit against the critic's own numbers on the r16 set:

    node tools/probe.mjs stats shots/phone-sun-r16.png 0.10,0.30,0.25,0.25
    {"box":"253,351 633x293","meanRGB":[149.8,148.4,141],"saturation":0.105,
     "luma":{"p1":13.9,"p50":192.6,"p99":214},"lumaSpread":200.1,"detail":2.71}

identical to the finding's `[149.8,148.4,141.0] / 0.105 / 192.6`. The five gate pairs my
harness reads off the same PNGs — p99.9 = 236/220/251/242/252 and p0.1 = 0/13/0/1/5 — are
also identical to the values the dispatch states as current.

`band16` was re-derived from the round-15 calibration rather than copied: a row-averaged
column signal high-passed as `|s[i] - 0.5*(s[i-16] + s[i+16])|`. For a sinusoid of
amplitude A and period P that evaluates to `A*(1-cos(2*pi*16/P))*2/pi`, which is 7.03 at
A=10, P=60 — the 7.06 round 15 recorded. My implementation returns **6.981** on that
synthetic, 0 on a flat strip. Same metric.

## 1. Baseline on the exact r16 pixels

| metric | r16 |
|---|---|
| `sun` wash box UV (0.10,0.30,0.25,0.25) meanRGB | 149.8 / 148.4 / 141.0 |
| ... saturation | 0.105 |
| ... luma p50 | 192.6 |
| `valley` mid box UV (0.20,0.15,0.35,0.30) meanRGB | 200.1 / 166.8 / 116.1 |
| ... saturation | 0.430 |
| ... luma p50 | 167.6 |
| `valley` brightest:dimmest 0.02 box ratio, y=0.30, x 0.25–0.58 | **1.304** |
| `sun` band16 (1266,585,506x23) | 1.605 |
| `sun` band16 ground control (1266,819) | 9.956 |
| `sun` band16 clean-sky control (1266,60) | 10.65 |

Note on the clean-sky control: at (1266,60) in the r16 `sun` frame the strip is **not**
clean sky — it crosses the torii lintel and the hanging shide, which is why it reads 10.65
rather than the 0.155 round 15 recorded for a genuinely empty strip. Treated as a
structure control, not as a floor.

White-gate headroom, measured as pixel counts rather than as a boolean (HANDOFF's
instruction after the round-8 regression), masked with `HUD_MASKS`:

| shot | px > luma 235 | needed for p99.9 > 235 | margin | p99.9 | p0.1 |
|---|---|---|---|---|---|
| hero | 3,846 | 2,630 | ×1.46 | 236 | 0 |
| wide | — | — | — | 220 | 13 |
| torii | 11,501 | 2,630 | ×4.37 | 251 | 0 |
| valley | 3,899 | 2,630 | ×1.48 | 242 | 1 |
| sun | 20,956 | 2,630 | ×7.97 | 252 | 5 |

**hero has count margin but essentially no code-value margin.** Re-quantising hero's
masked histogram under a uniform ×0.99 of display code values already takes p99.9 to
**234** — a fail. So any change that dims hero's highlight population by even one code
value breaks the white gate. This is the constraint the fix had to be shaped around, and
it is the number I bound rather than the boolean.

## 2. Mechanism, derived before it was tested

`FRAG_GOD_BLUR` marches `delta = (vUv - uSunUv) * uDensity / N` for `N` steps, so every
pixel's march ends at `uSunUv + (vUv - uSunUv) * (1 - uDensity)` — 15% of the way back out
at `uDensity = 0.85`. For any pixel with `r < 1.2` in aspect-corrected UV, that terminus
lies **inside** the emitter's `uSunRadius = 0.18` envelope. Every pixel in the frame
therefore collects the bright near-sun taps. That is the measured 10.2–11.0% `rtGodA`
coverage against 99.9% `rtGodB` coverage, restated as a cause.

The pass does have an angular weight — `prox = exp(-r*r/uSunRadius^2)` — but it is applied
at the **source** texel, which is the wrong end. For a *directional* light every point
along one pixel's view ray scatters toward the camera at the same angle, so the phase
function is constant along the in-scattering integral and factors out as a **per-pixel**
multiplier. This pass has no such term at all. Weighting the source instead concentrates
the emitter into a blob every march runs into, which is precisely how a differential
quantity becomes common mode.

**Fix direction, therefore: put the missing phase function where it belongs — on the
destination pixel's view angle.** It is multiplicative, monotone, and normalised to 1 at
`theta = 0`, so the near-sun fan keeps exactly its authored gain (this is not a gain
change, in either direction) while the far field collapses.

Camera geometry for the predictions: `Engine.js:129` holds fov at 58 deg vertical for
aspect >= 1.5, and the review set is 2532x1170 (aspect 2.164), so `tan(theta) = 2 *
tan(29 deg) * r = 1.1086 r` with `r` the aspect-corrected UV distance to the sun.
Henyey-Greenstein at g = 0.76, normalised: `ph = ((1-g)^2 / (1 + g^2 - 2 g cos theta))^1.5`.

Predicted phase weight at each measured region (sun at image UV (0.605,0.455);
valley sun at image UV (0.366,0.056)):

| region | r | phase |
|---|---|---|
| `sun` wash box centre (0.225,0.425) | 0.823 | **0.045** |
| `sun` band16 strip centre (0.600,0.509) | 0.055 | **0.931** |
| `valley` mid box centre (0.375,0.300) | 0.245 | **0.373** |
| `valley` ratio line, x = 0.26 | 0.336 | **0.229** |
| `valley` ratio line, x = 0.57 | 0.504 | **0.111** |

## 3. Falsifiable predictions, recorded before the run

- **P1** With the god pass ablated (`godRayStrength = 0`) the `sun` wash box p50 moves by
  **more than 10 code values**. If it moves by less than 3, the wash is not the god pass
  and the whole mechanism above is wrong — reported as a disproof, no fix shipped.
- **P2** `phase076` lands the `sun` wash box p50 within 15% of the `nogod` value, because
  the phase weight there is 0.045.
- **P3** `phase076` leaves the `sun` band16 strip (1266,585) within +/-20% of base — phase
  is 0.93 there, so the near-sun fan is untouched. This is the test that the change is a
  spread change and not a gain change.
- **P4** `phase076` raises the `valley` y=0.30 brightest:dimmest 0.02-box ratio above the
  baseline 1.304.
- **P5** `rtGodB` coverage above 1% of its own p99 falls from ~100% to below 35%.
- **P6** `sun`, `torii` and `valley` keep p99.9 > 235: their above-235 populations sit on
  the sun disc and the lantern flames, where the phase weight is ~1 or the pass is off.
- **P7** `hero` is the exposed gate and I cannot predict it from the still — measured.

## 4. The rig, and what the "before" actually is

Measuring the shipped change against `shots/phone-*-r16.png` would have been wrong: three
other owners were editing the same frame while I worked. `[sky]` has committed `Sky.js`
(`e503c95`), and `Foliage.js`, `Props.js` and `Terrain.js` were dirty in the tree. So every
number below comes from `tools/_r16pfx-lab.mjs`, which builds a **private** `dist-pfx`
(never the shared `dist/`, which a concurrent capture was reading), boots once, and then
swaps variants by string-substituting `mGodBlur` / `mGodOcclusion` / `mComposite`'s
`fragmentShader` and forcing a program rebuild. All variants in a run therefore share one
scene, one terrain seed and one weather state, and the deltas are attributable to the pass.

Guards, because this exact harness has produced fiction on this project before:
- The engine is never stopped. Shots are taken the way `capture.mjs` takes them, so
  `preserveDrawingBuffer: false` cannot empty the buffer under the screenshot.
- Every variant resets `_historyValid` / `_adaptReset` and then settles 5 s, because
  `_passAdapt` writes the target the next composite reads.
- Every output PNG is SHA-hashed and the hash printed, so two variants that produced
  identical bytes would be visible rather than averaged into a conclusion. **No two
  variants shared a hash.**
- Two independent runs on the same `dist-pfx` reproduce the baseline: `sun` p99.9 252 /
  252, p0.1 7 / 7, wash p50 178.9 / 179.1, band16 1.506 / 1.471, `rtGodB` mean 0.12640 /
  0.12640. `valley` mid p50 159.0 / 158.8, saturation 0.565 / 0.565.

Contamination, declared: **`sun` wash-box saturation and mean RGB are not mine to claim.**
On r16 that box read `[149.8,148.4,141.0]` at saturation 0.105; on this tree's baseline it
already reads `[166.6,142.6,109.5]` at **0.360**, before any change of mine. That is
`[sky]`'s `fogSunHaze` R/B 1.79 -> 21.3 landing on exactly those pixels. The finding's
target (c) — mid-field saturation >= 0.22 — is therefore already met by another owner, and
my change moves it *down* slightly (0.360 -> 0.344). Structure metrics (`band16`, `detail`,
column ratios) are spatial and are the ones I report as mine.

## 5. Results

### 5.1 The mechanism, confirmed by ablation

`sun`, switching the god pass off (`godRayStrength = 0`, everything else identical):

| metric | pass on | pass off |
|---|---|---|
| `sun` band16 (1266,585) | 1.506 | **10.879** |
| `sun` band16 (1000,585), crosses the left upright | 6.27 | **23.03** |
| `sun` band16 (1660,585), crosses the right upright | 4.87 | **9.42** |
| `valley` mid box luma p50 | 159.0 | **81.2** |
| `valley` mid box `detail` | 4.11 | **7.81** |
| `valley` y=0.30 line, column max:min | 1.62 | **2.25** |
| `valley` frame luma p50 | 90 | **62** |

The pass was **halving** the valley mid-field's contrast and **doubling** its brightness,
and costing the `sun` strip 86% of its own lag-16 modulation. An unoccluded ray deposits
~0.9 linear (the file's own round-15 derivation) onto a sky that is itself 0.9-1.4 linear;
that pedestal pushes the frame onto the tone curve's shoulder, where the scene's own
modulation is compressed away. This is the critic's sentence — "it lowers local contrast
everywhere instead of raising it in a few places" — as a number.

### 5.2 What shipped, measured

Two changes, both in `FRAG_GOD_BLUR` / `_passGodRays` / `godRayStrength`:
a Henyey-Greenstein phase weight at g = 0.76 on the destination pixel's view angle, and
`godRayStrength` 0.80 -> 0.44.

`sun` (all from the same boot except where the run is named):

| variant | p99.9 | p0.1 | frame p50 | wash p50 | band16 mid | band16 left | band16 right | rtGodB cover | rtGodB mean |
|---|---|---|---|---|---|---|---|---|---|
| base | 252 | 7 | 170 | 178.9 | 1.506 | 6.27 | 4.87 | 89.6% | 0.1264 |
| phase g=0.76 | 252 | 1 | 162 | 180.5 | 2.654 | 12.26 | 6.73 | 38.9% | 0.0572 |
| **phase + 0.44 (shipped)** | **251** | **1** | **159** | **178.2** | **4.728** | **15.47** | **7.38** | 38.9% | 0.0564 |
| phase + 0.28 | 251 | 0 | 157 | 180.9 | 6.376 | 17.70 | 7.92 | 39.1% | 0.0571 |
| pass off | 250 | 0 | 156 | 177.8 | 10.879 | 23.03 | 9.42 | — | — |

`valley`:

| variant | p99.9 | p0.1 | mid p50 | mid sat | mid detail | column max:min | band16 23px | band16 60px | 0.02-box ratio |
|---|---|---|---|---|---|---|---|---|---|
| base | 242 | 1 | 158.8 | 0.565 | 4.13 | 1.57 | 3.61 | 3.41 | 1.294 |
| phase g=0.76 | 242 | 0 | 122.6 | 0.558 | 5.97 | 2.14 | 4.43 | 5.03 | 1.555 |
| **phase + 0.44 (shipped)** | **242** | **0** | **106.9** | **0.544** | **6.64** | **2.21** | **5.24** | **5.47** | **1.403** |
| pass off | 241 | 0 | 81.2 | 0.491 | 7.81 | 2.25 | 5.84 | 7.59 | 1.297 |

`rtGodB` coverage is quoted above 1% of the buffer's own p99, not "non-zero": a half-float
buffer multiplied by a smooth positive weight is never exactly zero, so raw non-zero
coverage stays at 99.95% by construction and says nothing. On that honest threshold the
pass goes from depositing something visible on **89.6%** of the frame to **38.9%**, and its
mean deposit falls 0.1264 -> 0.0564 (-55%).

### 5.3 The predictions, scored honestly

- **P1 — half right, and the half it got wrong matters.** On `valley` the ablation moved
  the mid box p50 by **77.6 code values** (159.0 -> 81.2), far past the >10 threshold: the
  veil there *is* the god pass. On `sun` the same ablation moved the wash box p50 by
  **1.1** (178.9 -> 177.8), below the 3 I set as the disproof line. **The `sun` wash box is
  not the god pass.** It is 65% sky by area (it contains the pavilion roof and the sky
  above it), and sky at that brightness is already on the shoulder, so an additive term
  cannot move its median. This is why target (b) fails below.
- **P2 — met but uninformative.** `phase` lands the `sun` wash p50 within 1.5% of the
  ablated value; so does base. The metric has no dynamic range here.
- **P3 — wrong.** I predicted the near-sun strip would stay within +/-20% because the phase
  weight there is 0.93. It rose 76% (1.506 -> 2.654) with the phase alone. The local weight
  is not what moved it: taking 55% of the frame's added light out lets the auto-exposure and
  the tone curve give those pixels more slope, and the strip's own modulation stops being
  compressed. Consistent with the pedestal mechanism, but my prediction of *where* the
  effect would land was wrong and I am recording that.
- **P4 — met on the phenomenon, and the metric is unsatisfiable (see 5.4).** Column
  max:min on the `valley` y=0.30 line, 1.57 -> **2.21** against an ablation ceiling of 2.25:
  the shipped change recovers **94%** of all the contrast that removing the pass entirely
  could recover.
- **P5 — missed, slightly.** `rtGodB` coverage above 1% of its own p99: 89.6% -> **38.9%**
  against a predicted <35%.
- **P6 / P7 — see the gate section.**

### 5.4 Two disproofs of the finding's own acceptance targets

**Target (a) — "the ratio between the brightest and dimmest 0.02x0.02 boxes along y=0.30,
x 0.25-0.60 must reach at least 2.5:1" — cannot be reached by any state of this pass.**
Measured across the entire available range, from full strength to the pass switched off:

| state | 0.02-box ratio |
|---|---|
| base (0.80, no phase) | 1.294 |
| phase only | 1.555 |
| phase + 0.44 (shipped) | 1.403 |
| **pass off entirely** | **1.297** |

It is not monotone and its maximum over the whole range is 1.56. A 0.02x0.02 box at this
resolution is 50x23 px, and it averages the culm-to-gap structure away before the ratio is
taken; what little the metric does respond to is the god fan's own large-scale gradient,
which is why *removing* the pass makes it worse, not better. The same line measured at
column resolution — which is the scale a viewer actually sees a beam at — moves
**1.57 -> 2.21** with an ablation ceiling of 2.25. This is the same failure mode round 15
recorded for `detail`, and it should be replaced the same way: quote the column max:min or
`band16` on the strip, not a 0.02-box p50 ratio.

**Target (b) — "`sun` box UV (0.10,0.30,0.25,0.25) p50 must drop below 165" — is not this
file's to reach.** Ablating the pass completely moves it 178.9 -> 177.8, i.e. `PostFX`
owns **1.1 code values** of that number. The box is sky and a dark roof; its median is the
sky's own brightness, which belongs to `Sky.js`. Shipped value 178.2.

Target (c) — saturation >= 0.22 in that box — is already met on this tree at **0.360**,
by `[sky]`'s committed haze change, before anything of mine. My change takes it to 0.344.
Declared as contaminated, not claimed.

### 5.5 A third disproof: removing the source-side `prox` makes it worse

The obvious "more correct" companion change — delete the source-side angular weight now
that the phase function is applied at the destination — was tested (`nopx076`, with
`uWeight` auto-scaled so `rtGodB`'s p99 matched base exactly, so it is a pure shape change
and not a gain change). It is worse than the phase alone on every measure:

| | base | phase only | phase + prox removed |
|---|---|---|---|
| `sun` band16 mid | 1.506 | **2.654** | 1.737 |
| `sun` band16 left | 6.27 | **12.257** | 8.179 |
| `sun` wash p50 | 178.9 | 180.5 | 187.0 |
| `rtGodA` coverage | 23.4% | 23.8% | 40.7% |
| `rtGodB` coverage >1% p99 | 89.6% | **38.9%** | 79.1% |

Without `prox` the emitter covers 40.7% of the buffer instead of 23.4%, and the march
re-acquires most of the common mode from the wider field. **`prox` stays.** The two weights
are not redundant: `prox` decides which sky is allowed to emit, the phase decides which
view rays are allowed to receive.

## 6. The sun-disc minor, re-routed to this file by the coordinator — measured, and disproved

`[sky]` measured the disc leaving `Sky.js` at saturation 0.238 against 0.036 in the frame,
attributed the loss to the bloom pass, and estimated that reaching saturation >= 0.25 from
its own side would need the disc's peak cut ~53x (293 -> 5.5 scene-linear).

Reproduced the symptom first. `probe.mjs stats shots/phone-sun-r16.png 0.595,0.42,0.03,0.06`
gives `[247.7, 247.2, 238.9]`, saturation **0.036**, lumaSpread 21.9 — the critic's numbers
exactly. Radial profile about the disc centre (1532, 532):

| annulus (px) | mean RGB | saturation |
|---|---|---|
| 0–6 | 254.7 / 254.7 / 254.7 | **0.000** |
| 12–20 | 254.6 / 254.6 / 253.2 | 0.006 |
| 32–50 | 239.4 / 238.7 / 226.0 | 0.056 |
| 80–120 | 236.0 / 230.1 / 207.8 | 0.120 |
| 180–260 | 229.5 / 210.9 / 169.1 | 0.264 |

Saturation *rises* monotonically away from the core. The core is not desaturated by
something added on top of it — it is clipped, and clipping is what removes hue.

**Disproof 1 — bloom is not the flattener.** Evaluating this file's own tone curve (the
ACES input/output matrices and `rrtOdtFit` from `GLSL_COMMON`, plus `sRGBEncode`) on the
disc's authored chroma [1, 0.913, 0.769]:

| scene-linear peak | display codes | saturation |
|---|---|---|
| 293 | 255.0 / 255.0 / 255.0 | 0.000 |
| 100 | 255.0 / 255.0 / 255.0 | 0.000 |
| 30 | 255.0 / 255.0 / 254.8 | 0.001 |
| 10 | 252.0 / 251.6 / 250.7 | 0.005 |

At 293 linear all three channels are already pinned before any additive pass contributes a
single unit. Bloom cannot be responsible for a saturation the curve has already destroyed.

**Disproof 2 — the proposed remedy would not work either.** At the suggested 5.5 linear the
same curve returns **247.9 / 247.1 / 245.5, saturation 0.010** — not 0.25. Cutting the peak
53x buys 0.010. The reason is upstream of both of us: the chroma [1, 0.913, 0.769] has an
intrinsic saturation of only **0.231** *before* any tone mapping, and ACES compresses it
further at every level. No peak reduction of an amber this weak reaches 0.22 through this
curve; the disc needs a stronger chroma, not a lower peak.

The only `PostFX`-side route to a hue-bearing disc is a hue-preserving highlight rolloff —
tone mapping on the max channel and carrying the ratios — which is a whole-frame grade
change that would move every pixel of every framing and both contract gates. It must not
ride along in a commit whose subject is the god-ray spread. Not attempted this round;
recorded here as the one option that exists.

## 7. Verification against the shipped source, not against a runtime patch

`dist-pfx` was rebuilt from the working tree carrying the committed edit, and the same lab
ran with **no runtime patching**. A `pre` variant splices the shipped shader back to the
old behaviour (`* ph` -> `* 1.0`, `godRayStrength` back to 0.80) so the before and after
come from one build, one boot and one scene.

The shipped source reproduces the variant it was chosen from, to the metric:

| | runtime-patched variant | shipped build |
|---|---|---|
| `sun` band16 (1266,585) | 4.728 | **4.717** |
| `sun` band16 (1000,585) | 15.47 | **15.474** |
| `sun` band16 (1660,585) | 7.381 | **7.346** |
| `sun` `rtGodB` coverage >1% p99 | 38.86% | **39.15%** |
| `sun` `rtGodB` mean | 0.05641 | **0.05715** |

### 7.1 band16 on the shaft strip, against its target and its control

| strip | pre | shipped | pass off (ceiling) |
|---|---|---|---|
| (1266,585) — the r15-calibrated strip | 1.465 | **4.717** | 10.879 |
| (1000,585) — crosses the left upright's wedge | 5.991 | **15.474** | 23.03 |
| (1660,585) — crosses the right upright's wedge | 4.769 | **7.346** | 9.42 |
| (300,80) — clean sky control | 0.246 | **0.162** | — |

Against the round-15 acceptance target of **>= 7.0 with the clean-sky control below 0.5**:
the two strips that actually cross an occluder's wedge **pass** (15.47 and 7.35) and the
control is 0.162, well inside its bound. The r15-nominated strip at (1266,585) reads 4.72
and **does not** reach 7.0.

That strip is worth a note for whoever picks the metric next. It spans x 1266-1772 at
y 585-608, which is the gap *between* the two torii uprights and directly below the sun at
UV (0.605, 0.455). Every ray from that strip to the sun runs through open sky — nothing
occludes it, so by construction it cannot carry a shaft. What it does measure is how much
the pass flattens the sky's own texture, and on that reading it is the strongest single
number in this round: 1.47 with the pass at its old settings, 10.88 with the pass off.
A shaft metric has to sit where an occluder projects; (1000,585) and (1660,585) do.

### 7.2 The contract gates, on all five framings, bounded as integer buckets

Measured on the shipped build with `measureLuma` + `HUD_MASKS` — the same function the
gate report uses — and quoted as both the integer bucket the gate tests and the highlight
pixel count behind it, per HANDOFF's instruction after the round-8 regression.

| shot | p99.9 pre | p99.9 shipped | white gate | px > 235 pre | px > 235 shipped | need | margin pre -> shipped | p0.1 pre | p0.1 shipped | black gate |
|---|---|---|---|---|---|---|---|---|---|---|
| hero | 236 | **237** | PASS | 3,682 | 4,114 | 2,630 | x1.40 -> **x1.56** | 0 | 0 | PASS |
| wide | 221 | 221 | n/a | 292 | 260 | 2,630 | — | 11 | 11 | PASS |
| torii | 251 | **250** | PASS | 11,663 | 10,357 | 2,630 | x4.43 -> **x3.94** | 0 | 0 | PASS |
| valley | 242 | **242** | PASS | 3,839 | 3,711 | 2,630 | x1.46 -> **x1.41** | 1 | 0 | PASS |
| sun | 252 | **251** | PASS | — | — | — | — | 6 | 1 | PASS |

**Why hero and torii are structurally safe, which is the answer to P7.** `_sunScreenStrength`
reads **0.000** on `hero`, `torii` and `wide` — the sun is behind or beside the camera in
all three, so `uGodStrength = godRayStrength * _sunScreenStrength` is already zero and the
composite adds nothing from this pass. The god-ray term is an **exact identity** on those
three framings, and the +/-1 in the table is grain and TAA phase between two shots, not a
change. The gate the brief warned me about — hero's white gate, which a uniform x0.99 of
display codes alone would take from 236 to 234 — was never exposed to this change. It
measured 237 after, one code value *up*.

The two framings the change does reach (`sun`, `valley`, both `_sunScreenStrength` = 1.000)
keep p99.9 at 251 and 242 against a bound of >235, and their p0.1 moves *down* (6 -> 1,
1 -> 0), i.e. further inside the black gate rather than nearer it.

### 7.3 The finding's two framings, before and after, on the shipped build

`sun`:

| metric | pre | shipped |
|---|---|---|
| wash box UV (0.10,0.30,0.25,0.25) luma p50 | 181.3 | 175.9 |
| ... `detail` | 2.58 | **2.82** |
| ... saturation | 0.357 | 0.345 |
| band16 (1266,585) | 1.465 | **4.717** |
| band16 (1000,585) | 5.991 | **15.474** |
| frame luma p50 | 170 | 160 |
| `rtGodB` coverage >1% of its p99 | **89.0%** | **39.2%** |
| `rtGodB` mean | 0.12388 | **0.05715** |

`valley`:

| metric | pre | shipped |
|---|---|---|
| mid box UV (0.20,0.15,0.35,0.30) luma p50 | 158.9 | **106.8** |
| ... mean RGB | 206.2 / 157.7 / 91.3 | 151.6 / 119.4 / 68.7 |
| ... `detail` | 4.13 | **6.64** |
| y=0.30 line, column max:min | 1.58 | **2.24** (ablation ceiling 2.25) |
| band16 across the bamboo edge, 60 px strip | 3.43 | **5.62** |
| `rtGodB` coverage >1% of its p99 | 87.8% | **30.1%** |

The `valley` column contrast recovers **97%** of everything that deleting the pass entirely
could recover, while keeping a visible fan.

## 8. Left open

- **The finding's targets (a) and (b) are not met and are measurably unmeetable** from this
  file; see 5.4. Targets stated as 0.02-box p50 ratios and as the `sun` wash-box median
  should be replaced with the column max:min and `band16` figures above.
- **band16 4.72 against 7.0 on the r15-nominated strip (1266,585).** The strip has no
  occluder between it and the sun; the two strips that do read 15.47 and 7.35.
- **The remaining pedestal is still worth ~4 more points of band16 on that strip.** The
  sweep is measured and in 5.2: at `godRayStrength` 0.28 the strip reads 6.38 and at 0
  it reads 10.88. It was not taken further this round because the fan visibly thins toward
  the ablated frame and there was no review left to judge that trade.
- **The sun disc cannot be given hue from this file** without a hue-preserving highlight
  rolloff (section 6), which is a whole-frame grade change.
- Harness left in the tree as `tools/_r16pfx-lab.mjs`, `tools/_r16pfx-measure.mjs`,
  `tools/_r16pfx-compare.mjs` (uncommitted; delete or adopt as the coordinator prefers).
