# Post-hoc correction of closed-loop data

Use this only when the data is **genuinely closed-loop** and the test cannot be re-run — a
legacy result set, historical logs with send and completion timestamps. It reconstructs what
the measurement lost. It is not equivalent to having run the test open-loop.

## When closed-loop needs no correction at all

| Scenario                                                                  | Closed-loop acceptable? | Why                                                                      |
| ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| Maximum throughput of a serial pipeline (batch job, one record at a time) | Yes                     | No latency-at-a-rate claim is made; the ceiling _is_ `N/R`               |
| Latency of a system at a production target rate                           | No                      | Exactly the case the distortion applies to                               |
| Correctness or functional testing                                         | Irrelevant              | Latency is not in question                                               |
| Estimating a throughput ceiling to size a pool                            | With caveat             | Fine for the ceiling; **not** for reporting latency percentiles under it |

Where closed-loop is acceptable, still use HdrHistogram for the percentiles of what was
actually measured — just do not apply, or claim, a correction. There is nothing to correct
when independent arrivals were never being simulated.

A single-threaded batch pipeline that reads one record, processes it, and only then reads the
next is the clearest case: `N = 1` reflects the system's real concurrency, not a limitation of
the generator, so its p99 is valid as measured.

## The algorithm

```java
void recordValueWithExpectedInterval(long value, long expectedInterval) {
    recordValue(value);
    long missingValue = value - expectedInterval;
    while (missingValue >= expectedInterval) {
        recordValue(missingValue);
        missingValue -= expectedInterval;
    }
}
```

Worked: expected interval 10 ms (a 100 req/s target), measured value 100 ms. It records the
100 ms itself and inserts nine synthetic values — 90, 80, 70, … 10 ms — approximating the nine
requests that, at 100 req/s, should have arrived during that 100 ms window and never were.

Every synthetic value is strictly smaller than `value`, so the correction can never raise the
histogram's MAX above the largest raw sample already collected. That is a second, independent
route to the same conclusion: MAX is not what this correction exists to fix.

## Applying it to an existing HdrHistogram

When the raw data is already an HdrHistogram — an `.hlog` from `HistogramLogWriter`, a
serialised `Histogram` — do not re-derive the loop. The library ships the post-hoc form:

```java
Histogram raw = HistogramLogReader.read(...);          // or the in-memory histogram
long expectedIntervalNs = 1_000_000_000L / targetRatePerSecond;

Histogram corrected = raw.copyCorrectedForCoordinatedOmission(expectedIntervalNs);

// Or fold several raw histograms into one corrected aggregate:
Histogram aggregate = new Histogram(raw.getNumberOfSignificantValueDigits());
aggregate.addWhileCorrectingForCoordinatedOmission(raw, expectedIntervalNs);
```

The javadoc states the rule that matters: the at-recording method
(`recordValueWithExpectedInterval`) and the post-hoc methods "are mutually exclusive, and
only one of the two should be used on a given data set". A histogram recorded by wrk2 or
by any harness that already corrected at recording time must not be passed through
`copyCorrectedForCoordinatedOmission` — the synthetic samples would be synthesised again,
and the tail density overestimated. Keep the raw histogram and label which correction was
applied, once.

## Applying it to a legacy log

```python
expected_interval_ns = int(1e9 / target_lambda)     # the rate the test was TRYING to hit
latencies = [t_completed - t_sent for t_sent, t_completed in events]

def apply_co_correction(latencies, expected_interval_ns):
    corrected = []
    for lat in latencies:
        corrected.append(lat)
        missing = lat - expected_interval_ns
        while missing >= expected_interval_ns:
            corrected.append(missing)
            missing -= expected_interval_ns
    return sorted(corrected)
```

Report both the raw and the corrected p99, labelled as such. The corrected figure is an
approximation, and presenting it as if the test had been run open-loop is the same error one
level up.

## Comparing a historical test against production

When production percentiles exist for the same endpoint at a comparable rate:

```python
ratio = p99_production / p99_loadtest
# > 5  : the historical load test almost certainly omitted; do not reuse its numbers
# 2..5 : significant discrepancy — investigate omission and environment differences
# < 2  : coherent — the load test was probably representative
```

This is often the cheapest available evidence, because it needs no re-run and no access to the
old generator's configuration.

## Where the reconstruction breaks

The correction assumes the omitted requests would have been spaced uniformly by
`expectedInterval` — a first-order approximation. In a real queue, each victim's wait does not
decay perfectly linearly: it depends on arrival order relative to the start of the stall and on
the service time of the requests ahead of it, which is itself variable.

For an **isolated** stall against an empty queue, the linear approximation is close to exact.
For **overlapping** stalls — a second pause beginning before the first one's queue has drained
— it systematically **underestimates** the tail, because it does not model pile-up between
consecutive events. That is the regime of a generational collector under high allocation
pressure, where young pauses can recur faster than the queue they create drains.

## A further caution once the omission is gone

The open/closed dichotomy is a deliberate simplification. The literature distinguishes a third,
**semi-open** (partially open) model: a finite number of users each generating a session, with
new users arriving independently of how many are already active — the closest model to real web
traffic. Schroeder, Wierman and Harchol-Balter, _Open Versus Closed: A Cautionary Tale_ (NSDI
2006), show that the choice between the three can completely invert the conclusion of a systems
evaluation. Having moved from closed-loop to open-loop, it is still worth asking whether pure
open-loop is the right model for the traffic being simulated.
