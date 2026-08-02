# KIT-VARIANCE arm 1 — the review rig's own noise floor

Measured 2026-08-02 on `claude/ongoing-session-continuation-549b4z`.
Apparatus: `tools/variance.mjs --collect` then `--analyse`. Raw numbers in `kit-variance.json`.

Eight `--review --profile=phone` captures against one frozen build (`bfddbfad8eb8`, 8 files,
digest re-read before every run and unchanged throughout), collected as two batches of four,
batch B being the no-change control arm. 7 m 30 s per run, ~62 minutes total, no run failed and
no shot was carried forward.

## The result in one line

**This rig is aggregate-stable and pixel-unstable, and it does not drift between batches.**

## What that means, in the order it has to be read

**1. 65 of 80 published cells never moved across all eight runs.** Every luma percentile
(`p01` `p1` `p10` `p25` `p50` `p75` `p90` `p99` `p999`), `iqr`, and both renderer counters
(`drawCalls`, `triangles`) are identical in all eight runs on all five shots. Only the four
`pct*` fields moved at all, and the widest cell in the whole table — `valley.pctWarm` — has a
range of **0.014 percentage points**.

**Read alone, that number is false advertising**, which is why `--analyse` will not print it
without the next paragraph.

**2. The frames are not the same frames.** Compared as images, two runs of this one unchanged
build differ on:

| shot | changed px (within batch) | changed px (cross batch) | mean channel Δ | peak Δ | distinct frames |
|---|---|---|---|---|---|
| `valley` | **11.391%** | 9.842% | 0.7031 | 365 | 7/8 |
| `hero` | 4.220% | 3.637% | 0.1330 | 388 | 7/8 |
| `sun` | 2.930% | 2.516% | 0.0764 | 216 | 7/8 |
| `wide` | 2.346% | 2.038% | 0.0577 | 203 | 7/8 |
| `torii` | 2.088% | 1.795% | 0.0505 | 206 | 8/8 |

Peak Δ is the summed |R|+|G|+|B| difference on the worst single pixel, against a 765 maximum.
A ninth of `valley` repaints between two runs of a build that did not change, and not one
published percentile notices.

**3. The obvious explanation is wrong, and was disproved rather than assumed.** The natural
hypothesis is that the percentiles are integers on a 0-255 scale and simply round the
difference away. Recomputed at full float resolution with no rounding at any step, the
percentiles still barely move: `valley.p50` spans 0.0040 and `valley.p999` spans **exactly
0.0000** across all eight runs; the widest float spread anywhere in the set is `sun.p50` at
0.0358. The distribution genuinely reproduces. What varies is *which* pixels carry a value,
not how many carry it — the differences cancel almost perfectly in aggregate. Quantisation is
not the mechanism and must not be cited as one.

**4. There is no batch drift here.** Three independent reads agree:

- cross-batch pixel difference is *lower* than within-batch on **5 of 5** shots;
- **0 of 15** moving cells put the true batch cut at or above the 90th percentile of their own
  70-split null;
- the largest batch shift in any cell is 0.0033 pp, against a within-batch range of 0.011 pp in
  the same cell.

`survival`'s vantage rig drifts +16.9 between collection batches. **That does not transfer to
this rig, and the borrowed number must not be quoted about game2.** The method was worth
borrowing; the measurement was not, and this is the disproof.

The 68-of-70 structural blindness is nonetheless confirmed as a *property of the technique* on
our own data: with 4+4 runs, `C(8,4) = 70` and exactly 68 of those splits interleave the
batches. The reason this rig passes is that it has no drift to hide, not that the split null
would have found it.

## What this licenses, and what it does not

**Licensed.** A before/after on the aggregate luma cells or the renderer counters can be
believed at very tight tolerance on this rig, without a control arm. The empirical floor is
0.014 pp on the worst cell and exactly 0 on 65 of 80.

This is the number `kit`'s `lib/mobile/roundCompare.mjs` should eventually read, in place of
its `DEFAULT_TOLERANCE = { relative: 0.25, absolute: 0 }` — which its own header calls "loose
by design". For these cells, 25% is three orders of magnitude too loose: it would pass
`valley.pctWarm` moving from 34.7 to 43.4 while the measured noise is 0.014. Making that
substitution is `kit`'s call, not this repository's, and nothing here has been changed in
`.kit/`.

**Not licensed.** Any pixel-level comparison — a diff ratio, an A/B image pair, a region
measurement — has a noise floor of **2.1% to 11.4% of the frame** on this rig. That is large
enough to swallow most real changes, and a control arm is mandatory there. The existing
`--ab-object` pairs and `verify-lantern-spill` fall in this class and have never been run
against one.

## Limits of this measurement, stated so they are not lost

- **One profile, one build, one container.** `phone` only. Desktop/ULTRA is untested and
  boots in ~200 s, so its floor is unknown and must not be assumed equal.
- **Eight runs is a floor estimate, not a distribution.** It bounds the spread; it does not
  establish a tail.
- **This is arm 1 of KIT-VARIANCE and measures the capture rig.** The task's recorded objective
  is the variance of "the judgement itself". How much a critic's verdict moves when shown one
  unchanged set twice is **arm 2, and nobody has collected it.** A stable rig is not evidence
  of a reproducible verdict, and this file may not be cited as though it were.

## Traps found while building this

- **`npm run review` cannot measure variance.** It passes `--diff`, which carries an unchanged
  shot forward from the previous round instead of re-taking it. A variance run driven through
  it compares frames against copies of themselves and reports a noise floor of exactly zero —
  the rig looks perfectly deterministic *because it never ran*. `tools/variance.mjs` calls
  `capture.mjs` directly and refuses any run that reports `carriedForward`.
- **`CLAUDE.md`'s "phone ~35 s" is the boot number, not the run.** Boot is 37.3 s; a full
  five-shot phone review capture is **7 m 30 s**. Eight runs is an hour.
- **A scratch pixel-diff script written during this work used `width * height` as the pixel
  count** where the decoded buffer is shorter, producing `NaN` at the high percentiles and
  understating every changed-pixel percentage by about a quarter. The numbers in this file come
  from `tools/variance.mjs`, which divides by the decoded length; the intermediate figures that
  scratch script printed are superseded and should not be quoted.
