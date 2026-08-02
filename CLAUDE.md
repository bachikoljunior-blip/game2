# KAGEROU 陽炎 — standing instructions

Read `PROJECT_OPERATING_PROTOCOL.md` before this file. The protocol is the newest
project-wide authority; this file remains the standing KAGEROU product and visual-loop brief.
Where older text below conflicts with the protocol, the protocol wins.

## Resuming — start here

**Read `AI_DEVELOPMENT/INDEX.md` and its resume sequence, then `HANDOFF.md` and the
"Where this build actually stands" section of `README.md`.** `AI_DEVELOPMENT` carries the
concise project-wide state, active logical session, criteria, dependencies and exact next
task. `HANDOFF.md` carries the detailed art-round measurements and disproved mechanisms. If
someone says only "続けて" / "continue", reconcile those records with actual git/runtime
state and continue the highest-value ready task. Do not ask what to work on before reading
them.

`HANDOFF.md` is the single detailed **art-review** state file. Do not copy its long
measurement history into another record. Project-wide session, plan and criteria files may
point to it; their fields must remain concise and non-duplicative. This repository previously
carried three competing handoff documents, and that duplication made two sessions
independently spend a round solving the same triangle-count problem.

### Branches and remote actions

Always record the exact working branch, base ref and SHA. A new session often starts from the
default branch, so state left only on a feature branch can otherwise become invisible.

Local reversible changes, builds, tests and commits are allowed by a project modification
request. The user gave standing cross-session authorization on 2026-07-31 to push verified
checkpoints, integrate them into `main`, and publish GitHub Pages without asking again.
Inspect the exact remote ref, merged SHA, and public surface before reporting success. Paid,
destructive, account, credential, production-data, and unrelated external actions remain
outside that authorization.

### Logical-session boundaries

The logical development session ends only when the user explicitly says it is finished. A
reply boundary, new chat, closed app, tool failure, context compression or completed visual
round does not end it. Keep `AI_DEVELOPMENT/SESSION_STATE.yaml` active and update the exact
continuation point after every meaningful verified iteration.

Only when the user explicitly ends the logical session, reconcile and archive its state.
The closing report should then state the branch and local/pushed commit truthfully, the last
round and verdict, the single next action, and any trap the next session would otherwise
walk into. A paste-ready block is optional unless the user asks for one; repository state is
the authority.

```
KAGEROU を続けて。<branch> の <sha> がチェックポイント。remote は<実測状態>。
現在の統合判定は<verdict>。次は<次の一手>。検証済み成果は standing authorization
に従って push・main 統合・Pages 公開まで行う。
<次のセッションが踏みそうな罠があれば1行>
```

Never name a remote commit as pushed unless the push actually completed and was inspected.

## The goal, unchanged

Build a game at the level of a shipped AAA console title. The bar is *Ghost of Tsushima* and
*SEKIRO*: a Japanese sword-action game, third person, mobile-first with desktop support, in
Three.js, with **zero external assets** — every texture, mesh, animation and sound
synthesised at boot.

**The bar is per element.** `AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` names the reference
title for each of the sixteen elements, why it was chosen, and the concrete criterion it
becomes — *Ghost of Tsushima* for image, camera, movement, world, UI and audio; *SEKIRO* for
combat, animation, AI and character legibility; *Genshin Impact* for the touch layer and the
phone performance envelope, because neither console title says anything about a touchscreen.
Read your element's entry before you change it, and take principles only: copying any
reference's characters, world, layout, UI, staging or music is forbidden. The result must
read as one original game, not a seam of imitations.

That file used to record that only one of the sixteen elements had a working review loop and
twelve had never been verified at all. **That is no longer true, and it was left standing here
after it stopped being true**, which meant every session opened on a wrong premise. The
interaction-capture rig (`tools/interaction-capture.mjs`, brief in `tools/INTERACTION.md`)
closed that gap: it drives the built game through scripted play at a fixed 1/60 s step through
real pointer and keyboard events, with nothing in `src/` changed to allow it.

Where the sixteen elements actually stand is `gapSummary.byApparatus` in
`AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml` — **read the buckets there rather than a number
here**, because a number here is what went stale. As of the last run those buckets are: four
elements with a working review loop, ten with at least one executed runtime or frame
measurement, two on source audit alone (`E01-COMBAT` and `E14-AI`, bounded by sampling cost),
and none with no evidence at all. `tools/validate-project-state.mjs` now fails when an element
sits in a bucket its criteria do not support, so the buckets cannot drift the way this
paragraph did.

**Measured is not good.** The rig's first run (`AI_DEVELOPMENT/EVIDENCE/interaction-i1.md`)
returned 5 pass, 9 fail and 4 inconclusive over 18 criteria, and `inconclusive` is not a pass.
Do not mistake a passing visual gate — or a populated evidence bucket — for a passing product.

The method is not incidental to the goal; it is the goal's mechanism:

- **Fan out.** Independent agents own separate systems in parallel against a binding
  contract (`ARCHITECTURE.md` §8 assigns every file to exactly one owner). One agent cannot
  hold this much surface area.
