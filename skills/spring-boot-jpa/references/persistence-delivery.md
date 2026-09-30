# Delivering a maintained persistence path

Read when creating a service's persistence, changing its consumer contract or following
a supplied architectural reference. A narrow mapping/query repair still needs only its
affected contracts. Implement the requested operations; do not silently replace durable storage with an
in-memory map or grow a registration request into unrequested CRUD, events or tenancy.

## Start from the caller's contract

Identify the application operations, jobs and external writers using this storage path.
Inspect existing signatures, tests, schema history and ADRs before choosing new types or
abstractions. Record the affected decisions in the project's normal place:

- An optional lookup can return `Optional<Company>`; a command requiring that company
  turns absence into a contextual business failure. Do not turn connection/query failures
  into `Optional.empty()`. A single-result query must have a matching uniqueness contract;
  returning `findFirst` can conceal duplicate data instead of repairing it. Spring Data
  collection-returning repository methods return an empty representation, not null;
  verify the chosen signature's nullability and cardinality rather than relying on its name.
- Choose only the fields and bounds the caller consumes. A managed entity is appropriate
  for an update inside its unit; a detached output must contain the data its caller needs.
  A stream needs an explicit owner that closes it within its transaction. A domain port
  need not expose Spring `Page`, an `EntityManager` or provider exceptions.
- Define read freshness, count/continuation expectations, tenant source, write completion
  and conflict handling where material. A DTO type or `readOnly=true` alone establishes
  none of those consistency guarantees. Reuse the chosen conventions instead of adding
  a universal result envelope, repository DSL or mandatory interface/implementation pair.

[Spring Data 4.1.1 null handling](https://github.com/spring-projects/spring-data-commons/blob/4.1.1/src/main/antora/modules/ROOT/pages/repositories/null-handling.adoc),
[query return contracts](https://github.com/spring-projects/spring-data-commons/blob/4.1.1/src/main/antora/modules/ROOT/pages/repositories/query-return-types-reference.adoc).

For a fixed two-filter screen, retain a clear derived/JPQL query and existing pagination;
composable Specifications or a query object earn their cost when consumers actually need
combinations. A one-field optional mapping change does not justify a new domain model or
cache. If several legacy callers have incompatible absence or deletion semantics, expose
and coordinate that compatibility decision before changing the shared repository contract.

## Deliver the schema and the operation together

Establish the target engine/version, persistence lifetime, existing schema owner and
all writers before choosing storage-specific behavior. For an approved database target,
ship the mapped entities/values, concrete repositories or adapters, transactional use
cases, versioned migrations and disposable database tests needed by the requested path.
If the database choice is unresolved, state that dependency and continue domain/contract
work; do not describe H2-only execution as verification of the eventual deployment.

Use the project's migration mechanism as the schema owner. A new maintained database
needs a repeatable migration path, including keys, required/null semantics, relevant
checks and indexes. Name constraints that the application must recognize as specific
business conflicts. Verify clean creation and upgrade from the prior supported schema
when one exists. Hibernate `validate` is a partial compatibility check; annotation-driven
`update` is not a deployment plan. Keep demo `create-drop` and seed data out of deployment
profiles. Do not combine Flyway/Liquibase and independent initialization scripts without
an intentional supported ordering contract.
[Boot 4.1.1 initialization contracts](https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/how-to/pages/data-initialization.adoc).

For a company identifier such as CNPJ, define the accepted representation and canonical
comparison before persisting it. Preserve significant characters and leading zeros;
an identifier is not a number merely because one input format is numeric. Validation,
normalization, indexed lookup and the database unique constraint must agree. Specify
global versus tenant-scoped uniqueness and deletion/reuse rules only when relevant.
Inspect and reconcile existing duplicates before adding a constraint; silently deleting
them is not a migration strategy. Database collation/null behavior can change equality.

A pre-insert `existsBy...` check may improve diagnostics but cannot enforce uniqueness
against concurrent replicas. Neither `synchronized` nor `ReentrantLock` coordinates
independent processes. Retain the database constraint and test two independent writers
attempting the same canonical identifier: one stored row and a recognized conflict,
without partial companion writes. Read [queries and transactions](queries-and-transactions.md)
for failure translation at the actual flush/commit boundary.

## Let names expose responsibilities

Trace one operation through the reference project before copying its organization.
If domain/application/infrastructure separation is chosen, make roles concrete:

- `CreateCompanyUseCase` coordinates creation; `CompanyGateway` expresses the domain's
  persistence need using domain identifiers/values rather than Spring Data or HTTP types.
- `CompanyJpaGateway` implements that port using `CompanyJpaRepository` and, when the
  domain model is separate, `CompanyJpaEntity`. Use an engine-specific name only when
  its behavior actually depends on that engine.
- Group use cases by feature/operation and persistence implementation by feature/adapter
  following the project. Map entities to domain values or immutable application outputs
  while the needed state is available; HTTP Request/Response and `ResponseEntity` stay
  at the web boundary. An entity graph or Spring `Page` is not automatically a public API.

Keep the actual transaction around the complete read/decision/write invariant. An
infrastructure decorator can wrap a framework-free use case using the project's
transaction mechanism, such as `TransactionTemplate`.
Do not let a port hide separate repository transactions that break that invariant.
For an ordinary layered service, a focused service plus Spring Data repository remains
valid. Avoid mandatory interface/implementation pairs, duplicate models, base repositories
or build modules when no boundary requires them.

Expected failures need useful contracts too: a shared business exception can carry a
stable code, with specific failures retaining the relevant identifier and conflict
context. A missing company failure should identify the requested company internally.
Preserve the cause when translating an infrastructure failure; never infer a business
conflict from every `DataIntegrityViolationException`. Public details and status mapping
belong to the API boundary and may need to conceal identifiers or database diagnostics.

## Make the change reviewable and operable

For a schema-affecting delivery, first reproduce the affected caller contract and inspect
existing rows; then implement the migration/mapping, transaction path and caller adaptation
with targeted tests. Separate work dependent on an unresolved invariant from independent
work. Use the existing migration runner, configuration sources and diagnostics; adding a
new runner, cache, replica or audit history requires a demonstrated need.

When old and new versions or independent writers overlap, specify the compatible deployment
order, backfill/reconciliation ownership, locking impact and recovery step before changing
required columns, codes or constraints. Do not assume reverting application code reverses
a data migration; a rollback or forward repair needs its own verified preconditions.
Keep durable architectural decisions in an ADR when warranted, and ordinary mapping changes
in the existing migration/change documentation.

Update only documentation affected by the delivery: show how callers use the result and
handle absence/conflict, what marks successful completion, and how operators apply/verify
the migration and diagnose its relevant failures. Reference existing commands/runbooks;
record database/driver versions and the source of configuration without credentials.
For long-running data changes, document the bounded progress/restart procedure and owner.
Do not invent retention, backup objectives or a full operations platform for a query fix.

Before reporting completion, verify that committed data survives a new context and,
when durability is part of the delivery, an application restart against the same disposable
database. Exercise bounded retrieval, duplicate conflicts and rollback through the real
transaction boundary. A repository mock cannot establish these properties; report which
actual engine/driver/migration path was exercised.
