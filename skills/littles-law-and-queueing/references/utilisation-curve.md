# Reading the utilisation curve

## M/M/1

```
R_total = S / (1 − ρ)        W_queue = R_total − S
```

Where it comes from, in three lines, so the "80% cliff" is a derivation and not a slogan:
the mean number in an M/M/1 system is `L = ρ / (1 − ρ)`; Little gives `R = L / λ`; and
`ρ = λ × S`, so `R = S / (1 − ρ)`. The slope is `dR/dρ = S / (1 − ρ)²`: at ρ = 0.5 each
extra point of utilisation costs `0.04 S`, at 0.8 it costs `0.25 S`, at 0.9 it costs
`1.0 S`. The cliff is the square in the denominator. With `c` servers sharing one queue
the knee moves right — a 32-thread pool tolerates a higher ρ than a 2-thread one — and
choosing between M/M/1, M/M/c and M/D/1 for a real system is `queueing-models`.

| ρ    | R_total | Reading                                |
| ---- | ------- | -------------------------------------- |
| 0.50 | 2.0 × S | queue wait already equals service time |
| 0.70 | 3.3 × S | still recoverable                      |
| 0.80 | 5.0 × S | the knee                               |
| 0.90 | 10 × S  | +10% load from here is +200% latency   |
| 0.99 | 100 × S | not a system, an outage in progress    |

Two consequences that are not intuitive:

- **Queue wait equals service time at ρ = 0.5.** Half the response time is already
  waiting, at what most dashboards render as a comfortable green.
- **Returns on capacity are super-linear near saturation.** By Erlang-C, doubling
  capacity for a system at 80% utilisation moves latency from 5.0×S to 1.19×S — a 4.2×
  improvement, not 2×. The same spend at 40% utilisation buys almost nothing.

Service-time variance is a capacity lever in its own right: with deterministic service
time (M/D/1) the queue wait is half that of M/M/1 at the same utilisation.

## Bimodal service time

The mean of a bimodal distribution describes neither mode.

```
99% of requests at 10 ms, 1% at 500 ms:

  E[S] = 0.99 × 0.010 + 0.01 × 0.500 = 0.0149 s
  At 100 req/s:  ρ = 100 × 0.0149 = 1.49  → already saturated

The slow path is 1% of requests and 34% of utilisation.
```

Model the two paths separately and sum their utilisations.

## The Universal Scalability Law knee

Beyond `N* = √((1 − α) / β)` — where α is the serial fraction and β the coherency
penalty — total throughput **falls** as concurrency rises. This is why "add threads" has
a maximum and then reverses, and why a scalability curve that turns downward is evidence
of coherency cost (see `cpu-cache-and-numa`), not of missing capacity.

## Diagnosing saturation

| Observation                              | Classification           | Next step                 |
| ---------------------------------------- | ------------------------ | ------------------------- |
| High CPU, threads `RUNNABLE`             | CPU-bound                | profile the hot path      |
| Low CPU, threads `TIMED_WAITING` in park | pool or downstream limit | `jdk.ThreadPark`          |
| Low CPU, threads `BLOCKED`               | monitor contention       | `jdk.JavaMonitorEnter`    |
| Latency rising over the run's duration   | queue accumulating       | inspect `workQueue` depth |

Lower the JFR locking thresholds first if the contention is fine-grained — the defaults
(20 ms in `default.jfc`, 10 ms in `profile.jfc`) hide exactly the high-frequency case,
and "zero events" then reads as "no contention".

**Low CPU with high latency is a queue, not idleness.** It is the most common incident
shape in JVM applications, and no CPU metric will point at it.
