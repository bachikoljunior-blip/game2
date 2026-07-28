# KAGEROU 陽炎 — Architecture Contract

A mobile-first, AAA-grade samurai action game (third person) in Three.js.
Reference bar: **Ghost of Tsushima** / **SEKIRO** for look and feel — not Call of Duty.

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
  terrain,       // Terrain           — src/world/Terrain.js
  level,         // Level             — src/world/Level.js
  foliage,       // FoliageSystem     — src/render/Foliage.js
  physics,       // PhysicsWorld      — src/gameplay/Physics.js
  fx,            // EffectsSystem     — src/fx/Effects.js
  weather,       // WeatherSystem     — src/fx/Weather.js
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
