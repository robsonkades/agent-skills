---
name: feature-execution
description: >
  Implementing a planned feature one resource at a time: taking a single resource to done,
  choosing the validation that resource actually warrants, running it and reading the output,
  and handling the two things that always happen — the plan turning out to be wrong, and a
  resource turning out to be blocked. Use when a plan exists and implementation is starting,
  when several resources are half-finished at once, when implementation has diverged from the
  plan without anyone recording it, when a resource is blocked and the work has quietly stopped,
  or when a change is about to be reported as done on the strength of it compiling. Does not
  choose which automated gates a change must pass (quality-gates), does not decide the test
  level or write the tests (java-testing-strategy, tdd), does not own the status artefacts
  (feature-progress-tracking), and does not own what may be claimed about the result
  (coding-agent-discipline).
---

# Feature Execution

## Purpose

Two failure shapes, and both are about the unit of work.

Implementing everything at once produces a large diff in which nothing is finished, no part is
validated, and a blocker anywhere stops all of it. Implementing without closing the loop
produces resources that are "done" in the sense that code was written for them, which is
discovered to be a different thing at review.

The unit is a coherent, verifiable resource or tightly coupled group. Limit active work per
owner; independent resources can proceed in parallel when authorized, with explicit file
ownership and integration checks. A blocked resource does not lock the entire feature.

## The loop

```text
Pick the next resource from the execution order
        |
Mark IN_PROGRESS, record the start
        |
Implement its coherent scope and necessary dependencies
        |
Run its validation and read the output
        |
   +----+----+
Passed     Failed or blocked
   |          |
Mark DONE   Fix, or mark BLOCKED with the reason
with the      and the decision it needs
validation    |
   |          |
Update progress and the log
        |
Next resource
```

Two rules keep the loop honest, and they are the ones that get skipped under pressure: **a
resource is not DONE until its required validation has passed and been read**, and **progress
is durable at material transitions and handoffs**. Use the existing tracking convention;
Light/Inline work need not create an artifact solely to document sub-minute steps.

## Workflow

1. **Take the next unblocked resource** in the execution order. Unforced ordering means a
   blocked resource does not stop unrelated work — check the forced arrows before stalling.
2. **Read the code you are about to change**, including its callers and its tests, before
   editing. Inspect the working tree and relevant JDK/toolchain/dependency/runtime settings;
   preserve other contributors' changes. The plan named files; it did not read them for you.
3. **Implement to the project's conventions** as the context report established them, reusing
   what exists rather than adding a parallel mechanism.
4. **Validate at the level the resource warrants** (`references/validation-by-resource.md`).
   Reuse meaningful existing checks; do not add tests merely to mirror a reversible edit.
   If planned validation is missing or inadequate, define the needed evidence before completion.
5. **Read the output.** A suite can exit successfully while running zero relevant tests.
6. **Record the outcome** with what actually ran, then move on.
7. **When implementation contradicts the plan or a decision**, classify the affected work
   (`references/deviation-and-blockers.md`), reconcile the plan and continue independent work.

## Decision rules

```text
IF a resource is larger than it looked and splits naturally
THEN split it with dependency and acceptance traceability; group tightly coupled edits when
     artificial separation would leave neither resource independently verifiable.

IF implementing RES-n reveals that RES-m is unnecessary
THEN mark RES-m CANCELLED with the reason. Do not silently skip it.

IF implementation needs a decision that was never taken
THEN check existing user authorization and delegated authority; take routine in-scope choices.
     Record unresolved material choices as proposals and block only dependent actions.

IF a test that already existed fails
THEN investigate whether the failure is caused by this change, an intended contract change,
     the environment or a pre-existing problem. Do not assume causation or silence failure.
     Update assertions only for justified changed requirements, preserving relevant coverage.

IF the work touches a file no resource names
THEN either the impact map missed it — amend it — or it is scope creep. Decide which,
     out loud.

IF a deviation changes BAC-*, CT-*, TC-*, or an accepted baseline
THEN stop affected work, create a revision-impact entry, and return to the accountable phase.

IF a resource cannot be validated as planned
THEN record the missing evidence and use an alternative only if it covers the required
     acceptance contract. A material unverified property prevents DONE; a weaker check is
     useful partial evidence, not a substitute for the missing guarantee.

IF the session is ending mid-resource
THEN preserve its true IN_PROGRESS or BLOCKED state, with exactly what remains and what is next.
```

## Constraints

- **Bound work in progress and preserve ownership.** One coherent active unit per owner is
  the default. Parallel work needs explicit dependencies, shared-file coordination and
  integration validation; never revert another owner's edits to make a local check pass.
- **Keep the diff to the resource.** Improvements to code you passed through are findings, not
  edits — the scope rules do not relax during implementation.
- **Preserve behaviour that is not in scope.** A refactor that is necessary to implement the
  resource is part of it and is said so; a refactor that is merely improving is not.
- **Never weaken a check to make it pass.** Deleting, disabling or loosening a test to get to
  DONE converts a real signal into a false one, and the next person inherits both.
- **Report what ran.** Capture command, relevant counts/results, revision/environment and
  limitations. Summarize output; do not paste secrets or imply skipped tests executed.

## Output

Per resource, one entry:

```text
RES-04 Dispatch status endpoint            DONE
      Files       api/DispatchStatusController.java (new)
                  api/DispatchStatusResponse.java (new)
                  api/ApiRoutes.java:31 (modified)
      Evidence    EV-14 ./mvnw test -Dtest=DispatchStatusControllerTest
                  4 tests, 4 passed — covers found, not-found, and unauthorised
      Notes       Reused the existing ProblemDetail error shape (11 controllers,
                  no counter-example), so no new error type was introduced.
```

At the end of a run: what was completed, what is blocked and on what, what changed in the plan,
and what was not verified.
