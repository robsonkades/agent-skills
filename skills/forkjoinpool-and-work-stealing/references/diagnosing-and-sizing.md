# Diagnosis and experiment design

## Read telemetry as estimates

| Signal                       | Meaning                                              | Important limitation                                    |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `getParallelism()`           | target parallelism                                   | not current running work or a hard total-thread ceiling |
| `getPoolSize()`              | workers started and not terminated                   | may exceed target during compensation                   |
| `getActiveThreadCount()`     | estimate stealing/executing                          | sampling races with state transitions                   |
| `getRunningThreadCount()`    | estimate not blocked on join/managed synchronization | unmanaged blocking classification is not complete proof |
| `getQueuedTaskCount()`       | estimate in worker queues                            | excludes not-yet-started external submissions           |
| `getQueuedSubmissionCount()` | estimate of unstarted submissions                    | call itself may cost proportional to submissions        |
| `getStealCount()`            | estimate of completed tasks run by another thread    | cumulative and workload-shape dependent                 |
| `isQuiescent()`              | all workers currently idle                           | a momentary state, not business-work completion         |

`toString()` gives a useful snapshot but is not a metrics schema. Export named accessors at a modest
interval and retain pool identity. Avoid high-cardinality task labels.

## Evidence sequence

1. Record JDK build, CPU quota/affinity, pool constructor/effective settings, input size/distribution,
   and all known pool consumers.
2. Capture several thread dumps while the symptom is active. Classify application frames, joins,
   locks, parks, socket/file/JDBC calls and cross-pool waits.
3. Record CPU and wall-clock profiles over the same interval. CPU shows running cost; wall time exposes
   blocking/off-CPU delay.
4. Correlate pool estimate time series with request throughput, latency, GC, downstream concurrency
   and OS CPU throttling.
5. Reproduce with controlled changes and validate the predicted signal movement.

Avoid brittle diagnoses based on internal frame names (`scan`, `awaitWork`, `doExec`) alone; they move
across JDK releases and sampled stack position is ambiguous. Attribute user leaf functions and waits.

## Threshold experiment

Build a matrix across:

- sequential implementation;
- input cardinality and skew;
- leaf threshold on a logarithmic scale;
- pool parallelism including 1 and effective CPUs;
- representative allocation and data locality;
- multiple JVM forks after warmup.

Measure operations/second and distribution of operation latency, CPU time, allocation, GC, worker
utilization and steals. If relevant, use OS hardware counters for cache misses and memory bandwidth.
Do not prescribe “microseconds to milliseconds” as a universal leaf duration: timer overhead,
operation variance and service latency constraints differ.

Interpretation:

- smaller threshold helps until scheduling/allocation overhead dominates;
- larger threshold helps until insufficient slack or skew leaves workers idle;
- no threshold helps when the workload is serial, bandwidth-bound or synchronization-bound;
- a benchmark improvement is not production proof if the common pool has other consumers.

## Blocking experiment

Measure service time and wait time, but do not use `threads = CPUs × (1 + wait/service)` as an
automatic pool size. It assumes stable averages, independent work, sufficient downstream capacity,
and a CPU-utilization objective; tails and correlated stalls violate it.

Compare:

1. unmanaged blocking in the candidate pool;
2. precise `ManagedBlocker` with the same resource limit;
3. isolated blocking executor or virtual threads with resource-local permits;
4. asynchronous provider API when it materially reduces held resources.

Validate effective runnable workers, total threads, memory/context switching, throughput, tail latency,
rejection and downstream saturation. Raising compensation can preserve CPU work while worsening an
overloaded dependency.

## Failure and shutdown tests

- Throw from one child before/after its sibling and assert who observes it.
- Interrupt/cancel a long leaf and measure residual work; do not assume interruption.
- Inject worker-factory failure or compensation saturation in a dedicated test pool.
- Close a dedicated pool with queued/running work and verify task ownership.
- Demonstrate that common-pool `shutdown()` has no effect and that process exit can end daemon work.
- Run parallel reductions with adversarial splits and validate associativity/identity, not just a
  happy-path total.

## Incident checklist

- [ ] Symptom-time thread dumps and CPU/wall profiles captured.
- [ ] Effective pool settings and JDK version recorded.
- [ ] Approximate signals compared as time series against a healthy baseline.
- [ ] Unmanaged waits, cross-pool dependencies and cycles inspected.
- [ ] Input skew, leaf-time distribution and sequential baseline measured.
- [ ] Downstream capacity checked before increasing threads.
- [ ] Change validated under representative co-tenancy and CPU limits.

## References

- [Java 25 `ForkJoinPool` monitoring methods](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [Java 25 `ForkJoinTask` usage guidance](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinTask.html)
- [Java 25 stream parallelism](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/package-summary.html#Parallelism)
