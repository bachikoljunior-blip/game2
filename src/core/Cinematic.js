/**
 * Cinematic.js — deterministic camera poses for the visual review rig.
 *
 * The art-direction critic pass compares still frames against reference, so those
 * frames have to be reproducible: same position, same framing, same time of day,
 * every run. `ctx.debugCam(name)` detaches the gameplay camera, parks the view on a
 * hand-composed shot, and holds it. It is also genuinely useful in development for
 * eyeballing a single material or the god rays through the torii.
 *
 * Shot names must stay in sync with SHOTS in tools/capture.mjs.
 */

import { Vector3 } from 'three';
import { WORLD } from '../world/Constants.js';

const _look = new Vector3();

/** Shots are authored plateau-local (0 = shrine floor); the world frame is absolute MSL. */
const Y0 = WORLD.PLATEAU_HEIGHT;

/**
 * Composed shots, in world space. Framing follows the rule of thirds against the
 * shrine plateau established in Level.js; `fov` is the vertical FOV in degrees.
 */
export const SHOTS = {
  /**
   * The postcard. Looking north-west up the processional axis: the third torii
   * (z = 38.5) cuts the near-left third, the haiden sits on the far third, the
   * ridge closes the top. The sun is ESE at azimuth 118°, so it rakes in from
   * camera-right and throws the torii's shadow across the flagstones toward us.
   */
  hero: { pos: [-11.0, 2.6, 47.0], target: [3.0, 4.2, 16.0], fov: 46 },

  /** Establishing, from the head of the stair — all three torii receding on axis. */
  wide: { pos: [6.0, 9.5, 88.0], target: [0.0, 4.5, 16.0], fov: 52 },

  /** Under the great torii, low and close, so the gate reads at its real scale. */
  torii: { pos: [1.6, 1.45, 45.0], target: [-0.4, 5.2, 33.0], fov: 62 },

  /**
   * The bamboo sea from the overlook — the god-ray and aerial-perspective test.
   *
   * The pose that stood here saw no valley, and the previous comment's claim that "no
   * camera height reachable from the plateau recovers" the basin was wrong in the more
   * useful direction: it is not height that recovers it, it is radius, and the radius
   * needed is small. Both the old comment and this one are ray-marches of the *built*
   * heightfield (offline harness running `_buildMacroField` → `_blendEdges` under a stub
   * ctx; core-field FNV-1a `7e23ca7`, the hash the live page reports), so the difference
   * is not opinion — the old numbers were sampled along a bearing the shot does not use.
   *
   * What the descent actually does, radially from `PLATEAU_CENTER` along this shot's own
   * bearing: 812.0 m at r = 80, 812.2 at 100, 812.0 at 112, 811.8 at 118, 810.0 at 130,
   * 798.8 at 160, 771.9 at 200, 721.0 at 300, bottoming at 498 m ASL — a 314 m drop that
   * crosses `WORLD.WATER_LEVEL` 782 at r ≈ 185.
   *
   * The old eye stood at r = 46.04, inside `WORLD.PLATEAU_RADIUS` 78, and the flat floor
   * carries a 0.2–0.4 m bulge at r = 95–115 that is enough to hide everything past it
   * from an eye 2.3 m up: the last visible ground was 72 m out at 811.9 m ASL — a
   * **visible drop of 0.1 m** — with all 1,928 sampled metres beyond it occluded. Sweeping
   * the eye outward, the visible drop is 0.2 m at r = 78, 0.5 m at r = 95 and **310 m at
   * r = 100**. It is a cliff in the arithmetic as well as in the ground, and the old pose
   * sat on the wrong side of it by four metres of radius.
   *
   * So the eye moves out to r = 112 and up to 6 m, and **the aim is not touched**: az
   * 50.00°, pitch −7.00°, fov 44, focus distance 200 m, all identical to three decimal
   * places. That is deliberate on three counts. The sun is at infinity, so an unchanged
   * aim leaves the disc exactly where it was — 13° elevation against a +15° top edge,
   * 53 px inside it, at x-frac 0.622 — and the god-ray and DOF work judged on this frame
   * is not moved out from under its owners. And a translation that is *forward* relative
   * to the view axis makes the new frustum a strict subset of the old one for every
   * world-static object, which is what keeps a re-siting inside §7: with t_par = 65.0 m
   * along the axis, the perpendicular offsets are 11.7 m vertical against a 26.3 m limit
   * and 1.9 m lateral against 56.8 m. Raising the eye past ~17.7 m would break that.
   *
   * Measured on the new pose, terrain only (foliage stands in part of what is scored as
   * sky here): visible drop **319.4 m**, lowest visible ground 498.6 m ASL, **18.7% of the
   * frame below WATER_LEVEL against 0.0% before**, and a left-third distance ladder of
   * 17 → 20 → 24 → 28 → 1508 → 2116 m from the bottom edge upward, against 6 → 7 → 8 → 9
   * → 12 → 16 m of dead-flat 812 m floor at the old pose. The 150–600 m ring stays empty
   * at any eye height the budget allows — the shoulder between r ≈ 130 and r ≈ 500 hides
   * itself from any nearby eye — so the ladder is near/far, not near/mid/far, and that is
   * a property of the landform rather than of this pose.
   *
   * The tamagaki no longer enters the frame: `LAYOUT.rimRadius` is 74 and the eye is now
   * 38 m outside it. `LAYOUT.overlook` (r = 50.9) contradicts the built terrain by the
   * same 60-odd metres, and if `world` moves it out to the real lip it wants to land at
   * r ≈ 118–126, where it reads across the bottom edge rather than under the camera.
   */
  valley: { pos: [83.68, 6.00, 74.44], target: [235.77, -18.37, 202.04], fov: 44 },

  /**
   * Straight into the sun through the great torii — the disc and god-ray test.
   *
   * This shot exists because the axis framings do not contain the sun at all: measured
   * from the running pipeline, `hero` sits 93° off it (behind the camera plane),
   * `torii` 119.8° and `wide` 122.8°. A reviewer correctly reported "no sun disc
   * anywhere" and it was a framing fault, not a renderer one. (`valley` now holds the
   * disc 50 px inside its top edge, but buried in the canopy — shafts, not a disc.)
   *
   * The sun is ESE at 13° elevation, direction (0.86, 0.225, 0.457). Crepuscular rays
   * need the occluder beside the disc, not on it, and two poses in a row put it on the
   * disc. The second one — pos (-3.96, 1.8, 35.76) — claimed in this comment to leave
   * the disc "in the open bay at ~3.2 m"; it did clear the rope by 0.20 m, but the ray
   * ran 0.087 m *inside* a straw tassel of the shimenawa and grazed 8 mm over the near
   * chōchin, landing at UV (0.500, 0.500) on rope. That is what "no sun disc in frame"
   * was, for three rounds.
   *
   * **A target nudge cannot fix it.** The sun is at infinity, so its world ray from a
   * given eye is fixed; rotating the camera moves the disc and its occluder across the
   * frame *together*. Only translating the eye moves the ray off the tassel. Reasoning
   * about this pose has now failed twice, so the pose is chosen by measurement: the ray
   * is intersected against the gate's pillars, nuki, kasagi, rope, five shide, four
   * tassels and both lanterns, in the plane perpendicular to the sun — the only frame in
   * which a clearance is an angle. Below ~2.3 m at the gate the hangers stop and the bay
   * opens, so the eye drops to 1.0 m and closes to 3.5 m short of the gate plane: the ray
   * then crosses the bay at x = -1.35, 1.80 m above the floor, and the nearest occluder
   * (the centre shide) is 0.424 m away — 4.97°, against a 0.266° solar radius, so the
   * disc clears with 0.40 m of slack for the shide's wind flutter. The upright, the nuki,
   * the rope and the whole comb of shide cross the fan above and beside it, and the disc
   * lands at UV (0.605, 0.455) rather than dead on the centre cross.
   */
  sun: { pos: [-4.4, 1.0, 36.9], target: [52.44, 12.25, 52.31], fov: 52 },

  /** Over-the-shoulder gameplay framing, anchored on the gravel arena at z = 26. */
  combat: { pos: [4.4, 2.9, 8.0], target: [-1.4, 1.55, -3.2], fov: 55, follow: true },

  /** Character and material detail: blade, armour lacing, cloth weave. */
  closeup: { pos: [1.05, 1.58, 2.2], target: [0.0, 1.48, 0.0], fov: 34, follow: true },
};

