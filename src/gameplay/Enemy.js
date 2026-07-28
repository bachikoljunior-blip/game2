/**
 * Enemy.js — the oni: archetypes, entity, state machine, pool and manager.
 *
 * An Enemy satisfies the §3 entity contract identically to the Player, so Combat, the
 * HUD and the lock-on camera never branch on faction. Everything that makes one
 * archetype feel different from another lives in the ARCHETYPES table below and nowhere
 * else — the state machine is shared, the numbers are not. That is deliberate: a
 * designer retunes the Ōyoroi by editing one object, not by reading the FSM.
 *
 * Division of responsibility:
 *   EnemyAI.js  decides *what* to do (utility scoring, perception, group behaviour)
 *   Enemy.js    decides *how* it looks and feels (FSM, locomotion, animation, timings)
 *   Combat.js   owns every damage decision. We only drive intent, animation and the
 *               `weapon.active` window, and we ask for an attack token first so that
 *               two enemies can never swing at the player on the same frame.
 *
 * Zero per-frame allocation: vectors are module-scope scratch or instance-owned,
 * callbacks are bound once in the constructor, arrays are reused in place.
 */

import {
  Vector3, Group, Mesh, MeshStandardMaterial, CapsuleGeometry, BoxGeometry, Color,
} from 'three';
import { makeRandom, clamp, lerp, smoothstep, damp, noise } from '../core/Noise.js';
import { EnemyAI } from './EnemyAI.js';

// --------------------------------------------------------------------------- constants

/** Game-feel gravity (ARCHITECTURE §4), not 9.81. */
const GRAVITY = -22;

/** LOD ring radii in metres at HIGH; scaled per tier in `_applyLimits()`. */
const LOD_NEAR = 25;
const LOD_FAR = 60;

/** Corpses hold the frame for a beat before sinking away — instant despawn reads as a bug. */
const CORPSE_LINGER = 7.5;
const CORPSE_FADE = 2.2;

/** Minimum readable windups on a phone screen. Enforced by `normalizeArchetypes()`. */
const MIN_STARTUP_LIGHT = 0.22;
const MIN_STARTUP_HEAVY = 0.38;

let _nextEnemyId = 9000;

// module-scope scratch — never allocate inside update()
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

// ------------------------------------------------------------------------- clip names

/**
 * Every clip name we ever hand to `rig.play()`. Exported so Rig.js/Poses.js can
 * enumerate exactly what the enemies need without reading this file.
 */
export const CLIP_NAMES = [
  // locomotion + idle life
  'idle', 'idle_alert', 'walk', 'run', 'strafe_l', 'strafe_r', 'back',
  'turn_l', 'turn_r', 'stance_shift', 'look_around', 'taunt', 'alert',
  // defence + reaction
  'guard', 'guard_hit', 'parry', 'riposte_ready',
  'dodge_back', 'dodge_left', 'dodge_right', 'roll_back',
  'hit_light', 'hit_heavy', 'stagger', 'posture_break', 'executed', 'death', 'death_back',
  // 足軽 — yari
  'atk_spear_thrust', 'atk_spear_thrust_step', 'atk_spear_sweep', 'atk_spear_shove',
  // 浪人 — katana
  'atk_katana_slash1', 'atk_katana_slash2', 'atk_katana_slash3',
  'atk_katana_kesa', 'atk_katana_tsuki', 'atk_katana_feint', 'atk_katana_riposte',
  // 大鎧 — ōdachi
  'atk_odachi_overhead', 'atk_odachi_cleave', 'atk_odachi_cleave_back',
  'atk_odachi_charge', 'atk_odachi_slam',
  // 忍 — kusarigama / short blades
  'atk_kama_flurry1', 'atk_kama_flurry2', 'atk_kama_flurry3',
  'atk_kama_dash', 'atk_kama_chain', 'atk_kama_throw',
];

/** Clip-event markers we subscribe to via `rig.on(marker, fn)`. */
export const CLIP_MARKERS = ['hit-active-start', 'hit-active-end', 'footstep', 'feint-cancel'];

// ------------------------------------------------------------------------- archetypes

/**
 * The four oni. Each entry is a complete design document for one fight: silhouette
 * (rig/costume), body, stats, speeds, perception, temperament, moveset.
 *
 * Move fields:
 *   clip        rig clip name
 *   kind        'slash' | 'thrust' | 'blunt' — matches the `hit` payload vocabulary
 *   telegraph   what Combat paints: 'thrust'|'sweep'|'slash'|'heavy'|'unblockable'|
 *               'charge'|'ranged'|'guardbreak'|'dash'|'feint'
 *   startup/active/recovery   seconds; startup IS the telegraph length
 *   damage / posture          published on `weapon`; Combat resolves, we never apply
 *   reach / minRange / maxRange   metres, read by the utility scorer
 *   advance     metres of root motion driven forward across startup+active
 *   cancel      0..1 how far into recovery the move may be cancelled into a chain
 *   chain       [moveId] follow-ups, gated by `chainChance`
 *   hold        extra beat inserted inside the windup — the parry bait
 *   weight      base utility weight (0 = never chosen as an opener)
 *   cooldown    per-move cooldown, seconds
 */
