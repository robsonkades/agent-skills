---
name: coordinated-omission
description: >
  Coordinated omission in depth: response-coupled sampling, open/closed/semi-open workload
  models, scheduled-versus-actual clocks, generator saturation, correction at recording time versus at generation time,
  HdrHistogram's recordValueWithExpectedInterval semantics, what wrk2, k6, Gatling, JMeter
  and Locust each actually do, and the effect on capacity numbers. Use when a load test's
  p99 is far better than production's for the same endpoint, when a generator misses its
  planned schedule, when someone proposes applying
  recordValueWithExpectedInterval to open-loop data, when a latency dashboard improves as a
  system saturates, or when a benchmark's numbers are about to become an SLO. Does not cover
  the introductory treatment or the general statistics of latency (latency-statistics), or
  designing the load test as a whole (load-testing).
---

# Coordinated Omission

## Purpose

Establish whether a set of latency numbers is missing the samples that would have carried its
tail, and what to do about it. The failure this skill prevents is the SLO signed against a
load test whose p99 was structurally incapable of seeing the queue: the generator stopped
issuing requests exactly while the system was slow, so the worst moments produced one sample
instead of fifty.

The mechanism is precise: the measured system delays or suppresses future observations that the
target arrival process would have generated. The resulting sample is conditioned on the system
being responsive. A 500 ms completed request may still be recorded as 500 ms, while scheduled
arrivals during it are absent, delayed, or timed from their eventual send rather than their due
time. The distortion can therefore affect sample density, offered load, queue state and the clock
used for each value. Counts are necessary evidence, but they do not identify the cause alone.

## Workflow

1. **Establish the generation model explicitly** — closed-loop, open-loop, or semi-open.
   Whatever it is, it must be a decision, not the tool's default.
2. **Write the stage and clock model.** Count scheduled/offered, generator-admitted, started,
   server-accepted and every terminal outcome. Preserve scheduled time, actual start, response
   completion and deadline so generator lag and service latency are separable.
3. **Check response coupling.** In a closed population at equilibrium, the interactive response
   law is `X = N/(R+Z)` for population `N`, response time `R` and think time `Z`. It explains why
   throughput falls as responses slow; `N ≥ λR` is a concurrency sizing estimate, not proof that
   a finite generator realised an open arrival process.
4. **Reconcile the schedule.** A planned/start deficit proves missed starts; it can come from
   response coupling, generator CPU/event-loop lag, connections, admission or an explicit drop
   policy. Use timestamps and generator telemetry to distinguish them. See
   `references/detection-and-generator-configuration.md`.
5. **Re-run with generation-time fidelity when possible.** Use the workload model production
   requires, validate actual inter-arrivals and generator headroom, and retain drops/timeouts as
   terminal outcomes. Report schedule delay separately or include it in the declared end-to-end
   clock.
6. **Use HdrHistogram correction only as a sensitivity model for legacy omission-prone data.**
   It creates synthetic observations under a regular-interval counterfactual; it does not recover
   the requests or queue that never existed. See `references/post-hoc-correction.md`.
7. **Report the evidence packet**, including raw and any corrected distributions, all stage
   counts, generator resource limits, arrival model, clocks and remaining threats.

## Rules

- Do not use universal deficit or `MAX/p99` thresholds. Distribution shape, duration, sample
  size and offered load can make any ratio healthy or pathological. Open load can change queue
  state and therefore the maximum itself; HdrHistogram quantises recorded values.
- A histogram/sample deficit is not equivalent to scheduled/start deficit: errors, timeouts and
  excluded outcomes may never enter a success-latency histogram. Reconcile independent counters.
- Closed-loop is correct for genuinely closed populations and serial workflows. The defect is a
  workload-model mismatch or a latency-at-fixed-arrival claim, not closed loops themselves.
- **Never apply `recordValueWithExpectedInterval` to data from a true open-loop generator.**
  Those queue waits are real; synthesising fill-in values on top of them counts the same
  omission twice, inflates the sample count and now _overestimates_ tail density. Plain
  `recordValue()` is the only correct path for independently-arriving samples.
- Preserve both `actualStart−scheduledStart` and `completion−actualStart`; use
  `completion−scheduledStart` only when the end-to-end estimand treats generator/client queueing
  as user wait. A scheduled item that is dropped is an outcome, not a fabricated latency.
- Preallocate concurrency from measured duration distributions and headroom, then validate actual
  schedule adherence. `N≈λR` is a mean equilibrium relation, not a worst-case guarantee.
- Any generator—including native code—can suffer scheduler pauses, CPU throttling, socket limits,
  clock error or distributed-controller skew. Monitor its host/process and timestamp actual starts.
- Tool behaviour is version- and scenario-specific. Use explicit open/closed constructs and verify
  effective output; the maintained tool matrix is in the detection reference.
- HdrHistogram has one correction for at-recording time (`recordValueWithExpectedInterval`)
  and one for after (`copyCorrectedForCoordinatedOmission`,
  `addWhileCorrectingForCoordinatedOmission`). Its javadoc calls them mutually exclusive
  on the same data: applying both counts the omission twice.
- A global pause is a clear demonstration, but is not required. Any slowdown or capacity loss
  can build a queue under exogenous arrivals while a finite closed loop reduces offered load.
  A sleep can reproduce the effect when it occupies a bounded worker/resource; state the model.
- JMH is not subject to this, but not because it is single-threaded. It measures invocation
  cost directly; there is no simulated arrival process to violate. `@Threads(N)` measures
  behaviour under saturation, which is a different question from latency at a production rate.
- Completed-call-only timers that exclude rejects/timeouts exhibit outcome-selection or censoring,
  not necessarily coordinated omission. They create the same optimistic dashboard and require
  terminal-outcome denominators, but name the mechanism correctly.
- Many independent closed users can approximate an open aggregate only under conditions on
  independence, population and think/service times. Correlated clients, synchronized retries and
  admission queues violate that approximation; measure production arrivals.

## Required audit artifact

```text
Target workload: open / closed / semi-open / replay; production evidence
Clock model:     scheduled, actual start, accepted, completed/deadline timestamps
Stage counts:    scheduled → admitted → started → accepted → each terminal outcome
Generator:       version/config, VUs/workers, CPU/GC/event-loop, sockets, clock sync
Schedule:        target and empirical inter-arrival distributions; lag/drop policy
Results:         raw distribution; corrected sensitivity (if any) and its interval model
Threats:         response coupling, saturation, censoring, retries, shared bottlenecks
Decision:        representative / descriptive-only / rerun required
```

## References

- [Detection and generator configuration](references/detection-and-generator-configuration.md)
  — stage reconciliation, timestamp evidence, generator validation, and version-sensitive
  semantics for wrk2, k6, Gatling, JMeter and Locust. Read when auditing an existing result set
  or configuring a run.
- [Post-hoc correction](references/post-hoc-correction.md) — the
  `recordValueWithExpectedInterval` algorithm with a worked example, HdrHistogram's own
  post-hoc API (`copyCorrectedForCoordinatedOmission`) and the double-correction rule, the
  decision table for when closed-loop is legitimately fine, sensitivity reporting,
  and where the regular-spacing counterfactual breaks. Read only when the data is
  genuinely closed-loop and the test cannot be re-run.
