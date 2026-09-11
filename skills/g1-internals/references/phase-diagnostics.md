# Phase breakdown and region diagnostics

## Log configuration

```bash
java -Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m -jar app.jar
```

Illustrative young-pause excerpt in JDK 25 format (`gc,age`, `gc,remset` and
`gc,ergo` omitted):

```
[gc,start   ] GC(42) Pause Young (Normal) (G1 Evacuation Pause)
[gc,task    ] GC(42) Using 6 workers of 18 for evacuation
[gc,phases  ] GC(42)   Pre Evacuate Collection Set: 0.06ms
[gc,phases  ] GC(42)   Merge Heap Roots: 0.05ms
[gc,phases  ] GC(42)   Evacuate Collection Set: 0.34ms
[gc,phases  ] GC(42)   Post Evacuate Collection Set: 0.10ms
[gc,phases  ] GC(42)   Other: 0.05ms
[gc,heap    ] GC(42) Eden regions: 9->0(29)
[gc,heap    ] GC(42) Survivor regions: 3->2(2)
[gc,heap    ] GC(42) Old regions: 151->161
[gc,heap    ] GC(42) Humongous regions: 4->0
[gc,metaspace] GC(42) Metaspace: 106K(320K)->106K(320K) NonClass: ... Class: ...
[gc         ] GC(42) Pause Young (Normal) (G1 Evacuation Pause) 166M->162M(256M) 1.235ms
[gc,cpu     ] GC(42) User=0.00s Sys=0.00s Real=0.00s

Summary: GC(N) Pause Young (<type>) (<cause>) [(Evacuation Failure: <reason>)] <before>-><after>(<committed>) <pause>
```

`<type>` is one of `Normal`, `Concurrent Start`, `Prepare Mixed` (the last young collection
before the mixed phase) and `Mixed`. `Old regions: 151->161` on a young collection is the
promotion/region-transition signal, not an exact byte rate. `Humongous regions` dropping on a young
collection can show eager reclaim. A stable count may instead reflect live objects or new allocation
offsetting reclamation; correlate object/candidate logs and marking before concluding why it persists.

## The phase breakdown — the instrument that decides the action

These top-level phases describe ordinary evacuation pauses; exceptional paths and releases differ.
`-Xlog:gc+phases=debug`
adds the sub-phases that name the mechanism:

| Dominant phase / sub-phase                                                  | What it means                                         | Where to look next                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Evacuate Collection Set` → `Object Copy`                                   | Live-data movement and associated execution cost      | Live bytes, worker imbalance, CPU availability, bandwidth and CSet composition    |
| `Evacuate Collection Set` → `Scan Heap Roots`                               | Many cards to scan for the regions being collected    | `Scanned Cards`; reference fan-in into the collection set                         |
| `Evacuate Collection Set` → `Ext Root Scanning`                             | Thread stacks, class loaders, code roots              | Thread count and stack depth; huge static structures                              |
| `Merge Heap Roots` → `Remembered Sets`                                      | RSets of the collection set are large or coarse       | `Merged Full` / `Merged Howl Full` above zero → coarsening (`remembered-sets.md`) |
| `Merge Heap Roots` → `Log Buffers`                                          | Pending dirty-card processing                         | Dirty cards, write bursts, pause spacing and refinement progress                  |
| `Merge Heap Roots` → `Eager Reclaim`                                        | Candidate remembered cards prepared for eager reclaim | Later reclamation evidence in `-Xlog:gc+humongous=debug`                          |
| `Post Evacuate Collection Set` → `Reference Processing` / `Weak Processing` | Many `Reference` objects or weak tables               | Cache design; `-Xlog:gc+ref=debug`                                                |
| `Post Evacuate Collection Set` → `Restore Evacuation Failed Regions`        | An evacuation failure occurred in this pause          | The `(Evacuation Failure: …)` suffix; the section below                           |
| `Pre Evacuate Collection Set`, `Other`                                      | Fixed and bookkeeping work                            | Rarely the cause on its own                                                       |

Use these as hypotheses, not automatic diagnoses. Merge prepares card coverage, Scan Heap Roots
scans heap references, and copying cost also depends on execution resources. Correlate the
sub-phase work counts and worker times before choosing a change.

## Marking, RSet and humongous logs

```bash
-Xlog:gc+remset=debug     # Visited cards, Total dirty, Coarsening per pause
-Xlog:gc+marking=debug    # the concurrent phases with durations (g1-concurrent-marking)
-Xlog:gc+humongous=debug  # per humongous region, at every young pause
-Xlog:gc+ergo+ihop=debug,gc+ihop=debug  # qualifying initiation checks and IHOP predictor updates
```

The `gc+ergo+ihop` line is conditional, not emitted for every pause. Its absence does not prove
marking is disabled; use `g1-concurrent-marking` for threshold denominators and learning state.

There is no "Humongous allocation …" info line on JDK 25. The allocation itself surfaces as
the cause `G1 Humongous Allocation` on a `Pause Young (Concurrent Start)` and in
`gc+ergo+ihop` as `source: concurrent humongous allocation`; the per-region view is
`gc+humongous=debug`:

```
[gc,humongous] GC(42) Humongous region 221 (object size 3145744 @ 0x...) remset 0 code roots 0 marked 0 pinned count 0 reclaim candidate 1 type array 1
[gc,humongous] GC(42) Reclaimed humongous region 221 (object size 3145744 @ 0x...)
```

`remset`, `marked`, `pinned`, allocation timing and object kind feed release-specific eligibility;
do not turn one field/threshold into a universal predicate. Run this whenever old grows without
matching retained business state, then correlate candidates with actual `Reclaimed humongous`
lines and completed marking cycles.

## Live inspection

```bash
jcmd <pid> GC.heap_info        # aggregate occupancy and region size, not a free-region map
jcmd <pid> help GC.class_histogram  # inspect impact/options before capture
```

`GC.class_histogram` covers heap classes without generation attribution and is high impact;
the default requests a full GC. `-all` includes unreachable objects and avoids that requested
collection, but heap inspection can still pause the application. A histogram is not an old-gen
retention proof, and `GC.heap_info` alone cannot establish contiguous free-region availability.

```
garbage-first heap   total reserved 131072K, committed 131072K, used 57177K [0x...)
 region size 1024K, 5 young (5120K), 2 survivors (2048K)
