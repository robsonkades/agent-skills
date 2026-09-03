---
name: metrics-and-cardinality
description: >
  Designing bounded, decision-oriented metrics for Java services: selecting counters,
  gauges and histogram forms; defining RED, USE and business outcomes; budgeting active
  series and ingestion/query cost; controlling caller-driven dimensions; and planning
  schema migrations, overflow behavior and exemplars. Use when adding labels, routes,
  histograms or business metrics, diagnosing series growth or missing gauges, reviewing
  Micrometer/Prometheus instrumentation, or choosing between classic/native histograms and
  client quantiles. Percentile inference belongs to latency-statistics, exporter overhead to
  opentelemetry-performance, alert policy to slo-and-alerting.
---

# Metrics and Cardinality

## Purpose

Build aggregate signals that answer operational and product questions without making
telemetry a reliability, cost, privacy or control-plane hazard.

Every unique label set is a time series. Cardinality is therefore a workload-dependent
resource demand, not just naming style. “Bounded and enumerable at design time” is a useful
ideal but too strict: versions, nodes and controlled tenants evolve. What matters is a
declared maximum/growth model, owner, retention/churn behavior and containment.

## Workflow

### 1. Start from decisions

For each metric name its consumer and action:

- SLI/report/alert;
- capacity or saturation control;
- incident discrimination;
- experiment/optimization validation;
- business correctness/outcome.

Metrics not on a current dashboard can still be valuable for rare diagnosis. Require an
owned use case and review date rather than deleting solely because recent queries are absent.

### 2. Define the semantic contract

Record quantity, unit, event/state boundary, monotonicity, population, labels, reset and
missing-data behavior. One metric family should represent one logical quantity across
labels; do not mix seconds and bytes or attempts and logical operations.

Use RED (rate, errors, duration) as a serving-system starting point and USE (utilization,
saturation, errors) for resources, not universal completeness checklists. Add correctness,
freshness, queue age, goodput and business outcomes specific to the system.

### 3. Choose the instrument

| Question                         | Instrument                                 | Important semantics                                              |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| cumulative monotonic events/work | counter                                    | resets; rate/increase for windows, raw total may still be useful |
| sampled current state            | gauge                                      | values between observations can be missed                        |
| completed-value distribution     | histogram/summary                          | aggregation, resolution, range and cost                          |
| work currently in progress       | gauge/up-down counter/long-task instrument | lifecycle and missed cleanup                                     |
| one occurrence                   | log/span/exemplar                          | avoid identity labels                                            |

Counters are not “never read as values”: total since process start is legitimate when its
scope is desired. Across restarts/windows use reset-aware operations.

### 4. Design labels and budget

For each label document source, allowed values, expected/worst cardinality, churn rate,
privacy/attacker control and required queries. Template route identifiers and normalize
bounded outcome classes at the source. Keep request/user/session IDs, raw URLs, payloads,
SQL literals and exception text out of metric labels.

Estimate worst-case and realistic **active** combinations; labels are correlated, so the
simple product is an upper bound, not the observed bill. Include targets/replicas as a label
dimension rather than multiplying and then also counting the instance label.

For classic Prometheus histograms, each bucket plus sum/count is a float series per observed
label set. Native histograms use composite samples and different storage/query economics.
Summaries with quantiles add series and their quantiles are not aggregatable.

See [cardinality budget](references/cardinality-budget.md).

### 5. Select distribution representation

Prefer native histograms when the complete toolchain supports their required semantics and
cost. Otherwise use classic buckets designed around SLOs and accuracy needs. Client-side
quantiles can be appropriate for nonaggregated local views, but cannot be combined into a
fleet quantile.

State bucket/resolution, range, overflow/clamping, temporality and schema compatibility.
Changing classic boundaries creates incompatible populations during rollout unless queries
separate schemas.

### 6. Add containment

Use design-time allowlists/normalization first, then library caps, scrape sample/label
limits, relabel drops, backend quotas and alerts on active series/churn/ingestion. Define
whether overflow is dropped, collapsed to OTHER, sampled or fails the scrape. Dropping a
meter can corrupt denominators; collapsing can hide cohorts.

