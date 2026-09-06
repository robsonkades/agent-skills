# Strategy Comparison

The running example: `Payment` with `CardPayment`, `BankTransfer` and `VoucherPayment`.
SQL is PostgreSQL-style illustrative DDL; snippets omit associations, identifiers or subtype
tables where marked. Java snippets require the project's persistence API imports and mappings,
not just the shown annotations. SQL shapes below are typical, not provider guarantees.

## Single table

```sql
CREATE TABLE payment (
    id             BIGINT PRIMARY KEY,
    order_id       BIGINT NOT NULL,         -- order association/FK omitted
    payment_type   VARCHAR(20) NOT NULL,     -- discriminator
    amount         DECIMAL(19,2) NOT NULL,
    currency       CHAR(3) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    card_last4     CHAR(4)     NULL,         -- CardPayment only
    card_scheme    VARCHAR(16) NULL,         -- CardPayment only
    iban           VARCHAR(34) NULL,         -- BankTransfer only
    bic            VARCHAR(11) NULL,         -- BankTransfer only
    voucher_code   VARCHAR(32) NULL          -- VoucherPayment only
);
```

```java
@Entity
@Inheritance(strategy = SINGLE_TABLE)
@DiscriminatorColumn(name = "payment_type", discriminatorType = STRING)
public abstract class Payment { ... }

@Entity
@DiscriminatorValue("CARD")          // explicit: a class rename must not break data
public class CardPayment extends Payment { ... }
```

| Query                                   | SQL                                                |
| --------------------------------------- | -------------------------------------------------- |
| Load one by id                          | `SELECT ... FROM payment WHERE id = ?` — one table |
| All payments for an order (polymorphic) | `SELECT ... FROM payment WHERE order_id = ?`       |
| All card payments                       | `... WHERE payment_type = 'CARD'`                  |
| Insert                                  | one `INSERT`                                       |

**Recovering the lost constraints.** The columns must be nullable, but the rule can still be
enforced by the database:

```sql
ALTER TABLE payment ADD CONSTRAINT ck_card_fields CHECK (
    payment_type <> 'CARD' OR (card_last4 IS NOT NULL AND card_scheme IS NOT NULL));
ALTER TABLE payment ADD CONSTRAINT ck_transfer_fields CHECK (
    payment_type <> 'TRANSFER' OR (iban IS NOT NULL));
```

These checks enforce the shown required fields on database writes. They do not restrict
unknown discriminator values or forbid fields belonging to another subtype. Add those rules
if required, with a rolling-deploy policy for future types; application validation alone
does not protect imports or other writers.

**Indexing.** For a sparse subtype and matching predicates, consider a partial index:

```sql
CREATE INDEX ix_payment_voucher ON payment (voucher_code) WHERE payment_type = 'VOUCHER';
```

The query must imply the index predicate for PostgreSQL to use it; inspect actual plans,
including prepared statements. Column ratios such as 60 total/8 shared are not scaling
thresholds. Measure populated row width, I/O, indexes and workload; different subtype fields
may have different SQL types without requiring a strategy change.

## Class table (joined)

```sql
CREATE TABLE payment (
    id BIGINT PRIMARY KEY, amount DECIMAL(19,2) NOT NULL,
    currency CHAR(3) NOT NULL, created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE card_payment (
    id BIGINT PRIMARY KEY REFERENCES payment(id),
    card_last4 CHAR(4) NOT NULL,          -- NOT NULL is available here
    card_scheme VARCHAR(16) NOT NULL);

CREATE TABLE bank_transfer (
    id BIGINT PRIMARY KEY REFERENCES payment(id),
    iban VARCHAR(34) NOT NULL, bic VARCHAR(11) NULL);
```

| Query                 | SQL                                                                        |
| --------------------- | -------------------------------------------------------------------------- |
| Load one card payment | `payment JOIN card_payment` — one join per level                           |
| Polymorphic list      | `payment LEFT JOIN card_payment LEFT JOIN bank_transfer LEFT JOIN voucher` |
| All card payments     | `payment JOIN card_payment`                                                |
| Insert a card payment | two `INSERT`s                                                              |

Full polymorphic entity materialization can join every subtype table; the illustrative
`voucher` table is omitted above. Base-field DTO projections may avoid those joins. Capture
the provider's actual SQL and plans for both shapes before choosing a mapping.

