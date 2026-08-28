# Selection Criteria

## The nine inputs as answerable questions

| Input                   | Question with an observable answer                                                | What it decides                         |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| Business complexity     | How many rules are **conditional on other rules**? (Count them, do not estimate.) | Transaction Script vs Domain Model      |
| Data complexity         | How many concepts span several tables, or share one? Who may change the schema?   | Active Record vs Data Mapper            |
| Work shape              | Are the decisions per instance, or over sets of rows?                             | Domain Model vs Table Module / SQL      |
| Concurrency             | Do conflicts occur inside a transaction, or across a user's thinking time?        | Row locking vs offline locking          |
| Transaction scope       | Does a use case write more than once? Does it cross a process boundary?           | Whether a Service Layer is needed; saga |
| Distribution            | What is the **named driver** for a process boundary?                              | Module vs service; Remote Facade + DTO  |
| Performance             | What is the round-trip budget per operation? How asymmetric are reads and writes? | Read model; fetch strategy; caching     |
| Team and lifespan       | Who maintains this, how many people, for how long?                                | How much indirection is affordable      |
| Operational constraints | Deploy cadence, ownership boundaries, regulation                                  | Boundaries and their enforcement        |

The first is the one most often answered by assertion. "The domain is complex" is not an
answer; "seven pricing rules, four of them conditional on the outcome of another" is, and it
points directly at a Domain Model. Two independent validations point just as directly at a
Transaction Script.

## Four worked selections

### A. Internal CRUD administration for reference data

```text
Business complexity   2 validations, no interaction
Data complexity       entity = table; we own the schema
Work shape            per instance
Concurrency           two admins, rarely the same row
Transaction scope     one write
Distribution          none
Performance           irrelevant volumes
Team                  one team, long-lived, small

→ Active Record (JPA entity with its validations)
→ Spring Data repository used directly — no hand-written interface
→ No service layer (nothing to orchestrate)
→ No DTO internally; a response record at the HTTP boundary
→ @Version, because two admins exist and it costs one column
```

The temptation is to apply the house layered architecture. It would add four files per
concept and protect nothing. Record the choice so the next person does not "fix" it.

### B. Order management with pricing rules

```text
Business complexity   7 pricing rules, 4 conditional; status transitions
Data complexity       order spans 3 tables; we own the schema
Work shape            per instance for writes; set-shaped for the nightly re-rate
Concurrency           users edit an order over minutes
Transaction scope     order + lines + an event
Distribution          none today; inventory may be extracted later
Performance           list screen shows 25 orders, 6 columns; budget 200 ms
Team                  two teams, long-lived

→ Domain Model: Order aggregate with lines; rules on the objects
→ Data Mapper via JPA (entities are the persistence model, annotated)
→ One repository for the Order aggregate; none for OrderLine
→ Service Layer: one use case per operation, transaction demarcated there
→ Optimistic Offline Lock, coarse-grained on the Order root
→ READ MODEL: projections for the list and detail screens
→ Table Module / SQL gateway for the nightly re-rate
→ Outbox for the OrderPlaced event
→ Module boundary around inventory; no service yet
```

Note the two that are usually missing from a design like this: the read model, and the
explicit SQL for the bulk path. Without them, the list screen becomes an N+1 and the nightly
job loads 400 000 aggregates.

### C. Public API over an existing system

```text
Business complexity   low in the API; the logic is in the existing system
Data complexity       legacy schema, owned by another team, will not change
Work shape            request/response
Concurrency           external clients retry
Transaction scope     one call into the existing system
Distribution          remote by definition
Performance           1 round trip per client interaction
Team                  API team ≠ the system's team

→ Remote Facade: operations named after client interactions
→ DTOs, versioned, tolerant of unknown fields
→ Anti-corruption layer over the legacy model
→ Gateway per external system, with error translation
→ Idempotency keys on writes (clients retry)
→ ETag / If-Match for concurrent updates
→ No domain model in the API layer — it has no rules of its own
```

The failure to avoid here is building a domain model in the API tier "for cleanliness". It
would be a second, weaker copy of rules that live elsewhere.

### D. Reporting and analytics over a transactional system

```text
Business complexity   in the queries, not in the objects
Work shape            entirely set-shaped
Concurrency           read-only
Performance           dominates everything
Team                  analysts plus one engineer

→ SQL, in gateways, per report
→ Projections/records as the result types
→ No entities, no repositories, no domain model, no service layer
→ Read replica or a separate schema; never the write path's connections
```

Applying the transactional system's architecture here produces something slower and less
maintainable than the SQL. This is the clearest case where "consistency with the rest of the
codebase" is the wrong criterion.

## Decisions that belong per module, not per system

| Decision                   | Per system                              | Per module                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------------- |
| Logic organisation         | —                                       | **Yes** — CRUD and pricing are different problems |
| Data-source pattern        | —                                       | **Yes**                                           |
| Service layer existence    | —                                       | **Yes**                                           |
| Read model                 | —                                       | **Yes** — where reads are slow                    |
| Locking strategy           | —                                       | **Yes** — per aggregate, by conflict rate         |
| Error shape                | **Yes** — one for the whole application | —                                                 |
| Transaction boundary layer | **Yes** — always the use case           | —                                                 |
| Boundary enforcement rules | **Yes**                                 | —                                                 |
| Logging and correlation    | **Yes**                                 | —                                                 |
| API contract conventions   | **Yes**                                 | —                                                 |

The left column is where consistency genuinely pays: a caller should never have to ask which
error shape an endpoint uses. The right column is where uniformity costs — forcing one
internal structure onto modules with different forces is a major source of accidental
complexity (`enterprise-architecture-smells`).

## The order of decisions

Later decisions depend on earlier ones; taking them out of order produces rework.

```text
1. Logic organisation        (script / model / table module)
2. Data-source pattern       (constrained by 1)
3. Transaction boundary      (constrained by 1 and by use-case shape)
4. Aggregate boundaries      (only if 1 = domain model)
5. Locking                   (constrained by 4 and by conflict rate)
6. Read model                (independent; decided by the read budget)
7. Boundary contracts        (only where a boundary exists)
8. Distribution              (last, and only with a named driver)
```

Deciding 8 first — "we are building microservices" — fixes every earlier decision by
implication, and usually badly (`distribution-boundaries`).
