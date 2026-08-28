# Synchronizers and conditions

Complete classes here compile against JDK 25, `java.base` only, no external dependencies; shorter
fragments are method bodies in that same setting.

## Latch vs barrier vs phaser

|                  | Parties               | Reusable | Dynamic | Interruptible wait                                        | Action on trip                          |
| ---------------- | --------------------- | -------- | ------- | --------------------------------------------------------- | --------------------------------------- |
| `CountDownLatch` | fixed at construction | **no**   | no      | yes (`await`)                                             | none                                    |
| `CyclicBarrier`  | fixed at construction | yes      | no      | yes                                                       | a `Runnable` barrier action             |
| `Phaser`         | dynamic, ≤ 65535      | yes      | **yes** | `awaitAdvance` is **not**; `awaitAdvanceInterruptibly` is | overridable `onAdvance(phase, parties)` |

### CountDownLatch — a gate, not a rendezvous

"This is a one-shot phenomenon — the count cannot be reset." And: it "doesn't require that threads
calling `countDown` wait for the count to reach zero before proceeding" — nobody meets, one side
signals and the other side learns.

Failure modes:

- **`countDown()` not in a `finally`** — a worker that throws leaves the coordinator blocked in
  `await()` forever. This is the most common latch bug. The dump shows one thread parked in
  `CountDownLatch$Sync` / `AbstractQueuedSynchronizer.acquireSharedInterruptibly`, no progress, no
  error in the log, and a restart appears to fix it.
- **`await()` with no timeout in a request path** — an unbounded hang. Use
  `await(timeout, unit)` and check the returned `boolean`.
- **A count derived from a collection that can change** — it never reaches zero, or reaches it
  early.
