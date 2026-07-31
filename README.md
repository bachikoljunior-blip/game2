# KAGEROU 陽炎

A mobile-first third-person samurai action game, built in Three.js, with **zero external
assets** — every texture, mesh, animation and sound is synthesised in code at boot.

> Mountain shrine, magic hour, autumn. Draw, deflect, cut.

---

## Run it

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

Measured, not asserted. The coherent phone/MEDIUM `r12v1` checkpoint is captured and gated.
Round 10 hardened the evidence and rejected harmful shadow/tone candidates; Round 11/12 made
the stone-lantern receiver visible, additive, and softly varied. Its fixed hero near/far
ground ratio moved **1.121 → 2.394**, and an independent source-blind lantern review passed.
The final five-frame source-blind review still returns **FAIL overall** on fill, sky,
mountains, foliage, authored layout, and sun framing; valley verification is also blocked by
stale camera-era probes. Rounds 10–12 are complete, and Round 13 has not started. See
`HANDOFF.md` and `AI_DEVELOPMENT/EVIDENCE/r12-final.md` for the exact checkpoint.

> The 58 (round 3) → 44 (round 7) → 46 (round 8) scores are **not** a single trend line:
> they come from different critic instances, and the review set has since had the HUD
> blanked, which removed the authored white ink the highlight gate used to pass on.

**Latest coherent measured checkpoint (`r12v1`; not a full visual PASS)**

| | measured |
|---|---|
| phone draw calls | **119** worst pose (`torii`), against the 140 cap |
| phone triangles | **767,124** worst pose (`wide`), against the 900,000 cap |
| tonal range | true blacks on all five review framings (p0.1 = 0, 12, 0, 0, 6) |
| highlights | eligible `hero` **236** and `torii` **251**, both above the strict >235 gate |
| shader programs | zero linked dead — 117 linked, audited every capture |
| page errors | zero |
| set colour coherence | frame-to-frame R−B spread **64.1 → 43.2** |
| aerial perspective | far range now reads **7.9 luma** below the sky above it, from 0.2 |
| valley ground detail | **7.57 → 10.3**, against dressed ground's 9.19 |
| near-sun sky chroma | saturation **0.049 → 0.28**, R−B **16.4 → 57.8** |
| PWA | installs and launches offline |
| bundle | 314.45 KB gzip main chunk, zero external assets |

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
