# Completion review

Twelve checks, in this order. The first four are the ones that find problems a review of the
diff cannot, because they need the analysis to detect.

## 1. Requirements

Take each Required scope item and name the resources that satisfy it. Anything with no resource
is the finding: the feature is incomplete and nothing in the build says so.

Then the reverse: take each resource and name the scope item it traces to. Anything tracing to
nothing entered without a decision.

## 2. Scope

Compare the touched files against the plan's file list. Mechanical, and the most reliable creep
detector there is.

```text
Touched but unplanned   src/main/java/.../ShippingClient.java
                        -> necessary: the dispatch call reuses it and needed a
                           timeout parameter. Impact map missed it; amended.
Touched but unplanned   src/main/java/.../OrderMapper.java
                        -> not necessary: tidied while passing through. Reverted.
```

Both outcomes are acceptable; the unacceptable one is not noticing.

## 3. Acceptance criteria

Each criterion, and what checked it — a test identifier, a command with output, or a manual step
someone performed. A criterion checked by "the implementation does this" is unchecked.

## 4. Decisions

Every significant decision has a record, and the record describes what was actually built. This
is where planning and implementation most often diverge quietly: the record says one thing, the
code does another, and the code is right.

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

Every DONE resource names what ran. Read the list for the three failures that look like success:
a suite that selected nothing, a test that would have passed before the implementation existed,
and a build with a skipped module.

Anything that could not be validated is listed with what it does not cover.

## 8. Security

The obligations established in the readiness gate are met: authentication, authorisation on
every new entry point, what data the feature exposes and to whom, what it logs that it should
not. The negative cases are tested, not just the allowed path.

## 9. Reliability and failure behaviour

Each failure named in the requirements does what was specified. What happens on a partial
failure, a timeout, a retry, a duplicate. Whether anything can be left half-done, and what
happens to it.

## 10. Observability

An operator can tell the feature is working, and diagnose it when it is not. Concretely: the
HIGH risks in the register have a detection signal, and that signal exists in the code.

## 11. Progress and artefacts

Every resource has a terminal status. The plan matches what was built. The log has an entry for
every completion, blocker and amendment. Anyone opening the dossier tomorrow reads the current
state, not a snapshot from three days ago.

## 12. The claim

Finally, the report itself. Every claim in it maps to something observed — a command that ran,
output that was read, a file that was opened. Everything else is marked unverified.

## Report shape

```text
Feature      Asynchronous order dispatch
Complete     no — one Required item has no resource

Requirements
  S-01 dispatch is asynchronous            R-01, R-03, R-04, R-05   satisfied
  S-02 caller can observe completion       R-06                     satisfied
  S-03 duplicate dispatch is suppressed    -                        NOT COVERED
Scope
  2 unplanned files; 1 kept with the impact map amended, 1 reverted
Validation
  9 resources validated; R-06 qualified — no database harness, generated SQL
  unverified against the real engine
Acceptance
  4 of 5 checked; AC-05 depends on S-03
Decisions
  11 recorded; D-09 and D-11 recorded retrospectively during implementation
Risks
  K-02 mitigated by R-07; K-05 accepted by the user 2026-09-05
Unverified
  R-06's SQL against PostgreSQL; the migration against a production-sized table
Remaining
  S-03 blocked on Q-08. R-07 and R-08 are defined and ready once it is answered.
```

The headline is the honest one. A report that opens with what worked and mentions the gap in
the last line is technically complete and functionally a false claim.
