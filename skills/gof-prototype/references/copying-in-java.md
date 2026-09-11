# Copying in Java

Java 17 partial snippets: imports, domain types and persistence infrastructure are omitted.
Verify the target copy API and provider rather than assuming the illustrative policies fit all types.

## Cloneable limitations

- Cloneable is a marker, not a public copy interface. Object.clone is protected; a public override
  may be inherited, but a Cloneable reference itself exposes no clone method.
- Object.clone copies fields without running constructors. A valid source may still yield a valid
  clone; constructor bypass does not by itself violate invariants. Audit identity, ownership and
  any mutable state changed since construction.
- The default copy aliases reference fields. Repairing independently owned final mutable fields
  in a super.clone result is awkward because normal Java code cannot reassign them. Explicit
  construction can apply a deep/selective policy; being a final class is not itself a clone defect.
- Calling super.clone is the conventional way to preserve runtime subtype. An extensible hierarchy
  must maintain its contract in subclasses; compatible existing implementations may be retained.
- Arrays support a useful shallow clone (nested arrays/elements are still shared). Records do not
  generate withers, and their components are not necessarily deeply immutable.

Prefer explicit construction for new APIs when it exposes the policy more clearly. Do not break an
inherited public clone contract just because another spelling is preferred.

## Copy constructor, copy factory, wither

```java
// copy constructor — best when the concrete type is known
public Config(Config other) {
    this.name = other.name;                       // immutable: share
    this.limits = new EnumMap<>(other.limits);    // mutable: copy
    this.listeners = new ArrayList<>();          // subscriptions do not transfer
}

// copy factory — best when the return type should be an interface,
// or when the copy may return the same instance for immutable inputs
public static Config copyOf(Config other) {
    return other.isImmutable() ? other : new Config(other);
}

// wither — best when "the same, but for one field"
public Retry withMaxAttempts(int maxAttempts) {
    return new Retry(maxAttempts, this.backoff, this.jitter);
}

// polymorphic copy — when the concrete type is genuinely unknown
public interface Template {
    Template copy();          // your contract, your documentation, public
}
```

The polymorphic copy interface is useful when runtime type preservation is required; copy
constructors/factories may express Prototype intent for known types too. Declare **which fields are
shared, duplicated or reset**, whether the result must be fresh, and which subtype and failure
contracts callers may rely on. An inherited `copy()` that constructs the base class can lose a
subclass's state even though its return type compiles. A documented base projection or immutable
same-instance result may be valid; preserve an existing public clone contract where required.

## Deep or shallow, per field

| Field kind                                                 | Copy?                                                                    | Reasoning                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Primitive, `String`, `Instant`, record of these            | Share                                                                    | Immutable; copying wastes allocation                                                 |
| List/Map/Set of immutable values                           | Copy mutable container if independently owned; share immutable container | Unmodifiable views can still reflect mutable backing data                            |
| Array                                                      | `clone()` or `Arrays.copyOf`                                             | Always mutable                                                                       |
| Mutable domain object owned by this one                    | Copy                                                                     | Otherwise two owners mutate one object                                               |
| Mutable object shared by design (a cache, a pool, a clock) | Share                                                                    | Copying it would create a second cache, which is a bug                               |
| Back-reference to a parent                                 | Rewire, not copy                                                         | Copying follows the graph upward and duplicates the world                            |
| Identity (@Id, version, created-at)                        | Reset for new entity; preserve where snapshot contract requires          | JVM object identity and persistent identity are different                            |
| Listener/observer registration                             | Usually drop or explicitly recreate                                      | Copying a subject list and copying an external subscription are different operations |
| Open resource (stream, connection, lock)                   | Do not copy — refuse                                                     | Two owners, one resource, undefined close semantics                                  |

A copied subject listener list may notify the original subscribers from another subject; it does
not automatically register the new object with external publishers. A copied closeable may share
one underlying resource. Reopen or share only with an explicit lifecycle/ownership protocol.
If an attempted copy acquires resources and later fails, release only its newly owned resources
according to that protocol; leave source/shared ownership intact and preserve failure evidence.
Discarding an unpublished object or copy map does not close external resources.

## Cycles and identity

A naive depth-first copy of a graph with cycles does not terminate, and one with shared nodes
duplicates them — so `a.child == b.child` in the original becomes two distinct objects in the
copy, and any logic depending on that identity changes behaviour.

```java
Node copy(Node n, IdentityHashMap<Node, Node> seen, int depth) {
    if (n == null) return null;
    if (depth > 64) throw new IllegalArgumentException("copy depth exceeded");
    Node existing = seen.get(n);
    if (existing != null) return existing;
    if (seen.size() >= 10_000) throw new IllegalArgumentException("copy node budget exceeded");
    Node copy = new Node(n.value()); // value must be immutable or copied by its own policy
    seen.put(n, copy);                    // register BEFORE recursing
    n.children().forEach(c -> copy.add(copy(c, seen, depth + 1)));
    return copy;
}
```

