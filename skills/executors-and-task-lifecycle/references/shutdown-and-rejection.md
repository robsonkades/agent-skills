# Shutdown, rejection and drain

## Admission design

| Decision         | Questions                                                                         |
| ---------------- | --------------------------------------------------------------------------------- |
| core/max workers | CPU/blocking demand, quota, latency, thread/resource footprint                    |
| queue            | capacity, FIFO/priority/fairness, memory/item, wait-age SLO, cancellation removal |
| handoff          | can producer block/run/reject, and on which thread/lock?                          |
| rejection        | caller result, retry/idempotency, drop/durable fallback, telemetry                |
| worker factory   | names, daemon policy, priority, context, uncaught handler                         |

Priority queues can starve old work; delayed queues are often unbounded; bounded queues can retain
cancelled tasks depending executor/policy. Inspect exact implementation and purge/removal behavior.

## Rejection matrix

| Policy           | Benefit                       | Hazard                                           | Use when                                              |
| ---------------- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| abort            | immediate explicit overload   | caller must map/recover                          | request path can reject                               |
| caller-runs      | potential synchronous slowing | event-loop/lock/thread-affinity/reentrancy       | submitter safely performs task and is causal producer |
| discard          | low overhead                  | silent loss/order/awaiting caller hangs          | loss is contract and observed                         |
| discard-oldest   | admits new at old expense     | priority queues semantics surprising, starvation | old work explicitly less valuable                     |
| durable fallback | survives process              | storage can saturate/fail/duplicate              | job has durable/idempotent representation             |

Test shutdown rejection separately from saturation. Map `RejectedExecutionException` to business/API
semantics without automatically retrying into overload.

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

## Authoritative references

- [`ThreadPoolExecutor` queue/rejection hooks](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [`ExecutorService` shutdown](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [Kubernetes pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
