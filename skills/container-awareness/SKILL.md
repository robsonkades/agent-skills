---
name: container-awareness
description: >
  What the JVM actually detects inside a container: cgroup v1 versus v2 detection,
  ActiveProcessorCount and how a CPU quota becomes a processor count, MaxRAMPercentage and
  every ergonomic derived from it, GC and JIT thread counts sized from the wrong number, and
  verifying all of it from inside the running container. Use when a pod is OOMKilled while
  heap usage is well below Xmx, when a Deployment has no resources.limits or sets
  limits.memory equal to Xmx, when MaxRAMPercentage is pushed to 90, when someone reads
  ActiveProcessorCount out of PrintFlagsFinal or jcmd VM.flags and gets -1, when a cgroup
  command reads /sys/fs/cgroup/cpu/cpu.stat and finds nothing, or when latency spikes have
  no matching GC pause. Does not cover host-side kernel behaviour such as the node OOM
  killer, page faults, swap, PSI or signals (linux-for-jvm), the memory-region budget itself
  (jvm-memory-regions), or CPU topology and pinning (numa-and-cpu-affinity).
---

# Container Awareness

## Purpose

Decide whether the JVM's automatic sizing inside this container is the sizing you
actually want. `UseContainerSupport` — on by default since JDK 10 — only fixes the
_source_ of the numbers: the JVM reads `memory.max` and `cpu.max` from the cgroup instead
of `/proc/meminfo` and `/proc/cpuinfo`. It does not make the resulting heap, GC thread
count or JIT thread count right for the workload.

The failure this prevents is the confidently wrong container diagnosis: a pod killed for
native footprint while the heap sat at 70%, "fixed" by lowering `-Xmx`; or a CPU quota
verified with `grep ActiveProcessorCount`, a command that returns `-1` on every machine
and is structurally incapable of answering the question.

## Workflow

1. **Establish what the JVM detected, from inside the container.** `java
-XshowSettings:system` for the processor count, `-Xlog:os+container=trace` for the raw
   cgroup reads, `jcmd <pid> VM.flags -all` for ergonomically resolved flags. See
   `references/reading-the-container.md`.
2. **Confirm the cgroup version before running any cgroup command.** v2 is a unified
   hierarchy with different file names _and_ different field names; a v1 command does not
   fail loudly on v2, it finds nothing.
3. **Separate the memory question from the CPU question.** They have different evidence:
   `memory.current` / `memory.events` for one, `cpu.max` / `cpu.stat` for the other.
4. **For a kill, check `oom_kill` in the cgroup's own `memory.events` first.** If it
   incremented, the process exceeded its own `memory.max` — stay here. If it did not and
   the pod died anyway, the decision came from the node, not this cgroup; that is
   `linux-for-jvm`'s layer.
5. **Attribute RSS with Native Memory Tracking under load**, not at boot, before changing
   any limit. Heap near `Xmx` at the moment of the kill points at heap; heap well below it
   points at native footprint, and lowering `-Xmx` then makes things worse.
6. **For latency spikes with no matching GC pause, measure throttling**: `nr_throttled`
   over `nr_periods` from `cpu.stat`, at peak load, timestamp-correlated with the
   client-side spikes.
7. **Re-measure the metric that motivated the change, under the same load.** A container
   change is not validated by the absence of the old symptom in a different run.

## Rules

- Never read `ActiveProcessorCount` from `-XX:+PrintFlagsFinal` or `jcmd VM.flags`, with
  or without `-all`. It is a `manageable` flag whose `-1` sentinel is never rewritten with
  the detected value. Use `java -XshowSettings:system` (Linux, JDK 19+) or
  `Runtime.getRuntime().availableProcessors()`. Set the flag to _force_ a count, never to
  read one.
- In `-XshowSettings:system`, the answer is the **`Effective CPU Count`** field. The
  `List of Effective Processors, N total` line directly under it is the host affinity mask,
  not the quota: under `--cpus=2` on a 24-CPU host it reads `Effective CPU Count: 2` and
  `List of Effective Processors, 24 total`. Quoting the `24` is the same mistake as reading
  the flag, one line lower.
- `jcmd <pid> VM.flags` without `-all` shows only what was passed on the command line.
  Ergonomically resolved flags need `-all` — with `ActiveProcessorCount` as the exception
  that `-all` still cannot reveal.
- Use `grep -w` when extracting a flag from `PrintFlagsFinal`. `MaxHeapSize` without `-w`
  also matches `SoftMaxHeapSize` and returns the wrong line. The value is field `$4` of
  `<type> <name> = <value> {tags}`, in bytes.
- On cgroups v2, the controller subdirectory does not exist: `/sys/fs/cgroup/cpu.stat`,
  not `/sys/fs/cgroup/cpu/cpu.stat`. The field names changed too — `nr_periods`,
  `nr_throttled`, `throttled_usec`, not `throttled_periods`.
- The JVM sizes `ActiveProcessorCount` from `limits.cpu` (`cpu.max`), never from
  `requests.cpu`. A pod with `requests.cpu: 500m` and `limits.cpu: 4` sizes GC threads,
  JIT compiler threads and `ForkJoinPool.commonPool` as though it owned four CPUs.
- Never ship a Deployment with `resources: {}` or a missing block. Without `limits.memory`
  the detected memory tends towards the node's, and heap ergonomics take 25% of the whole
  node.
- Never set `-Xmx` numerically equal to `limits.memory`. That leaves zero headroom for
  everything that is not heap.
- Reject any fixed multiplier over `Xmx` as a memory-limit rule, `1.5×` included. Native
  footprint is a function of the application, not of the heap; a measured case reached
  `1.62×`. Size `limits.memory` from an NMT-measured RSS at peak.
- Treat `MaxRAMPercentage=90` as a bug. Measure headroom first; 60–70% is a starting point
  to revalidate, not an answer.
- CFS throttling freezes the entire cgroup — application, GC and JIT threads alike — until
  the next period. It never appears in the unified GC log as a pause, because the kernel
  scheduler, not the collector, caused it.
- Confirm the JDK version against the cluster's cgroup version before trusting detection.
  Full cgroups v2 support arrived only in JDK 15 (JDK-8230305); JDK 11–14 on a v2 host can
  fall back to host values in some scenarios.
- Collecting NMT only at boot proves nothing about a kill under load. Take the summary at
  peak.

## References

- [Reading the container](references/reading-the-container.md) — the commands that answer
  each detection question, the cgroup v1 to v2 file and field map, and the `kubectl exec`
  forms. Read before running any diagnostic inside a container, and whenever a cgroup path
  returns nothing.
- [Sizing heap and CPU limits](references/sizing-heap-and-cpu.md) — the fixed `-Xmx`
  versus `MaxRAMPercentage` decision table, the NMT headroom procedure, and the throttling
  measurement procedure. Read when choosing or changing `resources.limits`, or when
  deciding whether a latency problem is a CPU-quota problem.
