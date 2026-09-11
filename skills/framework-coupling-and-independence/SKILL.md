---
name: framework-coupling-and-independence
description: >
  Deciding how much of a system may depend on its framework, and pricing that dependency
  honestly: which couplings are cheap and correct, which are expensive and reversible, which
  require staged redesign, and what "framework-independent" actually costs in mapping code. Use when
  a framework or major version upgrade is being planned or has stalled, when a domain class
  carries persistence or serialisation annotations, when someone proposes a framework-free
  domain and the price is not stated, when a base class from the framework appears in business
  code, or when a framework's programming model is spreading beyond the adapters. Does not
  cover which patterns a framework already implements (patterns-and-modern-frameworks), layer
  dependency direction (layering-and-boundaries), the data-access pattern behind the
  one-model/two-model choice (data-source-patterns), the mapping itself
  (orm-structural-mapping), releasable component boundaries
  (component-and-release-boundaries), or testing strategy (architecture-testing).
---

# Framework Coupling and Independence

## Purpose

Decide deliberately which parts of a system are allowed to know about the framework, and pay
attention to asymmetric incentives: your system may depend on the framework for years, while the
project promises only its documented compatibility and support policy. Maintainers can change
programming models, rename packages, deprecate abstractions and end support on their release cycle.

That asymmetry is an argument for placing the coupling deliberately — **not** an argument for
avoiding frameworks or for wrapping every one of them. A codebase with an abstraction layer
over Spring may duplicate its API without hiding the lifecycle or behavioral contracts that
make replacement expensive. A small application-owned port can still isolate a useful boundary.

The two failures this exists to prevent: the framework's programming model soaked into the
business rules, so an upgrade is a rewrite and a rule cannot be read without knowing the
container; and the defensive over-abstraction that buys portability nobody will use, at the
price of a mapping layer everybody pays for on every change.

## Workflow

1. **Establish the target and locate coupling.** Reuse the requested outcome, accepted boundary
   policy and representative consumer code. Inspect the project's language/toolchain, resolved
   framework/provider versions, runtime/configuration and tests. Import graphs find static dependencies;
   also inspect reflective wiring, callbacks, generated code and behavioral contracts. Do not
   treat absent imports as proof of independence or assume permission to upgrade dependencies.
2. **Classify each coupling by exit cost** — not by whether it is "clean". The question is
   what a migration would cost, and whether that cost is proportional to the code's size or
   to the framework's reach into it.
3. **Decide what the framework may implement.** Usually transport, wiring, transactions,
   serialisation, security plumbing and scheduling. Application requirements still define
   atomicity, authorization, delivery and lifecycle semantics; infrastructure placement alone
   does not make those couplings cheap.
4. **Decide what it may not own.** The rules that would still be true if the system were a
   batch job. Identify which framework requirements actually constrain those rules.
5. **Price the isolation before buying it.** Every boundary carries maintenance. Some need
   mapping and a second model; others only a narrow port. Compare concrete migration, testing
   and contract benefits against that recurring cost.
6. **Verify the decision.** Reuse the project's dependency/build checks for static boundaries;
   ArchUnit is one Java option. Use focused runtime tests for proxy, transaction, serialization
   or lifecycle semantics (`architecture-testing`).
   State missing evidence and a discriminating check instead of guessing exit cost.

## The coupling ladder

Use this ladder as an initial hypothesis, then adjust for the actual semantics and surface:

```text
CHEAP — usually mechanical, with cost proportional to occurrences
  Constructor injection, @Component/@Service on a class you own.
  The design may remain plain Java, but annotated classes still require
  the annotation dependency to compile and framework scanning to wire.

MODERATE — replaceable per call site, tediously
  @Transactional, @Scheduled, @Cacheable, @RestController mappings.
  Declarative behaviour attached to your methods. Syntax may be easy to move,
  but behavior can require redesign, and semantics differ between frameworks
  (enterprise-transactions).

EXPENSIVE — the model leaks into your types
  JPA @Entity with lifecycle callbacks, Jackson annotations on domain
  types, framework base classes, framework-managed identity, lazy-loading
  proxies escaping into business code (orm-structural-mapping).

SYSTEMIC — the framework shaped architecture and cross-layer contracts
  The concurrency model (servlet vs reactive), the threading model, the
  data-access paradigm, the module system. Often a staged redesign rather
  than a search-and-replace; migration seams may still be possible
  (reactive-and-virtual-thread-selection).
```

**Manage semantic reach and verified exit cost, not import count.** Reactive signatures can be
an intentional contract; annotations can hide pervasive behavior. Neither proves design quality.

## Decision rules

