---
name: concurrent-collections-and-synchronizers
description: >
  Choosing between the members of java.util.concurrent once the family is settled, and the
  parameter that makes it correct: which BlockingQueue and which of its four insert and
  remove forms, which ConcurrentHashMap atomic replaces a compound action, copy-on-write's
  cost, latch versus barrier versus phaser versus semaphore, the Condition await loop, and
  ReentrantLock versus ReentrantReadWriteLock versus StampedLock. Use when computeIfAbsent
  loads from a database, when IllegalStateException "Recursive update" is thrown, when new
  LinkedBlockingQueue<>() appears in a producer, when a thread parks in CountDownLatch$Sync
  or every worker sits in CyclicBarrier.dowait, when await() sits under an if, or when a
  read lock is upgraded to a write lock. Not the thread-safety contract
  (java-thread-safety-contracts), executor lifecycle (executors-and-task-lifecycle), limit
  sizing (concurrency-limiting-and-bulkheads), CAS loops (lock-free-patterns), monitor
  contention (lock-inflation), or happens-before (java-memory-model).
---

# Concurrent Collections and Synchronizers

## Purpose

Once "use a concurrent collection", "use a queue" or "use a limit" is the decision, this is the
next one: **which member of the family, with which parameter, and what breaks when it is wrong.**
These failures are rarely exceptions — a consumer that idles with work queued, a limit of 8 that
admits 12, a latch nobody counts down, a heap dump full of queue nodes. The _rule_ that a
thread-safe collection does not make a sequence atomic belongs to java-thread-safety-contracts;
the mechanism it implies is here. Baseline **Java 25**; vendor support status and
version-sensitive claims must be checked separately.

Before applying that authoring baseline, inspect the target compiler release/toolchain,
deployed JDK/vendor/build and existing dependencies. Do not upgrade or enable preview merely
to apply this skill. `StructuredTaskScope` is preview in Java 25; route to
structured-concurrency for its version-specific API and compiler/runtime flags, and use
existing stable coordination APIs when preview is not authorized.

## Workflow

1. **Inspect the invariant and caller lifecycle first.** Reuse code, tests and the supplied context:
   what must be atomic, who owns accepted work/resources, and what ends a wait? Ask only for missing
   answers that change the choice. Retain an adequate existing lock or unshared collection.
   If overload can occur, name the admission policy: state
   the capacity or explain why an intrinsically unbounded structure is safe and bounded elsewhere.
2. **Pick the member from the tables below and write down the cost accepted.** A choice with no
   stated cost was not made.
3. **Pick the exact method form.** `offer(e, timeout, unit)` not `add`; `while` not `if`;
   `awaitNanos(remaining)` not the original timeout. The form is where the correctness is.
4. **Make cleanup exception-safe.** For owned locks/permits, acquire immediately before `try` and
   release in `finally` only after successful acquisition. Latches and phasers need their own party
   accounting rather than a mechanical lock template.
5. **Verify the consequential contract below.** Finish with the chosen or retained mechanism,
   operation/bound, ownership and failure policy, evidence and unchecked limits. State what change
   in workload or requirements would justify revisiting it; do not exercise every table branch.

## Selecting a queue

Start with the required bound, ordering and handoff semantics; `ArrayBlockingQueue(n)` and
`LinkedBlockingQueue(n)` are common bounded choices, not universal defaults. Mechanism, symptom
chains and code: `references/queues.md`.

