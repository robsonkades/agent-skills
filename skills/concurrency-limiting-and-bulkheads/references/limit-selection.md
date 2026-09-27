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

Hide unowned semaphore operations from application code. This complete class compiles with
`javac --release 11`; it is a fixed, single-permit gate, not a weighted or dynamically resized one.
The returned lease has one logical operation owner even though `close()` tolerates races:

```java
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class ConcurrencyGate {
    private final Semaphore permits;

    ConcurrencyGate(int limit, boolean fair) {
        if (limit <= 0) throw new IllegalArgumentException("limit must be positive");
        this.permits = new Semaphore(limit, fair);
    }

    Lease tryAcquire(Duration budget) throws InterruptedException {
        Objects.requireNonNull(budget, "budget");
        if (budget.isNegative()) throw new IllegalArgumentException("negative budget");
        long nanos = saturatingNanos(budget);
        if (!permits.tryAcquire(nanos, TimeUnit.NANOSECONDS)) return null;
        return new Lease(permits);
    }

    private static long saturatingNanos(Duration budget) {
        try {
            return budget.toNanos();
        } catch (ArithmeticException overflow) {
            return Long.MAX_VALUE;
        }
    }

    static final class Lease implements AutoCloseable {
        private final Semaphore permits;
        private final AtomicBoolean open = new AtomicBoolean(true);

        private Lease(Semaphore permits) { this.permits = permits; }

        @Override public void close() {
            if (open.compareAndSet(true, false)) permits.release();
        }
    }
}
```

Zero budget makes one timed, interruptible immediate acquisition attempt, respecting semaphore
fairness. It is not permission to launch work whose end-to-end deadline has expired. Negative
budgets are rejected and null raises `NullPointerException`; positive overflow saturates the wait.
`null` means admission timed out/unavailable; interruption propagates. A richer result type can
distinguish additional lifecycle policies. Double-close is harmless but leaked or prematurely
closed leases remain bugs; idempotent release does not prove that protected work has finished.

Despite the name `tryAcquire`, a positive waiting budget can block the calling thread. If that
thread is an event loop, or all workers in the completion executor wait for permits, admitted work
may be unable to finish and release them. A timeout bounds the stall; it does not make admission
nonblocking. Use `Duration.ZERO` for an immediate attempt with explicit rejection, or an
asynchronous admission mechanism with bounded waiters/bytes and deadline/cancellation cleanup.
Offloading the wait must still bound waiting tasks and retained bytes, and must not occupy all
workers needed for resource completion. Do not hide an unbounded queue behind the semaphore.

Partial usage sketch: `deadline.remaining()` must recalculate from one monotonic request deadline,
clamp expired time to zero and reserve response/cleanup time. The exceptions and client are
application-defined; the client here must finish local resource cleanup before returning/throwing.

```java
ConcurrencyGate.Lease lease = gate.tryAcquire(deadline.remaining());
if (lease == null) throw new DependencyBusyException("pricing admission expired");
try (lease) {
    Duration remaining = deadline.remaining(); // subtract the admission wait
    if (remaining.isZero() || remaining.isNegative()) {
        throw new DependencyBusyException("pricing request deadline expired");
    }
    return client.price(sku, remaining);
}
```

Provider timeout/cancellation remains necessary. The permit protects local concurrency and should
be held until the protected local operation has actually released the scarce resource, not merely
until the caller's future timed out. If the server continues after transport cancellation, local
permits alone do not bound server execution; observe that late work or use server admission.
For asynchronous clients, transfer ownership to their actual completion/cleanup callback, handle
synchronous launch failures, and do not wrap future creation in this lexical try-with-resources.

