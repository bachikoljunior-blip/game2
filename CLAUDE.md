# KAGEROU 陽炎 — standing instructions

<!-- ELEMENT-COMPARISON-RULES v1 — set by user instruction, 2026-08-02. -->
## Elements, references, and blind comparison

**These rules are the goal. Everything else about how you work is yours.** The user's latest
explicit instruction outranks them, including this file. A stated concept replaces the
recorded one; it is not merged with it.

### The goal

**Every element reads `satisfied`** — for each part of the concept, a judge shown this build
and its reference work unlabelled does not pick the reference.

Verdicts use three words and no others: `satisfied`, `not satisfied`, `not measured`. Never a
word stronger than the evidence. `not measured` is respectable, and not the end.

### What counts as an element

**An element is one part of the concept, cut so it can be compared against a reference work.**

1. **Take the parts from the concept.** Not from the genre, and not from the build — what
   exists in the build is evidence of what was made, not of what the concept asks for.
2. **Take the largest grouping that can still be compared** — this build and a reference set
   side by side on it, as images, video or text.
3. **Check the finished list against the concept as a whole.** Every part of the concept must
   be covered by some element.

**Too few is a defect. Too many is fine.**

**Where nothing compares an element yet, work out a way to compare it.** That is the job, not
a reason to leave it.

### Selecting a reference work for each element

Every element gets its own reference: the shipped work that sets the bar for **that element
alone**. Four axes, and a replacement must be at least as strong on all four.

1. **The quality of that element in that work** — judged on the element by itself. A
   celebrated game with an ordinary version of this element does not qualify on its fame.
2. **Expert and player reception** — what critics and players actually said, from published
   reviews and aggregates. Reading an aggregate is not playing the game, and the record says
   so wherever that distinction matters.
3. **Long-term reputation** — still held up as the bar years later, rather than praised in its
   launch window and since overtaken.
4. **Fit to this concept** — that element in that work is solving the same problem this
   concept has. A brilliant solution to a different problem is not our bar.

**Device class and production scale are deliberately not axes.** The bar is what the element
should be, not what is convenient to reach here. A reference out of reach at this scale is a
recorded shortfall, never a reason to pick a weaker reference.

Change a reference only when it stops fitting the concept — never because another title became
interesting. Record the reason.

### Blind comparison is how an element is judged

- **Material.** The real reference work and the build under development, as **images, video
  and text**. Not recollection, not an official description, not a review score, not a pixel
  metric standing in for a comparison. Fetching reference material for this is allowed.
- **Blind.** The judge is in a state where **which side is which cannot be worked out at
  all.**
- **The question.** Shown these unlabelled, which is stronger on this element alone.
- **The verdict.** **The judge picking the reference is the only failing answer.** Ours, or a
  tie, and the element is `satisfied`.

A comparison that could not be run is `not measured`, and the job is then to work out a way to
compare it.

**Never build a reference work's content into the game.** Its art, models, audio, text,
levels, layout, icons, HUD or fiction may not be copied or near-copied into what ships, and no
reference is named there. **Holding that material and comparing against it is fine** — that is
what it is for.

### When the work is finished

**An element that is not `satisfied` keeps the work open.** Nothing finishes while any element
is unmet — not when the round feels done, not when the findings get smaller, and not when the
ones left over look hard. **How you get from there to `satisfied` is yours.**

### What runs once, and not every time

**Deriving the elements and choosing their references is not part of ordinary quality work.**
It runs once, the first time these rules are applied here, and again only when the concept
changes. Re-opening the element list or swapping a reference because a comparison went badly
moves the target instead of the build.

**When the concept changes:** re-derive the elements; an element that left the concept is
retired, and retiring is not weakening; re-check each surviving reference under the four axes;
re-derive the affected criteria. Making a criterion stricter is free. Weakening one needs proof
it is unreachable as written, stored as evidence — never to reach a pass.

### One unit of work

**A unit starts on the user's instruction and ends when a blind comparison you launched
completes.** Everything in between is yours: what to repair, in what order, and when to launch
the comparison. How many units — a number or continuously — is `work.units_requested` in
`AI_DEVELOPMENT/SESSION_STATE.yaml`. Nothing recorded means one.

### Real hardware is out; the phone gates stand in for it

Playwright WebKit and iOS Simulator Mobile Safari are the phone surface. **What they measure is
judged normally.** What they cannot measure but can be reasoned from what they do **is
reasoned, and the reasoning has to satisfy the criterion. It is written as reasoning, never as
a measurement.** **Nothing is ruled permanently out of reach.**
<!-- /ELEMENT-COMPARISON-RULES -->

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
Read your element's entry before you change it. A reference is the bar this game is measured
against, and copying its characters, world, layout, UI, staging or music **into the game** is
forbidden — holding that material and comparing against it is what it is for. The result must
read as one original game, not a seam of imitations.

That file also records, honestly, that **only one of the sixteen elements has a working
review loop.** Twelve have never been verified at all, because five static screenshots cannot
see combat feel, animation, camera behaviour, touch, or audio. Do not mistake a passing
visual gate for a passing product.

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
