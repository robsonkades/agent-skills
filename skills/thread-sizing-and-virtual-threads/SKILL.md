---
name: thread-sizing-and-virtual-threads
description: >
  Choose and size platform-thread pools or virtual-thread-per-task execution from workload shape,
  capacity evidence and lifecycle constraints. Covers CPU versus waiting, queue/admission policy,
  resource limits exposed by virtual-thread migration, ThreadLocal cost, naming, pinning boundaries
  after JEP 491, and Java 21/24/25 observability. Use when pool size, virtual-thread adoption or
  post-migration latency/resource pressure is under review.
---

# Thread Sizing and Virtual Threads

## Purpose

Choose a concurrency execution model without confusing threads, parallelism, admission and resource
capacity. Virtual threads make a waiting thread cheap enough for thread-per-task code; they do not
make CPU, heap, connections, file descriptors or dependencies unlimited, and they do not make one
operation faster.

This skill owns execution-model selection and platform-pool sizing. Detailed scheduler/pinning
mechanics belong to `virtual-threads-internals`, executor queues/shutdown to
`executors-and-task-lifecycle`, and resource limits to `concurrency-limiting-and-bulkheads`.

## Decision workflow

1. Describe tasks by CPU time, blocking/wait time, allocation/retained state, service-time variance,
   cancellation and external resources—not only “I/O-bound.”
2. Measure target throughput/concurrency, CPU quota/throttling, dependency latency, current pool
   active/queue age, connection/resource occupancy and tail SLO.
3. Select virtual thread per task for large numbers of independent blocking lifetimes; select bounded
   platform execution for CPU parallelism, affinity/priority, incompatible native code or controlled
   thread reuse.
4. Inventory every limit the old pool/queue supplied accidentally. Reintroduce intentional admission
   at each scarce resource before migration.
5. Test representative peak, slow dependency, cancellation, shutdown, rollout and resource
   exhaustion on the deployed JDK/container limits.
6. Validate useful throughput, tail latency, CPU, native/heap memory, live/queued tasks and downstream
   health. Revert/adjust from predicted signals, not ideology.

## Selection table

| Work shape                                                     | Prefer                                                                 | Main risk                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| request/task spends much of lifetime in supported blocking I/O | virtual thread per task                                                | unbounded admission moves pressure to dependencies/memory |
| sustained CPU-heavy independent tasks                          | executor parallelism near measured CPU capacity                        | oversubscription, quota throttling, cache/NUMA contention |
| mixed blocking then CPU-heavy phases                           | virtual request lifetime plus explicit CPU executor/gate for hot phase | holding downstream resources while queued for CPU         |
| few long-lived event loops requiring affinity                  | dedicated platform threads                                             | blocking callbacks stall the loop                         |
| JNI/foreign calls that pin or require thread affinity          | measured/isolation-specific platform strategy                          | carrier pressure or incorrect affinity                    |
| dynamically composed non-lexical async graph                   | `CompletionStage`/reactive API when it fits                            | lost execution/failure/context ownership                  |

Virtual threads improve scalability when platform threads were the limiting waiting resource and the
application exposes enough concurrent waiting tasks. They can show little benefit at low concurrency,
with non-blocking event loops, or when CPU/downstream capacity already dominates.

## Platform-thread pool sizing

There is no universal “threads = cores” or `cores × (1 + wait/service)` answer. For CPU work, begin
near the effective CPU quota/affinity and sweep parallelism; SMT, allocation/GC, locks, bandwidth,
NUMA and throttling change the optimum. For blocking platform tasks, use measured wait/service ratio
only as a hypothesis under stable independent work, then cap by native-thread memory/OS limits and
downstream capacity.

Little's Law relates average in-system concurrency, throughput and residence time in a stable
population. Required average `λW` is not a safe pool size by itself: service variance and bursts need
queueing headroom, while downstream ceilings can make the required throughput infeasible. Route the
math to `littles-law-and-queueing`.

Platform thread stack reservation/commit, guard pages and native metadata vary by OS, architecture,
JDK, `-Xss`/`ThreadStackSize` and actual stack depth. Do not budget a fixed “1 MB per thread” without
measuring VM flags, virtual address space and resident/native memory in the target environment.

## Queue and admission

`Executors.newFixedThreadPool(n)` and `newSingleThreadExecutor()` use unbounded queues. In
`ThreadPoolExecutor`, queuing/growth depends on core state and queue acceptance; with an unbounded
queue, `maximumPoolSize` normally does not drive growth beyond core size. That may be correct for a
closed bounded producer, but is unsafe as implicit overload policy for open traffic.

Queue capacity, enqueue deadline, rejection, caller behavior and shutdown ownership are part of pool
sizing. `CallerRunsPolicy` is not a generic backpressure solution: it can block event loops, invert
latency, propagate reentrancy and silently discard after shutdown according to its contract.

