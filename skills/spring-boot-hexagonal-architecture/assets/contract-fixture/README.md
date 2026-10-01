# Hexagonal application and adapter contract fixture

Use this fixture to trace one operation across application-owned ports, two driving
adapters and a real JDBC adapter. It creates an order and an audit row in one local
transaction. It is a contract example with seven production source files, not a
service starter or an authentication implementation.

The supplied business contract is deliberately small: an authenticated customer can
create an order only for that same customer, and quantity must be between 1 and 10.
Order IDs are globally unique. Reusing an ID is a conflict, even with the same
payload; this example does not implement idempotency or reconciliation.

## Responsibilities and execution

| File                           | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `domain/Order.java`            | Valid construction, including the quantity invariant           |
| `application/Orders.java`      | Input port and plain Java actor/command types                  |
| `application/CreateOrder.java` | Authorization and ordering of the two writes                   |
| `application/OrderStore.java`  | Output port with explicit absence and failure categories       |
| `adapter/HttpOrders.java`      | Principal/request mapping and HTTP status/body representations |
| `adapter/JdbcOrders.java`      | SQL mapping and infrastructure exception translation           |
| `FixtureApplication.java`      | Boot composition and the transaction-decorated input port      |

The HTTP adapter and `IntegrationTest.DirectDriver` both receive the composed `Orders`
bean. The latter is a controlled second driving adapter representing an internal
caller with trusted identity. Neither path obtains the undecorated `CreateOrder` as
a bean. Both execute:

```text
driving adapter -> transaction decorator -> CreateOrder -> OrderStore -> JdbcOrders
                                             |
                                             +-> Order invariant
```

These are runtime calls. Source dependencies point from adapters/composition to the
application contracts; application/domain code imports only Java and its own core.
`CreateOrder` calls the output interface without naming `JdbcOrders`.

The composition root uses Spring's
[`TransactionTemplate`](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html)
around the complete use case. Spring-specific transaction code therefore stays
outside this fixture's plain Java core. The JDBC methods participate in that local
transaction; callers that bypass the composition have no atomicity guarantee.
This is a deliberate implementation choice for this example, not a requirement to
replace a working project transaction boundary.

## Observable contracts

The table assumes an entry with no existing transaction. The template's default
[`REQUIRED` propagation](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/transaction/support/DefaultTransactionDefinition.html)
joins an existing caller transaction when present. In that case, the returned order
is provisional: the outer owner still controls commit, rollback and completion-error
mapping. It must finish that transaction before acknowledging final success.

| Outcome                                | Core/port behavior                                | HTTP behavior            |
| -------------------------------------- | ------------------------------------------------- | ------------------------ |
| Valid creation                         | Return an immutable `Order`; both writes commit   | 201 with ID and quantity |
| Another customer's identity            | `Orders.Forbidden` before either write            | 403                      |
| Invalid quantity                       | `Order.InvalidOrder` before either write          | 400                      |
| Existing order ID                      | `DuplicateOrder`, preserving the original row     | 409                      |
| Storage operation or transaction fails | `StorageFailure`, retaining the diagnostic cause  | 500 with safe detail     |
| Missing stored ID                      | `Optional.empty()` from the internal storage read | No public read endpoint  |

The storage read is not an authorized customer-facing query; exposing it requires
a use case with its own access contract. Only the order table's ID is unique, so its
duplicate-key exception has a precise mapping. An audit-table uniqueness failure
stays a `StorageFailure`; it is not mislabeled as an existing order.

`StorageFailure` includes defects such as invalid SQL and failures at transaction
acquisition/commit. It does not assert a temporary outage or authorize a retry.
Completion can be unknown at a transaction/commit boundary. Tests below demonstrate
rollback for a failure before local commit; they do not reproduce uncertain commit
acknowledgements, reconcile them or establish distributed delivery semantics.

## Run in a disposable copy

Baseline: Java 25, Spring Boot **4.1.1**, Maven **3.9.x**, no preview features.
The verified environment used Temurin **25.0.3** and Maven **3.9.15**. The effective
dependencies were Spring Framework **7.0.9**, H2 **2.4.240**, HikariCP **7.0.2**,
Jackson databind **3.1.5**, JUnit Jupiter **6.0.3** and ArchUnit **1.5.0**.
Boot manages dependency versions except the explicitly pinned ArchUnit version.

