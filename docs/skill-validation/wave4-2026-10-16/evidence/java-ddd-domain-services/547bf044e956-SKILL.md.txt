---
name: java-ddd-domain-services
description: >-
  Place Java DDD behavior in an aggregate, value object, domain service, policy,
  specification or factory using business ownership and consistency requirements.
  Use when a service takes over entity behavior, a rule combines several domain
  concepts, a policy needs external facts, or creation and rehydration are confused.
  Covers business names and packages, pure decision contracts and rule validation;
  excludes application orchestration, database query construction and persistence
  implementations.
---

# Java DDD Domain Services

## Scope and ownership

Keep behavior with the concept that owns its meaning and state. Introduce a domain
service only when a significant business operation has no natural entity or value
object owner. A domain service is a modeling role, not a Spring stereotype, remote
service or required class for every aggregate.

This skill assumes a domain model is useful for the selected behavior. When that
choice is unresolved, `domain-logic-organization` can compare it with scripts and
table-oriented logic. For aggregate consistency use `java-ddd-aggregates`; for
orchestration use `java-ddd-use-cases`. The essential ownership rules below apply
without installing those optional skills.

## Discover the local contract

Before changing ownership, inspect a representative aggregate, value object,
validator, gateway, use case and associated tests. Read project instructions,
Maven/Gradle toolchains, module dependencies and resolved annotation/framework
versions. Preserve the target baseline; adopting this skill does not authorize
dependency or Java upgrades. The illustrative signatures use Java 17-compatible
types and require the domain types defined by the target project.

Trace one accepted and one rejected business scenario. Record the actual rule,
its authoritative data, who can change that data, when the rule must hold, and the
observed package/class conventions. A class named `Service` or `Validator` alone
does not establish responsibility. Missing policy thresholds, currency rules or
consistency guarantees remain explicit unknowns; implement independent work and
resolve those contracts before encoding a guess.

## Choose the owner

| Evidence from the operation                                                 | Place the behavior                                          | Example                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A transition protects state within one aggregate                            | Aggregate root, delegating internal behavior as appropriate | `Order.submit()` controls allowed status and required lines                     |
| A rule belongs to a constituent entity                                      | Entity, reached through the aggregate's controlled boundary | `OrderLine.changeQuantity(...)` with root coordination for order totals         |
| A calculation defines a value's own meaning                                 | Immutable value object                                      | `Money.add(...)` checks currency; `DateRange.contains(...)` checks its interval |
| A named business calculation spans concepts with no natural owner           | Domain service or policy                                    | `FreightPricing.quote(...)` combines destination, shipment and tariff           |
| Alternative business algorithms have the same meaningful contract           | Policy, with an interface when actual variation needs it    | `CancellationPolicy.assess(...)` for different contract terms                   |
| A named criterion is independently reused or composed                       | Domain specification                                        | `EligibleForRenewal.isSatisfiedBy(...)` over complete domain facts              |
| Complex creation hides assembly and enforces a valid initial aggregate      | Factory or named creation method                            | `SubscriptionFactory.start(...)`; simple creation can stay `Order.create(...)`  |
| The work loads, invokes, saves, manages a transaction or dispatches effects | Application use case with infrastructure adapters           | `DefaultSubmitOrderUseCase.execute(...)`                                        |

A calculation accepting two objects is not automatically a domain service: a
value object can combine with another value, and an aggregate can use supplied
facts without surrendering its transition. Reuse alone does not justify moving
state-dependent behavior out of its owner. Conversely, forcing route planning
onto one stop merely to avoid a service distorts ownership.

## Packages, contracts and boundaries

- Follow the architectural family's `domain.<context>` convention, such as
  `com.example.domain.order.FreightPricing`. Introduce a cohesive `pricing`
  subpackage when the concept warrants it. Avoid a project-wide `services` bucket
  and a generic `OrderService` as the default home for rules.
- Keep use cases in `application.<context>.<operation>` and implementations such
  as `DefaultSubmitOrderUseCase` there. Infrastructure implements gateways and
  external integrations. Exact base packages and existing suffix conventions
  come from the inspected project, not from this example.
