---
name: off-heap-memory
description: >
  Memory outside the Java heap: direct `ByteBuffer` and its Cleaner-driven release,
  `MemorySegment` and `Arena` in the FFM API, lifetime and thread confinement, when off-heap
  actually pays, and diagnosing native growth no heap dump explains. Use when RSS grows
  while the Java heap stays flat, on `OutOfMemoryError: Direct buffer memory` or an
  OOMKilled container with no Java exception, when `-XX:MaxDirectMemorySize` is unset or
  copied from another service, when `ByteBuffer.allocateDirect` sits on a per-request path,
  when `Unsafe.allocateMemory` appears without a matching `freeMemory`, on a
  `WrongThreadException` from a segment, or on a JEP 498 `sun.misc.Unsafe` runtime warning.
  Does not cover the six-region container budget and which OOM means what
  (jvm-memory-regions), calling into native code as opposed to holding native memory
  (jni-and-ffm), or on-heap retention (heap-dump-analysis).
---

# Off-Heap Memory

## Purpose

Decide whether data belongs outside the Java heap, and find native growth that no heap dump
will ever show. Off-heap is not faster by definition — it is a **different memory budget
with a different cost**. On the heap the dominant cost is GC work for as long as the object
lives; off-heap it moves to the allocation and release itself, and to the absence of any
automatic safety net.

The failure this prevents is the silent native leak. A direct `ByteBuffer` frees its native
memory only when the GC collects the Java wrapper, and the GC decides that from **heap**
pressure, not native pressure — so a roomy heap can mean the GC simply does not run while
native memory piles up with no signal at all on the heap side.

## Workflow

1. **Establish that the heap is healthy first.** `jstat -gcutil`. If the heap is fine, the
   hypothesis moves to native memory; if it is not, this is the wrong skill.
2. **Classify the symptom.** A crash with `OutOfMemoryError: Direct buffer memory` is a
   ceiling being hit; a process that vanishes with OOMKilled and no Java exception is the
   container killing you, and points somewhere the JVM never accounted for.
3. **Compare RSS against used heap over time.** `VmRSS` from `/proc/<pid>/status` against
   `jstat`. Sustained divergence is the off-heap leak signal — and the signal is monotonic
   growth across a time series, never one absolute reading.
4. **Narrow by tool, in order:** JMX `java.nio:type=BufferPool,name=direct` for live direct
   buffer count and bytes, then `jcmd <pid> VM.native_memory detail` for which category grew,
   then `asprof -e nativemem` to attribute the growth to an actual Java call stack.
5. **Ask the sizing question only after ruling out a leak.** Raising
   `-XX:MaxDirectMemorySize` against sustained growth converts a fast OOM into a slow one.
   See `references/native-memory-diagnosis.md`.
6. **When migrating legacy code, pick the `Arena` type from the real ownership pattern**,
   not from habit — a confined arena used by mistake in a multi-threaded context fails late
   and intermittently, not on the first test. See `references/ffm-memory-api.md`.
7. **Validate the fix by repeating the measurement under the load that revealed it,** and
   confirm growth stopped rather than merely paused.

## Rules

- Off-heap pays when the data's volume and lifetime make the GC cost of keeping it on the heap
  dominant. Short-lived per-request network buffers almost always lose to the heap: allocating
  and freeing natively per request costs more than the heap's bump-pointer TLAB allocation.
- Never call `ByteBuffer.allocateDirect` on a hot per-request path. At 10k req/s that is 10k
  native allocations per second waiting on the GC to release them. Pool the buffers, or use an
  explicitly closed `Arena`.
- Every `Unsafe.allocateMemory` needs a `freeMemory` in a `finally`. Better, it needs replacing
  with `MemorySegment`, which frees on `try-with-resources` and does not depend on anyone
  remembering the `finally`.
- Never store a Java reference in off-heap memory. Only primitives are safe — the GC does not
  know about that reference and may move or collect the object. Keep an index or ID off-heap
  and look it up in an on-heap array.
