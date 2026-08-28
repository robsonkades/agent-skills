# Container arithmetic

Read at step 5, whenever the artefact is or includes a container manifest, or the complaint
mentions OOMKilled, CPU limits or throttling. Scope here is deliberately narrow: **turning a
supplied manifest into a statement about what the JVM will do**, and naming the command that
checks it. For what the JVM detects in general, and for the non-heap budget itself, the
owners are `container-awareness` and `jvm-memory-regions`.

Everything below is Linux-only by construction — `UseContainerSupport` is a Linux flag,
defaulting to `true`.

## The manifest-to-JVM derivation

| Manifest field                          | What the JVM derives                                                                                                                      | Finding when it goes wrong                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `limits.cpu`                            | `ActiveProcessorCount` → GC threads, JIT compiler threads, `ForkJoinPool.commonPool`, virtual-thread scheduler; at `1`, also **SerialGC** | Threads sized for a machine the pod never gets; P2: SerialGC at `limits.cpu: 1` however large the memory |
| `requests.cpu` with **no** `limits.cpu` | **the full host CPU count**                                                                                                               | P2: massive oversizing plus heavy CFS throttling                                                         |
| `limits.memory`                         | Base for `MaxRAMPercentage`; also the ≥1792 MB half of the collector-selection test                                                       | P2: SerialGC chosen silently on a small pod                                                              |
| `limits.memory` == `-Xmx`               | No non-heap budget at all                                                                                                                 | P3: OOMKill instead of `OutOfMemoryError`, no heap dump                                                  |
| no `limits.memory`                      | Base is the node's memory                                                                                                                 | P2: heap sized from the node; see `MaxRAMPercentage` and compressed oops                                 |

## How a CPU quota becomes `ActiveProcessorCount`

```text
host_cpus   = active_processor_count()        # sched_getaffinity
limit_count = host_cpus                       # stays this when no quota is set
if cpu_quota > -1 and cpu_period > 0:
    limit_count = ceil(cpu_quota / cpu_period)
ActiveProcessorCount = min(host_cpus, limit_count)
```

Two things to internalise, both of which invalidate widely repeated advice:

1. **`ceil`, not `floor`.** Kubernetes `limits.cpu: 1500m` (quota 150000, period 100000)
   yields **2**, not 1. `limits.cpu: 100m` yields **1**. So a "fractional CPU" pod is not
   given a fractional processor count — it is given a whole one and then throttled, which is
   why throttling and not processor count is usually the thing to measure.
2. **CPU _shares_ no longer influence this.** The code path does not read shares, and
   `-XX:+UseContainerCpuShares` / `-XX:+PreferContainerQuotaForCPUCount` were deprecated in
   JDK 19, obsoleted in 20 and **expired in 21**. Any tuning advice reasoning from
   cpu-shares behaviour is pre-JDK-19 and wrong on every release in scope. The direct
   consequence: **on JDK 21+, `requests.cpu` with no `limits.cpu` hands the JVM the whole
   host's CPU count**, sizing GC threads, compiler threads and the common pool for hardware
   the pod will never receive.

`-XX:ActiveProcessorCount=n` overrides the computation and is honoured even when
`UseContainerSupport` is off. It is the correct single lever when the detected count is
wrong — preferable to setting GC and compiler thread counts individually, because it fixes
all of them coherently.

No behavioural difference was found in cgroup detection, this formula,
the `UseContainerSupport` default or `is_server_class_machine` between JDK 21, 25 and 26.

**Executed**, not merely read from source — cgroup v2, Linux 6.18 VM, 24 CPUs / 15.5 GB,
Temurin 21.0.12+7, 25.0.4+7 and 26.0.2+7, one container per row. All three JDKs agreed on
every row:

| `--cpus` (≙ `limits.cpu`) | `cpu.max`       | `availableProcessors()` |
| ------------------------- | --------------- | ----------------------- |
| `0.1` (100m)              | `10000 100000`  | 1                       |
| `0.9` (900m)              | `90000 100000`  | 1                       |
| `1.5` (1500m)             | `150000 100000` | **2**                   |
| `2.5` (2500m)             | `250000 100000` | **3**                   |
| `3.1` (3100m)             | `310000 100000` | **4**                   |
| none                      | `max 100000`    | **24** (the whole host) |
| `--cpu-shares=512`        | `max 100000`    | 24 — shares ignored     |
| `--cpu-shares=2048`       | `max 100000`    | 24 — shares ignored     |
| `--cpuset-cpus=0-1`       | `max 100000`    | 2 — affinity, not quota |

`ceil` and the no-quota fallback are therefore measured, not inferred. `--cpuset-cpus`
confirms the `host_cpus` term is `sched_getaffinity`, so a cpuset narrows the count with no
quota present at all. Both expired flags were also executed: `-XX:+UseContainerCpuShares`
and `-XX:+PreferContainerQuotaForCPUCount` are **`Unrecognized VM option`** and the JVM
exits 1 — already on 21.0.12, so no release in scope accepts them.

