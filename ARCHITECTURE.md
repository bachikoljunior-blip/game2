# KAGEROU 陽炎 — Architecture Contract

A mobile-first, AAA-grade samurai action game (third person) in Three.js.
Reference bar: **Ghost of Tsushima** / **SEKIRO** for look and feel — not Call of Duty.

The bar is per element, not one global impression: `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml`
assigns every element (combat, movement, camera, exploration, world, narrative, character,
choice, UI, touch, visuals, animation, audio, AI, performance, stability) its own reference
title and its own measurable criterion. Read your element's entry before you change it. It is
also binding in the other direction: principles only — copying any reference title's
characters, world, layout, UI, staging, music or design is forbidden there and here.

Every contributor (human or agent) MUST follow this contract so parallel work composes.

---

## 0. Hard rules

1. **No external asset downloads.** No CDN, no `.glb`, no image files fetched at runtime.
   Every texture, mesh, animation and sound is generated procedurally in JS/GLSL at boot.
   This is what makes the build a single self-contained bundle that loads instantly on a phone.
2. **Mobile is the primary target.** 60 fps on a mid-range Android (Adreno 640-class) at
   `TIER.MEDIUM` is the pass/fail line. Desktop gets the ULTRA tier for free.
3. **Never hard-code a quality decision.** Read `ctx.quality` (see `src/core/Quality.js`).
   If you need a new knob, add it to *all four* presets in `PRESETS`.
4. **Zero per-frame allocation** in `update()`. Pre-allocate vectors/quaternions at module
   scope or on the instance. No `new Vector3()` inside a loop that runs every frame.
5. **ES modules, `import { X } from 'three'`.** Addons come from `three/examples/jsm/...`.
5a. **No conditionally-stable integrators.** `Engine` clamps `dt` to 0.25 s as a tab-switch
   guard, so *any* frame can arrive with `dt = 0.25`. An explicit-Euler spring
   `v += (-k*x - c*v) * dt` needs `c*dt < 2` to converge; at `c = 2*sqrt(26)` and
   `dt = 0.25` that is 2.55, and it diverges to NaN in about twenty frames. This
   actually shipped, in the player's landing-absorb spring, and it was unreachable at
   60 fps — it only appeared on a device slow enough to hit the clamp, which is
   precisely our target device. **Solve springs analytically** (the critically-damped
   closed form) or use semi-implicit Euler. Never integrate a stiff term explicitly.
5b. **Nothing non-finite may cross a system boundary.** A NaN in one system's output
   becomes an uncaught throw in whichever consumer touches it first — Web Audio and
   three's uniform upload both throw rather than degrade — and a throw inside
   `Engine._frame()` aborts the frame *before* `pipeline.render()`, so the game keeps
   advancing while drawing nothing and `stats.drawCalls` freezes at a stale value.
   Validate what you export, hold the last good value on failure, and warn once.
   Note `typeof NaN === 'number'` and `clamp()` passes NaN straight through.
5c. **Checkpoint and state-injection controls are test-only.** Deterministic capture and
   debug hooks may be present only under an explicit development or capture mode. An
   ordinary release load must not expose writable game state, cinematic teleport, entity
   spawn, or inspection controls through a global object. The test build must prove the
   hooks work; the release gate must prove they are unreachable in normal production use.
6. **Own only your files.** Do not edit files listed under another system's ownership.
7. Comments explain *why*, not *what*. Match the surrounding density.

---

## 1. System interface

Every system is a class with this shape. All methods are optional except the constructor.

```js
export class MySystem {
  constructor(ctx) { this.ctx = ctx; }
  async init() {}                          // async setup; may await other systems being ready
  update(dt, elapsed, rawDt) {}            // dt is time-scaled, rawDt is not (use for UI)
  lateUpdate(dt, elapsed, rawDt) {}        // after render — camera/trail cleanup
  resize(w, h, bufW, bufH) {}              // CSS px and drawing-buffer px
  applyQuality(quality) {}                 // tier changed at runtime
  dispose() {}
}
```

Register with `engine.add(system)`; update order is registration order.

---

## 2. The context object (`ctx`)

