# Kinds of Enterprise Application

Classify by what dominates the work, not by the technology. Most real systems are two or
three of these, and the useful move is to split them internally rather than to average them
into one architecture.

## Transaction processing

**Character:** many short units of work, each changing a small amount of data, with rules to
enforce. Order entry, banking, ticketing, claims.

**Dominant forces:** business complexity, concurrency across user sessions, transaction
correctness.

**Follows:** Domain Model where rules interact; aggregates sized to the invariants;
optimistic offline locking; a service layer owning the transaction; a separate read model for
the screens.

**Characteristic failure:** the aggregate grows until writes serialise, or reads are routed
through it and the list screen is slow.

## Workflow / case management

**Character:** long-running processes with states, approvals, timeouts and human steps.
Onboarding, underwriting, procurement, support cases.

**Dominant forces:** process state that must survive everything, auditability, resumability.

**Follows:** an explicit state machine in the domain (which transitions are legal) and an
Application Controller only for the presentation flow; database-backed process state with an
expiry and a version; events at each transition; a defined resolution for a process stuck
between steps.

**Characteristic failure:** the process state lives in a session or is derived ad hoc, so a
deploy loses in-flight work and no two components agree on what state a case is in.

## Data-intensive / master data

**Character:** large volumes, complex queries, integrity constraints, retention rules.

**Dominant forces:** data complexity, query performance, schema evolution.

**Follows:** SQL owned by gateways; projections everywhere; careful indexing and pagination
(keyset for depth); explicit inheritance and mapping decisions; migrations as the schema's
source of truth.

**Characteristic failure:** a domain model applied to set-shaped work, loading hundreds of
thousands of objects to change a column.

## Integration hub

**Character:** the system's value is moving and translating data between systems it does not
own.

**Dominant forces:** foreign models, partial failure, delivery semantics, versioning.

**Follows:** a gateway per external system with error translation; anti-corruption layers so
foreign models stay out; idempotent handlers; an outbox for anything that must not be lost;
retries with backoff and a dead-letter path; contract tests against every partner.

**Characteristic failure:** a foreign system's model becomes the internal model, and every
subsequent change is dictated by a partner's release schedule.

## Reporting and analytics

**Character:** read-only, set-shaped, aggregation-heavy, latency-tolerant.

**Dominant forces:** query performance, isolation from the transactional path.

**Follows:** SQL, projections, a read replica or a separate schema; no entities, no
repositories, no domain model, no service layer.

**Characteristic failure:** reports run on the transactional connections and one heavy query
degrades the whole application; or the transactional architecture is applied for
"consistency", producing something slower and harder to maintain than the SQL.

## Batch

**Character:** scheduled, high-volume, restartable, with a completion window.

**Dominant forces:** throughput, restartability, bounded resource use.

**Follows:** chunked transactions with a durable cursor; idempotent chunks; bulk statements
with explicit version handling; the persistence context cleared per chunk; observable
progress; a defined intermediate state, because other readers will see the batch half
applied.

**Characteristic failure:** one transaction over the whole run — locks held all night, no
restart point, and a failure at 95% that must start again.

## Event-driven

**Character:** components react to facts rather than being called.

**Dominant forces:** delivery semantics, ordering, eventual consistency, observability.

**Follows:** events as facts in the producer's language; at-least-once with idempotent
consumers; an outbox at every producing boundary; consumer lag alerting; a replay procedure;
end-to-end correlation, because no single component owns the outcome.

**Characteristic failure:** nobody notices when a consumer silently stops, because no
component is responsible for the end-to-end effect.

## Systems that are several of these

Almost all of them. The useful response is to split internally rather than to average:

```text
One application:
    order entry            → transactional        (domain model, aggregates)
    nightly re-rating      → batch                (chunked SQL, versions handled)
    partner feed           → integration          (gateway + ACL + outbox)
    management reports     → reporting            (SQL over a replica)
    admin reference data   → CRUD                 (Active Record)
```

Five different internal architectures in one deployable is not inconsistency; it is each part
answering its own forces. What must stay uniform is the cross-cutting set: one error shape,
one transaction-boundary layer, one set of boundary rules, one logging and correlation
convention (`pattern-selection-and-composition`).

## Reading a system's kind from evidence

| Observation                                                  | Likely character                            |
| ------------------------------------------------------------ | ------------------------------------------- |
| Most traffic is short writes with validation                 | Transaction processing                      |
| Tables holding a status and a history of transitions         | Workflow                                    |
| The largest tables dwarf all others; many indexes            | Data-intensive                              |
| Many outbound clients, many scheduled polls                  | Integration                                 |
| Long-running queries with `GROUP BY` at peak                 | Reporting mixed into the transactional path |
| A scheduler with jobs measured in hours                      | Batch                                       |
| A broker with several consumer groups                        | Event-driven                                |
| All of the above in one deployable, one architecture applied | The split above has not been made           |

The last row is the common finding, and it is the highest-value observation in an initial
architecture review: the pain is usually concentrated where one part's architecture has been
imposed on another part's forces.
