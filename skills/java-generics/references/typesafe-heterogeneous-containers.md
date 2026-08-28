# Typesafe heterogeneous containers

## The shape

A normal generic container fixes one element type per instance. Sometimes the requirement is
the opposite: one container, many types, each retrieved at the type it was stored as. The
pattern parameterises the **key** instead of the container, using a class literal as a type
token.

```java
public final class Attributes {
    private final Map<Class<?>, Object> values = new HashMap<>();

    public <T> void put(Class<T> type, T value) {
        values.put(Objects.requireNonNull(type), type.cast(value));   // store the checked form
    }

    public <T> Optional<T> get(Class<T> type) {
        return Optional.ofNullable(type.cast(values.get(type)));      // checked cast, not (T)
    }
}

attributes.put(TenantId.class, tenantId);
Optional<TenantId> tenant = attributes.get(TenantId.class);           // no cast at the call site
```

Three properties make it work:

- The map is `Map<Class<?>, Object>` — the wildcard is on the _key_, so every entry may have a
  different type, and the relationship between key and value is enforced by the `put`/`get`
  signatures rather than by the map.
- **`type.cast(...)`, never `(T)`.** `Class.cast` performs a real runtime check and throws
  `ClassCastException` immediately, at the container, instead of producing heap pollution that
  fails somewhere else. This is the whole safety argument for the pattern.
- Casting on the way _in_ as well as out closes the hole a caller opens by passing a raw
  `Class` object.

Where this appears in real systems: request/context attribute maps, plugin and capability
registries, per-type caches and metric registries, `ServiceLoader`-style lookups, and
`DataSource.unwrap(Class<T>)`-style escape hatches in JDBC and Jakarta APIs. The JDK's own
`AnnotatedElement.getAnnotation(Class<T>)` is the same pattern.

## The two limitations

**1. Non-reifiable types have no class literal.** `List<String>.class` does not exist, so a
type token cannot distinguish `List<String>` from `List<Integer>`. The workaround is a _super
type token_: an abstract class whose generic supertype is recorded in the class file, captured
by an anonymous subclass.

```java
public abstract class TypeRef<T> {
    private final Type type;
    protected TypeRef() {
        this.type = ((ParameterizedType) getClass().getGenericSuperclass())
                        .getActualTypeArguments()[0];
    }
    public Type type() { return type; }
    @Override public boolean equals(Object o) { return o instanceof TypeRef<?> r && type.equals(r.type); }
    @Override public int hashCode() { return type.hashCode(); }
}

Map<TypeRef<?>, Object> byType = new HashMap<>();
byType.put(new TypeRef<List<String>>() {}, names);      // the anonymous subclass carries the type
```

Jackson's `TypeReference` and Spring's `ParameterizedTypeReference` are exactly this. Two costs
to accept knowingly: each token is an anonymous class (a loaded class per distinct use site),
and the safety is now reflective — there is no `Class.cast` that can check `List<String>`, so
the retrieval cast is unchecked and the container is only as correct as its own code.

**2. Malicious or careless raw keys.** A caller with a raw `Class` object can pass a key that
does not match the value. Casting inside `put` — as above — is what closes it. A container that
stores without checking cannot detect the mismatch later either, because by then the type
argument is gone.

## Bounded type tokens

When the container should accept only some types, bound the token:

```java
public <T extends DomainEvent> void register(Class<T> type, Handler<T> handler)
```

For tokens obtained reflectively (from an annotation's `Class` member, or from a plugin
descriptor), `Class.asSubclass` converts an unchecked cast into a checked one:

```java
Class<?> raw = Class.forName(name);
Class<? extends DomainEvent> eventType = raw.asSubclass(DomainEvent.class);   // throws if it is not
```

`asSubclass` is the reflection-boundary equivalent of `Class.cast`: it fails at the boundary,
with the offending class name, instead of failing later with a `ClassCastException` in
unrelated code.

## When not to use it

This pattern is a controlled hole in the type system, and it is over-used. Prefer an ordinary
type when the set of values is known:

- **A record or a small class beats an attribute map** whenever the keys are fixed at design
  time. `record RequestContext(TenantId tenant, TraceId trace, Instant deadline)` is checked at
  compile time, is visible to the reader, and cannot be missing a key at runtime.
- **A sealed interface plus pattern matching beats a `Map<Class<?>, Handler>`** when the set of
  handled types is closed: the compiler then proves exhaustiveness, which the map cannot.
- **Context propagation across threads has its own mechanism.** `ScopedValue` (and, on platform
  threads, `ThreadLocal`) already provides typed, scoped context; an attribute map bolted onto
  a request object usually reinvents it with fewer guarantees. See scoped-values.

Use the heterogeneous container when the key set is genuinely open — extensions, plugins,
framework attributes, per-type caches — and keep it behind an API narrow enough that
`Class.cast` is the only place a cast occurs.

## Across a serialisation boundary

Type tokens are also how a generic type survives deserialisation, and the failure mode when
they are missing is the one described in `erasure-and-arrays.md`: the value is built as
`LinkedHashMap`s and fails at first use. Two rules:

- Every deserialisation call site states the full parameterised type — `TypeReference`,
  `ParameterizedTypeReference`, or a concrete DTO type. `readValue(json, List.class)` is a
  defect even when it appears to work.
- Never let a class name from an untrusted payload select the target type. `Class.forName` on
  attacker-controlled input, and polymorphic deserialisation keyed by an arbitrary `@class`
  field, are remote code execution primitives, not type tokens —
  java-serialization-hardening covers the boundary.
