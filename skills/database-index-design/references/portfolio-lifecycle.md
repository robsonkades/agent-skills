# Index portfolio lifecycle

## Before adding

- Capture the application's real parameterized statement and executed plan.
- Check whether an existing index can be extended, reordered only with acceptable regressions, or
  replaced by one candidate serving several queries.
- Check constraints, child foreign keys, partition alignment, specialized predicates, and engine
  limits for key width/columns.
- Estimate index bytes, build scratch space, log/WAL generation, replication lag, and write cost.
- Define the signal expected to move: reads/buffers, rows examined, sort/spill, lookup count, lock
  footprint, or latency under the same workload.

## Safe creation

The terms are not equivalent:

- SQL Server online/resumable availability depends on operation and edition; online work still has
  boundary locks and concurrent-write/log cost.
- MySQL `INSTANT`, `INPLACE`, and `COPY` have operation-specific support; declare the algorithm and
  lock requirement so the server fails instead of silently choosing a costlier path. Metadata-lock
  waits can stall even instant DDL.
- PostgreSQL `CREATE INDEX CONCURRENTLY` uses multiple phases, can leave an invalid index after
  failure, and cannot run inside an ordinary transaction block. Check the migration runner's
  transaction mode. Verify the definition and `indisvalid`; an invalid index may still incur
  maintenance, and a failed concurrent UNIQUE build can continue enforcing uniqueness.
  Inspect the failure phase and choose supported drop/rebuild or reindex recovery. Retrying
  with `IF NOT EXISTS` only checks the name, not validity or equivalent definition.
  PostgreSQL 18 cannot build the partitioned parent index concurrently: plan per-partition
  concurrent builds followed by supported parent creation/attachment and verify every partition.

Canary the change where possible and stop on lock-wait, log/disk, replica-lag, or latency guardrails.

## Before removing

Collect longer than the longest business cycle and across all roles. A zero usage count can mean a
counter reset, seasonal job, use only on a replica, or a non-query role such as uniqueness or FK
support. Distinguish three experiments: hypothetical indexes estimate plans without runtime
evidence; invisibility excludes an eligible index from normal optimizer use; dropping removes
its physical/write cost. MySQL invisible indexes remain maintained and retain uniqueness
enforcement, so they test read-plan dependence but not write savings. Primary keys cannot be
made invisible, and FK requirements can block invisibility/removal. SQL Server `DISABLE`
is not a reversible visibility switch: disabling a nonclustered index removes its pages;
disabling a clustered index can make table data inaccessible.

Do not declare `(a)` redundant merely because `(a,b)` exists: compare uniqueness, predicates,
sort direction/collation, includes, width, constraints and measured read/write behavior.

Plan removal's lock and transaction behavior as explicitly as creation's. In PostgreSQL 18,
ordinary `DROP INDEX` takes an `ACCESS EXCLUSIVE` table lock. `DROP INDEX CONCURRENTLY` avoids
blocking table reads/writes but can wait for conflicting transactions; bound the wait and inspect
blockers. It accepts one index, cannot run in a transaction block or use `CASCADE`, and cannot
remove an index owned by a constraint this way or a partitioned parent index. Check dependencies
and the migration runner before selecting it. Do not silently fall back to a blocking drop when
concurrent removal is unsupported. After interruption, inspect catalog state before retrying;
keep the original definition and a recreation path whose cost fits the recovery objective.

After removal, monitor the plans and invariants the index served and retain a tested recreation
path. Do not drop several overlapping indexes at once unless the rollback can identify which one
was needed.

## Sources

- [PostgreSQL concurrent index failure and recovery](https://www.postgresql.org/docs/18/sql-createindex.html)
- [PostgreSQL 18 DROP INDEX locking and restrictions](https://www.postgresql.org/docs/18/sql-dropindex.html)
- [MySQL 8.4 invisible index restrictions and maintenance](https://dev.mysql.com/doc/refman/8.4/en/invisible-indexes.html)
- [SQL Server disabling indexes and consequences](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/disable-indexes-and-constraints?view=sql-server-ver17)
