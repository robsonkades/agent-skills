# Domain and Persistence Paths

## Transaction Script → Domain Model

**Trigger:** the same business rule implemented in three or more scripts, diverging
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
                     compiler finds anything that bypassed the model.

7. Aggregate         Only now decide the aggregate boundary and add the
                     version column (offline-concurrency-control).
```

**Intermediate state:** a script that calls the domain type for one rule and does the rest
itself. This is fine, readable, and may persist for months.

**Where it goes wrong:** starting at step 7 — designing aggregates before the rules have
been extracted. The aggregate boundary is derived from which invariants exist, and that is
only known after step 4.

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
                     Make it package-private — the compiler enforces the
                     boundary from here on.

6. Diverge           Now, and only now, the model may change without a
                     migration, and the schema without a model change.
                     This is where the investment pays back.
```

**Stopping points that are good outcomes:** after step 3 for the one aggregate that hurt;
after step 5 for a module. A codebase where the complex aggregate uses a mapper and the CRUD
modules stay Active Record is a good final state, not an unfinished one.

**Reconstitution is the detail to get right at step 2:** loading must produce states the
public constructor forbids (a cancelled order). Use a package-private static factory; do not
weaken the public constructor (`repository-pattern`).

## Entity as API payload → boundary contract

**Trigger:** a column rename broke a client; an internal field appeared in a response; a
lazy initialisation error during serialisation (`remote-facade-and-dto`).

```text
1. Snapshot          A test asserting the CURRENT JSON shape, field by
                     field. This is the contract you must not break.

2. Introduce         A response record with exactly those fields, and a
                     projection query that produces it.

3. Switch one        One endpoint returns the record instead of the
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
into a stated contract, which is the whole risk of this migration.

## Inheritance strategy change

**Trigger:** single table's nullable columns outnumber the shared ones, or joined's
polymorphic query is too expensive at volume
(`inheritance-mapping-strategies`).

This one is a data migration, so it follows expand/contract strictly:

```text
1. Verify            No foreign key from elsewhere blocks the target
                     strategy (concrete-table only).

2. Expand            Create the new tables/columns, empty, nullable.
                     DEPLOY (schema only, no code change).

3. Dual write        Code writes both shapes. DEPLOY.

4. Backfill          Chunked, restartable, with a cursor. Verify counts
                     and a per-subtype checksum.

5. Switch reads      Mapping changes to the new strategy. DEPLOY.
                     ← Rollback from here is a deploy, because the old
                       shape is still being written.

6. Stop dual write   DEPLOY.

7. Contract          Drop the old columns/tables after a soak period.
```

Seven deploys. Each is reversible, and the only irreversible one is the last.

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

**Verification:** the optimistic-conflict rate per aggregate type, before and after. If it
did not move, the split was on the wrong line.

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

3. Bulk statements   Audit every bulk UPDATE and native query on the
                     table; add `version = version + 1`. Test it.
                     ← Skipping this silently defeats the whole exercise.

4. Carry the version Include it in read payloads (or an ETag); accept it
                     on write (or If-Match). DEPLOY.

5. Enforce           Reject writes with a missing or stale version, with
                     a 409/412 and a usable message.

6. Observe           A conflict counter per aggregate type, plus tests that
                     deterministically create stale writers. Zero production
                     conflicts may be legitimate; absence of a forced-conflict
                     test is what leaves the mechanism unproven.
```

The forced-conflict test and audit of bulk/native writes are what reveal a mechanism that exists in
mapping metadata but is bypassed on important update paths.
