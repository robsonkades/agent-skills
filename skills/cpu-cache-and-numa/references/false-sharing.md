# False sharing

## Distinguishing it from lock contention

|                         | False sharing                                  | Lock contention                                    |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Synchronisation in code | none                                           | `synchronized` / explicit `Lock`                   |
| Correctness             | correct and deterministic                      | correct, but serialised                            |
| Signal in `perf`        | cache-to-cache/HITM evidence on supported PMUs | may show futex/parking; spin locks may stay on CPU |
| Signal in a profiler    | time on the access instruction                 | time in `park` / `monitorenter`                    |
| Signal in JFR           | **none**                                       | `jdk.JavaMonitorEnter`, `jdk.ThreadPark`           |
| Fix                     | separate the data physically                   | shrink the lock scope, partition, go lock-free     |

The JFR row is the most useful in practice: **false sharing generates no event at all**. If
throughput is poor and every blocking tool says the system is healthy, this is the
hypothesis.

## The shape of the bug

```java
class ConnectionPool {
    volatile int available;      // state, written by application threads
    volatile int inUse;
    volatile long totalBorrows;  // metric added "for convenience"
    // all three inside the same 64 bytes: every borrow invalidates the state
}
```

Three hot fields, written by many threads, in one line — triple false sharing, made worse
by `volatile` forcing every write to be visible.

Note what the explanation is **not**: a volatile write does not flush the cache. It drains
the store buffer and forbids reordering; propagation is MESI invalidation, and a volatile
read is served from L1 when the line is valid. Getting this wrong leads to the wrong fix.

## Detection procedure

- [ ] Full scaling curve and competing CPU/GC/lock/queue hypotheses captured
- [ ] Throughput worsens as independent writers are added in a controlled comparison
- [ ] Lock contention and true sharing ruled out first
- [ ] MPKI compared against the **application's own baseline**, not a published threshold
- [ ] Coherence evidence collected with a supported PMU/`perf c2c`; LLC misses not used alone
- [ ] Layout proven with JOL, not calculated mentally
- [ ] Fix validated with JMH at the same thread count

## Proving the layout

```java
System.out.println(ClassLayout.parseClass(ConnectionPool.class).toPrintable());
```

Which offset a field occupies depends on HotSpot layout policy and VM mode, so state the
environment and trust the measured listing rather than the following common examples:

- **12-byte header** (the default through JDK 26): the first `long` lands at offset 16, and
  the 12–15 hole is filled by a 4-byte field if one exists.
- **8-byte header** (`-XX:+UseCompactObjectHeaders` on JDK 24–26; the default from JDK 27,
  JEP 534): the first `long` lands at offset 8 and there is no hole to fill.

This is why mental arithmetic is unreliable and why the tool takes two minutes — and why a
JOL listing is only meaningful alongside the JDK and the header mode that produced it.
Compact headers shift every offset, and by packing more fields per line they can worsen
false sharing while improving footprint.
Re-run JOL if you enable it.

## Correction options, in order of preference

1. **Move the metric to a separate object.** Often resolves the conflict and improves cache
   density of hot state; validate the extra indirection and allocation/lifetime cost.
2. **`LongAdder` instead of `AtomicLong`** for contended statistics when a non-linearizable
   aggregate is acceptable. It does not replace an atomic sequence/value contract.
3. **`@Contended`** as a last resort. It pads to 128 bytes because of the adjacent-line
   prefetcher, and in application code it requires `--add-exports` **and**
   `-XX:-RestrictContended` — without the second it is silently ignored. If the object is
   allocated on a hot path, check that the padding is not multiplying GC pressure.

Do not build anything on absolute addresses: the GC moves objects and the default alignment
is 8 bytes, not 64. Only padding _inside_ the object is stable across compaction.

## Data locality

```java
// Pointer chasing: the array holds references, the objects are scattered
Long[] prices = new Long[1_000_000];

// Contiguous, prefetchable, no indirection
long[] prices = new long[1_000_000];
```

The difference is not only boxing. The reference array is contiguous and can be prefetched,
but referenced objects need not be adjacent, adding dependent loads and less predictable
locality than a primitive array.

- [ ] Primitive arrays instead of object arrays where possible
- [ ] Sequential rather than random traversal over large collections
- [ ] Hot and cold fields separated, so a line is not wasted
- [ ] The hot loop's working set compared with the LLC size
