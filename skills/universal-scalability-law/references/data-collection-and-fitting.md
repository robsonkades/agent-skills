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

Partial Python 3 snippet using NumPy, SciPy `curve_fit` and a supplied pandas-like `runs`
table. Columns are N, useful throughput in one work/time unit, and positive run-level error
standard deviation in that same unit. This illustrates independent Gaussian errors with known
absolute standard deviations; it is not a universal error model or a complete validation pipeline.

```python
import numpy as np
from scipy.optimize import curve_fit

def usl(n, gamma, alpha, beta):
    return gamma * n / (1 + alpha * (n - 1) + beta * n * (n - 1))

# One row per independent run, not only per-N medians.
n = runs["N"].to_numpy(float)
x = runs["throughput"].to_numpy(float)

# SD of a run observation, not within-run request spread or SEM of an N-group mean.
sigma_x = runs["run_sd"].to_numpy(float)

if not (np.isfinite(n).all() and np.isfinite(x).all() and np.isfinite(sigma_x).all()):
    raise ValueError("non-finite observations or uncertainty")
if np.any(n < 1) or np.any(x < 0) or np.any(sigma_x <= 0) or not np.any(x > 0):
    raise ValueError("invalid N, throughput or run SD")
if np.unique(n).size < 3:
    raise ValueError("three-parameter fit requires at least three distinct N values")
gamma_start = float(np.max(x / n))

popt, pcov = curve_fit(
    usl,
    n,
    x,
    p0=[gamma_start, 0.05, 0.001],
    sigma=sigma_x,
    absolute_sigma=True,
    bounds=([np.finfo(float).tiny, 0.0, 0.0], [np.inf, np.inf, np.inf]),
    method="trf",
    x_scale=[gamma_start, 0.05, 0.001],
    maxfev=50_000,
)
gamma, alpha, beta = popt
residual = x - usl(n, *popt)
```

The bounds enforce positive gamma and nonnegative alpha/beta. Restricting alpha to at most one
is an additional regime choice, not necessary for a positive denominator at N≥1; report it if
used. Compare several plausible starts and alternative regimes, checking a positive denominator
over any reported domain. If data require a
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
If only relative variance weights are defensible, `absolute_sigma=True` gives unjustified
absolute intervals; estimate the error scale/model and report that uncertainty. Correlated
run blocks need their covariance or block-aware inference, not a diagonal sigma vector.

## Identification checks

`α(N−1)` and `βN(N−1)` can trade off over a narrow low-N range.

Three distinct N values are necessary for three free parameters, not sufficient for a
reliable fit. Repeating only one or two N values cannot add missing curvature information;
at N=1 the alpha/beta sensitivities are both zero. Three exact points can interpolate without
testing lack of fit. Plan additional distinct held-out N values and independent replication.
Diagnose:

- wide/highly correlated coefficient intervals or bootstrap sign/boundary pile-up;
- a Jacobian/information matrix with poor conditioning;
- radically different `N*` across leave-one-N-out fits;
- full USL and `β=0` model making indistinguishable predictions over measured N;
- predicted peak driven by points not independently replicated.

When `β` is weakly identified, report only saturation or peak bounds supported by the data;
there may be no useful finite bound. Add a safe high-N point where model predictions diverge if the decision value
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
Restrict the candidates to the actual feasible range; a continuous peak outside that range
may leave an endpoint best. For beta=0: alpha=0 is linear, 0<alpha<1 increases toward gamma/alpha,
alpha=1 is constant, and alpha>1 decreases from the baseline. For beta>0 with alpha>=1 the
curve decreases on N>=1. Do not evaluate the square root outside its stated domain or
discard bootstrap samples with no finite peak to manufacture a finite peak interval.

## R package

```r
library(usl)
packageVersion("usl")
model <- usl(throughput ~ load, data = runs)
coef(model)       # current releases estimate alpha, beta and gamma
confint(model)
plot(model)
```

The CRAN 3.0.4 manual documents `alpha`, `beta`, `gamma` and nonlinear solvers; the interface
changed across major versions. Pin the installed version and archive `sessionInfo()`.
Its `confint` uses parameter standard errors and a Student t distribution, not a bootstrap.
`optimal.scalability` is the package's 1/alpha knee, not the retrograde throughput peak;
`limit.scalability` is gamma/alpha, not the actual N→infinity limit when beta>0 (which is zero).
Check definitions before turning helper output into an operational recommendation.
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
