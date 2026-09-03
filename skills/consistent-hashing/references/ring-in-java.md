# The ring in Java

The canonical shape is an ordered map from a collision-safe ring point to physical node.
`ceilingEntry` finds the first point clockwise; `firstEntry` is the wrap-around. A plain
`Map<Long, String>` is subtly wrong: two virtual points with the same 64-bit hash cause one
to overwrite the other, and removing either cannot reconstruct the lost point.

```java
public final class HashRing {
    // Fixed, specified algorithm. Never Object.hashCode(), a record's hashCode, or any
    // hash documented as unstable across versions (Guava's Hashing.goodFastHash says so).
    private static final HashFunction HASH = Hashing.murmur3_128();

    private record RingPoint(long hash, String token) implements Comparable<RingPoint> {
        @Override public int compareTo(RingPoint other) {
            int byHash = Long.compareUnsigned(hash, other.hash);
            return byHash != 0 ? byHash : token.compareTo(other.token);
        }
    }

    private final NavigableMap<RingPoint, String> ring = new TreeMap<>();
    private final Map<String, Integer> weights = new HashMap<>();
    private final int vnodesPerWeight;

    public HashRing(int vnodesPerWeight) {
        if (vnodesPerWeight <= 0) throw new IllegalArgumentException("vnodesPerWeight");
        this.vnodesPerWeight = vnodesPerWeight;
    }

    private static long position(String s) {
        return HASH.hashString(s, StandardCharsets.UTF_8).asLong();
    }

    // The exact string hashed here is part of the wire contract: every process that
    // resolves a key must build identical positions, so "node#i" may never be reformatted.
    private static String point(String node, int i) { return node + '#' + i; }

    public synchronized void add(String node, int weight) {
        if (node == null || node.isBlank()) throw new IllegalArgumentException("node");
        if (weight <= 0) throw new IllegalArgumentException("weight");
        if (weights.putIfAbsent(node, weight) != null) return;
        int count = Math.multiplyExact(vnodesPerWeight, weight);
        for (int i = 0; i < count; i++) {
            String token = point(node, i);
            ring.put(new RingPoint(position(token), token), node);
        }
    }

    public synchronized void remove(String node) {
        Integer weight = weights.remove(node);
        if (weight == null) return;
        int count = Math.multiplyExact(vnodesPerWeight, weight);
        for (int i = 0; i < count; i++) {
            String token = point(node, i);
            ring.remove(new RingPoint(position(token), token));
        }
    }

    public synchronized String owner(String key) {
        if (ring.isEmpty()) throw new IllegalStateException("empty ring");
        RingPoint h = new RingPoint(position(key), "");
        Map.Entry<RingPoint, String> e = ring.ceilingEntry(h);
        return e != null ? e.getValue() : ring.firstEntry().getValue();   // wrap-around
    }

    /** Primary first, then successors, skipping further vnodes of a node already chosen. */
    public synchronized List<String> owners(String key, int replicas) {
        if (ring.isEmpty()) return List.of();
        if (replicas <= 0 || replicas > weights.size()) {
            throw new IllegalArgumentException("replicas");
        }
        RingPoint h = new RingPoint(position(key), "");
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
- **Collision-safe ordering.** The token is a deterministic tie-breaker, so equal 64-bit
  positions coexist. `asLong()` truncation is acceptable only as part of a pinned library,
  version and byte-order contract. A collision should affect ordering, never delete topology.
- **Input and overflow validation.** Zero/negative weights, blank node IDs, multiplication
  overflow and impossible replica counts are configuration errors, not partial rings.
- **`synchronized` on the whole class** is adequate only because membership changes are rare
  and `owner` is short. For placement on the hot path, publish an immutable snapshot behind a
  `volatile` field so readers never block; the visibility rules are `java-memory-model`.

## Choosing V

There is no correct constant. Measure over relevant node counts, multiple seeds and realistic
key sets:

```java
Map<String, Long> perNode = keys.stream()
        .collect(Collectors.groupingBy(ring::owner, Collectors.counting()));
double worstRatio = Collections.max(perNode.values()) * (double) nodeCount / keys.size();
```

Repeat the calculation for key count, bytes, requests per second and estimated service cost;
uniform key count can hide a catastrophically skewed workload. Raise V until the relevant
ratios are inside tolerance, then stop — the ring costs `V × N` entries and
`O(log(V × N))` per lookup. Record V and the evidence next to the constant. Heterogeneous
hardware can be approximated with `weight`, but twice the memory does not necessarily mean
twice the CPU, I/O or safe request rate. Validate weights under load.

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

Two more worth having. **Balance:** with the chosen V, count/byte/rate/cost ratios stay under
the recorded tolerance across several node counts and key sets. **Cross-process agreement:**
the positions for a fixed node list, held as a golden file, must be reproduced byte-for-byte
by the current code — the
regression test for someone "tidying" the `node + '#' + i` format or swapping the hash, both
silent, and both of which split the cluster's view of ownership. Include algorithm variant,
seed, encoding, framing, unsigned ordering and collision cases in those vectors.

## Membership handoff

A deterministic ring is not a safe reconfiguration protocol. A production transition needs
an explicit state machine, for example:

1. Propose epoch E+1 and reject concurrent incompatible topology changes.
2. Copy newly owned ranges while E remains authoritative; checkpoint progress and verify
   counts, checksums or application invariants.
3. Cover concurrent writes with versioned dual-write, write forwarding, or a change log. Use
   fencing/epochs so an old owner cannot accept an unobservable late write.
4. Atomically publish E+1 to routers or use request-carried epochs plus compatible reads.
5. Retire E only after in-flight requests, stale clients and rollback requirements are
   bounded; observe migration bandwidth, errors and per-owner load throughout.

The exact mechanism is datastore-specific. Merely broadcasting a new node list and copying
in the background creates split ownership, stale reads and lost writes during the interval.
