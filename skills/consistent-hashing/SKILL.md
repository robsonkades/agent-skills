---
name: consistent-hashing
description: >
  The function that maps a key to an owner, and what happens when membership changes: why
  hash(key) % N remaps almost every key when N changes; the ring, where a key belongs to the
  first node clockwise so a change moves only about K/N keys; virtual nodes as the fix for
  the ring's uneven shares; rendezvous hashing as the simpler alternative; and the Java
  shape — a TreeMap ring with ceilingEntry plus firstEntry for the wrap-around, and a hash
  whose value is specified in every process and on every JDK. Use when reviewing key-to-node
  placement, when a % nodeCount appears in routing code, when adding a node causes a miss
  storm or a large migration, when nodes hold visibly unequal shares, or when
  Object.hashCode is used to place data. Does not cover whether to shard or on what key
  (sharding-and-partitioning), traffic skew on a correctly hashed keyspace
  (hot-partitions-and-rebalancing), cache placement (cache-sharding-and-replication), or
  balancing requests across interchangeable replicas (load-balancing-and-routing).
---

# Consistent Hashing

## Purpose

Own one function: given a key and a set of nodes, which node holds it — and how much of that
mapping survives when a node joins or leaves. Nothing else in the partitioning family
computes placement; this skill is where any hashing arithmetic belongs.

The failure this prevents is `hash(key) % N`. It distributes perfectly and stays correct
until the day N changes, at which point nearly every key maps somewhere new — for a cache a
fleet-wide miss storm in one step, for a store a migration of nearly the whole dataset,
discovered when someone adds a node to relieve pressure and the rebalance becomes the outage.
The second failure is subtler: a ring with one point per node is _not_ well balanced, so a
naive implementation gets minimal disruption while handing one node several times another's
share.

## Workflow

1. **State the disruption budget.** How many keys may change owner when one node joins or
   leaves? `% N` gives you nearly all of them; a ring or rendezvous gives you about K/N. This
   is the only property that distinguishes the mapping functions on correctness.
2. **Count the nodes.** With a small, rarely changing membership, rendezvous hashing is fewer
   moving parts than a ring and needs no virtual-node tuning. A ring earns its complexity at
   larger N or where lookup must be sub-linear.
3. **Choose a hash whose value is specified**, is identical in every process and on every
   JDK, and has good avalanche — MurmurHash3 or xxHash by role. See
   `references/mapping-functions.md` for what disqualifies the obvious candidates.
4. **Pick V by measurement, not by folklore.** Simulate the intended key population over the
   intended node count and raise the virtual nodes per physical node until the largest node's
   share divided by the mean is inside tolerance. Record V and the measured ratio.
5. **Implement the wrap-around explicitly.** `ceilingEntry(h)` returning `null` means the key
   hashed past the last point on the ring and belongs to the first entry. This single branch
   is the most commonly omitted line in the pattern.
6. **Test the property, not the output.** Assert that adding one node to N moves
   approximately K/(N+1) keys and no more, and that every key not moved still resolves to its
   previous owner. The implementation and the test are in `references/ring-in-java.md`.
7. **Weight by capacity if the nodes are heterogeneous** — a node with twice the memory gets
   twice the virtual nodes. Weighting is the only legitimate reason for shares to differ.

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
  produces it by construction
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
- The ring's disruption result is **about K/N keys move**, in expectation over the hash. It
  is not a guarantee for a particular key set, and it says nothing about how much _traffic_
  moves.
- **One point per node is not balanced.** The shares are the gaps between N random points on
  a circle, so the largest is a multiple of the smallest at any realistic N. Virtual nodes
  exist for that, not for the disruption property, which the plain ring already has.
- Without virtual nodes, removing a node transfers its entire share to exactly one successor
  — the node most likely to fail next is the one that just inherited a doubled load. With V
  virtual nodes the departing load spreads across many successors.
- V costs memory and lookup time: the ring holds `V × N` entries, so lookup is O(log(V×N))
  and construction is O(V×N). It is bounded and cheap, but it is not free, and V in the
  thousands per node is a data structure, not a tuning knob.
- **The hash must produce the same value in every process, on every JDK, forever.** Two
  clients that disagree about placement are two clients writing the same key to different
  owners. This rules out `Object.hashCode()` (identity-based), record and enum `hashCode()`
  (unspecified), and any library hash documented as version-unstable — Guava's
  `Hashing.goodFastHash` says so explicitly, while `Hashing.murmur3_128()` names a fixed
  algorithm.
- `String.hashCode()` **is** specified, so it is stable — its problem is distribution. It is
  a 32-bit value with weak avalanche that clusters badly for keys sharing a prefix or suffix,
  which is exactly what real keys look like (`user:1001`, `user:1002`). Use a 64-bit
  non-cryptographic hash with good avalanche instead. A cryptographic hash works and is
  simply more expensive than the job needs.
- Consistent hashing distributes **keys**, never **traffic**. A perfectly even ring with one
  celebrity key still has one saturated node. That is not a hashing bug and no value of V
  fixes it — the diagnosis and the repairs are `hot-partitions-and-rebalancing`.
- Every participant must agree on the ring: the node set, the virtual-node count, the hash
  function, and the exact string hashed to place a virtual node (`"node-3#7"` is not
  `"node-3-7"`). Version the membership and treat a change as a coordinated deployment, or
  route through one component that owns it.
- Replication follows the ring by walking clockwise to the next R **distinct physical** nodes
  — skipping further virtual nodes of a node already chosen. Forgetting the distinctness
  check places every replica of a key on one machine, which is the failure the replication
  was bought to prevent.
- Do not use this to spread requests over interchangeable replicas. Consistent hashing pins a
  key to an owner deliberately; a least-request policy deliberately does not, and
  `load-balancing-and-routing` owns that decision.

## References

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