Built in `src/main.js` and passed to every system constructor.

```js
ctx = {
  engine,        // Engine instance
  renderer,      // THREE.WebGLRenderer
  scene,         // THREE.Scene
  camera,        // THREE.PerspectiveCamera
  quality,       // Quality instance — read every tier knob from here
  input,         // Input instance — read ctx.input.state
  bus,           // EventBus: on(name, fn) / off(name, fn) / emit(name, payload)

  // populated during boot, in this order:
  materials,     // MaterialLibrary   — src/render/Materials.js
  sky,           // SkySystem         — src/render/Sky.js
  lighting,      // LightingSystem    — src/render/Lighting.js
  physics,       // PhysicsWorld      — src/gameplay/Physics.js
  terrain,       // Terrain           — src/world/Terrain.js
  fx,            // EffectsSystem     — src/fx/Effects.js
  weather,       // WeatherSystem     — src/fx/Weather.js   (owns the wind field)
  level,         // Level             — src/world/Level.js
  foliage,       // FoliageSystem     — src/render/Foliage.js
  audio,         // AudioSystem       — src/core/Audio.js
  player,        // Player            — src/gameplay/Player.js
  combat,        // CombatDirector    — src/gameplay/Combat.js
  enemies,       // EnemyManager      — src/gameplay/Enemy.js
  hud,           // HUD               — src/ui/HUD.js
  pipeline,      // PostFX            — src/render/PostFX.js
}
```

`ctx.bus` events (payload shapes are authoritative — do not invent variants):

| event | payload | emitted by |
|---|---|---|
| `hit` | `{ attacker, target, point:Vector3, normal:Vector3, damage, poise, kind:'slash'\|'thrust'\|'blunt', crit:boolean }` | Combat |
| `parry` | `{ defender, attacker, point:Vector3, perfect:boolean }` | Combat |
| `clash` | `{ a, b, point:Vector3 }` | Combat |
| `death` | `{ entity, point:Vector3, direction:Vector3 }` | Combat |
| `footstep` | `{ entity, point:Vector3, surface:string, speed:number }` | Player / Enemy |
| `slash` | `{ entity, from:Vector3, to:Vector3, arc:number, heavy:boolean }` | Combat |
| `camera-shake` | `{ amount:number, duration:number, freq?:number }` | anyone |
| `hitstop` | `{ scale:number, duration:number }` | Combat |
| `stance-change` | `{ entity, stance:string }` | Player |
| `posture-break` | `{ entity }` | Combat |
| `objective` | `{ text:string, sub?:string }` | Level |
| `damage-taken` | `{ entity, amount, direction:Vector3 }` | Combat |

---

## 3. Entity contract

Player and enemies both satisfy this so Combat/AI/FX can treat them uniformly.

```js
entity = {
  id: number,
  faction: 'player' | 'oni',
  root: THREE.Object3D,          // world transform, feet at y = 0 of the object
  rig: Rig,                      // src/anim/Rig.js — bones + procedural animation
  position: Vector3,             // === root.position (alias, do not copy)
  forward: Vector3,              // unit, updated each frame
  velocity: Vector3,
  radius: number,                // capsule radius, metres
  height: number,                // capsule height, metres
  health: number, maxHealth: number,
  posture: number, maxPosture: number,   // Sekiro-style; break => stagger window
  state: string,                 // 'idle'|'move'|'attack'|'guard'|'parry'|'dodge'|'stagger'|'dead'
  invulnerable: boolean,
  hitboxes: [{ bone:string, offset:Vector3, radius:number }],
  weapon: { tipBone:string, length:number, active:boolean, damage:number },
  onDamage(payload) {},
  isAlive: boolean,
}
```

---

## 4. Units and conventions

- **1 unit = 1 metre.** Player is 1.75 m tall, eye at 1.62 m.
- **+Y is up, -Z is forward** for a default-facing character.
- Walk 1.9 m/s, run 5.4 m/s, sprint 7.2 m/s.
- Gravity −22 m/s² (game-feel gravity, not 9.81).
- Colour: author all albedo in **sRGB** (`texture.colorSpace = SRGBColorSpace`),
  normal/roughness/AO in **linear** (leave `NoColorSpace`).
