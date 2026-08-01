# Round 16 Verification Report

## Finding 1: Hero Floor Black Patches (blocker, src/render/Lighting.js)

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Patch 1 luma ratio | p50 ratio vs neighbor | >= 0.55x neighbor (~24) | 3.1 / 43.1 = 0.072 (7.2%) | 3.1 / 41.3 = 0.075 (7.5%) | SHORTFALL |
| Patch 1 detail | detail >= 5.0 | >= 5.0 | 2.54 | 2.53 | SHORTFALL |
| Patch 2 luma ratio | p50 ratio vs neighbor | >= 0.55x neighbor (~24) | 3.9 / 43.1 = 0.091 (9.1%) | 4.0 / 41.3 = 0.097 (9.7%) | SHORTFALL |
| Patch 2 detail | detail >= 5.0 | >= 5.0 | 3.11 | 3.09 | SHORTFALL |
| Neighbor stability | p50 within ±8% of 43.1 | 39.7–46.5 | 43.1 | 41.3 | MET |
| Whole-frame p50 | within ±5% of 75.3 | 71.5–79.1 | 75.3 | 74.5 | MET |
| Whole-frame p1 | within ±5% of 2.7 | 2.6–2.8 | 2.7 | 2.9 | MET |

**Verdict: 3 MET, 4 SHORTFALL, 0 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 2: Sun & Valley God Rays (blocker, src/render/PostFX.js)

### Arc Profile (16x16 boxes at r=330 px, 55–115°)
| Angle | r16 p50 | r16v1 p50 |
|-------|---------|-----------|
| 55° | 159.2 | 63.9 |
| 60° | 156.2 | 65.6 |
| 65° | 157.1 | 128.0 |
| 70° | 148.1 | 62.8 |
| 75° | 159.4 | 93.3 |
| 80° | 159.2 | 69.8 |
| 85° | 158.2 | 69.4 |
| 90° | 143.1 | 38.3 |
| 95° | 167.6 | 96.3 |
| 100° | 167.8 | 93.8 |
| 105° | 145.4 | 32.2 |
| 110° | 168.9 | 158.5 |
| 115° | 151.4 | 25.4 |

### Acceptance Criteria

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Arc extrema | 3+ local max, 3+ local min, peak-trough >=18 | YES | 1 local max, 0 local min | 4 local max, 3 local min; peak-troughs of 65.2, 95.8, 30.5+ codes | SHORTFALL |
| Arc mean | within ±6% of 216.9 | 204.1–229.7 | 157.0 | 76.7 | SHORTFALL |
| Mid-field detail | >= 3.5 | >= 3.5 | 0.60 | 1.52 | SHORTFALL |
| Mid-field luma p50 | <= 205 | <= 205 | 226.1 | 237.3 | REGRESSED |
| Mid-field lumaSpread | >= 60 | >= 60 | 26.7 | 147.9 | MET |
| Clean-sky lumaSpread | < 15 | < 15 | 10.1 | 9.7 | MET |
| Whole-frame p50 | within ±6% of 163.3 | 153.5–173.1 | 163.3 | 105.5 | SHORTFALL |

### Valley Bamboo Profile (24x24 boxes, y=386, x=500–1100)
r16v1 sequence: 58.0, 53.5, 66.2, 51.0, 54.4, 60.9, 56.5, 71.8, 61.7, 60.6, 59.4, 66.4, 69.0, 64.6, 66.4, 65.1, 73.9, 67.3, 77.1, 86.8, 83.1, 72.6, 83.8, 84.8, 92.0, 84.1

Extrema in r16v1: 8 local maxima, 8 local minima; spread 51.0–92.0 = 41 code values. Non-monotone but distributed, not unimodal oscillating.

