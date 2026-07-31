# R12V1 source-blind five-frame review

- Date: 2026-07-31
- Surface: coherent phone/MEDIUM `r12v1`, five native 2532x1170 frames
- Isolation: reviewer did not inspect source, tools, git history, or implementer notes; the
  reviewer had previously judged `r9v1`, so the pass was source-blind but not prior-review-blind.
- Verdict: **FAIL overall, with the Round 10–12 target repairs confirmed.**

## Confirmed progress

- The catastrophic stepped diagonal shadow previously visible in the hero frame is gone.
- Hero lantern receiver luma is 92.86 near and 38.83 far: **2.394x**, from **1.121x**.
- Hero p99.9 is **236**, from **232**; the below-luma-16 population fell from 10.462% to 8.281%.
- The coherent set has no carried frames and remains within 119 draw calls and 767,124 triangles.

## Remaining blockers and major defects

- General shadow fill is not confirmed: unaffected dark regions changed negligibly.
- Lantern pools still repeat visibly as similarly shaped orange decals across the authored row.
- The anti-solar sky remains flat and nearly unchanged (hero clean-sky saturation 0.04664 to 0.04669).
- Mountains retain synthetic high-frequency texture and paper-like distant forms.
- Foliage/card breakup and procedural placement remain conspicuous; valley lacks a mid-ground subject.
- Sun framing remains a merged white-yellow mass; above-240 pixels rose from 3.221% to 3.657%.

This is a still-frame result only. It does not verify motion, shimmer, interaction, or real-device performance.
