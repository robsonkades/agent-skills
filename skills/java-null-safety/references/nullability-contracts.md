# Nullability contracts

## JSpecify 1.0 — the current standard

`org.jspecify.annotations` is the nullability vocabulary the major checkers and IDEs have
converged on. Two annotations carry the whole contract:

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

What this buys, precisely: a machine-readable contract that tools — NullAway under Error
Prone, IntelliJ's inspections, Kotlin's interop — check at build or edit time. What it
does not buy: any runtime behaviour. An annotated method still returns null happily if
its body does; the JVM never reads the annotation. A codebase that adopts JSpecify
without wiring a checker into CI has bought documentation, which is still better than
nothing — but say which of the two you have.

## Adoption strategy for an existing codebase

1. Add the `org.jspecify:jspecify` dependency (annotations only, no runtime weight) and a
   checker to the build. Start with the checker in warning mode.
2. `@NullMarked` one package at a time, starting where NPEs actually occur — the
   boundary/adapter packages — not alphabetically. Each marked package is a completed
   contract; a half-annotated package is worse than an unannotated one because readers
   trust the default.
3. In each package, the checker's findings sort into: real defects (fix), legal nulls
   (mark `@Nullable` and make callers handle them), and boundary leaks (normalise at the
   edge — below).
4. Only when marking is done, promote warnings to errors. A checker permanently in
   warning mode decays into noise within weeks.

Mixing annotation vocabularies (`javax.annotation`, `org.jetbrains.annotations`,
JSpecify) in one codebase gives contradictory defaults per package — pick JSpecify and
migrate mechanically rather than coexisting.

## Boundary tactics — where null leaks in regardless of contracts

| Leak                     | Behaviour                                  | Tactic                                                                                                                              |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| JSON/XML deserialisation | absent field → null, ignoring annotations  | validate the DTO once, at the adapter; convert to a domain type whose constructor enforces the contract                             |
| ORM / JPA relations      | unfetched or absent relation → null        | treat entity getters as `@Nullable` at the repository boundary; do not let entities cross it                                        |
| `Map.get`                | null for absent **and** for mapped-to-null | `getOrDefault` when a default exists; `Optional.ofNullable` at the API edge; never `containsKey` + `get` on a concurrent map (race) |
| Arrays                   | every slot null-initialised                | fill on construction, or prefer `List.of`/`List.copyOf`, which reject nulls                                                         |
| Legacy/third-party APIs  | unannotated returns                        | wrap once in an adapter that establishes your contract; do not sprinkle checks at every call site                                   |

The shape is always the same: **normalise once, where the data enters, then trust the
contract inside.** A null check repeated on every hop is the symptom of a boundary that
never did its job.

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

The inverse false negative is worth naming too: `requireNonNull` on parameters the method
would dereference immediately anyway changes only the stack trace quality — the message
naming the parameter is the actual value. Without a message it is nearly a no-op.
