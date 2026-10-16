# Completion review

Twelve checks, in this order. The first four compare the implementation with accepted analysis;
the diff alone cannot establish that all agreed obligations were met. Reuse relevant findings
from code review rather than requiring a duplicate investigation.

## 1. Requirements

Start from the accepted requirements themselves, not only the rows copied into the progress report.
Take each Required `SC-*` and each `BAC-*`/`TC-*` and name the `RES-*` that satisfy it. Anything with no
resource is the finding: the feature is incomplete and nothing in the build says so.

Then the reverse: take each `RES-*` and name the scope/criterion it traces to. Anything tracing to
nothing entered without a decision.

For SKIPPED or CANCELLED resources, inspect the authorized disposition and replacement coverage.
A terminal status does not remove a Required criterion. A replacement awaiting validation is
still open; an accepted change to scope must be visible in the baseline being reviewed.

## 2. Scope

Compare feature-attributable changes against the plan's impact map. Establish the initial working
tree and distinguish pre-existing or concurrent work before attributing a diff. File lists locate
missed impact but do not prove intent; unrelated changes can share a planned file. Never revert
someone else's work to make the feature's scope check pass.

The following dispositions assume scoped corrections and record updates were authorized. In a
findings-only review, recommend these dispositions without applying them or claiming they occurred.

```text
Touched but unplanned   src/main/java/.../ShippingClient.java
                        -> necessary: the dispatch call reuses it and needed a
                           timeout parameter. Impact map missed it; amended.
Touched but unplanned   src/main/java/.../OrderMapper.java
                        -> not necessary: this feature's own incidental cleanup.
                           Reverted only those hunks; preserved concurrent edits.
```

Both outcomes are acceptable; the unacceptable one is not noticing.

## 3. Acceptance criteria

Follow each criterion's `RES-*` and `EV-*` to the supporting source. Open the retained result or
manual verification record and inspect the relevant assertion, inspected artifact or procedure:
what property did it check, for which inputs and paths, and what was actually observed? Record the
source locator, outcome, covered assertion, implementation/contract revision and relevant environment.
A valid ID, existing file or PASS label alone does not establish its claimed coverage. Resolve stale
locators using available project evidence. If the supporting result remains unavailable, report the
affected criterion as unverified; do not infer a product defect.

Executed-but-failed or merely planned evidence does not satisfy a criterion; results for an older
revision require a justified applicability check or rerun. Direct inspection can establish a static
criterion, such as required documentation or an accepted dependency boundary, when the report names
the inspected locations, assertion and result. Code presence alone cannot establish successful
deployment or recovery in a target environment. Reuse sufficient, applicable results without
rerunning every check; match the evidence to the criterion rather than demanding execution for every
static obligation or treating every passing test as proof.

For a criterion spanning resources, check that the evidence covers the required interaction and
observable outcome. Passing producer and consumer tests separately may leave the actual delivery
path unverified. Reuse sufficient integration evidence, inspection or analysis where appropriate;
do not mandate a new end-to-end suite merely because several resources participate.

Check conditions that can invalidate an EV without changing the candidate revision: configuration
and feature flags, dependency versions, permissions, data shape, workload and observation window,
where relevant to the criterion. Record the material difference and why evidence transfers, or
identify the affected assertion that needs new evidence. For example, a recovery drill within the
agreed time limit can support the tested data volume; if the reviewed volume has grown beyond that
coverage, the recovery criterion is unverified until supported at that volume or by justified
analysis. Unchanged, applicable conditions allow reuse; time elapsed alone does not invalidate
every result. A deliberate narrowing of scope needs an accepted baseline change.

## 4. Decisions

Every significant decision has a record. When implementation diverges, determine whether it is a
defect against the accepted contract or evidence that invalidates the decision. Return a defect
for correction. If evidence warrants a changed decision, use existing authority or obtain the
missing decision before accepting affected work. Implementation alone is not authority to rewrite
what was agreed. Check affected records and validation against the resulting accepted baseline.

Decisions taken during implementation and recorded now are marked as recorded retrospectively.
The label is not bureaucracy — a retrospective record captures the justification rather than the
reasoning, and a later reader needs to know which they are holding.

## 5. Architecture

The built shape matches the agreed one. Where it does not, either the plan was amended and says
so, or the divergence is a finding.

## 6. Standards and conventions

The code follows the patterns the context report established, and any deliberate departure is
recorded with its reason. A feature that is the only place in the system doing something is
either an improvement worth stating or an inconsistency worth fixing; both need a sentence.

## 7. Validation

Every DONE resource names relevant passing evidence, not just what ran. Check for a suite that
selected nothing, a test that does not exercise its claimed new behavior, and a build that skipped
an affected module. Existing regression tests may legitimately pass before and after; they support
preservation of covered behavior, not proof that the new behavior exists.

