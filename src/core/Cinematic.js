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
   * It is not a cloud-sea shot and it cannot be one, which the previous comment here
   * asserted and no frame ever showed. Sampling the built heightfield along this ray:
   * the plateau is dead flat at 812 m out to ~130 m and only then falls (802 at 160 m,
   * 763 at 230, 679 at 370). From an eye 5.5 m above that floor the lip subtends 2.4°,
   * so everything past it lands inside 2.4° of the horizon; and the near bamboo —
   * measured off `phone-valley-r9.png` by back-projecting four culm bases, 41–52 m out
   * and 10.7–13.0 m tall — stands 15° into that band. The basin and the cloud deck are
   * occluded, and no camera height reachable from the plateau recovers them: clearing
   * the lip to see the 730 m floor at 240 m needs an eye at ~894 m ASL, 82 m up.
   *
   * So the frame is composed from what is actually there, in three depths rather than
   * two stripes. The eye stands 1.9 m south of the terrace at 2.3 m instead of floating
   * 5.5 m up, and looks 5° off the valley diagonal so the tamagaki's return leg runs
   * *away* from the lens: the rail enters the bottom-left corner at 2.3 m,
   * turns at its corner post on the lower-left third intersection, and recedes across
   * the middle at 8–12 m. That wedge covers 16.4% of the frame by projected footprint
   * (the 15–25% the composition note asks for), against 4.3% at the old pose where the
   * same rail was a 126 px band on the bottom edge. The 40–55 m culms carry the
   * mid-ground, the sun sits 50 px inside the top edge inside the canopy — occluded, so
   * it makes shafts rather than a naked disc — and the grove and glare close the back.
   */
  valley: { pos: [34.4, 2.3, 30.6], target: [186.47, -22.07, 158.2], fov: 44 },

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
