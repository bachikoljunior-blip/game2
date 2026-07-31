# Running one review round

This file is the operational brief for one art-direction round. The authority order starts
with `PROJECT_OPERATING_PROTOCOL.md`; `CLAUDE.md` is the standing KAGEROU brief and
`HANDOFF.md` carries the current round state.

**One round is the unit of visual measurement and reporting, not a logical-session
boundary.** Invoking `/round` runs one art round. A general continuation request follows the
project active frontier and may close the current round, repair it, or work elsewhere when
evidence ranks that higher. The logical session stays active until the user explicitly ends
it.

The report between rounds is not ceremony. The expensive failure mode here was never a bad
round — it was three rounds built on a premise nobody re-checked, twice because the
measurement rig was quietly broken. Surfacing the numbers each time is what stops that.

---

## What this build is

KAGEROU 陽炎 — a mobile-first samurai action game in Three.js, zero external assets:
every texture, mesh, animation and sound is synthesised at boot. `ARCHITECTURE.md` is the
binding contract that lets independent agents work on it in parallel; read §5 (art
direction), §7 (perf budget) and §8 (file ownership) before dispatching anything.

> **Last completed round: 12. Active round: none.** The user authorized exactly Rounds
> 10–12 in this run. The coherent `r12v1` checkpoint verifies the apparatus, budgets, tone,
> and lantern repair but remains an overall visual FAIL. Publish the incremental checkpoint,
> then stop; do not activate Round 13.

An independent critic has scored it 34 → 48 → 58 → (round 4 unfiled) → (5 and 6 unscored)
→ 44 → **46** → **47 pre-fix in round 9** out of 100 against a *Ghost of Tsushima* /
*SEKIRO* bar. It has not passed. Round 8 filed FAIL with four blockers, dispatched five of
the fourteen owners, and
**disproved two of the four blockers' attributions** — the shadows the critic said were
missing are present and measurable, and the fringe it read as lens dispersion was two
channels of antialiasing being discarded.

The score gap from round 3's 58 is not a regression measurement — different critic
instances, four rounds apart, against a review set that has since had the HUD blanked.

Latest coherent measurements (`r12v1`):

| | measured | contract |
|---|---|---|
| phone draw calls | **119** worst pose | ≤ 140 ✓ |
| phone triangles | **767,124** worst pose | ≤ 900,000 ✓ |
| black gate, all five | p0.1 = 0, 12, 0, 0, 6 | < 15 ✓ |
| white gate, eligible shots | hero 236 ✓, torii 251 ✓ | > 235 |

The lantern near/far ratio is **2.394** and its stopped-frame A/B passes; a source-blind
lantern review also passes. The full finding verifier still fails fill, shadow edge, sky,
sakura hue, and far range, while valley remains blocked by stale semantic probes.

`tools/capture.mjs` applies the white gate only to shots that contain a sufficiently large
authored highlight population (`hero`, `torii`, and the non-review `combat`/`closeup`
poses). `wide` is front-lit by construction; `valley` and `sun` are composition/effect
poses, not part of this percentile gate. Their p99.9 values remain evidence, not pass/fail
inputs.

Still open, measured at the end of round 8 — `HANDOFF.md` carries the reasoning and the
full list of what rounds 7 and 8 disproved:

| | measured | owner |
|---|---|---|
| no instanced ground cover in the basin | `grassRadius` 34 m against regions at 15–90 m | `Foliage.js` |
| the cool fill is eaten before the pixel | fitted illuminant B/R 0.141 = the key's own | `Materials.js` |
| far range under-textured | detail 1.68 against a ≥ 3.0 target | `Terrain.js` |
| valley saturation | 0.609 against 0.55; not reachable from albedo | `Lighting.js` |

---

## The round, in five steps

```bash
npm ci --cache /tmp/game2-npm-cache              # first Work checkout in this environment
npm run build
node tools/capture.mjs --review --diff --profile=phone --tag=rN   # 1. photograph
node tools/contact-sheet.mjs --tag=rN             # 2. tile for the critic
#                                                   3. critic → shots/review-rN.json
node tools/dispatch.mjs --round=N                 # 4. who to spawn
#                                                   5. spawn exactly those, then verify
```

