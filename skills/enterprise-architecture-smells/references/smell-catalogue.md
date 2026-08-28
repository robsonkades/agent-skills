# Smell Catalogue

Each entry: symptoms · cause · consequences · detection · direction · when it is acceptable.

## Anaemic domain model

**Symptoms** Entities with public getters and setters and no methods; services containing
`if` statements about entity state; the same validation in several services.

**Cause** A domain model was chosen (usually because JPA entities exist) but the rules were
written where the repositories and the transaction are.

**Consequences** Every rule can be bypassed by any new code path; rules duplicate and
diverge; the mapping layer's cost is paid without its benefit.

**Detection**

```bash
# Public setters on entities — each is a hole in an invariant.
grep -rn "public void set" src/main/java --include="*.java" \
  | grep -f <(grep -rl "@Entity" src/main/java | xargs -n1 basename | sed 's/.java//')
```

**Direction** Move one rule at a time into the entity; delete the setter it used; let the
compiler find the other callers (`architecture-refactoring-paths`).

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

Many authors and unrelated subjects is the confirmation; size alone is not.

**Direction** Split by use case first (mechanical, safe), then push rules into the domain
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
distinct implementations. Three or more is evidence.

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

**Direction** Delete the generic layer; per-aggregate interfaces with the methods actually
used (`repository-pattern`).

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
# Files touched per feature commit, last 20 features.
git log --format='%h %s' --no-merges -20 --grep='feat' \
  | while read -r sha _; do echo "$(git show --name-only --format= "$sha" | wc -l) $sha"; done
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

**Consequences** The costs of distribution with none of the benefits: no independent
deployment, no fault isolation, plus network failure modes.

**Detection** Ask which services can be deployed alone, today, and check the last release.

**Direction** Version the contracts and make them tolerant, or merge the services back.
Merging back is unpopular and frequently correct (`distribution-boundaries`).

**Acceptable when** it is a deliberate, temporary stage of an in-progress extraction with a
stated end date.

## Persistence leakage

**Symptoms** `@Entity` types in controller signatures or API payloads; JPA annotations on a
"framework-free" domain class; a lazy initialisation error during serialisation; a column
rename breaking a client.

**Cause** The convenient path; no decision was made about what crosses the boundary.

**Consequences** The schema is the public contract; ORM behaviour reaches the web layer; the
model is shaped by what maps well.

**Detection**

```java
@ArchTest
static final ArchRule no_entities_in_web =
    noClasses().that().resideInAPackage("..web..")
        .should().dependOnClassesThat().areAnnotatedWith(Entity.class);
```

**Direction** Projections for reads, DTOs at boundaries, assembled inside the transaction
(`remote-facade-and-dto`).

**Acceptable when** an internal admin tool deliberately trades coupling for speed, recorded
as a decision with a boundary around it.

## Transaction boundary in the wrong place

**Symptoms** `@Transactional` on a controller or a repository; a use case with two writes
that can half-fail; a remote call inside a transaction; Open Session In View enabled.

**Cause** The annotation applied where it was convenient rather than where the unit of work
is.

**Consequences** Partial writes; connections held through serialisation; pool exhaustion
under a downstream slowdown.

**Detection** `grep -rn "@Transactional" --include="*Controller.java" --include="*Repository.java"`

**Direction** One demarcation, at the application service (`enterprise-transactions`).

**Acceptable when** a single-statement repository method is genuinely the whole unit of work
— and even then the annotation adds nothing.

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

**Consequences** Latency dominated by round trips; tail latency compounding; failure
probability multiplying.

**Detection** Count calls per screen in a trace (`architecture-and-performance`).

**Direction** Coarsen to a facade operation per interaction
(`remote-facade-and-dto`).

**Acceptable when** the calls are genuinely independent, parallel and bounded — and the
bound is enforced.