- Sun intensity ~3.0, ambient/hemi ~0.35 under ACES tone mapping with exposure 1.0.

---

## 5. Art direction (binding)

**Setting:** a mountain shrine above a bamboo sea at *magic hour*, autumn. Mist in the
valley. Vermilion torii. Weathered cedar. Wet stone. Falling sakura and drifting embers.

**Palette**
- key light `#ffd9a8` → `#ff9b52` at low sun
- shadow/ambient `#4a6b8f` (cool sky bounce) — never neutral grey
- vermilion `#c8321e`, cedar `#5a4436`, moss `#4e6b3c`, stone `#8b8778`
- blood `#7a0d12`, steel `#c9d3dc`, gold leaf `#c9a227`

**Non-negotiable visual features** (a build missing any of these is not AAA):
1. Physically-plausible sky with aerial perspective and a real sun disc.
2. Cascaded shadow maps with contact-hardening on the near cascade.
3. Ground-truth-ish AO (SSAO/GTAO) + baked vertex AO in crevices.
4. Volumetric god rays through the torii and bamboo.
5. Wind that visibly propagates as *gusts* across grass, bamboo, banners and cloth.
6. Katana blade with anisotropic specular and a proper motion trail (ribbon, not sprite).
7. Bloom with a soft, wide, non-blown falloff. Filmic grade. Subtle grain + vignette.
8. Impact language: hit-stop, camera shake, sparks, a blood mist card, a decal.
9. No untextured flat-colour surfaces anywhere in frame. Everything has grain.
10. Silhouette readability: enemies rim-lit against the background at all times.

---

## 6. Mobile UX (binding)

- Left thumb = floating analogue stick (origin snaps to first touch).
- Right thumb = camera drag; a **flick** is a slash whose direction is the flick direction,
  a **tap** is a light attack.
- Four HUD buttons, bottom-right, thumb-reachable arc: Guard/Parry (hold), Dodge, Special, Lock-on.
- Everything respects `env(safe-area-inset-*)`.
- Buttons ≥ 48 CSS px, hit zone padded to 64.
- HUD is drawn to a **2D canvas overlay**, not DOM — one composite, no layout thrash.
- The game must be playable one-handed-ish: auto-face-nearest-enemy assist is on by default.

---

## 7. Performance budget (TIER.MEDIUM, 1280×720 buffer)

| | budget |
|---|---|
| draw calls | ≤ 140 |
| triangles | ≤ 900 k |
| JS per frame | ≤ 5 ms |
| textures | ≤ 48 MB |
| bundle (gzip) | ≤ 1.6 MB |

Instance everything that repeats. Merge everything static. One material per texture atlas.

---

## 8. Files and ownership

```
src/
  main.js              orchestration                        [core]
  core/
    Engine.js          renderer, loop, adaptive res          [core]
    Quality.js         tiers                                 [core]
    Input.js           unified input                         [core]
    EventBus.js        pub/sub                               [core]
    Audio.js           procedural audio                      [audio]
    Noise.js           shared noise (simplex/fbm/worley)     [core]
    Cinematic.js       deterministic review camera poses     [core]
  render/
    Materials.js       procedural PBR texture library        [materials]
    Sky.js             atmosphere, sun, env, time-of-day     [sky]
    PostFX.js          composer chain                        [postfx]
    Foliage.js         instanced grass/bamboo/trees + wind   [foliage]
    Lighting.js        CSM sun, fill, light probes           [sky]
  world/
    Terrain.js         heightfield + splat + collision       [world]
    Props.js           torii, lanterns, buildings, bridges   [world]
    Level.js           layout, spawns, objectives            [world]
    Constants.js       authoritative world frame             [world]
  anim/
    Rig.js             skeleton + procedural animation       [anim]
    Poses.js           keyframe pose library                 [anim]
  gameplay/
    Physics.js         capsule controller, raycast, ragdoll  [physics]
    Player.js          player entity + controller            [player]
    PlayerCamera.js    cinematic TPS camera + lock-on        [player]
    Combat.js          combat director, hit resolution       [combat]
    Enemy.js           enemy entity + manager                [enemy]
    EnemyAI.js         behaviour trees / utility AI          [enemy]
  fx/
    Effects.js         trails, sparks, blood, decals, dust   [fx]
    Weather.js         petals, rain, embers, volumetric fog  [fx]
  ui/
    HUD.js             canvas2d HUD                          [ui]
    TouchControls.js   on-screen controls rendering          [ui]
    Menus.js           title / pause / settings              [ui]
```

