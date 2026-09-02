# Collector selection and heap sizing

Read this only after GC has been confirmed as the bottleneck — pause time or pause
frequency showing up directly in the latency profile.

## Collector selection

The decision depends primarily on the pause the SLO can absorb and on the CPU the
collector may take from the application; heap size and throughput break the ties.

| Collector    | Pause model                                                                                                                    | Prefer when                                                                                                                 | Becomes problematic when                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 (default) | STW young and mixed pauses, concurrent marking; `MaxGCPauseMillis` target                                                      | The SLO tolerates pauses of tens of milliseconds, ≥ 2 CPUs, heap from a few hundred MB to tens of GB — the general case     | The SLO is single-digit ms at p99.9; the heap is so large that mixed pauses cannot fit the target; or the pod has one CPU (see the ergonomics note) |
| ZGC          | Concurrent marking and relocation; STW pauses independent of heap size (JEP 333/377, generational by definition since JEP 490) | p99 must stay below a millisecond, the heap is large, and there are spare CPUs for the concurrent threads                   | 1–2 CPUs (mutators and GC threads compete; allocation stalls), or when RSS is read as heap — ZGC's multi-mapping is zgc-and-shenandoah territory    |
| Shenandoah   | Same design point as ZGC; generational is product on 25 (JEP 521), default from 28 (JEP 535)                                   | The ZGC requirement, on a vendor build that ships Shenandoah and where its mode has been declared explicitly                | The same CPU constraints as ZGC; comparisons that omit `ShenandoahGCMode`                                                                           |
| Parallel     | STW everything, all cores; adaptive sizing                                                                                     | No latency SLO — batch, ETL, offline scoring — where work per hour is the metric                                            | Any user-facing latency requirement: full-GC pause grows with heap size                                                                             |
| Serial       | STW everything, one thread                                                                                                     | One CPU, small heap, short-lived or memory-minimal processes where a second GC thread would only steal from the application | Anything else — and, through JDK 26, anything that _ergonomically_ got it (below)                                                                   |

**CPU is the dimension most often missed.** GC thread counts come from the processor count
the JVM sees, measured on 25.0.3 with `-XX:ActiveProcessorCount`: G1 uses
`ParallelGCThreads = N` up to 8 and `8 + 5/8 × (N − 8)` above (4 CPUs → 4, 16 → 13), with
`ConcGCThreads` about a quarter of that (16 → 3); ZGC uses roughly `N × 5/8` parallel and
`N/8` concurrent (8 CPUs → 5 and 2, 2 CPUs → 2 and 1). A concurrent collector on a
2-CPU pod therefore runs its cycle on the same core the application needs, which is why
"we moved to ZGC and throughput fell" is a CPU-count finding, not a collector defect.

**Ergonomics through JDK 26:** a JVM that sees one CPU selects Serial (executed on 25.0.3:
`-XX:ActiveProcessorCount=1` → `UseSerialGC = true {ergonomic}`). The JDK 9-era rule also
demotes small-memory hosts; that half was not reproducible here without a cgroup, so
verify on the target with `jcmd <pid> VM.flags`. **From JDK 27 (JEP 523) the JVM always
selects G1 when no collector is named**, so Serial becomes an explicit choice
(`-XX:+UseSerialGC`) and a one-CPU pod that relied on the demotion changes collector on
upgrade.

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
covers the budget and the `MaxRAMPercentage` arithmetic. Note that in a container the
default heap is 25% of the limit (`MaxRAMPercentage`), so an unsized JVM in a 2 GB pod runs
a 512 MB heap — "GC is constant" in a new deployment is often just that.

### Sizing from the live set

The number the heap is sized from is the **live set**: what survives a complete
collection under representative load, not what the dashboard shows between collections.

1. Measure it. On a running replica: `jcmd <pid> GC.run` then `GC.heap_info`, repeated
   three times a few minutes apart under load; or the post-full/remark occupancy from the
   GC log (gc-log-analysis). Take the highest, not the average — the heap must fit the
   peak live set, and a live set that keeps rising is a leak (java-reference-types-and-leaks),
   which no sizing absorbs.
2. Measure the allocation rate from the same log (bytes promoted or allocated per second).
   It sets how much young space buys how much time between collections.
3. Size old for the live set plus the room the collector needs to run before it is full.
   Under G1 marking starts when old occupancy crosses the IHOP (45% of heap by default,
   adaptive on 25), so a live set that already sits above that fraction keeps marking
   running back-to-back and drifts toward evacuation failure — the total heap wants the
   live set well under half of it. Hunt and John's _Java Performance_ (2011, ch. 7) gives
   three to four times the live set as the starting total; treat it as the first
   iteration, not the answer.
4. Under a concurrent collector, the heap must also absorb `allocation rate × cycle time`
   while the cycle runs, or the mutators stall on allocation — the sizing and the
   `Allocation Stall` signal are zgc-and-shenandoah.
5. Fit the result into the container budget (jvm-memory-regions) and, if it does not fit,
   the trade is a smaller live set or a bigger pod — not a smaller margin.
6. Validate the way the baseline was measured: same load, same duration, compare pause
   distribution, full-GC count and the post-collection floor.

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
