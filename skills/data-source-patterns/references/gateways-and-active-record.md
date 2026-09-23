# Gateways, Row Data Gateway and Active Record

Java examples are partial sketches, not complete application classes: imports, constructors,
schema and project-specific exception/status types are omitted. Use Java 17 and Spring 6.1+
for `JdbcClient`; JPA annotations/API here use `jakarta.persistence` on that stack.

## Table Data Gateway

One object holds every SQL statement for one table. It speaks in primitives, records or
row objects — never in domain objects — and contains no business rules.

```java
@Repository
public class RateGateway {

    private final JdbcClient db;

    RateGateway(JdbcClient db) { this.db = db; }

    public Optional<RateRow> find(String origin, String destination) {
        return db.sql("""
                SELECT id, origin, destination, per_kg, valid_from, valid_to
                  FROM rate
                 WHERE origin = :origin AND destination = :destination
                   AND valid_from <= CURRENT_DATE AND valid_to > CURRENT_DATE
                """)
            .param("origin", origin)
            .param("destination", destination)
            .query(RateRow.class)
            .optional();
    }

    public int expireAllFor(String origin, LocalDate on) {
        return db.sql("UPDATE rate SET valid_to = :on WHERE origin = :origin AND valid_to > :on")
            .param("on", on).param("origin", origin)
            .update();
    }
}

public record RateRow(long id, String origin, String destination,
                      BigDecimal perKg, LocalDate validFrom, LocalDate validTo) { }
```

### What belongs here

SQL, parameter binding, row mapping, technical validation and affected-row/error handling.
`find` assumes at most one currently valid rate per route: `.optional()` throws on multiple
rows, rather than choosing one. Enforce that invariant in the database or return a collection
when multiple matches are valid. `CURRENT_DATE` uses the database's date/time context; bind
an explicit business date if the caller owns that policy.

`expireAllFor` is a partial SQL illustration: define whether future rates may be shortened
past their start date, and preserve interval constraints. Bulk SQL bypasses entity callbacks
and automatic entity version checks; preserve version predicates/updates required by the
write contract and test against the target dialect.

When mixing a gateway with managed JPA entities in one use case:

- Verify that both join the intended transaction. In Spring, `JpaTransactionManager` can
  expose its connection to JDBC using the corresponding `DataSource`, transaction-aware
  lookup and a compatible `JpaDialect`. `JdbcClient` delegates to Spring JDBC; `@Repository`
  alone neither starts a transaction nor enlists an arbitrary connection. Force a failure
  after both writes and verify that both roll back (`enterprise-transactions`).
- Do not assume plain JDBC triggers JPA auto-flush. If SQL must observe pending entity changes,
  deliberately flush them first within the shared transaction. Flush does not commit it.
- After SQL changes managed rows, reconcile before relying on those objects again. `clear`
  detaches all managed entities and loses unflushed changes; `refresh` overwrites the selected
  entity's state. Preserve intended changes before SQL/invalidation, or isolate the bulk work
  in a suitable fresh persistence context. Do not blindly flush stale objects after SQL.
  Provider caches may also need invalidation; runtime policy belongs to `orm-behavioral-patterns`.

### What must not

Conditionals that encode a business rule. The moment a gateway method contains
`if (row.status().equals("BLOCKED")) return Optional.empty();`, a rule has moved into the
data layer with unclear ownership. Expose policy deliberately, for example by returning the
row for a caller decision or by naming an explicit policy-filtered query. A concurrency
guard in an atomic write must remain in SQL; moving it to a prior read can introduce a race.

### Where it is the best available option

- Reporting and exports — the query is the logic.
- Bulk operations — `expireAllFor` above is one statement instead of N object loads
  (`architecture-and-performance`).
- Integrations against a schema you do not own.
- Any path where the exact SQL and its plan matter enough to be reviewed.

### How it degrades

By mixing unrelated access responsibilities or hiding policy decisions. Inspect callers,
SQL predicates and change reasons; a method count or grep for `if` is not a diagnosis.

## Row Data Gateway

One object per row, holding the row's fields and its own load/save, with **no business
logic**. In modern Java it appears mainly as a deliberate boundary rather than as a chosen
pattern, and naming it is useful:

```java
// Passive row data only: this is NOT a Row Data Gateway by itself.
public record CustomerRow(Long id, String name, String email, String status, long version) { }
```

