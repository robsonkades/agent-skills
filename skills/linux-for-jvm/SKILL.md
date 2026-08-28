---
name: linux-for-jvm
description: >
  The Linux side of a JVM incident: RSS versus virtual memory, page faults and swap,
  AlwaysPreTouch, transparent huge pages, cgroup CPU throttling, the two OOM killers,
  file-descriptor and process limits, signals and graceful shutdown, and PSI as the earliest
  saturation signal. Use when a process dies with exit code 137 or no log at all, when a GC
  pause in the log does not match the pause the client felt, when "too many open files" or
  "unable to create native thread" appears, when THP or swappiness is being changed by
  reflex, when kill -9 is the first response, or when container CPU limits may be throttling
  the JVM. Does not cover the JVM-side memory budget (jvm-memory-regions), collector
  behaviour (gc-fundamentals), or CPU cache and NUMA topology (cpu-cache-and-numa). What the
  JVM detects inside a cgroup is container-awareness, kernel-side tracing is ebpf-for-jvm,
  and the network stack is tcp-tuning.
---

# Linux for the JVM

## Purpose

Separate what the JVM manages from what the kernel manages. The JVM administers virtual
addresses; the kernel administers physical RAM — and the misalignment between the two
produces most of the incidents that arrive labelled "a GC problem".

## Workflow

1. **On "it died with no log", check the exit code first.** 137 means `SIGKILL`, and by
   construction no application log will exist. Searching them is time spent on a cause that
   cannot be there.
2. **Confirm with the kernel's own record**: `dmesg -T | grep -i "killed process"` and the
   cgroup's `memory.events`.
3. **Measure the non-heap footprint with NMT under real load** before adjusting any size.
4. **Correlate the logged GC pause with the observed pause** and attribute the difference
   to a specific layer — TTSP, throttling, swap or I/O.
5. **Check throttling**: `nr_throttled / nr_periods` against baseline. It inflates GC
   pauses while leaving no trace in the GC log.
6. **Check descriptor and thread counts against their limits** before believing a resource
   is exhausted.

## Rules

- Page-fault counters are in `/proc/<pid>/stat` (fields 10 and 12), **not** in `status`. And
  `VmPeak` is peak _virtual_ memory — peak RSS is `VmHWM`. A grep for the wrong field
  returns empty, and empty reads as zero.
- `AlwaysPreTouch` pre-empts **minor** faults; it does not protect against swap. A
  pre-touched page is swapped out normally under memory pressure and the major fault happens
  just the same. The benefit is predictability — cost concentrated at startup instead of
  diffused through operation.
- Swap and a tracing collector are incompatible by construction: the kernel's cold-page
  heuristic is systematically wrong about a collector that walks the heap periodically. Use
  `vm.swappiness=1` or no swap, and monitor `VmSwap`.
- A major fault costs what the medium costs: ~50–200 µs on NVMe, ~5–10 ms on a spinning
  disk. Using the rotational-era number to estimate on NVMe leads to discarding the right
  hypothesis.
- "Disable THP" is dated advice. The classic problem is `defrag=always` (synchronous
  compaction), not huge pages. For large heaps prefer `enabled=madvise` + `defrag=madvise`
  - `-XX:+UseTransparentHugePages`; `never` remains defensible for ultra-low latency, as a
    **measured** decision rather than a 2014 checklist item.
- There are **two** OOM killers with different fixes. The global one responds to
  `oom_score_adj`; the cgroup one — which is what `OOMKilled` in Kubernetes means — does
  not. In Kubernetes the kubelet already sets `oom_score_adj` from the QoS class.
- Never `kill -9` first. `SIGKILL` cannot be intercepted: no shutdown hooks, no connection
  drain, no heap dump, and a truncated JFR file. Send `SIGTERM`, wait, then escalate — and
  make `terminationGracePeriodSeconds` match the real drain time.
- Persist `LimitNOFILE` and `LimitNPROC` in the systemd unit. `ulimit` in a shell does not
  survive the next start. And note that `OutOfMemoryError: unable to create native thread`
  misleads by its name — a heap dump does not help, because the problem is not in the heap.
- Alert on OOM kills explicitly (`node_vmstat_oom_kill`, and the pod-level
  `OOMKilled` reason). Without it the incident arrives as "the service went down for no
  reason" and consumes hours of log analysis that by definition contains nothing.
- `-XX:+UseNUMA` is implemented only by Parallel GC and G1 (JEP 345, JDK 14, Linux). With
  ZGC or Shenandoah it is accepted and does not do what is expected.
- The CFS scheduler was replaced by EEVDF in kernel 6.6. The `vruntime` model is still
  useful; the latency sysctls are not.
- PSI (`/proc/pressure/*`) is the earliest signal available and the least used: it measures
  time stalled on memory, CPU or I/O directly.

## References

- [Incident commands](references/incident-commands.md) — what to run, in order, for an OOM
  kill, a throttling suspicion, a descriptor exhaustion or an unexplained pause. Read during
  an incident.
- [Host and container configuration](references/host-configuration.md) — the pre-deploy
  checklist, THP modes, swap, limits, signals and the alerting set. Read before deploying or
  when reviewing a host or pod spec.
