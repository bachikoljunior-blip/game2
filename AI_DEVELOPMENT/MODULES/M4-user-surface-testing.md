# M.4 — Independent user-surface testing

**TRIGGER**
The project has an interactive surface and user behavior is material to acceptance.

**CONTENT**
Test through actual interaction whenever possible.

Cover only the cases relevant to the product and risk, which may include normal use, invalid
use, edge states, interruption, recovery, repeated input, rapid input, simultaneous input,
long duration, small screens, touch, orientation changes, offline operation, degraded
conditions, loading and failure states.

For material findings, record enough to reproduce: starting state, actions, expected result,
observed result, environment, severity and required retest.

After repair, repeat the relevant failing case.

If execution is unavailable, prepare the cases and harness but record them as
prepared_not_executed.

**STOP CONDITION**
Deactivate when the relevant journeys are covered and passing, and no open finding requires
retest.
