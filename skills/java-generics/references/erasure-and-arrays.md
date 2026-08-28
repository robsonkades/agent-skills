# Erasure, arrays and unchecked warnings

## What erasure actually removes

At compile time `List<String>` and `List<Integer>` are different types. At runtime both are
`List`, and there is no object anywhere holding "String". Consequences that drive every rule
in this skill:

| Not possible at runtime                        | Because                                      | What to do instead                                  |
| ---------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `new T()`                                      | no class to instantiate                      | pass a `Supplier<T>` or a `Class<T>`                |
| `new T[n]`                                     | no component type                            | `(T[]) new Object[n]`, kept private, or a `List<T>` |
| `x instanceof List<String>`                    | the type argument is not there to test       | `instanceof List<?>`, then validate elements        |
| `catch (SomeException<T> e)`                   | the JVM matches on erased types              | non-generic exception types (a language rule)       |
| Two overloads differing only in type arguments | same erased signature                        | different method names                              |
| A static field of type `T`                     | one class, one field, many parameterisations | an instance field, or a `Map<Class<?>, ?>`          |

What erasure preserves is enough for most work: the compiler inserts the casts, and
`ClassCastException` at those synthetic casts is the runtime symptom of a compile-time
promise that was not kept.

Generic type information does survive in the class file as metadata for _declarations_
(fields, method signatures, supertypes) — which is how frameworks read
`List<String> names` reflectively and how the `TypeReference` trick works. It never survives
for _instances_: no object knows its own type arguments.

## Raw types disable more than they appear to

```java
List raw = new ArrayList<String>();
raw.add(42);                       // unchecked warning, compiles
List<String> names = raw;          // unchecked warning, compiles
String first = names.get(0);       // ClassCastException here — far from the mistake
```

Using a raw type erases the whole type, not just the element type: every generic member of
the class becomes raw too. `List<Object>` and `List<?>` are the two safe alternatives, and
they are not interchangeable:

| Type           | Can pass a `List<String>` to it | Can add a `String` | Can add `null` | Meaning               |
| -------------- | ------------------------------- | ------------------ | -------------- | --------------------- |
| `List`         | yes                             | yes (unchecked)    | yes            | checking is off       |
| `List<Object>` | **no**                          | yes                | yes            | a list of anything    |
| `List<?>`      | yes                             | **no**             | yes            | a list of _something_ |

Two places raw types remain legal and correct: class literals (`List.class` — `List<String>.class`
does not exist) and `instanceof` (`x instanceof List`, though `List<?>` is clearer).

## Unchecked warnings: eliminate, then prove

Every unchecked warning names an operation the compiler cannot verify. The order of attack:

1. **Parameterise.** Most warnings come from a raw type or a missing type argument somewhere
   up the call chain. Fix the declaration and the warning disappears from all its uses.
2. **Replace an array with a list.** `T[]` fields are the second largest source.
3. **Use a type token.** When the type genuinely arrives at runtime (deserialisation,
   reflection, a plugin registry), a `Class<T>` and `type.cast(...)` turn an unchecked cast
   into a checked one.
4. **Only then suppress** — on the narrowest possible declaration, with a proof:

```java
public <T> T[] toArray(T[] a) {
    if (a.length < size) {
        // The array is created with the same component type as the argument, so every
        // element written into it is assignable to T. Safe by construction.
        @SuppressWarnings("unchecked")
        T[] result = (T[]) Arrays.copyOf(elements, size, a.getClass());
        return result;
    }
    ...
}
```

`@SuppressWarnings` on a class or a 60-line method is a defect: it also suppresses the next
unchecked operation someone adds. If the annotation cannot go on a declaration, create a local
variable so that it can.

## Arrays and generics do not mix

Arrays are **covariant** and **reified**; generics are **invariant** and **erased**. Both
choices are defensible; combined they are unsound, so the language forbids the combination —
mostly.

```java
Object[] objects = new String[1];
objects[0] = 42;                      // compiles; throws ArrayStoreException at runtime

List<Object> list = new ArrayList<String>();   // does not compile — the error is at the right place
```

Creating an array whose component type has a type argument (`new List<String>[10]`) is illegal
precisely because the runtime store check would compare erased types and let the wrong element
through. The residual danger is the deliberate compromise that library code makes:

```java
public class Stack<E> {
    private E[] elements;                       // never exposed
    @SuppressWarnings("unchecked")              // the array holds only E, enforced by push()
    public Stack() { elements = (E[]) new Object[16]; }
}
```

This is safe **only while the array does not escape**. Returning it, storing it in a public
field, or passing it to a caller as `E[]` results in `ClassCastException` at the caller's
implicit cast (`Object[]` cannot be assigned to `String[]`). Keep the array private, or hold
`Object[]` and cast each element on the way out.

## Heap pollution and generic varargs

Heap pollution is a variable of parameterised type referring to an object that is not of that
type. Generic varargs create it structurally, because the varargs array's component type is
non-reifiable:

```java
static <T> void dangerous(List<T>... lists) {
    Object[] array = lists;               // legal: arrays are covariant
    array[0] = List.of(42);               // no store check can catch this
    T first = lists[0].get(0);            // ClassCastException in the *caller*
}
```

`@SafeVarargs` documents that the method does neither of the two unsafe things:

- it **stores nothing** into the varargs array, and
- it **never lets the array escape** (no returning it, no passing it to another method that
  might).

Given both, annotate it. `@SafeVarargs` is only permitted on `static`, `final` and `private`
methods, because an overridable method cannot promise anything about its overrides. The
alternative — often better — is to take a `List<T>` parameter instead and let callers use
`List.of(...)`, which loses nothing and removes the whole category.

## Where erasure meets the network

A value that arrives from outside the process has no type arguments, and the compiler will
not warn you at the point of use:

```java
List<OrderLine> lines = mapper.readValue(json, List.class);   // actually List<LinkedHashMap>
lines.get(0).sku();                                           // ClassCastException, unrelated stack
```

The fix is to state the type at the boundary, not at the use site:

```java
List<OrderLine> lines = mapper.readValue(json, new TypeReference<List<OrderLine>>() {});
// Spring: new ParameterizedTypeReference<List<OrderLine>>() {}
```

Both work by capturing the type argument in an **anonymous subclass**, whose generic
supertype _is_ recorded in the class file — the one place erasure leaks type arguments back
at runtime. The same trick underlies typesafe heterogeneous containers for parameterised
types.

The related failure is a cache or a shared map that hands back a `List<String>` written by
another code path as a `List<Long>`. Nothing checks it, and the exception surfaces in the
reader. If a structure is shared across code paths, key it by a type token and cast through
`Class.cast` so the check happens where the value is retrieved.
