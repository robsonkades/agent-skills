# Choosing the mapping function

Four functions solve "which node owns this key". They differ on one axis that matters —
what happens when membership changes — and on three that decide the engineering.

## Comparison

| Function                     | Keys moved on equal-node join / removal    | Lookup cost         | Distribution quality                               | Complexity                                            |
| ---------------------------- | ------------------------------------------ | ------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `hash(key) % N`              | Often a large fraction                     | O(1)                | Depends on hash and key population                 | Trivial                                               |
| Ring, one point per node     | About K/(N+1) / K/N                        | O(log N)            | High variance — random gaps differ widely          | Small, but collision and wrap-around handling matter  |
| Ring with V virtual nodes    | About K/(N+1) / K/N                        | O(log(V×N))         | Tunable: raise V until measured skew is acceptable | V and membership handoff require engineering          |
| Rendezvous (HRW)             | About K/(N+1) / K/N                        | O(N) hashes per key | Probabilistically even; no virtual-point tuning    | Framing, unsigned order and deterministic ties matter |
| Bounded-load consistent hash | Algorithm-specific, plus load displacement | Algorithm-specific  | Configured capacity bound under its assumptions    | Placement depends on agreed live state                |

K is the number of keys, N the number of nodes.

## Modulo

Modulo can distribute a uniform hash well, but changing the divisor usually moves a large
fraction of keys. An N-to-N+1 change moves about N/(N+1) under uniform residues; other changes
depend on both divisors and the node-index mapping. The two useful stable arrangements:

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

This is a partial Java helper: `UTF_8` is `StandardCharsets.UTF_8`, and `HASH` is a pinned
Guava `HashFunction`, for example `Hashing.murmur3_128()`. Node IDs must be unique, stable
physical-node identities; duplicate IDs in the input must not become duplicate replicas.

Lengths prevent ambiguous tuples such as (`"ab"`, `"c"`) and (`"a"`, `"bc"`) from hashing
the same byte sequence. For this Guava example, integer lengths are little-endian; `asLong()`
reads the first eight hash bytes little-endian. Java `String.compareTo` breaks score ties by UTF-16
code-unit order, which a port must reproduce or replace through an explicit contract change.
Define allowed key/ID encoding, normalization and malformed-input behavior. Java
[`String.getBytes(Charset)`](<https://docs.oracle.com/en/java/javase/16/docs/api/java.base/java/lang/String.html#getBytes(java.nio.charset.Charset)>)
replaces malformed UTF-16, so selecting UTF-8 alone does not establish identical bytes across clients.
The pinned Guava ring example follows that path through
[`AbstractHasher.putString`](https://github.com/google/guava/blob/v33.4.8/guava/src/com/google/common/hash/AbstractHasher.java).
Reject unpaired surrogates at the input boundary before hashing or membership mutation, or specify
and test identical replacement behavior. Include malformed inputs, valid supplementary characters,
normalization-sensitive strings and score ties in agreement tests. Changing this policy for existing
keys is a placement-contract change, not an automatic cleanup.

Properties that fall out of the definition rather than out of tuning:

- Removing a node changes the owner only for keys whose maximum it was — about K/N — and
  those keys go to their own second-highest weight, which is spread across all survivors.
  The ring needs virtual nodes to get that spreading; rendezvous has it inherently.
- Sorting the nodes by weight gives the **ordered replica list** for a key directly, so
  primary and R−1 successors come from one computation, with distinct physical nodes by
  construction when the input IDs are unique. Hashing costs O(N); fully sorting the scores adds
  O(N log N) comparison work. Replica ranking is useful, not free. Enforce required failure domains
  separately; physical distinctness alone does not provide zone or rack separation.
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

The [original bounded-load model](https://research.google/blog/consistent-hashing-with-bounded-loads/)
bounds the number of unit-size balls assigned to each bin, using agreed allocation state
and ordering. It does not by itself bound arbitrary key sizes, CPU cost or request rates.
For those, require a documented weighted/admission variant and prove that its capacity unit
matches the resource being protected. Independent clients using approximate live metrics
can disagree on ownership or race past a capacity bound. Changes in the key population can
also displace existing keys without a membership change; persistent data needs an explicit
movement protocol. Request-routing variants belong with `load-balancing-and-routing`.

It does not solve a single key that is too hot — one key has one owner under every function
here. That is `hot-partitions-and-rebalancing`.

## The hash function

Requirements, in order:

1. **Specified value.** The same input must produce the same output in every participant using
   the same placement-contract version. Disqualified: default `Object.hashCode()` (identity), record and enum
   `hashCode()` (unspecified), and `Objects.hash(...)` (only 32 bits, potentially allocating,
   and only as stable as every component hash), plus
   any library function documented as version-unstable — Guava's `Hashing.goodFastHash`
   states this in its own contract, `Hashing.murmur3_128()` names a fixed algorithm.
2. **Good avalanche.** Small input changes should mix across output bits. `String.hashCode()`
   is a specified 31-multiply accumulator, not a placement hash; shared prefixes alone do
   not prove poor distribution. Measure actual key sets rather than infer skew from names.
3. **64 bits or more.** Collision probability follows the birthday bound and depends on the
   number of points; quantify it for the topology. Regardless of width, the representation
   must retain colliding points instead of silently transferring ownership.
4. **Fits the lookup budget.** Measure the pinned implementation on representative keys.
   Cryptographic or keyed hashes may be justified by adversarial inputs; MD5 and SHA-1 in
   older ketama implementations do not establish a security guarantee.

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
- the measured O(N) hashing and required candidate-ranking cost fit the lookup budget,
  and avoiding virtual-point tuning or obtaining ranked replicas is useful
Use a ring with virtual nodes when:
- N is large enough that O(N) per lookup is measurable, or nodes are heterogeneous and
  capacity weighting by virtual-node count is the natural expression
Use fixed logical partitions with an explicit assignment map when:
- placement must sometimes be overridden per partition (a large tenant on its own node), or
  you want membership changes to move whole partitions rather than recompute keys
Use bounded-load when:
- the algorithm's capacity model matches the protected resource, coordinated allocation
  is available, and displaced keys can be moved safely
Reject direct hash(key) % physicalNodeCount when:
- node count changes and the resulting rehash migration exceeds the disruption budget
```

## Primary API references

- [Guava 33.4.8 Hashing](https://guava.dev/releases/33.4.8-jre/api/docs/com/google/common/hash/Hashing.html) —
  fixed Murmur3 variant/seed versus process-specific `goodFastHash`.
- [Guava 33.4.8 HashCode](https://guava.dev/releases/33.4.8-jre/api/docs/com/google/common/hash/HashCode.html) —
  little-endian `asLong` and hashing API byte order.
- [Java 16 String](https://docs.oracle.com/en/java/javase/16/docs/api/java.base/java/lang/String.html) —
  UTF-16 representation and lexicographic `compareTo` at the example's compatibility baseline.
