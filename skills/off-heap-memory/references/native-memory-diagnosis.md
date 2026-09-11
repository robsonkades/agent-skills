# Diagnosing native memory

## One tool per question

| Question                                                 | Tool                                                              | What it answers                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| How heavy is the Java wrapper?                           | JOL `ClassLayout.parseInstance`                                   | Bytes of the heap object — **not** the native payload                          |
| How much native is reserved and committed, by category?  | NMT, `jcmd <pid> VM.native_memory detail`                         | `reserved`/`committed`/`malloc`/`mmap` per category, no per-buffer granularity |
| Is resident memory growing faster than the heap?         | `/proc/<pid>/smaps_rollup`, cgroup counters and GC/heap telemetry | A native-residency hypothesis; not a binary leak verdict                       |
| How many direct buffers are live right now, and how big? | JMX `java.nio:type=BufferPool,name=direct`                        | `Count`, `MemoryUsed`, `TotalCapacity`                                         |
| Which covered allocation stacks remain unmatched?        | async-profiler `nativemem` JFR plus `jfrconv --nativemem --leak`  | Sampled candidates whose frees were not seen in the recording window           |

## RSS versus used heap

```bash
watch -n 5 'cat /proc/<pid>/status | grep -E "VmRSS|VmHWM|VmPeak"'
jstat -gcutil <pid> 5000
```

