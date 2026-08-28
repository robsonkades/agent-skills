# Mechanisms, and the alternatives to electing at all

## First: the ways not to elect

An election is a capacity ceiling of one and a failover window on every deploy. Three designs
remove it entirely; check them before choosing a mechanism.

| Alternative                                              | Selecting condition                                                                                          | What you give up                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Partition the work by key                                | The job is a sweep over entities and can be split by a key: each instance handles `hash(key) % N == myIndex` | A rebalance protocol with fencing when N changes (`sharding-and-partitioning`) |
| Make the job idempotent and run everywhere               | Each run converges to the same state; N concurrent runs cost only work (`idempotency`)                       | Wasted duplicate work proportional to N                                        |
| Move the singleton into a component that already has one | A broker with one consumer per partition, or a database job scheduler, already elects internally             | A dependency on that component's semantics, which must be read                 |

The first is the one people skip. A nightly reconciliation over ten million rows does not need a
leader; it needs a deterministic split of the key space and every replica taking its share —
which also makes it N times faster.

## Comparing mechanisms

| Mechanism                               | Where the decision lives           | Fencing token                                              | Typical failover                          | Adequate for                                                               |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Coordination-store lease (etcd, Consul) | A quorum-replicated key with a TTL | Yes — the key's revision is monotonic                      | Lease remainder plus a round trip         | Correctness-critical singletons, where the resource can check the revision |
| ZooKeeper ephemeral sequential znode    | The ensemble's session state       | Yes — znode version / `zxid`                               | Session timeout plus a watch notification | The same, in a ZooKeeper-shaped estate                                     |
| Kubernetes `Lease` object               | The API server (etcd underneath)   | Not by itself: the record holds an identity and a duration | Lease duration minus renewal progress     | Controller-style singletons whose work is idempotent or separately fenced  |
| ShedLock-style row with an expiry       | One row in your existing database  | No                                                         | `lockAtMostFor` remainder                 | Scheduled jobs that are idempotent or tolerate a skipped or duplicated run |
| Database row/advisory lock held open    | A live database session            | No, unless you add a fence column                          | Connection loss detection                 | Short singletons only; it pins a connection for the role's whole lifetime  |

Two things the table is saying:

- **Only the top two hand you a fencing token for free.** Everything else establishes who _should_
  lead and leaves enforcement to you — a fence column on the table the leader writes.
- **The failover column is dominated by the lease**, not by the election. Choosing a mechanism
  does not choose your failover time; choosing a lease duration does.

## ShedLock and the "don't run this twice" family, stated plainly

ShedLock is not leader election, and its own documentation is explicit that it is not a
distributed scheduler and does not promise a task runs only once. What it is: a lock **per task
execution**, stored as a row with a name, a holder and a `lock_until` timestamp, with
`lockAtMostFor` as the expiry that stops a crashed node blocking the job forever.

That expiry is a lease, and it has the lease defect: a node still executing when `lockAtMostFor`
elapses is not stopped, so a second node can start the same job while the first is still inside
it. There is no token, so nothing downstream can reject the slow one.

Consequences for configuration and design:

- Set `lockAtMostFor` **above the job's worst observed duration**, with margin. Set it too low
  and you have engineered the overlap; set it enormously high and a crashed node blocks the job
  until it elapses. Both errors are real and the first is more common.
- `lockAtLeastFor` exists for a different problem — clock skew between instances making a fast
  job runnable twice in one window — and is not a safety mechanism against overlap.
- It is adequate when a duplicate or skipped run is survivable: idempotent aggregation, a sweep
  that reconciles to the same state, a notification with its own dedup key. It is not adequate
  when a second concurrent run corrupts data — then fence at the resource, and the lock becomes
  an optimisation rather than the control.
- It does not make a `@Scheduled` method a singleton _role_. Anything long-lived — a poller
  holding a connection, a consumer, a warm cache — wants a lease-based election with renewal,
  not a per-execution lock.

## Decision block

```text
Use a coordination-store lease (etcd/ZooKeeper/Consul) when:
- a second concurrent actor would corrupt data, and the resource can check the store's
  revision as a fencing token
- you already operate the store, or the singleton is important enough to justify operating one
Use the Kubernetes Lease (or a controller framework built on it) when:
- the workload already runs on Kubernetes, the API server is an acceptable dependency, and the
  work is idempotent or fenced by its own resource
- the failover budget tolerates the lease duration, and warm-up is short
Use a ShedLock-style row when:
- the unit is a scheduled job, not a long-lived role
- a skipped or duplicated run is recoverable, and you can state what a duplicate costs
- you want no new infrastructure: the database you already have is the whole mechanism
Elect nothing when:
- the work partitions by key (sharding-and-partitioning), or is idempotent everywhere
  (idempotency) — both scale, where a leader does not
```

## Reviewing an existing election

- [ ] The leader stops on renewal failure, on a monotonic clock, before every unit of work.
- [ ] Every externally visible write carries a fence, or the work is idempotent and re-runnable.
- [ ] `is_leader` is exported per instance, with an alert on `sum != 1` sustained.
- [ ] The lease exceeds the worst measured pause; the failover budget is written down.
- [ ] Shutdown releases the lease and stops leading at SIGTERM.
- [ ] There is a test in which the leader is partitioned or stopped, asserting at the resource.
