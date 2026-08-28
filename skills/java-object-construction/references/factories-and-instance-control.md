# Factories and instance control

## The decision table

| Situation                                                                                            | Form                                                                              | Why                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One meaningful way to create it, always a fresh instance, components are the state                   | record with canonical/compact constructor                                         | The compiler writes the accessors, `equals`, `hashCode`; the compact constructor is the validation point |
| Same as above but the arguments need normalising or a different external shape                       | record + `public static X of(...)`, canonical constructor private or unadvertised | The factory can normalise, the canonical constructor stays the single assignment point                   |
| Two or more creation paths that differ in _meaning_                                                  | named static factories                                                            | A name distinguishes `ofMinorUnits` from `ofMajorUnits`; overload resolution cannot                      |
| Two or more paths that differ only in optionality/arity, ≥4 params or transposable same-typed params | builder                                                                           | See java-fluent-apis for the threshold; below it a builder is ceremony                                   |
| The caller must not depend on the concrete class                                                     | static factory returning an interface or sealed supertype                         | The implementation can change, split by input, or become cached, without touching call sites             |
| Instances are interchangeable and cheap to share                                                     | static factory with instance control                                              | See below — this is a contract, not an optimisation                                                      |

Two forms that look like alternatives but are not: a _constructor_ cannot be renamed, cannot
return a subtype, and cannot decline to allocate; a _factory_ cannot be invoked by
`super(...)`, by deserialisation, or by frameworks that reflectively call a constructor
(JPA, Jackson without `@JsonCreator`, some DI containers). Choosing a factory-only surface
for a type a framework must instantiate is the common way this decision goes wrong.

## Naming, as the platform uses it

| Name                       | Meaning in the JDK                                               | Example                                              |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `of`                       | Concise factory, usually varargs or a small fixed arity          | `List.of`, `EnumSet.of`, `Duration.ofSeconds`        |
| `from`                     | Type conversion from one argument                                | `Instant.from`, `Date.from`                          |
| `valueOf`                  | Verbose conversion, historically instance-controlled             | `Integer.valueOf`, `BigDecimal.valueOf`              |
| `instance` / `getInstance` | Returns _an_ instance, not necessarily new; may be parameterised | `Calendar.getInstance`, `MessageDigest.getInstance`  |
| `create` / `newInstance`   | Guarantees a distinct instance each call                         | `Array.newInstance`                                  |
| `copyOf`                   | New instance with the same contents, defensively copied          | `List.copyOf`, `Arrays.copyOf`                       |
| `parse`                    | Builds from a textual representation, throws on malformed input  | `LocalDate.parse`, `UUID.fromString` (the exception) |

`getInstance` versus `newInstance` is the one distinction callers actually rely on:
`newInstance` promises a fresh object they may mutate or use as a lock; `getInstance` does
not. Naming a caching factory `create` is a defect, not a style preference.

## Instance control is a published contract

A factory that does not always allocate is _instance-controlled_. This buys three things:

- **Identity comparison.** If the class is instance-controlled over its entire value range,
  `a == b` is equivalent to `a.equals(b)`. Enums are the pure case.
- **Memory sharing** for values that repeat heavily — currency codes, tenant identifiers,
  header names.
- **The option to return a different class.** `EnumSet.noneOf` returns `RegularEnumSet` or
  `JumboEnumSet` depending on the universe size, and no caller can tell.

And it costs three things:

- **The promise is irreversible.** Callers will write `==` the moment it works. Withdrawing
  the cache later breaks them silently, at runtime, only under some inputs.
- **Cache lifetime becomes your problem.** `Integer.valueOf` caches −128..127 (the upper
  bound is settable with `-XX:AutoBoxCacheMax`) precisely because the range is fixed and
  small. A cache keyed by anything the outside world controls — customer id, URL, header
  value — is an unbounded map that grows with traffic. If interning is genuinely wanted, use
  a bounded cache with an eviction policy, not a `ConcurrentHashMap` that only ever grows;
  java-reference-types-and-leaks has the failure shapes.
- **Cached instances must be deeply immutable and safely published.** A shared instance that
  is not final-fielded and fully immutable is a data race handed to every caller at once —
  see java-immutability's safe-publication rules.

### Value-based classes

`Optional`, `LocalDate`, `Instant`, `Duration`, the boxed primitives and the other
value-based classes explicitly leave identity unspecified: they may be cached, canonicalised
or freshly allocated at the implementation's discretion. Their documented consequence is
that identity-sensitive operations — `==`, `System.identityHashCode`, and synchronising on
an instance — are unreliable and are stated to be subject to failure in future releases.
`synchronized (someLong)` is the version of this that reaches production, because it works
today for values outside the cache and deadlocks or fails to exclude for values inside it.

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
  before the subclass's field initialisers, so the override sees `null`/`0` state. This is
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

## Evolution

- Adding a static factory is source- and binary-compatible. Adding a constructor overload is
  too, but can silently change which overload an existing call site resolves to when it is
  recompiled — the classic being an added `(long)` overload capturing calls that passed an
  `int`.
- Removing or narrowing a public constructor is a breaking change even when a factory
  replaces it; frameworks and subclasses call constructors reflectively and via `super(...)`.
- A record's canonical constructor is part of its API surface, generated from the component
  list. Adding a component changes that signature — for a record used as a DTO across a
  build boundary this is a breaking change, and for one deserialised by a framework it also
  changes the wire contract. rpc-and-api-contracts owns the cross-service half of that.
- A factory whose declared return type is an interface can change implementation class
  freely. A factory declared to return the concrete class has given that freedom away, and
  narrowing the return type later is a binary-incompatible change even though the source
  still compiles.
