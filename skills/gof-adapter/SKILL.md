---
name: gof-adapter
description: >
  Adapter in modern Java: making an existing type usable through an interface it was not
  written for, and keeping a foreign model, vocabulary and failure mode from leaking inward.
  Covers object versus class adapters, why a lambda already adapts a single-method
  interface, the error-translation duty most adapters omit, when an adapter has quietly
  become a translator with business rules in it, and when a passthrough should be deleted.
  Use when integrating a vendor SDK or legacy type behind your own port, when two libraries
  must interoperate, when an adapter is proposed between types you own, when foreign
  exceptions or DTOs appear in domain code, or when reviewing a wrapper that renames methods
  and does nothing else. Does not cover the Kubernetes telemetry sidecar
  (adapter-sidecar-pattern), simplifying a subsystem you own (gof-facade), adding behaviour
  to the same interface (gof-decorator), controlling access to an object (gof-proxy), or
  layering rules in general (layering-and-boundaries).
---

# Adapter

## Purpose

Let code depend on an interface it chose, while the object doing the work has a different one.
The adapter absorbs the mismatch — signature, model, vocabulary, error style — so that neither
side has to change and neither side learns about the other.

The measure of a good adapter is what it stops: after it, no vendor type, no vendor exception
and no vendor vocabulary appears above it. An adapter that forwards a vendor's `SdkException`
unchanged has moved the coupling, not removed it.

## When it is the answer

```text
A third-party or legacy type does the work and its interface is not
yours to change
        → Adapter. This is the default and by far the commonest case.

Two libraries must interoperate and neither knows the other
        → Adapter, owned by the code that composes them, not by either.

Your own port defines what the application needs; several
implementations exist behind it
        → Adapter per implementation (this is ports-and-adapters;
          the GoF pattern is the per-implementation half).

A test needs a fake implementation of an external dependency
        → the port exists for this too; the fake is not an adapter but
          it is enabled by the same seam.
```

## When it is not

- **You own both sides.** Change one of them. An adapter between two of your own types is a
  refactoring that was not finished.
- **The mapping is one-to-one with no translation.** A class whose every method is
  `return delegate.sameThing()` adds a stack frame and a file. Delete it and depend on the type
  directly, or admit the port exists for a different reason and say which.
- **It contains business rules.** Deciding, defaulting, validating against domain policy — that
  is domain logic in the boundary layer. Move it inward and leave translation behind.
- **It aggregates several collaborators into one coarse call.** That is a Facade
  (`gof-facade`), and the distinction matters because a Facade may sit above adapters but is
  not one.
- **It adds behaviour while keeping the same interface.** That is a Decorator
  (`gof-decorator`).

## Modern Java expression

```text
Single-method interface mismatch    a lambda or method reference:
                                      Runnable r = task::execute;
                                      Comparator<Order> c = comparing(Order::total);

Interface gained a method a legacy  a default method on the interface,
implementor cannot supply           implemented in terms of the others

Data model mismatch                 a record per boundary type, plus a
                                    mapper — never the vendor's type in
                                    the domain (remote-facade-and-dto)

Foreign exception hierarchy         translate at the adapter into your
                                    own, preserving the cause
                                    (java-exception-design)

Whole-implementation mismatch       an object adapter: a final class
                                    holding the adaptee in a field
```

Class adapters — `extends Adaptee implements Target` — are effectively dead in Java: single
inheritance spends the one extends slot, the adaptee's entire public API leaks through the
adapter, and the adaptee cannot be swapped or wrapped. Use an object adapter unless you are
adapting an interface you cannot instantiate.

## Decision rules

```text
IF a vendor type, vendor exception or vendor enum appears above the
adapter
THEN the adapter is incomplete. Translation is its whole job.

IF the adapter throws the adaptee's exception type
THEN callers must catch a foreign type, and swapping the adaptee is a
     breaking change. Translate, keeping the original as the cause.

IF the adapter interprets, defaults or decides
THEN that is domain logic. Move it in; keep the adapter mechanical.

IF the adapter's interface has one method and the adaptee's has one
method
THEN a lambda or method reference is the adapter. No class.

IF the port has exactly one implementation and no second is planned,
and the implementation is your own code
THEN the port is speculative indirection (gof-pattern-thinking).
     An external dependency is the exception: the seam has value even
     with one implementation, because it bounds the foreign model.

IF the adaptee is not thread-safe
THEN the adapter is not either, whatever it looks like. State the
     constraint or synchronise inside it deliberately.

IF the adaptee is remote
THEN the adapter's contract includes latency, timeouts and partial
     failure; it must not present them as ordinary method behaviour
     (gof-proxy, timeouts-and-deadlines).
```

## Cross-cutting checks

- **Concurrency.** An adapter is normally stateless and shareable. It does not confer thread
  safety on the adaptee: wrapping a non-thread-safe client in a "service" changes nothing. If
  the adapter adds state — a cache, a connection, a cursor — it now owns a concurrency
  contract and must document or enforce it.
- **Distribution.** Adapters are where a remote dependency's failure vocabulary is turned into
  yours, and where its schema version is pinned. Two duties are routinely missed: timeouts must
  be set in the adapter, since the port cannot express "may hang forever"; and unknown enum or
  field values from a newer peer must be handled deliberately rather than throwing deep inside
  the domain (`rpc-and-api-contracts`).
- **Performance.** One extra call and, where translation is involved, one extra object per
  call. Negligible except when the adapter copies a large collection on every invocation inside
  a loop — a common and measurable cost that is invisible in review because the copy looks like
  a mapping. Where the adaptee returns a lazily loaded structure, translating it eagerly can
  turn one query into many (`orm-behavioral-patterns`).
- **Testing.** The port is the seam that lets the application be tested without the dependency;
  the adapter itself must be tested against the real thing, because its whole content is
  assumptions about a foreign system. A unit test of an adapter with a mocked adaptee asserts
  that your mapping matches your mock — use a contract or integration test instead
  (`java-test-doubles`, `java-testing-strategy`).

## Review checklist

- [ ] No foreign type, exception or enum crosses the adapter outward
- [ ] Adaptee exceptions are translated with the original preserved as the cause
- [ ] The adapter contains no decisions that belong to the domain
- [ ] Composition, not inheritance, holds the adaptee
- [ ] A single-method adaptation is a lambda, not a class
- [ ] Timeouts and failure handling are set here when the adaptee is remote
- [ ] The adapter is covered by a test that exercises the real adaptee
- [ ] A one-to-one passthrough is justified by bounding a foreign model, or deleted

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — object versus class
  adapters, Adapter set against Facade, Decorator, Proxy and the anti-corruption layer, the
  error-translation rules, how to tell a translator with business rules from a mechanical
  adapter, and how to remove a passthrough safely. Read when classifying or deleting a wrapper.
- [Worked example](references/worked-example.md) — a vendor payment SDK adapted to a domain
  port: model translation, exception translation, timeout ownership, unknown-status handling
  from a newer API version, and the test split between a fake for the application and a
  contract test for the adapter. Read when implementing.
