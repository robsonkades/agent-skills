# Collecting the data and fitting the model

## Environment, before the first point

- Dedicated machine for the application; no competing workloads.
- CPU governor pinned: `cpupower frequency-set -g performance`.
- Load generator on a **separate** machine, so it does not compete for CPU with the app.
- JVM warm-up of at least 120 s before anything is recorded.
- Range of N decided up front: 1 to at least 2 x the estimated `N_max`.

## Per-point protocol

For each N in {1, 2, 4, 8, 16, 32, 64, …}:

1. Start the application configured for that N.
2. Warm up 60–120 s under moderate load — **discard**.
3. Measure 60 s of stable open-loop load; record mean throughput.
4. Cool down 10–30 s before the next point.

Three repetitions per N, take the median, discard outliers. Record CPU, GC pause time and
connection-pool utilisation alongside throughput — they are what turns a coefficient into a
diagnosis later.

## Open-loop collection with k6

```javascript
export const options = {
  scenarios: {
    test: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.RATE),
      timeUnit: '1s',
      duration: '90s', // 30 s warm-up + 60 s measurement
      preAllocatedVUs: parseInt(__ENV.VUS) * 2,
      maxVUs: parseInt(__ENV.VUS) * 4,
    },
  },
};
export default function () {
  http.get(__ENV.APP_URL);
}
```

The driver loop sweeps N, derives `TPS = http_reqs / 60`, and appends `N,TPS` to a CSV.

**Assert on the extraction.** k6's summary output format has changed between major versions;
check `k6 version` before trusting a fixed `grep`/`awk`. A pattern that stops matching returns
empty, which is indistinguishable from "0 TPS measured" unless the script aborts:

```bash
if [ -z "$TOTAL_REQS" ] || [ "$TOTAL_REQS" -eq 0 ]; then
    echo "ERROR: could not extract http_reqs from k6 output for N=$N" >&2
    exit 1
fi
```

Without that guard the run silently produces a corrupted dataset that still fits.

## The fit

```python
import numpy as np
from scipy.optimize import curve_fit

def usl(N, sigma, kappa):
    return N / (1 + sigma * (N - 1) + kappa * N * (N - 1))

X_norm = X_vals / X_vals[0]                 # normalise by the N = 1 baseline
popt, pcov = curve_fit(usl, N_vals, X_norm,
                       p0=[0.1, 0.01],
                       bounds=([0, 0], [1, 1]))
sigma, kappa = popt
std_errors = np.sqrt(np.diag(pcov))         # report the coefficients with these

residuals = X_norm - usl(N_vals, sigma, kappa)
r_squared = 1 - np.sum(residuals**2) / np.sum((X_norm - np.mean(X_norm))**2)

N_max  = np.sqrt((1 - sigma) / kappa)       # only meaningful when kappa > 0
X_peak = usl(N_max, sigma, kappa) * X_vals[0]
```

Direct non-linear fitting avoids the weighting bias of the manual linearisation
`y = N/X_norm`, which weights errors unevenly and can return an invalid (negative) sigma on
datasets spanning a wide range of N.

## Validity gates — all four, before interpreting anything

| Gate                                 | Failure means                                          |
| ------------------------------------ | ------------------------------------------------------ |
| R² > 0.95                            | Poor fit — suspect heterogeneous units first           |
| sigma >= 0 and kappa >= 0            | Physically invalid parameters; the fit method is wrong |
| predicted `X_peak` >= max measured   | The fit contradicts the data — redo the regression     |
| measured points exist beyond `N_max` | kappa is unconstrained; the projection has no support  |

Then plot measured points against the fitted curve and look at it. Multiple visible "steps"
mean heterogeneous units — segment the analysis by homogeneous tier instead of fitting one
curve across all of them.

## The R alternative

```r
library(usl)
packageVersion("usl")            # decides which output naming to expect
model <- usl(throughput ~ load, data)
summary(model)                   # <= 1.8.x: sigma, kappa. >= 2.0.0: alpha, beta, gamma
scalability(model, c(64, 128))   # project
```

Same mathematics, different symbols. Check the installed version before reading the summary.

## Reporting

Document sigma, kappa, `N_max`, `X_peak`, R² and the interpretation together — a coefficient
without its R² and its measured range is not a result. Record which bottleneck limits the
current `N_max`, so the next optimisation is prioritised against it. Comparing sigma and kappa
before and after a change says which physical mechanism the change actually attacked; a single
throughput figure does not.
