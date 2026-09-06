---
name: gof-pattern-confusion
description: >
  Telling apart the patterns that look alike, so a design is not chosen because a name sounded
  right. Covers the four wrappers (Adapter, Decorator, Proxy, Facade) and the two questions that
  separate them, Strategy against State against Template Method against Command, Observer against
  Mediator, the three creational lookalikes plus the static factory that is not Factory Method,
  Composite against Decorator, Visitor against Iterator, Command against Event, and Memento against
  snapshot against event sourcing. Use when two patterns both seem to fit, when a review comment
  disputes what a class is, when a wrapper's kind must be named, when a class is described with a
  pattern name that does not match what it does, or when documenting an existing design. Does not
  cover getting from a problem to a shortlist (gof-pattern-selection), the reasoning discipline
  (gof-pattern-thinking), any individual pattern's own guidance (the gof-* skills), or misuse
  catalogues (gof-pattern-antipatterns).
---

# Pattern Confusion

## Purpose

Stop a design being selected by name similarity. Most of the twenty-three patterns have at least
one neighbour with the same structure and a different intent, and the difference is always
behavioural — who knows whom, who decides, what the caller believes it is holding.

Naming is useful when it communicates a contract: a protection proxy calls for a bypass review,
while a mediator calls for inspection of participant coordination rules. The label alone proves
neither exclusive reachability nor future growth.

## The two questions that separate the four wrappers

Treat these as shortlist heuristics, not mutually exclusive type tests. Inspect callers,
delegation, transitions, failure paths and ownership; one class can serve multiple roles.
Examples are partial Java 17 sketches with domain types/imports/wiring omitted. Inspect the
project release and actual framework APIs; classification does not authorize dependency upgrades.

```text
Q1: Is the wrapper's interface the SAME as the wrapped object's?

    same        → Decorator or Proxy
    different   → Adapter or Facade

Q2 (conforming interface): what responsibility changes?

    adds orthogonal behaviour and composition/order matters → Decorator
    controls access, lifecycle, location or reachability     → Proxy

Q2 (different/coarser interface): what boundary is translated?

    an incompatible collaborator API                         → Adapter
    a subsystem's complexity and workflow                    → Facade
```

| Pattern       | Interface      | Behind it                                 | Caller believes         | Tell                                  |
| ------------- | -------------- | ----------------------------------------- | ----------------------- | ------------------------------------- |
| **Adapter**   | Target API     | One or more adaptees                      | It is using your API    | Incompatible/foreign types stop at it |
| **Facade**    | Simplified API | A subsystem, possibly one complex service | It is using a subsystem | Complexity/workflow is hidden         |
| **Decorator** | Same           | One, same type                            | It has the thing        | Two could be stacked, in an order     |
| **Proxy**     | Same           | One, same type                            | It **has** the thing    | It controls whether you reach it      |

## Behavioural lookalikes, in one line each

```text
Strategy vs State
    Interchangeable policy → Strategy. Lifecycle-dependent behavior and
    valid transitions → State. Who assigns the field is only a clue.

Strategy vs Template Method
    Behavior supplied through composition → Strategy. Inherited skeleton
    invoking overridable steps → Template Method. They can coexist.

Strategy vs Command
    A way of doing something, passed in → Strategy.
    A request to do something, represented as an object → Command;
    storing or queueing it is optional.

Command vs Event
    Requests an action/decision → Command. Reports an established fact → Event.
    Naming and subscriber count are clues; consumer failure does not undo a fact.

Observer vs Mediator
    The subject does not care who reacts → Observer.
    The hub decides what happens next → Mediator.

Facade vs Mediator
    Simplifies subsystem access → Facade. Governs participant interactions
    → Mediator. Callbacks alone prove neither.

Mediator vs command dispatcher
    Is there a protocol between participants? If not, it is dispatch.

Chain of Responsibility vs Decorator
    Handler continuation/selection protocol → Chain (first-match or processing chain).
    Adds behavior through component wrapping → Decorator; may short-circuit too.

Composite vs Decorator
    Both conform to a component interface. Composite models part/whole
    and delegates to children; Decorator wraps one component to add behaviour.

Visitor vs Iterator
    Iterator supplies the elements; Visitor supplies the operation.
    A Visitor usually needs a traversal; an Iterator needs no operation.

Bridge vs Strategy
    Independent abstraction/implementation evolution → Bridge.
    Interchangeable behavior → Strategy. Current class count is not decisive.

Factory Method vs Abstract Factory vs Builder
    One product, chosen by a subtype → Factory Method.
    A family that must match → Abstract Factory.
    Staged construction → Builder; many parameters alone are insufficient.

Factory Method vs static factory method
    A subclass hook inside an inherited algorithm → the GoF pattern.
    A named constructor on the type → Effective Java's Item 1. Not it.

Singleton vs Flyweight
    One instance because uniqueness matters → Singleton.
    Shared instances because memory matters → Flyweight.

Memento vs snapshot vs event sourcing
    Opaque restoration capture, transient or durable → Memento.
    State capture; durable use adds schema/recovery contracts → snapshot.
    Authoritative events replayed into state → event sourcing; only recorded reasons survive.

Proxy vs a remote client
    A remote client may be a Proxy. Either label must expose relevant
    deadlines, partial/unknown failures and batch semantics.
```

## Decision rules

```text
IF two candidates both fit
THEN identify each responsibility and its observed contract. Keep a composed
     classification when justified; missing intent/call-site evidence is not proof.

IF a wrapper's interface differs from the wrapped type's
THEN inspect which client-facing contract it preserves or translates;
     classify adapter/facade duties separately from access or behavior duties.

IF the class is invoked by its own collaborators
THEN inspect whether it owns their interaction protocol; a callback alone
     does not make it a Mediator.

IF a "Strategy" is reassigned by the object that holds it
THEN inspect lifecycle invariants and transitions before calling it State;
     adaptive policy selection can still be Strategy.

IF an "event" can be rejected, or has exactly one handler that owes
an answer
THEN distinguish rejecting a requested action from failing to process an
     established fact. Handler count and delivery acknowledgments do not decide.

IF a "Factory Method" is static and lives on the product type
THEN judge it as a named constructor, not by this pattern's criteria.

IF a name is disputed in review and both parties agree on the
behaviour
THEN write the behaviour in the class Javadoc and move on. The name
     matters only where it changes what a reader expects.
```

## References

For a classification review, return the observed behavior/call sites, proposed role(s), practical
contract consequence and any unresolved evidence. Do not refactor working code just to fit a name.

- [The four wrappers](references/wrappers.md) — Adapter, Decorator, Proxy and Facade separated in
  full: the same code shape written four ways with what differs, the ownership and reachability
  questions, the composed cases (a decorator over a proxy over an adapter) and how to describe
  them, and how to classify an existing wrapper in three questions. Read when naming or reviewing
  a wrapper.
- [Behavioural lookalikes](references/behavioural-lookalikes.md) — Strategy/State/Template
  Method/Command, Observer/Mediator, Chain/Decorator, Composite/Decorator, Visitor/Iterator,
  Command/Event, and Memento/snapshot/event sourcing, each with the discriminating question, a
  worked misclassification and the concrete cost of getting it wrong. Read when a behavioural
  pattern's name is disputed.
