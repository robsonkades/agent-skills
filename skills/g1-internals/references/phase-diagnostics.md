# Phase breakdown and region diagnostics

## Log configuration

```bash
java -Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m -jar app.jar
```

Reading a G1 summary line:

```
[gc,start] GC(42) Pause Young (Normal) (G1 Evacuation Pause)
[gc,heap]  GC(42) Eden regions: 150->0(150)
[gc,heap]  GC(42) Survivor regions: 15->25(25)
[gc,heap]  GC(42) Old regions: 200->205(512)
[gc,heap]  GC(42) Humongous regions: 3->3
[gc]       GC(42) Pause Young (Normal) (G1 Evacuation Pause) 512M->412M(2048M) 23.456ms

Format: GC(N) <type> (<cause>) <heap_before>-><heap_after>(<heap_max>) <pause>
```

`Old regions: 200->205` on a young collection is the promotion signal. `Humongous regions`
that never drops on young collections is expected — humongous regions are reclaimed only by
marking and cleanup.

## The phase breakdown — the instrument that decides the action

```bash
-Xlog:gc+phases=info:file=gc_phases.log
```

```
[gc,phases] GC(42)   Pre Evacuate Collection Set: 0.3ms
[gc,phases] GC(42)   Merge Heap Roots: 1.2ms
[gc,phases] GC(42)   Evacuate Collection Set: 18.7ms
[gc,phases] GC(42)   Post Evacuate Collection Set: 2.1ms
[gc,phases] GC(42)   Other: 0.9ms
```

| Dominant phase                            | What it means                               | Where to look next                                    |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `Evacuate Collection Set` / `Object Copy` | A large volume of live data is being copied | Promotion rate; how many old regions entered the CSet |
| `Merge Heap Roots` / `Merge RS`           | Remembered sets are expensive to scan       | Reference fan-in and RSet representation              |
| `Pre`/`Post Evacuate Collection Set`      | Fixed and bookkeeping work                  | Rarely the cause on its own                           |

The distinction matters because the two dominant cases have opposite responses, and the
summary line reports only their sum.

## Marking and RSet logs

```bash
-Xlog:gc+remset=debug     # "Remembered Set sizes:" — size by region type
-Xlog:gc+remset=trace     # card table detail
-Xlog:gc+marking=debug    # Concurrent Mark From Roots, Concurrent Preclean, durations
-Xlog:gc+humongous=info   # "Humongous allocation: size=X bytes, region(s)=Y"
```

`gc+humongous` is the check to run whenever the old generation grows and the application is
not retaining anything: short-lived buffers larger than half a region produce constant old
generation pressure that reads as a leak in every other instrument.

## Live inspection

```bash
jcmd <pid> GC.heap_info        # region occupancy — fragmentation
jcmd <pid> GC.class_histogram  # what is occupying the old generation
```

```
 num     #instances         #bytes  class name
   1:        523141       41851280  byte[]
   2:        248324       19865920  java.lang.String
   3:         45231       15678432  com.myapp.LargeObject
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

## `To-space exhausted`

```
[gc] GC(42) To-space exhausted
```

Evacuation found no free regions for the survivors. Four typical causes, in the order worth
checking:

1. Heap too small for the observed allocation and promotion rate.
2. Humongous objects consuming regions that evacuation needed.
3. RSets large enough to squeeze the memory available for application data.
4. Promotion rate high enough to keep the old generation near capacity.

```bash
grep -n -B5 -A5 "To-space exhausted" gc_full.log   # look for Pause Full nearby
```

It historically escalates to an emergency full GC often, but not always — with `-Xmx`
greater than `-Xms`, G1 may expand the heap ergonomically and recover.

## Checklist

Before investigating:

- [ ] Young and mixed collections read separately, with distinct greps
- [ ] Allocation rate and promotion rate measured, not estimated
- [ ] The collector confirmed as the cause, rather than downstream latency inflating the
      number of live objects in flight

While observing:

- [ ] `-Xlog:gc+phases` enabled, so the dominant phase of each pause is known
- [ ] At least ten mixed cycles sampled — one pause is not a pattern
- [ ] `-Xlog:gc+humongous` checked when old grows without matching retained state

When measuring and validating:

- [ ] p50/p99/p99.9/max reported for the pauses, never the mean alone
- [ ] Rates reported with unit and period, not as a bare number
- [ ] Every extraction command verified to produce non-empty output against a real log
- [ ] The change tested under the same load as the original measurement
- [ ] Throughput and CPU checked, to rule out a regression elsewhere
- [ ] Every quoted flag default confirmed with `-XX:+PrintFlagsFinal` on the target runtime
