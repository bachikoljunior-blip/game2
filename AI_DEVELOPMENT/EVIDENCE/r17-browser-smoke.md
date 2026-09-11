# Round 17: production input and WebGL recovery

First browser run: **FAIL**, 2026-09-11. No product-wide acceptance is claimed.

- Source: `6e839a6e7a98d467409573c64e86c399a7d40553`.
- Build SHA-256: `7c3f91150ce841fab128ef90e08c93b4d21080699a7a1f4a9ac45faf70d4e28d` before and after capture.
- [Workflow run](https://github.com/bachikoljunior-blip/game2/actions/runs/34604258502), artifact `10265114375`, ZIP SHA-256 `492ecbf9ffa78c1ba4862afd42f5be8f4221db4afbc281c7536f5d658ae8d3b6`.
- Two fresh browser contexts, native 568×320 touch viewport, MEDIUM, SwiftShader. Six native PNGs and the complete JSON are in the artifact. This is browser functionality evidence, not physical-device performance or an art benchmark.

The recorded functional observations all passed: 24 DOM start clicks produced one start; ordinary production exposed no mutable inspection globals; all six live hit regions were at least 64 CSS px with 16 px edge clearance and no overlap; a trusted native touch entered Dodge exactly once without ringing the bell; a separate native context touch deliberately rang it once. Real `WEBGL_lose_context` stopped rendering and input, Escape during loss did not enable input, restoration regenerated the environment and rendered seven subsequent frames, and Space then entered a real Dodge.

The full gate correctly failed because ordinary production logged two resource 404 errors and the capture context logged one. The initial diagnostic did not record those console messages' source URL. In addition, restoration produced 36 `WebGL: INVALID_OPERATION: delete: object does not belong to this context` warnings. Those warnings were preserved but the first gate did not classify them as failures; the next gate must do so.

The restored screenshot had mean Rec.709 luminance 67.4064154 versus 67.3822834 before loss; their p50 and p99 were both 53 and 171 using the independent kit measurement. The lost screenshot was uniform (zero standard deviation). All six screenshot hashes agree with the report. Independent `regionStats` mean-RGB validation differed by at most 0.0320634 luminance units, below its 0.05 rounding bound.

## Next candidate and falsifiable diagnosis

The Three.js r180 `WebGLTextures.onRenderTargetDispose` listener retains the old resource-cache closure. Restoring the renderer replaces those caches; disposing a pre-loss render target afterwards can therefore send old framebuffer and texture handles to the restored context. The previous PostFX restoration path disposed its targets during restoration, and Sky disposed its preceding PMREM output then too.

The next candidate dispatches `onContextLost` to systems and the pipeline, releases these target listeners while the context is lost, preserves shared depth texture JS identities, and rebuilds the sky and post targets after restoration. This is a source-backed mechanism hypothesis until the browser rerun reports zero invalid-operation warnings and the same restoration observations still pass.

The HTML now explicitly names the existing `icon.svg` as its favicon. Missing implicit favicon requests are the suspected cause of the 404 messages, not a proven attribution from the first log. The next run records both console locations and server response URLs and must report zero 404s; no error is excluded.

Native frame rate, thermal behavior, touchscreen ergonomics, audio feel, and AAA visual quality remain unverified by this smoke test.
