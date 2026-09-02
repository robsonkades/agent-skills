# Triage map

Each fork below is a symptom that maps to more than one cause. The question is what
separates them, and the evidence column is the cheapest thing that answers it.

## "It got slow after the deploy"

| Question                                      | Answer | Route                                                              |
| --------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Does it recover after a few minutes?          | yes    | `jit-compilation` — warm-up                                        |
| Does it recover only after a restart?         | yes    | `jit-compilation` — code cache                                     |
| Did pause **frequency** change, not duration? | yes    | allocation → `jit-inlining-and-escape-analysis`                    |
| Did pause **duration** change?                | yes    | `jvm-gc-tuning`                                                    |
| None of the above                             | —      | `performance-methodology` — enumerate what else the deploy changed |

Evidence: `gc.log` around the deploy timestamp, plus `jfr summary` on the continuous
recording. A deploy carries a process restart, cache invalidation, connection reset and pod
rotation with it; any of those alone can explain a change.

## "High CPU"

| Question                                                             | Answer | Route                                                                 |
| -------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| Is it mostly **system** time (`top`: sy ≫ us)?                       | yes    | `linux-for-jvm` — page faults, THP, futex storms, syscalls            |
| Is it GC threads (`jfr view thread-cpu-load`, `G1 Conc`, `ZWorker`)? | yes    | allocation → `jit-inlining-and-escape-analysis`, then `jvm-gc-tuning` |
| Is it compiler threads, right after a deploy?                        | yes    | `jit-compilation` — warm-up                                           |
| Is it application threads, throughput also up?                       | yes    | `flame-graph-analysis` (CPU profile) — it may be fine                 |
| Is it application threads, throughput flat or down?                  | yes    | `flame-graph-analysis`, then `cpu-cache-and-numa` if it spins         |

Evidence: `top -H -p <pid>` for the split by thread, `jfr view thread-cpu-load` on the
continuous recording for the same split with names. CPU that rises with no change in load is a
code-cache or deoptimisation question (`code-cache-segments`, `deoptimization`) before it is a
profiling one.

## "High latency"

| Question                                               | Answer | Route                                                                                       |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| Is CPU high?                                           | yes    | `flame-graph-analysis` (CPU profile)                                                        |
| Is CPU low?                                            | yes    | `littles-law-and-queueing` — it is a queue                                                  |
| Are threads parked?                                    | yes    | `thread-sizing-and-virtual-threads`, or `connection-pool-sizing` if the park is on the pool |
| Are threads blocked on monitors?                       | yes    | `jfr-and-async-profiler` → `jdk.JavaMonitorEnter`                                           |
| Does the client-felt pause exceed the logged GC pause? | yes    | `gc-fundamentals` (TTSP), then `linux-for-jvm`                                              |

Evidence: `asprof -e wall -t` first. A CPU profile on an I/O-bound service reports "no
bottleneck", which closes the investigation on a false negative.

## "Memory keeps growing"

| Question                                        | Answer | Route                                                 |
| ----------------------------------------------- | ------ | ----------------------------------------------------- |
| Does the heap floor rise after full collection? | yes    | retention → `gc-log-analysis`, then heap dump         |
| Is it Metaspace or classloader count?           | yes    | `jvm-class-loading`                                   |
| Is RSS above heap by more than expected?        | yes    | `jvm-memory-regions`                                  |
| Does RSS keep rising while the heap is flat?    | yes    | `off-heap-memory` — direct buffers, native leaks, NMT |
| Was the process killed with no Java exception?  | yes    | `linux-for-jvm`                                       |

Evidence: `jcmd <pid> VM.native_memory summary` (needs NMT at start) and
`jcmd <pid> VM.classloader_stats` before/after N cycles.

## "Throughput does not scale"

| Question                             | Answer | Route                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------ |
| Does throughput plateau?             | yes    | `littles-law-and-queueing` — find the smallest ceiling |
| Does throughput get **worse**?       | yes    | `cpu-cache-and-numa` — coherency, not capacity         |
| Do locks appear in JFR?              | yes    | `jfr-and-async-profiler`                               |
| Do no blocking events appear at all? | yes    | `cpu-cache-and-numa` — false sharing generates none    |