| You need                                                                    | Pick                     | Cost accepted                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| a hard, pre-allocated bound; predictable memory                             | `ArrayBlockingQueue(n)`  | producers and consumers share **one** lock — a throughput ceiling; capacity cannot change                                       |
| a bound with high producer/consumer concurrency                             | `LinkedBlockingQueue(n)` | separate put/take locks, but a node allocation per element and less predictable timing                                          |
| a rendezvous — the producer waits for a real taker                          | `SynchronousQueue`       | zero capacity; collection views report empty and do not measure pending handoffs or waiting threads                             |
| handoff **and** buffering (`transfer`, `tryTransfer`, `hasWaitingConsumer`) | `LinkedTransferQueue`    | unbounded; `size()` O(n); **`poll()` may return null on a non-empty queue on JDK 21–25** (JDK-8371740, fixed in 26)             |
| consumer-side priority ordering                                             | `PriorityBlockingQueue`  | unbounded; iteration, `toArray` and `forEach` are **not** in priority order; equal priorities unordered — add a sequence number |
| work that becomes due at a time (retry, TTL, expiry)                        | `DelayQueue`             | unbounded; `poll`/`take`/`remove` return only the _expired_ head while `size()` counts the future too                           |
| LIFO processing, put-back-on-failure, hand-rolled stealing                  | `LinkedBlockingDeque`    | a single lock shared by both ends; no promise of fork/join throughput; `remove`/`contains`/bulk ops are linear                  |
| no blocking at all — a buffer drained by a live loop                        | `ConcurrentLinkedQueue`  | unbounded; `size()` is O(n)                                                                                                     |

## Selecting a coordinator

Failure modes and worked code: `references/synchronizers-and-conditions.md`.

| Situation                                                    | Pick                  | Cost accepted                                                                                                                                      |
| ------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| one thread must know N others finished; used once            | `CountDownLatch(n)`   | one-shot, the count cannot be reset; nobody rendezvouses                                                                                           |
| N threads must **meet** repeatedly; something runs per round | `CyclicBarrier(n, r)` | party count fixed; too few arrivals can wait indefinitely; interruption/timeout at the wait breaks the generation, failure before arrival does not |
| parties join and leave between rounds                        | `Phaser`              | ≤ 65535 parties (`IllegalStateException` beyond — tier it); `awaitAdvance` ignores interruption; a negative return means _terminated_              |
| at most N in flight against a scarce resource                | `Semaphore(n, fair)`  | no ownership — an extra `release()` silently raises the limit and nothing reports it                                                               |
| two threads swap buffers                                     | `Exchanger`           | pairs exactly two; `exchange(v)` with no partner blocks forever — use the timed overload                                                           |
| wait for **results**, not for arrivals                       | `StructuredTaskScope` | a different model — route to structured-concurrency                                                                                                |

## Replacing a compound action on a ConcurrentHashMap

Leaving a compound check/update in place can admit both callers. Choose an operation that protects
the required invariant; the final map value alone can hide duplicate work.

| What the caller wrote    | Atomic replacement                       |
| ------------------------ | ---------------------------------------- |
| `containsKey` then `put` | `putIfAbsent(k, v)`                      |
| `get`, null check, `put` | `computeIfAbsent(k, loader)`             |
| `get`, mutate, `put`     | `compute(k, fn)` or `merge(k, seed, fn)` |
| `get`, compare, `put`    | `replace(k, expected, updated)`          |
| `get`, compare, `remove` | `remove(k, expected)`                    |
| counter increment        | `merge(k, 1L, Long::sum)`                |
| hot counter              | `CHM<K, LongAdder>` + `computeIfAbsent`  |

These protect a mapping, not a multi-key transaction or arbitrary mutation of a shared value.
Prefer immutable replacement when readers must see a complete value change. `putIfAbsent(k, v)`
does not undo eager construction of `v`: losing candidates may need disposal, and external side
effects need their own contract. If loading must be shared, inspect the memoizer's lifecycle and
failure policy in `references/collections.md` before substituting a callback mechanically.

## Rules

- Prefer an explicit finite capacity where the queue is the admission boundary — no-arg
  `LinkedBlockingQueue` uses `Integer.MAX_VALUE`. Structures without a useful finite capacity do
  not provide overload control; `remainingCapacity()` is contract data, not proof of safety.
- A timed `offer` fits request paths that must bound admission delay and handle `false`; it is not
  automatically a 503 or spill policy. `put(e)` fits deliberate producer throttling; `offer(e)`
  fits designed and counted drop/retry. `add(e)` is rarely useful in a producer loop because it makes
  a capacity condition an `IllegalStateException("Queue full")` and on an unbounded queue can never
  fire. **An `offer` whose boolean is discarded is silent data loss.**
