---
name: message-ordering-and-partitioning
description: >
  Ordering guarantees and their exact scope/stage: common logs order per partition while a
  global total order requires a serialized sequencer; per-key ordering depends on key-to-partition
  mapping remaining stable; why the partition count is nearly a one-way door; what silently breaks
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

Inspect client/broker versions, key serialization/partitioner configuration, Java toolchain,
consumer execution and sink transactions. Kafka references use 4.1 semantics; examples are
partial and do not authorize upgrading a project or changing its delivery contract.
Use the steps relevant to the question or change, and reuse adequate supplied contracts and
validation. A supported existing ordering design can remain unchanged.

1. **Write the required scope down as a sentence.** "Records for the same account id must be
   applied in authoritative account-version order at sink commit" identifies a scope and stage.
   Define the version authority as well. "The queue is ordered" does not, and it is
   the thing that ships.
2. **Resolve an unclear ordering requirement before designing for it.** Commutative handlers,
   or a version guard on full snapshots, can relax arrival order for specified outcomes.
   Check intermediate transitions and external effects before relaxing keys or sequencing.
   See `references/designing-without-ordering.md`.
3. **Choose the partition key from the ordering scope**, then check it for skew. The entity
   whose order must hold forces the key; whether that key is evenly loaded is a separate
   question, owned by `sharding-and-partitioning` and `hot-partitions-and-rebalancing`.
4. **Choose partition count and mapping evolution deliberately.** It bounds parallel group
   ownership for that topic now; default modulo partitioners commonly remap keys when count
   changes. A stable custom mapping, quiescence or epoch/barrier migration can preserve a
   contract, but an uncoordinated count increase cannot.
5. **Audit the consumer for four ways order can break inside a partition**: parallel
   dispatch, republished retries, DLQ skips, and rebalance overlap
   (`references/where-ordering-breaks.md`).
6. **Audit the producer**: a missing key, concurrent producers for one key, and in-flight
   retries that can be overtaken.
7. **Validate the affected contract.** When relaxing order or changing dispatch, retries or
   mapping, use relevant shuffle, completion/failure and concurrent-effect cases. Assert
   final state and every required intermediate/external invariant. A narrow explanation or
   review may close from adequate existing evidence. Passing finite cases is evidence, not
   a general proof.

Return the supported scope/stage and its evidence, any material gap and the change or
keep-current decision. For a change, identify the affected invariant and checks actually run;
do not claim runtime behavior from configuration or an in-memory model alone.

## Decision block

```text
Require per-key ordering when:
- the handler is not commutative and the record carries no version you can trust
- the entity is a state machine whose out-of-order transitions would be applied rather than
  rejected — a cancel arriving before its create, a delete before its update
- a create/delete pair for one key can be reordered into a resurrection
Avoid requiring ordering when:
- the handler uses a commutative, duplicate-safe merge for the required outcome
- complete snapshots have authoritative versions and an atomic guard; intermediate effects
  may be intentionally skipped (a versioned delta alone does not satisfy this)
- a rebuildable projection also tolerates out-of-order intermediate behavior
Consider a version guard only when the complete-snapshot and skippable-effect conditions above hold:
- then throughput pressure, key skew or concurrent producers may motivate relaxing arrival order
- those pressures alone do not authorize dropping required deltas or effects; preserve sequencing
  and gap repair unless the domain contract can explicitly be relaxed
Require a global total order only when:
- the availability/throughput of one logical sequencer and ordered commit point is acceptable.
  Parallel compute may surround it, but visible ordered effects must serialize or buffer/reorder
```

## Rules

- Never write "ordered" without scope, stage and failure behavior. Broker products differ:
  common scopes include channel/partition, key/message group and a single total-order log.
  Redelivery, retry, failover and parallel handlers can change delivery/completion/effect order
  even when append order remains intact.
- A record with **no key** normally relies on the client's partitioner; across multiple
  partitions this does not preserve domain-key order. An explicit stable partition or a
  single-partition topic can still provide append order. Inspect actual routing, including
  configurations that ignore keys; the presence of a key alone proves nothing.
