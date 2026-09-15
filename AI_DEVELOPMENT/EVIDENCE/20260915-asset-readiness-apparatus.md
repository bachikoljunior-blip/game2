# Character asset readiness browser apparatus — 2026-09-15

## Ownership and scope

- Author / actual implementer: `/root/game2_ultra_art_sound_physics/sound_revision`.
- This is a new finite assignment continued under this agent's existing formally accepted Ultra assignment. No subdelegation occurred. This records my own implementation and checks, not the parent's acceptance or remote integration.
- Parent supplied canonical source baseline `3bcc5df515eb394c484e6eaf9caf0efcd50e78c5` and owns integration. I read the existing canonical instructions and smoke/preview setup and the character author's readiness implementation/API. Only `fresh/assets-browser-smoke.mjs` and this new evidence file were written for this assignment.
- Runtime, input, simulation, art, sound, package, workflow, remote branches, publication, and automation were not edited by this assignment. The old untracked `fresh-20260913` evidence was not touched.
- Record time: 2026-09-15 13:37 UTC. This is technical verification apparatus, not a formal comparison. All 10 whole-element formal judgments remain `not measured`; deadline remains `2026-09-20T07:51:53Z`.

## Implemented contract

`fresh/assets-browser-smoke.mjs` SHA-256:

`34d122a1f06ac5dfd98a7bf537ba9674f2cd08710e28b002347475436e0ef4aa`

The script starts its own Vite **production preview** at `127.0.0.1:4178` after a separate production build. Each case launches a fresh Chromium process/context with the existing `--no-sandbox`, ANGLE / SwiftShader, and unsafe SwiftShader flags. Browser service workers are blocked. The two cases do not share browser caches or world state.

1. **Held real PNG → ready → start.** Intercept only the skin PNG (`young-asian-male`, source name or Vite-hashed basename), keep it pending while the other three PNGs complete, and observe `loading`, counts `pending=1 / ready=3 / failed=0`, disabled start, stopped simulation, and zero render calls. A real mouse click on the disabled button plus a 350 ms hold must leave the gate and world time unchanged. Continue the original network request without substituted bytes. Require `ready`, all four textures ready, no pending/failed textures, enabled start, and a real first render. Click start and require world time to advance and four actual native-character rigs to render.
2. **One real PNG abort → visible failure.** In another Chromium process, abort exactly one matching skin request with `route.abort('failed')`. Require `failed`, counts `pending=0 / ready=3 / failed=1`, preserved error diagnostics, visible Japanese failure copy, disabled start, stopped world, and zero render calls. Another real disabled-button click plus 500 ms settling must preserve the failure gate. No partial-image submission to WebGL is accepted.

Required PNGs are `young-asian-male.png`, `brown-eye.png`, `short-hair.png`, and `eyebrows.png`. The eyebrow addition is included; imported geometry is separately counted as one asset. Browser `geometry-only` state is never accepted.

The successful case records each actual PNG response's URL, status, content type, byte count, SHA-256, signature, and IHDR dimensions. It also observes actual `HTMLImageElement` sources passed by Three to WebGL `texImage2D` / `texSubImage2D`, requiring all four complete images with positive natural dimensions and exact response/dimension correspondence. This prevents four missing maps or generic placeholder rendering from satisfying readiness merely through counters. The WebGL observer delegates the original calls and preserves their arguments, receiver, return values, and thrown exceptions; it does not synthesize pixels, call image `decode()`, consume GL errors, or resolve runtime promises.

These WebGL APIs return void and can reject a call without throwing. `textureApiSubmissions` therefore means **decoded images supplied to the original WebGL API**, not successful GPU transfer. Neither these records nor the absence of browser diagnostics proves that every GPU error is absent. The JSON report states the same scope explicitly.

The single injected `net::ERR_FAILED` request is kept as an expected event. A console error is expected only when both the exact aborted URL and exact `Failed to load resource: net::ERR_FAILED` text match. All other console errors, failed requests, page errors, route errors, and unhandled rejections fail the case. The rejection observer does **not** call `preventDefault`. Unexpected retries of the selected PNG also fail.

All console warnings are retained separately. Concrete GL errors in either warnings or errors fail the case: `INVALID_OPERATION`, `INVALID_ENUM`, `INVALID_VALUE`, `INVALID_FRAMEBUFFER_OPERATION`, `OUT_OF_MEMORY`, context-loss enums, and explicit WebGL/OpenGL error or context-loss diagnostics. Benign performance warnings remain visible in the report. No GL error state is drained or consumed.

