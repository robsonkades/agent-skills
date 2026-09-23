# Shadow validation and cutover

## Shadow phase

1. Capture an anonymized corpus containing common and edge parameters, expected results, and allowed
   nondeterminism.
2. Replay side-effect-free reads against equivalent committed data versions. Establish a common
   comparison boundary, not just an applied-change watermark. Compare row multiplicities
   (multisets), types, warnings/errors and precision; compare
   ordering only when the contract defines it, including tie-breakers. Set equality can hide a
   duplicated or missing duplicate row. Normalize only explicitly allowed differences.
3. Compare plans by work: examined rows, reads/buffers, loops, spill, log/WAL, and locks. Time alone
   confounds hardware and cache.
4. Run barrier-controlled concurrency tests for every integrity invariant.
5. Simulate restart, failover, replica lag, timeout, invalid load chunks, and interrupted DDL.

An applied watermark proves progress through a source position; it does not freeze either query's
view or exclude later commits. For example, PostgreSQL READ COMMITTED takes a new snapshot for
each statement. If the source read precedes an update and the destination read follows its
application, a correct migration can appear different. Use matched snapshot/replay boundaries,
isolated frozen copies, or version-aware comparisons that can reconstruct the required state,
including updates and deletes. Treat comparisons without a proven common boundary as inconclusive,
then retry with suitable evidence and report their coverage separately from matches/mismatches.
See [PostgreSQL 18 snapshot semantics](https://www.postgresql.org/docs/18/transaction-iso.html).

Bound shadow traffic and isolate credentials, session state and side effects. A `SELECT` can
invoke a writing function, consume a sequence or acquire disruptive locks; a read-like endpoint
can also send notifications. Classify these before replay. Track unmatched comparisons caused
by changing data separately from semantic mismatches; dropping all lagged samples can hide the
cases most likely to fail. Use counts and canonicalized partition checksums to locate differences,
then reconcile rows and domain invariants; equal counts alone do not establish equivalence.

## Dual-write gate

Do not dual-write unless the design defines operation identity, ordering/version conflict, partial
success, retry, repair, source of truth, reconciliation lag, and an exit condition. Prefer log/CDC
capture or one authoritative write plus replication when it gives a clearer recovery model.

CDC still needs a consistent initial snapshot tied to its starting log position, restart-safe
checkpoints, duplicate handling and transaction/order semantics. Verify that the target has
**applied** the required transactions, not merely received them. Budget log retention during
initial copy and outages, and define recovery when required history is unavailable. Inventory
DDL, deletes, triggers, sequences/identity state, large objects, jobs and permissions separately;
the selected connector may not transfer them. PostgreSQL 18 native logical replication, for
example, does not replicate DDL, sequence state or large objects; it is not a cross-engine
conversion pipeline by itself.

When CDC or downstream events change Avro, Protobuf or JSON payload contracts, use
`schema-evolution-and-compatibility` for their writer/reader rollout; assess relational DDL with
the destination's rules and project migration conventions.

## Cutover contract

Specify:

```text
freeze or replication catch-up boundary:
all writer identities and fencing/drain mechanism, including jobs, retries and old pools:
final source commit marker and destination applied marker:
destination ID-generator state/ranges and first-write validation:
pre-cutover invariant and lag checks:
traffic ramp stages and owner:
abort thresholds for correctness, error, latency, lag, and resource saturation:
reconciliation window and repair authority:
rollback point, data written after cutover, and reverse-sync method:
deadline after which rollback becomes a forward-fix:
```

Rehearse backup/restore and rollback using production-scale timing. A rollback that cannot account for
writes accepted after cutover is not a rollback plan.

After final catch-up and before opening writes, reconcile sequence/identity generators separately
from copied rows. PostgreSQL native logical replication can copy every identity/serial value while
leaving its destination sequence at the start value, causing a later generated insert to collide.
Respect increment/cycle settings, reserved ranges and ORM allocation blocks; retire stale allocators
before reseeding rather than applying `MAX(id) + 1` while they can still issue keys. Rehearse the
first generated-key writes with the actual driver/ORM and relevant concurrent allocators. A
transaction rollback is not a universal undo for this preparation: PostgreSQL `nextval` and
`setval` changes are not rolled back. Record the recovery action and repeat allocator validation
on the source after reverse-sync, before reopening source writes.

For a single-authority cutover: fence source writers, drain or resolve in-flight transactions,
record the final committed boundary, apply through it and reconcile, then enable destination
writes. Route changes alone do not stop existing connections or delayed jobs. Traffic ramps
must preserve one authority for each migrated key/partition. If returning to the source after
destination writes, first fence destination writers and reconcile/reverse-apply those writes;
switching a connection string back is insufficient. Rehearse a delayed source retry and a
destination-only write before declaring rollback safe. Explicitly identify irreversible type
or semantic transformations that require a forward repair instead.

Sources: [PostgreSQL 18 logical replication restrictions](https://www.postgresql.org/docs/18/logical-replication-restrictions.html)
and [logical decoding, replay and retained resources](https://www.postgresql.org/docs/18/logicaldecoding-explanation.html);
[sequence state and transaction behavior](https://www.postgresql.org/docs/18/functions-sequence.html).
