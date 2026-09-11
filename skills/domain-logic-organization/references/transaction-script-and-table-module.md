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

- **One procedure per business transaction; group classes by cohesion.** Related procedures
  may share a class under project conventions. Split when unrelated dependencies or changes
  make it harder to maintain; class length alone is not a defect. Preserve caller and
  transaction/proxy behavior when extracting a class (`service-layer-design`).
- **Extract shared computation as pure functions**, not as a base class. Duplication of a
  _calculation_ can be fixed this way, even when several rules interact. Duplicated stateful
  checks call for a shared owner; compare a policy with a model that owns the transitions.
- **Keep the gateway thin.** The script owns the logic; the gateway owns SQL
  (`data-source-patterns`). Distinguish misplaced business decisions from required database
  predicates, constraints and concurrency checks; a conditional alone is not a defect.
- **Validate at the boundary that can enforce the condition.** Avoid repeated pure input
  checks within one trusted path, but retain independent entry-point enforcement and
  authoritative checks on mutable state at the write. An earlier check may become stale.

### Where it actually breaks

Not at a line count. It breaks when rules begin to depend on each other:

> A shipment is eligible for the volume discount if its customer is on a contract rate,
> unless the route is subject to a fuel surcharge, in which case the surcharge is computed
> before the discount, except for contracted customers whose contract predates the
> surcharge.

If register, amend, quote and re-rate each encode this chain, compare extracting one pricing
policy with a model that owns the relevant state. Calls to one shared calculation are not
four copies of the rule. Divergent decisions or repeated coordination despite that shared
owner justify reconsidering the organization (`architecture-refactoring-paths`); an occurrence
count does not establish the need to convert.

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
set-based module does not automatically execute the domain model's checks or ORM optimistic
locking. It must preserve the required invariants through its own predicates, constraints and
concurrency policy. Therefore —

- Bulk operations must be **explicitly named as such** in the API, never dressed as
  ordinary domain operations.
- They must state which invariants they enforce and which preconditions they rely on;
  an unenforced required invariant is a gap, not permission to violate it.
- They must consider stale in-memory state: a running persistence context does not see the
  bulk update, and a subsequent flush can overwrite it. Coordinate transaction/flush ordering
  and clear or refresh affected contexts without discarding pending changes. A separate
  transaction does not refresh other active contexts or shared caches
  (`orm-behavioral-patterns`).
- Version columns must be handled deliberately — a bulk update outside an entity's version
  policy can let stale entity writers overwrite it (`offline-concurrency-control`).

### The honest limitation

Table ownership may obscure a business concept that spans several tables. Identify whether
one set-oriented module or shared policy still expresses the rule clearly; table count alone
does not require a Domain Model. Where interacting state transitions need their own owner,
compare the model's benefits and load costs (`domain-model.md`).

## Sources

- [Fowler: Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html) — procedures per business transaction, with shared subtasks where useful.
- [JdbcClient API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/core/simple/JdbcClient.html): API introduced in Spring Framework 6.1.
- [Spring proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — final classes and proxy/self-invocation boundaries.
- [Fowler: Table Module](https://martinfowler.com/eaaCatalog/tableModule.html) — record-set organization, distinct from a gateway's persistence responsibility.
