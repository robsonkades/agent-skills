---
name: consensus-and-quorums
description: >
  Agreement among processes that may crash, and the arithmetic that makes it work: FLP and
  why every failure detector is only a timeout; majority quorums, 2f+1, and the R + W > N
  intersection property with what it does and does not buy; why an even node count adds
  nothing and why quorum latency rises with cluster size; Raft's leader, term and log, with
  the term number as a fencing token; and what etcd, ZooKeeper and Consul actually are. Use
  when a cluster size is being chosen, when nodes are spread across AZs or regions, when
  application data or a queue is being put in etcd or ZooKeeper, when a coordination store
  sits on the request path, when a watch is treated as a delivery guarantee, or when a
  fourth node is proposed for redundancy. Does not cover CAP and the model ladder
  (consistency-models), mutual exclusion built on top (distributed-locks-and-leases),
  electing a singleton worker (leader-election), or the fault model itself (failure-models).
---

# Consensus And Quorums

## Purpose

Consensus is a set of processes agreeing on **one value** despite crashes, lost messages and
unbounded delay. It is the primitive the rest of this family stands on, and the six words are
not synonyms. A **mutex** is mutual exclusion inside one process, backed by shared memory and
a memory model (`java-memory-model`). A **lease** is a time-bounded grant that expires without
the holder's cooperation. A **distributed lock** is a lease over a critical section, and it
excludes nobody unless the protected resource checks a fencing token
(`distributed-locks-and-leases`). **Leader election** is a lease on a _role_, renewed over
time (`leader-election`). **Ownership** is a static assignment of keys to processes that needs
no agreement at request time (`sharding-and-partitioning`). **Consensus** is how a replicated
store makes any one of those grants single-valued and durable — it is what the others are
built from, and it is not itself a lock.

The failure this prevents is the coordination store used as a database. etcd, ZooKeeper and
Consul are small, linearizable, deliberately low-throughput stores whose write rate is bounded
by one majority round trip per decision. Application rows, a work queue or a job table in one
makes every business write a consensus decision — and puts the store's availability in series
with the service's, which is the arithmetic in `failure-models`.

## Workflow

1. **Ask whether anything must be agreed at all.** Most designs that reach for consensus need a
   _single-key conditional write_, which the database already provides. Consensus is for
   decisions that must be single-valued fleet-wide and survive their author's death.
2. **Size the cluster from `f`, the number of simultaneous failures you tolerate.** `2f+1`
   nodes with majority quorums tolerate `f`. Three tolerates one, five tolerates two. Stop
   there unless you can state why `f = 3` is required.
3. **Place the nodes and price the round trip.** A commit costs the latency of the slowest node
   in the _fastest majority_, so placement — same AZ, three AZs, three regions — sets the floor
   on every decision. `references/quorum-arithmetic.md` has the numbers and the placements.
4. **Decide, in writing, what each side of a partition does.** The minority side cannot form a
   quorum and therefore cannot make progress; that is the design working, not an outage to
   engineer around. CAP itself is `consistency-models`.
5. **Choose the read semantics per call site.** A linearizable read costs a leader round trip; a
   local follower read is fast and may be arbitrarily stale. Both are legitimate; picking by
   accident is not.
6. **Keep application data out and the store off the request path.** Cache the decision locally,
   with a defined behaviour for "store unreachable" (`references/coordination-stores.md`).
7. **Prove the failure behaviour.** Kill `f` nodes and assert writes still commit; kill `f+1`
   and assert writes _fail_ rather than succeeding locally; partition the minority and assert
   it does what you chose.

## Decision block

```text
Use a consensus-backed coordination store when:
- a decision must be single-valued fleet-wide (who holds a role, which shard-map version is
  current, which config generation is active) and must survive the death of its author
- the decision rate is tens to low hundreds per second, and each decision is small
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

- **FLP: no deterministic algorithm solves consensus in a fully asynchronous system where even
  one process may crash.** Every real system escapes it with timeouts, so every failure
  detector is a _guess_ about a process that may merely be slow. Consensus protocols are
  therefore always-safe and only-eventually-live: under bad enough timing they stall, they do
  not decide wrongly.
- `2f+1` tolerates `f` crash failures because any two majorities of `2f+1` share at least one
  node, so a later quorum always meets a member of the earlier one. Byzantine faults need
  `3f+1` and are usually out of scope; `failure-models` states when they are not.
- **An even node count buys nothing.** Four nodes need a majority of three and tolerate one
  failure, exactly as three do, at higher cost — and a 2-2 split leaves neither side able to
  proceed. Six tolerate two, as five do. Cluster sizes are 3, 5, and rarely 7.
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
- **A Raft term number is a fencing token.** Terms increase monotonically, every message carries
  one, and a replica rejects anything stamped with an older term — so a partitioned old leader
  that still believes it leads cannot commit, because its followers refuse its entries. That is
  precisely the mechanism a distributed lock lacks unless the protected resource checks too.
- **A watch is a notification, not a delivery guarantee.** It says _that_ a key changed, may
  coalesce several changes into one, and drops a client that falls behind the compaction
  horizon. Every watch consumer re-reads on fire, needs a periodic re-read as a backstop, and
  must be correct having never seen an intermediate state.
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