Check what the client's completion actually means. With Java `HttpClient` and
[`BodyHandlers.ofInputStream()`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpResponse.BodyHandlers.html#ofInputStream()>),
the response can be available before its body has fully arrived; the caller must obtain and close
the stream. If the protected unit is the whole streaming exchange, releasing from `sendAsync`'s
response-future callback is too early. Transfer the stream and lease to the body consumer and keep
the permit through body use and required close/cancellation cleanup. Cover read failure, an
abandoned response, and failure to hand ownership to the consumer. A synchronous `send` returning
a stream has the same lifetime issue; method return alone does not establish resource release.

## Weighted admission

Java `Semaphore.acquire(int)` can model coarse units such as memory MiB. Define units and round up
without arithmetic overflow; nonzero protected work must not round down to zero permits. Validate
the weight before converting to `int`; reject negative or over-capacity work rather than waiting
forever. Define whether genuinely zero-cost work is allowed. Acquire the whole weight in one call,
not a loop of single acquisitions: the bulk operation acquires atomically, while partial holdings
can prevent all contenders from obtaining their remainder. Large requests still interact with
fairness and head-of-line blocking.

For actual memory, validate weight estimates against retained/native allocation and concurrent
phases. A body that grows after admission breaks the bound. Reserve a known maximum up front, or
process bounded chunks whose memory is actually released before reserving the next chunk. Retaining
all earlier chunks defeats the bound. If holders all need extra weight before any can finish,
blocking top-ups can deadlock even with one shared semaphore. An immediate failed top-up should
reject/abort with cleanup, or use an explicit protocol that guarantees progress; do not release
memory permits while their memory remains retained.

## Attempts, retries and fan-out

Choose the nesting by the resource lifetime, not annotation/decorator order folklore. In conceptual
`Retry(ResourceGate(attempt))`, each attempt reacquires capacity and releases after its real cleanup;
backoff holds no attempt permit. `RequestGate(Retry(attempt))` instead bounds logical requests,
including backoff, and can deliberately protect their retained state. They solve different problems
and may coexist. Inspect framework/proxy ordering and instrument actual attempt entry/exit before
claiming that configuration implements either arrangement.

Parallel fan-out and hedged attempts must each acquire resource capacity, or consume an equivalent
reserved parent weight with a checked maximum. Never let a parent take the last permit and then wait
for a child that needs another permit from the same gate. A losing hedge keeps its charge until its
protected work ends; cancelling the observer is insufficient. If that work continues remotely after
local cleanup, include it as late-server exposure rather than claiming a server-side hard cap.

Treat local admission refusal separately from a downstream attempt failure. Blind immediate retry
just re-enters the saturated gate; a retry policy needs an explicit deadline/budget and a reason that
capacity may become available. Pass attempt scope, rejection type, cancellation behavior and the
remaining deadline to `retries-and-backoff` for retry-safety/policy decisions. If unavailable, keep
admission failure explicit and preserve existing retry semantics until their safety is established.

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

A bounded map is not enough: removing tenant A's gate while a lease remains open, then creating a
fresh gate for A, grants a second allocation. Retire a gate only through a protocol that coordinates
lookup/acquisition with its holders and waiters; a momentary idle/queue-size check is not sufficient.
Test removal and reactivation while old work or an admission attempt still holds the old identity.

## Tests

- action throws before/after provider acquisition;
- interruption while waiting and after acquiring;
- double close and forgotten close detection;
- zero/negative/overflowing duration and weight greater than capacity;
- nonzero work rounding to zero, weight-conversion overflow, and contenders retaining partial
  weights while each requests more; verify rejection/cleanup or a progress-preserving alternative;
- executor workers and queue saturated: rejection must not run extra protected work on callers;
  submitted async launch tasks must not be mistaken for completed resource operations;
- retry backoff versus ingress lifetime, parallel hedges/fan-out, and a late cancelled loser:
  reconcile resource-attempt occupancy separately from logical-request occupancy;
- slow dependency and caller timeout with residual provider work;
- response future completes while its streaming body remains active: retain the permit through
  body use/cleanup, including failed consumption or ownership handoff;
- admission waits on the executor needed for release: expose stalled completion, then verify the
  chosen immediate/async admission policy preserves progress and bounds waiting work;
- replica overlap and another client consuming the same dependency;
- tenant skew, reserve exhaustion and high partition churn;
- limit decrease while more work is already in flight: no early release, and no new admissions
  until the chosen draining policy permits them; the fixed wrapper above does not implement resizing.

## References

- [Java 11 `Semaphore`](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/concurrent/Semaphore.html)
  — timed fairness, ownership and atomic multi-permit acquisition on the example's baseline.
- [Java 25 `Semaphore`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [Java 25 `Duration`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Duration.html)
- [Java 25 virtual threads: do not pool to limit concurrency](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html#GUID-704A6A35-6A18-47C9-A272-1A3BC4972391)
