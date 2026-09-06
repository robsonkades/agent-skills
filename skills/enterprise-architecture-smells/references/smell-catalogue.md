# Smell Catalogue

Each entry: symptoms · cause · consequences · detection · direction · when it is acceptable.

## Anaemic domain model

**Symptoms** Entities with public getters and setters and no methods; services containing
`if` statements about entity state; the same validation in several services.

**Possible cause** A domain model was intended, but rules were placed beside repositories
and transaction orchestration. JPA entities alone do not establish that architectural choice.

**Consequences** Every rule can be bypassed by any new code path; rules duplicate and
diverge; the mapping layer's cost is paid without its benefit.

**Detection**

```bash
# Candidate files only; inspect annotations, setters and actual invariant paths.
rg -n -g '*.java' '@Entity|public\s+void\s+set' src/main/java
```

**Direction** Encapsulate one bypassable rule in the appropriate domain type. Check ORM access
mode, serializers and reflective callers before removing a setter; compilation does not
find those consumers (`architecture-refactoring-paths`).

**Acceptable when** the design is Transaction Script plus a gateway. Then entities _are_ row
objects and behaviourless is correct — but call them row objects, not a domain model
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
proxy entry points and behavior tests; extraction is not automatically safe. Move rules into the domain
(`service-layer-design`).

**Acceptable when** the class is genuinely one cohesive responsibility that happens to be
large, and its history shows one reason to change.

## Transaction script sprawl

**Symptoms** The same business rule implemented in four scripts, slightly differently;
`copy-paste` lineage visible in the code.

**Cause** Transaction Script applied to rules that interact — the condition under which the
pattern stops being cheaper.

**Consequences** Rules diverge silently; a fix lands in three of the four sites.

**Detection** Search for a business term (`discount`, `surcharge`, `eligib`) and count the
distinct implementations. Check whether they implement the same rule/version and should
change together; even two divergent implementations can matter, while similar checks may not.

**Direction** Extract the interacting rules into a domain type used by every script; convert
the module to a domain model only if the extraction proves insufficient.

**Acceptable when** the rules genuinely do not interact and the similarity is coincidental —
two operations that both check a date are not duplication.

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

**Direction** Version the contracts and make them tolerant, or merge the services back.
Merging back is unpopular and frequently correct (`distribution-boundaries`).

**Acceptable when** it is a deliberate, temporary stage of an in-progress extraction with a
stated end date.

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

**Direction** Projections for reads, DTOs at boundaries, assembled inside the transaction
(`remote-facade-and-dto`).

**Acceptable when** an internal admin tool deliberately trades coupling for speed, recorded
as a decision with a boundary around it.

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

**Consequences** Instances are not disposable; deploys lose work; concurrency bugs within
one user.

**Direction** Inventory and place each item (`session-state-strategies`).

**Acceptable when** the state is small, transient and cheap to lose, and sticky routing is a
recorded decision.

## ORM-driven domain design

**Symptoms** A bidirectional association that no code traverses in one direction; an
inheritance strategy chosen for mapping convenience; a field that exists because a column
does; a no-arg constructor plus setters "for JPA" on a class that is supposed to protect
invariants.

**Cause** The mapping's convenience outranked the model's meaning.

**Consequences** The model no longer describes the business; a schema change is a domain
change.

**Detection** For each association, find the code that traverses it in each direction; for
each subtype, name the behaviour that differs (`inheritance-mapping-strategies`).

**Direction** Remove unused directions; re-derive the hierarchy from behaviour; consider a
separate domain model where the divergence is real (`data-source-patterns`).

**Acceptable when** the design is deliberately Active Record — the entity _is_ the row, and
that is recorded as the choice.

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

## Sources for framework-sensitive findings

- [Spring Data JPA transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html) — verify against the project's release.
- [Spring AOP proxy semantics](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — inspect effective proxy configuration before extraction.
- [Git log](https://git-scm.com/docs/git-log) — history filters select commits, not business features.
