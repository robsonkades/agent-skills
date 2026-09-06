# Design patterns against architectural patterns

## The four levels

| Level                     | Unit                      | Concerns                                       | Changed by            |
| ------------------------- | ------------------------- | ---------------------------------------------- | --------------------- |
| **Design pattern**        | Classes and objects       | Collaboration, coupling, variation             | A refactoring         |
| **Component design**      | Packages, modules         | Cohesion, dependency direction, release units  | A restructuring       |
| **Architectural pattern** | The system's organisation | Layering, dependency rules, read/write split   | A migration           |
| **Distributed pattern**   | What crosses a network    | Availability, consistency, failure, deployment | An operational change |

These are different review scopes, not exclusive categories: local object design can affect a
service's availability, while distributed contracts need deployment and recovery evidence too.

## The pairs most often conflated

| Design pattern | Mistaken for              | What the architectural one has that the pattern does not                     |
| -------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Proxy          | API gateway               | A deployment, TLS termination, authentication, rate limiting, its own outage |
| Facade         | Backend-for-frontend      | A release cycle, a team, its own scaling and failure surface                 |
| Observer       | Event-driven architecture | Explicit schema, delivery, ordering and recovery policies                    |
| Mediator       | Orchestration / saga      | Required durable progress, deadlines and applicable compensation             |
| Memento        | Event sourcing            | An append-only log, projections, replay, and the answer to "why"             |
| Flyweight      | Distributed cache         | Invalidation, staleness policy, a network hop, a stampede on cold start      |
| Command        | Message-driven design     | Chosen delivery/ordering scope, compatibility and terminal failure policy    |
| Adapter        | Anti-corruption layer     | A module boundary, a team agreement, and a model — not a method signature    |
| Chain          | Workflow engine           | Persistence, retries per step, visibility, human tasks                       |
| Singleton      | Leader election           | Consensus, leases, fencing, split-brain behaviour                            |

The pattern in every row is a legitimate way to _implement part of_ the architectural thing. The
error is treating them as the same decision, because the pattern's cost is a class and the
architecture's cost is an operational commitment.

## Two worked distinctions

**Proxy and API gateway.** A remote proxy is a client-side class implementing the service's
interface. A gateway is a deployed routing boundary for the traffic assigned to it. Proxy calls
can hide chatty access; a gateway outage can affect routes dependent on it, subject to redundancy
and failover. Neither failure follows from the class/pattern name alone.
Calling the gateway "our proxy layer" in a design discussion loses the second consequence, which is
the one that appears in the incident review.

**Observer and event-driven architecture.** An in-process observer is a method call to registered
listeners under the chosen threading policy. An event-driven architecture uses events as contracts:
deployment independence, durability, replay, deduplication and discovery are decisions to establish,
not guarantees supplied by the label. Moving one listener to a broker does not create the architecture; adopting the
architecture is a set of decisions about governance, and the listener is one line of it
(`event-driven-architecture`).

## How patterns legitimately participate in architectures

Composition across levels is normal and worth naming, because it stops the levels being conflated
in the other direction — refusing a pattern because "we do hexagonal architecture".

```text
Hexagonal / ports and adapters
    a port defines an application contract; an adapter may use GoF Adapter
    an application boundary service may play a Facade role
    the domain inside uses whatever patterns it needs

CQRS
    a command is Command; its handler is a use case
    a projection may fold events; a fold is not automatically GoF Visitor
    read and write models may use different data-source patterns

Event sourcing
    each event is a value; the aggregate's replay is a fold
    a snapshot is Memento's durable relative
    command validation may use a state machine; GoF State is one implementation choice

Saga / process manager
    an orchestrator is Mediator's distributed form
    each step is Command; compensation is a separate Command
    the saga's position is State, persisted

Layered / clean architecture
    boundaries between layers are Facades or ports
    mapping between layers is Adapter
    the dependency rule is not a pattern; it is the architecture

Resilience (circuit breaker, bulkhead, retry)
    these may be Decorators around a client, middleware or separate infrastructure
    their composition order is the design (gof-decorator)
```

Boundary roles are common, but Adapter/Facade can still expose security, compatibility or failure
risks; frequency does not establish low risk. "The domain does not import the framework" is a
constraint enforced by module structure and an architecture test, not by a class
(`layering-and-boundaries`, `architecture-testing`).

## When a pattern is proposed as an architecture

```text
"We'll use a Facade for the mobile API"
    → a class, or a deployed BFF? If the second, it has a team, a
      release cycle and an outage surface. Say which.

"The Mediator will coordinate the services"
    → an in-process hub, or a deployed orchestrator with durable state?
      Establish required persistence, deadlines and compensation for effects needing undo.

"Observer will decouple the modules"
    → inspect dispatch: synchronous local callbacks couple latency/failure; asynchronous dispatch
      changes that contract. Messaging adds buffering but can still couple availability through
      broker capacity, producer acknowledgements and dependent progress.

"A Singleton registry will keep the config consistent"
    → a static registry alone proves neither atomic refresh nor cross-class-loader consistency.
      Across replicas, define configuration version, rollout and consistency requirements.

"We'll add a Proxy so the service call is transparent"
    → transparency is the failure mode, not the feature.
```

Ask which operational guarantees the proposal needs. Add the distributed review when appropriate;
keep relevant object-level correctness checks instead of replacing one vocabulary wholesale.

## When an architecture is proposed for an object problem

The inverse error, and it is expensive because the correction is a rewrite rather than a
refactoring:

- "We need CQRS" for a module whose reads are slow because a query is missing an index.
- "We need event sourcing" for auditability that a history table would provide.
- "We need to split this into a service" because a class has too many responsibilities — the
  boundary is a module boundary, and it should be found before it is deployed
  (`distribution-boundaries`).
- "We need a saga" for writes that can safely participate in one local transaction; first verify
  ownership, transaction support and any external effects.

Match the change to demonstrated forces. Architecture also includes internal dependency/data rules;
neither a local performance symptom nor a pattern name proves that deployment boundaries must change.
