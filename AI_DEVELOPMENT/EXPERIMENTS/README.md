# Experiments

Create one record per isolated, hypothesis-driven comparison. Include candidate lineage,
changed variables, baseline, target, diversity dimensions, cost, results, retained/rejected
reason, and the exact production revalidation still required. Do not experiment directly on
production code without a reversible isolation mechanism.

## EXP-R10-001 — Far-cascade PCF radius

- Baseline: `r9v1`, hero edge repeats 9 rows and jumps 22 px; visible black staircase.
- Candidate: change only the non-near PCF radius from 1.4 to 4.0 texels.
- Evidence: `r9shadow4` targeted hero capture; build and runtime budgets passed.
- Result: the `<8` contour disappeared and transition width changed 19 → 9 px, but native
  inspection showed the cast boundary itself had been erased rather than resolved.
- Decision: rejected. Restore radius 1.4 and test higher middle-cascade density instead.

## EXP-R10-002 — Third MEDIUM cascade at the existing split distribution

- Candidate: MEDIUM `shadowCascades` 2 → 3 at the existing 1536 map size.
- Evidence: `r9csm3` targeted hero capture.
- Result: the exact edge sequence was unchanged (9-row repeat, 22 px jump, 19 px
  transition). The tested 25-31 m pixels remained beyond the new ~23.5 m middle split.
  Submitted work rose from 739,948 to 893,985 triangles in hero, leaving only 6,015 of
  the 900k budget before testing the historically heavier poses.
- Decision: rejected. The unchanged edge and 154,037-triangle cost do not justify
  retuning the split distribution on this MEDIUM budget.

## EXP-R10-003 — Intermediate far-PCF radius

- Candidate: non-near PCF radius 1.4 → 2.4 texels, between baseline and the rejected
  4.0-texel candidate.
- Evidence: `r9shadow24` targeted hero capture.
- Result: the sparse eight-tap disk became fully occluded across the test crop; the
  staircase was replaced by an almost black block and the edge detector repeated x=880
  for all 31 rows. This exposes a non-monotonic sparse-sampling regime, not a usable blur.
- Decision: rejected. Restore 1.4 and test sub-texel edge decorrelation without changing
  the world-space shadow footprint.

## EXP-R10-004 — Far-map sub-texel decorrelation

- Candidate: translate the far-cascade disk centre by a stable 0.65 texel screen-space
  sequence; retain the 1.4-texel footprint and two cascades.
- Evidence: `r9shadowjit` targeted hero capture.
- Result: the thin blocker dropped out of every sample and the boundary disappeared.
  This confirms the caster is under-resolved in the far map; decorrelation cannot recover
  geometry that is narrower than one reliable shadow texel.
- Decision: rejected. Test a three-cascade distribution whose middle split actually
  contains the full measured edge, then price that result against the submitted-work cap.

## EXP-R10-005 — Three cascades with a measured 31.8 m middle split

- Candidate: three MEDIUM cascades and lambda 0.50, preserving a ~13.8 m near split and
  moving the middle split past the full 25-31 m receiver range.
- Evidence: `r9csm3b` targeted hero capture.
- Result: the contour again disappeared rather than resolving; hero remained at 893,985
  submitted triangles. More density did not produce a stable thin-caster shadow and the
  cost leaves no safe margin for heavier poses.
- Decision: rejected. Restore the two-cascade budget and make sparse far filtering
  monotonic by preserving a weighted centre sample.

## EXP-R10-006 — Wide far filter plus weighted centre

- Candidate: return to two cascades, use a four-texel far disk, and add a two-vote exact
  centre sample so a thin caster cannot be skipped by every Vogel tap.
- Evidence: `r9shadow4c` targeted hero capture and source-blind before/after review.
- Result: the automated darkest-contour gate passed, but the full frame and crop showed
  essentially uniform lit paving where a lower-contrast shrine shadow should remain.
  The independent reviewer judged it cleaner but still FAIL: necessary grounding was
  deleted while nearby lanterns retained their shadows.
- Decision: rejected. Restore the original filter. The staircase blocker remains open;
  no candidate may pass by deleting the expected cast structure.

## EXP-R10-007 — Lower global filmic toe

- Candidate: `filmicToe` 1.05 → 0.90 after live ablations showed that ambient and lift
  were not sufficiently differential.
- Evidence: `r9toe` isolated hero capture; `r10` coherent five-shot regression capture.
- Result: hero shade moved from 7.46 to 9.61 luma, detail 3.50 → 3.85 and lit ratio
  0.124 → 0.147. It still missed detail >=6 and ratio >=0.18. More importantly,
  `wide` p0.1 moved 12 → 17 and failed the mandatory all-frame black gate (<15).
- Decision: rejected. Restore 1.05. The fill repair must be local to the receiver/material
  path or accompanied by a better resolution strategy, not another global curve move.

## EXP-R11-008 — One-ring additive lantern receiver

- Baseline: the embedded receiver was buried/tilted, downward-facing, and darkened the
  ground under normal alpha blending.
- Candidate: separate horizontal upward-facing additive pools, radius 1.15 m, opacity 0.42,
  with one centre-to-rim ring.
- Evidence: coherent `r11v1`, stopped-frame `r10poolab2`, and source-blind wide/hero review.
- Result: causality and the near/far product metric passed, but the reviewer found repeated
  saturated orange discs with flat interiors and readable perimeters. The revised soft-shape
  gate also rejects it: 2.475% changed coverage and tail/core 1.374.
- Decision: rejected. Preserve the surface-placement and blend fix; replace only the light
  field geometry/variation.

## EXP-R12-009 — Multi-ring varied lantern receiver

- Parent: EXP-R11-008.
- Candidate: six radial falloff rings with a zero-energy tail, 1.50 m outer radius, opacity
  0.38, plus deterministic per-lantern size, anisotropy, strength, and warmth variation.
- Evidence: stopped-frame `r12ab`, coherent `r12v1`, `r12v1-metrics.json`, and
  `r12v1-lantern-blind-review.md`.
- Result: 4.226% changed coverage, 1.916% strong coverage, tail/core 2.206, 99.336%
  positive changed pixels, +22.53 mean luma, product near/far 2.394, and no tone/performance
  regression. The source-blind reviewer passed the perimeter-free falloff and retained
  paving/base contact.
- Decision: retained and verified for the lantern criterion. Full Round 9 acceptance remains
  open on unrelated findings.
