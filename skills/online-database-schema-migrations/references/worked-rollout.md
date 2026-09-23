# Worked rollout: widen a live amount without stale backfill writes

Read for a concrete coexistence/backfill protocol or when determining the last safe rollback
point. This is a PostgreSQL 17 design example, not a ready production migration or a recorded
database rehearsal. SQL blocks are partial snippets; the worker is pseudocode with bound
parameters and explicit transaction requirements.

## Evidence and choice

Assume `public.invoice(id bigint PRIMARY KEY, total_cents integer NOT NULL)` with positive,
immutable IDs. It is an ordinary unpartitioned table; no RLS, additional triggers, inheritance,
logical-apply writers, external trigger effects or dependent objects complicate this example.
Applications use explicit column lists. Ordinary writes cannot disable the bridge trigger.
Existing amounts fit `integer`; future amounts may exceed that range. All reads and writes in
this example use the primary until replica readiness has been separately established.

The candidate direct integer-to-bigint alteration requires a rewrite assessment and could
exceed the measured lock budget. Suppose the project instead selects an additive column,
short lock attempts and a throttled backfill. This costs temporary storage, WAL and writes;
it is not automatically cheaper than a scheduled direct alteration. No table size, lock
duration or throughput here is a production measurement.

Three application artifacts participate:

- **A:** reads and writes `total_cents` only.
- **B:** reads `COALESCE(total_cents_v2, total_cents::bigint)` and continues writing the old
  column. Its Java mapping uses an appropriate 64-bit representation, but its accepted values
  still fit the old column. It can update data created by A and vice versa.
- **C:** reads the new column and supports an old-authority mode writing the old column and
  a new-authority mode writing only the new column. Its mode is part of the deployed artifact
  configuration and recovery record. Deploy it only after validation. Wide values remain
  disabled until authority transfers.

| Phase                           | Data authority and permitted writers                                 | Readiness/rollback                                                          |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Expand/backfill                 | Old column; A/B writers; bridge maintains new                        | A remains a candidate only after old-client compatibility tests             |
| Validated/new reads             | Old column; A/B/C in old mode; same bridge                           | B/C read new; old remains current, so tested A/B rollback is possible       |
| Transfer before resuming writes | Admissions stopped, old writers drained and prevented from returning | Last equality check; prepare C new mode and new schema requirements         |
| New-only writes                 | New column; C new mode only                                          | Old column may be stale/null immediately; A/B rollback is no longer safe    |
| Contract                        | New column; C-compatible artifacts only                              | Retire old objects after the declared recovery window and dependency checks |

## 1. Expand and cover every write

Run the following short unit through a runner that preserves its PostgreSQL transaction.
The timeout values illustrate separately bounded lock wait and statement execution; derive
real values from the service budget. Do not put the backfill inside this transaction.

```sql
BEGIN;
SET LOCAL lock_timeout = '250ms';
SET LOCAL statement_timeout = '2s';

ALTER TABLE public.invoice ADD COLUMN total_cents_v2 bigint;

CREATE FUNCTION public.invoice_total_bridge() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_cents_v2 := NEW.total_cents::bigint;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_total_bridge
BEFORE INSERT OR UPDATE ON public.invoice
FOR EACH ROW EXECUTE FUNCTION public.invoice_total_bridge();
COMMIT;
```

The bridge deliberately reasserts old authority on every insert/update, including unrelated
updates and the backfill's update. New-column-only writes are not supported in this phase;
the trigger would replace their value. It is chosen because A cannot dual write. When all
writers can be changed, atomic application dual writes are another viable choice.