```

## JFR

```bash
jcmd <pid> JFR.start settings=profile duration=120s filename=g1.jfr
jfr print --events jdk.GarbageCollection,jdk.GCPhasePause,jdk.GCHeapSummary g1.jfr
jfr print --events jdk.ObjectAllocationSample g1.jfr
```

G1-specific events exist, but discover them in your own runtime before scripting against
them:

```bash
jfr summary g1.jfr | grep -i g1
```

The summary describes the recording, including zero-count entries; it does not prove every event
was enabled or exercised. Inspect `jfr metadata` and recording settings when an expected event is absent.

## Evacuation failure

```
[gc] GC(3059) Pause Young (Normal) (G1 Evacuation Pause) (Evacuation Failure: Allocation) 199M->199M(200M) 1.009ms
[gc,ergo] Attempting full compaction
[gc] GC(3060) Pause Full (G1 Compaction Pause) 199M->105M(200M) 1.825ms
```

The string `To-space exhausted` no longer exists in the JDK 25 binary; a grep for it on a
current log is empty even while the failures are happening. The failure is a third
parenthesis on the summary line — `Allocation` when no free region was available for a
survivor, `Pinned` when the region held an object pinned by a JNI critical section (JEP 423,
JDK 22, which replaced the GC locker for G1). Objects that could not be copied stay where
they are, self-forwarded; the region is kept as an old region and remains a candidate
(`G1RetainRegionLiveThresholdPercent`, experimental), and `gc+phases=debug` reports
`Evacuation Failed Regions` / `Allocation Failed Regions` under `Restore Evacuation Failed
Regions`. Allocation pressure may lead to expansion or full compaction; explicit/external GC requests
and humongous contiguous-space failure can also cause Full GC without repeated young failures.

Causes, in the order worth checking:

1. Heap too small for the observed allocation and promotion rate — `G1ReservePercent`
   (default 10) is a policy reserve intended to reduce evacuation failure, not an inaccessible
   dedicated memory partition or guaranteed capacity; increasing it trades usable headroom.
2. Humongous objects consuming regions that evacuation needed (`gc+humongous=debug`).
3. Promotion rate high enough to keep the old generation near capacity — check the
   `Old regions` delta per young pause and whether marking started late
   (g1-concurrent-marking).
4. A pinned region, if the suffix says so — the JNI critical section, not the heap.

```bash
grep -n "Evacuation Failure" gc.log | head      # every failing pause, with its reason
grep -E '\[gc +\].*Pause Full.*ms$' gc.log      # completion summaries only, not gc,start duplicates
```

## Checklist

Before investigating:

Apply checks relevant to the question and reuse existing captures; a mechanism explanation need
not trigger a new recording or a tuning experiment.

- [ ] Young and mixed collections read separately, with distinct greps
- [ ] Relevant allocation/promotion rates sourced with units and window; log-derived estimates labelled (gc-log-analysis)
- [ ] The collector confirmed as the cause, rather than downstream latency inflating the
      number of live objects in flight

While observing:

- [ ] `-Xlog:gc+phases=debug` enabled, so the dominant sub-phase of each pause is known
- [ ] Representative windows and event counts reported, with separate pause types
- [ ] `-Xlog:gc+humongous=debug` checked when old grows without matching retained state

When measuring and validating:

- [ ] Distribution/max and sample size reported; sparse tails labelled or omitted, not claimed precise
- [ ] Rates reported with unit and period, not as a bare number
- [ ] Extraction selectors checked against actual log format and coverage; empty output reported with its limits
- [ ] If a change is proposed, tested under comparable load with throughput and CPU checked for regressions
- [ ] Quoted defaults checked on a matching launch; effective service flags and learned state distinguished

## Sources and scope

- [Java 25 G1 tuning guide](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-garbage-collector-tuning.html)
- [Java 25 jcmd command and impact descriptions](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [OpenJDK 25 region-size rounding](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1HeapRegion.cpp)
- [OpenJDK 25 collector selection](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gcConfig.cpp)

An isolated Temurin 25.0.3 G1 process confirmed that default `GC.class_histogram` requested a
`Heap Inspection Initiated GC`, while `-all` did not request that collection. This is a runtime
observation, not a claim that heap inspection is pause-free or has identical cost on other builds.
