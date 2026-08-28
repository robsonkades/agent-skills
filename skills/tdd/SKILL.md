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

1. **Write one failing test for the next behaviour**, small enough to implement in a few
   minutes. Name it after the behaviour (java-test-design).
2. **Run it and read the failure.** This is the step that is skipped and the one that carries
   the value: a test that has never failed proves nothing, and a test that fails for the
   _wrong reason_ — a typo, a missing bean, a `NullPointerException` in setup — is not yet
   red, it is broken.
3. **Make it pass with the simplest change that could work.** Simplest means smallest, not
   dishonest; hardcoding a return value is a legitimate step only if the next test is already
   queued to break it.
4. **Refactor while green** — both the code and the test. Skipping this converts TDD into
   "writing tests first and accumulating mess", which is worse than test-after because it also
   costs the loop overhead.
5. **Run everything, then commit.** A green suite is the unit of progress; leaving red at the
   end of a session is how a morning is spent bisecting.

## Rules

- Watch every test fail before you make it pass. An agent that reports "test added, suite
  green" without ever having observed red has proven only that the code compiles
  (coding-agent-discipline).
- A bug fix starts with a failing test that reproduces the bug at the narrowest level that can
  (java-testing-strategy). Under a live incident the mitigation may ship first — but the
  reproduction is then owed before the follow-up fix, not waived, because a fix with no
  reproduction is a guess that has never been contradicted.
- Step size is set by how long you are willing to spend debugging when the step goes wrong. If
  a failing test leaves you guessing, the step was too big; back it out and take a smaller one.
- The design feedback is the point. When a test needs six mocks and a container to set up, the
  message is about the class's dependencies, not about the test. Fix the design
  (java-cohesion-coupling); do not reach for a heavier test.
- Do not write a test whose assertion restates the implementation. `verify(repo).save(any())`
  after a method that calls `save` is a tautology; it fails only when the code changes, never
  when it is wrong.
- TDD does not produce a test strategy. Driving every behaviour from a unit test still leaves
  the schema, the wiring and the contract untested — those need their own tests chosen
  deliberately.
- Do not TDD toward a coverage number. Coverage is an output of having tested the behaviours
  that matter; used as a target it produces tests written for lines rather than for risk.

## References

- **The loop, executed** — `references/loop-mechanics.md`. A complete red-green-refactor
  session on an instalment splitter, with the real failure output at each step — including the
  second red, where a test written to state an invariant exposed an `ArithmeticException` the
  first implementation shipped with. Read when the mechanics or step size are in question.
- **Where TDD pays, and where it does not** — `references/when-tdd-pays.md`. The conditions
  that make the loop cheap or expensive, the five situations where test-after or
  characterisation is the correct choice, and how to answer "is TDD mandatory here?" with a
  reason. Read before deciding how to approach a piece of work.
