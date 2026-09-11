---
name: feature-readiness-review
description: >
  The intake, pre-implementation, and completion gates for a feature: first validating the
  Product/Engineering or Tech Feature baseline, then checking that nothing implementation
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

Three transitions account for most expensive feature mistakes: accepting an undefined or
unauthorized baseline, starting implementation with a blocking gap, and declaring completion without
evidence.

Starting implementation with an unresolved blocking question produces work that has to be
undone, and the cost is not the code — it is the decisions that were quietly made to fill the
gap and then depended on. Declaring completion on a green build produces a feature that
compiles, passes its own tests, and does something other than what was agreed.

Each gate has a stop condition and a return owner; “not ready” without where to return is incomplete.

## Gate 0 — definition intake

Validate the exact Product Definition plus required Engineering Analysis revisions, or the Tech Feature
revision. Establish accountable owners, depth, persistence, authority, traceability, and valid `GAP-*`
items before dependent implementation is treated as authorized. Reuse accepted revisions and
authority already established in the session; inline evidence is sufficient for an appropriately
small feature. Missing dossier files or formal IDs alone do not require renewed approval or block
discovery. A raw idea returns to
`collaborative-feature-definition`.

Return `RETURN TO PRODUCT`, `RETURN TO ENGINEERING`, or `DECOMPOSE BEFORE PROCEEDING` with affected IDs;
do not flatten every intake failure into “not ready”.

## Gate 1 — before implementation

Run the checklist in `references/readiness-checklist.md`. Each item is PASS, N/A with a reason,
or OPEN.

```text
IF any item is OPEN and blocking
THEN stop the dependent resources. Report affected IDs, evidence needed and return owner;
     continue authorized independent work. Stop everything only for a shared prerequisite.

IF an item is OPEN and non-blocking
THEN name it, name the resource it will block, and proceed to the resources it does
     not affect.

IF an item is N/A
THEN say why. "N/A" without a reason is the same as unchecked.
```

Readiness checks that the necessary decisions and planned validations exist. It does not require
implementation evidence before implementation or establish that the feature is DONE.

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
AND every DONE resource has relevant passing validation that was run and read
AND every applicable acceptance criterion is satisfied, with what checked it
AND every applicable BAC-* and TC-* traces through RES-* to observed passing EV-*
AND every changed CT-* matches its accepted authoritative version
AND every significant decision is recorded, and the records match what was built
AND every HIGH-impact risk is avoided with evidence, mitigated with verified controls,
    or linked to a valid GAP-* accepted by its accountable owner
AND no blocking question is open
AND the feature-attributable diff contains nothing that no resource names
AND the plan, progress and log are current
```

Compilation and a green build establish only the properties and modules actually checked.
Apply the project's required checks; a documentation-only feature need not acquire a Java build.
Accepted gaps retain their unverified status and cannot make an unmet Required criterion satisfied
or a resource DONE. An authorized scope amendment changes the reviewed baseline explicitly.

## Decision rules

```text
IF a Required scope item has no resource
THEN the feature is not complete, whatever the build says.

IF a resource is DONE with missing, failed, stale or insufficient validation
THEN it is not supported as DONE. Run the relevant validation when authorized or
     report the actual incomplete or blocked state; a planned EV is not observed evidence.

IF the diff contains a change no resource names
THEN establish whether it belongs to this feature, pre-existing work or another contributor.
     Classify feature changes as missed impact or added scope; preserve others' edits.

IF a decision was taken during implementation and never recorded
THEN record it now, marked as recorded retrospectively — the label matters, because
     a retrospective record is a justification and reads differently.

IF an acceptance criterion cannot be checked
THEN distinguish ambiguity from missing tools, access or evidence. Report it as unverified;
     resolve meaning with the accountable authority if needed. Do not rewrite accepted
     criteria to match the implementation or weaken them to obtain a pass.

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
- **Make the outcome and material gaps prominent.** State how failures and unavailable checks
  affect completion alongside what passed; give limitations detail proportionate to their impact.

## Output

Gates 0 and 1: reviewed revisions, checklist, open items, affected IDs, and one normalized result:
`PASS`, `PASS WITH ACCEPTED GAPS`, `RETURN TO PRODUCT`, `RETURN TO ENGINEERING`, or
`DECOMPOSE BEFORE PROCEEDING`.

State which resource set the result covers, what remains blocked, and what independent work is
clear to start. A subset PASS does not pass the whole feature or authorize deployment/publication.

Gate 2:

```text
Feature      <name>
Complete     yes | no

Requirements   <each BAC/TC/SC item -> the RES-* that satisfy it>
Not covered    <anything Required with no resource>
Scope          <anything in the diff that no resource names>
Validation     <EV-* observed; what did not run, and why>
Acceptance     <each BAC/TC-* -> EV-*>
Decisions      <recorded; any recorded retrospectively, marked as such>
Risks          <avoided | mitigated | accepted | open, with evidence and authority where needed>
Follow-ups     <future work, with what it waits on>
Unverified     <everything that could not be checked>
```

If `Complete` is no, that is the headline, and the report says exactly what remains.
