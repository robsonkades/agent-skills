# Schema Evolution of a Hierarchy

## What each change costs

| Change                            | Single table                                                 | Joined                                              | Concrete table                   |
| --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- | -------------------------------- |
| Add a subtype                     | Columns/checks/indexes as needed; locking is engine-specific | New table + FK + index                              | New table                        |
| Remove a subtype                  | Retire readers/writers, archive rows, then columns           | Retire subtype, handle base rows and FKs, then drop | Drop table                       |
| Add a shared field                | `ADD COLUMN`                                                 | `ADD COLUMN` on the base                            | `ADD COLUMN` in **every** table  |
| Add a subtype-specific field      | `ADD COLUMN` (nullable)                                      | `ADD COLUMN` on that subtype's table                | `ADD COLUMN` on that table       |
| Move a field from base to subtype | Relax global NOT NULL if needed; revise checks               | Copy + drop across two tables                       | Retire unused copies if desired  |
| Move a field from subtype to base | Backfill other types; revise required-field constraints      | Copy + drop across two tables                       | Add everywhere + backfill        |
| Rename a subtype class            | Preserve explicit stored discriminator and names             | Keep explicit table/entity names                    | Keep explicit table/entity names |
| Split one subtype into two        | Backfill the discriminator                                   | New table + move rows                               | New table + move rows            |

For STRING discriminators the default is the entity name, which defaults to the simple class
name. A class rename can therefore change the mapping unless the entity name or discriminator
is pinned. Preserve stored values and explicit table names; a rename need not change any data:

```java
@Entity
@DiscriminatorValue("CARD")     // never changes, whatever the class is called
public class CardPayment extends Payment { }
```

## Adding a subtype safely

Under single table the change may be additive, but locks, validation scans and compatibility
still matter. The following PostgreSQL-style DDL is illustrative, not an online guarantee:

```sql
-- V27__add_wallet_payment.sql
ALTER TABLE payment ADD COLUMN wallet_provider VARCHAR(32) NULL;
ALTER TABLE payment ADD COLUMN wallet_account  VARCHAR(64) NULL;

ALTER TABLE payment ADD CONSTRAINT ck_wallet_fields CHECK (
    payment_type <> 'WALLET' OR (wallet_provider IS NOT NULL AND wallet_account IS NOT NULL));
```

Deploy order matters: the columns must exist before the code that writes them, and the
constraint must permit the rows that already exist — which it does here, because it is
conditioned on a discriminator value no row yet has. Verify that assumption, existing type
allowlists and all deployed readers. Old ORM versions may reject unknown subtype rows: deploy
compatible readers before enabling new-type writes, or isolate those rows from old readers.

Under joined, the new table plus its foreign key is equally additive, but existing base/type constraints and old-reader behavior still need review.

## Migrating between strategies

Use expand/contract with an explicit compatibility window. It does not itself guarantee
zero downtime or reversibility; state the lock budget, failure recovery and irreversible
contract point. If safe capture is unavailable, choose an agreed write freeze.

### Single table → joined

Protocol sketch, not a runnable migration:

```text
1. Create subtype tables and required constraints.
2. Establish change capture before backfill: transactional dual writes across ALL writers
   (including old deployments/imports), or ordered CDC with a durable snapshot/log position.
3. Backfill a consistent snapshot in restartable batches. Reconcile concurrent inserts,
   updates, deletes and subtype changes; do not overwrite newer target state with old rows.
4. Catch up capture to a known position. Compare keys, fields, subtype membership and
   constraints at a stable cut; row counts alone cannot detect stale values.
5. Switch reads only after verification. Keep old/new state synchronized during rollback
   support, with one declared source of truth and conflict/idempotency rules.
6. After old readers/writers retire and the rollback window closes, remove old columns
   and obsolete constraints. Restore or forward-fix is then a separate operation.
```

Dual writes are safe only if atomic within the same database transaction or backed by a
specified durable reconciliation protocol. Inject a failure between writes and race an
update/delete with backfill. A deployed dual writer does not cover an old writer still running.

### Joined → single table

The reverse, and the harder direction, because the `NOT NULL` constraints must be relaxed
into conditional checks while references from other tables must be migrated before dropping referenced state.
Deleting a child row does not require removing its outbound FK to the base. Verify the check constraints hold on the migrated data **before**
dropping anything:

```sql
SELECT count(*) FROM payment
 WHERE payment_type = 'CARD' AND (card_last4 IS NULL OR card_scheme IS NULL);
-- must be 0 before the constraint is added and before the old table goes
```

### Either → concrete table per class

Inventory references before choosing concrete tables; preserving base references requires
an explicit redesign. Check first:

```sql
-- PostgreSQL: exact schema-qualified target; includes inheritance FKs for classification.
SELECT conrelid::regclass AS referencing_table, conname
  FROM pg_constraint
 WHERE contype = 'f' AND confrelid = 'public.payment'::regclass;
```

Classify subtype inheritance FKs separately from external references. External FKs require
redesign or a retained identity registry; they are a migration cost, not proof that no
solution exists. Inventory views, queries and application references as well.

## When the mapping is right and the reads are still expensive

If observed JOINED SQL is expensive, compare a narrow DTO projection before changing storage.
The following partial view assumes a maintained base discriminator and all three subtype
tables (not all included in the comparison DDL):

```sql
CREATE VIEW payment_summary AS
SELECT p.id, p.payment_type, p.amount, p.currency, p.created_at,
       COALESCE(c.card_last4, v.voucher_code, b.iban) AS instrument_ref
  FROM payment p
  LEFT JOIN card_payment c  ON c.id = p.id
  LEFT JOIN bank_transfer b ON b.id = p.id
  LEFT JOIN voucher_payment v ON v.id = p.id;
```

An ordinary view retains these joins; it is not precomputed and does not automatically
improve the plan. Selecting only base columns may avoid subtype joins, while this view still
needs them for `instrument_ref`. Measure the projection. If needed, a
maintained summary table updated by the write side is the next step — with the staleness and
the maintenance cost stated explicitly (`query-objects-and-specifications`,
`architecture-and-performance`).

The general principle: the write model's mapping is chosen for integrity and invariants; the
read model is chosen for the query. Forcing one structure to serve both is where the
pressure to pick a bad inheritance strategy usually comes from.

## Verifying a hierarchy before and after a change

Use the project's provider, transaction setup and real database dialect to test:

- Persist each subtype, flush/clear, then read through the root; compare stable IDs and
  mapped fields and check the semantic subtype with a provider-aware proxy strategy.
- Query a fixture containing every subtype and assert exact IDs, counts and subtype-specific
  values. Exact `Object.getClass()` checks can mistake proxies for mapping failures.
- Rename a Java class while preserving stored discriminator/table names; reload existing rows.
- Submit invalid subtype rows directly to the database to test CHECKs, required fields,
  sibling exclusivity and base-row completeness separately.
- Exercise old/new readers during subtype introduction and concurrent backfill/update/delete,
  including a dual-write failure and rollback before the contract point.

These are proposed integration cases, not executed tests. Include any hand-written UNION
views when adding a subtype; providers normally derive hierarchy queries from their mappings.

## Primary sources

- [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html):
  lock levels, constraint validation and rewrite conditions.
- [PostgreSQL 18 pg_constraint](https://www.postgresql.org/docs/18/catalog-pg-constraint.html):
  referencing and referenced relation identities.
