---
name: capacity-planning
description: >
  Evidence-based capacity decisions for Java services: defining demand and failure scenarios,
  measuring feasible capacity envelopes, selecting replica and resource configurations,
  forecasting exhaustion with uncertainty, designing autoscaling headroom, and comparing
  cost per successful unit of work. Use when deciding pod or instance counts, minimum
  replicas, scaling signals, saturation dates, infrastructure budgets, rollout or
  failure-domain headroom, and downstream capacity constraints. Does not own load-test
  design (load-testing-advanced), queueing-model selection (queueing-models), scalability
  curve fitting (universal-scalability-law), or overload controls
  (rate-limiting-and-load-shedding).
---

# Capacity Planning

## Purpose

Produce a decision that states **which workload and failure scenarios a concrete
configuration can support, with what evidence and uncertainty**. Capacity is not one QPS
number: it depends on request mix, payload distribution, cache state, dependency behavior,
resource limits, placement, software version, admission policy and the SLO.

The authoritative result is a measured feasible envelope. Analytical models interpolate,
forecast and expose sensitivities; they do not manufacture tail latency from throughput.
In particular, do not add p99 values, treat a whole fleet as M/M/1, or multiply a
single-replica latency limit by a USL efficiency coefficient. Quantiles are not additive,
and throughput scaling does not determine a latency distribution.

## Required output: capacity decision record

Record:

- decision owner, date, review date and affected service/version;
- demand unit: admitted requests, messages, bytes, tenant operations, or another useful-work
  measure; distinguish offered, admitted, attempted and successful load;
- workload model and scenarios, including request mix, payloads, locality, cache state and
  background work;
- SLO and guardrails, with population, window, exclusions and overload behavior;
- tested configurations and the feasible capacity interval for each;
- selected active and warm/standby capacity, placement constraints and autoscaling bounds;
- forecast distribution, decision lead time and exhaustion criterion;
- bottlenecks, dependency quotas and correlated-failure assumptions;
- cost basis and sensitivity;
- validation, monitoring, degradation, rollback and re-evaluation triggers.

If any of these are unknown, label the answer provisional. Do not hide uncertainty behind
an extra “safety factor.”

## Workflow

### 1. Define scenarios before collecting numbers

At minimum consider:

| Scenario               | State to model                                  | Capacity question                                      |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| normal peak            | representative mix and warm steady state        | can the SLO hold for the business peak?                |
| burst or event         | step/ramp shape and duration                    | can queues and autoscaling absorb the trajectory?      |
| rollout/restart        | unavailable old replicas plus cold new replicas | is useful capacity preserved during change?            |
| failure-domain loss    | actual placement and surviving dependencies     | can survivors carry redistributed load?                |
| dependency degradation | latency, errors, quota and connection pressure  | do waits/retries consume local capacity?               |
| overload/recovery      | admission, shedding and retry policy            | does useful throughput degrade gracefully and recover? |

Add tenant skew, cache-cold, batch overlap, region failover or data rebalancing when they
change resource demand. “Peak QPS” without a duration and workload composition is not a
scenario.

### 2. Establish comparable evidence

Pin and record JDK, JVM flags, heap, GC, image, CPU architecture, resource requests/limits,
node class, kernel/cgroup mode, sidecars, dependency versions and dataset. Warmup ends when
the relevant signals stabilize; it is not a universal number of seconds. Separate startup,
cold-cache and steady-state experiments when all matter.

For each run retain offered/admitted/completed rates, latency distributions, errors,
timeouts, retries, queue age/depth, in-flight work, CPU time/throttling, allocation/GC,
memory/working set, network/storage and dependency saturation. Use repeated independent
experimental units, preserve run-level results and report uncertainty; do not replace them
with only the median.

See [inputs, forecast and cost](references/inputs-forecast-and-cost.md).

### 3. Measure the feasible envelope

For each candidate resource shape and replica count:

1. sweep open-loop offered load through and beyond the expected operating range;
2. test representative steady, step and ramp profiles;
3. identify the highest load whose complete measurement window satisfies the SLO, error,
   resource and stability guardrails;
4. verify that accepted useful throughput does not collapse after overload;
5. express the boundary as an interval when tested load steps or measurement error leave it
   bracketed.

The maximum observed passing point is not an exact capacity. It is a lower bound for the
tested scenario; the first failing point is an upper bound only if the experiment,
configuration and failure classification are sound. Refine the bracket where the decision
is sensitive.

