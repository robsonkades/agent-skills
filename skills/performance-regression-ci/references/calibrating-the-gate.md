# Calibrating the gate

## Measuring natural variation

```
1. Run the same benchmark 10 times with no code changes, on the SAME runner the
   pipeline will use.
2. natural_variation = max_score / min_score - 1
3. warning_threshold    = natural_variation × 2
4. regression_threshold = natural_variation × 4
```

Observed orders of magnitude, from teams that adopted this process — not physical
constants, and not substitutes for measuring your own runner:

| Runner              | Natural variation | Workable thresholds                    |
| ------------------- | ----------------- | -------------------------------------- |
| Dedicated, isolated | 3–8%              | warning 6–16%, regression 12–32%       |
| Shared              | 20–50%            | 40%+ — the gate is effectively useless |

A shared runner needs thresholds so wide that a realistic 10–20% regression passes unseen.
Widening the threshold is not the fix; a dedicated runner is.

The two failure modes at the extremes:

- **1–2% threshold** — constant false positives from the environment's own variation. The
  team learns to ignore alerts, the label "CI noise" appears, and real regressions land.
- **30%+ threshold** — serious regressions never alert, and performance degrades silently
  for weeks.

## Two variance sources, two different fixes

| Source                   | Comes from                                                                          | Reduced by                |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------- |
| Measurement noise        | Incomplete JIT warm-up, asynchronous GC, hardware jitter (cache, branch prediction) | More iterations and forks |
| Infrastructure variation | Shared runner, noisy neighbours, CPU frequency scaling, throttling                  | Dedicated hardware only   |

More iterations do nothing for the second one. CPU pinning and frequency scaling are the
runner's responsibility, not the JVM's, and no JMH configuration compensates for them.

Two JVM-side sources worth pinning explicitly:

- **Ergonomic heap sizing varies between runs.** A runner with less memory available leads
  G1 to size the heap differently, changing GC frequency and therefore the measured time.
  Fix `-Xms512m -Xmx512m` and add `-XX:+AlwaysPreTouch` so the first-touch page faults do
  not land inside the measurement window.
- **Warm-up cut short to save pipeline time** means the benchmark is partly measuring JIT
  warm-up rather than steady state. Isolated forks stop compilation state leaking between
  benchmarks, but they do not fix insufficient warm-up.

## Sign convention

The convention depends on `BenchmarkMode`, and getting it backwards is the most common
reason a gate approves regressions or blocks improvements.

| Mode                        | Better is | Regression is  |
| --------------------------- | --------- | -------------- |
| `AverageTime`, `SampleTime` | Lower     | Positive delta |
| `Throughput`                | Higher    | Negative delta |

For `Mode.AverageTime`, with `delta = (current - baseline) / baseline`:

```
delta ≤ warning_threshold                          → pass, within acceptable noise
warning_threshold < delta ≤ regression_threshold   → warning, manual review
delta > regression_threshold                       → blocked
delta < -noise_threshold                           → improvement, recorded, does not block
```

Apply the same convention in the diagram that documents the logic, the script that
implements it and the workflow that consumes it — with no exception anywhere.

## What `scoreError` actually is

JMH reports a `score` (the mean) and a `scoreError`. `scoreError` is **not** the half-width
of a 95% confidence interval. `Result.getScoreError()` calls `getMeanErrorAt(0.999)`, so it
is the half-width of a **99.9%** interval. This is stable across JMH 1.37+ and is not
configurable by annotation — it is a constant of the internal statistics.

The consequence: a 99.9% interval is considerably wider than a 95% one, because the
critical t multiplier is larger. Any criterion built on it is therefore _more conservative_
than assumed — fewer false positives, at the cost of delaying detection of small real
regressions. If the team expects the gate to catch 5% regressions but `scoreError` already
spans much of that range, the regression never crosses the significance bar even when real.

## Two significance criteria

**Non-overlapping intervals** — conservative, strong evidence when it fires:

```python
def is_statistically_significant(
    baseline_score: float, baseline_error: float,
    current_score: float, current_error: float,
) -> bool:
    baseline_low, baseline_high = baseline_score - baseline_error, baseline_score + baseline_error
    current_low, current_high = current_score - current_error, current_score + current_error
    overlapping = not (current_high < baseline_low or current_low > baseline_high)
    return not overlapping
```

**Combined noise** — more permissive, better sensitivity to small regressions:

```python
combined_noise = (base.score_error + curr.score_error) / base.score
is_significant = abs(delta) > combined_noise and abs(delta) > noise_threshold
```

These are two points on the sensitivity/specificity trade-off, not equivalents. Pick one
deliberately and say which in the script.

Mann-Whitney U over the raw per-iteration samples is the natural next step for a mature
pipeline — non-parametric, so it does not assume normality, which matters because latency
rarely is. It requires exporting `-rf json` at per-iteration granularity rather than the
aggregated `primaryMetric` summary.

## Comparing scores without the error is the classic bug

```python
# WRONG — compares means only
delta = (current.score - baseline.score) / baseline.score
if delta > 0.10:
    alert()   # ignores that both sides carry ±12% error at 99.9%

# baseline = 100 ± 15  → [85, 115]
# current  = 108 ± 14  → [94, 122]   intervals overlap
# → the 8% difference is not significant at this confidence level
```

## Checklists

Before enabling the pipeline in a repository:

- [ ] Natural runner variation measured (10 runs of the same commit, no changes)
- [ ] Warning and regression thresholds derived from that measurement, not chosen
- [ ] Benchmarks cover multiple relevant `@Param` values
- [ ] Heap and GC flags fixed in the forks (`-Xms`/`-Xmx`/`-XX:+AlwaysPreTouch`)

When triaging a regression alert:

- [ ] The delta exceeds both the combined `scoreError` and the `noise_threshold`
- [ ] The baseline in use is recent and reflects legitimate merges since it was captured
- [ ] The regression appears at every `@Param` size, or only some — the latter indicates an
      algorithmic complexity change rather than a constant-factor one

## Baseline policy

Compare against a persisted history, not only one fixed baseline. Save every result with
its commit and timestamp and keep it queryable: that is what locates the exact commit
introducing a gradual drift, which no isolated PR-to-PR diff reveals. Update the stored
baseline only from a green run on the trunk — a stale baseline that does not reflect
already-merged optimisations produces false positives indefinitely, until someone updates
it by hand.