These are Linux commands with illustrative PID placeholders. `VmHWM` is the peak resident
set; `VmPeak` is peak virtual size, which can grow without corresponding resident growth.
`VmRSS` is approximate; use `smaps`/`smaps_rollup` when more precise residency matters.
[`jstat -gcutil`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jstat.html) reports utilization percentages, so obtain capacities or used-byte telemetry
when comparing quantities in bytes. See the Linux [proc documentation](https://docs.kernel.org/filesystems/proc.html).

Sustained RSS/PSS growth with used heap flat is a native-residency hypothesis. Select the
observations that distinguish the suspected owners; use existing evidence where adequate:
(1) JMX direct-pool `MemoryUsed` for direct-buffer accounting only; (2) an NMT
`baseline`/`summary.diff` for JVM-tracked categories; (3) `smaps_rollup` and mappings for
anonymous/file-backed residency; and (4) native allocation profiles for covered allocators.
FFM segments, JNI libraries, allocator fragmentation, thread stacks and mappings need not
appear in the direct buffer pool. A flat allocation inventory with rising RSS can mean pages
retained by the native allocator rather than live leaked blocks.

## NMT and its ceiling

```bash
java -XX:NativeMemoryTracking=detail MyApp
jcmd <pid> VM.native_memory baseline
jcmd <pid> VM.native_memory detail.diff
```

The output is nested, not a flat list:

```
-                        Other (reserved=393216KB, committed=393216KB)
                            (malloc=393216KB #182)
```

On the referenced HotSpot 25 GA allocation path, `Unsafe.allocateMemory` and direct buffers appear under `Other`,
but category placement is an implementation detail. External JNI allocators and some OS
mappings may be outside NMT. Identify the target build/path instead of encoding `Internal` or
`Other` as a type system.

NMT does **not** provide per-buffer identity. Detail mode can expose native call sites for
tracked JVM allocations, but it is not a Java ownership graph and does not cover arbitrary
third-party allocation. Use it to partition and diff, not to prove a buffer-level root cause.
NMT committed bytes are not RSS: subtracting them from RSS does not quantify untracked JNI
memory. Compare changes and mapping residency on a common timeline instead.

## Attributing a leak to a Java call stack

```bash
# async-profiler 4.0 syntax; verify the installed version and supported allocator paths.
asprof -e nativemem -d 60 -f offheap.html <pid>
```

This profiles supported native allocation/free paths. A normal allocation flame graph is
allocation volume, not a leak verdict. Record JFR data with frees and use the converter's
leak matching; remaining allocations are candidates within the observation window, subject
to sampling and allocator compatibility.

For a JFR recording with allocation sampling and a dedicated unmatched-allocation report:

```bash
asprof --nativemem 1m -f natmem.jfr -d 300 <pid>
jfrconv --total --nativemem --leak natmem.jfr leak.html
```

In the [async-profiler 4.0 native-memory contract](https://github.com/async-profiler/async-profiler/blob/v4.0/docs/ProfilingModes.md#native-memory-leaks),
`1m` is an allocated-byte sampling interval (1 MiB), not a minimum size for each allocation.
Small allocations can contribute to the interval and be sampled. Sampling reduces detail;
it does not make the recording more precise. An unmatched allocation can still be legitimately
live at the end of the window, and absent samples do not establish zero allocation.

Do **not** add `--nofree` when `jfrconv --leak` must match allocations to releases: it omits
the free events required by that analysis. Validate the exact syntax against the installed
async-profiler version and test attach/interposition on a canary; alternate allocators and
profilers can be incompatible.

## Why JOL cannot answer this

```java
ByteBuffer direct = ByteBuffer.allocateDirect(1024 * 1024); // 1 MB off-heap
System.out.println(ClassLayout.parseInstance(direct).toPrintable());
```

JOL prints the layout of the `java.nio.DirectByteBuffer` **wrapper** — header plus its few
fields (native address, capacity, position, limit, the Cleaner reference). That is tens of
bytes; the exact figure depends on the JDK build and the header mode (Compact Object Headers,
JEP 519), so measure rather than assume. The 1 MB is entirely outside what
`ClassLayout.parseInstance` can see: JOL does not follow the native address field, because
there is no Java object there to inspect.

## Sizing MaxDirectMemorySize

On the referenced HotSpot 25 path, the default ceiling is `Runtime.maxMemory()`, usually
derived from `-Xmx`. The limit controls direct-buffer capacity reservations, not all native
memory, FFM arenas or mapped files. `TotalCapacity` is the relevant pool metric for that
limit; `MemoryUsed` may differ because of alignment/accounting overhead.

1. Use representative existing measurements and known allocation bounds; when the decision
   requires new workload evidence, plan a scoped staging run long enough to observe relevant
   retention and release behavior.
2. Inspect `TotalCapacity` and `MemoryUsed` on the `direct` pool via JMX over time when
   validating observed demand — a single sample does not establish the peak.
3. Model the legitimate peak from maximum concurrent buffers, capacities (not merely bytes
   used), pooling slack, I/O bursts and release lag; include uncertainty from unseen paths.
4. Choose a limit that fits the complete cgroup/native budget and produces the desired
   fail-fast behavior. There is no universal percentage margin.
5. Validate the paths that could violate this budget, such as normal peak, bounded exhaustion,
   cancellation or connection churn. Adequate existing evidence may suffice; no overload run
   is required merely to explain the limit. A plateau under one load shape does not prove all
   cardinalities are bounded.

A pre-measurement estimate is only a hypothesis: 10,000 concurrent 64-KiB buffers imply about
625 MiB of capacity before pool slack, TLS/network buffers and
bursts. Derive a candidate from the full model, then validate failure behavior and cgroup
headroom; the arithmetic alone does not select 1 GiB.
Slices/duplicates normally share a backing allocation, so do not multiply its reservation
by the number of views; even a small retained slice can keep that whole allocation alive.

A direct-buffer reservation OOME is thrown from Java's `Bits` path; do not assume it triggers
HotSpot's shared VM OOM hooks such as `HeapDumpOnOutOfMemoryError` or `ExitOnOutOfMemoryError`.
Verify failure handling on the actual runtime separately from a heap-exhaustion test.

Alert on distance to the limit together with rate, workload and allocation failures; universal
50/80% thresholds ignore burst size and release latency. A capacity mitigation justified by
legitimate demand and headroom can proceed while attribution continues; raising a limit does
not fix sustained unbounded growth.

Implementation sources: HotSpot 25 GA
[`VM` default limit](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/jdk/internal/misc/VM.java),
[`Bits` reservation and Java-thrown OOME](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/nio/Bits.java),
[`DirectByteBuffer` allocation and shared views](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/nio/Direct-X-Buffer.java.template)
and [`Unsafe_AllocateMemory0`'s `mtOther` tag](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/prims/unsafe.cpp).
API/tool limits: Java 25
[`BufferPoolMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/BufferPoolMXBean.html)
and [Native Memory Tracking](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html).
