# Hedging and Tail Tolerance

## Preconditions for hedging

Use a delayed duplicate only when:

- the operation is safe to execute more than once or has durable idempotency/deduplication;
- requests can reach failure-diverse replicas;
- the suspected straggler is local/transient rather than shared saturation;
- all attempts share one end-to-end deadline and cancellation reaches real work;
- one layer owns the policy;
- a fleet-wide hedge budget/throttling and server pushback bound degradation;
- attempt-level and call-level outcomes are observable.

Cancellation of a client future is not proof that server/database work stopped. Verify
protocol and application cancellation propagation.

## Load arithmetic

If a hedge delay is the current distribution's q-quantile, approximately \(1-q\) of
primary attempts remain incomplete at the trigger. Extra attempts are not exactly
\(1-q\) in production: distribution drift, errors, timer races, retries, cancellation lag
and per-cohort differences change the rate.

That approximation assumes a representative uncensored primary completion distribution and
negligible mass at the trigger. A success-only p95 does not describe pending calls when errors
or timeouts are omitted; ties and the strict/non-strict timer rule matter too.

A fixed historical p95 delay can approach a 100% hedge rate when the callee shifts slower.
Control observed attempts:

\[
amplification=\frac{\text{all attempts}}{\text{logical calls}}
\]

Track hedge issue/win/cancel/completion rates, useful throughput and downstream cost.

Enforce both proportional and absolute attempt-rate limits, in-flight/queued work and payload
budgets at the owning scope. Admit a duplicate atomically against those budgets; a low ratio
under high logical-call load can still overload the callee. Track canceled work that continues.

## gRPC behavior

Current gRPC service configuration supports max attempts, hedging delay, non-fatal status
codes, retry throttling and server pushback. Deadlines cover the entire hedged call, and
outstanding attempts are canceled after success. Language/version support differs; verify
the deployed library.

An unlisted fatal status can terminate the call and cancel peers; a non-fatal status can
accelerate the next attempt. gRPC retry-throttling state is client-side per server name,
not a globally coordinated fleet quota. Budget aggregate demand across clients separately.
Generic hedging must define acceptable-result semantics, not merely take the first completion.

Do not combine independent retry and hedging policies on the same layer. gRPC describes
hedging as its alternative retry policy, but application/framework layers can still create
unintended multiplicative attempts.

## Alternatives

| Mechanism                  | Prefer when                                            | Trade-off                                 |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| k-of-N/partial result      | result tolerates missing leaves                        | completeness/bias contract                |
| tied request               | servers coordinate queue cancellation before execution | protocol/callee complexity                |
| outlier probation/ejection | one replica persistently differs from peers            | loss of capacity during correlated faults |
| power-of-d choices         | decentralized routing needs bounded sampling           | imperfect/stale load estimate             |
| work slicing/classes       | large jobs block interactive jobs                      | scheduling and starvation controls        |
| selective replication      | hot objects dominate                                   | consistency/storage/rebalance             |
| admission/shedding         | shared resource is saturated                           | explicit rejection/degradation            |
| warm routing               | new replicas have cold useful capacity                 | slower/costlier rollout                   |

The Tail at Scale reports empirical results for specific systems; do not copy its trigger
or overhead as a universal default.

## Deadlines and retries

A deadline sets the logical operation's budget; enforcement, callback scheduling and cleanup
can delay actual return or resource release. Derive attempts from remaining time including
admission, connect, queue and cleanup. Cancel obsolete work cooperatively and measure residual
server activity; a timer or canceled future is not a hard execution cutoff.

Timeout is ambiguous: the first attempt may have committed. Retry only safe operations and
use backoff/jitter/budgets for transient conditions. Attempts across layers multiply; choose
one retry owner and observe bottom-layer attempt amplification.

When overload is the cause, fail cheaply, shed and suppress retries/hedges. More duplicate
work consumes precisely the missing capacity.

## Experiment

Compare baseline and policy under:

- normal distribution;
- one transiently slow replica;
- fleet-wide dependency slowdown;
- saturation/queue growth;
- cancellation-resistant work;
- error and deadline responses.

Measure user latency and success/completeness, logical calls, attempts, canceled work that
continued, callee resource demand, fairness and recovery. Roll back if useful throughput or
stability worsens even when p99 improves.

## References

- [Dean and Barroso: The Tail at Scale](https://research.google/pubs/the-tail-at-scale/)
- [gRPC request hedging](https://grpc.io/docs/guides/request-hedging/)
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
