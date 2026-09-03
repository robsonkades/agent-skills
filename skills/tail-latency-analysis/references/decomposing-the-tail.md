# Decomposing the Tail

## Population contract

Record:

- client/server clock and latency boundaries;
- endpoint/workflow, result status and retry semantics;
- timeout, cancellation and unfinished-request handling;
- window, traffic level and deployment topology;
- histogram/trace sampling behavior;
- relevant cohort dimensions.

If the SLO is “successful user operations,” retain failed/timed-out operations separately;
excluding them can make latency improve during an outage.

## Critical-path analysis

For each sampled slow request construct:

```text
client queue/connect/TLS
  -> edge/load balancer
    -> service admission/executor queue
      -> CPU/lock/GC/scheduling
      -> dependency calls (parallel or sequential)
    -> response serialization/network
```

Calculate critical-path duration from timestamped intervals. Sibling parallel spans cannot
be summed; overlapping CPU/wait intervals need semantic attribution. Missing spans are
unknown time, not automatically application time.

Compare slow requests with matched normal controls by operation, payload, tenant, instance,
load and time. This avoids declaring a large-payload path a “tail anomaly.”

## Fan-out

Under independent, identical leaf exceedance probability \(p\):

| leaves | probability at least one exceeds |
| -----: | -------------------------------: |
|      1 |                            \(p\) |
|     10 |                 \(1-(1-p)^{10}\) |
|    100 |                \(1-(1-p)^{100}\) |
|   1000 |               \(1-(1-p)^{1000}\) |

At \(p=0.01\), these are 1%, about 9.6%, 63.4% and nearly 100%. This describes exceeding a
fixed threshold, not a direct conversion from leaf “p99” to an end-to-end percentile.

With dependence, estimate:

- empirical probability that any leaf exceeds by fan-out width;
- number/order of slow leaves per request;
- correlation by host/rack/zone/dependency/key;
- conditional leaf latency given a shared event;
- completion rule: all, first, k-of-N, quorum or deadline.

Union bounds can provide conservative limits without independence:

\[
P(\cup_i A_i)\le\sum_iP(A_i)
\]

They may be loose; state that limitation.

## Mixture analysis

Overall CDF:

\[
F(t)=\sum_k w_kF_k(t)
\]

A quantile can regress because weights \(w_k\) changed or conditional CDFs \(F_k\)
changed. Compare both. Do not infer “three causes” from three fitted mixture components
without externally validating component meaning and model selection.

## Percentile arithmetic counterexample

If A and B are rarely slow on different requests, p99(A) and p99(B) can each be small while
p99(A+B) is large. If slow events coincide, component sums behave differently. Therefore
no universal inequality such as p99(A+B) less than p99(A)+p99(B) is safe.

Use:

- request-level sums for sequential stages;
- maximum/order statistics for parallel branches;
- empirical joint samples or validated simulation;
- end-to-end measurement as the authoritative SLO.

## Sampling and exemplars

Head sampling can miss rare tails; tail sampling can bias population estimates. Use metrics
for population quantiles and traces/exemplars for attribution, while documenting sampling
selection. Ensure errors/timeouts and unsampled root causes remain countable.

## Deliverable

```text
Population:
Tail threshold/quantile:
Affected cohorts:
Mixture-weight versus conditional change:
Critical-path contributors on slow requests:
Fan-out completion/dependence:
Missing/censored evidence:
Leading cause hypothesis:
Discriminating next measurement:
```
