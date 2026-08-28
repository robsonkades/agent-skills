# Gateways, Row Data Gateway and Active Record

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

SQL, parameter binding, result mapping to row records, and nothing else.

### What must not

Conditionals that encode a business rule. The moment a gateway method contains
`if (row.status().equals("BLOCKED")) return Optional.empty();`, a rule has moved into the
data layer, where nobody will look for it and where it cannot be unit tested without a
database. Return the row; let the caller decide.

### Where it is the best available option

- Reporting and exports — the query is the logic.
- Bulk operations — `expireAllFor` above is one statement instead of N object loads
  (`architecture-and-performance`).
- Integrations against a schema you do not own.
- Any path where the exact SQL and its plan matter enough to be reviewed.

### How it degrades

By accumulating methods until it is a 40-method class serving six use cases, and by
absorbing rules. Both are visible: count the methods, and grep for `if` in the class.

## Row Data Gateway

One object per row, holding the row's fields and its own load/save, with **no business
logic**. In modern Java it appears mainly as a deliberate boundary rather than as a chosen
pattern, and naming it is useful:

```java
// A row object. Not a domain object: it makes no decisions.
public record CustomerRow(Long id, String name, String email, String status, long version) { }
```

Its value today is diagnostic. When a class named `Customer` contains only accessors plus
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

    // Business logic on the row — this is what makes it Active Record.
    public void cancel(LocalDate on) {
        if (status == CANCELLED) throw new AlreadyCancelled(id);
        if (on.isBefore(renewsOn.minusDays(3))) throw new CancellationTooLate(id);
        status = CANCELLED;
    }

    public BigDecimal proratedRefund(LocalDate on) { ... }
}
```

In a Spring stack, the persistence half is normally provided by a repository rather than by
a `save()` method on the class. That is a cosmetic difference: the defining property is that
**the class's shape is the table's shape**, and the business logic sits on it.

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

Two or three of these together are the trigger to move to a Data Mapper
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
├── no  → gateway (table or row). Keep it free of conditionals.
└── yes → is the object's shape the table's shape, and will it stay so?
          ├── yes → Active Record
          └── no  → Data Mapper (active-record-vs-data-mapper.md)
```

The second question is about the future, so answer it with evidence: who owns the schema,
how often it has changed for non-domain reasons, and whether reporting requirements land on
the same tables.
