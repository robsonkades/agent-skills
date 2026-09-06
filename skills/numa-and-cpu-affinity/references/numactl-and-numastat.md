# numactl, numastat and perf

## `numactl` flags, by axis

| Long form               | Short | Axis   | Effect                                                                |
| ----------------------- | ----- | ------ | --------------------------------------------------------------------- |
| `--cpunodebind=<nodes>` | `-N`  | CPU    | Restrict execution to the CPUs of the given node(s)                   |
| `--physcpubind=<cpus>`  | `-C`  | CPU    | Restrict execution to specific CPUs, not whole nodes                  |
| `--membind=<nodes>`     | `-m`  | Memory | Allocate **only** from the given node(s); fails when exhausted        |
| `--interleave=<nodes>`  | `-i`  | Memory | Round-robin allocation across the given nodes                         |
| `--preferred=<node>`    | `-p`  | Memory | Prefer one node, fall back to another when exhausted (one node)       |
| `--localalloc`          | `-l`  | Memory | Allocate from the node the allocating thread runs on (kernel default) |
| `--hardware`            | `-H`  | Query  | Nodes, CPUs per node, memory per node, distance matrix                |
| `--show`                | `-s`  | Query  | The current process or shell NUMA policy                              |

numactl 2.0.19 retains `--cpubind` as a deprecated option; prefer `--cpunodebind` for node
selection and `--physcpubind` for CPU selection. Check installed help/source and actual
allowed masks; affinity and memory policy remain constrained by cpusets.

```bash
# Confine the whole process to one node — both axes together:
numactl --cpunodebind=0 --membind=0 java -jar app.jar

# Memory interleaving, independent of CPU binding:
numactl --interleave=all java -jar app.jar
```

## The two `numastat` modes

They answer different questions and are not interchangeable.

**Systemic (no `-p`)** — kernel page-allocation/fallback counters per node, across all
processes (not remote memory accesses):

```
                   node0        node1
numa_hit          842391       798102     served on intended node
numa_miss           1204        18932     allocated here, intended another node
numa_foreign       18932         1204     intended here, allocated elsewhere
interleave_hit      2048         2048
```

`numa_miss / (numa_hit + numa_miss)` can describe how often preferred-node page allocation
fell back system-wide. It cannot be attributed to this JVM and does not say which CPU later
read the page. Baseline it for host pressure; do not convert it into a remote-access SLO.

**Per process (`-p <pid>`)** — where _this_ process's memory currently sits. It produces no
hit/miss counters:

```
Illustrative per-node process memory (MB as printed by numastat):
             Node 0      Node 1       Total
Heap          34.20       61.80       96.00
Stack          0.01        0.02        0.03
Private        0.40        0.35        0.75
```

The `Heap` category follows the kernel heap mapping label, not HotSpot heap boundaries;
Java heap mappings commonly contribute to Private/Huge categories. Correlate mapping address
ranges with JVM evidence before calling any row Java heap. `numastat -s` sorts by total (or
selected node); `-c` controls compact display. Use `-p <pid>` explicitly for process selection.

## Valid `perf` events

```bash
perf list | grep node
# node-loads
# node-load-misses
# node-stores
# node-store-misses

perf stat -e node-loads,node-load-misses,node-stores,node-store-misses -p <pid> -- sleep 30
```

`numa_miss` is a `numastat` metric read from kernel memory-management counters
(`/sys/devices/system/node/nodeN/numastat`), a completely different source from the hardware
PMU that `perf` samples. `perf stat -e numa_miss` fails with "event not found".

Availability of the `node-*` events depends on the chip's PMU and the kernel driver, and
varies by SoC on aarch64. Check `perf list | grep node` first: an event absent from the list,
or `<not supported>` in `perf stat` output, is not the same as zero NUMA misses.

## Attributing node misses to Java methods

async-profiler v4.4 supports Linux perf events, including supported raw/named PMU events.
Availability and access semantics are platform-specific. A `mem:` hardware watchpoint observes
an address; it does not establish false sharing or NUMA locality by itself. One possible
collection pair is below; start captures in coordinated sessions if claiming the same window:

```bash
perf record -e node-load-misses -p <pid> -g -- sleep 30
perf report --stdio --sort=overhead,symbol | head -40

./asprof -e alloc -d 30 -f alloc.html <pid>    # same window
```

Methods at the top of both outputs are hypotheses only. PMU event semantics and call-chain
quality vary by CPU/kernel, and co-occurring allocation does not identify which object's
page was remotely accessed. Confirm with controlled placement changes and outcome metrics.

## Topology and current binding

```bash
numactl --hardware | head -1                  # available: N nodes (0-N)
numactl --hardware                          # retain the complete matrix
# node distances:
# node   0   1
#   0:  10  21
#   1:  21  10
```

Node IDs may be sparse. Distances are relative firmware topology values, not measured access
latencies; preserve all nodes and correlate with memory bandwidth/latency evidence.

```bash
cat /proc/<pid>/status | grep -i cpus_allowed
taskset -ap <pid>                             # masks for all current threads; support varies
java <same-collector-and-options> -XX:+PrintFlagsFinal -version 2>&1 | grep UseNUMA
jcmd <pid> VM.flags | grep -i numa
```

## Mapping GC threads to nodes

`-Xlog:gc+init=debug` tells you how many workers exist and whether NUMA support is on — GC
worker sizing happens at JVM init, so it prints even with `-version`:

```bash
java -XX:+UseG1GC -Xlog:gc+init=debug -version 2>&1 | grep -iE "worker|numa"
# [gc,init] NUMA Support: Disabled
# [gc,init] Parallel Workers: 16
# [gc,init] Concurrent Workers: 4
```

Labels and counts vary by build and hardware — confirm on the target JDK before using them
in automation. This init summary does not provide per-thread placement history. A Linux
procps snapshot avoids parsing whitespace inside `/proc` stat command names:

```bash
ps -L -p <pid> -o pid,tid,psr,comm
```

Identify collector thread names for the target build; names may be truncated. PSR is the last
executed CPU, not the affinity mask or a migration history. For raw stat parsing, read the
whole record through its final `)` before splitting the suffix; suffix index 36 (zero-based)
is field 39. Sample repeatedly and verify thread identity; threads can exit during capture.

Cross each CPU number with `numactl --hardware`, which lists the CPUs belonging to each
node.

## Sources

- [numactl 2.0.19 options](https://github.com/numactl/numactl/blob/v2.0.19/numactl.c): deprecated cpubind retained.
- [numastat 2.0.19](https://github.com/numactl/numactl/blob/v2.0.19/numastat.c): mapping categories, units and sorting.
- [async-profiler v4.4 profiling modes](https://github.com/async-profiler/async-profiler/blob/v4.4/docs/ProfilingModes.md): supported perf event forms.
