# Spring skills creation — 2026-09-27

Implemented the three packages in the [approved plan](../spring-skills-plan.md), using
the repository's skill-engineering guidance and one specialist reviewer per package.
This is a first release at **1.0.0**; there was no previously published Spring package
to compare with. The plan's decisions and later user additions are the baseline.

The packages are [spring-boot](../../skills/spring-boot/SKILL.md),
[spring-boot-web](../../skills/spring-boot-web/SKILL.md) and
[spring-boot-jpa](../../skills/spring-boot-jpa/SKILL.md). They support implementation,
diagnosis and review according to the request; selecting a skill does not authorize
an upgrade, schema migration, production tuning or implementation during findings-only work.

## Specialist criteria and boundaries

| Responsibility or decision               | Applicability                                         | Required behavior                                                                                                                               | Evidence of success                                                                     | Initial gap                                                                      |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Bean composition and configuration       | Core Boot                                             | Respect project wiring, managed identity, conditional backoff, winning property source and resource ownership                                   | Context identity/close, disabled/custom bean and actual config-data checks              | Plan existed; executable decision guidance did not                               |
| Operational wiring                       | Core Boot; deeper deployment work conditional         | Separate liveness/readiness and exposure/authorization; bound resource lifecycle                                                                | Targeted observations and explicit handoff when runtime evidence is absent              | A copied configuration could hide the actual effective contract                  |
| HTTP behavior and complete documentation | Core Web                                              | Inventory all operations and public properties, including optional/nested/array contracts; distinguish presence, null, validation and direction | Generated default/group documents, HTTP examples/errors and actual UI consumption       | Annotations alone could conceal inference, merge and rendering defects           |
| Standard application errors              | Core Web when such a policy exists                    | Reuse common responses without erasing operation-specific details; runtime policy must agree                                                    | Common response references in each group, safe HTTP errors, preserved headers/overrides | User identified repeated controller errors and incomplete array documentation    |
| Web capacity                             | Conditional on a resource problem                     | Attribute I/O, CPU, queues and downstream capacity before changing Tomcat, virtual threads or pools                                             | Representative measurements; reasoned restraint when unavailable                        | Supplied values were hypotheses, not measured optima                             |
| Entity mapping and equality              | Core JPA when those contracts are changed             | Reconcile all attributes with Java/JDBC/DDL; choose identity strategy from lifecycle and proxy behavior                                         | Optional-value, generated-ID/HashSet, detached/proxy and independent-context checks     | User required complete entity contracts and supplied a concrete equality pattern |
| Fetching, state and transactions         | Core JPA                                              | Preserve cardinality, tenant checks and atomic units; distinguish merge/flush/commit and provider versions                                      | Actual SQL/results, rollback and independent optimistic conflicts                       | Generic fetch/lock/read-only advice can preserve neither results nor consistency |
| Real database specifics                  | Conditional and essential to database-specific claims | Verify actual dialect, driver, schema, collation, sequence writers and locks                                                                    | Disposable production-family database probes                                            | Real database runtime was unavailable here                                       |

WebFlux, Boot 3 migration, identity-provider implementation, deep database plan tuning,
native images and durable distributed delivery are outside these packages' core.
Optional handoffs state their trigger, input, expected result and fallback. Advanced
OpenAPI features remain conditional on an actual API contract, rather than requiring
unused endpoints or invented constraints. No neighboring skill was changed.

## Implemented decisions and concrete corrections

| Decision or failure mode                             | Before this implementation                                                   | Implemented guidance or correction                                                                                               | Supporting evidence                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disable configuration proxies                        | Plan requested contextual choice                                             | Keep interception for direct bean calls or refactor to parameter injection; verify identity and close                            | Boot fixture includes the deliberately broken direct-call case and working alternatives                                                                             |
| Infer documentation quality from annotations         | No generated fixture existed                                                 | Inspect generator output, examples, actual HTTP and UI independently                                                             | Real generation exposed a missing error example, impossible null/object intersection, string-typed numeric parameter and misleading shared error examples           |
| Optional lists and common errors                     | User identified incomplete `violations` documentation and repeated responses | Array/item contracts with genuine cardinality, and shared application response components preserving operation overrides         | Expanded Web checks target body/method validation, collection shape and global responses                                                                            |
| String length means the same thing everywhere        | Initial fixture used Jakarta `@Size` and Java `String.length()`              | Explicit Unicode code-point contract in the HTTP fixture and matching schema                                                     | Actual HTTP accepted 40 emoji in title but rejected 41 although both were schema-valid; analogous 100/101 description mismatch reproduced                           |
| Collection fetch always pages in memory              | Older-provider rule was a plausible initial assumption                       | Inspect exact provider/dialect; Hibernate 7.4 SQL rewriting is a legitimate candidate                                            | Pinned Hibernate primary sources and two-page H2 SQL/result assertions                                                                                              |
| Generated-ID equality is always safe or always loads | User supplied effective-class/non-null-ID/class-hash pattern                 | Preserve its stable hash and transient distinction; verify actual proxy configuration, lifecycle and inheritance limits          | Tests exercise ID assignment, detached instances and open/closed proxies; an initial expected detached-proxy failure was falsified and corrected from pinned source |
| SQL settings are universal performance fixes         | User YAML supplied concrete pool, Unicode, sequence and session values       | Treat values as hypotheses; verify autocommit prerequisite, global connection budget, encoded values and allocator/DDL agreement | Primary driver/provider contracts; explicitly unexecuted real-database probes                                                                                       |

