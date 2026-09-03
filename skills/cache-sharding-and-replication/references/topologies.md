# Cache topologies

Four layouts. They are not four flavours of one idea: they differ on who knows the
membership, and that decides everything else.

## Comparison

| Property                   | Client-side sharded                                | Proxy-fronted                                        | Clustered (server-owned slots)                             | Fully replicated                                       |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Who knows the membership   | Every client                                       | The proxy                                            | The server, advertised to clients                          | Every node holds everything, so placement is trivial   |
| Hops on the cache path     | 1                                                  | 2                                                    | Usually 1 after client discovers/caches placement          | 0 only in-process; otherwise 1                         |
| Adding or removing a node  | Every client must agree, simultaneously            | Proxy config change; clients untouched               | Cluster reshards slots; clients follow redirects           | New node must be filled before it serves               |
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
symptom is "the cache sometimes has stale data" with no pattern, and it is invisible to any
cache-side metric. Distribute the node list from one versioned source, and log the version
the client is using so a mismatch is greppable.

The second issue is the hash: every client must use the identical function, the identical
virtual-node count and the identical string format for a ring point. Two client libraries in
two languages "both using consistent hashing" are not interoperable unless that was designed.
`consistent-hashing` owns the requirement; here it is the reason polyglot clients push you
towards a proxy.

**Proxy-fronted.** The hop is real and it is on the fast path — measure it against
`T_source`, because a cache is chosen for latency and doubling its latency is a genuine cost.
The proxy is also a new failure domain: a proxy outage is a total cache outage, which is
strictly worse than a node outage, so a proxy tier needs its own redundancy and its own
connection-limit sizing. It repays that with the ability to change topology, add nodes and
fail over without touching a client.

**Clustered.** Membership and resharding move into the product, which is the point. The
constraint people meet late is multi-key: primitives spanning keys work only within one slot,
so any operation over several keys needs those keys deliberately co-located, and the
mechanism for that is product-specific. Check the access pattern against the constraint
before adopting the mode. Where replicas exist, be explicit about whether reads may be served
from them — if they may, reads are subject to replication lag and read-after-write is not
guaranteed (`consistency-models`).

**Fully replicated.** Memory is approximately `N × W` plus metadata, and write propagation grows
with replicas. It fits a small, read-dominated, slow-changing dataset when the convergence model is
acceptable. It avoids key loss on one node only if another current replica is routable and has
capacity; a partition, stale replica or failed local process can still cause misses/errors.

## The near-cache (local L1 in front of a shared L2)

An in-process cache in front of the shared tier removes the network hop for the hottest keys
and is the standard answer to a read-hot key that the shared tier serves too slowly.

The topology consequence — and this is all this skill owns, since invalidation propagation
belongs to `caching-strategies`:

- The number of copies of a value is now `instances + (shards × RF)`. Every invalidation must
  reach all of them, and the L1s are the ones with no server-side coordination.
- An L1 makes the shared tier's hit rate look worse, because the L1 absorbed the easy hits.
  Judge the L2 on origin request rate, not on its own hit rate.
- The L1 must be bounded and must have a TTL, because a missed invalidation message is
  otherwise permanent on that one instance — a divergence that reproduces for some users and
  not others, depending on which replica served them.
- Sizing the L1 for the whole working set defeats the purpose: it should hold the head of the
  distribution, not a second copy of the L2.

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
