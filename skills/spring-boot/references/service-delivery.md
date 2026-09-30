# Delivering a Spring Boot service

Use when creating a service or assessing whether a service fulfills its requested
use cases. For a local configuration repair, retain the focused workflow in SKILL.md.
This reference owns integration criteria; the specialists own the detailed mechanisms.

## Establish what must survive the happy path

Identify the actors, requested operations, accepted inputs and invariants before
choosing persistence, security or endpoints. For example, a company registration
request needs a decision about its identifier, normalization and uniqueness scope;
the word "company" alone does not authorize inventing tax rules, tenant semantics,
deletion behavior or a complete CRUD surface. Inspect project evidence first, then
ask about consequential gaps. Use explicit, reversible assumptions for routine choices.

Treat business records as durable unless the task explicitly establishes disposable
state. If the supported database is unknown, resolve that decision instead of replacing
the repository with a map. If a selected database is temporarily unavailable, implement
the real integration and isolate its pending execution evidence; preserve executable
checks for the environment that can run it. A test double is a test tool, not the
application's default storage. An explicitly disposable prototype may use memory, with
its lifetime, capacity and single-process limitations made clear.

Translate agreed behavior into observable criteria before implementation. A registration
use case might require successful retrieval after restart, a single winner for concurrent
registrations of the same normalized identifier, rejection of disallowed callers and
bounded list requests. Choose criteria from the actual use cases; do not add an endpoint
just to satisfy a generic checklist. Track each consequential criterion to implemented
code/configuration and suitable evidence. Documentation of an omitted requirement does
not satisfy it.

### Discover integration decisions before adding capabilities

Trace who calls the service and who deploys and diagnoses it. Read existing API contracts,
ADRs, environment configuration and operational instructions for decisions already made.
Identify the request paths whose volume, concurrency, latency, consistency or compatibility
constraints could alter composition. A synchronous dependency that consumes the request's
deadline needs an explicit bound; no traffic estimate is needed merely to rename a bean.

Inspect shared infrastructure before supplying its replacement: an existing gateway may
own quotas, a platform may supply credentials, and an approved starter may already own
instrumentation. Verify coverage of the actual route/environment and hand the remaining
contract to the specialist. Reuse is a decision supported by evidence, not an assumption
that a platform name guarantees the capability.

For example, an external API with contractual per-tenant quotas needs the quota policy
and enforcement owner established before implementation. Ask which consumers and quota
contract apply only if that evidence is missing; recommend reusing a verified gateway
policy instead of introducing a second limiter. An internal service with no such contract
still needs appropriate resource bounds, but does not automatically need Redis or a quota
system. Durable event delivery, scheduling coordination and a native artifact likewise
need a corresponding use case or deployment constraint; record a deferred concern and its
trigger when relevant rather than adding infrastructure speculatively.

## Honor the chosen architecture through names and flow

When the user supplies an architectural reference, trace one real operation through its
HTTP boundary, use case, domain behavior, persistence adapter and composition before
adopting its organization. Preserve the intended responsibilities and dependency direction;
an older Boot reference supplies architectural evidence, not the target project's dependency
versions or APIs. Check those against the Java 25/Boot 4 contract independently.

For an agreed DDD/ports architecture, this is an illustrative company naming map, limited
to the requested operations:

| Responsibility                  | Example package                             | Names that communicate the role                                                   |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| HTTP contract                   | `infrastructure.api.company`                | `CompanyController`, `CreateCompanyRequest`, `CompanyResponse`                    |
| Create use case                 | `application.company.create`                | `CreateCompanyUseCase`, `CreateCompanyCommand`, `CreateCompanyOutput`             |
| Retrieval use cases             | `application.company.retrieve.get`, `.list` | `GetCompanyByIdUseCase`, `ListCompaniesUseCase`, their operation-specific outputs |
| Domain behavior and port        | `domain.company`                            | `Company`, `CompanyID`, `CompanyValidator`, `CompanyGateway`                      |
| Persistence mapping and adapter | `infrastructure.company.persistence`        | `CompanyJpaEntity`, `CompanyJpaGateway`                                           |
| Spring composition              | `infrastructure.configuration`              | Configuration that wires the use cases and adapters                               |

An explicit `CreateCompanyUseCase.execute(command)` can construct the aggregate, validate
its state, call the gateway and map the output. Retrieval and update represent different
intentions; do not collapse distinct use cases into a catch-all `CompanyService` merely
because it is a familiar Spring name. Name methods for domain behavior, such as
`activate`, `deactivate` or `update`, when those operations exist in the requirements.
Keep HTTP request/response, application command/output, domain model/identifier and JPA
mapping types distinct at the chosen boundaries. In this architecture, Spring composition
belongs in infrastructure and domain/application code does not depend on Spring.

Verify where domain validation actually executes before persistence; a factory name or
`CompanyID.from(value)` wrapper alone proves no validation. Preserve infrastructure failure
semantics instead of converting every gateway failure into a business notification.
Choose interfaces, `Default` implementation pairs, base aggregates and separate build
modules only for an actual contract or project convention. This naming map does not
mandate those abstractions, generate unrequested operations, or replace a sound architecture
for a local configuration task.

## Integrate the relevant contracts

