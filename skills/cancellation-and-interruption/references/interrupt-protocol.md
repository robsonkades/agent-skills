# Interrupt handling by boundary

## Handler patterns

### Propagating API

```java
Result load() throws InterruptedException {
    Resource r = acquire();
    try { return doInterruptibleWork(r); }
    finally { release(r); }
}
```

Cleanup must not erase the original interruption if it also fails; define suppression/reporting.

### `Runnable`/callback unable to declare

```java
public void run() {
    try {
        loop();
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    } finally {
        cleanup();
    }
}
```

Restoration lets an outer owner observe status when one exists. At a terminal thread/task owner,
cleanup and termination can consume the signal deliberately; document it rather than restoring by
ritual.

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
