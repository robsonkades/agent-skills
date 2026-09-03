# Lazy initialization state machines

## Decision

Prefer eager initialization when use is common, cost is modest, readiness should fail fast, or
first-request latency matters. Prefer lazy when avoided lifetime cost is material and the owner has
defined first-use concurrency, failure, retry, cancellation and cleanup.

## State model

Do not overload `null` when states matter:

```text
UNINITIALIZED -> INITIALIZING -> READY
                         \-> FAILED(retryable or sticky)
all states -> CLOSING -> CLOSED
```

Specify concurrent callers during initialization, recursive calls, timeout/cancel, creator death,
failure caching/backoff, disposal of losing values, and close racing with create/use.

## Static holder

```java
private static final class Holder {
    static final Resource VALUE = create();
}

static Resource value() { return Holder.VALUE; }
```

Class initialization provides synchronization. Caveats: scope is class loader, initialization
failure is wrapped and effectively sticky for that class initialization, circular initialization
can surprise/deadlock, and first access pays cost.

## Synchronized instance initialization

```java
private Resource value;

synchronized Resource value() {
    if (value == null) value = create();
    return value;
}
```

Correct for one-shot creation if holding this lock during `create` is safe. Prefer a private lock.
Remote/blocking creation needs deadline, interruption, failure/retry and prevention of unrelated
operations queueing behind it.

## Double-checked locking

```java
private volatile Resource value;

Resource value() {
    Resource r = value;
    if (r == null) {
        synchronized (lock) {
            r = value;
            if (r == null) value = r = create();
        }
    }
    return r;
}
```

The volatile publication and second check are load-bearing. Use only when the synchronized hot path
is measured material. Also test exceptions, reentrancy, close and external side effects; the idiom
only solves publication/single assignment.

## Future memoization

A shared future can represent initialization in progress and let callers wait without holding the
state lock. Define whether one caller cancelling cancels shared initialization, whether failures are
cached, how retry atomically replaces a failed future, and how completed resources close. Avoid
common-pool or orphan task ownership by default.

## Duplicate-tolerant CAS

Compute outside a lock and CAS the result only when multiple creation and disposal are safe. “Pure
and idempotent” must include external resources, registration, billing, files and native handles.
Close losing instances and account for thundering-herd cost.

## Validation

- zero, one and many simultaneous first callers;
- creator slow/hangs/throws/is interrupted;
- recursive initialization and callback reentry;
- retryable versus permanent failure;
- caller timeout/cancel while others continue;
- close before/during/after initialization;
- class-loader reload and application redeploy;
- memory/resource leak after losing or failed creation;
- latency/readiness behavior during fleet rollout.

## Authoritative references

- [JLS 12.4.2 class initialization](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4.2)
- [JLS 17.4 memory model](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
- [`Future`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
