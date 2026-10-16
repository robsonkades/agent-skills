# Maturity and rollout

## Evidence matrix

Select services and dimensions from the assessment's decision and criticality; assess each
independently. An explicit batch deadline, resource or cost requirement can serve as the objective
when it fits the question; an unrelated request-latency SLO is not a prerequisite.

| Dimension  | Minimum observable evidence                                          |
| ---------- | -------------------------------------------------------------------- |
| objective  | user journey, SLI/SLO or explicit performance requirement            |
| baseline   | versioned workload, environment, raw result and limitations          |
| prevention | selected review/gate and its reaction to regression/inconclusive     |
| production | signals that discriminate application, JVM, dependency and platform  |
| response   | owner, safe evidence capture, mitigation and rollback                |
| learning   | action item with owner, deadline and measurable acceptance criterion |

Record evidence location, last exercise date, environment/version and applicability per cell.
Distinguish verified, failed, unknown/stale and not-applicable-with-rationale. A document's
existence does not prove that its mechanism works. A missing prerequisite constrains the
dependent decision, not every service's entire maturity. Publish the matrix and next action;
a single label hides too much.

## Adoption waves

Choose the investment and its pilot separately. Use observed user harm, recurring escapes,
capacity/cost exposure and upcoming changes to identify the capability worth improving. Compare
the expected benefit with migration, training, measurement and maintenance costs; the easiest
coverage percentage to increase need not be the most useful investment. If impact or available
owner time would change the choice, inspect incident/cost records and team commitments, then ask
only for the unresolved trade-off. Keep uncertain benefits conditional rather than inventing ROI.

For example, a critical service with repeated regressions but no usable baseline and no available
maintainer may need an owned stabilization and baseline action before piloting a blocking gate.
A less critical service with representative runtime/workload, a baseline and protected owner
time may be the better initial gate pilot. Record the critical service's interim response, owner
and revisit condition; do not hide it by reporting only pilot coverage. Once its prerequisites
and capacity are available, its exposure can justify moving it into the wave. An unrelated easy
service cannot establish that the mechanism works for the critical workload.

When adopting or expanding a capability, start with a small cohort representative of that
expansion and a concrete artifact pack; reuse an adequate existing practice or exercised pilot.
Select checks for the capabilities being adopted: a dry-run incident for response, deliberate
regression and missing/invalid-data cases for gates, an SLO rule test for alerting, or a baseline
replay for measurement. Record skipped/inapplicable checks and their consequences. A failed
runner must not become a passing performance result. A successful exercise on one runtime or
workload does not validate all target services. Track exceptions with owner and expiry/review date.

For a release-safety capability, follow the active trigger, selected checker/configuration, result
artifact and actual release decision or responsible reviewer. Check whether filtering, skips,
continued failures or bypasses change the agreed reaction. Reuse a representative run and decision
record, or specify a safe exercise through that path; a checker unit test alone does not establish
integration. Record what the evidence covers, leaving unexercised paths conditional rather than
requiring an organization-wide audit for one pilot.

For example, a GitHub Actions performance step can fail while `continue-on-error: true` leaves its
conclusion successful. If no later step or reviewer acts on the performance result, a green job
does not demonstrate regression prevention. If the approved pilot is advisory and its owner reviews
results and records follow-up, that can demonstrate advisory adoption. If the agreed policy requires
blocking, verify that a regression or inconclusive result reaches the intended release decision;
classify the missing reaction as a scoped integration gap. Pass the evidence and required policy to
`performance-regression-ci` for detailed gate work, without changing the organization's authority.

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
for user-oriented objectives and investment priorities,
[Organizational Change](https://sre.google/workbook/organizational-change/)
for incremental adoption, staffing and migration costs, and
[Postmortem Culture](https://sre.google/workbook/postmortem-culture/)
for learning and follow-through. The prioritization example is a synthesis of these practices,
not a reported case study. These are experience-based guidance, not empirical proof
that a specific champion cadence or maturity score improves every organization.

The continued-failure example follows the GitHub Actions
[workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error)
and [step outcome/conclusion contracts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context).
It illustrates result consumption, not a requirement to use GitHub or to make every check blocking;
verify the selected CI platform/version and the organization's approved policy.
