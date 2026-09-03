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
watch -n 5 'cat /proc/<pid>/status | grep -E "VmRSS|VmPeak"'
jstat -gcutil <pid> 5000
```

Sustained RSS/PSS growth with used heap flat is a native-residency hypothesis. Correlate:
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

On current HotSpot, `Unsafe.allocateMemory` and direct buffers commonly appear under `Other`,
but category placement is an implementation detail. External JNI allocators and some OS
mappings may be outside NMT. Identify the target build/path instead of encoding `Internal` or
`Other` as a type system.

NMT does **not** provide per-buffer identity. Detail mode can expose native call sites for
tracked JVM allocations, but it is not a Java ownership graph and does not cover arbitrary
third-party allocation. Use it to partition and diff, not to prove a buffer-level root cause.

## Attributing a leak to a Java call stack

```bash
# async-profiler 4.x. "profiler.sh" and the event "-e malloc" do NOT exist
# in this series -- the event name is "nativemem".
asprof -e nativemem -d 60 -f offheap.html <pid>
```

This profiles supported native allocation/free paths. A normal allocation flame graph is
allocation volume, not a leak verdict. Record JFR data with frees and use the converter's
leak matching; remaining allocations are candidates within the observation window, subject
to sampling and allocator compatibility.

For a more precise session — a minimum allocation threshold to cut noise, plus a dedicated
leak report:

```bash
asprof --nativemem 1m -f natmem.jfr -d 300 <pid>
jfrconv --total --nativemem --leak natmem.jfr leak.html
```

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

Absent the flag the ceiling is implicitly `-Xmx`, which rarely reflects real direct memory use.

1. Run in staging under representative load, long enough to reach steady state.
2. Measure `MemoryUsed` on the `direct` pool via JMX over time — not a single sample.
3. Model the legitimate peak from maximum concurrent buffers, capacities (not merely bytes
   used), pooling slack, I/O bursts and release lag; include uncertainty from unseen paths.
4. Choose a limit that fits the complete cgroup/native budget and produces the desired
   fail-fast behavior. There is no universal percentage margin.
5. Validate normal peak, overload, cancellation and connection churn. A plateau under one
   load shape does not prove all cardinalities are bounded.

A pre-measurement estimate is only a hypothesis: 10,000 concurrent 64-KiB buffers imply about
625 MiB of capacity before pool slack, duplicate/slice accounting, TLS/network buffers and
bursts. Derive a candidate from the full model, then validate failure behavior and cgroup
headroom; the arithmetic alone does not select 1 GiB.

Alert on distance to the limit together with rate, workload and allocation failures; universal
50/80% thresholds ignore burst size and release latency. Raising a limit without explaining
sustained growth only defers the incident.