Useful planned capabilities remain: constructor/parameter injection without new
`@Autowired`, `@Bean` and stereotypes according to project conventions, both configuration
proxy choices, Tomcat and virtual-thread decisions, detailed springdoc features, entity
references, sequence allocation, typed mappings, transaction scope, auditing and JDBC
alternatives. No existing published capability was removed. Contradictory generated
examples and unsupported universal interpretations were replaced with verified conditions.

## Validation levels

The exact fixture baseline is Boot **4.1.1**, Framework **7.0.9**, Hibernate
**7.4.5.Final**, Tomcat **11.0.24**, Hikari **7.0.2**, Jackson **3.1.5**,
springdoc **3.1.1**, Swagger Core **2.2.55**, Swagger UI **5.32.14**, and H2 **2.4.240**.
The final required baseline is Java **25**, compiled by Maven **3.9.15** and executed
on Temurin **25.0.3**. Initial development runs used release 21; the user subsequently
required release 25 for all three packages, with final reruns recorded below.
Dependencies/build outputs were isolated in temporary directories. Source-only manifest
allowlists exclude build artifacts; separately observed IDE output was moved out of the
new package without changing real IDE or agent configuration.

Executed final checks:

- Clean Maven runs on **Java 25**: Boot **12**, Web **12**, JPA **10** tests;
  **34 total, zero failures, errors or skips**. Web's clean package run also produced the
  runnable archive. Compilation logs confirmed release 25 for main and test sources.
- Strict package validation passed for all three packages. Their **27 local Markdown
  links** resolved; manifests and descriptions match. The packages ship **51 source/doc
  files**, excluding all generated outputs.
- Independent Ajv **8.20.0** / ajv-formats **3.0.1** checks, with formats enabled and no
  coercion: each default/catalog document passed **78 data/example checks and 25 semantic
  checks**, plus 142 schema-compilation operations including reuse. These are JSON Schema
  2020-12 checks, **not a complete OpenAPI document validator**.
- **14 Unicode HTTP/schema boundary cases** agreed after the correction.
- Actual Swagger UI on isolated Edge **153.0.4234.48**: five operations rendered,
  minimum/complete example selection, POST **201** with Location, and GET **200** containing
  the created record. Error examples 400/406/409/415/500 displayed correct status; shared
  500 appeared on all five operations. No console/runtime/network errors were captured.
  The default document was also rendered using an explicitly alternate browser-only
  initializer; the application's configured dropdown contains the catalog group.
- `npm run registry:build` passed with **283 skills**. Comparison with the committed index
  found exactly the three additions and **no changes to the 280 existing entries**.
- `npm run verify` passed: build, architecture boundaries, lint, formatting, registry,
  version checks and **355 tests in 67 suites, zero failures, cancellations or skips**.
  A final scoped formatting check covers the result-record updates after that run.

The temporary application and browser were stopped. The
[machine-readable record](spring-skills-2026-09-27.json) retains exact agent prompts,
criteria, observations, source hashes and limitations, separating runtime checks from
behavioral evaluations.

Six independent output-only agent cases ran: three with an explicitly loaded frozen skill
and three without it. **All three control and all three skill-loaded responses met their
decision criteria. No measured improvement over the controls is established.** The pairs
discriminated configuration interception, OR/AND API security and to-one/to-many fetching.
The exact Hibernate 7.4 finding from a control informed development, so this is development
and regression evidence, not a held-out causal experiment. Tool trajectories differed;
there was one response per condition and no automatic activation test. Shared-filesystem
resource boundaries were procedural, not enforced sandboxes.

The frozen treatment snapshots precede the later entity/equality, standard-error/array
and Java 25 additions. Those receive separate runtime checks and structured review. Structured
walkthroughs also cover CPU versus I/O workloads, Boot 3 refusal without migration authority,
durable-event handoff, findings-only scope and unavailable database evidence. A walkthrough
does not demonstrate runtime behavior or an accuracy percentage.

## Limits, provenance and preservation

- The final target is Java 25. Earlier output-only prompts and development runs predate
  that user decision; they do not establish compatibility with a different Java baseline.
- Docker's daemon was unavailable. SQL Server/PostgreSQL mapping, sequence concurrency,
  pessimistic timeout and Unicode round-trips remain unexecuted; the package supplies
  scoped prerequisites/probes. No existing or production database was accessed.
- H2 tests do not establish SQL Server pagination, locking or production isolation.
  No load benchmark, production ingress, native image or Gradle fixture was executed.
- The public in-memory HTTP fixture does not implement authentication, multipart,
  polymorphism, callbacks/webhooks, XML, streaming or generated clients. Guidance covers
  applicable choices; no runtime claim is made for absent families or universal 100% coverage.
- The external piomin package was examined at commit
  `d87e7a38588a0a945ae2c11a251954897692330e`. Its Boot 3 examples informed the plan;
  they were not transplanted as Boot 4 authority. Decision-local primary sources are
  linked in the skills and plan.
- `docs/agent-harness-optimization-plan.md` is unrelated user work and remains unchanged.
  The pre-existing incomplete `SKILLS.md` dictionary was not broadly repaired; the generated
  registry is the integration target for this creation task.

Final source-hash and link checks found no drift across the 51 package files, no broken
local references and no generated target directories. The unrelated user document's
SHA-256 remained identical to the initial snapshot.

Changed paths are the three new skill packages, `docs/spring-skills-plan.md`, this report
and its JSON evidence record, and the generated `registry/skills.yaml`. Creation and
validation did not commit, push, tag, publish, install globally or change real agent
configuration. The user subsequently authorized commit, push and a release tag; that
separate release uses the workspace versioning and changelog conventions.
