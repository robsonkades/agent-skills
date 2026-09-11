# Erasure, arrays and unchecked warnings

## What erasure actually removes

At compile time `List<String>` and `List<Integer>` are different types. At runtime, instances
of the same implementation class need not carry distinct element arguments. Explicit type
tokens and declaration metadata can still retain `String`. Consequences for this skill:

The `instanceof List<String>` rejection below assumes an `Object` operand. Java 16+ can
permit some parameterized type tests when the operand's static type already makes the
conversion checkable; that still does not inspect list elements at runtime.

| Not possible at runtime                        | Because                                      | What to do instead                                       |
| ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `new T()`                                      | no class to instantiate                      | pass a `Supplier<T>` or a `Class<T>`                     |
| `new T[n]`                                     | no reified component type                    | `Object[]` internally, array factory/token, or `List<T>` |
| `x instanceof List<String>`                    | the type argument is not there to test       | `instanceof List<?>`, then validate elements             |
| `catch (SomeException<T> e)`                   | the JVM matches on erased types              | non-generic exception types (a language rule)            |
| Two overloads differing only in type arguments | same erased signature                        | different method names                                   |
| A static field of type `T`                     | one class, one field, many parameterisations | an instance field, or a `Map<Class<?>, ?>`               |

What erasure preserves is enough for most work: the compiler inserts the casts, and
`ClassCastException` at those synthetic casts is the runtime symptom of a compile-time
promise that was not kept.

Generic type information does survive in the class file as metadata for _declarations_
(fields, method signatures, supertypes) — which is how frameworks read
`List<String> names` reflectively and how the `TypeReference` trick works. It never survives
as automatically reified arguments of ordinary generic instances; explicit tokens or a concrete
subclass's generic-superclass metadata are different mechanisms.

## Raw types disable more than they appear to

```java
List raw = new ArrayList<String>();
raw.add(42);                       // unchecked warning, compiles
List<String> names = raw;          // unchecked warning, compiles
String first = names.get(0);       // ClassCastException here — far from the mistake
```

Raw instance member types are erased according to the declaring/inherited-member rules;
static members do not lose their signatures just because the qualifier is raw.
`List<Object>` and `List<?>` are the two safe alternatives, and
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
2. **Check array representation.** A list may remove an unchecked `T[]` workaround; retain a
   correctly reified array when its API/ownership contract warrants it.
3. **Use a type token.** When the type genuinely arrives at runtime (deserialisation,
   reflection, a plugin registry), a `Class<T>` and `type.cast(...)` turn an unchecked cast
   into a checked one.
4. **Only then suppress** — on the narrowest possible declaration, with a proof:

```java
public <T> T[] toArray(T[] a) {
    if (a.length < size) {
        // Same runtime array class as a. The cast is safe; incompatible stored elements
        // are rejected by Arrays.copyOf with ArrayStoreException, not silently accepted.
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
choices are defensible. The runtime cannot check non-reifiable component arguments, so Java
restricts array creation; reifiable arrays and carefully confined representations remain useful.

```java
Object[] objects = new String[1];
objects[0] = 42;                      // compiles; throws ArrayStoreException at runtime

List<Object> list = new ArrayList<String>();   // does not compile — the error is at the right place
```

Creating an array with a non-reifiable component (`new List<String>[10]`) is illegal;
`new List<?>[10]` is legal because the unbounded-wildcard component is reifiable. The former is illegal
precisely because the runtime store check would compare erased types and let the wrong element
through. The residual danger is the deliberate compromise that library code makes:

```java
public class Stack<E> {
    private E[] elements;                       // never exposed
    @SuppressWarnings("unchecked")              // the array holds only E, enforced by push()
    public Stack() { elements = (E[]) new Object[16]; }
}
```

This proof relies on confinement and storing only `E`. An exposed `Object[]` alias could write
the wrong element type; exposing the array as `E[]` can also fail when a caller requires a more specific
array class (`Object[]` cannot be assigned to `String[]`; an `Object[]` consumer need not fail).
Keep the array private, or hold
`Object[]` and cast each element on the way out.

## Heap pollution and generic varargs

Heap pollution is a variable of parameterised type referring to an object that is not of that
type. Non-reifiable varargs enable it through unsafe aliases/writes; declaring varargs alone
does not necessarily pollute anything. This deliberately unsafe partial example returns the
value so the caller's inserted cast exposes the pollution:

```java
static <T> T dangerous(List<T>... lists) {
    Object[] array = lists;               // legal: arrays are covariant
    array[0] = List.of(42);               // no store check can catch this
    return lists[0].get(0);              // erased T is Object here
}

String first = dangerous(List.of("safe")); // caller's String cast throws ClassCastException
```

`@SafeVarargs` asserts that the body and code it calls perform no potentially unsafe operation on
the varargs array. Strong sufficient rules are:

- it **stores nothing** into the varargs array, and
- it **never lets the array escape** (no returning it, no passing it to another method that
  might).

Given a proof, annotate it to suppress declaration/call-site warnings. `@SafeVarargs` is permitted
on constructors and on `static`, `final` and `private` instance methods, because an overridable
instance method cannot promise anything about its overrides. The
alternative is a collection parameter with appropriate variance, when its caller contract fits.
`List.of(...)` rejects null elements and returns an unmodifiable list; replacing a public varargs
API can also change source/binary compatibility, aliasing or snapshot behavior. Preserve an
adequate audited varargs API rather than treating a collection conversion as lossless.

## Where erasure meets the network

An untyped deserializer can build values that violate the target element promise. For JSON
object elements under usual Jackson defaults, this unchecked assignment warns at compilation
and fails later on use; strings, numbers and custom mapper configuration have different shapes:

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
supertype _is_ recorded in the class file. This is declaration metadata, not reified validation
of the object's elements. The same technique can support containers for parameterised types.

The related failure is a cache or a shared map that hands back a `List<String>` written by
another code path as a `List<Long>`. Nothing checks it, and the exception surfaces in the
reader. `Class.cast` checks reifiable classes, not `List<String>` elements: `List.class.cast`
accepts either list. Use a typed insertion API with a justified invariant, or validate each
element (and nested structure) at the boundary, copying when untrusted mutable aliases remain.

## Sources

- [JLS 21 §4.6–4.8: erasure, reifiable and raw types](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.6)
- [Java 21 Class.cast](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Class.html#cast(java.lang.Object)>)
- [Java 21 SafeVarargs contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/SafeVarargs.html)
- [Java 21 List factories and their null/mutation contracts](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html)
