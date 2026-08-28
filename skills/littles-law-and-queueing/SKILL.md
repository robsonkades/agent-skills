---
name: littles-law-and-queueing
description: >
  Sizing and capacity from Little's Law (N = λ × R) and queueing theory: separating service
  time from queue time, why latency explodes above ~80% utilisation, thread pool and
  executor sizing, bounded queues and rejection policy. Use when choosing a pool size, when
  latency is high while CPU is low, when latency grows over the duration of a run, when
  someone proposes adding threads to a CPU-bound path, or when a ThreadPoolExecutor is not
  growing past its core size. Does not cover the statistics of the latency numbers
  themselves (latency-statistics), database pool specifics (connection-pool-sizing), or
  virtual-thread mechanics (thread-sizing-and-virtual-threads). Model selection and fitting
  is queueing-models, the scalability model is universal-scalability-law, and forecasting is
  capacity-planning.
---

# Little's Law and Queueing

## Purpose

Turn throughput, latency and concurrency into one equation that can be checked. `N = λ ×
R` — average concurrency equals arrival rate times residence time. It holds in steady
state and assumes nothing about distributions, which makes it first a **sanity check**
and only second a sizing formula: if measured `N`, `λ` and `R` do not reconcile, one of
the measurements is wrong.

The failure this prevents is capacity reasoning by intuition — adding threads to a
saturated CPU, sizing a database pool from the number of request threads, or reading 90%
utilisation as "10% of headroom left".

## Workflow

1. **Establish steady state.** The law is false outside it. If the queue is growing, `R`
   is not converging and any number you read is a snapshot of a transient.
2. **Measure `N`, `λ` and `R` independently and reconcile them.** The most common
   discrepancy is an APM reporting service time `S` where the law needs residence time
   `R = S + W`; that makes p99 look optimistic exactly under load.
3. **Decide whether you are waiting or working.** High CPU with `RUNNABLE` threads is
   CPU-bound. Low CPU with threads parked or blocked is a queue — and no amount of code
   optimisation on `S` will move `R` while `W` dominates.
4. **Size each pool with the `R` of its own component**, never with `R_total`.
5. **Check the resulting utilisation.** `N_needed / N_configured` must land at or below
   0.75–0.80 for a latency SLO.
6. **Bound every queue and choose the rejection policy deliberately.**

## Rules

- For CPU-bound work the optimum is near `N_cpus`. Extra threads buy context switching,
  cache-working-set invalidation and memory-bandwidth contention — throughput falls and
  latency rises.
- Size a downstream pool with that component's residence time:
  `N_db = N_threads × (R_db / R_total)`. Using `R_total` oversizes it in exact proportion
  to the time the request spends _not_ in that component.
- 90% utilisation is not efficiency, it is the cliff: under M/M/1 total latency is 10× the
  service time, and +10% load becomes +200% latency. Healthy systems sit between 50% and
  70% on the critical resource.
- Near saturation, capacity returns are super-linear: doubling capacity at 80%
  utilisation takes latency from 5.0×S to 1.19×S — a 4.2× improvement, not 2×.
- Model bimodal service times as two paths and sum their utilisations. A 1% slow path at
  500 ms against a 10 ms typical path owns a third of the utilisation.
- Never use an unbounded queue. It does not remove the limit; it trades "reject fast" for
  "fail slowly", with a client timeout and a server `OutOfMemoryError`.
- `ThreadPoolExecutor` enqueues before it grows. With an unbounded queue,
  `maximumPoolSize` is dead configuration and is never reached.
- `CallerRunsPolicy` does not block the producer — it runs the task on the calling
  thread. Accept the three consequences (the caller stops doing its own work, ordering is
  lost, and an event loop or I/O thread would be blocked) or reject with 429 instead.
- The law applies to GC too: `N_gc = λ_alloc × R_gc`. Live set is governed by object
  **lifetime**, not allocation rate.

## References

- [Sizing worksheet](references/sizing-worksheet.md) — the calculations for thread pools,
  downstream pools and safety factor, with the ThreadPoolExecutor growth rule and a
  bounded-queue configuration. Read when choosing or reviewing a pool size.
- [Reading the utilisation curve](references/utilisation-curve.md) — M/M/1 and Erlang-C
  numbers, the Universal Scalability Law knee, and how to diagnose saturation from CPU
  and thread state. Read when latency is high and the cause is not yet known to be code.
