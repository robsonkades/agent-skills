# Interrupt handling by boundary

## Handler patterns

### Propagating API

Partial Java sketch: application-specific types and methods are placeholders. Here `acquire`
must clean up a partially acquired resource itself if it fails, and `release` must be bounded
and nonthrowing. Otherwise use try-with-resources where suitable, or explicitly preserve the
primary exception and attach cleanup failure as suppressed; an ordinary throwing `finally`
would replace the interruption.

```java
Result load() throws InterruptedException {
    Resource r = acquire();
    try { return doInterruptibleWork(r); }
    finally { release(r); }
}
```

Cleanup must not erase the original interruption if it also fails; define suppression/reporting.

### `Runnable`/callback unable to declare

Partial Java sketch for a boundary that must restore status to its caller. `cleanup` here must
be bounded, noninterruptible and nonthrowing; report cleanup failure through an explicit
owner-visible channel. If cleanup can throw, add primary-exception suppression as above.
Deferring restoration until cleanup completes avoids presenting the caught interrupt to cleanup
as a fresh request to abort. It does not prevent a second interrupt arriving during cleanup.

```java
public void run() {
    boolean interrupted = false;
    try {
        loop();
    } catch (InterruptedException e) {
        interrupted = true;
    } finally {
        try {
            cleanup();
        } finally {
            if (interrupted) Thread.currentThread().interrupt();
        }
    }
}
```

Restoration lets an outer owner observe status when one exists. At a terminal thread/task owner,
cleanup and termination can consume the signal deliberately; document it rather than restoring by
ritual.

If cleanup itself must block interruptibly, design a separate bounded cleanup policy: preserve
each interruption, use the remaining cleanup budget, and report/escalate failure to release.
Do not repeatedly restore and retry an interruptible wait: it may throw immediately forever.

### Preserve invariant then honor

```text
interrupt arrives inside short non-cancellable transition
  -> remember/restore status
  -> finish or roll back invariant without new unbounded work
  -> release resources/locks
  -> propagate/terminate immediately afterward
```

Use this only for bounded correctness-critical regions, not through a remote call.

## Status traps

- methods throwing `InterruptedException` commonly clear status as specified;
- `Thread.interrupted()` clears; use intentionally;
- broad catches can accidentally swallow interruption/cancellation;
- retry loops must not retry interrupted calls as ordinary transient failures;
- clearing status to call an API requires a plan to restore/translate afterward.

## Multiple sources and shutdown

Use an atomic terminal-state transition recording the cause according to policy. Resolve normal
completion versus cancel, failure versus deadline, shutdown versus request cancel, resource-close
exception versus interrupt, and cancel versus durable commit.

`shutdownNow()` is best effort: it commonly interrupts started tasks and returns tasks never
commenced. Test tasks that block, swallow signals or own resources. Returned `Runnable`s are not
automatically durable business work.

Draining the executor queue does not guarantee that the corresponding submitted Futures become
cancelled. Retain owned Future handles and explicitly resolve/cancel never-started submissions
according to policy, then notify their waiters. Do not assume an arbitrary queue wrapper is the
same object as the caller's Future. `awaitTermination` observes executor termination; the
cancelled state of a Future alone does not establish it. On JDK 19+, `ExecutorService.close()`
waits for termination without a timeout, so try-with-resources is not a bounded shutdown policy
for uncooperative work.

## Review checklist

- [ ] Catch blocks distinguish cancellation from ordinary failure.
- [ ] Cleanup preserves root signal/error and cannot hang indefinitely.
- [ ] Polling cadence has a maximum latency and no logging storm.
- [ ] Locks/invariants identify safe cancellation points.
- [ ] Framework/executor/scope owner sees the expected terminal state.
- [ ] Context is removed even on cancellation.
- [ ] Metrics distinguish requested, acknowledged, terminated and released.

## Authoritative references

- [`Thread.interrupt`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html#interrupt()>)
- [`InterruptedException`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/InterruptedException.html)
- [`ExecutorService`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
