# M.5 — Checkpoint and state-injection verification

**TRIGGER**
Rare, late, long-running, branching, failure, permission or environment states would
otherwise require expensive full replay.

**CONTENT**
Possible mechanisms: fixtures, save states, snapshots, progress setters, virtual time,
deterministic random seeds, simulated failures, offline modes, network conditions, object
spawning, controlled environment states.

Test-only state controls must be isolated from production, deterministic, documented where
needed, protected from unauthorized access, and unreachable in release behavior.

Verify important paths through representative normal flow as well as injection.

Do not use injection to conceal broken initialization, progression, transitions, or save and
load behavior.

**STOP CONDITION**
Deactivate when the states of interest are reachable and verified, and the injection surface
is confirmed unreachable in release behavior.
