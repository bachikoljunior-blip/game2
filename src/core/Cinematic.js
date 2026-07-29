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
   * Down over the bamboo sea from the cliff overlook — the god-ray, aerial-perspective
   * and cloud-sea test.
   *
   * The framing has to *look down*, and the first version did not: it sat at +3.46°
   * pitch, so the basin fell 94% down the frame behind the balustrade and the cloud sea
   * was never in shot. Terrain along this ray runs 812.9 m at 50 m out, 798 at 100,
   * 791 at 150, 750 at 200, 723 at 250, 634 at 400, while the valley cloud deck tops
   * out at 795 m — so the ground only drops under the sea beyond ~130 m. Aiming 200 m
   * out and 57 m down puts the horizon in the upper third, the cloud sea across the
   * middle, and the near rim in the foreground.
   */
  valley: { pos: [33.0, 5.5, 33.0], target: [175.0, -52.0, 175.0], fov: 54 },

  /**
   * Straight into the sun through the great torii — the disc and god-ray test.
   *
   * This shot exists because the other five do not contain the sun at all: measured
   * from the running pipeline, `hero` sits 93° off it (behind the camera plane),
   * `torii` 119.8°, `wide` 122.8°, and `valley` puts it 61 px above the top edge. A
   * reviewer correctly reported "no sun disc anywhere" and it was a framing fault,
   * not a renderer one — recomposing `valley` to look down at the cloud sea pushed
   * the sun out of the last shot that had it.
   *
   * The sun is ESE at 13° elevation, direction (0.86, 0.225, 0.457). Standing 12 m
   * short of the great torii on that bearing puts the ray through the gate opening
   * at 4.5 m — under the 5.6 m kasagi — so the uprights and the shimenawa are between
   * the lens and the disc, which is what god rays need to be legible.
   */
  sun: { pos: [-10.3, 1.8, 33.0], target: [41.3, 15.3, 60.4], fov: 52 },

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
