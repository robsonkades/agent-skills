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

- **`offer(e, timeout, unit)`** fits a service path that has a finite admission budget and an
  explicit policy for `false` (shed, degrade, retry elsewhere, or fail). It is not a universal
  default: waiting consumes the caller's remaining deadline and can relocate a queue upstream.
- `put(e)` — unconditional backpressure. Correct when the producer's own thread is the throttle
  and nothing bounds the enqueue path.
- `offer(e)` — immediate admission decision. Handle `false` by an explicit rejection, bounded
  retry or counted drop policy; the caller still owns work that was not accepted.
- `add(e)` — throws `IllegalStateException("Queue full")`. Almost always wrong in a producer loop:
  it makes a routine capacity condition an exception, and on an unbounded queue it can never fire,
  so the code reads as if it handles overflow when it cannot.

Contract facts worth holding: a `BlockingQueue` accepts no `null` elements (null is the sentinel
for a failed `poll`); a queue with no intrinsic capacity constraint always reports
`remainingCapacity() == Integer.MAX_VALUE`. No-arg `LinkedBlockingQueue` instead has that finite
capacity and reports capacity minus current size. There is no `close`/`shutdown` — "a common tactic
is for producers to insert special end-of-stream or **poison** objects".

```java
private static final Task POISON = new Task("poison");

void consumeUntilPoison(BlockingQueue<Task> q) throws InterruptedException {
    for (;;) {
        Task t = q.take();
        if (t == POISON) return;   // coordinator sends one per live consumer
        handle(t);
    }
}
```

This is a partial FIFO shutdown protocol: stop and join producers before enqueueing one
poison per live consumer after accepted work. Bound marker insertion and join time; if insertion
fails or a worker dies, the coordinator must cancel/interrupt remaining workers according to
the shutdown policy. Logging a failed marker offer is insufficient. Re-inserting a marker
can block a departing worker or strand the others if it is dropped. Priority/delay queues
need a different termination protocol because a marker may overtake or wait behind work.

## Choosing an implementation