### 7. Validate and migrate

Load-test instrumentation overhead and worst cardinality. Fixture-test label normalization,
unknown values, meter lifecycle and query aggregation. Dual-publish/version schema changes
when units, labels or histogram boundaries change, then migrate consumers atomically.

## Label decision framework

Keep a label when:

- it changes a real decision or SLO cohort;
- values are controlled or defensibly bounded;
- the expected combinations and churn fit budget;
- privacy/security and attacker influence are addressed;
- overflow semantics preserve critical totals.

Move the dimension to logs/traces/exemplars when it identifies individual occurrences or is
needed only during drill-down. Pre-aggregate when a large domain can be mapped to stable
classes. Use separate metric families when labels would mix incompatible quantities.

## Operational rules

- A gauge is a scrape-time observation; short peaks require event counters, max-since-reset
  state, or a distribution with documented reset semantics.
- Some Micrometer gauge forms weakly reference observed objects. Verify the chosen API and
  retain lifecycle ownership; NaN/disappearance can also be scrape or computation failure.
- Utilization and saturation are complementary. Neither universally leads: queueing may
  precede utilization, while CPU pressure or hard quotas can lead user impact without an
  application queue.
- Preserve unknown/overflow counts. An enum prevents arbitrary strings only if external
  values are mapped safely.
- Do not average exported client quantiles. Aggregate histogram populations before
  calculating the fleet quantile.
- Keep SLI numerator and denominator labels/populations compatible.
- Treat metric names/labels/units as an API; dashboards, alerts, autoscalers and external
  consumers depend on them.

## Failure modes

| Symptom                                 | Distinguish with                                       | Response                                                   |
| --------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| active series rises after deploy        | per-name/label combinations and churn                  | drop/relabel containment, fix source                       |
| backend cost rises without active count | samples, scrape interval, histogram density/churn      | inspect ingestion and native/classic representation        |
| gauge disappears/NaN                    | object lifecycle, callback exception, scrape gap       | fix ownership/computation; alert on absence where expected |
| histogram query empty                   | export type/name/schema/buckets and selectors          | inspect exposition before changing query                   |
| fleet p99 implausible                   | summaries/client quantiles averaged, missing le/schema | aggregate compatible histogram populations                 |
| SLO denominator drops                   | rejected/timeout path, tag overflow, scrape limit      | restore logical-operation accounting                       |
| instrumentation changes latency         | hot-path lookup/allocation/export pressure             | cache handles, sample/aggregate, reduce dimensions         |

## Anti-patterns

**Cartesian-product budgeting as fact:** use it as worst-case upper bound and measure actual
valid combinations/churn.

**Every value must be statically enumerable:** evolving controlled values can be safe with a
growth budget and containment.

**Classic histogram assumptions applied to native histograms:** cost, query syntax and
schema compatibility differ.

**Drop overflow silently:** totals and SLO ratios become falsely healthy. Preserve an
overflow signal or fail explicitly according to risk.

**Metrics as event storage:** IDs and arbitrary text belong in trace/log storage with
sampling, retention and access controls.

## Cross-skill routing

- [instrument selection](references/instrument-selection.md)
- [cardinality budget](references/cardinality-budget.md)
- [Micrometer and Prometheus](references/micrometer-and-prometheus.md)
- latency-statistics for quantile meaning.
- opentelemetry-performance for collection/export overhead.
- slo-and-alerting for objectives and paging.
- structured-logging/distributed-tracing-design for occurrences and causality.

## Authoritative references

- [Prometheus metric and label naming](https://prometheus.io/docs/practices/naming/)
- [Prometheus histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus instrumentation](https://prometheus.io/docs/practices/instrumentation/)
- [Micrometer histograms and percentiles](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)
- [Micrometer meter filters](https://docs.micrometer.io/micrometer/reference/concepts/meter-filters.html)
