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

A unit test is a test with no external I/O, no uncontrolled clock or random source, and no
framework container. Injected `Clock`, seeded randomness, and deterministic in-memory collaborators
remain compatible with a unit test.
That definition — not "one class" — is what makes it fast and deterministic.

Prefer a **sociable** unit test: instantiate the real collaborators you own, and substitute
only at the edges you do not own (see java-test-doubles). Isolating every class behind a
mock produces tests that pass individually and a system that does not work, because the only
thing verified is that each class calls the mock the way the test author imagined.

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

## Sources

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
