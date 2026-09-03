# Nullability contracts

## JSpecify 1.0 — the current standard

JSpecify 1.0 defines a shared nullness vocabulary increasingly supported by checkers, IDEs and
language interop. Support depth still varies—especially for generic inference, wildcards, JDK
models and bytecode type annotations—so “uses JSpecify” does not prove equivalent enforcement.
Two annotations carry the core contract:

- `@NullMarked` — placed on a module, package (`package-info.java`) or class: every
  unannotated type usage within is **non-null by default**.
- `@Nullable` — a type-use annotation marking the exceptions: `@Nullable Customer
findBy(String id)` says "null is a legal return and means something".

```java
// package-info.java
@NullMarked
package com.example.billing;

import org.jspecify.annotations.NullMarked;
```

What this buys, precisely: a machine-readable contract that compatible tools may check at build,
edit or interop time. What it
does not buy: any runtime behaviour. An annotated method still returns null happily if
its body does; the JVM never reads the annotation. A codebase that adopts JSpecify
without wiring a checker into CI has bought documentation, which is still better than
nothing — but say which of the two you have.

## Adoption strategy for an existing codebase

1. Add a pinned `org.jspecify:jspecify` annotation dependency and a pinned checker/compiler
   configuration. Decide whether annotations ship in published bytecode/module metadata.
2. `@NullMarked` one coherent package at a time, often starting with dependency-leaf value/core
   APIs where contracts are clearest. Boundary DTO packages may intentionally contain many legal
   nulls and need explicit modelling before marking.
3. In each package, the checker's findings sort into: real defects (fix), legal nulls
   (mark `@Nullable` and make callers handle them), and boundary leaks (normalise at the
   edge — below).
4. Track a ratchet/baseline during migration and promote completed scopes to errors. Warning-only
   findings need ownership and a burn-down gate or they tend to become background noise.

Frameworks and dependencies may require other annotation vocabularies. Define which tool interprets
which annotations/defaults, prevent contradictory duplicates on one type use, and migrate public
signatures deliberately; a blind mechanical replacement can change generic/array annotation
positions and Kotlin semantics.

## Boundary tactics — where null leaks in regardless of contracts

| Leak                     | Behaviour                                                                                 | Tactic                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| JSON/XML deserialisation | absent field → null, ignoring annotations                                                 | validate the DTO once, at the adapter; convert to a domain type whose constructor enforces the contract                            |
| ORM / JPA relations      | absent optional to-one may be null; lazy state is normally proxy/wrapper/provider-managed | derive contract from mapping/schema/provider; do not label “unfetched” as null                                                     |
| `Map.get`                | null for absent **and** for mapped-to-null                                                | `getOrDefault` distinguishes absence but preserves an explicit null; `containsKey` distinguishes in a stable map; CHM forbids null |
| Reference arrays         | every slot null-initialised                                                               | track fill state or validate all slots; primitive arrays instead contain zero values                                               |
| Legacy/third-party APIs  | unannotated returns                                                                       | wrap once in an adapter that establishes your contract; do not sprinkle checks at every call site                                  |

The shape is: establish the nullness contract where data enters/objects are constructed, then rely
on it within the checked scope. Re-check only when another framework, override, reflective path or
trust boundary can invalidate the proof.

## False positives — nullable that is not a defect

- **A `@Nullable` field with a checked lifecycle.** A field null between construction and
  a framework-driven `init()`, or until a state machine reaches the state that sets it,
  is a documented phase, not a bug — provided every read either follows the lifecycle or
  checks. Flag it only when a read can legally precede the write.
- **Null as absence inside a private scope.** A local `Customer c = cache.get(id);`
  checked on the next line is idiomatic and cheaper than wrapping. Locality is the
  criterion: producer and check in the same screenful.
- **A lazily computed cache field.** Null meaning "not computed yet" inside one class is
  the single-check idiom, not a leak — java-immutability covers when that is safe.
- **requireNonNull "missing" on a private method.** If every caller is inside the
  boundary that already validated, the check is redundant by design. The finding is real
  only when the method is public or the boundary check is absent.

The inverse false negative is worth naming too: `requireNonNull` immediately before the same natural
dereference may mainly improve blame location/message and stabilize the public failure point. That
can be valuable, but it is not runtime null-safety for later producers.

## Tooling decision checks

- Pin checker, plugin, `javac` and JSpecify versions; test upgrades on representative generics.
- Compile published annotations into a consumer fixture, including Kotlin if supported.
- Test override variance, arrays/varargs, `T extends @Nullable Object`, wildcards and unannotated
  libraries—the places where checker support differs.
- Count suppressions/baseline growth and require a reason/owner; “zero reported findings” is only as
  strong as the analyzed scope and library models.

## Authoritative references

- [JSpecify 1.0 user guide](https://jspecify.dev/docs/user-guide/)
- [JSpecify specification](https://jspecify.dev/docs/spec/)
- [NullAway JSpecify support and limitations](https://github.com/uber/NullAway/wiki/JSpecify-Support)
- [Map API null/getOrDefault contracts, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Map.html)
