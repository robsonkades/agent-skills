---
name: load-testing
description: >
  Designing a load test whose numbers describe the system rather than the generator:
  open-loop versus closed-loop injection, the N/mu latency ceiling of closed loops, warm-up
  phases, representative datasets, generator placement, analytic prediction before
  execution, and the validity conditions that make a run reportable. Use when a load test is
  being designed or reviewed, when a k6/Gatling/JMeter script uses a fixed number of virtual
  users, when throughput plateaus while latency doubles as VUs are added, when the generator
  runs on the application host, when a single run is treated as a measurement, or when a
  soak test needs a plan. Does not cover the statistics of the resulting numbers
  (latency-statistics), microbenchmarking (jmh-microbenchmarks), or capacity arithmetic
  (littles-law-and-queueing). Profiles beyond a steady rate are load-testing-advanced and
  the omission mechanism is coordinated-omission.
---

# Load Testing

## Purpose

Produce a load-test result that characterises the service. The dominant failure is a test
whose numbers describe the generator: a closed loop has a structural latency ceiling of
`N/μ` and a throughput ceiling of `μ`, so neither number answers "what happens when the
real arrival pattern shows up".

## Workflow

1. **State the SLO** with metric, threshold and evaluation window.
2. **Choose the injection model.** Open-loop (`constant-arrival-rate`,
   `constantUsersPerSec`, wrk2 `-R`, JMeter's Open Model Thread Group) for any service
   with external clients. Closed-loop only when the real client genuinely is a fixed set
   of workers. The construct table in `references/test-plan.md` names both kinds per tool,
   because a script review has to recognise the closed-loop ones.
3. **Predict the result analytically before running.** If the observed result violates the
   lower bound the experiment's own mechanics impose, the experiment is wrong — and the
   only way to discover that is to have computed the bound beforehand.
4. **Separate the warm-up phase** and discard its metrics by tag, gating on a compilation
   criterion rather than a clock.
5. **Run, watching validity in real time**: `dropped_iterations`, `vus` versus `maxVUs`,
   heap after full collection, pools and executors.
6. **Check validity before reading any number.** `dropped_iterations == 0` and
   `vus < maxVUs`; issued requests reconcile with planned requests. Otherwise the run is
   discarded, not interpreted.
7. **Repeat at least three times** at the baseline load. The spread between runs _is_ your
   experiment's resolution — without it there is no way to tell an 8% change from noise.

## Rules

- A closed loop cannot report a latency above `N/μ` or a throughput above `μ`. Detect it by
  running the same test with N and 2N VUs: if throughput does not move and latency doubles,
  the generator is in charge.
- Open-loop above capacity has **no steady state**. With `λ > μ` the queue grows at
  `(λ−μ)` per second and latency at `(λ−μ)/μ` seconds per second of test. That is the only
  configuration that can characterise behaviour above capacity — which is precisely the
  incident scenario.
- Size `maxVUs` by Little's Law for the **worst** predicted latency, not the expected one.
  Hitting `maxVUs` silently converts the run into a closed loop.
- Never run the generator on the application host. It competes for CPU and memory, and
  loopback congestion behaves differently from a real network — and the distortion appears
  exactly when the target saturates, which is the regime you wanted to measure.
- Never report the mean. 9,999 requests at 10 ms plus one at 10,000 ms averages to 11 ms,
  which describes zero users. Report p50/p90/p99/p99.9/max **and the sample count**. The
  mean's one legitimate use here is feeding Little's Law.
- A handful of IDs against a million-row database measures the database's cache. Beyond the
  obvious hit-rate bias there is a second-order effect: a uniform dataset reduces
  service-time variance, which reduces predicted queueing at the same utilisation. The test
  is optimistic twice.
- Warm-up is a rate, not a clock. "Two minutes of warm-up" is a clock rule for a phenomenon
  governed by invocation count; at low load, two minutes may not be enough.
- `-XX:+FlightRecorder` does not start a recording. On JDK 25 it is accepted with a
  "deprecated in version 13.0" warning and does nothing else (executed, Temurin 25.0.3), so
  a plan that lists it believes it is recording and is not. Use `-XX:StartFlightRecording`
  or `jcmd <pid> JFR.start`.
- GC pause and safepoint pause are not the same thing. Record `-Xlog:gc*,safepoint` and
  correlate by timestamp instead of estimating durations — fixed pause-duration numbers are
  folklore, since they depend on collector, sizing, allocation rate and hardware.
- `jcmd VM.native_memory` requires `-XX:NativeMemoryTracking` at startup and never reports
  Java object instances — for that use `GC.class_histogram` or a heap dump.

## References

- [Test plan and validity](references/test-plan.md) — the before/during/after checklist,
  the k6 and Gatling open-loop configurations, and the validity conditions that decide
  whether a run is reportable. Read when designing or reviewing a run.
