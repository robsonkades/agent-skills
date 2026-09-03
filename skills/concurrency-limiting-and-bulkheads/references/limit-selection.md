# Limit selection and implementation

## Requirements table

| Requirement                                       | Local mechanism                            | Additional question                              |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| no more than N calls simultaneously at dependency | process-local semaphore/client pool        | is N local or aggregate across replicas/clients? |
| no more than R calls per time interval            | route to rate limiter                      | burst allowance and cluster coordination?        |
| no more than B waiting bytes/tasks                | weighted admission/bounded queue           | expiry, rejection and durability?                |
| tenant A cannot consume tenant B's share          | partitioned bulkhead                       | long-tail cardinality and borrowing?             |
| only one job cluster-wide                         | route to distributed lease/leader election | fencing and lease-loss semantics?                |

## Capacity experiment

At representative data and co-tenancy, sweep offered concurrency and record completed throughput,
service/tail latency, errors, resource occupancy, CPU, allocations/GC and downstream saturation.
Repeat with slow-tail and partial-failure injection. The useful ceiling is normally before the point
where added concurrency stops increasing useful throughput or violates a protected SLO.

Use `L = λW` to cross-check averages over a stable interval. If measurements disagree materially,
inspect population boundaries, retries, dropped/cancelled work, non-steady traffic and whether `W`
includes queue time. Do not substitute p99 into the average identity and call the result capacity.

## Scoped permit wrapper

Hide unowned semaphore operations from application code:

```java
final class ConcurrencyGate {
    private final Semaphore permits;

    ConcurrencyGate(int limit, boolean fair) {
        if (limit <= 0) throw new IllegalArgumentException("limit must be positive");
        this.permits = new Semaphore(limit, fair);
    }

    Lease tryAcquire(Duration budget) throws InterruptedException {
        long nanos = budget.isNegative() ? 0L : saturatingNanos(budget);
        if (!permits.tryAcquire(nanos, TimeUnit.NANOSECONDS)) return null;
        return new Lease(permits);
    }

    static final class Lease implements AutoCloseable {
        private final Semaphore permits;
        private final AtomicBoolean open = new AtomicBoolean(true);

        Lease(Semaphore permits) { this.permits = permits; }

        @Override public void close() {
            if (open.compareAndSet(true, false)) permits.release();
        }
    }
}
```

`saturatingNanos` is an application helper that converts very large durations without overflow.
Returning `null` is illustrative; a result type can distinguish timeout, interruption, shutdown and
policy rejection. `AtomicBoolean` makes accidental double-close harmless but does not solve leaked
leases—ownership still must be lexical and observed.

```java
ConcurrencyGate.Lease lease = gate.tryAcquire(remainingBudget);
if (lease == null) throw new DependencyBusyException("pricing admission expired");
try (lease) {
    return client.price(sku, remainingBudget);
}
```

Provider timeout/cancellation remains necessary. The permit protects local concurrency and should
usually be held until the provider operation has actually released the scarce resource, not merely
until the caller's future timed out.

## Weighted admission

Java `Semaphore.acquire(int)` can model coarse units such as memory MiB. Define rounding and maximum
weight; reject one request whose weight exceeds total capacity instead of waiting forever. Large
multi-permit acquisition can block behind fragmented availability and interact with fairness.

For actual memory, validate weight estimates against retained/native allocation and concurrent
phases. A body that grows after admission breaks the bound; stream/chunk it or acquire additional
weight through a deadlock-safe protocol.

## Hierarchical acquisition

When a request needs global, tenant and dependency permits:

1. define one global acquisition order;
2. use one shared remaining deadline, not a fresh timeout per gate;
3. release in reverse order;
4. avoid holding a scarce downstream connection while waiting for another gate;
5. record which gate rejected and how long preceding permits were held.

Independent code paths that acquire A→B and B→A can deadlock even though each semaphore allows more
than one permit.

## Partition design

| Shape                                      | Benefit                                      | Failure/cost                                         |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| fixed per dependency                       | clear failure isolation                      | idle capacity cannot serve another dependency        |
| dedicated major tenants + shared long tail | bounded state and important-tenant isolation | classification/config lifecycle                      |
| hashed cells                               | bounded cardinality                          | unrelated tenants collide                            |
| fixed shares + shared reserve              | better utilization                           | borrowing policy can recreate starvation             |
| priority queues before gate                | service differentiation                      | starvation, cancellation and queue memory complexity |

Fairness must be tested with adversarial service-time variance. Report wait/hold distributions per
partition and total useful utilization, not only rejection counts.

## Tests

- action throws before/after provider acquisition;
- interruption while waiting and after acquiring;
- double close and forgotten close detection;
- zero/negative/overflowing duration and weight greater than capacity;
- slow dependency and caller timeout with residual provider work;
- replica overlap and another client consuming the same dependency;
- tenant skew, reserve exhaustion and high partition churn;
- limit decrease while more work is already in flight.

## References

- [Java 25 `Semaphore`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [Java 25 `Duration`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Duration.html)
- [Java 25 virtual threads: do not pool to limit concurrency](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html#GUID-704A6A35-6A18-47C9-A272-1A3BC4972391)
