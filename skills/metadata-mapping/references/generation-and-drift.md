# Generation and Drift

Use the checks relevant to the mapping/schema change or unresolved drift question. Reuse
applicable gates and evidence; a metadata explanation or adequate existing design does not
require new migrations, generation, snapshots or a complete deployment matrix.

## Who generates what

There are two coherent positions and one incoherent one.

```text
Coherent A — schema is the source of truth
    migrations → schema → (generated code | validated mapping)
    Regenerated referenced members can reveal incompatible source changes at build time.

Coherent B — model authors intended schema
    entities → generated DDL → reviewed/versioned migration → deployed schema
    Direct generation into a disposable database is also useful for tests.

Incoherent — competing authorities for the same shared schema
    migrations create the schema AND independent ddl-auto=update adjusts it.
    The result depends on startup order and on which instance booted
    first. This is the configuration that produces "it works in staging".
```

Example Spring Boot configuration when startup validation is an acceptable control:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate # use none where validation occurs in a pre-deploy gate
```

## What `validate` catches, and what it does not

The following describes the Hibernate validation approach, not a portable JPA guarantee.
Check the target provider/version, dialect and metadata privileges for exact coverage.

| Checked at startup        | Not checked                                                     |
| ------------------------- | --------------------------------------------------------------- |
| Table exists              | Indexes declared in annotations actually exist                  |
| Column exists             | Constraints (`CHECK`, `UNIQUE`) exist                           |
| Column type is compatible | Column nullability matches the mapping in every dialect         |
| Sequence exists           | Default values                                                  |
|                           | Column ordering, collation, precision beyond type compatibility |
|                           | Triggers, views, permissions                                    |

When a schema snapshot would expose otherwise unchecked drift, compare the affected schema:

Partial Bash CI fragment: the harness must already own a disposable PostgreSQL fixture bound
to loopback, with role `mapping_test` and schema `public`. Verify that the supplied port/database
identify that fixture; loopback or a database name alone does not prove isolation. Use an
isolated workspace/home, reviewed Maven/Flyway configuration and fixture-only credentials,
clearing inherited connection overrides. Pin plugin/database/client versions. Provisioning
and credentials are harness responsibilities, not supplied by this fragment.

```bash
set -euo pipefail
: "${MAPPING_TEST_PORT:?owned fixture port required}"
: "${MAPPING_TEST_DB:?owned fixture database required}"
[[ "$MAPPING_TEST_PORT" =~ ^[1-9][0-9]{0,4}$ ]] &&
  (( MAPPING_TEST_PORT <= 65535 )) || exit 2
[[ "$MAPPING_TEST_DB" =~ ^[a-z][a-z0-9_]*$ ]] || exit 2
mkdir -p target
./mvnw "-Dflyway.url=jdbc:postgresql://127.0.0.1:${MAPPING_TEST_PORT}/${MAPPING_TEST_DB}" \
  -Dflyway.user=mapping_test -Dflyway.schemas=public -Dflyway.defaultSchema=public flyway:migrate
(
  unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
  pg_dump --host=127.0.0.1 --port="$MAPPING_TEST_PORT" --username=mapping_test \
    --dbname="$MAPPING_TEST_DB" --schema=public --no-password \
    --schema-only --no-owner --no-privileges
) > target/schema.sql
diff -u src/test/resources/expected-schema.sql target/schema.sql
```

The committed expected schema then reviews as part of the pull request, which is the point:
a schema change becomes visible to a reviewer instead of being an inference from a
migration file. This snapshot covers the selected schema; normalize irrelevant dump
ordering/version noise without removing meaningful differences. It does not validate
excluded objects, data migrations, runtime SQL or privileges.

## Generating code from the schema

When the schema is owned elsewhere — a DBA team, a legacy system, another service — generate
the row types and query builders from it at build time (jOOQ is the common Java choice, and
the same principle applies to any generator).

```text
schema (owned elsewhere) ──► build-time generation ──► compiled row types
                                                        and typed queries
