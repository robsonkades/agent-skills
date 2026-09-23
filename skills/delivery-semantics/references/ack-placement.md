# Where the acknowledgement sits

The guarantee depends on code, broker/provider contract and failure assumptions. These are
partial Java 17 sketches: clients/handlers/imports and lifecycle handling are omitted. Kafka
manual-commit sketches require `enable.auto.commit=false`, one consumer owner thread and a
synchronous handler that returns only after its effect commits durably.

## Position 1 — ack, then process: at-most-once

```java
// Conceptual: omits error handling and shutdown.
var records = consumer.poll(Duration.ofMillis(500));
consumer.commitSync();                 // offset advanced before any work
for (var record : records) {
    handler.apply(record.value());     // crash here loses automatic replay of this work
}
```

Choose this only under explicit loss acceptance, for example best-effort cache warming.
If `commitSync` fails or times out, stop before the effect; this sketch does not establish
global duplicate freedom. Crashing after a confirmed commit loses automatic replay, though
retained Kafka data might still be recoverable by an intentional replay/reconciliation.

## Position 2 — process, then ack: at-least-once

```java
var records = consumer.poll(Duration.ofMillis(500));
for (var record : records) {
    handler.apply(record.value());     // must be safe to run twice — see idempotency
}
consumer.commitSync();                 // crash before commit can replay completed work
```

This is the usual loss-averse choice. The replay window is completed work at or after the
committed next-to-process offset **in each partition**, if recovery resumes there. An uncertain
commit may already have advanced that position; inspect authoritative progress. A batch can span partitions, and Kafka offsets
are positions within a partition, not batch-level or record-level acknowledgements. Explicit
per-partition commits can shrink that window but add calls and coordination; commit the next
offset to process, preserve completion in delivery order, and never jump over unfinished work.
Compaction and control records create valid offset gaps; `read_committed` also skips aborted
records. For delivered offsets 40 and 43, completing 40 permits progress to 43; it does not require seeing 41 or 42,
and completing 43 first does not permit progress past unfinished 40.

Failure recovery must distinguish **local position** from **committed progress**. Suppose
`poll` returns 40 and 43 and advances its position to 44; the handler completes 40 but fails
on 43. Omitting `commitSync` leaves durable progress unchanged, but the next `poll` does not
automatically replay 43. A later batch commit can then skip it permanently in normal recovery.
Retain/retry unfinished work, seek still-owned partitions to the chosen replay point, or
stop and recover from authoritative progress. Keep completion state for other partitions;
do not commit their unfinished records through a no-argument commit. A framework may provide
this recovery, but verify its error-handler contract. Intentional skip/DLQ is a separate policy.

## Position 3 — side effect and offset in one transaction

Requires one atomic commit covering both durable effect and authoritative progress. Two shapes:

- **Both inside Kafka** — a transactional producer that also commits the consumed offsets
  inside the transaction. Scope and limits: `exactly-once-boundary.md`.
- **Side effect in a database** — write the business row and the consumed offset in the
  _same_ database transaction, and restore the consumer position from that table on
  every assignment, not just process startup. Fence stale owners at the protected database
  writes, with ownership validation atomic with the effect/progress update; an earlier
  ownership lookup is insufficient. Serialize progress updates,
  and key progress by stream/topic/partition plus logical subscriber/group identity, not an
  ephemeral process ID. The broker's own offset
  store is advisory. Seeking alone does not fence a worker still writing after revocation.

## Visibility leases and messaging acknowledgements

SQS-style visibility leases and JMS/RabbitMQ acknowledgements are not one protocol. Apply the
same effect-before-progress reasoning, but verify the provider's exact redelivery contract.

```java
// Java SE: CLIENT_ACKNOWLEDGE puts acknowledgement under application control,
// but acknowledging one consumed message acknowledges all consumed messages in the session.
// Connection is already started and owned by the caller; destination is supplied.
try (var session = connection.createSession(false, Session.CLIENT_ACKNOWLEDGE);
     var consumer = session.createConsumer(destination)) {
    var message = consumer.receive(5_000); // timeout may return null
    if (message != null) {
        handler.apply(message.getBody(String.class)); // durable synchronous completion
        message.acknowledge();
    }
}
```

This sketch also fits a Jakarta EE application client container. In a web/Enterprise Beans
container, an active Jakarta transaction overrides session parameters; without one,
`createSession` with client acknowledgement is provider-dependent and not portable.
Inspect the actual container/framework transaction and acknowledgement contract.

For an asynchronous Jakarta Messaging listener, `AUTO_ACKNOWLEDGE` acknowledges after the
listener returns successfully; for synchronous `receive`, it acknowledges when `receive`
returns, before subsequent application work. That distinction changes the failure window.
`CLIENT_ACKNOWLEDGE` is session-cumulative, and `DUPS_OK_ACKNOWLEDGE` permits lazy
acknowledgement and possible redelivery. Transacted sessions acknowledge through commit.

For visibility-lease queues such as SQS, **timeout expiry under a slow handler** means the
timeout elapses while the handler is still running and the message becomes eligible for
another consumer. Both handlers may then complete. Lease expiry neither cancels the old
handler nor fences its effects; that protection must be enforced where the effect occurs.

- Size the initial lease from measured distributions and operational recovery needs; a
  percentile is not an upper bound. A long lease reduces concurrent duplicates but delays
  recovery after a crash.
- Heartbeat and extend a long-running SQS lease with `ChangeMessageVisibility`, with a maximum
  execution deadline and handling for extension failure. SQS Standard can still redeliver
  within the visibility interval, so lease tuning never replaces idempotency.
- Read the redelivery signal and treat it as information, not noise: JMS exposes
  `JMSRedelivered` and a `JMSXDeliveryCount` property; other providers may expose a flag or
  approximate counter instead. None is a substitute for durable event identity. These signals help
  logging and the dead-letter decision (`poison-messages-and-dlq`).

## Review checklist

- [ ] The ack/commit ordering implements the explicitly chosen loss/duplicate contract.
- [ ] Manual Kafka progress disables auto-commit; any auto-commit design proves completion before subsequent poll/close.
- [ ] The handler is repeat-safe, or the path is documented as at-most-once on purpose.
- [ ] Total batch processing time fits `max.poll.interval.ms`; bounding record count alone
      is insufficient if individual work is unbounded. Otherwise the consumer can be evicted mid-batch. Parallel processing keeps
      polling, pauses partitions with outstanding work and commits only the completed prefix
      of delivered records per partition, regardless of numeric offset gaps.
- [ ] Visibility lease has measured headroom or a heartbeat extension, a maximum work
      deadline, and metrics for extension failure, age and concurrent duplicate execution.
- [ ] Shutdown stops intake, drains only within its deadline, and commits no offset for work
      that did not complete durably.
- [ ] Revocation handling stops or fences work for lost partitions before committing.
- [ ] A test kills the process between the side effect and the commit and asserts the
      recovered downstream state.

## Source

- [Kafka 4.1 consumer: local position, committed progress and offset gaps](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [Jakarta Messaging 3.1 receive timeout and consumer lifecycle](https://jakarta.ee/specifications/messaging/3.1/apidocs/jakarta.messaging/jakarta/jms/messageconsumer)
- [Jakarta Messaging 3.1 specification, section 12.3: container acknowledgement and transactions](https://jakarta.ee/specifications/messaging/3.1/jakarta-messaging-spec-3.1.pdf)
