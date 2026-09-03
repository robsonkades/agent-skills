# Persistence and Concurrency Tests

## Against the real engine

```java
@SpringBootTest
@Testcontainers
class OrderPersistenceTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16");

    // Migrations run from empty, exactly as in production.
}
```

An in-memory database differs in every dimension this file is about: constraint enforcement,
locking, isolation, dialect and plan behaviour. A `SELECT ... FOR UPDATE` that does not block,
a check constraint that is not applied, an `OptimisticLockException` that never fires — all
pass in memory and fail in production.

Reuse containers at a scope that preserves isolation and acceptable runtime; per-test containers
may be justified for destructive or parallel scenarios. Use the production engine family and a
supported version representative of production, then let migrations create the schema.

## Mapping round trips

```java
@Test
void order_round_trips_with_its_lines_and_embedded_money() {
    var order = Order.draftFor(customer, clock);
    order.addLine(productId, 3, Money.of(new BigDecimal("19.90"), "BRL"));
    var saved = orders.save(order);

    em.flush();
    em.clear();                                  // force a real read, not the identity map

    var loaded = orders.byId(saved.id()).orElseThrow();
    assertThat(loaded.total()).isEqualTo(Money.of(new BigDecimal("59.70"), "BRL"));
    assertThat(loaded.lines()).hasSize(1);
    assertThat(loaded.version()).isEqualTo(saved.version());
}
```

`em.clear()` is the load-bearing line. Without it the assertion reads the same instance the
test just built and proves nothing about the mapping
(`orm-behavioral-patterns`).

## Constraints are tested, not assumed

```java
@Test
void duplicate_email_is_rejected_by_the_database() {
    customers.save(new Customer(new Email("ana@example.com")));
    em.flush();

    assertThatThrownBy(() -> {
            customers.save(new Customer(new Email("ana@example.com")));
            em.flush();
        })
        .isInstanceOf(DataIntegrityViolationException.class);
}
```

If application error translation intentionally depends on a named constraint, test the translated
domain/API outcome and inspect the vendor-specific cause or SQL state through a dedicated adapter.
Matching a framework exception message is brittle across drivers and dialects
(`enterprise-base-patterns`).

## Query budgets

```java
abstract class QueryBudgetTest {

    @Autowired EntityManagerFactory emf;

    protected long statements() {
        return emf.unwrap(SessionFactory.class).getStatistics().getPrepareStatementCount();
    }

    @BeforeEach void resetStatistics() {
        emf.unwrap(SessionFactory.class).getStatistics().clear();
    }
}

class OrderListBudgetTest extends QueryBudgetTest {

    @Test
    void listing_25_orders_costs_at_most_2_queries() {
        givenOrders(25, withLines(4));                 // enough rows for an N+1 to show
        long before = statements();

        orderQueries.search(new OrderSearch(...), PageRequest.of(0, 25));

        assertThat(statements() - before).isLessThanOrEqualTo(2);
    }
}
```

Two details decide whether this test works: **enough rows** (an N+1 with one row looks like
one query) and asserting a **bound**, not an exact number, so an unrelated change does not
produce a false failure (`architecture-and-performance`).

## Transaction boundaries, asserted by outcome

```java
@Test
void a_failure_in_the_second_write_rolls_back_the_first() {
    when(inventory.reserve(any(), any())).thenThrow(new InventoryUnavailable());

    assertThatThrownBy(() -> placeOrder.place(command))
        .isInstanceOf(OrderCannotBeFulfilled.class);

    // The assertion that matters: nothing was left behind.
    assertThat(jdbc.sql("select count(*) from customer_order").query(Long.class).single())
        .isZero();
}

@Test
void a_checked_business_exception_still_rolls_back() {
    // Guards the default: checked exceptions do NOT roll back unless declared.
    assertThatThrownBy(() -> settlement.settle(invoiceId)).isInstanceOf(InsufficientFunds.class);
    assertThat(invoiceStatusInDatabase(invoiceId)).isEqualTo("OPEN");
}
```

