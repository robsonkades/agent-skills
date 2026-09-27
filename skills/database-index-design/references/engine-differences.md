# Engine differences for index design

## Physical model

| Concern                  | SQL Server                                     | MySQL/InnoDB                           | PostgreSQL                                   |
| ------------------------ | ---------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| Table organization       | clustered index is the table; heap is optional | primary key is clustered; no user heap | heap is separate from indexes                |
| Secondary locator        | clustered key, or RID for a heap               | primary key                            | TID/`ctid`                                   |
| Covering syntax          | `INCLUDE`                                      | append to key; no `INCLUDE`            | `INCLUDE`, but heap visibility still matters |
| Partial subset           | filtered index                                 | no general partial index               | partial index                                |
| Expression support       | indexed computed column                        | functional/generated-column index      | expression index                             |
| Automatic child-FK index | no                                             | yes, required by InnoDB                | no                                           |

A wide clustered/primary key is multiplied into secondary indexes in SQL Server and InnoDB. The
same arithmetic does not apply to PostgreSQL's heap/TID model.

The InnoDB row assumes an explicit primary key. Without one, InnoDB selects a suitable
UNIQUE NOT NULL index, or creates a hidden clustered row ID when none exists. Inspect the
actual clustered key before estimating secondary-index width.

## Plan evidence

- SQL Server: compare `SeekPredicates` with residual `Predicate`, actual rows, executions, logical
  reads, lookups, and implicit conversions.
- MySQL: inspect `used_key_parts`, access type, actual rows/loops from `EXPLAIN ANALYZE`, and rows
  examined. “Using index” means covering, not merely index access.
- PostgreSQL: compare `Index Cond` with `Filter`, `Rows Removed by Filter`, loops, buffers, and
  `Heap Fetches`. An index-only scan depends on the visibility map maintained by VACUUM.

## Semantics that do not port

- A single-column unique nullable key: SQL Server ordinarily permits one `NULL`; PostgreSQL and MySQL permit
  multiple `NULL`s by default. PostgreSQL 15+ can request `NULLS NOT DISTINCT`; SQL Server often
  uses a filtered unique index to express “unique when present.”
- Composite uniqueness applies to key tuples, not a one-NULL-per-column allowance. Verify null
  combinations and collation semantics with representative values. `INCLUDE` columns do not
  participate in uniqueness, whereas appending a column to a UNIQUE key changes its contract:
  `(email, status)` no longer guarantees unique `email`. MySQL covering extensions must not
  silently weaken a constraint this way.
- A partial/filtered index is usable only when the optimizer can prove the query predicate implies
  the index predicate at planning time. Parameterization and generic plans can defeat that proof.
- PostgreSQL requires immutable functions/operators in index expressions and partial predicates.
  A predicate based on `now()` cannot define a self-maintaining rolling window; do not falsely
  mark a wrapper `IMMUTABLE` to accept it. A literal cutoff remains fixed as time passes. Compare
  an ordinary timestamp key with the time predicate in the query, or an explicitly maintained
  subset whose update and lifecycle rules preserve correctness.
- SQL Server computed-column indexes have ownership, determinism, precision, type and session
  `SET` requirements. Verify them on both migration and application connections: incompatible
  query-session settings can cause the optimizer to ignore an otherwise existing index.
- MySQL 8.4 functional key parts inherit generated-column restrictions, including prohibited
  stored functions and subqueries. Check the expression's permitted functions, result type and
  collation against the real query; successful DDL alone does not establish usable navigation.
- PostgreSQL index order includes explicit `NULLS FIRST/LAST`; requested null placement can decide
  whether an index satisfies ordering.
- PostgreSQL BRIN summarizes physical page ranges and fits huge correlated tables and broad scans;
  it is not a cheap substitute for a selective B-tree.
- SQL Server columnstore, PostgreSQL GIN/GiST/SP-GiST/BRIN, and each engine's full-text facility
  answer different workloads. Select from predicate semantics, not feature-name resemblance.

## Partitioned tables and uniqueness

