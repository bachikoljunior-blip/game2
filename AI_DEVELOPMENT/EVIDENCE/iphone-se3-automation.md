# iPhone SE 3 automation checkpoint

Date: 2026-08-01
Branch: `agent/iphone-se3-automation`
Base: `72187ac32365259bfc5eb98f7419d58675f988ae` (`origin/main`)

Status: target WebKit and iOS Simulator runs are `prepared_not_executed`; local harness and
static/project verification are complete.

## Prepared gates

- `.github/workflows/iphone-webkit.yml` runs the iPhone SE (3rd generation) landscape
  Playwright WebKit descriptor at `667×375 / DPR 2`, forces MEDIUM, requires a WebKit visual
  baseline, and retains screenshots, video, trace, and JSON.
- `.github/workflows/ios-safari-simulator.yml` can run only after the fast gate succeeds on a
  `main` push. It selects an available iPhone SE (3rd generation), boots it, installs pinned
  Appium/XCUITest, drives actual Mobile Safari, records video, and retains logs/screenshots/
  JSON.
- `.github/workflows/publish-verified-pages.yml` can run only after the simulator workflow.
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

Chromium is only a local harness surrogate. It is not recorded as Playwright WebKit, Mobile
Safari, or physical-phone evidence. Runner frame gaps are not physical FPS.

## Deliberate falsification

- `KAGEROU_REQUIRE_BASELINE=1` rejected the missing target baseline and emitted
  `test-results/iphone-webkit/iphone-se3-webkit-baseline-candidate.png` for later promotion
  to `tests/baselines/iphone-se3-webkit-steady.png`.
- `node tools/test-ios-safari.mjs` without `IOS_SIMULATOR_UDID` rejected the run before
  opening an Appium session.

## Explicit non-claims

Neither automated gate measures physical GPU speed, thermal throttling, memory-pressure
reloads, hardware multi-touch, hand reach, haptics, speakers, or audio latency. Those facts
remain unmeasured and non-blocking for routine publication under the user's replacement
instruction.

No branch push, pull request, merge, Pages rebuild, deployment, or public verification was
performed in this checkpoint.
