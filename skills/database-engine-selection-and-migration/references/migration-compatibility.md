# Migration compatibility inventory

## Five surfaces

- Schema: types, defaults, generated IDs, constraints, indexes, collations, computed/generated
  columns, partitions, triggers, views, extensions.
- SQL: application queries, procedures, hints, pagination, upsert, functions, casts, `NULL`, order.
- Concurrency: effective isolation, lock order/ranges, retries, timeouts, advisory locks, incidental
  invariants.
- JVM: dialect, driver properties, identifier generation, batch, fetch/cursor, timezone, generated
  keys, pools/poolers by role.
- Operations: backup/restore, replication, CDC, jobs, observability, maintenance, DDL and recovery.

## Mandatory edge cases

Test rather than translate:

- zero/one/multiple `NULL`s under uniqueness;
- accents, case, Unicode normalization, emoji, and trailing spaces under target collation;
- UTC and zones crossing DST, plus offset-preserving and local timestamps;
- numeric minima/maxima, unsigned-to-signed, precision, rounding, and overflow;
- UUID v7 insertion order under the actual destination type;
- rollback/restart/concurrency and generated-key retrieval in batches;
- competing upserts with multiple unique constraints;
- stable keyset pagination with ties;
- parameterized partial/expression-index plans after prepared-statement warm-up;
- result sets larger than client memory with the actual fetch/transaction settings;
- deliberate DDL failure midway and inspection of committed state.

## Source-specific traps

Leaving SQL Server: replace lock hints by the invariant they protected; redesign filtered/include/
computed/columnstore choices; revisit `uniqueidentifier`, nullable unique, identity, `OUTPUT`,
`MERGE`, cross-database objects, and TDS properties.

Leaving InnoDB: re-test RR locking and retry; add needed child-FK indexes at destinations that do not
create them; revisit unsigned values, zero dates, collations/name case, auto increment, prefix
indexes, generated columns, and Connector/J-only properties.

Leaving PostgreSQL: inventory extensions/types/operators; redesign partial/expression/include and
deferrable constraints; revisit `RETURNING`, `ON CONFLICT`, `DISTINCT ON`, casts, row comparisons,
schemas, sequences, transactional DDL, and every PgBouncer/session-state assumption.
