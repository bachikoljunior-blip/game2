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
