# Shutdown, rejection and drain

## Admission design

| Decision         | Questions                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------- |
| core/max workers | CPU/blocking demand, quota, latency, thread/resource footprint                           |
| queue            | capacity, FIFO/priority/fairness, memory/item, wait-age SLO, cancellation removal        |
| handoff          | can producer block/run/reject, and on which thread/lock?                                 |
| rejection        | caller result, retry/idempotency, drop/durable fallback, telemetry                       |
| worker factory   | names, daemon policy, priority, context, uncaught handler, creation failure and recovery |

Priority queues can starve old work; delayed queues are often unbounded; bounded queues can retain
cancelled tasks depending executor/policy. Inspect exact implementation and purge/removal behavior.

## Rejection matrix

| Policy           | Benefit                       | Hazard                                           | Use when                                              |
| ---------------- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| abort            | immediate explicit overload   | caller must map/recover                          | request path can reject                               |
| caller-runs      | potential synchronous slowing | event-loop/lock/thread-affinity/reentrancy       | submitter safely performs task and is causal producer |
| discard          | low overhead                  | silent loss/order/awaiting caller hangs          | loss is contract and observed                         |
| discard-oldest   | retries after dropping a head | priority queues semantics surprising, starvation | old work explicitly less valuable; retry can progress |
| durable fallback | survives process              | storage can saturate/fail/duplicate              | job has durable/idempotent representation             |

Test shutdown rejection separately from saturation. Map `RejectedExecutionException` to business/API
semantics without automatically retrying into overload.

Stock `DiscardOldestPolicy` polls the queue and calls `execute` again; admission is not guaranteed.
A saturated `SynchronousQueue` has no buffered head to free, so unchanged saturation can cause
recursive rejection and stack overflow (reproduced on JDK 25.0.3). Prefer visible refusal or a
bounded replacement/coalescing policy whose queue contract, race handling and result settlement
are explicit; an unbounded resubmission loop is not recovery.

### Caller-runs bypasses worker supervision

