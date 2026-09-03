---
name: slo-and-alerting
description: >
  Engineering service-level contracts and actionable alerting: defining user-centered SLIs
  and SLOs with explicit populations and windows, negotiating error-budget policy,
  separating request- and time-based semantics, deriving multi-window burn alerts, handling
  low traffic and missing data, and routing symptoms or predictive hazards by urgency and
  actionability. Use when an SLO is ambiguous, an SLA lacks operating margin, alert noise is
  high, resource thresholds page without context, or PromQL burn rules need review.
  Instrument design belongs to metrics-and-cardinality; percentile semantics to
  latency-statistics; overload controls to rate-limiting-and-load-shedding.
---

# SLO and Alerting

## Purpose

Create a measurable user expectation and an operating policy that changes decisions. Then
alert early enough, and only when a person has a time-sensitive action.

An SLI is any carefully defined quantitative measure of service level—not necessarily a
ratio. An SLO is a target or range on an SLI under declared conditions. An SLA is an
agreement carrying explicit consequences. Error-budget ratios are powerful for event-based
reliability objectives, but freshness, durability, correctness, throughput and distribution
objectives may need other semantics.

## Workflow

### 1. Start from user journeys and consequences

Identify users (including services), critical journeys, harm from failure/latency/staleness
or incorrectness, and dependency assumptions. Choose the few objectives that can resolve a
real priority conflict. Do not turn every measurable resource into an SLO.

### 2. Write the SLI specification

Record:

- population and valid-event/time denominator;
- good/bad classification or numerical measurement;
- start/end events and observation point;
- aggregation/window and calendar versus rolling semantics;
- exclusions, unknown/missing data and low-traffic behavior;
- labels/cohorts and weighting;
- source, query, retention and backfill/change policy.

Measure near the user's boundary where practical, while using internal business signals for
correctness invisible at the edge. Client telemetry may be sampled or unavailable; document
the proxy gap rather than claiming a boundary is always authoritative.

### 3. Negotiate target and policy

Base targets on user needs, dependency promises, business risk, attainable architecture,
cost and observed distribution—without simply adopting current performance. A tighter
internal objective than an external SLA often supplies detection/remediation and semantic
margin, but “strictly tighter” is not a mathematical requirement: definitions/windows may
differ and other controls may supply margin. Reconcile them explicitly.

Avoid 100% availability objectives for failure-prone serving paths unless the scope and
consequence genuinely require it. Some correctness/durability invariants can legitimately
target zero tolerated events; manage them as safety/data-integrity controls rather than
pretending all objectives need a spendable budget.

Define what budget states change: release risk, reliability work, escalation, exemption
authority and recovery. A budget is not permission to cause outages deliberately.

### 4. Derive alerts from response urgency

Page when:

- impact or a predictive hazard is urgent enough to require action before business hours;
- a person has a safe action or escalation now;
- automation cannot handle it fully;
- ownership, runbook and expected response are explicit.

User symptoms are strong paging signals, but “never page on causes” is unsafe. Impending
irreversible data loss, certificate expiry inside response lead time, disk exhaustion or a
stateful quorum loss can justify predictive paging before users fail. Conversely, a
user-visible low-severity condition may only need a ticket.

Use multi-window burn-rate alerts for high-volume ratio SLOs. Use direct deadline/hazard,
synthetic probes, minimum-event logic or manual aggregation where burn ratios are
ill-conditioned.

### 5. Validate the monitoring system

Test recording and alert rules with controlled traffic/faults; verify labels, absent data,
counter resets, delayed ingestion, partial monitoring outage and alert routing. A page is a
production interface and needs version control, review and tests.

### 6. Operate and retire

Review firings by precision, recall, time-to-detect, time-to-action and user impact. Merge
correlated pages, automate repeatable remediation, and downgrade or remove alerts that
cannot drive action. “Never fired” can mean rare critical coverage, not automatic deletion;
exercise it and verify assumptions.

