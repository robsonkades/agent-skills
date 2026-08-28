# Choosing the mapping function

Four functions solve "which node owns this key". They differ on one axis that matters —
what happens when membership changes — and on three that decide the engineering.

## Comparison

| Function                     | Keys moved when one node joins or leaves    | Lookup cost           | Distribution quality                                    | Complexity                                              |
| ---------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `hash(key) % N`              | Nearly all of them                          | O(1)                  | Excellent while N is fixed                              | Trivial                                                 |
| Ring, one point per node     | About K/N                                   | O(log N)              | Poor — gaps between N random points vary widely         | Small, and the wrap-around is the part people omit      |
| Ring with V virtual nodes    | About K/N                                   | O(log(V×N))           | Tunable: raise V until the max/mean share is acceptable | V must be chosen by measurement; ring holds V×N entries |
| Rendezvous (HRW)             | About K/N                                   | O(N) hashes per key   | Even by construction, no tuning                         | A loop and a max; nothing to get wrong                  |
| Bounded-load consistent hash | About K/N, plus displacement as loads shift | O(log(V×N)) amortised | Hard cap on any node's share                            | Needs live per-node load, so placement depends on state |

K is the number of keys, N the number of nodes.

## Modulo

`hash(key) % N` is not a bad hash; it is a bad _mapping_. The distribution is ideal and the
disruption is catastrophic: changing N changes the divisor, so almost every key's result
changes. The two shapes where it is nonetheless correct:

- N is fixed for the lifetime of the data and changing it is understood as a full migration.
- N is a fixed count of **logical** partitions, far larger than the node count, which are
  then assigned to physical nodes by a separate (usually explicit) map. Adding a node moves
  whole logical partitions and never rehashes a key. This is the standard escape hatch, and
  it converts the placement problem into an assignment problem you can solve by hand or by
  policy — including pinning a large partition to its own node.

## Rendezvous, and why it is often the better choice

For each node, compute `w = hash(key, node)`; the owner is the node with the highest `w`.

```java
static String owner(String key, Collection<String> nodes) {
    return nodes.stream()
            .max(Comparator.comparingLong(n ->
                    HASH.newHasher().putString(key, UTF_8).putString(n, UTF_8).hash().asLong()))
            .orElseThrow();
}
```

Properties that fall out of the definition rather than out of tuning:

- Removing a node changes the owner only for keys whose maximum it was — about K/N — and
  those keys go to their own second-highest weight, which is spread across all survivors.
  The ring needs virtual nodes to get that spreading; rendezvous has it inherently.
- Sorting the nodes by weight gives the **ordered replica list** for a key directly, so
  primary and R−1 successors come from one computation, with distinct physical nodes by
  construction.
- Capacity weighting is available too, at the cost of a more careful weight function than a
  plain multiply; if nodes are homogeneous this never comes up.

The cost is O(N) hashes per lookup. At small N that is a handful of nanoseconds and no
tuning; at large N it dominates, and that is when the ring's O(log(V×N)) earns its
complexity. **For a small, stable node set, rendezvous is the simpler engineering choice and
picking a ring instead is usually cargo cult.**

## Bounded-load

Consistent hashing bounds _disruption_, not _load_. Bounded-load consistent hashing adds a
cap: a node may hold at most a configured factor above the average load, and a key whose
computed owner is at its cap moves to the next node clockwise that is not.

It solves overload from uneven key **sizes or rates**, at three prices: placement now depends
on live load, so it is no longer a pure function of the key and the membership; every client
must agree on load or they will disagree about ownership; and a key's owner can change
without any membership change, which a data store usually cannot tolerate. It fits caches and
request routing far better than it fits stored data.

It does not solve a single key that is too hot — one key has one owner under every function
here. That is `hot-partitions-and-rebalancing`.

## The hash function

Requirements, in order:

1. **Specified value.** The same input must produce the same output in every process, on
   every JDK, forever. Disqualified: `Object.hashCode()` (identity), record and enum
   `hashCode()` (unspecified), `Objects.hash(...)` (order- and implementation-dependent), and
   any library function documented as version-unstable — Guava's `Hashing.goodFastHash`
   states this in its own contract, `Hashing.murmur3_128()` names a fixed algorithm.
2. **Good avalanche.** One bit of input changes about half the output bits. `String.hashCode()`
   is stable but fails this: it is a 31-multiply accumulator whose low bits barely move for
   keys sharing a prefix, and real keys share prefixes (`user:1001`, `user:1002`).
3. **64 bits or more.** With V×N ring points, a 32-bit space starts producing position
   collisions, which silently transfer a virtual node from one owner to another.
4. **Fast.** Placement is on every request. A cryptographic hash is correct here and simply
   more expensive than the job requires; MD5 and SHA-1 appear in older ketama implementations
   for historical reasons, not for their security properties.

MurmurHash3 (128-bit, truncated to 64) and xxHash both satisfy all four. Whichever is chosen,
pin it: a golden-file test over a fixed node list, so that changing the hash — or reformatting
the string fed to it — fails a build instead of splitting the cluster's view of ownership.

## Decision

```text
Use rendezvous hashing when:
- N is small (a handful to a few dozen) and you want an ordered replica list for free
Use a ring with virtual nodes when:
- N is large enough that O(N) per lookup is measurable, or nodes are heterogeneous and
  capacity weighting by virtual-node count is the natural expression
Use fixed logical partitions with an explicit assignment map when:
- placement must sometimes be overridden per partition (a large tenant on its own node), or
  you want membership changes to move whole partitions rather than recompute keys
Use bounded-load when:
- per-key cost varies enough that even key distribution still overloads a node, the workload
  is a cache or request routing, and every client can observe the same load signal
Never use hash(key) % N when:
- the node count can change while the data or the cache contents outlive the change
```