Separate the logical identity from the physical partitioning key. A unique index on
`(event_id, event_month)` allows the same `event_id` in different months; it is not global
uniqueness of `event_id`. Adding a partition column to make DDL succeed can therefore change
valid data, references and application conflict handling. Inspect every relevant unique key,
not just the primary key, before proposing a replacement.

- **PostgreSQL 18:** a unique or primary-key constraint on a partitioned table must include
  all partition-key columns; the partition key cannot contain expressions or function calls
  for this purpose. Child indexes enforce within their partitions; independent child unique
  indexes do not enforce an identifier's uniqueness across the parent table.
- **MySQL 8.4:** every unique key, including the primary key, must include every column used
  by the partitioning expression. A legal widened key is not evidence that the original
  uniqueness contract survived.
- **SQL Server:** a partitioned unique index must include its partitioning column in the key.
  A nonaligned unique index can be an alternative when the table's partition column is not
  part of the required identity. Check the actual index's partitioning definition and the
  partition-switch/maintenance requirements; retaining global uniqueness does not establish
  that the proposed aligned maintenance plan still works.

If required global uniqueness cannot be enforced by the proposed layout, retain a compatible
layout or expose the schema-design conflict for resolution. A separately coordinated uniqueness
mechanism requires its own concurrency, failure and lifecycle design; an uncoordinated application
check-then-insert is not a substitute for an enforced invariant. This skill does not authorize
changing identity, partition strategy or conflict semantics to obtain a faster access path.

### Decisive example

These are synthetic contract cases, not executed DDL or performance measurements. Consider a
proposal to partition a PostgreSQL 18 table by the stored, non-null `event_month` column;
`event_id` is also non-null. All other schema and workload inputs are unchanged:

| Required contract                                                      | Decision about `UNIQUE (event_id, event_month)`                                                       | Counterexample/check                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| IDs may recur in different months but must be unique within each month | Candidate enforces that stated tuple contract; still assess plans, writes and rollout                 | Same ID/month pair must fail; same ID in two months may succeed                        |
| IDs must be unique across all months                                   | Reject it as the sole enforcement mechanism; preserve global identity and resolve the layout conflict | Same ID in two months would pass this composite constraint but violate the requirement |

If the scope of uniqueness is unknown, inspect constraints, referencing keys and application
contracts, then ask that specific question if still unresolved. Do not infer a weaker contract
from current data having no duplicates or from a proposed migration that happens to compile.

## UUID warning

Time ordering is a property of the value plus the column's comparison semantics. SQL Server
`uniqueidentifier` does not compare UUID v7 bytes in timestamp order; `BINARY(16)` preserves the
chosen byte order. InnoDB pays PK width in every secondary index. A PostgreSQL `uuid` primary key
does not automatically cluster heap rows; its values still affect B-tree locality and index size.

## Sources

- [PostgreSQL 18 partitioned uniqueness restrictions](https://www.postgresql.org/docs/18/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-LIMITATIONS)
- [MySQL 8.4 partitioning and unique keys](https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations-partitioning-keys-unique-keys.html)
- [SQL Server index partitioning and alignment](https://learn.microsoft.com/en-us/sql/relational-databases/partitions/partitioned-tables-and-indexes?view=sql-server-ver17)
- [PostgreSQL 18 CREATE INDEX, INCLUDE and uniqueness](https://www.postgresql.org/docs/18/sql-createindex.html)
- [PostgreSQL 18 HOT eligibility](https://www.postgresql.org/docs/18/storage-hot.html)
- [PostgreSQL 18 CLUSTER](https://www.postgresql.org/docs/18/sql-cluster.html) — explicit physical
  reordering is separate from an index definition and is not maintained by subsequent writes.
- [InnoDB clustered and secondary indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
- [MySQL 8.4 functional key parts and expression matching](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)
- [SQL Server computed-column index requirements](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/indexes-on-computed-columns?view=sql-server-ver17)
- [SQL Server GUID comparison semantics](https://learn.microsoft.com/en-us/sql/connect/ado-net/sql/compare-guid-uniqueidentifier-values?view=sql-server-ver17)
