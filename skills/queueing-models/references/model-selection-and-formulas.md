# Choosing the model, and the formulas for each

## Selection table

| Arrivals                          | Service                   | Model | Use it when                                   |
| --------------------------------- | ------------------------- | ----- | --------------------------------------------- |
| Independent (Poisson)             | Exponential, `c_s ≈ 1`    | M/M/1 | One server, memoryless service                |
| Independent (Poisson)             | Exponential, `c_s ≈ 1`    | M/M/c | A pool with a shared queue and fixed `c`      |
| Independent (Poisson)             | Constant, `c_s ≈ 0`       | M/D/1 | Frame rendering, standardised batch items     |
| Independent (Poisson)             | Arbitrary, `c_s` measured | M/G/1 | Poisson traffic, non-exponential service      |
| Correlated (retries, cron, batch) | Anything                  | G/G/1 | Kingman, with `c_a` measured — no M/* applies |

Kendall notation is `A/S/c/K/N/D`: arrival distribution, service distribution, servers, queue
capacity (default infinite), population (default infinite), discipline (default FCFS). The
first three are the ones that change the answer.

"M" means Markovian, meaning Poisson arrivals and memoryless exponential service. Memoryless
service is optimistic: in real systems a request that has already been running for 100 ms is
_more_ likely to be a heavy one, not equally likely. So M/* models understate high percentiles
under heavy-tailed service unless Kingman is used with a measured `c_s`.

## M/M/1

Stability requires `rho = lambda/mu < 1`.

| Metric                | Formula                |
| --------------------- | ---------------------- |
| Utilisation           | `rho = lambda/mu`      |
| Mean number in system | `L  = rho/(1-rho)`     |
| Mean number in queue  | `Lq = rho²/(1-rho)`    |
| Mean time in system   | `W  = 1/(mu-lambda)`   |
| Mean time in queue    | `Wq = rho/(mu-lambda)` |

Expressed in units of service time, `Wq / (1/mu) = rho/(1-rho)`:

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
is also why `C(c, rho) <= rho` always.

## Erlang C via the Erlang B recursion (numerically stable)

The direct sum overflows for large `c`, because `a^c` and `c!` both explode. Use:

```
B(0, a) = 1
B(n, a) = a·B(n-1, a) / (n + a·B(n-1, a))

C(c, a) = c·B(c, a) / (c - a·(1 - B(c, a)))
```

Cross-check for `c = 10, a = 8`: `B(10,8) ≈ 0.12168`, so
`C = 1.2168 / (10 - 8·0.87832) = 1.2168 / 2.9734 ≈ 0.4092` — the same value the direct sum
gives. Publish a number only after both methods agree.

A term-by-term recurrence achieves the same in the direct form, accumulating
`term *= a/k` instead of computing `a^k / k!` separately.

## M/D/1

```
Wq(M/D/1) = rho / (2·mu·(1-rho)) = 0.5 · Wq(M/M/1)
```

Exactly half, at identical utilisation. Service variance is responsible for half of M/M/1's
queue latency.

## Kingman (G/G/1) and Pollaczek-Khinchine (M/G/1)

```
Wq(G/G/1) ≈ rho/(1-rho) · (c_a² + c_s²)/2 · 1/mu        (Kingman, 1961; also "VUT")

Lq(M/G/1)  = rho²(1 + c_s²) / (2(1-rho))                (Pollaczek-Khinchine)
```

P-K has no `c_a` term because M/G/1 already assumes Poisson arrivals (`c_a = 1` baked in).
Setting `c_a = 1` in Kingman and converting `Wq` to `Lq` via Little's Law reproduces P-K
exactly — Kingman contains P-K as a special case.

Sanity checks: `c_a = c_s = 1` reproduces M/M/1; `c_a = 1, c_s = 0` reproduces M/D/1.

## What service variance costs

Multiplier on `Wq` relative to M/M/1 at the same rho, from `(1 + c_s²)/2`. Independent of rho:

| `c_s` | Multiplier | Interpretation              |
| ----- | ---------- | --------------------------- |
| 0.0   | 0.50x      | Deterministic (M/D/1)       |
| 0.5   | 0.62x      | Low variance                |
| 1.0   | 1.00x      | M/M/1 reference             |
| 1.5   | 1.62x      | High variance (sporadic GC) |
| 2.0   | 2.50x      | Very high (bimodal queries) |
| 3.0   | 5.00x      | Severe heavy tail           |

## Wait-time percentiles, in closed form

For M/M/c (and M/M/1 as the case `c = 1`, where `C(1, rho) = rho`):

```
P(Wq = 0)    = 1 - C(c, rho)
P(Wq <= t)   = 1 - C(c, rho)·exp(-c·mu·(1-rho)·t),      t >= 0
t_p          = -ln((1-p) / C(c, rho)) / (c·mu·(1-rho)), valid for p >= 1 - C(c, rho)
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

Exponential service is the only service distribution here with such a simple closed form.
M/D/1 and bimodal distributions have none — measure their percentiles empirically.
