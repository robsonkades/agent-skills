---
name: structured-concurrency
description: >
  StructuredTaskScope as a lifetime guarantee for a fan-out: fork, join, close, and the rule
  that no subtask thread outlives the block. Covers the API as it stands on each JDK — still
  a preview API on every released version, renamed between 25 and 26 and changing again in
  27 — the Joiner completion policies, scope timeouts, nesting, and what close actually
  waits for. Use when writing or reviewing a parallel fan-out inside one request, when a
  sibling task keeps running after another failed, when code copied from a blog uses
  ShutdownOnFailure or a StructuredTaskScope constructor, when preview class files fail to
  run on a different JDK, when a scope fails in milliseconds and closes in seconds, or when
  Subtask.get is called before join. Not why cancellation fails to arrive
  (cancellation-and-interruption), context inherited by subtasks (scoped-values), the
  threads underneath (thread-sizing-and-virtual-threads), or callback graphs
  (completablefuture-composition).
---

# Structured Concurrency

## Purpose

Give a concurrent fan-out the same lifetime discipline a method call already has: subtasks
start inside a block, and none of them survives it. That single guarantee is what removes
thread leaks, orphaned work after a failure, and cancellation that never arrives — the
three failures that `ExecutorService` plus `Future` cannot prevent no matter how carefully
they are used.

The second thing this skill exists for is version accuracy. The API has been reshaped in
almost every release, and the examples in circulation do not compile on the current
baseline.

## Workflow

1. **Confirm the JDK first, and the preview cost.** `StructuredTaskScope` is a preview API
   on every released JDK, including 25 (LTS) and 26. It requires `--enable-preview` at
   compile _and_ run time, and preview class files run only on the **exact** JDK version
   that compiled them. Decide whether the deployment can accept that before designing
   around it.
2. **Pick the completion policy, then the joiner.** All must succeed, first success wins,
   collect everything including failures, or stop at a condition — each is a different
   `Joiner`, and the joiner is what `join()` returns.
3. **Write the block in the fixed order**: `open` → `fork` × n → `join` → read results →
   implicit `close`. Reading a `Subtask` before `join` throws; forking from a thread other
   than the owner throws.
4. **Set the timeout on the scope**, not on each subtask, when the bound belongs to the
   whole operation. The scope cancels its subtasks and `join` throws `TimeoutException`.
5. **Check every subtask responds to interruption.** Cancellation is delivered as an
   interrupt and `close` waits regardless — one uninterruptible subtask converts a fast
   failure into a slow one.
6. **Nest deliberately.** A subtask opening its own scope creates a tree with cancellation
   flowing down it; that is the intended way to compose, and it is also how a deadline
   applies to a whole subtree.

## Rules

- **Preview status, precisely**: incubator in 19–20, preview from 21 (JEP 453) through 24
  (JEP 499), reshaped in 25 (JEP 505), sixth preview in 26 (JEP 525), seventh proposed for
  27 (JEP 533). It has never been final in a released JDK. Any claim that structured
  concurrency is "GA in 21" or "final in 25" is wrong.
- The 25 reshape **removed** `StructuredTaskScope.ShutdownOnFailure`,
  `ShutdownOnSuccess` and the public constructors, replacing them with
  `StructuredTaskScope.open(...)` and `Joiner`. Code written before 2025 does not compile —
  it was not renamed, it was deleted.
- **The names changed again in 26**: `allSuccessfulOrThrow()` now returns a `List` of
  results instead of a `Stream` of subtasks, and `anySuccessfulResultOrThrow()` is now
  `anySuccessfulOrThrow()`. Write the version you target; do not write both.
- `close()` **always waits** for every forked thread to terminate, cancelled or not. The
  guarantee is "no thread escapes the block", never "close is quick". A scope that fails in
  5 ms and returns in 30 s is a subtask ignoring interruption, not a bug in the scope.
- `fork` and `join` may be called only by the **owner** thread, from inside the scope.
  Violating the block structure — storing the scope, returning without closing, closing out
  of order — raises `StructureViolationException` at runtime.
- `Subtask.get()` before `join()` throws. After `join()` it never blocks: it is
  `Future.resultNow()` semantics, not `Future.get()` semantics.
- The default `open()` policy fails the scope as soon as any subtask fails, cancelling the
  others; `join()` then throws `FailedException` (JDK 25 and 26) with the subtask's
  exception as its **cause**. Unwrap before matching on a type. In JDK 27 the `…OrThrow`
  joiners throw `ExecutionException` instead — the same unwrap discipline, a different
  wrapper.
- `Joiner` instances are **single use**. Reusing one across scopes, or after a scope closes,
  is undefined; construct a new one per `open`.
- Subtasks **inherit `ScopedValue` bindings** from the owner with no copying. This is the
  only inheritance mechanism the platform offers — a plain `Thread.ofVirtual().start()`
  inherits nothing.
- Scope timeout is configuration, not a joiner:
  `open(joiner, cf -> cf.withTimeout(d).withName("checkout"))`. In JDK 25 that parameter is
  a `Function<Config, Config>`; in 26 it is a `UnaryOperator<Config>`.
- `StructuredTaskScope` is deliberately **not** an `ExecutorService` and must not be
  adapted into one. It is a scope for one operation, not a place to put background work; a
  daemon loop, a scheduler or a queue consumer needs an executor with a lifecycle of its
  own.
- Structured concurrency does not bound concurrency. Forking 10 000 subtasks starts 10 000
  virtual threads against a downstream that may allow 20. The limit is still a semaphore or
  a pool next to the resource.
- Observability is a real feature, not a slogan: `jcmd <pid> Thread.dump_to_file
-format=json` renders the scope hierarchy, with each scope's subtasks nested under their
  owner and a reference to the parent scope. Naming the scope makes that dump readable.

## References

- [The API by JDK version](references/api-by-jdk-version.md) — the compile-and-run matrix
  for preview code, the full signature drift across 21 → 25 → 26 → 27, and the migration
  from `ShutdownOnFailure`/`ShutdownOnSuccess`. Read before writing any code against this
  API, and whenever an example fails to compile.
- [Patterns and pitfalls](references/patterns-and-pitfalls.md) — fan-out, race, partial
  results, scope timeouts and deadlines, nesting, a custom `Joiner`, testing a scope, and
  the anti-patterns that defeat the lifetime guarantee. Read when designing or reviewing a
  scope.
