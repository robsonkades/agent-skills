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
          └── Outbox / event           published after commit
      └── Response record            projection or mapped from the aggregate
```

**Consequences, stated concretely:** a write costs the aggregate's load (a fixed, small
number of queries); invariants cannot be bypassed by any path that goes through the
repository; bulk work must be explicit and must handle versions; and **reads must not use
this path** — a list screen through the aggregate is the N+1 this composition is famous for.

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

**Where it fails:** when rules start depending on each other. The signal is textual, and it
is measurable: the same business term implemented in three files.

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

**Consequences:** one round trip per client interaction; the wire contract evolves
independently of the model; retries are safe; and the facade holds no rules, so a job or a
consumer can invoke the same use case.

**Where it fails:** a facade that forwards call-for-call to fine-grained services — the
chattiness moved inside and the latency is unchanged.

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
costs one query and hydrates nothing it will not send; the two evolve independently. This is
two interfaces over one database — no event sourcing, no separate store, no eventual
consistency.

**Where it fails:** treating it as a licence to write through the read path. The read side
is read-only, and enforcing that (no entities, no repository) is what keeps it simple.

**When to go further** — a separate read store, maintained asynchronously — is a much bigger
decision, and its driver is a read load or a query shape the write store genuinely cannot
serve. It buys that, and costs eventual consistency, a projection pipeline to operate, and a
rebuild procedure (`consistency-models`).

## The relationship graph

Which pattern implies, enables or conflicts with which. Read `→` as "implies or strongly
suggests".

```text
Domain Model
  → Data Mapper (or Active Record if shape matches)
  → Unit of Work            (the ORM's persistence context)
  → Identity Map            (the ORM's first-level cache)
  → Lazy Load               (a decision per use case, not a default)
  → Repository              (one per aggregate root)
  → Service Layer           (for the transaction boundary)
  → Coarse-Grained Lock     (versioning at the aggregate)
  ↛ conflicts with per-table repositories, row-returning repositories,
    reads routed through the aggregate

Transaction Script
  → Table Data Gateway / Row Data Gateway
  → Service Layer           (only when a use case writes twice)
  ↛ conflicts with a half-built domain model (two homes for a rule)

Table Module
  → set-based SQL
  → bypasses the domain model's invariants and version columns
    (must be named and bounded)

Data Mapper
  → Unit of Work, Identity Map, Lazy Load
  → Metadata Mapping        (annotations or external)
  → Query Object            (for composition beyond derived methods)

Active Record
  → Identity Field
  → simplest transaction boundary
  ↛ conflicts with a divergent domain model, a foreign-owned schema,
    and with using the same type as the API payload

Repository
  → Aggregate boundary      (without one, it is a DAO)
  → Query Object            (for the criteria it exposes)
  → a separate read model   (for everything it should not serve)

Remote Facade
  → DTO                     (always)
  → Idempotency             (writes, because clients retry)
  → Gateway                 (on the calling side)
  ↛ conflicts with fine-grained services behind it

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
  → saga or outbox          (atomicity is gone)
  ↛ conflicts with a shared database, shared DTO libraries, and
    synchronous chains three or more hops deep
```

## Using the graph

Two ways, both cheap:

**Forward** — having chosen a pattern, check that its implications are present. A Domain
Model with no Service Layer and no aggregate-level versioning has two implications
unfulfilled; each is a question, not necessarily a defect.

**Backward** — seeing a pattern in code, check that its prerequisites are present. A
Repository with no aggregate is a DAO; a Remote Facade with no DTO is leaking the model; an
Optimistic Offline Lock with no conflict handling is a version column that produces 500s.

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
