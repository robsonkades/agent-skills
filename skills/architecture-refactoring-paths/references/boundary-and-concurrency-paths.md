# Boundary and Concurrency Paths

## In-process module → remote service

**Trigger:** a driver from `distribution-boundaries` — independent deployment, divergent
scaling, fault isolation, team ownership. Not "microservices".

```text
1. Own the data      All access to the module's tables goes through the
                     module. Enforce it (architecture test on package
                     access, or a schema permission).
                     ← MOST of the work, and it improves the monolith
                       whether or not the extraction happens.

2. Interface         Introduce the intended boundary interface with an
                     in-process implementation. No behaviour change.

3. Coarsen           Reduce the call count per use case to what is
                     acceptable over a network. Measure it
                     (remote-facade-and-dto).

4. Observe           Run for a period that covers representative releases,
                     load and failure modes. Repeated lockstep edits are
                     evidence that the boundary may be misplaced or its
                     contract too fine-grained; investigate before extraction.

5. Remote adapter    Preserve the business contract but define deadlines,
                     unknown outcomes, retries and idempotency explicitly.
                     Route stable resource/tenant cohorts; prevent old and
                     new paths becoming competing authorities.

6. Move the data     When ownership and catch-up are proven. Use the data
                     coexistence protocol in the persistence reference.
```

**Rollback story:** through step 5, switching back can be a flag if writes remain compatible and
the old implementation is still deployable. After step 6 it is a data migration, which is why the
observation period must cover the risks that actually drive the extraction.

Before step 5, identify local transactions that cross the proposed boundary. Preserve their
invariants with an explicit distributed protocol or retain the local boundary. A matching
method signature does not make network failures equivalent to local calls.

**Verification:** test supported overlapping versions, failure isolation and independent normal
releases. An occasional ordered compatibility migration does not prove a distributed monolith;
routine lockstep feature changes are evidence to investigate (`enterprise-architecture-smells`).

## Server session → stateless

**Trigger:** a rolling deploy logs users out; sticky routing blocks scaling; the second
replica breaks a flow (`session-state-strategies`).

```text
1. Inventory         Inspect code and privacy-safe key/type/size telemetry
                     over representative flows and session lifetimes.
                     Do not log tokens, values or personal data.

2. Remove derived    Recompute only when the conversation's contract and
                     acceptable latency/load are preserved. Keep needed
                     snapshots or an explicitly bounded cache. SHIP.

3. Identity out      Move only stable, bounded identity claims to a signed
                     token, or use an opaque reference when revocation,
                     confidentiality or claim freshness requires server-side
                     lookup. Define expiry and key rotation. SHIP.

4. Valuable state    In-progress work to a table with an expiry, a
                     version and a sweeper. SHIP per flow.

5. Remainder         Small and transient: an external store with a TTL, or
                     a conscious decision to keep sticky routing for it.

6. Remove stickiness Then verify: kill an instance under load and confirm
                     no conversation breaks.
```

A quoted price fixed until expiry is workflow state, even if a price can be recomputed today.
Preserve the accepted snapshot or enough versioned inputs to reproduce it. Test a source-data
change between conversation steps before deleting the old session value.

Externalizing sessions can be a useful containment step when continuity is urgent, but does
not make session content suitable for long-term storage. Prove serialization compatibility,
TTL, concurrent updates and store-failure behavior. Define how active old sessions are drained,
expired or migrated before new nodes require the new format. Stateless application instances
can still depend on server-side identity or workflow state.

## Pessimistic → optimistic locking

**Trigger:** measured contention or long-held work (`offline-concurrency-control`). First
distinguish transaction-scoped database locks from application lock-table leases. Crashed-client
leases may require expiry; database lock release follows transaction/session termination.
The lock-table cleanup steps below apply only when such a table exists.

Inventory what the lock protects before replacing it: stale writes to one row, or an invariant
over several rows or a predicate (including concurrent inserts/deletes). Independent row versions
do not prevent write skew: two transactions may change different rows after reading the same
invariant and both pass their version checks. Retain the lock, or establish a protocol every
relevant writer participates in: for example, an atomically checked shared guard version, or
engine-verified serializable transactions with whole-transaction retry. A guard works only if
all mutations affecting the predicate participate, including new rows. Force the conflicting
interleaving before removing protection. PostgreSQL 17's [isolation documentation](https://www.postgresql.org/docs/17/transaction-iso.html)
illustrates serialization anomalies and retry requirements; verify the actual engine's semantics.

