# Sizing and adoption experiments

## Establish target facts

Record effective processor count, container CPU quota/period, throttled time, affinity/cpuset, memory
limit, JDK/vendor/build, stack flags, current executor configuration, offered/completed load,
service-time distribution, downstream ceilings and failure budgets. `availableProcessors()` is an
input reported by the runtime, not proof of usable sustained CPU.

## CPU parallelism sweep

At representative co-tenancy/data, test parallelism around 1, effective CPUs and modest multiples.
Measure:

- useful completed throughput and latency distribution;
- process/host CPU and container throttling;
- runnable queue/context switches;
- allocation/GC and memory bandwidth/cache/NUMA when relevant;
- lock/CAS contention and downstream occupancy.

Select the smallest parallelism that meets throughput/SLO with recovery headroom. If additional
threads stop improving throughput, identify the bottleneck before keeping them. CPU pools should
usually have small/controlled admission queues so stale work does not outlive its deadline.

## Blocking platform-pool experiment

Measure on-task CPU/service time separately from external wait. A candidate formula such as
`Ncpu × targetUtilization × (1 + wait/service)` assumes stable averages, independent tasks and a CPU
bottleneck. Validate a range because correlated waits, long tails, resource caps and burst traffic
violate those assumptions.

For each size, record queue age, timeout/cancellation, native thread memory, context switching,
dependency concurrency and useful throughput. Stop before downstream saturation even if local CPU is
idle.

## Virtual-thread adoption A/B

Compare the same task-per-request code and admission policy using current platform executor versus
virtual thread per task. Keep client pools/timeouts and load shape controlled. Measure:

- completed throughput and tail latency at rising concurrency;
- live/queued task and retained heap/thread-local state;
- scheduler parallelism/pool/mounted/queued estimates (Java 24+);
- CPU/throttling, native memory and GC;
- dependency/connection/file descriptor concurrency;
- cancellation residual work and shutdown drain.

A gain validates removal of platform-thread waiting scarcity only if resource health stays inside its
envelope. If latency rises because far more calls reach a fixed dependency, add/repair resource-local
admission instead of pooling virtual threads.

## Bounded production patterns

Application-lifetime executor:

```java
final class RequestExecutor implements AutoCloseable {
    private final ExecutorService tasks = Executors.newVirtualThreadPerTaskExecutor();

    Future<Response> submit(Request request) {
        return tasks.submit(() -> handle(request));
    }

    @Override public void close() {
        tasks.close(); // orderly and waiting; deployment grace must cover or escalate externally
    }
}
```

CPU phase isolation:

```java
// Size by experiment and use explicit bounded admission/rejection in production.
ThreadPoolExecutor cpu = new ThreadPoolExecutor(
        cores, cores, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(cpuQueueCapacity),
        new ThreadPoolExecutor.AbortPolicy());
```

Resource gate belongs directly around the provider operation, with remaining deadline and exactly-once
release; see `concurrency-limiting-and-bulkheads`.

## Thread-local review worksheet

For each `ThreadLocal`/`InheritableThreadLocal`, record value size, initialization cost, mutability,
cleanup, lifetime, inheritance/security implications, projected thread count and reuse expectation.

| Intent                                                | Candidate replacement                                           |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| immutable dynamic-scope context                       | Java 25 `ScopedValue`                                           |
| formatter/parser that has immutable modern equivalent | one shared immutable object                                     |
| expensive mutable reusable helper                     | bounded object pool only if profiling justifies; often redesign |
| connection/session/transaction                        | operation-scoped resource with deterministic close              |
| random/scratch tiny state                             | keep only after cardinality/memory review                       |

## Release and rollback

Roll out with a concurrency cap and compare canary to control by offered load, not raw instance
averages. Include rolling overlap in aggregate dependency capacity. Rollback criteria should name
resource wait, tail SLO, scheduler queue, memory and cancellation residuals. Ensure both old and new
executor lifecycles drain safely during mixed-version deployment.

## References

- [Java 25 `Executors`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
- [Java 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Java 25 virtual-thread adoption guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 thread-local guidance](https://docs.oracle.com/en/java/javase/25/core/thread-local-variables.html)
