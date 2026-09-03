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
3. **Enforce where ownership/trust changes.** Constructors establish their own invariants;
   adapters validate external values; public APIs enforce documented non-null preconditions.
   Remove interior checks only when every construction/call path proves the contract.
4. **Fence the leaks.** Deserialised DTOs, ORM relations, `Map.get`, array slots and
   varargs all deliver null regardless of your annotations. Convert to your contract at
   the boundary, once.
5. **Verify.** A checker (for example NullAway under Error Prone) wired into the build,
   and a test feeding null through each boundary asserting it is rejected or normalised
   there—not deeper. Pin checker/compiler versions and test generics, arrays, overrides and
   unannotated dependencies because JSpecify support is not identical across tools.

## Rules

- Public constructors and entry points reject values their contract marks non-null, preferably at
  entry with a stable field/error identifier. In records this belongs in the compact
  constructor; `List.copyOf` rejects a null list and null elements in the same move.
- Return `List.of()` / `Map.of()` / `Set.of()` for "nothing", never null. A null
  collection forces every caller into a check that an empty one makes unnecessary.
- Never claim an annotation prevents anything at runtime. `@NullMarked` without a checker
  in the build is documentation; with one, it is a compile-time contract. Say which.
- `Map.get` returns null for both "absent" and "mapped to null" — resolve it with
  `getOrDefault` when only absence should select a default (an explicitly mapped null remains
  null), or collapse both to absence with `Optional.ofNullable` at the API edge. Only
  `containsKey` distinguishes on a stable nullable map; separate calls race under concurrent
  mutation. `ConcurrentHashMap` forbids null keys/values, making a single `get` unambiguous.
- Prefer empty collections and Optional/result/domain failures where they communicate absence well.
  An explicitly `@Nullable` public return is still a valid Java/JSpecify contract when framework
  conventions, hot-path cost or migration compatibility justify it; callers and overrides must be
  checked consistently. Unannotated ambient null is the defect, not every nullable API.
- Nullness has positions: `String @Nullable []` marks the array reference nullable, while
  `@Nullable String[]` places nullability on its element type; generic element nullness likewise
  differs from container nullness. Use JSpecify type-use syntax accepted by the chosen checker and
  add compile tests for published signatures.
- Override contracts are directional: an implementation must not reject null accepted by its
  supertype, and may return a non-null value where the supertype permits null. Run the checker on
  both declarations; framework-generated subclasses and unannotated bytecode can hide violations.
- Primitive DTO fields cannot represent “missing” separately from zero/false when a binder applies
  Java defaults. Use boxed/raw DTO fields, required-creator semantics or presence tracking at the
  wire boundary, then convert to primitives after validation.

## NPE diagnosis

1. Read the helpful-NPE expression and full stack, but treat the dereference as the symptom—not
   necessarily the producer.
2. Trace assignments/returns back to the first nullable or unannotated boundary; classify absence,
   invalid input or lifecycle state.
3. Fix the producer contract/conversion and let the checker identify affected paths; avoid a local
   `if (x != null)` that silently drops required work.
4. Add a boundary regression and a compile-time nullness fixture. Verify logs/errors do not expose
   sensitive object contents while diagnosing.

## References

- [Nullability contracts](references/nullability-contracts.md) — read when introducing
  JSpecify to a codebase, deciding annotation placement, or judging whether a flagged
  nullable field is actually a defect.
- [Worked example: hardening a service boundary](references/boundary-hardening.md) — read
  when NPEs originate from deserialised input or repository lookups, or before reviewing
  an inbound adapter.
