---
name: repository-pattern
description: >
  The repository as a collection-like boundary over aggregates: what belongs behind it, why
  there is one per aggregate root and not one per table, where queries and read models sit
  instead, and when a repository is genuinely just a CRUD wrapper that should be deleted.
  Use when a repository is being added for a child entity, when a generic or base repository
  is proposed, when repository methods carry business verbs (cancelExpired,
  activateEligible), when a managed entity escapes through the repository interface, when
  reads and writes both go through the same interface and reads are slow, when a repository
  interface wraps a Spring Data interface that wraps the ORM, or when someone argues that
  Spring Data repositories make the pattern unnecessary. Does not cover query composition
  (query-objects-and-specifications), ORM runtime behaviour (orm-behavioral-patterns), which
  data-access pattern underlies it (data-source-patterns), or aggregate design itself
  (domain-logic-organization).
---

# Repository Pattern

## Purpose

Keep one boundary between the domain and the storage, shaped like a collection of
aggregates, so that the domain speaks about objects it owns and nothing above the boundary
speaks SQL. And — equally important — recognise the many cases where that boundary adds
nothing and should not exist.

The two failures are the layered nothing (`Service` → `Repository` → `BaseRepository` →
`GenericDao` → ORM, with no layer adding behaviour) and the leaky everything (a repository
returning managed entities, exposing `Pageable`, `Specification` and `EntityManager`, so the
persistence technology is present everywhere it was supposed to be absent).

## What a repository is, and is not

```text
IS:     a collection-like interface over ONE aggregate root
            add / remove / find by identity / find by domain criteria
        expressed in domain types
        owned by the domain, implemented in the adapter
        the transaction's participant, never its demarcator

IS NOT: a per-table data access object
        a home for business operations
        a query API for reporting and screens
        a portability layer over the database
```

## Workflow

1. **Identify the aggregate roots.** One repository per root. If a candidate is not a root,
   it is reached through one (`domain-logic-organization`).
2. **Write the interface in the domain's language**, in domain types: `Orders.byId`,
   `Orders.overdueFor(customer)`, `Orders.save`. Not `OrderJpaRepository` with
   `findAllByStatusIn`.
3. **Separate the read side.** Screens and reports get query objects or projections, not the
   repository (`query-objects-and-specifications`). This single decision removes most of the
   pressure that bloats repositories.
4. **Decide what crosses the boundary.** Domain aggregates out; identifiers and domain
   values in. A managed entity crossing outward re-couples every caller to the persistence
   context.
5. **Check each method for a business verb.** `cancelExpired()` is a use case that happens
   to need data, not a repository method.
6. **Ask whether the boundary earns its cost in this module.** For a CRUD module with no
   aggregate and no invariant, a Spring Data interface used directly is the honest design.

## Decision rules

```text
An aggregate root with invariants, loaded and saved as a whole
        → one repository, domain-typed interface, implementation in the
          adapter. This is the pattern doing its job.

A child entity inside an aggregate
        → no repository. It is reached through the root. A repository
          for it means the aggregate boundary is not real
          (orm-structural-mapping, dependent mapping).

Reads for a screen, a report, an export
        → not the repository. A query object or projection, possibly
          straight to the database.

A CRUD module: no invariants, entity ≈ table, no aggregate
        → use Spring Data (or a gateway) directly. Wrapping it in a
          hand-written interface adds a file and no behaviour.

A domain-owned interface with a single adapter implementation whose
methods are identical to Spring Data's
        → the wrapper is indirection unless it is doing something: type
          translation, hiding framework types, or narrowing the surface.
          Narrowing IS a real justification; identical signatures are not.

A "generic repository" with type parameters serving every entity
        → no. It can only offer operations common to all entities, so
          every aggregate gets the same CRUD surface and none gets the
          methods it actually needs.

Bulk or set-based work over the aggregate's table
        → a gateway with SQL, named as such, with its interaction with
          versioning and the persistence context handled explicitly
          (offline-concurrency-control).
```

## Rules

- **One repository per aggregate root.** A repository per table reproduces the schema in the
  domain layer and dissolves the aggregate boundary — which is the only thing the pattern
  was protecting.
- The interface belongs to the domain; the implementation belongs to the adapter. That is
  the inversion that makes the domain testable and the persistence replaceable, and it is
  the only structural reason to hand-write the interface (`layering-and-boundaries`).
- **A repository has no business verbs.** `orders.cancelExpired()` puts a rule in the data
  layer where it cannot be unit tested and where nobody will look for it. The use case loads
  and calls the aggregate.
- **Do not leak persistence types through the interface.** `Pageable`, `Specification`,
  `Sort`, `EntityManager`, `Page` in a domain-owned interface mean the domain now depends on
  Spring Data, and the abstraction is decorative.
- Do not leak **managed** entities either. Anything the caller mutates after the transaction
  ends is silently discarded; anything it holds keeps a lazy proxy that will fail later
  (`orm-behavioral-patterns`).
- Reads and writes have different requirements and may legitimately use different paths.
  Forcing every read through the aggregate repository is the leading cause of slow list
  screens (`architecture-and-performance`).
- `existsBy(...)` followed by `save(...)` is a race, not a check. Uniqueness is enforced by
  a constraint; the repository call only produces a better error message
  (`enterprise-transactions`).
- Repositories participate in transactions; they do not demarcate them. `@Transactional` on
  a repository method means a use case spanning two of them is two transactions
  (`service-layer-design`).
- **Spring Data does not make the pattern unnecessary; it makes the implementation free.**
  What remains a decision is the interface's shape, its ownership, and whether an aggregate
  boundary exists at all. `extends JpaRepository<Order, Long>` publishes ~20 methods
  including `deleteAll()` — that is a surface decision, not a default.
- Annotations such as `@Lock` and `@QueryHints` apply on the repository interface method.
  Placed on a hand-written implementation class they are silently ignored, and the resulting
  missing lock is invisible.
- A repository that only ever wraps and forwards should be deleted. Deleting it is a real
  improvement, not a compromise (`enterprise-architecture-smells`).

## References

- [Repository boundaries](references/repository-boundaries.md) — the domain-owned interface
  with its adapter implementation in Java, what the aggregate boundary means for the
  methods, reconstitution and detachment, read models beside the repository, and the
  narrowing that justifies a hand-written interface over Spring Data. Read when designing or
  reviewing a repository.
- [Repository misuse](references/repository-misuse.md) — the layered nothing, the generic
  repository, business verbs, child-entity repositories, leaked framework and managed types,
  and the check-then-act race; each with detection and the concrete fix, plus when a thin
  wrapper is nevertheless correct. Read when auditing an existing data layer.
