# Fencing tokens

## The two-writer sequence, drawn out

One lock service, one 30-second lease, one shared file or row. Nothing here is a bug in the
lock service — it behaves exactly as specified throughout.

```text
t=0.000  A: acquire("job-42")            -> granted, lease expires t=30.000
t=0.010  A: reads the record, begins work
t=0.400  A: enters a stop-the-world pause / is descheduled / its VM is migrated
t=30.000 lock service: lease expired, key released
t=30.100 B: acquire("job-42")            -> granted, lease expires t=60.100
t=30.110 B: advances resource fence to 34 -> ACCEPTED
t=30.150 B: reads the record, begins the same work
t=42.700 A: resumes. Its lock object still says isLocked() == true. Its lease check,
             if it makes one at all, uses a value read before the pause.
t=42.701 A: writes where current fence=33 -> REJECTED; current fence is 34
t=44.000 B: writes where current fence=34 -> ACCEPTED by the resource
```

The resource rejects the stale write in this fenced sequence. Without that enforcement, both
writes could succeed. Process A may observe elapsed time after resuming, but _checking the lease
before the write_ is still insufficient: a pause can land between the check and the effect.

The pause need not be a garbage collection: a CPU-throttled container, a page fault on a
swapping host, an `fsync` on a degraded disk, a live migration, or an `IOException` retried
three times with backoff all produce the same shape.

## The fencing protocol and its four obligations

The lock service issues a **monotonically increasing number** with each grant — 33 to A, 34 to
B. Before doing work, B atomically advances the resource's current fence to 34. Every later
write is accepted only while that exact token remains current.

```text
t=30.100 B: acquire("job-42")  -> granted, token 34
t=30.110 B: claim(token=34)    -> accepted; current resource fence becomes 34
t=42.701 A: write(token=33)    -> REJECTED: current resource fence is 34
t=44.000 B: write(token=34)    -> accepted
```

All four parts are obligations:

1. **Issue.** The token must increase across grants and never repeat, including across a
   restart of the lock service. A committed Raft log index (or term/index pair), ZooKeeper
   sequential-node suffix, etcd creation revision, or durable database sequence can qualify
   when its lifecycle is specified. A Raft term alone or znode version can repeat across
   grants; `System.currentTimeMillis()` is not a fencing source. Token allocation must follow
   grant order, not a separate increment an expired holder can obtain after a newer grant.
   Define recovery across restore/recreation and counter wrap: ZooKeeper sequence suffixes are
   parent-scoped signed 32-bit counters, not an eternal global order. Do not reset token history
   while an old holder can still reach a resource that accepts it.
   Distinguish the unique owner identity used for release from the ordered fence; a random owner
   token is not ordered. Reusing a lease/session for independent tasks may reuse one logical grant.
2. **Claim.** The new holder atomically advances the resource fence before reading or doing
   expensive work. Merely receiving token 34 does not magically inform the resource.
3. **Carry.** The token travels with every write in the critical section.
4. **Enforce.** Final writes require the current fence to equal the holder's token. If holder
   35 claims while 34 works, 34 must be rejected.

State the trust boundary: these checks assume authorized participants carry grants issued for
this resource by the agreed authority. An arbitrary larger client-supplied number is not proof
of ownership. Where callers can forge tokens or target another tenant's resource, validate
authority and resource access as part of the protected protocol; trusted internal workers may
already satisfy this through existing service and database permissions.

The resource's fence history must survive the failures in scope too. Restoring an older row or
recreating a key with a cleared fence can admit an old holder even if the issuer never repeats
tokens. Preserve the watermark or establish a resource-generation/authority transition that
old holders cannot use before admitting work. Coordinate store/resource recovery; restoring
only the counter or waiting an assumed pause duration is not a universal repair.

```sql
-- Claim before work. COALESCE handles a nullable/uninitialized fence if the schema permits it.
-- Assumes an existing unique job_id row and non-negative, non-reused tokens.
UPDATE job_state
   SET fence = :token
 WHERE job_id = :id
   AND COALESCE(fence, -1) < :token;

-- Publish only if no newer holder has claimed since this holder began.
UPDATE job_state
   SET result = :result
 WHERE job_id = :id
   AND fence = :token;
-- Check affected-row semantics and unknown prior outcomes; do not proceed on an unproven claim.
```

The claim must commit before the subsequent read/compute, which must read a snapshot that includes
that claim and the relevant current state. The final ownership predicate and protected mutation
must be atomic in the resource's concurrency model; checking a fence row and later writing a
different row without a protecting transaction/lock leaves a race. SQL syntax, isolation and
affected-row reporting are engine/driver inputs, not portable guarantees from this sketch.

```java
// Conceptual: holder's half; adapt named SQL parameters to the chosen JDBC binding API.
// Omits lease handle/conditional release, retry policy, metrics and client definitions.
long token = lock.acquire("job-42");
if (jdbc.update(CLAIM_FENCE, token, jobId, token) != 1) {
    throw new LostLeaseException("claim rejected", token);
}
Result result = compute();
int updated = jdbc.update(PUBLISH_IF_CURRENT, result, jobId, token);
if (updated == 0) {
    // Stop this attempt; reconcile zero/unknown outcomes before any retry.
    throw new LostLeaseException("job-42", token);
}
```

