# Blocking queues

Complete classes here compile against JDK 25, `java.base` only, no external dependencies; shorter
fragments are method bodies in that same setting.

## The four method forms

From the `BlockingQueue` javadoc (Java SE 25):

| Operation   | Throws exception | Special value | Blocks   | Times out              |
| ----------- | ---------------- | ------------- | -------- | ---------------------- |
| **Insert**  | `add(e)`         | `offer(e)`    | `put(e)` | `offer(e, time, unit)` |
| **Remove**  | `remove()`       | `poll()`      | `take()` | `poll(time, unit)`     |
| **Examine** | `element()`      | `peek()`      | n/a      | n/a                    |

Which insert form is a design decision, not a style preference:

- **`offer(e, timeout, unit)` — the right default for a service.** It bounds the backpressure: a
  `false` is a shed-load, spill-to-disk or 503 decision, and it carries a deadline. This is the
  one senior engineers under-use.
- `put(e)` — unconditional backpressure. Correct when the producer's own thread is the throttle
  and nothing bounds the enqueue path.
- `offer(e)` — fail-fast. Correct only where dropping is genuinely acceptable and counted
  (sampled telemetry). Silent data loss when it is not.
- `add(e)` — throws `IllegalStateException("Queue full")`. Almost always wrong in a producer loop:
  it makes a routine capacity condition an exception, and on an unbounded queue it can never fire,
  so the code reads as if it handles overflow when it cannot.

Contract facts worth holding: a `BlockingQueue` accepts no `null` elements (null is the sentinel
for a failed `poll`); a queue with no intrinsic capacity constraint always reports
`remainingCapacity() == Integer.MAX_VALUE`; and there is no `close`/`shutdown` — "a common tactic
is for producers to insert special end-of-stream or **poison** objects".

```java
private static final Task POISON = new Task("poison");

void consumeUntilPoison(BlockingQueue<Task> q) throws InterruptedException {
    for (;;) {
        Task t = q.take();
        if (t == POISON) { q.put(POISON); return; }   // put it back for the next consumer
        handle(t);
    }
}
```

A single poison consumed by one worker leaves the rest blocked forever, so either enqueue one per
consumer or put it back as above. The put-back variant has two costs worth naming: the poison is
still in the queue when the last consumer leaves — fine for a queue that dies with the process, a
leak if a supervisor drains or reuses it — and `put` is the _blocking_ form, so on a bounded queue
whose producer is still filling, the shutting-down consumer blocks on the shutdown path. Use
`offer(POISON)` and log a failure, or prefer one poison per consumer.

## Choosing an implementation

| Implementation           | Bounded?                      | Lock structure                           | Watch out                                                                                                                                                                                     |
| ------------------------ | ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArrayBlockingQueue`     | always, fixed at construction | one `ReentrantLock` + notEmpty/notFull   | producers and consumers contend on the same lock; capacity cannot change                                                                                                                      |
| `LinkedBlockingQueue(n)` | yes                           | `putLock` + `takeLock` + `AtomicInteger` | node allocation per element; "higher throughput … but less predictable performance"                                                                                                           |
| `LinkedBlockingQueue()`  | **no — `Integer.MAX_VALUE`**  | as above                                 | the classic hidden failure below                                                                                                                                                              |
| `SynchronousQueue`       | zero capacity                 | dual-stack/queue                         | "not even a capacity of one"; `peek()`, `iterator()`, `size()` and `remainingCapacity()` all exist and all report a queue with nothing in it and no room in it (`remainingCapacity()` is `0`) |
| `LinkedTransferQueue`    | **unbounded**                 | CAS dual queue                           | `size()` O(n); the JDK 21–25 `poll()` bug below                                                                                                                                               |
| `PriorityBlockingQueue`  | **unbounded**                 | one lock over a heap                     | iteration is not in priority order; equal priorities unordered                                                                                                                                |
| `DelayQueue`             | **unbounded**                 | one lock + heap + leader thread          | deliberate contract violation below                                                                                                                                                           |
| `LinkedBlockingDeque`    | optional, default MAX_VALUE   | one lock                                 | `remove`, `removeFirstOccurrence`, `removeLastOccurrence`, `contains` and bulk ops are linear                                                                                                 |
| `ConcurrentLinkedQueue`  | **unbounded, non-blocking**   | CAS (Michael & Scott)                    | `size()` is O(n)                                                                                                                                                                              |

`PriorityBlockingQueue` makes no guarantee about elements of equal priority, so FIFO among ties
needs a sequence number in the comparator:

```java
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicLong;

