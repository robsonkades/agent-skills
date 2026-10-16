# What each level proves, and what it is blind to

Latency ranges below are illustrative, not measurements or guaranteed ratios. Measure cold
startup, warm tests and whole-suite time separately. Levels overlap: a JPA slice using the
real engine is also an integration test; characterisation describes a purpose, not a scope.
These are capabilities of a test scope, not guarantees from its label. Claims depend on the
actual collaborators, configuration, inputs and assertions exercised.

| Level                                          | Typical latency | Can exercise                                         | Blind to unless included                           |
| ---------------------------------------------- | --------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Unit (no framework)                            | < 10 ms         | Logic, branches, boundary values, error paths        | Runtime wiring, SQL and external behavior          |
| Sociable unit (real collaborators, fake edges) | 10–100 ms       | Logic plus the interaction between owned classes     | Anything crossing a process boundary               |
| Spring slice                                   | 1–5 s           | The slice's own wiring: routing, binding, mapping    | Excluded components; DB unless actually configured |
| Integration (real engine)                      | 2–30 s          | Schema, dialect, transactions, locking, migrations   | Cross-service contracts, production data volume    |
| Contract                                       | < 1 s each side | That two independently deployed sides still agree    | Whether either side's logic is correct             |
| End-to-end                                     | 30 s–minutes    | The parts are wired together and a journey completes | Which part is wrong when it goes red               |
| Characterisation                               | varies          | What the code does _today_, before you change it     | Whether today's behaviour is correct               |

## Unit

Here, a unit test is a test with no external I/O, no uncontrolled clock or random source, and no
framework container. Injected `Clock`, seeded randomness, and deterministic in-memory collaborators
remain compatible with a unit test. This boundary supports fast, repeatable tests; it does not
guarantee them. Shared static state, concurrent work and costly algorithms can still matter.

Prefer a **sociable** unit test when real owned collaborators are deterministic and keep the
failure understandable. Substitute a collaborator when isolating a failure mode or avoiding
unrelated setup earns its cost; ownership alone does not choose the double. An isolated test
can establish the caller's behavior under those assumptions, but not agreement with the real
collaborator. Avoid a mock for every class by default (see java-test-doubles).

Blind to: Hibernate lazy loading, the SQL actually generated, `@Value`
resolution, bean scoping, transaction propagation, and every default the framework applies.
Pure tests with the real serializer can check JSON field names; they do not establish that
the application wires the same serializer configuration.

## Spring slice

`@WebMvcTest` focuses default scanning and auto-configuration on MVC components, including
controllers, resolvers, converters and exception handling. Services and repositories are not
normally discovered, but imports and custom configuration can add real collaborators. Check
what is actually loaded and asserted before claiming request, validation or deeper coverage.

`@DataJpaTest` loads JPA and repositories and normally rolls back each test. Database
replacement depends on the Boot version and configuration: Boot 3.4 defaults to `NON_TEST`,
preserving recognized auto-configured test databases. Inspect the actual connection:

- Inspect the replacement engine, selected from configuration/classpath; it is not always H2.
  If production uses H2, matched H2 tests exercise that engine. H2 compatibility modes cover
  selected behavior of other engines, not full dialect, locking or planner equivalence.
  For those risks, preserve or configure the actual target engine, for example with
  `@AutoConfigureTestDatabase(replace = Replace.NONE)` and Testcontainers when needed.
- Rollback does not prevent flush-time failures: explicitly flush to expose deferred ORM SQL
  and applicable constraints. Commit-time constraints and `AFTER_COMMIT` listeners require
  an actual commit, followed by observation outside that transaction and deliberate cleanup.
  A test-managed transaction can also hide missing application transaction boundaries.

`@SpringBootTest` loads the application context selected by its configuration, not necessarily
a live server or external systems. Context reuse depends on Spring's cache key, process,
eviction and dirty-context invalidation; properties and mocked beans can distinguish keys.
Reuse compatible configurations when useful, while preserving the differences the risk needs.

With `RANDOM_PORT` or `DEFINED_PORT`, an HTTP request to the servlet server runs on a
different thread from the test. The server's transactions do not join the test-managed
transaction: rolling back an `@Transactional` test does not undo committed server writes.
Uncommitted fixture data may therefore be invisible to the request; flushing alone is not
committing. Commit fixtures before requests that need them, observe committed results from
outside the test transaction, and use deliberately committed cleanup or an isolated database
that can be discarded. Cleanup inside the rolled-back test transaction is rolled back too.
This differs from synchronous in-process calls that participate in that transaction; inspect
thread and transaction boundaries before transferring rollback assumptions between scopes.

## Integration against the real engine

Testcontainers with `@ServiceConnection` (Spring Boot 3.1+) starts the real engine and wires
connection details automatically when the required test dependencies and supported container
are configured. Match the deployed engine/version and relevant settings. Targeted tests can
exercise migrations, SQL, constraints and transaction behavior; merely starting a container
establishes none of them. Locking or isolation claims need controlled multiple transactions.

