---
name: java-api-design
description: >
  Naming and API design for Java code that others call: names carrying domain vocabulary,
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

1. **Name from the caller's side.** The vocabulary is the caller's domain (`settle`,
   `authorise`, `refund`), never the implementation (`processData`, `handleRequest`).
   When choosing or reviewing names, read [references/naming.md](references/naming.md)
   for the heuristics and the false positives.
2. **Minimise the surface.** Package-private is the default; `public` is the exception
   that needs a caller. In a modular build, an unexported package is invisible regardless
   of modifiers — use `exports` for the API packages only. What is not published never
   needs a deprecation cycle.
3. **Shape the signatures.** Parameter count is a signal, not a threshold. Boolean flags,
   transposable same-typed arguments, recurring data clumps, optionality and independent
   evolution often justify a parameter object or split method; a cohesive four-argument
   operation may be clearer as-is. Constructor
   ergonomics — when a plain constructor or record suffices, builders, staged
   construction — are java-fluent-apis' territory.
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
- Discoverability is structural: each return type should offer the natural next call, so
  the IDE's completion list reads as documentation. A method returning `String` or `Map`
  where a domain type exists throws that thread away.
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
- Semantic versioning is a compatibility claim, not a counter: behavioural breaks are
  breaks — a stricter precondition on an existing method is a major version even though
  every caller still compiles and links.
- Which exceptions a method throws is part of its contract — design that surface with
  java-exception-design.

## References

- [Naming](references/naming.md) — heuristics for method, boolean, collection and type
  names, and the false positives (long names, domain jargon, family symmetry). Read when
  choosing or challenging a name.
- [Compatibility](references/compatibility.md) — the change-kind table: binary, source
  and behavioural impact of each API change, with the JVM errors old clients actually
  see. Read before shipping any change to a published type.
- [Worked example](references/worked-example.md) — designing a small settlement API,
  then evolving it one minor version without breaking callers. Read when doing either.
