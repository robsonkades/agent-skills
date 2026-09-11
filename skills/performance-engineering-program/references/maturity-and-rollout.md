# Maturity and rollout

## Evidence matrix

Select services and dimensions from the assessment's decision and criticality; assess each
independently. An explicit batch deadline, resource or cost requirement can serve as the objective
when it fits the question; an unrelated request-latency SLO is not a prerequisite.

| Dimension  | Minimum observable evidence                                          |
| ---------- | -------------------------------------------------------------------- |
| objective  | user journey, SLI/SLO or explicit performance requirement            |
| baseline   | versioned workload, environment, raw result and limitations          |
| prevention | review/gate that can fail or return inconclusive                     |
| production | signals that discriminate application, JVM, dependency and platform  |
| response   | owner, safe evidence capture, mitigation and rollback                |
| learning   | action item with owner, deadline and measurable acceptance criterion |

Record evidence location, last exercise date, environment/version and applicability per cell.
Distinguish verified, failed, unknown/stale and not-applicable-with-rationale. A document's
existence does not prove that its mechanism works. A missing prerequisite constrains the
dependent decision, not every service's entire maturity. Publish the matrix and next action;
a single label hides too much.

## Adoption waves

When adopting or expanding a capability, start with a small cohort representative of that
expansion and a concrete artifact pack; reuse an adequate existing practice or exercised pilot.
Select checks for the capabilities being adopted: a dry-run incident for response, deliberate
regression and missing/invalid-data cases for gates, an SLO rule test for alerting, or a baseline
replay for measurement. Record skipped/inapplicable checks and their consequences. A failed
runner must not become a passing performance result. A successful exercise on one runtime or
workload does not validate all target services. Track exceptions with owner and expiry/review date.

Budget team/champion time and measurement infrastructure before the wave. Define the evidence
that permits expansion and what triggers revision or pause (for example false gate failures
exceeding the agreed operational budget). Keep a safe fallback for a noisy pilot gate and record
any authorized exception; do not silently weaken thresholds or replace the baseline with a regression.

If a champion model addresses a demonstrated gap, champions need time, a real service, review by
an experienced peer and a handoff artifact. Choose rotation from learning depth and continuity
needs; stable maintainers with effective peer learning and handoffs may already suffice.
The central group owns standards and difficult escalation where that structure exists; small organizations may assign
these responsibilities to existing maintainers. Product teams retain service decisions. Reuse
established authority and reserve central review for the cases that require its expertise.

## Avoid score gaming

- Missing data is `unknown`, never green.
- A metric without a reproducible definition/source and owner is unverified for scorecard use;
  investigate it rather than claiming the underlying capability is absent.
- Coverage does not imply effectiveness; sample reviewed artifacts and escaped incidents.
- Compare cohorts and trends cautiously; organization changes are confounders.
- Never rank people or teams with SLO/error-budget outcomes.

For example, report exercised runbooks as 8 of 10 eligible services, with the remaining two
unknown, rather than 8 of 8 services that submitted evidence. If eligibility changes, show the
old/new populations or comparable cohort; otherwise the trend can improve without any adoption.

Practice sources: [SRE Workbook: Implementing SLOs](https://sre.google/workbook/implementing-slos/)
for user-oriented objectives and iterative adoption, and
[Postmortem Culture](https://sre.google/workbook/postmortem-culture/)
for learning and follow-through. These are experience-based guidance, not empirical proof
that a specific champion cadence or maturity score improves every organization.
