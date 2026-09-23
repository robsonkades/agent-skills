---
name: java-test-design
description: >
  Writing a Java test that survives refactoring and says why it failed: naming the
  behaviour rather than the method, one reason to fail, test data builders over shared
  mutable setup, choosing the assertion that produces a readable failure, parameterised and
  nested tests, and controlling relevant inputs — clock, ordering,
  locale, randomness. Use when a test name does not say what broke, when a failure message
  has to be decoded by reading the test, when setup is shared across unrelated tests, when
  a test sleeps, when tests pass alone and fail together, when a flaky test is about to be
  retried or disabled, or when the same assertions are being copied across cases. Does not
  cover which level to test at (java-testing-strategy), stubs and mocks (java-test-doubles),
  the red-green-refactor loop (tdd), or threading (concurrency-testing).
---

# Java Test Design

## Purpose

A failing test has one job: tell you what broke without being read. Most tests fail that
job — the name repeats the method name, the message says `expected: true but was: false`,
and the arrangement is thirty lines of setup shared with tests that need none of it.

The second job is surviving. A test bound to how the code is structured must be rewritten by
every refactoring, and a suite that must be rewritten by every refactoring is a suite that
gets deleted the first time a deadline arrives.

## Workflow

Inspect the project's JDK/toolchain, resolved Jupiter/assertion versions, lifecycle/parallel
configuration and existing test command first. Reference snippets were authored for JDK 25,
use Java 17+ syntax and Jupiter 5 APIs, and do not authorize upgrades or new dependencies. When a
failure cannot be reproduced, report the observation and diagnostic next step, not a guessed cause.

1. **Name it after the condition and the expected behaviour**, so a reader can predict the
   assertion from the name alone: `renewalOneDayAfterTheWindowIsNotDue`, not
   `testIsDueWithin2`. Method names or digits are fine when they help describe the contract.
2. **Give it one reason to fail.** Multiple assertions are fine when they describe one
   outcome; two unrelated outcomes are two tests, because the first failure hides the second.
3. **Keep the relevant arrangement visible.** Direct construction is often enough. For
   recurring incidental setup, a builder with sensible defaults can expose the changing input:
   `aSubscription().renewingOn(MARCH_9).build()`. Reuse adequate project helpers and assertions.
4. **Choose the assertion for its failure message.** `assertThat(list).containsExactly(a, b)`
   prints both lists on failure; `assertTrue(list.equals(...))` prints `false`.
5. **Control the inputs relevant to the contract** — clock, order, locale/zone, randomness and
   external resources. Preserve required integration and default-environment behavior by
   isolating/configuring it, rather than changing production semantics to simplify the test.
   See `references/determinism.md`.
6. **For a consequential new regression test, check a representative fault** with a temporary
   local mutation or the known failing revision. Restore the mutation and rerun the test;
   inspect both fault detection and diagnostic clarity. Do not leave broken production code.

## Rules

- Keep scenario selection explicit: parameterise data-only cases instead of branching to choose
  unrelated assertions. Loops, generated cases and property assertions are valid when their oracle
  is independent, readable and identifies the failing input.
- One behaviour per test; `assertAll` only for several facets of the _same_ outcome, so that
  all of them are reported rather than just the first.
- Shared mutable fixture state is a lead for "passes alone, fails together", not proof of the
  cause. Prefer fresh test/`@BeforeEach` state; deliberate sharing needs a verified reset,
  ownership and synchronization contract. `PER_CLASS` reuses one instance; `PER_METHOD` does
  not isolate static/external state or references to shared objects.
- Do not use an arbitrary sleep as proof of readiness or completion. Await the relevant
  milestone with a bound and cleanup. An intentional delay can belong to a temporal fault
  model, but does not establish that another task finished (concurrency-testing).
- Do not derive the expectation by repeating the behavior under test; both copies can be
  wrong together. Use explicit example values or an independent oracle/property. Sharing
  incidental value constructors is different from copying the algorithm being tested.
- Assert on the resulting value whenever the outcome is observable as one. Verifying that a
  collaborator was called is a claim about implementation, and is only justified when the
  call _is_ the outcome (java-test-doubles).
- Assert the exception type always, and its message only when the message is part of the
  contract callers rely on. Put only the intended operation inside the exception assertion;
  fallible arrangement there can satisfy it before the operation runs. `assertThrows`
  accepts subtypes; require an exact class only when the contract does, using an API available
  in the project (see `references/junit5-patterns.md`). A manual `try/fail/catch` must also fail
  on no-throw and wrong-type paths.
- Parameterise cases sharing an arrangement and assertion contract. A conditional in an
  independent oracle does not by itself require separate tests; split materially different
  behaviors when grouping obscures the scenario or failure.
- A flaky test is a defect report about the test, code or environment. Preserve the regression
  signal: do not delete, weaken or disable it just to pass. Bounded repetition can diagnose a
  flake if every outcome is retained; retry-until-green is not a fix.
- Assertion helpers/custom assertions are useful for recurring domain contracts when names,
  actual/expected values and caller context make failures clear. Avoid helpers that hide which
  behaviour is asserted or duplicate production logic.

Report the behaviour covered, relevant boundary/failure cases, exact command and executed test
count, and any untested hypothesis. A green command with zero matching tests is not validation.

## References

- **JUnit patterns** — `references/junit5-patterns.md`. Partial examples
  (Java 17+ syntax, Jupiter 5 APIs): test data builder, `@ParameterizedTest` with `@CsvSource` and implicit
  `java.time` conversion, `@Nested` for context, exception assertions, and the lifecycle
  choices that create shared state. Read when reaching for a Jupiter feature.
- **Removing non-determinism** — `references/determinism.md`. The controllable inputs a test
  accidentally depends on — clock, zone, locale, charset, iteration order, randomness,
  filesystem, ports — each with the substitution, plus the "passes alone, fails together"
  checklist. Read when a test is flaky or order-dependent.
