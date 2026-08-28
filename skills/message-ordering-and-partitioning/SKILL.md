---
name: message-ordering-and-partitioning
description: >
  Ordering guarantees and the partition as the unit that provides them: ordering is
  per-partition, never global; per-key ordering holds only while the key-to-partition
  mapping is stable; why the partition count is nearly a one-way door; what silently breaks
  order in a consumer or producer; and whether ordering is required at all — version guards,
  commutative handlers, state-machine guards. Use when a design says messages are processed
  in order with no scope, when global ordering is proposed, when partitions are added to a
  live topic, when records are produced with no key, when the handler dispatches to an
  executor in the poll loop, when a retry republishes to the topic's tail, or when an older
  update overwrites a newer one. Not duplicates (delivery-semantics), repeat-safe handlers
  (idempotency), consumer offsets (kafka-consumers-in-java), key choice
  (sharding-and-partitioning), skew (hot-partitions-and-rebalancing), the failing record
  (poison-messages-and-dlq), or what a reader observes (consistency-models).
---

# Message Ordering And Partitioning

## Purpose

**Ordering is a per-partition property, never a global one.** A partition is one ordered log
read by one consumer within a group, and that is the entire mechanism: order exists inside a
partition and nowhere else. A system that requires global ordering has therefore chosen a
single partition — one consumer, throughput bounded by one handler, and no horizontal scale
available later. That is the trade, and it has to be written down in those words rather than
as "we need ordering".

The failure this prevents is the guarantee nobody actually has. A design says "processed in
order", the implementation gets per-partition ordering, the key is absent or the partition
count changes, and an older update overwrites a newer one — days after the deploy, in one
entity, with no error anywhere. The second failure is its mirror: a single-partition topic
paying for ordering the handlers never needed, discovered when throughput has to double and
cannot.

## Workflow

1. **Write the required scope down as a sentence.** "Records for the same account id must be
   applied in production order" is a specification. "The queue is ordered" is not, and it is
   the thing that ships.
2. **Ask whether ordering is required at all before designing for it.** Commutative handlers,
   or a version guard on the record, remove the requirement entirely — and with it the key
   constraint and the scaling ceiling. See `references/designing-without-ordering.md`.
3. **Choose the partition key from the ordering scope**, then check it for skew. The entity
   whose order must hold forces the key; whether that key is evenly loaded is a separate
   question, owned by `sharding-and-partitioning` and `hot-partitions-and-rebalancing`.
4. **Fix the partition count deliberately.** It sets the maximum consumer parallelism for the
   life of the topic, and changing it later rehashes keys — treat it as a migration, not a
   configuration change.
5. **Audit the consumer for the four things that break order inside a partition**: parallel
   dispatch, republished retries, DLQ skips, and rebalance overlap
   (`references/where-ordering-breaks.md`).
6. **Audit the producer**: a missing key, concurrent producers for one key, and in-flight
   retries that can be overtaken.
7. **Test by shuffling.** Deliver the same records in a randomised order and assert the same
   final state. If that test cannot pass, the ordering requirement is real — carry its cost.

## Decision block

```text
Require per-key ordering when:
- the handler is not commutative and the record carries no version you can trust
- the entity is a state machine whose out-of-order transitions would be applied rather than
  rejected — a cancel arriving before its create, a delete before its update
- a create/delete pair for one key can be reordered into a resurrection
Avoid requiring ordering when:
- the handler is commutative: setting fields from an authoritative snapshot, appending to a
  log, or a counter update keyed by an idempotency token
- the record already carries a monotonic version or sequence from the source of truth
- the consumer's job is a projection that can be rebuilt from a snapshot
Prefer a version guard instead when:
- per-key throughput exceeds what one handler can sustain, so ordering costs capacity
- the chosen ordering key is skewed and the hot key would become a serial bottleneck
- records arrive from more than one producer, where "the order they happened" is not
  observable in the log anyway
Require global ordering only when: a single partition, a single consumer and that consumer's
throughput as the topic's permanent ceiling are all acceptable — state the number.
```

## Rules

- Never write "ordered" or "in order" without a scope. There are four, and only two are
  guarantees a broker gives: none, per partition, per key (per partition, _conditional_ on the
  key-to-partition mapping being stable), global (per partition, with one partition).
- A record produced with **no key** is placed by the client's partitioner — round-robin or
  sticky batching — so it has no per-key ordering at all. Nothing raises an error. This is the
  most common way per-key ordering is lost.
- Per-key ordering holds only while the key maps to one partition. **Adding partitions
  rehashes**: new records for key K land on a different partition while K's earlier records
  sit in the old one, and there is no ordering relation between two partitions. There is no
  guarantee "across the change" to reason about — the two histories are simply unordered.
- Increasing the count in place is safe only where per-key ordering is not required or the
  topic is quiescent; otherwise it is a topic migration (`references/where-ordering-breaks.md`).
- Ordering is the order the broker **accepted** records, not the order events happened: two
  producers writing one key have their relative order decided by arrival. Record timestamps are
  not an ordering either — clock skew between producers is unbounded.
- There is no ordering across topics, and none across partitions of one topic. A flow that
  spans both has no order at all unless the records carry one.
- **Consumer, parallel dispatch**: handing polled records to an executor inside the poll loop
  destroys per-partition order. Keyed dispatch — `hash(key) % workers`, one queue per worker —
  preserves _per-key_ order only, and makes one slow key block every key that shares its
  worker. Choose it knowingly.
- **Consumer, retry**: republishing a failed record to the back of the topic or to a retry
  topic lets later records for the same key overtake it. Blocking in-place retry preserves
  order at the cost of head-of-line blocking on the whole partition. Both are defensible; the
  bug is choosing one without noticing (`retries-and-backoff`).
- **Consumer, DLQ**: routing one record aside and continuing means the next record for that key
  is applied to a state the skipped record never reached. The result is wrong, not late. Where
  per-key order matters, pause the key or the partition instead
  (`poison-messages-and-dlq`).
- **Consumer, rebalance**: a partition can be revoked while its records are still in flight, and
  the new owner resumes from the last committed offset. Exclusivity and order hold between
  commit boundaries only, and only with a revocation handler that stops in-flight work.
- **Producer, in-flight retries**: with several request batches in flight on one connection, a
  failed batch retried after a later batch succeeded lands out of order _within_ the partition.
  Two settings prevent it, by role: bound in-flight requests per connection to one, or enable
  the idempotent producer, which preserves per-partition order across retries within its
  in-flight window. Do not copy a number from a blog; read your client's documented limit.
- Ordering and skew pull the key in opposite directions. When the entity that needs ordering is
  also the hot one, remove the ordering requirement with a version guard — no key is cleverer.

## References

- [Where ordering holds and where it breaks](references/where-ordering-breaks.md) — the
  guarantee stated per scope with what each does and does not cover, the breakage catalogue with
  the code or configuration shape that produces each, and the partition-count change as a
  one-way door with the migration that avoids it. Read when auditing a consumer or a producer,
  and before changing a partition count.
- [Designing for no ordering requirement](references/designing-without-ordering.md) — version
  guards, commutative operations, last-write-wins with its data-loss caveat, state-machine
  guards that reject invalid transitions, and the shuffle test that proves handlers are
  order-insensitive. Read before accepting an ordering requirement, and when per-key throughput
  is the bottleneck.
