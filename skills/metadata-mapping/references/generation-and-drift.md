# Generation and Drift

## Who generates what

There are two coherent positions and one incoherent one.

```text
Coherent A — schema is the source of truth
    migrations → schema → (generated code | validated mapping)
    Regenerated referenced members can reveal incompatible source changes at build time.

Coherent B — model authors intended schema
    entities → generated DDL → reviewed/versioned migration → deployed schema
    Direct generation into a disposable database is also useful for tests.

Incoherent — both
    migrations create the schema AND ddl-auto=update adjusts it.
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

| Checked at startup        | Not checked                                                     |
| ------------------------- | --------------------------------------------------------------- |
| Table exists              | Indexes declared in annotations actually exist                  |
| Column exists             | Constraints (`CHECK`, `UNIQUE`) exist                           |
| Column type is compatible | Column nullability matches the mapping in every dialect         |
| Sequence exists           | Default values                                                  |
|                           | Column ordering, collation, precision beyond type compatibility |
|                           | Triggers, views, permissions                                    |

The gap is wide enough that a schema diff in CI is worth having:

Illustrative PostgreSQL/Flyway commands: supply an isolated test database and the same
explicit connection to migration and dump commands; do not rely on ambient production defaults.
Pin database/client versions and normalize irrelevant dump ordering/version noise.

```bash
# Start a container from the migrations, dump its schema, compare with the committed one.
docker compose up -d postgres
./mvnw flyway:migrate
pg_dump --schema-only --no-owner --no-privileges app > target/schema.sql
diff -u src/test/resources/expected-schema.sql target/schema.sql
```

The committed expected schema then reviews as part of the pull request, which is the point:
a schema change becomes visible to a reviewer instead of being an inference from a
migration file.

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
| A view is mapped as an entity and later gains a column     | Insert fails, or the mapping silently ignores it                                           | Mark view-backed entities read-only and test it                                                                    |
| Native query references a dropped column                   | Runtime failure on a rare path                                                             | Execute every query at least once in CI                                                                            |
| DTO mapper misses a new field                              | Silent null in the API response                                                            | Generated mapper configured to fail on unmapped                                                                    |
| `@Column(length = 50)` and the schema's `VARCHAR(30)`      | Truncation error at runtime for long values                                                | Schema diff; `validate` catches type but not always length                                                         |
| Second-level cache configured for an entity written by SQL | Stale reads                                                                                | Cache configuration review (`caching-strategies`)                                                                  |

The pattern across all of these: **the fix is always to move the discovery earlier** —
build, then startup, then first request. Any drift that can be found by a build should be.

## A minimal set of guardrails

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
[jOOQ generator configuration](https://www.jooq.org/doc/latest/manual/code-generation/codegen-configuration/).
