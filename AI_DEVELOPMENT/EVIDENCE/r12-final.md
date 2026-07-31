# Rounds 10–12 verified checkpoint

## Outcome

- Round 10: product gate remained FAIL; destructive shadow-filter and global-toe candidates
  were rejected, and the edge verifier was hardened against vacuous all-null passes.
- Round 11: lantern receiver placement, winding, blend, and surface anchoring were repaired;
  the fixed hero near/far contribution moved from 1.121x to 2.394x.
- Round 12: the local paper emissive source restored hero p99.9 from 232 to 236, and the
  softened multi-ring receiver passed stopped-frame A/B and independent inspection.
- Overall product verdict: **FAIL**. Fill, sky, sakura, far-range structure, terrain/foliage,
  and authored layout remain below the standing bar. Round 13 was not started.

## Coherent R12V1 evidence

- Build fingerprint: `2ed3080cb67cb25e2962dd03dbf01ca68c34ffa0896c8c233c2276f8d224030f`
- Five fresh phone/MEDIUM frames, 2532x1170; no page or linked-shader errors.
- Worst budgets: 119 draw calls; 767,124 triangles; 314.45 KB gzip main chunk.
- p0.1 hero/wide/torii/valley/sun: 0 / 12 / 0 / 0 / 6.
- p99.9 hero/wide/torii/valley/sun: 236 / 220 / 251 / 236 / 253.
- Capture report SHA-256: `989c9c70010913ef41e4c0cedf11d3ea575690e5a06d48a2ab5ba274c8af0cbb`.

## Stopped-frame lantern A/B

- 24/24 pools; clearance 0.012–0.1598 m; tilt 0; normal Y 1; additive; opacity 0.38; depth write off.
- Changed coverage 4.226%; strong coverage 1.916%; tail/core coverage 2.206.
- 99.336% positive and 0.664% negative changed pixels; mean luma delta +22.53.
- Warm RGB delta: +38.44 / +19.18 / +8.83; changes begin at y=61.8% of the frame.

## Known limitations

`verify-r9` still reports fill, legacy shadow-edge scan, sky, sakura hue, and far range as
failed; valley is blocked by stale camera-era probes. The source-blind review independently
confirms that the catastrophic staircase is gone but the full premium visual target is not met.
No real iPhone or mid-range Android frame-rate measurement was available.

## Remote integration and publication

- The verified Rounds 10–12 checkpoint was integrated through
  [PR #1](https://github.com/bachikoljunior-blip/game2/pull/1). Publication repairs were
  integrated through [PR #2](https://github.com/bachikoljunior-blip/game2/pull/2),
  [PR #3](https://github.com/bachikoljunior-blip/game2/pull/3), and
  [PR #4](https://github.com/bachikoljunior-blip/game2/pull/4).
- Verified publication branch: `bc598850ee34b4c5624f12f066f0b1692978ee5f`.
- Verified publication-bearing `main`: `025a079428e4374e8d8fc6912b1f858673228252`.
- Canonical URL: https://bachikoljunior-blip.github.io/game2/; production runtime:
  https://bachikoljunior-blip.github.io/game2/docs/.
- A real browser followed the root redirect, loaded
  `docs/assets/index-B3Qct5lc.js`, reached `bootStatus=ready` and a running engine, and
  reported zero page errors, console errors, request failures, or bad HTTP responses.
- The first public render returned HTTP 200 but referenced a missing development module.
  A later repair still made an aborted speculative module request. Both were rejected;
  publication was accepted only after root made no module request before redirecting.
- Machine-readable evidence: `AI_DEVELOPMENT/EVIDENCE/pages-verification.json`.
