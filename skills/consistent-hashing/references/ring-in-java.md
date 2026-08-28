# The ring in Java

The canonical shape is a `NavigableMap<Long, String>` from ring position to physical node
name. `ceilingEntry` finds the first point clockwise; `firstEntry` is the wrap-around.

```java
public final class HashRing {
    // Fixed, specified algorithm. Never Object.hashCode(), a record's hashCode, or any
    // hash documented as unstable across versions (Guava's Hashing.goodFastHash says so).
    private static final HashFunction HASH = Hashing.murmur3_128();

    private final NavigableMap<Long, String> ring = new TreeMap<>();
    private final Map<String, Integer> weights = new HashMap<>();
    private final int vnodesPerWeight;

    public HashRing(int vnodesPerWeight) { this.vnodesPerWeight = vnodesPerWeight; }

    private static long position(String s) {
        return HASH.hashString(s, StandardCharsets.UTF_8).asLong();
    }

    // The exact string hashed here is part of the wire contract: every process that
    // resolves a key must build identical positions, so "node#i" may never be reformatted.
    private static String point(String node, int i) { return node + '#' + i; }

    public synchronized void add(String node, int weight) {
        if (weights.putIfAbsent(node, weight) != null) return;
        for (int i = 0; i < vnodesPerWeight * weight; i++) {
            ring.put(position(point(node, i)), node);
        }
    }

    public synchronized void remove(String node) {
        Integer weight = weights.remove(node);
        if (weight == null) return;
        for (int i = 0; i < vnodesPerWeight * weight; i++) {
            // Two-argument remove: on a position collision, leaves the other node's point.
            ring.remove(position(point(node, i)), node);
        }
    }

    public synchronized String owner(String key) {
        if (ring.isEmpty()) throw new IllegalStateException("empty ring");
        long h = position(key);
        Map.Entry<Long, String> e = ring.ceilingEntry(h);
        return e != null ? e.getValue() : ring.firstEntry().getValue();   // wrap-around
    }

    /** Primary first, then successors, skipping further vnodes of a node already chosen. */
    public synchronized List<String> owners(String key, int replicas) {
        if (ring.isEmpty()) return List.of();
        long h = position(key);
        return Stream.concat(ring.tailMap(h, true).values().stream(),
                             ring.headMap(h, false).values().stream())
                .distinct()          // distinct PHYSICAL nodes — see below
                .limit(replicas)
                .toList();
    }
}
```

Four details that are wrong in most copies of this code:

- **The wrap-around.** `ceilingEntry` returns `null` for any key hashing past the last point;
  omitting the `firstEntry()` fallback throws `NullPointerException` for exactly those keys —
  a slice small enough to survive a smoke test.
- **`distinct()` in `owners`.** Without it, walking clockwise returns the _next virtual nodes_,
  usually belonging to a node already selected, so every replica of the key lands on one
  machine and the replication buys nothing.
- **`asLong()` on a 128-bit hash** takes the first 64 bits, which is fine. Truncating to `int`
  is not: with thousands of ring points, a 32-bit space starts to collide.
- **`synchronized` on the whole class** is adequate only because membership changes are rare
  and `owner` is short. For placement on the hot path, publish an immutable snapshot behind a
  `volatile` field so readers never block; the visibility rules are `java-memory-model`.

## Choosing V

There is no correct constant. Measure, over the intended node count and a realistic key set:

```java
Map<String, Long> perNode = keys.stream()
        .collect(Collectors.groupingBy(ring::owner, Collectors.counting()));
double worstRatio = Collections.max(perNode.values()) * (double) nodeCount / keys.size();
```

Raise V until `worstRatio` is inside tolerance, then stop — the ring costs `V × N` entries and
`O(log(V × N))` per lookup. Record V and the measured ratio next to the constant, or the next
person changes it by intuition. Heterogeneous hardware is expressed as `weight` instead —
twice the memory, twice the vnodes — and is the only legitimate cause of unequal shares.

## The test that proves the property

```java
@Test
void addingANodeOnlyStealsKeys() {
    List<String> keys = IntStream.range(0, 100_000).mapToObj(i -> "user:" + i).toList();
    HashRing before = ringOf(V, "n1", "n2", "n3", "n4");
    Map<String, String> was = keys.stream().collect(Collectors.toMap(k -> k, before::owner));
    HashRing after = ringOf(V, "n1", "n2", "n3", "n4", "n5");

    List<String> moved =
            keys.stream().filter(k -> !after.owner(k).equals(was.get(k))).toList();

    // 1. Bounded disruption: about K/(N+1) keys change owner.
    assertThat(moved.size() / (double) keys.size()).isCloseTo(1.0 / 5, within(0.02));

    // 2. The stronger property, and the one a broken hash actually violates: a join may
    //    only take keys FOR the new node. No key may move between two pre-existing nodes.
    assertThat(moved).allSatisfy(k -> assertThat(after.owner(k)).isEqualTo("n5"));
}
```

Assertion 2 is the one that catches a real bug. `hash(key) % N` passes neither; a ring with a
mis-ordered comparison or an `int` position passes assertion 1 by luck and fails assertion 2.

Two more worth having. **Balance:** with the chosen V, `worstRatio` stays under the recorded
tolerance across several node counts. **Cross-process agreement:** the positions for a fixed
node list, held as a golden file, must be reproduced byte-for-byte by the current code — the
regression test for someone "tidying" the `node + '#' + i` format or swapping the hash, both
silent, and both of which split the cluster's view of ownership.
