# What sharding makes distributed, and how to migrate

These capabilities cease to be local. Some datastores implement them through distributed
indexes, query plans or transactions; each entry names the replacement and coordination cost.

## Cross-shard reads

A query without the shard key needs routing metadata, a secondary/global index, a materialized
view or scatter-gather. In the scatter case:

- **All-required latency includes the maximum leaf, not the mean**, plus dispatch/merge overhead.
  Tail amplification depends on shard distributions and dependence: identical perfectly correlated
  leaves do not multiply tail probability. For independent identical leaves, the completion CDF is
  `F(t)^N`; neither independence nor identical distributions is a default production assumption. The
  arithmetic of that amplification is `tail-latency-analysis`; the fan-out mechanics,
  partial-result policy and per-shard timeouts are `scatter-gather`.
- **Pagination and ordering need a distributed plan.** Fetching up to 20 from each shard and
  merging is one correct top-20 plan with a common total order, not an unavoidable N×20 transfer:
  lazy merging/indexes can reduce it. A naive offset plan may request offset+limit from every
  shard; pruning and richer plans can reduce that work. Keyset pagination on a
  globally ordered column avoids deep offset scanning, but still needs stable tie-breakers,
  snapshot/cursor semantics and per-shard continuation state.
- **Aggregates are only partly decomposable.** For disjoint contributions and a defined read
  snapshot, counts/sums combine by sum and extrema by min/max, preserving null, overflow and numeric
  precision semantics. `AVG(column)` needs sum and the count of non-null column values, not row count.
  Moving/replicated rows must not be counted twice. `COUNT
DISTINCT` and percentiles generally do not merge from scalar per-shard answers; summing distinct
  counts needs proof that value sets are disjoint. Ship exact sets only
  when bounded, or compatible sketches/histograms with explicit error instead; never average
  per-shard percentiles, which is the error
  `latency-statistics` exists to prevent.

The durable fix for a query that must not fan out is a **secondary index built as its own
partitioned dataset**, keyed by that query's predicate. It is eventually consistent when
maintained asynchronously; a datastore may update a global index transactionally at added
write/coordination cost. State freshness and rebuild/reconciliation behavior.

## Cross-shard writes

Local transactions do not span two independently committed shards. Options:

1. **Evaluate single-shard locality.** Colocate entities that change together when that does
   not violate capacity, residency or other access patterns; not every invariant can be localized.
2. **Saga with compensations/forward recovery** — a sequence of local commits. It is not ACID
   atomicity; intermediate states are visible and repair can fail indefinitely.
3. **Datastore distributed transaction/2PC**, where offered. Price coordinator/quorum paths,
   isolation, lock/write-intent lifetime, recovery and cross-region latency from that product's
   actual protocol rather than assuming classic blocking behavior.

Distinguish transaction-body retries after abort from retries after an ambiguous commit. A
datastore may deduplicate protocol messages internally while applying a non-idempotent transaction
once. An application retry/new transaction after an unknown outcome needs an operation identity,
outcome lookup or other duplicate-effect protection. Keep external effects out of automatically
retried transaction bodies unless their contract handles repetition (`idempotency`).

## Global uniqueness and id generation

A local `UNIQUE` index covers one shard. Global uniqueness needs one of:

- **Route equal unique values to one enforcing owner.** The routing equality must match the
  constraint's collation/normalization/null semantics, including during moves and stale-client
  retries. A unique column can be the key, but this trades off other query/transaction locality;
  it does not automatically enforce a second independently unique column.
- **A uniqueness service/table** with a durable claim state and operation ID. Operations creating
  or changing the unique value depend on it; claim-to-row ambiguity needs reconciliation, not a TTL that might release a
  still-valid name. A distributed datastore's global unique index is the same coordination
  concern packaged by the database.
- **Accept it is not enforced** and detect violations asynchronously. Only honest when the
  duplicate is recoverable.

Ids, compared by mechanism:

