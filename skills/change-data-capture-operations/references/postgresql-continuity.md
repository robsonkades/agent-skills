# PostgreSQL WAL and failover continuity

Read for PostgreSQL source retention, slot incidents, schema-state questions or promotion.
Examples target PostgreSQL 17 and Debezium 3.3.2.Final with `pgoutput`.

## Identify the actual state

Inventory connector offsets, source identity, slot name/plugin/database, publication membership
and table replica identity. PostgreSQL does **not** use MySQL's persisted internal schema-history
topic. Its connector reconstructs schema information through database/protocol metadata; do not
create or delete a MySQL-style history topic to repair it. The version-pinned
[PostgresSchema implementation](https://github.com/debezium/debezium/blob/v3.3.2.Final/debezium-connector-postgres/src/main/java/io/debezium/connector/postgresql/PostgresSchema.java)
uses `RelationalDatabaseSchema`, refreshes database schema and applies relation metadata without
the historized schema implementation.

## Observe retention before reclaiming it

Read-only SQL for an authorized monitoring connection to a PostgreSQL 17 **primary**; replace
the illustrative slot name. It requires access to the statistics and WAL functions:

```sql
SELECT slot_name, active, restart_lsn, confirmed_flush_lsn,
       wal_status, safe_wal_size, invalidation_reason,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_span_bytes,
       pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS unconfirmed_span_bytes
FROM pg_replication_slots
WHERE slot_type = 'logical' AND slot_name = 'orders_cdc';
```

`restart_lsn` bounds the oldest WAL the slot might need; `confirmed_flush_lsn` records consumer
confirmation. The spans are WAL distances, not exact disk usage, event counts or sink lag.
`wal_status='lost'` means the slot is unusable. A null `safe_wal_size` is not proof of safety:
it can accompany an unlimited retention setting or a lost slot. An absent row is a missing-slot
finding, not zero lag. Check physical disk separately and investigate every slot that retains
resources. Column availability is version-specific.
[PostgreSQL 17 slot view](https://www.postgresql.org/docs/17/view-pg-replication-slots.html)
defines these fields.

Slots retain WAL and catalog resources even while disconnected. Crash recovery can resend
changes, so validate duplicate tolerance. Long transactions and other retention owners may keep
WAL after acknowledgment advances. Raising disk capacity buys time; it does not prove that capture
can catch up. See [logical decoding concepts](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html).

`max_slot_wal_keep_size` limits retention at checkpoints and can make a lagging slot unusable;
it is not a zero-loss solution to full disks. Choose its tradeoff against incident response and
restore time using [PostgreSQL replication settings](https://www.postgresql.org/docs/17/runtime-config-replication.html).
Do not manually advance/drop a required slot merely to reclaim space; if continuity must be
abandoned to preserve database availability, record that as an explicit recovery-gap decision.

A busy cluster with a quiet captured database can accumulate WAL without useful captured events.
Check acknowledgment progress, filters and heartbeat settings. Debezium's `heartbeat.action.query`
can generate activity in the captured database when correctly configured; verify its table is
published/captured and its privileges and load are acceptable. An interval alone is not proof
that the needed source activity exists.
[Debezium WAL consumption](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html#postgresql-wal-disk-space)
explains this low-traffic case.

## Promotion is a continuity test

PostgreSQL 17 supports synchronized failover slots; Debezium 3.3 can request one with
`slot.failover`. That setting alone does not configure the HA system or convert every existing
slot. Earlier PostgreSQL versions and managed services need their own documented mechanism.
Verify actual slot state and the provider's procedure, not just a connection endpoint.
[Debezium connector properties](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html#postgresql-property-slot-failover)
document the version boundary.

For native PostgreSQL 17 synchronization, inspect `sync_replication_slots` on the standby,
its physical `primary_slot_name`, `hot_standby_feedback` and `primary_conninfo` database.
Inspect `synchronized_standby_slots` on the primary so logical delivery does not outrun the
designated physical standby. These are prerequisites to assess, not settings to overwrite
blindly; waiting for a standby also affects availability.
[Slot synchronization](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html#LOGICALDECODING-REPLICATION-SLOTS-SYNCHRONIZATION)
and [replication settings](https://www.postgresql.org/docs/17/runtime-config-replication.html)
define the interactions.

Before a planned promotion, verify the expected slot on the standby is synchronized, persistent
and not invalidated; verify required WAL and source lineage cover durable connector progress.
After promotion, verify publication, connectivity and decoding from that progress. Recreating a
slot with the same name does not recover its former position. A PostgreSQL subscriber's
`ALTER SUBSCRIPTION` steps do not configure a Debezium client. Use the slot checks in
[PostgreSQL failover documentation](https://www.postgresql.org/docs/17/logical-replication-failover.html),
then a bounded connector restart and sink-continuity check appropriate to the deployment.

If the promoted node lost acknowledged source transactions, a matching slot cannot restore them.
Record the database replication loss separately from connector replay, and use controlled
resynchronization when an authoritative history cannot bridge the gap.
