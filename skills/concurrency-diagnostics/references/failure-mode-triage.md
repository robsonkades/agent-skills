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

- **First exclude task-starvation deadlock:** every worker may be a parent waiting on a Future
  whose child is queued to that same bounded executor. Correlate parent-to-child task IDs,
  queued work and worker stacks; lock deadlock detectors need not report this resource cycle.
  Use nonblocking composition or an execution/ownership design that lets children progress.
  Adding workers may only postpone the same failure under a larger nested fan-out.
- **Symptoms:** arrivals exceed completions, queue age/depth grows, rejection/timeouts follow.
- **Distinguish:** correlate worker utilization with the actual protected bottleneck: CPU, connection
  pool, dependency quota, lock, memory or I/O. A pool can look saturated because every worker waits.
- **Remediate:** admission/load shedding, lower service/hold time, isolate work classes, or add capacity
  only where the bottleneck has headroom.
- **Route:** `executors-and-task-lifecycle`, `concurrency-limiting-and-bulkheads`,
  `littles-law-and-queueing`.

No universal utilization threshold such as 80% proves queueing collapse; service-time distribution,
burstiness, parallel servers and SLO determine the curve.

For a bounded reproduction, use a single worker whose parent submits a child to itself and waits
with a timed `get`. Verify the child cannot start until the parent exits/releases the worker,
and that there is no monitor-lock cycle. Always bound the parent wait, cancel retained Futures
and terminate the executor in teardown; an intentionally permanent deadlock needs process isolation.

## Queue/in-flight memory growth

- **Symptoms:** retained heap tracks queue/in-flight count; queue age rises; GC cost follows.
- **Distinguish:** heap dominators to queue/futures/request context plus lifecycle conservation and
  producer/consumer rates. Rule out an unrelated retention leak.
- **Remediate:** bounded admission/windowing, expiry with explicit outcome, smaller captured task state,
  or durable external queueing when work cannot be dropped.
- **Validate:** overload test must show bounded memory and an intentional rejection/degradation signal.

## Submitted or scheduled work disappears

- **Symptoms:** expected effect absent; future/job freshness stale; logs may be empty.
- **Trace the path:** follow the affected call site through executor selection, task wrappers and
  the configured rejection handler. Read where each counter increments, including whether it
  observes submission, worker execution, task outcome or caller result. A configured pool name
  or aggregate deficit does not establish which operation was lost.
- **Distinguish the observation boundary:**
  - A completed `submit` Future can contain a failure even when `afterExecute` received a null
    `Throwable`; Future-wrapped exceptions are retained for the result observer. Inspect the
    terminal result/cause before interpreting absent error logs as success.
  - A normally returned but incomplete Future need not be queued or running: stock
    `DiscardPolicy` can reject its task without cancelling that Future. Correlate the actual
    rejection/shutdown path and task identity; a single absence from a changing queue is not
    proof of discard. Inspect drained/removed tasks and wrappers if rejection does not explain it.
  - Stock `CallerRunsPolicy` can finish work on the submitting thread without the pool's worker
    hooks/completion accounting. Match task-body outcomes with the caller path before calling a
    submission-versus-worker deficit a leak. After shutdown this policy discards instead; inspect
    the executor state at submission, not only its later state.
- **Observe without creating another hang:** check `isDone` before reading a terminal result;
  distinguish success, failure and cancellation. Do not use an unbounded `get` on an unknown
  Future merely to diagnose it. An intentionally bounded wait timing out leaves the underlying
  cause unresolved. For periodic work, correlate last-attempt/last-success with the retained
  scheduled Future and inspect exceptional completion.
- **Remediate:** assign a terminal observer, handle rejection, expose last-attempt/last-success and
  choose durable delivery when required. For periodic work, catch and classify expected recoverable
  exceptions at the ownership boundary; do not blanket-catch `Throwable` and continue after
  process-integrity errors.
- **Route:** `executors-and-task-lifecycle`.

With one occupied worker and a full one-slot queue, a third `submit` under caller-runs can
complete inline while worker counters remain unchanged. Changing only the rejection handler to
discard leaves that third Future incomplete and its body unexecuted. The same apparent counter
deficit therefore needs different classification. This is a bounded diagnostic scenario, not a
recommendation to saturate a live pool or to replace its policy without reviewing caller contracts.

The Java 25 [hook contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html#afterExecute(java.lang.Runnable,java.lang.Throwable)>),
[discard policy](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.DiscardPolicy.html),
[caller-runs policy](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.CallerRunsPolicy.html)
and [Future contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
define these distinctions. The bypass of worker accounting is also visible in the pinned
[OpenJDK 25.0.3 worker loop and rejection handlers](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java);
[the submission implementation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/java/util/concurrent/AbstractExecutorService.java)
shows why a silent handler can return an unsettled Future. Custom wrappers may change these
observation boundaries; inspect the implementation actually used.

## Cancellation/timeout leak

- **Establish ownership first:** an accepted durable/asynchronous job may legitimately outlive
  its initiating request. Compare its work with the owning lifecycle and budget before calling it leaked.
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
  native/VM pin reasons including class initialization; long CPU-bound virtual-thread work;
  carrier-capturing I/O. Missing pin events do not exclude uninstrumented native blocking.
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

Use the fields needed for the incident and preserve existing evidence; a straightforward artifact
interpretation does not require collecting every item or producing empty sections.

- exact time window, JDK/vendor/build, host/container CPU and deployment version;
- traffic/completion/rejection/cancellation and queue-age series;
- scarce-resource occupancy and downstream timing;
- repeated platform/all-thread dumps with collection commands;
- JFR/profile configuration and sampling interval;
- hypotheses considered, discriminating evidence, remediation and before/after validation.
