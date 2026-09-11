---
name: repository-pattern
description: >
  The repository as a collection-like boundary over domain objects, with aggregate-root
  write boundaries in DDD: what belongs behind it, where queries and read models fit,
  and when a redundant CRUD wrapper can be removed without losing a useful contract.
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

Provide a collection-like boundary between domain objects and data mapping. Fowler's
Repository includes queries over domain objects; it does not universally require one DDD
aggregate root or prohibit read projections. This skill emphasizes DDD write repositories:
independent child writes must not bypass the root's invariants. Separate read gateways when
their query shape, cost or ownership warrants it, and remove abstractions only when their
contract and dependency boundary add no value.

The two failures are the layered nothing (`Service` → `Repository` → `BaseRepository` →
`GenericDao` → ORM, with no layer adding behaviour) and the leaky everything (a repository
leaking uncontrolled managed-state lifetimes or exposing `Pageable`, `Specification` and `EntityManager`, so the
persistence technology is present everywhere it was supposed to be absent).

## What a repository is, and is not

```text
IS:     a collection-like interface over domain objects
        typically one aggregate root for DDD write access
            add / remove / find by identity / find by domain criteria
        expressed in domain types
        for a domain-facing port: domain/application owned, adapter implemented
        a participant in the use case's transaction, possibly with local defaults

IS NOT: a per-table data access object
        a home for business operations
        a requirement that every reporting/screen query hydrate an aggregate
        an automatic guarantee of database portability
```

## Workflow

Inspect Java/toolchain, Spring Data/JPA/provider versions, transaction/proxy configuration
and the existing mapping model before recommending APIs. The examples are partial Java 17
source shapes with application types omitted, not a complete Spring project. Spring metadata
guidance was checked against Spring Data JPA 4.1.1 documentation. Adapt to the
project baseline without adding libraries or upgrading Java for the example. Return the
supported keep/change decision and its material evidence/limits. For a changed boundary,
include the affected write/read contract, object lifetime, transaction boundary and checks
needed to verify it. A narrow review can reuse adequate evidence without a full mapping or
database campaign.

1. **Identify aggregate consistency boundaries.** A repository is normally per aggregate root.
   Dedicated child/query gateways may exist for bulk operations or read models without granting
   independent domain mutation (`domain-logic-organization`).
2. **Establish the intended dependency contract.** For a framework-independent domain port,
   use domain language/types: `Orders.byId`, `Orders.overdueFor(customer)`, `Orders.save`.
   An intentionally framework-coupled application API can be valid; retain useful error,
   lifecycle or testing seams and document the coupling rather than assume independence.
3. **Choose the read path deliberately.** Screens and reports can use projections or query
   gateways when aggregate loading is unsuitable. Spring Data projection methods or a small
   shared interface can also be appropriate; separation is a design choice, not the definition
   of Repository (`query-objects-and-specifications`).
4. **Decide what crosses the boundary.** Domain aggregates out; identifiers and domain
   values in. Choose managed aggregates confined to the transactional use case or mapped
   independent domain objects; controllers/serialization should receive an explicit read DTO.
5. **Inspect business verbs for hidden policy.** `cancelExpired()` must not hide eligibility,
   transitions or event rules in persistence code. A domain-defined bulk operation may be
   delegated only when its invariant, concurrency and effect semantics are preserved.
6. **Ask whether the boundary earns its cost in this module.** For a CRUD module with no
   aggregate and no invariant, direct Spring Data is a candidate if no distinct boundary
   contract is needed.

## Decision rules

