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

A test earns its place by detecting a named failure in the exercised conditions. A test
that cannot fail for a reason you can name is cost without cover.

This strategy has no language-specific Java minimum. Before choosing tooling, inspect the
project's compiler release, runtime, resolved Spring/testing versions, CI services and
existing tests. Do not upgrade them to match an example. Without suite timings or a
reproduction, state a proposed selection and its evidence gap, not a verified diagnosis.

## Workflow

1. **Name the risk this change carries**, in one sentence. Wrong calculation, wrong wiring,
   wrong SQL, wrong contract with another team, wrong under concurrency or load — these are
   five different risks and they are not testable at the same level. If you cannot name it,
   you do not yet know what to test.
2. **Find the narrowest scope in which that risk is real.** A rounding rule is real inside
   one method. A lazy-loading failure is not real until a real persistence context exists.
   Push down as far as the risk survives, and no further.
3. **Read what that level cannot prove** (`references/test-levels.md`) and inspect existing
   evidence for the same boundary, versions and assumptions. Add focused coverage only for a
   material remaining gap, or make its acceptance explicit; do not add a test per mock.
4. **Price it**: feedback latency, probability of flaking, and how tightly it binds to
   structure that will change. A test that must be rewritten by every refactoring is a
   change detector, and it will be deleted under deadline pressure.
5. **Check detection**, preferably against the unfixed bug or a controlled defect. A passing
   test alone does not establish that it detects the intended failure. If a red run is
   unavailable, report that limitation; do not alter production merely to manufacture one.

Return the risk, chosen scope, decisive assertion or reproduction, uncovered boundary and
how it is covered or accepted, plus commands/results actually observed. A short paragraph
is enough for a single change.

## Rules

- The pyramid is a cost heuristic, not a target shape. It says fast tests are cheap to run
  often and slow ones are not — nothing more. Where integration tests run in seconds
  (container reuse, a real engine started once per suite), lean on them; where they take
  minutes, do not. Decide from your measured suite time, not from the picture.
- Every mocked boundary carries assumptions to verify at an appropriate real boundary: schema and
  query behaviour by an integration test against the real engine, HTTP shape by a contract
  test, serialisation by expected wire fixtures as well as round trips. An unverified mock is an assumption written in
  green.
- Test application configuration and mapping through observable behavior; missing validation,
  security or mapping annotations can break production while the framework works correctly.
  Skip trivial getter/setter tests unless the accessor enforces a meaningful contract.
- Keep the smallest end-to-end portfolio covering distinct critical risks. One case can
  suffice for a simple journey; different authorization or payment paths may require more.
- Prefer a regression test before the fix, with an observed failure for the reported reason.
  When that run is unavailable, distinguish current passing evidence from unverified defect
  detection as in step 5. Retain the narrowest reproduction that preserves the risk;
  end-to-end-only reproduction is a lead about wiring, state or environment, not proof of a
  design defect or a reason to skip coverage.
- Coverage diagnoses unexecuted code; it does not measure assertion strength. Keep existing
  gates unless their change is in scope. A gate may detect lost coverage, but hitting its
  percentage is insufficient: inspect uncovered risks and whether assertions detect defects.
- Prefer observable behavior through the actual entrypoint over direct private-method tests.
  Private callbacks can be reached by serialization or frameworks; visibility alone does not
  prove dead code or a wrong boundary. A focused direct test may be a useful legacy seam, but
  carries coupling and does not prove invocation by the real caller. Do not expose methods or
  extract classes solely to satisfy a testing rule (java-cohesion-coupling).
- Diagnose slow or flaky tests before deleting coverage. Temporary quarantine needs an
  owner, repair deadline and explicit risk; it is not a pass. A slow valuable test may belong
  in a scheduled suite with a defined release policy.

## References

- **What each level proves and cannot prove** — `references/test-levels.md`. Unit,
  integration, Spring slice, contract, end-to-end and characterisation, each with the Java
  tooling, typical feedback latency, and the specific failures it is blind to. Read when
  choosing a level or when deciding what a mocked boundary still obliges you to verify.
- **Worked selection scenarios** — `references/selection-scenarios.md`. Five changes — a
  pricing rule, a new query, a third-party call, a schema migration, a bug report — taken
  from risk to chosen level, with the tests deliberately not written and why. Read when the
  rules above match but the level is still not obvious.
