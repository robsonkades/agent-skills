# Pattern inventory

One row per Gang-of-Four pattern. Use it to locate the owning skill, and to check that the
pattern under discussion actually addresses the problem at hand — most misuse is a pattern
solving a neighbouring problem convincingly.

## Reading the columns

- **Primary problem** — the force the pattern exists to resolve. If your problem is not this
  one, the pattern is the wrong tool however well the name fits.
- **Risk** — likelihood of misuse in modern Java, not difficulty. High-risk patterns are
  frequently reached for when a lower rung of the ladder would do, or carry semantics that break
  silently in the environments they are used in.
- **Boundary class** — where the pattern's guarantees hold. `Local` guarantees evaporate across
  a process; see `gof-patterns-and-distribution`.

## Creational

| Pattern              | Primary problem                                                                  | Risk   | Boundary class | Skill                  |
| -------------------- | -------------------------------------------------------------------------------- | ------ | -------------- | ---------------------- |
| **Abstract Factory** | Keeping a _family_ of related objects mutually consistent when the family varies | Medium | Local          | `gof-abstract-factory` |
| **Builder**          | Constructing an object whose parameters are many, optional or order-constrained  | Medium | Local          | `gof-builder`          |
| **Factory Method**   | Letting a subtype or provider decide which concrete type a fixed algorithm uses  | Medium | Local          | `gof-factory-method`   |
| **Prototype**        | Producing a new object from an existing instance's state rather than from a spec | High   | Local          | `gof-prototype`        |
| **Singleton**        | Guaranteeing one instance and a global access point to it                        | High   | Process-local  | `gof-singleton`        |

## Structural

| Pattern       | Primary problem                                                                             | Risk   | Boundary class | Skill           |
| ------------- | ------------------------------------------------------------------------------------------- | ------ | -------------- | --------------- |
| **Adapter**   | Making an existing type usable through an interface it was not written for                  | Lower  | Boundary       | `gof-adapter`   |
| **Bridge**    | Letting an abstraction and its implementation vary independently instead of multiplying     | Medium | Boundary       | `gof-bridge`    |
| **Composite** | Treating an individual and a composition of individuals through one interface               | Medium | Local          | `gof-composite` |
| **Decorator** | Adding responsibilities to one object, stackably, at runtime, without changing its type     | Medium | Boundary       | `gof-decorator` |
| **Facade**    | Giving a subsystem one coherent entry point so callers do not depend on its parts           | Lower  | Boundary       | `gof-facade`    |
| **Flyweight** | Sharing one immutable instance across many logical occurrences to bound memory              | High   | Process-local  | `gof-flyweight` |
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

The classification is a heuristic about frequency of misuse, not about the pattern's worth.

**Lower risk** — local, reversible structural moves. Adapter, Facade, Strategy and Iterator each
add one indirection with an obvious owner; a wrong call is cheap to undo. Their failure mode is
proliferation, not damage.

**Medium risk** — patterns that introduce structure other code must then live with: a hierarchy
(Template Method, Bridge, Abstract Factory), a recursive shape (Composite, Interpreter), a
stackable pipeline (Decorator, Chain of Responsibility), or a second representation of state
(Memento, Command, State, Visitor, Builder). Getting these wrong costs a refactor, not an
incident.

**High risk** — patterns whose semantics break silently in the environment they are usually used
in:

- **Singleton** — process-local uniqueness is routinely mistaken for system-wide uniqueness, and
  the static holder hides initialisation order, thread safety and test coupling.
- **Observer** — synchronous by default, unordered by contract, and a listener held by a
  long-lived subject is the classic Java memory leak. It is also the pattern most often confused
  with distributed pub/sub, which shares none of its guarantees.
- **Mediator** — the hub accumulates every rule that touches two collaborators and becomes a god
  object with a respectable name.
- **Proxy** — a remote proxy makes a network call look like a method call, hiding latency,
  partial failure and retry semantics behind assignment-like syntax.
- **Flyweight** — a shared mutable cache under contention, sold as a memory optimisation, that
  is rarely measured against the allocator it is meant to beat.
- **Prototype** — `Cloneable`/`clone()` is a broken contract in Java; deep-versus-shallow copying
  of a graph with identity is a defect generator.

## Boundary classes

```text
Process-local    guarantees hold inside one JVM and nowhere else
                 Singleton, Iterator, Flyweight, Memento

Boundary         the pattern exists to manage an interface seam
                 Adapter, Facade, Proxy, Bridge, Decorator

Interaction      the pattern shapes who talks to whom
                 Command, Observer, Mediator, Chain of Responsibility

Algorithm        the pattern shapes behaviour selection inside a component
                 Strategy, State, Template Method, Visitor
```

Creational patterns are classified `Local` because they govern construction inside one process;
what crosses a boundary is the object's _representation_, which is a serialisation concern, not
a creational one.
