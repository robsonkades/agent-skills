# Explicit locks

Complete classes here compile against JDK 25, `java.base` only, no external dependencies; shorter
fragments are method bodies in that same setting.

## Choose on capability, not on pinning

JEP 491 (JDK 24) made virtual threads acquire, hold and release monitors independently of their
carriers: "Blocking to acquire a monitor will unmount a virtual thread and release its carrier",
and `Object.wait()` and its timed variants do the same. It settles the argument in its own words:
"Once the `synchronized` keyword no longer pins virtual threads, you can choose between
`synchronized` and the APIs in the `java.util.concurrent.locks` package **based solely upon which
best solves the problem at hand.**"

Two consequences for the _choice_ — the diagnosis of pinning, and what to use now that
`-Djdk.tracePinnedThreads` is gone, belong to virtual-threads-internals:

- **Migrating `synchronized` to `ReentrantLock` for pinning is no longer necessary** on JDK 24+.
  JEP 491: "such migration will no longer be necessary. You need not revert code that has been
  migrated to use `ReentrantLock` back to using `synchronized`." A migration done now buys nothing
  and costs new `try`/`finally` bugs. Pinning is therefore not an input to this decision at all.
- **"`ReentrantLock` is faster than `synchronized`" is stale.** It came from Java 5-era numbers;
  Java 6 closed most of the gap, and biased locking — which made _uncontended_ `synchronized`
  nearly free — was disabled by default in JDK 15 (JEP 374) and removed in JDK 18 (JDK-8256425).
  Uncontended `synchronized` now costs a CAS, which is what `ReentrantLock` always cost, so the
  performance argument moved toward parity, not away. Monitor cost under contention belongs to
  lock-inflation.

JEP 491 then endorses JCiP §13.4 directly: "Use `synchronized` where practical, since it is more
convenient and less error prone, and use `ReentrantLock` and the other APIs in
`java.util.concurrent.locks` when more flexibility is required."

| Need                                     | `synchronized`    | `ReentrantLock`   | `RRWL`     | `StampedLock`             |
| ---------------------------------------- | ----------------- | ----------------- | ---------- | ------------------------- |
| Reentrant                                | yes               | yes               | yes        | **no**                    |
| Auto-release on scope exit or exception  | yes               | no (try/finally)  | no         | no                        |
| Released if the thread dies abruptly     | yes               | no                | no         | no                        |
| Timed acquisition                        | no                | yes               | yes        | yes                       |
| Interruptible acquisition                | no                | yes               | yes        | explicit `*Interruptibly` |
| Poll (`tryLock`)                         | no                | yes               | yes        | yes                       |
| Fair ordering option                     | no                | yes               | yes        | **no**                    |
| Non-block-structured (hand-over-hand)    | no                | yes               | yes        | yes                       |
| Multiple condition queues                | no (one wait-set) | yes               | write only | **no**                    |
| Concurrent readers                       | no                | no                | yes        | yes                       |
| Optimistic read with no CAS at all       | no                | no                | no         | yes                       |
| Visible to `jstack` deadlock detection   | yes               | yes (AQS-aware)   | yes        | **no** (no ownership)     |
| Appears as `jdk.JavaMonitorEnter` in JFR | yes               | no (`ThreadPark`) | no         | no                        |

The last two rows matter operationally: after a migration to `ReentrantLock`, contention stops
appearing in monitor events and shows up as `jdk.ThreadPark` with
`parkedClass = ReentrantLock$NonfairSync`. Teams that keep watching only monitor events conclude
the contention disappeared.

## ReentrantLock

```java
final class X {
    private final ReentrantLock lock = new ReentrantLock();

    public void m() {
        lock.lock();          // lock() as the last statement before the try block
        try {
            // ... method body
        } finally {
            lock.unlock();    // unlock() as the first statement in the finally block
        }
    }
}
```

Those two comments are the javadoc's own, added in JDK 23 by JDK-8278255, whose text explains why
with unusual precision: "The call to `lock()` should occur _immediately before_ the beginning of
the try block (but not inside of it), with no intervening statements or expressions … The danger
here is that somebody might put in an apparently innocuous statement (such as logging a message)
that, if it were to throw an exception, would violate the locking invariants."

The same issue flags the pre-23 `ReentrantReadWriteLock` sample for the same reason: refactoring a
`cacheValid` field read into an `isCacheValid()` call introduces a throw site between the
acquisition and the `try`.

Symptom of violating it: a permanently held lock. The dump shows N threads blocked in
`AbstractQueuedSynchronizer.acquire` on one lock object while the _owner_ is doing something
unrelated, or has died — unlike a monitor, a `ReentrantLock` is **not** released when the holding
thread dies or the stack unwinds. That is precisely the trade-off.

Which acquisition form:

