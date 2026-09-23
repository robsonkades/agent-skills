# NUMA

## Verify the topology first

```bash
numactl --hardware        # topology visible to this Linux environment
```

Also inspect allowed CPUs/memory nodes and the effective JVM flags/startup logs. One visible
node provides no guest-level cross-node placement choice, though host placement can still matter.
JDK 25 HotSpot on Linux disables NUMA support when only one node is available or the process is
bound to one memory node; do not infer TLAB fragmentation merely from a requested flag.

## The costs involved

Remote access can add latency and consume interconnect bandwidth, but the magnitude depends
on this machine's distance matrix, CPU, memory channels, access pattern and concurrency.
Measure local/remote latency and bandwidth on the target host; do not transfer a published
nanosecond ratio into capacity arithmetic.

## Which collectors respond to the flag

`-XX:+UseNUMA` enables supported collector NUMA policies, including Parallel GC and G1
(G1 support: JEP 345, JDK 14, Linux). G1's young-region placement aims at allocation locality;
it does not guarantee local access to everything already on the heap.

With NUMA support active, Parallel GC in HotSpot 25 uses node-local allocation spaces for Eden,
and requests interleaved placement for old-generation pages across allowed nodes. These are
placement policies, not proof of physical residence. On Linux local placement is a preference
allowing fallback, not strict binding. A long-lived object promoted out of Eden therefore does not carry a guarantee
of locality to its allocating thread, and the allocating thread need not be its eventual reader.
For an old-generation working set, investigate actual page residence and accessing CPUs instead
of treating an enabled flag as proof that remote accesses should disappear.

ZGC also uses `UseNUMA`: JDK 25's `ZArguments` enables it by default, and Linux `ZNUMA`
initialization reads that flag. Allocation/relocation policies and platform support are
version-specific. Verify target-build logs/source and placement rather than extrapolating G1.

Do not infer another collector's support from flag acceptance; inspect effective behavior in the
target build. A requested flag can be changed by ergonomics or topology constraints.

## Measuring

```bash
numastat -p <pid>     # per-node process memory residency, typically MB
```

Per-process `numastat` reports where pages reside, not which CPUs access them or whether an
access was remote. `local_node`/`other_node` belong to the system allocation-statistics view,
not this per-process table; even those counters describe allocation rather than current access
traffic. Correlate residency with CPU placement and PMU/topology evidence.

## Distributing versus pinning

Two strategies, and the choice depends on whether the workload fits in one node:

- **Distribute** (`-XX:+UseNUMA` under Parallel/G1): use the collector's generation-specific
  placement policies described above. Evaluate when the process legitimately spans nodes;
  local allocation and interleaving have different access-locality consequences.
- **Pin** (`numactl --cpunodebind=0 --membind=0`): confine the process to one node.
  This is a launch prefix; append the application command. Evaluate only when node 0 is allowed
  and its CPU, memory and bandwidth cover heap, native memory and workload demand. Strict memory
  binding can cause allocation failure despite free memory elsewhere.

A diagnostic signal for the choice: if the scalability curve's knee coincides with the core
count of a single node, crossing a node boundary is one hypothesis. Verify actual CPU placement;
SMT, frequency, bandwidth or contention can create a similar knee. Compare matched CPU capacity
where possible and measure the capacity lost by confinement.

## Checklist for multi-socket systems

- [ ] `numactl --hardware` confirms more than one node
- [ ] The scaling hypothesis is supported by actual CPU placement, not just matching core counts
- [ ] Per-process page residence interpreted with CPU placement and access evidence, without
      a universal `other_node` threshold
- [ ] Effective collector NUMA policy, flag value and any topology-based disablement are recorded
- [ ] Pinning with `numactl` evaluated as an alternative to distributing
- [ ] `numastat` measured before **and** after the change

## Sources

- [HotSpot 25 Parallel young generation](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/gc/parallel/psYoungGen.cpp)
  and [old generation](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/gc/parallel/psOldGen.cpp),
  with [space page setup](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/share/gc/parallel/mutableSpace.cpp)
  and [Linux local/interleaved policies](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/hotspot/os/linux/os_linux.cpp).
- [JDK 25 ZGC Linux NUMA initialization](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/os/linux/gc/z/zNUMA_linux.cpp)
  and [ZGC arguments](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/z/zArguments.cpp).
- [JDK 25 Linux topology checks](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/os/linux/os_linux.cpp).
- [numactl project's numastat manual](https://github.com/numactl/numactl/blob/master/numastat.8).
- [Linux NUMA memory policy](https://www.kernel.org/doc/html/latest/admin-guide/mm/numa_memory_policy.html).
