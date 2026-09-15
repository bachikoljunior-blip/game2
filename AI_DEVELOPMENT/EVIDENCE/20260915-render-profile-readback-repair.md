# Render profile: actual pixel readback repair

## Author and accepted bounded assignment

- Actual implementer: `/root/game2_ultra_art_sound_physics/sound_revision`, continuing this agent's previously formally accepted Ultra assignment. No subdelegation occurred. This is my own implementation/check record; it does not substitute for the parent's acceptance or remote integration.
- Parent supplied canonical HEAD `9ce35e327cffd7dfbc74d9c9b4ab57169e7e9aab`, verified locally, and delegated only `tools/fresh-render-profile.mjs` plus this new evidence file. Original apparatus SHA-256 was `3d227f94b6eb993c21696bcc1ff195dfccdc38da62869045f11ec2d92175e7bf`.
- Previous apparatus author `/root/game2_ultra_art_sound_physics/c06_reference_material` was assigned separate landscape work and was not editing this script. I performed the diagnostic repair directly, without changing runtime, geometry, physics, workflows, remote branches, publication, or automation.
- Record time: 2026-09-15 14:43 UTC. Formal whole-element judgments remain `not measured`; deadline remains `2026-09-20T07:51:53Z`.

## Observed failure and invalid former proxy

I read the parent's recovered actual CI `34982421501` reports. Both used Chromium `141.0.7390.37` and the original apparatus hash above.

| Report | Source | Recorded samples | Full PNG wall time | Runner outcome |
|---|---|---|---:|---|
| baseline | `acf0f9ec86996245ad712d6adc72e5d6159f6711` | full 13 | 7,025.552 ms | passed |
| candidate | `e18820165d6008fedfca28d2cc7073a9c4b74b28` | full 13, no-leaf-shadows 6, no-leaves 6 | 16,913.162 ms | failed |

The candidate failed because the owned browser process did not close within 10,000 ms and required the retained kill fallback. Baseline and candidate warm full-frame `finishWaitMs` medians were both zero. These are facts from the old diagnostic, not proof of zero GPU cost.

Recovered report SHA-256 values:

- `.review/34982421501/render-profile-baseline/report.json`: `eecb297dfd4262ddd73894e2c163e282b04bc62fb7544571e78f653a9ca2a763`.
- `.review/34982421501/render-profile-candidate/report.json`: `61cca5cdf1899aaae42687b2a1dd0ab7d3536091d0369081f4a4b4b58854aef8`.