Closed workloads can reveal saturation and are appropriate for fixed-population systems,
but coordinated feedback means they do not establish behavior under an externally fixed
arrival trajectory. Match the load model to production.

### 4. Use models within their evidence boundary

- Use Little's Law as a conservation check with consistently scoped averages.
- Use a queueing model only after validating its arrival, service, server and routing
  assumptions. Tail predictions require a distributional model and validation.
- Use USL or another scaling curve to describe useful-throughput scaling and locate regions
  of diminishing or negative marginal return. Its coefficients do not explain a bottleneck
  by themselves and do not predict p99.
- Use resource demand laws to relate measured CPU or dependency demand to throughput where
  the demand is stable.

Never extrapolate beyond the tested topology merely because a fitted curve is smooth. If a
USL peak is finite, enumerate feasible integer configurations around the predicted region
and validate them; coefficient uncertainty can move the peak materially.

### 5. Select capacity by enumeration

For every candidate configuration, evaluate every required scenario against the measured
or defensibly interpolated envelope. A candidate is feasible only if:

- offered/admitted demand semantics match the test;
- latency, availability/error and correctness SLOs hold;
- resource and dependency guardrails hold;
- surviving placement after the declared failure still has sufficient warm capacity;
- rollout and autoscaling transitions do not consume required headroom;
- overload protection prevents unstable positive feedback.

Choose among feasible candidates using cost, operability, carbon, supply risk and
reversibility. Validate the chosen configuration and adjacent alternatives; integer
replicas, bin-packing and quotas make the search discrete.

Do not reduce system capacity to the numerical minimum of component QPS limits unless the
components are serial, limits use the same workload unit, and interactions are negligible.
Fan-out, batching, cache misses, retries, locks and connection occupancy transform demand.

See [sizing arithmetic](references/sizing-arithmetic.md).

### 6. Design autoscaling as a delayed control loop

Choose a signal causally related to the active bottleneck and early enough to act before
the SLO is lost:

- CPU can be effective for CPU-bound, proportional workloads when requests are calibrated
  and throttling is understood.
- queue age/depth or outstanding work can be effective for bounded asynchronous workers,
  after accounting for partition and tenant skew;
- concurrency can be effective when per-request resource demand is stable;
- latency and errors are usually guardrails or overload signals; as primary scaling
  signals they can be late, noisy and caused by dependencies that extra replicas cannot
  repair.

Measure the entire reaction path: metric window/export delay, control reconciliation,
scheduling, image pull, process startup, readiness, traffic propagation, JIT/cache warmup
and useful-capacity ramp. Inspect the effective controller configuration for the deployed
Kubernetes version; do not rely on remembered defaults.

Replay observed step and ramp demand against the controller and its bounds. Minimum
replicas must carry demand during reaction time without violating the queue/deadline
budget. Maximum replicas must respect database connections, broker partitions, API quotas,
IP space and placement capacity. Treat the controller, scheduler and dependency limits as
part of the system.

### 7. Forecast the decision date, not a single future

Forecast the demand unit used by the envelope. Include seasonality, product events,
changelogs, tenant concentration and structural breaks. Backtest on rolling historical
cutoffs and retain prediction intervals that include model/parameter error, not merely
residual variance.

Translate each demand path into the earliest time a required scenario becomes infeasible.
Report a distribution or range of exhaustion dates plus procurement/development lead time.
Trigger action when the risk of exhausting capacity within lead time breaches the agreed
threshold—not when a point forecast touches a line.

### 8. Price useful, resilient capacity

Date and source the price basis. Include requested/allocated compute and memory, nodes or
instances, storage, network/egress, load balancers, observability, software licences,
commitments, spot interruption/replacement and idle failure headroom. Report:

- cost per successful useful-work unit, not cost per attempt;
- normal and required-failure-scenario cost;
- marginal cost of the next capacity increment;
- sensitivity to traffic, mix, cache hit rate, commitment utilization and prices.

Cheap capacity that fails placement, rollout or recovery requirements is not a feasible
option.

## Decision framework

Prefer **more replicas** when the measured envelope scales, downstream limits remain
feasible, placement exists, and the added replicas improve a required scenario.

Prefer a **larger resource shape** when per-replica fixed overhead, GC/heap needs, CPU
throttling, connection fan-out or partition ownership makes horizontal scaling inefficient;
verify larger failure blast radius and slower replacement.

