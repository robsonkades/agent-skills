# Factories and instance control

## The decision table

| Situation                                                                                   | Form                                                                                  | Why                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One clear creation path for an identity/behavior object or a framework-constrained type     | ordinary constructor                                                                  | Preserves class semantics without publishing record components or introducing an extra construction API  |
| One meaningful way to create it, always a fresh instance, components are the state          | record with canonical/compact constructor                                             | The compiler writes the accessors, `equals`, `hashCode`; the compact constructor is the validation point |
| Same as above but arguments need normalising or a different external shape                  | record + named factory; canonical constructor remains accessible at record visibility | Factory names intent, but a public record cannot hide its public canonical construction path             |
| Two or more creation paths that differ in _meaning_                                         | named static factories                                                                | A name distinguishes `ofMinorUnits` from `ofMajorUnits`; overload resolution cannot                      |
| Optionality, invalid combinations or transposable arguments impose demonstrated caller cost | compare named factories, distinct role types and a builder                            | Parameter count is a signal, not a threshold; java-fluent-apis owns builder mechanics                    |
| The caller must not depend on the concrete class                                            | static factory returning a common abstraction                                         | Implementation changes must preserve its contract; a public sealed variant set is also API               |
| Instances are interchangeable and cheap to share                                            | static factory with instance control                                                  | See below — this is a contract, not an optimisation                                                      |

A constructor cannot be renamed, return a substitute object or reuse an existing instance;
a static factory cannot replace a superclass constructor invocation. Serialization and framework
creation follow their own protocols: a mapper may support a configured factory, while another path
requires a constructor. Java serialization may substitute an instance through `readResolve`; that
does not make arbitrary static factories automatic construction hooks. Inspect and exercise the
actual supported version/path before removing constructors.

## Consumer calls before construction code

For this unpublished example, the accepted contract is a nonnegative amount with exactly 100 minor
units per major unit, stored as a `long`. This is a chosen unit model, not a general currency model.

```java
var ordinary = new MinorAmount(1050);
var converted = MinorAmount.fromMajorUnits(new java.math.BigDecimal("10.50"));
assert ordinary.equals(converted);  // compare values, not factory identity

// Separate misuse cases: each call must fail, not silently normalize or truncate.
new MinorAmount(-1);                                     // IllegalArgumentException
MinorAmount.fromMajorUnits(new java.math.BigDecimal("10.501")); // ArithmeticException
MinorAmount.fromMajorUnits(null);                         // NullPointerException
```

One complete declaration (`MinorAmount.java`, Java 21 baseline, no preview):

```java
import java.math.BigDecimal;
import java.util.Objects;

public record MinorAmount(long minorUnits) {
    public MinorAmount {
        if (minorUnits < 0) throw new IllegalArgumentException("negative minor units");
    }

    /** Exact conversion; rejects null, fractional minor units and values outside long range. */
    public static MinorAmount fromMajorUnits(BigDecimal majorUnits) {
        Objects.requireNonNull(majorUnits, "majorUnits");
        return new MinorAmount(majorUnits.movePointRight(2).longValueExact());
    }
}
```

The constructor carries the shared invariant; the named factory adds an exact conversion without
floating-point input. A public record cannot hide its canonical constructor, so validating only in
the factory would leave a bypass. A builder adds nothing to this one-value contract. Prefer an
ordinary class if representation hiding, framework constraints or identity semantics are required;
changing an already published class into this record would need a separate compatibility review.

## Naming, as the platform uses it

| Name                       | Meaning in the JDK                                                           | Example                                              |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `of`                       | Concise factory, usually varargs or a small fixed arity                      | `List.of`, `EnumSet.of`, `Duration.ofSeconds`        |
| `from`                     | Type conversion from one argument                                            | `Instant.from`, `Date.from`                          |
| `valueOf`                  | Verbose conversion, historically instance-controlled                         | `Integer.valueOf`, `BigDecimal.valueOf`              |
| `instance` / `getInstance` | Returns _an_ instance, not necessarily new; may be parameterised             | `Calendar.getInstance`, `MessageDigest.getInstance`  |
| `create` / `newInstance`   | Conventionally suggests a fresh instance; API contract decides               | `Array.newInstance`                                  |
| `copyOf`                   | Copy/snapshot under the documented aliasing contract; identity may be reused | `List.copyOf`, `Arrays.copyOf`                       |
| `parse`                    | Builds from a textual representation, throws on malformed input              | `LocalDate.parse`, `UUID.fromString` (the exception) |

`getInstance` conventionally permits reuse, while `newInstance`/`create` often suggests freshness;
individual API documentation remains authoritative. Never infer mutability or lock suitability
from a factory name alone, especially for value-based classes.
For example, `List.copyOf` is an unmodifiable container snapshot and may reuse suitable input;
it does not deep-copy mutable elements. A `copyOf` name alone promises neither deep ownership nor
a fresh identity.

## Instance control is a published contract

A factory that does not always allocate is _instance-controlled_. This buys three things:

- **Canonical identity when explicitly guaranteed.** If the class guarantees one instance over
  its entire value range, `a == b` can match value equality. Enums are the language-backed case;
  ordinary factory caches should rarely expose this guarantee.
- **Memory sharing** for values that repeat heavily — currency codes, tenant identifiers,
  header names.
- **The option to return a different class.** In OpenJDK 25, `EnumSet.noneOf` returns `RegularEnumSet` or
  `JumboEnumSet` depending on the universe size; callers need not depend on those concrete
  classes, though reflection, serialization and performance can still expose differences.

And it costs:

- **A documented identity promise is difficult to withdraw.** Incidental caching is not such a
  promise; callers must not infer it from observation.
