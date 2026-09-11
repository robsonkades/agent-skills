# Sizing and adoption experiments

## Establish target facts

Record effective processor count, container CPU quota/period, throttled time, affinity/cpuset, memory
limit, JDK/vendor/build, stack flags, current executor configuration, offered/completed load,
service-time distribution, downstream ceilings and failure budgets. `availableProcessors()` is an
input reported by the runtime, not proof of usable sustained CPU.
Quota/period is a CPU-equivalent ceiling, possibly fractional, further constrained by affinity,
ancestor quotas and contention. Reserve measured capacity for GC/JIT and other work; do not
multiply a host-core count by a utilization target and call it the application's CPU budget.

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

Let `C` be mean CPU seconds per task and `W` mean blocked seconds occupying a platform worker,
excluding time waiting to enter that worker pool and runnable time waiting for CPU. With available task CPU budget `B` in
CPU-equivalents, `threads ≈ B × (1 + W/C)` is a saturation hypothesis for stable independent work,
not an SLO guarantee. `C` is not total service/residence time and must be positive. For `B=1.5`,
`C=0.010 s`, `W=0.090 s`, the candidate is 15 workers and CPU ceiling about 150 tasks/s.
Demand of 300 tasks/s is infeasible under those assumptions; extra threads do not double CPU.
At a completed rate `X`, task CPU demand is `X*C` CPU-equivalents and utilization of this budget
is `X*C/B`; mean occupied workers are approximately `X*(C+W)` under the same assumptions.
These are occupancy/capacity checks, not configured pool-size recommendations. If wall time minus
CPU time includes quota throttling, run-queue delay or stop-the-world pauses, separate those causes
before treating it as `W`. Serialized lock or provider waits also need their own capacity model.
Validate a range because correlated waits, long tails, resource caps and burst traffic
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

A gain with resource health inside its envelope is consistent with removing platform-thread waiting
scarcity; use thread/CPU profiles and controlled variables before attributing the cause. If latency
rises because far more calls reach a fixed dependency, add/repair resource-local
admission instead of pooling virtual threads.
Compare matching request populations, outcomes and load windows across repeated runs. Report
rejection, timeout and success rates alongside latency; faster successful requests alone can hide
lost work. After overload subsides, verify that backlog, residual work and resource occupancy recover.
Keep the current execution model when it already meets the contract and the measured benefit is absent.

## Lifecycle and admission sketches

Partial snippets: import `java.util.concurrent.*`; supply application `Request`, `Response`,
`handle`, and measured positive `cores`/`cpuQueueCapacity`. The first needs Java 21+, the
platform-pool snippet compiles on Java 17. They do not implement a complete admission policy.

Application-lifetime executor (task count is unbounded here):

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
This replacement assumes independent tasks: preserve any ordering/state-confinement guarantee of the
old executor. A concurrency cap alone does not establish ordering or thread affinity.
The request executor still needs bounded ingress; parking unlimited requests on a resource semaphore
does not bound retained heap. `close()` has no timeout and must be called by the lifecycle owner,
not by one of the executor's own tasks. Cancellation/interrupt is a request, not proof of task
termination. Observe completion/failure of submitted Futures; orderly close does not report their
task exceptions. A bounded CPU queue rejects via `AbortPolicy`; handle rejection and shut down that
executor explicitly, including during partial application startup failure.

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
- [Java 25 `ExecutorService.close`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html#close()>)
- [Java 25 `Future.cancel`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html#cancel(boolean)>)
- [Java 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Java 25 virtual-thread adoption guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 thread-local guidance](https://docs.oracle.com/en/java/javase/25/core/thread-local-variables.html)
