# Round 13 measured iteration

## Outcome

- Opening source-blind review: **FAIL, 36/100**, with two blockers and two majors.
- Final source-blind review: **FAIL, 43/100**, with one blocker and four majors.
- The bamboo skyline and terrain scale hierarchy visibly improved; the approach dressing
  improved only marginally and the hero material distinction remained insufficient.
- The remaining blocker is detached bamboo-card skyline fragments across valley, sun, and
  wide. Ground zoning, sun-glare control, hero materials, and authored composition remain
  major findings.

## Coherent R13V2 evidence

- Revision: `1a526e95604c`; build fingerprint: `e9cc3d6fd116`.
- Five fresh phone/MEDIUM frames, 2532x1170; no page or linked-shader errors.
- Worst budgets: 119 draw calls; 776,373 triangles; main chunk 314.25 kB gzip.
- p0.1 hero/wide/torii/valley/sun: 0 / 10 / 0 / 1 / 6.
- p99.9 hero/wide/torii/valley/sun: 236 / 217 / 250 / 236 / 252.
- Lantern near/far remained verified at 2.390x.

## Rejected intermediate

The first paper-emissive lattice candidate reduced hero p99.9 from 237 to exactly 235 and
failed the strict `>235` gate. Its attenuation floor was bounded from 0.68 to 0.80 at the
authored paper source; a targeted hero probe then passed at 236 and the full coherent r13v2
set confirmed the repair. No global tone control was moved.

## Known limitations

`verify-r9` still fails fill, the legacy shadow-edge scan, sky, sakura hue, and far-range
structure; valley remains blocked by stale camera-era probes. The visual verdict remains
FAIL. SwiftShader budgets are not real iPhone or mid-range Android frame-rate evidence.
