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

## UUID warning

Time ordering is a property of the value plus the column's comparison semantics. SQL Server
`uniqueidentifier` does not compare UUID v7 bytes in timestamp order; `BINARY(16)` preserves the
chosen byte order. InnoDB pays PK width in every secondary index. A PostgreSQL `uuid` primary key
does not automatically cluster heap rows; its values still affect B-tree locality and index size.

## Sources

- [PostgreSQL 18 CREATE INDEX, INCLUDE and uniqueness](https://www.postgresql.org/docs/18/sql-createindex.html)
- [PostgreSQL 18 HOT eligibility](https://www.postgresql.org/docs/18/storage-hot.html)
- [PostgreSQL 18 CLUSTER](https://www.postgresql.org/docs/18/sql-cluster.html) — explicit physical
  reordering is separate from an index definition and is not maintained by subsequent writes.
- [InnoDB clustered and secondary indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
- [MySQL 8.4 functional key parts and expression matching](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)
- [SQL Server computed-column index requirements](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/indexes-on-computed-columns?view=sql-server-ver17)
- [SQL Server GUID comparison semantics](https://learn.microsoft.com/en-us/sql/connect/ado-net/sql/compare-guid-uniqueidentifier-values?view=sql-server-ver17)
