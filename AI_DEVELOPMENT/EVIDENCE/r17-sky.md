# Round 17 — [sky] — `hero`'s plaza shadow edge

Finding: BLOCKER, `phone-hero-r17.png`, owner `src/render/Lighting.js`. Two acceptance
targets: (a) the stair-stepped terminator, (b) the neutral, unfilled umbra.

File changed: `src/render/Lighting.js` only.

**Headline.** The stepped black wedge both targets are measured on is not a shadow and is
not drawn by this file. Its edge is phase-locked to the quarter-resolution god-ray buffer's
texel grid, it cuts a foreground fence post 5.5 m from the camera along the same
screen-space line as plaza 30 m behind it, it is absent from a clean boot of the same commit
at the same pose, and it is darker than this rig can make any cast shadow. The critic's
`hypothesis` (a shadow-map texel footprint) is disproved with the projected footprint
measured off the live rig. What this file *did* have — found while proving that — is a
partition-of-unity break in the cascade cross-fade that put up to +32.5% and −32.5% of the
key light into a band crossing the same plaza. That is fixed and measured.

---

## Apparatus, checked before anything was believed

- **The review set is tier MEDIUM, not HIGH.** `shots/report-r17.json` records
  `profiles.phone.stats.tier` **1**, and `TIER = { LOW:0, MEDIUM:1, HIGH:2, ULTRA:3 }`
  (`src/core/Quality.js:9`). The round brief said HIGH. Everything below is at `q=medium`,
  the tier the critic actually judged. ([postfx] reached the same conclusion independently
  this round.) Drawing buffer **1350×624**, review PNG **2532×1170**, so the presentation
  upscale is **1.876×**.
