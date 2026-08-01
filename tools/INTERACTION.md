# The interaction review rig

`tools/capture.mjs` photographs the game. This rig plays it.

Twelve of the sixteen elements in `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` had never been
verified at all, and the reason was structural rather than neglectful: combat feel,
movement, camera behaviour, animation timing, touch misfire, audio level and AI legibility
are invisible to a still frame **by construction**. No number of further art rounds could
have revealed them. This is the missing apparatus.

```
node tools/interaction-capture.mjs --tag=i1              # full run + verdicts
node tools/interaction-capture.mjs --self-check          # apparatus validation only
node tools/interaction-capture.mjs --scenarios=move-speeds,touch-drags
node tools/interaction-capture.mjs --tag=i2 --encounters=4 --no-pixels
```

## The four files

| file | job |
|---|---|
| `tools/harness/runtime.js` | page-side: virtual clock, synthetic input, probes, bot |
| `tools/interaction-scenarios.mjs` | the scripted play, as data |
| `tools/interaction-metrics.mjs` | trace → per-criterion verdict, pure functions |
| `tools/interaction-capture.mjs` | the driver: boot, run, extras, self-check, report |

Output lands in `shots/interaction-<tag>.json` (report and verdicts) and
`shots/interaction-<tag>/<scenario>.json` (one trace per scenario). The traces are the
evidence; the report is a summary of them. A disputed verdict is re-derivable from the
trace by re-running `interaction-metrics.mjs` alone — no browser needed.

## How it works, and why it has to

**Nothing was added to `src/`.** Every hook the rig needs is either a DOM event a player
already sends or state the game already publishes on `window.__kagerou`. The whole
page-side half is injected with `page.addInitScript` and cannot exist in a release load,
which is what ARCHITECTURE.md §0 rule 5c asks for.

**The clock is virtual.** Under SwiftShader a frame costs 100–300 ms of wall clock. Left
alone, every `dt` slams into Engine's 0.25 s tab-switch clamp, and a 130 ms parry window is
unreachable — the rig would be measuring the software rasteriser, not the game. The
harness overrides `performance.now` and `requestAnimationFrame`, so the simulation advances
by exactly 1/60 s per frame however long the frame took to draw. THREE.Clock reads
`performance.now`, so Engine's own `dt` follows with no patch. Input.js times gestures off
the same clock, so a scripted flick authored as "180 px over 6 frames" is seen by the game
as 100 ms on any machine.

**Rendering is optional.** `setRender(false)` swaps the post pipeline for a stub that only
runs `scene.updateMatrixWorld(true)` — the part of `renderer.render` the simulation depends
on, since bone world matrices feed blade positions and foot contacts. That is a hypothesis
about the engine, so the self-check *measures* the divergence rather than assuming it.

**Input is real DOM events.** Zone hit-testing, stick-half resolution, swipe/tap
classification and left-handed mirroring all run exactly as they do under a thumb. What is
*not* exercised is the browser's own digitiser-to-event path.

## What this rig may not be used to claim

Read this before writing any result into a record.

- **It is not a play test.** The player in every combat scenario is a scripted policy in
  `runtime.js`. It reads only what a player can see and acts through the same touch
  surface, and it is still not a person. Anything measured under it carries the policy as
  a stated condition.
- **It is not device evidence.** SwiftShader, in a container, with a virtual clock. Frame
  rate, thermals and boot time are outside what this can see; `BM-PERF-02/03/04` stay
  blocked on a real phone.
- **It is not a comparison against a reference title.** No footage was fetched, here or
  anywhere in this repository. Every threshold is measured on our own build.
- **`inconclusive` is not `pass`.** A probe that returned nothing is an apparatus fault.
  Reporting it as a game defect is the exact failure this project has paid for five times.

## The self-check runs first, every time

Three validations, each a falsifiable prediction:

1. **Determinism** — the same stimulus twice must produce the same simulation. Reported as
   the worst absolute divergence across position, heading and speed.
2. **Render substitution** — the same stimulus with the real pipeline and with the
   matrix-only stub. A non-zero divergence invalidates every `render:false` trace in that
   run, and the report says so rather than quietly averaging it away.
3. **Agreement with the screenshot rig** — draw calls and triangles at an identical pose,
   against `shots/report.json`.

Both rigs take the **same** `shots/.capture.lock`, because two SwiftShader runs at once
starve each other (a 200 s boot has been measured at 639 s under contention). The lock's
staleness check keys off the owner's command line containing `capture.mjs`, and
`interaction-capture.mjs` contains that substring too, so each rig sees the other as a live
owner. That is deliberate.

## Adding a criterion

1. Write the criterion in `REFERENCE_BENCHMARKS.yaml` with a threshold that can fail.
2. Add or extend a scenario in `interaction-scenarios.mjs` — data only, no closures, and
   name the criterion in its `criteria` list.
3. Add the probe columns it needs to `runtime.js` if they do not exist. Probes record; they
   never judge.
4. Add a metric to `interaction-metrics.mjs` that returns `pass`/`fail`/`inconclusive`
   **with the number it measured and how it got it**.
5. Wire it into `evaluateAll`.

A metric that cannot return `inconclusive` is wrong. A metric that reports a verdict
without a number is not admissible here.
