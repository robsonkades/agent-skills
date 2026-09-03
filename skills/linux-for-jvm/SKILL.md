---
name: linux-for-jvm
description: >
  The Linux side of a JVM incident: RSS versus virtual memory, page faults and swap,
  AlwaysPreTouch, transparent huge pages, cgroup CPU throttling, the two OOM killers,
  file-descriptor and process limits, signals and graceful shutdown, and PSI as a direct
  stall signal. Use when a process dies with exit code 137 or no log at all, when a GC
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

1. **On "it died with no log", check the container/runtime status and exit code first.**
   137 conventionally means termination by `SIGKILL`; it does **not** distinguish cgroup OOM,
   global OOM, kubelet/runtime action, administrator action, or a wrapper that remapped a
   status.
2. **Classify with independent records**: cgroup v2 `memory.events`, pod termination reason,
   runtime/kubelet events, and kernel journal where permitted. `dmesg` can be inaccessible,
   rate-limited or already rotated.
3. **Measure the non-heap footprint with NMT under real load** before adjusting any size.
4. **Correlate the logged GC pause with the observed pause** and attribute the difference
   to a specific layer — TTSP, throttling, swap or I/O.
5. **Check throttling with deltas**: periods throttled says frequency;
   `throttled_usec / elapsed_usec` says denied CPU time. Correlate both with runnable demand,
   quota/period and latency; a lifetime ratio alone is not diagnosis.
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
- Swap can make JVM latency highly variable, but "incompatible" is too strong. Decide from
  the availability goal: no swap favors predictable latency but increases kill risk;
  bounded swap may preserve availability during transient pressure at a tail-latency cost.
  Monitor swap-in/out, `VmSwap`, faults, reclaim and PSI rather than prescribing one global
  `swappiness` value.
- A major fault's cost depends on page source, device, queueing, reclaim and filesystem. Use
  fault deltas correlated with wall-clock stalls or block-I/O evidence; hardware-class
  latency ranges are not a substitute for measurement.
- THP is a policy matrix, not a binary slogan. `always` can invoke direct reclaim/compaction;
  `madvise`, `defer`, `defer+madvise` and `never` make different latency/memory trade-offs,
  and modern kernels can expose multiple THP sizes. Verify kernel and JDK behaviour, measure
  `AnonHugePages`, TLB/CPU benefit and compaction stalls, then record the chosen policy.
- Distinguish global OOM from memory-cgroup OOM by evidence. Victim selection can incorporate
  `oom_score_adj` within applicable constraints; it is not a protection against exceeding a
  pod's `memory.max`. Kubernetes QoS influences scores, while container memory budgeting and
  `memory.events` identify the resource failure that must be fixed.
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
- Linux began transitioning the fair scheduler toward EEVDF in 6.6. Do not apply CFS tuning
  knobs from a runbook without checking the node kernel, scheduler documentation and whether
  the knob exists; `vruntime`, eligibility and virtual deadlines are related but not
  interchangeable models.
- PSI (`/proc/pressure/*`, and cgroup-local `*.pressure` on cgroup v2) measures shares of time
  with some or all non-idle tasks stalled. It is a valuable saturation signal, not
  automatically the earliest one; baseline `some`/`full` deltas against SLO symptoms.

## References

- [Incident commands](references/incident-commands.md) — what to run, in order, for an OOM
  kill, a throttling suspicion, a descriptor exhaustion or an unexplained pause. Read during
  an incident.
- [Host and container configuration](references/host-configuration.md) — the pre-deploy
  checklist, THP modes, swap, limits, signals and the alerting set. Read before deploying or
  when reviewing a host or pod spec.
