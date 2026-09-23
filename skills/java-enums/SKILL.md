---
name: java-enums
description: >
  Enums as types rather than labelled integers: instance fields instead of ordinal,
  constant-specific behaviour and strategy enums, extensibility through interfaces, EnumSet
  and EnumMap instead of bit fields and ordinal-indexed arrays, exhaustive switch and what
  separate compilation does to it, and what happens when an enum value crosses a database, a
  JSON payload or a topic. Use when int or String constants stand in for a closed set, when
  ordinal() encodes domain identity, when @Enumerated is declared ORDINAL or left
  at its default, when a switch over an enum has a default branch that hides new constants,
  when adding a constant breaks a consumer during a rolling deploy, when values() is called
  in a loop, or when a set of flags is packed into an int. Does not cover annotations
  (java-annotations), sealed hierarchies and records as data-bearing alternatives
  (java-composition-over-inheritance), or equality and ordering contracts in general
  (java-object-contracts).
---

# Java Enums

## Purpose

Turn a closed set of values into a type the compiler and the runtime both understand, and
keep it safe to evolve. Two failure modes: the "enum" that is really an `int` or a `String`,
so nothing rejects an invalid value and every use site re-implements the mapping; and the
real enum whose identity has leaked into a database column, a wire format or an exhaustive
switch, so adding a constant becomes a migration and a coordinated deploy.

## Workflow

Inspect compiler release/toolchains, runtime, persistence provider/spec, mapper/schema versions,
stored values and supported consumers first. No single authoring baseline is declared; Java 25
is referenced, while switch expressions require Java 14+, records Java 16+, and collection
copy factories Java 10+. `@EnumeratedValue` needs Persistence 3.2 support. Use the target's
existing alternatives; do not upgrade or enable preview. If consumer/mapping evidence is
missing, keep evolution claims conditional and state the checks needed before release.
Reuse the stated consumer contracts, workload and project conventions; ask only about unresolved
closure, unknown-value or compatibility requirements that change the choice. Retain an adequate
enum, lookup, switch or external encoding rather than turning every review into a migration.

1. **Confirm the set is closed for the compatibility horizon**—statuses and error categories may
   qualify; currencies and standards can evolve. If new values arrive independently from outside
   the code (tenant-configured categories,
   plugin-provided types), an enum is the wrong shape; use a value type with validation.
2. **Give each constant its data as instance fields**, assigned through the constructor.
   Anything derived from position — an id, a code, a weight, a display name — is a field, not
   `ordinal()`.
3. **Place varying behaviour with its owner.** Constant-specific bodies or a strategy field fit
   intrinsic behavior; an exhaustive caller-side switch fits a concern owned by that caller.
4. **Choose the collection by the type, not the habit.** `EnumSet` replaces bit fields;
   `EnumMap` replaces arrays indexed by `ordinal()` when their contracts fit. Preserve public
   masks/encodings through explicit conversion, including any unknown-bit forwarding policy.
5. **Decide the external representation explicitly** before the first release: an explicit
   code field for storage and wire, `name()` only when you accept that renaming a constant is
   a breaking change. Verify accepted token types and coercions as well as code values: a
   textual JSON representation does not by itself disable ordinal-number decoding. See
   `references/enums-across-boundaries.md` for mapper-specific checks.
6. **Plan for a consumer that does not know a constant yet.** Independently deployed producers
   and consumers can know different values; decide whether that is an error, a
   fallback, or a rejected message.

## Rules

- Prefer an enum when a set is closed for the deployment/compatibility horizon and values need
  type-safe identity. It buys compile-time checking and a namespace; `toString()` defaults to the
  identifier and is not automatically a user-facing label. Independent boolean dimensions may
  remain booleans or become `EnumSet`, not one mutually exclusive enum.
- Do not derive durable domain identity from `ordinal()`. Reordering or insertion can change
  positions — a source change that compiles cleanly and silently reinterprets affected data.
  Declare an explicit field (`code`, `id`, `weight`) and reverse lookup when needed.
  Internal enum-indexed structures may legitimately use `ordinal()` within their
  version/ownership contract; it is not automatically a stable external code.
