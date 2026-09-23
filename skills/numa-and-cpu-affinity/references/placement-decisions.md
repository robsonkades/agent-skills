# Placement decisions

## Does `UseNUMA` do anything on this collector?

| Collector       | Effect                                         | Mechanism                                                                                                     |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Parallel GC** | Collector-local NUMA allocation                | Young-generation Eden allocation can use per-node areas; verify target settings and constraints               |
| **G1**          | Yes, since JDK 14 (JEP 345, Linux only)        | Regions used for young allocation get preferred nodes; this is awareness, not hard physical partitioning      |
| **Serial**      | Inspect common OS allocation policy            | Single-threaded collection does not prove no effect: Linux shared NUMA initialization can enable interleaving |
| **ZGC**         | Yes on Linux JDK 25; inspect effective support | ZNUMA consumes UseNUMA; ZArguments enables its default when unset, subject to platform checks                 |
| **Shenandoah**  | Defaults UseNUMA on in JDK 25 initialization   | Enables NUMA-aware storage allocation; this is not G1/Parallel-style collector-local placement                |

Defaults depend on collector initialization and OS/topology. In JDK 25 ZArguments sets
UseNUMA to true when still default and ZFakeNUMA is not configured; subsequent platform checks
can disable it. Inspect the running JVM or reproduce its full options, not an unrelated
`java -version` using a different collector.

JDK 25 ShenandoahArguments explicitly enables the default for storage allocation while noting
that the collector is not itself NUMA-aware. The common Linux initialization can enable
`UseNUMAInterleaving` for allocations without a collector-specific policy when `UseNUMA`
remains enabled; the common commit path consumes that setting. Inspect both flags and
effective topology/masks rather than inferring no effect from Serial's thread count.

