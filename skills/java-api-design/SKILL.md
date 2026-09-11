---
name: java-api-design
description: >
  Java API design from ordinary, advanced and invalid consumer calls: names carrying domain vocabulary,
  method and boolean naming conventions, arity and parameter objects, overload hazards,
  discoverability, public versus internal surface (package-private, JPMS exports), and API
  evolution — binary, source and behavioural compatibility, deprecation, semantic
  versioning. Use when designing or reviewing a public type, when a signature has grown past
  three parameters, when adding a method, overload or record component to a published API,
  or when deciding what a module exports. Does not cover builder and fluent-chain mechanics
  (java-fluent-apis) or exception contracts (java-exception-design).
---

# Java API Design

## Purpose

Design surfaces that callers use correctly on the first attempt and that can evolve
without breaking them. Two failure modes: the API that leaks its implementation (callers
learn internals, every refactor becomes a breaking change), and the API frozen by fear
because nobody can classify which changes are safe. Every public member is a liability
accepted on behalf of unknown callers — publish deliberately, evolve deliberately.

## Workflow

Before proposing code, inspect compiler release/toolchains, dependencies, CI/runtime versions,
the previous public API and supported consumers. Use Java 25 without preview as the authoring
default when no project target is specified; the record snippets require Java 16+.
JPMS and enhanced deprecation require Java 9+, `List.copyOf` Java 10+, and record patterns
Java 21+ without preview. Adapt to the project's target; do not upgrade it or enable preview.
If release or consumer evidence is missing, state the gap and keep compatibility claims
conditional rather than declaring a safe minor release.

1. **Sketch consumer code before declarations.** Start from existing callers and the requested
   outcome; write ordinary use, a relevant advanced use, and likely misuse. Check what the
   caller must know, which choices are required, how failure is handled, and who owns any
   returned resource. For a small API these can be three short call sites. Resolve material
   unknowns from project evidence or a focused question; label reversible assumptions.
   Name from the caller's domain (`settle`, `authorise`, `refund`), not the implementation.
   When choosing or reviewing names, read [references/naming.md](references/naming.md)
   for the heuristics and the false positives.
2. **Minimise the surface.** Package-private is the default; `public` is the exception
   that needs a caller. In named modules, an unexported package is inaccessible to ordinary
   external source access; classpath use, reflective access and explicit overrides need
   separate review. Use `exports` for intended API packages only and identify the actual
   supported surface before deciding a deprecation cycle is unnecessary.
3. **Shape the signatures.** Parameter count is a signal, not a threshold. Boolean flags,
   transposable same-typed arguments, recurring data clumps, optionality and independent
   evolution often justify a parameter object or split method; a cohesive four-argument
   operation may be clearer as-is. Compare only forms that address the observed caller risk:
   a constructor/record for clear required values; a named factory for distinct creation
   meanings; a builder or fluent configuration for meaningful optionality; staged construction
   when preventing invalid sequences earns its extra public types and evolution cost.
   Compose capabilities when support varies independently; consider a DSL only when callers
   need a recurring domain language. Keep the simplest form that meets the contract, and state
   what new caller evidence would change the choice. java-object-construction and
   java-fluent-apis own factory/builder mechanics; this skill owns the consumer comparison.
4. **Check the overload set.** Overloads must be interchangeable in behaviour, differing
   only in accepted form. Never overload where boxing, widening or generics make
   resolution surprising — different behaviour gets a different name.
5. **Classify every change to a published API** as binary, source and behaviourally
   compatible or not, using
   [references/compatibility.md](references/compatibility.md), before choosing the
   version number. For an end-to-end design-and-evolve pass, read
   [references/worked-example.md](references/worked-example.md).

## Rules

- Prefer positive boolean predicates (`isActive`, `hasCapacity`, `canSettle`) and match the
  published family/framework convention; records may naturally expose `active()`. A negative
  concept can be legitimate when it is the domain state, but avoid forcing callers through
  double negation.
- Collection-valued names are plural (`lineItems()`), and collection returns are never
  null—empty means empty. Also specify encounter order, mutability, snapshot/live-view semantics,
  ownership and concurrency; `List` alone answers none of those.
- No abbreviations except those established in the caller's domain (`VAT`, `IBAN`,
  `TTL`); `calcAmt` saves four characters and costs every reader a guess.
- Check discoverability at call sites: names, parameter roles and useful result operations
  should be apparent without knowing implementation details. A domain type can expose a
  meaningful contract; a plain `String` or `Map` may be exactly the promised value. Neither
  wrapping every scalar nor making every operation chainable is a usability requirement.
- Accept the least-specific abstraction the operation needs and return the most-specific useful
  contract, but do not expose an internal mutable collection. `List.copyOf` creates an
  unmodifiable shallow snapshot and rejects null elements; `Collections.unmodifiableList` is a
  live read-only view. Choose and document one rather than calling both “immutable.”
- Keep `exports` (compile/link access) distinct from `opens` (deep reflective access) in JPMS.
  Framework reflection may require a qualified `opens ... to ...`; exporting a package merely to
  make reflection work expands the caller API unnecessarily.
- Treat overloads accepting functional interfaces, `null`, varargs, boxing or related generic
  types as a source-compatibility hazard. Compile representative lambda/method-reference call sites
  when adding one; existing binaries do not redo overload resolution.
- Document nullability, thread safety, blocking, ownership, idempotency and exception guarantees
  where relevant. These are behavioural API surface even when Java's type system cannot encode
  them. Cross-process wire compatibility remains rpc-and-api-contracts' responsibility.
- Deprecate with a migration: `@Deprecated(since = "...", forRemoval = true)` when removal is
  actually intended, plus a Javadoc `@deprecated` naming the replacement or explaining why no
  direct substitute exists. Removal follows the published compatibility window—commonly a major
  version—not merely the annotation.
- Under stable Semantic Versioning, narrowing the published input contract requires a major
  version even when callers still compile and link. Correcting behavior that violated the
  existing contract is different; inspect that contract and migration impact before classifying it.
- Which exceptions a method throws is part of its contract — design that surface with
  java-exception-design.

## References

For a review, deliver representative consumer calls, the affected declaration, compatibility
impact, selected form and focused validation. Exercise ordinary/advanced use and misuse, including
resource cleanup or invalid sequences when relevant. For an implementation, compile representative
callers at the target release; for published changes also run old binaries and relevant
contract tests. Separate executed checks from proposed checks and unavailable consumer evidence.

- [Naming](references/naming.md) — heuristics for method, boolean, collection and type
  names, and the false positives (long names, domain jargon, family symmetry). Read when
  choosing or challenging a name.
- [Compatibility](references/compatibility.md) — the change-kind table: binary, source
  and behavioural impact of each API change, with the JVM errors old clients actually
  see. Read before shipping any change to a published type.
- [Worked example](references/worked-example.md) — designing a small settlement API,
  then evolving it one minor version without breaking callers. Read when doing either.
