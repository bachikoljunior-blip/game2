# Decisions

## D-001 — Resume from the newest implemented state

Accepted 2026-07-31. Continue from `6c4c093` on
`origin/claude/kagerou-round9-measurement-inj5qq`, not from default `main` at `eceba5a`.
The selected branch contains the Round 9 verdict plus six repair commits and is the newest
verified repository reality. The repairs themselves remain unverified until recaptured.

## D-002 — Preserve HANDOFF as the art-review authority

Accepted 2026-07-31. The older instruction that `HANDOFF.md` be the "single state file" is
reinterpreted narrowly: it remains the single detailed art-round record. The latest user
instruction requires project-wide session, plan, criteria, dependency, failure, and evidence
state, which now lives under `AI_DEVELOPMENT/` without duplicating detailed visual history.

## D-003 — Persistent remote release authorization

Re-accepted 2026-07-31 after the user's explicit follow-up. Across future sessions, verified
checkpoints are to be pushed, deliberately integrated into `main`, and published through
GitHub Pages without asking again. Inspect the resulting refs and public surface before
reporting success. This does not authorize paid actions, account or credential changes,
destructive external actions, or unrelated publication.

## D-004 — Session boundary is controlled only by the user

Accepted 2026-07-31. Older requirements to end every reply with a session handoff and to
treat one round as a stopped session are superseded. The current logical session stays active
until the user explicitly ends it. Durable state is still updated after each verified
iteration.

## D-005 — JSON-compatible YAML for executable validation

Accepted 2026-07-31. Files named `.yaml` use strict JSON syntax, which is valid YAML and can
be parsed deterministically by Node without adding a new dependency. This keeps the control
plane machine-checkable and avoids a dependency added only for project memory.

## D-006 — Verify Round 9 before new visual implementation

Accepted 2026-07-31. The branch already contains six substantial visual changes whose commit
messages contain predictions but no post-fix screenshots. A full verification capture has
greater value and lower risk than adding a seventh unmeasured change.

## D-007 — Reconcile tonal and sakura gates with the executable apparatus

Accepted 2026-07-31 after the first integrated capture. The prose tables incorrectly called
all five review poses white-gate eligible, while `tools/capture.mjs` has always limited that
gate to `hero` and `torii` within the five-shot set. The contract now matches the executable
gate; histograms for the other three poses remain evidence. The old wide sakura probe at
`(950,880 200x100)` sampled the approach/torii leg, not blossoms. It was replaced with the
previously back-projected canopy region `(950,460 200x110)`. This corrects invalid tests; it
does not change the requested visual result.

## D-008 — Block stale or geometry-contaminated image probes

Accepted 2026-07-31. Native inspection showed that the original hero sky boxes overlap the
foreground torii; they were replaced with clean sky boxes while retaining the same visual
thresholds. Round 9 commit `6c4c093` changed the valley position, target, and field of view,
so the six pre-existing fixed pixel boxes no longer sample their named semantic regions.
`R9-VALLEY-001` is now under review and the verifier reports it as blocked, preserving the
old values as history rather than presenting a stale check as a product failure. A semantic
replacement must be recorded before valley rendering is changed again.

## D-009 — Reject shadow erasure and global toe lifting

Accepted 2026-07-31 in Round 10. Wider/stock far-shadow filters removed the named dark band
instead of proving a better penumbra; a third cascade approached the triangle ceiling; and
toe 0.90 improved one dark box while failing its detail/value targets and breaking `wide`
black at p0.1=17. All were rejected and the shipped lighting/toe values restored. The edge
verifier now refuses the previous vacuous `no edge = pass` result.

## D-010 — Treat the lantern receiver as additive light, not embedded stone geometry

