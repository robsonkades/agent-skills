# Embedding and Serialisation

## Embedded Value

A value object with no identity, stored as columns of its owner's table. This is the
cheapest possible upgrade from primitive obsession: a real type in the model, no extra
table, no join.

This partial example assumes the application permits only currencies using two fractional digits;
it is not a general monetary model. Choose precision, scale and currency validation from
the domain, and match the database columns so persistence cannot silently round values.
Normalize scale to make record equality consistent for numerically equal amounts.

```java
@Embeddable
public record Money(BigDecimal amount, String currency) {

    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        amount = amount.setScale(2, RoundingMode.UNNECESSARY);
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
        @AttributeOverride(name = "amount",   column = @Column(name = "total_amount", nullable = false, precision = 19, scale = 2)),
        @AttributeOverride(name = "currency", column = @Column(name = "total_currency", nullable = false, length = 3))
    })
    private Money total;
}
```

Record embeddables are supported by Hibernate 6.2+ and standardized by Jakarta Persistence
3.2. Java record syntax alone (Java 16+) does not establish provider support. Inspect the
project's actual provider/API baseline; older mappings may need a regular embeddable class.
This does not establish record support for every identifier use.

See [Hibernate 6.2 embeddable types](https://docs.hibernate.org/orm/6.2/introduction/html_single/#embeddable-types)
and [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
for record, ownership and converter contracts.

### Points that bite

- **Two embeddables of the same type in one entity** need `@AttributeOverrides` on at least
  one, or the columns collide.
- **Null semantics.** With every column null, some configurations hand back `null` and
  others an object with null components. If the value is optional, pick one and write a test
  for it; if it is mandatory, make the columns `NOT NULL` and the question disappears.
- **Immutability pays here.** An immutable embeddable cannot be mutated behind the owner's
  back. Still follow JPA's owner-specific embedded-instance semantics rather than sharing
  one embedded instance between persistent owners. A mutable one can be modified through a reference obtained
  from a getter, bypassing the owner entirely.
- **Querying works normally**: `where i.total.amount > :x`. This is the property a JSON
  column generally lacks through portable JPQL path navigation. Database JSON operators
  and provider extensions can still query JSON; compare required portability and plans.

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

Do not assume portable JPQL functions operate on the converted database type; provider
support must be verified. `autoApply` applies to eligible attributes of that Java type in
the persistence unit, not every field in every application. An explicit `@Convert` is
local, and `disableConversion` can opt out. Ids, versions and relationships are not ordinary
auto-apply targets.

## Dependent Mapping

A child whose write lifecycle belongs to its parent. A JPA entity child still needs an
identifier; dependent lifecycle does not mean absence of row or entity identity.

```java
@Entity
public class Order {
    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();
}
```

Keep aggregate mutations behind the root's operations. Select cascades for the lifecycle
operations needed; `ALL` is convenient but is not the definition of dependence.
`orphanRemoval` is appropriate when removing a managed child from the relationship must
delete it; reassignment, detached/new children and bulk operations need explicit handling.

A read-only projection or report over all lines does not make lines independently mutable
aggregate roots. Independent commands, external references and reassignment requirements
may justify revisiting the boundary, but a child query alone does not require its own
write repository (`repository-pattern`).

## Serialized LOB

The whole structure in one column — JSON, XML or binary. Native JSON types are not the
same as opaque binary LOBs. This partial example is Hibernate 6 JSON mapping with PostgreSQL
`jsonb`; it needs an appropriate JSON format mapper/serialization library and is not
portable JPA or a generic `@Lob` mapping.

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

An opaque binary value generally cannot be queried structurally. Native JSON can support
path queries, indexes, CHECK constraints and SQL transformations. For example,
[PostgreSQL 17 JSON types](https://www.postgresql.org/docs/17/datatype-json.html) document
`jsonb` operators and indexing. These capabilities have dialect, index maintenance and
portability costs; they are legitimate designs, not automatically temporary workarounds.

Prefer native JSON for variable shapes, retained payloads or snapshots where document
access is natural. Prefer relational columns/tables for stable heavily queried fields,
ordinary foreign keys, shared references and invariants spanning records. Reporting alone
does not settle the choice: compare actual query plans, selectivity and update patterns.

An ORM often replaces a JSON value as a whole. Database JSON path-update functions may
express logical partial changes, but do not assume an in-place physical write or independent
row locks. Test dirty detection for in-place POJO mutations; immutable replacement may be
clearer. Two whole-document writers can lose updates without version checks. With proper
optimistic locking, one conflicts instead; a path update must still preserve invariants and
coexist safely with snapshot writers (`offline-concurrency-control`).

If keeping JSON:

- Version the payload shape and define compatible readers/writers. This shape version is
  distinct from the optimistic concurrency version.
- Validate required structure, types and bounds in the application and enforce critical
  database-expressible constraints. Valid JSON syntax is not a business schema.
- Use extracted/generated columns and indexes where justified by the deployed database.
  Keep foreign-key relationships in enforceable relational columns when required.
- If duplicating values in columns and JSON, name the authoritative representation and
  update them atomically or reconcile explicitly. Duplication is not inherently safer.
- Test serialization round trips, optional/missing/null fields, numeric precision and
  dirty checking on the actual mapper.

## Promoting a LOB to columns

The migration when the requirement changes, in the safe order using expand/contract:

1. Add compatible nullable columns and define how each payload version is interpreted.
2. Deploy atomic dual writes and keep old readers working. Account for every old writer
   during rollout; do not backfill while an old writer can silently change only JSON unless
   a trigger, capture/reconciliation protocol or other guard keeps the columns synchronized.
3. Backfill in bounded restartable chunks. Derive from the row being updated atomically,
   or predicate on the version read and retry conflicts, so stale backfill cannot overwrite
   newer dual-written data.
4. Reconcile mismatches and missing values, then introduce/validate required constraints
   and indexes using the database's supported migration procedure.
5. Switch reads after verification. Retain compatible writes and payload data throughout
   the rollback window.
6. Stop redundant writes and remove payload fields only after older binaries and rollback
   requirements no longer need them.

Expansion can preserve rollback options; dropping fields or tightening constraints is not
automatically reversible. Rehearse concurrent edits during backfill, restart after failure,
and rollback to the previous application version (`architecture-refactoring-paths`).
