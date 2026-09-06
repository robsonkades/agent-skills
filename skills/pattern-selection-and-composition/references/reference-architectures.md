# Reference Architectures and the Relationship Graph

## Composition 1 — rich domain, one process

```text
HTTP request
  └── Controller                     bind, validate syntax, map
      └── Application service        TRANSACTION starts; authorisation
          ├── Repository (aggregate) load whole aggregate
          │     └── Data Mapper / JPA  Unit of Work + Identity Map + Lazy Load
          ├── Domain Model             rules and invariants; state transition
          ├── Repository.save          (usually implicit: dirty checking)
          └── Outbox row               written with business state in SAME transaction
                └── Relay             publishes committed rows; retries/deduplication
      └── Response record            projection or mapped from the aggregate
```

**Consequences:** aggregate fetch cost depends on graph size and fetch plan. Repository access
alone does not enforce rules: mutation paths must invoke domain behavior and coordinate
concurrent changes. Bulk work must preserve required invariants and versions. Reuse this
read path when its graph/cost fits; use projections when it loads unnecessary state.
An after-commit callback alone is not a durable outbox: a crash before publish can lose the event.

**Where it fails:** unbounded aggregates; rules that leaked into the service; reads forced
through the write model.

## Composition 2 — transaction script

```text
HTTP request
  └── Controller
      └── Transaction Script         TRANSACTION; steps; the rules are here
          └── Table Data Gateway     SQL per table; rows in, rows out
              └── Database
```

**Consequences:** fewest moving parts; the SQL is visible and tunable; no ORM behaviour to
reason about; and duplication is the failure mode — the same rule in several scripts,
diverging.

**Where it fails:** when interacting rules become hard to maintain. The signal is semantic:
the same decision duplicated with divergent behavior or costly coordinated edits,
not simply a business term appearing in three files.

## Composition 3 — remote API over an application

```text
Client
  └── Remote Facade                  one coarse operation per interaction
      ├── DTO in                     validated, versioned, tolerant
      ├── Idempotency                key → dedup store, replay the response
      ├── Application service        TRANSACTION; orchestration
      │     └── Domain / scripts
      └── DTO out                    assembled INSIDE the transaction
```

**Consequences:** fewer required client round trips; the wire contract can evolve
separately from the model. Safe retries require atomic deduplication relative to effects,
stable operation identity and defined replay/retention; a key and separate cache alone are
insufficient, especially when the existing system is remote. The facade holds no domain rules, so a job or a
consumer can invoke the same use case.

**Where it fails:** leaving fine-grained remote calls in the client interaction or behind
the facade can retain network cost. Fine-grained local calls are a valid implementation;
measure the actual hop topology before asserting unchanged latency.

## Composition 4 — read/write split (no CQRS infrastructure)

```text
WRITE                                READ
Controller                           Controller
  └── Application service              └── Query object / projection
      └── Repository (aggregate)            └── SQL / JPQL constructor expression
          └── Domain Model                      └── Database (or a replica)
              └── Database
```

**Consequences:** the write path keeps its invariants and its aggregate cost; the read path
can use a tailored projection with a measured query budget; both still share schema and
database constraints. Two interfaces over the primary do not require eventual consistency,
but a read replica may lag. State the freshness/isolation contract rather than infer it
from the absence of a projection pipeline.

**Where it fails:** treating it as a licence to write through the read path. The read side
is read-only, and enforcing that (no entities, no repository) is what keeps it simple.

**When to go further** — a separate read store, maintained asynchronously — is a much bigger
decision, and its driver is a read load or a query shape the write store genuinely cannot
serve. It buys that, and costs eventual consistency, a projection pipeline to operate, and a
rebuild procedure (`consistency-models`).

## The relationship graph

Common collaborators and tensions, not logical implications. Read `→` as "consider when
the named force applies"; optional mechanisms must still earn their cost.