`IdentityHashMap`, not `HashMap`: `equals`-equal nodes that are distinct objects must stay
distinct. Start each operation with a fresh map and depth 0. Registering before recursing handles
cycles; illustrative depth/node limits reject large graphs instead of claiming arbitrary graph
support. Also bound edges, payload sizes and total work for untrusted graphs; these two counters
alone do not bound a node with huge fan-out. On failure discard the partial result/map.

If this code is needed, compare copying with reconstruction from a description or sharing an
immutable graph. Preserve required aliasing and identity in either design; cycles alone do not
make reconstruction better or justify replacing an adequate copier.

## The serialisation round-trip

```java
// do not do this
var copy = (Config) new ObjectInputStream(
        new ByteArrayInputStream(toBytes(original))).readObject();
```

Four problems:

1. **Cost.** Encoding, decoding and buffers can dominate a selective copy; measure representative
   graphs before claiming a multiplier.
2. **Graph policy.** Java serialization preserves references/cycles for serialized objects by
   handles, but transient/static fields, custom hooks, readResolve and non-serializable references
   alter the result or fail. It does not blindly copy every reachable object.
3. **Transient state.** Default serialization omits transient fields; custom hooks can handle them
   differently. Wire representation and copy policy are separate concerns.
4. **Security.** Native deserialization invokes class-defined behavior; untrusted or tampered
   streams can exploit reachable gadget classes and resource exhaustion. Inspect provenance,
   allowed types and limits; self-produced bytes do not replace a copy contract.

JSON graph, polymorphic-type and constructor behavior depends on the mapper/configuration. It can
lose aliases/cycles or unmapped state; it is not a universal safe or deep-copy guarantee.

## Copying JPA entities

```java
public static Order copyAsDraft(Order source, Clock clock) {
    var copy = new Order(OrderId.newId(), source.customerId(), clock.instant());
    source.lines().forEach(l -> copy.addLine(l.sku(), l.quantity(), l.unitPrice()));
    return copy;   // illustrative application-assigned ID; source version/audit not inherited
}
```

For clone-as-new, inspect mappings and entity-state detection:

- Generated IDs are normally left unset; application-assigned IDs must be distinct. Natural keys
  may also require changes. A new Java object with an old ID does not automatically become managed;
  persist may reject detached identity, while merge copies state onto a managed identity and can
  update an existing row. Use the returned managed object when merging intentionally.
- Do not carry an old optimistic-lock version into a new entity. Let the provider initialize it
  according to mapping; null versus zero can affect repository new-entity detection.
- Recreate owned children and set both sides as required; share only intended referenced entities.
  Reparenting/orphan removal consequences depend on owning side, mapping and actual mutations,
  not merely placing a reference in another Java collection.
- Fetch required associations within a defined persistence context/transaction before constructing
  the draft. Lazy traversal can issue queries or fail after detachment; check SQL shape and count.
- Apply new-entity audit rules. A snapshot/export may intentionally retain source identity/audit;
  do not conflate that with inserting a new row.

Prefer a named domain factory (`Order.draftFrom(other)`) over a generic `copy()` here: the
domain, not a copying utility, decides which parts of an order a duplicate inherits.

## Copying under concurrency

A copy constructor reading five fields performs five separate reads. If the source is mutated
between the first and the last, the copy can hold a state the source never had — for example an
order whose `total` predates the line item it also copied.

```java
// safe: copy under the same lock the mutators use
synchronized (source) { return new Config(source); }

// safer: the source publishes an immutable snapshot
ConfigSnapshot snapshot = source.snapshot();   // built under the lock, immutable
return Config.from(snapshot);
```

The second form is preferable because it puts the atomicity requirement in the type that owns
the state, rather than in every caller that copies it. A `volatile` reference to an immutable
config, replaced wholesale on change, removes the problem altogether — which is once again the
observation that immutability is the real alternative to this pattern.

Primary sources: [Object.clone](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#clone()>),
[IdentityHashMap](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/IdentityHashMap.html),
[resource cleanup on abrupt completion](https://docs.oracle.com/javase/specs/jls/se17/html/jls-14.html#jls-14.20.3),
[Java serialization architecture](https://docs.oracle.com/en/java/javase/17/docs/specs/serialization/serial-arch.html),
and [Jakarta Persistence 3.2 entity lifecycle](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).
Check the deployed provider/version and mappings for concrete persistence behavior.