- Use domain input/output types and intention-revealing operations. Prefer
  immutable returned values or decisions with business reasons over changing
  several aggregates through setters. An aggregate must still enforce its own
  transition when a policy supplies a decision.
- Keep policies stateless with respect to individual executions: no last
  customer, accumulated validation errors or mutable decision cache. Immutable
  policy parameters and explicit versioned terms are legitimate state. This is
  the family's design default, not a claim that every DDD service is pure by
  definition.
- Prefer explicit facts as inputs to a pure decision. A required domain
  capability may have a domain-owned gateway contract, but the interface does
  not make its implementation pure. Make I/O visible in application orchestration
  and keep retries, HTTP clients, transactions, JPA types and brokers outside the
  domain. Never hide a lookup inside `isSatisfiedBy`.
- Follow local `final` conventions for parameters, immutable fields and classes
  without designed inheritance. Keep nullability explicit using the project's
  existing mechanism; preserve JSpecify annotations where configured. Do not
  introduce an annotation dependency merely to copy an example.

## Execute a focused change

1. **Write the rule contract.** Name inputs, outputs, rejection reasons, state
   owner and required consistency point. Separate business rejection from
   unavailable or insufficient evidence.
2. **Choose the smallest adequate owner.** Keep an existing correct placement.
   Move an order-status guard into `Order`, extract independently varying pricing
   only when its domain meaning justifies a policy, and leave loading/saving in
   the use case. Avoid a new interface with no substitution or boundary need.
3. **Preserve the protected transition.** A separate validator or policy may
   explain a decision, but public creation and mutation paths must not bypass
   applicable invariants. Snapshot approval does not reserve stock or credit.
   A deferred or cached decision must still apply to the inputs and terms used
   at the transition; a bare `approved` flag cannot establish that contract.
4. **Read conditional detail before implementing it.** Use
   [Policy and factory contracts](references/policy-and-factory-contracts.md)
   when rules consume external facts, span aggregates, become specifications,
   or construct/reconstitute objects. It covers timestamp/currency guarantees,
   concurrent prechecks, predicate translation and lifecycle differences.
5. **Implement and verify the changed boundary.** Update callers and tests with
   the project's current build. Keep data loading, transaction policy and
   persistence implementations with their existing owners.

## Quality and validation

For a changed policy, exercise the rule boundaries and rejection reasons using
domain objects without starting Spring or a database. Include any applicable
currency mismatch, missing facts, freshness boundary, future timestamp and
policy-version cases. For deferred decisions, test a relevant input changing
before use and an unchanged input remaining valid under the agreed terms.
Repeated calls must not inherit another request's state.
Test the aggregate's transition independently so bypassing the orchestration
cannot skip local invariants.

When the decision affects shared capacity, uniqueness or another concurrently
changing fact, unit tests prove only the calculation. Require the relevant
application/persistence contract check for conditional writes, reservation
timeouts and recovery, or conflict handling. For translated specifications,
compare database outcomes with the domain criterion on representative boundary
data; a predicate test alone does not verify SQL semantics.

Return the chosen owner and its reason, affected package/class names, implemented
behavior and executed checks. For a review, distinguish findings from fixes and
allow a supported no-change conclusion. Report remaining unknown policy or
consistency requirements and unexecuted checks; do not claim business correctness
from naming or compilation alone. `java-ddd-testing` can deepen the test strategy.

## Optional neighboring expertise

Use `java-ddd-value-objects` for value semantics, `java-ddd-repositories` for
gateway/persistence contracts, and `java-ddd-domain-events` for event lifecycle.
For algorithm variation mechanics use `gof-strategy`; for database query objects
and generated SQL use `query-objects-and-specifications`. These handoffs extend
the guidance rather than replacing the contracts above.

## Basis and limits

Evans describes a domain service as a named operation when entity/value ownership
would distort the model, and a factory as encapsulation for complex creation.
Those are ownership criteria, not mandatory Java class templates.
([DDD Reference, Services and Factories](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf))

Fowler combines behavior and data in a domain model and warns against pushing all
business behavior into procedural services. A thin application layer can coexist
with a rich model.
([Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html),
[Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html))

The package conventions, pure-policy default and validation procedure here are
this skill's Java/Clean Architecture application of those principles. They do
not establish the correct business policy for an unfamiliar bounded context.
