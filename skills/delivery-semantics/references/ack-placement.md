# Where the acknowledgement sits

The guarantee is a property of the code, not of the broker. Three positions, three
guarantees. All three compile and all three pass a happy-path test.

## Position 1 — ack, then process: at-most-once

```java
// Conceptual: omits error handling and shutdown.
var records = consumer.poll(Duration.ofMillis(500));
consumer.commitSync();                 // offset advanced before any work
for (var record : records) {
    handler.apply(record.value());     // crash here loses these records forever
}
```

Choose this only when a lost record is cheaper than a duplicated one _and_ nobody
reconciles: sampled telemetry, presence pings, cache-warming hints. Never for anything a
customer can see the absence of. The loss is silent — there is no failed message, no DLQ
entry, no log line; the offset simply moved.

## Position 2 — process, then ack: at-least-once

```java
var records = consumer.poll(Duration.ofMillis(500));
for (var record : records) {
    handler.apply(record.value());     // must be safe to run twice — see idempotency
}
consumer.commitSync();                 // crash before this replays the whole batch
```

This is the usual loss-averse choice. The replay window is every completed record after the
last committed offset **in each partition**. A batch can span partitions, and Kafka offsets
are positions within a partition, not batch-level or record-level acknowledgements. Explicit
per-partition commits can shrink that window but add calls and coordination; commit the next
offset to process, preserve contiguous completion, and never jump over unfinished work.

## Position 3 — side effect and offset in one transaction

Only closes if both live in the same transactional system. Two shapes:

- **Both inside Kafka** — a transactional producer that also commits the consumed offsets
  inside the transaction. Scope and limits: `exactly-once-boundary.md`.
- **Side effect in a database** — write the business row and the consumed offset in the
  _same_ database transaction, and restore the consumer position from that table on
  startup. The broker's own offset store is then advisory. This works because there is one
  commit, and it fails the moment a second store joins.

## Visibility leases and messaging acknowledgements

SQS-style visibility leases and JMS/RabbitMQ acknowledgements are not one protocol. Apply the
same effect-before-progress reasoning, but verify the provider's exact redelivery contract.

```java
// Jakarta Messaging: CLIENT_ACKNOWLEDGE puts acknowledgement under application control,
// but acknowledging one consumed message acknowledges all consumed messages in the session.
var session = connection.createSession(false, Session.CLIENT_ACKNOWLEDGE);
var message = consumer.receive(5_000);
handler.apply(message.getBody(String.class));
message.acknowledge();                 // process-then-ack: at-least-once
```

For an asynchronous Jakarta Messaging listener, `AUTO_ACKNOWLEDGE` acknowledges after the
listener returns successfully; for synchronous `receive`, it acknowledges when `receive`
returns, before subsequent application work. That distinction changes the failure window.
`CLIENT_ACKNOWLEDGE` is session-cumulative, and `DUPS_OK_ACKNOWLEDGE` permits lazy
acknowledgement and possible redelivery. Transacted sessions acknowledge through commit.

The failure mode unique to this family is **timeout expiry under a slow handler**: the
timeout elapses while the handler is still running, the message becomes visible, a second
consumer picks it up, and both complete. No retry occurred and nothing failed.

- Size the initial lease from measured distributions and operational recovery needs; a
  percentile is not an upper bound. A long lease reduces concurrent duplicates but delays
  recovery after a crash.
- Heartbeat and extend a long-running SQS lease with `ChangeMessageVisibility`, with a maximum
  execution deadline and handling for extension failure. SQS Standard can still redeliver
  within the visibility interval, so lease tuning never replaces idempotency.
- Read the redelivery signal and treat it as information, not noise: JMS exposes
  `JMSRedelivered` and a `JMSXDeliveryCount` property; brokers expose an equivalent
  delivery counter. A first delivery and a redelivery are different situations for
  logging and for the dead-letter decision (`poison-messages-and-dlq`).

## Review checklist

- [ ] The ack/commit statement is _after_ every side effect the record causes.
- [ ] `enable.auto.commit` is `false` wherever the guarantee matters.
- [ ] The handler is repeat-safe, or the path is documented as at-most-once on purpose.
- [ ] `max.poll.interval.ms` exceeds the batch handler's worst case, or the batch size is
      bounded — otherwise the consumer can be evicted mid-batch. Parallel processing keeps
      polling, pauses assigned partitions and commits only contiguous completed offsets.
- [ ] Visibility lease has measured headroom or a heartbeat extension, a maximum work
      deadline, and metrics for extension failure, age and concurrent duplicate execution.
- [ ] Shutdown stops intake, drains only within its deadline, and commits no offset for work
      that did not complete durably.
- [ ] Revocation handling stops or fences work for lost partitions before committing.
- [ ] A test kills the process between the side effect and the commit and asserts the
      recovered downstream state.
