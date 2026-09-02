# Symptoms and collector behaviour

Every number here was executed on Temurin 25.0.3 (G1 unless stated); the source file names are
from the JDK 25 GA tree. Re-run the reproduction on the deployed JDK before quoting a figure.

## The arithmetic

```
Young GC interval  ≈  Eden capacity / allocation rate
Young GC duration  ≈  f(live bytes in the collection set, cross-region references)
GC overhead        ≈  duration / interval
```

Reducing allocation lengthens the interval; it does not shorten the pause, because a young
pause copies survivors and the survivors are decided by lifetime, not by how fast the garbage
between them was produced. Two corollaries decide investigations:

- **A workload that allocates 2× faster with the same live set pays 2× the GC overhead** at
  the same Eden size. Halving the rate at the named site is worth exactly what the profile
  says the site is; the checklist's "Y% of total" is the expected overhead reduction.
- **A pause that grew without the rate growing is a live-set problem** — promotion, a cache,
  a leak — and allocation profiling will not find it. Hand it to `heap-dump-analysis` or
  `java-reference-types-and-leaks`.

G1 sizes Eden adaptively towards `MaxGCPauseMillis` (`G1NewSizePercent` 5% to
`G1MaxNewSizePercent` 60% of the heap, both experimental): a pause-time goal that is too tight
shrinks Eden, which raises frequency for a given rate. Frequent young GCs with a low
allocation rate is a sizing symptom, not an allocation one — `g1-internals` owns it.

## What each collector does with allocation

| Collector          | TLAB ceiling (`max_tlab_size()`)                           | Large objects                                                                                              | Allocation-driven pause or stall                                                                                                                                    |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1                 | Humongous threshold: half a region (`g1CollectedHeap.cpp`) | ≥ half a region: **humongous**, allocated directly in contiguous Old regions, never in a TLAB              | `Pause Young (Concurrent Start) (G1 Humongous Allocation)` when humongous regions push occupancy over the IHOP threshold; `(G1 Evacuation Pause)` when Eden is full |
| ZGC (generational) | Page-based; small, medium and large page classes           | Large objects get their own page; the stall event records `type = "Large"` and `size`                      | `jdk.ZAllocationStall` per stalled thread with a stack trace; `[gc,alloc] Allocation Stalls:` table per GC; GC cause `Minor Collection (Allocation Rate)`           |
| Parallel           | Eden-based                                                 | Fails over to Old when Eden cannot fit it; no humongous concept                                            | `Pause Young (Allocation Failure)`                                                                                                                                  |
| Serial             | Eden-based                                                 | `PretenureSizeThreshold` (default 0 = off) sends objects above it straight to Old (`defNewGeneration.cpp`) | `Pause Young (Allocation Failure)`                                                                                                                                  |

### G1 humongous allocation

The region size is ergonomic: with a default max heap of about 8 GB on this host,
`G1HeapRegionSize = 4194304 {ergonomic}`, so every array of 2 MB or more is humongous. The
reproduction allocated a 3 MB `byte[]` once per 1,024 iterations of a 1 KB allocation loop:

```
[0.313s] GC(1) Pause Young (Concurrent Start) (G1 Humongous Allocation) 261M->227M(512M) 1.195ms
[0.312s] GC(1) Humongous regions: 56->56
```

606 young pauses in 4 s, 274 of them `(G1 Humongous Allocation)`. Three things make humongous
objects expensive out of proportion to their bytes:

- Each one occupies whole regions (a 3 MB object holds a 4 MB region; a 4.1 MB object holds
  two), so the humongous footprint counts against the IHOP threshold and starts concurrent
  cycles.
- They are allocated under the heap lock, outside any TLAB, and can force a pause by
  themselves when no contiguous regions are free (`attempt_allocation_humongous`, cause
  `_g1_humongous_allocation`).
- They are reclaimed at a young pause only if eager reclaim nominates them — a primitive
  array or an object with few remembered-set entries (`G1EagerReclaimRemSetThreshold`, 32,
  experimental; the old `G1EagerReclaimHumongousObjects` switch no longer exists on 25).
  Otherwise they wait for a mixed or full collection.

Distinguish and fix:

| Evidence                                                                         | Fix                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `-Xlog:gc+humongous=debug` names the sizes; `Humongous regions: N->N` stays high | The objects are live — a cache of large buffers; size them once and reuse                  |
| `Humongous regions: N->0` at each pause, high pause count                        | Per-request buffers dying young — chunk the I/O, or pool the buffer (the one pooling case) |
| Sizes just over half a region                                                    | `-XX:G1HeapRegionSize=` to the next power of two, measured; or trim the array by design    |
| `jdk.ObjectAllocationOutsideTLAB` / brown frames dominate the profile            | Same objects seen from the allocation side — the class at the top names the buffer         |

### ZGC allocation stalls

A stall is a mutator thread waiting because the concurrent cycle has not freed memory fast
enough — the allocation rate exceeded what the collector's pacing
(`ZAllocationSpikeTolerance`, 2.0) provisioned for. The reproduction at `-Xmx80m` recorded
295 `jdk.ZAllocationStall` events in 2 s, each with the stalled thread, `type = "Large"`,
`size = 4.0 MB`, and a stack trace to the allocation site — which makes the event an
allocation profile of exactly the sites that hurt. `-Xlog:gc*=info` shows only the per-GC
`Allocation Stalls:` counter table; the events are the evidence. Remedies in order: reduce
the rate at the named site, raise the heap so the cycle has headroom, then
`ZAllocationSpikeTolerance`; collector-side detail is `zgc-and-shenandoah`.

