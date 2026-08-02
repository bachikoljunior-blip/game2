# iPhone SE 3 automation checkpoint

Date: 2026-08-02
Branch: `agent/round-phone-gates`
Base: `943695effa664ef5984d0e1a0a05932ea93269bf` (`origin/main`, Round 16)

Status: the implementation is reconciled onto the published Round 16 tree. PR #9's first
Round 16 WebKit run passed every interaction/runtime check and rejected the obsolete
pre-Round-16 baseline; its healthy current frame is now the inspected baseline. The exact
baseline-bearing WebKit + Mobile Safari rerun, merge, repeated main run, deployment, and
public verification remain open.

## Prepared gates

- `.github/workflows/iphone-webkit.yml` is one round gate on pull requests and `main`. It
  first runs the iPhone SE (3rd generation) landscape Playwright WebKit descriptor at
  `667×375 / DPR 2`, forces MEDIUM, requires the reviewed WebKit visual baseline, and
  retains screenshots, video, trace, and JSON.
- The dependent job pins Xcode 26.2 and iOS 26.2 on `macos-15-arm64`, selects the matching
  iPhone SE (3rd generation), installs pinned Appium/XCUITest, drives actual Mobile Safari,
  records video, and retains logs/screenshots/JSON. It runs for the same pull-request or
  main revision and cannot pass unless WebKit passed first.
- `.github/workflows/publish-verified-pages.yml` can run only after the combined workflow
  succeeds on a `main` push.
  It rejects a superseded main SHA, rebuilds `docs`, writes `docs/build-revision.json`, waits
  for that exact source SHA on the public surface, then runs the established browser boot
  verifier.

Pinned/new test dependencies were inspected from installed/npm metadata: pixelmatch 7.2.0
is ISC, pngjs 7.0.0 is MIT, and the workflows' Appium 3.6.0 plus XCUITest driver 12.1.3 are
Apache-2.0 and accept Node 22/npm 10+. The existing Playwright 1.56.1 package is Apache-2.0.

## Executed locally

- `npm ci`: passed before the harness work.
- `npm run validate:project`: passed with 55 acceptance criteria, 27 plan nodes, four
  frontier tasks, 22 graph tasks, 16 benchmark elements, three reference titles, and 62
  benchmark criteria.
- `npm run build`: passed; the largest main chunk remained 317.77 KB gzip and existing
  product assets were unchanged.
- `KAGEROU_BROWSER=chromium node tools/test-iphone-webkit.mjs`: passed with zero failures.
  The report covered target viewport/DPR, iOS/mobile detection, MEDIUM, 93 draw calls,
  696,505 triangles at the checked boot state, movement plus attack, camera, pause/resume, settings save/load,
  automated play, frame-production hang guard, image sanity, and zero captured page,
  console, request, or HTTP errors.
- PR #8 target WebKit run `30699682773` completed the full game interaction path at
  `667×375 / DPR 2`, MEDIUM, 90 draw calls, and 692,142 triangles with zero page, console,
  request, or HTTP errors. It stopped only for the intentionally missing baseline and
  Linux WebKit reporting `navigator.maxTouchPoints=0` despite the enabled iPhone touch
  descriptor, coarse-pointer query, and successful real taps.
- The healthy `1334×750` target candidate was visually inspected and promoted to
  `tests/baselines/iphone-se3-webkit-steady.png` (SHA-256
  `214ecd61267398efec20283937f2df49f46cad622fb6b6bdfdec10dbc9a57b9a`). The harness now
  evaluates the descriptor/mobile/coarse-pointer/real-tap contract while retaining
  `maxTouchPoints` only as a diagnostic; it neither spoofs the browser value nor claims
  physical multi-touch.
- The corrected harness plus promoted baseline passed locally in Chromium surrogate mode
  with zero failures, boot `55927 ms`, autoplay `103617 ms`, and visual diff `0.018533`.

PR #9 run `30726607493` exercised the current Round 16 tree in target WebKit at
`667×375 / DPR 2`, MEDIUM. All device, movement-plus-attack, camera, pause/resume,
settings persistence, soak, frame-production, image-health and runtime/network checks
passed: 91 draw calls, 681,191 submitted triangles, 3.4102 movement, 0.39446 camera
delta, boot 36.620 s and autoplay 9.035 s. The only failure was a 48.0858% visual
difference from the old bright courtyard baseline, above the unchanged 35% limit.

The run 5 artifact's 1334×750 dark candidate was initially promoted because it was
non-flat and complete. Required-baseline run `30727382541` then falsified that review:
after the same hero-camera request it produced the intended bright shrine courtyard,
and that stable frame differs only `0.021610` (2.161%) from the original reviewed
baseline, comfortably below the unchanged 35% limit. The dark frame was a transient
captured before the low-speed WebKit engine had settled the cinematic camera, not a
Round 16 art change. The original baseline SHA-256
`214ecd61267398efec20283937f2df49f46cad622fb6b6bdfdec10dbc9a57b9a` is restored,
and the harness now requires four engine frames after setting the hero camera and
magic-hour sky before capture. The rejected dark baseline remains historical failure
evidence only and is not accepted as the product appearance.

Xcode 26.2 WebDriverAgent rejects a delayed second W3C touch source that begins with
`pause`. The Mobile Safari journey now positions both sources first, then performs the
simultaneous move/attack hold. A clean exact-head Safari pass is still mandatory.

Chromium is only a local harness surrogate. It is not recorded as Playwright WebKit, Mobile
Safari, or physical-phone evidence. Runner frame gaps are not physical FPS.

## Deliberate falsification

- `KAGEROU_REQUIRE_BASELINE=1` rejected the first missing target baseline and emitted the
  candidate later inspected and promoted above.
- `node tools/test-ios-safari.mjs` without `IOS_SIMULATOR_UDID` rejected the run before
  opening an Appium session.

## Explicit non-claims

Neither automated gate measures physical GPU speed, thermal throttling, memory-pressure
reloads, hardware multi-touch, hand reach, haptics, speakers, or audio latency. Those facts
remain unmeasured and non-blocking for routine publication under the user's replacement
instruction.

The stale PR #8 remains based on pre-Round-16 main and is not a merge candidate. The new
Round-16-based branch will replace it. No merge, Pages rebuild, deployment, or new public
verification for this reconciled gate has occurred yet.
