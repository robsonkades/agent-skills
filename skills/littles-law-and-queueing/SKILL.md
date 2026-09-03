---
name: littles-law-and-queueing
description: >
  Conservation checks from Little's Law (`L = λW`) and queueing decisions: measurement
  boundaries, service demand versus residence time, utilisation curves, thread pool and
  executor sizing, bounded queues and rejection policy. Use when choosing a pool size, when
  latency is high while CPU is low, when latency grows over the duration of a run, when
  someone proposes adding threads to a CPU-bound path, or when a ThreadPoolExecutor is not
  growing past its core size. Does not cover the statistics of the latency numbers
  themselves (latency-statistics), database pool specifics (connection-pool-sizing), or
  virtual-thread mechanics (thread-sizing-and-virtual-threads). Model selection and fitting
  is queueing-models, the scalability model is universal-scalability-law, and forecasting is
  capacity-planning.
---

# Little's Law and Queueing

## Purpose

Turn throughput, residence time and work-in-system into a boundary-consistent conservation check.
For a stable long-run population, `L = λW`: average work in the chosen system equals its effective
throughput times average residence time. It is distribution-insensitive, but boundaries still
matter. Failure to reconcile can mean mismatched cohorts/clocks, censored outcomes, transient
inventory or measurement error; the identity does not choose a pool size or predict a percentile.

The failure this prevents is capacity reasoning by intuition — adding threads to a
saturated CPU, sizing a database pool from the number of request threads, or reading 90%
utilisation as "10% of headroom left".

## Workflow

1. **Draw the boundary.** Define admission and departure events, population/outcomes, time window
   and whether `L` includes queued plus executing work. Use effective departure flow (including
   whichever terminal outcomes the cohort defines) for `λ` and mean residence `W` for that cohort.
2. **Classify state.** In steady operation, reconcile long-run averages. During ramp, drain or
   overload, report inventory change and finite-window edge effects; do not force a stationary
   formula onto a growing queue.
3. **Separate demands.** For resource `k`, measure visits `V_k`, service demand `D_k` (resource
   time per completed transaction), residence `R_k = Q_k + S_k`, queue length and saturation.
   Wall time, CPU demand and downstream occupancy are different quantities.
4. **Choose a queueing model only if its assumptions resemble evidence.** M/M/1 is a sensitivity
   baseline, not an 80% law. Arrival/service variability, server count, scheduling, finite buffers,
   blocking, priorities and backpressure change the curve (`queueing-models`).
5. **Separate concurrency demand from capacity.** `L=λW` predicts average in-flight work at a
   measured operating point. Capacity requires per-resource demand (`U_k=X D_k`), server/quota
   limits and an SLO model. Configured worker count is neither measured `L` nor utilisation.
6. **Design admission, queue bound and overload outcome together.** Bound waiting by time and/or
   count, reserve downstream capacity, choose rejection/cancellation semantics, and validate under
   burst, sustained overload, shutdown and recovery.

## Rules

- For a CPU resource, compute demand per completion and `U=X D / m` for `m` equivalent capacity
  units; then measure scaling across worker counts. “Threads≈CPUs” is a starting experiment for
  continuously runnable homogeneous work, not an optimum across SMT, NUMA, quotas, GC/JIT and
  memory bandwidth.
- For a downstream pool, use `L_k = λ_k R_k`, including visit multiplicity and hold time at that
  boundary. Do not multiply configured request threads by a residence-time ratio: configured
  capacity is not average system population.
- In stationary M/M/1, mean response is `S/(1−ρ)`; at `.9` it is `10S`. Raising arrival rate by
  10% from there moves `ρ` to `.99` and mean response to `100S`—a 10× latency increase under this
  idealised model, not a universal production cliff.
- There is no universal healthy utilisation band. Choose headroom from SLO, burst/error model,
  service-time variability, failover capacity, autoscaling delay and cost; validate the knee.
- Unbounded queues can absorb finite bursts safely, but sustained arrival above departure permits
  unbounded delay/memory growth. Prefer an explicit bound unless a proved external bound and
  failure policy make the risk acceptable.
- After reaching `corePoolSize`, `ThreadPoolExecutor` offers to its queue before growing toward
  `maximumPoolSize`. With an unbounded queue, normal submission therefore does not trigger
  non-core growth and the maximum is ineffective.
- `CallerRunsPolicy` creates synchronous feedback by executing on the submitter; it does not wait
  for queue capacity. Test submitter-role safety, reentrancy, ordering relative to queued work and
  event-loop/acceptor blockage. Rejection status and retry semantics depend on the protocol and
  whether the condition is rate limiting (`429`) or temporary capacity loss (`503`).
- Little's relation can sanity-check object counts/bytes only with consistent units and lifetime-
  weighted cohorts; it is not a GC sizing formula. Allocation, reachability and live-set ownership
  belong to `gc-fundamentals` and `object-layout-and-footprint`.

## Required decision artifact

```text
Boundary/cohort: arrival, admission, departure; queued/running; terminal outcomes
State/window:    stable / ramp / overload / drain; inventory at start and end
Measurements:    λ or X, mean L, mean W; reconcile residual and uncertainty
Resources:       visits, demand, utilisation, queue wait, servers/quotas
Model:           M/M/1, M/G/1, M/M/c, finite/closed/network; assumptions checked
Options:         service reduction, capacity, admission, queue bound, batching, shedding
Decision:        configured workers/queue/rejection; SLO and recovery validation
```

## References

- [Sizing worksheet](references/sizing-worksheet.md) — boundary-consistent demand calculations,
  CPU and downstream constraints, queue budgets, `ThreadPoolExecutor` admission order and
  overload policy. Read when choosing or reviewing a pool size.
- [Reading the utilisation curve](references/utilisation-curve.md) — M/M/1, M/G/1 and Erlang-C
  assumptions, variability, demand law and evidence-based saturation diagnosis. Read when latency
  is high and the cause is not yet known to be code.
