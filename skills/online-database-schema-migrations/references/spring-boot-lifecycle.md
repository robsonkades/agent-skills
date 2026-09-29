# Spring Boot migration lifecycle

Read when Flyway or Liquibase runs inside Boot, startup fails after a schema change, or
a deployment job is taking ownership from application startup. Guidance was checked against
Boot 4.1.1 on 2026-09-28. Inspect the target build, resolved runner/database modules, active
profiles, custom beans and deployment configuration first; this does not authorize upgrades.
For datasource/pool, persistence-unit and ORM mapping design, hand off to `spring-boot-jpa`.

## Start with the existing application

Suppose a service already uses Flyway and needs an optional `public_reference` on `invoice`.
Its old release uses explicit column lists and must continue reading and updating invoices.
Keep that runner, its migration numbering and the application's entities/repositories. The
change starts with a new versioned migration, for example this partial SQL fragment:

```sql
-- V42__add_public_reference.sql; use the next version in the project's own history.
ALTER TABLE invoice ADD COLUMN public_reference varchar(100);
```

Nullable permits old inserts to omit the field; it does not prove compatibility with old
queries, serializers, updates or rollback artifacts. Verify those actual paths. Schema names,
lock/rewrite cost and execution limits come from the target engine and deployment evidence.
For Liquibase, add a changeset to the existing changelog instead; do not add Flyway to use this
example or edit an already-applied changeset.

When the existing application datasource and role are suitable for startup migration, let
Boot supply them to the chosen runner. Keep the project's other connection configuration.
For a JPA service where migrations own the schema, this YAML fragment expresses the two
relevant policies:

```yaml
spring:
  sql:
    init:
      mode: never
  jpa:
    hibernate:
      ddl-auto: validate
```

Boot runs the selected migration integration before standard JPA initialization. No custom
datasource bean, startup callback, migration strategy or profile guard is needed for this
case. Use the matching Boot integration dependency already managed by the project; Boot 4.1
provides `spring-boot-starter-flyway` and `spring-boot-starter-liquibase`, and Flyway also needs
the database-specific module where required. These are alternatives, not a dual-runner setup.

Keep startup ownership if the measured operation fits its readiness/restart budget and role.
If it needs a separate DDL role, long backfill or explicit deployment gate, use the dedicated
connection or controlled-job choices below. That changed constraint justifies the extra
configuration; a nullable-column example alone does not.

## Resolve the target and owner before changing startup

Trace each migration and application connection to its database, effective schema/search path,
role and history table. A healthy connection to the wrong database is still the wrong target.
Separate migration credentials can grant DDL while the runtime role keeps DML privileges;
both must see the intended objects. Keep secrets external and identify targets without logging
credentials. Account for migration connections in addition to the application's pool budget.

Boot's normal candidate datasource supplies the runner unless a migration-specific datasource
is configured. For a dedicated bean, use the version-appropriate `@FlywayDataSource` or
`@LiquibaseDataSource`; on Boot 4.1, `@Bean(defaultCandidate = false)` keeps that bean from
displacing the normal auto-configured datasource. With multiple persistence units, explicitly
map every runner to its target and owning history; one migration bean is not tenant discovery.

