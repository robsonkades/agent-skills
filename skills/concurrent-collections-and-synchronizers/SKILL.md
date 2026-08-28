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
the mechanism it implies is here. Baseline **JDK 25 LTS**; version-sensitive claims say so.

## Workflow

1. **Name the bound before choosing an implementation.** Every queue in a production path has a
   capacity and a stated policy for full; no nameable policy means it is hidden, not bounded.
2. **Pick the member from the tables below and write down the cost accepted.** A choice with no
   stated cost was not made.
3. **Pick the exact method form.** `offer(e, timeout, unit)` not `add`; `while` not `if`;
   `awaitNanos(remaining)` not the original timeout. The form is where the correctness is.
4. **Acquire as the last statement before `try`; release as the first statement of `finally`** —
   `unlock`, `release`, `countDown`, `arriveAndDeregister` alike.
5. **Verify with the section below**, not by re-reading the code; these failures are silent.

## Selecting a queue

Default to `ArrayBlockingQueue(n)` or `LinkedBlockingQueue(n)`; go past them only for a property in
the first column. Mechanism, symptom chains and code: `references/queues.md`.

| You need                                                                    | Pick                     | Cost accepted                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| a hard, pre-allocated bound; predictable memory                             | `ArrayBlockingQueue(n)`  | producers and consumers share **one** lock — a throughput ceiling; capacity cannot change                                       |
| a bound with high producer/consumer concurrency                             | `LinkedBlockingQueue(n)` | separate put/take locks, but a node allocation per element and less predictable timing                                          |
| a rendezvous — the producer waits for a real taker                          | `SynchronousQueue`       | zero capacity; `size()`, `peek()` and `iterator()` are present and all report empty — every monitoring hook lies                |
| handoff **and** buffering (`transfer`, `tryTransfer`, `hasWaitingConsumer`) | `LinkedTransferQueue`    | unbounded; `size()` O(n); **`poll()` may return null on a non-empty queue on JDK 21–25** (JDK-8371740, fixed in 26)             |
| consumer-side priority ordering                                             | `PriorityBlockingQueue`  | unbounded; iteration, `toArray` and `forEach` are **not** in priority order; equal priorities unordered — add a sequence number |
| work that becomes due at a time (retry, TTL, expiry)                        | `DelayQueue`             | unbounded; `poll`/`take`/`remove` return only the _expired_ head while `size()` counts the future too                           |
| LIFO processing, put-back-on-failure, hand-rolled stealing                  | `LinkedBlockingDeque`    | a single lock — work stealing's ordering, none of its contention benefit; `remove`/`contains`/bulk ops are linear               |
| no blocking at all — a buffer drained by a live loop                        | `ConcurrentLinkedQueue`  | unbounded; `size()` is O(n)                                                                                                     |

## Selecting a coordinator

Failure modes and worked code: `references/synchronizers-and-conditions.md`.

| Situation                                                    | Pick                  | Cost accepted                                                                                                                         |
| ------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| one thread must know N others finished; used once            | `CountDownLatch(n)`   | one-shot, the count cannot be reset; nobody rendezvouses                                                                              |
| N threads must **meet** repeatedly; something runs per round | `CyclicBarrier(n, r)` | party count fixed at construction, so N−1 live threads park forever; one early leaver breaks it for everyone                          |
| parties join and leave between rounds                        | `Phaser`              | ≤ 65535 parties (`IllegalStateException` beyond — tier it); `awaitAdvance` ignores interruption; a negative return means _terminated_ |
| at most N in flight against a scarce resource                | `Semaphore(n, fair)`  | no ownership — an extra `release()` silently raises the limit and nothing reports it                                                  |
| two threads swap buffers                                     | `Exchanger`           | pairs exactly two; `exchange(v)` with no partner blocks forever — use the timed overload                                              |
| wait for **results**, not for arrivals                       | `StructuredTaskScope` | a different model — route to structured-concurrency                                                                                   |

## Replacing a compound action on a ConcurrentHashMap

Leaving the compound form in place produces duplicate initialisation — two connections, two
schedulers, a doubled counter — invisible in tests and load-dependent in production.

