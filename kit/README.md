# kit

Verified, reusable development tooling, extracted from eight shipped browser-game
repositories. Nothing here is new code written speculatively — every module is a
consolidation of two to six existing implementations, and each one carries the measurement
that justified its shape.

## Why it exists

The same work had been done independently, repeatedly, and the duplicates disagreed:

| Job | Implementations found | Consequence of the disagreement |
|---|---|---|
| Static file server | 6 | two were missing the `.mjs` MIME type |
| Chromium launch flags | 4 dialects | only one set proxies, so only one can reach a public URL |
| Page error capture | 8 variants | one watches `pageerror` only — a run whose assets 404 reports a clean pass |
| Public-surface verification | 4 strategies, 7 files | only one retries for CDN propagation; only one is content-addressed |
| Project-state validation | 5 | two are ~70% the same validator, reimplemented |
| Headless boot harness | 28 `probe_*.mjs` in one repo | each rewrites the same boot wait |
| Operating protocol, state layout and CI | 2 protocols, 2 state formats | fifteen substantive disagreements; two floor gates that cannot both pass as written |

And the failures they were built in response to are all on record: an unverified mechanism
guess that made the output worse, a fix one round shipped and the next measured as a no-op,
1.6M tokens of agents dispatched against findings that did not concern them, a rendered
README overwriting a published game, and two sessions independently solving the same problem
because three handoff documents disagreed.

## Install it into a repository

```bash
node tools/bootstrap.mjs --target=/path/to/repo
node tools/bootstrap.mjs --target=/path/to/repo --check
node tools/bootstrap.mjs --target=/path/to/repo --template   # + protocol, state and CI
```

Vendored deliberately: these sessions run in disposable containers where nothing outside git
survives, so a repository has to carry its own tooling.

## What is in it

```
lib/browser/   serve · launch · diagnostics · boot · lock · glcaps
lib/image/     png · measure            (zero dependencies — no browser needed to measure one)
lib/release/   revision · verifyServed · verifyLive · mirror
lib/state/     files · secrets · graph · floorGate · selftest · yaml
lib/plan/      contentHash · dispatch · findings · ownership
tools/         bootstrap · check-ownership
template/      protocol · state · CI scaffolding, and the fifteen-way divergence table
.claude/skills/  probe · publish · critic · bootstrap
```

`template/` is the discipline the tooling assumes: one product-neutral operating protocol,
two machine-readable state files, a state gate that can prove it fails, and CI that runs it.
Installing it is a separate flag because `.kit/` is vendored and must never be edited in
place, while the template exists to be edited — so template files are never overwritten,
never entered in the ledger, and never reported as drift. **Read `template/README.md` before
adopting it**: the repositories genuinely disagree on fifteen points, several of them cases
where two implementations of the same gate cannot both pass, and each row records what was
chosen and what the choice costs.

Node ≥ 22 (`node:fs.globSync` and the built-in test runner). `playwright` is an optional peer
dependency, needed only by `lib/browser/launch.mjs`, `glcaps.mjs` and `lib/release/verifyLive.mjs`.

## The rules the code encodes

- **Measure, do not assert.** "It looks better" is not a result. Almost every defect on these
  projects was silent — no exception, no log, plausible-looking configuration.
- **Check the apparatus before trusting it.** It has broken five times, and every time it
  turned a correct critique into a wrong fix.
- **Byte-identical before/after means the branch you edited does not draw those pixels.** Not
  that the change was subtle. `compareRegion` says so out loud.
- **Symptoms are reliable; mechanisms are not.** 6/6 symptom calls held; 4/4 mechanism guesses
  did not. Findings keep `problem` and `hypothesis` apart, and a hypothesis is disproved
  before it is acted on.
- **A gate must be seen to fail.** A silently inert gate looks exactly like a passing one.
  `lib/state/selftest.mjs` makes proving it a first-class step, with a must-pass control
  alongside the must-fail cases.
- **Verified means evidenced.** `antiFabrication` refuses a criterion marked verified whose
  apparatus is missing, whose evidence is `none`, or whose measured value is empty.
- **Never call a thing published until the served bytes were fetched and checked.**

## Tests

```bash
npm test        # node --test test/run.mjs
```

34 tests. Every gate is tested in both directions — it must fire on a broken input *and* stay
quiet on a good one, because a gate that fires on everything is as broken as one that never
fires. The dispatch tests additionally assert that `lib/plan/dispatch.mjs` reproduces
`game2/tools/dispatch.mjs` exactly across all six real review files, so replacing the
original is a verified substitution rather than a hopeful one, and the template test installs
the scaffolding into a scratch repository, validates it, and runs its self-test.

That second direction has already earned its place here. `antiFabrication` read
`evidenceState` while the template state files are snake_case, so the lookup returned
`undefined`, `undefined` counts as empty evidence, and the check reported a failure for the
right criterion for the wrong reason — a gate inspecting a field that was never there. It was
found by running the gate against real state, not by reading it.
