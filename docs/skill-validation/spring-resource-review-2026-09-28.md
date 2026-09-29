# Spring resource review — 2026-09-28

This review replaces the earlier example-heavy approach in eight Spring skills and the
Spring Boot integration of `online-database-schema-migrations`. The scope is the nine
packages below. Generic architecture, database and invoice overlays were not revised.

The governing references were the repository's `skill-engineering` skill and the user's
specialist-review rubric. One reviewer owned each package. Each inspected the complete
package and froze a domain matrix, resource dispositions and evaluation criteria before
editing. The coordinator preserved task-start snapshots, ran separate actor comparisons
and owns the registry and global checks.

## Criteria and consequential decisions

An example earns its place by exposing an actual consumption contract or a failure that
ordinary code inspection misses. Boot-managed configuration, repositories, test slices
and supported customizers are the simple baseline. Custom infrastructure requires a
constraint that those facilities do not satisfy. Fewer files or more passing tests alone
are not evidence of better specialist judgment.

| Package                                                                                      | Previous friction                                                                                                       | Revised decision and preserved capability                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [spring-boot](../../skills/spring-boot/SKILL.md)                                             | Fake delivery client/dispatcher, context launcher and scheduler probe presented as a general example.                   | Ordinary application wiring stays ordinary; starter override rules apply to library consumers. Default-only versus shared property validation, bean identity, close ownership and scheduling semantics remain actionable. A Boot scheduler builder replaces manual configuration. |
| [spring-boot-jpa](../../skills/spring-boot-jpa/SKILL.md)                                     | Artificial failure/lock methods, provider equality and duplicate Outbox dialect assets.                                 | Keep the Inventory use case with managed updates, `@Version`, `JpaRepository` and a consumed `@EntityGraph`. Equality, auditing, dialect binding, pagination and locking are conditional references with their own evidence requirements.                                         |
| [spring-boot-web](../../skills/spring-boot-web/SKILL.md)                                     | Synthetic issuer/security suite, generic Jackson path walker and an arbitrary byte buffer around a public HTTP example. | Keep executable PATCH, validation, Unicode and generated OpenAPI contracts. Use Boot parser settings. Exact raw-body caps and renamed public fields require separate, explicitly justified mechanisms; parser limits do not establish a byte ceiling.                             |
| [spring-boot-testing](../../skills/spring-boot-testing/SKILL.md)                             | Fake interfaces/counters and manual event, container, context-cache and live-server probes.                             | Concrete-service `@MockitoBean`, repository `@DataJpaTest`, flush/clear and a separate committed-state test. Actual callback phase and container/context ownership remain conditional guidance for the real application.                                                          |
| [spring-boot-observability](../../skills/spring-boot-observability/SKILL.md)                 | Manual application startup, duplicate business observation and unrelated authentication/health policy.                  | An optional native Boot HTTP → async → managed-client probe retains exact parentage, error, label and worker-cleanup checks. Required custom executors and management policy stay project-specific.                                                                               |
| [spring-http-clients](../../skills/spring-http-clients/SKILL.md)                             | Generic client, manual proxy, loopback server and close tracker dominated the example.                                  | Small `@HttpExchange`/`@ImportHttpServices` example and group properties; preserve an adequate existing client. Bounded streaming, response ownership, transport timeouts and ambiguous writes remain conditional obligations.                                                    |
| [spring-security-for-apis](../../skills/spring-security-for-apis/SKILL.md)                   | Two large standalone probes bundled identity-provider, chain and tenant policy scaffolding.                             | Focused Boot properties and application `SecurityFilterChain`; real-project test selection. Preserve decoder trust, browser credentials/CSRF, chain fallthrough, tenant ownership, malformed claims, cache and outage semantics.                                                  |
| [spring-transactions-and-events](../../skills/spring-transactions-and-events/SKILL.md)       | Artificial ledger mixed ordinary callbacks with mandatory Modulith/file-H2/async setup.                                 | Small local after-commit examples; use existing durable publication only when required. Preserve proxy/rollback behavior, phase discrimination, recovery and the remote-success/completion-marker gap.                                                                            |
| [online-database-schema-migrations](../../skills/online-database-schema-migrations/SKILL.md) | A 27-file demonstration duplicated applications, entities, runners and PostgreSQL rehearsal helpers.                    | One actual project migration and ordinary Boot configuration, with checks selected by rollout risk. Preserve credential selection, initializer ordering, immutable history and old/new writer compatibility. Generic `worked-rollout.md` is byte-identical.                       |

Standalone projects were removed from composition, HTTP clients, security, events and
migrations. This deliberately removes their bundled runtime coverage; conditional guidance
and target-project verification remain. It does not claim those removed suites still run.
JPA, web, testing and observability retain runnable examples because their remaining
behavior can be observed directly and their setup now uses normal Spring facilities.

