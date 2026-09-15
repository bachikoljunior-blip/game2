# Same-host serial render measurement workflow — 2026-09-15

Author: c06_reference_material, existing formally accepted Ultra unit. No delegation, remote write, workflow execution or automation change. Isolated worktree `game2-render-profile-serial`, branch `codex/local-render-profile-serial-20260915`, base `9068522520b0f269cc937057b444f06c7c187978`.

## Measurement problem and target update

The earlier two-job matrix ran revisions on different hosts. Even the same acf source varied from about 1057 ms to 705 ms, so comparing a new 906 result near 1213 ms with an older e188 result near 1398 ms cannot establish a pure source improvement. Those figures are the integrator's motivating prior observations; this author did not rerun or independently remeasure them here.

The initial assignment proposed acf/e188/current in forward/reverse order. The integrator then explicitly updated the preceding candidate to **906**, because the next runtime changes fixed three-dimensional bamboo placement from that version. This workflow therefore compares that finite upcoming source difference directly. Old e188 measurements are preserved and untouched. This is a runtime-control selection, not a replacement of the fixed game-reference catalog.

## Frozen method

Only `.github/workflows/fresh-render-profile.yml` is changed operationally. No runtime or measurement-tool code is edited. Workflow SHA-256: `d88d8675b65030fa846a918fd69033a5642755e63d77e4cf82a93232a71fad66`. Existing `tools/fresh-render-profile.mjs` remains exact SHA-256 `1e915d1ed590327b0528efb39ed3cd815815ecfaada08900acc8428033da6651`.

The matrix is removed. One `ubuntu-latest` job installs Node 22, node_modules and Chromium once, then performs these six serial calls:

| Ordinal/output directory | Exact source |
| --- | --- |
| 01-acf | acf0f9ec86996245ad712d6adc72e5d6159f6711 |
| 02-906 | 9068522520b0f269cc937057b444f06c7c187978 |
| 03-current | The validated GITHUB_SHA event commit |
| 04-current | The same validated event commit |
| 05-906 | 9068522520b0f269cc937057b444f06c7c187978 |
| 06-acf | acf0f9ec86996245ad712d6adc72e5d6159f6711 |

Checkout is pinned to `github.sha`. The Python body validates its 40-character SHA and exact checked-out HEAD once and uses that resolved value for both current runs, without reading a moving branch head. Every ordinal gets a distinct detached immutable source worktree, its own invocation of the unchanged measurement tool and its own output directory. Every source links to the same installed node_modules. The tool itself owns and closes its fresh browser/server before the next invocation. Worktree cleanup only unlinks the owned node_modules symlink and performs ordinary `git worktree remove`; it never forces deletion of changed source.

All six invocations use **PROFILE_VARIANTS=full**, **960 × 720 / DPR 1**, and the tool's existing **13 frames: initial compile/readback plus 12 warmed frames**. Actual pixel/readback, source identity, source immutability, four-image readiness where applicable, GL diagnostics and owned browser/server cleanup gates remain in the unchanged tool. The wrapper also checks the successful report's source tree, apparatus/dependency identity, full frame sequence, pixel/error flags, cleanup and original PNG hash. Failed reports are preserved as failures, not normalized into successful observations.

The job limit remains **18 minutes including setup**. No build/tool timeout, retry or frame budget is changed. Multiple long timeouts or hard job cancellation can prevent all six calls from finishing within that existing cap; this workflow does not claim otherwise. Each completed ordinal is persisted and emitted immediately, before attempting the next, to retain earlier originals if a later call exhausts the job.

## Outputs, original bytes and failure behavior

Under `AI_DEVELOPMENT/EVIDENCE/fresh-render-profile/serial/`:

- `manifest.json`: exact run/attempt/job, source order/trees, tool/dependency/node versions, fixed viewport, OS/kernel/CPU model/logical count/runner architecture and image metadata. This uses an explicit non-secret field allowlist, not an environment or hostname dump.
- `01-acf/` through `06-acf/`: original tool `report.json` and `full.png` when actually produced, plus separate `ordinal.json` with status, tool exit code, errors, source identity, shared host-record digest, start load average, timing observations and original-file hashes. Missing report/PNG is recorded rather than fabricated.
- `summary.json`: all ordinal statuses and the three forward/reverse pair mappings **[1,6], [2,5], [3,4]**. Cold and warm measurements stay separate. Partial failures are retained; no cross-host historical improvement or averaged success claim is produced.

The original report and PNG files are never rewritten by the wrapper. For each ordinal, the existing `MEDIA_ARCHIVE_BEGIN` / `MEDIA_BYTES` / `MEDIA_ARCHIVE_END` envelope carries the exact report/PNG/sidecar bytes, ZIP checksum and per-file SHA-256. Versions are `render-profile-01-acf`, `render-profile-02-906`, `render-profile-03-current`, `render-profile-04-current`, `render-profile-05-906`, `render-profile-06-acf`; a seventh envelope contains only the manifest and summary. Each file retains the existing 12,000,000-byte cap. Reads are restricted to these explicit filenames/directories; symlinks and paths outside each selected directory are rejected. Upload-artifact uses the corresponding report/PNG/sidecar/manifest/summary paths.

A failed tool process, preparation, source/report validation or worktree cleanup is recorded and the next ordinal is attempted. The serial step preserves its failure outcome through `continue-on-error`, uploads the available evidence, then an `if: always()` final step requires the original serial outcome to be `success`. Any failed ordinal therefore leaves the job failed. Setup failure or an aborted serial step also fails the final check.

## This author's finite validation

- Parsed actual workflow YAML; verified one job/no strategy, 18-minute cap, one dependency/Chromium setup, pinned event checkout and final failure gate.
- Parsed all four shell run blocks with `bash -n`; compiled the exact YAML Python body. `workflow-body.py` is an evidence copy verified byte-equal to that extracted body, not a second operational helper.
- Executed that exact body with synthetic subprocess, report and PNG-byte fixtures. **No real browser, image, render timing or same-host measurement was produced.** All-success scenario attempted six calls in the required order and recovered all 12 synthetic report/PNG byte streams unchanged.
- Mixed-failure scenario included tool exit 17 / partial failed report, ordinal 4 worktree preparation failure and an invalid source-unchanged claim at ordinal 5. It attempted all six ordinals, reached the final acf call, preserved failures at 2/4/5 and exited 1.
- Unsafe/invalid-evidence scenario rejected an outside symlink without emitting its synthetic target, preserved malformed JSON bytes without treating them as valid, continued through ordinal 6 and exited 1.
- All three scenarios yielded six ordinal archives plus one summary archive; ZIP CRC, envelope SHA/size and every recovered original fixture's bytes were checked. Floating `current` instead of a full event SHA and a mismatched checkout were rejected before any measurement.
- `git diff --check` passed; `git diff --exit-code HEAD -- tools/fresh-render-profile.mjs fresh` confirms measurement/runtime bytes are unchanged.

Primary validation: `validation-results.json`; reproduction: `python AI_DEVELOPMENT/EVIDENCE/20260915-serial-render-profile/verify-workflow.py`. Actual Actions execution and interpretation belong to the integrator. Same-host forward/reverse order reduces host-assignment confounding but does not eliminate shared CPU load, cache or clock drift. These remain SwiftShader completion/readback measurements, not physical-device or pure GPU timing, nor visual/PS4 acceptance. Fixed comparison status and deadline 2026-09-20T07:51:53Z are unchanged.