When results conflict, retain the contrary evidence and compare assertions, revisions, inputs and
conditions. A later green rerun does not by itself resolve a relevant failure. Identify whether
the discrepancy is in the product, the check or its environment, and what evidence resolves it;
return defect investigation to code review when needed. Until resolved, keep the affected criterion
failed or unverified as supported by the evidence, even if unrelated checks pass.

Anything that could not be validated is listed with what it does not cover. A valid accepted gap
records authority and residual consequence; it does not turn unavailable evidence into a pass.
When acceptance depends on that evidence, report the feature incomplete under the current baseline.

## 8. Security

The obligations established in the readiness gate are met: authentication, authorisation on
every new entry point, what data the feature exposes and to whom, what it logs that it should
not. The negative cases are tested, not just the allowed path.

## 9. Reliability and failure behaviour

Each failure named in the requirements does what was specified. What happens on a partial
failure, a timeout, a retry, a duplicate. Whether anything can be left half-done, and what
happens to it.

## 10. Observability

Check applicable operational criteria and HIGH-impact risks against their detection plans. Verify
the mechanism, responsible role and detection/response window with evidence: telemetry,
reconciliation or a manual check may be appropriate. Code presence alone does not prove coverage.
Retain detection gaps and their disposition; a valid accepted gap does not satisfy an unmet Required
criterion. Evidence-backed avoided risks need no invented signal for a failure path that no longer
exists within the reviewed scope.

## 11. Progress and artefacts

Every resource has a terminal status. The plan matches what was built. The log has an entry for
every completion, blocker and amendment. Anyone opening the dossier tomorrow reads the current
state, not a snapshot from three days ago.

## 12. The claim

Before a clean verdict, challenge the support most likely to hide a material gap: an exclusion,
skipped resource, boundary interaction or check covering only part of a Required criterion. Follow
that claim to its source and look for a concrete counterexample within the agreed scope. For
example, a passing request-submission test does not establish the separately required downstream
completion; inspect the assertion and delivery-path evidence before accepting that mapping.
Reuse sufficient contrary-case coverage already examined. This is a focused scrutiny step, not a
requirement for another reviewer, a new test suite or an expansion of the accepted requirements.

Every final claim maps to inspected evidence. State which material paths or obligations remain
unexamined when access or review limits prevent a full result. A sampled check cannot stand in for
the complete Required-criterion mapping; a partial review supports only its explicitly reviewed scope.

## Report shape

The following IDs and outcomes are illustrative, not execution evidence. In an actual report,
link each EV to the inspected result, checked revision and environment.

```text
Feature      Asynchronous order dispatch
Reviewed     Accepted baseline r3; candidate <inspected revision/snapshot>; full implementation scope
Complete     no — BAC-02 unverified, BAC-03 blocked, BAC-04 has no resource

Requirements
  BAC-01 dispatch is asynchronous          RES-01, RES-03, RES-04   satisfied
  BAC-02 caller can observe completion     RES-06                   UNVERIFIED
  BAC-03 duplicate dispatch is suppressed  RES-07, RES-08           BLOCKED on Q-08
  BAC-04 dispatch audit is available       -                        NOT COVERED
Scope
  2 unplanned files; propose an impact-map amendment for one and removal of the incidental cleanup
  No changes applied by this findings-only review
Validation
  RES-01/03/04 DONE: EV-01 covers their BAC-01 behavior and passed for the current revision
  RES-06 BLOCKED: implemented, but required SQL validation cannot run without the database harness
  RES-07/08 BLOCKED: implementation depends on Q-08; no passing mitigation evidence
Acceptance
  BAC-01 -> EV-01, satisfied; BAC-02/03 have no passing EV; BAC-04 has neither RES nor EV
Decisions
  11 recorded; ED-09 and ED-11 recorded retrospectively during implementation
Risks
  RISK-02 open: planned controls in RES-07/08 are blocked, not verified mitigation
  RISK-05 accepted under currently valid GAP-02 by Operations; no Required criterion waived
Unverified
  RES-06's SQL against PostgreSQL; duplicate-dispatch behavior in RES-07/08
Remaining
  RES-06 needs the database harness and passing validation.
  Resolve Q-08, then recheck affected plan/readiness before RES-07/08 resume.
  Return BAC-04 to Engineering for its missing resource and validation plan.
```

Lead with the completion result and material gaps that determine it. Report unavailable or failed
checks with their actual effect on that result; keep non-blocking limitations visible without
presenting them as unmet Required criteria.

## Evidence basis

- [NASA Systems Engineering Handbook, Product Verification](https://www.nasa.gov/reference/5-3-product-verification/)
  supports recording requirement/product versions, verification conditions and discrepancies, and
  checking interactions for system-level outcomes. Use these evidence principles proportionately;
  this skill does not impose NASA approval procedures on a project.
- [Google SRE Workbook, Canarying Releases](https://sre.google/workbook/canarying-releases/)
  explains why configuration, representative traffic, duration and metric attribution affect a
  release observation. These limits inform evidence applicability when operational acceptance is
  in scope; canary deployment is not a requirement of this review.
