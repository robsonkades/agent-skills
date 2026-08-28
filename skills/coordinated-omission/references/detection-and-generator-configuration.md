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

| Tool          | "issued"                                                 | "planned"                                                             |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| wrk2          | total count in the summary, or `Requests/sec` x duration | `-R <rate>` x `-d <duration>`                                         |
| k6            | `http_reqs` in the final summary                         | executor `rate` x `duration`                                          |
| Gatling       | requests generated, in the simulation log / HTML report  | the injection profile (`constantUsersPerSec(x).during(y)`)            |
| JMeter        | sample count in the results listener                     | `Threads x Loop Count`, or the configured `Constant Throughput Timer` |
| Custom script | a counter incremented on every _send_                    | `target_rate x duration`                                              |

Print this reconciliation in every load-test report. Percentiles published without it cannot
be audited.

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

| Tool        | Open-loop?                           | Built-in correction              | Correct configuration                                                 |
| ----------- | ------------------------------------ | -------------------------------- | --------------------------------------------------------------------- |
| **wrk2**    | Yes — it is the reason it exists     | Yes (HdrHistogram built in)      | `-R <rate>` sets arrivals independent of responses                    |
| **k6**      | Yes                                  | Not needed when configured right | `executor: 'constant-arrival-rate'`                                   |
| **Gatling** | Yes, with the caveat below           | Partial                          | `.disablePauses()` on the injection                                   |
| **JMeter**  | No, by default                       | No                               | Closed-loop by default; `Constant Throughput Timer` only approximates |
| **Locust**  | Approximate, with enough concurrency | No                               | `constant_pacing(interval)`                                           |

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

### JMeter

Closed-loop with means on the main screen. To reduce (not remove) the problem: add the
`jp@gc - Response Times Over Time` listener, use a correct percentile plugin, and configure a
`Constant Throughput Timer` — while knowing that none of this gives the mathematical guarantee
of an independent timer like wrk2's.

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
