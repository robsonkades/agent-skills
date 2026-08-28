---
name: completablefuture-composition
description: >
  CompletableFuture as a dependency graph of stages: which thread each stage actually runs
  on, the common pool as a silent default that changes with core count, thenApply versus
  thenCompose, exceptionally versus handle versus whenComplete, the CompletionException
  wrapper that breaks type matching, and what allOf and anyOf do and do not promise. Use
  when a chain runs on a client library's I/O thread, when a stage blocks on the common
  pool, when an exception disappears from a chain nobody joined, when catch or exceptionally
  matches a type and never fires, when allOf is expected to fail fast or to return results,
  when anyOf is expected to mean first success, when MDC or trace context is empty inside a
  stage, or when a fan-out over CompletableFuture has no concurrency limit. Not stopping the
  underlying work (cancellation-and-interruption), scoped fan-out (structured-concurrency),
  the pool underneath (forkjoinpool-and-work-stealing), or choosing an async style
  (java-concurrency).
---

# CompletableFuture Composition

## Purpose

Use `CompletableFuture` where it is genuinely the right shape — a graph of dependent
asynchronous stages whose values arrive by callback — and make the two things it hides
explicit: **which thread runs each stage**, and **where each failure terminates**.

The failure this prevents is the chain that works in every test and, in production, runs
application logic on a Netty I/O thread, swallows an exception into a future nobody joins,
and fans out unboundedly to a downstream that then falls over.

## Workflow

1. **Check the shape before the API.** Independent calls joined at the end are a fan-out:
   `StructuredTaskScope` or plain submissions on a virtual-thread executor express that
   with lifetime guarantees `CompletableFuture` does not have. `CompletableFuture` earns
   its place when stages genuinely depend on each other, or when the value is delivered by
   a callback-based client with no blocking API.
2. **Pass an executor to every `*Async` stage.** The no-executor overloads inherit a
   default that depends on the machine.
3. **Name the terminal for every branch.** A chain that is never joined and has no
   `exceptionally`/`handle` is a place where exceptions go to be forgotten.
4. **Bound it.** `orTimeout` for the caller, a request-level timeout for the work, and an
   explicit concurrency limit for any fan-out.
5. **Re-establish context deliberately.** Logging MDC, trace context and security context
   do not cross a stage boundary on their own.
6. **Read the chain back as a graph.** If you cannot say which stages run concurrently and
   which are ordered, neither can the next reader — that is the point at which the chain
   should become structured code.

## Rules

- The default executor for `*Async` with no executor argument is
  `ForkJoinPool.commonPool()` — but only "if it supports more than one parallel thread",
  otherwise **one new thread per async task**. Common-pool parallelism is
  `availableProcessors() - 1`, so a container with one or two CPUs silently gets
  thread-per-stage behaviour that a developer's laptop never reproduces.
- The **non**-`Async` variants (`thenApply`, `thenAccept`, `thenCombine`) run on whichever
  thread completed the previous stage — the caller's thread if it was already complete, or
  the I/O thread of the client that completed it. Doing blocking or expensive work there
  runs it on someone else's event loop.
- `thenApply` maps a value; `thenCompose` flattens a stage that returns another stage.
  `thenApply` with a function returning `CompletableFuture` type-checks and yields
  `CompletableFuture<CompletableFuture<T>>`, which then completes as soon as the _outer_
  stage does — a future that is "done" before the work is.
- Exceptions are wrapped. `join()` throws `CompletionException`; `get()` throws
  `ExecutionException`; the throwable handed to `exceptionally`/`handle` is usually the
  wrapper, not the original. **Always unwrap** before matching on a type — an
  `instanceof TimeoutException` test against the wrapper never fires, and the fallback that
  depended on it never runs.
- `whenComplete` observes; it does not transform. The returned stage carries the original
  result and the original exception. Use `handle` to recover and `exceptionally` to
  substitute; use `whenComplete` for logging and metrics only.
- `allOf` returns `CompletableFuture<Void>`: it **collects no results** and **does not fail
  fast** — it settles only when every input has settled. Results come from joining each
  input afterwards, which is safe only because they are all complete by then.
- `anyOf` completes on the first stage to **settle**, success or failure. It is "first
  answer", not "first success"; the racing-for-a-successful-result semantics people expect
  is `StructuredTaskScope` with `anySuccessfulOrThrow`, or `exceptionally`-guarded inputs.
- `CompletableFuture` has no concurrency limit of its own. `list.stream().map(x ->
supplyAsync(() -> call(x), pool))` starts every call the pool will accept; the bound has
  to be the executor's, or a semaphore, or the batch size — chosen, not inherited.
- Blocking inside a stage that runs on the common pool blocks a worker shared with parallel
  streams and every other library that uses it. Give blocking work its own executor.
- Cancellation does not work the way the method name suggests:
  `CompletableFuture.cancel(true)` never interrupts and the supplier runs to completion. See
  `cancellation-and-interruption`.
- A stack trace from inside a stage does not contain the code that built the chain. Capture
  the identifying context (request id, key) into the stage's own logging at submission time,
  or the failure will be unattributable.
- Virtual threads do not make `CompletableFuture` obsolete, and do not make it better
  either: a callback-driven client still needs a future to represent a value that has not
  arrived. What they remove is the reason to use it for _ordinary blocking calls_.

## References

- [Composition recipes](references/composition-recipes.md) — fan-out with typed results,
  bounded fan-out, timeout with fallback, wrapping a callback API, sequential composition
  and the unwrap helper. Read when writing a chain.
- [Executors, exceptions and context](references/pitfalls-and-executors.md) — the
  thread-affinity table for every stage variant, the exception-wrapping table, what `allOf`
  and `anyOf` really promise, propagating MDC and trace context, and the point at which a
  chain should be rewritten as structured code. Read when reviewing an existing chain or
  diagnosing one.
