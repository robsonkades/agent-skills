---
name: online-database-schema-migrations
description: >-
  Planning and reviewing same-engine relational schema rollouts while old and new
  application versions coexist. Use for a hot-table column or constraint change,
  resumable backfill, migration-runner failure, read/write cutover, or contraction
  with a defined rollback boundary. Covers DDL execution risk and data correctness;
  not cross-engine migration, ingestion throughput tuning, or API/event schemas.
---

# Online Database Schema Migrations

## Purpose and boundary

Produce a rollout whose intermediate states are usable and whose recovery actions match
the data already written. Online means the agreed workload remains within its availability
budget; it does not mean lock-free, free of rewrites, or reversible by redeploying any old binary.

This skill owns the operational rollout within one relational engine. For conceptual
refactoring sequences, use `architecture-refactoring-paths`; for ingestion mechanism and
chunk/replay implementation, use `database-bulk-loading`. Cross-engine selection and cutover
belong to `database-engine-selection-and-migration`, and API/event wire compatibility to
`schema-evolution-and-compatibility`. Use `postgresql-performance`, `mysql-innodb-performance`
or `sql-server-performance` for engine diagnosis and tuning, and `database-index-design`
when the question is which index to build. These are optional handoffs, not prerequisites.

## Establish the execution contract

Inspect the existing schema, migrations, deployment manifests and writer code before choosing
a sequence. Record the evidence relevant to this change:

- Exact engine version, edition/service variant, table size/shape, indexes, constraints,
  triggers, partitioning, replication and read routing. Include long transactions and
  dependent views, jobs, CDC consumers or reports that will see the new shape.
- Runner version, database plugin/driver, effective transaction settings, history schema,
  checksum/validation policy, deployment concurrency and recovery conventions.
- Current, overlapping and rollback application artifacts; every writer, including batch
  jobs, native SQL, retries and images that autoscaling or recovery can restart. Inspect
  positional inserts, `SELECT *`, ORM schema validation and cached statement/result mappings.
- Required data invariant, acceptable write pause and latency/replica-lag budgets, resource
  headroom, rollback window, recovery-point objective and tested restore capability.

There is no Java baseline imposed here. Preserve the project's compiler/runtime, framework
and driver versions; a database change does not authorize upgrading them. For a widened type,
inspect Java mappings, serialization and arithmetic as well as SQL storage.

If evidence is missing, draft the compatible phases and identify the unresolved gate. Do not
invent lock duration, a supported online algorithm, or a safe rollback target. A plan/review
does not authorize applying SQL to a live database; preserve existing task authorization.

## Design the rollout

1. **Define compatibility per phase.** List the schema, authoritative representation,
   permitted reader/writer artifacts, enabled value domain and oldest safe rollback artifact.
   Test old code against new data, including an old-code update that might erase a new field.
   Adding a nullable column is not automatically compatible with every client.
2. **Choose expansion and execution boundaries.** Compare direct DDL with an additive
   replacement or a bounded maintenance window using actual lock/rewrite evidence. Separate
   short metadata changes, nontransactional operations and long validation/backfill work.
   Read [DDL and runner control](references/ddl-and-runner-control.md) before recommending
   SQL, runner configuration, or recovery from a migration failure.
3. **Protect concurrent writes before copying.** Establish one authority. Use atomic writes
   within the same database, a verified bridge trigger, or a change-capture protocol with a
   defined start position and catch-up gate. Application dual writes cover only participating
   binaries. An old writer still running needs a bridge, replacement/drain, or a write pause.
   Include inserts, updates, deletes, key changes and delayed retries.
4. **Bound and resume the backfill.** Specify stable key/range ownership, transaction limits,
   checkpoint commit, stale-write protection and how unfinished keys are revisited. A cursor
   is progress evidence only when every earlier key is complete or durably queued. A zero-row
   conditional update can mean a race, deletion or already-correct data; account for it.
   Read the [worked rollout](references/worked-rollout.md) when a backfill races with live
   writes or the rollback boundary is unclear.
5. **Validate before changing readers or authority.** Reconcile logical values and invariants,
   not counts alone. State the snapshot/watermark and treatment of live writes, deletes,
   nulls, precision and normalization collisions. Samples and hashes provide limited evidence;
   constraints and exact comparisons may provide stronger guarantees. Resolve mismatches,
   prove future writes preserve the invariant, and check replicas and reader plans.
6. **Transfer authority deliberately.** A flag change does not drain already-admitted work.
   Prevent old writers/retries from committing after transfer, using a proven drain/write
   pause or enforcement at the write boundary. Record the final old write/catch-up point.
   Keep incompatible new values disabled while an older rollback artifact remains promised.
7. **Contract only after retiring the old contract.** Verify no supported reader, writer,
   rollback artifact or dependent object still uses it. Remove old writes/bridges and drop
   columns or constraints in distinct recoverable steps where needed. Retaining an old
   column whose values have stopped updating does not preserve application rollback.

Keep a small state record: completed operation IDs, actual schema/catalog state, runner
history state, backfill high-water mark/checkpoint, validation result and current authority.
It must allow a new operator to distinguish a completed step from an unknown outcome.

## Failure and recovery decisions

- **Lock wait or load budget exceeded:** pause new migration work; inspect blockers, active
  transactions, WAL/log space, replication and application latency. Use bounded attempts with
  backoff. Do not repeatedly queue DDL or kill arbitrary application sessions. Cancellation
  can require cleanup and may not immediately release load or locks.
- **Runner failed or disconnected:** reconcile both database state and migration history.
  An error is not proof of rollback; a success row is not proof of the intended schema.
  Resume only from a verified state. Do not use history repair, checksum acceptance or
  `IF EXISTS` to conceal an unknown partial result.
- **Backfill interrupted:** resume from committed progress after resolving an uncertain
  commit; retain the write bridge. Throttle or pause without changing data authority.
  A failed row must block its range or enter a durable exception set that blocks cutover.
- **Mismatch or uniqueness collision:** stop progression to cutover, preserve diagnostic
  examples and decide the business mapping/correction. Do not silently pick a winner,
  discard rejected rows, or treat equal counts as reconciliation.
- **Application defect before divergence:** redeploy the verified compatible artifact while
  leaving an additive schema in place. After new-only writes or unrepresentable values,
  prefer a corrective forward release or a proven reverse synchronization. A destructive
  down migration is not an application rollback.
- **Restore required:** name the recoverable point, lost or replayable accepted writes,
  dependent systems and restore duration. Prove restore in isolation. Restoring a whole
  database to undo one column change can erase unrelated work; it is a separate recovery
  decision, not a routine fallback for failed DDL.

## Rehearsal and deliverable

For a consequential rollout, use an isolated version-matched database and representative
schema/data. Exercise overlap and rollback with each permitted artifact; force a live-write
collision, interruption before/after checkpoint commit, an unknown commit response, a blocked
DDL statement and a validation mismatch. Also test a delayed old writer at authority transfer.
Do not connect a rehearsal to production by inheriting a default connection string.

Return the phases and their evidence-based gates, SQL/configuration changes requested, bounded
execution and stop conditions, and recovery for the current state. A narrow review can return
only the defective step and corrected gate. Distinguish authored plans, static/source checks,
model/example tests and actual database/application rehearsals; report unavailable runtime
proof explicitly. Documentation establishes semantics, not production duration or capacity.
