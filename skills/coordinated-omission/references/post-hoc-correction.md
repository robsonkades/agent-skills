# Post-hoc correction of omission-prone data

Use HdrHistogram correction only when raw measurements are omission-prone, a regular expected
interval is a defensible counterfactual, and the experiment cannot be rerun. It generates a
sensitivity scenario; it does not reconstruct requests, concurrency or queue state that never
existed.

## First decide whether anything is mismatched

| Target question                                    | Closed-loop data fit?              | Reason                                                                 |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| One serial batch worker's item-time distribution   | Yes                                | the real population deliberately starts the next item after completion |
| Fixed population of users with measured think time | Yes, if configured equivalently    | interactive response law is the target model                           |
| Latency under an exogenous endpoint arrival rate   | No                                 | response time should not reduce scheduled arrivals                     |
| Maximum throughput at fixed concurrency            | Yes for that throughput experiment | do not relabel it latency at a fixed offered rate                      |
| Correctness test                                   | Usually irrelevant                 | timing distribution is not the claim                                   |

Closed-loop sample quantiles remain valid descriptions of the closed experiment. Correction is not
a ritual applied to every synchronous harness.

## What the HdrHistogram algorithm does

Conceptually, for an observed value `v` and positive expected interval `i`, it records `v` and
additional values `v−i`, `v−2i`, … while the value remains at least `i`:

```java
histogram.recordValueWithExpectedInterval(valueNanos, expectedIntervalNanos);
```

For `v=100 ms` and `i=10 ms`, the corrected histogram contains the original 100 ms observation and
synthetic 90, 80, …, 10 ms entries. This approximates what regularly spaced observations might
have experienced during one long stall. These entries are deterministic consequences of one raw
sample, not independent users; never use the inflated corrected count as statistical sample size.

HdrHistogram also exposes post-recording forms such as
`copyCorrectedForCoordinatedOmission(i)` and
`addWhileCorrectingForCoordinatedOmission(source, i)`. Consult the exact library version for range,
precision and exception behaviour. At-recording and post-hoc correction are mutually exclusive for
the same omission: applying both synthesises values twice.

The library's nonpositive expected interval disables synthetic additions; validate positivity
explicitly when the caller intends correction. Values below the interval still contribute their
original observation. Post-hoc correction works from histogram equivalent-value buckets, so it
need not be numerically identical to correcting raw values before quantisation.

The following calls require a stable `raw` histogram and an exclusively owned destination.
Plain `Histogram` is unsynchronized; copying it while another thread records or resets still
races. With live concurrent recording, obtain a `Recorder.getIntervalHistogram()` snapshot and
finish correction/export before returning that object for recycling. Each snapshot contains an
interval's counts, not a cumulative total; aggregate each interval once. General recording
ownership and histogram sizing are covered by `latency-statistics`.

```java
Histogram corrected = raw.copyCorrectedForCoordinatedOmission(expectedIntervalNanos);

Histogram aggregate = new Histogram(highestTrackableNanos, significantDigits);
aggregate.addWhileCorrectingForCoordinatedOmission(raw, expectedIntervalNanos);
```

In HdrHistogram 2.2.2, a corrected add can mutate earlier buckets before a later value fails
the destination's range check. Build corrections in a disposable, compatible destination
and publish only after success. On failure, discard/rebuild from raw input; blindly retrying
into the partially changed aggregate can count earlier additions again.

Keep an immutable/raw artefact. Persist:

- HdrHistogram version, value unit, range and significant digits;
- interval and why it represents the target arrival schedule;
- whether correction occurred during recording or after it;
- raw and corrected counts/distributions, clearly labelled;
- overflow/add failures and whether auto-resize was enabled.

Specify the population behind the interval. With independent serial workers, applying the
aggregate inter-arrival interval to every worker's long response can multiply hypothetical
arrivals. For example, ten workers each reporting a 100 ms stall with a 10 ms per-worker
interval synthesize 100 total entries; using the 1 ms aggregate interval creates 1000. Neither
count proves what users experienced. Preserve stream-specific assumptions and correct before
merging when interval models differ; do not infer an interval solely from completed throughput.

