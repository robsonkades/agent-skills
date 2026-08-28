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

| Question                                        | Answer | Route                                         |
| ----------------------------------------------- | ------ | --------------------------------------------- |
| Does the heap floor rise after full collection? | yes    | retention → `gc-log-analysis`, then heap dump |
| Is it Metaspace or classloader count?           | yes    | `jvm-class-loading`                           |
| Is RSS above heap by more than expected?        | yes    | `jvm-memory-regions`                          |
| Was the process killed with no Java exception?  | yes    | `linux-for-jvm`                               |

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
2. Two minutes of JFR at `settings=profile` — names the class of bottleneck.
3. Three thread dumps 15 s apart (`jcmd Thread.dump_to_file -format=json`) — separates
   stuck from busy.

Only then choose. Guessing between two candidates costs more than these three commands.