**Data and consistency.** For durable SQL records, deliver schema migrations and explicit
transaction boundaries, with constraints enforcing the agreed invariants for every writer.
Use one schema management owner, following the matching
[Boot database initialization contract](https://docs.spring.io/spring-boot/how-to/data-initialization.html).
Do not rely on `ddl-auto=create-drop` or unreviewed runtime `update` as the production
migration policy. Integrate JPA only when it fits the project; JDBC and existing storage
choices remain valid. Pass mappings, datasource, migrations, normalization, uniqueness
scope and failure behavior to `spring-boot-jpa` when JPA is used.

When multiple writes must commit together, establish one effective transaction around
that use case on the intended resource. Separate transactions for individual gateway calls
do not make the whole operation atomic. Where the chosen architecture keeps application
code Spring-free, apply that boundary in infrastructure around the use-case invocation.
Inspect the actual proxy
entry or programmatic boundary, transaction manager/datasource and rollback rules with
`spring-transactions-and-events`; [Spring's propagation contract](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
explains which calls share a physical transaction. Check persisted state when a later write
fails, and ensure a flush/commit failure cannot be reported as a successful registration.
Swallowing a persistence exception or observing only the first repository call is insufficient.

A pre-insert existence check can improve a message, but cannot arbitrate concurrent
writers. Put the atomic decision in the shared store, such as an appropriate unique
constraint, and map its known conflict at the application/HTTP boundary without treating
every database failure as a duplicate. Match null, collation and tenant semantics to the
selected engine; [PostgreSQL's constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
illustrate why the invariant must be explicit. Test with independent transactions or
service instances sharing that store. A JVM lock or concurrent collection cannot enforce
uniqueness across processes. Keep legitimate local synchronization when needed:
[JEP 491](https://openjdk.org/jeps/491), delivered in JDK 24, removes monitor-related
virtual-thread pinning on the Java 25 baseline; it does not remove lock contention or
create distributed consistency. Changing `synchronized` to `ReentrantLock` does not fix
the storage contract.

**HTTP and access.** Pass requested operations, invariants and caller expectations to
`spring-boot-web` and `spring-security-for-apis`. Integrate validation, stable success/error
contracts with shared common-error handling and endpoint-specific semantics where needed,
documented requests/responses, bounded pagination when lists exist, and limits on incoming
work and downstream waits. Preserve meaningful business error codes and diagnostic
identifiers through safe HTTP mapping; use the web specialist's typed response and
handler conventions while keeping domain/service code independent of HTTP types.
Verify validation and limits on the actual request path;
annotations and an OpenAPI page alone are insufficient. Establish operation and
object/tenant access where applicable. A deliberately public operation is valid; absent
identity infrastructure is not a reason to expose everything. Use the existing credential
contract rather than inventing an issuer or hard-coded credentials. An unresolved access
decision blocks the affected exposure, not unrelated implementation.

For a requested peer integration, use `spring-http-clients` to establish the actual
transport, deadlines, response bounds and failure/retry contract. Build through the
project's [Boot-configured client facilities](https://docs.spring.io/spring-boot/reference/io/rest-client.html)
so required customizers remain applied; verify the actual client rather than assuming
an injected builder guarantees every setting. A local database rollback cannot undo a
remote HTTP effect; resolve that consistency boundary before promising atomic behavior.

**Execution and operation.** Deliver a reproducible build and launch path for the agreed
runtime, required external settings with validated limits, and secrets supplied through
the deployment's configuration mechanism. Keep local/test defaults from silently choosing
ephemeral storage or permissive access in the deployed service. Verify the packaged artifact
and launch command, not just an IDE main method. Establish bounded startup/shutdown and
failure behavior for clients, pools and background work actually present. Provide health
and readiness signals appropriate to the serving contract, actionable logs and baseline
request/error/latency measurements; use existing Boot instrumentation before adding custom
signals. Read [operations and events](operations-and-events.md) for these lifecycle
and diagnostic decisions and use `spring-boot-observability` for wiring.
Operational readiness does not require adding a telemetry backend or Kubernetes to an
otherwise unrelated request.

## Prove the assembled behavior

Keep unit and slice tests for their claims, and exercise the real integrated path where
the contract crosses HTTP, security, transactions or storage. For SQL delivery, run the
shipped migrations against an isolated instance of the selected engine and observe committed
data independently; an in-memory substitute or rollback-only test cannot prove the target
engine's constraints or durability. Observe the same committed record after restarting the
application against the same store. Exercise concurrent conflicts through independent writers
and rollback when a later write fails through the real use-case transaction boundary.
Cover invalid inputs, unauthorized requests and configured limits as applicable. Compare the actual
HTTP behavior with its published contract. Test required configuration failure and the
important dependency/lifecycle failure paths. Use `spring-boot-testing` for test wiring and
cleanup; never aim these checks at a real user's database.

Include build/run/test commands, required configuration and migration steps, representative
API usage, and relevant operational checks in the service's instructions. Inspect executed
test reports, including counts and skips. If infrastructure is unavailable, identify the
command, prerequisite and exact claim left unverified, while completing independent work.
Do not label a mock-only suite, a health response, or a successful compilation as proof of a
complete service. Distinguish implemented behavior from verified behavior and from remaining
requirements; missing essential implementation cannot be discharged as a "known limitation".
