# Production behaviour, and what a wrong prediction is telling you

The formulas assume steady state, Poisson arrivals, a fixed `c` and a queue nobody leaves.
Production violates each of those in a specific way, and each violation moves the measured
wait in a known direction. This reference maps the real system onto the model, then reads a
disagreement backwards to the assumption that failed.

## Which real system is which model

| System                                                  | Model                                                | The `c` that matters                                              |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `ThreadPoolExecutor`, fixed size, shared `workQueue`    | M/M/c (Allen–Cunneen if `c_s ≠ 1`)                   | `corePoolSize` when the queue is unbounded; see the measuring ref |
| HikariCP / any connection pool with an acquisition wait | M/M/c whose waiters renege at `connectionTimeout`    | `maximumPoolSize`, fixed; count timeouts as lost arrivals         |
| Semaphore bulkhead, `tryAcquire()` with no wait         | M/M/c/c — Erlang B, a loss system                    | The permit count                                                  |
| Bounded `ArrayBlockingQueue` with a rejection handler   | M/M/c/K                                              | `c` servers, `K - c` slots                                        |
| Single-threaded event loop, one Kafka partition         | M/G/1 FIFO — head-of-line blocking                   | 1, per loop or per partition                                      |
| Kafka consumer group, `p` partitions, `n` consumers     | `min(p, n)` separate M/G/1 queues, keyed, not pooled | `min(p, n)`; extra partitions beyond consumers add nothing        |
| Pods behind a load balancer, random or hash routing     | `c` independent M/M/1 queues                         | 1 per pod; the fleet gets no pooling benefit                      |
| Pods behind a load balancer, round-robin                | `c` G/M/1 queues, `c_a² ≈ 1/c` (Erlang-`c` arrivals) | 1 per pod, but calmer arrivals than random                        |
| Pods behind least-connections / join-shortest-queue     | Approximately one M/M/c                              | The fleet size                                                    |
| Kubernetes HPA on mean CPU                              | M/M/c whose `c` follows `rho` with a lag             | `c(t)`, minutes behind `lambda(t)`                                |
| A closed load generator with `N` virtual users          | Closed system, population `N`, think time `Z`        | The generator caps `lambda`, so `rho -> 1` is unreachable         |

Load-balancing policy is the decision that makes a fleet one pool or `c` queues. Eight pods
at `rho = 0.8`, `S = 100 ms`: random or key-hash routing gives `Wq = 400 ms` (eight M/M/1),
round-robin about `225 ms` (Kingman with `c_a² = 1/8`), least-connections about `29 ms`
(M/M/8). Same pods, same load, a 14x spread that is entirely the routing policy. The same
arithmetic says a Kafka topic with 8 partitions and a hot key behaves as one M/G/1 at that
key's load, and the other 7 partitions cannot help it — see `kafka-consumers-in-java` for the
consumer side.

Erlang C with `c` set to the pod count is right only for the least-connections row, and only
while the pods do not coordinate; a fleet with a non-zero coherency coefficient is
`capacity-planning`'s aggregated-channel model instead.

## Open versus closed, and why a closed generator hides the queue

An open system has arrivals that do not depend on the system's state: a Poisson `lambda` keeps
arriving whether or not the queue is long, so `rho` can exceed 1 and the queue can grow without
bound. A closed system has `N` customers who each wait for their own response, think for `Z`,
and submit again. Its arrival rate is `lambda = N/(R + Z)` — it **falls** as `R` rises, which
is negative feedback the open model does not have.

Asymptotic bounds for a closed system with `c = 1` (Lazowska, Zahorjan, Graham & Sevcik,
_Quantitative System Performance_, 1984, ch. 5; Harchol-Balter ch. 2 and ch. 6–7):

```
X(N) <= min( 1/S,  N/(S + Z) )
R(N) >= max( S,    N·S - Z )
```

Consequences for measurement:

- A load test with `N` fixed virtual users and no pacing is closed. It cannot drive `rho`
  above `N·S/(N·S + Z)`, cannot show the `1/(1 - rho)` explosion, and reports a response time
  bounded by `N·S`. The production system it is meant to predict is open — users on the
  internet do not stop arriving because p99 rose — so the test understates production wait
  by construction. The queueing statement is here; the generator configuration
  (`constant-arrival-rate`, wrk2) is `load-testing` and the measurement distortion is
  `coordinated-omission`.
