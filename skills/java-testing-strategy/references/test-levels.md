# What each level proves, and what it is blind to

Feedback latency below is order-of-magnitude for a warm JVM on a developer machine. Measure
your own; the numbers matter only as ratios.

| Level                                          | Typical latency | Proves                                               | Blind to                                              |
| ---------------------------------------------- | --------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Unit (no framework)                            | < 10 ms         | Logic, branches, boundary values, error paths        | Wiring, mapping, SQL, serialisation, config, ordering |
| Sociable unit (real collaborators, fake edges) | 10–100 ms       | Logic plus the interaction between owned classes     | Anything crossing a process boundary                  |
| Spring slice                                   | 1–5 s           | The slice's own wiring: routing, binding, mapping    | Everything outside the slice, including the real DB   |
| Integration (real engine)                      | 2–30 s          | Schema, dialect, transactions, locking, migrations   | Cross-service contracts, production data volume       |
| Contract                                       | < 1 s each side | That two independently deployed sides still agree    | Whether either side's logic is correct                |
| End-to-end                                     | 30 s–minutes    | The parts are wired together and a journey completes | Which part is wrong when it goes red                  |
| Characterisation                               | varies          | What the code does _today_, before you change it     | Whether today's behaviour is correct                  |

## Unit

A unit test is a test with no external I/O, no uncontrolled clock or random source, and no
framework container. Injected `Clock`, seeded randomness, and deterministic in-memory collaborators
remain compatible with a unit test.
That definition — not "one class" — is what makes it fast and deterministic.

Prefer a **sociable** unit test: instantiate the real collaborators you own, and substitute
only at the edges you do not own (see java-test-doubles). Isolating every class behind a
mock produces tests that pass individually and a system that does not work, because the only
thing verified is that each class calls the mock the way the test author imagined.

Blind to: Hibernate lazy loading, the SQL actually generated, JSON field names, `@Value`
resolution, bean scoping, transaction propagation, and every default the framework applies.

## Spring slice

`@WebMvcTest` loads controllers, argument resolvers, converters and the exception handling
chain — not services or repositories. It proves request mapping, deserialisation, validation
responses and status codes. It cannot prove anything below the controller.

`@DataJpaTest` loads JPA and repositories, and by default **replaces the configured
DataSource with an in-memory database and rolls back each test**. Both defaults change what
the test proves:

- Replacing the DataSource means you tested H2, not your engine. H2's PostgreSQL or SQL
  Server compatibility mode reproduces neither the dialect nor the locking behaviour nor the
  index planner. Use `@AutoConfigureTestDatabase(replace = Replace.NONE)` with Testcontainers
  when the risk is in the SQL or the schema.
- Rolling back means nothing was committed. Flush-time constraint violations, `AFTER_COMMIT`
  listeners and anything depending on a committed state are invisible.

`@SpringBootTest` loads everything. It proves wiring; it costs a context per distinct
configuration, so vary configuration as little as possible — each distinct set of properties
or mocked beans is a new context that Spring caches separately.

## Integration against the real engine

Testcontainers with `@ServiceConnection` (Spring Boot 3.1+) starts the real engine and wires
the properties automatically. This is the only level that proves migrations apply, that the
dialect generates working SQL, that a unique constraint fires, that an isolation level
behaves as assumed, and that a lock times out rather than deadlocks.

Keep it to the tests whose risk is genuinely in the database. It is not a substitute for unit
tests of the logic that sits above it — a failing assertion here tells you far less about
where the fault is.

## Contract

A contract test proves that a producer and a consumer, deployed independently, still agree on
the message shape. Consumer-driven tooling (Pact, Spring Cloud Contract) generates a
verification the producer's own build runs.

Reach for it when the two sides are released on different schedules by different teams. When
one team owns both sides and releases them together, an integration test is cheaper and
proves more. A contract test proves agreement on shape; it says nothing about whether either
side computes the right answer.

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

| You mocked         | Something must still prove                           | Where                             |
| ------------------ | ---------------------------------------------------- | --------------------------------- |
| A repository       | The query returns those rows against the real engine | One integration test              |
| An HTTP client     | The request and response shapes match the other side | Contract test, or a recorded stub |
| A message producer | The payload deserialises on the consumer             | Contract or round-trip test       |
| A mapper           | Every field is mapped, including new ones            | Round-trip test over the real map |
| The clock          | Nothing — `Clock` is designed to be substituted      | —                                 |

The rule is _once_, not _per test_. One integration test proving the mapping lets fifty unit
tests mock the repository honestly.
