# Executors, exceptions and context

## Which thread runs this stage

| Form                                          | Runs on                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `thenApply(f)` — source already complete      | the **calling** thread, synchronously, inside the `thenApply` call       |
| `thenApply(f)` — source completes later       | the thread that **completed the source** (often a client's I/O thread)   |
| `thenApplyAsync(f)`                           | `ForkJoinPool.commonPool()`, or a new thread per task if parallelism < 2 |
| `thenApplyAsync(f, exec)`                     | `exec` — the only form whose answer does not depend on the machine       |
| `supplyAsync(s)`                              | same default as `thenApplyAsync(f)`                                      |
| `whenComplete` / `exceptionally` (no `Async`) | same rule as `thenApply`: caller or completer                            |

Two consequences that produce real incidents:

- **The common pool's parallelism is `availableProcessors() - 1`**, floored at 1, and
  `defaultExecutor()` uses the common pool only "if it supports more than one parallel
  thread". A container limited to **one or two** CPUs therefore gets **one new platform
  thread per async stage**. A service that behaves like a bounded pool on a developer's
  10-core laptop behaves like an unbounded thread factory in production, and the CPU limit
  that caused it is nowhere near the code.
- **A non-`Async` stage after a network client runs on that client's event loop.** Blocking
  there — a JDBC call, a lock, a synchronous HTTP call — stalls every other connection that
  loop serves. This is the single most damaging `CompletableFuture` mistake, and it is
  invisible in a test with one request.

## Exception plumbing

| Method                      | Sees success | Sees failure | Can change the result        |
| --------------------------- | ------------ | ------------ | ---------------------------- |
| `exceptionally(fn)`         | no           | yes          | yes — substitutes a value    |
| `handle((v, t) -> …)`       | yes          | yes          | yes — maps both outcomes     |
| `whenComplete((v, t) -> …)` | yes          | yes          | **no** — passes both through |
| `exceptionallyCompose(fn)`  | no           | yes          | yes — substitutes a _stage_  |

`whenComplete` is for logging and metrics. If the action itself throws and the source had
completed normally, the returned stage completes exceptionally with that new throwable —
so an unguarded logging call can convert a success into a failure.

### The wrapper

```text
join()          throws CompletionException  wrapping the cause
get()           throws ExecutionException   wrapping the cause
exceptionally   usually receives CompletionException, not the cause
```

Type matching without unwrapping is a fallback that never fires and a metric that never
increments, with no error to indicate it. Use the `unwrap` helper from
`references/composition-recipes.md` in every handler that inspects a type.

## What `allOf` and `anyOf` promise

| Method  | Completes when                          | Value    | Fails fast | Common misreading                      |
| ------- | --------------------------------------- | -------- | ---------- | -------------------------------------- |
| `allOf` | **every** input has settled             | `Void`   | no         | "it aggregates results" — it does not  |
| `anyOf` | the **first** input settles, either way | `Object` | n/a        | "first success" — it is first _answer_ |

`anyOf` returning the first failure is the trap. A hedged request built on `anyOf` returns
the error from the fastest-failing replica, which is usually the one that was already
broken. The construct that means "first successful result, cancel the rest" is
`StructuredTaskScope.open(Joiner.anySuccessfulOrThrow())`.

## Context does not cross a stage boundary

MDC, `SecurityContextHolder`, an OpenTelemetry `Context` and any `ThreadLocal` belong to the
thread, and a stage may run on a different one. `ScopedValue` does not help either: its
binding is scoped to the dynamic extent of the `run`/`call` that established it, so a stage
executed later on a pool thread is outside it.

Capture at build time and re-establish inside the stage:

```java
Map<String, String> mdc = MDC.getCopyOfContextMap();          // captured on the caller
Context otel = Context.current();

CompletableFuture.supplyAsync(() -> {
    MDC.setContextMap(mdc == null ? Map.of() : mdc);
    try (Scope ignored = otel.makeCurrent()) {
        return work();
    } finally {
        MDC.clear();                                          // pool threads are reused
    }
}, pool);
```

Clearing in `finally` is not optional on a pooled thread: a leftover MDC attributes the next
request's logs to the previous request's user. Micrometer's
`ContextSnapshot`/`ContextExecutorService` and OpenTelemetry's `Context.taskWrapping`
automate exactly this wrapping; prefer them to hand-rolled copies once more than one context
type is involved.

## Diagnosing a chain

- A stack trace inside a stage starts at the pool worker. The code that constructed the
  chain is not on it. Log the correlating identity (request id, key) from inside the stage,
  or accept that failures will be unattributable.
- `CompletableFuture.toString()` reports `Completed normally`, `Completed exceptionally` or
  `Not completed`, plus the number of dependents — enough to tell "stuck" from "failed" when
  a chain hangs.
- A thread dump of a hung chain shows workers parked in `ForkJoinPool.awaitWork` and the
  caller in `CompletableFuture.waitingGet`. That pattern means "nothing completed the
  future", which is nearly always a callback path that returns without completing it.
- Time each stage rather than the whole chain. A chain that takes 900 ms tells you nothing;
  per-stage timers tell you which two stages were accidentally serialised.

## When to stop using it

Rewrite the chain as structured, blocking code on virtual threads when any of these is true:

- The chain exists only to avoid blocking a thread — virtual threads removed that reason.
- Nobody can state, from the code, which stages run concurrently.
- Failure of one branch should abandon the others, and `allOf` cannot express it.
- Cancellation has to actually stop work rather than release the caller.
- The debugging cost has become the dominant cost of changing the code.

Keep it where it still fits: wrapping a callback-only client, a genuinely long-lived
dependency graph assembled dynamically, and any API whose published contract already returns
`CompletionStage`.
