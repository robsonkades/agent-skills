---
name: service-layer-design
description: >
  Designing the layer that fronts business logic: what an application service owns
  (transaction boundary, authorisation, orchestration, translation) and what it must not
  absorb, the difference between application and domain services, and whether the layer is
  warranted at all. Use when every service method is a single repository call, when a
  service has become where all rules accumulate, when two services call each other and
  transactions nest, when authorisation is spread between controller and repository, or when
  a facade is added over a facade. Does not cover where the rules belong
  (domain-logic-organization), transaction semantics (enterprise-transactions), remote API
  design (remote-facade-and-dto), or layer dependency direction (layering-and-boundaries).
---

# Service Layer Design

## Purpose

Give the application a boundary where a use case is named, its transaction is demarcated,
its authorisation is decided, and its collaborators are orchestrated — and keep everything
else out of it.

Two failure modes bracket this layer. The **pass-through service**: one method per
repository method, adding a `@Transactional` and nothing else, so the layer is pure cost
and everyone routes around it eventually. The **god service**: the layer becomes where all
logic lives, because it has the transaction, the repositories and the other services, and
it is always the path of least resistance. The second is the more expensive, and it grows
from the first.

## What the layer owns

```text
Application service (use case)          Domain (model or script)
────────────────────────────────        ─────────────────────────────
transaction demarcation                 business rules and invariants
authorisation for the use case          calculations
loading and saving aggregates           state transitions
orchestrating several collaborators     validity of a domain object
translating boundary types inward
publishing/collecting events
translating infrastructure failures
```

A method that does only the left column and delegates the right is a healthy application
service. A method with no left column entries is a pass-through. A method with right-column
entries inline is where the domain went.

## Workflow

1. **Name the use case, not the entity.** `PlaceOrder`, `CancelSubscription`,
   `SettleInvoice`. Services named after entities (`OrderService`) accumulate every
   operation that mentions an order, which is how the god service forms.
2. **Establish the transaction here and only here.** One use case, one transaction
   boundary, demarcated at this layer — not in the controller, not in the repository
   (`enterprise-transactions`).
3. **Decide authorisation here.** This is the layer that knows the actor and the intent.
   Repository-level filtering is a defence in depth, not the decision; controller-level
   checks miss every non-HTTP caller.
4. **Delegate the decision, keep the orchestration.** Load the aggregate, call one method
   on it, save. If the service is computing what the aggregate should become, the rule has
   moved out of the domain.
5. **Translate at the edges.** Boundary types in, domain types through, infrastructure
   exceptions to meaningful failures out. Nothing framework-specific escapes upward or
   inward.
6. **Justify the layer's existence per module.** If the services in a module are all
   pass-throughs and the module has no transaction spanning two writes, the layer is not
   earning its cost.

## Decision rules

```text
The use case is one repository call, no invariant, no orchestration,
no authorisation beyond the endpoint's own
        → no service. Let the controller call the repository, or make
          the operation a Transaction Script and call it what it is.

The use case writes two or more aggregates, or writes and publishes,
or must be atomic across collaborators
        → application service, transaction demarcated here. This is the
          core justification for the layer.

Logic belongs to the domain but fits no single object — a decision
across two aggregates, an algorithm needing several roots
        → domain service: framework-free, no transaction, no repository
          orchestration, expressed in domain types. Rare; check first
          that the logic does not belong on an object.

Business logic is accumulating in the application service because that
is where the repositories are
        → the model is anaemic. Fix the placement
          (domain-logic-organization), not the service.

Two application services need each other
        → extract the shared work downward (a domain service or a domain
          method), or make one of them the caller of a smaller
          collaborator. Mutual calls between transactional services are
          where propagation surprises and cycles come from.

An external caller needs a coarse-grained, network-shaped operation
        → that is a Remote Facade in front of application services,
          not a fatter application service (remote-facade-and-dto).
```

## Rules

- The service layer's defining responsibility is the **transaction boundary**. Everything
  else it does is negotiable; that one is why the layer exists in a system with more than
  one write per use case.
- An application service that reads like the use case description is right. One that reads
  like a database procedure has absorbed the domain.
- **Do not add a service layer by default.** For read paths and single-write CRUD it is
  frequently pure indirection. State per module whether it exists and why
  (`architecture-decision-making`).
- Application services depend on domain types; domain types never depend on application
  services. A domain object calling a service is the inversion that ends with the model
  unable to be tested alone.
- Domain services are much rarer than their popularity suggests. Before writing one, check
  whether the behaviour belongs on one of the objects it operates on — most candidates do,
  and the ones that genuinely do not are typically policies over two aggregates.
- Keep application services free of framework types in their signatures. `ResponseEntity`,
  `HttpServletRequest`, `Pageable` in a service signature ties the use case to one caller
  and blocks reuse from a job or a consumer (`layering-and-boundaries`).
- Self-invocation defeats proxy-based transaction and cache annotations: a
  `@Transactional` method called from another method of the same bean runs with no new
  transaction. This is the most common silent transaction bug in Spring codebases; the fix
  is to move the method to a collaborator, not to inject the bean into itself.
- Authorisation belongs to the use case, not to the entity and not to the endpoint. Encode
  it where the intent is known, and treat repository-level tenant filters as a second
  layer of defence rather than the decision.
- Orchestration that spans a network boundary is not a transaction. A service that writes
  locally and calls a remote system needs an explicit outcome for "local committed, remote
  failed" — retries, compensation or an outbox — decided at this layer
  (`distribution-boundaries`).
- Batch and per-item are different use cases. A service method that loops over items and
  opens a transaction per item is fine; one that loops inside a single transaction is a
  long transaction holding locks, and it belongs in a different design
  (`architecture-and-performance`).

## References

- [Service boundaries and responsibilities](references/service-boundaries.md) — worked
  application service and domain service in Java, where the transaction and authorisation
  sit, orchestrating several aggregates, event publication, and the exact division of
  labour with the domain. Read when writing or reviewing a use case implementation.
- [Anaemic layers and god services](references/anaemic-and-god-services.md) — detecting
  both failure modes from the code and from the history, the metrics that discriminate,
  the incremental fixes for each, and when a thin service layer is genuinely correct. Read
  when a service class is under review, or when deciding whether to keep the layer.
