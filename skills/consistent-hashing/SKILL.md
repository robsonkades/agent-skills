---
name: consistent-hashing
description: >
  Stable key-to-node placement across membership changes: modulo remapping, consistent-hash
  rings, virtual points, rendezvous hashing, collision-safe Java implementations, hash
  contracts, replica selection, weighting, testing and membership handoff. Use when changing
  node count causes a miss storm or migration, ownership is uneven, or placement relies on
  Object.hashCode. Does not choose the shard key (sharding-and-partitioning), repair hot keys
  (hot-partitions-and-rebalancing), define cache topology
  (cache-sharding-and-replication), or balance interchangeable replicas
  (load-balancing-and-routing).
---

# Consistent Hashing

## Purpose

Own one function: given a key and a set of nodes, which node holds it — and how much of that
mapping survives when a node joins or leaves. Nothing else in the partitioning family
computes placement; this skill is where any hashing arithmetic belongs.

The failure this prevents is `hash(key) % N`. With a sufficiently uniform hash it can
distribute keys evenly, but it stays operationally stable only
until the day N changes, at which point nearly every key maps somewhere new — for a cache a
fleet-wide miss storm in one step, for a store a migration of nearly the whole dataset,
discovered when someone adds a node to relieve pressure and the rebalance becomes the outage.
The second failure is subtler: a ring with one point per node is _not_ well balanced, so a
naive implementation gets minimal disruption while handing one node several times another's
share.

## Workflow

1. **State the disruption and migration budget.** How many keys, bytes and requests may
   change owner, at what transfer rate, and under what availability target? `% N` remaps
   nearly every key; with equal nodes, a ring or rendezvous moves about K/(N+1) on a join and
   the removed node's approximately K/N share on a removal.
2. **Count the nodes.** With a small, rarely changing membership, rendezvous hashing is fewer
   moving parts than a ring and needs no virtual-node tuning. A ring earns its complexity at
   larger N or where lookup must be sub-linear.
3. **Specify the placement contract completely:** algorithm and variant, seed, byte encoding,
   field framing, signed/unsigned ordering, virtual-point format and membership epoch. Prove
   cross-runtime agreement with golden vectors. MurmurHash3 or xxHash can be suitable when
   the exact implementation is pinned. See
   `references/mapping-functions.md` for what disqualifies the obvious candidates.
4. **Pick V by measurement, not by folklore.** Simulate representative keys, bytes, request
   rates and per-key cost over relevant node counts and seeds. Raise virtual points until the
   worst load/mean is inside tolerance, then measure lookup and rebuild cost.
5. **Implement the wrap-around explicitly.** `ceilingEntry(h)` returning `null` means the key
   hashed past the last point on the ring and belongs to the first entry. This single branch
   is the most commonly omitted line in the pattern.
6. **Test the property, not the output.** Assert that adding one node to N moves
   approximately K/(N+1) keys and no more, and that every key not moved still resolves to its
   previous owner. The implementation and the test are in `references/ring-in-java.md`.
7. **Model heterogeneous capacity explicitly.** Proportional virtual-point counts are one
   coarse mechanism, but CPU, memory, I/O and workload costs may not scale together. Prefer
   fixed logical partitions or an assignment service when placement needs constraints.
8. **Treat membership as a data migration.** Publish a new epoch, copy and verify the newly
   owned ranges, coordinate reads/writes during handoff, activate the epoch, and retire old
   owners only after stale clients and in-flight work are bounded. Minimal remapping is not a
   migration protocol.

## Decision block

```text
Use a ring with virtual nodes when:
- membership changes are routine (autoscaling, rolling replacement) and the disruption
  budget forbids remapping the whole keyspace
- N is large enough that O(log N) lookup matters, or nodes have different capacities and
  weighting by virtual-node count is the natural expression of that
Use rendezvous (highest random weight) hashing when:
- N is small and changes rarely; O(N) hashes per lookup is cheaper than a ring plus its
  virtual-node tuning, and it gives even shares with no tuning at all
- you need the ordered list of candidates for a key (primary, then replicas) — rendezvous
  produces it directly, with probabilistic balance under a suitable hash
Use bounded-load consistent hashing when:
- a node has a hard capacity limit and overflow to the next node is preferable to
  overloading it, and clients can tolerate a key's owner depending on current load
Use hash(key) % N when:
- N is fixed for the lifetime of the data, and changing it is understood to be a full
  migration — a fixed set of logical partitions, for example, later mapped to physical nodes
Prefer a directory (sharding-and-partitioning) instead when:
- placement must be decided per key rather than computed — pinning a known-large tenant to
  its own node is a placement policy, and no hash function expresses it
```