- **Swallowing `InterruptedException`** (as the javadoc's own `Worker` sample does). See
  cancellation-and-interruption.

```java
CountDownLatch done = new CountDownLatch(tasks.size());   // size read once, before any submit
for (Runnable t : tasks) {
    executor.execute(() -> {
        try { t.run(); }
        finally { done.countDown(); }                     // first statement of finally
    });
}
if (!done.await(30, TimeUnit.SECONDS)) {                  // bounded, and the result is used
    throw new TimeoutException("workers did not finish");
}
```

In new code most latch usage is better expressed with `StructuredTaskScope` — see
structured-concurrency.

### CyclicBarrier — reusable, with all-or-none breakage

Reusable after the waiting threads are released. The optional `Runnable` runs once per barrier
point, "after the last thread in the party arrives, but before any threads are released", so it is
where shared state is updated between phases. `await()` returns the arrival index, which gives the
`if (barrier.await() == 0) { … }` idiom for electing one thread.

**Breakage is all-or-none:** if any thread leaves the barrier point early through interruption,
failure or timeout, every other waiting thread leaves abnormally with `BrokenBarrierException`.

Failure modes:

- **Party-count mismatch** — `new CyclicBarrier(N)` with N−1 live threads parks every one of them
  forever. The dump shows all workers in `CyclicBarrier.dowait`, zero CPU, no error.
- **A barrier action that throws** propagates to the triggering thread _and_ breaks the barrier for
  everyone.
- **Treating `BrokenBarrierException` as retryable** — once broken it stays broken until `reset()`,
  and the javadoc warns that resets after a breakage "can be complicated to carry out … It may be
  preferable to instead create a new barrier for subsequent use". A retry loop without that spins
  hot, failing instantly every phase.

### Phaser — only when parties genuinely join and leave

Registration can change at any time (`register()`, `bulkRegister(int)`, `arriveAndDeregister()`),
and "tasks cannot query whether they are registered". Arrival and waiting are separate: `arrive()`
and `arriveAndDeregister()` **do not block** and return a phase number;
`arriveAndAwaitAdvance()` is the `CyclicBarrier.await` analogue. `awaitAdvance` keeps waiting even
if the thread is interrupted — use `awaitAdvanceInterruptibly` when that matters.

Termination is signalled by a **negative return value** from the synchronization methods; the
default `onAdvance` terminates when deregistration drops registered parties to zero. The phase
number wraps to zero after `Integer.MAX_VALUE`. The implementation restricts parties to **65535**
and throws `IllegalStateException` beyond it — reachable with virtual threads, and the documented
answer is tiering phasers into a tree.

Failure modes: no `arriveAndDeregister()` in a `finally` (the phase never advances — the same shape
as a missing `countDown`); ignoring the negative return from `arriveAndAwaitAdvance()`, so
"terminated" is read as "advanced" and the loop exits silently early; and using
`getRegisteredParties()`/`getArrivedParties()` for control flow, when the javadoc says the values
"may reflect transient states and so are not in general useful for synchronization control".

Otherwise a `Phaser` is a strictly more complex `CyclicBarrier`.

## Semaphore

**Fairness.** Non-fair permits **barging**: a thread invoking `acquire()` can be allocated a permit
ahead of one already waiting. The javadoc's guidance, quoted rather than rationalised: "Generally,
semaphores used to control resource access should be initialized as fair, to ensure that no thread
is starved out from accessing a resource. When using semaphores for other kinds of synchronization
control, the throughput advantages of non-fair ordering often outweigh fairness considerations."
That is the opposite default from `ReentrantLock`'s javadoc, and neither page explains the
difference. Whether _your_ limit should be fair is a sizing question about hold-time variance and
tail latency — concurrency-limiting-and-bulkheads owns it; do not port one page's default to the
other primitive on the strength of the wording alone.

**The untimed `tryAcquire()` does not honour fairness** — it takes any available permit whether or
not others are waiting. The javadoc names the fix: "If you want to honor the fairness setting, then
use `tryAcquire(0, TimeUnit.SECONDS)` which is almost equivalent (it also detects interruption)."
Proved deterministically on 25.0.3, with one permit free and one thread already queued:

```
fair=true  available=1 queued=1 -> tryAcquire()=true, tryAcquire(0,SECONDS)=false
fair=false available=1 queued=1 -> tryAcquire()=true, tryAcquire(0,SECONDS)=true
```

**No ownership.** "There is no requirement that a thread that releases a permit must have acquired
that permit by calling `acquire()`. Correct usage of a semaphore is established by programming
convention in the application." That makes a binary semaphore releasable by a non-owner — useful
for deadlock recovery, and the reason for the two failure shapes below.

1. **Leak on the exception path — permits vanish.**

   ```java
   sem.acquire();
   doWork();          // throws
   sem.release();     // never reached
   ```

   Throughput decays _monotonically over days_, in steps, and never recovers without a restart;
   `availablePermits()` trends to 0; threads pile up parked in `Semaphore$NonfairSync`. The classic
   "fine after a restart, degrades over a week" ticket. Fix: `acquire()` immediately before `try`,
   `release()` as the first statement of `finally`.

2. **Over-release — permits multiply.** A double `release()`, or a `release()` on an error path
   that also ran normally, _silently raises the limit_. You observe 12 in-flight calls against a
   semaphore of 8 and nothing anywhere reports it. Fix: a boolean `acquired` flag or a single
   well-defined release site, plus `assert availablePermits() <= configured`.

3. **Interruption.** `acquire()` throws `InterruptedException` _without_ taking a permit, which is
   correct. `acquireUninterruptibly()` does not throw — combined with a leaked permit it produces a
   thread that can never be shut down.

```java
if (!sem.tryAcquire(200, TimeUnit.MILLISECONDS)) {   // honours fairness, bounded, interruptible
    return Response.shedLoad();
}
try {
    return callDownstream();
} finally {
    sem.release();                                    // exactly one release site
}
```

`reducePermits(int)` is `protected` and is the correct primitive for shrinking a limit;
`drainPermits()` is the sledgehammer. Bulkhead framing belongs to
concurrency-limiting-and-bulkheads.

## Exchanger

"A synchronization point at which threads can pair and swap elements within pairs … An `Exchanger`
may be viewed as a bidirectional form of a `SynchronousQueue`." The canonical use is
double-buffering: the filler swaps a full buffer for an empty one.

It pairs exactly **two** threads, `exchange(v)` blocks indefinitely without a partner, and
`exchange(v, timeout, unit)` throws `TimeoutException`. With virtual threads and a capacity-1
queue the same pipeline is usually more legible. (Pre-JDK 24 it also spun in ways hostile to
virtual threads — JDK-8338146, fix version 24.)

## The Condition protocol

`Condition` "factors out the `Object` monitor methods (`wait`, `notify` and `notifyAll`) into
distinct objects to give the effect of having multiple wait-sets per object". Obtain one with
`lock.newCondition()`. Awaiting "atomically releases the associated lock and suspends the current
thread".

### The `while` loop is mandatory — three independent reasons

1. **Spurious wakeup**, permitted as a concession to platform semantics.
2. **`signalAll` wakes every waiter** but only one can make the predicate true.
3. **Barging**: between the signal and the waiter re-acquiring the lock, a third thread can acquire
   the lock and invalidate the predicate. This one is _guaranteed_ by the non-fair lock policy, not
   a rare event — which is why `if` is wrong even on a hypothetical platform with no spurious
   wakeups.

Symptom of an `if`: a bounded buffer that occasionally overwrites an element or returns a stale
one; an `ArrayIndexOutOfBoundsException` or a negative count, appearing only under load.

### `signal` vs `signalAll`

`signal()` is safe only when all three hold: every thread waiting on _this_ condition waits for the
_same_ predicate; a single state change enables exactly one waiter; and a woken waiter that cannot
proceed signals onward. If waiters on one condition await different predicates, `signal()` can wake
the wrong one and the right one sleeps forever — a **lost wakeup**, permanent and silent, and the
hardest bug here to diagnose because every thread looks normally parked.

That is why multiple `Condition`s on one `Lock` is the design, not an optimisation. With
`Object.wait`/`notify` there is exactly **one** wait-set per object, so `notifyAll()` is the only
safe choice in almost all cases — the strongest reason to prefer `Lock` + `Condition` for any
non-trivial state-dependent class.

### The bounded buffer, and why not to write it

```java
import java.util.concurrent.locks.*;

final class BoundedBuffer<E> {
    private final Lock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();     // one condition per predicate
    private final Condition notEmpty = lock.newCondition();
    private final Object[] items = new Object[100];
    private int putptr, takeptr, count;

    public void put(E x) throws InterruptedException {
        lock.lock();
        try {
            while (count == items.length) notFull.await();     // while, never if
            items[putptr] = x;
            if (++putptr == items.length) putptr = 0;
            ++count;
            notEmpty.signal();                                 // uniform waiters, one-in/one-out
        } finally { lock.unlock(); }
    }

    @SuppressWarnings("unchecked")
    public E take() throws InterruptedException {
        lock.lock();
        try {
            while (count == 0) notEmpty.await();
            E x = (E) items[takeptr];
            if (++takeptr == items.length) takeptr = 0;
            --count;
            notFull.signal();
            return x;
        } finally { lock.unlock(); }
    }
}
```

This is the `Condition` javadoc's own sample, and it ends with the strongest possible statement of
"do not write this": "(The `ArrayBlockingQueue` class provides this functionality, so there is no
reason to implement this sample usage class.)" Read it as the shape to copy when your predicate is
genuinely novel — and reach for `ArrayBlockingQueue` when it is not.

