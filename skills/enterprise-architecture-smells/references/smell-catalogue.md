# Smell Catalogue

Each entry: symptoms · cause · consequences · detection · direction · when it is acceptable.
Causes and consequences are hypotheses to check against actual paths and change history;
apply a refactoring direction only to confirmed harm, preserving the required contracts.

## Anaemic domain model

**Symptoms** Entities with public getters and setters and no methods; services containing
`if` statements about entity state; the same validation in several services.

**Possible cause** A domain model was intended, but rules were placed beside repositories
and transaction orchestration. JPA entities alone do not establish that architectural choice.

**Possible consequences** A stateful rule can be bypassed or copied inconsistently, or
mapping costs exceed their benefit. Trace the actual rule owner and all writers; data-only
entities and service conditionals alone do not establish either problem.

**Detection**

```bash
# Candidate files only; inspect annotations, setters and actual invariant paths.
rg -n -g '*.java' '@Entity|public\s+void\s+set' src/main/java
```

**Direction** Encapsulate one bypassable rule in the appropriate domain type. Check ORM access
mode, serializers and reflective callers before removing a setter; compilation does not
find those consumers (`architecture-refactoring-paths`).

**Acceptable when** deliberate scripts/shared policies have coherent rule ownership and
data-only entities provide useful persistence mapping. A gateway is not required to make
that choice valid; preserve the relevant ORM and concurrent-writer contracts
(`domain-logic-organization`).

## God service

**Symptoms** One class with 20+ public methods and 8+ collaborators, imported everywhere,
edited by every team, a merge-conflict hotspot.

**Cause** The service layer began as pass-through, so it had no defined responsibility, and
every new rule was cheapest to add there.

**Consequences** No unit of work can be reasoned about in isolation; tests need enormous
fixtures; parallel work collides.

**Detection**

```bash
git log --format='%an|%s' --since='6 months ago' -- '*OrderService.java' \
  | sort | uniq -c | sort -rn | head -20
```

Many authors and subjects select candidates. Read the actual changes to establish unrelated
responsibilities and resulting conflicts; commit titles and size alone do not confirm them.

**Direction** Consider splitting one use case while preserving transactions, authorization,
proxy entry points and behavior tests; extraction is not automatically safe. Shared policy
extraction or a state-owning domain type should follow the chosen organization
(`service-layer-design`).

**Acceptable when** the class is genuinely one cohesive responsibility that happens to be
large, and its history shows one reason to change.

## Transaction script sprawl

**Symptoms** The same business rule implemented in four scripts, slightly differently;
`copy-paste` lineage visible in the code.

**Possible cause** A rule has several independent owners. Interacting rules can increase
this cost, but their presence alone does not establish that Transaction Script is unsuitable.

**Consequences** Rules diverge silently; a fix lands in three of the four sites.

**Detection** Search for a business term (`discount`, `surcharge`, `eligib`) and count the
distinct implementations. Check whether they implement the same rule/version and should
change together; even two divergent implementations can matter, while similar checks may not.

**Direction** Give the confirmed shared rule one owner: a function or policy may suffice for
shared computation; compare a state-owning domain type when transitions must preserve an
invariant. Preserve each entry point's results and transaction behavior. Consider a broader
domain model only if shared policies leave repeated state coordination or bypassable rules
(`domain-logic-organization`).

**Acceptable when** scripts delegate common rules to a coherent shared owner, or the
similarity is coincidental — two operations that both check a date are not duplication.

## Generic repository / DAO layer

**Symptoms** `GenericRepository<T, ID>`, `BaseDao`, or a repository per table wrapping a
Spring Data interface with identical method signatures.

**Cause** Symmetry, or a habit from a framework that needed it.

**Consequences** The published surface is CRUD for every aggregate, including `deleteAll`;
the aggregate boundary dissolves; real query needs are met elsewhere anyway.

**Detection** A repository interface whose methods all delegate one-to-one; a base
repository with type parameters.

**Direction** Remove redundant forwarding or narrow the exposed surface after checking shared
policy and callers; retain useful generic implementation code behind aggregate contracts
(`repository-pattern`).

**Acceptable when** the hand-written interface narrows a wide framework surface or is owned
by the domain for inversion — those are behaviours, and they justify the file.

## Excessive layering

