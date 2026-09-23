# Domain and Persistence Paths

## Transaction Script → Domain Model

**Trigger:** duplicated business rules are diverging or interactions have outgrown scripts
(`domain-logic-organization`).

```text
1. Characterise      Tests at the use-case level for every script that
                     touches the concept. Behavioural, not structural.

2. Introduce         Create the domain type beside the entity/row. It has
                     no persistence and no callers yet.

3. Move ONE rule     Pick the rule that is duplicated most. Implement it
                     in the domain type. Have every script call it.
                     Delete the copies. SHIP.
                     ← The duplication is already gone. Stopping here is a
                       real improvement.

4. Move the rest     One rule per commit, same shape.

5. Invert            Scripts now orchestrate: load, call, save. Move the
                     transaction demarcation to the use case if it is not
                     already there.

6. Protect state     Remove the setters the moved rules depended on; the
                     compiler finds direct callers of those setters.

7. Reassess          Revisit aggregate boundaries using the extracted
                     invariants; preserve concurrency protection throughout
                     (offline-concurrency-control).
```

**Intermediate state:** a script that calls the domain type for one rule and does the rest
itself. This is fine, readable, and may persist for months.

Identify cross-record invariants and their transaction protection before moving rules;
extraction can refine this understanding. Do not postpone required concurrency protection.
Removing setters finds direct callers, not reflection, bulk SQL or every invariant bypass.

## Active Record → Data Mapper

**Trigger:** the model must diverge from the schema, or the schema is owned elsewhere and
its shape is dictating the domain (`data-source-patterns`).

```text
1. Characterise      Use-case tests. No mocking of the entity.

2. Introduce         A domain type plus a mapper, for ONE aggregate. The
                     entity remains the persistence shape.

3. One repository    One repository method returns the domain type; its
                     caller is updated. SHIP.

4. Widen             Method by method, caller by caller.

5. Contain           The entity is now reachable only from the mapper.
                     Use package/module visibility where the ORM supports
                     it, plus dependency checks and integration tests.

6. Diverge           Evolve model and schema through the mapping. Mapping
                     changes and data migrations can still be necessary.
```

**Stopping points that are good outcomes:** after step 3 for the one aggregate that hurt;
after step 5 for a module. A codebase where the complex aggregate uses a mapper and the CRUD
modules stay Active Record is a good final state, not an unfinished one.

**Reconstitution:** loading may restore valid lifecycle states that a creation factory does
not create (a cancelled order). A dedicated factory may help; validate persisted invariants
and handle invalid legacy rows explicitly (`repository-pattern`). Test identity, dirty tracking,
cascades and transaction ownership while both representations coexist. A Data Mapper does
not inherently require separate ORM and domain classes; this sequence is for that chosen design.

## Entity as API payload → boundary contract

**Trigger:** a column rename broke a client; an internal field appeared in a response; a
lazy initialisation error during serialisation (`remote-facade-and-dto`).

```text
1. Snapshot          A test asserting the CURRENT JSON shape, field by
                     field. This is the contract you must not break.

2. Introduce         A response DTO with the agreed fields and an explicit
                     mapper or projection query that produces it.

3. Switch one        One endpoint returns the DTO instead of the
                     entity. The snapshot test must still pass unchanged.
                     SHIP.

4. Widen             Endpoint by endpoint, snapshot per endpoint.

5. Enforce           An ArchUnit rule forbidding entities in the web
                     package (architecture-testing).

6. Diverge           The API and the schema can now evolve
                     independently. Add the negative assertions that
                     guard against accidental exposure.
```

**Why the snapshot comes first:** serialising an entity produces a shape nobody designed —
including fields added incidentally. Clients depend on it. Step 1 turns an accidental shape
into evidence of compatibility. Include nulls, omission, dates, errors and authorization;
a snapshot is not proof all clients were covered. Do not perpetuate exposed secrets merely
to keep a snapshot green: isolate the intentional security correction and affected contract.