| What the caller wrote    | Atomic replacement                       |
| ------------------------ | ---------------------------------------- |
| `containsKey` then `put` | `putIfAbsent(k, v)`                      |
| `get`, null check, `put` | `computeIfAbsent(k, loader)`             |
| `get`, mutate, `put`     | `compute(k, fn)` or `merge(k, seed, fn)` |
| `get`, compare, `put`    | `replace(k, expected, updated)`          |
| `get`, compare, `remove` | `remove(k, expected)`                    |
| counter increment        | `merge(k, 1L, Long::sum)`                |
| hot counter              | `CHM<K, LongAdder>` + `computeIfAbsent`  |

## Rules

- Every queue is constructed with a capacity — `new LinkedBlockingQueue<>()` is
  `Integer.MAX_VALUE`. An unbounded queue has no backpressure signal at all: `put` never blocks,
  `offer` never returns false, `remainingCapacity()` always lies.
- `offer(e, timeout, unit)` is the right default for a service — a `false` you turn into a 503 or
  a spill, with a deadline attached. `put(e)` when the producer thread is deliberately the
  throttle; `offer(e)` only where dropping is designed and counted. `add(e)` almost never: it makes
  a capacity condition an `IllegalStateException("Queue full")` and on an unbounded queue can never
  fire. **An `offer` whose boolean is discarded is silent data loss.**
- `size()` is a gauge with sampling error, never control flow. `if (map.size() < LIMIT) map.put(…)`
  is a race; CHM's internal striped sum can read transiently negative, which is why `isEmpty()` is
  `sumCount() <= 0L` while `size()` clamps at 0. Use `mappingCount()` above 2^31. Never export
  `size()` on `ConcurrentLinkedQueue` or `LinkedTransferQueue` — it traverses.
- `LinkedTransferQueue.poll()` can return null on a non-empty queue on JDK 21–25 (JDK-8371740,
  table above), so `if (poll() == null) { /* drained */ }` is incorrect there: the consumer idles
  or exits with items still queued. Prefer `LinkedBlockingQueue`.
- `compute`, `computeIfAbsent`, `computeIfPresent` and `merge` run your function while holding the
  bin head node's monitor (implementation, not specification): keep it short, side-effect-free,
  touching no map. I/O there serialises every writer to that bin behind the slowest loader. For a
  loader that can block, use the failure-evicting memoiser in `references/collections.md`.
- A recursive update is detected only when it is **structurally** detectable: re-entering a bin
  this thread has already reserved, or appending to the tail of the very list `computeIfAbsent` is
  walking. Everything else — recursion into the same bin when the key already exists, `merge`
  inside `merge` — completes **silently and non-atomically**. "It lands in the same bin" is not a
  safety argument.
- Iterators come in two kinds, neither a consistent view. **Weakly consistent** (CHM, skip lists,
  `ConcurrentLinkedQueue`) never throws `ConcurrentModificationException` and may reflect later
  writes; **snapshot** (copy-on-write) never throws CME and definitely will not — a listener
  registered during dispatch is silently skipped, and iterator mutation throws.
- Copy-on-write cost is **writeRate × size**, not the read:write ratio. Use it for
  configuration-shaped state whose write rate is bounded by human or control-plane action, never
  for request-scoped data; batch with `addAll`. `CopyOnWriteArraySet.contains` is a linear scan.
- Acquire as the last statement before `try`, release as the _first_ statement of `finally`; not
  even a log line in between. A missing `countDown()` parks one thread in `CountDownLatch$Sync`
  forever with nothing logged; a missing `release()` decays throughput over days; a leaked
  `unlock()` is permanent, because a `ReentrantLock` is **not** released when its holder dies.
- The untimed `tryAcquire()` and `tryLock()` **ignore the fairness setting** and barge;
  `tryAcquire(0, unit)` honours it and also detects interruption. Whether the limit should be fair
  at all is a sizing decision — concurrency-limiting-and-bulkheads.
