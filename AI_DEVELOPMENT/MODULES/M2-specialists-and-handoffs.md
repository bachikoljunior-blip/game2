# M.2 — Specialist organization and handoffs

**TRIGGER**
Separation of expertise, implementation ownership, tools, permissions, review independence,
or parallel work materially improves the result.

**CONTENT**
Use the fewest useful roles. Possible roles: requirements analyst, planner, architect,
designer, implementer, engine or asset specialist, test engineer, accessibility reviewer,
security reviewer, performance specialist, user-surface tester, experiment designer,
integration owner, release verifier.

Specialists may not invent requirements.

Give each specialist only the context, scope, criteria, interfaces, constraints and evidence
needed for the assigned work.

Use a structured handoff only when cross-role transfer is material. A useful handoff may
include task, producer and consumer, allowed scope, inputs and outputs, affected interfaces,
invariants, unresolved questions, prohibited changes, required checks, risks, rollback and
completion status. Do not create formal handoff records for trivial sequential work.

If separate agents are unavailable, use separate passes, isolated artifacts, restricted review
packages or separate workspaces. Record the reduced independence honestly; it changes the
level recorded under F5.

**STOP CONDITION**
Deactivate when the work no longer benefits from role separation, or when the coordination
cost exceeds the independence gained.
