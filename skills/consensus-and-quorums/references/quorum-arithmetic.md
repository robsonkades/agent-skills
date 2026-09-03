# Quorum arithmetic and placement

## Why `2f+1`

A majority quorum is `floor(N/2) + 1`. Any two majorities of the same `N` share at least one
member. Protocol rules for terms, ballots and log prefixes use that intersection so a later quorum
cannot safely choose a conflicting committed value. Intersection alone does not make a read fresh
or survive Byzantine/corrupt members.

To keep a majority available while `f` nodes are down you need `N - f > N/2`, which is
`N > 2f`, which is `N = 2f+1` at minimum.

| N   | Majority | Tolerated failures `f` | Worth choosing?                                                 |
| --- | -------- | ---------------------- | --------------------------------------------------------------- |
| 1   | 1        | 0                      | Dev or explicitly non-HA                                        |
| 2   | 2        | 0                      | No availability gain; possible transitional/replication purpose |
| 3   | 2        | 1                      | Yes                                                             |
| 4   | 3        | 1                      | Same failure tolerance as 3; justify another purpose            |
| 5   | 3        | 2                      | Yes                                                             |
| 6   | 4        | 2                      | Same failure tolerance as 5; justify another purpose            |
| 7   | 4        | 3                      | Rarely                                                          |

**The even row is the counter-intuitive one.** Four nodes tolerate the same single unavailable
voter as three, with a quorum of three instead of two; six tolerates the same two as five. Two
voters still require both for progress, though they may add a durable copy. Even counts can be
transitional during reconfiguration, but need a purpose other than majority availability.

Seven is defensible only when failure-domain analysis and recovery objectives require three
simultaneous unavailable voters. Do not model nodes in one provider/control plane as independent
merely because their instance lifecycles differ.

## Adding capacity without changing the quorum

Read capacity and quorum size can be separable, but non-voter behavior is product/version-specific.
ZooKeeper observers serve clients without voting. Current etcd learners primarily stage safe
membership changes and accept only serializable reads/status; client routing and learner limits
matter. Every non-voter still consumes leader replication resources. Adding voters does not shard
the single leader's write path and increases replication/quorum work.

## `R + W > N` — what it gives and what it does not

In a replicated store with `N` replicas per key, a write acknowledged by `W` and a read
answered by `R` intersect when `R + W > N`, so the read set contains at least one replica that
holds the last acknowledged write.

| N   | W   | R   | Intersects? | Character                                                      |
| --- | --- | --- | ----------- | -------------------------------------------------------------- |
| 3   | 2   | 2   | yes         | Balanced; tolerates one replica down for both reads and writes |
| 3   | 3   | 1   | yes         | Fast reads, and **any** replica down stops all writes          |
| 3   | 1   | 3   | yes         | Fast writes, and any replica down stops all reads              |
| 3   | 1   | 1   | no          | No intersection: a read may legally return a stale value       |
| 5   | 3   | 3   | yes         | Tolerates two down on both paths                               |

Three things intersection does **not** give you:

- **It is not linearizability.** The read finds a replica with the newest version; the client
  still has to identify it (a version, a timestamp, a vector clock) and something must repair
  the stale replicas. Concurrent writes can leave different replicas holding different values,
  both acknowledged.
- **It is not atomicity across keys.** Each key has its own quorum. Two keys written together
  are two independent decisions.
- **It survives no sloppy quorum.** If a store accepts `W` acknowledgements from _any_ reachable
  node rather than from the key's own replicas (hinted handoff), the read quorum may contain
  none of the writers. The arithmetic silently stops holding.

## Placement and the cost per decision

The network component is governed by a fastest quorum rather than the slowest member overall, but
the commit path also includes leader routing, log processing, durable-write policy, batching and
queueing. With a stable Raft leader, one follower response can complete a three-voter quorum only
after the leader's own durability requirements are met.

| Placement                  | Typical RTT to the deciding peer | Consequence                                                                                 |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| One AZ, 3 nodes            | sub-millisecond                  | Fastest decisions; an AZ failure takes the whole cluster                                    |
| Three AZs, one region      | low single-digit ms              | Survives one AZ; every decision pays a cross-AZ hop, so keep decisions off the request path |
| Three regions              | tens of ms                       | Survives a region; a lease renewal or lock acquisition now costs more than most SLOs allow  |
| Two AZs, asymmetric voters | topology-dependent               | Can survive loss of the smaller side, not the larger; maintenance/failover is asymmetric    |

Measure your own RTTs rather than trusting the column; the shape is what matters. The rule that
follows is the useful one: **the further apart the voters, the fewer decisions per second the
design may make.** A cross-region cluster is a fine place for a shard-map version and a
terrible place for a per-request lock.

## What each side of a partition can do

Split a five-node cluster 3/2:

- **Majority side (3).** Elects or keeps a leader, commits writes, serves linearizable reads.
- **Minority side (2).** Cannot elect, cannot commit, and — this is the part that surprises —
  a _former_ leader stranded there may keep answering local reads until it notices, so a client
  pinned to it sees stale data unless it demands a linearizable read.

Split 3-node cluster 2/1: same shape, and the singleton is useless. Split it 1/1/1: nothing
proceeds anywhere, which is correct behaviour and total unavailability at the same time.

The minority cannot safely commit new consensus decisions. A client there may fail fast, serve a
versioned/stale read under an explicit contract, or route elsewhere. Choose and test the product's
actual semantics.

## Sizing checklist

- [ ] Majority size and voter count follow a stated simultaneous-failure objective; even voters
      have a documented transitional or placement purpose.
- [ ] Placement is evaluated for loss of **each** failure domain, including asymmetric two-domain outcomes.
- [ ] Measured commit latency at the chosen placement is below the budget of the fastest
      caller that waits on it.
- [ ] Read scaling uses a product-supported mode whose staleness and leader replication cost were tested.
- [ ] A documented behaviour exists for clients on the minority side of a partition.
