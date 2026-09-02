# Choosing the model, and the formulas for each

## Symbols, defined once

| Symbol    | Meaning                                                             | Units   |
| --------- | ------------------------------------------------------------------- | ------- |
| `lambda`  | Arrival rate, including retries and internal fan-out                | 1/time  |
| `mu`      | Service rate of **one** server; `S = 1/mu` is the mean service time | 1/time  |
| `c`       | Servers that make progress in parallel (the _effective_ count)      | count   |
| `rho`     | Per-server utilisation, `lambda/(c·mu)`; stability needs `rho < 1`  | —       |
| `a`       | Offered load in Erlangs, `lambda/mu = c·rho`                        | Erlangs |
| `c_a`     | Coefficient of variation of inter-arrival time, `std/mean`          | —       |
| `c_s`     | Coefficient of variation of service time, `std/mean`                | —       |
| `L`, `Lq` | Mean number in the system, in the queue                             | count   |
| `W`, `Wq` | Mean time in the system, in the queue; `W = Wq + S`                 | time    |
| `C(c,a)`  | Erlang C: probability an arrival must wait (M/M/c)                  | —       |
| `B(c,a)`  | Erlang B: probability an arrival is lost (M/M/c/c, no queue)        | —       |
| `K`       | System capacity, servers plus queue slots (M/M/c/K)                 | count   |

`L = lambda·W` and `Lq = lambda·Wq` throughout (Little's Law, owned by
`littles-law-and-queueing`). Every `Wq` below is a mean unless it says percentile.

## Selection table

| Arrivals                          | Service                   | Servers | Model         | Use it when                                     |
| --------------------------------- | ------------------------- | ------- | ------------- | ----------------------------------------------- |
| Independent (Poisson)             | Exponential, `c_s ≈ 1`    | 1       | M/M/1         | One server, memoryless service                  |
| Independent (Poisson)             | Exponential, `c_s ≈ 1`    | c       | M/M/c         | A pool with a shared queue and fixed `c`        |
| Independent (Poisson)             | Constant, `c_s ≈ 0`       | 1       | M/D/1         | Frame rendering, standardised batch items       |
| Independent (Poisson)             | Arbitrary, `c_s` measured | 1       | M/G/1         | Poisson traffic, non-exponential service        |
| Independent (Poisson)             | Arbitrary                 | c       | Allen–Cunneen | A pool with measured `c_s ≠ 1`                  |
| Correlated (retries, cron, batch) | Anything                  | 1       | G/G/1         | Kingman, with `c_a` measured — no M/\* applies  |
| Correlated                        | Anything                  | c       | Allen–Cunneen | Kingman's factor on top of Erlang C             |
| Poisson, no queue slots           | Exponential               | c       | M/M/c/c       | Erlang B: a bulkhead or pool that rejects       |
| Poisson, bounded queue            | Exponential               | c       | M/M/c/K       | Rejection rate versus wait for a bounded queue  |
| Finite population `N`             | Anything                  | c       | closed        | A closed load generator, a fixed set of workers |

Kendall notation is `A/S/c/K/N/D`: arrival distribution, service distribution, servers, queue
capacity (default infinite), population (default infinite), discipline (default FCFS). The
first three are the ones that change the answer; `K` decides whether the system rejects, and a
finite `N` changes the arrival process itself (see the production reference).

"M" means Markovian, meaning Poisson arrivals and memoryless exponential service. Memoryless
service is optimistic: in real systems a request that has already been running for 100 ms is
_more_ likely to be a heavy one, not equally likely. So M/\* models understate high percentiles
under heavy-tailed service unless Kingman is used with a measured `c_s`.

Sources for the closed forms: Kleinrock, _Queueing Systems_ vol. 1 (1975), ch. 3 (birth–death
models: M/M/1, M/M/c, M/M/1/K) and ch. 5 (M/G/1, Pollaczek–Khinchine); Gross & Harris,
_Fundamentals of Queueing Theory_, ch. 2–3; Harchol-Balter, _Performance Modeling and Design
of Computer Systems_ (2013), ch. 13–15 (M/M/1, M/M/k, server farms) and ch. 23 (M/G/1).

