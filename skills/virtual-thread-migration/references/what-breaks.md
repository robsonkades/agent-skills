# What breaks quietly

These changes can be silent, throw immediately or surface later in another component. Audit
the required behavior rather than relying on the absence of an exception.

## Thread names, log correlation and metrics

An unnamed virtual thread has an **empty** `getName()`; a diagnostic representation may look
like `VirtualThread[#38]/runnable`. Do not treat that example as a stable parser format.

Inspect log patterns containing `%thread`, MDC populated from thread names, thread-name labels,
pool-name filters and dashboards grouped by thread. Whether they fail or need replacement
depends on their actual contract and emitted data. Adequate request correlation need not be renamed.

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

Before replacing a per-thread buffer with a per-request one, preserve confinement, lifetime,
resource cleanup and ownership across concurrent children. Request scope alone does not make
mutable sharing safe. When allocation cost matters, compare actual initialized populations and
retained lifetimes; a correct replacement can still cause a GC regression.

## Ordering guarantees that came from a single thread

```java
// Partial snippet: task bodies run sequentially, but the queue is unbounded.
// The component owns shutdown; appendToLedger and entry are application-specific.
ExecutorService ordered = Executors.newSingleThreadExecutor();
ordered.submit(() -> appendToLedger(entry));
```

Per-task virtual threads remove that executor's sequential-task guarantee. If the ledger relies
on it and no other enforcement preserves the required effect order, concurrent effects can be
wrong without an immediate exception. Valid resource-side ordering or order-independent effects
can make the old serialization unnecessary; verify the actual contract before removing it.

Find them, and for each decide: keep the single-threaded executor (usually correct and
costs one platform thread), or use a demonstrated ordered queue/consumer/resource contract;
record a justified removal when order was never required. A lock enforces
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

## Pool metrics whose meaning changes

Dashboards and alerts built on `tomcat.threads.busy`, `executor.active`, `executor.queued`,
`executor.pool.size` may disappear, become zero, retain a valid producer, or change meaning.
Inspect the actual executor, instrumentation and alert rules; missing-series behavior depends
on those rules. Verify both the metric and the condition it is supposed to detect.

Preserve adequate signals and replace uncovered requirements in the affected change, using:

- in-flight requests from a verified existing instrument or an explicitly owned gauge
- available permits and wait time on each declared limit
- scheduler pool/mounted/queued estimates (Java 24+), so pressure is visible
- the connection pool's own metrics for actual resource utilization and waiting

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

Classify incidental scheduling assumptions separately from required ordering, exclusion and
lifecycle behavior. Keep tests for those actual contracts; replace brittle pool/name assumptions
with observable boundary assertions and controlled coordination — see `concurrency-testing`.

## Native and third-party libraries

A virtual thread cannot unmount across a native/foreign frame; blocking there can retain a
carrier, including callbacks into Java on JDK 24+. Native CPU work consuming a carrier is
not by itself a blocking defect. Measure duration/rate, scheduler pressure and SLO impact
before isolating a path on bounded platform execution; the handoff adds queueing and needs
deadline, rejection, context and lifecycle ownership.

A library may retain its own worker count while caller concurrency, queued demand, context
propagation or resource lifetimes change. Inspect its actual version/configuration and call
path; an unchanged pool factory is not evidence that the library is unaffected. Preserve
adequate internal limits and include their waiting and lifecycle boundaries in the inventory.

## Debuggers, profilers and agents

- `jstack`/traditional dumps do not list virtual threads. They remain useful for platform-thread
  lock ownership, but are incomplete for the application's virtual-thread population.
- Some profilers and APM agents sample platform threads only, or attribute virtual-thread
  work to carriers. Verify your specific agent version rather than assuming.
- `ThreadMXBean.findDeadlockedThreads()` detects platform-thread cycles, not virtual-thread
  cycles. Identify which required deadlock coverage is missing rather than treating an empty
  result as proof that the application has no deadlock.

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
- [Java 25 `Thread` contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html)
- [Java 25 executor factory contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
- [Java 25 `ScheduledThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledThreadPoolExecutor.html)
- [Java 25 thread-local variables](https://docs.oracle.com/en/java/javase/25/core/thread-local-variables.html)
- [JEP 444](https://openjdk.org/jeps/444)
- [Java 25 ReentrantLock fairness contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [Boot 3.5 task execution and scheduling](https://docs.spring.io/spring-boot/3.5/reference/features/task-execution-and-scheduling.html)
- [Boot 3.5 virtual-thread lifecycle guidance](https://docs.spring.io/spring-boot/3.5/reference/features/spring-application.html#features.spring-application.virtual-threads)
