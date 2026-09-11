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
- Retain useful-output and offered/admitted/error/drop/timeout populations for a capacity claim.
  Select latency, CPU/quota, GC, queue, downstream and generator observations needed to establish
  that experiment's invariants and guardrails; reuse adequate captures rather than require every
  diagnostic at every point for a narrow analysis.

## Fit raw throughput and the scale jointly

Partial Python 3 snippet using NumPy, SciPy `curve_fit` and a supplied pandas-like `runs`
table. Columns are N, useful throughput in one work/time unit, and positive run-level error
standard deviation in that same unit. This illustrates independent Gaussian errors with known
absolute standard deviations; it is not a universal error model or a complete validation pipeline.
Here N is an integer count. A deliberately normalized/effective axis needs its own definition,
equation interpretation and refit; do not round fractional input or reuse count-axis coefficients.

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

if any(a.ndim != 1 for a in (n, x, sigma_x)) or not (n.shape == x.shape == sigma_x.shape):
    raise ValueError("N, throughput and run SD must be aligned one-dimensional arrays")
if not (np.isfinite(n).all() and np.isfinite(x).all() and np.isfinite(sigma_x).all()):
    raise ValueError("non-finite observations or uncertainty")
if np.any(n < 1) or np.any(n != np.floor(n)) or np.any(x < 0) or np.any(sigma_x <= 0):
    raise ValueError("invalid integer N, throughput or run SD")
if not np.any(x > 0):
    raise ValueError("all-zero useful throughput cannot identify this positive-gamma capacity fit")
if np.unique(n).size < 3:
    raise ValueError("three-parameter fit requires at least three distinct N values")
gamma_start = float(np.max(x / n))
if not np.isfinite(gamma_start) or gamma_start <= np.finfo(float).tiny:
    raise ValueError("unusable positive start at these units; inspect numerical scale")

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
with np.errstate(over="raise", invalid="raise", divide="raise"):
    prediction = usl(n, *popt)
    residual = x - prediction
if not (np.isfinite(popt).all() and np.isfinite(prediction).all() and np.isfinite(residual).all()):
    raise ValueError("non-finite fit or predicted throughput")
```

Preserve optimizer exceptions and warnings with the attempted inputs/options; a failed start or
evaluation limit is not an estimate. Do not drop zero-success runs to make the fit work: retain their
outcomes and investigate whether this positive-capacity/error model is appropriate. Finite returned
values do not validate covariance, identification or predictions. A nonfinite/unstable `pcov` cannot
support parameter intervals; assess any useful local prediction separately with suitable inference.
The interface above is documented in SciPy 1.15.2 and NumPy 1.26; check the installed versions.

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
testing lack of fit. Use additional distinct held-out N values and independent replication when
needed and feasible for the decision; existing adequate validation can answer a narrower question.
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
4. Residuals show no unexplained step, curvature or time-order structure. Judge variance against the
   chosen error model: increasing raw residual spread is compatible with modeled heteroscedasticity;
   inspect standardized/whitened residuals and the variance model's adequacy.
5. Held-out N/run predictions meet the predeclared absolute/relative decision tolerance.
6. Intervals for the actual prediction, peak or marginal decision distinguish the relevant options.
   Wide parameter intervals do not alone invalidate a supported local prediction, but cannot justify
   a precise coefficient or peak claim.
7. For a peak decision, evaluate the feasible integer candidates and endpoints; distinguish model
   evaluation from actual workload tests and require the latter only within the decision's scope.

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
confint(model)    # inspect the installed interval implementation before claiming coverage
plot(model)
```

The CRAN 3.0.4 manual documents `alpha`, `beta`, `gamma` and nonlinear solvers; the interface
changed across major versions. Pin the installed version and archive `sessionInfo()`.
Its 3.0.4 `nls`/`nlxb` solvers use gamma `>=0` and alpha/beta in `[0,1]`, unlike the wider
nonnegative coefficient regime in the Python fragment. Report the chosen constraints when comparing fits.
Its `confint` uses parameter standard errors and a Student t distribution, not a bootstrap.
In the [3.0.4 source](https://cran.r-project.org/src/contrib/usl_3.0.4.tar.gz), it uses `qt(level, length(residuals) - 1)` while labeling the columns as
two-sided limits. That differs from the usual two-sided t critical probability and residual
degrees of freedom for a three-parameter fit. Do not treat those labels as verified coverage;
inspect the installed implementation or use a justified inference method.
`optimal.scalability` is the package's 1/alpha knee, not the retrograde throughput peak;
`limit.scalability` is gamma/alpha, not the actual N→infinity limit when beta>0 (which is zero).
Check definitions before turning helper output into an operational recommendation.
Package intervals inherit regression assumptions; they do not repair pseudoreplication or a bad
experiment.

## Reporting

For a fit used to support a decision, retain raw run rows, design/invariants, model equation and software version, coefficient covariance/
intervals, residual and held-out plots, supported N range, integer peak/marginal intervals, outcome
guardrails and unresolved regime changes. A coefficient without its measured range and uncertainty
is not reusable.
Scale the presentation to the question and link adequate artifacts. An equation explanation or
bounded descriptive prediction need not generate a new reporting or experiment pipeline.

## Sources

- Gunther, [“A General Theory of Computational Scalability Based on Rational Functions”](https://arxiv.org/abs/0808.1431)
- Gunther, Subramanyam and Parvu, [“A Methodology for Optimizing Multithreaded System Scalability on Multi-cores”](https://arxiv.org/abs/1105.4301)
- [CRAN `usl` package](https://cran.r-project.org/package=usl)
- [SciPy 1.15.2 nonlinear least squares documentation](https://docs.scipy.org/doc/scipy-1.15.2/reference/generated/scipy.optimize.curve_fit.html)
- [NumPy 1.26 floating-point error handling](https://numpy.org/doc/1.26/reference/generated/numpy.errstate.html)
- NIST/SEMATECH, [nonlinear least-squares regression](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd142.htm)
