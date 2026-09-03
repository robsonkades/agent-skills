---
name: java-concurrency
description: >
  Entry point for designing or triaging concurrency inside one JVM. Classifies work by
  lifecycle, blocking and CPU demand, state ownership, arrival shape, ordering, cancellation,
  failure, and scarce-resource bounds, then routes to executors, virtual threads, structured
  concurrency, futures, reactive streams, memory-model correctness, diagnostics, or testing.
  Use before selecting a concurrency abstraction or when “more threads,” “async,” or “reactive”
  is proposed as a performance fix. Detailed construct internals and distributed coordination
  have separate owners.
---

# Java concurrency

## Purpose

Translate requirements and evidence into the concurrency model with the clearest ownership,
lifetime, cancellation, bounds, and failure semantics. Syntax does not create capacity: every
in-flight operation consumes CPU, memory, connections, queue slots, downstream capacity, or
recovery budget.

This category stops at one JVM. Cross-process retries, leases, ordering, and partial failure belong
to distributed-system skills.

## Classification contract

```text
unit of work and semantic result:
arrival shape: request/value/stream/scheduled/background
lifetime owner: lexical request/service/application
CPU demand, blocking/wait mechanisms and variability:
shared state, ordering and consistency requirements:
scarce resources and capacity per resource:
concurrency/admission/queue bounds and overload policy:
deadline, cancellation propagation and cleanup:
failure aggregation, retry/partial result policy:
context propagation and observability identity:
JDK/API status and framework constraints:
```

## Route by dominant decision

| Decision                                              | Owning skill                               |
| ----------------------------------------------------- | ------------------------------------------ |
| executor ownership, queue, rejection, shutdown        | `executors-and-task-lifecycle`             |
| platform-thread sizing and virtual-thread concurrency | `thread-sizing-and-virtual-threads`        |
| virtual-thread scheduler, mounting/pinning            | `virtual-threads-internals`                |
| migrating an existing service                         | `virtual-thread-migration`                 |
| lexical fan-out/join/cancel/failure                   | `structured-concurrency`                   |
| immutable dynamic context                             | `scoped-values`                            |
| callback/stage graph                                  | `completablefuture-composition`            |
| CPU-decomposable work/work stealing                   | `forkjoinpool-and-work-stealing`           |
| demand-controlled stream                              | `reactive-backpressure`                    |
| reactive versus thread-per-task                       | `reactive-and-virtual-thread-selection`    |
| cancellation/interruption/cleanup                     | `cancellation-and-interruption`            |
| admission/concurrency isolation                       | `concurrency-limiting-and-bulkheads`       |
| JMM/publication/visibility/atomicity                  | `java-memory-model`                        |
| collections/synchronizers                             | `concurrent-collections-and-synchronizers` |
| CAS/nonblocking algorithm                             | `lock-free-patterns`                       |
| deadlock/starvation/contention/dumps                  | `concurrency-diagnostics`                  |
| correctness/stress/model tests                        | `concurrency-testing`                      |
| quantitative queue/capacity model                     | `littles-law-and-queueing`                 |

## Selection principles

- **Concurrency and parallelism are independent quantities.** Concurrency is overlapping work;
  parallelism is simultaneous execution. CPU throughput can also be limited by quota, memory
  bandwidth, locks, cache coherence, I/O completion, vectorization, or another device—not only a
  physical core count.
- **Classify phases, not an entire service.** One request can parse on CPU, block on a socket,
  contend on a pool, then execute CPU work. Choose boundaries and limits per phase.
- **Cheap waiting does not create downstream capacity.** Virtual threads can make a synchronous
  blocking style scalable when blockers cooperate, but connections, memory, APIs and quotas remain
  bounded.
- **Lexical lifetime favors structured ownership**, when a supported API/framework fits. Long-lived
  consumers, schedulers and supervisors need an explicit service lifecycle.
- **A future is a value handle; reactive streams are a demand protocol.** Do not select either only
  to avoid blocking syntax.
- **State ownership precedes primitive choice.** Prefer immutable snapshots/confinement when they
  match semantics; otherwise define atomic invariants and happens-before before locks/atomics.
