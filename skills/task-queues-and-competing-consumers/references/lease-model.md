# The lease model

In an SQS-style manual-delete model, receive does not remove a message. The broker hides it from
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
E = receive-to-start + handler elapsed time (including downstream waits) + acknowledgement
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
  substantially while the timeout stays fixed. Alert on measured receive-to-ack exposure,
  remaining headroom and extension failures against the chosen recovery objective; no universal
  50% threshold or handler-only percentile establishes safety.
- Separate materially different task classes when they need different timeout, retry, priority,
  security or capacity policy. Per-message visibility can reduce the timeout coupling on brokers
  that support it, but operational and head-of-line coupling may remain.

## Heartbeat extension, and its failure mode

Extending the lease from inside a long handler (SQS `ChangeMessageVisibility`, or an `UPDATE …
SET claimed_until = now() + interval` for a database queue) permits a shorter initial visibility interval, but still requires a renewal
schedule, bounded network calls and sufficient pause/failure headroom. It introduces a worse failure if written naively.

```java
// Conceptual: cap and progress predicate omitted below are the point of this section.
var heartbeat = scheduler.scheduleAtFixedRate(
        () -> queue.extendLease(receiptHandle, LEASE),   // renews forever
        LEASE.dividedBy(3).toMillis(), LEASE.dividedBy(3).toMillis(), MILLISECONDS);
```

If the work thread wedges — a socket read with no timeout, a deadlock, an infinite loop — the
heartbeat thread is healthy and keeps renewing. The message can remain hidden until renewal stops or a broker cap is reached.
SQS limits visibility extension to 12 hours from the receive request; renewal does not reset that
maximum. Other claim implementations can renew indefinitely. The lease has been converted from a recovery mechanism into a leak.

Bound renewal with these conditions; they do not eliminate duplicate execution:

- **A hard cap on total lease time.** Stop renewing at `maxProcessingTime`, let the lease
  lapse, and cancel/guard the old work. Redelivery can overlap a handler that ignores cancellation. The cap is a business decision — the longest this item
  may plausibly take — not a multiple of the base timeout.
- **Renew on credible progress where progress is observable.** Atomic CPU work or one long
  database operation may have no intermediate marker; inventing one is worse than a conservative
  maximum. Renewal must stop on cancellation/deadline, failed ownership validation or a stale
  receipt, and its own partial failures must be observed.

Record extension count, failures and remaining headroom. Many successful extensions may be
expected for long work; alert against its declared budget. An exception escaping a periodic
ScheduledExecutorService task suppresses future runs: observe failures and apply a bounded
retry/stop policy rather than silently losing renewal.

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

1. **Make the side effect repeat-safe** — atomically deduplicate the logical operation with
   its effect, or use a versioned/conditional state transition. An absolute write can still
   overwrite newer state on stale replay; equality of payload alone is insufficient.
   `idempotency` owns crash/commit ambiguity and external-effect reconciliation.
2. **Guard the resource with a fencing token.** If the handler must exclude a concurrent
   holder, the exclusion belongs at the resource: a monotonic token the resource stores and
   compares, rejecting writes from an older token. A receipt handle is not automatically an
   ordered fencing epoch, and optimistic version checks have a different contract. Fencing
   rejects stale owners after newer ownership is accepted; it does not deduplicate effects
   already committed by an earlier owner. Electing a single holder is
   `leader-election`.
3. **Reduce expiry exposure** — smaller prefetch/batches, sufficient visibility or a heartbeat with the
   conditions above. This lowers the probability. It never reaches zero.

## Checklist

- [ ] Timeout derived from receive-to-ack exposure and a stated duplicate/recovery objective.
- [ ] Alerts cover exposure headroom, extension failure/cap and redelivery overlap.
- [ ] Heartbeat has a total cap, observed failures and credible progress where observable.
- [ ] Available redelivery flag/count and task/attempt IDs are recorded; missing broker evidence
      is not proof of first delivery.
- [ ] Handler is repeat-safe, or the path is documented as tolerating a duplicate.
- [ ] No handler comment or design note asserts that only one worker holds the item.

## Primary references

- [SQS visibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) — per-receipt semantics and the total extension cap.
- [ScheduledExecutorService](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledExecutorService.html) — periodic task failure suppresses subsequent executions; match the deployed JDK.