Each stage has an apparatus timeout of 60 seconds; the intentional hold is 350 ms and settling interval is 500 ms. These are this separate probe's observation limits, not changes to any start, input, route, recovery, or mission deadline. Each report includes observations and limits; it does not make an exact decode/acceptance wall-time guarantee.

## Outputs and CI invocation

Default output: `AI_DEVELOPMENT/EVIDENCE/fresh-asset-readiness/`.

- `report.json`: checked-out source revision, claimed CI revision, apparatus and built-index hashes, browser version, PNG provenance, observations, expected failures, unexpected errors, and case results.
- `normal.png`: actual successful scene after real start (or diagnostic frame if this case fails).
- `failed.png`: actual visible failure state (or diagnostic frame if this case fails).

`FRESH_ASSET_EVIDENCE` overrides the output directory; relative values resolve against the repository root. Launch failures can leave a report without screenshots; the script never invents missing media. Report case results distinguish diagnostic screenshots from passing observations.

Required steps, already matched by the parent's independently edited workflow:

```sh
npm ci
npx playwright install --with-deps chromium
node node_modules/vite/bin/vite.js build --config fresh/vite.config.mjs
node fresh/assets-browser-smoke.mjs
```

No external preview command is needed. Preserve the dedicated output even on failure. The parent has added the separate 8-minute `asset-readiness` job and the emitter group for `report.json`, `normal.png`, and `failed.png`; I only read that integration.

Shutdown calls Vite's `await server.close()` to include its lifecycle cleanup, rather than closing only the HTTP listener. Cleanup rejection makes the report fail.

## Checks actually performed

- `node --check fresh/assets-browser-smoke.mjs`: passed.
- `git diff --check`: passed for the current tracked diff; the new source was separately parsed by Node.
- Node VM exercise of the **extracted actual observer and URL classifier**: 20 assertions passed. It checked original-call receiver/argument/return preservation; original exception propagation; only expected PNG observation; no duplicate upload records; non-suppressed rejection defaults; both WebGL method wrappers; and eight source/hashed/non-PNG/query URL cases. These are synthetic unit checks of test instrumentation, not browser execution or game behavior.
- Local installed Three source confirms `ImageLoader` assigns real image URLs and the WebGL texture upload path passes decoded images. Each supplied PNG exceeds Vite's default inline threshold, so this candidate uses observable requests rather than data URLs.
- The configured Playwright Chromium executable does **not** exist locally. Actual browser execution, delayed/failed runtime behavior, PNG decode/upload, screenshots, and CI pass are **not measured by this author at this checkpoint**. The parent will run the exact-source CI job and inspect its real report/media.

The apparatus source is frozen at the hash above for that CI run. Technical success, when measured, will establish these asset gates and event handling only; it will not establish PS4 visual quality or a whole-element comparison result.

## Independent apparatus review correction

Reviewer `/root/game2_ultra_art_sound_physics/c06_reference_material` identified the void WebGL API observation limit and Vite cleanup omission in the previous `824c0c81…` candidate. The parent assigned these two finite corrections back to this author. I changed only this script and record, retained every previous error condition, captured all warnings, added concrete GL diagnostic failure classification, renamed the observation to `textureApiSubmissions`, limited its claim, and used Vite's full close method. This is an apparatus review, not a source-blind concept comparison.

After correction, `node --check` and `git diff --check` passed. The extracted actual observer/URL/GL classifiers passed **32 Node VM assertions**: the previous 20 instrument checks reran with the renamed record, plus 12 GL diagnostic cases (nine failures, three retained non-error examples). Installed Vite's `PreviewServer.close(): Promise<void>` API was checked locally. No actual browser/media execution occurred in this correction. The final script SHA is the updated full hash above.

## Actual CI capture failure and bounded repair — 14:11 UTC

Parent assigned this finite repair to the same author, with only this script and evidence editable. Canonical checked-out source is `e18820165d6008fedfca28d2cc7073a9c4b74b28`. No runtime or workflow changes were made by this author.

### Readback facts

I read the parent's recovered actual report at `.review/34978382509/asset-readiness/report.json`, SHA-256 `c272a6e5c48eb0cb4b52f9e8a49be77c5ff6b3e1453a3f9e1bae6f7cc711de84`. It identifies CI `34978382509`, source/claimed source `e18820165d6008fedfca28d2cc7073a9c4b74b28`, and prior apparatus `f09729c3dad03e347a6207a96da9f85365b51a2e9422d9e6226654a9792145e5`. Parent identified failed job `104411931128`.

