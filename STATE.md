# Where this build actually is

**Read this first. Update it at the end of every round, then commit and push.**

Sessions end — containers get reclaimed, conversations run out of context, people switch
devices. Anything that lives only in a conversation is lost at that boundary. This file is
the handoff, and it is the only thing that lets the loop survive being interrupted. Keeping
it accurate is part of the round, not paperwork after it.

---

## Definition of done

The loop ends when all four hold at once, measured and not asserted:

1. The critic returns **PASS** on the full review set (`hero`, `wide`, `torii`, `valley`,
   `sun`) — meaning it would put each frame beside *Ghost of Tsushima* / *SEKIRO* on a store
   page, judged blind and side by side.
2. `phone` profile inside ARCHITECTURE §7: **≤ 140 draw calls, ≤ 900,000 triangles**.
3. Every review shot passes the tonal gates: `p0.1 < 15`, and `p99.9 > 235` on the shots
   with real speculars.
4. Zero dead shader programs and zero page errors in the capture report.

Until then it is not done, however good the last round felt.

---

## Current position

| | |
|---|---|
| branch | `claude/aaa-fps-threejs-ddcaix` |
| last completed round | **3** |
| last verdict | FAIL, score **58 / 100** (34 → 48 → 58) |
| round 4 | captured, but **no verdict was ever filed** — the run was stopped mid-review |
| next action | run round 4 per `ROUND.md` |

Round 4's images did not survive a container restart, so round 4 starts from a fresh
capture. Do not look for them.

### Verified good (measured)

Tonal range: true blacks (p0.1 = 0) and real highlights (p99.9 = 254 on `sun` and `torii`).
Zero dead shader programs; zero page errors. Paving and granite joint walls at p95 24° and
23°, down from 56° and 60°. Massif high-frequency detail 4.61, up from 1.44. No detached
leaf clusters. PWA installs and launches offline. Bundle 425 KB gzip, zero external assets.

### Open

| item | measured | target | owner |
|---|---|---|---|
| phone triangles | 1,146,570 | ≤ 900,000 | `foliage` + `world` |
| phone draw calls | 156 | ≤ 140 | `foliage` + `world` |
| `wide` highlight gate | p99.9 = 225 | > 235 | `postfx` |
| bamboo sea density in the valley overlook | — | reads as stems, not haze | `foliage` |
| granite joint-wall fix not yet applied to the stone recipe | — | match the paving fix | `materials` |

The triangle count nearly doubled from 676 k across two rounds of detail work. Every
addition was individually justified and every owner respected their own budget; nobody owned
the total. `tools/capture.mjs` now asserts both caps on every phone capture.

---

## Already disproved — do not re-test these

Each of these cost a real investigation. Re-running them is pure waste, and worse, a second
agent reaching the same wrong conclusion tends to act on it.

| hypothesis | how it was disproved |
|---|---|
| The flat grey frame was a cascade weight of zero | GL uniform readback: Σ cascade weight = 1.0 |
| …or `shadowsActive` being false | Readback showed it true, 4 cascades active |
| The real cause was any of the above | Ablation: deleting the entire key light moved the plaza by 19 code values and did not change its hue. `scene.environmentIntensity` was unset |
| "Cracked mud" paving came from joint *depth* | It was 58° joint **walls** (4.2× brightness ratio at a 13° sun) plus anisotropic filtering fusing the joints |
| …or from a second independent detail layer | Disproved five ways |
| God rays needed 4–6× more weight | Made it worse. Real cause: `uEmitClamp: 8.0` discarding 94% of a 147-linear disc |
| The flat red sakura belonged to `foliage` | Ablation: `Props.sacredTree()` was emitting bare quads under the `clothCrimson` banner material |
| The bamboo sea was too sparse | Its shader linked dead — 11,390 cards rasterised zero pixels for three rounds |

---

## Round log

Append one row per round. Keep it to one line each; detail belongs in
`shots/review-r<N>.json`, which is committed.

| round | verdict | score | dispatched | notes |
|---|---|---|---|---|
| 1 | FAIL | 34 | all owners | black bamboo starbursts, blob scatter on the ground |
| 2 | FAIL | 48 | all owners | flat grey frame — key light contributing nothing |
| 3 | FAIL | 58 | all owners | god rays, night LUT in daylight, ground UV split |
| 4 | — | — | — | captured, never judged; restart from a fresh capture |

Rounds 1–3 predate `tools/dispatch.mjs`, which is why "all owners" appears — that is the
1.6M-token waste the gate now prevents, not a pattern to copy.
