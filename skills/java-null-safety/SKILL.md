---
name: java-null-safety
description: >
  Null as a semantic problem, not a syntax problem: what each null means (absence, error,
  uninitialised), nullability as an API contract, JSpecify @NullMarked and @Nullable, where
  Objects.requireNonNull belongs, empty collections over null, and the boundaries where null
  leaks in (deserialisation, ORMs, Map.get, arrays). Use when an NPE surfaces far from its
  cause, when hardening a service or module boundary, when adopting nullability annotations,
  or when reviewing constructors and public entry points. Does not cover the Optional API —
  orElse/orElseGet, chaining, where Optional belongs — which is java-optional, nor general
  validation strategy at trust boundaries — range and state checks, normalisation — which is
  java-defensive-programming.
---

# Java Null Safety

## Purpose

Turn null from an ambient hazard into a stated contract. Java is not null-safe and no
annotation makes it so at runtime — annotations are contracts, enforced only by the tools
that check them. The failure mode this skill prevents is the NPE thrown three layers and
twenty minutes away from the code that produced the null, because nothing between the two
said whether null was allowed.

## Workflow

1. **Name what each null means.** Absence (no promotion for this SKU), error (mandatory
   field missing), or uninitialised (lifecycle not yet complete). Different meanings get
   different treatments: absence becomes an empty collection or an Optional return, error
   becomes an immediate throw, uninitialised becomes a documented lifecycle — or a design
   to remove.
2. **Declare the default.** Under JSpecify, `@NullMarked` on the package or module makes
   non-null the default and `@Nullable` the marked exception. An unannotated codebase has
   the contract backwards: everything is implicitly a question.
3. **Validate where trust changes.** `Objects.requireNonNull(x, "x")` in constructors and
   public entry points — with the name in the message. Do not re-check on every private
   hop; inside the boundary the contract holds and re-validation is noise.
4. **Fence the leaks.** Deserialised DTOs, ORM relations, `Map.get`, array slots and
   varargs all deliver null regardless of your annotations. Convert to your contract at
   the boundary, once.
5. **Verify.** A checker (NullAway, Error Prone, IntelliJ analysis) wired into the build,
   and a test feeding null through each boundary asserting it is rejected or normalised
   there — not deeper.

## Rules

- Every public constructor and entry point rejects the nulls it cannot accept, by
  `requireNonNull` with the parameter name. In records this belongs in the compact
  constructor; `List.copyOf` rejects a null list and null elements in the same move.
- Return `List.of()` / `Map.of()` / `Set.of()` for "nothing", never null. A null
  collection forces every caller into a check that an empty one makes unnecessary.
- Never claim an annotation prevents anything at runtime. `@NullMarked` without a checker
  in the build is documentation; with one, it is a compile-time contract. Say which.
- `Map.get` returns null for both "absent" and "mapped to null" — resolve it with
  `getOrDefault` when a default exists, or collapse both to absence with
  `Optional.ofNullable` at the API edge; only `containsKey` truly distinguishes, and
  on a concurrent map even that is a race, not a check.
- Null for absence must not cross a public API: return an empty collection, an Optional
  (java-optional owns that API), or throw. Null inside a private scope, immediately
  checked, is fine — locality is what makes it safe.

## References

- [Nullability contracts](references/nullability-contracts.md) — read when introducing
  JSpecify to a codebase, deciding annotation placement, or judging whether a flagged
  nullable field is actually a defect.
- [Worked example: hardening a service boundary](references/boundary-hardening.md) — read
  when NPEs originate from deserialised input or repository lookups, or before reviewing
  an inbound adapter.
