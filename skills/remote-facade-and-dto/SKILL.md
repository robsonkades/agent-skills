---
name: remote-facade-and-dto
description: >
  Designing what crosses a remote boundary: a Remote Facade providing coarse,
  business-shaped operations, and DTOs carrying the data in one round trip — plus when a DTO
  earns its mapping cost. Use when an API mirrors the domain model method for method, when a
  client makes five calls to render one screen, when JPA entities are serialised to clients,
  when a DTO is a field-for-field copy of an entity, when adding a field means editing seven
  classes, when internal fields appear in a public payload, or when a shared DTO library
  couples services at compile time. Does not cover whether the boundary should be remote
  (distribution-boundaries), contract versioning (rpc-and-api-contracts), the view layer
  (view-and-representation-patterns), or the application service the facade calls
  (service-layer-design).
---

# Remote Facade and DTO

## Purpose

Make a remote interface coarse enough to be usable over a network, and make the data that
crosses it a deliberate contract rather than an accidental serialisation. These two patterns
travel together: a coarse operation needs a payload that carries the values required by its
contract, within explicit size and work bounds.

Two failures bracket the topic. The **chatty facade**: a remote API that mirrors the domain
model, so rendering one screen costs five round trips and the interface's latency is
dominated by the network. The **ceremonial DTO**: a copy with mapping and maintenance costs
but no distinct exposure, ownership, encoding or evolution responsibility. Identical fields
alone do not establish that a boundary is redundant.

## The patterns

```text
Remote Facade    a coarse-grained object over a fine-grained model,
                 offering complete business operations. It holds no
                 business logic — it translates one remote request into
                 calls on the local model and assembles the answer.

DTO              a simple carrier of data across the boundary, shaped by
                 what the caller needs, encodable by the chosen wire format, with no domain policy
                 and no dependency on the domain's internals.
```

## Compatibility and evidence

Inspect the target compiler/runtime, serializer and framework versions, existing payloads
and consumer contracts before changing types. Records require Java 16+ and serializer
support; the Spring `ProblemDetail` snippets require Spring Framework 6+ (Java 17+).
Examples are partial sketches, with application types, wiring and authorization omitted;
they do not authorize upgrades or new dependencies. A DTO need not implement Java
`Serializable` to be encoded as JSON or another wire format.

When caller traces, payloads or compatibility tests are unavailable, state the gap and keep
coarsening/removal recommendations conditional. A local facade can simplify an interface
without remote serialization or speculative distribution.

## Workflow

Use the steps relevant to the requested decision. Reuse adequate contracts, tests and traces;
a narrow explanation or supported no-change review does not require a payload rewrite or a
new performance/compatibility campaign.

1. **Start from the caller's use case**, not from the domain model. What does the caller do
   in one interaction, and which calls depend on earlier results? Choose operation boundaries
   from that work, its consistency requirements and its latency/failure budget.
2. **Count and budget round trips** for each interaction. More than one is not automatically wrong:
   cacheability, parallelism, reuse, payload size and consistency determine whether coarsening wins.
3. **Shape the payload from what the caller needs** — not the entity's fields, and not
   everything that might be useful.
4. **Decide what the boundary owes**: stable field names, documented codes, a version
   policy, and explicit nullability. That is the contract
   (`rpc-and-api-contracts`).
5. **Materialize required persistent state within its valid context**, with a transaction
   and isolation level when consistency requires them. Pure mapping of materialized values
   may occur afterwards. An exposed source object must not enable uncontrolled lazy traversal,
   managed mutation or accidental field exposure through the actual encoding path
   (`orm-behavioral-patterns`).
6. **Justify each DTO.** If it is an exact copy of a domain type and there is no independent
   evolution, no security filtering and no serialisation concern, it may not be earning its
   keep — see the decision rules.

## Decision rules

```text
The boundary is remote (HTTP, gRPC, messaging)
        → an explicit wire schema/type. A dedicated DTO is usual; a stable
          immutable boundary value or generated message may already be it.

The boundary is a public or partner API
        → explicit wire contract (DTO, generated binding or deliberate boundary
          value), plus explicit versioning and documented codes.
          The domain must be free to change without breaking clients.

The type is a JPA entity
        → prefer a dedicated DTO or scalar projection to isolate persistence concerns.
          An existing explicit serializer projection may also satisfy the wire contract;
          verify allowed fields, nested exposure, loaded state/query behavior and independent
          evolution. Default traversal of the entity graph is not an exposure policy.

The domain type is already an immutable value with no persistence
concerns and no hidden fields (a record: Money, DateRange, an event)
        → it may cross directly if all components and encoding satisfy the
          public contract. A separate type can still provide independent evolution;
          check names, nulls, number/time formats and sensitive fields.

Internal, in-process, same deployable, same team
        → usually no DTO. Passing the domain type is simpler, and the
          "boundary" can be changed in one commit if it moves.

The caller needs 3 fields of a 40-field aggregate
        → consider a bounded scalar projection when it avoids unnecessary hydration.
          Map already materialized state when required domain work, pending changes,
          caching or consistency make it the correct source; do not add a redundant query
          (query-objects-and-specifications).

Several services need "the same" DTO
        → prefer independently owned representations or versioned schema bindings.
          A shared data-only artifact may work with independent version pinning;
          avoid forced upgrades and shared domain behavior
          (distribution-boundaries).

One client needs a screen-shaped payload and others do not
        → consider a client-specific representation or BFF when separate
          ownership/evolution pays for its operational cost.
```