- **Cache lifetime becomes your problem.** `Integer.valueOf` guarantees caching −128..127;
  additional values may be cached (HotSpot can tune the upper bound with `-XX:AutoBoxCacheMax`).
  A cache keyed by anything the outside world controls — customer id, URL, header
  value — is an unbounded map that grows with traffic. If interning is genuinely wanted, use
  a bounded cache with an eviction policy, not a `ConcurrentHashMap` that only ever grows;
  java-reference-types-and-leaks has the failure shapes.
- **Eviction weakens canonical identity.** A bounded cache can return a new equal object after
  eviction while a caller still holds the old one. If lifetime-wide `==` canonicalization is
  promised, ordinary eviction violates it; constrain the value domain or choose a reviewed
  lifetime strategy instead. Prefer value equality when identity is not essential.
- **Cached value instances should be deeply immutable and safely published.** A deliberately
  shared mutable service instead needs an explicit thread-safety/lifecycle contract; finalizing
  only the reference does not protect its internals. See java-immutability and
  java-thread-safety-contracts.

### Value-based classes

`Optional`, `LocalDate`, `Instant`, `Duration`, the boxed primitives and the other
value-based classes explicitly leave identity unspecified: they may be cached, canonicalised
or freshly allocated at the implementation's discretion. Their documented consequence is
that identity-sensitive operations — `==`, `System.identityHashCode`, and synchronising on
an instance — are unreliable and are stated to be subject to failure in future releases.
`synchronized (someLong)` is the version of this that reaches production, because it works
by accident only for object identity: cached values couple unrelated callers on one monitor,
while equal uncached values may use different monitors and fail to exclude each other.

## Constructors that do work

A constructor is expected to establish the invariants and return. When it does more, three
distinct things break:

- **Testability.** A constructor that opens a socket or reads a file cannot be exercised
  without that resource. The fix is not a mocking framework; it is passing the collaborator
  in.
- **Safe publication.** Registering `this` with a listener registry, starting a thread, or
  submitting a lambda that captures `this` publishes a partially constructed object. Another
  thread may observe fields in their default state — including `final` ones, because
  initialisation safety only applies once the constructor completes.
- **Subclass semantics.** Calling an overridable method from a constructor runs the override
  before the subclass's ordinary field initialisers, so the override may see `null`/`0` state. This is
  the mechanism behind most "it works until someone extends it" bugs; java-composition-over-inheritance
  covers the wider decision.

The standard shape when construction genuinely has a second phase is a static factory that
constructs, _then_ publishes:

```java
public static Auditor started(Registry registry) {
    Auditor auditor = new Auditor(registry);   // constructor only assigns
    registry.register(auditor);                // publication after construction completes
    return auditor;
}
```

This ordering sketch is not a complete registration protocol. The registry must publish through
the required synchronization mechanism, and its contract must state whether failure leaves a
registration behind. Specify who unregisters/closes on failure and on successful lifetime end;
if registration can partially succeed, require a rollback/ownership mechanism instead of assuming
that a thrown exception undoes its effects.

If construction acquires multiple resources, failure halfway through must close everything
already acquired in reverse order, preserving the primary failure. Plain try-with-resources
closes its resources even on a successful return: returning an object that holds them does not
transfer ownership out of the block. Use it for temporary resources, or a reviewed explicit
ownership-transfer/rollback mechanism for retained ones. Test both partial-acquisition failure
and usability after successful return; `java-resource-management` owns that protocol.

## Evolution

- Adding a static factory or constructor overload normally preserves existing binaries but is not always
  source-compatible: recompilation can select a different overload or become ambiguous, especially
  with `null`, lambdas, varargs and numeric conversions.
- Removing or narrowing a public constructor is a breaking change even when a factory
  replaces it; frameworks and subclasses call constructors reflectively and via `super(...)`.
- A record's canonical constructor is part of its API surface, generated from the component
  list. Adding a component changes that signature; old binaries need the former constructor
  descriptor retained explicitly if they call it. Also review component access, equality and
  source use. Framework/wire compatibility depends on the actual mapping, defaults and consumers,
  not the Java component list alone. rpc-and-api-contracts owns the cross-service half of that.
- A factory returning an interface can change implementation only while preserving its
  documented behavior, identity, mutability, ordering, serialization and thread-safety contract.
  A factory declared to return the concrete class has given some of that freedom away, and
  narrowing the return type later is binary-incompatible when the old method descriptor no longer
  resolves, even when the same consumer source still compiles.
- A published sealed return hierarchy may be consumed through exhaustive pattern switches.
  Adding a permitted subtype can preserve binary linkage while an old switch throws
  `MatchException` when the factory returns that new variant. Recompiling the consumer can
  reveal lost exhaustiveness. Review both existing binaries and source callers before expanding
  the variant set; use a common interface with hidden implementations when callers should rely
  only on shared operations, and a sealed API when its closed alternatives are intentional.

## Authoritative references

- [JLS 21 §14.20.3: try-with-resources](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.20.3) — cleanup also occurs on return.
- [JLS §8.10.4: Record Members](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10.4)
- [Value-based classes, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/doc-files/ValueBased.html)
- [List.copyOf contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
- [BigDecimal exact conversion, Java SE 21](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/math/BigDecimal.html#longValueExact()>) — fractional or out-of-range results fail instead of truncating.
- [JLS 21 §13.4: Evolution of Classes](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.4) — constructor signatures, access and method result types affect existing binaries.
- [JLS 21 §13.5.2: sealed interface evolution](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.5.2) — adding a variant can preserve linkage while breaking an old exhaustive switch at execution.
