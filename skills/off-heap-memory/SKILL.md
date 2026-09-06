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
shows directly (heap dumps can still identify retaining wrappers). Off-heap is not faster by definition — it is a **different memory budget
with a different cost**. On the heap the dominant cost is GC work for as long as the object
lives; off-heap adds allocation/release and lifetime-management costs. Managed segments
provide safety checks, while raw addresses do not.

The failure this prevents is unmanaged native growth. A direct `ByteBuffer` normally releases
through Cleaner/reference processing, so wrapper reachability affects timing. HotSpot also
accounts reservations in `Bits.reserveMemory`, enforces the direct-memory limit and may
request reference processing/GC on the slow path; it is therefore wrong to say native
pressure is invisible. The mechanism is still nondeterministic and distinct from explicit
arena ownership.

## Workflow

1. **Establish the runtime and both heap and process/cgroup state.** Inspect the project's
   Java/toolchain and library versions; FFM examples require Java 22+ without an implied upgrade.
   A busy heap does not exclude native
   growth. Correlate GC/heap, RSS/PSS, cgroup `memory.current` and workload on one timeline.
2. **Classify the symptom.** `OutOfMemoryError: Direct buffer memory` names the direct-buffer
   reservation path. Exit 137 alone is consistent with SIGKILL, not proof of an OOM;
   Kubernetes `OOMKilled` adds runtime evidence of an OOM event, not its allocation owner.
   Inspect `memory.events`, pod/node events and all JVM/native domains before attributing it.
3. **Compare RSS/PSS, cgroup charge and used/committed heap over time.** Divergence is a
   native-residency hypothesis, not proof of a leak: allocator arenas/fragmentation, stacks,
   mapped files, page cache accounting, code and delayed uncommit can produce it.
4. **Narrow by owner:** JMX `java.nio:type=BufferPool,name=direct` covers direct-buffer
   accounting, not arbitrary FFM/native allocations. Use NMT baselines/diffs for JVM-tracked
   categories, `/proc/<pid>/smaps_rollup`/maps for residency, and async-profiler native-memory
   recording where allocator/tool compatibility and production overhead are acceptable.
5. **Ask the sizing question only after explaining the growth model.** Raising
   `-XX:MaxDirectMemorySize` against sustained growth converts a fast OOM into a slow one.
   See `references/native-memory-diagnosis.md`.
6. **When migrating legacy code, pick the `Arena` type from the real ownership pattern**,
   not from habit — cross-thread access to a confined segment fails deterministically with
   `WrongThreadException`, while close/access races in a shared arena require coordination.
7. **Validate the fix by repeating the measurement under the load that revealed it,** and
   confirm growth stopped rather than merely paused.

## Rules

- Off-heap is justified when measured benefits such as I/O interoperability, deterministic bulk
  lifetime, mmap, addressability or reduced GC scanning outweigh allocation, bounds/access,
  copying, fragmentation and operational costs. Heap/TLAB allocation is often cheaper for
  small short-lived values, but benchmark the complete data path.
- Avoid one native allocation per hot-path operation unless ownership and measurements justify
  it. Prefer a library's proven bounded pool or a scoped arena; pooling adds retention,
  zeroing/data-remanence, fairness and use-after-release risks.
- Every raw `Unsafe` address needs explicit single-owner lifetime, overflow/alignment checks,
  failure-safe release and use-after-free protection. Prefer `MemorySegment` where its scoped
  lifetime and access model fit; migration is not a mechanical allocation-call replacement.
- Do not encode an ordinary Java object reference as an unmanaged native address. The GC does
  not treat it as a root or update it. Store values/IDs/handles governed by a supported JNI/FFM
  interop contract, with their reachability and lifetime explicit.
- **JEP 471/498 cover on-heap, off-heap and bimodal `sun.misc.Unsafe` memory access.**
  Object-plus-offset operations such as `compareAndSwapLong`, `objectFieldOffset`,
  `getAndAddInt` and volatile access are affected too. Migrate supported field/array access
  to `VarHandle`; use FFM for native memory. JDK classes using `jdk.internal.misc.Unsafe`
  do not make application calls to the distinct `sun.misc.Unsafe` API exempt.
