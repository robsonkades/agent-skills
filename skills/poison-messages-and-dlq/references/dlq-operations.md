# Operating a dead-letter queue

## The record

A DLQ entry includes diagnostic context alongside preserved payload evidence. Capture what
recovery needs before source retention, pod replacement or log rotation removes it; choose
fields and protected references for the actual source and consumer contract.

```java
import java.net.URI;
import java.time.Instant;
import java.util.List;

// Java 17 conceptual schema, not a complete validated/immutable DTO or serializer.
public record DeadLetter(
        boolean sourceValueWasNull,     // original transport value, not a decoder's result
        byte[] boundedPayload,          // protected bytes, null for original null or blobRef
        URI blobRef,                    // immutable protected object + digest for large data
        String payloadDigest,
        List<SafeHeader> safeHeaders,   // ordered allow-list; bound count and encoded bytes
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
        String traceId) {               // distributed-tracing-design
    public record SafeHeader(String name, byte[] value) {}
}
```

In an implementation, enforce bounds and origin variants and copy mutable arrays, header lists
and each header's value as required by the ownership contract; records alone do not do this.
Validate payload representation: original null has neither inline bytes nor a blob; otherwise
exactly one must be present. A zero-length byte array is present and is not a null value.
Preserve any authoritative business sequence/version separately when replay requires it.

Why each of the less obvious ones:

- **Raw bytes, not the object.** A payload may fail before it can be turned into an object.
  Storing `payload.toString()` loses the bytes and with them
  any chance of diagnosing an encoding or schema problem.
- **Null is a source value, not missing evidence.** A Kafka tombstone can be a valid deletion
  under the consumer contract. A deserializer may also yield null after failing on non-null
  bytes; inspect its error metadata and retained input. Never replay that failure as a deletion
  or replace an original null with empty bytes. If the original representation is unknown,
  record the evidence gap rather than asserting `sourceValueWasNull`.
- **Replay headers have their own data contract.** Kafka permits repeated header names and
  byte-array values, with ordered iteration. Keep required allowlisted entries in that form;
  flattening into a string map or decoding arbitrary values as UTF-8 can change replay behavior.
  A diagnostic text summary is not a replacement for required replay metadata.
- Bound inline size; for a large payload store an immutable encrypted blob plus digest and
  access-controlled reference. Budget the complete serialized envelope, key and headers against
  the producer/broker limits, including encoding/encryption overhead. Repeated recovery can
  accumulate exception/origin headers until publication fails even with a small payload.
  Retain only required inline history or externalize protected evidence without removing replay
  prerequisites; if the remaining envelope cannot be durably published, do not acknowledge source
  work. Check the deployed recoverer's header append/strip policy rather than assuming it is bounded.
- **`sourcePartition` and `sourceOffset`.** Without them you cannot tell whether the record was
  skipped (leaving an ordering gap) or the partition was blocked, and you cannot reconstruct
  the sequence around it while the source retention lasts.
- **Failure timestamps.** Their span includes waiting/outages, not only active retries;
  inspect attempt history before concluding the classifier wasted work.
- **`buildVersion`.** Correlate failures with rollout exposure, inputs and environment.
  Concentration on one version is evidence to investigate, not proof of deployment causality.
- **`failureCode` and classifier version.** They let tooling re-evaluate old decisions after
  rules or deployments change; an exhausted retry budget is recorded separately from cause.

Verify the effective DLQ retention against detection, investigation and recovery time,
weekends included when recovery depends on a human. An inherited retention is acceptable
only when its remaining lifetime meets that contract; it is not an unexplored default.

Verify the broker's retention clock. SQS standard DLQ expiry uses original enqueue time;
FIFO resets that timestamp on transfer. An age metric may measure time since DLQ arrival
instead of remaining lifetime, so it cannot alone prove adequate recovery time.

For a Kafka DLT, inspect effective `cleanup.policy` as well as time/size retention. Compaction
by the original business key can remove earlier unresolved failures for that key. Preserve each
required disposition with an append-retained topic or a unique quarantine key, retaining the
original key separately for replay. A compacted disposition ledger can be intentional when
updates represent the same quarantine identity. If a failed original-null record must survive,
publish a non-null envelope containing its null marker; a naked null DLT value is a tombstone
under compaction. Validate that the selected policy preserves the actual recovery workload.

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

Redrive is a controlled replay of DLQ records back onto the normal path. Establish and
exercise it as part of a new or changed recovery design; reuse an adequate existing tool.
During an incident, use existing authority and evidence to contain impact without waiting
for new redrive tooling. Running replay still requires its safety preconditions; irreparable
or no-longer-valid work may instead need an auditable terminal rejection.

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