### Timeout arithmetic

`awaitNanos` takes nanoseconds specifically so that re-waits do not accumulate truncation error; it
returns "an estimate of the number of nanoseconds remaining to wait", or ≤ 0 if it timed out. The
canonical loop:

```java
boolean aMethod(long timeout, TimeUnit unit) throws InterruptedException {
    long nanosRemaining = unit.toNanos(timeout);
    lock.lock();
    try {
        while (!conditionBeingWaitedFor()) {
            if (nanosRemaining <= 0L) return false;
            nanosRemaining = theCondition.awaitNanos(nanosRemaining);   // carry the remainder
        }
        return true;
    } finally { lock.unlock(); }
}
```

The bug this prevents is re-passing the _original_ timeout inside the loop: with N wakeups the
total wait becomes N × timeout, an unbounded wait dressed as a bounded one. The symptom is a
"5-second timeout" that occasionally takes minutes and never reports a timeout. `await(time, unit)`
returns `false` on timeout but gives no remaining time, so it cannot be used correctly in a re-wait
loop — `awaitNanos` exists precisely for that.

`awaitUninterruptibly()` is correct only in code that genuinely cannot be cancelled, usually a
cleanup path. In a request path it produces a thread that ignores shutdown: the JVM will not exit
and `shutdownNow()` does nothing.

Two further contract points. The three waiting forms (interruptible, non-interruptible, timed) are
not required to give identical guarantees, and an implementation "can favor responding to an
interrupt over normal method return" — so an `InterruptedException` does **not** prove the
condition was not signalled. And a `Condition` is an ordinary object: `synchronized (cond) {
cond.wait(); }` compiles, runs, and has no specified relationship with the associated `Lock`. The
javadoc recommends never using a `Condition` that way.
