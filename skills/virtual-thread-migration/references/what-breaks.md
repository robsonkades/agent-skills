# What breaks quietly

These changes can be silent, throw immediately or surface later in another component. Audit
the required behavior rather than relying on the absence of an exception.

## Thread names, log correlation and metrics

An unnamed virtual thread has an **empty** `getName()` and prints as
`VirtualThread[#38]/runnable`.

Breaks: log patterns containing `%thread`, MDC populated from the thread name, metrics tagged
by thread name, log filters that select a pool's threads, and any dashboard grouped by thread.

```java
// Partial Java 21+ snippet: import java.util.concurrent.*; lifecycle owner must close exec.
// Use a stable role prefix; do not embed secrets or unbounded tenant cardinality.
ThreadFactory f = Thread.ofVirtual().name("checkout-", 0).factory();
ExecutorService exec = Executors.newThreadPerTaskExecutor(f);
```

Then check the logging pattern still produces something useful, and that anything grouping by
thread uses a dimension appropriate to the signal. Request/trace IDs can correlate logs;
metrics need bounded labels such as an endpoint template or role, not per-request IDs or
the unbounded numeric suffix of each thread name.

Thread naming does not propagate MDC, security context or transactions. Check capture at
submission and lexical restoration/cleanup, including exceptions, nested tasks and reused
platform executors. InheritableThreadLocal may copy sensitive state into many children.
Do not transfer a transaction-bound session to concurrent child tasks merely because they
are virtual; follow the framework's thread/transaction ownership contract.

## `ThreadLocal` that was a cache

```java
// Budget even at 200 pooled threads; much larger if 200 000 virtual threads initialize it.
private static final ThreadLocal<byte[]> BUFFER =
        ThreadLocal.withInitial(() -> new byte[1 << 20]);     // 1 MiB payload when first accessed
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
| Immutable lexical context  | Java 25 final `ScopedValue` when binding/lifetime semantics fit           |
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
costs one platform thread), or use an explicitly ordered per-key queue/consumer. A lock enforces
mutual exclusion, not submission order; sequence numbers need a defined gap/retry/reordering
policy before effects occur. Sorting results after unordered side effects cannot repair them.
What is not acceptable is discovering the property
existed after removing it.

A serial executor orders task bodies, not asynchronously detached effects after a body returns.
State whether the required order is submission, start, completion or external commit, and test
that exact boundary under failure/retry and while old/new executors overlap during rollback.

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
For example, Boot 3.5 documents virtual-thread auto-configuration conditional on Java 21+,
the enabling property and bean selection/backoff; custom executors can change the outcome.
Virtual threads are daemon threads, so verify application keep-alive and shutdown ownership
for scheduler/batch-only applications. Keep these checks distinct from choosing a framework flag.

## Tests

- Tests that assert on thread names, or count threads, or wait for a pool to become idle.
- Tests that relied on a single-threaded executor to make an async operation deterministic —
  now genuinely concurrent, and flaky.
- Tests using a `CountDownLatch` sized to the pool's thread count.
- Tests whose timing assumptions came from queueing behind a small pool.

These fail _sometimes_, which is worse than failing. Fix them by asserting on outcomes rather
than on scheduling — see `concurrency-testing`.

## Native and third-party libraries

A virtual thread cannot unmount across a native/foreign frame; blocking there can retain a
carrier, including callbacks into Java on JDK 24+. Native CPU work consuming a carrier is
not by itself a blocking defect. Measure duration/rate, scheduler pressure and SLO impact
before isolating a path on bounded platform execution; the handoff adds queueing and needs
deadline, rejection, context and lifecycle ownership.

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

Use the limit inventory to test missing-bound hypotheses and runtime evidence to discriminate
them from scheduler, allocation or provider effects; this ordering is not a frequency claim.

## Authoritative references

- [Java 25 virtual-thread guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `ScheduledThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html)
- [Java 25 thread-local variables](https://docs.oracle.com/en/java/javase/25/core/thread-local-variables.html)
- [JEP 444](https://openjdk.org/jeps/444)
- [Java 25 ReentrantLock fairness contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [Boot 3.5 task execution and scheduling](https://docs.spring.io/spring-boot/3.5/reference/features/task-execution-and-scheduling.html)
- [Boot 3.5 virtual-thread lifecycle guidance](https://docs.spring.io/spring-boot/3.5/reference/features/spring-application.html#features.spring-application.virtual-threads)
