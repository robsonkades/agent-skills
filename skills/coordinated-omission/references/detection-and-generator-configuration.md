# Detecting response-coupled omission and validating generators

## Stage reconciliation is necessary, not conclusive

Keep independent counters and monotonic timestamps for this pipeline:

```text
scheduled/offered → admitted by generator → actual start → server accepted
                  → completed | failed | timed out | cancelled | dropped
```

Do not substitute “samples in the success histogram” for actual starts. A deficit can be caused by
generator saturation, scenario shutdown/grace period, connection limits, filtering, explicit load
shedding or response-coupled workers. Classify where the loss occurred.

```python
# Partial reconciliation sketch: all IDs refer to the same original-attempt cohort.
# Retries/hedges have separate attempt IDs and their own stage counters.
due_ids = {item.id for item in schedule if item.due <= cutoff}
started_ids = {event.id for event in starts if event.time <= cutoff}
outstanding_due_ids = due_ids - started_ids
started = len(started_ids)
terminal = completed + failed + timed_out + cancelled

assert terminal <= started
unreconciled = started - terminal - still_in_flight
```

Use mutually exclusive terminal outcomes counted by the same cutoff, and snapshot counters
consistently. A timeout and its late response are one client terminal outcome; track the server's
late completion separately. Nonempty `outstanding_due_ids` means due starts are outstanding at
the cutoff, not that they will never start. At final drain, classify them as dropped, cancelled
before start or unresolved. Counts alone cannot detect lateness after every item eventually starts.
Coordinated omission is the diagnosis when slow/in-flight work governed missed or delayed starts relative to the
target arrival model. There is no universal 2% threshold: one missed start can matter for a tiny
safety test, while an explicitly modelled shed fraction can be acceptable if reported.

## Use timestamp evidence, not MAX heuristics

For every scheduled item retain:

```text
schedule lag   = actual_start − scheduled_start
response clock = completion − actual_start
end-to-end     = completion − scheduled_start
inter-arrival  = actual_start[i] − actual_start[i−1]
```

The response clock includes network and server queueing as well as execution; it is not pure
service time. Define actual start precisely (task entry, connection acquisition or wire send).
Durations require a shared monotonic clock domain; raw `nanoTime` values from different JVMs
are not comparable. Distributed alignment requires an explicit mapping with uncertainty.

Plot schedule lag and actual inter-arrivals against in-flight count, prior completions, generator
CPU/event-loop/GC and socket/connection limits. A sawtooth lag, missing starts, or issue gaps aligned
with all workers being busy supports response coupling. With multiple workers, a simple Pearson
correlation between global inter-arrivals and the preceding latency is not a valid detector: events
do not pair by worker, dependence can be nonlinear, and common load drives both.

`MAX/p99` can motivate inspection but proves nothing. Max changes with sample count and with the
queue state created by the arrival model; p99 changes with distribution and quantile resolution.
Never attach universal “healthy” ratios.

## The closed-system relation

For a stable closed population with `N` users, mean response time `R`, mean think time `Z` and
throughput `X`, the interactive response-time law is:

```text
N = X(R + Z)        therefore X = N/(R + Z)
```

With zero think time, throughput falls as response time rises. `N ≈ λR` estimates mean concurrency
needed to realise rate `λ`; using a high duration quantile plus headroom can guide allocation, but
does not guarantee a schedule. Variability, long requests, client work, retries and generator
resource limits decide the needed pool. Validate actual starts and lag.

## Current tool semantics—verify deployed versions

| Tool/configuration                                 | Workload semantics                                                                                                                                        | What must still be verified                                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **wrk2 `-R`**                                      | constant-throughput plan; default single-request connections wait for responses, but scripted pipelines are supported; latency uses intended-start timing | achieved request rate, calibration, pipeline/batch recording mode, connections/threads, socket errors, generator CPU/scheduling and exact fork/version                                        |
| **k6 arrival-rate executors**                      | iterations are scheduled independently of response while VUs are available                                                                                | preallocated VUs, `dropped_iterations`, actual iteration/request mix, generator CPU; dynamic `maxVUs` allocation can itself perturb the run                                                   |
| **Gatling `injectOpen(constantUsersPerSec...)`**   | open **user/scenario** arrivals                                                                                                                           | one injected user may execute many sequential requests, so user rate is not per-endpoint request rate; pauses are business semantics, and `.disablePauses()` is not what makes injection open |
| **JMeter Open Model Thread Group**                 | schedules arriving users from a rate expression; current manual still labels it experimental                                                              | each user executes a test plan, thread creation/generator capacity, terminal counts and exact JMeter version                                                                                  |
| **JMeter throughput timers + finite Thread Group** | timers pace available threads but do not create them; target can be missed when threads/samplers are busy                                                 | planned schedule, enough threads, timer semantics and actual starts; official manual recommends considering Open Model Thread Group                                                           |
| **Locust `constant_pacing`**                       | each user remains closed-loop; pacing targets time between that user's task starts and overruns start immediately after completion                        | aggregate arrival shape and user count; it is not a global open-arrival scheduler                                                                                                             |

