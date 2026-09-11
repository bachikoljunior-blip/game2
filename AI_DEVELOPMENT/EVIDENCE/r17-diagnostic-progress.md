# Round 17 diagnostic continuation

## 5cc1897: preparation failed before runtime

- Published apparatus checkpoint: `5cc1897d74576813e3601f4ee21cb6b1c1aacd62`.
- [Run 34653295642](https://github.com/bachikoljunior-blip/game2/actions/runs/34653295642),
  motion job `103440109008`, finished 2026-09-11 22:17 UTC, FAIL.
- Build/state/ownership/kit checks passed. Node suite: 17 pass / 1 fail.
- The one failure was `git show 4e6d23a:src/gameplay/Combat.js`: the shallow motion
  checkout did not contain the immutable comparison baseline. This was not a combat
  behavior failure. The evidence job already fetched that object; the new motion check
  step omitted its prerequisite.
- Rehearsal and actual rendering did not run. The unconditional diagnostic attempted to
  run without downloaded controls and correctly failed on missing
  `shots/interaction-ci-candidate.json`; that is a secondary setup failure, not a result.
- Diagnostic failure artifact `10284661814`, SHA-256
  `ac795e4324104b24dc1ccbc80e32713553e80b595563c2488d73793750622240`.
  It contains no rendered comparison evidence.

Correction: fetch the same immutable regression control in the motion job and allow
post-rehearsal diagnostics only if the rehearsal actually ran (success or failure).
The baseline remains an explicit historical test input, not the latest main authority.
The next run must still verify the exact carried 3633597 build and all original gates.

Local build fingerprint nuance, independently checked: `dist/` contained six stale
prior-generation chunks. Hashing only current reachable files reproduced the saved
`688eb51ffa158ec76dd2934faccf3716b32f3213724a1ae01ffaaa4f31efd400` exactly.
No mismatching build was accepted and no fingerprint comparison was relaxed.

Next: inspect the corrected run's preflight coverage and fixed-frame A/A/A-B PNGs.
Main/Pages is still `4e6d23a`; overall criteria remain unmet.
