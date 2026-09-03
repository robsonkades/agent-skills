# What breaks quietly

None of these throws. Each one changes behaviour that something else depended on, and the
symptom arrives later and elsewhere.

## Thread names, log correlation and metrics

An unnamed virtual thread has an **empty** `getName()` and prints as
`VirtualThread[#38]/runnable`.

Breaks: log patterns containing `%thread`, MDC populated from the thread name, metrics tagged
by thread name, log filters that select a pool's threads, and any dashboard grouped by thread.

```java
// Use a stable role prefix; do not embed secrets or unbounded tenant cardinality.
ThreadFactory f = Thread.ofVirtual().name("checkout-", 0).factory();
ExecutorService exec = Executors.newThreadPerTaskExecutor(f);
```

Then check the logging pattern still produces something useful, and that anything grouping by
thread now groups by something with meaning — a request id, an endpoint — because thread
identity is no longer a stable dimension when there is one thread per request.

## `ThreadLocal` that was a cache

```java
// Fine with 200 pooled threads. A memory multiplier at 200 000 virtual threads.
private static final ThreadLocal<byte[]> BUFFER =
        ThreadLocal.withInitial(() -> new byte[1 << 20]);     // 1 MB each
```

Other candidates for review include legacy mutable formatters/serializers, large buffers,
connections/sessions and inherited security context. Some modern clients/mappers are thread-safe and
should be shared; others require an explicit bounded pool. Decide from the API contract, not the
class category.

The fix depends on which property was wanted:

| Wanted                     | Replacement                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| Avoid allocation           | shared immutable/thread-safe instance, redesign, or measured bounded pool |
| Avoid contention           | a striped structure, or accept the allocation                             |
| Per-request context        | `ScopedValue`                                                             |
| Scarce resource per worker | an explicit pool with a size                                              |

Measure allocation before and after: replacing a per-thread buffer with a per-request one is
correct and can still be a GC regression worth knowing about.

## Ordering guarantees that came from a single thread

```java
// This is not "a pool of one". This is a serialisation point with a misleading name.
ExecutorService ordered = Executors.newSingleThreadExecutor();
ordered.submit(() -> appendToLedger(entry));
```

Replace it with per-task virtual threads and entries interleave. Nothing fails; the ledger is
wrong.

Find them, and for each decide: keep the single-threaded executor (usually correct and
costs one platform thread), or make the ordering explicit with a lock, a per-key queue, or a
sequence number the consumer sorts by. What is not acceptable is discovering the property
existed after removing it.

The same audit applies to scheduled/actor-like designs, but note that one periodic task submitted via
`scheduleAtFixedRate`/`scheduleWithFixedDelay` is already specified not to overlap with itself even in
a multi-thread scheduled executor. Distinguish that API guarantee from serialization between
different jobs.

## Pool metrics that go to zero

Dashboards and alerts built on `tomcat.threads.busy`, `executor.active`, `executor.queued`,
`executor.pool.size` keep reporting — a flat zero, or nothing at all. An alert on a metric
that no longer exists does not fire, and nobody notices until the incident it was meant to
catch.

Replace them, in the same change, with:

- in-flight requests (a gauge you now maintain yourself, because the pool no longer is one)
- available permits and wait time on each declared limit
- scheduler pool/mounted/queued estimates (Java 24+), so pressure is visible
- the connection pool's own metrics, which are now doing more of the work

## Framework adapters

Framework flags can change request, async and scheduled executors differently, and their defaults
change across versions. Inventory the effective runtime executor and framework version; do not infer
`@Async`/`@Scheduled` ordering or bounds from the request-thread flag. Route framework-specific
selection to `reactive-and-virtual-thread-selection` and official versioned documentation.

## Tests

- Tests that assert on thread names, or count threads, or wait for a pool to become idle.
- Tests that relied on a single-threaded executor to make an async operation deterministic —
  now genuinely concurrent, and flaky.
- Tests using a `CountDownLatch` sized to the pool's thread count.
- Tests whose timing assumptions came from queueing behind a small pool.

These fail _sometimes_, which is worse than failing. Fix them by asserting on outcomes rather
than on scheduling — see `concurrency-testing`.

## Native and third-party libraries

A library with a JNI backend pins the carrier for the duration of its native call, and
pinning is not compensated. Compression, cryptography, image processing, some database
drivers and some observability agents are the usual suspects. Isolate them on a sized
platform executor rather than hoping the scheduler absorbs it.

A library with its own internal thread pool is unaffected by your migration and keeps its own
limit — which is often a good thing, and always worth knowing about, because that limit is
now one of the few left.

## Debuggers, profilers and agents

- `jstack`/traditional dumps do not list virtual threads. They remain useful for platform-thread
  lock ownership, but are incomplete for the application's virtual-thread population.
- Some profilers and APM agents sample platform threads only, or attribute virtual-thread
  work to carriers. Verify your specific agent version rather than assuming.
- `ThreadMXBean.findDeadlockedThreads()` does not see virtual threads at all, so automated
  deadlock detection silently stops covering the majority of the application's threads.

## The order to check these in after an unexplained regression

1. Scheduler queued/pool/mounted estimates, CPU and pinning/capture evidence — is scheduling causal?
2. Connection-pool wait time — did the bottleneck simply move?
3. Heap and GC overhead — suspended stacks and per-request allocations
4. Downstream error rate — did we start overwhelming something?
5. Everything above — did a limit, an ordering guarantee or a metric disappear?

Most post-migration surprises are (2) or (5), and both are answered by the limit inventory
from Stage 1 rather than by profiling.

## Authoritative references

- [Java 25 virtual-thread guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `ScheduledThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html)
- [Java 25 thread-local variables](https://docs.oracle.com/en/java/javase/25/core/thread-local-variables.html)
- [JEP 444](https://openjdk.org/jeps/444)
