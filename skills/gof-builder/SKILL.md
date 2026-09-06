---
name: gof-builder
description: >
  Builder in modern Java: distinguish the original GoF separation of construction process from
  representation from the Effective Java fluent value builder. Covers selection signals rather
  than parameter-count thresholds, staged builders, invariant placement, mutable-builder
  concurrency hazards, Lombok/JPA boundaries, performance evidence, and test data builders. Use
  for ambiguous or telescoping construction, incremental input, multiple representations, or a
  builder that permits invalid combinations. Does not cover product-type selection
  (gof-factory-method, gof-abstract-factory), copying (gof-prototype), fluent APIs generally
  (java-fluent-apis), or value semantics (java-immutability).
---

# Builder

## Purpose

Make the construction of a complex object readable and safe. Java has no named arguments and no
default parameter values; a builder can simulate both and gives one place where the whole
object's invariants can be checked before publication.

The original GoF pattern also separates a **construction process** from the representations it
can produce: the same parser or director can drive a tree builder, text builder, or test builder.
That is distinct from the now-common Effective Java fluent builder for one value type. Name which
variant is intended; their selection criteria and failure modes differ.

For a fluent value builder, readability, defaults, staged input and invariant enforcement are the
usual justification. For a GoF representation builder, the justification is reuse of the
construction process across outputs. A builder that provides neither is ceremony.

Examples use Java 17 records/sealed types, without preview features. Inspect the target release,
generated code and framework versions first; this skill does not authorize a toolchain upgrade.

## When it is the answer

```text
A constructor whose arguments are easy to misread or mis-order
        → consider a builder, named factories, or stronger parameter types.

Several parameters are genuinely optional with sensible defaults
        → telescoping constructors otherwise, or nulls as "absent".

An invariant spans several fields and can only be checked when
all are known ("either accountId or iban, not both")
        → one validation point, before the object exists.

A collection is accumulated by the caller over several steps
        → addItem(...) reads better than assembling a list first.

The object is built from parsed or streamed input arriving in pieces
        → there is no single moment where all arguments are in hand.
```

## When it is not

- **A small, obvious value with required, well-typed components.** A record's canonical
  constructor already checks arity and types; Java remains positional, so repeated or weak types
  can still justify named factories or a builder.
- **All required components have unambiguous types.** A constructor often suffices; a conventional
  optional-setter builder can lose presence checks, though staged or required-argument builders need not.
- **The variants are few and nameable.** Two or three static factories
  (`Money.of`, `Money.zero`, `Retry.none`) beat a builder and document intent better.
- **A mutable builder is shared across requests without ownership.** Fix its lifecycle; storing
  a confined builder in a field or deliberately reusing it sequentially is not inherently unsafe.
- **A mutable bean has no construction constraints.** A value builder may add little. GoF builders
  can legitimately produce mutable trees/documents; define ownership and valid completion instead.

## Modern Java expression

```text
Small, all required                 record Point(int x, int y)
Few named shapes                    static factories on the record
Optional components, sensible
  defaults                          record + builder or named factories;
                                    framework config defaults are binding-specific
Deriving a variant of an instance   withX() for a small change; toBuilder()
                                    can support several coordinated changes
Required-then-optional, enforced
  at compile time                   staged builder (one interface per step)
Test fixtures                       test data builder with a valid default
```

A record plus a builder is not redundancy: the record owns the invariants and the identity, the
builder owns the ergonomics. Put validation in the **record's compact constructor**, not only in
`build()` — otherwise every other construction path, including deserialisation and `withX`
copies, bypasses it.

## Decision rules

```text
IF the type is small and the positional call remains unambiguous
THEN prefer a record or constructor; do not use parameter count alone as the decision.

IF several components are optional
THEN builder, or a record whose optional components have documented
     defaults supplied by named static factories.

IF some components are required and mis-ordering is possible
THEN either distinct types (a Money, an OrderId — not two Strings), or a
     staged builder or required-argument builder. Stages enforce calls, not non-null
     or semantically valid values; constructor validation still applies.

IF an intrinsic value invariant lives only in build() and other construction paths exist
THEN enforce it at the value's constructor/factory boundary and delegate from build().
     A GoF mutable representation may instead need explicit completion validation.

IF the builder is stored in a field or shared between requests
THEN inspect ownership and escape paths. Prefer per-construction confinement;
     alternatives need an explicit immutable or synchronized lifecycle contract.

IF the builder can produce an object that later throws because a
combination was illegal
THEN the illegal combination must be rejected in build(), naming both
     fields. "field X is required" when Y was set is not enough.

IF @Builder is applied to a JPA entity
THEN verify the generated constructor path, identity/lifecycle rules, association
     defaults and ORM constructor requirements. Prefer domain factories when they
     make valid aggregate creation clearer (orm-structural-mapping).
```

## Cross-cutting checks

- **Concurrency.** A conventional mutable builder is not thread-safe by default. The hazard can be a builder
  held as a field of a singleton, or captured by a lambda that outlives the call. Build inside
  the scope that needs the object, publish the finished immutable value.
- **Distribution.** Builders are the normal shape for protocol messages and outbound requests,
  and generated ones (protobuf, Avro, gRPC, cloud SDKs) already exist — reuse them unless an
  application-owned contract or validation boundary justifies an adapter. What crosses the wire is the built value, so its invariants must hold after
  deserialisation too: a builder-enforced rule that the deserialiser does not re-run is not
  enforced (`java-immutability`).
- **Performance.** A conventional mutable builder introduces a candidate allocation and may also
  allocate collection buffers or staged lambdas. HotSpot may scalar-replace a non-escaping
  builder, but this is compilation- and call-site-dependent. Measure allocation and retained
  data before changing construction (`jmh-microbenchmarks`, `allocation-profiling`).
- **Testing.** Test data builders are the strongest everyday use of this pattern: a builder with
  a valid default for every field, where a test names only what it cares about. It keeps tests
  readable when a required field is added, because only the builder changes
  (`java-test-design`).

## Review checklist

- [ ] Value-product constructors enforce invariants; mutable GoF products have explicit ownership and completion rules
- [ ] Every public value-construction path enforces intrinsic invariants; builder-specific state checks remain local
- [ ] Cross-field rules are checked at `build()` and name both fields when violated
- [ ] Required components are enforced — by a staged builder, or by a check that names them
- [ ] Builder confinement, reuse/reset semantics and failed-build behavior are explicit
- [ ] Call-site ambiguity, optionality, staged construction, or representation variance actually
      justifies it; parameter count alone does not
- [ ] Immutable products snapshot collections at construction; mutable elements are addressed separately
- [ ] Variant construction revalidates the result, whether through factories, `withX` or `toBuilder`
- [ ] Generated-builder adapters have a concrete boundary benefit rather than merely duplicating setters

Report the chosen variant, why simpler construction is insufficient, invariant/ownership boundary
and validation performed. For a small review, a concrete finding and focused check suffice.

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — selection signals,
  records and static factories against builders, staged builders and
  what they cost, where validation must live, and the Lombok `@Builder` failure modes on
  entities and records. Read before adding or removing a builder.
- [Worked example](references/worked-example.md) — a payment instruction with mutually exclusive
  fields, taken from telescoping constructors to a record and builder, then a staged API sketch,
  with the validation placement made explicit and a test data
  builder derived from it. Read when implementing.
