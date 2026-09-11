# Understanding a Legacy System, and Migrating Its Data

## Discovering the system from production

Reconcile production observations, documentation and operator knowledge for the affected
boundary. Each has blind spots; recent traffic alone cannot disprove rare recovery contracts.

| Question                           | Where the answer is                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Which endpoints are used?          | Access logs over representative business cycles. Zero observed traffic is a deletion hypothesis, not proof                  |
| Which tables are written, by what? | Table counters show activity; audit/traces correlated with principal, application/job and time establish writer identity    |
| Which jobs run?                    | The scheduler, the crontabs, and the operations team                                                                        |
| What rules exist outside the code? | `information_schema.routines`, `triggers`, column defaults, check constraints                                               |
| What is actually slow?             | Query Store / `pg_stat_statements` totals identify aggregate cost; per-call distributions and traces identify request delay |
| Which code might be dead?          | Coverage or entry logging identifies candidates; confirm caller, periodic and recovery contracts before removal             |

```sql
-- Discovery fragments: scope results to the affected schemas/tables and their callers.
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

Characterisation records observed behaviour so a migration can detect **change**. Keep
existing assertions of known invariants; a legacy baseline does not establish that every
observed result is desired behaviour.

Partial test sketch: it needs JUnit Jupiter parameterized tests, the project's JSON assertion
library, parser and pricing fixture. Use the project's resolved versions. JUnit Jupiter
5.11.4 closes streams returned by `@MethodSource`; callers outside that lifecycle must own
the file stream's closure.

```java
@ParameterizedTest
@MethodSource("productionSamples")     // anonymised real inputs, including the odd ones
void pricing_output_is_unchanged(PricingInput input, String expectedJson) {
    assertThatJson(pricing.price(input)).isEqualTo(expectedJson);
}

static Stream<Arguments> productionSamples() throws IOException {
    // Safely captured samples covering this boundary's relevant business cycles.
    return Files.lines(Path.of("src/test/resources/pricing-samples.jsonl"))
        .map(CharacterisationSamples::parse);
}
```

Practices that make this work:

- **Sample from production, including the tails.** The interesting cases are the odd ones:
  the customer with a 40-year-old contract, the order with 900 lines, the negative quantity
  that exists because of a 2011 data fix.
- **Cover relevant periodic paths.** Include month-end or rare recovery cases that affect
  this contract, using controlled replay when live observation is impractical.
- **Capture suspected bugs**, and mark them. Preserve compatibility unless a behaviour
  change is explicitly intended; give an approved fix separate expected results and
  downstream compatibility evidence so the change remains attributable.
- **Use golden files for representative output shapes** where they help reveal unknown
  differences, alongside targeted invariant assertions. Normalize only irrelevant
  nondeterministic fields, without hiding meaningful changes.

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
on it: update support, security and performance depend on the engine and view definition.
A temporary view needs an owner and removal gates; an intentionally supported compatibility
view can remain with a tested contract and an accounted support cost.

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

Choose placement from the rule's integrity contract and actual write authority:

1. **Retain the database rule** when it remains the owner of a shared integrity contract.
   A path that avoids that table must still preserve any effects its contract requires.
2. **Move enforcement into the owning application** when all relevant writers must pass
   through it and the new transaction/failure behaviour meets the contract. Transferring
   ownership does not itself require moving every rule out of the database.
3. **Use a controlled transition** when old and new paths coexist. Characterise the rule,
   define which path enforces it, and verify trigger conditions and permissions on the
   target engine before disabling anything. Prevent bypasses and duplicate application
   of non-idempotent effects.

Inventory triggers before new writes to the affected table. In PostgreSQL 17, trigger
execution shares the triggering statement's transaction; timing, conditions and cascades
affect which rules run. Moving effects into an asynchronous path changes that failure and
atomicity contract and needs its own justification.

## Signals that the modernisation is failing

| Signal                                                       | What it means                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Nothing decommissioned across the planned first-slice window | Benefits may be deferred while coexistence cost grows; review scope and removal blockers                |
| Parallel runs with no divergence policy                      | Alerts nobody actions; the switch will not be signed                                                    |
| The new system also reads legacy tables directly             | Inspect the read contract; contain semantic differences where needed, without inventing an ACL          |
| Feature work has moved entirely to the new system            | Verify that legacy maintenance and operational support remain funded while it still serves traffic      |
| Nobody can say which system served a given request           | Routing evidence is missing, making incidents harder to attribute                                       |
| The first slice is not finished and a second started         | Check whether independent scope justifies parallelism and whether unresolved risks are being replicated |
| A temporary coexistence path has no removal owner or gates   | Establish accountability and blocking decisions; set a credible window when dependencies are known      |

## Primary references

- [PostgreSQL 17 cumulative statistics](https://www.postgresql.org/docs/17/monitoring-stats.html) — per-table counters and visibility limits.
- [PostgreSQL 17 trigger behaviour](https://www.postgresql.org/docs/17/trigger-definition.html) — transaction, timing and cascading effects.
- [PostgreSQL 17 views](https://www.postgresql.org/docs/17/sql-createview.html) — update and security conditions for compatibility views.
- [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — atomic source intent and duplicate handling.
- [Fowler, Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html) — incremental replacement and coexistence.
- [JUnit 5.11.4 MethodSource](https://docs.junit.org/5.11.4/api/org.junit.jupiter.params/org/junit/jupiter/params/provider/MethodSource.html) — parameter sources; its [parameterized-test implementation](https://github.com/junit-team/junit5/blob/r5.11.4/junit-jupiter-params/src/main/java/org/junit/jupiter/params/ParameterizedTestExtension.java) consumes argument streams through `flatMap`, which closes them.
- [Java 16 Stream.toList](<https://docs.oracle.com/en/java/javase/16/docs/api/java.base/java/util/stream/Stream.html#toList()>) — API availability and unmodifiable result.
