# Operating a dead-letter queue

## The record

A DLQ entry includes diagnostic context alongside preserved payload evidence. Everything below exists
because someone opening the DLQ three days later cannot get it any other way — the source
topic's retention has expired, the pod is gone, the logs have rotated.

```java
import java.net.URI;
import java.time.Instant;
import java.util.Map;

// Java 17 conceptual schema, not a complete validated/immutable DTO or serializer.
public record DeadLetter(
        byte[] boundedPayload,          // encrypted bytes, or null when blobRef is used
        URI blobRef,                    // immutable protected object + digest for large data
        String payloadDigest,
        Map<String, String> safeHeaders,// allow-list; never blindly copy credentials
        String sourceSystem,            // cluster/account/namespace identity
        String sourceTopic,             // or queue name
        Integer sourcePartition,        // null for a queue
        Long sourceOffset,              // null for a queue; not a business sequence
        String sourceMessageId,         // stable queue ID; not a receipt/ack lease token
        byte[] boundedOriginalKey,      // protected original routing key; enforce its bound
        String failureClass,            // PAYLOAD | ENVIRONMENT | TRANSIENT | AMBIGUOUS
        String failureCode,             // stable machine-readable classifier result
        String classifierVersion,
        String exceptionType,           // fully qualified; the classifier's input
        String boundedRedactedStackTrace,
        int attempts,
        Instant firstFailedAt,
        Instant lastFailedAt,
        Instant deadLetteredAt,
        String consumerGroup,
        String buildVersion,            // which deploy failed on it
        String schemaId,
        String operationId,
        String traceId) {}              // distributed-tracing-design
```

In an implementation, enforce payload/key bounds and origin variants and copy mutable arrays
and header maps as required by the ownership contract; a record alone does not do this.
Preserve any authoritative business sequence/version separately when replay requires it.

Why each of the less obvious ones:

- **Raw bytes, not the object.** The most common permanent failure is that the payload cannot
  be turned into an object at all. Storing `payload.toString()` loses the bytes and with them
  any chance of diagnosing an encoding or schema problem.
- Bound inline size; for a large payload store an immutable encrypted blob plus digest and
  access-controlled reference. Broker message-size limits apply again on the DLQ path.
- **`sourcePartition` and `sourceOffset`.** Without them you cannot tell whether the record was
  skipped (leaving an ordering gap) or the partition was blocked, and you cannot reconstruct
  the sequence around it while the source retention lasts.
- **Failure timestamps.** Their span includes waiting/outages, not only active retries;
  inspect attempt history before concluding the classifier wasted work.
- **`buildVersion`.** Correlate failures with rollout exposure, inputs and environment.
  Concentration on one version is evidence to investigate, not proof of deployment causality.
- **`failureCode` and classifier version.** They let tooling re-evaluate old decisions after
  rules or deployments change; an exhausted retry budget is recorded separately from cause.

Store the DLQ's retention explicitly and make it longer than the alert-to-action time,
weekends included. A DLQ inheriting the source topic's retention deletes the evidence on a
schedule nobody chose.

Verify the broker's retention clock. SQS standard DLQ expiry uses original enqueue time;
FIFO resets that timestamp on transfer. An age metric may measure time since DLQ arrival
instead of remaining lifetime, so it cannot alone prove adequate recovery time.

Apply the source's data classification or stricter controls: encryption, tenant-scoped ACLs,
audit, legal hold/deletion, regional residency and field minimization. Stack traces and headers
often contain tokens, SQL values or user identifiers. Verify that deletion removes both the
envelope and any external blob.

## Atomic quarantine transfer

The invariant is: do not acknowledge past work without a durable processing outcome or
quarantine disposition. This prevents loss but does not alone prevent repeated business
effects after an effect succeeds and source acknowledgement fails. Options for quarantine:

- Kafka consume → DLQ produce → offset commit in one correctly configured Kafka transaction;
- broker-native dead-letter/redrive feature with documented delivery and retention semantics;
- durable transfer ledger keyed by source identity, repeat-safe DLQ publish, then source ack;
- stop/pause when quarantine cannot be made durable.

A plain asynchronous DLQ `send()` followed by source acknowledgement loses data when the send
fails or its outcome is unknown. Retrying publish requires a stable quarantine ID such as
`(cluster, topic, partition, offset, consumer-purpose)` to reconcile duplicate quarantine attempts.

Scope the ID to the source's lifetime if topics can be recreated. Physical duplicate publishes
may still occur; durable deduplication establishes one logical disposition. Producer-session
idempotence alone does not deduplicate application replay across restarts.

Kafka transactions cover Kafka outputs and offsets, not an external database/HTTP effect.
For database effects, atomically record the operation ID and effect in the sink transaction;
an outbox can persist outgoing intent with that transaction, but its relay still needs
repeat-safe delivery. For ambiguous external effects, use sink idempotency/status lookup and
reconciliation before retry. Preserve the original operation ID across new broker IDs.

