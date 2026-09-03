---
name: allocation-profiling
description: >
  Finding which code allocates and how many bytes: TLAB fast path and slow path, JFR
  jdk.ObjectAllocationSample versus the legacy TLAB events, async-profiler alloc mode,
  deriving allocation rate from the GC log, and validating a fix by reprofiling. Use when GC
  overhead is above 10-15% of CPU, when collector tuning has stopped moving the number, when
  a p99 spike is being blamed on TLAB refill, when the GC log shows (G1 Humongous
  Allocation) pauses or ZGC allocation stalls, when a JFR recording of
  jdk.ObjectAllocationInNewTLAB came back empty, when someone proposes pooling small objects
  or -XX:+TraceTLAB, or when a stream pipeline in a hot path is assumed free because "the
  JIT eliminates it". Does not cover choosing and running a profile in general
  (jfr-and-async-profiler), why an allocation survives or is scalar-replaced
  (jit-inlining-and-escape-analysis), or reading the resulting collection behaviour
  (gc-log-analysis).
---

# Allocation Profiling

## Purpose

Attribute allocated bytes to source lines, so that GC overhead is answered by removing
allocation rather than by another round of collector flags. Reducing what the application
allocates typically moves GC overhead more than any collector parameter does, and TLAB
tuning almost never is the right lever — the waste those flags govern is bounded by
`TLABWasteTargetPercent`, 1% of **Eden** by default (`tlab_globals.hpp`), against an
application allocating avoidable objects at GB/s.

The failure this prevents is weeks of G1 tuning that trade Young GC frequency for Young GC
duration without reducing the total, because nobody measured where the bytes came from.

## Workflow

1. **Get the allocation rate first.** From the GC log — Eden allocated divided by the
   interval between Young GCs — or, more exactly, from the always-on per-thread counters:
   `jdk.ThreadAllocationStatistics` is in the default recording and
   `com.sun.management.ThreadMXBean.getThreadAllocatedBytes` provides a cumulative per-thread
   counter when supported/enabled. Neither observation is literally free; measure recording,
   query and stack-sampling overhead against the service's headroom. There is no universal "high";
   compare against a documented baseline for the same service under comparable load. The
   arithmetic that follows: Young GC interval ≈ Eden capacity / allocation rate, while pause
   duration follows the live set. Cutting allocation cuts frequency, not pause length.
2. **Profile with `asprof -e alloc` for a bounded interval under representative load.** Start
   with a conservative interval/rate on a canary, record CPU/allocation/latency before and during,
   and stop if the overhead budget is exceeded. Box width is estimated **bytes**, not object count; the top of
   each stack is the allocated class. Without an agent, `jcmd <pid> JFR.view
allocation-by-site` (JDK 21+) reads the same question out of the running recording.
3. **Separate churn from promotion.** Allocation profiling measures what was allocated, not
   what became garbage. Compare against the promotion rate in the GC log, or profile with
   `asprof -e alloc --live` (objects still alive at the end of the session) and read
   `jdk.OldObjectSample`. Objects that die young are usually harmless in moderate volume;
   objects that survive into Old Gen cost much more.
4. **Confirm which layer a latency spike belongs to.** If p99 spikes align with `Pause Young`
   entries in the unified GC log, the cause is collection, not refill. A refill is
   thread-local and does not stop the world; its slow path is what _requests_ the pause
   when Eden is exhausted. Two further allocation-driven pauses have their own names:
   `(G1 Humongous Allocation)` in the G1 log, and `jdk.ZAllocationStall` under ZGC.
5. **State a specific hypothesis before changing code** — "allocation at X accounts for Y% of
   total because Z". A site that is inherent to the work (deserialising genuinely large
   payloads) points at collector and heap sizing instead; a site that is avoidable
   application code points at the code.
6. **Reprofile after the fix.** A change is validated by a second `asprof -e alloc` showing
   the site shrank, never by the code looking better. For a single method, JMH `-prof gc`
   `gc.alloc.rate.norm` is the number to compare (`jmh-microbenchmarks`).