## Virtual-thread model

`Executors.newVirtualThreadPerTaskExecutor()` creates one virtual thread per accepted task; it is not
a pool with a tunable task-worker count. Closing the executor performs orderly shutdown and waits, so
scope it to an application/component lifetime or a deliberately bounded batch—not casually per
request.

Do not pool virtual threads to limit concurrency. Use a semaphore/client pool/weighted gate around
the limited operation. Remember that blocked virtual threads and queued task objects both retain task
state; cheap waiting is not free or bounded.

CPU-heavy code still consumes carriers/cores. A million CPU-ready virtual threads add scheduling and
retained-state overhead without adding CPU capacity. Separate/bound CPU phases when they compete with
latency-sensitive request work.

## Pinning and version boundaries

- Virtual threads are final in Java 21 (JEP 444).
- Java 24 JEP 491 removes pinning caused by monitor acquisition/holding and `Object.wait`; choosing
  `ReentrantLock` merely to avoid `synchronized` pinning is obsolete on 24+.
- Native methods and foreign functions can still pin. A pin event must be correlated with scheduler
  queue/latency before it is called a bottleneck.
- Java 24 adds `VirtualThreadSchedulerMXBean` estimates for scheduler parallelism, pool size, mounted
  and queued virtual threads.
- Scoped values are final in Java 25 (JEP 506). Structured concurrency remains preview in Java 25;
  keep its API version-scoped.

Do not hard-code default JFR event thresholds or obsolete diagnostic flags into a runbook without
verifying the exact JDK/template. Diagnostics belong to `concurrency-diagnostics`.

## Thread-local state and context

Virtual threads support `ThreadLocal`; the problem is multiplication and lifetime, not API legality.
Classify each use:

- immutable request context: prefer lexically bounded `ScopedValue` when its one-way binding fits;
- mutable context: redesign ownership or ensure `try/finally remove`, especially on pooled platform
  threads;
- expensive reusable cache: share an immutable/thread-safe object, use an explicit bounded pool, or
  choose an operation-specific cache—per-virtual-thread reuse is usually absent;
- scarce connection/session: acquire for the operation and release deterministically; never cache per
  thread.

Review `InheritableThreadLocal`: inheritance can copy/reference state into very many child threads
and may leak authority/context. A virtual-thread factory can disable inheritable-thread-local initial
values when appropriate.

## Observability and security

Name thread factories with stable role prefixes; avoid embedding tenant IDs, secrets or unbounded
cardinality in names. Traditional `Thread.print`/`jstack` covers platform threads; use
`Thread.dump_to_file` and scheduler/JFR/application metrics for virtual threads, with the visibility
limits in `concurrency-diagnostics`.

Measure accepted/started/completed/failed/cancelled work, live virtual threads if available, scheduler
queued/mounted/pool estimates, CPU quota/throttling, platform pool active/queue age/rejections, and
resource-local wait/in-flight. Thread count alone does not reveal useful concurrency.

## Failure-mode diagnosis

| Symptom                                   | Distinguish with                                                | Likely action                                           |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| VT migration increases DB/HTTP timeouts   | resource in-flight/wait plus caller admission                   | restore resource-local concurrency/deadline control     |
| CPU saturated with scheduler queue growth | CPU profile, quota/throttling, CPU-heavy VT stacks              | bound/isolate CPU phase; do not only raise carriers     |
| native memory grows with platform pool    | native memory and thread-stack flags/count/depth                | reduce measured pool/stack need or change waiting model |
| shutdown waits indefinitely               | task ownership, interrupt/provider cancellation, executor close | repair cooperative cancellation and bounded drain       |
| high VT count and heap growth             | retained task contexts/ThreadLocals/queues                      | bound admission and reduce captured/per-thread state    |
| pin events exist but SLO is healthy       | duration/rate plus scheduler queue and latency                  | observe; do not rewrite locks without impact evidence   |

## Review checklist

- [ ] Work is characterized by CPU, wait, variance, retained state and resources.
- [ ] Platform pool parallelism was measured under actual CPU quota/hardware.
- [ ] Queue/admission/rejection and shutdown are explicit.
- [ ] Virtual-thread migration inventory covers every implicit old-pool bound.
- [ ] CPU phases and each scarce dependency have deliberate limits.
- [ ] ThreadLocal/inheritance uses are safe at projected thread cardinality.
- [ ] Java 21/24/25 feature and diagnostic boundaries are accurate for deployment.
- [ ] Peak, slow dependency, cancellation and shutdown tests validate residual work/resources.

## References

- [Sizing and adoption experiments](references/sizing-and-adoption.md)
- [Incident triage and observability](references/incident-triage.md)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [JEP 506: Scoped Values](https://openjdk.org/jeps/506)
- [Java 25 virtual-thread guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
