# KAGEROU 陽炎 — standing instructions

Read this before doing anything else in this repository. It is the brief that governs every
session, not just the one that created it.

## Resuming

**Read `STATE.md` first.** It holds the round number, the last verdict, what is still open,
and a list of hypotheses already disproved so nobody investigates them twice. If someone
says only "continue" — or nothing at all beyond opening this repo — `STATE.md` is where the
next action comes from.

This loop is expected to outlive any single session. Containers get reclaimed, context runs
out, people switch devices mid-round. So the rule is: **finish a round, update `STATE.md`,
commit, push.** Work that exists only in a conversation does not survive the boundary, and
three rounds of critic verdicts were already lost that way before the JSON was committed.
Never leave a round's outcome unrecorded because the session felt like it was continuing.

## The goal, unchanged

Build a game at the level of a shipped AAA console title. The reference bar is
*Ghost of Tsushima* and *SEKIRO* — a Japanese sword-action game, third person, mobile-first
with desktop support, in Three.js, with **zero external assets**: every texture, mesh,
animation and sound is synthesised at boot.

The method is not incidental to that goal; it *is* the goal's mechanism:

- **Fan out.** Independent agents own separate systems and work in parallel against a
  binding contract (`ARCHITECTURE.md`). One agent cannot hold this much surface area.
- **Loop.** Build, photograph, critique, fix, re-photograph. Keep looping. The build is not
  finished when it works — it is finished when it survives the critic.
- **A separate, harsh critic judges the pixels.** Not the agent that wrote the code. The
  brief is `tools/CRITIC.md`; its default verdict is FAIL and it is not impressed by effort.
- **Blind side-by-side.** The critic's core question is: *if our frame and the reference
  frame were shown side by side with no labels, which would a stranger say looks better, and
  why?* If ours loses, it fails. That comparison is the whole bar.
- **Keep going until it is genuinely good**, not until it stops erroring.

Do not quietly lower this. If something cannot be done, say so plainly and say why — do not
narrow the target and report success.

## Measure. Do not assert.

This is the hardest-won rule in the repository, and it exists because **almost every defect
here was silent**: no exception, no log, plausible-looking configuration.

Telemetry once read `intensity 3.41, castShadow true, 4 cascades active` while a pixel
measurement showed 0.00% of sunward flagstone carried any warm bias at all. The key light
was contributing nothing. A partial list of what looked fine and was not: inverted winding
on every bamboo culm and tree trunk, albedo multiplied by itself, a UV split that left
metalness on raw box coordinates, a night LUT running at 89.6% strength in daylight, and
11,390 bamboo cards submitted every frame that rasterised zero pixels for three review
rounds because their shader linked dead.

So:

- "It looks better" is not a result. Give the number that moved and how you obtained it.
- Configuration that looks correct is not evidence. Read the linked uniforms, ablate the
  light, check the winding numerically.
- **Check the measurement apparatus before you trust it.** It has broken four times on this
  project — five rounds reviewed at the wrong quality tier, a histogram measuring a cleared
  canvas, a frozen draw-call counter from a frame that died before it rendered, a review set
  mixed across two builds. Every one of those turned a correct critique into a wrong fix.

## The critic is right about symptoms and wrong about mechanisms

Measured across the rounds so far: symptom calls correct 6 times out of 6, mechanism guesses
wrong 4 times out of 4. Its findings therefore separate `problem` from a labelled
`hypothesis`. **Disprove a hypothesis before acting on it**, and report the disproof — ruling
out a wrong cause is worth as much as a fix, because it stops the next round building on it.
Acting on an unverified guess is how the god-ray pass got worse instead of better.

## How to run a round

`ROUND.md` is the operational brief and it is self-contained — a fresh session can follow it
without reading any prior conversation. The `/round` skill runs one round.

**One round is the unit of work, not the end of the job.** After each round: update
`STATE.md`, commit, push, and report the verdict, the score delta, which teams were
dispatched, which were gated out, and the measured numbers against ARCHITECTURE §7. Then
continue to the next round — unless the build meets the definition of done in `STATE.md`,
or a human has said stop.

`STATE.md` is updated *before* the report, not after. A session that reports and then dies
has lost the round; a session that records and then dies has not.

## Spend tokens on judgement, not on repetition

The cost discipline below is about removing waste that was *measured* to contribute nothing.
It is not permission to think less about hard problems.

- **Gate the repair fan-out.** `node tools/dispatch.mjs --round=N` spawns only the teams the
  critic actually named. Round 3 spawned all fourteen owners against six findings; eight read
  their files, found nothing, and returned — about 1.6M tokens for no change to the frame.
  The width that makes this method work is in the *reviewing*, and that stays untouched.
- **The critic stays at the top tier and full effort.** So do diagnosis and repair. What
  drops to a cheap model and low effort is only work with one checkable right answer:
  histograms, budget counts, README tables, file moves.
- **Assemble prompts cache-first**: `ARCHITECTURE.md`, then `tools/AGENT-PREAMBLE.md`
  verbatim, then the team's file list, then the variable tail (round number, findings) last.
  Caching is a prefix match; one changed byte upstream discards everything after it.
- **Capture differentially.** `--diff` carries a shot forward when nothing it depends on
  changed. Use it for the verification pass after fixes land.
- **Read narrowly.** Grep for the symptom, then read around the hit. Read a file whole only
  when you own it and have not seen it.
- **Write findings to disk, not through the coordinator.** Relaying them in replies pays for
  the same text three times.

## Working in parallel

`ARCHITECTURE.md` §8 assigns every file to exactly one team. Honour it: one agent per team,
never two agents on one file. Stage the exact paths you changed — never `git add -A`, which
once swept three other owners' work into a commit whose message named one system.

`src/world/Constants.js` holds the authoritative world constants, `WeatherSystem` owns the
single wind field, and nothing may re-implement either. Duplicated logic drifting from its
source of truth caused three separate defects here, and all three were correct when written.

## Where the build stands

`README.md` carries the measured state — what is verified, what is over budget, what is open.
Update it when the numbers move; it is the only place a new session can learn the truth
without re-measuring everything.