- A worker pool that only accepts new work when a worker is free (a `SynchronousQueue`, a
  consumer that polls after committing) is closed from its upstream's point of view. Its
  upstream's queue is the one growing; measure there.
- A closed system with `N <= c` never queues at all. Ten synchronous test clients against a
  20-thread pool measure service time only, at any request rate they can generate.

## Retries are arrivals

A retry is a new arrival that was not in `lambda`. With retry probability `p` per attempt and
no cap, the effective rate is `lambda/(1 - p)`; capped at three attempts it is
`lambda·(1 + p + p²)`. At `mu = 100/s`, `lambda = 70/s`:

| Retry share `p` | `lambda_eff` | `rho` | Mean `Wq` |
| --------------- | ------------ | ----- | --------- |
| 0               | 70/s         | 0.70  | 23 ms     |
| 0.10            | 78/s         | 0.78  | 35 ms     |
| 0.20            | 88/s         | 0.88  | 70 ms     |
| 0.30            | 100/s        | 1.00  | unstable  |

The feedback is positive: retries are triggered by timeouts, timeouts are triggered by queue
wait, and queue wait is highest exactly when the retries arrive. A model fed the client-side
`lambda` predicts 23 ms while the server sees 70 ms or a queue that never drains. Count
`lambda` at the server, including retries, and treat a rising retry share as a rising `rho`
that no capacity metric shows. Backoff, budgets and jitter are `retries-and-backoff`; here the
point is that they change `lambda` and `c_a` at once, since a synchronised retry wave is a
batch arrival.

## Bursts, the averaged utilisation, and how long a burst has to last

A model evaluated at the mean `rho` of a window is optimistic in proportion to how uneven the
window was, because `Wq` is convex in `rho`. A service at `rho = 0.4` for 90% of the time and
`rho = 0.95` for 10%:

```
rho_mean                 = 0.9·0.4 + 0.1·0.95 = 0.455   ->  M/M/1 predicts Wq = 0.84 S
time-weighted true Wq    = 0.9·0.67 + 0.1·19.0        =  2.5 S
arrival-weighted true Wq = (0.36·0.67 + 0.095·19.0)/0.455 = 4.5 S
```

The requests experience `4.5 S`, not `0.84 S` — a 5.4x miss — and the requests that arrive
during the busy 10% experience `19 S`. Fit the model per load regime and weight by arrivals,
or at minimum evaluate it at the p95 of `rho`, never at the mean.

The opposite correction applies when the burst is short. Steady-state formulas assume the
queue has had time to reach its long-run distribution; the M/M/1 relaxation time is on the
order of `S/(1 - sqrt(rho))²` (Morse, _Queues, Inventories and Maintenance_, 1958 — not
verified here): about `90 S` at `rho = 0.8`, `380 S` at `0.9`, `1560 S` at `0.95`. A
30-second burst at `rho = 0.95` with `S = 100 ms` is 300 service times — the queue is still
growing towards `19 S` when the burst ends, and the steady-state number overstates it. Below
the relaxation time, model the burst as accumulation: backlog `≈ (lambda - c·mu)·t` for
`rho > 1`, and the wait of the last request in it is `backlog/(c·mu)`.

## Autoscaling lag

An autoscaler is a feedback loop on `c` with a dead time — metric scrape, stabilisation
window, scheduling, image pull, JVM warm-up — of one to several minutes. During that time the
system is the old `c`. At `c·mu = 1000/s` with `lambda` stepping to `1300/s` and a 90 s lag:

```
backlog at the moment new capacity arrives = (1300 - 1000)·90 = 27,000 requests
drain time at the new 1500/s               = 27,000/(1500 - 1300)  = 135 s
wait of the last request queued            ≈ 27,000/1500          = 18 s
```

Three points follow. The p99 spike during a scale-up is not the model failing; it is the
model evaluated at the old `c` with `rho > 1`, and its size is the lag times the overshoot.
Scaling on mean CPU inherits the averaged-utilisation trap above — the busy 10% is invisible
to a 5-minute mean. And a bounded queue with rejection is the only configuration in which the
lag costs a known fraction of requests instead of an unbounded wait; the M/M/c/K numbers in
the formulas reference give that fraction. Warm-up and probe timing on the new pod are
`kubernetes-service-lifecycle`.

## Prediction disagrees with measurement

The 30% tolerance is a working rule, not a theorem: within it, the arithmetic and the
measurement agree closely enough that no assumption is worth chasing; beyond it, one of these
rows has failed. Read the direction first.

**Measured wait is larger than predicted** (the model is optimistic):

