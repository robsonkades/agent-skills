# Lock-free structures

## Progress guarantees

| Guarantee        | What it guarantees                                                                      | Example                                                                      | Typical cost to implement                                         |
| ---------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Wait-free        | EVERY thread completes in a finite number of steps, whatever the others do              | `AtomicInteger.getAndIncrement()` — one atomic instruction, no visible retry | Hard for composite operations; rare outside simple primitives     |
| Lock-free        | AT LEAST ONE thread completes per round of contention; individual starvation is allowed | `ConcurrentLinkedQueue` (Michael-Scott), Treiber stack                       | A CAS retry loop — one thread's failure implies another's success |
| Obstruction-free | A thread running WITHOUT interference always progresses; nothing under real contention  | Rare on its own in production; usually an intermediate design step           | Easier to prove, insufficient alone under load                    |

The distinction that matters in practice: lock-free means "without a _lock_", not "without
waiting". A thread can burn CPU in a CAS retry loop, and the system still progresses because
each failed CAS implies some other thread's CAS succeeded. That chaining — failure implies
someone else's progress — is what separates lock-free from "blocked thread trying again".

## Treiber stack, with the ordering anchors marked

```java
public class LockFreeStack<T> {

    private static class Node<T> {
        final T item;
        Node<T> next;                 // plain field — only read after 'current' is published by CAS
        Node(T item) { this.item = item; }
    }

    private final AtomicReference<Node<T>> top = new AtomicReference<>();

    public void push(T item) {
        Node<T> newNode = new Node<>(item);
        Node<T> current;
        do {
            current = top.get();          // acquire read
            newNode.next = current;       // plain write — carried by the CAS release below
        } while (!top.compareAndSet(current, newNode));
        // compareAndSet has full volatile semantics: everything written BEFORE it in this
        // thread — newNode.next included — is visible to any thread that later reads 'top'.
    }

    public T pop() {
        Node<T> current;
        Node<T> next;
        do {
            current = top.get();
            if (current == null) return null;
            next = current.next;          // safe: current only became visible already published
        } while (!top.compareAndSet(current, next));
        return current.item;
    }
}
```

The load-bearing detail is the order inside `push`: `newNode.next` is written _before_ the
CAS. Writing it after — a common slip in a hurried rewrite — leaves no ordering guarantee at
all, and another thread can observe `newNode` with `next` unpublished.

`Atomic*` classes use volatile semantics for plain read and write, and full acquire-plus-
release for `compareAndSet` and the other CAS operations. That is why application code never
inserts a manual barrier around a CAS.

## Michael-Scott queue, and what "helping" adds

`ConcurrentLinkedQueue` is a production implementation of the 1996 Michael and Scott
algorithm: an MPMC queue CAS-ing `head` and `tail` separately, with a sentinel node and a
_helping_ mechanism the single-CAS Treiber stack does not need.

```java
public void enqueue(T item) {
    Node<T> newNode = new Node<>(item);
    while (true) {
        Node<T> last = tail.get();
        Node<T> next = last.next.get();
        if (last == tail.get()) {                     // tail still consistent
            if (next == null) {                        // 'last' really is the final node
                if (last.next.compareAndSet(null, newNode)) {
                    tail.compareAndSet(last, newNode); // advance tail; failing here is fine
                    return;
                }
            } else {
                tail.compareAndSet(last, next);        // tail lagging — help it forward
            }
        }
    }
}

public T dequeue() {
    while (true) {
        Node<T> first = head.get();
        Node<T> last = tail.get();
        Node<T> next = first.next.get();
        if (first == head.get()) {
            if (first == last) {
                if (next == null) return null;         // empty
                tail.compareAndSet(last, next);        // tail lagging — help it forward
            } else {
                T value = next.item;
                if (head.compareAndSet(first, next)) return value;
            }
        }
    }
}
```

Two structural points to preserve in any variant: the queue is momentarily inconsistent
between the two CAS operations of an enqueue, and every other thread is expected to _help_
finish it rather than wait. That is what keeps the structure lock-free when the enqueuing
thread is preempted between its two CAS operations.

