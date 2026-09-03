---
name: queueing-models
description: >
  Choosing, parameterising and falsifying queueing models: M/M/1, M/M/c, M/G/1, finite/loss
  and closed networks; Erlang C/B, Pollaczek–Khinchine, Kingman/Allen–Cunneen, variability,
  queue topology and what model assumptions permit.
  Use when a predicted wait time disagrees with the measured one, when latency is far worse
  than utilisation suggests, when service times are bimodal or GC-spiked, when arrivals are
  retries or cron bursts rather than independent users, when Erlang C must be computed for a
  large number of servers, when routing or partitioning changes the queue topology, or when
  deciding whether a measured tail can be inferred from an analytical model. Does not cover
  the `L = λW` conservation law or operational pool sizing
  (littles-law-and-queueing), the alpha/beta
  scalability model (universal-scalability-law), or the statistics of the measured numbers
  themselves (latency-statistics).
---

# Queueing Models

## Purpose

Use the smallest model that answers the decision, expose its assumptions, and try to falsify it on
held-out operating points. The failure this skill prevents is a precise Erlang/Kingman output whose
queue boundary, population, routing, service process or outcome policy does not match the system.

Every model here is one formula plus a set of assumptions. The formula is the cheap part.
Which parameters you feed it, and which assumption you have quietly broken, is the work.

## Workflow

1. **Write down the Kendall notation you are claiming** — `A/S/c` at minimum, plus `K` if
   the system rejects and `N` if the population is fixed. Naming the arrival distribution,
   the service distribution and the number of servers forces each assumption into the open
   before any number is produced.
2. **Decide population and topology.** Open arrivals, finite-source/closed users, loss systems and
   semi-open sessions are different. Determine whether work waits in one shared queue, is routed
   among per-server queues, is partition-affine, or traverses a queueing network. Do not infer this
   from pod/thread counts. See
   `references/production-behaviour.md`.
3. **Characterise arrivals.** "M" requires a stationary Poisson process, not merely many HTTP
   users or `c_a≈1`. Inspect time-varying intensity, count dispersion, autocorrelation, batches,
   retries and state dependence at the selected boundary.
4. **Characterise service.** Separate queue wait from server-occupancy/resource demand; inspect
   empirical distribution, second moment, modality, autocorrelation and dependence on load/class.
   `c_s=1` does not prove exponential service, and a coefficient of variation does not determine a
   tail distribution.
5. **Choose the model from those answers**, not from familiarity. See
   `references/model-selection-and-formulas.md`.
6. **Parameterise from boundary-consistent measurements**, with uncertainty and censoring. Model
   servers are simultaneous service positions with the assumed service process—not “threads not
   currently blocked”. See `references/measuring-the-parameters.md`.
7. **Calibrate and validate separately.** Predeclare acceptable error from the decision, fit on
   some operating points, predict held-out loads/topologies, and inspect residuals. A 30% rule has
   no universal meaning; direction of error suggests hypotheses but does not identify one.
8. **Infer only metrics the model supplies.** M/M/c gives a point mass at zero plus an exponential
   queue-wait tail. P–K/Kingman primarily give means. Do not turn a mean correction or `c_s` into a
   p99, and keep queue wait distinct from total response and terminal failures.

## Rules

- State the model as `A/S/c` before quoting any number from it. A wait time with no declared
  model is not a prediction.
- In M/G/1, P–K makes mean queue wait proportional to `(1+c_s²)/2` relative to M/M/1 at the
  same mean/utilisation; M/D/1 is exactly half. This does not generalise unchanged to multiple
  servers, non-Poisson arrivals, percentiles or load-dependent service.
- Use Erlang C for the probability of waiting in M/M/c. It is `C(c, a)` with `a = lambda/mu`
  in Erlangs — not an ad-hoc ratio, and not rho.
- For large `c`, compute Erlang C through the Erlang B recursion rather than the direct sum;
  `c!` overflows a double at `c = 171` and the running sum overflows past `a ≈ 700` even with
  the term recurrence. Cross-check any published number by both methods where both run.
- Pooling benefit depends on arrival splitting, server equivalence, load and discipline. Under
  M/M/c a shared queue reduces wait versus balanced independent M/M/1 queues, but not by a
  universal factor; isolation, affinity and head-of-line effects are competing objectives.
- Do not confuse Kingman (G/G/1, carries `c_a`) with Pollaczek-Khinchine (M/G/1, which
  assumes `c_a = 1` and has no such term). Setting `c_a = 1` in Kingman reproduces P-K. For a
  pool with `c_s ≠ 1` use Allen–Cunneen — Kingman's factor on the Erlang C wait.
- Kingman is a heavy-traffic mean approximation, not a general upper bound. Validate it over the
  load range; no `c_s` converts an exponential percentile formula into a general-service tail.
- Retries, hedges, health checks and fan-out are visits/arrivals at their respective boundaries.
  Count them by class; retry probability may depend on queue state, invalidating a stationary
  exogenous-arrival model.
- Expected residence across sequential stages adds for the same cohort by linearity, but stages
  may overlap and tail quantiles do not add. Model feedback/blocking networks explicitly.
- Never insert a percentile of utilisation into a stationary formula. For changing load/capacity,
  use transient/fluid/simulation models or short quasi-stationary regimes only when timescale
  separation is demonstrated.
- A bounded queue can be approximated by M/M/c/K only under Markovian arrival/service and fixed
  FCFS capacity assumptions. Its finite state has a stationary loss distribution even for offered
  `ρ≥1`, but retries, abandonment and state-dependent service need another model. Read loss and
  completion latency together.
- Priority conservation results require their stated Poisson, service, discipline and
  work-conserving assumptions. Priority moves risk between classes and can starve low classes;
  validate per-class SLOs and aging/admission policy.
- M/D/1 and bimodal service distributions have **no** simple closed-form wait CDF. The
  exponential service case is the only one here with one; measure the percentiles empirically
  for the others.

## Required model card

```text
Decision/metric: mean wait, wait probability, loss, tail, staffing or sensitivity
Boundary/cohort: arrival, admission, departure, classes and terminal outcomes
Topology:        shared/per-server/partition queues; routing; stages; open/closed population
Kendall claim:   A/S/c/K/N/D plus patience, priorities and vacations where relevant
Parameters:      sources, units, uncertainty, censoring; time/load dependence
Fit/validation:  calibration points, held-out points, residuals and acceptance criterion
Alternatives:    analytical model, simulation, trace replay or direct measurement
Decision limits: what the model cannot infer and conditions requiring re-fit
```

## References

- [Model selection and formulas](references/model-selection-and-formulas.md) — explicit formula
  contracts for M/M/1, M/M/c, M/G/1, Kingman/Allen–Cunneen, Erlang B and M/M/c/K; numeric
  stability, topology, tails and the boundary where simulation is required.
- [Measuring the parameters](references/measuring-the-parameters.md) — arrival-process evidence,
  service/occupancy boundaries, model-server capacity, censoring, task-queue instrumentation and
  calibration/held-out validation.
- [Production behaviour](references/production-behaviour.md) — structural mappings for executors,
  pools, partitions and routed/autoscaled fleets; open/closed/semi-open populations, retry
  feedback, transient fluid bounds, residual diagnosis and failure tests.
