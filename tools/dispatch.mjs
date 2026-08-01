/**
 * dispatch.mjs — turn a critic verdict into the exact, minimal set of agents to spawn.
 *
 * The routing logic now lives in `kit/lib/plan/dispatch.mjs`, shared with the other
 * repositories. What stays here is the part that is genuinely KAGEROU's: the team map and
 * the file it is transcribed from. `kit/test/run.mjs` holds a frozen fixture of this tool's
 * output from before the change and asserts the shared implementation reproduces it on all
 * nine real review files, so the substitution is measured rather than assumed.
 *
 * Rounds so far dispatched every owner in ARCHITECTURE §8 regardless of what the critic
 * found. Round 3 measured the cost: the critic named about six areas, fourteen owners were
 * spawned, and roughly eight read their files, found nothing to do and returned — about
 * 1.6M tokens for zero change to the frame.
 *
 * The instinct to keep the fan-out wide is right but aimed at the wrong stage. The
 * independence that makes this method work lives in the *reviewing*: the critic looks at the
 * whole frame with fresh eyes each round. An owner with no finding against its files has
 * nothing to be independent about. So the review stays as wide as it ever was and only the
 * repair fleet is gated.
 *
 *   node tools/dispatch.mjs --round=4
 *   node tools/dispatch.mjs --round=4 --json    # machine-readable plan
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan as buildSharedPlan, formatPlan, DEFAULT_ROUTING } from '../kit/lib/plan/dispatch.mjs';
import { validateFindings } from '../kit/lib/plan/findings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ARCHITECTURE §8, as data. One agent per *team*, never one per file: two teams sharing a
 * file is how `Terrain.js` ended up assigned to two live agents at once, and that was only
 * caught because the second one noticed a write landing between its read and its edit.
 *
 * This is a hand-transcribed copy of the document, and it had silently drifted from it —
 * `Cinematic.js` and `Constants.js` were owned here and absent there until 2026-08-01.
 * `npm run check:ownership` now fails on any further drift.
 */
export const TEAMS = {
  core: ['src/main.js', 'src/core/Engine.js', 'src/core/Quality.js', 'src/core/Input.js',
    'src/core/EventBus.js', 'src/core/Noise.js', 'src/core/Cinematic.js'],
  audio: ['src/core/Audio.js'],
  materials: ['src/render/Materials.js'],
  sky: ['src/render/Sky.js', 'src/render/Lighting.js'],
  postfx: ['src/render/PostFX.js'],
  foliage: ['src/render/Foliage.js'],
  world: ['src/world/Terrain.js', 'src/world/Props.js', 'src/world/Level.js',
    'src/world/Constants.js'],
  anim: ['src/anim/Rig.js', 'src/anim/Poses.js'],
  physics: ['src/gameplay/Physics.js'],
  player: ['src/gameplay/Player.js', 'src/gameplay/PlayerCamera.js'],
  combat: ['src/gameplay/Combat.js'],
  enemy: ['src/gameplay/Enemy.js', 'src/gameplay/EnemyAI.js'],
  fx: ['src/fx/Effects.js', 'src/fx/Weather.js'],
  ui: ['src/ui/HUD.js', 'src/ui/TouchControls.js', 'src/ui/Menus.js'],
};

/** The shared defaults, with each role's rationale, are in `kit/lib/plan/dispatch.mjs`. */
const ROUTING = DEFAULT_ROUTING;

function loadReview(round) {
  const file = join(ROOT, 'shots', `review-r${round}.json`);
  if (!existsSync(file)) {
    console.error(`no ${file} — run the critic first, and make sure it wrote to disk ` +
      `rather than replying with the JSON (see tools/CRITIC.md).`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function buildPlan(review) {
  return buildSharedPlan(review, {
    teams: TEAMS,
    routing: ROUTING,
    fileExists: (path) => existsSync(join(ROOT, path)),
  });
}

function main() {
  const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }));
  const round = argv.round ?? 4;
  const review = loadReview(round);

  // The critic's output shape was never checked before, and the review files on disk have
  // already drifted apart. A finding missing `owner` or `severity` is one nobody will act on.
  const knownOwners = new Set(Object.values(TEAMS).flat());
  const { failures, warnings } = validateFindings(review, { knownOwners });
  for (const w of warnings) console.warn(`  ! ${w}`);
  if (failures.length) {
    console.error(`review-r${round}.json is not a valid findings file:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(2);
  }

  const plan = buildPlan(review);
  if (argv.json) { console.log(JSON.stringify({ round, verdict: review.verdict, ...plan }, null, 2)); return; }
  console.log(formatPlan(plan, {
    round, verdict: review.verdict, score: review.score, findings: (review.findings || []).length,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
