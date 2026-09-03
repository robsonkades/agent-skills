# Leases, renewal and the split-brain window

## The window, as a sequence

Lease 15 s, renewal every 5 s. A is leader; B is a standby polling the same key.

```text
t=0.0   A: acquire            -> granted, lease valid to t=15.0 (store's clock)
t=5.0   A: renew              -> ok, valid to t=20.0
t=7.2   A's network path to the store starts dropping packets
t=10.0  A: renew              -> timeout. A does not know whether it succeeded.
t=15.0  A: renew              -> timeout.
t=20.0  store: lease expired
t=20.3  B: acquire            -> granted, valid to t=35.3.   B is now the leader.
t=20.4  B: begins the batch
t=25.0  A: renew              -> connection refused; A finally concludes it has lost
        ================ split-brain window: t=20.0 .. t=25.0 ================
```

The window is not the partition. It is the interval between **the lease expiring** and **the
former leader acting on that fact**, and it exists in every implementation: expiry happens on the
store, the reaction in a process that may be unreachable, paused, or inside a long operation.
Renewing more often shortens the _expected_ window and does not bound it.

Two consequences decide the design. A failed renewal must not extend authority, but need not
stop work immediately while a conservative grant budget remains. The leader must quiesce by
that local deadline rather than wait to be told it lost. Anything that arrives after a newer
term is claimed must be rejected by the resource, committed under an atomic authority check,
or safe/reconcilable when repeated.

## The stop-acting check, in Java

The deadline is local and monotonic: an NTP step moves `currentTimeMillis()` and does not move
the store's opinion.

```java
// Conceptual: the leader loop. Omits back-off, metrics and the store client.
final class LeaderLoop {
    private static final Duration LEASE = Duration.ofSeconds(15);
    // Grant-response uncertainty + clock-rate drift + time to stop admission/quiesce.
    private static final Duration MARGIN = Duration.ofSeconds(4);

    private volatile long safeUntilNanos;   // monotonic; set only by a successful renew
    private volatile long fence;            // token issued with the current grant

    void run() {
        while (running) {
            if (System.nanoTime() >= safeUntilNanos) {
                stopLeading();              // renewal has not succeeded in time
                return;                     // do not "keep trying while working"
            }
            doOneUnitOfWork(fence);         // small enough to fit inside MARGIN
        }
    }

    void onRenewSucceeded(long grantedFence, long requestStartedNanos) {
        this.fence = grantedFence;
        // Anchor conservatively at request start, not response receipt: the store may have
        // started the lease before the response arrived.
        this.safeUntilNanos = requestStartedNanos + LEASE.minus(MARGIN).toNanos();
    }
}
```

Three properties to preserve when adapting it:

1. `safeUntilNanos` is written **only** on a successful renewal; a failed or timed-out renewal
   must not extend it, nor be retried in a way that blocks the deadline check.
2. Stop **admission** early enough that every admitted unit can finish or become safely
   abandonable inside the margin. A check before a forty-minute indivisible operation is not
   protection.
3. `stopLeading()` requests cancellation and quiescence, but remote cancellation is not
   rollback. Resource-side fencing/idempotency handles late completion.

## Choosing the lease duration

Inputs, all measured: the worst stop-the-world pause (`pause-attribution`), blip durations already
seen in production, the store's own election window, and the tolerance for having no leader.

```text
lease and renewal schedule leave enough margin for observed pause/network/store tails,
request-response uncertainty, clock-rate drift, retries and quiescence
remaining lease + election + recovery + warm-up fits the leaderless SLO in the target percentile
renewal cadence gives multiple opportunities without correlated retries overwhelming the store
```

If those bounds cross, the design is wrong before the numbers are: the pauses must come down, the
work must tolerate a longer gap, or it must not need a singleton at all.

## The failover budget

```text
failover   = detection + election + warm-up
detection  ≈ lease remaining at the moment of failure (0 .. lease)
election   ≈ one or two round trips to the store, plus its own election if the store failed too
warm-up    = caches primed, connections opened, offsets or checkpoints read, backlog caught up
```

Warm-up is the forgotten term and is often the largest: a new leader that must read a checkpoint
and replay an hour of backlog is not "available" when it wins. Measure it as _time until the
first useful unit of work completes_, not time until the process claims leadership.

## Rolling deploys

A rolling deploy terminates the leader on purpose, so every release contains a failover. Three
behaviours worth getting right, in order of impact:

1. **Stop admitting work and readiness at SIGTERM.** Continue renewal only as needed to drain
   safely within the grant; otherwise abort into a recoverable state.
2. **Checkpoint and quiesce before releasing.** Releasing while old effects remain in flight
   invites overlap. If quiescence cannot be proved, let the grant expire and rely on fencing.
3. **Use a new term for handover.** A release is not an acknowledgement that every old effect
   landed. The successor loads the durable checkpoint/reconciles before declaring useful
   readiness. Termination sequencing is `kubernetes-service-lifecycle`.

## Proving it

- **Partition the leader from the coordination store** while leaving its path to the database
  open — a packet-dropping proxy is enough. Assert it stopped within the lease, and that any
  later write was rejected at the resource.
- **`kill -STOP` the leader** for longer than the lease, let the standby take over, then `-CONT`.
  This is the case renewal cannot save and the one most designs have never run.
- Compare local role/term metrics, but assert the safety invariant at the mutable resource:
  stale-term writes are rejected even after the old process resumes. Also assert bounded time
  to useful work and backlog recovery; a leader flag alone is not availability.

## Clock model

`System.nanoTime()` is appropriate for elapsed time inside one process, but it cannot be
compared to the store's wall-clock expiry and its rate can drift relative to that clock. Start
the conservative interval no later than the request-send instant, subtract documented drift/
uncertainty and never persist `nanoTime` across restart. If the coordination API returns TTL
rather than a grant-start instant, use its documented semantics; do not invent a conversion
from remote wall time.

## Primary references

- [The Chubby lock service](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)
- [Leases: an efficient fault-tolerant mechanism for distributed file cache consistency](https://dl.acm.org/doi/10.1145/74850.74870)
- [Kubernetes Lease API](https://kubernetes.io/docs/concepts/architecture/leases/)