| Scheme                             | Collision avoidance                       | Index locality                                                             | Operational cost                                                                    |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Per-shard `AUTO_INCREMENT` offset  | Distinct start value and stride per shard | Good, sequential within a shard                                            | Adding a shard requires re-planning the offsets                                     |
| Random UUID (v4)                   | Probabilistic, no coordination            | Engine/workload dependent; random keys reduce locality and may split pages | Wider key/index/cache cost; collision probability must fit risk                     |
| Time-ordered id with node/sequence | Algorithm-specific uniqueness             | Often better temporal locality                                             | Correct clock rollback, same-tick overflow and node-id reuse handling are mandatory |
| Central block allocator            | Hands out ranges to each writer           | Good                                                                       | A coordination service on the write path, cached in blocks so it is not per-insert  |

A globally monotonic leading id can concentrate range-partitioned writes. Consider temporal
locality within a shard versus distributed write load; prefixes/hash routing change the trade-off.

## Referential integrity

Many manually sharded stores enforce foreign keys only locally; distributed SQL products may
provide cross-range constraints through distributed transactions. When the datastore does not,
the application owns resumable cascades, orphan detection and repair. Document enforcement
scope and test partition/recovery, rather than assuming either capability from the word shard.

## The migration: unsharded to sharded, without downtime

The sequence, and what fails at each step.

1. **Route through an abstraction first.** Every read and write goes through a component
   that could pick a target, while it still always picks the one database. Ship this alone
   and let it soak. If application code addresses the datasource directly anywhere, that
   call site will be the one that breaks at cut-over.
2. **Create one authoritative change stream.** Prefer an outbox/CDC log committed with the old
   store mutation and apply it idempotently to target shards. Application dual-write without
   atomic capture has four ambiguous outcomes and is not repaired by logging only after the
   second write fails.
3. **Backfill from a stable snapshot in bounded resumable batches.** Persist cursor and
   snapshot/change-log position. Apply rows by source version/watermark so an old backfill
   cannot overwrite a newer streamed change; insert-if-absent alone can preserve stale partial
   data. Capture inserts, updates and deletes from the snapshot's log boundary without gaps.
   Retain versioned tombstones (or equivalent deletion knowledge) long enough that late backfill
   or replay cannot resurrect a deleted row; define transaction ordering where invariants need it.
4. **Verify continuously at a comparable point.** Reconcile counts, constraints and canonical
   hashes per bounded range at the same watermark, plus targeted full comparisons and sampled
   reads. Racing checksums of live stores produce false mismatches/matches.
5. **Shadow then move reads by a stable unit** (tenant/range), recording routing epoch and
   fallback. Compare result, latency and consistency; a percentage per request can send one
   session/entity to both authorities unpredictably. Reads from a lagging target or fallback to
   the old copy must satisfy the promised freshness/read-your-writes contract; availability alone
   does not justify serving stale authoritative state.
6. **Fence and flip write authority.** Publish a monotonic epoch enforced at the commit path;
   stop old-epoch admission, drain through a durable position, then enable target writes. Keep
   capturing target deltas for rollback. Retaining a stale old copy is not rollback.
7. **Rollback only through a new epoch.** Reverse-copy target changes while retaining one write
   authority, then fence/drain target writes at a durable position, apply through that position
   and verify before enabling old-store writes under the new epoch. Include deletes and changed
   schema semantics; never reactivate the old epoch. Stop replication and decommission after
   the rollback/replay/backup horizon and restore test pass.

Crash/restart the migration controller after every state transition. Track source/target
watermark, apply lag, mismatch count, stale-epoch rejections, backfill resource cost and
rollback-log horizon. Abort automatically when foreground SLO or replica/quorum safety crosses
its guardrail.

Offline stop-write/copy/verify/switch is preferable when its measured outage fits the business
budget. It has fewer dual-authority states; “zero downtime” is not automatically safer.

## Primary references

- [Martin Kleppmann et al., Online Event Reprocessing](https://arxiv.org/abs/1906.12127)
- [Debezium documentation: change data capture](https://debezium.io/documentation/)
- [PostgreSQL logical decoding concepts](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html)
