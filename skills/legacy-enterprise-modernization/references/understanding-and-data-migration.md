# Understanding a Legacy System, and Migrating Its Data

## Discovering the system from production

Documentation is aspirational and memory is selective. Production is evidence.

| Question                           | Where the answer is                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Which endpoints are used?          | Access logs, a month. Endpoints with zero traffic are candidates for deletion                   |
| Which tables are written, by what? | Database audit, `pg_stat_user_tables`, SQL Server Query Store, or a trace of writing statements |
| Which jobs run?                    | The scheduler, the crontabs, and the operations team                                            |
| What rules exist outside the code? | `information_schema.routines`, `triggers`, column defaults, check constraints                   |
| What is actually slow?             | Query Store / `pg_stat_statements` by total time, not by mean                                   |
| Which code is dead?                | Coverage from a production-shadow run, or logging on entry to suspects                          |

```sql
-- Rules living in the database. Run this before believing any module inventory.
SELECT routine_schema, routine_name, routine_type
  FROM information_schema.routines
 WHERE routine_schema NOT IN ('pg_catalog','information_schema');

SELECT event_object_table, trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers;
```

A module described as "just CRUD" with four triggers on its main table is not just CRUD, and
the triggers will still fire when the new code writes to that table.

## Characterisation tests without a specification

The goal is not to assert correct behaviour — nobody knows what that is — but to detect
**change**.

```java
@ParameterizedTest
@MethodSource("productionSamples")     // anonymised real inputs, including the odd ones
void pricing_output_is_unchanged(PricingInput input, String expectedJson) {
    assertThatJson(pricing.price(input)).isEqualTo(expectedJson);
}

static Stream<Arguments> productionSamples() throws IOException {
    // Captured from production over a period covering a month-end.
    return Files.lines(Path.of("src/test/resources/pricing-samples.jsonl"))
        .map(CharacterisationSamples::parse);
}
```

Practices that make this work:

- **Sample from production, including the tails.** The interesting cases are the odd ones:
  the customer with a 40-year-old contract, the order with 900 lines, the negative quantity
  that exists because of a 2011 data fix.
- **Cover the periodic paths.** Month-end, year-end and the annual index run contain the
  rules nobody remembers.
- **Capture behaviour you believe is a bug**, and mark it. Do not fix it in the same change:
  downstream systems may depend on it, and mixing a fix with a migration makes failures
  unattributable.
- **Golden-file style comparisons** beat hand-written assertions here, because you are
  pinning a shape you do not understand yet.

## Establishing table ownership

This is the constraint that blocks everything else, and it is usually the largest piece of
work.

```text
Step 1  Inventory the writers per table. Not "who should write" — who
        does. Include jobs, ETL, the reporting tool that "only reads",
        and the DBA's maintenance scripts.

Step 2  Nominate one owner per table.

Step 3  Give the other writers an API from the owner. Start with the
        lowest-volume writer; it proves the path.

Step 4  Revoke write permission at the database level. This is the step
        that makes ownership real — everything before it is a convention.

Step 5  Only now: schema changes, extraction, independent deploys.
```

Step 4 is the one that gets skipped and the one that matters. Ownership enforced by
convention is re-violated by the next urgent fix, at 2 a.m., by someone who does not know
the convention.

## Migrating a shared database

The hardest case: several applications, one schema, and no way to change everything at once.

### Views as a compatibility layer

```sql
-- The legacy application reads CLIENTE; the new model owns `customer`.
ALTER TABLE cliente RENAME TO customer;
ALTER TABLE customer RENAME COLUMN cod_cli TO id;

CREATE VIEW cliente AS
SELECT id AS cod_cli, cgc, nome AS nome_cli, ... FROM customer;
```

Buys a rename without touching the legacy application. Limits worth knowing before relying
on it: updatable views have restrictions in every engine; performance can differ from the
base table; and it is a compatibility layer that must eventually be removed, so it needs its
own decommissioning date.

### Dual write with reconciliation

When the new model needs a different shape and both must work:

```text
1. New shape exists, empty. DEPLOY.
2. Write both, read old. Both writes in ONE transaction where possible;
   where not, the new write goes through an outbox so it cannot be lost.
3. Backfill history in chunks, restartable, with a cursor.
4. Reconcile continuously: a scheduled comparison over a sample, with an
   alert on divergence and a defined owner.
5. Read new, keep writing both. ← rollback is still a deploy.
6. Stop writing old. DEPLOY.
7. Drop the old shape after the retention period.
```

Step 4 is what makes step 5 signable. Dual-write without reconciliation diverges silently,
and the divergence is discovered by a customer.

### Backfills

```java
// Chunked, restartable, observable. Never one statement over a large table.
long cursor = checkpoint.load();
int moved;
do {
    moved = transactionTemplate.execute(status -> {
        var batch = legacy.nextBatch(cursor, 1000);
        modern.insertAll(batch.stream().map(acl::translate).toList());
        checkpoint.save(batch.lastId());
        return batch.size();
    });
    metrics.counter("backfill.rows").increment(moved);
} while (moved > 0);
```

Requirements: a durable cursor (so a restart resumes); idempotent insertion (a chunk may be
applied twice after a crash); a rate limit, so the backfill does not starve production; and a
metric, so its progress and its completion are observable
(`enterprise-transactions`).

## Rules in stored procedures and triggers

Three options, in order of preference:

1. **Leave it and route around it.** The new path does not write the table the trigger is
   on. Cheapest, and it works while the legacy still writes.
2. **Replicate it in application code and disable the trigger** for the new path — only
   possible if the trigger can be made conditional, and it must be verified with a
   characterisation test of the trigger's own behaviour.
3. **Move it, at the moment ownership transfers.** The right end state, and only safe once
   one writer owns the table.

What must not happen is a new application writing a table that still has a trigger nobody
inventoried. The trigger will fire, it will apply a rule from a different era, and the
resulting data will look like a bug in the new code.

## Signals that the modernisation is failing

| Signal                                               | What it means                                                |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Nothing decommissioned in six months                 | Two architectures, both paid for. Stop building; remove one. |
| Parallel runs with no divergence policy              | Alerts nobody actions; the switch will not be signed         |
| The new system also reads legacy tables directly     | The ACL was skipped; the legacy model is spreading           |
| Feature work has moved entirely to the new system    | The legacy is now neglected, and the risk of running it grew |
| Nobody can say which system served a given request   | Routing is not observable; incidents will be unresolvable    |
| The first slice is not finished and a second started | Nothing has been learned about whether the approach works    |
| The team cannot name the next decommissioning date   | There is no plan, only construction                          |