The user-requested [Spring Boot](https://docs.spring.io/spring-boot/),
[Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html) and
[Spring Security](https://docs.spring.io/spring-security/reference/) documentation are
primary sources, selected by the task and resolved project version. They are routed in
the revised packages rather than imposed as unrelated reading. Exact tagged sources
qualify implementation-specific claims. The authored Boot examples remain Java 25 /
Boot 4.1.1; security Java snippets retain Java 17 source compatibility / Security 7.1.0.
Neither baseline authorizes upgrading a consuming project.

## Executed technical checks

All execution used isolated temporary copies and caches. Repository assets and real agent
configuration were not build/install targets.

| Check                            | Observed result                                                                            | Practical limit                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Retained JPA example             | 7 JUnit tests passed                                                                       | H2 only; no PostgreSQL/SQL Server locking or dialect execution.                                       |
| Retained web example             | 13 JUnit tests passed against a real Servlet server and generated documents                | No browser, exact application byte cap or protected-route execution claim.                            |
| Retained testing example         | 6 JUnit tests passed                                                                       | MVC slice, mapping/rollback and committed-state checks; no live HTTP/container/listener-phase suite.  |
| Retained observability probe     | 2 JUnit tests passed                                                                       | Local spans/meters; no backend ingestion or production overhead measurement.                          |
| Boot builder reference           | 2 temporary JUnit tests passed                                                             | Builder properties/customizer/lifecycle; no production scheduling workload.                           |
| HTTP service reference           | 2 temporary JUnit tests passed                                                             | Native registration/customizer/JSON/404 with mock server; no transport behavior claim.                |
| Event references                 | 7 temporary JUnit tests passed                                                             | Actual Spring proxy/listener/transaction behavior on H2; no durable crash recovery claim.             |
| Security references              | 13 focused positive/hostile cases passed; three Java snippets compiled with `--release 17` | Temurin 25 runtime, Framework test infrastructure; no Boot property-binding or Java 17 runtime claim. |
| Additional conditional fragments | Three JPA and two testing fragments compiled                                               | Compilation establishes API/source compatibility only.                                                |
| Migration reference              | Two YAML fragments parsed; official pinned initialization sources inspected                | No Java suite remains; SQL fragments are adaptation guidance, not an executed rollout.                |

Six isolated mutations were detected: missing JPA expected-version check, missing JPA
service transaction, an outer test transaction, disabled trace propagation, permissive
security fallthrough and `BEFORE_COMMIT` instead of `AFTER_COMMIT`. Five produced intended
assertion failures. Removing the JPA transaction produced `LazyInitializationException`,
recorded as a test error rather than relabeled as an assertion result.

The security bean-name collision, observability tracing-test dependency omission and
scheduler test's confusion between live workers and configured core size were caught
during local validation and corrected. Failure logs remain with the successful reruns.

All nine local package/metadata checks, scoped formatting and resource-link checks passed.
The coordinator regenerated the index after every owner stopped writing: **287 skills**.

`npm run verify` passed: build, architecture boundaries, lint, formatting, registry
consistency, version policy and **355 tests in 67 suites; zero failures or skips**.
This is repository validation, separate from the Java checks above. Final evidence-only
report updates were checked again for formatting, JSON validity and diff hygiene.

## Independent agent evaluation

Nine novel coordinator cases were frozen before actor execution. Each contains similar
variants where a decisive requirement changes the recommendation, plus uncertainty or a
boundary condition. Inputs and rubrics are in the companion JSON. Reviewers' own cases
were separately frozen before their edits and assessed as structured walkthroughs.

Original and revised actors received the same request and normal package resources from
separate snapshots. They inherited the same model/settings without overrides, used fresh
contexts and could consult official documentation. Three cases additionally ran without
a skill. The coordinator's rubric was hidden from actors; graders received unchanged
criteria and the resulting responses. Outputs were bounded recommendation tasks, not
application implementation or automatic skill-activation tests.

The initial 21 responses met the substantive domain criteria. Original and revised web
responses each received a partial result for omitting an explicit WebFlux specialist
handoff, despite correctly rejecting Servlet mechanics. The final web instructions now
give the specialist route, required context and official-documentation fallback. One focused
repeat preserved all substantive choices but again omitted an explicit handoff or statement
that no specialist was available: criteria 1–3 passed, criterion 4 remains partial. This is a
known actor-compliance limitation despite the now-explicit instruction, not a claimed fix in
measured behavior; no material technical regression was found. The HTTP no-skill control had an overgeneralized response-close sentence,
but its recommended ownership paths were safe. Its qualification is recorded in the grades.
No general original/revised or skill/no-skill improvement was demonstrated by this sample.
The 22 outputs, including this focused repeat, and the original grades are retained unchanged.

These are single, openly labeled, procedurally separated comparisons. There was no
enforced filesystem sandbox, blinding or statistical replication, and external tool
availability was not deterministic. They cannot establish a general quality percentage
or the causal benefit of every edit.

## Versions, preservation and limits

Existing unpublished bumps were reused against the committed index: Boot/web 1.1.0,
JPA 1.1.2, security 1.1.0 and migrations 1.1.1. The four previously untracked new packages
retain 1.0.0. No published version was overwritten.

The coordinator compared the 1,444 recorded baseline files and found no out-of-scope
changes. All final skill hashes match their frozen snapshots. Only the nine selected
registry entries changed. Two pre-existing ignored orchestration documents were omitted
by the initial file enumeration; their baseline hashes are unavailable and no byte-for-byte
preservation claim is made for them. The unrelated user plan, earlier reports and generic
migration rollout reference retain their recorded hashes.

Historical reports `spring-skills-review-2026-09-28.*` and
`spring-six-focus-2026-09-28.*` remain unchanged. Their test counts describe earlier
revisions and are not current evidence. No application project, production workload,
real PostgreSQL/SQL Server instance or crash-recovery environment was supplied for this
review. No commit, publication, global installation or agent configuration change occurred.

Exact changed files, per-resource reasons, frozen cases, grades and evidence paths are in
[spring-resource-review-2026-09-28.json](spring-resource-review-2026-09-28.json). Raw snapshots,
actor outputs, local compilation/test/mutation logs and owner preflights are retained at:

`C:/Users/robso/AppData/Local/Temp/spring-catalog-review-803f9c483dd0425892c481e10056dc07`
