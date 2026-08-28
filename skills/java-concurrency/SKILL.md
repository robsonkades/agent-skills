---
name: java-concurrency
description: >
  Entry point for modern Java concurrency: turn a requirement or a symptom into the one
  construct or investigation that fits it, and hand off to the skill that owns it. Covers
  the classification that decides everything downstream — concurrency versus parallelism,
  I/O-bound versus CPU-bound, request-scoped versus long-lived — and routes to executors,
  virtual threads, structured concurrency, scoped values, CompletableFuture, reactive
  pipelines, limits, diagnostics and testing. Use when designing concurrent code and the
  construct is not yet decided, when someone proposes replacing every executor with virtual
  threads, when "add more threads" is offered as a fix, when a concurrency symptom arrives
  without a cause, or when two skills in this family seem to give different advice. Does not
  itself cover any construct in depth, the sizing arithmetic
  (littles-law-and-queueing), correctness and happens-before (java-memory-model), or general
  JVM performance triage (java-performance).
---

# Java Concurrency

## Purpose

Be the first skill a concurrency question reaches and the first to hand off. Its job is
classification: take a requirement or a symptom, ask the two or three questions that separate
the candidates, and name the skill that owns the rest.

The failure it prevents is the decision made by fashion — a `CompletableFuture` chain because
async sounds fast, virtual threads because they are new, a reactive rewrite because a
conference talk said blocking is dead. Each of those is right for some workload and wrong for
most.

## The classification that decides everything

```text
1. Is the work I/O-bound or CPU-bound?
     I/O-bound  → concurrency helps; virtual threads make it cheap
     CPU-bound  → only parallelism helps, and the ceiling is the core count

2. Is the work request-scoped or long-lived?
     Request-scoped → structured concurrency; the lifetime is the block
     Long-lived     → an executor with its own lifecycle; not a scope

3. Is it a value that arrives, or a stream that keeps arriving?
     A value  → blocking call, or a future if the client is callback-only
     A stream → demand control; reactive, or a bounded queue with a consumer

4. What is the scarce resource, and what bounds it?
     If the answer is "the thread pool", the bound disappears the moment
     that pool does. Name its replacement before removing it.
```

Question 1 is the one most often skipped, and it invalidates the most work when wrong:
**concurrency is not parallelism.** More concurrency on CPU-bound work adds scheduling
overhead and no throughput.

## Routing table

| Requirement or symptom                                        | Owning skill                            |
| ------------------------------------------------------------- | --------------------------------------- |
| Run tasks; configure or fix an executor                       | `executors-and-task-lifecycle`          |
| Choose a pool size, or latency is high while CPU is low       | `littles-law-and-queueing`              |
| Thread-per-request at high concurrency, blocking clients      | `thread-sizing-and-virtual-threads`     |
| Fan out inside one request and join the results               | `structured-concurrency`                |
| Carry request context to callees and subtasks                 | `scoped-values`                         |
| Compose dependent asynchronous stages, or wrap a callback API | `completablefuture-composition`         |
| CPU-bound recursive decomposition, parallel streams           | `forkjoinpool-and-work-stealing`        |
| Stop work that is already running                             | `cancellation-and-interruption`         |
| Bound how long a call may take                                | `timeouts-and-deadlines`                |
| Bound how much runs at once; protect a dependency             | `concurrency-limiting-and-bulkheads`    |
| A stream whose consumer can be slower than its producer       | `reactive-backpressure`                 |
| Decide between reactive and thread-per-request                | `reactive-and-virtual-thread-selection` |
| "Is this call blocking?" — and what it does to the carrier    | `blocking-and-nonblocking-io`           |
| Adopt virtual threads in an existing service                  | `virtual-thread-migration`              |
| Pinning, carriers, the virtual-thread scheduler               | `virtual-threads-internals`             |
| Nothing progresses; a dump must be read                       | `concurrency-diagnostics`               |
| Intermittent wrong results under concurrency                  | `java-memory-model`                     |
| Threads BLOCKED on a monitor                                  | `lock-inflation`                        |
| CAS loops, striping, lock-free structures                     | `lock-free-patterns`                    |
| Test any of the above                                         | `concurrency-testing`                   |
| Measure whether a change helped                               | `jmh-microbenchmarks`, `load-testing`   |

## Rules

- **Classify before choosing.** I/O-bound or CPU-bound, request-scoped or long-lived, value
  or stream, and what the scarce resource is. Four answers determine the construct; the
  construct rarely determines itself.
- **Concurrency is not parallelism.** Concurrency is how many things are in progress;
  parallelism is how many are executing at once. Virtual threads raise the first cheaply and
  do nothing for the second.
- **Every concurrent design needs a stated bound**, and it must sit next to the scarce
  resource rather than at the edge of the application. If nobody can name the bound, the
  bound is the heap.
- **No construct here fixes a slow dependency.** More concurrency against a saturated
  downstream lengthens its queue. Check where the time is going before choosing anything.
- **Prefer the construct that keeps the lifetime visible.** Between two options with similar
  performance, the one whose task lifetimes are bounded by a block will be cheaper to operate
  for years.
- **Do not stay in this skill once the class is known.** Its content stops being useful at the
  hand-off, and the specialist carries the depth, the version accuracy and the diagnostics.
- **Version claims belong to the specialist skills**, and they matter more here than in most
  areas: virtual threads are final since 21, `synchronized` stopped pinning in 24, scoped
  values are final since 25, and structured concurrency is still preview in every released
  JDK. Do not assert any of these from memory during a design discussion.
- **Two skills that seem to disagree are usually answering different questions.** Check
  whether one is about the platform and the other about a framework, or one about the
  mechanism and the other about the policy, before treating it as a contradiction.

## References

- [Choosing a construct](references/choosing-a-construct.md) — the decision guide from
  requirement to construct, with the exceptions and trade-offs for each, and the constructs
  that are commonly chosen for the wrong reason. Read when designing, or when reviewing a
  design that has already picked one.
- [Concurrency versus parallelism](references/concurrency-vs-parallelism.md) — the
  distinction with the Java specifics, classifying a workload with evidence, why raising
  concurrency stops helping, and what throughput, latency and tail latency each respond to.
  Read when "add more threads" is on the table, or when a change raised concurrency and not
  throughput.