From the repository root in PowerShell:

```powershell
$fixtureSource = (Resolve-Path 'skills/spring-boot-hexagonal-architecture/assets/contract-fixture').Path
$fixtureSandbox = Join-Path ([IO.Path]::GetTempPath()) ('hexagonal-fixture-' + [guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $fixtureSource -Destination $fixtureSandbox -Recurse
mvn -B -f (Join-Path $fixtureSandbox 'pom.xml') clean test dependency:tree
```

Alternatively, copy this directory to any disposable location, change into that
copy and run `mvn -B clean test dependency:tree`. First use may download dependencies
to the configured Maven cache. Maven writes compiled output and reports under the
copy's `target/`; keep them outside the distributed skill. There is no agent
installation, global configuration edit or externally listening server in these
tests. H2 is a process-local, in-memory test dependency.

For focused checks within the copy:

```text
mvn -B -Dtest=UseCaseTest test
mvn -B -Dtest=IntegrationTest test
mvn -B -Dtest=ArchitectureTest test
```

## Evidence and limits

The restored fixture ran **16 tests with zero failures, errors or skips**:

- `UseCaseTest`: five tests cover the shared storage contract and direct application
  invocation with a small fake: valid creation, authorization, quantity and duplicates. No
  Spring context, server or database starts. The fake does not simulate transactions.
- `IntegrationTest`: nine tests run Boot wiring, MockMvc and real JDBC/H2. Both
  entries preserve authorization and quantity; tests also check missing principal,
  persistence/serialization, absence, duplicate conflict and adapter failures.
  Dropping the audit table forces the second write to fail; subsequent reads observe
  no order from either entry. No test-level transaction surrounds those calls, and
  the test asserts no ambient transaction is active. A separate audit duplicate
  checks failure classification and rollback. A controlled caller transaction also
  rolls back after the inner operation returns successfully, proving that the inner
  return does not commit joined work.
- `ArchitectureTest`: two tests use
  [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html) to import production
  classes while excluding tests, assert required domain/application/adapter classes
  were selected, and enforce core independence plus domain-to-application direction.
  The same core rule also rejects an explicitly imported hostile test class.

Both the fake and JDBC adapter run the same
[insert/find assertions](src/test/java/example/hexagonal/application/OrderStoreContract.java):
absence, complete value round-trip, conflicts for identical and different payloads
under the same globally unique ID, and preservation of the original row. This shared
subset does not claim audit, transaction, infrastructure failure or concurrency parity;
the JDBC-specific checks above retain the real mechanisms for those exercised claims.

Five additional mutations were executed only in the disposable copy, then restored:

1. Adding `application/MutationProbe.java` with a
   `org.springframework.http.ResponseEntity<String>` field made the actual production
   guard fail: two architecture tests, one failure naming the forbidden field.
2. Replacing the `transaction.execute(...)` call with direct `useCase.create(...)`
   made the focused rollback test fail because the first write remained visible.
3. Changing the production import package to `example.nonexistent` made the
   architecture test fail its explicit production-selection assertion.
4. Setting the use-case template to `REQUIRES_NEW` made the joined-transaction test
   fail because the order remained after the caller rolled back.
5. Making the fake silently accept an identical duplicate made the shared contract
   test fail because `DuplicateOrder` was no longer thrown.

Each mutated Maven command exited 1. After restoring sources and removing the extra
production class, `mvn -B -o clean test` passed all 16 tests; an additional restored
`mvn -B -o clean test dependency:tree` run confirmed the versions above. Offline mode
(`-o`) requires the dependencies to be cached from a prior run. Use `clean`
after deleting a mutation source so its compiled class cannot survive in `target/`.

MockMvc supplies `Principal` directly. These tests establish the application ownership
check for the supplied identities, not credential verification, security filter
configuration, CSRF policy or a complete authentication flow. HTTP binding executes
through Spring MVC without a live TCP server. H2 proves these adapter operations and
local transactions on H2; it does not prove another database's SQL, locking, isolation
or failure semantics. No concurrency race, production capacity, cross-resource
transaction or distributed durability claim is made. Production adoption requires
the actual identity integration, database contract and operational requirements.
