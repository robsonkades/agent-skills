# Isolated persistence contract fixture

This is a teaching fixture, not a production application or tuned configuration. It
uses Java 25, Maven, Boot 4.1.1 and its managed Hibernate 7.4.5.Final. It creates
only an in-memory H2 database during automated tests. No HTTP server, external database,
container, migration of existing data or agent installation is started.

Copy this entire directory to an isolated temporary working directory before running:

```text
mvn -B -ntp test
```

Prerequisites: JDK 25, Maven and access to the declared artifacts
(or a prepared local repository). Maven writes `target/` under the copied directory and
downloads dependencies into its local repository. For isolated dependency storage, pass
`-Dmaven.repo.local=<temporary-cache>`. Do not build in the installed skill directory.
The authoring environment uses Temurin JDK 25.0.3. The fixture compiles with release 25
and runs on Java 25. No wrapper or shell script executes automatically.

Ten automated tests assert:

1. A service call commits a managed reservation and preserves an omitted description.
2. An exception after `flush()` rolls back stock and movement rows through the actual proxy.
3. Two independently managed transactions detect a stale optimistic update; the loser
   rolls back and an independent reader sees only the winner.
4. Hibernate 7.4's collection-fetch page includes roots with no children, preserves
   two-page ordering/count and emits database limiting on the H2 dialect.
5. Auditing uses the fixed Clock wired through DateTimeProvider and survives rereading.
6. The optional note persists null and present values, accepts its documented limit,
   rejects an oversized value and can be cleared back to null.
7. Distinct transient Movement entities with null generated IDs remain unequal.
8. A HashSet retains membership across generated ID assignment; detached and independently
   loaded Movement instances compare equally with equal hashes.
9. With proxy compliance explicitly false, the exact effective-class/getter-ID equality
   pattern is symmetric for uninitialized proxies before and after context close.
10. With proxy compliance true in a separate context, the same ID getter can initialize
    an associated proxy. After context close detaches it, equality uses the known ID without
    initialization on this pinned provider, while unloaded non-ID access raises LazyInitializationException.

Movement preserves the requested final equals/hashCode pattern. Its class-based hash is
stable across ID generation but has poor distribution for large sets. The compliance
pair demonstrates a limitation, not a recommendation to disable compliance in applications.
Inventory retains reference equality because this fixture does not require cross-context
logical equality for it; OutboxEvent remains a mapping probe. Inheritance, bytecode
enhancement and other providers require their own checks.

Observed authoring evidence: the coordinator's clean isolated run compiled with
`--release 25` and passed **10 tests, zero failures/errors/skips** (9 persistence contracts
and 1 proxy-compliance contract), including detached-ID behavior and the negative
unloaded-state check. The run used Temurin 25.0.3, Maven 3.9.15, Boot 4.1.1,
Hibernate 7.4.5.Final and H2 2.4.240. Both compilation and execution used Java 25.

Read the Surefire result, not only the exit status. These tests exercise selected state,
proxy, audit and query behavior. They do not establish production database isolation,
Hikari sizing, high-load behavior, SQL Server pagination or pessimistic timeout support.
The pessimistic repository/service path compiles but is not a two-session runtime test.

## Complete fixture attribute inventory

All fields use field access. Names and meaningful null/length/write constraints are
explicit below and in annotations; other annotation parameters deliberately retain
defaults. H2 schema generation serves this fixture, not production migration. Optional
columns receive the same review as required ones.

