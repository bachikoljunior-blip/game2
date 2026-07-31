# Round 14 measured iteration

## Outcome

- Opening source-blind review: **FAIL, 44/100**, with one blocker and two majors.
- Final source-blind review: **FAIL, 50/100**, with one blocker and two majors (**+6**).
- The bounded sun-aureole repair removed the broad-glare major finding. In the critic's
  fixed 700x700 sun region, pixels above 90% luma fell from **186,748 / 490,000
  (38.112%)** to **55,519 / 490,000 (11.330%)**, passing the `<15%` target while the
  compact white source and all established tone gates remained intact.
- Bamboo-card collar removal produced only a modest detector improvement and did not clear
  the blocker. A second leaf-angle hypothesis did not improve the saved output and was
  explicitly reverted.
- Terrain near detail was preserved, but distant high-frequency energy and broad-zone
  visibility missed their targets. The final reviewer retained terrain scale as a major
  finding and identified sparse, repetitive courtyard dressing as the other major.

## Coherent final evidence

- Tag: `r14final`; revision: `5428d169ca2a`; build fingerprint: `6693aa477479`.
- Five fresh phone/MEDIUM frames at 2532x1170; capture-report gate passed with no page or
  linked-dead-shader failure.
- Worst budgets: **119 draw calls** and **776,373 triangles**; main chunk **314.83 kB gzip**.
- p0.1 hero/wide/torii/valley/sun: **0 / 12 / 0 / 1 / 6**.
- p99.9 hero/wide/torii/valley/sun: **236 / 219 / 250 / 233 / 245**. Hero and torii retain
  the strict `>235` white gate.
- The retained Round 9 verifier still passes the lantern criterion; fill, legacy shadow
  edge, sky, sakura hue, and far range fail, while valley remains blocked by stale probes.

## Falsified and bounded findings

### Foliage

The native detached-component detector moved as follows from `r14base` to `r14final`:

| shot | all 2-18 px components | >=4 px components | result |
|---|---:|---:|---|
| valley | 486 -> 419 (-13.79%) | 350 -> 291 (-16.86%) | blocker remains |
| wide | 36 -> 32 (-11.11%) | 9 -> 11 (+22.22%) | longer population worsened |

Removing card node collars therefore narrowed one contributor but did not prove the
dominant source. Tightening spray-leaf angles was tested in a targeted `r14f2` capture;
counts changed from 433 to 445 in valley and 32 to 33 in wide, so commits `5875b77` and
`5428d16` preserve the rejected experiment and its explicit revert.

### Terrain

In the identical native wide-frame ground bands, mean absolute luminance Laplacian changed
**+3.0% near**, **+1.2% mid**, and **-11.0% far**. The near-preservation target passed, but
the requested distant halving failed. Detrended 64-128 px block statistics showed no robust
new broad-zone separation. The retained range gate is bounded and non-regressing, but the
Round 14 terrain objective remains unmet.

## Known limitations

The visual verdict remains FAIL. The detached bamboo skyline is still blocking; terrain
scale and courtyard specificity remain major findings. SwiftShader draw/triangle evidence
is not real iPhone or mid-range Android 60 fps evidence. Round 15 was not activated.