## Why this is not an open-loop replay

The correction assumes a regular interval and a linearly decreasing residual wait behind each long
observation. It knows none of the following:

- actual arrival jitter, bursts or time-varying rate;
- how many requests would have been admitted, rejected or timed out;
- service times and correlations of the hypothetical requests;
- finite queues, priorities, batching, backpressure or load shedding;
- retry/hedge traffic induced by slow responses;
- overlapping stalls and recovery capacity;
- state changes caused by the additional load itself.

Therefore it cannot predict a queueing system under the missing load. It can under- or overestimate
the target tail depending on those mechanisms. Vary plausible intervals and outcome assumptions;
if the decision changes, the historical data do not decide the question.

## Legacy event logs

If logs retain scheduled, actual-send and completion timestamps, analyse those clocks directly
before synthesising values. You may be able to recover schedule lag for sent requests and enumerate
missed schedule slots. If logs contain only send/completion pairs, any fill-in model must be labelled
counterfactual:

```python
def hdr_style_sensitivity(raw_latencies_ns, expected_interval_ns, max_samples):
    if expected_interval_ns <= 0 or max_samples <= 0:
        raise ValueError("positive interval and output budget required")
    emitted = 0
    for value in raw_latencies_ns:
        if value < 0:
            raise ValueError("negative latency")
        samples = max(1, value // expected_interval_ns)
        if emitted + samples > max_samples:
            raise ValueError("synthetic sample budget exceeded")
        for offset in range(samples):
            yield value - offset * expected_interval_ns
        emitted += samples
```

This Python 3 iterator illustrates integer-nanosecond arithmetic; it is not a histogram library.
Consume it fully and discard partial results on failure. The explicit output budget limits
synthetic expansion; this counterfactual can otherwise take work proportional to latency/interval.
Prefer the library API for HdrHistogram data because it preserves the
configured equivalent-value/precision semantics. Do not compare the synthetic empirical interval
as though its entries were independently observed.

## Decision table

| Evidence                                                       | Action                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Target was closed and raw clocks/counts are complete           | report raw closed-population result; no correction                                                 |
| Target was open, rerun is safe                                 | rerun with validated open scheduling and terminal-outcome accounting                               |
| Rerun impossible, expected interval well supported             | report raw plus corrected sensitivity and assumptions                                              |
| Arrival rate varied or burst pattern is material               | use trace/schedule-aware modelling if timestamps exist; otherwise mark result non-reusable         |
| Data already corrected or generator uses intended-start timing | do not apply Hdr correction again; verify exact semantics/version                                  |
| Production and test differ greatly                             | investigate workload, data, placement, clocks and omission; no p99-ratio threshold diagnoses cause |

## Semi-open systems

Open/closed is not exhaustive. Sessions/users may arrive exogenously while each session performs a
sequential journey—a semi-open structure. An open **user** injector can correctly model session
arrivals while requests inside each user remain sequential. Preserve both session-arrival and
request-stage clocks rather than forcing a single per-request Poisson schedule. The production
model, not a preferred load-tool feature, chooses the abstraction.

## Sources

- [HdrHistogram README: corrected versus raw recording](https://github.com/HdrHistogram/HdrHistogram#corrected-vs-raw-value-recording-calls)
- [HdrHistogram 2.2.2 implementation/Javadoc](https://github.com/HdrHistogram/HdrHistogram/blob/HdrHistogram-2.2.2/src/main/java/org/HdrHistogram/AbstractHistogram.java)
- [HdrHistogram 2.2.2 Recorder interval-snapshot ownership](https://github.com/HdrHistogram/HdrHistogram/blob/HdrHistogram-2.2.2/src/main/java/org/HdrHistogram/Recorder.java)
- [Schroeder et al., “Open Versus Closed: A Cautionary Tale” (NSDI 2006)](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
- [wrk2 constant-throughput/intended-start model](https://github.com/giltene/wrk2)
