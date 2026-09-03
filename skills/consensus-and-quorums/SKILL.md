---
name: consensus-and-quorums
description: >
  Crash-fault consensus and quorum reasoning: FLP, safety versus liveness, majority 2f+1,
  R + W > N intersection and its limits, voter/failure-domain placement, Raft terms and why
  external fencing still requires resource enforcement, plus the differing read/watch
  contracts of etcd, ZooKeeper and Consul. Use
  when a cluster size is being chosen, when nodes are spread across AZs or regions, when
  application data or a queue is being put in etcd or ZooKeeper, when a coordination store
  sits on the request path, when a watch is treated as a delivery guarantee, or when a
  fourth node is proposed for redundancy. Does not cover CAP and the model ladder
  (consistency-models), mutual exclusion built on top (distributed-locks-and-leases),
  electing a singleton worker (leader-election), or the fault model itself (failure-models).
---

# Consensus And Quorums

## Purpose

Consensus is a set of processes agreeing on **one value** with safety despite modeled crashes,
loss and delay; progress additionally needs a quorum and timing assumptions such as eventual
synchrony. It is the primitive the rest of this family stands on, and the six words are
not synonyms. A **mutex** is mutual exclusion inside one process, backed by shared memory and
a memory model (`java-memory-model`). A **lease** is a time-bounded grant that expires without
the holder's cooperation. A **distributed lock** is a lease over a critical section, and it
excludes nobody unless the protected resource checks a fencing token
(`distributed-locks-and-leases`). **Leader election** is a lease on a _role_, renewed over
time (`leader-election`). **Ownership** is a static assignment of keys to processes that needs
no agreement at request time (`sharding-and-partitioning`). **Consensus** is how a replicated
store makes any one of those grants single-valued and durable — it is what the others are
built from, and it is not itself a lock.

The failure this prevents is a coordination store used as a traffic-scaled database. etcd,
ZooKeeper and Consul are replicated metadata/coordination stores with different read contracts;
writes pass through a leader/quorum log and durable storage, often batched/pipelined. Business
rows, a work queue or a per-request job table in one
makes every business write a consensus decision — and puts the store's availability in series
with the service's, which is the arithmetic in `failure-models`.

## Workflow

1. **Ask whether anything must be agreed at all.** Most designs that reach for consensus need a
   _single-key conditional write_, which the database already provides. Consensus is for
   decisions that must be single-valued fleet-wide and survive their author's death.
2. **Size the cluster from `f`, the number of simultaneous failures you tolerate.** `2f+1`
   nodes with majority quorums tolerate `f`. Three tolerates one, five tolerates two. Stop
   there unless you can state why `f = 3` is required.
3. **Place voters and price the commit path.** Account for leader routing, network RTT,
   replication, durable-log latency, batching and the fastest quorum. Placement sets correlated
   failure tolerance and latency (`references/quorum-arithmetic.md`).
4. **Decide, in writing, what each side of a partition does.** The minority side cannot form a
   quorum and therefore cannot make progress; that is the design working, not an outage to
   engineer around. CAP itself is `consistency-models`.
5. **Choose product-specific read semantics per call site.** etcd linearizable and serializable
   reads differ; ZooKeeper member-local reads are not linearizable. Measure the actual path.
6. **Keep traffic-proportional business data out and avoid synchronous coordination per request.** Cache the decision locally,
   with a defined behaviour for "store unreachable" (`references/coordination-stores.md`).
7. **Prove the failure behaviour.** Kill `f` nodes and assert writes still commit; kill `f+1`
   and assert writes _fail_ rather than succeeding locally; partition the minority and assert
   it does what you chose.

## Decision block

```text
Use a consensus-backed coordination store when:
- a decision must be single-valued fleet-wide (who holds a role, which shard-map version is
  current, which config generation is active) and must survive the death of its author
- decisions are small and their measured rate/retention fit the product's tested envelope
- you can tolerate the store being unavailable for the duration of an election
Avoid it when:
- the data is application state, an event stream, or anything whose volume grows with traffic
- the write rate scales with request rate — every write is a majority round trip
- it would sit on the synchronous request path with no cached fallback, making its availability
  a hard multiplier on yours
Prefer instead when:
- the decision is a single-key compare-and-swap and you already run a database: a unique
  constraint or a versioned conditional UPDATE is consensus you have already paid for
- work can be partitioned so each key has one owner by assignment (sharding-and-partitioning),
  which needs no agreement at request time at all
- the work is idempotent and safe on every replica (idempotency) — the cheapest coordination
  is none
```

