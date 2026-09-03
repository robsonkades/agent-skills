---
name: completablefuture-composition
description: >
  Design and diagnose CompletionStage graphs with explicit execution, ownership, failure,
  timeout, cancellation, context and admission semantics. Use when a continuation runs on an
  I/O thread, a branch failure disappears, allOf or anyOf has the wrong policy, a timeout leaves
  work running, or asynchronous fan-out overloads a dependency. Distinguishes Java 17/21 APIs
  from Java 25 preview structured-concurrency alternatives.
---

# CompletableFuture Composition

## Purpose

Treat a `CompletableFuture` as a graph of completion dependencies, not as a lighter thread. The
graph is correct only when every edge has an execution policy, every branch has an outcome owner,
and the caller's deadline is connected to the underlying operation.

This skill owns stage composition. Cancellation mechanics belong to
`cancellation-and-interruption`; worker scheduling to `forkjoinpool-and-work-stealing`; lexical
fork/join lifetimes to `structured-concurrency`.

## Investigation workflow

1. Draw nodes and edges: creation, completion, dependent stages, fan-out and terminal observation.
2. For each action, identify the executor allowed to run it. Do not infer a thread from a method
   name or a test run.
3. State outcome policy: propagate, recover, observe, aggregate, race, or tolerate partial failure.
4. Separate caller timeout, operation timeout and cancellation. They are different mechanisms.
5. Bound admission at the scarce resource, not merely the number of executor workers.
6. Capture and restore observability/security context explicitly.
7. Test adversarial orderings: inputs already complete, simultaneous failures, rejection, timeout,
   cancellation and callback duplication.

## Execution contracts

| Form                         | Contract                                                                         | Engineering consequence                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| non-`Async` dependent method | action may run in the completing thread or another caller of a completion method | it may execute inline on an event loop, request thread, test thread, or application completer                                                                         |
| `*Async` without executor    | uses the stage's default async facility                                          | ordinary `CompletableFuture` uses the common pool when it supports parallelism > 1, otherwise a thread-per-task executor; subclasses may override `defaultExecutor()` |
| `*Async(..., executor)`      | arranges execution through that executor                                         | rejection, queuing and actual concurrency are still properties of the supplied executor                                                                               |

Use a non-`Async` stage only for small, non-blocking, non-reentrant transformations that are safe on
any completing thread. Use an explicit executor when isolation, context, blocking behavior or
capacity matters. Passing an executor specifies _where submission goes_; it does not promise a new
thread or concurrent execution.

Do not derive the common pool from `availableProcessors() - 1` as an invariant. Active processor
count, common-pool properties, embedding and implementation version can change it. Record effective
pool configuration in the environment being diagnosed.

## Composition and outcome semantics

- `thenApply` maps `T -> U`; `thenCompose` flattens `T -> CompletionStage<U>`.
- A dependent stage that requires normal completion is skipped when its source fails and propagates
  exceptional completion, commonly represented by a `CompletionException`.
- `exceptionally` recovers from failure with a value; `exceptionallyCompose` recovers with another
  stage; `handle` maps either outcome; `whenComplete` observes either outcome.
- `whenComplete` is not outcome-neutral if its action throws. It replaces a successful source with
  its own failure; when both source and action fail, the source failure has precedence.
- A handler's `Throwable` is not guaranteed to be either wrapped or unwrapped. Direct
  `completeExceptionally(x)`, dependent propagation, `join()` and `get()` have different surfaces.
  Normalize only known transport wrappers at the boundary where type-based policy is needed.
- `allOf` completes after all supplied futures complete, returns `Void`, and is not a fail-fast
  cancellation policy. Joining the inputs after successful `allOf` cannot block, but results and
  failure aggregation remain application policy.
- `anyOf` exposes the first normal or exceptional completion as `Object`. It is neither typed nor
  “first success,” and it does not cancel losers.
- Empty inputs matter: `allOf()` is already normally complete; `anyOf()` remains incomplete.

If several inputs fail, do not promise which cause an aggregate exposes unless the application
records each branch itself. If partial results matter, turn each branch into an explicit success or
failure value rather than erasing errors into `Optional.empty()`.

## Time, cancellation and ownership

