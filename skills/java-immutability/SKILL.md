---
name: java-immutability
description: >
  Immutable objects in modern Java: records in depth, defensive copies, immutable collection
  factories versus unmodifiable views, deep versus shallow immutability, final-field
  semantics and safe publication (JMM), and the withers pattern. Use when designing a value
  object, when a record has a List, Map or array component, when an accessor returns
  internal mutable state, when an "immutable" object is observed changing, or when deciding
  whether immutability is worth its allocation cost. Does not cover null validation in
  constructors (java-null-safety) or Optional usage (java-optional).
---

# Java Immutability

## Purpose

Make objects that cannot change after construction actually unable to change — and know
when not to bother. Two failure modes to prevent: the shallowly immutable object (final
fields, mutable contents) that changes under a caller who believed it could not; and
dogmatic immutability forced onto hot paths, entity frameworks and accumulators, where it
fights the tools without a measurement to justify it.

## Workflow

0. **Inspect the compatibility and ownership contract.** Check compiler release/toolchains,
   framework/binder versions, equality/hash behavior, null/order requirements and who can mutate
   each input. Examples use Java 17-compatible features: records and type-pattern `instanceof`
   need Java 16+ without preview, `copyOf` needs Java 10+, and `Stream.toList()` needs Java 16+.
   Keep the project baseline; use ordinary classes/private-copy wrappers on older targets.
   Reuse caller tests and lifecycle evidence; ask only when unresolved alias ownership or a
   public contract changes the decision. Keep an adequate immutable or confined mutable design.
1. **Classify every field or record component.** Primitive and known deeply immutable values are
   safe. Collections, arrays, legacy dates, buffers and custom types require proof of both
   container and element immutability; “no setters” is not proof.
2. **Close the inbound route.** Where aliases require isolation, copy in the constructor:
   `List.copyOf`, `Map.copyOf`, `Set.copyOf`, `clone()` for arrays. These are shallow copies;
   mutable elements/keys/values need an immutable representation, copying or proven ownership.
3. **Close the outbound route.** Accessors can return deeply immutable values directly.
   Owned mutable representations still need isolation on output: arrays, dates and buffers
   need defensive access even after an inbound copy. An unmodifiable container does not
   protect mutable elements. A read-only `ByteBuffer` still has mutable cursor state and
   may share writable backing bytes; isolate both, as described in the records reference.
4. **Check publication.** Prefer final stable state; justify derived caches separately and
   prevent premature `this` escape. Final-field
   initialization safety protects observed constructed state, but a happens-before publication
   mechanism is still preferable for reference visibility, lifecycle and later mutable state.
5. **Verify with a hostile test.** Mutate the constructor container and a nested mutable element
   after construction; attempt mutation through each accessor; publish across threads using the
   intended handoff. The documented state must remain unchanged and visible.

## Rules

- A record guarantees final component references, not immutable referents. A mutable input
  must be isolated by copying or a proven ownership transfer; already immutable values can be
  reused. Check the reachable state, not merely whether the component type is `List` or `Map`.
- Array components use identity equality by default. For content-value semantics, isolate
  mutable bytes and define matching content equality/hash behavior, or choose an immutable
  representation. Preserve intentional identity contracts; do not silently replace them.
  Copying arrays while retaining generated equality can also break the record reconstruction
  invariant — see the records reference.
- Prefer `List.copyOf` when its null contract fits. An unmodifiable wrapper around a privately
  owned copy is also a valid snapshot; a wrapper around aliased mutable backing is a live view
  requiring a documented concurrency/lifecycle protocol. `copyOf` remains shallow; never call
  re-copying “free” without measuring a material path.
- Expose only needed immutable transitions through constructors, copy factories or withers.
  An unchanged result may reuse an instance if identity permits. Java/records do not generate
  withers; project code generation is a separate, optional tool choice.
- Do not assert or deny an allocation cost without a measurement. Escape analysis may
  eliminate an allocation; it never guarantees it.
- State what immutability includes: object fields only, reachable graph, external resources, and
  cached/derived state. An immutable wrapper around a mutable entity/client/file is not deeply
  immutable merely because its reference is final.
- Copying is not an atomic snapshot of concurrently changing input. Require confinement,
  synchronization or a collection-specific snapshot contract before copying; final fields
  cannot repair a mixed or raced constructor read. Preserve null acceptance, iteration order
  and equality when replacing an API, or explicitly identify the contract change.

## Deliverable

Name the immutability boundary and remaining aliases, construction/access strategy and any
API behavior changed. Report mutation tests and the happens-before argument for the actual
handoff; a passing thread test alone does not prove JMM correctness. Keep allocation benefits
and framework round-trip safety conditional until measured or exercised. A review may conclude
no change when the required state and ownership contract already hold; otherwise distinguish a
demonstrated leak from a missing publication/binder guarantee and name the remaining check.

## References

- [Records and defensive copies](references/records-and-copies.md) — read when writing or
  reviewing a record, a constructor/accessor pair, a buffer component, or a wither; includes the worked
  example and the false positives (builders, cached derived fields).
- [Safe publication and the JMM](references/safe-publication.md) — read when the object
  crosses threads, when a field cannot be final, or when reviewing lazy caching of a
  derived value.
- [Costs and when not to apply](references/costs-and-when-not.md) — read before making an
  existing mutable class immutable, and whenever performance is the argument for or
  against immutability.
