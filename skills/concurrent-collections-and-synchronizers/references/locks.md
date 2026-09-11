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
- **"`ReentrantLock` is faster than `synchronized`" is not a portable decision rule.** Lock paths,
  JIT optimizations and contention behavior change across JDKs; biased locking was disabled by
  default in JDK 15 and removed later. Choose on semantics, then measure the deployed workload.
  Monitor cost under contention belongs to lock-inflation.

JEP 491 then endorses JCiP §13.4 directly: "Use `synchronized` where practical, since it is more
convenient and less error prone, and use `ReentrantLock` and the other APIs in
`java.util.concurrent.locks` when more flexibility is required."

| Need                                               | `synchronized`    | `ReentrantLock`   | `RRWL`                          | `StampedLock`             |
| -------------------------------------------------- | ----------------- | ----------------- | ------------------------------- | ------------------------- |
| Reentrant                                          | yes               | yes               | yes                             | **no**                    |
| Auto-release on scope exit or exception            | yes               | no (try/finally)  | no                              | no                        |
| Released if the thread dies abruptly               | yes               | no                | no                              | no                        |
| Timed acquisition                                  | no                | yes               | yes                             | yes                       |
| Interruptible acquisition                          | no                | yes               | yes                             | explicit `*Interruptibly` |
| Poll (`tryLock`)                                   | no                | yes               | yes                             | yes                       |
| Fair ordering option                               | no                | yes               | yes                             | **no**                    |
| Non-block-structured (hand-over-hand)              | no                | yes               | yes                             | yes                       |
| Multiple condition queues                          | no (one wait-set) | yes               | write only                      | **no**                    |
| Concurrent readers                                 | no                | no                | yes                             | yes                       |
| Optimistic read with no CAS at all                 | no                | no                | no                              | yes                       |
| Platform-thread ownable/monitor deadlock detection | yes               | yes               | write ownership, not read holds | **no** (no ownership)     |
| Appears as `jdk.JavaMonitorEnter` in JFR           | yes               | no (`ThreadPark`) | no                              | no                        |

The last two rows matter operationally: lock waits may appear in `jdk.ThreadPark` instead of
monitor-enter events. The blocker depends on fairness mode and implementation, and capture depends
on event settings/thresholds. `ThreadMXBean` deadlock detection covers platform threads, not virtual
threads; absent reports do not exclude read-hold, non-ownable or virtual-thread stalls. Route
runtime evidence collection to concurrency-diagnostics.

## ReentrantLock

