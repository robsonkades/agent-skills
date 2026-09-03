# Operating a dead-letter queue

## The record

A DLQ entry is a diagnostic artefact, not a copy of the payload. Everything below exists
because someone opening the DLQ three days later cannot get it any other way — the source
topic's retention has expired, the pod is gone, the logs have rotated.

```java
// Conceptual: the envelope. Serialise as JSON or as headers on the dead-lettered record.
public record DeadLetter(
        byte[] boundedPayload,          // encrypted bytes, or null when blobRef is used
        URI blobRef,                    // immutable protected object + digest for large data
        String payloadDigest,
        Map<String, String> safeHeaders,// allow-list; never blindly copy credentials
        String sourceTopic,             // or queue name
        Integer sourcePartition,        // null for a queue
        Long sourceOffset,              // or the queue's message id / receipt
        String failureClass,            // PAYLOAD | ENVIRONMENT | TRANSIENT | AMBIGUOUS
        String failureCode,             // stable machine-readable classifier result
        String classifierVersion,
        String exceptionType,           // fully qualified; the classifier's input
        String boundedRedactedStackTrace,
        int attempts,
        Instant firstFailedAt,
        Instant deadLetteredAt,
        String consumerGroup,
        String buildVersion,            // which deploy failed on it
        String schemaId,
        String operationId,
        String traceId) {}              // distributed-tracing-design
```

Why each of the less obvious ones:

- **Raw bytes, not the object.** The most common permanent failure is that the payload cannot
  be turned into an object at all. Storing `payload.toString()` loses the bytes and with them
  any chance of diagnosing an encoding or schema problem.
- Bound inline size; for a large payload store an immutable encrypted blob plus digest and
  access-controlled reference. Broker message-size limits apply again on the DLQ path.
- **`sourcePartition` and `sourceOffset`.** Without them you cannot tell whether the record was
  skipped (leaving an ordering gap) or the partition was blocked, and you cannot reconstruct
  the sequence around it while the source retention lasts.
- **`firstFailedAt` versus `deadLetteredAt`.** The gap between them is how long the record was
  retried. A large gap on a permanent failure means the classifier is wrong.
- **`buildVersion`.** The single field that answers "did a deploy cause this?" without
  correlating dashboards. One version accounting for everything is the incident signature.
- **`failureCode` and classifier version.** They let tooling re-evaluate old decisions after
  rules or deployments change; an exhausted retry budget is recorded separately from cause.

Store the DLQ's retention explicitly and make it longer than the alert-to-action time,
weekends included. A DLQ inheriting the source topic's retention deletes the evidence on a
schedule nobody chose.

Apply the source's data classification or stricter controls: encryption, tenant-scoped ACLs,
audit, legal hold/deletion, regional residency and field minimization. Stack traces and headers
often contain tokens, SQL values or user identifiers. Verify that deletion removes both the
envelope and any external blob.

## Atomic quarantine transfer

The invariant is: a source record is not acknowledged past until either its business effect or
its quarantine record is durable. Options:

- Kafka consume → DLQ produce → offset commit in one correctly configured Kafka transaction;
- broker-native dead-letter/redrive feature with documented delivery and retention semantics;
- durable transfer ledger keyed by source identity, idempotent DLQ publish, then source ack;
- stop/pause when quarantine cannot be made durable.

A plain asynchronous DLQ `send()` followed by source acknowledgement loses data when the send
fails or its outcome is unknown. Retrying publish requires a stable quarantine ID such as
`(cluster, topic, partition, offset, consumer-purpose)` so the DLQ itself does not multiply.

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
2. Replay through a controlled path that invokes the same validation, authorization,
   idempotency and business handler. Reinjecting the source topic is simple but changes order,
   can loop and may collide with live traffic; a dedicated replay topic/job is valid when it
   shares production code and observability.
3. Rate-limit it. Full-rate redrive of a backlog accumulated during an outage recreates the
   outage; a redrive is a load test aimed at a dependency that just recovered.
4. Redrive in batches with a stop condition: if the failure rate of the redriven records
   exceeds a threshold, stop. The fix was not the fix.
5. Reconcile by stable quarantine/operation ID: selected = terminally applied + terminally
   rejected + still pending/quarantined. Count equality alone misses duplicates; verify unique
   business effects and retain an immutable audit of disposition.

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

- **Genuine poison.** Publish invalid bytes under a supported schema and assert secure raw-byte
  capture, stable source identity and atomic quarantine/offset behavior. Separately make the
  schema registry/key unavailable and assert the fleet pauses rather than quarantining all data.
- **Transient failure, not dead-lettered.** Stub the dependency to fail with a connection error
  for 30 seconds and then recover. Assert the record is processed successfully and the DLQ is
  empty. This test is what stops "attempts > 5 → DLQ" from being reintroduced.
- **Redrive.** Dead-letter a record, deploy the fix, redrive, and assert exactly one applied
  side effect downstream and an empty DLQ. Run it against the same handler the production
  redrive uses, or the test proves nothing about the tool you will actually run.
- **Transfer ambiguity.** Apply DLQ publish then drop its acknowledgement/crash before source
  commit; restart and prove one logical quarantine entry and no source loss.
- **Privacy/size.** Include oversized payload, secrets in headers/stack and tenant isolation;
  assert blob fallback, redaction, ACLs and deletion of envelope plus blob.

## Primary references

- [Kafka transactions and delivery semantics](https://kafka.apache.org/documentation/#semantics)
- [AWS SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [Google Cloud Pub/Sub dead-letter topics](https://cloud.google.com/pubsub/docs/dead-letter-topics)
