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

When a query must avoid fan-out, compare an adequate directory lookup, replicated/materialized
view, co-location or supported secondary/global index against its access and consistency contract.
A secondary index can itself be a partitioned dataset keyed by the predicate; it is not the only
durable access path, and a lookup need not itself be sharded. Asynchronous maintenance can expose
lag; a datastore may maintain an index transactionally or through another supported consistency
protocol. State freshness, update ordering, availability and rebuild/reconciliation behavior.

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

| Scheme                             | Collision avoidance                            | Index locality                                                             | Operational cost                                                                    |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Per-shard `AUTO_INCREMENT` offset  | Disjoint residue classes under a common stride | Increasing within each shard; stride affects locality                      | Allocate distinct residues and preserve issued IDs when membership/stride changes   |
| Random UUID (v4)                   | Probabilistic, no coordination                 | Engine/workload dependent; random keys reduce locality and may split pages | Wider key/index/cache cost; collision probability must fit risk                     |
| Time-ordered id with node/sequence | Algorithm-specific uniqueness                  | Often better temporal locality                                             | Correct clock rollback, same-tick overflow and node-id reuse handling are mandatory |
| Central block allocator            | Durably allocates nonoverlapping ranges        | Increasing within a block; test the engine and insertion mix               | New blocks require allocator authority; cached blocks permit local allocation       |

A globally monotonic leading id can concentrate range-partitioned writes. Consider temporal
locality within a shard versus distributed write load; prefixes/hash routing change the trade-off.
Distinct starts or independently chosen strides alone do not ensure uniqueness: `1 + 2n` and
`2 + 3n` both emit 5. Preserve the allocated namespace and already-issued IDs through resize,
writer restart and backup restore; an allocator reset or reassigned range can reissue IDs.
For MySQL, inspect effective global/session increment and offset settings and any replication
mode that changes them. These allocation rules do not establish uniqueness for arbitrary
application-supplied IDs or another independently unique column.

## Referential integrity

Many manually sharded stores enforce foreign keys only locally; distributed SQL products may
provide cross-range constraints through distributed transactions. When the datastore does not,
the application owns resumable cascades, orphan detection and repair. Document enforcement
scope and test partition/recovery, rather than assuming either capability from the word shard.

## The migration: choose the availability and authority contract

Choose offline stop-write/copy/verify/switch when verified quiescence and the measured outage fit
the agreed budget. Include delayed writers, reads and recovery in that contract; no live change
stream is needed when the source remains frozen. For online moves, use the following sequence
only where the actual datastore and migration protocol need it; managed tooling can supply steps.

1. **Verify the routing boundary.** An existing datastore router, driver or application component
   may already handle target selection. Check all affected reads/writes and actual bypass paths,
   version/configuration, cache refresh and cutover behavior. Add an abstraction or staged release
   only when it addresses a demonstrated gap; reuse adequate integration and recovery evidence.
2. **Establish atomic capture of every committed mutation.** An outbox/CDC log tied to the
   authoritative commit is one route; apply it with replay/duplicate handling to target shards.
   A genuinely atomic transaction spanning old and new representations is another when the
   datastore and every writer support it. Two independent local transactions are not equivalent.
   Verify inserts, updates, deletes, ordering, abort/retry and ambiguous commit behavior. Logging
   only after an independent second write fails cannot recover a crash before that log.
3. **Backfill from a stable snapshot in bounded resumable batches.** Persist cursor and
   snapshot/change-log position. Apply rows by source version/watermark so an old backfill
   cannot overwrite a newer streamed change; insert-if-absent alone can preserve stale partial
   data. Capture inserts, updates and deletes from the snapshot's log boundary without gaps.
   Retain versioned tombstones (or equivalent deletion knowledge) long enough that late backfill
   or replay cannot resurrect a deleted row; define transaction ordering where invariants need it.
4. **Verify continuously at a comparable point.** Reconcile counts, constraints and canonical
   hashes per bounded range at the same watermark, plus targeted full comparisons and sampled
   reads. Racing checksums of live stores produce false mismatches/matches.
5. **Validate then move reads by a stable unit** (tenant/range), recording routing epoch and
   fallback. Compare result, latency and consistency; a percentage per request can send one
   session/entity to both authorities unpredictably. Reads from a lagging target or fallback to
   the old copy must satisfy the promised freshness/read-your-writes contract; availability alone
   does not justify serving stale authoritative state. Shadowing is one validation option when
   representative and safe; equivalent evidence can establish the required read behavior.
6. **Fence and flip write authority.** Publish a monotonic epoch enforced at the commit path;
   stop old-epoch admission, drain through a durable position, then enable target writes. Keep
   capturing target deltas for rollback. Retaining a stale old copy is not rollback.
7. **Rollback only through a new epoch.** Reverse-copy target changes while retaining one write
   authority, then fence/drain target writes at a durable position, apply through that position
   and verify before enabling old-store writes under the new epoch. Include deletes and changed
   schema semantics; never reactivate the old epoch. Stop replication and decommission after
   the rollback/replay/backup horizon and restore test pass.

For a migration that needs further failure evidence, test the consequential crash/restart,
stale-client and abort/resume transitions in a bounded authorized environment. Reuse valid
existing controls and record untested states. Track relevant source/target watermarks, apply lag,
mismatches, stale-epoch rejections, copy cost and rollback-log horizon. Define a safe response for
each phase when foreground SLO or replica/quorum guardrails are crossed: throttle or pause copy,
hold cutover, or execute the verified recovery protocol. A blind stop can lose capture or rollback
data. Preserve one write authority and the necessary log/tombstone horizon while stopped; name
the checks and authority required to resume, roll back or decommission.

For example, Vitess 22 MoveTables documents Cancel only before traffic has switched, and a
different ReverseTraffic path afterward; disabling reverse replication removes its documented
write-rollback path. Use the target release's actual commands and preconditions. This source
example does not authorize running them or establish a live migration's correctness.

## Primary references

- [Kleppmann, Beresford and Svingen, Online Event Processing (2019)](https://martin.kleppmann.com/2019/05/01/olep-cacm.html) — background on event-log coordination, not a validation of this migration sequence.
- [Debezium 3.3 PostgreSQL connector](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html)
- [PostgreSQL 18 logical decoding concepts](https://www.postgresql.org/docs/18/logicaldecoding-explanation.html)
- [PostgreSQL 18 transaction atomicity](https://www.postgresql.org/docs/18/tutorial-transactions.html) — within its actual transaction domain, not across independently committed stores.
- [Vitess 22 routing through VTGate](https://vitess.io/docs/archive/22.0/concepts/vtgate/)
- [Vitess 22 Vindexes and lookup routing](https://vitess.io/docs/archive/22.0/reference/features/vindexes/)
- [Vitess 22 topology-service serving and recovery](https://vitess.io/docs/archive/22.0/reference/features/topology-service/)
- [Vitess 22 MoveTables phase and rollback controls](https://vitess.io/docs/archive/22.0/reference/vreplication/movetables/)
- [MySQL 8.4 auto-increment increment and offset](https://dev.mysql.com/doc/refman/8.4/en/replication-options-source.html) — source semantics, not a tested server configuration.