Stock `CallerRunsPolicy` invokes the rejected Runnable directly. It does not enter the pool's
worker loop, so `beforeExecute`, `afterExecute` and worker completion counters do not cover that
execution. A hook-only context installer or failure observer may appear correct at low load and
disappear under saturation. Inspect the actual handler and wrappers before generalizing; this path
is visible in [OpenJDK 25.0.3's CallerRunsPolicy and runWorker](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java).

For a plain Runnable passed to `execute`, a caller-run body failure can escape synchronously to
the submitter. With ordinary `submit`, the FutureTask still captures body failure even when run
inline; its owner must inspect the Future. A worker uncaught handler or `afterExecute` alone
observes neither path reliably. Separate task transitions from worker metrics.

If caller-runs remains appropriate, put required context installation/restoration and observation
around the application action on both paths. With ordinary `submit`, wrapping the action before
submission lets the Future capture setup/body/cleanup failures; wrapping only the outside of a
FutureTask can leave its result pending if setup fails. Restore the caller's previous context on
inline or nested execution. Never fall back to running without required context after setup fails.
Alternatively, use visible rejection when inline execution cannot satisfy affinity or context
requirements; retaining caller-runs is not mandatory.

## Failures before the task body

A `ThreadFactory` may refuse creation by returning `null`. `ThreadPoolExecutor` can then queue a
submitted task and return its Future even though it has no worker to run it. Distinguish worker
creation failure from ordinary saturation using queue age, pool state and factory evidence.
Orderly shutdown alone may never drain that queue. Restore worker creation and verify queued work
starts, or use the owner's bounded drain protocol, settling results for work that will not run;
do not merely enlarge the pool.

If `beforeExecute` throws, the worker can exit before invoking the task, so `afterExecute` does not
observe that failure. In the JDK 25 implementation, the task is already outside the queue, its
submitted Future can remain pending, and the completed-task counter still advances. Neither worker
replacement, queue draining nor that counter proves body execution or result settlement. Retain
logical-task/result ownership and observe setup failures independently. Put fallible context setup
inside the submitted task wrapper where its Future can capture failure, with rollback of partial
installation. Never suppress a required security/context setup failure and run the body anyway.
If setup must remain in a hook, explicitly settle never-started results and report the failure.

## Failure-supervising wrapper

A wrapper can record started/terminal transitions and rethrow so executor semantics remain visible:

Partial sketch: `installContext` returns an AutoCloseable scope that restores the previous context
on close (including caller-runs and nested submissions), not a blanket clear. The instrumentation
methods below must be bounded and non-throwing by their adapter contract; otherwise isolate their
failures before using this wrapper so telemetry cannot prevent work or replace its exception.
Context installation must roll back partially installed state if it fails.

```java
Runnable supervised(TaskId id, Runnable task) {
    return () -> {
        try (ContextScope scope = installContext(id)) {
            metrics.started(id.kind());
            try {
                task.run();
            } catch (RuntimeException | Error failure) {
                metrics.failed(id.kind(), classify(failure));
                throw failure;
            }
            metrics.completed(id.kind());
        }
    };
}
```

Avoid high-cardinality IDs in metrics and avoid catching/continuing from fatal errors without policy.
If using `afterExecute`, understand Future-wrapped failures and protect hook failures.
`ContextScope.close()` restores state without checked exceptions; test success, failure and inline
caller-runs restoration. This wrapper records body outcomes, not Future cancellation or rejection:
tasks that never start need an admission/owner observation path.

## Bounded shutdown protocol

```java
executor.shutdown();
try {
    if (!executor.awaitTermination(grace.toMillis(), TimeUnit.MILLISECONDS)) {
        handleNeverStarted(executor.shutdownNow());
        if (!executor.awaitTermination(forceGrace.toMillis(), TimeUnit.MILLISECONDS)) {
            reportResidualWork();
        }
    }
} catch (InterruptedException interrupted) {
    try {
        handleNeverStarted(executor.shutdownNow());
    } finally {
        Thread.currentThread().interrupt();
    }
}
```

This is a skeleton for an owning lifecycle method that records/restores interruption rather than
propagating it. It must not block a worker needed for termination. Validate nonnegative durations
and budget both waits plus recovery/telemetry under the outer deadline; helper calls must themselves
be bounded. An interrupted wait takes the cancellation path without claiming termination.

`shutdownNow` may return FutureTask wrappers and does not guarantee those returned Futures are
cancelled. The owner must associate wrappers with logical tasks, settle their Futures and choose
persist/requeue/drop independently; do not serialize or resubmit wrappers blindly. Capture the
drained list durably or in an owned recovery handoff before a fallible helper can lose it. Running
tasks can continue after interruption: do not close their dependencies merely because grace expired.
After the second grace, process/container escalation may be the remaining bound.

The JDK 25 default `ExecutorService.close()` discards the list returned by `shutdownNow()` on
interruption. With `ThreadPoolExecutor`, queued submitted Futures can therefore remain incomplete
even after the executor terminates. If those results matter, retain their logical-task/Future
mapping or use an explicit drain protocol that settles never-started work. Termination, result
settlement and durable recovery are separate checks; inspect overrides before generalizing.

## Deployment sequence

Coordinate:

```text
leadership/scheduler stop
ingress removal and readiness
request drain/deadlines
executor orderly shutdown
queued durable handling
running cancellation/resource abort
telemetry flush within budget
process termination/restart
```

A pod termination grace shorter than unfinished application drain risks forced termination;
durability/idempotency determine whether work is lost or replayed. A liveness endpoint
that fails during drain can trigger premature kill; readiness and liveness have different roles.

## Decision exercises

These are teaching cases with visible expectations, not measured agent evaluations.

- **Execution-path pair:** a task requires tenant context installed in `beforeExecute`, and
  failures are counted only in `afterExecute`. Case A has an idle worker; case B changes only
  saturation so stock CallerRunsPolicy executes the same task. A exercises the hooks; B bypasses
  them. Require task-level context/observation or visible rejection for B. Failure: assuming all
  Runnable execution passes through worker hooks or recommending context-free fallback.
- **Failure-surface pair:** while saturated, run a throwing action through `execute`, then through
  `submit`. Expect the direct caller to receive the first exception and the second Future to
  retain the failure. Assert that caller context is restored in both cases. Failure: treating a
  worker uncaught handler as sufficient or losing the Future's outcome.
- **Stalled children:** each occupied worker submits a child to the same unbounded queue and
  waits for it. Inspect the wait graph before proposing more maximum workers; accepted queued
  children cannot make progress while all workers wait. Preserve the task's dependency/parallelism
  contract when removing the wait or handing off execution-model design. Failure: calling this
  an observed downstream slowdown or promising that `maximumPoolSize` alone repairs it.
- **Restraint and missing evidence:** a closed producer already bounds queued/live work and has
  tested shutdown. Preserve it unless the requirement changes. If crash survival is now required
  but there is no durable job representation, identify the durable acceptance/recovery gap;
  enlarging an in-memory queue or writing a shutdown hook is not proof of restart safety.

## Authoritative references

- [`ThreadPoolExecutor` queue/rejection hooks](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Java 17 worker-creation contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html) — a factory may return `null` without ensuring queued tasks execute.
- [JDK 25.0.3 task execution](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java) — `execute` and `runWorker` distinguish enqueueing, hooks, body execution and counters.
- [`ExecutorService` shutdown](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [JDK 25.0.3 default close implementation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3-ga/src/java.base/share/classes/java/util/concurrent/ExecutorService.java)
- [`DiscardOldestPolicy` retry contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.DiscardOldestPolicy.html)
- [Kubernetes pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
