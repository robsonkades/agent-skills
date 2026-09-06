# Kinds of Enterprise Application

Classify by what dominates the work, not by the technology. Most real systems are two or
three of these. Treat the following as candidate choices, then test them against invariants,
workload and ownership. Split internal responsibilities where their forces differ materially;
a category alone does not justify a separate model, service or deployment.

## Transaction processing

**Character:** many short units of work, each changing a small amount of data, with rules to
enforce. Order entry, banking, ticketing, claims.

**Dominant forces:** business complexity, concurrency across user sessions, transaction
correctness.

**Follows:** Domain Model where rules interact; aggregates sized to the invariants;
an explicit concurrent-edit policy; a service layer owning the transaction. Consider optimistic
offline locking for user think-time conflicts and read projections when query shape warrants
them; neither a separate read store nor a Domain Model is mandatory for simple CRUD.

**Characteristic failure:** the aggregate grows until writes serialise, or reads are routed
through it and the list screen is slow.

## Workflow / case management

**Character:** long-running processes with states, approvals, timeouts and human steps.
Onboarding, underwriting, procurement, support cases.

**Dominant forces:** process state that must survive everything, auditability, resumability.

**Follows:** an explicit state machine in the domain (which transitions are legal) and an
Application Controller only for the presentation flow; database-backed process state with a
version and a deliberate retention/expiry policy; publish transitions when consumers require
them; a defined resolution for a process stuck between steps. Expiring a session must not
delete business process state needed for recovery or audit.

**Characteristic failure:** the process state lives in a session or is derived ad hoc, so a
deploy loses in-flight work and no two components agree on what state a case is in.

## Data-intensive / master data

**Character:** large volumes, complex queries, integrity constraints, retention rules.

**Dominant forces:** data complexity, query performance, schema evolution.

**Follows:** SQL owned by gateways; projections for query-shaped work; careful indexing and pagination
(keyset for depth); explicit inheritance and mapping decisions; migrations as the schema's
source of truth.

**Characteristic failure:** a domain model applied to set-shaped work, loading hundreds of
thousands of objects to change a column.

## Integration hub

**Character:** the system's value is moving and translating data between systems it does not
own.

**Dominant forces:** foreign models, partial failure, delivery semantics, versioning.

**Follows:** a gateway per external system with error translation; anti-corruption layers so
foreign models stay out where translation protects internal semantics; idempotent handlers;
an outbox when local state and a publication intent must commit together. A relay still needs
recovery/monitoring and consumers must handle duplicates. Retry only eligible failures with
bounds/backoff and a defined terminal recovery path; validate partner contracts where accessible.

**Characteristic failure:** a foreign system's model becomes the internal model, and every
subsequent change is dictated by a partner's release schedule.

## Reporting and analytics

**Character:** predominantly read-only, set-shaped and aggregation-heavy; freshness and latency
requirements vary, especially for operational reports.

**Dominant forces:** query performance, isolation from the transactional path.

**Follows:** SQL and projections; assess a read replica or separate store against freshness,
snapshot consistency and resource isolation requirements. A separate schema alone does not
isolate database CPU/I/O. Avoid needless aggregate hydration; a service layer can still own
authorization, orchestration or a consistent reporting transaction.

**Characteristic failure:** reports run on the transactional connections and one heavy query
degrades the whole application; or the transactional architecture is applied for
"consistency", producing something slower and harder to maintain than the SQL.

## Batch

**Character:** scheduled, high-volume, restartable, with a completion window.

**Dominant forces:** throughput, restartability, bounded resource use.

**Follows:** bounded chunks with restart checkpoints consistent with committed effects (atomic
where supported, otherwise a tested replay/deduplication protocol); stable input selection;
bulk statements with explicit version handling. Flush intended ORM writes before clearing a
context, and test rollback/restart. Define intermediate visibility: direct chunk commits can
expose partial work; staging plus controlled publication can provide whole-run visibility
when required. Measure completion time and resource bounds.

**Characteristic failure:** one transaction over the whole run — locks held all night, no
restart point, and a failure at 95% that must start again.

## Event-driven

**Character:** components react to facts rather than being called.

**Dominant forces:** delivery semantics, ordering, eventual consistency, observability.

**Follows:** events as facts in the producer's language; at-least-once with idempotent
consumers where duplicates are possible; an outbox for the local-state/publication dual-write
problem, or a suitable atomic log/transaction mechanism. Define ordering scope, consumer lag
alerting and safe replay. Assign an owner and completion signal for the end-to-end outcome;
distributed execution does not remove business or operational ownership.

**Characteristic failure:** nobody notices when a consumer silently stops, because no
component is responsible for the end-to-end effect.

## Systems that are several of these

Often several coexist. One possible internal arrangement, subject to the conditions above:

```text
One application:
    order entry            → transactional        (domain model, aggregates)
    nightly re-rating      → batch                (chunked SQL, versions handled)
    partner feed           → integration          (gateway + ACL + outbox)
    management reports     → reporting            (SQL over a replica)
    admin reference data   → CRUD                 (Active Record)
```

Five different internal architectures in one deployable is not inconsistency; it is each part
answering its own forces. Agree cross-cutting contracts for errors, transaction ownership,
boundary rules and logging/correlation; adapt their representation to each interface rather
than requiring batch checkpoints and web requests to share one transaction mechanism
(`pattern-selection-and-composition`).

## Reading a system's kind from evidence

| Observation                                                  | Likely character                                          |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Most traffic is short writes with validation                 | Transaction processing                                    |
| Tables holding a status and a history of transitions         | Workflow                                                  |
| The largest tables dwarf all others; many indexes            | Data-intensive                                            |
| Many outbound clients, many scheduled polls                  | Integration                                               |
| Long-running queries with `GROUP BY` at peak                 | Reporting mixed into the transactional path               |
| A scheduler with jobs measured in hours                      | Batch                                                     |
| A broker with several consumer groups                        | Event-driven                                              |
| All of the above in one deployable, one architecture applied | Investigate whether uniformity causes measurable friction |

These are routing hypotheses, not diagnoses. Confirm them with a representative use case,
transaction/query trace and change or incident history before proposing restructuring.

## Sources

- [Fowler: CQRS](https://martinfowler.com/bliki/CQRS.html): separate read/write models have application-specific benefits and complexity.
- [Richardson: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html): atomic local state/publication intent and duplicate relay delivery.
- [Spring Batch: Chunk-oriented Processing](https://docs.spring.io/spring-batch/reference/step/chunk-oriented-processing.html): writes and commits at the chunk transaction boundary; consult the project's release for implementation details.
