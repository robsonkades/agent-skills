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
staged builders that constrain evolution, and chain return-type changes that can break
published callers.

## Workflow

Inspect compiler release/toolchains, runtime, framework/generated construction paths and
published callers before choosing a form. Use Java 25 without preview as the authoring default
when no project target is specified; records require Java 16+, local `var` Java 10+, and `Optional`
Java 8+. Adapt to the project's target; do not upgrade, enable preview or add builder-generation
dependencies. Resolve missing caller/lifecycle evidence from the project first; ask only when an
unresolved answer would change the contract or chosen form. State reversible assumptions and keep
unsupported migration claims conditional.

1. **Sketch callers before declarations.** Use ordinary calls, a relevant advanced use such as
   conditional configuration, and likely misuse. Count parameters/options as signals, then examine
   same-type transposition, defaults, invalid combinations, construction frequency, API audience
   and evolution. Apply the decision table in
   `references/builder-decision.md` — the default is the simplest form that survives the
   caller risks, not a builder.
2. **Compare relevant cheaper forms first.** A record with a compact constructor, a second
   constructor, or a named static factory each beat a builder when they fit. A record with
   three cohesive components often needs no builder; positional ambiguity or named optionality
   can still justify one regardless of count. Compose independently varying capabilities; consider a
   DSL when a recurring domain grammar warrants it, not simply to make configuration read like prose.
3. **For value construction, prefer a mutable builder and immutable product.** Validate each setter's local input when
   useful; `build()` rechecks required and cross-field invariants, snapshots mutable inputs and
   returns a valid product. Specify whether builders are reusable; default to confined,
   non-thread-safe construction.
4. **If required-at-compile-time matters, price the staged variant.** Staging restricts the call
   sequence at the cost of public stage types and harder evolution. Use it when presence/order errors
   justify that cost and a required-argument factory or runtime check is insufficient; audience size
   affects the trade-off but is not a prerequisite.
5. **Verify the consumer contract**: compile supported calls and meaningful compile-negative misuse,
   exercise each declared invariant and lifecycle, and check return-type evolution — see the
   compatibility rules below.

## Rules

- Parameter counts are triage, not a builder threshold. Prefer a builder when named optionality,
  invalid combinations or positional confusion impose demonstrated call-site cost; prefer a
  constructor/factory when one coherent required value fits clearly. Distinct role types can
  solve same-type transposition without a builder.
- Mutable chaining methods commonly return `this` with a concrete builder or declared stage
  interface; immutable fluent methods return the resulting value. Changing a published return type
  later — even concrete class to interface — changes the method descriptor and breaks
  binary compatibility when the old descriptor no longer resolves, even when callers compile.
  Covariant bridges/inherited methods require separate inspection. Choose the return type at
  first release.
- Setters may reject context-free invalid values immediately. `build()` is the authoritative
  completeness/cross-field check; enforcing a cross-field rule in the first setter makes validity
  order-dependent and is usually wrong.
  If other construction paths exist, put intrinsic product invariants at their shared constructor
  or factory boundary and delegate from `build()`; builder checks must not be the only protection.
- Wither-style immutable APIs may create a new instance per changed value; no-op calls may
  return the receiver and unchanged immutable substructure may be shared. That is a cost mechanism,
  not a verdict: escape analysis may eliminate the copies, and only a profile of the real
  workload justifies abandoning the design.
- Prefer one chain call per source line once diagnosis matters. Line-number tables can then point
  nearer the failing invocation and breakpoints are easier to place; a fluent chain remains one
  caller stack frame, and compiler/debugger mappings are not guaranteed per call.
- Do not force conditional configuration into chain syntax. A local builder and ordinary `if` often
  read better; a domain conditional/composition operator is reasonable when its semantics are clear.
- For chains that perform operations, state when effects occur, whether evaluation is deferred,
  whether reuse is allowed, and who closes acquired results or cleans up after failure. Passing a
  borrowed resource into a fluent call does not by itself transfer ownership.
  Register an owned resource before later fluent setup can fail. For example,
  `try (var lines = Files.lines(path).filter(predicate))` does not itself close the acquired
  stream if `filter` throws before the initializer completes: acquire `lines` in the resource
  declaration and filter inside the protected body. Check any API-specific cleanup guarantee;
  [Files.lines](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/file/Files.html#lines(java.nio.file.Path)>)
  requires closing, and [JLS §14.20.3.1](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.20.3.1)
  explains which successfully initialized resources receive automatic cleanup.
- Fluency that forces the reader to scan the whole chain before knowing what happens is a
  net readability loss. Prefer clear constructors/factories for a small required parameter set;
  justify an exception using concrete call-site needs rather than a numeric threshold.
- Chaining the same conceptual object is different from navigating other objects' structure.
  Navigation needs a separate boundary assessment through java-law-of-demeter; dots alone do not
  establish a violation, especially for an intentional data representation.

## Production failure modes

- **Builder reuse leaks state:** a pooled/shared builder carries an option into the next product.
  Prefer per-use confinement or implement/test an explicit reuse/reset policy. Container management
  alone proves neither safety nor sharing; inspect the bean's scope and escape paths.
- **Aliasing survives `build()`:** copying references to mutable lists/maps lets later builder or
  caller mutation violate the product. Snapshot containers and address mutable elements as well.
- **Repeated `build()` is ambiguous:** state whether it may create equivalent independent values,
  is single-use, or transfers ownership. Tests should pin the chosen lifecycle.
- **Generated/reflection APIs:** Jackson, JPA, protobuf, native-image reflection and bean tools may
  require constructors/accessors or explicit builder metadata. Verify the actual serialization
  path and schema compatibility, not only Java call sites.
- **Published API evolution:** run source and binary compatibility checks. Additive overloads and
  fluent methods can still create source ambiguity, erasure clashes or lambda overload changes.

## References

Deliver the caller risk, selected form and lifecycle (reuse, thread confinement, snapshot or
ownership transfer), plus compatibility impact and checks executed. State which caller or evolution
evidence would change the choice. Exercise invalid values,
option ordering, repeated build, alias mutation and cleanup after chain-setup failure where
applicable. Distinguish compilation
from runtime/framework validation and unmeasured performance expectations.

- [Builder decision table](references/builder-decision.md) — read when deciding whether a
  type needs a builder at all, and for the false positives: framework-constrained classes,
  test-data builders, telescoping pairs that are fine as they are.
- [Worked example: a charge-request API](references/worked-example.md) — read when
  introducing a builder or a staged builder into existing code: telescoping constructors to
  a builder, the staged variant, trade-offs, and how to verify the change.
