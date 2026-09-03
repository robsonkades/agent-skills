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
scheduled = len(schedule)
started = len(actual_start_times)
terminal = completed + failed + timed_out + cancelled

assert terminal <= started
schedule_deficit = scheduled - started
unreconciled = started - terminal - still_in_flight
```

`schedule_deficit > 0` proves the requested schedule was not realised. Coordinated omission is the
diagnosis only when slow/in-flight work governed those missed or delayed starts relative to the
target arrival model. There is no universal 2% threshold: one missed start can matter for a tiny
safety test, while an explicitly modelled shed fraction can be acceptable if reported.

## Use timestamp evidence, not MAX heuristics

For every scheduled item retain:

```text
schedule lag   = actual_start − scheduled_start
service clock  = completion − actual_start
end-to-end     = completion − scheduled_start
inter-arrival  = actual_start[i] − actual_start[i−1]
```

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

| Tool/configuration                                 | Workload semantics                                                                                                                                    | What must still be verified                                                                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **wrk2 `-R`**                                      | constant-throughput plan; connections remain serial, and reported latency is measured from intended transmission time to compensate for delayed sends | achieved request rate, calibration, connections/threads, socket errors, generator CPU/scheduling and exact fork/version                                                                       |
| **k6 arrival-rate executors**                      | iterations are scheduled independently of response while VUs are available                                                                            | preallocated VUs, `dropped_iterations`, actual iteration/request mix, generator CPU; dynamic `maxVUs` allocation can itself perturb the run                                                   |
| **Gatling `injectOpen(constantUsersPerSec...)`**   | open **user/scenario** arrivals                                                                                                                       | one injected user may execute many sequential requests, so user rate is not per-endpoint request rate; pauses are business semantics, and `.disablePauses()` is not what makes injection open |
| **JMeter Open Model Thread Group**                 | schedules arriving users from a rate expression; current manual still labels it experimental                                                          | each user executes a test plan, thread creation/generator capacity, terminal counts and exact JMeter version                                                                                  |
| **JMeter throughput timers + finite Thread Group** | timers pace available threads but do not create them; target can be missed when threads/samplers are busy                                             | planned schedule, enough threads, timer semantics and actual starts; official manual recommends considering Open Model Thread Group                                                           |
| **Locust `constant_pacing`**                       | each user remains closed-loop; pacing targets time between that user's task starts and overruns start immediately after completion                    | aggregate arrival shape and user count; it is not a global open-arrival scheduler                                                                                                             |

`disablePauses()` and zero think time often make a closed model _more_ aggressive without making it
open. Likewise, “constant throughput” in a UI may cap or pace work but cannot promise starts when
the generator has no free execution context.

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

## Validation protocol

1. Derive open/closed/semi-open/replay semantics from production arrival evidence.
2. Pin tool and plugin versions; inspect defaults rather than copying a generic command.
3. Generate a schedule with stable identifiers and monotonic due times. In distributed load,
   measure controller/worker clock alignment or keep comparisons local to one clock.
4. Pilot generator-only overhead and raise concurrency/resources until target starts are met with
   headroom without runtime allocation churn.
5. Inject a known service pause and a generator CPU/GC pause separately. Confirm stage counters and
   clocks distinguish server queueing from generator lag.
6. Reconcile all terminal outcomes after the grace/drain policy. Report late starts and drops; do
   not silently extend the run until counts happen to match.
7. Compare actual inter-arrival distribution and burstiness with the target, not only average RPS.
8. Archive configuration, seed/schedule, generator telemetry and raw timestamps/histograms.

## Sources

- [wrk2 README: constant-throughput model and intended-start latency](https://github.com/giltene/wrk2)
- [Grafana k6: constant-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)
- [Grafana k6: arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Gatling workload models](https://docs.gatling.io/testing-concepts/workload-models/)
- [Gatling injection reference](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter component reference](https://jmeter.apache.org/usermanual/component_reference.html)
- [Locust `constant_pacing` API](https://docs.locust.io/en/stable/api.html#locust.wait_time.constant_pacing)
- [Schroeder et al., “Open Versus Closed: A Cautionary Tale” (NSDI 2006)](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