Accepted 2026-07-31 in Round 11. The old spill disc inherited the lantern's lean and footing
sink, faced downward, and used normal alpha blending over black diffuse. It was separated
into one horizontal surface-following instance per lantern, wound upward, and changed to a
depth-write-free additive material with a multi-ring zero-energy tail and deterministic
variation. The fixed hero near/far ratio moved from 1.121 to 2.394 and the stopped-frame A/B
shows a warm lower-frame-only contribution.

## D-011 — Replace the experimental aggregate A/B ratio with a tail-versus-core check

Accepted 2026-07-31 in Round 12. A whole-footprint on/off ratio of 1.8 rewarded concentrating
energy into a hard disc and penalized the requested fade to zero. The final A/B instead
requires both a strong core (delta >=32 over at least 1.5% of the frame) and a broad tail
(changed/strong coverage >=1.8), while retaining warm ordering, >=99% positive pixels and
mean delta >=20. It passes at 1.916% strong coverage and a 2.206 tail/core ratio. The
established product near/far >=2.2 requirement was not changed and passes at 2.394.

## D-012 — Restore the white gate locally at the authored paper source

Accepted 2026-07-31 in Round 12. Raising the global shoulder would move sky and other upper
midtones. Live paper probes instead bounded a local value: 2.9 reached hero p99.9=234, 3.3
reached exactly 235 (still fail), and 3.45 reached 236 while the visible core remained below
clipping. The coherent `r12v1` set confirmed hero p99.9=236, torii p99.9=251, and all five
black gates below 15 without changing global tone.

## D-013 — Publish the production artifact and gate the real browser, not HTTP 200

Accepted 2026-07-31. GitHub Pages serves the repository root, while the Vite production
artifact lives under `docs/`. The root therefore performs a module-free redirect to the
checked-in relative-path production build, generated by `npm run build:pages`. HTTP 200 was
rejected as insufficient after the first deployment referenced a missing development module;
a second variant was also rejected because the redirect aborted a speculative module request.
Publication is accepted only when an actual browser reaches `ready` and a running engine via
the hashed production bundle with zero page, console, request, or HTTP failures. This policy
preserves the overall visual FAIL rather than confusing deployment success with product
acceptance.

## D-014 — Activate exactly Rounds 13 and 14

Accepted 2026-08-01 from the user's latest explicit continuation instruction. The previous
three-round scope ended after Round 12 and correctly prevented an inferred Round 13. The new
instruction now explicitly authorizes exactly two additional rounds, so `NEXT` is superseded,
Round 13 is active, Round 14 is dependency-ready, and Round 15 must not begin. Verified work
is still pushed, integrated into `main`, and published under D-003.

## D-015 — Keep paper structure only inside the authored highlight margin

Accepted 2026-08-01 in Round 13. The first emissive kumiko lattice preserved the open-paper
peak but attenuated frame texels to 0.68 and reduced the coherent hero frame from p99.9 237
to exactly 235, failing the strict `>235` gate. The lattice floor was raised locally to 0.80;
a targeted hero probe and full coherent r13v2 both passed at 236. Global exposure, filmic
tone, and other materials were not moved to compensate.

## D-016 — Contain the sun aureole locally, not with global exposure

Accepted 2026-08-01 in Round 14. MEDIUM's radial god-ray pass reinjected enough emitter
energy to create a broad display-referred white veil, but removing the ray term alone was
predicted to miss the critic's `<15%` target. A sun-local high-luma shoulder leaves the
compact core, dark pixels, off-screen-sun poses, global exposure, bloom, and filmic controls
unchanged. The fresh final frame reduced the exact critic region from **38.112% to 11.330%**
over 90% luma; all five black gates and the hero/torii white gates still pass.

## D-018 — One bar per element, three reference titles, principles only

Accepted 2026-08-01 from the user's explicit instruction. The project previously had a single
global bar — *Ghost of Tsushima* / *SEKIRO* for "look and feel" — which covered the image and
said nothing about the other fifteen elements.
`AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` now assigns each element its own reference,
selection reason on five axes, generalisable principles, copy prohibitions, and criteria that
are measurable **on our own build**.

