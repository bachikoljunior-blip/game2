# 2026-09-15 — final recovery-dodge observation

Performing agent: `/root/game2_ultra_art_sound_physics/sound_revision`.
I accepted a new finite CI-apparatus repair from
`/root/game2_ultra_art_sound_physics`, using my existing formally accepted Ultra
assignment. I did not redelegate or create another spawn receipt. This is my
own implementation/test record, not the parent's integration acceptance.

Repository: `bachikoljunior-blip/game2`, branch
`codex/game2-rebuild-20260913`. The continuing task's original canonical base is
`b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`; the shared checkout at this specific
repair's first inspection was `33054398ddbcaf444f085778d451f7c2cb7db180`.
All edits are limited to the two recovery-dodge smoke helpers, one new
browser-independent helper/test pair, and this record. Runtime, input,
simulation, audio, art, source publication, stage, commit and remote state were
not changed by this subtask.

## Evidence and cause

The integrator supplied its authorized CI/job log observation:
candidate `037fd9d`, run `34969080023`, job `104380609652`, failed matrix touch-left
with `Recovery dodge was not observed before its 3000ms input deadline`.
Its failure-state capture nevertheless contained a player dodge at simulation
time `31.11666666666618`, totals.dodges 3, and a player displacement from roughly
z −5.302 to −2.051. These facts are attributed to the integrator's retrieved
log; I did not retrieve or independently timestamp that CI action.

Both smoke helpers had this order: read counter, possibly tap, test deadline,
then throw. If the final tap crossed the wall-clock deadline, the loop never
read its result. A separate issue in that same ordering allowed a slow diagnostic
read to return after the deadline and still start a new tap. Source inspection
and a controlled timing regression reproduce the first omission and verify the
second boundary. The historical failure state establishes that a dodge eventually
occurred; it does not independently establish when the game accepted it relative
to 3000 ms. The absence of those earlier timestamps is retained as a limitation.

I proposed the exact ordering repair to the integrator before editing, and the
integrator approved that bounded design.

## Repair

`fresh/input-observation.mjs` coordinates only supplied `read`, `tap` and `now`
callbacks. It does not depend on a browser or mutate game state itself.

1. Read the actual diagnostic counter.
2. Return if it increased; otherwise retain the existing mission-ended failure.
3. Check that the next input would **start before** the same 3000 ms deadline.
4. Send the ordinary existing touch pulse.
5. Read again before checking expiry, including **one final read after an
   already-started pulse crosses the deadline**.

If that final read has no acknowledgement, fail immediately. There is no
additional polling window, wait extension, or new pulse after the deadline.
The original helper-entry timestamp is passed through the local dynamic import,
so module setup is included in the existing input window. Dynamic import keeps
changes inside the specifically authorized smoke-helper bodies.

Both smoke paths now use this shared helper:

- `fresh/browser-smoke.mjs` records under
  `report.touchMission.recoveryDodgeAcknowledgements`.
- `fresh/route-matrix-smoke.mjs` records under the touch-left mission's
  `recoveryDodgeAcknowledgements`.

Each record includes the original counter, start/deadline host timestamps,
every pulse's start/finish and elapsed time, each diagnostic read's request/
receipt timestamp, and the observed counter/mode. Successful observations are
explicitly classified as `observed-within-input-window` or
`observed-after-input-deadline` according to host receipt time. Browser snapshot
wall time, current simulation time, and the latest still-visible player dodge
event's simulation time are saved separately. A pruned event is recorded as null.

**This does not claim game acceptance within 3000 ms.** Host receipt includes
command round trips and deliberately awaited touch duration; browser snapshot
time is an observation, and simulation event time is not wall-clock latency.
Delayed acknowledgement remains visibly delayed in the report. The 3000 ms
new-input limit, unchanged physical touch pulse, and every whole-mission
success/deadline assertion remain in place.

## Verification

`node --test fresh/input-observation.test.mjs
fresh/touch-playthrough-policy.test.mjs` passed **14 / 14** tests.
The five new deterministic apparatus tests verify:

- A synthetic final tap starts at 2990 ms, finishes at 3150 ms and increments
  the counter. The old loop fails to see it. The new helper reads once at
  3154 ms, succeeds, and reports `observed-after-input-deadline` with one pulse
  and two reads. Those are injected-clock fixture values, not real CI latency.
- An unsuccessful crossing pulse gets exactly one final read, then fails.
- A diagnostic read returning at 3000 or 3001 ms starts no new pulse.
- An already-observed acknowledgement returns without a duplicate pulse and
  retains its within-window timestamp.
- Helper setup consumes the same deadline, and a terminal mission with no new
  dodge still fails.

The existing nine touch-policy tests also pass. Both smoke files pass
`node --check`, and `git diff --check` passes. This subtask did not run a new
browser/CI mission; the integrator owns the next exact-source verification.
The historical failure is preserved until that run establishes the complete
touch-left result. No gameplay success criterion was relaxed to obtain these
unit-test results.

Actual test output:
`/workspace/scratch/27301e95ee53/input-observation-20260915/regression.tap`.
Code froze at the completed test/source check on `2026-09-15T12:51:37Z`;
only this evidence record was completed afterwards.

| File | Before SHA-256 | Frozen SHA-256 |
|---|---|---|
| `fresh/browser-smoke.mjs` | `95bb866ef2a5e2875d74055ea6501b4a60b1168435097e7da08cd92765b8ae33` | `abbef0903b5ce3f4b7dc6a68d514eba36b8dc9756a105415cb277869036dc56a` |
| `fresh/route-matrix-smoke.mjs` | `53823cc8768a69d7d1819fb28f53a9f188fec91a708872d41d88cc9a03812f91` | `a9ff6dd8f63c2c870ccc86acb2872bf6fe2ba6320cfc5ee40417423669488c69` |
| `fresh/input-observation.mjs` | New file | `e7455432f66621d0c78d1b45cc3927895f9b67d9fbb0bb1af593fe79f3376a8d` |
| `fresh/input-observation.test.mjs` | New file | `9bfff0b910d86346a0735be94afb81a64c700ec44a8df318a93be3d25ff43a42` |

The old untracked `AI_DEVELOPMENT/EVIDENCE/fresh-20260913/` tree was not written
or staged. All 10 formal concept comparisons remain **not measured** and the
deadline remains **2026-09-20T07:51:53Z**.
