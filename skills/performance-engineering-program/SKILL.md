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

Make good performance practice survive personnel changes. Assess the existing practice or design
an adoption program with owners, evidence and exit criteria. Preserve an adequate operating model;
a maturity badge or a universal process imposed on every service is not the goal.

## Workflow

Use the steps relevant to the requested assessment, adoption or expansion. An evidence-backed
no-change conclusion is valid; an assessment need not start a new rollout or champion program.

1. Define the decisions the program must improve: release safety, SLO protection, capacity,
   incident response or cost efficiency.
2. Assess evidence by service and dimension: user objective, representative baseline, regression
   gate, production observability, ownership/runbook and learning loop. Reuse existing artifacts,
   owners and accepted decisions; distinguish missing evidence from demonstrated absence.
3. Check the decision's prerequisites. An advanced profiler does not compensate for
   a missing measurable objective—an SLO or an explicit performance requirement appropriate to the
   workload—or a gate that silently passes without data. Limit a blocker to the decision that
   depends on it; independent evidence capture or enablement can proceed.
4. For adoption or expansion, choose a bounded wave with named services, owners, artifacts, support
   and measurable exit criteria. Pilot an unproven mechanism before standardizing it; reuse
   representative evidence already exercised.
5. Address demonstrated enablement gaps with maintained templates, peer review, office hours or
   rotating champions as appropriate. Existing maintainers may already provide the required
   coverage; a champion model needs protected time and escalation support.
6. Measure outcomes and unwanted incentives; revise the mechanism rather than gaming the score.

## Decision rules

- Treat maturity as an evidence inventory. Never average away a missing safety-critical dimension.
- Use ordinal levels only to communicate; retain the underlying evidence and gaps for decisions.
- Standardize contracts and required fields, not one tool or one numeric threshold across unlike
  workloads. Inspect service criticality, runtime/tool versions and deployment constraints before
  applying a template; the program does not authorize upgrades or new release approval gates.
- A CI performance gate is not adopted until it has representative evidence, calibrated noise,
  explicit metric direction, `pass/regression/inconclusive`, and baseline ownership.
- When using rotating champions, require practice on real services, a cadence that permits depth,
  and a maintained escalation path.
- Do not use SLO attainment, incidents or maturity scores for individual performance evaluation.
  That incentive encourages denominator changes, exclusions and suppressed reporting.
- Count activity metrics only alongside outcomes: training attendance and review coverage do not
  prove fewer regressions or faster diagnosis.

## Program scorecard

For each metric record definition, population, source/query, owner, cadence, target, missing-data
behavior and the decision it changes. Useful outcomes include regression escape rate, time from
signal to useful evidence, percentage of critical services with exercised runbooks, and recovery
of performance budgets. Report uncertainty and avoid causal claims from simple correlation.
Version the eligible-service/release population, observation window and exclusions. Show missing
coverage separately: fewer reported regressions after detection is disabled is not improvement.
Do not average service percentiles into an organization-wide percentile.

For an assessment, deliver the supported conclusion, relevant gaps and any next decision or check;
preserving the current practice can be the result. For adoption or expansion, include a bounded
wave with capacity/owners and applicable exit and pause/revision criteria. Distinguish checks
actually exercised from those planned. Keep the deliverable proportionate; an assessment alone
need not create a new central approval process.

## References

- [Maturity and rollout](references/maturity-and-rollout.md) — read when designing an assessment,
  adoption waves, champion rotation or the program scorecard.
- Use `slo-and-alerting`, `performance-regression-ci`, `continuous-profiling` and
  `performance-incident-response` for their respective artifacts.
