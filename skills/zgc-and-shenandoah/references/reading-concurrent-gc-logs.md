# Reading concurrent GC logs

## Capture

```bash
java -XX:+UseZGC \
     -Xlog:gc*:file=zgc.log:time,uptime,level,tags \
     -jar app.jar

java -XX:+UseShenandoahGC \
     -XX:ShenandoahGCMode=generational \
     -Xlog:gc*:file=shen.log:time,uptime,level,tags \
     -jar app.jar
```

Add `gc+phases=debug` when the question is where the concurrent time goes rather than how
long the pauses were.
These shell sketches assume an existing application jar and supported JDK 25 build. The second
selects generational mode explicitly; choose `satb` instead when that is the intended comparison.
Set bounded rotation/retention for production logs and inspect startup warnings and effective mode.

## What the ZGC log gives you

Generational ZGC labels cycles by generation, so young and old work can be read apart:

```
[gc,heap]   GC(12) Young Generation: 512M(25%)->128M(6%)
[gc,heap]   GC(12) Old Generation: 2048M(64%)->2048M(64%)
[gc,phases] GC(12) Pause Mark Start 0.234ms
[gc,phases] GC(12) Concurrent Mark 45.678ms
[gc,phases] GC(12) Pause Mark End 0.178ms
[gc,phases] GC(12) Concurrent Relocate 12.345ms
```

Illustrative shape, not a promise about your build — verify the exact text before writing a
parser against it. The reading discipline is fixed, though: the `Pause *` lines are the
STW axis, while `Concurrent *` lines measure elapsed phase time, not CPU consumed. A phase
can run on several workers or be delayed by throttling/descheduling. Measure CPU separately
with appropriate worker/process accounting or profiles. Overlapping phases/cycles must not
be added as though they were one application pause or additive CPU time.

## What the Shenandoah log gives you

Default single-generation mode:

```
[gc] Trigger: Learning 1 of 5. Free (3068M) is below initial threshold (3277M)
[gc] GC(1) Concurrent reset 12.345ms
[gc] GC(1) Pause Init Mark (process weakrefs) 2.456ms
[gc] GC(1) Concurrent marking 234.567ms
[gc] GC(1) Pause Final Mark (process weakrefs) 3.789ms
[gc] GC(1) Concurrent evacuation 45.678ms
[gc] GC(1) Pause Init Update Refs 0.234ms
[gc] GC(1) Concurrent update references 89.012ms
[gc] GC(1) Pause Final Update Refs 1.234ms
```

Under `-XX:ShenandoahGCMode=generational` the cycles gain generation labels analogous to
ZGC's. The textual labels change between releases; confirm against the build before
depending on them.

## The allocation-stall signature

```
[gc] GC(42) Garbage Collection (Allocation Stall)
```

For ZGC this line means allocation threads waited for space. It establishes a stall, not the
root cause: insufficient hard/soft heap headroom, spike prediction, live-set growth,
fragmentation/large allocations, too little concurrent CPU or throttling can converge here.
Shenandoah uses its own pacing, allocation-failure, degenerated and full-GC signatures; do not
force both collectors through one log label.

Choose remediation from the proven constraint: reduce allocation/live set, restore CPU,
increase justified heap headroom, adjust workload backpressure, or evaluate a narrowly scoped
collector control. Re-run burst and steady-state cases; a flag that merely moves the stall is
not a fix.

## Summarising pauses and phases

Sort the `Pause` durations and report p50, p99 and max; average the `Concurrent` durations
per phase name. Two traps when scripting this:

- A regex that matches nothing yields an empty list, not an error. Assert the match count
  is non-zero before indexing, or an `IndexError` becomes the only signal that the parse
  was wrong.
- An empirical percentile on a small sample is definable but weak tail evidence. State the
  sample count and estimator; nearest-rank p99 of ten observations is the maximum, not an
  established population p99. Preserve the maximum and collect enough events for the decision.

## Locating barrier cost in a profile

```bash
asprof -e cpu -d 30 -f cpu.html <pid>
```

Look for runtime barrier slow paths and generated code with the target build's symbols.
`ZBarrierSetAssembler` methods taking a `MacroAssembler` emit code; their own execution is
not necessarily execution of the emitted barrier on an application
load. Header predicates are not automatically runtime cost frames either. Inlined fast paths
can be charged to application methods and absent as named frames; use annotated assembly or
focused measurements if attributing their cost. Absence of a barrier symbol is not zero overhead.
See the [OpenJDK 25 x86 ZGC barrier assembler](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/gc/z/zBarrierSetAssembler_x86.cpp)
to distinguish emission from generated runtime paths.

## Quick live inspection

```bash
jcmd <pid> GC.heap_info
jcmd <pid> VM.flags -all | grep -i -E "zgc|shenandoah"
```

## Measurement hygiene for a collector comparison

- Same CPU and memory quota as the production target, or the CPU-contention result is
  meaningless.
- Use an open-loop or corrected workload when production arrivals continue during stalls;
  document offered and achieved load so coordinated omission cannot hide the tail.
- p50, p99, p99.9 and max for latency/stalls, plus means/rates where they answer CPU,
  throughput or total-work questions; never substitute a mean for the tail.
- Barrier/workload overhead evaluated with profiles and repeated end-to-end or focused
  benchmarks; changing collectors in JMH does not isolate one mechanism by itself.
- `ShenandoahGCMode` stated in the write-up, and confirmed via `jcmd`.
