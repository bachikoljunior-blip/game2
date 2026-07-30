# KAGEROU 陽炎 — standing instructions

Read this before anything else. It governs every session, not just the one that wrote it.

## Resuming — start here

**Read `HANDOFF.md`, then the "Where this build actually stands" section of `README.md`.**
Between them they carry the round number, the last verdict, every open item with the
measurement that states it, and the mechanism guesses already disproved. If someone says
only "続けて" / "continue", that is where the next action comes from. Do not ask what to work
on before reading them.

`HANDOFF.md` is the single state file. **Do not create another one.** This repository has
already carried three competing handoff documents at once because separate sessions each
wrote their own; the duplication is how two sessions independently spent a round solving the
same triangle-count problem.

### Work on `main`

Commit and push to `main` unless a human names a branch. This is not style — it is the
reason the handoff kept failing. A new session starts from the default branch, so anything
left only on a feature branch is invisible to the next session, however carefully it was
written. Two sessions branched from stale points and lost the brief entirely that way.

The loop is expected to outlive any single session: containers get reclaimed, context runs
out, devices get swapped mid-round. So **finish a round, update `HANDOFF.md` and `README.md`,
commit, push** — in that order, before reporting. A session that reports and then dies has
lost the round; one that records and then dies has not.

### End every session with a handoff prompt

The last thing in your final reply — after the round report — is a fenced code block the
person can paste straight into a new session. Nothing after it.

It must state: the branch and the commit you pushed, the round just finished and its
verdict, the single next action, and any trap the next session would otherwise walk into
(a held capture lock, a half-finished edit, an unverified fix). Write it standalone: assume
the reader has none of this conversation.

```
KAGEROU を続けて。main の <sha> まで push 済み。
ラウンド<N>は<verdict>。次は<次の一手>。
<次のセッションが踏みそうな罠があれば1行>
```

Keep it short. `CLAUDE.md` and `HANDOFF.md` carry the method and the state; this block only
has to get the next session pointed at the right thing. Emit it even when the session ends
badly — especially then, because a session that failed mid-round is exactly the one whose
state is not obvious from the repository.

## The goal, unchanged

Build a game at the level of a shipped AAA console title. The bar is *Ghost of Tsushima* and
*SEKIRO*: a Japanese sword-action game, third person, mobile-first with desktop support, in
Three.js, with **zero external assets** — every texture, mesh, animation and sound
synthesised at boot.

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
- **Keep going until it is genuinely good**, not until it stops erroring. Continue to the
  next round unless the build passes or a human says stop.

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
