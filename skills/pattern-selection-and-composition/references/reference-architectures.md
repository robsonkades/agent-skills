# Reference Architectures and the Relationship Graph

These are conceptual compositions, not mandatory stacks or executable configurations.
Select the relevant path and preserve an adequate existing owner/contract. Inspect the
target Java, framework, persistence and protocol versions before implementing a mechanism.
Where a diagram says response record, an ordinary immutable DTO class can serve the same
boundary on older Java; [records became a standard feature in Java 16](https://openjdk.org/jeps/395).

## Composition 1 — rich domain, one process

This variant includes an outbox because asynchronous publication must survive a process
failure after commit. Omit that machinery when the required contract is already met or
events are only local synchronous calls whose effects share the transaction.

```text
HTTP request
  └── Controller                     bind, validate syntax, map
      └── Application service        TRANSACTION starts; authorisation
          ├── Repository (aggregate) load whole aggregate
          │     └── Data Mapper / JPA  Unit of Work + Identity Map + Lazy Load
          ├── Domain Model             rules and invariants; state transition
          ├── Repository.save          (usually implicit: dirty checking)
          └── Outbox row               written with business state in SAME transaction
                └── Relay             publishes committed rows; may publish again after failure
                      └── Consumer    repeat-safe effects or authoritative deduplication
      └── Response record            projection or mapped from the aggregate
```

**Consequences:** aggregate fetch cost depends on graph size and fetch plan. Repository access
alone does not enforce rules: mutation paths must invoke domain behavior and coordinate
concurrent changes. Bulk work must preserve required invariants and versions. Reuse this
read path when its graph/cost fits; use projections when it loads unnecessary state.
An after-commit callback alone is not a durable outbox: a crash before publish can lose the event.

The outbox transaction covers business state and publication intent, not broker acceptance
and consumer effects. If the relay crashes after the broker accepts a message but before
recording success, recovery can publish it again. Preserve stable message identity and make
consumer effects repeat-safe; when deduplication is needed, coordinate its record atomically
with the effects it protects. A consumer's local database record does not atomically cover
an external payment or other remote effect; use that system's retry/reconciliation contract
(`idempotency`). Verify both the lost-publication window and duplicate-delivery window;
the relay's retry loop alone does not close the latter.

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

Durable event publication can add the same outbox/relay/consumer composition described above
without changing the logic organisation into a Domain Model.

**Where it fails:** when interacting rules become hard to maintain. The signal is semantic:
the same decision duplicated with divergent behavior or costly coordinated edits,
not simply a business term appearing in three files.

## Composition 3 — remote API over an application

```text
Client
  └── Remote Facade                  one coarse operation per interaction
      ├── DTO in                     validated, versioned, tolerant
      ├── Retry contract             repeat-safe effects or authoritative deduplication
      ├── Application service        orchestration; transaction where required
      │     └── Domain / scripts
      └── DTO out                    materialize required state before its context closes
```

**Consequences:** fewer required client round trips; the wire contract can evolve
separately from the model. Safe retries require atomic deduplication relative to effects,
stable operation identity and defined replay/retention when effects are not already repeat-safe;
a key and separate cache alone are
insufficient, especially when the existing system is remote. The facade holds no domain rules, so a job or a
consumer can invoke the same use case.
Pure response mapping can happen after state is materialized; a remote facade does not
by itself require a local database transaction or holding one across the remote call.

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
needs enforceable write restrictions and actor/tenant/field authorization. A projection or
query repository can be suitable; having no entity or repository types does not prevent
raw SQL writes or unauthorized reads. Check actual capabilities and affected bypass paths.

**When to go further** — a separate read store, maintained asynchronously — is a much bigger
decision. Read load, query shape, workload isolation or independently owned access/lifecycle
requirements may justify it; the primary need not be incapable of running the query.
Compare the actual benefit with asynchronous lag and its freshness/consistency contract,
a projection pipeline to operate, and a rebuild procedure (`consistency-models`).

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
  ↛ duplicated ownership of a rule or bypassed model invariants;
    scripts invoking the rule owner and separate simple operations can coexist

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
  ↛ investigate coupling when domain/schema semantics diverge or the type leaks into the API;
    an independently justified boundary adapter is compatible

Repository
  → collection-like domain-object access
  → aggregate-root boundary when adopting DDD aggregates
  → Query Object            (for the criteria it exposes)
  → a separate read model   (for everything it should not serve)

Remote Facade
  → explicit wire contract  (DTO, generated schema type or an adequate existing boundary type)
  → Idempotency             (assess intended effects; keys are one mechanism)
  → Gateway                 (on the calling side)
  ↛ remote chattiness left in the operation; local fine-grained calls are compatible

Optimistic Offline Lock
  → stable target identity and atomic expected-state validation
                            (version/revision or adequate original-value comparison)
  → Coarse-Grained Lock     (when the invariant requires coordinated validation)
  → a conflict experience   (the half that gets skipped)
  ↛ relevant writers bypassing the chosen conflict protocol

Pessimistic Offline Lock
  → authoritative ownership, stale-owner rejection and abandonment recovery
  → lease expiry/renewal OR durable checkout with explicit release and audited recovery
  ↛ expiry without preventing stale owners from writing; database transactions held
    across thinking time retain resources and need a separate bounded justification

Front Controller
  → Page Controllers behind it
  → Application Controller  (only for state-dependent flows)
  → error shape governed by the public protocol/compatibility contract

Distribution
  → explicit communication contract: coarse RPC/wire types, events or another justified form
  → assess repeat safety, deadlines and failure isolation for the actual interaction;
    retries and circuit breaking are conditional choices
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
Optimistic Offline Lock with no conflict handling turns a detected conflict into an unusable failure.

For aggregate versioning, verify every relevant child mutation participates in the root's
conflict protocol; placing `@Version` only on the root does not establish that automatically.
Inspect the ORM version/mapping and test two concurrent edits. These are conceptual Java
compositions, not executable configurations or permission to upgrade the project's stack.

Primary definitions: [Remote Facade](https://martinfowler.com/eaaCatalog/remoteFacade.html),
[Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html),
[Active Record](https://martinfowler.com/eaaCatalog/activeRecord.html), and
[Repository](https://martinfowler.com/eaaCatalog/repository.html), plus
[Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) and
[Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
for publication retries and consumer effect responsibility.
The [optimistic](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html) and
[pessimistic](https://martinfowler.com/eaaCatalog/pessimisticOfflineLock.html) offline-lock
definitions describe coordination responsibilities; expiry and a version column are
implementation choices. [Authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
supports least privilege and checks on every access path, independently of pattern names.

## Explaining an existing architecture

For a broad explanation of a system you did not design, inspect the relevant items below;
a narrow composition question needs only the affected contracts:

1. Name the logic organisation per module (script, model, table module).
2. Name the data-source pattern and who owns the schema.
3. Name where the transaction boundary is, in practice, not by annotation.
4. Name the aggregates, if any, and their actual conflict protocol.
5. Name the read paths and whether they go through the write model.
6. Name every boundary and what crosses it.
7. Name the compositions that conflict, from the list in the skill body.

Use the evidence to identify a real conflict, a consequential unknown or an adequate design;
an absent pattern is not by itself a finding (`enterprise-architecture-smells`).
