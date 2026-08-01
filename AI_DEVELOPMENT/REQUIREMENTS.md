# Active requirements

## Product requirements already established by the repository

- Deliver KAGEROU as a mobile-first third-person Japanese sword-action game in Three.js.
- Preserve the `ARCHITECTURE.md` product, ownership, art-direction, mobile UX, and
  performance contracts.
- Primary pass/fail platform is the phone/MEDIUM profile; desktop remains supported.
- All runtime textures, meshes, animation, and sound are generated locally at boot; no
  external runtime assets.
- The shipped product must work without an external AI API or paid hosted inference.
- Visual quality is judged by a separate hostile critic through the established five-frame
  source-blind review surface and measurable contract gates.
- Preserve deterministic capture hooks, fixed framings, measurement evidence, and the list
  of disproved mechanisms so rejected work is not repeated.

## Project-operation requirements added 2026-07-31

- Treat the project as one continuous development process across chats and Work runs.
- Keep concise durable project state, logical-session state, a living hierarchy, an active
  frontier, task dependencies, decisions, failures, debt, criteria, evidence, and exact
  resumption instructions in the repository.
- The logical session ends only when the user explicitly says it is finished.
- Select the highest-value ready task autonomously and continue safe unblocked work without
  asking about routine implementation details.
- Use the minimum useful specialist roles, typed handoffs, independent review, actual
  user-surface tests, deterministic checkpoints, and measurable repair loops where they add
  real value.
- Do not claim edits, execution, tests, commits, pushes, deployments, or verification that
  did not actually occur.
- Persistent explicit authorization is active across sessions to push verified checkpoints,
  integrate them into `main`, and publish GitHub Pages. Paid actions, account or credential
  changes, destructive external actions, and unrelated publication remain unauthorized.

## Quality-bar requirements added 2026-08-01

- The user's latest stated concept is the top criterion. Every reference and every criterion
  serves it; nothing is judged against a bar the concept did not ask for.
- Each element of the product is judged against its own reference title in
  `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml`, selected for that element's actual quality,
  expert and player reception, long-term reputation, fit to this concept, and applicability
  to this device class and production scale — not for fame or sales.
- Reuse a title across elements wherever it is the best bar. Do not grow the title set
  without a recorded reason.
- Take generalisable design principles, quality standards, degree of finish and problem-
  solving methods only. Copying or near-copying any reference's characters, story, world,
  maps, missions, UI, staging, music or design is prohibited. The result must be one unified
  original game.
- Convert every reference into a criterion that can be checked against evidence from our own
  build. Never record a comparison, real-device measurement, blind review, or expert approval
  that did not actually occur.
- If the user changes part of the concept, update that part and everything downstream of it,
  keep unchanged conditions intact, and re-select a reference only where the change makes the
  old one unfit.
- Never weaken a criterion to make the current implementation pass.

## Completed actionable objective

Rounds 13 and 14 were executed from published `main` `51f1807` with coherent phone/MEDIUM
captures, verified apparatus, source-blind hostile reviews, bounded evidence-backed repair
sets, and post-fix remeasurement. PR #6 was merged at `4a3eff7`; the public GitHub Pages
surface loaded current `index-D_EFhYS4.js` and reached ready/running with zero page, console,
request, or HTTP errors. No further product round is authorized; await a new user instruction
without beginning Round 15.

## Primary phone automation authorized 2026-08-01

- Replace the routine physical-device release check with two free automated gates.
- On each product pull request and main candidate, run Playwright WebKit with the iPhone SE
  (3rd generation) landscape profile: `667×375`, DPR 2, touch, coarse pointer, iOS user
  agent, and the forced MEDIUM quality tier.
- Before a verified main candidate may update GitHub Pages, drive Mobile Safari through
  Appium/XCUITest on an iPhone SE (3rd generation) iOS Simulator.
- Exercise boot, movement plus attack, camera, pause/resume, settings persistence, stress
  play, resource budgets, screenshots, and blocking runtime errors; preserve reports,
  screenshots, video, traces, and logs as workflow artifacts.
- Publish only after both target-browser gates pass and verify the exact generated revision
  on the public surface.
- Do not claim physical GPU frame rate, heat, memory-pressure reloads, hardware multi-touch,
  hand reach, haptics, speakers, or audio latency from WebKit emulation or the simulator.
  Those properties remain explicitly unmeasured and are not routine release blockers.
- The user supplied the later instruction on 2026-08-01: push the task branch, run the
  target gates, merge only after passing checks, then verify Pages and the public surface.
