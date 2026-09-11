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

## Compatibility and evidence

Inspect the project's compiler/runtime, resolved framework versions, server and executor
configuration before choosing a model. Virtual threads are final in Java 21; this does not
authorize a runtime upgrade or a stack rewrite. `StructuredTaskScope` is version-specific
preview API on Java 21–25, not a prerequisite for thread-per-request. JDK 24's JEP 491 removes
monitor-related pinning in HotSpot; remaining blocking and pinning depend on the operation
and runtime. Route their diagnosis to `blocking-and-nonblocking-io`.

If workload, limits or runtime evidence are missing, keep the choice conditional and name
the observation needed. Preserve existing streaming, ordering, cancellation and transaction
contracts while comparing alternatives.

## Workflow

Use the steps relevant to the requested decision. Reuse adequate configuration, source and
runtime evidence; a narrow explanation or justified no-change review does not require a
new migration, full endpoint inventory or load campaign. Separate what configuration
selects from what an observed invocation actually did.

1. **Describe the workload, not the framework.** Request/response or a long-lived stream?
   Bounded work per request or unbounded? I/O-bound or CPU-bound? Thousands of active
   requests or millions of mostly-idle connections?
2. **Find where the bound already comes from.** Inspect demand, operator concurrency, scheduler queues and admission separately;
   a platform pool bounds executing tasks but may leave an unbounded queue. If a migration
   removes a required property, establish an equivalent control before the migration. An
   existing aggregate gate may suffice; document a justified removal of a redundant bound.
3. **For a proposed migration, price it honestly.** Rewriting a working pipeline costs the rewrite, the
   regression risk and a period of two models — against measured benefits in this service, including diagnosability, capacity and latency.
4. **Decide per boundary, not per service.** A streaming endpoint and a CRUD endpoint in the
   same application can legitimately use different models. One request can cross an
   intentional handoff with stated execution, context and lifetime contracts.
5. **Inspect effective framework configuration** for the affected paths; change it only
   when the decision requires it. Defaults and custom executor selection both matter.
6. **Validate the claim at its scope.** Capacity or latency comparisons need representative
   dependencies, demand, concurrency and memory evidence, including overload outcomes.
   A source-level routing explanation needs applicable source/configuration, not a new load test.

## Decision rules

```text
Long-lived stream where the consumer can be slower than the producer
  (SSE, WebSocket fan-out, Kafka pipeline, database cursor to network)
        → reactive is a strong candidate when demand reaches the producer.
          Imperative bounded queues, pull iteration and explicit flow control can
          also work. Check hot sources and transport boundaries: SSE/WebSocket
          do not themselves guarantee application-level demand end to end.

Time-shaped composition: window, debounce, sample, buffer-with-timeout,
groupBy over a live stream
        → reactive operators are useful candidates. Compare composition and
          lifecycle costs; retain an adequate bounded timer/buffer implementation.

Request/response with blocking clients (JDBC, most SDKs, existing code)
        → consider virtual threads on a compatible stack. Thread-per-request with a real stack, ordinary
          try/catch, and a stack for the current task; request correlation and
          child-task ownership still need to be established.

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
  it, but compliance does not imply bounded memory or request admission. Unbounded
  `onBackpressureBuffer` can honor downstream demand while requesting unbounded upstream;
  large `publishOn` queues and `flatMap` concurrency can exhaust a resource without violating
  the protocol. Inspect each `Sinks` variant's actual overflow contract. See `reactive-backpressure`.
- Thread-per-request has backpressure only where a bounded resource exists. A pool or semaphore bounds active work, not necessarily queued requests,
  waiters or bytes. Bound admission and waiting time as well as execution
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
  requests per minute, or a database that saturates at 4 000 IOPS constrains both. Effective
  pressure can differ with hold times, batching, retries and fan-out; compare the actual use.
  A large measured improvement may remove a former bottleneck; distinguish useful completed
  throughput from shifted queues, dropped work and changed latency or correctness.
- A mixed codebase needs discoverable execution and handoff contracts for the affected paths.
  Avoid accidental repeated conversions; an intentional multi-stage boundary can be valid
  when admission, context, transactions and cancellation remain owned.
- Framework behaviour is not platform behaviour. `spring.threads.virtual.enabled`,
  `@RunOnVirtualThread` and Helidon's virtual-thread server are decisions those projects
  made; none of them is something "Java does". State which layer a claim belongs to.
- When comparing performance, benchmark the service with representative dependencies and
  demand, measuring useful throughput, tail latency, errors, retained memory and overload recovery.
  Reuse adequate measurements; a toy model benchmark does not establish a service benefit.
- Changing threads does not propagate a transaction, security identity or Reactor Context
  automatically. State the context carrier and transaction owner at each asynchronous handoff;
  avoid sharing a persistence context across concurrent tasks.

## Deliverable

Return the decision or no-change result, its supporting evidence and relevant limits. For a
changed boundary, record retained contracts, compatible configuration, active/waiting limits,
overflow and applicable validation. Name what would reopen the choice; a small review can
close with a short note and explicit unknowns.

## References

- [The comparison, dimension by dimension](references/decision-matrix.md) — the full matrix
  with an honest column for each model, memory arithmetic per in-flight request and per idle
  connection, backpressure sources, failure modes under overload, and the hybrid designs that
  work. Read when the decision is genuinely open, or when writing it up for a team.
- [Framework execution models](references/framework-execution-models.md) — exactly which
  Spring, Quarkus, Jakarta and Helidon settings put a request on which kind of thread, what
  each one silently unbounds, and how to verify at runtime which model a request actually
  ran under. Read before changing a framework flag or reviewing one.
