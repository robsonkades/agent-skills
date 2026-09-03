---
name: executors-and-task-lifecycle
description: >
  Engineering the full lifecycle of tasks accepted by Java executors: ownership, admission,
  queue/grow behavior, execution context, result/failure observation, rejection, cancellation,
  scheduled/periodic semantics, context cleanup, shutdown/drain and recovery. Covers
  ThreadPoolExecutor, scheduled pools and thread-per-task/virtual-thread executors without treating
  factory defaults as capacity policy. Use when work disappears, queues grow, rejection or deploy
  loses work, or a virtual-thread migration removes an implicit bound.
---

# Executors and task lifecycle

## Purpose

Make each task transition—created, admitted, queued, started, completed/failed/cancelled, observed,
and drained—owned and observable. An executor schedules Java work; it is not automatically a durable
queue, downstream limiter, supervisor, retry engine, context carrier or graceful-shutdown policy.

## Executor contract

```text
task semantics/idempotency/durability and owner:
arrival/burst/service distribution and scarce resources:
executor type, thread factory, priority/context/uncaught policy:
admission bound, queue discipline/capacity and grow rule:
rejection/overload behavior visible to caller:
result/failure/cancellation observation:
deadline and residual work/resource cleanup:
shutdown trigger, grace, drain/persist/drop/escalation:
metrics, health and recovery/restart behavior:
```

## Choose by lifecycle and workload

| Shape                       | Candidate                                        | Conditions/caveats                                             |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| CPU parallel work           | bounded fixed/work-stealing design               | effective CPU, granularity, blocking and interference measured |
| blocking task-per-request   | virtual-thread-per-task or sized platform pool   | explicit resource admission; blocker/provider support          |
| long-lived bounded workers  | owned `ThreadPoolExecutor`                       | queue/rejection/shutdown designed                              |
| delayed/periodic local work | `ScheduledThreadPoolExecutor`                    | non-durable, per-process, exception/drift/overlap semantics    |
| recursive decomposition     | `ForkJoinPool`                                   | join structure and blocking compensation                       |
| durable business job        | external durable queue/store + executor consumer | delivery/idempotency/recovery owned elsewhere                  |

“CPU-bound = core-count pool” is only a starting hypothesis; quota, SMT, memory bandwidth, other JVM
work and latency objectives matter. Derive with `littles-law-and-queueing` and measurement.

## ThreadPoolExecutor admission state machine

At a high level, `ThreadPoolExecutor.execute` prefers:

```text
if workers < corePoolSize -> add worker
else if queue accepts -> enqueue then recheck run state/worker availability
else if workers < maximumPoolSize -> add non-core worker
else -> reject
```

Exact races are handled by implementation. With an unbounded queue, growth beyond core normally
does not occur because offers succeed; `maximumPoolSize` is then ineffective for saturation growth.
With `SynchronousQueue`, direct handoff requires a receiver or growth/rejection. Queue choice defines
latency, memory, ordering and burst behavior.

Factory methods such as fixed/single pools commonly use unbounded queues; cached pools can create
many platform threads. They are conveniences, not safe network-ingress defaults. Inspect the exact
implementation/JDK rather than depending on wrapper internals.

## Failure observation

- `execute(Runnable)` allows an uncaught RuntimeException/Error to escape task execution and reach
  worker/uncaught handling according to executor implementation; the worker may be replaced.
- `submit` wraps work in a Future task, capturing failure for `get`; if no owner observes the Future
  or completion hook, business failure can be invisible.
- `afterExecute` receives `Throwable` directly for some `execute` failures, but submitted Future
  failures may require inspecting the completed Future. Hook code must not block/throw recursively.

Define one observation path: join/get by owner, completion callback, supervised wrapper, or executor
hook. Logs alone do not deliver failure semantics. Track task identity with bounded labels and avoid
leaking MDC/security/scoped state across reused workers.

## Rejection and overload

Rejection happens after shutdown too, not only saturation. Policies are semantic:

- abort/throw gives immediate visible refusal;
- caller-runs can slow the submitting thread, but can block an event loop, violate thread affinity,
  recurse/reenter locks, and does not run tasks after shutdown under the stock policy;
- discard/oldest changes delivery/order and needs explicit acceptable-loss semantics/metrics;
- custom persistence/fallback can itself block/fail and must preserve ownership.

Do not call caller-runs “backpressure” without proving the submitter is on the causal producer path
and slowing it actually reduces arrival. Across asynchronous/network boundaries it may only move the
queue.

