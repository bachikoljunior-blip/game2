# Fixed preamble — paste verbatim, first, in every dispatch

This file is the invariant head of every agent prompt in a review round. **Nothing in it
may vary between agents or between rounds.** No round number, no date, no team name, no
finding text. Those go in the tail, after this block.

That is not tidiness. Prompt caching is a prefix match, rendered `tools` → `system` →
`messages`, and one changed byte invalidates every cached token after it. Cached input
reads at a tenth of the normal rate, so a stable head is the difference between paying
full price for the contract in every agent and paying it once. Earlier rounds put the
round number near the top and threw the whole cache away once per round for nothing.

Build each dispatch as:

1. `ARCHITECTURE.md` in full — the binding contract.
2. This file.
3. The team name and its file list.
4. The variable tail: round number, findings, anything dated.

---

## You are one owner among several working in parallel

Other agents are editing other files in this repository right now. The contract in
`ARCHITECTURE.md` is what makes that safe; it is not advisory.

**Touch only the files you were given.** Never `git add -A` — stage the exact paths you
changed. A sweep once pulled three other owners' work into a commit whose message named
one system, and the history had to be untangled by hand.

One commit per owner. The message names the measurement that changed, not the intent:
"Cut foliage cards 11,390 → 4,200; phone triangles 1.15M → 870k" — not "improve foliage
performance".

## Read narrowly

`Grep` for the symptom first, then `Read` with `offset`/`limit` around the hit. Read a
file end to end only when you own it and have not seen it before. The habit of opening
whole files to change five lines is most of what a round costs.

## Prove a hypothesis before you build on it

The critic's findings separate `problem` from `hypothesis` deliberately. Across the rounds
measured on this project its symptom calls were right six times out of six and its
mechanism guesses wrong four times out of four. One of those guesses — "raise the god-ray
weight 4–6×" — was acted on unverified and made the frame worse.

So: test the mechanism before you change anything on its authority. **Report a disproof as
a result.** Ruling out a wrong cause in ten minutes is worth as much as a fix, because it
stops the next round rebuilding around it.

## Measure the claim

"It looks better" is not a result and will be sent back. Give the number that moved and
how it was obtained: a pixel measurement, a uniform readback, a triangle count, an
ablation. Almost every defect on this project was **silent** — no exception, no log,
plausible-looking config. Telemetry read "intensity 3.41, castShadow true, 4 cascades
active" for a key light contributing nothing measurable to the frame. Configuration that
looks right is not evidence.

## Nothing non-finite crosses a system boundary

ARCHITECTURE §5b, and it is here because `typeof NaN === 'number'` and `clamp()` passes
NaN straight through. A single NaN here produced four unrelated-looking symptoms at once,
including a frozen draw-call counter that made the whole build look healthy while it
rendered nothing.

Related: no conditionally-stable integrators (§5a). `Engine` clamps `dt` to 0.25 s, and an
explicit-Euler spring that is fine at 60 fps can diverge to NaN in twenty frames on a
phone slow enough to hit that clamp.

## The shared rig is serialised

`tools/capture.mjs` takes a file lock. A SwiftShader boot is two to five minutes and two
concurrent runs do not take twice as long — they starve each other; one was measured at
639 s under contention, past its own timeout. Do not launch a capture speculatively. If
you need one, say so and wait for it.
