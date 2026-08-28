---
name: concurrency-testing
description: >
  Testing concurrent Java so failures appear in CI rather than in an incident: what a
  passing concurrency test does and does not prove, replacing sleeps with latches and
  deterministic executors, explicitly exercising cancellation, interruption and timeout,
  stress tests that assert invariants, and soak tests that catch permit and connection
  leaks. Use when a test uses Thread.sleep to wait for another thread, when a concurrency
  test is flaky and a retry is proposed, when cancellation or timeout paths have no test at
  all, when tests assert on thread names or pool sizes and broke after a virtual-thread
  change, when a race was found in production and nobody can reproduce it, or when a
  concurrency limit or fallback has never been exercised under failure. Does not cover
  proving memory-model claims (java-memory-model, varhandles-and-memory-ordering),
  benchmark methodology (jmh-microbenchmarks), load generation and rates (load-testing), or
  diagnosing a live system (concurrency-diagnostics).
---

# Concurrency Testing

## Purpose

Get concurrency defects to fail a build. Most never do, because the tests that would catch
them are the ones nobody writes: cancellation, interruption, timeout, rejection, and the
behaviour of a limit at its boundary. What does get written — a test that starts two threads
and asserts the happy path — is the one that proves the least.

The second purpose is calibration. A green concurrency test is weak evidence, and treating it
as strong evidence is how a race gets shipped with confidence.

## Workflow

1. **Separate the logic from the concurrency.** Inject the executor. Test the logic with a
   same-thread executor, deterministically; test the concurrency separately and explicitly.
2. **Write the failure-path tests first**, because they are the ones that will otherwise not
   exist: cancel mid-flight, interrupt, time out, reject at the limit, fail the dependency.
3. **Replace every sleep with a synchronisation point** — a latch, a barrier, `Awaitility`
   with a bound. A sleep is either a flaky test or a slow one, and usually both.
4. **Assert invariants, not schedules.** "Submitted equals completed plus failed plus
   rejected", "the balance is never negative", "the permit count returns to its start".
5. **Add a stress test with a repeat count** for anything with shared mutable state, and run
   it in CI with a time budget.
6. **Add a soak assertion for leaks**: after N iterations, permits, connections and heap
   after a full GC must return to their starting values.
7. **Put a timeout on every test** so a deadlock fails the build instead of hanging the
   agent.

## Rules

- **A passing concurrency test proves that one interleaving was acceptable.** It is not
  evidence of correctness under other interleavings, other hardware, or other JDK versions.
  Say this out loud in review when a test is offered as proof of thread safety.
- **Never `Thread.sleep` to wait for another thread.** Use `CountDownLatch` for "has it
  started", `CyclicBarrier` for "start together", `Awaitility` (or a bounded poll) for "has
  the effect happened". A sleep encodes a timing assumption that CI hardware will violate.
- **A flaky concurrency test is a bug report.** Diagnose it before touching it; the usual
  cause is a real race in the code under test. Adding a retry, a longer sleep or
  `@Disabled` deletes the only evidence you had.
- **Test cancellation explicitly, and assert the effect, not the flag.** `f.cancel(true)`
  returning `true` proves nothing. Assert the connection returned to the pool, the permit was
  released, the file was closed, within a bound.
- **Test interruption explicitly.** Interrupt a task mid-blocking-call and assert it
  terminates within a bound and that the interrupt status is either propagated or restored.
  Swallowed `InterruptedException` has no other automated detector.
- **Test the limit at its boundary.** Saturate the semaphore or pool, assert the rejection is
  the one you designed (a 503 with `Retry-After`, a fallback value), and assert it is counted.
  An untested rejection path is a 500 waiting for peak traffic.
- **Do not assert on thread names, thread counts or pool sizes.** These are implementation,
  they change with a configuration flag, and they break wholesale under virtual threads.
  Assert on outcomes.
- Determinism beats concurrency in unit tests: a same-thread executor
  (`Runnable::run` as an `Executor`) makes the surrounding logic testable without any
  scheduling at all. Keep the concurrent tests for what actually needs concurrency.
- **Stress tests find bugs probabilistically.** Vary the thread count, run many iterations,
  and repeat in CI — but never report "the stress test passed" as "there is no race". For an
  ordering claim about a specific pair of accesses, the tool is `jcstress`
  (`java-memory-model`).
- **Soak for leaks.** Permits, connections, file handles and heap after full GC are all
  monotonic-decline detectors; a five-minute loop with a before/after assertion catches what
  no unit test will.
- **Inject faults, not just load.** A dependency that is slow, that fails, and that fails
  intermittently exercises the timeout, the limit and the fallback — the three paths that
  matter under overload and that a happy-path integration test never reaches.
- Tests exercising `StructuredTaskScope` need `--enable-preview` in the IDE, in the build
  (`<argLine>--enable-preview</argLine>` for Surefire) and in CI. A test that "does not
  compile on the build agent" is usually this.
- Give the test JVM a deliberately small scheduler
  (`-Djdk.virtualThreadScheduler.parallelism=1 -Djdk.virtualThreadScheduler.maxPoolSize=1`) in
  one dedicated test to expose work that captures or pins a carrier: with no compensation
  available, it serialises visibly.

## References

- [Deterministic tests](references/deterministic-tests.md) — injecting executors, the
  same-thread executor, latch and barrier patterns, and worked tests for cancellation,
  interruption, timeout, rejection and a structured scope. Read when writing tests for
  concurrent code.
- [Stress, soak and fault injection](references/stress-and-soak.md) — the stress harness with
  invariant assertions, choosing the invariant, leak detection, fault injection against a
  limit, CI budgets, and how to read a green run. Read when the risk justifies more than a
  deterministic test.
