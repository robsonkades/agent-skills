# Persistence and Concurrency Tests

## Fixture and environment contract

Use an isolated database of the production engine family/version with relevant extensions,
collation, isolation, permissions and timezone. A container supplies an engine, not automatic
production equivalence. A compatible local database can also work; an alternative in-memory
engine is useful only for claims that do not rely on its differing semantics.

Apply production migrations rather than letting ORM schema generation create a substitute.
Check datasource wiring: a test slice can otherwise replace the intended database. Match
Spring Boot/Testcontainers modules and connection configuration to the project's versions.
Use container reuse only with explicit data isolation and cleanup. The Testcontainers JUnit 5
extension documents parallel-execution limitations; do not assume a static container is safe
for concurrently mutating tests.

Read [Testcontainers JUnit 5 support](https://java.testcontainers.org/test_framework_integration/junit_5/)
for lifecycle/parallel constraints (checked 2026-09-05). No container/database test was executed
as part of this documentation revision.

## Mapping and constraints

For a mapping round trip, persist a representative object with child collections, nulls and
value conversions as applicable, then flush and clear the persistence context before reloading.
Clearing prevents a first-level identity-map hit, but not a second-level cache hit. For database
read fidelity, disable/evict relevant caches or use an independent database read. Assert the
business-relevant values, not just identity or “save returned something.”

A stronger durability check commits the write and reads in a fresh transaction. A flush-only
test does not prove commit-time constraints or successful commit. Let the assertion encompass
the point where the engine actually enforces the constraint.

For duplicate-key/constraint tests, make the conflicting state deliberate and otherwise valid.
Assert the database failure or the translated application error at the boundary you exercise.
A direct EntityManager flush may throw a JPA/provider exception rather than Spring's translated
DataIntegrityViolationException. Do not assert the latter unless translation actually surrounds
that operation. Avoid driver-message substring matching; use the owned translation contract
and, when needed, a vendor-aware SQL-state/constraint adapter.

Sources: [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
for persistence contexts, locking and bulk operations; implementation timing must still be tested.

## Query budgets without false greens

Write the budget contract first: endpoint or repository operation, result shape/page, count
query included or excluded, cache state and what “query” means. Prepared-statement creation,
SQL execution and network round trips are different counters.

Hibernate Statistics is SessionFactory-wide and must be enabled with
`hibernate.generate_statistics=true` or `setStatisticsEnabled(true)`. Assert it is enabled.
`getPrepareStatementCount()` counts prepared statements acquired; it is not a universal
round-trip counter and misses database access outside that factory.

For a cold-path N+1 test:

1. Seed and commit data before measurement. Clear the first-level context and control second-level/
   query caches. Use several roots and related rows, plus the actual pagination shape.
2. Isolate the factory from parallel tests/background jobs, or use an operation-attributed datasource
   counter with demonstrated coverage. Resetting a global counter is not isolation.
3. Prove instrumentation is live using a known query outside the measured operation.
4. Capture the baseline; execute the operation and consume/map/serialize the fields the caller
   actually uses, within the intended transaction/session boundary. Include lazy loads triggered
   by response rendering if the promise is endpoint cost.
5. Assert the result as well as the count bound. Check a larger cardinality when growth is the risk;
   a low count because the operation returned no data is not success.
6. Introduce a known extra fetch or lazy N+1 in an isolated verification run: it must breach the
   chosen bound. Restore the valid path. If it does not fail, investigate scope/caches before
   changing the threshold.

A bound is appropriate for a maximum-cost contract; an exact count can be appropriate when exact
interaction is the promise. Neither proves a good query plan or latency. Keep plan/capacity
measurements in a suitable environment with representative data and statistics, including
dedicated CI where available (`load-testing`, `architecture-and-performance`).

Source: [Hibernate 6.6 Statistics](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/stat/Statistics.html),
checked 2026-09-05; adapt instrumentation to the actual ORM version.

## Transaction boundaries: observe durable outcomes

For a local two-write atomicity promise, use the real transaction-managed application entry
point. Do not wrap the test invocation in its own transaction: an outer test transaction can
make a missing application transaction appear correct. Arrange fixtures in a committed transaction.

Test protocol:

    Given: committed baseline and a positive control where both writes persist
    Invoke: real use case without a test-owned outer transaction
    Fault: deterministic failure after the first write is issued, before completion
    Observe: after the call ends, query both effects from a new independent transaction
    Expect: no partial durable state; the documented application error is returned
    Sensitivity: removing/bypassing the use-case transaction must make this check fail

Do not inject failure before any write and call that rollback coverage. Use the real write
path; a fake collaborator may inject the failure but cannot establish durable rollback.
A separate success control prevents “nothing was ever persisted” from looking atomic.
Check the relevant record identity rather than asserting an entire shared table is empty.

Spring's usual declarative default rolls back unchecked exceptions, not checked ones.
Inspect actual rollback rules and configured global defaults before asserting the behavior.
Test a checked exception only when it belongs to the use-case contract. An annotation's
presence/location does not prove the invocation passed through the transaction mechanism.

Database rollback does not undo a remote payment, sent email or non-transactional publish.
If the promise spans systems, identify outbox/compensation/delivery semantics and route
transaction design to `enterprise-transactions`; do not pretend this local test proves it.

Sources checked 2026-09-05:
[Spring test transactions](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/tx.html)
and [rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html).
Thread-bound tests and preemptive timeouts require particular care.

## Stale writes and concurrent edits

Choose the schedule the contract needs:

- **Stale version rejection:** read version v, commit a real change in another transaction,
  then attempt to persist the stale state through the actual update/merge path. This can be
  driven sequentially; it verifies version checking, not overlapping execution.
- **Two overlapping optimistic edits:** each worker opens its own transaction and persistence
  context, reads the same committed version, waits at a timed barrier after the read, makes
  a distinct actual change, then flushes/commits. Seed outside both workers and provide at
  least two usable database connections.

For the second scenario, exactly one success is appropriate only for two version-checked
updates to the same row with automatic retries disabled and an isolation mode that permits
this schedule. Expect the documented optimistic conflict at the real translation boundary;
a serialization error, pool timeout or broken barrier is not interchangeable with that conflict.

Assert both worker outcomes and the durable final payload/version from a fresh transaction.
For a numeric version with ordinary single-update increments, check the expected increment;
do not require numeric +1 for timestamp or custom version strategies. Distinct new values
let you identify the winner and detect accidental no-op updates.

Bound barrier waits, future waits, connection acquisition and database lock/statement execution.
Propagate worker failures to the test thread. In finally, release/break barriers, cancel tasks,
shut down the executor, and await termination with a bound. Clean the isolated fixture only
after confirming that workers have stopped. JDBC
cancellation is driver-dependent; use an outer process/job deadline as a last resort.
Check the termination result: surviving workers fail the test. Do not clean or reuse their
fixture while they can still write; terminate the isolated test process and discard its database
scope before allowing reuse. Preserve interruption when cleanup catches InterruptedException.
Java 21+ ExecutorService.close() waits for completion, so try-with-resources alone does not
bound a deadlocked test. On Java 17, use platform-thread executors with explicit shutdown and
bounded awaitTermination; ExecutorService is not AutoCloseable there. Virtual threads do not
create more database connections.

Sources: [Java 21 ExecutorService lifecycle](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ExecutorService.html)
and [Java 17 API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ExecutorService.html).
For the concurrency policy itself, see `offline-concurrency-control`.

## Bulk updates and deadlocks

JPQL bulk updates bypass ordinary optimistic checks and do not synchronize the persistence
context. Test the declared policy: if bulk changes must invalidate stale writers, explicitly
advance/check versions as designed, reload in a fresh context, and verify the stale writer
cannot overwrite the bulk result. A version increment alone is insufficient evidence of the
whole policy. Not every bulk job has that policy; do not impose it without the contract.

A start latch only starts workers together; it does not force a lock cycle. To reproduce a
suspected deadlock, instrument the unsafe acquisition points so each transaction owns its
first different lock before requesting the second, with engine-level diagnostics and bounds.
Do not reuse that barrier placement for a corrected common lock order: the second worker may
legitimately block before reaching the barrier, deadlocking the test harness itself.

For remediation, test acquisition order directly where possible, then test completion, final
invariants and bounded whole-transaction retry if that is the chosen policy. Separate controlled
reproduction from stress sampling. Repeated success does not prove deadlocks are impossible.

## Migrations: bootstrap, upgrade and validation

Test both empty bootstrap and upgrades from supported prior schema/data states. Include relevant
nulls, duplicate candidates, backfills and old/new app coexistence. Use the same migration options
and privileges as deployment. Schema-history validation does not prove arbitrary schema fidelity,
data preservation, lock duration or rollback safety.

For Flyway 11.8.2, the API distinction is:

```java
// Inside a test with a configured Flyway instance and JUnit assertions:
flyway.migrate(); // fails by exception if migration fails
var validation = flyway.validateWithResult();
assertTrue(validation.validationSuccessful);
// Only when no pending/repeatable migration or callback is expected to do more work:
assertEquals(0, flyway.migrate().migrationsExecuted);
```

`validate()` returns void; `validateWithResult()` returns the inspectable result.
A second no-op invocation demonstrates migration bookkeeping, not intrinsic idempotence
of every SQL file. Inspect repeatable migrations and callbacks separately.
Source: [Flyway 11.8.2 implementation](https://raw.githubusercontent.com/flyway/flyway/flyway-11.8.2/flyway-core/src/main/java/org/flywaydb/core/Flyway.java),
checked 2026-09-05. The API excerpt was source-checked, not run against a database.
Migration design belongs to `metadata-mapping`.
