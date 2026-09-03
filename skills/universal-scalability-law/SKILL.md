---
name: universal-scalability-law
description: >
  Fitting and falsifying the Universal Scalability Law (USL): load/resource definition,
  the scale coefficient gamma, contention alpha, coherency/retrograde beta, peak conditions,
  identifiability, uncertainty and held-out validation. Use when throughput saturates or falls
  as threads, users, cores or pods increase; when scale-out is proposed from too few points;
  or when comparing architectural scalability curves. Does not cover `L = λW`, queue/pool
  sizing (littles-law-and-queueing), latency-at-load models (queueing-models), or capacity/SLO
  decisions (capacity-planning).
---

# Universal Scalability Law

## Purpose

Quantify one homogeneous system's throughput curve over a declared load/resource variable and
decide whether more of that variable adds useful capacity. USL is an empirical rational model, not
a profiler: its coefficients can suggest contention-like and pairwise/coordination-like scaling,
but do not identify a lock, protocol or database without independent evidence.

Use the three-parameter throughput form:

```text
X(N) = γN / [1 + α(N−1) + βN(N−1)]
```

`γ` is the fitted single-unit scale, `α` the linear contention term and `β` the quadratic
retrograde term in the standard interpretation. Relative capacity is `C(N)=X(N)/γ`. With `β=0`,
the normalized form matches Amdahl-style saturation; with `α=β=0`, it is linear.

## Workflow

1. **Define `N` and the experiment.** `N` is exactly one axis: concurrent closed users, runnable
   workers, cores, JVMs or pods. State what stays fixed—hardware, per-unit hardware, dataset,
   offered workload, routing and request mix. Never combine users and pods in one curve.
2. **Define capacity throughput.** For every `N`, ensure the driver offers enough work to expose
   the service ceiling without turning rejected/dropped work into “throughput”. Closed saturation
   and validated open offered-load sweeps can both work; fixed open load below every ceiling cannot.
3. **Design informative points and replication.** Include baseline, curvature and—when safe—the
   suspected saturation/retrograde region. Choose repetitions from run-level variance and practical
   prediction precision. There is no universal six-point, 120-second or 2×-peak rule.
4. **Control/record state.** Keep versions, topology, per-unit resources, workload mix, data/cache,
   JIT/GC and downstream limits comparable. Explicitly model cold/ramp behavior if it is the target;
   otherwise define sustained state by observable criteria.
5. **Fit `γ`, `α`, `β` jointly.** Do not divide every observation by one noisy `X(1)`. Fit raw
   throughput with an error model/weights matching heteroscedastic run variance; preserve run-level
   observations and obtain coefficient/prediction intervals.
6. **Check identification and residuals.** Plot runs and fit, coefficient covariance/profile,
   bootstrap stability and held-out predictions. A high R² is neither required nor sufficient;
   systematic residuals, wide intervals or parameter trade-off mean the curve is not decision-ready.
7. **Compute the peak only when defined.** For the standard constrained model with `β>0` and
   `α<1`, continuous `N* = sqrt((1−α)/β)`. Evaluate feasible neighbouring integers and prediction
   intervals. If `N*≤1` (equivalently `α+β≥1`), the feasible curve is already non-increasing after one
   unit. With `β=0` there is no finite retrograde peak; with `α≥1`, it likewise does not rise
   beyond the baseline under the standard interpretation.
8. **Attribute and validate causally.** Compare denominator terms at the operating `N`, form a
   mechanism hypothesis, measure it directly, change one mechanism, and refit/hold out. Coefficient
   movement without mechanism evidence is correlation.

## Rules

- `X(N)` must use useful completed work per unit time plus errors/rejections as guardrails. Offered
  rate, accepted rate and completion throughput are different. Keep coordinated omission and
  generator saturation evidence (`coordinated-omission`).
- A closed workload is not forbidden: Gunther's queueing derivation is a synchronous machine-
  repairman bound. It is appropriate when `N` is closed users/threads and think time/state are
  controlled. An open experiment is appropriate when `N` is resources and capacity at each point
  is found with a validated offered-load sweep.
- Standard physical interpretation normally constrains `α≥0`, `β≥0` and `γ>0`; do not force those
  bounds merely to hide superlinear data or a bad fit. Negative estimates mean the standard regime
  is unsupported—check cache/partition effects, heterogeneity and measurement, then segment or use
  another model.
- Do not require measured points beyond an estimated peak when crossing it would violate safety.
  Without retrograde-region evidence, report `β/N*` as weakly identified and make only bounded
  predictions; run a targeted breakpoint test if the decision permits.
- Do not extrapolate by a universal multiple. Limit claims to the range where workload/topology
  invariants and prediction uncertainty remain defensible; label scenario sensitivity outside it.
- R² does not test coefficient sign, independence, heteroscedasticity, extrapolation or causal
  interpretation. Use residuals, intervals, held-out predictions and repeated-run error.
- `α` and `β` are not additive fractions of lock time, GC pause or network bytes. Their denominator
  contributions at operating `N` are model terms; map them to mechanisms only with profiles,
  wait/traffic metrics and intervention evidence.
- Coefficients describe the measured system **and workload/environment**. JDK, hardware, dataset,
  request mix, routing, quotas and downstream topology can change them without an application-code
  change.
- Superlinear scaling can be real over a range when partitioning shrinks working sets or unlocks
  vector/parallel resources. It signals a regime change that the standard nonnegative USL does not
  represent; do not dismiss it as warm-up or extrapolate it indefinitely.
- USL predicts throughput capacity, not latency at an arrival rate, tail probability, queue size,
  cost, reliability or safe autoscaling behavior. Feed capacity scenarios into the owning skills.

## Required model card

```text
Decision:        marginal unit, peak, architecture comparison or scenario bound
N definition:    users/threads/cores/JVMs/pods; feasible integer range
Invariants:      hardware per unit, workload/data/mix, topology/routing, state
Throughput:      useful-completion definition; offered/admitted/error/drop guardrails
Design:          N points, randomisation/blocking, independent run unit, state criterion
Fit:             γ, α, β intervals/covariance; error model; residuals; held-out results
Peak/marginal:   integer candidates and prediction interval; cost/guardrail context
Attribution:     direct evidence for suspected contention/coordination mechanism
Limits:          supported range, regime changes, sensitivity and re-fit triggers
```

## References

- [Data collection and fitting](references/data-collection-and-fitting.md) — experimental designs
  for closed-user and resource-scaling curves, joint nonlinear fit, uncertainty, identifiability,
  residual/held-out validation and the current CRAN package interface.
- [Coefficient diagnosis](references/coefficient-diagnosis.md) — interpreting denominator terms as
  hypotheses, mechanism evidence, interventions and before/after refits without treating
  coefficients as profilers.
- [Limits and troubleshooting](references/limits-and-troubleshooting.md) — latency boundary,
  closed-loop response relation, phase changes, marginal decisions, extrapolation and responses to
  production disagreement.
