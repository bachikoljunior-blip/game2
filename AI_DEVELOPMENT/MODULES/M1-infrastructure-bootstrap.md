# M.1 — Minimal infrastructure bootstrap

**TRIGGER**
A missing capability directly blocks a real requirement, verification method, recovery need,
or recurring workflow.

**CONTENT**
Possible infrastructure: bootstrap scripts, version locks, build commands, test runners,
schema checks, linting or type checks, fixtures, deterministic seeds, virtual clocks, browser
or engine harnesses, logging, profiling, snapshots, rollback tools, CI, release automation,
migration utilities.

Use the smallest reliable foundation. Before infrastructure work, define: the capability it
must provide; the requirement or risk it serves; a bounded effort or iteration budget; a
smoke check; and a stop condition.

When the missing capability is the only way to satisfy F3, F6, or an F9 gate for the active
objective, treat building it as P3 rather than optional.

**STOP CONDITION**
Stop when the required capability exists and passes; a simpler substitute is sufficient;
marginal value falls below critical-path product work; repeated failure exposes a false
assumption; or an external blocker prevents useful continuation. Do not allow infrastructure
work to become an open-ended substitute for product progress.