- **Overload behavior is part of correctness.** Bound, reject, queue, shed, degrade, or backpressure
  deliberately; an unbounded queue transfers the bound to latency and heap.
- **Cancellation is cooperative.** Define propagation, interrupt behavior, noninterruptible calls,
  resource cleanup, partial side effects, and what happens after the caller leaves.

## Evidence before “more threads”

Measure aligned:

```text
arrival/completion/error/drop rate and in-flight work
queue depth/wait/service time per scarce resource
CPU by cgroup/process/thread and throttling
wall/off-CPU state and dependency/pool/lock duration
allocation/retained memory per in-flight operation
deadline/cancellation outcome and abandoned work
```

Low CPU plus high latency does not prove a queue, nor that adding concurrency helps. The system may
be idle because of admission, timers, external wait, serial dependency, lost work, measurement scope,
or traffic changes. Locate the wait and its owner.

## Decision tree

```text
one request/task with sequential blocking calls?
  -> synchronous style; consider virtual threads if concurrency and blocker support justify it
lexical fan-out whose subtasks must join/cancel together?
  -> structured concurrency if target API status is acceptable; otherwise explicit owned executor
callback-only or dependency graph of values?
  -> CompletableFuture/stage abstraction with explicit executor and cancellation bridge
unbounded/time-shaped stream with consumer demand?
  -> Reactive Streams or bounded queue/channel with protocol-level backpressure
CPU-decomposable finite computation?
  -> bounded parallel decomposition/ForkJoin after granularity and interference analysis
long-lived scheduled/consumer work?
  -> managed executor/supervisor with shutdown, retry and health semantics
```

These branches can coexist at explicit boundaries. Do not hide blocking work inside an event loop or
CPU pool; do not wrap synchronous work in futures without defining the execution resource.

## Version discipline

Virtual threads are final in Java 21; later JDKs change implementation details such as monitor
pinning. Scoped values and structured concurrency have evolved through preview/incubator stages.
Before emitting source, verify the exact target JDK's JEP/API status, preview flags, binary/source
compatibility, and framework/tooling support. Do not encode a moving API from memory.

## Review checklist

- [ ] Every task has an owner, terminal state, deadline/cancel path, and cleanup.
- [ ] Every executor/scope/subscription has bounded admission and shutdown behavior.
- [ ] Scarce-resource bounds sit at the resource and are tested under saturation.
- [ ] Context cannot leak tenant/security state across reused threads/tasks.
- [ ] Blocking calls are known and do not occupy forbidden event-loop/CPU workers.
- [ ] Shared state has a stated JMM/thread-safety contract and compound invariants.
- [ ] Errors, partial success, retries and cancellation races preserve business semantics.
- [ ] Queue/in-flight/active/completion/rejection/cancellation metrics use bounded cardinality.
- [ ] Load, failure, shutdown and concurrency correctness tests cover the chosen model.

## Anti-patterns

| Anti-pattern                          | Failure                                  | Better approach                                    | Narrow exception                      |
| ------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| “I/O-bound => virtual threads”        | blocker/protocol/resource bounds ignored | classify calls, target support, concurrency budget | controlled blocking service           |
| Bigger pool for latency               | queues/saturation amplify                | locate wait and size/admit from capacity           | measured underutilized local executor |
| Async means faster                    | scheduling/context/error cost added      | choose for ownership/composition semantics         | callback adaptation                   |
| Reactive because blocking is obsolete | complexity without stream demand need    | virtual-thread/synchronous style or bounded queue  | genuine demand-driven pipeline        |
| Pool as downstream limiter            | limiter disappears on migration          | explicit resource-local admission control          | executor is the resource itself       |
| Fire-and-forget                       | orphan failure/work/leak                 | owned lifecycle and result policy                  | bounded best-effort telemetry         |

## References

- [Choosing a construct](references/choosing-a-construct.md)
- [Concurrency versus parallelism](references/concurrency-vs-parallelism.md)
- [Java concurrency API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [JLS 17: Threads and locks](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP index](https://openjdk.org/jeps/0)
