/**
 * manifest.mjs — decide which shots actually need re-photographing.
 *
 * A SwiftShader boot is two to five minutes and the rig serialises on a file lock, so a
 * five-shot review set costs real wall-clock and, when several owners queue behind it,
 * costs whole agents that time out mid-boot. Across the rounds run so far, a typical
 * round changed one or two systems and then re-shot all five frames anyway.
 *
 * So: hash the sources each shot can possibly depend on, and carry an unchanged shot
 * forward from the previous round instead of taking it again.
 *
 * The dangerous failure here is asymmetric. Re-shooting something that did not change
 * wastes a few minutes; *skipping* something that did change hands the critic a stale
 * frame, and round 2 already showed what that costs — a reviewer nearly filed an
 * already-fixed bug as a regression off a mixed set. Every dependency list below is
 * therefore deliberately over-broad: when in doubt, a file is in.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'shots', 'manifest.json');

/**
 * Files that change every pixel of every frame. Anything that grades, lights, or
 * composites goes here, as does the rig itself — a change to `capture.mjs` can move a
 * camera or a settle time, and that is a real difference in the image.
 */
const GLOBAL = [
  'index.html',
  'vite.config.js',
  'src/main.js',
  'src/core/Engine.js',
  'src/core/Quality.js',
  'src/core/Noise.js',
  'src/core/Cinematic.js',
  'src/render/Materials.js',
  'src/render/Sky.js',
  'src/render/Lighting.js',
  'src/render/PostFX.js',
  'src/world/Constants.js',
  'src/fx/Weather.js',
  'tools/capture.mjs',
  'tools/luma.mjs',
];

/**
 * What each review shot additionally has in frame. `sun` is the one genuinely narrow
 * shot — it looks up the sun's axis over an empty ridge, so terrain silhouette and
 * atmosphere are all it can show.
 */
const PER_SHOT = {
  hero: [
    'src/world/Terrain.js', 'src/world/Props.js', 'src/world/Level.js',
    'src/render/Foliage.js', 'src/gameplay/Player.js', 'src/gameplay/PlayerCamera.js',
    'src/anim/Rig.js', 'src/anim/Poses.js', 'src/fx/Effects.js',
  ],
  wide: [
    'src/world/Terrain.js', 'src/world/Props.js', 'src/world/Level.js',
    'src/render/Foliage.js',
  ],
  torii: [
    'src/world/Props.js', 'src/world/Level.js', 'src/world/Terrain.js',
    'src/render/Foliage.js',
  ],
  valley: [
    'src/world/Terrain.js', 'src/render/Foliage.js',
  ],
  sun: [
    'src/world/Terrain.js',
  ],
  // Non-review beats, kept accurate so `--diff` is usable outside the review set.
  combat: [
    'src/world/Terrain.js', 'src/world/Props.js', 'src/world/Level.js',
    'src/render/Foliage.js', 'src/gameplay/Player.js', 'src/gameplay/PlayerCamera.js',
    'src/gameplay/Combat.js', 'src/gameplay/Enemy.js', 'src/gameplay/EnemyAI.js',
    'src/anim/Rig.js', 'src/anim/Poses.js', 'src/fx/Effects.js', 'src/ui/HUD.js',
  ],
  closeup: [
    'src/gameplay/Player.js', 'src/gameplay/PlayerCamera.js',
    'src/anim/Rig.js', 'src/anim/Poses.js', 'src/world/Props.js',
  ],
};

/** Anything not listed is assumed to depend on everything. Unknown means unsafe. */
function depsFor(shot) {
  const extra = PER_SHOT[shot];
  if (!extra) {
    return [...new Set([...GLOBAL, ...Object.values(PER_SHOT).flat()])].sort();
  }
  return [...new Set([...GLOBAL, ...extra])].sort();
}

/**
 * Hash the dependency set by content, not by mtime. A checkout, a stash pop or a
 * rebase all move mtimes without changing a byte, and after any of those a
 * mtime-keyed manifest would re-shoot the whole set for nothing.
 *
 * A missing file is hashed as the literal string `absent` rather than skipped, so
 * deleting a dependency registers as a change.
 */
export function shotHash(shot) {
  const h = createHash('sha1');
  for (const rel of depsFor(shot)) {
    h.update(rel);
    h.update('\0');
    const abs = join(ROOT, rel);
    h.update(existsSync(abs) ? readFileSync(abs) : 'absent');
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

export function readManifest() {
  if (!existsSync(MANIFEST)) return {};
  try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { return {}; }
}

export function writeManifest(m) {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

/**
 * Partition a wanted shot list into the ones that must be taken and the ones that can
 * be carried forward. A carried entry has to point at a PNG that still exists — the
 * manifest can outlive the images it describes.
 */
export function plan(profile, shots) {
  const m = readManifest();
  const fresh = [];
  const stale = [];
  for (const shot of shots) {
    const hash = shotHash(shot);
    const prev = m[`${profile}-${shot}`];
    if (prev && prev.hash === hash && prev.file && existsSync(prev.file)) {
      fresh.push({ shot, hash, from: prev.file, tag: prev.tag ?? null });
    } else {
      stale.push({ shot, hash, why: !prev ? 'never captured' : prev.hash !== hash ? 'sources changed' : 'previous PNG is gone' });
    }
  }
  return { fresh, stale };
}

/** Record a shot as captured at this hash, so the next round can carry it forward. */
export function record(profile, shot, file, tag) {
  const m = readManifest();
  m[`${profile}-${shot}`] = { hash: shotHash(shot), file, tag: tag || null };
  writeManifest(m);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }));
  const profiles = String(argv.profile || 'phone,desktop').split(',');
  const shots = String(argv.shots || 'hero,wide,torii,valley,sun').split(',');
  for (const p of profiles) {
    const { fresh, stale } = plan(p, shots);
    console.log(`[${p}] recapture: ${stale.map((s) => `${s.shot} (${s.why})`).join(', ') || '(none)'}`);
    console.log(`[${p}] carry forward: ${fresh.map((f) => f.shot).join(', ') || '(none)'}`);
  }
}
