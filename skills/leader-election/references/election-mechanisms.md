# Mechanisms, and the alternatives to electing at all

## First: the ways not to elect

One active worker can impose a capacity ceiling and failover gaps. These alternatives remove
the application-wide singleton or delegate coordination; they do not eliminate all ownership
changes or the need to protect concurrent effects.

| Alternative                                              | Selecting condition                                                                                       | What you give up                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Partition the work by key                                | The job is a sweep over entities and can be assigned in durable ranges/buckets                            | A rebalance protocol with fencing when membership changes (`sharding-and-partitioning`) |
| Make the job idempotent and run everywhere               | Repeated and concurrent runs preserve the invariant and their combined load is acceptable (`idempotency`) | Wasted duplicate work proportional to N                                                 |
| Move the singleton into a component that already has one | A broker with one consumer per partition, or a database job scheduler, already elects internally          | A dependency on that component's semantics, which must be read                          |

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
  Activate the successor's term at the sink before useful work: a highest-seen-term check
  alone cannot reject an old term that arrives before that transition.
- Mechanisms establish who _should_ lead; none automatically fences arbitrary databases,
  object stores or external APIs.
- Failover depends on remaining lease/session detection, coordination, state recovery, warm-up
  and backlog. A mechanism and its timing configuration jointly determine it.

## ShedLock and the "don't run this twice" family, stated plainly

ShedLock is not leader election, and its own documentation is explicit that it is not a
distributed scheduler and does not promise a task runs only once. What it is: a lock **per task
execution**, stored as a row with a name, a holder and a `lock_until` timestamp, with
`lockAtMostFor` as the expiry that stops a crashed node blocking the job forever.

That row describes the JDBC provider; ShedLock also has other providers with different time
and storage semantics. Pin the actual provider/version. With supported JDBC providers,
`usingDbTime()` uses database time and avoids relying on synchronized application clocks.

That expiry is a lease, and it has the lease defect: a node still executing when `lockAtMostFor`
elapses is not stopped, so a second node can start the same job while the first is still inside
it. There is no token, so nothing downstream can reject the slow one.

Consequences for configuration and design:

- Set `lockAtMostFor` from a credible upper execution bound plus margin, and instrument
  overruns. No finite value proves a hung/paused job has ended; too low creates overlap, too
  high delays recovery. For unbounded work, redesign into bounded resumable units or add
  renewal plus a separately enforced fence.
- `lockAtLeastFor` keeps the lock for a minimum interval measured from acquisition, even
  after a fast task finishes, and can prevent
  closely spaced sequential runs caused by schedule/clock differences. It does not establish
  exactly-once execution or protect work that outlives the maximum lease.
- It is adequate when a duplicate or skipped run is survivable: idempotent aggregation, a sweep
  that reconciles to the same state, a notification with its own dedup key. It is not adequate
  when a second concurrent run corrupts data — then fence at the resource, and the lock becomes
  an optimisation rather than the control.
- It does not make a `@Scheduled` method a singleton _role_. A long-lived poller or connection
  needs a lifecycle/ownership protocol if exclusivity is required; an ordinary consumer group
  or local cache may need no additional election.

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
- the work partitions safely by key (sharding-and-partitioning), or concurrent repeated runs
  preserve the invariant at acceptable cost (idempotency)
```

## Reviewing an existing election

- [ ] The leader stops before its conservative local deadline and admits no unit that can
      outlive the remaining safe budget.
- [ ] A failed renewal never extends the conservative deadline; admission stops early enough
      to quiesce before it.
- [ ] Every externally visible write is protected by effective sink-side authority/fence
      enforcement, or repeated and concurrent effects preserve the required invariant.
- [ ] Local role/term metrics are correlated with useful progress and resource-side fence
      evidence; a sampled `sum(is_leader)` is not proof of exclusivity.
- [ ] The lease exceeds the worst measured pause; the failover budget is written down.
- [ ] Shutdown stops admission, checkpoints/quiesces, then releases or safely expires authority.
- [ ] There is a test in which the leader is partitioned or stopped, asserting at the resource.

## Version and provider questions

Kubernetes `Lease` is a persisted coordination record, not an etcd TTL key automatically
deleted when `leaseDurationSeconds` passes. The election client interprets the record and
renewal timing. For example, client-go uses locally observed changes and explicit
LeaseDuration/RenewDeadline assumptions; its documentation explicitly disclaims fencing.
Inspect the Java client's corresponding algorithm rather than treating API persistence as
proof of exclusive execution.

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
- [client-go election timing and fencing limitations](https://pkg.go.dev/k8s.io/client-go/tools/leaderelection)
