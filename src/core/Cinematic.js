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
  /** The postcard: torii in the near third, bamboo valley falling away behind. */
  hero: { pos: [14.5, 3.4, 22.0], target: [-2.0, 2.6, -6.0], fov: 46 },
  /** Establishing wide from the approach stair, whole shrine in silhouette. */
  wide: { pos: [2.0, 8.5, 46.0], target: [0.0, 4.0, -14.0], fov: 52 },
  /** Straight through the torii into the sun — the god-ray shot. */
  torii: { pos: [0.0, 1.75, 16.0], target: [0.0, 3.2, -30.0], fov: 60 },
  /** Over-the-shoulder gameplay framing with enemies in the mid-ground. */
  combat: { pos: [3.2, 2.7, 7.4], target: [-1.2, 1.5, -3.0], fov: 55, follow: true },
  /** Materials and character detail: blade, armour lacing, cloth. */
  closeup: { pos: [1.1, 1.62, 2.3], target: [0.0, 1.5, 0.0], fov: 34 },
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
