# KAGEROU 陽炎

A mobile-first third-person samurai action game, built in Three.js, with **zero external
assets** — every texture, mesh, animation and sound is synthesised in code at boot.

> Mountain shrine, magic hour, autumn. Draw, deflect, cut.

---

## Run it

Play the published checkpoint on
[GitHub Pages](https://bachikoljunior-blip.github.io/game2/). The checked-in Pages artifact
contains the Round 16 checkpoint. Its repository payload is verified; its live-browser gate
remains unverified. Current repairs are on `codex/game2-criteria-20260911` and are undergoing
rendered CI verification before publication. Overall product criteria have **not** passed.
Remote and browser evidence is recorded in `AI_DEVELOPMENT/PROJECT_STATE.yaml`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run shots      # build, then capture the visual-review screenshot set
```

## Controls

**Phone (primary target)**

| | |
|---|---|
| left thumb | floating analogue stick — origin snaps to wherever you first touch |
| right thumb, drag | camera |
| right thumb, **flick** | slash in the flick direction (8 directions) |
| right thumb, tap | light attack |
| 受 hold | guard; release at the moment of impact to parry |
| 避 | dodge |
| 技 | special |
| 敵 | lock on |
| 調 (near an available object) | interact; the prompt explains the consequence |

**Desktop**

`WASD` move · mouse look (right-drag or click to capture) · `LMB` attack · `Shift+LMB` heavy ·
`C` guard · `Space` dodge · `Q` lock on · `E` special · `R` sheathe · `1/2/3` stance ·
`F` interact · `Esc` pause. Gamepads are supported (View/Select for interaction).

---

## Why it looks the way it does

The whole build is procedural: the current candidate is about 490kB compressed and generates
its world locally. Actual phone boot time has not yet been measured.

- **Materials** are evaluated per pixel from domain-warped simplex and worley fields, with
  normals derived by Sobel from the same height field — not faked from albedo luminance.
- **Terrain** is a ridged multifractal run through a real hydraulic-droplet erosion pass;
  the erosion channels are what stop it reading as noise.
- **Sky** is an analytic atmosphere with a proper sun disc, feeding a PMREM environment map
  that lights everything else.
- **Animation** is a pose-blend graph with 2D locomotion blending, two-bone IK, foot
  planting and Verlet cloth — no baked clips, no imported skeletons.
- **Audio** is synthesised: struck-bar models for the blade clash, Karplus-Strong for the
  koto, a membrane model for the taiko, and a generative score that reacts to the fight.

## The bar, per element

The reference bar is not one impression of "AAA" — it is assigned element by element in
[`AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml`](./AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml),
with the reason for each choice and the concrete criterion it becomes.

| | reference | why |
|---|---|---|
| image, camera, movement, exploration, world, UI, audio, stability | **Ghost of Tsushima** | the same fiction, the same light, the same third-person framing problem |
| combat, animation, AI, character legibility, choice | **SEKIRO** | deflect-and-posture melee — a model this project's entity contract already committed to |
| touch controls, phone performance envelope | **Genshin Impact** | neither console title offers one frame of evidence about a touchscreen, and the phone is the primary platform |

Two of the three are also **anti**-references on their weakest property: SEKIRO's camera in
enclosed space, and Genshin's sustained thermal behaviour on mid-range Android. Principles
only — nothing from any reference's characters, world, layout, UI, staging or music is
copied, and no reference title is named in the shipped product.

**As of 2026-09-11, candidate `3633597` has an executed 20-encounter combat/AI sample,
five native phone/MEDIUM frames, 300 rendered motion frames, and a passing
production/touch/graphics-recovery smoke.**
Coverage is not quality: the latest interaction metrics returned 15 pass, 0 fail and 3
inconclusive. Attack-motion onset passes (18/18 attacks, shortest 233 ms), and posture
resolution is 21/30 = 70% against 60%. Incoming-attack video coverage still fails, and sample
audio peak does not establish true peak. Independent review retains black rendering ribbons,
primitive character forms and combat occlusion. The prior still-set review judged both versions below
the visual bar; the repaired frames still need fresh independent review. No matched
reference gameplay, real-device performance or human review is claimed.

## Where this build actually stands

> Picking the work up in a new session? [`HANDOFF.md`](./HANDOFF.md) carries the state
> the container does not — `shots/` is gitignored and the review images do not survive.

### 2026-09-11 candidate: measured gameplay progress, overall criteria unmet

Latest [CI](https://github.com/bachikoljunior-blip/game2/actions/runs/34640487523) completed
on `3633597`; main/Pages remains `4e6d23a`. Five technical frames and the posture target
passed. The next step is a short input rehearsal and stopped-frame render ablation to
repair the failed incoming-attack sample and persistent black ribbons. Exact results and
artifact hashes: [`r17-candidate-363.md`](AI_DEVELOPMENT/EVIDENCE/r17-candidate-363.md).

The following paragraphs retain the earlier checkpoint history.

The current candidate fixes foot planting, attack-window timing, posture pressure, camera
collision, contextual input, encounter progression and restart. Fourteen focused behavioral
test files pass, along with the production build, ownership and project-state checks.
The small-screen layout also includes context and pause controls in its overlap audit.

[CI run](https://github.com/bachikoljunior-blip/game2/actions/runs/34615869197) captured
candidate `d4941ca` at phone/MEDIUM, then executed 20 scripted encounters. The candidate
stayed within 119 draw calls / 804,744 triangles across the five fixed views.
Reversals completed in 217 ms; planted-foot p95 drift was zero (worst 0.044 cm); the camera
traverse had zero collider overlaps across 1,896 frames. These are instrumented scenarios.
The repaired harness records changed stimuli explicitly, so cross-version numbers are not
identical-input comparisons. The stored report initially counted anonymous compatibility
notifications as enemy deaths. Re-evaluating the unchanged raw trace with authoritative
entity deaths gives 15 of 31 posture-resolved deaths (48.39%), below the unchanged 60%
target. The apparatus correction has a regression test. A fresh corrected run measured
5 of 16 posture-resolved deaths (31.25%), still below the same target, while all 40 sampled
attack startups met the 233 ms minimum. The 300-frame job produced valid locomotion and
combat MP4s, but its combat coverage had no enemy-attributable impact reaction. Independent
review also rejected the sample for dominant black staircase artifacts, combat-body overlap,
and primitive character construction. The replacement plan drives the validated aggressive-v2
bot exclusively through registered DOM pointer/guard input. Exact evidence and artifact hashes:
[`r17-candidate-d494.md`](AI_DEVELOPMENT/EVIDENCE/r17-candidate-d494.md) and
[`r17-motion-9a2.md`](AI_DEVELOPMENT/EVIDENCE/r17-motion-9a2.md).

The next local repair tree raises ordinary hit posture pressure only after replaying the
fresh health-only sequences, removes near-character silhouettes from the quarter-resolution
god-ray occlusion integral while retaining world occluders, reconnects cloth simulation
arrays to their GPU attributes, and replaces the missed fixed combat inputs with the
validated DOM-input aggressive script. Focused checks pass, but none of those repairs count
until a fresh full CI run, native rendered evidence, and independent review complete. Exact
diagnosis and verification boundary:
[`r17-repairs-after-9a2.md`](AI_DEVELOPMENT/EVIDENCE/r17-repairs-after-9a2.md).

[Native input/recovery CI](https://github.com/bachikoljunior-blip/game2/actions/runs/34605905851)
passed two fresh browser contexts, native Dodge/context touches, real WebGL loss/restoration,
and resumed gameplay with zero page, console, HTTP or invalid-GL errors. This is not phone
performance or a public-deployment check. Full scope and limitations:
[`r17-integration.md`](AI_DEVELOPMENT/EVIDENCE/r17-integration.md).

### The game is now measured in motion, not only photographed

Until 2026-08-01 the project's entire apparatus was five static screenshots, so exactly one
of the sixteen elements in `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` had ever been
verified. The interaction rig (`tools/interaction-capture.mjs`, brief in
[`tools/INTERACTION.md`](./tools/INTERACTION.md)) closes that gap: it drives the built game
through scripted play at a fixed simulation timestep, through real DOM pointer and keyboard
events on the real canvas, and writes traces a separate pure module turns into
per-criterion verdicts. **Nothing in `src/` was changed to make this possible** — the whole
page-side half is injected by the rig and cannot exist in a release load.

Its own validation runs first: two runs of an identical stimulus diverged by **0**, and
replacing the post pipeline with a matrix-only stub — the substitution that makes the rig
affordable at **8.73 s per rendered frame against 2.2 ms per simulated one** — also
diverged by **0**.

What the first run found, in its first hour:

- **Locomotion is exactly as authored.** Ground speed measured from world position, not
  from the controller's self-report: **1.9 / 5.4 / 7.2 m/s**, all three inside ±5%.
- **Feet slide.** A planted foot drifts **~26 cm per frame** at the 95th percentile against
  a 2 cm bar — there is no foot lock, which no still frame can show.
- **A 180° reversal takes 283 ms** against a 250 ms bar, with a 17 ms response latency. A
  small, real miss rather than a feel complaint.
- **Three enemies cost 194–850 ms of JS per frame** against 1.25–1.7 ms with none — 137×
  to 500×, against a 5 ms budget. A CPU profile puts **91.6%** of that frame in the physics
  narrow phase: the whole static world is five colliders totalling 2,148 triangles, and one
  frame issues 209,886–419,414 triangle tests. This is JavaScript, not rasterisation, so it
  is not a SwiftShader artifact — though a container CPU is not a phone either, so the
  ratio and the mechanism transfer, not the millisecond count. Recorded as TD-010; it is
  the largest thing on the project's plate, and it is also what stops the rig sampling
  combat.
- **The interactables are unreachable.** `Level.interact()`, `nearestInteractable()` and
  `ringBell()` have no caller anywhere, and Input's `interact` intent is consumed by
  nobody. The bell, the ema and the chōzuya have authored responses no player can reach,
  and the bell is also a wave trigger. `BM-EXPLORE-02` had been marked *verified* on a
  source audit that read those responses without checking that anything invokes them.
  Recorded as TD-011.

Full results and every measured number: `shots/interaction-i1.json` and
[`AI_DEVELOPMENT/EVIDENCE/interaction-i1.md`](./AI_DEVELOPMENT/EVIDENCE/interaction-i1.md).
Nothing in that run is a play test, a device measurement, or a comparison against any
reference title — none of those have happened on this project.

### Round 16, and the defect no screenshot could ever have shown

Round 16 opened **FAIL at 58/100** with 3 blockers and closed with every contract gate held
on `r16v1` (119 → 120 draw calls, 784,449 → **781,386** triangles, black gate 0/11/0/0/0,
white gate hero 236 / torii 251). Five owners committed; ten were gated out of the fan-out.

Its largest result was not visual. **TD-010 — three enemies costing 194–850 ms of JS per
frame — was never a performance defect.** The narrow-phase query AABB was `NaN`, and
`TriBVH.overlapAABB` culls with six comparisons that are all false against `NaN`, so a
non-finite box **rejected nothing**: the cull failed open and returned every triangle in the
collider. The root cause is an ARCHITECTURE §5b violation at `Enemy.js:845`, which hands a
`Vector3` to `teleport(x, y, z)`. Because `Enemy._integrate` guards with `typeof` and falls
back to dead reckoning, **the enemies walked, stood and rendered normally while having no
world collision at all** — a gameplay defect invisible to any still frame, and one the
interaction rig surfaced only as a timing symptom.

Narrow-phase tests fell **209,886 → 8,062** and the three-enemy JS frame **161.6 → 3.7 ms**,
inside the 5 ms budget. The `encounters` scenario, previously estimated at ~6 hours, now
completes 20 encounters and 14,470 frames in **21.9 s**, and BM-AI-03 passes.

On the image: the sky's achromatic-at-golden-hour blocker moved `hero` sunward saturation
0.031 → **0.228**; the god-ray pass turned out to have **no scattering phase function at
all**, and adding one cut `rtGodB` visible coverage 89.0% → **39.2%** on `sun`; and the
sakura canopy's two-hue split was a normals defect — `computeVertexNormals()` on planar
quads gave every card a single normal, so a constant-shaded polygon under one hard key could
only take two values. Round 15 had aimed the same fix at the wrong file entirely, which is
why the defect survived to be re-measured.

Shortfalls are recorded as shortfalls, not softened: `sun` band16 reached 4.72 against 7.0,
the canopy transition band 0.234 against 0.30, and the **crown silhouette got worse** (23 →
27 px longest straight run against a ~12 px target).

Measured, not asserted. The coherent phone/MEDIUM `r16v1` checkpoint is captured and gated.
Round 15 closed **FAIL at 65/100**, 3 blockers from 4, and was mostly a *disproof* round: it
retired `HANDOFF.md` open item 2 — the finding that file called the most consequential
unfixed problem on the project — by showing the cool fill was never being eaten and the
original measurement had simply omitted albedo. It also killed the "no cast shadows on the
plaza" claim for the third time, with the critic's own probe box measured at **84.6% cast
shadow**.

> **The scores are not a trend, and round 16 widened the proof.** The opening `r15` capture
> was taken on a tree byte-identical to `r14final`, and the opening `r16` capture on a tree
> byte-identical to `r15v1`. Four independent critic instances have now scored essentially
> the same pixels **50 → 62 → 65 → 58**. That spread is inter-instance variance measured
> directly, four points wider than the 12 recorded last round, and it means **no
> round-over-round score delta on this project is evidence of anything** unless it comes from
> the same instance or is quoted with the variance. What survives instance change is the
> per-finding pixel measurement, which is why every table here is a region and a number
> rather than a score.

The one blocker actually closed was closed by a proven mechanism, not a guess: the bamboo
card atlas was packed 2×2, so bilinear sampling at v=0.5 pulled the deliberately opaque
rooted skirt of cells 2/3 through the transparent culm tips of every row-0 card. Five
ablations isolated it; repacking the atlas 4×1 took the dash region's `detail` from **5.95
to 2.85** against a floor of 2.15 measured with the entire card mesh hidden — at zero
triangle, draw-call or texture cost.


Round 10 hardened the evidence and rejected harmful shadow/tone candidates; Round 11/12 made
the stone-lantern receiver visible, additive, and softly varied. Its fixed hero near/far
ground ratio moved **1.121 → 2.394**, and an independent source-blind lantern review passed.
Round 13's source-blind score moved **36 to 43**, with blockers reduced from two to one.
Round 14 moved **44 to 50** and eliminated the broad sun-glare major finding: the critic's
fixed region fell from **38.112% to 11.330%** of pixels over 90% luma. Detached bamboo
skyline fragments remain blocking; terrain scale and sparse courtyard storytelling remain
major findings. Valley verification is also blocked by stale camera-era probes. The two
authorized rounds are complete and Round 15 is not active. See `HANDOFF.md` and
`AI_DEVELOPMENT/EVIDENCE/r14-final.md`.
The public Pages surface was separately verified in a real browser: it booted the relative
hashed production modules and reached the running engine with zero page, console, request,
or HTTP failures.

> The 58 (round 3) → 44 (round 7) → 46 (round 8) scores are **not** a single trend line:
> they come from different critic instances, and the review set has since had the HUD
> blanked, which removed the authored white ink the highlight gate used to pass on.

**Latest coherent measured checkpoint (`r15v1`; not a full visual PASS)**

| | measured |
|---|---|
| phone draw calls | **119** worst pose (`torii`), against the 140 cap |
| phone triangles | **784,449** worst pose (`wide`), against the 900,000 cap |
| tonal range | true blacks on all five review framings (p0.1 = 0, 11, 0, 1, 5) |
| highlights | eligible `hero` **236** and `torii` **251**, both above the strict >235 gate |
| detached sky debris | dash region `detail` **5.95 → 2.85**, against a 2.15 cards-off floor |
| shadow colour | shaded plaza B/R **0.822 → 1.073**, sunlit-stone guard held at 0.693 ≤ 0.75 |
| sun disc | core luma p50 **251.9 → 255.0**; sky guard held at 227.6 |
| shader programs | zero linked dead — 117 linked, audited every capture |
| page errors | zero |
| set colour coherence | frame-to-frame R−B spread **64.1 → 43.2** |
| aerial perspective | far range now reads **7.9 luma** below the sky above it, from 0.2 |
| valley ground detail | **7.57 → 10.3**, against dressed ground's 9.19 |
| near-sun sky chroma | saturation **0.049 → 0.28**, R−B **16.4 → 57.8** |
| PWA | installs and launches offline |
| sun glare | fixed 700x700 region over 90% luma **38.112% → 11.330%** (target <15%) |
| bundle | 317.77 KB gzip main chunk (477.1 KB gzip total, against a 1.6 MB cap), zero external assets |

**Solved in round 8: three symptoms that were not what they looked like**

Round 8's most valuable output was disproof. Of the critic's four blockers, **two described
real pixels but misattributed them**, and finding that out cost less than acting on them
would have.

*The missing cast shadows were never missing.* Ablating the shadow term at runtime and
diffing shows 45% of `torii`'s near ground band is cast shadow, p50 **43.0 lit against 19.9
shadowed** — a factor of 2.16, which is exactly what the critic's own fix asked for. At the
13° sun elevation the build runs, a shadow lands 4.33× the caster's height downsun, so a 6 m
torii post throws 26 m: the probe boxes were beside the post, ~26 m short of the shadow.
The `kagGetShadow` early-out was cleared too — disabling PCSS entirely moves the frame less
than its own noise floor.

*The green/magenta edge fringe was not lens dispersion.* The chromatic-aberration block
assigned `color.r` and `color.b` from raw texture fetches, discarding the antialiased result
for two of three channels. Red and blue were never antialiased, which is why the fringe was
green-only and full-strength on the optical axis where a radial term is zero.

*The far range is macro heightfield, not the parallax ridge band* — which finally explains
why round 6's ridge-band retune measured as a no-op. Its detail bands are gated by a
footprint term that evaluates to 0.06 at 1.6–2.5 m of rock per pixel, switching them off
exactly where the review measured detail 1.28.

**Open, with the measurement that states it**

| | measured | owner |
|---|---|---|
| no instanced ground cover in the basin at all | `grassRadius` is **34 m**; the valley box spans 15–90 m and `wide`'s plain sits at 55–82 m | `src/render/Foliage.js` |
| the cool fill is eaten before it reaches the pixel | rig delivers fill 0.446 against key 0.396, but the fitted illuminant is B/R **0.141** — the key's own 0.134, i.e. the ground is lit nearly neat | `src/render/Materials.js` |
| far range still under-textured | detail **1.28 → 1.68** against a ≥ 3.0 target | `src/world/Terrain.js` |
| valley saturation | **0.609**, against a 0.55 target; unreachable from terrain — an achromatic albedo still measures 0.593 under this illuminant | `src/render/Lighting.js` |
| god-ray warm cast damped but not gone | `sun` shadow probe R/B **14.75 → 8.85**, against a ≤ 7.0 target | `src/render/PostFX.js` |
| sakura canopy emits less than it did | the directional emissive floor cost 301 of `hero`'s highlight pixels — an art question, now decoupled from the gate | `src/world/Props.js` |

`HANDOFF.md` carries the full open list, everything round 7 disproved, and the six leads
owners found outside their own files and handed over rather than edited.

## Performance

The pass/fail line is **60 fps on a mid-range Android at the MEDIUM tier**. The engine
profiles the GPU at boot, picks a tier, then continuously walks a dynamic render scale up
and down to hold the frame budget (`src/core/Engine.js`, `_adapt`). Add
`?q=low|medium|high|ultra` to the URL to force a tier, `?debug` for the overlay.

| tier | render scale | shadows | post |
|---|---|---|---|
| low | 0.62 | 1 cascade, hard | bloom, grade, grain, sharpen |
| medium | 0.80 | 2 cascades, soft | + SSAO, god rays, chromatic |
| high | 1.00 | 3 cascades, PCSS | + TAA, motion blur, DOF |
| ultra | 1.00 | 4 cascades, PCSS | everything, max taps |

## Layout

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the binding contract: the system interface,
the `ctx` object, the event table, the entity shape, units, art direction and the
per-tier performance budget. Every module follows it.

```
src/core/     engine, quality tiers, input, event bus, noise, audio
src/render/   materials, sky, lighting, post-processing, foliage
src/world/    terrain, props, level
src/anim/     rig, poses
src/gameplay/ physics, player, camera, combat, enemies
src/fx/       impact effects, weather
src/ui/       hud, touch controls, menus
tools/        headless capture rig for visual review
```