Release is always owner-conditional, making a stale release a no-op. It is safe to attempt
that conditional release in `finally`; a bare delete is not.

A lost claim response can make a retry return zero because the fence already equals the token.
Reconcile that outcome under the ownership protocol or abort safely; do not infer another owner
solely from zero rows. A lost publish response is also ambiguous. Repeating a same-token effect
passes the fence check, so non-repeatable effects still require operation identity, deduplication
or a transactional result record. A fence orders owners; it does not deduplicate one owner's work.

Fencing orders effects after a newer claim. It does not prove that a client whose lease has
expired but has no successor is still authorized, and it cannot retract an irreversible effect
already performed. If lease validity itself is part of the invariant, validate current authority
atomically with the effect in a resource that can enforce it. Repeat-safety can satisfy a
duplicate-tolerance requirement; it does not authorize a forbidden post-expiry operation.

## Which resources can be fenced

| Resource                          | Fenceable? | Mechanism                                                                                                                     |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Your own SQL table                | Yes        | Advance fence, then require `fence = :token` on every protected write                                                         |
| Your own document store           | Usually    | Conditional update on a version/etag you control                                                                              |
| Object storage with preconditions | Depends    | Verify operation-specific ETag/position conditions or resource-native lease enforcement                                       |
| Kafka topic (transactional)       | Partly     | Producer epoch fences a _previous producer instance_, per its own protocol — it does not fence your business write            |
| Filesystem / NFS share            | Depends    | Requires a protocol whose conditional/locking semantics survive client and server failures; do not infer from POSIX API shape |
| Third-party HTTP API              | Depends    | Must atomically enforce ownership/version preconditions; an idempotency key alone deduplicates an operation, not stale owners |
| Sending an email or SMS           | No         | The side effect is external and irreversible                                                                                  |
| A message you publish             | Indirectly | Carry the fence and make the consumer/resource enforce it; publication alone does not reject stale business effects           |

The practical consequence is that fencing requires cooperation by the system that commits the
business effect. An opaque third-party or irreversible side effect often cannot provide it.

[Azure Append Block](https://learn.microsoft.com/rest/api/storageservices/append-block)
(REST version 2015-02-21 and later) supports `If-Match`, an expected append position and a lease
ID. Version/position conditions guard expected state; an active blob lease enforces lease
ownership. [Lease Blob](https://learn.microsoft.com/en-us/rest/api/storageservices/lease-blob)
does not change the ETag, so acquiring a lease alone is not an ETag claim. Every protected append
must carry the relevant condition; a stale holder must not bypass rejection by refreshing the
precondition or omitting its lease ID. Check the actual operation and service/client versions
before declaring append unfenceable or a conditional request sufficient for the invariant.

## When fencing is impossible

Choose according to the invariant, rather than treating every option as required:

1. **Make the operation idempotent** under a key derived from the work, not from the lease.
   Verify concurrent duplicate handling, key lifetime and payload conflicts. Idempotency preserves
   the same operation's effect, but has processing/storage cost and does not serialize different
   operations that can violate an invariant. Mechanics: `idempotency`.
2. **Make concurrent writers converge.** A set union or a deterministic version-order rule can
   converge. Counter deltas need unique operation identities or duplicates still overcount.
   Idempotence, commutativity and convergence are distinct — see `idempotency`.
3. **Move serialization to where it can be enforced.** Route by key with a fenced rebalance,
   use a database transaction/conditional write, or colocate ownership and mutation.
4. **Accept it as an efficiency lock and bound the damage.** Say in the design that duplicates
   are possible, name what a duplicate costs, and add detection — a reconciliation job, a
   uniqueness constraint that surfaces the second write as an error rather than as a silent
   overwrite.

## Proving it in a test

A contention-only test misses lease expiry. A deterministic protocol test can control a fake
clock and pause point; complement it with process/network faults in an isolated environment.

- **Stop the holder.** `kill -STOP <pid>` after it acquires, wait past the TTL, let a second
  process acquire and commit its resource claim, then `kill -CONT <pid>`. Assert the resource **rejected** the first process's
  write — assert on rows updated or on a rejected-token counter, never on the client's exception.
- **Partition the holder from the lock service** (a proxy that drops packets) while leaving its
  path to the resource open. This is the case a renewal watchdog cannot save, and it is the
  realistic production shape.
- **Assert at the resource**, not on the lock client's behaviour: the bug being hunted is a
  second accepted write, and the lock client cannot see it.
- Exercise stale renewal/release, token history reset, lost claim/publish responses and duplicate
  same-token effects. Include independent tasks sharing a logical owner, and recovery/key reuse
  that loses the resource watermark when those are possible. Test unauthorized cross-resource
  or invented tokens where the trust boundary permits such inputs.
  Unix `kill -STOP`/`kill -CONT <pid>` sketches apply only to controlled test
  processes; use a supported pause mechanism on other platforms.
- Delay successful grant/renewal responses beyond their usable validity, and test early regrant
  after asynchronous failover when supported by the topology. For conditional append, exercise
  a stale version/position or lease ID and assert that rejection is not bypassed by a retry.

Sources: [ZooKeeper sequence and session lifecycle](https://zookeeper.apache.org/doc/r3.7.2/zookeeperProgrammers.html)
and [PostgreSQL transaction/advisory lock scope](https://www.postgresql.org/docs/18/explicit-locking.html).
