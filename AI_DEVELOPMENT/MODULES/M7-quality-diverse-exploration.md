# M.7 — Quality-diverse exploration

**TRIGGER**
An important unresolved problem has multiple plausible solutions, no solution is clearly
superior from existing evidence, and exploration has higher expected value than immediate
implementation.

**CONTENT**
Define useful diversity dimensions: complexity, skill expression, accessibility,
predictability, maintainability, implementation risk, runtime cost, memory cost, performance,
replayability, reversibility, user clarity.

Create materially different candidates in isolated prototypes, simulations, feature flags,
artifacts or branches.

Record only what is needed to compare them: hypothesis, changed variables, tradeoffs, cost,
results, retention or rejection reason. Use a bounded exploration budget.

A simplified simulator may narrow candidates, but simulator success does not prove real
interaction quality, visual quality, integration or device performance.

**STOP CONDITION**
Stop when one candidate is sufficiently superior, all viable candidates fail, the budget is
exhausted, or further exploration has lower value than critical-path work.