| Entity/attribute      | Meaning and storage                                                                             | Ownership and verification                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Inventory.sku         | Assigned String ID, `sku`, non-null, character length 40                                        | Constructor bounds Java UTF-16 length; immutable after creation, DB primary key                               |
| Inventory.version     | Long null before persistence, non-null `version` BIGINT in persisted rows                       | Provider-managed optimistic version; stale-writer test                                                        |
| Inventory.description | Required String, `description`, character length 200                                            | Constructor bounds Java length; reservation preserves omitted description; no uniqueness claim                |
| Inventory.available   | Primitive int, non-null `available` integer, domain nonnegative                                 | Domain reservation controls updates; primitive zero is not SQL NULL; no DB CHECK is claimed by the annotation |
| Inventory.note        | Optional String, nullable `note`, length 500; null differs from empty                           | Bounded mutable domain method; null/present/oversize/clear test                                               |
| Inventory.createdAt   | Instant, non-null `created_at`, dialect temporal type/precision                                 | Audit DateTimeProvider supplies insert value; excluded from ORM updates; H2 exact-second round-trip tested    |
| Inventory.movements   | Inverse one-to-many, FK on Movement, empty collection allowed                                   | LAZY default, cascade ALL/orphan removal for owned lifecycle; no column annotation; empty-root page test      |
| Movement.id           | Long generated ID, non-null `id` BIGINT; movement_seq allocation 10                             | Provider inserts, never updates ID; lifecycle/hash/equality tests                                             |
| Movement.inventory    | Required LAZY many-to-one, non-null `inventory_sku` FK                                          | Owning side; owner fixed after insert, no cascade to parent; inverse collection maintained                    |
| Movement.quantity     | Positive int, non-null `quantity` integer                                                       | Domain guard; write-once ORM field, no setter; not a database permission                                      |
| OutboxEvent.id        | Long generated BIGINT, `id`, sequence allocation 50                                             | SQL Server DDL/pooled-lo must agree; real-database probes pending                                             |
| OutboxEvent.status    | Short representing 0–255, non-null `status` TINYINT                                             | Explicit JDBC type and SQL Server dialect; Java guard, real boundary round-trip pending                       |
| OutboxEvent.attempts  | Integer, non-null `attempts` INTEGER, initially zero                                            | Explicit JDBC type; SQL script CHECK enforces nonnegative values                                              |
| OutboxEvent.payload   | Required String, `payload` NVARCHAR(1000), nationalized bind, supplementary-character collation | Java limit 1000 UTF-16 units; write-once ORM field; Unicode round-trip pending                                |
| OutboxEvent.version   | Long null before persistence, non-null `version` BIGINT once stored                             | Provider-managed optimistic field; SQL Server behavior unexecuted                                             |

No decimal field exists, so precision/scale are not invented. No Bean Validation dependency
is added solely to duplicate these domain guards. `@NotNull` would require an actual
validation lifecycle; column metadata alone neither validates every input nor proves an
existing schema constraint. Length units must be revisited for other database/encoding
contracts; the Java fixture bounds UTF-16 code units explicitly.

## SQL Server mapping and sequence probe

`src/test/java/example/sqlserver/OutboxEvent.java` compiles with the resolved provider but
is deliberately outside the H2 entity scan. The SQL files are manual probes, not tests
executed by Maven. Docker/database runtime unavailability must be reported as an unrun
check, not a pass.

Use a new disposable SQL Server database with a supported JDBC driver and schema `dbo`.
If using SQL Server containers, the operator must explicitly accept the applicable license
before creating one; this fixture does not accept it or start a container. Record exact
engine/image, JDBC driver, collation and isolation. Never point this probe at a user's
existing application database.

1. Inspect and apply `sql/sqlserver-schema.sql` in that disposable database. It creates
   a sequence and table; it does not delete or alter existing objects.
2. In a dedicated test persistence unit, scan only `example.sqlserver.OutboxEvent`, use
   the SQL Server datasource/dialect, `ddl-auto=validate` and
   `hibernate.id.optimizer.pooled.preferred=pooled-lo`. Do not copy the H2 application's
   scan or automatic create-drop setting. Use the project's established test infrastructure
   to provide the driver, connection and secret, with certificate policy appropriate to
   that isolated environment.
3. Persist statuses 0, 127, 128 and 255 with text `ação 漢 🙂`; flush, commit, clear and
   reread through Hibernate. Assert exact values, reject -1/256 at the domain boundary,
   inspect binds and compare deployed column metadata. This is the check needed before
   relying on Short/TINYINT and nationalized binding.
4. Persist more than 100 events across two independent factories using the same sequence;
   restart one and roll back another insertion. Assert ID uniqueness and committed rows,
   allowing gaps. Audit any non-Hibernate writer before reusing this allocation protocol.
5. Read `sql/sqlserver-lock-probe.sql`; execute the labeled session A and session B parts
   in separate connections with a known inserted ID. Always release/rollback both sessions.
   Then repeat through the actual JPA lock path and compare generated SQL, blocking and
   timeout behavior. The manual hint probe does not prove JPA produces identical hints.

The lock probe intentionally leaves session A open for coordination and must not be run
unattended as a migration. Roll back on completion/failure; close both connections. It
demonstrates lock observation only, not crash recovery or an outbox delivery protocol.

## PostgreSQL contrast

`sql/postgresql-schema.sql` makes the differing type contract explicit. Use a disposable
PostgreSQL instance with the application's encoding/collation and driver, adapt status
to SMALLINT/adequate Java range and use ordinary character mapping. Apply the same value,
sequence and independent-transaction assertions. Do not apply SQL Server TINYINT/NVARCHAR,
SET statements, driver flags or lock hints by analogy. PostgreSQL execution is a separate
check; neither H2 success nor the existence of this DDL establishes it.