## Rules

- **FLP: no deterministic algorithm guarantees termination of consensus in a fully asynchronous system where even
  one process may crash.** Every real system escapes it with timeouts, so every failure
  detector is a _guess_ about a process that may merely be slow. Consensus protocols are
  correct protocols preserve safety under their stated crash/storage assumptions and become live
  under stronger timing/quorum assumptions. Byzantine behavior, disk corruption, clock misuse,
  misconfiguration and implementation bugs are outside that shorthand.
- `2f+1` tolerates `f` crash failures because any two majorities of `2f+1` share at least one
  node, so a later quorum always meets a member of the earlier one. Byzantine faults need
  `3f+1` and are usually out of scope; `failure-models` states when they are not.
- An extra even-numbered voter does not increase majority crash-failure tolerance: four and three
  both tolerate one unavailable voter; six and five both tolerate two. It can still be a
  transitional reconfiguration or meet a placement/read requirement, so compare that purpose
  with its larger quorum and replication cost.
- **Quorum systems get slower as they grow.** Commit latency is the round trip to the slowest
  member of the _fastest majority_. Adding voters buys fault tolerance and costs latency; it
  never buys write throughput.
- `R + W > N` makes the read set intersect the write set, so a read _sees_ a replica holding
  the latest acknowledged write. It does **not** by itself make reads linearizable: the client
  still has to pick the newest version, concurrent writes may be partially applied, and a
  sloppy quorum accepting hinted replicas breaks the intersection outright. Intersection is a
  necessary condition, not a consistency model.
- Raft at consumer level: one leader per _term_, elected by a majority of votes; clients write
  through the leader; an entry commits once a majority holds it. Paxos is the ancestor and Zab
  the ZooKeeper sibling — name them, do not operate on the difference.
- A Raft term fences protocol messages _inside that Raft group_: followers reject stale terms and
  an isolated old leader cannot commit without a quorum. A term/revision does not automatically
  fence writes to an external database, object store or device; that resource must compare a
  monotonically increasing grant token, and the token must distinguish each ownership grant.
- **Watch guarantees are product-specific.** etcd orders unique events by revision and supports
  resume within retained history, but watches are not linearizable and compaction forces resync.
  ZooKeeper watches are one-shot and can miss intermediate changes between re-registration.
  Consumers checkpoint versions and rebuild state on gaps/compaction instead of assuming a
  generic notification contract.
- A lease is expired **by the ensemble's clock, not the holder's**: the holder can believe it
  holds a lease the cluster has already regranted. That gap is `distributed-locks-and-leases`.
- A compare-and-swap has three outcomes. "Rejected" means someone else won; a _timeout_ means
  unknown — it may have applied with only the response lost, so re-read before concluding you
  lost (`failure-models`).

## References

- [Quorum arithmetic and placement](references/quorum-arithmetic.md) — `2f+1` and `R + W > N`
  worked through with examples, the even-node result, cluster sizing, cross-AZ and cross-region
  placement with the latency cost per decision, and what each side of a partition can do. Read
  when choosing a cluster size, adding a node, or spreading voters across failure domains.
- [Coordination stores in practice](references/coordination-stores.md) — the primitives
  (compare-and-swap, leases with TTL, watches), the operations these stores are wrong for,
  their throughput and failure characteristics, watch semantics, and a decision table for
  behaviour when the store is unreachable. Read before putting anything into etcd, ZooKeeper or
  Consul, or when a coordination store appears on a request path.

## Primary sources

- [Raft paper](https://raft.github.io/raft.pdf)
- [FLP impossibility result](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf)
- [etcd API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)
- [ZooKeeper consistency guarantees](https://zookeeper.apache.org/doc/r3.8.4/zookeeperInternals.html)
