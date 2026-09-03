# Triage map

Each symptom admits several causes. The tables identify separating evidence, not deterministic
routes. Collect only what is safe and available; `incident-evidence-capture` overrides ordinary
diagnostic convenience during live recovery pressure.

## “It became slow after a deploy”

| Candidate                         | Separating evidence                                                             | Owner if supported                                         |
| --------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| warm-up/JIT/cache priming         | effect tracks process age/compilation/cache hit, recovers repeatably            | `jit-compilation`, startup/cache owner                     |
| code/config/dependency regression | persists after matched warm state; diff and profile/trace identify changed path | `performance-methodology` + mechanism owner                |
| rollout capacity/traffic skew     | only draining/new/particular zones; queue/utilization/replica state changed     | `capacity-planning`, `load-balancing-and-routing`          |
| GC/allocation/live-set shift      | aligned allocation/occupancy/GC phase/pause evidence and work-normalized change | `allocation-profiling`, `gc-log-analysis`, `jvm-gc-tuning` |
| connection/downstream cold state  | reconnect/DNS/TLS/pool/cache metrics and dependency latency                     | I/O/distributed/pool owner                                 |
| observability overhead/config     | agent/event/cardinality/export cost changed with deploy                         | `opentelemetry-performance`, `continuous-profiling`        |
| measurement epoch                 | dashboard/query/client/load generator changed                                   | `latency-statistics`, `performance-methodology`            |

“Recovers after minutes” suggests lifecycle state, not specifically JIT. “Persists until
restart” suggests accumulated/reset state, not specifically code-cache exhaustion.

## “CPU is high”

First compare CPU demand per completed work, offered/accepted work, errors/retries, user versus
system/steal/throttled time, and target versus host/cgroup scope.

| Evidence                                                       | Candidate/route                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| application CPU stack materially changed under same work       | `flame-graph-analysis`, then code/mechanism owner          |
| GC worker/concurrent phase CPU and allocation/live set changed | `gc-log-analysis`, `allocation-profiling`, collector owner |
| compiler/deopt/code-cache evidence aligns with lifecycle       | `jit-compilation`, `deoptimization`, `code-cache-segments` |
| system CPU/syscalls/faults/network/kernel stacks dominate      | `linux-for-jvm`, `ebpf-for-jvm` when needed                |
| CPU rises because throughput/retries/background work rose      | demand/distributed/workload owner; may be expected         |
| quota throttling or noisy host despite modest usage metric     | `container-awareness`, `linux-for-jvm`                     |
| instrumentation/export/label cost changed                      | `opentelemetry-performance`, profiling/metrics owner       |

Do not infer code-cache/deoptimization merely because load appears unchanged. Verify workload
mix, completed work, profiles, and runtime compilation evidence.

## “Latency is high”

Compare the full distribution, timeout/cancellation/error treatment, client/server timing,
offered/completed load, queue depth/wait, utilization, and fanout.

| Evidence                                           | Candidate/route                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| CPU per work and CPU stacks rise                   | CPU/code/GC/runtime owner                                                    |
| queue/pool wait and utilization approach a bound   | `littles-law-and-queueing`, pool/bulkhead owner                              |
| off-CPU/socket/trace dependency duration dominates | distributed/I/O/timeout owner                                                |
| monitor/park contention with ownership             | `concurrency-diagnostics`, lock owner                                        |
| GC/safepoint/OS scheduling pause aligns            | `pause-attribution`, `safepoints`, `linux-for-jvm`                           |
| only client sees delay                             | network/LB/client queue/timing; distributed tracing and packet/host evidence |
| low load and low resource demand                   | verify whether service is actually slow versus idle/sparse-sample artifact   |

High latency plus low average CPU does not prove a queue, although all waiting systems involve
some queue/state. Locate where elapsed time resides and who owns the limit.

## “Memory keeps growing”

Split heap committed/used/live-after-collection, metaspace/class loaders, code cache, thread
stacks, direct buffers, native allocations, mappings/page cache/shared memory, and cgroup RSS/
working set.

| Evidence                                                                 | Candidate/route                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| live heap floor/retained set grows under comparable work/cycles          | `heap-dump-analysis`, `java-reference-types-and-leaks`        |
| allocation rate rises but live floor stable                              | `allocation-profiling`, GC/capacity cost—not necessarily leak |
| class loader/metaspace grows with redeploy/dynamic generation            | `metaspace-internals`, `jvm-class-loading`                    |
| direct/native category grows with heap flat                              | `off-heap-memory`, `jni-and-ffm` where calls own it           |
| RSS differs due to committed/touched pages, code, stacks, mappings/cache | `jvm-memory-regions`, `linux-for-jvm`                         |
| cgroup OOM/exit 137                                                      | verify reason/events/limits before heap conclusion            | `container-awareness`, `linux-for-jvm`, memory owner |