- With the default modulo-style mapping, per-key log ordering holds only while mapping is
  stable. **Adding partitions remaps some keys**: new records for key K can land on a different partition while K's earlier records
  sit in the old one. The broker supplies no shared order across those partitions; preserving
  an application order across the change requires an explicit cutover protocol.
- Increasing count without a mapping/cutover protocol is safe only where cross-change per-key
  ordering is unnecessary. Otherwise use quiescence or a versioned migration with a per-key/
  global barrier (`references/where-ordering-breaks.md`).
- Broker append order does not establish the order business events happened. Independent
  producers can race unless an authoritative sequencing protocol constrains them. Wall-clock
  timestamps alone do not establish that order: inspect clock error bounds, resolution and
  tie behavior. Even bounded clock error can leave nearby events' real-time order ambiguous.
- Kafka supplies no shared total order across topics or partitions. An application can impose
  one with a sequencer and ordered application, or enforce a narrower causal order. State
  that protocol explicitly; carrying sequence metadata alone does not enforce sink order.
- **Consumer, parallel dispatch**: unordered concurrent execution of polled records can break
  per-partition completion order. Keyed dispatch — `hash(key) % workers`, one queue per worker —
  preserves _per-key_ order only with stable mapping, FIFO admission and completion before
  the next task (including effects), and makes one slow key block every key that shares its
  worker. Choose it knowingly.
- **Consumer, retry**: republishing a failed record to the back of the topic or to a retry
  topic lets later records for the same key overtake it. Blocking in-place retry preserves
  order at the cost of head-of-line blocking on the whole partition. Both are defensible; the
  bug is choosing one without noticing (`retries-and-backoff`).
- **Consumer, DLQ**: routing one record aside and continuing means the next record for that key
  is applied without the skipped effect. This violates the contract when later transitions
  require it; an explicitly skippable independent event may be safe. Where
  per-key order matters, pause the key or the partition instead
  (`poison-messages-and-dlq`).
- **Consumer, rebalance**: a partition can be revoked while records remain in flight, and the
  new owner resumes from a checkpoint. Group assignment does not fence late side effects.
  Stop admission, commit only the completed prefix of delivered records (offset numbers can
  have gaps), and make the sink reject stale ownership
  epochs or enforce an equivalent effect-order contract. Duplicate safety is separate: it
  does not prevent two distinct operations from applying in stale order.
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

This example requires every transition, so `current + 1` assumes a contiguous event sequence
per account within one source epoch. A merely increasing row version or a filtered stream can
have legitimate gaps; establish an explicit predecessor relation or authoritative gap protocol
instead of interpreting every numeric jump as a missing delivery.

```text
Scope: accountId
Source order: contiguous account event sequence assigned by the authority at commit
Broker order: same key maps to one partition within mapping epoch E
Delivery: at-least-once; retries may be out of delivery order
Apply rule: atomically commit v only when v == current + 1
Duplicate rule: verify event identity/payload; quarantine conflicting equal versions
Gap rule: park boundedly, then replay missing transitions and reconcile required effects
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
- Retention/compaction may remove the record needed to fill a gap. An authoritative snapshot
  with a version watermark can restore projection state, but cannot by itself prove required
  intermediate effects occurred. Replay or reconcile those effects before declaring recovery;
  if no evidence or repair source remains, report the unresolved gap.

## References

- [Where ordering holds and where it breaks](references/where-ordering-breaks.md) — the
  guarantee stated per scope with what each does and does not cover, the breakage catalogue with
  the code or configuration shape that produces each, and the partition-count change as a
  one-way door with the migration that avoids it. Read when auditing a consumer or a producer,
  and before changing a partition count.
- [Designing for no ordering requirement](references/designing-without-ordering.md) — version
  guards, commutative operations, last-write-wins with its data-loss caveat, state-machine
  guards that reject invalid transitions, and shuffle tests that challenge whether handlers are
  order-insensitive. Read when deciding whether arrival order can be relaxed, including when
  per-key throughput is the bottleneck; preserve already established domain requirements.
