---
name: capacity-planning
description: >
  Quantitative capacity planning: building an instance-count model from measured data,
  sizing against both a throughput ceiling and a latency SLO, forecasting headroom against
  growth, peak versus average provisioning, cost per request, and validating the plan
  against a real saturation test. Use when deciding how many instances or pods a target load
  needs, when an autoscaler is configured on a fixed CPU threshold, when adding replicas
  stopped improving throughput, when someone asks for a saturation date or an infrastructure
  budget, when p99 spikes during scale-up events, or when a downstream connection limit may
  be the real ceiling. Does not cover the scalability model and its contention and coherency
  coefficients (universal-scalability-law), queueing model selection and fitting
  (queueing-models), or designing and running the saturation experiment itself
  (load-testing-advanced).
---

# Capacity Planning

## Purpose

Turn measured scaling data into a defensible instance count, a saturation date and a cost
figure. The failure this skill prevents is the plan that looks quantitative but is not:
a planner that accepts an SLO parameter and never uses it, a fixed 70% utilisation cap with
no relation to any latency target, or a recommendation beyond the point where adding
instances reduces throughput.

A capacity answer is valid only if it satisfies two independent constraints at once —
throughput and latency SLO — and only if it falls inside the region where the scalability
model is still increasing. Which constraint governs depends entirely on the declared SLO,
so a planner that checks only one is right by accident or wrong in silence.

## Workflow

1. **Collect scaling data under production-identical conditions.** Same heap, same cgroup
   quota, real dependency latencies, real endpoint mix, and at least 120 s of JIT warmup
   before any measurement counts. See `references/inputs-forecast-and-cost.md`.
2. **Measure the single-instance service p99 separately, under light load.** It is an
   independent input from the scaling fit, and it must be taken at low utilisation or it
   already contains the queueing the model is supposed to add. Repeat it and take the
   median.
3. **Fit the scalability model and gate the fit.** Reject the coefficients unless the fit
   is good and the predicted peak is at least the largest throughput already observed.
   Compute the instance count at which throughput peaks.
4. **Size against both conditions.** Find the smallest N where the predicted throughput
   times the utilisation cap covers the target load _and_ the predicted p99 meets the SLO.
   See `references/sizing-arithmetic.md`.
5. **Gate the result.** If the answer exceeds the peak instance count, or no N satisfies
   both conditions, raise an explicit error. The correct response there is to reduce
   contention and coherency, or renegotiate the SLO — not more instances.
6. **Check every other resource on the path.** Model the dominant downstream separately;
   the system ceiling is the lower of the two, never the sum.
7. **Project, price and then verify.** Forecast growth to a saturation date, state the
   assumed hourly cost explicitly, and compare the projection against a real staging
   measurement before it drives a decision.

## Rules

- Never autoscale on a fixed CPU threshold alone. CPU is low while I/O saturates, high
  while throughput still grows, and inflated by GC compaction. Scale on request queue depth
  or p99 latency, which map to user impact directly.
- Every parameter a planner accepts must appear in a calculation. An SLO and a baseline p99
  that are stored and never read produce a result that looks SLO-aware and is not — check
  this by deleting a parameter and seeing whether the output changes.
- Never return an instance count beyond the throughput peak. It is mathematically invalid,
  not "more expensive but safe" — past the peak, throughput falls, and 40 instances can
  deliver less usable throughput than 12 at 3.3x the infrastructure.
- `N_max = sqrt((1 - sigma) / kappa)` — coherency is in the denominator, so `N_max` falls
  monotonically as coherency rises. At `kappa = 0.01` and `sigma = 0`, `N_max` is exactly
  10, which is the ceiling of that range, not a floor. "If kappa > 0.01 then N_max is 10 to
  30" is the formula read backwards; the correct statement is `N_max <= 10 and falling`.
- Do not apply Erlang C literally with `c` set to the instance count. M/M/c assumes
  independent servers; a non-zero coherency coefficient asserts the opposite, so that
  substitution silently assumes coherency is zero mid-calculation. Erlang C belongs one
  layer down — threads inside a single instance.
- Measure `p99_at_1_instance` at utilisation below 0.3. Measured under load it captures
  total residence time rather than service time, and contaminates every downstream figure
  while the scaling fit still looks excellent.
- A high fit quality on the scaling curve does not validate the latency baseline. They are
  independent measurements, and only one of them is being checked.
- Always pass the hourly cost per instance explicitly. It is a business assumption, not a
  technical constant; an implicit default produces several unlabelled cost bases in the
  same document.
- Include every dependency in the plan — database `max_connections` and QPS, cache hit rate
  and bandwidth, queue producer versus consumer rate, downstream API limits. Twenty pods
  holding twenty connections each against a 300-connection database means more pods make it
  worse.
- Account for cold start in any autoscaling plan. A pod takes 30–60 s to start and minutes
  to warm up; the predicted p99 assumes warm instances, so scale-up events show a p99 spike
  the model does not contain. Mitigate with CDS/AppCDS, a pre-warmed pool, or predictive
  scale-up.
- Validate the projection against a real measurement in staging before acting on it, and
  have someone other than the model's author review the coefficients and the cost
  assumptions.

## References

- [Sizing arithmetic](references/sizing-arithmetic.md) — the two conditions, the aggregated
  channel queueing approximation and its p99 formula, the `N_max` table, the sanity gates,
  and three worked scenarios where throughput governs, the SLO governs, and nothing does.
  Read when computing an instance count or auditing one someone else produced.
- [Inputs, forecast and cost](references/inputs-forecast-and-cost.md) — the benchmark
  protocol and its collection queries, the scaling sweep, traffic forecasting with an
  honest confidence interval, the reserved/spot cost comparison, and the multi-resource
  ceiling protocol. Read before collecting data, or when the plan must produce a saturation
  date or a budget.
