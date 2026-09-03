# Container budget

## The arithmetic that creates OOM-kill risk

```
Limit: 2 GB.  -Xmx = 2 GB.

Peak cgroup charge can approach:
  resident heap up to 2 GB + 256 MB Metaspace + 128 MB code cache
  + resident stacks/native/internal/file pages ≈ 2.5 GB > limit → OOM-kill risk
```

The heap is a _share_ of the consumption, not the consumption. Budget every region and
leave headroom.

## The arithmetic, worked

Start from the limit, subtract what was measured, and only then choose a heap:

```
Limit                                   2048 MB   (resources.limits.memory)
NMT committed non-heap under load        520 MB   (Class 120 + Thread 96 + Code 64 + GC 180 + other 60 — illustrative measured peak)
Process-resident outside NMT             ~100 MB   (RSS/PSS versus resident tracked domains; JNI/allocator/mappings)
Cgroup file/tmpfs/other overlap           ~50 MB   (`memory.stat`; not necessarily in process RSS)
Margin for correlated/transient peaks    ~100 MB   (derived from peak overlap and uncertainty, not a generic constant)
                                        --------
Candidate max heap                       ≈ 1280 MB → -Xmx1280m, or -XX:MaxRAMPercentage=62.5
```

Choose `-Xms` separately from startup, residency/uncommit and SLO evidence; equality with
`-Xmx` is not implied by this capacity arithmetic. The percentage is derived from the
subtraction, never chosen first. The defaults, measured
on 25.0.3 with `-XX:MaxRAM` standing in for the cgroup limit: `MaxRAMPercentage=25` gives a
quarter of the limit (4 GB → 1 GB), floored at 128 MB (512 MB → 128 MB), and below 256 MB
of limit `MinRAMPercentage=50` takes over (200 MB → 100 MB). On that verified setup, an
unsized JVM in a 2 GB limit selected a 512 MB max heap; the remainder is available to
committed/native memory, file cache, sidecars and unused headroom—not “nothing.” Derive a
higher percentage only from measured peaks; at 90%, roughly 200 MB remains for every
non-heap/cgroup charge, which may or may not fit. `-Xmx` wins over `MaxRAMPercentage` when both are
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

APP_PID=$(pgrep -n -f '[/]app/MyApp.jar')
test -n "$APP_PID" && jcmd "$APP_PID" VM.native_memory summary
```

```
Total: reserved=4096MB, committed=968MB

