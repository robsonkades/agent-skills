---
name: gof-prototype
description: >
  Prototype in modern Java: producing a new object from an existing instance's state, when the
  configuration is expensive or the concrete type is unknown to the caller. Covers why
  Cloneable/clone() is a broken contract and what replaces it, the deep-versus-shallow decision
  on graphs with identity and cycles, why immutability removes the need to copy at all, the
  torn-copy hazard under concurrency, and the identity rules when copying persisted objects. Use
  when clone() or Cloneable appears, when an object is duplicated by serialising and
  deserialising it, when a configured template must be instantiated many times, when a JPA entity
  is copied with its id still set, or when a "copy" turns out to share a mutable list with its
  original. Does not cover constructing from parameters (gof-builder), selecting a type to create
  (gof-factory-method), sharing rather than copying (gof-flyweight), or snapshot semantics for
  undo (gof-memento).
---

# Prototype

## Purpose

Create a new object by copying a configured one. The pattern applies when the state that makes
an object useful was assembled at runtime and cannot be re-derived from parameters — a document
template, a pre-wired processing pipeline, a scenario fixture — or when the copier does not know
the concrete class it is duplicating.

In modern Java the pattern is often a warning. Immutable values usually can be shared, and
Java's built-in copying mechanism (`Cloneable`) has a weak contract. What survives should
normally use explicit copy constructors or copy factories; interoperability with a hierarchy
that already has a correct `clone()` contract is a constrained exception, not a reason to spread
that API.

## When it is the answer

```text
An object's configuration is assembled at runtime and duplicating it
is cheaper or more reliable than re-deriving it
        → Prototype, via a copy factory.

The set of things to instantiate is registered by name at runtime and
the registry does not know their classes
        → a registry of prototypes, each able to copy itself.

A mutable working object must be duplicated so two paths can diverge
(a scenario, a draft, a what-if calculation)
        → Prototype — and consider making the type immutable instead,
          which removes the need entirely.
```

## When it is not

- **The object is an immutable value and reference identity is irrelevant.** Share the instance.
  A distinct identity, lifecycle, ownership token, or native resource can still require a new
  object even when exposed state is immutable (`java-immutability`).
- **The state can be re-derived from parameters.** Then a factory or builder is clearer, and the
  new object does not inherit whatever the source accumulated.
- **The concrete type is known.** A copy constructor is more discoverable, type-safe and
  documentable than a polymorphic `copy()`.
- **Only a few fields differ from the original.** Hand-written or generated `withX` methods can
  express "the same but for X" directly; Java records do not generate withers themselves.
- **The object is an entity with identity.** A copy of an entity is a _different_ entity; see
  the identity rules below before duplicating anything with an id, a version or a lifecycle.

## Modern Java expression

```text
Do not                              Do
──────────────────────────────────  ─────────────────────────────────────
implements Cloneable                a copy constructor:
Object clone()                        Config(Config other)
                                    or a static copy factory:
                                      static Config copyOf(Config other)

deep copy via serialise/deserialise an explicit copy that names each
                                    field, so a new field is a compile
                                    error rather than a silent share

polymorphic clone() on a hierarchy  an abstract copy() returning the
                                    interface type, implemented per
                                    subtype — a covariant, documented
                                    contract you control

"copy then mutate two fields"       record + withX(), or a builder seeded
                                    from the original
```

`clone()`'s specific defects — `Cloneable` declares no `clone` method, the protected modifier
forces every subclass to cooperate, the default is a field-for-field shallow copy that bypasses
constructors so `final` fields cannot be reassigned, and no subclass can be trusted to have
implemented it correctly — are why every replacement above is preferred. Details in
[references/copying-in-java.md](references/copying-in-java.md).

## Decision rules

```text
IF the type is immutable
THEN do not copy. Share the reference.

IF the copy shares any mutable substructure with the original
THEN it is not a copy; it is an alias with two names. Decide, per field,
     whether sharing is intended, and write it down.

IF the graph contains cycles or object identity is meaningful
THEN a naive deep copy either loops forever or duplicates shared nodes.
     Use an identity map keyed by the original node, or refuse to copy.

IF the source can be mutated while it is being copied
THEN the copy can be internally inconsistent. Copy under the same lock
     the mutators use, or snapshot into an immutable value first.

IF the object has persistent identity (@Id, a version, a natural key)
THEN first name the operation: clone-as-new-entity resets generated identity,
     version and creation lifecycle; snapshot/copy-for-transfer may preserve identity.
     Never pass a copied detached entity to persist/merge without defining semantics.

IF copying is done by serialising and deserialising
THEN account for format-specific cost, graph/identity semantics, transient or ignored
     fields, constructors and compatibility. Native Java deserialization of untrusted
     bytes can enable gadget attacks; not every serialization format has that failure mode.

IF a new field is added to the type
THEN tests or construction structure must expose an omitted copy policy. A constructor
     call may fail to compile when its signature changes, but mutable classes and defaulted
     components can still omit fields silently; use semantic copy-contract tests.
```

## Cross-cutting checks

- **Concurrency.** Copying a mutable object is a multi-field read and is not atomic. Another
  thread mutating the source mid-copy yields a "copy" that never existed — fields from before
  and after the change. Either copy while holding whatever lock guards the source, or have the
  source expose an immutable snapshot and copy that. A `copy()` documented as thread-safe with
  no synchronisation is documentation, not safety (`java-memory-model`).
- **Distribution.** Copying a DTO is not copying the entity it represents; the copy shares no
  identity, no version and no server-side state. Where a prototype is transmitted, the receiving
  process reconstructs it from bytes — which is deserialisation, with its own trust boundary,
  not this pattern. Never build a prototype registry keyed by class names supplied by a remote
  peer.
- **Performance.** "Copying is faster than constructing" is an assumption, not a fact: a deep
  copy allocates the whole graph again and defeats escape analysis, while construction of a
  simple object is one of the cheapest things the JVM does. Justify a prototype by the
  _configuration_ being expensive to reproduce, not by allocation cost — and if the claim is
  about cost, measure it (`allocation-profiling`).
- **Testing.** A shared mutable prototype used as a test fixture is a cross-test dependency: one
  test mutating the copy's shared substructure changes another test's data. Prototype fixtures
  must be deep-copied, or be immutable, or be rebuilt per test.

## Review checklist

- [ ] New code prefers an explicit constructor/factory; any retained `clone()` contract is
      inherited, documented and tested across subtypes
- [ ] Every field is accounted for: copied, deliberately shared, or deliberately reset
- [ ] Adding a field is caught by construction structure, generated code, or copy-contract tests
- [ ] Mutable collections and arrays are copied, not aliased
- [ ] Identity, version, lifecycle and correlation fields follow an explicit
      clone-as-new versus snapshot/transfer policy
- [ ] Copying under concurrency is either locked or performed on an immutable snapshot
- [ ] No copy is implemented by serialisation round-trip
- [ ] The type is not simply immutable, in which case the copy should not exist

## References

- [Copying in Java](references/copying-in-java.md) — why `Cloneable` is broken in detail, copy
  constructors against copy factories against wither methods, the deep-versus-shallow decision
  table, cycles and identity maps, the serialisation round-trip's costs and security surface,
  and the rules for copying JPA entities. Read before implementing any copy.
- [Worked example](references/worked-example.md) — a registry of configured document templates
  instantiated per request: the `Cloneable` version and its two defects, the copy-factory
  version, identity reset when the copy is persisted, and the snapshot that makes copying safe
  under concurrency. Read when implementing.
