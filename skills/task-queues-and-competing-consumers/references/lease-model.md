# The lease model

In an SQS-style manual-delete model, receive does not remove a message. The broker hides it from
other consumers for a timeout. If the message is not deleted before expiry — crash, GC pause,
slow dependency — it becomes eligible for another receive. A later receiver may overlap the
original handler or may arrive after it finishes. This recovery mechanism permits duplicate
execution; expiry alone neither proves a second execution nor stops the first.

Names and semantics differ. SQS has per-receipt visibility and can duplicate even within that
period; RabbitMQ AMQP 0-9-1 manual acknowledgements belong to the delivery's channel, with
unacknowledged work requeued on channel/connection closure; JMS CLIENT_ACKNOWLEDGE acknowledges
all messages delivered by that session, not just the referenced message; database
queues implement whatever claim transaction/clock/fencing was designed. Verify the broker's
redelivery, ordering, acknowledgement scope and stale-handle behavior rather than translating all
of them into one lease model.

## The duplicate-work window

```
t0   W1 receives msg, lease expires at t0+30s
t0   W1 begins handler (this one will take 45s: dependency is slow today)
t30  lease expires; broker makes msg visible again — no error is raised anywhere
t31  W2 receives the same msg, begins the same handler
t45  W1 finishes, applies the side effect, calls delete with its older receipt
t76  W2 finishes, applies the side effect a second time
```

Between `t31` and `t45` two workers hold the same item with **no mutual exclusion between
them** in this example. No application retry or exception is required. Correlate task IDs,
attempt intervals and effect records with available redelivery metadata; a counter is neither
the only observable evidence nor universally available. SQS DeleteMessage can return success
for an old receipt handle without deleting the message. An API success does not prove that
redelivery was prevented, and deletion does not cancel an already-running handler.

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
- Give materially different task classes the timeout, retry, priority, security and capacity
  policies they require. Supported per-message/class controls can be adequate in a shared
  queue; separate queues/pools when the needed isolation or policy cannot be provided there.
  Operational and head-of-line coupling can remain even with per-message visibility.

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
SQS limits the visibility window to 12 hours from when SQS receives the ReceiveMessage request;
renewal does not reset that maximum. A ChangeMessageVisibility value greater than the remaining
maximum fails, so setting 43,200 seconds after receipt can already be too large. This is a
visibility limit, not a scheduled redelivery time or a bound on handler execution. Other claim
implementations can renew indefinitely. Unbounded renewal can turn recovery into a leak.

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
problem (`failure-models`). These unguarded uses of presumed exclusivity can break correctness:

| Design that assumes exclusivity                                                     | What actually happens                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Read-modify-write without a concurrency-safe transaction, lock or conditional guard | Lost update when the two holders interleave        |
| `balance += amount` without logical-operation deduplication                         | Applied twice; increment is not idempotent         |
| "Only one worker has it, so no locking"                                             | Two workers, no locking, corrupted aggregate       |
| Deleting a source row with no valid already-processed branch                        | Second holder can mistake absence for a new action |

Choose compatible controls for the actual effect contract; an existing adequate combination
does not need replacement:

1. **Make the side effect repeat-safe** — atomically deduplicate the logical operation with
   its effect, or use a versioned/conditional state transition. An absolute write can still
   overwrite newer state on stale replay; equality of payload alone is insufficient.
   A failed conditional write alone does not identify the outcome of an earlier ambiguous
   attempt of that intent. `idempotency` owns crash/commit ambiguity and external-effect reconciliation.
2. **Guard concurrent effects at the resource.** Transactions, conditional version transitions
   or fencing may satisfy different invariants; state what the resource checks atomically.
   For epoch-based ownership, it stores and compares an ordered token. A receipt handle is not
   automatically an ordered fencing epoch, and optimistic version checks have a different contract. Fencing
   rejects stale owners after newer ownership is accepted; it does not deduplicate effects
   already committed by an earlier owner, and does not prevent concurrent computation. Electing a single holder is
   `leader-election`.
3. **Reduce expiry exposure** — smaller prefetch/batches, sufficient visibility or a heartbeat with the
   conditions above. This can reduce expiry-driven overlap; it does not establish exclusive
   delivery or execution. A documented duplicate-tolerant effect contract may accept overlap.

## Checklist

Use the items relevant to the requested lease/recovery claim; source-only explanations can
state these limits without inventing runtime measurements.

- [ ] Timeout derived from receive-to-ack exposure and a stated duplicate/recovery objective.
- [ ] Alerts cover exposure headroom, extension failure/cap and redelivery overlap.
- [ ] Heartbeat has a total cap, observed failures and credible progress where observable.
- [ ] Available redelivery flag/count and task/attempt IDs are recorded; missing broker evidence
      is not proof of first delivery.
- [ ] Handler is repeat-safe, or the path is documented as tolerating a duplicate.
- [ ] No handler comment or design note asserts that only one worker holds the item.

## Primary references

- [SQS visibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) — visibility and duplicate-delivery semantics.
- [SQS processing time](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/best-practices-processing-messages-timely-manner.html) and [ChangeMessageVisibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ChangeMessageVisibility.html) — request-origin maximum and remaining-time errors.
- [SQS DeleteMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html) — old receipt success need not remove the message.
- [ScheduledExecutorService](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ScheduledExecutorService.html) — periodic task failure suppresses subsequent executions; match the deployed JDK.
