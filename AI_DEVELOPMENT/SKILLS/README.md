# Project-local reusable workflows

Store a workflow here only after it has passed its own verification. Current verified
workflow:

## Work-environment dependency restore

- Applies when the default npm cache is not writable.
- Input: clean checkout with `package-lock.json`.
- Command: `npm ci --cache /tmp/game2-npm-cache`.
- Output: lockfile-exact `node_modules`.
- Verification: `npm run build` and `npm run validate:project`.
- Limitation: the `/tmp` cache is ephemeral and intentionally contains no project state.

The established art-round workflow remains in `../ROUND.md` and is not copied here.
