# Lock scope, alien calls and deadlock

## The alien method rule

An **alien method** is any method whose implementation you do not control from inside the
lock: an overridable method of your own class, a listener or callback supplied by a caller, a
`Comparator`/`Function`/`Consumer` passed in, a method on an object you were handed, or
anything reached through an interface. Calling one while holding a lock is the standard
deadlock and liveness bug, because the alien code may:

- acquire another lock, creating a cycle with a thread that holds them in the other order;
- call back into your object, re-entering a `synchronized` method while your invariant is
  broken — re-entrancy makes this compile, run, and corrupt state silently;
- block on I/O, a queue, or a future, holding your lock for the duration;
- throw, leaving the lock released but the state partially updated (see failure atomicity in
  java-exception-design);
- run for an unbounded time, turning your critical section into a throughput ceiling.

```java
// Broken: notifies while holding the lock
public void add(Session s) {
    synchronized (lock) {
        sessions.put(s.id(), s);
        for (Listener l : listeners) l.onAdded(s);      // alien: may block, deadlock, re-enter
    }
}

// Correct: mutate under the lock, publish outside it
public void add(Session s) {
    synchronized (lock) {
        sessions.put(s.id(), s);
    }
    for (Listener l : listeners) l.onAdded(s);          // listeners is a CopyOnWriteArrayList
}
```

The general shape is _snapshot inside, act outside_: copy the little you need while holding the
lock, release, then do the work. `CopyOnWriteArrayList` for listener lists exists because it
makes the iteration safe with no lock at all.

Also on this list: **`Object.wait`/`await` inside a lock is fine and intended**; a `sleep`
inside one never is; and logging inside a critical section is an alien call whenever the
appender can block (a network appender, a full async queue).

## Sizing the critical section

Two failure directions, and they are not symmetric:

- **Too large** — I/O, remote calls, alien methods, whole request handlers under one lock.
  Costs throughput, invites deadlock, and hides which invariant is actually being protected.
- **Too small** — splitting one invariant across two critical sections. `synchronized` on each
  of two setters does not make "these two fields always agree" true; a reader can observe the
  state between them.

The rule that resolves both: **the critical section is exactly the invariant**. Everything that
must be observed together is updated together, and nothing else is inside.

```java
synchronized (lock) {
    if (balance.isLessThan(amount)) throw new InsufficientFunds(id);
    balance = balance.minus(amount);          // check and mutation are one invariant:
    entries.add(Entry.debit(amount));         // they belong in one section
}
publisher.publish(new Debited(id, amount));   // outside: I/O, alien, and not part of the invariant
```

## Deadlock by design review

Deadlock needs a cycle in the lock-acquisition graph. Two prevention strategies, in order:

1. **Hold one lock at a time.** Restructure so a method never acquires a second lock while
   holding the first. This is almost always possible and removes the class of bug.
2. **Impose a global order** when two locks genuinely must be held, and document it. The order
   must be derivable without knowing the runtime values — a class-level ordering, or the
   comparison of a stable id, never "whichever came first".

```java
// Two accounts, ordered by a stable id so every thread acquires in the same sequence
private static void transfer(Account from, Account to, Money amount) {
    Account first  = from.id().compareTo(to.id()) < 0 ? from : to;
    Account second = first == from ? to : from;
    synchronized (first.lock()) {
        synchronized (second.lock()) { ... }
    }
}
```

Note the residual case that ordering does not fix: equal ids (the same account twice) — check
for it explicitly.

Other shapes that produce cycles without two visible `synchronized` blocks:

- **A lock plus a bounded queue.** Holding a lock while putting into a full queue whose consumer
  needs the same lock.
- **A lock plus a thread pool.** Submitting to a pool and waiting for the result while holding a
  lock the pool's tasks also need — a thread-starvation deadlock, which is not detected by JVM
  deadlock detection because no monitor cycle exists (concurrency-diagnostics).
- **Class initialisation.** Two classes whose static initialisers reference each other from
  different threads deadlock on class-init locks, and the thread dump is unusually cryptic.
- **Re-entrant callbacks** as described above: one thread, one lock, and an invariant observed
  mid-update — a correctness bug rather than a hang, which makes it harder to find.

`ReentrantLock.tryLock(timeout)` is a mitigation for lock ordering that cannot be imposed —
acquire what you can, back off and retry — and it belongs in code that can genuinely retry the
whole operation, not as a way to avoid thinking about the order.

## Choosing the mechanism

| Situation                                         | Use                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| State used by one thread/request                  | confinement — no synchronisation                                        |
| Shared, never changes after construction          | immutability + final fields                                             |
| One variable, simple updates                      | `AtomicLong`/`AtomicReference` with `compareAndSet`/`updateAndGet`      |
| Hot counter, reads rare                           | `LongAdder`                                                             |
| Map with compound operations                      | `ConcurrentHashMap` + `compute`/`merge`/`putIfAbsent`                   |
| Read-dominated list (listeners)                   | `CopyOnWriteArrayList`                                                  |
| Producer/consumer hand-off                        | `BlockingQueue` (bounded)                                               |
| Coordination between phases                       | `CountDownLatch`, `CyclicBarrier`, `Phaser`                             |
| Bounding concurrent access to a resource          | `Semaphore` (concurrency-limiting-and-bulkheads)                        |
| An invariant spanning several fields              | a private lock (`synchronized` or `ReentrantLock`)                      |
| Needs timed/interruptible acquisition or fairness | `ReentrantLock` explicitly                                              |
| Read-mostly with expensive reads                  | `StampedLock` optimistic read — advanced, non-reentrant, easy to misuse |
| Cross-JVM exclusion                               | a lease or an election — not any of the above                           |

Two notes on the tail of that table: `StampedLock` is not reentrant and its optimistic mode
requires validating the stamp and retrying, so it is a measured optimisation rather than a
default; and `ReadWriteLock` only pays off when reads genuinely dominate and are long — for
short reads its bookkeeping costs more than a plain lock.

## Contention, and what to do about it

A correct lock can still be the bottleneck. In order:

1. **Reduce the scope** — is anything inside that does not need to be?
2. **Reduce the duration** — precompute outside, keep allocation and formatting out.
3. **Split the lock** — separate locks for independent invariants (lock splitting), or per-bucket
   locks for a keyed structure (lock striping, which is what `ConcurrentHashMap` does).
4. **Remove the sharing** — per-thread or per-request accumulation, combined at the end
   (`LongAdder` is this idea packaged).
5. **Only then** consider lock-free structures (lock-free-patterns), which trade contention for
   retry loops and much harder correctness arguments.

Measure first: lock-inflation covers what a contended monitor actually costs, and
jfr-and-async-profiler shows which monitor is contended rather than which one you suspect.
