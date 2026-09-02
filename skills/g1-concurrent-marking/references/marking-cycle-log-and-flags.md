# The marking cycle, its log and its flags

## The cycle from trigger to mixed collection

```
Young GC allocates in Eden
  |  old occupancy crosses the effective IHOP (static floor, or the adaptive prediction),
  |  or a humongous allocation requests a cycle (cause: G1 Humongous Allocation)
  v
Pause Young (Concurrent Start)     STW, piggybacked on a young GC —
                                   marks roots, arms the SATB write barrier
Concurrent Mark Cycle              wrapper line; "Concurrent Undo Cycle" instead means
                                   eager reclaim already resolved the trigger (JDK 17+)
Concurrent Scan Root Regions       concurrent — scans survivor regions
Concurrent Mark                    concurrent — contains:
  Concurrent Mark From Roots         walks the graph using the mark bitmap and TAMS;
                                     local SATB buffers flush into the global queue
  Concurrent Preclean                processes discovered references early
Pause Remark                       STW — drains the global SATB queue, finalises the
                                   bitmap, unloads classes
Concurrent Rebuild Remembered Sets
  and Scrub Regions                concurrent — builds RSets for the regions selected as
                                   collection candidates (JDK 20, JDK-8210708)
Pause Cleanup                      STW — finalises the candidate list
Concurrent Clear Claimed Marks     concurrent — bookkeeping
Concurrent Cleanup for Next Mark   concurrent — resets the bitmap for the next cycle
  |
  v
Pause Young (Prepare Mixed)        one more young GC
Pause Young (Mixed) × N            selects candidates using the bitmap's liveness data
```

`Pause Cleanup` is sub-millisecond to a few milliseconds. `Concurrent Cleanup for Next Mark`
is, by definition, not a pause; a report calling it a short STW pause is self-contradictory.
`Concurrent Cleanup` without a suffix is a pre-JDK-20 name.

## A complete cycle, captured on JDK 25

Written with `-Xlog:gc*,gc+marking=debug:file=gc.log:uptime,level,tags` (`time` omitted
here for width). The marking phases sit under the `gc,marking` tag at `info`; `gc*` alone
already includes them.

```
[10.255s][info ][gc,start   ] GC(2625) Pause Young (Concurrent Start) (G1 Evacuation Pause)
[10.255s][info ][gc,heap    ] GC(2625) Old regions: 209->223
[10.255s][info ][gc         ] GC(2625) Pause Young (Concurrent Start) (G1 Evacuation Pause) 224M->224M(256M) 1.254ms
[10.255s][info ][gc         ] GC(2626) Concurrent Mark Cycle
[10.255s][info ][gc,marking ] GC(2626) Concurrent Scan Root Regions
[10.255s][info ][gc,marking ] GC(2626) Concurrent Scan Root Regions 0.045ms
[10.255s][info ][gc,marking ] GC(2626) Concurrent Mark
[10.255s][info ][gc,marking ] GC(2626) Concurrent Mark From Roots
[10.256s][info ][gc,marking ] GC(2626) Concurrent Mark From Roots 0.891ms
[10.256s][info ][gc,marking ] GC(2626) Concurrent Preclean
[10.256s][info ][gc,marking ] GC(2626) Concurrent Preclean 0.007ms
[10.256s][info ][gc,start   ] GC(2626) Pause Remark
[10.257s][info ][gc         ] GC(2626) Pause Remark 234M->166M(256M) 0.460ms
[10.257s][info ][gc,marking ] GC(2626) Concurrent Mark 1.470ms
[10.257s][info ][gc,marking ] GC(2626) Concurrent Rebuild Remembered Sets and Scrub Regions
[10.257s][info ][gc,marking ] GC(2626) Concurrent Rebuild Remembered Sets and Scrub Regions 0.369ms
[10.257s][info ][gc,start   ] GC(2626) Pause Cleanup
[10.257s][info ][gc         ] GC(2626) Pause Cleanup 166M->166M(256M) 0.026ms
[10.257s][info ][gc,marking ] GC(2626) Concurrent Clear Claimed Marks
[10.257s][info ][gc,marking ] GC(2626) Concurrent Clear Claimed Marks 0.008ms
[10.257s][info ][gc,marking ] GC(2626) Concurrent Cleanup for Next Mark
[10.258s][info ][gc,marking ] GC(2626) Concurrent Cleanup for Next Mark 0.061ms
[10.258s][info ][gc         ] GC(2626) Concurrent Mark Cycle 2.086ms
[10.258s][info ][gc         ] GC(2627) Pause Young (Prepare Mixed) (G1 Evacuation Pause) 139M->135M(256M) 1.359ms
[10.279s][info ][gc         ] GC(2628) Pause Young (Mixed) (G1 Evacuation Pause) 172M->170M(256M) 2.126ms
```

Three things to read off it:

- The cycle has its **own GC id** (`GC(2626)`), one higher than the concurrent-start pause.
  A parser that groups by id must not expect the marking lines under the pause's id.
- `Pause Remark 234M->166M` drops occupancy: Remark reclaims wholly empty regions. The
  occupancy at each `Pause Young (Concurrent Start)` is the datum to trend — rising across
  cycles means the trigger is falling behind the promotion rate.
- With `-Xlog:gc+ergo+ihop=debug` every pause also logs the effective threshold:

