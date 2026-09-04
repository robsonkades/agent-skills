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

## Plan evidence

- SQL Server: compare `SeekPredicates` with residual `Predicate`, actual rows, executions, logical
  reads, lookups, and implicit conversions.
- MySQL: inspect `used_key_parts`, access type, actual rows/loops from `EXPLAIN ANALYZE`, and rows
  examined. “Using index” means covering, not merely index access.
- PostgreSQL: compare `Index Cond` with `Filter`, `Rows Removed by Filter`, loops, buffers, and
  `Heap Fetches`. An index-only scan depends on the visibility map maintained by VACUUM.

## Semantics that do not port

- Unique nullable columns: SQL Server ordinarily permits one `NULL`; PostgreSQL and MySQL permit
  multiple `NULL`s by default. PostgreSQL 15+ can request `NULLS NOT DISTINCT`; SQL Server often
  uses a filtered unique index to express “unique when present.”
- A partial/filtered index is usable only when the optimizer can prove the query predicate implies
  the index predicate at planning time. Parameterization and generic plans can defeat that proof.
- PostgreSQL index order includes explicit `NULLS FIRST/LAST`; requested null placement can decide
  whether an index satisfies ordering.
- PostgreSQL BRIN summarizes physical page ranges and fits huge correlated tables and broad scans;
  it is not a cheap substitute for a selective B-tree.
- SQL Server columnstore, PostgreSQL GIN/GiST/SP-GiST/BRIN, and each engine's full-text facility
  answer different workloads. Select from predicate semantics, not feature-name resemblance.

## UUID warning

Time ordering is a property of the value plus the column's comparison semantics. SQL Server
`uniqueidentifier` does not compare UUID v7 bytes in timestamp order; `BINARY(16)` preserves the
chosen byte order. InnoDB pays PK width in every secondary index. PostgreSQL's native `uuid` lives
outside the heap organization but still affects B-tree locality and index size.
