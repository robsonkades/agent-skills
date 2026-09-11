# Selection Criteria

## The nine inputs as answerable questions

| Input                   | Question with an observable answer                                                | What it decides                        |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| Business complexity     | Which representative rules are **conditional on other rules**, and who owns them? | Transaction Script vs Domain Model     |
| Data complexity         | How many concepts span several tables, or share one? Who may change the schema?   | Active Record vs Data Mapper           |
| Work shape              | Are the decisions per instance, or over sets of rows?                             | Domain Model vs Table Module / SQL     |
| Concurrency             | Do conflicts occur inside a transaction, or across a user's thinking time?        | Row locking vs offline locking         |
| Transaction scope       | Which effects must commit together, and who owns policy and coordination?         | Transaction and application boundaries |
| Distribution            | What is the **named driver** and communication contract for a process boundary?   | Module vs service; RPC/event contract  |
| Performance             | What is the round-trip budget per operation? How asymmetric are reads and writes? | Read model; fetch strategy; caching    |
| Team and lifespan       | Who maintains this, how many people, for how long?                                | How much indirection is affordable     |
| Operational constraints | Deploy cadence, ownership boundaries, regulation                                  | Boundaries and their enforcement       |

The first is the one most often answered by assertion. "The domain is complex" is not an
answer; "seven pricing rules, four of them conditional on the outcome of another" is, and it
makes a Domain Model a candidate. Two independent validations may favor Transaction Script;
rule counts alone do not decide ownership, complexity or migration cost. Inspect representative
changes and preserve justified existing boundaries.

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

→ Simple mapper-backed CRUD (JPA entity plus Spring Data repository is not Active Record)
→ Existing Spring Data repository API; no extra pass-through wrapper
→ Service layer only if shared authorization, transaction or caller contracts warrant it
→ Reuse adequate internal types; explicit response contract at the HTTP boundary
→ If stale edits must be rejected, preserve expected state and a tested conflict response
  (@Version is one option; inspect the actual mapping and target)
```

Check what the house layers protect before adding or removing them: authorization, validation,
testing and ownership may still justify a small boundary. Record the force and trade-off.

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

Projections and explicit SQL are candidates for the query and bulk budgets, not required
replacements for an adequate existing path. Without deliberate fetch/bulk planning, the list may produce
N+1 and the job may hydrate excessive aggregates. Prove the query/load shape, and ensure
the SQL path implements the same required pricing invariants and conflict behavior.

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
→ Explicit wire types and evolution/unknown-field policy matched to the public contract
→ Anti-corruption layer when legacy semantics need translation; do not invent that mismatch
→ Gateway per external system, with error translation
→ Assess retry safety across all effects; idempotency keys/deduplication only where needed
→ ETag / If-Match when conditional HTTP updates express the required conflict protocol
→ No domain model in the API layer — it has no rules of its own
```

The failure to avoid here is building a domain model in the API tier "for cleanliness". It
would be a second, weaker copy of rules that live elsewhere.
An older or separately owned system need not have incompatible semantics. Preserve an
adequate translation boundary and wire type. Repeat-safe intended effects may need no key
store; non-repeat-safe effects need an authoritative retry/deduplication or reconciliation
contract. A method name or a separate cache does not establish that contract (`idempotency`).

### D. Reporting and analytics over a transactional system

```text
Business complexity   in the queries, not in the objects
Work shape            entirely set-shaped
Concurrency           read-only
Performance           dominates everything
Team                  analysts plus one engineer

→ SQL, in gateways, per report
→ Projections/records as the result types
→ Avoid unnecessary write-model hydration; retain query repositories and service/policy
  boundaries when they own authorization, admission, audit or a stable caller contract
→ Isolate reporting capacity when measured contention warrants it; replica if freshness permits
```

Projection-oriented SQL can avoid unnecessary hydration. A separate schema alone does not
isolate CPU/I/O; a separate pool bounds admission but still shares database resources.
Compare representative reports, write latency and required freshness before adding a replica.
Shared security/operational conventions remain useful even when data access differs.
Verify tenant/row/field access on the reporting path. Projection types and a read-only
label do not enforce database privileges or prevent writes through raw SQL.

## Decisions that belong per module, not per system

| Decision                   | Per system                                            | Per module                                        |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Logic organisation         | —                                                     | **Yes** — CRUD and pricing are different problems |
| Data-source pattern        | —                                                     | **Yes**                                           |
| Service layer existence    | —                                                     | **Yes**                                           |
| Read model                 | —                                                     | **Yes** — where reads are slow                    |
| Locking strategy           | —                                                     | **Yes** — per aggregate, by conflict rate         |
| Error shape                | Govern per public protocol and compatibility contract | Map local failures without breaking that contract |
| Transaction boundary layer | Govern ownership and propagation conventions          | Demarcate the actual unit required by this path   |
| Boundary enforcement rules | **Yes**                                               | —                                                 |
| Logging and correlation    | **Yes**                                               | —                                                 |
| API contract conventions   | **Yes**                                               | —                                                 |

The left column records shared contracts; distinct protocols or existing compatibility
requirements may need different representations. The right column is where uniformity costs — forcing one
internal structure onto modules with different forces is a major source of accidental
complexity (`enterprise-architecture-smells`).

## The order of decisions

Use this as an iteration order, checking fixed deployment, schema and consistency constraints
at the beginning. Existing authorized boundaries can constrain earlier choices.

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

Choosing distribution by habit constrains other decisions without evidence; a mandated
ownership or deployment boundary is legitimate input. Revisit the composition when the
driver or measured costs change (`distribution-boundaries`).

Sources for the conditional boundary choices: [Anti-corruption layer applicability](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer#when-to-use-this-pattern),
[HTTP intended-effect idempotence and conditional requests, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2),
and [Service Layer responsibilities](https://martinfowler.com/eaaCatalog/serviceLayer.html).