- Treat a JEP 498 warning as scheduled work, not log noise to filter. The flip from `warn`
  to `deny` must be checked on the target build; JEP 498's future schedule is not proof
  of integration in a release. JDK 25 GA source defaults to `WARN`. Exercise affected
  paths with `--sun-misc-unsafe-memory-access=deny` before upgrading.
- `MemorySegment` and `Arena` (JEP 454) have been **final since JDK 22** — no preview flags
  for FFM on 22+. Older baselines used preview APIs; other features may still require preview.
- There are **four** `Arena` factories: `ofConfined()` (single-owner thread), `ofShared()`
  (multi-thread), `ofAuto()` (GC-managed — the **non**-explicit mode;
  `close()` throws `UnsupportedOperationException`) and `global()` (process lifetime, `close()`
  also unsupported). `ofAuto()` reintroduces exactly the non-deterministic timing risk of the
  Cleaner; it is the exception, not the default.
- Accessing or closing a confined arena from another thread throws `WrongThreadException`. If
  more than one thread needs access or needs to close, choose `ofShared()` from creation and
  coordinate close against in-flight access.
- JOL measures the heap **wrapper**, never the native payload. Reading a few dozen bytes from
  `ClassLayout.parseInstance` on a 1 MB direct buffer and concluding it is cheap is the classic
  misdiagnosis here.
- NMT has no per-buffer granularity. Its categories and call-site detail cover JVM-tracked
  allocation paths, not every external allocator/mapping. Native-memory profiling can provide
  allocation stacks, but sampled/interposed coverage, frees, allocator compatibility and
  recording window bound what it proves.
- In async-profiler 4.x the tool is `asprof` and the event is `nativemem`. `profiler.sh` and
  `-e malloc` do not exist in that series.
- On the verified HotSpot implementation, absent `-XX:MaxDirectMemorySize` uses
  `Runtime.maxMemory()` as the direct-buffer ceiling. Derive an explicit value, if needed,
  from concurrency/capacity bounds, observed high-water marks, burst duration and the complete
  cgroup budget. No universal 1.3–1.5 multiplier establishes safety.
- A JMH `gc.alloc.rate.norm` near zero for an off-heap benchmark does not mean free. It means
  the cost is not in **that** metric; `malloc`/`free` contention still costs, and the `gc`
  profiler cannot see it. The honest conclusion is "off-heap moves the cost out of GC", not
  "off-heap is cheaper".
- Check the arithmetic of any time-to-incident estimate first. Confusing MB/s with MB/min moves
  the estimate by a factor of 60.

## Decision and failure checklist

- Define owner, maximum bytes, maximum concurrent allocations, release event and shutdown path.
- Cancellation/timeout is not proof native work stopped. Keep its allocation or pool lease
  alive until actual completion; a shared arena permits thread access, not data-race freedom.
- Specify whether data must be zeroed before reuse/release and whether untrusted sizes can drive
  allocation; use checked arithmetic and enforce per-request/per-tenant quotas.
- Test allocation failure, partial initialization, double close, access after close, concurrent
  close/access, cancellation and process shutdown.
- Validate with heap/direct-pool/NMT/OS/cgroup signals together; each observes a different set.
- Roll out with a native-memory alert and rollback threshold; compare throughput, tail latency,
  RSS/PSS and GC work against the on-heap baseline.

## References

- [Native memory diagnosis](references/native-memory-diagnosis.md) — the tool-per-question
  table, the RSS-versus-heap procedure, NMT output shape and its limits, async-profiler
  commands, and the `MaxDirectMemorySize` sizing procedure. Read when native memory is growing
  and you need to find out where it went.
- [The FFM memory API](references/ffm-memory-api.md) — the four `Arena` types with their
  selection rule, `MemorySegment` and `MemoryLayout` usage, mmap through a segment, a pooling
  pattern, and the step-by-step migration from `Unsafe` or `DirectByteBuffer`. Read when
  writing or migrating off-heap allocation code.

Authoritative sources: [JEP 454](https://openjdk.org/jeps/454),
[JEP 471](https://openjdk.org/jeps/471), [JEP 498](https://openjdk.org/jeps/498),
[`Arena` API, JDK 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Arena.html),
and the OpenJDK 25 GA [`Bits.reserveMemory` implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/nio/Bits.java)
and [`sun.misc.Unsafe`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.unsupported/share/classes/sun/misc/Unsafe.java).
