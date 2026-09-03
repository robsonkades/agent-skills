# Collecting and fitting a defensible USL curve

## Pick one of two experiment shapes

### `N` is closed concurrency

Hold hardware/topology fixed and run `N` synchronous users/workers with declared think time and
work mix. Completion throughput versus population is the classic software-scalability/machine-
repairman shape. Record response time so `N≈X(R+Z)` reconciles. This does not claim latency under an
exogenous arrival rate.

### `N` is provisioned resources

For each core/JVM/pod count, estimate useful service capacity with a validated offered-load sweep or
controlled backlog. The load generator must expose the ceiling without becoming the bottleneck,
and errors/rejections/timeouts remain guardrails. A single fixed offered rate below all capacities
produces flat completion throughput and cannot identify resource scalability.

In both designs, keep per-unit CPU/memory/quota, routing, downstream topology, dataset, operation
mix and correctness invariant. If adding pods also shards data or changes cache fit, that is a new
regime to model explicitly, not noise.

## Experimental design

- Choose `N` values to distinguish linear, saturating and possible retrograde curvature. Start with
  a pilot; add points where competing curves diverge or prediction uncertainty is widest.
- Preserve independent run/JVM/host replication. Request samples within one run do not replicate
  placement, compilation or cache state.
- Randomise or block `N`/treatment order against time/host drift. Include a repeated baseline near
  the end to detect aging.
- Define cold/ramp/sustained state from the decision and observable JIT/cache/GC/throughput state;
  no universal warm-up or measurement duration exists.
- Predeclare practical prediction precision, stopping/safety limits and outcome handling. Do not
  discard “outlier” runs without a rule and root-cause evidence; report exclusions.
- Record offered/admitted/completed/error/drop/timeout counts, latency, CPU/quota throttling, GC,
  queue state, downstream saturation and generator health at every point.

## Fit raw throughput and the scale jointly

```python
import numpy as np
from scipy.optimize import curve_fit

def usl(n, gamma, alpha, beta):
    return gamma * n / (1 + alpha * (n - 1) + beta * n * (n - 1))

# One row per independent run, not only per-N medians.
n = runs["N"].to_numpy(float)
x = runs["throughput"].to_numpy(float)

# `run_sd` must come from the experimental design. Do not invent equal precision.
sigma_x = runs["run_sd"].to_numpy(float)

popt, pcov = curve_fit(
    usl,
    n,
    x,
    p0=[x[n.argmin()], 0.05, 0.001],
    sigma=sigma_x,
    absolute_sigma=True,
    bounds=([0.0, 0.0, 0.0], [np.inf, 1.0, np.inf]),
    maxfev=50_000,
)
gamma, alpha, beta = popt
residual = x - usl(n, *popt)
```

The `[0,1]` alpha bound represents the conventional nonnegative sublinear regime; `beta≥0` permits
retrograde scaling. First plot an unconstrained/alternative fit as a diagnostic. If data require a
negative coefficient, do not publish a constrained curve as though it explained superlinearity;
find the regime change or use a model that permits it.

Dividing every value by one observed `X(1)` makes that observation a shared noisy denominator and
forces its error into all rows. Fitting `γ` jointly (as current `usl` packages do) avoids treating a
single run as exact. Multiple baseline runs still anchor the scale.

`curve_fit` covariance is a local approximation and can be misleading at bounds or with weak
identification. Bootstrap independent runs/blocks, use profile likelihood or a suitable Bayesian
model, and propagate parameter uncertainty to `X(N)`, marginal gain and peak. If per-point variance
changes with `N`, weighted least squares or a variance model is preferable to unweighted fitting;
throughput counts may also need a count/process model.

## Identification checks

`α(N−1)` and `βN(N−1)` look similar over a narrow low-N range. Diagnose:

- wide/highly correlated coefficient intervals or bootstrap sign/boundary pile-up;
- a Jacobian/information matrix with poor conditioning;
- radically different `N*` across leave-one-N-out fits;
- full USL and `β=0` model making indistinguishable predictions over measured N;
- predicted peak driven by points not independently replicated.

When `β` is weakly identified, report saturation evidence and a lower/interval bound on peak rather
than a precise `N*`. Add a safe high-N point where model predictions diverge if the decision value
justifies it.

## Validation gates—decision-specific, not magic constants

1. Units/mix/topology remained invariant or the curve is segmented.
2. Generator realised the intended design and did not hide drops/omission.
3. Conservation/guardrail metrics reconcile and useful output remains correct.
4. Residuals show no systematic step, curvature, time order or variance pattern.
5. Held-out N/run predictions meet the predeclared absolute/relative decision tolerance.
6. Parameter and peak/marginal intervals are narrow enough to choose between options.
7. Integer feasible N near a continuous peak are evaluated directly.

R² may be reported descriptively but is not a gate. It can be high for a biased curve and unstable
when throughput varies little. “Predicted peak below one noisy measured maximum” is likewise not an
automatic refit instruction; inspect prediction intervals and residuals.

## Peak and marginal value

For `β>0`, `α<1`:

```text
N*continuous = sqrt((1−α)/β)
```

If `N*≤1`, the feasible integer curve peaks at one unit. Otherwise evaluate `floor(N*)`, `ceil(N*)`
and feasible neighbours with prediction intervals. The economic
decision is often earlier: compare `X(N+1)−X(N)` and its interval with unit cost, availability and
latency guardrails. Do not report a decimal pod/thread optimum.

## R package

```r
library(usl)
packageVersion("usl")
model <- usl(throughput ~ load, data = runs)
coef(model)       # current releases estimate alpha, beta and gamma
confint(model)
plot(model)
```

The CRAN package interface changed across major versions; current 3.x documentation uses
`alpha`, `beta`, `gamma` and nonlinear solvers. Pin the installed version and archive session info.
Package intervals inherit regression assumptions; they do not repair pseudoreplication or a bad
experiment.

## Reporting

Publish raw run rows, design/invariants, model equation and software version, coefficient covariance/
intervals, residual and held-out plots, supported N range, integer peak/marginal intervals, outcome
guardrails and unresolved regime changes. A coefficient without its measured range and uncertainty
is not reusable.

## Sources

- Gunther, [“A General Theory of Computational Scalability Based on Rational Functions”](https://arxiv.org/abs/0808.1431)
- Gunther, Subramanyam and Parvu, [“A Methodology for Optimizing Multithreaded System Scalability on Multi-cores”](https://arxiv.org/abs/1105.4301)
- [CRAN `usl` package](https://cran.r-project.org/package=usl)
- [SciPy nonlinear least squares documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.curve_fit.html)
- NIST/SEMATECH, [nonlinear least-squares regression](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd142.htm)
