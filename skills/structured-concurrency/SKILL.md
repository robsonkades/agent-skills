---
name: structured-concurrency
description: >
  StructuredTaskScope as a lifetime guarantee for a fan-out: fork, join, close, and the rule
  that no subtask thread outlives the block. Covers the API as it stands on each JDK — still
  a preview API on every released version, renamed between 25 and 26 and changed again in
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
start inside a correctly closed scope, and its forked threads cannot outlive close. This
does not force interruption-resistant work to stop or track detached callbacks or remote
effects launched by a subtask. Executors can implement disciplined cancellation and waiting
too; a scope makes ownership and completion policy explicit in the API.

The second thing this skill exists for is version accuracy. The API has been reshaped in
almost every release, and the examples in circulation do not compile on the current
baseline.

## Workflow

Inspect the parent operation, result contract, task independence, current implementation and
resource limits before prescribing fan-out. Reuse project evidence; ask only unresolved questions
that change required/optional results, lifetime or preview acceptability. Sequential execution or
an existing disciplined executor may already satisfy the task without a new preview dependency.

1. **Confirm the JDK first, and the preview cost.** `StructuredTaskScope` is a preview API
   on every released JDK through 27. It requires `--enable-preview` at
   compile _and_ run time, and preview class files run only on the **exact** JDK version
   that compiled them (feature release, not identical patch build). Inspect project toolchains
   and images; do not upgrade or enable preview without task authorization. Decide whether the deployment can accept that before designing
   around it.
2. **Pick the completion policy, then the joiner.** All must succeed, first success wins,
   collect everything including failures, or stop at a condition — each is a different
   `Joiner` on JDK 25+, and its result determines what `join()` returns.
3. **Write the block in the fixed order**: `open` → `fork` × n → `join` → read results →
   implicit `close` on JDK 25+. The owner joins before reading results; fork/join/close are
   owner-only. The 21–24 ownership rules differ: use the version reference.
4. **Set the timeout on the scope**, not on each subtask, when the bound belongs to the
   whole operation. Derive it from the remaining parent budget when opening the scope rather than
   resetting an inherited budget; still honor outer cancellation. In JDK 25 the scope cancels
   subtasks and `join` throws `TimeoutException`; later previews add/change joiner timeout
   callbacks, so inspect the matching contract.
5. **Check every subtask responds to interruption.** Cancellation is delivered as an
   interrupt and `close` waits regardless — one uninterruptible subtask converts a fast
   failure into a slow one.
6. **Nest deliberately.** A subtask opening its own scope creates a tree with cancellation
   flowing down it; that is the intended way to compose, and it is also how a deadline
   requests cancellation through a subtree, without a hard bound on method return.

## Rules

- **Preview status, precisely**: incubator in 19–20, preview from 21 (JEP 453) through 24
  (JEP 499), reshaped in 25 (JEP 505), sixth preview in 26 (JEP 525), seventh preview in
  27 (JEP 533). JDK 27 reaching GA does not make this API final.
  It has never been final in a released JDK. Any claim that structured
  concurrency is "GA in 21" or "final in 25" is wrong.
- The 25 reshape **removed** `StructuredTaskScope.ShutdownOnFailure`,
  `ShutdownOnSuccess` and the public constructors, replacing them with
  `StructuredTaskScope.open(...)` and `Joiner`. Code using those older members does not
  compile against 25; it remains valid against its matching earlier preview release.
- **The names changed again in 26**: `allSuccessfulOrThrow()` now returns a `List` of
  results instead of a `Stream` of subtasks, and `anySuccessfulResultOrThrow()` is now
  `anySuccessfulOrThrow()`. Write the version you target; do not write both.
- `close()` **always waits** for every forked thread to terminate, cancelled or not. The
  guarantee is "no thread escapes the block", never "close is quick". A scope that fails in
  5 ms and returns in 30 s needs investigation of subtask termination, cleanup and scheduling.
  On JDK 25, interruption while close waits is preserved in the thread's status, not thrown as
  `InterruptedException`. Honor the caller's cancellation contract after cleanup before using results.
- In JDK 25, `fork`, `join` and `close` are owner-only (`WrongThreadException` otherwise).
  Join is single-use and no forks follow it. Storing/passing a scope reference does not itself
  throw; runtime checks do not replace guaranteed try-with-resources closure.
- In JDK 25, `fork` on a cancelled scope returns an `UNAVAILABLE` subtask without starting
  its thread. A `finally` inside that task cannot release a resource acquired before `fork`.
  Acquire and release inside the task, or retain owner cleanup until after scope close.
- Owner `Subtask.get()` before joining throws; reading a successful task inside a joiner
  callback is valid. It never waits and fails without a successful result. Joining with a
  partial-result policy does not make every subtask successful. In JDK 25, a timeout before
  join completes still prevents owner `get()` inside the scope; retain results through a
  completion callback when partial results must survive that timeout.
- The default `open()` policy fails the scope as soon as any subtask fails, cancelling the
  others; `join()` then throws `FailedException` (JDK 25 and 26) with the subtask's
  exception as its **cause**. Unwrap before matching on a type. In JDK 27 the standard
  `…OrThrow` joiners default to `ExecutionException`; an exception mapper or custom policy
  may choose a different exception.
- `Joiner` instances are **single use**. Reusing one across scopes, or after a scope closes,
  is undefined; construct a new one per `open`.
- A scope captures the owner's **current `ScopedValue` bindings when it is opened**;
  threads subsequently started by `fork` inherit that captured set. HotSpot can implement
  this essentially as pointer copying, but that is an implementation property. A plain
  `Thread.ofVirtual().start()` does not inherit scoped-value bindings.
  Bindings at fork must match those at open; mutable bound objects still require thread safety.
- Scope timeout is configuration, not a joiner:
  `open(joiner, cf -> cf.withTimeout(d).withName("checkout"))`. In JDK 25 that parameter is
  a `Function<Configuration, Configuration>`; in 26 it is a `UnaryOperator<Configuration>`.
- `StructuredTaskScope` is **not** a shared cross-thread submission API like `ExecutorService`.
  A long-lived accept loop can own a scope if its lifetime encloses all handlers and shutdown
  stops admission, cancels and waits for them. Detached jobs or independently scheduled work
  need separate explicit lifecycle ownership; do not smuggle them out of a request scope.
- Structured concurrency does not bound concurrency. With the default configuration,
  forking 10 000 subtasks can create 10 000 virtual threads against a downstream that may
  allow 20. Put admission control next to the constrained resource; changing the scope's
  thread factory changes execution policy but does not infer a safe downstream limit.
- `jcmd <pid> Thread.dump_to_file -format=json <output-file>` records scope containers and
  parent references. Check target help, dump coverage and output location; give scopes meaningful
  names to identify their purpose alongside thread/container IDs.
- Return the target API/flags, completion and cancellation policy, resource ownership and
  tests of actual termination. Missing runtime evidence leaves latency guarantees unproven.

## References

- [The API by JDK version](references/api-by-jdk-version.md) — the compile-and-run matrix
  for preview code, the full signature drift across 21 → 25 → 26 → 27, and the migration
  from `ShutdownOnFailure`/`ShutdownOnSuccess`. Read before writing any code against this
  API, and whenever an example fails to compile.
- [Patterns and pitfalls](references/patterns-and-pitfalls.md) — fan-out, race, partial
  results, scope timeouts and deadlines, nesting, a custom `Joiner`, testing a scope, and
  the anti-patterns that defeat the lifetime guarantee. Read when designing or reviewing a
  scope.
