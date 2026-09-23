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
addresses and allocations; the kernel controls mappings, residency and scheduling. A client
stall that overlaps GC is not by itself proof of a collector problem.

## Environment contract

Inspect the deployed JDK/collector, kernel, cgroup version and mount/cgroup namespaces,
service manager, container image and metric labels before applying commands. These are Linux
shell fragments, not Java programs; cgroup v2 examples need the target process hierarchy,
not an assumed host root. Missing permissions or files mean missing evidence, not zero.
Do not upgrade the runtime or change host-wide policy merely to use this skill.

## Workflow

Select the steps that answer the actual incident or configuration question; this is not a
mandatory host audit. Reuse adequate supplied evidence and preserve configuration that already
meets the workload's contract. For a narrow explanation, explain the relevant mechanism and
its limits without demanding unrelated captures. During recovery, fit evidence collection
within the established containment and availability deadline.

1. **On "it died with no log", check the container/runtime status and exit code first.**
   137 conventionally means termination by `SIGKILL`; it does **not** distinguish cgroup OOM,
   global OOM, kubelet/runtime action, administrator action, or a wrapper that remapped a
   status.
2. **Classify with independent records**: cgroup v2 `memory.events`, pod termination reason,
   runtime/kubelet events, and kernel journal where permitted. `dmesg` can be inaccessible,
   rate-limited or already rotated.
3. **Compare memory accounting under real load**: NMT for tracked HotSpot allocations,
   RSS/PSS for residency, and cgroup usage for charged memory. NMT committed is not RSS,
   does not cover every native allocation, and cannot be subtracted from RSS to quantify
   unexplained native bytes. Check `memory.high` reclaim throttling at the relevant cgroup
   and ancestors even below `memory.max`; zero OOM kills does not rule out memory pressure.
4. **Correlate the logged GC pause with the observed pause** and attribute the difference
   to a layer only when evidence supports it — TTSP, throttling, swap, I/O or request queueing.
   Keep unresolved causes as hypotheses; do not subtract unrelated latency percentiles.
5. **Check throttling with deltas**: periods throttled says frequency;
   `throttled_usec` accumulates throttled run-queue time and can overlap across CPUs.
   Its delta divided by elapsed microseconds is not lost CPU capacity or request stall
   percentage and can exceed 1. Correlate with demand, ancestor quotas and latency.
6. **Check descriptor and thread counts against their limits** before believing a resource
   is exhausted.

## Rules

- Page-fault counters are in `/proc/<pid>/stat` (fields 10 and 12), **not** in `status`. And
  `VmPeak` is peak _virtual_ memory — peak RSS is `VmHWM`. A grep for the wrong field
  returns empty; do not interpret missing fields or failed enumeration as zero.
- `AlwaysPreTouch` requests touching heap pages before application use. Depending on the
  collector/build and commit path, it can move first-touch work to startup or later heap
  commitment. Check initial versus maximum heap size and page policy: it does not prefault
  every process mapping, eliminate all later faults or prevent swap. Measure any latency
  benefit against startup/commit time and resident-memory/cgroup pressure before enabling it.
- Swap can make JVM latency highly variable, but "incompatible" is too strong. Decide from
  the availability goal: no swap favors predictable latency but increases kill risk;
  bounded swap may preserve availability during transient pressure at a tail-latency cost.
  Monitor swap-in/out, `VmSwap`, faults, reclaim and PSI rather than prescribing one global
  `swappiness` value.
- A major fault's cost depends on page source, device, queueing, reclaim and filesystem. Use
  fault deltas correlated with wall-clock stalls or block-I/O evidence; hardware-class
  latency ranges are not a substitute for measurement.
- THP separates allocation eligibility (`enabled`) from reclaim/compaction policy (`defrag`).
  Defrag modes such as `always`, `madvise`, `defer`, `defer+madvise` and `never` have different
  latency/memory trade-offs. On kernels with per-size controls, only `inherit` follows the
  top-level `enabled` value; inspect explicit overrides before declaring THP disabled. Verify
  kernel and JDK behaviour, measure `AnonHugePages`, TLB/CPU benefit and compaction stalls,
  then record the chosen policy.
- Distinguish global OOM from memory-cgroup OOM by evidence. Victim selection can incorporate
  `oom_score_adj` within applicable constraints; it is not a protection against exceeding a
  container's or ancestor's `memory.max`. Kubernetes QoS influences scores; correlate
  `memory.events` with limit scope and kernel/runtime records to identify the failure.
- Default to the supervisor's bounded graceful stop, normally `SIGTERM` followed by escalation
  if needed. An established containment or recovery contract can require immediate forced
  termination, for example when continued execution violates a data-integrity invariant;
  verify the target identity and do not let optional capture or an extra grace wait defeat
  that deadline. `SIGKILL` cannot be intercepted: no shutdown hooks, connection drain or final
  dump-on-exit. Previously completed JFR chunks/dumps may survive, while buffered events and
  the active chunk can be lost. Budget `terminationGracePeriodSeconds` for the actual drain.
- Inspect the actual launcher limits. For systemd services, persist `LimitNOFILE` and use
  `TasksMax` for service task limits; `LimitNPROC` applies across the real UID and has privileged
  exemptions. Shell limits affect descendants, not an independently started systemd unit.
  Native-thread OOME needs PID/task, stack and memory evidence; heap retention can still
  explain unbounded thread creation.
- Alert on OOM kills explicitly (`node_vmstat_oom_kill`, and the pod-level
  `OOMKilled` reason), with host and container attribution. Application logs can contain
  useful precursors even when they contain no final termination record.
- NUMA behavior is collector/build-specific. Parallel GC and G1 are not the only users:
  Linux ZGC in JDK 25 consumes `UseNUMA`. Check effective flags and allocation policy rather
  than treating an accepted flag as proof of an optimization; detailed placement belongs to
  `cpu-cache-and-numa`.
- Linux began transitioning the fair scheduler toward EEVDF in 6.6. Do not apply CFS tuning
  knobs from a runbook without checking the node kernel, scheduler documentation and whether
  the knob exists; `vruntime`, eligibility and virtual deadlines are related but not
  interchangeable models.
- PSI (`/proc/pressure/*`, and cgroup-local `*.pressure` on cgroup v2) measures shares of time
  with some or all non-idle tasks stalled. It is a valuable saturation signal, not
  automatically the earliest one. `avg10/60/300` are percentages; `total` is cumulative
  microseconds. System-level CPU `full` is undefined and reported as zero for compatibility;
  do not interpret it as no CPU pressure. Compare the same scope and interval with symptoms.

## Output

Return scoped, timestamped observations, supported hypotheses, the smallest justified action,
and how to verify it. Report unavailable evidence and unresolved attribution explicitly.
An explanation or an evidence-backed no-change conclusion can complete the task; distinguish
checks actually run from proposed verification on the target host.

## References

- [Incident commands](references/incident-commands.md) — what to run, in order, for an OOM
  kill, a throttling suspicion, a descriptor exhaustion or an unexplained pause. Read during
  an incident.
- [Host and container configuration](references/host-configuration.md) — the pre-deploy
  checklist, THP modes, swap, limits, signals and the alerting set. Read before deploying or
  when reviewing a host or pod spec.
