# Placement decisions

## Does `UseNUMA` do anything on this collector?

| Collector       | Effect                                         | Mechanism                                                                                                         |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Parallel GC** | Yes — the original, most mature implementation | TLABs allocated on the requesting thread's local node; young gen split per node                                   |
| **G1**          | Yes, since JDK 14 (JEP 345, Linux only)        | Regions used for young allocation get preferred nodes; this is awareness, not hard physical partitioning          |
| **Serial**      | Accepted, no effect                            | Single-threaded; no parallelism to distribute                                                                     |
| **ZGC**         | Yes on Linux JDK 25; inspect effective support | ZNUMA consumes UseNUMA; ZArguments enables its default when unset, subject to platform checks                     |
| **Shenandoah**  | Accepted                                       | Exact JDK 25 behaviour unconfirmed — do not presume parity with G1; check `PrintFlagsFinal` and the release notes |

Defaults depend on collector initialization and OS/topology. In JDK 25 ZArguments sets
UseNUMA to true when still default and ZFakeNUMA is not configured; subsequent platform checks
can disable it. Inspect the running JVM or reproduce its full options, not an unrelated
`java -version` using a different collector.

Sources: [ZArguments JDK 25](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zArguments.cpp)
and [Linux ZNUMA](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/gc/z/zNUMA_linux.cpp).

## What `UseNUMA` does not fix

It primarily changes allocation placement for supported collectors; do not assume it fixes:

- **Object lifetime movement** — collector evacuation/relocation semantics vary by collector
  and JDK and can change the original locality.
- **Migrating threads** — automatic NUMA balancing can use observed memory accesses, but it does not
  guarantee locality for Java object ownership; a thread can become remote after migration.
- **GC worker scheduling** — workers are still Linux tasks unless the collector implements
  additional NUMA-aware work placement.

This does not imply one mandatory production combination. Compare unbound first-touch,
collector NUMA support, CPU-node binding, preferred/fallback memory, interleave, and one JVM
per node under the same workload.

## Strategy matrix

| Situation                                                    | Strategy                                                                     | Trade-off                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Whole local footprint fits with headroom                     | `--cpunodebind=N --membind=N`                                                | Candidate for locality; node pressure and lost CPU/memory capacity may dominate                     |
| Heap larger than a node, collector supports `UseNUMA`        | `-XX:+UseNUMA`, no restrictive `numactl`                                     | Partial locality; threads still migrate between nodes without CPU affinity                          |
| Heap larger than a node, collector support is absent/unclear | Compare interleave, preferred fallback and unbound first-touch               | Interleave spreads allocation with fallback; locality and overall capacity still require validation |
| Application tolerates multiple instances                     | One JVM per node, each `--cpunodebind=N --membind=N`, behind a load balancer | Potential locality; duplicated caches, load skew and operational cost of N processes                |

Working order of questions: how many nodes → does heap plus native/runtime headroom fit on allowed nodes → does
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
- [ ] `numastat -p <pid>` collected for process residence; heap mappings identified separately
- [ ] `perf stat -e node-loads,node-load-misses,node-stores,node-store-misses -p <pid>` run —
      not `-e numa_miss`
- [ ] Hardware, code, workload and placement changes separated as competing explanations

While measuring:

- [ ] Both CPU and memory policies recorded; hold CPU placement constant for a controlled
      local-versus-remote experiment, or explicitly test roaming as its own scenario
- [ ] The local-versus-remote comparison isolates the memory variable with CPU held constant
- [ ] An analytical prediction (expected order of magnitude) recorded before the run
- [ ] One variable changed per deploy — never `UseNUMA` plus `interleave` plus a heap resize

While validating:

- [ ] Predicted placement/access evidence changed **and** business metrics improved
- [ ] No allocation failure, OOM kill or excessive reclaim introduced by restrictive membind
- [ ] Change documented as a single variable with a before/after baseline
