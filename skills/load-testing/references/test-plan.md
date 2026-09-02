# Test plan and validity

## Open-loop injection

```javascript
// k6 — arrival rate is fixed by schedule, not by response
export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      tags: { phase: 'warmup' }, // discarded at analysis time
    },
    steady: {
      executor: 'constant-arrival-rate',
      startTime: '3m',
      rate: 500,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      tags: { phase: 'measure' },
    },
  },
};
```

What matters is that the generator issues by schedule and does not wait for the previous
response. The constructs that decide which model a script is running, per tool:

| Tool    | Closed-loop — flag in review                                                                                                                                                     | Open-loop                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6      | `shared-iterations`, `per-vu-iterations`, `constant-vus`, `ramping-vus` — a VU count, iterations "as many as possible"                                                           | `constant-arrival-rate`, `ramping-arrival-rate` (`startRate`, `stages: [{target, duration}]`, `preAllocatedVUs`, `maxVUs`)                                                                          |
| Gatling | `constantConcurrentUsers`, `rampConcurrentUsers`, `incrementConcurrentUsers`; also any open-model user whose scenario loops (`forever`, `repeat`) — inside the loop it is closed | `atOnceUsers`, `rampUsers`, `constantUsersPerSec`, `rampUsersPerSec`, `stressPeakUsers`, `incrementUsersPerSec`, one pass of the scenario per user                                                  |
| JMeter  | Thread Group (N threads looping); a Constant Throughput Timer only caps that loop's rate — it still cannot exceed `N/R`                                                          | Open Model Thread Group (JMeter 5.5+): a schedule such as `rate(100/sec) random_arrivals(10 min)`, with `even_arrivals`, `pause` and `/sec`, `/min`, `/hour` units; threads are created per arrival |
| wrk     | `wrk` — every connection sends as soon as the previous response arrives                                                                                                          | `wrk2 -R <rate>`, which also reconstructs omitted samples                                                                                                                                           |
| Locust  | The default `HttpUser` loop, including `wait_time = constant(0)`                                                                                                                 | Approximate only — `constant_pacing`; see `coordinated-omission`                                                                                                                                    |

Detection when the model is not obvious from the script, correction of data already
collected, and the Gatling and Locust caveats are `coordinated-omission`.

Size `maxVUs` from Little's Law using the **worst** predicted latency. If the run hits
`maxVUs`, the generator silently became a closed loop and the run is void.

## Queueing prediction, computed before the run

```
W_total = 1 / (μ(1 − ρ))      W_queue = W_total − 1/μ
```

Queue wait equals service time already at ρ = 0.5 and diverges above 0.9. With
deterministic service time (M/D/1) the wait is half that of M/M/1 at the same utilisation —
service-time variance is a capacity lever as real as hardware.

Write the prediction down before executing. A result that violates the lower bound your own
experiment's mechanics impose means the experiment is wrong, and there is no way to notice
without the prior calculation.

## JVM configuration for the run

```
-Xms<same as Xmx> -Xmx<...> -XX:+AlwaysPreTouch
-Xlog:gc*,safepoint:file=gc.log:time,uptime:filecount=5,filesize=20m
-XX:StartFlightRecording:name=run,maxsize=512m,settings=profile,disk=true
-XX:NativeMemoryTracking=summary
```

`-XX:+FlightRecorder` is not a way to record. Deprecated since JDK 13, it is still accepted
on JDK 25 with a warning and starts no recording (executed, Temurin 25.0.3): the JVM boots,
the plan says "JFR on", and the file never appears. `-XX:StartFlightRecording` is the flag
that records.

## Before the run

- [ ] SLO documented with metric, threshold and evaluation window
- [ ] Generator on a machine separate from the application
- [ ] Dataset with representative cardinality and access distribution, including the
      hot/cold ratio
- [ ] Open-loop mode configured
- [ ] `maxVUs` sized by Little's Law for the **worst** predicted latency
- [ ] Analytic prediction made and recorded
- [ ] JVM flags as above
- [ ] Generator and target clocks synchronised (NTP)
- [ ] Artefact version, JDK version and flags recorded with the plan

## During the run

- [ ] Smoke test passed before any measurement
- [ ] Warm-up metrics tagged for discard
- [ ] `dropped_iterations` and `vus` versus `maxVUs` watched live
- [ ] Heap after full collection tracked (soak)
- [ ] Connection pool and executors tracked
- [ ] The exact load at which the SLO starts being violated recorded

## After the run — validity first

- [ ] `dropped_iterations == 0` and `vus < maxVUs` — otherwise **discard the run**
- [ ] Issued requests reconcile with planned requests
- [ ] p50/p90/p99/p99.9/max **and the sample count** published together
- [ ] Latency steps correlated with pause timestamps in `gc.log`
- [ ] The limiting resource identified, with the evidence that supports it
- [ ] Spread across at least three repeated runs recorded
- [ ] JFR, `gc.log` and raw output archived as a versioned baseline

The validity conditions come before interpretation. A run that fails them does not produce
a smaller number or a noisier one — it produces a number about the generator.
