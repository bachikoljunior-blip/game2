# Failure and rejected-pattern record

Detailed visual hypotheses disproved in prior rounds remain authoritative in
`../HANDOFF.md`; do not duplicate or retry them from this file.

## F-001 — Default npm cache is not writable in this Work environment

- Observed: 2026-07-31.
- Command: `npm ci`.
- Failure: npm attempted to create `/root/.npm` and exited with `ENOENT`; partial concurrent
  extraction also produced misleading tarball-corruption warnings.
- Recovery: rerun once with `npm ci --cache /tmp/game2-npm-cache`; 28 packages installed and
  the subsequent production build passed.
- Reusable rule: use a task-specific writable cache in this environment. Do not diagnose the
  first warning stream as a lockfile or package-integrity defect without reproducing it using
  a writable cache.

## F-002 — Branch-local handoff state became invisible to new sessions

- Historical evidence: commit `53cccf1` and `CLAUDE.md`.
- Cause: important instructions and completed rounds stayed on non-default branches.
- Previous mitigation: push every round directly to `main`.
- Current mitigation: persistent user authorization is active. Push verified checkpoints,
  reconcile the branch deliberately into `main`, publish Pages, and inspect all resulting
  refs/surfaces rather than assuming the default branch is current.

## F-003 — Unmeasured mechanism guesses caused no-op or harmful visual fixes

- Historical evidence: `HANDOFF.md`, especially rounds 6–8.
- Rule: preserve the symptom, label the mechanism as a hypothesis, ablate or measure it,
  state a falsifiable prediction, and compare the same pixels before and after.

## F-004 — Prose gates and fixed image probes drifted from the captured surface

- Observed: 2026-07-31 during `r9v1` verification.
- The Round 8 tables said all five review shots passed a white percentile gate even though
  the executable apparatus applies it only to highlight-eligible poses (`hero`, `torii`,
  `combat`, and `closeup`).
- The Round 9 wide sakura box `(950,880 200x100)` sampled ground and a torii leg after the
  established camera framing, not the visible canopy.
- Recovery: match the prose contract to the executable gate; replace the invalid probe with
  the back-projected canopy box `(950,460 200x110)` and retain this correction in decisions.
- Reusable rule: every fixed-pixel visual probe must name the pose and visible subject and
  must be revalidated after a camera or composition change.

## F-005 — Geometry contamination and camera changes invalidated visual probes

- Observed: 2026-07-31 during source-independent inspection of `r9v1`.
- The two sky boxes included foreground torii pixels; the six valley boxes predated a full
  position/target/FOV change in `6c4c093`.
- Recovery: sky measurements now use inspected clean regions. Valley results are blocked,
  not failed or passed, until semantic regions are re-established.
- Reusable rule: image-coordinate tests are valid only for an immutable camera and must be
  checked for foreground contamination before their statistics are treated as evidence.

## F-006 — A missing expected edge could pass the shadow scan vacuously

- Observed: Round 10 wide-filter experiments returned 31 null edge rows, yet the old
  `longestRepeat` and `maxJump` defaults satisfied their limits.
- Recovery: require at least 24 detected rows before the old scan can pass.
- Result: the rejected shadow-erasure candidates remain failures instead of being promoted
  by absence of evidence.

## F-007 — Lantern receiver existed in runtime state but faced away from the player

- Observed: the generated disc reported one instance per lantern and plausible height, but
  its centre and rim normals were `Y=-1`; FrontSide culling discarded it from above.
- Secondary defect: normal alpha blending over black diffuse replaced the receiver with a
  dark card as emission faded toward its rim.
- Recovery: upward winding, separate horizontal surface placement, additive blending,
  disabled depth write, a multi-ring zero-energy tail, and stopped-frame A/B verification.
- Reusable rule: existence/count/transform telemetry does not prove visible integration;
  verify face orientation, blend semantics, and pixel contribution.

## F-008 — Experimental A/B threshold rewarded a hard edge