## Rules

- `hash(key) % N` is a full remap on any change to N. The only safe use is with N fixed
  forever; if the code can ever add a node, the modulo is a latent migration.
- With equal nodes, a join moves **about K/(N+1)** keys to the new node; removing one moves
  its **about K/N** share. These are expectations over the hash and key population. This is
  not a guarantee for a particular key set, and it says nothing about how much _traffic_
  moves.
- **One point per node has high variance.** The shares are the gaps between N random points
  on a circle; virtual nodes
  exist for that, not for the disruption property, which the plain ring already has.
- Without virtual nodes, removing a node transfers its entire share to one successor. That
  successor's increment equals the failed node's share; it is not necessarily a doubling.
  With V virtual points the departing ranges usually spread across several successors.
- V costs memory and lookup time: the ring holds `V × N` entries, so lookup is O(log(V×N))
  and construction is O(V×N log(V×N)) with ordinary ordered-map insertion. Rebuild, snapshot
  publication and cache effects must be measured; V in the thousands per node is a data
  structure, not merely a tuning knob.
- **The hash must produce the same value in every process, on every JDK, forever.** Two
  clients that disagree about placement are two clients writing the same key to different
  owners. This rules out `Object.hashCode()` (identity-based), record and enum `hashCode()`
  (unspecified), and any library hash documented as version-unstable — Guava's
  `Hashing.goodFastHash` says so explicitly, while `Hashing.murmur3_128()` names a fixed
  algorithm.
- `String.hashCode()` **is** specified and deterministic, but it is only 32 bits and was not
  designed as a placement hash. Its distribution depends on the actual key set; do not infer
  pathological clustering from prefixes alone. Evaluate representative keys and prefer a
  pinned 64-bit-or-wider hash with good avalanche. A cryptographic or keyed hash may be
  justified for adversarial keys, at additional CPU cost.
- Consistent hashing distributes **keys**, never **traffic**. A perfectly even ring with one
  celebrity key still has one saturated node. That is not a hashing bug and no value of V
  fixes it — the diagnosis and the repairs are `hot-partitions-and-rebalancing`.
- Every participant must agree on the ring: the membership epoch, node set and weights, the
  virtual-node count, the full hash contract, and the exact string hashed to place a virtual
  node (`"node-3#7"` is not
  `"node-3-7"`). Version the membership and treat a change as a coordinated deployment, or
  route through one component that owns it. During a transition, old and new epochs need an
  explicit handoff and fencing policy; eventual membership dissemination alone permits
  split ownership and lost writes.
- Replication follows the ring by walking clockwise to the next R **distinct physical** nodes
  — skipping further virtual nodes of a node already chosen. Forgetting the distinctness
  check places every replica of a key on one machine, which is the failure the replication
  was bought to prevent.
- Do not use this to spread requests over interchangeable replicas. Consistent hashing pins a
  key to an owner deliberately; a least-request policy deliberately does not, and
  `load-balancing-and-routing` owns that decision.

## References

- [Consistent hashing and random trees](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf)
  — the original consistent-hashing model and disruption result.

- [The ring in Java](references/ring-in-java.md) — a `TreeMap<Long, String>` ring with
  virtual nodes, add and remove, the wrap-around branch, replica selection across distinct
  physical nodes, the hash-stability requirement in code, and a test that measures the
  fraction of keys that move when a node is added. Read when implementing or reviewing
  placement code.
- [Choosing the mapping function](references/mapping-functions.md) — modulo, ring with
  virtual nodes, rendezvous and bounded-load compared on disruption, lookup cost,
  distribution quality and implementation complexity, with a decision table and the hash
  function shortlist. Read when choosing between them, or when justifying a ring over the
  simpler option.
