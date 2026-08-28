---
name: universal-scalability-law
description: >
  The Universal Scalability Law: the contention coefficient (sigma, Gunther's alpha), the
  coherency coefficient (kappa, Gunther's beta), fitting the model to measured throughput,
  N_max as the throughput peak, and why throughput falls beyond it. Use when adding pods or
  threads stopped increasing throughput or made it worse, when a scale-out is being proposed
  without evidence it will help, when a benchmark shows throughput peaking and then
  declining, when someone extrapolates scalability from N = 1, 2, 4 only, or when deciding
  between attacking a lock and eliminating shared state. Does not cover the N = lambda x R
  law, utilisation rules of thumb or pool sizing (littles-law-and-queueing), choosing and
  fitting a queueing model (queueing-models), or turning a model into an infrastructure
  decision (capacity-planning).
---

# Universal Scalability Law

## Purpose

Decide, with two measured numbers, whether more hardware will help this system, do almost
nothing, or actively make it slower. The failure this skill prevents is the scale-out that
degrades production: throughput was already past its peak, every added pod cost more in
coordination than it contributed in work, and the response to the resulting slowdown was to
add more pods.

The model is `X(N) = N / (1 + sigma(N-1) + kappa·N(N-1))`. Sigma is a per-unit cost and
grows linearly; kappa is a per-_pair_ cost and grows quadratically. That difference in order
is the whole point: an O(N) term in the denominator can only saturate growth, while an O(N²)
term eventually overwhelms the O(N) numerator and turns the curve downwards. Amdahl is the
special case kappa = 0; linear scaling is the special case sigma = 0 too.

## Workflow

1. **Name the unit of N and the throughput metric** before measuring anything. Threads,
   pods, processes or connections — one of them, not a mixture. Throughput is TPS/RPS, never
   latency.
2. **Collect open-loop, across a range that reaches past the suspected peak.** Six points
   minimum, eight to ten preferred, running to at least 2 x the estimated `N_max`. Closed-loop
   generators throttle themselves as the system slows and will hide the regression entirely.
   See `references/data-collection-and-fitting.md`.
3. **Fit sigma and kappa non-linearly** (`scipy.optimize.curve_fit` with bounds `[0,0]` to
   `[1,1]`) against throughput normalised by the N = 1 baseline. The classic linearisation
   `y = N/X_norm` is a teaching device, not the production method.
4. **Run the validity gates before reading any coefficient**: R² > 0.95, sigma >= 0 and
   kappa >= 0, and the predicted `X_peak` must be >= the largest measured throughput. A fit
   that fails a gate is a bad fit, not a strange system.
5. **Diagnose from the pair, not from either alone.** Sigma high means serialisation —
   scaling still pays, with diminishing returns. Kappa high means coordination — scaling
   makes it worse. See `references/coefficient-diagnosis.md`.
6. **Compute `N_max = sqrt((1 - sigma) / kappa)`** and compare it with the N you are running
   and the N you were about to move to. Beyond `N_max` you are paying for infrastructure that
   is degrading the service.
7. **Re-fit after any architectural change.** Sigma and kappa are properties of the design,
   not of the machine; an optimisation is worth reporting as a shift in the coefficients and
   in `N_max`, not as one throughput number.

## Rules

- Never fit USL to data collected only in the linear range. With no points beyond `N_max`,
  nothing in the data contradicts kappa = 0, the fit returns kappa ~ 0, and the projection to
  high N is optimistic by orders of magnitude.
- Never extrapolate more than 2 x the largest N actually measured.
- Never collect with a closed-loop generator (fixed VUs that wait for the response). Use
  `constant-arrival-rate` in k6, `constantUsersPerSec` in Gatling, or wrk2.
- The conclusive evidence that closed-loop distorted a run is the **sample count**: requests
  issued versus requests the plan intended to issue. The shape of the latency curve is not
  evidence.
- Discard at least the first 60–120 s of every measurement point. Code still being compiled
  by the JIT produces artificially high sigma and kappa.
- Reject any fit with R² < 0.95 as a homogeneity problem first: mixed machine generations,
  NUMA, per-pod CPU throttling and uneven JVM warm-up all break the "all N units are
  identical" assumption. A curve with visible steps is heterogeneous data, not a noisy system.
- Reject any fit whose predicted peak sits below an already-measured point. Redo the
  regression; do not act on the coefficients.
- Do not treat sigma and kappa as interchangeable severities. Compare the two denominator
  terms at your actual operating N — `sigma(N-1)` against `kappa·N(N-1)` — and attack the
  larger one. At sigma = 0.15, kappa = 0.001, N = 20 the contention term is roughly 7.5x the
  coherency term, so optimising kappa there is nearly invisible.
- Reducing kappa by 10x moves `N_max` by only ~3.2x — the square root of the reduction.
  Budget the work accordingly.
- Note the symbol convention before reading any external output: this model is sigma/kappa in
  the CRAN `usl` package up to 1.8.x, and alpha/beta (plus gamma) from 2.0.0 onwards and in
  Gunther's own writing. Map sigma to alpha and kappa to beta; the mathematics is identical.
- Efficiency `E(N) = X(N) / (N · X(1))` above 1.0 is not super-linear scaling in steady
  state — it is a warm-up or cache artefact in the measurement.

## References

- [Data collection and fitting](references/data-collection-and-fitting.md) — the measurement
  protocol, the open-loop collection recipe, the Python fit with its validity gates, and the
  R alternative. Read before collecting a single data point, and when a fit fails a gate.
- [Coefficient diagnosis](references/coefficient-diagnosis.md) — the sigma/kappa decision
  matrix and the mapping from each coefficient to the concrete Java mechanism that produces
  it. Read once the fit is valid and you need to decide what to change.
