# Sizing arithmetic

## The two conditions

A candidate instance count `N` is a valid answer only if both hold, and only if `N` is at
or below the peak `N_max`.

```
Condition 1 — throughput:
    X(N) * utilization_cap >= target_rps

Condition 2 — latency:
    predicted_p99_ms(N, target_rps) <= slo_p99_ms
```

`X(N)` is the throughput the scalability model predicts for `N` instances. The utilisation
cap is an operational ceiling above which you do not run regardless of what the latency
arithmetic permits — 0.70 for synchronous services is the usual default.

An `N` that satisfies both conditions only beyond `N_max` is not a valid answer. It
contradicts the fit that produced it.

## N_max, and the direction people get wrong

```
N_max = sqrt((1 - sigma) / kappa)
```

| kappa | N_max (sigma = 0) |
| ----- | ----------------- |
| 0.001 | 31.6              |
| 0.005 | 14.1              |
| 0.010 | 10.0              |
| 0.020 | 7.1               |
| 0.050 | 4.5               |
| 0.100 | 3.2               |

Coherency sits in the denominator, so `N_max` falls as coherency rises. The intuition
"more coordination is worse" is right; the numerical direction of "worse" is a _smaller_
`N_max`, and that only becomes obvious by looking at the formula rather than recalling it.

Worked check: `sigma = 0.05`, `kappa = 0.02` gives `sqrt(0.95 / 0.02) = 6.9` — below 10,
not in some "10 to 30" band.

## Predicting p99 for a fleet

Erlang C with `c` equal to the instance count is wrong whenever coherency is non-zero,
because M/M/c's benefit comes precisely from assuming the servers are independent — the
assumption coherency denies. Instead, treat the whole fleet as one aggregated M/M/1
channel whose service rate is the throughput ceiling the scalability model already
predicts for that `N`, with the coherency effect baked in:

```
rho  = target_rps / X(N)
t_99 = -ln(0.01 / rho) / (X(N) * (1 - rho))       # seconds of queueing at p99

predicted_p99_ms = p99_at_1_instance_ms + t_99 * 1000
```

Two properties worth stating in any review of this arithmetic:

- The percentile of a sum is not generally the sum of the percentiles. This composition is
  a conservative approximation — it tends to overestimate the real p99 slightly, which is
  the safe side for a provisioning decision.
- If `target_rps >= X(N)`, the system is unstable at that `N` and the predicted p99 is
  infinite. Return that, do not clamp it.

The right layer for literal Erlang C is _inside_ one instance: how many threads or
connections that instance needs for its local SLO, given its per-thread service rate.
Threads sharing one scheduler are far closer to the independence assumption than whole
instances coordinating over a network. "How many threads per pod" and "how many pods" are
two different sizing decisions with two different tools.

## Three outcomes, same coefficients

`sigma = 0.03`, `kappa = 0.002` (so `N_max = sqrt(0.97/0.002) ≈ 22.0`), 4,000 req/s per
instance, `p99_at_1_instance_ms = 15`, `target_rps = 20,000`, cap 0.70.

| N   | X(N) req/s | X(N) x 0.70 | rho at 20,000 |
| --- | ---------- | ----------- | ------------- |
| 10  | 27,586     | 19,310      | 0.725         |
| 11  | 28,947     | 20,263      | 0.691         |
| 12  | 30,112     | 21,079      | 0.664         |
| 13  | 31,100     | 21,770      | 0.643         |
| 14  | 31,927     | 22,349      | 0.626         |

**A — loose SLO (80 ms).** The smallest N meeting Condition 1 is 11 (20,263 >= 20,000).
At rho = 0.691, `t_99 = -ln(0.01/0.691) / (28,947 * 0.309) ≈ 0.47 ms`, so predicted p99 is
about 15.5 ms — far inside 80 ms. **Throughput governs**; the SLO never binds.

**B — tight SLO (15.4 ms, i.e. 0.4 ms of queueing budget).** N = 11 already fails: 0.47 ms
of queueing exceeds the 0.4 ms budget even though Condition 1 passes. At N = 13,
rho = 0.643 and `t_99 = -ln(0.01/0.643) / (31,100 * 0.357) ≈ 0.375 ms`, which fits. The
answer is **13, not 11** — **the SLO governs**, costing two instances above the throughput
minimum.

**C — impossible SLO (15.2 ms, 0.2 ms of budget).** Even near `N_max ≈ 22`, where `X(N)`
peaks and rho is at its minimum for this target, `t_99 ≈ 0.281 ms` still exceeds the
budget. Since `X(N)` decreases past `N_max`, no valid `N` exists. The planner must raise an
explicit "no N satisfies both" error. The correct action is an architectural change that
reduces contention and coherency, or a renegotiated SLO — not more instances.

The three scenarios use identical coefficients and differ only in the SLO. That is the
whole point: throughput and latency are independent constraints, and a planner that checks
only throughput gets scenario A right by luck and scenarios B and C wrong in silence.

## Sanity gates a planner must implement

Raise an explicit error — never return a number — when:

- the fitted model predicts a peak throughput _below_ a value already measured in the input
  data (the fit is invalid; do not use those coefficients);
- the search finds a solution at `N > N_max` (regressive region);
- no `N` in the valid range satisfies both throughput and SLO;
- the upstream scalability fit already failed its own sanity gate.

A calculator that accepts any result as valid will happily report `N = 28` when the real
peak is at 17.9.

## Review checklist

- Fit quality above 0.95 and the peak-prediction gate passed.
- `N_max` computed and compared against the shape of the raw data.
- `slo_p99_ms` and `p99_at_1_instance_ms` are measured values, not placeholders.
- The returned `N` is at or below `N_max` — check the log, not just the return value.
- The utilisation cap matches the service's load profile rather than a copied default.
- The hourly cost per instance was passed explicitly at the call site.