`disablePauses()` and zero think time often make a closed model _more_ aggressive without making it
open. Likewise, “constant throughput” in a UI may cap or pace work but cannot promise starts when
the generator has no free execution context.

Check the latency recording unit when using wrk2 pipelines. In upstream commit `44a94c17`,
responses share the batch's expected start; default recording includes each response, while
`-B` records only the last response of the batch. Request throughput and histogram count
therefore need not have the same denominator. Verify the deployed fork before interpreting it.

The JMeter manual specifies that **Open Model Thread Group interrupts threads when its schedule
ends**. A bounded trailing `pause(...)` can provide drain time for existing users; it does not
schedule new arrivals during that pause. Verify the installed version and count interrupted or
unresolved operations after the declared drain. Excluding their unfinished waits is outcome
selection/censoring, not by itself proof of response-coupled omission.

## k6 example and guardrails

```javascript
export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 1000,
      // Add maxVUs only as a deliberate cushion/pilot; runtime allocation has cost.
    },
  },
};
```

The number `1000` is illustrative, not a sizing recommendation. Grafana's documentation advises
preallocating from trial evidence and notes that insufficient VUs emit `dropped_iterations`.
Record iteration duration (which includes script work), VU use, dropped iterations, generator CPU
and actual request-start timestamps. One iteration may issue zero, one or many requests, so
iteration schedule is not automatically endpoint arrival schedule.

Check the metric's clock separately: k6 `http_req_duration` is the sum of sending, waiting and
receiving time. It excludes initial DNS lookup/connection times and does not measure
`completion−scheduledStart`. Inspect blocked/connect/TLS and iteration timings where client waits
matter, and use paired timestamps for the required end-to-end boundary. Adding component p99s
does not produce the p99 of their sum. An arrival-rate executor does not change the definition
of `http_req_duration`.

## Validation protocol

Use the checks needed to resolve the disputed claim, reusing valid artifacts. Before a new
run or pause injection, set target scope, duration, arrival/concurrency caps, abort thresholds
and drain policy; generator validation is not permission to increase load without a bound.

1. Derive open/closed/semi-open/replay semantics from production arrival evidence.
2. Pin tool and plugin versions; inspect defaults rather than copying a generic command.
3. Generate a schedule with stable identifiers and monotonic due times. In distributed load,
   measure controller/worker clock alignment or keep comparisons local to one clock.
4. Pilot generator-only overhead and adjust concurrency/resources within the declared bounds
   to test schedule fidelity and headroom without runtime allocation churn. If the generator
   cannot meet the target within those bounds, report the limitation.
5. Inject a known service pause and a generator CPU/GC pause separately. Confirm stage counters and
   clocks distinguish server queueing from generator lag.
6. Reconcile all terminal outcomes after the grace/drain policy. Report late starts and drops; do
   not silently extend the run until counts happen to match.
7. Compare actual inter-arrival distribution and burstiness with the target, not only average RPS.
8. Archive configuration, seed/schedule, generator telemetry and raw timestamps/histograms.

## Sources

- [wrk2 README: constant-throughput model and intended-start latency](https://github.com/giltene/wrk2)
- [wrk2 pipeline response recording, pinned implementation](https://github.com/giltene/wrk2/blob/44a94c17d8e6a0bac8559b53da76848e430cb7a7/src/wrk.c#L508-L558)
- [Grafana k6: constant-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)
- [Grafana k6: arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Grafana k6: built-in metric boundaries](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)
- [Gatling workload models](https://docs.gatling.io/testing-concepts/workload-models/)
- [Gatling injection reference](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter component reference](https://jmeter.apache.org/usermanual/component_reference.html)
- [Locust `constant_pacing` API](https://docs.locust.io/en/stable/api.html#locust.wait_time.constant_pacing)
- [Schroeder et al., “Open Versus Closed: A Cautionary Tale” (NSDI 2006)](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
