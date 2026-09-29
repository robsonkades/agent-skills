# Spring focus areas 1–6 — implementation and validation

Date: 2026-09-28. Status: implemented and locally validated.

The requested six areas are delivered as four new skills and two additive updates.
Each owns its Spring integration boundary and hands generic policy decisions to
existing specialists. The preceding Boot/web/JPA review and unrelated user work
were preserved. No commit, publication, global installation or real agent
configuration change was made.

| Focus                   | Package                                                                                      | Version       | Executed fixture coverage                       |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| Outbound HTTP           | [spring-http-clients](../../skills/spring-http-clients/SKILL.md)                             | New 1.0.0     | 7 JUnit tests                                   |
| API security            | [spring-security-for-apis](../../skills/spring-security-for-apis/SKILL.md)                   | 1.0.1 → 1.1.0 | 29 preserved + 41 new standalone contract cases |
| Boot testing            | [spring-boot-testing](../../skills/spring-boot-testing/SKILL.md)                             | New 1.0.0     | 8 JUnit tests                                   |
| Transactions and events | [spring-transactions-and-events](../../skills/spring-transactions-and-events/SKILL.md)       | New 1.0.0     | 8 JUnit tests                                   |
| Observability           | [spring-boot-observability](../../skills/spring-boot-observability/SKILL.md)                 | New 1.0.0     | 6 JUnit tests                                   |
| Database migrations     | [online-database-schema-migrations](../../skills/online-database-schema-migrations/SKILL.md) | 1.0.0 → 1.1.0 | 13 parameterized JUnit cases                    |

## Delivered behavior and evidence

**HTTP:** Boot-managed builders, transport selection, HTTP interface wiring,
response bounds and resource ownership, and explicit handling of an ambiguous
remote mutation outcome. A timeout after a charge is accepted cannot justify
blind dispatch with a fresh idempotency key. Loopback checks exercise the JDK
imperative client and interface proxy. WebClient guidance is source-backed but
was not runtime-tested.

**Security:** real loopback JWKS rotation/cache/outage paths, real opaque-token
introspection, malformed claims, bounded remote reads, and proxied owner/tenant
authorization before effects. The companion fixture distinguishes invalid-token
401, authorization 403 and its explicitly chosen sanitized backend-failure 503
policy. The original fixture is byte-identical to the task baseline.
Four compiled mutations were detected at their intended assertions: missing
timeout, removed ownership guard, omitted introspection audience check and
permissive role-prefix mapping.

**Testing:** focused MVC, persistence and real HTTP checks; committed setup and
cleanup; independent database observations; and TestContext/service lifetime.
A static audit found that callback counts before and after transaction completion
also pass with a BEFORE_COMMIT listener. The corrected observer reads committed
data through an independent physical READ_COMMITTED connection inside the
callback. Eight normal tests pass. Changing only AFTER_COMMIT to BEFORE_COMMIT in
an isolated copy produces one expected assertion failure, with no cleanup error.
For an update to an existing row, observe the changed value/version rather than
mere row existence.

**Transactions/events:** effective proxy boundaries, self-invocation,
checked-exception rollback rules, rollback-only propagation, and transactional
event phases. A persistent Modulith JDBC publication registry survives an injected
listener failure and orderly context/pool closure; the same H2 file is reopened,
the publication is explicitly resubmitted, and duplicate business-event handling
permits one local transition. This does not demonstrate process-kill durability
or exactly-once remote fulfillment.

**Observability:** actual Boot HTTP/async/managed-client parentage, bounded metric
dimensions, exclusion of secrets, restoration on reused workers, authenticated
management access and probe state. A static audit identified a race between HTTP
response receipt and server observation completion. The final test waits at most
five seconds for exactly 12 completed observations per route before checking
dimensions. Six tests pass with counts and secret assertions preserved.
Evidence uses local meters and in-memory spans.

**Migrations:** one schema owner, runner datasource/credentials, migration-before-JPA
ordering, repeat startup, committed old/new application access, checksum integrity
and externally prepared schema. Password-protected H2 probes and pinned Boot
4.1.1 source establish a consequential qualification: the tested explicit migration
URL path does not inherit application credentials. Both runners pass when their
URL, username and password are explicit. This is scoped to the tested path and
version, not a universal statement about every datasource or ConnectionDetails
configuration. See the pinned
[Flyway configuration](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-flyway/src/main/java/org/springframework/boot/flyway/autoconfigure/FlywayAutoConfiguration.java)
and
[Liquibase configuration](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-liquibase/src/main/java/org/springframework/boot/liquibase/autoconfigure/LiquibaseAutoConfiguration.java).

## Validation

The final Java suites executed **42 JUnit tests and 70 standalone security
contract cases**, with no failures, errors or skips. The coordinator independently
read Surefire XML and security logs. Five targeted controlled mutations failed
their intended assertions; this is not a comprehensive mutation-testing score.

New Boot fixtures use Temurin 25.0.3, Maven 3.9.15, Boot 4.1.1 and Framework 7.0.9.
The security examples preserve Java 17 source, Security 7.1.0 and Framework 7.0.8;
they compiled with release 17 and ran on Java 25. Java 17 runtime was not executed.
Additional resolved versions and per-suite results are in the
[machine-readable record](spring-six-focus-2026-09-28.json) and fixture references.

