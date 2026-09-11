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

Turn null from an ambient hazard into a stated contract. Java is not null-safe and JSpecify
annotations add no built-in runtime enforcement — enforcement depends on the actual checker
or runtime validation path. The failure mode this skill prevents is the NPE thrown three layers and
twenty minutes away from the code that produced the null, because nothing between the two
said whether null was allowed.

## Workflow

Inspect compiler release/toolchains, runtime, existing annotation vocabulary, checker scope,
JSpecify/tool versions and mapper configuration before edits. Guidance uses Java 25 and
JSpecify 1.0; collection factories need Java 9+,
`List.copyOf` Java 10+, records and `Stream.toList` Java 16+. Use target-compatible alternatives;
do not upgrade or introduce a checker/dependency unless annotation adoption is in scope.
Reuse established caller and construction-path evidence; ask only about unresolved null meanings
or enforcement paths that change the fix. Keep an adequate existing representation. When tooling
or a construction path is unavailable, report the gap rather than claiming null safety.

1. **Name what each null means.** Absence (no promotion for this SKU), error (mandatory
   field missing), or uninitialised (lifecycle not yet complete). Different meanings get
   different treatments: choose an empty collection, Optional or explicit nullable contract
   for absence; reject invalid input under the operation's failure policy; document or remove
   an uninitialised phase. Preserve distinctions such as missing, explicit null and empty when
   callers observe them; do not turn a local fix into an incompatible API migration.
2. **Establish the default.** Preserve the project's annotation vocabulary. When adopting
   JSpecify, `@NullMarked` establishes a non-null default with `@Nullable` exceptions and the
   type-variable/local-inference qualifications in the reference. Unmarked nullness is
   unspecified to JSpecify; inspect documentation and callers before changing the contract.
3. **Enforce where ownership/trust changes.** Constructors establish their own invariants;
   adapters validate external values; public APIs enforce documented non-null preconditions.
   Remove interior checks only when every construction/call path proves the contract.
4. **Fence the leaks.** DTO binding, ORM mappings, `Map.get`, array slots and varargs can
   introduce null under their actual configuration/API contracts. Convert at the owning
   boundary; retain legal nulls and re-check after transitions that can invalidate the proof.
5. **Verify the affected contract.** Exercise null through the changed boundary, asserting
   rejection, normalization or preservation according to its policy. Run the configured
   checker when present; add one only when adoption is in scope. For checker work, pin
   checker/compiler versions and test relevant generics, arrays, overrides and unannotated
   dependencies because JSpecify support is not identical across tools.

## Rules

- Public constructors and entry points enforce their non-null preconditions before invalid effects,
  preserving the failure contract. Explicit checks can improve blame location; a natural operation
  can suffice when it gives the required failure and ordering. In records explicit checks belong
  in the compact constructor; `List.copyOf` rejects a null list and null elements in the same move.
- Prefer an empty collection when the contract means zero elements. `List.of()` / `Map.of()` /
  `Set.of()` are unmodifiable; preserve a published mutable-return contract with a fresh mutable
  empty collection. Do not collapse unknown/not-loaded/error into empty without an explicit policy.
- `@NullMarked` is metadata, not a runtime guard. Name the actual checker and analyzed scope;
  ordinary `javac` acceptance is not nullness verification. If generated/runtime validation reads
  annotations, verify that path separately rather than crediting the annotation itself.
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
  differs from container nullness. Use JSpecify type-use syntax accepted by the chosen checker;
  for checker-backed signature changes, add consumer compile tests.
- Override contracts are directional: an implementation must not reject null accepted by its
  supertype, and may return a non-null value where the supertype permits null. When using a checker,
  include both declarations; framework-generated subclasses and unannotated bytecode can hide violations.
- Primitive DTO fields cannot represent “missing” separately from zero/false when a binder applies
  Java defaults. Use boxed/raw DTO fields, required-creator semantics or presence tracking at the
  wire boundary, then convert to primitives after validation.

## NPE diagnosis

1. Read the helpful-NPE expression and full stack, but treat the dereference as the symptom—not
   necessarily the producer.
2. Trace assignments/returns back to the first nullable or unannotated boundary; classify absence,
   invalid input or lifecycle state.
3. Fix the producer contract/conversion and use available checker/caller evidence to find affected
   paths; avoid a local `if (x != null)` that silently drops required work.
4. Add the relevant boundary regression; for checker-backed work, add a compile-time nullness fixture.
   Verify logs/errors do not expose sensitive object contents while diagnosing.

## References

Deliver each null's meaning, affected declaration/boundary, chosen representation and checks
executed. Report any checker version, analyzed scope and unchecked dependencies; pair nullness
compile fixtures with runtime boundary regressions when applicable. Neither annotations nor a
zero-warning partial scan prove that every runtime construction path is safe.

- [Nullability contracts](references/nullability-contracts.md) — read when introducing
  JSpecify to a codebase, deciding annotation placement, or judging whether a flagged
  nullable field is actually a defect.
- [Worked example: hardening a service boundary](references/boundary-hardening.md) — read
  when NPEs originate from deserialised input or repository lookups, or before reviewing
  an inbound adapter.