The set is deliberately three titles. *Ghost of Tsushima* and *SEKIRO* were already the stated
bar and cover thirteen elements between them; the design had in fact already committed to
SEKIRO's model, since posture and a perfect-parry flag are in the binding entity contract.
*Genshin Impact* was added for exactly two — the touch layer and the phone performance
envelope — because neither console title provides a single frame of evidence about a
touchscreen, and leaving the primary platform without a bar was the larger error. Two of the
three are also recorded as **anti**-references on their weakest property: SEKIRO's camera in
enclosed space, and Genshin's sustained thermal behaviour.

Two rules are binding and machine-checked. A criterion marked `verified` must name an
apparatus that exists and what it measured, so a future session cannot claim a comparison,
device measurement, or expert judgement that never happened. And a criterion may become
stricter freely but may be weakened only when proved unsatisfiable as stated, with the
disproof stored — never to let the current build pass. The precedent is R15-PFX-001, which
replaced a metric that scored synthetic shaft banding *below* the value it called smooth.

`選択と結果` was scoped down rather than dropped: narrative branching is out of the stated
concept, so the element covers in-combat risk/reward and player-triggered escalation only,
with a recorded trigger that reopens it if the user adds a branching narrative.

## D-017 — Close Round 14 on measured progress without claiming product acceptance

Accepted 2026-08-01. The final hostile score improved **44 to 50**, and the sun-glare major
finding disappeared, but the bamboo blocker remains and the foliage and terrain owner
predictions did not pass. The two requested rounds are complete because both full
capture-critique-repair-verification loops and their remaining findings are recorded, not
because the overall visual bar passed. Round 15 stays inactive pending a new user request.

## D-019 — Build the interaction-capture apparatus in the rig, not in the game

Accepted 2026-08-01 from the user's explicit instruction to do BENCH-APPARATUS.

Twelve of sixteen elements had never been verified because the project's entire apparatus
was five static screenshots. The obvious implementation — add checkpoint hooks to `src/` so
a driver can pose combat, step time and read state — was rejected. ARCHITECTURE.md §0 rule
5c already forbids shipping writable game state, and TD-003 records that the existing
`window.__kagerou` surface is itself an open liability; widening it to make the game
testable would have made the release problem worse to solve a review problem.

The whole page-side half therefore lives in `tools/harness/runtime.js` and is injected with
`page.addInitScript`. It reaches the game only through surfaces a player already has — DOM
pointer and keyboard events on the real canvas — and through state the game already
publishes. **Nothing in `src/` changed.**

Three decisions inside that are load-bearing:

- **The clock is virtualised, not the game.** Overriding `performance.now` and
  `requestAnimationFrame` from the harness makes the simulation advance by exactly 1/60 s
  per frame regardless of how long the frame took to draw. THREE.Clock reads
  `performance.now`, so Engine's `dt` follows without a patch, and Input.js's gesture
  classification — which times swipes and taps off the same clock — becomes scriptable in
  frames. Without this, every `dt` under SwiftShader slams into Engine's 0.25 s clamp and a
  130 ms parry window is unreachable by construction.
- **Scenarios are data, not closures.** The exact input timeline that produced a number is
  serialised into the trace, so a disputed measurement can be replayed or diffed, and there
  is no eval path into the page.
- **The rig records; a separate pure module judges.** `tools/interaction-metrics.mjs` is a
  function of a written trace, so a verdict can be re-derived without a browser, and
  `inconclusive` is a first-class result distinct from `fail`.

The rendering substitution that makes it affordable (a matrix-only stub in place of the post
pipeline, 8.73 s → 2.2 ms per frame) was treated as a hypothesis and measured: two runs of
an identical stimulus, one fully rendered, diverged by exactly 0. The self-check that proves
it runs before any verdict is believed, and is carried between runs only against an
identical build fingerprint.
