# Decomposing the Tail

## Population contract

For a measured tail, record the fields needed to identify its population and limits:

- client/server clock and latency boundaries;
- endpoint/workflow, result status and retry semantics;
- timeout, cancellation and unfinished-request handling;
- window, traffic level and deployment topology;
- histogram/trace sampling behavior;
- relevant cohort dimensions.

If the SLO is “successful user operations,” retain failed/timed-out operations separately;
excluding them can make latency improve during an outage.

A client timeout is an observed terminal client outcome/duration, but can censor the latent
server completion time. Do not substitute the timeout as a successful completion or infer how
long the server would have run. Record still-open requests at observation-window end separately;
completion-window samples differ from arrival cohorts. Join retries into logical operations
without losing attempt-level cost. Any censoring model must state its assumptions.

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

Use elapsed time from a monotonic clock within each process. Cross-host timestamp subtraction
needs measured clock offset/uncertainty; NTP synchronization alone is not proof of exact ordering.

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

The useful bound is `max(p_i) <= P(any slow) <= min(1, sum(p_i))`. With 100 leaves at
1% each, perfect co-occurrence gives 1%, independence gives about 63.4%, and mutually exclusive
slow events can give 100%. The same marginals therefore do not identify the user tail.
Leaf durations also exclude dispatch offsets: take the maximum of launch offset plus duration
for all-of-N, and account for result validation/merge and cleanup. First completion is not
necessarily first valid success, and a numerical k-of-N is not automatically a consistency quorum.

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

There is a different, valid marginal lower bound. For nonnegative sequential components on
the same population, `T=A+B >= A` pointwise implies `F_T(t) <= F_A(t)` and thus
`q_p(T) >= q_p(A)` under the same inverse-CDF quantile definition; likewise for B.
The same order holds for matched empirical nearest-rank quantiles. Different cohorts,
censoring rules or incompatible histogram approximations do not establish that comparison.

Concrete nearest-rank example: among 1,000 matched requests, A costs 100 ms on requests 1–6,
B on 7–12, and both are zero otherwise. Each component p99 is 0 ms, but p99(A+B) is 100 ms.
Move B's six slow observations onto requests 1–6: component p99 values stay zero and the sum's
p99 becomes zero too. Marginal percentiles alone cannot recover their joint behavior.

The opposite direction relative to the **sum of p99s** also occurs: make A cost 100 ms on
requests 1–20 and B cost 100 ms on 21–40, with zero elsewhere. Each component p99 is 100 ms,
but the sum's p99 is only 100 ms, below 200 ms. Both examples retain the marginal lower bound;
neither licenses percentile subtraction for critical-path attribution.

Use:

- request-level sums for sequential stages;
- maximum/order statistics for parallel branches;
- empirical joint samples or validated simulation;
- end-to-end measurement as the authoritative SLO.

## Sampling and exemplars

Head sampling can miss rare tails; tail sampling can bias population estimates. Use metrics
for population quantiles and traces/exemplars for attribution, while documenting sampling
selection. Ensure errors/timeouts and unsampled root causes remain countable.

Metrics are not automatically representative either: verify boundaries, omitted outcomes,
histogram range/overflow and recording overhead. Slow-trace exemplars identify mechanisms;
their prevalence is not a population rate without a valid sampling correction.

## Deliverable

Use the relevant fields for the decision; a mathematical explanation need only state its
population/quantile assumptions, derivation or counterexample, and limits.

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