- Wait on a `Condition` in a `while` testing the predicate, never an `if`. Spurious wakeups are
  only one of the three reasons, and not the one that makes `if` unconditionally wrong. Symptom: a
  negative count or an item consumed twice, under load only.
- `signal()` is safe only when every waiter on _that_ condition waits for the same predicate and one
  state change enables exactly one of them; otherwise `signalAll()`. Symptom: a **lost wakeup** —
  one thread parked forever while everything else runs, and the dump looks like ordinary parking.
- In a re-wait loop carry the remaining time: `nanosRemaining = cond.awaitNanos(nanosRemaining)`.
  Re-passing the original turns N wakeups into N × timeout — a "5-second timeout" that occasionally
  takes minutes and never reports one. `await(t, unit)` returns `false` but no remaining time.
- Choose `ReentrantLock` over `synchronized` on **capability**: timed and interruptible acquisition,
  `tryLock`, fairness, non-block-structured locking, more than one condition queue. Pinning has not
  been a reason since JEP 491 (JDK 24) — virtual-threads-internals owns that diagnosis.
- `ReentrantReadWriteLock` upgrade **never** succeeds — a read-lock holder taking the write lock
  deadlocks against itself forever, and `findDeadlockedThreads()` returns null because it is no
  cycle. Downgrade is legal; `readLock().newCondition()` throws. The reader cap is **65535 on JDK
  21** and `Integer.MAX_VALUE` on **JDK 25**; measure against a plain lock before adding an RRWL.
- `StampedLock` is not reentrant, has no ownership and no fairness policy. Re-entry through a
  callback, a listener or a guarded object's `toString()` self-deadlocks with **no deadlock report
  anywhere**. An optimistic read may only copy fields into locals and must `validate(stamp)` first.
- Reach for `AbstractQueuedSynchronizer` last: `BlockingQueue` → `Semaphore` → latch/barrier/phaser
  → `ReentrantLock` + one `Condition` per predicate → `StructuredTaskScope` → atomics. Only a
  blocking synchronizer with a novel acquisition predicate justifies it.

## Verification

- **jcstress for the substitution table.** Two `@Actor`s racing `containsKey`+`put` against
  `putIfAbsent` on one key, an `@Arbiter` reading the result, the interleaved outcome `FORBIDDEN`;
  run both shapes so the compound one demonstrably produces it. `Mode.Termination` is the only
  mechanical catch for a lost wakeup or a permit leak — a `STALE` outcome is the lost signal.
- **Assertions that cost nothing and catch the silent ones**:
  `assert semaphore.availablePermits() <= CONFIGURED_PERMITS` (over-release is otherwise
  undetectable), `assert queue.remainingCapacity() != Integer.MAX_VALUE` in the queue factory,
  `assert lock.getHoldCount() <= 1` against recursion into a non-reentrant design.
- **An architecture test on queue construction** — fail the build on the no-arg
  `new LinkedBlockingQueue<>()` and on any queue reaching a pool whose `remainingCapacity()` is
  `Integer.MAX_VALUE`. The executor factories that hide one are executors-and-task-lifecycle's;
  how to write the rule is architecture-testing's.
- **JFR, with the threshold lowered first.** `jdk.ThreadPark` (with `parkedClass`) covers every
  `ReentrantLock`, `Semaphore`, `BlockingQueue` and AQS block; `jdk.JavaMonitorEnter` covers
  `synchronized`. Both default to **20 ms** (10 ms under `profile.jfc`), so a lock contended 50 000
  times for 1 ms produces **zero** events — and after a move to `ReentrantLock`, monitor events
  alone make contention appear to have ended.
- **Metrics with the right shape**: bounded queue depth as a _fraction of capacity_ plus a counter
  of `offer` rejections (the rejection is the signal, depth is not); enqueue-to-dequeue latency
  timestamped on the item; `availablePermits()` alerted on a _trend_. `getQueueLength()` is a lock
  method — threads waiting to acquire, not queue depth — documented as monitoring only. A startup
  `Runtime.version().feature() >= 26` guard pins the `LinkedTransferQueue.poll()` behaviour.

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