```java
import java.util.concurrent.locks.ReentrantLock;

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
  a stress harness, but a finite run is evidence against one implementation bug, not proof of
  deadlock freedom for every caller protocol.

  This illustrates locking, not a complete monetary transfer contract: amount/range invariants
  and overflow policy remain the caller's. The retry loop is interruptible but has no total deadline.

  The method returns `void` on purpose. An earlier `boolean` version guarded the loop with
  `while (!Thread.currentThread().isInterrupted())` and returned `false` at the bottom — but every
  in-loop wait throws `InterruptedException` and clears the flag, so that guard can only be false
  on its first evaluation. An already-interrupted caller then got `false`, indistinguishable from
  "the locks were busy, try again", with the transfer silently not performed. Cancellation must not
  look like contention: throw it, or keep the `boolean` and bound the retries with an attempt
  budget so `false` means "gave up" and nothing else.

- `tryLock(timeout, unit)` — honours fairness and bounds acquisition waiting. For an operation
  deadline, include retries, the body and cleanup in the remaining budget; this call alone does
  not establish an end-to-end SLA.
- `lockInterruptibly()` — allows cancellation during acquisition, which monitor entry does not.
  It does not make the subsequent body interruptible. See cancellation-and-interruption.

Fairness costs throughput: "Programs using fair locks accessed by many threads may display lower
overall throughput (i.e., are slower; often much slower) than those using the default setting, but
have smaller variances in times to obtain locks and guarantee lack of starvation." The AQS javadoc
names the mechanism — default barging is "also known as greedy, renouncement, and convoy-avoidance"
and "Throughput and scalability are generally highest" with it.

Queue-length estimates and `isLocked()` observations cannot replace acquisition. Distinguish them
from `getHoldCount()` and `isHeldByCurrentThread()`: these describe this thread's ownership and can
check a reentrancy/precondition contract. They still do not grant ownership to another thread.

## ReentrantReadWriteLock

- **No preference ordering.** Non-fair (the default) leaves entry order unspecified and "may
  indefinitely postpone one or more reader or writer threads". Fair mode blocks readers when a
  writer is waiting. The non-blocking `tryLock()` on either lock does not honour fairness.
- **Writer starvation** is the headline risk. Non-fair mode mitigates it only heuristically, by
  blocking a new reader when the apparent head of the queue is a waiting writer — "only a
  probabilistic effect", in the implementation's own comment. Symptom: writes land in bursts after
  long stalls, and write p99 sits orders of magnitude above p50.
- **A read-only holder cannot upgrade while retaining its read hold.** Blocking `lock()` can
  wait indefinitely; untimed/timed `tryLock` instead fails or times out, and interruptible
  acquisition can be cancelled. A thread already holding the write lock may reenter it even
  when it also holds a read lock. In a prior blocking-read-upgrade run on 25.0.3, the thread was `WAITING`, its
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
  notion of ownership." There is no `isHeldByCurrentThread`, and a self-reentry is not represented
  as an ownable-lock cycle in standard deadlock detection; corroborate parked stacks and stamps.
- **No fairness policy at all**, and all `try` methods are best-effort.
- **Optimistic reads see torn state.** "Fields read while in optimistic read mode may be wildly
  inconsistent" — so the body may only copy fields into locals, must be side-effect-free, and must
  validate before acting on the result. Traversing mutable state before validating can throw or
  loop on an inconsistent structure; only perform speculative reads known to be safe even if the
  validation subsequently fails.
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

The contract is safe speculative reads, validation, fallback and release of any acquired stamp;
equivalent code is valid. If the data cannot be read safely before validation, choose a real read
lock or another representation. Virtual-thread parking does not improve fairness or
diagnosability. Evaluate it for small, hot in-memory structures with a stable field layout and
measured optimistic-read success; compare with immutable snapshots and a plain lock.

## AbstractQueuedSynchronizer, last

AQS provides "a framework for implementing blocking locks and related synchronizers … that rely on
first-in-first-out (FIFO) wait queues", around "a single atomic `int` value to represent state".
You redefine `tryAcquire`, `tryRelease`, `tryAcquireShared`, `tryReleaseShared` and
`isHeldExclusively` using `getState`, `setState` and `compareAndSetState`; the framework supplies
the acquisition/queueing algorithms. Those hooks "must be internally thread-safe, and should in general be short and not
block". Subclasses "should be defined as non-public internal helper classes" — AQS is composed
into a synchronizer, never exposed as one. `AbstractQueuedLongSynchronizer` is the same framework
with a `long` state, which is what `ReentrantReadWriteLock` moved to in JDK 25.

First compare the relevant existing primitive. `ReentrantLock` plus one
`Condition` per predicate covers many application-level state machines with clearer ownership. AQS
is justified for a reusable blocking synchronizer with a novel acquisition/release state machine,
where the needed timeout, interruption and shared or exclusive admission justify owning the
protocol and its maintenance burden.

Document the state-word encoding and acquisition/release invariants. For an exclusively owned
lock, maintain `setExclusiveOwnerThread` on acquisition/release to support diagnostics; do not
invent a single owner for a shared or semaphore-style protocol. Test cancellation, timeout,
over-release, failure cleanup and progress with bounded controls; add jcstress when memory-ordering
or interleaving claims require it. Correct owner reporting is useful evidence, not universal
deadlock detection.

## Authoritative references

- [Java 25 `Lock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/Lock.html)
- [Java 25 `ReentrantLock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [Java 25 `ReentrantReadWriteLock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantReadWriteLock.html)
- [Java 25 `StampedLock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/StampedLock.html)
- [Java 25 `ThreadMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadMXBean.html)
- [Java 25 `AbstractQueuedSynchronizer`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/AbstractQueuedSynchronizer.html)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
