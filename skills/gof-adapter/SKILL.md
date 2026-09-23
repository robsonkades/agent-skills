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

Start with representative consumer calls and the accepted boundary goal: ordinary use, required
advanced capabilities and misuse/failure behavior. Inspect the actual adaptee and existing tests;
do not erase a required capability merely to make the port vendor-neutral. Reuse project evidence,
and ask only for a missing contract detail that could change the mapping or choice. A direct call,
existing integration or small method reference may already satisfy the need.

## When it is the answer

```text
A third-party or legacy type does the work and its interface is not
yours to change
        → Adapter when the consumer needs a different contract;
          ownership alone does not require a wrapper.

Two libraries must interoperate and neither knows the other
        → Adapter, owned by the code that composes them, not by either.

Your own port defines what the application needs; several
implementations exist behind it
        → Adapter where an implementation bridges an existing different API.
          Implementing the port directly need not adapt another object.

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
- **It contains business rules.** Move provider-independent domain policy inward. Protocol
  defaults and representation validation may belong in the adapter when the provider contract
  establishes their meaning; do not invent a business fact to fill missing data.
- **Its purpose is simplifying a subsystem behind a coarse call.** Consider Facade
  (`gof-facade`); collaborator count alone does not classify a wrapper or exclude adaptation.
- **It adds behaviour while keeping the same interface.** That is a Decorator
  (`gof-decorator`).

## Modern Java expression

Examples use Java 17 language features; inspect target compiler/runtime, actual SDK/API versions
and compatibility obligations before implementation. No pattern choice authorizes an upgrade.

```text
Single-method interface mismatch    a lambda or method reference:
                                      Runnable r = task::execute;
                                      Comparator<Order> c = comparing(Order::total);

Interface gained a method a legacy  a default method on the interface,
implementor cannot supply           implemented in terms of the others

Data model mismatch                 a record per boundary type, plus a
                                    mapper when model isolation is required;
                                    preserve intentional shared types and
                                    semantics (remote-facade-and-dto)

Foreign exception hierarchy         translate to your failure contract
                                    when isolation requires it; preserve causes
                                    (java-exception-design)

Whole-implementation mismatch       an object adapter: a final class
                                    holding the adaptee in a field
```

Class adapters — `extends Adaptee implements Target` — spend Java's single inheritance slot and
expose inherited public API, so composition is usually easier to isolate and replace. Inheritance
remains useful when a framework requires subclass hooks or the adaptee cannot be delegated
without losing protected extension behavior. Treat that as tighter coupling, not as impossible.
An interface default is suitable only when existing operations can satisfy the new method's
contract for all affected implementations; inspect inherited-default conflicts and behavioral
compatibility rather than inventing a no-op to make compilation pass.

## Decision rules

```text
IF a vendor type, exception or enum appears above a domain-facing adapter
THEN decide whether consumers now depend on vendor semantics. Translate when the
     port is meant to protect that boundary; shared standards or deliberately thin
     interoperability layers may preserve types explicitly.

IF a domain-facing port promises failure isolation but exposes the adaptee's exception type
THEN translate to the promised failure contract while preserving diagnostic cause; consumers
     must not need vendor-specific catches or inspect vendor causes for normal policy. Expose
     needed distinctions as domain failure types or typed fields. Thin interoperability
     contracts may differ explicitly.

IF the adapter interprets, defaults or decides
THEN distinguish provider-specific protocol interpretation from domain policy. Keep required
     translation/validation here; move business decisions that remain after provider replacement inward.

IF the target is a functional interface and the method signatures/checked failures are compatible
THEN a lambda or method reference may suffice, regardless of how many methods the adaptee has.
     Prefer a named class when lifecycle, state, substantial mapping or diagnostics warrant it.

IF the port has exactly one implementation and no second is planned,
and the implementation is your own code
THEN check dependency direction, test isolation, release boundaries and migration needs before
     calling the port speculative. Implementation count alone is not a deletion criterion.

IF the adaptee is not thread-safe
THEN wrapping alone adds no guarantee. State confinement, per-call ownership or synchronization
     covering all accesses, including aliases outside the adapter; otherwise retain the restriction.

IF the adaptee is remote
THEN its contract must expose or document latency and partial failure. Transport
     timeouts belong near the client; end-to-end deadlines, retry and fallback policy
     may belong to the caller or resilience layer (gof-proxy, timeouts-and-deadlines).
```

## Cross-cutting checks

- **Concurrency.** A stateless adapter is shareable only if its dependencies/protocol permit it. It does not confer thread
  safety on the adaptee: wrapping a non-thread-safe client in a "service" changes nothing. If
  the adapter adds state — a cache, a connection, a cursor — it now owns a concurrency
  contract and must document or enforce it.
- **Distribution.** Adapters are where a remote dependency's failure vocabulary is turned into
  yours, and where its schema compatibility is checked. Transport timeout ownership may be in
  injected client configuration; the caller can supply an end-to-end deadline. Unknown enum or
  field values from a newer peer must be handled deliberately rather than throwing deep inside
  the domain (`rpc-and-api-contracts`).
- **Lifecycle.** Define whether the client, response stream or cursor is borrowed or owned, who
  closes it and how cancellation/interruption propagates. Do not close an injected shared client
  per call or turn an interrupted wait into an ordinary retryable provider failure.
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
- [ ] Failure mapping honors the port's isolation contract and preserves diagnostic causes
- [ ] The adapter contains no decisions that belong to the domain
- [ ] Composition is preferred; inheritance has a documented framework/extension constraint
- [ ] A functional-interface adaptation uses the smallest form that preserves its contract/lifecycle
- [ ] Remote transport timeouts are configured and end-to-end resilience ownership is explicit
- [ ] The adapter is covered by authoritative integration/contract evidence at an appropriate cadence
- [ ] A passthrough has an evidenced boundary, lifecycle or compatibility responsibility, or is removed safely

For a design or review, give the consumer contract, the mismatch being resolved (or why no adapter
is needed), the chosen form and its tradeoff, and the relevant contract checks. For implementation,
also report what changed and what actually ran; missing provider evidence remains unverified.

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — object versus class
  adapters, Adapter set against Facade, Decorator, Proxy and the anti-corruption layer, the
  error-translation rules, how to tell a translator with business rules from a mechanical
  adapter, and how to remove a passthrough safely. Read when classifying or deleting a wrapper.
- [Worked example](references/worked-example.md) — a vendor payment SDK adapted to a domain
  port: model translation, exception translation, timeout ownership, unknown-status handling
  from a newer API version, and the test split between a fake for the application and a
  contract test for the adapter. Read when implementing.
