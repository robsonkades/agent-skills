---
name: feature-execution
description: >
  Implementing an authorized plan through coherent, verifiable resources: selecting ready work,
  implementing within accepted scope, running relevant checks and reading their results, and
  reconciling deviations and blockers. Use when implementation is starting, too many resources are
  partly finished, code diverges from the plan, a blocked resource has stalled unrelated work, or
  compilation is being treated as completion. Does not select repository gate policy (quality-gates),
  own test-design methods (tdd; java-testing-strategy for Java), maintain the status format
  (feature-progress-tracking), or define reporting discipline (coding-agent-discipline).
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

1. **Resume the current authorized plan.** Inspect its scope/acceptance revision, resource IDs,
   recorded progress and evidence. Reuse existing implementation authorization and delegation;
   an accepted definition or request to review a plan alone does not request implementation.
   Take the next ready resource, checking its implementation prerequisites and ownership.
   Unforced ordering means a blocked resource does not stop unrelated authorized work.
2. **Read the code you are about to change**, including its callers and its tests, before
   editing. Inspect repository instructions, the working tree and the actual language, build,
   dependency and runtime settings; preserve other contributors' changes and compatibility.
   The plan named files; it did not read them for you, and does not authorize a toolchain upgrade.
3. **Implement to the project's conventions** as the context report established them, reusing
   what exists rather than adding a parallel mechanism.
4. **Validate at the level the resource warrants** (`references/validation-by-resource.md`).
   Reuse meaningful existing checks; do not add tests merely to mirror a reversible edit.
   If planned validation is missing or inadequate, define the needed evidence before completion.
   Confirm the executed artifacts and effective configuration include the relevant changes;
   satisfy build/generation prerequisites without discarding valid incremental results.
   Use the project's test strategy and tools; route to `java-testing-strategy` for Java-specific
   choices. Test methods and gate policies guide implementation without changing its target stack.
5. **Read the output.** A suite can exit successfully while running zero relevant tests.
   Inspect changes made by validation commands or their hooks; recheck affected properties if
   later generated or rewritten inputs no longer match what the tests exercised.
6. **Record the outcome** with what actually ran, then move on.
7. **When implementation contradicts the plan or a decision**, classify the affected work
   (`references/deviation-and-blockers.md`), reconcile the plan and continue independent work.

## Decision rules

```text
IF a resource is larger than it looked and splits naturally
THEN split it with dependency and acceptance traceability; group tightly coupled edits when
     artificial separation would leave neither resource independently verifiable.
     Preserve existing IDs/history, record the split mapping, and reassess affected evidence.

IF implementing RES-n reveals that RES-m is unnecessary
THEN show where its accepted obligation remains covered, or cite the authorized revision
     removing that obligation, before marking CANCELLED. Do not drop promised work by relabeling it.

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
THEN distinguish a bug from evidence requiring a changed premise. Fix the bug against the
     accepted contract; for a necessary baseline revision, pause affected decision-dependent
     actions, record the impact and return to its accountable phase using existing authority.

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
  the artifact or deployed target actually exercised. Record uncertain provenance as a limitation;
  a current checkout does not establish a remote target's revision. Summarize output; do not
  paste secrets or imply skipped tests executed.
- **Honor the requested delivery boundary.** Local implementation and passing checks do not
  themselves authorize publication, deployment or a production migration.

## Output

Per resource, one entry. This hypothetical Java example illustrates the evidence record;
use the actual project's paths, runner, revisions and observed results:

```text
RES-04 Dispatch status endpoint            DONE
      Traces to   BAC-03, TC-04, CT-02 at their accepted revisions
      Files       api/DispatchStatusController.java (new)
                  api/DispatchStatusResponse.java (new)
                  api/ApiRoutes.java:31 (modified)
      Evidence    EV-14 ./mvnw test -Dtest=DispatchStatusControllerTest
                  4 tests, 4 passed — covers found, not-found, and unauthorised
      Checked     <code revision and relevant local diff; actual JDK/test environment>
      Notes       Reused the existing ProblemDetail error shape (11 controllers,
                  no counter-example), so no new error type was introduced.
```

At the end of a run: what was completed, what is blocked and on what, what changed in the plan,
and what was not verified. Recheck affected resources when later edits invalidate their evidence;
resource completion does not by itself establish feature completion or release readiness.