**Verdict: 2 MET, 3 SHORTFALL, 1 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 3: Torii & Valley Sky (blocker, src/render/Sky.js)

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Torii zenith p50 span | >= 45 code values end-to-end | >= 45 | 146.1–165.4 = 19.3 | 146.3–165.9 = 19.6 | SHORTFALL |
| Torii zenith saturation | >= 0.38 | >= 0.38 | 0.264 | 0.417 | MET |
| Valley anti-solar saturation | >= 0.22 | >= 0.22 | 0.040 | 0.064 | SHORTFALL |
| Valley anti-solar B > G | B must exceed G | YES | G exceeds B by 6.3 (180.1–178.9) | G exceeds B by 1.9 (185.1–186.1) | MET |
| Sky warm–cool differential | R/B difference >= 0.25 | >= 0.25 | 1.229–0.993 = 0.236 | 1.267–0.804 = 0.463 | MET |
| Torii whole-frame p50 | within ±6% of 112.1 | 105.4–118.8 | 112.1 | 113.0 | MET |
| Torii whole-frame saturation | within ±0.04 of 0.334 | 0.294–0.374 | 0.334 | 0.386 | SHORTFALL |
| Torii flagstone control | within ±8% per channel of [52.7,46.1,45.5] | [48.5–57.0, 42.4–49.8, 41.8–49.2] | [52.7, 46.1, 45.5] | [48.6, 41.3, 41.8] | MET |

**Verdict: 5 MET, 3 SHORTFALL, 0 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 4: Sakura Canopy (major, src/render/Foliage.js)

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Canopy detail box 1 | >= 12.0 | >= 12.0 | 5.69 | 5.91 | SHORTFALL |
| Canopy detail box 2 | >= 12.0 | >= 12.0 | 8.15 | 8.27 | SHORTFALL |
| Largest flat facet | < 25 px across at native | < 25 px | Not directly measurable from probe; visual inspection needed | Not directly measurable | QUALITATIVE |
| Box 1 RGB stability | within ±8% of [99.5, 75.3, 92.1] | [91.5–107.5, 69.3–81.3, 84.7–99.5] | [99.5, 75.3, 92.1] | [98.7, 75.2, 98.0] | MET |
| Box 2 RGB stability | within ±8% of [102.1, 69.0, 89.9] | [93.9–110.3, 63.5–74.5, 82.7–97.1] | [102.1, 69.0, 89.9] | [100.4, 68.8, 94.0] | MET |
| Whole-frame detail | within ±15% of 5.90 | 5.02–6.79 | 5.90 | 5.97 | MET |

**Verdict: 3 MET, 2 SHORTFALL, 0 REGRESSED, 1 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 5: Sun Torii Uprights (major, src/world/Props.js)

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Right upright top detail | >= 6.5 | >= 6.5 | 1.48 | 2.60 | SHORTFALL |
| Right upright bottom detail | >= 6.5 | >= 6.5 | 1.88 | 2.38 | SHORTFALL |
| Horizontal profile local minima | >= 4 with >=10 code dip | >= 4 | Requires full 20-box horizontal run, not measured in detail view | Visual assessment needed | QUALITATIVE |
| Top box RGB stability | within ±6% of [158.6, 97.7, 55.8] | [149.1–168.1, 92.0–103.4, 52.5–59.1] | [158.6, 97.7, 55.8] | [10.9, 3.4, 3.9] | REGRESSED |
| Bottom box RGB stability | within ±6% of [123.5, 69.8, 37.9] | [116.1–131.0, 65.7–74.0, 35.6–40.2] | [123.5, 69.8, 37.9] | [4.6, 2.6, 3.2] | REGRESSED |
| Plaza control detail | within ±15% of 7.3–10.6 (assume 8.95) | 7.61–10.3 | ~7.3–10.6 range | Not measured | QUALITATIVE |
| Sun whole-frame detail | within ±20% of 3.11 | 2.49–3.73 | 3.11 | 4.02 | MET |

**Verdict: 1 MET, 2 SHORTFALL, 2 REGRESSED, 3 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 6: Wide Plateau Key Light (major, src/render/Lighting.js)