## What the JVM reads, and when detection degrades

`UseContainerSupport` detection reads `/proc/cgroups`, `/proc/self/cgroup` and
`/proc/self/mountinfo`, then the limit files:

| Value            | cgroup v1                                | cgroup v2                          |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| memory limit     | `memory.limit_in_bytes`                  | `memory.max`                       |
| memory usage     | `memory.usage_in_bytes`                  | `memory.current`                   |
| RSS / cache      | `memory.stat` keys `rss` / `cache`       | `memory.stat` keys `anon` / `file` |
| CPU quota/period | `cpu.cfs_quota_us` / `cpu.cfs_period_us` | both fields of `cpu.max`           |

A hierarchy walk climbs the cgroup path looking for the lowest memory limit, and logs
`Cgroup memory controller path at '…' seems to have moved to '…', detected limits won't be
accurate` when the path contains a `../`. That is a real failure mode when a container is
live-migrated or its cgroup is renamed underneath it, and it is worth grepping for before
trusting any heap number derived from a detected limit.

**The one command that settles all of it:** `-Xlog:os+container=trace`, or
`java -XshowSettings:system` (Linux only: shows host or container configuration and
continues). At runtime, `jfr view container-configuration` reports `containerType`,
`cpuSlicePeriod`, `cpuQuota`, `cpuShares`, `effectiveCpuCount`, `memorySoftLimit`,
`memoryLimit`, `swapMemoryLimit` and `hostTotalMemory` from `jdk.ContainerConfiguration`.

## Why RSS exceeds the heap

RSS is the Java heap plus every other NMT category plus things NMT does not track at all
(the C library's allocator overhead and fragmentation, `mmap`s made by native libraries, the
executable and mapped files).

The categories that actually move in production: `Thread Stack` (thread count × `-Xss`),
`Class`/`Metaspace` (classloaders, proxies, generated classes), `Code` (JIT output, capped
by `ReservedCodeCacheSize`, default 240 MB tiered), `GC` and `GCCardSet` (remembered sets,
heap-size dependent), `Compiler` (transient C2 arenas, which can spike), and
`Internal`/`Other` (direct byte buffers).

**The untracked residual.** On glibc, per-thread malloc arenas fragment and are not returned
to the OS promptly. `jcmd <pid> System.native_heap_info` exposes this via `malloc_info(3)`;
`jcmd <pid> System.trim_native_heap` and `-XX:TrimNativeHeapInterval=<ms>` address it —
but **`TrimNativeHeapInterval` does not exist on JDK 21**, only from JDK 22 onward, so that
remediation is off the table for a JDK 21 fleet.

## NMT: cost, and how to read it without misquoting it

Oracle's own JDK 25 troubleshooting guide states that enabling NMT causes a **5–10 percent**
JVM performance drop and adds two machine words to every malloc as a header. **Carry the
caveat with the number:** Oracle states it identically for `summary` and `detail` and gives
no benchmark, build, hardware or workload. It is the vendor's published figure and nothing
more.

Operational facts that change what you can recommend:

- NMT **must be enabled at JVM startup**. `jcmd <pid> VM.native_memory` on a JVM started
  without it replies literally `Native memory tracking is not enabled`. So "turn on NMT" is
  never a fix for a running incident — it is a fix for the next one.
- Every line has `reserved` (address space) and `committed` (backed memory). **Only
  `committed` correlates with RSS.** Reserved for the Java heap is `-Xmx`-shaped and
  routinely dwarfs RSS; quoting reserved numbers is the most common misreading of an NMT
  report, and worth checking whenever someone hands one over as evidence.
- Use `baseline` → workload → `summary.diff` to see _growth_ rather than absolute size, and
  always pass `scale=MB` — the default scale is KB.
- **Prefer the JFR route first:** `jfr view native-memory-committed` over
  `jdk.NativeMemoryUsage`, which is enabled in `default.jfc`, gives committed-by-category
  over time with no startup flag and none of NMT's claimed overhead. Recommend NMT only when
  the JFR view is not enough.

## Container-relevant changes across the release window

- **JDK 21:** `UseContainerCpuShares` and `PreferContainerQuotaForCPUCount` expire; the
  cpu-shares path is gone.
- **JDK 22:** `TrimNativeHeapInterval` appears.
- **JDK 26:** the 128 GB `MaxRAM` cap is removed and `InitialRAMPercentage` defaults to 0.0
  — container-visible on large hosts (see `flag-cost-and-defaults.md`).
- **JDK 27 (RC, GA scheduled 2026-09-15):** G1 becomes the default in all environments
  (JEP 523), removing the small-container-gets-Serial surprise. Scheduled, not observed.
