# Embedding and Serialisation

## Embedded Value

A value object with no identity, stored as columns of its owner's table. This is the
cheapest possible upgrade from primitive obsession: a real type in the model, no extra
table, no join.

```java
@Embeddable
public record Money(BigDecimal amount, String currency) {

    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        if (amount.scale() > 2) throw new IllegalArgumentException("scale > 2");
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency)) throw new CurrencyMismatch(currency, other.currency);
        return new Money(amount.add(other.amount), currency);
    }

    public static Money zero(String currency) { return new Money(BigDecimal.ZERO, currency); }
}

@Entity
public class Invoice {
    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "amount",   column = @Column(name = "total_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "total_currency"))
    })
    private Money total;
}
```

Records as `@Embeddable` work from Hibernate 6.2, which removes the old objection that
value objects had to be mutable classes with a no-arg constructor.

### Points that bite

- **Two embeddables of the same type in one entity** need `@AttributeOverrides` on at least
  one, or the columns collide.
- **Null semantics.** With every column null, some configurations hand back `null` and
  others an object with null components. If the value is optional, pick one and write a test
  for it; if it is mandatory, make the columns `NOT NULL` and the question disappears.
- **Immutability pays here.** An immutable embeddable cannot be mutated behind the owner's
  back and can be shared safely; a mutable one can be modified through a reference obtained
  from a getter, bypassing the owner entirely.
- **Querying works normally**: `where i.total.amount > :x`. This is the property a JSON
  column does not have, and it is the main reason to prefer embedding.

## Single-column values: converters

When a value maps to exactly one column, a converter is lighter than an embeddable:

```java
@Converter(autoApply = true)
public class EmailConverter implements AttributeConverter<Email, String> {
    @Override public String convertToDatabaseColumn(Email email) {
        return email == null ? null : email.value();
    }
    @Override public Email convertToEntityAttribute(String column) {
        return column == null ? null : new Email(column);
    }
}
```

Two constraints worth knowing before relying on it: a converted attribute cannot be used in
a JPQL function that needs the underlying type, and `autoApply` is global — an explicit
`@Convert` on the field is easier to trace when someone is reading the mapping later.

## Dependent Mapping

A child with no identity of its own, reachable only through its parent, and dying with it.

```java
@Entity
public class Order {
    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private final List<OrderLine> lines = new ArrayList<>();
}
```

The three rules that make it a dependent mapping rather than just a relationship:

1. **No repository for the child.** `OrderLineRepository` is the standard signal that the
   dependency has been abandoned (`repository-pattern`).
2. **No independent loading.** The child is loaded with the parent and never queried by its
   own identifier from application code.
3. **Lifecycle follows the parent** — `cascade = ALL` and `orphanRemoval = true`.

When the child needs to be found on its own (a report over all lines, an external system
referencing a line), it has independent identity and is a full entity. Say so, and give it a
proper identifier; a half-dependent child is where cascade surprises come from.

## Serialized LOB

The whole structure in one column — JSON, XML or binary.

```java
@Entity
public class InsuranceApplication {
    @Id private UUID id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private ApplicationForm form;      // a deep, variable, form-shaped structure
}
```

### The honest trade

| Gain                                        | Loss                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| No schema change when the structure changes | No schema validation of the structure either             |
| Arbitrarily deep and variable shapes        | No joins, no foreign keys, no referential integrity      |
| One row, one read                           | The whole column is rewritten on any change              |
| Trivial to add                              | Reporting must parse it; ad-hoc SQL becomes hard         |
| No mapping code                             | Migration means an application job, not an `ALTER TABLE` |

### When it is right

- The data is genuinely opaque to the database: a rendered document, a third-party
  payload retained for audit, an event body, a point-in-time snapshot.
- The structure is variable per row — a form definition, per-tenant configuration — and no
  query filters on its contents.
- The whole value is always read and written together.

### When it is wrong

- Anything that will be searched, aggregated or reported on. "We will never query it" is
  the claim that ages worst in enterprise systems; the first request for "how many
  applications had X" arrives within a year.
- Anything with referential integrity to real tables. Ids inside JSON have no foreign keys,
  and orphan detection becomes a scheduled script.
- Anything concurrently edited in parts: the column is written whole, so two edits to
  different fields conflict as a lost update (`offline-concurrency-control`).

### Making a JSON column survivable

If you keep it:

- **Version the payload.** A `schema_version` field inside the document, from the first
  release. Without it, evolving the structure means guessing which shape each row holds.
- **Index what you must query.** PostgreSQL GIN or an expression index on an extracted path;
  SQL Server a computed persisted column plus an index. Treat this as a stopgap that
  signals the field should be promoted.
- **Never let it be the only copy of a business-critical value.** Amounts, statuses and
  identifiers belong in columns; the LOB may keep a copy for fidelity.
- **Validate on write** with an explicit schema check in the application, since the database
  will not.

## Promoting a LOB to columns

The migration when the requirement changes, in the safe order using expand/contract:

1. Add the new columns, nullable.
2. Write both — the application populates the columns and continues to write the LOB.
3. Backfill existing rows in chunks, with a restartable cursor.
4. Switch reads to the columns; keep writing both.
5. Add the constraints (`NOT NULL`, checks, indexes).
6. Stop writing that part of the LOB, and remove it from the payload after the retention
   requirement is satisfied.

Each step is independently deployable and reversible, which is the property that makes it
safe to start on a large table (`architecture-refactoring-paths`).