Substitute the active round identifier from `HANDOFF.md`; never infer it from ignored PNGs.

**Capture phone first.** It is the pass/fail profile, and it boots in ~35 s against
desktop/ULTRA's ~200 s with minutes per 1920x1080 screenshot — a combined
`--profile=phone,desktop --review` run has failed to finish inside a usable window. Add
desktop only when you specifically want to judge the showcase tier.

**The active round and exact phase are recorded in `HANDOFF.md`.** Do not derive them from
`shots/`: most of that directory is gitignored, and a repair branch can contain a tracked
critic verdict without its post-fix images. Update `HANDOFF.md` atomically when a round
closes; this generic procedure must not become a second mutable round-state source.

### 1. Capture

`--diff` carries any shot whose sources are byte-identical forward instead of
re-photographing it (`tools/manifest.mjs`). A SwiftShader boot is two to five minutes and
the rig serialises on a file lock, so this is wall-clock as well as tokens; when nothing
at all needs taking it does not launch a browser or queue for the lock.

**Be clear about where the saving actually lands in a single-round session.** `shots/` is
gitignored, so a fresh clone has no manifest and the opening capture photographs
everything — which is the correct failure direction, and it means step 1 here is full
price. What `--diff` pays for is **step 5**: after the owners have changed two or three
files, the verification capture re-shoots only the frames those files can affect and
carries the rest. On a five-shot set where one team changed `Foliage.js`, that is one boot
instead of five.

`--review` locks the set to `hero, wide, torii, valley, sun` and refuses to declare the
set coherent if one is missing. Do not hand the critic a partial or mixed-build set —
round 2 did, and the reviewer nearly filed an already-fixed bug as a regression.

Before going further, read `shots/report-rN.json` and check three things:

- `booted: true` on every profile.
- No `DEAD SHADER` lines. A material that links dead renders nothing and looks exactly
  like a density problem; the bamboo sea was invisible for three rounds that way.
- `stats.tier` is what you asked for. Five rounds were reviewed at LOW tier because a
  persisted setting was overriding `?q=`.

**The measurement apparatus has broken six times on this project, and every time it drove
a correct critique into a wrong fix.** Checking it costs a minute. Skipping it costs a
round, which is about 2M tokens.

The sixth was round 7's own prediction checker, and it is the cheapest one to avoid: it
indexed 3-channel RGB captures with a hard-coded 4-byte stride and returned *plausible*
numbers — `detail` 38.91 where `probe.mjs` says 2.58 — without throwing. **Whenever you
write a new measurement tool here, run one region through `tools/probe.mjs` first and
require the two to agree to the digit.**

Two things round 5 hit, both now handled but worth recognising:

- **A frame can miss its screenshot allowance without the run failing.** `desktop-hero`
  timed out at 420 s twice — the first frame after boot pays SwiftShader's lazy pipeline
  compile on top of its own render. The set then reports `REVIEW SET INCOMPLETE` and the
  other four frames are fine, so it reads like a partial success. Retry that profile with
  `--shot-timeout=900000`.
- **A per-profile retry used to erase the other profile's record.** `report-rN.json` now
  merges, so `--profile=desktop` keeps the phone numbers. It did not in round 5, and the
  phone baseline the whole round was measured against was lost mid-round.

### 2. Contact sheet

The critic judges composition, palette coherence and tonal range *across* the set. Twelve
separate PNGs lose exactly the comparison that matters.

### 3. Critic

One agent, **opus / high effort**. Hand it `tools/CRITIC.md` and the contact sheet. Do not
economise here — this is the perceptual judgement the entire method rests on, and it is
the one thing in the pipeline that cannot be recomputed or checked by a cheaper process.

It writes `shots/review-rN.json` and replies with only the verdict, score, blocker count
and one line per finding. That protocol exists because relaying findings through the
coordinator pays for the same text three times.

### 4. Gate the fan-out

`node tools/dispatch.mjs --round=N` reads the verdict and prints the teams to spawn, the
model and effort for each, and — explicitly — the teams it is *not* spawning.