---

## 9. World constants (authoritative)

Every system that places something in the world reads these. They are fixed — Terrain,
Level, Props, Foliage, Enemy spawns and the Cinematic shots all assume them.

```js
export const WORLD = {
  ORIGIN: [0, 0, 0],        // the shrine's honden (main hall) doorway sits here, facing +Z
  EXTENT: 2048,             // terrain spans [-1024, 1024] on X and Z
  PLAYABLE: 220,            // the fenced playable region, [-110, 110] on X and Z
  PLATEAU_CENTER: [0, 0],   // XZ centre of the flattened shrine plateau
  PLATEAU_RADIUS: 78,       // flattening falls off smoothly from here to +34 m
  PLATEAU_HEIGHT: 812,      // metres above sea level; the plateau is flat at this height
  WATER_LEVEL: 782,         // the stream surface, 30 m below the plateau
  APPROACH_AZIMUTH: 0,      // the stair climb arrives from +Z (south)
  VALLEY_AZIMUTH: 135,      // the bamboo sea falls away to the south-east
  RIDGE_AZIMUTH: 315,       // rock ridges rise to the north-west
  SUN_AZIMUTH_DEFAULT: 118, // magic hour, low over the valley — backlights the bamboo
};
```

**All world Y coordinates are absolute metres above sea level**, so the plateau floor is
`812`, not `0`. `Cinematic.js` shot positions are authored relative to the plateau and are
offset by `PLATEAU_HEIGHT` at install time. If you need a local frame, subtract
`WORLD.PLATEAU_HEIGHT`.

`WORLD` lives in `src/world/Constants.js` and is imported, never re-declared.


---

## 10. The wind field (single source of truth)

`WeatherSystem` owns the wind. **Nothing else may implement its own gust maths.** The whole
point of ARCHITECTURE §5.5 is that one gust wavefront crosses the valley and bends grass,
bamboo, banners, cloth and drifting petals *together*; two independent implementations, even
with identical formulas, drift apart the moment either is retuned.

Weather boots before Level and Foliage precisely so they can consume it.

**GPU side** — import the strings, splice the uniforms in by object identity:

```js
import { WIND_GLSL, WIND_UNIFORMS_GLSL } from '../fx/Weather.js';
// ...
material.uniforms.uWind = ctx.weather.windUniforms.uWind;   // SAME OBJECT, not a copy
material.uniforms.uGust = ctx.weather.windUniforms.uGust;
```

`WIND_GLSL` already includes `glslNoise` and the uniform block, and defines:

```glsl
float kagerouGust(vec2 xz);                                    // 0..1 travelling-front envelope
vec3  kagerouWind(vec3 worldPos);                              // m/s
vec3  kagerouBend(vec3 worldPos, float h01, float stiffness);  // >1 stiff (bamboo), <1 limp (grass)
```

Uniform layout, for anyone writing a shader by hand:
`uWind = vec4(dirX, dirZ, baseStrength, time)`,
`uGust = vec4(amplitude, 1/wavelength, frontSpeed, turbulence)`.

**CPU side** — `ctx.weather.windAt(x, z, y, outVec3)` and `ctx.weather.gustAt(x, z)`. These
are the exact same maths as the GPU twin, so Verlet cloth on a rig flutters on the same gust
that is bending the grass under it. `ctx.wind` (`{direction:{x,z}, strength, gust, time}`) is
written in place every frame as a cheap read for anything that only needs a scalar.

The instance also mirrors `ctx.weather.WIND_GLSL` / `.WIND_UNIFORMS_GLSL` so a consumer that
only has `ctx` does not need a module import.
