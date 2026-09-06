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

Red-green-refactor is a feedback loop, not a virtue. It buys three specific things: a test
proven capable of failing, a design shaped by its first caller, and a small enough step that a
regression is attributable to the last minute of work rather than the last afternoon.

Where those three are cheap to get another way, TDD costs more than it returns. Deciding which
situation you are in is the skill; performing the loop is mechanics.

## Workflow

First decide whether test-first is useful for this change using `references/when-tdd-pays.md`.
Inspect the project's Java release, test runner, resolved dependencies and focused test command.
Do not upgrade them to match the worked example. Report missing tools or an unreproduced fault
as a limitation; do not invent a red run. The following loop applies when test-first is selected.

1. **Write one failing test for the next behaviour**, small enough to implement in a few
   minutes. Name it after the behaviour (java-test-design).
2. **Run it and read the failure.** This is the step that is skipped and the one that carries
   the value: a passing test whose sensitivity was never checked gives weaker evidence.
   A failure from unrelated setup or a typo is not the intended red. A missing API or bean
   can be the intended failure when creating that API or wiring is the behavior under test.
3. **Make it pass with the simplest change that could work.** Simplest means smallest, not
   dishonest; hardcoding a return value is a legitimate step only if the next test is already
   queued to break it.
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
- TDD does not produce a test strategy. Driving every behaviour from a unit test still leaves
  the schema, the wiring and the contract untested — those need their own tests chosen
  deliberately.
- Do not TDD toward a coverage number. Coverage is an output of having tested the behaviours
  that matter; used as a target it produces tests written for lines rather than for risk.

Return the chosen approach and reason, observed red/green results with command and test
counts, and remaining checks or evidence gaps. Do not call a single successful run TDD.

## References

- **The loop, executed** — `references/loop-mechanics.md`. A complete red-green-refactor
  session on an instalment splitter, with the real failure output at each step — including the
  second red, where a test written to state an invariant exposed an `ArithmeticException` the
  first implementation shipped with. Read when the mechanics or step size are in question.
- **Where TDD pays, and where it does not** — `references/when-tdd-pays.md`. The conditions
  that make the loop cheap or expensive, situations where test-after or
  characterisation may be a better choice, and how to answer "is TDD mandatory here?" with a
  reason. Read before deciding how to approach a piece of work.
