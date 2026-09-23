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

All snippets are partial Java 25 examples requiring an application Resource/create factory.
Assume create returns a non-null value; successful publication does not make the resource's later
mutable operations thread-safe or define its ownership/close policy.

```java
private static final class Holder {
    static final Resource VALUE = create();
}

static Resource value() { return Holder.VALUE; }
```

Class initialization provides synchronization. Caveats: scope is class loader, a non-Error failure
is wrapped in ExceptionInInitializerError while an Error propagates directly; subsequent active use
of the erroneous class fails with NoClassDefFoundError. Circular initialization
can surprise/deadlock, and first access pays cost.

## Synchronized instance initialization

```java
private Resource value;

synchronized Resource value() {
    if (value == null) value = create();
    return value;
}
```

Serializes creation if holding this lock during `create` is safe and creation is non-reentrant.
Returning null or throwing leaves the field unset, so later calls retry; this is not exactly-once
external execution. Use explicit states for cached failure, nullable results or recursion rejection.
Prefer a private lock unless callers rely on this monitor as a documented external protocol.
Remote/blocking creation needs deadline, interruption, failure/retry and prevention of unrelated
operations queueing behind it.

## Double-checked locking

Requires a non-null, non-reentrant factory: `create()` must not call this accessor directly or
through callbacks before returning. As with synchronized initialization, a monitor permits the
same thread to reenter; a recursive call can see `null`, create a second resource and have its result
overwritten by the outer call. If reentry cannot be excluded, use explicit `INITIALIZING` state and
creator identity under the lock to reject recursive access; the creator must not wait on its own
unfinished initialization.

```java
private volatile Resource value;
private final Object lock = new Object();

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
is measured material. Under these preconditions the idiom publishes one successful initialization
while the value is not reset. Failure can still lead to retries, so it does not guarantee exactly-once
external effects. Test exceptions, callback reentry, close and cleanup separately; define reset/retry
and lifecycle transitions explicitly if they are supported.

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
- [JLS 17.1 monitor reentrancy](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.1)
- [`Future`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
