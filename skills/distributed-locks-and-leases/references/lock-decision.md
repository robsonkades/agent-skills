# Do you need a lock, and if so which one

## Step 1 — the alternatives, with the condition that selects each

Work down this list. A lock is what remains when none of these fits.

| Alternative                 | Selecting condition                                                                                    | What it costs                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Conditional write / CAS     | The invariant is expressible in one resource version/predicate                                         | Conflict/retry semantics and hotspot contention            |
| Unique constraint           | The invariant is "at most one of these exists" — one booking per seat, one payment per idempotency key | A caught constraint violation as normal control flow       |
| Partitioned ownership       | Work can be routed by key and rebalance uses epochs/fencing (`sharding-and-partitioning`)              | Routing, recovery and a safe ownership handoff             |
| Idempotent operation        | The operation can be repeated with the same observable outcome (`idempotency`)                         | A dedup store, and its retention decision                  |
| Queue with per-key ordering | Serialisation, not exclusion, is what is wanted: one consumer per key by partition assignment          | Queue latency; ordering only _within_ a partition          |
| Doing nothing               | The race is benign: last writer wins is an acceptable outcome                                          | Saying so explicitly, in the design, so nobody adds a lock |

The single most common wrong turn is reaching for a lock when a conditional write expresses the
invariant. The database already serialises writes to a row; a lock in front of it adds a
dependency, a round trip, a TTL to guess and a failure mode the database did not have.

## Step 2 — comparing lock implementations

| Implementation                       | Held until                               | Clock-dependent?                                                  | Fencing token available                                     | Main failure mode                                                          |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Redis, single instance, `SET NX PX`  | TTL expiry, or owner-conditional release | Yes — server wall clock and client validity assumptions           | No monotonic counter unless separately designed             | Promotion can lose an unreplicated key and admit a second holder           |
| Redlock (N independent Redis)        | TTL expiry on a majority                 | Yes — and contested (below)                                       | No                                                          | Its assumptions: bounded clock drift and bounded pauses                    |
| etcd lease-backed mutex              | Unlock or attached lease expiry          | Expiry is server/quorum decided; client still has stale-work risk | Creation revision can order grants if deliberately exported | Renewal lost under partition; stale holder keeps working after regrant     |
| ZooKeeper ephemeral-sequential lock  | Delete or session expiry                 | Ensemble session timeout                                          | Sequential-node suffix can order grants                     | Client resumes after the ensemble expired its session                      |
| Database row lock (`FOR UPDATE`)     | Commit, rollback or connection loss      | **No**                                                            | Only if you add a fence column                              | Holds a transaction and a pooled connection for the whole critical section |
| DB advisory lock, transaction-scoped | Transaction end                          | **No**                                                            | Only if you add a fence column                              | Same connection cost; lock is invisible to anyone reading the schema       |
| DB advisory lock, session-scoped     | Explicit unlock or session end           | **No**                                                            | Only if you add a fence column                              | Leaks through a connection pool: the next borrower inherits the lock       |

Two structural observations from the table:

- **Database transaction locks do not use an application TTL.** Their lifetime follows the
  server transaction/session; failure detection and connection cleanup still affect how long
  waiters block. This is paid for with an open transaction/connection and the database's
  availability becoming the lock's.
- **Fencing support is a property of the lock service _and_ of your resource.** etcd and
  etcd revisions or ZooKeeper sequential-node numbers can seed a token protocol; they help
  only if the external resource atomically claims and enforces them. Redis does not attach a
  monotonic grant token, and an ad hoc `INCR` needs its own durability/atomicity analysis.

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
  Redlock, since every lease-based lock has it. His conclusion: Redlock is a reasonable
  efficiency lock and is honest about being one.

**The decision criterion, which does not require picking a winner:** ask what breaks if the
assumption fails.

```text
Treat the lock as an efficiency measure (subject to its documented assumptions) when:
- a violation costs only bounded duplicate computation or a reconciled repeat
- the operation is idempotent, or its duplicate is detectable and cheap to reconcile
Treat it as a correctness control (fencing at the resource is mandatory) when:
- a violation corrupts data, double-charges, or breaks an invariant nothing else re-checks
- the lock service establishes grant order, while the resource's claim/conditional check
  prevents stale holders; both parts and their atomic boundaries matter
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