Keep it to the tests whose risk is genuinely in the database. It is not a substitute for unit
tests of the logic that sits above it; broad integration assertions can obscure where a fault
is. Reuse adequate existing coverage and keep new assertions focused on the named risk.

Sharing a container within a test class or an explicitly managed suite can amortize startup;
it does not isolate mutable data. Choose separate databases/schemas or reliable fixture reset
and cleanup for the relevant workers and transaction boundaries. Keep the resource alive for
all its consumers, then clean it up. Check the runner/extension's parallel-execution support
before sharing it across concurrent tests; JUnit's ability to run in parallel does not prove
the container extension supports that lifecycle.

This is distinct from Testcontainers' experimental **Reusable Containers**, which persist
across test executions via `withReuse(true)` and environment opt-in. Its documentation says
it is not suited to CI. Do not introduce that feature as a routine CI speed fix.

## Contract

A contract test checks specified interactions between producer and consumer: request/response
shape, status, headers and modeled states. Consumer-driven tooling needs both consumer tests
and provider verification of the relevant versions; a passing stub alone proves no current
provider agreement. It does not establish general business correctness.

Reach for it when supported consumer/provider versions or independent release schedules make
agreement a distinct risk, even within one team. If both sides always ship together, a focused
integration test may cover the required agreement and behavior more simply. Compare existing
coverage, version combinations and measured maintenance/feedback cost; team ownership alone
does not make integration cheaper or universally stronger.

## End-to-end

Slow, environment-sensitive, and less diagnostic than narrower tests: a red end-to-end test names a
journey, not a cause. Keep the smallest portfolio that covers critical user and operational
journeys. One test may cover a simple journey; multiple cases are justified when materially
different identity, payment, migration, failover, or compatibility paths carry distinct risk.

## Characterisation

A test written to record what existing untested code does now, so that a refactoring can be
detected if it changes anything. Its assertions may encode behaviour that is wrong — that is
the point; it is a safety net, not a specification. The mechanics belong to java-refactoring.

## What a mocked boundary still obliges you to verify

| You mocked         | Something must still prove                           | Where                                               |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| A repository       | The query returns those rows against the real engine | Targeted integration cases                          |
| An HTTP client     | The request and response shapes match the other side | Provider-verified contract or controlled live check |
| A message producer | The payload deserialises on the consumer             | Consumer verification with actual payload           |
| A mapper           | Required fields and transformations are correct      | Expected wire/domain fixtures over real mapper      |
| The clock          | Application selects intended zone/time source        | Wiring check when that selection carries risk       |

Reuse evidence for the same assumption; do not impose one test per mock or assume one case
covers every query. A round trip can preserve a shared encoder/decoder bug; compare against
independently specified fields and values. Recorded stubs only reflect their capture version.

## A selected level must actually execute

Trace the test from source set and discovery to the command used by the intended CI/release gate.
Inspect plugin/task bindings, module selection, profiles, filename patterns, tags, engines,
disabled tests and environmental assumptions. Read per-test reports tied to that run, not only
aggregate success: the intended case may be absent or skipped while unrelated tests pass. Also check
whether failures are ignored, retried away or merely reported without failing the gate.

For Maven with Failsafe bound to `integration-test` and `verify`, `mvn test` stops before those
phases. Invoking only `integration-test` can execute failing cases without failing the build:
Failsafe defers that decision to `verify`, allowing post-test cleanup first. Use the configured
`verify` lifecycle path for that gate and inspect the effective bindings; the plugin's presence
or a class named `*IT` alone does not schedule it. Retain the project's wrapper, versions and
profile choices rather than adopting these names as a universal build recipe.

For Gradle JVM Test Suite builds, declaring an additional suite does not automatically attach
it to `check`; inspect whether CI selects it directly or a task dependency includes it.
`shouldRunAfter` and `mustRunAfter` order already scheduled tasks, not select them. A task-graph
dry run can reveal missing inclusion, but does not execute assertions. Use the project's
wrapper and task paths; do not introduce another suite plugin merely to follow this example.

Inspect task outcomes alongside report provenance. Gradle `UP-TO-DATE` or `FROM-CACHE` may
reuse valid results for unchanged, correctly modeled inputs; neither means tests executed
again. `NO-SOURCE` or `SKIPPED` does not establish a passing test. When the claim needs a new
observation, such as checking a changed external service not modeled as an input or confirming
defect detection, rerun the relevant test task with the option supported by the project's
Gradle version (for example, `--rerun` in 8.14.3). Preserve normal caching for other work;
deleting caches or rerunning every suite is not necessary merely to describe reused evidence.

When selection is wrong, repair that path within the requested scope; do not duplicate the same
test at a broader level to make it visible. A missing environment is an explicit coverage gap,
not a passing integration check. If no-tests failure options are appropriate, scope them to the
suite/module expected to contain tests; aggregator or deliberately test-free modules differ.

