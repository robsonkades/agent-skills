# The interrupt protocol in practice

## The decision, in one place

```text
Caught InterruptedException
        │
        ├── Can the method signature declare it?  ──► rethrow. Done.
        │
        └── No (Runnable.run, a framework callback, a lambda in a stream)
                  │
                  └── Thread.currentThread().interrupt();   // restore what the throw cleared
                      then return / break / throw a domain exception. Do not continue working.
```

There is no third branch. "Log and continue" is not a branch; it is the loss of the signal.

## Each context, written out

**A library method that blocks.** Declare it and let the caller decide. Cancellation policy
belongs to the caller; a library that decides for them is wrong at every call site.

```java
public Result fetch(Key k) throws InterruptedException {
    return queue.poll(5, TimeUnit.SECONDS);   // propagates; nothing to catch
}
```

**A `Runnable` — where the signature cannot declare it.**

```java
@Override public void run() {
    try {
        process();
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();   // the flag is the only thing left carrying it
        return;                               // and then actually stop
    }
}
```

Restoring the flag without returning is the same bug with extra steps: the executor's
worker thread now carries a stale interrupt into the _next_ task it picks up, which will
then fail at an unrelated blocking call.

**A CPU-bound loop with no blocking call.** Nothing will throw, so the loop must ask.

```java
for (Record r : batch) {
    if (Thread.currentThread().isInterrupted()) {   // isInterrupted: does NOT clear the flag
        throw new CancellationException("batch cancelled after " + done + " records");
    }
    transform(r);
    done++;
}
```

Check granularity is a latency decision: once per record is right for milliseconds of work,
once per 1 000 for microseconds. Never once per batch.

**Cleanup that must not be skipped.** Interruption unwinds through `finally` like any other
exception, so resources release normally — but a `finally` block that itself blocks may be
interrupted again immediately.

```java
} finally {
    boolean wasInterrupted = Thread.interrupted();   // take the flag down for the cleanup
    try {
        drainAndClose();                             // now this blocking call can complete
    } finally {
        if (wasInterrupted) Thread.currentThread().interrupt();   // and put it back
    }
}
```

Use this only for short, bounded cleanup. It is a deliberate suppression window, and an
unbounded one makes the task uncancellable again.

## `interrupted()` versus `isInterrupted()`

| Call                                     | Reads          | Clears  | Use for                                       |
| ---------------------------------------- | -------------- | ------- | --------------------------------------------- |
| `Thread.currentThread().isInterrupted()` | current thread | no      | loop conditions, checks that must not consume |
| `Thread.interrupted()`                   | current thread | **yes** | exactly once, when you are handling it now    |
| `someThread.isInterrupted()`             | another thread | no      | diagnostics only — inherently racy            |

`if (Thread.interrupted()) { /* nothing */ }` silently consumes a cancellation. Grep for
`Thread.interrupted()` and check every result assigns or acts on the value.

## Interruption is how shutdown works

```java
pool.shutdownNow();                       // interrupts every running task
pool.awaitTermination(5, TimeUnit.SECONDS);
```

If tasks swallow the exception, `shutdownNow` becomes a no-op with a reassuring name: the
queue is drained, nothing stops, and a non-daemon worker keeps the JVM alive past the
container's grace period until it is killed. Every swallowed `InterruptedException` in the
codebase is a piece of that failure.

The same applies inside `StructuredTaskScope`: cancellation is delivered as an interrupt to
each subtask, and `close()` waits for all of them. A subtask that ignores interruption turns
a fast failure into a slow one, and the stack trace at that point shows the scope waiting in
`close`, not the culprit — which is why the swallow must be found by review, not by
incident.

## What restoring the flag does _not_ do

- It does not stop the current work. Only your `return` does.
- It does not re-throw at the next blocking call **if that call is uninterruptible** — the
  flag simply stays set, and the cancellation stays undelivered until something interruptible
  is reached.
- It does not propagate to threads this task started. Children are cancelled only by an
  explicit `cancel`, or by a structured scope that owns them.

## Reviewer checklist

- [ ] No `catch (InterruptedException)` whose body only logs
- [ ] Every non-declaring handler restores the flag **and** returns
- [ ] No `Thread.interrupted()` whose result is discarded
- [ ] Long CPU loops check the flag at a granularity matched to the cancellation SLA
- [ ] Blocking cleanup in `finally` is bounded, and any suppression window restores the flag
- [ ] `InterruptedException` never converted into a retry
- [ ] A test cancels the task mid-flight and asserts termination within a bound
