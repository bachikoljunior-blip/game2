# Bounded render profile apparatus — 2026-09-15

Author: c06_reference_material, technical apparatus production with known source identities. No delegation. Only `tools/fresh-render-profile.mjs` and this author's evidence were written. Runtime/workflow/remote edits are outside this author's changes.

## Frozen deliverable

- Script SHA-256: `3d227f94b6eb993c21696bcc1ff195dfccdc38da62869045f11ec2d92175e7bf`.
- Intended baseline: `acf0f9ec86996245ad712d6adc72e5d6159f6711`, `PROFILE_VARIANTS=full`.
- Intended candidate: `e18820165d6008fedfca28d2cc7073a9c4b74b28`, `PROFILE_VARIANTS=full,no-leaf-shadows,no-leaves`.
- `PROFILE_SOURCE_ROOT` selects a clean tracked source worktree; `PROFILE_OUTPUT` selects the output directory. The runner uses its own installed dependency versions, checks Three against the target lockfile, and builds production `createPresentation` / `createWorld` imports into an isolated Vite inspection bundle. The source worktree's tracked `fresh/` bytes are hashed before and after. No old root application is served.
- Native output contract: `report.json` and `full.png`. `full.png` exists only after a real Chromium screenshot succeeds. This author has not produced that native output locally.

## Measurement contract

960 × 720, DPR 1, production initial world positions, all four production actor rigs, ordinary camera and `view.render(world, 1/60, 0, {animate:true})`. World time and actor age equal `frame / 60`; simulation/input do not advance. Candidate waits for the actual asset promise and requires exactly four ready textures with zero pending/failed. Baseline explicitly has no imported external character image contract.

Each sample records `cpuRenderMs = after render − before render`, `finishWaitMs = after gl.finish − after render`, and their total wall time. Render time includes any driver/compiler blocking in the API call. Finish wait includes synchronization and IPC and is an additional completion wait, not isolated GPU execution time. Initial presentation construction and asset waiting are separate. Full frame 0 includes initial renderer compilation/first draw; the next 12 full frames are reported separately with min/median/max. Each diagnostic variant records six frames at times 0 through 5/60, with cached programs/textures retained; these six-frame sets are not described as equivalent warmed benchmarks.

`leafPivot.w > 0.5` is scanned once per geometry. Any qualifying vertex selects the entire drawable. The report includes each mesh's vertex counts, mixed status, instance count and triangle count, plus totals. **Bamboo batches can include woody side branches. These variants disable whole leaf-containing batches, including such wood, not isolated leaf triangles.**

Full rendering directly forwards the renderer call without changing leaf flags. For diagnostic variants only, a wrapper applies flags immediately before the original renderer call, after ordinary foreground visibility logic, and restores the exact incoming flags in `finally`, including when the draw throws. End-of-run restoration also restores the original renderer method. Animation, foreground ray calculations and vegetation CPU work remain enabled, so differences do not estimate all foliage CPU cost. These variants are cause diagnosis only and are not production candidates or quality evidence.

Each page evaluate and screenshot has a 60-second upper bound; full has 13 frames and each requested diagnostic case has six. Each completed sample is persisted. Screenshot failure is retained without immediate retry. An unresponsive page cannot prove in-page restoration: the report says so, skips further restoration evaluation and closes the owned browser process. Browser/preview cleanup is bounded; browser server ownership permits killing only the process this runner launched. Every console error, page error and failed request fails the report; all warnings are retained and explicit GL error/context-loss diagnostics also fail. The runner never consumes `gl.getError`.

## This author's finite verification

- `node --check tools/fresh-render-profile.mjs`: passed.
- `node tools/fresh-render-profile.mjs --self-check`: passed. This parses the exact page body and checks statistics, GL classification, cleared timer / timeout behavior, then executes that body with a deliberately small fake renderer. It verifies full flags stay unchanged, mixed-batch count is honest, each variant takes effect only inside draw, a thrown draw restores both flags, frame bounds reject excess input, and final restoration reinstates the original renderer function. **This is no browser or WebGL test.**
- Production Vite **build only**: passed at source `3622a5827fa196e7aeea25c89bfda4fde2dc51bd` (the earlier isolated scene-art worktree, not either required profiling revision), 1571.33 ms local wall time; source fingerprint unchanged `True`. Report: `AI_DEVELOPMENT/EVIDENCE/20260915-render-profile-build-check/report.json`, script hash `3d227f94b6eb993c21696bcc1ff195dfccdc38da62869045f11ec2d92175e7bf`. This validates the production import/bundling apparatus on that available clean worktree only.
- Installed versions in that build: Three `0.180.0`, Vite `6.4.3`, Playwright `1.56.1`.
- No local Chrome launch, GPU timing, native PNG, physical-device performance, visual/PS4 quality approval or blind comparison was performed. Prior local Chromium SIGTRAP remains a local environment limitation; dedicated CI must provide actual measurements for both exact revisions.

## Dedicated CI invocation

```sh
PROFILE_SOURCE_ROOT=/absolute/read-only/worktree \
PROFILE_OUTPUT=/absolute/output/directory \
PROFILE_VARIANTS=full,no-leaf-shadows,no-leaves \
node tools/fresh-render-profile.mjs
```

Use `PROFILE_VARIANTS=full` for baseline. The integrator owns `.github/workflows/fresh-render-profile.yml`; this author read its source/output/variant contract but did not edit it. Evaluate the resulting full native PNG before any visual conclusion. The fixed comparison deadline and unmeasured comparison state remain unchanged.

## Follow-up: actual Vite preview cleanup check

A pre-adoption concern was raised that `preview()` might return a PreviewServer without `close()`. This was a suspicion, not an observed failure. The installed and locked Vite version is **6.4.3**. Its `node_modules/vite/dist/node/index.d.ts` PreviewServer definition (line 775) explicitly declares `close(): Promise<void>`; implementation `dist/node/chunks/dep-Dm0c1Wj2.js` (line 48405) provides it. That implementation tears down its SIGTERM listener, destroys tracked open sockets and awaits the native HTTP close. The integrator accepted this evidence and withdrew the concern. No fallback or effective API change was introduced.

One actual Vite preview was started on loopback, served its isolated HTML fixture with HTTP **200**, and closed through the exact documented `server.close()` API under a 10-second bound. Closure took **0.8075 ms** locally; `httpServer.listening` became false, `resolvedUrls` became null, SIGTERM listener count returned from the temporary registration to **0** (matching the original **0**), and a new native HTTP server successfully rebound the same port and then closed. The fixture directory was removed. Original result: `AI_DEVELOPMENT/EVIDENCE/20260915-render-profile-build-check/preview-close-check.json`.

This is a real server lifecycle check, not a Chrome/WebGL/rendering check. Script SHA-256 remains **`3d227f94b6eb993c21696bcc1ff195dfccdc38da62869045f11ec2d92175e7bf`** and the script remains frozen unchanged.