| Failed assumption                     | What to measure                                                                     | Then                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Service is not exponential, `c_s > 1` | `c_s` from raw samples; the modality of the service-time histogram                  | P-K or Allen–Cunneen with measured `c_s`; split pools  |
| Arrivals are correlated, `c_a > 1`    | `c_a` of inter-arrival times; retry share; cron and batch timestamps                | Kingman with measured `c_a`; bulk formula for batches  |
| `lambda` undercounted                 | Server-side arrivals including retries, health checks, internal fan-out             | Re-fit with the server's `lambda`                      |
| Effective `c` below nominal           | Thread states (`BLOCKED`, parked), `corePoolSize` versus queue type, pinned threads | Model with the effective `c`; fix the pool             |
| `rho` averaged over a bursty window   | `rho` at 1 s or 10 s resolution; its p95                                            | Fit per regime; weight by arrivals                     |
| Fleet is `c` queues, not one pool     | Load-balancer policy; per-pod queue depth variance                                  | Model each pod as M/M/1; change the routing            |
| A queue in series was left out        | Wait at the connection pool, the downstream, the event loop                         | Sum the `Wq` of each stage                             |
| Servers are not independent           | Throughput per pod versus pod count; the USL fit                                    | `universal-scalability-law`, then `capacity-planning`  |
| Head-of-line blocking                 | Per-item service-time distribution behind one FIFO                                  | M/G/1 with the slow item's variance; separate the lane |

**Measured wait is smaller than predicted** (the model is pessimistic):

| Failed assumption                              | What to measure                                                                 | Then                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `mu` measured under load                       | Service time at `rho < 0.3`, or the service component outside the queue         | Re-fit; the `mu` used was `1/W`, not `1/S`             |
| The generator is closed                        | Requests issued versus planned; whether `lambda` fell when `R` rose             | Open-loop generator; report the closed bounds instead  |
| Rejections or timeouts left the latency metric | Rejection and timeout counters next to the latency histogram                    | Model as M/M/c/K; count the losses as the missing tail |
| Arrivals are more regular than Poisson         | `c_a < 1` — paced clients, round-robin upstream, a rate limiter                 | Kingman with the measured `c_a`                        |
| `c` grew during the window                     | Autoscaler events; pool growth (`core < max` with a bounded queue)              | Model with `c(t)`; split the window at each change     |
| Kingman applied at low `rho`                   | `rho` itself; whether `c_a < 1`                                                 | Treat Kingman as an upper bound below `rho ≈ 0.5`      |
| The window was not steady state                | Queue depth trend over the window; the burst length against the relaxation time | Model as accumulation, or extend the window            |

A disagreement in **both** directions across endpoints or time windows almost always means
one `c_s` was fitted to a mixture: the slow class is under-predicted and the fast class
over-predicted by the same averaged parameter. Split the population before re-fitting.

## Which model when — decision criteria in one place

1. Is there a queue at all, or does the system reject? Reject: Erlang B (no slots) or
   M/M/c/K (bounded). Wait: continue.
2. Is the population fixed (a closed generator, a fixed worker set)? Closed bounds; do not
   use an open model to predict what it will show.
3. Is the fleet one pool or `c` queues? Load-balancer policy, partition keying, one queue per
   event loop. `c` queues: model one queue at its own `rho`.
4. `c_s`: below 0.5, M/D/1 or Allen–Cunneen with the measured value; near 1, M/M/c; above
   1.5, P-K or Allen–Cunneen for the mean and **no closed-form percentile** — measure it.
5. `c_a`: near 1 and no retries or batches, keep M/\*; otherwise Kingman or Allen–Cunneen
   with the measured `c_a`, or the bulk formula for fixed batches.
6. Is `rho` stable across the window? If not, per-regime fits, and the relaxation-time check
   before applying a steady-state number to a burst.
7. Is there a priority lane or a FIFO with mixed work? Cobham for the per-class means, and
   the conservation law to check the claimed improvement adds up.
8. Validate against one measured `Wq`; on a miss, the tables above, not a fudge factor.

The model is not applicable — stop and measure — when the service time depends on the queue
length (lock convoys, cache thrash under load, GC pressure that grows with in-flight requests:
`mu` is then a function of `L`), when arrivals are adversarial or synchronised to the system's
own state (thundering herds on a cache expiry), or when the "servers" share a resource that
saturates first (`c` threads on `c/4` cores are `c/4` servers with a scheduler in front).