Round 3 spawned all fourteen owners against six findings. Eight read their files, found
nothing, and returned: about 1.6M tokens for no change to the frame. The width that makes
this method work is in the *reviewing*, and that stays untouched; an owner with no finding
against its files has nothing to be independent about.

If `dispatch.mjs` prints an **UNROUTED** section, place those findings by hand. Never let
one evaporate.

### 5. Spawn, then verify

Spawn exactly the teams listed, in parallel, one agent per team. Then one verification
agent (**haiku / low**) re-runs the capture and reports the numbers against §7.

---

## Model and effort routing

Output tokens cost 5× input, and cached input reads at 0.1×, so once the prompt prefix is
stable the *thinking* is the bill. Effort is therefore the main lever, and it is set by
what the role actually does — not by what we can get away with.

| role | model | effort | why |
|---|---|---|---|
| art critic | highest available perceptual/reasoning capability | full | the judgement everything else is downstream of |
| owner / diagnosis and repair | highest available reasoning/coding capability | full | silent shader/runtime defects require deep diagnosis |
| verification, budget checks, histograms | deterministic tools first; capable verifier | economical | one checkable right answer |
| collation, README tables, file moves | deterministic tools first | economical | mechanical |

**Owners stay at the top tier, and this is not caution — it is the measured shape of this
codebase.** Every defect that mattered here was *silent*: no exception, no log, plausible
config values. Telemetry read "intensity 3.41, castShadow true, 4 cascades active" while
0.00% of sunward flagstone had any warm bias at all. Finding those took reading a shader's
linked uniform list, ablating a light and re-measuring, and checking a tube's winding
order numerically. A partial list of what that turned up: inverted winding on every bamboo
culm, albedo multiplied by itself, a UV split that left metalness on raw box coordinates,
a conditionally-stable spring that only diverged below 30 fps, and a night LUT running at
89.6% strength in daylight.

The corollary matters as much: **the critic is reliable about symptoms and unreliable
about mechanisms** — 6/6 versus 0/4 across the rounds measured. Its guesses arrive labelled
`hypothesis` for exactly that reason. An owner disproves one before acting on it. Acting
on an unproven mechanism guess is how the god-ray pass got worse instead of better.

---

## Building a dispatch prompt

Prompt caching is a prefix match and one changed byte invalidates everything after it, so
every dispatch is assembled in this order and no other:

1. **`ARCHITECTURE.md`, in full.**
2. **`tools/AGENT-PREAMBLE.md`, verbatim** — the house rules every owner needs.
3. **Team block** — the team name and its file list.
4. **Variable tail, last** — round number, findings, anything dated.

Steps 1 and 2 are byte-identical across every agent and every round, which is the entire
point: that prefix is paid for once and read back at a tenth of the rate by everyone else.
Earlier rounds put the round number near the top and discarded the whole cache once per
round in exchange for nothing.

`AGENT-PREAMBLE.md` exists as a file rather than as instructions here so it cannot drift
between agents. Paste it; do not paraphrase it.

---

## When the round is done

Update `HANDOFF.md` (round number, verdict, the open list, anything this round disproved),
the measured tables in `README.md`, and the project-wide criteria/evidence pointers. Commit
those locally together with `shots/review-rN.json` — that one is deliberately not
gitignored — and report truthfully. Push, merge, deployment, and publication require a
separate explicit user instruction.

- the verdict and score, and the delta from last round
- which teams were spawned and which were gated out
- the measured numbers against §7 — draw calls, triangles, the histogram gates
- what is still open

Then select the highest-value ready task from the project frontier. A critic PASS closes the
visual-review branch only; project completion still requires every applicable product-level
gate. If the score did not move, say so and identify the evidence-backed blocker — three
rounds of polish on the wrong premise is the failure this loop exists to prevent.

Persist the exact continuation point after the round. Do not mark or archive the logical
session as ended unless the user explicitly says it is finished.

Expected cost for one round under this setup: roughly 2.5–3M tokens (about $9–12 at Opus 5
rates), against 6–7M for the same round run ungated.
