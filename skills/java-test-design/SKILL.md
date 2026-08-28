---
name: java-test-design
description: >
  Writing a Java test that survives refactoring and says why it failed: naming the
  behaviour rather than the method, one reason to fail, test data builders over shared
  mutable setup, choosing the assertion that produces a readable failure, parameterised and
  nested tests, and removing every input the test does not control — clock, ordering,
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

1. **Name it after the condition and the expected behaviour**, so a reader can predict the
   assertion from the name alone: `renewalOneDayAfterTheWindowIsNotDue`, not
   `testIsDueWithin2`. A name containing a method name and a digit is naming the
   implementation.
2. **Give it one reason to fail.** Multiple assertions are fine when they describe one
   outcome; two unrelated outcomes are two tests, because the first failure hides the second.
3. **Make the arrangement disappear.** A builder with sensible defaults, where the test names
   only the field it depends on, keeps the relevant input visible:
   `aSubscription().renewingOn(MARCH_9).build()`.
4. **Choose the assertion for its failure message.** `assertThat(list).containsExactly(a, b)`
   prints both lists on failure; `assertTrue(list.equals(...))` prints `false`.
5. **Remove every input you do not control** — the system clock, iteration order, default
   locale and zone, randomness, the filesystem. See `references/determinism.md`.
6. **Break the production code on purpose once** and read the failure. If the message does
   not identify the fault, the assertion is wrong, not the code.

## Rules

- No logic in a test. An `if`, a loop or a `try/catch` that decides what to assert means the
  test has branches of its own, and those branches are untested. Parameterise instead.
- One behaviour per test; `assertAll` only for several facets of the _same_ outcome, so that
  all of them are reported rather than just the first.
- Shared mutable fixture state is the cause of "passes alone, fails together". Construct in
  the test or in `@BeforeEach`; never mutate a static field. `@TestInstance(PER_CLASS)` keeps
  one instance for the whole class — its fields are then shared state between tests.
- Never `Thread.sleep` to wait for something. Either the thing is synchronous and the sleep
  is noise, or it is not and the sleep is a race (concurrency-testing owns the alternatives).
- Never assert against a value the test computes with the same expression the code uses. That
  asserts the expression equals itself and passes when both are wrong. Write the expected
  value as a literal.
- Assert on the resulting value whenever the outcome is observable as one. Verifying that a
  collaborator was called is a claim about implementation, and is only justified when the
  call _is_ the outcome (java-test-doubles).
- Assert the exception type always, and its message only when the message is part of the
  contract callers rely on. `assertThatThrownBy(...).isInstanceOf(...)` reads better than
  `try/fail/catch` and cannot silently pass when nothing is thrown.
- Parameterise only cases that differ in data alone. If the expected result needs a
  conditional to compute, they were different tests wearing one name.
- A flaky test is a defect report — about the test or about the code. `@RepeatedTest`, a retry
  extension or `@Disabled` converts a report into silence. Diagnose it or delete it and say so.
- Helpers may arrange; they may not assert. An assertion buried in a helper reports the
  helper's line number, and the test no longer states what it expects.

## References

- **Verified JUnit patterns** — `references/junit5-patterns.md`. Compiling, passing examples
  (JDK 25, Jupiter): test data builder, `@ParameterizedTest` with `@CsvSource` and implicit
  `java.time` conversion, `@Nested` for context, exception assertions, and the lifecycle
  choices that create shared state. Read when reaching for a Jupiter feature.
- **Removing non-determinism** — `references/determinism.md`. The controllable inputs a test
  accidentally depends on — clock, zone, locale, charset, iteration order, randomness,
  filesystem, ports — each with the substitution, plus the "passes alone, fails together"
  checklist. Read when a test is flaky or order-dependent.
