# Investigation checklist

Use the concerns relevant to the feature. Distinguish supported findings, "not found in searched
paths", "not examined" and "unavailable"; name meaningful coverage limits without turning a
small change into a whole-repository survey.

## Search population and evidence collection

Before treating a missing match as a finding, establish what was searched. `rg` normally
filters hidden and ignored paths, and repository contents may also depend on sparse checkout,
uninitialized submodules or generated sources. Inspect only the relevant exclusions: for
example, `rg --files --hidden .github` lists files under an existing CI configuration directory.
Inspect the generator declaration or an existing output when a runtime adapter is generated. Record
missing checkout/generated artifacts as coverage gaps rather than declaring the capability absent.
Use targeted paths/options instead of disabling all exclusions across the whole repository.

An existing report also needs provenance: module, profile/configuration, revision and whether
the relevant build inputs have changed since it was produced. A stale report may suggest a lead
without resolving today's dependency version. If a fresh report is needed, inspect the wrapper,
task/plugin and relevant build configuration before execution. Gradle evaluates build scripts
during configuration, even before the selected task runs; dependency reporting can also require
artifact/repository access. Keep command effects within the authorized investigation and report
unavailable evidence without running initialization or deployment merely to make the report complete.

## Ground truth first

| Question                                    | Where to look                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| What builds this, and how is it run         | Build file, wrapper scripts, CI workflow, container definition                          |
| Which build JDK, release target and runtime | Toolchain, compiler release settings, image definition and deployment evidence          |
| Which framework and which version           | Relevant module build, parent/BOM/catalog/constraints, resolved graph and runtime image |
| Which modules exist                         | Directory layout, module or project declarations                                        |
| What the tests are and how they run         | Test directories, the CI job that runs them                                             |

Record compiler/toolchain JDK, language/API target and runtime separately. For example, a JDK 21
toolchain with `--release 17` targets Java 17 language and JDK APIs; it does not establish the
deployed JVM. An image definition establishes configuration, while a claim about production
needs evidence tied to that deployment.

Framework versions can change available APIs and behavior; guidance for one version may not work
on another. Read the version before asserting anything version-sensitive. A dependency declaration
can differ from the selected version/scope; identify the target profile or Gradle configuration.
Maven `dependencyManagement`/BOM entries and Gradle dependency constraints can govern versions
without including the artifact; confirm inclusion in the relevant dependency graph before
reporting it available. Reuse available resolution reports or inspect the project's supported
dependency-report command. If execution needs unavailable artifacts/access, retain that limitation
rather than silently selecting a version.

## Structure and conventions

- How are layers separated, and is the separation enforced by anything?
- Where do business rules live today — entity, service, or spread?
- What are the naming conventions for the kinds of file this feature will add?
- Is there an existing abstraction for the thing the feature needs?
- Is that candidate reachable from the feature's module and runtime configuration, or only from
  tests, an optional profile or a different deployment? Follow a real caller/configuration path.
  Record contract mismatches such as tenant context, resource ownership, synchronous versus
  asynchronous completion or retry/error behavior; the same class name is not reuse evidence.
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

For example, a client in `testImplementation` can establish a test capability without establishing
runtime availability. If the same client is resolved on the target runtime configuration and wired
into a representative production path, it becomes a stronger reuse candidate. Neither finding
authorizes selecting it. If the resolved graph or wiring cannot be inspected, record that precise
gap and the next artifact needed instead of asking the user to restate facts already in source.

When sources conflict, separate questions before closing a `U-*`: a README's intended Java target,
a CI compiler toolchain, its `--release` setting and a deployed JVM are distinct claims. Link the
conflicting facts and preserve their scope. Route an unresolved intended-policy decision to
`feature-decision-analysis`, or a missing feature requirement to `feature-requirement-clarification`,
with the input revision, affected `U-*`, sources and what changes if either answer holds. If those
skills are unavailable, include that same bounded question in the handoff; do not invent a decision.

## Two traps

**Reading the wrong project.** In a multi-project working directory, confirm the paths you are
citing belong to the project under change. A finding from a sibling repository is worse than no
finding.

**Generalising from the file you happened to open.** One controller using a pattern is one
controller. Start with comparable paths and independent contexts, looking for counter-examples
where they could change the finding. Report counts within the inspected sample and name its scope;
enumerate the full population only when the needed claim requires that coverage.

## Sources for build and dependency evidence

- [Maven dependency mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html): mediation, management, inheritance and scopes.
- [Gradle dependency reports](https://docs.gradle.org/current/userguide/viewing_debugging_dependencies.html): resolved configuration graphs and selection reasons; use the project's wrapper version.
- [Gradle Java toolchains](https://docs.gradle.org/current/userguide/toolchains.html): compiler/toolchain selection and the separate `--release` target; inspect task-specific settings.
- [ripgrep filtering](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md#automatic-filtering): hidden and ignored paths affect the searched population.
- [Gradle build lifecycle](https://docs.gradle.org/current/userguide/build_lifecycle_intermediate.html): build scripts are evaluated during configuration before task execution.
