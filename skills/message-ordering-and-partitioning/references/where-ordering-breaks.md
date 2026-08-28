# Where ordering holds, and where it breaks

## The guarantee, stated per scope

| Scope             | What actually holds                                                           | What it requires                                                                                     | What it does not cover                                                        |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **None**          | Nothing                                                                       | —                                                                                                    | Everything                                                                    |
| **Per partition** | Records appended to one partition reach the assigned consumer in append order | One consumer per partition within a group; a single-threaded handler for that partition              | Other partitions; the real-time order in which different producers acted      |
| **Per key**       | Per-partition ordering, narrowed to the records carrying that key             | A non-null, stable key; the same partitioner in every producer; a partition count that never changes | Any pairing of two different keys; anything spanning a partition-count change |
| **Global**        | Per-partition ordering, with exactly one partition                            | One partition, therefore one consumer in the group                                                   | Horizontal scale — it does not exist for that topic, now or later             |

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

The only ordering-preserving parallelism is keyed dispatch, and it preserves _per-key_ order
only:

```java
int worker = Math.floorMod(rec.key().hashCode(), workers.length);
workers[worker].submit(() -> handle(rec));    // one slow key now blocks every key sharing it
```

Either way, offsets must not be committed until the dispatched work for that partition has
finished, or a crash loses records — `delivery-semantics`, and easy to introduce here.

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

**5 — Rebalance overlap.** A handler that outlives the consumer's maximum poll interval has its
partitions revoked while it is still working; the new owner resumes from the last committed
offset and runs concurrently with it. Exclusivity and order hold only between commit boundaries,
and only with a revocation callback that stops in-flight work before the partition moves. The
consumer mechanics are `kafka-consumers-in-java`.

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

**8 — Ordering assumed across topics.** There is none, in any broker: a flow whose steps span
two topics has no order unless the records carry one.

## The partition count is a one-way door

Increasing the count rehashes the key space. New records for key K land on a different partition
while K's earlier records remain in the old one, and no ordering relation exists between two
partitions — the two histories are simply unordered, and a consumer can apply the new before the
old. Kafka does not support reducing a topic's partition count at all; the only path down is a
new topic.

Consequences to plan for at creation:

- The partition count is the **permanent ceiling on consumer parallelism** for the topic. Set
  it above today's need — but partitions are not free (file handles, metadata, rebalance
  duration), so over-provision modestly and with a stated target.
- Increasing in place is safe when per-key ordering is not required, or when the topic is
  quiescent: no unconsumed records exist for any key at the moment of the change.
- Otherwise it is a migration: create a new topic at the new count, have consumers read both,
  stop producing to the old one, drain it to zero lag, then cut over and delete it. This is the
  same expand/migrate/contract discipline as a schema change (`rpc-and-api-contracts`).
- If none of that is acceptable, the fix is upstream: remove the ordering requirement
  (`designing-without-ordering.md`) and the partition count stops being a door at all.
