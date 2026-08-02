# Active constraints

- Latest explicit user instructions override older project instructions when they conflict.
- `HANDOFF.md` remains the sole detailed art-round record; do not duplicate its measurement
  history into the project-wide state files.
- File ownership in `ARCHITECTURE.md` is binding for concurrent specialist work.
- No external runtime assets, CDNs, AI APIs, hosted agents, or paid services.
- Mobile is primary. MEDIUM must stay within 140 draw calls, 900,000 submitted triangles,
  5 ms JS/frame, 48 MB textures, and 1.6 MB gzip bundle; physical-device 60 fps remains a
  product target, but automated runner frame gaps are comparative hang/regression evidence
  only and must never be reported as physical-phone FPS.
- No per-frame allocation in `update()` and no conditionally stable integrators.
- Nothing non-finite may cross a system boundary.
- Visual review must use coherent native-resolution captures and a verified apparatus.
- Capture phone first. Do not rebuild while capture is running. Remove only a stale,
  positively identified `shots/.capture.lock`.
- The default npm cache is not writable in this Work environment; use a project-task-specific
  cache such as `/tmp/game2-npm-cache`.
- A fresh clone lacks ignored PNGs and manifest history, so the first verification capture
  cannot rely on differential carry-forward.
- Persistent cross-session authorization is active for remote push, deliberate integration
  into `main`, and GitHub Pages publication of verified checkpoints. Paid, destructive,
  credential, account, and unrelated external actions remain outside that authorization.
- The 2026-08-02 instruction explicitly authorizes the iPhone automation delivery through
  a passing pull request, merge to `main`, and the established Pages publication path.
- Routine primary-phone evidence is Playwright WebKit plus iPhone SE 3 iOS Simulator Mobile
  Safari. Physical-only GPU, thermal, memory-pressure, hand-reach, haptic, speaker, and audio
  latency properties remain unmeasured and non-blocking; do not fabricate them.
- Do not store secrets or personal data in project files or evidence.
- Each element is held to its reference title in `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml`.
  Principles only: no reference's characters, story, world, layout, UI, staging, music or
  design may be copied or near-copied, and no reference title may be named in the shipped
  product.
- A benchmark criterion may be made stricter at any time. It may be weakened only when proved
  unsatisfiable as stated, with the disproof stored as evidence — never to reach a PASS.
- A criterion may be marked verified only when an apparatus that exists actually measured it.
  `npm run validate:project` enforces this and will fail the claim otherwise.
