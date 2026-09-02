# Comparing two latency measurements

Read at step 6, when the question is "did the p99 change" — a before/after deploy, a flag
change, an A/B of two builds. The failure this prevents is a decision made on two numbers
that were never shown to be different: a p99 from one run has no error bar, and the tests
people reach for answer a different question than the one asked.

## Why the usual tools answer the wrong question

| Tool                          | What it actually tests                                                      | Why it fails for a percentile                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two p99 values, eyeballed     | Nothing — a single run yields one number with no variance                   | The run-to-run spread of a p99 was never measured, so there is no way to tell whether the difference exceeds it                                                                                                                                |
| Student's t on raw samples    | Whether two **means** differ, assuming roughly normal, independent samples  | Latency is right-skewed and heavy-tailed, so the mean is dominated by the tail you are not asking about; samples inside one run are autocorrelated (queueing), so the effective `n` is far below the sample count and the p-value is too small |
| Welch's t on per-run p99s     | Whether the mean of per-run p99s differs                                    | Legitimate only with enough runs (≥ 5 per side) and with the caveat that per-run p99s are themselves skewed; the least-wrong parametric option, not a free pass                                                                                |
| Mann–Whitney U on raw samples | Whether one distribution is stochastically larger than the other (the bulk) | A p50 shift with an unchanged tail is "significant"; an unchanged bulk with a doubled p99 can be "not significant". It is a shift test, not a tail test, and it inherits the autocorrelation problem                                           |
| Kolmogorov–Smirnov            | Whether the two CDFs differ anywhere                                        | Most sensitive near the median, weakest in the tail — the opposite of what a p99 question needs                                                                                                                                                |

"Did p99 change" is a question about one order statistic near the edge of the sample. The
honest answers come from repeating the whole experiment, or from resampling within it with
the conditions below.

## Minimum samples for a tail percentile

The expected number of observations **above** the p-quantile is `n × (1 − p)`. Below about
10 of them, the percentile is an order statistic within a handful of the maximum, and the
maximum is a single event. Distribution-free 95% intervals for the true quantile, expressed
as ranks from the top (binomial order statistics, computed):

| `n`     | p99                | p99.9                 | p99.99                |
| ------- | ------------------ | --------------------- | --------------------- |
| 1,000   | 3rd–16th largest   | undefined (≤ 1 above) | undefined             |
| 10,000  | 80th–119th largest | 3rd–16th largest      | undefined (≤ 1 above) |
| 100,000 | ±~20% of the rank  | 80th–120th largest    | 3rd–16th largest      |

Reading: with 10,000 samples the true p99.9 could be anywhere between the 3rd and the 16th
slowest request. The rule that follows: **`n × (1 − p) ≥ 100` before quoting the percentile as
a number, `≥ 10` before quoting it at all.** For p99.9 that is 100,000 samples — at 100 req/s,
seventeen minutes of steady load per side.

## Method A — replicate the experiment

1. Run each configuration **≥ 5 times**, interleaved (A B A B …) so drift in the host, the
   network or the database affects both sides equally. Same warm-up rule, same dataset, same
   open-loop rate.
2. Compute the percentile **per run**. Report the median and range of the per-run p99s.
3. Decide from the ranges first: two ranges that do not overlap are a difference at any
   reasonable confidence; two that overlap substantially are "the experiment did not
   decide", not "no difference".
4. When the ranges partially overlap and a decision is still needed, Mann–Whitney U **on the
   per-run p99s** (5 vs 5 has a minimum attainable two-sided p of about 0.008, so fewer runs
   cannot reach 0.01), or a bootstrap of the difference of medians of the per-run p99s.

This is the Kalibera–Jones design: repetition at the level where the variance actually lives
(the run), not at the level that is cheap (the sample).

## Method B — bootstrap the percentile within a run

For one run per side when replication is impossible (a production window, an incident):

```text
for b in 1..2000:
    resample n latencies with replacement from run A  → p99_A[b]
    resample n latencies with replacement from run B  → p99_B[b]
    diff[b] = p99_B[b] − p99_A[b]
CI95 = (2.5th, 97.5th percentile of diff)
```

Report the interval, and decide on whether it excludes zero **and** whether it excludes the
SLO-relevant size — a 3 ms shift that is statistically real is not a regression against a
300 ms budget.

Validity conditions, which are why this is Method B and not A:

- `n × (1 − p)` must be in the hundreds. The bootstrap of an extreme quantile is inconsistent
  when only a few observations sit above it — resamples keep returning the same handful of
  values and the interval is spuriously narrow.
- Samples inside a run are not independent. Use a **block bootstrap** (resample contiguous
  blocks of about one second of traffic rather than individual latencies) or the interval is
  too narrow by roughly the autocorrelation factor.
- Resample from the raw samples or from an HdrHistogram at full precision, never from a
  bucketed Prometheus histogram — the bucket edges become the only values a resample can
  take.

## Reporting

```text
✅ p99 before 212 ms (5 runs: 198–231), after 247 ms (5 runs: 240–262); ranges disjoint.
   n per run ≈ 120,000. Regression of +35 ms (≈ +17%), open-loop 200 req/s, warm-up excluded.
❌ p99 went from 212 ms to 247 ms.
```

A percentile difference reported without the per-run spread or an interval is a hypothesis.
Turning it into a CI gate is `performance-regression-ci`.

## Sources

- Kalibera, T. and Jones, R. — _Rigorous Benchmarking in Reasonable Time_ (ISMM 2013): the
  repetition-level design and why sample-level variance is the wrong thing to estimate.
- Georges, A., Buytaert, D. and Eeckhout, L. — _Statistically Rigorous Java Performance
  Evaluation_ (OOPSLA 2007): the JVM-specific case for multiple invocations and confidence
  intervals over single-run numbers.
- Efron, B. and Tibshirani, R. — _An Introduction to the Bootstrap_ (1993), including the
  failure of the percentile bootstrap at extreme quantiles.
- Conover, W. J. — _Practical Nonparametric Statistics_: distribution-free confidence
  intervals for a quantile from order statistics (the table above).
- Tene, G. — _How NOT to Measure Latency_ (talk), on why a percentile without its sample
  count is unfalsifiable.
