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

Two writers, no exception, no log line above INFO. The lock service is not consulted at
t=42.701, because the holder has no reason to consult it — from inside process A, no time has
passed. This is why _checking the lease before the write_ is a mitigation and not a fix: the
pause can land between the check and the write, and frequently does.

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
   grants; `System.currentTimeMillis()` is not a fencing source.
2. **Claim.** The new holder atomically advances the resource fence before reading or doing
   expensive work. Merely receiving token 34 does not magically inform the resource.
3. **Carry.** The token travels with every write in the critical section.
4. **Enforce.** Final writes require the current fence to equal the holder's token. If holder
   35 claims while 34 works, 34 must be rejected.

```sql
-- Claim before work. COALESCE handles a nullable/uninitialized fence if the schema permits it.
UPDATE job_state
   SET fence = :token
 WHERE job_id = :id
   AND COALESCE(fence, -1) < :token;

-- Publish only if no newer holder has claimed since this holder began.
UPDATE job_state
   SET result = :result
 WHERE job_id = :id
   AND fence = :token;
-- 0 rows updated => claim failed, row vanished, or a newer holder exists. Distinguish and stop.
```

```java
// Conceptual: the holder's half. Omits retry policy, metrics and the lock client.
long token = lock.acquire("job-42");
if (jdbc.update(CLAIM_FENCE, token, jobId, token) != 1) {
    throw new LostLeaseException("claim rejected", token);
}
Result result = compute();
int updated = jdbc.update(PUBLISH_IF_CURRENT, result, jobId, token);
if (updated == 0) {
    // Do not publish/retry this attempt: it is no longer current.
    throw new LostLeaseException("job-42", token);
}
```

Release is always owner-conditional, making a stale release a no-op. It is safe to attempt
that conditional release in `finally`; a bare delete is not.

Fencing orders effects after a newer claim. It does not prove that a client whose lease has
expired but has no successor is still authorized, and it cannot retract an irreversible effect
already performed. If lease validity itself is part of the invariant, colocate the operation
with a transactional ownership check or make the effect repeat-safe.

## Which resources can be fenced

| Resource                          | Fenceable? | Mechanism                                                                                                                     |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Your own SQL table                | Yes        | Advance fence, then require `fence = :token` on every protected write                                                         |
| Your own document store           | Usually    | Conditional update on a version/etag you control                                                                              |
| Object storage with preconditions | Partly     | Compare-and-set on an entity tag; fences replacement, not append                                                              |
| Kafka topic (transactional)       | Partly     | Producer epoch fences a _previous producer instance_, per its own protocol — it does not fence your business write            |
| Filesystem / NFS share            | Depends    | Requires a protocol whose conditional/locking semantics survive client and server failures; do not infer from POSIX API shape |
| Third-party HTTP API              | Rarely     | Only if it exposes a conditional write or accepts an idempotency key                                                          |
| Sending an email or SMS           | No         | The side effect is external and irreversible                                                                                  |
| A message you publish             | Indirectly | Carry the fence and make the consumer/resource enforce it; publication alone does not reject stale business effects           |

The practical consequence is that fencing requires cooperation by the system that commits the
business effect. An opaque third-party or irreversible side effect often cannot provide it.

## When fencing is impossible

In priority order:

1. **Make the operation idempotent** under a key derived from the work, not from the lease.
   Repetition then costs nothing and the lock becomes an optimisation. Mechanics: `idempotency`.
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

A two-thread contention test proves nothing here: both threads are live, so the lock works.
Reproduce the stall instead.

- **Stop the holder.** `kill -STOP <pid>` after it acquires, wait past the TTL, let a second
  process acquire, then `kill -CONT`. Assert the resource **rejected** the first process's
  write — assert on rows updated or on a rejected-token counter, never on the client's exception.
- **Partition the holder from the lock service** (a proxy that drops packets) while leaving its
  path to the resource open. This is the case a renewal watchdog cannot save, and it is the
  realistic production shape.
- **Assert at the resource**, not on the lock client's behaviour: the bug being hunted is a
  second accepted write, and the lock client cannot see it.