Inspect native DLQ guarantees rather than equating them with atomic application transfer:
Pub/Sub forwarding attempts are approximate/best-effort and require the documented IAM setup.
Verify destination subscription, retention and recovery behavior in the deployed service.

## Redrive

Redrive is a controlled replay of DLQ records back onto the normal path. It is a first-class
operation, written and tested before the first incident, because the version written under
pressure skips the preconditions.

**Preconditions — all of them, checked before starting:**

- [ ] Representative records demonstrate that the cause is repaired in the active environment.
      This may be a code fix, rollback, schema/configuration repair or dependency recovery;
      comparing build version numbers is neither necessary nor sufficient.
- [ ] The handler is repeat-safe (`idempotency`). A redrive is by definition a duplicate
      delivery of something that may have partially applied before it failed. Replay does
      not confer idempotency: prove sink-side deduplication/atomicity or reconcile ambiguity.
- [ ] The records are still **semantically valid**. This is the precondition teams skip: a
      stale command may no longer be authorized by current state, whereas a historical fact
      may still be needed to rebuild a projection. Use the consumer's business contract and
      authority version; age alone is not permission to discard historical facts.
- [ ] The ordering consequence is understood. Redriving records for the same key sends them in
      DLQ order, which need not equal production order. If per-key ordering matters, sort
      by source offset only within a common original partition/lifetime, or use an authoritative business
      sequence across origins. Sorting does not undo already applied later effects: gate
      live traffic, reconcile or rebuild under the required ordering contract.
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
   exceeds a threshold, stop and investigate the remaining cause or new load-induced failure.
5. Reconcile by stable quarantine/operation ID: selected = terminally applied + terminally
   rejected + still pending/quarantined. Count equality alone misses duplicates; verify unique
   business effects and retain an immutable audit of disposition.

## Alerting

Two signals, and they answer different questions:

- **Arrival rate** — `rate(dlq_messages_total[5m])`. Something started failing. A step change
  matters far more than an absolute value; one poison record a day is normal for many systems,
  and the same rate arriving in one minute is not.
- **Age of the oldest unresolved record** — compare with the recovery deadline and retention
  budget. Route a ticket/page to its owning team according to urgency; retained terminal
  audit entries should not keep the actionable-age alarm firing.

Two more worth having:

- **Failures by build and classifier code.** Bound metric label cardinality; retain detailed
  exceptions in controlled evidence. Compare rollout/input exposure before implicating a
  deploy, pause mass quarantine during investigation and roll back when supported by evidence.
- **Unresolved backlog and disposition rate.** Track whether actionable work drains within
  its recovery target, separately from audit retention and intentional terminal rejection.
  Thresholds and page/ticket policy are `slo-and-alerting`.

## Testing the poison path

Exercise these failure paths using the target broker and actual handler/transfer boundaries.
Use existing integration fixtures (Testcontainers where supported); a mocked send/ack does
not validate broker transactions, retention or rebalances:

- **Genuine poison.** Publish invalid bytes under a supported schema and assert secure raw-byte
  capture, stable source identity and atomic quarantine/offset behavior. Separately make the
  schema registry/key unavailable and assert the fleet pauses rather than quarantining all data.
- **Transient failure, not dead-lettered.** Stub the dependency to fail with a connection error
  for 30 seconds and then recover. Assert the record is processed successfully and the DLQ is
  empty. This test is what stops "attempts > 5 → DLQ" from being reintroduced.
- **Redrive.** Dead-letter a repairable record, repair the cause, redrive twice across a
  restart, and assert one logical side effect and no unresolved disposition. Retain audit
  evidence; test irreparable records as terminal rejection. Run the same handler the production
  redrive uses, or the test proves nothing about the tool you will actually run.
- **Transfer ambiguity.** Apply DLQ publish then drop its acknowledgement/crash before source
  commit; restart and prove one logical quarantine entry and no source loss.
- **Effect ambiguity and ordering.** Apply an external effect, lose its response and replay;
  assert one logical effect. Fail `A:48` while `A:49` arrives during delayed retry/rebalance;
  assert the chosen gate or documented reconciliation, not merely ordered DLQ reads.
- **Privacy/size.** Include oversized payload, secrets in headers/stack and tenant isolation;
  assert blob fallback, redaction, ACLs and deletion of envelope plus blob.

## Primary references

- [Kafka 4.1 transactions and delivery semantics](https://kafka.apache.org/41/design/design/#semantics)
- [AWS SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [Google Cloud Pub/Sub dead-letter topics](https://cloud.google.com/pubsub/docs/dead-letter-topics)
