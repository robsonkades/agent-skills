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
CPU affinity and memory affinity are independent axes: binding one without the other
isolates nothing, and the JVM's own `-XX:+UseNUMA` covers only fresh allocation — not
promoted objects, not migrating threads, not GC workers.

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
4. **Take a baseline on both `numastat` modes plus latency and GC pause percentiles.**
   Systemic `numastat` for the hit/miss ratio, `numastat -p <pid>` for this process's heap
   distribution across nodes. They are not interchangeable.
5. **Choose a placement strategy** from the heap-versus-node-size decision, in
   `references/placement-decisions.md`. Set both axes together, or neither.
6. **Change one variable at a time.** Do not combine `UseNUMA`, `--interleave` and a heap
   resize in the same deploy.
7. **Re-measure and require both signals.** The miss ratio must fall _and_ the business
   metric — latency, GC pause p99 — must fall with it. A ratio that improves alone means
   NUMA was not the dominant bottleneck.

## Rules

- `--cpubind` does not exist in `numactl`. The CPU-axis flag is `--cpunodebind` (`-N`) for
  whole nodes, `--physcpubind` (`-C`) for specific CPUs. The failure is noisy — unless a
  script swallows it with `|| true`, in which case the JVM starts unbound and nobody
  notices.
- Never set a memory policy without a CPU policy, or the reverse. `numactl
--cpunodebind=0 --membind=0` is the confining pair.
- `-XX:+UseNUMA` is implemented by Parallel GC and by G1 (since JDK 14, JEP 345, Linux
  only). Serial accepts it with no effect. On ZGC and Shenandoah it is accepted silently
  and does not govern the collector's NUMA behaviour. Setting `-XX:+UseZGC -XX:+UseNUMA`
  produces no error, no warning and no effect.
- `numa_miss` is not a `perf` event. The valid PMU events are `node-loads`,
  `node-load-misses`, `node-stores`, `node-store-misses` — and their availability varies by
  SoC, so check `perf list | grep node` first. A missing event is not zero misses.
- `numastat` without `-p` gives kernel `numa_hit`/`numa_miss`/`numa_foreign` counters per
  node. `numastat -p <pid>` gives one process's memory distribution across nodes and
  produces no hit/miss counters at all. Sustained miss ratio above roughly 20–30% is strong
  evidence of a heap with no affinity.
- async-profiler has no NUMA event. `mem:<address>` is a hardware watchpoint on a specific
  address, used for false sharing, not a NUMA facility. Attribute node misses to methods
  with `perf record -e node-load-misses -g` and correlate against an allocation profile
  over the same window.
- Never `taskset` the whole JVM onto a handful of CPUs. Available CPUs must cover GC
  threads plus JIT threads plus concurrently active application threads; otherwise GC
  pauses get longer, not shorter. `--cpunodebind` restricts to a whole node;
  `--physcpubind`/`taskset -c` on a few CPUs is for fine isolation of a critical thread,
  not for the process.
- A large heap on a multi-node host with neither `UseNUMA` nor `numactl` is the worst case,
  not the neutral one: first-touch scatters pages with no relation to the later access
  pattern — neither localised nor evenly interleaved.
- `-Xlog:gc+init=debug` reports how many GC workers exist and whether NUMA support is on.
  It never reports which node a worker is on; no unified-logging tag does. Read
  `/proc/<pid>/task/*/stat` field 39 and cross it with `numactl --hardware`.
- Watch for the `--membind` regression: a bind too restrictive for the configured heap
  produces `OutOfMemoryError`. Monitor failed allocation, not only latency.
- Export the systemic miss ratio continuously. A heap that starts well distributed degrades
  over days as GC promotes and threads migrate, and the drift is invisible until it becomes
  a latency regression.

## References

- [numactl, numastat and perf](references/numactl-and-numastat.md) — the corrected flag
  table by axis, the two `numastat` modes side by side, valid PMU event names, and the
  recipe for mapping GC threads to nodes. Read before running any NUMA diagnostic, and
  whenever a command returned nothing or an unrecognised event.
- [Placement decisions](references/placement-decisions.md) — the pin-versus-interleave
  decision matrix, `UseNUMA` support per collector, NUMA by deploy architecture, and the
  before/after validation checklist. Read when choosing a placement strategy or validating
  a change.
