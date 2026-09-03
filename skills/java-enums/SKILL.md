---
name: java-enums
description: >
  Enums as types rather than labelled integers: instance fields instead of ordinal,
  constant-specific behaviour and strategy enums, extensibility through interfaces, EnumSet
  and EnumMap instead of bit fields and ordinal-indexed arrays, exhaustive switch and what
  separate compilation does to it, and what happens when an enum value crosses a database, a
  JSON payload or a topic. Use when int or String constants stand in for a closed set, when
  ordinal() appears anywhere outside a library, when @Enumerated is declared ORDINAL or left
  at its default, when a switch over an enum has a default branch that hides new constants,
  when adding a constant breaks a consumer during a rolling deploy, when values() is called
  in a loop, or when a set of flags is packed into an int. Does not cover annotations
  (java-annotations), sealed hierarchies and records as the open-data alternative
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

1. **Confirm the set is closed for the compatibility horizon**—statuses and error categories may
   qualify; currencies and standards can evolve. If new values arrive independently from outside
   the code (tenant-configured categories,
   strategies. If new values arrive from outside the code (tenant-configured categories,
   plugin-provided types), an enum is the wrong shape; use a value type with validation.
2. **Give each constant its data as instance fields**, assigned through the constructor.
   Anything derived from position — an id, a code, a weight, a display name — is a field, not
   `ordinal()`.
3. **Place varying behaviour with its owner.** Constant-specific bodies or a strategy field fit
   intrinsic behavior; an exhaustive caller-side switch fits a concern owned by that caller.
4. **Choose the collection by the type, not the habit.** `EnumSet` replaces bit fields;
   `EnumMap` replaces arrays indexed by `ordinal()`.
5. **Decide the external representation explicitly** before the first release: an explicit
   code field for storage and wire, `name()` only when you accept that renaming a constant is
   a breaking change.
6. **Plan for a consumer that does not know a constant yet.** In a rolling deploy the producer
   is ahead of the consumer for minutes to hours; decide now whether that is an error, a
   fallback, or a rejected message.

## Rules

- Prefer an enum when a set is closed for the deployment/compatibility horizon and values need
  type-safe identity. It buys compile-time checking and a namespace; `toString()` defaults to the
  identifier and is not automatically a user-facing label. Independent boolean dimensions may
  remain booleans or become `EnumSet`, not one mutually exclusive enum.
- Never derive meaning from `ordinal()`. It changes when someone reorders or inserts a
  constant — a source change that compiles cleanly and silently reinterprets existing data.
  Declare an explicit field (`code`, `id`, `weight`) and a lookup map for the reverse
  direction. `ordinal()` exists for `EnumSet`/`EnumMap` internals.
- Do not persist an ordinal as domain identity. In common JPA mappings, `@Enumerated` defaults to
  `ORDINAL` unless newer metadata such as `@EnumeratedValue` changes inference—declare the mapping
  explicitly. `STRING` couples storage to `name()`; an `AttributeConverter` or explicit scalar
  mapping can use stable codes. Verify provider/spec version, constraints and unknown-value policy.
- Prefer `EnumSet` to bit fields and to `HashSet` for enum elements: it is a bit vector
  internally, so it is compact and fast, and it prints and iterates in declaration order.
  It is not thread-safe and it is mutable — wrap it with `Collections.unmodifiableSet`, or
  copy it, before exposing one.
- Prefer `EnumMap` to `HashMap` for enum keys and to any array indexed by `ordinal()`. It is
  array-backed with declaration-order iteration, and it removes the manual index arithmetic
  that breaks when a constant is inserted.
- `values()` returns a **fresh clone of the array on every call**, because the array is
  mutable and the enum cannot hand out its own. In a hot loop or a per-request path, hoist it
  into a `private static final` array or an immutable `List`. Java 25's `values()` is still
  this contract — do not assume a cached array.
- Put intrinsic per-constant behaviour on the constant. Two forms, both valid: an abstract method with a
  body per constant, or a field holding a shared strategy (the _strategy enum_ — several
  constants delegating to the same nested strategy enum) when constants group into a few
  behaviours. A `switch (this)` is not inherently unsafe: an exhaustive switch expression without
  a catch-all gives compiler assistance; choose based on behavior ownership and extension cost.
- Extend an enum's reach with an interface, not with inheritance — enums cannot be extended.
  Declare the interface, let several enums implement it, and program against the interface
  (`<T extends Enum<T> & Operation>` when the code needs both). This allows several closed enum
  sets behind one contract; truly open plugin values may need ordinary classes/records and a registry.
- Use an exhaustive `switch` expression without a catch-all for dispatch over an enum you own: the
  compiler then fails source recompilation when a constant is added. Traditional statement
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
- Do not switch on an enum in a `hashCode`, `equals` or `compareTo` implementation and expect
  cross-JVM stability: `Enum.hashCode` is identity-based and differs per run, and
  `compareTo` is defined by ordinal. Sorting by declaration order is legitimate _inside_ a
  process; persisting or transmitting anything derived from it is not.

## References

- [Enum patterns](references/enum-patterns.md) — read when deciding between constant-specific
  bodies, strategy enums and an interface; when replacing a `switch` chain; or when an enum is
  becoming a state machine or a registry.
- [Enums across boundaries](references/enums-across-boundaries.md) — read before an enum
  reaches a database column, a JSON contract, a message schema or another team's code, and
  whenever adding or removing a constant needs a deployment plan.
