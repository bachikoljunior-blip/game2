#!/usr/bin/env node
/**
 * verify-published.mjs — fetch what the public actually gets and prove it is what we shipped.
 *
 * A green deploy step is not evidence. It says the upload succeeded, not that the URL serves
 * the new build, and both recorded failures in that gap looked like successful deploys: a
 * Pages race after a state-only default-branch update, and a rendered README overwriting a
 * published game.
 *
 *   PUBLIC_URL=https://owner.github.io/repo/ node tools/verify-published.mjs
 *   node tools/verify-published.mjs --url=... --marker='<title>NAME</title>'
 *
 * Configure `MARKERS` below with something only the real page contains. If the project
 * stamps a revision into its HTML (see `.kit/lib/release/revision.mjs`), leave `codec` alone
 * and the digest is recomputed from the served bytes — that check catches a wrong page
 * without being told what the right one looks like. If it does not, pass `--no-revision` and
 * rely on the markers.
 */

import { verifyServed } from '../.kit/lib/release/verifyServed.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || true];
}));

const url = String(argv.url || process.env.PUBLIC_URL || '').trim();
if (!url) {
  console.error('FAIL no URL. Pass --url= or set PUBLIC_URL.');
  process.exit(2);
}

/** Replace with substrings only the real page contains. An empty list weakens the check. */
const MARKERS = [argv.marker].filter(Boolean).map(String);

const result = await verifyServed({
  url,
  markers: MARKERS,
  codec: argv['no-revision'] ? null : undefined,
  expectedRevision: argv.revision ? String(argv.revision) : null,
  onAttempt: (attempt, failures) => console.log(`attempt ${attempt}: ${failures.join('; ')}`),
});

if (!result.ok) {
  console.error(`FAIL ${url} did not verify after ${result.attempts} attempt(s):`);
  for (const f of result.failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${url} serves the published build (HTTP ${result.status}, revision ${result.revision || 'not stamped'}, ${result.attempts} attempt(s)).`);
