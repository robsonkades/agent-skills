---
name: quality-gates
description: >
  Choosing which automated checks a change must pass, and making them cheap enough that they
  stay switched on: matching the gate set to the change's risk rather than running everything
  on everything, where each gate belongs (pre-commit, pull request, main, release), the Java
  toolchain that enforces each class of defect, ratcheting a gate onto a codebase that already
  violates it, and what to do when a gate goes red. Use when setting up or trimming a
  pipeline, when the build is slow enough that people push without running it, when a check is
  routinely bypassed or its failures ignored, when a defect class keeps reaching production,
  when a coverage or static-analysis threshold is being proposed, or when deciding whether a
  small change really needs the full pipeline. Does not cover writing the tests
  (java-testing-strategy), architecture rules (architecture-testing), performance thresholds
  (performance-regression-ci), or human review (code-review).
---

# Quality Gates

## Purpose

A gate reports evidence about a defined defect class within its checked scope and assumptions.
Its value is the defects it stops; its cost is paid by every change, including the ones that
could never have contained that defect.

Two failure modes. The pipeline that runs everything on everything becomes slow enough that
people work around it — and a bypassed gate protects nothing while still costing the wait. The
pipeline that gates nothing leaves preventable defects to review or production, where detection
and recovery can be harder.

## Workflow

1. **Name the defect classes that actually reach your production**, from incidents and from
   review comments, plus prospective material risks. Inspect existing required checks, versions
   and accepted exception policy first; this skill does not authorize bypassing them.
2. **Assign each class to the cheapest mechanism that catches it**: the compiler, a static
   analyser, a test, a review. Repeated human findings suggest an automation candidate when
   detection is reliable enough; contextual judgment may remain a review responsibility
   (code-review).
3. **Place each gate where its cost is bearable** (`references/gate-catalogue.md`): seconds
   pre-commit, minutes on the pull request, longer on main, longest at release.
4. **Select per change, by risk** (`references/selecting-gates.md`). A README edit and a schema
   migration should not face the same pipeline, and pretending they do is how the pipeline
   becomes something to be endured.
5. **Choose an adoption path from the findings.** For a large existing backlog, consider scoped
   rollout or a reviewed baseline while failing new violations. Triage urgent security and
   correctness risks first; age alone does not justify exemption. Read the catalogue's ratcheting
   procedure before creating a baseline.
6. **When a gate goes red, classify the failure.** Distinguish a product defect, invalid runner,
   flaky check and deliberate policy finding. Fix the cause; changes to enforcement or temporary
   exceptions need the repository's existing authority and a record of the remaining risk.
7. **Verify a changed gate itself.** Use a known passing change, a representative violating
   fixture and a failed/missing-evidence run. Check selection, process exit status and final CI
   status, including any wrapper or report upload; expected failures must not turn into success.

## Rules

- Every gate needs a stated defect class it prevents. A check that is enabled because it came
  with the template will be the first one someone disables under deadline, and nobody will know
  what was lost.
- Make deterministic checks reproducible and calibrate inherently noisy checks. Distinguish
  product failures, infrastructure failures and insufficient evidence; retain retries instead
  of rerunning until green. Vulnerability-feed updates can legitimately change a result.
- Treat feedback time as an operational budget. Measure queue/runtime, bypasses and escaped
  defects before moving checks; ten minutes is not a universal behavioral threshold.
- Give warnings a deliberate disposition: blocking, tracked advisory or justified suppression.
  `javac -Xlint:all -Werror` fails the build on
  warnings; a warning nobody must act on is output nobody reads (verified: with `-Werror`,
  javac reports `error: warnings found and -Werror specified`).
- Coverage is execution evidence, not assertion quality. A calibrated coverage ratchet can
  complement behavioral tests; preserve an existing required threshold unless changing it is
  in scope. Report uncovered relevant paths and exclusions rather than chasing a universal number
  (java-testing-strategy).
- Use the established exception policy where one exists; do not create a bypass for a
  non-exceptionable gate. Permitted exceptions need the accepted scope, accountable owner,
  compensating checks and expiry/follow-up, recorded where reviewers can see them.
- Suppressions carry a reason and an owner: `@SuppressWarnings("unchecked") // JDBC row map,
checked by the query's projection`. A bare suppression is a silent removal of the gate at
  that line.
- The gate set is not the definition of done. Passing checks establishes only their tested
  properties under the observed conditions, not absence of the entire defect class or fulfillment
  of the request (requirements-and-acceptance).
- Pin build inputs and record toolchain/dependency versions; do not silently upgrade them to
  enable a gate. Time-varying inputs such as vulnerability databases need source/version and
  evaluation timestamps so changed results remain explainable.

Return the selected gates and the risks they cover, material alternatives or exclusions, actual
results and remaining required evidence. For implementation, include the configuration changes
and evidence that enforcement works; selecting a gate set alone does not complete implementation.

## References

- **The gate catalogue** — `references/gate-catalogue.md`. Candidate gates for a Java build:
  the evidence each provides, placement and calibration considerations, and how to ratchet one
  onto an existing codebase. Read when adding, moving or
  removing a check.
- **Selecting gates for a change** — `references/selecting-gates.md`. Risk tiers with the gate
  set each warrants, five worked changes from a docs typo to a hotfix under incident, and the
  rules for what may legitimately be skipped and what may never be. Read when deciding what
  this particular change must pass.