```text
An aggregate root with invariants and an explicit persistence contract
        → one repository, domain-typed interface, implementation in the
          adapter. This is the pattern doing its job.

A child entity inside an aggregate
        → mutations go through the root's consistency rules. Internal persistence
          gateways and read projections are valid; independently callable writes
          bypassing the root require redesign (orm-structural-mapping).

Reads for a screen, a report, an export
        → consider a query object/projection without aggregate hydration;
          the interface name alone does not decide correctness.

A CRUD module: no invariants, entity ≈ table, no aggregate
        → direct Spring Data (or a gateway) is a candidate when no distinct
          domain/application port, capability limit or policy boundary is needed.

A domain-owned interface with a single adapter implementation whose
methods are identical to Spring Data's
        → inspect the contract: capability narrowing, dependency ownership,
          stable testing/error/lifecycle seams or interception can justify it.
          Identical signatures alone neither justify nor invalidate the boundary.

A "generic repository" with type parameters serving every entity
        → reject a mandatory broad CRUD surface for unrelated aggregates.
          A narrow internal base for shared mechanics can coexist with
          domain-specific interfaces; judge the exposed capabilities.

Bulk or set-based work over the aggregate's table
        → an explicit bulk contract implemented with supported JPQL/Criteria,
          SQL or another suitable API. Preserve domain eligibility/effects,
          versioning and persistence-context semantics
          (offline-concurrency-control).
```

## Rules

- Prefer one domain repository per aggregate root. Per-table gateways are valid infrastructure for
  set-based/query work; the defect is exposing independent child mutation that bypasses aggregate
  invariants while calling it a domain repository.
- For a domain-facing port, the interface belongs to the domain/application abstraction and
  the implementation to the adapter. That is
  the inversion that makes the domain testable and the persistence replaceable, and it is
  a strong structural reason to hand-write the interface, alongside narrowing capabilities,
  domain-specific error semantics, testing seams and multiple adapters (`layering-and-boundaries`).
- Keep business policy in the domain/use case. `orders.cancelExpired()` deserves inspection
  for hidden eligibility, transition and event rules; the verb alone is not proof. A bulk
  adapter may execute a domain-defined operation only with equivalent invariant/concurrency
  and effect semantics explicitly established.
- **Honor the intended dependency boundary.** `Pageable`, `Specification`,
  `Sort`, `EntityManager`, `Page` in a domain-owned interface mean the domain now depends on
  persistence frameworks. They violate a framework-independent port contract; an explicitly
  accepted framework-coupled API has different trade-offs and may still provide a useful seam.
- Managed domain entities within a transactional use case are a valid JPA choice. Document
  dirty checking versus explicit save, detached results and lazy-access boundaries; transaction
  completion alone does not always end an extended persistence context. Map outward-facing
  DTOs before required lazy state becomes unavailable (`orm-behavioral-patterns`).
- Reads and writes have different requirements and may legitimately use different paths.
  Measure query counts, fetched rows/bytes and hydration before attributing slow screens to
  the repository structure (`architecture-and-performance`).
- `existsBy(...)` followed by `save(...)` can race unless a verified protocol serializes
  all relevant contenders across the complete check/write/commit boundary. Prefer a database
  constraint for database-owned uniqueness with the required normalization/null semantics;
  a precheck alone is advisory, and serialization/retry assumptions need evidence
  (`enterprise-transactions`).
- Repositories may provide local transaction defaults, but an outer application transaction usually
  joins/overrides them under `REQUIRED`. Without an outer boundary, two sequential repository calls
  can commit independently. Test the actual propagation and proxy path (`service-layer-design`).
- **Spring Data supplies common repository mechanics, not the whole design.**
  What remains a decision is the interface's shape, its ownership, and whether an aggregate
  boundary exists at all. `extends JpaRepository<Order, Long>` publishes a broad surface
  including `deleteAll()` — that is a surface decision, not a default.
- For Spring Data query/CRUD methods, configure `@Lock`/`@QueryHints` where its metadata
  machinery reads them. A custom fragment or direct EntityManager implementation must apply
  lock modes/hints explicitly or through a verified integration; an annotation alone does
  not change arbitrary Java code. Verify actual SQL and transaction scope.
- Remove forwarding layers only after checking capability narrowing, dependency ownership,
  transaction/authorization policy, error translation and test seams. An intentionally stable
  domain port can be valuable with one adapter and forwarding bodies (`enterprise-architecture-smells`).

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