- **My decoder agrees with the critic's to the digit** on the committed PNG:
  `node tools/probe.mjs px shots/phone-hero-r17.png 770,880,40,30` → mean RGB
  **9.6/8.6/9.5**; `880,880,40,30` → **59.8/49.8/47.8**. My own scanner independently
  reproduces the finding's whole edge run-sequence — `997×2 982×8 974×7 967×7 952×7 944×5
  922×15 907×7 892×7 884×7 869×7 854×7` — and its coverage figures, 10.01% of
  x620–1160 y700–1140 below luma 6 (critic: 10.0%) and 2.33% of the frame below luma 4
  (critic: 2.33%).
- **My probe reproduces the reviewed frame.** A clean boot of `504477a` at `q=medium`,
  `hero` pose, native 2532×1170 gives the lit box mean R **59.74** against the review
  frame's **59.77** — 0.03 of a code value. Whole-frame diff: only **0.92%** of pixels
  differ by more than 20 luma, and that 0.92% is the wedge plus wind-moved sakura leaves.
  The rig, the pose, the grade and the build all match; the wedge does not.
- **Two rig faults of my own, both caught.**
  1. My first crop wrote RGBA into `encodePNG`, which takes RGB — the round-7 four-byte
     stride bug again, and it produced a green cross-hatch. Caught before any number came
     from it; the standing rule (run one region through `tools/probe.mjs` and require
     agreement to the digit) earned itself once more.
  2. **Editing the tree while a vite dev rig is booted destroys the run.** A one-line
     comment edit logged `page reload src/render/Lighting.js` and killed a boot outright;
     worse, *any other owner* saving a `src/` file reloads it too, and five of them were
     being edited all round, so a probe against the working tree can be reset indefinitely
     with no error printed. The rig now serves an isolated snapshot (`scratchpad/snap`)
     and booted first try. **Any owner using a dev-server probe during a parallel round
     must serve a snapshot, not the working copy.**
  3. **Do not judge run health by elapsed wall clock in this container.** Under five
     concurrent SwiftShader browsers the container clock advances far slower than the
     agent's sense of elapsed time; I nearly killed a healthy run twice on that basis.
     Poll for the artefact file, not for a deadline.
- `tools/capture.mjs` was never run: three other owners held the rig. All frames come from a
  private single-boot probe in the scratchpad.

---

## Disproof 1 — the wedge cannot be a cast shadow (from the rig's own irradiance)

`ambientReport`, read live this round: key **0.39603**, hemi **0.26400**, probe **0.18150**,
rim **0.14818**, fill **0.59368** — matching round 15's audit. Every fill term is
unshadowed (`hemi`, `scene.environment` and `rim` all have `castShadow = false`), so the
darkest a cast shadow can render a surface is `fill / (key + fill)` = **0.600** of its lit
value. Correcting the rim for the geometry of a horizontal plaza — it is aimed from
`camDir·16 + side·7 + (0,6,0)`, i.e. 21.2° above horizontal, so an up-facing plane sees
`NdotL = 0.361` of it, not all of it — only moves the floor to **0.557**.

The wedge measures **8.90 luma against 51.76** on the critic's own two boxes, a display
ratio of **0.172**, and any monotone tone curve makes the underlying linear ratio smaller
still. No shadow term in `Lighting.js` can produce those pixels; the shadow term multiplies
the key and nothing else.

## Disproof 2 — the critic's texel-footprint hypothesis

The hypothesis was that the step is one shadow-map texel projected onto near-camera ground,
"roughly 4 by 8 render pixels". Measured, not assumed — cascade spheres read live
(**15.5717 m** and **75.7057 m**, map **1536**), sun direction `(0.860, 0.225, 0.457)`, hero
camera read from the running page, receiver the flat plaza:

| sample point | cascade | texel | ground footprint in PNG px |
|---|---|---|---|
| (950, 760), 33.65 m — inside the critic's scan | 1 | 0.0941 m | Δu = (+1.16, −0.32) → 1.21 px; Δv = (−17.4, −0.09) → **17.4 px** |
| (870, 840), 19.92 m — inside the critic's scan | 1 | 0.0941 m | Δu 2.58 px; Δv **29.92 px** |
| (790, 895), 5.56 m — the wedge's near end | 0 | 0.0203 m | Δu 2.41 px; Δv **23.58 px** |

Those three rows are read out of the running page by stepping one texel along the shadow
camera's own basis vectors and sliding the result back onto the receiver along the sun ray.
An independent closed-form projection of the same quantity for the pre-fix texel (0.09858 m)
gives 18.19 × 1.26 px at the first point, which scales to 17.36 for the post-fix texel —
0.2% from the live figure, so both computations are the same computation.

At 13° elevation a ground texel is stretched `1/sin 13° = 4.44×` along the sun azimuth, so
the footprint is a **14:1 sliver aligned with the anti-solar azimuth**, not a square. The
observed staircase is **7.5 × 7.5 px and axis-aligned in screen space**. A grid whose own
footprint is 1.2 px across cannot produce a 7.5 px riser in that direction.
**Hypothesis disproved.** (The scan rows are also entirely inside cascade 1 — view depth
23.86 m at (850,800), against a cascade-0/1 split at 14.24 m — so this is not the near
cascade's PCSS path at all.)

## Positive identification — the quarter-resolution god-ray buffer

Phase-lock test. For each candidate pitch, take the 12 x-transitions and 11 y-transitions of
the critic's own edge scan, reduce them modulo the pitch, and compute the circular
concentration R of the resulting phases. R = 1 means every transition sits at the same
sub-texel phase; R ≈ 0 means the pitch is unrelated.

| pitch | what it is | R (x) | R (y) |
|---|---|---|---|
| 1.876 px | one render pixel | 0.694 | 0.406 |
| 3.751 px | `W>>1` — SSAO, DOF, bloom mip 0 | 0.920 | 0.804 |
| **7.513 / 7.500 px** | **`W>>2` — god rays at MEDIUM** | **0.983** | **0.948** |
| 18.19 px | cascade-1 texel across, as the reviewed frame was rendered | 0.372 | — |
| 1.26 px | cascade-1 texel along, as the reviewed frame was rendered | — | 0.240 |

(The two shadow-texel pitches are the pre-fix values, because the reviewed frame was
rendered pre-fix. The fix changes them to 17.4 / 1.21 px, which scores no better.)

Half-res scores high only because it is a harmonic of quarter-res; every x step in the scan
is an **even** multiple of 3.751 px (2 or 4 of them), which rules it out. And
`2532 / 337 = 7.513`, `1170 / 156 = 7.500`, with `337 × 156 = (1350>>2) × (624>>2)`.

Read back off the running pipeline at the review tier, rather than inferred from the preset
table: `godShift 2`, **`rtGodA/B` = 337 × 156**, `rtAO` = 675 × 312, `rtDofA` = null (DOF is
off at MEDIUM), drawing buffer 1350 × 624. The god buffer's grid *is* the artefact's grid,
to the texel. The first bloom mip is at `>>1` as well (`_bloomStartShift = 1` above LOW,
`PostFX.js:1734`), so at this tier nothing else in the chain is quarter-resolution.

It is screen-space, not world-space. On the fence-post column x785–795 the wedge blacks rows
**900–930** (r17 reads 2/3/4; the clean boot reads 50/22/10, warm cedar) and stops dead at
row 936, where both frames are identical again. It cuts a post **5.556 m** from the camera
(physics raycast, hit 1.687 m above the plateau) on the same screen-space line as plaza
**30 m** behind it. Nothing in `Lighting.js` is screen-space.

**Its shape is a radial fan about `uSunUv`, and that is the closing argument.** Isolating the
artefact as "below luma 6 in r17 **and** above luma 18 in the clean boot" gives a straight
band whose centreline fits `x = −1.4073 y + 2063.4` over 56 rows. `_sunUv` reads
**(0.5, 0.5)** live in this pose, i.e. PNG (1266, 585) — and the fitted centreline passes
**15.0 px** from that point, on a band up to 101 px wide. The width grows with distance from
it, as a fan must:

| row | width | radius from (1266, 585) |
|---|---|---|
| 728 | 20 px | 270 px |
| 856 | 66 px | 484 px |
| 984 | 66 px | 705 px |
| 1112 | 101 px | 942 px |
| 1152 | 89 px | 1028 px |

A cast shadow has no reason whatsoever to be centred on the sun's *screen* position; a
radial blur has no other possible centre.

**Hypothesis for [postfx], NOT proved by me and NOT acted on.** A single non-finite texel in
`rtGodA` poisons every radial-blur tap whose march crosses it, which is exactly one straight
fan from the sun's screen position outward; and `color += texture2D(tGod, uv).rgb *
uGodStrength * uGodTint` (`PostFX.js:1299`) cannot be saved by `uGodStrength = 0`, because
`NaN × 0 = NaN` (ARCHITECTURE §5b). That last clause is not rhetorical here: read live in
the `hero` pose, **`_sunScreenStrength = 0`** and `_sunUv = (0.5, 0.5)` (the off-screen
fallback), so `uGodStrength = godRayStrength × _sunScreenStrength = 0.44 × 0 = 0`. `hero` is
precisely the framing where this term is switched off and therefore never exercised, and a
non-finite texel is the one thing a zero strength cannot suppress. The transience fits: the
artefact is absent from a clean boot of the same commit at the same pose. Someone who owns
that file should read back `rtGodA`/`rtGodB` for non-finite texels, and consider clamping
the tap rather than trusting the multiply.

---

## What is genuinely wrong in this file, and is now fixed

**The cascade cross-fade was not a partition of unity.** `kagCascadeWeight` derived its band
width from *each cascade's own extent*, so the two smoothsteps meeting at one split had
different widths. On the phone review configuration (2 cascades, splits 0.120 / 14.239 /
70.000 m, fov 46, aspect 2.164) the near cascade faded out over **1.694 m** while the far
cascade faded in over **6.691 m**. Two smoothsteps of different width do not sum to 1, and
`RE_Direct` is called once per cascade with `directLight.color *= … * kagW`, so the sum of
the weights *is* the fraction of the key the fragment receives.

### The number, before and after

Evaluated on the shipped code path — `LightingSystem` constructed against the review
camera (fov 46, aspect 844/390, near 0.12) at the review quality preset, `_build()` then
`frameShadows()` called, and the weights recomputed from the uniform the shader actually
reads. The harness is validated against the live rig: it returns `_sphereR[0] = 15.5717`,
identical to the value read back from the running page before the change
(`15.5717191696167`).

| | before | after |
|---|---|---|
| band at the split, near side | 1.694 m | 1.694 m |
| band at the split, far side | 6.691 m | **1.694 m** |
| max abs(sum of weights − 1), 0.12→70 m | **0.3253** | **0.000000** |
| sum of weights at 13.40 m | 1.2961 | **1.0000** |
| sum of weights at 14.572 m (the critic's own `lit` box) | **0.7949** | **1.0000** |
| sum of weights at 15.10 m | 0.7015 | **1.0000** |
| far cascade sphere radius | 75.7057 m | **72.2523 m** |
| far cascade texel | 0.09858 m | **0.09408 m** |

The depth of the critic's `lit` box is not assumed: a ray through PNG (900, 895) was cast
against the world in the running page and hit the heightfield at **14.572 m** of view
depth, with cascade weights `[0.2205, 0.5744]` — the sum the table records.

Where it lands on screen: on the flat plaza, view depth maps to PNG rows, and the affected
band 10.9–17.6 m is rows **854–979**, over-lit at 918–979 and under-lit at 854–918. The
critic's `lit` control box (880,880,40×30) sits inside the under-lit half.

### The prediction this makes about pixels

Stated before it was measured, so it can fail. On the plaza the total irradiance is
`key × Σw + fill`, with key 0.39603 and the ground-corrected fill 0.4993 (see the rim note
below). At the critic's `lit` box, `Σw` goes 0.7949 → 1.0000, so irradiance goes 0.8141 →
0.8953, **+10.0% linear**. Through the sRGB encode that is roughly +4% of a code value, so
the box should rise from luma **51.74** by about **+2**, and the over-lit half of the band
(PNG rows 918–979, `Σw` up to 1.2961) should *fall* by about the same. Outside rows
854–979 nothing may move at all: those depths were already a partition of unity.

### Why this is the right shape of fix

`RE_Direct` is linear in irradiance and is called once per cascade, so the sum of the
cascade weights is exactly the fraction of the key a fragment receives. Making the band a
property of the **split** rather than of the cascade means both neighbours fade across the
same two edges, so `wOut(i) + wIn(i+1) = (1 − S) + S` identically. The band is sized off the
*narrower* of the two neighbours so it can never run past either cascade's own coverage,
and the sphere padding follows the same per-split band — which is why the far cascade's
sphere shrinks 4.6% and its texels get correspondingly finer, for free.

`kagCascades` is now `vec4[]` (xy = the cascade's near/far, zw = the band at each of those
splits), so `kagBlendFrac` no longer reaches the shader; it stays as the CPU-side knob.
`_patchToken` moves `kagcsm1-*` → `kagcsm2-*` so a runtime tier change cannot reuse a
program compiled against the old `vec2` declaration. The padding entries stay
`MAX_CASCADES` long, now `Vector4(0, 1, 0.02, 0.02)` — non-zero bands so no smoothstep can
be handed equal edges — and every component was asserted finite (§5b).

---

## Not fixed, and why

**The umbra floor is genuinely below what this rig can explain, and it is not the cascade
code.** In a clean boot, the real cast-shadow pools around the plaza lanterns measure
**17.61 luma against 47.39** lit twenty pixels away — a display ratio of 0.372, where the
exposure floor is 0.557 — with `min 0` inside and `B−R −0.84`, i.e. neutral rather than
§5's cool `#4a6b8f`. That is the critic's symptom (b), reproducible, at coordinates the
critic did not sample. Round 15 already disproved "the cool fill is eaten" as a cascade or
AO problem and traced the level to the exposure ratio and the warm authored albedos; what
is left is a grade/AO question that spans `PostFX.js` and `Materials.js` and cannot be
settled from this file. I did not touch it, because the only lever `Lighting.js` has is to
raise the fill, and raising the fill is exactly what round 15 measured as already at budget
(52.9% of the illuminant). Filing it forward rather than guessing.

