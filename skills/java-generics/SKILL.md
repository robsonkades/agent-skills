---
name: java-generics
description: >
  Generics as a compile-time contract over an erased runtime: raw types and what they
  disable, eliminating unchecked warnings rather than suppressing them, why arrays and
  generics do not mix, generic types and methods, bounded wildcards for API flexibility
  (PECS), generic varargs and @SafeVarargs, and typesafe heterogeneous containers with class
  tokens. Use when a raw type, a cast to a generic type, or an unchecked warning appears;
  when code creates an array of a generic type or a generic varargs parameter; when a
  collection parameter forces callers to convert before calling; when ClassCastException
  surfaces far from any visible cast; when a deserialised list of strings turns out to
  contain something else; or when designing a container that must hold values of several
  types safely. Does not cover null contracts (java-null-safety), collection choice and
  stream pipelines (java-streams), or the wider API-shape decisions (java-api-design).
---

# Java Generics

## Purpose

Get the compiler to reject the casts that would otherwise fail at runtime, in a language
where type arguments do not exist at runtime. Two failure modes: the codebase that opts out —
raw types, `@SuppressWarnings("unchecked")` on whole classes, `Object` parameters and casts
at the call sites — so type errors surface as `ClassCastException` in production; and the
signature so wildcard-heavy that callers cannot call it and nobody can read it.

## Workflow

1. **Compile with warnings on and treat them as a queue.** `-Xlint:all` (or the build's
   equivalent) and, for new code, `-Werror`. Every unchecked warning is a place where the
   compiler is telling you it cannot prove what your code assumes.
2. **Eliminate warnings from the inside out.** Fix the cause (parameterise the type, use a
   collection instead of an array, pass a class token). Suppress only when you can prove the
   invariant, on the narrowest declaration possible, with a comment giving the proof.
3. **Parameterise types before methods.** If a class holds or produces one element type, it
   takes a type parameter. If only one method needs one, only that method does.
4. **Set the variance from the direction of data flow.** A parameter the method reads from is
   `? extends T`; a parameter it writes into is `? super T`; a parameter it does both to is
   plain `T`. Return types stay unwildcarded.
5. **Check the runtime boundary.** Anything crossing deserialisation, reflection, a cache, or
   a framework callback loses its type arguments. Validate or use a type token there — the
   compiler stops at the boundary and the failure appears wherever the value is finally used.
6. **Verify.** No unchecked warnings; every remaining `@SuppressWarnings` is one declaration
   wide and justified; and callers can pass the collections they already have without copying.

## Rules

- Never use a raw type in new code. A raw `List` disables generic checking for _every_ member
  of that type, not just the element type, and it silently makes the compiler accept
  assignments that a parameterised type would reject. `List<Object>` says "any object";
  `List<?>` says "some unknown element type, read-only"; `List` says "turn the checks off".
- Use `List<?>` when the element type is genuinely irrelevant (size, clear, printing). Nothing
  but `null` can be inserted into a `List<?>`, which is exactly the safety it buys. When code
  needs to insert, it needs a type parameter, not a wildcard.
- Every unchecked warning is either eliminated or proven. Placing `@SuppressWarnings` on a
  class or a long method hides the next unchecked operation somebody adds there. Put it on the
  narrowest declaration — often a local variable extracted for that purpose — and write the
  one-line reason the cast is safe.
- Prefer lists to arrays wherever both would work. Arrays are covariant and reified
  (`Object[] a = new String[1]; a[0] = 1;` compiles and throws `ArrayStoreException`);
  generics are invariant and erased (the same mistake does not compile). Mixing them —
  `new List<String>[10]`, `T[] elements = (T[]) new Object[n]` — is where heap pollution
  starts, and the resulting `ClassCastException` appears at a cast the programmer never wrote.
- Do not expose a generic array as a field type or return type. Internally, an
  `Object[]` cast to `T[]` is a controlled compromise (that is what `ArrayList` does); the
  moment it escapes as `T[]`, the caller's assignment fails with `ClassCastException`.
- Bound the wildcards by direction, and never in a return type. `Collection<? extends T>` for
  a producer, `Collection<? super T>` for a consumer, plain `Collection<T>` when the method
  both reads and writes. A wildcard in a return type forces every caller to deal with
  wildcards too, for no gain.
- If a type parameter appears exactly once in a method signature, it should probably be a
  wildcard instead — and if a wildcard appears where the body needs to name the type, extract
  a private generic helper method to capture it. `swap(List<?>)` delegating to
  `swapHelper(List<E>)` is the canonical shape.
- Do not mix generics and varargs without `@SafeVarargs`, and do not apply `@SafeVarargs` to a
  method that is not safe. The method must neither store anything into the varargs array nor
  let the array escape; if it does either, the array's element type is a lie the caller pays
  for. `@SafeVarargs` is legal only on `static`, `final`, or `private` methods — anything
  overridable cannot make the promise.
- Use recursive bounds where the type must be comparable with itself:
  `<T extends Comparable<? super T>>`, not `<T extends Comparable<T>>` — the `super` form
  accepts a subtype whose comparison is inherited, which is common with enums and hierarchies.
- At any runtime boundary, type arguments are gone. `instanceof List<String>` does not compile;
  `(List<String>) json` compiles with a warning and checks nothing; a Jackson
  `readValue(json, List.class)` produces a `List` of `LinkedHashMap`s that only fails when an
  element is used. Pass an explicit type token (`Class<T>`, `TypeReference<List<String>>`,
  `ParameterizedTypeReference`) or validate the elements at the boundary.
- Represent "a container of many types" with a class token as key (`Map<Class<?>, Object>`
  behind an API that casts with `type.cast(value)`), not with `Object` values that callers
  cast themselves. This moves the single unchecked point into one reviewed place.
- Adding a type parameter to an existing published class or method is a source-incompatible
  change for anyone using it raw, though erasure keeps it binary-compatible. Generifying an
  API is therefore a deliberate, versioned change — see java-api-design for the compatibility
  rules.

## References

- [Erasure, arrays and unchecked warnings](references/erasure-and-arrays.md) — read when a
  warning cannot be eliminated obviously, when generic arrays or varargs are involved, when
  `ClassCastException` appears without a visible cast, or when deciding what a suppression
  must prove.
- [Wildcards and generic API design](references/wildcards-and-api-design.md) — read when
  designing a signature callers must pass collections to, when choosing between a type
  parameter and a wildcard, when a generic method needs bounds, or when inference (`var`,
  diamond, lambdas) produces a type you did not expect.
- [Typesafe heterogeneous containers](references/typesafe-heterogeneous-containers.md) — read
  when one structure must hold values of several unrelated types — attribute maps, context
  propagation, plugin registries, caches keyed by type — or when a generic type must survive a
  serialisation boundary.