I independently read the official current Chromium source. `WebGLRenderingContextBase::finish()` calls `ContextGL()->Flush()` with the comment “Intentionally a flush, not a finish.” The retrieved current-source blob was `b452298c2400304cfaa6b137726144ceaa976b6d`. This establishes the current implementation and is consistent with the observed old zero timings; it is **not a verified Chromium 141 tag-specific finding**. [Official Chromium source](https://chromium.googlesource.com/chromium/src/third_party/+/master/blink/renderer/modules/webgl/webgl_rendering_context_base.cc).

The former `finishWaitMs` is retired as an invalid GPU-completion proxy. Old reports and original PNGs remain untouched. Their overall outcomes also remain unchanged; replacing the diagnostic does not retroactively pass the failed candidate.

## Implemented measurement

The isolated inspection page still imports the actual production `createPresentation` and `createWorld`, uses the same normal camera/animation fixture, and performs no simulation advance or input. Source immutability fingerprinting remains. Full case frame 0 plus 12 warm frames and each requested diagnostic's six frames remain unchanged.

After every successful `view.render` call, the same synchronous page call now executes:

```js
gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
```

The drawing buffer must actually be 960×720. One `Uint8Array` of **2,764,800 bytes** is allocated at setup and reused for every frame. It is zeroed before each render, outside the render/readback timers, so a rejected or no-op read cannot reuse a prior frame's valid pixels. The read must correspond to the default drawing buffer; unexpected framebuffer state fails instead of silently accepting an offscreen target.

Schema version 2 reports separate fields:

| Field | Meaning |
|---|---|
| `cpuRenderMs` | Time inside `view.render`, including JavaScript and any driver/compiler blocking there; not pure CPU execution. |
| `readbackWallMs` | Synchronous full-image readback cost: pending GPU work plus synchronization/IPC and the 2.76 MB transfer; **not pure GPU time**. |
| `totalWallMs` | Sum of the previous two fields; excludes reset, GL status queries, and CPU pixel analysis. |
| `bufferResetCpuMs` | Zeroing the reused buffer before render. |
| `pixelAnalysisCpuMs` | CPU statistics computed after the timed readback. |
| `nodeRoundTripWallMs` | Existing Node/browser call round trip, including the separate diagnostic work and serialization. |

The readback serializes each measured frame. These measurements describe obtaining actual frame pixels under this diagnostic, not normal asynchronous gameplay FPS or an isolated GPU timer. Old finish totals and new readback totals are different metrics.

## Real-byte checks and failures

Every frame records full-buffer RGBA minima/maxima, means, variances, RGB nonzero count, nonzero alpha count, opaque count, and RGB pixels differing from the first pixel. Eight representative pixels retain their coordinates and RGBA bytes. Coordinates use WebGL's **bottom-left origin**. Raw pixel arrays are never returned through JSON.

The frame fails if the read result is only zero, fully transparent, or spatially uniform RGB. These finite checks reject empty/unwritten/flat buffers; they do not certify image quality or prove that every particular model was rendered correctly. The next CI's `full.png` and actual pixel variance must be reviewed together to confirm the expected scene correspondence.

GL error/context state is sampled before rendering and after readback. A nonzero GL error, context loss, drawing-buffer size change, wrong read framebuffer, thrown draw/readback, or nontrivial-pixel failure produces a retained `result: failed` sample and page error state. A failure-state status read preserves additional GL/context information without overwriting the original error. There is no error-draining loop. Node stores the returned failed sample, persists the report, then fails explicitly instead of including it in successful summaries.

Existing scene visibility/cast-shadow modifications remain inside the original renderer wrapper's `try/finally`; defaults and renderer function restoration remain. Full PNG acquisition remains bounded at 60 seconds. Browser disconnect, owned-process close, kill fallback, and Vite close retain their original 10-second bounds. A process-close timeout still fails the report even if kill succeeds. No timeout was enlarged.

## Finite verification and frozen handoff

Commands actually completed:

```sh
node --check tools/fresh-render-profile.mjs
node tools/fresh-render-profile.mjs --self-check
git diff --check
```

All passed. The self-check executes the exact browser function with an instrumented fake renderer/readPixels implementation, without a real browser or GPU. It made **11 readPixels calls with one full-size pixel allocation** and verified:

- Exact 960×720 RGBA/UNSIGNED_BYTE arguments and buffer identity reuse; zero reset before each read.
- Separate timing fields and sum; positive pixel variance, full-size counts, eight representative pixels, and compact JSON instead of the raw buffer.
- Preserved full/no-leaf-shadows/no-leaves behavior and restored flags after draw/readback failures.
- Failed no-op, uniform, transparent, explicit GL error, thrown readback, context loss, non-default framebuffer, prior GL error, and changed drawing-buffer dimensions.
- Preserved original renderer restoration, bounded frame indices, diagnostic classification, summary calculations, and positive/timeout bounded-promise paths.

These are finite instrumentation checks. **No real Chromium readPixels, new full PNG, new timing, or cleanup success was measured by this author for the repaired candidate.** Parent will save and run the next exact-source CI.

Final script SHA-256: `1e915d1ed590327b0528efb39ed3cd815815ecfaada08900acc8428033da6651`.

Diff against the supplied HEAD: only the delegated script, 88 insertions / 19 deletions, plus this new author record. The script is frozen at that hash for handoff.
