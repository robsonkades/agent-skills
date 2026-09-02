# Detecting it in collected data, and configuring the generator not to cause it

## Signal 1 — planned versus issued (conclusive)

The only check that assumes nothing about the distribution's shape. It is arithmetic.

```python
planned = target_rate_req_s * duration_s
issued  = total_samples_in_histogram

deficit_pct = 100 * (1 - issued / planned)
if deficit_pct > 2:
    print(f"ALERT: {deficit_pct:.1f}% deficit — consistent with coordinated omission")
```

Where to read both numbers:

| Tool          | "issued"                                                 | "planned"                                                                                                       |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| wrk2          | total count in the summary, or `Requests/sec` x duration | `-R <rate>` x `-d <duration>`                                                                                   |
| k6            | `http_reqs`; the deficit itself is `dropped_iterations`  | executor `rate` x `duration` (per `timeUnit`)                                                                   |
| Gatling       | requests generated, in the simulation log / HTML report  | the injection profile (`constantUsersPerSec(x).during(y)`)                                                      |
| JMeter        | sample count in the results listener                     | the Open Model schedule (`rate(x/sec) random_arrivals(y)`), or `Threads x Loop Count` for a closed Thread Group |
| Custom script | a counter incremented on every _send_                    | `target_rate x duration`                                                                                        |

Print this reconciliation in every load-test report. Percentiles published without it cannot
be audited.

### The closed-loop ceiling, worked

`lambda_max = N / R`: a closed loop with `N` workers can never issue faster than one request
per worker per response time.

```
N = 50 workers, R_worst = 2 s during a GC pause   ->  lambda_max = 25 req/s
target lambda = 200 req/s                         ->  N >= 200 x 2 = 400 workers
```

With 50 workers, the 2 s window that should have carried 400 requests carries 50 — an
87.5% deficit, concentrated exactly in the samples that define the tail. Size `N` from the
worst response time you intend to _measure_, not from the median.

## Signal 2 — the MAX/p99 ratio

```
healthy open-loop:  typically < 10x
suspicious:         > 20x
near-certain:       > 50x

p50=1ms  p99=3ms  p99.9=5ms  MAX=450ms   ->  MAX/p99 = 150x
```

MAX stays correct while the p99 is starved of the samples that would have fed it, so the ratio
between them is where the suppression becomes visible. MAX on its own never reveals it.

## Signal 3 — correlation between inter-arrival time and latency

```python
inter_arrivals = np.diff(sent_times)                 # send timestamps, not completions
correlation = np.corrcoef(inter_arrivals, latencies[:-1])[0, 1]
# > 0.8 : the next send is governed by the previous response — closed-loop coupling
# < 0.2 : consistent with independent arrivals
```

In a closed-loop generator with no think-time, `t_next_send = t_now + L(t_now)` — the interval
between sends _is_ the previous latency, which is what this correlation measures directly.

## Correct configuration, per generator

| Tool        | Open-loop?                                   | Built-in correction              | Correct configuration                                                                                                |
| ----------- | -------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **wrk2**    | Yes — it is the reason it exists             | Yes (HdrHistogram built in)      | `-R <rate>` sets arrivals independent of responses                                                                   |
| **k6**      | Yes                                          | Not needed when configured right | `executor: 'constant-arrival-rate'` with `maxVUs >= rate x R_worst`; `dropped_iterations` must be 0                  |
| **Gatling** | Yes, with the caveat below                   | Partial                          | `.disablePauses()` on an open injection (`constantUsersPerSec`); `constantConcurrentUsers` is the closed form        |
| **JMeter**  | Only with the Open Model Thread Group (5.5+) | No                               | `rate(<n>/sec) random_arrivals(<duration>)`; a plain Thread Group with `Constant Throughput Timer` stays closed-loop |
| **Locust**  | Approximate, with enough concurrency         | No                               | `constant_pacing(interval)`                                                                                          |

JMH belongs to a different paradigm and does not appear in this table: it measures direct
invocation cost under saturation, with no simulated arrival process to omit from.

### Gatling — `.disablePauses()`, not `pauses(none)`

```scala
setUp(
  scn.inject(constantUsersPerSec(1000).during(60.seconds))
     .disablePauses()
).protocols(httpProtocol)
```

`pauses(none)` does not exist in the DSL. And `.disablePauses()` removes the scenario's
explicit pauses — it does not turn the injection into a per-request high-precision scheduler
the way wrk2's `-R` timer is. With one step per virtual user (the usual latency test) it
approximates open-loop well; with multi-step sequential scenarios it does not carry the same
guarantee.

### Locust — `constant_pacing()`, not `constant(0)`

```python
class FastEndpointUser(HttpUser):
    wait_time = constant_pacing(1.0 / 100)   # ~10 ms between task *starts*

    @task
    def hit_fast_endpoint(self):
        self.client.get("/fast")
```

`constant_pacing(interval)` spaces the **start** of each task by `interval`, subtracting the
task's own execution time; if the task overruns, the next start is immediate. With enough
independent users this aggregates into approximately independent arrivals.
`wait_time = constant(0)` only removes think-time — the user still waits for the response
before sending again, which is a closed loop running flat out. That measures serial pipeline
throughput, not latency at a target rate.

### JMeter — Open Model Thread Group, not a timer

```text
rate(0) random_arrivals(1 min) rate(200/sec) random_arrivals(10 min) rate(200/sec)
```

The Open Model Thread Group (JMeter 5.5, marked experimental) schedules arrivals from the
rate expression and creates threads on demand, so a slow response does not delay the next
arrival. A classic Thread Group is closed-loop by construction: each thread waits for its
response before looping, and a `Constant Throughput Timer` or `Precise Throughput Timer`
only paces the threads that exist — JMeter's own reference now points to the Open Model
group as the better choice for a load profile. Whichever is used, the reconciliation in
signal 1 is what shows whether the schedule was honoured.

### k6 — the deficit is a metric

`constant-arrival-rate` starts iterations on its own clock. When every VU up to `maxVUs`
is busy, k6 **drops** the iteration and counts it in `dropped_iterations` instead of
queueing it — which is coordinated omission made explicit. A run with `dropped_iterations

> 0`under-sampled its tail exactly as a closed loop would; size`maxVUs`from`rate x R_worst` and treat a non-zero count as a failed run, not a footnote.

## Measurement protocol for a clean run

1. Define `lambda` as the **production** load, not the maximum the system can absorb — maximum
   capacity is a different question with a different protocol.
2. Pick an open-loop generator and set concurrency with headroom over
   `N >= lambda x R_worst_tolerated`.
3. Measure from the planned arrival instant:
   `long latencyNs = System.nanoTime() - plannedArrivalNs;`
4. Record with plain `recordValue()`.
5. Report the planned/issued reconciliation next to the percentiles.

## Where the same omission hides outside load testing

- A Micrometer `Timer` around a blocking HikariCP acquisition records a sample only when the
  call **completes**. Once the application starts rejecting upstream — open circuit breaker,
  full executor queue — those rejections produce no latency sample, and the latency panel
  improves as the service degrades. Check the rejection and timeout counters alongside it.
- Percentile aggregation compounds it. If one instance of N hit a GC pause and each instance
  runs its own closed-loop generator, the affected instance under-records more samples than the
  others — so it also carries _less weight_ in any naive count-weighted aggregation, hiding the
  problem twice: once in its own tail, once again in the roll-up.
