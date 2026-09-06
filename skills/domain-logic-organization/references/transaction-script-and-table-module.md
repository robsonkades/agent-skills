# Transaction Script and Table Module

## Transaction Script

One procedure per business transaction. Input arrives, the procedure validates it, reads
what it needs, computes, writes, and returns. Data is carried in structures — records,
rows, DTOs — with no behaviour of their own.

```java
public class RegisterShipment {

    private final ShipmentGateway shipments;   // Table Data Gateway
    private final RateGateway rates;

    RegisterShipment(ShipmentGateway shipments, RateGateway rates) {
        this.shipments = shipments;
        this.rates = rates;
    }

    @Transactional
    public ShipmentId register(RegisterShipmentCommand command) {
        if (command.weightKg().signum() <= 0) {
            throw new InvalidShipment("weight must be positive");
        }
        var rate = rates.findFor(command.origin(), command.destination())
            .orElseThrow(() -> new NoRouteAvailable(command.origin(), command.destination()));

        var price = rate.perKg().multiply(command.weightKg())
            .setScale(2, RoundingMode.HALF_UP);

        return shipments.insert(command.origin(), command.destination(),
                                command.weightKg(), price);
    }
}
```

That is a good Transaction Script: one transaction, explicit steps, no hidden state, and
trivially readable. The pattern's reputation suffers from bad examples, not from the
pattern.

### Keeping scripts healthy

- **One class per transaction, not one class per subsystem.** The 4 000-line
  `OrderService` is not the pattern; it is the pattern abandoned. The moment a script class
  holds unrelated transactions, split it — the cost of splitting is near zero and it is the
  only structural discipline the pattern demands.
- **Extract shared computation as pure functions**, not as a base class. Duplication of a
  _calculation_ is cheap to fix this way; duplication of a _rule with state_ is the signal
  that you have outgrown the pattern.
- **Keep the gateway thin.** The script owns the logic; the gateway owns SQL
  (`data-source-patterns`). When conditionals start appearing in the gateway, logic is
  escaping downward into the data layer, where it is hardest to find.
- **Validate at the entry, not throughout.** Scripts that re-check the same precondition at
  four depths are converging on the duplication failure mode.

### Where it actually breaks

Not at a line count. It breaks when rules begin to depend on each other:

> A shipment is eligible for the volume discount if its customer is on a contract rate,
> unless the route is subject to a fuel surcharge, in which case the surcharge is computed
> before the discount, except for contracted customers whose contract predates the
> surcharge.

Each script that touches pricing must now encode the whole chain. There will be four of
them (register, amend, quote, re-rate), they will be written by different people, and they
will diverge. That is the point to convert (`architecture-refactoring-paths`), and the
evidence is textual: the same rule appearing in three files.

### What it is genuinely good at

Reporting-shaped operations, imports, integrations, admin operations, and anything where
the interesting complexity is in the SQL rather than in the rules. Also: any module whose
rules you do not yet understand. A script is the cheapest thing to write and the cheapest
thing to replace once the shape reveals itself.

## Table Module

One class per table, holding the behaviour for **all** rows of that table, operating over a
record set rather than over one instance. Written for platforms with a first-class record
set (ADO.NET, and the tooling that grew around it), the pattern is often declared
irrelevant to Java. Its idea is not.

The idea: keep the logic that is inherently set-shaped next to the set, instead of
simulating sets with loops over objects.

```java
@Component
public class ContractRateModule {

    private final JdbcClient db;

    ContractRateModule(JdbcClient db) { this.db = db; }

    /** Annual indexation: one statement, not 400 000 aggregate loads. */
    @Transactional
    public int applyAnnualIndexation(Year year, BigDecimal factor) {
        return db.sql("""
                UPDATE contract_rate
                   SET per_kg = ROUND(per_kg * :factor, 2),
                       indexed_year = :year
                 WHERE indexed_year < :year
                   AND status = 'ACTIVE'
                """)
            .param("factor", factor)
            .param("year", year.getValue())
            .update();
    }

    public List<RateRow> activeRatesFor(RouteId route) { /* ... */ }
}
```

### When this is the right home

The Spring sketches assume managed beans invoked through the configured transaction proxy;
plain construction and self-invocation do not activate proxy advice. Classes are non-final to
permit class-based proxies. JdbcClient was introduced in Spring 6.1 (Java 17 baseline). Pin the
project's framework and SQL dialect instead of treating the snippet as a standalone program.
For indexation, define positive factor, null indexed-year handling, skipped-year catch-up and
version-column policy; `indexed_year < :year` applies one factor even when several years were missed.

- **Bulk recalculation and indexation.** Per-row hydration and writes can dominate this
  workload; compare measured round-trips, allocation and database work for behaviorally
  equivalent implementations (`architecture-and-performance`).
- **Rules genuinely expressed over a set**: ranking, allocation across rows, "close every
  position older than N days", period aggregations.
- **Legacy schemas with strong table semantics** where the object model would be a
  translation with no independent value.

### Living beside a domain model

This is the common and correct arrangement, and it needs one rule to stay safe: a
set-based module that bypasses the domain model also bypasses its invariants and its
optimistic locking. Therefore —

- Bulk operations must be **explicitly named as such** in the API, never dressed as
  ordinary domain operations.
- They must state which invariants they assume and which they cannot check.
- They must consider stale in-memory state: a running persistence context does not see the
  bulk update, and a subsequent flush can overwrite it. Coordinate transaction/flush ordering
  and clear or refresh affected contexts without discarding pending changes. A separate
  transaction does not refresh other active contexts or shared caches
  (`orm-behavioral-patterns`).
- Version columns must be handled deliberately — a bulk update that ignores them silently
  defeats optimistic locking for every row it touches (`offline-concurrency-control`).

### The honest limitation

Table Module scales with table count, not with concept count, so a business rule spanning
six tables has no natural owner and lands in whichever module the author touched first.
That is the same failure as the god service, arriving from a different direction. Where
rules span tables and interact, a Domain Model earns its keep (`domain-model.md`).

## Sources

- [JdbcClient API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/core/simple/JdbcClient.html): API introduced in Spring Framework 6.1.
- [Spring proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — final classes and proxy/self-invocation boundaries.
- [Fowler: Table Module](https://martinfowler.com/eaaCatalog/tableModule.html) — record-set organization, distinct from a gateway's persistence responsibility.
