# Coordinated omission

## Define the observation process first

Coordinated omission occurs when the system being measured delays or suppresses future
measurements that should have occurred under the target arrival schedule. The observed sample is
then conditioned on the measured system being responsive. A simple closed-loop worker that sends
its next request only after the prior response is the canonical case.

The slow response is usually recorded. Missing are the arrivals—and therefore queue waits and
terminal outcomes—that the target workload model says would have occurred while the worker was
blocked. This can make latency look better and offered capacity look higher than under the intended
arrival process.

Not every closed-loop test is invalid. It correctly models a population where each user waits for
the prior result plus think time. It is invalid when interpreted as a fixed/open arrival workload
or when the production population contains enough independent users that the generator's finite
workers become the limiting feedback loop.

## Evidence packet

Record counters at each stage over the same monotonic interval:

```text
scheduled/offered → admitted by generator → started on wire → accepted by service
                  → completed / failed / timed out / cancelled
generator workers/VUs, event-loop lag, CPU, sockets and queue depth
```

A scheduled-versus-started deficit proves that the generator missed its schedule; it does **not**
alone prove coordinated omission. The cause may be generator CPU, connection limits, admission
policy or response-coupled workers. Correlate the deficit with worker state and response
completion. Conversely, equal counts do not prove validity if timestamps are shifted, bursts are
compressed after stalls, or client-side queue delay is excluded from “latency”.

Ask four questions:

1. What arrival model is the production hypothesis—closed, open, trace replay, or stateful mix?
2. Is issue time scheduled independently of prior completion?
3. Where does the latency clock start—scheduled time, generator queue, socket write, server
   receive, or handler entry?
4. What happens when the generator cannot keep up—drop, queue, burst later, add workers, or reduce
   rate?

Tools expose different signals. For k6 arrival-rate executors, inspect `dropped_iterations`, VU
limits and generator resource saturation; a nonzero value says the requested schedule was not
realised, not why. A closed-workload N-versus-2N run can reveal a concurrency/throughput knee, but
latency doubling with flat throughput is compatible with ordinary queue saturation and is not a
conclusive omission test.

## Prefer generation-time fidelity

Schedule arrivals independently when that is the production model, preallocate enough generator
capacity, and include client-side waiting from scheduled arrival to terminal outcome.

```javascript
export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
};
```

This configuration is a starting hypothesis, not proof: validate actual start timestamps,
`dropped_iterations`, generator CPU/event-loop lag, sockets and terminal counts. Open-loop load can
overwhelm a system exactly as production would; pair it with abort thresholds and a bounded blast
radius.

## HdrHistogram correction is a model, not recovered data

```java
histogram.recordValueWithExpectedInterval(latencyNanos, expectedIntervalNanos);
```

`recordValueWithExpectedInterval` adds synthetic values at expected-interval steps below an
observed long latency. It answers a counterfactual resembling “what would a regularly scheduled
single stream have observed during this stall?” It does not reconstruct actual arrival times,
concurrency, queue discipline, retries, drops or correlated service times. Results depend directly
on the chosen expected interval.

Use it when only omission-prone samples remain and the regular-interval model is defensible.
Report both uncorrected and corrected distributions, the interval and the model assumptions. Do
not apply correction again to measurements already scheduled independently, and do not merge
corrected and raw histograms as if they were the same population.

## Distributed and asynchronous forms

- A scheduled executor that suppresses/merges a run while the previous run is active measures
  completed jobs, not intended trigger latency.
- A consumer reporting handler time omits broker dwell and client prefetch queues; end-to-end age
  needs producer timestamp semantics and clock/error handling.
- A retry loop that starts its latency clock at each attempt omits backoff and failed attempts from
  user-perceived completion time.
- A circuit breaker or load shedder removes work from the success-latency histogram; those outcomes
  belong in the denominator and usually in a separate terminal-outcome view.
- A tracing sampler that preferentially retains errors/slow traces changes the observed
  distribution; weighted reconstruction requires known inclusion probabilities.

## Validation and failure injection

Inject a known pause or service-time step while arrivals remain scheduled. Verify that:

- offered/start timestamps retain the intended cadence until an explicit bounded drop policy;
- client queue time is included or separately reported;
- completed + failed + timeout + cancelled reconciles with admitted work;
- the histogram shows the expected queue/recovery shape rather than one long request only;
- generator saturation alarms before the generator becomes the bottleneck.

## Sources

- [HdrHistogram coordinated-omission support](https://github.com/HdrHistogram/HdrHistogram#correcting-for-coordinated-omission)
- [k6 arrival-rate executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [RFC 2330, Framework for IP Performance Metrics](https://www.rfc-editor.org/rfc/rfc2330)
- [Schroeder et al., “Open Versus Closed: A Cautionary Tale” (NSDI 2006)](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
