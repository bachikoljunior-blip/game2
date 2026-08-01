# M.9 — Local autonomous-entity behavior

**TRIGGER**
The actual product requires persistent autonomous characters, agents, creatures,
organizations, simulated users or equivalent entities. Do not add autonomous entities merely
because this module exists.

**CONTENT**
Default shipped behavior should be local, testable and deterministic where practical.

Represent relevant state structurally: identity, goals, needs, beliefs, known and unknown
facts, relationships, recent events, important memories, plans, schedules, allowed actions,
prohibited actions, location, resources.

Use locally executable systems: finite-state machines, behavior trees, utility systems,
planning, schedules, influence maps, weighted rules, dialogue graphs, deterministic templates.

Protect canon, mandatory events, secrets, progression, impossible actions, resource limits,
role restrictions and location restrictions through a deterministic authority layer.

Language models may be used only when practical, licensed, explicitly allowed, within
performance and cost limits, and optional or backed by a deterministic fallback. Core shipped
behavior must not require an external AI provider unless explicitly authorized.

Persist entity state through the real save system where applicable.

Test relevant behavior: memory persistence and decay, relationships, conflicting goals,
interrupted plans, save and reload, deterministic replay, invalid-action prevention, protected
facts, long simulation, maximum expected entity count. Measure CPU, memory, storage and update
cost where relevant.

**STOP CONDITION**
Deactivate when entity behavior meets its acceptance criteria and its performance envelope is
verified at the expected entity count.