- **Loop.** Build, photograph, critique, fix, re-photograph. The build is not finished when
  it works — it is finished when it survives the critic.
- **A separate, hostile critic judges the pixels** — never the agent that wrote the code.
  The brief is `tools/CRITIC.md`. Its default verdict is FAIL.
- **Blind side-by-side.** The critic's central question: *shown unlabelled next to the
  reference frame, which would a stranger pick, and why?* If ours loses, it fails. That
  comparison is the whole bar.
- **Keep going until it is genuinely good**, not until it stops erroring. Within each active
  Work run, continue the highest-value unblocked task; before interruption, persist the exact
  continuation point. A critic PASS closes the visual-review workstream, not automatically
  every project-level release criterion.

Do not quietly lower this. If something cannot be done, say so plainly and say why — never
narrow the target and report success.

## Measure. Do not assert.

The hardest-won rule here, because **almost every defect on this project was silent**: no
exception, no log, plausible-looking configuration.

Telemetry once read `intensity 3.41, castShadow true, 4 cascades active` while a pixel
measurement showed 0.00% of sunward flagstone carried any warm bias at all — the key light
was contributing nothing. Others: inverted winding on every bamboo culm, albedo multiplied
by itself, a UV split leaving metalness on raw box coordinates, a night LUT at 89.6%
strength in daylight, and 11,390 bamboo cards submitted per frame that rasterised zero
pixels for three rounds because their shader linked dead.

- "It looks better" is not a result. Give the number that moved and how you got it.
- Configuration that looks correct is not evidence. Read the linked uniforms, ablate the
  light, check the winding numerically.
- **Verify by measuring the same region before and after.** Byte-identical numbers mean the
  branch you edited does not draw those pixels — not that the change was subtle.
- **Check the apparatus before trusting it.** It has broken repeatedly: five rounds reviewed
  at the wrong quality tier, a histogram measuring a cleared canvas, a frozen draw-call
  counter from a frame that died before it rendered, a review set mixed across two builds, a
  desktop-only retry erasing the phone baseline the round was measured against. Every one
  turned a correct critique into a wrong fix.
- **Judge frames at native resolution.** A downscaled view has already caused "no cast
  shadows anywhere" to be filed as a blocker against a frame that plainly has them.

## Symptoms are reliable; mechanisms are not

The critic's symptom calls have held up; its mechanism guesses have not. Findings therefore
separate `problem` from a labelled `hypothesis`. **Disprove a hypothesis before acting on
it, and report the disproof** — ruling out a wrong cause is worth as much as a fix, because
it stops the next round building on it. Acting on an unverified guess is how the god-ray
pass got worse instead of better, and how round 5 shipped a fix that round 6 measured as a
no-op and reverted.

`HANDOFF.md` lists what is already disproved. Do not re-test those.

## Spend tokens on judgement, not repetition

This removes waste that was *measured* to contribute nothing. It is not permission to think
less about hard problems.

- **Dispatch only the owners the critic actually named.** `node tools/dispatch.mjs
  --round=N` reads `shots/review-rN.json` and prints exactly which teams to spawn, at what
  model and effort, and — out loud — which it is skipping. One round spawned all fourteen
  owners against six findings; eight read their files, found nothing, and returned, about
  1.6M tokens for no change to the frame. The width that makes this method work is in the
  *reviewing*, and that stays untouched.
- **Capture differentially.** `node tools/capture.mjs --review --diff` carries a shot
  forward when nothing it depends on changed (`tools/manifest.mjs` hashes each shot's
  dependency set by content). The saving lands on the verification pass after fixes:
  re-shoot only the framings the changed files can affect. When nothing needs taking it
  does not launch a browser or queue for the rig lock.
- **Use `tools/AGENT-PREAMBLE.md` verbatim** as the head of every dispatch prompt, after
  `ARCHITECTURE.md` and before anything variable. It is a file rather than a rule so the
  cacheable prefix cannot drift between agents.
- **The critic stays at the top tier and full effort.** So do diagnosis and repair. What
  drops to a cheap model is only work with one checkable right answer: histograms, budget
  counts, README tables, file moves.
- **Assemble prompts cache-first**: the contract and standing rules first, byte-identical
  every time; the variable tail (round number, findings) last. Caching is a prefix match.
- **Read narrowly.** Grep for the symptom, then read around the hit. Read a file whole only
  when you own it and have not seen it.
- **Write findings to disk, not through the coordinator.** Relaying them in replies pays for
  the same text three times.

## Working in parallel

One agent per team, never two on one file. Stage the exact paths you changed — never
`git add -A`, which once swept three owners' work into a commit whose message named one
system.

`src/world/Constants.js` holds the authoritative world constants and `WeatherSystem` owns
the single wind field; nothing may re-implement either. Duplicated logic drifting from its
source of truth caused three separate defects here, and all three were correct when written.

## Capture rig, in brief

`HANDOFF.md` has the full list. The two that cost the most time: capture `--profile=phone`
first (desktop/ULTRA boots in ~200 s against phone's ~35 s and may not finish), and never
run `npm run build` while a capture is in flight — it rewrites `dist/` under the server.