## M/M/1

Stability requires `rho = lambda/mu < 1`.

| Metric                | Formula                |
| --------------------- | ---------------------- |
| Utilisation           | `rho = lambda/mu`      |
| Mean number in system | `L  = rho/(1-rho)`     |
| Mean number in queue  | `Lq = rho²/(1-rho)`    |
| Mean time in system   | `W  = 1/(mu-lambda)`   |
| Mean time in queue    | `Wq = rho/(mu-lambda)` |

Expressed in units of service time, `Wq / S = rho/(1-rho)`:

```
rho = 0.50 ->  1x service time
rho = 0.80 ->  4x
rho = 0.90 ->  9x
rho = 0.95 -> 19x
rho = 0.99 -> 99x
```

## M/M/c

Per-server utilisation `rho = lambda/(c·mu)`. Offered load in Erlangs `a = lambda/mu = c·rho`.

```
Wq = C(c, a) / (c·mu - lambda)
W  = Wq + 1/mu
Lq = lambda · Wq        (Little's Law)
L  = lambda · W
```

Erlang C — the probability an arrival has to wait:

```
             (a^c / c!) · (c / (c - a))
C(c, a) = ---------------------------------------------
          sum(k=0..c-1) a^k/k!  +  (a^c / c!)·(c/(c-a))
```

Worked check — `c = 2`, `mu = 10/s`, `lambda = 16/s`, so `a = 1.6`, `rho = 0.8`:

```
k=0: 1        k=1: 1.6        sum(k=0..1) = 2.6
k=2: 1.6²/2! = 1.28
numerator   = 1.28 · 2/(2-1.6) = 6.4
C(2, 1.6)   = 6.4 / 9.0 = 0.7111
Wq          = 0.7111 / (20 - 16) = 0.1778 s = 177.8 ms
```

The single-server equivalent at the same rho and the same per-server mu (`mu = 10`,
`lambda = 8`) gives `Wq = 0.8/(10-8) = 400 ms`. Pooling two servers cut the wait to less than
half, not to half — pooling reduces the probability that _all_ servers are busy at once, which
is also why `C(c, a) <= rho` always, with equality only at `c = 1`.

### One pool of `c` versus `k` pools of `c/k`

Eight servers, `mu = 10/s` each, `rho = 0.8` throughout:

| Layout       | `C(c, a)` | Mean `Wq` |
| ------------ | --------- | --------- |
| 1 pool of 8  | 0.458     | 28.6 ms   |
| 2 pools of 4 | 0.596     | 74.6 ms   |
| 4 pools of 2 | 0.711     | 177.8 ms  |
| 8 pools of 1 | 0.800     | 400 ms    |

Splitting a pool of 8 into 8 queues of 1 costs 14x in mean wait at identical utilisation and
identical hardware. What splitting buys is isolation and ordering — a slow class cannot occupy
the shared servers, and a partition preserves FIFO — so the split is a trade, and the price
is this table. Which real systems are which is in `references/production-behaviour.md`.

### Large `c` moves the knee

The "70–80%" rule of thumb is an M/M/1 fact. With a shared queue, `Wq/S = C(c,a)/(c(1-rho))`
and both factors shrink with `c`:

| `c` | `rho = 0.8` `Wq/S` | `rho = 0.95` `Wq/S` |
| --- | ------------------ | ------------------- |
| 1   | 4.00               | 19.0                |
| 2   | 1.78               | 9.26                |
| 8   | 0.29               | 2.11                |
| 32  | 0.025              | 0.43                |
| 100 | 0.001              | 0.10                |

