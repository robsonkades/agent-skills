# Pattern inventory

One row per Gang-of-Four pattern. Use it to locate the owning skill, and to check that the
pattern under discussion actually addresses the problem at hand — most misuse is a pattern
solving a neighbouring problem convincingly.

## Reading the columns

- **Primary problem** — the force the pattern exists to resolve. If your problem is not this
  one, inspect the owning skill before accepting it; a short row cannot enumerate every valid use.
- **Risk** — qualitative review emphasis, not measured likelihood or severity. Actual risk depends
  on authority, resource ownership, compatibility and effects; any pattern can cause an incident.
- **Boundary class** — the main design concern, not a runtime guarantee. Local object contracts
  do not establish delivery or failure semantics across a process; see gof-patterns-and-distribution.

## Creational

| Pattern              | Primary problem                                                                          | Risk   | Boundary class | Skill                  |
| -------------------- | ---------------------------------------------------------------------------------------- | ------ | -------------- | ---------------------- |
| **Abstract Factory** | Keeping a _family_ of related objects mutually consistent when the family varies         | Medium | Local          | `gof-abstract-factory` |
| **Builder**          | Separating staged construction from representation; also ergonomic value construction    | Medium | Local          | `gof-builder`          |
| **Factory Method**   | Letting a subtype or provider decide which concrete type a fixed algorithm uses          | Medium | Local          | `gof-factory-method`   |
| **Prototype**        | Producing a new object from an existing instance's state rather than from a spec         | High   | Local          | `gof-prototype`        |
| **Singleton**        | One instance and access point within an explicit scope (often per defining class loader) | High   | Process-local  | `gof-singleton`        |

## Structural

| Pattern       | Primary problem                                                                             | Risk   | Boundary class | Skill           |
| ------------- | ------------------------------------------------------------------------------------------- | ------ | -------------- | --------------- |
| **Adapter**   | Making an existing type usable through an interface it was not written for                  | Lower  | Boundary       | `gof-adapter`   |
| **Bridge**    | Letting an abstraction and its implementation vary independently instead of multiplying     | Medium | Boundary       | `gof-bridge`    |
| **Composite** | Treating an individual and a composition of individuals through one interface               | Medium | Local          | `gof-composite` |
| **Decorator** | Adding stackable responsibilities while preserving the client interface                     | Medium | Boundary       | `gof-decorator` |
| **Facade**    | Giving a subsystem one coherent entry point so callers do not depend on its parts           | Lower  | Boundary       | `gof-facade`    |
| **Flyweight** | Sharing intrinsic state across occurrences while keeping extrinsic state separate           | High   | Process-local  | `gof-flyweight` |
| **Proxy**     | Controlling access to an object — lazily, remotely, protectively — behind its own interface | High   | Boundary       | `gof-proxy`     |

## Behavioural

| Pattern                     | Primary problem                                                                         | Risk   | Boundary class | Skill                         |
| --------------------------- | --------------------------------------------------------------------------------------- | ------ | -------------- | ----------------------------- |
| **Chain of Responsibility** | Letting an unknown number of handlers each decide whether to handle or pass on          | Medium | Interaction    | `gof-chain-of-responsibility` |
| **Command**                 | Turning an invocation into an object so it can be queued, logged, retried or undone     | Medium | Interaction    | `gof-command`                 |
| **Interpreter**             | Evaluating sentences of a small language by representing its grammar as a type per rule | Medium | Local          | `gof-interpreter`             |
| **Iterator**                | Traversing an aggregate without exposing its representation                             | Lower  | Process-local  | `gof-iterator`                |
| **Mediator**                | Replacing many-to-many collaboration with a hub that owns the interaction protocol      | High   | Interaction    | `gof-mediator`                |
| **Memento**                 | Capturing and restoring an object's state without breaking its encapsulation            | Medium | Process-local  | `gof-memento`                 |
| **Observer**                | Notifying an unknown set of dependents that a subject changed                           | High   | Interaction    | `gof-observer`                |
| **State**                   | Letting an object's behaviour change with its state, with transitions made explicit     | Medium | Algorithm      | `gof-state`                   |
| **Strategy**                | Selecting among interchangeable algorithms for one operation at runtime                 | Lower  | Algorithm      | `gof-strategy`                |
| **Template Method**         | Fixing an algorithm's skeleton while letting named steps vary                           | Medium | Algorithm      | `gof-template-method`         |
| **Visitor**                 | Adding operations over a stable set of element types without editing them               | Medium | Algorithm      | `gof-visitor`                 |

## Risk classes, and what makes each risky

The labels are review heuristics, not an empirical misuse ranking or the pattern's worth.

**Lower risk** — local, reversible structural moves. Adapter, Facade, Strategy and Iterator each
can have a small local footprint. Verify ownership and semantics: an adapter can corrupt units,
a facade can misplace a transaction, and a resource-owning iterator can leak a connection.

**Medium risk** — patterns that introduce structure other code must then live with: a hierarchy
(Template Method, Bridge, Abstract Factory), a recursive shape (Composite, Interpreter), a
stackable pipeline (Decorator, Chain of Responsibility), or a second representation of state
(Memento, Command, State, Visitor, Builder). Check recursive bounds, side effects and compatibility;
these are not exempt from incident risk.

**High risk** — patterns whose semantics break silently in the environment they are usually used
in:

- **Singleton** — uniqueness is often per defining class loader or container, not necessarily one
  instance per JVM or system. Class initialization safely publishes a holder, but does not make
  mutable state thread-safe or remove lifecycle/test coupling.
- **Observer** — thread, ordering, error and deregistration guarantees belong to the concrete API.
  A long-lived subject may retain abandoned listeners. Distributed pub/sub adds delivery and
  failure obligations that cannot be inferred from local callbacks.
- **Mediator** — the hub accumulates every rule that touches two collaborators and becomes a god
  object with a respectable name.
- **Proxy** — a remote proxy makes a network call look like a method call, hiding latency,
  partial failure and retry semantics behind assignment-like syntax.
- **Flyweight** — a shared mutable cache under contention, sold as a memory optimisation, that
  is rarely measured against the allocator it is meant to beat.
- **Prototype** — Object.clone performs shallow field copying; Cloneable supplies no public clone
  method. Define graph aliasing, identity and resource ownership, whether using clone, a copy
  constructor or a factory.

## Boundary classes

```text
Process-local    inspect actual class-loader, container and object ownership scopes
                 Singleton, Iterator, Flyweight, Memento

Boundary         the pattern exists to manage an interface seam
                 Adapter, Facade, Proxy, Bridge, Decorator

Interaction      the pattern shapes who talks to whom
                 Command, Observer, Mediator, Chain of Responsibility

Algorithm        the pattern shapes behaviour selection inside a component
                 Strategy, State, Template Method, Visitor
```

Local construction or object representation within an application

Creational patterns mostly use Local because they govern construction inside one process;
what crosses a boundary is the object's _representation_, which is a serialisation concern, not
a creational one.

Primary contract: [Object.clone in Java 17](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#clone()>).
Use each owning skill for the concrete lifecycle, concurrency and failure contract.
