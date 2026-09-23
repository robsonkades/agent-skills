# Do you need a lock, and if so which one

## Step 1 — the alternatives, with the condition that selects each

Compare the alternatives that fit the actual invariant and constraints. Keep an adequate
existing transaction/lock when replacing it would add cost without improving the required outcome.

| Alternative                 | Selecting condition                                                                                    | What it costs                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Conditional write / CAS     | The invariant is expressible in one resource version/predicate                                         | Conflict/retry semantics and hotspot contention            |
| Unique constraint           | The invariant is "at most one of these exists" — one booking per seat, one payment per idempotency key | A caught constraint violation as normal control flow       |
| Partitioned ownership       | Work can be routed by key and rebalance uses epochs/fencing (`sharding-and-partitioning`)              | Routing, recovery and a safe ownership handoff             |
| Idempotent operation        | The operation can be repeated with the same observable outcome (`idempotency`)                         | A dedup store, and its retention decision                  |
| Queue with per-key ordering | Per-key dispatch fits, and consumer execution plus handoff rejects or tolerates overlapping old work   | Queue latency, per-partition ordering and recovery         |
| Doing nothing               | The race is benign: last writer wins is an acceptable outcome                                          | Saying so explicitly, in the design, so nobody adds a lock |

The single most common wrong turn is reaching for a lock when a conditional write expresses the
invariant. The database already serialises writes to a row; a lock in front of it adds a
dependency, a round trip, a TTL to guess and a failure mode the database did not have.

## Step 2 — comparing lock implementations

| Implementation                       | Held until                                                | Clock-dependent?                                                  | Fencing token available                                                                 | Main failure mode                                                          |
| ------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Redis, single instance, `SET NX PX`  | TTL expiry, or owner-conditional release                  | Yes — server wall clock and client validity assumptions           | No monotonic counter unless separately designed                                         | Promotion can lose an unreplicated key and admit a second holder           |
| Redlock (N independent Redis)        | TTL expiry on a majority                                  | Yes — and contested (below)                                       | No                                                                                      | Its assumptions: bounded clock drift and bounded pauses                    |
| etcd lease-backed mutex              | Unlock or attached lease expiry                           | Expiry is server/quorum decided; client still has stale-work risk | Creation revision can order grants if deliberately exported                             | Renewal lost under partition; stale holder keeps working after regrant     |
| ZooKeeper ephemeral-sequential lock  | Delete or session expiry                                  | Ensemble session timeout                                          | Sequential-node suffix can order grants                                                 | Client resumes after the ensemble expired its session                      |
| Database row lock (`FOR UPDATE`)     | Transaction end, including after detected connection loss | No application TTL                                                | Same-transaction writes use the database lock; external effects need their own protocol | Holds a transaction and a pooled connection for the whole critical section |
| DB advisory lock, transaction-scoped | Transaction end                                           | No application TTL                                                | No automatic external fence; a cooperative same-resource protocol can suffice           | Same connection cost; all conflicting writers must participate             |
| DB advisory lock, session-scoped     | Explicit unlock or session end                            | No application TTL                                                | No automatic external fence; own the session and participating writes                   | Leaks through a connection pool: the next borrower inherits the lock       |

Two structural observations from the table:

- **Database transaction locks do not use an application TTL.** Their lifetime follows the
  server transaction/session; failure detection and connection cleanup still affect how long
  waiters block. This is paid for with an open transaction/connection and the database's
  availability becoming the lock's.
- **Fencing support is a property of the lock service _and_ of your resource.** etcd revisions
  or ZooKeeper sequential-node numbers can seed a token protocol with lifecycle limits; they help
  only if the external resource atomically claims and enforces them. Redis does not attach a
  monotonic grant token, and an ad hoc `INCR` needs its own durability/atomicity analysis.

**Logical ownership is not a local task mutex.** In the etcd 3.5 Lock API, calls on the same
lock with the same lease are one acquisition; a second call does not exclude another task
sharing it. PostgreSQL advisory acquisition also succeeds for an already-owning session;
session-level acquisitions need matching unlocks. Intentional reentrancy is valid, but independent
tasks need distinct logical holders or local serialization. Do not share a session/lease and
infer exclusion from two successful calls. Advisory locks also rely on every conflicting writer
following the same protocol; they do not automatically block an ordinary SQL update.

