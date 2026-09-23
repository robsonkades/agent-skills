# Cache topologies

These dimensions can combine: sharded caches may have replicas, and a proxy may front a
cluster. Compare routing ownership separately from the number and location of copies.
Memory below counts value bytes with RF=1 for sharded columns; multiply by RF when replicated
and budget metadata, buffers and recovery headroom separately.

## Comparison

| Property                   | Client-side sharded                                | Proxy-fronted                                        | Clustered (server-owned slots)                             | Fully replicated                                       |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Who knows the membership   | Every client                                       | The proxy                                            | The server, advertised to clients                          | Every node holds everything, so placement is trivial   |
| Hops on the cache path     | 1                                                  | 2                                                    | Usually 1 after client discovers/caches placement          | 0 only in-process; otherwise 1                         |
| Adding or removing a node  | Coordinate membership versions and migration       | Proxy config change; clients untouched               | Cluster reshards slots; clients follow redirects           | New node must be filled before it serves               |
| Memory for a working set W | W                                                  | W                                                    | W                                                          | N × W                                                  |
| Losing one node            | Its request/key share remaps and misses            | Same, unless the proxy fails over to a ready replica | Depends on replica promotion, routing and client retry     | No key loss if remaining replicas are current/routable |
| Multi-key operations       | Client/product-specific coordination               | Proxy/product-dependent                              | Product-specific; often same-slot or coordinated at a cost | Local data placement does not imply atomic semantics   |
| Consistency across copies  | One owner per key, barring topology-version drift  | Depends on replica/failover policy                   | Depends on acknowledgement and replica-read policy         | Depends on write fan-out/acknowledgement policy        |
| Operational cost           | Lowest infrastructure, highest coupling to clients | One more tier to run, monitor and upgrade            | The cache product owns it; you own understanding its mode  | Simple to run, expensive in memory and write fan-out   |
| Fits when                  | Few clients, one runtime, latency-critical         | Polyglot or numerous clients, topology changes often | You already run the clustered product and fit its model    | Small, read-dominated reference data                   |

## What each gets wrong in practice

**Client-side sharded.** The membership list is configuration in N applications, and they
drift. Two clients with different node lists place the same key on different nodes: both
believe they have a hit rate, and both serve values the other's writes never reached. The
symptom is "the cache sometimes has stale data"; aggregate hit-rate metrics can hide it.
Distribute the node list from one versioned source, and log the version
the client is using so a mismatch is greppable. Define invalidation or migration behavior
while versions overlap; distributing a version does not eliminate the transition window.

The second issue is the hash: every client must use the identical function, the identical
virtual-node count and the identical string format for a ring point. Two client libraries in
two languages "both using consistent hashing" are not interoperable unless that was designed.
`consistent-hashing` owns the requirement; here it is the reason polyglot clients push you
towards a proxy.

Membership can be discovered dynamically; client-side ownership does not itself require a
redeploy. Compare the existing client's discovery and migration contract with the proposed
proxy or cluster before introducing another routing tier.

**Proxy-fronted.** The hop is real and it is on the fast path. Measure cache-hit latency and
the complete hit/miss workload against the required SLO; a slow origin does not make the
extra hop negligible for a predominantly cache-hit journey.
The proxy is also a new failure domain: loss of the only routing path can make the whole
cache unavailable, so a proxy tier needs its own redundancy and its own
connection-limit sizing. It repays that with the ability to change topology, add nodes and
fail over without touching a client.

**Clustered.** Membership and resharding move into the product, which is the point. The
constraint people meet late is multi-key: Redis Cluster requires same-slot placement for
many multi-key commands; other products may coordinate across shards at extra cost. Check
the exact product/version and command, including behavior during resharding,
before adopting the mode. Where replicas exist, be explicit about whether reads may be served
from them — if they may, reads are subject to replication lag and read-after-write is not
guaranteed (`consistency-models`).
Server-owned placement still needs compatible clients: for Redis Cluster, verify `MOVED` and
`ASK` handling and reachability/authentication of advertised target endpoints from every client
network. A reachable bootstrap address does not prove resharding or failover will work.

Surviving data and permission to serve it are separate checks. In the
[Redis Open Source 7.2.0 configuration](https://github.com/redis/redis/blob/7.2.0/redis.conf),
`cluster-require-full-coverage` defaults to `yes` and `cluster-allow-reads-when-down` to `no`.
An uncovered slot range can therefore make otherwise healthy shards reject queries as the
cluster enters its failed state. A partition can also prevent automatic promotion when the
candidate cannot reach a majority of voting primaries; replica count alone does not supply that quorum.
Verify the deployed version, effective settings and eligible replicas before using a
lost-shard-only origin estimate. See the [cluster availability model](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/).

Test reads and cache-fill writes separately through the actual clients. Allowing partial
coverage or reads while down changes behavior; it neither recreates missing data nor restores
promotion quorum, and may expose stale reads. Treat such settings as a contract decision, not
a default fix for origin overload.

**Fully replicated.** Memory is approximately `N × W` plus metadata, and write propagation grows
with replicas. It fits a small, read-dominated, slow-changing dataset when the convergence model is
acceptable. It avoids key loss on one node only if another current replica is routable and has
capacity; a partition, stale replica or failed local process can still cause misses/errors.

## The near-cache (local L1 in front of a shared L2)

An in-process cache removes the network hop on local hits. Consider it for a measured read-hot
key only if bounded staleness or an explicit coherence protocol meets the access contract.

The topology consequence — and this is all this skill owns, since invalidation propagation
belongs to `caching-strategies`:

- For a key belonging to one shard, copies are at most `instances caching that key + RF`,
  excluding temporary migration copies. Shards multiply total nodes, not copies of one key.
  Invalidation must cover all copies directly or through verified propagation.
- An L1 can make the shared tier's hit rate look worse, because the L1 absorbed the easy hits.
  Judge the L2 on origin request rate, not on its own hit rate.
- Bound L1 memory and define missed-invalidation recovery. TTL is a possible stale-lifetime
  bound only when expiry reloads sufficiently fresh data; strict freshness needs a stronger
  protocol or bypass. Delegate that protocol to `caching-strategies`.
- Size L1 from the measured access distribution. Holding all of a small working set is a
  legitimate full-replication choice if its memory and coherence costs are acceptable.

## Decision

```text
Client-side sharded when:
- clients are few, internal, share a runtime, and the extra hop's latency is a measurable
  fraction of the cache's own service time
Proxy-fronted when:
- clients are polyglot or numerous, or the topology must change without redeploying callers;
  budget for proxy redundancy, because the proxy is a total-outage failure domain
Clustered when:
- you already operate the clustered product, and the access pattern has no cross-slot
  multi-key requirement it cannot satisfy
Fully replicated when:
- working set fits one node's memory with headroom, reads dominate, writes are infrequent;
  accept N × memory and a write fan-out to N nodes
Reconsider the whole layer when:
- the origin cannot serve the request rate with the cache cold — the cache is then an
  availability dependency and needs the treatment in node-loss-and-origin-protection.md
```
