# Running one review round

This file is the whole brief. A fresh session should be able to open it, run one round of
the art-direction loop, and stop — without reading back through any previous conversation.

**Run exactly one round. Then stop and report.** Not "until it passes", not "one more
while I'm here". The loop is deliberately re-entered by a human between rounds, because
the expensive failure mode of this project was never a bad round — it was three rounds
built on a premise nobody re-checked.

---

## What this build is

KAGEROU 陽炎 — a mobile-first samurai action game in Three.js, zero external assets:
every texture, mesh, animation and sound is synthesised at boot. `ARCHITECTURE.md` is the
binding contract that lets independent agents work on it in parallel; read §5 (art
direction), §7 (perf budget) and §8 (file ownership) before dispatching anything.

> **Last completed round: 5.** The next one is round 6 — use `--tag=r6`,
> `shots/review-r6.json`, `--round=6`. Round 5's work is on branch `claude/round-q78i6x`
> (11 commits, pushed); start from there or from wherever it has since been merged.

An independent critic has scored it 34 → 48 → 58 → (round 4 unfiled) → 58 out of 100
against a *Ghost of Tsushima* / *SEKIRO* bar. It has not passed. Round 5 filed FAIL with
three blockers, repaired all three and verified them.

Currently open, measured at the end of round 5:

| | measured | contract |
|---|---|---|
| phone draw calls | 117 | ≤ 140 ✓ |
| phone triangles | 628,216 | ≤ 900,000 ✓ |
| `wide` highlight gate | p99.9 = 206 phone, 211 desktop | > 235 |
| `desktop-sun` black gate | p0.1 = 18 | < 15 |
| §4 light levels | sun 7.39, hemi 1.038 | ~3.0, ~0.35 — needs an authoring decision |
| phone shadow reach | 70 m (`Quality.js` MEDIUM) | the valley framing needs 130–160 m |

The last four are round-6 work and the README's "Known open" section carries the reasoning.
Two of them are *consequences* of round 5's fixes rather than defects in them, which is the
normal shape of this loop: the highlight gate moved away from passing because the fix
correctly removed an over-bright massif that had been supplying the frame's only highlights.

---

## The round, in five steps

```bash
npm ci                                            # first session only
npm run build
node tools/capture.mjs --review --diff --tag=rN   # 1. photograph
node tools/contact-sheet.mjs --tag=rN             # 2. tile for the critic
#                                                   3. critic → shots/review-rN.json
node tools/dispatch.mjs --round=N                 # 4. who to spawn
#                                                   5. spawn exactly those, then verify
```

Substitute the real round number for `N` everywhere.

**The last completed round is recorded at the top of this file — the next one is that plus
one.** Do not derive it from `shots/`: that directory is gitignored, so in a fresh clone it
is empty and the highest `review-r*.json` is none at all. Round 6 would be filed as round 1
over the top of nothing, and `dispatch.mjs --round=1` would then read a review that does not
exist. Bump the number in this file's header as part of closing the round, in the same commit
that records the measurements.

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

**The measurement apparatus has broken four times on this project, and every time it drove
a correct critique into a wrong fix.** Checking it costs a minute. Skipping it costs a
round, which is about 2M tokens.

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
| art critic | opus | high | the judgement everything else is downstream of |
| owner / fix agent | opus | high | see below |
| verification, budget checks, histograms | haiku | low | one right answer, independently checkable |
| collation, README tables, file moves | haiku | low | mechanical |

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

Commit on whatever branch the session was given, push it, bump the round number in this
file's header, and report:

- the verdict and score, and the delta from last round
- which teams were spawned and which were gated out
- the measured numbers against §7 — draw calls, triangles, the histogram gates
- what is still open

Then **stop**. The next round is a human's call.

Expected cost for one round under this setup: roughly 2.5–3M tokens (about $9–12 at Opus 5
rates), against 6–7M for the same round run ungated.
