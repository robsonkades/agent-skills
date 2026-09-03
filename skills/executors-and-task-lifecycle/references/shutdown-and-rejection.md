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

```java
Runnable supervised(TaskId id, Runnable task) {
    return () -> {
        metrics.started(id.kind());
        try {
            task.run();
            metrics.completed(id.kind());
        } catch (Throwable failure) {
            metrics.failed(id.kind(), classify(failure));
            throw failure;
        } finally {
            clearContext();
        }
    };
}
```

Avoid high-cardinality IDs in metrics and avoid catching/continuing from fatal errors without policy.
If using `afterExecute`, understand Future-wrapped failures and protect hook failures.

## Bounded shutdown protocol

```java
executor.shutdown();
boolean done = executor.awaitTermination(grace.toMillis(), TimeUnit.MILLISECONDS);
if (!done) {
    List<Runnable> neverStarted = executor.shutdownNow();
    handleNeverStarted(neverStarted);
    if (!executor.awaitTermination(forceGrace.toMillis(), TimeUnit.MILLISECONDS)) {
        reportResidualWork();
    }
}
```

This is a skeleton. Preserve interrupt status/outer cancellation correctly; do not block the only
thread needed for tasks to finish. `handleNeverStarted` must match durability/idempotency. After the
second grace, process/container escalation may be the only bound.

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

A pod termination grace shorter than application drain guarantees forced loss. A liveness endpoint
that fails during drain can trigger premature kill; readiness and liveness have different roles.

## Authoritative references

- [`ThreadPoolExecutor` queue/rejection hooks](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [`ExecutorService` shutdown](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [Kubernetes pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