Check provider/version support for a JOINED discriminator. A stored type can help a base-only
summary identify the subtype; it does not remove joins needed to load subtype attributes.
A projection without subtype information does not require a discriminator.

**What you buy:** subtype-local `NOT NULL` and FKs. Optional fields can remain nullable.
The shown FKs alone do not ensure each abstract base row has exactly one subtype row or
prevent the same ID appearing in two sibling tables. If database-enforced completeness and
exclusivity are required, design that enforcement and test raw SQL paths too.

## Concrete table per class

```sql
CREATE TABLE card_payment   (id BIGINT PRIMARY KEY, amount ..., currency ..., card_last4 ...);
CREATE TABLE bank_transfer  (id BIGINT PRIMARY KEY, amount ..., currency ..., iban ...);
```

| Query             | SQL                                                                    |
| ----------------- | ---------------------------------------------------------------------- |
| Load one by id    | Which table? A `UNION ALL` over all of them, or the type must be known |
| Polymorphic list  | `UNION ALL` over every subtype table                                   |
| All card payments | one table, no join — the one thing this strategy is good at            |

Without a base table an ordinary FK cannot reference all subtype tables. Separate subtype
FKs or a shared identity registry can provide alternatives, with extra schema and integrity
costs. A type-and-ID pair alone is not an ordinary cross-table FK.

Identifiers must be unique within an entity hierarchy. Use a provider-supported allocation
scheme such as a shared sequence; independent per-table generators can collide. Check
TABLE_PER_CLASS support and generator restrictions in the actual provider.

## Side by side

| Dimension                     | Single table                         | Joined                       | Concrete table                     |
| ----------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------- |
| Read one, type known          | 1 table                              | mapped ancestor joins        | 1 table                            |
| Read polymorphic              | 1 table                              | often subtype joins          | UNION over every subtype           |
| Insert                        | 1 statement                          | 1 per level                  | 1 statement                        |
| `NOT NULL` on subtype fields  | no (check constraint)                | yes                          | yes                                |
| FK from elsewhere to the base | yes                                  | yes                          | **no**                             |
| Add a subtype                 | columns/checks if needed             | new table + FK               | new table                          |
| Add a shared field            | ADD COLUMN                           | ADD COLUMN (base)            | ADD COLUMN in every table          |
| Schema readability            | poor at scale                        | good                         | duplicated                         |
| Best for                      | polymorphic reads, few extra columns | integrity, distinct subtypes | isolated subtypes, no polymorphism |

## Alternatives to mapping a hierarchy

**`@MappedSuperclass`** — shared mapping without polymorphism. Correct for audit fields and
shared identifiers; there is no base table or JPQL entity root for the mapped superclass.
The Spring Data audit annotations below additionally require auditing to be enabled and
listeners configured; `@MappedSuperclass` does not populate timestamps:

```java
@MappedSuperclass
public abstract class Auditable {
    @CreatedDate  private Instant createdAt;
    @LastModifiedDate private Instant updatedAt;
}
```

**Composition instead of subtyping** — when the difference is data, not behaviour:

```java
@Entity
public class Payment {
    @Enumerated(STRING) private PaymentMethod method;

    @Embedded private CardDetails card;          // null unless method = CARD
    @Embedded private TransferDetails transfer;  // null unless method = TRANSFER
}
```

Structurally this is single table with the columns grouped meaningfully; the gain is that
the model no longer claims a subtype relationship it does not have, and behaviour can be
attached to the `PaymentMethod` enum or to a strategy resolved from it.

**Sealed interfaces for the domain, one table for the storage** — the modern Java form when
the behaviour genuinely varies:

```java
public sealed interface PaymentInstrument permits Card, BankAccount, Voucher { }
```

Sealed types require Java 17; exhaustive pattern-switch is standard in Java 21. Keep these
as domain types rather than assuming final/sealed implementations are portable JPA entities.
Map explicitly at the persistence edge: an AttributeConverter maps one basic attribute, not
an arbitrary multi-column hierarchy. The storage can stay flat
(`patterns-and-modern-frameworks`).

## Primary sources

- [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2),
  sections 2.4, 2.13–2.14 and discriminator mappings: identity, inheritance and portability.
- [PostgreSQL 18 partial indexes](https://www.postgresql.org/docs/18/indexes-partial.html):
  predicate implication and query-plan limitations.
- [Spring Data JPA auditing](https://docs.spring.io/spring-data/jpa/reference/auditing.html):
  auditing infrastructure and listener setup for the optional timestamp example.
