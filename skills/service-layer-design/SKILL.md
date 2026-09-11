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
its authorisation is decided, and its collaborators are orchestrated. Identify the chosen
domain-logic style before deciding which business rules this boundary delegates or owns.

Two failure modes bracket this layer. The **pass-through service**: one method per
repository method without any distinct contract. A transaction, authorization or stable
boundary alone may justify forwarding; inspect those duties before calling it redundant. The **god service**: the layer becomes where all
logic lives, because it has the transaction, the repositories and the other services, and
it is the easiest place to add them. Either failure can create change cost; a forwarding
layer does not inevitably become a god service.

## What the layer owns

This split describes domain-model orchestration. A deliberate Transaction Script can own
business decisions in the application operation; apply the selected model consistently.

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

A method that does only the left column and delegates the right fits this separation.
Before calling a forwarding method redundant, check its stable API and other boundary duties.
Inline right-column decisions warrant an ownership review in a domain-model design.

## Model and target contract

Fowler's Service Layer defines an application boundary and coordinates business responses;
it is not restricted to thin DDD orchestration. The separation above describes a domain-model
style. Transaction Scripts can legitimately hold business logic; identify the selected model
before moving rules. Inspect Java/framework versions, transaction manager, proxy configuration,
security entrypoints and callers. Examples are partial Spring sketches with application types
omitted, not an instruction to upgrade the stack. Preserve the target and its supported
implementation; the sketches are not a complete build or proof of runtime interception.

## Workflow

Use the steps relevant to the requested decision. Reuse adequate caller tests, architecture
decisions and configuration evidence; retain a sound boundary when no material problem or
new requirement justifies changing it. A narrow explanation need not become an extraction
or integration-test campaign.

1. **Name the intent and assess cohesion.** `PlaceOrder`, `CancelSubscription`,
   `SettleInvoice` make operations explicit. A cohesive `OrderService` can group related
   operations; split by demonstrated ownership/change or contract boundaries, not its name
   or a one-class-per-use-case rule.
2. **Establish the business transaction here by default.** Repository-local defaults and
   listener/job entrypoints can demarcate their own actual units; verify propagation rather than
   treating layer placement as the mechanism
   (`enterprise-transactions`).
3. **Decide authorisation here.** This is the layer that knows the actor and the intent.
   Enforce actor/resource/tenant policy on every entry path, with trusted identity and
   policy decisions. Repository predicates or database policies may be essential enforcement,
   not optional secondary checks; endpoint-only checks miss non-HTTP callers.
4. **In domain-model style, delegate decisions and keep orchestration.** Load the aggregate, call one method
   on it, save. If the service is computing what the aggregate should become, the rule has
   moved out of the domain.
5. **Translate according to the boundary contract.** Keep domain-facing types and failures
   independent where the selected architecture requires it. An application API may accept
   deliberate framework coupling; adapt when caller compatibility or domain independence
   needs it, rather than requiring another wrapper for every framework type.
6. **Justify the layer per module.** Inspect transaction semantics, authorization, audit,
   stable APIs and read consistency before deleting forwarding methods; write count is not
   the threshold.

## Decision rules

```text
The use case is one repository call, no invariant, no orchestration,
no independent transaction/security/audit/API boundary
        → consider no service under the module's chosen architecture. A controller may call
          a bounded read gateway, or make
          the operation a Transaction Script and call it what it is.

The use case writes two or more aggregates, or writes and publishes,
or must be atomic across collaborators
        → explicit coordination boundary. A local transaction covers only enlisted
          resources; publication/remote effects need an outbox or another outcome protocol.

Logic belongs to the domain but fits no single object — a decision
across two aggregates, an algorithm needing several roots
        → consider a domain service expressed in domain terms. Check whether
          an object already owns the rule. Domain-owned policy/repository ports
          may supply needed information; make I/O, failure and consistency
          requirements explicit and keep application transaction/lifecycle
          coordination with its chosen owner.

Business logic is accumulating in the application service because that
is where the repositories are
        → inspect whether this is deliberate Transaction Script or misplaced logic
          in a domain-model design. Fix inconsistent placement
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

- A service layer provides a stable use-case boundary for transaction, authorization,
  orchestration and protocol-independent invocation. A transaction is a common justification, not
  its only defining responsibility and not dependent on a write-count threshold.
- Assess whether the service expresses the use case and its chosen domain-logic style.
  Procedural code alone does not establish misplaced logic in a Transaction Script design.
- **Do not add a service layer by default.** For read paths and single-write CRUD it is
  frequently pure indirection. State per module whether it exists and why
  (`architecture-decision-making`).
- In this domain-model separation, domain types do not depend on application orchestrators.
  A call through a domain-owned policy port is a different dependency: inspect the actual
  interface owner, vocabulary and effects rather than treating every service call as inversion.
- Before introducing a domain service, check whether an existing object owns the behaviour.
  Use one for a domain operation that fits neither entity nor value object; neither a rarity
  quota nor a two-aggregate requirement determines that ownership.
- Prefer protocol-independent application signatures. `ResponseEntity`,
  `HttpServletRequest` couples it to HTTP. `Pageable` introduces Spring Data coupling but
  is not inherently HTTP-only; decide whether that dependency fits the module contract (`layering-and-boundaries`).
- In default proxy mode, self-invocation does not apply the callee's transaction/cache attributes;
  it still runs in the caller's existing context if one exists. Prefer a collaborator or explicit
  transaction boundary when semantics differ; AspectJ mode behaves differently. Self-injection is
  usually a smell, not the sole possible fix.
- Apply authorization where actor, intent and resource scope are known, using trusted
  identity on every caller path. Domain policy may participate; repository/RLS predicates
  may enforce isolation. Do not remove one layer's enforcement without proving equivalent
  coverage, including jobs and consumers.
- Orchestration that spans a network boundary is not a transaction. A service that writes
  locally and calls a remote system needs an explicit outcome for "local committed, remote
  failed" — retries, compensation or an outbox — decided at this layer
  (`distribution-boundaries`).
- Batch and per-item are different units. Per-item transactions isolate failures but add commit
  overhead and may violate batch atomicity; chunk transactions balance restartability, lock time and
  throughput. A single transaction is appropriate only when bounded size and atomicity justify it
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

## Review output

Name the retained/extracted boundary, its actual duties and callers, preserved transaction/
security semantics, validation performed and unresolved evidence. Missing runtime evidence
keeps conclusions conditional; a short forwarding method alone is not a defect.
