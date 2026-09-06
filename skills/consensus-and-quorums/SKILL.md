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
synchrony. Consensus can order a replicated log used for grants and configuration, but is not
itself a lock or lease. Leases, locks, role election and shard ownership have distinct contracts;
not every election uses a lease, and ownership can change dynamically. Route external stale-owner
safety to `distributed-locks-and-leases` and role lifecycle to `leader-election`.

The failure this prevents is a coordination store used as a traffic-scaled database. etcd,
ZooKeeper and Consul are replicated metadata/coordination stores with different read contracts;
writes pass through a leader/quorum log and durable storage, often batched/pipelined. Business
rows, a work queue or a per-request job table in one
makes every business write a consensus decision — and puts the store's availability in series
with the service's, which is the arithmetic in `failure-models`.

## Workflow

This skill is protocol-level and has no Java language minimum. For a Java integration inspect
the project toolchain, resolved client version, deployed server version, read options and
durability/failover policy. Product references here cover etcd 3.6 and ZooKeeper 3.8.4;
verify Consul modes against the deployed version. Do not upgrade Java or the store to match
a reference. Missing membership, durability or read-contract evidence prevents a safety claim.

1. **Ask whether anything must be agreed at all.** Most designs that reach for consensus need a
   _single-key conditional write_, which the database already provides. Consensus is for
   decisions that must be single-valued fleet-wide and survive their author's death.
2. **Size the cluster from `f`, the number of simultaneous failures you tolerate.** `2f+1`
   voting members with majority quorums tolerate `f`, assuming the survivors can communicate
   and retain required durable state. Exclude learners/observers from the voter count.
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
7. **Exercise failure behaviour in an isolated cluster.** With `2f+1` voters, remove `f` and
   assert eventual write progress within the recovery budget. Remove `f+1` and verify newly
   initiated writes cannot be acknowledged as committed without a quorum. In-flight writes
   may have committed before disruption; timeouts retain unknown outcomes. Test each minority
   read/fail-fast policy and restore the fixture afterward.

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
- the decision is a single-key compare-and-swap and the existing database's atomicity,
  durability and failover contract meet the need: use its conditional write rather than
  adding another coordination system; a unique constraint alone does not prove HA consensus
- work can be partitioned so each key has one owner by assignment (sharding-and-partitioning),
  which needs no agreement at request time at all
- the work is idempotent and safe on every replica (idempotency) — the cheapest coordination
  is none
```

## Rules

- **FLP: no deterministic algorithm guarantees termination of consensus in a fully asynchronous system where even
  one process may crash.** A timeout suspects failure; it does not distinguish a crash from
  arbitrary delay or invalidate the theorem. Practical progress depends on additional timing,
  failure-detector or randomized-progress assumptions. Correct protocols preserve safety under their stated crash/storage assumptions and become live
  under stronger timing/quorum assumptions. Byzantine behavior, disk corruption, clock misuse,
  misconfiguration and implementation bugs are outside that shorthand.
- `2f+1` tolerates `f` crash failures because any two majorities of `2f+1` share at least one
  node, so a later quorum always meets a member of the earlier one under fixed membership.
  Common partially synchronous Byzantine quorum protocols use `3f+1` with `2f+1` quorums;
  Byzantine bounds depend on the model and protocol and are outside this skill's crash model.
- An extra even-numbered voter does not increase majority crash-failure tolerance: four and three
  both tolerate one unavailable voter; six and five both tolerate two. It can still be a
  transitional reconfiguration or meet a placement/read requirement, so compare that purpose
  with its larger quorum and replication cost.
- Adding voters increases replication work and changes the required quorum. Commit latency
  includes the fastest satisfying durable quorum, leader work, routing and queueing; topology
  and batching matter. More voters do not shard a single log, but latency/throughput changes
  must be measured rather than asserted universally.
- `R + W > N` makes read and write sets intersect within the same fixed replica set.
  Observing an acknowledged write also requires durable replicas and a valid version/conflict
  protocol. It does **not** by itself make reads linearizable: concurrent writes may be partially applied, and a
  sloppy quorum accepting hinted replicas breaks the intersection outright. Intersection is a
  necessary condition, not a consistency model.
- Raft elects at most one leader per term. A leader can directly commit an entry from its
  **current term** once durably replicated to a majority; committing it also commits earlier
  entries in that prefix. An old-term entry merely appearing on a majority is not sufficient
  (Raft section 5.4.2). A partition can leave an obsolete leader active in a different term.
- A Raft term fences protocol messages _inside that Raft group_: followers reject stale terms and
  an isolated old leader cannot commit without a quorum. A term/revision does not automatically
  fence writes to an external database, object store or device; that resource must compare a
  monotonically increasing grant token, and the token must distinguish each ownership grant.
- **Watch guarantees are product-specific.** etcd orders unique events by revision and supports
  resume within retained history, but watches are not linearizable and compaction forces resync.
  ZooKeeper standard watches are one-shot and can miss intermediate changes between re-registration;
  its persistent watch modes have a different lifecycle, not durable broker semantics.
  Consumers checkpoint versions and rebuild state on gaps/compaction instead of assuming a
  generic notification contract.
- Lease/session authority follows the store's expiry protocol, not the holder's belief:
  the holder can believe it holds a grant the cluster has already regranted. Do not assume a
  synchronized ensemble clock. That gap is `distributed-locks-and-leases`.
- A compare-and-swap has three outcomes. An acknowledged failed comparison is "rejected";
  a timeout means unknown — it may have applied with only the response lost. Reconcile the
  unique attempt with supported strong reads/history; retain unknown if evidence is ambiguous
  (`failure-models`). A matching holder name alone does not establish current authority.

Deliver the voter/failure-domain map, quorum arithmetic, commit/read assumptions, unknown-outcome
policy and bounded failure tests. A successful kill test is evidence for that topology and run,
not proof of consensus correctness or external fencing.

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
