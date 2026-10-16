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

Use logical operations when the promise concerns the user's outcome across retries/hedges.
An explicitly defined attempt-level SLI can serve a backend/caller contract or diagnosis;
keep it separate from logical success. Retries change attempt weighting and denominators,
so attempt success is not a substitute for user success. Preserve dimensions for overload, client invalidity,
server fault, dependency fault, timeout/cancel and degraded result without creating
unbounded cardinality.

Measure requests that never reach the application through edge/client/synthetic signals.
Measure semantic correctness where the outcome is knowable. Use multiple SLIs when one
boundary cannot observe both.

## Window membership for delayed outcomes

Inspect the actual counter increment sites or event timestamps used by the query. Matching
labels and window lengths do not make starts and completions the same cohort. If 120 older
operations and 10 new ones finish successfully while only 10 start in the window, dividing
successful completions by starts gives 13. Clamping that result to 1 hides the mismatch.

For an objective assigned by outcome time, count the total and classified outcome at the
same finalization boundary; include timeout/deadline outcomes when required by the promise.
Keep arrival/in-flight counters for their distinct diagnostic purposes. Preserve an already
aligned implementation rather than replacing it merely because it counts at completion.

For an arrival- or schedule-based cohort with a completion deadline, define which operations
are eligible and when their outcomes are due. Do not omit overdue unfinished work from the
denominator or classify work still within its deadline as failed. A known missed deadline
remains bad for a “complete within D” promise even if processing later succeeds. Missing
outcome telemetry is a separate unknown, not proof the work failed or succeeded; apply the
declared coverage/backfill policy. Completion-only counters cannot establish this promise
for operations that never finish. Validate with work crossing a window boundary and with
unfinished work before/after its deadline, not only steady traffic.

Sources: [Prometheus instrumentation timing](https://prometheus.io/docs/practices/instrumentation/)
recommends consistent start/end counting; [Google SRE's SLI specification and implementation](https://sre.google/workbook/implementing-slos/)
separates the promised outcome from measurement coverage. The cohort example follows from
those declared event boundaries, not from a Prometheus-specific estimator guarantee.

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

First determine whether a change affects the measured promise, population, history or any
consumer. Documentation corrections or demonstrably equivalent query/instrumentation changes
can retain the accepted contract with focused checks. For a material semantic change:

1. document reason and expected delta;
2. compare old/new definitions through dual-running or equivalent representative evidence;
3. reconcile disagreement by cohort;
4. agree effective date and budget treatment;
5. coordinate affected dashboards, alerts, runbooks and SLA mapping; a staged transition is
   valid when consumers remain compatible and the effective definition is unambiguous;
6. retain old series/report for audit.

Version changed meanings and make their effective dates explicit; do not silently apply a
new denominator to an old promise or rewrite its budget history. Preserve the evidence needed
for the agreed audit/retention policy.
