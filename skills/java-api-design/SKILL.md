---
name: java-api-design
description: >
  Naming and API design for Java code that others call: names carrying domain vocabulary,
  method and boolean naming conventions, arity and parameter objects, overload hazards,
  discoverability, public versus internal surface (package-private, JPMS exports), and API
  evolution — binary, source and behavioural compatibility, deprecation, semantic
  versioning. Use when designing or reviewing a public type, when a signature has grown
  past three parameters, when adding a method, overload or record component to a published
  API, or when deciding what a module exports. Does not cover builder and fluent-chain
  mechanics (java-fluent-apis) or exception contracts (java-exception-design).
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
3. **Shape the signatures.** In a method signature: four or more parameters, or three
   with a boolean or two of the same type adjacent → introduce a parameter object (a
   record with a validating compact constructor) or split the method. Constructor
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

- Boolean accessors read `is`/`has`/`can` and assert the positive: `isActive`, never
  `isNotExpired`. A caller should never negate a negation.
- Collection-valued names are plural (`lineItems()`), and collection returns are never
  null — empty means empty.
- No abbreviations except those established in the caller's domain (`VAT`, `IBAN`,
  `TTL`); `calcAmt` saves four characters and costs every reader a guess.
- Discoverability is structural: each return type should offer the natural next call, so
  the IDE's completion list reads as documentation. A method returning `String` or `Map`
  where a domain type exists throws that thread away.
- Deprecate with a destination: `@Deprecated(since = "...", forRemoval = true)` plus a
  Javadoc `@deprecated` naming the replacement. Deprecation without an alternative is a
  complaint, not a policy. Remove no earlier than the next major version.
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