| Implementation           | Bounded?                                   | Lock structure                           | Watch out                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArrayBlockingQueue`     | always, fixed at construction              | one `ReentrantLock` + notEmpty/notFull   | producers and consumers contend on the same lock; capacity cannot change                                                                                                                      |
| `LinkedBlockingQueue(n)` | yes                                        | `putLock` + `takeLock` + `AtomicInteger` | node allocation per element; "higher throughput … but less predictable performance"                                                                                                           |
| `LinkedBlockingQueue()`  | effectively unbounded: `Integer.MAX_VALUE` | as above                                 | usually exhausts memory before reaching its nominal capacity                                                                                                                                  |
| `SynchronousQueue`       | zero capacity                              | JDK-specific transfer coordination       | "not even a capacity of one"; `peek()`, `iterator()`, `size()` and `remainingCapacity()` all exist and all report a queue with nothing in it and no room in it (`remainingCapacity()` is `0`) |
| `LinkedTransferQueue`    | **unbounded**                              | CAS dual queue                           | `size()` O(n); the JDK 21–25 `poll()` bug below                                                                                                                                               |
| `PriorityBlockingQueue`  | **unbounded**                              | one lock over a heap                     | iteration is not in priority order; equal priorities unordered                                                                                                                                |
| `DelayQueue`             | **unbounded**                              | one lock + heap + leader thread          | deliberate contract violation below                                                                                                                                                           |
| `LinkedBlockingDeque`    | optional, default MAX_VALUE                | one lock                                 | `remove`, `removeFirstOccurrence`, `removeLastOccurrence`, `contains` and bulk ops are linear                                                                                                 |
| `ConcurrentLinkedQueue`  | **unbounded, non-blocking**                | CAS (Michael & Scott)                    | `size()` is O(n)                                                                                                                                                                              |

`PriorityBlockingQueue` makes no guarantee about elements of equal priority. A sequence number can
define tie order:

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

This orders equal priorities by ticket assignment at creation, not by concurrent enqueue or
completion order. It assumes the signed sequence does not wrap while relevant jobs coexist.

Its `Iterator`, `Spliterator`, `toArray` and `forEach` are explicitly not in priority order; the
only bulk way to read it in order is `drainTo` (which polls) or sorting the array yourself.

`LinkedBlockingDeque` is the only `BlockingDeque` in the JDK. It gives work stealing's _ordering_
property — the owner pushes and pops at the head (LIFO, warm in cache), a thief takes from the
tail (oldest task in this head-insertion protocol, not necessarily the biggest) — but both ends share a
**single** lock. That ordering alone does not establish a contention benefit. For fork/join
workloads use `ForkJoinPool`. Its other genuine use is `addFirst(item)` to re-queue a failed item
ahead of newer work.

## The unbounded queue, walked through

An unbounded queue can convert a sustained excess of admissions over departures into memory
growth. A queue with no capacity constraint does not reject or wait for space; that does not mean
every call is non-blocking or cannot fail through allocation, internal locks or user code.
No-arg `LinkedBlockingQueue` is effectively unbounded, but has a finite MAX_VALUE capacity and a
decreasing `remainingCapacity()`; neither provides a practical overload signal.

Where it hides: the no-arg `new LinkedBlockingQueue<>()`; `Executors.newFixedThreadPool(n)` and
`newSingleThreadExecutor()` (both use one — pool internals belong to executors-and-task-lifecycle,
the queue choice is ours); `PriorityBlockingQueue`, `DelayQueue`, `LinkedTransferQueue` and
`ConcurrentLinkedQueue`, none of which has a bounded variant.

One possible failure progression, to verify against measurements:

1. Queue age/depth climb even if CPU and worker count stay flat. During growth, account for
   admissions minus departures; do not treat unstable backlog as steady-state Little's Law.
   Match queue population to queue residence time — littles-law-and-queueing owns that analysis.
2. Retained queued work raises live memory and can increase GC pressure; collector behavior and
   payload retention determine the observed symptoms.
3. Requests time out downstream, clients retry, the arrival rate goes _up_, the queue grows faster
   — the metastable failure (cascading-failures).
4. `OutOfMemoryError: Java heap space`, with a heap dump dominated by the queue's `Node` objects
   or the captured state of the queued lambdas.
5. In-memory queued state is lost at a crash. Recoverability depends on a durable source and replay
   policy; an earlier acknowledgement does not make this queue durable and can make loss permanent.

## drainTo: batching without a per-element lock

`drainTo` "removes all available elements … and adds them to the given collection", may be more
efficient than repeated polling, throws `IllegalArgumentException` if you drain a queue to itself,
and leaves elements in neither, either or both collections if adding to `c` throws. It does not
wait for future arrivals and may return 0, but can block on internal locks or the destination's
`add`. It is neither a non-blocking-operation guarantee nor a transaction with the destination.

```java
import java.util.*;
import java.util.concurrent.BlockingQueue;