- Observed: the softened Round 12 pool passed the established 2.2 near/far criterion but
  failed a newly proposed 1.8 whole-footprint ratio because that population includes the
  intended fade to zero.
- Recovery: replace aggregate brightness with two pixel populations: a strong core and a
  broader low-energy tail. The retained R12 candidate measures 1.916% strong coverage and a
  2.206 changed/strong ratio; the rejected stamped candidate measures 1.801% and 1.374.
- Reusable rule: do not turn a proposed measurement into a product requirement without
  validating that it rewards the requested visual behavior.

## F-009 — A reused PID made a dead capture lock look live

- Observed: a stale capture lock named a PID that had since been reused by an unrelated
  `rsync` process, so a process-existence check refused to reclaim it.
- Recovery: on Linux, inspect `/proc/<pid>/cmdline` and retain a lock only when its owner is
  actually `capture.mjs`.
- Reusable rule: a PID alone is not durable process identity on a long-lived host.

## F-010 — Capture readiness raced the boot veil

- Observed: one targeted frame reached `__kagerouReady` while the 60 ms autostart callback
  was still queued, producing an invalid almost-black boot-overlay image from a live world.
- Recovery: call the idempotent public start hook explicitly and assert that the boot veil
  is hidden before dismissing title cards or capturing evidence.
- Reusable rule: runtime readiness and user-surface readiness are separate checkpoints.

## F-011 — Numeric contribution did not prove acceptable receiver shape

- Observed: the first additive lantern candidate materially brightened the ground and passed
  the near/far product metric, yet a source-blind reviewer rejected its repeated saturated
  orange discs and visible perimeters.
- Recovery: retain deterministic A/B for contribution, add a tail-versus-core shape gate,
  and require native source-blind review before promotion.
- Reusable rule: an ablation proves causality, not visual quality.

## F-012 — A Pages HTTP 200 did not mean the game was published

- Observed: after PR #1 merged, GitHub Pages served the repository's development
  `index.html` from `main`/root. The page returned HTTP 200, but its absolute
  `/src/main.js` request returned 404, so the game could not boot.
- Recovery: retain the Vite development entry but remove its static `src` attribute, so the
  GitHub root redirects without speculative module I/O while local development and `docs/`
  conditionally import the entry; make `npm run build:pages` regenerate the checked-in build.
- Reusable rule: verify the entry module and user-surface boot; an HTTP status alone is not
  publication evidence.

## F-013 — A bounded emissive detail still consumed the white-gate margin

- Observed: Round 13 coherent `r13v1`.
- The paper lattice kept its open-paper peak at 1.0, but a 0.68 frame floor removed enough
  high-luma pixels for hero p99.9 to fall from 237 to exactly 235.
- Recovery: raise only the lattice floor to 0.80, verify hero alone at 236, then repeat a
  full coherent set; r13v2 passed at 236 without moving global tone.
- Reusable rule: preserving a peak value does not preserve a percentile population. Measure
  the actual frame gate after any authored detail cuts into a major highlight source.

## F-014 — Two plausible Round 14 producer hypotheses failed native-frame predictions

- Observed: Round 14 `r14v1` and targeted `r14f2`.
- Removing far-card node collars reduced valley detached components only 486 to 433 and
  wide components 36 to 32, far below the predicted 75% reduction. Collars were a minor
  contributor, not the dominant skyline producer.
- Tightening the remaining spray-leaf angle then changed valley components 433 to 445 and
  wide 32 to 33. The candidate was rejected and reverted rather than being hidden behind a
  favorable source-level explanation.
- Terrain distance gating preserved near detail but reduced whole-box far Laplacian energy
  only 11%, not the predicted half, and did not create measurable broad-zone separation.
- Reusable rule: source arithmetic is a hypothesis until the final composite confirms it;
  retain bounded partial gains only when they do not regress established gates, and revert
  follow-up candidates that fail their own saved-image prediction.