- Concurrent `size()` is monitoring information, not admission control. `if (map.size() < LIMIT)
map.put(…)` is a race. Use `mappingCount()` when an approximate `long` count is appropriate. Avoid
  hot-path or high-frequency scrape calls to `size()` on `ConcurrentLinkedQueue` or
  `LinkedTransferQueue` because it traverses.
- OpenJDK bug JDK-8371740 reports `LinkedTransferQueue.poll()` returning null despite a non-empty
  queue in releases 21–25, fixed in 26. Check the deployed build/backports before relying on the
  fix; do not use queue emptiness as a durable completion protocol.
- `compute*` and `merge` may block some updates while the function executes. Keep it short and do
  not modify the map from the function, as required by the API. Current OpenJDK uses per-bin
  coordination, but application correctness must not depend on its exact monitor layout. For a
  loader that can block, compare the failure-evicting memoiser in `references/collections.md`
  with an existing cache/load coordinator; make retry and overload policy explicit.
- `IllegalStateException("Recursive update")` is only required for a _detectable_ recursive update
  that would otherwise not complete. It is not an enforcement boundary. Any map mutation from a
  remapping function violates the API constraint even when a particular build does not throw.
- Distinguish two iterator contracts. **Weakly consistent** (CHM, skip lists,
  `ConcurrentLinkedQueue`) never throws `ConcurrentModificationException` and may reflect later
  writes; **snapshot** (copy-on-write) captures a consistent sequence of element references
  at creation, but not a deep snapshot of mutable element state. It ignores later list changes;
  a listener registered during dispatch waits for a later traversal, and iterator mutation throws.
- Copy-on-write's copy volume depends on **copying write rate × size**, not just the read:write
  ratio. Small read-mostly state and batched updates can fit; measure costly writes rather than
  imposing a universal ratio or request-scope ban. `CopyOnWriteArraySet.contains` is a linear scan.
- For locks and permits, acquire immediately before `try` and release in `finally` after successful
  acquisition and the protected work's actual completion/cleanup; put no throwing work before the
  cleanup guard. A missing `countDown()` can park a waiter indefinitely; a missing `release()`
  erodes capacity; a leaked
  `unlock()` is permanent, because a `ReentrantLock` is **not** released when its holder dies.
- The untimed `tryAcquire()` and `tryLock()` **ignore the fairness setting** and barge;
  `tryAcquire(0, unit)` honours it and also detects interruption. Whether the limit should be fair
  at all is a sizing decision — concurrency-limiting-and-bulkheads.
- Wait on a `Condition` in a `while` testing the predicate, never an `if`. Spurious wakeups are
  only one of the three reasons, and not the one that makes `if` unconditionally wrong. Symptom: a
  negative count or an item consumed twice, under load only.
- `signal()` is appropriate only when every waiter on that condition uses a compatible predicate
  and progress is preserved if the selected waiter cannot proceed; otherwise consider separate
  conditions or `signalAll()`. A wrong selection can leave an eligible waiter parked —
  one thread parked forever while everything else runs, and the dump looks like ordinary parking.
- In a re-wait loop carry the remaining time: `nanosRemaining = cond.awaitNanos(nanosRemaining)`.
  Re-passing the original turns N wakeups into N × timeout — a "5-second timeout" that occasionally
  takes minutes and never reports one. `await(t, unit)` returns `false` but no remaining time.
- Choose `ReentrantLock` over `synchronized` on **capability**: timed and interruptible acquisition,
  `tryLock`, fairness, non-block-structured locking, more than one condition queue. Pinning has not
  been a reason since JEP 491 (JDK 24) — virtual-threads-internals owns that diagnosis.
