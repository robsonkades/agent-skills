# Reading concurrent GC logs

## Capture

```bash
java -XX:+UseZGC \
     '-Xlog:gc*:file=zgc.log:time,uptime,level,tags' \
     -jar app.jar

java -XX:+UseShenandoahGC \
     -XX:ShenandoahGCMode=generational \
     '-Xlog:gc*:file=shen.log:time,uptime,level,tags' \
     -jar app.jar
```

Add `gc+phases=debug` when the question is where the concurrent time goes rather than how
long the pauses were.
These POSIX-shell sketches assume an existing application jar and supported JDK 25 build. Run only
the relevant capture within existing authority, in an owned protected working directory with output
names that preserve others' evidence; adapt quoting/paths to the actual shell and target filesystem.
The second selects generational mode explicitly; choose `satb` instead when that is the intended comparison.
Set bounded rotation/retention for production logs and inspect startup warnings and effective mode.

## What the ZGC log gives you

Generational ZGC labels cycles by generation, so young and old work can be read apart:

```
[gc,heap]   GC(12) Young Generation: 512M(25%)->128M(6%)
[gc,heap]   GC(12) Old Generation: 2048M(64%)->2048M(64%)
[gc,phases] GC(12) Pause Mark Start 0.234ms
[gc,phases] GC(12) Concurrent Mark 45.678ms
[gc,phases] GC(12) Pause Mark End 0.178ms
[gc,phases] GC(12) Pause Relocate Start 0.123ms
[gc,phases] GC(12) Concurrent Relocate 12.345ms
```

Illustrative shape, not a promise about your build — verify the exact text before writing a
parser against it; omitted details are not a complete phase inventory. Include every emitted STW
phase family relevant to the claimed population, including `Pause Relocate Start`. The `Pause *`
lines are the STW axis, while `Concurrent *` lines measure elapsed phase time, not CPU consumed. A phase
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

For ZGC this is an allocation-stall cycle cause, not a count or duration of allocating-thread waits.
On the JDK 25 source path, a stalling allocation requests collection, waits for completion/failure
and reaches the `jdk.ZAllocationStall` event commit path; use actual per-thread stall events/logs
and their capture coverage when quantifying waits. A stall is not necessarily a global STW pause and does not establish
the root cause: insufficient hard/soft heap headroom, spike prediction, live-set growth,
fragmentation/large allocations, too little concurrent CPU or throttling can converge here.
Shenandoah uses its own pacing, allocation-failure, degenerated and full-GC signatures; do not
force both collectors through one log label.

Choose remediation from the proven constraint: reduce allocation/live set, restore CPU,
increase justified heap headroom, adjust workload backpressure, or evaluate a narrowly scoped
collector control. Validate the affected steady/burst risks with adequate evidence; a flag that
merely moves the stall is not a fix. Already authorized validated capacity recovery need not wait
for a new broad collector comparison.

## Summarising pauses and phases

Define the requested population, exposure and phase/generation boundaries. Summarize `Pause`
durations with the required statistics and `Concurrent` durations per phase name; do not average
unrelated phases or merge overlapping intervals as additive time. Two traps when scripting this:

- A regex that matches nothing yields an empty list. Check producer success, selection, parser
  support and capture completeness before interpreting it. A verified no-cycle interval may have
  zero observed pauses and an undefined pause percentile; it is not a measured zero-latency tail.
  Failed, truncated or unsupported evidence is unknown for the affected population. Preserve
  independently complete cohorts and their valid conclusions; do not index or fabricate percentiles
  from an empty list.
- An empirical percentile on a small sample is definable but weak tail evidence. State the
  sample count and estimator; nearest-rank p99 of ten observations is the maximum, not an
  established population p99. Preserve the maximum and collect enough events for the decision.

## Locating barrier cost in a profile

```text
asprof -e cpu -d 30 -f <owned-protected-output> <pid>
```

This command template requires a supported profiler, identified target and existing capture
authority. Verify producer diagnostics and actual output; a missing profile does not invalidate
an independently complete descriptive pause summary.

Look for runtime barrier slow paths and generated code with the target build's symbols.
`ZBarrierSetAssembler` methods taking a `MacroAssembler` emit code; their own execution is
not necessarily execution of the emitted barrier on an application
load. Header predicates are not automatically runtime cost frames either. Inlined fast paths
can be charged to application methods and absent as named frames; use annotated assembly or
focused measurements if attributing their cost. Absence of a barrier symbol is not zero overhead.
See the [OpenJDK 25 x86 ZGC barrier assembler](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/gc/z/zBarrierSetAssembler_x86.cpp)
to distinguish emission from generated runtime paths.

## Quick live inspection

```text
jcmd <pid> GC.heap_info
jcmd <pid> VM.flags -all
```

Preserve producer status and raw output before optional filtering, with filter status separately.
Do not infer collector policy from an empty or failed capture.

## Measurement hygiene for a collector comparison

- Use the target CPU/memory quota for a production claim. A controlled different-quota scenario
  can answer a capacity question; name the changed factors and do not claim it isolates collector
  cost or transfers unchanged to production.
- Use an open-loop or corrected workload when production arrivals continue during stalls;
  document offered and achieved load so coordinated omission cannot hide the tail.
- For actual completion-paced populations, preserve that demand model and report population,
  think time and achieved throughput; do not reinterpret it as an externally scheduled arrival test.
- Choose latency/stall statistics supported by the samples and required for the decision, plus
  means/rates for CPU, throughput or total-work questions. Keep counts/exposure/estimators and
  insufficient-tail limits explicit; never substitute a mean for a required tail.
- Barrier/workload overhead evaluated with profiles and repeated end-to-end or focused
  benchmarks; changing collectors in JMH does not isolate one mechanism by itself.
- `ShenandoahGCMode` stated and confirmed by adequate actual startup logs or flag evidence.

Source for the stall path: [OpenJDK 25 ZGC page allocator](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zPageAllocator.cpp).
