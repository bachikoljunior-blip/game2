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

## Where this build actually stands

> Picking the work up in a new session? [`HANDOFF.md`](./HANDOFF.md) carries the state
> the container does not — `shots/` is gitignored and the review images do not survive.

Measured, not asserted. The coherent phone/MEDIUM `r18v1` checkpoint is captured and gated.
Rounds 16, 17 and 18 are complete and the sequence is closed at the user's instruction.
Independent closing verdicts were **FAIL 54**, **FAIL 56** and **FAIL 58** out of 100. Those
are three different critic instances and are **not** a trend line — this project has measured a
12-point gap between instances on byte-identical pixels.

What is instance-independent across the three rounds: **one blocker closed** (the crushed
shadow floor, reversed by the owner that introduced it — `sun` below-code-8 12.47% → 1.68%),
**one long-standing blocker's mechanism proved** (the plaza voids), **one blocker proved
unreachable from the file it was routed to for three rounds** (the god rays), and **one
composition fault fixed at the source** (the `valley` camera stood inside the plateau lip and
saw 0.1 m of drop; it now sees 319.4 m, at lower cost than before).

These rounds were unusually productive in *disproof* rather than in pixels. Nine mechanisms
were eliminated with measurement, several of which had been steering work for rounds:
the plaza voids are not a lighting, cascade, glow-pool, shadow-proxy, far-cover or
terrain-albedo defect; the `valley` shot was never a terrain fault; the `wide` shadow failure
is binary rather than bias or resolution; and the reported sky-lattice regression is not
terrain's. Two owners declined permissions they had been granted — one refused a cascade
exemption after disproving both mechanisms it was granted for, another declined a budget
reclaim that would have traded a closed finding for an open one.

The most consequential defect found was in the measurement apparatus, not the renderer:
`drop_console: true` was stripping the application's own boot diagnostics out of the exact
build the review rig photographs. A commit that removed the **entire foliage system** from all
five frames still produced a report reading `booted: true`, zero dead shaders, correct tier and
every budget green. That is now fixed, and the rig fails loudly when an owning system stops
drawing.

**Four blockers remain open**, with mechanisms and next actions recorded in `HANDOFF.md`.

**Latest coherent measured checkpoint (`r18v1`; not a full visual PASS)**

| | measured |
|---|---|
| phone draw calls | **119** worst pose (`torii`), against the 140 cap |
| phone triangles | **871,997** worst pose (`wide`), against the 900,000 cap |
| tonal range | true blacks on all five review framings (p0.1 = 0, 11, 0, 1, 5) |
| highlights | eligible `hero` **236** and `torii` **251**, both above the strict >235 gate |
| detached sky debris | dash region `detail` **5.95 → 2.85**, against a 2.15 cards-off floor |
| shadow colour | shaded plaza B/R **0.822 → 1.073**, sunlit-stone guard held at 0.693 ≤ 0.75 |
| sun disc | core luma p50 **251.9 → 255.0**; sky guard held at 227.6 |
| shader programs | zero linked dead — 119 linked, audited every capture |
| owning systems drawing | all six present in the rollup; rig now fails on a vanished owner |
| build provenance | embedded revision meta matches HEAD, checked at capture |
| page errors | zero |
| set colour coherence | frame-to-frame R−B spread **64.1 → 43.2** |
| aerial perspective | far range now reads **7.9 luma** below the sky above it, from 0.2 |
| valley ground detail | **7.57 → 10.3**, against dressed ground's 9.19 |
| near-sun sky chroma | saturation **0.049 → 0.28**, R−B **16.4 → 57.8** |
| PWA | installs and launches offline |
| sun glare | fixed 700x700 region over 90% luma **38.112% → 11.330%** (target <15%) |
| bundle | 314.83 KB gzip main chunk, zero external assets |

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
