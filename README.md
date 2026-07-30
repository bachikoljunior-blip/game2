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

Measured, not asserted. An independent art-direction critic reviews the build blind against
a Ghost of Tsushima / SEKIRO bar each round, scoring 34 → 48 → 58 → (round 4 unfiled) → 58
out of 100. It has not passed. Round 5's verdict was FAIL with three blockers, all three of
which were then repaired and re-measured; the numbers below are that verification pass.

**Within budget, for the first time**

| | round 4 | round 5 verified | contract §7 |
|---|---|---|---|
| phone draw calls | 156 | **117** | ≤ 140 |
| phone triangles | 1,146,570 | **628,216** | ≤ 900,000 |

The triangle count had nearly doubled from 676 k across two rounds of detail work, and the
cause turned out not to be density at all. `renderer.info.render.triangles` counts triangles
*submitted*, and the foliage vertex shader collapsed out-of-range instances to a degenerate
point — no fill, but the whole index buffer still landed in the count. Re-packing each
layer's survivors to the front of its buffer and cutting `instanceCount` took foliage
submission from 582,880 to 148,741–212,241 while *raising* near-field density: the phone
valley framing went from 61 to 715 bamboo instances.

**Verified good**

| | measured |
|---|---|
| sky chroma | saturation 0.342 on the sun frame, up from 0.052 — a per-channel tone knee had been converging all three channels to neutral |
| shadow-side colour | dark-population R−B −36, from +12; §5's `#4a6b8f` cool fill was being delivered at 0.09 irradiance against its authored 0.35 |
| aerial perspective | far massif 1.09× the airlight luminance, from 3.70× |
| wet stone | 16.4% of paving below roughness 0.25, from 0.00%; grazing sky reflectance ×3.4–4.3 |
| shader programs | zero linked dead — audited every capture |
| showcase frames | zero debug UI; the keybind card was 2.84% of every desktop frame |
| tonal range | true blacks and real highlights on 8 of 10 review frames (see open, below) |
| PWA | installs and launches offline |
| bundle | 465 KB gzip, zero external assets |

**Known open**

- **The `wide` highlight gate moved further away, not closer**: p99.9 206 on phone and 211
  on desktop, against 225/224 before, where the gate is > 235. This is a consequence of the
  aerial-perspective fix rather than a defect in it — the over-bright far massif *was* the
  frame's highlight energy, and removing it left a framing whose brightest object is sky at
  code ~220. Closing this needs highlight content in that composition, not more tone gain.
- **New: `desktop-sun` lost its true blacks** — p0.1 = 18 against a gate of < 15. The fill
  fix raised delivered ambient irradiance about 11×, and nothing in that frame is fully dark
  any more. `phone-valley` is one level off the same failure at p0.1 = 14.
- **§4's literal light levels are breached and need an authoring decision.** Sun intensity
  now reads 7.39 and hemi 1.038, against §4's ~3.0 and ~0.35. A 13° key delivers
  `sin(13°) = 0.225` to flat ground, so the scene sat 2.6 stops into the ACES toe; the fix
  applies one raking-sun compensation to key and fill together, preserving their ratio. The
  architecturally correct home for a scene-exposure correction is PostFX's `exposure`, which
  §4 also pins — at 1.0. Which of those two numbers is the authored one is a call for a
  human, not an owner working inside one file.
- Shadows do not reach past ~70 m on the phone: MEDIUM's `shadowDistance` is 70, so the
  100–200 m band of the valley framing is unshadowed. The knob lives in `src/core/Quality.js`
  and [core] was correctly gated out of round 5, so this is a round-6 hand-off.

`shots/` is gitignored, so the review JSON and frames are container-local; this section is
the durable record. To run the next round see [`ROUND.md`](./ROUND.md) — it is self-contained
and it gates the repair fan-out on what the critic actually found rather than spawning every
owner. Round 5 spawned 7 of 14 teams.

To run the next round, see [`ROUND.md`](./ROUND.md) — it is self-contained, and it gates
the repair fan-out on what the critic actually found rather than spawning every owner.

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