## Error-budget arithmetic

For an event-based objective target \(S\):

\[
e_b=1-S,qquad
burn=\frac{e_{observed}}{e_b}
\]

At constant burn \(b\), a full objective period's budget is consumed in period divided by
\(b\). Over alert window \(w\), approximate fraction spent is:

\[
f=b\frac{w}{T}
\]

This assumes comparable event populations and a stable interpretation over windows. For a
time-based SLI, denominator and harm differ. Do not translate request failures directly
into “minutes unavailable” under variable traffic.

## Classification decisions

| Outcome                 | Default question                                                             |
| ----------------------- | ---------------------------------------------------------------------------- |
| client 4xx              | was the request valid, and did our change cause rejection?                   |
| shed 429/503            | did the user receive required service, and is shedding a separate objective? |
| timeout/no response     | where was it observed and was late work canceled?                            |
| degraded/fallback       | does it satisfy the promised quality/completeness?                           |
| duplicate/retry success | is logical-call success or attempt success the population?                   |
| no traffic              | healthy quiet period, upstream outage or missing telemetry?                  |

There is no universal “4xx excluded” or “shed is neither good nor bad.” Encode the user
contract. Keep overload classifications distinct so protection is visible even when it
counts against availability.

## Alert routing framework

| Signal                   | Page when                                                       | Otherwise                       |
| ------------------------ | --------------------------------------------------------------- | ------------------------------- |
| fast error-budget burn   | actionable, high-volume and current in both windows             | ticket/report                   |
| traffic disappears       | expected demand exists and edge/synthetic evidence shows impact | annotate quiet schedule         |
| resource/hazard forecast | time-to-limit is inside response lead time with high confidence | ticket/capacity work            |
| one replica unhealthy    | redundancy/state/risk makes human intervention urgent           | automate replacement/dashboard  |
| correctness/data loss    | credible evidence and containment is urgent                     | investigate/ticket per severity |
| anomaly                  | mapped to harm and response                                     | investigative signal            |

## Failure modes

| Symptom                                  | Likely design defect                                   | Remediation                          |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| SLO green during outage                  | wrong boundary, absent traffic/data, excluded failures | add edge/synthetic/business coverage |
| budget changes after query refactor      | population/classification/schema drift                 | version SLI and dual-run migration   |
| one request pages low-volume service     | ratio statistically sparse                             | synthetic/group/window/manual policy |
| page storms across services              | dependency correlation and duplicate routes            | inhibit/group by user journey        |
| alert clears before responder sees cause | short window/no retained evidence                      | recording rules, incident snapshots  |
| pages routinely ignored                  | no action, bad severity or ownership                   | automate, ticket, merge or remove    |

## Anti-patterns

**SLO equals current dashboard:** rewards existing implementation and hides user need.

**All SLIs are good/valid ratios:** freshness gauges, distributions and durability can need
different objectives; ratios are especially useful for budget-based availability/latency.

**SLA margin by percentage only:** differing populations, windows, exclusions and
measurement points can consume or create more risk than the numeric gap.

**Cause-versus-symptom dogma:** route by urgency, actionability and irreversible risk.

**No-data equals good:** explicitly distinguish absent telemetry, zero denominator and
legitimate inactivity.

**Budget exhaustion automatically freezes everything:** apply a pre-agreed risk policy with
exceptions, ownership and business authority; security/safety fixes must not be blocked.

## Cross-skill routing

- [SLI and error budgets](references/sli-and-error-budgets.md)
- [Alerting design](references/alerting-design.md)
- [Burn-rate rules and templates](references/burn-rate-rules-and-templates.md)
- metrics-and-cardinality for metric schemas and costs.
- latency-statistics for distributions/quantiles.
- structured-logging and distributed-tracing-design for diagnosis.
- capacity-planning and rate-limiting-and-load-shedding for remediation.

## Authoritative references

- [Google SRE: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook: Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
