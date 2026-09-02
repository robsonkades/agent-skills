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

The unit is one resource, taken all the way, then recorded. Nothing else starts until it is.

## The loop

```text
Pick the next resource from the execution order
        |
Mark IN_PROGRESS, record the start
        |
Implement it, and only it
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
resource is not DONE until its validation has been run and read**, and **the progress artefact
is updated before the next resource starts**, not at the end of the session.

## Workflow

1. **Take the next unblocked resource** in the execution order. Unforced ordering means a
   blocked resource does not stop unrelated work — check the forced arrows before stalling.
2. **Read the code you are about to change**, including its callers and its tests, before
   editing. The plan named the files; it did not read them for you.
3. **Implement to the project's conventions** as the context report established them, reusing
   what exists rather than adding a parallel mechanism.
4. **Validate at the level the resource warrants** (`references/validation-by-resource.md`).
   Not every resource earns an integration test; every resource earns something, and the
   validation was written when the resource was defined.
5. **Read the output.** A suite that ran zero tests exits successfully.
6. **Record the outcome** with what actually ran, then move on.
7. **When implementation contradicts the plan or a decision**, stop and handle it
   (`references/deviation-and-blockers.md`) before writing more code.

## Decision rules

```text
IF a resource is larger than it looked and splits naturally
THEN split it in the plan, with both halves recorded, and implement the first.

IF implementing R-n reveals that R-m is unnecessary
THEN mark R-m CANCELLED with the reason. Do not silently skip it.

IF implementation needs a decision that was never taken
THEN it is a blocker if it is user-confirmed, and a recorded decision if it is
     agent-owned. It is never an unrecorded choice made in passing.

IF a test that already existed fails
THEN it is a finding about this change until proven otherwise. Do not adjust the
     test to accommodate the feature without saying why the old assertion was wrong.

IF the work touches a file no resource names
THEN either the impact map missed it — amend it — or it is scope creep. Decide which,
     out loud.

IF a resource cannot be validated as planned
THEN the validation changes before the resource is marked, and the change is recorded.
     Choosing an easier check after the fact is how DONE stops meaning anything.

IF the session is ending mid-resource
THEN leave it IN_PROGRESS with a note saying exactly where it stands and what is next.
```

## Constraints

- **One resource at a time.** Parallel half-finished resources have no status that is true.
- **Keep the diff to the resource.** Improvements to code you passed through are findings, not
  edits — the scope rules do not relax during implementation.
- **Preserve behaviour that is not in scope.** A refactor that is necessary to implement the
  resource is part of it and is said so; a refactor that is merely improving is not.
- **Never weaken a check to make it pass.** Deleting, disabling or loosening a test to get to
  DONE converts a real signal into a false one, and the next person inherits both.
- **Report what ran.** The command, and what it printed. Not "tests pass".

## Output

Per resource, one entry:

```text
R-04  Dispatch status endpoint            DONE
      Files       api/DispatchStatusController.java (new)
                  api/DispatchStatusResponse.java (new)
                  api/ApiRoutes.java:31 (modified)
      Validation  ./mvnw test -Dtest=DispatchStatusControllerTest
                  4 tests, 4 passed — covers found, not-found, and unauthorised
      Notes       Reused the existing ProblemDetail error shape (11 controllers,
                  no counter-example), so no new error type was introduced.
```

At the end of a run: what was completed, what is blocked and on what, what changed in the plan,
and what was not verified.
