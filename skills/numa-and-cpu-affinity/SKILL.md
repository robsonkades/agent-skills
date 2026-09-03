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

Decide where a JVM's threads run and where its pages live, and prove the decision worked.
CPU affinity and memory policy are independent axes. Changing one can be useful, but the
combination determines locality; document both. The exact scope of `-XX:+UseNUMA` is
collector- and JDK-specific, so do not reduce it to a timeless "fresh allocation only" rule.

The failure this prevents is the unfalsifiable NUMA conclusion: a flag accepted in silence
by a collector that does not implement it, a `perf` event name that does not exist, or a
`numastat` mode that answers a different question — each producing a number that looks like
evidence and is not.

## Workflow

1. **Count nodes before anything else.** `numactl --hardware`. One node means NUMA is not
   the problem and the investigation ends here. Never infer node count from socket count —
   a single AMD EPYC socket is 2 or 4 nodes under NPS2/NPS4, and most cloud aarch64
   instances are single-node.
2. **Capture the distance matrix**, which is what makes "remote" quantitative for this
   host: `numactl --hardware | grep -A3 "node distances"`.
3. **Identify the collector and confirm what `UseNUMA` does on it** before crediting or
   dismissing the flag. `java -XX:+PrintFlagsFinal -version | grep UseNUMA` in the target
   environment — the default is `false`, so verify rather than assume.
4. **Take a placement and performance baseline.** Systemic `numastat` reports kernel page
   allocation/fallback counters; `numastat -p <pid>` reports this process's page residence.
   Neither measures the JVM's remote-load ratio. Add CPU placement, supported PMU evidence,
   throughput/latency and GC percentiles.
5. **Choose a placement strategy** from the heap-versus-node-size decision, in
   `references/placement-decisions.md`. Set both axes together, or neither.
6. **Change one variable at a time.** Do not combine `UseNUMA`, `--interleave` and a heap
   resize in the same deploy.
7. **Re-measure the mechanism and outcome.** Page residence/CPU placement must move as
   predicted and the business metric must improve within experimental uncertainty. A global
   allocator counter moving alone cannot validate a JVM-local NUMA change.

## Rules

- `--cpubind` does not exist in `numactl`. The CPU-axis flag is `--cpunodebind` (`-N`) for
  whole nodes, `--physcpubind` (`-C`) for specific CPUs. The failure is noisy — unless a
  script swallows it with `|| true`, in which case the JVM starts unbound and nobody
  notices.
- Evaluate CPU and memory policies together, but one-sided changes can be deliberate:
  interleaving memory while CPUs roam, or binding CPUs while allowing memory fallback. For
  strict single-node confinement, `--cpunodebind=0 --membind=0` is the pair; it also creates
  an allocation-failure risk when node 0 cannot satisfy demand.
- `-XX:+UseNUMA` is implemented by Parallel GC and by G1 (since JDK 14, JEP 345, Linux
  only). Serial accepts it with no effect. On ZGC and Shenandoah it is accepted silently
  and does not govern the collector's NUMA behaviour. Setting `-XX:+UseZGC -XX:+UseNUMA`
  produces no error, no warning and no effect.
- `numa_miss` is not a `perf` event. The valid PMU events are `node-loads`,
  `node-load-misses`, `node-stores`, `node-store-misses` — and their availability varies by
  SoC, so check `perf list | grep node` first. A missing event is not zero misses.
- `numastat` without `-p` gives system-wide kernel page-allocation counters such as
  `numa_hit`/`numa_miss`/`numa_foreign`; these are not hardware remote-access counts and are
  not process-specific. `numastat -p <pid>` gives page residence by node and no hit/miss
  counters. Neither supports a universal 20–30% "remote heap" threshold.
- async-profiler has no NUMA event. `mem:<address>` is a hardware watchpoint on a specific
  address, used for false sharing, not a NUMA facility. Attribute node misses to methods
  with `perf record -e node-load-misses -g` and correlate against an allocation profile
  over the same window.
- Binding a whole JVM to few CPUs is sometimes the intended tenancy/isolation policy. The
  required set is determined by measured runnable demand, GC/JIT pause goals and quota — not
  by summing thread counts, because threads time-share and are not all runnable together.
  Use `ActiveProcessorCount` when affinity/container detection does not yield the ergonomics
  you intend, then validate GC and compiler parallelism.
- An unbound JVM uses Linux first-touch placement and may also be affected by automatic NUMA
  balancing. That can be good when allocating/accessing threads remain local or poor when
  they migrate. It is the neutral baseline to measure, not automatically the worst case.
- `-Xlog:gc+init=debug` reports how many GC workers exist and whether NUMA support is on.
  It never reports which node a worker is on; no unified-logging tag does. Read
  `/proc/<pid>/task/*/stat` field 39 and cross it with `numactl --hardware`.
- Watch for the `--membind` regression: a bind too restrictive for the configured heap
  produces `OutOfMemoryError`. Monitor failed allocation, not only latency.
- Export page residence, CPU placement, node bandwidth/PMU signals where supported, and SLO
  outcomes. Do not label the systemic allocator miss ratio as remote heap access.

## References

- [numactl, numastat and perf](references/numactl-and-numastat.md) — the corrected flag
  table by axis, the two `numastat` modes side by side, valid PMU event names, and the
  recipe for mapping GC threads to nodes. Read before running any NUMA diagnostic, and
  whenever a command returned nothing or an unrecognised event.
- [Placement decisions](references/placement-decisions.md) — the pin-versus-interleave
  decision matrix, `UseNUMA` support per collector, NUMA by deploy architecture, and the
  before/after validation checklist. Read when choosing a placement strategy or validating
  a change.
