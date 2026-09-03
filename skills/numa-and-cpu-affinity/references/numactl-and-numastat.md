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

`--cpubind` is **not** a flag. It is a plausible name that is not in the man page; the
CPU-axis equivalent of `--membind` is `--cpunodebind`. The naming asymmetry
(`cpu`-`node`-`bind`) is what makes the mistake easy.

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
numa_hit          842391       798102     served from the local node
numa_miss           1204        18932     had to come from another node
numa_foreign       18932         1204     should have been local, diverted elsewhere
interleave_hit      2048         2048
```

`numa_miss / (numa_hit + numa_miss)` can describe how often preferred-node page allocation
fell back system-wide. It cannot be attributed to this JVM and does not say which CPU later
read the page. Baseline it for host pressure; do not convert it into a remote-access SLO.

**Per process (`-p <pid>`)** — where _this_ process's memory currently sits. It produces no
hit/miss counters:

```
Per-node process memory:
             Node 0      Node 1       Total
Heap          34.20       61.80       96.00  (GB)
Stack          0.01        0.02        0.03
Private        0.40        0.35        0.75
```

`numastat -s <pid>` gives a more compact per-process summary.

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

async-profiler has no NUMA event in any version — it reads CPU PMU counters and JVM hooks,
not kernel NUMA counters. `mem:<address>[:rwx][:size]` is a hardware watchpoint on one
specific address, used to prove false sharing line by line. Combine two tools instead:

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
numactl --hardware | grep -A3 "node distances"
# node distances:
# node   0   1
#   0:  10  21
#   1:  21  10
```

`grep` alone captures only the `node distances:` header — the matrix is on the following
lines. `-A3` is the minimum for two nodes; use `-A(N+1)` for N nodes.

```bash
cat /proc/<pid>/status | grep -i cpus_allowed
taskset -p <pid>                              # current CPU affinity mask
java -XX:+PrintFlagsFinal -version 2>&1 | grep UseNUMA   # default is false
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
in automation. This log never says which node a worker is on, and no unified-logging tag
does. The information lives in `/proc`:

```bash
PID=<pid>
for task in /proc/$PID/task/*; do
    tid=$(basename "$task")
    name=$(cut -d' ' -f2 "$task/stat" | tr -d '()')
    # field 39 = processor last executed on: a sample, not affinity or residency history
    cpu=$(awk '{print $39}' "$task/stat")
    case "$name" in
        GC\ Thread*|G1\ *) echo "$name (tid=$tid) -> cpu $cpu" ;;
    esac
done
```

Cross each CPU number with `numactl --hardware`, which lists the CPUs belonging to each
node.
