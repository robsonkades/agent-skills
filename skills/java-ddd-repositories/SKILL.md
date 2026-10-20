---
name: java-ddd-repositories
description: >-
  Implement or review domain Gateway interfaces using the ddd-example domain
  reference. Use when defining aggregate lookups and writes, typed-ID existence
  queries, pagination, video previews or media resource ports. Preserves the exact
  domain contracts and package placement; excludes application orchestration,
  persistence adapters, ORM mappings and transaction implementation.
---

# Java DDD Repositories

Implement the domain's `Gateway` contracts faithfully. The authoritative technical
reference is the current `ddd-example/domain` source supplied for this project,
reviewed at commit `8d964ce4106c2299164e28980ae7553e2afbdc92`. Its five Gateways and
four query/pagination/projection types ship as complete Java files, linked from the
references below alongside the contract explanations and portable source paths;
the original checkout was `C:\git\ddd-example\domain`. Do not substitute generic DDD
preferences, other projects or persistence-framework conventions for this source.

This skill owns the domain boundary, including its projection and media contracts.
It does not implement application use cases, database adapters, storage clients or
transactions. An interface declaration establishes a Java type contract; it does
not prove an adapter's database behavior, error translation or durability.

## Define the boundary from evidence

1. **Identify the corresponding reference port.** Keep the interface beside its
   aggregate: `category.CategoryGateway`, `genre.GenreGateway`,
   `castmember.CastMemberGateway`, `video.VideoGateway`, or
   `video.MediaResourceGateway`. When choosing or reviewing methods, read
   [gateway contracts](references/gateway-contracts.md). Preserve separate `create`
   and `update`; do not introduce a generic `Repository<T, ID>`, a shared `save`,
   framework inheritance or a base interface merely because methods repeat.
2. **Preserve every signature and its differences.** Lookups use concrete typed
   identifiers and return `Optional<Aggregate>`. The first three aggregate ports
   return aggregate pages and have `existsByIds(Iterable<ID>) -> List<ID>`.
   `VideoGateway` returns `Pagination<VideoPreview>` and has no `existsByIds`.
   Media storage has its own four-method port. Do not homogenize these contracts.
3. **Keep the supporting types in domain.** Read
   [query, projection and resource types](references/domain-boundary-types.md) when
   constructing criteria, mapping pages, returning previews or handling media.
   Preserve component names, order and types, including `String` in
   `VideoPreview.id` and typed ID sets in `VideoSearchQuery`. Do not move the
   reference's preview or search types to application, introduce `Pageable`, or add
   normalization, validation or defensive copying that the source does not perform.
4. **Separate known structure from unknown behavior.** The interfaces do not define
   sort defaults, page bounds, filter combination, missing-update/delete outcomes,
   ordering of existence results, storage failures, transactions or concurrency.
   State those limits. If completing the requested behavior requires an unresolved
   choice, ask a focused question; do not guess from a method name. Continue the
   domain work whose contract is established. New aggregate ports require evidence
   for the chosen operations, not automatic copying of every CRUD method.
5. **Respect aggregate restoration APIs.** When a Gateway change touches a
   `with(...)` boundary or is claimed to guarantee persistence behavior, read
   [reconstitution and concurrency boundaries](references/reconstitution-and-concurrency.md).
   Preserve supplied identity/state and each overload's actual validation and event
   behavior. Do not add revision tokens, locking, a unit of work or event delivery
   protocols absent from this domain.
6. **Verify only what the evidence can establish.** Read
   [verification](references/verification.md) for source comparison, useful domain
   checks and concrete review cases. Domain unit tests use real domain objects,
   no mocks or Mockito, and explicit `@DisplayName` on every test method. Do not
   create tests that mock a Gateway and assert its stubbed return value. Report
   signature checks, executed domain tests and unverified adapter behavior separately.

Keep the reference's plain Java imports and domain types. Inspect the consuming
project's compiler and test configuration before running examples; the source
shapes here are Java 17 compatible and require no preview feature. Do not upgrade
Java, add frameworks/nullability libraries or infer the domain compiler toolchain
from an unrelated build module.

When copying or compiling the bundled Java files, follow the complete-source links
in the Gateway and boundary-type references. They retain their original packages
and imports and need the remaining reference domain types. Use the source index in
[java-ddd](../java-ddd/SKILL.md) when assembling that domain; these nine files are
not a standalone module. If that suggested skill is unavailable, use the supplied
reference domain checkout for the missing types rather than inventing substitutes.

## Handoffs and result

Use `java-ddd-aggregates` for aggregate state, factories and ownership;
`java-ddd-value-objects` for identifiers and media value objects;
`java-ddd-domain-events` for event buffering/publication;
`java-ddd-domain-services` for the reference validation mechanism; and
`java-ddd-testing` for domain test design. A request about SQL, mapping, locking,
commit, or a concrete storage client is outside this domain-only contract. Identify
that boundary and the missing evidence before changing another layer.

For implementation, deliver the requested domain interfaces/types with their
source counterparts and checks. For review, report concrete differences, affected
contracts and evidence. Keep unresolved behavior explicit; do not present an
interface match or a passing domain test as proof of persistence correctness.
