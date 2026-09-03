# Model selection and formula contracts

## Symbols and boundaries

| Symbol          | Meaning                                                          | Units         |
| --------------- | ---------------------------------------------------------------- | ------------- |
| `λ`             | offered arrival rate at the selected boundary                    | 1/time        |
| `λ_eff` / `X`   | admitted/departure throughput for the selected cohort            | 1/time        |
| `S`, `μ=1/E[S]` | one service position's service time/rate under the model         | time, 1/time  |
| `c`             | simultaneous statistically equivalent service positions          | count         |
| `a=λ/μ`         | offered load                                                     | Erlangs       |
| `ρ=λ/(cμ)`      | offered utilisation per position for infinite-buffer open models | dimensionless |
| `C_a`, `C_s`    | coefficient of variation of inter-arrival/service time           | dimensionless |
| `K`             | maximum customers in service plus queue                          | count         |
| `L`, `L_q`      | mean population in system/queue                                  | count         |
| `W`, `W_q`      | mean residence/queue wait for the relevant admitted cohort       | time          |

Little's `L=XW` is owned by `littles-law-and-queueing`. For a loss/finite system use effective
admitted throughput and the same admitted cohort; offered `λ` does not pass through unchanged.

Kendall's extended notation is `A/S/c/K/N/D`: arrival process, service distribution, servers,
system capacity, source population and discipline. Add abandonment/patience, priorities, vacations,
blocking and class/routing rules explicitly; hiding them behind `G` does not make them irrelevant.

## Selection table

| Evidence and decision                                           | Candidate                       | What it can supply                               | Reject it when                                                                         |
| --------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| stationary Poisson arrivals, exponential service, one server    | M/M/1                           | exact mean and response/wait distributions       | rate/service depends on state, finite queue or non-exponential tail matters            |
| same, `c` equivalent servers behind one FCFS queue              | M/M/c                           | Erlang-C wait probability, mean and wait tail    | per-server queues, affinity, unequal servers, abandonment                              |
| Poisson arrivals, general IID service, one FCFS server          | M/G/1                           | exact mean via P–K                               | service correlated/state-dependent, multiple servers, tail required from moments alone |
| Poisson plus deterministic service, one server                  | M/D/1                           | exact mean as M/G/1 special case                 | “low CV” is only approximate determinism                                               |
| renewal arrivals and general service, one server, heavy traffic | GI/G/1 Kingman                  | approximate mean                                 | nonrenewal/batched/state-dependent arrivals or low-load accuracy needed                |
| general arrivals/service, multiple shared servers               | Allen–Cunneen family            | heuristic mean                                   | no validation data; heterogeneous/routed servers or tail/loss decision                 |
| exponential open loss system, no waiting slots                  | M/M/c/c                         | Erlang-B blocking and carried load               | callers wait, retry feedback, non-Poisson bursts                                       |
| exponential open finite system                                  | M/M/c/K                         | stationary occupancy, blocking and admitted mean | abandonment or state-dependent admission/service not represented                       |
| finite users with think time                                    | closed queueing network/MVA     | throughput/residence by population               | arrivals are exogenous or sessions arrive independently                                |
| transient burst/autoscaling/failover                            | fluid/CTMC/transient simulation | time-varying backlog/loss                        | stationary formula is being used merely because it is simpler                          |

`C_s≈1` does not imply exponential service: many distributions share a coefficient of variation.
Likewise `C_a≈1` does not imply Poisson arrivals. Test distribution/independence/stationarity at the
timescale relevant to the queue.

## M/M/1

For `ρ=λ/μ<1`:

```text
L  = ρ/(1−ρ)             Lq = ρ²/(1−ρ)
W  = 1/(μ−λ)             Wq = ρ/(μ−λ)
```

Stationary total response `W` is exponential with rate `μ−λ`:

```text
P(W > t) = exp(−(μ−λ)t)
Q_W(p)   = −ln(1−p)/(μ−λ)
```

Queue wait has a point mass `1−ρ` at zero and, conditional on waiting, the same exponential rate:

```text
P(Wq > t) = ρ exp(−(μ−λ)t), t ≥ 0
```

These tail formulas do **not** survive arbitrary service distributions with the same mean/CV.

## M/M/c and Erlang C

For `a=λ/μ`, `ρ=a/c<1`, one shared FCFS queue and equivalent servers:

```text
P(wait) = C(c,a)
Wq      = C(c,a)/(cμ−λ)
W       = Wq + 1/μ
P(Wq>t) = C(c,a) exp(−(cμ−λ)t)
```

Therefore the unconditional p-quantile of queue wait is zero when `p≤1−C`; otherwise:

```text
Q_Wq(p) = −ln((1−p)/C)/(cμ−λ)
```

This is queue wait, not total response. Total response combines waiting and service and must not be
reported using this quantile formula.

Direct Erlang C:

```text
                  (a^c/c!) (c/(c−a))
C(c,a) = -------------------------------------------------
         Σ(k=0..c−1) a^k/k! + (a^c/c!) (c/(c−a))
```

Avoid factorial/power overflow. Compute Erlang B recursively in bounded probability space:

```text
B(0,a)=1
B(n,a)=aB(n−1,a)/(n+aB(n−1,a))
C(c,a)=B(c,a)/(1−ρ+ρB(c,a))
```

Reject invalid inputs (`c≤0`, `a<0`, or Erlang-C `ρ≥1`), use sufficient numeric precision near
critical load, and cross-check small cases against a direct/log-domain implementation. Property
tests should cover `0≤B,C≤1`, monotonicity in load, and `c=1` reductions.