Setting `spring.flyway.url` selects a separate datasource; a user-only override can derive
connection details from the application datasource. Liquibase has analogous selection paths.
Supply the intended URL, user and password explicitly for a dedicated connection; inspect driver,
schema and custom `ConnectionDetails` beans too. Do not assume credentials will be inherited.
Although the [Boot initialization guide](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
describes fallback for unset properties, Boot 4.1.1's explicit-URL path constructs a new datasource
from runner connection details rather than deriving application credentials. This path is visible
in the pinned
[Flyway source](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-flyway/src/main/java/org/springframework/boot/flyway/autoconfigure/FlywayAutoConfiguration.java)
and [Liquibase source](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-liquibase/src/main/java/org/springframework/boot/liquibase/autoconfigure/LiquibaseAutoConfiguration.java).
Recheck a different Boot/custom-bean path rather than generalizing this result to every version.
For an application-based migrator needing a dedicated role, configure the selected runner
explicitly, for example this Flyway fragment with externally supplied values:

```yaml
spring:
  flyway:
    url: ${MIGRATION_JDBC_URL}
    user: ${MIGRATION_USER}
    password: ${MIGRATION_PASSWORD}
```

Liquibase uses the corresponding `spring.liquibase` properties. Confirm that the migration
target/schema and runtime target/schema refer to the intended shared objects; successful
migration of another database does not prepare the application's database.

Give each schema one coordinated DDL owner. When a runner owns it, use
`spring.sql.init.mode=never`, keep Hibernate `ddl-auto` at `validate` or deliberately `none`,
and audit other initializers such as Batch and Quartz. `update`, `create` and `create-drop`
can compete with migrations or hide missing ones. `none` does not validate anything.
Do not enable Flyway and Liquibase over the same schema accidentally; separate profiles
are alternatives, not a recipe to stack both. A planned tool transition needs an audited
baseline/history handover, not both auto-configurations racing at startup.

## Order initialization and gate readiness

In the standard Boot path, database initializer dependencies order runner execution before
JPA entity-manager-factory initialization; `ddl-auto=validate` then checks mapped structure.
Use the target release's integration dependencies. A runner library alone may not supply Boot's
auto-configuration in a modular Boot release; inspect the resolved dependencies/conditions.
Keep `spring.jpa.defer-datasource-initialization=false` for this arrangement. Its `true` mode
serves SQL scripts that build on Hibernate creation and changes JPA dependency detection;
it is not a remedy for a missing migration. If a custom startup bean reads the database,
use `@DependsOnDatabaseInitialization` where appropriate and test that bean's actual access.
An asynchronous custom migrator must provide its own completion/readiness contract.

Validation layers answer different questions:

| Gate                         | What it establishes                                                               | What remains to test                                      |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Runner history/checksums     | Expected artifacts agree with recorded execution under that runner's policy       | Actual catalog/data, out-of-band changes and partial DDL  |
| Hibernate `validate`         | Provider's checks of mapped tables/columns/types and related mapping requirements | Every index, trigger, data invariant, query or old binary |
| Old/new application contract | Tested reads/writes work in that rollout phase                                    | Untested writers, production lock duration and workload   |

Never turn off validation or enable schema update just to make a startup green. Determine
whether failure reflects wrong target/schema, missing migration, incompatible mapping, edited
history or an actual rollout-order error. Preserve failed startup as evidence and reconcile
before retrying. For custom factories and startup readers, inspect Boot's
[initialization dependency contracts](https://docs.spring.io/spring-boot/how-to/data-initialization.html#howto.data-initialization.dependencies).

## Choose startup or a deploy job from deployment constraints

- **Startup can remain appropriate** for bounded, measured migrations within readiness and
  restart budgets, with an approved role and understood concurrent-launch behavior. Test an
  already-current database and two potential migrators; runner locks serialize migration work,
  not old application writes. Do not place a large resumable backfill in a startup callback.
- **A controlled job fits** long operations, many replicas, separate DDL credentials or a
  deployment requiring an explicit schema gate. Package the reviewed migration artifacts and
  compatible runner version, target/schema/history and transaction controls with the job.
  Run it once under deployment orchestration, inspect completion/history/catalog evidence,
  then admit compatible applications. Disable the selected startup runner in application
  deployments (`spring.flyway.enabled=false` or `spring.liquibase.enabled=false`); keep SQL
  init off and JPA validation or an explicit compatibility/readiness check. Disabling the
  runner alone neither creates nor checks its history. A job sharing an application image
  must avoid starting HTTP listeners, schedulers and business workers unintentionally.

In either choice, deploy additive expansion before new code that requires it; old code must
still work on the expanded schema. Declare what old inserts may omit, defaults/null behavior,
what old updates preserve, and which new values would invalidate rollback. Test actual old
and new release artifacts when available, not only their entity metadata. Re-launching an old
image may also run its old migrator: rehearse its policy for newer history. Prefer central
ownership where old startup artifacts cannot safely validate/run that history. Contraction
waits until every supported writer, recovery image and rollback artifact retires the old shape.

## Keep history meaningful

For **Flyway**, retain validation on migrate and review applied SQL checksum mismatches against
the original artifact. A new versioned migration is the normal correction. Repeatable migrations
are deliberately re-applied when their checksum changes; they need repeat-safe semantics and
dependency ordering. They are not permission to rewrite an applied versioned migration.
`repair` changes history, not leftover user objects. Inspect actual state before any repair.
[Flyway validate](https://documentation.red-gate.com/flyway/reference/commands/validate),
[repeatables](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/repeatable-migrations),
[repair](https://documentation.red-gate.com/flyway/reference/commands/repair).

For **Liquibase**, changeset identity includes id, author and file path (or logical file path);
renaming/moving it can affect identity even when its SQL is unchanged. Preserve applied
changesets and inspect checksum mismatches before a forward correction. `runOnChange` is an
explicit rerun contract useful for replaceable objects; it is not a generic escape hatch for
an incompatible table change. Clearing checksums or accepting a new checksum does not execute
missing DDL or prove data correctness. Review `DATABASECHANGELOG` and catalog together and
only release an apparent stale migration lock after proving no owner is still executing.
[Liquibase Community changesets](https://docs.liquibase.com/community/user-guide-5-0/what-is-a-changeset),
[runOnChange](https://docs.liquibase.com/secure/reference-guide-5-1/changelog-attributes/runonchange).
The latter is a Secure 5.1 page; verify the installed edition/release rather than assuming
the same behavior in every Community or Secure release.

## Verify the change in the consuming project

Start from the application's existing integration tests and database setup. If a full Boot
lifecycle check is needed, `@SpringBootTest` can load its real migrations and exercise its
repository or service without a duplicate application. Choose assertions about the changed
contract: for the optional field, read a pre-expansion row, save/read its new value, and verify
the permitted old writer preserves it. Plain save/find CRUD alone does not demonstrate an
upgrade or old/new compatibility. Keep data setup/cleanup appropriate to the project's test
isolation; when the claim involves committed writes or a restart, do not hide them inside a
test transaction that always rolls back.

A project already using a `@TestConfiguration` container bean with `@ServiceConnection` can
reuse it; Boot owns connection details and the container's context lifetime. Boot's
[container lifecycle and service connections](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
also document that connection details override properties. Restrict their types when testing
dedicated runner properties, or test those paths in a context without runner-specific service
connections. A green test using container-supplied runner credentials does not test the
production `spring.flyway.*` or `spring.liquibase.*` credential path.

Add only the checks that exercise the changed risk:

| Changed risk                  | Discriminating check in the actual project                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New migration                 | Upgrade a database at the supported previous version with representative rows; run the changed application behavior and re-launch on that state.                               |
| Overlapping releases          | Run the permitted old/new reads and writes, including an old insert omitting the new field and an old update preserving a new value.                                           |
| Dedicated runner connection   | Exercise the real property/bean selection; assert the intended database/schema/role and authentication behavior. A different populated target can also pass schema validation. |
| Startup replaced by a job     | Prepared schema admits the application with its runner disabled; incompatible/unprepared schema fails its validation/readiness gate.                                           |
| History or runner upgrade     | Validate the actual applied artifacts; in a disposable copy, prove a checksum mismatch stops progression without repair or checksum acceptance.                                |
| Vendor DDL or concurrent work | Rehearse lock waits, partial failure and restart with the project's engine, runner settings and workload; inspect catalog and history together.                                |

Failed startup can use Boot's
[ApplicationContextRunner](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/test/context/runner/ApplicationContextRunner.html)
when a narrow configuration check needs explicit context creation/closure. Actual release
compatibility needs the release artifacts and their writes, not two hand-built replacement
entities. Neither task requires a reusable launcher, a duplicate runner implementation, or a
suite for the migration tool the project does not use.

These fragments and check designs are adaptation guidance, not a shipped test application or
recorded database rehearsal. If the matching database is unavailable, perform configuration,
source and migration-history review and report the unexecuted vendor checks. H2 cannot prove
production DDL locking, duration or recovery. Use [runner controls](ddl-and-runner-control.md)
for engine-specific transaction and partial-failure recovery; Boot does not change those rules.
