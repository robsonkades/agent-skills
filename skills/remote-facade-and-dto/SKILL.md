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
travel together: a coarse operation needs a payload that carries everything the caller needs
in one exchange.

Two failures bracket the topic. The **chatty facade**: a remote API that mirrors the domain
model, so rendering one screen costs five round trips and the interface's latency is
dominated by the network. The **ceremonial DTO**: a field-for-field copy of an entity, with a
mapper, a test and a maintenance burden, that provides no decoupling because it changes
whenever the entity does.

## The patterns

```text
Remote Facade    a coarse-grained object over a fine-grained model,
                 offering complete business operations. It holds no
                 business logic — it translates one remote request into
                 calls on the local model and assembles the answer.

DTO              a simple carrier of data across the boundary, shaped by
                 what the caller needs, serialisable, with no behaviour
                 and no dependency on the domain's internals.
```

## Workflow

1. **Start from the caller's use case**, not from the domain model. What does the caller do
   in one interaction? That is one facade operation.
2. **Count the round trips** for each screen or workflow the caller has. More than one per
   interaction is the signal to coarsen.
3. **Shape the payload from what the caller needs** — not the entity's fields, and not
   everything that might be useful.
4. **Decide what the boundary owes**: stable field names, documented codes, a version
   policy, and explicit nullability. That is the contract
   (`rpc-and-api-contracts`).
5. **Assemble inside the transaction** so nothing lazy or managed escapes
   (`orm-behavioral-patterns`).
6. **Justify each DTO.** If it is an exact copy of a domain type and there is no independent
   evolution, no security filtering and no serialisation concern, it may not be earning its
   keep — see the decision rules.

## Decision rules

```text
The boundary is remote (HTTP, gRPC, messaging) — any boundary at all
        → a DTO. The wire shape must be able to change independently of
          the model, and the model must not be serialised by accident.

The boundary is a public or partner API
        → DTO, always, plus explicit versioning and documented codes.
          The domain must be free to change without breaking clients.

The type is a JPA entity
        → DTO, always. Serialising an entity couples the contract to the
          schema and drags lazy proxies into the serialiser.

The domain type is already an immutable value with no persistence
concerns and no hidden fields (a record: Money, DateRange, an event)
        → it may cross directly. A copy adds no decoupling. Verify the
          serialised names are stable and no field is secret.

Internal, in-process, same deployable, same team
        → usually no DTO. Passing the domain type is simpler, and the
          "boundary" can be changed in one commit if it moves.

The caller needs 3 fields of a 40-field aggregate
        → a projection, not a DTO built from the loaded aggregate. Do
          not load what you will not send
          (query-objects-and-specifications).

Several services need "the same" DTO
        → do NOT share a DTO library. Each service owns its
          representation; identical is fine, coupled is not
          (distribution-boundaries).

One client needs a screen-shaped payload and others do not
        → a backend-for-frontend facade for that client, not a screen
          -shaped field on the shared API.
```

## Rules

- **A remote interface must be coarser than the local model it fronts.** Ported call for
  call, a local design becomes a chatty remote one, and no serialiser or protocol makes up
  for the round trips (`architecture-and-performance`).
- **A Remote Facade holds no business logic.** It translates, assembles and delegates. Rules
  in the facade cannot be reached by any other caller — a job, a consumer, another API — and
  they will be duplicated there (`service-layer-design`).
- The facade is also the natural place for boundary-only concerns: coarse authorisation for
  the operation, request validation, translation of domain failures into the protocol's
  error shape, and idempotency-key handling (`idempotency`).
- **Never serialise a JPA entity to a client.** Three couplings arrive at once — schema to
  contract, lazy proxies to the serialiser, and internal fields to the public payload — and
  each fails differently.
- **DTOs are not free and not mandatory.** The mapping is code to write, test and keep in
  step. Their justification is independent evolution, deliberate exposure, and a stable wire
  shape; where none of those applies, the mapping is ceremony
  (`enterprise-architecture-smells`).
- Make DTOs immutable — records with explicit component names. Mutable DTOs with setters
  invite population in stages and produce half-built payloads.
- **Be explicit about what is absent.** A field omitted, a field null, and a field with an
  empty value mean different things to a client; decide which you use and be consistent.
- Do not shape a shared API around one client's screen. That client's UI then owns your
  contract, and the second consumer either gets a bad fit or forces a parallel shape.
  Screen-shaped payloads belong in a BFF (`view-and-representation-patterns`).
- **Never share a DTO library between services.** It reintroduces compile-time coupling
  across a boundary whose whole purpose was to remove it, and it forces lockstep upgrades —
  the defining symptom of a distributed monolith (`distribution-boundaries`).
- Additive change is compatible; removal and renaming are not. Design the contract so
  clients tolerate unknown fields, and expand before you contract
  (`rpc-and-api-contracts`).
- Assemble the payload inside the transaction, from a projection where possible. Assembling
  outside it either fails on a lazy association or silently issues queries during
  serialisation.
- The mapper is not a place for business rules. A mapper that computes a total or decides a
  status has hidden a rule where no test looks for it.

## References

- [Remote Facade](references/remote-facade.md) — coarsening an interface with the round-trip
  arithmetic, what belongs in a facade and what must not, batch and partial-failure
  operations, idempotency and conditional requests at the boundary, and the facade as the
  place where domain failures become protocol errors. Read when designing a remote API or
  diagnosing a chatty one.
- [DTO versus domain object](references/dto-vs-domain-object.md) — the decision table with
  the cases where a DTO is mandatory, optional and wasteful; mapping strategies and their
  failure modes; projections instead of DTOs over loaded aggregates; the shared-DTO-library
  trap; and how to shrink an over-mapped codebase safely. Read when a DTO layer is being
  added, questioned, or has become a burden.
