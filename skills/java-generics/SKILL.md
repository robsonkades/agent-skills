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

Get the compiler to reject casts that would otherwise fail at runtime, in a language where most
instantiated type arguments are erased from runtime object identity. Generic signatures may remain
in class-file/reflection metadata and some types are reifiable; do not equate erasure with “no
generic metadata.” Two failure modes: the codebase that opts out—
raw types, `@SuppressWarnings("unchecked")` on whole classes, `Object` parameters and casts
at the call sites — so type errors surface as `ClassCastException` in production; and the
signature so wildcard-heavy that callers cannot call it and nobody can read it.

## Workflow

1. **Compile with relevant warnings on and govern them.** `-Xlint:unchecked`, `rawtypes`, and a
   deliberately maintained warning policy are often safer than blanket `-Werror` across JDK/tool
   upgrades. Every unchecked warning is a place where the
   compiler is telling you it cannot prove what your code assumes.
2. **Eliminate warnings from the inside out.** Fix the cause (parameterise the type, use a
   collection instead of an array, pass a class token). Suppress only when you can prove the
   invariant, on the narrowest declaration possible, with a comment giving the proof.
3. **Parameterise types before methods.** If a class holds or produces one element type, it
   takes a type parameter. If only one method needs one, only that method does.
4. **Set use-site variance from semantic data flow.** A source is often `? extends T`; a sink is
   often `? super T`; a parameter requiring exact read/write correlation may be `T`. Return types
   usually avoid wildcards for usability, but public families such as `Class<? extends X>` show
   legitimate exceptions.
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
- Use `List<?>` when element type is irrelevant. No non-null element can be safely added, but this
  is not a read-only view: `clear`, iterator removal, and some `null` mutations remain possible.
  Use unmodifiable types/wrappers for immutability.
- Every unchecked warning is either eliminated or proven. Placing `@SuppressWarnings` on a
  class or a long method hides the next unchecked operation somebody adds there. Put it on the
  narrowest declaration — often a local variable extracted for that purpose — and write the
  one-line reason the cast is safe.
- Prefer lists to arrays wherever both would work. Arrays are covariant and reified
  (`Object[] a = new String[1]; a[0] = 1;` compiles and throws `ArrayStoreException`);
  generics are invariant and erased (the same mistake does not compile). Mixing them —
  `new List<String>[10]` (illegal directly) or unchecked `T[]` casts—can create heap pollution
  when aliases allow values inconsistent with the static element type.
- Avoid exposing arrays whose reified runtime component type cannot honor the generic promise.
  `ArrayList` stores an `Object[]` and casts elements on read; it does not make the whole backing
  array a truthful `T[]`. Controlled unchecked array creation requires confinement and proof.
- Bound wildcards by direction, and usually avoid them in return types. `Collection<? extends T>` for
  a producer, `Collection<? super T>` for a consumer, plain `Collection<T>` when the method
  both reads and writes. A wildcard in a return type forces every caller to deal with
  wildcards too, for no gain.
- If a type parameter appears exactly once in a method signature, it should probably be a
  wildcard instead — and if a wildcard appears where the body needs to name the type, extract
  a private generic helper method to capture it. `swap(List<?>)` delegating to
  `swapHelper(List<E>)` is the canonical shape.
- A generic/non-reifiable varargs declaration needs a heap-pollution audit; `@SafeVarargs` is an
  assertion that the body and callees do not perform potentially unsafe operations, not a ritual
  requirement for all generic varargs. Avoid unsafe writes/aliases. It is legal on constructors
  and on static, final, or private instance methods; overridable instance methods cannot promise
  all implementations are safe.
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
- Generifying an existing API is often binary compatible because erasures remain, and raw source
  uses may still compile with warnings, but it is not automatically compatible: erasure clashes,
  changed bounds/return inference, overload resolution and generated bridge methods can affect
  clients. Compile old source and run old binaries as compatibility tests (`java-api-design`).

- At override boundaries, inspect erasure and compiler-generated bridge methods. Changing generic
  bounds or introducing an overload with the same erasure can be illegal or binary-sensitive even
  when parameterized source signatures look distinct.

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
