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

Two consequences that decide the design: the rule is **stop when renewal fails**, not "stop when
told you lost" — a leader waiting for an explicit answer waits on a network that already failed;
and anything A does after t=20.0 must be rejectable by the resource or safe twice. No third
option exists.

## The stop-acting check, in Java

The deadline is local and monotonic: an NTP step moves `currentTimeMillis()` and does not move
the store's opinion.

```java
// Conceptual: the leader loop. Omits back-off, metrics and the store client.
final class LeaderLoop {
    private static final Duration LEASE = Duration.ofSeconds(15);
    // Clock skew against the store plus the worst time a unit of work takes to become
    // visible at the resource. Both measured, not guessed.
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

    void onRenewSucceeded(long grantedFence) {
        this.fence = grantedFence;
        this.safeUntilNanos = System.nanoTime() + LEASE.minus(MARGIN).toNanos();
    }
}
```

Three properties to preserve when adapting it:

1. `safeUntilNanos` is written **only** on a successful renewal; a failed or timed-out renewal
   must not extend it, nor be retried in a way that blocks the deadline check.
2. The check runs before **every unit of work**, and a unit is sized to finish inside the margin.
   A leader that checks once then runs a forty-minute batch expired thirty-nine minutes ago.
3. `stopLeading()` must stop mid-flight — cancel in-flight work, close the outbound connection,
   drop the consumer. If it only sets a flag checked later, the window is as long as that later.

## Choosing the lease duration

Inputs, all measured: the worst stop-the-world pause (`pause-attribution`), blip durations already
seen in production, the store's own election window, and the tolerance for having no leader.

```text
lease  >  worst_pause + blip + store_election_window     (else: false failovers, churn)
lease  <  tolerable_leaderless_period − election − warm-up  (else: the SLO is already missed)
renew every lease/3, so two consecutive renewal failures are survivable
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

1. **Stop leading at SIGTERM**, at the start of termination, not when the process exits. The
   grace period is for draining in-flight work; a leader still starting new work during its drain
   overlaps with its successor.
2. **Release the lease during shutdown.** Without it the successor waits out the full lease for an
   entirely planned shutdown; with it, failover is a round trip.
3. **Do not treat the released lease as a handover.** The successor may start before the
   predecessor's last write lands — the ordinary window, with the ordinary answers. Termination
   sequencing, probes and the grace period itself are `kubernetes-service-lifecycle`.

## Proving it

- **Partition the leader from the coordination store** while leaving its path to the database
  open — a packet-dropping proxy is enough. Assert it stopped within the lease, and that any
  later write was rejected at the resource.
- **`kill -STOP` the leader** for longer than the lease, let the standby take over, then `-CONT`.
  This is the case renewal cannot save and the one most designs have never run.
- **Assert on `sum(is_leader)`** across instances during a rolling deploy: it should touch 0
  briefly and must never sit at 2 for longer than the split-brain window you computed.
