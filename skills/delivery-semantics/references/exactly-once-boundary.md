# The exactly-once boundary, and what to do outside it

## What a Kafka transaction actually covers

A transactional producer (`transactional.id` set, `initTransactions()` once, then
`beginTransaction()` / `sendOffsetsToTransaction()` / `commitTransaction()`) makes one
atomic unit out of:

- records produced to one or more partitions **of the same cluster**, and
- the consumed offsets committed through `sendOffsetsToTransaction`.

Consumers configured `isolation.level=read_committed` filter aborted records and do not read
past the last stable offset. Under Kafka's durability, fencing and retention assumptions,
that combination gives an atomic read-process-write result within one Kafka cluster.
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
- **Downstream consumers reading `read_uncommitted`.** They
  observe aborted records, and the guarantee ends at their first read.
- **Reproducibility.** A nondeterministic transformation can produce a different value after
  abort and replay. `read_committed` consumers still see only the committed attempt, so this
  does not itself violate atomic visibility, but it harms deterministic rebuilds, audit and
  comparison with external observations.
- **Consumers of the output topic that then do their own external work.** The boundary ends
  at the topic; their side effects are back to at-least-once.

`transactional.id` identifies a transactional producer lineage and enables epoch-based
fencing. It must be unique across concurrently active logical producers; frameworks derive
per-instance IDs and manage recovery, so do not blindly assign one literal ID to every
replica. Producer fencing, transaction timeouts and expired transactional metadata are
operational failure modes that need metrics and restart tests.

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
- Multiple relays require an atomic claim/lease, partition ownership or CDC protocol. A
  naive `SELECT` followed by update races; even a correct relay remains at-least-once if it
  publishes before marking the row complete.
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
- the required effect is outside Kafka, or the transaction latency, open-transaction
  backpressure and operational fencing cost exceed the value of atomic Kafka output

Prefer the outbox instead when:
- the source of truth is a database and the message is a consequence of a row

Prefer at-least-once plus an idempotent consumer instead when:
- the side effect is the consumer's own write to a store it can key on
- any of the transaction conditions above fails
```

## Evidence and failure matrix

| Cut point                                  | Expected recovery evidence                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Before external effect                     | Input is retried; no effect exists                                    |
| Effect committed, local response lost      | Retry occurs; idempotency key or reconciliation finds one effect      |
| Kafka output sent, transaction aborted     | `read_committed` sees no output; input offset is not advanced         |
| Kafka transaction commit response lost     | client resolves transaction/fencing state; no external effect assumed |
| Outbox row committed, relay not run        | scanner/CDC eventually publishes                                      |
| Relay published, sent marker not committed | publish repeats; downstream dedup invariant still holds               |

Test each relevant cut point with broker restarts, network ambiguity, partition revocation
and process death. Assert the business invariant, not merely record counts: duplicate log
records can be acceptable while duplicate charges are not.
