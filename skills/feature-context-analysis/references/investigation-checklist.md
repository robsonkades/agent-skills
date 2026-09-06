# Investigation checklist

Use the concerns relevant to the feature. Distinguish supported findings, "not found in searched
paths", "not examined" and "unavailable"; name meaningful coverage limits without turning a
small change into a whole-repository survey.

## Ground truth first

| Question                            | Where to look                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| What builds this, and how is it run | Build file, wrapper scripts, CI workflow, container definition                          |
| Which language and runtime version  | Build file, toolchain declaration, container base image                                 |
| Which framework and which version   | Relevant module build, parent/BOM/catalog/constraints, resolved graph and runtime image |
| Which modules exist                 | Directory layout, module or project declarations                                        |
| What the tests are and how they run | Test directories, the CI job that runs them                                             |

The framework version is the single most common source of wrong guidance: APIs are removed and
replaced between majors, and an answer correct for one is a compile error in the other. Read the
version before asserting anything version-sensitive. A dependency declaration can differ from
the selected version/scope; identify the target profile or Gradle configuration. Reuse available
resolution reports or inspect the project's supported dependency-report command. If execution
needs unavailable artifacts/access, retain that limitation rather than silently selecting a version.

## Structure and conventions

- How are layers separated, and is the separation enforced by anything?
- Where do business rules live today — entity, service, or spread?
- What are the naming conventions for the kinds of file this feature will add?
- Is there an existing abstraction for the thing the feature needs?
- What does the last handful of commits touching this area show about how work is done here?

## Persistence and data

- Which database, which version, accessed how.
- How is the schema changed — migrations, generated DDL, manual scripts? Are migrations
  versioned, and are they ever edited after being applied?
- How are transactions demarcated, and where do the boundaries sit?
- Is there existing data this feature must remain compatible with?
- Are there conventions for identifiers, timestamps, soft deletion, auditing?

## Integration and messaging

- What crosses a process boundary today, over what protocol.
- Is there a broker or queue, and what is it used for?
- How are outbound calls made — which client, with what timeouts and retries?
- How are contracts published and versioned?
- What is the delivery guarantee that existing consumers assume?

## Cross-cutting concerns

| Concern       | What to establish                                                          |
| ------------- | -------------------------------------------------------------------------- |
| Configuration | Where values live, how environments differ, how secrets are supplied       |
| Security      | How callers are authenticated, how authorisation is expressed and enforced |
| Errors        | The exception hierarchy, how failures reach the caller, what is logged     |
| Logging       | Structured or not, which fields, what correlation identifier exists        |
| Metrics       | What is instrumented today, under which names                              |
| Tracing       | Whether spans exist and how context propagates                             |
| Caching       | What is cached, where, with what invalidation                              |
| Concurrency   | Thread model, executors, whether anything is scheduled                     |

## Delivery

- How does a change reach production, and how often?
- What gates run, and which of them are advisory?
- Is there a feature-flag mechanism already in use?
- What is the rollback story for a schema change here?

## Recording a finding

```text
Persistence      PostgreSQL 16 via Spring Data JPA. Flyway migrations under
                 src/main/resources/db/migration, 41 files, versioned V<n>__.
                 Evidence: pom.xml:88, src/main/resources/db/migration/
                 Observed in inspected modules; production DB version needs runtime evidence.
                 Counter-examples: none found in those modules.

Retries          Not found in src/ and pom.xml after searching retry annotations,
                 client construction and resilience dependencies with rg.
                 Proxy/platform retry policy was not available in this checkout;
                 that remains unknown, not disabled.
```

"Observed" is the label that keeps this report honest. Nothing here is a requirement until the
decision phase establishes it or a cited existing policy/contract already requires it. Record
the policy separately from observed implementation; either may disagree with the other.

## Two traps

**Reading the wrong project.** In a multi-project working directory, confirm the paths you are
citing belong to the project under change. A finding from a sibling repository is worse than no
finding.

**Generalising from the file you happened to open.** One controller using a pattern is one
controller. Count before you claim, and report the count.

## Sources for dependency evidence

- [Maven dependency mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html): mediation, management, inheritance and scopes.
- [Gradle dependency reports](https://docs.gradle.org/current/userguide/viewing_debugging_dependencies.html): resolved configuration graphs and selection reasons; use the project's wrapper version.
