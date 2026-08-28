# Coordinated omission

## What it actually is

Coordinated omission is not "the slow response was not recorded". The slow response _is_
recorded. What goes missing are the requests that **should have been issued while it was
in flight** and never were, because the measuring loop was blocked waiting.

The consequence is that it misleads in two directions at once:

- **Tail latency is underestimated** — the requests that would have queued behind the
  slow one were never sent, so their waiting time never appears.
- **Capacity is overestimated** — the generator throttled itself to match the server,
  so the reported throughput is the server's capacity under an artificially cooperative
  arrival pattern.

## Detection

The conclusive signal is the **sample count**: compare requests _planned_ by the schedule
with requests _actually issued_. A deficit is coordinated omission. Everything else is
circumstantial.

- k6: `dropped_iterations` must be `0`, and `vus` must stay below `maxVUs`.
- The `p99/p50 > 3` heuristic is weak evidence in both directions — the ratio is low both
  in an omission-affected test and in a healthy system far from saturation.
- The N vs. 2N test is conclusive for the closed-loop case: run the same test with N and
  2N virtual users. If throughput does not move and latency doubles, the generator is in
  charge, not the server.

## Correction

Two independent options, and they solve it at different layers:

```java
// At recording time: HdrHistogram fills in the requests that were owed
histogram.recordValueWithExpectedInterval(latencyNanos, expectedIntervalNanos);
```

```javascript
// At generation time: open-loop injection by schedule, not by response
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

Generation-time correction is preferable: it measures the system under the arrival
pattern it actually faces. Recording-time correction reconstructs what the measurement
lost, which is better than nothing but is still an inference.

## Where else it appears

Any fixed-rate producer that blocks on its consumer has the same structure — a scheduled
job that skips a run because the previous one is still going, a queue consumer measuring
handling time rather than time in the queue. The question to ask is always the same: was
the next observation delayed _by_ the observation being measured?
