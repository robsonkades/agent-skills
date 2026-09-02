---
name: feature-readiness-review
description: >
  The two gates around implementing a feature: before, checking that nothing implementation
  depends on is still unresolved, and after, checking that what was built is what was agreed and
  that the claim of completion is supported. Use before the first line of a planned feature is
  written, when implementation is about to start with an open blocking question, when a feature
  is about to be declared done, when "done" is being claimed on a green build, when a feature
  shipped and the decisions were never written down, or when a reviewer cannot tell which parts
  of a diff were requested. Does not review the code itself for defects or design (code-review),
  does not choose the automated checks (quality-gates), and does not own the rules about what an
  agent may claim (coding-agent-discipline).
---

# Feature Readiness Review

## Purpose

Two moments account for most of the expensive mistakes in a feature, and both are transitions.

Starting implementation with an unresolved blocking question produces work that has to be
undone, and the cost is not the code — it is the decisions that were quietly made to fill the
gap and then depended on. Declaring completion on a green build produces a feature that
compiles, passes its own tests, and does something other than what was agreed.

Each gate is a checklist with a stop condition, and the stop condition is the point.

## Gate 1 — before implementation

Run the checklist in `references/readiness-checklist.md`. Each item is PASS, N/A with a reason,
or OPEN.

```text
IF any item is OPEN and blocking
THEN stop. Report the open items, ask what they need, and start nothing.

IF an item is OPEN and non-blocking
THEN name it, name the resource it will block, and proceed to the resources it does
     not affect.

IF an item is N/A
THEN say why. "N/A" without a reason is the same as unchecked.
```

The gate is not a formality to record as passed. Its value is entirely in the times it stops
work, and an agent that has never been stopped by it is not running it.

## Gate 2 — at completion

Run the review in `references/completion-review.md`. It answers one question in twelve parts:
**is this the feature that was agreed, and is the claim that it is done supported by something
that was observed?**

The two findings that matter most are the ones a code review will not produce, because they
need the analysis to detect:

- **Something in the diff that no resource names** — scope that entered without a decision.
- **Something in Required scope that no resource covers** — the feature is incomplete, and the
  green build says nothing about it.

## Completion criteria

A feature is complete when all of these hold. Not most of them:

```text
Every Required scope item is implemented
AND every resource is DONE, SKIPPED with a reason, or CANCELLED with a reason
AND every DONE resource names a validation that was run and read
AND every acceptance criterion has been checked, with what checked it
AND every significant decision is recorded, and the records match what was built
AND every HIGH risk is mitigated or accepted by someone named
AND no blocking question is open
AND the diff contains nothing that no resource names
AND the plan, progress and log are current
```

"The code compiles" and "the build is green" appear nowhere in that list. They are necessary and
they establish almost nothing about whether the right thing was built.

## Decision rules

```text
IF a Required scope item has no resource
THEN the feature is not complete, whatever the build says.

IF a resource is DONE with no validation line
THEN it is not DONE. Run the validation or move it back.

IF the diff contains a file no resource names
THEN it is scope creep or a missed impact. Name which, out loud, before completing.

IF a decision was taken during implementation and never recorded
THEN record it now, marked as recorded retrospectively — the label matters, because
     a retrospective record is a justification and reads differently.

IF an acceptance criterion cannot be checked
THEN it was written badly. Rewrite it as something observable and check that, or
     report it as unverified. Do not quietly drop it.

IF something could not be verified
THEN say so in the completion report. An unverified item reported is a known gap;
     an unverified item omitted is a false claim.

IF the feature is complete but a follow-up is obvious
THEN record it as future work. Do not implement it and call it part of this feature.
```

## Constraints

- **This is not a code review.** Defects, design and readability belong to a review of the diff;
  this gate checks the feature against what was agreed.
- **Do not pass an item because it is probably fine.** PASS means checked.
- **Do not soften the report.** What failed and what could not be run go before the summary of
  what worked.

## Output

Gate 1: the checklist, the count of open items, and either "clear to implement" or the list of
what must be answered first.

Gate 2:

```text
Feature      <name>
Complete     yes | no

Requirements   <each Required item -> the resources that satisfy it>
Not covered    <anything Required with no resource>
Scope          <anything in the diff that no resource names>
Validation     <what ran; what did not, and why>
Acceptance     <each criterion -> checked by>
Decisions      <recorded; any recorded retrospectively, marked as such>
Risks          <mitigated | accepted, by whom>
Follow-ups     <future work, with what it waits on>
Unverified     <everything that could not be checked>
```

If `Complete` is no, that is the headline, and the report says exactly what remains.
