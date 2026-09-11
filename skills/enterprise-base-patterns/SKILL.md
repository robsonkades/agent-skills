---
name: enterprise-base-patterns
description: >
  The small structural patterns that hold an enterprise application together — Gateway,
  Mapper, Layer Supertype, Separated Interface, Registry, Special Case, Plugin and Service
  Stub — with the judgement about when each earns its place and when it is indirection. Use
  when an external system's API is being called directly from business code, when the same
  null check appears in twenty callers, when a base class is accumulating unrelated
  protected helpers, when a Registry or a static holder is being used to reach a
  collaborator, when an interface is needed on the caller's side of a dependency, when tests
  are slow because they call a real third-party sandbox, when a plugin mechanism is proposed
  for a variation that has one implementation, or when a mapper has started making
  decisions. Does not cover data-access specifics (data-source-patterns), the aggregate
  boundary abstraction (repository-pattern), overall layering (layering-and-boundaries), or
  detecting overuse in general (enterprise-architecture-smells).
---

# Enterprise Base Patterns

## Purpose

Name the small pieces that recur in every enterprise codebase, so they are chosen rather
than reinvented — and so the ones that are usually mistakes are recognised as such. Most of
these patterns are one class each. Their value is not complexity; it is that each one has a
known cost and a known failure mode.

## The patterns, in one line each

```text
Gateway              an object that encapsulates access to an external
                     system or resource, presenting it in your terms.

Mapper               an object that moves data between two subsystems
                     while keeping them ignorant of each other.

Layer Supertype      a common superclass for all types in a layer,
                     holding what genuinely all of them need.

Separated Interface  the interface is separate from its implementation,
                     owned by callers or an independent contract module.

Registry             a well-known object other objects use to find
                     common services; its access and lifetime need a scope.

Special Case         a type providing behaviour for a special case
                     (usually "absent"), so callers stop branching.

Plugin               links a class chosen at configuration time rather
                     than at compile time.

Service Stub         a stand-in for an external service, so tests do not
                     depend on it.
```

## Workflow

1. **Name the problem before the pattern.** Inspect representative callers, existing seams,
   ownership and compatibility requirements. Keep an adequate design; a small pattern can
   still change failure handling, wiring or resource ownership.
2. **For an external dependency, assess the needed seam.** Reuse a suitable port or client;
   add a Gateway when translation, policy or isolation earns the extra boundary.
3. **For a repeated null or default check, consider Special Case** — but only when the
   default behaviour is genuinely the same everywhere.
4. **For an interface with one implementation, identify the contract it protects:** inversion,
   testing, API narrowing or supported extension (`layering-and-boundaries`).
5. **Prefer direct injection for fixed collaborators.** Distinguish an ambient service locator
   from an explicitly injected, scoped registry whose responsibility is dynamic lookup.
6. **Match test doubles to the assertion.** Cover relevant success and failure outcomes across
   caller tests; test protocol translation at the actual adapter boundary.

For Java examples, inspect the target Java, Spring/Boot and persistence versions; do not
upgrade the project to fit them. References contain partial sketches with omitted domain types:
records are standard from Java 16, sealed types 17, pattern `switch` 21; RestClient requires Spring 6.1+
and its Java 17 baseline. For each proposed seam, name the dependency/variation it isolates,
the simpler alternative and a focused success/failure check. With missing evidence, keep the
choice conditional on a representative call path rather than inventing a pattern requirement.
Deliver the retained choice or focused change, a representative caller interaction, its
contract and simpler alternative, and checks performed versus still needed. Include a misuse
or failure path and state what missing requirement would change the choice; no pattern report
or new framework is needed for a local seam.

## Decision rules

