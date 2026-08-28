# The marking cycle, its log and its flags

## The cycle from trigger to mixed collection

```
Young GC allocates in Eden
  |  old occupancy crosses IHOP (static floor, or the adaptive prediction)
  v
Pause Young (Concurrent Start)     STW, piggybacked on a young GC —
                                   marks roots, arms the SATB write barrier
Root Region Scan                   concurrent — scans survivor regions
Concurrent Mark From Roots         concurrent — walks the graph using the
                                   mark bitmap and TAMS; local SATB buffers
                                   flush into the global queue as they fill
Pause Remark                       STW — drains the global SATB queue,
                                   finalises the cycle's bitmap
Concurrent Rebuild Remembered Sets
  and Scrub Regions                concurrent — since JDK 20 (JDK-8210708)
Pause Cleanup                      STW — sums live percentage per region,
                                   recycles wholly empty regions
Concurrent Cleanup                 concurrent — returns free regions to the pool
  |
  v
Mixed GC                           several later STW pauses; selects regions
                                   using the mark bitmap's liveness data
```

`Pause Cleanup` is sub-millisecond to a few milliseconds — it only sums liveness percentages
the bitmap already established. `Concurrent Cleanup` can run milliseconds to tens of
milliseconds and is, by definition, not a pause.

## An annotated complete cycle

```
# ordinary young GC
[0.512s][info][gc] GC(5) Pause Young (Normal) (G1 Evacuation Pause)
                   512M->256M(1024M) 8.234ms

# mixed GC
[1.024s][info][gc] GC(12) Pause Young (Mixed) (G1 Evacuation Pause)
                   768M->512M(1024M) 12.456ms

# the marking cycle, phases in order
[1.500s][info][gc]         GC(15) Concurrent Mark Cycle
[1.500s][info][gc]         GC(15) Pause Young (Concurrent Start) (G1 Evacuation Pause)
                            768M->520M(1024M) 9.812ms          # STW
[1.502s][info][gc,marking] GC(15) Concurrent Mark From Roots
[1.549s][info][gc,marking] GC(15) Concurrent Mark From Roots 47.234ms
[1.549s][info][gc]         GC(15) Pause Remark 1.456ms          # STW
[1.551s][info][gc]         GC(15) Pause Cleanup 0.234ms         # STW
[1.551s][info][gc]         GC(15) Concurrent Cleanup 2.345ms    # concurrent
[1.553s][info][gc]         GC(15) Concurrent Mark Cycle 52.891ms

# humongous allocation
[2.000s][info][gc,humongous] GC(20) Humongous allocation for object
                              size 2097152B, new region starting at 0x...

# full GC
[5.000s][info][gc] GC(50) Pause Full (Allocation Failure)
                   1024M->512M(1024M) 892.341ms
```

The occupancy in each `Pause Young (Concurrent Start)` line is the datum to trend. Rising
occupancy at trigger time across successive cycles means the trigger is falling behind the
real promotion rate.

## Logging flags

```bash
# base, needed for everything else to be interpretable
-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m

# marking mechanics, including mark stack overflow
-Xlog:gc+marking=debug:file=gc_mark.log

# humongous allocation events
-Xlog:gc+humongous=info:file=gc_hum.log

# remembered set, to correlate RSet cost with marking duration
-Xlog:gc+remset=trace:file=gc_remset.log
-XX:+UnlockDiagnosticVMOptions -XX:G1SummarizeRSetStatsPeriod=1
```

`-XX:+G1SummarizeConcMark` appears in runbooks written before 2017 and was removed by the
unified logging work (JEP 158, JDK 9). It has no replacement of the same shape;
`-Xlog:gc+marking=debug` covers the marking mechanics.

**`-XX:+G1SummarizeRSetStats` is gone too**, and it fails the loud way. Executed on Temurin 11,
17, 18, 19, 20, 21, 24 and 25 — every one of them answers:

```
Unrecognized VM option 'G1SummarizeRSetStats'
Did you mean 'G1SummarizeRSetStatsPeriod=<value>'?
Error: Could not create the Java Virtual Machine.
```

So the boolean has not existed on any supported release; the JVM itself names the survivor.
`-XX:G1SummarizeRSetStatsPeriod=<n>` (diagnostic, default `0` = off) prints the summary every
_n_ GCs. Paired with `gc+remset=trace` that covers RSet overhead.