Prefer **demand reduction or cheaper work** when the bottleneck is shared, retries amplify
load, expensive features are optional, or additional replicas worsen contention.

Prefer **dependency or architecture work** when the feasible envelope plateaus because of
a serial/shared resource, hot partition, coherence traffic or hard quota. A curve
coefficient is a hypothesis prompt; profile and measure the mechanism before investing.

Prefer **predictive/scheduled scaling or warm capacity** when known events or reaction time
exceed the latency/queue budget. Reactive scaling cannot serve demand that arrives before
new useful capacity.

## Failure modes and diagnostics

| Symptom                                   | Distinguish with                                                                           | Likely response                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| throughput plateaus, CPU low              | queue age, dependency latency/quota, locks, I/O wait, partition skew                       | repair the constrained path; more pods may amplify it      |
| latency rises before throughput plateaus  | admitted versus offered load, queueing, throttling, GC, dependency tails                   | lower operating point or remove the measured cause         |
| adding replicas reduces useful throughput | per-replica work, shared locks, cache/coherence traffic, connection pressure, load balance | stop extrapolating; test topology/architecture changes     |
| scale-up completes but SLO stays bad      | ready versus useful capacity, traffic propagation, JIT/cache warmup, dependency saturation | fix readiness/ramp model or non-local bottleneck           |
| forecast repeatedly misses peaks          | residual seasonality, events, structural breaks, tenant skew, censoring/shedding           | rebuild demand model and backtest by scenario              |
| service cannot recover after overload     | retries, health-check feedback, crash loops, synchronized cold start, stale queues         | shed upstream, stop retry amplification, restore gradually |

## Anti-patterns

### Fleet-as-M/M/1 calculator

- Why it happens: aggregate throughput looks like one service rate.
- Danger: routing, multiple servers, service-time variability and request paths disappear;
  the resulting p99 is not identified.
- Detect: one fleet QPS value is inserted into an exponential tail formula.
- Alternative: measure each configuration's tail, or validate an explicit queue network.

### Adding percentile budgets

- Why it happens: percentiles resemble durations.
- Danger: the percentile of a sum depends on joint distributions and correlation.
- Detect: “base p99 + queue p99 = fleet p99.”
- Alternative: measure end-to-end latency, retain traces/distributions, or model the joint
  path and validate it.

### Universal headroom percentage

- Why it happens: one policy is easy to communicate.
- Danger: it ignores burst shape, recovery, failure domains and scaling delay.
- Alternative: derive headroom from named scenarios and show sensitivity.

### Autoscale on an impact metric alone

- Why it happens: p99 directly represents user pain.
- Danger: it arrives after queues form and can scale every caller during a dependency
  fault.
- Alternative: scale on a validated leading saturation signal; keep SLO metrics as
  guardrails.

### Paper redundancy

- Why it happens: total replicas are divided by assumed survivors.
- Danger: scheduler placement, shared nodes/zones, quotas or dependencies create correlated
  loss.
- Alternative: verify placement and run the actual failure/rollout scenario.

## Validation and re-evaluation

Before approval:

- reproduce the chosen boundary and at least one adjacent passing/failing configuration;
- test gradual ramp, impulse/burst, sustained overload and recovery;
- test rollout/restart and the declared failure-domain loss;
- verify offered, admitted and successful demand independently;
- reconcile model predictions with measurements and record residuals;
- review price, forecast, workload mix and dependency assumptions independently;
- define rollback and overload controls before increasing exposure.

Re-evaluate after material code/JDK/GC/resource/dependency changes, workload-mix shifts,
new tenants/events, pricing or quota changes, forecast backtest degradation, and any
incident that invalidates an assumption.

## References

- [Sizing arithmetic](references/sizing-arithmetic.md) — capacity envelopes, scenario
  enumeration, survivorship and autoscaling reaction arithmetic.
- [Provisioning decision](references/provisioning-decision.md) — evidence gates,
  configuration selection, controls and decision-record template.
- [Inputs, forecast and cost](references/inputs-forecast-and-cost.md) — measurement inputs,
  forecast validation and full cost basis.
- [Kubernetes: Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Kubernetes: Resource management for Pods and containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Google SRE: Production services best practices](https://sre.google/sre-book/service-best-practices/)
- [Gunther: A General Theory of Computational Scalability](https://arxiv.org/abs/0808.1431)
