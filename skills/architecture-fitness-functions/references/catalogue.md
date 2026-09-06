# Choosing a measurement, site and response

## Placement follows evidence

| Evidence needed                                     | Candidate site                              | Decision before enforcement                                                   |
| --------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Source/bytecode/configuration in the change         | PR or build                                 | Confirm selection/import scope, positive detection and runtime cost           |
| Representative environment, load or migration state | Integration/pre-release or scheduled run    | Define environment, variance, safe failure injection and maximum evidence age |
| Runtime outcomes or external feeds                  | Production monitoring and/or scheduled scan | Define population/window, freshness, response time and owner                  |
| Interpretation of intent or evolving policy         | Recorded human review                       | Provide rubric, evidence, cadence and escalation for disagreement             |

Temporal checks can also run on a PR: dependency age changes with time and a PR can introduce an
already obsolete dependency. Comparative performance thresholds can gate a PR if evidence is
reliable enough. Lagging outcomes can inform release policy, but cannot by themselves establish
that the current change caused a regression. Classification is a description, not a placement ban.

One characteristic can need both a structural gate and a runtime monitor. A scheduled failure
may justify a release hold; an alert need not page somebody if a ticket meets the required
response time. Tailor policy to impact and detection delay, not a taxonomy cell.

## Candidate controls and their limits

| Property                    | Candidate assessment                                                         | Policy and coverage caution                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dependency direction/cycles | Violations over named imported components                                    | Prove a hostile dependency is detected; missing imports can hide violations                                           |
| Contract compatibility      | Diff plus supported-consumer verification                                    | Version bumps do not make breaking a deployed consumer safe; check rollout compatibility                              |
| Latency/resilience          | Latency and errors for defined work/faults                                   | Require representative offered load, samples and evidence freshness; errors/timeouts cannot disappear from the result |
| Availability                | Defined SLI and window against a target                                      | State good/eligible events and no-data behavior; response policy need not be a universal deploy freeze                |
| Dependency vulnerabilities  | Findings in the resolved/shipped graph with feed age                         | Separate new-introduction policy, remediation deadlines, applicability and approved exceptions                        |
| Maintainability             | Boundary assertions, test evidence and a representative change/review rubric | These are partial evidence, not a universal numeric definition                                                        |
| Privacy/accessibility       | Automated rules plus selected journey/content review                         | Zero pattern matches or zero scanner findings does not prove complete coverage                                        |
| Migration safety            | Compatibility with running versions and actual migration behavior            | An expand/contract annotation alone does not prove safety                                                             |
| Deployability               | Deployment rehearsal/rollback checks plus failure/lead-time trends           | Trends have confounders; deployability can also have a direct pre-release check                                       |

Use `performance-regression-ci` for statistical performance thresholds and `slo-and-alerting`
for operational budgets. [Google's example error-budget policy](https://sre.google/workbook/error-budget-policy/)
is a concrete policy with context, not a rule to copy into every service.

## Security example: the policy must survive translation

A policy saying “remediate high-severity findings within 14 days” defines a deadline, not an
automatic prohibition on all builds on day zero. Establish the clock origin, severity/applicability
rules, introduced versus existing findings, deadline action and exception authority. A separate
policy can prohibit new vulnerable dependencies immediately; do not silently invent it.

[Dependency-Check Maven documentation](https://dependency-check.github.io/DependencyCheck/dependency-check-maven/check-mojo.html)
documents a default failBuildOnCVSS of 11 on a 0–10 scale, which does not block on vulnerability
scores. A report being produced therefore does not prove enforcement. Confirm the installed
version, threshold boundary, suppression behavior, scan scope and feed-update/error behavior.
Use a safe fixture to prove both finding detection and the actual CI decision; do not introduce
a real vulnerable production dependency for the demonstration.

Exploit evidence can affect priority, but a universal zero-finding rule must come from the
applicable policy. Treat unknown applicability, stale feeds and scan failures as explicit
inconclusive evidence with a specified response, not clean scans.

## Baselines and proxies

[ArchUnit's freezing rules](https://www.archunit.org/userguide/html/000_Index.html#_freezing_arch_rules)
store known violations and report new ones; with store updates enabled, resolved violations
are removed so their return can be detected. This does not force progress by a deadline.
Protect the store in CI and review intentional refreezes; distinguish retaining a known baseline
from silently accepting newly introduced violations.

Distance from the main sequence measures a relationship between abstractness and instability,
not cohesion. Do not require it to fall everywhere or add interfaces just to improve the number.
Complexity and coverage are also proxies: coverage measures execution, not assertion quality;
mutation testing examines sensitivity to selected mutations and still has coverage/equivalent-mutant
limits. Validate representative defects rather than claiming a score guarantees meaningful tests.

For maintainability, combine only evidence relevant to the concern: structural boundaries,
time/effort on representative changes, review of domain ownership, and test feedback. Record what
each misses. A human scenario review may cover some residual; remaining uncertainty need not mean
the entire characteristic is ungoverned.

## Tool selection

Use the repository's actual tool/version and primary documentation when implementing. Record
language/runtime compatibility, permissions, scope, data sources, failure behavior and fixture
results. Release recency alone does not establish suitability or abandonment. This reference
does not maintain a speculative latest-version table.
