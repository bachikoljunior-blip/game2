# PHYS-NARROWPHASE — why one capsule step tested the whole world (TD-010)

Owner: `[physics]`. File touched: `src/gameplay/Physics.js` only.
Apparatus: `tools/harness/*` and `tools/interaction-capture.mjs` at phone/MEDIUM
(844×390 @3, SwiftShader), same container and CPU for every number below.

## The short version

The candidate set was not merely large — it was **the entire mesh, every time**, because
**the query AABB was `NaN`**.

`TriBVH.overlapAABB` rejects a node with six comparisons of the form
`this.bmax[i] < minx || this.bmin[i] > maxx || …`. Every comparison against `NaN` is
false, so **a non-finite query box culls no node at all**: the traversal walks the whole
tree and copies out every triangle in the mesh. The BVH is not degenerate, the substep
count is not multiplying anything, and the per-test overhead is not the story. The box was
garbage and the rejection test failed open.

The `NaN` originates one call site outside physics — `src/gameplay/Enemy.js:845` calls
`this.controller.teleport(this.position)`, passing a `Vector3` to a `teleport(x, y, z)`
that expected three scalars — and physics then spread it to every other capsule. Both
halves are fixed inside `Physics.js`; nothing outside it was edited.

## The table that proves it

`overlapAABB` was wrapped on `TriBVH.prototype` at runtime and every call recorded: the
returned candidate count, the collider it came from, and the query box's extents. 30
stepped frames each, identical build, identical container.

| per frame | player only | + three engaged enemies |
|---|---|---|
| `_charStep` calls | 1.0 | 4.0 |
| `_sweep` calls | 3.0 | 13.3 |
| `_closestWorld` calls | 25.0 | 108.9 |
| `_closestWorld` calls **per sweep** | 5–8 (max 7) | 5–8 (max 7) |
| `overlapAABB` calls | 100.0 | 333.6 |
| **mean candidate set** | **12.6 triangles** | **598.2 triangles** |
| max candidate set | 32 | 732 |
| `physics.stats.narrowphaseChecks` | 1,338 | 209,886 |

Call counts rose 4.3× — exactly the character count. The **set size rose 47×**. That is
the whole difference.

The query-box histogram is the mechanism, stated as a falsifiable prediction and then
measured:

| query box, max extent | player only | + three enemies |
|---|---|---|
| < 1 m | 840 | 840 |
| 1–2 m | 2,160 | 0 |
| “> 16 m” | 0 | **9,168** |

The “> 16 m” bucket is an artefact of how the histogram was written — its chain of `<`
comparisons all fail for `NaN`, so a `NaN` extent falls through to the last bucket. The
companion axis histogram (`ex > 16`) put the same 9,168 calls in the *small* bucket, which
is only possible if `ex` is `NaN`. Reading the raw values back confirmed it: the player's
capsule position was `[NaN, 812.002, NaN]` and the three enemies' were non-finite in all
three components.