The record above has no database access. A Row Data Gateway additionally owns row-level
insert/update/delete operations (with affected-row/version checks and a caller-owned
transaction). A mapper returning a passive record does not turn it into a gateway.
When a class named `Customer` contains only accessors plus
persistence, the design has a Row Data Gateway that is being described as a domain model —
and the business rules are therefore somewhere else, usually a service
(`domain-logic-organization`).

## Active Record

The row object plus the business logic for that row. Persistence is a method on the object.

```java
@Entity
@Table(name = "subscription")
public class Subscription {

    @Id @GeneratedValue private Long id;
    private Long customerId;
    @Enumerated(STRING) private SubscriptionStatus status;
    private LocalDate renewsOn;
    private BigDecimal monthlyPrice;
    @Version private long version;

    // Assumed policy: cancellation is allowed through renewsOn minus three days, inclusive.
    public void cancel(LocalDate on) {
        if (status == CANCELLED) throw new AlreadyCancelled(id);
        if (on.isAfter(renewsOn.minusDays(3))) throw new CancellationTooLate(id);
        status = CANCELLED;
    }

    // Persistence on this object makes this sketch Active Record.
    // For a new instance only; caller owns the EntityManager and transaction.
    public void insert(EntityManager em) { em.persist(this); }

    public BigDecimal proratedRefund(LocalDate on) { ... }
}
```

Without the persistence method, an entity with `cancel` and an external repository remains
Data Mapper-style persistence, even if it closely mirrors a table. That ownership difference
is substantive. The `insert` sketch illustrates coupling, not a recommendation to inject an
EntityManager into existing entities. Pure `cancel` tests do not require a database; insertion,
flush/commit failures and optimistic locking require integration tests.

### When Active Record is the right call

- The schema is yours and follows the model.
- One concept, one table — the mapping is an identity function.
- The rules are per-row: validation, status transitions, derived values.
- The module is small enough that a mapping layer would be its largest component.

CRUD-heavy admin areas, configuration modules and reference data are the natural home, and
using it there is a deliberate decision worth recording rather than an admission.

### Where it stops working

| Signal                                                             | What it means                                  |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| A concept needs data from three tables to decide anything          | The object is no longer the row                |
| The class has fields that exist only because the table has columns | The schema is shaping the model                |
| Business rules span two Active Records and land in a service       | The model has outgrown per-row logic           |
| A schema change forced by a report changes the domain class        | Reporting is now coupled to the business model |
| Unit tests need a database to exercise a rule                      | The rule is entangled with persistence         |
| The same class is used as the HTTP payload and the row             | The public API is now the schema               |

Use the observed cost and affected behavior to decide whether to move to a Data Mapper
(`active-record-vs-data-mapper.md`), and the migration is incremental
(`architecture-refactoring-paths`).

### Two things Active Record does not excuse

- **Serving as the API payload.** Active Record couples object to table; exposing it
  couples the public contract to the table as well, and that is a third coupling nobody
  decided on (`remote-facade-and-dto`).
- **Skipping the transaction boundary.** Logic on the object does not remove the need for a
  use case that demarcates the transaction when more than one object is written
  (`enterprise-transactions`).

## Choosing between the three in one module

```text
Does the code make business decisions about this data?
├── no  → gateway (table or row), or a projection mapper; separate policy from mechanics.
└── yes → is the object's shape the table's shape, and will it stay so?
          ├── yes → Active Record if the object owns persistence; a simple mapper also fits
          └── no  → Data Mapper (active-record-vs-data-mapper.md)
```

The second question is about the future, so answer it with evidence: who owns the schema,
how often it has changed for non-domain reasons, and whether reporting requirements land on
the same tables.

## Sources

- [Fowler: Active Record](https://martinfowler.com/eaaCatalog/activeRecord.html)
- [Fowler: Row Data Gateway](https://martinfowler.com/eaaCatalog/rowDataGateway.html)
- [Fowler: Table Data Gateway](https://martinfowler.com/eaaCatalog/tableDataGateway.html)
- [Spring Framework 6.1 JdbcClient](https://docs.spring.io/spring-framework/docs/6.1.x/javadoc-api/org/springframework/jdbc/core/simple/JdbcClient.html)
- [Spring 6.1.21 JpaTransactionManager connection-sharing contract](https://github.com/spring-projects/spring-framework/blob/v6.1.21/spring-orm/src/main/java/org/springframework/orm/jpa/JpaTransactionManager.java)
- [Jakarta Persistence 3.1 EntityManager flush, clear and refresh](https://jakarta.ee/specifications/persistence/3.1/apidocs/jakarta.persistence/jakarta/persistence/entitymanager)
