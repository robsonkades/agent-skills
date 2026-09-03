# Choosing the mapping function

Four functions solve "which node owns this key". They differ on one axis that matters —
what happens when membership changes — and on three that decide the engineering.

## Comparison

| Function                     | Keys moved on equal-node join / removal    | Lookup cost         | Distribution quality                               | Complexity                                            |
| ---------------------------- | ------------------------------------------ | ------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `hash(key) % N`              | Nearly all of them                         | O(1)                | Excellent while N is fixed                         | Trivial                                               |
| Ring, one point per node     | About K/(N+1) / K/N                        | O(log N)            | High variance — random gaps differ widely          | Small, but collision and wrap-around handling matter  |
| Ring with V virtual nodes    | About K/(N+1) / K/N                        | O(log(V×N))         | Tunable: raise V until measured skew is acceptable | V and membership handoff require engineering          |
| Rendezvous (HRW)             | About K/(N+1) / K/N                        | O(N) hashes per key | Probabilistically even; no virtual-point tuning    | Framing, unsigned order and deterministic ties matter |
| Bounded-load consistent hash | Algorithm-specific, plus load displacement | Algorithm-specific  | Configured capacity bound under its assumptions    | Placement depends on agreed live state                |

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
static long score(String key, String node) {
    byte[] k = key.getBytes(UTF_8);
    byte[] n = node.getBytes(UTF_8);
    return HASH.newHasher()
            .putInt(k.length).putBytes(k)
            .putInt(n.length).putBytes(n)
            .hash().asLong();
}

static String owner(String key, Collection<String> nodes) {
    return nodes.stream()
            .max((a, b) -> {
                int byScore = Long.compareUnsigned(score(key, a), score(key, b));
                return byScore != 0 ? byScore : a.compareTo(b);
            })
            .orElseThrow();
}
```

Lengths prevent ambiguous tuples such as (`"ab"`, `"c"`) and (`"a"`, `"bc"`) from hashing
the same byte sequence. Pin the integer encoding used by the chosen library, and define a
stable node-ID tie-breaker for the rare equal score.

Properties that fall out of the definition rather than out of tuning:

- Removing a node changes the owner only for keys whose maximum it was — about K/N — and
  those keys go to their own second-highest weight, which is spread across all survivors.
  The ring needs virtual nodes to get that spreading; rendezvous has it inherently.
- Sorting the nodes by weight gives the **ordered replica list** for a key directly, so
  primary and R−1 successors come from one computation, with distinct physical nodes by
  construction.
- Capacity weighting is available too, but weighted rendezvous requires a mathematically
  valid transformation; multiplying a uniform score by a weight generally gives the wrong
  ownership probabilities. Use and test a documented weighted variant.

The cost is O(N) hashes per lookup. Whether it matters depends on N, hash implementation,
batching and the request budget; benchmark the full lookup. At larger N a ring or a
hierarchical/candidate-reducing variant may earn its added complexity.

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
   `hashCode()` (unspecified), and `Objects.hash(...)` (only 32 bits, potentially allocating,
   and only as stable as every component hash), plus
   any library function documented as version-unstable — Guava's `Hashing.goodFastHash`
   states this in its own contract, `Hashing.murmur3_128()` names a fixed algorithm.
2. **Good avalanche.** One bit of input changes about half the output bits. `String.hashCode()`
   is stable but fails this: it is a 31-multiply accumulator whose low bits barely move for
   keys sharing a prefix, and real keys share prefixes (`user:1001`, `user:1002`).
3. **64 bits or more.** Collision probability follows the birthday bound and depends on the
   number of points; quantify it for the topology. Regardless of width, the representation
   must retain colliding points instead of silently transferring ownership.
4. **Fast.** Placement is on every request. A cryptographic hash is correct here and simply
   more expensive than the job requires; MD5 and SHA-1 appear in older ketama implementations
   for historical reasons, not for their security properties.

Specific MurmurHash3 and xxHash variants can satisfy these requirements. Pin the exact
algorithm/variant, seed, charset, tuple framing, integer byte order, truncation and unsigned
comparison semantics, plus the library version or an independently specified format. Use
golden vectors shared across every language/runtime. If tenants can choose keys adversarially,
consider a secret-keyed placement hash or an admission control layer; fast non-cryptographic
hashes do not provide denial-of-service resistance.

Modulo implementations also need explicit unsigned or `floorMod` semantics: Java `%` can
produce a negative remainder for a negative hash. This fixes indexing, not remapping when N
changes.

## Reconfiguration is a protocol

All clients computing placement must use a coherent membership epoch. During E→E+1, copying
the affected ranges is not enough: concurrent writes need fencing and a change-capture,
dual-write or forwarding strategy; readers need defined old/new-epoch behavior; activation
and retirement need observable completion criteria. A ring minimizes the data affected but
does not supply consensus, atomic membership, recovery or rollback.

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
