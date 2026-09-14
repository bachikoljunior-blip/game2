# Round 17 normal enemy contact — 2026-09-13

This record covers the normal-path regression that followed the Round 17 gameplay candidate.
It is not a product PASS and it is not physical-device performance evidence.

## Published prerequisite

Main/Pages `86512c3bfdc69e03b5b490d9b0d79ec9da141343` fixes the authored enemy
progression call. CI 34713093118 verified the main-based build, exact Pages payload, public
boot, keyboard movement and retry. The public release therefore creates the first two
forecourt ashigaru; it does not yet include the contact changes below.

## Fresh candidate contact

PR #10 candidate `886f4f3c97c0a3f7e8024ed34b912d1de0c51e44` keeps collision-aware
low-frame lunges, checks the weapon segment against the authoritative body capsule after
bone hitboxes, and adds a player-only difficulty-scaled 0.105 m contact tolerance on normal
difficulty. The enemy weapon path receives no corresponding reach extension.

The dedicated current-source CI 34736414976 passed against freshly built `dist/`, not the
checked-in Pages payload. Its retained artifact is `game2-enemy-progression-886f4f3...`
(artifact 10311206640, SHA-256
`fdb5d94d97bf4ae246e64dd32b616eca41be223dfded5f6987e43cae9108c522`). The
report records:

- normal start at z=73, followed by real keyboard movement into the forecourt;
- two live ashigaru at the authored `torii_c` and `torii_l` positions, both rendered in
  the observed frame;
- 100 draw calls and 511,418 triangles on SwiftShader (render correctness/budget evidence,
  not phone speed);
- real keyboard lock/approach and real mouse clicks;
- the third attack produced one player-to-enemy hit for 17 damage, lowering HP 70 to 53
  and entering `stagger`, with player HP still 100.

The preceding fresh-dist run 34733355184 validly failed at 1.04 m target gap and measured
the remaining blade-to-body miss at 0.4784 m. It is retained as the failing control; the
new PASS is not inferred from unit tests.

## Other gates and limits

- CI 34730003799 at `da4535c` passed the full five-frame gate and all 20 required
  encounters. Its motion job was not requested and was skipped.
- On `886f4f3`, `npm run check`, all 19 `tools/check-*-r17.mjs` tests, and
  `tools/check-enemy-progression.mjs` pass in a clean worktree.
- Candidate `886f4f3` deliberately used `[normal-only]`, so its full five-frame,
  20-encounter and 300-frame jobs were skipped. A new `[motion]` checkpoint must run all
  three before integration.
- Physical-device FPS/thermals/boot, human ergonomics and the remaining independent visual
  quality review are still open. SwiftShader must not be cited for those gates.

Independent release review found no blocker, major or minor in the contact code itself.
It did block immediate publication for two separate reasons: `docs/` is still an older
bundle, and the exact candidate lacks the mandatory full evidence because `[normal-only]`
skipped it. It also identified stale continuation records as one release-process major;
this checkpoint updates those records. Publication remains prohibited until fresh evidence
passes and `docs/` is rebuilt and revision-stamped from the exact accepted source.

## Exact continuation

Trigger one full `[motion]` checkpoint from this source. Require five coherent phone frames,
20 encounters, 300 unique rendered frames and independent review. If those pass, rebuild and
stamp one revision-identified Pages payload, integrate PR #10, then verify served bytes and
the public normal start → enemy display → real hit path. Continue with the remaining
character/cloth readability major and all blocked physical-device/human criteria.
