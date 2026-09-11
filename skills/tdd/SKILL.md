---
name: tdd
description: >
  Test-driven development as a judgement call rather than a doctrine: the red-green-refactor
  loop and what each step is actually for, the discipline of watching a test fail for the
  stated reason, step size, and an explicit account of where TDD pays and where test-after or
  characterisation is the better choice. Use when deciding whether to drive a change with
  tests, when starting a bug fix, when a design is hard to test and the cause is not obvious,
  when tests are being written after the fact to satisfy a rule, when the refactor step keeps
  getting skipped, or when someone claims TDD is mandatory or useless. Does not cover which
  level to test at (java-testing-strategy), how a test is written (java-test-design), doubles
  (java-test-doubles), refactoring mechanics and safety (java-refactoring), or breaking a
  dependency to get untestable code into a harness (java-legacy-code-testing).
---

# TDD

## Purpose

Red-green-refactor is a feedback loop, not a virtue. It can provide evidence that a test
detects the intended missing behavior, expose design choices through a caller, and keep the
changed scope small enough to investigate. An observed failure does not prove every assertion
effective or rule out setup, environment and nondeterminism as causes of later failures.

Where those three are cheap to get another way, TDD costs more than it returns. Deciding which
situation you are in is the skill; performing the loop is mechanics.

## Workflow

First decide whether test-first is useful for this change using `references/when-tdd-pays.md`.
Inspect the project's Java release, test runner, resolved dependencies and focused test command.
Do not upgrade them to match the worked example. Report missing tools or an unreproduced fault
as a limitation; do not invent a red run. The following loop applies when test-first is selected.

1. **Write one failing test for the next behaviour**, keeping the change small enough that
   an unexpected result is understandable. Name it after the behaviour (java-test-design).
2. **Run it and read the failure.** This is the step that is skipped and the one that carries
   the value: a passing test whose sensitivity was never checked gives weaker evidence.
   A failure from unrelated setup or a typo is not the intended red. A missing API or bean
   can be the intended failure when creating that API or wiring is the behavior under test.
3. **Make it pass with the simplest change that satisfies the intended behaviour.** A literal
   return can complete a genuinely constant contract. For a broader input-dependent contract,
   a temporary constant may be a step; drive the remaining real requirements with discriminating
   cases rather than inventing a second test merely to forbid constants.
4. **Refactor while green** — both the code and the test. Skipping this converts TDD into
   "writing tests first and accumulating mess". Refactor when there is a concrete improvement;
   the step can legitimately end with no edit.
5. **Run affected checks and the repository's required gates.** Inspect discovery counts,
   failures and skips; report pre-existing failures separately. Commit only if authorized.
   If interrupted while red, leave an explicit handoff of the failing case and current state.

## Rules

- Observe the intended red for each test-first change. A test-after or invariant case may
  pass immediately and still provide coverage; it does not establish a red-green history.
  Where useful, check sensitivity against the old implementation or a controlled defect,
  without editing shared work or claiming this proves all assertions effective.
- For a bug fix, seek a safe reproducer at the narrowest useful level. Incident mitigation
  may precede it; production-only, destructive or nondeterministic faults may need captured
  evidence and a controlled model before a stable regression test is possible. State what
  the evidence does and does not establish (java-testing-strategy).
- Step size is set by how long you are willing to spend debugging when the step goes wrong. If
  a failing test leaves you guessing, inspect whether setup, environment or step size caused
  it. Revert only your isolated change when appropriate; preserve others' work.
- The design feedback is the point. When a test needs six mocks and a container to set up, the
  setup may reveal excess coupling, an unsuitable test boundary or behavior that genuinely
  needs integration. Inspect which dependency owns the risk before changing the design or level.
- Do not write a test whose assertion restates the implementation. `verify(repo).save(any())`
  alone often misses wrong data or timing. Interaction assertions are useful when the call,
  payload, ordering or absence of a side effect is itself the observable contract.
- TDD does not produce a test strategy. Unit tests do not establish real schema, wiring or
  external contracts when those boundaries carry the risk; choose their coverage deliberately.
  A pure component with no such boundary need not acquire an unrelated integration suite.
- Do not TDD toward a coverage number. Coverage is an output of having tested the behaviours
  that matter; used as a target it produces tests written for lines rather than for risk.

For an approach review, return the chosen method, reason and relevant limits; retain an adequate
existing approach. For executed work, report actual commands, discovery/pass/fail/skip counts,
observed red/green or characterization evidence, and remaining checks. Do not invent execution
for advice or call a single successful run evidence of a red-green history.

## References

- **The loop, executed** — `references/loop-mechanics.md`. A complete red-green-refactor
  session on an instalment splitter, with recorded failure output — including the second red,
  where the zero-count rejection test exposed an `ArithmeticException` while six invariant
  examples already passed. Read when the mechanics or step size are in question.
- **Where TDD pays, and where it does not** — `references/when-tdd-pays.md`. The conditions
  that make the loop cheap or expensive, situations where test-after or
  characterisation may be a better choice, and how to answer "is TDD mandatory here?" with a
  reason. Read before deciding how to approach a piece of work.
