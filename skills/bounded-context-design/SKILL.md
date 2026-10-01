---
name: bounded-context-design
description: >-
  Design or review bounded contexts when the same business term has conflicting
  meanings, rules change under different owners, or a shared domain model couples
  unrelated workflows. Establish language, invariants, context relationships and
  translation contracts. Use before splitting or merging domain models; keep process
  extraction with distribution-boundaries and internal rule organization with
  domain-logic-organization. A bounded context does not automatically become a service.
---

# Bounded Context Design

## Purpose

Make the scope of a model explicit so a rule has an unambiguous meaning and owner.
Deliver a justified context map and a contract for each material translation, or retain
an adequate model when the evidence supports it. A different noun, table, controller,
team or repository is a clue to investigate, not a context boundary by itself.

The architectural distinction is between the business problem, a model's meaning, its
consistency units, its code arrangement and its deployment. A subdomain describes a
business capability/problem area; a bounded context scopes a model and language; an
aggregate governs a consistency boundary inside a model. Java modules and processes
implement these decisions with different constraints. Do not infer a one-to-one mapping.

Several contexts can coexist in one application. A context spread across several
deployables still needs semantic coordination; separate processes do not demonstrate
independent models. A single context can contain many aggregates and simpler scripts.
These distinctions follow the strategic-design framing in
[Fowler's Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) and
[Evans's DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
(Bounded Context, Aggregates and Context Mapping); the workflow below applies that
framing to concrete repository decisions.

## Discover the model before naming the boxes

1. **Start with the contested decision.** Identify a business operation, the people
   who use its language, and the defect or change friction to resolve. For a new system,
   use concrete business examples; for an existing one, inspect use-case tests, API/event
   contracts, business policies, ADRs and relevant change history. Record existing and
   proposed maps separately. Code and an organization chart describe implementation and
   reporting lines, not proof that domain experts agree on a model.
2. **Collect meaning with examples.** For each disputed term record its definition,
   identity, lifecycle, decisions it supports and effective time. Ask what makes it valid,
   who may change it and what a counterexample looks like. Trace an accepted operation,
   a rejected one and a correction/cancellation. Distinguish synonyms for one concept
   from one word hiding incompatible concepts; different display fields alone are weak
   evidence for separation.
3. **Trace invariants and authority.** Name the decision owner and its state inputs,
   including batch jobs, imports and manual interventions. Specify whether a rule must
   hold at commit, after a bounded delay, or only for a historical snapshot. A cross-model
   atomic requirement is a design constraint to investigate, not permission to replace
   atomicity with eventual consistency. A context boundary alone enforces no transaction.
4. **Inspect coordination in practice.** Identify who can change each rule or integration
   promise, who depends on that decision and how disagreements are resolved. Repeated
   joint changes can reveal leaked internals, a true shared policy or a temporary migration;
   inspect their reasons. Team size, commit counts and a workshop diagram are not decisive
   thresholds. Use a focused example-mapping or event-storming discussion only where
   evidence is missing; do not require a workshop for a local, already documented decision.
5. **Inspect implementation constraints when they affect the proposal.** Read Maven/Gradle
   toolchains, compiler release, resolved Spring dependencies, persistence mappings,
   transaction configuration, CI and deployed runtime. Record the target rather than
   assuming Java 25, Spring Boot 4, records or Spring Modulith. No language or framework
   upgrade is authorized by choosing this skill. The modeling method itself has no Java
   release baseline; the conditional Java reference identifies its illustrations.

Keep observed rules separate from inferred boundaries. If only entity names or package
names are available, return candidate boundaries and the missing business example that
would discriminate them. Ask a focused question only when a material answer cannot be
obtained from available artifacts. Continue mapping established facts without inventing
rule owners, stakeholder agreement or production behavior.

## Choose the semantic boundary

| Evidence                                                                     | Candidate decision                                                                             | What could change it                                                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Different vocabulary, same identity/lifecycle/invariant and change authority | Retain one model, make aliases explicit, fix inconsistent language at entry points             | Concrete examples require contradictory meanings or independent policy evolution                                  |
| One term means different identities, state transitions or decision rules     | Separate models with an explicit translation; test whether distinct contexts improve ownership | Differences are merely UI projections or can be reconciled without policy ambiguity                               |
| A single rule must make one atomic decision over proposed sides              | Keep one authority and its required consistency mechanism; reconsider the proposed cut         | Domain owners accept a different business guarantee, or supported coordination satisfies the original one         |
| A small, stable model fragment has the same meaning and coordinated owners   | Consider a deliberately bounded shared kernel with joint change tests                          | Independent policy changes, incompatible consumers or an expanding common module make coordination cost excessive |
| A vendor's model already fits a peripheral capability                        | Consider conforming at that boundary, retaining explicit coupling and change risk              | Local policy requires semantics the vendor cannot supply                                                          |
| Separate models need no business exchange                                    | Keep them separate without an integration                                                      | A concrete cross-context operation justifies its ownership and translation cost                                   |

Use only the alternatives relevant to the task. A business capability map helps locate
work, but does not dictate context count. A shared identifier does not establish a shared
model; duplicated facts can be legitimate local views when authority and freshness are
explicit. Conversely, two names do not justify two authorities for the same decision.

Before splitting on lifecycle differences, compare values at the same business time and
role. A current customer and an invoice's recipient snapshot can coexist in one coherent
model. If explicit roles, states or snapshots reconcile the examples under agreed policy,
retain that option; separate contexts need evidence of distinct model meanings or change
coordination that this refinement does not address.

Do not centralize a universal `Customer`, `OrderStatus` or `Money` model solely to remove
similar code. Compare meaning first: identity scope, allowed transitions, currency/rounding
policy, event time and who approves changes. A shared technical utility is not automatically
a shared domain kernel. Avoid separating models solely to meet a service-count target.

## Make the relationships implementable

For each chosen context, record purpose, distinctive language, owned decisions/invariants,
responsible people and its current code location. Add exclusions when they prevent competing
ownership. A proposed owner stays proposed until the relevant authority confirms it.

For each important connection, name the published facts or requested operation, meaning
and identity mapping, who defines the contract, who maintains translation, and how an
unsupported input is handled. Label upstream/downstream influence separately from request
and event directions: the party making an HTTP call is not necessarily the upstream model.
Read [Context maps and translation contracts](references/context-maps-and-translation.md)
when relationships, a shared kernel, an external model or semantic mismatches need design.

Separate a local domain event from an externally supported integration promise. A public
schema may stay stable while internal types change. Payload compatibility alone cannot
show that `accepted`, `cancelled` or `amount` still has the same business meaning. Preserve
tenant/identity scope, units and effective time across translations; never substitute an
unknown upstream state with a successful local state merely to keep processing.

When implementing the boundary in Java/Spring, read
[Java and Spring boundary implementation](references/java-spring-boundaries.md). Prefer
the project's existing module and testing mechanisms, with a narrow public contract and
internal model types. Package boundaries, bean wiring and annotations do not prove a
semantic boundary; transactions, data permissions and authorization still need their
respective enforcement mechanisms.

## Execute and challenge the result

Match the outcome to the user's request. A review returns findings tied to concrete rules,
consequences and checks. A design returns a context map with a material alternative and
reconsideration trigger. An implementation changes the relevant model/translation,
consumers and tests together, preserving public contracts and the target stack. Do not
turn a modeling request into an unrequested service extraction or repository rewrite.

Validate the consequential claims with the smallest relevant checks:

- **Meaning:** replay the accepted, rejected and correction examples using the proposed
  language. Check that each invariant has a named owner and that two owners cannot assign
  contradictory meanings to the same published fact. Validate provisional business rules
  with domain evidence; source inspection alone cannot confirm stakeholder agreement.
- **A decisive contrast:** keep the scenario constant and change the disputed semantics.
  Synonyms with one contract should retain one model; incompatible identity/lifecycle
  rules should prompt separation or an explicit alternative explaining their reconciliation.
- **Translation:** test an ordinary mapping and an input that loses meaning: unknown
  state, missing identity mapping, wrong tenant/issuer, changed unit or historical value.
  Require an explicit rejection/deferred state and owner for resolution where appropriate;
  test that a mapper cannot grant a business permission it was not given.
- **Structure, when code changes:** use the project's architecture check to reject a
  dependency on another context's internals, and a positive case through its public API.
  Compilation and Spring startup do not prove the business cut. Module checks do not prove
  runtime transaction or security properties; test those paths when the change claims them.
- **Evolution:** rehearse one realistic policy change on each side. Identify the contracts
  that must stay stable and any deliberate coordination. If simple private changes force
  unrelated consumers to change, inspect shared types or leakage before redrawing the map.

For a narrow task, a compact decision and one discriminating example may suffice. For
multiple contexts, include a map/relationship list, scoped glossary, invariant/owner list,
translation contract, unresolved evidence and first verifiable slice. State checks executed,
results and gaps; written scenarios and walkthroughs are not behavioral runs. A context
map is a design hypothesis, not proof of improved delivery speed or operational isolation.

## Conditional handoffs

- Use `distribution-boundaries` for deciding a process boundary and its failure semantics;
  `architecture-coupling-and-quanta` for release/runtime coupling evidence.
- Use `domain-logic-organization` for organizing rules inside a context and
  `layering-and-boundaries` for dependency direction inside the implementation.
- Use `service-data-ownership` when writer authority, direct table access or supported
  data interfaces need enforcement beyond this semantic map.
- Use `rpc-and-api-contracts` and `schema-evolution-and-compatibility` for a concrete
  public protocol and mixed-version evolution; `distributed-transactions-and-sagas`
  when the accepted consistency contract actually crosses transactions/processes.
- Use `architecture-testing` for executable dependency checks,
  `spring-transactions-and-events` for Spring transaction/event behavior, and
  `architecture-refactoring-paths` for a migration requiring staged coexistence.

These are optional continuations when the task reaches their responsibility, not
prerequisites for drawing a useful context map.