record Job(int priority, long seq, Runnable body) {
    private static final AtomicLong SEQ = new AtomicLong();
    static Job of(int priority, Runnable body) {
        return new Job(priority, SEQ.getAndIncrement(), body);
    }
    static final Comparator<Job> ORDER =
            Comparator.comparingInt(Job::priority).thenComparingLong(Job::seq);
}
```

Its `Iterator`, `Spliterator`, `toArray` and `forEach` are explicitly not in priority order; the
only bulk way to read it in order is `drainTo` (which polls) or sorting the array yourself.

`LinkedBlockingDeque` is the only `BlockingDeque` in the JDK. It gives work stealing's _ordering_
property — the owner pushes and pops at the head (LIFO, warm in cache), a thief takes from the
tail (FIFO, the oldest and biggest task, contending least) — but it uses a **single** lock, so it
does not give the contention avoidance that makes real work stealing fast. For fork/join
workloads use `ForkJoinPool`. Its other genuine use is `addFirst(item)` to re-queue a failed item
ahead of newer work.

## The unbounded queue, walked through

An unbounded queue converts a _rate mismatch_ into _memory growth_, and disables every mechanism
the API has for noticing overload at once: `put` never blocks, `offer` never returns `false`,
`add` never throws, and `remainingCapacity()` always reports `Integer.MAX_VALUE`.

Where it hides: the no-arg `new LinkedBlockingQueue<>()`; `Executors.newFixedThreadPool(n)` and
`newSingleThreadExecutor()` (both use one — pool internals belong to executors-and-task-lifecycle,
the queue choice is ours); `PriorityBlockingQueue`, `DelayQueue`, `LinkedTransferQueue` and
`ConcurrentLinkedQueue`, none of which has a bounded variant; and Spring Boot's default task
executor queue capacity.

What an engineer observes, in order:

1. Latency climbs while CPU is **flat** and thread count is **flat** — everything is queued, not
   running. (`L = λW`; the queue is `L`. Sizing belongs to littles-law-and-queueing.)
2. Old-gen occupancy after full GC ratchets upward across hours; GC frequency climbs, then pause
   time.
3. Requests time out downstream, clients retry, the arrival rate goes _up_, the queue grows faster
   — the metastable failure (cascading-failures).
4. `OutOfMemoryError: Java heap space`, with a heap dump dominated by the queue's `Node` objects
   or the captured state of the queued lambdas.
5. Everything in the queue at the moment of the crash is lost, with nothing having acknowledged it.

## drainTo: batching without a per-element lock

`drainTo` "removes all available elements … and adds them to the given collection", may be more
efficient than repeated polling, throws `IllegalArgumentException` if you drain a queue to itself,
and leaves elements in neither, either or both collections if adding to `c` throws. It does **not**
block: it drains what is there now and may return 0.

```java
import java.util.*;
import java.util.concurrent.BlockingQueue;

