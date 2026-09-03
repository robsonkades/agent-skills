# The lease model

A worker never removes a message. It acquires a **lease**: the broker hides the message from
other consumers for a timeout, and the worker must acknowledge (delete) before the timeout
elapses. If it does not — crash, GC pause, slow dependency, no difference — the message
becomes visible again and another worker takes it. That is the recovery mechanism and the
duplicate generator, and it is the same mechanism.

Names and semantics differ. SQS has per-receipt visibility and can duplicate even within that
period; RabbitMQ holds an unacknowledged delivery on a channel until ack/nack, connection loss or
configured enforcement; JMS acknowledgement can cover a session's delivered messages; database
queues implement whatever claim transaction/clock/fencing was designed. Verify the broker's
redelivery, ordering, acknowledgement scope and stale-handle behavior rather than translating all
of them into one lease model.

## The duplicate-work window

```
t0   W1 receives msg, lease expires at t0+30s
t0   W1 begins handler (this one will take 45s: dependency is slow today)
t30  lease expires; broker makes msg visible again — no error is raised anywhere
t31  W2 receives the same msg, begins the same handler
t45  W1 finishes, applies the side effect, calls delete → succeeds or fails silently
t76  W2 finishes, applies the side effect a second time
```

Between `t31` and `t45` two workers hold the same item with **no mutual exclusion between
them**. Nothing retried; nothing threw. The only observable trace is a delivery counter above
one on W2's copy, and a delete on an expired lease from W1 — which some brokers accept and
some reject. Read both signals: a redelivery count above one is information, not noise.

## Choosing the timeout

Let `E` be exposure from receive until successful acknowledgement:

```
E = prefetch wait + handler + downstream waits + acknowledgement
visibility timeout > selected tail(E) + clock/client/broker-resolution margin
```

- **Select the tail from an objective.** A higher timeout reduces expiry overlap but delays
  crash recovery; a lower one recovers sooner but increases duplicate concurrency. p99.9 is an
  example only when its nominal 0.1% premature-expiry rate is affordable and the measured sample
  covers overload, pauses and dependency degradation. Timeouts censor the observed tail.
- **Prefetch creates waves.** All `B` leases begin at receive. With `C` equal slots, the last
  record waits behind about `ceil(B/C)-1` waves, but summing individual p99.9 values is not the
  p99.9 of the sum. Measure `receive→start` and `receive→ack`, simulate from representative
  distributions, or keep prefetch close to available slots.
- **The distribution is not stationary.** A dependency degrading from 200 ms to 4 s moves p99.9
  by an order of magnitude while the timeout stays where it was. Alert on
  `p99.9(D) / timeout > 0.5` so the bet is re-examined before it is lost.
- Separate materially different task classes when they need different timeout, retry, priority,
  security or capacity policy. Per-message visibility can reduce the timeout coupling on brokers
  that support it, but operational and head-of-line coupling may remain.

## Heartbeat extension, and its failure mode

Extending the lease from inside a long handler (SQS `ChangeMessageVisibility`, or an `UPDATE …
SET claimed_until = now() + interval` for a database queue) removes the need to size for the
worst case. It introduces a worse failure if written naively.

```java
// Conceptual: cap and progress predicate omitted below are the point of this section.
var heartbeat = scheduler.scheduleAtFixedRate(
        () -> queue.extendLease(receiptHandle, LEASE),   // renews forever
        LEASE.dividedBy(3).toMillis(), LEASE.dividedBy(3).toMillis(), MILLISECONDS);
```

If the work thread wedges — a socket read with no timeout, a deadlock, an infinite loop — the
heartbeat thread is healthy and keeps renewing. The message is now **never** redelivered and
never dead-lettered; the item is stuck until the process is restarted, and the queue looks
empty. The lease has been converted from a recovery mechanism into a leak.

Two conditions make it safe, and both are required:

- **A hard cap on total lease time.** Stop renewing at `maxProcessingTime`, let the lease
  lapse, and let redelivery do its job. The cap is a business decision — the longest this item
  may plausibly take — not a multiple of the base timeout.
- **Renew on credible progress where progress is observable.** Atomic CPU work or one long
  database operation may have no intermediate marker; inventing one is worse than a conservative
  maximum. Renewal must stop on cancellation/deadline, failed ownership validation or a stale
  receipt, and its own partial failures must be observed.

Also cap the _number_ of extensions in a metric and alert on it: an item renewing thirty times
is telling you the timeout, the batch size or the handler is wrong.

## It is not a lock — what to do instead

The lease bounds visibility. It does not exclude a second holder, and it cannot: the broker
cannot tell "the worker is dead" from "the worker is paused", which is the failure detection
problem (`failure-models`). Any of these designs is broken:

| Design that assumes exclusivity         | What actually happens                                |
| --------------------------------------- | ---------------------------------------------------- |
| Read-modify-write with no version check | Lost update when the two holders interleave          |
| `balance += amount` in the handler      | Applied twice; increment is not idempotent           |
| "Only one worker has it, so no locking" | Two workers, no locking, corrupted aggregate         |
| Deleting a source row after processing  | Second holder finds it gone and takes a wrong branch |

The three legitimate responses, in the order they should be considered:

1. **Make the side effect repeat-safe** — a conditional insert on a key, an absolute write, a
   state-machine transition guarded on the current state. This is `idempotency`, and it is the
   only response that also survives redelivery after a crash, which the other two do not.
2. **Guard the resource with a fencing token.** If the handler must exclude a concurrent
   holder, the exclusion belongs at the resource: a monotonic token the resource stores and
   compares, rejecting writes from an older token. A lease number, a version column, a
   conditional update — the resource decides, not the worker. Electing a single holder is
   `leader-election`.
3. **Shrink the window** — smaller batches, a tighter timeout, a heartbeat with the two
   conditions above. This lowers the probability. It never reaches zero.

## Checklist

- [ ] Timeout derived from receive-to-ack exposure and a stated duplicate/recovery objective.
- [ ] Alerts cover exposure headroom, extension failure/cap and redelivery overlap.
- [ ] Heartbeat, if present, has a total cap and a progress predicate.
- [ ] Redelivery count is read and logged; first delivery and redelivery are distinguishable.
- [ ] Handler is repeat-safe, or the path is documented as tolerating a duplicate.
- [ ] No handler comment or design note asserts that only one worker holds the item.
