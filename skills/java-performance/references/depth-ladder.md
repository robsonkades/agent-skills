# Specialist map

This is a knowledge graph, not a maturity ladder. Load the smallest set that owns the current
questions; advanced internals may be the first relevant skill when evidence already identifies
the mechanism.

## Measurement and capacity

| Question                      | Owner                      | Related/deeper evidence                                             |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------- |
| causal investigation protocol | `performance-methodology`  | `incident-evidence-capture`, `performance-regression-ci`            |
| percentile/tail statistics    | `latency-statistics`       | `coordinated-omission`, `tail-latency-analysis`                     |
| queue/capacity relationship   | `littles-law-and-queueing` | `queueing-models`, `universal-scalability-law`, `capacity-planning` |
| load-test design              | `load-testing`             | `load-testing-advanced`, `coordinated-omission`                     |
| microbenchmark validity       | `jmh-microbenchmarks`      | `jmh-advanced`, `performance-regression-ci`                         |
| profiler selection            | `jfr-and-async-profiler`   | `jfr-advanced`, `async-profiler-advanced`, `continuous-profiling`   |
| flame graph interpretation    | `flame-graph-analysis`     | event-specific owner, `latency-statistics` for comparisons          |

## Memory and GC

| Question                      | Owner                  | Related skills                                                   |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------- |
| region/budget identity        | `jvm-memory-regions`   | `object-layout-and-footprint`, `off-heap-memory`                 |
| allocation source             | `allocation-profiling` | `jit-inlining-and-escape-analysis`, `escape-analysis-internals`  |
| retention/leak                | `heap-dump-analysis`   | `java-reference-types-and-leaks`, `jhsdb-and-core-dumps`         |
| metaspace/class-loader growth | `metaspace-internals`  | `jvm-class-loading`                                              |
| native/off-heap ownership     | `off-heap-memory`      | `jni-and-ffm`, NMT/core evidence                                 |
| GC concepts/cost              | `gc-fundamentals`      | collector-specific internals                                     |
| GC incident/log               | `gc-log-analysis`      | `pause-attribution`, `jvm-gc-tuning`                             |
| collector/tuning decision     | `jvm-gc-tuning`        | `g1-tuning-for-slo`, `zgc-and-shenandoah`                        |
| G1 mechanics                  | `g1-internals`         | `g1-concurrent-marking`, `g1-tuning-for-slo`                     |
| ZGC/Shenandoah                | `zgc-and-shenandoah`   | `zgc-generational-internals`, `epsilon-and-shenandoah-internals` |
| safepoint/TTSP                | `safepoints`           | `pause-attribution`                                              |

## Execution and compilation

| Question                    | Owner                                         | Related skills                                      |
| --------------------------- | --------------------------------------------- | --------------------------------------------------- |
| warm-up/tiering/compilation | `jit-compilation`                             | `compilation-and-inlining-logs`, `c2-sea-of-nodes`  |
| inlining/escape surface     | `jit-inlining-and-escape-analysis`            | `escape-analysis-internals`, `reading-jit-assembly` |
| deoptimization              | `deoptimization`                              | compilation logs/JFR/assembly                       |
| code-cache segment          | `code-cache-segments`                         | `jit-compilation`                                   |
| bytecode input              | `jvm-bytecode`                                | class loading/reflection/method handles             |
| machine code/vectorization  | `reading-jit-assembly`, `simd-and-vector-api` | JMH and CPU/PMU evidence                            |
| alternative compiler/AOT    | `graalvm-jit`, `graalvm-native-image`         | startup/compatibility owners                        |
| startup/CDS/CRaC/Leyden     | `startup-cds-crac-leyden`                     | class loading, JIT, container lifecycle             |
| JDK migration               | `jdk-upgrade-impact`                          | `jvm-performance-review`                            |

## Concurrency and I/O

| Question                         | Owner                                | Related skills                                          |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| model/construct selection        | `java-concurrency`                   | reactive/virtual-thread selection                       |
| JMM correctness                  | `java-memory-model`                  | `varhandles-and-memory-ordering`, lock-free patterns    |
| thread/virtual-thread sizing     | `thread-sizing-and-virtual-threads`  | `virtual-thread-migration`, `virtual-threads-internals` |
| executor/task lifecycle          | `executors-and-task-lifecycle`       | CompletableFuture/structured concurrency/cancellation   |
| lock/deadlock/liveness diagnosis | `concurrency-diagnostics`            | `lock-inflation`, `concurrency-testing`                 |
| concurrency admission/bounds     | `concurrency-limiting-and-bulkheads` | reactive backpressure, deadlines                        |
| blocking/nonblocking I/O         | `blocking-and-nonblocking-io`        | `io-uring-and-zero-copy` after kernel evidence          |
| hardware scaling/NUMA            | `cpu-cache-and-numa`                 | `false-sharing-and-contended`, `numa-and-cpu-affinity`  |

## Platform and distributed/data boundaries

| Question                              | Owner                                  | Related skills                                     |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| Linux/process/container resource view | `linux-for-jvm`, `container-awareness` | `ebpf-for-jvm` for targeted kernel instrumentation |
| TCP/network behavior                  | `tcp-tuning`                           | distributed timeout/retry/load balancing owners    |
| one SQL/plan/index                    | `sql-query-performance`                | DB-vendor docs and production plan evidence        |
| ORM fetch/batching/N+1                | `orm-fetch-and-batching-performance`   | repository/data architecture boundary              |
| connection capacity                   | `connection-pool-sizing`               | DB concurrency and service admission control       |
| cache decision                        | `caching-strategies`                   | sharding/replication/hot partition owners          |
| serialization                         | `serialization-performance`            | RPC/schema/byte movement owners                    |
| distributed latency/failure           | `distributed-systems`                  | timeout/retry/bulkhead/circuit/idempotency owner   |

## Cross-skill paths

Common evidence chains:

```text
client tail regression
  -> latency-statistics / coordinated-omission
  -> tail-latency-analysis
  -> JFR/profile/trace/queue/kernel owner
  -> performance-methodology validation

RSS growth, flat heap
  -> jvm-memory-regions
  -> off-heap-memory
  -> NMT/proc/native allocation evidence
  -> JNI/FFM/library owner

throughput collapse at concurrency
  -> load-testing validity
  -> queueing/capacity + resource saturation
  -> lock/GC/CPU-cache/database/downstream discriminator
  -> specialist experiment

post-JDK regression
  -> jdk-upgrade-impact
  -> effective runtime/config epoch diff
  -> GC/JIT/agent/library/platform owner
  -> performance-regression-ci guardrail
```

Do not duplicate mechanics in the router. Cross-reference the owner and carry the shared
evidence contract forward.
