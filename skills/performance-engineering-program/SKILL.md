---
name: performance-engineering-program
description: >
  Establishing an organization-wide performance engineering program through measurable maturity
  evidence, service ownership, SLO and baseline adoption, regression gates, incident learning and
  a rotating champion model. Use when performance depends on one specialist, teams apply different
  evidence standards, a maturity assessment needs concrete next actions, or a rollout must turn
  isolated profiling into a durable operating discipline. Does not design individual SLOs,
  benchmarks, alerts or profiles; their specialist skills own those artifacts.
---

# Performance Engineering Program

## Purpose

Make good performance practice survive personnel changes. The output is an adoption program with
owners, evidence and exit criteria, not a maturity badge or a universal process imposed on every
service.

## Workflow

1. Define the decisions the program must improve: release safety, SLO protection, capacity,
   incident response or cost efficiency.
2. Assess evidence by service and dimension: user objective, representative baseline, regression
   gate, production observability, ownership/runbook and learning loop.
3. Find the weakest dependency. An advanced profiler does not compensate for an undefined SLO or a
   gate that silently passes without data.
4. Choose one adoption wave with named services, owners, artifacts, support and measurable exit
   criteria. Pilot before standardizing.
5. Build enablement: maintained templates, office hours, reviewed examples and rotating champions
   with protected time and escalation support.
6. Measure outcomes and unwanted incentives; revise the mechanism rather than gaming the score.

## Decision rules

- Treat maturity as an evidence inventory. Never average away a missing safety-critical dimension.
- Use ordinal levels only to communicate; retain the underlying evidence and gaps for decisions.
- Standardize contracts and required fields, not one tool or one numeric threshold across unlike
  workloads.
- A CI performance gate is not adopted until it has representative evidence, calibrated noise,
  explicit metric direction, `pass/regression/inconclusive`, and baseline ownership.
- A champion program distributes judgment only when champions practice on real services, rotate at
  a cadence that permits depth, and have a maintained escalation path.
- Do not use SLO attainment, incidents or maturity scores for individual performance evaluation.
  That incentive encourages denominator changes, exclusions and suppressed reporting.
- Count activity metrics only alongside outcomes: training attendance and review coverage do not
  prove fewer regressions or faster diagnosis.

## Program scorecard

For each metric record definition, population, source/query, owner, cadence, target, missing-data
behavior and the decision it changes. Useful outcomes include regression escape rate, time from
signal to useful evidence, percentage of critical services with exercised runbooks, and recovery
of performance budgets. Report uncertainty and avoid causal claims from simple correlation.

## References

- [Maturity and rollout](references/maturity-and-rollout.md) — read when designing an assessment,
  adoption waves, champion rotation or the program scorecard.
- Use `slo-and-alerting`, `performance-regression-ci`, `continuous-profiling` and
  `performance-incident-response` for their respective artifacts.