- **Normal case failed.** The first screenshot timed out after 15,000 ms. Its call log reached `fonts loaded`; font waiting is not established as the cause. The immediate diagnostic screenshot also timed out after 15,000 ms. No successful normal screenshot is established by this report.
- Earlier normal observations recorded one held PNG, counts `1/3/0`, zero rendering, and unchanged world time. At browser time 3,857.6 ms readiness was `ready`, counts `0/4/0`, render frame 2. At 7,557.9 ms the game was running, world time 0.6167 seconds, frame 15. Four real PNG response records had HTTP 200, signatures/hashes, and corresponding complete image API submissions. The **old post-screenshot response-validation assertions were never reached** on this failed normal case; the records and earlier passed assertions must be distinguished.
- The failure snapshot at browser time 22,573.1 ms recorded world time 2.55 seconds and frame 23, with 389 render calls and 523,520 triangles. Only eight additional renderer frames appeared between these snapshots over 15,015.2 ms. This is a concrete load/capture interaction concern. It does not isolate GPU time, attribute the slowdown to one cause, or establish physical-device performance.
- **Injected-failure case passed** in its separate Chromium process. One selected request failed; the other three PNGs completed. Readiness remained failed, world time and render count stayed zero, and failure UI was captured. Both cases recorded no unhandled rejections, console warnings, or reported GL error diagnostics; this does not prove absence of unreported GPU errors.

The original failed report and recovered media were not changed.

### Repair and preserved limits

1. Move actual PNG response validation and submission/response dimension correspondence **before** capture. Persist a scoped `readinessAssertions` result while leaving screenshot and final error results pending. A screenshot timeout can no longer prevent these assertions from executing or blur what was checked.
2. Before the normal screenshot, require two additional renderer frames while the world is running and assets remain ready, bounded by 15,000 ms. This observes CPU render submissions after initial readiness; it is not a GPU completion fence and does not pause or alter the world.
3. Give image acquisition an explicit **30,000 ms screenshot-only** budget. Existing `browser-smoke`, art, motion, and vegetation captures use the installed Playwright default (locally verified `DEFAULT_PLAYWRIGHT_TIMEOUT = 3e4`), while this apparatus's blanket 15,000 ms default had also shortened screenshots. Start/UI default timeout stays 15,000 ms; asset waits remain 60,000 ms; no mission or input deadline changes.
4. Save `renderWaitElapsedMs` and screenshot `elapsedMs` separately. Captures exceeding the prior 15-second limit retain `exceededPrior15SecondLimit=true`, even if a PNG is eventually saved. Capture before/after-wait/finally snapshots call **`freshDiagnostics(true)`** and preserve the original `timings` object, including rAF intervals, JavaScript render/advance durations, sample limit/scope, and omitted count. These raw timing observations are separate from screenshot waiting time and from GPU claims.
5. A failed capture keeps its error and fails the case. Do not immediately enqueue the same expensive screenshot again after an attempted capture. Earlier non-capture failures may still get one diagnostic image, without changing the failed case result. Valid saved screenshot bytes must have PNG signature and 1280×720 dimensions; byte count/hash are recorded. Those header checks are not pixel-quality evaluation.

All prior readiness, required PNG/rig, exact injected-error, warning/GL diagnostic, and unhandled-rejection conditions remain. `server.close()` and fresh-process isolation remain. No font checks are disabled. A 30-second capture success will not certify the reported rendering load as acceptable.

### Finite checks and current status

- `node --check fresh/assets-browser-smoke.mjs`: passed.
- `git diff --check`: passed.
- The actual new capture helper was extracted into a Node VM and exercised in **five synthetic scenarios / 23 assertions**: slow successful capture with disclosed duration; screenshot timeout retained with one attempt; frame-wait failure before capture; invalid screenshot dimensions rejected; and expected failed UI captured without requiring render frames. Arguments preserve the 15-second frame wait and 30-second capture-only limit. This is instrumentation validation, not real Chromium execution.
- Diff against `e1882016…`: script only, 58 insertions / 6 deletions, plus this author evidence update. Runtime and other files were not edited by this assignment.
- The repaired script SHA is `34d122a1f06ac5dfd98a7bf537ba9674f2cd08710e28b002347475436e0ef4aa`, now frozen for the next exact-source CI. Its real capture, rendering timings, and pass/fail outcome remain **not measured** until that run. The earlier CI failure remains a failure. Formal comparisons and deadline remain unchanged.
