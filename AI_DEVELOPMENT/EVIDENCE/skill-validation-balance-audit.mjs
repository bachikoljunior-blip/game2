/**
 * balance-audit, applied for real.
 *
 * The `balance-audit` skill names no module and no command — it is a method. So validating it
 * means running the method end to end against a real economy, and then requiring each defect
 * class it enumerates to be detected on an economy deliberately broken in that exact way.
 *
 * Target: the 17-tier upgrade ladder in Simple-browser-cookie-clicker-game/play.html.
 * Read-only — nothing in that repository is modified (it is excluded from integration).
 *
 *   node balance-audit.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const PLAY = '/home/user/Simple-browser-cookie-clicker-game/play.html';

/* --------------------------------------------------------------- extract the economy */

export function extractUpgrades(html) {
  const start = html.indexOf('const UPGRADES = [');
  if (start < 0) throw new Error('UPGRADES not found — the audit would silently measure nothing');
  const end = html.indexOf('\n];', start);
  const body = html.slice(start + 'const UPGRADES = ['.length, end);

  const out = [];
  const re = /\{\s*id:\s*"([^"]+)"[^}]*?type:\s*"([^"]+)",\s*value:\s*([0-9.e+-]+),\s*base:\s*([0-9.e+-]+),\s*growth:\s*([0-9.e+-]+)/g;
  let m;
  while ((m = re.exec(body))) {
    out.push({ id: m[1], type: m[2], value: Number(m[3]), base: Number(m[4]), growth: Number(m[5]) });
  }
  if (!out.length) throw new Error('UPGRADES matched zero entries — extractor is broken');
  return out;
}

/* --------------------------------------------------------------- the simulator */

const costOf = (u, owned) => u.base * Math.pow(u.growth, owned);

/**
 * One simulated run. Tick is one second; the player also taps at `taps` per second.
 * Returns the trace the audit reads — never a verdict.
 */
export function simulate(upgrades, policy, { hours = 60, taps = 3 } = {}) {
  const owned = Object.fromEntries(upgrades.map((u) => [u.id, 0]));
  const firstBought = {};
  let cookies = 0, seconds = 0;
  let saturated = null, nan = null;

  const cps = () => upgrades.reduce((s, u) => s + (u.type === 'cps' ? u.value * owned[u.id] : 0), 0);
  const clickPower = () => 1 + upgrades.reduce((s, u) => s + (u.type === 'click' ? u.value * owned[u.id] : 0), 0);

  const total = hours * 3600;
  for (; seconds < total; seconds++) {
    cookies += cps() + clickPower() * taps;

    if (!Number.isFinite(cookies) && saturated === null) saturated = seconds;
    if (Number.isNaN(cookies) && nan === null) nan = seconds;

    // One purchase decision per tick, and the policy may decline in order to save.
    //
    // The first version of this loop bought *everything affordable* every tick, which drained
    // the bank regardless of what the policy chose. Four of the five policies then returned
    // byte-identical traces (cps 1.20e+6, owned 382) because the policy only reordered
    // purchases it was going to make anyway. A simulator that cannot tell a hoarder from a
    // rusher measures the cost table, not the play.
    const affordable = upgrades.filter((u) => costOf(u, owned[u.id]) <= cookies);
    const pick = affordable.length ? policy(affordable, owned, cookies, upgrades) : null;
    if (pick) {
      cookies -= costOf(pick, owned[pick.id]);
      owned[pick.id] += 1;
      if (firstBought[pick.id] === undefined) firstBought[pick.id] = seconds;
    }
  }

  return {
    owned, firstBought, cookies, cps: cps(), clickPower: clickPower(),
    saturatedAt: saturated, nanAt: nan,
    neverBought: upgrades.filter((u) => owned[u.id] === 0).map((u) => u.id),
  };
}

/**
 * Explicit behaviour models, not one optimal bot. Each may return null to decline and save.
 */
export const POLICIES = {
  // Best production gained per cookie spent.
  efficiency: (aff, owned) => aff.slice().sort((a, b) =>
    (b.value / costOf(b, owned[b.id])) - (a.value / costOf(a, owned[a.id])))[0],
  // Rusher: always the cheapest thing available, immediately.
  cheapest: (aff, owned) => aff.slice().sort((a, b) => costOf(a, owned[a.id]) - costOf(b, owned[b.id]))[0],
  // Hoarder: refuses to spend on anything but the deepest tier it has not yet unlocked, so it
  // sits on cookies for long stretches. Declining is the behaviour, not an absence of one.
  hoarder: (aff, owned, cookies, all) => {
    const deepestUnowned = [...all].reverse().find((u) => owned[u.id] === 0);
    if (!deepestUnowned) return aff[aff.length - 1];
    return costOf(deepestUnowned, 0) <= cookies ? deepestUnowned : null;
  },
  // Specialist: taps only.
  clicker: (aff) => aff.filter((u) => u.type === 'click')[0] || null,
  // Breadth-first: whatever the player owns least of.
  spread: (aff, owned) => aff.slice().sort((a, b) => owned[a.id] - owned[b.id])[0],
};

/* --------------------------------------------------------------- defect detectors */

/** The classes the skill enumerates, each as a check over the ladder and the traces. */
export function auditEconomy(upgrades, traces) {
  const findings = [];
  const cps = upgrades.filter((u) => u.type === 'cps');

  for (let i = 1; i < cps.length; i++) {
    if (cps[i].base === cps[i - 1].base) {
      findings.push({ kind: 'collapsed-cost-ladder', detail: `${cps[i - 1].id} and ${cps[i].id} share base ${cps[i].base}` });
    }
    if (cps[i].base < cps[i - 1].base) {
      findings.push({ kind: 'reversed-tier-cost', detail: `${cps[i].id} (${cps[i].base}) is cheaper than ${cps[i - 1].id} (${cps[i - 1].base})` });
    }
  }
  for (const u of upgrades) {
    if (!Number.isFinite(u.base) || !Number.isFinite(u.value) || !Number.isFinite(u.growth)) {
      findings.push({ kind: 'nan-or-infinite-parameter', detail: `${u.id} carries a non-finite parameter` });
    }
    if (u.value === 0) findings.push({ kind: 'dead-upgrade', detail: `${u.id} adds nothing` });
  }

  // Dead across every policy — no behaviour model ever found a reason to buy it.
  const deadEverywhere = upgrades
    .filter((u) => Object.values(traces).every((t) => t.owned[u.id] === 0))
    .map((u) => u.id);
  if (deadEverywhere.length) findings.push({ kind: 'unreachable-content', detail: `never bought by any policy: ${deadEverywhere.join(', ')}` });

  for (const [name, t] of Object.entries(traces)) {
    if (t.saturatedAt !== null) findings.push({ kind: 'numeric-saturation', detail: `${name} saturated at t=${t.saturatedAt}s` });
    if (t.nanAt !== null) findings.push({ kind: 'nan-leak', detail: `${name} went NaN at t=${t.nanAt}s` });
  }
  return findings;
}

/* --------------------------------------------------------------- run it */

// Guarded: importing this module to reuse `simulate`/`auditEconomy` must not launch a run.
// `game2/tools/capture.mjs` and `Q/tools/floor-gates.mjs` both had this defect, and in the
// second case importing the old copy to compare against launched the real gate.
if (import.meta.url === `file://${process.argv[1]}`) main();

function main() {

const upgrades = extractUpgrades(readFileSync(PLAY, 'utf8'));
const HOURS = Number(process.env.HOURS || 60);

const traces = {};
for (const [name, policy] of Object.entries(POLICIES)) traces[name] = simulate(upgrades, policy, { hours: HOURS });

console.log(`economy: ${upgrades.length} upgrades (${upgrades.filter((u) => u.type === 'cps').length} cps, ${upgrades.filter((u) => u.type === 'click').length} click)`);
console.log(`policies: ${Object.keys(POLICIES).length}, run length: ${HOURS} simulated hours each\n`);

console.log('per policy — reported per policy, never aggregated:');
for (const [name, t] of Object.entries(traces)) {
  const times = Object.values(t.firstBought).sort((a, b) => a - b);
  const gaps = times.slice(1).map((x, i) => x - times[i]);
  const worst = gaps.length ? Math.max(...gaps) : 0;
  console.log(`  ${name.padEnd(11)} cps ${t.cps.toExponential(2).padStart(10)}  owned ${Object.values(t.owned).reduce((a, b) => a + b, 0).toString().padStart(5)}  tiers ${(upgrades.length - t.neverBought.length)}/${upgrades.length}  last unlock t=${(times[times.length - 1] ?? 0)}s  longest gap ${worst}s`);
}

/* Apparatus check, before any number above is trusted.
 *
 * Distinct behaviour models must produce distinct traces, or the per-policy report is one row
 * printed five times.
 *
 * The signature is the **trajectory**, not the final state, and that distinction was measured
 * rather than assumed. Final state alone called efficiency, cheapest and spread identical; the
 * hypothesis "the policy is not reaching the simulation" was wrong. Replaying the run showed
 * the affordable set has more than one member on 87 of 382 purchases, and the three policies
 * choose *differently* on 69 of them (18.1%). Play here is cost-limited, so a different
 * purchase order converges to the same multiset by 60 h — the endpoints agree while the paths
 * do not. `firstBought` separates all three. */
const signature = (t) => JSON.stringify(t.firstBought);
const signatures = new Map();
for (const [name, t] of Object.entries(traces)) {
  const s = signature(t);
  if (!signatures.has(s)) signatures.set(s, []);
  signatures.get(s).push(name);
}
const collisions = [...signatures.values()].filter((names) => names.length > 1);
console.log(`\napparatus: ${signatures.size} distinct traces from ${Object.keys(POLICIES).length} policies`);
for (const names of collisions) console.log(`  WARNING identical trajectories: ${names.join(' == ')} — these policies are not distinct behaviour models`);
if (signatures.size < 3) {
  console.error('FAIL the policies are not discriminating; the per-policy report would be decorative.');
  process.exit(1);
}

const findings = auditEconomy(upgrades, traces);
console.log(`\nfindings on the real economy: ${findings.length}`);
for (const f of findings) console.log(`  [${f.kind}] ${f.detail}`);

/* --------------------------------------------------------------- negative controls */

console.log('\ninjected-defect controls — each must be detected, or the audit is decorative:');
const control = (label, mutate, expectKind) => {
  const broken = JSON.parse(JSON.stringify(upgrades));
  mutate(broken);
  const t = {}; for (const [n, p] of Object.entries(POLICIES)) t[n] = simulate(broken, p, { hours: 8 });
  const got = auditEconomy(broken, t);
  const hit = got.some((f) => f.kind === expectKind);
  console.log(`  ${hit ? 'DETECTED' : 'MISSED  '}  ${label}  (expected ${expectKind})`);
  return hit;
};

const results = [
  control('top 3 cps tiers flattened to one placeholder cost', (u) => {
    const cps = u.filter((x) => x.type === 'cps');
    for (const x of cps.slice(-3)) x.base = 1.0e90;
  }, 'collapsed-cost-ladder'),
  control('a tier made cheaper than the one below it', (u) => {
    const cps = u.filter((x) => x.type === 'cps'); cps[5].base = cps[4].base / 2;
  }, 'reversed-tier-cost'),
  control('an upgrade whose effect is zero', (u) => { u[3].value = 0; }, 'dead-upgrade'),
  control('a NaN multiplier in a cost parameter', (u) => { u[6].growth = NaN; }, 'nan-or-infinite-parameter'),
  control('production driven to Infinity', (u) => { u[2].value = 1e308; u[2].base = 1; }, 'numeric-saturation'),
];

const passed = results.filter(Boolean).length;
console.log(`\ncontrols detected: ${passed}/${results.length}`);
console.log(`control that must NOT fire: real economy has ${findings.filter((f) => ['collapsed-cost-ladder', 'reversed-tier-cost', 'nan-or-infinite-parameter'].includes(f.kind)).length} ladder/NaN findings`);

writeFileSync(new URL('./balance-audit-result.json', import.meta.url), JSON.stringify({
  upgrades: upgrades.length, hours: HOURS,
  perPolicy: Object.fromEntries(Object.entries(traces).map(([k, v]) => [k, {
    cps: v.cps, totalOwned: Object.values(v.owned).reduce((a, b) => a + b, 0),
    neverBought: v.neverBought, saturatedAt: v.saturatedAt, nanAt: v.nanAt,
  }])),
  findings, controlsDetected: passed, controlsTotal: results.length,
}, null, 2));

}