**`ambientReport.rim` overstates the rim on the ground by 2.77×.** It reports
`intensity × luminance = 0.14818`, i.e. the irradiance on a surface facing the light. The
rim is placed at `camDir·16 + side·7 + (0,6,0)` from its target, which for the `hero` pose
is 21.2° above horizontal, so a horizontal plaza actually receives `0.14818 × 0.361 =
0.05348`. The stated fill of 0.5937 is therefore 0.4993 on the ground and the shadow floor
is 0.557, not 0.600. I left the field alone rather than ship an unmeasured line mid-round —
HANDOFF already carries one of those from round 16 — but the next owner of this file should
add the ground-projected figure alongside it. The correction does not change any conclusion
above; both floors are far above the measured 0.172.

**The build's real terminators are not stepped.** Measured on the clean boot at the plaza
lantern shadow pools (33 scanlines, rows 990–1060, 10–90% of the local step): median
terminator width **14 PNG px** (7.5 render px), p10 3, p90 17. The wedge's transition, by
contrast, is 0 px — a hard step from ~55 to ~1 with no intermediate value. That difference
alone says the wedge is not produced by the same code path as the shadows around it.

**The critic's two acceptance targets are unreachable as written**, because both describe
the transient wedge. (a) asks for the same edge scan to show no run longer than 2 rows and
no jump over 3 columns; in a clean boot that scan finds no edge at all — the first pixel
below luma 6 from x=850 rightward does not occur until x≈1420, on unrelated geometry.
(b) asks the box at (770,880) to reach luma ≥18 with B−R ≥ +4; in a clean boot it already
reads luma **34.91**, but B−R **−11.24**, because that box is the warm cedar top of a fence
post 5.5 m away, not shaded flagstone. Re-file both against a region that exists in the
build.

