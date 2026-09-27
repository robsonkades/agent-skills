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

## Release follows protected completion

Trace grant, protected read, effect submission, actual commit/completion and release separately.
An owner-conditional unlock can still admit a successor too early. Flushing ORM state or returning
a future does not establish that the protected effect is committed or finished.
Treat early release as a correctness finding only when it leaves the required invariant
unprotected; a resource that already enforces it may make the lease an efficiency measure.

For example, Spring Framework 6.2.0's imperative transaction interceptor invokes the target
method, then commits after that invocation returns; see
[TransactionAspectSupport](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-tx/src/main/java/org/springframework/transaction/interceptor/TransactionAspectSupport.java).
A lock released in the target method's `finally` is therefore released before that commit.
Moving the lock outside a proxied call can repair this ordering only if the call actually ends
the protected transaction: with [REQUIRED propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html),
it may join an ambient transaction that commits later. A transaction-template callback can
have the same issue. Inspect actual advice order, propagation and manager behavior; do not add
`REQUIRES_NEW` merely to move the commit because it changes the business atomicity contract.

If all effects fit one resource transaction, prefer its transaction-scoped protection when
adequate. Otherwise, keep lease ownership around the actual completing transaction, or use a
supported completion protocol covering commit, rollback and cleanup failure. A transaction
completion callback must respect the lock client's ownership/thread requirements. For async
work, attach release to the protected operation's real completion/cleanup signal, with cleanup
also on synchronous startup failure; a caller-facing timeout is insufficient. Do not convert
this into an unbounded wait or assume longer holding prevents expiry: stale-effect enforcement
is still required, and unknown commit outcomes need reconciliation before replay.

For transaction integration, pass the call graph, advisor order, ambient transaction, lock-client
ownership and observed release/commit timeline to `enterprise-transactions`; expect a boundary
that preserves the unit of work and a test of committed state. If that skill or runtime evidence
is unavailable, retain a conditional finding and specify the instrumented interleaving needed.
The source example above is version-specific evidence, not a project upgrade requirement.

### Release-boundary review cases

These are structured walkthrough cases, not executed framework integration tests.

- **Decisive pair:** an outer lease holder calls a proxied REQUIRED method and unlocks when it
  returns. In A there is no ambient transaction and the method commits before returning to the
  holder; the release order is adequate, subject to the independent expiry/fencing checks. In B
  the only change is an existing outer transaction: the call joins it and release precedes its
  final commit. If the stated exclusion must last through commit, require a completion-aware
  release or demonstrate that resource protection already covers the gap. Failing either case
  means equating method return with physical commit or prescribing a new transaction unconditionally.
- **Inner cleanup:** a proxied transactional target unlocks in its own `finally`. Pause after
  unlock but before interceptor commit, admit a successor, and inspect committed state and the
  invariant. If required exclusion is uncovered, repair the early-release window; do not simply
  increase the TTL or assume every early unlock violates an independently enforced invariant.
- **Async ambiguity:** an API returns a stage that times out while its write continues, and the
  client's terminal cleanup contract is missing. Do not certify release from the timeout stage;
  inspect the provider signal and specify the late-write test. Do not claim a stopped effect or
  invent a completed integration test when that evidence is unavailable.

## A successful reply does not restart the TTL

Inspect when the protocol starts expiry and
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
  lifetimes. Check whether method cleanup unlocks before the actual commit as well as whether
  the Redis lease can expire while the transaction is still open.
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