```
[gc,ergo,ihop] GC(2625) Request concurrent cycle initiation (occupancy higher than threshold) occupancy: 234881024B allocation request: 0B threshold: 120795955B (45.00) source: end of GC
[gc,ergo,ihop] GC(2640) Do not request concurrent cycle initiation (still doing mixed collections) occupancy: ... threshold: ... source: end of GC
[gc,ergo,ihop] Request concurrent cycle initiation (occupancy higher than threshold) ... source: concurrent humongous allocation
```

The number in parentheses after `threshold:` is the effective IHOP as a percentage — the
adaptive value once the predictor has samples, the static floor before.

## Humongous allocation in the log

There is no `Humongous allocation …` info line on JDK 25. A humongous allocation shows up
as the **cause** of a concurrent-start pause and, per region, at `gc+humongous=debug`:

```
[gc         ] GC(2633) Pause Young (Concurrent Start) (G1 Humongous Allocation) 180M->176M(256M) 1.1ms
[gc,humongous] GC(2634) Humongous region 221 (object size 3145744 @ 0x...) remset 0 code roots 0 marked 0 pinned count 0 reclaim candidate 1 type array 1
[gc,humongous] GC(2634) Reclaimed humongous region 221 (object size 3145744 @ 0x...)
```

`reclaim candidate 0` with a non-zero `remset`, or `marked 1`, is the object that will wait
for a complete cycle.

## Logging flags

```bash
# base, needed for everything else to be interpretable
-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m

# marking mechanics, including mark stack expansion and overflow
-Xlog:gc+marking=debug:file=gc_mark.log

# effective IHOP per pause
-Xlog:gc+ergo+ihop=debug:file=gc_ihop.log

# humongous regions, per young pause
-Xlog:gc+humongous=debug:file=gc_hum.log

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

Defaults below were read with `-XX:+PrintFlagsFinal` on Temurin 25.0.3 (24 CPUs, 32 GB);
ergonomic values change with the machine.

| Flag                                                              | Default (JDK 25)                                | Controls                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `-XX:InitiatingHeapOccupancyPercent`                              | 45, product                                     | Initial floor for the marking trigger; the only value used when the adaptive predictor is off    |
| `-XX:+G1UseAdaptiveIHOP`                                          | `true`, product                                 | Enables adaptive prediction of the trigger point                                                 |
| `-XX:G1AdaptiveIHOPNumInitialSamples`                             | 3, experimental                                 | Cycles that run on the static floor before the predictor takes over                              |
| `-XX:G1EagerReclaimRemSetThreshold`                               | experimental, ergonomic — 16 on 17–24, 32 on 25 | Remembered-set entry count above which a humongous region stops being eligible for eager reclaim |
| `-XX:ConcGCThreads`                                               | `(ParallelGCThreads + 2) / 4`, ergonomic        | Threads dedicated to concurrent marking; 5 with `ParallelGCThreads=18` here                      |
| `-XX:G1ConcMarkStepDurationMillis`                                | 10, product                                     | How long a marking thread works before checking for a pending pause                              |
| `-XX:MarkStackSize` / `-XX:MarkStackSizeMax`                      | 4 MB / 512 MB, ergonomic                        | Initial and maximum mark stack; the restart happens only when the maximum cannot be expanded     |
| `-XX:G1SATBBufferSize` / `G1SATBBufferEnqueueingThresholdPercent` | 1024 / 60, product                              | Per-thread SATB buffer capacity and the fill level at which it is handed to the marking threads  |
| `-XX:G1HeapRegionSize`                                            | ergonomic (heap/2048, clamped 1–32 MB)          | Sets the humongous threshold (`> size/2`); settable up to 512 MB since JDK 18                    |

```bash
java -XX:+PrintFlagsFinal -version | grep -E "InitiatingHeapOccupancyPercent|G1UseAdaptiveIHOP|ConcGCThreads|MarkStackSize"
java -XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version | grep -E "G1EagerReclaim|G1AdaptiveIHOP"
java -XX:+PrintFlagsFinal -version | grep -i ihop
java -XX:+PrintFlagsFinal -version | grep SATB
```

On JDK 27 `-XX:InitiatingHeapOccupancyPercent` is deprecated and aliased to `-XX:G1IHOP`
(obsolete in 28, expired in 29). The `grep -i ihop` recipe above finds it under either
name, which is why it is the one to keep in a runbook.

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

The exact prediction formula (moving average, percentile, safety margin) is not stable across
releases. Read the effective threshold from `gc+ergo+ihop=debug` on the runtime before
deciding to disable the predictor.

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
  g1ConcurrentMark.cpp             concurrent marking, mark bitmap, TAMS, mark stack
  g1ConcurrentRebuildAndScrub.cpp  rebuild remembered sets and scrub (JDK 20, JDK-8210708)
  g1IHOPControl.cpp                static and adaptive IHOP
  heapRegion.cpp                   region management
  g1SATBMarkQueueSet.cpp           G1's specialisation of the SATB queue set

src/hotspot/share/gc/shared/
  satbMarkQueue.cpp                generic SATB queue infrastructure, shared with Shenandoah
```

`g1SATBMarkQueue.cpp` is cited in older material and does not match the post-JDK-9 repository
layout: the generic infrastructure lives under `gc/shared/`, the G1 specialisation under
`gc/g1/`.