export const ARCHETYPES = {

  // ── 足軽 ── the tutorial enemy. Long reach, huge tells, folds under pressure.
  ashigaru: {
    key: 'ashigaru', kanji: '足軽', name: 'Ashigaru', threat: 1,
    rig: {
      variant: 'oni', build: 'lean', height: 1.70,
      costume: {
        silhouette: 'ashigaru',
        hat: 'jingasa', armour: 'light', chest: 'do_maru', sleeves: 'kosode',
        cape: false, sashimono: true, sash: true, mask: false,
        palette: {
          cloth: 0x3d4a52, armour: 0x4a4038, lacing: 0x8b8778,
          trim: 0xc8321e, metal: 0x8b8f95, skin: 0xa9835e,
        },
        weapon: 'yari',
      },
    },
    body: { radius: 0.33, height: 1.70, eye: 1.56, hitScale: 1.0 },
    stats: {
      health: 70, posture: 55, poise: 0.15, postureRegen: 7.5, postureRegenDelay: 1.4,
      staggerTime: 0.62, breakTime: 2.7, guardAbsorb: 0.62, guardPostureMult: 1.5,
    },
    speeds: { walk: 1.5, run: 4.2, strafe: 1.75, back: 1.3, turn: 4.4, accel: 10, dodgeSpeed: 5.2 },
    perception: { sight: 24, fov: 2.30, peripheral: 3.0, hearing: 16, alertRate: 1.05, calmRate: 0.20, losInterval: 0.5 },
    temperament: {
      aggression: 0.42, parrySkill: 0.06, dodgeSkill: 0.18, guardSkill: 0.34,
      reactionMin: 0.240, reactionMax: 0.320, feintChance: 0.05, chainChance: 0.30,
      preferredRange: 3.0, circleRange: 3.4, breakDistance: 5.5, whiffBackoff: 1.0,
      attackCooldown: 1.5, patience: 1.5, courage: 0.35, flankiness: 0.25,
    },
    weapon: {
      tipBone: 'yari_tip', gripBone: 'hand_r', length: 2.15, kind: 'thrust',
      trail: 'spear', profile: 'pole',
    },
    moves: {
      thrust: {
        clip: 'atk_spear_thrust', kind: 'thrust', telegraph: 'thrust',
        startup: 0.52, active: 0.10, recovery: 0.66,
        damage: 15, posture: 11, reach: 3.3, minRange: 1.5, maxRange: 3.6,
        advance: 1.3, weight: 1.0, cooldown: 1.5,
        chain: ['thrust'], chainChance: 0.22,
      },
      stepThrust: {
        clip: 'atk_spear_thrust_step', kind: 'thrust', telegraph: 'thrust',
        startup: 0.62, active: 0.12, recovery: 0.58,
        damage: 19, posture: 15, reach: 3.9, minRange: 2.4, maxRange: 5.2,
        advance: 2.7, weight: 0.72, cooldown: 2.8,
        chain: ['thrust'], chainChance: 0.35,
      },
      sweep: {
        // The answer to a player who thinks circling a spearman is free.
        clip: 'atk_spear_sweep', kind: 'slash', telegraph: 'sweep',
        startup: 0.46, active: 0.18, recovery: 0.74,
        damage: 12, posture: 17, reach: 2.7, minRange: 0.6, maxRange: 2.9,
        advance: 0.35, arc: 2.4, weight: 0.8, cooldown: 2.4,
      },
      shove: {
        clip: 'atk_spear_shove', kind: 'blunt', telegraph: 'guardbreak',
        startup: 0.42, active: 0.14, recovery: 0.72,
        damage: 6, posture: 28, reach: 2.1, minRange: 0.6, maxRange: 2.3,
        advance: 0.9, guardBreak: true, weight: 0.34, cooldown: 5.5,
      },
    },
    openers: ['thrust', 'stepThrust', 'sweep', 'shove'],
  },

  // ── 浪人 ── the mirror match. Reads you, feints you, and the third beat is late.
  ronin: {
    key: 'ronin', kanji: '浪人', name: 'Ronin', threat: 2,
    rig: {
      variant: 'oni', build: 'athletic', height: 1.76,
      costume: {
        silhouette: 'ronin',
        hat: false, armour: 'none', chest: 'kimono', sleeves: 'haori',
        cape: 'haori', sashimono: false, sash: true, mask: false, topknot: true,
        palette: {
          cloth: 0x2a2f38, armour: 0x3a3128, lacing: 0x5a4436,
          trim: 0x7a1d16, metal: 0xc9d3dc, skin: 0xb08a63,
        },
        weapon: 'katana',
      },
    },
    body: { radius: 0.35, height: 1.76, eye: 1.62, hitScale: 1.0 },
    stats: {
      health: 115, posture: 110, poise: 0.35, postureRegen: 11, postureRegenDelay: 1.1,
      staggerTime: 0.46, breakTime: 2.3, guardAbsorb: 0.86, guardPostureMult: 1.1,
    },
    speeds: { walk: 1.8, run: 5.0, strafe: 2.5, back: 1.9, turn: 6.4, accel: 14, dodgeSpeed: 6.4 },
    perception: { sight: 30, fov: 2.44, peripheral: 3.2, hearing: 20, alertRate: 1.5, calmRate: 0.14, losInterval: 0.4 },
    temperament: {
      aggression: 0.66, parrySkill: 0.62, dodgeSkill: 0.55, guardSkill: 0.78,
      reactionMin: 0.150, reactionMax: 0.250, feintChance: 0.34, chainChance: 0.72,
      preferredRange: 2.1, circleRange: 2.9, breakDistance: 6.5, whiffBackoff: 0.25,
      attackCooldown: 1.0, patience: 0.9, courage: 0.8, flankiness: 0.5,
    },
    weapon: {
      tipBone: 'katana_tip', gripBone: 'hand_r', length: 1.02, kind: 'slash',
      trail: 'katana', profile: 'blade',
    },
    moves: {
      slash1: {
        clip: 'atk_katana_slash1', kind: 'slash', telegraph: 'slash',
        startup: 0.30, active: 0.10, recovery: 0.32,
        damage: 13, posture: 12, reach: 2.2, minRange: 0.5, maxRange: 2.6,
        advance: 0.9, cancel: 0.55, weight: 1.0, cooldown: 0.9,
        chain: ['slash2'], chainChance: 0.85,
      },
      slash2: {
        clip: 'atk_katana_slash2', kind: 'slash', telegraph: 'slash',
        startup: 0.24, active: 0.10, recovery: 0.36,
        damage: 14, posture: 13, reach: 2.3, minRange: 0.4, maxRange: 2.7,
        advance: 0.7, cancel: 0.5, weight: 0, cooldown: 0,
        chain: ['slash3'], chainChance: 0.8, follower: true,
      },
      slash3: {
        // The bait: a visible hold inside the windup, so a parry pressed on the
        // rhythm of the first two beats whiffs and eats the whole thing.
        clip: 'atk_katana_slash3', kind: 'slash', telegraph: 'heavy',
        startup: 0.66, hold: 0.26, active: 0.12, recovery: 0.62,
        damage: 21, posture: 24, reach: 2.5, minRange: 0.4, maxRange: 2.9,
        advance: 1.1, weight: 0, cooldown: 0, follower: true,
      },
      kesa: {
        clip: 'atk_katana_kesa', kind: 'slash', telegraph: 'heavy',
        startup: 0.48, active: 0.12, recovery: 0.60,
        damage: 22, posture: 25, reach: 2.5, minRange: 0.7, maxRange: 3.0,
        advance: 1.4, weight: 0.66, cooldown: 3.2,
      },
      tsuki: {
        clip: 'atk_katana_tsuki', kind: 'thrust', telegraph: 'thrust',
        startup: 0.36, active: 0.09, recovery: 0.46,
        damage: 16, posture: 15, reach: 2.7, minRange: 1.2, maxRange: 3.2,
        advance: 1.6, weight: 0.55, cooldown: 2.6,
      },
      feint: {
        clip: 'atk_katana_feint', kind: 'slash', telegraph: 'feint',
        startup: 0.32, active: 0, recovery: 0.34,
        damage: 0, posture: 0, reach: 2.2, minRange: 0.6, maxRange: 3.0,
        advance: 0.5, feint: true, cancel: 0.9, weight: 0, cooldown: 3.5,
        chain: ['slash1', 'kesa'], chainChance: 0.65,
      },
      riposte: {
        clip: 'atk_katana_riposte', kind: 'slash', telegraph: 'slash',
        startup: 0.24, active: 0.10, recovery: 0.40,
        damage: 25, posture: 22, reach: 2.2, minRange: 0.3, maxRange: 2.6,
        advance: 1.0, weight: 0, cooldown: 0.4, punish: true,
      },
    },
    openers: ['slash1', 'kesa', 'tsuki'],
  },

  // ── 大鎧 ── a wall that walks. Light hits bounce. The 危 overhead is not blockable.
  oyoroi: {
    key: 'oyoroi', kanji: '大鎧', name: 'Oyoroi', threat: 4,
    rig: {
      variant: 'oni', build: 'heavy', height: 2.02,
      costume: {
        silhouette: 'oyoroi',
        hat: 'kabuto', armour: 'heavy', chest: 'o_yoroi', sleeves: 'sode',
        cape: 'horo', sashimono: true, sash: false, mask: 'menpo', horns: true,
        palette: {
          cloth: 0x241d1a, armour: 0x50221c, lacing: 0xc9a227,
          trim: 0xc8321e, metal: 0x6d6a63, skin: 0x8c6b4a,
        },
        weapon: 'odachi',
      },
    },
    body: { radius: 0.48, height: 2.02, eye: 1.86, hitScale: 1.28 },
    stats: {
      health: 230, posture: 175, poise: 1.0, postureRegen: 9, postureRegenDelay: 2.2,
      staggerTime: 0.75, breakTime: 3.4, guardAbsorb: 0.92, guardPostureMult: 0.7,
    },
    speeds: { walk: 1.05, run: 2.95, strafe: 1.1, back: 0.85, turn: 2.2, accel: 5.5, dodgeSpeed: 3.4 },
    perception: { sight: 26, fov: 2.10, peripheral: 2.7, hearing: 22, alertRate: 0.8, calmRate: 0.09, losInterval: 0.6 },
    temperament: {
      aggression: 0.78, parrySkill: 0.0, dodgeSkill: 0.05, guardSkill: 0.55,
      reactionMin: 0.260, reactionMax: 0.320, feintChance: 0.0, chainChance: 0.55,
      preferredRange: 2.6, circleRange: 3.2, breakDistance: 9.0, whiffBackoff: 0.0,
      attackCooldown: 2.0, patience: 2.4, courage: 1.0, flankiness: 0.05,
      unstoppable: true,
    },
    weapon: {
      tipBone: 'odachi_tip', gripBone: 'hand_r', length: 1.55, kind: 'slash',
      trail: 'odachi', profile: 'greatblade',
    },
    moves: {
      overhead: {
        // 危 — the one move in the game that must be dodged, never blocked.
        clip: 'atk_odachi_overhead', kind: 'slash', telegraph: 'unblockable',
        startup: 0.94, active: 0.16, recovery: 1.15,
        damage: 44, posture: 58, reach: 3.1, minRange: 0.5, maxRange: 3.6,
        advance: 1.3, unblockable: true, mark: '危', weight: 0.9, cooldown: 6.5,
      },
      cleave: {
        clip: 'atk_odachi_cleave', kind: 'slash', telegraph: 'heavy',
        startup: 0.68, active: 0.20, recovery: 0.92,
        damage: 30, posture: 35, reach: 3.3, minRange: 0.6, maxRange: 3.8,
        advance: 1.0, arc: 2.6, weight: 1.0, cooldown: 3.4,
        chain: ['cleaveBack'], chainChance: 0.6,
      },
      cleaveBack: {
        clip: 'atk_odachi_cleave_back', kind: 'slash', telegraph: 'heavy',
        startup: 0.54, active: 0.20, recovery: 1.0,
        damage: 27, posture: 32, reach: 3.2, minRange: 0.5, maxRange: 3.7,
        advance: 0.6, arc: 2.6, weight: 0, cooldown: 0, follower: true,
      },
      charge: {
        clip: 'atk_odachi_charge', kind: 'blunt', telegraph: 'charge',
        startup: 0.78, active: 0.55, recovery: 1.05,
        damage: 24, posture: 34, reach: 1.8, minRange: 4.0, maxRange: 11.0,
        advance: 7.0, weight: 0.85, cooldown: 8.0,
      },
      slam: {
        clip: 'atk_odachi_slam', kind: 'blunt', telegraph: 'heavy',
        startup: 0.84, active: 0.22, recovery: 1.05,
        damage: 26, posture: 42, reach: 3.5, minRange: 0.0, maxRange: 3.2,
        advance: 0.2, radial: true, shake: 1.4, weight: 0.55, cooldown: 7.0,
      },
    },
    openers: ['cleave', 'overhead', 'slam', 'charge'],
  },

  // ── 忍 ── glass. In, three cuts, out. Punishes greed at range with steel.
  shinobi: {
    key: 'shinobi', kanji: '忍', name: 'Shinobi', threat: 3,
    rig: {
      variant: 'oni', build: 'slight', height: 1.68,
      costume: {
        silhouette: 'shinobi',
        hat: false, armour: 'cloth', chest: 'shinobi_shozoku', sleeves: 'wrapped',
        cape: 'scarf', sashimono: false, sash: true, mask: 'zukin', hood: true,
        palette: {
          cloth: 0x1b2028, armour: 0x232a30, lacing: 0x2e3540,
          trim: 0x4e6b3c, metal: 0xc9d3dc, skin: 0x9c7a55,
        },
        weapon: 'kusarigama',
      },
    },
    body: { radius: 0.30, height: 1.68, eye: 1.55, hitScale: 0.92 },
    stats: {
      health: 62, posture: 62, poise: 0.05, postureRegen: 13, postureRegenDelay: 0.9,
      staggerTime: 0.40, breakTime: 2.0, guardAbsorb: 0.55, guardPostureMult: 1.6,
    },
    speeds: { walk: 2.0, run: 6.1, strafe: 3.2, back: 2.6, turn: 8.5, accel: 20, dodgeSpeed: 8.0 },
    perception: { sight: 32, fov: 2.60, peripheral: 3.4, hearing: 24, alertRate: 1.8, calmRate: 0.12, losInterval: 0.35 },
    temperament: {
      aggression: 0.72, parrySkill: 0.22, dodgeSkill: 0.85, guardSkill: 0.25,
      reactionMin: 0.140, reactionMax: 0.220, feintChance: 0.22, chainChance: 0.9,
      preferredRange: 1.8, circleRange: 4.2, breakDistance: 14.0, whiffBackoff: 0.7,
      attackCooldown: 1.2, patience: 0.55, courage: 0.5, flankiness: 0.9,
      hitAndRun: true,
    },
    weapon: {
      tipBone: 'kama_tip', gripBone: 'hand_r', length: 0.62, kind: 'slash',
      trail: 'kama', profile: 'short',
    },
    moves: {
      flurry1: {
        clip: 'atk_kama_flurry1', kind: 'slash', telegraph: 'slash',
        startup: 0.24, active: 0.08, recovery: 0.24,
        damage: 8, posture: 9, reach: 1.9, minRange: 0.3, maxRange: 2.2,
        advance: 0.8, cancel: 0.6, weight: 1.0, cooldown: 1.1,
        chain: ['flurry2'], chainChance: 0.95,
      },
      flurry2: {
        clip: 'atk_kama_flurry2', kind: 'slash', telegraph: 'slash',
        startup: 0.22, active: 0.08, recovery: 0.24,
        damage: 8, posture: 9, reach: 1.9, minRange: 0.3, maxRange: 2.2,
        advance: 0.6, cancel: 0.6, weight: 0, cooldown: 0,
        chain: ['flurry3'], chainChance: 0.9, follower: true,
      },
      flurry3: {
        clip: 'atk_kama_flurry3', kind: 'slash', telegraph: 'slash',
        startup: 0.26, active: 0.10, recovery: 0.52,
        damage: 12, posture: 14, reach: 2.0, minRange: 0.3, maxRange: 2.3,
        advance: 0.7, weight: 0, cooldown: 0, follower: true, retreatAfter: true,
      },
      dashSlash: {
        clip: 'atk_kama_dash', kind: 'slash', telegraph: 'dash',
        startup: 0.32, active: 0.14, recovery: 0.42,
        damage: 14, posture: 13, reach: 2.1, minRange: 2.5, maxRange: 7.0,
        advance: 5.0, cancel: 0.4, weight: 0.9, cooldown: 3.0,
        chain: ['flurry1'], chainChance: 0.5,
      },
      chainSweep: {
        clip: 'atk_kama_chain', kind: 'slash', telegraph: 'sweep',
        startup: 0.44, active: 0.20, recovery: 0.66,
        damage: 15, posture: 19, reach: 4.3, minRange: 2.0, maxRange: 4.6,
        advance: 0.2, arc: 2.8, weight: 0.72, cooldown: 4.5,
      },
      kunai: {
        clip: 'atk_kama_throw', kind: 'thrust', telegraph: 'ranged',
        startup: 0.36, active: 0.06, recovery: 0.44,
        damage: 9, posture: 7, reach: 0.6, minRange: 5.0, maxRange: 16.0,
        advance: -0.4, ranged: true, projectile: 'kunai', projectileSpeed: 26,
        weight: 0.8, cooldown: 3.2,
      },
    },
    openers: ['dashSlash', 'flurry1', 'kunai', 'chainSweep'],
  },
};

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

/**
 * One-time normalisation: build the iterable move list, clamp windups to the
 * mobile-readability floor, and fill in defaults so the FSM never sees undefined.
 */
