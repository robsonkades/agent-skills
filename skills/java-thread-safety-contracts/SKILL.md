---
name: java-thread-safety-contracts
description: >
  The thread-safety contract of a class, stated and reviewable: the levels (immutable,
  thread-safe, conditionally thread-safe, not thread-safe, thread-confined) and how to
  document each, keeping the lock private, sizing a critical section to the invariant, the
  alien-call rule that prevents most deadlocks, choosing between confinement, immutability,
  concurrent collections, atomics and locks, and lazy initialisation without
  double-checked-locking folklore. Use when a shared class states no contract, when a lock
  is held across a callback or I/O, when code synchronises on a public or boxed object, when
  two locks are taken in different orders, when a field is lazily initialised, or when "add
  synchronized" is the proposed fix. Happens-before is java-memory-model, monitor cost is
  lock-inflation, lock-free algorithms are lock-free-patterns, and diagnosing a live
  incident is concurrency-diagnostics.
---

# Java Thread-Safety Contracts

## Purpose

Make each class say what it promises to concurrent callers, and make the promise cheap to
keep. Two failure modes: the class with no stated contract, where every caller guesses — some
synchronise redundantly, one does not, and the bug appears under load in a component nobody
suspects; and the class that synchronises defensively everywhere, holding a lock across a
callback or an I/O call, which converts a correctness question into a deadlock or a
throughput collapse.

## Workflow

1. **Decide the level before writing the code.** Immutable, thread-safe, conditionally
   thread-safe, not thread-safe, or confined to one thread. Most classes should be immutable
   or not-thread-safe-and-confined; "thread-safe" is a cost, not a default.
2. **State it where a caller will read it** — the class Javadoc, in the vocabulary below. For
   a conditionally thread-safe class, name the sequences that need external locking and what
   to lock on.
3. **Pick the cheapest mechanism that holds.** Confinement → immutability → a concurrent
   collection or atomic → a private lock. Reach for a lock last, not first.
4. **Draw the critical section as small as it can be** and check what it calls: nothing
   overridable, nothing supplied by a caller, no I/O, no other lock, no unbounded wait.
5. **Order every multi-lock acquisition** by a documented global order, or restructure so only
   one lock is held at a time.
6. **Verify.** A test that exercises the documented contract concurrently
   (concurrency-testing), and a review pass over every `synchronized` block asking what it
   calls.

## Rules

- Document the level explicitly, using consistent terms: **immutable** (no synchronisation
  ever needed), **thread-safe** (every method safe in any order, no external locking),
  **conditionally thread-safe** (individual calls safe, some sequences need external locking —
  name them), **not thread-safe** (callers must provide exclusion), **thread-confined**
  (belongs to one thread or one request). A class with shared mutable state and no statement is
  an unreviewable class.
- Guard state with a **private** lock object, not `this` and not the class object. A public
  lock lets any caller participate in your locking protocol — and deadlock you, or hold your
  lock indefinitely — and it makes the protocol part of your published API, which you can then
  never change. `private final Object lock = new Object();` costs nothing.
- Name what each field is guarded by, in a comment or a `@GuardedBy` annotation. The annotation
  is not enforced by the compiler, but it makes the intent reviewable and some static analysers
  do check it; an unannotated mutable field in a thread-safe class is a question every reader
  has to re-answer.
- **Never call an unknown method while holding a lock.** An override, a listener, a callback, a
  `Comparator`, a `Function` passed by a caller, or any object you did not write can block,
  acquire another lock, call back into you (re-entering with the invariant broken), or throw.
  This is the single most common source of deadlock in application code. Take a snapshot inside
  the lock, release it, then call out — a `CopyOnWriteArrayList` of listeners exists precisely
  to make that easy.
- Keep I/O, remote calls, sleeps and unbounded waits out of critical sections. A lock held
  across a network call converts one slow dependency into a queue of blocked threads and turns
  a latency problem into an outage — see cascading-failures.
- Do not synchronise on a `String` literal, a boxed primitive, an interned value or any
  value-based class (`Optional`, `LocalDate`, `Integer`). Those references are shared or
  unspecified: two unrelated components can end up on the same monitor, or on different ones
  for equal values.
- Prefer confinement to locking. A mutable object created, used and discarded inside one
  request needs no synchronisation at all, and this covers most objects. Make confinement
  visible: a local variable, or a documented "one instance per request".
- Prefer immutability to locking for shared state. A deeply immutable object with final fields
  is safely published by construction and needs no further discipline — java-immutability.
- Prefer the concurrency utilities to hand-rolled locking: `ConcurrentHashMap` (with `compute`,
  `merge`, `computeIfAbsent` for compound operations), `CopyOnWriteArrayList` for
  read-dominated listener lists, `LongAdder` for hot counters, `BlockingQueue` for hand-off,
  `CountDownLatch`/`Semaphore`/`CyclicBarrier` for coordination, and the atomics for a single
  variable. `wait`/`notify` is a last resort and always needs a loop around the condition
  predicate.
- A thread-safe collection does not make a compound operation atomic. A `containsKey` followed
  by a `put` is a race no matter how concurrent the map is; `putIfAbsent`, `compute` and
  `merge` exist for this. The same applies to check-then-act on any atomic — use
  `compareAndSet` or `updateAndGet`.
- Synchronising everything is its own defect. Excessive synchronisation costs throughput,
  invites deadlock, and hides the real question of which invariant spans which fields. Where
  the class is used by one thread, synchronisation is pure cost — that is why `ArrayList` and
  `HashMap` are unsynchronised and `Vector` and `Hashtable` are not used.
- Lazy initialisation is an optimisation with a correctness cost; use it only when the field is
  expensive **and** often unused, and prove the cost first. For a static field, the
  lazy-initialisation **holder class** is the correct idiom — class initialisation gives
  publication for free with no read-time synchronisation. For an instance field, use a
  `synchronized` accessor unless a measurement shows it matters; only then double-checked
  locking with a `volatile` field, written exactly as the idiom requires. java-memory-model owns
  the proof of why the `volatile` is not optional.
- On JDK 24 and later (JEP 491), blocking on a monitor no longer pins a virtual thread to its
  carrier, so the advice to replace `synchronized` with `ReentrantLock` for that reason is
  obsolete. What has not changed: a lock still serialises the work, and cheap threads mean far
  more of them arrive at the same critical section — see thread-sizing-and-virtual-threads.
- A per-process lock is not a distributed lock. `synchronized`, `ReentrantLock` and a
  `ConcurrentHashMap`-based dedup guard one JVM only; with more than one replica they guarantee
  nothing about the system. Cross-replica exclusion needs a lease or an election
  (distributed-locks-and-leases, leader-election), and cross-replica uniqueness usually wants a
  database constraint or optimistic locking instead.

## References

- [Documenting the contract](references/documenting-thread-safety.md) — read when writing or
  reviewing the Javadoc of a class shared between threads, when deciding which level to
  promise, or when callers need to know what to lock on.
- [Lock scope, alien calls and deadlock](references/lock-scope-and-alien-calls.md) — read when
  a critical section calls anything it does not own, when two locks are involved, when
  contention or a deadlock is suspected by design review, or when choosing between
  confinement, a concurrent collection and a lock.
- [Lazy initialisation](references/lazy-initialisation.md) — read before making any field
  lazy, when reviewing double-checked locking, or when a static holder, a `Supplier` memoiser
  or an eagerly initialised field would each do.
