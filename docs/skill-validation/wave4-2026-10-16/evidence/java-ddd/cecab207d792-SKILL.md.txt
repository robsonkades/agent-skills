---
name: java-ddd
description: >-
  Turn a business workflow into a Java DDD model and a complete use-case slice when
  language, invariants and responsibilities must be resolved together. Discover the
  context, choose proportionate tactical patterns, and preserve the project's domain,
  application and infrastructure naming. Use for a new domain capability or a model
  refactoring spanning several DDD building blocks; focused aggregate, value-object,
  persistence and Spring mechanism tasks have specialist owners.
---

# Java DDD

Translate business examples into an executable model in the project's language. Own
the connection between discovery and a complete Java implementation, including the
choice to keep a simple capability simple. A collection of classes named Entity,
ValueObject and UseCase does not establish that the model expresses the business.

## Discover the model and its implementation contract

Start with an accepted and a rejected scenario; include correction or cancellation
when lifecycle behavior is involved. Reuse established examples and tests where sufficient.
Identify the actor, business outcome, terms, identity, lifecycle, required facts,
decision owner and when each rule must hold. A user story or existing table describes
part of this evidence; neither establishes an invariant by itself. Record unresolved
business rules as assumptions and ask only when the answer changes the implementation.
Continue work whose requirements are already established.

Read the target's instructions, glossary/ADRs, representative domain classes, use cases,
gateways, entry points, mappings and tests. Inspect Maven/Gradle toolchains, compiler
release, dependencies and runtime configuration. Separate its current behavior from a
proposed correction. Characterize observable legacy behavior before replacing it;
moving validation or changing equality can break callers even if the new model is clearer.

This family's Java illustrations use a **Java 17 source baseline**, without preview
features. The reference fixes Java 17 for its Gradle `buildSrc` and Spring Boot 2.7.7,
but does not explicitly pin an application toolchain/release. These are historical
reference facts, not a recommended dependency baseline or permission to upgrade.
Records need Java 16+, sealed classes Java 17+; preserve the target's supported style.
JSpecify and framework libraries are optional existing contracts, not dependencies to
introduce merely for following a convention.

When matching package/class style, read
[the reference conventions](references/project-conventions.md). It distinguishes the
verified catalog example from the installed foundation's alternative names, and records
which implementation details must not become universal rules. Do not require that
example repository or a machine-specific path to apply this skill.

## Choose the model before the class hierarchy

| Evidence                                                             | Decision to test                                                          | Counterexample or verification                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Straightforward data capture with little evolving policy             | Retain a simple application operation or transaction script               | Do not add an aggregate hierarchy merely to wrap CRUD; revisit when interacting rules emerge |
| The same term has incompatible identities, meanings or change owners | Establish separate contextual models and an explicit translation          | Different response fields alone do not establish separate contexts                           |
| A concept changes but must retain business identity                  | Model an entity; identify which root owns its lifecycle and changes       | A database primary key alone does not make a domain concept an entity                        |
| Values are interchangeable according to business-defined equality    | Model an immutable VO with validation and meaningful operations           | An event/audit record may still need identity even if its fields match                       |
| Several state elements must satisfy one rule at commit               | Evaluate one aggregate boundary and its concurrency mechanism             | Object navigation, screen composition and a table join do not prove an atomic invariant      |
| A domain calculation does not fit an entity or VO                    | Use a business-named policy/service with explicit inputs and facts        | Loading, saving and transport coordination usually belong to the use case                    |
| Another context needs a durable external effect                      | Define a supported integration contract and reliable commit/delivery path | An in-process notification does not itself require a broker or outbox                        |

Use `bounded-context-design` when the semantic boundary or context relationship is
unresolved, and `domain-logic-organization` when rich domain modeling itself is in
question. Subdomains describe business problems and investment; contexts delimit models.
Neither maps automatically to a Java module, team or deployed service. For collaborative
discovery and investment decisions, read [modeling decisions and sources](references/modeling-decisions.md).

## Deliver one coherent slice

1. **State the invariant in business terms.** Identify what would violate it and whether
   it must hold immediately, at commit or after an accepted delay. Do not replace a
   strict rule with eventual consistency to fit a pattern. Choose the authoritative
   decision location, including other writers and concurrent requests.
2. **Place behavior and names.** Keep business transitions with their aggregate/entity
   or VO. Use typed IDs and meaningful names from the scoped glossary. A use case
   orchestrates one application action. Reuse existing base classes only where they
   express useful contracts; do not create generic frameworks for every new feature.
3. **Define crossings before adapters.** Specify command/result, trusted actor context,
   absence, rejected input, conflict, dependency failure and when success is durable.
   Put outward ports in the inner layer that owns the need. In the reference family,
   a domain `CategoryGateway` and an infrastructure Spring Data `CategoryRepository`
   play different roles. Preserve existing names and error contracts deliberately.
4. **Implement the actual path.** Connect the domain change, use-case orchestration,
   gateway implementation, transport mapping and external bean/transaction composition
   needed by the request. Preserve authorization for HTTP, jobs and message handlers.
   Do not return persistence models or trust a request-supplied tenant/role as authority.
   A simple query may return an application projection without loading an aggregate.
5. **Prove the consequential behavior.** Exercise acceptance and rejection, checking
   that rejection causes no unintended state or effect. Check VO equality and aliasing,
   rehydration without new facts/events, and the real commit/conflict path when relevant.
   When introducing or changing build/module boundary checks, show that they reject
   a known forbidden dependency and inspect nonempty production classes. Reuse existing
   checks when their coverage is sufficient. A fake cannot establish database isolation
   or durable messaging.

For tactical depth, use `java-ddd-aggregates` for identity, ownership and consistency;
`java-ddd-value-objects` for value semantics; `java-ddd-domain-services` for policy and
factory placement; and `java-ddd-use-cases` for orchestration contracts. Use
`java-ddd-repositories` for aggregate persistence, `java-ddd-domain-events` for recorded
facts and delivery boundaries, and `java-ddd-testing` for discriminating behavioral
checks. These seven specialists install alongside this hub; load only the specialists
needed for the affected decisions and contracts.

`spring-boot-clean-architecture` and `spring-boot-hexagonal-architecture` own Spring
composition and boundary mechanics. DDD does not require Spring, microservices, CQRS
or event sourcing. Keep those choices explicit rather than inheriting them from an example.

## Make the result reviewable

Match the requested mode: a review gives concrete findings and checks; a design gives
the model, important alternative and evidence that would change the choice; an
implementation delivers the integrated slice and actual checks. For a small change,
a short explanation can cover the invariant, owning type, package placement, public
contract and test result. A multi-context capability may also need a glossary/context
map and staged migration. Do not require a ceremony or workshop for an already clear rule.

Report observed conventions separately from proposed improvements. State which checks
ran and what remains unproven. Compiling illustrative code proves neither stakeholder
agreement nor production concurrency. Author attribution supplies rationale, not an
endorsement of this catalog or a substitute for testing the target's behavior.