- `sun.misc.Unsafe` splits into two families with different fates. The **raw address access**
  methods (`allocateMemory`, `reallocateMemory`, `freeMemory`, `copyMemory`, and `getX`/`putX`
  by `long` address) are deprecated for removal by **JEP 471** (JDK 23) with a runtime warning
  from **JEP 498** (JDK 24). The **object-plus-offset CAS** methods (`compareAndSetLong`,
  `objectFieldOffset`, `getAndAddInt`, the `getXVolatile`/`putXVolatile` variants) are **not**
  targeted by either JEP, emit no warning, and remain the internal mechanism of `AtomicLong`,
  `VarHandle` and `LongAdder`. Do not migrate those as if they were affected.
- Treat a JEP 498 warning as scheduled work, not log noise to filter. The flip from `warn`
  to `deny` has **not landed as of JDK 27** — `MemoryAccessOption.defaultValue()` still
  returns `WARN` on that branch, and no release has been announced for it. Test for the day
  it moves with `--sun-misc-unsafe-memory-access=deny`: the change is coming, its release
  is not.
- `MemorySegment` and `Arena` (JEP 454) have been **final since JDK 22** — no preview flags.
  Material still citing `--enable-preview` for FFM is out of date.
- There are **four** `Arena` types, not three: `ofConfined()` (single thread, the recommended
  default), `ofShared()` (multi-thread), `ofAuto()` (GC-managed — the **non**-explicit mode;
  `close()` throws `UnsupportedOperationException`) and `global()` (process lifetime, `close()`
  also unsupported). `ofAuto()` reintroduces exactly the non-deterministic timing risk of the
  Cleaner; it is the exception, not the default.
- Accessing or closing a confined arena from another thread throws `WrongThreadException`. If
  more than one thread needs access or needs to close, use `ofShared()` from creation — never
  try to smuggle a confined arena out.
- JOL measures the heap **wrapper**, never the native payload. Reading a few dozen bytes from
  `ClassLayout.parseInstance` on a 1 MB direct buffer and concluding it is cheap is the classic
  misdiagnosis here.
- NMT has no per-buffer granularity in any version — there is no "DirectByteBuffer memory" line
  inside `Internal`. Its maximum resolution is the category plus its `malloc`/`mmap` split.
  Only `asprof -e nativemem` attributes a native leak to a Java call stack.
- In async-profiler 4.x the tool is `asprof` and the event is `nativemem`. `profiler.sh` and
  `-e malloc` do not exist in that series.
- `-XX:MaxDirectMemorySize` defaults to `-Xmx` when absent, which is rarely the right value.
  Size it from a measured steady state (JMX `MemoryUsed` over time) times 1.3 to 1.5 — never by
  copying a number from another service.
- A JMH `gc.alloc.rate.norm` near zero for an off-heap benchmark does not mean free. It means
  the cost is not in **that** metric; `malloc`/`free` contention still costs, and the `gc`
  profiler cannot see it. The honest conclusion is "off-heap moves the cost out of GC", not
  "off-heap is cheaper".
- Check the arithmetic of any time-to-incident estimate first. Confusing MB/s with MB/min moves
  the estimate by a factor of 60.

## References

- [Native memory diagnosis](references/native-memory-diagnosis.md) — the tool-per-question
  table, the RSS-versus-heap procedure, NMT output shape and its limits, async-profiler
  commands, and the `MaxDirectMemorySize` sizing procedure. Read when native memory is growing
  and you need to find out where it went.
- [The FFM memory API](references/ffm-memory-api.md) — the four `Arena` types with their
  selection rule, `MemorySegment` and `MemoryLayout` usage, mmap through a segment, a pooling
  pattern, and the step-by-step migration from `Unsafe` or `DirectByteBuffer`. Read when
  writing or migrating off-heap allocation code.
