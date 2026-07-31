# Active constraints

- Latest explicit user instructions override older project instructions when they conflict.
- `HANDOFF.md` remains the sole detailed art-round record; do not duplicate its measurement
  history into the project-wide state files.
- File ownership in `ARCHITECTURE.md` is binding for concurrent specialist work.
- No external runtime assets, CDNs, AI APIs, hosted agents, or paid services.
- Mobile is primary. MEDIUM must stay within 140 draw calls, 900,000 submitted triangles,
  5 ms JS/frame, 48 MB textures, and 1.6 MB gzip bundle; real-device 60 fps remains the
  stated release target.
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
- Do not store secrets or personal data in project files or evidence.
