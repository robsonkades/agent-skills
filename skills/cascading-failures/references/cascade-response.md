# Recognising and stopping a cascade in progress

## Is it a cascade?

Three incidents look the same on a top-level error-rate graph. They need opposite responses,
and the distinguishing evidence is cheap to collect.

| Observation                                 | Dependency outage      | Under-provisioning       | Cascade                              |
| ------------------------------------------- | ---------------------- | ------------------------ | ------------------------------------ |
| Dependency inbound request rate             | flat or falling        | rising with traffic      | **rising while success rate falls**  |
| Goodput as offered load rises               | flat                   | rises, then plateaus     | **falls**                            |
| Attempts ÷ logical calls                    | ~1.0                   | ~1.0                     | climbs toward the attempt multiplier |
| Pool utilisation in services not calling it | normal                 | normal                   | **pinned at 100%**                   |
| Queue depth / time-in-queue                 | normal                 | rising, bounded          | rising without bound                 |
| Errors after the trigger is removed         | stop                   | stop                     | **continue** (metastable)            |
| Blast radius                                | matches the call graph | matches the hot endpoint | **wider than the call graph**        |

Two of these are decisive on their own. _Inbound rate rising while success rate falls_ can
only be retry amplification — organic growth raises both. _Pool utilisation at 100% in a
service that does not call the failing dependency_ proves the failure has propagated through
a shared resource rather than through a call.

The metric to add before the next incident, if it is missing: **goodput** — responses
delivered within the caller's deadline — plotted next to throughput. Their divergence is the
cascade, made visible in one graph.

## Intervention order

Work top to bottom. Each step reduces offered load; stop when goodput starts rising.

1. **Trip or force-open breakers on the failing dependency.** Converts a slow failure into a
   fast one and returns the held threads and connections immediately. Cost: everything with
   no fallback now errors fast instead of slowly. Mechanism: `circuit-breakers`.
2. **Cut retries.** Set attempts to 1 at the layer that retries, or empty the retry budget.
   This is usually the largest single reduction because the multiplier is compounding across
   layers. Policy: `retries-and-backoff`.
3. **Shed at the entry point, non-uniformly.** Reject the lowest-priority classes first and
   the oldest queued requests first — they are closest to their deadline and least likely to
   still be wanted. Mechanism and priority classes: `rate-limiting-and-load-shedding`.
4. **Cap concurrency at the saturated resource.** A bound in front of the pool converts an
   unbounded wait into a countable rejection. Mechanism:
   `concurrency-limiting-and-bulkheads`.
5. **Reduce per-hop timeouts on the failing dependency** so threads return sooner. This is
   the one timeout change that helps: it lowers concurrency at the dependency by shortening
   `W` in `L = λ × W` (`littles-law-and-queueing`).
6. **Disable non-critical work on the request path** — enrichment calls, recommendation
   fetches, synchronous audit writes. This is only available if criticality was decided in
   advance; see `cutting-the-loop.md`.

## What deepens it

- **Adding replicas.** New instances start with cold caches, unfilled pools and uncompiled
  code, take a full share of the backlog immediately, saturate, and become another source of
  timeouts and retries against the same dependency. Capacity helps before the loop closes,
  not after.
- **Raising timeouts.** Each in-flight call now holds its thread and connection longer, so
  concurrency at the dependency _rises_. The dependency gets slower, which is the loop.
- **Retrying harder**, including a manual "just re-run it" from an operator or a support
  tool. The dependency's problem is arrival rate.
- **Rolling restarts of the whole fleet**, which synchronise cache fills and reconnects.
- **Clearing caches** as a reflex. `FLUSHALL` during an incident removes the only thing
  holding load off the dependency (`caching-strategies`).
- **Widening a health check** to unstick pods. A readiness probe that consults the failing
  dependency removes healthy instances and concentrates load on the rest.

## Recovering from a metastable state

The system is metastable when the trigger has been removed, load is at or below its normal
level, and the system is still failing. Waiting does not exit this state.

1. **Stop the input.** Reject at the edge, or scale the consumer group to zero, or drain the
   ingress. Full rejection is a legitimate and often the fastest step: it is the only way to
   let a backlog burn down without new work replacing it.
2. **Destroy the backlog deliberately, and say what was destroyed.** Purge the queue, skip to
   the head of the log, or expire the requests whose deadline has passed. Work older than its
   caller's deadline is already waste; completing it is strictly worse than dropping it (that
   pattern is `distributed-failure-catalogue`, the queue semantics are
   `task-queues-and-competing-consumers`). If the work is not discardable, move it to a
   separate queue and process it after recovery at a rate you choose.
3. **Restart cold components in stages**, not all at once, with jitter between instances.
4. **Ramp admission back**, e.g. 10% of normal, then double while goodput keeps rising. The
   ramp is the mechanism that prevents the thundering herd on recovery — the backlogged
   clients all retry the instant the first success appears.
5. **Watch goodput and the dependency's inbound rate**, not error rate. Error rate falls as
   soon as you reject fast, which looks like recovery and is not.

## Recording it

Capture, before the evidence rotates out: the amplification point, the attempts-per-logical-
call ratio at peak, which lever moved goodput first, and how long the metastable state
persisted after the trigger cleared. The last number is the argument for the design controls
in `cutting-the-loop.md`.
