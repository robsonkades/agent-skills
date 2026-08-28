# Container budget

## The arithmetic that kills pods

```
Limit: 2 GB.  -Xmx = 2 GB.

RSS = 2 GB (heap) + 256 MB (Metaspace) + 128 MB (code cache)
    + 64 MB (stacks) + 64 MB (JVM internal) ≈ 2.5 GB → OOMKilled
```

The heap is a _share_ of the consumption, not the consumption. Budget every region and
leave headroom.

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

NMT costs a few percent in `summary` mode and considerably more in `detail`. Measure the
overhead on your own workload before enabling `detail` in production.

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

- [ ] Full budget summed: heap + Metaspace + code cache + stacks + direct + internal + GC
      structures. Under G1 the card tables belong in that last item: **from JDK 26 G1 keeps
      two of them** (JEP 522), and the JEP states "Each card table requires 0.2% of Java
      heap capacity, corresponding to an additional 2MB of native memory usage per 1GB of
      Java heap capacity"
      ≤ 75% of the container limit
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
