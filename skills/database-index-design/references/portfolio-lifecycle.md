# Index portfolio lifecycle

## Before adding

- Capture the application's real parameterized statement and executed plan.
- Check whether an existing index can be extended, reordered only with acceptable regressions, or
  replaced by one candidate serving several queries.
- Check constraints, child foreign keys, partition alignment, specialized predicates, and engine
  limits for key width/columns.
- Estimate index bytes, build scratch space, log/WAL generation, replication lag, and write cost.
- Define the signal expected to move: reads/buffers, rows examined, sort/spill, lookup count, lock
  footprint, or latency under the same workload.

## Safe creation

The terms are not equivalent:

- SQL Server online/resumable availability depends on operation and edition; online work still has
  boundary locks and concurrent-write/log cost.
- MySQL `INSTANT`, `INPLACE`, and `COPY` have operation-specific support; declare the algorithm and
  lock requirement so the server fails instead of silently choosing a costlier path. Metadata-lock
  waits can stall even instant DDL.
- PostgreSQL `CREATE INDEX CONCURRENTLY` uses multiple phases, can leave an invalid index after
  failure, and cannot run inside an ordinary transaction block. Verify `indisvalid`.

Canary the change where possible and stop on lock-wait, log/disk, replica-lag, or latency guardrails.

## Before removing

Collect longer than the longest business cycle and across all roles. A zero usage count can mean a
counter reset, seasonal job, use only on a replica, or a non-query role such as uniqueness or FK
support. Prefer reversible invisibility/hypothetical-plan mechanisms where the engine genuinely
supports them; SQL Server `DISABLE` discards index pages and is not equivalent to MySQL invisible
indexes.

After removal, monitor the plans and invariants the index served and retain a tested recreation
path. Do not drop several overlapping indexes at once unless the rollback can identify which one
was needed.
