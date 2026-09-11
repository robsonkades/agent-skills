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
        stale-authority window: t=20.0 .. t=25.0
        overlapping leader activity starts when B begins work at t=20.4
```

This is a stale-authority window in a store-TTL example, not necessarily simultaneous work
throughout it. Local admission can stop conservatively before expiry; delayed remote effects
can still land later. Store expiry and a paused holder's reaction are separate events.
Renewing more often shortens the _expected_ window and does not bound it.

Two consequences decide the design. A failed renewal must not extend authority, but need not
stop work immediately while a conservative grant budget remains. The leader must quiesce by
that local deadline rather than wait to be told it lost. Anything that arrives after a newer
term is activated at the sink must be rejected by that resource, committed under an atomic authority check,
or safe/reconcilable when repeated.

## The stop-acting check, in Java

The deadline is local and monotonic. This Java 17 value object illustrates admission arithmetic,
not a complete election loop. The caller obtains the actual granted duration under the
provider's semantics; it must not assume that a requested 15-second TTL was granted unchanged.

```java
record GrantBudget(long fence, long admissionDeadlineNanos) {
    static GrantBudget fromAcknowledgedGrant(long fence, long requestStartedNanos,
                                             long grantedTtlNanos, long marginNanos) {
        if (grantedTtlNanos <= 0 || marginNanos <= 0 || marginNanos >= grantedTtlNanos) {
            throw new IllegalArgumentException("invalid grant budget");
        }
        return new GrantBudget(fence, requestStartedNanos + grantedTtlNanos - marginNanos);
    }
    boolean mayAdmit(long nowNanos) {
        return nowNanos - admissionDeadlineNanos < 0;
    }
}
```

Use subtraction for `nanoTime` comparisons: its origin can be negative and addition can wrap.
All compared intervals must be shorter than half the counter range; discard budgets on
restart. The margin covers documented drift/uncertainty plus the bounded work/quiescence
duration. Those are assumptions to justify, not bounds established by the largest observed
pause. A paused process cannot execute its deadline check; local admission arithmetic cannot
revoke delayed effects at a remote sink.

Integrate it on one owner thread: start with no grant (no work), process renewal outcomes
through a queue, and snapshot the accepted budget/fence together before admission. Reject
responses belonging to an invalidated lifecycle, old request or different election term;
a late acknowledgement must not revive a stopped leader. A valid but already-expired response
also admits no work. Serialize renewal requests or explicitly order their results.

Properties to preserve when adapting it:

1. The budget changes **only** on an accepted successful grant/renewal; a failed or timed-out renewal
   must not extend it, nor be retried in a way that blocks the deadline check.
2. Stop **admission** early enough that every admitted unit can finish or become safely
   abandonable inside the margin. A check before a forty-minute indivisible operation is not
   protection.
3. `stopLeading()` requests cancellation and quiescence, but remote cancellation is not
   rollback. Resource-side fencing/idempotency handles late completion.

## Choosing the lease duration

Use observed pause/network distributions (`pause-attribution`), store election/recovery timing
and the leaderless SLO to estimate churn and failover. Observed maxima describe the sampled
workload; they do not prove a bound on future pauses or delayed requests. Separately establish
the provider's grant semantics and any clock-rate and work/quiescence bounds used to justify
the conservative local budget. Preserve sink-side safety when those liveness estimates fail.

```text
lease and renewal schedule leave enough margin for observed pause/network/store tails,
request-response uncertainty, clock-rate drift, retries and quiescence
remaining lease + election + recovery + warm-up fits the leaderless SLO in the target percentile
renewal cadence gives multiple opportunities without correlated retries overwhelming the store
```

If the estimated operating range cannot meet the failover SLO at acceptable churn, identify
which evidence or assumption drives the conflict. Reducing pauses, changing recovery or the
coordination mechanism, tolerating a longer gap, or removing the singleton are possible
responses; a larger observed sample alone cannot prove safety.

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

A rolling deploy may terminate the leader and trigger failover. Three
behaviours worth getting right, in order of impact:

1. **Stop admitting work and readiness at SIGTERM.** Continue renewal only as needed to drain
   safely within the grant; otherwise abort into a recoverable state.
2. **Checkpoint and quiesce before releasing.** Releasing while old effects remain in flight
   invites overlap. If quiescence cannot be proved, let the grant expire and rely on fencing.
3. **Use a new term for handover.** A release is not an acknowledgement that every old effect
   landed. The successor loads the durable checkpoint/reconciles before declaring useful
   readiness. Termination sequencing is `kubernetes-service-lifecycle`.

## Proving it

For a new or changed election protocol, or an unresolved stale-effect risk, select the
applicable scenarios below and reuse adequate prior evidence. A focused review can state what
the supplied evidence establishes and which material checks remain; it need not run a live
cluster campaign. These fault injections belong in an isolated test environment.

- **Partition the leader from the coordination store** while leaving its path to the database
  open — a packet-dropping proxy is enough. Assert local admission stops by its conservative
  deadline. After activating the successor's fence at the sink, assert rejection of old-term
  writes; test pre-activation late effects against the separate authority/idempotency contract.
- **Pause an isolated test leader child process** for longer than the lease, let the standby
  take over and activate its fence at the resource, then resume the child (`STOP`/`CONT` on
  supported POSIX hosts). Never signal a real user/agent process.
  This is the case renewal cannot save and the one most designs have never run.
- Compare local role/term metrics, but assert the safety invariant at the mutable resource:
  stale-term writes are rejected after successor activation even when the old process resumes,
  or concurrent/repeated effects preserve the stated invariant. For a failover SLO decision,
  also measure time to useful work and backlog recovery; a leader flag alone is not availability.

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
- [Java 17 System.nanoTime: subtraction and overflow](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()>)
