# Provisioning Decision

## Evidence gates

Do not approve production capacity until the evidence identifies:

1. the demand population and useful-work unit;
2. required scenarios and SLO evaluation windows;
3. a reproducible feasible envelope for candidate configurations;
4. the first constrained resource/path in each scenario;
5. autoscaling and warm-capacity reaction behavior;
6. placement, quotas and dependency survivorship;
7. forecast and price uncertainty;
8. overload, rollback and review triggers.

Production telemetry is not automatically a capacity lower bound. It may contain shedding,
hidden retries, missing demand, heterogeneous versions or an unobserved SLO violation.
Reconcile it with controlled tests.

## Configuration selection

### Bracket the boundary

Use open arrivals when production receives an externally imposed rate. Increase load until
a guardrail fails, then refine between the highest reproducible pass and lowest
reproducible fail. A fixed-concurrency generator can show saturation, but its feedback
suppresses arrivals as response time grows; use it when that population model matches the
target or as complementary evidence.

Classify the boundary:

- **latency-bound:** tail objective fails while useful throughput remains stable;
- **error-bound:** timeouts, rejections or correctness failures breach policy;
- **resource-bound:** a resource guardrail predicts instability;
- **collapse-bound:** useful throughput falls as offered work grows;
- **external-bound:** dependency quota, partition, licence or placement caps scale;
- **generator-bound:** the producer, client network or metrics path saturated first.

### Compare shapes, not only counts

Test relevant CPU/memory shapes. More small replicas can improve failure granularity and
placement but multiply connections, fixed heap/native overhead, sidecars and coordination.
Fewer large replicas can reduce fixed cost but enlarge failure domains and replacement
time. Record JVM ergonomics and heap/GC settings for each shape.

### Evaluate transitions

Replay gradual and impulse increases, scale from minimum replicas, rolling deployment,
node/zone or dependency loss, cold restart, overload, shedding and recovery.

Readiness should mean safe to receive traffic, not necessarily full warm capacity. Measure
the useful-capacity ramp after readiness and incorporate it into routing/scaling.

### Check dependencies in transformed units

For each successful business operation record database calls and occupancy, messages,
bytes, cache misses, downstream calls, retries and fan-out. Compare scenario demand with
the corresponding quota/capacity.

## Autoscaling review

For every metric document:

- why it leads the constrained resource;
- whether it is per-pod, aggregate or partitioned;
- missing/stale metric behavior;
- averaging window and export/control delays;
- target calibration from load tests;
- interaction with readiness and terminating pods;
- effective scale policies, stabilization and tolerance;
- maximum-replica dependency and placement constraints.

For CPU-utilization Kubernetes HPA, the ratio is relative to requested CPU. Calibrating
requests therefore changes control behavior. CPU limits are enforced through cgroups and
can throttle progress; requests affect scheduling and relative allocation under
contention. Compare usage and throttling/runnable delay with workload impact rather than
turning one counter ratio into a universal severity threshold.

Do not derive a target by dividing observed utilization by a remembered controller
tolerance. Calibrate an operating region below measured instability, then replay the
actual controller delays and policies.

## Failure and recovery controls

Capacity planning must be paired with bounded admission/queues, deadlines and cancellation,
retry limits/backoff/jitter/budgets, load shedding or degraded work, health checks isolated
from saturated paths, gradual restoration and visibility into admitted, shed, retried and
successful work.

Extra replicas do not prevent a cascade caused by retry multiplication, a shared
dependency, unhealthy-task feedback or synchronized restart.

## Decision record template

```text
Decision:
Owner / date / review date:

Demand unit and semantics:
SLO population and windows:
Workload model:

Required scenarios:
- normal peak:
- burst/event:
- rollout/restart:
- failure-domain loss:
- dependency degradation:
- overload/recovery:

Evidence:
- tested versions/configurations:
- feasible capacity intervals:
- uncertainty/repetitions:
- model use and validation:
- bottlenecks and quotas:

Selection:
- active configuration:
- minimum / maximum / warm capacity:
- placement:
- autoscaling metrics and measured reaction:
- overload controls:

Forecast:
- method/backtest:
- exhaustion-date range:
- decision lead time and trigger:

Cost:
- dated source and included components:
- normal / failure-scenario / unit cost:
- sensitivity:

Unknowns and residual risks:
Validation and rollback:
Re-evaluation triggers:
```

## Review questions

- Would retries or shedding make attempted throughput look healthy while useful throughput
  falls?
- Does correlated failure remove more capacity than replica-count arithmetic says?
- Is latency local saturation or a dependency that scaling callers amplifies?
- Can maximum replicas schedule and remain within downstream quotas?
- Was rollout/failure behavior measured, or inferred from steady state?
- Do forecast intervals cover held-out peaks at the promised rate?
- Does the cost denominator count successful useful work?
- Which observation would falsify the decision?
