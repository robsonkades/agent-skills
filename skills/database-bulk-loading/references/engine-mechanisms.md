# Bulk-loading mechanisms by engine

## JDBC layer

`addBatch`/`executeBatch` groups API calls but does not guarantee one network round-trip, one server
statement, or atomicity. Inspect the effective driver version and settings:

- PostgreSQL: `reWriteBatchedInserts=true` can combine compatible inserts; `COPY` through
  `CopyManager` bypasses per-row parse/bind overhead for larger loads.
- MySQL: `rewriteBatchedStatements=true` rewrites compatible inserts to multi-values or multiple
  statements. Server prepared-statement caching is a separate choice; changing batch sizes can
  multiply prepared statement shapes.
- SQL Server: `useBulkCopyForBatchInsert=true` can route eligible parameterized inserts through Bulk
  Copy. Table locking for that route is a separate property and must not be assumed.

Generated-key requirements, mixed statement shapes, incompatible SQL, or driver limits can disable
rewrite. Confirm by server/protocol evidence rather than configuration intent.

## PostgreSQL COPY

`COPY` is atomic by default and still enforces constraints and triggers. PostgreSQL 17/18
`ON_ERROR ignore` handles certain input-conversion errors, not arbitrary constraint failures; use
staging when rejects need broad classification. For client-side data use STDIN/`CopyManager`; do not
grant server file access merely to avoid streaming.

Unlogged/new-table and WAL optimizations have strict backup/replication/recovery implications.
Measure WAL generation and replica lag rather than assuming a `COPY` variant is minimally logged.

## MySQL LOAD DATA

`LOAD DATA LOCAL INFILE` needs server and client enablement. LOCAL permits a server to request a
client file, so prefer a constrained input stream/path API and keep broad file access disabled.
Always inspect `SHOW WARNINGS` and warning counts: truncation and conversion may not fail the
command.

Changing `innodb_flush_log_at_trx_commit` or `sync_binlog` changes crash-loss guarantees, not the
amount of logical row/index work. Treat it as a durability incident procedure, not a tuning default.

## SQL Server Bulk Copy

Bulk Copy options for table locks, constraint checking, triggers, identity preservation, and
transaction participation determine semantics. Minimal logging depends on recovery model, target
shape/state, table lock, and other prerequisites; compare transaction-log growth to verify it.

Online traffic, Availability Groups, and indexes can turn log generation or replica redo into the
bottleneck even when the loader is fast.
