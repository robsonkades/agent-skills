# Wildcards and generic API design

## PECS, stated as a mechanical rule

For a parameter of a generic type, ask what the **method** does with it:

| The method…              | Parameter type           | Callers may pass                        |
| ------------------------ | ------------------------ | --------------------------------------- |
| only reads T out of it   | `? extends T` (producer) | `List<T>` and `List<`subtype of T`>`    |
| only puts T into it      | `? super T` (consumer)   | `List<T>` and `List<`supertype of T`>`  |
| both reads and writes    | plain `T`                | `List<T>` only                          |
| ignores the element type | `?`                      | any list; nothing but null can be added |

```java
public void addAll(Collection<? extends Payment> source) { ... }   // reads from source
public void drainTo(Collection<? super Payment> sink)     { ... }   // writes into sink
public void rotate(List<Payment> both)                    { ... }   // reads and writes
```

The payoff is not theoretical. Without `? extends`, a caller holding a `List<CardPayment>`
must copy it into a `List<Payment>` before calling — a real allocation and a real annoyance,
which is why the JDK's own signatures (`Collections.copy`, `Stream.forEach`,
`CompletableFuture.thenApply`) are written this way.

Two corollaries:

- **Never put a wildcard in a return type.** It propagates: every caller must then either use
  `var`, declare a wildcard themselves, or cast. Returning `List<Payment>` from a method
  taking `List<? extends Payment>` is the normal shape.
- **A type parameter appearing exactly once in a signature has nothing to relate**, so it can
  be a wildcard instead. `void print(Collection<?> c)` is clearer than
  `<T> void print(Collection<T> c)`.

## Capture: when the wildcard has to become a name

A wildcard is an unknown type, so the body cannot write into it. When an operation is
provably safe but not expressible, delegate to a private generic helper — the compiler
_captures_ the wildcard into a type variable:

```java
public static void swap(List<?> list, int i, int j) {
    swapHelper(list, i, j);
}

// The helper knows the element type has *a* name, even though the caller does not.
private static <E> void swapHelper(List<E> list, int i, int j) {
    list.set(i, list.set(j, list.get(i)));
}
```

The public signature stays wildcarded (any list is acceptable); the private one does the work.
Seeing `capture of ?` in a compiler error is the signal that this helper is missing.

## Bounds on type parameters

```java
// Single bound
<T extends Comparable<? super T>> T max(Collection<? extends T> values)

// Multiple bounds: at most one class, any number of interfaces, class first
<T extends Number & Comparable<T>> void sortNumeric(List<T> values)
```

- Use `Comparable<? super T>` rather than `Comparable<T>`. A type whose comparison is
  inherited from a supertype (common with enums, and with any hierarchy where the base defines
  the ordering) satisfies the first and not the second.
- A bound is a **requirement on the caller's type**, not a hint. Adding a bound to a published
  method is a breaking change; removing one is not.
- `<T extends Enum<T>>` is the idiom for "any enum type", and is how `EnumSet.noneOf` and
  `EnumMap` are declared.

## Generic methods versus generic types

Parameterise the **type** when instances hold or produce a single element type for their whole
life (`Repository<Order>`, `Cache<K, V>`). Parameterise the **method** when the relationship
exists only for the duration of one call (`<T> T firstOrDefault(List<T>, T)`).

Static factories illustrate the difference and one useful trick — a generic static factory can
infer what a constructor cannot (before the diamond operator this was its main advantage; the
remaining advantage is naming and instance control, see java-object-construction):

```java
public static <K, V> Map<K, V> newMap() { return new HashMap<>(); }
```

## Inference, `var` and lambdas

Inference is a solver, not a lookup, and three of its behaviours cause real bugs:

- **`var` on a generic expression captures whatever was inferred**, including
  `ArrayList<Object>` when you expected `ArrayList<String>`:
  `var list = new ArrayList<>();` is a `List<Object>` and every later `add` compiles.
  Write the type argument, or the target type, when it is not obvious to a reader.
- **Target typing flows from the assignment**, so the same expression changes meaning by
  context: `Collectors.toMap(...)` inside a method call infers from the parameter; extracted
  into a local without a declared type it may infer differently, or fail to compile.
- **Lambdas infer parameter types from the functional interface**, which means an overloaded
  method taking both `Function<T, R>` and `BiFunction<...>` can become ambiguous the moment a
  lambda is passed. Give overloads distinct names when a lambda is the argument.

Explicit type arguments (`Collections.<String>emptyList()`) are the escape hatch when
inference picks the wrong thing; needing them frequently is a sign the signature is doing too
much.

## Generifying an existing API

Erasure means adding type parameters keeps **binary** compatibility: already-compiled callers
keep working, because the erased signatures are unchanged. It does not keep **source**
compatibility for callers that used the raw type — they now get unchecked warnings, and any
that relied on the raw looseness may stop compiling.

The staged approach the JDK itself used:

1. Add the type parameters, keeping the erasure identical (no changes to parameter counts or
   erased types).
2. Leave the raw usage compiling with warnings for one release.
3. Only afterwards tighten anything that changes erasure — that _is_ a breaking change and
   needs the versioning discipline in java-api-design.

For interfaces published to other teams or services, the type parameter is part of the
contract. Prefer a new interface over reparameterising a widely implemented one; every
implementor must otherwise change at once.

## Reviewing a generic signature

- [ ] No raw types outside class literals and `instanceof`.
- [ ] Every parameter's variance matches the direction data actually flows.
- [ ] No wildcard in a return type.
- [ ] Type parameters used more than once; single-use ones replaced by wildcards.
- [ ] Bounds are `? super` where inheritance of the bound is plausible.
- [ ] Callers can pass the collections they already hold, without copying or casting.
- [ ] The signature is readable aloud. Three nested wildcards mean the design, not the
      notation, is wrong — consider a small purpose-built type instead of a deeply
      parameterised collection.
