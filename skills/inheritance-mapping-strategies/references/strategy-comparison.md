# Strategy Comparison

The running example: `Payment` with `CardPayment`, `BankTransfer` and `VoucherPayment`.

## Single table

```sql
CREATE TABLE payment (
    id             BIGINT PRIMARY KEY,
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

This is the step that makes single table defensible for anything important, and it is
almost always skipped. It costs one constraint per subtype and it survives bulk imports,
manual fixes and other services.

**Indexing.** Subtype-specific columns are mostly null; a plain index is largely dead
weight. Use a partial/filtered index:

```sql
CREATE INDEX ix_payment_voucher ON payment (voucher_code) WHERE payment_type = 'VOUCHER';
```

**Where it stops scaling:** roughly when subtype-specific columns outnumber shared ones, or
when a subtype needs a column type incompatible with the others. A table with 60 columns of
which 8 are shared is a signal to move to joined.

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

The polymorphic list is the cost that surprises people: rendering "all payments" joins every
subtype table, and the join count grows with each new subtype. On a high-traffic list screen
this is the case to measure before committing.

A discriminator column is optional here and is worth adding anyway: it lets a polymorphic
query determine the type without the joins, which is what makes a read-model projection
possible (`schema-evolution.md`).

**What you buy:** real `NOT NULL` constraints, real foreign keys per subtype, no nullable
columns, and a schema a DBA will recognise as correct. For hierarchies where the subtypes
are large and genuinely different, this is worth the joins.

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

**The disqualifier:** no base table exists, so no other table can hold a foreign key to
`Payment`. An `order_payment` link table becomes impossible without denormalising the type
into it. Check this before considering the strategy.

Identifiers must also be unique across all the tables (a shared sequence), or a polymorphic
reference is ambiguous.

## Side by side

| Dimension                     | Single table                         | Joined                       | Concrete table                     |
| ----------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------- |
| Read one, type known          | 1 table                              | 1 + depth joins              | 1 table                            |
| Read polymorphic              | 1 table                              | joins to every subtype       | UNION over every subtype           |
| Insert                        | 1 statement                          | 1 per level                  | 1 statement                        |
| `NOT NULL` on subtype fields  | no (check constraint)                | yes                          | yes                                |
| FK from elsewhere to the base | yes                                  | yes                          | **no**                             |
| Add a subtype                 | ADD COLUMN                           | new table + FK               | new table                          |
| Add a shared field            | ADD COLUMN                           | ADD COLUMN (base)            | ADD COLUMN in every table          |
| Schema readability            | poor at scale                        | good                         | duplicated                         |
| Best for                      | polymorphic reads, few extra columns | integrity, distinct subtypes | isolated subtypes, no polymorphism |

## Alternatives to mapping a hierarchy

**`@MappedSuperclass`** — shared mapping without polymorphism. Correct for audit fields and
shared identifiers; there is no base table and no polymorphic query, which is exactly right
when you never wanted one:

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

with exhaustive `switch` in the domain and a converter or a discriminator at the persistence
edge. The behaviour is polymorphic and compiler-checked; the storage stays flat
(`patterns-and-modern-frameworks`).