## Pooling versus routed queues

An M/M/c shared queue can dispatch the next job to any free server. `c` independent M/M/1 queues
cannot, so imbalance raises wait under otherwise matching assumptions. The benefit is not a
universal multiple of `c` and depends on load and routing. Splitting may be required for affinity,
ordering, blast-radius isolation or heterogeneous classes; compare per-class loss/tail, not just
aggregate mean.

Round-robin Poisson splitting can produce Erlang inter-arrivals per destination only in an ideal
single dispatcher without stickiness, retries, health changes or multiple upstreams. Random
splitting preserves Poisson only under the thinning assumptions. Least-loaded routing is not
literally a shared queue because state is delayed and work cannot migrate after assignment.

## M/G/1, M/D/1 and variability

For stationary Poisson arrivals, IID service with finite second moment, one FCFS server and
`ρ=λE[S]<1`, Pollaczek–Khinchine gives:

```text
E[Wq] = λE[S²]/(2(1−ρ))
      = ρ(1+C_s²)E[S]/(2(1−ρ))
```

At fixed mean and utilisation this is `(1+C_s²)/2` times M/M/1 mean queue wait. M/D/1
(`C_s=0`) is exactly half. This relationship concerns the **mean** in M/G/1; splitting classes,
timeouts or GC changes more than `C_s` and must be reparameterised at the new boundary. If
`E[S²]` is infinite, the stationary mean wait is infinite even while `ρ<1`.

P–K does not determine the wait CDF from two moments. Use numerical transforms, discrete-event
simulation, or empirical measurement for tail decisions and validate sensitivity to censored slow
service.

## Kingman and Allen–Cunneen

For a GI/G/1 renewal queue in heavy traffic, Kingman's approximation is:

```text
E[Wq] ≈ [ρ/(1−ρ)] [(C_a²+C_s²)/2] E[S]
```

When arrivals are Poisson (`C_a=1`), the expression matches P–K's exact mean. That does not make
Kingman exact for arbitrary arrival processes with `C_a=1`; autocorrelation and higher-order/batch
structure remain invisible.

A commonly used Allen–Cunneen-style G/G/c approximation scales the M/M/c mean wait by
`(C_a²+C_s²)/2`. Published variants and correction factors differ. Pin the formula/source used,
validate it on held-out load points, and never use it as a closed-form tail distribution.

Kingman is asymptotically motivated near heavy traffic; at lower load it may err in either
direction. It is not a guaranteed upper bound.

## Loss and finite-capacity systems

For M/M/c/c, Erlang B gives offered-call blocking probability `B(c,a)`. Carried throughput is
`λ_eff=λ(1−B)`. Retries break the exogenous Poisson assumption unless included in a fixed-point or
simulation model.

For M/M/c/K, construct the birth–death stationary probabilities rather than reusing Erlang C:

```text
birth rate λ_n = λ for n<K, 0 at n=K
death rate μ_n = min(n,c)μ
p_n = p_0 ∏(i=1..n) λ_(i−1)/μ_i, then normalise Σp_n=1
P_block = p_K
λ_eff = λ(1−p_K)
L = Σ n p_n
W = L/λ_eff
```

Finite state makes a stationary distribution possible even when offered `λ≥cμ`, but high load is
paid as blocking/loss. Completion-latency improvement while loss rises is not an SLO win.
Abandonment/deadlines require Erlang-A or another patience model; treating timed-out waiters as
instant blocking changes occupancy and retry traffic.

## Classes, batches, priorities and networks

- Batch arrivals need batch-size distribution and within-batch order; `C_a` alone is insufficient.
- Non-preemptive priority formulas require Poisson classes, IID services, one server and a
  work-conserving discipline. Validate conservation and per-class starvation; do not generalise a
  two-class formula to executor priorities without checking cancellation/aging.
- Sequential stage **means** add for the same cohort, but tail quantiles do not. Blocking-before-
  service, finite buffers and synchronous calls couple nodes, so product-form/open-network results
  may not apply.
- Closed networks should use population and think time with mean value analysis or simulation.
  They can saturate a bottleneck (`U→1`) but cannot sustain offered throughput above it; response
  time grows as population waits inside the network.

## Decide analytical model versus simulation

Prefer discrete-event simulation or direct measurement when service/routing changes with queue
length, arrivals synchronize with system state, queues have complex priorities/abandonment,
servers share a hidden bottleneck, or the decision is a tail under non-Markovian inputs. Validate a
simulator with conservation laws, deterministic/simple analytical cases, seeded repetitions and
held-out production observations. A more detailed model is not better unless its parameters are
observable and its predictions falsifiable.

## Sources

- John D. C. Little, [“A Proof for the Queuing Formula: L = λW”](https://doi.org/10.1287/opre.9.3.383)
- Harchol-Balter, [_Performance Modeling and Design of Computer Systems_](https://www.cs.cmu.edu/~harchol/PerformanceModeling/book.html)
- Denning and Buzen, [“The Operational Analysis of Queueing Network Models”](https://www.columbia.edu/~ww2040/8100S12/DenningBuzen1978.pdf)
- Halfin and Whitt, [“Heavy-Traffic Limits for Queues with Many Exponential Servers”](https://doi.org/10.1287/opre.29.3.567)
- Whitt, [“Approximations for the GI/G/m Queue”](https://doi.org/10.1080/15326349308807207)
