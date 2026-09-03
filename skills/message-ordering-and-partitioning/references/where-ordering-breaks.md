# Where ordering holds, and where it breaks

## The guarantee, stated per scope

| Scope             | What actually holds                                                  | What it requires                                                        | What it does not cover                                                             |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **None**          | Nothing                                                              | —                                                                       | Everything                                                                         |
| **Per partition** | One broker offset/sequence orders accepted records in that partition | Stable log semantics and a consumer that respects that order            | Real-time producer action, other partitions, handler completion or sink visibility |
| **Per key**       | Key records share a partition/group and inherit its log order        | Canonical key bytes and mapping stable within an epoch                  | Mapping changes, independent producers' domain order, late side effects            |
| **Global log**    | One sequencer/consensus log assigns a total order                    | One serialization point and consumers/sinks that apply it appropriately | Automatically ordered parallel completion; external systems outside the log        |

Two requirements in that table that are usually assumed rather than checked:

- **The partitioner must agree across every producer.** A key is mapped by hashing its
  _serialised bytes_, so changing that serialisation (an id written as a number in one service
  and as a string in another) moves the key. Client libraries in different languages do not
  necessarily default to the same hash either — verify, do not assume.
- **One consumer per partition holds only inside a group.** Two groups both read every
  partition: fan-out, not a violation — but "only one consumer sees this" is a per-group claim.

## The breakage catalogue

**1 — The missing key.** Silent, and the most common.

```java
producer.send(new ProducerRecord<>("orders", event));            // no key: partitioner places it
producer.send(new ProducerRecord<>("orders", order.id(), event)); // key: per-key ordering possible
```

Nothing fails. Records spread across partitions by round-robin or sticky batching, and per-key
ordering never existed. Grep for `ProducerRecord<>(topic, value)` with two arguments.

**2 — Parallel dispatch inside the consumer.**

```java
for (var rec : records) executor.submit(() -> handle(rec));   // per-partition order destroyed
```

One simple ordering-preserving scheme is a serial lane per key (usually many keys share a
lane):

```java
int worker = Math.floorMod(rec.key().hashCode(), workers.length);
workers[worker].submit(() -> handle(rec));    // one slow key now blocks every key sharing it
```

Offsets advance only through the highest **contiguous** completed offset per partition. A
maximum completed offset skips unfinished lower records on crash. Keyed lanes also need bounded
queues and cancellation/revocation semantics.

**3 — Retry by republish.**

```java
catch (TransientException e) { producer.send(new ProducerRecord<>("orders.retry", key, value)); }
```

The record goes to the back; later records for the same key are applied first. Three options,
and the bug is choosing one without noticing:

| Option                                              | Ordering                    | Cost                                                  |
| --------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Blocking in-place retry                             | Preserved for the partition | Head-of-line blocking on the whole partition          |
| Pause the partition, seek back to the offset, retry | Preserved for the partition | Same blocking, but the consumer stays alive and polls |
| Republish to a retry topic                          | **Abandoned** for that key  | Only acceptable when handlers are order-insensitive   |

**4 — The DLQ skip.**

```java
catch (Exception e) { dlq.send(rec); }   // and the loop continues to the next record
```

The next record for that key is applied to a state the skipped record never produced. The
result is _wrong_, not late, and nothing reports it. Where per-key order matters, park the key
or pause the partition instead (`poison-messages-and-dlq`).

**5 — Rebalance overlap.** A handler can outlive ownership; the new owner resumes from the
committed offset while old work still completes. Revocation callbacks are best-effort during
crash/eviction and Kafka does not fence the external sink. Use cancellation plus repeat-safe
effects, or propagate an ownership epoch the sink can enforce. Mechanics are
`kafka-consumers-in-java`.

**6 — Producer in-flight retries.** With several request batches in flight on one connection, a
batch that fails and is retried lands _after_ a later batch that succeeded — reordering inside
the partition, at the producer, with no consumer involved. Prevent it by role: bound in-flight
requests per connection to one, or enable the idempotent producer, which preserves per-partition
order across retries within its in-flight window. Read your client's documented limit for that
window rather than copying a number.

**7 — Concurrent producers for one key.**

```java
CompletableFuture.runAsync(() -> producer.send(rec));   // enqueue order is now the scheduler's
```

Ordering is decided by arrival at the broker. Producing one key from several threads, or from
several instances, means the log's order is not the domain's order — no consumer-side fix
exists.

**8 — Ordering assumed across channels/topics.** Independent logs usually expose no shared
order. A transaction may atomically publish to several Kafka partitions, but atomic visibility
does not assign one consumer processing order across them. Carry causal/version information or
use an explicit sequencer when the invariant spans streams.

## The partition count is a one-way door

With Kafka's common default key mapping, increasing the count remaps part of the key space. New records for key K can land on a different partition
while K's earlier records remain in the old one, and no ordering relation exists between two
partitions — the two histories are simply unordered, and a consumer can apply the new before the
old. Kafka does not support reducing a topic's partition count at all; the only path down is a
new topic.

Consequences to plan for at creation:

- The current partition count bounds simultaneously assigned group members for that topic. It
  is not literally permanent because Kafka permits increases, but changing it may violate key
  mapping/order and Kafka does not support an in-place decrease. Partitions cost broker
  metadata, files, replication, recovery and rebalance time.
- Increasing in place is safe when per-key ordering is not required, or when the topic is
  quiescent: no unconsumed records exist for any key at the moment of the change.
- Otherwise it is a protocol: establish a source-side cutover epoch/barrier, stop or dual-write
  under a deduplicated operation ID, drain every old partition through its barrier, then allow
  effects from the new mapping. Merely consuming old and new topics concurrently can apply new-
  epoch records before old ones. Keep rollback/replay until reconciliation proves the cutover.
- If none of that is acceptable, the fix is upstream: remove the ordering requirement
  (`designing-without-ordering.md`) and the partition count stops being a door at all.

## Primary references

- [Apache Kafka design: ordering guarantees](https://kafka.apache.org/documentation/#intro_guarantees)
- [Kafka producer configuration: idempotence and in-flight requests](https://kafka.apache.org/documentation/#producerconfigs)
- [KafkaConsumer API: offsets and assignment](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