NMT must be enabled at startup at an appropriate level; absence does not prove no native growth.

## “Throughput does not scale with concurrency”

Build a curve across enough concurrency/load points and retain latency/errors/queue/resource per
point.

| Shape/evidence                                                       | Candidate/route                                     |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| plateau at one saturated resource/service center                     | `littles-law-and-queueing`, `queueing-models`       |
| decline with lock/pool contention                                    | `concurrency-diagnostics`, `connection-pool-sizing` |
| decline with GC/allocation/working-set expansion                     | allocation/GC/memory owners                         |
| decline with context switching/oversubscription/quota                | thread sizing/container/Linux owners                |
| poor scaling without locks and hardware counters/topology support it | `cpu-cache-and-numa`, `false-sharing-and-contended` |
| downstream/DB/partition limit                                        | data-access/distributed owner                       |
| load generator saturates or closed-loop masks demand                 | `load-testing`, `coordinated-omission`              |

Two thread counts and one “scaling efficiency” number rarely distinguish these mechanisms.

## “Only some instances are slow”

Match instances on service/JDK/image/config, uptime/warm-up, traffic and connection mix,
operation/data/partition ownership, zone/node/hardware, cgroup limits, sidecars, and dependency
path.

Candidates include load-balancer skew, hot shard/tenant, node contention/NUMA, throttling,
partial rollout, cold instance, leak/accumulated state, DNS/network path, and failing sidecar.
Use per-instance comparison and route only after the differentiator appears.

Restarting the slow instance destroys whether the cause followed the workload/shard or the
instance; preserve evidence and, when safe, observe reassignment.

## “Worse after virtual threads”

| Separating evidence                                                            | Route                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| removed executor was the only concurrency bound; downstream/pool now saturated | `virtual-thread-migration`, `concurrency-limiting-and-bulkheads` |
| carrier pinning/compensation/task-submit evidence on target JDK                | `virtual-threads-internals`, `thread-sizing-and-virtual-threads` |
| ThreadLocal/context/resource multiplication                                    | `virtual-thread-migration`, `scoped-values` where applicable     |
| CPU-bound work exceeds effective processors                                    | concurrency bound/parallelism, not more virtual threads          |
| synchronized/native/library behavior differs by JDK/version                    | JDK/library owner with JFR/thread evidence                       |
| observability labels/thread assumptions break                                  | profiling/tracing/context owner                                  |

JFR event availability/default thresholds differ across Java 21/25 and builds. No event does
not prove no pinning or scheduling issue; inspect effective metadata/configuration.

## “Slower after a JDK upgrade”

Treat the JDK as a multi-factor epoch:

- JVM defaults/ergonomics and removed/ignored flags;
- GC/JIT/runtime implementation;
- CPU/container detection and security providers/TLS;
- JFR/agent/instrumentation compatibility;
- library/framework behavior under the new JDK;
- class-data/AOT caches and rebuild validity;
- container image/kernel/CA/locale/time-zone changes bundled with it.

Use `jdk-upgrade-impact` and compare effective flags/logs/profiles under matched artifacts/
workload. A default collector change must be observed, not assumed.

## “The measurement looks wrong”

Check:

- metric semantics, aggregation and percentile estimator/window;
- success/error/timeout/cancellation inclusion;
- client versus server clock and coordinated omission;
- offered versus completed load and generator saturation;
- sampling/label cardinality/drop and histogram bounds;
- warm-up/steady-state/memory accumulation and test duration;
- benchmark dead-code/constant-folding/fork artifacts;
- dashboard query/filter/time-zone and rollout cohort.

Route to `latency-statistics`, `coordinated-omission`, `load-testing`,
`jmh-microbenchmarks`, `metrics-and-cardinality`, or `performance-methodology` before tuning.

## Minimal discriminating plan

When several branches survive, write a table:

| Hypothesis | Predicts | Existing evidence | Cheapest safe discriminator | Result |
| ---------- | -------- | ----------------- | --------------------------- | ------ |

Rank by information gained per risk/cost in the current environment. Several existing signals
can be read in parallel; intrusive collection remains serialized and budgeted. Stop collecting
when one mechanism is sufficiently established for a reversible causal experiment.
