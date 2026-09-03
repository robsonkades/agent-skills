# SLI and Error Budgets

## SLI specification template

```text
User / journey:
Service-level property:
Population / denominator:
Good, bad and unknown:
Measurement boundary and latency start/end:
Rolling/calendar window:
Aggregation and weighting:
Low/no-traffic behavior:
Data source, query and retention:
Schema/query version:
Known proxy gaps:
```

## Common shapes

| Property             | Example SLI                                                |
| -------------------- | ---------------------------------------------------------- |
| availability/yield   | good logical operations / valid logical operations         |
| threshold latency    | operations completed within D / valid operations           |
| latency distribution | declared quantiles/CDF for scoped population               |
| freshness            | age of newest complete usable data                         |
| durability           | lost/corrupted objects over stored objects or audited time |
| correctness          | verified correct outcomes / evaluated outcomes             |
| batch timeliness     | scheduled jobs complete by deadline / eligible jobs        |

Threshold-latency ratios aggregate from counters when the threshold is a histogram bucket.
A quantile can still be an SLI, but its estimator, aggregation and window must be valid.

## Event classification

Define at logical-operation level where retries/hedges exist. Attempt success can overstate
user success and inflate denominators. Preserve dimensions for overload, client invalidity,
server fault, dependency fault, timeout/cancel and degraded result without creating
unbounded cardinality.

Measure requests that never reach the application through edge/client/synthetic signals.
Measure semantic correctness where the outcome is knowable. Use multiple SLIs when one
boundary cannot observe both.

## Error-budget policy

For ratio target \(S\), event budget over a window with \(V\) valid events is:

\[
B=(1-S)V
\]

Budget is dynamic with traffic. A five-minute peak outage can consume more request budget
than the same clock outage off peak. Time-based availability has a different denominator;
state which is used.

Policy should specify:

- warning/exhaustion/risk states and forecast;
- release and reliability-priority consequences;
- security/safety/emergency exceptions;
- decision owner and dispute/escalation path;
- multi-SLI conflicts and shared dependency attribution;
- when budget resets and whether late/backfilled data revises history.

## Target selection

Use user research/impact, alternatives, downstream requirements, architecture/cost and
historical feasibility. Avoid choosing solely from current performance or round nines.
Consider distinct cohorts only when they have distinct contracts and adequate observability.

An internal margin relative to an SLA should cover detection, response, measurement error,
traffic mix and definition differences. Compare the complete specifications, not just
99.9 versus 99.95.

## Migration

SLI changes rewrite history unless versioned. For a schema/query/population change:

1. document reason and expected delta;
2. dual-run old/new definitions;
3. reconcile disagreement by cohort;
4. agree effective date and budget treatment;
5. update dashboards, alerts, runbooks and SLA mapping atomically;
6. retain old series/report for audit.
