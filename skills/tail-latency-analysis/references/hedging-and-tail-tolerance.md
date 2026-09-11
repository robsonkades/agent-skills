# Hedging and Tail Tolerance

## Preconditions for hedging

Use a delayed duplicate only when:

- the operation is safe to execute more than once or has durable idempotency/deduplication;
- replica consistency and the acceptable-result rule preserve the operation contract;
- measured or explicitly conditional joint behavior supports useful benefit within the
  objective's cost limits; failure diversity helps, but statistical independence is not required;
- all attempts share one end-to-end deadline, and cancellation plus enforced residual-work
  bounds keep physical resource use within budget;
- one policy owner or an explicit coordinated policy bounds attempts across layers;
- aggregate admission/attempt budgets bound degradation, with server pushback honored where
  supported;
- attempt-level and call-level outcomes are observable.

Cancellation of a client future is not proof that server/database work stopped. Verify
protocol and application cancellation propagation. If work cannot be canceled after dispatch,
retain its capacity charge until actual completion and justify its bounded lifetime/cost.
Reject a hedge that merely adds work to the saturated shared bottleneck without an evidenced
benefit inside the capacity envelope; a different replica alone proves neither diversity nor benefit.

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

Bound aggregate attempt rate, in-flight/queued work and payload at the owning scope. A ratio
can complement an absolute capacity bound; a low ratio
under high logical-call load can still overload the callee. Track canceled work that continues.
Admit a duplicate atomically against the applicable budgets. Static allocations whose sum is
safe under an enforced fleet-size bound, or callee admission, can establish the aggregate limit;
a new coordination service is not inherently required. Account for bursts, restarts and scale-out.

## gRPC behavior

The guide describes max attempts, hedging delay, non-fatal status codes, retry throttling,
server pushback and a deadline for the entire call. Verify the deployed language/version and
effective service config: the source baseline here is **grpc-java 1.75.0**, not a universal
language-support or default-setting claim.

In that version, `RetriableStream` rejects simultaneous `retryPolicy` and `hedgingPolicy`.
It commits to an attempt on response headers and cancels peers; that is not a guarantee of
eventual application success or a semantically acceptable result. Before commitment, a fatal
status can end the call; non-fatal handling may retain peers or permit further attempts within
limits. Do not assume every non-fatal response immediately launches another attempt: in this
version absent pushback leaves the scheduled delay unchanged, while a positive pushback on an
unthrottled non-fatal error is converted to zero delay. Negative/malformed pushback stops further
hedging. Inspect `makeHedgingDecision`, `pushbackHedging` and commitment paths for the target.

The guide describes client-side per-server-name retry throttling; Java 1.75.0 holds a throttle
on the channel's transport provider. Neither establishes a quota shared by every process or
channel. Budget aggregate demand separately. Configured attempt limits also do not account for
every transparent transport retry; measure actual sends and distinguish pre-application failures
from applied work. Generic hedging must define acceptable-result semantics, not merely take the
first completion. Application/framework layers can still multiply attempts around gRPC.

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
use backoff/jitter/budgets for transient conditions. Independent layer limits multiply; prefer
one retry owner, or verify coordinated total-attempt, deadline and physical-work accounting.
Observe bottom-layer amplification without resetting the original operation identity or deadline.

When overload is the cause, fail cheaply, shed and suppress retries/hedges. More duplicate
work consumes precisely the missing capacity.

## Experiment

For a new or materially changed policy, select discriminating scenarios from:

- normal distribution;
- one transiently slow replica;
- fleet-wide dependency slowdown;
- saturation/queue growth;
- cancellation-resistant work;
- error and deadline responses.

Measure user latency and success/completeness, logical calls, attempts, canceled work that
continued, callee resource demand, fairness and recovery as relevant to its risks. Retain an
adequate policy when existing evidence covers the decision. Judge throughput/cost/tail changes
against the authorized objective and guardrails; an accepted bounded throughput tradeoff need
not trigger rollback. Reconsider or roll back breaches of stability, correctness or agreed
capacity/completeness limits even when p99 improves.

## References

- [Dean and Barroso: The Tail at Scale](https://research.google/pubs/the-tail-at-scale/)
- [gRPC request hedging](https://grpc.io/docs/guides/request-hedging/)
- [grpc-java 1.75.0 RetriableStream](https://github.com/grpc/grpc-java/blob/v1.75.0/core/src/main/java/io/grpc/internal/RetriableStream.java) — commitment, policy exclusion, pushback and transparent attempts.
- [grpc-java 1.75.0 service config](https://github.com/grpc/grpc-java/blob/v1.75.0/core/src/main/java/io/grpc/internal/ManagedChannelServiceConfig.java) and [channel](https://github.com/grpc/grpc-java/blob/v1.75.0/core/src/main/java/io/grpc/internal/ManagedChannelImpl.java) — parsing and throttle ownership.
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/)
- [gRPC cancellation](https://grpc.io/docs/guides/cancellation/) — application cooperation and work that continues.
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
