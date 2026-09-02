# Container budget

## The arithmetic that kills pods

```
Limit: 2 GB.  -Xmx = 2 GB.

RSS = 2 GB (heap) + 256 MB (Metaspace) + 128 MB (code cache)
    + 64 MB (stacks) + 64 MB (JVM internal) ≈ 2.5 GB → OOMKilled
```

The heap is a _share_ of the consumption, not the consumption. Budget every region and
leave headroom.

## The arithmetic, worked

Start from the limit, subtract what was measured, and only then choose a heap:

```
Limit                                   2048 MB   (resources.limits.memory)
NMT committed non-heap under load        520 MB   (Class 120 + Thread 96 + Code 64 + GC 180 + other 60 — measured, not typical)
Outside NMT (glibc arenas, JNI, mapped
  files, page cache for logs/dumps)      ~150 MB   (RSS − NMT total, measured the same way)
Margin for the transient peaks           ~100 MB   (a full GC that has not uncommitted, a rollout with two versions warm)
                                        --------
Heap                                     ≈ 1280 MB → -Xmx1280m -Xms1280m, or -XX:MaxRAMPercentage=62.5
```

The percentage is derived from the subtraction, never chosen first. The defaults, measured
on 25.0.3 with `-XX:MaxRAM` standing in for the cgroup limit: `MaxRAMPercentage=25` gives a
quarter of the limit (4 GB → 1 GB), floored at 128 MB (512 MB → 128 MB), and below 256 MB
of limit `MinRAMPercentage=50` takes over (200 MB → 100 MB). An unsized JVM in a 2 GB pod
therefore runs a 512 MB heap and spends the rest on nothing; the fix is the arithmetic
above, not "push it to 90" — at 90% the non-heap regions have 200 MB to live in and the
kernel, not the JVM, ends the process. `-Xmx` wins over `MaxRAMPercentage` when both are
present. What the JVM detects from the cgroup, and every ergonomic derived from it, is
container-awareness; what the cgroup charges beyond RSS is linux-for-jvm.

The GC line deserves its own measurement: the collector's native structures scale with
heap size _and_ GC thread count. On this 24-CPU host a 512 MB G1 heap showed
`GC (committed=81534KB)` at start-up — 16% of the heap — mostly per-thread structures for
18 parallel GC threads; the same heap in a 2-CPU pod commits far less. Under G1 on JDK 26
add the second card table (JEP 522, 0.2% of heap each).

## Measuring, not estimating

```bash
# NMT must be enabled at start — it cannot be turned on for a running process
java -XX:NativeMemoryTracking=summary -jar app.jar

jcmd $(pgrep -f MyApp) VM.native_memory summary
```

```
Total: reserved=4096MB, committed=968MB

-  Java Heap (reserved=2048MB, committed=512MB)   ← governed by -Xms/-Xmx
-      Class (reserved=1056MB, committed=76MB)    ← Metaspace + class space
-     Thread (reserved=135MB, committed=135MB)    ← stacks; 131 threads
-       Code (reserved=247MB, committed=48MB)     ← code cache
-         GC (reserved=72MB,  committed=72MB)     ← card table, remembered sets
-   Compiler (reserved=6MB,   committed=6MB)      ← JIT workspace
-     Symbol (reserved=22MB,  committed=22MB)     ← symbol and string tables
```

Two readings this makes immediate and no heap dashboard offers: total `reserved` (4 GB)
is irrelevant to the cgroup, and committed non-heap (456 MB here) is nearly equal to
committed heap. **That ratio is the number that decides container sizing.**

The JDK Troubleshooting Guide's own figure for NMT is a 5–10% performance cost plus two
machine words per `malloc` block; `detail` mode records call sites and costs more. Measure
the overhead on your own workload before enabling `detail` in production.

Growth is attributed with a diff, not with two screenshots:

```bash
jcmd <pid> VM.native_memory baseline
# ... wait for the growth to happen ...
jcmd <pid> VM.native_memory summary.diff        # per-region delta against the baseline
```

Without `jcmd` access, the periodic JFR events `jdk.NativeMemoryUsage` (per region),
`jdk.NativeMemoryUsageTotal` and `jdk.ResidentSetSize` — all present in `jfr metadata` on
25 — give the same series from a recording, and `jdk.ContainerMemoryUsage` puts the cgroup's
own number next to them.

## When RSS is bigger than NMT

NMT accounts for what the JVM allocates. Everything else in RSS is invisible to it, and
the gap is where a "heap is flat, pod is OOMKilled" investigation usually ends.