void consumeInBatches(BlockingQueue<Task> q, int maxBatch) throws InterruptedException {
    List<Task> batch = new ArrayList<>(maxBatch);
    while (!Thread.currentThread().isInterrupted()) {
        batch.add(q.take());                 // block for the first element
        q.drainTo(batch, maxBatch - 1);      // bounded: never the unbounded overload
        handleBatch(batch);
        batch.clear();
    }
}
```

`drainTo(list)` without `maxElements` on a deep queue materialises the whole backlog in memory —
a latency spike, then an OOM. The bounded overload exists for that reason.

## LinkedTransferQueue: what it adds, and the JDK 21–25 bug

`transfer(e)` blocks until a consumer receives the element; `tryTransfer(e)` hands off only to an
_already waiting_ consumer and returns `false` otherwise; `tryTransfer(e, timeout, unit)` waits;
`hasWaitingConsumer()` and `getWaitingConsumerCount()` let a producer adapt. That is
`SynchronousQueue` semantics with buffering behind it, and it is the only reason to choose the
class.

**JDK-8371740, "LinkedTransferQueue.poll() returns null even though queue is not empty".**
Affected versions 21, 22, 23, 24, 25; fix version 26; no backport row was found as of this writing
(absence of evidence, not evidence of absence). Reproduced locally on Temurin 25.0.3 with the
reporter's four-thread `offer`/`peek`/`poll` harness: seven failed polls on a non-empty queue,
against zero for `LinkedBlockingQueue` and `ArrayBlockingQueue`. _Inference, not a cited changeset:_
the 25 `xfer` path reads `q = p.next` before attempting `p.cmpExItem(m, e)`, so a lost exchange on
a stale `q == null` breaks out and returns `null`, where mainline restarts the scan.

So on a 21 or 25 baseline this is incorrect:

```java
Task t = ltq.poll();
if (t == null) {
    shutdownBecauseDrained();     // WRONG on JDK 21-25: the queue may not be empty
}
```

Symptom: a consumer loop that idles or exits with items still queued, or a "drained" assertion that
fails only under load and never reproduces in a unit test. Prefer `LinkedBlockingQueue`; if the
class is required, retry the poll or gate on `Runtime.version().feature() >= 26`.

Related: JDK-8301341 ("LinkedTransferQueue does not respect timeout for poll()") has fix version
22, so on JDK 21 the timed `poll` may also over- or under-wait. Treat `LinkedTransferQueue` as the
least battle-tested member of the family.

## DelayQueue: the contract violation is deliberate

The class doc defines _expired_ (`getDelay(NANOSECONDS) <= 0`), the _head_ (earliest expiration,
past or future) and the _expired head_, then states that the class "intentionally violates the
general contract of `BlockingQueue`, in that the following methods disregard the presence of
unexpired elements and only ever remove the expired head: `poll()`, `poll(long, TimeUnit)`,
`take()`, `remove()`". All other methods see both: `size()` counts everything, and `peek()` may
return a non-null head while `take()` would block waiting for it to expire. (This wording arrived
in JDK 21 via JDK-8297605; older javadocs are vaguer.)

`drainTo` is _not_ in that list and its own javadoc is inherited boilerplate, but the
implementation drains only expired elements. Treat "available" as "expired" — and note that
whether this is specified anywhere is unclear.

```java
import java.time.Duration;
import java.util.concurrent.*;

record Retry(String payload, long dueNanos) implements Delayed {
    @Override public long getDelay(TimeUnit unit) {
        return unit.convert(dueNanos - System.nanoTime(), TimeUnit.NANOSECONDS);
    }
    @Override public int compareTo(Delayed other) {
        return Long.compare(getDelay(TimeUnit.NANOSECONDS), other.getDelay(TimeUnit.NANOSECONDS));
    }
    static Retry in(Duration d, String payload) {
        return new Retry(payload, System.nanoTime() + d.toNanos());
    }
}
```

`dueNanos` is final on purpose: a `getDelay()` that can move _backwards_ corrupts the heap
ordering. The other two failure modes are alerting on `size()` as "work due now" (it counts the
future too) and using an unbounded `DelayQueue` as a retry buffer during a downstream outage.

## ConcurrentLinkedQueue

Unbounded, non-blocking, Michael & Scott algorithm; weakly consistent iterators; bulk operations
(`addAll`, `removeIf`, `forEach`) are not atomic. The javadoc is explicit that **`size()` is NOT a
constant-time operation** — it traverses. `LinkedTransferQueue` carries the identical warning.

The anti-pattern this creates: exporting `size()` as a gauge scraped every 15 seconds on a queue
holding 100k elements adds a 100k-node pointer chase to the metrics path, on a queue chosen for
being lock-free. The flame graph shows a large sample fraction in `ConcurrentLinkedQueue.size`
under the scrape thread, and the cost grows with the very backlog you were trying to observe. Use
`isEmpty()` — it is `first() == null`, so amortised O(1) rather than a traversal, though `first()`
does walk past self-linked and already-matched nodes — or maintain a `LongAdder` alongside.
