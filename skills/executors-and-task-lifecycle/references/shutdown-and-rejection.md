# Shutdown, rejection and drain

## What each factory method actually configures

| Factory                             | Threads               | Queue                      | Fails as                                       |
| ----------------------------------- | --------------------- | -------------------------- | ---------------------------------------------- |
| `newFixedThreadPool(n)`             | exactly `n`           | unbounded `LinkedBlocking` | heap growth, then `OutOfMemoryError`           |
| `newSingleThreadExecutor()`         | 1, non-reconfigurable | unbounded `LinkedBlocking` | one slow task delays everything behind it      |
| `newCachedThreadPool()`             | 0 … `MAX_VALUE`       | `SynchronousQueue` (none)  | unbounded platform threads, then `OOM: thread` |
| `newScheduledThreadPool(n)`         | exactly `n`           | unbounded delay queue      | schedules pile up silently                     |
| `newWorkStealingPool()`             | `availableProcessors` | per-worker deques          | blocking work starves the pool                 |
| `newVirtualThreadPerTaskExecutor()` | one per task          | none                       | cannot reject — the bound must be elsewhere    |

The only one of these that rejects rather than degrades is the one you build yourself.

## The executor you can actually operate

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
        8, 8,                               // core == max: the queue is the buffer
        60, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(500),      // bounded, and the bound is a decision
        new ThreadFactoryBuilder().setNameFormat("orders-%d").build(),
        new ThreadPoolExecutor.AbortPolicy());

// The queue is the earliest signal you have. It is also free.
Gauge.builder("executor.queued", pool, p -> p.getQueue().size()).register(registry);
Gauge.builder("executor.active", pool, ThreadPoolExecutor::getActiveCount).register(registry);
```

`corePoolSize < maximumPoolSize` only means something with a bounded queue, because growth
happens on rejection from the queue, not on load.

## Choosing the rejection policy

| Policy                | Effect                                            | Use when                                                         |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `AbortPolicy`         | throws `RejectedExecutionException` at the caller | the default; a caller is waiting and deserves a fast 503         |
| `CallerRunsPolicy`    | runs the task on the submitting thread            | the submitter is an accept loop you want to slow down on purpose |
| `DiscardPolicy`       | drops the new task, silently                      | never, unless loss is explicitly acceptable and measured         |
| `DiscardOldestPolicy` | drops the oldest queued task, silently            | only for a "latest value wins" feed, e.g. telemetry samples      |

`CallerRunsPolicy` is backpressure, and backpressure means the thread that accepts requests
stops accepting them while it runs one. That is the intended behaviour, and it is also a
latency cliff for everything already accepted. Choose it knowing both halves.

Count rejections. A rejection policy with no metric is a policy nobody will find out
fired.

## Shutdown with a bound

```java
void shutdown(ExecutorService pool, Duration grace) {
    pool.shutdown();                                    // stop accepting, drain the queue
    try {
        if (!pool.awaitTermination(grace.toSeconds(), TimeUnit.SECONDS)) {
            List<Runnable> dropped = pool.shutdownNow(); // interrupt, and take the queue back
            log.warn("dropped {} queued tasks at shutdown", dropped.size());
            if (!pool.awaitTermination(5, TimeUnit.SECONDS)) {
                log.error("tasks ignoring interruption; the JVM will not exit cleanly");
            }
        }
    } catch (InterruptedException e) {
        pool.shutdownNow();
        Thread.currentThread().interrupt();             // never swallow it
    }
}
```

The returned `List<Runnable>` from `shutdownNow()` is the only chance to persist or requeue
work that was accepted and never ran. Discarding it is a deliberate act of data loss.

## `close()` and try-with-resources

`ExecutorService.close()` (Java 19+) is `shutdown()` followed by an **unbounded** wait, and
it only escalates to `shutdownNow()` if the closing thread itself is interrupted. It is the
right tool when tasks are known to terminate — a bounded fan-out inside one request — and
the wrong tool for a long-lived pool of network calls, because a single hung task turns
process shutdown into a hang.

```java
// Right: bounded work, scoped lifetime
try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
    ids.forEach(id -> exec.submit(() -> enrich(id)));
}   // close() waits for all of them — that is the contract you wanted

// Wrong: an application-lifetime pool of network calls
try (var exec = Executors.newFixedThreadPool(8)) { … }  // one hung call hangs shutdown
```

## Draining at SIGTERM

An executor that is not shut down as part of the container's termination sequence loses
whatever it was holding. The sequence — preStop, readiness flip, in-flight drain, grace
period — belongs to `kubernetes-service-lifecycle`; what belongs here is that the grace
period passed to `awaitTermination` must be **smaller** than the orchestrator's
`terminationGracePeriodSeconds`, or the JVM is killed mid-drain and the bound you wrote is
fiction.

## Reviewer checklist

- [ ] No `Executors.newFixedThreadPool` / `newCachedThreadPool` on a path fed by the network
- [ ] Queue bounded; the bound was derived, not typed
- [ ] Rejection policy chosen explicitly and counted as a metric
- [ ] Every `submit` either has its `Future` joined, or an explicit failure handler in the task
- [ ] Queue depth and active count exported
- [ ] Shutdown has a bounded wait, and the dropped-task list is logged or persisted
- [ ] `awaitTermination` grace < orchestrator grace period
- [ ] `InterruptedException` re-asserts the interrupt rather than being swallowed
- [ ] One executor per purpose; no fast path sharing a pool with a slow one
