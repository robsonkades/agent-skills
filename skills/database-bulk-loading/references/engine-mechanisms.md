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

`COPY FROM` does not invoke rules and is unsupported when row-level security applies to the caller.
Use a supported policy-enforcing path such as `INSERT`; do not bypass required tenant/access
checks merely to select the bulk API. Test with the actual loading role, not only the table owner.

`COPY FROM` accepts explicit identity values without automatically advancing their sequence.
After importing existing IDs, verify subsequent application inserts that use generated values.
If reconciliation is needed, coordinate writers and sequence consumers, account for cached
allocations and the sequence's increment/range, and avoid blindly resetting a live sequence from
`MAX(id)`. Sequence changes made by `setval` are not undone by transaction rollback.

Unlogged/new-table and WAL optimizations have strict backup/replication/recovery implications.
Measure WAL generation and replica lag rather than assuming a `COPY` variant is minimally logged.

## MySQL LOAD DATA

`LOAD DATA LOCAL INFILE` needs server and client enablement. LOCAL permits a server to request a
client file, so prefer a constrained input stream/path API and keep broad file access disabled.
Always inspect `SHOW WARNINGS` and warning counts: truncation and conversion may not fail the
command.

In MySQL 8.4, `IGNORE`, or `LOCAL` without `REPLACE`, can downgrade interpretation errors even
under restrictive SQL mode; LOCAL is not merely a file-location choice. Pin SQL mode, storage
engine, duplicate policy, charset, escaping and null/default rules. Collect warnings promptly on
the same connection; retained warning details may be capped, so preserve the total warning count
and validate staged values independently. Test rollback on the actual target storage engine.

`LOAD DATA ... REPLACE` has delete-and-insert semantics on a duplicate key. Missing columns can
take defaults, and conflicts against different unique indexes can delete multiple existing rows.
Check delete/insert triggers and foreign-key actions before using it for replay; it does not
provide update-style preservation of existing data. When that preservation is required, consider
staging followed by an explicit update/insert policy and test the conflicting-key cases.

If a load disables `foreign_key_checks`, re-enabling it does not scan the rows loaded while checks
were off. Validate those relationships explicitly before publication, with a stable dataset or
coordination that prevents concurrent writes from invalidating the check. Returning the setting
to its original value is a separate completion condition.

Changing `innodb_flush_log_at_trx_commit` or `sync_binlog` changes crash-loss guarantees, not the
amount of logical row/index work. Treat it as a durability incident procedure, not a tuning default.

## SQL Server Bulk Copy

Bulk Copy options for table locks, constraint checking, triggers, identity preservation, and
transaction participation determine semantics. Minimal logging depends on recovery model, target
shape/state, table lock, and other prerequisites; compare transaction-log growth to verify it.

For direct `SQLServerBulkCopy`, default `FireTriggers` and `CheckConstraints` are false;
`KeepIdentity` and `KeepNulls` also change generated/default value behavior. Do not transfer
direct-API defaults blindly to the driver's batch-insert optimization; verify that route's
documented options for the installed driver.

When bulk loading bypasses `CHECK` or foreign-key validation, inspect both enabled and trusted
constraint state afterward; primary/unique keys are still enforced. Re-enabling a constraint alone
does not validate existing rows. Validate the affected constraints with the appropriate
`WITH CHECK CHECK CONSTRAINT` operation and confirm `is_not_trusted = 0` and `is_disabled = 0`.
Budget the validation scan and locking before choosing to skip incremental checks; trusted
constraints also supply assumptions the optimizer can use.

`UseInternalTransaction=true` commits each bulk batch on its dedicated connection; a later failure
does not undo earlier committed batches. To commit bulk data and a checkpoint together, supply an
existing connection with the caller's transaction and leave internal transactions disabled.
The driver rejects internal transactions with an existing connection. `BatchSize` controls rows
sent per batch, not a universal all-or-nothing boundary.

Online traffic, Availability Groups, and indexes can turn log generation or replica redo into the
bottleneck even when the loader is fast.

## Sources

- [PostgreSQL 18 COPY](https://www.postgresql.org/docs/18/sql-copy.html) — validation and conversion-error handling; check the deployed major version.
- [PostgreSQL 18 sequences](https://www.postgresql.org/docs/18/sql-createsequence.html) — post-COPY sequence adjustment, cached allocations and rollback limits.
- [MySQL 8.4 LOAD DATA](https://dev.mysql.com/doc/refman/8.4/en/load-data.html) — LOCAL, warnings and interpretation semantics.
- [MySQL 8.4 REPLACE](https://dev.mysql.com/doc/refman/8.4/en/replace.html) — delete/insert semantics, defaults and multiple unique-key conflicts.
- [MySQL 8.4 foreign keys](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html) — referential actions and absence of historical validation when checks are re-enabled.
- [MySQL 8.4 SHOW WARNINGS](https://dev.mysql.com/doc/refman/8.4/en/show-warnings.html) — session diagnostics and retained-warning limits.
- [Microsoft JDBC bulk copy](https://learn.microsoft.com/en-us/sql/connect/jdbc/using-bulk-copy-with-the-jdbc-driver) — options and transaction participation.
- [Microsoft JDBC batch-insert bulk optimization](https://learn.microsoft.com/en-us/sql/connect/jdbc/use-bulk-copy-api-batch-insert-operation) — eligibility and route-specific behavior.
- [SQL Server bulk constraint handling](https://learn.microsoft.com/en-us/sql/t-sql/statements/bulk-insert-transact-sql?view=sql-server-ver17#check_constraints) — skipped CHECK/foreign-key checks and trust state.
- [SQL Server constraint revalidation](https://learn.microsoft.com/en-us/sql/relational-databases/tables/disable-foreign-key-constraints-with-insert-and-update-statements?view=sql-server-ver17) — enabling, validating and restoring trust are distinct.
