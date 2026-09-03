---
name: java-fluent-apis
description: >
  Fluent interfaces and builders as API decisions: when a builder pays for itself versus a
  record, constructor or static factory; staged builders and their compatibility cost;
  immutable wither-style APIs; and the debugging and binary compatibility consequences of
  method chaining. Use when designing or reviewing a type with a costly constructor
  call site, several optional values, or adjacent parameters of the same type; when someone
  proposes a builder, staged builder or DSL; or when a long chain has become hard to read,
  debug or evolve. Does not cover navigation chains through other objects' structure
  (java-law-of-demeter) or general naming and parameter design (java-api-design).
---

# Java Fluent APIs

## Purpose

A builder or fluent chain is an API commitment, not a style choice. This skill exists to
prevent two opposite failures: builder ceremony wrapped around a type a record handles in
three lines, and a bare constructor with six positional parameters — three of them the same
type — that callers keep transposing. It also covers the costs that only appear later:
staged builders that freeze the API, and chain return types that cannot change without
breaking binary compatibility.

## Workflow

1. **Inspect call-site risk before designing.** Count parameters/options as signals, then examine
   same-type transposition, defaults, invalid combinations, construction frequency, API audience
   and evolution. Apply the decision table in
   `references/builder-decision.md` — the default is the simplest form that survives the
   counts, not a builder.
2. **Exhaust the cheaper forms first.** A record with a compact constructor, a second
   constructor, or a named static factory each beat a builder when they fit. A record with
   three components does not need a builder.
3. **If a builder: mutable builder, immutable product.** Validate each setter's local input when
   useful; `build()` rechecks required and cross-field invariants, snapshots mutable inputs and
   returns a valid product. Specify whether builders are reusable; default to confined,
   non-thread-safe construction.
4. **If required-at-compile-time matters, price the staged variant.** Staging buys unmissable
   required parameters and pays in one interface per stage plus a frozen evolution path. Take
   it only for widely consumed APIs where a missing parameter is expensive.
5. **Verify the result**: call sites format one call per line, `build()` rejects every
   invalid combination, and the chain's return types are ones you can live with — see the
   compatibility rules below.

## Rules

- Parameter counts are triage, not a builder threshold. Prefer a builder when named optionality,
  invalid combinations or positional confusion impose demonstrated call-site cost; prefer a
  constructor/factory when one coherent required value fits clearly. Distinct role types can
  solve same-type transposition without a builder.
- Chaining methods return `this` with the concrete builder type. Changing that return type
  later — even concrete class to interface — changes the method descriptor and breaks
  binary compatibility, even when the call sites still compile. Choose the return type at
  first release.
- Setters may reject context-free invalid values immediately. `build()` is the authoritative
  completeness/cross-field check; enforcing a cross-field rule in the first setter makes validity
  order-dependent and is usually wrong.
- Wither-style immutable APIs allocate a new instance per call. That is a cost mechanism,
  not a verdict: escape analysis may eliminate the copies, and only a profile of the real
  workload justifies abandoning the design.
- Prefer one chain call per source line once diagnosis matters. Line-number tables can then point
  nearer the failing invocation and breakpoints are easier to place; a fluent chain remains one
  caller stack frame, and compiler/debugger mappings are not guaranteed per call.
- No conditionals inside a chain. If a caller needs `if` between calls, break the chain
  into statements against a local builder variable — that is what the mutable builder is
  for.
- Fluency that forces the reader to scan the whole chain before knowing what happens is a
  net readability loss. Two parameters never justify a builder.
- A fluent chain that keeps returning the same conceptual object exposes no structure and
  is not a Law of Demeter violation; navigation through distinct objects' structure is —
  see java-law-of-demeter.

## Production failure modes

- **Builder reuse leaks state:** a pooled/shared builder carries an option into the next product.
  Create per use or implement/test an explicit reset; never publish one mutable builder as a bean.
- **Aliasing survives `build()`:** copying references to mutable lists/maps lets later builder or
  caller mutation violate the product. Snapshot defensively at construction.
- **Repeated `build()` is ambiguous:** state whether it may create equivalent independent values,
  is single-use, or transfers ownership. Tests should pin the chosen lifecycle.
- **Generated/reflection APIs:** Jackson, JPA, protobuf, native-image reflection and bean tools may
  require constructors/accessors or explicit builder metadata. Verify the actual serialization
  path and schema compatibility, not only Java call sites.
- **Published API evolution:** run source and binary compatibility checks. Additive overloads and
  fluent methods can still create source ambiguity, erasure clashes or lambda overload changes.

## References

- [Builder decision table](references/builder-decision.md) — read when deciding whether a
  type needs a builder at all, and for the false positives: framework-constrained classes,
  test-data builders, telescoping pairs that are fine as they are.
- [Worked example: a charge-request API](references/worked-example.md) — read when
  introducing a builder or a staged builder into existing code: telescoping constructors to
  a builder, the staged variant, trade-offs, and how to verify the change.
