# Copying in Java

## Why `Cloneable` is a broken contract

- **`Cloneable` declares no `clone()` method.** It is a marker that changes the behaviour of a
  `protected` method on `Object` — an interface used to alter a superclass's behaviour, which is
  not what interfaces mean anywhere else in the language.
- **`Object.clone()` is `protected`.** A caller holding a `Cloneable` reference still cannot
  invoke `clone()`. Every type must re-declare it public, so the "polymorphic copy" the pattern
  wants does not exist unless each class opts in.
- **It bypasses constructors.** No constructor runs, so invariants that live in constructors are
  not enforced, and `final` fields cannot be reassigned — which means a class with a `final`
  mutable field can never deep-copy correctly through `clone()`.
- **The default is shallow.** Every reference field is aliased. A "clone" of an object holding a
  `List` shares that list, so a mutation through either reference is visible through both.
- **It is unenforceable across a hierarchy.** A correct `clone()` must call `super.clone()`, and
  a subclass that forgets, or that adds a mutable field without extending the copy, breaks the
  contract silently for everyone above it.
- **It interacts badly with `final` classes and records.** Records are implicitly final and do
  not generate `withX` methods; use an explicit/generated wither, canonical-copy construction, or
  a named factory when a distinct instance is semantically needed.

Effective Java's conclusion — provide a copy constructor or copy factory instead — is the
position to take in review. The only common exception is arrays, where `array.clone()` is the
idiomatic and correct shallow copy.

## Copy constructor, copy factory, wither

```java
// copy constructor — best when the concrete type is known
public Config(Config other) {
    this.name = other.name;                       // immutable: share
    this.limits = new EnumMap<>(other.limits);    // mutable: copy
    this.listeners = List.copyOf(other.listeners);
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

The polymorphic `copy()` is Prototype proper. Declare in its Javadoc **which fields are shared
and which are duplicated** — that sentence is the contract, and its absence is the reason most
`clone()`-style methods are wrong.

## Deep or shallow, per field

| Field kind                                                 | Copy?                        | Reasoning                                                                      |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Primitive, `String`, `Instant`, record of these            | Share                        | Immutable; copying wastes allocation                                           |
| `List`/`Map`/`Set` of immutables                           | Copy the container           | Container is mutable even when elements are not                                |
| Array                                                      | `clone()` or `Arrays.copyOf` | Always mutable                                                                 |
| Mutable domain object owned by this one                    | Copy                         | Otherwise two owners mutate one object                                         |
| Mutable object shared by design (a cache, a pool, a clock) | Share                        | Copying it would create a second cache, which is a bug                         |
| Back-reference to a parent                                 | Rewire, not copy             | Copying follows the graph upward and duplicates the world                      |
| Identity (`@Id`, version, created-at)                      | Reset                        | The copy is a different object                                                 |
| Listener/observer registration                             | Usually drop                 | A copy silently subscribed to the original's events is a leak (`gof-observer`) |
| Open resource (stream, connection, lock)                   | Do not copy — refuse         | Two owners, one resource, undefined close semantics                            |

The last two are the ones reviewers miss. A copied object that inherited the original's
listeners will receive events nobody registered it for; a copied object holding the same
`InputStream` will have it closed underneath it.

## Cycles and identity

A depth-first copy of a graph with cycles does not terminate, and one with shared nodes
duplicates them — so `a.child == b.child` in the original becomes two distinct objects in the
copy, and any logic depending on that identity changes behaviour.

```java
Node copy(Node n, IdentityHashMap<Node, Node> seen) {
    Node existing = seen.get(n);
    if (existing != null) return existing;
    Node copy = new Node(n.value());
    seen.put(n, copy);                    // register BEFORE recursing
    n.children().forEach(c -> copy.add(copy(c, seen)));
    return copy;
}
```

`IdentityHashMap`, not `HashMap`: `equals`-equal nodes that are distinct objects must stay
distinct. Registering before recursing is what terminates on a cycle.

If this code is needed, ask first whether the graph should be copied at all. A structure with
cycles and meaningful identity is usually better rebuilt from a description than duplicated.

## The serialisation round-trip

```java
// do not do this
var copy = (Config) new ObjectInputStream(
        new ByteArrayInputStream(toBytes(original))).readObject();
```

Four problems:

1. **Cost.** Orders of magnitude slower than a field copy, and it allocates the whole graph plus
   the byte buffer.
2. **Silently deep.** It copies everything reachable, including the shared cache and the parent
   back-reference you did not want duplicated.
3. **`transient` is overloaded.** Fields marked transient for wire economy vanish from the copy,
   which is a different intent from "not part of the copy".
4. **Security.** Java deserialisation of anything not produced by your own process in this
   moment is a remote-code-execution surface. Even for self-produced bytes, it keeps a gadget
   path alive in the codebase; JDK deserialisation filters are a mitigation, not a reason to add
   the code.

A JSON round-trip is safer but still deep-by-default, still slow, and loses any state the
serialiser does not model.

## Copying JPA entities

```java
public static Order copyAsDraft(Order source, Clock clock) {
    var copy = new Order(OrderId.newId(), source.customerId(), clock.instant());
    source.lines().forEach(l -> copy.addLine(l.sku(), l.quantity(), l.unitPrice()));
    return copy;   // no @Id, no @Version, no createdAt carried over
}
```

Rules that are not optional:

- **The id must be new.** A managed copy with the source's id updates the source; a detached one
  with the source's id fails on flush, or overwrites it via `merge`.
- **`@Version` must be reset**, or the copy carries an optimistic-lock version that belongs to a
  different row (`offline-concurrency-control`).
- **Child collections must be recreated, not shared.** Adding the source's `OrderLine` instances
  to the copy re-parents them; with orphan removal, the source's lines are then deleted.
- **Do not copy inside a transaction and then rely on dirty checking of the source.** Reading
  every field of a managed entity to copy it also touches lazy associations and can trigger a
  storm of selects (`orm-behavioral-patterns`).
- **Audit fields are re-stamped, not copied**, or the copy claims to have been created by
  someone else at another time.

Prefer a named domain factory (`Order.draftFrom(other)`) over a generic `copy()` here: the
domain, not a copying utility, decides which parts of an order a duplicate inherits.

## Copying under concurrency

A copy constructor reading five fields performs five separate reads. If the source is mutated
between the first and the last, the copy holds a state the source never had — for example an
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
