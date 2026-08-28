# Reading sigma and kappa as an action

## Decision matrix

| sigma  | kappa   | Diagnosis              | Immediate action                | Strategic action                     |
| ------ | ------- | ---------------------- | ------------------------------- | ------------------------------------ |
| < 0.05 | < 0.005 | Well designed          | Keep scaling                    | Watch kappa as N grows               |
| > 0.10 | < 0.005 | Serialisation dominant | Find the lock or the serial I/O | Lock striping, lock-free, async I/O  |
| < 0.05 | > 0.010 | Coordination dominant  | Reduce shared state             | Share-nothing, sharding, local cache |
| > 0.10 | > 0.010 | Systemic — both        | **Stop scaling out**            | Architectural redesign               |

The two failure modes are opposites, and mistaking one for the other is expensive in both
directions. Reading a coherency problem as contention leads to "add more pods", which makes
the system measurably worse and looks like an incident. Reading a contention problem as
coherency leads to a shared-state refactor that buys almost nothing while the serial section
still caps the speedup at `1/sigma`.

## sigma — which Java mechanism produced it

| Mechanism                       | Magnitude                                     |
| ------------------------------- | --------------------------------------------- |
| `synchronized` on a hot path    | `sigma ≈ lock_hold_time / total_time`         |
| Undersized connection pool      | `sigma ≈ (N_threads - pool_size) / N_threads` |
| Blocking I/O on a single thread | `sigma ≈ io_time / total_time`                |
| Stop-the-world GC               | `sigma_GC ≈ total_pause_ms / elapsed_ms`      |

These are additive contributions to the same coefficient, which is why the per-point
instrumentation (GC pauses, pool utilisation, CPU) matters: it attributes the sigma you fitted
to a named cause instead of leaving it as a number.

## kappa — which Java mechanism produced it

- **False sharing on cache lines** — grows with the number of thread pairs writing to
  neighbouring fields.
- **Shared state in Redis or the database consulted on every request** — grows with
  `N x latency_of_the_shared_resource`.
- **Gossip and heartbeat protocols** — grow with the number of node pairs exchanging state.

All three are per-pair costs, which is why kappa multiplies `N(N-1)`. (Those are _ordered_
pairs; the factor of two versus `N(N-1)/2` is absorbed by the coefficient during calibration,
which is part of why kappa is a small number even when the per-pair cost is not.)

## Which one to attack first

Do not rank by the size of the coefficient — the coefficients are on different scales. Rank by
the size of the **denominator term at the N you actually operate at**:

```
contention term = sigma * (N - 1)
coherency term  = kappa * N * (N - 1)
```

Worked example — sigma = 0.15, kappa = 0.001, operating at N = 20:

```
contention: 0.15 * 19        = 2.85
coherency:  0.001 * 20 * 19  = 0.38      -> contention dominates by ~7.5x
N_max = sqrt(0.85 / 0.001)   ≈ 29.2      -> the regression is still ahead, not here
```

Attack sigma. Optimising kappa in this regime produces a change too small to measure. The
general rule: while `sigma >> kappa * N` over your operating range, contention is the target;
kappa only takes over as N approaches `N_max`.

## What moving kappa buys

`N_max = sqrt((1 - sigma) / kappa)`, so the payoff is square-root shaped:

```
sigma = 0.05, kappa = 0.010  ->  N_max = 9.7    (running 20 threads = already regressing)
sigma = 0.05, kappa = 0.001  ->  N_max = 30.8   (10x less coordination, 3.2x more headroom)
```

A 10x reduction in coordination cost buys ~3.2x in units. If the target N is 100x the current
`N_max`, the model is telling you the architecture has to change, not the coefficient.