- A read-only `ReentrantReadWriteLock` holder cannot upgrade while retaining its read hold:
  blocking acquisition may wait indefinitely, whereas `tryLock` can fail or time out. A thread
  already owning the write lock may reenter it. Standard deadlock detection may miss read-hold
  stalls; inspect stacks and ownership. Downgrade is legal; `readLock().newCondition()` throws.
  The reader cap is **65535 on JDK
  21** and `Integer.MAX_VALUE` on **JDK 25**; measure against a plain lock before adding an RRWL.
- `StampedLock` is not reentrant, has no ownership and no fairness policy. Re-entry through a
  callback, listener or guarded object's method can self-deadlock and is not represented as an
  ownable-lock cycle. An optimistic read must not act on a potentially inconsistent snapshot before
  successful validation; copy only safe fields into locals, validate, then use them.
- Reach for `AbstractQueuedSynchronizer` only when a reusable blocking synchronizer needs a novel
  acquisition/release protocol. First compare the relevant existing primitive or `ReentrantLock`
  with conditions; an application-level state machine rarely needs its own queue machinery.

## Verification

- **Observe the invariant, not only the final value.** A controlled two-caller test can record each
  admission, constructed resource and losing-resource cleanup; both callers may have done work
  even when a final map read looks correct. Use jcstress when a memory/interleaving claim warrants
  it, not to rediscover every documented atomic operation. Bound failure and cancellation tests;
  a finite run neither proves absence of races nor identifies a hang's cause by itself.
- **Invariant checks in tests and diagnostics:** fixed-limit semaphores should never exceed their
  configured permit count; queue construction should expose its admission policy; non-reentrant
  designs should test callback/re-entry. Java assertions are disabled unless enabled and cannot be
  the production enforcement mechanism.
- **Review queue construction against the admission policy** — flag effectively unbounded
  queues and require an explicit external bound or workload argument. Encode that repository
  policy in a gate where useful; `remainingCapacity()` alone does not prove absence of a bound.
  The executor factories that hide queues are executors-and-task-lifecycle's;
  how to write the rule is architecture-testing's.
- **JFR with an explicit recording configuration.** AQS-based waits commonly surface through park
  events, while monitor contention has monitor events. Event enablement and thresholds vary by JDK
  and recording template; inspect the active settings before treating absence as evidence.
- **Metrics with the right shape**: bounded queue depth as a _fraction of capacity_ plus a counter
  of `offer` rejections (the rejection is the signal, depth is not); enqueue-to-dequeue latency
  timestamped on the item; `availablePermits()` alerted on a _trend_. `getQueueLength()` is a lock
  method — threads waiting to acquire, not queue depth — documented as monitoring only. A startup
  deployment build/backport status recorded when the `LinkedTransferQueue.poll()` issue is relevant.

## References

- [Concurrent collections](references/collections.md) — the bin lock, which recursions are detected
  and which are silent, the failure-evicting memoiser, `keySet` variants, bulk ops, the wrapper
  decision, copy-on-write, skip lists. Read before putting anything inside a `compute*` function,
  and when choosing between CHM, a synchronized wrapper, copy-on-write and a skip list.
- [Blocking queues](references/queues.md) — the four insert/remove/examine forms, the implementation
  comparison, the unbounded-queue failure chain, `drainTo` batching, the `LinkedTransferQueue` bug,
  `DelayQueue`, poison pills. Read when adding, sizing or replacing a queue.
- [Synchronizers and conditions](references/synchronizers-and-conditions.md) — latch, barrier,
  phaser, semaphore and exchanger failure modes, the permit-leak and over-release shapes, the
  `Condition` protocol and a correct bounded buffer. Read when threads must coordinate.
- [Explicit locks](references/locks.md) — the capability table against `synchronized`, the JEP 491
  reframing, the `tryLock` recipe, RRWL upgrade/downgrade and the reader-cap change, `StampedLock`
  with the canonical optimistic read, when AQS is justified. Read when a lock is chosen or blamed.
- [Java 25 concurrent collections and synchronizers](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [Java 25 lock package](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/package-summary.html)
- [OpenJDK JDK-8371740: `LinkedTransferQueue.poll()` issue](https://bugs.openjdk.org/browse/JDK-8371740)
