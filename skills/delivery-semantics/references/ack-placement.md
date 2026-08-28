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

This is the default worth defending. The duplicate window is the batch, not one record: a
crash after the twentieth of fifty records replays all fifty, because the offset is
per-partition, not per-record. Commit per record and the duplicate window shrinks to one at
the cost of one round trip per record — a throughput decision, not a correctness one.

## Position 3 — side effect and offset in one transaction

Only closes if both live in the same transactional system. Two shapes:

- **Both inside Kafka** — a transactional producer that also commits the consumed offsets
  inside the transaction. Scope and limits: `exactly-once-boundary.md`.
- **Side effect in a database** — write the business row and the consumed offset in the
  _same_ database transaction, and restore the consumer position from that table on
  startup. The broker's own offset store is then advisory. This works because there is one
  commit, and it fails the moment a second store joins.

## Visibility-timeout queues (SQS, JMS, RabbitMQ ack)

The same three positions appear with different names. The message is invisible to other
consumers for a timeout; deleting or acknowledging it is the ack.

```java
// JMS: CLIENT_ACKNOWLEDGE puts the ack under the application's control.
var session = connection.createSession(false, Session.CLIENT_ACKNOWLEDGE);
var message = consumer.receive(5_000);
handler.apply(message.getBody(String.class));
message.acknowledge();                 // process-then-ack: at-least-once
```

`Session.AUTO_ACKNOWLEDGE` acknowledges around the delivery to the listener rather than
around your side effect, so a handler that throws or a process that dies mid-handler is
where the at-most-once behaviour leaks in. `DUPS_OK_ACKNOWLEDGE` is lazy acknowledgement
and says so in its name.

The failure mode unique to this family is **timeout expiry under a slow handler**: the
timeout elapses while the handler is still running, the message becomes visible, a second
consumer picks it up, and both complete. No retry occurred and nothing failed.

- Set the timeout above the handler's p99.9, not its p50 — the tail is what redelivers.
- Extend the timeout from inside a long handler (SQS `ChangeMessageVisibility`) rather than
  setting one global timeout sized for the worst handler in the queue.
- Read the redelivery signal and treat it as information, not noise: JMS exposes
  `JMSRedelivered` and a `JMSXDeliveryCount` property; brokers expose an equivalent
  delivery counter. A first delivery and a redelivery are different situations for
  logging and for the dead-letter decision (`poison-messages-and-dlq`).

## Review checklist

- [ ] The ack/commit statement is _after_ every side effect the record causes.
- [ ] `enable.auto.commit` is `false` wherever the guarantee matters.
- [ ] The handler is repeat-safe, or the path is documented as at-most-once on purpose.
- [ ] `max.poll.interval.ms` exceeds the batch handler's worst case, or the batch size is
      bounded — otherwise the consumer is evicted mid-batch and the batch is redelivered.
- [ ] Visibility timeout exceeds the handler's p99.9, or is extended in-flight.
- [ ] A test kills the process between the side effect and the commit and asserts the
      recovered downstream state.
