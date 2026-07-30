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

Measured, not asserted. Seven review rounds against a Ghost of Tsushima / SEKIRO bar.
**It has not passed** — round 7 filed FAIL at 44/100 with 4 blockers. Everything below is a
number off the round-7 verification capture (`npm run review -- --tag=r7v`), not a judgement.

> The 58 (round 3) → 44 (round 7) score gap is **not** a regression measurement: different
> critic instances, four rounds apart, and the review set has since had the HUD blanked,
> which removed the authored white ink the highlight gate used to pass on.

**Verified good**

| | measured |
|---|---|
| phone draw calls | **117** worst pose (`torii`), against the 140 cap — met for the first time |
| phone triangles | **735,886** worst pose (`wide`), against the 900,000 cap |
| tonal range | true blacks on all five review framings (p0.1 = 0, 5, 0, 0, 0) |
| highlights | **all five framings now clear the 235 gate** (p99.9 = 236, 213, 253, 224, 254) |
| shader programs | zero linked dead — 115 linked, audited every capture |
| page errors | zero |
| near-sun sky chroma | saturation **0.049 → 0.28**, R−B **16.4 → 57.8** |
| paving / granite joint walls | p95 24° and 23°, down from 56° and 60° |
| PWA | installs and launches offline |
| bundle | 304 KB gzip main chunk, zero external assets |

Round 7 closed the two contract breaches that had been open longest. Draw calls came down
146 → 117 by baking 13 instanced meshes with ≤ 8 copies into the merged statics, merging
four shadow proxies into one, and raising the small-bucket collapse threshold 4200 → 12000 —
Level's own share went 74 calls → ≤ 56 across 60 → 40 objects. The `hero` highlight gate
closed on a bloom widening (strength 0.105 → 0.40, radius 1.35 → 1.75) taken as an art call
about halation on emitters, with the black gate re-checked on all five framings rather than
just the percentile being moved.

**Solved in round 7: what draws the dark mid-ground**

Two rounds and two disproved hypotheses had left this unowned. It was settled with a
prediction rather than a debug boot — *if the region moves when only the terrain dressing
changes, terrain draws it* — and it moved, `detail` **2.60 → 4.79**. Ray-marching the pose
independently confirms it: 79 rays land 17–79 m out on the plateau, in a splat that is
grass 0.646 ± 0.072 / dirt 0.327, where the far-ground reconstruction is ≈ 0. The hole was
**spatial, not tonal**: the library ground textures are authored at 0.07–0.3 m and have
mipped to their mean by ~20 m, while every term `Terrain.js` added was 8–48 m. Nothing at
all occupied 0.3–7 m, which is 4–64 px at that depth.

**Open, with the measurement that states it**

| | measured | owner |
|---|---|---|
| god rays overwrite the shadow-cooling on the two frames that carry them | dark-population R−B fell on hero/wide/torii (0 god-ray term) and **rose** on valley/sun (0.97 and 1.00) | `src/render/PostFX.js` |
| contact shadows missing under props | flagstone under a 2.5 m stone lantern is a **local maximum**, 4.5× open ground 210 px away | `src/render/Lighting.js` |
| mid-ground still short of dressed ground | `detail` 4.79 against 9.19 at the same depth in the same frame | `src/world/Terrain.js` |
| aerial perspective converges above the sky | massif still reads as a pale cut-out on `wide`/`torii`; not re-filed by round 7's blind critic | `src/render/Sky.js` |
| sakura canopy value break | top:underside **0.86** where a backlit canopy needs ~3:1; hue was fixed (R−B 29.2 → 40.0), value was not | `src/world/Props.js` |
| bamboo band on `wide` | green-dominant 13.55% → 17.25%, short of the 21% target | `src/render/Foliage.js` |

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