Choose a record only when the target Java release and serializer support it. Records are a
standard feature from Java 16; on older targets use an ordinary DTO class. This is a boundary
representation choice, not permission to upgrade the runtime or replace an ORM entity with a
record. See [Oracle's record-class guide](https://docs.oracle.com/en/java/javase/17/language/records.html).

## Inheritance strategy change

**Trigger:** single table's nullable columns outnumber the shared ones, or joined's
polymorphic query is too expensive at volume
(`inheritance-mapping-strategies`).

For a migration requiring old/new coexistence, use these expand/contract phases:

```text
1. Verify            No foreign key from elsewhere blocks the target
                     strategy (concrete-table only).

2. Expand            Create the new tables/columns, empty, nullable.
                     DEPLOY (schema only, no code change).

3. Dual write        Code writes both shapes. DEPLOY.

4. Backfill          Chunked, restartable, with a cursor. Verify counts
                     and a per-subtype checksum.

5. Switch reads      Mapping changes to the new strategy. DEPLOY.
                     ← A binary rollback is possible only to a verified
                       compatible version while the old shape is current.

6. Stop dual write   DEPLOY.

7. Contract          Drop the old columns/tables after a soak period.
```

These are logical phases, not seven necessarily separate deploys. Step 6 starts divergence:
once new-only writes occur, switching to the old representation requires catch-up or repair
even before tables are dropped. Apply the data protocol below.

## Splitting an aggregate that is too large

**Trigger:** lock contention, `OptimisticLockException` between users editing unrelated
parts, or an unbounded load (`offline-concurrency-control`).

```text
1. Identify          Which invariants actually span the parts? Usually
                     fewer than the object graph suggests.

2. Introduce         The new root, with its own repository and version,
                     over the SAME tables. No schema change yet.

3. Move operations   Operations that touch only the new part go through
                     the new root. SHIP each.

4. Cross-aggregate   For the operations that spanned both: either accept
                     two aggregates in one transaction (both in the same
                     database — legitimate), or make one eventual with an
                     event (ddd-style, distribution-boundaries).

5. Separate versions Remove the old root's version bump for the moved
                     part. This is the step that actually relieves the
                     contention — verify with the conflict metric.
```

**Verification:** test cross-part invariants and mixed old/new writers before separating versions.
Two roots over the same rows must not bypass each other's concurrency checks. Compare conflicts,
load and work completed under comparable traffic; an unchanged rate warrants investigation,
not proof the boundary was wrong. Eventual consistency requires business acceptance of the
temporary state and failure recovery before operations move to it.
An atomic transaction alone does not protect a cross-part read predicate from concurrent
transactions. Before splitting versions, apply the invariant checks in the boundary reference's
pessimistic-to-optimistic path; test conflicting decisions that update different rows.

## Adding optimistic locking to an existing table

**Trigger:** lost updates observed in production
(`offline-concurrency-control`).

```text
1. Add the column    Add a version column using the database vendor's proven
                     online-migration sequence. `NOT NULL DEFAULT 0` may rewrite
                     or lock a large table on some engines/versions. DEPLOY.

2. Map it            `@Version` on the entity. ORM-managed updates now detect
                     concurrent modifications between load and flush, even before
                     an HTTP client carries the version. DEPLOY and observe.

3. All writers       Audit bulk/native SQL, jobs and old deployed binaries.
                     Version advancement invalidates stale readers; a write
                     based on a prior read also needs an atomic expected-version
                     predicate and affected-row check. Test both directions.

4. Carry the version Include it in read payloads (or an ETag); accept it
                     on write (or If-Match). DEPLOY.

5. Enforce           Reject writes with a missing or stale version, with
                     the documented API conflict/precondition response.

6. Observe           A conflict counter per aggregate type, plus tests that
                     deterministically create stale writers. Zero production
                     conflicts may be legitimate; absence of a forced-conflict
                     test is what leaves the mechanism unproven.
```

The forced-conflict test and audit of bulk/native writes are what reveal a mechanism that exists in
mapping metadata but is bypassed on important update paths.

Stage enforcement so every writer participates before removing older protection. A compatibility
release or controlled write pause may be needed; adding `@Version` on only new instances does not
protect against unversioned old writers. A bulk update can leave managed objects stale: clear or
refresh the affected persistence context as appropriate. Do not blindly retry stale user intent.

## Data coexistence protocol

Before using dual writes or a backfill, specify:

- One authoritative representation per phase, including deletes, generated IDs, defaults and
  subtype changes. If both writes share a transaction, verify rollback of either failure.
  Across stores, use durable change capture/outbox or another explicit recovery protocol;
  two best-effort writes plus periodic comparison do not prevent divergence.
- A restart cursor and bounded transactions. Avoid overwriting newer live writes with stale
  backfill values: use conditional/versioned writes or snapshot plus ordered change catch-up.
  Include deletes/tombstones, retry deduplication and lag limits before switching reads.
- Reconciliation of logical records and invariants, not counts alone. Checksums require a
  canonical projection and comparable snapshot/watermark; investigate mismatches before cutover.
- Mixed-version compatibility and the last phase where old data remains current. Retain the
  old representation only as long as the recovery plan requires, with an explicit owner.

### Name the oldest safe rollback version

Record the exact artifact/configuration to which each checkpoint can return. A preparatory
release may be required before activating new states or formats: V1 reads/writes only the old
format; V2 reads both but writes old; V3 writes new. After V3 writes new data, V2 may be a safe
rollback target while V1 is not. Confirm every eligible reader is prepared, including jobs,
restart/autoscaling images and supported rollback artifacts; a healthy deployment percentage
does not prove that coverage. Exercise upgrade, overlap and downgrade with data written by
each participating version.

Atomic dual writes prove that both writes commit together, not that their representations
preserve the same business meaning. Validate transformations for new subtypes, null/default
semantics, precision and deletes. If a new state cannot be represented for old readers, delay
activating it, introduce a compatible reader first, or declare the recovery boundary; do not
invent a lossy reverse mapping and label it rollback. Rehearse old-code updates too: reading a
new field successfully is insufficient if saving silently discards it.

### Authority-transfer checkpoint

When ownership moves, establish which mechanism prevents the former writer from committing
after handoff. Stop new admissions to the old path, and either drain/reconcile accepted work
before enabling the new owner or enforce a durable ownership generation at the authoritative
write boundary. The generation check must be atomic with the protected write; checking a flag
once at request entry leaves a check/write race. All writers, jobs and delayed retries must
participate. A token attached to a request without recipient enforcement provides no exclusion.

Record the last accepted old write and how the new owner catches up to it before activation.
An external side-effect recipient may not support fencing; in that case require proven drain
or a shared execution/deduplication protocol covering the same operation before overlap.
If neither can be established, keep a bounded write pause instead of promising zero downtime.
Rollback reverses the ownership transfer too: fence/drain the new writer, reconcile its accepted
work, then restore the old writer only if its data and contracts remain compatible.

Rehearse a paused old request that resumes after handoff, stale routing configuration, a retry
crossing the switch and interruption halfway through the transfer. Each must complete under
the declared authority or be rejected/reconciled without an unaccounted write. A stop signal
or a feature-flag change alone is not evidence that admitted work has stopped.

## Verified technical anchors

- [Jakarta Persistence 3.2, locking and bulk updates](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2.html):
  bulk operations bypass optimistic checks and do not synchronize the persistence context.
  The mixed-writer rollout above is a design consequence; it still needs application tests.
- [PostgreSQL 17 lock modes](https://www.postgresql.org/docs/17/explicit-locking.html): UPDATE
  takes a table ROW EXCLUSIVE lock and row locks; this is not an exclusive lock against all
  table access. Validate DDL and backfill costs for the actual engine/version and workload.
- [AWS rollback-safety account](https://d1.awsstatic.com/builderslibrary/pdfs/ensuring-rollback-safety-during-deployments.pdf),
  checked 2026-09-19: preparatory readers, writer activation and the restricted rollback target.
- [HDFS 3.4.2 HA architecture](https://hadoop.apache.org/docs/r3.4.2/hadoop-project-dist/hadoop-hdfs/HDFSHighAvailabilityWithQJM.html#Architecture),
  checked 2026-09-19: catch-up before takeover and JournalNode enforcement of a single writer
  illustrate recipient-side exclusion. This is evidence for the failure mechanism, not a
  recommendation to add Hadoop or proof that an application's flag/token provides equivalent fencing.