Sources: [ZArguments JDK 25](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zArguments.cpp)
and [Linux ZNUMA](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/gc/z/zNUMA_linux.cpp),
[ShenandoahArguments](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shenandoah/shenandoahArguments.cpp),
and [shared Linux NUMA initialization/commit](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/os_linux.cpp).
For the collector-local distinction, see [Parallel young-generation allocation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/parallel/psYoungGen.cpp)
and [JEP 345's delivered G1 design](https://openjdk.org/jeps/345); inspect the deployed build for exact behavior.

## What `UseNUMA` does not fix

It primarily changes allocation placement for supported collectors; do not assume it fixes:

- **Object lifetime movement** — collector evacuation/relocation semantics vary by collector
  and JDK and can change the original locality.
- **Migrating threads** — automatic NUMA balancing can use observed memory accesses, but it does not
  guarantee locality for Java object ownership; a thread can become remote after migration.
- **GC worker scheduling** — workers are still Linux tasks unless the collector implements
  additional NUMA-aware work placement.

This does not imply one mandatory production combination. Select relevant alternatives from
unbound effective policy, collector NUMA support, CPU-node binding, preferred/fallback memory,
interleave and one JVM per node. Compare them under matching conditions only when the decision
needs new evidence; an adequate existing placement can remain unchanged.

## Strategy matrix

| Situation                                                    | Strategy                                                                     | Trade-off                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Whole local footprint fits with headroom                     | `--cpunodebind=N --membind=N`                                                | Candidate for locality; node pressure and lost CPU/memory capacity may dominate                     |
| Heap larger than a node, collector supports `UseNUMA`        | `-XX:+UseNUMA`, no restrictive `numactl`                                     | Partial locality; threads still migrate between nodes without CPU affinity                          |
| Heap larger than a node, collector support is absent/unclear | Compare interleave, preferred fallback and unbound effective policy          | Interleave spreads allocation with fallback; locality and overall capacity still require validation |
| Application tolerates multiple instances                     | One JVM per node, each `--cpunodebind=N --membind=N`, behind a load balancer | Potential locality; duplicated caches, load skew and operational cost of N processes                |

Working order of questions: how many nodes → does heap plus native/runtime headroom fit on allowed nodes → does
the collector implement `UseNUMA` → does the application tolerate multiple instances.

## Topology by deployment context

| Context                         | What can change the visible topology                   | Evidence to inspect                                          |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Bare-metal x86 or Arm host      | CPU model, firmware partitioning, memory configuration | Reported node IDs, CPU membership, memory and distances      |
| Cloud instance or virtual guest | Instance shape and hypervisor exposure                 | Guest-visible topology plus provider/host evidence if needed |
| Container or restricted process | Allowed CPU and memory-node masks                      | Process masks and effective cpusets alongside host topology  |
| Non-Linux target                | OS topology APIs and JVM implementation                | Platform-native evidence; these Linux commands do not apply  |

Socket count, processor family and a “unified memory” label do not establish the target's
allowed placement topology. For example, EPYC firmware can partition a socket into multiple
nodes, as documented in the [EPYC 9004 BIOS guide, section 2.12](https://docs.amd.com/api/khub/documents/goX~9ubv8i5r60A_Qrp3Rw/content).
Inspect the actual model/configuration; do not assume a cloud family is single-node or
exclude a deployment because of its hardware brand. One visible node still leaves affinity
and hidden host-placement questions; firmware distance values are not measured latency.

## Sizing the CPU set

Thread counts are not additive CPU requirements. Size from runnable demand and interference:
measure application CPU saturation, run-queue delay, GC worker utilization/pause time, JIT
activity and sibling/SMT topology. `--cpunodebind` chooses node CPUs;
`--physcpubind`/`taskset` can constrain the whole process or selected threads. When the JVM's
detected processor count differs from the intended capacity, set `ActiveProcessorCount`
explicitly and revalidate ergonomics.

`ActiveProcessorCount` changes the JVM's ergonomic processor count; it does not itself bind
threads or pages. Verify OS placement separately from JVM worker sizing.

See the [JDK 25 java launcher specification](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#advanced-runtime-options)
for the processor-count override; confirm behavior on the deployed build.

## Launch placement versus live changes

For an existing JVM, `taskset -p <mask> <pid>` changes the named task's affinity, not every
thread's mask. Use `-a` when all current threads are intended targets, then verify per-thread
masks, including threads created during the change. A successful affinity update does not
establish memory placement. See the [taskset options](https://github.com/util-linux/util-linux/blob/v2.40.2/schedutils/taskset.1.adoc).

A task memory-policy change applies to later allocations lacking a more-specific policy, for
the calling thread and threads it subsequently creates; existing siblings retain their task
policies. Neither that change nor CPU affinity directly migrates already faulted pages.
A launch policy set before pages
are faulted therefore differs from retargeting a JVM with a resident heap. If existing pages
must move, evaluate a restart under the chosen policy or an explicit supported page-migration
mechanism separately, accounting for disruption and rechecking residence and outcomes. Do not
infer migration from the requested policy alone; see [Linux memory-policy scope](https://github.com/torvalds/linux/blob/v6.10/Documentation/admin-guide/mm/numa_memory_policy.rst).

## Validation checklist

Select checks that can resolve the requested claim and reuse matching evidence. A narrow
interpretation or adequate no-change decision does not require this entire campaign. Choose
outcome gates from the actual locality/capacity/isolation objective and accepted costs.

Before investigating:

- [ ] `numactl --hardware` run — node count confirmed, not inferred from sockets
- [ ] Distance matrix captured
- [ ] Collector identified and its `UseNUMA` support confirmed against the table above
- [ ] `PrintFlagsFinal | grep UseNUMA` run in the target environment, not assumed

While observing:

- [ ] Systemic `numastat` collected as allocator/host-pressure context, not remote accesses
- [ ] `numastat -p <pid>` collected for process residence; heap mappings identified separately
- [ ] Relevant supported PMU events and access checked when the claim needs them; full
      output/status retained, unsupported or denied capture recorded as missing evidence
- [ ] Hardware, code, workload and placement changes separated as competing explanations

While measuring:

- [ ] Both CPU and memory policies recorded; hold CPU placement constant for a controlled
      local-versus-remote experiment, or explicitly test roaming as its own scenario
- [ ] The local-versus-remote comparison isolates the memory variable with CPU held constant
- [ ] An analytical prediction (expected order of magnitude) recorded before the run
- [ ] One variable changed per deploy — never `UseNUMA` plus `interleave` plus a heap resize

While validating:

- [ ] Claimed placement/access behavior observed and declared objective/cost bounds met;
      an isolation goal need not improve this JVM's throughput
- [ ] No allocation failure, OOM kill or excessive reclaim introduced by restrictive membind
- [ ] Justified change or no-change documented; a change includes the matching baseline
