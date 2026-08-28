# Depth ladder

Each row is one area of JVM performance at three depths. The introductory skill is what the
routing table sends you to; the deeper ones cost more context and are justified only by the
condition in the last column.

Descend only when the shallower skill has actually been applied and the question survived it.
Starting at the expert level is the same error as tuning before measuring: it is precise work
on a question you have not yet earned.

## Method and measurement

| Area              | Introductory               | Advanced                                       | Expert                  | Descend when                                                        |
| ----------------- | -------------------------- | ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| Process           | `performance-methodology`  | —                                              | —                       | —                                                                   |
| Latency numbers   | `latency-statistics`       | `coordinated-omission`                         | `tail-latency-analysis` | the generator may be self-throttling, or the tail needs decomposing |
| Capacity          | `littles-law-and-queueing` | `queueing-models`, `universal-scalability-law` | `capacity-planning`     | a rule of thumb cannot size or forecast it                          |
| Load testing      | `load-testing`             | `load-testing-advanced`                        | —                       | a steady rate cannot answer the question                            |
| Benchmarking      | `jmh-microbenchmarks`      | `jmh-advanced`                                 | —                       | variance will not settle, or a profiler must run inside the harness |
| Regression gating | —                          | `performance-regression-ci`                    | —                       | the check must run unattended on every commit                       |

## Runtime and memory

| Area           | Introductory         | Advanced              | Expert                    | Descend when                                                  |
| -------------- | -------------------- | --------------------- | ------------------------- | ------------------------------------------------------------- |
| Memory regions | `jvm-memory-regions` | `metaspace-internals` | `off-heap-memory`         | the region is identified and the budget still does not add up |
| Class loading  | `jvm-class-loading`  | —                     | `startup-cds-crac-leyden` | startup, not correctness, is the problem                      |
| Bytecode       | —                    | `jvm-bytecode`        | —                         | you need to know what the compiler was given                  |
| Heap contents  | —                    | `heap-dump-analysis`  | `jhsdb-and-core-dumps`    | the process is dead, or a heap dump cannot be taken           |
| Native memory  | —                    | `off-heap-memory`     | `jni-and-ffm`             | native code is being called, not just native memory held      |

## Garbage collection

| Area        | Introductory                       | Advanced                             | Expert                                                                                    | Descend when                                     |
| ----------- | ---------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Decision    | `jvm-gc-tuning`                    | —                                    | —                                                                                         | —                                                |
| Mechanism   | `gc-fundamentals`                  | `g1-internals`, `zgc-and-shenandoah` | `g1-concurrent-marking`, `zgc-generational-internals`, `epsilon-and-shenandoah-internals` | the collector's own phases must explain the cost |
| Log reading | `gc-log-analysis`                  | —                                    | `pause-attribution`                                                                       | the logged pause does not explain the felt pause |
| Flag values | `jvm-gc-tuning`                    | `g1-tuning-for-slo`                  | —                                                                                         | an SLO must be turned into specific numbers      |
| Safepoints  | `gc-fundamentals`                  | `safepoints`                         | `pause-attribution`                                                                       | TTSP is suspected                                |
| Allocation  | `jit-inlining-and-escape-analysis` | `allocation-profiling`               | —                                                                                         | you need to know who allocates, in bytes         |

## Compilation

| Area                  | Introductory                       | Advanced                                          | Expert                                        | Descend when                                        |
| --------------------- | ---------------------------------- | ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Warm-up, tiers        | `jit-compilation`                  | `compilation-and-inlining-logs`, `deoptimization` | `c2-sea-of-nodes`                             | you need what the compiler decided, not the model   |
| Code cache            | `jit-compilation`                  | `code-cache-segments`                             | —                                             | one segment is exhausted while the total looks fine |
| Inlining, escape      | `jit-inlining-and-escape-analysis` | `compilation-and-inlining-logs`                   | `escape-analysis-internals`                   | a refusal reason must become a code change          |
| Machine code          | —                                  | —                                                 | `reading-jit-assembly`, `simd-and-vector-api` | only the emitted instructions settle it             |
| Alternative compilers | —                                  | —                                                 | `graalvm-jit`, `graalvm-native-image`         | a compiler or deployment swap is on the table       |

## Concurrency

| Area            | Introductory                         | Advanced                                                      | Expert                           | Descend when                                      |
| --------------- | ------------------------------------ | ------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| Model choice    | `java-concurrency`                   | `reactive-and-virtual-thread-selection`                       | —                                | the construct is undecided or under review        |
| Correctness     | `java-memory-model`                  | —                                                             | `varhandles-and-memory-ordering` | the weakest sufficient ordering matters           |
| Locks           | `java-memory-model`                  | `lock-inflation`                                              | `lock-free-patterns`             | the lock is confirmed and still too expensive     |
| Threads, pools  | `thread-sizing-and-virtual-threads`  | `virtual-threads-internals`, `forkjoinpool-and-work-stealing` | —                                | sizing is right and the scheduler is the suspect  |
| Task execution  | `executors-and-task-lifecycle`       | `completablefuture-composition`                               | `structured-concurrency`         | lifetimes or failure propagation need a guarantee |
| Cancellation    | `cancellation-and-interruption`      | `timeouts-and-deadlines`                                      | —                                | a bound fires and the work does not stop          |
| Context         | `scoped-values`                      | —                                                             | —                                | `ThreadLocal` meets per-request threads           |
| Bounds          | `concurrency-limiting-and-bulkheads` | `reactive-backpressure`                                       | —                                | demand must be signalled rather than blocked on   |
| I/O behaviour   | `blocking-and-nonblocking-io`        | `virtual-threads-internals`                                   | `io-uring-and-zero-copy`         | the carrier or the syscall is the suspect         |
| Adoption        | `virtual-thread-migration`           | —                                                             | —                                | an existing service is moving to virtual threads  |
| Diagnosis       | `concurrency-diagnostics`            | `jfr-advanced`                                                | `jhsdb-and-core-dumps`           | a dump is needed and its blind spots matter       |
| Verification    | `concurrency-testing`                | `jmh-microbenchmarks`                                         | —                                | the claim must survive CI rather than a review    |
| Cache coherency | `cpu-cache-and-numa`                 | `false-sharing-and-contended`                                 | —                                | scaling efficiency is poor with no lock in sight  |

## Platform

| Area     | Introductory         | Advanced                | Expert                                 | Descend when                                                                  |
| -------- | -------------------- | ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Host     | `linux-for-jvm`      | `container-awareness`   | `ebpf-for-jvm`                         | the JVM's view of the container is suspect, or kernel-side evidence is needed |
| Topology | `cpu-cache-and-numa` | `numa-and-cpu-affinity` | —                                      | more than one NUMA node is confirmed                                          |
| Network  | —                    | —                       | `tcp-tuning`, `io-uring-and-zero-copy` | the bottleneck is the socket or the copy                                      |

## Observability and data

| Area              | Introductory                                   | Advanced                                  | Expert                      | Descend when                                                  |
| ----------------- | ---------------------------------------------- | ----------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Profiling         | `jfr-and-async-profiler`                       | `jfr-advanced`, `async-profiler-advanced` | `continuous-profiling`      | the default settings cannot prove it, or it must be always-on |
| Reading a profile | `flame-graph-analysis`                         | `async-profiler-advanced`                 | —                           | the graph itself is suspect                                   |
| Tracing           | —                                              | —                                         | `opentelemetry-performance` | traces are the instrument, or their own cost is               |
| Data access       | `connection-pool-sizing`, `caching-strategies` | —                                         | `serialization-performance` | the cost is in encoding bytes                                 |
