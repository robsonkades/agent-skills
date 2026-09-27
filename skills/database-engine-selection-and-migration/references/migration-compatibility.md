# Migration compatibility inventory

## Five surfaces

- Schema: types, defaults, generated IDs, constraints, indexes, collations, computed/generated
  columns, partitions, triggers, views, extensions, ownership and row/column access policies.
- SQL: application queries, procedures, hints, pagination, upsert, functions, casts, `NULL`, order.
- Concurrency: effective isolation, lock order/ranges, retries, timeouts, advisory locks, incidental
  invariants.
- JVM: dialect, driver properties, identifier generation, batch, fetch/cursor, timezone, generated
  keys, pools/poolers by role.
- Operations: backup/restore, replication, CDC, jobs, observability, maintenance, DDL, recovery,
  role membership/grants, routine execution privileges and credential mapping.

## Applicable edge cases

Select cases from the inventoried source behavior and intended destination features. Test rather
than translate the applicable cases; an unused feature is not a reason to expand the migration:

- zero/one/multiple `NULL`s under uniqueness;
- accents, case, Unicode normalization, emoji, and trailing spaces under target collation;
- UTC and zones crossing DST, plus offset-preserving and local timestamps;
- numeric minima/maxima, unsigned-to-signed, precision, rounding, and overflow;
- UUID v7 insertion order under the actual destination type;
- rollback/restart/concurrency and generated-key retrieval in batches;
- first generated IDs after final catch-up and after reverse-sync, including sequence/identity
  state and ORM-reserved ranges; matching rows do not prove allocator readiness;
- competing upserts with multiple unique constraints;
- stable keyset pagination with ties;
- parameterized partial/expression-index plans after prepared-statement warm-up;
- result sets larger than client memory with the actual fetch/transaction settings;
- deliberate DDL failure midway and inspection of committed state.

## Validate access under the runtime identity

When the source relies on database permissions, row-level policies or tenant session state,
inventory their enforcement point and test both allowed and denied operations on the destination.
Include views and routines with elevated/definer privileges; copying SQL bodies or table grants
does not establish equivalent effective authority. A missing destination mechanism requires an
explicit replacement design, not silently broader access or an assumption that the application
will take over enforcement.

Run those checks with the effective application role and actual pool/session setup. For example,
PostgreSQL 18 superusers and `BYPASSRLS` roles bypass row security, and table owners normally do too
unless forced to obey it. Comparisons through a bypassing identity do not exercise ordinary tenant
restrictions. See [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

Use a hostile synthetic fixture: tenant A owns row 101; tenant B owns row 202 containing a fake
sensitive marker. As A, read/update its own row, then request B's key directly, scan broadly and
attempt to change a row's tenant identity. Assert the allowed operation works and the forbidden
operations reveal no B marker and make no unauthorized change, with the contract's expected
filter/error behavior. Reuse a pooled connection across A, B and missing-context requests; verify
that old tenant/role state cannot leak into the next request and missing context follows the
declared denial policy. Do not run these checks against real tenants. This is a test specification,
not evidence that any destination's policy has been validated.

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