function normalizeArchetypes() {
  for (let a = 0; a < ARCHETYPE_KEYS.length; a++) {
    const def = ARCHETYPES[ARCHETYPE_KEYS[a]];
    def.moveList = [];
    const ids = Object.keys(def.moves);
    for (let i = 0; i < ids.length; i++) {
      const m = def.moves[ids[i]];
      m.id = ids[i];
      m.index = i;              // slot in the per-enemy cooldown array
      m.archetype = def.key;
      m.hold = m.hold || 0;
      m.active = m.active || 0;
      m.recovery = m.recovery || 0.3;
      m.advance = m.advance || 0;
      m.cancel = m.cancel || 0;
      m.weight = m.weight || 0;
      m.cooldown = m.cooldown || 0;
      m.minRange = m.minRange || 0;
      m.maxRange = m.maxRange || (m.reach + 0.5);
      m.chain = m.chain || null;
      m.chainChance = m.chainChance || 0;
      m.follower = !!m.follower;
      m.feint = !!m.feint;
      m.ranged = !!m.ranged;
      m.unblockable = !!m.unblockable;
      m.guardBreak = !!m.guardBreak;
      m.punish = !!m.punish;
      m.heavy = !!(m.unblockable || m.telegraph === 'heavy' || m.telegraph === 'charge');
      // Non-negotiable: a phone player must be able to see it coming.
      const floor = m.heavy ? MIN_STARTUP_HEAVY : MIN_STARTUP_LIGHT;
      if (m.startup < floor) m.startup = floor;
      m.total = m.startup + m.active + m.recovery;
      // Where the swing commits — the AI uses this to judge whether it can bail.
      m.commitAt = m.startup * 0.72;
      def.moveList.push(m);
    }
    def.openerMoves = (def.openers || [])
      .map((id) => def.moves[id])
      .filter((m) => !!m && !m.follower && !m.feint);
    if (def.openerMoves.length === 0) {
      def.openerMoves = def.moveList.filter((m) => !m.follower && !m.feint && !m.punish);
    }
    def.feintMove = def.moveList.find((m) => m.feint) || null;
    def.punishMove = def.moveList.find((m) => m.punish) || null;
    def.rangedMove = def.moveList.find((m) => m.ranged) || null;
    def.maxReach = def.moveList.reduce((r, m) => Math.max(r, m.reach), 0);
  }
}
normalizeArchetypes();

/** Hitbox layout, scaled per archetype by `body.hitScale`. */
const HITBOX_TEMPLATE = [
  { bone: 'head', ox: 0, oy: 0.06, oz: 0.01, radius: 0.145 },
  { bone: 'spine_2', ox: 0, oy: 0.06, oz: 0, radius: 0.235 },
  { bone: 'spine_1', ox: 0, oy: 0.02, oz: 0, radius: 0.225 },
  { bone: 'hips', ox: 0, oy: 0, oz: 0, radius: 0.215 },
  { bone: 'upperarm_l', ox: 0, oy: 0, oz: 0, radius: 0.105 },
  { bone: 'upperarm_r', ox: 0, oy: 0, oz: 0, radius: 0.105 },
  { bone: 'forearm_l', ox: 0, oy: 0, oz: 0, radius: 0.090 },
  { bone: 'forearm_r', ox: 0, oy: 0, oz: 0, radius: 0.090 },
  { bone: 'thigh_l', ox: 0, oy: 0, oz: 0, radius: 0.130 },
  { bone: 'thigh_r', ox: 0, oy: 0, oz: 0, radius: 0.130 },
  { bone: 'shin_l', ox: 0, oy: 0, oz: 0, radius: 0.100 },
  { bone: 'shin_r', ox: 0, oy: 0, oz: 0, radius: 0.100 },
];

// ============================================================================= Enemy

export class Enemy {
  /**
   * @param {object} ctx        the game context (ARCHITECTURE §2)
   * @param {string} archetype  key into ARCHETYPES
   * @param {EnemyManager} manager
   */
  constructor(ctx, archetype, manager) {
    this.ctx = ctx;
    this.manager = manager;
    this.def = ARCHETYPES[archetype] || ARCHETYPES.ashigaru;
    this.archetype = this.def.key;

    // ---- §3 entity contract -------------------------------------------------
    this.id = _nextEnemyId++;
    this.faction = 'oni';
    this.root = new Group();
    this.root.name = `enemy_${this.def.key}_${this.id}`;
    this.position = this.root.position;          // alias, never copied
    this.forward = new Vector3(0, 0, -1);
    this.velocity = new Vector3();
    this.radius = this.def.body.radius;
    this.height = this.def.body.height;
    this.maxHealth = this.def.stats.health;
    this.health = this.maxHealth;
    this.maxPosture = this.def.stats.posture;
    this.posture = this.maxPosture;
    this.state = 'idle';
    this.invulnerable = false;
    this.hitboxes = [];
    this.weapon = {
      tipBone: this.def.weapon.tipBone,
      length: this.def.weapon.length,
      active: false,
      damage: 0,
      // extras Combat and FX are welcome to read; the four above are the contract
      posture: 0,
      kind: this.def.weapon.kind,
      unblockable: false,
      guardBreak: false,
      owner: this,
      moveId: null,
      gripBone: this.def.weapon.gripBone,
      profile: this.def.weapon.profile,
      trail: this.def.weapon.trail,
      bladeBase: new Vector3(),
      bladeTip: new Vector3(),
      prevTip: new Vector3(),
    };
    this._alive = true;

    // ---- rig / visuals ------------------------------------------------------
    this.rig = null;
    this.visual = new Group();
    this.root.add(this.visual);
    this._proxy = null;
    this._proxyWeapon = null;
    this._rigFootsteps = false;
    this._markerDriven = false;

    // ---- movement -----------------------------------------------------------
    this.yaw = 0;
    this.targetYaw = 0;
    this.controller = null;
    this.grounded = true;
    this.surface = 'grass';
    this.speed = 0;                 // horizontal speed, m/s
    this.localVel = { x: 0, z: 0 }; // strafe-space velocity for the blend tree
    this._desiredVel = new Vector3();
    this._disp = new Vector3();

    // ---- combat bookkeeping -------------------------------------------------
    this.currentMove = null;
    this.attackTime = 0;
    this.attackPhase = 'none';       // 'startup' | 'active' | 'recovery'
    this.hasToken = false;
    this.tokenKind = null;
    this.lastAttackAt = -99;
    this.lastDamagedAt = -99;
    this.comboIndex = 0;
    /** Per-move cooldowns, indexed by `move.index` — a typed array so the
     *  per-frame tick never walks an object's key list. */
    this.moveCooldowns = new Float32Array(this.def.moveList.length);
    this.stateTime = 0;
    this.stateDuration = 0;
    this.staggerDir = new Vector3(0, 0, 1);
    this.riposteWindow = 0;
    this.poise = this.def.stats.poise;
    this.postureLocked = 0;
    this.aware = 0;                  // 0 unaware, 1 investigating, 2 in combat
    this.target = null;              // whom we are fighting — the player, normally
    this._parryAsked = false;
    this._advanceDone = 0;
    this._projectileFired = false;

    // ---- lifecycle / LOD ----------------------------------------------------
    this.active = false;
    this.lod = 0;
    this.camDist = 0;
    this.corpseTimer = 0;
    this.slotAngle = 0;
    this.slotIndex = 0;
    this.slotCount = 1;
    this._angleCache = 0;
    this._animAccum = 0;
    this._animInterval = 0;
    this._idleTimer = 2 + Math.random() * 3;
    this._breathPhase = Math.random() * 100;
    this._footPhase = 0;
    this._lastClip = null;

    // ---- brain --------------------------------------------------------------
    this.intent = {
      behaviour: 'hold',
      moveDir: new Vector3(),
      moveGain: 0,
      faceDir: new Vector3(0, 0, -1),
      lookAt: new Vector3(),
      hasLook: false,
      attack: null,
      guard: false,
      parry: false,
      dodge: false,
      dodgeDir: new Vector3(),
      taunt: false,
    };
    this.ai = new EnemyAI(this);

    // pooled bus payloads — the bus never allocates, and neither do we
    this._fsPayload = { entity: this, point: new Vector3(), surface: 'grass', speed: 0 };
    this._shakePayload = { amount: 0, duration: 0, freq: 12 };

    this._buildHitboxes();
  }

  // -------------------------------------------------------------------- contract

  get isAlive() { return this._alive; }
  set isAlive(v) {
    if (!v && this._alive) this.die(null);
    else if (v) this._alive = true;
  }

  /** §3 vocabulary projection, for anything that only knows the eight canonical states. */
  get simpleState() {
    switch (this.state) {
      case 'patrol': case 'alert': case 'approach': case 'circle': return 'move';
      case 'postureBroken': return 'stagger';
      case 'executed': return 'dead';
      default: return this.state;
    }
  }

  // ----------------------------------------------------------------------- setup

  _buildHitboxes() {
    const s = this.def.body.hitScale;
    this.hitboxes.length = 0;
    for (let i = 0; i < HITBOX_TEMPLATE.length; i++) {
      const t = HITBOX_TEMPLATE[i];
      this.hitboxes.push({
        bone: t.bone,
        offset: new Vector3(t.ox * s, t.oy * s, t.oz * s),
        radius: t.radius * s,
      });
    }
  }

  /**
   * Build the rig once per pooled instance. Falls back to a blocked-out proxy so a
   * broken Rig.js costs us silhouette quality, not the whole encounter.
   */
  buildVisual(RigClass) {
    if (this.rig || this._proxy) return;
    if (RigClass) {
      try {
        const d = this.def;
        this.rig = new RigClass(this.ctx, {
          variant: d.rig.variant,
          build: d.rig.build,
          height: d.rig.height,
          archetype: d.key,
          faction: 'oni',
          costume: d.rig.costume,
          weapon: d.rig.costume.weapon,
          cloth: !!this.ctx.quality?.cloth,
          parent: this.visual,
          owner: this,
        });
        const obj = this.rig?.root || this.rig?.object3D || this.rig?.group || this.rig?.mesh ||
          (this.rig?.isObject3D ? this.rig : null);
        if (obj && obj.parent !== this.visual) this.visual.add(obj);
      } catch (err) {
        console.warn('[enemy] rig construction failed, using proxy', err);
        this.rig = null;
      }
    }
    if (!this.rig) this._buildProxy();
    this._bindMarkers();
  }