```text
Domain Model
  → Data Mapper (or Active Record if shape matches)
  → Unit of Work            (when tracked persistence fits)
  → Identity Map            (when managed identity is needed)
  → Lazy Load               (a decision per use case, not a default)
  → Repository              (per aggregate root when adopting DDD aggregates)
  → Service Layer           (for the transaction boundary)
  → Coarse-Grained Lock     (versioning at the aggregate)
  ↛ write paths through table/row APIs that bypass invariant enforcement;
    read projections and persistence-internal row mappings are compatible

Transaction Script
  → Table Data Gateway / Row Data Gateway
  → Service Layer           (transaction/policy/orchestration or stable caller boundary)
  ↛ conflicts with a half-built domain model (two homes for a rule)

Table Module
  → set-based SQL
  → explicit set-level invariants and version/conflict handling

Data Mapper
  → optional Unit of Work, Identity Map, Lazy Load (common ORM mechanisms)
  → Metadata Mapping        (annotations or external)
  → Query Object            (for composition beyond derived methods)

Active Record
  → Identity Field
  → simplest transaction boundary
  ↛ conflicts with a divergent domain model, a foreign-owned schema,
    and with using the same type as the API payload

Repository
  → collection-like domain-object access
  → aggregate-root boundary when adopting DDD aggregates
  → Query Object            (for the criteria it exposes)
  → a separate read model   (for everything it should not serve)

Remote Facade
  → DTO                     (always)
  → Idempotency             (writes, because clients retry)
  → Gateway                 (on the calling side)
  ↛ remote chattiness left in the operation; local fine-grained calls are compatible

Optimistic Offline Lock
  → Identity Field, version column
  → Coarse-Grained Lock     (usually, at the aggregate)
  → a conflict experience   (the half that gets skipped)
  ↛ conflicts with bulk updates that do not increment the version

Pessimistic Offline Lock
  → a lock record with owner, acquisition time, EXPIRY, override
  ↛ conflicts with holding a database transaction across requests

Front Controller
  → Page Controllers behind it
  → Application Controller  (only for state-dependent flows)
  → one error shape

Distribution
  → Remote Facade + DTO
  → Idempotency, timeouts, retries, circuit breaking
  → assess cross-resource atomicity; saga/outbox only for the actual coordination need
  ↛ shared database/schema or DTO release coupling; synchronous chains exceeding
    measured latency/availability budgets (no universal hop-count threshold)
```

## Using the graph

Two ways, both cheap:

**Forward** — having chosen a pattern, inspect the relevant collaborators. For a Domain
Model without a Service Layer or aggregate versioning, identify who owns use-case policy
and concurrency instead; those named mechanisms are not mandatory.

**Backward** — seeing a pattern in code, check that its prerequisites are present. A
Repository should provide collection-like domain access; check aggregate-root boundaries
when the model uses DDD aggregates. A Remote Facade with no explicit wire contract risks model leakage; an
Optimistic Offline Lock with no conflict handling is a version column that produces 500s.

For aggregate versioning, verify every relevant child mutation participates in the root's
conflict protocol; placing `@Version` only on the root does not establish that automatically.
Inspect the ORM version/mapping and test two concurrent edits. These are conceptual Java
compositions, not executable configurations or permission to upgrade the project's stack.

Primary definitions: [Remote Facade](https://martinfowler.com/eaaCatalog/remoteFacade.html),
[Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html),
[Active Record](https://martinfowler.com/eaaCatalog/activeRecord.html), and
[Repository](https://martinfowler.com/eaaCatalog/repository.html), plus
[Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html).

## Explaining an existing architecture

To describe a system you did not design, in a form others can act on:

1. Name the logic organisation per module (script, model, table module).
2. Name the data-source pattern and who owns the schema.
3. Name where the transaction boundary is, in practice, not by annotation.
4. Name the aggregates, if any, and what versioning they have.
5. Name the read paths and whether they go through the write model.
6. Name every boundary and what crosses it.
7. Name the compositions that conflict, from the list in the skill body.

Seven answers describe an enterprise application well enough to reason about, and the gaps in
them are usually the findings (`enterprise-architecture-smells`).
