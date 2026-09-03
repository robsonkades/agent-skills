---
name: forkjoinpool-and-work-stealing
description: >
  Design and diagnose ForkJoinPool workloads using work-stealing topology, task graphs,
  granularity, common-pool interference, managed blocking, compensation limits and approximate
  pool telemetry. Use when parallel computation underutilizes CPUs, parallel streams interfere,
  joins stall, blocking collapses effective parallelism, or copied thresholds and pool constants
  are being treated as universal policy. Includes Java 25 API changes with version labels.
---

# ForkJoinPool and Work Stealing

## Purpose

Use `ForkJoinPool` for decomposable task graphs where workers create enough independent work to
steal. Its advantage is not “more threads”; it is distributed scheduling queues plus join-aware
assistance for nested computations. Correctness still comes from task ownership and Java Memory
Model synchronization, and throughput still depends on useful work per task and the real bottleneck.

This skill owns pool/task-graph behavior. General concurrency choice belongs to `java-concurrency`,
pool capacity math to `thread-sizing-and-virtual-threads`, and benchmark validity to
`jmh-microbenchmarks`.

## Decision workflow

1. Identify the actual pool and entry path: `invoke`, external submission, `fork`, parallel stream,
   or an executor-less async API.
2. Describe the task DAG: parent/child dependencies, joins, exceptional paths, and unowned work.
3. Establish workload character: CPU, memory bandwidth, allocation, lock contention, managed wait,
   unmanaged I/O, or mixed phases.
4. Capture pool estimates, thread state and CPU/wall profiles during the symptom.
5. Vary one of task threshold, parallelism, data shape, blocking fraction or pool isolation, then
   validate throughput, tail latency and resource use.
6. Confirm shutdown and exception ownership. Daemon workers and unobserved tasks are not durability.

## Choose the mechanism by workload

| Workload                                                       | Prefer                                                                                        | Avoid when                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| recursive, CPU-heavy divide-and-conquer                        | default LIFO local scheduling and returned partial results                                    | leaves are tiny, skewed, stateful, or bounded by memory bandwidth                              |
| many independent event-style tasks that are not joined         | dedicated pool with `asyncMode=true` can fit                                                  | durable queueing, admission control or per-task isolation is required                          |
| occasional managed wait inside otherwise fork/join computation | `ManagedBlocker` around the precise wait                                                      | the whole workload is blocking I/O or the provider has better async/virtual-thread integration |
| ordinary blocking request tasks                                | virtual-thread-per-task executor plus resource-local limits                                   | CPU parallelism rather than concurrency is the goal                                            |
| parallel collection reduction                                  | parallel stream only after measuring source splitting, collector and common-pool interference | ordered/stateful operations, small data, blocking lambdas, or latency-sensitive shared process |

The JDK describes the common pool as appropriate for many applications; isolation is a decision, not
a universal commandment. Use a dedicated pool when fault/capacity ownership differs, predictable
latency matters, or shared consumers interfere. A dedicated pool adds lifecycle, thread and tuning
costs and does not by itself make blocking safe.

## Task-graph rules

- Fork one branch, compute another locally, then join is a useful binary-recursion pattern because it
  keeps the current worker productive. It is not a law: `invokeAll`, `CountedCompleter`, irregular
  DAGs and event-style tasks have different policies.
- A forked task need not always be joined: async-mode event tasks are explicitly supported. But every
  task still needs a lifetime, exception and shutdown owner. “Never joined” must be intentional.
- Return partial results and combine after completion. Sibling tasks that mutate common non-thread-safe
  state race; belonging to one pool does not establish ordering between them.
- Do not claim a special fork-to-task happens-before rule that the `ForkJoinTask` API does not state.
  Publication and result visibility follow the documented task/Future completion APIs and the JMM;
  intermediate shared state still needs its own synchronization.
- Cancellation is best effort. `ForkJoinTask.cancel` does not generally interrupt the executing
  thread. Long computations need explicit cooperative checks where cancellation is a requirement.
- Exceptions surface through `join`/`invoke`/`get`; an event task with no observer can fail without
  reaching a request owner. Worker uncaught-exception handlers are not a substitute for observing
  task outcomes.

## Blocking and compensation

The pool can compensate for joins and `ManagedBlocker`, subject to pool configuration, thread-factory
success and resource limits. `managedBlock` _possibly_ activates/spawns a spare; it does not guarantee
target parallelism, make the remote dependency healthy, or bound blocked calls. Unmanaged blocking
gives the pool fewer scheduling signals, but implementation/runtime mechanisms may still observe
some waits—diagnose rather than claiming the pool “cannot know” categorically.

