# Design patterns against architectural patterns

## The four levels

| Level                     | Unit                      | Concerns                                       | Changed by            |
| ------------------------- | ------------------------- | ---------------------------------------------- | --------------------- |
| **Design pattern**        | Classes and objects       | Collaboration, coupling, variation             | A refactoring         |
| **Component design**      | Packages, modules         | Cohesion, dependency direction, release units  | A restructuring       |
| **Architectural pattern** | The system's organisation | Layering, dependency rules, read/write split   | A migration           |
| **Distributed pattern**   | What crosses a network    | Availability, consistency, failure, deployment | An operational change |

The differences that matter in practice: a design pattern is compiled, a distributed pattern is
deployed. One has no availability; the other has an on-call rota.

## The pairs most often conflated

| Design pattern | Mistaken for              | What the architectural one has that the pattern does not                     |
| -------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Proxy          | API gateway               | A deployment, TLS termination, authentication, rate limiting, its own outage |
| Facade         | Backend-for-frontend      | A release cycle, a team, its own scaling and failure surface                 |
| Observer       | Event-driven architecture | Durability, schema governance, replay, consumer lag, dead letters            |
| Mediator       | Orchestration / saga      | Durable state, compensation, timeouts, restart-resumability                  |
| Memento        | Event sourcing            | An append-only log, projections, replay, and the answer to "why"             |
| Flyweight      | Distributed cache         | Invalidation, staleness policy, a network hop, a stampede on cold start      |
| Command        | Message-driven design     | At-least-once delivery, versioning, dead letters, ordering per partition     |
| Adapter        | Anti-corruption layer     | A module boundary, a team agreement, and a model — not a method signature    |
| Chain          | Workflow engine           | Persistence, retries per step, visibility, human tasks                       |
| Singleton      | Leader election           | Consensus, leases, fencing, split-brain behaviour                            |

The pattern in every row is a legitimate way to _implement part of_ the architectural thing. The
error is treating them as the same decision, because the pattern's cost is a class and the
architecture's cost is an operational commitment.

## Two worked distinctions

**Proxy and API gateway.** A remote proxy is a client-side class implementing the service's
interface. A gateway is a deployed process every request passes through. The proxy's failure is
that a caller writes a loop; the gateway's failure is that everything behind it is unreachable.
Calling the gateway "our proxy layer" in a design discussion loses the second consequence, which is
the one that appears in the incident review.

**Observer and event-driven architecture.** An in-process observer is a method call to registered
listeners. An event-driven architecture is a system-wide commitment: events are contracts with
schemas and owners, consumers are independently deployed and independently broken, replay is
possible and therefore consumers must be idempotent, and "who reacts to this" is discoverable only
through a registry. Moving one listener to a broker does not create the architecture; adopting the
architecture is a set of decisions about governance, and the listener is one line of it
(`event-driven-architecture`).

## How patterns legitimately participate in architectures

Composition across levels is normal and worth naming, because it stops the levels being conflated
in the other direction — refusing a pattern because "we do hexagonal architecture".

```text
Hexagonal / ports and adapters
    a port is an interface; each adapter is Adapter
    the application service at the boundary is Facade
    the domain inside uses whatever patterns it needs

CQRS
    a command is Command; its handler is a use case
    a projection is built by a fold — Visitor's modern form
    read and write models may use different data-source patterns

Event sourcing
    each event is a value; the aggregate's replay is a fold
    a snapshot is Memento's durable relative
    the state machine that validates a command is State

Saga / process manager
    an orchestrator is Mediator's distributed form
    each step is Command; compensation is a separate Command
    the saga's position is State, persisted

Layered / clean architecture
    boundaries between layers are Facades or ports
    mapping between layers is Adapter
    the dependency rule is not a pattern; it is the architecture

Resilience (circuit breaker, bulkhead, retry)
    each is a Decorator around a client
    their composition order is the design (gof-decorator)
```

Two observations from this list. Adapter and Facade appear in almost every architecture, which is
why they are the lowest-risk patterns — they are the vocabulary of boundaries. And the
architectural rule itself is never a pattern: "the domain does not import the framework" is a
constraint enforced by module structure and an architecture test, not by a class
(`layering-and-boundaries`, `architecture-testing`).

## When a pattern is proposed as an architecture

```text
"We'll use a Facade for the mobile API"
    → a class, or a deployed BFF? If the second, it has a team, a
      release cycle and an outage surface. Say which.

"The Mediator will coordinate the services"
    → an in-process hub, or a deployed orchestrator with durable state?
      The second needs persistence, timeouts and compensation.

"Observer will decouple the modules"
    → in-process events decouple compile-time dependencies and couple
      runtime latency and failure. Across processes, they decouple
      both and couple schemas. Different trade, same word.

"A Singleton registry will keep the config consistent"
    → consistent within one JVM. Across replicas, config drift is a
      deployment problem, not a pattern problem.

"We'll add a Proxy so the service call is transparent"
    → transparency is the failure mode, not the feature.
```

The general form of the question: **does the proposal have an operational existence?** If it can be
paged for, it is not a design pattern, and the pattern's checklist is not the right review.

## When an architecture is proposed for an object problem

The inverse error, and it is expensive because the correction is a rewrite rather than a
refactoring:

- "We need CQRS" for a module whose reads are slow because a query is missing an index.
- "We need event sourcing" for auditability that a history table would provide.
- "We need to split this into a service" because a class has too many responsibilities — the
  boundary is a module boundary, and it should be found before it is deployed
  (`distribution-boundaries`).
- "We need a saga" for two writes to the same database, which is a transaction.

The test is the boundary: architectural patterns exist to manage a boundary that already exists or
must exist. If the problem is entirely inside one component, the answer is inside one component.
