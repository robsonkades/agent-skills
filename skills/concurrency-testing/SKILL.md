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

The ordinary examples use Java 21+ final APIs and JUnit Jupiter; the structured-scope example
uses Java 25 preview. Inspect compiler release/toolchains, CI JDK, resolved test libraries and
timeout mode before adapting them. Keep the project's baseline and existing test framework;
do not upgrade Java or enable preview merely to use this skill.

1. **Identify the contract and reuse its existing tests.** Separate pure logic where useful:
   a same-thread executor can test it, while controlled queued execution or real workers test
   asynchronous boundaries. Do not change the executor model when that changes the contract.
2. **Select missing failure-path tests** for the actual lifecycle: cancel mid-flight,
   interrupt, time out, reject at the limit, fail the dependency. Establish the expected
   caller outcome, physical work lifetime and resource owner before writing the oracle.
3. **Replace sleeps used for coordination with an observable checkpoint** — a latch, a
   barrier or a bounded poll. Checkpoint placement must expose the intended race rather than
   accidentally order away the conflicting accesses. A controlled delay can still model a slow dependency.
4. **Assert invariants, not schedules.** After owned work terminates, account for every
   submission as success, failure, cancellation or rejection with disjoint definitions;
   check resource bounds and recovered permit counts at their specified observation points.
5. **Add budgeted stress where competing accesses remain a material risk**, retaining worker
   outcomes and varying relevant contention shapes. A shared field alone does not require a soak.
6. **Check resource recovery after quiescence.** Owned permits/connections should return;
   retained-heap trends require warmed baselines and allowances for caches/runtime growth.
7. **Bound waits and teardown.** A test timeout does not forcibly terminate stuck Java work;
   isolate intentional uncooperative deadlocks in a child process with an external deadline.
   Preserve worker failures alongside teardown failures; a cleanup assertion in `finally`
   can replace the failure that caused cleanup.

## Rules

- **A passing run shows no checked invariant failed in its exercised executions.** It does not
  establish correctness under unobserved interleavings, other hardware, or other JDK versions.
  Say this out loud in review when a test is offered as proof of thread safety.
- **Do not treat a fixed sleep as evidence another thread progressed.** Use `CountDownLatch` for "has it
  started", `CyclicBarrier` for "start together", `Awaitility` (or a bounded poll) for "has
  the effect happened". A poll may delay between checks; the observed condition and overall bound
  are its oracle, not elapsed sleep alone.
- **A flaky concurrency test is a bug report.** Diagnose whether the cause is a product race,
  faulty oracle, harness coordination or environment. Adding a retry, a longer sleep or
  `@Disabled` deletes the only evidence you had.
- **Test cancellation explicitly, and assert the effect, not the flag.** `f.cancel(true)`
  returning `true` does not prove work stopped. Assert the connection returned to the pool, the permit was
  released, the file was closed, within the owning contract's bound. Confirm acquisition/start
  first; zero active work is not evidence of cancellation if no operation ever started.
- **Test interruption explicitly.** Interrupt a task mid-blocking-call and assert it
  terminates within a bound and handles interruption according to its ownership contract:
  propagate, restore at a boundary, or deliberately consume at a terminal owner.
- **Test the limit at its boundary.** Saturate the semaphore or pool, assert the rejection is
  the one you designed (a 503 with `Retry-After`, a fallback value), and assert it is counted.
  An untested rejection path is a 500 waiting for peak traffic.
- **Avoid incidental thread names/counts/pool sizes.** Assert resource concurrency or executor
  affinity when it is the actual contract, using controlled identities/measurements rather than
  a naming convention. Otherwise assert outcomes.
- Determinism beats concurrency in unit tests: a same-thread executor
  (`Runnable::run` as an `Executor`) makes the surrounding logic testable without any
  scheduling at all. Keep the concurrent tests for what actually needs concurrency.
- **Stress tests find bugs probabilistically.** Vary the thread count, run many iterations,
  and repeat in CI — but never report "the stress test passed" as "there is no race". For an
  ordering claim about a specific pair of accesses, the tool is `jcstress`
  (`java-memory-model`).
- **Use soak to expose accumulating leaks**, while retaining focused unit tests for individual
  ownership paths. Sample after comparable quiescent phases; elapsed time alone does not give
  coverage, and a requested full GC is not a portable guarantee of complete reclamation.
- **Inject faults, not just load.** A dependency that is slow, that fails, and that fails
  intermittently exercises the timeout, the limit and the fallback — the three paths that
  matter under overload and that a happy-path integration test never reaches.
- The Java 25 `StructuredTaskScope` example needs compilation with JDK 25
  `--enable-preview --release 25` and execution with that JDK and `--enable-preview`.
  Surefire's runtime `argLine` alone does not enable compilation; preserve existing agents
  and flags when configuring the project's compiler and test runner.
- When carrier capture is a material risk, give an isolated test JVM a deliberately small scheduler
  (`-Djdk.virtualThreadScheduler.parallelism=1 -Djdk.virtualThreadScheduler.maxPoolSize=1`) in
  one dedicated test to screen for work that retains a carrier. Compare a known unmounting
  control, account for CPU and connection limits, and corroborate with JFR/stacks before
  attributing slow completion to carrier capture.

Report the defect/invariant, controlled ordering, observed worker outcomes, cleanup bounds and
commands actually run. State remaining untested schedules/providers rather than claiming proof.

## References

- [Deterministic tests](references/deterministic-tests.md) — injecting executors, the
  same-thread executor, latch and barrier patterns, and worked tests for cancellation,
  interruption, timeout, rejection and a structured scope. Read when writing tests for
  concurrent code.
- [Stress, soak and fault injection](references/stress-and-soak.md) — the stress harness with
  invariant assertions, choosing the invariant, leak detection, fault injection against a
  limit, CI budgets, and how to read a green run. Read when the risk justifies more than a
  deterministic test.
