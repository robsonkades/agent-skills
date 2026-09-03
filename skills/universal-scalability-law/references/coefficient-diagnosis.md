# Turning USL coefficients into testable mechanism hypotheses

## Coefficients are signatures, not profilers

In the standard model:

```text
contention-like denominator term = α(N−1)
retrograde-like denominator term = βN(N−1)
```

`α` and `β` are regression parameters shaped by workload, hardware, topology and measurement. They
are not observed fractions of lock time, GC pause or network delay, are not generally additive by
subsystem, and cannot identify a mechanism alone. Their labels come from the model's derivation;
production attribution requires a second measurement and an intervention.

## Interpret shape with uncertainty

| Fitted evidence                                                   | Safe reading                                                  | Do not conclude yet                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `β` interval includes zero; curve saturates                       | Amdahl-like saturation is sufficient over measured range      | there is no coordination cost at larger N           |
| positive stable `α`, `β≈0`                                        | diminishing returns consistent with a linear denominator term | a particular lock or serial fraction equals `α`     |
| positive stable `β`; held-out throughput declines                 | USL represents a retrograde region over tested range          | pairwise network messages are the cause             |
| coefficients unstable/correlated across bootstrap/leave-one-N-out | data do not identify the terms                                | choose an action from point estimates               |
| negative coefficient/unconstrained superlinear fit                | standard nonnegative USL regime is unsupported                | “bad optimizer”; superlinearity is impossible       |
| residual step at one N                                            | topology/hardware/state phase boundary                        | smooth contention/coherency coefficient explains it |

Compare contributions at the actual operating N, with coefficient uncertainty:

```text
A_N = α(N−1)
B_N = βN(N−1)
```

The larger term has more leverage **inside the fitted curve**, but this is not proof that the
corresponding physical work exists. Near-zero differences can be dominated by covariance; propagate
joint coefficient samples rather than comparing point estimates.

For `β>0`, `α<1`, reducing `β` while holding all else fixed moves continuous
`N*=sqrt((1−α)/β)` by the square root. That is a scenario sensitivity, not a promise: an
architecture change can move `γ`, `α`, workload and bottleneck too.

## Candidate mechanism evidence

| Shape hypothesis                          | Direct evidence to collect across the same N sweep                                                    | Common lookalikes                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Shared serial/contended region (`α`-like) | lock/permit wait and hold time per useful completion; single-writer/leader queue; serial I/O demand   | fixed downstream cap, routing imbalance, generator ceiling                  |
| Cache/coherence traffic (`β`-like)        | invalidations, cache-line transfers, LLC miss/remote-NUMA traffic per completion growing with N       | larger working set, frequency throttling, memory bandwidth saturation       |
| Distributed coordination (`β`-like)       | messages/bytes/acks/quorum work per completion versus members; fan-out topology                       | client retries, health checks, telemetry cardinality, load balancer chatter |
| Shared database/cache                     | DB lock/CPU/connection demand and requests per completion across N                                    | application lock, hot shard, pool queue or rate limit                       |
| Stop-the-world/runtime effects            | pause/compilation/safepoint time and allocation/live set per completion across N                      | host steal/throttle, load-generator pauses; pause fraction is not `α`       |
| Scheduler/worker overhead                 | context switches, runnable queue, migrations, carrier pinning, task-steal/coordination per completion | actual useful work/mix changed with N                                       |

Quadratic USL shape does not require literal all-to-all messages, and an all-to-all protocol may be
hidden by batching or a different bottleneck. Measure scaling order over the tested range and the
causal path to throughput.

## Intervention protocol

1. State one mechanism and predicted direct metric: e.g. “striping this lock halves wait/hold
   demand per transaction at N=16–64 and lowers the alpha-like term without changing mix”.
2. Preserve the original sweep design, useful-output definition, dataset and per-unit resources.
3. Collect the direct mechanism metric plus throughput/guardrails for both builds, randomised or
   blocked by run.
4. Fit both curves jointly or bootstrap the coefficient/prediction difference. Do not compare two
   point estimates without covariance/uncertainty.
5. Validate held-out N and check for bottleneck migration: `γ`, the other coefficient, CPU, GC,
   downstream demand, errors and latency may change.
6. Revert/toggle safely or use a restarted control to challenge deploy/warm-state confounding.

Useful results include “lock wait fell but throughput curve did not”—the lock was visible but not
capacity-limiting—or “β fell and α rose”—coordination was removed but a serial bottleneck became
dominant.

## Decision framework

- If the marginal `X(N+1)−X(N)` interval is below cost/guardrail value, stop adding units even when
  `N<N*`.
- If retrograde behavior is measured but `β` is not identified, run targeted high-N comparisons or
  diagnose direct scaling metrics before a broad redesign.
- If a direct mechanism scales linearly/quadratically but the USL fit is poor, trust neither by
  rhetoric: the system may have multiple regimes; segment on the measured phase boundary.
- If a change improves one workload class and harms another, fit/report classes and production mix;
  aggregate coefficient movement can be Simpson's paradox.
- If the suspected fix changes data partitioning/cache fit, treat it as a new scalability regime and
  compare capacity curves, not “the same β reduced”.

## Sources

- Gunther, [“A General Theory of Computational Scalability Based on Rational Functions”](https://arxiv.org/abs/0808.1431)
- Gunther, Subramanyam and Parvu, [multicore scalability methodology](https://arxiv.org/abs/1105.4301)
- [CRAN `usl` reference manual](https://cran.r-project.org/web/packages/usl/usl.pdf)