## ABA, and the fix when it is reachable

CAS compares only the current _value_ against the expected one; it keeps no memory of how
many times that value changed in between. If a thread reads A, the value goes to B and back
to A before the CAS runs, the CAS succeeds even though the real state changed.

In Java this is unreachable for object references the algorithm does not recycle. The
guarantee is not "addresses are never reused" — compacting collectors move objects and reuse
addresses constantly. It is **reference identity**: while a thread holds a live Java
reference, that reference always resolves to the same logical object, however many times the
collector relocated it.

ABA comes back in exactly two situations:

- the algorithm recycles nodes explicitly from a pool — a deliberate optimisation under GC
  pressure;
- the CAS is over a primitive that legitimately cycles. A counter that decrements back to a
  previous value has no identity to preserve, and CAS cannot tell "the same 5 as before" from
  "a 5 that went to 3 and came back".

```java
private final AtomicStampedReference<Node<T>> top = new AtomicStampedReference<>(null, 0);

public void push(T item) {
    Node<T> newNode = new Node<>(item);
    int[] stampHolder = new int[1];
    Node<T> current;
    int stamp;
    do {
        current = top.get(stampHolder);   // reads value AND stamp
        stamp = stampHolder[0];
        newNode.next = current;
    } while (!top.compareAndSet(current, newNode, stamp, stamp + 1));
    // the stamp only ever grows -> ABA is impossible inside the stamp space
}
```

`AtomicMarkableReference` carries a single boolean instead of a counter — typically
"logically removed" — and covers a narrower subset of the problem.

The third option is the common one: do nothing, because without a node pool the JVM's
reference identity already closes the hole.

## Ring buffer pipeline

```
Ring buffer, size a power of two:
  slot = sequence & (size - 1)      -> O(1) indexing, no real modulo
  producer sequence: next slot to fill
  consumer sequence: next slot to process
  natural backpressure: the producer waits when the buffer is full
```

Five distinct reasons such a pipeline is fast, only one of which is CAS:

1. **Pre-allocation** — every event object is allocated at construction, so normal operation
   allocates nothing per message and adds no GC pressure.
2. **Cache-friendly layout** — a contiguous array with sequential access, the opposite of a
   linked structure.
3. **Lock-free claim** — under `ProducerType.MULTI` producers CAS to reserve the next slot;
   under `ProducerType.SINGLE` there is not even that, since a lone producer just increments.
   Neither path enters a monitor.
4. **Batch processing** — a lagging consumer takes every available slot at once, amortising
   per-message cost when there is a backlog.
5. **Sequence isolation** — the hot, high-frequency position counters are padded into their
   own cache lines to avoid false sharing between producer and consumers; the exact padding
   mechanism varies by library version.

Attributing the whole gain to "lock-free" is the standard error. Pre-allocation and cache
locality usually weigh as much or more.

### Wait strategies, the CPU-versus-latency dial

```
BusySpinWaitStrategy:  endless spin              -> minimum latency, 100% CPU
YieldingWaitStrategy:  spin + Thread.yield()     -> low latency
SleepingWaitStrategy:  spin + yield + sleep      -> balanced
BlockingWaitStrategy:  lock + condition          -> minimum CPU, highest latency
```

```java
int bufferSize = 1024;  // MUST be a power of two
Disruptor<ValueEvent> disruptor = new Disruptor<>(
    ValueEvent.FACTORY, bufferSize, DaemonThreadFactory.INSTANCE,
    ProducerType.SINGLE, new YieldingWaitStrategy());

disruptor.handleEventsWith((event, sequence, endOfBatch) -> handle(event));
disruptor.start();

RingBuffer<ValueEvent> ringBuffer = disruptor.getRingBuffer();
long sequence = ringBuffer.next();      // claim a slot
try {
    ValueEvent event = ringBuffer.get(sequence);
    event.value = 42;                   // fill in place — no allocation
} finally {
    ringBuffer.publish(sequence);       // hand off to the consumer
}
```

The `try`/`finally` is not stylistic: a claimed sequence that is never published stalls every
consumer behind it permanently.
