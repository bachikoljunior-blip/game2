# Character asset readiness browser apparatus — 2026-09-15

## Ownership and scope

- Author / actual implementer: `/root/game2_ultra_art_sound_physics/sound_revision`.
- This is a new finite assignment continued under this agent's existing formally accepted Ultra assignment. No subdelegation occurred. This records my own implementation and checks, not the parent's acceptance or remote integration.
- Parent supplied canonical source baseline `3bcc5df515eb394c484e6eaf9caf0efcd50e78c5` and owns integration. I read the existing canonical instructions and smoke/preview setup and the character author's readiness implementation/API. Only `fresh/assets-browser-smoke.mjs` and this new evidence file were written for this assignment.
- Runtime, input, simulation, art, sound, package, workflow, remote branches, publication, and automation were not edited by this assignment. The old untracked `fresh-20260913` evidence was not touched.
- Record time: 2026-09-15 13:37 UTC. This is technical verification apparatus, not a formal comparison. All 10 whole-element formal judgments remain `not measured`; deadline remains `2026-09-20T07:51:53Z`.

## Implemented contract

`fresh/assets-browser-smoke.mjs` SHA-256:

`f09729c3dad03e347a6207a96da9f85365b51a2e9422d9e6226654a9792145e5`

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
