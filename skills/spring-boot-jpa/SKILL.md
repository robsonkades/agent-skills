---
name: spring-boot-jpa
description: >-
  Implement, diagnose and review Spring Boot 4 persistence with Spring Data JPA when
  entity state, Hibernate mappings, identifiers, fetching, transactions, locking or
  datasource configuration need verification. Covers SQL Server and PostgreSQL
  distinctions. Excludes reactive persistence and deep database execution-plan tuning.
---

# Spring Boot JPA

## Scope and activation

Own the integration between Spring Boot 4, Spring Data JPA, the resolved persistence
provider and the database. Activate for repository implementation, surprising SQL,
lost updates, lazy-loading failures, type/identifier mismatches, transaction failures,
or datasource/property reviews. Intended users are developers working in an existing
imperative Java service; a new service still needs a database and consistency contract.

Preserve the requested mode: a review produces findings; diagnosis produces supported
explanations and the next discriminating check; implementation changes only authorized
code/configuration/schema. An adequate JDBC query is a valid outcome. Do not introduce
JPA merely because this skill was selected, migrate Boot 3 automatically, or treat JPA
as reactive persistence. Distributed delivery, API documentation and deep execution-plan
tuning belong to their specialists.

## Establish the persistence contract

1. Read the build and resolved dependencies, compiler/runtime, CI image, datasource
   configuration, active profiles and migrations. Record exact Boot, Spring Data,
   provider, pool, JDBC driver and database versions. Boot **4.x** is the scope, not a
   promise that all its releases manage identical APIs. Use **Java 25** for this skill's
   recommendations and new examples. The fixture uses Boot 4.1.1, Java 25,
   Hibernate 7.4.5.Final and BOM-managed dependencies. If an existing target uses an older
   Java baseline, identify the compatibility boundary before applying examples; do not
   silently upgrade that project. Hibernate annotations require Hibernate.
   Use the official [Spring Data JPA reference](https://docs.spring.io/spring-data/jpa/reference/jpa.html)
   for repository contracts and [Spring Boot documentation](https://docs.spring.io/spring-boot/)
   for auto-configuration and test integration. Select versions matching the resolved
   project, not simply the documentation's default release. When authorization or an
   auditing principal affects the persistence path, consult the matching
   [Spring Security reference](https://docs.spring.io/spring-security/reference/) for
   that boundary; query filtering alone is not an authentication policy. Hibernate and
   database primary sources complement these contracts where provider behavior matters.
2. Trace one operation through repository, persistence unit, transaction manager and
   physical datasource. Inspect component/entity/repository scanning and custom beans
   before adding configuration that may make auto-configuration back off. With multiple
   datasources, prove the repository's entity-manager factory and transaction manager
   bindings; `@Primary` alone does not establish the intended atomicity.
3. Establish required rows, fields, ordering, pagination, updates, tenant/authorization
   checks, uniqueness and concurrency rules. Inspect actual DDL, constraints, indexes,
   sequence definitions and existing writers. An annotation is not proof of deployed DDL.
   For entity creation or mapping review, inventory **every persistent attribute**, including
   optional, inherited, embedded, relationship, generated and version attributes. Establish
   its complete applicable storage, null, validation and write-ownership contract; do not
   stop at `nullable=false` or only inspect required fields. Deliberate defaults are valid;
   copying every annotation argument is not completeness.
4. Separate explicit requirements and documented rules from recurring conventions,
   isolated examples and assumptions. Follow the existing package/bean style when
   adequate. New code uses a single constructor or bean-method parameters without
   `@Autowired`; do not add both scanning and a factory for the same bean.
   Prefer Boot-managed persistence and concrete Spring Data repositories. Keep entities
   free of interfaces or factories introduced solely to share test code; retain mapping
   overrides only when the storage contract requires them. Adapt an example only for the
   operation being implemented: a normal update needs neither a provider-probe harness
   nor failure methods in the production service. Add auditing, custom entity equality,
   pessimistic locks or generator tuning only for an identified consumer requirement.
5. Ask only for unknowns that change correctness, such as the atomicity requirement or
   unmanaged sequence writers. Continue reversible local work while gathering those
   facts. Without database access, review contracts and compile examples, but leave
   dialect, lock, plan and load claims explicitly unverified.

## Essential decisions

| Decision                    | Prefer this when the evidence supports it                                                                                                                                     | Guard and verification                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple query or abstraction | Existing derived method/JPQL for fixed predicates; Specifications or a repository fragment for genuinely composable predicates; native SQL/JDBC for needed database semantics | Bind values; allowlist dynamic sort/identifier choices. Test null, empty filters, tenant scope and result shape. Do not generate a generic repository framework.                                                                                                                                           |
| Create or update            | Determine how Spring Data identifies a new entity before `save`; load and change a managed entity for a partial update                                                        | `save` selects `persist` or `merge`; `merge` returns the managed instance and can copy unintended nulls from an incomplete detached object. Preserve omitted fields, version and authorization.                                                                                                            |
| Reference or read           | An entity reference can represent a known association ID when no state/existence decision is needed                                                                           | `getReferenceById`/`getReference` proves neither existence nor permission. Failure can be deferred; a foreign key enforces existence, not tenant authorization. Do not promise zero SELECTs.                                                                                                               |
| Mapping override or default | Keep an adequate provider mapping; override JDBC type only to satisfy a demonstrated schema/binding contract                                                                  | Reconcile Java range, JDBC binding, SQL range, nullability, precision and collation. Changing `@JdbcTypeCode` does not migrate a column.                                                                                                                                                                   |
| Identifier strategy         | Preserve compatible sequence/identity/assigned-ID strategy; evaluate batching and multiple writers before changing it                                                         | Allocation size, physical sequence increment, optimizer and database cache are different controls. IDs may have gaps and do not define commit order.                                                                                                                                                       |
| Fetch plan                  | Choose data for the use case: DTO/closed projection, entity graph, fetch join or association batch fetching                                                                   | Count statements across the full use case, including rendering. Preserve parents with empty associations, tenant predicates and page cardinality. EAGER and OSIV are not universal N+1 fixes.                                                                                                              |
| Page contract               | `Page` when a total is required; `Slice`/supported scrolling when continuation suffices                                                                                       | Stable ordering needs a unique tie-breaker. Verify provider/dialect SQL: Hibernate 7.4 supports collection-fetch pagination by SQL rewriting on supported databases; older providers can page in memory. Compare direct fetch with two-stage/batched/projection alternatives and test count independently. |
| Transaction boundary        | One database consistency unit, usually an application-service call through the configured transaction mechanism                                                               | Include reads/decisions that must be atomic with writes. Keep avoidable remote I/O and long CPU work outside without splitting the invariant into repository-local transactions.                                                                                                                           |
| Read-only intent            | `@Transactional(readOnly = true)` for a genuinely read-only unit when the selected manager/provider benefits                                                                  | It is not universal write prohibition. An outer transaction may govern the effective settings; do not use it to secure a write path.                                                                                                                                                                       |
| Concurrent writes           | Constraint/conditional update for a database invariant; `@Version` for stale entity updates; pessimistic locking when waiting/serialization is required                       | Choose from the conflict policy and isolation. `@Lock(PESSIMISTIC_WRITE)` requires a transaction and is not a generic SQL performance hint. Verify two sessions and bounded waiting.                                                                                                                       |
| Pool/property tuning        | Change a setting to address a measured symptom or required contract                                                                                                           | Pool size is a global database budget across replicas, not the virtual-thread count. A copied `20`, `250 ms` or batch `50` is a hypothesis, not an optimum.                                                                                                                                                |

Read [mapping and identifiers](references/mapping-and-identifiers.md) when changing
types, associations, IDs or using references. Read [queries and transactions](references/queries-and-transactions.md)
for fetch/pagination, state changes, propagation, locks, batching, auditing or bulk DML.
Read [datasource configuration](references/datasource-configuration.md) for integration,
pool sizing or property reviews, including the SQL Server scheduler case.

## Contracts that must survive optimization

- For an edit conditioned on an earlier client read, compare `expectedVersion`/`If-Match`
  with the loaded authorized entity before mutation; reloading current state alone loses
  that precondition. Never assign client input to managed `@Version`; retain its commit-time
  race protection. See the mapping reference for the API boundary and fixture cases.
- `flush` synchronizes pending changes and can reveal constraints; it does not commit.
  A successful `save` can fail later at flush/commit. Check the result outside the first
  persistence context or transaction when durability/visibility is the assertion.
- In default proxy-based transaction management, self-invocation bypasses interception.
  Check the actual call path, rollback rules and transaction manager before adding an
  annotation. A caught exception does not necessarily restore a usable transaction.
  Retry a retryable failure from a fresh transaction with bounded attempts and repeat-safe
  effects; do not retry all integrity violations or unknown commit outcomes blindly.
- An `EntityManager`/managed graph is not a shared concurrent workspace. Do not pass it
  to async tasks, share it across requests, or expect thread-bound transactions to follow
  virtual-thread/task creation. Pass identifiers/immutable values and establish the next
  unit explicitly.
- Bulk JPQL/native updates can bypass callbacks, ordinary version checks and managed
  state. Account explicitly for optimistic predicates, auditing and stale entities.
  A smaller statement count is not proof of equivalent behavior.
- Keep reference equality when no consumer needs logical equality across contexts. If a
  real collection/caller contract needs it, first consider comparing stable IDs or an
  immutable unique natural key. Generated-ID equality must distinguish transient objects,
  retain hash stability and handle proxies symmetrically; the mapping reference explains
  the conditional pattern and its limitations. Do not generate equality from mutable
  state or associations, or add provider coupling merely to exercise a test.
- `hibernate.connection.provider_disables_autocommit=true` asserts that supplied
  connections already have autocommit disabled. It does not disable it; an incorrect
  assertion can move writes outside the intended transaction.
- No pool, fetch or lock change is a confirmed performance fix without a representative
  workload and baseline. Preserve a sound configuration when evidence does not justify
  changing it. Virtual threads do not enlarge database capacity.

## Verification and completion

Read [verification](references/verification.md) to choose tests. For a concrete managed
update or conditional edit, the [Inventory example](assets/persistence-fixture/README.md)
shows Boot configuration, a Spring Data repository and a transactional service, including
rollback and version conflicts on H2. Reuse the project's existing test setup first;
running this example is not a prerequisite for unrelated mapping or configuration work.
Validate vendor-specific behavior in project tests with the actual schema and driver.
Never use a production database to make an example pass.

For implementation, finish with the requested working path, representative consumption,
and targeted evidence: observed SQL/results for query changes; commit/rollback or two
transactions for consistency changes; real driver/database round-trips for types; measured
acquisition/hold time and errors for pool changes. For a review, return prioritized
file/setting findings, consequence, correction and how to verify it. For diagnosis,
separate observed SQL/state from hypotheses and state the next discriminating check.

Completion means the relevant contracts hold at the reported validation level. Report
unrun database/version/load checks with concrete prerequisites; compilation and H2 tests
do not establish SQL Server or PostgreSQL behavior. Do not demand benchmarks or persistent
reports for unrelated narrow changes.

## Composition without mandatory catalog installation

Use optional specialists when a deeper question is decisive. Pass the use-case invariant,
versions, sanitized schema/query/binds, transaction path and observed failure; expect a
bounded recommendation and verification plan. If unavailable, keep the local guards above
and identify the missing evidence rather than asserting their result.

- orm-fetch-and-batching-performance: statement amplification or batch effectiveness
  remains unresolved after locating the Spring Data call.
- enterprise-transactions: isolation/atomicity spans several use cases or resources.
- offline-concurrency-control: client edits span transactions and need a conflict/recovery
  policy or aggregate coordination. This skill owns the JPA comparison and commit checks.
- connection-pool-sizing: workload/capacity modeling beyond the Boot property binding.
- sql-server-performance or postgresql-performance: a captured statement plan, session
  settings or database-specific locking requires deeper investigation.
- orm-structural-mapping and online-database-schema-migrations: aggregate mapping or
  compatible rollout requires broader schema design. Do not silently migrate schema.
