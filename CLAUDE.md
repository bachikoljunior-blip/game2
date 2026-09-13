# KAGEROU 陽炎 — current direction

Read `AI_DEVELOPMENT/FIXED_INSTRUCTIONS.md` first, then `AI_DEVELOPMENT/REBUILD_STATE.yaml`.
Latest direct instruction: rebuild the game from zero. Define the desired design and
component requirements first; only then inspect and selectively reuse matching old parts.
Do not inspect the old game first and use it as the new design. This supersedes the
earlier optional-rebuild clarification. Read `AI_DEVELOPMENT/FRESH_DESIGN.md`.

The active implementation branch is **codex/game2-rebuild-20260913**. Fetch its latest
head. Old PR #10 is preserved history and a possible source of narrowly needed parts,
not the main implementation path. New runtime progress is recorded in SESSION_STATE.
`AI_DEVELOPMENT/SESSION_STATE.yaml` names the exact next work. Preserve other writers.
Deadline: **2026-09-20T07:51:53Z**. No human intervention or response waiting.

## Product concept

Build a game at the level of a shipped AAA console title. The bar is Ghost of Tsushima
and SEKIRO: Japanese sword action, third person, mobile-first with desktop support,
in Three.js. Every runtime texture, mesh, animation and sound is generated at boot,
with zero external runtime assets. The mountain shrine, bamboo valley and autumn
magic-hour setting remain the creative brief.

Each concept element needs its own justified reference and actual blind comparison
under the fixed instructions. All elements must be satisfied; a working build or a
technical CI PASS is not completion. Do not copy reference content into the game.

## Execution

The fixed instructions and the user's explicit deadline, no-human-intervention and
concurrency directives govern. Implementation, tooling and order of work are the AI's
choice. Architecture, 62 technical tests, round machinery and plans are supporting
material, not additional fixed instructions. Follow the new design-first rebuild direction.
Do not claim old implementation evidence or simulated hardware timing for the new game.

Standing authorization covers verified checkpoints, main integration and GitHub Pages
publication. Keep the existing public payload until a replacement is verified. Read
remote heads before editing and publication; never force push. Record exact evidence,
limitations and the next action. Continue from unfinished work rather than duplicating it.