## Diagnose instability before changing the level

Preserve the first failing assertion, logs, fixture state, test order/seed, runner settings
and retry history needed to reproduce it. Classify the signal: a business assertion, setup
failure, timeout, skipped case and undiscovered case do not establish the same problem.
With Surefire reruns enabled, a later pass can produce a successful build with a reported
flake, depending on failure policy. Inspect per-attempt results; rerunning is evidence
collection or temporary mitigation, not evidence that the cause was repaired.

Compare the failing case alone with the relevant suite/order, and serial with parallel
execution, changing one condition at a time when practical. Look for shared database rows,
cleanup racing another test, static caches, JVM properties or global locale/time-zone changes.
A failure disappearing under isolation supports a shared-state hypothesis; a few passing
runs do not prove that hypothesis or rule out an application race.

- If tests interfere through fixtures or global test configuration, repair that ownership,
  reset or narrowly synchronize the conflicting tests. Runner-level resource locks coordinate
  cooperating tests, not other JVMs or database clients. Keep legitimate application
  concurrency inside its test; serializing unrelated tests need not remove that exercise.
- If the failure persists with isolated fixtures during concurrent application operations,
  preserve the real concurrency/transaction boundary and route the mechanism investigation to
  `concurrency-testing` or `distributed-systems-testing`. Do not replace that boundary with
  a mock, a sleep, or serial application calls merely to obtain green results.

After a targeted repair, rerun the original failure conditions and intended gate. Report the
observed runs and remaining uncertainty; retries, quarantine or reduced parallelism alone
do not establish restored coverage or a product fix.

## Sources

- [Maven Failsafe lifecycle](https://maven.apache.org/surefire/maven-failsafe-plugin/index.html)
  and [configured executions](https://maven.apache.org/surefire/maven-failsafe-plugin/usage.html):
  execution and failure verification are separate goals; checked 2026-09-27.
- [Surefire discovery filters](https://maven.apache.org/surefire/maven-surefire-plugin/examples/inclusion-exclusion.html)
  and [Failsafe verification options](https://maven.apache.org/surefire/maven-failsafe-plugin/verify-mojo.html):
  inspect the project's configured selection and no-tests/failure policy.
- Gradle 8.14.3 upstream documentation: [JVM test suites](https://github.com/gradle/gradle/blob/v8.14.3/platforms/documentation/docs/src/docs/userguide/platforms/jvm/jvm_test_suite_plugin.adoc),
  [task ordering](https://github.com/gradle/gradle/blob/v8.14.3/platforms/documentation/docs/src/docs/userguide/authoring-builds/tasks/controlling_task_execution.adoc),
  [task outcomes](https://github.com/gradle/gradle/blob/v8.14.3/platforms/documentation/docs/src/docs/userguide/authoring-builds/tasks/more_about_tasks.adoc)
  and [forcing test execution](https://github.com/gradle/gradle/blob/v8.14.3/platforms/documentation/docs/src/docs/userguide/platforms/jvm/java_testing.adoc).
  Check the project's version and convention plugins; the JVM Test Suite API is incubating in this version.
- [Boot 3.4 database replacement API](https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/test/autoconfigure/jdbc/AutoConfigureTestDatabase.html)
  and [replacement modes](https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/test/autoconfigure/jdbc/AutoConfigureTestDatabase.Replace.html).
- [Boot 3.4 application testing](https://docs.spring.io/spring-boot/3.4/reference/testing/spring-boot-applications.html):
  real-server HTTP requests and test methods use separate transactions.
- [Spring 6.2 test transactions](https://docs.spring.io/spring-framework/reference/6.2/testing/testcontext-framework/tx.html):
  rollback, explicit flush and commit. Consult the version matching the project.
- [Boot 3.4 MVC slice API](https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/test/autoconfigure/web/servlet/WebMvcTest.html)
  and [Spring context caching](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html):
  inspect the actual scan/import scope and cache configuration.
- [H2 features and compatibility modes](https://www.h2database.com/html/features.html):
  match the deployed engine rather than assuming a compatibility mode is equivalent.
- [Java SE 25 serialization input specification](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/input.html#the-readobject-method):
  a private `readObject` is a defined callback, illustrating why visibility is not reachability.
- [Pact consumer guidance](https://docs.pact.io/consumer): contract versus functional checks
  and matching only interactions the consumer relies on.
- [Testcontainers JUnit 5 lifecycle](https://java.testcontainers.org/test_framework_integration/junit_5/)
  and [experimental reuse](https://java.testcontainers.org/features/reuse/): distinguish
  shared fixture lifetime from persistence across runs; inspect integration limitations.
- [JUnit 5.12 synchronization](https://docs.junit.org/5.12.0/user-guide/#writing-tests-parallel-execution-synchronization):
  shared JVM resources can cause test interference; coordination requires declared access.
- [Surefire rerun reports](https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html):
  retain failed attempts and inspect the configured flake policy; use the project's plugin version.