- Do not persist declaration position as domain identity. Bare `@Enumerated` defaults to `ORDINAL`;
  Persistence 3.2 infers `STRING` from a final String `@EnumeratedValue` only when no explicit
  annotation/converter applies. That version also supports explicit numeric `ORDINAL` codes,
  which are not positions. Without an explicit value field, `STRING` uses `name()`. Preserve
  effective mappings; verify provider/spec support, constraints and unknown-value policy before migration.
- Prefer `EnumSet` to bit fields and to `HashSet` for enum elements: it is a bit vector
  internally and iterates in declaration order; workload and representation costs still matter.
  It is not thread-safe and it is mutable. A wrapper is a live unmodifiable view; copy then
  wrap for a snapshot, including the empty ordinary-set case described in the patterns reference.
- Prefer `EnumMap` for suitable enum-keyed maps. It is array-backed with declaration-order
  iteration and avoids hand-maintained index mappings that can diverge when constants change.
  A correctly initialized internal array is not invalid merely because it uses `ordinal()`.
  Check null contracts before either collection substitution: `EnumSet` rejects null elements,
  `EnumMap` rejects null keys but permits null values. Neither makes contained mutable data safe.
- `values()` exposes an array callers can modify without changing enum constants. javac
  commonly implements it by cloning a stored array; that lowering and allocation elimination
  are implementation details. Cache privately only when profiling shows repeated calls matter,
  and never expose a shared mutable cached array.
- Put intrinsic per-constant behaviour on the constant. Two forms, both valid: an abstract method with a
  body per constant, or a field holding a shared strategy (the _strategy enum_ — several
  constants delegating to the same nested strategy enum) when constants group into a few
  behaviours. A `switch (this)` is not inherently unsafe: an exhaustive switch expression without
  a catch-all gives compiler assistance; choose based on behavior ownership and extension cost.
- Extend an enum's reach with an interface, not with inheritance — enums cannot be extended.
  Declare the interface, let several enums implement it, and program against the interface
  (`<T extends Enum<T> & Operation>` when the code needs both). This allows several closed enum
  sets behind one contract; truly open plugin values may need ordinary classes/records and a registry.
- Prefer an exhaustive `switch` expression without a catch-all when each new constant needs an
  explicit decision: recompilation then exposes uncovered constants. Preserve a deliberate
  fallback when it satisfies the contract. Traditional statement
  switches may fall through; enhanced exhaustive switches can synthesize a runtime failure for an
  unforeseen constant. When the enum comes from another artifact, separate compilation means a
  new constant can reach old bytecode, so test the exact switch form and deployment policy.
- An enum with a mutable static field is shared mutable state with a nicer name; the constants
  are singletons for the whole class loader, reachable from every thread. Constants may hold
  immutable data freely, a lazily built lookup map safely (build it in a static initialiser),
  and mutable state only under the same discipline as any other shared object.
- A single-element enum provides serialization/class-initialization guarantees useful for some
  process/class-loader singletons—see java-object-construction—and an
  enum with an abstract method is a compact state machine, but neither should be used where
  the set is genuinely open.
- Enum `equals`, `hashCode` and `compareTo` are final. Hash codes have no cross-execution stability
  guarantee; they need not differ on every run. Natural order is declaration order, meaningful
  across processes only under an agreed compatible ordering. Use explicit stable codes/order
  contracts for durable identity or independently evolving consumers.

## References

Deliver the chosen set/representation, compatibility and unknown-value policy, and checks
executed against relevant old readers and representative stored/wire values. No change is a valid
result when the current contract is adequate. For collection changes,
test empty input and alias mutation. Separate compiler checks, integration tests and measured
performance from assumptions; written deployment cases are not executed verification.

- [Enum patterns](references/enum-patterns.md) — read when deciding between constant-specific
  bodies, strategy enums and an interface; when replacing a `switch` chain; or when an enum is
  becoming a state machine or a registry.
- [Enums across boundaries](references/enums-across-boundaries.md) — read before an enum
  reaches a database column, a JSON contract, a message schema or another team's code, and
  whenever adding or removing a constant needs a deployment plan.
