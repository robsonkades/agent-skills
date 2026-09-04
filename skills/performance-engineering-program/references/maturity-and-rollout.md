# Maturity and rollout

## Evidence matrix

Assess each critical service independently:

| Dimension  | Minimum observable evidence                                          |
| ---------- | -------------------------------------------------------------------- |
| objective  | user journey, SLI/SLO or explicit performance requirement            |
| baseline   | versioned workload, environment, raw result and limitations          |
| prevention | review/gate that can fail or return inconclusive                     |
| production | signals that discriminate application, JVM, dependency and platform  |
| response   | owner, safe evidence capture, mitigation and rollback                |
| learning   | action item with owner, deadline and measurable acceptance criterion |

The program level is constrained by missing prerequisites, not the arithmetic mean. Publish the
raw matrix and the next action; a single label hides too much.

## Adoption waves

Start with a small, representative cohort and a concrete artifact pack. Require evidence that the
pack works before expanding: a dry-run incident, a deliberately failing regression gate, an SLO
rule test and a baseline replay. Track exceptions with owner and expiry.

Champions need time, a real service, review by the central practice and a handoff artifact. Rotate
slowly enough to acquire judgment and fast enough to distribute it. The central group owns
standards and difficult escalation; product teams retain service decisions.

## Avoid score gaming

- Missing data is `unknown`, never green.
- A metric without a stable query and owner is absent.
- Coverage does not imply effectiveness; sample reviewed artifacts and escaped incidents.
- Compare cohorts and trends cautiously; organization changes are confounders.
- Never rank people or teams with SLO/error-budget outcomes.