- `tryLock()` — non-blocking, **ignores fairness** (barges). Correct for lock-ordering deadlock
  avoidance and for "skip the work if someone else is already doing it" idempotence guards. It is
  the one form whose release is conditional, so it needs its own shape:

  ```java
  import java.util.concurrent.ThreadLocalRandom;
  import java.util.concurrent.TimeUnit;
  import java.util.concurrent.locks.ReentrantLock;

  final class Account {
      final ReentrantLock lock = new ReentrantLock();
      long balance;

      static void transfer(Account a, Account b, long amount) throws InterruptedException {
          for (;;) {
              if (Thread.interrupted()) throw new InterruptedException();   // one cancel seam
              if (a.lock.tryLock(50, TimeUnit.MILLISECONDS)) {   // timed: honours fairness
                  try {
                      if (b.lock.tryLock()) {                    // untimed: barges, by design
                          try {
                              a.balance -= amount;
                              b.balance += amount;
                              return;
                          } finally { b.lock.unlock(); }
                      }
                  } finally { a.lock.unlock(); }                 // released before every retry
              }
              Thread.sleep(ThreadLocalRandom.current().nextInt(10));   // break the lockstep
          }
      }
  }
  ```

  Both `unlock()` calls are the first statement of their `finally`, and A is released before the
  retry — that release is what makes the ordering deadlock impossible. Stress-tested on 25.0.3 with
  six threads making 2000 opposed transfers each: no deadlock, and the total is preserved.

  The method returns `void` on purpose. An earlier `boolean` version guarded the loop with
  `while (!Thread.currentThread().isInterrupted())` and returned `false` at the bottom — but every
  in-loop wait throws `InterruptedException` and clears the flag, so that guard can only be false
  on its first evaluation. An already-interrupted caller then got `false`, indistinguishable from
  "the locks were busy, try again", with the transfer silently not performed. Cancellation must not
  look like contention: throw it, or keep the `boolean` and bound the retries with an attempt
  budget so `false` means "gave up" and nothing else.

- `tryLock(timeout, unit)` — honours fairness, responds to interruption, carries a deadline. The
  right choice in a request path with an SLA.
- `lockInterruptibly()` — blocks but stays cancellable. **This is the single capability with no
  `synchronized` equivalent**, and it is why a task that must be cancellable cannot use
  `synchronized` for a contended lock. See cancellation-and-interruption.

Fairness costs throughput: "Programs using fair locks accessed by many threads may display lower
overall throughput (i.e., are slower; often much slower) than those using the default setting, but
have smaller variances in times to obtain locks and guarantee lack of starvation." The AQS javadoc
names the mechanism — default barging is "also known as greedy, renouncement, and convoy-avoidance"
and "Throughput and scalability are generally highest" with it.

`getQueueLength()`, `hasQueuedThreads()`, `isLocked()` and `getHoldCount()` exist for monitoring.
The javadocs say so explicitly: they are "designed for monitoring system state, not for
synchronization control". A gauge, never an `if`.

## ReentrantReadWriteLock

- **No preference ordering.** Non-fair (the default) leaves entry order unspecified and "may
  indefinitely postpone one or more reader or writer threads". Fair mode blocks readers when a
  writer is waiting. The non-blocking `tryLock()` on either lock does not honour fairness.
- **Writer starvation** is the headline risk. Non-fair mode mitigates it only heuristically, by
  blocking a new reader when the apparent head of the queue is a waiting writer — "only a
  probabilistic effect", in the implementation's own comment. Symptom: writes land in bursts after
  long stalls, and write p99 sits orders of magnitude above p50.
- **Upgrade is impossible, downgrade is legal.** "If a reader tries to acquire the write lock it
  will never succeed." That is literal: the thread deadlocks against _itself_, forever, while
  holding a read lock of the same object. Run on 25.0.3, the thread is `WAITING`, its
  `LockInfo` names `ReentrantReadWriteLock$NonfairSync` (or `$FairSync` — not the abstract `$Sync`,
  which is what a runbook usually greps for), `lockOwner` is `null`, and both
  `findDeadlockedThreads()` and `findMonitorDeadlockedThreads()` return `null`.
- **Conditions**: the write lock provides one; `readLock().newCondition()` throws
  `UnsupportedOperationException`.

The legal direction:

```java
rwl.writeLock().lock();
try {
    mutate();
    rwl.readLock().lock();            // acquire read while still holding write
} finally {
    rwl.writeLock().unlock();          // then drop write: now a reader
}
try {
    return read();
} finally {
    rwl.readLock().unlock();
}
```

**Version delta.** Through JDK 24 the `Sync` extended `AbstractQueuedSynchronizer` with an `int`
state split 16/16, so the maximum was `(1 << 16) - 1 = 65535` readers (or hold counts), and
exceeding it threw `Error("Maximum lock count exceeded")` — reachable with a million virtual
threads. In **JDK 25** `Sync` extends `AbstractQueuedLongSynchronizer` with a 32-bit shift and
`MAX_COUNT = Integer.MAX_VALUE` (JDK-8352971, JDK-8354016). So "RRWL supports at most 65535
concurrent readers" is **true on JDK 21 and false on JDK 25**.

