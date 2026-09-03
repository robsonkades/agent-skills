---
name: tail-latency-analysis
description: >
  Diagnosing and mitigating end-to-end latency tails: defining the latency population,
  decomposing stage and queue time with per-request evidence, quantifying fan-out under
  dependence, attributing correlated JVM/OS/network/dependency events, and selecting
  bounded tail-tolerance mechanisms such as deadlines, partial results, hedging and
  load-aware routing. Use when p99/p99.9 regresses, stage percentiles do not explain an
  end-to-end percentile, deploys create cold tails, wide fan-out amplifies rare stragglers,
  or a hedge/retry is proposed. Percentile estimation belongs to latency-statistics;
  queueing models to queueing-models; collector and OS mechanisms to their owning skills.
---

# Tail Latency Analysis

## Purpose

Identify which requests are slow, where their elapsed time went, what condition caused it,
and which intervention improves user outcomes without destabilizing the system.

Tail latency is conditional on endpoint, outcome, tenant, payload, time, load, topology and
deadline. A global p99 can move because the mixture changed even when every cohort stayed
constant (or hide a cohort regression). Start from a precisely scoped population.

## Workflow

### 1. Define the user objective

State latency start/end events, population, success/error treatment, deadline/censoring,
window and aggregation. Select quantiles from user impact and available sample precision;
do not mandate p99, p99.9 and maximum for every service. Maximum is highly sample-size and
duration dependent and is useful as an incident exemplar, not a stable SLO statistic.

Record offered, admitted and successful work. Closed-loop or completion-only measurements
can underrepresent the worst intervals; check coordinated omission and timed-out/abandoned
requests first.

### 2. Segment before attributing

Compare distributions by endpoint/operation, payload or work size, tenant/partition,
outcome, instance/node/zone, cache state, deployment age, load and time. Keep cardinality
bounded in metrics; use traces/exemplars or offline joins for high-cardinality dimensions.

Mixture decomposition distinguishes:

- a larger fraction of an existing slow cohort;
- an unchanged fraction whose conditional latency worsened;
- a new slow path;
- a global correlated event;
- estimator/instrumentation change.

Multimodality can suggest distinct paths, but the absence of modes does not prove queueing,
and a component count does not identify causes.

### 3. Decompose per request, not by percentile arithmetic

For one request:

\[
T_{end}=T_{client}+T_{network}+T_{admission}+T_{queue}
+T_{service}+T_{downstream}+T_{serialization}
\]

The exact terms depend on instrumentation boundaries and can overlap in asynchronous
systems. Reconstruct critical-path spans and waits for sampled slow requests. Per-stage
histograms localize candidates, but neither matching stage p99 nor summing stage p99 proves
ownership: different requests can occupy each percentile and stages can correlate.

Use [decomposing the tail](references/decomposing-the-tail.md).

### 4. Quantify fan-out with dependence explicit

For \(N\) identically distributed parallel leaves, if each independently exceeds threshold
\(t\) with probability \(p\):

\[
P(\max_i T_i>t)=1-(1-p)^N
\]

For 100 leaves and \(p=0.01\), the probability is about 63.4%. Independence is a scenario,
not a default: shared dependencies, synchronized pauses and common requests create positive
dependence; load balancing and mutually exclusive paths can change it differently.

Estimate joint behavior from request-level traces or bounds. A user budget can be allocated
backward only after topology, quorum/partial-result rule and dependence assumptions are
declared. Sequential latency is a sum; parallel latency may be a maximum, order statistic
or deadline-limited partial result.

### 5. Correlate candidate causes

Build a common timeline of slow requests, queue/admission, useful load, JVM events,
process/container scheduling, network/storage and dependencies. Evidence must overlap the
affected interval and instance. Co-occurrence alone is not causation; compare unaffected
instances/cohorts and perform a controlled change when possible.

Use [attributing the tail](references/attributing-the-tail.md).

### 6. Select a mechanism from cause and topology

Prefer source removal—reduce contention, queueing, pauses, skew or expensive work—when
feasible. Tail-tolerance mechanisms trade extra work, completeness, errors, state and
complexity:

