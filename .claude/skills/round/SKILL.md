---
name: round
description: Run exactly one art-direction review round on KAGEROU — build, capture the review set, have a harsh critic judge it blind against Ghost of Tsushima / SEKIRO, dispatch only the owners the critic named, verify, then stop. Use when asked to run a review round, critique the visuals, continue the art loop, or improve how the game looks.
---

# One review round

Read [`ROUND.md`](../../../ROUND.md) and follow it. It is the whole brief and it is kept
current; do not work from a summary of it, including this one.

Two things it says that are easy to skip and expensive to skip:

- **Report at the end of the round** — verdict, score delta, teams dispatched, teams gated
  out, measured numbers against §7. Invoking `/round` runs one round; the standing brief in
  `CLAUDE.md` is to keep looping until the critic passes or a human stops it.
- **Check `shots/report-rN.json` before sending anything to the critic** — booted, no dead
  shaders, correct tier. The measurement rig has broken four times on this project, and
  every time it turned a correct critique into a wrong fix.

```bash
npm run build
node tools/capture.mjs --review --diff --tag=rN
node tools/contact-sheet.mjs --tag=rN
# critic (opus/high) → shots/review-rN.json
node tools/dispatch.mjs --round=N
```

`dispatch.mjs` prints exactly which teams to spawn and at what model and effort, and which
it is gating out. Spawn those and no others.