**Is it worth it at all?** Doug Lea's javadoc frames it as a scalability win when reads dominate;
a large body of practitioner experience finds that for _short_ read sections the reader-side CAS on
one shared state word makes it slower than a plain `ReentrantLock`, because readers now contend on
a cache line they never previously touched. No primary source settles this and no crossover
threshold is published. Measure against a plain mutex first, and against a `volatile` reference to
an immutable snapshot, which often removes the lock entirely.

## StampedLock

Three modes: writing (`writeLock()` / `unlockWrite(stamp)`), reading (`readLock()` /
`unlockRead(stamp)`), and optimistic reading (`tryOptimisticRead()`, non-zero only if not
write-locked, then `validate(stamp)`).

Every constraint is a footgun:

- **Not reentrant.** "locked bodies should not call other unknown methods that may try to
  re-acquire locks." A recursive `writeLock()` self-deadlocks.
- **No `Condition` support.** `asReadLock()` / `asWriteLock()` return `Lock` views whose
  `newCondition()` throws.
- **No ownership.** "Like `Semaphore`, but unlike most `Lock` implementations, StampedLocks have no
  notion of ownership." No `isHeldByCurrentThread`, and — critically — **no deadlock detection**:
  `jstack` and `ThreadMXBean` report nothing. A self-reentry deadlock looks exactly like a slow
  operation.
- **No fairness policy at all**, and all `try` methods are best-effort.
- **Optimistic reads see torn state.** "Fields read while in optimistic read mode may be wildly
  inconsistent" — so the body may only copy fields into locals, must be side-effect-free, and must
  validate before using anything. Dereferencing an object read optimistically before validating
  yields an NPE, an `ArrayIndexOutOfBoundsException`, or a spin on a torn linked structure.
- **Stamps recycle** after no sooner than a year of continuous operation and "a valid stamp may be
  guessable" — never a capability token across a trust boundary. Deserialization always yields an
  unlocked state.

The canonical idiom, from the javadoc:

```java
double distanceFromOrigin() {
    long stamp = sl.tryOptimisticRead();
    try {
        retryHoldingLock: for (;; stamp = sl.readLock()) {
            if (stamp == 0L) continue retryHoldingLock;
            double currentX = x;                       // only reads into locals
            double currentY = y;
            if (!sl.validate(stamp)) continue retryHoldingLock;
            return Math.hypot(currentX, currentY);
        }
    } finally {
        if (StampedLock.isReadLockStamp(stamp)) sl.unlockRead(stamp);
    }
}
```

The verbosity is the point: if your read section cannot be written in this shape, `StampedLock` is
not the tool. Under virtual threads it parks via `LockSupport` and unmounts, which makes a
self-deadlock _cheaper to create_ — you can have a million — and no easier to see. A secondary but
credible source (Heinz Kabutz, JavaSpecialists 321) demonstrates writer starvation where
`ReentrantReadWriteLock` shows none, worsened by the ability to hold far more than 65535 concurrent
readers; the magnitude is one author's harness and unverified, the direction is consistent with the
absent fairness policy. JDK-8345052 "Harden StampedLock" landed in JDK 24. Treat it as the least
mature of the three, appropriate for small hot in-memory structures with a stable field layout — a
point, a rectangle, a rate limiter's counters — and rarely for application code.

## AbstractQueuedSynchronizer, last

AQS provides "a framework for implementing blocking locks and related synchronizers … that rely on
first-in-first-out (FIFO) wait queues", around "a single atomic `int` value to represent state".
You redefine `tryAcquire`, `tryRelease`, `tryAcquireShared`, `tryReleaseShared` and
`isHeldExclusively` using `getState`, `setState` and `compareAndSetState`; every other method is
final. Those methods "must be internally thread-safe, and should in general be short and not
block". Subclasses "should be defined as non-public internal helper classes" — AQS is composed
into a synchronizer, never exposed as one. `AbstractQueuedLongSynchronizer` is the same framework
with a `long` state, which is what `ReentrantReadWriteLock` moved to in JDK 25.

The skill body carries the ladder to walk down before allowing one. The rung that matters most is
**`ReentrantLock` + one `Condition` per predicate**: it covers essentially every
state-dependent class an application will ever need. It is more code than AQS with two overrides,
but it is readable code with known failure modes. The only shape that genuinely justifies AQS is a
_blocking_ synchronizer with a _novel_ acquisition predicate needing timeouts, interruption and
queue instrumentation, in a hot path where the allocation of a `ReentrantLock` plus a `Condition`
per instance actually shows up in a profile.

Two obligations if you do write one. Call `setExclusiveOwnerThread` — the setter is inherited from
`AbstractOwnableSynchronizer`, and it is `AbstractQueuedSynchronizer`'s own class javadoc that
urges it: "You are encouraged to use them — this enables monitoring and diagnostic tools to assist
users in determining which threads hold locks." Skip it and your lock is invisible to thread-dump
deadlock analysis. And review it with a jcstress test and a documented state-word encoding, because
the cost of getting AQS wrong is not a wrong answer — it is a permanently parked thread with no
exception and no log line.
