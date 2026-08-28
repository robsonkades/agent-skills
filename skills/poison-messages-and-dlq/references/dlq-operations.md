# Operating a dead-letter queue

## The record

A DLQ entry is a diagnostic artefact, not a copy of the payload. Everything below exists
because someone opening the DLQ three days later cannot get it any other way — the source
topic's retention has expired, the pod is gone, the logs have rotated.

```java
// Conceptual: the envelope. Serialise as JSON or as headers on the dead-lettered record.
public record DeadLetter(
        byte[] payload,                 // raw bytes, NOT the deserialised object —
                                        // a deserialisation failure has no object
        Map<String, String> headers,    // including the original key and content type
        String sourceTopic,             // or queue name
        Integer sourcePartition,        // null for a queue
        Long sourceOffset,              // or the queue's message id / receipt
        String failureClass,            // PERMANENT | AMBIGUOUS_EXHAUSTED — never "ERROR"
        String exceptionType,           // fully qualified; the classifier's input
        String stackTrace,
        int attempts,
        Instant firstFailedAt,
        Instant deadLetteredAt,
        String consumerGroup,
        String buildVersion,            // which deploy failed on it
        String traceId) {}              // distributed-tracing-design
```

Why each of the less obvious ones:

- **Raw bytes, not the object.** The most common permanent failure is that the payload cannot
  be turned into an object at all. Storing `payload.toString()` loses the bytes and with them
  any chance of diagnosing an encoding or schema problem.
- **`sourcePartition` and `sourceOffset`.** Without them you cannot tell whether the record was
  skipped (leaving an ordering gap) or the partition was blocked, and you cannot reconstruct
  the sequence around it while the source retention lasts.
- **`firstFailedAt` versus `deadLetteredAt`.** The gap between them is how long the record was
  retried. A large gap on a permanent failure means the classifier is wrong.
- **`buildVersion`.** The single field that answers "did a deploy cause this?" without
  correlating dashboards. One version accounting for everything is the incident signature.
- **`failureClass`.** The DLQ should hold permanent and exhausted-ambiguous failures and
  nothing else; a record classed transient is a classifier bug worth being able to query for.

Store the DLQ's retention explicitly and make it longer than the alert-to-action time,
weekends included. A DLQ inheriting the source topic's retention deletes the evidence on a
schedule nobody chose.

## Redrive

Redrive is a controlled replay of DLQ records back onto the normal path. It is a first-class
operation, written and tested before the first incident, because the version written under
pressure skips the preconditions.

**Preconditions — all of them, checked before starting:**

- [ ] The defect is fixed **and deployed**, and `buildVersion` on the records is older than the
      running one. Redriving into the same build reproduces the same failure and doubles the
      DLQ.
- [ ] The handler is repeat-safe (`idempotency`). A redrive is by definition a duplicate
      delivery of something that may have partially applied before it failed.
- [ ] The records are still **semantically valid**. This is the precondition teams skip: an
      order-placed event from nine days ago replayed into a system where the customer has since
      cancelled applies stale intent as current. Filter by age and by a current-state check, or
      redrive individually with a human deciding.
- [ ] The ordering consequence is understood. Redriving records for the same key sends them in
      DLQ order, which is failure order, not production order. If per-key ordering matters, sort
      by `sourceOffset` per key before replaying and accept that they still arrive after
      everything that overtook them.
- [ ] The downstream can absorb the extra load at the redrive rate you chose.

**The procedure:**

1. Snapshot or copy the DLQ contents first; redrive that copy. A redrive that fails midway
   should not have consumed the evidence.
2. Replay **into the source topic or queue**, not by calling the handler directly. The normal
   path carries the rate limits, retries, metrics and tracing that a bespoke script does not,
   and a record that fails again lands back in the DLQ with a fresh envelope rather than
   vanishing into a script's stderr.
3. Rate-limit it. Full-rate redrive of a backlog accumulated during an outage recreates the
   outage; a redrive is a load test aimed at a dependency that just recovered.
4. Redrive in batches with a stop condition: if the failure rate of the redriven records
   exceeds a threshold, stop. The fix was not the fix.
5. Reconcile at the end: records in the snapshot = records succeeded + records back in the DLQ.
   Any difference is a lost record and is worth an incident review.

## Alerting

Two signals, and they answer different questions:

- **Arrival rate** — `rate(dlq_messages_total[5m])`. Something started failing. A step change
  matters far more than an absolute value; one poison record a day is normal for many systems,
  and the same rate arriving in one minute is not.
- **Age of the oldest record** — nobody is acting on the queue. This is the alert that catches
  the DLQ that has quietly held 400 records for a month. It should page a _team_, because the
  action is human.

Two more worth having:

- **DLQ arrivals grouped by `buildVersion` and `exceptionType`.** One version or one exception
  dominating is the deploy-poisoning signature and should be treated as an availability
  incident: stop or pause the consumer and roll back, rather than letting the topic drain into
  the DLQ where it loses partition ordering and offsets.
- **A non-zero DLQ that is never zero.** The steady-state target is empty. A DLQ that always
  has something in it trains everyone to ignore the alert, which is how the next real one is
  missed. Thresholds and page/ticket policy are `slo-and-alerting`.

## Testing the poison path

The DLQ path is only exercised by failures, which is why it is usually broken. Three tests,
all against a real broker under Testcontainers:

- **Genuine poison.** Publish a record that cannot be deserialised. Assert: it reaches the DLQ
  on the first failure (not after N), the envelope contains raw bytes, exception type, source
  offset and trace id, and the consumer's offset advanced past it — or, if the design blocks the
  partition, that it did **not** advance and per-partition lag rose.
- **Transient failure, not dead-lettered.** Stub the dependency to fail with a connection error
  for 30 seconds and then recover. Assert the record is processed successfully and the DLQ is
  empty. This test is what stops "attempts > 5 → DLQ" from being reintroduced.
- **Redrive.** Dead-letter a record, deploy the fix, redrive, and assert exactly one applied
  side effect downstream and an empty DLQ. Run it against the same handler the production
  redrive uses, or the test proves nothing about the tool you will actually run.
