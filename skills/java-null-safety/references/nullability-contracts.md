# Nullability contracts

## JSpecify 1.0 vocabulary and scope

JSpecify 1.0 defines a shared nullness vocabulary increasingly supported by checkers, IDEs and
language interop. Support depth still varies—especially for generic inference, wildcards, JDK
models and bytecode type annotations—so “uses JSpecify” does not prove equivalent enforcement.
Two annotations carry the core contract:

- `@NullMarked` — establishes null-marked scope on a module, package (`package-info.java`),
  class or method. Ordinary concrete reference types default to non-null, but type variables
  may carry parametric nullness and local root types are inferred. A marked package does not
  mark its subpackages; `@NullUnmarked` opts a nested scope back into unspecified nullness.
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
does not buy: built-in runtime enforcement. With ordinary `javac` and no generated validation,
an annotated method can still return null. Runtime consumers can read retained annotations;
credit enforcement only to an identified checker or validation path actually exercised.
Documentation/interop benefits and a configured CI check are different outcomes; say which exists.

## Adoption strategy for an existing codebase

1. When adoption is in scope, add a pinned `org.jspecify:jspecify` annotation dependency and
   checker/compiler configuration. Preserve annotations for published consumers; check dependency
   exposure and bytecode/module metadata rather than assuming local source analysis covers them.
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

Unmarked does not mean nullable: it means unspecified nullness. Annotate nullable DTO
components and nested elements explicitly when they are intended to be modeled by the checker;
otherwise record the boundary as unchecked. A module-wide `@NullMarked` also covers DTO packages
unless an applicable `@NullUnmarked` scope overrides it.

## Boundary tactics — where null leaks in regardless of contracts

| Leak                     | Behaviour                                                                                         | Tactic                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| JSON/XML deserialisation | missing/null handling depends on mapper/creator configuration and primitive versus reference type | test the configured binder, validate raw input and construct the domain contract                                                   |
| ORM / JPA relations      | absent optional to-one may be null; lazy state is normally proxy/wrapper/provider-managed         | derive contract from mapping/schema/provider; do not label “unfetched” as null                                                     |
| `Map.get`                | null for absent **and** for mapped-to-null                                                        | `getOrDefault` distinguishes absence but preserves an explicit null; `containsKey` distinguishes in a stable map; CHM forbids null |
| Reference arrays         | every slot null-initialised                                                                       | track fill state or validate all slots; primitive arrays instead contain zero values                                               |
| Legacy/third-party APIs  | unannotated returns                                                                               | wrap once in an adapter that establishes your contract; do not sprinkle checks at every call site                                  |

The shape is: establish the nullness contract where data enters/objects are constructed, then rely
on it within the checked scope. Re-check only when another framework, override, reflective path or
trust boundary can invalidate the proof.

## False positives — nullable that is not a defect

- **A `@Nullable` field with a checked lifecycle.** A field null between construction and
  a framework-driven `init()`, or until a state machine reaches the state that sets it,
  is a documented phase, not a bug — provided every read either follows the lifecycle or
  checks. Flag missing initialization, reset or publication rules when an allowed read can
  observe an invalid state.
- **Null as absence inside a private scope.** A local `Customer c = cache.get(id);`
  checked before use can be adequate when it captures the intended lookup result. Line proximity
  alone is not proof: callbacks or another writer can invalidate a field between check and re-read.
  A non-null local does not prove that the referenced resource stays open or its state stays valid.
- **A lazily computed cache field.** Null can legitimately mean "not computed yet"; it is not by
  itself a safe single-check protocol. Establish confinement or the actual initialization and
  publication contract — java-immutability covers derived-cache conditions and their limits.
- **requireNonNull "missing" on a private method.** If every caller is inside the
  boundary that already validated, the check is redundant by design. The finding is real
  when an allowed call or intervening mutation can violate the precondition. Private visibility
  alone proves neither valid input nor a stable lifecycle; an equivalent natural failure can
  satisfy a public contract without a duplicate explicit check.

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
