# Observe the boundary the test claims

First choose the claim. A mapping test, a service commit test and a transaction-bound
listener test need different evidence. Do not add events or a physical JDBC reader
to an ordinary repository test.

| Claim                                                                         | Small useful test                                                                                                                                                                         | What it does not prove                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A field is mapped and database validation executes                            | Keep `@DataJpaTest`; save, flush, clear, reload through the repository. Use `TestEntityManager` for persistence-context control.                                                          | Flush is not commit. Clearing avoids a first-level-cache answer, not every possible cache.                                                      |
| A service returns with committed data visible                                 | Call the real bean without an outer test transaction; read afterward and clean committed data. For a JPA slice importing that service, use `@Transactional(propagation = NOT_SUPPORTED)`. | A single write does not establish atomicity across multiple writes or prove that the service, rather than its repository, owns the transaction. |
| Existing test setup must remain transactional, but one assertion needs commit | Use `TestTransaction.flagForCommit()` and `end()` for that case; observe after completion and clean independently.                                                                        | Listener count after completion does not identify its phase.                                                                                    |
| Rollback must remove all work in a use case                                   | Invoke the real application entry point, trigger the actual failure after relevant writes, then query outside the failed transaction.                                                     | An outer test transaction can supply a missing service transaction and hide the defect.                                                         |

The runnable examples use the first two choices. `TicketRepositoryTest` flushes and
clears before reading and uses `@AfterTransaction` to verify that test rollback removed
its row. The overlong value fails at flush; do not keep using that failed transaction.
`TicketServiceCommitTest` disables the slice's outer transaction. Its repository read
starts after the service returns, and repository cleanup commits in `@AfterEach` even
if an assertion fails. Both use isolated H2 and unique IDs. A commit-time constraint,
lock interaction or isolation claim needs the actual database engine and controlled
transactions; these tests do not certify PostgreSQL behavior.

## Live HTTP changes the transaction owner

With a servlet `RANDOM_PORT` test, the server thread owns the request's transaction.
A test's rollback does not undo server commits, and its uncommitted setup is usually
invisible to the request. Prefer no test-level `@Transactional` when exercising a real
server. Use the project's supported Boot HTTP test client and real relevant filters;
a custom HTTP client or token endpoint is unnecessary unless it serves the actual API.

Prepare and clean data with existing repository methods outside a test transaction.
For fixed SQL fixtures on an isolated database, Spring's SQL support is another option.
This partial test declaration assumes an existing application and HTTP test body:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Sql(statements = "delete from ticket where id = 'http-ticket-test'",
     executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
     config = @SqlConfig(transactionMode = SqlConfig.TransactionMode.ISOLATED))
class TicketHttpTest {
    // Use the existing HTTP test client; requests use the owned ID above.
}
```

`ISOLATED` executes cleanup in its own committed transaction with a suitable transaction
manager; specify datasource/manager names when ambiguous. This ID belongs to one serial
test scenario. Concurrent scenarios need distinct owned data or separate databases;
never delete another test's rows. Do not apply isolated cleanup to ordinary rollback
slices by default. Neither cleanup form can run after an abrupt process kill.

## Only when listener phase is the contract

For a real `AFTER_COMMIT` requirement, inspect the actual listener registration and
exercise it through the proxied publisher. Zero callbacks before `TestTransaction.end()`
and one afterward also accepts `BEFORE_COMMIT`: both occur during completion. Preserve
the distinction in a test that claims phase correctness.

Observe independently committed state **inside the actual callback**, or use an
equally discriminating signal. For example, a test observer attached to that callback
can read through a `TransactionTemplate` using the relevant manager,
`PROPAGATION_REQUIRES_NEW` and `ISOLATION_READ_COMMITTED`, then record whether the
published row was visible at that moment. Arrange an insert that is flushed but still
uncommitted before completion. On an engine where that independent read returns no
uncommitted row, a `BEFORE_COMMIT` mutation must fail the visibility assertion. Engines
with blocking reads need bounded waits and an engine-appropriate observation instead.
Allow a second connection; verify manager, isolation and pool behavior before claiming
independence. A repository read joining the existing bound transaction is insufficient.

This is a conditional diagnostic technique, not a new production listener, event bus
or standard helper for every test. Keep instrumentation in test code and observe the
real listener rather than replacing it with a listener having the desired annotation.
Application phase, rollback and delivery choices belong to `spring-transactions-and-events`;
pass the actual publisher/listener and the missing observation. The runnable examples
in this package make no listener-phase or durable-delivery claim.

Preemptive test timeouts can move work to another thread; the test transaction does
not follow it. Async work also needs a bounded signal of actual completion. HTTP
success alone need not mean an asynchronous effect finished.

Sources checked against Framework 7.0.9 and Boot 4.1.1 on 2026-09-28:

- [Test transactions](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/tx.html)
  covers rollback, flush, `TestTransaction`, lifecycle callbacks and thread binding.
- [Executing SQL](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/executing-sql.html)
  documents isolated SQL transactions and after-method cleanup.
- [Boot test modes](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html)
  distinguishes the live server's transaction from the test's transaction.
- [Transaction-bound events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
  defines listener phases; [REQUIRES_NEW](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
  defines independent transaction resources and the additional pool demand.
- [TestEntityManager](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/jpa/test/autoconfigure/TestEntityManager.html)
  provides persistence-context controls for JPA tests.
- [Spring Data JPA transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html)
  explains repository defaults and the precedence of an outer transaction.
