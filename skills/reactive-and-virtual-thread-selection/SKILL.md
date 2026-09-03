---
name: reactive-and-virtual-thread-selection
description: >
  Choosing between a reactive pipeline and thread-per-request on virtual threads, and
  deciding where they legitimately coexist: what each model actually gives you, where
  backpressure comes from in each, memory per in-flight request versus per idle connection,
  the diagnosability difference, and the framework configuration that decides which model a
  request runs under. Use when a team proposes migrating away from WebFlux or towards it,
  when virtual threads are described as making reactive obsolete, when a blocking call is
  about to be added to a reactive pipeline, when spring.threads.virtual.enabled is being
  turned on, when Quarkus RunOnVirtualThread is applied per endpoint, or when both models
  exist in one service and nobody can say which runs what. Not what blocks a carrier
  (blocking-and-nonblocking-io), demand and overflow (reactive-backpressure), the migration
  programme (virtual-thread-migration), or thread costs and sizing
  (thread-sizing-and-virtual-threads).
---

# Reactive and Virtual Thread Selection

## Purpose

Turn "which model?" into a decision with named criteria, evidence and a stated cost, instead
of a preference. Both models are correct engineering for different problems, and the answer
for one endpoint is frequently not the answer for the one next to it.

The failures this prevents are symmetrical: rewriting a working reactive streaming service
into blocking code because virtual threads arrived, and adding a blocking call to a reactive
pipeline because the deadline was tight.

## Workflow

1. **Describe the workload, not the framework.** Request/response or a long-lived stream?
   Bounded work per request or unbounded? I/O-bound or CPU-bound? Thousands of active
   requests or millions of mostly-idle connections?
2. **Find where the bound already comes from.** In a reactive pipeline it is demand plus the
   schedulers' capacities; in thread-per-request it used to be the pool. If a migration
   removes one, name its replacement before the migration, not after.
3. **Price the migration honestly.** Rewriting a working pipeline costs the rewrite, the
   regression risk and a period of two models — against a benefit that is usually
   diagnosability rather than throughput.
4. **Decide per boundary, not per service.** A streaming endpoint and a CRUD endpoint in the
   same application can legitimately use different models; what must not vary is which one
   a given path uses.
5. **Configure the framework explicitly** and write down which requests run where. The most
   common production surprise is a framework default that nobody chose.
6. **Verify with load, not with reasoning.** Concurrency, tail latency and memory at the
   target connection count settle this; a benchmark of a hello-world endpoint settles
   nothing.

## Decision rules

```text
Long-lived stream where the consumer can be slower than the producer
  (SSE, WebSocket fan-out, Kafka pipeline, database cursor to network)
        → reactive. Demand signalling is the feature, and it has no equivalent
          in blocking code beyond "the socket eventually pushes back".

Time-shaped composition: window, debounce, sample, buffer-with-timeout,
groupBy over a live stream
        → reactive. These operators are the reason the library exists.

Request/response with blocking clients (JDBC, most SDKs, existing code)
        → virtual threads. Thread-per-request with a real stack, ordinary
          try/catch, and a stack trace that names the request.

Millions of mostly-idle connections on one process
        → measure. A parked virtual thread's stack is heap and a reactive
          subscription has its own operator/context state. Either can decide
          machine size at high cardinality; no universal crossover exists.

CPU-bound work
        → bound parallelism near available CPU. Either API can orchestrate it,
          but virtual-thread cardinality and reactive demand do not add cores;
          compare a fixed pool, ForkJoinPool, batching and vectorisation.

An existing reactive system that works, with a team that understands it
        → keep it. "Virtual threads exist" is not a defect report.

A new service, blocking dependencies, ordinary request/response
        → virtual threads are a strong default candidate when the framework,
          libraries and team support them. Retain reactive when end-to-end
          demand, existing investment or streaming composition outweighs it.
```

## Rules

- Virtual threads do not make reactive programming obsolete. They remove **one** of its
  motivations — avoiding a thread per blocking call — and leave the others: demand-driven
  flow control, time-based operators, and composition over asynchronous event sources.
- Reactive programming does not automatically give backpressure. It gives a **protocol** for
  it, which several common operators break: unbounded `onBackpressureBuffer`, `publishOn`
  with an oversized queue, `flatMap` with a large concurrency, any `Sinks` variant with an
  unbounded buffer. See `reactive-backpressure`.
- Thread-per-request has backpressure only where a bounded resource exists. Under a platform
  pool that was the pool; under virtual threads it must be declared explicitly
  (`concurrency-limiting-and-bulkheads`).
- Blocking on an event-loop/non-blocking scheduler combines the models' failure modes: it
  stalls a thread serving many connections. A reactive client called from a virtual thread
  is not inherently pointless; make one deliberate conversion at the boundary and avoid
  alternating `block`/resubscribe layers down the call graph.
- The models expose different diagnostic evidence. A thread-per-request dump often preserves
  a request stack; an asynchronous pipeline usually requires assembly checkpoints,
  correlation context, scheduler metrics and traces because no thread owns the request for
  its whole lifetime.
- Neither model changes the downstream. A connection pool of 20, a vendor quota of 600
  requests per minute, or a database that saturates at 4 000 IOPS bound both identically.
  Migrations that report a 10× improvement usually moved the queue, not the ceiling.
- A mixed codebase is acceptable; an _undocumented_ mixed codebase is not. Every endpoint
  should have a stated model, and the boundary between them should be one place where the
  handoff is explicit.
- Framework behaviour is not platform behaviour. `spring.threads.virtual.enabled`,
  `@RunOnVirtualThread` and Helidon's virtual-thread server are decisions those projects
  made; none of them is something "Java does". State which layer a claim belongs to.
- Do not benchmark the model. Benchmark the service, with the real dependencies, at the real
  concurrency, measuring tail latency and memory — the models differ least in throughput and
  most in the shape of failure under overload.

## References

- [The comparison, dimension by dimension](references/decision-matrix.md) — the full matrix
  with an honest column for each model, memory arithmetic per in-flight request and per idle
  connection, backpressure sources, failure modes under overload, and the hybrid designs that
  work. Read when the decision is genuinely open, or when writing it up for a team.
- [Framework execution models](references/framework-execution-models.md) — exactly which
  Spring, Quarkus, Jakarta and Helidon settings put a request on which kind of thread, what
  each one silently unbounds, and how to verify at runtime which model a request actually
  ran under. Read before changing a framework flag or reviewing one.
