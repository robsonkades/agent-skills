---
name: numa-and-cpu-affinity
description: >
  Placing a JVM on real hardware topology: reading the NUMA topology, numactl and taskset
  pinning strategies, interpreting numastat, which collectors UseNUMA actually governs, how
  CPU sets interact with the JVM's own NUMA logic, and deciding between pinning and
  interleaving. Use when a large heap runs on a multi-socket or NPS2/NPS4 host with no
  binding at all, when a command uses numactl --cpubind, when UseNUMA is set alongside ZGC
  or Shenandoah and produced nothing, when perf is asked for a numa_miss event, when
  numastat -p is being read for hit and miss counters, when taskset confines the whole JVM
  to a couple of CPUs, or when a latency regression followed a hardware change. Does not
  cover the introductory treatment of cache lines, false sharing and local versus remote
  latency (cpu-cache-and-numa), what the JVM detects from cgroup limits
  (container-awareness), or CFS throttling and the rest of the host layer (linux-for-jvm).
---

# NUMA and CPU Affinity

## Purpose

Decide where a JVM's threads run and where its pages live, and verify the requested placement objective.
CPU affinity and memory policy are independent axes. Changing one can be useful, but the
combination determines locality; document both. The exact scope of `-XX:+UseNUMA` is
collector- and JDK-specific, so do not reduce it to a timeless "fresh allocation only" rule.

The failure this prevents is the unfalsifiable NUMA conclusion: a flag accepted in silence
by a collector that does not implement it, a `perf` event name that does not exist, or a
`numastat` mode that answers a different question — each producing a number that looks like
evidence and is not.

Inspect the deployed JDK/collector, Linux kernel, numactl/perf/profiler versions, cpusets and
hypervisor visibility first. Commands are Linux fragments, not Java code or an upgrade mandate.
Missing PMU support or permissions is missing evidence, not zero remote traffic.

## Workflow

Select the steps needed for the requested interpretation, diagnosis or placement change.
Reuse matching topology, effective-policy and outcome evidence; preserve an adequate placement.
A narrow command explanation needs no new PMU capture or host experiment. Define success from
the actual objective, such as locality, capacity or tenant isolation with accepted latency cost.
Return the supported change or no-change, evidence limits, and checks run versus pending.

1. **Inspect visible and allowed topology.** `numactl --hardware` plus allowed CPU/memory
   sets. A single visible node rules out guest-visible inter-node placement experiments,
   not CPU-affinity problems or hidden host placement. Never infer nodes from socket count.
2. **Capture the full distance matrix** with `numactl --hardware`. Firmware distances
   express relative topology cost, not measured nanoseconds or bandwidth.
3. **Identify the collector and confirm what `UseNUMA` does on it** before crediting or
   dismissing the flag. `java -XX:+PrintFlagsFinal -version | grep UseNUMA` in the target
   environment using the same collector/options — defaults can be changed by collector
   ergonomics. Prefer the running process effective flags when available.
4. **For a placement-effect claim, establish a matching baseline.** Systemic `numastat` reports kernel page
   allocation/fallback counters; `numastat -p <pid>` reports this process's page residence.
   Neither measures the JVM's remote-load ratio. Add CPU placement, supported PMU evidence,
   and outcomes relevant to the objective. Reuse adequate measurements; unavailable PMU data
   limits access-locality claims rather than invalidating independent placement or outcome evidence.
5. **Choose a placement strategy** from the heap-versus-node-size decision, in
   `references/placement-decisions.md`. Record both axes; a deliberate one-axis experiment is valid.
6. **Change one variable at a time.** Do not combine `UseNUMA`, `--interleave` and a heap
   resize in the same deploy.
7. **Validate the claimed mechanism and objective.** Check the predicted placement/access
   behavior and the declared outcome, uncertainty and accepted cost. An isolation policy need
   not improve this JVM's peak throughput, and a supported no-change needs no forced movement.
   A global allocator counter moving alone cannot validate a JVM-local NUMA change.

## Rules

- numactl 2.0.19 accepts the deprecated `--cpubind` option. Prefer explicit `--cpunodebind`
  for node IDs or `--physcpubind` for CPU IDs; check the installed version rather than
  declaring the old spelling nonexistent.
- Evaluate CPU and memory policies together, but one-sided changes can be deliberate:
  interleaving memory while CPUs roam, or binding CPUs while allowing memory fallback. For
  strict single-node confinement, `--cpunodebind=0 --membind=0` is the pair; it also creates
  an allocation-failure risk when node 0 cannot satisfy demand.
- `UseNUMA` is collector/build-specific. Linux ZGC in JDK 25 consumes this flag and its
  initialization enables it by default when not explicitly configured (subject to later
  platform/topology checks). Parallel/G1 behavior is different; verify effective settings.
- `numa_miss` names a kernel allocation counter, not a portable perf remote-access event.
  Generic aliases such as `node-loads`, `node-load-misses`, `node-stores` and
  `node-store-misses` require matching PMU/kernel support and semantic checks. An alias in
  a listing alone does not establish a JVM remote-load ratio. Missing support is not zero misses.
- `numastat` without `-p` gives system-wide kernel page-allocation counters such as
  `numa_hit`/`numa_miss`/`numa_foreign`; these are not hardware remote-access counts and are
  not process-specific. `numastat -p <pid>` gives page residence by node and no hit/miss
  counters. Neither supports a universal 20–30% "remote heap" threshold.
- async-profiler can sample supported Linux perf/PMU events; a portable built-in NUMA ratio
  should not be assumed. Hardware watchpoints target accesses to addresses and do not alone
  prove false sharing or remote memory access. Validate event semantics and attribution.
- Binding a whole JVM to few CPUs is sometimes the intended tenancy/isolation policy. The
  required set is determined by measured runnable demand, GC/JIT pause goals and quota — not
  by summing thread counts, because threads time-share and are not all runnable together.
  Use `ActiveProcessorCount` when affinity/container detection does not yield the ergonomics
  you intend, then validate GC and compiler parallelism.
- An unbound JVM can inherit task memory policy or have mapping/collector-specific allocation
  policy. VMA policy does not survive exec. Under default local allocation, first physical page
  allocation commonly follows the touching CPU; this is not permanent Java-object ownership.
  Fallback, GC movement and automatic NUMA balancing can alter locality. Record the effective
  baseline instead of assuming unbound placement is automatically best or worst.
- The G1 `-Xlog:gc+init=debug` example reports worker counts and NUMA support; labels and
  coverage vary by collector/build. It is not a per-thread placement history. Read supported
  per-thread OS placement evidence and map CPUs to nodes; stat field 39 is only the last
  executed CPU, not affinity.
- Budget the whole node-local footprint, not just heap, before strict membind. Exhaustion
  can cause Java/native allocation failure or an OOM kill depending on the path and policy;
  monitor these along with reclaim, headroom and latency.
- Export page residence, CPU placement, node bandwidth/PMU signals where supported, and SLO
  outcomes. Do not label the systemic allocator miss ratio as remote heap access.

## References

- [numactl, numastat and perf](references/numactl-and-numastat.md) — the corrected flag
  table by axis, the two `numastat` modes side by side, candidate PMU event names, and the
  recipe for mapping GC threads to nodes. Read before running any NUMA diagnostic, and
  whenever a command returned nothing or an unrecognised event.
- [Placement decisions](references/placement-decisions.md) — the pin-versus-interleave
  decision matrix, `UseNUMA` support per collector, NUMA by deploy architecture, and the
  before/after validation checklist. Read when choosing a placement strategy or validating
  a change.