The healthy figure is the control: with the player alone, boxes are 1.75 m tall (exactly
`ch.height`, as `_closestWorld`'s box arithmetic predicts) and the sets are 12.6 triangles
against `LEAF_TRIS = 12`. **The BVH is correctly built and correctly queried.** Per-collider
maxima in the broken case were 600, 732 and 672 against triangle counts of 600, 732 and 672
— the whole mesh, not a large fraction of it.

## Hypotheses killed

Each was named in the brief and each was tested, not reasoned about.

| hypothesis | verdict | how |
|---|---|---|
| The query AABB is built in the wrong space or at the wrong scale | **disproved** | With no enemies the box is exactly `2r × ch.height × 2r` = 0.68 × 1.75 × 0.68 m, in world space, and returns 12.6 triangles. The arithmetic is right; the *inputs* were `NaN`. |
| The BVH is degenerate — one tree over all five colliders, leaves near the triangle count, or never subdivided | **disproved** | Five separate trees. Collider 3: 672 triangles, 127 nodes, 64 leaves, max leaf 11 triangles against `LEAF_TRIS = 12`. Every mesh subdivides to the leaf bound. |
| The substep count multiplies an already-correct set | **disproved** | `_moveCharacter` takes `ceil(dt/FIXED_DT)` substeps; at the harness's fixed 1/60 s that is 1, and `_charStep` calls per frame equal the character count exactly (1.0 and 4.0). |
| The set is correct and the cost is per-test overhead | **disproved** | 209,886 `segToTriangle` calls is not overhead — it is 97.7× the 2,148-triangle world, and it tracks the measured set size exactly (333.6 calls × 598.2 = 199,546 triangles/frame, the balance being the heightfield and non-mesh colliders). |

## Why nothing caught it

Three independent failures had to line up, and all three are silent:

1. `teleport(x, y, z)` accepted a `Vector3` as `x` and wrote `position.x = <Vector3>`,
   `y = undefined`, `z = undefined`. No throw. Enemy.js even wraps the call in
   `try { … } catch {}`, so a throw would have been swallowed anyway.
2. Arithmetic on that state produces `NaN` — and, through `+=` on a stringified object,
   an actual **string** (`"[object Object]NaNNaNNaN"`) in `position.x`. `typeof NaN` is
   `'number'`, so nothing downstream noticed.
3. `Enemy._integrate` guards its read with `typeof cp.x === 'number'` and falls back to
   dead reckoning plus a terrain floor when it fails. **The enemies therefore still walked,
   still stood on the ground and still rendered** — they simply had no collision with the
   world at all, while their capsules drove the narrow phase into testing every triangle in
   the level ~100 times per frame.

`_resolveCharacterOverlaps` then spread it: it writes A from B and B from A, so one bad
enemy made the player's capsule non-finite inside a single `PhysicsWorld.update`. That is
how a fault at an enemy spawn became a fault in the player's controller — confirmed by
wrapping every system's `update` and catching the first finite → non-finite transition,
which named `PhysicsWorld.update` on the player's character.

## The change

All in `src/gameplay/Physics.js`:

1. **`TriBVH.overlapAABB`** returns 0 for a non-finite or inverted query box, and warns
   once. A rejection test must fail *closed*. This is the direct cause of the 100×
   amplification and it is guarded independently of the input bug, so the next non-finite
   value cannot recreate it.
2. **`character.teleport`** accepts either three scalars or a vector-like, and refuses
   anything non-finite. This is what actually repairs the enemies.
3. **`_moveCharacter`** validates position, velocity, displacement and `dt` on entry and
   the resulting position on exit; on failure it holds the character's last good transform
   (three scalars kept on the character, no allocation) and warns once. ARCHITECTURE §5b.
4. **`_resolveCharacterOverlaps`** skips non-finite capsules so one can no longer infect
   the rest.

Healthy-path behaviour is unchanged by construction: every guard's condition is false for
finite input, and a legitimate query box always satisfies `min <= max` because it is built
as `min(a,b) - r` / `max(a,b) + r` with `r >= 0`.

## Results

### Apparatus note, read this before quoting a millisecond figure

Four agents were building and capturing on this container's four cores at the same time,
and `interaction-i1.json`'s absolute milliseconds were taken on a **different** machine —
its no-enemy frame reads 1.41 ms where this container reads 1.375 ms on identical code, and
one run here read 0.888 ms under lighter load. **`narrowphaseChecks` is the number to lead
with**: it is a deterministic count of triangle tests and does not move with CPU
contention. The milliseconds are supporting evidence.

So the pair below was taken **back to back in one window**, on this container, from the
same tree, differing only by `git stash` of `src/gameplay/Physics.js`:

```
git stash push src/gameplay/Physics.js && npm run build && \
  node tools/interaction-capture.mjs --tag=physctl-before  --carry-self-check=i1 --no-pixels --scenarios=__extras_only__
git stash pop && npm run build && \
  node tools/interaction-capture.mjs --tag=physctl-after   --carry-self-check=i1 --no-pixels --scenarios=__extras_only__
```

`--carry-self-check` and `--no-pixels` only skip the self-check and the rim-contrast
survey; `extras.jsFrameCost` — the acceptance measurement — runs the identical code path as
the bare command. Nothing was written to tag `i1`.

Two other owners edited `Foliage.js` and `Props.js` inside that window. That is controlled
for: `extras.jsFrameCost.colliders` reads `{statics: 5, triangleMesh: 5, 2148 triangles}`
in **both** runs, so the collision geometry the narrow phase sees is identical across the
pair.

### Acceptance

| `extras.jsFrameCost` | before | after | change |
|---|---|---|---|
| **`narrowphaseChecksThreeEnemies`** | **209,886** | **8,062** | **26.0× fewer** |
| **`msPerFrameThreeEnemies`** | **161.617 ms** | **3.657 ms** | **44.2× faster** |
| `narrowphaseChecksNoEnemies` | 1,338 | 1,338 | **unchanged, exactly** |
| `msPerFrameNoEnemies` | 1.375 ms | 1.248 ms | within run-to-run noise |
| heaviest system, three enemies | 148.93 ms (physics) | 2.17 ms | — |
| second heaviest | 10.32 ms | 0.81 ms | — |

Both acceptance thresholds — an order of magnitude on each — are met with margin (26× and
44×). The three-enemy frame is now **3.657 ms against the 5 ms budget of ARCHITECTURE §7**,
so BM-PERF-05 has a passing number on this apparatus for the first time.

The unchanged 1,338 is worth as much as the 8,062: the no-enemy path is byte-identical, so
nothing was traded away to get the other number.

The second-heaviest system also fell 10.32 → 0.81 ms. That system was not edited; it was
paying for its own queries into a physics world whose capsules were non-finite.

### Correctness

Same scripted run either side of the change, from a fixed absolute start
(`teleport(0, 812.5, 8)`, 60 settle frames) so nothing of the boot's real-clock warm-up
leaks into the comparison.

**A. Final positions after a 120-frame stick walk, no enemies — byte-identical.**

| | before | after |
|---|---|---|
| player position | `0, 813.242112, 3.540084` | `0, 813.242112, 3.540084` |
| narrow-phase checks over the run | 2,781 | 2,781 |

Identical to the last digit printed, and the triangle-test count matches exactly. There is
no divergence to justify on the healthy path.

**B. Three engaged enemies, 120 frames.** Here divergence is the point, and it is total:
before the change every capsule was non-finite, so there was nothing to preserve.

| | before | after |
|---|---|---|
| player | `NaN, 813.242112, NaN` | `0, 813.242112, 8` |
| oni #9 | `NaN, NaN, NaN` | `1.215648, 812.002130, 7.697208` |
| oni #10 | `NaN, NaN, NaN` | `0.606160, 812.000165, 3.659536` |
| oni #11 | `"[object Object]NaNNaN…", NaN, NaN` | `-2.340803, 812.002120, 6.462121` |
| narrow-phase checks | 176,448 | 7,916 |

**C. Ground contact, after.** Every capsule finite, `grounded` true, `groundInfo.distance`
0.0000 — none floating.

| entity | feet − terrain height | on |
|---|---|---|
| player | +1.2420 m | the haiden's raised floor slab (a static collider), not floating |
| oni #9 | +0.0020 m | terrain |
| oni #10 | +0.0000 m | terrain |
| oni #11 | +0.0020 m | terrain |

Nothing is below its surface. (A downward ray from `feet + 2.5 m` reads −1.238 m for the
three oni — it hits the haiden floor *above* their heads, since they stand on terrain under
its overhang. That is the ray's geometry, not a sunken capsule; the terrain reference above
is the ground metric.)

**D. Static penetration, after.** A fresh depenetration pass run against each final pose
would move it by:

| entity | correction |
|---|---|
| player | 0 m |
| oni #9 | 0.000015 m |
| oni #10 | 0 m |
| oni #11 | 0.000022 m |

Worst case 22 µm, against the controller's own `PUSH_OUT` gap of 2 mm. No character is
inside a static collider. Before the change this check could not be evaluated at all —
`_depenetrate` on a non-finite capsule returns nothing to measure.

### `encounters`

`node tools/interaction-capture.mjs --tag=i2 --scenarios=encounters` →
`shots/interaction-i2.json`.

The scenario was never run in i1. `interaction-scenarios.mjs` estimated it at **about six
hours of wall clock in this container** at the cost in TD-010, and cut its own default from
twenty encounters to four with the note *“raise these once the physics cost is fixed.”*

It now completes the full sample:

| | |
|---|---|
| encounters | **20** (the ≥ 20 BM-COMBAT-02 asks for) |
| frames | 14,470 / 14,470 |
| wall clock | **21.9 s** (662 fps simulated) |
| failed actions | 0 |
| events | 3,993 |

The rig's own self-check passed inside the same run with the change in place —
**determinism divergence 0** and **render-substitution divergence 0** over 120 frames,
`identical: true` on every column.

Two criteria that were `inconclusive — not run` in i1 now have executed measurements:

- **BM-AI-03 — pass.** 2,151 frames with three or more enemies engaged; peak simultaneous
  attackers **2** against an authored token limit of **2**; within the limit for **100%**
  of the encounter, against a 95% bar.
- **BM-COMBAT-02 — still inconclusive, for a new reason.** Twenty encounters ran, but the
  harness bot recorded **0 enemy deaths and 0 posture breaks** across all twenty, so
  “what fraction of deaths follow a posture break” has no denominator. That is now a
  combat/AI/bot question rather than a cost question, and it belongs to `[combat]` and
  `[bench]`, not here. It is a *new* finding: it was invisible while the scenario was
  unaffordable.

That run was interrupted during the trailing pixel extras, so `interaction-i2.json` carries
the self-check and the `encounters` scenario but not its own `extras.jsFrameCost`. The
acceptance numbers above come from the controlled `physctl-before` / `physctl-after` pair,
which runs the identical `jsFrameCost` code path.

## What this does not claim

- Not device evidence. SwiftShader, in a container, under a virtual clock. The
  transferable part is the mechanism and the ratio, not the absolute milliseconds.
- The fix does not make the enemy AI or animation cheap. It removes physics from the
  profile; whatever remains at the top of `threeEnemies.systems` is the next question and
  belongs to its own owner.
- `src/gameplay/Enemy.js:845` still passes a `Vector3` to `teleport`. It now does the right
  thing, but `[enemy]` should tidy the call site rather than rely on the tolerant signature.
