# Project-local reusable workflows

The method — screen, candidate, evaluate, adopt, revert, promote — lives in the
`adaptive-skill-evolution` skill and the commands in `.kit/tools/skill.mjs`. Do not restate it
here; this file records only what this repository has, and where it stands.

```
LEDGER.json            adopted skills: tier, revision, sha256, prior sha256, provenance
candidates/<id>/       CANDIDATE.json · SKILL.md · check.mjs · RESULT.json
history/<name>@<n>/    the bytes each adoption replaced
OVERLAYS/<skill>.md    a project-local addition to a shared skill, read by that skill
```

## Staged, evaluated, not adopted

**C1 — a fixed image region is not evidence until it says what it samples.** From `F-004` and
`F-005`: a wide box named for a canopy that sampled ground and a structural leg, and a set of
boxes that predated a full position/target/FOV change, two of which included foreground
geometry in front of the sky they claimed to measure.

Screened `layer L, mode improve, target probe`. Evaluated over eight cases: three improved,
zero regressions, three collision cases quiet.

Adoption is **refused by G1** — this round completed no product unit in this repository, and a
skill improvement does not stand in for one. It adopts in the first round that finishes real
product work:

```bash
node .kit/tools/skill.mjs adopt --candidate=AI_DEVELOPMENT/SKILLS/candidates/C1-region-validity \
  --round=<id> --product-units=<n>
```

Promotion to the shared kit is refused and should stay refused: both occurrences are here, and
both turn on this project's camera being the measured subject. Staying local is the ending.

## Work-environment dependency restore

- Applies when the default npm cache is not writable.
- Input: clean checkout with `package-lock.json`.
- Command: `npm ci --cache /tmp/game2-npm-cache`.
- Output: lockfile-exact `node_modules`.
- Verification: `npm run build` and `npm run validate:project`.
- Limitation: the `/tmp` cache is ephemeral and intentionally contains no project state.

The established art-round workflow remains in `../ROUND.md` and is not copied here.