A 100-thread pool at 95% utilisation queues for a tenth of a service time; a single server at
95% queues for nineteen. The general form is square-root staffing (Halfin & Whitt, 1981;
Harchol-Balter ch. 15): `c = a + beta·sqrt(a)` holds the probability of waiting roughly
constant as `a` grows, so the tolerable utilisation `a/c` rises towards 1 with the pool size —
`beta = 1` gives `C ≈ 0.29` at `a = 4` (`rho = 0.67`) and `C ≈ 0.23` at `a = 1024`
(`rho = 0.97`). This is why a fleet-wide 70% CPU target wastes money on a 64-core box and
underprovisions a 2-thread pool.

## Erlang C via the Erlang B recursion (numerically stable)

The direct form as written overflows: `c!` exceeds a double at `c = 171`, and the running sum
of `a^k/k!` approaches `e^a`, which overflows once `a` passes about 700 even when each term is
built by the recurrence `term *= a/k`. Use Erlang B instead, which is bounded in `[0, 1]` at
every step:

```
B(0, a) = 1
B(n, a) = a·B(n-1, a) / (n + a·B(n-1, a))

C(c, a) = c·B(c, a) / (c - a·(1 - B(c, a)))
```

Cross-check for `c = 10, a = 8`: `B(10,8) = 0.12166`, so
`C = 1.2166 / (10 - 8·0.87834) = 1.2166 / 2.9733 = 0.4092` — the same value the direct sum
gives. Publish a number only after both methods agree in the range where both can run; past
`a ≈ 700` only the recursion runs (`c = 5000, a = 4900` gives `C = 0.0999` by recursion and
`NaN` by the term recurrence).

`B(c, a)` is a result in its own right: the blocking probability of M/M/c/c, the system with
`c` servers and **no** queue. It models a semaphore bulkhead that rejects on `tryAcquire()`, or
a pool whose acquisition timeout is zero. `B < C` always — rejecting is cheaper than queueing
for the ones who get in, at the price of the ones who do not.

## M/M/c/K — the bounded queue

`K` is the capacity of the whole system, servers plus queue slots (`K = c + queue`). For
`c = 1` (Kleinrock vol. 1, ch. 3; Gross & Harris ch. 2):

```
P(n)     = (1-rho)·rho^n / (1 - rho^(K+1)),   n = 0..K      (rho ≠ 1; valid for rho >= 1 too)
P(block) = P(K)
lambda_eff = lambda·(1 - P(K))
L        = sum(n=0..K) n·P(n)
W        = L / lambda_eff                                   (Little, on the admitted arrivals)
```

Worked, `rho = 0.95`, `K = 20`: `P(block) = 2.7%`, `L = 8.15`, `W = 8.8 S`, against `W = 20 S`
with an unbounded queue. The bounded queue trades 2.7% rejections for 2.3x lower residence
time for the admitted 97.3%, and — the property the unbounded model cannot offer — it is
stable at `rho >= 1`. That is the arithmetic behind "bound every queue"; the policy is
`littles-law-and-queueing`. Rejected work leaves the latency metric and enters the error
metric, so `W` measured on completions improves _because_ the system is shedding: read both.

## M/D/1

```
Wq(M/D/1) = rho / (2·mu·(1-rho)) = 0.5 · Wq(M/M/1)
```

Exactly half, at identical utilisation. Service variance is responsible for half of M/M/1's
queue latency.

## Kingman (G/G/1), Pollaczek-Khinchine (M/G/1) and Allen–Cunneen (G/G/c)

```
Wq(G/G/1) ≈ rho/(1-rho) · (c_a² + c_s²)/2 · 1/mu        (Kingman, 1961; also "VUT")

Wq(M/G/1)  = lambda·E[S²] / (2(1-rho))                   (Pollaczek-Khinchine, exact)
           = rho/(1-rho) · (1 + c_s²)/2 · 1/mu
Lq(M/G/1)  = rho²(1 + c_s²) / (2(1-rho))

Wq(G/G/c) ≈ C(c, a)/(c·mu - lambda) · (c_a² + c_s²)/2     (Allen–Cunneen approximation)
```