**`-XX:+G1EagerReclaimHumongousObjects` was removed in JDK 20.** It is experimental with default
`true`, accepted on 11 through 19, and `Unrecognized VM option` from 20 — measured on each of
those releases. Its companion `G1EagerReclaimHumongousObjectsWithStaleRefs` has the same
lifetime. A tuning post written before 2023 will still recommend it, and it stops a modern JVM
from starting.

## Tuning and diagnostic flags

| Flag                                 | Default                                         | Controls                                                                                         |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `-XX:InitiatingHeapOccupancyPercent` | 45                                              | Initial floor for the marking trigger; the only value used when the adaptive predictor is off    |
| `-XX:+G1UseAdaptiveIHOP`             | `true`                                          | Enables adaptive prediction of the trigger point                                                 |
| `-XX:G1EagerReclaimRemSetThreshold`  | experimental, ergonomic — 16 on 17–24, 32 on 25 | Remembered-set entry count above which a humongous region stops being eligible for eager reclaim |
| `-XX:ConcGCThreads`                  | derived from `ParallelGCThreads`                | Threads dedicated to concurrent marking; verify the derivation on the runtime in use             |
| `-XX:G1HeapRegionSize`               | ergonomic (heap/2048, clamped 1–32 MB)          | Sets the humongous threshold (`> size/2`); settable up to 512 MB since JDK 18                    |

```bash
java -XX:+PrintFlagsFinal -version | grep -E "InitiatingHeapOccupancyPercent|G1UseAdaptiveIHOP|ConcGCThreads"
java -XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version | grep G1EagerReclaim
java -XX:+PrintFlagsFinal -version | grep -i ihop
java -XX:+PrintFlagsFinal -version | grep SATB
```

On JDK 27 `-XX:InitiatingHeapOccupancyPercent` is deprecated and aliased to `-XX:G1IHOP`
(obsolete in 28, expired in 29). The `grep -i ihop` recipe above finds it under either
name, which is why it is the one to keep in a runbook.

`G1SATBBufferSize` and `G1SATBBufferEnqueueingThresholdPercent` are diagnostic flags, not
routine tuning; their defaults are not stable across releases, so read them off the runtime
rather than quoting the figures that circulate (roughly 1024 entries and 60%).

## How the adaptive predictor decides

With `G1UseAdaptiveIHOP=true`, `InitiatingHeapOccupancyPercent` is the floor used only until
the predictor has enough samples (`G1AdaptiveIHOPNumInitialSamples`). Once calibrated, G1
estimates the old generation's observed growth rate in bytes per second and the historical
duration of a complete marking cycle, then starts the next cycle early enough that marking
finishes **before** old reaches capacity — which is generally not at 45%.

Consequences worth predicting correctly:

- A traffic peak that triples the promotion rate should make a well-calibrated predictor fire
  at a **lower** occupancy percentage, to keep the same time margin before old fills.
- If the peak is too fast for the predictor to accumulate samples covering the new regime, the
  opposite happens: it keeps applying the previous regime's model and fires too late.
- Bursty traffic is therefore the case where `-XX:-G1UseAdaptiveIHOP` plus a conservative fixed
  value is defensible — worse on average, but predictable, against a predictor that is
  chronically one regime behind.

The exact prediction formula (moving average, percentile, safety margin) and the default of
`G1AdaptiveIHOPNumInitialSamples` are not stable across releases. Confirm on the runtime
before deciding to disable the predictor.

## JFR

```bash
jcmd <pid> JFR.start settings=profile duration=120s filename=g1.jfr

jfr print --events jdk.GarbageCollection g1.jfr
jfr print --events jdk.GCPhasePause g1.jfr
jfr print --events jdk.GCHeapSummary g1.jfr
```

Do not quote G1-specific region or marking event names without confirming they exist on the
runtime in use. Discover them instead:

```bash
jfr summary g1.jfr | grep -i g1
```

## HotSpot source paths

```
src/hotspot/share/gc/g1/
  g1CollectedHeap.cpp              main cycle, orchestration
  g1ConcurrentMark.cpp             concurrent marking, mark bitmap, TAMS
  g1ConcurrentRebuildAndScrub.cpp  rebuild remembered sets and scrub (JDK 20, JDK-8210708)
  heapRegion.cpp                   region management
  g1SATBMarkQueueSet.cpp           G1's specialisation of the SATB queue set

src/hotspot/share/gc/shared/
  satbMarkQueue.cpp                generic SATB queue infrastructure, shared with Shenandoah
```

`g1SATBMarkQueue.cpp` is cited in older material and does not match the post-JDK-9 repository
layout: the generic infrastructure lives under `gc/shared/`, the G1 specialisation under
`gc/g1/`.