**A successful reply does not restart the TTL.** Inspect when the protocol starts expiry and
how the client derives remaining validity. Redlock requires a majority and subtracts acquisition
elapsed time plus its clock-drift allowance from the requested TTL; a non-positive remainder is
not a usable grant. Measure elapsed time from before sending the acquisition, not from receipt.
For example, a 10-second TTL with 9 seconds elapsed and a 0.1-second drift allowance leaves at
most 0.9 seconds under those assumptions. Renewal must satisfy its own protocol: Redlock requires
extension on a majority within the existing validity window and accounts for elapsed time and
drift for the extension too. A late successful renewal does not establish continuous ownership;
stop work and recover/reacquire according to the implementation's contract. These local budgets
do not replace resource fencing or survive a violated timing/failover assumption.

## The Redlock disagreement, stated fairly

The dispute is about which assumptions a distributed system may make, not about arithmetic.

- **Kleppmann's position.** Redlock's safety argument depends on bounded clock drift across the
  Redis instances and on bounded process pauses at the client. Neither is provided by a JVM on
  shared infrastructure: a stop-the-world pause, a descheduled container or an NTP step
  invalidates the reasoning, and the algorithm supplies no fencing token with which the resource
  could catch the resulting stale writer. His conclusion: for correctness, use a lock service
  built on consensus _and_ fence at the resource; Redlock sits in an unhelpful middle.
- **Antirez's position.** The algorithm measures _elapsed_ time locally rather than comparing
  absolute clocks, so it tolerates offset better than the critique implies; large clock steps are
  an operational fault that can be prevented; and the fencing objection is not specific to
  Redlock, since every lease-based lock has it. He defends Redlock's correctness under its
  timing/system assumptions and disputes the critique; do not attribute an efficiency-only
  position to him.

**The decision criterion, which does not require picking a winner:** ask what breaks if the
assumption fails.

```text
Treat the lock as an efficiency measure (subject to its documented assumptions) when:
- a violation costs only bounded duplicate computation or a reconciled repeat
- the operation is idempotent, or its duplicate is detectable and cheap to reconcile
Treat it as a correctness control (the resource must enforce the invariant) when:
- a violation corrupts data, double-charges, or breaks an invariant nothing else re-checks
- the lock service establishes grant order, while the resource's claim/conditional check
  prevents stale holders; both parts and their atomic boundaries matter
- or the operation is protected by the resource's own transaction/session protocol with
  all required effects and participants inside that boundary
```

## Anti-pattern shapes to grep for

- `SETNX` with no expiry, or `SET … NX` with no `PX`/`EX`: a crash holds the lock forever.
- `jedis.del(key)` / `redisTemplate.delete(key)` in a `finally` with no owner-token comparison;
  use Redis 8.4 `DELEX ... IFEQ` or an atomic script on older versions.
- A lock acquired, then a `RestTemplate`/`RestClient` call inside the critical section whose read
  timeout is longer than the lease (or absent — `timeouts-and-deadlines`).
- A scheduled renewal task presented in a comment as the reason the lock is safe.
- `@Transactional` around a method that also takes a Redis lock: two lock scopes with different
  lifetimes, and the Redis lease can expire while the transaction is still open.
- A lock key that is a constant (`"import-lock"`) where the invariant is per entity.
- `pg_advisory_lock` (session-scoped) called on a pooled `DataSource` connection.

Also inspect owner-conditional renewal, acquisition return values, unknown timeout outcomes,
and whether cleanup preserves the original failure. A session advisory lock is a finding when
its lifetime/cleanup is unmanaged, not merely because the API name appears.

Sources: [Kleppmann's critique](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html),
[Antirez's response](https://antirez.com/news/101),
and [Redis lock acquisition/release assumptions](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/).

Ownership details: [etcd 3.5 Lock request/lease semantics](https://etcd.io/docs/v3.5/dev-guide/api_concurrency_reference_v3/)
and [PostgreSQL advisory lock reentrancy and scope](https://www.postgresql.org/docs/18/explicit-locking.html).