| Cause/topology                                   | Candidate                              | Key risk                             |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------ |
| local transient straggler, spare diverse replica | delayed hedge                          | incident-time load amplification     |
| wide fan-out permits partial answer              | quorum/k-of-N by deadline              | incomplete/biased results            |
| persistent slow replica                          | bounded outlier ejection/probation     | correlated ejection removes capacity |
| head-of-line blocking                            | classes, fair scheduling, work slicing | starvation/complexity                |
| hot key/partition                                | repartition or selective replication   | consistency/rebalance cost           |
| saturated shared dependency                      | admission, shedding, capacity repair   | hedge/retry worsens it               |
| cold rollout instance                            | warm-capacity routing/slow start       | rollout duration/cost                |

See [hedging and tail tolerance](references/hedging-and-tail-tolerance.md).

### 7. Validate system-wide

Reproduce the original population and load, then compare user tail, success/completeness,
attempt rate, useful throughput, downstream utilization and recovery under normal and
degraded scenarios. A nominal 1% hedge rate is not sufficient evidence; bound and test the
rate when the callee is broadly slow.

## Diagnostic rules

- Percentiles of components cannot generally be added, subtracted or ordered to obtain the
  percentile of their sum.
- A stage percentile equal to end-to-end p99 does not prove the same requests drove both.
- A faster p50 with worse p99 may be a regression, but decision weights come from the SLO
  and user impact—not a universal preference for tails.
- Never silently trim slow observations. Exclude only proven measurement corruption with a
  recorded rule and sensitivity analysis.
- Post-deploy slowness can be JIT/cache/classloading/TLS/connection/data warmup, placement,
  dependency or rollout routing. “JIT disabled” and “always JIT” are both unsupported
  without evidence.
- GC logs show collector activity; safepoint, scheduling and allocation stalls require
  their own evidence. Verify JFR event names/configuration against the exact JDK recording.
- Fixed duration bands are triage hints only. Retransmission timers, cgroup periods,
  storage and GC behavior are configurable and layered.

## Failure modes

| Symptom                                        | Discriminator                                    | Next step                                       |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| every in-process stage shifts together         | aligned pause/scheduling/client boundary         | correlate JFR, safepoint and OS timeline        |
| one dependency span dominates only slow traces | dependency cohort/outcome/instance               | inspect its queue, retries and topology         |
| tail grows with fan-out width                  | leaf exceedance correlation and completion rule  | reduce width, partial results or safe tolerance |
| tail begins after rollout                      | age since readiness, compilation/cache/placement | measure warm-capacity ramp                      |
| spikes at high load                            | admitted load, queue age, throttling, pools      | queue/resource diagnosis before hedging         |
| periodic spikes                                | aligned GC/jobs/rotation/network/control cycles  | identify phase and test causal disable/shift    |
| timeout boundary pile-up                       | censored durations and remaining work            | propagate deadlines/cancellation                |

## Anti-patterns

**One percentile per service copied end to end:** ignores topology, population and
dependence. Allocate a user objective through the actual critical path and completion rule.

**Stage-percentile accounting:** hides request identity and covariance. Use per-request
critical paths or joint distributions.

**Hedge at historical p95 and call it 5% overhead:** when the distribution shifts, almost
all calls can cross the fixed delay. Enforce a rolling budget/pushback and test degradation.

**Retry and hedge at multiple layers:** attempts multiply, deadlines reset and cancellation
is lost. Choose one owning layer and one end-to-end deadline.

**Correlation by dashboard eyeballing:** different clocks/windows and mixture changes
produce false matches. Align raw events and compare controls.

## Cross-skill routing

- latency-statistics: estimator, histogram and sample uncertainty.
- distributed-tracing-design: span boundaries, sampling and exemplars.
- queueing-models / coordinated-omission: waiting and missing arrivals.
- pause-attribution / safepoints / gc-log-analysis: JVM pause mechanism.
- linux-for-jvm / ebpf-for-jvm / tcp-tuning: scheduling and network evidence.
- timeouts-and-deadlines / retries-and-backoff / scatter-gather: policy ownership.

## Authoritative references

- [Dean and Barroso: The Tail at Scale](https://research.google/pubs/the-tail-at-scale/)
- [gRPC: Request hedging](https://grpc.io/docs/guides/request-hedging/)
- [gRPC: Deadlines](https://grpc.io/docs/guides/deadlines/)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [OpenJDK JFR event metadata](https://github.com/openjdk/jdk/blob/master/src/jdk.jfr/share/conf/jfr/default.jfc)
