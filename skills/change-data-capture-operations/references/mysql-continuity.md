# MySQL binlog and schema-history continuity

Read for MySQL log expiry, a damaged history store, table additions or a source switch.
The concrete baseline is MySQL 8.4 and Debezium 3.3.2.Final; do not apply these rules unchanged
to MariaDB or another connector.

## Match three kinds of evidence

1. **Durable connector progress:** original source identity, binlog file/position and GTID state
   where enabled, snapshot status and hosting runtime's offset storage.
2. **Available source history:** actual retained files, GTID coverage and replica topology. A
   configured retention duration is not evidence that the needed files still exist.
3. **Schema at the replay point:** internal schema history that can decode that source range.
   The current table definition may differ from the definition used by older row events.

MySQL's internal schema history is distinct from emitted schema-change events and from a
consumer-facing schema registry. Restoring one does not restore the others. Do not use
`snapshot.mode=recovery` after DDL was committed following the last connector shutdown: rebuilding
from current definitions can misinterpret older events. Preserve the old offsets/history and
establish a compatible restore or controlled rebuild instead.
[Debezium MySQL schema history and recovery](https://debezium.io/documentation/reference/3.3/connectors/mysql.html)
specify the restriction.

For the Kafka history implementation, preserve global order with **one partition**, and keep
the required history without compaction or ordinary short retention. Do not copy the compacted
Connect-offset-topic policy onto it. Check effective topic settings and a representative restore,
not only the connector property naming the topic. The connector-specific topic rules in
[Debezium installation guidance](https://debezium.io/documentation/reference/3.3/install.html#configuring-debezium-topics)
are more specific than generic offset-storage guidance. File/JDBC/other stores need their own
durability and restore checks.

## Measure expiry and recovery runway

Read-only MySQL 8.4 inventory statements, run with the required monitoring privileges:

```sql
SHOW BINARY LOGS;
SELECT @@GLOBAL.binlog_expire_logs_seconds AS configured_expiry_seconds,
       @@GLOBAL.gtid_executed AS executed_gtids,
       @@GLOBAL.gtid_purged AS purged_gtids;
```

These statements provide file and GTID evidence, not a complete resumability proof. Compare the
stored position with the actual available range and the connector's GTID source filters; file names
alone do not establish event age or cross-server equivalence. Determine the oldest required event's
age from available log/monitoring evidence. Include planned downtime, detection, restore and catch-up
in the retention budget, with capacity for peak log generation. Increasing retention after purge
does not recreate files. Consult [MySQL binary-log expiration](https://dev.mysql.com/doc/refman/8.4/en/replication-options-binary-log.html#sysvar_binlog_expire_logs_seconds).

An offline CDC reader cannot rely on a live replica connection to protect its required files from
purge. Inventory every reader's needs before an authorized purge. MySQL's
[PURGE BINARY LOGS guidance](https://dev.mysql.com/doc/refman/8.4/en/purge-binary-logs.html)
explicitly distinguishes connected and disconnected replicas. If the requested range is gone,
test whether a compatible retained source/backup can serve it before declaring ordinary restart possible.

## Failover and table additions

Without a verified GTID-based source-switch procedure, do not carry file/position coordinates to
a different server. With GTIDs, verify the replacement has the required transactions and still
serves the unread range; `gtid_executed` membership alone does not prove unpurged binlog availability.
Keep source filters, connector identity, schema history and offset state aligned. A load-balancer
endpoint changing hosts is not this verification. The
[Debezium MySQL topology contract](https://debezium.io/documentation/reference/3.3/connectors/mysql.html#supported-mysql-topologies)
requires a suitable replacement's transaction coverage.

For a new captured table, check whether history collection previously excluded its DDL. Expanding
`table.include.list` does not reconstruct missing schema history or backfill existing rows. Select
a supported history-recovery path and snapshot separately; preserve capture of existing tables.
Test representative old/new schema records and inserts, updates and deletes around the restart.
Do not resolve decoding failures by skipping unknown events unless the resulting data loss is an
explicitly accepted boundary.
