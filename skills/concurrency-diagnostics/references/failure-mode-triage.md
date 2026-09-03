# Failure-mode triage

Each entry separates indication from confirmation. No single metric is conclusive without its model
and scope.

## Deadlock or permanently missing signal

- **Symptoms:** useful completions flat; stable wait stacks; often low CPU.
- **Distinguish:** prove a closed wait-for cycle with owner/resource edges. If no ownership is
  available, prove that the only producer/signaller terminated or can no longer execute.
- **Measure:** per-operation age, owner/resource IDs, repeated dumps, platform detector output.
- **Remediate:** remove cyclic acquisition, impose verified ordering, move alien calls outside locks,
  or repair party/signal ownership. A timeout only bounds one wait and may leave resources held.
- **Test:** deterministic orchestration of both acquisition orders plus termination/cancellation.

## Livelock or retry amplification

- **Symptoms:** CPU/attempts high; state commits or useful completions flat.
- **Distinguish:** profile the retry path and compare attempt, contention/CAS-failure and success
  rates. High retry count with continued useful progress is contention, not necessarily livelock.
- **Remediate:** change the state protocol, reduce contenders, serialize a critical transition, or
  use a bounded/jittered retry where retry is semantically valid. Random backoff is not a universal
  correctness fix.
- **Route:** `lock-free-patterns` or `retries-and-backoff`.

## Starvation or priority inversion

- **Symptoms:** one task/tenant/class ages while competitors progress.
- **Distinguish:** per-class queue age, acquisitions and service time; lock/resource owner and
  scheduling priority; a controlled fairness/partition experiment.
- **Remediate:** partition capacity, shorten critical ownership, introduce a measured fairness policy,
  or remove priority mismatch. Fair locks can reduce throughput and do not repair every scheduling
  inversion.

## Executor/resource saturation

- **Symptoms:** arrivals exceed completions, queue age/depth grows, rejection/timeouts follow.
- **Distinguish:** correlate worker utilization with the actual protected bottleneck: CPU, connection
  pool, dependency quota, lock, memory or I/O. A pool can look saturated because every worker waits.
- **Remediate:** admission/load shedding, lower service/hold time, isolate work classes, or add capacity
  only where the bottleneck has headroom.
- **Route:** `executors-and-task-lifecycle`, `concurrency-limiting-and-bulkheads`,
  `littles-law-and-queueing`.

No universal utilization threshold such as 80% proves queueing collapse; service-time distribution,
burstiness, parallel servers and SLO determine the curve.

## Queue/in-flight memory growth

- **Symptoms:** retained heap tracks queue/in-flight count; queue age rises; GC cost follows.
- **Distinguish:** heap dominators to queue/futures/request context plus lifecycle conservation and
  producer/consumer rates. Rule out an unrelated retention leak.
- **Remediate:** bounded admission/windowing, expiry with explicit outcome, smaller captured task state,
  or durable external queueing when work cannot be dropped.
- **Validate:** overload test must show bounded memory and an intentional rejection/degradation signal.

## Submitted or scheduled work disappears

- **Symptoms:** accepted effect absent; future/job freshness stale; logs may be empty.
- **Distinguish:** accepted/started/completed/failed/rejected counters and observation of returned
  `Future`; executor shutdown/rejection state; periodic task exceptional completion.
- **Remediate:** assign a terminal observer, handle rejection, expose last-attempt/last-success and
  choose durable delivery when required. For periodic work, catch and classify expected recoverable
  exceptions at the ownership boundary; do not blanket-catch `Throwable` and continue after
  process-integrity errors.
- **Route:** `executors-and-task-lifecycle`.

## Cancellation/timeout leak

- **Symptoms:** caller timed out or scope failed, but operation ID, connection or side effect persists.
- **Distinguish:** correlate owner deadline/cancel event with provider active request and final outcome.
  Thread interruption alone is not confirmed remote cancellation.
- **Remediate:** propagate remaining deadlines, use provider cancellation, design idempotency/unknown
  outcomes, and release local resources in all terminal races.
- **Route:** `cancellation-and-interruption`, `timeouts-and-deadlines`.

## Permit/connection leak

- **Symptoms:** available capacity trends down and waiter age rises across otherwise similar load.
- **Distinguish:** acquisition/release conservation by resource instance, outstanding owner IDs and
  dynamic-resize/config events. A monotonic gauge alone is not conclusive.
- **Remediate:** one exception-safe ownership scope, try-with-resources where supported, recovery for
  abandoned owners, and leak diagnostics with bounded overhead.
- **Route:** `concurrent-collections-and-synchronizers`, `connection-pool-sizing`.

## Virtual-thread scheduler pressure

- **Symptoms:** queued virtual-thread estimate and latency rise; useful CPU may be high or low.
- **Distinguish:** scheduler parallelism/pool/mounted/queued trends; CPU quota/throttling; JFR
  pin/native/foreign stacks; long CPU-bound virtual-thread work; carrier-capturing I/O.
- **Remediate:** depends on classification—move/bound CPU work, update pinning dependency, isolate
  problematic native/file operations, or adjust parallelism only after proving CPU headroom.
- **Route:** `virtual-threads-internals`, `blocking-and-nonblocking-io`.

## Race/visibility failure

- **Symptoms:** wrong result, impossible state, sensitive to logging/timing; dumps often normal.
- **Distinguish:** formal happens-before/atomicity argument and targeted jcstress outcome. Stress runs
  can reveal an outcome but cannot prove its absence.
- **Remediate:** establish documented synchronization, make state immutable/confined, or replace the
  compound operation atomically.
- **Route:** `java-memory-model`, `concurrency-testing`.

## Cross-failure interactions

Real incidents compose:

```text
slow dependency
  -> workers/connections held
  -> queue age and caller timeouts
  -> retries increase arrival rate
  -> memory/in-flight growth
  -> GC/CPU pressure
```

Fixing only the final symptom (larger heap/pool) can lengthen recovery. Build a time-aligned chain
from first changed signal to downstream effects and validate the intervention at the earliest owned
control point.

## Minimum incident record

- exact time window, JDK/vendor/build, host/container CPU and deployment version;
- traffic/completion/rejection/cancellation and queue-age series;
- scarce-resource occupancy and downstream timing;
- repeated platform/all-thread dumps with collection commands;
- JFR/profile configuration and sampling interval;
- hypotheses considered, discriminating evidence, remediation and before/after validation.