---

## How every number above was produced

All probes live in the session scratchpad and are deliberately not committed.

- **Committed-frame statistics** (the critic's boxes, the edge run sequence, the coverage
  percentages, the wedge's connected component and centreline fit, the phase-lock test):
  `node tools/probe.mjs px shots/phone-hero-r17.png 770,880,40,30` and a private
  `edge.mjs` decoder over the same PNG. The two agree to the digit, which is the check that
  the decoder is not the round-7 stride bug again.
- **Clean-boot frames**: a single-boot Playwright probe (`rig.mjs`, later `rig5.mjs`)
  against a vite dev server, phone profile 844×390 @ dsf 3, `?autostart&q=medium&capture`,
  `__kagerouStart()` and `menus.skipIntro()` in *separate* evaluates, HUD hidden, petals
  preset, then `debugCam('hero')`. Screenshots at native 2532×1170; per-case box readings
  taken with `gl.readPixels` inside a wrapper around `pipeline.render` so no
  `page.screenshot` is needed (one screenshot costs 60–300 s under SwiftShader and a
  300 s timeout lost an earlier ablation set).
- **Ablations** are applied by wrapping `lighting.update` on the live instance from the
  page. Nothing test-only was added to the shipped source (ARCHITECTURE §5c).
- **Live rig state** (`ambientReport`, splits, sphere radii, PCSS uniforms, cascade weights,
  the shadow-texel footprint in the light's own basis, and the raycast depths of the
  critic's boxes) is read out of the running page.
- **The split/band arithmetic** is checked twice: once by re-deriving the shipped formula in
  isolation, and once by constructing `LightingSystem` in node against the review camera and
  reading `_u.kagCascades` — the path the shader actually receives.
