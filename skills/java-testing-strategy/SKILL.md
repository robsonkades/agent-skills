---
name: java-testing-strategy
description: >
  Choosing which test level earns its cost for a given change: what a unit, integration,
  contract or end-to-end test can and cannot prove, pushing each test to the narrowest
  scope where the risk is actually real, what every mocked boundary obliges you to verify
  elsewhere, and coverage as a diagnostic rather than a target. Use when deciding where to
  test a change, when a suite is slow or nobody trusts it, when a bug escaped a green
  suite, when mocks make a test pass while production fails, when a coverage gate is
  proposed, or when a fix needs a regression test. Does not cover how an individual test is
  written (java-test-design), doubles and Mockito (java-test-doubles), the red-green-refactor
  loop (tdd), concurrency (concurrency-testing), distributed behaviour
  (distributed-systems-testing), architecture rules (architecture-testing), load and
  benchmarks (load-testing, jmh-microbenchmarks), or getting untestable legacy code into a
  harness (java-legacy-code-testing).
---

# Java Testing Strategy

## Purpose

Decide where a given risk gets tested. Two failure modes, and choosing the level is what
decides which one you get: the suite that stays green while production is broken — every
boundary mocked, the mocks agreeing with themselves — and the suite nobody trusts, slow and
flaky enough that a red build means "run it again" rather than "stop".

A test earns its place by making a specific failure impossible to ship unnoticed. A test
that cannot fail for a reason you can name is cost without cover.

## Workflow

1. **Name the risk this change carries**, in one sentence. Wrong calculation, wrong wiring,
   wrong SQL, wrong contract with another team, wrong under concurrency or load — these are
   five different risks and they are not testable at the same level. If you cannot name it,
   you do not yet know what to test.
2. **Find the narrowest scope in which that risk is real.** A rounding rule is real inside
   one method. A lazy-loading failure is not real until a real persistence context exists.
   Push down as far as the risk survives, and no further.
3. **Read what that level cannot prove** (`references/test-levels.md`) and decide whether
   the gap needs covering. It usually needs one test elsewhere, not a second suite.
4. **Price it**: feedback latency, probability of flaking, and how tightly it binds to
   structure that will change. A test that must be rewritten by every refactoring is a
   change detector, and it will be deleted under deadline pressure.
5. **Run it and watch it fail for the stated reason** before trusting it. A test never
   observed red proves only that it compiles.

## Rules

- The pyramid is a cost heuristic, not a target shape. It says fast tests are cheap to run
  often and slow ones are not — nothing more. Where integration tests run in seconds
  (container reuse, a real engine started once per suite), lean on them; where they take
  minutes, do not. Decide from your measured suite time, not from the picture.
- Every mocked boundary is a claim that must be verified somewhere else, once: schema and
  query behaviour by an integration test against the real engine, HTTP shape by a contract
  test, serialisation by a round-trip test. An unverified mock is an assumption written in
  green.
- Do not test the framework, the language, or the mapping tool. Asserting that a getter
  returns what a setter set, or that an annotation is present, tests nothing that can break
  in production without the framework itself breaking.
- One end-to-end test per critical journey. They are the slowest, flakiest and least
  diagnostic tests you own; their value is proving the parts are wired together at all, and
  that value does not multiply with count.
- A bug gets a regression test at the narrowest level that reproduces it, written before the
  fix and observed failing. If no level below end-to-end reproduces it, that is a finding
  about the design, not a licence to skip the test.
- Coverage is a diagnostic, never a gate target. An uncovered branch is a question worth
  asking; a mandated percentage produces assertion-free tests that execute code and verify
  nothing. Read the uncovered lines instead of the number.
- Never test private methods directly. Behaviour unreachable through the public surface is
  either dead or evidence the class boundary is wrong (java-cohesion-coupling).
- Slow, flaky and quarantined are three names for "deleted". Fix it or delete it
  deliberately; a `@Disabled` test with no owner is a comment that costs a build step.

## References

- **What each level proves and cannot prove** — `references/test-levels.md`. Unit,
  integration, Spring slice, contract, end-to-end and characterisation, each with the Java
  tooling, typical feedback latency, and the specific failures it is blind to. Read when
  choosing a level or when deciding what a mocked boundary still obliges you to verify.
- **Worked selection scenarios** — `references/selection-scenarios.md`. Five changes — a
  pricing rule, a new query, a third-party call, a schema migration, a bug report — taken
  from risk to chosen level, with the tests deliberately not written and why. Read when the
  rules above match but the level is still not obvious.