-  Java Heap (reserved=2048MB, committed=512MB)   ← governed by -Xms/-Xmx
-      Class (reserved=1056MB, committed=76MB)    ← Metaspace + class space
-     Thread (reserved=135MB, committed=14MB)     ← illustrative stacks; 131 threads
-       Code (reserved=247MB, committed=48MB)     ← code cache
-         GC (reserved=72MB,  committed=72MB)     ← card table, remembered sets
-   Compiler (reserved=6MB,   committed=6MB)      ← JIT workspace
-     Symbol (reserved=22MB,  committed=22MB)     ← symbol and string tables
```

Two readings this makes immediate and no heap dashboard offers: NMT `reserved` is virtual
address accounting, while `committed` is memory the JVM has made accessible—not proof that
every page is resident or currently charged. Reconcile category totals with process RSS/PSS,
cgroup `memory.current`/`memory.stat` and untracked native/file pages. Container sizing is
decided by their measured peaks and overlap, not one committed ratio.

The JDK Troubleshooting Guide's own figure for NMT is a 5–10% performance cost plus two
machine words per `malloc` block; `detail` mode records call sites and costs more. Measure
the overhead on your own workload before enabling `detail` in production.

Growth is attributed with a diff, not with two screenshots:

```bash
jcmd <pid> VM.native_memory baseline
# ... wait for the growth to happen ...
jcmd <pid> VM.native_memory summary.diff        # per-region delta against the baseline
```

Without `jcmd` access, periodic JFR events such as `jdk.NativeMemoryUsage`,
`jdk.NativeMemoryUsageTotal`, `jdk.ResidentSetSize` and `jdk.ContainerMemoryUsage` (verify
presence, enablement and period on the exact JDK/settings) provide correlated series. They
do not make NMT committed, RSS and cgroup usage interchangeable.

## When RSS is bigger than NMT

NMT accounts for what the JVM allocates. Everything else in RSS is invisible to it, and
the gap is where a "heap is flat, pod is OOMKilled" investigation usually ends.

| Symptom                                                        | Possible cause                                                                                                          | How to distinguish                                                                                            | What to measure                                                         | Likely remediation                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resident/cgroup peaks track heap commitment and heap dominates | Heap policy may consume the budget, but NMT committed is not itself RSS                                                 | Correlate heap committed/used, RSS/PSS and `memory.stat` at the same timestamps                               | The arithmetic above with peak overlap                                  | Smaller/flexible heap, reduced state or larger limit according to SLO                                                                             |
| NMT `Class` or `Code` rising, RSS follows                      | Metaspace or code cache growth                                                                                          | `summary.diff` names the region                                                                               | `VM.metaspace`, `Compiler.codecache`                                    | metaspace-internals; code-cache-segments                                                                                                          |
| NMT `Thread` high                                              | Platform-thread count and stack reserve/commit                                                                          | `threads #N`, stack reserved/committed and actual RSS/PSS                                                     | Thread lifecycle, `-Xss`, native/Java call depth                        | Bound platform threads; reduce `-Xss` only after stack-safety testing; virtual threads shift—not erase—memory                                     |
| NMT `Other`/`Internal` rising                                  | Direct/Unsafe or JVM-internal tracked paths are hypotheses; category is build/path-specific                             | `summary.diff`, NMT detail sites and direct-pool trend; do not equate the category with one API               | BufferPoolMXBean covers direct-buffer accounting, not arbitrary FFM/JNI | off-heap-memory                                                                                                                                   |
| RSS − NMT total grows, NMT flat                                | Native code outside the JVM's allocator: JNI libraries, compression and crypto natives, a database driver's native part | `jcmd <pid> System.map` (Linux, Windows, macOS on 25) or `pmap -x`: anonymous mappings not owned by a JVM tag | `System.dump_map` before and after; `/proc/<pid>/smaps` RSS per mapping | Find the library (`VM.dynlibs`, `jdk.NativeLibrary`); fix or bound its allocation; jni-and-ffm                                                    |
| RSS − tracked resident memory grows on glibc, many threads     | malloc arenas/fragmentation are one hypothesis                                                                          | Mapping/smaps plus allocator statistics; controlled trim response is evidence, not proof                      | Compare RSS/PSS, faults, CPU and latency at equal load                  | Experiment with arena/trim policy and measure contention/CPU; allocator behavior belongs to `linux-for-jvm`                                       |
| RSS flat, cgroup usage climbing                                | File/page cache, tmpfs, shared or kernel charges assigned to the cgroup                                                 | `memory.stat` categories and PSI/events versus process mappings                                               | `memory.current`, `memory.stat`, RSS/PSS and I/O/writeback              | Bound/rotate output and provide headroom; a persistent volume preserves files but does not inherently avoid page-cache charging (`linux-for-jvm`) |
| Mapped files large                                             | `FileChannel.map`, CDS/AOT archives, memory-mapped caches                                                               | `System.map`/`smaps` distinguishes virtual size, RSS/PSS, clean and dirty pages                               | Resident/dirty bytes and writeback pressure—not mapping length alone    | Bound active mappings; clean pages are readily reclaimable, dirty pages require writeback and can still be reclaimed later                        |

## Reserved, committed, used

| Number                  | Who reports it                                         | What it means                                                                 |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| virtual size / reserved | `ps` `VSZ`, NMT `reserved` (different accounting sets) | address ranges; not physical residency and not directly additive              |
| committed               | NMT `committed`                                        | JVM-tracked range made accessible/committed; pages may still be nonresident   |
| used                    | JMX, Micrometer, dashboards                            | logical occupancy inside a managed pool; meaning is pool-specific             |
| resident                | `ps` `RSS`, `smaps` RSS/PSS, `VmHWM`                   | process-resident pages; shared-page accounting needs care                     |
| cgroup charged          | `memory.current` / `memory.stat`                       | anon, file and other charges against the cgroup limit; not simply process RSS |

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
- [ ] Fixed versus variable `-Xms` chosen from measured startup, residency, uncommit and SLO behavior
- [ ] `MaxMetaspaceSize` either justified as a fail-fast budget or deliberately omitted, with loader/class-space alerts
- [ ] Effective segmented code-cache sizes and peak/compiler events reviewed on the target build
- [ ] Platform-thread stack reservation and observed committed/resident peak budgeted; `-Xss × count` is a conservative virtual bound
- [ ] Direct-buffer limit/pools measured; recognize that FFM arenas, JNI and some Netty/no-cleaner paths are not bounded by `MaxDirectMemorySize`
- [ ] Container run with an explicit memory limit, so JVM ergonomics sees the right value

## In Kubernetes

- [ ] `-Xmx` or `MaxRAMPercentage` leaves room for every non-heap region
- [ ] Exact JDK vendor/update validated against the deployed cgroup version/controllers; do not rely only on a minimum major
- [ ] Alert on heap plus Metaspace/code, direct-buffer pools, platform-thread count, RSS/PSS and cgroup usage/events; JMX “nonheap” excludes important native domains
- [ ] Pod restarts correlated with `OOMKilled` versus `OutOfMemoryError` — they are
      different diagnoses with different fixes
