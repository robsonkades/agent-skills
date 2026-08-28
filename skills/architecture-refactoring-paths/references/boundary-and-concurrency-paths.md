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

4. Observe           Run for at least a month. Any change requiring both
                     sides edited in one commit means the boundary is
                     WRONG — and correcting it now costs a refactor.

5. Remote adapter    Same interface, remote implementation. Route a small
                     percentage of traffic; compare.

6. Move the data     Last. Until now, rollback is a configuration change.
```

**Rollback story:** through step 5, switching back is a flag. After step 6 it is a data
migration — which is why step 4's month is not optional.

**Verification that it is real:** can each side be deployed alone, today? If a release still
requires an order, the extraction produced a distributed monolith
(`enterprise-architecture-smells`).

## Server session → stateless

**Trigger:** a rolling deploy logs users out; sticky routing blocks scaling; the second
replica breaks a flow (`session-state-strategies`).

```text
1. Inventory         Log the session key set in PRODUCTION for a week.
                     The code will not tell you what an old feature left
                     behind.

2. Delete derived    Anything recomputable. Usually the largest share and
                     it needs no replacement. SHIP.

3. Identity out      Move the principal and claims to a signed token.
                     Independent of everything else and it delivers most
                     of the disposability. SHIP.

4. Valuable state    In-progress work to a table with an expiry, a
                     version and a sweeper. SHIP per flow.

5. Remainder         Small and transient: an external store with a TTL, or
                     a conscious decision to keep sticky routing for it.

6. Remove stickiness Then verify: kill an instance under load and confirm
                     no conversation breaks.
```

**Do not start at step 5.** Moving the whole session to Redis first appears to solve the
problem and preserves everything that should have been deleted — including the entity graphs
that will now break on the next deploy that changes a class.

## Pessimistic → optimistic locking

**Trigger:** lock contention, stranded locks from crashed sessions, or a pool exhausted by
held transactions (`offline-concurrency-control`).

```text
1. Measure           The actual conflict rate. If conflicts are frequent
                     AND the lost work is expensive, pessimistic is the
                     right pattern and the fix is elsewhere (its expiry,
                     its granularity). Stop here.

2. Add versioning    In parallel with the existing lock. Nothing changes
                     behaviourally; conflicts cannot occur while the lock
                     still serialises. DEPLOY.

3. Observe           Meter conflict detections. Because the lock is still
                     held, this should be near zero — a non-zero count
                     means the pessimistic lock has holes, which is
                     useful to know.

4. Conflict UX       Build the conflict experience: what the user sees,
                     what they can do, whether a merge is possible.
                     ← Do this BEFORE removing the lock, not after.

5. Remove the lock   One resource type at a time. Watch the conflict
                     metric and the support queue.

6. Clean up          Drop the lock table and its sweeper.
```

**Rollback:** through step 5, re-enabling the pessimistic lock is a flag. Keep it for a
release.

## Synchronous call → event

**Trigger:** availability multiplying along a chain; a caller failing because a downstream
is slow; a boundary that does not need the answer
(`distribution-boundaries`).

```text
1. Establish         Does the caller need the result to complete its own
                     work? If yes, this migration is wrong; coarsen or
                     cache instead.

2. Publish too       Emit the event alongside the existing synchronous
                     call, via an outbox in the same transaction. Nobody
                     consumes it yet. DEPLOY.

3. Consume           The consumer processes the event and writes to a
                     shadow/idempotent path. Compare its outcome with the
                     synchronous one.
                     ← Decide NOW which wins on disagreement, and who
                       investigates. Without that, the comparison
                       produces alerts nobody actions.

4. Switch            The consumer's path becomes authoritative; the
                     synchronous call is removed from the caller.

5. Intermediate      Make the now-visible intermediate state a real
                     business state with a name and a UI
                     ("payment pending"), not an absence.

6. Operate           Consumer lag alerting, dead-letter handling, and a
                     replay procedure. This is not optional afterwork; a
                     stuck consumer is now a silent failure
                     (delivery-semantics).
```

**The step most often skipped is 5.** Removing the synchronous call makes a state visible
that previously did not exist for users. Deciding what it is called and what users may do in
it is part of the migration, not a follow-up.

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

6. Remove            When usage is zero for a defined period.
```

Additive throughout, so no consumer is ever broken — which is what makes step 6 possible at
all.

## Verifying any of these is finished

| Path                        | The question that proves completion                              |
| --------------------------- | ---------------------------------------------------------------- |
| Script → domain model       | Can a rule be violated by any code path? Search for the setters. |
| Active Record → Data Mapper | Is the entity reachable outside the persistence package?         |
| Entity → boundary contract  | Does an architecture test forbid entities in the web layer?      |
| Module → service            | Can each side be deployed alone, today?                          |
| Session → stateless         | Does killing an instance under load break any conversation?      |
| Pessimistic → optimistic    | Is the lock table dropped, and is the conflict metric non-zero?  |
| Sync → event                | Is the intermediate state named, and is consumer lag alerted?    |
| Chatty → coarse             | Is the fine-grained endpoint's usage zero, and is it removed?    |

A migration with no answer to its question is at step 5 of the general shape, which is where
migrations stall. Two mechanisms with no removal plan is worse than either alone
(`enterprise-architecture-smells`).
