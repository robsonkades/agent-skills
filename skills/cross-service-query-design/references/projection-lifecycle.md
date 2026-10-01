# Projection lifecycle

Read when choosing or repairing a read model. This reference owns the query's acceptance and
recovery contract; use the existing delivery, idempotency, event-sourcing and CDC specialists
for their respective mechanisms. No broker, event store or extra database is mandatory.

## Select supported input, not accidental access

Determine which state the projection needs and who is allowed to publish or expose it.
An integration event can carry a stable business fact; a CDC record can reflect storage
changes. Neither is automatically an authorized cross-service contract. Agree schema meaning,
identity, deletion, retention and compatibility with the owner. Avoid binding query consumers
to private table layouts through undeclared access. A supported owner export can be a simpler
backfill contract than replaying every internal transition.

Use existing reliable publication where adequate. A database commit followed by an ordinary
broker send can lose a change between the two operations. Do not solve that by having the
query service become a second writer of authoritative business data. Route publication
atomicity and repeat handling to their specialists.

For each input, establish:

- Keys including tenant, source identity/lineage and the ordering or revision scope. Numeric
  offsets from unrelated partitions, owners or restored histories cannot be compared as one
  global version. Preserve the provider's complete position representation.
- Full-state replacement versus ordered deltas. Ignoring an older full-state version can be
  valid within one revision domain; ignoring a missing delta may corrupt an aggregate. Define
  duplicates, gaps, reordering and quarantine before choosing consumer concurrency.
- The projection's initial state and replay/backfill source. Current-state snapshots can
  reconstruct current facts under their contract, not deleted history or every past transition.
- Schema evolution, payload minimization and deletion/revocation paths. A derived copy expands
  the set of places that must enforce the data's access and retention rules.

## Progress must describe the visible answer

A useful progress record identifies projection generation, source/feed domain, durable applied
position and the coverage it establishes. Advancing a checkpoint while row writes fail creates
a false freshness claim. Tie projection mutation and checkpoint advancement together using a
store-supported transaction or another proven recovery/deduplication protocol. Consumer
offset commits and broker “exactly once” do not independently establish exactly-once effects
in an arbitrary external view store.

When workers apply one feed concurrently, a checkpoint claiming coverage through a position
must cover every required predecessor, not merely the largest completed position. A failed
earlier item still blocks that claim even when later row writes and checkpoints commit
atomically. Track unresolved work or advance only over proven complete coverage; do not infer
missing records from numeric offset gaps without the source's contract. The
[Kafka 4.1 consumer contract](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
distinguishes fetch position from recovery position and allows offset gaps; neither position
by itself certifies an external projection's applied state.

For multi-source views, progress is generally a vector of scoped positions. Its components
do not prove a coherent distributed snapshot. Define the completeness condition for joined
entities: buffer pending relationships, represent them explicitly or exclude them under a
contract whose coverage accounts for them. Filtering incomplete rows without reporting the
semantic consequence can change totals and hide work indefinitely.

Measure a known business change from source commit through capture, delivery, application
and query visibility. If replicas/caches serve queries, their delay matters too. Timestamp
subtraction needs clock/meaning evidence; offset lag and last-event age measure different
things. A quiet source does not prove a stall or currency. A heartbeat proves only its covered
path; verify capture filters and required data domains.

For read-your-writes, propagate an owner-issued token that the query path can relate to durable
visible progress. A bounded wait may continue until that requirement is met; on timeout use
an explicitly contracted pending response, authoritative read or failure. An authoritative
fallback must still preserve tenant policy, query shape and capacity budgets. Waiting for one
order's version does not make a whole cross-source dashboard current. Do not accept arbitrary
client versions that can force indefinite waits or expensive replay.

## Rebuild without inventing continuity

1. **Prove recoverable inputs.** Record required retained history or an owner-supported
   snapshot plus a compatible continuation boundary. Account for updates/deletes during the
   snapshot. An independent full-table scan followed by “start consuming now” has a gap.
   If required data is gone, report the lost coverage and choose an explicit resynchronization
   contract; resetting offsets cannot recreate it.
2. **Create an isolated generation.** Give new state and progress a generation-specific
   namespace. Start it from the appropriate source boundary; reusing the old generation's
   completed checkpoint can skip the entire rebuild. Apply current access/deletion policy so
   retained old data is not made visible again by replay.
3. **Bound the backfill.** Limit source load, bytes, worker queues and destination writes while
   preserving the required ordering. Use measured net drain capacity above arrival rate to
   estimate catch-up; a quick empty fixture supplies no production recovery estimate.
4. **Reconcile state and meaning.** Check representative joins, authorized row/field sets,
   deletes, unmatched keys and business aggregates against authoritative evidence at compatible
   boundaries. Counts alone can match while rows differ. Verify gaps/quarantine are resolved or
   explicitly excluded by the accepted coverage contract.
5. **Cut over at a declared acceptance point.** Require the new generation to cover agreed
   source positions and satisfy freshness, query and access checks. Change routing atomically
   enough for the serving contract, with an explicit cursor policy. Name the operator and the
   stopping criterion before switching.
6. **Retain a viable return path.** Keep the old generation current if traffic may return to
   it; an old snapshot is not a safe rollback once it falls outside the freshness/access bound.
   Retire generations, temporary data and cursors according to the retention policy.

Debezium **3.3** PostgreSQL incremental snapshots are one concrete example of a connector
coordinating snapshot rows with concurrent streamed changes using windows and collision
handling. That is a connector-specific mechanism, not proof that an arbitrary export plus
consumer offset is safe. See [the connector's incremental snapshot contract](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html#postgresql-incremental-snapshots)
and inspect the deployed connector version/configuration before using it. Capture operations
and source-log retention remain with `change-data-capture-operations`.

## Failure evidence to collect

For duplicate/reordered delivery, verify business state and progress, not just received event
counts. Finish a later item while an earlier required item remains blocked; verify coverage
does not advance past the hole and restart still recovers that item. For a crash between data
application and acknowledgment, verify restart does not lose or multiply the effect. Exercise
a missing predecessor, incompatible payload, deletion during backfill, a revoked user querying
retained generations, and live writes during cutover.

Record the actual query result, applied source positions, generation, authorization context,
clock provenance and time to recovery. Protect sensitive evidence. State which boundary was
tested and which remains assumed; a successful rebuild of current state proves no historical
audit completeness, distributed snapshot or production delay guarantee.