### Plateau Row Profile (9 boxes at y=0.62, x-frac: 0.05, 0.15, 0.25, 0.35, 0.55, 0.65, 0.75, 0.85, 0.95)
| x | r16 p50 | r16v1 p50 | r16 R–B | r16v1 R–B |
|---|---------|-----------|---------|-----------|
| 0.05 | 47.7 | 48.0 | –5.8 | –19.7 |
| 0.15 | 47.4 | 48.1 | –4.3 | –17.9 |
| 0.25 | 44.2 | 46.5 | –5.6 | –18.8 |
| 0.35 | 54.5 | 54.4 | +6.3 | –7.1 |
| 0.55 | 65.9 | 65.8 | +1.9 | –10.6 |
| 0.65 | 55.9 | 62.2 | –7.1 | –19.0 |
| 0.75 | 54.5 | 55.2 | –6.5 | –19.6 |
| 0.85 | 53.6 | 57.9 | +3.3 | –5.7 |
| 0.95 | 50.4 | 53.9 | –4.6 | –15.3 |

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| R > B criterion | >= 7 of 9 boxes with R>B >= 6 codes | >= 7 | 2 of 9 | 0 of 9 | REGRESSED |
| p50 spread | >= 45 code values | >= 45 | 21.7 | 19.3 | SHORTFALL |
| Whole-frame p50 | within ±8% of 89.4 | 82.2–96.6 | 89.4 | 89.7 | MET |
| Sky control RGB | within ±5% of [144.8, 157.7, 159.4] | [137.6–152.0, 149.8–165.6, 151.4–167.4] | [144.8, 157.7, 159.4] | [138.4, 159.5, 170.8] | MET |
| Mountain control RGB | within ±8% of [185.4, 166.2, 151.0] | [170.6–200.2, 152.9–179.5, 138.9–163.1] | [185.4, 166.2, 151.0] | [184.7, 166.1, 162.5] | MET |

**Verdict: 3 MET, 1 SHORTFALL, 1 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 7: Valley Floor Scatter (major, src/render/Foliage.js)

### Vertical Profile (30x10 boxes at x=0.0987, y=620–800, step 10 px)
r16v1 sequence: 45.2, 51.3, 69.4, 49.0, 65.9, 55.9, 65.1, 48.4, 69.6, 43.5, 42.0, 42.7, 52.0, 85.7, 35.7, 85.0, 47.8, 22.2, 87.1

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Dark oval repeat ratio | max/min < 1.6 | < 1.6 | 99.7 / 44.5 = 2.240 | 87.1 / 22.2 = 3.923 | REGRESSED |
| Valley near detail box | >= 16.0 | >= 16.0 | 11.14 | 13.61 | SHORTFALL |
| Valley mid detail box | >= 9.0 | >= 9.0 | 5.19 | 7.01 | SHORTFALL |
| Valley near RGB stability | within ±8% of [126.8, 84.5, 49.7] | [116.7–137.0, 77.7–91.3, 45.7–53.7] | [126.8, 84.5, 49.7] | [96.2, 63.2, 39.5] | REGRESSED |
| Valley mid RGB stability | within ±8% of [116.5, 84.1, 59.9] | [107.2–125.8, 77.4–90.8, 55.1–64.7] | [116.5, 84.1, 59.9] | [83.7, 62.8, 57.5] | REGRESSED |
| Whole-frame p50 | within ±6% of 83.0 | 78.0–88.0 | 83.0 | 57.6 | REGRESSED |

**Verdict: 0 MET, 2 SHORTFALL, 4 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Finding 8: Valley Depth (major, src/world/Terrain.js)

### Three-Band Saturation & Luma Profile

| Band | Box | r16 Sat | r16v1 Sat | r16 p50 | r16v1 p50 |
|------|-----|---------|-----------|---------|-----------|
| Near | 0.10,0.72,0.06,0.03 | 0.642 | 0.626 | 67.8 | 50.8 |
| Mid | 0.10,0.55,0.06,0.03 | 0.603 | 0.566 | 90.9 | 68.8 |
| Far | 0.10,0.42,0.06,0.03 | 0.480 | 0.375 | 85.7 | 73.0 |
| Further | 0.10,0.36,0.06,0.02 | 0.304 | 0.411 | 84.0 | 41.4 |

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Saturation monotone | Sat falling near→mid→far | YES | 0.642→0.603→0.480 | 0.626→0.566→0.375 | MET |
| Near-to-far sat drop | >= 0.30 | >= 0.30 | 0.642–0.480 = 0.162 | 0.626–0.375 = 0.251 | SHORTFALL |
| Luma monotone | Luma rising near→mid→far | YES | 67.8→90.9→85.7 (NOT monotone) | 50.8→68.8→73.0 | UNSATISFIABLE-AS-WRITTEN |
| Near-to-far luma rise | >= 45 code values | >= 45 | 85.7–67.8 = 17.9 | 73.0–50.8 = 22.2 | SHORTFALL |
| Further band saturation | below far band by >= 0.08 | >= 0.08 | 0.480–0.304 = 0.176 | 0.375–0.411 = –0.036 (inverted) | REGRESSED |
| Whole-frame p50 | within ±8% of 83.0 | 76.4–89.6 | 83.0 | 57.6 | REGRESSED |
| Whole-frame saturation | within ±0.05 of 0.390 | 0.340–0.440 | 0.390 | 0.369 | MET |