## Rules

- A remote interface normally needs operations coarse enough for its latency and failure budget.
  Fine-grained operations can be legitimate for streaming, independently cacheable resources or
  genuinely independent workflows. Ported call for
  call, a local design becomes a chatty remote one, and no serialiser or protocol makes up
  for a remaining sequential dependency chain. Cache hits, parallelism and streaming can
  change the critical path; measure the complete interaction (`architecture-and-performance`).
- **A Remote Facade holds no business logic.** It translates, assembles and delegates. Rules
  shared by jobs, consumers and APIs need one application/domain owner, rather than separate
  implementations inside transport handlers (`service-layer-design`).
- The facade is also the natural place for boundary-only concerns: coarse authorisation for
  the operation, request validation, translation of domain failures into the protocol's
  error shape, and idempotency-key handling (`idempotency`).
- Verify validation through the actual binding path. For batches, distinguish invalid request
  envelopes from invalid individual items; request-level cascading must not accidentally
  replace a per-item outcome contract. An annotation on a root collection alone is not proof
  that its elements are validated; see the Remote Facade reference for Spring MVC examples.
- **Make the serialized representation explicit.** With persistence-backed sources, test
  schema/contract independence, lazy access and sensitive/nested field exposure separately.
  A dedicated response type makes these controls visible; a tested serializer allowlist or
  custom projection can also provide them. Retain an adequate design rather than adding a
  copy solely because the source has `@Entity`.
- **DTOs are not free and not mandatory.** The mapping is code to write, test and keep in
  step. Their justification is independent evolution, deliberate exposure, and a stable wire
  shape; where none of those applies, the mapping is ceremony
  (`enterprise-architecture-smells`).
- Prefer immutable DTOs when the serializer supports them. Records are only shallowly
  immutable: defensively copy mutable components and ensure nested values are safe to share.
  A serializer requiring mutable beans needs controlled construction/publication instead.
- Separate writable request fields from readable response fields. Bind only explicitly
  allowed input fields; derive tenant/owner/security scope from trusted context and authorize
  each referenced object. Never let generic mapping populate privilege, balance or version
  fields merely because their names match. Response/error fields need exposure review too.
- **Be explicit about what is absent.** A field omitted, a field null, and a field with an
  empty value mean different things to a client; decide which you use and be consistent.
- Avoid letting one screen's evolution accidentally control every consumer's contract.
  A separate representation in the existing API or a BFF can isolate that change; choose
  according to ownership, reuse and operational cost (`view-and-representation-patterns`).
- Prefer sharing a language-neutral schema and generating versioned types. A shared DTO artifact can
  be acceptable within one release train or as generated data-only bindings when consumers may pin
  old versions; hand-written behavioral types and forced upgrades create lockstep coupling
  (`distribution-boundaries`).
- Additive change is often compatible for tolerant readers, but required fields, closed schemas,
  enums and generated clients can break on additions. Removal/renaming are generally breaking. Design the contract so
  clients tolerate unknown fields, and expand before you contract
  (`rpc-and-api-contracts`).
- Prefer bounded scalar projections when they satisfy the read contract. Materialize lazy
  state before leaving its valid persistence context; mapping detached, already materialized
  values is safe. A coarse endpoint spanning services does not create a distributed
  transaction or a consistent snapshot.
- Keep business policy in its application/domain owner. Deterministic wire formatting,
  unit conversion or representation-only calculations may belong in a mapper, with tests
  for precision, nulls and semantics. Discount eligibility, payable totals and authoritative
  state transitions must not be independently reimplemented there.

## Deliverable

Provide the decision, relevant evidence and any justified operation/payload change or no-change
verdict. For affected contracts, report preserved authorization/wire semantics and focused
compatibility, exposure or execution checks. Performance claims need the actual round-trip,
critical-path and payload evidence or an explicit gap. Keep small reviews short.

## References

- [Remote Facade](references/remote-facade.md) — coarsening an interface with the round-trip
  arithmetic, what belongs in a facade and what must not, batch and partial-failure
  operations, idempotency and conditional requests at the boundary, and the facade as the
  place where domain failures become protocol errors. Read when designing a remote API or
  diagnosing a chatty one.
- [DTO versus domain object](references/dto-vs-domain-object.md) — the decision table with
  the cases where a separate DTO or another explicit representation earns its cost; mapping
  strategies and their failure modes; choosing projections or materialized state; the shared-DTO-library
  trap; and how to shrink an over-mapped codebase safely. Read when a DTO layer is being
  added, questioned, or has become a burden.
