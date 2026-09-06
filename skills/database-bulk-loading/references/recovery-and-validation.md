# Failure, restart, and validation

## Chunk transaction contract

A restartable chunk commits these together:

1. target mutations or a staging partition;
2. deduplication/idempotency identity;
3. source checkpoint or high-water mark;
4. accepted/rejected counts needed for reconciliation.

When the checkpoint shares the destination transaction, advancing it separately creates a crash
gap. External broker/file checkpoints often cannot join that commit: persist a destination-side
chunk/source identity with the data, then acknowledge externally. A crash in between causes replay,
which must be deduplicated. Fence concurrent workers or use disjoint checkpoint ownership; a
high-water mark must not advance past uncommitted lower ranges. An offset alone is unsafe if source
order can change; use stable source identity and a versioned input snapshot.

Connection loss during commit means the outcome may be unknown, not necessarily rolled back.
Reconnect and reconcile the durable chunk identity before resuming. Capture rollback/cleanup
failures without replacing the original error; close streams/statements and return pooled
connections only after transaction state is resolved or the connection is discarded. Do not
commit or reset autocommit behind a framework transaction manager.

## Partial errors

Inject one bad row in the middle of a chunk and observe:

- whether processing continues;
- update-count array contents;
- whether the transaction is aborted or remains committable;
- warning/reject visibility;
- rollback result;
- retry behavior for already accepted rows.

Do this with the exact driver and engine configuration. Driver continuation behavior and engine
transaction state are independent layers.

JDBC counts describe statement execution, not committed source rows. A nonnegative value is an
update count, `SUCCESS_NO_INFO` means success with an unknown count, and `EXECUTE_FAILED` denotes
failure when the driver continues. A shorter array can describe only the successful prefix.
Never sum sentinel values or treat an unreported suffix as committed. With `executeLargeBatch`,
read `getLargeUpdateCounts`; correlate results with the submitted batch and retain the exception
chain. Rewrites and upserts can prevent exact source-row accounting from JDBC counts alone.

## Upsert and deduplication

State the conflict key and concurrent-writer rule. PostgreSQL `ON CONFLICT`, MySQL `ON DUPLICATE KEY
UPDATE`, and SQL Server approaches do not select conflicts or lock identically. Avoid no-op updates:
they can create new row versions, fire triggers, generate log/WAL, and increase bloat.

Test two sessions racing on the same key and a table with more than one unique constraint. If order
matters, encode and compare a source sequence/version; arrival order is not a correctness rule.

## Completion assertions

At minimum reconcile:

- source, accepted, rejected, warning, duplicate, inserted, updated, and unchanged counts;
- null/type/range/domain constraints and representative samples or checksums;
- generated keys and source-to-target identity;
- statistics freshness and representative executed plans;
- replica/CDC convergence and lag recovery;
- final configuration, triggers, constraints, indexes, and durability settings.

Define mutually exclusive row dispositions (for example inserted/updated/unchanged/rejected)
and count warnings separately: one row may produce multiple warnings and still be accepted.
Document upsert affected-row semantics and deduplication before writing a reconciliation equation.
Include a lost commit acknowledgment and overlapping-worker replay in interruption scenarios.

Run an interruption test at chunk boundaries and inside a chunk, then restart twice. The second
restart should be a no-op with the same final state.

## Source

- [JDBC BatchUpdateException contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/BatchUpdateException.html)
  — continuation, sentinel counts and large-batch counts; verify the actual driver's behavior.