Both opt-in PostgreSQL profiles compiled. Each attempted runtime execution
failed during setup because no valid Docker environment was available:
**two setup failures, zero PostgreSQL scenarios executed**. Testing's final
corrected sources were recompiled without retrying Docker. No daemon repair,
service start or engine substitution was attempted.

The coordinator ran the following after all skill owners stopped writing:

- Strict isolated CLI validation for all six packages: no issues.
- Creator quick validation for all four new skills: passed using isolated uv/PyYAML.
- Package source/link audit: 78 files, 44 local Markdown links, no broken link or snapshot drift.
- `npm run registry:build`: 287 skills, up from the task-start 283; exactly four additions
  and two updates, 281 existing entries unchanged, no removals.
- `npm run verify`: passed build, boundaries, lint, formatting, registry consistency,
  version checks and **355 tests in 67 suites**, with zero failures, cancellations or skips.

The global run completed before these two evidence report files were added.
Only scoped report formatting and final source/preservation checks followed.
All Java builds used disposable fixture copies and caches. No target directory
was introduced into any of these six packages.

Illustrative reproduction commands, run against disposable copies and an owned
Maven cache, are:

```text
mvn -B -ntp -f <copied-fixture>/pom.xml -Dmaven.repo.local=<owned-cache> test
mvn -B -ntp -f <copied-testing-fixture>/pom.xml -Dmaven.repo.local=<owned-cache> verify
mvn -B -ntp -f <copied-testing-fixture>/pom.xml -Dmaven.repo.local=<owned-cache> -Ppostgres-it verify
mvn -B -ntp -f <copied-migration-fixture>/pom.xml -Dmaven.repo.local=<owned-cache> -Ppostgresql-it verify
javac --release 17 -cp <fixture-classpath> -d <owned-output> SecurityContractCheck.java RemoteSecurityContractCheck.java
java -cp <owned-output-and-fixture-classpath> SecurityContractCheck
java -cp <owned-output-and-fixture-classpath> RemoteSecurityContractCheck
```

Use each fixture's prerequisites and exact classpath instructions. Integration
commands require a working container runtime and may retrieve the declared images.

## Behavioral evaluation

Six realistic requests and four criteria per request were frozen before actor
runs. Fresh actors used the same inherited model/reasoning settings with no
override and no conversation fork. Both conditions could consult official
external documentation. Actors produced bounded review/implementation/test
proposals; they did not implement or test applications.

| Case                          | Without skill                              | Original skill      | Final revised skill |
| ----------------------------- | ------------------------------------------ | ------------------- | ------------------- |
| HTTP ambiguous write          | 4 criteria met                             | Not applicable      | 4 criteria met      |
| Security rotation/tenancy     | 3 met; typed claim handling partial        | 4 met               | 4 met               |
| Test/server commit boundaries | 4 met                                      | Not applicable      | 4 met               |
| Durable transaction events    | 4 met                                      | Not applicable      | 4 met               |
| Async observability context   | 4 met                                      | Not applicable      | 4 met               |
| Boot migration bootstrap      | 3 met; credential-path explanation partial | 3 met; same partial | 4 met               |

There were **14 final compared responses**, one additional completed testing
response before the phase correction, and one interrupted observability run that
was replaced after its fixture correction. The pre-correction testing response
repeated the insufficient phase-evidence claim; it remains recorded. A fresh final
actor explicitly required observing committed updated state inside the synchronous
callback and a BEFORE_COMMIT mutation.

The migration response grades initially accepted the credential explanation.
Pinned source and runtime authentication probes contradicted that explanation, so
criterion 1 was changed to partial for the without-skill and original-skill
responses. Their proposed explicit credentials remained correct. The JSON retains
the grading history and rationale rather than hiding the correction.

Most without-skill responses already met all criteria. These known scenarios,
single runs and non-blinded coordinator grades do not establish statistical
improvement or broad superiority. Shared filesystem isolation was procedural,
not enforced. Automatic client activation was not exercised.

Final skill hashes are archived in the JSON. Observability's actor saw the final
executable fixture; subsequently one optional SLO evaluation case moved from a
table to adjacent prose to satisfy registry routing rules, preserving its meaning.
The evaluated and final hash inventories remain separately available in TEMP.

## Preservation and evidence limits

The task-start source inventory contained 1,335 files. Hash comparison found
only the eight intended existing skill-file changes plus generated registry
changes, with no missing or unexpectedly changed baseline file. New package and
report files are additive. The previous Boot/web/JPA work, previous reports and
`docs/agent-harness-optimization-plan.md` were preserved.

Evidence root:

```text
C:/Users/robso/AppData/Local/Temp/spring-six-8b5537e48d8746369e5455f4a187f700
```

HTTP runtime evidence is separately located at:

```text
C:/Users/robso/AppData/Local/Temp/spring-http-clients-23c262821d3d4c4eaa11fe4895ecc229
```

The JSON records prompts, criteria, assessments, paths, final source hashes,
ownership, checks and limitations. Complete logs, original/final snapshots and
actor responses remain in those local temporary directories; they are not
archived as repository artifacts.

Remaining runtime scope includes PostgreSQL, other HTTP transports/TLS/load,
production telemetry ingestion, security cache TTL/discovery and aggregate
attacks, process-kill/replica event recovery, and Java 17 execution. None is
represented as passing evidence. The fixtures demonstrate their stated local
contracts, not a production rollout certification.