export function installCinematic(ctx) {
  const cam = ctx.camera;
  const state = { active: null, savedFov: cam.fov };

  ctx.debugCam = (name) => {
    if (!name || name === 'off') {
      state.active = null;
      if (ctx.playerCamera) ctx.playerCamera.enabled = true;
      cam.fov = state.savedFov;
      cam.updateProjectionMatrix();
      return;
    }
    const shot = SHOTS[name];
    if (!shot) { console.warn(`[cinematic] unknown shot "${name}"`); return; }

    // Anchor the gameplay-adjacent shots to wherever the player actually is, so
    // `combat` frames the fight rather than an empty patch of ground.
    let ox = 0, oz = 0;
    if (shot.follow && ctx.player?.root) {
      ox = ctx.player.root.position.x;
      oz = ctx.player.root.position.z;
    }

    if (ctx.playerCamera) ctx.playerCamera.enabled = false;
    cam.position.set(shot.pos[0] + ox, shot.pos[1] + Y0, shot.pos[2] + oz);
    _look.set(shot.target[0] + ox, shot.target[1] + Y0, shot.target[2] + oz);
    cam.lookAt(_look);
    cam.fov = shot.fov;
    cam.updateProjectionMatrix();
    state.active = name;

    // Rack focus onto the subject so the DOF pass has something considered to do.
    const dist = cam.position.distanceTo(_look);
    ctx.pipeline?.setFocus?.(dist, name === 'closeup' ? 2.4 : 1.2);
  };

  ctx.cinematic = state;

  // Held shots must survive the gameplay camera's own update, which runs later in
  // the system list, so re-assert the pose in a lateUpdate-ordered system.
  ctx.engine.add({
    lateUpdate() {
      if (!state.active) return;
      const shot = SHOTS[state.active];
      let ox = 0, oz = 0;
      if (shot.follow && ctx.player?.root) {
        ox = ctx.player.root.position.x;
        oz = ctx.player.root.position.z;
      }
      cam.position.set(shot.pos[0] + ox, shot.pos[1] + Y0, shot.pos[2] + oz);
      _look.set(shot.target[0] + ox, shot.target[1] + Y0, shot.target[2] + oz);
      cam.lookAt(_look);
    },
  });
}
