# Active Record versus Data Mapper

## The one dimension that matters

**May the object's shape differ from the table's shape?** Active Record says no; Data
Mapper says yes and charges you a mapping layer for it. Everything else in the comparison
follows from that.

| Dimension                     | Active Record                                         | Data Mapper                          |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------ |
| Object/table divergence       | none; shape is pinned                                 | free                                 |
| Lines of code for simple CRUD | fewest                                                | mapping layer on top                 |
| Schema change impact          | changes the domain class                              | changes the mapper only              |
| Domain change impact          | needs a migration                                     | may need none                        |
| Unit-testing a rule           | needs the persistence machinery, or careful isolation | pure; no database                    |
| Query control                 | good, through the repository                          | good, and separable from the model   |
| Ownership of the schema       | assumes you own it                                    | works when you do not                |
| Aggregates spanning tables    | awkward                                               | natural                              |
| Value objects and rich types  | limited by column mapping                             | natural                              |
| Cognitive load                | low                                                   | higher; two models and a translation |
| Common failure                | schema drives the model                               | mapper becomes a second domain model |

## The same domain both ways

The rule: an invoice may be settled only if the payment currency matches and the amount
covers the outstanding balance.

### Active Record

```java
@Entity
public class Invoice {
    @Id private Long id;
    private String currency;              // column type, not a domain type
    private BigDecimal outstanding;
    @Enumerated(STRING) private InvoiceStatus status;
    @Version private long version;

    public void settle(BigDecimal amount, String paymentCurrency) {
        if (!currency.equals(paymentCurrency)) throw new CurrencyMismatch(currency, paymentCurrency);
        if (amount.compareTo(outstanding) < 0) throw new PartialSettlementNotAllowed(id);
        outstanding = BigDecimal.ZERO;
        status = SETTLED;
    }
}
```

Compact and readable. Note what leaks: `currency` is a `String` and `outstanding` a bare
`BigDecimal` because those are the column types. `Money` as a first-class concept — with
its currency, its rounding and its arithmetic — is not available without either an
`@Embeddable`/converter (which is already a small step towards mapping) or a redundant
translation on every use.

### Data Mapper

```java
// Domain: no annotations, no framework, no persistence.
public final class Invoice {
    private final InvoiceId id;
    private Money outstanding;
    private InvoiceStatus status;

    public void settle(Money payment) {
        if (!payment.currency().equals(outstanding.currency()))
            throw new CurrencyMismatch(outstanding.currency(), payment.currency());
        if (payment.isLessThan(outstanding))
            throw new PartialSettlementNotAllowed(id);
        outstanding = Money.zero(outstanding.currency());
        status = InvoiceStatus.SETTLED;
    }
}

// Mapper: the only code that knows both shapes.
@Component
final class InvoiceMapper {
    Invoice toDomain(InvoiceRow row) {
        return Invoice.reconstitute(new InvoiceId(row.id()),
            Money.of(row.outstanding(), Currency.getInstance(row.currency())),
            InvoiceStatus.valueOf(row.status()), row.version());
    }
    InvoiceRow toRow(Invoice invoice) { ... }
}
```

The rule now reads in the business's language, tests without infrastructure, and is immune
to a column rename. The cost is `InvoiceMapper` and `InvoiceRow`: two more files, and a
place where a bug can live that neither side exhibits alone.

**Reconstitution** is the detail most often got wrong: loading must be able to produce an
object in a state the public constructor forbids (a settled invoice, a cancelled order).
Use a package-private or static factory for rehydration; do not weaken the public
constructor's invariants to let the mapper in.

## Where JPA actually sits

JPA is a Data Mapper implementation. Used as most Spring applications use it — annotations
on the domain class itself — it delivers Data Mapper's _runtime_ services (unit of work,
identity map, lazy loading) while behaving like Active Record in the dimension that
matters: the class's shape is constrained by what maps cleanly.

That middle ground is pragmatic and extremely common. It becomes a problem at identifiable
moments:

- A no-arg constructor and field mutability are required, so invariants cannot be enforced
  in a constructor.
- Bidirectional associations are added for mapping reasons and become part of the domain
  API.
- Inheritance is chosen for what maps well rather than for what the business means
  (`inheritance-mapping-strategies`).
- The entity is serialised directly to the API, coupling three things at once
  (`remote-facade-and-dto`).
- The model cannot be tested without an `EntityManager`, so tests become slow and
  integration-shaped.

The honest options are to accept the middle ground and record it, or to separate domain
from persistence model and pay for the mapper. Both are defensible; only the unexamined
version is not (`architecture-decision-making`).

## Choosing

```text
Do you own the schema and will it follow the model?
├── no → Data Mapper. Not negotiable: the foreign shape will otherwise
│         become your model.
└── yes → Do the business rules interact, or need types the columns
          cannot express (Money, ranges, state machines)?
          ├── no  → Active Record. Cheapest, honest, sufficient.
          └── yes → Do you need to test rules without infrastructure, or
                    do you expect the model and schema to diverge?
                    ├── no  → JPA entities with rules on them (the middle
                    │         ground). Record the trade.
                    └── yes → Data Mapper with a separate domain model.
```

## Migrating Active Record to Data Mapper

Do not do this as a rewrite. The incremental path
(`architecture-refactoring-paths` has the general form):

1. **Characterise first.** Tests at the use-case level, so behaviour is pinned before
   anything moves.
2. **Introduce the domain type beside the entity**, starting with the aggregate whose rules
   hurt most. The entity remains the persistence shape.
3. **Move one rule at a time** into the domain type; the entity keeps its method, delegating.
4. **Add the mapper** and switch one repository method to return the domain type.
5. **Push the boundary outward** until the entity is only reachable from the mapper.
6. **Then, optionally, separate the schema's evolution from the model's** — this is the
   point where the investment pays back, and stopping earlier is a legitimate outcome.

Stop when the pain stops. A partial migration where the complex aggregates use a mapper and
the CRUD modules stay Active Record is a good final state, not an unfinished one.
