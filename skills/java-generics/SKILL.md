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
  types safely. Does not cover null contracts (java-null-safety), stream pipelines
  (java-streams), collection implementation choice, or wider API-shape decisions (java-api-design).
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

Examples target Java 21 without preview. Inspect compiler release/toolchains and resolved
framework versions before changing signatures or type-token APIs; do not upgrade the project
or add a serialization library to make an illustration work. References contain partial snippets
unless explicitly presented as complete classes; supply imports and the enclosing declarations.
Start with supported caller expressions, including ordinary use, a useful subtype case and a
misuse that should be rejected. Preserve an adequate signature and its ownership/failure contract;
fewer warnings or fewer wildcards alone do not justify changing the API.

1. **Compile with relevant warnings on and govern them.** `-Xlint:unchecked`, `rawtypes`, and a
   deliberately maintained warning policy are often safer than blanket `-Werror` across JDK/tool
   upgrades. Every unchecked warning is a place where the
   compiler is telling you it cannot prove what your code assumes.
2. **Eliminate warnings from the inside out.** Fix the cause (parameterise the type, use a
   collection instead of an array, pass a class token). Suppress only when you can prove the
   invariant, on the narrowest declaration possible, with a comment giving the proof.
3. **Parameterise the relationship callers need.** Use a class parameter when callers choose
   one element type for an instance's lifetime, or a method parameter for a per-call relationship.
   A fixed domain type need not become generic.
4. **Set use-site variance from semantic data flow.** A source is often `? extends T`; a sink is
   often `? super T`; a parameter requiring exact read/write correlation may be `T`. Return types
   usually avoid wildcards for usability, but public families such as `Class<? extends X>` show
   legitimate exceptions.
5. **Check the runtime boundary.** Deserialisation, reflection, raw aliases or untyped caches can
   bypass the static contract; a typed cache/callback does not inherently lose it. Check the
   producer and token/validation behavior, including nested element types, before trusting values.
6. **Verify.** Account for unchecked warnings and justify each narrow suppression. Compile
   positive and deliberately invalid caller examples, and exercise runtime boundaries where
   static checking ends. Remove type-workaround copies, not copies required for ownership or
   isolation; report what the checks actually establish.

## Rules

- Avoid raw types except where required by class literals or legacy interoperation. Raw instance
  member types are erased under JLS rules; static members are not erased merely through a raw
  qualifier. `List<Object>` says "any object"; `List<?>` says "unknown element type";
  a raw `List` bypasses element-type checks and can introduce unchecked conversions.
- Use `List<?>` when element type is irrelevant. An arbitrary non-null value cannot be added directly, but this
  is not a read-only view: `clear`, iterator removal, and some `null` mutations remain possible.
  Unmodifiable wrappers restrict mutation through that view; backing aliases and mutable
  elements may still change. Snapshot/copy ownership belongs to java-immutability.
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
  needs exact read/write correlation. Wildcard capture can also support safe mutations such as
  swapping existing elements; return wildcards need the deliberate reason described in step 4.
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
  accepts a subtype whose comparison is inherited from a base class.
- With an `Object` operand, `instanceof List<String>` is illegal and `(List<String>) value`
  checks only that the object is a `List`, not its elements. Untyped JSON object elements may
  become maps while JSON strings remain strings. Pass an explicit type token (`Class<T>` for
  reifiable types, `TypeReference<List<String>>`,
  `ParameterizedTypeReference`) or validate the elements at the boundary.
- Represent "a container of many types" with a class token as key (`Map<Class<?>, Object>`
  behind an API that casts with `type.cast(value)`), not with `Object` values that callers
  cast themselves. For reifiable keys, `Class.cast` performs a checked cast with no unchecked
  suppression; `List.class` cannot distinguish lists by their element type.
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
