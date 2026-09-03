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

The measure of a boundary adapter is the coupling it intentionally contains. Domain-facing ports
usually should not expose vendor DTOs or exceptions; a thin interoperability adapter between two
libraries may deliberately retain shared standard types. State the boundary goal instead of
assuming every adapter is an anti-corruption layer.

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

- **You own both sides and can change them atomically.** Direct refactoring may be cheaper. An
  adapter can still be correct across independently released modules, during migration, or where
  two intentionally distinct models must remain separate.
- **The mapping is one-to-one with no translation or boundary policy.** A passthrough may be
  removable, but can still own version isolation, telemetry, authorization or replacement
  authority. Name and test that reason; otherwise delete it.
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

Class adapters — `extends Adaptee implements Target` — spend Java's single inheritance slot and
expose inherited public API, so composition is usually easier to isolate and replace. Inheritance
remains useful when a framework requires subclass hooks or the adaptee cannot be delegated
without losing protected extension behavior. Treat that as tighter coupling, not as impossible.

## Decision rules

```text
IF a vendor type, exception or enum appears above a domain-facing adapter
THEN decide whether consumers now depend on vendor semantics. Translate when the
     port is meant to protect that boundary; shared standards or deliberately thin
     interoperability layers may preserve types explicitly.

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
THEN its contract must expose or document latency and partial failure. Transport
     timeouts belong near the client; end-to-end deadlines, retry and fallback policy
     may belong to the caller or resilience layer (gof-proxy, timeouts-and-deadlines).
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
- **Performance.** Dispatch is often inlined and translation cost ranges from zero-copy views to
  full graph allocation. Inspect large collection copies, encoding conversions and eager
  traversal; translating a lazily loaded structure can turn one query into many
  (`orm-behavioral-patterns`). Measure the boundary rather than counting wrapper calls.
- **Testing.** The port is the seam that lets the application be tested without the dependency;
  the adapter itself needs tests against an authoritative implementation or compatible sandbox,
  because its content is assumptions about a foreign system. Where that cannot run on every
  commit, combine deterministic mapping tests with scheduled/provider contract tests
  (`java-test-doubles`, `java-testing-strategy`).

## Review checklist

- [ ] Any foreign type, exception or enum crossing outward is an explicit compatibility choice
- [ ] Adaptee exceptions are translated with the original preserved as the cause
- [ ] The adapter contains no decisions that belong to the domain
- [ ] Composition is preferred; inheritance has a documented framework/extension constraint
- [ ] A single-method adaptation is a lambda, not a class
- [ ] Remote transport timeouts are configured and end-to-end resilience ownership is explicit
- [ ] The adapter is covered by authoritative integration/contract evidence at an appropriate cadence
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
