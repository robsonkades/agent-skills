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

The partial Java 17/Kafka 4.1 sketch assumes consumer `enable.auto.commit=false`, a configured
transactional producer and compatible broker features. Use `read_committed` on the input
consumer when input may be transactional, as well as on downstream consumers. No separate
consumer offset commit is allowed for the records represented by the transaction.

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

`offsetsOf(records)` is an omitted helper: return each partition's next position after its
completed records, never its last processed offset or an offset past unfinished work. The
production loop also needs these state transitions, not a catch-and-continue wrapper:

- On an abortable failure, abort and replay the uncommitted input: aborting the producer does
  not rewind the consumer position. Seek the still-owned partitions to the batch start or
  rebuild assignment from authoritative committed offsets before further processing.
- For Kafka 4.1 `commitTransaction` timeout/interruption, the commit may still complete.
  Retry that same operation according to its API, or close the producer and recover; do not
  switch to abort. Fatal fencing/authorization failures require stopping that producer.
- On reassignment, discard stale work and use current group metadata. Bound poll/transaction
  duration, and close clients under an explicit shutdown policy.

## What it does not cover

- **Any side effect outside the cluster.** An HTTP call, a JDBC write to another store, an
  email, a file. `abortTransaction()` marks records aborted for committed-only readers;
  it does not physically erase them or undo a charge.
- **A second Kafka cluster.** MirrorMaker-style replication is a separate producer.
- **The same business intent at distinct input offsets.** Both records may commit normally;
  Kafka transactions do not discover application-level identity or collapse those duplicates.
- **Downstream consumers reading `read_uncommitted`.** They
  observe aborted records, and the guarantee ends at their first read.
- **Reproducibility.** A nondeterministic transformation can produce a different value after
  abort and replay. `read_committed` consumers still see only the committed attempt, so this
  does not itself violate atomic visibility, but it harms deterministic rebuilds, audit and
  comparison with external observations.
- **Consumers of the output topic that then do their own external work.** The boundary ends
  at the topic; their external effect guarantee depends on their own ack/dedup protocol.

`transactional.id` identifies a transactional producer lineage and enables epoch-based
fencing. It must be unique across concurrently active logical producers; frameworks derive
per-instance IDs and manage recovery, so do not blindly assign one literal ID to every
replica. Producer fencing, transaction timeouts and expired transactional metadata are
operational failure modes that need metrics and restart tests.

## Reduction 1 — transactional outbox

Use when the side effect is "publish a message" and the source of truth is a database.

Write the business row and the outbox row in **one database transaction**; a separate relay
reads the outbox and publishes. Business state and publication intent commit atomically;
broker publication remains a separate step that requires relay recovery and retention.

The `@Transactional` snippets below assume a framework-managed invocation whose transaction
manager enlists both repositories in the same database transaction. Verify propagation,
rollback rules and connection ownership; annotations on independently committed stores do
not make writes atomic. Ack the consumed input only after the encompassing transaction commits.

```java
@Transactional
public void placeOrder(Order order) {
    orders.save(order);
    outbox.save(new OutboxRecord(order.id(), "OrderPlaced", payload(order)));
}
```

- Publishing before marking the row sent permits duplicates if the relay dies between them.
  At-least-once publication also depends on retained outbox state and eventual successful
  relay recovery; consumers must be repeat-safe — `idempotency`.
- Multiple relays require an atomic claim/lease, partition ownership or CDC protocol. A
  naive `SELECT` followed by update races; even a correct claim protocol does not make
  publication before the sent marker duplicate-free.
- SQL `ORDER BY` alone does not guarantee publication order: concurrent relays, retries and
  partition routing can reorder messages. Per-key sequencing is
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
and the message may still be transmitted more than once.

## Decision block

```text
Use a Kafka transaction when:
- the entire read-process-write stays within one Kafka cluster
- transactional inputs and downstream outputs use isolation.level=read_committed
- replay determinism is specified if needed for rebuild/audit; it is not required for atomic visibility
- transactional.id is stable per logical processor and unique across instances

Avoid a Kafka transaction when:
- it is being proposed as the sole protection for an effect outside Kafka
- the required effect is outside Kafka, or the transaction latency, open-transaction
  backpressure and operational fencing cost exceed the value of atomic Kafka output

Prefer the outbox instead when:
- the source of truth is a database and the message is a consequence of a row

Prefer at-least-once plus an idempotent consumer instead when:
- the effect is naturally repeat-safe, or stable identity and an atomic dedup/effect write
  (or a verified provider contract) protect the required outcome
- that simpler contract meets the need without atomic Kafka output and offsets

If neither covers the required outcome:
- identify the missing effect/identity/recovery capability; consider reconciliation or
  explicitly accepted loss instead of claiming that a local marker protects a remote effect
```

## Evidence and failure matrix

| Cut point                                  | Expected recovery evidence                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Before external effect in this attempt     | This attempt has no effect; retain any earlier unknown outcome; replay depends on progress/recovery policy |
| Effect committed, local response lost      | Resolve through a verified retry/status contract; without one, the caller's outcome remains unknown        |
| Effect confirmed, offset response lost     | Effect stays known; resolve progress separately before claiming replay                                     |
| Kafka output sent, transaction aborted     | `read_committed` hides this transaction's output; this transaction does not advance input progress         |
| Kafka transaction commit response lost     | client resolves transaction/fencing state; no external effect assumed                                      |
| Outbox row committed, relay not run        | Retained intent is published after successful scanner/CDC recovery                                         |
| Relay published, sent marker not committed | Publication may repeat; the downstream outcome invariant still holds                                       |

Exercise representative cuts for the actual path in a bounded disposable fixture; include
relevant broker restarts, network ambiguity, partition revocation or process death. Record
what ran and which recovery assumptions remain untested. Assert the business invariant, not merely record counts: duplicate log
records can be acceptable while duplicate charges are not.

## Source

- [Kafka 4.1 producer transaction configuration and recovery contracts](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/producer/KafkaProducer.html)
