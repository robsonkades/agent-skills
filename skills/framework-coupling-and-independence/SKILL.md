---
name: framework-coupling-and-independence
description: >
  Deciding how much of a system may depend on its framework, and pricing that dependency
  honestly: which couplings are cheap and correct, which are expensive and reversible, which
  are irreversible, and what "framework-independent" actually costs in mapping code. Use when
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
over Spring has taken on the maintenance of a worse Spring, and still cannot change framework.

The two failures this exists to prevent: the framework's programming model soaked into the
business rules, so an upgrade is a rewrite and a rule cannot be read without knowing the
container; and the defensive over-abstraction that buys portability nobody will use, at the
price of a mapping layer everybody pays for on every change.

## Workflow

1. **Locate the coupling.** Which packages import the framework? A dependency graph answers
   this in minutes and usually surprises the team.
2. **Classify each coupling by exit cost** — not by whether it is "clean". The question is
   what a migration would cost, and whether that cost is proportional to the code's size or
   to the framework's reach into it.
3. **Decide what the framework may own outright.** Almost always: transport, wiring,
   configuration, transactions, serialisation, security plumbing, scheduling. Coupling here is
   correct and cheap.
4. **Decide what it may not own.** The rules that would still be true if the system were a
   batch job. Coupling here is what turns an upgrade into a rewrite.
5. **Price the isolation before buying it.** Every boundary that keeps the framework out costs
   mapping code and a second model, on every change, forever. Compare that against the
   probability and cost of the migration it insures against.
6. **Enforce whatever you decided.** An ArchUnit rule takes an hour and holds; a convention in
   a wiki does not (`architecture-testing`).

## The coupling ladder

Not all framework dependencies are equal. Ordered by what a migration would cost:

```text
CHEAP — usually mechanical, with cost proportional to occurrences
  Constructor injection, @Component/@Service on a class you own.
  The design may remain plain Java, but annotated classes still require
  the annotation dependency to compile and framework scanning to wire.

MODERATE — replaceable per call site, tediously
  @Transactional, @Scheduled, @Cacheable, @RestController mappings.
  Declarative behaviour attached to your methods. Mechanical to move,
  but there are many, and semantics differ between frameworks
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

**The ladder, not the presence of an import, is the thing to manage.** A codebase with
thousands of cheap couplings and none of the expensive ones is in excellent shape. One with a
"pure" domain and a reactive programming model spread through every signature is not.

## Decision rules

```text
The coupling is wiring, transport, config or scheduling
        → let the framework own it outright. Wrapping it is pure cost;
          this is what the framework is for.

The coupling is a declarative behaviour on your own class (@Transactional,
@Cacheable)
        → accept it, at the application-service layer. Do not build an
          abstraction over it; do understand its proxy semantics, because
          self-invocation bypasses advice in default proxy mode; AspectJ
          weaving and explicit proxy calls differ (service-layer-design).

A framework annotation would go on a type that encodes business rules
        → decide explicitly, and record why. This is the boundary where
          "convenient now" becomes "rewrite later", and where the cost of
          isolation is also real (orm-structural-mapping).

A framework BASE CLASS would be extended by business code
        → refuse. Inheritance spends the one extends slot, imports the
          lifecycle, and cannot be undone incrementally
          (java-composition-over-inheritance).

The framework's model would change your method signatures across layers
(reactive types, framework-specific futures)
        → this is the irreversible rung. It is a legitimate choice, made
          once, with a stated driver — never something to drift into.

Someone proposes wrapping the framework "to stay independent"
        → require the migration scenario it insures against, its
          probability, and the mapping cost per change. Usually the
          insurance costs more than the risk (enterprise-architecture-smells).

The dependency is on a small library rather than a framework
        → use an adapter when it owns external failure/protocol semantics,
          replacement is plausible, or its API must not cross your boundary.
          Do not wrap stable value APIs mechanically.

The framework's abstraction already IS the port you were going to write
        → use it. Spring's Cache, Resource and transaction abstractions are
          neutral as WIRING (patterns-and-modern-frameworks) — but neutral
          wiring is not neutral semantics. @Cacheable over a shared Redis
          gives no cross-node get-or-compute (sync = true is per-JVM), no
          TTL jitter and no negative caching, so it stampedes on eviction
          (caching-strategies).
```

## Rules

- **The commitment is asymmetric and long-lived.** A framework choice outlives most of the
  people who make it, sets the upgrade cadence, and constrains hiring and library choice.
  Treat it as one of the few genuinely expensive-to-reverse decisions
  (`architecture-decision-making`).
- Coupling to a framework is not a defect. It is a purchase: you get wiring, transactions,
  serialisation, security and an ecosystem. The defect is paying that price and _also_
  spreading it into code that gains nothing from it.
- **"Framework-independent" is not free, and the price is paid on every change.** A separate
  domain model means a mapper, a second set of types, and two places to add a field. It is
  worth it when the domain is complex and long-lived; it is waste on a CRUD service, where
  the entity is the model (`domain-logic-organization`).
- The honest test for a domain type is not "does it import Spring" but **"could its rules be
  read, and its tests run, with the container off the classpath?"** Annotations that only
  carry metadata frequently pass this test; a lifecycle callback containing a business rule
  does not.
- A framework upgrade becomes coordinated when a shared parent/platform pins one version and policy
  requires all consumers to move together. Independently versioned services can roll through a
  compatibility window; inventory and support deadlines determine the real coupling
  (`component-and-release-boundaries`).
- Prefer the framework's neutral abstraction to a hand-rolled one, and a hand-rolled one to a
  vendor-specific API. `javax.sql.DataSource` over a driver class; the caching abstraction over
  a client SDK; a JDK type over a framework type in a signature you own.
- **Upgrade at a governed cadence.** The dominant cost of framework coupling is often not migrating between
  frameworks — almost nobody does — it is falling behind within one, until the jump crosses
  several breaking changes at once and lands outside the support window. Balance smaller deltas
  against change frequency, validation cost and support policy; “latest” is not itself a control.
- Keep the framework out of the build's fast tests. If the domain's tests need a container to
  start, the coupling has already crossed the line the ladder describes, whatever the package
  structure says.
- **Do not abstract what you cannot replace.** An interface over a framework whose model has
  already shaped your signatures provides no exit; it only adds a hop. Delete it or accept the
  coupling honestly.
- Vendor lock-in and framework lock-in are different risks with different remedies. A cloud
  SDK behind an adapter is cheap insurance with a small surface; a framework behind an adapter
  is a second framework.

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