## Rules

- Use `-Xlog:gc+tlab=trace` (or `tlab*=trace`). `-Xlog:tlab=trace` matches no tag set and the
  JVM tells you so; `-XX:+TraceTLAB` and `-XX:+PrintTLAB` do not exist and refuse to start the
  JVM (Temurin 25.0.3). Keep `trace` to a short investigation window — prefer `debug`
  otherwise.
- `jdk.ObjectAllocationSample` is the allocation event for this baseline: JDK 16
  (JDK-8257602), throttled at 150/s in `default.jfc` and 300/s in `profile.jfc`, **enabled by
  default**. It fires from the **same two TLAB hooks as the legacy events** with a throttle in
  front (`jfrAllocationTracer.cpp` → `jfrObjectAllocationSample.cpp`); it is not built on the
  JEP 331 JVMTI sampler. `weight` is the bytes the thread allocated since its previous emitted
  sample. The weights closely tracked the total in one validation—22.98 GB of samples against
  22.96 GB from `ThreadMXBean` in a 3 s run at 2000/s on 25.0.3—but are not a universal exact
  ledger: recording boundaries, disabled/throttled events and short-lived threads can leave a
  difference.
- `jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` are the older,
  unsampled, unthrottled mechanism and are **disabled by default**. An empty recording of them
  is the expected result of not enabling them, not evidence that nothing allocated. Enable
  them only for `jfr view tlabs` or the per-event `tlabSize` field.
- Read `weight` from `jdk.ObjectAllocationSample`, not `allocationSize`. That field does not
  exist on this event and reading it throws `IllegalArgumentException` at runtime rather than
  returning zero.
- `asprof -e alloc` on JDK 11+ with async-profiler 3.0+ **is** the JEP 331 sampler
  (`SetHeapSamplingInterval`, `SampledObjectAlloc`); `--alloc N` sets that interval in bytes
  and `--tlab` forces the old TLAB hooks. It never touches `perf_events`, so
  `perf_event_paranoid`, seccomp and `CAP_PERFMON` are irrelevant to it; attach through
  `/tmp/.java_pid<PID>` under the JVM's own uid is the only access requirement.
- On G1 an object of half a region or more (`G1HeapRegionSize`, 4 MB ergonomically for an
  ~8 GB heap on 25.0.3) is **humongous**: it bypasses the TLAB, lands in Old regions, and can
  start a concurrent cycle on its own — `Pause Young (Concurrent Start) (G1 Humongous
Allocation)`. A 3 MB buffer per request produced 274 such pauses in 4 s in the reproduction.
  Chunk the buffer, reuse it, or raise the region size; details in
  `references/symptoms-and-collector-behaviour.md`.
- `TLABRefillWasteFraction` sets refill waste tolerance
  (`initial_refill_waste_limit = desired_size / TLABRefillWasteFraction`). It is **not** the
  "too large for a TLAB" threshold — that is `ThreadLocalAllocBuffer::max_size()`, which on
  G1 equals the humongous threshold and is not settable by that flag. There is no
  general-purpose `-XX:MaxTLABSize` (25.0.3 answers `Did you mean 'TLABSize=<value>'?`);
  only Epsilon exposes `-XX:EpsilonMaxTLABSize`.
- `PretenureSizeThreshold` is honoured by Serial's DefNew only ("Maximum size in bytes of
  objects allocated in DefNew generation", `gc_globals.hpp`). Under G1, Parallel and ZGC it
  is accepted and ignored.
- Do not pool small, cheap, short-lived objects. The TLAB bump-pointer fast path is already
  cheaper than the atomic operation any pool costs, pooling adds residual-state risk, and a
  pooled object that ages into Old Gen turns every young reference stored into it into a
  write-barrier and remembered-set entry. Pool things with real initialisation cost —
  connections, sockets, native I/O buffers.