Evidence: scaling efficiency `(thr_N / thr_1) / N` across two thread counts.

## "Only one instance is slow"

| Question                                                                           | Answer | Route                                                                                    |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Does it receive more requests, or longer-lived connections?                        | yes    | `load-balancing-and-routing` — pinning, skew                                             |
| Is its CPU throttled or its node oversubscribed (`container-cpu-throttling`, PSI)? | yes    | `container-awareness`, then `linux-for-jvm`                                              |
| Different hardware, socket count or NUMA layout from the others?                   | yes    | `numa-and-cpu-affinity`                                                                  |
| Same traffic, same node class, still slow after a restart?                         | yes    | data skew — `sql-query-performance` for the hot key, or `hot-partitions-and-rebalancing` |

Evidence: per-pod request rate and connection count side by side; `jfr view
container-cpu-throttling` on the slow pod versus a healthy one. A control instance is what
makes this fork cheap — compare, do not profile in isolation.

## "Worse since virtual threads were switched on"

| Question                                                                      | Answer | Route                                                                    |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Did a pool that was implicitly limiting concurrency disappear?                | yes    | `virtual-thread-migration` — the database or downstream is now the limit |
| Do `jdk.VirtualThreadPinned` events appear with the threshold lowered?        | yes    | `thread-sizing-and-virtual-threads`, then `virtual-threads-internals`    |
| Is the work CPU-bound?                                                        | yes    | `thread-sizing-and-virtual-threads` — wrong tool for it                  |
| Did carrier threads grow past parallelism, or a `ThreadLocal` cache multiply? | yes    | `virtual-threads-internals`                                              |

Evidence: `jfr view pinned-threads`, `jdk.VirtualThreadSubmitFailed`, and the connection-pool
wait metric before and after the flip. The stock `.jfc` threshold for pinning is 20 ms, so
"no pinned events" proves nothing until it is lowered (`jfr-advanced`).

## "Slower after the JDK upgrade"

| Question                                                                         | Answer | Route                                                                |
| -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Did a flag stop applying (`-XX:+IgnoreUnrecognizedVMOptions`, a removed option)? | yes    | `jdk-upgrade-impact`, then `jvm-performance-review`                  |
| Did the default collector or a GC default change for this machine class?         | yes    | `jvm-gc-tuning`                                                      |
| Only the first minutes are worse?                                                | yes    | `jit-compilation`, `startup-cds-crac-leyden` (AOT cache invalidated) |
| Does an agent or instrumentation library sit in the dependency tree?             | yes    | `jdk-upgrade-impact` — retransformation cost changed                 |

Evidence: `jcmd <pid> VM.flags` on both versions, diffed; the GC log's first line names the
collector and the heap sizing it derived.

## "The measurement itself looks wrong"

| Question                                                      | Answer | Route                                         |
| ------------------------------------------------------------- | ------ | --------------------------------------------- |
| Is the metric a mean, or a percentile without a sample count? | yes    | `latency-statistics`                          |
| Did the load generator use fixed virtual users?               | yes    | `load-testing`                                |
| Does the result change with the duration of the run?          | yes    | `performance-methodology` — accumulated state |
| Is it a microbenchmark?                                       | yes    | `jmh-microbenchmarks`                         |

## When two candidates survive

Collect in this order, because each is cheap and eliminates a whole branch:

1. `gc.log` for the incident window — rules GC in or out.
2. Two minutes of JFR at `settings=profile` — names the class of bottleneck. If a
   continuous recording is on, `jcmd <pid> JFR.view hot-methods` and `latencies-by-type`
   answer this from the last ten minutes with no file at all.
3. Three thread dumps 5–10 s apart (`jcmd Thread.dump_to_file -format=json`) — separates
   stuck from busy, and the per-thread `cpu=` field separates spinning from waiting.

Only then choose. Guessing between two candidates costs more than these three commands.