```

The gain is conditional: after regeneration from the intended schema, references to removed
or incompatibly changed generated members can fail compilation. Added or unused columns may
not, and stale generated sources hide drift. Retain a schema fingerprint and compare it to
the deployed contract; compilation does not prove SQL or rollout compatibility.

The costs: generation needs schema metadata (a database or supported DDL/XML snapshot),
generated API changes still need review, and the generated API becomes visible in code, so a schema
that is ugly stays ugly unless you wrap it.

## Bytecode enhancement

A build-time step that rewrites entity classes. It is not merely an optimisation; it changes
observable behaviour:

| Feature                              | Effect                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Dirty tracking                       | Inline change tracking can reduce snapshot comparison; mutable types and provider behavior still matter           |
| Lazy attribute loading               | Supports lazy basic attributes where enabled and supported; inspect SQL on the enhanced artifact                  |
| Lazy `@OneToOne` on the inverse side | Enhancement can support laziness for applicable mappings; verify nullability, fetch behavior and provider version |
| Association management               | Can maintain both sides when the enhancement feature is supported/enabled; not a portable JPA guarantee           |

Adopt it for a named reason from that list. The costs are a build plugin, stack traces
through generated code, and behaviour that differs between a plain unit test and a built
artefact if the enhancement is not applied consistently.

## Drift scenarios and their detection

| Scenario                                                   | Symptom                                                                                    | Detection                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Migration renames a column; mapping not updated            | Startup or runtime failure on an affected path                                             | Pre-deploy validation and suitable startup validation against the migrated schema                                  |
| Annotation declares an index that no migration creates     | Silent: queries are slow in production only                                                | Schema diff in CI; explicit index review                                                                           |
| Multiple entities map the same table                       | May be intentional inheritance/projections; overlapping writes/cache identity can conflict | Review writable columns, versioning, ownership and cache behavior; unmapped columns are not inherently overwritten |
| A view is mapped as an entity and later gains a column     | May be harmless; projection/write compatibility depends on actual SQL and view rules       | Check selected/written columns, defaults/constraints, updatability and intended read/write contract                |
| Native query references a dropped column                   | Runtime failure on an affected path                                                        | Execute affected queries with representative parameters; reuse relevant prior coverage                             |
| DTO mapper misses a new field                              | Silent null/default or other wrong value in the API response                               | Strict unmapped-target policy or explicit coverage, plus semantic converter tests                                  |
| `@Column(length = 50)` and the schema's `VARCHAR(30)`      | Truncation error at runtime for long values                                                | Schema diff; `validate` catches type but not always length                                                         |
| Second-level cache configured for an entity written by SQL | Stale reads                                                                                | Cache configuration review (`caching-strategies`)                                                                  |

Adding a view column alone need not break inserts using explicit existing writable columns;
PostgreSQL also supports automatically updatable views under specified conditions. Preserve
intentional supported writes. For a read-only view contract, enforce and test the relevant
ORM write policy and database privileges separately; a provider read-only/immutable mapping
is not authorization against direct SQL or every insert path.

Move relevant discovery to an appropriate pre-deploy or build gate where possible. Runtime
permissions, provider behavior and rollout compatibility still need evidence at their actual
boundary; passing one earlier check does not replace the others.

## Example guardrails when bootstrap or snapshot coverage is needed

```java
// Partial integration-test sketches; application test fixtures/helpers are omitted.
@Test
void persistence_unit_starts() {
    // Provider-supported named-query checks may run at bootstrap.
    // This alone does not initialize Spring repositories or execute native SQL.
    assertThat(entityManagerFactory.isOpen()).isTrue();
}

@Test
void schema_matches_the_committed_snapshot() throws Exception {
    assertThat(dumpSchema()).isEqualTo(readResource("expected-schema.sql"));
}
```

These are partial gates. Bootstrap repositories explicitly when deferred/lazy initialization
would hide errors, execute relevant JPQL/native queries with representative parameters, and
test boundary-value writes. A schema-only dump excluding privileges cannot validate access
rights, and a clean install does not validate an upgrade migration (`architecture-testing`).

Sources: [Hibernate ORM 6.6 guide](https://docs.hibernate.org/orm/6.6/userguide/html_single/),
[Spring Data repository bootstrap](https://docs.spring.io/spring-data/jpa/reference/repositories/create-instances.html),
[jOOQ 3.20 generator configuration](https://www.jooq.org/doc/3.20/manual/code-generation/codegen-configuration/),
[Hibernate 6.6.0 validator source](https://github.com/hibernate/hibernate-orm/blob/6.6.0/hibernate-core/src/main/java/org/hibernate/tool/schema/internal/AbstractSchemaValidator.java),
[PostgreSQL17 pg_dump connection and selection options](https://www.postgresql.org/docs/17/app-pgdump.html),
[PostgreSQL17 updatable view rules](https://www.postgresql.org/docs/17/sql-createview.html#SQL-CREATEVIEW-UPDATABLE-VIEWS),
[Flyway Maven configuration precedence](https://documentation.red-gate.com/flyway/reference/usage/maven-goal).
