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

Measured, not asserted. Six review rounds against a Ghost of Tsushima / SEKIRO bar,
scoring 34 → 48 → 58 out of 100 through round 3. **It has not passed.** Everything below
is a number off the round-6 phone capture (`npm run shots -- --review --profile=phone`),
not a judgement.

**Verified good**

| | measured |
|---|---|
| tonal range | true blacks on all five review framings (p0.1 = 0, 0, 0, 2, 0) |
| highlights | p99.9 = 253 on `torii` and `sun`; 0.9% of the `sun` frame above 240 |
| shader programs | zero linked dead — audited every capture |
| page errors | zero |
| phone triangles | **686,202** worst pose, against the 900,000 cap |
| paving / granite joint walls | p95 24° and 23°, down from 56° and 60° |
| foliage | zero detached leaf clusters; green-dominant pixels 6–9% |
| PWA | installs and launches offline |
| bundle | 425 KB gzip, zero external assets |

Triangles came down from 1,138,406 (+26% over) in one change, and not by cutting detail:
`Engine.auditDraws` showed the six largest holders were instanced sets whose LOD window
ends 46 m from the camera being submitted in full from a plateau 220 m across — 184,688
triangles for 97 cedar trunks, 139,040 for 869 bamboo plants. `Foliage._registerPack` now
compacts each set against its own fade window, dropping only instances the vertex shader
was already collapsing, so the rendered frame is unchanged by construction.

**Over budget**

| | measured | contract | owner |
|---|---|---|---|
| phone draw calls | 146 at the `torii` pose | ≤ 140 | `src/world/Level.js` — 74 of the 146 |

The capture rig used to sample this once, at whatever pose the last shot happened to
leave behind; the spread is 99 calls at `valley` to 146 at `torii`, so that was asserting
the cap against an arbitrary framing. It now samples every pose, asserts the worst, names
it, and rolls the frame up by owning system.

**Known open, with the measurement that states them**

- **Aerial perspective converges above the sky.** Distant terrain hazes toward
  `fogParams.color`, which at magic hour is authored 0xa9a8ad — brighter than the sky it
  sits against. On the round-6 `wide` frame the massif lands at luma p50 161 while the sky
  beside it is p50 145, so at full haze a mountain becomes a pale cut-out rather than
  disappearing. Round 5's two-layer fog fixed the *amount* of air (massif p99 226 → 215,
  saturation 0.233 → 0.136); the target colour is the remaining half.
- **The mid-ground of `wide` and `valley` reads as a dark expanse.** Measured detail 2.59
  against 9.19 for dressed ground at the same depth in the same frame, at p50 55. Round 6
  attributed this to the terrain's far-ground reconstruction and to the canopy shell in
  turn, and **both were wrong** — changes to either branch moved the region by nothing
  measurable. The symptom is stated here without a mechanism on purpose (see
  `tools/CRITIC.md`, "describe the symptom, do not diagnose the cause"). It has grain at
  native resolution; it is too dark and too hazed, not untextured.
- **`hero` is 2 luma under the highlight gate** — p99.9 = 233 against 235. It was passing
  partly on the HUD's authored white ink, which the review set no longer contains. The
  lanterns do reach 254; fewer than 0.1% of the frame clears 235.
- **The far massif is low-contrast at every range.** detail 2.29, and the parallax ridge
  band's near rank came back at detail 1.06 — dead-white geometric cones. Round 6 rederived
  the band's three haze constants from the new fog law (they were authored against a fog
  that only ever reached 22%); it changed nothing measurable on these five framings, so
  the cones are something else and remain unidentified.
- **`wide` is front-lit by construction** — its sun sits 123° off the view axis, so no
  specular in frame reflects toward the viewer. It is exempt from the highlight gate for
  that reason, recorded in `tools/capture.mjs`. Fixing it properly means moving
  `WORLD.SUN_AZIMUTH_DEFAULT` off the valley or re-siting the shot.
- The sakura canopy is a solid opaque mass with visible card edges at its silhouette, and
  the bamboo band reads as a row of similar cards rather than a grove. Neither was touched.

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
