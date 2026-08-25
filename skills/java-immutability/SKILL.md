---
name: java-immutability
description: >
  Immutable objects in modern Java: records in depth, defensive copies, immutable
  collection factories versus unmodifiable views, deep versus shallow immutability,
  final-field semantics and safe publication (JMM), and the withers pattern. Use when
  designing a value object, when a record has a List, Map or array component, when an
  accessor returns internal mutable state, when an "immutable" object is observed
  changing, or when deciding whether immutability is worth its allocation cost. Does
  not cover null validation in constructors (java-null-safety) or Optional usage
  (java-optional).
---

# Java Immutability

## Purpose

Make objects that cannot change after construction actually unable to change — and know
when not to bother. Two failure modes to prevent: the shallowly immutable object (final
fields, mutable contents) that changes under a caller who believed it could not; and
dogmatic immutability forced onto hot paths, entity frameworks and accumulators, where it
fights the tools without a measurement to justify it.

## Workflow

1. **Classify every field or record component.** Primitive, String, Instant, BigDecimal,
   enum, or another deeply immutable type — safe. Collection, array, Date, StringBuilder,
   or anything with setters — a mutation route that must be closed.
2. **Close the inbound route.** Copy in the constructor: `List.copyOf`, `Map.copyOf`,
   `Set.copyOf`, `clone()` for arrays. In a record, the compact constructor is where this
   lives.
3. **Close the outbound route.** No accessor may return a reference to internal mutable
   state. Copying on the way in makes accessors free; arrays still need a copy on the way
   out.
4. **Check publication.** Fields final, `this` not escaping the constructor. Only then
   does the JMM guarantee other threads see the constructed state.
5. **Verify with a hostile test.** Mutate the constructor argument after construction;
   attempt to mutate what each accessor returns. Both must leave the object unchanged.

## Rules

- A record is not immutable because it is a record. A List, Map or array component makes
  it shallowly immutable; the compact constructor must copy.
- Never ship a record with an array component and generated `equals`/`hashCode` — arrays
  compare by identity, so two records with equal contents are not equal. Copy in and out
  and override both, or use a `List` instead.
- Store with `List.copyOf`, not `Collections.unmodifiableList`: the latter is a view and
  the backing list can still change under it. `copyOf` is idempotent, and given an
  already-unmodifiable list it generally skips the copy, so re-copying is close to free.
- Evolve immutable state with hand-written `withX` methods that return a new instance.
  Java has no wither syntax and records have no generated `with` — do not claim or wait
  for one.
- Do not assert or deny an allocation cost without a measurement. Escape analysis may
  eliminate an allocation; it never guarantees it.

## References

- [Records and defensive copies](references/records-and-copies.md) — read when writing or
  reviewing a record, a constructor/accessor pair, or a wither; includes the worked
  example and the false positives (builders, cached derived fields).
- [Safe publication and the JMM](references/safe-publication.md) — read when the object
  crosses threads, when a field cannot be final, or when reviewing lazy caching of a
  derived value.
- [Costs and when not to apply](references/costs-and-when-not.md) — read before making an
  existing mutable class immutable, and whenever performance is the argument for or
  against immutability.