DDL locks serialize expansion against table users. Test permissions, trigger firing and
runner boundaries in the target deployment. A role that bypasses triggers, another trigger
that changes these fields, or an uncovered apply path invalidates this example's coverage
proof. See [PostgreSQL 17 CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html)
and [lock modes](https://www.postgresql.org/docs/17/explicit-locking.html).

## 2. Define finite, committed progress

After expansion commits, initialize a durable progress row with job identity, immutable
`high_id = COALESCE(MAX(id), 0)`, `last_id = 0` and `done = false`. Store it in the same
database as the rows, with one unique job key. The bridge covers all later inserts, including
an insert with an ID below `last_id`; a sequence/high-water mark alone would not provide that
coverage. Changes to the transformation require a new job/progress contract.

One worker owns this progress row. For each chunk:

```text
BEGIN at READ COMMITTED; configure bounded lock/statement waits
lock the progress row FOR UPDATE; read last_id, high_id and done
if done: end transaction and stop

ids := SELECT id FROM public.invoice
       WHERE id > :last_id AND id <= :high_id
       ORDER BY id LIMIT :chunk_size FOR UPDATE
       -- no SKIP LOCKED; keep these row locks until the commit below

if ids is empty:
    set progress.last_id = high_id, progress.done = true
else:
    UPDATE public.invoice
       SET total_cents_v2 = total_cents::bigint
     WHERE id = ANY(:ids::bigint[]) AND total_cents_v2 IS NULL
    set progress.last_id = max(ids)

COMMIT data and progress together
release transaction/connection before any throttle delay
```

Use the primary-key index for bounded keyset work, no OFFSET and no unbounded application
buffer. Choose chunk size/concurrency from lock occupancy, WAL/log headroom, replica lag and
online latency; pause on agreed thresholds. A timeout/deadlock aborts the chunk and its
checkpoint; retry that unit after ending the failed transaction and applying bounded backoff.
Multiple workers require separate range ownership or a durable work queue, not racing updates
to a shared maximum cursor.

The SQL computes from the locked current row. It does not reuse an old value previously read
into Java. Locking and concurrent-update behavior follow
[PostgreSQL 17 Read Committed](https://www.postgresql.org/docs/17/transaction-iso.html).

## 3. Explain the collision and restart outcomes

For row 7, initially `(old=40, new=NULL)`, a live write wants `old=60`:

| Ordering/failure                      | Outcome required by this protocol                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Live write locks/commits first        | Bridge produces `(60,60)`; worker observes the committed row and need not copy it               |
| Worker locks/copies first             | Worker commits `(40,40)` and progress; waiting live write then produces `(60,60)`               |
| Worker loses connection before commit | Both data/progress roll back if the transaction did not commit; restart from committed progress |
| Commit succeeds but response is lost  | Reconnect and inspect/lock durable progress; do not infer rollback from the client exception    |
| Live delete before or after the chunk | Both representations disappear with the same row; the worker never inserts a stale copy         |
| Insert below the completed cursor     | Bridge initializes the new field; it does not need the historical scan                          |

If an uncertain old worker is still running, a replacement must acquire the same progress
lock with a bounded wait; reading an old checkpoint without ownership is not reconciliation.
The database decides the old transaction outcome. Idempotent replay is still required if
progress and data cannot be committed together in a different design.

Why no `SKIP LOCKED` here: if row 7 is skipped and row 8 advances the cursor to 8, row 7 will
never be revisited by this query. A final scan may reveal the gap but does not make that
checkpoint correct. Use a durable skipped-key queue/contiguous completion frontier if skipping
is necessary; completion requires empty exceptions and reconciliation.

## 4. Reconcile and change readers

`done` proves traversal under the stated writer protocol, not semantic correctness. Before
cutover, run a budgeted exact predicate over all rows, or verified key ranges with coverage
records, on the primary:

```sql
SELECT count(*) AS mismatches
FROM public.invoice
WHERE total_cents_v2 IS DISTINCT FROM total_cents::bigint;
```

Expect zero. This compares both values in the same row/snapshot; it avoids comparing unrelated
whole-table counts taken at different times. A mismatch blocks cutover and calls the bridge,
privileges or backfill assumptions into question. Do not mask it with reader fallback.
If the transform were normalization rather than widening, equality also needs the approved
canonicalization and explicit duplicate/collision handling.

Enforce future equality and completeness with a CHECK, then validate it. Each numbered SQL
operation below has its own transaction/commit and appropriate duration budget; combining
them into one transaction could retain the first operation's stronger lock for the scan.

```sql
-- Operation 1: brief metadata change, after backfill.
ALTER TABLE public.invoice ADD CONSTRAINT invoice_total_v2_ready
  CHECK (total_cents_v2 IS NOT NULL AND total_cents_v2 = total_cents::bigint)
  NOT VALID;

-- Operation 2: separate, budgeted scan; verify the constraint becomes validated.
ALTER TABLE public.invoice VALIDATE CONSTRAINT invoice_total_v2_ready;

-- Operation 3: separate lock attempt; the validated CHECK proves non-null.
ALTER TABLE public.invoice ALTER COLUMN total_cents_v2 SET NOT NULL;
```

The validated CHECK remains present for operation 3. This sequence uses the documented
[PostgreSQL 17 validation/non-null rules](https://www.postgresql.org/docs/17/sql-altertable.html).
Test the new read path and old-artifact writes, refresh statistics where needed, and inspect
new query plans/latency. Replica read cohorts wait for the required schema/data apply point.
Only then remove B's fallback where desired. Old authority and the bridge still permit the
tested old-artifact rollback.

## 5. Transfer writes and cross the recovery boundary

Deploy C in old mode, including jobs and recovery images. For this example, use a bounded write
pause: stop admissions, drain accepted requests and database transactions, prevent A/B or stale
C-old jobs from restarting, and verify zero remaining old writers. A feature flag observed
once at request entry is insufficient. If this exclusion cannot be proved, do not transfer.

With writes still paused, reconcile once more. In a short bounded transaction remove the
old-authority trigger and equality CHECK, and drop the old column's `NOT NULL` requirement
so a C new-mode insert can omit it. Keep the new column's `NOT NULL`. Record schema completion
and activate C new mode before resuming writes; test insert/update/delete through that path.
If any transfer step fails, keep writes paused and reconcile its actual state before choosing
which mode/schema combination can resume. Retain the trigger function until its use is retired.

The first new-only write makes the old column potentially stale; this is the rollback boundary,
even if the written number still fits an integer. Enabling values such as `3000000000` adds a
second incompatibility: no lossless old-integer representation exists. Do not cast/truncate
them to make an old binary work. Before new writes, an inspected reverse transfer can restore
the bridge and old schema requirements; after them, a forward C-compatible fix is usually
simpler than catch-up, and wide values can make old rollback impossible under the contract.

Contract only after the chosen recovery window, dependency audit and a test that supported
artifacts no longer refer to the old column. Dropping the old column is its own bounded DDL
operation. A backup restore would also rewind unrelated accepted writes; compare recovery
point, replay sources and restore duration before treating it as feasible recovery.

## What must be rehearsed

Use two controlled database sessions to force both row-lock orderings above. Kill a worker
before commit and separately drop its connection around commit acknowledgment; inspect data
and progress on restart. Hold a long transaction to exercise DDL lock timeout. Deliberately
introduce a mismatch in an isolated fixture to prove cutover refuses it. Pause an old write
across authority transfer and verify it cannot commit afterward. Finally test a wide value
against each proposed rollback artifact.

A model of these states can catch an incorrect cursor or stale-write rule, but cannot prove
trigger execution, SQL syntax, lock timing, driver transaction behavior, throughput or actual
database recovery. Those require the version-matched database/application rehearsal.
