---
name: layering-and-boundaries
description: >
  Deciding where an enterprise application's boundaries go and which direction dependencies
  cross them: the classical presentation / domain / data-source split, the styles that
  reorganise it (hexagonal, clean, modular monolith, vertical slices), and how a boundary is
  enforced rather than documented. Use when a package structure is argued about, when a
  controller contains business rules, when an entity or DTO travels end to end, when a
  service layer only forwards, when hexagonal is adopted without a driver, or when adding a
  field requires editing seven files. Does not cover which layer business rules take
  (domain-logic-organization), whether a boundary should be remote
  (distribution-boundaries), the data-access patterns (data-source-patterns), or what the
  application service around a use case owns (service-layer-design).
---

# Layering and Boundaries

## Purpose

Give each boundary in the system a reason to exist, a direction, and a mechanism that
enforces it. Layers are the oldest structuring idea in enterprise software and the most
routinely cargo-culted: teams inherit three packages and a naming convention without the
constraint that made them worth having, and pay the indirection cost with none of the
benefit.

The two failures this exists to prevent: layers that are documentation only, so the domain
imports the web framework and nobody notices for a year; and layers multiplied past their
value, so a field addition touches an entity, a mapper, a DTO, a request, a response, a
service interface and its single implementation.

## Workflow

1. **Find the boundaries that already exist**, including the informal ones: a package
   nobody outside touches, a class every feature edits, a schema owned by another team.
   These are the real structure; the diagram is aspiration.
2. **For each candidate boundary, name what varies across it.** A boundary earns its cost
   only if the two sides change for different reasons, at different times, or under
   different ownership. If both sides always change together, the boundary is overhead.
3. **Fix the dependency direction and write it down.** Direction is the whole substance of
   a layering decision; without it you have packages, not layers.
4. **Decide what crosses.** The type that crosses a boundary is part of the boundary's
   contract. A JPA entity crossing into the web layer couples the HTTP contract to the
   schema — usually the single most consequential leak in an enterprise codebase.
5. **Enforce mechanically.** ArchUnit rules, module boundaries, or compilation units. A
   boundary policed only by code review is a boundary with a half-life of about a year.
6. **Recheck the count.** Every layer you keep must have shown, in the last six months of
   history, a change that stopped at it. Layers with no such evidence are candidates for
   removal, not for defence.

## The classical split, stated as obligations

```text
Presentation      request/response shapes, protocol, formatting, validation of
                  input syntax, session and navigation. Knows the domain;
                  the domain does not know it.
        │
        ▼
Domain            business rules, invariants, workflow, calculations.
                  Should be readable without knowing whether the caller is
                  HTTP, a scheduled job or a message consumer.
        │
        ▼
Data source       persistence, external systems, transaction mechanics.
                  Knows the schema and the protocol; ideally does not know
                  the business rules that use it.
```

Two properties matter more than the diagram. **Downward-only dependency:** a lower layer
never names a higher one. **Skip rules are a decision, not an accident:** presentation
reaching data source directly is a legitimate, common choice for read paths, and a bad
accident when it happens to a write path (`query-objects-and-specifications`).

## Decision rules

```text
Two sides change for the same reason, at the same time, by the same team
        → not a boundary. Delete it and keep one module.

Two sides differ in what they are about (business rules vs SQL dialect)
        → a boundary, enforced by dependency direction. Cheapest and
          highest value: this is the classical layering split.

Two sides differ in ownership or release cadence
        → a boundary that must be enforced mechanically, because social
          enforcement fails exactly when the two teams are busiest.

A dependency must point upward (domain needs to notify, to fetch, to
schedule)
        → invert it: the domain declares the interface, the outer layer
          implements it. This is the one construct worth the indirection,
          and it is what "ports and adapters" means.

An interface exists with exactly one implementation, no inversion, and no
second implementor in prospect
        → not a boundary. It is indirection
          (enterprise-architecture-smells).

The boundary is between features rather than between technical concerns
        → consider vertical slices or modules; the layer packages will
          otherwise scatter each feature across three places.
```

## Rules

- A layer is defined by its dependency direction, not by its package name. `service`,
  `repository` and `controller` packages with imports flowing in both directions are a
  naming convention with layering vocabulary attached.
- The domain layer's test is blunt and worth applying literally: could this code compile
  and its tests run with the web framework and the ORM off the classpath? Where the answer
  is no, name the specific import and decide whether it is a leak or an accepted trade.
- Do not confuse **layers** (a dependency rule) with **tiers** (a deployment topology).
  Layering is a source-code decision, is nearly free, and is reversible. Tiers add a
  network, serialisation and partial failure, and are not (`distribution-boundaries`).
- The type that crosses a boundary is the contract. Decide deliberately whether it is the
  domain type, a dedicated representation, or a projection; each choice is defensible and
  the failure is choosing by default (`remote-facade-and-dto`).
- Layer count is a cost. Three layers with real constraints beat six with none. Every
  additional layer multiplies mapping code, obscures stack traces and lengthens the change
  path; it must buy something nameable.
- The read path and the write path are allowed to differ. Writes benefit from going
  through the domain to protect invariants; reads frequently do not, and forcing every
  query through an aggregate is a leading cause of N+1 and of over-fetching
  (`architecture-and-performance`).
- Hexagonal, clean and onion architectures are the same idea — dependencies point inward,
  outward dependencies are inverted through interfaces the inside owns — with different
  vocabularies and different amounts of ceremony. Choose one vocabulary and stop
  translating.
- Adopting one of those styles is a decision with drivers, not a default. The driver is
  usually "the domain must be testable and outlive this framework" or "we will replace
  this integration". Without such a driver you are buying mapping code.
- A boundary you cannot violate accidentally is worth more than a boundary described in a
  wiki. Prefer compiler and build-time enforcement; a failing ArchUnit test is the
  cheapest architecture governance available.

## References

- [Layering styles compared](references/layering-styles.md) — classical three-layer,
  hexagonal/ports-and-adapters, clean, modular monolith and vertical slices side by side:
  what each actually constrains, what it costs, the driver that justifies it, and where
  classical layering is still the right answer. Read when the style itself is the question,
  or when a team proposes adopting one.
- [Enforcing a boundary](references/boundary-enforcement.md) — package layout that makes
  violations visible, ArchUnit and JPMS enforcement with concrete rules, what may cross a
  boundary and in which direction, and the seven recurring leaks (entity in the web layer,
  framework annotations in the domain, transaction demarcation in the wrong place, and the
  rest). Read when designing the package structure or auditing an existing one.