**Symptoms** Adding a nullable field touches seven files; a call passes through four objects
that only forward; stack traces are mostly framework and mappers.

**Cause** A reference architecture applied uniformly, including where no boundary exists.

**Consequences** Change cost scales with layer count; navigation is slow; two of the layers
are structurally identical and drift.

**Detection**

```bash
# Candidate commits, not twenty verified features; inspect/group their diffs by feature.
git log --format='%h %s' --name-status --no-merges -20 --grep='^feat'
```

**Direction** Collapse structurally identical adjacent layers; keep the ones that translate,
narrow or invert (`remote-facade-and-dto`).

**Acceptable when** each layer is doing something nameable — and at a remote boundary, where
the apparently redundant DTO is preventing schema-to-contract coupling.

## Leaky abstraction

**Symptoms** A domain-owned interface with `Pageable`, `Specification` or `Page` in it; a
"database-agnostic" layer with dialect branches; a gateway returning the vendor's types.

**Cause** The abstraction was introduced without deciding what it hides.

**Consequences** Every caller depends on what was supposedly hidden, so the abstraction's
cost is paid and its benefit is absent.

**Detection** Imports of framework packages in a package whose stated purpose is
independence.

**Direction** Either express the concept in the abstraction's own terms, or delete the
abstraction and use the framework directly and honestly
(`layering-and-boundaries`).

**Acceptable when** the leak is deliberate, documented and bounded — a repository that
accepts your own `PageRequest` record is not leaking.

## Distributed monolith

**Symptoms** Services released in a fixed order; a feature spanning three repositories; a
shared DTO library upgraded in lockstep; integration testing requires everything running.

**Cause** Extraction on the wrong boundary, or without versioning the contracts.

**Possible consequences** Lost deployment independence plus network and operational costs.
Fault isolation and independent scaling are separate properties; check actual dependencies
and failure containment rather than inferring that all benefits are absent.

**Detection** Check representative releases and mixed-version contract tests. Distinguish
technical incompatibility from organizational release policy or a one-time migration.

**Direction** Address the demonstrated coupling: compatible evolution or a staged rollout
may preserve the boundary. Tolerate only changes the actual wire/business contract permits.
Compare consolidation when the retained benefits no longer justify the cost, including
data, consumer and rollback work (`distribution-boundaries`).

**Acceptable when** deliberate release coordination still meets the accepted goals and its
cost is justified by actual scaling, isolation or other benefits. A temporary extraction is
another case; check its migration milestones rather than assuming release policy is a defect.

## Persistence leakage

**Symptoms** `@Entity` types in controller signatures or API payloads; JPA annotations on a
"framework-free" domain class; a lazy initialisation error during serialisation; a column
rename breaking a client.

**Cause** The convenient path; no decision was made about what crosses the boundary.

**Possible consequences** Exposed entity fields couple persistence and API evolution;
lazy loading and unintended writable fields can reach the web boundary. Inspect actual
serialization/binding and column mappings before claiming that the schema is the contract.

**Detection**

```java
@ArchTest
static final ArchRule no_entities_in_web =
    noClasses().that().resideInAPackage("..web..")
        .should().dependOnClassesThat().areAnnotatedWith(Entity.class);
```

This partial ArchUnit policy needs the project's ArchUnit/JUnit setup and matching
`jakarta.persistence.Entity` or legacy `javax.persistence.Entity` import. It bans all direct
web dependencies on entity classes, which is broader than detecting wire exposure; adopt it
only for that intended boundary. It does not prove what reflection/serialization emits.

**Direction** Protect the actual wire/read/write contract and loading lifetime. Use
projections or DTOs when they isolate those responsibilities; materialize required lazy
state within its intended persistence lifecycle rather than during uncontrolled serialization
(`remote-facade-and-dto`).

**Acceptable when** the coupling is deliberate and bounded, with verified serialization,
input-binding, loading and compatibility policies. An internal admin tool is one example,
not the only possible exception; a published independence contract remains binding.

## Transaction boundary in the wrong place

**Symptoms** A use case with writes that commit separately despite an atomicity requirement;
remote work inside a long transaction; lazy database work during serialization. Annotation
location and Open Session In View are investigation prompts, not defects by themselves.

**Cause** The annotation applied where it was convenient rather than where the unit of work
is.