For the Java 9+ extended constructor:

- `parallelism` is a target;
- `maximumPoolSize` bounds compensation with documented transient caveats;
- `minimumRunnable` influences replacement of managed blocked/joining workers;
- `saturate` chooses rejection versus operating below target when replacement cannot be created;
- `corePoolSize` is documented as ignored in current Java 25, a version-sensitive detail.

The Java 25 implementation documents a maximum of 32,767 running threads and a common-pool default
of 256 spare threads. Those are implementation/default facts, not architectural sizing targets.

## Granularity and scaling

Too-fine tasks pay allocation, queue, steal, completion and merge overhead. Too-coarse tasks expose
too little parallel slack and amplify skew. JDK guidance gives rough computational-step ranges, but
production thresholds must be calibrated for the operation, data distribution and hardware.

Measure a threshold sweep with warmup and multiple forks. Include sequential baseline, allocation,
CPU utilization, bandwidth/cache counters where relevant, steals, task imbalance and end-to-end
latency. A faster microkernel can make the whole service slower through extra allocation or shared
pool contention. Stop adding parallelism when the bottleneck is bandwidth, cache/NUMA traffic,
serialization, locks, or downstream capacity.

## Parallel streams

Parallel stream APIs do not expose an executor parameter. The JDK implementation normally uses
fork/join machinery and the common pool for ordinary external invocation, but custom-pool behavior
observed by nesting a terminal operation inside another pool is not a portable stream API contract.
Do not build isolation guarantees on that implementation trick. Prefer an explicit task API when
executor ownership matters.

Stream correctness additionally requires non-interfering/stateless behavioral parameters and an
associative reduction. Encounter order and stateful operations can constrain parallel execution.

## Production diagnosis

Pool accessors—active/running threads, queued tasks/submissions, steals and quiescence—return estimates
or snapshots. Compare time series to a known healthy workload; no single steal ratio proves either
good balance or bad granularity.

| Symptom                                        | Evidence to distinguish                                               | Candidate action                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| queued work, low running count                 | thread dump; blocked call sites; managed-block status                 | isolate/block via supported mechanism; validate compensation ceiling       |
| high CPU, no throughput gain                   | CPU profile, bandwidth/cache counters, allocation/GC                  | increase leaf size, reduce allocation, or abandon parallelism              |
| intermittent latency across unrelated features | pool identity and per-consumer tagged work                            | isolate capacity or remove executor-less/default consumers                 |
| one worker owns most work                      | leaf duration distribution, input skew, steal trend                   | improve splitting/decomposition; avoid fixed midpoint assumptions          |
| shutdown loses tasks                           | daemon-worker lifecycle and terminal observers                        | explicitly await owned work or move durable work to durable infrastructure |
| pool stalls at compensation ceiling            | `maximumPoolSize`, `minimumRunnable`, rejection, blocked-thread count | reduce blocking, raise justified ceiling, or change executor model         |

## Anti-patterns

### Copied leaf threshold

- **Why:** element count looks workload-independent.
- **Symptoms:** either millions of tiny tasks or idle workers on skewed leaves.
- **Better:** threshold sweep using real leaf cost and representative distributions.
- **Sometimes acceptable:** a conservative default with runtime evidence and a revalidation trigger.

### Common pool as invisible global capacity

- **Why:** zero configuration.
- **Symptoms:** one library's long tasks change unrelated stream/future latency.
- **Better:** inventory consumers, make ownership explicit, isolate where SLO/failure domains differ.

### Shared mutable accumulator

- **Why:** avoids result objects/merge code.
- **Symptoms:** nondeterministic wrong answers or contention that erases speedup.
- **Better:** isolated partial results and associative merge; concurrent collector only when semantics fit.

## Review checklist

- [ ] Actual pool, effective parallelism and other consumers are known.
- [ ] Task DAG, completion owner and exceptional/cancellation paths are explicit.
- [ ] Leaf threshold was measured against representative size and skew.
- [ ] Blocking calls are classified; compensation is treated as bounded/best effort.
- [ ] Shared state has an independent JMM argument.
- [ ] Pool estimates, CPU/wall profile and system bottleneck were correlated.
- [ ] Version-sensitive constants and Java 25 APIs are labelled.
- [ ] Daemon-worker/process-exit behavior cannot silently lose required work.

## References

- [Pool mechanics and contracts](references/pool-internals.md)
- [Diagnosis and experiment design](references/diagnosing-and-sizing.md)
- [Java 25 `ForkJoinPool`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [Java 25 `ForkJoinTask`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinTask.html)
- [Java 25 streams package](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/package-summary.html)
