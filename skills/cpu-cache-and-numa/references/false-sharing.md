# False sharing

## Distinguishing it from lock contention

|                         | False sharing                           | Lock contention                                |
| ----------------------- | --------------------------------------- | ---------------------------------------------- |
| Synchronisation in code | none                                    | `synchronized` / explicit `Lock`               |
| Correctness             | correct and deterministic               | correct, but serialised                        |
| Signal in `perf`        | high cache misses and coherency traffic | high context switches and `futex`              |
| Signal in a profiler    | time on the access instruction          | time in `park` / `monitorenter`                |
| Signal in JFR           | **none**                                | `jdk.JavaMonitorEnter`, `jdk.ThreadPark`       |
| Fix                     | separate the data physically            | shrink the lock scope, partition, go lock-free |

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

- [ ] Scaling efficiency `(thr_N / thr_1) / N` measured, and below 0.5
- [ ] Throughput **worsens** as threads are added (capacity limits never do this)
- [ ] Lock contention and true sharing ruled out first
- [ ] MPKI compared against the **application's own baseline**, not a published threshold
- [ ] Stack located with `asprof -e LLC-load-misses`
- [ ] Layout proven with JOL, not calculated mentally
- [ ] Fix validated with JMH at the same thread count

## Proving the layout

```java
System.out.println(ClassLayout.parseClass(ConnectionPool.class).toPrintable());
```

`long` and `double` align to 8 bytes. Which offset they land on depends on the header, so
state the mode before doing any arithmetic:

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

1. **Move the metric to a separate object.** Resolves the conflict and improves cache
   density of the hot state. Almost always better than padding.
2. **`LongAdder` instead of `AtomicLong`** for contended counters. Its `Cell`s are already
   padded and it needs no internal API. With few threads `AtomicLong` wins; with many, the
   order reverses.
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

The difference is not only boxing. The prefetcher cannot anticipate the next address,
because it is only known after the reference arrives.

- [ ] Primitive arrays instead of object arrays where possible
- [ ] Sequential rather than random traversal over large collections
- [ ] Hot and cold fields separated, so a line is not wasted
- [ ] The hot loop's working set compared with the LLC size
