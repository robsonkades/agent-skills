# Failure, restart, and validation

## Chunk transaction contract

A restartable chunk commits these together:

1. target mutations or a staging partition;
2. deduplication/idempotency identity;
3. source checkpoint or high-water mark;
4. accepted/rejected counts needed for reconciliation.

Advancing progress outside the data transaction creates either silent loss or duplicates after a
crash. An offset alone is unsafe if source order can change; prefer stable source identity and a
versioned input snapshot.

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

Run an interruption test at chunk boundaries and inside a chunk, then restart twice. The second
restart should be a no-op with the same final state.
