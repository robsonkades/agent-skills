# Concurrency versus parallelism

```text
concurrency: multiple operations overlap in lifetime or progress
parallelism: multiple operations execute simultaneously
capacity: sustainable useful completion rate under resource/SLO constraints
```

## Classify by phase with evidence

| Evidence                       | Supports                           | Does not prove                            |
| ------------------------------ | ---------------------------------- | ----------------------------------------- |
| work-normalized CPU stacks     | on-CPU location                    | request critical path or capacity alone   |
| wall/off-CPU stacks            | thread residency/wait locations    | logical resource owner or harmful wait    |
| queue wait/service/active      | a resource's demand and saturation | whole-system bottleneck without alignment |
| CPU quota/throttle/pressure    | enforced CPU scarcity              | code path causing demand                  |
| throughput versus offered load | saturation/failure curve           | local mechanism without profiles          |

Services are mixed: parsing, allocation, locking, socket wait, dependency queueing, and response
encoding can dominate at different loads. Segment phases and business cohorts.

## Why concurrency can help or hurt

Concurrency can overlap waits with useful execution and improve utilization before saturation. It
can hurt through queue growth, context scheduling/cache displacement, lock/coherence/memory-
bandwidth contention, per-in-flight memory/connections, downstream overload, retry amplification,
and cancellation that leaves residual work.

CPU parallelism is constrained by effective processors/quota and also by serial fractions,
granularity, memory bandwidth, synchronization, data locality and external accelerators. “Core count
is the only ceiling” is not an engineering model.

Little's Law relates long-run averages for a stable defined system: `L = lambda * W`. It does not
say rising concurrency is always only a symptom. Define boundaries, use admitted/completed rate,
and check stability/loss/retries. Queue wait ratios at 80/90% require distribution/model assumptions;
do not quote M/M/1 intuition as a universal curve.

## Experiment

Sweep offered load and concurrency independently where possible. Record useful completion/error/
drop/retry rate, omission-corrected latency, active/in-flight/queued and wait/service time, CPU/
throttle/pressure, memory/connections, downstream SLO, and residual work after cancellation.

Find the operating region meeting SLO and failure/headroom constraints. Maximum throughput is not
automatically the safe concurrency limit.

## Authoritative references

- [Java concurrency API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [Reactive Streams JVM specification](https://github.com/reactive-streams/reactive-streams-jvm)
- [Linux cgroup v2 CPU controller](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu)