```text
1. Measure           Contention, critical-section duration and cost of lost
                     work. A lock suppresses conflicts, so near-zero
                     detections cannot predict unlocked behavior. Compare
                     options before assuming optimism improves throughput.

2. Add versioning    In parallel with the existing lock. Nothing changes
                     until every writer advances/checks versions and the
                     protected read/write interval is understood. DEPLOY.

3. Observe           Meter conflict detections while the lock is still
                     held. Investigate stale pre-lock reads, bypassing
                     writers and lock scope rather than inferring a single
                     cause from the count. Force a stale-writer test.

4. Conflict UX       Build the conflict experience: what the user sees,
                     what they can do, whether a merge is possible.
                     ← Do this BEFORE removing the lock, not after.

5. Remove the lock   One resource type at a time. Watch the conflict
                     metric and the support queue.

6. Clean up          Drop the lock table and its sweeper.
```

**Rollback:** re-enabling a lock is safe only after all writers honor it and in-flight optimistic
operations drain or participate in the same version protocol. Test overlap, not just either
mode alone. Retain required lock infrastructure until that recovery window closes.

## Synchronous call → event

**Trigger:** availability multiplying along a chain; a caller failing because a downstream
is slow; a boundary that does not need the answer
(`distribution-boundaries`).

```text
1. Establish         Can the business accept delayed completion? If the
                     result must be immediate, retain synchronous semantics.
                     Otherwise define pending, completed and failed states,
                     allowed actions and user/API behavior BEFORE cutover.

2. Publish too       Write event intent to an outbox in the transaction
                     containing the local state change. Keep the existing
                     synchronous path authoritative; no production consumer
                     executes these events yet. DEPLOY.

3. Consume           Compare using an isolated shadow sink with external
                     effects suppressed. If real effects are unavoidable,
                     prove shared operation identity and deduplication across
                     BOTH paths before execution.
                     ← Decide NOW which wins on disagreement, and who
                       investigates. Without that, the comparison
                       produces alerts nobody actions.

4. Rehearse          Lag/failure alerts, retries, duplicate and out-of-order
                     delivery, dead-letter ownership and replay. Decide which
                     pre-cutover events were already handled synchronously;
                     do not replay them as fresh business operations.

5. Switch            Transfer authority by operation/cohort and drain or
                     reconcile in-flight sync work. Activate the consumer
                     and pending-state contract together.

6. Recover/retire    A flag does not undo events or external effects. Before
                     reverting, fence competing execution and reconcile/drain
                     the backlog. Remove sync scaffolding after the tested
                     recovery window (delivery-semantics).
```

An outbox atomically couples a local state change and event intent; it does not atomically
include the old remote call. Its partial failures still require shared operation identity,
reconciliation or compensation. See [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
for the local transaction and duplicate-delivery constraints. The cutover protocol above is
a design recommendation, not a verified implementation.

## Chatty remote interface → coarse facade

**Trigger:** a screen costing many round trips; latency dominated by the network
(`remote-facade-and-dto`).

```text
1. Measure           Calls per screen, from a trace. Write the number down.

2. Add the coarse    A new endpoint serving one screen's interaction. The
   operation         old fine-grained endpoints stay. SHIP.

3. Move one client   The client uses the new endpoint. Measure again.

4. Widen             Screen by screen.

5. Deprecate         Announce the fine-grained endpoints' removal with a
                     date; monitor their usage to know when it is safe
                     (rpc-and-api-contracts).

6. Remove            After inventory and consumer migration evidence agree
                     with usage over a justified period, including dormant
                     clients, batch jobs and supported offline versions.
```

Addition reduces compatibility risk; endpoint removal is still breaking for any remaining
consumer. Validate authorization, payload size, consistency and query cost as well as call count.

## Verifying any of these is finished

| Path                        | Evidence to assess completion                                      |
| --------------------------- | ------------------------------------------------------------------ |
| Script → domain model       | Do invariant tests cover all known writers and bypass paths?       |
| Active Record → Data Mapper | Do load/save round trips and intended dependency rules pass?       |
| Entity → boundary contract  | Do compatibility and sensitive-field exclusion checks pass?        |
| Module → service            | Do overlapping versions and remote failure scenarios work?         |
| Session → stateless         | Do active flows survive instance loss and mixed-version rollout?   |
| Pessimistic → optimistic    | Do forced stale writers fail, including mixed/bulk writers?        |
| Sync → event                | Do pending, replay, duplicate and partial-failure cases work?      |
| Chatty → coarse             | Is latency improved and retirement supported by consumer evidence? |

These checks supply evidence, not universal proof. Zero production conflicts can be legitimate;
dropping a lock table is cleanup, not validation. Intentional coexistence needs ownership and
an accepted maintenance cost; unplanned coexistence warrants investigation.
