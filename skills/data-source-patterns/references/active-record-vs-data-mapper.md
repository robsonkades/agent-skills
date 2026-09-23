# Active Record versus Data Mapper

## Ownership and shape

Active Record puts database access and domain behavior on the object. Data Mapper separates
access from the objects it stores. A close table shape does not make an entity Active Record;
a separate mapper can map that same shape. Mapping capabilities and rule purity affect the
cost of independence, so inspect them rather than treating this table as a guarantee.

| Dimension                     | Active Record                                       | Data Mapper                                    |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Object/table divergence       | often close; framework mapping may allow divergence | separates shape translation                    |
| Lines of code for simple CRUD | can be compact                                      | framework may supply mapping                   |
| Schema change impact          | may affect domain and access together               | can be localized, not guaranteed               |
| Domain change impact          | migration only if persisted representation changes  | same persistence-contract constraint           |
| Unit-testing a rule           | pure methods need no database                       | pure methods need no database                  |
| Query control                 | depends on API and exposed SQL                      | depends on mapper and query API                |
| Ownership of the schema       | influences ease of evolution, not a prerequisite    | supports independent translation               |
| Aggregates spanning tables    | awkward                                             | natural                                        |
| Value objects and rich types  | limited by column mapping                           | natural                                        |
| Cognitive load                | access and rules share a class                      | mapping complexity; a second model is optional |
| Common failure                | schema drives the model                             | mapper becomes a second domain model           |

## The same domain both ways

The rule: an invoice may be settled only if the payment currency matches and the amount
covers the outstanding balance.

The following Java 17 snippets are partial: constructors, imports, identifiers, money,
status and exception types are omitted. The first uses Jakarta Persistence annotations;
the second also sketches a Spring component. They compare a directly mapped domain entity
with a separate domain/persistence representation, not Active Record with Data Mapper.

### Directly mapped JPA entity

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

This remains Data Mapper-style: there is no persistence method on the entity. The primitive
fields are an illustrative modeling choice, not a JPA requirement. Value objects can use
embeddables or suitable converters; evaluate their mapping and query constraints before
adding a second model. The shown `settle` method can be unit tested without EntityManager.

### Separate domain model and mapper

```java
// Domain: no annotations, no framework, no persistence.
public final class Invoice {
    private final InvoiceId id;
    private Money outstanding;
    private InvoiceStatus status;
    private long version; // preserve the loaded optimistic-lock token through mapping

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

The rule reads in the business's language and the mapper can isolate column renames.
Preserve identity and carry the loaded version as the expected token for the write; replacing
it with a newly read version conceals a stale-write conflict. When updating through a managed
JPA entity, compare its loaded version with that expected token before copying domain changes,
reject a mismatch, and let the provider maintain `@Version`. Do not overwrite the managed
version field to force acceptance. The provider's write-time check still guards races after
the comparison; failure may surface at flush or commit, not at the setter call.

For a custom SQL mapper, put the expected version in the write predicate and require the
intended affected-row count; a single-row update returning zero has not succeeded. Refresh
the domain's token from the successful persistence outcome before reusing it for another write.
The cost is `InvoiceMapper` and `InvoiceRow`, and a place where a bug can live that neither
side exhibits alone. Test a domain object loaded at version 5 against a row advanced to 6;
reloading version 6 in the mapper must not silently authorize the stale version-5 decision.

**Reconstitution** is the detail most often got wrong: loading must be able to produce an
object in a valid lifecycle state the creation constructor does not create (a settled invoice,
a cancelled order). Distinguish creation preconditions from invariants that hold in every
state. Reconstitution must reject corrupt combinations or translate known legacy states
explicitly; it is not permission to bypass all validation. Use an appropriately accessible
factory without weakening creation invariants.

## Where JPA actually sits

JPA defines persistence APIs/mapping rules implemented by providers such as Hibernate.
Annotated entities with externally managed persistence are Data Mapper-style; mapping
constraints can leak into their design without changing their pattern classification.

That middle ground is pragmatic and extremely common. It becomes a problem at identifiable
moments:

- A provider-accessible no-arg constructor or hydration path permits states the public
  creation API does not. Keep validated creation factories/constructors and controlled
  mutation; these requirements do not make constructor invariants impossible.
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
├── no → Rich domain needs isolation? Consider a mapper. Reporting or
│         transaction scripts may only need a gateway/projection.
└── yes → Do the business rules interact, or need types the columns
          cannot express (Money, ranges, state machines)?
          ├── no  → Active Record or a simple mapper, matching access ownership.
          └── yes → Do mapping constraints interfere with the desired model,
                    or is independent evolution valuable based on actual changes?
                    ├── no  → JPA entities with rules on them (the middle
                    │         ground). Record the trade.
                    └── yes → Data Mapper with a separate domain model.
```

## Extracting a separate domain model

Do not do this as a rewrite. The incremental path
(`architecture-refactoring-paths` has the general form):

Apply this to Active Record or persistence-constrained JPA entities; the latter are already
Data Mapper-style. Preserve one authoritative mutable representation per use case while
transitioning, and test round-trip identity/version, rollback and concurrent updates.

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

## Sources

- [Fowler: Data Mapper](https://martinfowler.com/eaaCatalog/dataMapper.html)
- [Jakarta Persistence 3.1: entities, versioning and bulk operations](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1)
