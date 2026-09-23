# Snapshots and controlled resynchronization

Read when starting capture, adding tables, restarting a snapshot, or rebuilding after a gap.
First decide whether the requirement is a current-state replica or a complete event history.

## Snapshot choice and restart

For Debezium 3.3 PostgreSQL and MySQL, an incomplete ordinary initial snapshot restarts;
do not promise per-table or per-row continuation from its last emitted record. Incremental
snapshotting tracks chunk progress and can resume with retained connector state while streaming
continues. Verify the deployed mode; custom or newer parallel snapshot implementations require
their own version contract. See the [PostgreSQL snapshot lifecycle](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html#postgresql-snapshots)
and [MySQL snapshot lifecycle](https://debezium.io/documentation/reference/3.3/connectors/mysql.html#mysql-snapshots).

Incremental snapshots resolve collisions between chunk reads and concurrent log events through
snapshot windows. That mechanism does not supply a single transactionally consistent snapshot
across every table, nor deduplicate arbitrary sink side effects. Durable offsets and progress
must survive a restart; an in-flight chunk can be revisited. The
[incremental snapshot design](https://github.com/debezium/debezium-design-documents/blob/main/DDD-3.md)
describes the watermarks, key ranges and offset state behind these decisions.

Before a backfill, verify table inclusion, publication where applicable, key suitability, snapshot
permissions, source load budget, signaling delivery and the sink's handling of `op=r` records.
Do not treat adding a table to a filter as proof that its old rows were copied. Coordinate DDL
with the connector-specific snapshot restrictions; the Debezium 3.3 PostgreSQL connector does not
support schema changes during an incremental snapshot. Choose chunk size from measured query duration, row width,
connector memory and source impact, rather than a universal row count.

Illustrative **signal payload**, not a complete deployment or a command to execute. For Debezium
3.3.2 PostgreSQL with a configured signaling channel, captured `public.orders` and a suitable key:

```json
{
  "type": "incremental",
  "data-collections": ["public[.]orders"]
}
```

The collection selector is a regular expression; `[.]` restricts the separator to a literal dot.
Send it as the data of an `execute-snapshot` signal using the configured channel and an operation
identifier. Check delivery, connector acceptance, progress and completion separately. Do not insert
into a guessed signal table. Source-channel signaling has database-write prerequisites; Kafka-channel
signaling has its own topic/key/envelope. Neither implies that source-side watermark requirements
disappear. See [Debezium signaling](https://debezium.io/documentation/reference/3.3/configuration/signalling.html).

## A gap needs an explicit rebuild decision

Use this sequence when required logs, offsets or schema history cannot be recovered consistently:

1. Preserve configuration, identities, durable positions, retained ranges and failure evidence.
   Establish the last trustworthy boundary and whether an authoritative backup/source can restore
   the missing range. Restoring bytes alone does not establish decoder/schema compatibility.
2. State what is lost: intermediate updates, deletes, transaction order or business side effects.
   A new snapshot cannot infer those from current rows. If every transition is required, report
   the gap until an authoritative history is available; do not label a rebuild lossless recovery.
3. Choose a sink strategy before changing capture state. A fresh generation with verified cutover
   makes stale-row removal explicit. For in-place repair, specify key reconciliation and fencing
   against concurrent old/new writers, plus which events may trigger external effects.
4. Define how the baseline and concurrent changes join without a hole or stale overwrite. Use the
   connector's supported snapshot-to-stream protocol; do not invent a timestamp or an LSN to skip
   the gap. A mode such as `when_needed` or `always` can automate snapshot initiation, not acceptance
   of the resulting history loss or sink policy.
5. Validate at a common logical boundary: compare key sets including deletions, representative
   values or canonical checksums, schema compatibility and post-snapshot streaming progress.
   Freeze writes or use a documented consistent comparison strategy; independently moving scans
   can disagree without corruption. Retain the prior generation until cutover criteria hold.

Counterexample: the sink contains keys 10 and 20; the source deleted 20 during the missing range.
A new snapshot containing only key 10 cannot emit the historical delete of 20. Upserting snapshot
rows alone leaves the sink wrong. The proposed repair must explain how key 20 disappears, and how
a delayed event from the old capture cannot resurrect it. This is a consequence of state rebuilding,
not a connector feature that an offset reset repairs.

Define abort thresholds for source latency, remaining log/disk runway and inconsistent validation.
If aborting, preserve recovery state and identify which generation remains authoritative. A written
runbook is not evidence that restart, failover or sink reconciliation has been exercised.
