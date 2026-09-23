# DDL and runner control

Read before recommending a DDL operation, a migration-runner setting, or recovery after a
failed migration. This is the execution envelope; per-engine tuning remains with the engine
specialist. The sources below were checked on 2026-09-22. Recheck against the deployed patch,
edition and hosting service before preparing executable operations.

## Classify the operation, not the feature name

For each statement, record its expected lock acquisition and hold phases, table/index scan
or rewrite, temporary/log space, transaction legality, cancellation behavior and residual
objects after failure. Include foreign-key target tables and dependent objects. A metadata
change can be fast once acquired yet wait behind a transaction and block traffic behind it.

Choose the smallest viable execution unit. A short ALTER followed by a long scan in the
same transaction can retain the ALTER's stronger lock until commit. An application's
transaction annotation cannot change the database's DDL rules. Before launching a worker,
choose separate lock-wait, statement/job-duration and idle-transaction limits supported by
the actual engine/runner. Reuse measured project budgets; example timeouts are not defaults.

### PostgreSQL 17

- `ALTER TABLE` normally takes `ACCESS EXCLUSIVE`; individual subcommands have exceptions.
  Adding a nullable column without a default avoids a table rewrite, not that lock.
  Type changes need an operation-specific rewrite assessment.
- `CHECK`/foreign-key `NOT VALID` defers checking old rows but enforces new writes. A later
  `VALIDATE CONSTRAINT` scans with `SHARE UPDATE EXCLUSIVE`. Separate the transactions so
  validation does not inherit an earlier stronger lock. A validated CHECK proving non-null
  can let `SET NOT NULL` avoid its scan; the ALTER still needs its lock.

These are [PostgreSQL 17 ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html)
semantics, not promises for every DDL operation or partitioned-table variant.

For an index on a writable table, `CREATE INDEX CONCURRENTLY` avoids blocking ordinary writes
for the whole build, but can wait for transactions and snapshots and cannot run inside a
transaction block. Failure may leave an invalid index that costs write work; a failed unique
build can still enforce uniqueness. Inspect validity/readiness and the exact definition before
cleanup/rebuild. `IF NOT EXISTS` does not verify an existing index is equivalent. See
[PostgreSQL 17 CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html).

Scope lock/statement timeouts to the migration session and restore them if connections are
reused. A timeout aborts the current statement/transaction context as applicable; the runner
must end an aborted transaction before reuse. Distinguish time spent waiting from execution
and whole-job time in [PostgreSQL 17 client settings](https://www.postgresql.org/docs/17/runtime-config-client.html).

### MySQL 8.4 / InnoDB

Consult the operation-specific matrix before choosing `INSTANT`, `INPLACE` or `COPY`.
`INPLACE` does not imply no rebuild. A data-type change is not made online by adding a
`LOCK=NONE` clause. Prefer an explicitly supported algorithm/lock requirement when a silent
fallback would violate the budget; an unsupported combination should fail rather than trigger
an unreviewed copy. `INSTANT` has its own syntax/eligibility restrictions, so do not append the
same lock clause to every operation. See the
[8.4 online DDL matrix](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html).

An online operation still needs metadata locks, including an exclusive phase when committing
the new definition. A queued exclusive request can block later traffic. Inspect long/idle
transactions and bound the metadata lock wait; a row-lock timeout is not a substitute.
See [8.4 online DDL concurrency](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-performance.html).

Statements such as `ALTER TABLE` implicitly commit. Atomic DDL crash recovery does not mean
several migration statements roll back as one user transaction. Split and reconcile partial
results using the [8.4 implicit-commit rules](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html).

### SQL Server 2022 (16.x)

Verify the edition/service, index type, column types and operation support before choosing
`ONLINE`, resumable execution or low-priority waiting. Online index work still takes locks;
an explicit transaction can retain a final shared/schema-modification lock to transaction end.
Account for extra space and concurrent-write cost. An operation marked resumable needs an
explicit pause/resume/abort lifecycle; cancellation is not necessarily cleanup. Use the exact
statement documentation for that operation, starting with the
[SQL Server 16.x online-index guidelines](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/guidelines-for-online-index-operations?view=sql-server-ver16).
Do not transfer index-operation guarantees to arbitrary column alterations.

## Fit the existing migration runner

Do not require a particular product. Inspect the resolved runner/plugin/driver versions and
effective settings in CI and the deployed migrator; a local CLI can differ from the library
inside a Java application. Verify the actual rendered SQL and transaction boundaries,
including callbacks, statement splitting and session-level settings. Preserve applied
versioned artifacts and create a new corrective migration rather than silently editing history.

Separate runner mutual exclusion from application-writer exclusion. A lock on migration
history may serialize migrators, but does not fence live writes or guarantee that every
autoscaling instance has compatible code. Use one controlled migration job when the existing
deployment supports it; do not turn every application startup into a long DDL/backfill worker.

When using these products, verify the named control for the installed release:

- **Flyway:** check per-script `executeInTransaction`, grouping/mixed migration policy and
  database-specific locking behavior. A PostgreSQL concurrent index requires a compatible
  nontransactional execution unit, not disabling transactions for every migration. Failure on
  an engine without transactional DDL can leave user objects requiring explicit reconciliation.
  [Flyway transaction handling](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/migration-transaction-handling)
  describes these distinctions.
- **Liquibase:** check `runInTransaction`, executor and changeset boundaries. A multi-statement
  changeset with transactions disabled can fail after committing only part of its SQL, leaving
  history inconsistent. Prefer independently verifiable operation boundaries when transaction
  atomicity is unavailable. The consulted page is explicitly
  [Liquibase Secure 5.1 runInTransaction](https://docs.liquibase.com/secure/reference-guide-5-1/changelog-attributes/runintransaction);
  do not infer identical behavior for a different release/edition or native executor.

Flyway documentation here is continuously updated; it is not a pinned-release compatibility
test. Neither runner was executed in authoring this skill. Version-matched documentation and
an isolated rehearsal of the project's actual runner remain necessary for executable advice.

## Resolve a failed or uncertain migration

1. Stop additional migrators and preserve operation identifiers, SQL/checksums, history,
   logs, connection outcome and database object definitions. Bound the ongoing load first
   if the server is still executing work after a client disconnect.
2. Identify what committed. Inspect columns/types/defaults, constraint validation/trust,
   index definition/validity, trigger state and data invariants. Distinguish absent, complete,
   incomplete and complete-but-unrecorded operations.
3. Choose a forward completion, explicit cleanup/retry, or restoration path based on that
   state. An existence check alone cannot distinguish a wrong definition from the intended one.
   Retry only a verified safe operation with a bounded attempt policy.
4. Reconcile runner history only after the physical/data state has a known interpretation.
   Retain the audit of what changed and why. Do not bypass a checksum mismatch without comparing
   the applied artifact, proposed artifact and actual effects.

For example, [Flyway repair](https://documentation.red-gate.com/flyway/reference/commands/repair)
changes history metadata, can realign checksums and remove failed records, but does not clean
up leftover user objects. It is not a failed-DDL undo command. Equivalent history-sync,
checksum-clear or mark-applied mechanisms in other runners deserve the same state inspection.

Recovery is complete when both catalog/data invariants and runner history agree, a restart
selects the intended next step, and application compatibility still holds. A green runner
validation alone is insufficient.
