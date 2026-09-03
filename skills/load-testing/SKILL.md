---
name: load-testing
description: >
  Designing valid service load experiments: choosing open or closed workload models,
  defining offered, admitted and successful work, controlling generator and environment
  bias, representative workload and data, state-based warmup, run validity, uncertainty,
  and reproducible evidence. Use when designing or reviewing k6, Gatling, JMeter or similar
  tests, diagnosing a throughput plateau, validating a baseline, or deciding whether a run
  measured the target rather than the generator. Profile selection and breakpoint, burst,
  stress and soak procedures belong to load-testing-advanced; coordinated omission belongs
  to coordinated-omission; inference belongs to latency-statistics.
---

# Load Testing

## Purpose

Design an experiment whose result applies to a declared production question. Precise
percentiles can still describe the wrong workload, a saturated generator, unrepresentative
data, a changing JVM, censored failures, or an arrival process that slows itself when the
service slows.

Distinguish offered work, started/admitted work, attempts including retries and fan-out,
successful useful work, and rejected/abandoned/timed-out work. They answer different
questions and diverge under overload.

## Workflow

### 1. State the claim and experimental unit

Define population, system boundary, configuration, response variable, SLO window and
intended generalization. Decide whether one run, node, build, cluster or time block is the
independent unit. Requests within one run are correlated and do not make one deployment
thousands of independent replications.

### 2. Choose the workload model from causality

Use an **open model** when arrivals occur independently of prior completion: public
requests, scheduled messages or an externally imposed rate. Use a **closed model** when a
fixed population genuinely waits or thinks before its next operation.

For a closed population in equilibrium:

\[
X=\frac{N}{R+Z}
\]

where \(N\) is population, \(R\) mean response time and \(Z\) mean think time. This is
the interactive response-time law, not a ceiling on individual latency. A closed test can
show saturation, but its offered rate falls as response time grows.

An open system with unbounded backlog and \(\lambda>\mu\) has no steady state. Real
systems often have finite queues, deadlines, rejection or shedding and can reach a lossy
steady state; measure those outcomes.

### 3. Model workload and state

Derive operation mix, payload/data/key and tenant distributions, workflows, locality,
session/think times, retries and background work from a relevant production window.
Preserve meaningful correlation and bursts.

Define cold-start, cold-cache and warm steady state separately. End warmup when relevant
signals stabilize—compilation, cache hit rate, connection establishment, allocation/GC and
response distribution—not after a universal duration. Do not discard startup when startup
is the subject.

### 4. Control environment and generator

Pin artifact, JDK, JVM, resources, dependencies and placement. Prefer isolated generators
and a representative network path. Colocation is valid only when it reproduces production
or shared contention is deliberately under test.

Capacity-plan generator CPU, memory, network, connections, ephemeral ports and result
output. Little's Law supplies an initial arrival-executor concurrency estimate from
iteration rate and duration; a pilot must verify scheduled starts and generator headroom.

### 5. Define validity before the headline run

Verify business correctness, data isolation, output schema, clock alignment and telemetry
overhead. Predeclare:

- reconciliation of scheduled/offered and started arrivals;
- generator CPU, pauses, network and connection bounds;
- target identity and dependency state;
- missing/dropped-start classification;
- timeout, graceful-stop and incomplete-work treatment;
- workload-fidelity checks.

A dropped scheduled iteration invalidates a claim about the configured offered schedule,
but remains evidence about generator capacity. It creates a censored arrival process; it
does not silently turn the executor into a closed loop.

### 6. Repeat and quantify uncertainty

Choose repetitions from between-run variability and the decision-relevant effect, not a
fixed count. Randomize or block version/order comparisons. Report run-level distributions,
uncertainty and environment drift; do not pool all requests as independent observations.

### 7. Diagnose through a causal chain

Correlate arrival/admission, queues, useful throughput, latency/error, resources, JVM events
and dependencies. A plateau alone does not identify its cause. Collect discriminating
evidence, change one causal factor, and reproduce.

## Measurement rules

- Use the mean for total-work, conservation and resource-demand questions; use relevant
  quantiles/tails for latency objectives. No statistic is universally forbidden.
- Publish sample count, duration, histogram precision/range, timeout/censoring policy and
  aggregation dimensions with percentiles.
- Do not average or add percentiles across replicas, windows or path components.
- Do not treat error responses as fast successes. Report outcome and latency jointly.
- Separate client- and server-observed latency.
- Explicitly start JFR and control its overhead. Native Memory Tracking requires startup
  configuration and does not enumerate Java objects.

## Decision table

| Need                       | Prefer                                      | Avoid                             |
| -------------------------- | ------------------------------------------- | --------------------------------- |
| externally imposed traffic | open arrival schedule                       | fixed VUs as sole evidence        |
| bounded users/workers      | closed population with realistic think time | forced RPS with changed semantics |
| compare builds             | randomized/blocked repeated runs            | one-off sequential before/after   |
| production peak            | representative mix, skew and state          | uniform IDs and tiny hot data     |
| overload behavior          | retain rejection, timeout and recovery      | abort at first SLO breach         |
| dependency capacity        | transformed demand and occupancy            | linear pod-QPS extrapolation      |

## Failure modes

| Symptom                         | Distinguish with                                         | Response                                 |
| ------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| arrivals below schedule         | dropped starts, generator CPU/GC/network and limits      | resize/distribute generator; qualify run |
| throughput plateaus as VUs rise | response law, target queues/resources, generator         | separate closed feedback from saturation |
| p99 jumps with stable server    | client/network queues, timeout boundary, histogram range | inspect end-to-end semantics             |
| run-to-run drift                | compilation/cache/state, neighbors, dependency data      | block/randomize or model variance        |
| test faster than production     | skew, TLS/reuse, payload and omitted workflows           | rebuild workload model                   |
| useful throughput collapses     | retries, queues, health checks and crash loops           | test shedding/recovery                   |

## Anti-patterns

**Validity equals SLO pass.** A stress run can be valid while deliberately violating its
SLO. Validity asks whether the scheduled experiment occurred; acceptance asks whether the
system met its objective.

**One request equals one iteration.** An iteration can execute a workflow, parallel
resources or retries. Calibrate rate to the declared work unit.

**Precision without replication.** Millions of requests in one run estimate that run's
distribution, not build/node/time variability.

**Universal generator rules.** Separate hosts and generous preallocation are common good
choices, but topology and allocation must follow the production claim and measured
generator behavior.

## Cross-skill routing

- Read [test plan and validity](references/test-plan.md) for the executable contract.
- Use load-testing-advanced for breakpoint, burst, stress and soak profiles.
- Use coordinated-omission for scheduled-arrival loss and correction limits.
- Use latency-statistics for uncertainty and comparisons.
- Use capacity-planning for provisioning decisions.

## Authoritative references

- [Grafana k6: open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
- [Grafana k6: arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Gatling: workload models](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter: Open Model Thread Group](https://jmeter.apache.org/usermanual/component_reference.html#Open_Model_Thread_Group)
- [JDK Mission Control](https://docs.oracle.com/en/java/java-components/jdk-mission-control/)
