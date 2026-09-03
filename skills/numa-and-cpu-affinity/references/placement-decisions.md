# Placement decisions

## Does `UseNUMA` do anything on this collector?

| Collector       | Effect                                                                   | Mechanism                                                                                                         |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Parallel GC** | Yes — the original, most mature implementation                           | TLABs allocated on the requesting thread's local node; young gen split per node                                   |
| **G1**          | Yes, since JDK 14 (JEP 345, Linux only)                                  | Regions used for young allocation get preferred nodes; this is awareness, not hard physical partitioning          |
| **Serial**      | Accepted, no effect                                                      | Single-threaded; no parallelism to distribute                                                                     |
| **ZGC**         | Accepted, but not the mechanism governing the collector's NUMA behaviour | ZGC has its own internal handling not exposed through this flag                                                   |
| **Shenandoah**  | Accepted                                                                 | Exact JDK 25 behaviour unconfirmed — do not presume parity with G1; check `PrintFlagsFinal` and the release notes |

The flag's default is `false`. The JVM does not enable NUMA awareness automatically even on
detected NUMA hardware.

## What `UseNUMA` does not fix

It primarily changes allocation placement for supported collectors; do not assume it fixes:

- **Object lifetime movement** — collector evacuation/relocation semantics vary by collector
  and JDK and can change the original locality.
- **Migrating threads** — the Linux scheduler knows nothing about Java heap locality, so a
  thread that was local at allocation time can be remote minutes later.
- **GC worker scheduling** — workers are still Linux tasks unless the collector implements
  additional NUMA-aware work placement.

This does not imply one mandatory production combination. Compare unbound first-touch,
collector NUMA support, CPU-node binding, preferred/fallback memory, interleave, and one JVM
per node under the same workload.

## Strategy matrix

| Situation                                                    | Strategy                                                                     | Trade-off                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Heap fits in one node                                        | `--cpunodebind=N --membind=N`                                                | Maximum locality; wastes the other nodes' cores and memory if only one JVM runs |
| Heap larger than a node, collector supports `UseNUMA`        | `-XX:+UseNUMA`, no restrictive `numactl`                                     | Partial locality; threads still migrate between nodes without CPU affinity      |
| Heap larger than a node, collector support is absent/unclear | Compare interleave, preferred fallback and unbound first-touch               | Interleave avoids one-node exhaustion but deliberately sacrifices some locality |
| Application tolerates multiple instances                     | One JVM per node, each `--cpunodebind=N --membind=N`, behind a load balancer | Highest achievable locality; operational cost of N processes instead of one     |

Working order of questions: how many nodes → does the required heap fit in one node → does
the collector implement `UseNUMA` → does the application tolerate multiple instances.

## NUMA by deploy architecture

| Platform                                        | Typically NUMA?     | How to confirm                                  |
| ----------------------------------------------- | ------------------- | ----------------------------------------------- |
| Xeon, 2+ sockets (on-prem, bare-metal cloud)    | Yes                 | `numactl --hardware`                            |
| AMD EPYC (even one socket, under NPS2/NPS4)     | Depends on the BIOS | `numactl --hardware` — never infer from sockets |
| AWS Graviton, Ampere Altra (standard instances) | Typically not       | `numactl --hardware` → `available: 1 nodes`     |
| Apple Silicon                                   | No (unified memory) | Not a server deploy target                      |

Intel Xeon uses QPI or UPI interconnect and typically maps one socket to one node. AMD EPYC
uses Infinity Fabric both between sockets and between chiplets inside one socket; the BIOS
NPS setting presents the socket as 1, 2 or 4 logical nodes.

## Sizing the CPU set

Thread counts are not additive CPU requirements. Size from runnable demand and interference:
measure application CPU saturation, run-queue delay, GC worker utilization/pause time, JIT
activity and sibling/SMT topology. `--cpunodebind` chooses node CPUs;
`--physcpubind`/`taskset` can constrain the whole process or selected threads. When the JVM's
detected processor count differs from the intended capacity, set `ActiveProcessorCount`
explicitly and revalidate ergonomics.

## Validation checklist

Before investigating:

- [ ] `numactl --hardware` run — node count confirmed, not inferred from sockets
- [ ] Distance matrix captured
- [ ] Collector identified and its `UseNUMA` support confirmed against the table above
- [ ] `PrintFlagsFinal | grep UseNUMA` run in the target environment, not assumed

While observing:

- [ ] Systemic `numastat` collected as allocator/host-pressure context, not remote accesses
- [ ] `numastat -p <pid>` collected for the process's heap distribution
- [ ] `perf stat -e node-loads,node-load-misses,node-stores,node-store-misses -p <pid>` run —
      not `-e numa_miss`
- [ ] Regression correlated with a **hardware** change, not only a code or load change

While measuring:

- [ ] CPU affinity fixed before measuring anything about memory affinity — both axes, never
      one alone
- [ ] The local-versus-remote comparison isolates the memory variable with CPU held constant
- [ ] An analytical prediction (expected order of magnitude) recorded before the run
- [ ] One variable changed per deploy — never `UseNUMA` plus `interleave` plus a heap resize

While validating:

- [ ] Predicted placement/access evidence changed **and** business metrics improved
- [ ] No `OutOfMemoryError` introduced by a `--membind` too tight for the configured heap
- [ ] Change documented as a single variable with a before/after baseline