## Why three tools give three numbers

| Measurement                              | Counts                                                                   | Bias                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `jdk.ObjectAllocationSample` Σ`weight`   | Bytes allocated, exact in aggregate (22.98 vs 22.96 GB)                  | Per-sample weight is meaningless alone; a class allocated rarely may draw no sample at all  |
| `asprof -e alloc` (JVMTI sampler)        | Bytes at the sampling interval, attributed to the object that crossed it | Sub-interval objects are represented proportionally; `--alloc` too coarse hides small sites |
| `asprof -e alloc --tlab` / legacy events | One event per refill or outside-TLAB allocation                          | Threads with small TLABs are over-represented; large objects are over-represented           |
| `jdk.ThreadAllocationStatistics`         | Exact bytes per thread, no site                                          | Includes TLAB waste; virtual threads reported by name, carriers separately                  |
| `GC.class_histogram`                     | Bytes retained at the snapshot                                           | Not a rate; short-lived classes are invisible                                               |
| GC log Eden delta                        | Bytes allocated in Eden between pauses                                   | Excludes humongous (G1) and pretenured (Serial) objects that never touched Eden             |

A class that dominates the histogram but not the profile is retained, not churned; a class
that dominates the profile but not the histogram is churn. Both dominating is the promotion
case — a site that allocates a lot and keeps it.

## Symptom table

| Symptom                                                                   | Likely cause                                                      | How to distinguish                                                                                 | Remediation                                                                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GC overhead > 10-15%, pauses short, very frequent                         | High allocation rate into a small Eden                            | Interval from the log; rate from `ThreadAllocationStatistics`; profile names the sites             | Fix the named sites; only then Eden sizing                                                     |
| GC overhead high, pauses long, interval normal                            | Live set or promotion, not allocation                             | `Pause Young` before→after shows little reclaimed; `--live` profile or `OldObjectSample` is large  | Retention work: heap dump, leak patterns                                                       |
| `(G1 Humongous Allocation)` pauses, `Humongous regions` in the log        | Arrays ≥ half a region                                            | `-Xlog:gc+humongous=debug`; outside-TLAB events name the class                                     | Chunk, reuse, or raise `G1HeapRegionSize`                                                      |
| `jdk.ZAllocationStall` events, `Allocation Stalls` counter rising         | Rate outran the concurrent cycle                                  | Event stack traces name the sites; `Minor Collection (Allocation Rate)` cause                      | Reduce the rate at those sites, then heap headroom, then spike tolerance                       |
| p99 spikes blamed on TLAB refill                                          | Almost never refill; usually a pause or a stall                   | Spike timestamps match `Pause Young` / stall events; `slow allocs` in `gc+tlab=trace` is small     | Treat as GC latency and attribute the pause                                                    |
| JFR recording has no `jdk.ObjectAllocationInNewTLAB` events               | The legacy events are off in both shipped `.jfc` files            | `jfr summary` shows `ObjectAllocationSample` present                                               | Read `ObjectAllocationSample`; enable the legacy pair only for `jfr view tlabs`                |
| `jfr view allocation-by-site` differs from the async-profiler flame graph | Different samplers, different intervals, different windows        | Compare Σ`weight` and the profile's total against `ThreadAllocationStatistics` for the same window | Trust the ranking where both agree; investigate a site only one of them shows before acting    |
| `byte[]` dominates every profile                                          | Strings (JEP 254), I/O buffers, serialisation                     | Walk one frame down: `StringConcatHelper`, `String.encode`, a codec, a socket                      | The fix depends on the parent frame, not the array                                             |
| `Object[]` / `HashMap$Node[]` dominate                                    | Unsized collections growing                                       | `ArrayList.grow`, `HashMap.resize` in the stack                                                    | Pre-size from the known result size                                                            |
| `jdk.internal.vm.StackChunk` high in a virtual-thread service             | Deep stacks parked often                                          | Parent frames are `park`/`yield`; `pinned-threads` view empty                                      | Park with a shallower stack; batch the blocking call; measure before restructuring             |
| `FillerElement[]` / `FillerObject` in a histogram                         | Retired-TLAB fillers, not a leak                                  | Unreferenced, size tracks thread count × TLAB size                                                 | None                                                                                           |
| `ThreadMXBean.getThreadAllocatedBytes` returns `-1`                       | Virtual thread                                                    | `Thread.isVirtual()`                                                                               | Measure at the carrier or the submitting platform thread; use JFR for per-virtual-thread bytes |
| Alloc profile changed after a deploy with no code change at the site      | JIT state: inlining or escape analysis differed, or a deopt       | Compare JMH `-prof gc` B/op in isolation; check for deoptimisation events                          | Stabilise the compilation, not the allocation site                                             |
| Rate unchanged after the fix, site gone from the profile                  | The bytes moved to another site, or the site was never the driver | Compare total Σ`weight` before and after under the same load                                       | Re-rank; the checklist's Y% was wrong                                                          |

The spike-attribution row hands off to `pause-attribution`; the JIT row to
`jit-inlining-and-escape-analysis`.