```text
The coupling is wiring, transport, config or scheduling
        → prefer its implementation; add a boundary only for a concrete application
          contract, failure policy or testing need, not a duplicate framework API.

The coupling is a declarative behaviour on your own class (@Transactional,
@Cacheable)
        → usually place use-case behavior at the application-service layer.
          Verify the actual interception and boundary semantics, because
          self-invocation bypasses advice in default proxy mode; AspectJ
          weaving and explicit proxy calls differ (service-layer-design).

A framework annotation would go on a type that encodes business rules
        → decide explicitly, and record why. This is the boundary where
          metadata, hydration and callbacks can constrain the model; price the
          actual constraints and isolation cost (orm-structural-mapping).

A framework BASE CLASS would be extended by business code
        → prefer composition when the inherited lifecycle is unnecessary.
          Inspect protected contracts and callers; migrate subclasses behind
          a seam where possible rather than assuming an all-at-once rewrite
          (java-composition-over-inheritance).

The framework's model would change your method signatures across layers
(reactive types, framework-specific futures)
        → record a systemic commitment and its driver. Price staged seams and
          cancellation, context and blocking semantics; do not assume it is irreversible.

Someone proposes wrapping the framework "to stay independent"
        → identify the migration scenario or present contract/testing benefit
          and recurring mapping cost. Use evidence-backed likelihood when available;
          otherwise keep uncertainty qualitative. A narrow port need not depend on
          whole-framework replacement being likely (enterprise-architecture-smells).

The dependency is on a small library rather than a framework
        → use an adapter when it owns external failure/protocol semantics,
          replacement is plausible, or its API must not cross your boundary.
          Do not wrap stable value APIs mechanically.

The framework's abstraction already IS the port you were going to write
        → use it when its contract fits the permitted boundary. Spring types remain
          Spring dependencies. Cache synchronization scope, TTL and negative caching
          depend on provider/version/configuration; sync=true delegates coordination
          and is neither universally per-JVM nor proof of cross-node singleflight.
          Validate the required semantics (caching-strategies).
```

## Rules

- **Assess the commitment's actual horizon and reach.** A pervasive framework can constrain
  upgrade cadence, skills and library choice. Price the affected consumers and lifecycle;
  record consequential commitments using the project's decision practice
  (`architecture-decision-making`).
- Coupling to a framework is not a defect. It is a purchase: you get wiring, transactions,
  serialisation, security and an ecosystem. The defect is paying that price and _also_
  spreading it into code that gains nothing from it.
- **"Framework-independent" is not free, and the price is paid on every change.** A separate
  domain model means a mapper, a second set of types, and two places to add a field. It is
  often worth it for complex long-lived rules or independently owned schemas/contracts.
  A simple CRUD service often needs no separate persistence model, but complexity alone does
  not decide the boundary (`domain-logic-organization`).
- The honest test for a domain type is not "does it import Spring" but **"could its rules be
  read, and directly tested without starting a container?"** Annotation/API classes may still
  be needed to compile or reflect over the type. Plain tests do not verify framework-invoked
  callbacks, advice or hydration; test those contracts separately.
- A framework upgrade becomes coordinated when a shared parent/platform pins one version and policy
  requires all consumers to move together. Independently versioned services can roll through a
  compatibility window; inventory and support deadlines determine the real coupling
  (`component-and-release-boundaries`).
- Prefer the smallest abstraction that preserves the required contract at the permitted boundary.
  `javax.sql.DataSource` may serve ordinary JDBC consumers; a driver-specific capability may remain
  inside its adapter. A neutral cache or JDK API is useful only if its lifecycle, failure and
  provider semantics fit; neither a forwarding wrapper nor lost capability buys independence.
- **Upgrade at a governed cadence.** The dominant cost of framework coupling is often not migrating between
  frameworks — almost nobody does — it is falling behind within one, until the jump crosses
  several breaking changes at once and lands outside the support window. Balance smaller deltas
  against change frequency, validation cost and support policy; “latest” is not itself a control.
- Keep ordinary rule tests independent of container startup when practical; retain focused
  integration tests for framework behavior. A container-based test alone does not establish
  that the tested rule requires the container.
- **Do not claim portability an interface does not provide.** A port can still encapsulate
  failure policy, application vocabulary or a testing seam with one implementation. Remove
  forwarding-only indirection only after checking callers and lifecycle/behavioral contracts.
- Vendor lock-in and framework lock-in are different risks with different remedies. A cloud
  SDK adapter may bound external contracts; a wrapper duplicating an entire framework usually
  adds substantial maintenance. Evaluate the actual surface in either case.

## Output

Give a scoped coupling inventory with code/configuration evidence, accepted placement, the
specific change or migration scenario and its uncertain costs. Recommend retain, isolate or
stage migration with a representative validation and remaining gaps. A small decision needs
only a short rationale; no numeric exit-cost estimate without supporting evidence.

## References

- [Where the framework may appear](references/framework-in-the-code.md) — the concrete
  placement decisions in a Spring and JPA codebase: annotations on domain types, entity versus
  domain model, the base-class and lifecycle-callback traps, serialisation annotations, and the
  ArchUnit rules that hold each decision in place. Read when deciding what an existing or new
  class may import.
- [Betting on a framework](references/betting-on-a-framework.md) — evaluating a framework
  commitment before making it: what the asymmetric marriage actually costs, the questions that
  predict upgrade pain, what real migrations turned out to be expensive (namespace changes,
  removed test annotations, concurrency-model shifts), and deciding whether to isolate,
  upgrade or stay. Read when choosing a framework, planning a major upgrade, or arguing about
  an abstraction layer.
