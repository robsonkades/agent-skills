---
name: java-ddd-repositories
description: >-
  Implement or review Java DDD aggregate persistence when a Gateway loses identity,
  audit or child state, concurrent updates bypass an aggregate invariant, database
  errors become not-found results, or an in-memory fake hides missing saves. Preserve
  inward dependencies and the project's Gateway, JpaEntity and Repository naming.
  Owns reconstitution and aggregate persistence contracts; excludes aggregate
  boundary discovery, generic Repository selection and detailed ORM configuration.
---

# Java DDD Repositories

Preserve the aggregate's meaning across persistence: the same business identity,
complete owned state, concurrency token and failure semantics must survive a round
trip. In this project family, a domain `CategoryGateway` or `OrderGateway` may play
the DDD Repository role. A Spring Data `CategoryRepository` or `OrderJpaRepository`
is a separate infrastructure mechanism. Do not conclude that every Repository
belongs in infrastructure simply from that naming convention.

Use this skill for an accepted aggregate boundary and its persistence contract.
For whether a Repository abstraction earns its cost, optionally use
repository-pattern; for deciding the consistency boundary, use java-ddd-aggregates.
Simple screen/report queries can use projections without constructing aggregates.

## Discover the contract before changing it

Trace one real use case through the domain gateway, concrete adapter, mappings,
schema migrations and tests. Record the aggregate root and owned children, identity,
tenant scope if present, audit fields, version ownership, absence and failure
outcomes, transaction owner, and what the caller means by success. Inspect imports
and invocation paths; a package name does not establish isolation or atomicity.

Inspect compiler release/toolchains, resolved persistence provider and framework
versions, database engine/isolation, CI and existing test harness. Examples use Java
17-compatible syntax without preview features; they are partial source shapes, not
a runnable application. The reference project uses `javax.persistence`; another
project may use `jakarta.persistence`. Match the target rather than changing its
baseline, namespace, libraries or architecture to accommodate an example.

Distinguish explicit requirements from observed conventions and proposed changes.
The reference project's `CategoryGateway`, `CategoryMySQLGateway`,
`CategoryJpaEntity` and `CategoryRepository` are evidence of one layout. The service
foundation also permits `OrderGatewayImpl` and `OrderJpaRepository` under a gateway
subpackage. Preserve the target's established variant. Neither source proves its
concurrency policy is sufficient for a new business invariant.

If a consequential requirement is unknown, identify the missing evidence and keep
that decision conditional. Continue work supported by available code; do not invent
tenant isolation, legal retention, uniqueness or conflict retry rules.

## Implement one aggregate persistence slice

1. **Keep the port inward.** Domain-owned gateway signatures use aggregate roots,
   typed IDs, domain criteria and explicit outcomes. The application invokes this
   port; infrastructure implements it. Keep Spring Data, JPA entities, lazy proxies,
   `Pageable` and database exceptions out of that inward contract. Reuse an adequate
   port instead of creating another CRUD wrapper.
2. **Specify write and read semantics.** Preserve established `create`/`update`
   methods, or a `save` whose insert/update behavior is explicit. Define whether
   updating a missing identity fails or inserts; never let an accidental upsert
   resurrect a deleted aggregate. Scope all lookup/write predicates to the trusted
   tenant when applicable. An existence check is neither authorization nor an atomic
   guarantee of uniqueness. When choosing signatures, layouts or failure outcomes,
   read [gateway contracts](references/gateway-contracts.md).
3. **Reconstitute facts.** Restore business ID, optional persistence ID, audit data,
   persisted revision, lifecycle state and owned children through the target's
   `with(...)`/reconstitution path. Do not invoke creation, generate IDs, call
   `now()`, advance a revision or publish/register new events on load. The loaded
   state must be complete and consistent for the intended domain operation. When
   editing a mapper, child write or version handling, read
   [reconstitution and concurrency](references/reconstitution-and-concurrency.md).
4. **Preserve aggregate atomicity.** Commit root and child changes together. For an
   invariant spanning children, make every relevant writer participate in the same
   root concurrency protocol; a version annotation on the root alone proves nothing
   about child-only writes. Preserve the revision observed at load as the expected
   write revision. Do not silently retry stale business decisions against new state.
5. **Connect the actual transaction.** Update the gateway implementation, mappings,
   migrations if required, use-case consumers, outer configuration and tests within
   the authorized slice. A call to `save` or `flush` is not proof of committed success.
   Translate failures at the adapter or outer transaction boundary that actually
   observes them. Keep event delivery ownership explicit when persistence and
   publication interact; java-ddd-domain-events is an optional handoff.
6. **Prove the contract that changed.** Read
   [verification](references/verification.md) for round trips, hostile tenant IDs,
   stale updates, child races and fake isolation. Run the relevant tests and report
   actual counts/results. Mapping unit tests and in-memory fakes cannot establish
   database isolation, constraint behavior or transaction interception.

For a review, deliver supported findings with locations, consequences and decisive
checks; do not present recommendations as executed fixes. For implementation,
deliver the complete affected slice and run its checks. Preserve adequate mappings
and public outcomes when the requested repair is narrow.

## Decisions that prevent contract drift

| Evidence                                                 | Decision                                                                                                        | Check                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Root invariant counts or sums owned children             | Persist child changes through the root protocol; reconsider the aggregate boundary if coordination is untenable | Concurrent disjoint child edits cannot jointly violate the invariant                 |
| Listing needs only ID, title and status                  | Use an application read model/query port when useful; do not load a complete root solely for a screen           | Returned fields and query behavior match the consumer contract                       |
| Lookup returns no row in the allowed scope               | Return the specified absence outcome                                                                            | An unavailable database follows a distinct failure path                              |
| Natural key must be unique within a tenant               | Enforce the normalized key and tenant atomically in storage; translate the known constraint failure             | Two racing inserts produce one accepted identity and the specified duplicate outcome |
| Root plus children come from multiple queries            | Establish an actual consistent-read protocol or verify/retry a changing root revision                           | A load racing with a committed change never exposes a mixed revision as valid        |
| A fake stores and returns the caller's mutable aggregate | Store immutable snapshots or independent copies and reconstitute on reads                                       | Mutating a loaded object without save cannot change persisted state                  |

An infrastructure exception must not masquerade as a business rejection. Preserve
absence, conflict, duplicate key, unavailable storage and corrupt persisted state as
distinct outcomes where the application needs them. Keep raw SQL and sensitive
identifiers out of public errors; retain diagnostic causes at the infrastructure
boundary.

## Handoffs and result

Use spring-boot-jpa for ORM mappings, provider lifecycle and fetching details;
spring-transactions-and-events for effective Spring transaction interception;
java-ddd-use-cases for orchestration; and java-ddd-testing for a broader testing
strategy. These are optional collaborators, not prerequisites for understanding
this contract. Do not grow the gateway into a business service, event broker or
generic query language to absorb neighboring responsibilities.

Report the affected root/port, preserved naming, write/read/commit semantics and
verification results, including any untested provider or database assumptions.
Evidence from the reference project demonstrates conventions, not universal DDD
rules. The naming choice is compatible with the domain-facing abstraction described
by [Fowler's Repository](https://martinfowler.com/eaaCatalog/repository.html); its
collection-like interface does not mandate a Java class suffix.
