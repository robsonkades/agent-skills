# The exactly-once boundary, and what to do outside it

## What a Kafka transaction actually covers

A transactional producer (`transactional.id` set, `initTransactions()` once, then
`beginTransaction()` / `sendOffsetsToTransaction()` / `commitTransaction()`) makes one
atomic unit out of:

- records produced to one or more partitions **of the same cluster**, and
- the consumed offsets committed through `sendOffsetsToTransaction`.

Consumers configured `isolation.level=read_committed` do not see records of an aborted
transaction, and do not read past the last stable offset. That combination gives
**exactly-once processing within one Kafka cluster, for a read-process-write topology**.
Kafka Streams packages the same machinery behind `processing.guarantee=exactly_once_v2`.

```java
// Conceptual: the atomic unit is produce + offsets, nothing else.
producer.initTransactions();
while (running) {
    var records = consumer.poll(Duration.ofMillis(500));
    producer.beginTransaction();
    for (var record : records) {
        producer.send(new ProducerRecord<>("out", transform(record.value())));
    }
    producer.sendOffsetsToTransaction(offsetsOf(records), consumer.groupMetadata());
    producer.commitTransaction();
}
```

## What it does not cover

- **Any side effect outside the cluster.** An HTTP call, a JDBC write to another store, an
  email, a file. `abortTransaction()` un-produces records; it cannot un-charge a card.
- **A second Kafka cluster.** MirrorMaker-style replication is a separate producer.
- **Downstream consumers reading `read_uncommitted`** — the default in some clients. They
  observe aborted records, and the guarantee ends at their first read.
- **Non-deterministic transformation.** Replay after abort re-runs `transform`; if it reads
  wall-clock time or a random value, the retried output differs from the aborted one and
  downstream sees two different records for one input.
- **Consumers of the output topic that then do their own external work.** The boundary ends
  at the topic; their side effects are back to at-least-once.

`transactional.id` must be stable across restarts of the same logical processor, because
it is what lets the broker fence the previous incarnation. Sharing one id across concurrent
instances fences them against each other.

## Reduction 1 — transactional outbox

Use when the side effect is "publish a message" and the source of truth is a database.

Write the business row and the outbox row in **one database transaction**; a separate relay
reads the outbox and publishes. The dual-write problem disappears because there is one
commit.

```java
@Transactional
public void placeOrder(Order order) {
    orders.save(order);
    outbox.save(new OutboxRecord(order.id(), "OrderPlaced", payload(order)));
}
```

- The relay is **at-least-once** by construction: it can publish and die before marking the
  row sent. Consumers must be repeat-safe — `idempotency`.
- Run one relay, or partition the outbox by a claim column; two unpartitioned relays
  publish everything twice.
- The relay's ordering is whatever its query orders by; per-key ordering is
  `message-ordering-and-partitioning`, not a property the outbox grants.

## Reduction 2 — idempotent consumer with a dedup store

Use when the side effect is a write the consumer performs itself.

Record a processed marker and perform the side effect in the same transaction as the
business write, keyed by something stable. Duplicate deliveries then collapse.

```java
@Transactional
public void handle(String messageId, Payment payment) {
    if (processed.insertIfAbsent(messageId)) {   // conditional insert, not check-then-act
        ledger.apply(payment);
    }
}
```

The dedup store's real design problems — key choice, scope, TTL, the concurrent-duplicate
race, and replaying the stored response — are `idempotency`. What belongs here is only the
boundary: this reduces exactly-once _processing_ to at-least-once _delivery_ plus a
deduplicated _application_, which is `effectively-once`. It is not exactly-once delivery,
and the message is still transmitted more than once.

## Decision block

```text
Use a Kafka transaction when:
- the entire read-process-write stays within one Kafka cluster
- the transformation is deterministic given the input record
- every downstream consumer sets isolation.level=read_committed
- transactional.id is stable per logical processor and unique across instances

Avoid a Kafka transaction when:
- the handler calls an external system, writes another database, or sends anything
- throughput per partition matters more than the duplicate — transactions add a
  commit round trip and hold the last stable offset back for readers

Prefer the outbox instead when:
- the source of truth is a database and the message is a consequence of a row

Prefer at-least-once plus an idempotent consumer instead when:
- the side effect is the consumer's own write to a store it can key on
- any of the transaction conditions above fails
```