```text
Business code calls a third-party SDK, an HTTP client, a filesystem or
a clock directly
        → Gateway when a domain-facing seam is needed. Reuse an injected
          Clock or suitable existing port rather than wrapping it again.
          Express external operations in your domain's terms, translate
          its errors, and let tests replace it.

Two subsystems must exchange data and neither should know the other
        → Mapper. If one is allowed to know the other, a direct
          translation is simpler than a mapper (enterprise-base-patterns
          exists to be skipped when it is not needed).

Every type in a layer genuinely needs the same thing (an id, an audit
stamp, an equality rule)
        → Layer Supertype, holding ONLY that. The moment it holds
          helpers used by three subclasses, it has become a junk drawer.

A high-level module needs an interface that a lower module implements
        → Separated Interface: keep callers independent of implementation;
          use caller ownership or an independent contract module as appropriate.

Code needs to find a collaborator and injection is available
        → inject it directly. If keyed discovery is the requirement,
          inject a scoped registry and define selection and lifetime ownership.

The same "if absent, do X" appears in many callers, and X is the same
everywhere
        → Special Case (a NullCustomer, an UnknownRate). If X differs by
          caller, keep Optional and let each caller decide.

Behaviour must be selected at deployment or supplied through a supported
external extension contract
        → consider Plugin. One bundled provider can serve a real SPI;
          an internal switch with no variation requirement may be unnecessary.

Behaviour varies per tenant in one running process
        → an explicit tenant-aware selector with isolation tests;
          startup property selection alone cannot implement this.

A test depends on a third-party service
        → Service Stub for isolated caller behavior; controlled adapter tests
          and authorized provider verification for their respective contracts
          (architecture-testing).
```

## Rules

- **A domain-facing Gateway translates the external model and failures.** Passing vendor
  types through retains that coupling; a narrower wrapper may still earn its place through
  policy or resource isolation. Name its actual contract rather than claiming full independence.
- Gateways can make business-relevant time, identity and storage controllable in tests.
  Reuse `Clock`, an id generator or a file-store boundary where needed; controlling these
  inputs does not establish determinism for other concurrent or external work (`architecture-testing`).
- **Layer Supertype fails by accretion.** It starts with an identifier and ends with twelve
  protected helpers, at which point every subclass depends on things it does not use.
  Review it whenever a method is added: does _every_ subtype need this?
- **Separated Interface controls dependency direction.** Caller-owned ports are one use;
  a framework-free contract module shared by independent consumers can also be appropriate.
  Verify imports and public compatibility; package placement alone does not establish the
  runtime wiring or the full ports-and-adapters contract
  (`layering-and-boundaries`).
- **Ambient Registry lookup hides dependencies.** An injected registry can make dynamic
  selection explicit; define key/tenant scope, missing entries, mutation and provider cleanup
  ownership. A concurrent map alone establishes neither those contracts nor test isolation.
- **Special Case removes branching only when the behaviour is uniform.** A `NullCustomer`
  whose `discountRate()` returns zero is excellent; one that callers keep testing with
  `instanceof` has made things worse than `Optional`.
- Special Case and `Optional` are not rivals. `Optional` at a boundary where the caller must
  decide; Special Case inside a model where the absent case has real, uniform behaviour.
  An unresolved lookup or transport failure is not established absence; preserve failure and
  authorization semantics rather than silently returning a guest/default object.
- **Plugin needs a concrete variation or extension contract.** A supported external SPI can
  justify one bundled provider. Compare selection, compatibility and lifecycle costs with
  direct construction; speculative internal switches can wait (`enterprise-architecture-smells`).
- A Service Stub exercises the **port's outcomes**, not every transport detail. A focused
  successful stub is useful for its test; a suite covering only success leaves failure behavior
  unverified. HTTP decoding and status translation need adapter tests (`architecture-testing`).
- **A Mapper must not invent business policy.** Parsing and faithful representation conversion
  belong at the boundary; eligibility, pricing and defaulting rules need an explicit domain or
  use-case owner (`domain-logic-organization`). Preserve currency, precision and invalid-input
  contracts while translating.

## References

- [Gateway and Mapper](references/gateway-and-mapper.md) — a gateway around an external
  system in Java with error translation, retry placement and the stub that mirrors it;
  gateways for time, identity and the filesystem; mapper placement and business-policy
  ownership; and the difference between a gateway and an adapter in the hexagonal
  sense. Read when integrating with anything outside the process.
- [Structural base patterns](references/structural-base-patterns.md) — Layer Supertype,
  Separated Interface, Registry, Special Case and Plugin, each with a worked example, the
  cost it imposes and the concrete condition that justifies it; plus Record Set and Value
  Object as they appear in modern Java. Read when introducing one of them, or when
  reviewing a base class, a registry or a plugin mechanism.