`orTimeout` and `completeOnTimeout` mutate and return the same `CompletableFuture`. They race to
complete that representation; they do not establish a network, JDBC or file-system deadline and do
not stop the supplier. A late operation may still consume a connection and produce side effects
after callers have degraded.

For each operation define:

- the end-to-end deadline and remaining budget passed downstream;
- the provider-specific connect/read/request/query timeout;
- whether cancellation is supported and whether it is best effort;
- whether a late success is harmless, deduplicated, compensated or an unknown outcome;
- which component observes terminal failure and records it exactly once.

`cancel(true)` completes a `CompletableFuture` exceptionally with cancellation semantics; the
`mayInterruptIfRunning` flag has no effect in this implementation. It is not proof that a supplier
or remote request stopped.

## Fan-out and admission

Creating 100,000 futures creates 100,000 graph nodes even when only 32 workers execute. A bounded
worker pool limits simultaneous worker execution but can still accept an enormous queue; an
unbounded virtual-thread executor limits neither admission nor dependency pressure.

Choose the bound from the protected resource: downstream quota, connection pool, partition, memory
budget or latency SLO. Acquire interruptibly before launching the scarce operation, release in
`finally`, and define what happens when admission exceeds its budget. Batch/windowed production can
bound both live graph size and downstream concurrency.

## Context and security

Thread-local MDC, tracing state, authentication context and transaction state do not automatically
follow arbitrary completion edges. Capture only safe immutable context, restore it around the
action, and close/clear it in `finally` because pool threads are reused. Prefer the instrumentation
library's executor/stage wrapper over a bespoke copier. Never propagate a transaction/session object
to concurrent stages unless its API explicitly permits concurrent use.

## Decision guide

Prefer `CompletableFuture` when:

- adapting a callback API with exactly-once completion control;
- publishing an API whose contract already is `CompletionStage`;
- representing a genuinely dynamic, non-lexical dependency graph.

Prefer ordinary blocking code on virtual threads when the graph only compensates for expensive
platform threads and lexical control flow improves cancellation and debugging. For Java 25,
`StructuredTaskScope` joiners can express all-success or first-success policies, but the API is
preview and requires preview enablement; do not present it as a Java 21 production-stable API.

Avoid a stage graph when nobody can identify the owner that waits, observes failure and ends the
lifetime of every branch.

## Production signals

Measure accepted/rejected work, live graph count, stage latency by operation, executor queue and
active workers, timeout/cancellation/late-completion counts, dependency concurrency, and terminal
failure by cause. Executor metrics are snapshots and graph-dependent counts are diagnostic estimates,
not a linearizable accounting system.

### Symptom-driven diagnosis

| Symptom                                | Distinguish with                                               | Likely remediation                                               |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| event loop stalls                      | thread dump plus stage/executor attribution                    | move blocking or expensive continuation to an explicit executor  |
| caller timed out but load keeps rising | compare caller timeout with client active requests/connections | enforce provider deadline and bound admission                    |
| fallback did not match                 | inspect the actual cause chain and completion path             | unwrap only known wrappers; test direct and dependent failure    |
| aggregate waits after an early failure | inspect `allOf` policy and remaining branches                  | use explicit short-circuit/cancellation ownership where required |
| memory rises during fan-out            | count live futures, queued tasks and input cardinality         | process bounded windows rather than constructing the whole graph |
| missing trace/user context             | compare captured context at submission and execution           | use supported context propagation and guaranteed cleanup         |

## Review checklist

- [ ] Every `*Async` edge has an intentional executor or a documented safe default.
- [ ] Every non-`Async` action is safe inline on any completer.
- [ ] Every branch has a terminal observer and outcome policy.
- [ ] Deadlines reach the underlying client; timeouts are not mistaken for cancellation.
- [ ] Admission protects the actual scarce resource and bounds live graph size.
- [ ] Empty input, null result, rejection, duplicate callback and simultaneous failure are tested.
- [ ] Context is restored and cleared; mutable sessions/transactions are not shared unsafely.
- [ ] Version-dependent preview alternatives are labelled.

## References

- [Composition recipes](references/composition-recipes.md)
- [Executors, failures and context](references/pitfalls-and-executors.md)
- [Java 25 `CompletableFuture` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 25 `CompletionStage` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
