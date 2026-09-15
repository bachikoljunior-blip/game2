# Independent actor recheck and six-finding status

Reviewed exact checkout: `1e3bfa6e67040420c25ec2e59dd3a2e3e5f4917f`.
Reviewer: `/root/game2_ultra_seven_fixes/independent_runtime_review`.
Scope: independently repeat the two original actor repros, inspect their corrective delta for a clear major defect, and reconcile the six existing findings. No new broad diagnostic search and no production source edits were performed.

## Actor results

**P1 delayed first attack observation: original repro resolved.** Repeated the exact synthetic nonrendering fixture from the first review: player z=2.7, sentinel z=1, render idle, advance the actual simulation by .25 seconds with attack input, then update the rig by .25 seconds. Simulation attack age remains `.2333333333333333`, the sentinel takes the unchanged damage to HP66, and the pose reports active. The actual sword position is now `[-0.03149176486454591,1.2768065881083632,-0.47]` and Euler rotation `[-1.4519228240530015,0.022872941216136478,0.28979011783745506]`; both exactly match the authored pose at that simulation age. The old repro retained the idle position `[.225,1.045,-.285]`. The blade tip now reaches z=0.85268 while the player is at z=2.37. Entry transition time accounts for the already elapsed simulation state age.

**P2 sloped geometry penetration: original repro resolved.** Repeated the same full generated-mesh vertex scan at sun-ring `(26,-20)`, eight yaws, and idle/guard/attack/dead poses. The original 0.130m/0.179m/0.228m/0.328m penetrations no longer occur. Idle, guard and attack have no measured penetration; the largest final-death value is floating-point noise (`7.99e-15m`). This uses the actual shared triangular terrain and actual mesh matrices, with no test-only ground substitution.

**Related regression checks: 4/4 pass.** Independently reran the low-frame 150-250ms pose test, 1680 actual-terrain poses (6 discovery locations x 8 facings x 35 phases), sloped run/stop contact checks, and transition drift/shared-pose immutability checks. The wider static terrain scan's worst penetration is `0.0004444457185170947m` (0.444mm), at sun-ring. All checks pass their existing limits. These calculations do not establish render rate, natural-looking movement, lack of visible floating, or physical-phone performance.

## Existing finding ledger

| Finding | Original severity | Nonrendering status | Independent recheck |
| --- | --- | --- | --- |
| Optional exploration retains mainline fixed camera | P1 | Resolved | e1cdc5b; previous runtime logic retained at 1e3bfa6 |
| First rendered attack can remain idle during the active interval | P1 | Resolved | 1e3bfa6 |
| Feet/fallen equipment penetrate expanded sloped terrain | P2 | Resolved | 1e3bfa6 |
| Cancelled entrance permanently reserves a loop direction | P2 | Resolved | e1cdc5b; later exploration collision delta preserves direction fix |
| Expanded discoveries fall outside sunlight shadow region | P2 | Resolved | f1a0b37; unchanged by actor-only delta |
| New solid discovery props can be walked through | P2 | Resolved | f1a0b37; unchanged by actor-only delta |

The diff from f1a0b37 to this revision is limited to four actor files. No additional clear blocker or major defect was found in this bounded corrective review. All six original findings are closed only in the stated implementation-diagnostic scope.

## Remaining evidence boundary

The first native-motion CI media being collected belongs to the earlier bd4 candidate, before these fixes. It can support only a labelled historical diagnostic. Final visual acceptance requires native screenshots, the full motion set and ordinary-input footage from the corrected exact revision. Such footage has not been received or visually reviewed in this stage. No sound has been listened to, no reference work has been compared, and no formal element has been marked satisfied. The ten formal quality elements remain not measured.
