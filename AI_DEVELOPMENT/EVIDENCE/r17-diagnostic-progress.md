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

## ccdbda4: runtime reached; two gates remain failed

- Published apparatus checkpoint: `ccdbda4a5c76e83a3ebcdda72cf54dd39484a376`.
- [Run 34653461432](https://github.com/bachikoljunior-blip/game2/actions/runs/34653461432),
  motion job `103440640564`, finished 2026-09-11 22:22 UTC, FAIL.
- Build, project checks and all 18 focused tests passed. The identical carried 3633597
  game build was accepted; the evidence job was intentionally skipped for this apparatus
  retry, so no five-frame or 20-encounter sample was duplicated.
- Input rehearsal observed 60 enemy startup frames and 14 active frames, but zero
  enemy-attributable reaction events. The stationary single-ashigaru opening therefore
  failed. It is not motion or combat acceptance evidence.
- The fixed-frame diagnostic reached its first real pipeline render, then failed before
  writing any PNG with `frame has no rendered geometry`. Direct `pipeline.render(0)` does
  not update Engine-owned draw/triangle counters. This was an apparatus false failure,
  not proof that the scene rendered empty.
- Failure artifact `10284293101`, SHA-256
  `8730b28c9327892c92efdac119e2d42f93d4e00142573cabd1c8f43b17575a0b`.
  It contains `preflight.json` and `diagnostic.json`, but no diagnostic images.

The next apparatus delta renders the inspected frame once through Engine before freezing
it for A/A and A/B captures. The god-ray ablation switches the actual `_godRays` shader
define and restores the composite defines for later controls; setting strength to zero alone
could not exclude non-finite shader inputs. The motion fixture changes from one ashigaru to
one ronin while retaining the same 120 + 180 frame budget, real lock-on and aggressive-v2
DOM input. This selection is diagnostic, based on the existing 20-encounter trace having
ronin reactions by authored frames 39 and 45 while two single-ashigaru attempts had none.
It does not change the game or replace the required full rendered sample.

An independent static review rejected the first form of that delta: the diagnostic had
shallowly inherited the new ronin spawn instead of replaying the reported ashigaru frame,
and direct A/B renders could reuse the setup frame's nonzero Engine counters. Both paths
are now fail-closed. `diagnosticCombatPlan()` pins the historical ashigaru seed/radius and
has a focused regression test; every direct variant resets `renderer.info`, requires fresh
positive calls and triangles, and records those values separately as `variantRender`.
The review did not execute WebGL and therefore did not pass the runtime apparatus.
Its follow-up review found no remaining blocker or major after these corrections; seven
focused motion tests and `git diff --check` passed. Real WebGL shader recompilation,
variant images and A/A identity remain strictly pending CI execution.

Next: independently review this delta, publish it as an apparatus-only `[motion-retry]
[diagnose]` checkpoint, then inspect input coverage and native A/A/A-B PNGs. Only after a
stable control reproduces the black ribbon may an owner be assigned. Main/Pages remains
`4e6d23a`; no product or visual PASS is claimed.
