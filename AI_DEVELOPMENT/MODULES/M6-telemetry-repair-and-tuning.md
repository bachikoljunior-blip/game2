# M.6 — Telemetry-driven repair and tuning

**TRIGGER**
Reliability, usability, performance, balance or behavior can be measured, and the data serves
a real criterion or defect.

**CONTENT**
Prefer local, privacy-preserving measurements: latency, frame time, resource use, loading
time, bundle size, crashes, errors, completion, retries, encounter duration, resource
economy, success rate, abandonment.

Do not add remote analytics or transmit user data without explicit approval.

For a tuning experiment: record the relevant baseline; define the target and hypothesis;
change one variable or a small related group; run enough controlled trials to reduce obvious
noise; compare primary and secondary effects; retain the change only when overall quality
improves; roll back regressions; preserve the useful result.

Do not overfit to one tester, seed, device or metric.

**STOP CONDITION**
Deactivate when the metric meets its criterion, or when further tuning shows no defensible
improvement beyond noise.
