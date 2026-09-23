# Completion review

Twelve checks, in this order. The first four compare the implementation with accepted analysis;
the diff alone cannot establish that all agreed obligations were met. Reuse relevant findings
from code review rather than requiring a duplicate investigation.

## 1. Requirements

Take each Required `SC-*` and each `BAC-*`/`TC-*` and name the `RES-*` that satisfy it. Anything with no resource
is the finding: the feature is incomplete and nothing in the build says so.

Then the reverse: take each `RES-*` and name the scope/criterion it traces to. Anything tracing to
nothing entered without a decision.

## 2. Scope

Compare feature-attributable changes against the plan's impact map. Establish the initial working
tree and distinguish pre-existing or concurrent work before attributing a diff. File lists locate
missed impact but do not prove intent; unrelated changes can share a planned file. Never revert
someone else's work to make the feature's scope check pass.

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

Each criterion, and the observed `EV-*` that checked it — a test identifier, command output, or manual step
someone performed. Record the outcome, covered assertion, implementation/contract revision and
relevant environment. Executed-but-failed or merely planned evidence does not satisfy a criterion;
results for an older revision require a justified applicability check or rerun. A criterion checked
by "the implementation does this" is unchecked.

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

Finally, the report itself. Every claim in it maps to something observed — a command that ran,
output that was read, a file that was opened. Everything else is marked unverified.

## Report shape

The following IDs and outcomes are illustrative, not execution evidence. In an actual report,
link each EV to the inspected result, checked revision and environment.

```text
Feature      Asynchronous order dispatch
Complete     no — BAC-02 unverified, BAC-03 blocked, BAC-04 has no resource

Requirements
  BAC-01 dispatch is asynchronous          RES-01, RES-03, RES-04   satisfied
  BAC-02 caller can observe completion     RES-06                   UNVERIFIED
  BAC-03 duplicate dispatch is suppressed  RES-07, RES-08           BLOCKED on Q-08
  BAC-04 dispatch audit is available       -                        NOT COVERED
Scope
  2 unplanned files; 1 kept with the impact map amended, 1 reverted
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
