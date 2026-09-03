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
- **All components required and of distinct types.** Mis-ordering does not compile; the builder
  removes a compile-time check and replaces it with a runtime one.
- **The variants are few and nameable.** Two or three static factories
  (`Money.of`, `Money.zero`, `Retry.none`) beat a builder and document intent better.
- **The builder is a field, or is reused between calls.** That is shared mutable state; see the
  hazards below.
- **The object is mutable anyway.** Builder's payoff is safe construction of an immutable value.
  Building a mutable bean adds a second way to reach the same state.

## Modern Java expression

```text
Small, all required                 record Point(int x, int y)
Few named shapes                    static factories on the record
Optional components, sensible
  defaults                          record + builder, or record +
                                    compact constructor with @DefaultValue
                                    style config binding
Deriving a variant of an instance   withX() copy methods, not a builder
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
     staged builder that will not compile until required steps are called.

IF validation lives only in build()
THEN move it into the constructed type's constructor and have build()
     delegate. Validation on the outside of a value is not validation.

IF the builder is stored in a field or shared between requests
THEN it is mutable shared state. Create it per construction, or make the
     accumulating type immutable and return a new builder per step.

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

- **Concurrency.** A builder is mutable and is not thread-safe; nothing about the pattern makes
  it so. The hazard is not two threads sharing one builder — that is obvious — but a builder
  held as a field of a singleton, or captured by a lambda that outlives the call. Build inside
  the scope that needs the object, publish the finished immutable value.
- **Distribution.** Builders are the normal shape for protocol messages and outbound requests,
  and generated ones (protobuf, Avro, gRPC, cloud SDKs) already exist — do not wrap them in a
  second builder. What crosses the wire is the built value, so its invariants must hold after
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

- [ ] The built type is immutable, and its own constructor enforces the invariants
- [ ] `build()` delegates validation rather than owning it exclusively
- [ ] Cross-field rules are checked at `build()` and name both fields when violated
- [ ] Required components are enforced — by a staged builder, or by a check that names them
- [ ] No builder instance is shared across calls, threads or requests
- [ ] Call-site ambiguity, optionality, staged construction, or representation variance actually
      justifies it; parameter count alone does not
- [ ] Collections are defensively copied on the way in and unmodifiable on the way out
- [ ] `withX` copy methods exist for deriving a variant, rather than a builder round trip
- [ ] No generated builder is wrapped in a hand-written one

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — the arity and
  optionality thresholds, records and static factories against builders, staged builders and
  what they cost, where validation must live, and the Lombok `@Builder` failure modes on
  entities and records. Read before adding or removing a builder.
- [Worked example](references/worked-example.md) — a payment instruction with mutually exclusive
  fields, taken from telescoping constructors to a record with static factories, then to a
  builder and a staged builder, with the validation placement made explicit and a test data
  builder derived from it. Read when implementing.
