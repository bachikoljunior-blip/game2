/**
 * dispatch.mjs — turn a critic verdict into the exact, minimal set of agents to spawn.
 *
 * Rounds so far dispatched every owner in ARCHITECTURE §8 regardless of what the critic
 * found. Round 3 measured the cost of that: the critic named about six areas, fourteen
 * owners were spawned, and roughly eight of them read their files, found nothing to do
 * and returned — about 1.6M tokens for zero change to the frame.
 *
 * The instinct to keep the fan-out wide is right, but it is aimed at the wrong stage.
 * The independence that makes this method work lives in the *reviewing*, not the
 * *fixing*: the critic looks at the whole frame with fresh eyes each round. An owner
 * with no finding against its files has nothing to be independent about. So the review
 * stays as wide as it ever was and only the repair fleet is gated.
 *
 *   node tools/dispatch.mjs --round=4
 *   node tools/dispatch.mjs --round=4 --json    # machine-readable plan
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ARCHITECTURE §8, as data. One agent per *team*, never one per file: two teams sharing
 * a file is how `Terrain.js` ended up assigned to two live agents at once, and that was
 * only caught because the second one noticed a write landing between its read and its
 * edit.
 */
const TEAMS = {
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

const OWNER_OF = new Map();
for (const [team, files] of Object.entries(TEAMS)) {
  for (const f of files) OWNER_OF.set(f, team);
}

/**
 * Model and reasoning effort per role.
 *
 * The split is not "cheap where we can get away with it" — it is drawn along the line
 * this project actually measured. Every defect that mattered was silent: correct-looking
 * config, no exception, no log. Finding those took reading a shader's linked uniforms,
 * ablating a light and re-measuring, checking a winding order numerically. That work
 * stays at the top tier and at full effort.
 *
 * What drops is work whose answer is already determined and merely needs computing —
 * a histogram, a triangle count, a table in a README. Those have a checkable right
 * answer, so a wrong one is caught immediately rather than becoming the next round's
 * false premise.
 */
const ROUTING = {
  critic: { model: 'opus', effort: 'high', why: 'the perceptual judgement the whole method rests on' },
  owner: { model: 'opus', effort: 'high', why: 'silent defects; diagnosis is the expensive part' },
  measure: { model: 'haiku', effort: 'low', why: 'numbers with one right answer, independently checkable' },
  scribe: { model: 'haiku', effort: 'low', why: 'mechanical collation, no judgement' },
};

function loadReview(round) {
  const file = join(ROOT, 'shots', `review-r${round}.json`);
  if (!existsSync(file)) {
    console.error(`no ${file} — run the critic first, and make sure it wrote to disk ` +
      `rather than replying with the JSON (see tools/CRITIC.md).`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 };

export function buildPlan(review) {
  const byTeam = new Map();
  const unrouted = [];

  for (const f of review.findings || []) {
    const owner = String(f.owner || '').replace(/^\.\//, '');
    const team = OWNER_OF.get(owner);
    // An owner the map does not know, or a path that no longer exists, is surfaced —
    // never dropped. A finding that quietly evaporates is worse than one misrouted:
    // misrouted gets bounced back, evaporated is invisible.
    if (!team || !existsSync(join(ROOT, owner))) {
      unrouted.push({ ...f, reason: !team ? `no team owns ${owner || '(blank)'}` : `${owner} does not exist` });
      continue;
    }
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push({ ...f, owner });
  }

  const dispatch = [...byTeam.entries()].map(([team, findings]) => {
    findings.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));
    return {
      team,
      role: 'owner',
      ...ROUTING.owner,
      files: [...new Set(findings.map((f) => f.owner))],
      findings: findings.length,
      blockers: findings.filter((f) => f.severity === 'blocker').length,
      worst: findings[0]?.severity ?? 'minor',
      summary: findings.map((f) => `${f.shot}: ${f.problem}`.slice(0, 110)),
    };
  }).sort((a, b) => (SEVERITY_RANK[a.worst] ?? 3) - (SEVERITY_RANK[b.worst] ?? 3));

  const skipped = Object.keys(TEAMS).filter((t) => !byTeam.has(t));
  return { dispatch, skipped, unrouted };
}

function main() {
  const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }));
  const round = argv.round ?? 4;
  const review = loadReview(round);
  const plan = buildPlan(review);

  if (argv.json) { console.log(JSON.stringify({ round, verdict: review.verdict, ...plan }, null, 2)); return; }

  console.log(`round ${round}: ${review.verdict}, score ${review.score ?? '?'}, ` +
    `${(review.findings || []).length} findings\n`);

  if (!plan.dispatch.length) {
    console.log('nothing to dispatch — no finding routes to an owned file.');
  }
  for (const d of plan.dispatch) {
    console.log(`spawn  ${d.team.padEnd(10)} ${d.model}/${d.effort}  ` +
      `${d.findings} finding(s), ${d.blockers} blocker(s)`);
    for (const s of d.summary) console.log(`         · ${s}`);
    console.log(`         files: ${d.files.join(', ')}`);
  }

  // Printing the skips is the point of the gate, not a footnote. A silent gate looks
  // exactly like a gate that is broken and letting nothing through.
  console.log(`\nnot spawned (no finding against their files): ${plan.skipped.join(', ') || '(none)'}`);
  console.log(`  ~${(plan.skipped.length * 200).toLocaleString()}k tokens not spent on agents ` +
    `that would have reported "nothing to do"`);

  if (plan.unrouted.length) {
    console.log(`\nUNROUTED — the coordinator must place these by hand:`);
    for (const u of plan.unrouted) console.log(`  · [${u.severity}] ${u.shot}: ${u.problem} (${u.reason})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