P-K has no `c_a` term because M/G/1 already assumes Poisson arrivals (`c_a = 1` baked in).
Setting `c_a = 1` in Kingman and converting `Wq` to `Lq` via Little's Law reproduces P-K
exactly — Kingman contains P-K as a special case. Allen–Cunneen is Kingman's variability
factor applied to the M/M/c wait; it reduces to Kingman at `c = 1` and to Erlang C at
`c_a = c_s = 1`, and it is the model for a thread pool whose service time is not exponential.
(Allen, _Probability, Statistics, and Queueing Theory_, 2nd ed., 1990, ch. 6 — chapter not
verified here.)

Sanity checks: `c_a = c_s = 1` reproduces M/M/1; `c_a = 1, c_s = 0` reproduces M/D/1.

Two limits of Kingman worth knowing before trusting it:

- It is a **heavy-traffic** result — asymptotically exact as `rho -> 1` and least accurate at
  low utilisation, where it can overstate the wait for `c_a < 1` (regular arrivals) by a wide
  margin. Refinements exist (Whitt, 1993, "Approximations for the GI/G/m queue" — not verified
  here); below `rho ≈ 0.5` treat Kingman as an upper bound rather than a prediction.
- It is a **mean**. Two service distributions with the same `c_s` can have very different
  `p99` waits: P-K fixes the mean queue through `E[S²]` alone, but the tail of `Wq` in M/G/1
  inherits the tail of the service distribution — heavy-tailed service (a Pareto-like slow
  path) gives a `Wq` tail that decays polynomially, not exponentially, and no `c_s` corrects an
  exponential-tail percentile formula into it (Harchol-Balter ch. 20 on heavy tails). For
  a percentile under non-exponential service, measure or simulate.

## What service variance costs

Multiplier on `Wq` relative to M/M/1 at the same rho, from `(1 + c_s²)/2`. Independent of rho:

| `c_s` | Multiplier | Interpretation              |
| ----- | ---------- | --------------------------- |
| 0.0   | 0.50x      | Deterministic (M/D/1)       |
| 0.5   | 0.625x     | Low variance                |
| 1.0   | 1.00x      | M/M/1 reference             |
| 1.5   | 1.625x     | High variance (sporadic GC) |
| 2.0   | 2.50x      | Very high (bimodal queries) |
| 3.0   | 5.00x      | Severe heavy tail           |

### Worked: the bimodal service time

99% of requests take 10 ms, 1% take 500 ms (a report path, a cold cache, a full GC):

```
E[S]  = 0.99·10 + 0.01·500       = 14.9 ms
E[S²] = 0.99·10² + 0.01·500²     = 2599 ms²
c_s   = sqrt(2599 - 14.9²)/14.9  = 3.27       -> multiplier (1 + c_s²)/2 = 5.85
```

| `lambda` | `rho` | `Wq` P-K (M/G/1) | M/M/1 on the same mean | M/M/1 on the fast path only |
| -------- | ----- | ---------------- | ---------------------- | --------------------------- |
| 20/s     | 0.30  | 37 ms            | 6.3 ms                 | 2.5 ms                      |
| 40/s     | 0.60  | 129 ms           | 22 ms                  | 6.7 ms                      |
| 60/s     | 0.89  | 736 ms           | 126 ms                 | 15 ms                       |

At 30% utilisation the mean queue wait is already 3.7x the fast path's own service time, and
an M/M/1 fitted to the averaged service time is optimistic by 5.85x at every load. The 1%
path sets the queue for the 99%; the remedy is a separate pool for it, which turns one M/G/1
with `c_s = 3.3` into two queues with `c_s ≈ 0` each. `littles-law-and-queueing` covers the
utilisation share of the slow path; this is its wait-time cost.

### Batch arrivals

A cron fan-out, a Kafka poll returning a full batch, or a scatter-gather that emits `b`
sub-requests at once is not Poisson at the request level even if the batches are. For
Poisson batches of constant size `b` with exponential service (M^[b]/M/1; Gross & Harris,
ch. 3, bulk input — section not verified here):

```
L  = rho·(b + 1) / (2(1-rho))          Wq = L/lambda - 1/mu
```