| Symptom                                             | Possible cause                                                                                                          | How to distinguish                                                                                                                             | What to measure                                                          | Likely remediation                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| RSS ≈ NMT committed, heap region dominates          | Heap committed as configured; the pod is simply sized for the heap alone                                                | `-Xmx` + measured non-heap > limit                                                                                                             | The arithmetic above                                                     | Smaller heap or larger limit                                                                                                        |
| NMT `Class` or `Code` rising, RSS follows           | Metaspace or code cache growth                                                                                          | `summary.diff` names the region                                                                                                                | `VM.metaspace`, `Compiler.codecache`                                     | metaspace-internals; code-cache-segments                                                                                            |
| NMT `Thread` high                                   | Thread count × stack committed                                                                                          | `threads #N` in the Thread line                                                                                                                | `jcmd <pid> Thread.print` count against `-Xss`                           | Fewer platform threads (virtual threads move the cost into the heap), smaller `-Xss`                                                |
| NMT `Other`/`Internal` rising                       | `ByteBuffer.allocateDirect`, `Unsafe.allocateMemory` — tracked, but not as heap                                         | `summary.diff` on those tags; `jdk.NativeMemoryUsage` for `Other`                                                                              | Direct buffer pool via the `BufferPoolMXBean`, `-XX:MaxDirectMemorySize` | off-heap-memory                                                                                                                     |
| RSS − NMT total grows, NMT flat                     | Native code outside the JVM's allocator: JNI libraries, compression and crypto natives, a database driver's native part | `jcmd <pid> System.map` (Linux, Windows, macOS on 25) or `pmap -x`: anonymous mappings not owned by a JVM tag                                  | `System.dump_map` before and after; `/proc/<pid>/smaps` RSS per mapping  | Find the library (`VM.dynlibs`, `jdk.NativeLibrary`); fix or bound its allocation; jni-and-ffm                                      |
| RSS − NMT total grows slowly on glibc, many threads | malloc arena fragmentation: each thread's arena keeps freed memory                                                      | `System.map` shows many `[heap]`/anonymous arenas; RSS drops after `jcmd <pid> System.trim_native_heap` (Linux only — check `jcmd <pid> help`) | Run with `MALLOC_ARENA_MAX=2` and compare RSS at equal load              | `MALLOC_ARENA_MAX`, or `-XX:TrimNativeHeapInterval=<ms>` (product flag on 25) to trim periodically; linux-for-jvm for the allocator |
| RSS flat, cgroup usage climbing                     | Page cache charged to the container: log files, a heap dump, a mapped file                                              | `memory.stat` `file` versus `anon` inside the cgroup                                                                                           | `jdk.ContainerMemoryUsage` against `jdk.ResidentSetSize`                 | Write dumps and logs to a volume, not the overlay; the accounting itself is linux-for-jvm                                           |
| Mapped files large                                  | `FileChannel.map`, CDS/AOT archives, memory-mapped caches                                                               | `System.map` marks them as file mappings                                                                                                       | Sum of file-backed mappings                                              | Bound the mapping size; note that clean file pages are reclaimable and dirty ones are not                                           |

## Reserved, committed, used

| Number    | Who reports it              | What it means                         |
| --------- | --------------------------- | ------------------------------------- |
| reserved  | `ps` `VSZ`, NMT `reserved`  | address space, not physical memory    |
| committed | NMT `committed`             | mapped and backed                     |
| used      | JMX, Micrometer, dashboards | live data inside the committed region |
| resident  | cgroup, `ps` `RSS`, `VmHWM` | **what the memory limit acts on**     |

```bash
ps -o pid,rss,vsz,comm -p $(pgrep -f MyApp)
# RSS 512MB   VSZ 4GB — VSZ includes all reserved; the cgroup does not limit it
```

## Pre-deploy checklist

- [ ] Full budget summed by the arithmetic above: heap + Metaspace + code cache + stacks +
      direct + internal + GC structures + what NMT does not see + a margin, and the sum
      is the limit — not a percentage picked first. Under G1 the card tables belong in
      the GC item: **from JDK 26 G1 keeps two of them** (JEP 522), and the JEP states
      "Each card table requires 0.2% of Java heap capacity, corresponding to an
      additional 2MB of native memory usage per 1GB of Java heap capacity"
- [ ] `-Xms` = `-Xmx`
- [ ] `-XX:MaxMetaspaceSize` explicit (for diagnosis, not containment)
- [ ] `-XX:ReservedCodeCacheSize` reviewed (the 240 MB default is usually enough)
- [ ] `-Xss` × expected thread count inside the budget
- [ ] `-XX:MaxDirectMemorySize` set if the application uses NIO, Netty or FFM
- [ ] Container run with an explicit memory limit, so JVM ergonomics sees the right value

## In Kubernetes

- [ ] `-Xmx` or `MaxRAMPercentage` leaves room for every non-heap region
- [ ] cgroups v2 supported by the JDK in use (JDK 15+)
- [ ] Alert on `jvm_memory_used_bytes{area="nonheap"}`, not only on heap
- [ ] Pod restarts correlated with `OOMKilled` versus `OutOfMemoryError` — they are
      different diagnoses with different fixes