- Do not assume escape analysis removed a stream pipeline's allocations. It only removes an
  allocation whose every use was inlined into one compilation unit; a pipeline crosses
  `Spliterator`, `Sink` and lambda call sites that are often megamorphic, and a
  deoptimisation reverts it. Confirm with `asprof -e alloc` or JMH `-prof gc`; the mechanism
  is `jit-inlining-and-escape-analysis`.
- Before rewriting code, measure `-XX:+UseCompactObjectHeaders` (JEP 519, product on JDK 25,
  off by default): a 4-byte smaller header shifts many small objects down one 8-byte
  alignment step, which lowers the allocation rate of the same code. Layout arithmetic is
  `object-layout-and-footprint`.
- Do not use `String.intern()` as an application cache for high-cardinality values. Since JDK 7
  interned strings live in the regular heap and entries without another strong reference may be
  collected, so growth is not necessarily monotonic; nevertheless the global pool provides no
  domain TTL/size policy, tenant isolation or useful hit/eviction telemetry. Use an explicit
  bounded canonicalization/cache design only after measuring duplication and retention.
  `-XX:+UseStringDeduplication` is a retention lever for long-lived duplicates, not an
  allocation lever — the `String` and its array are allocated first and merged later.
- Do not use `finalize()` for cleanup — deprecated for removal since JDK 18 (JEP 421), and it
  extends lifetime and has no timely-execution guarantee. Prefer explicit ownership with
  try-with-resources or `Arena`/`MemorySegment`; use `Cleaner` only as a leak safety net because
  it is likewise nondeterministic, and keep its cleanup action from retaining the referent.
- `jcmd <pid> GC.class_histogram` is a retention snapshot, not an allocation rate. Objects
  already collected appear in neither of two snapshots. Use it for leak work, not for this.
- Unreferenced `jdk.internal.vm.FillerElement[]` and `jdk.internal.vm.FillerObject` in a
  histogram or heap dump are the fillers HotSpot writes into retired TLABs for heap
  parsability, not a leak (359 instances, 2.4 MB in `GC.class_histogram -all` on 25.0.3). Only
  on JDK 18 and older do they appear as anonymous `int[]`.
- Virtual threads: `ThreadMXBean.getThreadAllocatedBytes(id)` returns `-1` for a virtual
  thread (verified on 25.0.3); JFR attributes samples to the virtual thread by name. Bytes
  under `jdk.internal.vm.StackChunk` at park/yield sites are the frozen stacks of unmounting
  virtual threads (JEP 444), a cost of the thread model rather than of the code on top.

## Security and production handling

Allocation/JFR profiles can expose class names, method names, thread names and contextual values
embedded in labels. Restrict attach/JMX/JFR access to the target identity, encrypt and retain
recordings as production telemetry, redact tenant/user identifiers from thread names, and delete
captures on schedule. Sampling is not a security boundary: a rare sensitive path can still appear.

## References

- [Tools and allocation events](references/allocation-tools.md) — the tool-per-question
  table, async-profiler alloc invocations and what samples them on each JDK, the JFR event
  lineage and mechanism, `jfr view` and `jcmd JFR.view`, raising the throttle for one
  investigation, and virtual-thread attribution. Read before capturing an allocation profile
  or writing code that consumes JFR allocation events.
- [Reducing allocation and validating the fix](references/reducing-allocation.md) — the
  triage tree from GC overhead to a code change, the allocation shapes with mechanical fixes,
  the pooling decision matrix, the no-code-change levers, the real TLAB flag defaults, and the
  rare cases where touching them is justified. Read when a profile has named the sites and
  you are deciding what to change.
- [Symptoms and collector behaviour](references/symptoms-and-collector-behaviour.md) — the
  rate arithmetic, how G1, ZGC, Parallel and Serial each turn allocation into pauses or
  stalls, why three tools give three numbers for the same class, and the symptom table. Read
  when the GC log names an allocation cause, when two measurements disagree, or before
  blaming a spike on allocation.