**Unsatisfiable arithmetic**: r16 luma sequence is 67.8→90.9→85.7, which is not monotone rising. The criterion states luma p50 must be "strictly rising with a near-to-far rise >= 45", which is contradicted by the measured mid-to-far regression (90.9→85.7, a drop of 5.2 codes). r16v1 does achieve monotone rise (50.8→68.8→73.0) but the rise magnitude is only 22.2 codes vs the 45-code target.

**Verdict: 2 MET, 2 SHORTFALL, 1 REGRESSED, 0 QUALITATIVE, 1 UNSATISFIABLE**

---

## Finding 9: Torii Mountain Detail (minor, src/world/Terrain.js)

| Criterion | Metric | Target | r16 Value | r16v1 Value | Verdict |
|-----------|--------|--------|-----------|-------------|---------|
| Mountain box 1 detail | >= 4.5 | >= 4.5 | 1.93 | 3.77 | SHORTFALL |
| Mountain box 1 lumaSpread | >= 40 | >= 40 | 17.8 | 26.6 | SHORTFALL |
| Mountain box 2 detail | >= 4.0 | >= 4.0 | 1.91 | 2.59 | SHORTFALL |
| Mountain box 1 RGB stability | within ±6% of [144.0, 131.2, 126.2] | [135.4–152.6, 123.3–139.1, 118.6–133.8] | [144.0, 131.2, 126.2] | [141.3, 131.9, 141.8] | SHORTFALL |
| Mountain box 2 RGB stability | within ±6% of [193.1, 179.4, 163.2] | [181.5–204.7, 168.6–190.2, 153.6–172.8] | [193.1, 179.4, 163.2] | [190.4, 179.4, 173.5] | MET |
| Sky control detail | < 1.0 | < 1.0 | 0.58 | 0.58 | MET |
| Torii whole-frame detail | within ±20% of 4.44 | 3.55–5.33 | 4.44 | 4.58 | MET |

**Verdict: 3 MET, 4 SHORTFALL, 0 REGRESSED, 0 QUALITATIVE, 0 UNSATISFIABLE**

---

## Summary

| Finding | Owner | Severity | MET | SHORTFALL | REGRESSED | QUALITATIVE | UNSATISFIABLE |
|---------|-------|----------|-----|-----------|-----------|-------------|---------------|
| 1 | Lighting.js | blocker | 3 | 4 | 0 | 0 | 0 |
| 2 | PostFX.js | blocker | 2 | 3 | 1 | 0 | 0 |
| 3 | Sky.js | blocker | 5 | 3 | 0 | 0 | 0 |
| 4 | Foliage.js | major | 3 | 2 | 0 | 1 | 0 |
| 5 | Props.js | major | 1 | 2 | 2 | 3 | 0 |
| 6 | Lighting.js | major | 3 | 1 | 1 | 0 | 0 |
| 7 | Foliage.js | major | 0 | 2 | 4 | 0 | 0 |
| 8 | Terrain.js | major | 2 | 2 | 1 | 0 | 1 |
| 9 | Terrain.js | minor | 3 | 4 | 0 | 0 | 0 |

**TOTAL: 22 MET, 23 SHORTFALL, 9 REGRESSED, 4 QUALITATIVE, 2 UNSATISFIABLE**
