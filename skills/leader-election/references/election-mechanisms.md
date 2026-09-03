# Mechanisms, and the alternatives to electing at all

## First: the ways not to elect

An election is a capacity ceiling of one and a failover window on every deploy. Three designs
remove it entirely; check them before choosing a mechanism.

| Alternative                                              | Selecting condition                                                                              | What you give up                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Partition the work by key                                | The job is a sweep over entities and can be assigned in durable ranges/buckets                   | A rebalance protocol with fencing when membership changes (`sharding-and-partitioning`) |
| Make the job idempotent and run everywhere               | Each run converges to the same state; N concurrent runs cost only work (`idempotency`)           | Wasted duplicate work proportional to N                                                 |
| Move the singleton into a component that already has one | A broker with one consumer per partition, or a database job scheduler, already elects internally | A dependency on that component's semantics, which must be read                          |

The first is often skipped. A large reconciliation can use stable buckets or claimed ranges,
but throughput is not automatically N times higher: database contention, skew and downstream
limits remain, and naive `hash(key) % N` remaps most keys whenever N changes.

## Comparing mechanisms

| Mechanism                               | Where the decision lives                      | Fencing token                                                                                     | Typical failover                      | Adequate for                                                               |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Coordination-store lease (etcd, Consul) | A quorum-backed session/key with expiry       | A revision/index may be usable if selected monotonically and propagated                           | Remaining grant plus coordination     | Critical singleton when every sink enforces a derived term                 |
| ZooKeeper ephemeral sequential znode    | Ensemble session plus ordered contender nodes | Sequential suffix or suitable transaction ID can identify a term, with namespace/wrap assumptions | Session expiry plus watch/election    | ZooKeeper estate with a recipe and resource-side enforcement               |
| Kubernetes `Lease` object               | The API server (etcd underneath)              | Not by itself: the record holds an identity and a duration                                        | Lease duration minus renewal progress | Controller-style singletons whose work is idempotent or separately fenced  |
| ShedLock-style row with an expiry       | One row in your existing database             | No                                                                                                | `lockAtMostFor` remainder             | Scheduled jobs that are idempotent or tolerate a skipped or duplicated run |
| Database row/advisory lock held open    | A live database session                       | No, unless you add a fence column                                                                 | Connection loss detection             | Short singletons only; it pins a connection for the role's whole lifetime  |

Three things the table is saying:

- A monotonic revision is only a candidate token. The election library must return it, every
  command must carry it, and each sink must atomically reject terms older than its current one.
- Mechanisms establish who _should_ lead; none automatically fences arbitrary databases,
  object stores or external APIs.
- Failover depends on remaining lease/session detection, coordination, state recovery, warm-up
  and backlog. A mechanism and its timing configuration jointly determine it.

## ShedLock and the "don't run this twice" family, stated plainly

ShedLock is not leader election, and its own documentation is explicit that it is not a
distributed scheduler and does not promise a task runs only once. What it is: a lock **per task
execution**, stored as a row with a name, a holder and a `lock_until` timestamp, with
`lockAtMostFor` as the expiry that stops a crashed node blocking the job forever.

That expiry is a lease, and it has the lease defect: a node still executing when `lockAtMostFor`
elapses is not stopped, so a second node can start the same job while the first is still inside
it. There is no token, so nothing downstream can reject the slow one.

Consequences for configuration and design:

- Set `lockAtMostFor` from a credible upper execution bound plus margin, and instrument
  overruns. No finite value proves a hung/paused job has ended; too low creates overlap, too
  high delays recovery. For unbounded work, redesign into bounded resumable units or add
  renewal plus a separately enforced fence.
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

- [ ] The leader stops before its conservative local deadline and admits no unit that can
      outlive the remaining safe budget.
- [ ] A failed renewal never extends the conservative deadline; admission stops early enough
      to quiesce before it.
- [ ] Every externally visible write carries a fence, or the work is idempotent and re-runnable.
- [ ] `is_leader` is exported per instance, with an alert on `sum != 1` sustained.
- [ ] The lease exceeds the worst measured pause; the failover budget is written down.
- [ ] Shutdown stops admission, checkpoints/quiesces, then releases or safely expires authority.
- [ ] There is a test in which the leader is partitioned or stopped, asserting at the resource.

## Version and provider questions

- Does the API use a TTL lease, session liveness, database transaction or controller-specific
  renew deadline, and whose clock decides expiry?
- Is the returned revision monotonic across delete/recreate, failover, namespace recreation
  and integer wrap for the system's lifetime?
- Does graceful shutdown release immediately, and can an orchestrator reuse the same static
  identity while the old process still lives?
- What happens when the coordination store is available to one candidate but the protected
  resource is available to another?
- Can the protected resource compare-and-set a term in the same atomic operation as the
  effect? If not, classify the singleton as best-effort.

## Primary references

- [etcd concurrency election API](https://pkg.go.dev/go.etcd.io/etcd/client/v3/concurrency)
- [Apache ZooKeeper recipes: leader election](https://zookeeper.apache.org/doc/current/recipes.html#sc_leaderElection)
- [ShedLock README and behavioral guarantees](https://github.com/lukas-krecan/ShedLock)
