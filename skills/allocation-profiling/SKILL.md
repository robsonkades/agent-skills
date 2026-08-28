---
name: allocation-profiling
description: >
  Finding which code allocates and how many bytes: TLAB fast path and slow path, JFR
  jdk.ObjectAllocationSample versus the legacy TLAB events, async-profiler alloc mode,
  deriving allocation rate from the GC log, and validating a fix by reprofiling. Use when GC
  overhead is above 10-15% of CPU, when collector tuning has stopped moving the number, when
  a p99 spike is being blamed on TLAB refill, when a JFR recording of
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
tuning almost never is the right lever — the footprint those flags govern is
`TLABWasteTargetPercent`, 1% of heap by default, against an application allocating avoidable
objects at GB/s.

The failure this prevents is weeks of G1 tuning that trade Young GC frequency for Young GC
duration without reducing the total, because nobody measured where the bytes came from.

## Workflow

1. **Get the allocation rate from the GC log first** — Eden allocated divided by the interval
   between Young GCs. There is no universal "high"; compare against a documented baseline for
   the same service under comparable load.
2. **Profile with `asprof -e alloc` for 30-60 seconds under representative load.** Overhead is
   low to moderate and it is safe in production. Box width is **bytes**, not object count;
   the top of each stack is the allocated class.
3. **Separate churn from promotion.** Allocation profiling measures what was allocated, not
   what became garbage. Compare against the promotion rate in the GC log: objects that die
   young are usually harmless in moderate volume; objects that survive into Old Gen cost
   much more.
4. **Confirm which layer a latency spike belongs to.** If p99 spikes align with `Pause Young`
   entries in the unified GC log, the cause is collection, not refill. TLAB refill is
   sub-microsecond, thread-local and never stop-the-world.
5. **State a specific hypothesis before changing code** — "allocation at X accounts for Y% of
   total because Z". A site that is inherent to the work (deserialising genuinely large
   payloads) points at collector and heap sizing instead; a site that is avoidable
   application code points at the code.
6. **Reprofile after the fix.** A change is validated by a second `asprof -e alloc` showing
   the site shrank, never by the code looking better.

## Rules

- Use `-Xlog:gc+tlab=trace` (or `tlab*=trace`). `-Xlog:tlab=trace` matches no tag set and the
  JVM tells you so; `-XX:+TraceTLAB` and `-XX:+PrintTLAB` do not exist and refuse to start the
  JVM. Keep `trace` to a short investigation window — prefer `debug` otherwise.
- `jdk.ObjectAllocationSample` is the allocation event for this baseline: JDK 16
  (JDK-8257602), built on the JVMTI sampling infrastructure of JEP 331 (JDK 11), throttled at
  150/s in `default.jfc` and 300/s in `profile.jfc`, **enabled by default**.
- `jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` are the older,
  unsampled, unthrottled mechanism and are **disabled by default**. An empty recording of them
  is the expected result of not enabling them, not evidence that nothing allocated.
- Read `weight` from `jdk.ObjectAllocationSample`, not `allocationSize`. That field does not
  exist on this event and reading it throws `IllegalArgumentException` at runtime rather than
  returning zero.
- `TLABRefillWasteFraction` sets refill waste tolerance
  (`initial_refill_waste_limit = desired_size / TLABRefillWasteFraction`). It is **not** the
  "too large for a TLAB" threshold — that is `ThreadLocalAllocBuffer::max_size()`, derived
  from heap capacity and not settable by that flag. There is no general-purpose
  `-XX:MaxTLABSize`; only Epsilon exposes `-XX:EpsilonMaxTLABSize`.
- Do not pool small, cheap, short-lived objects. The TLAB bump-pointer fast path is already
  cheaper than the atomic operation any pool costs, and pooling adds residual-state risk.
  Pool things with real initialisation cost — connections, sockets, native I/O buffers.
- Do not assume escape analysis removed a stream pipeline's allocations. It fails on most
  candidate cases in real code, being sensitive to inlining, deoptimisation and code shape.
  Confirm with `asprof -e alloc` or JMH `-prof gc`.
- Do not use `String.intern()` as a cache for high-cardinality values. Since JDK 7 the pool
  lives in the regular heap and is collected, but interning user IDs still inflates it without
  bound. Use an explicit `Map` with an eviction policy you control.
- Do not use `finalize()` for cleanup — deprecated for removal since JDK 18 (JEP 421), and it
  extends object lifetime into a finalisation queue, raising collection cost. Use `Cleaner`,
  try-with-resources, or `Arena`/`MemorySegment` for native memory.
- `jcmd <pid> GC.class_histogram` is a retention snapshot, not an allocation rate. Objects
  already collected appear in neither of two snapshots. Use it for leak work, not for this.
- A heap dump full of unreferenced `int[]` is more likely TLAB filler objects, inserted for
  heap parsability when a TLAB is retired, than a leak.

## References

- [Tools and allocation events](references/allocation-tools.md) — the tool-per-question
  table, async-profiler alloc invocations, the JFR event lineage and how to raise the
  throttle for one investigation. Read before capturing an allocation profile or writing
  code that consumes JFR allocation events.
- [Reducing allocation and validating the fix](references/reducing-allocation.md) — the
  triage tree from GC overhead to a code change, the pooling decision matrix, the real TLAB
  flag defaults, and the rare cases where touching them is justified. Read when a profile has
  named the sites and you are deciding what to change.
