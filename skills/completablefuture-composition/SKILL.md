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
fork/join lifetimes to `structured-concurrency`; executor shutdown and rejection design to
`executors-and-task-lifecycle`.

## Investigation workflow

The composition snippets use Java 17 final APIs unless labelled otherwise; ordinary virtual
threads require Java 21+, and the Java 25 structured-concurrency alternative is preview.
Inspect compiler release/toolchains, deployed JDK, resolved client/context libraries and actual
executor configuration before applying a recipe. Do not upgrade Java, enable preview or add
dependencies just to match a snippet. If graph ownership or client completion semantics are
missing, request that evidence and keep the proposed fix conditional.

1. Follow the caller-visible result to the actual factory/client, continuations and terminal
   observer in the repository. Sketch the connected graph, including recovery and discarded
   dependent results; identify concrete stage classes and executor/context wrappers from their
   construction and configuration. A similar chain elsewhere is not evidence of this path.
2. For each action, distinguish registration, submission and execution, and identify its executor.
   An executor supplied to one edge is not a policy inherited by the rest of a base future's graph.
   Do not infer a thread from a method name or a test run.
3. State outcome policy: propagate, recover, observe, aggregate, race, or tolerate partial failure.
4. Separate caller timeout, operation timeout and cancellation. They are different mechanisms.
5. Bound admission at the scarce resource, not merely the number of executor workers.
6. Identify whose observability/security context the action needs, capture it at the corresponding
   boundary, and restore the worker's previous context. Deferred submission can occur after the
   requesting scope has ended; an executor wrapper alone may capture the completer's context.
7. Test adversarial orderings: inputs already complete, simultaneous failures, rejection, timeout,
   cancellation and callback duplication.

## Execution contracts

| Form                         | Contract                                                                         | Engineering consequence                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| non-`Async` dependent method | action may run in the completing thread or another caller of a completion method | it may execute inline on an event loop, request thread, test thread, or application completer                                                                           |
| `*Async` without executor    | uses the stage's default async facility                                          | base Java 17/21 futures use a thread-per-task fallback at low common-pool parallelism; OpenJDK 25 uses the common pool. Subclasses may override `defaultExecutor()`     |
| `*Async(..., executor)`      | normally submits through the supplied executor                                   | rejection, queuing and actual concurrency depend on the executor; Java 17/21 can substitute the fallback even for an explicitly supplied common pool at low parallelism |

Use a non-`Async` stage only for small, non-blocking, non-reentrant transformations that are safe on
any completing thread. Use an explicit executor when isolation, context, blocking behavior or
capacity matters. An explicit executor does not by itself promise a new thread or concurrent
execution.

For base futures, `supplyAsync(load, ioExecutor).thenApplyAsync(render)` runs `render` through the
default facility, not necessarily `ioExecutor`. Supply the executor at each edge needing that policy.
For subclasses, inspect `defaultExecutor()` and `newIncompleteFuture()` instead of assuming either
inheritance or loss of the custom policy; see the executor reference for the matching API/source.

Require a visible outcome when scheduling fails. A silently discarded task can leave its future
incomplete; `exceptionally` cannot recover a failure that never completes the stage. Inspect the
rejection handler and shutdown state, and keep an owned executor available for dependents that
will only be submitted when their inputs complete. Read the executor reference before changing
that lifecycle; constructing the graph does not submit every future action.

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
- `applyToEither`, `acceptEither` and `runAfterEither` are not guaranteed first-success policies
  either: when one input fails, `CompletionStage` permits normal or exceptional completion of
  the dependent stage. Do not replace `anyOf` with an either-method to suppress an early failure.
- Empty inputs matter: `allOf()` is already normally complete; `anyOf()` remains incomplete.
- Do not block a continuation by joining an unfinished sibling on the same bounded executor
  or completer thread. Express that dependency with `thenCombine`/`thenCompose`; completion
  ordering and sibling registration order are not scheduling guarantees.

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

Base `CompletableFuture.cancel(true)` does not interrupt its supplier. Provider futures can add
cancellation behavior: Java 25's default `HttpClient` returns cancelable futures, including derived
ones. Inspect the actual handle; `copy()` is not a universal cancellation-isolation boundary.
Cancellation return value, public exceptional state, actual resource release and remote effects
are separate observations; use `cancellation-and-interruption` for the provider contract.

## Fan-out and admission

Creating 100,000 futures creates 100,000 graph nodes even when only 32 workers execute. A bounded
worker pool limits simultaneous worker execution but can still accept an enormous queue; an
unbounded virtual-thread executor limits neither admission nor dependency pressure.

Choose the bound from the protected resource: downstream quota, connection pool, partition, memory
budget or latency SLO. Acquire interruptibly before launching the scarce operation, release in
`finally` for synchronous work, and define what happens when admission exceeds its budget.
For asynchronous clients, release only when the actual protected operation/resource is terminal,
not when submission returns a stage or a caller-facing timeout completes. Do not perform a
blocking permit acquisition on an event loop; use bounded queuing, nonblocking rejection or an
appropriate submitting worker. Batch/windowed production can
bound both live graph size and downstream concurrency.

## Context and security

Thread-local MDC, tracing state, authentication context and transaction state do not automatically
follow arbitrary completion edges. Capture only safe immutable context, restore it around the
action, and close/clear it in `finally` because pool threads are reused. Prefer the instrumentation
library's executor/stage wrapper over a bespoke copier. Never propagate a transaction/session object
to concurrent stages unless its API explicitly permits concurrent use.

For a request-owned continuation on a pending stage, capture the request context before registering
the action. Check when a wrapper captures context: registration and later `Executor.execute` may
run under different contexts. Use [the deferred-stage example](references/pitfalls-and-executors.md)
when those moments differ, including already-complete and delayed-source checks.

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
- [ ] Rejection and shutdown settle affected results; no required stage can be silently discarded.
- [ ] Every non-`Async` action is safe inline on any completer.
- [ ] Every branch has a terminal observer and outcome policy.
- [ ] Deadlines reach the underlying client; timeouts are not mistaken for cancellation.
- [ ] Admission protects the actual scarce resource and bounds live graph size.
- [ ] Empty input, null result, rejection, duplicate callback and simultaneous failure are tested.
- [ ] Context is restored and cleared; mutable sessions/transactions are not shared unsafely.
- [ ] Version-dependent preview alternatives are labelled.

Report the relevant graph edge, execution/ownership contract, observed outcome and proposed
change with its deterministic ordering/resource test. Mark untested cancellation or latency
guarantees explicitly instead of equating future completion with work termination.

## References

- [Composition recipes](references/composition-recipes.md) — read when implementing branch
  aggregation, permit ownership, caller deadlines or a callback adapter.
- [Executors, failures and context](references/pitfalls-and-executors.md) — read when diagnosing
  thread affinity, rejection/shutdown hangs, exception surfaces, observer failure or lost/leaked
  context; includes decision exercises for these contracts.
- [Java 25 `CompletableFuture` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 25 `CompletionStage` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
