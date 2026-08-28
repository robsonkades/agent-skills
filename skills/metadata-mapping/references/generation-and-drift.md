# Generation and Drift

## Who generates what

There are two coherent positions and one incoherent one.

```text
Coherent A — schema is the source of truth
    migrations → schema → (generated code | validated mapping)
    The build fails when the schema changes without the code following.

Coherent B — model is the source of truth (development only)
    entities → generated schema
    Fine for a local database. In any shared environment it means the
    application rewrites the schema on startup, which is not a deployment
    model anyone chose.

Incoherent — both
    migrations create the schema AND ddl-auto=update adjusts it.
    The result depends on startup order and on which instance booted
    first. This is the configuration that produces "it works in staging".
```

Pin position A everywhere but a developer's laptop:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate # never update/create in a deployed environment
    properties:
      hibernate.jdbc.batch_size: 50
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

The gain is precise: when they change a column, **the build fails**, on a change you
did not make, before any deploy. Every alternative discovers the same change later — startup
validation at deploy time, or a runtime error in production.

The costs: the build needs a database (a container is enough), generated sources must be
excluded from review noise, and the generated API becomes visible in your code, so a schema
that is ugly stays ugly unless you wrap it.

## Bytecode enhancement

A build-time step that rewrites entity classes. It is not merely an optimisation; it changes
observable behaviour:

| Feature                              | Effect                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Dirty tracking                       | The entity records its own changes; flush no longer snapshots and diffs — a real gain for large persistence contexts |
| Lazy attribute loading               | Individual `@Basic(fetch = LAZY)` fields (a large blob) actually stay unloaded                                       |
| Lazy `@OneToOne` on the inverse side | Becomes genuinely lazy, which it cannot be otherwise                                                                 |
| Association management               | Both sides of a bidirectional association are kept in sync automatically                                             |

Adopt it for a named reason from that list. The costs are a build plugin, stack traces
through generated code, and behaviour that differs between a plain unit test and a built
artefact if the enhancement is not applied consistently.

## Drift scenarios and their detection

| Scenario                                                   | Symptom                                                     | Detection                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Migration renames a column; mapping not updated            | Startup failure (good) or runtime failure on one path (bad) | `ddl-auto: validate` in every environment                  |
| Annotation declares an index that no migration creates     | Silent: queries are slow in production only                 | Schema diff in CI; explicit index review                   |
| Two entities map the same table with different column sets | Updates lose columns depending on which entity wrote        | Architecture test: one `@Table` name per entity            |
| A view is mapped as an entity and later gains a column     | Insert fails, or the mapping silently ignores it            | Mark view-backed entities read-only and test it            |
| Native query references a dropped column                   | Runtime failure on a rare path                              | Execute every query at least once in CI                    |
| DTO mapper misses a new field                              | Silent null in the API response                             | Generated mapper configured to fail on unmapped            |
| `@Column(length = 50)` and the schema's `VARCHAR(30)`      | Truncation error at runtime for long values                 | Schema diff; `validate` catches type but not always length |
| Second-level cache configured for an entity written by SQL | Stale reads                                                 | Cache configuration review (`caching-strategies`)          |

The pattern across all of these: **the fix is always to move the discovery earlier** —
build, then startup, then first request. Any drift that can be found by a build should be.

## A minimal set of guardrails

```java
@ArchTest
static final ArchRule one_entity_per_table =
    classes().that().areAnnotatedWith(Entity.class)
        .should(haveUniqueTableNames());        // custom condition over @Table

@Test
void every_named_query_parses() {
    // Building the EntityManagerFactory validates JPQL in @NamedQuery and on
    // repository interfaces; this test simply ensures the context starts.
    assertThat(entityManagerFactory.isOpen()).isTrue();
}

@Test
void schema_matches_the_committed_snapshot() throws Exception {
    assertThat(dumpSchema()).isEqualTo(readResource("expected-schema.sql"));
}
```

Three tests and one configuration line (`ddl-auto: validate`) remove most of the drift class
of defects. That is a high return for the effort, and the reason to set it up before the
first schema change rather than after the first incident (`architecture-testing`).
