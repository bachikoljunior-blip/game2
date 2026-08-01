# KAGEROU 陽炎

A mobile-first third-person samurai action game, built in Three.js, with **zero external
assets** — every texture, mesh, animation and sound is synthesised in code at boot.

> Mountain shrine, magic hour, autumn. Draw, deflect, cut.

---

## Run it

Play the verified production build on
[GitHub Pages](https://bachikoljunior-blip.github.io/game2/). The checked-in Pages artifact
contains the measured Rounds 13–14 checkpoint; this is a runnable incremental checkpoint,
not a claim that the overall visual gate passes. Remote and browser verification state is
recorded in `AI_DEVELOPMENT/PROJECT_STATE.yaml`; payload merge `4a3eff7` loaded current
`index-D_EFhYS4.js` with ready/running true and zero recorded browser/network errors.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run shots      # build, then capture the visual-review screenshot set
npm run test:iphone-webkit  # iPhone SE 3 landscape WebKit interaction/visual gate
```

GitHub Actions runs the WebKit gate at `667×375 / DPR 2`, touch, iOS user agent, and MEDIUM
for product changes. A passing `main` candidate then runs Appium/XCUITest against Mobile
Safari on an iPhone SE (3rd generation) iOS Simulator. Only both-pass candidates can rebuild
the checked-in Pages artifact; screenshots, video, trace, Appium logs, and JSON reports are
retained as Actions artifacts.

This is the routine primary-phone release evidence. It does not measure a physical phone's
GPU speed, heat, memory-pressure reloads, actual multi-touch hardware, hand reach, haptics,
speakers, or audio latency, so those properties remain explicitly unmeasured rather than
being reported as passes.

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

**Desktop**

`WASD` move · mouse look (right-drag or click to capture) · `LMB` attack · `Shift+LMB` heavy ·
`C` guard · `Space` dodge · `Q` lock on · `E` special · `R` sheathe · `1/2/3` stance ·
`Esc` pause. Gamepads are supported.

---

## Why it looks the way it does

The whole build is procedural, which sounds like a limitation and is actually the point:
a phone downloads under two megabytes and then spends a few hundred milliseconds
synthesising a world locally, instead of streaming a hundred megabytes of textures it will
sample four times.

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

**The honest state of that bar: one element of sixteen has a completed review loop.** Visuals
is measured and currently fails. Four more have partial evidence limited to what a still
frame or a boot-time counter can show. The interaction gap now has a prepared WebKit plus
iOS Simulator Safari apparatus, but its target runners have not yet produced accepted
evidence. No side-by-side against real reference footage, no physical-device frame rate,
and no expert or player review has ever been performed, and none is claimed anywhere in
this repository.

## Where this build actually stands

> Picking the work up in a new session? [`HANDOFF.md`](./HANDOFF.md) carries the state
> the container does not — `shots/` is gitignored and the review images do not survive.

Measured, not asserted. The coherent phone/MEDIUM `r15v1` checkpoint is captured and gated.
Round 15 closed **FAIL at 65/100**, 3 blockers from 4, and was mostly a *disproof* round: it
retired `HANDOFF.md` open item 2 — the finding that file called the most consequential
unfixed problem on the project — by showing the cool fill was never being eaten and the
original measurement had simply omitted albedo. It also killed the "no cast shadows on the
plaza" claim for the third time, with the critic's own probe box measured at **84.6% cast
shadow**.

> **The round-15 scores are not a trend.** The opening `r15` capture was taken on a tree
> byte-identical to `r14final`. Round 14 closed at **50**; a fresh critic instance scored the
> identical pixels **62**. That 12-point gap is inter-critic-instance variance measured
> directly, and the closing 65 came from a third instance. The instance-independent results
> are that the detached-sky-dash blocker is gone — confirmed by pixel measurement and by eye
> — and the blocker count fell 4 → 3.

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