At `rho = 0.8`, `S = 1`: `b = 1` gives `Wq = 4`, `b = 4` gives `11.5`, `b = 10` gives `26.5`
(each reproduced by simulation to within 2%). The wait grows roughly as `(b + 1)/2` — the
average position inside one's own batch — before any queue from other batches. The
per-request `c_a` of a batched stream is not `1`, and it is not `sqrt(b)` either; Kingman with
`c_a² = b` under-predicts these by about 15%, so use the bulk formula for constant batches and
measure `c_a` directly for variable ones.

## Priority and head-of-line blocking

Two classes, non-preemptive, one server, Poisson arrivals (Cobham, 1954; Kleinrock vol. 2,
ch. 3), with `rho_1` the high-priority load, `rho = rho_1 + rho_2`:

```
W0    = sum_i lambda_i·E[S_i²] / 2            mean residual work found by an arrival
                                              (= rho/mu when service is exponential)
Wq_1  = W0 / (1 - rho_1)
Wq_2  = W0 / ((1 - rho_1)(1 - rho))
```

Worked, `S = 1`, `rho_1 = 0.2`, `rho_2 = 0.6`: `Wq_1 = 1.0`, `Wq_2 = 5.0`, against `4.0` for
FCFS at the same total load. Priority moves wait, it does not remove it: the conservation law
`sum_i rho_i·Wq_i = rho·Wq_FCFS` holds for any work-conserving non-preemptive discipline
(`0.2·1.0 + 0.6·5.0 = 3.2 = 0.8·4.0`). A priority lane is therefore a decision about _who_
waits, and the low class's `1/(1 - rho)` denominator means it starves first as load rises.

Head-of-line blocking is the FCFS case with heterogeneous work in one FIFO: a single slow item
holds every item behind it, and the queue behaves as M/G/1 with the slow item's variance —
the bimodal table above — rather than as the fast path's M/M/1. A Kafka partition, a
single-threaded event loop and a `SynchronousQueue` hand-off are all one FIFO of this kind.
The fix is either a separate lane (priority) or a separate pool (isolation), and each pays the
price its table shows.

## Wait-time percentiles, in closed form

For M/M/c (and M/M/1 as the case `c = 1`, where `a = rho` and `C(1, rho) = rho`):

```
P(Wq = 0)    = 1 - C(c, a)
P(Wq <= t)   = 1 - C(c, a)·exp(-c·mu·(1-rho)·t),      t >= 0
t_p          = -ln((1-p) / C(c, a)) / (c·mu·(1-rho))   for p >= 1 - C(c, a); otherwise 0
```

Worked, M/M/1 at rho = 0.9, mu = 50/s, so `C = 0.9` and `mu(1-rho) = 0.005/ms`:

```
p50 = -ln(0.50/0.9)/0.005 ≈ 117.6 ms
p95 = -ln(0.05/0.9)/0.005 ≈ 578.1 ms
p99 = -ln(0.01/0.9)/0.005 ≈ 900.0 ms
mean Wq                    = 180 ms
```

The p50 sits **below** the mean. The distribution is a mixture of a point mass at zero (the
arrivals that found the system free) and an exponential tail, which is exactly the shape that
makes a mean useless against a p99 SLO.

Worked, M/M/8 at rho = 0.8, mu = 10/s (`a = 6.4`, `C = 0.458`, `c·mu·(1-rho) = 16/s`):

```
P(Wq = 0) = 0.542   ->   p50 = 0 ms       (more than half the arrivals never queue)
p95 = -ln(0.05/0.458)/16 ≈ 138 ms
p99 = -ln(0.01/0.458)/16 ≈ 239 ms
mean Wq                   = 28.6 ms
```

Whenever `C(c, a) < 0.5` the median queue wait is exactly zero while the p99 is not. A pooled
system's dashboard median says nothing about its tail; this is a property of the model, not a
measurement artefact.

Exponential service is the only service distribution here with such a simple closed form.
M/D/1 and bimodal distributions have none — measure their percentiles empirically.
