---
name: service-data-ownership
description: >-
  Define and verify data authority and access contracts when services, jobs or
  integrations share writers, read private tables, or bypass supported interfaces.
  Inventory readers and writers, choose supported access paths, enforce credentials
  and grants, and expire temporary exceptions. Use after identifying a service
  boundary; does not decide service extraction, implement sagas, tune ORM queries,
  or execute data-ownership transfer migrations.
---

# Service Data Ownership

## Purpose

Turn "Orders owns these data" into a contract that legitimate consumers can use and
unauthorised callers cannot bypass. The result includes effective access controls and
evidence of permitted and denied operations, not only an ownership diagram.

Authority belongs to the boundary that decides an invariant and accepts corrections to
its facts. Several service replicas or approved workers can implement that authority;
one owner does not mean one process. A database object owner is a privilege-bearing
role, not automatically the business authority. A replicated fact, derived projection
or cache needs a custodian and source lineage without becoming a competing authority.

The architectural core has no imposed Java, Spring or database baseline. Inspect the
target's toolchain, resolved framework/driver versions, database engine/version and
deployment identities before using version-sensitive guidance. The PostgreSQL 17 and
Spring Framework 6.2 references are conditional examples, not upgrade requirements.

## Boundary and handoffs

Activate for ambiguous write authority, cross-service SQL, hidden integration writers,
overprivileged runtime identities, or exceptions that have become permanent.

- `distribution-boundaries` owns whether to distribute and the initial ownership line;
  this skill supplies the access contract and proof that the line holds.
- `distributed-transactions-and-sagas` owns coordination across authoritative writers;
  do not silently replace a required atomic invariant with eventual consistency.
- `cross-service-query-design` owns query composition, freshness and projection recovery.
  Supply approved data interfaces and authoritative versus derived facts to it.
- `spring-boot-jpa` and `spring-transactions-and-events` own persistence and transaction
  mechanics; `online-database-schema-migrations` owns DDL rollout. This skill checks
  which identities may perform them and whether runtime wiring respects that decision.
- `legacy-enterprise-modernization` and `change-data-capture-operations` own transfer,
  backfill and CDC operation. Supply authority before/during/after the transition;
  do not invent a dual-write protocol here.
- `service-identity-and-trust` owns workload trust; `spring-security-for-apis` owns its
  Spring enforcement. Service credentials do not confer unrestricted user/tenant access.

These are optional specialist handoffs, not prerequisites for a small ownership review.
For a local SQL performance issue with clear access authority, route to
`sql-query-performance` instead of redesigning ownership.

## Workflow

1. **Identify facts and invariants.** Read current ADRs, contracts, schema changes and
   owning code. Name who decides validity, who can correct a fact, and which operations
   require authoritative state at the moment of the effect. Distinguish orders' delivery
   address snapshot from a customer's current address rather than assigning both by a
   shared column name. Record disputed ownership; do not assign it from table location.
2. **Inventory actual access.** Trace repositories, native SQL/JDBC, stored procedures,
   triggers, scheduled jobs, batch imports, CDC sources/sinks, repair scripts, reporting,
   migration runners and administrative access. Join code evidence to deployed identities,
   effective grants/role membership, consumer contracts and available audit records.
   Include old deployments and dormant jobs. A repository search alone cannot establish
   that no external writer exists; unavailable grants or unobserved schedules stay unknown.
3. **Classify each path.** Record the principal, data subset, operation, business purpose,
   authority or derivative status, supported interface, enforcement point and evidence.
   A published SQL view/export may be an explicit read contract; private base-table SQL
   is not made supported by widespread use. Read
   [the access-contract reference](references/access-contract.md) when constructing
   this inventory, deciding a supported read interface, or handling exceptions.
4. **Choose the smallest enforceable boundary.** Retain shared infrastructure if its
   capacity, recovery and trust constraints fit. Compare private tables, schemas and
   databases using actual permission mechanisms; separate servers are conditional on
   isolation needs. For every consumer, choose an owner operation, supported read surface,
   derivative copy, or explicitly bounded exception. Preserve adequate existing contracts.
5. **Close bypasses in the requested scope.** For implementation, change relevant callers,
   credential references, grants, migration identity wiring and operational documentation
   together. Keep business checks at the authority, exposing use-case operations and
   contract DTOs rather than another service's JPA repository/entity model. For Java/Spring
   wiring or relational privilege enforcement, read
   [enforcement and verification](references/enforcement-and-verification.md). For review,
   return evidenced gaps and proposed fixes without silently changing production access.
6. **Sequence changes without losing legitimate work.** Establish and test the supported
   path with least-privileged identities, move callers, then revoke obsolete access with
   an accountable recovery plan. Do not blindly remove an unknown job's permissions or
   restore an unrestricted shared credential as the default rollback. A temporary exception
   needs a concrete exit path and enforceable expiry; migration writers require an explicit
   transfer protocol from the migration owner before claiming exclusivity.
7. **Verify and report.** Exercise allowed operations and hostile bypasses against the
   intended engine and deployed identity shape in an isolated environment. Check current
   objects, newly created objects and exception revocation, including pooled sessions.
   Distinguish static/package checks, executed runtime tests, written cases and remaining
   operational evidence. Grant listings or successful normal traffic alone do not prove
   denial of prohibited access.

## Decisions that change the answer

| Evidence or constraint                                                                        | Decision and criterion                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate owners use one server with distinct principals and narrow effective grants           | Retain the topology if shared capacity, recovery and administration meet requirements. Test denied cross-access; a dedicated server is not a prerequisite for ownership.                                                    |
| A report needs stable, supported fields and accepts the owner's published SQL read contract   | Retain or define that read surface, consumer/version policy, resource bounds and permissions. Record shared database/schema coupling; do not force an HTTP hop.                                                             |
| The same SQL contract would now authorise a business effect from a stale copy                 | The owner must enforce the invariant at the effect, using an adequate concurrency/consistency contract. An earlier read, even fresh then, does not close the race.                                                          |
| Two services independently decide updates to the same invariant                               | Resolve the authority or retain a common transaction boundary; adding optimistic locking does not assign business ownership. Do not choose last-write-wins without the business conflict contract.                          |
| A temporary base-table reader cannot move yet                                                 | Limit principal, fields, operations and duration; name the replacement and automate/assign revocation with a tested deadline. Escalate missing exit criteria instead of relabelling the exception as a permanent interface. |
| The diagram shows one writer but runtime, migration and repair jobs share an owner credential | Treat the boundary as unenforced until principals and reachable privilege paths are reconciled. An annotation or package boundary cannot constrain this credential.                                                         |

## Minimum useful result

For a narrow task, return only the affected contract rows and their verification. For a
broader design or implementation, provide:

- Facts/invariants, authoritative owners and derivative lineage, with unresolved disputes.
- Reader/writer inventory and supported access contracts tied to actual principals and
  enforcement artifacts; include grant changes or caller changes when implemented.
- Exceptions with scope, responsible owner, expiry, replacement, revocation mechanism
  and proof; operational recovery that preserves the required boundary.
- Allowed/denied test evidence, environment/version and coverage limits; next evidence
  that would change the recommendation. Do not report "enforced" while a decisive
  identity, grant path or external writer remains unverified.

The design distinction between private data and dedicated hardware is supported by
[Database per service](https://microservices.io/patterns/data/database-per-service.html).
The access-contract details here are an architectural synthesis; their enforcement must
be demonstrated in the target environment, not inferred from that pattern description.