void consumeInBatches(BlockingQueue<Task> q, int maxBatch) throws InterruptedException {
    if (maxBatch <= 0) throw new IllegalArgumentException("maxBatch must be positive");
    List<Task> batch = new ArrayList<>(maxBatch);
    while (!Thread.currentThread().isInterrupted()) {
        batch.add(q.take());                 // block for the first element
        q.drainTo(batch, maxBatch - 1);      // bounded: never the unbounded overload
        handleBatch(batch);
        batch.clear();
    }
}
```

`drainTo(list)` without `maxElements` on a deep queue can materialise the whole backlog in one batch,
causing a latency/allocation spike and possibly memory exhaustion. Use the bounded overload when
batch memory and processing time must be controlled.
Once removed, the consumer owns the batch. If transfer, processing or cancellation fails, the
surrounding protocol must account for partial progress and recovery; a queue removal is not an
acknowledgement of successful processing. Do not blindly requeue partially applied work.

## LinkedTransferQueue: what it adds, and the JDK 21–25 bug

`transfer(e)` blocks until a consumer receives the element; `tryTransfer(e)` hands off only to an
_already waiting_ consumer and returns `false` otherwise; `tryTransfer(e, timeout, unit)` waits;
`hasWaitingConsumer()` and `getWaitingConsumerCount()` let a producer adapt. That is
`SynchronousQueue` semantics with buffering behind it, and it is the only reason to choose the
class.

**JDK-8371740, "LinkedTransferQueue.poll() returns null even though queue is not empty".**
The prior review recorded affected versions 21–25 and fix version 26. The OpenJDK fix is
[PR 28479](https://github.com/openjdk/jdk/pull/28479); its discussion also contains a 25u backport
request, which is not proof of a shipped fix. Check the deployed build's source/release notes.
The prior Temurin 25.0.3 run of the reporter's four-thread `offer`/`peek`/`poll` harness recorded
seven failed polls on a non-empty queue,
against zero for `LinkedBlockingQueue` and `ArrayBlockingQueue`. _Inference, not a cited changeset:_
the 25 `xfer` path reads `q = p.next` before attempting `p.cmpExItem(m, e)`, so a lost exchange on
a stale `q == null` breaks out and returns `null`, where mainline restarts the scan.

Even without that bug, one empty observation cannot establish completion while producers remain:

```java
Task t = ltq.poll();
if (t == null) {
    shutdownBecauseDrained();     // WRONG without an explicit producer-completion protocol
}
```

Symptom: a consumer loop that idles or exits with items still queued, or a "drained" assertion that
fails only under load. Prefer another queue when transfer-specific operations are unnecessary. If
the class is required, check the exact runtime build and backport status and make work completion an
explicit protocol rather than a single `poll() == null` observation.

Related: JDK-8301341 ("LinkedTransferQueue does not respect timeout for poll()") has fix version
22, so on affected JDK 21 builds the timed `poll` may also over- or under-wait.

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
        if (other == this) return 0;
        Retry retry = (Retry) other; // homogeneous DelayQueue<Retry>
        return Long.compare(dueNanos - retry.dueNanos, 0L);
    }
    static Retry in(Duration d, String payload) {
        if (d.isNegative()) throw new IllegalArgumentException("negative delay");
        return new Retry(payload, System.nanoTime() + d.toNanos());
    }
}
```

The queue must contain only `Retry` elements using the same monotonic clock. Pending deadlines,
including overdue items, must span less than 2^63 nanoseconds; subtraction then handles
`nanoTime` wraparound. `Duration.toNanos()` rejects values outside the long range. Compare
stored deadlines rather than sampling the clock separately for each operand: separate samples
can make even self/equal-deadline comparison nonzero. Keep deadlines immutable while enqueued;
change a deadline only by removing and reinserting the item. Remaining delay naturally decreases.
The other two failure modes are alerting on `size()` as "work due now" (it counts the
future too) and using an unbounded `DelayQueue` as a retry buffer during a downstream outage.

## ConcurrentLinkedQueue

Unbounded, non-blocking, Michael & Scott algorithm; weakly consistent iterators; bulk operations
(`addAll`, `removeIf`, `forEach`) are not atomic. The javadoc is explicit that **`size()` is NOT a
constant-time operation** — it traverses. `LinkedTransferQueue` carries the identical warning.

The anti-pattern this creates is exporting `size()` as a frequently scraped gauge on a large queue:
the metrics cost grows with the backlog being observed. Use `isEmpty()` only for an observational
empty/non-empty hint, or maintain an explicitly approximate counter alongside while accounting for
failed offers/removals and drift.

## Authoritative references

- [Java 25 `BlockingQueue`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/BlockingQueue.html)
- [Java 25 `LinkedBlockingQueue`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/LinkedBlockingQueue.html)
- [Java 25 `LinkedTransferQueue`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/LinkedTransferQueue.html)
- [Java 25 `DelayQueue`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/DelayQueue.html)
- [OpenJDK JDK-8371740](https://bugs.openjdk.org/browse/JDK-8371740)
- [OpenJDK JDK-8301341](https://bugs.openjdk.org/browse/JDK-8301341)
