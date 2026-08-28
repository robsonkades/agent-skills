# What sharding forbids, and how to migrate into it

Everything here is a capability a single node gave you for free. Each entry states the
mechanism that replaces it and the price of the replacement.

## Cross-shard reads

A query without the shard key must ask every shard. Three consequences that surprise people:

- **Latency is the maximum, not the mean.** With N shards, the fan-out completes when the
  slowest replies, so the composite p99 is far worse than any single shard's p99. The
  arithmetic of that amplification is `tail-latency-analysis`; the fan-out mechanics,
  partial-result policy and per-shard timeouts are `scatter-gather`.
- **Pagination and ordering break.** `ORDER BY ... LIMIT 20` across N shards requires
  fetching 20 from each and merging — N×20 rows moved to return 20. Offset pagination is
  worse, since page 500 requires each shard to produce 10,000 rows. Keyset pagination on a
  globally ordered column is the only shape that stays cheap.
- **Aggregates are only partly decomposable.** `COUNT`, `SUM`, `MIN` and `MAX` merge
  trivially. `AVG` merges only if each shard returns sum and count separately. `COUNT
DISTINCT` and any percentile do not merge from per-shard answers at all — ship sketches
  (HyperLogLog) or histograms instead, never per-shard percentiles, which is the error
  `latency-statistics` exists to prevent.

The durable fix for a query that must not fan out is a **secondary index built as its own
partitioned dataset**, keyed by that query's predicate and maintained asynchronously. It is
eventually consistent with the base data by construction; say so explicitly rather than
discovering it.

## Cross-shard writes

There is no transaction across two shards. The options, in increasing order of what they
demand:

1. **Redesign so the write is single-shard.** Almost always available and almost always the
   right answer: choose the key so that the entities that change together share it.
2. **Saga with compensations** — a sequence of local transactions, each with an undo. Gives
   atomicity in the sense that the system reaches a consistent end state, not in the sense
   that intermediate states are invisible. `distributed-transactions-and-sagas` owns this.
3. **Two-phase commit**, where the store offers it. Blocking on the coordinator, and a
   coordinator failure between prepare and commit leaves participants holding locks.

Whichever is chosen, application of the effect must be idempotent, because every retry
mechanism between the shards is at-least-once — `idempotency` owns the keys-table mechanics.

## Global uniqueness and id generation

A `UNIQUE` index is enforced by one shard over its own rows. Global uniqueness therefore
needs one of:

- **Make the unique column the shard key.** Then all rows with that value live on one shard
  and the local constraint is global. Free, and usually available for emails, usernames and
  external references.
- **A uniqueness table** owned by a single store, written before the sharded row. Correct,
  but every write now depends on that store's availability, and a crash between the two
  writes leaves a claimed-but-unused entry that some reaper must expire.
- **Accept it is not enforced** and detect violations asynchronously. Only honest when the
  duplicate is recoverable.

Ids, compared by mechanism:

| Scheme                            | Collision avoidance                       | Index locality                                     | Operational cost                                                                                 |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Per-shard `AUTO_INCREMENT` offset | Distinct start value and stride per shard | Good, sequential within a shard                    | Adding a shard requires re-planning the offsets                                                  |
| Random UUID (v4)                  | Probabilistic, no coordination            | Poor — random inserts scatter across B-tree leaves | None                                                                                             |
| Time-ordered id with node bits    | Timestamp plus node identifier            | Good, near-sequential                              | Needs unique node ids and monotonic clocks; clock skew or reuse of a node id produces duplicates |
| Central block allocator           | Hands out ranges to each writer           | Good                                               | A coordination service on the write path, cached in blocks so it is not per-insert               |

A time-ordered id gives index locality **and** a write hotspot on any store that partitions
by that id's range. Pick it for locality within a shard, not as a shard key.

## Referential integrity

Foreign keys are enforced within a shard. Across shards they simply do not exist, so the
application owns the invariant. Practical consequences: cascading deletes become an
application-driven, resumable job; an orphan row is now a state you must be able to detect
and repair; and "the database will not let that happen" stops being true the day the second
shard appears. Write the reconciliation job at the same time as the schema, not after the
first orphan.

## The migration: unsharded to sharded, without downtime

The sequence, and what fails at each step.

1. **Route through an abstraction first.** Every read and write goes through a component
   that could pick a target, while it still always picks the one database. Ship this alone
   and let it soak. If application code addresses the datasource directly anywhere, that
   call site will be the one that breaks at cut-over.
2. **Stand up the shards and dual-write.** Writes go to the old store (authoritative) and to
   the computed shard. The shard write must not fail the request — capture failures to a
   queue or a log, because a dual-write that can fail the user's request has made
   availability worse before delivering any benefit.
3. **Backfill in batches, resumable, throttled.** Order by primary key, bound each batch,
   record the cursor durably, and rate-limit so the backfill never becomes the load spike.
   Reconcile against the dual-write stream: a row written after the backfill cursor passed
   it must not be overwritten by the older copy — write the backfill with an
   insert-if-absent rather than an overwrite.
4. **Verify by comparison, continuously.** A sampling job that reads the same key from both
   sides and compares. A checksum per key range for bulk comparison. Do not cut over on a
   completed backfill; cut over on a comparison that has been clean for a sustained window.
5. **Move reads with a percentage flag**, shard by shard or tenant by tenant, with the old
   store still authoritative and the flag flippable in seconds. Watch error rate and the
   comparison job, not just latency.
6. **Flip authority, keep dual-write.** The sharded side becomes the source of truth while
   the old store continues to receive writes. This is the rollback, and it is the reason the
   step exists.
7. **Stop dual-writing, then decommission** — two separate changes, days apart at least.

The step most often skipped is 4, and the step most often collapsed into another is 6.
Together they are the difference between a migration you can abort and one you cannot.