1. Preserve recoverable evidence and selected-record/disposition tracking through partial
   failure. A protected snapshot/copy is one option; verified source retention, checkpoints
   and durable audit can also suffice. Do not duplicate all sensitive payloads when existing
   controls preserve the needed evidence. Native redrive status alone need not prove each
   business disposition; retain stable operation identity even if broker IDs change.
2. Replay through a controlled path that invokes the same validation, authorization,
   idempotency and business handler. Reinjecting the source topic is simple but changes order,
   can loop and may collide with live traffic; a dedicated replay topic/job is valid when it
   shares production code and observability.
3. Bound rate/concurrency using measured downstream headroom together with live work. Start
   conservatively when capacity is uncertain, then adjust from observed load and outcomes;
   a supported high rate is not inherently unsafe, and redrive itself is not a load-test result.
4. Redrive in batches with a stop condition: if the failure rate of the redriven records
   exceeds a threshold, stop and investigate the remaining cause or new load-induced failure.
5. Reconcile by stable quarantine/operation ID: selected = terminally applied + terminally
   rejected + still pending/quarantined. Count equality alone misses duplicates; verify unique
   business effects and retain an immutable audit of disposition.

## Alerting

Choose signals that cover failure discovery and timely resolution under the actual recovery
contract. Reuse adequate monitoring; these need not be two separate pages:

- **Arrival rate** — for an instrumented cumulative counter, `rate(dlq_messages_total[5m])`
  estimates transfers per second. Interpret changes with traffic, classifier and business
  impact; even one critical record or a sustained absolute backlog can require action.
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

Select failure paths that challenge the new or changed contract. Use the target broker and
actual handler/transfer boundaries when validating broker behavior; existing integration
fixtures (Testcontainers where supported) can help. A mocked send/ack does not validate
transactions, retention or rebalances. Reuse adequate prior evidence for an unchanged design:

- **Genuine poison.** Publish invalid bytes under a supported schema and assert secure raw-byte
  capture, stable source identity and atomic quarantine/offset behavior. Separately make the
  schema registry/key unavailable and assert affected admission is contained rather than
  classifying all valid data as permanently poison; preserve independent healthy work.
- **Transient failure and budget exhaustion.** Fail a dependency and recover it within the
  configured retry budget; assert successful processing without an unresolved disposition.
  Separately exceed the budget and verify durable holding/pause/escalation, unchanged cause
  classification and owned recovery. If a native DLQ holds this work, verify its recovery
  contract instead of asserting that the queue name makes the routing wrong.
- **Redrive.** Dead-letter a repairable record, repair the cause, redrive twice across a
  restart, and assert one logical side effect and no unresolved disposition. Retain audit
  evidence; test irreparable records as terminal rejection. Run the same handler the production
  redrive uses, or the test proves nothing about the tool you will actually run.
- **Transfer ambiguity.** Apply DLQ publish then drop its acknowledgement/crash before source
  commit; restart and prove one logical quarantine entry and no source loss.
- **Effect ambiguity and ordering.** Apply an external effect, lose its response and replay;
  assert one logical effect. Fail `A:48` while `A:49` arrives during delayed retry/rebalance;
  assert the chosen gate or documented reconciliation, not merely ordered DLQ reads.
- **Envelope fidelity.** Distinguish source null, empty bytes, externalized bytes and decoder
  failure on non-null input. Round-trip required duplicate/binary headers in order. For a
  compacted DLT, test two unresolved failures with the same original business key and a failed
  tombstone; each required quarantine disposition must remain recoverable after cleaning.
- **Privacy/size.** Include oversized payload, accumulated retry headers/stack, secrets and tenant
  isolation; assert complete-envelope bounds, blob fallback, redaction, ACLs and deletion of
  envelope plus blob. Failed quarantine publication must not advance the source acknowledgement.

## Primary references

- [Kafka 4.1 transactions and delivery semantics](https://kafka.apache.org/41/design/design/#semantics)
- [Kafka 4.1 compaction and tombstones](https://kafka.apache.org/41/design/design/#compaction)
- [Kafka 4.1 headers: repeated names and iteration order](https://kafka.apache.org/41/javadoc/org/apache/kafka/common/header/Headers.html)
- [Kafka 4.1 header values](https://kafka.apache.org/41/javadoc/org/apache/kafka/common/header/Header.html)
- [Spring Kafka 3.3 null values and tombstones](https://docs.spring.io/spring-kafka/reference/3.3/kafka/tombstones.html)
- [Spring Kafka 3.3 dead-letter header growth and publication failures](https://docs.spring.io/spring-kafka/reference/3.3/kafka/annotation-error-handling.html)
- [AWS SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [AWS SQS redrive: rate, ordering and new message identity](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue-redrive.html)
- [Google Cloud Pub/Sub dead-letter topics](https://cloud.google.com/pubsub/docs/dead-letter-topics)
