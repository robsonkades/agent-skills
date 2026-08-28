# Schema Evolution of a Hierarchy

## What each change costs

| Change                            | Single table                                                      | Joined                               | Concrete table                  |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| Add a subtype                     | `ADD COLUMN` (nullable), online in most engines                   | New table + FK + index               | New table                       |
| Remove a subtype                  | Columns become dead; delete rows by discriminator                 | Drop table after archiving           | Drop table                      |
| Add a shared field                | `ADD COLUMN`                                                      | `ADD COLUMN` on the base             | `ADD COLUMN` in **every** table |
| Add a subtype-specific field      | `ADD COLUMN` (nullable)                                           | `ADD COLUMN` on that subtype's table | `ADD COLUMN` on that table      |
| Move a field from base to subtype | Rewrite the check constraints only                                | Copy + drop across two tables        | No change to storage            |
| Move a field from subtype to base | No storage change                                                 | Copy + drop across two tables        | Add everywhere + backfill       |
| Rename a subtype class            | Update `@DiscriminatorValue` mapping only, **if** it was explicit | Table name is a rename               | Table name is a rename          |
| Split one subtype into two        | Backfill the discriminator                                        | New table + move rows                | New table + move rows           |

The row that causes the most avoidable damage is the class rename. With the default
discriminator value (the entity name), renaming `CardPayment` to `CardCapture` makes every
existing row unreadable by the ORM — a data migration triggered by a refactor. Always pin
the value:

```java
@Entity
@DiscriminatorValue("CARD")     // never changes, whatever the class is called
public class CardPayment extends Payment { }
```

## Adding a subtype safely

Under single table, the migration is additive and online, but the check constraints must
follow:

```sql
-- V27__add_wallet_payment.sql
ALTER TABLE payment ADD COLUMN wallet_provider VARCHAR(32) NULL;
ALTER TABLE payment ADD COLUMN wallet_account  VARCHAR(64) NULL;

ALTER TABLE payment ADD CONSTRAINT ck_wallet_fields CHECK (
    payment_type <> 'WALLET' OR (wallet_provider IS NOT NULL AND wallet_account IS NOT NULL));
```

Deploy order matters: the columns must exist before the code that writes them, and the
constraint must permit the rows that already exist — which it does here, because it is
conditioned on a discriminator value no row yet has.

Under joined, the new table plus its foreign key is equally additive, and there is no
constraint retrofitting because the columns are `NOT NULL` from the start.

## Migrating between strategies

This is a data migration, and it should be run expand/contract so that no deploy requires
downtime and each step is reversible.

### Single table → joined

```text
1. Create the subtype tables, empty, with FKs to payment(id).
2. Backfill in chunks:
       INSERT INTO card_payment (id, card_last4, card_scheme)
       SELECT id, card_last4, card_scheme FROM payment
        WHERE payment_type = 'CARD' AND id > :cursor
        ORDER BY id FETCH FIRST 5000 ROWS ONLY;
3. Deploy code that writes BOTH the old columns and the new tables.
4. Verify: counts and a checksum per subtype match.
5. Deploy code that reads from the new tables (the JOINED mapping).
6. After a soak period, drop the old columns and their check constraints.
```

Step 3 is what makes it safe: at every moment, both the old and new readers work, so a
rollback is a deploy rather than a restore.

### Joined → single table

The reverse, and the harder direction, because the `NOT NULL` constraints must be relaxed
into conditional checks and the subtype tables' foreign keys must be removed before their
rows can be dropped. Verify the check constraints hold on the migrated data **before**
dropping anything:

```sql
SELECT count(*) FROM payment
 WHERE payment_type = 'CARD' AND (card_last4 IS NULL OR card_scheme IS NULL);
-- must be 0 before the constraint is added and before the old table goes
```

### Either → concrete table per class

Practically only viable when nothing holds a foreign key to the base, which is usually
discovered to be false partway through. Check first:

```sql
SELECT tc.table_name, tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
 WHERE ccu.table_name = 'payment' AND tc.constraint_type = 'FOREIGN KEY';
```

Any row in that result rules the strategy out.

## When the mapping is right and the reads are still expensive

Under joined, a polymorphic list screen joins every subtype table. If the write model is
correct but that read is too slow, do not change the strategy — separate the read:

```sql
CREATE VIEW payment_summary AS
SELECT p.id, p.payment_type, p.amount, p.currency, p.created_at,
       COALESCE(c.card_last4, v.voucher_code, b.iban) AS instrument_ref
  FROM payment p
  LEFT JOIN card_payment c  ON c.id = p.id
  LEFT JOIN bank_transfer b ON b.id = p.id
  LEFT JOIN voucher_payment v ON v.id = p.id;
```

and project onto it for lists and reports. If even the view is too slow at volume, a
maintained summary table updated by the write side is the next step — with the staleness and
the maintenance cost stated explicitly (`query-objects-and-specifications`,
`architecture-and-performance`).

The general principle: the write model's mapping is chosen for integrity and invariants; the
read model is chosen for the query. Forcing one structure to serve both is where the
pressure to pick a bad inheritance strategy usually comes from.

## Verifying a hierarchy before and after a change

```java
@Test
void every_subtype_round_trips() {
    for (Payment p : List.of(aCardPayment(), aBankTransfer(), aVoucherPayment())) {
        var saved = payments.save(p);
        em.flush(); em.clear();
        Payment loaded = payments.findById(saved.id()).orElseThrow();
        assertThat(loaded).isInstanceOf(p.getClass());     // discriminator round-trips
        assertThat(loaded).usingRecursiveComparison().isEqualTo(saved);
    }
}

@Test
void polymorphic_query_returns_every_subtype() {
    assertThat(payments.findAllByOrderId(orderId))
        .extracting(Object::getClass)
        .contains(CardPayment.class, BankTransfer.class, VoucherPayment.class);
}
```

The first test catches a discriminator mismatch after a rename; the second catches a
polymorphic query that silently lost a subtype — which happens under concrete table when a
new subtype's table is not added to the UNION, and under joined when a mapping change turns
an outer join into an inner one (`architecture-testing`).
