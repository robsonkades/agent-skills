---
name: coordinated-omission
description: >
  Coordinated omission in depth: the exact mechanism (missing samples, never wrong values),
  the closed-loop ceiling lambda_max = N/R, detection by reconciling issued against planned
  requests and by the MAX/p99 ratio, correction at recording time versus at generation time,
  HdrHistogram's recordValueWithExpectedInterval semantics, what wrk2, k6, Gatling, JMeter
  and Locust each actually do, and the effect on capacity numbers. Use when a load test's
  p99 is far better than production's for the same endpoint, when a histogram holds fewer
  samples than rate x duration, when MAX is 20x-100x the p99, when someone proposes applying
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

The mechanism is precise, and stating it precisely is what makes it diagnosable. Coordinated
omission never records a wrong value — a 500 ms response is recorded as 500 ms by any
generator that observes it. What is missing are the requests that a real arrival process
would have delivered _during_ that 500 ms and which the loop never sent, because it was
blocked waiting. The distortion lives entirely in the **sample density of the tail**, which is
why every reliable detection method counts samples rather than inspecting values.

## Workflow

1. **Establish the generation model explicitly** — closed-loop, open-loop, or semi-open.
   Whatever it is, it must be a decision, not the tool's default.
2. **Check the structural ceiling before trusting any rate.** A closed-loop generator holds
   `L(t) ≈ N` requests in flight, so by Little's Law `lambda_effective = N / R`. To sustain a
   target rate under a worst-case response time, `N >= lambda_target x R_worst_tolerated`.
   Below that, the generator silently delivers less than the target — no error, no timeout,
   no log.
3. **Reconcile planned against issued.** `rate x duration` versus the number of samples in
   the histogram. This is the conclusive check because it assumes nothing about the shape of
   the distribution. See `references/detection-and-generator-configuration.md`.
4. **Compute MAX/p99 as the corroborating signal.** MAX is structurally protected from the
   distortion, so a suppressed p99 shows up as a blown-out ratio.
5. **Fix at generation time if the test can be re-run** — an open-loop generator measuring
   from the _planned_ arrival instant, recording with plain `recordValue()`.
6. **Correct at recording time only for closed-loop data you cannot re-run**, and treat the
   result as an approximation. See `references/post-hoc-correction.md`.
7. **Report percentiles next to the planned/issued reconciliation**, always. A percentile
   published alone cannot be audited for this at all.

## Rules

- Never claim a load test suffers "lower latency readings". It does not. It reports correct
  values for a non-representative subset of requests. Diagnose by counting samples.
- Treat a deficit of more than ~2% between planned (`rate x duration`) and issued samples as
  coordinated omission until proven otherwise — before looking at any percentile.
- Treat MAX/p99 above 20x as strong suspicion, and above 50x as near-certainty. Healthy
  open-loop measurements are rarely above 10x.
- Never use MAX alone as the detector. MAX is invariant between closed-loop and open-loop by
  construction: a request's duration is a property of the system, not of the generator's
  scheduling, and coordination only changes _when the next request is sent_.
- Never discard MAX as an outlier either. It is the real worst case a user experienced, and
  it is the statistic most protected from this distortion. HdrHistogram preserves it exactly;
  approximate-sampling backends may drop or round it by design.
- **Never apply `recordValueWithExpectedInterval` to data from a true open-loop generator.**
  Those queue waits are real; synthesising fill-in values on top of them counts the same
  omission twice, inflates the sample count and now _overestimates_ tail density. Plain
  `recordValue()` is the only correct path for independently-arriving samples.
- Measure latency from the **planned** arrival instant, not from the moment the request
  actually left the client — the latter already absorbs the client's own delay:
  `latencyNs = System.nanoTime() - plannedArrivalNs`.
- Size the generator's concurrency from `N >= lambda_target x R_worst_tolerated`. Skipping
  this makes every other correction cosmetic.
- Gatling: use `.disablePauses()` — `pauses(none)` does not exist in the DSL. Locust: use
  `constant_pacing(interval)` — `wait_time = constant(0)` only removes think-time and leaves
  emission coupled to the response.
- A benchmark whose "slow" requests merely sleep on their own thread does not reproduce this
  at all. The canonical slow event is a **shared-resource** stall — an STW GC pause, where
  every thread stops at a safepoint — and only a shared stall builds the queue behind it.
- JMH is not subject to this, but not because it is single-threaded. It measures invocation
  cost directly; there is no simulated arrival process to violate. `@Threads(N)` measures
  behaviour under saturation, which is a different question from latency at a production rate.
- The same omission occurs outside load testing: a `Timer` records only completed calls, so
  requests rejected by a full executor queue or an open circuit breaker produce no latency
  sample at all — the dashboard improves precisely as the service gets worse.
- Ten thousand independent synchronous clients aggregate, at the server, into an approximately
  independent arrival process. "Production is synchronous too" does not excuse a single-threaded
  closed-loop benchmark; it is a statement about the generator's structure, not the client's.

## References

- [Detection and generator configuration](references/detection-and-generator-configuration.md)
  — the three detection signals with runnable checks, where to read "issued" and "planned" in
  wrk2, k6, Gatling, JMeter and a custom script, and the correct open-loop configuration for
  each tool including the two DSL corrections. Read when auditing an existing result set or
  configuring a run.
- [Post-hoc correction](references/post-hoc-correction.md) — the
  `recordValueWithExpectedInterval` algorithm with a worked example, the decision table for
  when closed-loop is legitimately fine, the historical-versus-production comparison, and where
  the uniform-spacing assumption breaks. Read only when the data is genuinely closed-loop and
  the test cannot be re-run.