## Scheduled and periodic work

Periodic executions of one task do not overlap with themselves under the scheduler's documented
contract, and effects of prior executions happen-before later ones. Fixed-rate and fixed-delay have
different drift/catch-up intent. If an execution throws, subsequent periodic executions are
suppressed by contract; observe the `ScheduledFuture` or wrap with an explicit error policy.

Do not blindly catch `Throwable` and continue: some Errors should stop/alert, state may be corrupt,
and retry can amplify. Decide failure classes, backoff/disable/escalate, overlap across replicas,
clock changes, missed schedules, long run, shutdown and durability. See reference.

## Virtual-thread-per-task executors

`newVirtualThreadPerTaskExecutor` creates a new virtual thread per submitted task and does not impose
a pool-size concurrency cap. It still rejects after shutdown and has an executor lifecycle. Replace
old pool-as-throttle behavior with explicit admission next to connections/downstreams/memory. Track
in-flight tasks, not a nonexistent worker queue as the capacity signal.

Cheap threads do not make task-local memory, ThreadLocals, scoped values, sockets or downstream work
free. Shutdown can wait on uncooperative tasks.

## Shutdown and drain

`shutdown` rejects new work and allows accepted work to complete; `shutdownNow` is best effort,
typically interrupts started tasks and returns queued tasks not begun. Neither makes work durable or
guarantees termination. `ExecutorService.close`/try-with-resources semantics vary with modern API
contract and can wait for termination; verify target JDK and do not hide an unbounded scope close.

Use a bounded two-phase protocol:

```text
stop ingress / leadership / scheduling
mark unready while allowing required health visibility
shutdown orderly
await declared grace while measuring active/queued/residual work
escalate cancellation/abort according to task contract
persist/requeue/drop never-started work explicitly
close owned resources and confirm termination
```

Coordinate orchestration grace, preStop, load balancer drain and downstream deadlines. Returned
queued `Runnable`s are not automatically serializable/durable jobs.

## Metrics

Collect accepted/started/completed/failed/cancelled/rejected, queue depth/wait age, active/in-flight,
execution time, deadline expiry, shutdown duration and residual resources. Executor getters are
estimates/snapshots and queue `size()` cost/consistency depends on implementation; instrument task
transitions when decisions need accuracy. Metrics are not “free.”

## Tests

- saturation and each rejection policy from worker, event-loop and request submitters;
- failure under `execute`, `submit`, completion hook and periodic execution;
- task starts/completes/cancels concurrently with shutdown;
- queued task drain/replay/drop and duplicate side effects;
- uninterruptible work past grace and forced process termination;
- context leakage after success/failure/cancel;
- periodic long run, exception, clock jump, replica overlap and restart;
- virtual-thread migration with connection/memory/downstream bounds;
- executor hook/wrapper throws or blocks.

## Anti-patterns

| Anti-pattern                             | Failure                                              | Better approach                                  | Narrow exception                   |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| Unobserved `submit` Future               | captured failure disappears                          | owner joins/callback/hook supervision            | explicitly lossy best-effort task  |
| Unbounded queue                          | overload moves to heap/tail                          | bounded admission and rejection                  | bounded producer/lifetime proof    |
| CallerRuns by reflex                     | blocks wrong thread/reentrancy                       | analyze causal producer and affinity             | safe synchronous producer feedback |
| Catch all periodic failures and continue | corrupt/repeating bad state                          | classify disable/retry/escalate                  | known isolated transient           |
| `shutdownNow` means stopped              | cooperation required                                 | terminal/resource assertions and escalation      |
| Virtual threads remove rejection         | post-shutdown rejection and resource overload remain | explicit in-flight/resource limits               |
| Executor metrics exact/free              | estimates/cost/races                                 | transition instrumentation + calibrated sampling |

## Definition of done

- [ ] Task ownership, admission, queue/grow/rejection and overload are explicit.
- [ ] Result/failure/cancel is observed on every path, including submitted and periodic tasks.
- [ ] Context/thread-affinity and blocking policy are safe.
- [ ] Shutdown coordinates ingress, grace, residual work, durability and resources.
- [ ] Virtual-thread designs restore resource bounds explicitly.
- [ ] Saturation, failure, cancellation, periodic and deployment tests pass with useful metrics.

## References

- [Shutdown, rejection and drain](references/shutdown-and-rejection.md)
- [Scheduled and periodic tasks](references/scheduled-and-periodic.md)
- [`ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [`ExecutorService`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [`ScheduledThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html)
