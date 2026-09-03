---
name: message-ordering-and-partitioning
description: >
  Ordering guarantees and their exact scope/stage: common logs order per partition while a
  global total order requires a serialized sequencer; per-key ordering depends on key-to-partition
  mapping is stable; why the partition count is nearly a one-way door; what silently breaks
  order in a consumer or producer; and whether ordering is required at all — version guards,
  commutative handlers, state-machine guards. Use when a design says messages are processed
  in order with no scope, when partitions are added to a
  live topic, when records are produced with no key, when the handler dispatches to an
  executor in the poll loop, when a retry republishes to the topic's tail, or when an older
  update overwrites a newer one. Not duplicates (delivery-semantics), repeat-safe handlers
  (idempotency), consumer offsets (kafka-consumers-in-java), key choice
  (sharding-and-partitioning), skew (hot-partitions-and-rebalancing), the failing record
  (poison-messages-and-dlq), or what a reader observes (consistency-models).
---

# Message Ordering And Partitioning

## Purpose

Ordering is always scoped and staged. A partitioned log commonly provides a total append
order **within one partition**; a consensus log or singleton sequencer can provide a wider
total order at the price of a serialized sequencing/commit point. Neither guarantees that
parallel consumers start, finish or make external effects visible in that order. State the
entity/key/partition scope and the stage—source commit, broker append, delivery, handler
completion or sink commit—rather than writing only "processed in order".

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
4. **Choose partition count and mapping evolution deliberately.** It bounds parallel group
   ownership for that topic now; default modulo partitioners commonly remap keys when count
   changes. A stable custom mapping, quiescence or epoch/barrier migration can preserve a
   contract, but an uncoordinated count increase cannot.
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
Require a global total order only when:
- the availability/throughput of one logical sequencer and ordered commit point is acceptable.
  Parallel compute may surround it, but visible ordered effects must serialize or buffer/reorder
```

## Rules

- Never write "ordered" without scope, stage and failure behavior. Broker products differ:
  common scopes include channel/partition, key/message group and a single total-order log.
  Redelivery, retry, failover and parallel handlers can change delivery/completion/effect order
  even when append order remains intact.
- A record produced with **no key** is placed by the client's partitioner — round-robin or
  sticky batching — so it has no per-key ordering at all. Nothing raises an error. This is the
  most common way per-key ordering is lost.
- With the default modulo-style mapping, per-key log ordering holds only while mapping is
  stable. **Adding partitions remaps some keys**: new records for key K can land on a different partition while K's earlier records
  sit in the old one, and there is no ordering relation between two partitions. There is no
  guarantee "across the change" to reason about — the two histories are simply unordered.
- Increasing count without a mapping/cutover protocol is safe only where cross-change per-key
  ordering is unnecessary. Otherwise use quiescence or a versioned migration with a per-key/
  global barrier (`references/where-ordering-breaks.md`).
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
- **Consumer, rebalance**: a partition can be revoked while records remain in flight, and the
  new owner resumes from a checkpoint. Group assignment does not fence late side effects.
  Stop admission, commit only contiguous completion and make the sink reject stale ownership
  epochs or tolerate duplicates.
- **Producer, in-flight retries**: non-idempotent producers with multiple batches in flight can
  reorder a failed/retried batch behind a later success. Kafka's idempotent producer preserves
  order within its producer session subject to documented configuration; it does not order
  independent producer instances or business events. Current defaults and allowed in-flight
  limits are version-specific.
- Ordering and skew pull the key in opposite directions. When one entity is hotter than a
  partition, a version guard can reject stale final-state updates but does not preserve every
  intermediate transition or external effect. Decide whether coalescing, aggregation, a
  sequencer plus parallel execution, or domain redesign can relax the actual invariant.

## Ordering contract template

```text
Scope: accountId
Source order: monotonically increasing account version committed by the authority
Broker order: same key maps to one partition within mapping epoch E
Delivery: at-least-once; retries may be out of delivery order
Apply rule: commit v only when v == current + 1; duplicates v <= current are acknowledged
Gap rule: park boundedly, then fetch snapshot/replay missing range
Visibility: account state commits in version order; notifications may arrive later
Mapping change: close E, record barrier, drain through barrier, open E+1
```

## Security and operational edge cases

- Do not trust a caller-provided version as authority; authenticate producer identity and bind
  sequence/version to the aggregate or signed event stream.
- Poison records and missing sequence values can block a key forever. Bound parking, expose
  gap age and provide resync/reconciliation—not silent skip.
- Sequence counters need overflow/reset/restore semantics; database restore or producer epoch
  reset can make a numerically lower valid history appear stale.
- Retention/compaction may remove the record needed to fill a gap. Recovery then requires an
  authoritative snapshot with a version watermark.

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
