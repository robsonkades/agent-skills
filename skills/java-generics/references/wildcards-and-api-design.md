# Wildcards and generic API design

## PECS and the required type relationship

For a parameter of a generic type, ask what the **method** does with it:

| The method…                                  | Parameter type                               | Callers may pass                                            |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| only reads T out of it                       | `? extends T` (producer)                     | `List<T>` and `List<`subtype of T`>`                        |
| only puts T into it                          | `? super T` (consumer)                       | `List<T>` and `List<`supertype of T`>`                      |
| reads T and inserts independently supplied T | plain `T` when exact correlation is required | `List<T>` for that relationship                             |
| ignores the element type                     | `?`                                          | any list; no arbitrary non-null value can be added directly |

```java
public void addAll(Collection<? extends Payment> source) { ... }   // reads from source
public void drainTo(Collection<? super Payment> sink)     { ... }   // writes into sink
public void rotate(List<?> both)                         { ... }   // rearranges existing elements
```

The payoff is not theoretical. Without `? extends`, a caller holding a `List<CardPayment>`
must copy it into a `List<Payment>` before calling — a real allocation and a real annoyance,
which is why the JDK's own signatures (`Collections.copy`, `Stream.forEach`,
`CompletableFuture.thenApply`) are written this way.

Mutation alone does not require an exact element type: rearranging existing elements can use
wildcard capture or `Collections.rotate(List<?>, int)`. The list must still support the required
mutation; accepting its type does not make an unmodifiable list writable.

Two corollaries:

- **Usually avoid wildcards in return types.** They propagate complexity, but APIs intentionally
  returning an unknown subtype (`Class<? extends Annotation>`, covariant views) can require them.
- **A type parameter appearing only in one parameter and nowhere else often has nothing to
  relate**, so it can be a wildcard. Count bounds, return type, throws clauses and other parameters
  before applying this heuristic.

## Capture: when the wildcard has to become a name

A wildcard is an unknown type, so an arbitrary independent non-null value cannot be inserted.
When an operation safely reuses values of that same unknown type, a private generic helper lets
the compiler _capture_ the wildcard into a type variable:

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
A `capture of ?` error may instead expose a real mismatch. Two independent `List<? extends Number>`
arguments need not have the same element type; a helper cannot make copying `Double` into a
`List<Integer>` safe. Establish the required relationship rather than suppressing the error.

## Bounds on type parameters

```java
// Single bound
<T extends Comparable<? super T>> T max(Collection<? extends T> values)

// Multiple bounds: at most one class, any number of interfaces, class first
<T extends Number & Comparable<T>> void sortNumeric(List<T> values)
```

- Use `Comparable<? super T>` rather than `Comparable<T>`. A type whose comparison is
  inherited from a supertype (a hierarchy where the base defines
  the ordering) satisfies the first and not the second.
- A bound is a **requirement on the caller's type**, not a hint. Adding one can reject source
  callers; removing or reordering a leftmost bound can change erasure and break old binaries.
  Check descriptors and compile/run supported callers for either change.
- `<T extends Enum<T>>` is the idiom for "any enum type", and is how `EnumSet.noneOf` and
  `EnumMap` are declared.

## Generic methods versus generic types

Parameterise the **type** when callers need to choose an instance's element types for its whole
life (`Repository<Order>`, `Cache<K, V>`); retain fixed domain types when no such variation is needed.
Parameterise the **method** when the relationship
exists only for the duration of one call (`<T> T firstOrDefault(List<T>, T)`).

Static factories illustrate the difference: they can infer method type arguments, while
constructor calls with diamond also support inference. Compare actual caller expressions;
naming and instance control are separate benefits (java-object-construction):

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
- **Lambda arity participates in overload selection.** A one-parameter lambda distinguishes
  `Function` from `BiFunction`; arity alone does not resolve two compatible one-parameter
  unrelated functional interfaces with identical parameter/result contracts. Compile the
  concrete call before claiming ambiguity; distinct names can
  avoid competing same-arity functional contracts.

Explicit type arguments (`Collections.<String>emptyList()`) are the escape hatch when
inference picks the wrong thing; needing them frequently is a sign the signature is doing too
much.

## Generifying an existing API

Adding type parameters often keeps **binary** compatibility when erased descriptors and required
bridge methods remain compatible. Raw source callers often still compile with warnings, but
source/binary behavior can change through bounds, erasure clashes, overload resolution, return
inference and bridges. Verify with old binaries and source rather than inferring compatibility.

For a staged change, use the actual compatibility contract:

1. Add the type parameters, keeping the erasure identical (no changes to parameter counts or
   erased types).
2. Test retained raw source and old binaries for as long as they remain supported; a release
   interval is not evidence that external consumers migrated.
3. Treat bound/erasure changes as a separate compatibility decision. Preserve required entry
   points/bridges or use the versioning discipline in java-api-design.

For interfaces published to other teams or services, the type parameter is part of the
contract. Existing raw implementations can remain compatible when the erased contract is
preserved. Consider a new interface when required relationships cannot evolve compatibly;
do not require every implementor to change merely because type parameters were added.

## Reviewing a generic signature

- [ ] No raw types outside class literals and `instanceof`.
- [ ] Every parameter's variance matches the direction data actually flows.
- [ ] Return wildcards have a deliberate covariance/unknown-subtype reason.
- [ ] Single-parameter-only type variables are replaced by wildcards when no relationship is lost.
- [ ] Bounds are `? super` where inheritance of the bound is plausible.
- [ ] Callers need no type-workaround copies or casts; required ownership copies remain.
- [ ] Representative consumer calls are understandable. Nested wildcards can warrant a
      purpose-built type when they obscure the domain relationship; their count alone is
      not a defect or permission to break an established API.

## Sources

- [JLS 21 §15.12.2.1: potential applicability and lambda arity](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.12.2.1)
- [JLS 21 §4.6: type-variable erasure](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.6)
- [Java 21 Collections: rotation and supported mutations](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collections.html)
- [JLS 21 §13: binary compatibility](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html)
