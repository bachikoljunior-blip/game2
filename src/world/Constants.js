/**
 * Constants.js — the authoritative world frame.
 *
 * Terrain, Level, Props, Foliage, enemy spawns and the cinematic camera all place
 * geometry against these numbers, so they are deliberately boring and deliberately
 * central. Y is absolute metres above sea level: the shrine plateau floor is 812,
 * not 0, which keeps the terrain's own altitude-driven material blending honest.
 *
 * See ARCHITECTURE.md §9.
 */

export const WORLD = {
  ORIGIN: [0, 0, 0],
  EXTENT: 2048,
  PLAYABLE: 220,
  PLATEAU_CENTER: [0, 0],
  PLATEAU_RADIUS: 78,
  PLATEAU_FALLOFF: 34,
  PLATEAU_HEIGHT: 812,
  WATER_LEVEL: 782,
  APPROACH_AZIMUTH: 0,
  VALLEY_AZIMUTH: 135,
  RIDGE_AZIMUTH: 315,
  SUN_AZIMUTH_DEFAULT: 118,
};

/** Convert a plateau-local Y (0 = shrine floor) to a world Y. */
export const toWorldY = (localY) => localY + WORLD.PLATEAU_HEIGHT;

/** True inside the fenced playable region, with an optional margin. */
export function inPlayable(x, z, margin = 0) {
  const h = WORLD.PLAYABLE * 0.5 + margin;
  return x >= -h && x <= h && z >= -h && z <= h;
}

/** Smooth 0..1 weight for the plateau flattening mask, 1 at the centre. */
export function plateauMask(x, z) {
  const dx = x - WORLD.PLATEAU_CENTER[0];
  const dz = z - WORLD.PLATEAU_CENTER[1];
  const d = Math.hypot(dx, dz);
  const inner = WORLD.PLATEAU_RADIUS;
  const outer = inner + WORLD.PLATEAU_FALLOFF;
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  const t = (d - inner) / (outer - inner);
  return 1 - t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep
}