**Possible consequences** Partial writes or long connection occupancy. An open persistence
context does not itself prove a connection is held throughout serialization; inspect actual
acquisition/release, queries and transaction duration.

**Detection** `rg -n -g '*Controller.java' -g '*Repository.java' '@Transactional' src/main/java`
is a starting point; trace effective propagation, proxy calls, rollback rules and commit sites.

**Direction** Demarcate the required unit of work, often at the application service; verify
repository participation and failure behavior (`enterprise-transactions`).

**Acceptable when** a repository operation is the unit of work or needs explicit transaction
configuration. Spring Data JPA supplies defaults for inherited CRUD methods; declared query
methods do not automatically receive them. Repository annotations can establish a transaction
or specify policy and must not be deleted merely because there is one statement.

## Shared mutable session state

**Symptoms** `HttpSession` holding an object graph; sticky sessions required; a deploy logs
everyone out; two tabs corrupt a flow.

**Cause** State placed by default rather than by decision.

**Possible consequences** Local state without adequate recovery can tie work to an instance;
concurrent updates can corrupt one user's flow even when losing that state is acceptable.

**Detection** Identify attribute writers and overlapping requests for the same session,
including multiple tabs. Servlet 6.0 protects the container's session-attribute collection,
not concurrent access to mutable objects stored in it. Trace read-modify-write sequences;
replacing a value with an immutable object does not by itself prevent lost updates.

**Direction** Inventory and place each item (`session-state-strategies`); establish the
required update/conflict behavior for the actual session store. Check an overlapping-update
case and instance loss/recovery against that contract. Neither sticky routing nor moving
state to an external store establishes atomic application updates by itself.

**Acceptable when** the loss/recovery policy is acceptable and concurrent updates preserve
the required behavior. Small, transient state with deliberate sticky routing can qualify,
but size and affinity do not serialize requests.

## ORM-driven domain design

**Symptoms** A bidirectional association that no code traverses in one direction; an
inheritance strategy chosen for mapping convenience; a field that exists because a column
does; a no-arg constructor plus setters "for JPA" on a class that is supposed to protect
invariants.

**Cause** The mapping's convenience outranked the model's meaning.

**Consequences** The model no longer describes the business; a schema change is a domain
change.

**Detection** For each association, inspect application traversal and ORM ownership,
`mappedBy`, cascade/orphan behavior, queries and indirect consumers. No explicit call site
does not mean a mapping is unused. For each subtype, identify the domain distinction and
mapping contract (`inheritance-mapping-strategies`).

**Direction** Remove a direction only after preserving relationship writes, lifecycle and
caller contracts with relevant provider-backed checks. Revisit a hierarchy when its domain
meaning conflicts with its use; a separate model is conditional on real divergence
(`data-source-patterns`).

**Acceptable when** the chosen persistence mapping supports the intended domain or script
organization without breaking invariants. Required no-arg constructors, accessors or
associations are not defects solely because the ORM needs them.

## Chatty remote interface

**Symptoms** One screen, many calls; a call per row of a result; a client-side loop over
identifiers.

**Cause** A local interface exposed remotely.

**Possible consequences** Round-trip cost, fan-out tails and more failure opportunities.
Measure call topology, concurrency and correlated failures before quantifying the impact.

**Detection** Count calls per screen in a trace (`architecture-and-performance`).

**Direction** Coarsen to a facade operation per interaction
(`remote-facade-and-dto`).

**Acceptable when** the calls are genuinely independent, parallel and bounded — and the
bound is enforced.

## Sources for consequential findings

- [Fowler: Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html) — shared subtasks can remain procedures; duplicated logic does not mandate a domain model.
- [Jakarta Servlet 6.0, section 7.7.1](https://jakarta.ee/specifications/servlet/6.0/jakarta-servlet-spec-6.0.pdf) — container session-attribute collection safety and application responsibility for attribute-object access; check the target servlet/session implementation.
- [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2) — entity construction/access, relationship ownership and cascade/orphan semantics; inspect the project's actual provider and persistence version.
- [Spring Data JPA transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html) — verify against the project's release.
- [Spring AOP proxy semantics](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — inspect effective proxy configuration before extraction.
- [Git log](https://git-scm.com/docs/git-log) — history filters select commits, not business features.
