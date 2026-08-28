# Collector selection and heap sizing

Read this only after GC has been confirmed as the bottleneck — pause time or pause
frequency showing up directly in the latency profile.

## Collector selection

| Collector    | Choose when                                                          |
| ------------ | -------------------------------------------------------------------- |
| G1 (default) | General server workloads, heaps 4–32 GB, pause target in tens of ms  |
| ZGC          | Pause must stay sub-millisecond regardless of heap size              |
| Shenandoah   | Same design point as ZGC; generational and product on the baseline   |
| Parallel     | Throughput matters more than pause time (batch, ETL, no latency SLO) |
| Serial       | Small containers, single core, short-lived processes                 |

**From JDK 27 (JEP 523) the JVM always selects G1 when no collector is named**, regardless
of processor count or available memory. The JDK 9-era ergonomic rule that fell back to
Serial on a small or single-CPU machine is gone, so Serial is now an explicit choice
(`-XX:+UseSerialGC`) rather than something a constrained container gets by default.

Two decisions this table does **not** make for you:

- **Whether to change collector at all.** It is a bigger lever than tuning one and a
  smaller lever than reducing allocation rate. Try them in that reverse order.
- **Whether the pause requirement is real.** Sub-millisecond pauses are bought with
  barriers and concurrent CPU. For batch work with no latency SLO, Parallel delivers more
  work per hour.

With a stop-the-world compacting collector the full-GC pause grows with heap size, so a
large heap plus a latency requirement rules out Parallel and Serial by construction.

## Heap sizing

```
-Xms<N> -Xmx<N>        # equal, always, in a container
```

A heap that grows pauses while it grows, and its GC behaviour changes as it grows — which
means yesterday's measurement does not describe today's process.

**Leave headroom for non-heap.** Metaspace, code cache, thread stacks, direct buffers and
the collector's own structures are all outside `-Xmx` and all count against the cgroup
limit. Measure them with NMT under real load rather than estimating; `jvm-memory-regions`
covers the budget.

### The 32 GB boundary

Above roughly 32 GB, compressed oops turn off and every reference doubles from 4 to 8
bytes. A pointer-rich 33 GB heap can hold **fewer** useful objects than a 31 GB one — one of
the few changes where raising a limit makes things worse. Evaluate `-Xmx31g` with ZGC before
crossing it.

## MaxGCPauseMillis

It is a target, not a guarantee, and G1 cannot honour it in the face of humongous
allocations, evacuation failure or a saturated old generation.

The counter-intuitive part: **lowering it shrinks the young generation**, which produces
more frequent collections and less time for objects to die in Eden, raising premature
promotion. For throughput under G1 the adjustment is usually to _raise_ the target.

Derive it from the SLO, knowing it is a target — not from a round number.

## When the flag is not the answer

| Log observation                                  | Actual investigation                          |
| ------------------------------------------------ | --------------------------------------------- |
| Frequent young collections, little promotion     | usually fine; look elsewhere                  |
| Frequent young collections, heavy promotion      | caches without eviction, oversized buffers    |
| Rising heap floor after full collection          | retention — a leak or an unbounded cache      |
| Full GCs with `G1 Evacuation Failure`            | why did old fill up? not "raise the heap"     |
| `Metadata GC Threshold`                          | Metaspace, not heap — see `jvm-class-loading` |
| Logged pause much smaller than client-felt pause | TTSP or the host — not the collector          |

The last two rows are the ones most often "fixed" with a heap flag that cannot possibly
help.

## Validating a change

- [ ] Same load, same duration, before and after
- [ ] Compare frequency, p99, max, total overhead and full-GC count — not one of them
- [ ] One variable per iteration
- [ ] A change that does not move the pause distribution is reverted, not kept
- [ ] Result **and mechanism** recorded
