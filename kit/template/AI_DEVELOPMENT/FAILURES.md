# Failures and disproved mechanisms

What was tried, what happened, and what it rules out. This file is read *before* proposing a
mechanism, and an entry here is a claim not to re-test.

Ruling a cause out is worth as much as a fix. Two sessions on these projects independently
spent a round solving the same problem because nothing recorded that it had been solved, and
one round shipped a fix that the next round measured as a no-op and reverted.

Separate the **symptom** from the **mechanism**. On this project's record the symptom calls
held up and the mechanism guesses did not, so a hypothesis is written as a hypothesis until
something disproves or confirms it.

```
## F-0001 — <one-line symptom>

- Date: YYYY-MM-DD
- Symptom: what was observed, with the measurement
- Hypothesis: the suspected mechanism, labelled as a guess
- Test: what was changed, and what was measured before and after on the same region
- Result: confirmed | disproved | inconclusive
- Rules out: what nobody needs to try again
- Cost: rounds or hours spent, so the next estimate is honest
```

A byte-identical before/after measurement means the branch you edited does not affect those
bytes. It does not mean the change was subtle.

<!-- Entries below. -->
