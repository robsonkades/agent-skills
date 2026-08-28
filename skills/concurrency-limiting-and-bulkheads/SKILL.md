---
name: concurrency-limiting-and-bulkheads
description: >
  Bounding in-flight work with semaphores and bulkheads: the difference between a
  concurrency limit, a rate limit and a queue limit, why Little's Law is the only thing
  connecting them, placing one limit per scarce resource, partitioning so one caller or
  dependency cannot consume the whole budget, and why a Semaphore bounds one JVM and not a
  cluster. Use when a virtual-thread executor replaced a pool and nothing bounds the fan-out
  any more, when a semaphore is described as a rate limiter, when one global limit protects
  several dependencies, when acquire has no timeout, when a permit is released outside a
  finally block, when a limit was divided by the replica count and autoscaling changed it,
  or when a downstream reports more concurrency than the limit allows. Not the queueing
  arithmetic (littles-law-and-queueing), database pool sizing (connection-pool-sizing),
  retry amplification (retries-and-backoff), how long to wait (timeouts-and-deadlines), or
  demand inside a reactive pipeline (reactive-backpressure).
---

# Concurrency Limiting and Bulkheads

## Purpose

Make the amount of work in flight a number the system chooses, rather than a number that
emerges from whatever the callers happen to send. Every stable system has such a number
somewhere; the question is only whether it was designed, inherited from a thread pool, or
discovered during an incident.

This matters more after adopting virtual threads, because the thread pool that used to
impose the limit as a side effect is gone. Removing it was the point; failing to replace it
is how a migration turns a slow service into a broken dependency.

## Workflow

1. **Name the scarce resource.** Not "the service" — the specific thing that runs out: a
   connection pool, a downstream quota, a licence count, memory held per in-flight request.
2. **Choose which of the three limits you actually need.** They are not
   interchangeable and most systems need two of them.
3. **Put the limit immediately around the resource**, not at the edge of the application. A
   limit at the edge protects everything equally badly.
4. **Size it** from the resource's own capacity and Little's Law, then check the implied
   rate at both the fast and the slow latency the dependency actually exhibits.
5. **Bound the wait for a permit.** `tryAcquire(timeout)` converts overload into a fast,
   countable rejection; a plain `acquire()` converts it into an unbounded queue with no
   metric.
6. **Partition it** if one tenant, one endpoint or one dependency being slow must not
   consume the budget of the others.
7. **Multiply by the replica count** and compare against what the dependency published. A
   per-JVM limit is a per-JVM limit.

## The three limits

```text
Concurrency limit   how many at once        Semaphore, pool size, scope of in-flight work
Rate limit          how many per second     token bucket, leaky bucket, the dependency's quota
Queue limit         how much waiting work   bounded queue + a rejection policy
```

Little's Law is the only bridge between the first two: `rate = concurrency ÷ latency`. Ten
permits allow 1 000 requests per second at 10 ms latency and 10 per second at 1 s latency —
the same limit, two orders of magnitude apart, decided by the dependency's behaviour rather
than yours. That is why **a semaphore is not a rate limiter**, and why a system that must
honour "1 000 calls per minute" needs a token bucket regardless of how many permits it holds.

## Rules

- One limit per scarce resource, placed next to it. A single global limit shared by three
  dependencies means the slowest one starves the other two — which is precisely the failure
  a bulkhead exists to prevent.
- **Always `try { … } finally { release(); }`.** A permit leaked on an exception path is
  permanently gone; the limit silently ratchets down until nothing gets through, and the
  symptom appears hours after the code that caused it.
- Use `acquire()` (interruptible), not `acquireUninterruptibly()`, on any cancellable path,
  or a cancelled request keeps waiting for a permit it will never use.
- `tryAcquire(timeout, unit)` is usually the right call: it makes the wait explicit, and its
  `false` return is the shedding decision. Count it. An unbounded `acquire()` on a request
  path is an invisible queue in front of a visible one.
- `Semaphore(1)` is **not** a lock: it is not reentrant, so a re-entering call deadlocks
  against itself, and any thread may release a permit it never acquired. For mutual
  exclusion use `synchronized` or `ReentrantLock`.
- Fairness (`new Semaphore(n, true)`) gives FIFO and prevents starvation at a measurable
  throughput cost. Default barging is right for uniform short work; fairness earns its cost
  when hold times vary widely and tail latency matters.
- If the resource already has a bound — a connection pool, an HTTP client's
  `maxConnectionsPerRoute` — that bound is the limit. Wrapping it in a semaphore of the same
  size adds a second queue and a second place to be wrong; a semaphore _smaller_ than the
  pool is a deliberate reservation, and worth saying so in a comment.
- A `Semaphore` bounds one JVM. Actual concurrency at the dependency is
  `limit × replicas`, and that product changes every time the deployment scales. Design the
  number against the product, and re-derive it when the replica count changes.
- Retries consume permits. A limit plus an aggressive retry policy under overload amplifies
  load rather than shedding it; the retry budget belongs to `retries-and-backoff` and has to
  be decided together with this number.
- Instrument four things: permits available, time spent waiting for a permit, rejections,
  and the ratio of the two ends (`inFlight / limit`). The wait time rises before the
  rejections start, which makes it the alertable signal.
- A limit is only load shedding if what happens on rejection is defined: a 429 with
  `Retry-After`, a cached answer, a degraded response. "Throw and let it bubble" turns a
  designed limit into a 500.
- Adaptive limits (AIMD, gradient algorithms) are worth reaching for only when the
  dependency's ceiling genuinely varies and you have latency feedback to drive them. They
  replace one number you must maintain with a controller you must tune; start with the
  static number and a metric.

## References

- [Choosing and placing the limit](references/limit-selection.md) — the decision table, the
  sizing arithmetic worked through, where the limit goes for each resource type, bulkhead
  partitioning by tenant and by dependency, and the code patterns including the permit
  wrapper and the rejection path. Read when adding or reviewing a limit.
- [Limits across replicas](references/distributed-limits.md) — why per-JVM limits do not
  compose, the division strategies and what breaks each one, coordination options with their
  costs, autoscaling interaction, and treating the dependency's own limit as authoritative.
  Read when the limit must hold for the cluster rather than the process.
