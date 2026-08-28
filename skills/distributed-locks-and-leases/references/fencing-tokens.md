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
t=30.150 B: reads the record, begins the same work
t=42.700 A: resumes. Its lock object still says isLocked() == true. Its lease check,
             if it makes one at all, uses a value read before the pause.
t=42.701 A: writes the result            -> ACCEPTED by the resource
t=44.000 B: writes the result            -> ACCEPTED by the resource
```

Two writers, no exception, no log line above INFO. The lock service is not consulted at
t=42.701, because the holder has no reason to consult it — from inside process A, no time has
passed. This is why _checking the lease before the write_ is a mitigation and not a fix: the
pause can land between the check and the write, and frequently does.

The pause need not be a garbage collection: a CPU-throttled container, a page fault on a
swapping host, an `fsync` on a degraded disk, a live migration, or an `IOException` retried
three times with backoff all produce the same shape.

## The fix, and its three obligations

The lock service issues a **monotonically increasing number** with each grant — 33 to A, 34 to
B. Every write carries it. The resource keeps the highest token it has accepted for that key and
rejects anything lower.

```text
t=30.100 B: acquire("job-42")  -> granted, token 34
t=42.701 A: write(token=33)    -> REJECTED: resource has seen 34
t=44.000 B: write(token=34)    -> accepted
```

All three parts are obligations, and the one that is skipped is always the third:

1. **Issue.** The token must increase across grants and never repeat, including across a
   restart of the lock service. A Raft term or index, a ZooKeeper znode version or `zxid`, an
   etcd revision, or a database sequence all qualify. `System.currentTimeMillis()` does not.
2. **Carry.** The token travels with every write in the critical section, not once at the start.
3. **Enforce.** The resource compares and rejects. A token that is issued and passed but never
   checked provides exactly the same protection as no token: none.

```sql
-- The resource's half. The WHERE clause is the entire mechanism.
UPDATE job_state
   SET result = :result, fence = :token
 WHERE job_id = :id
   AND fence < :token;
-- 0 rows updated => a newer holder exists. Abort; do not retry with the same token.
```

```java
// Conceptual: the holder's half. Omits retry policy, metrics and the lock client.
long token = lock.acquire("job-42");            // monotonic, from the lock service
int updated = jdbc.update(FENCED_UPDATE, result, token, jobId, token);
if (updated == 0) {
    // Not an error to retry: this process is no longer the holder. Stop, and do not
    // release the lock either — releasing would free a lease someone else now owns.
    throw new LostLeaseException("job-42", token);
}
```

Note the second comment. A holder that discovers it has been fenced must **not** run a normal
`finally { lock.release(); }` with a bare delete: the key it would delete now belongs to the
successor. Release is a compare-and-delete on the owner token, making a stale release a no-op.

## Which resources can be fenced

| Resource                          | Fenceable? | Mechanism                                                                                                          |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Your own SQL table                | Yes        | A `fence` column plus `AND fence < :token` on every write                                                          |
| Your own document store           | Usually    | Conditional update on a version/etag you control                                                                   |
| Object storage with preconditions | Partly     | Compare-and-set on an entity tag; fences replacement, not append                                                   |
| Kafka topic (transactional)       | Partly     | Producer epoch fences a _previous producer instance_, per its own protocol — it does not fence your business write |
| Filesystem / NFS share            | No         | No conditional write primitive to hang a token on                                                                  |
| Third-party HTTP API              | Rarely     | Only if it exposes a conditional write or accepts an idempotency key                                               |
| Sending an email or SMS           | No         | The side effect is external and irreversible                                                                       |
| A message you publish             | No         | Fence the _consumer's_ effect instead, not the publish                                                             |

The table's practical consequence: **most resources people put a distributed lock in front of
cannot be fenced**, which is why the honest design usually ends up somewhere else.

## When fencing is impossible

In priority order:

1. **Make the operation idempotent** under a key derived from the work, not from the lease.
   Repetition then costs nothing and the lock becomes an optimisation. Mechanics: `idempotency`.
2. **Make concurrent writers converge.** A versioned last-writer-wins field, a set union, or a
   counter expressed as deltas: both writers reach the same end state in either order. Idempotent
   is not commutative — that caveat is `idempotency`.
3. **Move the exclusion to where it can be enforced.** If one owner per key is what you need,
   route by key so only one process ever handles it (`sharding-and-partitioning`). This is the
   only option in the list that actually excludes.
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
