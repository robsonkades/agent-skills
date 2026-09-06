# Understanding a Legacy System, and Migrating Its Data

## Discovering the system from production

Documentation is aspirational and memory is selective. Production is evidence.

| Question                           | Where the answer is                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Which endpoints are used?          | Access logs over representative business cycles. Zero observed traffic is a deletion hypothesis, not proof                  |
| Which tables are written, by what? | Table counters show activity; audit/traces correlated with principal, application/job and time establish writer identity    |
| Which jobs run?                    | The scheduler, the crontabs, and the operations team                                                                        |
| What rules exist outside the code? | `information_schema.routines`, `triggers`, column defaults, check constraints                                               |
| What is actually slow?             | Query Store / `pg_stat_statements` totals identify aggregate cost; per-call distributions and traces identify request delay |
| Which code is dead?                | Coverage from a production-shadow run, or logging on entry to suspects                                                      |

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

These SQL queries are discovery fragments, not a complete inventory: catalog visibility
depends on privileges and engine; include routines, triggers, constraints and jobs outside
the visible schemas. PostgreSQL `pg_stat_user_tables` aggregates per-table activity and
does not identify which application wrote it.

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

Shared write authority constrains independent semantic evolution and is often substantial
work; it does not block compatible additive changes or read-only extraction.

```text
Step 1  Inventory the writers per table. Not "who should write" — who
        does. Include jobs, ETL, the reporting tool that "only reads",
        and the DBA's maintenance scripts.

Step 2  Nominate one owner per table.

Step 3  Give the other writers an API from the owner. Start with the
        lowest-volume writer; it proves the path.

Step 4  Revoke write permission at the database level. This is the step
        that makes ownership real — everything before it is a convention.

Step 5  Transfer write authority and make incompatible schema/semantic
        changes only after every remaining writer's contract is handled.
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

Partial SQL (`...` is an omitted column list), not a deployable migration. Verify locks,
privileges, constraints, triggers, ORM metadata, writes and rollback on the target database.
It can preserve selected legacy reads across a rename. Limits worth knowing before relying
on it: updatable views have restrictions in every engine; performance can differ from the
base table; and it is a compatibility layer that must eventually be removed, so it needs its
own decommissioning date.

### Dual write with reconciliation

When the new model needs a different shape and both must work:

```text
1. New shape exists, empty. DEPLOY.
2. Write both, read old. Both writes in ONE transaction where possible;
   where not, atomically commit the old write and its outbox intent in
   the SAME source transaction; retry relay with idempotent destination handling.
3. Backfill history in chunks, restartable, with a cursor.
4. Reconcile continuously with an owner, repair procedure and lag bound.
   Sampling detects some defects; cutover needs coverage of required keys/invariants
   and a known catch-up watermark, including updates and deletes.
5. Read new, keep writing both. Test switching reads back against current data;
   routing rollback requires compatible old state, not merely an old binary.
6. Stop writing old. DEPLOY.
7. Drop only after retention, consumer, restore and rollback gates pass.
```

Step 4 is what makes step 5 signable. Dual-write without reconciliation diverges silently,
and the divergence is discovered by a customer.

### Backfills

```java
// Partial Spring sketch with application-specific batch/checkpoint APIs.
// Chunk size and transactions must be validated against production lock/load budgets.
long cursor = checkpoint.load();
int moved;
do {
    long batchStart = cursor;
    moved = transactionTemplate.execute(status -> {
        var batch = legacy.nextBatch(batchStart, 1000);
        if (batch.isEmpty()) return 0;
        modern.insertAll(batch.stream().map(acl::translate).toList());
        checkpoint.save(batch.lastId());
        return batch.size();
    });
    metrics.counter("backfill.rows").increment(moved);
    cursor = checkpoint.load();
} while (moved > 0);
```

Requirements: a durable cursor (so a restart resumes); idempotent insertion (a chunk may be
applied twice after a crash); a rate limit, so the backfill does not starve production; and a
metric, so its progress and its completion are observable
(`enterprise-transactions`).

Also define a stable keyset/snapshot and change-stream handoff. A cursor alone misses
updates/deletes behind it; idempotent insertion alone cannot prevent an older backfill row
overwriting a newer live write. Use comparable source versions/conditional application or
an ordered snapshot-plus-CDC protocol, including tombstones. Checkpoint and destination
writes must share the actual transaction, or recovery must tolerate replay independently.
An empty batch means that scan ended, not that live replication caught up. Preserve outbox/
CDC records until acknowledged and recoverable; atomic intent is not guaranteed eventual
delivery without relay progress, retry and retention controls.

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

| Signal                                                       | What it means                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Nothing decommissioned across the planned first-slice window | Benefits may be deferred while coexistence cost grows; review scope and removal blockers                |
| Parallel runs with no divergence policy                      | Alerts nobody actions; the switch will not be signed                                                    |
| The new system also reads legacy tables directly             | Check whether an ACL contains the dependency or legacy concepts leak into the new model                 |
| Feature work has moved entirely to the new system            | Verify that legacy maintenance and operational support remain funded while it still serves traffic      |
| Nobody can say which system served a given request           | Routing is not observable; incidents will be unresolvable                                               |
| The first slice is not finished and a second started         | Check whether independent scope justifies parallelism and whether unresolved risks are being replicated |
| The team cannot name the next decommissioning date           | There is no plan, only construction                                                                     |

## Primary references

- [PostgreSQL 17 cumulative statistics](https://www.postgresql.org/docs/17/monitoring-stats.html) — per-table counters and visibility limits.
- [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — atomic source intent and duplicate handling.
- [Fowler, Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html) — incremental replacement and coexistence.