The second test guards a real default that surprises people and is invisible in review
(`enterprise-transactions`).

## Optimistic locking, with two threads

```java
@Test
void concurrent_edits_produce_exactly_one_winner() throws Exception {
    var loaded = new Phaser(2);

    Callable<Boolean> edit = () -> {
        try {
            transactionTemplate.executeWithoutResult(status -> {
                var order = orders.byId(orderId).orElseThrow();
                loaded.arriveAndAwaitAdvance(); // both transactions hold the same version before either writes
                order.changeShippingAddress(new Address("..."));
            });
            return true;
        } catch (OptimisticLockingFailureException e) {
            return false;
        }
    };

    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
        var a = pool.submit(edit);
        var b = pool.submit(edit);
        assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder(true, false);
    }
    assertThat(orders.byId(orderId).orElseThrow().version()).isEqualTo(initialVersion + 1);
}
```

Requirements: real transactions (not a single test transaction that would serialise them),
a barrier after both reads so both writers hold the same version, and an assertion on the **final version**
as well as the outcomes — a test that only checks the exception passes even if both writes
landed (`offline-concurrency-control`).

## A bulk update must not defeat versioning

```java
@Test
void bulk_expiry_increments_the_version() {
    var before = orders.byId(orderId).orElseThrow().version();
    orderBulk.expireAllBefore(LocalDate.now());
    em.clear();
    assertThat(orders.byId(orderId).orElseThrow().version()).isGreaterThan(before);
}
```

This is the test for the most common way optimistic locking is silently disabled: a JPQL or
native bulk statement that does not touch the version column.

## Deadlock reproduction

```java
@Test
void transfers_in_opposite_directions_do_not_deadlock() throws Exception {
    var start = new CountDownLatch(1);
    Callable<Void> ab = () -> { start.await(); transfers.transfer(a, b, amount); return null; };
    Callable<Void> ba = () -> { start.await(); transfers.transfer(b, a, amount); return null; };

    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
        var f1 = pool.submit(ab);
        var f2 = pool.submit(ba);
        start.countDown();
        f1.get(10, SECONDS);
        f2.get(10, SECONDS);          // fails if lock ordering is not applied
    }
}
```

Repeated execution can increase the chance of observing a deadlock but cannot prove its absence.
Make acquisition ordering directly testable where possible, add database lock/deadlock diagnostics,
and keep a bounded stress test outside the deterministic unit gate. Stable key ordering is a common remediation
(`offline-concurrency-control`).

## Test data volume

A plan chosen for 100 rows is not the plan for 10 million. Tests cannot use production
volume, so split the concern:

| Property                 | Where it is verified                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| Correctness of the query | Integration test, small data                                           |
| Query count (N+1)        | Budget test, tens of rows — enough for the multiplier to show          |
| Index presence           | Schema diff / migration review (`metadata-mapping`)                    |
| Plan quality at volume   | A performance environment with production-shaped data (`load-testing`) |
| Lock behaviour           | Concurrency test, real engine                                          |

Do not attempt to test plan quality in the unit suite; do not skip the query count because
"we cannot test performance in CI". They are different questions and only one of them
belongs in CI.

## Migration tests

```java
@Test
void migrations_apply_cleanly_from_empty_and_validate() {
    var flyway = Flyway.configure().dataSource(DB.getJdbcUrl(), user, password).load();
    assertThat(flyway.migrate().success).isTrue();
    assertThat(flyway.validate().validationSuccessful).isTrue();
    assertThat(flyway.migrate().migrationsExecuted).isZero();       // second run is a no-op
}
```

This proves a clean bootstrap and that Flyway records versioned migrations so a second invocation is
a no-op; it does not prove each migration is intrinsically idempotent or that upgrades from every
supported production schema/data state succeed. Test those starting states separately.
