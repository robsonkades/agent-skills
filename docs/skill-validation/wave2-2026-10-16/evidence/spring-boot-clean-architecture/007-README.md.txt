# Clean boundary and composition fixture

Read/run this when checking how plain policy tests, source dependency guards and actual
Spring transaction composition support different claims. It is one small operation,
not a service starter. It has no HTTP server, production authentication, ORM, migration
framework, retry mechanism or broker.

Fixture requirements: a purchase has a positive integer total in USD cents; a trusted
actor with submission entitlement places it for their own customer account; success
requires an order and a local receipt to commit together. The command cannot nominate
an owner. IDs and totals are fixture inputs, not a production pricing/idempotency design.
The receipt table intentionally permits an independent preexisting row so a duplicate
receipt can force a failure after the order insert. This is fault-injection scaffolding,
not a recommended production schema.

## What to inspect

| File                                                                 | Decision illustrated                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `domain/Purchase.java`                                               | Invariant validated by plain construction regardless of entry                                 |
| `application/PlaceOrder.java`                                        | Entitlement, trusted owner, orchestration, inner result and ledger contract                   |
| `outer/JdbcLedger.java`                                              | JDBC implementation of an inner contract, parameterized values, technical failure translation |
| `outer/TransactionalOrders.java` and `outer/OrderConfiguration.java` | Boot-managed entry wraps both writes; raw use case is not a separately injectable bean        |
| `outer/ReceiptViews.java`                                            | Two stateless representation mappings without a callback output port                          |
| `PolicyTest`, `WiringTest`, `BoundaryTest`                           | Pure rules, actual H2 commit/rollback and sensitive bytecode guards                           |

Production paths above are relative to `src/main/java/example/clean/`; test paths are
under `src/test/java/example/clean/`. Nested application records/interfaces keep this
example compact; this is not a mandatory package or naming convention.

The application's storage contract has one unexpected `StorageFailure` category; the
fixture does not claim a public conflict or not-found API. An actual API needing those
outcomes must define and translate them explicitly. Causes remain internal diagnostic
evidence. An actor record is not an authentication mechanism: never deserialize its
entitlement/customer identity from an untrusted request.

## Run a temporary copy

Prerequisites: **JDK 25**, Maven **3.9+**, Boot **4.1.1**, ArchUnit **1.4.1** and
Boot-managed JUnit/H2 dependencies, no preview flags. First execution needs dependency
access or a populated Maven cache. Copy this directory into a disposable directory
before running so build output and generated negative examples are outside the skill.
Do not change the target application's toolchain to run this teaching example.

```text
mvn -B test
mvn -B dependency:tree
```

Maven writes `target/` and its configured local dependency cache. JUnit creates and
cleans temporary compiled violation fixtures. The Boot context uses a unique H2
in-memory database, no listener and no external service; closing the context closes
its pool. No agent configuration is read or written. Do not override the test datasource
with a real database. The test command discovers **12 tests** across three classes:

- `PolicyTest`: 3 plain tests; positive-total/identity invariants, denial with no writes,
  trusted ownership and two representation mappings of one unchanged result.
- `WiringTest`: 5 tests through real Boot/JDBC/H2 composition; both writes commit,
  second-write failure rolls the first back, entitlement denial leaves storage empty,
  a deliberately unwrapped invocation leaves partial state as a sensitivity control,
  and a returned result in a caller transaction is followed by that caller's rollback.
- `BoundaryTest`: 4 tests; expected production classes are selected, domain/application
  dependencies pass, compiled forbidden framework and outer signature types are
  rejected, and an empty application selection fails. Two distinct negative tests
  account for the four-test total.

The tests have no test-managed transaction. Durable-state assertions run after the
effective transaction completes. With no enclosing transaction, the template returns the inner
result after local completion; representation mapping can then occur without holding
the database transaction open. The additional caller-composition test explicitly starts
an outer transaction with the same manager. It receives the wrapper's result, rolls
the outer transaction back, then verifies both writes are absent. Default `REQUIRED`
propagation joins that caller's transaction; a return from the wrapper does not prove
durable completion.

The examples establish behavior for this fixture's H2 engine and trusted caller. They
do not prove PostgreSQL/MySQL semantics, concurrent-order correctness, HTTP serialization,
method-security advice, token validation or production durability. Core tests use a
recording ledger; they cannot prove that JDBC works. Bytecode dependency rules cannot
detect every reflective or configuration coupling. A new production path needs its
actual engine, public contract and relevant authentication/authorization integration.