  /** Blocked-out stand-in: readable silhouette, correct height, zero dependencies. */
  _buildProxy() {
    const geo = this.manager?._proxyGeo || null;
    const mats = this.manager?._proxyMats?.[this.def.key] || null;
    const h = this.def.body.height;
    const r = this.def.body.radius;
    const grp = new Group();

    const bodyGeo = geo?.body || new CapsuleGeometry(0.5, 1, 4, 10);
    const boxGeo = geo?.box || new BoxGeometry(1, 1, 1);
    const bodyMat = mats?.body || new MeshStandardMaterial({ color: 0x3a3128, roughness: 0.88 });
    const trimMat = mats?.trim || new MeshStandardMaterial({ color: 0xc8321e, roughness: 0.72 });
    const steelMat = mats?.steel || new MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.3, metalness: 0.86 });

    const torso = new Mesh(bodyGeo, bodyMat);
    torso.scale.set(r * 2, (h - r * 2) * 0.62, r * 2);
    torso.position.y = h * 0.56;
    torso.castShadow = true;
    grp.add(torso);

    const head = new Mesh(boxGeo, trimMat);
    head.scale.set(r * 1.05, r * 1.15, r * 1.0);
    head.position.y = h - r * 0.62;
    head.castShadow = true;
    grp.add(head);

    const len = this.def.weapon.length;
    const w = new Mesh(boxGeo, steelMat);
    w.scale.set(0.045, 0.045, len);
    w.position.set(r * 1.15, h * 0.6, -len * 0.35);
    w.rotation.x = -0.35;
    w.castShadow = true;
    grp.add(w);
    this._proxyWeapon = w;

    this.visual.add(grp);
    this._proxy = grp;
  }

  _bindMarkers() {
    const rig = this.rig;
    if (!rig || typeof rig.on !== 'function') return;
    if (!this._onActiveStart) {
      this._onActiveStart = () => {
        if (!this.currentMove || this.currentMove.feint) return;
        this._markerDriven = true;
        this.weapon.active = true;
        this.attackPhase = 'active';
      };
      this._onActiveEnd = () => {
        this._markerDriven = true;
        this.weapon.active = false;
        if (this.attackPhase === 'active') this.attackPhase = 'recovery';
      };
      this._onRigFootstep = () => { this._rigFootsteps = true; this._emitFootstep(); };
      this._onFeintCancel = () => { if (this.currentMove?.feint) this._endAttack(true); };
    }
    try {
      rig.on('hit-active-start', this._onActiveStart);
      rig.on('hit-active-end', this._onActiveEnd);
      rig.on('footstep', this._onRigFootstep);
      rig.on('feint-cancel', this._onFeintCancel);
    } catch { /* rig without markers — the timers carry the window */ }
  }

  _ensureController() {
    if (this.controller || !this.ctx.physics?.createCharacter) return;
    try {
      this.controller = this.ctx.physics.createCharacter({
        radius: this.radius,
        height: this.height,
        position: this.position,
        stepHeight: 0.42,
        slopeLimit: 0.86,
        mass: this.def.rig.build === 'heavy' ? 160 : 78,
        layer: this.ctx.physics.LAYER?.ENEMY ?? this.ctx.physics.LAYER?.CHARACTER,
        owner: this,
      }) || null;
    } catch (err) {
      console.warn('[enemy] character controller unavailable', err);
      this.controller = null;
    }
  }

  // ------------------------------------------------------------------- lifecycle

  /** Reused from the pool: wipe every scrap of the previous life. */
  reset(position, opts) {
    const o = opts || {};
    this.maxHealth = this.def.stats.health * (o.healthMult ?? 1);
    this.health = o.health ?? this.maxHealth;
    this.maxPosture = this.def.stats.posture * (o.postureMult ?? 1);
    this.posture = this.maxPosture;
    this.poise = this.def.stats.poise;
    this._alive = true;
    this.invulnerable = false;
    this.state = 'idle';
    this.stateTime = 0;
    this.stateDuration = 0;
    this.velocity.set(0, 0, 0);
    this._desiredVel.set(0, 0, 0);
    this.speed = 0;
    this.localVel.x = 0; this.localVel.z = 0;
    this.currentMove = null;
    this.attackPhase = 'none';
    this.attackTime = 0;
    this.comboIndex = 0;
    this.weapon.active = false;
    this.weapon.damage = 0;
    this.weapon.posture = 0;
    this.weapon.unblockable = false;
    this.weapon.guardBreak = false;
    this.weapon.moveId = null;
    this.hasToken = false;
    this.tokenKind = null;
    this.lastAttackAt = -99;
    this.lastDamagedAt = -99;
    this.riposteWindow = 0;
    this.postureLocked = 0;
    this.corpseTimer = 0;
    this.aware = o.alerted ? 2 : 0;
    this.target = o.target || this.ctx.player || null;
    this._markerDriven = false;
    this._parryAsked = false;
    this._advanceDone = 0;
    this._projectileFired = false;
    this._idleTimer = 1.5 + Math.random() * 3;
    this._lastClip = null;
    this._footPhase = 0;
    this.moveCooldowns.fill(0);

    if (position) this.position.set(position.x, position.y, position.z);
    const th = this.ctx.terrain?.heightAt?.(this.position.x, this.position.z);
    if (Number.isFinite(th)) this.position.y = th;
    // Last-resort floor for a boot where neither terrain nor physics came up:
    // without it an enemy free-falls out of the LOD ring and freezes.
    this._groundY = this.position.y;

    if (typeof o.yaw === 'number') this.yaw = o.yaw;
    if (o.faceTarget !== false && this.target?.position) {
      _v1.copy(this.target.position).sub(this.position);
      _v1.y = 0;
      if (_v1.lengthSq() > 1e-4) this.yaw = Math.atan2(-_v1.x, -_v1.z);
    }
    this.targetYaw = this.yaw;
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.set(1, 1, 1);
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
    this.root.visible = true;
    this.active = true;
    this.lod = 0;
    this._animInterval = 0;

    this._ensureController();
    if (this.controller) {
      this.controller.enabled = true;
      if (this.controller.position?.set) {
        this.controller.position.set(this.position.x, this.position.y, this.position.z);
      }
      try { this.controller.teleport?.(this.position); } catch { /* optional */ }
    }

    this.ai.reset(o.seed ?? ((this.id * 2654435761) >>> 0));
    if (o.alerted) this.ai.alertTo(this.target?.position || this.position, 1);
    this._play('idle', 0, true);
  }

  /** Hand back to the pool. */
  retire() {
    this.active = false;
    this.root.visible = false;
    this.weapon.active = false;
    if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
    if (this.controller) this.controller.enabled = false;
    this.velocity.set(0, 0, 0);
  }

  dispose() {
    try { this.rig?.dispose?.(); } catch { /* ignore */ }
    if (this.controller) {
      try { this.ctx.physics?.removeCharacter?.(this.controller); } catch { /* ignore */ }
      this.controller = null;
    }
    this.root.parent?.remove(this.root);
  }

  // ---------------------------------------------------------------------- update

  /**
   * @param {number} dt       time-scaled delta
   * @param {number} elapsed  engine elapsed
   * @param {number} camDist  distance to camera, supplied by the manager
   */
  update(dt, elapsed, camDist) {
    if (!this.active) return;
    this.camDist = camDist;
    this.stateTime += dt;

    if (this.state === 'dead' || this.state === 'executed') {
      this._updateCorpse(dt);
      return;
    }

    // Frozen ring: pose held, no brain, no physics. Still a silhouette on the ridge.
    if (this.lod >= 2) return;

    this._tickTimers(dt);
    this.ai.update(dt, elapsed);
    this._updateFSM(dt);
    this._updateLocomotion(dt);
    this._integrate(dt);
    this._updateFacing(dt);
    this._updateAnim(dt);
    this._updateWeaponTransform();
    this._updateFootsteps(dt);
  }

  _tickTimers(dt) {
    const cd = this.moveCooldowns;
    for (let i = 0; i < cd.length; i++) if (cd[i] > 0) cd[i] -= dt;
    if (this.riposteWindow > 0) this.riposteWindow -= dt;
    if (this.postureLocked > 0) {
      this.postureLocked -= dt;
    } else if (this.posture < this.maxPosture && this.state !== 'postureBroken') {
      this.posture = Math.min(this.maxPosture, this.posture + this.def.stats.postureRegen * dt);
    }
  }

  // ------------------------------------------------------------------------- FSM

  setState(name, duration = 0) {
    if (this.state === name) { this.stateDuration = duration || this.stateDuration; return; }
    this._exitState(this.state);
    this.state = name;
    this.stateTime = 0;
    this.stateDuration = duration;
  }

  _exitState(prev) {
    if (prev === 'attack') {
      this.weapon.active = false;
      this.currentMove = null;
      this.attackPhase = 'none';
    }
    if (prev === 'dodge' || prev === 'parry') this.invulnerable = false;
  }

  _updateFSM(dt) {
    const it = this.intent;

    switch (this.state) {
      case 'attack':
        this._updateAttack(dt);
        return;

      case 'stagger':
        if (this.stateTime >= this.stateDuration) this._toNeutral();
        return;

      case 'postureBroken':
        if (this.stateTime >= this.stateDuration) {
          this.posture = this.maxPosture * 0.55;
          this.postureLocked = 0.6;
          this._toNeutral();
        }
        return;

      case 'dodge': {
        const t = this.stateTime;
        this.invulnerable = t > 0.07 && t < 0.34;
        if (t >= this.stateDuration) { this.invulnerable = false; this._toNeutral(); }
        return;
      }

      case 'parry': {
        // The deflect window opens a beat after the animation starts, so a parry
        // pressed too early fails for the AI exactly as it does for the player.
        if (!this._parryAsked && this.stateTime >= 0.05) {
          this._parryAsked = true;
          try { this.ctx.combat?.requestParry?.(this); } catch { /* combat absent */ }
        }
        if (this.stateTime >= this.stateDuration) { this._parryAsked = false; this._toNeutral(); }
        return;
      }

      case 'guard':
        if (!it.guard || this.aware < 2) { this._toNeutral(); return; }
        if (it.attack && this._tryAttack(it.attack)) return;
        return;

      default: break;
    }

    // Neutral states: the intent from the brain picks what we become this frame.
    if (it.parry && this._canAct()) { this._startParry(); return; }
    if (it.dodge && this._canAct()) { this._startDodge(it.dodgeDir); return; }
    if (it.attack && this._canAct() && this._tryAttack(it.attack)) return;
    if (it.guard && this._canAct()) { this.setState('guard'); this._play('guard', 0.14, true); return; }

    // Escalation is visible: patrol → alert (investigate) → approach/circle (combat).
    let next;
    if (this.aware >= 2) {
      const b = it.behaviour;
      if (b === 'approach' || b === 'flank' || b === 'reposition' || b === 'regroup') next = 'approach';
      else if (b === 'circleLeft' || b === 'circleRight' || b === 'backOff') next = 'circle';
      else next = it.moveGain > 0.05 ? 'circle' : 'idle';
    } else if (this.aware === 1) {
      next = 'alert';
    } else {
      next = it.moveGain > 0.05 ? 'patrol' : 'idle';
    }
    if (next !== this.state) {
      this.setState(next);
      this._playLocomotionEntry(next);
    }
  }

  _toNeutral() {
    this.setState(this.aware >= 2 ? 'circle' : this.aware === 1 ? 'alert' : 'idle');
    this._playLocomotionEntry(this.state);
  }

  _canAct() {
    const s = this.state;
    return s === 'idle' || s === 'patrol' || s === 'alert' ||
      s === 'approach' || s === 'circle' || s === 'guard';
  }

  _playLocomotionEntry(state) {
    switch (state) {
      case 'idle': this._play('idle', 0.22, true); break;
      case 'patrol': this._play('walk', 0.22, true); break;
      case 'alert': this._play('idle_alert', 0.20, true); break;
      case 'approach': this._play('run', 0.18, true); break;
      case 'circle': this._play('idle_alert', 0.20, true); break;
      default: break;
    }
  }

  // --------------------------------------------------------------------- attacks

  /** Cooldown + token gate. Returns true only if the swing actually started. */
  _tryAttack(move) {
    if (!move || !this._canAct()) return false;
    if (this.moveCooldowns[move.index] > 0) return false;

    // Feints are pressure theatre: no damage window, no token, so they never
    // block the one enemy who is actually allowed to swing.
    if (!move.feint) {
      const kind = move.unblockable ? 'unblockable'
        : move.heavy ? 'heavy'
          : move.ranged ? 'ranged' : 'light';
      if (!this.hasToken) {
        if (!this.manager?._requestToken(this, kind)) return false;
        this.hasToken = true;
        this.tokenKind = kind;
      }
    }
    this._beginMove(move);
    return true;
  }

  _beginMove(move) {
    this.setState('attack');
    this.currentMove = move;
    this.attackTime = 0;
    this.attackPhase = 'startup';
    this._markerDriven = false;
    this._advanceDone = 0;
    this._projectileFired = false;
    this.weapon.active = false;
    this.weapon.damage = move.damage * (this.manager?.damageScale ?? 1);
    this.weapon.posture = move.posture;
    this.weapon.kind = move.kind;
    this.weapon.unblockable = move.unblockable;
    this.weapon.guardBreak = move.guardBreak;
    this.weapon.moveId = move.id;
    this.moveCooldowns[move.index] = move.cooldown;
    this.lastAttackAt = this.ctx.engine?.elapsed ?? 0;

    // The readable tell. This is the contract with the player's eyes.
    try { this.ctx.combat?.registerTelegraph?.(this, move.telegraph, move.startup); }
    catch { /* combat absent */ }

    this._play(move.clip, 0.08, false, 1, move.total);

    // Snap the facing at commit so the swing cannot track the player through it.
    if (this.target?.position) {
      _v1.copy(this.target.position).sub(this.position);
      _v1.y = 0;
      if (_v1.lengthSq() > 1e-5) this.targetYaw = Math.atan2(-_v1.x, -_v1.z);
    }
  }

  _updateAttack(dt) {
    const m = this.currentMove;
    if (!m) { this._endAttack(false); return; }
    this.attackTime += dt;
    const t = this.attackTime;

    // Root motion: the advance is spread across the windup and the swing so the
    // step reads as part of the attack rather than a separate slide.
    const span = m.startup + m.active;
    if (m.advance !== 0 && t < span) {
      const curve = t < m.startup
        ? smoothstep(m.startup * 0.45, m.startup, t) * 0.35
        : 0.35 + smoothstep(m.startup, span, t) * 0.65;
      const step = (curve - this._advanceDone) * m.advance;
      this._advanceDone = curve;
      const inv = 1 / Math.max(dt, 1e-4);
      this._desiredVel.set(-Math.sin(this.yaw) * step * inv, 0, -Math.cos(this.yaw) * step * inv);
    } else {
      this._desiredVel.multiplyScalar(1 - Math.min(1, dt * 9));
    }

    if (m.feint) {
      // Sell the windup, then visibly abort. Never opens a damage window.
      const cancelAt = m.startup * 0.62;
      if (t >= cancelAt && this.attackPhase === 'startup') {
        this.attackPhase = 'recovery';
        this._play('idle_alert', 0.12, true);
      }
      if (t >= cancelAt + m.recovery) {
        const next = this._pickChain(m);
        if (next) { this.comboIndex++; this._beginMove(next); return; }
        this._endAttack(true);
      }
      return;
    }

    if (this.attackPhase === 'startup' && t >= m.startup) {
      // Markers are authoritative; this timer is the safety net for a clip that
      // ships without them, so the fight never silently stops working.
      if (!this._markerDriven || t > m.startup + 0.12) {
        this.attackPhase = 'active';
        this.weapon.active = true;
      }
    }
    if (this.attackPhase === 'active' && t >= m.startup + m.active) {
      this.attackPhase = 'recovery';
      this.weapon.active = false;
    }
    if (t >= span + 0.14) this.weapon.active = false;   // hard cutoff

    if (m.ranged && this.attackPhase === 'active' && !this._projectileFired) {
      this._projectileFired = true;
      this._throwProjectile(m);
    }

    if (t >= m.total) {
      // Chain into the follow-up without dropping the token — a string is one
      // decision, not three.
      const next = this._pickChain(m);
      if (next) { this.comboIndex++; this._beginMove(next); return; }
      const retreat = m.retreatAfter;
      this._endAttack(false);
      if (retreat) this.ai.forceBackOff(0.9);
    }
  }

  _pickChain(m) {
    if (!m.chain || this.comboIndex > 4) return null;
    let chance = m.chainChance * (this.def.temperament.chainChance || 1);
    chance *= 0.7 + 0.4 * (this.manager?.difficulty ?? 1);
    if (this.ai.rand() > chance) return null;
    const tgt = this.target;
    if (!tgt?.position) return null;
    const dist = this.position.distanceTo(tgt.position);
    for (let i = 0; i < m.chain.length; i++) {
      const nm = this.def.moves[m.chain[i]];
      if (!nm) continue;
      if (dist > nm.maxRange + nm.advance * 0.6) continue;
      return nm;
    }
    return null;
  }

  /**
   * Abort a swing that has not committed yet. This is what lets a skilled Ronin
   * see the player's tell mid-windup and answer with a deflect instead — the
   * single biggest thing that stops enemies feeling like they are on rails.
   */
  cancelAttack() {
    const m = this.currentMove;
    if (!m || this.state !== 'attack') return false;
    if (this.weapon.active || this.attackTime >= m.commitAt) return false;
    this._endAttack(true);
    return true;
  }

  _endAttack(fromFeint) {
    const m = this.currentMove;
    this.weapon.active = false;
    this.currentMove = null;
    this.attackPhase = 'none';
    this.comboIndex = 0;
    this._advanceDone = 0;
    this._projectileFired = false;
    if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; this.tokenKind = null; }
    this.ai.onAttackFinished(m, !!fromFeint);
    this._toNeutral();
  }

  /**
   * Ranged intent. Combat owns hit resolution, so we ask it for a projectile and
   * settle for animation plus a visual if it has no such entry point.
   */
  _throwProjectile(m) {
    const tgt = this.target;
    if (!tgt?.position) return;
    _v1.copy(this.weapon.bladeTip);
    if (_v1.lengthSq() < 1e-6) {
      _v1.copy(this.position).addScaledVector(this.forward, 0.4);
      _v1.y = this.position.y + this.height * 0.72;
    }
    _v2.set(tgt.position.x, tgt.position.y + (tgt.height ?? 1.75) * 0.55, tgt.position.z)
      .sub(_v1).normalize();
    let handled = false;
    try {
      handled = !!this.ctx.combat?.spawnProjectile?.({
        owner: this,
        kind: m.projectile || 'kunai',
        origin: _v1,
        direction: _v2,
        speed: m.projectileSpeed || 24,
        damage: this.weapon.damage,
        posture: m.posture,
        life: 2.0,
      });
    } catch { handled = false; }
    // Visual only — we never resolve damage ourselves.
    if (!handled) this.ctx.fx?.spawnProjectile?.(_v1, _v2, m.projectileSpeed || 24, m.projectile || 'kunai');
  }

  // -------------------------------------------------------------- defensive acts

  _startParry() {
    this.setState('parry', 0.42);
    this._parryAsked = false;
    this._play('parry', 0.06, false);
    this._desiredVel.set(0, 0, 0);
  }

  _startDodge(dir) {
    const sp = this.def.speeds.dodgeSpeed;
    _v1.set(dir.x, 0, dir.z);
    if (_v1.lengthSq() < 1e-5) _v1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _v1.normalize();
    this.setState('dodge', this.def.temperament.hitAndRun ? 0.52 : 0.46);
    this.velocity.x = _v1.x * sp;
    this.velocity.z = _v1.z * sp;
    this._desiredVel.set(0, 0, 0);

    // Pick the clip from the dodge direction in our own frame so it reads right.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dot = fx * _v1.x + fz * _v1.z;
    const cross = fx * _v1.z - fz * _v1.x;
    const clip = dot < -0.4
      ? (this.def.temperament.hitAndRun ? 'roll_back' : 'dodge_back')
      : cross > 0 ? 'dodge_left' : 'dodge_right';
    this._play(clip, 0.05, false);
  }

  // ------------------------------------------------------------------ locomotion

  _updateLocomotion(dt) {
    const it = this.intent;
    const s = this.def.speeds;
    const st = this.state;
    const busy = st === 'attack' || st === 'dodge' || st === 'stagger' ||
      st === 'postureBroken' || st === 'parry';

    if (!busy) {
      let target = s.run;
      if (st === 'guard') target = s.walk * 0.85;
      else if (st === 'patrol' || st === 'alert') target = s.walk;
      else if (it.behaviour === 'circleLeft' || it.behaviour === 'circleRight') target = s.strafe;
      else if (it.behaviour === 'backOff') target = s.back;
      const want = target * clamp(it.moveGain, 0, 1);
      _v1.set(it.moveDir.x, 0, it.moveDir.z);
      const l = _v1.length();
      if (l > 1e-4) _v1.multiplyScalar(want / l); else _v1.set(0, 0, 0);
      this._desiredVel.x = damp(this._desiredVel.x, _v1.x, s.accel, dt);
      this._desiredVel.z = damp(this._desiredVel.z, _v1.z, s.accel, dt);
    } else if (st !== 'attack') {
      const k = st === 'dodge' ? 3.5 : 12;
      this._desiredVel.x = damp(this._desiredVel.x, 0, k, dt);
      this._desiredVel.z = damp(this._desiredVel.z, 0, k, dt);
    }

    if (st === 'dodge') {
      // The dodge keeps its launch velocity, bled off across the roll.
      const decay = 1 - Math.min(1, dt * 3.6);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
    } else {
      this.velocity.x = this._desiredVel.x;
      this.velocity.z = this._desiredVel.z;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  _integrate(dt) {
    this.velocity.y += GRAVITY * dt;
    if (this.velocity.y < -55) this.velocity.y = -55;
    this._disp.copy(this.velocity).multiplyScalar(dt);

    let gi = null;
    if (this.controller && this.controller.enabled !== false) {
      try { gi = this.controller.move(this._disp, dt); } catch { gi = null; }
      const cp = this.controller.position;
      if (cp && typeof cp.x === 'number') this.position.set(cp.x, cp.y, cp.z);
      else this.position.add(this._disp);
    } else {
      this.position.add(this._disp);
    }

    // Terrain is the floor of last resort — it also catches a physics stub that
    // returns nothing, so enemies never sink through the world.
    const gh = this.ctx.terrain?.heightAt?.(this.position.x, this.position.z);
    let grounded = gi?.grounded ?? gi?.onGround ?? false;
    let floor = Number.isFinite(gh) ? gh : null;
    if (floor === null && !gi) floor = this._groundY;   // nothing else knows where down is
    if (floor !== null && this.position.y < floor + 0.005) {
      this.position.y = floor;
      grounded = true;
    }
    if (grounded && floor !== null) this._groundY = floor;
    this.grounded = !!grounded;
    if (grounded && this.velocity.y < 0) this.velocity.y = 0;
    this.surface = gi?.surface || this.ctx.terrain?.surfaceAt?.(this.position.x, this.position.z) || 'grass';
  }

  _updateFacing(dt) {
    const it = this.intent;
    const st = this.state;
    if (st !== 'attack' && st !== 'stagger' && st !== 'postureBroken') {
      if (it.faceDir.x !== 0 || it.faceDir.z !== 0) {
        this.targetYaw = Math.atan2(-it.faceDir.x, -it.faceDir.z);
      }
    }
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const rate = st === 'attack'
      ? this.def.speeds.turn * (this.attackPhase === 'startup' ? 0.5 : 0.06)
      : this.def.speeds.turn;
    this.yaw += clamp(d, -rate * dt, rate * dt);
    this.root.rotation.y = this.yaw;
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    // Local-space velocity for the 2D locomotion blend: +z forward, +x right.
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.localVel.z = -(this.velocity.x * s + this.velocity.z * c);
    this.localVel.x = this.velocity.x * c - this.velocity.z * s;
  }

  // --------------------------------------------------------------------- visuals

  _play(clip, fade = 0.15, loop = false, speed = 1, duration = 0) {
    if (!clip) return;
    if (loop && clip === this._lastClip) return;
    this._lastClip = clip;
    const rig = this.rig;
    if (!rig || typeof rig.play !== 'function') return;
    try {
      rig.play(clip, { fade, loop, speed, duration, layer: 'base', entity: this });
    } catch { /* unknown clip — the rig keeps its current pose */ }
  }

  _playAdditive(clip, fade = 0.1) {
    const rig = this.rig;
    if (!rig || typeof rig.play !== 'function') return;
    try { rig.play(clip, { fade, loop: false, layer: 'additive', additive: true, entity: this }); }
    catch { /* ignore */ }
  }

  _updateAnim(dt) {
    const st = this.state;

    // Idle life: nobody stands still. Weight shifts, glances, stance resets.
    if (this.lod === 0 && (st === 'idle' || st === 'circle' || st === 'alert')) {
      this._idleTimer -= dt;
      if (this._idleTimer <= 0) {
        this._idleTimer = 2.6 + this.ai.rand() * 4.5;
        const r = this.ai.rand();
        if (this.intent.taunt) this._playAdditive('taunt');
        else if (this.aware >= 2) this._playAdditive(r < 0.55 ? 'stance_shift' : 'look_around');
        else this._playAdditive(r < 0.4 ? 'look_around' : 'stance_shift');
      }
      // Breathing sway lives on the visual group only — the root stays exactly
      // where physics put it, so hit resolution never sees the flourish.
      this._breathPhase += dt * (this.aware >= 2 ? 1.5 : 0.75);
      this.visual.rotation.z = noise.noise2(this._breathPhase * 0.6, this.id * 0.017) * 0.022;
      this.visual.rotation.x = noise.noise2(this._breathPhase * 0.43 + 7.1, this.id * 0.017) * 0.014;
      this.visual.position.y = Math.sin(this._breathPhase * 1.7) * 0.008;
    } else {
      const k = 1 - Math.min(1, dt * 8);
      this.visual.rotation.z *= k;
      this.visual.rotation.x *= k;
      this.visual.position.y *= k;
    }

    // Locomotion clip from the blend-space quadrant.
    if (st === 'approach' || st === 'patrol' || st === 'circle' || st === 'guard') {
      const sp = this.speed;
      if (sp < 0.15) this._play(st === 'guard' ? 'guard' : this.aware >= 2 ? 'idle_alert' : 'idle', 0.2, true);
      else if (Math.abs(this.localVel.x) > Math.abs(this.localVel.z) * 1.25) {
        this._play(this.localVel.x > 0 ? 'strafe_r' : 'strafe_l', 0.18, true);
      } else if (this.localVel.z < -0.15) this._play('back', 0.18, true);
      else this._play(sp > this.def.speeds.walk * 1.35 ? 'run' : 'walk', 0.18, true);
    }

    const rig = this.rig;
    if (!rig) {
      // Proxy fallback: lean into the movement so it is not a sliding box.
      if (this._proxy) {
        this._proxy.rotation.x = -clamp(this.speed * 0.045, 0, 0.22);
        this._proxy.position.y = Math.abs(Math.sin(this._footPhase * Math.PI)) * 0.035;
      }
      return;
    }

    // Look-at is a near-ring luxury.
    if (this.lod === 0 && this.intent.hasLook && typeof rig.setLookTarget === 'function') {
      try { rig.setLookTarget(this.intent.lookAt); } catch { /* ignore */ }
    }

    // 30 Hz animation beyond the near ring, full rate inside it.
    let step = dt;
    if (this._animInterval > 0) {
      this._animAccum += dt;
      if (this._animAccum < this._animInterval) return;
      step = this._animAccum;
      this._animAccum = 0;
    }
    try { rig.update?.(step); } catch { /* ignore */ }
  }

  /** Blade base/tip in world space, updated in place — Combat sweeps between them. */
  _updateWeaponTransform() {
    const w = this.weapon;
    w.prevTip.copy(w.bladeTip);
    const bones = this.rig?.bones;
    const tipBone = bones ? bones[w.tipBone] : null;
    const gripBone = bones ? bones[w.gripBone] : null;

    if (tipBone?.getWorldPosition) {
      tipBone.getWorldPosition(w.bladeTip);
      if (gripBone?.getWorldPosition) gripBone.getWorldPosition(w.bladeBase);
      else w.bladeBase.copy(w.bladeTip).addScaledVector(this.forward, -w.length);
      return;
    }
    if (gripBone?.getWorldPosition) {
      gripBone.getWorldPosition(w.bladeBase);
      w.bladeTip.copy(w.bladeBase).addScaledVector(this.forward, w.length);
      return;
    }

    // No rig: synthesise a plausible arc from the attack phase so Combat and the
    // trail FX still have geometry to work with.
    w.bladeBase.copy(this.position);
    w.bladeBase.y += this.height * 0.62;
    w.bladeBase.addScaledVector(this.forward, this.radius * 0.9);
    let swing = 0;
    const m = this.currentMove;
    if (m) swing = clamp((this.attackTime - m.startup) / Math.max(m.active, 0.01), 0, 1);
    _v3.set(this.forward.z, 0, -this.forward.x);   // right vector
    w.bladeTip.copy(w.bladeBase)
      .addScaledVector(this.forward, w.length * (0.35 + 0.6 * swing))
      .addScaledVector(_v3, w.length * 0.5 * Math.sin(swing * Math.PI * 0.9));
    w.bladeTip.y = w.bladeBase.y + w.length * 0.45 * (1 - swing);
    if (this._proxyWeapon) this._proxyWeapon.rotation.z = -swing * 1.9;
  }

  _emitFootstep() {
    const p = this._fsPayload;
    p.point.copy(this.position);
    p.surface = this.surface;
    p.speed = this.speed;
    this.ctx.bus?.emit('footstep', p);
    // Running feet are loud — the AI hearing model listens for exactly this.
    if (this.speed > this.def.speeds.walk * 1.4) {
      this.manager?._noise(this.position, this.speed * 1.1, this);
    }
  }

  _updateFootsteps(dt) {
    if (this._rigFootsteps || this.lod >= 2 || !this.grounded) return;
    if (this.speed < 0.25) { this._footPhase = 0; return; }
    const stride = this.speed > this.def.speeds.walk * 1.35 ? 1.35 : 1.05;
    this._footPhase += (this.speed / stride) * dt;
    if (this._footPhase >= 1) {
      this._footPhase -= 1;
      this._emitFootstep();
    }
  }

  // ---------------------------------------------------------------------- damage

  /**
   * Combat resolved a hit against us. We apply the consequence and pick the
   * reaction; we never decide whether the hit landed.
   */
  onDamage(payload) {
    if (!this._alive || !this.active) return;
    const p = payload || {};
    if (this.invulnerable && !p.ignoreInvuln) return;

    let dmg = p.damage ?? 0;
    let post = p.posture ?? p.postureDamage ?? dmg * 0.8;
    const poise = p.poise ?? 0.35;
    const unblockable = !!p.unblockable;

    // Direction of the blow, for the reaction and the AI's threat memory.
    if (p.direction) this.staggerDir.copy(p.direction);
    else if (p.attacker?.position) this.staggerDir.copy(this.position).sub(p.attacker.position);
    else this.staggerDir.copy(this.forward).negate();
    this.staggerDir.y = 0;
    if (this.staggerDir.lengthSq() > 1e-5) this.staggerDir.normalize();
    else this.staggerDir.set(0, 0, 1);

    const frontal = this.staggerDir.dot(this.forward) < -0.15;

    // Guard mitigation only when Combat has not already resolved it.
    if (p.guarded === undefined && this.state === 'guard' && frontal && !unblockable) {
      dmg *= 1 - this.def.stats.guardAbsorb;
      post *= this.def.stats.guardPostureMult;
      this._playAdditive('guard_hit');
      this.ctx.bus?.emit('camera-shake', this._shake(0.18, 0.12));
    }

    this.health = Math.max(0, this.health - dmg);
    this.posture = Math.max(0, this.posture - post);
    this.postureLocked = this.def.stats.postureRegenDelay;
    this.lastDamagedAt = this.ctx.engine?.elapsed ?? 0;
    this.ai.onDamaged(p);

    if (this.aware < 2) {
      this.aware = 2;
      this.ai.alertTo(p.attacker?.position || this.position, 1);
    }

    if (this.health <= 0) { this.die(p); return; }

    if (this.posture <= 0 && this.state !== 'postureBroken') {
      this._breakPosture();
      this.manager?._onEnemyHurt(this, p);
      return;
    }

    // Poise: the Ōyoroi eats light hits without flinching, which is the entire
    // reason you cannot simply mash on it.
    const staggered = unblockable || poise >= this.poise ||
      (this.state === 'attack' && poise >= this.poise * 0.7);
    if (staggered && this.state !== 'dodge') {
      const heavy = poise >= this.poise + 0.5 || dmg > this.maxHealth * 0.18;
      if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
      this.weapon.active = false;
      this.currentMove = null;
      this.setState('stagger', this.def.stats.staggerTime * (heavy ? 1.35 : 1));
      this._play(heavy ? 'hit_heavy' : 'hit_light', 0.05, false);
    } else {
      this._playAdditive(dmg > 0 ? 'hit_light' : 'guard_hit');
    }

    this.manager?._onEnemyHurt(this, p);
  }

  _breakPosture() {
    if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
    this.weapon.active = false;
    this.currentMove = null;
    this.setState('postureBroken', this.def.stats.breakTime);
    this._play('posture_break', 0.05, false);
    this.postureLocked = this.def.stats.breakTime;
    this.ctx.bus?.emit('camera-shake', this._shake(0.5, 0.28));
  }

  /** Combat calls this to consume a posture break with a killing blow. */
  execute(payload) {
    if (!this._alive) return false;
    this.setState('executed', 1.6);
    this._play('executed', 0.04, false);
    this.weapon.active = false;
    this.invulnerable = true;
    this.health = 0;
    this._finishDeath(payload, true);
    return true;
  }

  die(payload) {
    if (!this._alive) return;
    this._alive = false;
    this.health = 0;
    this.weapon.active = false;
    this.currentMove = null;
    if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
    const back = this.staggerDir.dot(this.forward) > 0.2;
    this.setState('dead', 0);
    this._play(back ? 'death_back' : 'death', 0.05, false);
    this._finishDeath(payload, false);
  }

  _finishDeath(payload, executed) {
    this._alive = false;
    this.corpseTimer = 0;
    this.invulnerable = true;
    if (this.controller) this.controller.enabled = false;
    this.velocity.set(0, 0, 0);
    this._desiredVel.set(0, 0, 0);
    if (this.ctx.quality?.ragdoll && this.rig) {
      try { this.ctx.physics?.createRagdoll?.(this.rig, this.staggerDir, executed ? 3 : 6); }
      catch { /* ignore */ }
    }
    this.manager?._onEnemyDeath(this, payload, executed);
  }

  _updateCorpse(dt) {
    this.corpseTimer += dt;
    if (this.rig && this.lod < 2) { try { this.rig.update?.(dt); } catch { /* ignore */ } }
    if (this.corpseTimer <= CORPSE_LINGER) return;
    // Sink and shrink rather than fading alpha: materials are shared across every
    // enemy of this archetype and must never be mutated per-instance.
    const t = clamp((this.corpseTimer - CORPSE_LINGER) / CORPSE_FADE, 0, 1);
    this.visual.position.y = -t * 1.3;
    const s = 1 - t * 0.35;
    this.visual.scale.set(s, s, s);
    if (t >= 1) this.manager?.despawn(this);
  }

  _shake(amount, duration, freq = 14) {
    this._shakePayload.amount = amount;
    this._shakePayload.duration = duration;
    this._shakePayload.freq = freq;
    return this._shakePayload;
  }

  // --------------------------------------------------------------------- helpers

  /** The manager pushes LOD; the enemy decides what to cheap out on. */
  setLOD(level) {
    if (level === this.lod) return;
    this.lod = level;
    this._animInterval = level >= 1 ? 1 / 30 : 0;
    if (level >= 2) {
      // A frozen enemy must not hold an open damage window or the attack token.
      this.weapon.active = false;
      if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
    }
    const rig = this.rig;
    if (!rig) return;
    try {
      rig.setLOD?.(level);
      rig.setCloth?.(level === 0 && !!this.ctx.quality?.cloth);
      rig.setIK?.(level === 0);
      if ('ikEnabled' in rig) rig.ikEnabled = level === 0;
      if ('clothEnabled' in rig) rig.clothEnabled = level === 0 && !!this.ctx.quality?.cloth;
      if (level >= 1 && typeof rig.setLookTarget === 'function') rig.setLookTarget(null);
    } catch { /* rig without LOD knobs */ }
  }

  /** Woken by noise, an ally's death, or the manager's `alertAll`. */
  alert(point, amount = 1) {
    if (!this._alive) return;
    this.ai.alertTo(point, amount);
  }

  onParrySuccess(attacker) {
    // A clean deflect buys a riposte window that the Ronin knows how to use.
    this.riposteWindow = 0.85;
    this.posture = Math.min(this.maxPosture, this.posture + this.maxPosture * 0.08);
    this.ai.onParrySuccess(attacker);
  }

  onParried(defender) {
    this.posture = Math.max(0, this.posture - this.maxPosture * 0.22);
    this.postureLocked = this.def.stats.postureRegenDelay;
    if (this.hasToken) { this.manager?._releaseToken(this); this.hasToken = false; }
    this.weapon.active = false;
    this.currentMove = null;
    this.setState('stagger', this.def.stats.staggerTime * 1.2);
    this._play('hit_heavy', 0.04, false);
    this.ai.onParried(defender);
  }

  distanceTo(entity) {
    if (!entity?.position) return Infinity;
    return this.position.distanceTo(entity.position);
  }
}

// =========================================================================== manager

/**
 * EnemyManager — pool, spawn policy, LOD rings, group coordination and the hearing
 * fan-out. Registered with the engine, so it gets update/applyQuality/dispose.
 */
export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx;

    /** The live array Combat, the camera and the HUD iterate. Never reallocated. */
    this.list = [];

    this._pools = Object.create(null);
    for (let i = 0; i < ARCHETYPE_KEYS.length; i++) this._pools[ARCHETYPE_KEYS[i]] = [];
    this._all = [];

    this.RigClass = null;
    this.maxEnemies = ctx.quality?.maxEnemies ?? 8;
    this.difficulty = 1;
    this.damageScale = 1;

    // Fallback attack token, used only when Combat is missing or stubbed. "One
    // attacker at a time" is a feel requirement, not an implementation detail.
    this._token = { holder: null, kind: null, at: 0 };

    this._lodNear = LOD_NEAR;
    this._lodFar = LOD_FAR;

    this._slotTimer = 0;
    this._engaged = [];
    this._noisePoint = new Vector3();
    this._spawnCenter = new Vector3();

    this._proxyGeo = null;
    this._proxyMats = null;

    // bound bus handlers, subscribed once
    this._onBusSlash = (p) => {
      if (!p) return;
      const src = p.to || p.from || p.entity?.position;
      if (src) this._noise(src, p.heavy ? 26 : 17, p.entity);
    };
    this._onBusHit = (p) => {
      if (!p?.point) return;
      this._noise(p.point, 22, p.attacker);
      // Landing a blow is how an AI knows it did not whiff.
      if (p.attacker?.faction === 'oni') p.attacker.ai?.onHitLanded?.();
    };
    this._onBusFootstep = (p) => {
      if (!p?.point || !p.entity || p.entity.faction === 'oni') return;
      if ((p.speed ?? 0) < 3.2) return;
      this._noise(p.point, 9 + (p.speed - 3.2) * 1.6, p.entity);
    };
    this._onBusDeath = (p) => {
      const e = p?.entity;
      if (!e) return;
      if (e.faction === 'oni') {
        for (let i = 0; i < this.list.length; i++) {
          const o = this.list[i];
          if (o !== e && o.isAlive) o.ai?.onAllyDeath?.(e);
        }
      } else if (e === this.ctx.player) {
        for (let i = 0; i < this.list.length; i++) this.list[i].ai?.onTargetLost?.();
      }
    };
    this._onBusParry = (p) => {
      if (!p) return;
      if (p.defender?.faction === 'oni') p.defender.onParrySuccess?.(p.attacker);
      if (p.attacker?.faction === 'oni') p.attacker.onParried?.(p.defender);
    };
    this._onBusPostureBreak = (p) => {
      const e = p?.entity;
      if (e?.faction === 'oni' && e.isAlive && e.state !== 'postureBroken') e._breakPosture?.();
      else if (e && e === this.ctx.player) this.alertAll(e.position);
    };
  }

  // ------------------------------------------------------------------- lifecycle

  async init() {
    // Dynamic so a missing or throwing Rig.js degrades this system alone instead
    // of taking the whole module graph down at import time.
    try {
      const mod = await import('../anim/Rig.js');
      this.RigClass = mod?.Rig || mod?.default || null;
    } catch (err) {
      console.warn('[enemies] Rig.js unavailable — using proxy silhouettes', err);
      this.RigClass = null;
    }

    this._buildProxyAssets();
    this._applyLimits();
    this._subscribe();

    // Warm two bodies so first contact does not build a rig mid-frame.
    if ((this.ctx.quality?.tier ?? 1) >= 1) {
      try { this._prewarm('ashigaru'); this._prewarm('ronin'); }
      catch (err) { console.warn('[enemies] prewarm failed', err); }
    }
  }

  _subscribe() {
    const bus = this.ctx.bus;
    if (!bus) return;
    bus.on('slash', this._onBusSlash);
    bus.on('hit', this._onBusHit);
    bus.on('footstep', this._onBusFootstep);
    bus.on('death', this._onBusDeath);
    bus.on('parry', this._onBusParry);
    bus.on('posture-break', this._onBusPostureBreak);
  }

  _unsubscribe() {
    const bus = this.ctx.bus;
    if (!bus) return;
    bus.off('slash', this._onBusSlash);
    bus.off('hit', this._onBusHit);
    bus.off('footstep', this._onBusFootstep);
    bus.off('death', this._onBusDeath);
    bus.off('parry', this._onBusParry);
    bus.off('posture-break', this._onBusPostureBreak);
  }

  _buildProxyAssets() {
    this._proxyGeo = {
      body: new CapsuleGeometry(0.5, 1, 4, 10),
      box: new BoxGeometry(1, 1, 1),
    };
    this._proxyMats = Object.create(null);
    for (let i = 0; i < ARCHETYPE_KEYS.length; i++) {
      const k = ARCHETYPE_KEYS[i];
      const pal = ARCHETYPES[k].rig.costume.palette;
      this._proxyMats[k] = {
        body: new MeshStandardMaterial({ color: new Color(pal.cloth), roughness: 0.88, metalness: 0.04 }),
        trim: new MeshStandardMaterial({ color: new Color(pal.trim), roughness: 0.72, metalness: 0.08 }),
        steel: new MeshStandardMaterial({ color: new Color(pal.metal), roughness: 0.3, metalness: 0.86 }),
      };
    }
  }

  _prewarm(key) {
    const e = this._create(key);
    e.retire();
    this._pools[key].push(e);
  }

  _applyLimits() {
    const q = this.ctx.quality;
    this.maxEnemies = q?.maxEnemies ?? 8;
    const tier = q?.tier ?? 1;
    const k = tier <= 0 ? 0.6 : tier === 1 ? 0.85 : tier === 2 ? 1.0 : 1.18;
    this._lodNear = LOD_NEAR * k;
    this._lodFar = LOD_FAR * k;
  }

  applyQuality(quality) {
    this._applyLimits();
    while (this.list.length > this.maxEnemies) {
      // Drop the furthest first so the fight in front of the player survives.
      let worst = null, worstD = -1;
      const cam = this.ctx.camera?.position;
      for (let i = 0; i < this.list.length; i++) {
        const e = this.list[i];
        const d = cam ? e.position.distanceToSquared(cam) : i;
        if (d > worstD) { worstD = d; worst = e; }
      }
      if (!worst) break;
      this.despawn(worst);
    }
    const cloth = !!(quality || this.ctx.quality)?.cloth;
    for (let i = 0; i < this._all.length; i++) {
      const e = this._all[i];
      try { e.rig?.setCloth?.(e.lod === 0 && cloth); } catch { /* ignore */ }
    }
  }

  dispose() {
    this._unsubscribe();
    for (let i = 0; i < this._all.length; i++) this._all[i].dispose();
    this._all.length = 0;
    this.list.length = 0;
    for (let i = 0; i < ARCHETYPE_KEYS.length; i++) this._pools[ARCHETYPE_KEYS[i]].length = 0;
    if (this._proxyGeo) {
      this._proxyGeo.body.dispose();
      this._proxyGeo.box.dispose();
      this._proxyGeo = null;
    }
    if (this._proxyMats) {
      for (const k in this._proxyMats) {
        const m = this._proxyMats[k];
        m.body.dispose(); m.trim.dispose(); m.steel.dispose();
      }
      this._proxyMats = null;
    }
  }

  // ------------------------------------------------------------------ spawn/pool

  _create(key) {
    const e = new Enemy(this.ctx, key, this);
    e.buildVisual(this.RigClass);
    this.ctx.scene?.add(e.root);
    e.root.visible = false;
    this._all.push(e);
    return e;
  }

  /**
   * @param {string} archetype one of ARCHETYPE_KEYS
   * @param {Vector3} position
   * @param {object} [opts] { alerted, yaw, target, seed, healthMult, postureMult, faceTarget }
   * @returns {Enemy|null} null when the tier budget is full
   */
  spawn(archetype, position, opts) {
    const key = ARCHETYPES[archetype] ? archetype : 'ashigaru';
    if (this.list.length >= this.maxEnemies) return null;
    let e = this._pools[key].pop();
    if (!e) e = this._create(key);
    if (!e.rig && !e._proxy) e.buildVisual(this.RigClass);
    e.reset(position, opts);
    this.list.push(e);
    return e;
  }

  /** Remove from play and recycle. Safe to call twice. */
  despawn(enemy) {
    if (!enemy) return;
    const i = this.list.indexOf(enemy);
    if (i >= 0) {
      this.list[i] = this.list[this.list.length - 1];
      this.list.pop();
    }
    enemy.retire();
    const pool = this._pools[enemy.archetype];
    if (pool && pool.indexOf(enemy) < 0 && pool.length < 12) pool.push(enemy);
  }

  despawnAll() {
    for (let i = this.list.length - 1; i >= 0; i--) this.despawn(this.list[i]);
  }

  /** Default composition for a wave of N — escalating threat, never four of a kind. */
  _mixFor(count) {
    _mixScratch.length = 0;
    for (let i = 0; i < count; i++) _mixScratch.push(WAVE_TABLE[i % WAVE_TABLE.length]);
    return _mixScratch;
  }

  /**
   * Place `count` enemies in a believable arc in front of the player at
   * conversational combat distance. Used by encounters and the screenshot rig.
   * @param {number} count
   * @param {object} [opts] { center, archetypes, radius, spread, facing, alerted, seed }
   * @returns {Enemy[]} the spawned enemies (a reused array — copy it if you keep it)
   */
  spawnWave(count = 3, opts) {
    const o = opts || {};
    const player = o.target || this.ctx.player;
    // Copied, because `spawn()` reaches into the module scratch vectors.
    const center = this._spawnCenter;
    const src = o.center || player?.position;
    if (src) center.set(src.x, src.y, src.z); else center.set(0, 0, 0);
    const budget = Math.max(0, Math.min(count | 0, this.maxEnemies - this.list.length));
    _spawnResult.length = 0;
    if (budget <= 0) return _spawnResult;

    // Face the arc the way the player is looking, so a wave never lands behind them.
    let baseAngle = 0;
    if (o.facing) baseAngle = Math.atan2(o.facing.x, o.facing.z);
    else if (player?.forward) baseAngle = Math.atan2(player.forward.x, player.forward.z);

    const mix = (o.archetypes && o.archetypes.length) ? o.archetypes : this._mixFor(budget);
    const baseR = o.radius ?? 4.4;
    const spread = o.spread ?? (budget === 1 ? 0 : Math.min(2.5, 0.62 * budget + 0.5));
    const rnd = makeRandom((o.seed ?? 0x51ed) + budget * 7919);

    for (let i = 0; i < budget; i++) {
      const key = mix[i % mix.length];
      const def = ARCHETYPES[key] || ARCHETYPES.ashigaru;
      // Irregular radii along the arc — a perfect ring reads as a spawner.
      const f = budget === 1 ? 0 : (i / (budget - 1)) - 0.5;
      const ang = baseAngle + f * spread + (rnd() - 0.5) * 0.34;
      // Heavies hang back, shinobi start wide, ashigaru lead.
      const rBias = def.key === 'oyoroi' ? 1.5 : def.key === 'shinobi' ? 1.25 : 0.9;
      const r = clamp(baseR * rBias + (rnd() - 0.5) * 1.5 + Math.abs(f) * 1.3, 2.8, 16);

      let placed = false;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const rr = r * (1 - attempt * 0.14);
        _v2.set(center.x + Math.sin(ang) * rr, center.y, center.z + Math.cos(ang) * rr);
        if (this._validGround(_v2, center)) placed = true;
      }
      if (!placed) continue;

      const e = this.spawn(key, _v2, {
        alerted: o.alerted !== false,
        target: player,
        seed: (rnd() * 0xffffffff) >>> 0,
        faceTarget: true,
      });
      if (e) {
        e.slotAngle = Math.atan2(e.position.x - center.x, e.position.z - center.z);
        _spawnResult.push(e);
      }
    }
    this._assignSlots(true);
    return _spawnResult;
  }

  /** Ground sanity: on the map, not on a cliff face, not inside a wall or an ally. */
  _validGround(pos, center) {
    const t = this.ctx.terrain;
    const h = t?.heightAt?.(pos.x, pos.z);
    if (!Number.isFinite(h)) { pos.y = center?.y ?? 0; return true; }
    pos.y = h;
    if (center && Math.abs(h - center.y) > 3.2) return false;
    const n = t?.normalAt?.(pos.x, pos.z, _v3);
    if (n && (n.y ?? 1) < 0.72) return false;

    const phys = this.ctx.physics;
    if (phys?.overlapSphere) {
      try {
        const blocked = phys.overlapSphere(pos, 0.5, phys.LAYER?.WORLD);
        if (blocked === true) return false;
        if (blocked && blocked.length > 0) return false;
      } catch { /* ignore */ }
    }
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i].position.distanceToSquared(pos) < 1.4) return false;
    }
    return true;
  }

  /** Spawn from `ctx.level.spawnPoints`, honouring whatever tags the level set. */
  spawnFromLevel(tag, opts) {
    _spawnResult.length = 0;
    const pts = this.ctx.level?.spawnPoints;
    if (!pts || !pts.length) return _spawnResult;
    for (let i = 0; i < pts.length; i++) {
      const sp = pts[i];
      if (tag && sp.tag !== tag) continue;
      if (this.list.length >= this.maxEnemies) break;
      const e = this.spawn(sp.archetype || 'ashigaru', sp.position || sp, {
        alerted: sp.alerted ?? false,
        yaw: sp.yaw,
        target: opts?.target,
        seed: opts?.seed,
      });
      if (e) _spawnResult.push(e);
    }
    return _spawnResult;
  }

  // --------------------------------------------------------------------- queries

  /**
   * @param {Vector3} position
   * @param {number} [maxDist=Infinity]
   * @param {(e:Enemy)=>boolean} [filter]
   * @returns {Enemy|null}
   */
  nearest(position, maxDist = Infinity, filter) {
    let best = null;
    let bestD = maxDist === Infinity ? Infinity : maxDist * maxDist;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.isAlive) continue;
      if (filter && !filter(e)) continue;
      const d = e.position.distanceToSquared(position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** @param {(e:Enemy)=>void} fn — called for every enemy (alive or corpse) inside r. */
  forEachInRadius(pos, r, fn) {
    const r2 = r * r;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.position.distanceToSquared(pos) <= r2) fn(e);
    }
  }

  /** Every living oni turns toward `position` and escalates. */
  alertAll(position, amount = 1) {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.isAlive) e.alert(position, amount);
    }
  }

  get count() { return this.list.length; }

  get aliveCount() {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].isAlive) n++;
    return n;
  }

  // ---------------------------------------------------------------- coordination

  _requestToken(enemy, kind) {
    const c = this.ctx.combat;
    if (c && typeof c.requestToken === 'function') {
      try { return !!c.requestToken(enemy, kind); } catch { /* fall through */ }
    }
    const t = this._token;
    if (t.holder && t.holder !== enemy && t.holder.isAlive && t.holder.state === 'attack') return false;
    t.holder = enemy;
    t.kind = kind;
    t.at = this.ctx.engine?.elapsed ?? 0;
    return true;
  }

  _releaseToken(enemy) {
    const c = this.ctx.combat;
    if (c && typeof c.releaseToken === 'function') {
      try { c.releaseToken(enemy); } catch { /* ignore */ }
    }
    if (this._token.holder === enemy) { this._token.holder = null; this._token.kind = null; }
  }

  /** Someone made a sound at `point`. `loudness` is the audible radius in metres. */
  _noise(point, loudness, source) {
    if (loudness <= 0) return;
    this._noisePoint.set(point.x, point.y, point.z);
    const r2 = loudness * loudness;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.isAlive || e === source) continue;
      const d2 = e.position.distanceToSquared(this._noisePoint);
      if (d2 > r2) continue;
      e.ai?.hear(this._noisePoint, 1 - Math.sqrt(d2) / loudness, source);
    }
  }

  _onEnemyHurt(enemy, payload) {
    // Pain is contagious: neighbours notice and escalate.
    this._noise(enemy.position, 14, enemy);
    const atk = payload?.attacker;
    if (!atk) return;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (o === enemy || !o.isAlive) continue;
      if (o.position.distanceToSquared(enemy.position) < 144) o.ai?.witnessAttack?.(atk, enemy);
    }
  }

  _onEnemyDeath(enemy, payload, executed) {
    if (enemy.hasToken) { this._releaseToken(enemy); enemy.hasToken = false; }
    if (this._token.holder === enemy) this._token.holder = null;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (o !== enemy && o.isAlive) o.ai?.onAllyDeath?.(enemy);
    }
    // Combat owns the `death` event; without Combat nobody else would say it.
    if (!this.ctx.combat?.requestToken) {
      _deathPayload.entity = enemy;
      _deathPayload.point.copy(enemy.position);
      _deathPayload.direction.copy(enemy.staggerDir);
      this.ctx.bus?.emit('death', _deathPayload);
    }
    this._assignSlots(true);
  }

  /**
   * Give every engaged enemy an angular slot around the player. Sorting by current
   * angle before assigning means nobody ever crosses through the player to reach
   * their slot — the group opens like a fan instead of shuffling.
   */
  _assignSlots(force) {
    const p = this.ctx.player?.position;
    if (!p) return;
    const eng = this._engaged;
    eng.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.isAlive && e.aware >= 2) eng.push(e);
    }
    const n = eng.length;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      eng[i]._angleCache = Math.atan2(eng[i].position.x - p.x, eng[i].position.z - p.z);
    }
    // Insertion sort: n <= maxEnemies and the array is almost always already
    // ordered from the previous pass, so this beats Array#sort and allocates nothing.
    for (let i = 1; i < n; i++) {
      const v = eng[i];
      const k = v._angleCache;
      let j = i - 1;
      while (j >= 0 && eng[j]._angleCache > k) { eng[j + 1] = eng[j]; j--; }
      eng[j + 1] = v;
    }
    // Mean heading via vector sum — a plain average wraps badly at ±π.
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i++) { sx += Math.sin(eng[i]._angleCache); sz += Math.cos(eng[i]._angleCache); }
    const mean = Math.atan2(sx, sz);
    const spread = Math.min(Math.PI * 1.75, 1.05 * n);
    const step = n > 1 ? spread / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const target = mean + (i - (n - 1) / 2) * step;
      const e = eng[i];
      e.slotAngle = force ? target : lerp(e.slotAngle, target, 0.5);
      e.slotIndex = i;
      e.slotCount = n;
    }
  }

  // ---------------------------------------------------------------------- update

  update(dt, elapsed, rawDt) {
    if (this.list.length === 0) return;
    this.difficulty = clamp(this.ctx.combat?.difficulty ?? 1, 0.4, 2.2);
    this.damageScale = 0.72 + 0.32 * this.difficulty;

    const cam = this.ctx.camera?.position;
    const near2 = this._lodNear * this._lodNear;
    const far2 = this._lodFar * this._lodFar;

    this._slotTimer -= dt;
    if (this._slotTimer <= 0) { this._slotTimer = 0.45; this._assignSlots(false); }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const d2 = cam ? e.position.distanceToSquared(cam) : 0;
      const lod = d2 > far2 ? 2 : d2 > near2 ? 1 : 0;
      if (lod !== e.lod) e.setLOD(lod);
      e.update(dt, elapsed, Math.sqrt(d2));
    }

    // A token holder that died, staggered or wandered off must not sit on it.
    const t = this._token;
    if (t.holder && (!t.holder.isAlive || !t.holder.active ||
      (t.holder.state !== 'attack' && (elapsed - t.at) > 2.5))) {
      t.holder = null;
      t.kind = null;
    }
  }
}

// ---------------------------------------------------------------------- scratch
const WAVE_TABLE = ['ashigaru', 'ronin', 'ashigaru', 'shinobi', 'oyoroi', 'ronin', 'ashigaru', 'shinobi'];
const _mixScratch = [];
const _spawnResult = [];
const _deathPayload = { entity: null, point: new Vector3(), direction: new Vector3() };

export default EnemyManager;
