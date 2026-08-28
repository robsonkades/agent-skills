# Quorum arithmetic and placement

## Why `2f+1`

A majority quorum is `floor(N/2) + 1`. Any two majorities of the same `N` share at least one
member — that intersection is the whole mechanism. A decision taken by one majority is visible
to every later majority, because whichever nodes fail, the next majority contains a node that
witnessed the last one.

To keep a majority available while `f` nodes are down you need `N - f > N/2`, which is
`N > 2f`, which is `N = 2f+1` at minimum.

| N   | Majority | Tolerated failures `f` | Worth choosing? |
| --- | -------- | ---------------------- | --------------- |
| 1   | 1        | 0                      | Only for dev    |
| 2   | 2        | 0                      | Never           |
| 3   | 2        | 1                      | Yes             |
| 4   | 3        | 1                      | Never           |
| 5   | 3        | 2                      | Yes             |
| 6   | 4        | 2                      | Never           |
| 7   | 4        | 3                      | Rarely          |

**The even row is the counter-intuitive one.** Four nodes tolerate the same single failure as
three, cost a third more, add a node to every commit's acknowledgement set, and introduce a
2-2 split in which neither side can proceed. `N = 2` is worse than `N = 1`: it tolerates no
failures _and_ doubles the probability that some node is down.

Seven is defensible only when node failures are genuinely frequent and independent — a fleet
of spot instances, say. Otherwise the extra two nodes buy tolerance you never use and pay for
it on every decision.

## Adding capacity without changing the quorum

Read capacity and quorum size are separable. etcd learners and ZooKeeper observers receive the
replicated stream and serve reads but do not vote, so adding them raises read capacity and
leaves `f` and commit latency untouched. Adding _voting_ members does the opposite: more
tolerance, slower commits, no extra write throughput.

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

Commit latency is the round trip to the slowest member of the fastest majority — not the
average, and not the slowest node overall. With `N = 3` that is the second-fastest peer; with
`N = 5`, the third.

| Placement               | Typical RTT to the deciding peer | Consequence                                                                                 |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| One AZ, 3 nodes         | sub-millisecond                  | Fastest decisions; an AZ failure takes the whole cluster                                    |
| Three AZs, one region   | low single-digit ms              | Survives one AZ; every decision pays a cross-AZ hop, so keep decisions off the request path |
| Three regions           | tens of ms                       | Survives a region; a lease renewal or lock acquisition now costs more than most SLOs allow  |
| Two AZs, any node count | —                                | **Broken by construction**: no split of an even number of failure domains holds a majority  |

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

The design question is never "how do we keep the minority working" — it cannot, safely. It is
"what does a client attached to the minority do": fail fast, serve a cached decision with a
stated staleness bound, or degrade to a defined read-only mode. Choose one and write it down.

## Sizing checklist

- [ ] `N` is odd, and 3 or 5 unless a stated failure rate justifies 7.
- [ ] Nodes occupy at least three independent failure domains, or the cluster tolerates zero
      domain failures regardless of node count.
- [ ] Measured commit latency at the chosen placement is below the budget of the fastest
      caller that waits on it.
- [ ] Read capacity growth uses non-voting members, not extra voters.
- [ ] A documented behaviour exists for clients on the minority side of a partition.
